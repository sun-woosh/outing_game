// 게임·서버가 함께 쓰는 룰렛 시간 (모든 화면이 같은 순간에 결과를 보여 주도록)
/** 결과 공개 시각: 회전 시작 후 이 시간이 지나면 결과 표시 */
export const ROULETTE_SPIN_MS = 8_000;
/** 휠이 실제로 도는 시간. 결과 공개보다 먼저 완전히 멈춰서, 멈춘 칸을 보고 난 뒤 결과가 뜨게 함 */
export const ROULETTE_WHEEL_MS = 6_800;
/** 결과 공개 후 다음 단계로 넘어가기 전 최소 대기 */
export const ROULETTE_RESULT_HOLD_MS = 2_000;
