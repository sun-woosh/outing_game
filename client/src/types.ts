/** 서버(server/game.ts의 publicState)가 보내 주는 게임 상태 */
import type { FaceView } from "./components/face-screen";

export type Color = "red" | "black";
export type Phase =
  | "lobby"
  | "face_tutorial" | "face_play" | "face_result"
  | "minority_tutorial" | "minority_play" | "minority_result" | "minority_summary"
  | "roulette_tutorial" | "roulette_betting" | "roulette_result"
  | "finished";

export type Question = { question: string; options: string[] };
export type FacePerson = { id: string; name: string; aliases: string[]; photo: string | null };

export type Settings = {
  tableCount: number;
  rouletteSpins: number;
  minorityRounds: number;
  minorityBonus: number;
  minoritySeconds: number;
  rouletteBetSeconds: number;
  minorityQuestions: Question[];
  minorityPracticeQuestion: Question;
  facePeople?: FacePerson[]; // 운영자에게만 옴
  facePeopleCount?: number; // 참가자·빔에게는 인원수만
  faceMatchBonus?: number;
  faceNameBonus?: number;
  faceSelectSeconds?: number;
  faceNameSeconds?: number;
};

export type Team = {
  id: string; name: string; table: number; chips: number;
  faceChange?: number; minorityTotal?: number; adjustTotal?: number;
  minorityChoice?: number | null; minoritySubmitted?: boolean; minorityChange?: number | null;
  skipped?: boolean;
  bet: { placed: true; color?: Color; amount?: number } | null;
};

type RouletteEntry = { id: string; table: number; name: string; color: Color; amount: number; change: number; chips: number };
type MinorityResult = { counts: number[]; winningChoices: number[]; outcome: "minority" | "tie" | "none" };

export type Game = {
  room: string;
  phase: Phase;
  stage: 1 | 2;
  rounds: { face: number | null; minority: number; roulette: number };
  serverTime: number;
  settings: Settings;
  excludedTables: number[];
  face: FaceView | null;
  minorityRound: number;
  minorityPractice: boolean;
  minorityDeadline: number | null;
  minorityResult: MinorityResult | null;
  paused: { remaining: number } | null;
  adjustments: { table: number; delta: number; reason: string; at: number }[];
  round: number;
  result: Color | null;
  rouletteDeadline: number | null;
  rouletteSpinStartedAt: number | null;
  history: { round: number; result: Color; teams: RouletteEntry[] }[];
  teams: Team[];
  myTeamId: string | null;
};

export type HostAction =
  | "start_face" | "start_face_game" | "face_close" | "face_stop"
  | "start_minority" | "start_minority_practice" | "start_minority_game" | "reveal_minority" | "next_minority" | "minority_summary"
  | "pause" | "resume" | "extend"
  | "start_roulette" | "start_roulette_game" | "finish_no_chips" | "spin" | "next";
export type TeamAction = "remove_team" | "skip_bet" | "undo_skip";

export const fmt = (n: number | null | undefined) => (n || 0).toLocaleString("ko-KR");
export const teamName = (team: Team) => `${team.table}번 테이블`;
export const colorLabel = (color: Color) => (color === "red" ? "RED" : "BLACK");
/** 라운드별 획득 칩. 룰렛 손익 = 현재 칩 - 나머지 */
export function chipBreakdown(team: Team) {
  const face = team.faceChange ?? 0, minority = team.minorityTotal ?? 0, adjust = team.adjustTotal ?? 0;
  return { face, minority, adjust, roulette: team.chips - face - minority - adjust };
}
/** 칩 순위 (동점은 같은 순위) */
export function ranked(teams: Team[]) {
  const sorted = [...teams].sort((a, b) => b.chips - a.chips || a.table - b.table);
  return sorted.map(team => ({ team, rank: sorted.findIndex(t => t.chips === team.chips) + 1 }));
}
export const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmt(Math.abs(n))}`;
export const roundsOf = (game: Game | null) => game?.rounds ?? { face: null, minority: 1, roulette: 2 };
