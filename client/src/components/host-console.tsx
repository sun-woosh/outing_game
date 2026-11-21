/**
 * 운영자 화면 (/host)
 *   게임 진행: 지금 단계와 "다음 단계" 버튼, 테이블 현황
 *   점수 확인: 테이블별 칩, 룰렛 결과
 *   게임 설정: 얼굴 카드 인물(사진), 규칙 숫자, 소수의 선택 질문 (대기실에서만 수정)
 */
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useCountdown } from "../lib/use-countdown";
import FaceScreen from "./face-screen";
import HostFaceEditor from "./host-face-editor";
import { colorLabel, fmt, roundsOf, type Game, type HostAction, type Question, type Settings, type Team, type TeamAction } from "../types";
import "./host-simple.css";

type Props = {
  game: Game; busy: boolean; resultHidden: boolean; hostCooldown: boolean; error: string; notice: string; participantUrl: string; hostToken: string;
  onAction: (action: HostAction) => void;
  onTeamAction: (action: TeamAction, team: Team) => void;
  onTableExclusion: (table: number, exclude: boolean) => void;
  onSettings: (settings: object) => void;
  onFacePeople: (people: { id?: string; name: string; aliases: string[]; photo: string | null }[]) => void;
  onAdjust: (team: Team, delta: number, reason: string) => void;
  onRefresh: () => void; onCopy: () => void; onNewGame: () => void; onLeave: () => void;
};

const PHASE_LABEL: Record<string, string> = {
  lobby: "참여 대기", face_tutorial: "얼굴 카드 안내", face_play: "얼굴 카드 진행 중", face_result: "얼굴 카드 결과",
  minority_tutorial: "소수의 선택 안내", minority_play: "선택 진행 중", minority_result: "선택 결과", minority_summary: "중간 순위 발표",
  roulette_tutorial: "룰렛 안내", roulette_betting: "룰렛 베팅", roulette_result: "룰렛 결과", finished: "게임 종료",
};
const FACE_STAGE: Record<string, string> = { select: "카드 고르는 중", mismatch: "다른 사람 · 다음 차례 준비", name: "이름 맞히는 중", name_result: "이름 정답 공개", done: "종료" };
const blankQuestion = (): Question => ({ question: "", options: ["", ""] });
const readyPeople = (settings: Settings) => (settings.facePeople || []).filter(p => p.name && p.photo).length;
const tables = (teams: Team[]) => teams.map(t => `${t.table}번`).join(", ");

