'use strict';
/* global mda, Stats */
// Главный файл: список разделов, отрисовка, выбор игрока и алиасы, загрузка базы. Вкладки — в tab-*.js, общие части — core.js, widgets.js, sec-filters.js, windows.js.

// ---------- вкладки (группы и список будем менять) ----------
const GROUPS = [
  { title: 'Префлоп', tabs: [
    { id: 'rfi', code: 'RFI', label: 'Открытие', render: renderRFI },
    { id: 'cc', code: 'CC', label: 'Колд-колл', render: renderCC, plan: 'Колд-колл против открытия по позициям, сайзингам открытия и стеку.' },
    { id: '3bet', code: '3B', label: '3-бет', render: renderTB },
    { id: 'vs3bet', code: 'v3B', label: 'Против 3-бета', render: renderV3B, plan: 'Фолд / колл / 4-бет против 3-бета по позициям и стеку.' },
    { id: 'sqz', code: 'SQZ', label: 'Сквиз', plan: 'Сквиз после открытия и колла, по позициям и числу коллеров.' },
    { id: '4bet', code: '4B', label: '4-бет', plan: '4-бет и 4-бет олл-ин, реакция на 5-бет.' },
    { id: 'vssteal', code: 'vST', label: 'Против стила', plan: 'Защита блайндов против стила с CO / BTN / SB: фолд, колл, 3-бет.' },
    { id: 'mwr', code: 'MWR', label: 'Мультивей: рейзер', plan: 'Мультивей-банки, где вы префлоп-рейзер.' },
    { id: 'mwc', code: 'MWC', label: 'Мультивей: коллер', plan: 'Мультивей-банки, где вы коллер.' },
    { id: 'limp', code: 'LMP', label: 'Лимп', plan: 'Лимпы, оверлимпы, лимп-фолд и лимп-рейз по позициям и стеку.' }
  ] },
  { title: 'Постфлоп', tabs: [
    { id: 'rvsbb', code: 'RvBB', label: 'Рейзер vs BB', plan: 'Постфлоп префлоп-рейзера против BB: c-bet, тёрн, ривер.' },
    { id: 'rvscc', code: 'RvCC', label: 'Рейзер vs CC', plan: 'Постфлоп рейзера против колд-коллера.' },
    { id: 'ccvsr', code: 'CCvR', label: 'CC vs рейзер', plan: 'Постфлоп колд-коллера против рейзера.' },
    { id: 'bbvsr', code: 'BBvR', label: 'BB vs рейзер', plan: 'Постфлоп BB против рейзера: фолд на c-bet, чек-рейз, донк.' }
  ] },
  { title: 'Блайнд против блайнда', tabs: [
    { id: 'bvbsb', code: 'SB', label: 'Из SB', plan: 'Блайнд против блайнда со стороны SB: лимп, рейз, олл-ин по стеку.' },
    { id: 'bvbbb', code: 'BB', label: 'Из BB', plan: 'Блайнд против блайнда со стороны BB.' }
  ] },
  { title: 'Итоги', tabs: [
    { id: 'wtsd', code: 'SD', label: 'Вскрытия', plan: 'WTSD, W$SD, WWSF по линиям и типам банка.' },
    { id: 'tree', code: 'TREE', label: 'Дерево решений', plan: 'Дерево действий: как часто вы приходите в каждый узел и что там делаете.' },
    { id: 'overall', code: 'ALL', label: 'Общие показатели', plan: 'VPIP, PFR, агрессия, результаты в фишках и bb.' },
    { id: 'graphs', code: 'GR', label: 'Графики', plan: 'График выигрыша в фишках и bb, all-in EV, результаты по бай-инам и румам.' }
  ] },
  { title: 'База', tabs: [
    { id: 'aliases', code: 'ALS', label: 'Редактор алиасов', render: () => renderAliasEditor() }
  ] }
];
const TABS = GROUPS.flatMap(g => g.tabs.map(t => Object.assign({ group: g.title }, t)));

function renderSoon(tab) {
  const c = el('div', 'soon');
  c.append(el('h1', null, tab.label), el('p', null, tab.plan), el('p', 'muted', 'Вкладка в работе. Пришлите скриншот, как она выглядит у вас, или опишите, какие таблицы нужны.'));
  return c;
}

// ---------- отрисовка ----------
function currentIdx() {
  // ваш стек из фильтров раздела: в «Открытии», «Колд-колле», «3-бете» и «Против 3-бета» — по карточкам, в остальных разделах — для всех
  const sr = state.tab === 'rfi' || state.tab === 'cc' || state.tab === '3bet' || state.tab === 'vs3bet' ? null : secRange(state.tab); // стек раздела — по карточкам (renderRFISummary / renderCC / renderTB / renderV3B)
  const idx = Stats.selectHands(DB, { aid: DB === HERO_DB && !state.player ? state.alias : null, room: state.room, type: state.type, from: state.from, to: state.to, biFrom: state.biFrom, biTo: state.biTo, tbl: state.sub === 'TOT' ? null : state.sub, minBB: sr ? sr[0] : null, maxBB: sr && sr[1] < 1e8 ? sr[1] : null });
  return idx; // у соперника своя база (DB) — все его раздачи
}

// Отклик на нажатие — сразу: кнопка выделяется и экран слегка гаснет в этот же кадр, а пересчёт (у большой базы — доли
// секунды) идёт следующим кадром. Раньше пересчёт шёл прямо в обработчике нажатия, и окно на это время «залипало».
// Общий значок загрузки: «бегунок» с подписью над содержимым, пока считаются или грузятся данные (для всех разделов)
window.mdaLoad = (text) => { const d = document.createElement('div'); d.className = 'mda-load'; d.setAttribute('role', 'status'); const i = document.createElement('i'); i.setAttribute('aria-hidden', 'true'); const b = document.createElement('span'); b.textContent = text || 'Загружаю данные…'; d.append(i, b); return d; };
let BUSY_N = 0, BUSY_EL = null;
window.mdaBusy = (on, text) => {
  BUSY_N = Math.max(0, BUSY_N + (on ? 1 : -1));
  if (!BUSY_EL) { BUSY_EL = document.createElement('div'); BUSY_EL.className = 'mda-busy'; BUSY_EL.setAttribute('role', 'status'); BUSY_EL.setAttribute('aria-live', 'polite'); BUSY_EL.append(document.createElement('i'), document.createElement('span')); document.body.append(BUSY_EL); }
  if (on && text) BUSY_EL.lastChild.textContent = text; else if (on) BUSY_EL.lastChild.textContent = 'Загружаю данные…';
  BUSY_EL.classList.toggle('on', BUSY_N > 0);
};
let RS_F = 0, LASTBTN = null, RENDER_TAB = null, HSTD = {};
document.addEventListener('click', (e) => { LASTBTN = e.target && e.target.closest ? e.target.closest('button') : null; }, true);
function renderNext() {
  // перерисовка под новые фильтры: висящие окна, списки и реплеер со старой выборкой закрываются —
  // иначе открытая старая раздача выглядит частью новой фильтрации
  try { if (typeof closeReplayer === 'function') closeReplayer(); if (typeof unpin === 'function') unpin(); if (typeof unpinSzMx === 'function') unpinSzMx(); } catch (e) { /* окна ещё не созданы */ }
  const b = LASTBTN; LASTBTN = null;
  if (b && b.isConnected && b.parentElement) {
    const sib = [...b.parentElement.children].filter(x => x !== b && x.tagName === 'BUTTON' && (x.classList.contains('on') || x.classList.contains('active')));
    if (sib.length || b.classList.contains('tab')) { const c = b.classList.contains('tab') ? 'active' : 'on'; sib.forEach(x => x.classList.remove('on', 'active')); b.classList.add(c); }
  }
  if (RS_F) return;
  document.body.classList.add('rendering'); window.mdaBusy(true, 'Считаю статистику…');
  RS_F = requestAnimationFrame(() => setTimeout(() => { RS_F = 0; try { render(); } finally { document.body.classList.remove('rendering'); window.mdaBusy(false); } }, 0));
}
function render() {
  hideHandPop(); hideMxTip(); hideGroupTip(); hidePushTip(); unpinSzMx(); if (qdTip) qdTip.hidden = true;
  const rail = $('rail'); rail.replaceChildren();
  GROUPS.forEach(g => {
    const box = el('div', 'rgroup');
    box.append(el('div', 'rgroup-title', g.title));
    g.tabs.forEach(t => {
      const b = el('button', 'tab' + (t.id === state.tab ? ' active' : '') + (t.render ? ' ready' : ''));
      b.append(el('span', 'code', t.code), el('span', 'name', t.label), el('span', 'dot'));
      b.title = t.render ? t.label : t.label + ' — в работе';
      if (t.id === state.tab) b.setAttribute('aria-current', 'page');
      b.onclick = () => { if (t.id === 'aliases' && state.tab !== 'aliases') PREV_TAB = state.tab; if (t.id !== state.tab) delete SECF[t.id]; /* при входе в раздел фильтры раздела — по умолчанию: любой стек, все действия */ state.tab = t.id; renderNext(); $('content').scrollTop = 0; };
      box.append(b);
    });
    rail.append(box);
  });
  const subs = $('subtabs'); subs.replaceChildren();
  [['TOT', 'Все столы'], ['6max', '6-max'], ['9max', '7–9 max']].forEach(([id, label]) => {
    const b = el('button', state.sub === id ? 'on' : '', label);
    b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', state.sub === id);
    b.onclick = () => { state.sub = id; renderNext(); };
    subs.append(b);
  });
  const tab = TABS.find(t => t.id === state.tab);
  $('crumbGroup').textContent = tab.group;
  $('crumbTab').textContent = tab.label;
  drawSecFilters(tab.id);
  if (!DB) { $('selCount').textContent = '—'; CURRENT_IDX = []; $('content').replaceChildren(renderWelcome()); return; }
  const idx = currentIdx();
  const tool = tab.id === 'aliases'; // вкладка-инструмент: без столов и счётчика выборки
  subs.hidden = tool;
  $('selCount').textContent = tool ? '' : cnt(idx.length, 'рук') + ' в выборке';
  CURRENT_IDX = idx;
  LAST_NET_ITEMS = [];
  // Пересчёт под тем же разделом (фильтры, переключатели): карточки выше по странице могут поменять высоту, и экран
  // «уезжал». Запоминаем первую видимую карточку и её место, после перерисовки возвращаем её туда же.
  const cont = $('content'), sameTab = RENDER_TAB === tab.id; RENDER_TAB = tab.id;
  // якорь — первая карточка (или заголовок группы), которая начинается в видимой части; если такой нет — та, что под верхним краем
  const ANC = '.insight, .block, .sm, .sec';
  const cardsOf = () => [...cont.querySelectorAll(ANC)].filter(e => !e.querySelector(ANC) && e.offsetParent);
  const keyOf = (e) => { const t = e.matches('.sec') ? 'sec:' + (e.querySelector('h3') || e).textContent : (e.querySelector('.num-tag') || e.querySelector('h2, .k, b') || e).textContent; return e.className.split(' ')[0] + '|' + t.trim().slice(0, 80); };
  let anchor = null;
  if (sameTab && cont.scrollTop > 0) {
    const top = cont.getBoundingClientRect().top, list = cardsOf();
    const vis = list.find(e => e.getBoundingClientRect().top >= top - 1) || list.find(e => e.getBoundingClientRect().bottom > top);
    if (vis) { const k = keyOf(vis); anchor = { key: k, nth: list.filter(e => keyOf(e) === k).indexOf(vis), dy: vis.getBoundingClientRect().top - top }; }
  }
  cont.replaceChildren(tab.render ? tab.render(idx) : renderSoon(tab));
  markExempt(cont, tab.id);
  // Размер карточек как в «стандартном» виде раздела (при входе в раздел, фильтры по умолчанию): при фильтрах карточка
  // не становится ниже — пустое место остаётся внутри неё, соседние карточки не прыгают. Больше стандарта — растёт.
  {
    const list = cardsOf();
    if (!sameTab) { HSTD = {}; requestAnimationFrame(() => { cardsOf().forEach(e => { HSTD[keyOf(e)] = e.getBoundingClientRect().height; }); }); }
    else list.forEach(e => { const h = HSTD[keyOf(e)]; if (h) e.style.minHeight = h + 'px'; });
  }
  if (anchor) {
    const top = cont.getBoundingClientRect().top, same = cardsOf().filter(e => keyOf(e) === anchor.key)[anchor.nth];
    if (same) cont.scrollTop += (same.getBoundingClientRect().top - top) - anchor.dy;
  }
  if (LAST_NET_ITEMS.length) refreshPinned(LAST_NET_ITEMS); else unpin();
}

