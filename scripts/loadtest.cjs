/**
 * 부하 테스트: 가상 폰 N대가 테이블별로 접속해 소수의 선택 → 룰렛까지 진행합니다.
 *   node scripts/loadtest.cjs [URL] [폰 수] [테이블 수]
 *   (기본 http://localhost:3000, 폰 120대, 테이블 14개)  운영자 비밀번호: HOST_PASSWORD 환경변수 (기본 2026)
 * ⚠ 실행하면 해당 서버에 "새 게임"이 만들어집니다. 행사 전에만 사용하세요.
 */
const { io } = require("socket.io-client");
const URL = process.argv[2] || "http://localhost:3000";
const N = Number(process.argv[3]) || 120;
const TABLES = Number(process.argv[4]) || 14;
const PASSWORD = process.env.HOST_PASSWORD || "2026";
const QUESTIONS = Number(process.env.QUESTIONS) || 3;
const SPINS = Number(process.env.SPINS) || 3;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const lat = [];
const errs = {};
let pushes = 0;
function connect() {
  return new Promise(res => { const s = io(URL, { transports: ["websocket", "polling"] }); s.on("connect", () => res(s)); });
}
async function call(s, ev, body, record = true) {
  const t0 = Date.now();
  const r = await s.timeout(15000).emitWithAck(ev, body).catch(() => ({ status: 599, body: { error: "timeout" } }));
  if (record) lat.push(Date.now() - t0);
  if (r.status >= 400 && record) errs[r.body.error] = (errs[r.body.error] || 0) + 1;
  return r;
}

(async () => {
  const host = await connect();
  const login = await call(host, "api", { action: "host_login", password: PASSWORD }, false);
  if (login.status >= 400) throw new Error("운영자 로그인 실패: " + login.body.error);
  const hostToken = login.body.hostToken;
  const created = await call(host, "api", { action: "create", hostToken }, false);
  const room = created.body.room;
  const settings = { ...created.body.state.settings, tableCount: TABLES, rouletteSpins: SPINS, minorityRounds: QUESTIONS };
  await call(host, "api", { action: "update_settings", room, hostToken, settings }, false);
  let hs = null;
  host.on("state", r => (hs = r.body.state));
  await call(host, "hello", { hostToken }, false);
  const H = (action, extra = {}) => call(host, "api", { action, room, hostToken, ...extra }, false);

  // 폰 접속: 테이블마다 여러 명 (QR 찍는 시간 분산)
  const t0 = Date.now();
  const phones = await Promise.all(Array.from({ length: N }, async (_, i) => {
    await sleep(Math.random() * 3000);
    const s = await connect();
    s.table = (i % TABLES) + 1;
    s.on("state", r => { pushes++; s.state = r.body.state; });
    await call(s, "hello", {});
    const j = await call(s, "api", { action: "join", table: s.table });
    s.token = j.body.teamToken;
    await call(s, "hello", { teamToken: s.token });
    return s;
  }));
  console.log(`입장: 폰 ${N}대 / ${TABLES}테이블, ${Date.now() - t0}ms`);
  const reps = new Map();
  for (const s of phones) if (!reps.has(s.table)) reps.set(s.table, s);

  // 1라운드: 소수의 선택 (같은 테이블 여러 폰이 동시에 눌러도 됨)
  await H("start_minority");
  await H("start_minority_game");
  for (let q = 1; q <= QUESTIONS; q++) {
    await Promise.all(phones.map(async s => {
      await sleep(Math.random() * 5000);
      await call(s, "api", { action: "minority_choose", room, teamToken: s.token, minorityRound: q, choice: Math.floor(Math.random() * 4) });
    }));
    await H("reveal_minority", { minorityRound: q });
    await sleep(500);
    console.log(`  문제 ${q}: ${JSON.stringify(hs.minorityResult)}`);
    if (q < QUESTIONS) await H("next_minority");
  }
  // 2라운드: 룰렛
  await H("start_roulette");
  await H("start_roulette_game");
  for (let spin = 1; spin <= SPINS; spin++) {
    await Promise.all(phones.map(async s => {
      await sleep(Math.random() * 4000);
      const me = s.state && s.state.teams.find(t => t.id === s.state.myTeamId);
      if (!me) return;
      if (me.chips > 0) await call(s, "api", { action: "bet", room, teamToken: s.token, color: Math.random() < 0.5 ? "red" : "black", amount: Math.max(1, Math.floor(me.chips / 2)) });
      // 칩이 0인 테이블은 자동으로 관전 처리됩니다
    }));
    // 칩 없는 테이블 처리 후 스핀
    const r = await H("spin");
    if (r.status >= 400) console.log("  스핀 실패:", r.body.error);
    await sleep(10200);
    console.log(`  스핀 ${spin}: ${hs.result}, 상태 ${hs.phase}`);
    await H("next");
  }
  await sleep(600);
  lat.sort((a, b) => a - b);
  const p = q => lat[Math.floor(lat.length * q)];
  const health = await fetch(URL + "/healthz").then(r => r.json());
  console.log(`최종 상태: ${hs.phase} / 순위: ${[...hs.teams].sort((a, b) => b.chips - a.chips).map(t => `${t.table}:${t.chips}`).join(" ")}`);
  console.log(`요청 ${lat.length}건, 응답 p50 ${p(0.5)}ms p95 ${p(0.95)}ms p99 ${p(0.99)}ms max ${lat[lat.length - 1]}ms, 상태 수신 ${pushes}건`);
  console.log("오류:", errs, "서버:", health);
  phones.forEach(s => s.close()); host.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
