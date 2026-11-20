import type { Settings } from "./host-console";
import Cards from "./playing-cards";

type Props = { game: "blackjack" | "roulette"; settings: Settings; view: "team" | "beam" };
const fmt = (n: number) => n.toLocaleString("ko-KR");

export default function GameTutorial({ game, settings, view }: Props) {
  const blackjack = game === "blackjack";
  return <section className={`tutorial-card card tutorial-${view}`} aria-label={blackjack ? "블랙잭 게임 설명" : "룰렛 게임 설명"}>
    <div className="tutorial-header"><div><div className="card-kicker">HOW TO PLAY · ROUND {blackjack ? "01" : "02"}</div><h2>{blackjack ? "21에 가장 가까이!" : "색을 고르고, 칩을 걸어라!"}</h2><p>{blackjack ? "21을 넘지 않고 가장 가까운 테이블이 승리합니다." : "빨강과 검정 중 하나를 고르고 베팅하거나, 이번 판을 건너뛸 수 있습니다."}</p></div><span className="tutorial-round">{blackjack ? "BLACKJACK" : "ROULETTE"}</span></div>
    {blackjack ? <><div className="tutorial-steps"><div><div className="tutorial-card-back"><Cards hidden /></div><span>01</span><h3>카드 두 장</h3><p>각 테이블에 카드 두 장을 줍니다. A는 1점, J·Q·K는 10점입니다.</p></div><div><span>02</span><h3>한 장 더? 멈출까?</h3><p>30초 안에 카드를 더 받거나 멈추세요. 시간이 끝나거나 합계가 21이면 자동으로 멈춥니다.</p></div><div><span>03</span><h3>21 초과는 감점</h3><p>21을 넘으면 블랙잭에서 탈락합니다. 칩을 갖고 다음 룰렛에 참여할 수 있습니다.</p></div></div><div className="tutorial-rewards"><div><small>시작 칩</small><strong>{fmt(settings.initialChips)}칩</strong></div><div><small>승리</small><strong>+{fmt(settings.blackjackBonus)}칩</strong></div><div><small>21 이하 · 비우승</small><strong>변동 없음</strong></div><div><small>21 초과</small><strong>−{fmt(settings.blackjackPenalty)}칩</strong></div></div><p className="tutorial-note">블랙잭은 총 {fmt(settings.blackjackRounds ?? 1)}턴 진행하며 칩은 누적됩니다. {(settings.blackjackRounds ?? 1) > 1 && "마지막 턴 전까지 결과를 5초간 보여준 뒤 다음 턴이 자동 시작됩니다. "}동점이면 공동 승리이며, 21 초과 시 최소 1칩은 남습니다.</p></> : <><div className="tutorial-steps"><div><span>01</span><h3>빨강 또는 검정</h3><p>팀원과 상의해 색 하나를 선택합니다.</p></div><div><span>02</span><h3>칩을 걸어요</h3><p>보유 칩 안에서 원하는 만큼 걸거나, 베팅하지 않고 이번 판을 넘길 수 있습니다.</p></div><div><span>03</span><h3>맞히면 2배!</h3><p>맞히면 건 칩의 2배를 돌려받고, 틀리면 건 칩을 잃습니다.</p></div></div><div className="tutorial-example"><span>예를 들어</span><strong>10칩 베팅 → 적중 시 20칩 반환</strong><small>순이익 +10칩 · 실패 시 −10칩</small></div><p className="tutorial-note">총 {fmt(settings.rouletteSpins)}번 돌린 뒤 칩이 가장 많은 팀이 승리합니다. 동점이면 공동 순위입니다. 칩이 0이면 남은 룰렛은 관전합니다. 모든 팀의 칩이 0이 되면 일찍 종료됩니다.</p></>}
    <div className="tutorial-wait"><span /> {blackjack ? "먼저 연습 게임 한 판을 진행합니다. 연습 결과는 실제 칩에 반영되지 않습니다." : "운영자가 게임을 시작하면 화면이 바뀝니다."}</div>
  </section>;
}