function monthLabel(i) {
  const [y, m] = DB.periodStart.split('-').map(Number);
  const k = (m - 1) + i;
  return MONTHS[k % 12] + ' ' + (y + Math.floor(k / 12));
}

function setupFilters() {
  const opt = (sel, items, cur) => { sel.replaceChildren(); items.forEach(([v, l]) => { const o = el('option', null, l); o.value = v; if (String(cur) === String(v)) o.selected = true; sel.append(o); }); };
  const months = DB.cols.month.reduce((a, b) => (b > a ? b : a), 0) + 1;
  opt($('fRoom'), [['', 'Alias — все румы']].concat(DB.rooms.map((r, i) => [i, r])), state.room ?? '');
  opt($('fType'), [['', 'Все']].concat(DB.types.map((r, i) => [i, r])), state.type ?? '');
  const ml = Array.from({ length: months }, (_, i) => [i, monthLabel(i)]);
  opt($('fFrom'), ml, state.from ?? 0);
  opt($('fTo'), ml, state.to ?? months - 1);
  $('fRoom').onchange = (e) => { const r = e.target.value === '' ? null : +e.target.value; choosePlayer(r == null ? 'alias' : 'hero', r); }; // смена рума — снова ваш ник этого рума
  $('fType').onchange = (e) => { state.type = e.target.value === '' ? null : +e.target.value; renderNext(); };
  $('fFrom').onchange = (e) => { state.from = +e.target.value; renderNext(); };
  $('fTo').onchange = (e) => { state.to = +e.target.value; renderNext(); };
  // бай-ины: реальные значения из базы (не реже 30 раздач), в долларах
  const cnt = {}; if (DB.cols.bi) DB.cols.bi.forEach(v => { if (v >= 0) cnt[v] = (cnt[v] || 0) + 1; });
  const bis = Object.keys(cnt).map(Number).filter(v => cnt[v] >= 30).sort((a, b) => a - b);
  const biLab = (v) => '$' + (v / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  $('fBiFrom').parentElement.hidden = !bis.length;
  opt($('fBiFrom'), [['', 'любой']].concat(bis.map(v => [v, biLab(v)])), state.biFrom ?? '');
  opt($('fBiTo'), [['', 'любой']].concat(bis.map(v => [v, biLab(v)])), state.biTo ?? '');
  $('fBiFrom').onchange = (e) => { state.biFrom = e.target.value === '' ? null : +e.target.value; if (state.biTo != null && state.biFrom != null && state.biTo < state.biFrom) { state.biTo = state.biFrom; $('fBiTo').value = String(state.biTo); } render(); };
  $('fBiTo').onchange = (e) => { state.biTo = e.target.value === '' ? null : +e.target.value; if (state.biTo != null && state.biFrom != null && state.biFrom > state.biTo) { state.biFrom = state.biTo; $('fBiFrom').value = String(state.biFrom); } render(); };
}

// Шапка игрока: алиас (все его ники), один ваш ник, рум в фильтре или соперник
const ROOM_CODES = { GGPoker: 'GG', Winamax: 'WNX', PokerStars: 'PS', PokerDom: 'PDOM', WPN: 'WPN', iPoker: 'IPK', '888poker': '888', PartyPoker: 'PP' };
const roomCode = (rn) => ROOM_CODES[rn] || String(rn || '?').slice(0, 4).toUpperCase();
let ROOM_COUNTS = []; // число раздач текущего выбора по румам

// ---------- алиасы ----------
// Алиас — один игрок под всеми его никами: ваши ники (раздачи с вашими картами; у ваших раздач колонка aid — номер алиаса,
// nk — номер ника) и игроки базы, добавленные в редакторе (их строки из «Других игроков»). Ваш ник можно убрать из алиаса —
// он остаётся под алиасом бледным и открывается отдельно. Раздачи не переносятся: статистика алиаса собирается из его ников.
let ALIASES = [], HERO_NICKS = [], ROW_NICK = null;
const MAX_ALIASES = 9; // больше алиасов в базе не создаётся (редактор и загрузка)
function aliasList(db) { return Array.isArray(db.aliases) ? db.aliases : [{ name: db.hero, nicks: db.nicks || {} }]; }
function setupAliases(db) {
  const list = aliasList(db);
  HERO_NICKS = db.heroNicks || [...new Set(list.flatMap(a => Object.keys(a.nicks || {})))];
  const ni = new Map(HERO_NICKS.map((n, i) => [n, i]));
  // mine — ваши ники из других алиасов (комбинации ваших ников: каждый с каждым, все вместе…)
  ALIASES = list.map((a, k) => ({ k, name: a.name, nicks: a.nicks || {}, off: new Set(Object.keys(a.off || {})), mine: (a.mine || []).map(m => ({ a: m.a, n: m.n })), opp: (a.opp || []).map(o => ({ n: o.n, r: o.r, pid: null, c: 0, sh: 0 })), gone: !!a.gone, own: 0, nickCnt: {}, roomNick: {} }));
  // ник строки: колонка nk; в базах без неё — по руму, если у алиаса в этом руме один ник
  for (const A of ALIASES) { const by = {}; for (const [n, r] of Object.entries(A.nicks)) (by[r] = by[r] || []).push(n); for (const r in by) if (by[r].length === 1) A.roomNick[r] = ni.get(by[r][0]); }
  const aid = db.cols.aid, nk = db.cols.nk, room = db.cols.room;
  ROW_NICK = new Int16Array(db.count);
  for (let i = 0; i < db.count; i++) {
    const A = ALIASES[aid ? aid[i] : 0];
    let v = nk && nk[i] >= 0 ? nk[i] : -1;
    if (v < 0 && A) { const rn = A.roomNick[db.rooms[room[i]]]; if (rn != null) v = rn; }
    ROW_NICK[i] = v;
    if (A) { const n = HERO_NICKS[v]; if (n != null) A.nickCnt[n] = (A.nickCnt[n] || 0) + 1; else A.unk = (A.unk || 0) + 1; if (n == null || !A.off.has(n)) A.own++; }
  }
  for (const A of ALIASES) { A.mine = A.mine.filter(m => ALIASES[m.a] && ALIASES[m.a].nicks[m.n] && m.a !== A.k); for (const m of A.mine) A.own += ALIASES[m.a].nickCnt[m.n] || 0; }
  if (!ALIASES[state.alias] || ALIASES[state.alias].gone) state.alias = Math.max(0, ALIASES.findIndex(A => !A.gone));
}
// участники алиасов из «Других игроков»: номер игрока и число раздач
async function resolveMembers() {
  const all = ALIASES.flatMap(A => A.opp);
  if (!all.length || !mda.playersFind) return;
  const r = await mda.playersFind(all.map(o => [o.n, o.r])) || [];
  all.forEach((o, i) => { const p = r[i]; o.pid = p ? p.pid : null; o.c = p ? p.count : 0; o.sh = p ? p.shown : 0; MEMB.set(o.r + '\u0001' + o.n, { pid: o.pid, c: o.c, sh: o.sh }); });
}
const MEMB = new Map(); // игрок базы (рум + ник) → номер и число раздач
const aliasCount = (A) => A.own + A.opp.reduce((s, o) => s + o.c, 0);
// сколько ников в алиасе (ваши без убранных + ваши из других алиасов + игроки базы)
const nickCount = (A) => Object.keys(A.nicks).filter(n => !A.off.has(n)).length + A.mine.length + A.opp.length;
function nicksLabel(k) { const m10 = k % 10, m100 = k % 100; return k + ' ' + (m10 === 1 && m100 !== 11 ? 'ник' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'ника' : 'ников'); }
const curAlias = () => (ALIASES[state.alias] && !ALIASES[state.alias].gone ? ALIASES[state.alias] : null);
const isSimple = (A) => !A || (!A.off.size && !A.opp.length && !A.mine.length); // только свои ники алиаса, ни один не убран
function aliasRooms(A) { const s = new Set(Object.keys(A.nicks).filter(n => !A.off.has(n) && A.nickCnt[n]).map(n => A.nicks[n])); A.mine.forEach(m => s.add(ALIASES[m.a].nicks[m.n])); A.opp.forEach(o => { if (o.c) s.add(o.r); }); return [...s]; }

// База алиаса или одного вашего ника: ваши строки + строки игроков-участников, те же колонки.
// Простой алиас — без копирования: общая база и отбор по aid в currentIdx.
const VIEW_CACHE = new Map();
async function buildView(key, heroPick, members, onProg) {
  if (VIEW_CACHE.has(key)) return VIEW_CACHE.get(key);
  const H = HERO_DB, hero = []; for (let i = 0; i < H.count; i++) if (heroPick(i)) hero.push(i);
  const segs = [], mcols = []; let n = hero.length;
  // доля полосы — по числу раздач участников (крупный игрок грузится дольше)
  const live = members.filter(o => o.pid != null && o.c), tot = live.reduce((a, o) => a + o.c, 0) || 1; let doneC = 0;
  for (const o of live) {
    let pdb = null; try { pdb = await loadPlayerDb(o.pid, onProg ? (f) => onProg((doneC + f * o.c) / tot) : null); } catch (e) { console.error('loadPlayerDb', e); } doneC += o.c; if (!pdb) continue;
    segs.push({ pid: o.pid, start: n, n: pdb.count, name: o.n }); mcols.push(pdb.cols); n += pdb.count;
  }
  const cols = {};
  for (const name of Object.keys(H.cols)) {
    if (name === 'aid' || name === 'nk') continue;
    const src = H.cols[name]; if (!src || src.length !== H.count || mcols.some(c => !c[name])) continue;
    const out = new src.constructor(n); let k = 0;
    for (const i of hero) out[k++] = src[i];
    for (const c of mcols) { out.set(c[name], k); k += c[name].length; }
    cols[name] = out;
  }
  const v = Object.assign({}, H, { count: n, cols, src: { hero: Int32Array.from(hero), segs } });
  VIEW_CACHE.set(key, v); if (VIEW_CACHE.size > 4) VIEW_CACHE.delete(VIEW_CACHE.keys().next().value);
  return v;
}
async function aliasDb(a, onProg) {
  const A = ALIASES[a]; if (isSimple(A)) return HERO_DB;
  const aid = HERO_DB.cols.aid, borrow = new Set(A.mine.map(m => m.a + '\u0001' + HERO_NICKS.indexOf(m.n)));
  return buildView('a' + a, (i) => { const ai = aid ? aid[i] : 0; return ai === a ? !(ROW_NICK[i] >= 0 && A.off.has(HERO_NICKS[ROW_NICK[i]])) : borrow.size > 0 && borrow.has(ai + '\u0001' + ROW_NICK[i]); }, A.opp, onProg);
}
function nickDb(a, nick) {
  const aid = HERO_DB.cols.aid, ni = HERO_NICKS.indexOf(nick);
  return buildView('n' + a + '\u0001' + nick, (i) => (aid ? aid[i] : 0) === a && ROW_NICK[i] === ni, []);
}
// записи реплеера для собранной базы: ваши строки — из вашей базы, строки участников — с места этого игрока
async function srcReplays(ids) {
  const S = DB.src, nh = S.hero.length, out = {}, hero = [], back = new Map(), bySeg = new Map();
  for (const i of ids) {
    if (i < nh) { back.set(S.hero[i], i); hero.push(S.hero[i]); continue; }
    const s = S.segs.find(g => i >= g.start && i < g.start + g.n); if (!s) continue;
    if (!bySeg.has(s)) bySeg.set(s, []); bySeg.get(s).push(i - s.start);
  }
  if (hero.length && mda.replaysFor) { const r = await mda.replaysFor(hero) || {}; for (const k in r) out[back.get(+k)] = r[k]; }
  for (const [s, loc] of bySeg) { const r = (mda.playerReplays && await mda.playerReplays(s.pid, loc)) || {}; for (const k in r) out[s.start + +k] = r[k]; }
  return out;
}
function roomCounts() {
  const c = DB.rooms.map(() => 0), room = DB.cols.room, aid = DB === HERO_DB && !state.player ? DB.cols.aid : null;
  for (let i = 0; i < DB.count; i++) { if (aid && aid[i] !== state.alias) continue; if (room[i] >= 0) c[room[i]]++; }
  ROOM_COUNTS = c;
}

const kFmt = (n) => (n >= 1000 ? Math.round(n / 1000) + 'k' : String(n));
// подпись героя в реплеере: «Вы», ваш ник, ник соперника или имя алиаса из чужих ников
function heroLabel() { const A = curAlias(); return state.player ? state.player.name : state.nickView ? state.nickView : A && !Object.keys(A.nicks).length && !A.mine.length ? A.name : 'Вы'; }
function heroNickOf(room) { const A = curAlias(), rn = DB.rooms[room]; if (!A) return rn; return Object.keys(A.nicks).find(n => A.nicks[n] === rn && !A.off.has(n)) || (A.opp.find(o => o.r === rn) || {}).n || A.name; }
function updatePlayer() {
  if (!DB) { $('roomBadge').textContent = 'НЕТ БАЗЫ'; $('nick').textContent = '—'; $('handsCount').textContent = ''; $('playerBtn').title = ''; $('playerBtn').disabled = true; return; }
  $('playerBtn').disabled = false;
  const A = curAlias(), opp = state.player, nv = !opp && state.nickView, alias = !opp && !nv && state.room == null;
  const NA = ALIASES[state.nickA];
  const roomName = opp ? DB.rooms[opp.room] : nv ? (NA ? NA.nicks[nv] : '') : alias ? null : DB.rooms[state.room];
  const nick = opp ? opp.name : nv || (alias ? (A ? A.name : 'Выберите игрока') : heroNickOf(state.room));
  const count = opp ? opp.count : nv ? DB.count : alias ? (A ? (DB === HERO_DB ? A.own : DB.count) : 0) : ROOM_COUNTS[state.room] || 0;
  $('roomBadge').textContent = alias ? 'ALIAS' : roomCode(roomName);
  $('roomBadge').classList.toggle('room', !alias && !opp);
  $('roomBadge').classList.toggle('opp', !!opp);
  $('playerBtn').classList.toggle('is-opp', !!opp);
  $('nick').textContent = nick;
  $('handsCount').textContent = cnt(count, 'раздач') + (opp ? ' · соперник · ' + roomName : nv ? ' · ' + roomName + (A && A.k === state.nickA && A.off.has(nv) ? ' · вне алиаса' : '') : alias && A ? ' · ' + nicksLabel(nickCount(A)) + (aliasRooms(A).length > 1 ? ' · все румы' : '') : alias ? '' : ' · ' + roomName);
  $('demoTag').hidden = !DB.demo;
  const inc = A ? Object.keys(A.nicks).filter(n => !A.off.has(n)).map(n => n + ' (' + A.nicks[n] + ')').concat(A.mine.map(m => m.n + ' (' + ALIASES[m.a].nicks[m.n] + ')'), A.opp.map(o => o.n + ' (' + o.r + ')')) : [];
  $('playerBtn').title = 'Выбрать игрока' + (alias && A ? '. Alias «' + A.name + '» объединяет: ' + inc.join(', ') : '');
}

// ---------- выбор игрока: алиасы, ваши ники и соперники из базы ----------
// Соперник — настоящий игрок из ваших раздач: у него своя «база» (его строки, по тем же колонкам),
// поэтому все вкладки, окна матрицы, списки раздач и реплеер считаются по его игре теми же функциями.
let HERO_DB = null; // ваша база; DB указывает на неё, на собранную базу алиаса/ника или на базу соперника
// загрузка раздач игрока по колонкам; onProg(доля 0…1) — для полосы в шапке
async function loadPlayerDb(pid, onProg) {
  const meta = await mda.playerMeta(pid); if (!meta) return null;
  const cols = {}; let k = 0;
  for (const [name, type] of meta.cols) { const b = await mda.playerCol(pid, name); if (b) cols[name] = typedCol(b, type); k++; if (onProg) onProg(k / meta.cols.length); }
  return Object.assign({}, meta, { cols });
}
let PICK_SEQ = 0;
// полоса загрузки под ником в шапке: подпись + процент; null — убрать
// полоса появляется только если загрузка идёт дольше 0,5 с — быстрые открытия проходят без мелькания
let LOAD_T0 = 0;
function loadProg(label, f, seq) {
  if (seq != null && seq !== PICK_SEQ) return;
  const bar = $('loadBar'); if (!bar) return;
  if (label == null) { bar.hidden = true; LOAD_T0 = 0; return; }
  if (!LOAD_T0) LOAD_T0 = Date.now();
  if (Date.now() - LOAD_T0 < 500) { $('handsCount').textContent = label + '…'; return; }
  bar.hidden = false; bar.firstChild.style.width = Math.round((f || 0) * 100) + '%';
  $('handsCount').textContent = label + '… ' + Math.round((f || 0) * 100) + '%';
}
// kind: 'alias' (v — номер алиаса), 'hero' (v — рум в фильтре внутри алиаса), 'nick' (v — ваш ник, a — алиас, где лежат его раздачи), 'opp' (v — игрок базы)
async function choosePlayer(kind, v, a) {
  const seq = ++PICK_SEQ;
  closePlayerMenu();
  if (kind === 'opp') {
    $('nick').textContent = v.name; $('roomBadge').textContent = roomCode((HERO_DB || DB).rooms[v.room]); $('roomBadge').classList.remove('room'); $('roomBadge').classList.add('opp');
    loadProg('загружаю раздачи', 0, seq);
    let odb = null; try { odb = await loadPlayerDb(v.pid, (f) => loadProg('загружаю раздачи', f, seq)); } catch (e) { console.error('loadPlayerDb', e); } // ошибка чтения не должна вешать шапку
    loadProg(null, null, seq);
    if (seq !== PICK_SEQ) return; // пока грузили, выбрали другого
    if (!odb) { updatePlayer(); return; }
    state.player = { pid: v.pid, name: v.name, room: v.room, count: v.count, shown: v.shown };
    state.nickView = null; state.room = v.room; DB = odb;
  } else {
    if (kind === 'alias' && v != null && ALIASES[v] && !ALIASES[v].gone) { if (state.alias !== v) OPEN_K = null; state.alias = v; }
    const A = curAlias();
    if (kind === 'nick' || !isSimple(A)) { $('nick').textContent = kind === 'nick' ? v : A.name; loadProg('собираю раздачи', 0, seq); }
    const na = kind === 'nick' ? (a != null ? a : state.nickA != null ? state.nickA : state.alias) : null;
    const ndb = !HERO_DB ? null : kind === 'nick' ? await nickDb(na, v) : await aliasDb(state.alias, (f) => loadProg('собираю раздачи', f, seq));
    loadProg(null, null, seq);
    if (seq !== PICK_SEQ) return;
    state.player = null; state.nickView = kind === 'nick' ? v : null; state.nickA = na;
    state.room = kind === 'hero' ? v : null;
    DB = ndb;
  }
  REPLAYS = null; unpin(); if (DB) roomCounts();
  $('fRoom').value = state.room == null ? '' : String(state.room); // ник выбран — рум выставляется сам
  updatePlayer(); render();
}
// после загрузки базы или правки алиасов: заново собрать текущий выбор
async function refreshAliasView() {
  VIEW_CACHE.clear(); await resolveMembers();
  if (state.player || !curAlias()) { updatePlayer(); render(); return; }
  await choosePlayer(state.nickView ? 'nick' : state.room != null ? 'hero' : 'alias', state.nickView || (state.room != null ? state.room : state.alias), state.nickA);
}

let PM_OPEN = false;
function openPlayerMenu() {
  if (!DB) return;
  const m = $('playerMenu'); m.replaceChildren(); PM_OPEN = true;
  $('playerBtn').setAttribute('aria-expanded', 'true');
  const item = (opts) => {
    const b = el('button', 'pm-item' + (opts.on ? ' on' : '') + (opts.sub2 ? ' pm-sub' : '') + (opts.off ? ' pm-off' : '')); b.type = 'button';
    if (opts.on) b.setAttribute('aria-current', 'true');
    const bd = el('span', 'badge-reg' + (opts.cls ? ' ' + opts.cls : ''), opts.badge);
    const t = el('span', 'pm-t'); t.append(el('b', null, opts.name), el('span', null, opts.sub));
    b.append(bd, t, el('span', 'pm-n', opts.count.toLocaleString('ru-RU')));
    b.onclick = opts.pick; return b;
  };
  const H = HERO_DB || DB;
  const code = (r) => roomCode(H.rooms[r]);
  // 1) алиасы базы, под выбранным — его ники: ваши (убранные — бледные) и игроки из базы
  const live = ALIASES.filter(A => !A.gone);
  const mine = el('div', 'pm-sec'); if (!live.length) mine.hidden = true; mine.append(el('div', 'pm-h', live.length > 1 ? 'Алиасы в базе' : 'Ваши ники'));
  // строка с кнопками справа (свернуть ники, крестик) — кнопки не вложены в кнопку строки
  const withBtns = (it, btns) => {
    if (!btns.length) return it;
    const w = el('div', 'pm-row'); it.classList.add(btns.length > 2 ? 'pm-has-x3' : btns.length > 1 ? 'pm-has-x2' : 'pm-has-x'); w.append(it);
    const box = el('span', 'pm-btns'); btns.forEach(b => box.append(b)); w.append(box); return w;
  };
  const sbtn = (txt, cls, title, fn) => { const b = el('button', 'pm-x' + (cls ? ' ' + cls : ''), txt); b.type = 'button'; b.title = title; b.setAttribute('aria-label', title); b.onclick = async (e) => { e.stopPropagation(); await fn(); }; return b; };
  live.forEach(A => {
    const rs = aliasRooms(A);
    const ai = item({ badge: 'ALIAS', name: A.name, sub: nicksLabel(nickCount(A)) + ' · ' + (rs.length > 1 ? 'все румы' : rs.length ? rs[0] : 'нет раздач'), count: aliasCount(A), on: !state.player && !state.nickView && state.alias === A.k && state.room == null, pick: () => choosePlayer('alias', A.k) });
    const has = Object.keys(A.nicks).length + A.mine.length + A.opp.length > 0;
    const open = has && aliasOpen(A);
    const btns = [];
    // стрелка — показать или скрыть ники алиаса
    if (has) { const t = sbtn(open ? '▾' : '▸', 'pm-tog', (open ? 'Скрыть' : 'Показать') + ' ники алиаса «' + A.name + '»', () => { setAliasOpen(A, !open); openPlayerMenu(); }); t.setAttribute('aria-expanded', open); btns.push(t); }
    // алиас без раздач ваших ников — распустить крестиком
    if (!Object.keys(A.nicks).length) btns.push(sbtn('×', '', 'Распустить алиас «' + A.name + '»', async () => { await dissolveAlias(A.k); openPlayerMenu(); }));
    mine.append(withBtns(ai, btns));
    if (!open) return;
    const sub2 = true;
    // у каждого ника — крестик: убрать из алиаса сразу (ваш ник остаётся бледным, игрок базы уходит в «Другие игроки»)
    Object.keys(A.nicks).sort((x, y) => (A.off.has(x) - A.off.has(y)) || (A.nickCnt[y] || 0) - (A.nickCnt[x] || 0)).forEach(n => {
      const off = A.off.has(n);
      const it = item({ badge: roomCode(A.nicks[n]), cls: 'room', name: n, sub: A.nicks[n] + (off ? ' · не в алиасе' : ''), count: A.nickCnt[n] || 0, off, sub2, on: !state.player && state.nickView === n && state.nickA === A.k, pick: () => choosePlayer('nick', n, A.k) });
      mine.append(withBtns(it, [off ? sbtn('↺', 'pm-back', 'Вернуть ' + n + ' в алиас', () => quickAliasEdit(list => { const o = list[A.k].off = Object.assign({}, list[A.k].off); delete o[n]; }))
        : sbtn('×', '', 'Убрать ' + n + ' из алиаса', () => quickAliasEdit(list => { list[A.k].off = Object.assign({}, list[A.k].off, { [n]: 1 }); }))]));
    });
    A.mine.forEach(m => {
      const H0 = ALIASES[m.a];
      const it = item({ badge: roomCode(H0.nicks[m.n]), cls: 'room', name: m.n, sub: H0.nicks[m.n] + ' · из «' + H0.name + '»', count: H0.nickCnt[m.n] || 0, sub2, on: !state.player && state.nickView === m.n && state.nickA === m.a, pick: () => choosePlayer('nick', m.n, m.a) });
      mine.append(withBtns(it, [sbtn('×', '', 'Убрать ' + m.n + ' из алиаса', () => quickAliasEdit(list => { list[A.k].mine = (list[A.k].mine || []).filter(x => !(x.a === m.a && x.n === m.n)); }))]));
    });
    A.opp.forEach(o => {
      const ri = H.rooms.indexOf(o.r);
      const it = item({ badge: roomCode(o.r), cls: 'opp', name: o.n, sub: o.r + ' · игрок базы', count: o.c, sub2, on: state.player && state.player.pid === o.pid, pick: () => { if (o.pid != null) choosePlayer('opp', { pid: o.pid, name: o.n, room: ri, count: o.c, shown: o.sh }); } });
      mine.append(withBtns(it, [sbtn('×', '', 'Убрать ' + o.n + ' из алиаса', () => quickAliasEdit(list => { list[A.k].opp = (list[A.k].opp || []).filter(x => !(x.n === o.n && x.r === o.r)); }))]));
    });
  });
  const ed = el('button', 'pm-edit', 'Редактор алиасов'); ed.type = 'button';
  ed.onclick = () => { closePlayerMenu(); if (state.tab !== 'aliases') PREV_TAB = state.tab; state.tab = 'aliases'; renderNext(); };
  mine.append(ed);
  // 2) другие игроки базы
  const oth = el('div', 'pm-sec pm-oth');
  const hh = el('div', 'pm-h', 'Другие игроки в базе');
  const q = el('input', 'pm-q'); q.type = 'search'; q.placeholder = 'Начало ника'; q.setAttribute('aria-label', 'Найти игрока по началу ника');
  const list = el('div', 'pm-list');
  const more = el('p', 'pm-more');
  let fillSeq = 0, fillT = null;
  const fill = async () => {
    const seq = ++fillSeq;
    const r = mda.playersList ? await mda.playersList(q.value, 100) : { total: 0, players: [] };
    if (seq !== fillSeq) return;
    list.replaceChildren();
    r.players.forEach(o => list.append(item({ badge: code(o.room), cls: 'opp', name: o.name, sub: H.rooms[o.room] + (o.shown ? ' · карты видны в ' + o.shown.toLocaleString('ru-RU') : ''), count: o.count, on: state.player && state.player.pid === o.pid, pick: () => choosePlayer('opp', o) })));
    if (!r.players.length) list.append(el('p', 'pm-empty', r.total === 0 && !q.value ? 'В базе нет соперников — загрузите истории заново, чтобы они появились.' : 'Никого не нашли'));
    more.textContent = r.total > r.players.length ? 'Показаны ' + r.players.length + ' из ' + r.total.toLocaleString('ru-RU') + ' — уточните поиск' : '';
    if (state.player) { const on = list.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' }); }
  };
  q.oninput = () => { clearTimeout(fillT); fillT = setTimeout(fill, 150); }; fill();
  oth.append(hh, q, list, more);
  m.append(mine, oth); m.hidden = false;
  const cur = m.querySelector('.pm-item.on') || m.querySelector('.pm-item'); if (cur) cur.focus();
}

// ---------- редактор алиасов (вкладка) ----------
// Правки копятся в черновике (DRAFT) и применяются кнопкой «ОК»: тогда пишутся в meta.json базы
// и выбранный алиас открывается во вкладках. Раздачи не трогаются — меняется только состав алиаса.
let EDIT_A = null, EDIT_BUSY = false, EDIT_NEW = false, EDIT_MSG = '', DRAFT = null;
let NEW_INPUT = null; // поле имени нового алиаса: «ОК» внизу тоже создаёт алиас из него
let PREV_TAB = 'rfi'; // вкладка, с которой открыли редактор: «ОК» возвращает на неё
function editAliasEdit(mut, quiet) {
  if (!HERO_DB) return;
  if (!DRAFT) DRAFT = aliasList(HERO_DB).map(a => JSON.parse(JSON.stringify(a)));
  if (!quiet) EDIT_MSG = '';
  const pick = mut(DRAFT);
  if (typeof pick === 'number') EDIT_A = pick;
  if (!quiet) render(); // имя алиаса пишется в черновик без перерисовки — иначе первый клик по «ОК» терялся
}
// алиасы черновика для показа: числа раздач — из уже посчитанных ников
function draftInfo() {
  if (!DRAFT) return ALIASES;
  const info = DRAFT.map((a, k) => {
    const base = ALIASES[k] || { nickCnt: {}, unk: 0 };
    return { k, name: a.name, nicks: a.nicks || {}, off: new Set(Object.keys(a.off || {})), mine: (a.mine || []).map(m => ({ a: m.a, n: m.n })),
      opp: (a.opp || []).map(o => Object.assign({ n: o.n, r: o.r, pid: null, c: 0, sh: 0 }, MEMB.get(o.r + '\u0001' + o.n))), gone: !!a.gone, nickCnt: base.nickCnt, unk: base.unk || 0, own: 0 };
  });
  for (const A of info) {
    A.mine = A.mine.filter(m => info[m.a] && !info[m.a].gone && info[m.a].nicks[m.n] && m.a !== A.k);
    A.own = (A.unk || 0) + Object.keys(A.nicks).filter(n => !A.off.has(n)).reduce((t, n) => t + (A.nickCnt[n] || 0), 0) + A.mine.reduce((t, m) => t + (info[m.a].nickCnt[m.n] || 0), 0);
  }
  return info;
}
// ники в списке игроков раскрыты только у одного алиаса: у открытого (или того, что раскрыли стрелкой).
// Раскрыли другой, выбрали или создали алиас — предыдущий сворачивается. OPEN_K: номер алиаса, -1 — все свёрнуты, null — открытый.
let OPEN_K = null;
function aliasOpen(A) { return OPEN_K == null ? A.k === state.alias : A.k === OPEN_K; }
function setAliasOpen(A, v) { OPEN_K = v ? A.k : -1; }
// правка из списка игроков (крестик у ника): применяется сразу, список остаётся открытым
async function quickAliasEdit(mut) {
  if (!HERO_DB || EDIT_BUSY || !mda.saveAliases) return;
  DRAFT = aliasList(HERO_DB).map(a => JSON.parse(JSON.stringify(a))); // несохранённые правки редактора не смешиваем
  mut(DRAFT);
  if (await saveDraftNow()) openPlayerMenu();
}
// крестик на алиасе: распустить сразу (вместе с уже сделанными правками), редактор остаётся открытым
async function dissolveAlias(k) {
  if (!HERO_DB || EDIT_BUSY || !mda.saveAliases) return;
  if (!DRAFT) DRAFT = aliasList(HERO_DB).map(a => JSON.parse(JSON.stringify(a)));
  if (!DRAFT[k]) return;
  Object.assign(DRAFT[k], { gone: 1, opp: [], mine: [] });
  for (const a of DRAFT) if (a.mine) a.mine = a.mine.filter(m => m.a !== k);
  if (EDIT_A === k) EDIT_A = null;
  await saveDraftNow();
}
// сохранить черновик сразу и остаться в редакторе (крестик, создание алиаса)
async function saveDraftNow() {
  EDIT_BUSY = true; render();
  const r = await mda.saveAliases(DRAFT);
  EDIT_BUSY = false;
  if (!r || r.error) { EDIT_MSG = 'Не сохранилось: ' + ((r && r.error) || 'нет связи с базой'); render(); return false; }
  DRAFT = null; HERO_DB.aliases = r.aliases; EDIT_MSG = '';
  setupAliases(HERO_DB); // если открытый алиас распущен — выбирается первый
  await refreshAliasView();
  return true;
}
// «ОК»: применить черновик, закрыть редактор (вернуться на прежнюю вкладку) и открыть алиас
async function applyAliasEdit() {
  if (!HERO_DB || EDIT_BUSY) return;
  // открыта форма нового алиаса и имя вписано — «ОК» создаёт его (даже пустым) и остаётся в редакторе
  const pend = EDIT_NEW && NEW_INPUT && NEW_INPUT.isConnected ? NEW_INPUT.value.trim() : '';
  if (pend) {
    if (draftInfo().some(A => !A.gone && A.name.toLowerCase() === pend.toLowerCase())) { EDIT_MSG = 'Алиас «' + pend + '» уже есть'; render(); return; }
    if (draftInfo().filter(A => !A.gone).length >= MAX_ALIASES) { EDIT_MSG = 'Больше ' + MAX_ALIASES + ' алиасов создать нельзя'; render(); return; }
    EDIT_NEW = false;
    if (!DRAFT) DRAFT = aliasList(HERO_DB).map(a => JSON.parse(JSON.stringify(a)));
    DRAFT.push({ name: pend, nicks: {}, off: {}, mine: [], opp: [] }); EDIT_A = DRAFT.length - 1; OPEN_K = EDIT_A;
    await saveDraftNow(); return;
  }
  EDIT_NEW = false;
  const target = EDIT_A;
  // имя алиаса: пустое — прежнее, занятое другим алиасом — не применяем
  if (DRAFT && DRAFT[target]) {
    const nm = String(DRAFT[target].name || '').trim(), old = (ALIASES[target] || {}).name || nm;
    if (!nm) DRAFT[target].name = old;
    else if (DRAFT.some((B, k) => k !== target && !B.gone && String(B.name).trim().toLowerCase() === nm.toLowerCase())) { EDIT_MSG = 'Алиас «' + nm + '» уже есть — выберите другое имя'; render(); return; }
    else DRAFT[target].name = nm;
  }
  if (DRAFT) {
    if (!mda.saveAliases) return;
    EDIT_BUSY = true; render();
    const r = await mda.saveAliases(DRAFT);
    EDIT_BUSY = false;
    if (!r || r.error) { EDIT_MSG = 'Не сохранилось: ' + ((r && r.error) || 'нет связи с базой'); render(); return; }
    DRAFT = null; HERO_DB.aliases = r.aliases;
    setupAliases(HERO_DB); VIEW_CACHE.clear(); await resolveMembers();
  }
  EDIT_NEW = false; EDIT_MSG = '';
  const A = ALIASES[target];
  if (!A || A.gone) { await refreshAliasView(); return; }
  // «ОК» всегда закрывает редактор и открывает алиас — и пустой: он появляется в шапке, ники можно добавить позже
  state.tab = PREV_TAB && PREV_TAB !== 'aliases' && TABS.some(t => t.id === PREV_TAB) ? PREV_TAB : 'rfi';
  $('content').scrollTop = 0;
  await choosePlayer('alias', target);
}
function renderAliasEditor() {
  const c = el('div', 'als');
  c.append(el('h1', null, 'Редактор алиасов'),
    el('p', 'als-lead', 'Алиас — один игрок под всеми его никами. Добавьте в алиас ники игроков из базы или уберите свои — вкладки алиаса пересчитаются по его никам. Раздачи при этом не удаляются и не переносятся.'));
  if (!HERO_DB) { c.append(el('p', 'muted', 'Сначала загрузите базу.')); return c; }
  const AL = draftInfo(); // черновик правок (до «ОК») или сохранённые алиасы
  const live = AL.filter(A => !A.gone);
  if (EDIT_A == null || !AL[EDIT_A] || AL[EDIT_A].gone) EDIT_A = curAlias() ? state.alias : live.length ? live[0].k : null;
  // алиасы базы
  const chips = el('div', 'als-chips'); chips.setAttribute('role', 'tablist');
  const chipNames = {}; // имя на плашке меняется сразу, пока вы печатаете новое имя
  live.forEach(A => {
    const b = el('button', 'als-chip' + (A.k === EDIT_A ? ' on' : '')); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', A.k === EDIT_A);
    const nm = el('b', null, A.name); chipNames[A.k] = nm;
    b.append(nm, el('span', null, nicksLabel(nickCount(A)) + ' · ' + aliasCount(A).toLocaleString('ru-RU')));
    b.onclick = () => { EDIT_A = A.k; EDIT_NEW = false; renderNext(); };
    const w = el('div', 'als-chipw'); w.append(b);
    // крестик — распустить алиас сразу: игроки базы возвращаются в «Другие игроки», ваши ники остаются в своих алиасах.
    // Алиас, где лежат раздачи ваших ников, распустить нельзя — у него крестика нет.
    if (!Object.keys(A.nicks).length) {
      const x = el('button', 'als-x', '×'); x.type = 'button'; x.title = 'Распустить алиас «' + A.name + '»'; x.setAttribute('aria-label', 'Распустить алиас ' + A.name);
      x.onclick = () => dissolveAlias(A.k);
      w.append(x);
    }
    chips.append(w);
  });
  if (EDIT_NEW) {
    const f = el('form', 'als-newform'); const ni = el('input'); NEW_INPUT = ni; ni.placeholder = 'Имя нового алиаса'; ni.maxLength = 40; ni.setAttribute('aria-label', 'Имя нового алиаса');
    const ok = el('button', 'btn small primary', 'ОК'); ok.type = 'submit';
    const no = el('button', 'btn small', 'Отмена'); no.type = 'button'; no.onclick = () => { EDIT_NEW = false; renderNext(); };
    f.onsubmit = (e) => { e.preventDefault(); const name = ni.value.trim(); if (!name) { ni.focus(); return; } if (AL.some(A => !A.gone && A.name.toLowerCase() === name.toLowerCase())) { EDIT_MSG = 'Алиас «' + name + '» уже есть'; render(); return; } EDIT_NEW = false;
      // новый алиас создаётся сразу (можно пустым) — ники добавите потом
      if (!DRAFT) DRAFT = aliasList(HERO_DB).map(a => JSON.parse(JSON.stringify(a)));
      DRAFT.push({ name, nicks: {}, off: {}, mine: [], opp: [] }); EDIT_A = DRAFT.length - 1; OPEN_K = EDIT_A;
      saveDraftNow(); };
    f.append(ni, ok, no); chips.append(f); setTimeout(() => ni.focus(), 0);
  } else {
    const full = live.length >= MAX_ALIASES;
    const nb = el('button', 'als-chip als-new', full ? 'Максимум ' + MAX_ALIASES + ' алиасов' : '+ Новый алиас'); nb.type = 'button'; nb.disabled = full;
    if (full) nb.title = 'Распустите ненужный алиас крестиком, чтобы создать новый';
    nb.onclick = () => { EDIT_NEW = true; renderNext(); }; chips.append(nb);
  }
  c.append(chips);
  if (EDIT_MSG) c.append(el('p', 'als-msg', EDIT_MSG));
  if (EDIT_A == null) { c.append(el('p', 'muted', 'В базе пока нет алиасов. Создайте алиас и добавьте в него игроков из базы.')); return c; }
  const A = AL[EDIT_A];
  const card = el('section', 'card als-card');
  const row = (rn, name, sub, n, btn, off) => {
    const r = el('div', 'als-row' + (off ? ' off' : ''));
    const t = el('span', 'als-t'); t.append(el('b', null, name), el('span', null, sub));
    r.append(el('span', 'badge-reg room', roomCode(rn)), t, el('span', 'als-n', n));
    if (btn) r.append(btn); return r;
  };
  const button = (label, cls, fn) => { const b = el('button', 'btn small' + (cls ? ' ' + cls : ''), label); b.type = 'button'; b.onclick = fn; b.disabled = EDIT_BUSY; return b; };
  // имя
  const nameRow = el('label', 'als-name'); const nin = el('input'); nin.value = A.name; nin.maxLength = 40;
  nin.oninput = () => { editAliasEdit(list => { list[A.k].name = nin.value; }, true); if (chipNames[A.k]) chipNames[A.k].textContent = nin.value.trim() || A.name; };
  nin.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); applyAliasEdit(); } };
  nameRow.append(el('span', null, 'Имя алиаса'), nin);
  const top = el('div', 'als-top'); top.append(nameRow);
  // «ОК» — применить изменения (всех алиасов), закрыть редактор и открыть этот алиас во вкладках
  const acts = el('div', 'als-acts');
  const ok = button(EDIT_BUSY ? 'Применяю…' : 'ОК', 'primary als-ok', () => applyAliasEdit());
  ok.title = DRAFT ? 'Применить изменения, закрыть редактор и открыть алиас' : 'Закрыть редактор и открыть алиас';
  acts.append(ok); top.append(acts);
  card.append(top);
  // ваши ники
  const own = Object.keys(A.nicks).sort((x, y) => (A.nickCnt[y] || 0) - (A.nickCnt[x] || 0));
  card.append(el('p', 'als-count', nicksLabel(nickCount(A)) + ' в алиасе · ' + aliasCount(A).toLocaleString('ru-RU') + ' раздач'));
  if (own.length) {
    const sec = el('div', 'als-sec');
    sec.append(el('h3', null, 'Ваши ники'), el('p', 'als-hint', 'Раздачи с вашими картами. Убранный ник остаётся здесь и под алиасом в списке игроков — бледным: его можно открыть отдельно и вернуть.'));
    own.forEach(n => {
      const off = A.off.has(n);
      sec.append(row(A.nicks[n], n, A.nicks[n] + (off ? ' · не в алиасе' : ''), (A.nickCnt[n] || 0).toLocaleString('ru-RU'),
        button(off ? 'Вернуть' : 'Убрать', off ? 'primary' : '', () => editAliasEdit(list => { const o = list[A.k].off = Object.assign({}, list[A.k].off); if (off) delete o[n]; else o[n] = 1; })), off));
    });
    card.append(sec);
  }
  // ваши ники из других алиасов: комбинации ваших ников
  const otherOwn = [];
  AL.forEach(B => { if (B.gone || B.k === A.k) return; Object.keys(B.nicks).forEach(n => { if (!A.mine.some(m => m.a === B.k && m.n === n)) otherOwn.push({ a: B.k, n }); }); });
  if (A.mine.length || otherOwn.length) {
    const sec = el('div', 'als-sec');
    sec.append(el('h3', null, own.length ? 'Ваши ники из других алиасов' : 'Ваши ники'), el('p', 'als-hint', 'Соберите любые сочетания своих ников: каждый с каждым или все вместе. Ник остаётся и в своём алиасе.'));
    A.mine.forEach(m => { const B = AL[m.a]; sec.append(row(B.nicks[m.n], m.n, B.nicks[m.n] + ' · из «' + B.name + '»', (B.nickCnt[m.n] || 0).toLocaleString('ru-RU'), button('Убрать', '', () => editAliasEdit(list => { list[A.k].mine = (list[A.k].mine || []).filter(x => !(x.a === m.a && x.n === m.n)); })))); });
    otherOwn.forEach(m => { const B = AL[m.a]; sec.append(row(B.nicks[m.n], m.n, B.nicks[m.n] + ' · в «' + B.name + '»', (B.nickCnt[m.n] || 0).toLocaleString('ru-RU'), button('Добавить', 'primary', () => editAliasEdit(list => { list[A.k].mine = (list[A.k].mine || []).concat([{ a: m.a, n: m.n }]); })), true)); });
    card.append(sec);
  }
  // игроки базы в алиасе
  const ms = el('div', 'als-sec');
  ms.append(el('h3', null, own.length || A.mine.length ? 'Игроки из базы в этом алиасе' : 'Ники алиаса'), el('p', 'als-hint', 'Их раздачи из «Других игроков» объединяются с алиасом. Убранный игрок возвращается в «Другие игроки».'));
  if (!A.opp.length) ms.append(el('p', 'als-empty', 'Пока никого — добавьте ниже.'));
  A.opp.forEach((o, j) => ms.append(row(o.r, o.n, o.r + (o.sh ? ' · карты видны в ' + o.sh.toLocaleString('ru-RU') : '') + (o.pid == null ? ' · нет в базе' : ''), o.c.toLocaleString('ru-RU'),
    button('Убрать', '', () => editAliasEdit(list => { list[A.k].opp = (list[A.k].opp || []).filter((x, k) => k !== j); })))));
  card.append(ms);
  // добавить из базы
  const add = el('div', 'als-sec');
  add.append(el('h3', null, 'Добавить игрока из базы'));
  const q = el('input', 'pm-q'); q.type = 'search'; q.placeholder = 'Начало ника'; q.setAttribute('aria-label', 'Найти игрока по началу ника');
  const res = el('div', 'als-res');
  let t = null, seq = 0;
  const fill = async () => {
    const s = ++seq; const r = mda.playersList ? await mda.playersList(q.value, 30) : { total: 0, players: [] }; if (s !== seq) return;
    res.replaceChildren();
    const inDraft = new Set(AL.flatMap(B => B.gone ? [] : B.opp.map(o => o.r + '\u0001' + o.n))); // уже добавлены в черновике
    r.players.forEach(p => { const rn = HERO_DB.rooms[p.room]; if (inDraft.has(rn + '\u0001' + p.name)) return; res.append(row(rn, p.name, rn + (p.shown ? ' · карты видны в ' + p.shown.toLocaleString('ru-RU') : ''), p.count.toLocaleString('ru-RU'), button('Добавить', 'primary', () => { MEMB.set(rn + '\u0001' + p.name, { pid: p.pid, c: p.count, sh: p.shown }); editAliasEdit(list => { list[A.k].opp = (list[A.k].opp || []).concat([{ n: p.name, r: rn }]); }); }))); });
    if (!r.players.length) res.append(el('p', 'als-empty', q.value ? 'Никого не нашли' : 'В базе нет других игроков'));
    else if (r.total > r.players.length) res.append(el('p', 'als-empty', 'Показаны ' + r.players.length + ' из ' + r.total.toLocaleString('ru-RU') + ' — уточните начало ника'));
  };
  q.oninput = () => { clearTimeout(t); t = setTimeout(fill, 150); }; fill();
  add.append(q, res); card.append(add);
  if (own.length) { const foot = el('div', 'als-foot'); foot.append(el('p', 'als-hint', 'Здесь лежат раздачи ваших ников — этот алиас можно переименовать и менять его состав, но не распустить.')); card.append(foot); }
  c.append(card);
  return c;
}
function closePlayerMenu(focusBtn) {
  if (!PM_OPEN) return; PM_OPEN = false;
  $('playerMenu').hidden = true; $('playerBtn').setAttribute('aria-expanded', 'false');
  if (focusBtn) $('playerBtn').focus();
}
// всплывающие окна при наведении (матрица рук, группа рук, ячейка матрицы, пуши, размер открытия) прячутся,
// если страницу прокрутили, не двигая мышь, больше чем на 60 px — иначе окно «едет» вместе с прокруткой до конца страницы.
// Закреплённые окна (клик) остаются.
function setupHoverScrollHide() {
  let base = null; // прокрутка в момент последнего движения мыши
  const pos = () => { const c = $('content'); return (c ? c.scrollTop : 0) + window.scrollY; };
  document.addEventListener('mousemove', () => { base = pos(); }, { passive: true });
  document.addEventListener('scroll', () => {
    if (base == null) base = pos();
    if (Math.abs(pos() - base) <= 60) return;
    hideHandPop(); hideMxTip(); hideGroupTip(); hidePushTip(); hideSzMx(); if (qdTip) qdTip.hidden = true;
    base = pos();
  }, { capture: true, passive: true });
}
function setupPlayerMenu() {
  $('playerBtn').onclick = () => (PM_OPEN ? closePlayerMenu() : openPlayerMenu());
  document.addEventListener('mousedown', (e) => { if (PM_OPEN && !e.target.closest('.player-wrap')) closePlayerMenu(); });
  document.addEventListener('keydown', (e) => {
    if (!PM_OPEN) return;
    if (e.key === 'Escape') { e.preventDefault(); closePlayerMenu(true); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const items = [...$('playerMenu').querySelectorAll('.pm-item')]; const k = items.indexOf(document.activeElement);
      e.preventDefault(); const nx = items[Math.max(0, Math.min(items.length - 1, k + (e.key === 'ArrowDown' ? 1 : -1)))]; if (nx) nx.focus();
    }
  });
}