/** 지금 단계에서 눌러야 할 버튼 */
function PhaseAction({ game, busy, resultHidden, hostCooldown, onAction, onNewGame }: Pick<Props, "game" | "busy" | "resultHidden" | "hostCooldown" | "onAction" | "onNewGame">) {
  const R = roundsOf(game);
  const go = (action: HostAction, label: string, disabled = false) => <button className="primary" disabled={busy || disabled} onClick={() => onAction(action)}>{label} →</button>;
  const noTeams = !game.teams.length;
  switch (game.phase) {
    case "lobby": {
      const people = readyPeople(game.settings);
      const intro = "테이블이 입장하면 게임 설명을 보여주세요. 모든 테이블이 입장하지 않아도 시작할 수 있습니다.";
      if (people >= 2) return <>
        <p>{intro} 1라운드는 얼굴 카드 매치({people}명 · 카드 {people * 2}장)입니다.</p>
        {go("start_face", "1라운드 얼굴 카드 매치 안내", noTeams)}
        <button className="host-btn ghost" disabled={busy || noTeams} onClick={() => { if (window.confirm("얼굴 카드를 건너뛰고 소수의 선택부터 시작할까요?")) onAction("start_minority"); }}>얼굴 카드 없이 시작</button>
      </>;
      return <><p>{intro} (얼굴 카드를 하려면 게임 설정에서 인물을 2명 이상 등록하세요.)</p>{go("start_minority", "1라운드 안내 시작", noTeams)}</>;
    }
    case "face_tutorial":
      return <><p>참가자와 빔 화면에 얼굴 카드 규칙을 보여주고 있습니다. 설명이 끝나면 시작하세요. 테이블 번호 순서로 차례가 돌아갑니다.</p>{go("start_face_game", "얼굴 카드 시작")}</>;
    case "face_play": {
      const f = game.face;
      if (!f) return null;
      const cur = game.teams.find(t => t.id === f.currentTeamId);
      return <>
        <p>{cur ? `${cur.table}번 테이블 차례 · ` : ""}{FACE_STAGE[f.stage]} · {f.found} / {f.pairs}쌍 찾음. 시간이 지나면 자동으로 넘어갑니다.</p>
        {go("face_close", f.stage === "select" ? "시간 마감 (카드 자동 선택)" : f.stage === "name" ? "이름 제출 마감하고 채점" : "다음 차례로")}
        <button className="host-btn ghost" disabled={busy} onClick={() => onAction("face_stop")}>{f.stopAfterTurn ? "종료 예약 취소" : "이번 차례 끝나면 얼굴 카드 종료"}</button>
      </>;
    }
    case "face_result":
      return <><p>얼굴 카드가 끝났습니다. 얻은 칩은 그대로 이어집니다.</p>{go("start_minority", `${R.minority}라운드 소수의 선택 안내`)}</>;
    case "minority_tutorial":
      return <><p>참가자와 빔 화면에 게임 방법을 보여주고 있습니다. 연습 결과는 실제 칩에 반영되지 않습니다.</p>{go("start_minority_practice", "연습 질문 시작", noTeams)}</>;
    case "minority_play": {
      const waiting = game.teams.filter(t => !t.minoritySubmitted);
      return <>
        <p>{waiting.length ? `아직 선택하지 않은 테이블: ${tables(waiting)}` : "모든 테이블이 선택했습니다."} 시간이 끝나면 자동으로 결과가 발표됩니다. 미선택 테이블은 점수 변동 없이 넘어갑니다.</p>
        <button className="primary" disabled={busy || noTeams} onClick={() => { if (!waiting.length || window.confirm(`아직 선택하지 않은 ${waiting.length}개 테이블은 점수 변동 없이 넘어갑니다. 결과를 발표할까요?`)) onAction("reveal_minority"); }}>선택 마감하고 결과 발표 →</button>
      </>;
    }
    case "minority_result":
      if (game.minorityPractice) return <><p>연습이 끝났습니다. 실제 칩은 변하지 않았습니다.</p>{go("start_minority_game", "본게임 시작")}</>;
      if (game.minorityRound < game.settings.minorityRounds) return <><p>결과를 확인한 뒤 다음 질문을 시작하세요.</p>{go("next_minority", "다음 질문 시작")}</>;
      return <><p>{R.minority}라운드를 마쳤습니다. 빔에 중간 순위를 보여 준 뒤 룰렛을 진행하세요.</p>{go("minority_summary", "중간 순위 발표")}
        <button className="host-btn ghost" disabled={busy} onClick={() => onAction("start_roulette")}>순위 없이 룰렛 안내로</button></>;
    case "minority_summary":
      return <><p>빔에 지금까지의 순위와 라운드별 획득 칩이 나오고 있습니다.</p>{go("start_roulette", "파이널 라운드(룰렛) 공개")}</>;
    case "roulette_tutorial":
    case "roulette_betting": {
      if (game.teams.length > 0 && game.teams.every(t => t.chips === 0)) return <><p>모든 테이블의 칩이 0이어서 룰렛을 진행할 수 없습니다.</p>{go("finish_no_chips", "최종 결과 보기")}</>;
      if (game.phase === "roulette_tutorial") return <><p>게임 방법을 설명한 뒤 베팅을 시작하세요.</p>{go("start_roulette_game", "룰렛 베팅 시작")}</>;
      const pending = game.teams.filter(t => t.chips > 0 && !t.bet && !t.skipped);
      return <>
        <p>{pending.length ? `아직 베팅하지 않은 테이블: ${tables(pending)}. 베팅 시간이 끝나면 자동으로 이번 판을 건너뜁니다.` : "모든 테이블의 베팅 또는 건너뛰기가 끝났습니다. 룰렛을 돌리세요!"}</p>
        {go("spin", "룰렛 돌리기", !!pending.length || noTeams)}
      </>;
    }
    case "roulette_result": {
      const last = game.round >= game.settings.rouletteSpins || game.teams.every(t => t.chips === 0);
      return <><p>{resultHidden ? "룰렛이 돌아가고 있습니다." : `이번 결과: ${game.result ? colorLabel(game.result) : ""}`}</p>{go("next", hostCooldown ? "결과 공개 중..." : last ? "최종 결과 보기" : "다음 룰렛 시작", resultHidden || hostCooldown)}</>;
    }
    default:
      return <><p>모든 게임이 끝났습니다. 빔에 최종 순위가 나오고 있습니다. 다시 하려면 새 게임을 만드세요(모든 테이블 재입장).</p>
        <button className="host-btn ghost" disabled={busy} onClick={onNewGame}>새 게임 만들기</button></>;
  }
}

