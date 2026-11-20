"use client";

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { Settings } from "../components/host-console";
import GameTutorial from "../components/game-tutorial";
import Wheel from "../components/roulette-wheel";
import BlackjackCountdown, { useBlackjackSeconds } from "../components/blackjack-countdown";
import Cards from "../components/playing-cards";
import MinorityScreen from "../components/minority-screen";
import { DOCUMENT_MINORITIES, DEFAULT_PRACTICE_QUESTION } from "../lib/minority-questions";
import type { Card } from "../lib/cards";
import "./blackjack-result.css";
import "./roulette-stage.css";
import "./beam.css";
import "./participant.css";
import { ROULETTE_RESULT_HOLD_MS, ROULETTE_SPIN_MS } from "../lib/roulette-timing";

const HostConsole = lazy(() => import("../components/host-console"));
const HostSimulation = lazy(() => import("../components/host-simulation"));

type Color = "red" | "black";
type Team = { id: string; name: string; table: number; chips: number; minorityChoice?: number | null; minoritySubmitted?: boolean; minorityChange?: number | null; practiceChips?: number | null; cards: Card[]; total: number | null; blackjackStatus: "waiting" | "playing" | "stand" | "bust"; blackjackChange: number | null; skipped?: boolean; bet: { color: Color; amount: number } | null };
type Entry = { id: string; table: number; name: string; color: Color; amount: number; change: number; chips: number };
type Phase = "lobby" | "minority_tutorial" | "minority_play" | "minority_result" | "blackjack_tutorial" | "roulette_tutorial" | "blackjack_play" | "blackjack_ready" | "blackjack_result" | "roulette_betting" | "roulette_result" | "finished";
type Game = { minorityPractice?: boolean; minorityRound?: number; minorityDeadline?: number | null; minorityResult?: { counts: number[]; winningChoices: number[]; outcome: "minority" | "tie" | "none" } | null; blackjackPractice?: boolean; blackjackRound?: number; blackjackResultAt?: number | null; blackjackDeadline?: number | null; rouletteSpinStartedAt?: number | null; serverTime?: number; settings: Settings; excludedTables: number[]; room: string; stage: 1 | 2; round: number; phase: Phase; result: Color | null; teams: Team[]; history: { round: number; result: Color; teams: Entry[] }[]; myTeamId?: string };
type Session = { room: string; token: string; role: "host" | "team" | "beam" };

const defaultSettings: Settings = { tableCount: 14, initialChips: 0, blackjackBonus: 100, blackjackPenalty: 50, blackjackRounds: 1, rouletteSpins: 3, minorityBonus: 100, minorityRounds: DOCUMENT_MINORITIES.length, minorityPracticeQuestion: DEFAULT_PRACTICE_QUESTION, minorityQuestions: DOCUMENT_MINORITIES };
const colorName = (color: Color) => color === "red" ? "빨강" : "검정";
const resultColorName = (color: Color) => color === "red" ? "RED" : "BLACK";
const fmt = (n: number) => (n || 0).toLocaleString("ko-KR");
const teamName = (team: Team) => team.table ? `${team.table}번 테이블` : team.name;
const statusName = (team: Team) => team.blackjackStatus === "bust" ? "21 초과" : team.blackjackStatus === "stand" ? "멈춤" : team.blackjackStatus === "waiting" ? "대기 중" : "진행 중";