// База из программы: описание и колонки по одной — каждая колонка становится типизированным массивом
// (c.net[i] читается как обычный массив). Так база в гигабайты не проходит через один огромный JSON.
const COL_TYPES = { i8: Int8Array, i16: Int16Array, i32: Int32Array, u32: Uint32Array, f64: Float64Array };
function typedCol(bytes, type) {
  const A = COL_TYPES[type]; let b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.byteOffset % A.BYTES_PER_ELEMENT) b = new Uint8Array(b); // выравнивание
  return new A(b.buffer, b.byteOffset, Math.floor(b.byteLength / A.BYTES_PER_ELEMENT));
}
// окно «Обновляю базу»: новая версия программы досчитывает данные из уже загруженных рук (без перезаливки)
let migBox = null, MIG_T = null;
// обновление базы не удалось — сказать об этом (база не тронута там, где обновление не дошло; при следующем запуске — повтор)
function migError(msg) {
  const bg = el('div', 'modal-bg mig-bg'), box = el('div', 'modal mig');
  box.append(el('h2', null, 'Обновление базы не завершилось'), el('p', 'muted', 'Программа попробует ещё раз при следующем запуске. Если ошибка повторится — пришлите этот текст разработчику.'), el('pre', 'mig-err', String(msg).slice(0, 600)));
  const ok = el('button', 'btn-load', 'Понятно'); ok.type = 'button'; ok.onclick = () => bg.remove(); box.append(ok);
  bg.append(box); document.body.append(bg); ok.focus();
}
function onMigrate(m) {
  if (m.end) { if (migBox) { migBox.remove(); migBox = null; } MIG_T = null; if (m.error) migError(m.error); return; }
  if (!migBox) {
    migBox = el('div', 'modal-bg mig-bg'); const box = el('div', 'modal mig');
    box.append(el('h2', null, 'Обновляю базу до новой версии'), el('p', 'muted', 'Новая версия программы хранит базу компактнее и считает больше статистики. Всё делается из уже загруженных раздач — перезаливать руки не нужно. Это происходит один раз.'),
      (() => { const t = el('div', 'prog-track'); t.append(el('div', 'prog-fill')); return t; })(), el('p', 'small muted mig-t', 'Подготовка…'));
    migBox.append(box); document.body.append(migBox);
  }
  const pct = m.total ? Math.min(100, Math.round(m.done / m.total * 100)) : 0;
  migBox.querySelector('.prog-fill').style.width = pct + '%';
  // этап и оценка оставшегося времени по скорости этого этапа
  const now = Date.now();
  if (!MIG_T || MIG_T.id !== m.id) MIG_T = { id: m.id, t0: now, d0: m.done };
  const el2 = (now - MIG_T.t0) / 1000, rate = el2 > 1.5 ? (m.done - MIG_T.d0) / el2 : 0;
  const left = rate > 0 && m.total ? (m.total - m.done) / rate : null;
  const stage = { rpbin: 'Перевожу записи раздач в компактный вид', colz: 'Сжимаю колонки статистики', names: 'Добавляю ники игроков в записи раздач', dedup: 'Ищу повторы раздач', dedupw: 'Убираю повторы раздач', fcb: 'Досчитываю фолд на контбет', ant: 'Досчитываю анте', cbs: 'Досчитываю размеры контбетов' }[m.id] || 'Обновляю';
  migBox.querySelector('.mig-t').textContent = m.total ? stage + ': ' + m.done.toLocaleString('ru-RU') + ' из ' + m.total.toLocaleString('ru-RU') + ' (' + pct + '%)' + (left != null ? ' · осталось ' + fmtDur(left) : '') : 'Подготовка…';
}
// EV последней загрузки досчитывается в фоне: значок в панели; по окончании — свежая колонка nev
function onEvBg(m) {
  const b = $('evBg'); if (!b) return;
  if (m.end) {
    b.hidden = true;
    if (!m.stopped && !m.error && HERO_DB && mda.dbCol) mda.dbCol('nev').then(bytes => {
      if (!bytes || !HERO_DB) return;
      HERO_DB.cols.nev = typedCol(bytes, 'f64'); VIEW_CACHE.clear();
      if (state.player) choosePlayer('opp', state.player); else { if (DB !== HERO_DB && curAlias() && !isSimple(curAlias())) choosePlayer('alias', state.alias); else render(); }
    });
    return;
  }
  b.hidden = false;
  b.textContent = 'EV считается в фоне' + (m.total ? ': ' + Math.round(m.done / m.total * 100) + '%' : '…');
}
async function loadDb() {
  if (!mda.dbMeta) return null;
  if (mda.onMigrate) mda.onMigrate(onMigrate);
  if (mda.onEvBg) mda.onEvBg(onEvBg);
  const meta = await mda.dbMeta(); if (!meta) return null;
  const cols = {};
  for (const [name, type] of meta.cols) { const b = await mda.dbCol(name); if (b) cols[name] = typedCol(b, type); }
  return Object.assign({}, meta, { cols });
}