/** 타이머가 돌아가는 단계에서: 일시정지 / 재개 / +15초 */
function TimerControls({ game, busy, seconds, onAction }: { game: Game; busy: boolean; seconds: number | null; onAction: (a: HostAction) => void }) {
  const running = (game.phase === "face_play" && game.face?.stage !== "done") || game.phase === "minority_play" || game.phase === "roulette_betting";
  if (!running) return null;
  return <div className="host-timer">
    <span>{game.paused ? "⏸ 일시정지됨" : seconds !== null ? <>남은 시간 <b>{seconds}</b>초</> : game.phase === "roulette_betting" ? "베팅 마감됨" : ""}</span>
    {game.paused
      ? <button className="host-btn ghost" disabled={busy} onClick={() => onAction("resume")}>▶ 재개</button>
      : <button className="host-btn ghost" disabled={busy || seconds === null} onClick={() => onAction("pause")}>⏸ 일시정지</button>}
    <button className="host-btn ghost" disabled={busy} onClick={() => onAction("extend")}>{game.phase === "roulette_betting" && seconds === null && !game.paused ? "베팅 15초 다시 열기" : "+15초"}</button>
  </div>;
}

/** 점수 탭: 테이블 칩 직접 조정 (항의·오류 대응) */
function AdjustChips({ game, busy, onAdjust }: Pick<Props, "game" | "busy" | "onAdjust">) {
  const [teamId, setTeamId] = useState("");
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const team = game.teams.find(t => t.id === teamId);
  const value = Number(delta);
  const submit = () => {
    if (!team || !Number.isInteger(value) || value === 0) return;
    if (!window.confirm(`${team.table}번 테이블 칩을 ${value > 0 ? "+" : ""}${value} 조정할까요?`)) return;
    onAdjust(team, value, reason);
    setDelta(""); setReason("");
  };
  return <section className="host-panel host-adjust">
    <h2>칩 직접 조정</h2>
    <p className="host-subtle">채점 오류나 항의가 있을 때만 사용하세요. 빼려면 앞에 −를 붙입니다 (예: -50). 기록이 남습니다.</p>
    <div className="host-adjust-form">
      <select value={teamId} onChange={e => setTeamId(e.target.value)} aria-label="테이블">
        <option value="">테이블 선택</option>
        {[...game.teams].sort((a, b) => a.table - b.table).map(t => <option key={t.id} value={t.id}>{t.table}번 테이블 ({fmt(t.chips)}칩)</option>)}
      </select>
      <input type="number" inputMode="numeric" placeholder="+50 / -50" value={delta} onChange={e => setDelta(e.target.value)} aria-label="조정할 칩" />
      <input type="text" placeholder="사유 (선택)" maxLength={100} value={reason} onChange={e => setReason(e.target.value)} aria-label="사유" />
      <button className="primary" disabled={busy || !team || !Number.isInteger(value) || value === 0} onClick={submit}>조정 →</button>
    </div>
    {game.adjustments.length > 0 && <ul className="host-adjust-log">{[...game.adjustments].reverse().map((a, i) => <li key={i}><b>{a.table}번</b> {a.delta > 0 ? "+" : ""}{fmt(a.delta)}칩{a.reason ? ` · ${a.reason}` : ""}</li>)}</ul>}
  </section>;
}

