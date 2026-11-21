import { QRCodeSVG } from "qrcode.react";
import type { Game } from "../types";

/** 대기실: 빔에는 QR과 테이블 입장 현황, 폰에는 입장 완료 안내 */
export default function Lobby({ game, view, participantUrl }: { game: Game; view: "team" | "beam"; participantUrl: string }) {
  const R = game.rounds;
  const rounds: [number, string, string][] = [
    ...(R.face ? [[R.face, "얼굴 카드 매치", "같은 사람 사진 두 장 찾고 이름 맞히기"] as [number, string, string]] : []),
    [R.minority, "소수의 선택", "가장 적은 테이블이 고른 답이 승리"],
  ];
  const numbers = Array.from({ length: game.settings.tableCount }, (_, i) => i + 1).filter(n => !game.excludedTables.includes(n));
  return <div className={`game-grid ${view === "beam" ? "beam-lobby-grid" : ""}`}>
    <section className="table card lobby-card">
      <div className="card-kicker">WELCOME TO MACAU</div>
      <h2>곧 게임이 시작됩니다</h2>
      {view === "beam"
        ? <><p>QR 코드를 스캔한 뒤 테이블 번호를 입력해 주세요.</p>
            <div className="qr-invite"><div className="qr-code"><QRCodeSVG value={participantUrl} size={256} level="M" marginSize={4} title="게임 참여 QR 코드" /></div></div>
</>
        : <p>참여가 완료됐어요.<br />게임이 시작될 때까지 기다려 주세요.</p>}
    </section>
    {view === "beam" && <section className="leaderboard card host-board">
      <div className="section-head"><div><div className="card-kicker">READY TO PLAY</div><h2>참여 테이블</h2></div><span>{game.teams.length} TABLES</span></div>
      <div className="beam-table-grid" role="list" aria-label="테이블 입장 현황">
        {numbers.map(n => {
          const joined = game.teams.some(team => team.table === n);
          return <span key={n} role="listitem" aria-label={`${n}번 테이블 ${joined ? "입장 완료" : "대기 중"}`} className={`beam-table-number ${joined ? "occupied" : ""}`}><b>{n}</b></span>;
        })}
      </div>
      <ol className="lobby-rounds" aria-label="오늘의 게임">
        {rounds.map(([no, name, desc]) => <li key={no}><b>ROUND {no}</b><strong>{name}</strong><span>{desc}</span></li>)}
      </ol>
      <p className="lobby-win">모두 0칩으로 시작 · 마지막에 칩이 가장 많은 테이블이 우승!</p>
    </section>}
  </div>;
}
