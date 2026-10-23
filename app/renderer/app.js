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
const uiState = { mxPos: 'EP', mxStk: '20–30', mxCustom: null };
const MX_STK = [['<12', '<12', [0, 12]], ['12–16', '12–16', [12, 16]], ['16–20', '16–20', [16, 20]], ['20–30', '20–30', [20, 30]], ['30–50', '30–50', [30, 50]], ['50+', '50+', [50, 1e9]]];
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
const RESP_COLS = ['var(--good)', 'var(--ice)', 'var(--bad)'];
function netChart(items, avg) {
  const W = 520, H = 204, P = { l: 34, r: 10, t: 22, b: 68 };
  const s = svgRoot(W, H, 'Результат открытий по позициям, BB за открытие, и ответ оппонентов');
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
    const yb = H - P.b;
    s.append(svgText(cx, yb + 16, it.p, 'middle', 'fill:var(--soft);font-weight:700'));
    s.append(svgText(cx, yb + 28, it.o.n ? it.o.n.toLocaleString('ru-RU') : '—', 'middle', 'font-size:10px;fill:var(--faint)'));
    // ответ оппонентов за спиной: доли «все сбросили / колл / рейз»
    const rs = it.r || [0, 0, 0], rt = rs[0] + rs[1] + rs[2];
    if (rt) {
      const sw = Math.min(70, bw * 0.84), sx = cx - sw / 2, sy = yb + 37, sh = 11;
      const gr = svgEl('g'); const tt = svgEl('title');
      tt.textContent = it.p + ', ответ оппонентов: все сбросили ' + fmtPct(rs[0] / rt) + '%, колл ' + fmtPct(rs[1] / rt) + '%, рейз ' + fmtPct(rs[2] / rt) + '% (' + rt + ' открытий)';
      gr.append(tt);
      RESP_COLS.forEach((col, k) => gr.append(svgText(cx + (k - 1) * 17, sy + 7, Math.round(rs[k] / rt * 100), 'middle', 'font-size:10px;font-weight:600;font-family:var(--mono);fill:' + col)));
      s.append(gr);
    }
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
  s.append(svgText(P.l - 6, H - P.b + 44, '%', 'end', 'font-size:10px;fill:var(--faint)'));
  const box = el('div', 'net-wrap'); box.append(s);
  const lg = el('div', 'resp-legend row net-lg'); lg.append(el('span', 'net-lg-t', 'цифры под позицией — первый ответ оппонентов за спиной, %:'));
  [['все сбросили', RESP_COLS[0]], ['колл', RESP_COLS[1]], ['рейз', RESP_COLS[2]]].forEach(([l, col]) => { const it = el('span'); const i = el('i'); i.style.background = col; it.append(i, document.createTextNode(l)); lg.append(it); });
  box.append(lg);
  return box;
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

// ---------- #3.4 — результат стила подробно ----------
// сгруппированные столбики CO/BTN со знаком (BB за открытие), клик по столбику — список раздач
function pairSigned(labels, a, b, title, onPick) {
  const W = 300, H = 150, P = { l: 6, r: 6, t: 18, b: 34 };
  const s = svgRoot(W, H, title);
  const vals = a.concat(b).filter(z => z && z.n).map(z => z.sum / 10 / z.n);
  const hi = Math.max(0.5, ...vals) * 1.2, lo = Math.min(0, ...vals) * 1.2;
  const y = (v) => P.t + (hi - v) / (hi - lo) * (H - P.t - P.b);
  const gw = (W - P.l - P.r) / labels.length, bw = Math.min(28, gw * 0.32);
  s.append(svgEl('line', { x1: P.l, x2: W - P.r, y1: y(0), y2: y(0) }, 'stroke:var(--line2);stroke-width:1'));
  labels.forEach((lab, i) => {
    const cx = P.l + i * gw + gw / 2;
    [[a[i], C_CO, -1, 'CO'], [b[i], C_BTN, 1, 'BTN']].forEach(([z, col, side, nm]) => {
      if (!z || !z.n) return;
      const v = z.sum / 10 / z.n;
      const x = cx + side * (bw / 2 + 1) - bw / 2, top = y(Math.max(v, 0)), bot = y(Math.min(v, 0));
      const g = svgEl('g', { class: 'pick', tabindex: '0', role: 'button', 'aria-label': nm + ', ' + lab + ': ' + signed(v, 2) + ' BB, ' + z.n + ' раздач — показать раздачи' });
      g.append(svgEl('rect', { x, y: top, width: bw, height: Math.max(1.5, bot - top), rx: 3 }, 'fill:' + col + (v < 0 ? ';opacity:.75' : '')));
      const t = svgEl('title'); t.textContent = nm + ', ' + lab + ': ' + signed(v, 2) + ' BB за открытие, ' + z.n + ' раздач. Нажмите, чтобы открыть раздачи'; g.append(t);
      const go = () => onPick(nm + ' · ' + title + ': ' + lab, z.ids);
      g.addEventListener('click', go); g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      s.append(g);
      s.append(svgText(x + bw / 2, v >= 0 ? top - 4 : bot + 11, signed(v, 1), 'middle', 'font-size:10px;fill:' + (v >= 0 ? 'var(--good)' : 'var(--bad)')));
    });
    s.append(svgText(cx, H - 18, lab, 'middle', 'font-size:10px;fill:var(--soft)'));
    const nA = a[i] && a[i].n || 0, nB = b[i] && b[i].n || 0;
    s.append(svgText(cx, H - 5, nA + ' / ' + nB, 'middle', 'font-size:9px;fill:var(--faint)'));
  });
  return s;
}

// накопленный результат стила по месяцам
function cumLine(co, btn) {
  const W = 300, H = 150, P = { l: 34, r: 8, t: 12, b: 22 };
  const s = svgRoot(W, H, 'Накопленный результат стила, BB');
  const months = [...new Set(Object.keys(co).concat(Object.keys(btn)).map(Number))].sort((x, z) => x - z);
  if (months.length < 2) { s.append(svgText(W / 2, H / 2, 'мало данных')); return s; }
  const acc = (src) => { let t = 0; return months.map(m => (t += (src[m] ? src[m].sum / 10 : 0))); };
  const A = acc(co), B = acc(btn), all = A.concat(B, [0]);
  const lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
  const y = (v) => P.t + (hi - v) / span * (H - P.t - P.b);
  const x = (i) => P.l + i * (W - P.l - P.r) / (months.length - 1);
  [lo, (lo + hi) / 2, hi].forEach(v => { s.append(svgEl('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v) }, 'stroke:var(--line);stroke-width:1')); s.append(svgText(P.l - 4, y(v) + 3, Math.round(v) + '', 'end', 'font-size:9px')); });
  [[A, C_CO, 'CO'], [B, C_BTN, 'BTN']].forEach(([arr, col, nm]) => {
    s.append(svgEl('polyline', { points: arr.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' '), fill: 'none' }, 'stroke:' + col + ';stroke-width:2.2;stroke-linejoin:round'));
    const last = arr.length - 1;
    s.append(svgEl('circle', { cx: x(last), cy: y(arr[last]), r: 3.5 }, 'fill:' + col));
    arr.forEach((v, i) => { const h = svgEl('circle', { cx: x(i), cy: y(v), r: 6 }, 'fill:transparent'); const t = svgEl('title'); t.textContent = nm + ', до ' + monthLabel(months[i]) + ': ' + signed(v, 0) + ' BB'; h.append(t); s.append(h); });
  });
  s.append(svgText(x(0), H - 5, monthLabel(months[0]), 'start', 'font-size:9px'));
  s.append(svgText(x(months.length - 1), H - 5, monthLabel(months[months.length - 1]), 'end', 'font-size:9px'));
  return s;
}

// группы рук: пары, бродвеи, тузы, коннекторы, гэпперы — для результата стила
const HAND_GROUPS = [
  ['Пары TT–AA'], ['Пары 66–99'], ['Пары 22–55'],
  ['Бродвеи одномастные'], ['Бродвеи разномастные'],
  ['A9s–A2s'], ['A9o–A2o'],
  ['Коннекторы одномастные'], ['Коннекторы разномастные'],
  ['Гэпперы одномастные'], ['Гэпперы разномастные'],
  ['Прочие одномастные'], ['Прочие разномастные']
];
function handGroup(k) {
  const i = Math.floor(k / 13), j = k % 13;
  if (i === j) return i <= 4 ? 0 : i <= 8 ? 1 : 2;
  const suited = i < j, hi = Math.min(i, j), lo = Math.max(i, j);
  if (lo <= 4) return suited ? 3 : 4;            // обе карты T и выше (включая AK–AT)
  if (hi === 0) return suited ? 5 : 6;           // туз с A9–A2
  const gap = lo - hi - 1;
  if (gap === 0) return suited ? 7 : 8;          // T9, 98 … 32
  if (gap === 1) return suited ? 9 : 10;         // T8, 97 … 42
  return suited ? 11 : 12;
}
// всплывающее окно над ячейкой 3.4: какие руки входят в группу и их результат с позиции
let groupTip = null;
function showGroupTip(pos, label, k, z, hands, e) {
  if (!groupTip) { groupTip = el('div', 'gt'); groupTip.setAttribute('role', 'tooltip'); document.body.append(groupTip); }
  groupTip.replaceChildren();
  const h = el('div', 'gt-h'); h.append(el('b', null, pos + ' · ' + label));
  if (z.n) h.append(el('span', z.sum >= 0 ? 'up' : 'down', signed(z.sum / 10 / z.n, 2) + ' BB · ' + z.n + ' раз'));
  groupTip.append(h);
  const R = 'AKQJT98765432', grid = el('div', 'gt-grid');
  const inG = []; for (let q = 0; q < 169; q++) if (handGroup(q) === k) inG.push(q);
  const scale = Math.max(1, ...inG.filter(q => hands[q].n >= 3).map(q => Math.abs(hands[q].sum / 10 / hands[q].n)));
  for (let i = 0; i < 13; i++) for (let j = 0; j < 13; j++) {
    const q = i * 13 + j, cell = el('div', 'gt-c');
    cell.append(el('span', 'h', i === j ? R[i] + R[j] : i < j ? R[i] + R[j] + 's' : R[j] + R[i] + 'o'));
    if (handGroup(q) !== k) cell.classList.add('out');
    else {
      const y = hands[q];
      if (y.n) {
        const v = y.sum / 10 / y.n, t = Math.min(1, Math.abs(v) / scale);
        cell.style.background = 'rgba(' + (v >= 0 ? 'var(--good-rgb)' : 'var(--bad-rgb)') + ',' + (0.25 + 0.65 * t).toFixed(2) + ')';
        cell.append(el('span', 'v', (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1)));
        if (y.n < 5) cell.classList.add('low');
      } else cell.classList.add('none');
    }
    grid.append(cell);
  }
  groupTip.append(grid, el('div', 'gt-f', 'Выделены руки группы; в клетке — результат руки с ' + pos + ' в BB. Серые — руки группы, которыми не открывались. Клик — закрепить окно и открыть раздачи.'));
  groupTip.hidden = false; moveGroupTip(e);
}
function moveGroupTip(e) {
  if (!groupTip || groupTip.hidden) return;
  const w = groupTip.offsetWidth, h = groupTip.offsetHeight;
  let x = e.clientX + 16, y = e.clientY - h / 2;
  if (x + w > window.innerWidth - 8) x = e.clientX - w - 16;
  y = Math.max(8, Math.min(y, window.innerHeight - h - 8));
  groupTip.style.left = x + 'px'; groupTip.style.top = y + 'px';
}
function hideGroupTip() { if (groupTip) groupTip.hidden = true; }

function handGroupTable(o) {
  const c = DB.cols;
  const agg = (ids) => { const g = HAND_GROUPS.map(() => ({ sum: 0, n: 0 })), h = Array.from({ length: 169 }, () => ({ sum: 0, n: 0 })); let skipped = 0; ids.forEach(i => { if (c.hc[i] < 0) { skipped++; return; } const z = g[handGroup(c.hc[i])]; z.sum += c.net[i]; z.n++; const y = h[c.hc[i]]; y.sum += c.net[i]; y.n++; }); return { g, h, skipped }; };
  const A = agg(o.CO.nr.all.ids), B = agg(o.BTN.nr.all.ids);
  const vals = A.g.concat(B.g).filter(z => z.n >= 5).map(z => Math.abs(z.sum / 10 / z.n));
  const max = Math.max(0.5, ...vals);
  const box = el('div', 'hg');
  const hd = el('div', 'hg-row hg-head'); hd.append(el('span', null, 'Группа рук'), el('span', null, 'CO'), el('span', null, 'BTN')); box.append(hd);
  HAND_GROUPS.forEach(([lab], k) => {
    const r = el('div', 'hg-row'); r.append(el('span', 'hg-l', lab));
    [[A.g[k], C_CO, 'CO', A.h, o.CO.nr.all.ids], [B.g[k], C_BTN, 'BTN', B.h, o.BTN.nr.all.ids]].forEach(([z, col, nm, hands, ids]) => {
      const cell = el('div', 'hg-c');
      if (z.n) { cell.classList.add('click'); cell.tabIndex = 0; cell.setAttribute('role', 'button'); cell.setAttribute('aria-label', nm + ', ' + lab + ': показать руки и раздачи');
        const pin = (e) => { hideGroupTip(); pinHandPop({ p: nm, key: 'grp' + nm + k, title: nm + ' · ' + lab, o: z, mx: hands, ids, only: (q) => handGroup(q) === k }, z.sum / 10 / z.n, e, cell); };
        cell.addEventListener('click', pin); cell.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pin(null); } }); }
      cell.addEventListener('mouseenter', (e) => showGroupTip(nm, lab, k, z, hands, e)); cell.addEventListener('mousemove', moveGroupTip); cell.addEventListener('mouseleave', hideGroupTip);
      if (!z.n) { cell.append(el('span', 'hg-na', '—')); r.append(cell); return; }
      const v = z.sum / 10 / z.n;
      const tr = el('div', 'hg-track'); const f = el('div', 'hg-fill'); const w = Math.min(50, Math.abs(v) / max * 50);
      f.style.width = w + '%'; f.style.left = v >= 0 ? '50%' : (50 - w) + '%'; f.style.background = col; if (v < 0) f.style.opacity = '.7';
      tr.append(el('i', 'hg-zero'), f);
      const t = el('span', 'hg-v ' + (v >= 0 ? 'up' : 'down'), signed(v, 2)); const n = el('span', 'hg-n', String(z.n));
      cell.append(tr, t, n); if (z.n < 30) cell.classList.add('low');
      r.append(cell);
    });
    box.append(r);
  });
  return box;
}

function stealResultCard(o) {
  const m = el('div', 'sm res34');
  const h = el('div', 'sm-h'); h.append(el('span', 'num-tag sm-tag', '#3.4'), el('b', null, 'Результат стила'));
  m.append(h, el('span', 'sm-s', 'BB за открытие: всего и по группам рук'));
  const lg = el('div', 'resp-legend row sm-lg'); [['CO', C_CO], ['BTN', C_BTN]].forEach(([lab, col]) => { const it = el('span'); const i = el('i'); i.style.background = col; it.append(i, document.createTextNode(lab)); lg.append(it); }); m.append(lg);
  // крупные цифры
  const top = el('div', 'r34-top');
  [['CO', o.CO.nr.all, C_CO], ['BTN', o.BTN.nr.all, C_BTN]].forEach(([nm, z, col]) => {
    const v = z.n ? z.sum / 10 / z.n : null;
    const b = el('div', 'r34-big'); b.style.borderColor = col;
    b.append(el('span', 'nm', nm), el('b', v == null ? '' : v >= 0 ? 'up' : 'down', signed(v, 2)), el('span', 's', 'BB за открытие · ' + z.n.toLocaleString('ru-RU') + ' раз · всего ' + signed(z.sum / 10, 0) + ' BB'));
    top.append(b);
  });
  m.append(top);
  m.append(handGroupTable(o));
  const grid = el('div', 'r34-grid');
  const pick = (title, ids) => openIdsList(title, ids);
  const sub = (tag, title, node) => { const d = el('div', 'r34-m'); const hh = el('div', 'sm-h'); hh.append(el('span', 'num-tag sm-tag', '#' + tag), el('b', null, title)); d.append(hh, node); return d; };
  const rooms = [...new Set(Object.keys(o.CO.nr.room).concat(Object.keys(o.BTN.nr.room)))].map(Number).sort((a, b) => a - b);
  return m;
}

// 3.5 — самые частые сайзинги открытия и как они работают
let SZ_SIDE = 'both';
function sizingCard(o) {
  const m = el('div', 'sm sz5');
  const h = el('div', 'sm-h'); h.append(el('span', 'num-tag sm-tag', '#3.5'), el('b', null, 'Сайзинг стила'));
  m.append(h, el('span', 'sm-s', 'самые частые размеры открытия, когда за спиной остаётся стек (без олл-инов)'));
  const seg = el('div', 'seg sz5-seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Позиция');
  const body = el('div', 'sz5-body');
  [['both', 'CO + BTN'], ['CO', 'CO'], ['BTN', 'BTN']].forEach(([k, t]) => {
    const b = el('button', null, t); b.type = 'button'; b.setAttribute('aria-pressed', String(SZ_SIDE === k)); b.classList.toggle('on', SZ_SIDE === k);
    b.onclick = () => { SZ_SIDE = k; seg.querySelectorAll('button').forEach(x => { x.setAttribute('aria-pressed', String(x === b)); x.classList.toggle('on', x === b); }); draw(); };
    seg.append(b);
  });
  m.append(seg, body);
  function merged() {
    const src = SZ_SIDE === 'both' ? [o.CO.szx, o.BTN.szx] : [o[SZ_SIDE].szx], out = {};
    src.forEach(map => Object.entries(map).forEach(([k, z]) => {
      const t = out[k] || (out[k] = { n: 0, r: [0, 0, 0], rn: 0, sum: 0, sn: 0, ids: [] });
      t.n += z.n; t.rn += z.rn; t.sum += z.sum; t.sn += z.sn; z.r.forEach((v, j) => { t.r[j] += v; }); t.ids = t.ids.concat(z.ids);
    }));
    return out;
  }
  function draw() {
    const map = merged(); delete map.AI; const tot = Object.values(map).reduce((a, z) => a + z.n, 0);
    body.replaceChildren();
    if (!tot) { body.append(el('p', 'muted small', 'Нет открытий в выборке.')); return; }
    const rows = [], other = { n: 0, r: [0, 0, 0], rn: 0, sum: 0, sn: 0, ids: [] };
    Object.entries(map).filter(([k]) => k !== 'AI').sort((a, b) => b[1].n - a[1].n).forEach(([k, z], j) => {
      if (j < 4 && z.n / tot >= 0.01) rows.push([k.replace('.', ',') + ' BB', z, 'рейз ' + k.replace('.', ',') + ' BB']);
      else { other.n += z.n; other.rn += z.rn; other.sum += z.sum; other.sn += z.sn; z.r.forEach((v, q) => { other.r[q] += v; }); other.ids = other.ids.concat(z.ids); }
    });
    if (other.n) rows.push(['другие', other, 'другие размеры рейза']);
    const t = el('div', 'sz5-t');
    const hd = el('div', 'sz5-r sz5-h'); ['Размер', 'Доля', 'Сбросили', '3-бет', 'BB'].forEach(x => hd.append(el('span', null, x))); t.append(hd);
    const side = SZ_SIDE === 'both' ? 'CO + BTN' : SZ_SIDE;
    rows.forEach(([lab, z, full]) => {
      const r = el('div', 'sz5-r');
      const share = z.n / tot, fold = z.rn ? z.r[0] / z.rn : null, rr = z.rn ? z.r[2] / z.rn : null, bb = z.sn ? z.sum / 10 / z.sn : null;
      const sh = el('span', 'sz5-sh', fmtPct(share) + '%');
      r.append(el('b', null, lab), sh,
        el('span', 'sz5-v', fold == null ? '—' : fmtPct(fold) + '%'),
        el('span', 'sz5-v', rr == null ? '—' : fmtPct(rr) + '%'),
        el('span', 'sz5-v ' + (bb == null ? '' : bb >= 0 ? 'up' : 'down'), bb == null ? '—' : signed(bb, 2)));
      const tk = el('span', 'sz5-tk'); const tr = el('i'); tr.style.width = Math.max(1, share * 100) + '%'; if (SZ_SIDE === 'BTN') tr.style.background = C_BTN; tk.append(tr);
      r.append(el('small', null, z.n.toLocaleString('ru-RU') + ' раз'), tk);
      if (z.n < 30) r.classList.add('low');
      t.append(r);
    });
    body.append(t, el('p', 'sz5-note', 'Сбросили — все за вами сфолдили. 3-бет — первый ответ рейзом. BB — средний итог раздачи.'));
  }
  draw();
  return m;
}

// ---------- 3.7: стил против разных стеков SB и BB — три варианта показа ----------
const BX_NAMES = ['короткий', 'средний', 'глубокий'];
const bxSum = (cells) => cells.reduce((t, z) => { for (const k in t) t[k] += z[k]; return t; }, { n: 0, x: 0, rn: 0, fold: 0, rr: 0, sum: 0, sn: 0 });
const bxCell = (o, side, i, j) => (side === 'both' ? bxSum([o.CO.bx[i][j], o.BTN.bx[i][j]]) : o[side].bx[i][j]);
const BX_MET = {
  fold: { t: 'Фолд оппонентов', v: (z) => (z.rn ? z.fold / z.rn : null), f: (v) => fmtPct(v) + '%', n: (z) => z.rn },
  bb: { t: 'BB за открытие', v: (z) => (z.sn ? z.sum / 10 / z.sn : null), f: (v) => signed(v, 2), n: (z) => z.sn },
  freq: { t: 'Частота открытия', v: (z) => (z.n ? z.x / z.n : null), f: (v) => fmtPct(v) + '%', n: (z) => z.n },
};
function segBtns(opts, cur, on) {
  const seg = el('div', 'seg bx-seg');
  opts.forEach(([k, t]) => { const b = el('button', null, t); b.type = 'button'; b.classList.toggle('on', k === cur); b.setAttribute('aria-pressed', String(k === cur)); b.onclick = () => { seg.querySelectorAll('button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); }); on(k); }; seg.append(b); });
  return seg;
}
function bxHead(tag, title, sub) {
  const m = el('div', 'sm bx');
  const h = el('div', 'sm-h'); h.append(el('span', 'num-tag sm-tag', '#' + tag), el('b', null, title));
  m.append(h, el('span', 'sm-s', sub));
  return m;
}
const BX_STK_TXT = 'короткий <15 BB, средний 15–35, глубокий 35+';

// 3.7.1 — тепловая карта 3×3: строки — стек SB, колонки — стек BB
let BX1 = { side: 'CO', met: 'fold' };
function bxHeat(o) {
  const m = bxHead('3.7.1', 'Вариант 1 · Карта стеков блайндов', 'строки — стек SB, колонки — стек BB; ' + BX_STK_TXT);
  const ctl = el('div', 'bx-ctl'), body = el('div');
  ctl.append(segBtns([['CO', 'CO'], ['BTN', 'BTN']], BX1.side, (k) => { BX1.side = k; draw(); }),
    segBtns([['fold', 'Фолд оппонентов, %'], ['bb', 'Винрейт, BB'], ['freq', 'Частота открытия, %']], BX1.met, (k) => { BX1.met = k; draw(); }));
  m.append(ctl, body);
  function draw() {
    const M = BX_MET[BX1.met], g = el('div', 'bx-grid');
    g.append(el('span', 'bx-corner', 'SB ↓ · BB →'));
    BX_NAMES.forEach((n, j) => g.append(el('span', 'bx-ch', n + '\n' + o.BX[j])));
    const all = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const v = M.v(bxCell(o, BX1.side, i, j)); if (v != null) all.push(v); }
    const lo = Math.min(...all), hi = Math.max(...all);
    for (let i = 0; i < 3; i++) {
      g.append(el('span', 'bx-rh', BX_NAMES[i] + '\n' + o.BX[i]));
      for (let j = 0; j < 3; j++) {
        const z = bxCell(o, BX1.side, i, j), v = M.v(z), n = M.n(z), c = el('div', 'bx-c');
        if (v == null) { c.classList.add('na'); c.append(el('b', null, '—')); }
        else {
          let bg;
          if (BX1.met === 'bb') { const t = Math.min(1, Math.abs(v) / Math.max(0.5, Math.abs(lo), Math.abs(hi))); bg = 'rgba(' + (v >= 0 ? 'var(--good-rgb)' : 'var(--bad-rgb)') + ',' + (0.15 + 0.6 * t).toFixed(2) + ')'; }
          else { const t = hi > lo ? (v - lo) / (hi - lo) : 0.5; bg = 'rgba(242,181,68,' + (0.1 + 0.55 * t).toFixed(2) + ')'; }
          c.style.background = bg; c.append(el('b', null, M.f(v)), el('small', null, n.toLocaleString('ru-RU') + ' раз'));
          if (n < 30) c.classList.add('low');
          c.title = 'SB ' + BX_NAMES[i] + ', BB ' + BX_NAMES[j] + ': ' + M.t.toLowerCase() + ' ' + M.f(v) + ', ' + n + ' раз';
        }
        g.append(c);
      }
    }
    body.replaceChildren(g);
  }
  draw();
  return m;
}

// 3.7.2 — все 9 сочетаний, отсортированные по результату
let BX2 = 'bb';
function bxList(o) {
  const m = bxHead('3.7', 'Стил против стеков блайндов', 'результат стила с CO и BTN при разных стеках SB и BB, от лучшего сочетания к худшему; ' + BX_STK_TXT);
  const body = el('div');
  m.append(segBtns([['bb', 'Винрейт за открытие, BB'], ['fold', 'Фолд обоих блайндов, %']], BX2, (k) => { BX2 = k; draw(); }), body);
  function draw() {
    const M = BX_MET[BX2], rows = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) rows.push({ i, j, a: o.CO.bx[i][j], b: o.BTN.bx[i][j], t: M.v(bxSum([o.CO.bx[i][j], o.BTN.bx[i][j]])) });
    rows.sort((x, y) => (y.t ?? -1e9) - (x.t ?? -1e9));
    const max = Math.max(0.01, ...rows.flatMap(r => [M.v(r.a), M.v(r.b)]).filter(v => v != null).map(Math.abs));
    const t = el('div', 'bx-list');
    const hd = el('div', 'bx-lr bx-lh'); hd.append(el('span', null, 'SB · BB'), el('span', null, 'CO'), el('span', null, 'BTN')); t.append(hd);
    rows.forEach(r => {
      const row = el('div', 'bx-lr');
      row.append(el('span', 'bx-ll', 'SB ' + BX_NAMES[r.i] + ' · BB ' + BX_NAMES[r.j]));
      [[r.a, C_CO], [r.b, C_BTN]].forEach(([z, col]) => {
        const v = M.v(z), n = M.n(z), cell = el('div', 'hg-c');
        const tr = el('div', 'hg-track'), f = el('div', 'hg-fill');
        if (BX2 === 'bb') { tr.append(el('div', 'hg-zero')); const w = v == null ? 0 : Math.abs(v) / max * 50; f.style.width = w + '%'; f.style.left = v >= 0 ? '50%' : (50 - w) + '%'; }
        else { f.style.left = '0'; f.style.width = (v == null ? 0 : v / max * 100) + '%'; }
        f.style.background = col; tr.append(f);
        cell.append(tr, el('span', 'hg-v ' + (BX2 === 'bb' && v != null ? (v >= 0 ? 'up' : 'down') : ''), v == null ? '—' : M.f(v)), el('span', 'hg-n', n ? String(n) : ''));
        if (n < 30) cell.classList.add('low');
        row.append(cell);
      });
      t.append(row);
    });
    body.replaceChildren(t);
  }
  draw();
  return m;
}

// 3.7.3 — пять ситуаций: оба короткие / средние / глубокие, SB глубже BB, BB глубже SB
function bxRel(o) {
  const m = bxHead('3.7.3', 'Вариант 3 · Ситуации у блайндов', 'как стеки SB и BB соотносятся между собой; ' + BX_STK_TXT);
  const groups = [['Оба короткие', [[0, 0]]], ['Оба средние', [[1, 1]]], ['Оба глубокие', [[2, 2]]],
    ['SB глубже BB', [[1, 0], [2, 0], [2, 1]]], ['BB глубже SB', [[0, 1], [0, 2], [1, 2]]]];
  const t = el('div', 'bx-rel');
  const hd = el('div', 'bx-rr bx-lh'); ['', 'Сбросили', '', 'BB'].forEach(x => hd.append(el('span', null, x))); t.append(hd);
  groups.forEach(([lab, cells]) => {
    const g = el('div', 'bx-rg'); g.append(el('b', 'bx-rl', lab));
    [['CO', C_CO], ['BTN', C_BTN]].forEach(([side, col]) => {
      const z = bxSum(cells.map(([i, j]) => o[side].bx[i][j]));
      const fold = BX_MET.fold.v(z), bb = BX_MET.bb.v(z);
      const r = el('div', 'bx-rr'); if (z.sn < 30) r.classList.add('low');
      const tag = el('span', 'bx-tag', side); tag.style.color = col;
      const bar = el('div', 'mb-track'); const f = el('div', 'mb-fill'); f.style.width = (fold == null ? 0 : fold * 100) + '%'; f.style.background = col; bar.append(f);
      r.append(tag, bar, el('span', 'sz5-v', fold == null ? '—' : fmtPct(fold) + '%'), el('span', 'sz5-v ' + (bb == null ? '' : bb >= 0 ? 'up' : 'down'), bb == null ? '—' : signed(bb, 2)));
      r.title = side + ', ' + lab + ': ' + z.sn + ' открытий';
      g.append(r);
    });
    t.append(g);
  });
  m.append(t, el('p', 'sz5-note', 'Сбросили — оба блайнда сфолдили на ваш стил. BB — средний итог открытия. Бледные строки — меньше 30 раздач.'));
  return m;
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
  grid.append(stealResultCard(o));
  grid.append(sizingCard(o));
  const l2 = bxList(o); l2.classList.add('span2');
  grid.append(l2);
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

// всплывающее окно над клеткой 4.1: диапазон пуша — какие руки и как часто вы пушили
let pushTip = null;
function showPushTip(lab, z, f, w, e) {
  if (!pushTip) { pushTip = el('div', 'gt'); pushTip.setAttribute('role', 'tooltip'); document.body.append(pushTip); }
  pushTip.replaceChildren();
  const h = el('div', 'gt-h'); h.append(el('b', null, lab));
  h.append(el('span', null, 'пуш ' + fmtPct(f) + '% · ' + z.x + ' из ' + z.o + (w == null ? '' : ' · ' + signed(w, 2) + ' BB за пуш')));
  pushTip.append(h);
  const R = 'AKQJT98765432', grid = el('div', 'gt-grid');
  let any = 0, scale = 1;
  if (z.hx) for (let q = 0; q < 169; q++) if (z.hx[q] >= 2) scale = Math.max(scale, Math.abs(z.hs[q] / 10 / z.hx[q]));
  for (let i = 0; i < 13; i++) for (let j = 0; j < 13; j++) {
    const q = i * 13 + j, cell = el('div', 'gt-c');
    cell.append(el('span', 'h', i === j ? R[i] + R[j] : i < j ? R[i] + R[j] + 's' : R[j] + R[i] + 'o'));
    const o = z.ho ? z.ho[q] : 0, x = z.hx ? z.hx[q] : 0;
    if (!o) cell.classList.add('out');
    else if (!x) cell.classList.add('px0');
    else {
      any++; const r = z.hs[q] / 10 / x, t = Math.min(1, Math.abs(r) / scale);
      cell.style.background = 'rgba(' + (r >= 0 ? 'var(--good-rgb)' : 'var(--bad-rgb)') + ',' + (0.3 + 0.6 * t).toFixed(2) + ')';
      cell.classList.add('px'); cell.append(el('span', 'v', (r >= 0 ? '+' : '−') + Math.abs(r).toFixed(1)));
      if (x < 2) cell.classList.add('low');
    }
    grid.append(cell);
  }
  pushTip.append(grid, el('div', 'gt-f', any ? 'Зелёные — руки, которые в сумме принесли плюс, красные — минус; в клетке средний итог пуша этой рукой в BB. Бледные — один пуш. Тёмные — руки, которыми не пушили; пустые — не приходили. Без PokerDom: там нет карт героя.' : 'Нет пушей с известными картами в этой клетке.'));
  pushTip.hidden = false; movePushTip(e);
}
function movePushTip(e) {
  if (!pushTip || pushTip.hidden) return;
  const w = pushTip.offsetWidth, h = pushTip.offsetHeight;
  let x = e.clientX + 16, y = e.clientY - h / 2;
  if (x + w > window.innerWidth - 8) x = e.clientX - w - 16;
  y = Math.max(8, Math.min(y, window.innerHeight - h - 8));
  pushTip.style.left = x + 'px'; pushTip.style.top = y + 'px';
}
function hidePushTip() { if (pushTip) pushTip.hidden = true; }

// ---------- #4+ — пуши подробно ----------
function renderShovePanel(idx, stackBars) {
  const c = DB.cols, P = ['EP', 'MP', 'HJ', 'CO', 'BTN', 'SB'];
  const pos = P.map(() => ({ x: 0, n: 0 })), netPos = P.map(() => ({ sum: 0, n: 0 })), resp = [0, 0, 0], net = { sum: 0, n: 0 }, netStk = [[], [], [], [], [], []].map(() => ({ sum: 0, n: 0 }));
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
    if (c.net) { net.sum += c.net[i]; net.n++; netPos[p].sum += c.net[i]; netPos[p].n++; if (k >= 0) { netStk[k].sum += c.net[i]; netStk[k].n++; } }
  }
  const card = el('div', 'insight steal-panel pm-card');
  card.append(numTag('4+'));
  const m = card;
  m.append(el('b', 'pm-title', 'Где и как вы пушите'), el('span', 'sm-s', 'first-in пуш (до вас все сбросили): частота и винрейт по каждой позиции и стеку; в среднем ' + signed(net.n ? net.sum / 10 / net.n : null, 2) + ' BB за пуш, ' + net.n.toLocaleString('ru-RU') + ' пушей'));
  // матрица: строки — стек, колонки — позиции; в клетке частота пуша и винрейт за пуш
  const cell = () => ({ o: 0, x: 0, sum: 0, n: 0, ho: null, hx: null, ids: [], mx: null });
  const M = SB.map(() => P.map(cell)), rowT = SB.map(cell), colT = P.map(cell), allT = cell();
  for (const i of idx) {
    const p = c.pos[i]; if (c.sit[i] !== 0 || p > 5) continue;
    const bb = c.bb[i] / 10, k = SB.findIndex(z => bb >= z[1] && bb < z[2]); if (k < 0) continue;
    const push = c.act[i] === 3;
    [M[k][p], rowT[k], colT[p], allT].forEach(z => { z.o++; if (push) { z.x++; if (c.net) { z.sum += c.net[i]; z.n++; } } });
    const hc = c.hc ? c.hc[i] : -1;
    if (hc >= 0) { const z = M[k][p]; if (!z.ho) { z.ho = new Uint32Array(169); z.hx = new Uint32Array(169); z.hs = new Float64Array(169); } z.ho[hc]++; if (push) { z.hx[hc]++; if (c.net) z.hs[hc] += c.net[i]; } }
    if (push) { const z = M[k][p]; z.ids.push(i); if (hc >= 0) { if (!z.mx) z.mx = Array.from({ length: 169 }, () => ({ n: 0, sum: 0 })); z.mx[hc].n++; if (c.net) z.mx[hc].sum += c.net[i]; } }
  }
  const tb = el('div', 'pmx');
  const corner = el('span', 'pmx-corner', 'стек, BB'); tb.append(corner);
  P.forEach(nm => tb.append(el('span', 'pmx-ch', nm)));
  const maxF = Math.max(0.01, ...M.flat().filter(z => z.x >= 5).map(z => z.x / z.o));
  const put = (z, lab, tot) => {
    const d = el('div', 'pmx-c' + (tot ? ' tot' : ''));
    if (!z.o) { d.classList.add('na'); d.append(el('b', null, '—')); return d; }
    const f = z.x / z.o, w = z.n ? z.sum / 10 / z.n : null;
    d.style.setProperty('--f', Math.min(1, f / maxF).toFixed(3));
    d.append(el('b', null, fmtPct(f) + '%'), el('span', 'pmx-w ' + (w == null ? '' : w >= 0 ? 'up' : 'down'), w == null ? '—' : signed(w, 2)));
    if (z.n < 10) d.classList.add('low');
    if (z.mx) {
      const mxN = z.mx.reduce((a, q) => a + q.n, 0), mxS = z.mx.reduce((a, q) => a + q.sum, 0);
      const it = { p: lab.split(',')[0], key: 'push ' + lab, title: lab + ' · пуш ' + fmtPct(f) + '%', o: { n: mxN, sum: mxS }, mx: z.mx, ids: z.ids, vlab: ' BB за пуш', nlab: ' пушей с картами' };
      const v = mxN ? mxS / 10 / mxN : 0;
      d.tabIndex = 0; d.setAttribute('role', 'button'); d.setAttribute('aria-label', lab + ': показать руки и раздачи'); d.classList.add('click');
      const show = (ev) => showHandPop(it, v, ev, d);
      d.addEventListener('mouseenter', show); d.addEventListener('mousemove', show); d.addEventListener('mouseleave', hideHandPop);
      d.addEventListener('click', (ev) => pinHandPop(it, v, ev, d));
      d.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pinHandPop(it, v, null, d); } });
    }
    return d;
  };
  SB.forEach((z0, k) => {
    tb.append(el('span', 'pmx-rh', z0[0]));
    P.forEach((nm, p) => tb.append(put(M[k][p], nm + ', ' + z0[0] + ' BB')));
  });
  m.append(tb, el('p', 'sz5-note', 'В клетке: сверху — частота пуша (как часто вы идёте олл-ин от всех возможностей открыться), снизу — винрейт за пуш в BB. Чем ярче клетка, тем чаще пуш. Бледные клетки — меньше 10 пушей. Наведите на клетку — покажутся руки, которыми вы пушили, и их итог; клик закрепит окно, а клик по руке откроет раздачи и реплеер. Без PokerDom: там нет карт героя.'));
  return card;
}

