/**
 * 화면 진입점. 주소에 따라 세 가지 화면을 보여 줍니다.
 *   /      참가자(폰)  → 테이블 번호로 입장 후 게임
 *   /beam  빔(스크린) → 진행 상황 송출 (조작 없음)
 *   /host  운영자     → 로그인 후 HostConsole
 * 서버 상태는 transport.ts의 실시간 연결로 받습니다.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import GameTutorial from "./components/game-tutorial";
import MinorityScreen from "./components/minority-screen";
import FaceScreen from "./components/face-screen";
import Landing from "./components/landing";
import Lobby from "./components/lobby";
import RouletteStage from "./components/roulette-stage";
import Standings from "./components/standings";
import { useCountdown } from "./lib/use-countdown";
import { ROULETTE_RESULT_HOLD_MS, ROULETTE_SPIN_MS } from "./lib/roulette-timing";
import { api, hello, socket, type ApiResult } from "./transport";
import { roundsOf, teamName, type Color, type Game, type HostAction, type Team, type TeamAction } from "./types";
import "./roulette-stage.css";
import "./beam.css";
import "./participant.css";

const HostConsole = lazy(() => import("./components/host-console"));

type Mode = "host" | "team" | "beam";
type Session = { room: string; token: string; role: Mode };
const TEAM_KEY = "dt-outing-team-v2";
const HOST_KEY = "dt-outing-host-v2";
const BET_NOTICE = "베팅했어요! 룰렛이 돌기 전까지 변경할 수 있습니다.";

class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
async function post(data: object) {
  const { status, body } = await api(data);
  if (status >= 400) throw new ApiError(body?.error || "요청을 처리하지 못했어요. 다시 시도해 주세요.", status);
  return body;
}
function detectMode(): Mode {
  const path = window.location.pathname.replace(/\/$/, "");
  return path === "/beam" ? "beam" : path === "/host" ? "host" : "team";
}
function savedSession(mode: Mode): Session | null {
  if (mode === "beam") return null;
  try {
    const s = JSON.parse(localStorage.getItem(mode === "host" ? HOST_KEY : TEAM_KEY) || "null") as Session | null;
    return s?.role === mode ? s : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [mode] = useState<Mode>(detectMode);
  const [session, setSession] = useState<Session | null>(() => savedSession(mode));
  const [game, setGame] = useState<Game | null>(null);
  const [room, setRoom] = useState("");
  const [activeKnown, setActiveKnown] = useState(false);
  const [hostAuth, setHostAuth] = useState(() => (mode === "host" ? savedSession("host")?.token ?? "" : ""));
  const [tableCount, setTableCount] = useState(12);
  const [excluded, setExcluded] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [spinPending, setSpinPending] = useState(false);
  const [, rerender] = useState(0);
  const mutationInFlight = useRef(false);
  const mutationEpoch = useRef(0);
  const connectionError = useRef(false);
  const refreshRef = useRef<() => void>(() => {});

  // ------------------------------------------------------------ 서버 상태 받기
  useEffect(() => {
    let active = true;
    let disconnectTimer: number | null = null;
    const creds = session?.role === "team" ? { teamToken: session.token } : session?.role === "host" ? { hostToken: session.token } : {};
    const forget = () => { if (session?.role !== "beam") localStorage.removeItem(session?.role === "host" ? HOST_KEY : TEAM_KEY); };
    const apply = (r: ApiResult, epoch: number) => {
      // 내가 보낸 요청이 처리 중일 때 도착한 상태는 무시 (요청 응답이 더 최신)
      if (!active || mutationInFlight.current || mutationEpoch.current !== epoch) return;
      if (r.status >= 400) {
        if (session?.role === "host" && r.status === 403) { forget(); setSession(null); setHostAuth(""); setGame(null); setNotice("운영자 비밀번호로 다시 로그인해 주세요."); return; }
        setActiveKnown(true); connectionError.current = true; setError(r.body?.error || "연결을 확인해 주세요.");
        return;
      }
      const current: Game | null = r.body.state;
      setActiveKnown(true);
      setRoom(current?.room || "");
      if (current) { setTableCount(current.settings.tableCount); setExcluded(current.excludedTables || []); }
      if (!current) {
        // 진행 중인 게임이 없음: 참가자는 입장 화면으로, 운영자는 "새 게임 만들기" 화면으로
        setGame(null);
        if (session?.role === "team") forget();
        if (session) setSession(null);
      } else if (session && session.role !== "beam" && session.room !== current.room) {
        // 운영자가 새 게임을 만들면 모두 다시 입장
        forget(); setSession(null); setGame(null);
        if (session.role === "host") setNotice("새 게임이 만들어졌습니다. 운영자 비밀번호로 다시 로그인해 주세요.");
        else setNotice("새 게임이 시작되었습니다. 테이블 번호로 다시 입장해 주세요.");
      } else if (mode === "beam") {
        if (session?.room !== current.room) setSession({ room: current.room, token: "", role: "beam" });
        setGame(current);
      } else if (session) setGame(current);
      if (connectionError.current) { connectionError.current = false; setError(""); }
    };
    const refresh = () => {
      const epoch = mutationEpoch.current;
      void hello(creds).then(r => { if (r) apply(r, epoch); });
    };
    refreshRef.current = refresh;
    const onState = (r: ApiResult) => apply(r, mutationEpoch.current);
    const onConnect = () => {
      if (disconnectTimer !== null) { clearTimeout(disconnectTimer); disconnectTimer = null; }
      refresh();
    };
    const onDisconnect = () => {
      if (disconnectTimer !== null) return;
      // 잠깐 끊기는 것은 조용히 재연결하고, 길어질 때만 안내
      disconnectTimer = window.setTimeout(() => {
        disconnectTimer = null;
        if (active && !socket.connected) { connectionError.current = true; setActiveKnown(true); setError("연결이 지연되고 있어요. 다시 연결하는 중입니다."); }
      }, 2500);
    };
    const onVisible = () => { if (document.visibilityState === "visible") { if (socket.connected) refresh(); else socket.connect(); } };
    socket.on("state", onState);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    document.addEventListener("visibilitychange", onVisible);
    if (socket.connected) refresh();
    return () => {
      active = false;
      socket.off("state", onState); socket.off("connect", onConnect); socket.off("disconnect", onDisconnect);
      document.removeEventListener("visibilitychange", onVisible);
      if (disconnectTimer !== null) clearTimeout(disconnectTimer);
    };
  }, [session, mode]);

  // 룰렛 회전 시각을 서버 기준으로 고정 (새로고침해도 같은 지점부터)
  const spinClock = useMemo(() => {
    if (game?.phase !== "roulette_result" || typeof game.rouletteSpinStartedAt !== "number") return null;
    const elapsed = Math.max(0, Math.min(ROULETTE_SPIN_MS + ROULETTE_RESULT_HOLD_MS, (game.serverTime ?? Date.now()) - game.rouletteSpinStartedAt));
    return { localStart: Date.now() - elapsed, initialElapsed: elapsed };
  }, [game?.room, game?.round, game?.phase, game?.rouletteSpinStartedAt]);
  useEffect(() => {
    if (!spinClock) return;
    const elapsed = Date.now() - spinClock.localStart;
    const timers = [ROULETTE_SPIN_MS, ROULETTE_SPIN_MS + ROULETTE_RESULT_HOLD_MS].filter(at => at > elapsed).map(at => window.setTimeout(() => rerender(n => n + 1), at - elapsed));
    return () => timers.forEach(t => window.clearTimeout(t));
  }, [spinClock]);
  useEffect(() => { setNotice(n => (n === BET_NOTICE ? "" : n)); }, [game?.room, game?.round, game?.phase]);

  // ------------------------------------------------------------ 동작
  const saveSession = (next: Session) => {
    localStorage.setItem(next.role === "host" ? HOST_KEY : TEAM_KEY, JSON.stringify(next));
    setSession(next);
    setError("");
  };
  /** 요청 하나를 보내고, 끝나면 최신 상태를 다시 받습니다. 동시에 두 번 누르는 것을 막습니다. */
  const act = async (fn: () => Promise<void>) => {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    mutationEpoch.current += 1;
    connectionError.current = false;
    setBusy(true); setError(""); setNotice("");
    try { await fn(); }
    catch (e) { setError(e instanceof Error ? e.message : "다시 시도해 주세요."); }
    finally { mutationInFlight.current = false; setBusy(false); window.setTimeout(() => refreshRef.current(), 60); }
  };
  const apply = (data: { state?: Game }) => { if (data.state) setGame(data.state); };
  const asTeam = (action: string, extra: object = {}) => act(async () => {
    if (!session) return;
    apply(await post({ action, room: session.room, teamToken: session.token, ...extra }));
  });
  const asHost = (action: string, extra: object = {}) => post({ action, room: session?.room, hostToken: session?.token, ...extra });

  const login = (password: string) => act(async () => {
    if (!password) throw new Error("운영자 비밀번호를 입력해 주세요.");
    const data = await post({ action: "host_login", password });
    setHostAuth(data.hostToken);
    if (data.room) { saveSession({ room: data.room, token: data.hostToken, role: "host" }); setRoom(data.room); setGame(data.state); }
  });
  const createGame = () => act(async () => {
    if (!hostAuth) throw new Error("운영자 비밀번호로 로그인해 주세요.");
    if (room && !window.confirm("새 게임을 만들면 현재 게임이 끝나고 모든 테이블이 다시 입장해야 합니다. 계속할까요?")) return;
    const data = await post({ action: "create", hostToken: hostAuth }).catch((e: unknown) => {
      // 비밀번호가 바뀌어 예전 로그인이 무효 → 다시 로그인하도록
      if (e instanceof ApiError && e.status === 403) { localStorage.removeItem(HOST_KEY); setHostAuth(""); }
      throw e;
    });
    saveSession({ room: data.room, token: data.hostToken, role: "host" }); setRoom(data.room); setGame(data.state);
  });
  const join = (table: number) => act(async () => {
    if (!room) throw new Error("운영자가 게임을 준비 중입니다. 잠시 후 다시 시도해 주세요.");
    if (!Number.isInteger(table) || table < 1 || table > tableCount) throw new Error(`1부터 ${tableCount} 사이의 테이블 번호를 입력해 주세요.`);
    if (excluded.includes(table)) throw new Error(`${table}번 테이블은 불참 처리되었습니다. 운영자에게 확인해 주세요.`);
    const data = await post({ action: "join", table });
    saveSession({ room: data.state.room, token: data.teamToken, role: "team" }); setRoom(data.state.room); setGame(data.state);
  });
  const leave = () => {
    if (!session || mutationInFlight.current) return;
    if (session.role === "host" && !window.confirm("운영 화면에서 로그아웃할까요? 게임은 계속 진행됩니다.")) return;
    localStorage.removeItem(session.role === "host" ? HOST_KEY : TEAM_KEY);
    setSession(null); setHostAuth(""); setGame(null); setError(""); setNotice("");
  };
  const bet = (color: Color, amount: number) => act(async () => {
    if (!session) return;
    apply(await post({ action: "bet", room: session.room, teamToken: session.token, color, amount }));
    setNotice(BET_NOTICE);
  });
  const hostAction = (action: HostAction) => act(async () => {
    if (action === "spin") setSpinPending(true);
    try {
      apply(await asHost(action, {
        ...(action === "reveal_minority" ? { minorityRound: game?.minorityRound ?? 1 } : {}),
        ...(action === "face_close" ? { turnId: game?.face?.turnId } : {}),
      }));
    } finally {
      if (action === "spin") setSpinPending(false);
    }
  });
  const teamAction = (action: TeamAction, team: Team) => {
    const prompts: Record<TeamAction, string> = {
      remove_team: "게임에서 제외할까요? 이 테이블의 칩과 기록이 삭제됩니다.",
      skip_bet: "이번 룰렛 베팅을 건너뛸까요? 칩은 유지됩니다.",
      undo_skip: "베팅 건너뛰기를 취소하고 다시 베팅할 수 있게 할까요?",
    };
    if (!window.confirm(`${teamName(team)}: ${prompts[action]}`)) return;
    void act(async () => apply(await asHost(action, { teamId: team.id })));
  };
  const setTableExclusion = (table: number, exclude: boolean) => act(async () => {
    apply(await asHost(exclude ? "exclude_table" : "include_table", { table }));
    setNotice(`${table}번 테이블을 ${exclude ? "불참 처리" : "참여 가능으로 변경"}했습니다.`);
  });
  const saveSettings = (settings: object) => act(async () => { apply(await asHost("update_settings", { settings })); setNotice("설정을 저장했습니다."); });
  const adjustChips = (team: Team, delta: number, reason: string) => act(async () => { apply(await asHost("adjust_chips", { teamId: team.id, delta, reason })); setNotice(`${team.table}번 테이블 칩을 조정했습니다.`); });
  const saveFacePeople = (facePeople: object[]) => act(async () => { apply(await asHost("face_set_people", { facePeople })); setNotice("얼굴 카드 인물을 저장했습니다."); });

  const participantUrl = `${window.location.origin}/`;
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(participantUrl); setNotice("참여 링크를 복사했어요."); }
    catch { setNotice(`참여 링크: ${participantUrl}`); }
  };

  // ------------------------------------------------------------ 화면 계산
  // 일시정지 중에는 남은 시간을 멈춘 채로 보여 줌
  const pausedSeconds = game?.paused ? Math.ceil(game.paused.remaining / 1000) : null;
  const faceSeconds = useCountdown(game?.phase === "face_play" ? game.face?.deadline : null, game?.serverTime) ?? pausedSeconds;
  const minoritySeconds = useCountdown(game?.phase === "minority_play" ? game.minorityDeadline : null, game?.serverTime) ?? pausedSeconds;
  const betSeconds = useCountdown(game?.phase === "roulette_betting" ? game.rouletteDeadline : null, game?.serverTime) ?? pausedSeconds;
  const spinElapsed = spinClock ? Math.max(0, Date.now() - spinClock.localStart) : null;
  const resultHidden = spinPending || (spinElapsed !== null && spinElapsed < ROULETTE_SPIN_MS);
  const hostCooldown = spinPending || (spinElapsed !== null && spinElapsed < ROULETTE_SPIN_MS + ROULETTE_RESULT_HOLD_MS);
  const message = (error || notice) && <p role={error ? "alert" : "status"} className={`message ${error ? "error" : "success"}`}>{error || notice}</p>;

  if (session?.role === "host" && game) {
    return <Suspense fallback={<main className="host-app"><p role="status">운영자 화면을 불러오는 중입니다.</p></main>}>
      <HostConsole game={game} busy={busy} resultHidden={resultHidden} hostCooldown={hostCooldown} error={error} notice={notice}
        participantUrl={participantUrl} hostToken={session.token} onAction={hostAction} onTeamAction={teamAction}
        onTableExclusion={setTableExclusion} onSettings={saveSettings} onFacePeople={saveFacePeople} onAdjust={adjustChips}
        onRefresh={() => refreshRef.current()} onCopy={copyLink} onNewGame={createGame} onLeave={leave} />
    </Suspense>;
  }

  const view = mode === "beam" ? "beam" : "team";
  const R = roundsOf(game);
  const myTeam = game?.teams.find(t => t.id === game.myTeamId);
  const phase = game?.phase ?? "lobby";
  const title = phase === "lobby" ? (view === "beam" ? "GET READY" : null)
    : phase.startsWith("face_") ? `ROUND ${R.face ?? 1} · 얼굴 카드 매치`
    : phase === "minority_summary" ? `ROUND ${R.minority} 종료 · 중간 순위`
    : phase.startsWith("minority_") ? (game?.minorityPractice ? "연습 문제" : `ROUND ${R.minority} · 소수의 선택`)
    : phase === "finished" ? "최종 결과"
    : "FINAL ROUND · ROULETTE";
  const subtitle = phase === "lobby" ? "테이블 참여를 기다리고 있어요."
    : phase === "roulette_tutorial" ? "게임 안내"
    : phase === "finished" || phase === "minority_summary" ? null
    : phase.startsWith("roulette_") ? `${game?.round} / ${game?.settings.rouletteSpins}회` : null;

  return <main className={`app ${mode === "team" ? "participant" : "projector"} ${mode === "team" && phase === "roulette_betting" ? "team-betting" : ""} ${mode === "beam" && phase === "lobby" ? "beam-lobby" : ""}`}>
    <header className="topbar">
      <a className="brand" href="/"><span className="brand-mark">✦</span><span>DT OUTING <b>2026</b></span></a>
      <div className="top-right">
        <span className="location">MACAU <span>✦</span> GAME NIGHT</span>
        {session && session.role !== "beam" && <button className="text-button" disabled={busy} onClick={leave}>{session.role === "host" ? "나가기" : "다른 테이블로 참여"}</button>}
      </div>
    </header>
    {mode === "beam" && !session ? <div className="loading">{error || (activeKnown ? "운영자가 게임을 준비하고 있습니다." : "게임을 불러오는 중...")}</div>
      : !session ? <Landing mode={mode === "host" ? "host" : "team"} hostAuth={!!hostAuth} busy={busy} roomReady={!!room} activeKnown={activeKnown}
          tableCount={tableCount} excluded={excluded} message={message} onLogin={login} onCreate={createGame} onJoin={join} />
      : !game ? <div className="loading">{error || "게임을 불러오는 중..."}<button className="text-button" onClick={leave}>돌아가기</button></div>
      : <div className="shell game-shell">
        <div className="game-heading"><div>
          <div className="eyebrow left"><span /> {view === "beam" ? "LIVE GAME" : "TEAM TABLE"}</div>
          {/* 폰에서는 내 테이블 번호를 크게, 빔에서는 라운드 이름을 크게 */}
          <h1>{view === "team" && myTeam ? teamName(myTeam) : title}</h1>
          {view === "team" && myTeam && title ? <p>{title}{subtitle && phase !== "lobby" ? ` · ${subtitle}` : ""}</p> : subtitle && <p>{subtitle}</p>}
        </div></div>
        {message}
        {game.paused && <p role="status" className="message paused-banner">⏸ 진행자가 잠시 멈췄어요. 곧 이어서 진행합니다.</p>}
        {view === "team" && !myTeam && <p role="alert" className="message error">테이블을 찾을 수 없습니다. 운영자에게 확인하거나 ‘다른 테이블로 참여’를 눌러 다시 입장해 주세요.</p>}
        {phase.startsWith("face_") ? <FaceScreen game={game} view={view} busy={busy} seconds={faceSeconds} onPick={index => asTeam("face_pick", { index, turnId: game.face?.turnId })} onAnswer={answer => asTeam("face_answer", { answer, turnId: game.face?.turnId })} />
          : phase === "minority_summary" ? <Standings game={game} view={view} mode="summary" />
          : phase === "finished" ? <Standings game={game} view={view} mode="final" />
          : phase.startsWith("minority_") ? <MinorityScreen game={game} view={view} busy={busy} seconds={minoritySeconds} onChoose={choice => asTeam("minority_choose", { choice, minorityRound: game.minorityRound })} />
          : phase === "roulette_tutorial" ? <GameTutorial settings={game.settings} view={view} />
          : phase === "lobby" ? <Lobby game={game} view={view} participantUrl={participantUrl} />
          : <RouletteStage game={game} view={view} busy={busy} resultHidden={resultHidden} seconds={betSeconds} spinOffsetMs={spinClock?.initialElapsed ?? 0}
              onBet={bet} onSkip={() => asTeam("skip_bet")} onUndoSkip={() => asTeam("undo_skip")} />}
        <footer><span>DT OUTING 2026 <b>✦</b> MACAU</span><span>PLAY BOLD. PLAY TOGETHER.</span></footer>
      </div>}
  </main>;
}
