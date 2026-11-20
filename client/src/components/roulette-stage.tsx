import { useEffect, useState } from "react";
import Wheel from "./roulette-wheel";
import { colorLabel, fmt, teamName, type Color, type Game } from "../types";

type Props = {
  game: Game; view: "team" | "beam"; busy: boolean; resultHidden: boolean; spinOffsetMs: number; seconds: number | null;
  onBet: (color: Color, amount: number) => void; onSkip: () => void; onUndoSkip: () => void;
};

/** 룰렛 라운드: 휠 + (폰) 베팅 패널 / (빔) 테이블 순위 */
export default function RouletteStage({ game, view, busy, resultHidden, spinOffsetMs, seconds, onBet, onSkip, onUndoSkip }: Props) {
  const betting = game.phase === "roulette_betting";
  const betOpen = betting && (!!game.rouletteDeadline || !!game.paused);
  // 빔: 회전 중에는 휠만 크게 (베팅 중에는 남은 시간과 테이블별 베팅 현황을 함께)
  const focus = view === "beam" && game.phase === "roulette_result" && resultHidden;
  return <div className={`game-grid roulette-stage ${focus ? "roulette-focus" : ""}`}>
    <section className="table card">
      <div className="table-top">
        <span className="status"><i /> {resultHidden ? "룰렛 회전 중" : betting ? "베팅 진행 중" : game.phase === "roulette_result" ? "결과 발표" : "게임 종료"}</span>
        {betting && seconds !== null ? <span className={`bet-clock ${seconds <= 10 ? "urgent" : ""}`}>베팅 마감까지 <strong>{seconds}</strong>초</span>
          : betting && !betOpen ? <span className="bet-clock">베팅 마감 · 곧 룰렛이 돌아갑니다</span>
          : <span className="round-tag">ROUND {game.rounds.roulette} · {game.round} / {game.settings.rouletteSpins}</span>}
      </div>
      <div className="table-body">
        <Wheel result={game.result} spinning={resultHidden} spinOffsetMs={spinOffsetMs} />
        {!focus && !betting && <div className="wheel-caption">{resultHidden
          ? <><small>GOOD LUCK</small><strong>룰렛이 돌아갑니다!</strong><p>어떤 색이 나올까요?</p></>
          : <><small>THE WINNING COLOR</small><strong className={game.result === "red" ? "red-text" : "ivory"}>{game.result ? colorLabel(game.result) : "게임 종료"} <span className="result-dot" /></strong><p>결과가 나왔습니다!</p></>}
        </div>}
      </div>
    </section>
    {view === "team" ? <BetPanel game={game} busy={busy} resultHidden={resultHidden} betOpen={betOpen} seconds={seconds} onBet={onBet} onSkip={onSkip} onUndoSkip={onUndoSkip} />
      : !focus && <Leaderboard game={game} resultHidden={resultHidden} />}
  </div>;
}

