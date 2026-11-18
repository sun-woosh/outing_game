"use client";

import { useEffect, useState } from "react";
import "./blackjack-countdown.css";

/** Compute the deadline against the server clock instead of the device clock. */
export function useBlackjackSeconds(deadline?: number | null, serverTime?: number | null) {
  const [seconds, setSeconds] = useState<number | null>(null);
  useEffect(() => {
    if (typeof deadline !== "number" || typeof serverTime !== "number") { setSeconds(null); return; }
    const clockOffset = Date.now() - serverTime;
    const update = () => setSeconds(Math.max(0, Math.ceil((deadline - (Date.now() - clockOffset)) / 1000)));
    update();
    const id = window.setInterval(update, 250);
    return () => window.clearInterval(id);
  }, [deadline, serverTime]);
  return seconds;
}

export default function BlackjackCountdown({ seconds }: { seconds: number | null }) {
  if (seconds === null) return null;
  return <div className={`blackjack-countdown ${seconds <= 10 ? "urgent" : ""}`} aria-label={`블랙잭 남은 시간 ${seconds}초`}><span>남은 시간</span><strong>{String(seconds).padStart(2, "0")}</strong><small>초</small></div>;
}
