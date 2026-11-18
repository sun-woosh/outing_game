// Node 서버용 포팅: Cloudflare D1 대신 메모리에 상태를 두고 파일로 백업합니다.
// 게임 규칙과 화면에 보내는 데이터 형식은 기존 ChatGPT Sites 버전과 동일합니다.
import { webcrypto as crypto } from "node:crypto";
const env = {
  get GAME_HOST_PASSWORD() { return process.env.GAME_HOST_PASSWORD || process.env.HOST_PIN || ""; },
};
import { ROULETTE_RESULT_HOLD_MS, ROULETTE_SPIN_MS } from "../client/src/lib/roulette-timing";
import type { Card, CardRank, CardSuit } from "../client/src/lib/cards";
import { DOCUMENT_MINORITIES, DEFAULT_PRACTICE_QUESTION } from "../client/src/lib/minority-questions";
import { countMinorityChoices } from "../client/src/lib/minority-result";

type Color = "red" | "black";
type Bet = { color: Color; amount: number };
type Status = "waiting" | "playing" | "stand" | "bust";
type Team = { id: string; table: number; name: string; token: string; chips: number; bet: Bet | null; cards: Card[]; blackjackStatus: Status; blackjackChange: number | null; skipped?: boolean; minorityChoice?: number | null; minorityChange?: number | null };
type HistoryTeam = { id: string; name: string; table: number; color: Color; amount: number; change: number; chips: number };
type BlackjackHistoryTeam = { id: string; table: number; name: string; cards: Card[]; total: number; status: Status; change: number; chips: number };
type BlackjackHistory = { round: number; teams: BlackjackHistoryTeam[] };
type Phase = "lobby" | "blackjack_tutorial" | "blackjack_play" | "blackjack_result" | "minority_tutorial" | "minority_play" | "minority_result" | "roulette_tutorial" | "roulette_betting" | "roulette_result" | "finished";
type MinorityQuestion = { question: string; options: string[] };
type MinorityResult = { counts: number[]; winningChoices: number[]; outcome: "minority" | "tie" | "none" };
type MinorityHistory = { round: number; question: MinorityQuestion; result: MinorityResult; teams: { id: string; table: number; choice: number | null; change: number; chips: number }[] };
type Settings = { tableCount: number; initialChips: number; blackjackBonus: number; blackjackPenalty: number; blackjackRounds: number; rouletteSpins: number; minorityRounds: number; minorityBonus: number; minorityQuestions: MinorityQuestion[]; minorityPracticeQuestion: MinorityQuestion };
type Room = { version: 2; room: string; hostToken: string; round: number; phase: Phase; result: Color | null; teams: Team[]; settings: Settings; excludedTables: number[]; minorityQuestionSetVersion?: number; zeroStartVersion?: number; blackjackDeadline?: number | null; blackjackRound?: number; blackjackPractice?: boolean; blackjackPracticePlayed?: boolean; blackjackResultAt?: number | null; blackjackHistory?: BlackjackHistory[]; minorityRound?: number; minorityPractice?: boolean; minorityDeadline?: number | null; minorityResultAt?: number | null; minorityResult?: MinorityResult | null; minorityHistory?: MinorityHistory[]; rouletteSpinStartedAt?: number | null; history: { round: number; result: Color; teams: HistoryTeam[] }[] };
type Row = { revision: number; data: string };
type Payload = Record<string, unknown>;
const MINORITY_QUESTION_SET_VERSION = 1;
const defaultSettings: Settings = { tableCount: 14, initialChips: 0, blackjackBonus: 100, blackjackPenalty: 50, blackjackRounds: 1, rouletteSpins: 3, minorityRounds: DOCUMENT_MINORITIES.length, minorityBonus: 100, minorityPracticeQuestion: DEFAULT_PRACTICE_QUESTION, minorityQuestions: DOCUMENT_MINORITIES };
function migrateMinorityQuestions(room: Room): boolean {
  if ((room.minorityQuestionSetVersion ?? 0) >= MINORITY_QUESTION_SET_VERSION) return false;
  room.settings = { ...room.settings, minorityPracticeQuestion: DEFAULT_PRACTICE_QUESTION, minorityQuestions: DOCUMENT_MINORITIES, minorityRounds: DOCUMENT_MINORITIES.length };
  room.minorityQuestionSetVersion = MINORITY_QUESTION_SET_VERSION;
  return true;
}
function migrateZeroStart(room: Room): boolean {
  if (room.zeroStartVersion === 1) return false;
  room.settings.initialChips = 0;
  for (const team of room.teams) team.chips = 0;
  room.zeroStartVersion = 1;
  return true;
}
// Each competing table can require a separate compare-and-swap retry. Allow
// the full supported room size, plus room for simultaneous host actions.
const MAX_WRITE_ATTEMPTS = 64;

export type ApiResult = { status: number; body: any };
function json(value: unknown, status = 200): ApiResult { return { status, body: value }; }

