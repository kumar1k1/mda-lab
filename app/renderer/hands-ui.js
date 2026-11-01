'use strict';
/* global DB, el, signed, mda, Replay, CURRENT_IDX, MONTHS, srcReplays */
// Окно матрицы рук (наведение — подсказка, клик — закрепить), список раздач по руке и реплеер.

const RANKS = 'AKQJT98765432';
const POS_NAMES = ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const handName = (k) => { const i = Math.floor(k / 13), j = k % 13; return i === j ? RANKS[i] + RANKS[j] : i < j ? RANKS[i] + RANKS[j] + 's' : RANKS[j] + RANKS[i] + 'o'; };
let handPop = null, pinned = null, REPLAYS = null;

// Записи реплеера — по запросу, только для нужных раздач (база может быть в гигабайты).
// REPLAYS — кеш уже прочитанных записей; сбрасывается при смене базы.
async function replaysFor(ids) {
  if (!REPLAYS) REPLAYS = new Map();
  const need = []; for (const i of ids) if (!REPLAYS.has(i)) need.push(i);
  for (let k = 0; k < need.length; k += 20000) {
    const part = need.slice(k, k + 20000);
    // собранная база алиаса (ваши ники + игроки базы) — записи из своих источников (srcReplays в app.js)
    const got = (state.player ? mda.playerReplays && await mda.playerReplays(state.player.pid, part) : DB && DB.src ? await srcReplays(part) : mda.replaysFor && await mda.replaysFor(part)) || {};
    for (const i of part) REPLAYS.set(i, got[i] || null);
  }
  if (REPLAYS.size > 300000) { const keep = new Set(ids); for (const key of REPLAYS.keys()) { if (REPLAYS.size <= 150000) break; if (!keep.has(key)) REPLAYS.delete(key); } }
  const out = {}; for (const i of ids) { const r = REPLAYS.get(i); if (r) out[i] = r; }
  return out;
}

function popEl() {
  if (!handPop) {
    handPop = el('div', 'hand-pop'); handPop.setAttribute('role', 'dialog'); handPop.setAttribute('aria-label', 'Матрица рук');
    handPop.hidden = true; document.body.append(handPop);
  }
  return handPop;
}

function hideHandPop() { if (handPop && !pinned) handPop.hidden = true; }

