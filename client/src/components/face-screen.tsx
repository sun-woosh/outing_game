import { useEffect, useRef, useState } from "react";
import "./face-screen.css";
import type { Game } from "../types";

type FaceCard = { index: number; open: boolean; removed: boolean; photo: string | null; name: string | null };
export type FaceView = {
  stage: "select" | "mismatch" | "name" | "name_result" | "done";
  turnId: string; deadline: number | null; currentTeamId: string | null; nextTeamId: string | null; order: string[];
  pairs: number; found: number; stopAfterTurn: boolean; board: FaceCard[]; submitted: string[]; myAnswer: string | null;
  hostAnswer?: string | null; hostAnswers?: Record<string, string> | null;
  result: { personId: string; name: string; attackerId: string; winners: string[]; answers: Record<string, string> } | null;
  history: { personId: string; name: string; attackerId: string; winners: string[]; photo: string | null }[];
};
type FaceGame = Pick<Game, "phase" | "face" | "teams" | "myTeamId" | "settings" | "rounds">;
type Props = { game: FaceGame; view: "team" | "beam" | "host"; busy: boolean; seconds: number | null; onPick?: (index: number) => void; onAnswer?: (answer: string) => void };

const photoUrl = (id: string | null) => (id ? `/photos/${id}` : "");
const tableName = (game: FaceGame, id: string | null | undefined) => {
  const t = game.teams.find(team => team.id === id);
  return t ? `${t.table}번 테이블` : "-";
};

export default function FaceScreen({ game, view, busy, seconds, onPick, onAnswer }: Props) {
  const f = game.face;
  const s = game.settings;
  const match = s.faceMatchBonus ?? 100;
  const nameBonus = s.faceNameBonus ?? 50;
  const myTeam = game.teams.find(t => t.id === game.myTeamId);
  const people = s.facePeopleCount ?? s.facePeople?.length ?? 0;
  const boardRef = useRef<HTMLDivElement>(null);
  const myTurnNow = view === "team" && !!myTeam && f?.stage === "select" && f.currentTeamId === myTeam.id;
  // 우리 차례가 되면 카드판을 화면에 보이게 하고 진동으로 알림
  useEffect(() => {
    if (!myTurnNow) return;
    boardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    try { navigator.vibrate?.([120, 60, 120]); } catch { /* 지원 안 하는 기기 */ }
  }, [myTurnNow, f?.turnId]);

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
      <p className="face-note">카드 {people * 2}장 · {people}쌍 · 카드 선택 {s.faceSelectSeconds ?? 30}초, 이름 입력 {s.faceNameSeconds ?? 30}초 <br />시간 안에 고르지 않으면 카드가 무작위로 뒤집힙니다. 다른 테이블 차례에도 카드 위치를 잘 기억해 두세요!</p>
      <p className="face-muted">모든 짝을 찾으면 끝나고, 얻은 칩은 다음 라운드로 이어집니다.</p>
    </section>;
  }

  const isMyTurn = view === "team" && !!myTeam && f.currentTeamId === myTeam.id;
  const ranking = [...game.teams].sort((a, b) => b.chips - a.chips || a.table - b.table);

  if (game.phase === "face_result" || f.stage === "done") {
    return <div className={`face-layout face-${view}`}>
      <section className="face-card">
        <div className="face-label">ROUND {game.rounds?.face ?? 1} · 결과</div>
        <h2 className="face-title">얼굴 카드 매치 종료</h2>
        <p className="face-muted">{f.found} / {f.pairs}쌍을 찾았습니다.</p>
        {view === "team" && myTeam && <div className="face-mine"><strong>+{(myTeam.faceChange ?? 0).toLocaleString()}칩</strong><p>얼굴 카드에서 얻은 칩 · 보유 {myTeam.chips.toLocaleString()}칩</p></div>}
        <div className="face-found-grid">{f.history.map(h => <figure key={h.personId}>{h.photo && <img src={photoUrl(h.photo)} alt="" />}<figcaption>{h.name}</figcaption></figure>)}</div>
      </section>
      {view !== "team" && <section className="face-card face-ranking"><h2>테이블별 칩</h2>{ranking.map(t => <div key={t.id}><strong>{t.table}번 테이블</strong><span>+{(t.faceChange ?? 0).toLocaleString()}</span><b>{t.chips.toLocaleString()}칩</b></div>)}</section>}
    </div>;
  }

  const openCards = f.board.filter(c => c.open);
  const statusLine = f.stage === "select"
    ? isMyTurn ? (f.board.filter(c => c.open).length === 1 ? "한 장 더 골라 주세요!" : "우리 테이블 차례! 카드 두 장을 골라 주세요.") : `${tableName(game, f.currentTeamId)}이 카드를 고르는 중`
    : f.stage === "mismatch" ? "다른 사람이에요. 카드를 다시 덮습니다."
    : f.stage === "name" ? `${tableName(game, f.currentTeamId)} 짝 성공! 이 사람의 이름은?`
    : `정답: ${f.result?.name ?? ""}`;

  return <div className={`face-layout face-${view} ${f.stage === "name" || f.stage === "name_result" ? "face-naming" : ""}`}>
    <section className="face-card face-board-card">
      <div className="face-top">
        <span>{view === "team" ? "" : `ROUND ${game.rounds?.face ?? 1} · 얼굴 카드 · `}{f.found} / {f.pairs}쌍 찾음</span>
        {seconds !== null && (f.stage === "select" || f.stage === "name") && <span className="face-clock">남은 시간 <strong>{seconds}</strong>초</span>}
      </div>
      <div className="face-turn">
        <div className={`face-turn-badge ${isMyTurn ? "mine" : ""}`}><small>지금 차례</small><strong>{tableName(game, f.currentTeamId)}</strong></div>
        <p className={`face-status ${f.stage}`}>{statusLine}</p>
        {view !== "team" && f.nextTeamId && f.nextTeamId !== f.currentTeamId && <span className="face-next">다음 {tableName(game, f.nextTeamId)}</span>}
      </div>
      {f.stopAfterTurn && <p className="face-muted">이번 차례가 끝나면 얼굴 카드를 종료합니다.</p>}
      <div ref={boardRef} className={`face-board n${Math.min(f.board.length, 40)}`} role="list" aria-label="카드 판">
        {f.board.map(card => {
          const clickable = isMyTurn && f.stage === "select" && !card.open && !card.removed && !busy && seconds !== 0;
          return <button key={card.index} type="button" role="listitem" disabled={!clickable}
            className={`face-tile ${card.open ? "open" : ""} ${card.removed ? "removed" : ""} ${clickable ? "clickable" : ""} ${card.open && f.stage === "mismatch" ? "miss" : ""} ${card.open && (f.stage === "name" || f.stage === "name_result") ? "hit" : ""}`}
            onClick={() => clickable && onPick?.(card.index)} aria-label={card.removed ? `${card.index + 1}번 카드 찾음` : card.open ? `${card.index + 1}번 카드 뒤집힘` : `${card.index + 1}번 카드`}>
            <span className="face-inner">
              <span className="face-back"><i>✦</i><b>{card.index + 1}</b></span>
              <span className="face-front">{card.photo && <img src={photoUrl(card.photo)} alt="" draggable={false} />}{view === "host" && card.removed && card.name && <em>{card.name}</em>}</span>
            </span>
          </button>;
        })}
      </div>
    </section>
    {(f.stage === "name" || f.stage === "name_result") && <NamePanel game={game} view={view} busy={busy} seconds={seconds} openPhoto={openCards[0]?.photo ?? null} onAnswer={onAnswer} />}
  </div>;
}

