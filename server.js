'use strict';
/**
 * 마카오 룰렛 서버
 *  - 단일 프로세스 / 메모리 상태 (100명 규모에 충분, DB 불필요)
 *  - Socket.IO(WebSocket, 실패 시 롱폴링 자동 전환)로 실시간 동기화
 *  - 상태 브로드캐스트는 묶어서(throttle) 보내 접속자가 몰려도 서버/폰이 버팀
 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const { Game, GameError, EVENTS } = require('./src/game');

const PORT = Number(process.env.PORT) || 3000;
const HOST_PIN = String(process.env.HOST_PIN || '2026');
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

const PUBLIC_THROTTLE_MS = 400; // 전체 상태 최소 전송 간격
const PERSONAL_FLUSH_MS = 150; // 개인 상태 묶음 전송 간격
const HOST_LIST_THROTTLE_MS = 1000;

// ---------------------------------------------------------------- 게임 상태
const game = new Game();
try {
  if (fs.existsSync(STATE_FILE)) {
    game.restore(JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')));
    console.log(`[state] 복구됨: 참가자 ${game.players.size}명, ${game.phase} R${game.round}`);
  }
} catch (e) {
  console.error('[state] 복구 실패, 새로 시작합니다:', e.message);
}

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const tmp = STATE_FILE + '.tmp';
    fs.mkdir(DATA_DIR, { recursive: true }, () => {
      fs.writeFile(tmp, JSON.stringify(game.toJSON()), (err) => {
        if (err) return console.error('[state] 저장 실패', err.message);
        fs.rename(tmp, STATE_FILE, () => {});
      });
    });
  }, 1000);
}

// ---------------------------------------------------------------- HTTP
const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');

const pub = path.join(__dirname, 'public');
const sendPage = (file) => (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(pub, file));
};
app.get('/', sendPage('index.html'));
app.get('/host', sendPage('host.html'));
app.get('/beam', sendPage('beam.html'));
app.use(express.static(pub, { maxAge: '5m', index: false }));

app.get('/healthz', (req, res) => {
  res.json({ ok: true, players: game.players.size, sockets: io.engine.clientsCount, phase: game.phase });
});

const qrCache = new Map();
app.get('/qr.svg', async (req, res) => {
  const url = PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  try {
    if (!qrCache.has(url)) {
      qrCache.set(url, await QRCode.toString(url + '/', { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }));
    }
    res.set('Content-Type', 'image/svg+xml').set('Cache-Control', 'no-cache').send(qrCache.get(url));
  } catch (e) {
    res.status(500).end();
  }
});
app.get('/join-url', (req, res) => {
  res.json({ url: (PUBLIC_URL || `${req.protocol}://${req.get('host')}`) + '/' });
});

const server = http.createServer(app);
server.keepAliveTimeout = 65000;

const io = new Server(server, {
  pingInterval: 20000,
  pingTimeout: 25000,
  maxHttpBufferSize: 10_000,
  perMessageDeflate: false, // CPU 절약 (메시지가 작음)
});

// ---------------------------------------------------------------- 접속 추적
const onlineCount = new Map(); // playerId -> 연결된 소켓 수
const onlineSet = () => new Set(onlineCount.keys());
function setOnline(id, delta) {
  const n = (onlineCount.get(id) || 0) + delta;
  if (n <= 0) onlineCount.delete(id);
  else onlineCount.set(id, n);
}

// ---------------------------------------------------------------- 브로드캐스트
let publicDirty = true;
let lastPublicAt = 0;
let hostListDirty = true;
let lastHostListAt = 0;
const personalDirty = new Set();
let allPersonalDirty = false;

function markAll() {
  publicDirty = true;
  hostListDirty = true;
  allPersonalDirty = true;
  scheduleSave();
}
function markPlayer(p, withTeam) {
  publicDirty = true;
  hostListDirty = true;
  if (withTeam) {
    for (const q of game.players.values()) if (q.team === p.team) personalDirty.add(q.id);
  } else personalDirty.add(p.id);
  scheduleSave();
}

function eventInfo() {
  const e = game.roundEvent || EVENTS.normal;
  return { key: e.key, title: e.title, desc: e.desc };
}

function baseState(online) {
  const teams = game.teamStandings(online);
  const bettors = teams.reduce((a, t) => a + t.bettors, 0);
  return {
    serverNow: Date.now(),
    phase: game.phase,
    round: game.round,
    rounds: game.config.rounds,
    endsAt: game.endsAt,
    betSeconds: game.config.betSeconds,
    event: eventInfo(),
    nextEvent: game.round < game.config.rounds ? (EVENTS[game.config.events[game.round]] || EVENTS.normal).title : null,
    luckyNumber: game.luckyNumber,
    spin: game.spin,
    lastResult: game.lastResult,
    history: game.history.slice(-15),
    roundSummary: game.roundSummary,
    teams,
    counts: { players: game.players.size, online: online.size, bettors },
  };
}

function screenState(base) {
  const ranking = game.playerRanking();
  return {
    ...base,
    dist: game.betDistribution().dist,
    top: ranking.slice(0, 10).map((r) => ({ ...r, teamName: game.teamName(r.team) })),
    config: {
      teamCount: game.config.teamCount,
      rounds: game.config.rounds,
      startChips: game.config.startChips,
      betSeconds: game.config.betSeconds,
      teamNames: game.config.teamNames,
      events: game.config.events,
    },
  };
}

function personalState(p, rankIndex, teams, tdCache) {
  const team = teams[p.team - 1];
  let td = tdCache.get(p.team);
  if (!td) tdCache.set(p.team, (td = game.betDistribution(p.team)));
  return {
    id: p.id,
    name: p.name,
    team: p.team,
    teamName: game.teamName(p.team),
    chips: p.chips,
    bets: p.bets,
    total: game.totalOf(p),
    lastNet: p.lastNet,
    rescued: p.rescued,
    rank: rankIndex.get(p.id),
    playerCount: game.players.size,
    teamRank: team ? team.rank : null,
    teamAvg: team ? team.avg : null,
    teamDist: td.dist,
    teamBettors: td.bettors,
    teamMembers: team ? team.members : 0,
  };
}

function flush() {
  const t = Date.now();
  const online = onlineSet();
  let base = null;
  let teams = null;

  if (publicDirty && t - lastPublicAt >= PUBLIC_THROTTLE_MS) {
    publicDirty = false;
    lastPublicAt = t;
    base = baseState(online);
    teams = base.teams;
    io.to('players').emit('state', base);
    io.to('screens').emit('state', screenState(base));
  }

  if (allPersonalDirty || personalDirty.size) {
    const ids = allPersonalDirty ? [...game.players.keys()] : [...personalDirty];
    allPersonalDirty = false;
    personalDirty.clear();
    teams = teams || game.teamStandings(online);
    const rankIndex = new Map(game.playerRanking().map((r) => [r.id, r.rank]));
    const tdCache = new Map();
    for (const id of ids) {
      const p = game.players.get(id);
      if (p && onlineCount.has(id)) io.to('p:' + id).emit('me', personalState(p, rankIndex, teams, tdCache));
    }
  }

  if (hostListDirty && t - lastHostListAt >= HOST_LIST_THROTTLE_MS) {
    hostListDirty = false;
    lastHostListAt = t;
    const list = [...game.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      team: p.team,
      chips: p.chips,
      total: game.totalOf(p),
      betCount: p.bets.length,
      online: onlineCount.has(p.id),
      rescued: p.rescued,
    }));
    io.to('host').emit('players', list);
  }
}
setInterval(flush, PERSONAL_FLUSH_MS);

// 타이머 (베팅 마감 / 스핀 종료)
setInterval(() => {
  if (game.tick()) markAll();
}, 200);

// ---------------------------------------------------------------- 소켓
let authWindow = { start: 0, fails: 0 };
function ok(ack, data) {
  if (typeof ack === 'function') ack({ ok: true, ...data });
}
function fail(ack, e) {
  const msg = e instanceof GameError ? e.message : '오류가 발생했습니다';
  if (!(e instanceof GameError)) console.error(e);
  if (typeof ack === 'function') ack({ ok: false, error: msg });
}

io.on('connection', (socket) => {
  // 간단한 소켓별 속도 제한 (초당 15회)
  let bucket = 15;
  const refill = setInterval(() => (bucket = 15), 1000);
  socket.use((packet, next) => {
    if (bucket-- <= 0) return next(new Error('rate'));
    next();
  });
  socket.on('error', () => {});

  let playerId = null;
  const attach = (p) => {
    if (playerId === p.id) return;
    if (playerId) setOnline(playerId, -1);
    playerId = p.id;
    socket.join(['players', 'p:' + p.id]);
    setOnline(p.id, +1);
    markPlayer(p, false);
    publicDirty = true;
  };

  socket.on('hello', (msg, ack) => {
    const p = msg && typeof msg.token === 'string' ? game.getByToken(msg.token) : null;
    if (!p) {
      socket.join('players'); // 입장 전이라도 진행 상태는 받음
      publicDirty = true;
      return ok(ack, { joined: false });
    }
    attach(p);
    ok(ack, { joined: true, id: p.id });
  });

  socket.on('join', (msg, ack) => {
    try {
      const p = game.join(msg || {});
      attach(p);
      markAll();
      ok(ack, { token: p.token, id: p.id });
    } catch (e) {
      fail(ack, e);
    }
  });

  socket.on('bet', (msg, ack) => {
    try {
      if (!playerId) throw new GameError('먼저 입장해 주세요');
      const p = game.placeBet(playerId, msg && msg.type, msg && msg.amount, msg && msg.reqId);
      markPlayer(p, true);
      ok(ack, { chips: p.chips, bets: p.bets });
    } catch (e) {
      fail(ack, e);
    }
  });

  socket.on('clear', (msg, ack) => {
    try {
      if (!playerId) throw new GameError('먼저 입장해 주세요');
      const p = game.clearBets(playerId, msg && msg.reqId);
      markPlayer(p, true);
      ok(ack, { chips: p.chips, bets: p.bets });
    } catch (e) {
      fail(ack, e);
    }
  });

  socket.on('leave', (msg, ack) => {
    // 참가자가 직접 이름/조를 다시 고를 때 (로비에서만)
    try {
      if (!playerId) return ok(ack);
      if (game.phase !== 'lobby') throw new GameError('게임이 시작된 뒤에는 운영자에게 요청해 주세요');
      setOnline(playerId, -1);
      socket.leave('p:' + playerId);
      game.removePlayer(playerId);
      playerId = null;
      markAll();
      ok(ack);
    } catch (e) {
      fail(ack, e);
    }
  });

  socket.on('screen', (msg, ack) => {
    socket.join('screens');
    publicDirty = true;
    lastPublicAt = 0;
    ok(ack);
  });

  let isHost = false;
  let pinFails = 0;
  socket.on('host:auth', (msg, ack) => {
    // PIN 무차별 대입 방지: 소켓당 5회, 서버 전체 분당 30회
    const t = Date.now();
    if (t - authWindow.start > 60000) authWindow = { start: t, fails: 0 };
    if (authWindow.fails >= 30) return fail(ack, new GameError('잠시 후 다시 시도해 주세요'));
    if (!msg || String(msg.pin) !== HOST_PIN) {
      authWindow.fails++;
      if (++pinFails >= 5) setTimeout(() => socket.disconnect(true), 100);
      return fail(ack, new GameError('PIN이 올바르지 않습니다'));
    }
    isHost = true;
    socket.join(['screens', 'host']);
    markAll();
    lastPublicAt = 0;
    lastHostListAt = 0;
    ok(ack);
  });

  socket.on('host:cmd', (msg, ack) => {
    if (!isHost) return fail(ack, new GameError('운영자 인증이 필요합니다'));
    const { cmd, args = {} } = msg || {};
    try {
      switch (cmd) {
        case 'config': game.setConfig(args); break;
        case 'start': game.startRound(); break;
        case 'extend': game.extend(args.seconds || 15); break;
        case 'lock': game.lock(); break;
        case 'spin': game.startSpin(); break;
        case 'finish': game.finish(); break;
        case 'reset': game.resetGame(); break;
        case 'wipe': game.wipe(); onlineCount.clear(); io.to('players').emit('wiped'); break;
        case 'kick': {
          const p = game.removePlayer(args.id);
          if (p) {
            io.to('p:' + p.id).emit('wiped');
            onlineCount.delete(p.id);
          }
          break;
        }
        case 'move': game.movePlayer(args.id, args.team); break;
        default: throw new GameError('알 수 없는 명령');
      }
      markAll();
      lastPublicAt = 0; // 운영자 조작은 즉시 반영
      flush();
      ok(ack);
    } catch (e) {
      fail(ack, e);
    }
  });

  socket.on('disconnect', () => {
    clearInterval(refill);
    if (playerId) {
      setOnline(playerId, -1);
      publicDirty = true;
      hostListDirty = true;
    }
  });
});

server.listen(PORT, () => {
  console.log(`마카오 룰렛 서버 실행: http://localhost:${PORT}`);
  console.log(`  참가자: /   빔: /beam   운영자: /host  (PIN: ${HOST_PIN === '2026' ? '2026 (기본값 - HOST_PIN 환경변수로 변경 권장)' : '설정됨'})`);
});

function shutdown() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(game.toJSON()));
  } catch (e) { /* ignore */ }
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
