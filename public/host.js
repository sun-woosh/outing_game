(function () {
  'use strict';
  const { $, fmt, esc, toast, serverNow, syncClock, emitAck } = window.MR;
  const PIN_KEY = 'mr_host_pin';
  let S = null;
  let players = [];
  let authed = false;

  const socket = window.MR.connect(auth);
  window.MR.connBadge(socket);

  async function auth() {
    let pin = null;
    try { pin = sessionStorage.getItem(PIN_KEY); } catch (e) { /* ignore */ }
    if (!pin) return showLogin();
    const r = await emitAck(socket, 'host:auth', { pin });
    if (!r.ok) { try { sessionStorage.removeItem(PIN_KEY); } catch (e) { /* ignore */ } return showLogin(r.error); }
    authed = true;
    $('#h-login').classList.add('hidden');
    $('#h-main').classList.remove('hidden');
  }
  function showLogin(err) {
    $('#h-login').classList.remove('hidden');
    $('#h-main').classList.add('hidden');
    if (err) toast(err, 'err');
  }
  $('#login-btn').addEventListener('click', () => {
    try { sessionStorage.setItem(PIN_KEY, $('#pin').value.trim()); } catch (e) { /* ignore */ }
    auth();
  });
  $('#pin').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#login-btn').click(); });

  fetch('/join-url').then((r) => r.json()).then((d) => ($('#join-url').textContent = '참가 주소: ' + d.url)).catch(() => {});

  socket.on('state', (s) => { syncClock(s); S = s; render(); });
  socket.on('players', (list) => { players = list; renderPlayers(); });

  let busy = false;
  async function cmd(name, args, confirmMsg) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    if (busy) return;
    busy = true;
    const r = await emitAck(socket, 'host:cmd', { cmd: name, args });
    busy = false;
    if (!r.ok) toast(r.error, 'err');
  }

  const PHASE_KO = { lobby: '참가 대기', betting: '베팅 중', locked: '베팅 마감', spinning: '룰렛 회전 중', result: '결과 발표', final: '게임 종료' };

  function primaryAction() {
    if (!S) return null;
    switch (S.phase) {
      case 'lobby': return { label: `▶ 라운드 1 시작`, cmd: 'start', hint: '참가자가 다 들어왔는지 확인 후 시작하세요. 늦게 온 사람도 게임 중 입장 가능합니다.' };
      case 'betting': return { label: '⛔ 지금 베팅 마감', cmd: 'lock', hint: '타이머가 0이 되면 자동으로 마감됩니다.' };
      case 'locked': return { label: '🎡 룰렛 돌리기', cmd: 'spin', hint: '빔 화면에서 룰렛이 약 9초간 돌아갑니다.' };
      case 'spinning': return { label: '회전 중…', cmd: null, hint: '결과는 자동으로 발표됩니다.' };
      case 'result':
        return S.round < S.rounds
          ? { label: `▶ 라운드 ${S.round + 1} 시작`, cmd: 'start', hint: `다음: ${S.nextEvent || ''}` }
          : { label: '🏆 최종 결과 발표', cmd: 'finish', hint: '마지막 라운드가 끝났습니다.' };
      case 'final': return { label: '게임 종료됨', cmd: null, hint: '다시 하려면 "칩/라운드 초기화"를 누르세요.' };
      default: return null;
    }
  }

  $('#primary').addEventListener('click', () => {
    const a = primaryAction();
    if (a && a.cmd) cmd(a.cmd, {});
  });
  $('#extend').addEventListener('click', () => cmd('extend', { seconds: 15 }));
  $('#finish').addEventListener('click', () => cmd('finish', {}, '게임을 종료하고 최종 결과를 발표할까요? (진행 중 베팅은 환불)'));
  $('#reset').addEventListener('click', () => cmd('reset', {}, '참가자는 유지하고 모든 칩과 라운드를 초기화할까요?'));
  $('#wipe').addEventListener('click', () => cmd('wipe', {}, '⚠️ 모든 참가자를 삭제하고 처음부터 시작할까요? 참가자는 다시 입장해야 합니다.'));
  $('#save-cfg').addEventListener('click', () => {
    const names = $('#c-names').value.split(',').map((s) => s.trim()).filter(Boolean);
    const events = $('#c-events').value.split(',').map((s) => s.trim()).filter(Boolean);
    cmd('config', {
      teamCount: $('#c-teams').value,
      rounds: $('#c-rounds').value,
      startChips: $('#c-chips').value,
      betSeconds: $('#c-secs').value,
      teamNames: names,
      events,
    }).then(() => toast('저장했습니다', 'ok'));
  });

  let cfgFilled = false;
  function render() {
    if (!S || !authed) return;
    const a = primaryAction();
    const btn = $('#primary');
    btn.textContent = a ? a.label : '';
    btn.disabled = !a || !a.cmd;
    $('#hint').textContent = a ? a.hint : '';
    $('#extend').disabled = S.phase !== 'betting';
    const c = S.counts;
    let timer = '';
    if (S.phase === 'betting' && S.endsAt) timer = ` · 남은 시간 <b id="h-timer">${Math.max(0, Math.ceil((S.endsAt - serverNow()) / 1000))}</b>초`;
    const res = S.lastResult ? ` · 최근 결과 <b>${S.lastResult.number}</b>` : '';
    $('#status').innerHTML = `상태: <b>${PHASE_KO[S.phase]}</b> · 라운드 <b>${S.round}/${S.rounds}</b>${timer}<br>` +
      `참가 <b>${c.players}</b>명 (접속 ${c.online}) · 이번 라운드 베팅 <b>${c.bettors}</b>명${res}<br>` +
      `이벤트: <b>${esc(S.event ? S.event.title : '-')}</b>${S.luckyNumber != null ? ` (럭키 ${S.luckyNumber})` : ''}`;
    $('#cfg-card').style.opacity = S.phase === 'lobby' ? 1 : 0.5;
    $('#save-cfg').disabled = S.phase !== 'lobby';
    if (!cfgFilled && S.config) {
      cfgFilled = true;
      $('#c-teams').value = S.config.teamCount;
      $('#c-rounds').value = S.config.rounds;
      $('#c-chips').value = S.config.startChips;
      $('#c-secs').value = S.config.betSeconds;
      $('#c-names').value = (S.config.teamNames || []).join(',');
      $('#c-events').value = (S.config.events || []).join(',');
    }
  }
  setInterval(() => {
    const el = document.getElementById('h-timer');
    if (el && S && S.endsAt) el.textContent = Math.max(0, Math.ceil((S.endsAt - serverNow()) / 1000));
  }, 250);

  $('#search').addEventListener('input', renderPlayers);
  function renderPlayers() {
    if (!authed) return;
    const q = $('#search').value.trim();
    const teamCount = S && S.config ? S.config.teamCount : 9;
    const list = players.filter((p) => !q || p.name.includes(q)).sort((a, b) => a.team - b.team || a.name.localeCompare(b.name));
    $('#plist-title').textContent = `참가자 ${players.length}명 (접속 ${players.filter((p) => p.online).length})`;
    const opts = (sel) => Array.from({ length: teamCount }, (_, i) => `<option value="${i + 1}" ${sel === i + 1 ? 'selected' : ''}>${i + 1}조</option>`).join('');
    $('#plist').innerHTML = list.map((p) => `
      <tr>
        <td><span class="dot ${p.online ? 'on' : ''}"></span>${esc(p.name)}</td>
        <td><select data-move="${p.id}">${opts(p.team)}</select></td>
        <td class="r num">${fmt(p.chips)}</td>
        <td class="r num">${fmt(p.total)}</td>
        <td class="r">${p.betCount || ''}</td>
        <td class="r num">${p.rescued ? fmt(p.rescued) : ''}</td>
        <td class="r"><button class="small-btn" data-kick="${p.id}" data-name="${esc(p.name)}">삭제</button></td>
      </tr>`).join('');
  }
  $('#plist').addEventListener('change', (e) => {
    const id = e.target.dataset.move;
    if (id) cmd('move', { id, team: Number(e.target.value) });
  });
  $('#plist').addEventListener('click', (e) => {
    const id = e.target.dataset.kick;
    if (id) cmd('kick', { id }, `${e.target.dataset.name} 님을 삭제할까요?`);
  });
})();
