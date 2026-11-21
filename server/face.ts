/**
 * 얼굴 카드 매치 (2026 3Q Townhall 게임의 규칙을 ALL IN MACAU 칩 방식으로 옮김)
 *
 *  - 사람마다 사진 카드 2장. 테이블 번호 순서대로 차례가 돌아가며 카드 2장을 뒤집음
 *  - 같은 사람이면: 뒤집은 테이블 +faceMatchBonus칩 → 모든 테이블이 그 사람 이름 맞히기 (정답 +faceNameBonus칩)
 *  - 다른 사람이면: 잠깐 보여 준 뒤 다시 덮고 다음 테이블 차례
 *  - 제한 시간 안에 카드를 고르지 않으면 남은 카드에서 무작위로 뒤집음
 *  - 2판으로 진행: 1판 8쌍(4×4), 2판 12쌍(6×4). 인물마다 몇 판에 나올지 정해 둠 (1판 8명 + 2판 12명)
 *  - 한 판은 모든 짝을 찾거나 운영자가 "이번 차례 후 종료"를 누르면 끝 → 1판 뒤 중간 집계(face_break) → 2판
 */
import { webcrypto as crypto } from "node:crypto";

export type FacePerson = { id: string; name: string; aliases: string[]; photo: string | null; board: 1 | 2 };
/** 판 구성 (고정): 1판 8쌍 4×4, 2판 12쌍 6×4 */
export const FACE_BOARDS = [{ pairs: 8, cols: 4 }, { pairs: 12, cols: 6 }] as const;
export type FaceSettings = {
  facePeople: FacePerson[];
  faceMatchBonus: number;
  faceNameBonus: number;
  faceSelectSeconds: number;
  faceNameSeconds: number;
};
export const defaultFaceSettings: FaceSettings = { facePeople: [], faceMatchBonus: 100, faceNameBonus: 50, faceSelectSeconds: 30, faceNameSeconds: 30 };

const FACE_MISMATCH_MS = 3_000; // 틀린 카드 보여 주는 시간
const FACE_NAME_RESULT_MS = 5_000; // 이름 정답 공개 시간

type FaceTeam = { id: string; table: number; chips: number; faceChange?: number };
type FaceResult = { personId: string; name: string; attackerId: string; winners: string[]; answers: Record<string, string> };
export type FaceState = {
  stage: "select" | "mismatch" | "name" | "name_result" | "done";
  board: string[]; // 카드 위치별 인물 id (인물마다 2장)
  selected: number[];
  removed: string[];
  order: string[]; // 차례 순서 (팀 id)
  turnIndex: number;
  turnId: string;
  deadline: number | null;
  answers: Record<string, string>;
  result: FaceResult | null;
  stopAfterTurn: boolean;
  history: { personId: string; name: string; attackerId: string; winners: string[]; board: 1 | 2 }[];
  boardNo: 1 | 2; // 지금 몇 판째
};
type FaceRoom = { phase: string; teams: FaceTeam[]; settings: FaceSettings; face?: FaceState | null; paused?: { remaining: number } | null };

class FaceError extends Error { constructor(message: string, public status = 400) { super(message); } }
const fail = (message: string, status = 400): never => { throw new FaceError(message, status); };
export { FaceError };

/** 이름·사진이 다 있는 인물 (board를 주면 그 판만) */
export const readyPeople = (settings: FaceSettings, board?: 1 | 2) => (settings.facePeople || []).filter(p => p.name.trim() && p.photo && (!board || (p.board ?? 1) === board));
/** 두 판 모두 정해진 인원이 등록됐는지 */
export function faceBoardsReady(settings: FaceSettings) {
  const counts = [readyPeople(settings, 1).length, readyPeople(settings, 2).length];
  return { ok: counts[0] === FACE_BOARDS[0].pairs && counts[1] === FACE_BOARDS[1].pairs, counts };
}
const boardsMessage = (counts: number[]) => `얼굴 카드는 1판 ${FACE_BOARDS[0].pairs}명, 2판 ${FACE_BOARDS[1].pairs}명이 필요합니다. 지금 1판 ${counts[0]}명, 2판 ${counts[1]}명이 등록돼 있습니다.`;