// закреплённое окно матрицы: переключатель «Факт, BB» / «EV, BB» (при наведении — всегда факт)
let POP_MODE = 'net';
function buildPop(it, v, isPinned) {
  const pop = popEl();
  const ev = isPinned && POP_MODE === 'ev' && it.o.es != null;
  const sumOf = (m) => (ev ? m.es : m.sum);
  if (ev) v = it.o.es / 10 / it.o.n;
  pop._src = it; pop.classList.toggle('pinned', isPinned);
  pop.replaceChildren();
  const head = el('div', 'hp-head');
  if (isPinned) { const grip = el('span', 'hp-grip', '⠿'); grip.setAttribute('aria-hidden', 'true'); head.append(grip); }
  // при наведении — фактический винрейт; в закреплённом окне — факт или EV по переключателю
  // заголовок всегда в две строки: название, под ним винрейт и число раздач — одинаково для любой ячейки
  head.append(el('b', null, it.title || it.p));
  if (isPinned) {
    const x = el('button', 'hp-close'); x.type = 'button'; x.setAttribute('aria-label', 'Закрыть окно');
    x.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    x.onclick = () => unpin();
    head.append(x);
    enableDrag(pop, head);
  } else head.append(el('span', 'hp-hint', 'клик — закрепить окно'));
  const sub = el('div', 'hp-sub');
  sub.append(el('span', v >= 0 ? 'up' : 'down', signed(v, 2) + (ev ? ' EV' : '') + (it.vlab || ' BB за открытие')), el('span', 'muted', it.o.n.toLocaleString('ru-RU') + (it.nlab || ' открытий')));
  head.append(sub);
  const inSet = (k) => it.only == null || it.only(k);
  const vals = it.mx.filter((m, k) => inSet(k) && m.n >= 3).map(m => Math.abs(sumOf(m) / 10 / m.n)).sort((a, b) => a - b);
  const scale = Math.max(1, ...vals.slice(0, Math.ceil(vals.length * 0.9)));
  const grid = el('div', 'hp-grid');
  for (let k = 0; k < 169; k++) {
    const m = it.mx[k];
    if (!inSet(k)) { const c = el('div', 'hp-c out'); c.append(el('span', 'h', handName(k))); grid.append(c); continue; }
    const c = el(isPinned && m.n ? 'button' : 'div', 'hp-c');
    if (isPinned && m.n) { c.type = 'button'; c.onclick = () => showHandList(it, k, c); c.title = handName(k) + ': ' + m.n + ' раздач — показать список'; }
    c.append(el('span', 'h', handName(k)));
    if (m.n) {
      const avg = sumOf(m) / 10 / m.n, t = Math.min(1, Math.abs(avg) / scale);
      c.style.background = 'rgba(' + (avg >= 0 ? 'var(--good-rgb)' : 'var(--bad-rgb)') + ',' + (0.18 + 0.72 * t).toFixed(2) + ')';
      if (t > 0.65) c.style.color = '#0B1410';
      c.append(el('span', 'v', (avg >= 0 ? '+' : '−') + Math.abs(avg).toFixed(1)));
      c.title = (c.title ? c.title + '\n' : '') + handName(k) + ': ' + signed(m.sum / 10 / m.n, 2) + ' BB факт' + (m.es != null ? ' · ' + signed(m.es / 10 / m.n, 2) + ' BB EV' : '') + ', ' + m.n + ' раз, всего ' + signed(m.sum / 10, 1) + ' BB';
      if (m.n < 5) c.classList.add('low');
    } else c.classList.add('na');
    grid.append(c);
  }
  const foot = el('div', 'hp-foot');
  foot.append(el('span', null, isPinned ? 'нажмите на руку, чтобы увидеть раздачи и проиграть их' : 'в клетке — средний результат руки в BB'),
    el('span', null, 'зелёный — плюс, красный — минус, бледная — меньше 5 раз, пустая — не играли этой рукой'));
  const list = el('div', 'hp-list'); list.hidden = true;
  const leftCol = el('div', 'hp-left');
  if (isPinned && it.o.es != null) {
    const seg = el('div', 'seg hp-seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Что показать в клетках');
    [['net', 'Факт, BB'], ['ev', 'EV, BB']].forEach(([k, t]) => {
      const b = el('button', POP_MODE === k ? 'on' : '', t); b.type = 'button'; b.setAttribute('aria-pressed', String(POP_MODE === k));
      b.onclick = () => { if (POP_MODE === k) return; POP_MODE = k; const left = pop.style.left, top = pop.style.top, selK = pop._selK; buildPop(it, it.o.sum / 10 / it.o.n, true); pop.hidden = false; pop.style.left = left; pop.style.top = top;
        // открытый список раздач руки — пересобрать в новом режиме (итог справа — факт или EV)
        if (selK != null) { const cb = [...pop.querySelectorAll('button.hp-c')].find(x => x.querySelector('.h') && x.querySelector('.h').textContent === handName(selK)); if (cb) showHandList(it, selK, cb); } };
      seg.append(b);
    });
    leftCol.append(seg);
  }
  leftCol.append(grid, foot);
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
  if (pinned || SZMX_PIN || (window.hoverMuted && window.hoverMuted(ev))) return; // закреплённое окно не подменяем наведением; окно «Диапазона» тоже открыто — не наслаиваем
  const pop = popEl();
  if (pop._src !== it || pop.classList.contains('pinned')) buildPop(it, v, false);
  pop.hidden = false;
  placeNear(pop, ev, anchor);
}