function setDb(db, keepAlias) {
  if (!keepAlias) state.alias = 0;
  DB = db;
  if (typeof REPLAYS !== 'undefined') REPLAYS = null; // реплеи новой базы загрузятся заново
  unpin();
  document.querySelector('.filters').hidden = !db;
  HERO_DB = db;
  if (!db) { $('demoTag').hidden = true; state.player = null; closePlayerMenu(); updatePlayer(); render(); return; }
  setupAliases(db); VIEW_CACHE.clear(); EDIT_A = null; DRAFT = null;
  Object.assign(state, { room: null, player: null, nickView: null, nickA: null, type: null, from: null, to: null, biFrom: null, biTo: null });
  closePlayerMenu();
  setupFilters();
  roomCounts();
  updatePlayer();
  render();
  // участники алиасов из «Других игроков» и собранная база алиаса (если он не только из своих ников)
  if (ALIASES.some(A => A.opp.length || A.mine.length || A.off.size)) refreshAliasView();
  // в базе нет ваших раздач (только датамайнинг) — сразу открыть самого частого игрока
  if (!ALIASES.length && mda.playersList) mda.playersList('', 1).then(r => { if (DB === db && r && r.players && r.players[0]) choosePlayer('opp', r.players[0]); });
}

// ---------- загрузка базы ----------
const fmtBytes = (b) => b > 1e9 ? (b / 1e9).toFixed(1) + ' ГБ' : b > 1e6 ? (b / 1e6).toFixed(1) + ' МБ' : Math.round(b / 1e3) + ' КБ';
const IMPORT_ROOMS = ['GGPoker', 'PokerStars', 'Winamax', 'WPN', 'PokerDom', 'iPoker', '888poker', 'PartyPoker', 'Другой'];
let IMPORT_SCAN = null;