// ---------- #5 / #5+ — изоляция лимперов ----------
const ISO_POS = ['MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
function isoData(idx) {
  const c = DB.cols, cell = () => ({ o: 0, x: 0, sum: 0, n: 0, f: 0, fn: 0, ids: [], mx: null });
  const M = [ISO_POS.map(cell), ISO_POS.map(cell)], tot = [cell(), cell()], resp = [0, 0, 0];
  for (const i of idx) {
    const p = c.pos[i]; if (c.sit[i] !== 1 || p < 1) continue;
    const r = c.lim[i] === 1 ? 0 : 1, z = M[r][p - 1], t = tot[r];
    const bvb = c.bvb ? c.bvb[i] === 1 : false, raised = c.act[i] >= 2;
    t.o++; if (raised) t.x++;
    if (!bvb) { z.o++; if (raised) z.x++; } // в колонке BB — без блайнда против блайнда, как в HUD
    if (!raised) continue;
    if (c.orsp && c.orsp[i] >= 0) resp[c.orsp[i]]++;
    if (c.fvr && c.fvr[i] >= 0) { z.fn++; if (c.fvr[i] === 1) z.f++; }
    if (c.net) { z.sum += c.net[i]; z.n++; }
    z.ids.push(i);
    const hc = c.hc ? c.hc[i] : -1;
    if (hc >= 0) { if (!z.mx) z.mx = Array.from({ length: 169 }, () => ({ n: 0, sum: 0 })); z.mx[hc].n++; if (c.net) z.mx[hc].sum += c.net[i]; }
  }
  return { M, tot, resp };
}

function isoCard(d) {
  const all = { x: d.tot[0].x + d.tot[1].x, n: d.tot[0].o + d.tot[1].o };
  return card(5, 'Изолейт лимперов', '<em>' + pctTxt(all) + '</em>', 'vs 1 лимпер ' + pctTxt({ x: d.tot[0].x, n: d.tot[0].o }) + ' · vs 2+ ' + pctTxt({ x: d.tot[1].x, n: d.tot[1].o }),
    respTiles(d.resp, 'Ответ оппонентов на ваш изолейт'));
}

function isoPanel(d) {
  const card = el('div', 'insight steal-panel pm-card');
  card.append(numTag('5+'));
  const nAll = d.M.flat().reduce((a, z) => a + z.n, 0), sAll = d.M.flat().reduce((a, z) => a + z.sum, 0);
  card.append(el('b', 'pm-title', 'Изолейт по позициям'), el('span', 'sm-s', 'ваш рейз поверх лимпа: частота, винрейт и фолд на лимп-рейз; в среднем ' + signed(nAll ? sAll / 10 / nAll : null, 2) + ' BB за изолейт, ' + nAll.toLocaleString('ru-RU') + ' изолейтов'));
  const tb = el('div', 'pmx iso');
  tb.append(el('span', 'pmx-corner', 'лимперов'));
  ISO_POS.forEach(nm => tb.append(el('span', 'pmx-ch', nm)));
  const maxF = Math.max(0.01, ...d.M.flat().filter(z => z.o >= 20).map(z => z.x / z.o));
  [['1', 0], ['2+', 1]].forEach(([lab, r]) => {
    tb.append(el('span', 'pmx-rh', lab));
    ISO_POS.forEach((nm, p) => {
      const z = d.M[r][p], c = el('div', 'pmx-c');
      if (!z.o) { c.classList.add('na'); c.append(el('b', null, '—')); tb.append(c); return; }
      const f = z.x / z.o, w = z.n ? z.sum / 10 / z.n : null;
      c.style.setProperty('--f', Math.min(1, f / maxF).toFixed(3));
      c.style.background = 'rgba(var(--amber-rgb),calc(.05 + var(--f) * .45))';
      c.append(el('b', null, fmtPct(f) + '%'), el('span', 'pmx-w ' + (w == null ? '' : w >= 0 ? 'up' : 'down'), w == null ? '—' : signed(w, 2)));
      if (z.fn) c.append(el('span', 'pmx-fv', 'фолд ' + fmtPct(z.f / z.fn) + '%'));
      if (z.o < 20) c.classList.add('low');
      const title = nm + ', vs ' + lab + ' лимпер' + (r ? 'а' : '');
      if (z.mx) {
        const n = z.mx.reduce((a, q) => a + q.n, 0), s = z.mx.reduce((a, q) => a + q.sum, 0);
        const it = { p: nm, key: 'iso ' + title, title: title + ' · изолейт ' + fmtPct(f) + '%', o: { n, sum: s }, mx: z.mx, ids: z.ids, sit: 1, vlab: ' BB за изолейт', nlab: ' изолейтов с картами' };
        const v = n ? s / 10 / n : 0;
        c.tabIndex = 0; c.setAttribute('role', 'button'); c.setAttribute('aria-label', title + ': показать руки и раздачи'); c.classList.add('click');
        const show = (ev) => showHandPop(it, v, ev, c);
        c.addEventListener('mouseenter', show); c.addEventListener('mousemove', show); c.addEventListener('mouseleave', hideHandPop);
        c.addEventListener('click', (ev) => pinHandPop(it, v, ev, c));
        c.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pinHandPop(it, v, null, c); } });
      }
      tb.append(c);
    });
  });
  card.append(tb, el('p', 'sz5-note', 'В клетке: частота изолейта (как часто вы рейзите, когда перед вами лимпили), винрейт за изолейт в BB и ваш фолд, когда лимпер ререйзит. В колонке BB — без ситуаций блайнд против блайнда. Чем ярче клетка, тем чаще изолейт; бледные — меньше 20 возможностей. Наведите на клетку — покажутся руки, клик закрепит окно, клик по руке откроет раздачи и реплеер.'));
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
  const c8 = card(8, 'Результат открытий', '<span class="' + (nb >= 0 ? 'up' : 'down') + '">' + signed(nb == null ? null : nb / 100, 2) + '</span> <small>BB за открытие</small>', 'фактический итог раздачи после вашего открытия по позициям; пунктир — среднее; под позицией — число открытий', netChart((LAST_NET_ITEMS = ['EP', 'MP', 'HJ', 'CO', 'BTN', 'SB'].map(p => ({ p, o: x.openNetPos[p], mx: x.netMx[p], r: x.respPos[p] }))), nb == null ? null : nb / 100));
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
  const presp = [0, 0];
  { const c = DB.cols; if (c.orsp) for (const i of idx) if (c.sit[i] === 0 && c.pos[i] <= 5 && c.act[i] === 3 && c.orsp[i] >= 0) presp[c.orsp[i] === 0 ? 0 : 1]++; }
  cards.append(card(4, 'Доля пушей среди открытий', '<em>' + pctTxt(x.shove) + '</em>', x.shove.x.toLocaleString('ru-RU') + ' пушей из ' + x.shove.n.toLocaleString('ru-RU') + ' открытий',
    respTiles(presp, 'Ответ оппонентов на ваш пуш', [['все сбросили', 'var(--good)'], ['колл', 'var(--ice)']])));
  const shovePanel = renderShovePanel(idx, st);


  const dall2 = dall;
  // раскладка по строкам: карточка слева, её инфографика справа
  const byTag = {}; [...cards.children].forEach(n => { byTag[n.querySelector('.num-tag').textContent] = n; });
  byTag['#3+'] = renderStealPanel(idx); byTag['#4+'] = shovePanel;
  const isoD = isoData(idx); byTag['#5'] = isoCard(isoD); byTag['#5+'] = isoPanel(isoD);
  const row = (l, r) => { const d = el('div', 'sum-pair'); d.append(byTag[l], byTag[r]); return d; };
  // строка #3: карточка #3 и окна 3.4–3.8 одного размера в общей сетке
  const stealRow = el('div', 'steal-row'); stealRow.append(byTag['#3']);
  [...byTag['#3+'].querySelectorAll(':scope > .sm')].forEach(m => { if (m.querySelector('.sm-tag').textContent === '#3.4') m.classList.add('span2'); stealRow.append(m); });
  // разделы с заголовком и отступом, чтобы блоки не слипались
  const sec = (title, note) => { const d = el('div', 'sec'); const t = el('div', 'sec-t'); t.append(el('h3', null, title)); if (note) t.append(el('span', null, note)); d.append(t, el('div', 'sec-line')); return d; };
  zone.append(row('#1', '#8'), sec('Стил с поздних позиций', 'CO и BTN, когда до вас все сбросили'), stealRow, sec('Пуши', 'олл-ин вместо обычного открытия'), row('#4', '#4+'), sec('Изоляция лимперов', 'ваш рейз поверх лимпа'), row('#5', '#5+'));

  // матрица рук
  const b13 = el('section', 'block'); b13.append(numTag(13));
  const h13 = el('div', 'block-head'); h13.append(el('h2', null, 'Какие руки вы открываете'), el('p', null, 'процент открытия каждой руки, когда до вас все сбросили'));
  const seg = el('div', 'seg');
  ['EP', 'MP', 'HJ', 'CO', 'BTN', 'SB'].forEach(p => { const b = el('button', uiState.mxPos === p ? 'on' : '', p); b.type = 'button'; b.onclick = () => { uiState.mxPos = p; render(); }; seg.append(b); });
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

  zone.insertBefore(sec('Диапазон открытия', 'какие руки и как вы открываете'), zone.children[1]);
  zone.insertBefore(b13, zone.children[2]); // матрица рук сразу под строкой #1 / #8
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
  hideHandPop(); hideMxTip(); hideGroupTip(); hidePushTip();
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
window.__pickBar = (k) => { document.querySelectorAll('g.pick')[k].dispatchEvent(new MouseEvent('click')); };
window.__pinGroup = (n) => document.querySelectorAll('.hg-c')[n].click();
window.__sz = (k) => { SZ_SIDE = k; };
window.__bx = (k, v) => { if (k === 1) BX1.met = v; else BX2 = v; };
window.__hoverPush = (n) => { const c = document.querySelectorAll('.pmx-c')[n]; const r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('mouseenter', { clientX: r.left + 20, clientY: r.top + 5 })); };
window.__hoverGroup = (n) => { const c = document.querySelectorAll('.hg-c')[n]; const r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('mouseenter', { clientX: r.left + 20, clientY: r.top + 5 })); };
window.__hoverMx = (k) => { const c = document.querySelectorAll('.mx .mx-c')[k]; c.scrollIntoView({ block: 'center' }); const r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('mouseenter', { clientX: r.left + 10, clientY: r.top + 10 })); };