function pinHandPop(it, v, ev, anchor) {
  const was = pinned && handPop ? { left: handPop.style.left, top: handPop.style.top } : null;
  pinned = { pos: it.key || it.p };
  popEl()._selK = null; POP_MODE = 'net'; // каждое новое закрепление — сначала фактический результат
  const pop = buildPop(it, v, true);
  pop.hidden = false;
  // окно — в месте нажатия (чуть ниже-правее курсора); с клавиатуры — на прежнем месте окна
  if (ev && ev.clientX != null) placePopAtClick(pop, ev);
  else if (was) { pop.style.left = was.left; pop.style.top = was.top; }
  else placeNear(pop, ev, anchor);
  clampPop(pop);
  syncScrollLock();
}

function unpin() { pinned = null; if (handPop) { handPop.hidden = true; handPop.classList.remove('pinned'); handPop._src = null; } syncScrollLock(); }

// после смены фильтров закреплённое окно остаётся на месте и пересчитывается
function refreshPinned(items) {
  if (!pinned || !handPop) return;
  const it = items.find(x => (x.key || x.p) === pinned.pos);
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
    try { handle.setPointerCapture(e.pointerId); } catch (err) { /* захват недоступен — перенос работает и без него */ }
    pop.classList.add('dragging');
    const move = (m) => { pop.style.left = Math.max(8 - r.width + 80, Math.min(window.innerWidth - 80, m.clientX - dx)) + 'px'; pop.style.top = Math.max(8, Math.min(window.innerHeight - 40, m.clientY - dy)) + 'px'; };
    const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); pop.classList.remove('dragging'); };
    handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up);
  });
}

// ---------- список раздач по руке ----------
async function showHandList(it, k, cellBtn) {
  const pop = handPop; const list = pop.querySelector('.hp-list'); pop._selK = k;
  pop.querySelectorAll('.hp-c.sel').forEach(c => c.classList.remove('sel')); cellBtn.classList.add('sel');
  const p = it.anyPos ? -1 : POS_NAMES.indexOf(it.p), c = DB.cols; // anyPos — раздачи уже отобраны по позиции (позиции «как в Hand2Note» во вкладке 3-бет)
  const all = (it.ids || CURRENT_IDX).filter(i => c.sit[i] === (it.sit || 0) && (it.act != null ? c.act[i] === it.act : c.act[i] >= 2) && (p < 0 || c.pos[i] === p) && c.hc[i] === k);
  list.hidden = false; pop.classList.add('with-list');
  const rp = {}; let lazy = null; // записи реплеера — подгружаются по мере показа строк
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
  // в окне «EV, BB» — итог и сортировка по EV, в «Факт, BB» — по фактическому результату
  const evm = POP_MODE === 'ev' && it.o.es != null && !!(c.nev || c.net), V = evm ? (c.nev || c.net) : c.net, tag = evm ? ' BB EV' : ' BB';
  function draw() {
    let rows = all.filter(i => {
      const net = V[i] / 10, r = rp[i], stk = c.bb[i] / 10;
      if (f.room !== '' && String(c.room[i]) !== f.room) return false;
      if (f.res === 'win' && net <= 0) return false;
      if (f.res === 'lose' && net >= 0) return false;
      if (f.res === 'big' && Math.abs(net) < 10) return false;
      if (f.street !== '') { const s = reach(i); if (f.street === '0' ? s !== 0 : s < +f.street) return false; }
      if (f.stack) { const [lo, hi] = f.stack.split('-').map(Number); if (stk < lo || stk >= hi) return false; }
      if (f.q && !((r && r.t || '').toLowerCase().includes(f.q))) return false;
      return true;
    });
    const by = { new: (a, b) => c.day[b] - c.day[a] || b - a, old: (a, b) => c.day[a] - c.day[b] || a - b, best: (a, b) => V[b] - V[a], worst: (a, b) => V[a] - V[b], pot: (a, b) => potOf(b) - potOf(a) };
    rows.sort(by[f.sort]);
    const total = rows.reduce((s, i) => s + V[i], 0) / 10;
    head.replaceChildren(el('b', null, handName(k) + (it.p ? ' с ' + it.p : '')), el('span', null, rows.length + (rows.length === all.length ? '' : ' из ' + all.length) + ' раздач'), el('span', total >= 0 ? 'up' : 'down', signed(total, 1) + tag + ' всего' + (rows.length ? ' · ' + signed(total / rows.length, 2) + tag + ' за раздачу' : '')));
    box.replaceChildren(); if (lazy) lazy.stop();
    if (!rows.length) { box.append(el('p', 'muted small', 'Нет раздач под эти фильтры.')); return; }
    lazy = lazyRows(box, rows, rp, { cards: false, ev: evm });
  }
  draw();
  centerPop(pop);
}

