'use strict';
/**
 * 부하 테스트: 가상 참가자 N명이 동시에 접속/입장/베팅하고 운영자가 라운드를 진행
 *   사용법: node scripts/loadtest.js [URL] [인원]   (기본 http://localhost:3000, 120명)
 *   HOST_PIN 환경변수로 운영자 PIN 지정 (기본 2026)
 */
const { io } = require('socket.io-client');
const URL = process.argv[2] || 'http://localhost:3000';
const N = Number(process.argv[3]) || 120;
const ROUNDS = Number(process.env.ROUNDS) || 3;
const PIN = process.env.HOST_PIN || '2026';
const TYPES = ['red', 'black', 'odd', 'even', 'low', 'high', 'd1', 'd2', 'd3', 'n7', 'n17', 'n0'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ack = (s, ev, p) => new Promise((res) => {
  const t0 = Date.now();
  s.timeout(10000).emit(ev, p, (err, r) => res({ ...(r || {}), err, ms: Date.now() - t0 }));
});
const lat = [];
let errors = 0;
const errKinds = {};
let stateMsgs = 0;
let meMsgs = 0;

async function main() {
  const host = io(URL, { transports: ['websocket'] });
  await new Promise((r) => host.on('connect', r));
  const a = await ack(host, 'host:auth', { pin: PIN });
  if (!a.ok) throw new Error('host auth failed');
  let hs = null;
  host.on('state', (s) => (hs = s));
  await ack(host, 'host:cmd', { cmd: 'wipe' });
  await ack(host, 'host:cmd', { cmd: 'config', args: { betSeconds: 12, rounds: ROUNDS } });

  const t0 = Date.now();
  const players = await Promise.all(Array.from({ length: N }, async (_, i) => {
    await sleep(Math.random() * 3000); // QR 찍고 들어오는 시간 분산
    const s = io(URL, { transports: i % 10 === 0 ? ['polling'] : ['websocket', 'polling'] });
    await new Promise((r) => s.on('connect', r));
    s.on('state', () => stateMsgs++);
    s.on('me', (m) => { meMsgs++; s.me = m; });
    await ack(s, 'hello', {});
    const j = await ack(s, 'join', { name: '테스터' + i, team: (i % 9) + 1 });
    if (!j.ok) errors++;
    lat.push(j.ms);
    return s;
  }));
  console.log(`입장 완료 ${N}명: ${Date.now() - t0}ms, 오류 ${errors}`);

  for (let r = 1; r <= ROUNDS; r++) {
    await ack(host, 'host:cmd', { cmd: 'start' });
    // 모두가 베팅 시간 동안 1~5회 연타
    await Promise.all(players.map(async (s) => {
      const k = 1 + Math.floor(Math.random() * 5);
      const times = Array.from({ length: k }, () => Math.random() * 10000).sort((x, y) => x - y);
      let last = 0;
      for (let j = 0; j < k; j++) {
        await sleep(times[j] - last);
        last = times[j];
        const res = await ack(s, 'bet', { type: TYPES[Math.floor(Math.random() * TYPES.length)], amount: 50, reqId: `${r}-${j}-${Math.random()}` });
        lat.push(res.ms);
        if (!res.ok) { errors++; errKinds[res.error || res.err] = (errKinds[res.error || res.err] || 0) + 1; }
      }
    }));
    await ack(host, 'host:cmd', { cmd: 'spin' });
    await sleep(9800);
    console.log(`라운드 ${r}: 결과 ${hs && hs.lastResult && hs.lastResult.number}, 상태 ${hs && hs.phase}, 베팅 ${hs && hs.roundSummary && hs.roundSummary.bettorCount}명`);
  }
  await ack(host, 'host:cmd', { cmd: 'finish' });
  await sleep(800);

  lat.sort((x, y) => x - y);
  const pct = (p) => lat[Math.floor(lat.length * p)];
  const mem = await fetch(URL + '/healthz').then((r) => r.json());
  console.log(`요청 ${lat.length}건 / 오류 ${errors} / 응답시간 p50 ${pct(0.5)}ms, p95 ${pct(0.95)}ms, p99 ${pct(0.99)}ms, max ${lat[lat.length - 1]}ms`);
  console.log(`수신: state ${stateMsgs}건, me ${meMsgs}건 (1인당 state ${(stateMsgs / N).toFixed(0)}건)`);
  console.log('서버:', mem, '오류 종류:', errKinds);
  const total = players.reduce((a, s) => a + (s.me ? s.me.total : 0), 0);
  console.log('최종 조 순위:', hs.teams.filter((t) => t.members).sort((a, b) => a.rank - b.rank).map((t) => `${t.name}:${t.avg}`).join(' '), '/ 개인 합', total);
  players.forEach((s) => s.close());
  host.close();
  process.exit(errors ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
