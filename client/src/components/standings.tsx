import type React from "react";
import { chipBreakdown, fmt, ranked, roundsOf, signed, type Game } from "../types";
import "./standings.css";

/**
 * 순위 화면
 *   summary: 소수의 선택이 끝난 뒤 중간 순위 (룰렛 전)
 *   final:   게임 종료 후 최종 순위 (빔에는 1~3위 시상대)
 */
export default function Standings({ game, view, mode }: { game: Game; view: "team" | "beam"; mode: "summary" | "final" }) {
  const R = roundsOf(game);
  const rows = ranked(game.teams);
  const mine = rows.find(r => r.team.id === game.myTeamId);
  const showFace = !!R.face;
  const showAdjust = game.teams.some(t => (t.adjustTotal ?? 0) !== 0);
  const final = mode === "final";
  const columns: [string, (b: ReturnType<typeof chipBreakdown>) => number][] = [
    ...(showFace ? [["얼굴 카드", b => b.face] as [string, (b: ReturnType<typeof chipBreakdown>) => number]] : []),
    ["소수의 선택", b => b.minority],
    ...(final ? [["룰렛", b => b.roulette] as [string, (b: ReturnType<typeof chipBreakdown>) => number]] : []),
    ...(showAdjust ? [["조정", b => b.adjust] as [string, (b: ReturnType<typeof chipBreakdown>) => number]] : []),
  ];
  const kicker = final ? "FINAL RESULT" : `ROUND ${R.minority} COMPLETE`;
  const title = final ? "최종 순위" : "중간 순위";
  const lead = final ? "모든 게임이 끝났습니다. 수고하셨습니다!" : `다음은 ROUND ${R.roulette} 룰렛! 모은 칩을 걸어 순위를 뒤집을 수 있습니다.`;

  if (view === "team") {
    const b = mine ? chipBreakdown(mine.team) : null;
    return <section className="standings card standings-team">
      <div className="card-kicker">{kicker}</div>
      <h2>{title}</h2>
      {mine && b ? <div className={`standings-mine ${final && mine.rank === 1 ? "champion" : ""}`}>
        <span className="standings-mine-rank">{final && mine.rank === 1 ? "🏆 " : ""}{mine.rank}<small>위</small> <em>/ {rows.length}테이블</em></span>
        <strong>{fmt(mine.team.chips)}<small> CHIPS</small></strong>
        <dl>{columns.map(([label, pick]) => <div key={label}><dt>{label}</dt><dd>{signed(pick(b))}</dd></div>)}</dl>
      </div> : <p className="muted">테이블 정보를 찾을 수 없습니다.</p>}
      <p className="standings-lead">{lead}</p>
      <ol className="standings-top">{rows.slice(0, 3).map(({ team, rank }) => <li key={team.id} className={team.id === game.myTeamId ? "mine" : ""}><b>{rank}위</b><span>{team.table}번 테이블</span><strong>{fmt(team.chips)}칩</strong></li>)}</ol>
    </section>;
  }

  const podium = final ? [rows[1], rows[0], rows[2]].filter(Boolean) : [];
  return <div className={`standings standings-beam ${final ? "final" : "summary"}`}>
    <p className="standings-lead beam">{lead}</p>
    {final && rows.length > 0 && <div className="podium" role="list" aria-label="1~3위">
      {podium.map(({ team, rank }) => <div role="listitem" key={team.id} className={`podium-step p${rank}`}>
        <span className="podium-table">{team.table}번 테이블</span>
        <span className="podium-chips">{fmt(team.chips)} CHIPS</span>
        <div className="podium-block"><b>{rank}</b></div>
      </div>)}
    </div>}
    {(final ? rows.length > 3 : rows.length > 0) && <div className={`standings-table ${final ? "rest" : ""} ${rows.length > 8 ? "compact" : ""}`} role="table" style={{ "--cols": columns.length } as React.CSSProperties}>
      <div className="standings-row head" role="row"><span>순위</span><span>테이블</span>{columns.map(([label]) => <span key={label}>{label}</span>)}<span>합계</span></div>
      {(final ? rows.slice(3) : rows).map(({ team, rank }) => {
        const b = chipBreakdown(team);
        return <div className="standings-row" role="row" key={team.id}>
          <span className={`standings-rank ${rank === 1 ? "first" : ""}`}>{rank}</span>
          <strong>{team.table}번 테이블</strong>
          {columns.map(([label, pick]) => { const v = pick(b); return <span key={label} className={v > 0 ? "pos" : v < 0 ? "neg" : ""}>{signed(v)}</span>; })}
          <b>{fmt(team.chips)}</b>
        </div>;
      })}
    </div>}
  </div>;
}