const normalize = (s: string) => String(s || "").normalize("NFKC").toLowerCase().replace(/[\s.·\-_]/g, "");
const nameMatches = (answer: string, person: FacePerson) => [person.name, ...(person.aliases || [])].some(n => n && normalize(n) === normalize(answer));

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const uuid = () => crypto.randomUUID();
const currentTeam = (room: FaceRoom) => {
  const f = room.face!;
  return room.teams.find(t => t.id === f.order[f.turnIndex]);
};
function award(room: FaceRoom, teamId: string, amount: number) {
  const team = room.teams.find(t => t.id === teamId);
  if (!team || amount <= 0) return;
  team.chips += amount;
  team.faceChange = (team.faceChange ?? 0) + amount;
}

function startTurn(room: FaceRoom, now: number) {
  const f = room.face!;
  f.stage = "select";
  f.selected = [];
  f.answers = {};
  f.result = null;
  f.turnId = uuid();
  f.deadline = now + room.settings.faceSelectSeconds * 1000;
}

/** 다음 차례 (나간 테이블은 건너뜀). 끝났으면 결과 화면으로 */
function nextTurn(room: FaceRoom, now: number) {
  const f = room.face!;
  if (f.stopAfterTurn || f.removed.length * 2 >= f.board.length) return finishFace(room);
  f.order = f.order.filter(id => room.teams.some(t => t.id === id));
  if (!f.order.length) return finishFace(room);
  f.turnIndex = (f.turnIndex + 1) % f.order.length;
  startTurn(room, now);
}

/** 한 판이 끝남: 1판이면 중간 집계, 2판이면 결과 */
function finishFace(room: FaceRoom) {
  const f = room.face!;
  f.stage = "done";
  f.deadline = null;
  f.selected = [];
  f.stopAfterTurn = false;
  room.phase = f.boardNo === 1 ? "face_break" : "face_result";
}
function dealBoard(room: FaceRoom, board: 1 | 2) {
  const people = readyPeople(room.settings, board);
  const f = room.face!;
  f.boardNo = board;
  f.board = shuffle(people.flatMap(p => [p.id, p.id]));
  f.selected = [];
  f.removed = [];
  f.stopAfterTurn = false;
}

function judge(room: FaceRoom, now: number) {
  const f = room.face!;
  const [a, b] = f.selected;
  if (f.board[a] === f.board[b]) {
    award(room, f.order[f.turnIndex], room.settings.faceMatchBonus);
    f.stage = "name";
    f.answers = {};
    f.deadline = now + room.settings.faceNameSeconds * 1000;
  } else {
    f.stage = "mismatch";
    f.deadline = now + FACE_MISMATCH_MS;
  }
}

function autoPick(room: FaceRoom, now: number) {
  const f = room.face!;
  const open = f.board.map((_, i) => i).filter(i => !f.removed.includes(f.board[i]) && !f.selected.includes(i));
  while (f.selected.length < 2 && open.length) f.selected.push(open.splice(crypto.getRandomValues(new Uint32Array(1))[0] % open.length, 1)[0]);
  judge(room, now);
}

function gradeName(room: FaceRoom, now: number) {
  const f = room.face!;
  const personId = f.board[f.selected[0]];
  const person = room.settings.facePeople.find(p => p.id === personId)!;
  const winners = Object.entries(f.answers).filter(([, answer]) => nameMatches(answer, person)).map(([teamId]) => teamId);
  for (const teamId of winners) award(room, teamId, room.settings.faceNameBonus);
  f.removed.push(personId);
  f.result = { personId, name: person.name, attackerId: f.order[f.turnIndex], winners, answers: { ...f.answers } };
  f.history.push({ personId, name: person.name, attackerId: f.result.attackerId, winners, board: f.boardNo });
  f.stage = "name_result";
  f.deadline = now + FACE_NAME_RESULT_MS;
}

/** 시간 경과에 따른 자동 진행. 바뀌었으면 true */
export function reconcileFace(room: FaceRoom, now = Date.now()): boolean {
  const f = room.face;
  if (room.phase !== "face_play" || !f || !f.deadline || now < f.deadline) return false;
  if (f.stage === "select") autoPick(room, now);
  else if (f.stage === "mismatch" || f.stage === "name_result") nextTurn(room, now);
  else if (f.stage === "name") gradeName(room, now);
  else return false;
  return true;
}

