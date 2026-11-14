'use strict';
/**
 * 마카오 룰렛 - 게임 로직 (서버 권위적, 네트워크와 분리되어 단위 테스트 가능)
 *
 * 상태 흐름: lobby → betting → locked → spinning → result → (betting ...) → final
 */
const crypto = require('crypto');

// 유러피언 룰렛 휠 순서 (시계방향)
const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
  24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

const colorOf = (n) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');

// 베팅 종류: 반환 배수(원금 포함)와 당첨 판정
const BET_TYPES = {
  red: { mult: 2, label: '빨강', win: (n) => n !== 0 && RED.has(n) },
  black: { mult: 2, label: '검정', win: (n) => n !== 0 && !RED.has(n) },
  odd: { mult: 2, label: '홀', win: (n) => n !== 0 && n % 2 === 1 },
  even: { mult: 2, label: '짝', win: (n) => n !== 0 && n % 2 === 0 },
  low: { mult: 2, label: '1-18', win: (n) => n >= 1 && n <= 18 },
  high: { mult: 2, label: '19-36', win: (n) => n >= 19 && n <= 36 },
  d1: { mult: 3, label: '1-12', win: (n) => n >= 1 && n <= 12 },
  d2: { mult: 3, label: '13-24', win: (n) => n >= 13 && n <= 24 },
  d3: { mult: 3, label: '25-36', win: (n) => n >= 25 && n <= 36 },
};
for (let i = 0; i <= 36; i++) {
  BET_TYPES['n' + i] = { mult: 36, label: String(i), win: (n) => n === i, number: i };
}

// 라운드 이벤트
const EVENTS = {
  normal: { key: 'normal', title: '일반 라운드', desc: '기본 배당' },
  lucky: { key: 'lucky', title: '🍀 럭키 넘버', desc: '공개된 럭키 넘버에 걸면 배당 50배!' },
  team: { key: 'team', title: '🤝 팀워크 라운드', desc: '우리 조 베팅 참여자 70% 이상이 맞히면 조원 전원 +200' },
  jackpot: { key: 'jackpot', title: '💰 잭팟 라운드', desc: '모든 당첨 수익 2배!' },
};

const DEFAULT_CONFIG = {
  teamCount: 9,
  teamNames: [],
  rounds: 5,
  startChips: 1000,
  betSeconds: 40,
  spinMs: 9000,
  rescueChips: 200, // 라운드 시작 시 이 값 미만이면 이 값까지 채워 줌
  maxBetsPerRound: 12,
  events: ['normal', 'team', 'lucky', 'normal', 'jackpot'],
};

const MAX_NAME = 12;
const MAX_PLAYERS = 300;

