'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { Game } = require('../src/game');

function mk(results = []) {
  let t = 1_000_000;
  const seq = [...results];
  const g = new Game({ betSeconds: 30, spinMs: 1000, events: ['normal', 'team', 'lucky', 'normal', 'jackpot'] }, {
    now: () => t,
    rng: (max) => (seq.length ? seq.shift() % max : 0),
  });
  return { g, adv: (ms) => (t += ms) };
}

function play(g, adv) {
  g.startSpin();
  adv(1001);
  g.tick();
}

test('입장/재접속/동명이인', () => {
  const { g } = mk();
  const a = g.join({ name: '홍길동', team: 1 });
  const b = g.join({ name: '홍길동', team: 1 });
  assert.notStrictEqual(a.name, b.name);
  assert.strictEqual(g.join({ token: a.token }).id, a.id);
  assert.throws(() => g.join({ name: '', team: 1 }));
  assert.throws(() => g.join({ name: 'x', team: 99 }));
  assert.strictEqual(g.join({ name: '<script>alert(1)</script>', team: 2 }).name.includes('<'), false);
});

test('기본 정산: 빨강/숫자/0', () => {
  const { g, adv } = mk([1, 0]); // 결과 1 (빨강, 홀, 1-18, 1-12)
  const p = g.join({ name: 'a', team: 1 });
  g.startRound();
  g.placeBet(p.id, 'red', 100);
  g.placeBet(p.id, 'n1', 10);
  g.placeBet(p.id, 'black', 50);
  assert.strictEqual(p.chips, 840);
  play(g, adv);
  assert.strictEqual(g.phase, 'result');
  assert.strictEqual(p.chips, 840 + 200 + 360);
  assert.strictEqual(p.lastNet, 200 + 360 - 160);
});

test('0이 나오면 바깥 베팅 전부 패배', () => {
  const { g, adv } = mk([0, 0]);
  const p = g.join({ name: 'a', team: 1 });
  g.startRound();
  for (const t of ['red', 'black', 'odd', 'even', 'low', 'high', 'd1', 'd2', 'd3']) g.placeBet(p.id, t, 10);
  g.placeBet(p.id, 'n0', 10);
  play(g, adv);
  assert.strictEqual(p.chips, 1000 - 100 + 360);
});

test('칩 초과 베팅은 남은 칩으로 제한, 중복 reqId 무시', () => {
  const { g } = mk();
  const p = g.join({ name: 'a', team: 1 });
  g.startRound();
  g.placeBet(p.id, 'red', 99999, 'r1');
  assert.strictEqual(p.chips, 0);
  assert.throws(() => g.placeBet(p.id, 'black', 10, 'r2'));
  g.clearBets(p.id, 'c1');
  assert.strictEqual(p.chips, 1000);
  g.clearBets(p.id, 'c1');
  g.placeBet(p.id, 'red', 100, 'r3');
  g.placeBet(p.id, 'red', 100, 'r3'); // 재전송
  assert.strictEqual(p.chips, 900);
});

test('베팅 시간 외 거부, 타이머 자동 마감', () => {
  const { g, adv } = mk();
  const p = g.join({ name: 'a', team: 1 });
  assert.throws(() => g.placeBet(p.id, 'red', 10));
  g.startRound();
  adv(30_001);
  assert.ok(g.tick());
  assert.strictEqual(g.phase, 'locked');
  assert.throws(() => g.placeBet(p.id, 'red', 10));
});

test('팀워크/럭키/잭팟 이벤트 + 구조칩 + 평균 순위', () => {
  // R1 결과 2(검정,짝) / R2(team) 결과 3(빨강) / R3(lucky) 럭키=7, 결과 7 / R4 결과 0 / R5(jackpot) 결과 1
  const { g, adv } = mk([2, 0, 3, 0, 6, 7, 0, 0, 0, 1, 0]); // 스핀마다 (결과, 회전수) 소비
  const a = g.join({ name: 'a', team: 1 });
  const b = g.join({ name: 'b', team: 1 });
  const c = g.join({ name: 'c', team: 2 });
  // R1: c 올인 실패
  g.startRound();
  g.placeBet(c.id, 'red', 1000);
  play(g, adv);
  assert.strictEqual(c.chips, 0);
  // R2 팀워크: a,b 모두 빨강 적중 → +200 보너스, c는 구조칩 200
  g.startRound();
  assert.strictEqual(c.chips, 200);
  assert.strictEqual(c.rescued, 200);
  g.placeBet(a.id, 'red', 100);
  g.placeBet(b.id, 'red', 100);
  play(g, adv);
  assert.strictEqual(a.chips, 1000 + 100 + 200);
  assert.deepStrictEqual(g.roundSummary.bonusTeams, ['1조']);
  // R3 럭키 넘버 = 1 + rng(36) = 1 + 6 = 7
  g.startRound();
  assert.strictEqual(g.luckyNumber, 7);
  g.placeBet(c.id, 'n7', 10);
  play(g, adv);
  assert.strictEqual(c.chips, 200 - 10 + 500);
  // R4 결과 0
  g.startRound();
  play(g, adv);
  // R5 잭팟: 결과 1, 빨강 100 → 100 + 100*2
  g.startRound();
  g.placeBet(a.id, 'red', 100);
  play(g, adv);
  assert.strictEqual(a.chips, 1300 - 100 + 300);
  assert.throws(() => g.startRound());
  g.finish();
  assert.strictEqual(g.phase, 'final');
  const teams = g.teamStandings();
  assert.strictEqual(teams[0].avg, Math.round((1500 + 1300) / 2));
  assert.strictEqual(teams[1].rank, 2);
});

test('저장/복구', () => {
  const { g } = mk();
  const p = g.join({ name: 'a', team: 3 });
  g.startRound();
  g.placeBet(p.id, 'odd', 100);
  const json = JSON.parse(JSON.stringify(g.toJSON()));
  const g2 = new Game();
  g2.restore(json);
  assert.strictEqual(g2.getByToken(p.token).chips, 900);
  assert.strictEqual(g2.phase, 'betting');
});

test('종료 시 진행 중 베팅 환불', () => {
  const { g } = mk();
  const p = g.join({ name: 'a', team: 1 });
  g.startRound();
  g.placeBet(p.id, 'odd', 300);
  g.finish();
  assert.strictEqual(p.chips, 1000);
});