function NamePanel({ game, view, busy, seconds, openPhoto, onAnswer }: { game: FaceGame; view: "team" | "beam" | "host"; busy: boolean; seconds: number | null; openPhoto: string | null; onAnswer?: (answer: string) => void }) {
  const f = game.face!;
  const [draft, setDraft] = useState("");
  const myTeam = game.teams.find(t => t.id === game.myTeamId);
  useEffect(() => { setDraft(""); }, [f.turnId]);
  const submittedCount = f.submitted.length;
  const won = f.result && myTeam ? f.result.winners.includes(myTeam.id) : false;
  return <section className="face-card face-name-card">
    <div className="face-name-photo">{openPhoto && <img src={photoUrl(openPhoto)} alt="이름을 맞힐 사람" />}</div>
    {f.stage === "name" ? <>
      <h2>이 사람의 이름은?</h2>
      {view === "team" && myTeam ? <form className="face-answer" onSubmit={e => { e.preventDefault(); if (draft.trim()) onAnswer?.(draft.trim()); }}>
        <input value={draft} onChange={e => setDraft(e.target.value)} maxLength={40} placeholder="이름 입력" autoComplete="off" aria-label="이름" disabled={busy || seconds === 0} />
        <button className="primary" disabled={busy || !draft.trim() || seconds === 0}>{f.myAnswer === null ? "제출" : "수정"} <span>→</span></button>
      </form> : null}
      {view === "team" && f.myAnswer !== null && <p className="face-confirm">✓ 제출한 답: <b>{f.myAnswer}</b> (시간 안에 수정 가능)</p>}
      {view === "host" && f.hostAnswer && <p className="face-confirm">정답(운영자만 보임): <b>{f.hostAnswer}</b></p>}
      <p className="face-submitted">제출 <strong>{submittedCount}</strong> / {game.teams.length} 테이블</p>
      {view !== "team" && <div className="face-status-grid">{[...game.teams].sort((a, b) => a.table - b.table).map(t => <div key={t.id} className={f.submitted.includes(t.id) ? "done" : ""}><b>{t.table}</b><span>{f.submitted.includes(t.id) ? (view === "host" && f.hostAnswers?.[t.id] ? f.hostAnswers[t.id] : "제출") : "입력 중"}</span></div>)}</div>}
    </> : <>
      <h2 className="face-answer-reveal">{f.result?.name}</h2>
      {view === "team" && myTeam && <div className={`face-mine ${won ? "won" : ""}`}><strong>{won ? `정답! +${(game.settings.faceNameBonus ?? 50).toLocaleString()}칩` : "아쉬워요"}</strong>{f.result?.answers[myTeam.id] !== undefined && <p>우리 답: {f.result.answers[myTeam.id]}</p>}</div>}
      <p className="face-submitted">정답 <strong>{f.result?.winners.length ?? 0}</strong> / {game.teams.length} 테이블</p>
      {view !== "team" && <div className="face-status-grid">{[...game.teams].sort((a, b) => a.table - b.table).map(t => <div key={t.id} className={f.result?.winners.includes(t.id) ? "done" : ""}><b>{t.table}</b><span>{f.result?.winners.includes(t.id) ? "정답" : view === "host" && f.result?.answers[t.id] ? f.result.answers[t.id] : "-"}</span></div>)}</div>}
    </>}
  </section>;
}
