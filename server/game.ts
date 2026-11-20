/**
 * ALL IN MACAU 게임 규칙 (서버)
 *
 *  진행 순서:  lobby → [얼굴 카드] face_tutorial → face_play → face_result
 *                    → 소수의 선택 minority_tutorial → minority_play ⇄ minority_result → minority_summary(중간 순위)
 *                    → 룰렛 roulette_tutorial → roulette_betting ⇄ roulette_result → finished(최종 시상)
 *
 *  - 얼굴 카드 인물을 2명 이상 등록하지 않으면 얼굴 카드를 건너뛰고 소수의 선택부터 시작합니다.
 *  - 상태는 메모리에 두고 index.ts가 파일로 백업합니다. 서버 한 대가 요청을 순서대로 처리합니다.
 *  - 화면(client)과 주고받는 데이터 형식은 GET/POST 함수의 결과(publicState)입니다.
 */
import { webcrypto as crypto } from "node:crypto";
import { ROULETTE_RESULT_HOLD_MS, ROULETTE_SPIN_MS } from "../client/src/lib/roulette-timing";
import { DOCUMENT_MINORITIES, DEFAULT_PRACTICE_QUESTION } from "../client/src/lib/minority-questions";
import { countMinorityChoices, type MinorityOutcome } from "../client/src/lib/minority-result";
import {
  defaultFaceSettings, faceEnabled, readyPeople, reconcileFace, facePublic, startFaceTutorial, startFaceGame,
  closeFaceStage, stopFaceAfterTurn, facePick, faceAnswer, validateFacePeople, FaceError, type FaceSettings, type FaceState,
} from "./face";
import { photoExists } from "./photos";

// ------------------------------------------------------------------ 데이터 형식
type Color = "red" | "black";
type Phase =
  | "lobby"
  | "face_tutorial" | "face_play" | "face_result"
  | "minority_tutorial" | "minority_play" | "minority_result" | "minority_summary"
  | "roulette_tutorial" | "roulette_betting" | "roulette_result"
  | "finished";
type Team = {
  id: string; table: number; name: string; token: string; chips: number;
  // 라운드별로 얻은 칩 (중간 순위·최종 화면의 내역용)
  faceChange?: number; minorityTotal?: number; adjustTotal?: number;
  minorityChoice?: number | null; minorityChange?: number | null;
  bet: { color: Color; amount: number } | null; skipped?: boolean;
};
type MinorityQuestion = { question: string; options: string[] };
type Settings = {
  tableCount: number;
  rouletteSpins: number;
  minorityRounds: number;
  minorityBonus: number;
  minoritySeconds: number;
  rouletteBetSeconds: number;
  minorityQuestions: MinorityQuestion[];
  minorityPracticeQuestion: MinorityQuestion;
} & FaceSettings;
type RouletteHistory = { round: number; result: Color; teams: { id: string; name: string; table: number; color: Color; amount: number; change: number; chips: number }[] };
type MinorityHistory = { round: number; question: MinorityQuestion; result: MinorityOutcome; teams: { id: string; table: number; choice: number | null; change: number; chips: number }[] };
type Room = {
  room: string; phase: Phase; teams: Team[]; settings: Settings; excludedTables: number[];
  face?: FaceState | null;
  minorityRound?: number; minorityPractice?: boolean; minorityDeadline?: number | null; minorityResultAt?: number | null;
  minorityResult?: MinorityOutcome | null; minorityHistory?: MinorityHistory[];
  round: number; result: Color | null; rouletteDeadline?: number | null; rouletteSpinStartedAt?: number | null; history: RouletteHistory[];
  paused?: { remaining: number } | null; // 운영자 일시정지 (남은 시간 보관)
  adjustments?: { table: number; delta: number; reason: string; at: number }[];
};
type Payload = Record<string, unknown>;
export type ApiResult = { status: number; body: any };

const defaultSettings: Settings = {
  tableCount: 14, rouletteSpins: 3, minorityBonus: 100, minoritySeconds: 30, rouletteBetSeconds: 60,
  minorityRounds: DOCUMENT_MINORITIES.length, minorityQuestions: DOCUMENT_MINORITIES, minorityPracticeQuestion: DEFAULT_PRACTICE_QUESTION,
  ...defaultFaceSettings,
};

