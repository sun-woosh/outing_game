(function () {
  'use strict';
  const { $, fmt, esc, toast, colorOf, betLabel, betMult, serverNow, syncClock, emitAck } = window.MR;
  const TOKEN_KEY = 'mr_token_v2';
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
    del: (k) => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };

  let S = null; // 공개 상태
  let me = null; // 내 상태
  let pending = 0; // 응답 대기 중인 베팅 수
  let selTeam = null;
  let chipIdx = 1;
  let lastResultRound = 0;
  let reqSeq = 0;
  const reqId = () => Date.now().toString(36) + '-' + (++reqSeq) + '-' + Math.random().toString(36).slice(2, 6);

  const socket = window.MR.connect(hello);
  window.MR.connBadge(socket);

  function hello() {
    const token = store.get(TOKEN_KEY);
    emitAck(socket, 'hello', { token }).then((r) => {
      if (r.ok && r.joined) return; // me 이벤트로 화면 전환
      if (token && r.ok && !r.joined) store.del(TOKEN_KEY); // 초기화된 게임
      me = null;
      render();
    });
  }

  socket.on('state', (s) => {
    syncClock(s);
    S = s;
    render();
  });

  socket.on('me', (m) => {
    if (pending > 0 && me) {
      // 응답 대기 중에는 칩/베팅을 덮어쓰지 않음 (낙관적 반영 유지)
      m = { ...m, chips: me.chips, bets: me.bets, total: me.total };
    }
    me = m;
    render();
  });

  socket.on('wiped', () => {
    store.del(TOKEN_KEY);
    me = null;
    toast('운영자가 참가 정보를 초기화했습니다. 다시 입장해 주세요');
    render();
  });

  // ------------------------------------------------------------ 입장
  $('#join-btn').addEventListener('click', async () => {
    const name = $('#name').value.trim();
    if (!name) return toast('이름을 입력해 주세요', 'err');
    if (!selTeam) return toast('조를 선택해 주세요', 'err');
    $('#join-btn').disabled = true;
    const r = await emitAck(socket, 'join', { name, team: selTeam });
    $('#join-btn').disabled = false;
    if (!r.ok) return toast(r.error, 'err');
    store.set(TOKEN_KEY, r.token);
    keepAwake();
  });
  $('#name').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });

  $('#leave-btn').addEventListener('click', async () => {
    const r = await emitAck(socket, 'leave', {});
    if (!r.ok) return toast(r.error, 'err');
    store.del(TOKEN_KEY);
    me = null;
    render();
  });

  // ------------------------------------------------------------ 베팅
  function chipSteps() {
    const total = me ? me.chips + sumBets() : 1000;
    return total >= 10000 ? [500, 1000, 2000, 5000] : total >= 3000 ? [100, 200, 500, 1000] : [50, 100, 200, 500];
  }
  function sumBets() {
    return me ? me.bets.reduce((a, b) => a + b.amount, 0) : 0;
  }

  async function bet(type, el) {
    if (!me || !S || S.phase !== 'betting') return;
    const steps = chipSteps();
    let amount = chipIdx === 4 ? me.chips : steps[chipIdx];
    if (me.chips <= 0) return toast('남은 칩이 없습니다', 'err');
    if (amount > me.chips) amount = me.chips;
    const exists = me.bets.find((b) => b.type === type);
    if (!exists && me.bets.length >= 12) return toast('한 라운드 최대 12곳까지 걸 수 있습니다', 'err');
    // 낙관적 반영
    const prev = { chips: me.chips, bets: me.bets.map((b) => ({ ...b })) };
    me.chips -= amount;
    if (exists) exists.amount += amount; else me.bets.push({ type, amount });
    if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
    if (navigator.vibrate) navigator.vibrate(15);
    pending++;
    renderBetting();
    const r = await emitAck(socket, 'bet', { type, amount, reqId: reqId() });
    pending--;
    if (r.ok) {
      me.chips = r.chips;
      me.bets = r.bets;
    } else {
      if (pending === 0) { me.chips = prev.chips; me.bets = prev.bets; }
      toast(r.error, 'err');
    }
    renderBetting();
    renderHud();
  }

  $('#clear-btn').addEventListener('click', async () => {
    if (!me || !me.bets.length) return;
    pending++;
    const r = await emitAck(socket, 'clear', { reqId: reqId() });
    pending--;
    if (r.ok) { me.chips = r.chips; me.bets = r.bets; toast('베팅을 모두 취소했습니다'); } else toast(r.error, 'err');
    renderBetting();
    renderHud();
  });

  $('#toggle-num').addEventListener('click', () => {
    const g = $('#numgrid');
    g.classList.toggle('hidden');
    $('#toggle-num').textContent = g.classList.contains('hidden') ? '펼치기 ▾' : '접기 ▴';
  });

  // 보드 구성 (한 번만 생성)
  // 6열 그리드: 빨강/검정 · 홀/짝 · 1-18/19-36 (각 3칸) · 1-12/13-24/25-36 (각 2칸)
  const OUTSIDE = [
    ['red', 'c3 red', '빨강'], ['black', 'c3 black', '검정'],
    ['odd', 'c3', '홀'], ['even', 'c3', '짝'],
    ['low', 'c3', '1-18'], ['high', 'c3', '19-36'],
    ['d1', 'c2', '1-12'], ['d2', 'c2', '13-24'], ['d3', 'c2', '25-36'],
  ];
  const board = $('#board');
  board.innerHTML = OUTSIDE.map(([t, cls, label]) =>
    `<button class="spot ${cls}" data-t="${t}">${label}<span class="x">${betMult(t)}배</span></button>`).join('');
  const ng = $('#numgrid');
  let nh = `<button class="spot zero" data-t="n0">0</button>`;
  for (let i = 1; i <= 36; i++) nh += `<button class="spot ${colorOf(i)}" data-t="n${i}">${i}</button>`;
  ng.innerHTML = nh;
  for (const root of [board, ng]) {
    root.addEventListener('click', (e) => {
      const b = e.target.closest('.spot');
      if (b) bet(b.dataset.t, b);
    });
  }
  const chipSel = $('#chip-sel');
  chipSel.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    chipIdx = Number(b.dataset.i);
    renderChips();
  });

  // ------------------------------------------------------------ 렌더링
  const show = (id, on) => $(id).classList.toggle('hidden', !on);

  function render() {
    const joined = !!me;
    show('#v-loading', !S);
    show('#v-join', !!S && !joined);
    show('#v-game', !!S && joined);
    show('#bottom-bar', !!S && joined && S.phase === 'betting');
    if (!S) return;
    if (!joined) return renderJoin();
    renderHud();
    const ph = S.phase;
    for (const p of ['lobby', 'betting', 'locked', 'spinning', 'result', 'final']) show('#p-' + p, ph === p);
    if (ph === 'lobby') $('#lobby-team').textContent = `${me.teamName} · ${me.name}`;
    if (ph === 'betting') renderBetting();
    if (ph === 'locked') $('#mybets-locked').innerHTML = betsHtml();
    if (ph === 'spinning') $('#mybets-spin').innerHTML = betsHtml();
    if (ph === 'result') renderResult();
    if (ph === 'final') renderFinal();
  }

  function renderJoin() {
    const grid = $('#team-grid');
    const n = S.teams.length;
    if (grid.childElementCount !== n) {
      grid.innerHTML = S.teams.map((t) => `<button data-team="${t.id}">${esc(t.name)}<small></small></button>`).join('');
      grid.onclick = (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        selTeam = Number(b.dataset.team);
        renderJoin();
      };
    }
    [...grid.children].forEach((b, i) => {
      const t = S.teams[i];
      b.classList.toggle('sel', selTeam === t.id);
      b.querySelector('small').textContent = `${t.members}명`;
    });
  }

  function renderHud() {
    if (!me || !S) return;
    $('#who').textContent = `${me.teamName} · ${me.name}`;
    $('#chips').innerHTML = `${fmt(me.chips)} <small>칩</small>`;
    $('#m-round').textContent = S.round ? `라운드 ${S.round}/${S.rounds}` : '대기 중';
    $('#m-team').textContent = me.teamRank ? `우리 조 ${me.teamRank}위` : '';
    $('#m-rank').textContent = me.rank ? `개인 ${me.rank}/${me.playerCount}위` : '';
  }

  function betsHtml() {
    if (!me.bets.length) return '<span class="muted">이번 라운드 베팅 없음</span>';
    return me.bets.map((b) => `<span class="pill">${esc(betLabel(b.type))} <b>${fmt(b.amount)}</b></span>`).join('');
  }

  function renderChips() {
    const steps = chipSteps();
    const labels = steps.map(fmt).concat('ALL-IN');
    if (chipSel.childElementCount !== 5) {
      chipSel.innerHTML = labels.map((l, i) => `<button data-i="${i}"></button>`).join('');
    }
    [...chipSel.children].forEach((b, i) => {
      b.textContent = labels[i];
      b.classList.toggle('sel', i === chipIdx);
    });
  }

  function renderBetting() {
    if (!me || !S) return;
    const ev = S.event;
    const banner = $('#ev-banner');
    if (ev && ev.key !== 'normal') {
      let extra = '';
      if (ev.key === 'lucky' && S.luckyNumber != null) extra = ` 이번 럭키 넘버: <b style="display:inline;font-size:20px">${S.luckyNumber}</b>`;
      banner.innerHTML = `<b>${esc(ev.title)}</b>${esc(ev.desc)}${extra}`;
      banner.classList.remove('hidden');
    } else banner.classList.add('hidden');
    renderChips();
    const mine = Object.fromEntries(me.bets.map((b) => [b.type, b.amount]));
    const td = me.teamDist || {};
    document.querySelectorAll('.spot[data-t]').forEach((el) => {
      const t = el.dataset.t;
      let badge = el.querySelector('.mine');
      if (mine[t]) {
        if (!badge) { badge = document.createElement('span'); badge.className = 'mine'; el.appendChild(badge); }
        badge.textContent = fmt(mine[t]);
      } else if (badge) badge.remove();
      let tb = el.querySelector('.team');
      const people = td[t] ? td[t].people : 0;
      if (people && t[0] !== 'n') {
        if (!tb) { tb = document.createElement('span'); tb.className = 'team'; el.appendChild(tb); }
        tb.textContent = `우리조 ${people}명`;
      } else if (tb) tb.remove();
    });
    $('#team-part').textContent = `${me.teamBettors || 0}/${me.teamMembers || 0}명`;
    $('#mybets').innerHTML = betsHtml();
    $('#sum-bet').textContent = fmt(sumBets());
    $('#clear-btn').disabled = !me.bets.length;
    const disabled = me.chips <= 0;
    board.classList.toggle('dim', disabled);
  }

  function renderResult() {
    const r = S.lastResult;
    if (!r) return;
    const ball = $('#res-ball');
    ball.className = 'ball result-big ' + r.color;
    ball.textContent = r.number;
    $('#res-round').textContent = `라운드 ${S.round} 결과`;
    const net = me.lastNet;
    const netEl = $('#res-net');
    if (net == null) {
      netEl.className = 'net muted';
      netEl.textContent = '이번 라운드 베팅 안 함';
    } else {
      netEl.className = 'net ' + (net > 0 ? 'win' : net < 0 ? 'lose' : '');
      netEl.textContent = (net > 0 ? '+' : '') + fmt(net) + ' 칩';
    }
    const bonus = S.roundSummary && S.roundSummary.bonusTeams && S.roundSummary.bonusTeams.includes(me.teamName);
    $('#res-detail').textContent = bonus ? '🤝 팀워크 보너스 +200 포함!' : `보유 칩 ${fmt(me.chips)}`;
    $('#res-bets').innerHTML = me.bets.map((b) => {
      const hit = window.MR.betWins(b.type, r.number);
      return `<span class="pill ${hit ? 'hit' : 'miss'}">${hit ? '✓' : '✗'} ${esc(betLabel(b.type))} ${fmt(b.amount)}</span>`;
    }).join('');
    $('#res-rank').textContent = me.rank ? `${me.rank}위` : '-';
    $('#res-team').textContent = me.teamRank ? `${me.teamRank}위` : '-';
    $('#res-next').innerHTML = S.round < S.rounds
      ? `다음: <b class="gold">${esc(S.nextEvent || '라운드 ' + (S.round + 1))}</b>`
      : '<b class="gold">마지막 라운드였습니다! 최종 발표를 기다려 주세요</b>';
    if (lastResultRound !== S.round) {
      lastResultRound = S.round;
      if (navigator.vibrate) navigator.vibrate(net > 0 ? [80, 60, 80, 60, 160] : 60);
    }
  }

  function renderFinal() {
    $('#fin-team').textContent = me.teamRank ? `${me.teamRank}위` : '-';
    $('#fin-rank').textContent = me.rank ? `${me.rank}위` : '-';
    $('#fin-chips').textContent = fmt(me.total);
    $('#fin-avg').textContent = fmt(me.teamAvg);
    const win = me.teamRank === 1;
    $('#fin-emoji').textContent = win ? '🏆' : me.teamRank <= 3 ? '🥈' : '🎉';
    $('#fin-title').textContent = win ? `${me.teamName} 우승!` : '게임 종료!';
  }

  // 타이머만 가볍게 갱신 (전체 렌더링 없이)
  setInterval(() => {
    if (!S || S.phase !== 'betting' || !S.endsAt) return;
    const left = Math.max(0, Math.ceil((S.endsAt - serverNow()) / 1000));
    const el = $('#timer');
    el.textContent = left;
    el.classList.toggle('urgent', left <= 5);
  }, 250);

  // 화면 꺼짐 방지 (지원 브라우저만) → 폰 잠김으로 인한 끊김 감소
  let wakeLock = null;
  async function keepAwake() {
    try {
      if ('wakeLock' in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => (wakeLock = null));
      }
    } catch (e) { /* ignore */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (me) keepAwake();
      if (!socket.connected) socket.connect();
    }
  });
  document.addEventListener('click', () => { if (me) keepAwake(); }, { once: true });
})();