// стартовый экран, пока базы нет
function renderWelcome() {
  const w = el('div', 'welcome');
  const ic = el('div', 'welcome-ic'); ic.innerHTML = '<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 11v5M9.5 13.5 12 11l2.5 2.5"/></svg>';
  const b1 = el('button', 'btn-load', 'Загрузить базу'); b1.type = 'button'; b1.onclick = () => openImportModal();
  const b2 = el('button', 'btn', 'Посмотреть на демо-данных'); b2.type = 'button'; b2.onclick = async () => { // демо-база открывается в программе как обычная (вкладки, соперники, реплеер)
    const ok = await mda.demoDb();
    if (!ok) { b2.textContent = 'Демо-данные не найдены в этой сборке'; b2.disabled = true; return; }
    state.alias = 0; setDb(await loadDb());
  };
  const btns = el('div', 'welcome-btns'); btns.append(b1, b2);
  w.append(ic, el('h1', null, 'Загрузите свою базу раздач'),
    el('p', null, 'Укажите папку или zip-архив с историями турнирных раздач. Программа найдёт ваши ники, разберёт раздачи и построит все вкладки по вашей игре.'),
    btns,
    el('p', 'muted small', 'Поддерживаются истории в формате PokerStars (в том числе экспорт GGPoker и PokerDom), Winamax и ACR / WPN. База хранится только на этом компьютере и никуда не отправляется.'));
  return w;
}

