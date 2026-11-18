import { io } from "socket.io-client";

/**
 * 서버와의 실시간 연결 (WebSocket, 막힌 네트워크에서는 자동으로 롱폴링).
 * 서버가 상태가 바뀔 때만 밀어 주므로, 폰마다 주기적으로 물어보던 기존 방식보다 요청이 훨씬 적습니다.
 */
export type ApiResult = { status: number; body: any };

export const socket = io({
  transports: ["websocket", "polling"],
  reconnectionDelay: 500 + Math.random() * 1000, // 재접속이 한 순간에 몰리지 않도록 분산
  reconnectionDelayMax: 5000,
  timeout: 10000,
});

const TIMEOUT_ERROR: ApiResult = { status: 504, body: { error: "연결이 지연되고 있어요. 잠시 후 다시 시도해 주세요." } };

/** 게임 동작 요청. 실시간 연결이 끊겨 있으면 일반 HTTP로 보냅니다. */
export async function api(data: object): Promise<ApiResult> {
  if (socket.connected) {
    try { return await socket.timeout(10000).emitWithAck("api", data); }
    catch { return TIMEOUT_ERROR; }
  }
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch("/api/game", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), signal: controller.signal });
    return { status: response.status, body: await response.json() };
  } catch {
    return TIMEOUT_ERROR;
  } finally {
    window.clearTimeout(timer);
  }
}

/** 내 자격(테이블/운영자)을 서버에 알리고 현재 상태를 받습니다. 이후 변경은 'state' 이벤트로 옵니다. */
export async function hello(creds: { teamToken?: string; hostToken?: string }): Promise<ApiResult | null> {
  if (!socket.connected) return null;
  try { return await socket.timeout(10000).emitWithAck("hello", creds); }
  catch { return null; }
}
