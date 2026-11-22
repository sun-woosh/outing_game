import type { CSSProperties } from "react";
import { ROULETTE_WHEEL_MS } from "../lib/roulette-timing";

type Color = "red" | "black";

/** 빨강·검정 룰렛 휠. 결과 색 칸에 포인터가 멈춤. 휠은 ROULETTE_WHEEL_MS 동안 돌고 멈춘 뒤, ROULETTE_SPIN_MS에 결과가 공개됨 */
export default function RouletteWheel({ result, spinning = false, className = "", spinOffsetMs = 0 }: { result?: Color | null; spinning?: boolean; className?: string; spinOffsetMs?: number }) {
  const label = spinning ? "룰렛을 돌리는 중" : result ? `룰렛 결과 ${result === "red" ? "RED" : "BLACK"}` : "빨강과 검정 룰렛";
  return <div className={`wheel-wrap ${className}`} role="img" aria-label={label}>
    <div className="wheel-pointer" aria-hidden="true" />
    <div className={`wheel ${spinning ? "wheel-spin" : ""}`} style={{ "--wheel-stop": result === "black" ? "-33.75deg" : "-11.25deg", "--roulette-spin-duration": `${ROULETTE_WHEEL_MS}ms`, "--roulette-spin-delay": `${-Math.min(ROULETTE_WHEEL_MS, Math.max(0, spinOffsetMs))}ms` } as CSSProperties} aria-hidden="true">
      <div className="wheel-pockets">{Array.from({ length: 16 }, (_, index) => <span key={index} style={{ transform: `rotate(${index * 22.5 + 11.25}deg)` }}><i /></span>)}</div>
      <div className="wheel-inside"><span>DT&amp;FIG OUTING</span><strong>2026</strong><i>✦</i><small>MACAU</small></div>
    </div>
  </div>;
}
