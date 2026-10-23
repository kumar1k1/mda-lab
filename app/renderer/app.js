'use strict';
/* global mda, Stats */
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

let DB = null;
let CURRENT_IDX = [];
let LAST_NET_ITEMS = [];
const state = { tab: 'rfi', sub: 'TOT', room: null, type: null, from: null, to: null };

// ---------- вкладки (группы и список будем менять) ----------
const GROUPS = [
  { title: 'Префлоп', tabs: [
    { id: 'rfi', code: 'RFI', label: 'Открытие', render: renderRFI },
    { id: 'cc', code: 'CC', label: 'Колд-колл', plan: 'Колд-колл против открытия по позициям, сайзингам открытия и стеку.' },
    { id: '3bet', code: '3B', label: '3-бет', plan: '3-бет по позициям против позиции открывающего, сайзинги 3-бета, олл-ин 3-беты по стеку.' },
    { id: 'vs3bet', code: 'v3B', label: 'Против 3-бета', plan: 'Фолд / колл / 4-бет против 3-бета по позициям и стеку.' },
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
  ] }
];
const TABS = GROUPS.flatMap(g => g.tabs.map(t => Object.assign({ group: g.title }, t)));

// ---------- числа и цвета ----------
const SMALL = 20; // выборка меньше — помечаем
const rate = (c) => (c && c.n ? c.x / c.n : null);
function fmtPct(p) {
  if (p == null) return '--';
  const v = p * 100;
  if (v === 0) return '0';
  if (v < 0.05) return '0.0';
  return v >= 10 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, '');
}
function heat(td, p, max, tone) {
  const rgb = tone === 'ice' ? 'var(--ice-rgb)' : 'var(--amber-rgb)';
  const t = max > 0 ? Math.min(1, p / max) : 0;
  td.style.background = 'rgba(' + rgb + ',' + (0.07 + 0.66 * t).toFixed(3) + ')';
  if (t > 0.62) td.style.color = tone === 'ice' ? '#08202B' : 'var(--amber-ink)';
}

// opts: {cols, totCol, rows:[{label, sub, data, tone, split}], groupGapBefore}
function heatTable(o) {
  const t = el('table', 'ht');
  const hr = el('tr'); hr.append(el('th'));
  o.cols.forEach((c, i) => {
    if (o.groupGapBefore === i) hr.append(el('th', 'gap'));
    hr.append(el('th', i === 0 ? 'tot' : null, c));
  });
  const thead = el('thead'); thead.append(hr); t.append(thead);
  const tb = el('tbody');
  const maxBy = {};
  o.rows.forEach(r => {
    const tone = r.tone || 'amber';
    o.cols.forEach(c => { const cc = r.data[c]; if (cc && cc.n >= SMALL) maxBy[tone] = Math.max(maxBy[tone] || 0, cc.x / cc.n); });
  });
  o.rows.forEach(r => {
    const tr = el('tr', r.split ? 'split' : null);
    tr.append(el('td', 'lbl' + (r.sub ? ' sub' : ''), r.label));
    o.cols.forEach((c, i) => {
      if (o.groupGapBefore === i) tr.append(el('td', 'gap'));
      const cc = r.data[c], p = rate(cc);
      const td = el('td', 'c' + (i === 0 ? ' tot' : ''));
      if (p == null) { td.classList.add('na'); td.textContent = '--'; td.title = 'нет раздач'; }
      else {
        td.textContent = fmtPct(p);
        heat(td, p, maxBy[r.tone || 'amber'] || p || 1, r.tone);
        if (cc.n < SMALL) { td.classList.add('low'); td.append(el('span', 'n', 'n ' + cc.n)); }
        td.title = r.label + ', ' + c + ': ' + cc.x + ' из ' + cc.n + ' (' + (p * 100).toFixed(1) + '%)';
      }
      tr.append(td);
    });
    tb.append(tr);
  });
  t.append(tb);
  const w = el('div', 'tbl-wrap'); w.append(t);
  return w;
}

// ---------- мини-графики (SVG) ----------
const NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs, style) { const e = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach(k => e.setAttribute(k, attrs[k])); if (style) e.setAttribute('style', style); return e; }
function svgText(x, y, s, anchor, style) { const t = svgEl('text', { x, y, 'text-anchor': anchor || 'middle' }, 'font-family:var(--mono);font-size:11px;fill:var(--muted);' + (style || '')); t.textContent = s; return t; }
function svgRoot(w, h, label) { return svgEl('svg', { viewBox: '0 0 ' + w + ' ' + h, role: 'img', 'aria-label': label }); }