// ------------------------------------------------------------------ 저장소 (메모리, index.ts가 파일로 백업)
type Store = { activeRoom: string | null; rooms: Record<string, Room> };
export const store: Store = { activeRoom: null, rooms: {} };
let onChange: () => void = () => {};
export function setChangeListener(fn: () => void) { onChange = fn; }
export function exportStore(): string { return JSON.stringify(store); }
export function importStore(text: string) {
  const data = JSON.parse(text) as Store;
  if (!data || typeof data !== "object" || typeof data.rooms !== "object") return;
  store.activeRoom = data.activeRoom ?? null;
  store.rooms = data.rooms;
}
export function activeRoomData(): Room | null {
  return store.activeRoom ? store.rooms[store.activeRoom] ?? null : null;
}
/** 지난 게임방은 최근 3개만 남김 */
function pruneRooms() {
  const old = Object.keys(store.rooms).filter(code => code !== store.activeRoom);
  for (const code of old.slice(0, Math.max(0, old.length - 3))) delete store.rooms[code];
}

// ------------------------------------------------------------------ 공통 도구
class GameError extends Error { constructor(message: string, public status = 400) { super(message); } }
function fail(message: string, status = 400): never { throw new GameError(message, status); }
const json = (value: unknown, status = 200): ApiResult => ({ status, body: value });
const str = (value: unknown) => (typeof value === "string" ? value : "");
const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), b => alphabet[b & 31]).join("");
}
function codeOf(value: unknown) {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^[A-Z2-9]{6}$/.test(code)) fail("방 코드를 확인해 주세요.");
  return code;
}
function validateQuestion(value: unknown): MinorityQuestion {
  const item = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
  const q = typeof item.question === "string" ? item.question.trim() : "";
  const options = Array.isArray(item.options) ? item.options : [];
  if (!q || q.length > 120 || options.length < 2 || options.length > 6 || options.some(o => typeof o !== "string" || !o.trim() || o.trim().length > 80)) {
    fail("질문과 2~6개의 선택지를 입력해 주세요.");
  }
  return { question: q, options: options.map(o => (o as string).trim()) };
}
const currentQuestion = (room: Room) =>
  room.minorityPractice ? room.settings.minorityPracticeQuestion : room.settings.minorityQuestions[(room.minorityRound ?? 1) - 1];

// ------------------------------------------------------------------ 운영자 인증
const env = { get password() { return process.env.GAME_HOST_PASSWORD || process.env.HOST_PIN || ""; } };
let hostTokenCache: { password: string; token: string } | null = null;
/** 운영자 비밀번호에서 만든 토큰 (비밀번호를 바꾸면 기존 로그인은 풀림) */
export async function hostTokenForPassword(): Promise<string> {
  const password = env.password;
  if (!password) fail("운영자 비밀번호가 설정되지 않았습니다. 관리자에게 문의해 주세요.", 503);
  if (hostTokenCache?.password === password) return hostTokenCache.token;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode("dt-outing-host-session-v1"));
  const token = Array.from(new Uint8Array(signature), b => b.toString(16).padStart(2, "0")).join("");
  hostTokenCache = { password, token };
  return token;
}
function requireHost(credential: unknown, expected: string) { if (!credential || credential !== expected) fail("운영자 권한을 확인할 수 없습니다.", 403); }
function requireTeam(room: Room, credential: unknown) {
  const value = str(credential);
  const team = room.teams.find(t => value && t.token === value);
  if (!team) fail("테이블 정보를 확인할 수 없습니다.", 403);
  return team;
}

// ------------------------------------------------------------------ 화면으로 보내는 상태
/** 얼굴 카드를 이번 게임에서 하는지 (진행했거나, 대기실에서 인물이 등록돼 있으면) */
const faceUsed = (room: Room) => !!room.face || room.phase.startsWith("face_") || (room.phase === "lobby" && faceEnabled(room.settings));

