import { useEffect, useRef, useState, type CSSProperties } from "react";
import "./face-screen.css";
import { fmt, type Game, type Team } from "../types";

type FaceCard = { index: number; open: boolean; removed: boolean; photo: string | null; name: string | null };
export type FaceView = {
  stage: "select" | "mismatch" | "name" | "name_result" | "done";
  boardNo: 1 | 2; boards: number; cols: number;
  turnId: string; deadline: number | null; currentTeamId: string | null; nextTeamId: string | null; order: string[];
  pairs: number; found: number; stopAfterTurn: boolean; board: FaceCard[]; submitted: string[]; myAnswer: string | null;
  hostAnswer?: string | null; hostAnswers?: Record<string, string> | null;
  result: { personId: string; name: string; attackerId: string; winners: string[]; answers: Record<string, string> } | null;
  history: { personId: string; name: string; attackerId: string; winners: string[]; board: 1 | 2; photo: string | null }[];
};
type FaceGame = Pick<Game, "phase" | "face" | "teams" | "myTeamId" | "settings" | "rounds">;
type Props = { game: FaceGame; view: "team" | "beam" | "host"; busy: boolean; seconds: number | null; onPick?: (index: number) => void; onAnswer?: (answer: string) => void };

/** 판 구성 (서버 server/face.ts의 FACE_BOARDS와 같음) */
const BOARDS = [{ pairs: 8, cols: 4, rows: 4 }, { pairs: 12, cols: 6, rows: 4 }];
const photoUrl = (id: string | null) => (id ? `/photos/${id}` : "");
const tableName = (game: FaceGame, id: string | null | undefined) => {
  const t = game.teams.find(team => team.id === id);
  return t ? `${t.table}번 테이블` : "-";
};

/** 이번 차례에 테이블이 얻은 칩: 짝 성공 +match, 이름 정답 +name */
function turnGain(f: FaceView, teamId: string, match: number, name: number) {
  if (!f.result) return { matched: false, named: false, total: 0 };
  const matched = f.result.attackerId === teamId;
  const named = f.result.winners.includes(teamId);
  return { matched, named, total: (matched ? match : 0) + (named ? name : 0) };
}