function teamStatus(game: Game, team?: Team) {
  if (!team) return "미입장";
  if (game.phase === "lobby" || game.phase.endsWith("_tutorial")) return "입장 완료";
  if (game.phase === "face_play" && game.face?.currentTeamId === team.id) return `차례 · ${fmt(team.chips)}칩`;
  if (game.phase === "minority_play") return team.minoritySubmitted ? "선택 완료" : "선택 대기";
  if (game.phase === "roulette_betting") return team.chips === 0 ? "관전" : team.skipped ? "베팅 안 함" : team.bet ? "베팅 완료" : "베팅 대기";
  return `${fmt(team.chips)}칩`;
}

function QuestionEditor({ title, question, onChange, onRemove, onMoveUp, onMoveDown }: {
  title: string; question: Question; onChange: (update: Partial<Question>) => void;
  // undefined: 버튼 없음, null: 버튼 비활성
  onRemove?: (() => void) | null; onMoveUp?: (() => void) | null; onMoveDown?: (() => void) | null;
}) {
  const q = question;
  const editOption = (index: number, value: string) => onChange({ options: q.options.map((o, i) => (i === index ? value : o)) });
  return <div className="host-question-edit">
    <div className="host-question-title"><strong>{title}</strong>
      <div className="host-question-actions">
        {onMoveUp !== undefined && <button type="button" disabled={!onMoveUp} onClick={onMoveUp ?? undefined}>↑ 위로</button>}
        {onMoveDown !== undefined && <button type="button" disabled={!onMoveDown} onClick={onMoveDown ?? undefined}>↓ 아래로</button>}
        {onRemove !== undefined && <button type="button" disabled={!onRemove} onClick={onRemove ?? undefined}>질문 삭제</button>}
      </div>
    </div>
    <label>질문<input type="text" maxLength={120} value={q.question} onChange={e => onChange({ question: e.target.value })} /></label>
    <div className="host-question-options">{q.options.map((option, index) => <div className="host-option-edit" key={index}>
      <label>선택지 {index + 1}<input type="text" maxLength={80} value={option} onChange={e => editOption(index, e.target.value)} /></label>
      {q.options.length > 2 && <button type="button" onClick={() => onChange({ options: q.options.filter((_, i) => i !== index) })}>삭제</button>}
    </div>)}</div>
    {q.options.length < 6 && <button type="button" className="host-btn ghost host-add-option" onClick={() => onChange({ options: [...q.options, ""] })}>+ 선택지 추가</button>}
  </div>;
}

const NUMBER_FIELDS = [
  ["tableCount", "테이블 수", "1–30개", 1, 30],
  ["faceMatchBonus", "얼굴 카드 · 짝 맞히기", "0–100,000칩", 0, 100000],
  ["faceNameBonus", "얼굴 카드 · 이름 정답", "0–100,000칩", 0, 100000],
  ["faceSelectSeconds", "얼굴 카드 · 카드 선택 시간", "10–120초", 10, 120],
  ["faceNameSeconds", "얼굴 카드 · 이름 입력 시간", "10–120초", 10, 120],
  ["minorityBonus", "소수 선택 보너스", "0–100,000칩", 0, 100000],
  ["minoritySeconds", "소수의 선택 · 선택 시간", "10–120초", 10, 120],
  ["rouletteBetSeconds", "룰렛 · 베팅 시간", "15–300초", 15, 300],
  ["rouletteSpins", "룰렛 횟수", "1–20회", 1, 20],
] as const;
type NumberKey = typeof NUMBER_FIELDS[number][0];

