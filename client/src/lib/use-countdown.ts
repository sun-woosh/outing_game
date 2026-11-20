import { useEffect, useState } from "react";

/** 마감 시각까지 남은 초. 기기 시계가 틀려도 서버 시각 기준으로 계산합니다. */
export function useCountdown(deadline?: number | null, serverTime?: number | null) {
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