// ---- 저장소 (메모리) ----
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
/** 이전 방 기록은 최근 것만 남깁니다 (새 게임을 여러 번 만들어도 메모리가 늘지 않도록). */
function pruneRooms() {
  const codes = Object.keys(store.rooms).filter(code => code !== store.activeRoom);
  for (const code of codes.slice(0, Math.max(0, codes.length - 3))) delete store.rooms[code];
}
class GameError extends Error { constructor(message: string, public status: number) { super(message); } }
function fail(message: string, status = 400): never { throw new GameError(message, status); }
function token() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join(""); }
function randomCode() { const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; return Array.from(crypto.getRandomValues(new Uint8Array(6)), b => alphabet[b & 31]).join(""); }
const ranks: CardRank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const suits: CardSuit[] = ["♠", "♥", "♦", "♣"];
function card(): Card {
  // Rejection sampling keeps each rank and suit equally likely.
  let b: number;
  do { b = crypto.getRandomValues(new Uint8Array(1))[0]; } while (b >= 208);
  const index = b % 52;
  return { rank: ranks[index % ranks.length], suit: suits[Math.floor(index / ranks.length)] };
}
function codeOf(value: unknown) { const code = typeof value === "string" ? value.trim().toUpperCase() : ""; if (!/^[A-Z2-9]{6}$/.test(code)) fail("방 코드를 확인해 주세요."); return code; }
function str(value: unknown) { return typeof value === "string" ? value : ""; }
function validateMinorityQuestion(value: unknown): MinorityQuestion {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("질문과 선택지를 입력해 주세요.");
  const item = value as Record<string, unknown>;
  if (typeof item.question !== "string" || !item.question.trim() || item.question.trim().length > 120 || !Array.isArray(item.options) || item.options.length < 2 || item.options.length > 6 || item.options.some((option: unknown) => typeof option !== "string" || !option.trim() || option.trim().length > 80)) fail("질문과 2~6개의 선택지를 입력해 주세요.");
  return { question: item.question.trim(), options: item.options.map((option: string) => option.trim()) };
}
function total(team: Team) {
  return team.cards.reduce<number>((sum, card) => sum + (typeof card === "number" ? card : card.rank === "A" ? 1 : ["J", "Q", "K"].includes(card.rank) ? 10 : Number(card.rank)), 0);
}
async function activeRoom(): Promise<string | null> {
  return store.activeRoom;
}
let hostTokenCache: { password: string; token: string } | null = null;
export async function hostTokenForPassword(): Promise<string> {
  const password = env.GAME_HOST_PASSWORD;
  if (hostTokenCache && hostTokenCache.password === password) return hostTokenCache.token;
  if (!password) fail("운영자 비밀번호가 설정되지 않았습니다. 관리자에게 문의해 주세요.", 503);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode("dt-outing-host-session-v1"));
  const result = Array.from(new Uint8Array(signature), b => b.toString(16).padStart(2, "0")).join("");
  hostTokenCache = { password, token: result };
  return result;
}
export function publicState(room: Room, teamToken = "", isHost = false) {
  const myTeam = room.teams.find(team => team.token === teamToken && teamToken);
  // Participants poll frequently; only the operator needs the full question set.
  // Retain the current question's original index for existing participant screens.
  const questionIndex = !room.minorityPractice && (room.phase === "minority_play" || room.phase === "minority_result") ? (room.minorityRound ?? 1) - 1 : -1;
  const questions = isHost ? room.settings.minorityQuestions : questionIndex >= 0 && questionIndex < room.settings.minorityQuestions.length
    ? Array.from({ length: questionIndex + 1 }, (_, index) => index === questionIndex ? room.settings.minorityQuestions[index] : null)
    : [];
  return {
    room: room.room, stage: room.phase.startsWith("roulette_") || room.phase === "finished" ? 2 : 1,
    round: room.round, phase: room.phase, result: room.result, settings: isHost ? room.settings : { ...room.settings, minorityQuestions: questions }, excludedTables: room.excludedTables,
    blackjackDeadline: room.blackjackDeadline ?? null, blackjackRound: room.blackjackRound ?? 1, blackjackPractice: room.blackjackPractice === true, blackjackResultAt: room.blackjackResultAt ?? null, blackjackHistory: isHost ? room.blackjackHistory ?? [] : [], minorityRound: room.minorityRound ?? 1, minorityPractice: room.minorityPractice === true, minorityDeadline: room.minorityDeadline ?? null, minorityResultAt: room.minorityResultAt ?? null, minorityResult: room.minorityResult ?? null, minorityHistory: isHost ? room.minorityHistory ?? [] : [], rouletteSpinStartedAt: room.rouletteSpinStartedAt ?? null, serverTime: Date.now(),
    teams: room.teams.map(team => {
      const isMine = team.id === myTeam?.id;
      const hideCards = room.phase === "blackjack_play" && !isMine && !isHost;
      const hideBet = room.phase === "roulette_betting" && !isMine;
      return {
        id: team.id, table: team.table, name: team.name, chips: team.chips,
        practiceChips: room.blackjackPractice && room.phase === "blackjack_result" ? team.chips + (team.blackjackChange ?? 0) : null,
        cards: hideCards ? [] : team.cards, total: hideCards || team.cards.length === 0 ? null : total(team),
        blackjackStatus: team.blackjackStatus, blackjackChange: team.blackjackChange, skipped: team.skipped === true,
        minorityChoice: room.phase === "minority_play" && !isMine ? null : team.minorityChoice ?? null,
        minoritySubmitted: typeof team.minorityChoice === "number",
        minorityChange: team.minorityChange ?? null,
        bet: !team.bet ? null : hideBet ? { placed: true } : { placed: true, ...team.bet },
      };
    }),
    history: isHost ? room.history : room.history.filter(entry => entry.round === room.round), myTeamId: myTeam?.id ?? null,
  };
}
async function load(code: string): Promise<{ row: Row; room: Room; migrated: boolean }> {
  const stored = store.rooms[code];
  if (!stored) fail("방을 찾을 수 없습니다. 방 코드를 확인해 주세요.", 404);
  const row: Row = { revision: 0, data: "" };
  const room = stored;
  if (room.version !== 2) fail("이전 버전의 게임방입니다. 운영자가 새 방을 만들어 주세요.", 409);
  room.settings = { ...defaultSettings, ...(room.settings || {}) };
  // Keep an in-progress game stable; install the new questions once in the lobby.
  const migratedQuestions = room.phase === "lobby" && migrateMinorityQuestions(room);
  const migratedStart = room.phase === "lobby" && migrateZeroStart(room);
  const migrated = migratedQuestions || migratedStart;
  room.excludedTables = Array.isArray(room.excludedTables)
    ? [...new Set(room.excludedTables.filter(n => Number.isInteger(n) && n >= 1 && n <= room.settings.tableCount))].sort((a, b) => a - b)
    : [];
  return { row, room, migrated };
}
function blackjackExpired(room: Room, now = Date.now()) {
  return room.phase === "blackjack_play" && typeof room.blackjackDeadline === "number" && Number.isFinite(room.blackjackDeadline) && now >= room.blackjackDeadline && room.teams.some(team => team.blackjackStatus === "playing");
}
function blackjackReady(room: Room) {
  return room.phase === "blackjack_play" && room.teams.length > 0 && !room.teams.some(team => team.blackjackStatus === "playing");
}
function blackjackResultReady(room: Room, now = Date.now()) {
  return room.phase === "blackjack_result" && !room.blackjackPractice && (room.blackjackRound ?? 1) < room.settings.blackjackRounds && typeof room.blackjackResultAt === "number" && now >= room.blackjackResultAt + 5_000;
}
function dealBlackjack(room: Room) {
  for (const team of room.teams) { team.cards = [card(), card()]; team.blackjackStatus = "playing"; team.blackjackChange = null; }
  room.blackjackDeadline = Date.now() + 30_000;
  room.blackjackResultAt = null;
  room.phase = "blackjack_play";
}
function startMinorityQuestion(room: Room) {
  for (const team of room.teams) { team.minorityChoice = null; team.minorityChange = null; }
  room.minorityResult = null;
  room.minorityResultAt = null;
  room.minorityDeadline = Date.now() + 30_000;
  room.phase = "minority_play";
}
function reconcileBlackjack(room: Room): boolean {
  if (blackjackResultReady(room)) {
    room.blackjackRound = (room.blackjackRound ?? 1) + 1;
    dealBlackjack(room);
    return true;
  }
  let changed = false;
  if (blackjackExpired(room)) {
    for (const team of room.teams) if (team.blackjackStatus === "playing") team.blackjackStatus = "stand";
    changed = true;
  }
  if (!blackjackReady(room)) return changed;
  const valid = room.teams.filter(team => team.blackjackStatus !== "bust");
  const best = valid.length ? Math.max(...valid.map(total)) : null;
  for (const team of room.teams) {
    const change = team.blackjackStatus === "bust" ? -Math.min(room.settings.blackjackPenalty, Math.max(0, team.chips - 1)) : total(team) === best ? room.settings.blackjackBonus : 0;
    team.blackjackChange = change;
    if (!room.blackjackPractice) team.chips += change;
  }
  room.blackjackResultAt = Date.now();
  if (!room.blackjackPractice) (room.blackjackHistory ??= []).push({ round: room.blackjackRound ?? 1, teams: room.teams.map(team => ({ id: team.id, table: team.table, name: team.name, cards: [...team.cards], total: total(team), status: team.blackjackStatus, change: team.blackjackChange ?? 0, chips: team.chips })) });
  room.phase = "blackjack_result";
  return true;
}
// 서버 한 대가 순서대로 처리하므로 충돌 재시도(CAS)가 필요 없습니다.
// 실패한 요청은 변경을 되돌리되, 그 전에 처리된 시간 초과 정산은 유지합니다.
async function mutate(code: string, operation: (room: Room) => void): Promise<Room> {
  if (store.activeRoom !== code) fail("진행 중인 게임이 변경됐습니다. 다시 입장해 주세요.", 409);
  const { room } = await load(code);
  const reconciled = reconcileBlackjack(room);
  const snapshot = structuredClone(room);
  try { operation(room); reconcileBlackjack(room); }
  catch (caught) {
    store.rooms[code] = snapshot;
    if (reconciled) onChange();
    throw caught;
  }
  store.rooms[code] = room;
  onChange();
  return room;
}
async function loadCurrent(code: string): Promise<Room> {
  const { room, migrated } = await load(code);
  const transitioned = reconcileBlackjack(room);
  if (transitioned || migrated) onChange();
  return room;
}
/** 주기적으로 호출: 블랙잭 시간 초과/자동 다음 턴 처리 */
export function tick(): boolean {
  const code = store.activeRoom;
  const room = code ? store.rooms[code] : null;
  if (!room) return false;
  if (reconcileBlackjack(room)) { onChange(); return true; }
  return false;
}
export function activeRoomData(): Room | null {
  return store.activeRoom ? store.rooms[store.activeRoom] ?? null : null;
}
function requireHost(credential: unknown, expected: string) { if (!credential || credential !== expected) fail("운영자 권한을 확인할 수 없습니다.", 403); }
function requireTeam(room: Room, credential: unknown) { const value = str(credential); const team = room.teams.find(t => value && t.token === value); if (!team) fail("테이블 정보를 확인할 수 없습니다.", 403); return team; }
function requireBlackjackRound(room: Room, value: unknown) {
  if (((room.settings.blackjackRounds > 1 || room.blackjackPracticePlayed) && value === undefined) || (value !== undefined && value !== (room.blackjackRound ?? 1))) {
    fail("블랙잭 턴이 변경되었거나 화면이 오래되었습니다. 새로고침 후 다시 선택해 주세요.", 409);
  }
}
function handleError(error: unknown) { if (error instanceof GameError) return json({ error: error.message }, error.status); console.error("Game API error", error); return json({ error: "게임을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." }, 500); }