export default function FaceScreen({ game, view, busy, seconds, onPick, onAnswer }: Props) {
  const f = game.face;
  const s = game.settings;
  const match = s.faceMatchBonus ?? 100;
  const nameBonus = s.faceNameBonus ?? 50;
  const myTeam = game.teams.find(t => t.id === game.myTeamId);
  const boardRef = useRef<HTMLDivElement>(null);
  const myTurnNow = view === "team" && !!myTeam && f?.stage === "select" && f.currentTeamId === myTeam.id;
  // 우리 차례가 되면 카드판을 화면에 보이게 하고 진동으로 알림
  useEffect(() => {
    if (!myTurnNow) return;
    boardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    try { navigator.vibrate?.([120, 60, 120]); } catch { /* 지원 안 하는 기기 */ }
  }, [myTurnNow, f?.turnId]);

  // ---------------------------------------------------------- 안내
  if (game.phase === "face_tutorial" || !f) {
    return <section className="face-card face-guide">
      <div className="face-label">ROUND {game.rounds?.face ?? 1} · GAME INTRO</div>
      <h2>얼굴 카드 매치</h2>
      <p>같은 사람 사진 두 장을 찾고, 그 사람의 이름을 맞혀 주세요.</p>
      <div className="face-steps">
        <div><strong>01</strong><span>테이블 번호 순서대로 <br />카드 두 장을 뒤집어요.</span></div>
        <div><strong>02</strong><span>같은 사람이면 <br />뒤집은 테이블 <b>+{match}칩</b></span></div>
        <div><strong>03</strong><span>모든 테이블이 이름 맞히기 <br />정답이면 <b>+{nameBonus}칩</b></span></div>
      </div>
      <p className="face-note">1판 {BOARDS[0].pairs}쌍(카드 {BOARDS[0].pairs * 2}장) → 2판 {BOARDS[1].pairs}쌍(카드 {BOARDS[1].pairs * 2}장) · 카드 선택 {s.faceSelectSeconds ?? 30}초, 이름 입력 {s.faceNameSeconds ?? 30}초</p>
      <p className="face-muted">짝을 찾고 이름까지 맞히면 +{match + nameBonus}칩! 시간 안에 고르지 않으면 카드가 무작위로 뒤집힙니다. 다른 테이블 차례에도 카드 위치를 잘 기억해 두세요.</p>
    </section>;
  }

  const isMyTurn = view === "team" && !!myTeam && f.currentTeamId === myTeam.id;
  const naming = f.stage === "name" || f.stage === "name_result";

  // ---------------------------------------------------------- 1판 중간 집계 · 최종 결과
  if (game.phase === "face_break" || game.phase === "face_result" || f.stage === "done") {
    const isBreak = game.phase === "face_break";
    const found = f.history.filter(h => !isBreak || h.board === 1);
    return <div className={`face-layout face-${view} face-summary`}>
      <section className="face-card">
        <div className="face-label">ROUND {game.rounds?.face ?? 1} · {isBreak ? "1판 종료" : "결과"}</div>
        <h2 className="face-title">{isBreak ? "1판 종료 · 중간 집계" : "얼굴 카드 매치 종료"}</h2>
        <p className="face-muted">{isBreak ? `1판에서 ${f.found} / ${f.pairs}쌍을 찾았습니다. 잠시 후 2판(${BOARDS[1].pairs}쌍)이 시작됩니다.` : `찾은 사람 ${found.length}명`}</p>
        {view === "team" && myTeam && <div className="face-mine"><strong>+{fmt(myTeam.faceChange)}칩</strong><p>얼굴 카드 매치에서 얻은 칩 · 보유 {fmt(myTeam.chips)}칩</p></div>}
        <div className="face-found-grid">{found.map(h => <figure key={h.personId}>{h.photo && <img src={photoUrl(h.photo)} alt="" />}<figcaption>{h.name}</figcaption></figure>)}</div>
      </section>
      {view !== "team" && <TeamChips game={game} title="테이블별 누적 칩" />}
    </div>;
  }

  // ---------------------------------------------------------- 진행
  const openCards = f.board.filter(c => c.open);
  const statusLine = f.stage === "select"
    ? isMyTurn ? (openCards.length === 1 ? "한 장 더 골라 주세요!" : "우리 테이블 차례! 카드 두 장을 골라 주세요.") : `${tableName(game, f.currentTeamId)}이 카드를 고르는 중`
    : f.stage === "mismatch" ? "다른 사람이에요. 카드를 다시 덮습니다."
    : f.stage === "name" ? `${tableName(game, f.currentTeamId)} 짝 성공! +${match}칩 · 이 사람의 이름은?`
    : `정답: ${f.result?.name ?? ""}`;
  const boardLabel = `${f.boardNo}판 / ${f.boards}판 · ${f.found} / ${f.pairs}쌍 찾음`;

  // 폰에서 이름 맞히기 중에는 카드판 없이 사진·입력칸만
  if (view === "team" && naming) {
    return <div className="face-layout face-team face-naming">
      <MyChips team={myTeam} label={boardLabel} />
      <NamePanel game={game} view={view} busy={busy} seconds={seconds} openPhoto={openCards[0]?.photo ?? null} onAnswer={onAnswer} />
    </div>;
  }

  const showClock = seconds !== null && (f.stage === "select" || f.stage === "name");
  // 빔: 한 줄 머리글 (차례 · 상태 · 큰 남은 시간) → 카드를 최대한 크게
  const beamHead = <div className="face-beam-head">
    <div className="face-turn-badge"><small>지금 차례</small><strong>{tableName(game, f.currentTeamId)}</strong></div>
    <div className="face-beam-status">
      <small>ROUND {game.rounds?.face ?? 1} · 얼굴 카드 매치 · {boardLabel}{f.nextTeamId && f.nextTeamId !== f.currentTeamId ? ` · 다음 ${tableName(game, f.nextTeamId)}` : ""}</small>
      <p className={`face-status ${f.stage}`}>{statusLine}</p>
    </div>
    <div className={`face-beam-clock ${showClock ? "" : "idle"} ${showClock && seconds! <= 5 ? "urgent" : ""}`} aria-live="off"><small>남은 시간</small><strong>{showClock ? seconds : "–"}</strong><span>초</span></div>
  </div>;
  const board = <section className="face-card face-board-card">
    {view === "beam" ? beamHead : <><div className="face-top">
      <span>{view === "team" ? boardLabel : `ROUND ${game.rounds?.face ?? 1} · 얼굴 카드 매치 · ${boardLabel}`}</span>
      {showClock && <span className="face-clock">남은 시간 <strong>{seconds}</strong>초</span>}
    </div>
    <div className="face-turn">
      <div className={`face-turn-badge ${isMyTurn ? "mine" : ""}`}><small>지금 차례</small><strong>{tableName(game, f.currentTeamId)}</strong></div>
      <p className={`face-status ${f.stage}`}>{statusLine}</p>
      {view !== "team" && f.nextTeamId && f.nextTeamId !== f.currentTeamId && <span className="face-next">다음 {tableName(game, f.nextTeamId)}</span>}
    </div></>}
    {f.stopAfterTurn && <p className="face-muted">이번 차례가 끝나면 {f.boardNo}판을 종료합니다.</p>}
    <div className="face-board-fit"><div ref={boardRef} className="face-board" role="list" aria-label="카드 판" style={{ "--cols": f.cols } as CSSProperties}>
      {f.board.map(card => {
        const clickable = isMyTurn && f.stage === "select" && !card.open && !card.removed && !busy && seconds !== 0;
        return <button key={card.index} type="button" role="listitem" disabled={!clickable}
          className={`face-tile ${card.open ? "open" : ""} ${card.removed ? "removed" : ""} ${clickable ? "clickable" : ""} ${card.open && f.stage === "mismatch" ? "miss" : ""} ${card.open && naming ? "hit" : ""}`}
          onClick={() => clickable && onPick?.(card.index)} aria-label={card.removed ? `${card.index + 1}번 카드 찾음` : card.open ? `${card.index + 1}번 카드 뒤집힘` : `${card.index + 1}번 카드`}>
          <span className="face-inner">
            <span className="face-back"><i>✦</i><b>{card.index + 1}</b></span>
            <span className="face-front">{card.photo && <img src={photoUrl(card.photo)} alt="" draggable={false} />}{view === "host" && card.removed && card.name && <em>{card.name}</em>}</span>
          </span>
        </button>;
      })}
    </div></div>
  </section>;

  if (view === "team") return <div className="face-layout face-team"><MyChips team={myTeam} />{board}</div>;
  // 빔: 카드판만 크게 (순위는 각 판이 끝날 때만), 이름 맞히기 중에만 오른쪽에 사진·제출 현황
  // 운영자: 왼쪽 카드판, 오른쪽은 이름 맞히기 또는 테이블별 누적 칩
  const side = naming ? <NamePanel game={game} view={view} busy={busy} seconds={seconds} openPhoto={openCards[0]?.photo ?? null} onAnswer={onAnswer} />
    : view === "host" ? <TeamChips game={game} title="테이블별 누적 칩" highlight={f.currentTeamId} /> : null;
  return <div className={`face-layout face-${view} face-play-grid ${side ? "" : "face-solo"}`}>
    {board}
    {side}
  </div>;
}

