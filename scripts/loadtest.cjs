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
const FACES = process.env.FACES === undefined ? 8 : Number(process.env.FACES); // 얼굴 카드 인물 수 (0이면 건너뜀)
const fakeJpeg = n => "data:image/jpeg;base64," + Buffer.concat([Buffer.from("ffd8ffe000104a464946", "hex"), Buffer.from("loadtest-" + n)]).toString("base64");

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

  // 얼굴 카드: 대표 폰이 기억으로 카드를 고르고, 모든 폰이 이름을 제출
  if (FACES >= 2) {
    const names = Array.from({ length: FACES }, (_, i) => "테스트" + i);
    const ids = [];
    for (let i = 0; i < FACES; i++) {
      const r = await fetch(URL + "/api/face/photo", { method: "POST", headers: { "Content-Type": "application/json", "x-host-token": hostToken }, body: JSON.stringify({ data: fakeJpeg(i) }) });
      ids.push((await r.json()).id);
    }
    await H("face_set_people", { facePeople: names.map((name, i) => ({ name, aliases: [], photo: ids[i] })) });
    await H("start_face");
    await H("start_face_game");
    const seen = {};
    const tf = Date.now();
    let turns = 0;
    for (let guard = 0; guard < 400 && hs.phase !== "face_result"; guard++) {
      await sleep(60);
      const f = hs.face;
      if (!f || hs.phase !== "face_play") continue;
      f.board.forEach(c => { if (c.photo) seen[c.index] = c.photo; });
      if (f.stage === "mismatch" || f.stage === "name_result") { await H("face_close", { turnId: f.turnId }); continue; }
      if (f.stage === "name") {
        const person = names[ids.indexOf(f.board.find(c => c.open).photo)];
        await Promise.all(phones.map(s => call(s, "api", { action: "face_answer", room, teamToken: s.token, answer: Math.random() < 0.6 ? person : "모름", turnId: f.turnId })));
        await sleep(100);
        continue;
      }
      const cur = hs.teams.find(t => t.id === f.currentTeamId);
      const rep = reps.get(cur.table);
      const left = f.board.filter(c => !c.removed).map(c => c.index);
      const groups = {};
      for (const i of left) if (seen[i]) (groups[seen[i]] ||= []).push(i);
      const pair = Object.values(groups).find(a => a.length === 2);
      const first = pair ? pair[0] : left.find(i => !seen[i]) ?? left[0];
      const r1 = await call(rep, "api", { action: "face_pick", room, teamToken: rep.token, index: first, turnId: f.turnId });
      if (r1.status >= 400) continue;
      seen[first] = r1.body.state.face.board[first].photo;
      const second = pair ? pair[1] : left.find(i => i !== first && seen[i] === seen[first]) ?? left.find(i => i !== first && !seen[i]) ?? left.find(i => i !== first);
      const r2 = await call(rep, "api", { action: "face_pick", room, teamToken: rep.token, index: second, turnId: f.turnId });
      if (r2.body.state) seen[second] = r2.body.state.face.board[second].photo;
      turns++;
      await sleep(150);
    }
    console.log(`  얼굴 카드: ${turns}차례, ${hs.face.found}/${hs.face.pairs}쌍, ${Date.now() - tf}ms (실제 행사는 차례당 10~40초)`);
  }

  // 소수의 선택 (같은 테이블 여러 폰이 동시에 눌러도 됨)
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