// Список раздач без ожидания: строки сразу из колонок базы (дата, рум, стек, итог), карты и турнир дописываются
// по мере подгрузки записей — порциями по 60 в порядке списка; следующие строки добавляются при прокрутке.
const LIST_PAGE = 60;
function dayText(i) { const [y0, m0] = DB.periodStart.split('-').map(Number); const d = new Date(Date.UTC(y0, m0 - 1, 1) + DB.cols.day[i] * 864e5); return d.toISOString().slice(0, 10); }
function lazyRows(box, rows, rp, opt) {
  const c = DB.cols, made = new Map(); let shown = 0, alive = true;
  const fill = (i) => {
    const o = made.get(i); if (!o) return; const r = rp[i];
    if (r === undefined) return; // ещё грузится
    o.play.disabled = !r; if (!r) o.play.title = 'Нет записи раздачи';
    o.d.textContent = r ? r.d : dayText(i); o.t.textContent = (DB.rooms[c.room[i]] || '') + (r && r.t ? ' · ' + r.t : '');
    if (o.cards && r && r.hc) { o.cards.replaceChildren(); r.hc.split(' ').forEach(cd => { const ce = cardEl(cd, true); ce.classList.add('xs'); o.cards.append(ce); }); }
    o.board.replaceChildren(); const bd = r ? r.bd : [];
    if (!bd.length) o.board.append(el('span', 'hp-nob', r && r.sh && Object.keys(r.sh).length ? 'олл-ин префлоп' : 'без флопа'));
    else bd.forEach((cd, j) => { const ce = cardEl(cd, true); ce.classList.add('xs'); if (j === 3 || j === 4) ce.classList.add('gap'); o.board.append(ce); });
  };
  const sentinel = el('div', 'hp-more');
  const more = async () => {
    const page = rows.slice(shown, shown + LIST_PAGE); shown += page.length;
    page.forEach(i => {
      const row = el('div', 'hp-row');
      const play = el('button', 'hp-play'); play.type = 'button'; play.setAttribute('aria-label', 'Проиграть раздачу');
      play.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>';
      play.onclick = () => openReplayer(i, rows); // листание — по этому списку
      const info = el('div', 'hp-info'), d = el('span', 'd', dayText(i)), t = el('span', 't', DB.rooms[c.room[i]] || ''); info.append(d, t);
      const cards = opt.cards ? el('div', 'hp-board') : null, board = el('div', 'hp-board');
      board.append(el('span', 'hp-nob', '…'));
      const net = c.net[i] / 10, evv = (c.nev || c.net)[i] / 10, shown1 = opt.ev ? evv : net;
      const res = resEl(shown1); if (opt.ev) res.append(el('small', 'res-ev', ' EV'));
      row.append(...[play, info, cards, board, el('span', 'stk', (c.bb[i] / 10).toFixed(0) + ' BB'), res].filter(Boolean));
      row.title = 'Стек ' + (c.bb[i] / 10).toFixed(1) + ' BB, итог ' + signed(net, 2) + ' BB, EV ' + signed(evv, 2) + ' BB';
      box.insertBefore(row, sentinel); made.set(i, { play, d, t, cards, board });
      if (rp[i] !== undefined) fill(i);
    });
    if (shown >= rows.length) { sentinel.remove(); io.disconnect(); }
    const need = page.filter(i => rp[i] === undefined);
    if (need.length) { const got = await replaysFor(need); if (!alive) return; need.forEach(i => { rp[i] = got[i] || null; fill(i); }); }
  };
  box.append(sentinel);
  const io = new IntersectionObserver((es) => { if (es.some(e => e.isIntersecting) && shown < rows.length) more(); }, { root: box, rootMargin: '300px' });
  io.observe(sentinel);
  more();
  return { stop() { alive = false; io.disconnect(); } };
}