export function publicState(room: Room, teamToken = "", isHost = false) {
  const myTeam = room.teams.find(team => teamToken && team.token === teamToken);
  // 참가자에게는 지금 문제까지만 (다음 문제를 미리 볼 수 없게)
  const questionIndex = !room.minorityPractice && (room.phase === "minority_play" || room.phase === "minority_result") ? (room.minorityRound ?? 1) - 1 : -1;
  const questions = isHost ? room.settings.minorityQuestions
    : questionIndex >= 0 ? room.settings.minorityQuestions.slice(0, questionIndex + 1).map((q, i) => (i === questionIndex ? q : null))
    : [];
  return {
    room: room.room,
    phase: room.phase,
    stage: room.phase.startsWith("roulette_") || room.phase === "finished" ? 2 : 1,
    rounds: faceUsed(room) ? { face: 1, minority: 2, roulette: 3 } : { face: null, minority: 1, roulette: 2 },
    serverTime: Date.now(),
    // 얼굴 카드 인물 이름·사진 목록은 운영자에게만
    settings: isHost ? room.settings : { ...room.settings, minorityQuestions: questions, facePeople: [], facePeopleCount: readyPeople(room.settings).length },
    excludedTables: room.excludedTables,
    face: facePublic(room, myTeam?.id ?? null, isHost),
    minorityRound: room.minorityRound ?? 1,
    minorityPractice: room.minorityPractice === true,
    minorityDeadline: room.minorityDeadline ?? null,
    minorityResult: room.minorityResult ?? null,
    minorityHistory: isHost ? room.minorityHistory ?? [] : [],
    paused: room.paused ? { remaining: room.paused.remaining } : null,
    rouletteDeadline: room.rouletteDeadline ?? null,
    adjustments: isHost ? room.adjustments ?? [] : [],
    round: room.round,
    result: room.result,
    rouletteSpinStartedAt: room.rouletteSpinStartedAt ?? null,
    history: isHost ? room.history : room.history.filter(entry => entry.round === room.round),
    myTeamId: myTeam?.id ?? null,
    teams: room.teams.map(team => {
      const isMine = team.id === myTeam?.id;
      return {
        id: team.id, table: team.table, name: team.name, chips: team.chips,
        faceChange: team.faceChange ?? 0,
        minorityTotal: team.minorityTotal ?? 0,
        adjustTotal: team.adjustTotal ?? 0,
        skipped: team.skipped === true,
        // 선택 중에는 다른 테이블의 선택·베팅 색을 숨김
        minorityChoice: room.phase === "minority_play" && !isMine && !isHost ? null : team.minorityChoice ?? null,
        minoritySubmitted: typeof team.minorityChoice === "number",
        minorityChange: team.minorityChange ?? null,
        bet: !team.bet ? null : room.phase === "roulette_betting" && !isMine && !isHost ? { placed: true } : { placed: true, ...team.bet },
      };
    }),
  };
}

// ------------------------------------------------------------------ 상태 읽기/변경
function load(code: string): Room {
  const room = store.rooms[code];
  if (!room) fail("방을 찾을 수 없습니다. 방 코드를 확인해 주세요.", 404);
  room.settings = { ...defaultSettings, ...(room.settings || {}) };
  room.excludedTables = (room.excludedTables || []).filter(n => Number.isInteger(n) && n >= 1 && n <= room.settings.tableCount);
  return room;
}

// ------------------------------------------------------------------ 타이머 (얼굴 카드 · 소수의 선택 · 룰렛 베팅)
type Timer = { get: () => number | null | undefined; set: (v: number | null) => void };
/** 지금 단계에서 돌아가는 타이머 (없으면 null) */
function activeTimer(room: Room): Timer | null {
  if (room.phase === "face_play" && room.face && room.face.stage !== "done") return { get: () => room.face!.deadline, set: v => { room.face!.deadline = v; } };
  if (room.phase === "minority_play") return { get: () => room.minorityDeadline, set: v => { room.minorityDeadline = v; } };
  if (room.phase === "roulette_betting") return { get: () => room.rouletteDeadline, set: v => { room.rouletteDeadline = v; } };
  return null;
}
/** 단계가 바뀌면 일시정지는 자동으로 풀림 */
function clearStalePause(room: Room) {
  if (room.paused && !activeTimer(room)) room.paused = null;
}
function revealMinority(game: Room) {
  const question = currentQuestion(game);
  if (!question) fail("문제를 찾을 수 없습니다.");
  const result = countMinorityChoices(question.options.length, game.teams.map(team => team.minorityChoice));
  for (const team of game.teams) {
    const won = typeof team.minorityChoice === "number" && result.winningChoices.includes(team.minorityChoice);
    team.minorityChange = won ? game.settings.minorityBonus : 0;
    if (!game.minorityPractice) { team.chips += team.minorityChange; team.minorityTotal = (team.minorityTotal ?? 0) + team.minorityChange; }
  }
  game.minorityResult = result;
  game.minorityResultAt = Date.now();
  game.minorityDeadline = null;
  if (!game.minorityPractice) {
    (game.minorityHistory ??= []).push({ round: game.minorityRound ?? 1, question, result, teams: game.teams.map(team => ({ id: team.id, table: team.table, choice: team.minorityChoice ?? null, change: team.minorityChange ?? 0, chips: team.chips })) });
  }
  game.phase = "minority_result";
}
/** 베팅 시간이 끝나면 아직 베팅하지 않은 테이블은 이번 판을 건너뜀 */
function closeBetting(game: Room) {
  game.rouletteDeadline = null;
  for (const team of game.teams) if (team.chips > 0 && !team.bet) team.skipped = true;
}
/** 시간 경과에 따른 자동 진행. 바뀌었으면 true */
function reconcile(room: Room, now = Date.now()): boolean {
  if (room.paused) return false;
  let changed = reconcileFace(room, now);
  if (room.phase === "minority_play" && typeof room.minorityDeadline === "number" && now >= room.minorityDeadline) { revealMinority(room); changed = true; }
  if (room.phase === "roulette_betting" && typeof room.rouletteDeadline === "number" && now >= room.rouletteDeadline) { closeBetting(room); changed = true; }
  return changed;
}