function SettingsPanel({ game, busy, onSettings }: Pick<Props, "game" | "busy" | "onSettings">) {
  const [draft, setDraft] = useState<Settings>(game.settings);
  const [error, setError] = useState("");
  const settingsKey = JSON.stringify(game.settings);
  useEffect(() => { setDraft(game.settings); }, [game.room, settingsKey]);
  const setNumber = (key: NumberKey, value: string) => setDraft(prev => ({ ...prev, [key]: value === "" ? NaN : Number(value) }));
  const setQuestion = (index: number, update: Partial<Question>) => setDraft(prev => ({ ...prev, minorityQuestions: prev.minorityQuestions.map((q, i) => (i === index ? { ...q, ...update } : q)) }));
  const move = (index: number, target: number) => setDraft(prev => {
    const list = [...prev.minorityQuestions];
    [list[index], list[target]] = [list[target], list[index]];
    return { ...prev, minorityQuestions: list };
  });
  const save = () => {
    for (const [key, label, , min, max] of NUMBER_FIELDS) {
      const v = draft[key];
      if (!Number.isInteger(v) || (v as number) < min || (v as number) > max) { setError(`${label}: ${min}~${max} 사이로 입력해 주세요.`); return; }
    }
    const all = [draft.minorityPracticeQuestion, ...draft.minorityQuestions];
    if (!draft.minorityQuestions.length || draft.minorityQuestions.length > 20 || all.some(q => !q.question.trim() || q.options.length < 2 || q.options.some(o => !o.trim()))) {
      setError("연습과 본게임의 질문 및 선택지를 모두 입력해 주세요. 질문은 1~20개, 선택지는 질문마다 2~6개입니다."); return;
    }
    if (game.teams.some(t => t.table > draft.tableCount)) { setError("테이블 수보다 큰 번호가 입장해 있습니다. 먼저 해당 테이블을 제외해 주세요."); return; }
    setError("");
    const clean = (q: Question) => ({ question: q.question.trim(), options: q.options.map(o => o.trim()) });
    const numbers = Object.fromEntries(NUMBER_FIELDS.map(([key]) => [key, draft[key]]));
    onSettings({ ...numbers, minorityRounds: draft.minorityQuestions.length, minorityPracticeQuestion: clean(draft.minorityPracticeQuestion), minorityQuestions: draft.minorityQuestions.map(clean) });
  };
  const questions = draft.minorityQuestions;
  return <section className="host-panel host-settings">
    <div className="host-panel-head"><h2>게임 규칙</h2><span className="host-badge">{game.phase === "lobby" ? "수정 가능" : "게임 시작 후 잠김"}</span></div>
    <p>모든 설정은 게임 시작 전(대기실)에 저장해 주세요. 소수의 선택은 질문 하나가 1회차이고, 질문 하나에 약 1분 걸립니다.</p>
    <fieldset disabled={game.phase !== "lobby" || busy}>
      <div className="host-settings-grid">{NUMBER_FIELDS.map(([key, label, hint, min, max]) =>
        <label key={key}>{label}<small>{hint}</small><input type="number" inputMode="numeric" min={min} max={max} step="1" value={Number.isNaN(draft[key]) ? "" : draft[key] ?? ""} onChange={e => setNumber(key, e.target.value)} /></label>)}
      </div>
      <p className="host-start-chips-note">모든 테이블은 0칩으로 시작합니다. 얼굴 카드와 소수의 선택에서 얻은 칩으로 룰렛에 참여합니다.</p>
      <div className="host-question-editor">
        <div className="host-panel-head"><h2>소수의 선택 질문</h2><span className="host-subtle">본게임 {questions.length}개 질문</span></div>
        <QuestionEditor title="연습 질문" question={draft.minorityPracticeQuestion} onChange={u => setDraft(prev => ({ ...prev, minorityPracticeQuestion: { ...prev.minorityPracticeQuestion, ...u } }))} />
        {questions.map((q, i) => <QuestionEditor key={i} title={`${i + 1}번째 질문`} question={q} onChange={u => setQuestion(i, u)}
          onRemove={questions.length > 1 ? () => setDraft(prev => ({ ...prev, minorityQuestions: prev.minorityQuestions.filter((_, j) => j !== i) })) : null}
          onMoveUp={i > 0 ? () => move(i, i - 1) : null}
          onMoveDown={i < questions.length - 1 ? () => move(i, i + 1) : null} />)}
        <button type="button" className="host-btn ghost" disabled={questions.length >= 20} onClick={() => setDraft(prev => ({ ...prev, minorityQuestions: [...prev.minorityQuestions, blankQuestion()] }))}>+ 질문 추가</button>
      </div>
      {error && <p className="message error" role="alert">{error}</p>}
      <button className="primary" type="button" onClick={save}>설정 저장 →</button>
    </fieldset>
  </section>;
}