let PERF_READY = false;
function showImport(r) {
  if (!PERF_READY) { PERF_READY = true; setupPerf(); }
  if (!r || r.canceled) return;
  IMPORT_SCAN = r;
  $('impResult').hidden = false; $('impProgress').hidden = true;
  $('impSummary').textContent = 'Найдено ' + r.files.toLocaleString('ru-RU') + ' файлов, ' + fmtBytes(r.bytes) + '. Источник: ' + r.source;
  const body = $('impRooms'); body.replaceChildren();
  Object.keys(r.rooms).forEach(room => {
    const z = r.rooms[room], tr = el('tr');
    tr.append(el('td', null, room), el('td', null, z.files.toLocaleString('ru-RU')), el('td', null, fmtBytes(z.bytes)));
    tr.append(el('td', z.supported === false ? 'wait' : 'ok', z.supported === false ? 'формат пока не поддерживается' : 'будет загружено'));
    body.append(tr);
  });
  if (r.unknown) { const tr = el('tr'); tr.append(el('td', 'bad', 'Не распознано'), el('td', null, String(r.unknown)), el('td', null, '—'), el('td', 'muted', 'не похоже на историю раздач')); body.append(tr); }
  const nicks = r.nicks || [];
  $('impNicks').hidden = !nicks.length;
  const supported = Object.values(r.rooms || {}).some(z => z.supported !== false);
  IMPORT_SCAN.ok = !!r.nicks && supported;
  $('impNote').hidden = !!nicks.length;
  $('impNote').textContent = nicks.length ? '' : !r.nicks ? 'В онлайн-превью загрузка не работает — только в установленной программе.'
    : !supported ? 'В файлах нет поддерживаемых историй раздач.'
    : 'Ваших ников в этих историях нет (вам не раздавали карты) — похоже на датамайнинг. Раздачи загрузятся в список соперников («Другие игроки»), алиас не создаётся.';
  const list = $('nickList'); list.replaceChildren();
  nicks.forEach((n, k) => {
    const row = el('label', 'nick-row');
    const cb = el('input'); cb.type = 'checkbox'; cb.checked = true; cb.dataset.nick = n.nick;
    row.dataset.room = n.room; // рум определён по файлам — просто подпись, без выбора
    const sel = el('span', 'nick-room', n.room);
    const own = aliasOfNick(n.nick);
    row.append(cb, el('b', null, n.nick), sel, el('span', 'muted small', n.hits.toLocaleString('ru-RU') + ' файлов' + (own ? ' · уже в алиасе «' + own.name + '»' : '')));
    cb.onchange = () => { syncImportBtn(); runEstimate(); syncAliasHint(); };
    list.append(row);
  });
  // имя алиаса подставляется заново для каждого архива: если ники уже знакомы — их алиас, иначе первый ник
  // (раньше поле хранило прошлое имя, и архив друга сливался с вашим алиасом)
  const known = nicks.map(n => aliasOfNick(n.nick)).find(Boolean);
  $('aliasName').value = known ? known.name : (nicks[0] ? nicks[0].nick : '');
  const dl = $('aliasList'); dl.replaceChildren(); ALIASES.forEach(a => { if (a.gone) return; const o = el('option'); o.value = a.name; dl.append(o); });
  $('aliasName').oninput = syncAliasHint;
  syncImportBtn(); syncAliasHint();
  $('impPlan').hidden = !IMPORT_SCAN.ok;
  if (IMPORT_SCAN.ok) { setupImportMode(); showBaseLocation(); runEstimate(); }
}
// ник уже есть в одном из алиасов текущей базы (только при дозагрузке — при замене база собирается заново)
function aliasOfNick(nick) { return HERO_DB && !HERO_DB.demo && HERO_DB.format === 'mdalab-cols-v3' ? ALIASES.find(a => !a.gone && a.nicks[nick]) : null; }
function syncAliasHint() {
  const h = $('aliasHint'); if (!h) return;
  IMPORT_ALIAS_FULL = false; syncImportBtn();
  const lab = document.querySelector('.alias-in');
  const checked = [...document.querySelectorAll('#nickList input:checked')].map(x => x.dataset.nick);
  const app = importMode() === 'append' && ALIASES.length && HERO_DB;
  if (!checked.length) { lab.hidden = true; h.textContent = $('impNicks').hidden ? '' : 'Ники не отмечены — раздачи загрузятся только как база соперников, без алиаса.'; return; }
  const fresh = app ? checked.filter(n => !aliasOfNick(n)) : checked;
  // все ники уже знакомы — алиас не спрашиваем: раздачи просто допишутся в него
  const owners = app ? [...new Set(checked.map(n => aliasOfNick(n)).filter(Boolean))] : [];
  if (!fresh.length) { lab.hidden = true; $('aliasName').value = owners[0].name; h.textContent = 'Раздачи допишутся в алиас ' + owners.map(a => '«' + a.name + '»').join(', ') + '.'; return; }
  lab.hidden = false;
  if (!app) { h.textContent = ''; return; }
  const name = $('aliasName').value.trim();
  const same = ALIASES.find(a => !a.gone && name && a.name.toLowerCase() === name.toLowerCase());
  const full = !same && ALIASES.filter(a => !a.gone).length >= MAX_ALIASES;
  IMPORT_ALIAS_FULL = full;
  if (full) { h.textContent = 'В базе уже ' + MAX_ALIASES + ' алиасов — впишите имя существующего алиаса или распустите ненужный в редакторе алиасов.'; syncImportBtn(); return; }
  syncImportBtn();
  h.textContent = same ? 'Новые ники (' + fresh.join(', ') + ') добавятся к алиасу «' + same.name + '».'
    : 'Новые ники — будет новый алиас «' + (name || fresh[0]) + '». Его раздачи хранятся отдельно и не смешиваются с ' + ALIASES.filter(a => !a.gone).map(a => '«' + a.name + '»').join(', ') + '. Переключаться — в списке игроков в шапке.';
}
// без отмеченных ников — загрузка как датамайнинг: только соперники, без алиаса
let IMPORT_ALIAS_FULL = false; // новые ники, а алиасов уже 9 — загрузка ждёт имя существующего алиаса
function syncImportBtn() { $('doImport').disabled = !(IMPORT_SCAN && IMPORT_SCAN.ok) || IMPORT_ALIAS_FULL; }

