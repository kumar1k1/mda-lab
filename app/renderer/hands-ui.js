'use strict';
/* global DB, el, signed, mda, Replay, CURRENT_IDX, MONTHS */
// Окно матрицы рук (наведение — подсказка, клик — закрепить), список раздач по руке и реплеер.

const RANKS = 'AKQJT98765432';
const POS_NAMES = ['EP', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const handName = (k) => { const i = Math.floor(k / 13), j = k % 13; return i === j ? RANKS[i] + RANKS[j] : i < j ? RANKS[i] + RANKS[j] + 's' : RANKS[j] + RANKS[i] + 'o'; };
let handPop = null, pinned = null, REPLAYS = null;

async function loadReplays() {
  if (REPLAYS) return REPLAYS;
  REPLAYS = (mda.replays && await mda.replays()) || {};
  return REPLAYS;
}

function popEl() {
  if (!handPop) {
    handPop = el('div', 'hand-pop'); handPop.setAttribute('role', 'dialog'); handPop.setAttribute('aria-label', 'Матрица рук');
    handPop.hidden = true; document.body.append(handPop);
  }
  return handPop;
}

function hideHandPop() { if (handPop && !pinned) handPop.hidden = true; }

function buildPop(it, v, isPinned) {
  const pop = popEl();
  pop._src = it; pop.classList.toggle('pinned', isPinned);
  pop.replaceChildren();
  const head = el('div', 'hp-head');
  if (isPinned) { const grip = el('span', 'hp-grip', '⠿'); grip.setAttribute('aria-hidden', 'true'); head.append(grip); }
  head.append(el('b', null, it.title || it.p), el('span', v >= 0 ? 'up' : 'down', signed(v, 2) + (it.vlab || ' BB за открытие')), el('span', 'muted', it.o.n.toLocaleString('ru-RU') + (it.nlab || ' открытий')));
  if (isPinned) {
    const x = el('button', 'hp-close'); x.type = 'button'; x.setAttribute('aria-label', 'Закрыть окно');
    x.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    x.onclick = () => unpin();
    head.append(x);
    enableDrag(pop, head);
  } else head.append(el('span', 'hp-hint', 'клик — закрепить окно'));
  const inSet = (k) => it.only == null || it.only(k);
  const vals = it.mx.filter((m, k) => inSet(k) && m.n >= 3).map(m => Math.abs(m.sum / 10 / m.n)).sort((a, b) => a - b);
  const scale = Math.max(1, ...vals.slice(0, Math.ceil(vals.length * 0.9)));
  const grid = el('div', 'hp-grid');
  for (let k = 0; k < 169; k++) {
    const m = it.mx[k];
    if (!inSet(k)) { const c = el('div', 'hp-c out'); c.append(el('span', 'h', handName(k))); grid.append(c); continue; }
    const c = el(isPinned && m.n ? 'button' : 'div', 'hp-c');
    if (isPinned && m.n) { c.type = 'button'; c.onclick = () => showHandList(it, k, c); c.title = handName(k) + ': ' + m.n + ' раздач — показать список'; }
    c.append(el('span', 'h', handName(k)));
    if (m.n) {
      const avg = m.sum / 10 / m.n, t = Math.min(1, Math.abs(avg) / scale);
      c.style.background = 'rgba(' + (avg >= 0 ? 'var(--good-rgb)' : 'var(--bad-rgb)') + ',' + (0.18 + 0.72 * t).toFixed(2) + ')';
      if (t > 0.65) c.style.color = '#0B1410';
      c.append(el('span', 'v', (avg >= 0 ? '+' : '−') + Math.abs(avg).toFixed(1)));
      if (m.n < 5) c.classList.add('low');
    } else c.classList.add('na');
    grid.append(c);
  }
  const foot = el('div', 'hp-foot');
  foot.append(el('span', null, isPinned ? 'нажмите на руку, чтобы увидеть раздачи и проиграть их' : 'в клетке — средний результат руки в BB'),
    el('span', null, 'зелёный — плюс, красный — минус, бледная — меньше 5 раз, пустая — не открывали'));
  const list = el('div', 'hp-list'); list.hidden = true;
  const leftCol = el('div', 'hp-left'); leftCol.append(grid, foot);
  pop.classList.remove('with-list');
  pop.append(head, leftCol, list);
  return pop;
}

function placeNear(pop, ev, anchor) {
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  const cx = ev && ev.clientX ? ev.clientX : r.left + r.width / 2, cy = ev && ev.clientY ? ev.clientY : r.top + r.height / 2;
  let x = cx + 18, y = cy - ph / 2;
  if (x + pw > window.innerWidth - 12) x = cx - pw - 18;
  y = Math.max(12, Math.min(y, window.innerHeight - ph - 12));
  pop.style.left = Math.max(12, x) + 'px'; pop.style.top = y + 'px';
}

function showHandPop(it, v, ev, anchor) {
  if (pinned) return; // закреплённое окно не подменяем наведением
  const pop = popEl();
  if (pop._src !== it || pop.classList.contains('pinned')) buildPop(it, v, false);
  pop.hidden = false;
  placeNear(pop, ev, anchor);
}

function pinHandPop(it, v, ev, anchor) {
  const was = pinned && handPop ? { left: handPop.style.left, top: handPop.style.top } : null;
  pinned = { pos: it.key || it.p };
  const pop = buildPop(it, v, true);
  pop.hidden = false;
  if (was) { pop.style.left = was.left; pop.style.top = was.top; } else placeNear(pop, ev, anchor);
  clampPop(pop);
}

function unpin() { pinned = null; if (handPop) { handPop.hidden = true; handPop.classList.remove('pinned'); handPop._src = null; } }

// после смены фильтров закреплённое окно остаётся на месте и пересчитывается
function refreshPinned(items) {
  if (!pinned || !handPop) return;
  const it = items.find(x => x.p === pinned.pos);
  if (!it || !it.o.n) { unpin(); return; }
  const left = handPop.style.left, top = handPop.style.top;
  const v = it.o.sum / 10 / it.o.n;
  buildPop(it, v, true); handPop.hidden = false; handPop.style.left = left; handPop.style.top = top;
}

function clampPop(pop) {
  const r = pop.getBoundingClientRect();
  const x = Math.max(8, Math.min(r.left, window.innerWidth - r.width - 8)), y = Math.max(8, Math.min(r.top, window.innerHeight - 60));
  pop.style.left = x + 'px'; pop.style.top = y + 'px';
}

function enableDrag(pop, handle) {
  handle.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    e.preventDefault();
    const r = pop.getBoundingClientRect(); const dx = e.clientX - r.left, dy = e.clientY - r.top;
    handle.setPointerCapture(e.pointerId); pop.classList.add('dragging');
    const move = (m) => { pop.style.left = Math.max(8 - r.width + 80, Math.min(window.innerWidth - 80, m.clientX - dx)) + 'px'; pop.style.top = Math.max(8, Math.min(window.innerHeight - 40, m.clientY - dy)) + 'px'; };
    const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); pop.classList.remove('dragging'); };
    handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up);
  });
}