function cleanName(s) {
  return String(s || '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME);
}

function randomInt(maxExclusive) {
  return crypto.randomInt(0, maxExclusive);
}

class Game {
  constructor(config = {}, opts = {}) {
    this.now = opts.now || (() => Date.now());
    this.rng = opts.rng || randomInt;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.players = new Map(); // id -> player
    this.byToken = new Map(); // token -> id
    this.resetGame();
  }

  // ---------- 설정/초기화 ----------
  teamName(i) {
    return (this.config.teamNames[i - 1] || `${i}조`).slice(0, 12);
  }

  setConfig(patch) {
    if (this.phase !== 'lobby') throw new GameError('게임 대기 중에만 설정을 바꿀 수 있습니다');
    const c = { ...this.config };
    const int = (v, lo, hi, d) => {
      const n = Math.round(Number(v));
      return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
    };
    if (patch.teamCount !== undefined) c.teamCount = int(patch.teamCount, 2, 20, c.teamCount);
    if (patch.rounds !== undefined) c.rounds = int(patch.rounds, 1, 15, c.rounds);
    if (patch.startChips !== undefined) c.startChips = int(patch.startChips, 100, 100000, c.startChips);
    if (patch.betSeconds !== undefined) c.betSeconds = int(patch.betSeconds, 10, 180, c.betSeconds);
    if (Array.isArray(patch.teamNames)) c.teamNames = patch.teamNames.map((s) => cleanName(s)).slice(0, 20);
    if (Array.isArray(patch.events)) {
      c.events = patch.events.map((e) => (EVENTS[e] ? e : 'normal')).slice(0, 15);
    }
    this.config = c;
    // 팀 수가 줄었으면 범위를 벗어난 참가자를 마지막 조로 이동
    for (const p of this.players.values()) if (p.team > c.teamCount) p.team = c.teamCount;
    this.touch();
  }

  /** 참가자는 유지하고 칩/라운드만 초기화 */
  resetGame() {
    this.phase = 'lobby';
    this.round = 0;
    this.endsAt = null;
    this.spin = null; // {result, startedAt, duration}
    this.lastResult = null;
    this.history = []; // 결과 숫자 목록
    this.roundEvent = EVENTS.normal;
    this.luckyNumber = null;
    this.roundSummary = null;
    for (const p of this.players.values()) {
      p.chips = this.config.startChips;
      p.bets = [];
      p.lastNet = null;
      p.rescued = 0;
      p.best = 0;
    }
    this.touch();
  }

  /** 참가자까지 모두 삭제 */
  wipe() {
    this.players.clear();
    this.byToken.clear();
    this.resetGame();
  }

  touch() {
    this.version = (this.version || 0) + 1;
  }

  // ---------- 참가자 ----------
  join({ token, name, team }) {
    if (token && this.byToken.has(token)) {
      const p = this.players.get(this.byToken.get(token));
      if (p) return p; // 재접속
    }
    name = cleanName(name);
    team = Math.round(Number(team));
    if (!name) throw new GameError('이름을 입력해 주세요');
    if (!(team >= 1 && team <= this.config.teamCount)) throw new GameError('조를 선택해 주세요');
    if (this.players.size >= MAX_PLAYERS) throw new GameError('참가 인원이 가득 찼습니다');

    // 같은 조 동명이인 구분
    let finalName = name;
    let k = 2;
    const taken = (nm) => [...this.players.values()].some((q) => q.team === team && q.name === nm);
    while (taken(finalName)) finalName = `${name}${k++}`;

    const id = crypto.randomBytes(6).toString('hex');
    const newToken = crypto.randomBytes(16).toString('hex');
    const p = {
      id,
      token: newToken,
      name: finalName,
      team,
      chips: this.config.startChips,
      bets: [],
      lastNet: null,
      rescued: 0,
      best: 0,
      joinedAt: this.now(),
      seenReq: [],
    };
    this.players.set(id, p);
    this.byToken.set(newToken, id);
    this.touch();
    return p;
  }

  getByToken(token) {
    const id = this.byToken.get(token);
    return id ? this.players.get(id) : null;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return null;
    this.players.delete(id);
    this.byToken.delete(p.token);
    this.touch();
    return p;
  }

  movePlayer(id, team) {
    const p = this.players.get(id);
    team = Math.round(Number(team));
    if (!p || !(team >= 1 && team <= this.config.teamCount)) throw new GameError('잘못된 요청');
    p.team = team;
    this.touch();
    return p;
  }

  // ---------- 라운드 진행 ----------
  startRound() {
    if (!(this.phase === 'lobby' || this.phase === 'result')) throw new GameError('지금은 라운드를 시작할 수 없습니다');
    if (this.round >= this.config.rounds) throw new GameError('모든 라운드가 끝났습니다');
    this.round += 1;
    const evKey = this.config.events[this.round - 1] || (this.round === this.config.rounds ? 'jackpot' : 'normal');
    this.roundEvent = EVENTS[evKey] || EVENTS.normal;
    this.luckyNumber = this.roundEvent.key === 'lucky' ? 1 + this.rng(36) : null;
    this.phase = 'betting';
    this.endsAt = this.now() + this.config.betSeconds * 1000;
    this.spin = null;
    this.roundSummary = null;
    for (const p of this.players.values()) {
      p.bets = [];
      p.lastNet = null;
      if (p.chips < this.config.rescueChips) {
        p.rescued += this.config.rescueChips - p.chips;
        p.chips = this.config.rescueChips;
      }
    }
    this.touch();
  }

  extend(seconds = 15) {
    if (this.phase !== 'betting') throw new GameError('베팅 중이 아닙니다');
    this.endsAt = Math.max(this.endsAt, this.now()) + seconds * 1000;
    this.touch();
  }

  lock() {
    if (this.phase !== 'betting') throw new GameError('베팅 중이 아닙니다');
    this.phase = 'locked';
    this.endsAt = null;
    this.touch();
  }

  /** 타이머 체크 (주기적으로 호출). 상태가 바뀌면 true */
  tick() {
    const t = this.now();
    if (this.phase === 'betting' && this.endsAt && t >= this.endsAt) {
      this.lock();
      return true;
    }
    if (this.phase === 'spinning' && this.spin && t >= this.spin.startedAt + this.spin.duration) {
      this.settle();
      return true;
    }
    return false;
  }

  startSpin(forced) {
    if (this.phase === 'betting') this.lock();
    if (this.phase !== 'locked') throw new GameError('베팅 마감 후에 돌릴 수 있습니다');
    const result = Number.isInteger(forced) && forced >= 0 && forced <= 36 ? forced : this.rng(37);
    this.phase = 'spinning';
    this.spin = {
      result,
      startedAt: this.now(),
      duration: this.config.spinMs,
      // 휠 애니메이션용 여분 회전수 (모든 화면이 같은 연출)
      turns: 5 + this.rng(3),
    };
    this.touch();
  }

  /** 정산 (spinning → result) */
  settle() {
    if (this.phase !== 'spinning') return;
    const n = this.spin.result;
    const ev = this.roundEvent.key;
    const winners = [];
    const teamStats = new Map(); // team -> {bettors, winners}

    for (const p of this.players.values()) {
      let staked = 0;
      let returned = 0;
      for (const b of p.bets) {
        staked += b.amount;
        const t = BET_TYPES[b.type];
        if (!t.win(n)) continue;
        let mult = t.mult;
        if (ev === 'lucky' && t.number !== undefined && t.number === this.luckyNumber) mult = 50;
        let ret = b.amount * mult;
        if (ev === 'jackpot') ret = b.amount + (ret - b.amount) * 2;
        returned += ret;
      }
      p.chips += returned;
      p.lastNet = p.bets.length ? returned - staked : null;
      if (p.lastNet > p.best) p.best = p.lastNet;
      if (p.bets.length) {
        const s = teamStats.get(p.team) || { bettors: 0, winners: 0 };
        s.bettors += 1;
        if (returned > 0) s.winners += 1;
        teamStats.set(p.team, s);
      }
      if (p.lastNet > 0) winners.push({ id: p.id, name: p.name, team: p.team, net: p.lastNet });
    }

    // 팀워크 보너스
    const bonusTeams = [];
    if (ev === 'team') {
      for (const [team, s] of teamStats) {
        if (s.bettors >= 2 && s.winners / s.bettors >= 0.7) {
          bonusTeams.push(team);
          for (const p of this.players.values()) {
            if (p.team === team) {
              p.chips += 200;
              p.lastNet = (p.lastNet || 0) + 200;
            }
          }
        }
      }
    }

    winners.sort((a, b) => b.net - a.net);
    this.lastResult = { number: n, color: colorOf(n) };
    this.history.push(n);
    this.roundSummary = {
      round: this.round,
      number: n,
      color: colorOf(n),
      topWinners: winners.slice(0, 5).map((w) => ({ ...w, teamName: this.teamName(w.team) })),
      winnerCount: winners.length,
      bettorCount: [...teamStats.values()].reduce((a, s) => a + s.bettors, 0),
      bonusTeams: bonusTeams.map((t) => this.teamName(t)),
    };
    this.phase = 'result';
    this.endsAt = null;
    this.touch();
  }

  finish() {
    if (this.phase === 'betting' || this.phase === 'locked') {
      // 진행 중 베팅은 환불
      for (const p of this.players.values()) {
        for (const b of p.bets) p.chips += b.amount;
        p.bets = [];
      }
    }
    if (this.phase === 'spinning') this.settle();
    this.phase = 'final';
    this.endsAt = null;
    this.touch();
  }

  // ---------- 베팅 ----------
  placeBet(playerId, type, amount, reqId) {
    const p = this.players.get(playerId);
    if (!p) throw new GameError('참가자를 찾을 수 없습니다');
    if (reqId && p.seenReq.includes(reqId)) return p; // 중복 요청(재전송) 무시
    if (this.phase !== 'betting') throw new GameError('베팅 시간이 아닙니다');
    if (!BET_TYPES[type]) throw new GameError('잘못된 베팅');
    amount = Math.floor(Number(amount));
    if (!(amount > 0)) throw new GameError('금액이 올바르지 않습니다');
    if (amount > p.chips) amount = p.chips; // 남은 칩만큼만
    if (amount <= 0) throw new GameError('칩이 부족합니다');
    const existing = p.bets.find((b) => b.type === type);
    if (!existing && p.bets.length >= this.config.maxBetsPerRound) {
      throw new GameError(`한 라운드 최대 ${this.config.maxBetsPerRound}곳까지 걸 수 있습니다`);
    }
    if (existing) existing.amount += amount;
    else p.bets.push({ type, amount });
    p.chips -= amount;
    this.rememberReq(p, reqId);
    this.touch();
    return p;
  }

  clearBets(playerId, reqId) {
    const p = this.players.get(playerId);
    if (!p) throw new GameError('참가자를 찾을 수 없습니다');
    if (reqId && p.seenReq.includes(reqId)) return p;
    if (this.phase !== 'betting') throw new GameError('베팅 시간이 아닙니다');
    for (const b of p.bets) p.chips += b.amount;
    p.bets = [];
    this.rememberReq(p, reqId);
    this.touch();
    return p;
  }

  rememberReq(p, reqId) {
    if (!reqId) return;
    p.seenReq.push(String(reqId).slice(0, 40));
    if (p.seenReq.length > 60) p.seenReq.splice(0, p.seenReq.length - 60);
  }

  // ---------- 조회 ----------
  /** 보유 칩 + (아직 정산 전인) 걸어 둔 칩 */
  totalOf(p) {
    const open = this.phase === 'betting' || this.phase === 'locked' || this.phase === 'spinning';
    return p.chips + (open ? p.bets.reduce((a, b) => a + b.amount, 0) : 0);
  }

  teamStandings(onlineSet) {
    const teams = [];
    for (let i = 1; i <= this.config.teamCount; i++) {
      teams.push({ id: i, name: this.teamName(i), members: 0, online: 0, total: 0, bettors: 0 });
    }
    for (const p of this.players.values()) {
      const t = teams[p.team - 1];
      if (!t) continue;
      t.members += 1;
      t.total += this.totalOf(p);
      if (onlineSet && onlineSet.has(p.id)) t.online += 1;
      if (p.bets.length && this.phase !== 'final') t.bettors += 1;
    }
    // 조 인원이 달라도 공정하도록 1인 평균으로 순위
    for (const t of teams) t.avg = t.members ? Math.round(t.total / t.members) : 0;
    const ranked = teams.filter((t) => t.members > 0).sort((a, b) => b.avg - a.avg || b.total - a.total);
    ranked.forEach((t, i) => (t.rank = i > 0 && ranked[i - 1].avg === t.avg ? ranked[i - 1].rank : i + 1));
    return teams;
  }

  playerRanking() {
    const list = [...this.players.values()]
      .map((p) => ({ id: p.id, name: p.name, team: p.team, total: this.totalOf(p) }))
      .sort((a, b) => b.total - a.total);
    list.forEach((r, i) => (r.rank = i > 0 && list[i - 1].total === r.total ? list[i - 1].rank : i + 1));
    return list;
  }

  // ---------- 저장/복구 (서버 재시작 대비) ----------
  toJSON() {
    return {
      config: this.config,
      phase: this.phase,
      round: this.round,
      endsAt: this.endsAt,
      spin: this.spin,
      lastResult: this.lastResult,
      history: this.history,
      roundEvent: this.roundEvent.key,
      luckyNumber: this.luckyNumber,
      roundSummary: this.roundSummary,
      players: [...this.players.values()],
    };
  }

  restore(s) {
    if (!s || !Array.isArray(s.players)) return;
    this.config = { ...DEFAULT_CONFIG, ...s.config };
    this.phase = s.phase || 'lobby';
    this.round = s.round || 0;
    this.endsAt = s.endsAt || null;
    this.spin = s.spin || null;
    this.lastResult = s.lastResult || null;
    this.history = s.history || [];
    this.roundEvent = EVENTS[s.roundEvent] || EVENTS.normal;
    this.luckyNumber = s.luckyNumber ?? null;
    this.roundSummary = s.roundSummary || null;
    this.players.clear();
    this.byToken.clear();
    for (const p of s.players) {
      p.seenReq = p.seenReq || [];
      this.players.set(p.id, p);
      this.byToken.set(p.token, p.id);
    }
    // 재시작 동안 타이머가 지났으면 tick()이 정리
    if (this.phase === 'spinning' && !this.spin) this.phase = 'locked';
    this.touch();
  }

  betDistribution(filterTeam) {
    const dist = {};
    let bettors = 0;
    for (const p of this.players.values()) {
      if (filterTeam && p.team !== filterTeam) continue;
      if (p.bets.length) bettors++;
      for (const b of p.bets) {
        const d = dist[b.type] || (dist[b.type] = { chips: 0, people: 0 });
        d.chips += b.amount;
        d.people += 1;
      }
    }
    return { dist, bettors };
  }
}

class GameError extends Error {}

module.exports = { Game, GameError, BET_TYPES, EVENTS, WHEEL_ORDER, RED, colorOf, DEFAULT_CONFIG, cleanName };