// список раздач одной руки внутри окна с матрицей (справа от неё): заголовок с итогом, фильтры, строки с реплеером.
// opt.title — подпись (рука), opt.ev — итог, фильтр и сортировка по EV. Возвращает { node, stop }.
function idsPanel(ids, opt) {
  opt = opt || {};
  const c = DB.cols, node = el('div', 'hp-list'), head = el('div', 'hp-list-head'), box = el('div', 'hp-rows'), bar = el('div', 'hl-filters');
  const f = { room: '', res: '', sort: 'new' };
  const sel = (label, key, opts) => { const lab = el('label', 'hl-f'); lab.append(el('span', null, label)); const s = el('select'); opts.forEach(([v, t]) => { const o = el('option', null, t); o.value = v; s.append(o); }); s.onchange = () => { f[key] = s.value; draw(); }; lab.append(s); bar.append(lab); };
  const roomsHere = [...new Set(ids.map(i => c.room[i]))].sort((a, b) => a - b);
  sel('Рум', 'room', [['', 'все']].concat(roomsHere.map(r => [String(r), DB.rooms[r]])));
  sel('Итог', 'res', [['', 'все'], ['win', 'выиграл'], ['lose', 'проиграл']]);
  sel('Порядок', 'sort', [['new', 'сначала новые'], ['old', 'сначала старые'], ['worst', 'сначала худшие'], ['best', 'сначала лучшие']]);
  node.append(head, bar, box);
  const V = opt.ev ? (c.nev || c.net) : c.net, tag = opt.ev ? ' BB EV' : ' BB', rp = {}; let lazy = null;
  function draw() {
    let rows = ids.filter(i => (f.room === '' || String(c.room[i]) === f.room) && (f.res !== 'win' || V[i] > 0) && (f.res !== 'lose' || V[i] < 0));
    const by = { new: (a, b) => c.day[b] - c.day[a] || b - a, old: (a, b) => c.day[a] - c.day[b] || a - b, worst: (a, b) => V[a] - V[b], best: (a, b) => V[b] - V[a] };
    rows.sort(by[f.sort]);
    const total = rows.reduce((s, i) => s + V[i], 0) / 10;
    head.replaceChildren(el('b', null, opt.title || ''), el('span', null, rows.length + (rows.length === ids.length ? '' : ' из ' + ids.length) + ' раздач'), el('span', total >= 0 ? 'up' : 'down', signed(total, 1) + tag + ' всего' + (rows.length ? ' · ' + signed(total / rows.length, 2) + tag + ' за раздачу' : '')));
    box.replaceChildren(); if (lazy) lazy.stop();
    if (!rows.length) { box.append(el('p', 'muted small', 'Нет раздач под эти фильтры.')); return; }
    lazy = lazyRows(box, rows, rp, { cards: false, ev: !!opt.ev });
  }
  draw();
  return { node, stop() { if (lazy) lazy.stop(); } };
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

let RP = null; // открытый реплеер (replayer.js: openReplayer / closeReplayer)

// ---------- список раздач по выбранному столбику (#3.4.8) ----------
let IDS_LIST = null;
async function openIdsList(title, ids, opt) {
  opt = opt || {};
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
  const list = el('div', 'hp-rows il-rows'); list.append(window.mdaLoad ? window.mdaLoad('Загружаю раздачи…') : el('p', 'muted small', 'Загружаю раздачи…'));
  box.append(head, bar, list); bg.append(box); document.body.append(bg);
  syncScrollLock(); // пока список раздач открыт — страница под ним не прокручивается
  // окно можно передвигать за шапку
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, select, input')) return;
    e.preventDefault();
    const r = box.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    box.style.position = 'absolute'; box.style.margin = '0'; box.style.left = r.left + 'px'; box.style.top = r.top + 'px';
    try { head.setPointerCapture(e.pointerId); } catch (err) { /* захват недоступен — перенос работает и без него */ }
    box.classList.add('dragging');
    const move = (m) => { box.style.left = Math.max(8 - r.width + 80, Math.min(window.innerWidth - 80, m.clientX - dx)) + 'px'; box.style.top = Math.max(8, Math.min(window.innerHeight - 40, m.clientY - dy)) + 'px'; };
    const up = () => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); box.classList.remove('dragging'); };
    head.addEventListener('pointermove', move); head.addEventListener('pointerup', up);
  });
  bg.addEventListener('click', (e) => { if (e.target === bg) closeIdsList(); });
  const keys = (e) => { if (e.key === 'Escape' && !RP) closeIdsList(); };
  document.addEventListener('keydown', keys);
  IDS_LIST = { bg, keys };
  x.focus();
  const rp = {}; let lazy = null; // записи реплеера — подгружаются по мере показа строк
  function draw() {
    // opt.ev — список открыт из окна в режиме «EV, BB»: итог, фильтр и сортировка — по EV
    const V = opt.ev ? (c.nev || c.net) : c.net, tag = opt.ev ? ' BB EV' : ' BB';
    let rows = ids.filter(i => (f.room === '' || String(c.room[i]) === f.room) && (f.res !== 'win' || V[i] > 0) && (f.res !== 'lose' || V[i] < 0));
    const by = { new: (a, b) => c.day[b] - c.day[a] || b - a, old: (a, b) => c.day[a] - c.day[b] || a - b, worst: (a, b) => V[a] - V[b], best: (a, b) => V[b] - V[a] };
    rows.sort(by[f.sort]);
    const total = rows.reduce((s, i) => s + V[i], 0) / 10;
    ts.textContent = rows.length + (rows.length === ids.length ? '' : ' из ' + ids.length) + ' раздач · ' + signed(total, 1) + tag + ' всего' + (rows.length ? ' · ' + signed(total / rows.length, 2) + tag + ' за раздачу' : '');
    list.replaceChildren(); if (lazy) lazy.stop();
    if (!rows.length) { list.append(el('p', 'muted small', 'Нет раздач под эти фильтры.')); return; }
    lazy = lazyRows(list, rows, rp, { cards: true, ev: !!opt.ev });
  }
  draw();
}
function closeIdsList() { if (!IDS_LIST) return; document.removeEventListener('keydown', IDS_LIST.keys); IDS_LIST.bg.remove(); IDS_LIST = null; syncScrollLock(); }

// хуки для автопроверки сборки
window.__testPin = async (i, hand) => { window.__pinNet(i); await new Promise(r => setTimeout(r, 200)); const b = [...document.querySelectorAll('.hand-pop button.hp-c')].find(x => x.querySelector('.h').textContent === hand); if (b) b.click(); await new Promise(r => setTimeout(r, 1200)); return document.querySelectorAll('.hp-row').length; };
window.__testPlay = async (row) => { document.querySelectorAll('.hp-play')[row || 0].click(); await new Promise(r => setTimeout(r, 600)); if (RP) RP.stop(); return !!RP; };
window.__testStep = (n) => { for (let k = 0; k < n; k++) document.querySelector('.rp-ctrl .rp-btn:nth-child(4)').click(); };

// итог раздачи в списке — только факт
function resEl(net) {
  return el('span', 'res ' + (net >= 0 ? 'up' : 'down'), signed(net, 1));
}
