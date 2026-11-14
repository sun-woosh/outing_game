(function () {
  'use strict';
  const { $, fmt, esc, WHEEL_ORDER, colorOf, betLabel, serverNow, syncClock, emitAck } = window.MR;
  let S = null;
  let finalRevealAt = 0;
  let finalTimers = [];

  const socket = window.MR.connect(() => emitAck(socket, 'screen', {}));
  window.MR.connBadge(socket);
  socket.on('state', (s) => {
    syncClock(s);
    const prevPhase = S && S.phase;
    const prevRound = S && S.round;
    S = s;
    if (s.phase === 'spinning' && s.spin) startSpinAnim(s.spin);
    if (s.phase === 'result' && (prevPhase !== 'result' || prevRound !== s.round)) onResult();
    if (s.phase === 'final' && prevPhase !== 'final') finalRevealAt = Date.now();
    render();
  });

  fetch('/join-url').then((r) => r.json()).then((d) => ($('#join-url').textContent = d.url.replace(/^https?:\/\//, '').replace(/\/$/, ''))).catch(() => {});

  // ------------------------------------------------------------ 사운드 (WebAudio, 파일 없음)
  let actx = null;
  $('#sound-btn').addEventListener('click', () => {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      actx.resume();
      $('#sound-btn').textContent = '🔊 소리 켜짐';
      beep(880, 0.08);
    } catch (e) { /* ignore */ }
  });
  function beep(freq, dur, type = 'square', vol = 0.06) {
    if (!actx) return;
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.connect(g).connect(actx.destination);
    o.start();
    o.stop(actx.currentTime + dur);
  }
  function fanfare() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.25, 'triangle', 0.1), i * 120));
  }

  // ------------------------------------------------------------ 휠
  const cv = $('#wheel');
  const ctx = cv.getContext('2d');
  const SEG = (Math.PI * 2) / 37;
  let rot = 0; // 현재 회전각 (라디안, 시계방향)
  let anim = null; // {from, to, start(serverTime), dur}
  let lastTickSeg = -1;

  function drawWheel() {
    const W = cv.width;
    const c = W / 2;
    const R = c - 10;
    ctx.clearRect(0, 0, W, W);
    // 바깥 림
    ctx.beginPath();
    ctx.arc(c, c, R, 0, Math.PI * 2);
    const rim = ctx.createRadialGradient(c, c, R * 0.85, c, c, R);
    rim.addColorStop(0, '#5a3a12');
    rim.addColorStop(1, '#2b1a06');
    ctx.fillStyle = rim;
    ctx.fill();
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(rot);
    const r1 = R * 0.9;
    const r0 = R * 0.62;
    for (let i = 0; i < 37; i++) {
      const n = WHEEL_ORDER[i];
      // 포켓 i의 중심이 위쪽(-90도)에서 시계방향 i*SEG
      const a0 = -Math.PI / 2 + i * SEG - SEG / 2;
      ctx.beginPath();
      ctx.arc(0, 0, r1, a0, a0 + SEG);
      ctx.arc(0, 0, r0, a0 + SEG, a0, true);
      ctx.closePath();
      const col = colorOf(n);
      ctx.fillStyle = col === 'red' ? '#c81d33' : col === 'black' ? '#151518' : '#0f8a48';
      ctx.fill();
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.save();
      ctx.rotate(a0 + SEG / 2 + Math.PI / 2);
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.round(R * 0.075)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(n), 0, -(r1 + r0) / 2 - R * 0.02);
      ctx.restore();
    }
    // 가운데
    const hub = ctx.createRadialGradient(0, 0, 0, 0, 0, r0);
    hub.addColorStop(0, '#2a6e52');
    hub.addColorStop(1, '#0b3d2e');
    ctx.beginPath();
    ctx.arc(0, 0, r0, 0, Math.PI * 2);
    ctx.fillStyle = hub;
    ctx.fill();
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 6;
    ctx.stroke();
    for (let k = 0; k < 8; k++) {
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#d4af37';
      ctx.fillRect(-4, -r0 * 0.75, 8, r0 * 0.5);
    }
    ctx.restore();
    // 포인터 (위쪽 고정)
    ctx.beginPath();
    ctx.moveTo(c - R * 0.06, 2);
    ctx.lineTo(c + R * 0.06, 2);
    ctx.lineTo(c, R * 0.16);
    ctx.closePath();
    ctx.fillStyle = '#f2c14e';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.fill();
    ctx.stroke();
  }

  function targetRotation(result, turns) {
    const i = WHEEL_ORDER.indexOf(result);
    return turns * Math.PI * 2 + (Math.PI * 2 - i * SEG);
  }
  const ease = (t) => 1 - Math.pow(1 - t, 4);

  function startSpinAnim(spin) {
    if (anim && anim.key === spin.startedAt) return;
    const base = ((rot % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    anim = { key: spin.startedAt, from: base, to: targetRotation(spin.result, spin.turns) + Math.PI * 2, start: spin.startedAt, dur: spin.duration };
  }

  function frame() {
    if (anim) {
      const t = Math.min(1, Math.max(0, (serverNow() - anim.start) / anim.dur));
      rot = anim.from + (anim.to - anim.from) * ease(t);
      const seg = Math.floor(((rot % (Math.PI * 2)) / SEG));
      if (seg !== lastTickSeg && t < 1) { lastTickSeg = seg; beep(1400, 0.02, 'square', 0.03); }
      if (t >= 1) anim = null;
      drawWheel();
    }
    requestAnimationFrame(frame);
  }
  drawWheel();
  requestAnimationFrame(frame);

  // ------------------------------------------------------------ 결과 연출
  function onResult() {
    // 스핀을 놓친 경우(새로고침 등)에도 결과 위치로 맞춤
    if (S.lastResult) {
      anim = null;
      rot = targetRotation(S.lastResult.number, 0);
      drawWheel();
    }
    fanfare();
    confetti(2500);
  }

  // ------------------------------------------------------------ 렌더링
  const show = (id, on) => $(id).classList.toggle('hidden', !on);

  function render() {
    if (!S) return;
    const ph = S.phase;
    show('#b-lobby', ph === 'lobby');
    show('#b-game', ph !== 'lobby' && ph !== 'final');
    show('#b-final', ph === 'final');
    $('#b-final').style.display = ph === 'final' ? 'grid' : 'none';
    $('#round-tag').textContent = ph === 'lobby' ? '참가 대기 중' : ph === 'final' ? '최종 결과' : `ROUND ${S.round} / ${S.rounds}`;
    if (ph === 'lobby') return renderLobby();
    if (ph === 'final') return renderFinal();

    const ev = S.event;
    const evEl = $('#event');
    if (ev && ev.key !== 'normal') {
      let extra = '';
      if (ev.key === 'lucky' && S.luckyNumber != null) extra = ` → 럭키 넘버 <b style="display:inline;font-size:4vh" class="gold">${S.luckyNumber}</b>`;
      evEl.innerHTML = `<b>${esc(ev.title)}</b>${esc(ev.desc)}${extra}`;
      evEl.classList.remove('hidden');
    } else evEl.classList.add('hidden');

    const c = S.counts;
    $('#part-text').textContent = `${c.bettors} / ${c.players}명`;
    $('#part-bar').style.width = (c.players ? (c.bettors / c.players) * 100 : 0) + '%';
    show('#part-panel', ph === 'betting' || ph === 'locked');
    show('#part-bar-wrap', ph === 'betting' || ph === 'locked');
    show('#dist-panel', ph === 'betting' || ph === 'locked' || ph === 'spinning');
    show('#winners-panel', ph === 'result');
    renderDist();
    renderTeams();
    renderOverlay();
    if (ph === 'result') renderWinners();
    $('#history').innerHTML = (S.history || []).map((n) => `<span class="ball ${colorOf(n)}">${n}</span>`).join('');
  }

  function renderLobby() {
    $('#lobby-count').textContent = S.counts.players;
    $('#lobby-teams').innerHTML = S.teams.map((t) => `<div><span>${esc(t.name)}</span><span class="gold num">${t.members}명</span></div>`).join('');
  }

  function renderDist() {
    const d = S.dist || {};
    const cell = (t, cls) => {
      const v = d[t] || { chips: 0, people: 0 };
      return `<div class="${cls || ''}">${esc(betLabel(t))}<small class="num">${fmt(v.chips)}칩 · ${v.people}명</small></div>`;
    };
    // 숫자 베팅 중 가장 인기 있는 숫자
    let hot = null;
    for (const [k, v] of Object.entries(d)) if (k[0] === 'n' && (!hot || v.chips > hot[1].chips)) hot = [k, v];
    $('#dist').innerHTML = cell('red', 'red') + cell('black', 'black') + cell('odd') + cell('even') + cell('low') + cell('high') +
      cell('d1') + cell('d2') + cell('d3') +
      (hot ? `<div style="grid-column:span 3">🔥 최다 숫자 <b class="gold">${hot[0].slice(1)}</b> <small class="num">${fmt(hot[1].chips)}칩 · ${hot[1].people}명</small></div>` : '');
  }

  function renderTeams() {
    const ranked = S.teams.filter((t) => t.members > 0).sort((a, b) => a.rank - b.rank);
    const max = Math.max(1, ...ranked.map((t) => t.avg));
    const betting = S.phase === 'betting' || S.phase === 'locked';
    const el = $('#teams');
    el.classList.toggle('two', ranked.length > 6);
    el.style.gridTemplateRows = ranked.length > 6 ? `repeat(${Math.ceil(ranked.length / 2)}, auto)` : '';
    el.innerHTML = ranked.map((t) => `
      <div class="team-row">
        <div class="rk">${t.rank}</div>
        <div>${esc(t.name)}</div>
        <div class="bar"><i style="width:${(t.avg / max) * 100}%"></i></div>
        <div class="v">${fmt(t.avg)}<small>${betting ? `<span class="part">참여 ${t.bettors}/${t.members}</span>` : t.members + '명'}</small></div>
      </div>`).join('');
  }

  function renderOverlay() {
    const o = $('#overlay');
    const ph = S.phase;
    if (ph === 'betting') {
      o.innerHTML = `<div style="font-size:3vh;font-weight:800;text-shadow:0 2px 10px #000">베팅 마감까지</div><div class="bigtimer" id="bigtimer"></div>`;
      tickTimer();
    } else if (ph === 'locked') {
      o.innerHTML = `<div class="bigtimer" style="font-size:9vh">베팅 마감!</div>`;
    } else if (ph === 'result' && S.lastResult) {
      const r = S.lastResult;
      o.innerHTML = `<div class="ball result-num ${r.color}">${r.number}</div>`;
    } else o.innerHTML = '';
  }

  function renderWinners() {
    const rs = S.roundSummary;
    if (!rs) return;
    $('#winner-count').textContent = `당첨 ${rs.winnerCount}/${rs.bettorCount}명`;
    let html = rs.topWinners.map((w, i) => `<div><span>${['🥇', '🥈', '🥉', '4위', '5위'][i]} ${esc(w.name)} <span class="muted">${esc(w.teamName)}</span></span><span class="win num">+${fmt(w.net)}</span></div>`).join('');
    if (!rs.topWinners.length) html = '<div><span>당첨자가 없습니다 😱</span></div>';
    if (rs.bonusTeams && rs.bonusTeams.length) html += `<div><span>🤝 팀워크 보너스</span><span class="gold">${rs.bonusTeams.map(esc).join(', ')}</span></div>`;
    $('#winners').innerHTML = html;
  }

  function renderFinal() {
    const ranked = S.teams.filter((t) => t.members > 0).sort((a, b) => a.rank - b.rank);
    const order = [ranked[1], ranked[0], ranked[2]];
    const cls = ['p2', 'p1', 'p3'];
    $('#podium').innerHTML = order.map((t, i) => (t ? `
      <div class="col ${cls[i]}">
        <div class="name">${esc(t.name)}</div>
        <div class="val num">1인 평균 ${fmt(t.avg)}칩</div>
        <div class="blk">${t.rank}</div>
      </div>` : '<div class="col"></div>')).join('');
    // 3위 → 2위 → 1위 순서로 공개 (새로고침 시 바로 전체 표시)
    finalTimers.forEach(clearTimeout);
    const cols = [...document.querySelectorAll('#podium .col')];
    const elapsed = finalRevealAt ? Date.now() - finalRevealAt : 1e9;
    [[2, 600], [0, 2800], [1, 5200]].forEach(([idx, at]) => {
      const reveal = () => {
        if (!cols[idx]) return;
        cols[idx].classList.add('shown');
        beep(idx === 1 ? 1047 : 660, 0.3, 'triangle', 0.1);
        if (idx === 1) { fanfare(); confetti(7000); }
      };
      if (elapsed >= at) cols[idx] && cols[idx].classList.add('shown');
      else finalTimers.push(setTimeout(reveal, at - elapsed));
    });
    $('#all-teams').innerHTML = ranked.slice(3).map((t) =>
      `<div><span>${t.rank}위 ${esc(t.name)}</span><span class="num">${fmt(t.avg)}</span></div>`).join('') || '';
    $('#mvp').innerHTML = (S.top || []).slice(0, 5).map((p, i) =>
      `<div><span>${['🥇', '🥈', '🥉', '4위', '5위'][i]} ${esc(p.name)} <span class="muted">${esc(p.teamName)}</span></span><span class="gold num">${fmt(p.total)}</span></div>`).join('');
  }

  function tickTimer() {
    const el = document.getElementById('bigtimer');
    if (!el || !S || !S.endsAt) return;
    const left = Math.max(0, Math.ceil((S.endsAt - serverNow()) / 1000));
    if (el.textContent !== String(left)) {
      el.textContent = left;
      if (left <= 5 && left > 0) beep(660, 0.1, 'sine', 0.08);
    }
    el.classList.toggle('urgent', left <= 5);
  }
  setInterval(() => { if (S && S.phase === 'betting') tickTimer(); }, 200);

  // ------------------------------------------------------------ 꽃가루
  const cf = $('#confetti');
  const cctx = cf.getContext('2d');
  let parts = [];
  let cfUntil = 0;
  function confetti(ms) {
    cf.width = innerWidth;
    cf.height = innerHeight;
    cfUntil = performance.now() + ms;
    for (let i = 0; i < 160; i++) {
      parts.push({
        x: Math.random() * cf.width, y: -20 - Math.random() * cf.height * 0.5,
        vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 4, r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3, c: ['#f2c14e', '#d7263d', '#fff', '#47e08a', '#6b9bff'][i % 5], s: 6 + Math.random() * 8,
      });
    }
    if (parts.length <= 160) requestAnimationFrame(cfFrame);
  }
  function cfFrame(now) {
    cctx.clearRect(0, 0, cf.width, cf.height);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.r += p.vr;
      cctx.save(); cctx.translate(p.x, p.y); cctx.rotate(p.r); cctx.fillStyle = p.c;
      cctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); cctx.restore();
    }
    parts = parts.filter((p) => p.y < cf.height + 20);
    if (now > cfUntil) parts = parts.filter((p) => p.y > 0);
    if (parts.length) requestAnimationFrame(cfFrame);
    else cctx.clearRect(0, 0, cf.width, cf.height);
  }
})();