// ---------- список раздач по руке ----------
async function showHandList(it, k, cellBtn) {
  const pop = handPop; const list = pop.querySelector('.hp-list');
  pop.querySelectorAll('.hp-c.sel').forEach(c => c.classList.remove('sel')); cellBtn.classList.add('sel');
  const p = POS_NAMES.indexOf(it.p), c = DB.cols;
  const all = (it.ids || CURRENT_IDX).filter(i => c.sit[i] === (it.sit || 0) && c.act[i] >= 2 && c.pos[i] === p && c.hc[i] === k);
  list.hidden = false; pop.classList.add('with-list'); list.replaceChildren(el('div', 'hp-list-head', 'Загружаю раздачи…'));
  const rp = await loadReplays();
  const reach = (i) => { const r = rp[i]; if (!r) return 0; if (r.sh && Object.keys(r.sh).length) return 4; return r.bd.length === 5 ? 3 : r.bd.length === 4 ? 2 : r.bd.length === 3 ? 1 : 0; };
  const f = { room: '', res: '', street: '', stack: '', q: '', sort: 'new' };

  // панель фильтров
  const bar = el('div', 'hl-filters');
  const sel = (label, key, opts) => {
    const lab = el('label', 'hl-f'); lab.append(el('span', null, label));
    const s = el('select'); opts.forEach(([v, t]) => { const o = el('option', null, t); o.value = v; s.append(o); });
    s.onchange = () => { f[key] = s.value; draw(); }; lab.append(s); bar.append(lab); return s;
  };
  const roomsHere = [...new Set(all.map(i => c.room[i]))].sort((a, b) => a - b);
  sel('Рум', 'room', [['', 'все']].concat(roomsHere.map(r => [String(r), DB.rooms[r]])));
  sel('Итог', 'res', [['', 'все'], ['win', 'выиграл'], ['lose', 'проиграл']]);
  sel('Порядок', 'sort', [['new', 'сначала новые'], ['old', 'сначала старые'], ['worst', 'сначала худшие'], ['best', 'сначала лучшие']]);

  const head = el('div', 'hp-list-head');
  const box = el('div', 'hp-rows');
  list.replaceChildren(head, bar, box);

  function potOf(i) { const r = rp[i]; if (!r) return 0; return r.ev.filter(e => e[2] === 'W').reduce((s, e) => s + e[3], 0); }
  function draw() {
    let rows = all.filter(i => {
      const net = c.net[i] / 10, r = rp[i], stk = c.bb[i] / 10;
      if (f.room !== '' && String(c.room[i]) !== f.room) return false;
      if (f.res === 'win' && net <= 0) return false;
      if (f.res === 'lose' && net >= 0) return false;
      if (f.res === 'big' && Math.abs(net) < 10) return false;
      if (f.street !== '') { const s = reach(i); if (f.street === '0' ? s !== 0 : s < +f.street) return false; }
      if (f.stack) { const [lo, hi] = f.stack.split('-').map(Number); if (stk < lo || stk >= hi) return false; }
      if (f.q && !((r && r.t || '').toLowerCase().includes(f.q))) return false;
      return true;
    });
    const by = { new: (a, b) => c.day[b] - c.day[a] || b - a, old: (a, b) => c.day[a] - c.day[b] || a - b, best: (a, b) => c.net[b] - c.net[a], worst: (a, b) => c.net[a] - c.net[b], pot: (a, b) => potOf(b) - potOf(a) };
    rows.sort(by[f.sort]);
    const total = rows.reduce((s, i) => s + c.net[i], 0) / 10;
    head.replaceChildren(el('b', null, handName(k) + ' с ' + it.p), el('span', null, rows.length + (rows.length === all.length ? '' : ' из ' + all.length) + ' раздач'), el('span', total >= 0 ? 'up' : 'down', signed(total, 1) + ' BB всего'));
    box.replaceChildren();
    if (!rows.length) { box.append(el('p', 'muted small', 'Нет раздач под эти фильтры.')); return; }
    rows.forEach(i => {
      const r = rp[i];
      const row = el('div', 'hp-row');
      const play = el('button', 'hp-play'); play.type = 'button'; play.setAttribute('aria-label', 'Проиграть раздачу');
      play.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>';
      play.disabled = !r; play.onclick = () => openReplayer(i);
      const net = c.net[i] / 10;
      const info = el('div', 'hp-info');
      info.append(el('span', 'd', r ? r.d : '—'), el('span', 't', (DB.rooms[c.room[i]] || '') + (r && r.t ? ' · ' + r.t : '')));
      const board = el('div', 'hp-board');
      const bd = r ? r.bd : [];
      if (!bd.length) board.append(el('span', 'hp-nob', reach(i) === 4 ? 'олл-ин префлоп' : 'без флопа'));
      else bd.forEach((cd, j) => { const ce = cardEl(cd, true); ce.classList.add('xs'); if (j === 3 || j === 4) ce.classList.add('gap'); board.append(ce); });
      row.append(play, info, board, el('span', 'stk', (c.bb[i] / 10).toFixed(0) + ' BB'), el('span', 'res ' + (net >= 0 ? 'up' : 'down'), signed(net, 1)));
      row.title = 'Стек ' + (c.bb[i] / 10).toFixed(1) + ' BB, итог ' + signed(net, 2) + ' BB';
      box.append(row);
    });
  }
  draw();
  centerPop(pop);
}