// ---------- режим: дописать к базе или заменить ----------
let DBINFO = null;
const importMode = () => (DBINFO && DBINFO.stored && DBINFO.canAppend && (document.querySelector('input[name=impMode]:checked') || {}).value === 'append') ? 'append' : 'replace';
async function setupImportMode() {
  DBINFO = mda.dbInfo ? await mda.dbInfo() : null;
  const box = $('impMode'), has = !!(DBINFO && DBINFO.stored);
  box.hidden = !has;
  if (!has) return;
  const ap = box.querySelector('input[value=append]');
  ap.disabled = !DBINFO.canAppend;
  if (!DBINFO.canAppend) { box.querySelector('input[value=replace]').checked = true; $('impModeAppendSub').textContent = 'текущая база старого формата — чтобы дописывать в неё и видеть соперников, её нужно один раз собрать заново'; }
  else { // каждый раз по умолчанию — дописать: замена стирает базу, её выбирают сознательно
    ap.checked = true;
    $('impModeAppendSub').textContent = 'сейчас в базе ' + cnt(DBINFO.count, 'раздач') + ' — новые допишутся, повторы пропустятся';
  }
  box.querySelectorAll('input').forEach(i => { i.onchange = () => { syncModeUi(); }; });
  syncModeUi();
}
function syncModeUi() {
  const app = importMode() === 'append';
  $('pickBaseDir').hidden = app; // дописываем туда, где база уже лежит
  renderEstimate(); syncAliasHint();
}

