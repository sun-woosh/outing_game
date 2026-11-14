/* 공통: 소켓 연결, 서버 시계 보정, 룰렛 상수 */
(function () {
  'use strict';
  const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
    24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const colorOf = (n) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');
  const BET_LABEL = {
    red: '빨강', black: '검정', odd: '홀', even: '짝', low: '1-18', high: '19-36',
    d1: '1-12', d2: '13-24', d3: '25-36',
  };
  const BET_MULT = { red: 2, black: 2, odd: 2, even: 2, low: 2, high: 2, d1: 3, d2: 3, d3: 3 };
  const betLabel = (t) => BET_LABEL[t] || (t && t[0] === 'n' ? '숫자 ' + t.slice(1) : t);
  const betMult = (t) => BET_MULT[t] || 36;
  const WIN = {
    red: (n) => n !== 0 && RED.has(n), black: (n) => n !== 0 && !RED.has(n),
    odd: (n) => n !== 0 && n % 2 === 1, even: (n) => n !== 0 && n % 2 === 0,
    low: (n) => n >= 1 && n <= 18, high: (n) => n >= 19,
    d1: (n) => n >= 1 && n <= 12, d2: (n) => n >= 13 && n <= 24, d3: (n) => n >= 25,
  };
  const betWins = (t, n) => (WIN[t] ? WIN[t](n) : Number(t.slice(1)) === n);

  let offset = 0; // serverNow - Date.now()
  const serverNow = () => Date.now() + offset;
  function syncClock(s) {
    if (s && s.serverNow) {
      const o = s.serverNow - Date.now();
      // 네트워크 지연으로 인한 흔들림 완화
      offset = offset === 0 ? o : offset * 0.7 + o * 0.3;
    }
  }

  function connect(onConnect) {
    // eslint-disable-next-line no-undef
    const socket = io({
      transports: ['websocket', 'polling'], // 웹소켓 우선, 막힌 망이면 폴링
      reconnectionDelay: 500 + Math.random() * 1000, // 재접속 몰림 분산
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });
    socket.on('connect', () => onConnect && onConnect(socket));
    return socket;
  }

  function emitAck(socket, ev, payload, timeoutMs = 6000) {
    return new Promise((resolve) => {
      let done = false;
      const t = setTimeout(() => {
        if (!done) { done = true; resolve({ ok: false, error: '연결이 불안정합니다. 잠시 후 다시 시도해 주세요', timeout: true }); }
      }, timeoutMs);
      socket.emit(ev, payload, (res) => {
        if (done) return;
        done = true;
        clearTimeout(t);
        resolve(res || { ok: false });
      });
    });
  }

  const fmt = (n) => (n == null ? '-' : Math.round(n).toLocaleString('ko-KR'));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, root) => (root || document).querySelector(sel);

  let toastTimer;
  function toast(msg, kind) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'show ' + (kind || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.className = ''), 2200);
  }

  function connBadge(socket) {
    const el = document.createElement('div');
    el.id = 'conn';
    document.body.appendChild(el);
    const set = (on) => {
      el.className = on ? 'on' : 'off';
      el.textContent = on ? '' : '재연결 중…';
    };
    socket.on('connect', () => set(true));
    socket.on('disconnect', () => set(false));
    socket.io.on('reconnect_attempt', () => set(false));
    set(socket.connected);
  }

  window.MR = { betWins, WHEEL_ORDER, RED, colorOf, betLabel, betMult, serverNow, syncClock, connect, emitAck, fmt, esc, $, toast, connBadge };
})();