// ------------------------------------------------------------------ 운영자 동작
export function startFaceTutorial(room: FaceRoom) {
  if (room.phase !== "lobby") fail("대기실에서만 시작할 수 있습니다.");
  if (!room.teams.length) fail("참여한 테이블이 없습니다.");
  const ready = faceBoardsReady(room.settings);
  if (!ready.ok) fail(boardsMessage(ready.counts));
  for (const team of room.teams) { team.chips = 0; team.faceChange = 0; }
  room.face = null;
  room.phase = "face_tutorial";
}

export function startFaceGame(room: FaceRoom, now = Date.now()) {
  if (room.phase !== "face_tutorial") fail("얼굴 카드 안내 화면에서 시작해 주세요.");
  if (!room.teams.length) fail("참여한 테이블이 없습니다.");
  const ready = faceBoardsReady(room.settings);
  if (!ready.ok) fail(boardsMessage(ready.counts));
  room.face = {
    stage: "select", board: [], selected: [], removed: [], boardNo: 1,
    order: [...room.teams].sort((a, b) => a.table - b.table).map(t => t.id), turnIndex: 0, turnId: "",
    deadline: null, answers: {}, result: null, stopAfterTurn: false, history: [],
  };
  dealBoard(room, 1);
  room.phase = "face_play";
  startTurn(room, now);
}

/** 중간 집계 → 2판 시작. 1판 마지막 차례의 다음 테이블부터 이어서 */
export function startFaceBoard2(room: FaceRoom, now = Date.now()) {
  const f = room.face;
  if (room.phase !== "face_break" || !f) fail("1판이 끝난 뒤 2판을 시작할 수 있습니다.");
  f!.order = f!.order.filter(id => room.teams.some(t => t.id === id));
  if (!f!.order.length) fail("참여한 테이블이 없습니다.");
  dealBoard(room, 2);
  f!.turnIndex = (f!.turnIndex + 1) % f!.order.length;
  room.phase = "face_play";
  startTurn(room, now);
}

/** 중간 집계에서 2판 없이 얼굴 카드 끝내기 */
export function finishFaceEarly(room: FaceRoom) {
  if (room.phase !== "face_break") fail("1판 중간 집계 화면에서만 끝낼 수 있습니다.");
  room.phase = "face_result";
}

/** 운영자: 현재 단계를 바로 마감 (카드 선택 → 무작위, 이름 → 채점, 공개 화면 → 다음 차례) */
export function closeFaceStage(room: FaceRoom, turnId: unknown, now = Date.now()) {
  const f = room.face;
  if (room.phase !== "face_play" || !f) fail("얼굴 카드 진행 중이 아닙니다.");
  if (turnId !== undefined && turnId !== f!.turnId) fail("이미 다음 차례로 넘어갔습니다. 화면을 확인해 주세요.", 409);
  f!.deadline = now;
  reconcileFace(room, now);
}

export function stopFaceAfterTurn(room: FaceRoom) {
  if (room.phase !== "face_play" || !room.face) fail("얼굴 카드 진행 중이 아닙니다.");
  room.face!.stopAfterTurn = !room.face!.stopAfterTurn;
}

// ------------------------------------------------------------------ 참가자 동작
export function facePick(room: FaceRoom, teamId: string, index: unknown, turnId: unknown, now = Date.now()) {
  const f = room.face;
  if (room.phase !== "face_play" || !f || f.stage !== "select") fail("지금은 카드를 고를 수 없습니다.");
  if (room.paused) fail("진행자가 잠시 멈췄어요. 잠시만 기다려 주세요.");
  if (turnId !== f!.turnId) fail("이미 다음 차례로 넘어갔습니다.", 409);
  if (currentTeam(room)?.id !== teamId) fail("지금은 다른 테이블 차례입니다.");
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= f!.board.length || f!.selected.includes(i) || f!.removed.includes(f!.board[i])) fail("고를 수 없는 카드입니다.");
  f!.selected.push(i);
  if (f!.selected.length === 2) judge(room, now);
}