/** 한 요청을 처리. 실패하면 변경을 되돌리되, 그 전에 처리된 시간 초과 진행은 유지합니다. */
function mutate(code: string, operation: (room: Room) => void): Room {
  if (store.activeRoom !== code) fail("진행 중인 게임이 변경됐습니다. 다시 입장해 주세요.", 409);
  const room = load(code);
  const advanced = reconcile(room);
  const snapshot = structuredClone(room);
  try {
    operation(room);
    reconcile(room);
    clearStalePause(room);
  } catch (error) {
    store.rooms[code] = snapshot;
    if (advanced) onChange();
    throw error;
  }
  onChange();
  return room;
}

/** 주기적으로 호출: 시간 초과 자동 진행 */
export function tick(): boolean {
  const room = activeRoomData();
  if (room && reconcile(room)) { clearStalePause(room); onChange(); return true; }
  return false;
}

function handleError(error: unknown): ApiResult {
  if (error instanceof GameError || error instanceof FaceError) return json({ error: error.message }, error.status);
  console.error("Game API error", error);
  return json({ error: "게임을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." }, 500);
}

// ------------------------------------------------------------------ 조회
type GetParams = { active?: boolean; room?: string | null; teamToken?: string | null; hostToken?: string | null };
export async function GET(params: GetParams): Promise<ApiResult> {
  try {
    const code = params.active ? store.activeRoom : codeOf(params.room);
    if (!code) return json({ state: null });
    const room = load(code);
    if (reconcile(room)) { clearStalePause(room); onChange(); }
    const hostToken = params.hostToken ?? null;
    if (hostToken !== null) requireHost(hostToken, await hostTokenForPassword());
    return json({ state: publicState(room, params.teamToken ?? "", hostToken !== null) });
  } catch (error) {
    return handleError(error);
  }
}

// ------------------------------------------------------------------ 동작
const HOST_ACTIONS = new Set([
  "update_settings", "face_set_people", "exclude_table", "include_table", "remove_team",
  "start_face", "start_face_game", "face_close", "face_stop",
  "start_minority", "start_minority_practice", "start_minority_game", "reveal_minority", "next_minority",
  "minority_summary", "start_roulette", "start_roulette_game", "finish_no_chips", "spin", "next",
  "pause", "resume", "extend", "adjust_chips",
]);
const PROGRESS_ACTIONS = new Set([
  "start_face", "start_face_game", "face_close", "start_minority", "start_minority_practice", "start_minority_game",
  "reveal_minority", "next_minority", "minority_summary", "start_roulette", "start_roulette_game", "finish_no_chips", "spin", "next",
]);
// skip_bet / undo_skip은 테이블(본인)과 운영자(teamId 지정) 모두 사용