// окно со списком раздач всегда по центру экрана
function centerPop(pop) {
  const w = pop.offsetWidth, h = pop.offsetHeight;
  pop.style.left = Math.max(8, (window.innerWidth - w) / 2) + 'px';
  pop.style.top = Math.max(8, (window.innerHeight - h) / 2) + 'px';
}

// ---------- реплеер ----------
const SUIT = { s: '♠', h: '♥', d: '♦', c: '♣' };
function cardEl(code, small) {
  const d = el('div', 'pc' + (small ? ' sm' : ''));
  if (!code) { d.classList.add('back'); return d; }
  d.classList.add('s-' + code[1]);
  d.append(el('span', 'r', code[0] === 'T' ? '10' : code[0]), el('span', 'u', SUIT[code[1]] || ''));
  return d;
}

let RP = null;
async function openReplayer(i) {
  const rp = (await loadReplays())[i]; if (!rp) return;
  closeReplayer();
  const fr = Replay.frames(rp);
  const bg = el('div', 'rp-bg'); bg.setAttribute('role', 'dialog'); bg.setAttribute('aria-modal', 'true'); bg.setAttribute('aria-label', 'Реплеер раздачи');
  const box = el('div', 'rp');
  const head = el('div', 'rp-head');
  const ttl = el('div', 'rp-title');
  ttl.append(el('b', null, (DB.rooms[DB.cols.room[i]] || '') + ' · ' + (rp.t || '')), el('span', 'muted', rp.d + ' · вы на ' + rp.pl[rp.h][0] + ' · стек ' + rp.pl[rp.h][1] + ' BB'));
  const x = el('button', 'icon-btn'); x.type = 'button'; x.setAttribute('aria-label', 'Закрыть реплеер');
  x.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  x.onclick = closeReplayer;
  head.append(ttl, x);
  const main = el('div', 'rp-main');
  const table = el('div', 'rp-table');
  const felt = el('div', 'rp-felt');
  const center = el('div', 'rp-center'); const boardEl = el('div', 'rp-board'); const potEl = el('div', 'rp-pot');
  center.append(boardEl, potEl); felt.append(center); table.append(felt);
  const n = rp.pl.length;
  const seatEls = rp.pl.map((p, k) => {
    const ang = Math.PI / 2 + (k - rp.h) * 2 * Math.PI / n;
    const sx = 50 + 44 * Math.cos(ang), sy = 50 + 40 * Math.sin(ang);
    const bx = 50 + 26 * Math.cos(ang), by = 50 + 22 * Math.sin(ang);
    const seat = el('div', 'rp-seat' + (k === rp.h ? ' hero' : ''));
    seat.style.left = sx + '%'; seat.style.top = sy + '%';
    const cards = el('div', 'rp-cards');
    const lab = el('div', 'rp-lab'); lab.append(el('b', null, k === rp.h ? 'Вы · ' + p[0] : p[0]));
    const stack = el('div', 'rp-stack');
    seat.append(cards, lab, stack);
    if (p[0] === 'BTN') { const d = el('span', 'rp-dealer', 'D'); seat.append(d); }
    const bet = el('div', 'rp-bet'); bet.style.left = bx + '%'; bet.style.top = by + '%';
    table.append(seat, bet);
    return { seat, cards, stack, bet };
  });
  const ctrl = el('div', 'rp-ctrl');
  const mk = (label, svg, fn) => { const b = el('button', 'rp-btn'); b.type = 'button'; b.setAttribute('aria-label', label); b.title = label; b.innerHTML = svg; b.onclick = fn; ctrl.append(b); return b; };
  const I = (d) => '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' + d + '</svg>';
  const state = { k: 0, timer: null };
  mk('В начало', I('<path d="M6 5h2v14H6zM20 5v14L9 12z"/>'), () => go(0));
  mk('Шаг назад', I('<path d="M18 5v14L7 12z"/>'), () => go(state.k - 1));
  const playB = mk('Воспроизвести', I('<path d="M7 4.5v15l13-7.5z"/>'), () => toggle());
  playB.classList.add('main');
  mk('Шаг вперёд', I('<path d="M6 5v14l11-7z"/>'), () => go(state.k + 1));
  mk('В конец', I('<path d="M16 5h2v14h-2zM4 5v14l11-7z"/>'), () => go(fr.length - 1));
  const speed = el('select', 'rp-speed'); speed.setAttribute('aria-label', 'Скорость');
  [['1200', '1×'], ['700', '2×'], ['350', '4×']].forEach(([v, l]) => { const o = el('option', null, l); o.value = v; speed.append(o); });
  speed.value = '700'; ctrl.append(speed);
  const prog = el('span', 'rp-prog'); ctrl.append(prog);
  const action = el('div', 'rp-action');
  const log = el('ol', 'rp-log');
  fr.forEach((f, k) => { if (k === 0) return; const li = el('li', null, f.text); li.dataset.street = f.street; li.onclick = () => go(k); li.tabIndex = 0; li.onkeydown = (e) => { if (e.key === 'Enter') go(k); }; log.append(li); });
  const side = el('div', 'rp-side'); side.append(el('div', 'rp-side-h', 'Ход раздачи'), log);
  const left = el('div', 'rp-left'); left.append(table, action, ctrl);
  main.append(left);
  box.append(head, main); bg.append(box); document.body.append(bg);
  bg.addEventListener('click', (e) => { if (e.target === bg) closeReplayer(); });

  function go(k) {
    k = Math.max(0, Math.min(fr.length - 1, k)); state.k = k;
    const f = fr[k];
    boardEl.replaceChildren(...rp.bd.slice(0, f.board).map(c => cardEl(c)));
    potEl.textContent = f.pot > 0 ? 'Банк ' + f.pot + ' BB' : '';
    seatEls.forEach((s, j) => {
      s.seat.classList.toggle('folded', f.folded[j]);
      s.seat.classList.toggle('act', f.actor === j);
      s.seat.classList.toggle('won', f.won[j] > 0);
      s.stack.textContent = (f.allin[j] && f.stacks[j] <= 0.01 ? 'олл-ин' : f.stacks[j] + ' BB');
      const show = j === rp.h ? (rp.hc || '').split(' ') : f.show && rp.sh && rp.sh[j] ? rp.sh[j].split(' ') : null;
      s.cards.replaceChildren(...(f.folded[j] && j !== rp.h ? [] : show ? show.map(c => cardEl(c, true)) : [cardEl(null, true), cardEl(null, true)]));
      s.bet.textContent = f.bets[j] > 0 ? f.bets[j] + ' BB' : '';
      s.bet.hidden = !(f.bets[j] > 0);
    });
    action.textContent = f.text;
    prog.textContent = 'шаг ' + k + ' из ' + (fr.length - 1);
    if (k >= fr.length - 1) stop();
  }
  function stop() { clearInterval(state.timer); state.timer = null; playB.innerHTML = I('<path d="M7 4.5v15l13-7.5z"/>'); playB.setAttribute('aria-label', 'Воспроизвести'); }
  function toggle() {
    if (state.timer) { stop(); return; }
    if (state.k >= fr.length - 1) go(0);
    playB.innerHTML = I('<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>'); playB.setAttribute('aria-label', 'Пауза');
    state.timer = setInterval(() => go(state.k + 1), +speed.value);
  }
  speed.onchange = () => { if (state.timer) { stop(); toggle(); } };
  RP = { bg, stop, keys: (e) => { if (e.key === 'Escape') closeReplayer(); else if (e.key === 'ArrowRight') go(state.k + 1); else if (e.key === 'ArrowLeft') go(state.k - 1); else if (e.key === ' ') { e.preventDefault(); toggle(); } } };
  document.addEventListener('keydown', RP.keys);
  go(1); toggle();
  playB.focus();
}