async function post(data: object) {
  const response = await fetch("/api/game", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  const result: any = await response.json();
  if (!response.ok) throw new Error(result.error || "요청을 처리하지 못했어요. 다시 시도해 주세요.");
  return result;
}

function App() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [mode, setMode] = useState<"host" | "team" | "beam">("team");
  const [room, setRoom] = useState("");
  const [activeKnown, setActiveKnown] = useState(false);
  const [hostAuth, setHostAuth] = useState("");
  const [noGameSimulation, setNoGameSimulation] = useState(false);
  const [password, setPassword] = useState("");
  const [table, setTable] = useState("");
  const [activeSettings, setActiveSettings] = useState<Settings>(defaultSettings);
  const [activeExcluded, setActiveExcluded] = useState<number[]>([]);
  const [color, setColor] = useState<Color | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [spinPending, setSpinPending] = useState(false);
  const [, refreshSpinClock] = useState(0);
  const mutationInFlight = useRef(false);
  const mutationEpoch = useRef(0);
  const pollSequence = useRef(0);
  const appliedPoll = useRef(0);
  const pollHadError = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const path = window.location.pathname.replace(/\/$/, "");
    const nextMode = path === "/beam" || params.get("beam") === "1" ? "beam" : path === "/host" || params.get("host") === "1" ? "host" : "team";
    setMode(nextMode);
    if (nextMode === "team") {
      const saved = localStorage.getItem("dt-outing-team-v2");
      if (saved) { try { const existing: Session = JSON.parse(saved); if (existing.role === "team") setSession(existing); } catch { /* ignore invalid session */ } }
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    let loading = false;
    let controller: AbortController | null = null;
    const load = async () => {
      if (loading || mutationInFlight.current) return;
      loading = true;
      const requestController = new AbortController();
      controller = requestController;
      const timeout = window.setTimeout(() => requestController.abort(), 10000);
      const epoch = mutationEpoch.current;
      const sequence = ++pollSequence.current;
      try {
        const response = await fetch("/api/game?active=1", { cache: "no-store", signal: requestController.signal, headers: session?.role === "team" ? { "x-team-token": session.token } : session?.role === "host" ? { "x-host-token": session.token } : {} });
        const data: any = await response.json();
        if (!response.ok) throw new Error(data.error || "게임을 불러오지 못했어요.");
        if (!active || mutationInFlight.current || mutationEpoch.current !== epoch || sequence <= appliedPoll.current) return;
        appliedPoll.current = sequence;
        const current: Game | null = data.state;
        setActiveKnown(true);
        setRoom(current?.room || "");
        if (current?.settings) setActiveSettings(current.settings);
        setActiveExcluded(current?.excludedTables || []);
        if (!current) {
          setGame(null);
          if (session?.role === "team") { localStorage.removeItem("dt-outing-team-v2"); setSession(null); }
          if (session?.role === "beam") setSession(null);
        } else if (session?.role === "host" && session.room !== current.room) {
          setSession(null); setHostAuth(""); setGame(null); setNotice("새 게임이 시작되었습니다. 운영자 비밀번호로 다시 로그인해 주세요.");
        } else if (session?.role === "team" && session.room !== current.room) {
          localStorage.removeItem("dt-outing-team-v2"); setSession(null); setGame(null); setNotice("새 게임이 시작되었습니다. 테이블 번호로 다시 입장해 주세요.");
        } else if (mode === "beam") {
          if (!session || session.room !== current.room) setSession({ room: current.room, token: "", role: "beam" });
          setGame(current);
        } else if (session) setGame(current);
        if (pollHadError.current) { pollHadError.current = false; setError(""); }
      } catch (e) { if (active && !mutationInFlight.current && mutationEpoch.current === epoch && sequence > appliedPoll.current) { appliedPoll.current = sequence; setActiveKnown(true); pollHadError.current = true; setError(requestController.signal.aborted ? "연결이 지연되고 있어요. 다시 확인합니다." : e instanceof Error ? e.message : "연결을 확인해 주세요."); } }
      finally { clearTimeout(timeout); if (controller === requestController) controller = null; loading = false; }
    };
    load(); const timer = setInterval(load, 1500);
    const onVisibilityChange = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    // Refresh exactly as the five-second result display ends, without waiting
    // for the ordinary polling interval on every participant device.
    const transitionDelay = game?.phase === "blackjack_result" && !game.blackjackPractice && (game.blackjackRound ?? 1) < (game.settings.blackjackRounds ?? 1) && typeof game.blackjackResultAt === "number" && typeof game.serverTime === "number" ? Math.max(0, game.blackjackResultAt + 5000 - game.serverTime) + 30 : null;
    const transitionTimer = transitionDelay === null ? null : window.setTimeout(load, transitionDelay);
    return () => { active = false; controller?.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", onVisibilityChange); if (transitionTimer !== null) clearTimeout(transitionTimer); };
  }, [ready, session, mode, game?.room, game?.phase, game?.blackjackPractice, game?.blackjackRound, game?.blackjackResultAt]);

  useEffect(() => { setColor(null); setAmount(""); setNotice(current => current === "베팅했어요! 룰렛이 돌기 전까지 변경할 수 있습니다." ? "" : current); }, [game?.room, game?.stage, game?.round]);

  // Anchor each wheel to the server's spin time once, so polling does not
  // restart it and reconnecting screens join at the same point in the spin.
  const spinClock = useMemo(() => {
    if (game?.phase !== "roulette_result" || typeof game.rouletteSpinStartedAt !== "number") return null;
    const initialElapsed = Math.max(0, Math.min(ROULETTE_SPIN_MS + ROULETTE_RESULT_HOLD_MS, (game.serverTime ?? Date.now()) - game.rouletteSpinStartedAt));
    return { localStart: Date.now() - initialElapsed, initialElapsed };
  }, [game?.room, game?.round, game?.phase, game?.rouletteSpinStartedAt]);
  useEffect(() => {
    if (!spinClock) return;
    const elapsed = Date.now() - spinClock.localStart;
    const timers = [ROULETTE_SPIN_MS, ROULETTE_SPIN_MS + ROULETTE_RESULT_HOLD_MS].filter(at => at > elapsed).map(at => window.setTimeout(() => refreshSpinClock(n => n + 1), at - elapsed));
    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [spinClock]);

  const saveSession = (next: Session) => { localStorage.setItem(next.role === "host" ? "dt-outing-host-v2" : "dt-outing-team-v2", JSON.stringify(next)); setSession(next); setError(""); };
  const act = async (fn: () => Promise<void>) => { if (mutationInFlight.current) return; mutationInFlight.current = true; mutationEpoch.current += 1; pollHadError.current = false; setBusy(true); setError(""); setNotice(""); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "다시 시도해 주세요."); } finally { mutationInFlight.current = false; setBusy(false); } };
  const login = () => act(async () => {
    if (!password) throw new Error("운영자 비밀번호를 입력해 주세요.");
    const data = await post({ action: "host_login", password });
    setPassword(""); setHostAuth(data.hostToken);
    if (data.room) { saveSession({ room: data.room, token: data.hostToken, role: "host" }); setRoom(data.room); setGame(data.state); }
  });
  const create = () => act(async () => {
    if (!hostAuth) throw new Error("운영자 비밀번호로 로그인해 주세요.");
    if (room && !window.confirm("새 게임을 시작하면 현재 게임이 중단되고 모든 테이블이 다시 입장해야 합니다. 계속할까요?")) return;
    const data = await post({ action: "create", hostToken: hostAuth });
    setHostAuth(data.hostToken); saveSession({ room: data.room, token: data.hostToken, role: "host" }); setRoom(data.room); setGame(data.state);
  });
  const join = () => act(async () => {
    if (!room) throw new Error("운영자가 게임을 준비 중입니다. 잠시 후 다시 시도해 주세요.");
    if (!Number.isInteger(Number(table)) || Number(table) < 1 || Number(table) > activeSettings.tableCount) throw new Error(`1부터 ${activeSettings.tableCount} 사이의 테이블 번호를 입력해 주세요.`);
    if (activeExcluded.includes(Number(table))) throw new Error(`${Number(table)}번 테이블은 불참 처리되었습니다. 운영자에게 확인해 주세요.`);
    const data = await post({ action: "join", table: Number(table) });
    saveSession({ room: data.state.room, token: data.teamToken, role: "team" }); setRoom(data.state.room); setGame(data.state);
  });
  const teamAction = (action: "hit" | "stand" | "bet" | "skip_bet" | "undo_skip") => act(async () => {
    if (!session) return;
    if (action === "bet" && (!color || !Number.isInteger(Number(amount)) || Number(amount) < 1)) throw new Error("색과 베팅할 칩을 선택해 주세요.");
    const data = await post({ action, room: session.room, teamToken: session.token, ...(action === "bet" ? { color, amount: Number(amount) } : { blackjackRound: game?.blackjackRound ?? 1 }) });
    if (data.state) setGame(data.state); if (action === "bet") setNotice("베팅했어요! 룰렛이 돌기 전까지 변경할 수 있습니다."); if (action === "skip_bet" || action === "undo_skip") { setColor(null); setAmount(""); }
  });
  const chooseMinority = (choice: number) => act(async () => {
    if (!session || !game) return;
    const data = await post({ action: "minority_choose", room: session.room, teamToken: session.token, minorityRound: game.minorityRound ?? 1, choice });
    if (data.state) setGame(data.state);
  });
  const hostAction = (action: "start_minority" | "start_minority_practice" | "start_minority_game" | "reveal_minority" | "next_minority" | "start_blackjack" | "start_blackjack_practice" | "start_blackjack_game" | "settle_blackjack" | "start_roulette" | "start_roulette_game" | "finish_no_chips" | "spin" | "next") => act(async () => {
    if (!session) return;
    if (action === "spin") setSpinPending(true);
    try { const data = await post({ action, room: session.room, hostToken: session.token, ...(action === "reveal_minority" ? { minorityRound: game?.minorityRound ?? 1 } : {}) }); if (data.state) setGame(data.state); }
    finally { if (action === "spin") setSpinPending(false); }
  });
  const removeTeam = (team: Team) => act(async () => {
    if (!session || !window.confirm(`${teamName(team)}을(를) 게임에서 제외할까요? 제외하면 이 게임의 기록과 칩이 삭제됩니다.`)) return;
    const data = await post({ action: "remove_team", room: session.room, hostToken: session.token, teamId: team.id }); if (data.state) setGame(data.state);
  });
  const manageTeam = (action: "remove_team" | "force_stand" | "skip_bet" | "undo_skip", team: Team) => {
    if (action === "remove_team") { removeTeam(team); return; }
    const prompts = { force_stand: "현재 카드로 멈춤 처리할까요?", skip_bet: "이번 룰렛 베팅을 건너뛸까요? 칩은 유지되며 취소하기 전까지 이 테이블은 베팅할 수 없습니다.", undo_skip: "베팅 건너뛰기를 취소하고 다시 베팅할 수 있게 할까요?" };
    void act(async () => { if (!session || !window.confirm(`${teamName(team)}: ${prompts[action]}`)) return; const data = await post({ action, room: session.room, hostToken: session.token, teamId: team.id, ...(action === "force_stand" ? { blackjackRound: game?.blackjackRound ?? 1 } : {}) }); if (data.state) setGame(data.state); });
  };
  const setTableExclusion = (table: number, exclude: boolean) => act(async () => { if (!session) return; const data = await post({ action: exclude ? "exclude_table" : "include_table", room: session.room, hostToken: session.token, table }); if (data.state) setGame(data.state); setNotice(`${table}번 테이블을 ${exclude ? "불참 처리" : "참여 가능으로 변경"}했습니다.`); });
  const saveSettings = (settings: Settings) => act(async () => { if (!session) return; const data = await post({ action: "update_settings", room: session.room, hostToken: session.token, settings }); if (data.state) { setGame(data.state); setActiveSettings(data.state.settings); } setNotice("설정을 저장했습니다."); });
  const leave = () => { if (!session || mutationInFlight.current) return; if (session.role === "host" && !window.confirm("운영 화면에서 로그아웃할까요? 게임은 계속 진행됩니다.")) return; localStorage.removeItem(session.role === "host" ? "dt-outing-host-v2" : "dt-outing-team-v2"); setSession(null); setHostAuth(""); setGame(null); setError(""); setNotice(""); setColor(null); setAmount(""); };
  const participantUrl = typeof window !== "undefined" ? `${window.location.origin}/` : "";
  const beamUrl = "/beam";
  const copyLink = async () => { try { await navigator.clipboard.writeText(participantUrl); setNotice("참여 링크를 복사했어요. 팀에 공유해 주세요."); } catch { setNotice(`참여 링크: ${participantUrl}`); } };
  const blackjackSeconds = useBlackjackSeconds(game?.phase === "blackjack_play" ? game.blackjackDeadline : null, game?.serverTime);
  const minoritySeconds = useBlackjackSeconds(game?.phase === "minority_play" ? game.minorityDeadline : null, game?.serverTime);
  const nextBlackjackTurn = game?.phase === "blackjack_result" && !game.blackjackPractice && (game.blackjackRound ?? 1) < (game.settings.blackjackRounds ?? 1);
  const nextTurnSeconds = useBlackjackSeconds(nextBlackjackTurn && typeof game?.blackjackResultAt === "number" ? game.blackjackResultAt + 5000 : null, game?.serverTime);
  const myTeam = game?.teams.find(t => t.id === game.myTeamId);
  const resultChips = (team: Team) => game?.blackjackPractice && game.phase === "blackjack_result" ? (team.practiceChips ?? team.chips) : team.chips;
  const ranking = [...(game?.teams || [])].sort((a, b) => resultChips(b) - resultChips(a) || (a.table || 0) - (b.table || 0));
  const betCount = game?.teams.filter(t => t.bet).length || 0;
  const eligibleCount = game?.teams.filter(t => t.chips > 0).length || 0;
  const missingCount = game?.teams.filter(t => t.chips > 0 && !t.bet && !t.skipped).length || 0;
  const playingCount = game?.teams.filter(t => t.blackjackStatus === "playing").length || 0;
  const lastHistory = game?.history?.find(h => h.round === game.round);
  const myRoundResult = myTeam ? lastHistory?.teams.find(entry => entry.id === myTeam.id) : undefined;
  const stageOne = game && ["lobby", "minority_tutorial", "minority_play", "minority_result", "blackjack_tutorial", "blackjack_play", "blackjack_ready", "blackjack_result"].includes(game.phase);
  const spinElapsed = spinClock ? Math.max(0, Date.now() - spinClock.localStart) : null;
  const resultHidden = spinPending || (spinElapsed !== null && spinElapsed < ROULETTE_SPIN_MS);
  const hostCooldown = spinPending || (spinElapsed !== null && spinElapsed < ROULETTE_SPIN_MS + ROULETTE_RESULT_HOLD_MS);
  const beamRouletteFocus = session?.role === "beam" && (game?.phase === "roulette_betting" || (game?.phase === "roulette_result" && resultHidden));

  if (!ready) return <div className="loading">2026 DT OUTING</div>;
  if (mode === "host" && hostAuth && !session && noGameSimulation) return <main className="host-app"><header className="host-topbar"><div className="host-brand"><span className="brand-mark">✦</span><div><strong>DT OUTING <b>2026</b></strong><small>MACAU GAME CONTROL</small></div></div><button className="host-btn ghost" onClick={() => setNoGameSimulation(false)}>게임 준비로 돌아가기</button></header><div className="host-layout"><aside className="host-sidebar"><div className="host-side-label">CONTROL CENTER</div><nav aria-label="운영자 메뉴"><button onClick={() => setNoGameSimulation(false)}><span>◈</span> 게임 준비</button><button className="active" aria-current="page"><span>◉</span> 시뮬레이션</button></nav></aside><div className="host-main"><div className="host-page-head"><div><div className="card-kicker">2026 DT OUTING · HOST</div><h1>시뮬레이션</h1><p>가상의 6개 테이블로 게임 진행을 연습해 보세요.</p></div></div><Suspense fallback={<p role="status">시뮬레이션을 불러오는 중입니다.</p>}><HostSimulation settings={{ ...defaultSettings, tableCount: 6 }} /></Suspense></div></div></main>;
  if (session?.role === "host" && game) return <Suspense fallback={<main className="host-app"><p role="status">운영자 화면을 불러오는 중입니다.</p></main>}><HostConsole game={game} busy={busy} resultHidden={resultHidden} hostCooldown={hostCooldown} error={error} notice={notice} participantUrl={participantUrl} beamUrl={beamUrl} onAction={hostAction} onTeamAction={manageTeam} onTableExclusion={setTableExclusion} onSettings={saveSettings} onCopy={copyLink} onNewGame={create} onLeave={leave} /></Suspense>;
  return <main className={`app ${mode === "team" ? "participant" : ""} ${mode === "team" && game?.phase === "roulette_betting" ? "team-betting" : ""} ${mode === "beam" ? "projector" : ""} ${mode === "beam" && game?.phase === "lobby" ? "beam-lobby" : ""}`}>
    <header className="topbar"><a className="brand" href="/"><span className="brand-mark">✦</span><span>DT OUTING <b>2026</b></span></a><div className="top-right"><span className="location">MACAU <span>✦</span> GAME NIGHT</span>{session && session.role !== "beam" && <button className="text-button" disabled={busy} onClick={leave}>{session.role === "host" ? "나가기" : "다른 테이블로 참여"}</button>}</div></header>
    {mode === "beam" && !session ? <div className="loading">{error || (activeKnown ? "운영자가 게임을 준비하고 있습니다." : "게임을 불러오는 중...")}</div> : !session ? <div className="landing shell">
      <section className="intro"><div className="eyebrow"><span /> 2026 DT OUTING <span /></div><h1>ALL IN<br /><em>MACAU</em></h1><p className="intro-sub">2026 DT OUTING <span>✦</span> TEAM GAME</p><p className="intro-copy">소수의 선택으로 칩을 모으고, 룰렛에 베팅하세요.<br />단 한 번의 선택으로 순위가 뒤집힙니다.</p><div className="intro-wheel"><Wheel /></div></section>
      <section className="entry card"><div className="card-kicker">WELCOME TO THE TABLE</div><h2>{mode === "host" ? (hostAuth ? "게임을 시작해요" : "운영자 입장") : "게임에 참여해요"}</h2><p className="muted">{mode === "host" ? (hostAuth ? "새 게임을 만들고 테이블을 초대해 주세요." : "운영자 비밀번호를 입력해 주세요.") : "테이블 대표 한 분이 테이블 번호로 입장해 주세요."}</p>
        {mode === "host" ? <>{hostAuth ? <><button className="primary full" onClick={create} disabled={busy}>{busy ? "게임을 만드는 중..." : "새 게임 만들기"} <span>↗</span></button><button className="outline full" onClick={() => setNoGameSimulation(true)}>시뮬레이션</button><p className="helper">실제 게임과 별도로 6개 테이블의 진행을 연습할 수 있습니다.</p></> : <><label>비밀번호<input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => { if (e.key === "Enter") login(); }} autoComplete="current-password" /></label><button className="primary full" onClick={login} disabled={busy || !password}>{busy ? "확인 중..." : "운영자 화면으로"} <span>→</span></button></>}{hostAuth && <a className="subtle-link" href="/">참여자 화면으로 가기 →</a>}</> : <><label>테이블 번호<input type="number" inputMode="numeric" value={table} onChange={e => setTable(e.target.value)} onKeyDown={e => { if (e.key === "Enter") join(); }} min="1" max={activeSettings.tableCount} placeholder={`1–${activeSettings.tableCount}`} autoComplete="off" /></label>{activeExcluded.length > 0 && <p className="helper">불참 테이블: {[...activeExcluded].sort((a,b) => a-b).join(", ")}번</p>}<button className="primary full" onClick={join} disabled={busy || !room}>{busy ? "참여하는 중..." : "게임 입장하기"} <span>→</span></button>{!room && <p className="helper">{activeKnown ? "운영자가 게임을 준비 중입니다. 잠시만 기다려 주세요." : "게임을 확인하는 중입니다."}</p>}<a className="subtle-link" href="/host">운영자이신가요? →</a></>}
        {(error || notice) && <p role={error ? "alert" : "status"} className={`message ${error ? "error" : "success"}`}>{error || notice}</p>}
      </section><section className="how"><div><b>01</b><span>소수의 선택으로 칩 획득</span></div><div><b>02</b><span>룰렛에서 색을 골라 베팅</span></div><div><b>03</b><span>맞히면 건 칩의 2배</span></div><p>마지막에 칩이 가장 많은 테이블이 승리합니다.</p></section>
    </div> : !game ? <div className="loading">{error || "게임을 불러오는 중..."}{session.role !== "beam" && <button className="text-button" onClick={leave}>돌아가기</button>}</div> : <div className="shell game-shell">
      <div className="game-heading"><div><div className="eyebrow left"><span /> {session.role === "host" ? "HOST CONTROL" : session.role === "beam" ? "LIVE GAME" : "TEAM TABLE"}</div><h1>{session.role !== "team" && game.phase === "lobby" ? "GET READY" : session.role === "team" && myTeam ? teamName(myTeam) : game.minorityPractice ? "연습 문제" : stageOne ? "ROUND 1 · 소수의 선택" : "ROUND 2 ROULETTE"}</h1>{game.phase === "lobby" ? <p>테이블 참여를 기다리고 있어요.</p> : session.role === "team" && stageOne ? <p>{game.minorityPractice ? "연습 문제" : "ROUND 1 · 소수의 선택"}</p> : !stageOne ? <p>{game.phase === "roulette_tutorial" ? (session.role === "team" ? "ROUND 2 ROULETTE · 게임 안내" : "게임 안내") : game.phase === "finished" ? "게임이 종료되었습니다." : `${session.role === "team" ? "ROUND 2 ROULETTE · " : ""}${game.round} / ${game.settings.rouletteSpins}회`}</p> : null}</div><div className="heading-tools">{session.role === "host" && <><a className="outline anchor-button" href={beamUrl} target="_blank" rel="noreferrer">빔 화면 열기 ↗</a><button className="outline" onClick={copyLink}>참여 링크 복사</button><button className="outline" disabled={busy} onClick={create}>새 게임</button></>}</div></div>
      {(error || notice) && <p role={error ? "alert" : "status"} className={`message ${error ? "error" : "success"}`}>{error || notice}</p>}{session.role === "team" && !myTeam && <p role="alert" className="message error">테이블을 찾을 수 없습니다. 운영자에게 확인하거나 ‘다른 테이블로 참여’를 눌러 다시 입장해 주세요.</p>}
      {["minority_tutorial", "minority_play", "minority_result"].includes(game.phase) ? <MinorityScreen game={game} view={session.role === "beam" ? "beam" : "team"} busy={busy} seconds={minoritySeconds} onChoose={chooseMinority} /> : game.phase === "blackjack_tutorial" || game.phase === "roulette_tutorial" ? <GameTutorial game={game.phase === "blackjack_tutorial" ? "blackjack" : "roulette"} settings={game.settings} view={session.role === "beam" ? "beam" : "team"} /> : game.phase === "lobby" ? <div className={`game-grid ${session.role === "beam" ? "beam-lobby-grid" : ""}`}><section className="table card lobby-card"><div className="card-kicker">WELCOME TO MACAU</div><h2>곧 게임이 시작됩니다</h2><p>{session.role === "beam" ? "테이블 대표 한 분이 QR 코드를 스캔한 뒤 테이블 번호를 입력해 주세요." : <>참여가 완료됐어요.<br />게임이 시작될 때까지 기다려 주세요.</>}</p>{session.role !== "team" && <div className="qr-invite"><div className="qr-code"><QRCodeSVG value={participantUrl} size={256} level="M" marginSize={4} title="게임 참여 QR 코드" /></div>{session.role !== "beam" && <div><strong>QR 코드를 스캔해<br />게임에 참여하세요</strong><p>테이블 대표 한 분이 접속해 주세요.</p></div>}</div>}{session.role === "host" && <div className="share-url">{participantUrl}</div>}{session.role === "host" && <><div className="host-actions"><p>{game.teams.length}개 테이블 입장</p><button className="primary" onClick={() => hostAction("start_blackjack")} disabled={busy || !game.teams.length}>블랙잭 시작하기 <span>→</span></button></div></>}</section><section className="leaderboard card host-board"><div className="section-head"><div><div className="card-kicker">READY TO PLAY</div><h2>참여 테이블</h2></div><span>{game.teams.length} TABLES</span></div>{session.role === "beam" ? <div className="beam-table-grid" role="list" aria-label="테이블 입장 현황">{Array.from({length:game.settings.tableCount}, (_, i) => i + 1).filter(number => !(game.excludedTables || []).includes(number)).map(number => { const occupied = game.teams.some(team => team.table === number); return <span key={number} role="listitem" aria-label={`${number}번 테이블 ${occupied ? "입장 완료" : "대기 중"}`} className={`beam-table-number ${occupied ? "occupied" : ""}`}><b>{number}</b></span>; })}</div> : <div className="lobby-teams">{Array.from({length:game.settings.tableCount}, (_, i) => { const number = i + 1; const t = game.teams.find(team => team.table === number); const absent = (game.excludedTables || []).includes(number); return <div key={number}>{number}번 테이블 {absent ? <small className="table-waiting">불참</small> : t ? session.role === "host" ? <button className="remove-team" onClick={() => removeTeam(t)} disabled={busy}>입장 ✓ · 제외</button> : <span>입장 ✓</span> : <small className="table-waiting">대기 중</small>}</div>; })}</div>}</section></div> : stageOne ? <div className={`game-grid ${session.role === "team" ? "participant-blackjack-grid" : ""} ${session.role === "beam" && game.phase === "blackjack_result" ? "blackjack-result-grid" : ""}`}>
        {!(session.role === "beam" && game.phase === "blackjack_result") && <section className="table card blackjack-table"><div className="table-top"><span className="status"><i /> {game.phase === "blackjack_result" ? "결과 발표" : playingCount ? "블랙잭 진행 중" : "모든 테이블 선택 완료"}</span>{session.role === "team" && game.phase === "blackjack_play" ? <BlackjackCountdown seconds={blackjackSeconds} /> : <span className="round-tag">{game.blackjackPractice ? "PRACTICE · 연습 게임" : `BLACKJACK · ${game.blackjackRound ?? 1} / ${game.settings.blackjackRounds ?? 1} 턴`}</span>}</div>{session.role === "team" && game.phase === "blackjack_play" && <p className="participant-blackjack-round">{game.blackjackPractice ? "PRACTICE · 연습 게임" : `BLACKJACK · ${game.blackjackRound ?? 1} / ${game.settings.blackjackRounds ?? 1} 턴`}</p>}{game.phase === "blackjack_result" && nextBlackjackTurn && <p className="blackjack-next-turn" role="status">{nextTurnSeconds === null ? "잠시 후" : `${nextTurnSeconds}초 후`} 다음 턴이 자동으로 시작됩니다</p>}{game.phase === "blackjack_play" && session.role !== "team" && <div className="blackjack-timer-row"><BlackjackCountdown seconds={blackjackSeconds} /></div>}
          {session.role === "team" && myTeam ? <><div className="blackjack-personal"><div className="card-kicker">YOUR CARDS</div><Cards cards={myTeam.cards} />{game.phase !== "blackjack_result" && <div className="hand-total live-hand-total" aria-label={`카드 합계 ${myTeam.total ?? "확인 중"}, ${statusName(myTeam)}`}><span>카드 합계</span><strong>{myTeam.total ?? "—"}</strong><small className={myTeam.blackjackStatus === "bust" ? "bust" : ""}>{statusName(myTeam)}</small></div>}</div>{game.phase === "blackjack_play" && myTeam.blackjackStatus === "playing" && blackjackSeconds !== 0 ? <div className="bj-actions"><button className="primary" disabled={busy || blackjackSeconds === 0} onClick={() => teamAction("hit")}>한 장 더 받기 <span>＋</span></button><button className="outline" disabled={busy || blackjackSeconds === 0} onClick={() => teamAction("stand")}>여기서 멈추기</button></div> : <p className="center-note">{game.phase === "blackjack_result" ? "블랙잭 결과를 확인해 주세요." : blackjackSeconds === 0 ? "시간이 종료되어 현재 카드로 멈춥니다." : "선택을 마쳤어요. 다른 테이블을 기다려 주세요."}</p>}{game.phase === "blackjack_result" && <div className="participant-bj-result" role="status"><div className="participant-bj-result-title">카드 합계</div><div className="participant-bj-result-score"><strong>{myTeam.total ?? "—"}</strong><span className={myTeam.blackjackStatus === "bust" ? "bust" : ""}>{statusName(myTeam)}</span></div><div className="participant-bj-result-stats"><div><small>{game.blackjackPractice ? "연습 증감" : "이번 턴"}</small><strong className={(myTeam.blackjackChange ?? 0) < 0 ? "negative" : ""}>{(myTeam.blackjackChange ?? 0) > 0 ? "+" : ""}{fmt(myTeam.blackjackChange ?? 0)}<small>칩</small></strong></div><div><small>{game.blackjackPractice ? "연습 칩" : "보유 칩"}</small><strong>{fmt(resultChips(myTeam))}<small>칩</small></strong></div></div></div>}</> : <div className="bj-intro">{session.role !== "beam" && <Cards cards={[2, 10]} />}<h2>21에 가장 가까운 테이블은?</h2><p>21을 넘지 않도록 한 장 더 받거나 멈추세요. 21이면 자동으로 멈춥니다. 동점은 공동 승리입니다.</p><div className="reward-line"><span>시작 칩 <b>{fmt(game.settings.initialChips)}칩</b></span><span>가장 가까운 팀 <b>+{fmt(game.settings.blackjackBonus)}칩</b></span><span>그 외 21 이하 <b>변동 없음</b></span><span>21 초과 <b>−{fmt(game.settings.blackjackPenalty)}칩</b></span></div></div>}
          {session.role === "host" && <div className="host-actions">{game.phase === "blackjack_result" ? game.blackjackPractice ? <><p>연습 결과는 실제 칩에 반영되지 않습니다.</p><button className="primary" onClick={() => hostAction("start_blackjack_game")} disabled={busy}>본게임 시작하기 <span>→</span></button></> : nextBlackjackTurn ? <p>잠시 후 다음 턴이 시작됩니다.</p> : <><p>획득한 칩으로 룰렛에 참여합니다.</p><button className="primary" onClick={() => hostAction("start_roulette")} disabled={busy}>룰렛 시작하기 <span>→</span></button></> : <><p>{playingCount ? `${playingCount}개 테이블의 선택을 기다리고 있어요.` : "모든 테이블의 선택이 끝났어요."}</p><button className="primary" onClick={() => hostAction("settle_blackjack")} disabled={busy || playingCount > 0}>블랙잭 결과 발표 <span>✦</span></button></>}</div>}
        </section>}
        {session.role !== "team" && <section className={`leaderboard card host-board ${game.phase === "blackjack_result" ? "blackjack-result-leaderboard" : ""}`}>
          <div className="section-head"><div><div className="card-kicker">BLACKJACK TABLE</div><h2>{game.phase === "blackjack_result" ? (game.blackjackPractice ? "연습 칩 순위" : "테이블 칩 순위") : "테이블 현황"}</h2></div><span>{game.teams.length} TABLES</span></div>
          {game.phase === "blackjack_result" && game.blackjackPractice && <p className="blackjack-next-turn" role="status">연습 결과 · 실제 칩에 반영되지 않습니다</p>}
          {session.role === "beam" && game.phase === "blackjack_result" && nextBlackjackTurn && <p className="blackjack-next-turn" role="status">{nextTurnSeconds === null ? "잠시 후" : `${nextTurnSeconds}초 후`} 다음 턴이 자동으로 시작됩니다</p>}
          {game.phase === "blackjack_result" ? <div className={`blackjack-result-ranking ${game.teams.length > 18 ? "many" : ""}`} role="list" aria-label={game.blackjackPractice ? "테이블별 연습 칩 순위" : "테이블별 보유 칩 순위"}>
            {ranking.map(t => { const rank = ranking.findIndex(other => resultChips(other) === resultChips(t)) + 1; const change = t.blackjackChange ?? 0; return <div role="listitem" key={t.id} className={`blackjack-result-row ${t.id === game.myTeamId ? "mine" : ""}`}>
              <span className={`blackjack-result-rank ${rank === 1 ? "first" : ""}`}>{rank}<small>위</small></span>
              <strong className="blackjack-result-name" aria-label={`${teamName(t)}${t.id === game.myTeamId ? " 내 테이블" : ""}`}><span className="blackjack-result-name-full">{session.role === "beam" && game.teams.length > 18 && t.table ? `${t.table}번` : teamName(t)}</span>{t.table && <span className="blackjack-result-name-short" aria-hidden="true">{t.table}번</span>}{t.id === game.myTeamId && <small> MY TABLE</small>}</strong>
              <span className={`blackjack-result-change ${change > 0 ? "positive" : change < 0 ? "negative" : ""}`}><small>이번 턴 </small>{change > 0 ? "+" : ""}{fmt(change)}<small>칩</small></span>
              <span className="blackjack-result-chips"><small>{game.blackjackPractice ? "연습 " : "보유 "}</small><strong>{fmt(resultChips(t))}</strong><small> CHIPS</small></span>
            </div>; })}
          </div> : session.role === "beam" && game.phase === "blackjack_play" ? <div className="beam-choice-board" role="list" aria-label="테이블별 선택 현황">{[...game.teams].sort((a,b) => a.table-b.table).map(t => <div role="listitem" key={t.id} className={`beam-choice ${t.blackjackStatus !== "playing" ? "complete" : ""}`}><strong>{t.table}번 테이블</strong><span>{t.blackjackStatus === "playing" ? "선택 중" : "선택 완료"}</span></div>)}</div> : <div className="blackjack-board">{[...game.teams].sort((a,b) => a.table-b.table).map(t => <div key={t.id} className={`bj-row ${t.id === game.myTeamId ? "mine" : ""}`}><div className="bj-row-name"><strong>{teamName(t)}</strong><small>{statusName(t)}</small></div>{t.cards?.length ? <Cards cards={t.cards} small /> : <Cards hidden small />}<div className="bj-score"><strong>{t.total ?? "—"}</strong>{session.role === "host" && game.phase === "blackjack_play" && game.teams.length > 1 && <button className="remove-team" onClick={() => removeTeam(t)} disabled={busy}>제외</button>}</div></div>)}</div>}
        </section>}
      </div> : <div className={`game-grid roulette-stage ${beamRouletteFocus ? "roulette-focus" : ""}`}><section className="table card"><div className="table-top"><span className="status"><i /> {resultHidden ? "룰렛 회전 중" : game.phase === "roulette_betting" ? "베팅 진행 중" : game.phase === "roulette_result" ? "결과 발표" : "게임 종료"}</span><span className="round-tag">ROUND 2 · {game.round} / {game.settings.rouletteSpins}</span></div><div className="table-body"><Wheel result={game.result} spinning={resultHidden} spinOffsetMs={spinClock?.initialElapsed ?? 0} />{!beamRouletteFocus && game.phase !== "roulette_betting" && <div className="wheel-caption">{resultHidden ? <><small>GOOD LUCK</small><strong>룰렛이 돌아갑니다!</strong><p>어떤 색이 나올까요?</p></> : <><small>THE WINNING COLOR</small><strong className={game.result === "red" ? "red-text" : "ivory"}>{game.result ? resultColorName(game.result) : "게임 종료"} <span className="result-dot" /></strong><p>결과가 나왔습니다!</p></>}</div>}</div>
        {session.role === "host" && <div className="host-actions">{game.phase === "roulette_betting" ? <><p>{missingCount ? `${missingCount}개 테이블의 베팅을 기다리고 있어요.` : "모든 테이블의 베팅이 완료됐어요."}</p><button className="primary" disabled={busy || !eligibleCount || missingCount > 0} onClick={() => hostAction("spin")}>{busy ? "돌리는 중..." : "룰렛 돌리기"} <span>✦</span></button></> : game.phase === "roulette_result" ? <button className="primary" disabled={busy || resultHidden || hostCooldown} onClick={() => hostAction("next")}>{hostCooldown ? "결과 공개 중..." : game.round === game.settings.rouletteSpins || game.teams.every(t => t.chips === 0) ? "최종 결과 보기" : "다음 룰렛 시작"} <span>→</span></button> : <p>축하합니다! 최종 순위를 확인해 주세요.</p>}</div>}
      </section>
      {session.role === "team" && <section className="bet-panel card">{resultHidden ? <div className="waiting" role="status"><div className="waiting-icon">✦</div><h2>결과 공개 중</h2><p className="muted">룰렛이 멈추면 결과를 확인할 수 있어요.</p></div> : <><div className="card-kicker">보유 칩 · YOUR CHIPS</div><div className="chips-total"><strong>{fmt(myTeam?.chips || 0)}</strong><span>CHIPS</span></div><div className="divider" />{(game.phase === "roulette_result" || game.phase === "finished") && myTeam ? <div className="participant-roulette-result" role="status"><p>{game.phase === "finished" ? "게임 종료" : "이번 룰렛 결과"}{game.result && <> · <strong>{resultColorName(game.result)}</strong></>}</p><div><span>이번 판 {myRoundResult ? `${resultColorName(myRoundResult.color)} ${fmt(myRoundResult.amount)}칩 베팅` : "베팅 없음"}</span><strong className={(myRoundResult?.change ?? 0) < 0 ? "negative" : ""}>{(myRoundResult?.change ?? 0) > 0 ? "+" : ""}{fmt(myRoundResult?.change ?? 0)}<small>칩</small></strong></div><p>최종 순위는 빔 화면에서 확인해 주세요.</p></div> : game.phase === "roulette_betting" && myTeam?.skipped ? <div className="waiting"><div className="waiting-icon">✦</div><h2>이번 베팅은 건너뜁니다</h2><p className="muted">칩은 그대로 유지됩니다. 룰렛이 돌기 전까지 선택을 바꿀 수 있어요.</p><button className="outline full" disabled={busy} onClick={() => teamAction("undo_skip")}>다시 베팅하기</button></div> : game.phase === "roulette_betting" && myTeam && myTeam.chips > 0 ? <><h2>어디에 걸까요?</h2><p className="muted">색을 선택하고 베팅할 칩을 정해 주세요.</p><div className="color-choice"><button className={`color-button red ${color === "red" ? "selected" : ""}`} aria-pressed={color === "red"} onClick={() => setColor("red")}><span className="bet-color-dot" aria-hidden="true">●</span><span className="bet-color-name">빨강 <small>RED</small></span>{color === "red" && <span className="bet-color-check" aria-hidden="true">✓</span>}</button><button className={`color-button black ${color === "black" ? "selected" : ""}`} aria-pressed={color === "black"} onClick={() => setColor("black")}><span className="bet-color-dot" aria-hidden="true">●</span><span className="bet-color-name">검정 <small>BLACK</small></span>{color === "black" && <span className="bet-color-check" aria-hidden="true">✓</span>}</button></div><label>베팅할 칩<div className="amount-input"><input type="number" min="1" max={myTeam.chips} step="1" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" /><span>CHIPS</span></div></label><div className="quick-bets"><button onClick={() => setAmount(String(Math.max(1, Math.floor(myTeam.chips / 2))))}>보유 칩의 절반</button><button onClick={() => setAmount(String(myTeam.chips))}>ALL IN</button></div><button className="primary full bet-submit" onClick={() => teamAction("bet")} disabled={busy || !color || !amount || !Number.isSafeInteger(Number(amount)) || Number(amount) < 1 || Number(amount) > myTeam.chips}>{myTeam.bet ? "베팅 변경하기" : "베팅하기"} <span>→</span></button>{myTeam.bet && <p className="bet-confirm" role="status">✓ 현재 베팅: {colorName(myTeam.bet.color)} · {fmt(myTeam.bet.amount)}칩</p>}<button className="outline full skip-bet-button" disabled={busy} onClick={() => teamAction("skip_bet")}>{myTeam.bet ? "기존 베팅 취소하고 건너뛰기" : "이번 판 베팅 안 하기"}</button><p className="muted skip-bet-hint">베팅하지 않으면 보유 칩이 그대로 유지됩니다.</p></> : <div className="waiting"><div className="waiting-icon">✦</div><h2>{!myTeam?.chips ? "베팅할 칩이 없어요" : game.phase === "finished" ? "게임이 끝났어요" : "잠시만 기다려 주세요"}</h2><p className="muted">{!myTeam?.chips ? "이번 라운드는 관전해 주세요." : game.phase === "finished" ? "최종 순위를 확인해 보세요." : "운영자가 다음 순서를 진행합니다."}</p></div>}</>}</section>}
      {session.role !== "team" && !beamRouletteFocus && <section className={`leaderboard card host-board ${resultHidden ? "concealed" : ""} ${game.phase !== "roulette_betting" ? "roulette-leaderboard-results" : ""}`}><div className="section-head"><div><div className="card-kicker">LEADERBOARD</div><h2>{game.phase === "finished" ? "최종 순위" : "테이블 순위"}</h2></div><span>{game.teams.length} TABLES</span></div>{resultHidden ? <p role="status" className="empty">결과 공개 중</p> : <div className="ranking">{ranking.map(team => { const rank = ranking.findIndex(t => t.chips === team.chips) + 1; const roundResult = lastHistory?.teams.find(t => t.id === team.id); return <div className={`rank-row ${team.id === game.myTeamId ? "mine" : ""}`} key={team.id}><span className={`rank-number ${rank === 1 ? "first" : ""}`}>{String(rank).padStart(2, "0")}</span><div className="rank-name"><strong>{teamName(team)}{team.id === game.myTeamId && <small> MY TABLE</small>}</strong><span>{game.phase === "roulette_betting" ? team.bet ? "베팅 완료" : team.skipped ? "베팅 건너뜀 · 칩 유지" : team.chips === 0 ? "관전 중" : "베팅 대기" : roundResult ? `${resultColorName(roundResult.color)} · ${fmt(roundResult.amount)}칩 베팅` : "이번 회차 베팅 없음"}</span></div>{game.phase !== "roulette_betting" && <span className={`roulette-rank-change ${(roundResult?.change ?? 0) < 0 ? "negative" : (roundResult?.change ?? 0) > 0 ? "positive" : "neutral"}`}>{(roundResult?.change ?? 0) > 0 ? "+" : ""}{fmt(roundResult?.change ?? 0)}<small>칩</small></span>}<div className="rank-chips"><strong>{fmt(team.chips)}</strong><small>CHIPS</small>{session.role === "host" && game.phase === "roulette_betting" && game.teams.length > 1 && <button className="remove-team" onClick={() => removeTeam(team)} disabled={busy}>제외</button>}</div></div>; })}</div>}</section>}
      </div>}<footer><span>DT OUTING 2026 <b>✦</b> MACAU</span><span>PLAY BOLD. PLAY TOGETHER.</span></footer>
    </div>}
  </main>;
}
export default App;
