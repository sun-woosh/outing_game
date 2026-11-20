import { fmt, type Settings } from "../types";

/** 룰렛 라운드 안내 화면 */
export default function GameTutorial({ round, settings, view }: { round: number; settings: Settings; view: "team" | "beam" }) {
  return <section className={`tutorial-card card tutorial-${view}`} aria-label="룰렛 게임 설명">
    <div className="tutorial-header">
      <div>
        <div className="card-kicker">HOW TO PLAY · ROUND {String(round).padStart(2, "0")}</div>
        <h2>색을 고르고, 칩을 걸어라!</h2>
        <p>빨강과 검정 중 하나를 고르고 베팅하거나, 이번 판을 건너뛸 수 있습니다.</p>
      </div>
      <span className="tutorial-round">ROULETTE</span>
    </div>
    <div className="tutorial-steps">
      <div><span>01</span><h3>빨강 또는 검정</h3><p>팀원과 상의해 색 하나를 선택합니다.</p></div>
      <div><span>02</span><h3>칩을 걸어요</h3><p>보유 칩 안에서 원하는 만큼 걸거나, 베팅하지 않고 이번 판을 넘길 수 있습니다.</p></div>
      <div><span>03</span><h3>맞히면 2배!</h3><p>맞히면 건 칩의 2배를 돌려받고, 틀리면 건 칩을 잃습니다.</p></div>
    </div>
    <div className="tutorial-example"><span>예를 들어</span><strong>10칩 베팅 → 적중 시 20칩 반환</strong><small>순이익 +10칩 · 실패 시 −10칩</small></div>
    <p className="tutorial-note">총 {fmt(settings.rouletteSpins)}번 돌린 뒤 칩이 가장 많은 테이블이 승리합니다. 동점이면 공동 순위입니다. 칩이 0이면 남은 룰렛은 관전합니다.</p>
    <div className="tutorial-wait"><span /> 운영자가 게임을 시작하면 화면이 바뀝니다.</div>
  </section>;
}