// ---------- место для базы и оценка до загрузки ----------
const fmtDur = (s) => s < 60 ? 'меньше минуты' : s < 3600 ? '≈ ' + Math.round(s / 60) + ' мин' : '≈ ' + Math.floor(s / 3600) + ' ч ' + Math.round(s % 3600 / 60) + ' мин';
let EST = null, LOC = null, estTimer = null, estSeq = 0;
async function showBaseLocation(loc) {
  LOC = loc || (mda.baseLocation ? await mda.baseLocation() : null);
  $('baseDirPath').textContent = LOC ? LOC.dir : '—'; $('baseDirPath').title = LOC ? LOC.dir : '';
  renderEstimate();
}
function renderEstimate() {
  const free = LOC && LOC.free != null ? LOC.free : null;
  $('estFree').textContent = free == null ? '—' : fmtBytes(free);
  if (!EST) return;
  const app = importMode() === 'append';
  const minedEst = !document.querySelector('#nickList input:checked');
  $('estHands').textContent = (app ? '+ ' : '≈ ') + (minedEst ? (EST.mined || 0).toLocaleString('ru-RU') + ' без героя' : EST.hands.toLocaleString('ru-RU'));
  $('estSize').textContent = (app ? '+ ' : '≈ ') + fmtBytes(EST.bytes);
  $('estTime').textContent = fmtDur(EST.seconds);
  $('estTime').title = EST.evSeconds ? 'Потом EV олл-инов досчитается в фоне ≈ ' + fmtDur(EST.evSeconds) + ' — раздачами можно пользоваться сразу' : '';
  const need = EST.bytes * 1.3 + 64 * 1024 * 1024; // запас на временные файлы при сборке
  const short = free != null && free < need;
  $('estFree').classList.toggle('bad', short); $('estSize').classList.toggle('bad', short);
  $('estNote').classList.toggle('bad', short);
  $('estNote').textContent = short
    ? 'Не хватит места: на время загрузки нужно около ' + fmtBytes(need) + '. Выберите другую папку или диск.'
    : 'Оценка по образцу ' + fmtBytes(EST.sampleBytes) + ' из ' + fmtBytes(EST.totalBytes) + ' ваших историй на этом компьютере (' + EST.cpus + ' ядер: разбор — в ' + EST.threads + ' потоков, EV — в ' + (EST.evThreads || EST.threads) + ')' + (EST.opp ? '; вместе с вашими раздачами сохранятся ≈ ' + EST.opp.toLocaleString('ru-RU') + ' строк соперников' : '') + '.' + (EST.evSeconds > 5 ? ' После загрузки EV олл-инов досчитается в фоне (' + fmtDur(EST.evSeconds) + '), раздачами можно пользоваться сразу.' : '') + (app ? ' Повторы уже лежащих в базе раздач отсеются — добавится не больше.' : ' Точные цифры — после загрузки.');
  $('doImport').disabled = short || !(IMPORT_SCAN && IMPORT_SCAN.ok);
}
// «Скорость загрузки»: Авто / Экономно / Максимум — хранится в настройках программы
const PERF_HINT = { auto: 'по ядрам и свободной памяти этого компьютера', eco: 'половина ядер — удобно работать за компьютером параллельно', max: 'все ядра под загрузку' };
async function setupPerf() {
  const seg = $('perfSeg'); if (!seg || !mda.getPerf) { if (seg) seg.parentNode.hidden = true; return; }
  const show = (m) => { seg.querySelectorAll('button').forEach(b => { const on = b.dataset.perf === m; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); $('perfHint').textContent = PERF_HINT[m] || ''; };
  show(await mda.getPerf());
  seg.querySelectorAll('button').forEach(b => { b.onclick = async () => { show(await mda.setPerf(b.dataset.perf)); runEstimate(); }; });
}
function runEstimate() {
  clearTimeout(estTimer);
  estTimer = setTimeout(async () => {
    if (!mda.estimate) return;
    const seq = ++estSeq; EST = null;
    ['estHands', 'estSize', 'estTime'].forEach(id => { $(id).textContent = '…'; });
    $('estNote').classList.remove('bad'); $('estNote').textContent = 'Оцениваю по образцу ваших историй…';
    const nicks = [...document.querySelectorAll('#nickList input:checked')].map(x => x.dataset.nick);
    const r = await mda.estimate(nicks);
    if (seq !== estSeq) return;
    EST = r; if (!r) { $('estNote').textContent = 'Оценить не удалось — загрузка всё равно сработает.'; return; }
    renderEstimate();
  }, 400);
}

async function runImport() {
  const nicks = {};
  document.querySelectorAll('#nickList .nick-row').forEach(r => { const cb = r.querySelector('input'); if (cb.checked) nicks[cb.dataset.nick] = r.dataset.room; });
  const mined = !Object.keys(nicks).length; // датамайнинг: только соперники
  const alias = mined ? '' : $('aliasName').value.trim() || Object.keys(nicks)[0];
  $('doImport').disabled = true; $('impProgress').hidden = false;
  $('progFill').style.width = '0%'; $('progText').textContent = 'Начинаю разбор…';
  const t0 = Date.now();
  mda.onProgress((m) => {
    // этапы: разбор файлов (до 70% полосы) и расчёт EV по олл-инам (оставшиеся 30%)
    // EV теперь считается в фоне после загрузки: полоса — разбор (до 88%) и раскладка по базе; этап ev — только если досчитывается EV прошлой загрузки
    const f = m.stage === 'ev' ? 0.95 * m.done / Math.max(1, m.total) : m.stage === 'merge' ? 0.88 + 0.12 * m.done / Math.max(1, m.total) : 0.88 * m.done / Math.max(1, m.total);
    $('progFill').style.width = (f * 100).toFixed(1) + '%';
    const el2 = (Date.now() - t0) / 1000, left = f > 0.03 ? el2 / f - el2 : null;
    $('progText').textContent = (m.groups > 1 && m.stage !== 'parse' ? 'Часть ' + m.group + ' из ' + m.groups + ' · ' : '') + (m.stage === 'ev'
      ? 'Досчитываю EV прошлой загрузки: ' + m.done.toLocaleString('ru-RU') + ' из ' + m.total.toLocaleString('ru-RU')
      : m.stage === 'merge' ? 'Раскладываю раздачи по базе'
      : 'Разобрано файлов: ' + m.done.toLocaleString('ru-RU') + ' из ' + m.total.toLocaleString('ru-RU') + ' · раздач: ' + m.hands.toLocaleString('ru-RU')) + (left != null ? ' · осталось ' + fmtDur(left) : ''); // на разборе — все раздачи (ваши и датамайнинг)
  });
  const mode = importMode();
  const res = await mda.runImport({ nicks, alias, mode });
  if (res.type === 'error' || res.error) { $('progText').textContent = 'Ошибка: ' + (res.message || res.error); syncImportBtn(); return; }
  if (!res.hands && !res.mined && !res.opp) { $('progText').textContent = mined ? 'Раздач не нашлось.' : 'Раздач с выбранными никами не нашлось. Проверьте ники.'; syncImportBtn(); return; }
  $('progFill').style.width = '100%';
  $('progText').textContent = mined
    ? 'Загружено раздач без героя: ' + (res.mined || 0).toLocaleString('ru-RU') + (res.dup ? ', уже были в базе: ' + res.dup.toLocaleString('ru-RU') : '') + '. Игроков в базе: ' + (res.players || 0).toLocaleString('ru-RU') + '.'
    : mode === 'append'
    ? (res.added ? 'Добавлено ' + cnt(res.added, 'раздач') : 'Новых раздач нет') + (res.dup ? ', повторов пропущено: ' + res.dup.toLocaleString('ru-RU') : '') + (res.refilled ? '; у ' + res.refilled.toLocaleString('ru-RU') + ' уже загруженных раздач дописаны время, турнир и реплеер' : '') + (res.bounty ? '; у ' + res.bounty.toLocaleString('ru-RU') + ' уже загруженных раздач дописаны баунти' : '') + '. Всего в базе: ' + cnt(res.hands, 'раздач') + ', соперников: ' + (res.players || 0).toLocaleString('ru-RU') + '.'
    : 'Готово: ' + cnt(res.hands, 'раздач') + (res.players ? ', соперников: ' + res.players.toLocaleString('ru-RU') : '') + (res.dup ? ', повторов пропущено: ' + res.dup.toLocaleString('ru-RU') : '') + (res.refilled ? '; у ' + res.refilled.toLocaleString('ru-RU') + ' уже загруженных раздач дописаны время, турнир и реплеер' : '') + (res.bounty ? '; у ' + res.bounty.toLocaleString('ru-RU') + ' уже загруженных раздач дописаны баунти' : '') + '.';
  const ndb = await loadDb();
  if (ndb) { // открыть алиас, в который только что загрузили
    const list = ndb.aliases || [];
    const k = mined ? -1 : list.findIndex(a => a.name.toLowerCase() === alias.toLowerCase());
    if (k >= 0) state.alias = k; else if (!list[state.alias]) state.alias = 0;
  }
  setDb(ndb, true);
  setTimeout(closeImportModal, 900);
}

let openImportModal = () => {}, closeImportModal = () => {};
function setupImport() {
  const modal = $('importModal');
  openImportModal = async () => {
    modal.hidden = false; $('pickFolder').focus();
    const info = mda.dbInfo ? await mda.dbInfo() : { stored: false };
    const del = $('deleteDb'); del.hidden = !info.stored; del.textContent = 'Удалить базу с компьютера'; del.dataset.armed = '';
  };
  closeImportModal = () => { modal.hidden = true; $('openImport').focus(); };
  $('openImport').onclick = openImportModal;
  $('closeImport').onclick = closeImportModal;
  $('pickBaseDir').onclick = async () => { if (!mda.pickBaseDir) return; const loc = await mda.pickBaseDir(); if (loc) showBaseLocation(loc); };
  modal.addEventListener('click', (e) => { if (e.target === modal) closeImportModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeImportModal(); });
  $('pickFolder').onclick = async () => showImport(await mda.pick('folder'));
  $('pickFiles').onclick = async () => showImport(await mda.pick('files'));
  $('doImport').onclick = runImport;
  $('deleteDb').onclick = async () => {
    const b = $('deleteDb');
    if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Точно удалить? Нажмите ещё раз'; return; }
    await mda.deleteDb(); b.hidden = true; setDb(await loadDb()); closeImportModal();
  };
  const drop = $('drop');
  // перетаскивание: в окно загрузки или в любое место программы (окно загрузки откроется само)
  const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
  let dragDepth = 0;
  document.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; drop.classList.add('over'); });
  document.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; if (--dragDepth <= 0) { dragDepth = 0; drop.classList.remove('over'); } });
  document.addEventListener('dragover', (e) => { e.preventDefault(); if (hasFiles(e)) e.dataTransfer.dropEffect = 'copy'; });
  document.addEventListener('drop', async (e) => {
    e.preventDefault(); dragDepth = 0; drop.classList.remove('over');
    const files = [...((e.dataTransfer && e.dataTransfer.files) || [])];
    if (!files.length) return;
    if (!mda.pathOf || !mda.droppedPaths) { openImportModal(); $('impNote').hidden = false; $('impNote').textContent = 'В онлайн-превью загрузка не работает — только в установленной программе.'; return; }
    const paths = files.map(f => mda.pathOf(f)).filter(Boolean);
    if ($('importModal').hidden) openImportModal();
    if (!paths.length) { $('impNote').hidden = false; $('impNote').textContent = 'Не удалось прочитать перетащенные объекты — выберите их кнопкой ниже.'; return; }
    showImport(await mda.droppedPaths(paths));
  });
}

// хук для автоматических снимков экрана при сборке
window.__go = (tab, sub) => { $('importModal').hidden = true; state.tab = tab; if (sub) state.sub = sub; render(); };
window.__importDemo = () => { $('importModal').hidden = false; showImport({ source: 'D:\\HH\\Tournaments', files: 18432, bytes: 214e6, estHands: 142700, unknown: 3, rooms: { GGPoker: { files: 11204, bytes: 131e6 }, PokerStars: { files: 5120, bytes: 61e6 }, Winamax: { files: 2105, bytes: 22e6 } } }); };

document.addEventListener('DOMContentLoaded', async () => {
  setupImport(); setupPlayerMenu(); setupHoverScrollHide();
  // пока база открывается (у большой — до минуты), вместо пустого окна — бегунок с подписью
  if (mda.dbMeta) $('content').replaceChildren(window.mdaLoad('Открываю вашу базу… У большой базы это может занять до минуты.'));
  window.mdaBusy(true, 'Открываю базу…');
  let db = null; try { db = await loadDb(); } finally { window.mdaBusy(false); }
  setDb(db);
  if (!db) openImportModal();
});
window.__pinNet = (i) => { const g = document.querySelectorAll('.net-bar')[i]; const r = g.getBoundingClientRect(); g.dispatchEvent(new MouseEvent('click', { clientX: r.left + r.width / 2, clientY: r.top + 40 })); };
window.__hoverNet = (i) => { const g = document.querySelectorAll('.net-bar')[i]; const r = g.getBoundingClientRect(); g.dispatchEvent(new MouseEvent('mouseenter', { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); };
window.__pickBar = (k) => { document.querySelectorAll('g.pick')[k].dispatchEvent(new MouseEvent('click')); };
window.__pinGroup = (n) => document.querySelectorAll('.hg-c')[n].click();
window.__sz = (k) => { SZ_SIDE = k; };
window.__bx = (k, v) => { if (k === 1) BX1.met = v; else BX2 = v; };
window.__hoverPush = (n) => { const c = document.querySelectorAll('.pmx-c')[n]; const r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('mouseenter', { clientX: r.left + 20, clientY: r.top + 5 })); };
window.__hoverCC = (col) => { const td = [...document.querySelectorAll('.ht td.c.click')].find(t => t.dataset.col === col); const r = td.getBoundingClientRect(); td.dispatchEvent(new MouseEvent('mouseenter', { clientX: r.left + 20, clientY: r.top + 10 })); };
window.__hoverGroup = (n) => { const c = document.querySelectorAll('.hg-c')[n]; const r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('mouseenter', { clientX: r.left + 20, clientY: r.top + 5 })); };
window.__hoverMx = (k) => { const c = document.querySelectorAll('.mx .mx-c')[k]; c.scrollIntoView({ block: 'center' }); const r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('mouseenter', { clientX: r.left + 10, clientY: r.top + 10 })); };

// ---------- разделы программы (вкладки сверху); открытая вкладка запоминается ----------
(function () {
  const tabs = [...document.querySelectorAll('.apptab')];
  const show = (pg, focus) => {
    tabs.forEach(t => {
      const on = t.dataset.page === pg;
      t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.getAttribute('aria-controls')); if (panel) panel.hidden = !on;
      if (on && focus) t.focus();
    });
    try { localStorage.setItem('mda.page', pg); } catch (e) { /* без сохранения */ }
    window.dispatchEvent(new Event('resize')); // графики раздела пересчитывают размеры
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(t.dataset.page));
    t.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return;
      e.preventDefault(); show(tabs[(i + d + tabs.length) % tabs.length].dataset.page, true);
    });
  });
  let start = 'mine'; try { const v = localStorage.getItem('mda.page'); if (tabs.some(t => t.dataset.page === v)) start = v; } catch (e) { /* по умолчанию — кабинет */ }
  show(start);
})();
