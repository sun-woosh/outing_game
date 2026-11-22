import "./minority-screen.css";
import type { Game, Settings } from "../types";

type MinorityGame = Pick<Game, "phase" | "minorityRound" | "minorityPractice" | "minorityResult" | "teams" | "myTeamId" | "rounds"> & { settings: Pick<Settings, "minorityBonus" | "minorityPracticeQuestion" | "minorityQuestions" | "minorityRounds" | "minoritySeconds"> };

export default function MinorityScreen({ game, view, busy, seconds, onChoose }: { game: MinorityGame; view: "team" | "beam"; busy: boolean; seconds: number | null; onChoose: (choice: number) => void }) {
  const myTeam = game.teams.find(team => team.id === game.myTeamId);
  const question = game.minorityPractice ? game.settings.minorityPracticeQuestion : game.settings.minorityQuestions?.[(game.minorityRound ?? 1) - 1];
  const options = question?.options ?? ["A", "B"];
  const submitted = game.teams.filter(team => team.minoritySubmitted).length;
  const result = game.minorityResult;
  const ranking = [...game.teams].sort((a, b) => b.chips - a.chips || a.table - b.table);
  if (game.phase === "minority_tutorial") return <section className="minority-card minority-guide">
    <div className="minority-label">ROUND {game.rounds.minority} · GAME INTRO</div>
    <h2>소수의 선택</h2>
    <p>맞고 틀림은 상관없어요. <b>다른 테이블이 가장 안 고를 것 같은 답</b>을 골라 주세요.</p>
    <div className="minority-steps">
      <div><strong>1</strong><span>테이블에서 상의해 <br />보기 하나를 선택해요.</span></div>
      <div><strong>2</strong><span>가장 적은 테이블이 고른 <br />보기가 승리 · <b>+{(game.settings.minorityBonus ?? 0).toLocaleString()}칩</b></span></div>
      <div><strong>3</strong><span>문제당 {game.settings.minoritySeconds ?? 30}초 · 시간이 끝나면 <br />자동으로 결과 발표</span></div>
    </div>
    <p className="minority-guide-note">총 {game.settings.minorityRounds ?? game.settings.minorityQuestions?.length}문제 · 시간 안에는 선택을 바꿀 수 있어요.</p>
    <p className="minority-muted">가장 적은 수가 같으면 함께 득점해요. 선택된 보기의 테이블 수가 모두 같으면 아무도 득점하지 못해요.</p>
    <p className="minority-muted">먼저 칩 변동 없는 연습 문제를 한 번 풀어 봅니다.</p>
  </section>;
  return <div className={`minority-layout minority-${view}`}><section className="minority-card"><div className="minority-top"><span>{game.minorityPractice ? "연습 문제" : `${game.minorityRound ?? 1} / ${game.settings.minorityRounds ?? game.settings.minorityQuestions?.length ?? 1}번째 문제`}</span>{game.phase === "minority_play" && seconds !== null && <span className="minority-clock">남은 시간 <strong>{seconds}</strong>초</span>}{game.phase === "minority_result" && seconds !== null && <span className="minority-clock minority-next-clock">다음 문제까지 <strong>{seconds}</strong>초</span>}</div><h2 className="minority-question">{question?.question || "문제를 준비하고 있습니다"}</h2>
    {game.phase === "minority_play" ? view === "team" ? <><p className="minority-prompt">{seconds === 0 ? "선택 시간이 끝났습니다." : myTeam?.minoritySubmitted ? "선택을 완료했어요. 시간이 끝나기 전까지 변경할 수 있어요." : "우리 테이블의 선택을 눌러주세요."}</p><div className="minority-options">{options.map((option, index) => <button type="button" key={index} className={myTeam?.minorityChoice === index ? "selected" : ""} aria-pressed={myTeam?.minorityChoice === index} disabled={busy || seconds === 0 || !myTeam} onClick={() => onChoose(index)}><span>{String.fromCharCode(65 + index)}</span><strong>{option}</strong>{myTeam?.minorityChoice === index && <b>✓ 선택</b>}</button>)}</div>{myTeam?.minoritySubmitted && <p className="minority-choice-confirm" role="status">✓ 선택이 접수되었습니다.</p>}<div className="minority-balance">보유 칩 <strong>{(myTeam?.chips ?? 0).toLocaleString()}</strong>칩</div></> : <><div className="minority-options minority-options-display">{options.map((option,index) => <div key={index}><span>{String.fromCharCode(65 + index)}</span><strong>{option}</strong></div>)}</div><p className="minority-submitted">선택 완료 <strong>{submitted}</strong> / {game.teams.length} 테이블</p><div className="minority-status-grid">{game.teams.map(team => <div key={team.id} className={team.minoritySubmitted ? "done" : ""}><b>{team.table}</b><span>{team.minoritySubmitted ? "완료" : "선택 중"}</span></div>)}</div></>
    : <><div className="minority-options minority-options-display minority-result-options">{options.map((option,index) => <div key={index} className={result?.winningChoices.includes(index) ? "winner" : ""}><span>{String.fromCharCode(65 + index)}</span><strong>{option}</strong><b>{result?.counts[index] ?? 0}팀 {result?.winningChoices.includes(index) ? "· 소수 선택" : ""}</b></div>)}</div>{game.minorityPractice && <p className="minority-prompt">연습 문제입니다. 실제 칩에는 반영되지 않습니다.</p>}{result?.outcome === "tie" && <p className="minority-prompt">선택한 보기의 팀 수가 같아 칩 변동이 없습니다.</p>}{result?.outcome === "none" && <p className="minority-prompt">선택된 보기가 하나 이하라 칩 변동이 없습니다.</p>}{view === "team" && myTeam && <div className="minority-confirm"><strong>{game.minorityPractice ? ((myTeam.minorityChange ?? 0) > 0 ? "소수 선택 성공!" : "연습 결과 확인") : (myTeam.minorityChange ?? 0) > 0 ? `+${myTeam.minorityChange}칩` : "이번 문제 칩 변동 없음"}</strong><p>보유 칩 {myTeam.chips.toLocaleString()}칩</p></div>}</>}
  </section>{view === "beam" && game.phase === "minority_result" && <section className={`minority-card minority-ranking ${ranking.length > 20 ? "many" : ""}`}><h2>테이블별 칩</h2>{ranking.map(team => <div key={team.id}><strong>{team.table}번 테이블</strong><span>{(team.minorityChange ?? 0) > 0 ? "+" : ""}{team.minorityChange ?? 0}칩</span><b>{team.chips.toLocaleString()}칩</b></div>)}</section>}</div>;
}
