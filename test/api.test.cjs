// 실제 서버를 띄워 게임 규칙과 운영 기능을 검증합니다: npm test (먼저 npm run build)
const test = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "macau-test-"));
let proc;
const start = () => new Promise((resolve, reject) => {
  proc = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(PORT), HOST_PIN: "", GAME_HOST_PASSWORD: "pw1234", DATA_DIR: DATA }, stdio: ["ignore", "pipe", "pipe"] });
  proc.stdout.on("data", d => { if (String(d).includes("서버 실행")) resolve(); });
  proc.on("exit", c => reject(new Error("server exited " + c)));
});
const stop = () => new Promise(r => { proc.removeAllListeners("exit"); proc.on("exit", r); proc.kill("SIGTERM"); });
const post = async body => { const r = await fetch(BASE + "/api/game", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
const get = async (headers = {}) => (await fetch(BASE + "/api/game?active=1", { headers })).json();

let hostToken, room;
const H = (action, extra = {}) => post({ action, room, hostToken, ...extra });

test.before(start);
test.after(async () => { await stop(); fs.rmSync(DATA, { recursive: true, force: true }); });

test("화면 파일과 상태 확인", async () => {
  for (const p of ["/", "/host", "/beam"]) {
    const r = await fetch(BASE + p);
    assert.strictEqual(r.status, 200);
    assert.match(await r.text(), /<div id="root">/);
  }
  assert.deepStrictEqual(await get(), { state: null });
});

test("운영자 로그인과 새 게임", async () => {
  assert.strictEqual((await post({ action: "host_login", password: "wrong" })).status, 403);
  const login = await post({ action: "host_login", password: "pw1234" });
  assert.strictEqual(login.status, 200);
  hostToken = login.body.hostToken;
  const created = await post({ action: "create", hostToken });
  room = created.body.room;
  assert.match(room, /^[A-Z2-9]{6}$/);
  const s = created.body.state.settings;
  assert.strictEqual((await H("update_settings", { settings: { ...s, tableCount: 5, minorityRounds: 1, rouletteSpins: 1 } })).status, 200);
});

test("소수의 선택 → 룰렛 정산", async () => {
  const t = {};
  for (const n of [1, 2, 3, 4]) t[n] = (await post({ action: "join", table: n })).body.teamToken;
  // 같은 테이블 번호로 다시 입장하면 같은 테이블로 연결
  assert.strictEqual((await post({ action: "join", table: 1 })).body.teamToken, t[1]);
  assert.strictEqual((await post({ action: "join", table: 9 })).status, 400);
  await H("start_minority");
  await H("start_minority_game");
  // A: 1,2,3번 / B: 4번 → 소수(B)만 +100
  for (const n of [1, 2, 3]) assert.strictEqual((await post({ action: "minority_choose", room, teamToken: t[n], minorityRound: 1, choice: 0 })).status, 200);
  await post({ action: "minority_choose", room, teamToken: t[4], minorityRound: 1, choice: 1 });
  const rev = await H("reveal_minority", { minorityRound: 1 });
  const chips = Object.fromEntries(rev.body.state.teams.map(x => [x.table, x.chips]));
  assert.deepStrictEqual(chips, { 1: 0, 2: 0, 3: 0, 4: 100 });
  await H("start_roulette");
  await H("start_roulette_game");
  assert.strictEqual((await post({ action: "bet", room, teamToken: t[4], color: "red", amount: 101 })).status, 400);
  assert.strictEqual((await post({ action: "bet", room, teamToken: t[4], color: "red", amount: 60 })).status, 200);
  // 다른 테이블에는 베팅 색이 보이지 않음
  const other = await get({ "x-team-token": t[1] });
  assert.deepStrictEqual(other.state.teams.find(x => x.table === 4).bet, { placed: true });
  const spin = await H("spin");
  const after = spin.body.state.teams.find(x => x.table === 4).chips;
  assert.strictEqual(after, spin.body.state.result === "red" ? 160 : 40);
  // 결과 연출(10초) 동안은 다음 단계로 못 넘어감
  assert.strictEqual((await H("next")).status, 400);
});

test("재시작해도 진행 상태 유지", async () => {
  const before = await get();
  await stop();
  await start();
  const after = await get();
  assert.strictEqual(after.state.room, before.state.room);
  assert.strictEqual(after.state.phase, "roulette_result");
  assert.deepStrictEqual(after.state.teams.map(x => x.chips), before.state.teams.map(x => x.chips));
});

test("비밀번호 5회 실패 시 잠금", async () => {
  for (let i = 0; i < 5; i++) await post({ action: "host_login", password: "nope" + i });
  assert.strictEqual((await post({ action: "host_login", password: "pw1234" })).status, 429);
});