export async function POST(input: unknown): Promise<ApiResult> {
  try {
    const body = input as Payload;
    if (!body || typeof body !== "object" || Array.isArray(body)) fail("요청을 읽을 수 없습니다.");
    const action = str(body.action);

    if (action === "host_login") {
      const password = env.password;
      if (!password) fail("운영자 비밀번호가 설정되지 않았습니다. 관리자에게 문의해 주세요.", 503);
      if (typeof body.password !== "string" || body.password !== password) fail("비밀번호를 확인해 주세요.", 403);
      const room = activeRoomData();
      return json({ room: store.activeRoom, hostToken: await hostTokenForPassword(), state: room ? publicState(load(room.room), "", true) : null });
    }

    if (action === "create") {
      const hostToken = await hostTokenForPassword();
      requireHost(body.hostToken, hostToken);
      // 이전 게임의 설정(문항, 테이블 수, 얼굴 카드 인물 등)을 이어받습니다
      const prior = activeRoomData();
      let code = randomCode();
      while (store.rooms[code]) code = randomCode();
      const room: Room = {
        room: code, phase: "lobby", teams: [], round: 1, result: null, history: [],
        settings: structuredClone({ ...defaultSettings, ...(prior?.settings || {}) }),
        excludedTables: [...(prior?.excludedTables || [])],
      };
      store.rooms[code] = room;
      store.activeRoom = code;
      pruneRooms();
      onChange();
      return json({ room: code, hostToken, state: publicState(room, "", true) });
    }

    const code = body.room ? codeOf(body.room) : store.activeRoom;
    if (!code) fail("진행 중인 게임이 없습니다. 운영자를 기다려 주세요.", 404);
    const hostToken = HOST_ACTIONS.has(action) || ((action === "skip_bet" || action === "undo_skip") && !body.teamToken) ? await hostTokenForPassword() : "";
    // 다음 단계로 넘기는 운영자 동작은 일시정지를 풀고 진행
    const unpause = PROGRESS_ACTIONS.has(action);
    const asHost = (fn: (room: Room) => void) => {
      const room = mutate(code, game => { requireHost(body.hostToken, hostToken); if (unpause) game.paused = null; fn(game); });
      return json({ state: publicState(room, "", true) });
    };
    const asTeam = (fn: (room: Room, team: Team) => void) => {
      const teamToken = str(body.teamToken);
      const room = mutate(code, game => fn(game, requireTeam(game, teamToken)));
      return json({ state: publicState(room, teamToken) });
    };

    switch (action) {
      // ---------------------------------------------------------- 입장/설정
      case "join": {
        const table = Number(body.table);
        if (!Number.isInteger(table) || table < 1 || table > 30) fail("테이블 번호를 확인해 주세요.");
        let teamToken = randomToken();
        const room = mutate(code, game => {
          if (table > game.settings.tableCount) fail(`테이블 번호 1~${game.settings.tableCount}를 입력해 주세요.`);
          if (game.excludedTables.includes(table)) fail("참여 대상에서 제외된 테이블입니다. 운영자에게 문의해 주세요.");
          // 같은 테이블 번호로 들어오면 같은 테이블로 연결 (테이블당 여러 폰 가능)
          const existing = game.teams.find(team => team.table === table);
          if (existing) { teamToken = existing.token; return; }
          if (game.phase === "finished") fail("게임이 끝났습니다.");
          // 늦게 온 테이블도 0칩으로 참여. 얼굴 카드 중이면 맨 마지막 차례로
          const team: Team = { id: crypto.randomUUID(), table, name: `${table}번 테이블`, token: teamToken, chips: 0, bet: null, skipped: false };
          game.teams.push(team);
          if (game.face && game.phase === "face_play") game.face.order.push(team.id);
        });
        return json({ teamToken, state: publicState(room, teamToken) });
      }
      case "update_settings": {
        const data = (body.settings && typeof body.settings === "object" && !Array.isArray(body.settings) ? body.settings : fail("게임 설정을 확인해 주세요.")) as Payload;
        const int = (key: string, min: number, max: number, label: string, fallback?: number) => {
          const v = data[key] ?? fallback;
          if (!Number.isSafeInteger(v) || (v as number) < min || (v as number) > max) fail(`${label}은(는) ${min}~${max} 사이로 설정해 주세요.`);
          return v as number;
        };
        return asHost(game => {
          if (game.phase !== "lobby") fail("게임 시작 전 대기실에서만 설정할 수 있습니다.");
          const s = game.settings;
          const tableCount = int("tableCount", 1, 30, "테이블 수", s.tableCount);
          if (game.teams.some(team => team.table > tableCount)) fail("이미 입장한 테이블 번호보다 작게 설정할 수 없습니다. 해당 테이블을 먼저 제외해 주세요.");
          let questions = s.minorityQuestions;
          if (data.minorityQuestions !== undefined) {
            if (!Array.isArray(data.minorityQuestions) || data.minorityQuestions.length < 1 || data.minorityQuestions.length > 20) fail("소수의 선택 문항은 1~20개로 설정해 주세요.");
            questions = data.minorityQuestions.map(validateQuestion);
          }
          const minorityRounds = data.minorityRounds === undefined ? questions.length : int("minorityRounds", 1, 20, "소수의 선택 문항 수");
          if (minorityRounds > questions.length) fail("설정한 문항 수만큼 질문을 입력해 주세요.");
          game.settings = {
            ...s,
            tableCount,
            rouletteSpins: int("rouletteSpins", 1, 20, "룰렛 횟수", s.rouletteSpins),
            minorityBonus: int("minorityBonus", 0, 100000, "소수 선택 보너스", s.minorityBonus),
            minoritySeconds: int("minoritySeconds", 10, 120, "소수의 선택 시간", s.minoritySeconds),
            rouletteBetSeconds: int("rouletteBetSeconds", 15, 300, "룰렛 베팅 시간", s.rouletteBetSeconds),
            minorityQuestions: questions,
            minorityRounds,
            minorityPracticeQuestion: data.minorityPracticeQuestion === undefined ? s.minorityPracticeQuestion : validateQuestion(data.minorityPracticeQuestion),
            faceMatchBonus: int("faceMatchBonus", 0, 100000, "짝 맞히기 보너스", s.faceMatchBonus),
            faceNameBonus: int("faceNameBonus", 0, 100000, "이름 정답 보너스", s.faceNameBonus),
            faceSelectSeconds: int("faceSelectSeconds", 10, 120, "카드 선택 시간", s.faceSelectSeconds),
            faceNameSeconds: int("faceNameSeconds", 10, 120, "이름 입력 시간", s.faceNameSeconds),
          };
          game.excludedTables = game.excludedTables.filter(table => table <= tableCount);
        });
      }
      case "face_set_people": {
        const people = validateFacePeople(body.facePeople, photoExists);
        return asHost(game => {
          if (game.phase !== "lobby") fail("게임 시작 전 대기실에서만 인물을 바꿀 수 있습니다.");
          game.settings = { ...game.settings, facePeople: people };
        });
      }
      case "exclude_table":
      case "include_table": {
        const table = body.table;
        if (typeof table !== "number" || !Number.isInteger(table) || table < 1 || table > 30) fail("테이블 번호를 확인해 주세요.");
        return asHost(game => {
          if (game.phase !== "lobby") fail("테이블 불참 설정은 게임 시작 전 대기실에서만 변경할 수 있습니다.");
          if (table > game.settings.tableCount) fail(`테이블 번호 1~${game.settings.tableCount}를 입력해 주세요.`);
          if (action === "exclude_table") {
            if (game.teams.some(team => team.table === table)) fail("이미 입장한 테이블입니다. 팀을 먼저 별도로 제외해 주세요.");
            if (!game.excludedTables.includes(table)) game.excludedTables.push(table);
            game.excludedTables.sort((a, b) => a - b);
          } else {
            game.excludedTables = game.excludedTables.filter(n => n !== table);
          }
        });
      }
      case "remove_team":
        return asHost(game => {
          if (game.phase === "finished" || game.phase === "roulette_result") fail("지금은 테이블을 제외할 수 없습니다.");
          const index = game.teams.findIndex(t => t.id === body.teamId);
          if (index < 0) fail("테이블을 찾을 수 없습니다.");
          if (game.phase !== "lobby" && game.teams.length < 2) fail("마지막 테이블은 제외할 수 없습니다.");
          game.teams.splice(index, 1);
        });

      // ---------------------------------------------------------- 얼굴 카드 (규칙은 face.ts)
      case "start_face": return asHost(game => startFaceTutorial(game));
      case "start_face_game": return asHost(game => startFaceGame(game));
      case "face_close": return asHost(game => closeFaceStage(game, body.turnId));
      case "face_stop": return asHost(game => stopFaceAfterTurn(game));
      case "face_pick": return asTeam((game, team) => facePick(game, team.id, body.index, body.turnId));
      case "face_answer": return asTeam((game, team) => faceAnswer(game, team.id, body.answer, body.turnId));

      // ---------------------------------------------------------- 소수의 선택
      case "start_minority":
        return asHost(game => {
          if (game.phase !== "lobby" && game.phase !== "face_result") fail("이미 게임을 시작했습니다.");
          if (!game.teams.length) fail("참여한 테이블이 없습니다.");
          // 대기실에서 바로 시작하면 0칩부터, 얼굴 카드 뒤라면 얻은 칩을 이어 갑니다
          if (game.phase === "lobby") for (const team of game.teams) team.chips = 0;
          game.minorityRound = 1;
          game.minorityHistory = [];
          game.minorityResult = null;
          game.phase = "minority_tutorial";
        });
      case "start_minority_practice":
      case "start_minority_game":
      case "next_minority":
        return asHost(game => {
          if (action === "start_minority_practice") {
            if (game.phase !== "minority_tutorial") fail("게임 안내 화면에서 연습을 시작해 주세요.");
            game.minorityPractice = true;
            game.minorityRound = 0;
          } else if (action === "start_minority_game") {
            if (game.phase !== "minority_tutorial" && !(game.phase === "minority_result" && game.minorityPractice)) fail("안내 또는 연습 결과 화면에서 본 게임을 시작해 주세요.");
            game.minorityPractice = false;
            game.minorityRound = 1;
          } else {
            if (game.phase !== "minority_result" || game.minorityPractice || (game.minorityRound ?? 1) >= game.settings.minorityRounds) fail("다음 문제가 없습니다.");
            game.minorityRound = (game.minorityRound ?? 1) + 1;
          }
          for (const team of game.teams) { team.minorityChoice = null; team.minorityChange = null; }
          game.minorityResult = null;
          game.minorityResultAt = null;
          game.minorityDeadline = Date.now() + game.settings.minoritySeconds * 1000;
          game.phase = "minority_play";
        });
      case "minority_choose":
        return asTeam((game, team) => {
          const choice = body.choice;
          if (game.phase !== "minority_play") fail("지금은 선택할 수 없습니다.");
          if (game.paused) fail("진행자가 잠시 멈췄어요. 잠시만 기다려 주세요.");
          if (body.minorityRound !== (game.minorityRound ?? 1)) fail("문제가 변경되었습니다. 화면을 확인하고 다시 선택해 주세요.", 409);
          if (typeof game.minorityDeadline !== "number" || Date.now() >= game.minorityDeadline) fail("선택 시간이 끝났습니다.", 409);
          const question = currentQuestion(game);
          if (!question || !Number.isInteger(choice) || (choice as number) < 0 || (choice as number) >= question.options.length) fail("선택지를 확인해 주세요.");
          team.minorityChoice = choice as number;
        });
      case "reveal_minority":
        return asHost(game => {
          if (game.phase !== "minority_play") fail("결과를 발표할 문제가 없습니다.");
          if (body.minorityRound !== (game.minorityRound ?? 1)) fail("문제가 변경되었습니다. 화면을 확인해 주세요.", 409);
          revealMinority(game);
        });
      case "minority_summary":
        return asHost(game => {
          const done = game.phase === "minority_result" && !game.minorityPractice && (game.minorityRound ?? 1) >= game.settings.minorityRounds;
          if (!done) fail("소수의 선택을 모두 마친 뒤 중간 순위를 볼 수 있습니다.");
          game.phase = "minority_summary";
        });

      // ---------------------------------------------------------- 룰렛
      case "start_roulette":
        return asHost(game => {
          const minorityDone = game.phase === "minority_summary" || (game.phase === "minority_result" && !game.minorityPractice && (game.minorityRound ?? 1) >= game.settings.minorityRounds);
          if (!minorityDone) fail("소수의 선택을 모두 마친 뒤 룰렛을 시작할 수 있습니다.");
          game.phase = "roulette_tutorial";
        });
      case "start_roulette_game":
        return asHost(game => {
          if (game.phase !== "roulette_tutorial") fail("룰렛 안내 화면에서 게임을 시작해 주세요.");
          game.round = 1;
          game.phase = "roulette_betting";
          game.rouletteDeadline = Date.now() + game.settings.rouletteBetSeconds * 1000;
        });
      case "finish_no_chips":
        return asHost(game => {
          if (game.phase !== "roulette_tutorial" && game.phase !== "roulette_betting") fail("룰렛 준비 단계에서만 최종 결과를 볼 수 있습니다.");
          if (!game.teams.length || game.teams.some(team => team.chips > 0)) fail("칩을 보유한 테이블이 있어 룰렛을 진행해야 합니다.");
          game.phase = "finished";
        });
      case "bet": {
        const { amount, color } = body;
        if ((color !== "red" && color !== "black") || !Number.isSafeInteger(amount) || (amount as number) < 1) fail("색과 베팅할 칩을 확인해 주세요.");
        return asTeam((game, team) => {
          if (game.phase !== "roulette_betting" || (!game.rouletteDeadline && !game.paused)) fail("이번 베팅은 마감되었습니다.");
          if (team.skipped) fail("베팅 건너뛰기를 취소한 뒤 다시 베팅해 주세요.");
          if ((amount as number) > team.chips) fail("보유 칩보다 많이 베팅할 수 없습니다.");
          team.bet = { color: color as Color, amount: amount as number };
        });
      }
      case "skip_bet":
      case "undo_skip": {
        const update = (game: Room, team: Team | undefined, byHost: boolean) => {
          if (game.phase !== "roulette_betting") fail("베팅 진행 중에만 바꿀 수 있습니다.");
          if (!team) fail("테이블을 찾을 수 없습니다.");
          if (action === "skip_bet") {
            if (team.chips <= 0) fail("칩이 없는 테이블은 이미 관전 중입니다.");
            if (team.bet && byHost) fail("이미 베팅한 테이블은 건너뛸 수 없습니다.");
            team.bet = null;
            team.skipped = true;
          } else {
            if (!team.skipped) fail("건너뛴 테이블이 아닙니다.");
            if (!byHost && !game.rouletteDeadline && !game.paused) fail("베팅 시간이 끝났습니다.");
            team.skipped = false;
          }
        };
        if (body.teamToken) return asTeam((game, team) => update(game, team, false));
        return asHost(game => update(game, game.teams.find(t => t.id === body.teamId), true));
      }
      case "spin": {
        const color: Color = (crypto.getRandomValues(new Uint8Array(1))[0] & 1) === 0 ? "red" : "black";
        return asHost(game => {
          if (game.phase !== "roulette_betting") fail("이미 룰렛을 돌렸습니다.");
          if (!game.teams.length) fail("참여한 테이블이 없습니다.");
          if (game.teams.some(team => team.chips > 0 && !team.bet && !team.skipped)) fail("아직 베팅하지 않은 테이블이 있습니다.");
          const settled: RouletteHistory["teams"] = [];
          for (const team of game.teams) {
            if (!team.bet) continue;
            const change = team.bet.color === color ? team.bet.amount : -team.bet.amount;
            team.chips += change;
            settled.push({ id: team.id, name: team.name, table: team.table, color: team.bet.color, amount: team.bet.amount, change, chips: team.chips });
          }
          game.history.push({ round: game.round, result: color, teams: settled });
          game.rouletteDeadline = null;
          game.result = color;
          game.rouletteSpinStartedAt = Date.now();
          game.phase = "roulette_result";
        });
      }
      case "next":
        return asHost(game => {
          if (game.phase !== "roulette_result") fail("결과를 확인한 뒤 진행할 수 있습니다.");
          if (typeof game.rouletteSpinStartedAt === "number" && Date.now() < game.rouletteSpinStartedAt + ROULETTE_SPIN_MS + ROULETTE_RESULT_HOLD_MS) fail("룰렛 결과 공개가 끝날 때까지 기다려 주세요.");
          if (game.round >= game.settings.rouletteSpins || game.teams.every(team => team.chips === 0)) { game.phase = "finished"; return; }
          game.round += 1;
          game.phase = "roulette_betting";
          game.rouletteDeadline = Date.now() + game.settings.rouletteBetSeconds * 1000;
          game.result = null;
          game.rouletteSpinStartedAt = null;
          for (const team of game.teams) { team.bet = null; team.skipped = false; }
        });

      // ---------------------------------------------------------- 운영 도구
      case "pause":
        return asHost(game => {
          const timer = activeTimer(game);
          const deadline = timer?.get();
          if (!timer || typeof deadline !== "number") fail("지금은 멈출 타이머가 없습니다.");
          if (game.paused) return;
          game.paused = { remaining: Math.max(0, deadline - Date.now()) };
          timer.set(null);
        });
      case "resume":
        return asHost(game => {
          if (!game.paused) return;
          activeTimer(game)?.set(Date.now() + game.paused.remaining);
          game.paused = null;
        });
      case "extend":
        return asHost(game => {
          const timer = activeTimer(game);
          if (!timer) fail("지금은 늘릴 타이머가 없습니다.");
          if (game.paused) { game.paused.remaining += 15_000; return; }
          // 룰렛 베팅이 이미 마감됐다면 15초 다시 열어 줌
          timer.set(Math.max(timer.get() ?? 0, Date.now()) + 15_000);
        });
      case "adjust_chips":
        return asHost(game => {
          const team = game.teams.find(t => t.id === body.teamId);
          const delta = body.delta;
          if (!team) fail("테이블을 찾을 수 없습니다.");
          if (!Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta as number) > 100000) fail("조정할 칩을 확인해 주세요.");
          if (game.phase === "roulette_result" || (game.phase === "roulette_betting" && team.bet)) fail("룰렛 결과가 정산되는 중에는 조정할 수 없습니다.");
          const next = team.chips + (delta as number);
          if (next < 0) fail("칩이 0보다 작아질 수 없습니다.");
          team.chips = next;
          team.adjustTotal = (team.adjustTotal ?? 0) + (delta as number);
          (game.adjustments ??= []).push({ table: team.table, delta: delta as number, reason: str(body.reason).trim().slice(0, 100), at: Date.now() });
        });
      default:
        return fail("알 수 없는 요청입니다.");
    }
  } catch (error) {
    return handleError(error);
  }
}