function BetPanel({ game, busy, resultHidden, betOpen, seconds, onBet, onSkip, onUndoSkip }: Pick<Props, "game" | "busy" | "resultHidden" | "seconds" | "onBet" | "onSkip" | "onUndoSkip"> & { betOpen: boolean }) {
  const [color, setColor] = useState<Color | null>(null);
  const [amount, setAmount] = useState("");
  const me = game.teams.find(t => t.id === game.myTeamId);
  useEffect(() => { setColor(null); setAmount(""); }, [game.room, game.round]);
  const mine = game.history.find(h => h.round === game.round)?.teams.find(e => e.id === me?.id);
  const value = Number(amount);
  const valid = !!color && !!me && Number.isSafeInteger(value) && value >= 1 && value <= me.chips;

  if (resultHidden) return <section className="bet-panel card"><div className="waiting" role="status"><div className="waiting-icon">✦</div><h2>결과 공개 중</h2><p className="muted">룰렛이 멈추면 결과를 확인할 수 있어요.</p></div></section>;
  return <section className="bet-panel card">
    <div className="card-kicker">보유 칩 · YOUR CHIPS</div>
    <div className="chips-total"><strong>{fmt(me?.chips)}</strong><span>CHIPS</span></div>
    <div className="divider" />
    {(game.phase === "roulette_result" || game.phase === "finished") && me
      ? <div className="participant-roulette-result" role="status">
          <p>{game.phase === "finished" ? "게임 종료" : "이번 룰렛 결과"}{game.result && <> · <strong>{colorLabel(game.result)}</strong></>}</p>
          <div>
            <span>이번 판 {mine ? `${colorLabel(mine.color)} ${fmt(mine.amount)}칩 베팅` : "베팅 없음"}</span>
            <strong className={(mine?.change ?? 0) < 0 ? "negative" : ""}>{(mine?.change ?? 0) > 0 ? "+" : ""}{fmt(mine?.change)}<small>칩</small></strong>
          </div>
          <p>최종 순위는 빔 화면에서 확인해 주세요.</p>
        </div>
      : game.phase === "roulette_betting" && me?.skipped
      ? <div className="waiting"><div className="waiting-icon">✦</div><h2>이번 판은 건너뜁니다</h2><p className="muted">칩은 그대로 유지됩니다.{betOpen ? " 베팅 마감 전까지 바꿀 수 있어요." : ""}</p>{betOpen && <button className="outline full" disabled={busy} onClick={onUndoSkip}>다시 베팅하기</button>}</div>
      : game.phase === "roulette_betting" && me && me.chips > 0 && !betOpen
      ? <div className="waiting"><div className="waiting-icon">✦</div><h2>베팅 마감</h2><p className="muted">{me.bet?.color ? `${me.bet.color === "red" ? "빨강" : "검정"}에 ${fmt(me.bet.amount)}칩을 걸었어요. 곧 룰렛이 돌아갑니다!` : "곧 룰렛이 돌아갑니다!"}</p></div>
      : game.phase === "roulette_betting" && me && me.chips > 0
      ? <>
          {seconds !== null && <p className={`bet-clock ${seconds <= 10 ? "urgent" : ""}`}>베팅 마감까지 <strong>{seconds}</strong>초</p>}
          <h2>어디에 걸까요?</h2>
          <p className="muted">색을 선택하고 베팅할 칩을 정해 주세요.</p>
          <div className="color-choice">
            {(["red", "black"] as const).map(c => <button key={c} className={`color-button ${c} ${color === c ? "selected" : ""}`} aria-pressed={color === c} onClick={() => setColor(c)}>
              <span className="bet-color-dot" aria-hidden="true">●</span>
              <span className="bet-color-name">{c === "red" ? "빨강" : "검정"} <small>{colorLabel(c)}</small></span>
              {color === c && <span className="bet-color-check" aria-hidden="true">✓</span>}
            </button>)}
          </div>
          <label>베팅할 칩<div className="amount-input"><input type="number" min="1" max={me.chips} step="1" inputMode="numeric" pattern="[0-9]*" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" /><span>CHIPS</span></div></label>
          <div className="quick-bets">
            <button onClick={() => setAmount(String(Math.max(1, Math.floor(me.chips / 2))))}>보유 칩의 절반</button>
            <button onClick={() => setAmount(String(me.chips))}>ALL IN</button>
          </div>
          <button className="primary full bet-submit" onClick={() => color && onBet(color, value)} disabled={busy || !valid}>{me.bet ? "베팅 변경하기" : "베팅하기"} <span>→</span></button>
          {me.bet?.color && <p className="bet-confirm" role="status">✓ 현재 베팅: {me.bet.color === "red" ? "빨강" : "검정"} · {fmt(me.bet.amount)}칩</p>}
          <button className="outline full skip-bet-button" disabled={busy} onClick={onSkip}>{me.bet ? "기존 베팅 취소하고 건너뛰기" : "이번 판 베팅 안 하기"}</button>
          <p className="muted skip-bet-hint">베팅하지 않으면 보유 칩이 그대로 유지됩니다.</p>
        </>
      : <div className="waiting"><div className="waiting-icon">✦</div>
          <h2>{!me?.chips ? "베팅할 칩이 없어요" : game.phase === "finished" ? "게임이 끝났어요" : "잠시만 기다려 주세요"}</h2>
          <p className="muted">{!me?.chips ? "이번 라운드는 관전해 주세요." : game.phase === "finished" ? "최종 순위를 확인해 보세요." : "운영자가 다음 순서를 진행합니다."}</p>
        </div>}
  </section>;
}

function Leaderboard({ game, resultHidden }: { game: Game; resultHidden: boolean }) {
  const ranking = [...game.teams].sort((a, b) => b.chips - a.chips || a.table - b.table);
  const last = game.history.find(h => h.round === game.round);
  const betting = game.phase === "roulette_betting";
  return <section className={`leaderboard card host-board ${resultHidden ? "concealed" : ""} ${!betting ? "roulette-leaderboard-results" : ""}`}>
    <div className="section-head"><div><div className="card-kicker">LEADERBOARD</div><h2>{game.phase === "finished" ? "최종 순위" : "테이블 순위"}</h2></div><span>{game.teams.length} TABLES</span></div>
    {resultHidden ? <p role="status" className="empty">결과 공개 중</p> : <div className="ranking">{ranking.map(team => {
      const rank = ranking.findIndex(t => t.chips === team.chips) + 1;
      const entry = last?.teams.find(t => t.id === team.id);
      const change = entry?.change ?? 0;
      return <div className="rank-row" key={team.id}>
        <span className={`rank-number ${rank === 1 ? "first" : ""}`}>{String(rank).padStart(2, "0")}</span>
        <div className="rank-name"><strong>{teamName(team)}</strong><span>{betting ? (team.bet ? "베팅 완료" : team.skipped ? "베팅 건너뜀 · 칩 유지" : team.chips === 0 ? "관전 중" : "베팅 대기") : entry ? `${colorLabel(entry.color)} · ${fmt(entry.amount)}칩 베팅` : "이번 회차 베팅 없음"}</span></div>
        {!betting && <span className={`roulette-rank-change ${change < 0 ? "negative" : change > 0 ? "positive" : "neutral"}`}>{change > 0 ? "+" : ""}{fmt(change)}<small>칩</small></span>}
        <div className="rank-chips"><strong>{fmt(team.chips)}</strong><small>CHIPS</small></div>
      </div>;
    })}</div>}
  </section>;
}
