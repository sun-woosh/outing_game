import { useState, type ReactNode } from "react";

type Props = {
  mode: "team" | "host"; hostAuth: boolean; busy: boolean; roomReady: boolean; activeKnown: boolean;
  tableCount: number; excluded: number[]; message: ReactNode;
  onLogin: (password: string) => void; onCreate: () => void; onJoin: (table: number) => void;
};

/** 첫 화면: 참가자는 테이블 번호로 입장, 운영자는 비밀번호 로그인 → 새 게임 만들기 */
export default function Landing({ mode, hostAuth, busy, roomReady, activeKnown, tableCount, excluded, message, onLogin, onCreate, onJoin }: Props) {
  const [table, setTable] = useState("");
  const [password, setPassword] = useState("");
  const host = mode === "host";
  return <div className="landing shell">
    <section className="intro">
      <div className="eyebrow"><span /> 2026 DT OUTING <span /></div>
      <h1>ALL IN<br /><em>MACAU</em></h1>
      <p className="intro-sub">2026 DT OUTING <span>✦</span> TEAM GAME</p>
      <p className="intro-copy">테이블이 함께 상의하고, 함께 칩을 모으세요.<br />단 한 번의 선택으로 순위가 뒤집힙니다.</p>
    </section>
    <section className="entry card">
      <div className="card-kicker">WELCOME TO THE TABLE</div>
      <h2>{host ? (hostAuth ? "게임을 시작해요" : "운영자 입장") : "게임에 참여해요"}</h2>
      <p className="muted">{host ? (hostAuth ? "새 게임을 만들고 테이블을 초대해 주세요." : "운영자 비밀번호를 입력해 주세요.") : "테이블 번호를 입력하고 입장해 주세요."}</p>
      {host ? hostAuth
        ? <button className="primary full" onClick={onCreate} disabled={busy}>{busy ? "게임을 만드는 중..." : "새 게임 만들기"} <span>↗</span></button>
        : <form onSubmit={e => { e.preventDefault(); onLogin(password); }}>
            <label>비밀번호<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" /></label>
            <button className="primary full" disabled={busy || !password}>{busy ? "확인 중..." : "운영자 화면으로"} <span>→</span></button>
          </form>
        : <form onSubmit={e => { e.preventDefault(); onJoin(Number(table)); }}>
            <label>테이블 번호<input type="number" inputMode="numeric" pattern="[0-9]*" value={table} onChange={e => setTable(e.target.value)} min="1" max={tableCount} placeholder={`1–${tableCount}`} autoComplete="off" enterKeyHint="go" /></label>
            {excluded.length > 0 && <p className="helper">불참 테이블: {[...excluded].sort((a, b) => a - b).join(", ")}번</p>}
            <button className="primary full" disabled={busy || !roomReady || !table}>{busy ? "참여하는 중..." : "게임 입장하기"} <span>→</span></button>
            {!roomReady && <p className="helper">{activeKnown ? "운영자가 게임을 준비 중입니다. 잠시만 기다려 주세요." : "게임을 확인하는 중입니다."}</p>}
          </form>}
      {message}
    </section>
    <section className="how">
      <div><b>01</b><span>얼굴 카드 매치</span></div>
      <div><b>02</b><span>소수의 선택</span></div>
      <p>마지막에 칩이 가장 많은 테이블이 승리합니다.</p>
    </section>
  </div>;
}
