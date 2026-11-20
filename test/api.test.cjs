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

// 가짜 JPEG (서버는 파일 앞부분 서명으로 이미지 여부 확인)
const fakeJpeg = n => "data:image/jpeg;base64," + Buffer.concat([Buffer.from("ffd8ffe000104a464946", "hex"), Buffer.from("photo-" + n)]).toString("base64");
const hostPost = async (url, body) => { const r = await fetch(BASE + url, { method: "POST", headers: { "Content-Type": "application/json", "x-host-token": hostToken }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };

test("얼굴 카드 → 소수의 선택 → 룰렛 정산", async () => {
  // 인물 3명 등록 (사진 업로드 → 이름/다른 표기)
  const ids = [];
  for (const n of [1, 2, 3]) { const r = await hostPost("/api/face/photo", { data: fakeJpeg(n) }); assert.strictEqual(r.status, 200); ids.push(r.body.id); }
  assert.strictEqual((await hostPost("/api/face/photo", { data: "data:image/jpeg;base64,AAAA" })).status, 400);
  const people = [{ name: "홍길동", aliases: ["Gildong"], photo: ids[0] }, { name: "김철수", aliases: [], photo: ids[1] }, { name: "이영희", aliases: [], photo: ids[2] }];
  assert.strictEqual((await H("face_set_people", { facePeople: people })).status, 200);
  const photo = await fetch(BASE + "/photos/" + ids[0]);
  assert.strictEqual(photo.headers.get("content-type"), "image/jpeg");

  const t = {};
  for (const n of [1, 2, 3, 4]) t[n] = (await post({ action: "join", table: n })).body.teamToken;
  // 같은 테이블 번호로 다시 입장하면 같은 테이블로 연결
  assert.strictEqual((await post({ action: "join", table: 1 })).body.teamToken, t[1]);
  assert.strictEqual((await post({ action: "join", table: 9 })).status, 400);
  // 참가자에게는 인물 이름/사진 목록이 가지 않음
  const lobbyView = await get({ "x-team-token": t[1] });
  assert.deepStrictEqual(lobbyView.state.settings.facePeople, []);
  assert.strictEqual(lobbyView.state.settings.facePeopleCount, 3);
  assert.deepStrictEqual(lobbyView.state.rounds, { face: 1, minority: 2, roulette: 3 });
  assert.strictEqual((await H("start_face")).status, 200);
  assert.strictEqual((await H("start_face_game")).status, 200);

  // 카드 위치를 기억하며 진행 (뒤집힌 카드의 사진 주소로 같은 사람 판단)
  const byTable = { 1: t[1], 2: t[2], 3: t[3], 4: t[4] };
  const seen = {}; // index -> photo
  const earned = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (let guard = 0; guard < 60; guard++) {
    const host = (await get({ "x-host-token": hostToken })).state;
    if (host.phase !== "face_play") break;
    const f = host.face;
    const cur = host.teams.find(x => x.id === f.currentTeamId);
    const token = byTable[cur.table];
    if (f.stage !== "select") { await H("face_close", { turnId: f.turnId }); continue; }
    // 닫힌 카드는 사진이 공개되지 않음
    assert.ok(f.board.filter(c => !c.open && !c.removed).every(c => c.photo === null));
    // 참가자·빔 화면에는 카드판에 이름이 실리지 않고, 찾은 사람 목록도 라운드가 끝나기 전엔 비어 있음
    for (const view of [await get({ "x-team-token": t[2] }), await get()]) {
      assert.ok(view.state.face.board.every(c => c.name === null));
      assert.deepStrictEqual(view.state.face.history, []);
    }
    const left = f.board.filter(c => !c.removed).map(c => c.index);
    const known = {};
    for (const i of left) if (seen[i]) (known[seen[i]] ||= []).push(i);
    const pair = Object.values(known).find(a => a.length === 2);
    const first = pair ? pair[0] : left.find(i => !seen[i]) ?? left[0];
    let r = await post({ action: "face_pick", room, teamToken: token, index: first, turnId: f.turnId });
    assert.strictEqual(r.status, 200);
    seen[first] = r.body.state.face.board[first].photo;
    const match = pair ? pair[1] : left.find(i => i !== first && seen[i] === seen[first]) ?? left.find(i => i !== first && !seen[i]) ?? left.find(i => i !== first);
    // 다른 테이블은 고를 수 없음
    const other = Object.values(byTable).find(x => x !== token);
    assert.strictEqual((await post({ action: "face_pick", room, teamToken: other, index: match, turnId: f.turnId })).status, 400);
    r = await post({ action: "face_pick", room, teamToken: token, index: match, turnId: f.turnId });
    seen[match] = r.body.state.face.board[match].photo;
    if (r.body.state.face.stage === "name") {
      earned[cur.table] += 100;
      const personPhoto = seen[first];
      const person = people.find(p => p.photo === personPhoto);
      // 1번: 다른 표기로 정답, 2번: 오답, 3·4번: 정확한 이름 → 모두 제출하면 바로 채점
      const answers = { 1: person.aliases[0] ?? person.name, 2: "모름", 3: " " + person.name + " ", 4: person.name };
      for (const n of [1, 2, 3, 4]) assert.strictEqual((await post({ action: "face_answer", room, teamToken: byTable[n], answer: answers[n], turnId: f.turnId })).status, 200);
      for (const n of [1, 3, 4]) earned[n] += 50;
      const res = (await get({ "x-host-token": hostToken })).state.face;
      assert.strictEqual(res.stage, "name_result");
      assert.strictEqual(res.result.name, person.name);
      assert.strictEqual(res.result.winners.length, 3);
    }
  }
  const faceDone = (await get({ "x-host-token": hostToken })).state;
  assert.strictEqual(faceDone.phase, "face_result");
  assert.strictEqual(faceDone.face.found, 3);
  const faceChips = Object.fromEntries(faceDone.teams.map(x => [x.table, x.chips]));
  assert.deepStrictEqual(faceChips, earned);

  await H("start_minority");
  // 얼굴 카드 칩은 유지
  assert.deepStrictEqual(Object.fromEntries((await get({ "x-host-token": hostToken })).state.teams.map(x => [x.table, x.chips])), earned);
  await H("start_minority_game");
  // A: 1,2,3번 / B: 4번 → 소수(B)만 +100
  for (const n of [1, 2, 3]) assert.strictEqual((await post({ action: "minority_choose", room, teamToken: t[n], minorityRound: 1, choice: 0 })).status, 200);
  await post({ action: "minority_choose", room, teamToken: t[4], minorityRound: 1, choice: 1 });
  const rev = await H("reveal_minority", { minorityRound: 1 });
  const chips = Object.fromEntries(rev.body.state.teams.map(x => [x.table, x.chips]));
  assert.deepStrictEqual(chips, { 1: earned[1], 2: earned[2], 3: earned[3], 4: earned[4] + 100 });
  // 마지막 문제 뒤 중간 순위 → 룰렛
  assert.strictEqual((await H("minority_summary")).status, 200);
  assert.strictEqual((await get()).state.phase, "minority_summary");
  await H("start_roulette");
  await H("start_roulette_game");
  assert.ok((await get()).state.rouletteDeadline > Date.now());
  const c4 = earned[4] + 100;
  assert.strictEqual((await post({ action: "bet", room, teamToken: t[4], color: "red", amount: c4 + 1 })).status, 400);
  assert.strictEqual((await post({ action: "bet", room, teamToken: t[4], color: "red", amount: 60 })).status, 200);
  // 칩이 있는 다른 테이블은 이번 판 건너뛰기
  for (const n of [1, 2, 3]) if (chips[n] > 0) await post({ action: "skip_bet", room, teamToken: t[n] });
  // 다른 테이블에는 베팅 색이 보이지 않음
  const other = await get({ "x-team-token": t[1] });
  assert.deepStrictEqual(other.state.teams.find(x => x.table === 4).bet, { placed: true });
  const spin = await H("spin");
  const after = spin.body.state.teams.find(x => x.table === 4).chips;
  assert.strictEqual(spin.status, 200, JSON.stringify(spin.body));
  assert.strictEqual(after, spin.body.state.result === "red" ? c4 + 60 : c4 - 60);
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

test("운영 도구: 일시정지·연장·자동 마감·칩 조정·늦은 입장", async () => {
  const created = await post({ action: "create", hostToken });
  room = created.body.room;
  const s = created.body.state.settings;
  assert.strictEqual((await H("update_settings", { settings: { ...s, tableCount: 5, minoritySeconds: 10 } })).status, 200);
  const a = (await post({ action: "join", table: 1 })).body.teamToken;
  await post({ action: "join", table: 2 });
  await H("start_minority");
  await H("start_minority_game");
  // 일시정지 중에는 선택 불가, 남은 시간 보관
  assert.strictEqual((await H("pause")).status, 200);
  let st = (await get({ "x-host-token": hostToken })).state;
  assert.ok(st.paused && st.paused.remaining > 8000 && st.minorityDeadline === null);
  assert.strictEqual((await post({ action: "minority_choose", room, teamToken: a, minorityRound: 1, choice: 0 })).status, 400);
  await H("extend"); // 일시정지 중 +15초
  assert.ok((await get({ "x-host-token": hostToken })).state.paused.remaining > 23000);
  await H("resume");
  st = (await get({ "x-host-token": hostToken })).state;
  assert.strictEqual(st.paused, null);
  assert.ok(st.minorityDeadline - Date.now() > 23000);
  assert.strictEqual((await post({ action: "minority_choose", room, teamToken: a, minorityRound: 1, choice: 0 })).status, 200);
  // 늦게 온 테이블도 게임 중 입장 가능 (0칩)
  const late = await post({ action: "join", table: 3 });
  assert.strictEqual(late.status, 200);
  assert.strictEqual(late.body.state.teams.find(t => t.table === 3).chips, 0);
  // 칩 조정
  const team1 = st.teams.find(t => t.table === 1);
  assert.strictEqual((await H("adjust_chips", { teamId: team1.id, delta: 30, reason: "테스트" })).status, 200);
  assert.strictEqual((await H("adjust_chips", { teamId: team1.id, delta: -1000 })).status, 400);
  st = (await get({ "x-host-token": hostToken })).state;
  assert.strictEqual(st.teams.find(t => t.table === 1).chips, 30);
  assert.strictEqual(st.teams.find(t => t.table === 1).adjustTotal, 30);
  assert.strictEqual(st.adjustments.length, 1);
});

test("소수의 선택: 시간이 끝나면 자동 발표", async () => {
  const created = await post({ action: "create", hostToken });
  room = created.body.room;
  await H("update_settings", { settings: { ...created.body.state.settings, minoritySeconds: 10 } });
  await post({ action: "join", table: 1 });
  await H("start_minority");
  await H("start_minority_game");
  await new Promise(r => setTimeout(r, 10_600));
  assert.strictEqual((await get()).state.phase, "minority_result");
});

test("비밀번호 5회 실패 시 잠금", async () => {
  for (let i = 0; i < 5; i++) await post({ action: "host_login", password: "nope" + i });
  assert.strictEqual((await post({ action: "host_login", password: "pw1234" })).status, 429);
});