function barsChart(labels, values, avg, label) {
  const W = 360, H = 190, P = { l: 30, r: 10, t: 18, b: 24 };
  const s = svgRoot(W, H, label);
  const max = Math.ceil(Math.max(0.05, ...values.filter(v => v != null)) * 1.12 * 10) / 10;
  const y = (v) => P.t + (1 - v / max) * (H - P.t - P.b);
  [0, 0.5, 1].forEach(f => { const v = max * f; s.append(svgEl('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v) }, 'stroke:var(--line);stroke-width:1')); s.append(svgText(P.l - 6, y(v) + 4, Math.round(v * 100) + '', 'end')); });
  const bw = (W - P.l - P.r) / labels.length;
  labels.forEach((l, i) => {
    const v = values[i]; const x = P.l + i * bw + bw * 0.2, w = bw * 0.6;
    s.append(svgText(x + w / 2, H - 6, l));
    if (v == null) return;
    s.append(svgEl('rect', { x, y: y(v), width: w, height: Math.max(1, y(0) - y(v)), rx: 4 }, 'fill:var(--amber);opacity:' + (0.45 + 0.55 * v / max).toFixed(2)));
    s.append(svgText(x + w / 2, y(v) - 5, fmtPct(v), 'middle', 'fill:var(--text);font-weight:700'));
  });
  if (avg != null) {
    s.append(svgEl('line', { x1: P.l, x2: W - P.r, y1: y(avg), y2: y(avg) }, 'stroke:var(--soft);stroke-width:1;stroke-dasharray:4 4'));
    s.append(svgText(P.l + 2, y(avg) - 5, 'в среднем ' + fmtPct(avg) + '%', 'start', 'fill:var(--soft)'));
  }
  return s;
}

function linesChart(labels, series, label) {
  const W = 360, H = 190, P = { l: 30, r: 12, t: 14, b: 24 };
  const s = svgRoot(W, H, label);
  const all = series.flatMap(x => x.values).filter(v => v != null);
  const max = Math.ceil(Math.max(0.05, ...all) * 1.08 * 10) / 10;
  const y = (v) => P.t + (1 - v / max) * (H - P.t - P.b);
  const x = (i) => P.l + 10 + i * (W - P.l - P.r - 20) / (labels.length - 1);
  [0, 0.5, 1].forEach(f => { const v = max * f; s.append(svgEl('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v) }, 'stroke:var(--line);stroke-width:1')); s.append(svgText(P.l - 6, y(v) + 4, Math.round(v * 100) + '', 'end')); });
  labels.forEach((l, i) => s.append(svgText(x(i), H - 6, l)));
  series.forEach(se => {
    const pts = se.values.map((v, i) => v == null ? null : [x(i), y(v)]).filter(Boolean);
    s.append(svgEl('polyline', { points: pts.map(p => p.join(',')).join(' '), fill: 'none' }, 'stroke:' + se.color + ';stroke-width:2.2;stroke-linejoin:round'));
    pts.forEach(p => s.append(svgEl('circle', { cx: p[0], cy: p[1], r: 3.2 }, 'fill:' + se.color)));
  });
  return s;
}

function shareBar(parts, label) {
  const W = 360, H = 46;
  const s = svgRoot(W, H, label);
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  let x = 0;
  parts.forEach(p => {
    const w = p.value / total * W;
    if (w > 0) s.append(svgEl('rect', { x, y: 6, width: Math.max(0, w - 2), height: 26, rx: 4 }, 'fill:' + p.color));
    x += w;
  });
  return s;
}

function legend(items) {
  const d = el('div', 'legend');
  items.forEach(it => { const s = el('span'); const i = el('i'); if (it.cls) i.className = it.cls; else i.style.background = it.color; s.append(i, document.createTextNode(it.label)); d.append(s); });
  return d;
}

function block(title, note, tableNode, vizNodes) {
  const b = el('section', 'block');
  const h = el('div', 'block-head'); h.append(el('h2', null, title)); if (note) h.append(el('p', null, note));
  const body = el('div', 'block-body'); body.append(tableNode);
  if (vizNodes) { const v = el('div', 'viz'); vizNodes.forEach(n => v.append(n)); body.append(v); }
  b.append(h, body);
  return b;
}

// ---------- вкладка RFI ----------
// ---------- сводка вкладки RFI (нумерованные элементы — чтобы удобно выбирать, что оставить) ----------
const uiState = { mxPos: 'TOT', mxStk: 'all', mxCustom: null };
const MX_STK = [['all', 'Все', null], ['<12', '<12', [0, 12]], ['12–16', '12–16', [12, 16]], ['16–20', '16–20', [16, 20]], ['20–30', '20–30', [20, 30]], ['30–50', '30–50', [30, 50]], ['50+', '50+', [50, 1e9]]];
function getTarget() { try { const v = parseFloat(localStorage.getItem('mdalab.rfiTarget')); return isNaN(v) ? 30 : v; } catch (e) { return 30; } }
function setTarget(v) { try { localStorage.setItem('mdalab.rfiTarget', String(v)); } catch (e) { /* без сохранения */ } }

function numTag(n) { return el('span', 'num-tag', '#' + n); }
function card(n, k, vHtml, sub, extra) {
  const d = el('div', 'insight');
  d.append(numTag(n), el('span', 'k', k));
  const v = el('span', 'v'); v.innerHTML = vHtml; d.append(v);
  if (sub) d.append(el('span', 's', sub));
  if (extra) d.append(extra);
  return d;
}
const pctTxt = (c) => (c && c.n ? fmtPct(c.x / c.n) + '%' : '—');
const bb100 = (sum10, n) => (n ? (sum10 / 10 / n * 100) : null);
const signed = (v, d) => (v == null ? '—' : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d == null ? 1 : d));

// #8 — столбики «BB за открытие» по позициям, ноль посередине
function netChart(items, avg) {
  const W = 520, H = 170, P = { l: 34, r: 10, t: 22, b: 34 };
  const s = svgRoot(W, H, 'Результат открытий по позициям, BB за открытие');
  const vals = items.map(it => (it.o.n ? it.o.sum / 10 / it.o.n : null));
  const ext = Math.max(0.5, ...vals.filter(v => v != null).map(Math.abs)) * 1.2;
  const lo = Math.min(0, ...vals.filter(v => v != null)) < 0 ? -ext : 0, hi = ext;
  const y = (v) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
  const step = hi > 1.5 ? 1 : 0.5;
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
    s.append(svgEl('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v) }, 'stroke:' + (Math.abs(v) < 1e-9 ? 'var(--line2)' : 'var(--line)') + ';stroke-width:1'));
    s.append(svgText(P.l - 6, y(v) + 4, (v > 0 ? '+' : '') + (Math.round(v * 10) / 10), 'end'));
  }
  const bw = (W - P.l - P.r) / items.length;
  items.forEach((it, i) => {
    const v = vals[i]; const cx = P.l + i * bw + bw / 2, w = Math.min(46, bw * 0.55);
    s.append(svgText(cx, H - 18, it.p, 'middle', 'fill:var(--soft);font-weight:700'));
    s.append(svgText(cx, H - 5, it.o.n ? it.o.n.toLocaleString('ru-RU') : '—', 'middle', 'font-size:10px;fill:var(--faint)'));
    if (v == null) return;
    const top = y(Math.max(v, 0)), bot = y(Math.min(v, 0));
    const col = v >= 0 ? 'var(--good)' : 'var(--bad)';
    const g = svgEl('g');
    g.append(svgEl('rect', { x: cx - w / 2, y: top, width: w, height: Math.max(1.5, bot - top), rx: 5 }, 'fill:' + col + ';opacity:.85'));
    g.append(svgText(cx, v >= 0 ? top - 6 : bot + 14, signed(v, 2), 'middle', 'fill:var(--text);font-weight:700'));
    g.append(svgEl('rect', { x: P.l + i * bw, y: P.t, width: bw, height: H - P.t - 2, rx: 6 }, 'fill:transparent'));
    g.setAttribute('tabindex', '0'); g.setAttribute('class', 'net-bar');
    g.setAttribute('aria-label', it.p + ': ' + signed(v, 2) + ' BB за открытие, ' + it.o.n + ' открытий');
    const show = (ev) => showHandPop(it, v, ev, g);
    g.addEventListener('mouseenter', show); g.addEventListener('mousemove', show); g.addEventListener('focus', show);
    g.addEventListener('mouseleave', hideHandPop); g.addEventListener('blur', hideHandPop);
    g.addEventListener('click', (ev) => pinHandPop(it, v, ev, g));
    g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pinHandPop(it, v, null, g); } });
    s.append(g);
  });
  if (avg != null) {
    s.append(svgEl('line', { x1: P.l, x2: W - P.r, y1: y(avg), y2: y(avg) }, 'stroke:var(--amber);stroke-width:1.2;stroke-dasharray:5 4'));
  }
  return s;
}

// #2 — RFI по 30-дневным периодам (последняя точка — последние 30 дней)
function periodChart(wins, maxDay, avg) {
  const W = 520, H = 150, P = { l: 30, r: 12, t: 16, b: 26 };
  const s = svgRoot(W, H, 'RFI по 30-дневным периодам');
  const pts = wins.filter(o => o.w.n >= 100);
  if (pts.length < 2) { s.append(svgText(W / 2, H / 2, 'мало данных для графика')); return s; }
  const vals = pts.map(o => o.w.x / o.w.n);
  const lo = Math.floor(Math.min(...vals, avg == null ? 1 : avg) * 20) / 20, hi = Math.ceil(Math.max(...vals, avg == null ? 0 : avg) * 20) / 20;
  const y = (v) => P.t + (1 - (v - lo) / ((hi - lo) || 0.05)) * (H - P.t - P.b);
  const x = (i) => P.l + 8 + i * (W - P.l - P.r - 16) / (pts.length - 1);
  for (let v = lo; v <= hi + 1e-9; v += 0.05) { s.append(svgEl('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v) }, 'stroke:var(--line);stroke-width:1')); s.append(svgText(P.l - 5, y(v) + 4, Math.round(v * 100) + '', 'end')); }
  if (avg != null) s.append(svgEl('line', { x1: P.l, x2: W - P.r, y1: y(avg), y2: y(avg) }, 'stroke:var(--soft);stroke-width:1;stroke-dasharray:4 4'));
  const [y0, m0] = DB.periodStart.split('-').map(Number); const start = Date.UTC(y0, m0 - 1, 1);
  const dlab = (k) => { const d = new Date(start + (maxDay - k * 30) * 864e5); return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()]; };
  s.append(svgEl('polyline', { points: pts.map((o, i) => x(i).toFixed(1) + ',' + y(vals[i]).toFixed(1)).join(' '), fill: 'none' }, 'stroke:var(--amber);stroke-width:2.2;stroke-linejoin:round'));
  const every = Math.ceil(pts.length / 7);
  pts.forEach((o, i) => {
    const last = i === pts.length - 1;
    const c = svgEl('circle', { cx: x(i), cy: y(vals[i]), r: last ? 5 : 3.5 }, 'fill:' + (last ? 'var(--amber)' : 'var(--panel)') + ';stroke:var(--amber);stroke-width:2');
    const t = svgEl('title'); t.textContent = '30 дней до ' + dlab(o.k) + ': RFI ' + fmtPct(vals[i]) + '% (' + o.w.x + ' из ' + o.w.n + ')'; c.append(t); s.append(c);
    if (i % every === 0 || last) s.append(svgText(x(i), H - 8, dlab(o.k), 'middle', last ? 'fill:var(--amber)' : ''));
  });
  return s;
}

// #13 — матрица рук 13×13
// маленькое окно при наведении на клетку матрицы #13: действие цветом и процент
let mxTip = null;
function showMxTip(info, e) {
  if (!mxTip) { mxTip = el('div', 'mx-tip'); mxTip.setAttribute('role', 'tooltip'); document.body.append(mxTip); }
  mxTip.replaceChildren();
  const h = el('div', 'mt-h'); h.append(el('b', null, info.name), el('span', null, info.n ? info.n + ' раз' : 'не было'));
  mxTip.append(h);
  if (info.n) {
    [['рейз', info.rz, 'var(--mx-raise)'], ['олл-ин', info.ai, 'var(--mx-push)'], ['лимп / колл', info.lp, 'var(--mx-limp)'], ['фолд', info.fo, 'var(--mx-empty)']].forEach(([lab, k, col]) => {
      const r = el('div', 'mt-r' + (k ? '' : ' zero'));
      const sw = el('i'); sw.style.background = col;
      r.append(sw, el('span', null, lab), el('b', null, Math.round(k / info.n * 100) + '%'), el('em', null, String(k)));
      mxTip.append(r);
    });
  }
  mxTip.hidden = false; moveMxTip(e);
}
function moveMxTip(e) {
  if (!mxTip || mxTip.hidden) return;
  const w = mxTip.offsetWidth, h = mxTip.offsetHeight;
  let x = e.clientX + 14, y = e.clientY + 14;
  if (x + w > window.innerWidth - 8) x = e.clientX - w - 14;
  if (y + h > window.innerHeight - 8) y = e.clientY - h - 14;
  mxTip.style.left = x + 'px'; mxTip.style.top = y + 'px';
}
function hideMxTip() { if (mxTip) mxTip.hidden = true; }

function handMatrix(mx) {
  const R = 'AKQJT98765432';
  const wrap = el('div', 'mx');
  for (let i = 0; i < 13; i++) for (let j = 0; j < 13; j++) {
    const k = i * 13 + j, c = mx[k];
    const name = i === j ? R[i] + R[j] : i < j ? R[i] + R[j] + 's' : R[j] + R[i] + 'o';
    const cell = el('div', 'mx-c');
    const v = c.n ? c.x / c.n : null;
    if (v == null) cell.classList.add('na');
    else {
      // заливка слева направо: рейз (янтарь) → пуш (синий) → лимп/колл (зелёный); тёмный остаток — фолд
      const ai = c.ai || 0, lp = c.lp || 0, rz = c.x - ai;
      let left = 0;
      [[rz, ''], [ai, 'push'], [lp, 'limp']].forEach(([cnt, cls]) => {
        if (!cnt) return;
        const f = el('div', 'mx-fill' + (cls ? ' ' + cls : '')); f.style.left = (left / c.n * 100).toFixed(2) + '%'; f.style.width = (cnt / c.n * 100).toFixed(2) + '%';
        cell.append(f); left += cnt;
      });
      if (c.n < 5) cell.classList.add('low');
    }
    const lab = el('div', 'mx-lab'); lab.append(el('span', 'h', name));

    cell.append(lab);
    const info = { name, n: c.n, rz: c.x - (c.ai || 0), ai: c.ai || 0, lp: c.lp || 0, fo: c.n - c.x - (c.lp || 0) };
    cell.addEventListener('mouseenter', (e) => showMxTip(info, e)); cell.addEventListener('mousemove', (e) => moveMxTip(e)); cell.addEventListener('mouseleave', hideMxTip);
    wrap.append(cell);
  }
  return wrap;
}

// #14 — календарь активности
function calendar(cal, maxDay) {
  const wrap = el('div', 'cal-wrap');
  const grid = el('div', 'cal');
  const [y0, m0] = DB.periodStart.split('-').map(Number);
  const start = Date.UTC(y0, m0 - 1, 1);
  const startDow = (new Date(start).getUTCDay() + 6) % 7; // пн = 0
  const maxHands = Math.max(1, ...Object.values(cal).map(d => d.hands));
  const total = maxDay + 1 + startDow;
  for (let k = 0; k < total; k++) {
    const day = k - startDow;
    const cell = el('div', 'cal-c');
    if (day < 0) { cell.classList.add('void'); grid.append(cell); continue; }
    const d = cal[day];
    const dt = new Date(start + day * 864e5);
    const label = dt.getUTCDate() + ' ' + MONTHS[dt.getUTCMonth()] + ' ' + dt.getUTCFullYear();
    if (d) {
      cell.style.background = 'rgba(var(--amber-rgb),' + (0.18 + 0.82 * Math.sqrt(d.hands / maxHands)).toFixed(2) + ')';
      cell.title = label + ': ' + d.hands + ' рук, RFI ' + (d.n ? Math.round(d.x / d.n * 100) + '%' : '—') + ', результат ' + signed(d.net / 10, 0) + ' BB';
    } else cell.title = label + ': не играли';
    grid.append(cell);
  }
  wrap.append(grid);
  return wrap;
}

// ---------- #3+ — стил с CO и BTN подробно ----------
const C_CO = 'var(--amber)', C_BTN = 'var(--ice)';
const rateOf = (z) => (z && z.n ? z.x / z.n : null);

function stealModule(tag, title, sub, node, pairLegend) {
  const m = el('div', 'sm');
  const h = el('div', 'sm-h'); h.append(el('span', 'num-tag sm-tag', '#' + tag), el('b', null, title));
  m.append(h); if (sub) m.append(el('span', 'sm-s', sub));
  if (pairLegend) { const lg = el('div', 'resp-legend row sm-lg'); [['CO', C_CO], ['BTN', C_BTN]].forEach(([lab, col]) => { const it = el('span'); const i = el('i'); i.style.background = col; it.append(i, document.createTextNode(lab)); lg.append(it); }); m.append(lg); }
  m.append(node);
  return m;
}

// сгруппированные столбики CO/BTN по корзинам
function pairBars(labels, a, b, fmtV, label) {
  const W = 300, H = 132, P = { l: 6, r: 6, t: 16, b: 22 };
  const s = svgRoot(W, H, label);
  const vals = a.concat(b).filter(v => v != null);
  const max = Math.max(0.01, ...vals) * 1.15;
  const y = (v) => P.t + (1 - v / max) * (H - P.t - P.b);
  const gw = (W - P.l - P.r) / labels.length, bw = Math.min(26, gw * 0.32);
  s.append(svgEl('line', { x1: P.l, x2: W - P.r, y1: y(0), y2: y(0) }, 'stroke:var(--line2);stroke-width:1'));
  labels.forEach((lab, i) => {
    const cx = P.l + i * gw + gw / 2;
    [[a[i], C_CO, -1], [b[i], C_BTN, 1]].forEach(([v, col, side]) => {
      if (v == null) return;
      const x = cx + side * (bw / 2 + 1) - bw / 2;
      const r = svgEl('rect', { x, y: y(v), width: bw, height: Math.max(1, y(0) - y(v)), rx: 3 }, 'fill:' + col);
      const t = svgEl('title'); t.textContent = (side < 0 ? 'CO' : 'BTN') + ', ' + lab + ': ' + fmtV(v); r.append(t); s.append(r);
      s.append(svgText(x + bw / 2, y(v) - 4, fmtV(v), 'middle', 'font-size:10px;fill:var(--soft)'));
    });
    s.append(svgText(cx, H - 6, lab, 'middle', 'font-size:10px'));
  });
  return s;
}

// две горизонтальные полосы CO/BTN
function pairH(rows) {
  const box = el('div', 'mini-bars');
  const max = Math.max(0.0001, ...rows.map(r => Math.abs(r.v || 0)));
  rows.forEach(r => {
    const row = el('div', 'mb-row'); row.title = r.title || '';
    const tr = el('div', 'mb-track'); const f = el('div', 'mb-fill'); f.style.width = (r.v == null ? 0 : Math.abs(r.v) / max * 100) + '%'; f.style.background = r.color; tr.append(f);
    row.append(el('span', 'mb-l', r.label), tr, el('span', 'mb-v ' + (r.cls || ''), r.text));
    box.append(row);
  });
  return box;
}

// 100%-полоса из сегментов для CO и BTN
function pairStack(rows, parts) {
  const box = el('div', 'stk2');
  rows.forEach(r => {
    const tot = r.vals.reduce((a, b) => a + b, 0);
    const line = el('div', 'stk2-row');
    const bar = el('div', 'resp-bar');
    r.vals.forEach((v, k) => { const seg = el('div'); seg.style.width = (tot ? v / tot * 100 : 0) + '%'; seg.style.background = parts[k][1]; seg.title = r.label + ', ' + parts[k][0] + ': ' + (tot ? Math.round(v / tot * 100) : 0) + '% (' + v + ')'; bar.append(seg); });
    line.append(el('span', 'mb-l', r.label), bar, el('span', 'stk2-v', r.vals.map(v => (tot ? Math.round(v / tot * 100) : 0)).join(' / ')));
    box.append(line);
  });
  const lg = el('div', 'resp-legend row');
  parts.forEach(([lab, col]) => { const it = el('span'); const i = el('i'); i.style.background = col; it.append(i, document.createTextNode(lab)); lg.append(it); });
  box.append(lg);
  return box;
}

function monthPair(co, btn) {
  const months = [...new Set(Object.keys(co).concat(Object.keys(btn)).map(Number))].sort((a, b) => a - b).filter(m => (co[m] && co[m].n >= 40) || (btn[m] && btn[m].n >= 40));
  const W = 300, H = 120, P = { l: 26, r: 8, t: 10, b: 20 };
  const s = svgRoot(W, H, 'Стил по месяцам');
  if (months.length < 2) { s.append(svgText(W / 2, H / 2, 'мало данных')); return s; }
  const vals = months.flatMap(m => [rateOf(co[m]), rateOf(btn[m])]).filter(v => v != null);
  const lo = Math.floor(Math.min(...vals) * 10) / 10, hi = Math.ceil(Math.max(...vals) * 10) / 10;
  const y = (v) => P.t + (1 - (v - lo) / ((hi - lo) || 0.1)) * (H - P.t - P.b);
  const x = (i) => P.l + i * (W - P.l - P.r) / (months.length - 1);
  for (let v = lo; v <= hi + 1e-9; v += 0.1) { s.append(svgEl('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v) }, 'stroke:var(--line);stroke-width:1')); s.append(svgText(P.l - 4, y(v) + 3, Math.round(v * 100) + '', 'end', 'font-size:9px')); }
  [[co, C_CO, 'CO'], [btn, C_BTN, 'BTN']].forEach(([src, col, nm]) => {
    const pts = months.map((m, i) => (src[m] && src[m].n >= 40 ? [x(i), y(rateOf(src[m])), m] : null)).filter(Boolean);
    s.append(svgEl('polyline', { points: pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' '), fill: 'none' }, 'stroke:' + col + ';stroke-width:2'));
    pts.forEach(p => { const c = svgEl('circle', { cx: p[0], cy: p[1], r: 2.6 }, 'fill:' + col); const t = svgEl('title'); t.textContent = nm + ', ' + monthLabel(p[2]) + ': ' + fmtPct(rateOf(src[p[2]])) + '% (' + src[p[2]].n + ')'; c.append(t); s.append(c); });
  });
  [0, months.length - 1].forEach(i => s.append(svgText(x(i), H - 5, monthLabel(months[i]), i ? 'end' : 'start', 'font-size:9px')));
  return s;
}

function renderStealPanel(idx) {
  const o = Stats.stealExtra(DB, idx);
  // каждый пункт 3.1–3.8 — отдельное окно; общий контейнер без рамки
  const card = el('div', 'steal-split');
  card.append(el('span', 'num-tag', '#3+')); // служебная метка для раскладки, скрыта стилями
  const grid = card;
  const pct = (v) => (v == null ? '—' : fmtPct(v) + '%');
  const f3 = (z) => (z.n ? z.x / z.n : null);
  const nb = (z) => (z.n ? z.sum / 10 / z.n : null);
  grid.append(stealModule('3.4', 'Результат стила', 'BB за открытие', pairH([
    { label: 'CO', v: nb(o.CO.net), text: signed(nb(o.CO.net), 2), cls: nb(o.CO.net) >= 0 ? 'up' : 'down', color: C_CO, title: o.CO.net.n + ' открытий' },
    { label: 'BTN', v: nb(o.BTN.net), text: signed(nb(o.BTN.net), 2), cls: nb(o.BTN.net) >= 0 ? 'up' : 'down', color: C_BTN, title: o.BTN.net.n + ' открытий' }]), true));
  grid.append(stealModule('3.5', 'Сайзинг стила', 'доля открытий каждым размером, BB', pairStack([{ label: 'CO', vals: o.CO.sz }, { label: 'BTN', vals: o.BTN.sz }], o.SZ.map((z, k) => [z, ['var(--amber)', '#E07B39', '#A78BFA', 'var(--bad)'][k]]))));
  grid.append(stealModule('3.6', 'По месяцам', 'стил, %', monthPair(o.CO.month, o.BTN.month), true));
  grid.append(stealModule('3.7', 'Против стека блайндов', 'стил, когда самый короткий блайнд имеет …, BB', pairBars(o.BLIND, o.CO.blind.map(rateOf), o.BTN.blind.map(rateOf), pct, 'Стил против стека блайндов'), true));
  const st = el('div', 'sm sm-soon');
  st.append(el('div', 'sm-h'), el('span', 'sm-s', 'Стил по стадии турнира (баббл, ITM, финальный стол) — нужно научить парсер определять стадию'));
  st.firstChild.append(el('span', 'num-tag sm-tag', '#3.8'), el('b', null, 'По стадии турнира'));
  grid.append(st);
  return card;
}

// плитки «все сбросили / колл / рейз» — общий вид для #1 и #3
function respTiles(resp, title, labels) {
  const rs = el('div', 'resp');
  const rt = resp.reduce((a, b) => a + b, 0);
  const rl = el('div', 'resp-tiles');
  (labels || [['все сбросили', 'var(--good)'], ['колл', 'var(--ice)'], ['рейз', 'var(--bad)']]).forEach(([lab, col], k) => {
    const it = el('span', 'resp-tile'); const b = el('b', null, rt ? fmtPct(resp[k] / rt) + '%' : '—'); b.style.color = col;
    it.append(b, el('span', null, lab)); it.title = resp[k].toLocaleString('ru-RU') + ' из ' + rt.toLocaleString('ru-RU');
    rl.append(it);
  });
  rs.append(el('span', 'resp-t', title), rl);
  return rs;
}

// ---------- #4+ — пуши подробно ----------
function renderShovePanel(idx, stackBars) {
  const c = DB.cols, P = ['EP', 'MP', 'HJ', 'CO', 'BTN', 'SB'];
  const pos = P.map(() => ({ x: 0, n: 0 })), resp = [0, 0, 0], net = { sum: 0, n: 0 }, netStk = [[], [], [], [], [], []].map(() => ({ sum: 0, n: 0 }));
  const SB = [['<8', 0, 8], ['8–10', 8, 10], ['10–12', 10, 12], ['12–15', 12, 15], ['15–20', 15, 20], ['20+', 20, 1e9]];
  const opp = SB.map(() => ({ x: 0, n: 0 }));
  for (const i of idx) {
    const p = c.pos[i]; if (c.sit[i] !== 0 || p > 5) continue;
    const bb = c.bb[i] / 10, k = SB.findIndex(z => bb >= z[1] && bb < z[2]);
    if (k >= 0) { opp[k].n++; if (c.act[i] === 3) opp[k].x++; }
    if (c.act[i] < 2) continue;
    pos[p].n++; if (c.act[i] === 3) pos[p].x++;
    if (c.act[i] !== 3) continue;
    if (c.orsp && c.orsp[i] >= 0) resp[c.orsp[i]]++;
    if (c.net) { net.sum += c.net[i]; net.n++; if (k >= 0) { netStk[k].sum += c.net[i]; netStk[k].n++; } }
  }
  const card = el('div', 'insight steal-panel');
  card.append(numTag('4+'), el('span', 'k', 'Пуши подробно'));
  const grid = el('div', 'sm-grid');
  grid.append(stealModule('4.1', 'По вашему стеку', 'какая часть открытий — олл-ин', stackBars));
  const pr = el('div', 'mini-bars');
  const maxP = Math.max(0.01, ...pos.map(z => (z.n ? z.x / z.n : 0)));
  P.forEach((nm, k) => { const z = pos[k], v = z.n ? z.x / z.n : null; const r = el('div', 'mb-row'); r.title = nm + ': ' + z.x + ' пушей из ' + z.n + ' открытий'; const tr = el('div', 'mb-track'); const f = el('div', 'mb-fill'); f.style.width = (v == null ? 0 : v / maxP * 100) + '%'; tr.append(f); r.append(el('span', 'mb-l', nm), tr, el('span', 'mb-v', v == null ? '—' : fmtPct(v) + '%')); pr.append(r); });
  grid.append(stealModule('4.2', 'По позициям', 'какая часть открытий — олл-ин', pr));
  const fr = el('div', 'mini-bars');
  const maxO = Math.max(0.01, ...opp.map(z => (z.n ? z.x / z.n : 0)));
  SB.forEach((z0, k) => { const z = opp[k], v = z.n ? z.x / z.n : null; const r = el('div', 'mb-row'); r.title = z0[0] + ' BB: пуш ' + z.x + ' раз из ' + z.n + ' возможностей'; const tr = el('div', 'mb-track'); const f = el('div', 'mb-fill'); f.style.width = (v == null ? 0 : v / maxO * 100) + '%'; f.style.background = 'var(--ice)'; tr.append(f); r.append(el('span', 'mb-l', z0[0] + ' BB'), tr, el('span', 'mb-v', v == null ? '—' : fmtPct(v) + '%')); fr.append(r); });
  grid.append(stealModule('4.3', 'Частота пуша', 'пуш от всех возможностей открыться, по стеку', fr));
  grid.append(stealModule('4.4', 'Ответ на пуш', 'как часто ваш пуш проходит', respTiles([resp[0], resp[1] + resp[2]], '', [['все сбросили', 'var(--good)'], ['пуш уравняли', 'var(--bad)']])));
  const rr = el('div', 'mini-bars');
  const maxN = Math.max(0.01, ...netStk.map(z => (z.n ? Math.abs(z.sum / 10 / z.n) : 0)));
  SB.forEach((z0, k) => { const z = netStk[k], v = z.n ? z.sum / 10 / z.n : null; const r = el('div', 'mb-row'); r.title = z0[0] + ' BB: ' + z.n + ' пушей'; const tr = el('div', 'mb-track'); const f = el('div', 'mb-fill'); f.style.width = (v == null ? 0 : Math.abs(v) / maxN * 100) + '%'; f.style.background = v != null && v < 0 ? 'var(--bad)' : 'var(--good)'; tr.append(f); r.append(el('span', 'mb-l', z0[0] + ' BB'), tr, el('span', 'mb-v ' + (v == null ? '' : v >= 0 ? 'up' : 'down'), v == null ? '—' : signed(v, 2))); rr.append(r); });
  grid.append(stealModule('4.5', 'Результат пуша', 'в среднем ' + signed(net.n ? net.sum / 10 / net.n : null, 2) + ' BB за пуш, по стеку', rr));
  card.append(grid);
  return card;
}

function renderRFISummary(idx, r) {
  const x = Stats.rfiExtra(DB, idx, { mxPos: uiState.mxPos, mxStk: uiState.mxStk === 'custom' && uiState.mxCustom ? uiState.mxCustom : (MX_STK.find(z => z[0] === uiState.mxStk) || MX_STK[0])[2] });
  const zone = el('div', 'summary');

  // карточки
  const cards = el('div', 'insights');
  // #1 — открываете + реакция соперников на открытие
  const rs = el('div', 'resp');
  const rt = x.resp[0] + x.resp[1] + x.resp[2];
  const rbar = el('div', 'resp-bar');
  const RESP = [['все сбросили', 'var(--good)'], ['колл', 'var(--ice)'], ['рейз', 'var(--bad)']];
  RESP.forEach(([lab, col], k) => { const seg = el('div'); seg.style.width = (rt ? x.resp[k] / rt * 100 : 0) + '%'; seg.style.background = col; seg.title = lab + ': ' + x.resp[k] + ' из ' + rt; rbar.append(seg); });
  const rl = el('div', 'resp-tiles');
  RESP.forEach(([lab, col], k) => { const it = el('span', 'resp-tile'); const b = el('b', null, rt ? fmtPct(x.resp[k] / rt) + '%' : '—'); b.style.color = col; it.append(b, el('span', null, lab)); it.title = x.resp[k].toLocaleString('ru-RU') + ' из ' + rt.toLocaleString('ru-RU') + ' открытий'; rl.append(it); });
  rs.append(el('span', 'resp-t', 'Первый ответ соперников на ваше открытие'), rl);
  cards.append(card(1, 'Открываете', '<em>' + pctTxt(x.all) + '</em>', 'рук из ' + x.all.n.toLocaleString('ru-RU') + ' возможностей, EP–BTN', rs));

  const dall = x.all.n ? x.all.x / x.all.n : null;
  // #8 — результат открытий: столбики по позициям вокруг нуля
  const nb = bb100(x.openNet.sum, x.openNet.n);
  const perOpen = (o) => (o.n ? o.sum / 10 / o.n : null);
  const unc = perOpen(x.netUnc), con = perOpen(x.netCon);
  const split = el('div', 'net-split');
  const sp1 = el('div'); sp1.append(el('span', 'k', 'без борьбы'), el('b', unc == null ? '' : unc >= 0 ? 'up' : 'down', signed(unc, 2)), el('span', 'n', x.netUnc.n.toLocaleString('ru-RU') + ' раз'));
  const sp2 = el('div'); sp2.append(el('span', 'k', 'когда сыграли'), el('b', con == null ? '' : con >= 0 ? 'up' : 'down', signed(con, 2)), el('span', 'n', x.netCon.n.toLocaleString('ru-RU') + ' раз'));
  split.append(sp1, sp2);
  const c8 = card(8, 'Результат открытий', '<span class="' + (nb >= 0 ? 'up' : 'down') + '">' + signed(nb == null ? null : nb / 100, 2) + '</span> <small>BB за открытие</small>', 'фактический итог раздачи после вашего открытия по позициям; пунктир — среднее, под позицией — число открытий', netChart((LAST_NET_ITEMS = ['EP', 'MP', 'HJ', 'CO', 'BTN', 'SB'].map(p => ({ p, o: x.openNetPos[p], mx: x.netMx[p] }))), nb == null ? null : nb / 100));
  c8.classList.add('wide', 'span3');
  cards.append(c8);
  // #3 — стил + ответ блайндов (CO и BTN вместе), как в #1
  const so = Stats.stealExtra(DB, idx);
  const sresp = [0, 1, 2].map(k => so.CO.resp[k] + so.BTN.resp[k]);
  cards.append(card(3, 'Стил с CO и BTN', '<em>' + pctTxt(x.late) + '</em>', 'CO ' + pctTxt(x.latePos.CO) + ' · BTN ' + pctTxt(x.latePos.BTN), respTiles(sresp, 'Ответ блайндов на ваш стил')));

  // #4 — доля пушей и разбивка по стеку
  const st = el('div', 'mini-bars');
  const maxSh = Math.max(0.01, ...x.shoveStk.map(z => (z.n ? z.x / z.n : 0)));
  x.SHOVE_STK.forEach((lab, k) => {
    const z = x.shoveStk[k]; const v = z.n ? z.x / z.n : null;
    const r = el('div', 'mb-row'); r.title = lab + ' BB: пушей ' + z.x + ' из ' + z.n + ' открытий';
    const tr = el('div', 'mb-track'); const f = el('div', 'mb-fill'); f.style.width = (v == null ? 0 : v / maxSh * 100) + '%'; tr.append(f);
    r.append(el('span', 'mb-l', lab + ' BB'), tr, el('span', 'mb-v', v == null ? '—' : fmtPct(v) + '%'));
    st.append(r);
  });
  cards.append(card(4, 'Доля пушей среди открытий', pctTxt(x.shove), x.shove.x.toLocaleString('ru-RU') + ' пушей из ' + x.shove.n.toLocaleString('ru-RU') + ' открытий'));
  const shovePanel = renderShovePanel(idx, st);


  // #6 — RFI в каждом руме
  const roomKeys = Object.keys(x.rooms).filter(k => x.rooms[k].n > 0).sort((a, b) => x.rooms[b].x / x.rooms[b].n - x.rooms[a].x / x.rooms[a].n);
  const rb = el('div', 'mini-bars');
  const maxR = Math.max(0.01, ...roomKeys.map(k => x.rooms[k].x / x.rooms[k].n));
  roomKeys.forEach(k => {
    const z = x.rooms[k], v = z.x / z.n;
    const r = el('div', 'mb-row'); r.title = DB.rooms[k] + ': ' + z.x + ' из ' + z.n;
    const tr = el('div', 'mb-track'); const f = el('div', 'mb-fill'); f.style.width = (v / maxR * 100) + '%'; tr.append(f);
    r.append(el('span', 'mb-l', DB.rooms[k]), tr, el('span', 'mb-v', fmtPct(v) + '%'));
    rb.append(r);
  });
  cards.append(card(6, 'RFI по румам', '<em>' + pctTxt(x.all) + '</em>', roomKeys.length > 1 ? 'общий по Alias, ниже — каждый рум' : 'выберите Alias, чтобы сравнить румы', roomKeys.length > 1 ? rb : null));

  const dall2 = dall;
  cards.append(card(10, 'Фолд на 3-бет', pctTxt(x.f3b), 'после вашего открытия, ' + x.f3b.n.toLocaleString('ru-RU') + ' раз против 3-бета'));
  // раскладка по строкам: карточка слева, её инфографика справа
  const byTag = {}; [...cards.children].forEach(n => { byTag[n.querySelector('.num-tag').textContent] = n; });
  byTag['#3+'] = renderStealPanel(idx); byTag['#4+'] = shovePanel;
  const row = (l, r) => { const d = el('div', 'sum-pair'); d.append(byTag[l], byTag[r]); return d; };
  zone.append(row('#1', '#8'), row('#3', '#3+'), row('#4', '#4+'));
  const rest = el('div', 'insights'); ['#6', '#10'].forEach(t => byTag[t] && rest.append(byTag[t])); zone.append(rest);

  // матрица рук
  const b13 = el('section', 'block'); b13.append(numTag(13));
  const h13 = el('div', 'block-head'); h13.append(el('h2', null, 'Какие руки вы открываете'), el('p', null, 'процент открытия каждой руки, когда до вас все сбросили; без PokerDom — там нет карт героя'));
  const seg = el('div', 'seg');
  ['TOT', 'EP', 'MP', 'HJ', 'CO', 'BTN', 'SB'].forEach(p => { const b = el('button', uiState.mxPos === p ? 'on' : '', p === 'TOT' ? 'Все' : p); b.type = 'button'; b.onclick = () => { uiState.mxPos = p; render(); }; seg.append(b); });
  const mxBody = el('div', 'block-body'); mxBody.append(handMatrix(x.mx));
  const mxSide = el('div', 'mx-side');
  const segS = el('div', 'seg');
  MX_STK.forEach(([id, lab]) => { const b = el('button', uiState.mxStk === id ? 'on' : '', lab); b.type = 'button'; b.onclick = () => { uiState.mxStk = id; render(); }; segS.append(b); });
  // свой диапазон стека: от … до … BB
  const cr = el('form', 'mx-range'); cr.setAttribute('aria-label', 'Свой диапазон стека');
  const mkIn = (id, ph, val) => { const i = el('input'); i.type = 'number'; i.id = id; i.min = '0'; i.max = '1000'; i.step = '0.5'; i.placeholder = ph; i.inputMode = 'decimal'; if (val != null) i.value = String(val); return i; };
  const cur = uiState.mxStk === 'custom' && uiState.mxCustom ? uiState.mxCustom : null;
  const inLo = mkIn('mxLo', 'от', cur ? cur[0] : null), inHi = mkIn('mxHi', 'до', cur && cur[1] < 1e8 ? cur[1] : null);
  const lLo = el('label', 'sr', 'Стек от, BB'); lLo.htmlFor = 'mxLo'; const lHi = el('label', 'sr', 'Стек до, BB'); lHi.htmlFor = 'mxHi';
  const go = el('button', 'btn mx-go' + (cur ? ' on' : ''), 'Показать'); go.type = 'submit';
  const err = el('span', 'mx-err');
  cr.append(lLo, inLo, el('span', 'mx-dash', '—'), lHi, inHi, el('span', 'mx-unit', 'BB'), go, err);
  cr.onsubmit = (e) => {
    e.preventDefault();
    const lo = inLo.value === '' ? 0 : parseFloat(inLo.value), hi = inHi.value === '' ? 1e9 : parseFloat(inHi.value);
    if (isNaN(lo) || isNaN(hi) || lo < 0 || hi <= lo) { err.textContent = 'Верхняя граница должна быть больше нижней'; return; }
    uiState.mxCustom = [lo, hi]; uiState.mxStk = 'custom'; render();
  };
  const mxN = x.mx.reduce((a, m) => a + m.n, 0);
  const mxLeg = el('div', 'resp-legend row'); [['рейз', 'var(--mx-raise)'], ['олл-ин', 'var(--mx-push)'], ['лимп / колл', 'var(--mx-limp)'], ['фолд', 'var(--mx-empty)']].forEach(([l, col]) => { const it = el('span'); const i = el('i'); i.style.background = col; if (col === 'var(--mx-empty)') i.style.border = '1px solid var(--line2)'; it.append(i, document.createTextNode(l)); mxLeg.append(it); });
  mxSide.append(mxLeg, el('span', 'mx-cap', 'Позиция'), seg, el('span', 'mx-cap', 'Ваш стек, BB'), segS, el('span', 'mx-cap', 'Свой диапазон'), cr, el('span', 'muted small', (cur ? 'Стек ' + cur[0] + '–' + (cur[1] < 1e8 ? cur[1] : '∞') + ' BB: ' : '') + mxN.toLocaleString('ru-RU') + ' возможностей открыться в выборке'));
  mxSide.append(el('p', 'muted small', 'Клетка закрашена слева направо на долю открытий этой руки: янтарная часть — рейзы, синяя — олл-ин, зелёная — лимпы, тёмная — фолды. Наведите на клетку, чтобы увидеть проценты каждого действия. Сверху от диагонали — одномастные, снизу — разномастные. Бледная заливка — меньше 5 раздач.'));
  mxBody.append(mxSide);
  b13.append(h13, mxBody); zone.append(b13);

  // календарь
  const b14 = el('section', 'block'); b14.append(numTag(14));
  const h14 = el('div', 'block-head'); h14.append(el('h2', null, 'Календарь игры'), el('p', null, 'каждая клетка — день; ярче — больше рук. Наведите, чтобы увидеть руки, RFI и результат дня'));
  b14.append(h14, calendar(x.cal, x.maxDay));
  zone.append(b14);
  zone.insertBefore(b13, zone.children[1]); // матрица рук сразу под строкой #1 / #8
  return zone;
}

function renderRFI(idx) {
  const r = Stats.rfi(DB, idx);
  const POS = r.RFI_COLS.slice(1);
  const page = el('div', 'page');

  // заголовок и выводы
  const head = el('div', 'page-head');
  const h1 = el('h1'); h1.append(document.createTextNode('Открытие рейзом '), el('span', null, 'RFI'));
  head.append(h1, el('p', null, 'Как часто вы открываете банк рейзом, когда до вас все сбросили: по позициям, сайзингу, глубине стека и против лимперов.'));
  page.append(head);

  const tot = rate(r.tot.TOT.TOT);
  const posVals = POS.map(p => ({ p, v: rate(r.tot.TOT[p]) })).filter(x => x.v != null);
  const widest = posVals.reduce((a, b) => (b.v > a.v ? b : a), posVals[0] || { p: '—', v: 0 });
  const tightest = posVals.reduce((a, b) => (b.v < a.v ? b : a), posVals[0] || { p: '—', v: 0 });
  const opens = r.tot.TOT.TOT.x;
  const std = r.nai[r.SIZES[0]].TOT.x;
  const allin = opens - r.nai.NAI.TOT.x;
  const deep = rate(r.stk[r.STACKS[0]].TOT), short = rate(r.stk[r.STACKS[r.STACKS.length - 1]].TOT);
  page.append(renderRFISummary(idx, r));

  // 1. по позициям
  page.append(block('По позициям', 'доля открытий рейзом',
    heatTable({ cols: r.RFI_COLS, rows: [{ label: 'RFI', data: r.tot.TOT }, { label: 'не олл-ин (NAI)', sub: true, data: r.nai.NAI }] }),
    [barsChart(POS, POS.map(p => rate(r.tot.TOT[p])), tot, 'RFI по позициям')]));

  // 2. сайзинг
  const sizeColors = ['var(--amber)', '#E07B39', '#A78BFA', 'var(--ice)'];
  const parts = r.SIZES.map((s, i) => ({ label: s + ' BB', value: r.nai[s].TOT.x, color: sizeColors[i] })).concat([{ label: 'олл-ин', value: Math.max(0, allin), color: sizeColors[3] }]);
  page.append(block('Сайзинг открытия', 'доля рук, открытых этим размером',
    heatTable({ cols: r.RFI_COLS, rows: r.SIZES.map(s => ({ label: s + ' BB', data: r.nai[s] })) }),
    [shareBar(parts, 'Распределение открытий по размеру'), legend(parts.map(p => ({ label: p.label + ' — ' + (opens ? (p.value / opens * 100).toFixed(1) : 0) + '%', color: p.color }))), el('div', 'cap', 'Как распределены все ваши открытия по размеру ставки.')]));

  // 3. по стеку
  const stackColors = ['var(--amber)', '#E07B39', '#A78BFA', 'var(--ice)'];
  page.append(block('По глубине стека', 'открытия не олл-ином при вашем стеке, BB',
    heatTable({ cols: r.RFI_COLS, rows: r.STACKS.map(s => ({ label: s + ' BB', data: r.stk[s] })) }),
    [linesChart(POS, r.STACKS.map((s, i) => ({ color: stackColors[i], values: POS.map(p => rate(r.stk[s][p])) })), 'RFI по позициям для разных стеков'),
      legend(r.STACKS.map((s, i) => ({ label: s + ' BB', color: stackColors[i] })))]));

  // 4. изоляция
  const ISOP = r.ISO_COLS.slice(1);
  page.append(block('Изоляция лимперов', 'ISO — ваш рейз поверх лимпа; ниже — как часто вы сбрасываете, когда лимпер ререйзит ваш изолейт',
    heatTable({
      cols: r.ISO_COLS, groupGapBefore: 5,
      rows: [
        { label: 'ISO vs 1 лимпер', data: r.iso.vs1 },
        { label: 'фолд на лимп-рейз', sub: true, data: r.iso.vs1f, tone: 'ice' },
        { label: 'ISO vs 2+ лимпера', data: r.iso.vs2, split: true },
        { label: 'фолд на лимп-рейз', sub: true, data: r.iso.vs2f, tone: 'ice' }
      ]
    }),
    [linesChart(ISOP, [
      { color: 'var(--amber)', values: ISOP.map(p => rate(r.iso.vs1[p])) },
      { color: 'var(--ice)', values: ISOP.map(p => rate(r.iso.vs1f[p])) }
    ], 'Изоляция и фолд на лимп-рейз по позициям'),
    legend([{ label: 'ISO vs 1 лимпер', color: 'var(--amber)' }, { label: 'ваш фолд на лимп-рейз', color: 'var(--ice)' }])]));

  page.append(legend([
    { label: 'ваша агрессия: чем ярче, тем чаще', color: 'rgba(var(--amber-rgb),.6)' },
    { label: 'ваши фолды против агрессии', color: 'rgba(var(--ice-rgb),.6)' },
    { label: 'выборка меньше ' + SMALL + ' раздач', cls: 'hatch' },
    { label: 'наведите на ячейку — увидите «x из n»', color: 'transparent' }
  ]));
  return page;
}

function renderSoon(tab) {
  const c = el('div', 'soon');
  c.append(el('h1', null, tab.label), el('p', null, tab.plan), el('p', 'muted', 'Вкладка в работе. Пришлите скриншот, как она выглядит у вас, или опишите, какие таблицы нужны.'));
  return c;
}

// ---------- отрисовка ----------
function currentIdx() {
  return Stats.selectHands(DB, { room: state.room, type: state.type, from: state.from, to: state.to, tbl: state.sub === 'TOT' ? null : state.sub });
}

function render() {
  hideHandPop(); hideMxTip();
  const rail = $('rail'); rail.replaceChildren();
  GROUPS.forEach(g => {
    const box = el('div', 'rgroup');
    box.append(el('div', 'rgroup-title', g.title));
    g.tabs.forEach(t => {
      const b = el('button', 'tab' + (t.id === state.tab ? ' active' : '') + (t.render ? ' ready' : ''));
      b.append(el('span', 'code', t.code), el('span', 'name', t.label), el('span', 'dot'));
      b.title = t.render ? t.label : t.label + ' — в работе';
      if (t.id === state.tab) b.setAttribute('aria-current', 'page');
      b.onclick = () => { state.tab = t.id; render(); $('content').scrollTop = 0; };
      box.append(b);
    });
    rail.append(box);
  });
  const subs = $('subtabs'); subs.replaceChildren();
  [['TOT', 'Все столы'], ['6max', '6-max'], ['9max', '7–9 max']].forEach(([id, label]) => {
    const b = el('button', state.sub === id ? 'on' : '', label);
    b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', state.sub === id);
    b.onclick = () => { state.sub = id; render(); };
    subs.append(b);
  });
  const tab = TABS.find(t => t.id === state.tab);
  $('crumbGroup').textContent = tab.group;
  $('crumbTab').textContent = tab.label;
  const idx = currentIdx();
  $('selCount').textContent = idx.length.toLocaleString('ru-RU') + ' рук в выборке';
  CURRENT_IDX = idx;
  LAST_NET_ITEMS = [];
  $('content').replaceChildren(tab.render ? tab.render(idx) : renderSoon(tab));
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
  $('fRoom').onchange = (e) => { state.room = e.target.value === '' ? null : +e.target.value; updatePlayer(); render(); };
  $('fType').onchange = (e) => { state.type = e.target.value === '' ? null : +e.target.value; render(); };
  $('fFrom').onchange = (e) => { state.from = +e.target.value; render(); };
  $('fTo').onchange = (e) => { state.to = +e.target.value; render(); };
}

// Шапка игрока: при выбранном руме — ник и объём этого рума, при Alias — общий ник и вся база
const ROOM_CODES = { GGPoker: 'GG', Winamax: 'WNX', PokerStars: 'PS', PokerDom: 'PDOM', WPN: 'WPN', iPoker: 'IPK', '888poker': '888', PartyPoker: 'PP' };
let ROOM_COUNTS = [];
const kFmt = (n) => (n >= 1000 ? Math.round(n / 1000) + 'k' : String(n));
function updatePlayer() {
  const alias = state.room == null;
  const roomName = alias ? null : DB.rooms[state.room];
  const nick = alias ? DB.hero : (DB.nicks ? Object.keys(DB.nicks).find(n => DB.nicks[n] === roomName) : null) || DB.hero;
  const count = alias ? DB.count : ROOM_COUNTS[state.room] || 0;
  $('roomBadge').textContent = alias ? 'ALIAS' : (ROOM_CODES[roomName] || roomName.slice(0, 4).toUpperCase());
  $('roomBadge').classList.toggle('room', !alias);
  $('nick').textContent = nick;
  $('handsCount').textContent = kFmt(count);
  $('handsCount').title = count.toLocaleString('ru-RU') + ' раздач' + (alias ? ' во всей базе' : ' в ' + roomName);
  $('nick').parentElement.title = alias && DB.nicks ? 'Alias объединяет ники: ' + Object.keys(DB.nicks).map(n => n + ' (' + DB.nicks[n] + ')').join(', ') : roomName ? 'Ник в ' + roomName : '';
}

function setDb(db) {
  DB = db;
  ROOM_COUNTS = db.rooms.map(() => 0);
  db.cols.room.forEach(r => { if (r >= 0) ROOM_COUNTS[r]++; });
  $('demoTag').hidden = !db.demo;
  Object.assign(state, { room: null, type: null, from: null, to: null });
  setupFilters();
  updatePlayer();
  render();
}

// ---------- загрузка базы ----------
const fmtBytes = (b) => b > 1e9 ? (b / 1e9).toFixed(1) + ' ГБ' : b > 1e6 ? (b / 1e6).toFixed(1) + ' МБ' : Math.round(b / 1e3) + ' КБ';
function showImport(r) {
  if (!r || r.canceled) return;
  $('impResult').hidden = false;
  $('impSummary').textContent = 'Найдено ' + r.files.toLocaleString('ru-RU') + ' файлов, ' + fmtBytes(r.bytes) + ', примерно ' + r.estHands.toLocaleString('ru-RU') + ' раздач. Источник: ' + r.source;
  const body = $('impRooms'); body.replaceChildren();
  Object.keys(r.rooms).forEach(room => {
    const tr = el('tr');
    tr.append(el('td', null, room), el('td', null, r.rooms[room].files.toLocaleString('ru-RU')), el('td', null, fmtBytes(r.rooms[room].bytes)));
    const st = el('td', 'wait', 'парсер в разработке'); tr.append(st); body.append(tr);
  });
  if (r.unknown) { const tr = el('tr'); tr.append(el('td', 'bad', 'Не распознано'), el('td', null, String(r.unknown)), el('td', null, '—'), el('td', 'muted', 'не похоже на историю раздач')); body.append(tr); }
  $('impNote').textContent = 'Сейчас программа определяет рум и объём. Импорт новых файлов прямо из программы включу в следующей версии. Сейчас открыта ваша база из архива: 122 592 раздачи.';
  $('doImport').disabled = true;
}

function setupImport() {
  const modal = $('importModal');
  const open = () => { modal.hidden = false; $('pickFolder').focus(); };
  const close = () => { modal.hidden = true; $('openImport').focus(); };
  $('openImport').onclick = open;
  $('closeImport').onclick = close;
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });
  $('pickFolder').onclick = async () => showImport(await mda.pick('folder'));
  $('pickFiles').onclick = async () => showImport(await mda.pick('files'));
  $('useDemo').onclick = async () => { setDb(await mda.demoDb()); close(); };
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', async (e) => { if (e.dataTransfer.files.length) showImport(await mda.dropped(e.dataTransfer.files)); });
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => e.preventDefault());
}

// хук для автоматических снимков экрана при сборке
window.__go = (tab, sub) => { $('importModal').hidden = true; state.tab = tab; if (sub) state.sub = sub; render(); };
window.__importDemo = () => { $('importModal').hidden = false; showImport({ source: 'D:\\HH\\Tournaments', files: 18432, bytes: 214e6, estHands: 142700, unknown: 3, rooms: { GGPoker: { files: 11204, bytes: 131e6 }, PokerStars: { files: 5120, bytes: 61e6 }, Winamax: { files: 2105, bytes: 22e6 } } }); };

document.addEventListener('DOMContentLoaded', async () => {
  setupImport();
  setDb(await mda.demoDb());
});
window.__pinNet = (i) => { const g = document.querySelectorAll('.net-bar')[i]; const r = g.getBoundingClientRect(); g.dispatchEvent(new MouseEvent('click', { clientX: r.left + r.width / 2, clientY: r.top + 40 })); };
window.__hoverNet = (i) => { const g = document.querySelectorAll('.net-bar')[i]; const r = g.getBoundingClientRect(); g.dispatchEvent(new MouseEvent('mouseenter', { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); };
window.__hoverMx = (k) => { const c = document.querySelectorAll('.mx .mx-c')[k]; c.scrollIntoView({ block: 'center' }); const r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('mouseenter', { clientX: r.left + 10, clientY: r.top + 10 })); };