export type GetParams = { active?: boolean; room?: string | null; teamToken?: string | null; hostToken?: string | null };
export async function GET(params: GetParams): Promise<ApiResult> {
  try {
    const code = params.active ? await activeRoom() : codeOf(params.room);
    if (!code) return json({ state: null });
    const room = await loadCurrent(code);
    const hostCredential = params.hostToken ?? null;
    if (hostCredential !== null) requireHost(hostCredential, await hostTokenForPassword());
    return json({ state: publicState(room, params.teamToken ?? "", hostCredential !== null) });
  } catch (error) { return handleError(error); }
}
export async function POST(input: unknown): Promise<ApiResult> {
  try {
    const body = input as Payload;
    if (!body || typeof body !== "object" || Array.isArray(body)) fail("요청을 읽을 수 없습니다.");
    const action = str(body.action);
    if (action === "host_login") {
      if (!env.GAME_HOST_PASSWORD) fail("운영자 비밀번호가 설정되지 않았습니다. 관리자에게 문의해 주세요.", 503);
      if (typeof body.password !== "string" || body.password !== env.GAME_HOST_PASSWORD) fail("비밀번호를 확인해 주세요.", 403);
      const hostToken = await hostTokenForPassword();
      const code = await activeRoom();
      const game = code ? await loadCurrent(code) : null;
      return json({ room: code, hostToken, state: game ? publicState(game, "", true) : null });
    }
    if (action === "create") {
      const hostToken = await hostTokenForPassword();
      requireHost(body.hostToken, hostToken);
      {
        // 이전 방의 설정(문항, 테이블 수 등)을 새 게임에 이어받습니다.
        const priorCode = await activeRoom();
        const prior = priorCode && store.rooms[priorCode] ? structuredClone(store.rooms[priorCode]) : null;
        if (prior) prior.settings = { ...defaultSettings, ...(prior.settings || {}) };
        if (prior && (prior.minorityQuestionSetVersion ?? 0) < MINORITY_QUESTION_SET_VERSION) migrateMinorityQuestions(prior);
        const settings = { ...(prior ? prior.settings : defaultSettings), initialChips: 0 };
        const excludedTables = prior ? [...(prior.excludedTables || [])] : [];
        let code = randomCode();
        while (store.rooms[code]) code = randomCode();
        const room: Room = { version: 2, room: code, hostToken: token(), round: 1, phase: "lobby", result: null, settings, excludedTables, teams: [], history: [], minorityQuestionSetVersion: MINORITY_QUESTION_SET_VERSION, zeroStartVersion: 1 };
        store.rooms[code] = room;
        store.activeRoom = code;
        pruneRooms();
        onChange();
        return json({ room: code, hostToken, state: publicState(room, "", true) });
      }
      return fail("방을 만들지 못했습니다. 다시 시도해 주세요.", 503);
    }
    const code = body.room ? codeOf(body.room) : await activeRoom();
    if (!code) fail("진행 중인 게임이 없습니다. 운영자를 기다려 주세요.", 404);
    const hostActions = ["update_settings", "exclude_table", "include_table", "remove_team", "force_stand", "skip_bet", "undo_skip", "start_blackjack", "start_blackjack_practice", "start_blackjack_game", "settle_blackjack", "start_minority", "start_minority_practice", "start_minority_game", "reveal_minority", "next_minority", "start_roulette", "start_roulette_game", "spin", "next", "finish_no_chips"];
    const expectedHostToken = hostActions.includes(action) ? await hostTokenForPassword() : "";
    if (action === "join") {
      const table = Number(body.table);
      if (!Number.isInteger(table) || table < 1 || table > 30) fail("테이블 번호를 확인해 주세요.");
      let teamToken = token(); const id = crypto.randomUUID();
      const room = await mutate(code, game => {
        if (table > game.settings.tableCount) fail(`테이블 번호 1~${game.settings.tableCount}를 입력해 주세요.`);
        if (game.excludedTables.includes(table)) fail("참여 대상에서 제외된 테이블입니다. 운영자에게 문의해 주세요.");
        const existing = game.teams.find(team => team.table === table);
        if (existing) { teamToken = existing.token; return; }
        if (game.phase !== "lobby") fail("게임이 시작되어 새로운 테이블은 참여할 수 없습니다.");
        game.teams.push({ id, table, name: `${table}번 테이블`, token: teamToken, chips: game.settings.initialChips, cards: [], blackjackStatus: "waiting", blackjackChange: null, bet: null, skipped: false });
      });
      return json({ teamToken, state: publicState(room, teamToken) });
    }
    if (action === "update_settings") {
      const input = body.settings;
      if (!input || typeof input !== "object" || Array.isArray(input)) fail("게임 설정을 확인해 주세요.");
      const data = input as Record<string, unknown>;
      const keys = ["tableCount", "initialChips", "blackjackBonus", "blackjackPenalty", "blackjackRounds", "rouletteSpins"] as const;
      // Existing operator clients may omit the newly introduced setting.
      const hasBlackjackRounds = data.blackjackRounds !== undefined;
      if (data.blackjackRounds === undefined) data.blackjackRounds = 1;
      if (keys.some(key => !Number.isSafeInteger(data[key]))) fail("게임 설정은 정수로 입력해 주세요.");
      const settings = Object.fromEntries(keys.map(key => [key, data[key]])) as Pick<Settings, typeof keys[number]>;
      if (settings.tableCount < 1 || settings.tableCount > 30) fail("테이블 수는 1~30으로 설정해 주세요.");
      if (settings.initialChips < 0 || settings.initialChips > 100000) fail("시작 칩은 0~100000으로 설정해 주세요.");
      // Minority-choice games always start at zero. Ignore old clients' stale
      // starting-balance value while retaining their other submitted settings.
      settings.initialChips = 0;
      if (settings.blackjackBonus < 0 || settings.blackjackBonus > 100000) fail("우승 보너스는 0~100000으로 설정해 주세요.");
      // This field is retained only for old rooms; it must not restrict the
      // initial balance in the new minority-choice game. Legacy settlement
      // already caps any deduction to the available balance.
      if (settings.blackjackPenalty < 0 || settings.blackjackPenalty > 100000) fail("초과 차감 칩은 0~100000으로 설정해 주세요.");
      if (settings.blackjackRounds < 1 || settings.blackjackRounds > 20) fail("블랙잭 턴 수는 1~20으로 설정해 주세요.");
      if (settings.rouletteSpins < 1 || settings.rouletteSpins > 20) fail("룰렛 횟수는 1~20으로 설정해 주세요.");
      const minorityBonus = data.minorityBonus;
      if (minorityBonus !== undefined && (!Number.isSafeInteger(minorityBonus) || (minorityBonus as number) < 0 || (minorityBonus as number) > 100000)) fail("소수 선택 보너스는 0~100000으로 설정해 주세요.");
      let minorityQuestions: MinorityQuestion[] | undefined;
      if (data.minorityQuestions !== undefined) {
        if (!Array.isArray(data.minorityQuestions) || data.minorityQuestions.length < 1 || data.minorityQuestions.length > 20) fail("소수의 선택 문항은 1~20개로 설정해 주세요.");
        minorityQuestions = data.minorityQuestions.map(validateMinorityQuestion);
      }
      const minorityPracticeQuestion = data.minorityPracticeQuestion === undefined ? undefined : validateMinorityQuestion(data.minorityPracticeQuestion);
      if (data.minorityRounds !== undefined && (!Number.isSafeInteger(data.minorityRounds) || (data.minorityRounds as number) < 1 || (data.minorityRounds as number) > 20)) fail("소수의 선택 문항 수는 1~20으로 설정해 주세요.");
      const room = await mutate(code, game => {
        requireHost(body.hostToken, expectedHostToken);
        if (game.phase !== "lobby") fail("게임 시작 전 대기실에서만 설정할 수 있습니다.");
        if (game.teams.some(team => team.table > settings.tableCount)) fail("이미 입장한 테이블 번호보다 작게 설정할 수 없습니다. 해당 테이블을 먼저 제외해 주세요.");
        const questions = minorityQuestions ?? game.settings.minorityQuestions;
        const minorityRounds = data.minorityRounds === undefined ? (minorityQuestions ? minorityQuestions.length : game.settings.minorityRounds) : data.minorityRounds as number;
        if (minorityRounds > questions.length) fail("설정한 문항 수만큼 질문을 입력해 주세요.");
        game.settings = { ...game.settings, ...settings, blackjackRounds: hasBlackjackRounds ? settings.blackjackRounds : game.settings.blackjackRounds, minorityQuestions: questions, minorityPracticeQuestion: minorityPracticeQuestion ?? game.settings.minorityPracticeQuestion, minorityRounds, minorityBonus: minorityBonus === undefined ? game.settings.minorityBonus : minorityBonus as number };
        game.excludedTables = game.excludedTables.filter(table => table <= settings.tableCount);
        for (const team of game.teams) team.chips = settings.initialChips;
      });
      return json({ state: publicState(room, "", true) });
    }
    if (action === "exclude_table" || action === "include_table") {
      const table = body.table;
      if (typeof table !== "number" || !Number.isInteger(table) || table < 1 || table > 30) fail("테이블 번호를 확인해 주세요.");
      const room = await mutate(code, game => {
        requireHost(body.hostToken, expectedHostToken);
        if (game.phase !== "lobby") fail("테이블 불참 설정은 게임 시작 전 대기실에서만 변경할 수 있습니다.");
        if (table > game.settings.tableCount) fail(`테이블 번호 1~${game.settings.tableCount}를 입력해 주세요.`);
        if (action === "exclude_table") {
          if (game.teams.some(team => team.table === table)) fail("이미 입장한 테이블입니다. 팀을 먼저 별도로 제외해 주세요.");
          if (!game.excludedTables.includes(table)) game.excludedTables.push(table);
          game.excludedTables.sort((a, b) => a - b);
        } else {
          game.excludedTables = game.excludedTables.filter(number => number !== table);
        }
      });
      return json({ state: publicState(room, "", true) });
    }
    if (action === "remove_team") {
      const room = await mutate(code, game => {
        requireHost(body.hostToken, expectedHostToken);
        if (!["lobby", "blackjack_tutorial", "blackjack_play", "minority_tutorial", "minority_play", "roulette_tutorial", "roulette_betting"].includes(game.phase)) fail("지금은 테이블을 제외할 수 없습니다.");
        const index = game.teams.findIndex(t => t.id === body.teamId); if (index < 0) fail("테이블을 찾을 수 없습니다.");
        if (game.phase !== "lobby" && game.teams.length < 2) fail("마지막 테이블은 제외할 수 없습니다.");
        game.teams.splice(index, 1);
        for (const entry of game.blackjackHistory ?? []) entry.teams = entry.teams.filter(team => team.id !== body.teamId);
      });
      return json({ state: publicState(room, "", true) });
    }
    if (action === "start_minority") {
      const room = await mutate(code, game => {
        requireHost(body.hostToken, expectedHostToken);
        if (game.phase !== "lobby") fail("이미 게임을 시작했습니다.");
        if (!game.teams.length) fail("참여한 테이블이 없습니다.");
        game.settings.initialChips = 0;
        for (const team of game.teams) team.chips = 0;
        game.minorityRound = 1; game.minorityHistory = []; game.minorityResult = null;
        game.phase = "minority_tutorial";
      });
      return json({ state: publicState(room, "", true) });
    }
    if (action === "start_minority_practice" || action === "start_minority_game" || action === "next_minority") {
      const room = await mutate(code, game => {
        requireHost(body.hostToken, expectedHostToken);
        if (action === "start_minority_practice") {
          if (game.phase !== "minority_tutorial") fail("게임 안내 화면에서 연습을 시작해 주세요.");
          game.minorityPractice = true; game.minorityRound = 0;
        } else if (action === "start_minority_game") {
          if (game.phase !== "minority_tutorial" && !(game.phase === "minority_result" && game.minorityPractice)) fail("안내 또는 연습 결과 화면에서 본 게임을 시작해 주세요.");
          game.minorityPractice = false; game.minorityRound = 1;
        } else {
          if (game.phase !== "minority_result" || game.minorityPractice || (game.minorityRound ?? 1) >= game.settings.minorityRounds) fail("다음 문제가 없습니다.");
          game.minorityRound = (game.minorityRound ?? 1) + 1;
        }
        startMinorityQuestion(game);
      });
      return json({ state: publicState(room, "", true) });
    }
    if (action === "minority_choose") {
      const teamToken = str(body.teamToken);
      const choice = body.choice;
      if (!Number.isInteger(choice) || (choice as number) < 0) fail("선택지를 확인해 주세요.");
      const room = await mutate(code, game => {
        const team = requireTeam(game, teamToken);
        if (game.phase !== "minority_play") fail("지금은 선택할 수 없습니다.");
        if (body.minorityRound !== (game.minorityRound ?? 1)) fail("문제가 변경되었습니다. 화면을 확인하고 다시 선택해 주세요.", 409);
        if (typeof game.minorityDeadline !== "number" || Date.now() >= game.minorityDeadline) fail("선택 시간이 끝났습니다.", 409);
        const question = game.minorityPractice ? game.settings.minorityPracticeQuestion : game.settings.minorityQuestions[(game.minorityRound ?? 1) - 1];
        if (!question || (choice as number) >= question.options.length) fail("선택지를 확인해 주세요.");
        team.minorityChoice = choice as number;
      });
      return json({ state: publicState(room, teamToken) });
    }
    if (action === "reveal_minority") {
      const room = await mutate(code, game => {
        requireHost(body.hostToken, expectedHostToken);
        if (game.phase !== "minority_play") fail("결과를 발표할 문제가 없습니다.");
        if (body.minorityRound !== (game.minorityRound ?? 1)) fail("문제가 변경되었습니다. 화면을 확인해 주세요.", 409);
        const question = game.minorityPractice ? game.settings.minorityPracticeQuestion : game.settings.minorityQuestions[(game.minorityRound ?? 1) - 1];
        if (!question) fail("문제를 찾을 수 없습니다.");
        const result = countMinorityChoices(question.options.length, game.teams.map(team => team.minorityChoice));
        const { winningChoices } = result;
        for (const team of game.teams) {
          const change = team.minorityChoice !== null && team.minorityChoice !== undefined && winningChoices.includes(team.minorityChoice) ? game.settings.minorityBonus : 0;
          team.minorityChange = change; if (!game.minorityPractice) team.chips += change;
        }
        game.minorityResult = result;
        game.minorityResultAt = Date.now(); game.minorityDeadline = null;
        if (!game.minorityPractice) (game.minorityHistory ??= []).push({ round: game.minorityRound ?? 1, question, result: game.minorityResult, teams: game.teams.map(team => ({ id: team.id, table: team.table, choice: team.minorityChoice ?? null, change: team.minorityChange ?? 0, chips: team.chips })) });
        game.phase = "minority_result";
      });
      return json({ state: publicState(room, "", true) });
    }
    if (action === "start_blackjack") {
      const room = await mutate(code, game => {
        requireHost(body.hostToken, expectedHostToken);
        if (game.phase !== "lobby") fail("이미 게임을 시작했습니다.");
        if (!game.teams.length) fail("참여한 테이블이 없습니다.");
        game.phase = "blackjack_tutorial";
      });
      return json({ state: publicState(room, "", true) });
    }
    if (action === "start_blackjack_practice") {
      const room = await mutate(code, game => {
        requireHost(body.hostToken, expectedHostToken);
        if (game.phase !== "blackjack_tutorial") fail("블랙잭 안내 화면에서 연습을 시작해 주세요.");
        if (!game.teams.length) fail("참여한 테이블이 없습니다.");
        game.blackjackPractice = true;
        game.blackjackPracticePlayed = true;
        game.blackjackRound = 0;
        game.blackjackHistory = [];
        dealBlackjack(game);
      });
      return json({ state: publicState(room, "", true) });
    }
    if (action === "start_blackjack_game") {
      const room = await mutate(code, game => {
        requireHost(body.hostToken, expectedHostToken);
        if (game.phase !== "blackjack_tutorial" && !(game.phase === "blackjack_result" && game.blackjackPractice)) fail("연습 결과를 확인한 뒤 본 게임을 시작해 주세요.");
        if (!game.teams.length) fail("참여한 테이블이 없습니다.");
        game.blackjackPractice = false;
        game.blackjackRound = 1;
        game.blackjackHistory = [];
        dealBlackjack(game);
      });
      return json({ state: publicState(room, "", true) });
    }
    if (action === "force_stand") {
      const room = await mutate(code, game => {
        requireHost(body.hostToken, expectedHostToken);
        if (game.phase !== "blackjack_play") fail("블랙잭 진행 중에만 멈출 수 있습니다.");
        requireBlackjackRound(game, body.blackjackRound);
        const team = game.teams.find(t => t.id === body.teamId);
        if (!team) fail("테이블을 찾을 수 없습니다.");
        if (team.blackjackStatus !== "playing") fail("이미 선택을 마친 테이블입니다.");
        team.blackjackStatus = "stand";
      });
      return json({ state: publicState(room, "", true) });
    }
    if (action === "hit" || action === "stand") {
      const teamToken = str(body.teamToken);
      const room = await mutate(code, game => {
        const team = requireTeam(game, teamToken);
        if (game.phase !== "blackjack_play") fail("블랙잭 진행 중이 아닙니다.");
        requireBlackjackRound(game, body.blackjackRound);
        if (team.blackjackStatus !== "playing") fail("이미 선택을 마쳤습니다.");
        if (action === "stand") team.blackjackStatus = "stand";
        else { team.cards.push(card()); const sum = total(team); if (sum > 21) team.blackjackStatus = "bust"; else if (sum === 21) team.blackjackStatus = "stand"; }
      });
      return json({ state: publicState(room, teamToken) });
    }
    if (action === "settle_blackjack") {
      const room = await mutate(code, game => {
        requireHost(body.hostToken, expectedHostToken);
        // An older operator page may submit this after automatic settlement.
        if (game.phase === "blackjack_result") return;
        if (game.phase !== "blackjack_play") fail("블랙잭 진행 중이 아닙니다.");
        if (game.teams.some(t => t.blackjackStatus === "playing")) fail("아직 선택을 마치지 않은 테이블이 있습니다.");
        reconcileBlackjack(game);
      });
      return json({ state: publicState(room, "", true) });
    }
    if (action === "start_roulette") {
      const room = await mutate(code, game => { requireHost(body.hostToken, expectedHostToken); const oldGameComplete = game.phase === "blackjack_result" && !game.blackjackPractice && (game.blackjackRound ?? 1) >= game.settings.blackjackRounds; const minorityComplete = game.phase === "minority_result" && !game.minorityPractice && (game.minorityRound ?? 1) >= game.settings.minorityRounds; if (!oldGameComplete && !minorityComplete) fail("1라운드를 모두 마친 뒤 룰렛을 시작할 수 있습니다."); game.phase = "roulette_tutorial"; });
      return json({ state: publicState(room, "", true) });
    }
    if (action === "start_roulette_game") {
      const room = await mutate(code, game => { requireHost(body.hostToken, expectedHostToken); if (game.phase !== "roulette_tutorial") fail("룰렛 안내 화면에서 게임을 시작해 주세요."); game.phase = "roulette_betting"; });
      return json({ state: publicState(room, "", true) });
    }
    if (action === "finish_no_chips") {
      const room = await mutate(code, game => {
        requireHost(body.hostToken, expectedHostToken);
        if (!["roulette_tutorial", "roulette_betting"].includes(game.phase)) fail("룰렛 준비 단계에서만 최종 결과를 볼 수 있습니다.");
        if (!game.teams.length || game.teams.some(team => team.chips > 0)) fail("칩을 보유한 테이블이 있어 룰렛을 진행해야 합니다.");
        game.phase = "finished";
      });
      return json({ state: publicState(room, "", true) });
    }
    if (action === "bet") {
      const teamToken = str(body.teamToken), amount = body.amount, color = body.color;
      if ((color !== "red" && color !== "black") || !Number.isSafeInteger(amount) || (amount as number) < 1) fail("색과 베팅할 칩을 확인해 주세요.");
      const room = await mutate(code, game => {
        const team = requireTeam(game, teamToken); if (game.phase !== "roulette_betting") fail("이번 베팅은 마감되었습니다.");
        if (team.skipped) fail("베팅 건너뛰기를 취소한 뒤 다시 베팅해 주세요.");
        if ((amount as number) > team.chips) fail("보유 칩보다 많이 베팅할 수 없습니다."); team.bet = { color, amount: amount as number }; team.skipped = false;
      });
      return json({ state: publicState(room, teamToken) });
    }
    if (action === "skip_bet") {
      const teamToken = str(body.teamToken);
      const room = await mutate(code, game => {
        if (!teamToken) requireHost(body.hostToken, expectedHostToken);
        if (game.phase !== "roulette_betting") fail("베팅 진행 중에만 건너뛸 수 있습니다.");
        const team = teamToken ? requireTeam(game, teamToken) : game.teams.find(t => t.id === body.teamId);
        if (!team) fail("테이블을 찾을 수 없습니다.");
        if (team.chips <= 0) fail("칩이 없는 테이블은 이미 관전 중입니다.");
        if (team.bet && !teamToken) fail("이미 베팅한 테이블은 건너뛸 수 없습니다.");
        team.bet = null;
        team.skipped = true;
      });
      return json({ state: publicState(room, teamToken, !teamToken) });
    }
    if (action === "undo_skip") {
      const teamToken = str(body.teamToken);
      const room = await mutate(code, game => {
        if (!teamToken) requireHost(body.hostToken, expectedHostToken);
        if (game.phase !== "roulette_betting") fail("베팅 진행 중에만 건너뛰기를 취소할 수 있습니다.");
        const team = teamToken ? requireTeam(game, teamToken) : game.teams.find(t => t.id === body.teamId);
        if (!team) fail("테이블을 찾을 수 없습니다.");
        if (!team.skipped) fail("건너뛴 테이블이 아닙니다.");
        team.skipped = false;
      });
      return json({ state: publicState(room, teamToken, !teamToken) });
    }
    if (action === "spin") {
      const color: Color = (crypto.getRandomValues(new Uint8Array(1))[0] & 1) === 0 ? "red" : "black";
      const room = await mutate(code, game => {
        requireHost(body.hostToken, expectedHostToken); if (game.phase !== "roulette_betting") fail("이미 룰렛을 돌렸습니다.");
        if (!game.teams.length) fail("참여한 테이블이 없습니다.");
        if (game.teams.some(team => team.chips > 0 && !team.bet && !team.skipped)) fail("아직 베팅하지 않은 테이블이 있습니다.");
        const settled: HistoryTeam[] = [];
        for (const team of game.teams) { if (!team.bet) continue; const change = team.bet.color === color ? team.bet.amount : -team.bet.amount; team.chips += change; settled.push({ id: team.id, name: team.name, table: team.table, color: team.bet.color, amount: team.bet.amount, change, chips: team.chips }); }
        game.history.push({ round: game.round, result: color, teams: settled }); game.result = color; game.rouletteSpinStartedAt = Date.now(); game.phase = "roulette_result";
      });
      return json({ state: publicState(room, "", true) });
    }
    if (action === "next") {
      const room = await mutate(code, game => {
        requireHost(body.hostToken, expectedHostToken); if (game.phase !== "roulette_result") fail("결과를 확인한 뒤 진행할 수 있습니다.");
        if (typeof game.rouletteSpinStartedAt === "number" && Date.now() < game.rouletteSpinStartedAt + ROULETTE_SPIN_MS + ROULETTE_RESULT_HOLD_MS) fail("룰렛 결과 공개가 끝날 때까지 기다려 주세요.");
        if (game.round >= game.settings.rouletteSpins || game.teams.every(team => team.chips === 0)) { game.phase = "finished"; return; }
        game.round += 1; game.phase = "roulette_betting"; game.result = null; game.rouletteSpinStartedAt = null; for (const team of game.teams) { team.bet = null; team.skipped = false; }
      });
      return json({ state: publicState(room, "", true) });
    }
    return fail("알 수 없는 요청입니다.");
  } catch (error) { return handleError(error); }
}