/** 폰 상단: 우리 테이블 보유 칩 */
function MyChips({ team, label }: { team?: Team; label?: string }) {
  if (!team) return null;
  return <div className="face-mychips"><span>우리 테이블 칩{label ? ` · ${label}` : ""}</span><strong>{fmt(team.chips)}<small>칩</small></strong></div>;
}

/** 빔·운영자: 테이블별 누적 칩 순위 */
function TeamChips({ game, title, highlight }: { game: FaceGame; title: string; highlight?: string | null }) {
  const ranking = [...game.teams].sort((a, b) => b.chips - a.chips || a.table - b.table);
  return <section className="face-card face-ranking">
    <h2>{title}</h2>
    {ranking.map(t => <div key={t.id} className={t.id === highlight ? "now" : ""}>
      <span className="face-rank">{ranking.findIndex(o => o.chips === t.chips) + 1}</span>
      <strong>{t.table}번 테이블</strong>
      <b>{fmt(t.chips)}칩</b>
    </div>)}
  </section>;
}

function NamePanel({ game, view, busy, seconds, openPhoto, onAnswer }: { game: FaceGame; view: "team" | "beam" | "host"; busy: boolean; seconds: number | null; openPhoto: string | null; onAnswer?: (answer: string) => void }) {
  const f = game.face!;
  const s = game.settings;
  const match = s.faceMatchBonus ?? 100;
  const nameBonus = s.faceNameBonus ?? 50;
  const [draft, setDraft] = useState("");
  const myTeam = game.teams.find(t => t.id === game.myTeamId);
  useEffect(() => { setDraft(""); }, [f.turnId]);
  const iMatched = !!myTeam && f.currentTeamId === myTeam.id;
  const sortedTeams = [...game.teams].sort((a, b) => a.table - b.table);

  if (f.stage === "name") return <section className="face-card face-name-card">
    {view === "team" && (iMatched
      ? <div className="face-banner hit">🎉 짝 성공! <b>+{match}칩</b> · 이름까지 맞히면 <b>+{nameBonus}칩</b> 더!</div>
      : <div className="face-banner">{tableName(game, f.currentTeamId)} 짝 성공! 이름을 맞히면 <b>+{nameBonus}칩</b></div>)}
    <div className="face-name-photo">{openPhoto && <img src={photoUrl(openPhoto)} alt="이름을 맞힐 사람" />}</div>
    <h2>이 사람의 이름은?</h2>
    {view === "team" && myTeam && <form className="face-answer" onSubmit={e => { e.preventDefault(); if (draft.trim()) onAnswer?.(draft.trim()); }}>
      <input value={draft} onChange={e => setDraft(e.target.value)} maxLength={40} placeholder="이름 입력" autoComplete="off" aria-label="이름" disabled={busy || seconds === 0} enterKeyHint="send" />
      <button className="primary" disabled={busy || !draft.trim() || seconds === 0}>{f.myAnswer === null ? "제출" : "수정"} <span>→</span></button>
    </form>}
    {view === "team" && seconds !== null && <p className="face-muted">남은 시간 {seconds}초</p>}
    {view === "team" && f.myAnswer !== null && <p className="face-confirm">✓ 제출한 답: <b>{f.myAnswer}</b> (시간 안에 수정 가능)</p>}
    {view === "host" && f.hostAnswer && <p className="face-confirm">정답(운영자만 보임): <b>{f.hostAnswer}</b></p>}
    <p className="face-submitted">제출 <strong>{f.submitted.length}</strong> / {game.teams.length} 테이블</p>
    {view !== "team" && <div className="face-status-grid">{sortedTeams.map(t => <div key={t.id} className={f.submitted.includes(t.id) ? "done" : ""}><b>{t.table}</b><span>{f.submitted.includes(t.id) ? (view === "host" && f.hostAnswers?.[t.id] ? f.hostAnswers[t.id] : "제출") : "입력 중"}</span></div>)}</div>}
  </section>;

  // 정답 공개: 이번 차례에 칩을 얻은 테이블과 금액 (짝 +100, 이름 +50, 둘 다 +150)
  const mine = myTeam ? turnGain(f, myTeam.id, match, nameBonus) : null;
  const gainers = sortedTeams.map(t => ({ t, g: turnGain(f, t.id, match, nameBonus) })).filter(x => x.g.total > 0).sort((a, b) => b.g.total - a.g.total || a.t.table - b.t.table);
  return <section className="face-card face-name-card">
    <div className="face-name-photo">{openPhoto && <img src={photoUrl(openPhoto)} alt="" />}</div>
    <h2 className="face-answer-reveal">{f.result?.name}</h2>
    {view === "team" && mine && <div className={`face-mine ${mine.total > 0 ? "won" : ""}`}>
      <strong>{mine.matched && mine.named ? `+${match + nameBonus}칩!` : mine.matched ? `+${match}칩` : mine.named ? `정답! +${nameBonus}칩` : "아쉬워요"}</strong>
      <p>{mine.matched && mine.named ? `짝 성공 +${match} · 이름 정답 +${nameBonus}` : mine.matched ? `짝 성공 +${match} · 이름은 아쉬워요` : mine.named ? "이름을 맞혔어요" : "이번 이름은 놓쳤어요"}</p>
      {f.result?.answers[myTeam!.id] !== undefined && <span>우리 답: {f.result.answers[myTeam!.id]}</span>}
    </div>}
    <p className="face-submitted">정답 <strong>{f.result?.winners.length ?? 0}</strong> / {game.teams.length} 테이블</p>
    {view !== "team" && <div className="face-gains">{gainers.length ? gainers.map(({ t, g }) => <div key={t.id} className={g.matched && g.named ? "best" : ""}>
      <b>{t.table}번</b>
      <span>{g.matched && g.named ? `짝 +${match} · 이름 +${nameBonus}` : g.matched ? "짝 성공" : "이름 정답"}</span>
      <strong>+{g.total}</strong>
    </div>) : <p className="face-muted">이번 차례에 칩을 얻은 테이블이 없습니다.</p>}</div>}
  </section>;
}
