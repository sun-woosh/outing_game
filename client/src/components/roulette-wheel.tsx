import type { CSSProperties } from "react";
import { ROULETTE_SPIN_MS } from "../lib/roulette-timing";

type Color = "red" | "black";

/** A two-color wheel: the pointer always comes to rest on the selected color. */
export default function RouletteWheel({ result, spinning = false, className = "", spinOffsetMs = 0 }: { result?: Color | null; spinning?: boolean; className?: string; spinOffsetMs?: number }) {
  const label = spinning ? "룰렛을 돌리는 중" : result ? `룰렛 결과 ${result === "red" ? "RED" : "BLACK"}` : "빨강과 검정 룰렛";
  return <div className={`wheel-wrap ${className}`} role="img" aria-label={label}>
    <div className="wheel-pointer" aria-hidden="true" />
    <div className={`wheel ${spinning ? "wheel-spin" : ""}`} style={{ "--wheel-stop": result === "black" ? "-33.75deg" : "-11.25deg", "--roulette-spin-duration": `${ROULETTE_SPIN_MS}ms`, "--roulette-spin-delay": `${-Math.min(ROULETTE_SPIN_MS, Math.max(0, spinOffsetMs))}ms` } as CSSProperties} aria-hidden="true">
      <div className="wheel-pockets">{Array.from({ length: 16 }, (_, index) => <span key={index} style={{ transform: `rotate(${index * 22.5 + 11.25}deg)` }}><i /></span>)}</div>
      <div className="wheel-inside"><span>DT OUTING</span><strong>2026</strong><i>✦</i><small>MACAU</small></div>
    </div>
  </div>;
}