function closeReplayer() {
  if (!RP) return;
  RP.stop(); document.removeEventListener('keydown', RP.keys); RP.bg.remove(); RP = null;
}

// ---------- список раздач по выбранному столбику (#3.4.8) ----------
let IDS_LIST = null;
async function openIdsList(title, ids) {
  closeIdsList();
  const c = DB.cols;
  const bg = el('div', 'il-bg'); bg.setAttribute('role', 'dialog'); bg.setAttribute('aria-modal', 'true'); bg.setAttribute('aria-label', title);
  const box = el('div', 'il');
  const head = el('div', 'il-head');
  const ttl = el('div', 'il-title'); const tb = el('b', null, title); const ts = el('span', 'muted'); ttl.append(tb, ts);
  const x = el('button', 'icon-btn'); x.type = 'button'; x.setAttribute('aria-label', 'Закрыть список');
  x.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  x.onclick = closeIdsList;
  head.append(ttl, x);
  const f = { room: '', res: '', sort: 'new' };
  const bar = el('div', 'hl-filters');
  const sel = (label, key, opts) => { const lab = el('label', 'hl-f'); lab.append(el('span', null, label)); const s = el('select'); opts.forEach(([v, t]) => { const o = el('option', null, t); o.value = v; s.append(o); }); s.onchange = () => { f[key] = s.value; draw(); }; lab.append(s); bar.append(lab); };
  const roomsHere = [...new Set(ids.map(i => c.room[i]))].sort((a, b) => a - b);
  sel('Рум', 'room', [['', 'все']].concat(roomsHere.map(r => [String(r), DB.rooms[r]])));
  sel('Итог', 'res', [['', 'все'], ['win', 'выиграл'], ['lose', 'проиграл']]);
  sel('Порядок', 'sort', [['new', 'сначала новые'], ['old', 'сначала старые'], ['worst', 'сначала худшие'], ['best', 'сначала лучшие']]);
  const list = el('div', 'hp-rows il-rows'); list.append(el('p', 'muted small', 'Загружаю раздачи…'));
  box.append(head, bar, list); bg.append(box); document.body.append(bg);
  bg.addEventListener('click', (e) => { if (e.target === bg) closeIdsList(); });
  const keys = (e) => { if (e.key === 'Escape' && !RP) closeIdsList(); };
  document.addEventListener('keydown', keys);
  IDS_LIST = { bg, keys };
  x.focus();
  const rp = await loadReplays();
  function draw() {
    let rows = ids.filter(i => (f.room === '' || String(c.room[i]) === f.room) && (f.res !== 'win' || c.net[i] > 0) && (f.res !== 'lose' || c.net[i] < 0));
    const by = { new: (a, b) => c.day[b] - c.day[a] || b - a, old: (a, b) => c.day[a] - c.day[b] || a - b, worst: (a, b) => c.net[a] - c.net[b], best: (a, b) => c.net[b] - c.net[a] };
    rows.sort(by[f.sort]);
    const total = rows.reduce((s, i) => s + c.net[i], 0) / 10;
    ts.textContent = rows.length + (rows.length === ids.length ? '' : ' из ' + ids.length) + ' раздач · ' + signed(total, 1) + ' BB всего';
    list.replaceChildren();
    if (!rows.length) { list.append(el('p', 'muted small', 'Нет раздач под эти фильтры.')); return; }
    rows.slice(0, 400).forEach(i => {
      const r = rp[i];
      const row = el('div', 'hp-row');
      const play = el('button', 'hp-play'); play.type = 'button'; play.setAttribute('aria-label', 'Проиграть раздачу');
      play.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>';
      play.disabled = !r; if (!r) play.title = 'Нет записи раздачи (PokerDom без карт героя)'; play.onclick = () => openReplayer(i);
      const net = c.net[i] / 10;
      const info = el('div', 'hp-info');
      info.append(el('span', 'd', r ? r.d : '—'), el('span', 't', (DB.rooms[c.room[i]] || '') + (r && r.t ? ' · ' + r.t : '')));
      const cards = el('div', 'hp-board');
      if (r && r.hc) r.hc.split(' ').forEach(cd => { const ce = cardEl(cd, true); ce.classList.add('xs'); cards.append(ce); });
      const board = el('div', 'hp-board');
      const bd = r ? r.bd : [];
      if (!bd.length) board.append(el('span', 'hp-nob', 'без флопа'));
      else bd.forEach((cd, j) => { const ce = cardEl(cd, true); ce.classList.add('xs'); if (j === 3 || j === 4) ce.classList.add('gap'); board.append(ce); });
      row.append(play, info, cards, board, el('span', 'stk', (c.bb[i] / 10).toFixed(0) + ' BB'), el('span', 'res ' + (net >= 0 ? 'up' : 'down'), signed(net, 1)));
      list.append(row);
    });
    if (rows.length > 400) list.append(el('p', 'muted small', 'Показаны первые 400. Уточните фильтры.'));
  }
  draw();
}
function closeIdsList() { if (!IDS_LIST) return; document.removeEventListener('keydown', IDS_LIST.keys); IDS_LIST.bg.remove(); IDS_LIST = null; }

// хуки для автопроверки сборки
window.__testPin = async (i, hand) => { window.__pinNet(i); await new Promise(r => setTimeout(r, 200)); const b = [...document.querySelectorAll('.hand-pop button.hp-c')].find(x => x.querySelector('.h').textContent === hand); if (b) b.click(); await new Promise(r => setTimeout(r, 1200)); return document.querySelectorAll('.hp-row').length; };
window.__testPlay = async (row) => { document.querySelectorAll('.hp-play')[row || 0].click(); await new Promise(r => setTimeout(r, 600)); if (RP) RP.stop(); return !!RP; };
window.__testStep = (n) => { for (let k = 0; k < n; k++) document.querySelector('.rp-ctrl .rp-btn:nth-child(4)').click(); };