export function faceAnswer(room: FaceRoom, teamId: string, answer: unknown, turnId: unknown, now = Date.now()) {
  const f = room.face;
  if (f && f.stage === "name_result" && turnId === f.turnId) fail("모든 테이블이 제출해서 이미 채점이 끝났습니다.", 409);
  if (room.phase !== "face_play" || !f || f.stage !== "name") fail("지금은 이름을 제출할 수 없습니다.");
  if (room.paused) fail("진행자가 잠시 멈췄어요. 잠시만 기다려 주세요.");
  if (turnId !== f!.turnId) fail("이미 다음 차례로 넘어갔습니다.", 409);
  if (typeof answer !== "string" || !answer.trim() || answer.length > 40) fail("이름을 40자 이내로 입력해 주세요.");
  f!.answers[teamId] = (answer as string).trim();
  // 모든 테이블이 제출하면 바로 채점 (기다리는 시간 단축)
  if (room.teams.every(t => f!.answers[t.id] !== undefined)) gradeName(room, now);
}

// ------------------------------------------------------------------ 화면용 데이터
export function facePublic(room: FaceRoom, myTeamId: string | null, isHost: boolean) {
  const f = room.face;
  const people = room.settings.facePeople || [];
  const photoOf = (id: string) => people.find(p => p.id === id)?.photo ?? null;
  const nameOf = (id: string) => people.find(p => p.id === id)?.name ?? "";
  if (!f) return null;
  return {
    stage: f.stage,
    boardNo: f.boardNo ?? 1,
    boards: FACE_BOARDS.length,
    cols: FACE_BOARDS[(f.boardNo ?? 1) - 1].cols,
    turnId: f.turnId,
    deadline: f.deadline,
    currentTeamId: f.stage === "done" ? null : f.order[f.turnIndex] ?? null,
    nextTeamId: f.stage === "done" || !f.order.length ? null : f.order[(f.turnIndex + 1) % f.order.length],
    order: f.order,
    pairs: f.board.length / 2,
    found: f.removed.length,
    stopAfterTurn: f.stopAfterTurn,
    // 카드: 뒤집힌 카드와 이미 찾은 카드만 사진 공개. 카드판에는 이름을 싣지 않음 (운영자만 확인용)
    board: f.board.map((id, index) => {
      const removed = f.removed.includes(id);
      const open = f.selected.includes(index);
      return { index, open, removed, photo: open || removed ? photoOf(id) : null, name: isHost && removed ? nameOf(id) : null };
    }),
    submitted: Object.keys(f.answers),
    myAnswer: myTeamId ? f.answers[myTeamId] ?? null : null,
    // 운영자는 진행 중에도 정답과 제출 답안을 볼 수 있음
    hostAnswer: isHost && f.stage === "name" ? nameOf(f.board[f.selected[0]]) : null,
    hostAnswers: isHost ? f.answers : null,
    result: f.result ? { ...f.result, answers: isHost ? f.result.answers : (myTeamId && f.result.answers[myTeamId] !== undefined ? { [myTeamId]: f.result.answers[myTeamId] } : {}) } : null,
    // 찾은 사람 목록(이름 포함)은 라운드가 끝난 뒤에만 공개
    history: isHost || f.stage === "done" ? f.history.map(h => ({ ...h, board: h.board ?? 1, photo: photoOf(h.personId) })) : [],
  };
}

// ------------------------------------------------------------------ 설정 검증
export function validateFacePeople(value: unknown, photoExists: (id: string) => boolean): FacePerson[] {
  if (!Array.isArray(value) || value.length > 40) fail("얼굴 카드 인물은 최대 40명까지 등록할 수 있습니다.");
  const seen = new Set<string>();
  return (value as unknown[]).map((raw, index) => {
    const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (name.length > 30) fail(`${index + 1}번째 인물의 이름이 너무 깁니다.`);
    const aliases = Array.isArray(item.aliases) ? item.aliases.filter((a): a is string => typeof a === "string").map(a => a.trim()).filter(Boolean).slice(0, 5) : [];
    const photo = typeof item.photo === "string" && photoExists(item.photo) ? item.photo : null;
    // 판 지정이 없으면(예전 백업 파일) 앞에서부터 1판 8명, 나머지 2판
    const board: 1 | 2 = item.board === 1 || item.board === 2 ? item.board : index < FACE_BOARDS[0].pairs ? 1 : 2;
    let id = typeof item.id === "string" && /^[a-z0-9-]{4,40}$/.test(item.id) ? item.id : uuid();
    if (seen.has(id)) id = uuid();
    seen.add(id);
    return { id, name, aliases, photo, board };
  });
}