export default function HostConsole(props: Props) {
  const { game, busy, resultHidden, hostCooldown, error, notice, participantUrl, hostToken, onAction, onTeamAction, onTableExclusion, onFacePeople, onAdjust, onRefresh, onCopy, onNewGame, onLeave } = props;
  const R = roundsOf(game);
  const settings = game.settings;
  const [tab, setTab] = useState<"play" | "scores" | "settings">("play");
  const minoritySeconds = useCountdown(game.phase === "minority_play" ? game.minorityDeadline : null, game.serverTime);
  const pausedSeconds = game.paused ? Math.ceil(game.paused.remaining / 1000) : null;
  const faceSeconds = useCountdown(game.phase === "face_play" ? game.face?.deadline : null, game.serverTime) ?? pausedSeconds;
  const betSeconds = useCountdown(game.phase === "roulette_betting" ? game.rouletteDeadline : null, game.serverTime);
  const timerSeconds = game.paused ? pausedSeconds : game.phase === "face_play" ? faceSeconds : game.phase === "minority_play" ? minoritySeconds : betSeconds;
  const excluded = game.excludedTables;
  const eligible = settings.tableCount - excluded.length;
  const sorted = [...game.teams].sort((a, b) => b.chips - a.chips || a.table - b.table);
  const question = game.minorityPractice ? settings.minorityPracticeQuestion : settings.minorityQuestions[game.minorityRound - 1];
  const canManage = !["roulette_result", "finished"].includes(game.phase);
  const phaseLabel = game.phase === "roulette_result" && resultHidden ? "룰렛 회전 중" : PHASE_LABEL[game.phase];
  const roundLine = game.phase.startsWith("face_") ? `${R.face}라운드 · 얼굴 카드 매치${game.face ? ` · ${game.face.found} / ${game.face.pairs}쌍` : ""}`
    : game.phase.startsWith("minority_") && game.phase !== "minority_tutorial" ? (game.minorityPractice ? `${R.minority}라운드 · 연습 질문` : `${R.minority}라운드 · ${game.minorityRound} / ${settings.minorityRounds}번째 질문`)
    : game.phase.startsWith("roulette_") && game.phase !== "roulette_tutorial" ? `파이널 라운드 · 룰렛 ${game.round} / ${settings.rouletteSpins}회` : null;
  const TABS = [["play", "게임 진행"], ["scores", "점수 확인"], ["settings", "게임 설정"]] as const;

  return <main className="host-app host-simple">
    <header className="host-topbar">
      <div className="host-brand"><span className="brand-mark">✦</span><div><strong>DT OUTING <b>2026</b></strong><small>MACAU GAME CONTROL</small></div></div>
      <div className="host-top-actions"><a className="host-btn ghost" href="/beam" target="_blank" rel="noreferrer">빔 화면 열기 ↗</a><button className="host-btn ghost" disabled={busy} onClick={onLeave}>로그아웃</button></div>
    </header>
    <div className="host-layout">
      <aside className="host-sidebar"><div className="host-side-label">운영자 메뉴</div>
        <nav aria-label="운영자 메뉴">{TABS.map(([id, label]) => <button key={id} className={tab === id ? "active" : ""} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}>{label}</button>)}</nav>
      </aside>
      <div className="host-main">
        <div className="host-page-head">
          <div><div className="card-kicker">DT OUTING 2026</div><h1>{TABS.find(([id]) => id === tab)?.[1]}</h1>
            <p>{tab === "play" ? "아래 버튼을 눌러 순서대로 진행하세요." : tab === "settings" ? "게임 시작 전 사진, 질문, 규칙을 설정하세요." : "테이블별 보유 칩을 확인하세요."}</p></div>
          {tab === "settings" && <button className="host-btn ghost" disabled={busy} onClick={onNewGame}>새 게임 만들기</button>}
        </div>
        {(error || notice) && <p className={`message ${error ? "error" : "success"}`} role={error ? "alert" : "status"}>{error || notice}</p>}

        {tab === "play" && <>
          <section className="host-panel host-current">
            <div className="host-current-top"><span className="host-badge">현재 단계</span><span>{game.teams.length} / {eligible}개 테이블 입장</span></div>
            <h2>{phaseLabel}</h2>
            {roundLine && <p className="host-current-round">{roundLine}</p>}
            {question && (game.phase === "minority_play" || game.phase === "minority_result") && <div className="host-question">
              <strong>{question.question}</strong><span>{question.options.join(" / ")}</span>
              {game.phase === "minority_play" && <b>{game.teams.filter(t => t.minoritySubmitted).length} / {game.teams.length} 테이블 선택 완료{minoritySeconds !== null ? ` · 남은 시간 ${minoritySeconds}초` : ""}</b>}
              {game.phase === "minority_result" && game.minorityResult && <>
                <b>선택 수: {question.options.map((o, i) => `${o} ${game.minorityResult?.counts[i] ?? 0}팀`).join(" · ")}</b>
                <b>{game.minorityResult.winningChoices.length ? `소수 선택: ${game.minorityResult.winningChoices.map(i => question.options[i]).join(", ")}` : "소수 선택 없음 · 점수 변동 없음"}</b>
              </>}
            </div>}
            <TimerControls game={game} busy={busy} seconds={timerSeconds} onAction={onAction} />
            <div className="host-next"><PhaseAction game={game} busy={busy} resultHidden={resultHidden} hostCooldown={hostCooldown} onAction={onAction} onNewGame={onNewGame} /></div>
          </section>
          {(game.phase === "finished" || game.phase === "minority_summary") && <section className="host-panel"><h2>{game.phase === "finished" ? "최종 순위" : "중간 순위"}</h2>
            <div className="host-score-list">{sorted.map(t => <div className="host-score-row" key={t.id}><span className="host-score-rank">{sorted.findIndex(o => o.chips === t.chips) + 1}위</span><strong>{t.table}번 테이블</strong><b>{fmt(t.chips)}칩</b></div>)}</div>
          </section>}
          {(game.phase === "face_play" || game.phase === "face_result") && <section className="host-panel host-face-live"><FaceScreen game={game} view="host" busy={busy} seconds={faceSeconds} /></section>}
          {game.phase === "minority_result" && <section className="host-panel host-simple-results">
            <h2>{game.minorityPractice ? "연습 결과 · 실제 칩에 미반영" : "이번 질문 결과"}</h2>
            <div className="host-score-list">{sorted.map(t => <div className="host-score-row" key={t.id}><strong>{t.table}번 테이블</strong><span>{t.minoritySubmitted ? "선택 완료" : "미선택"}</span><span>이번 질문 {(t.minorityChange ?? 0) > 0 ? "+" : ""}{fmt(t.minorityChange)}칩</span><b>{fmt(t.chips)}칩</b></div>)}</div>
          </section>}
          <section className="host-panel host-tables">
            <div className="host-panel-head"><div><h2>테이블 현황</h2><p className="host-table-help">{game.phase === "lobby" ? "참여하지 않는 테이블은 불참 처리할 수 있습니다." : "각 테이블의 참여 상태를 확인하세요."}</p></div>
              <span className="host-subtle">{game.teams.length} / {eligible} 입장{excluded.length > 0 && ` · 불참 ${excluded.length}`}</span></div>
            <div className="host-table-grid">{Array.from({ length: settings.tableCount }, (_, i) => i + 1).map(number => {
              const team = game.teams.find(t => t.table === number);
              const absent = excluded.includes(number);
              return <div key={number} className={`host-table-tile ${team ? "joined" : ""} ${absent ? "absent" : ""}`}>
                <div><strong>{number}번 테이블</strong><small>{absent ? "불참" : teamStatus(game, team)}</small></div>
                {!team && game.phase === "lobby" && <div className="host-tile-actions"><button disabled={busy} onClick={() => onTableExclusion(number, !absent)}>{absent ? "불참 복구" : "불참 처리"}</button></div>}
                {team && canManage && <div className="host-tile-actions">
                  {game.phase === "roulette_betting" && team.chips > 0 && !team.bet && (team.skipped
                    ? <button disabled={busy} onClick={() => onTeamAction("undo_skip", team)}>건너뛰기 취소</button>
                    : <button disabled={busy} onClick={() => onTeamAction("skip_bet", team)}>베팅 건너뛰기</button>)}
                  <button disabled={busy || (game.phase !== "lobby" && game.teams.length < 2)} onClick={() => onTeamAction("remove_team", team)}>제외</button>
                </div>}
              </div>;
            })}</div>
          </section>
          {game.phase === "lobby" && <details className="host-panel host-invite-simple"><summary>참가 링크와 QR 코드 보기</summary>
            <div className="host-invite-body"><div className="host-qr"><QRCodeSVG value={participantUrl} size={150} level="M" marginSize={4} title="참여 QR 코드" /></div>
              <div><p>참가자가 QR 코드를 스캔해 테이블 번호로 입장합니다.</p><button className="host-btn ghost" onClick={onCopy}>참가 링크 복사</button></div></div>
          </details>}
        </>}

        {tab === "scores" && <>
          <section className="host-panel"><h2>{game.phase === "finished" ? "최종 순위" : "현재 순위"}</h2>
            {resultHidden ? <p className="empty" role="status">결과 공개 중</p> : sorted.length
              ? <div className="host-score-list">{sorted.map(t => <div className="host-score-row" key={t.id}><span className="host-score-rank">{sorted.findIndex(o => o.chips === t.chips) + 1}위</span><strong>{t.table}번 테이블</strong><b>{fmt(t.chips)}칩</b></div>)}</div>
              : <p className="empty">입장한 테이블이 없습니다.</p>}
          </section>
          <AdjustChips game={game} busy={busy} onAdjust={onAdjust} />
          <section className="host-panel host-history"><h2>룰렛 결과</h2>
            {resultHidden ? <p className="empty">결과 공개 중</p> : game.history.length
              ? [...game.history].reverse().map(h => <div className="host-history-row" key={h.round}><strong>{h.round}회차</strong><span className={h.result === "red" ? "host-red" : ""}>● {colorLabel(h.result)}</span><small>{h.teams.length}개 테이블 베팅</small></div>)
              : <p className="empty">아직 진행된 룰렛이 없습니다.</p>}
          </section>
        </>}

        {tab === "settings" && <>
          <HostFaceEditor people={settings.facePeople || []} hostToken={hostToken} locked={game.phase !== "lobby"} busy={busy} onSave={onFacePeople} onImported={onRefresh} />
          <SettingsPanel game={game} busy={busy} onSettings={props.onSettings} />
        </>}
        <footer><span>DT OUTING 2026 <b>✦</b> MACAU</span></footer>
      </div>
    </div>
  </main>;
}
