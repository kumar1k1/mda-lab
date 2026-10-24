'use strict';
/* global mda, Stats */
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

let DB = null;
let CURRENT_IDX = [];
let LAST_NET_ITEMS = [];
const state = { tab: 'rfi', sub: 'TOT', room: null, player: null, type: null, from: null, to: null };

// ---------- вкладки (группы и список будем менять) ----------
const GROUPS = [
  { title: 'Префлоп', tabs: [
    { id: 'rfi', code: 'RFI', label: 'Открытие', render: renderRFI },
    { id: 'cc', code: 'CC', label: 'Колд-колл', render: renderCC, plan: 'Колд-колл против открытия по позициям, сайзингам открытия и стеку.' },
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
    hr.append(el('th', i === 0 && !o.noTot ? 'tot' : null, c));
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
      const td = el('td', 'c' + (i === 0 && !o.noTot ? ' tot' : '')); td.dataset.col = c; td.dataset.row = r.key || r.label;
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
const uiState = { mxPos: 'UTG', mxStk: '20–30', mxCustom: null, ccPos: 'BTN', ccStk: '20–30', ccCustom: null, ccOPos: 'BTN', ccOStkR: null, ccOMyR: null, ccOOpen: [] };
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
// винрейт «факт / EV»: EV — с поправкой на олл-ины до ривера (по эквити)
const EVcol = () => DB.cols.nev || DB.cols.net;
const wrTxt = (f, e, d) => (f == null ? '—' : signed(f, d) + ' / ' + signed(e, d) + ' EV');
function wrNode(cls, f, e, d) {
  const s = el('span', (cls ? cls + ' ' : '') + (f == null ? '' : f >= 0 ? 'up' : 'down'), f == null ? '—' : signed(f, d));
  if (f != null && e != null) s.append(el('span', 'evs ' + (e >= 0 ? 'up' : 'down'), ' / ' + signed(e, d) + ' EV'));
  return s;
}
// ячейки 4+ / 5+: факт сверху, EV мелко под ним — всегда внутри ячейки
function pmxWr(f, e) {
  const s = el('span', 'pmx-w');
  s.append(el('span', 'pmx-wf ' + (f == null ? '' : f >= 0 ? 'up' : 'down'), f == null ? '—' : signed(f, 2)));
  if (f != null && e != null) s.append(el('span', 'pmx-we ' + (e >= 0 ? 'up' : 'down'), 'EV ' + signed(e, 2)));
  return s;
}
const wrHtml = (f, e, d) => f == null ? '<span class="muted">—</span>' : '<span class="' + (f >= 0 ? 'up' : 'down') + '">' + signed(f, d) + '</span>' + (f == null || e == null ? '' : '<span class="evs-big ' + (e >= 0 ? 'up' : 'down') + '"> / ' + signed(e, d) + ' <i>EV</i></span>');

// #8 — столбики «BB за открытие» по позициям, ноль посередине
const RESP_COLS = ['var(--good)', 'var(--ice)', 'var(--bad)'];
function netChart(items, avg, evLab) {
  // цифры — в отдельной полосе над графиком (факт, под ним EV): никогда не накладываются на столбики и друг на друга
  const hasR = items.some(it => it.r), W = 520, H = hasR ? 236 : 202, P = { l: 34, r: 10, t: 54, b: hasR ? 68 : 34 };
  const s = svgRoot(W, H, 'Результат открытий по позициям, BB за открытие, и ответ оппонентов');
  const vals = items.map(it => (it.o.n ? it.o.sum / 10 / it.o.n : null));
  const evs = items.map(it => (it.o.n && it.o.es != null ? it.o.es / 10 / it.o.n : null));
  if (vals.every(v => v == null)) { const e = el('p', 'muted small net-empty', 'В выборке нет раздач для этого графика.'); return e; }
  // масштаб — по позициям с выборкой от 30 раздач, чтобы 2–3 случайные раздачи не сжимали остальные столбики
  const both = (pick) => vals.flatMap((v, i) => (pick(i) ? [v, evs[i]] : [])).filter(v => v != null);
  const solid = both(i => vals[i] != null && items[i].o.n >= 30);
  const sv = solid.length >= 3 ? solid : both(() => true); // если надёжных позиций меньше двух — масштаб по всем
  // устойчивый масштаб: одна позиция с огромным плюсом/минусом не сжимает остальные — её столбик обрезается с изломом
  const abs = sv.map(Math.abs).sort((a, b) => b - a);
  const cap = abs.length > 1 ? Math.min(abs[0], Math.max(abs[1] * 2, 1)) : (abs[0] || 0.5);
  const ext = Math.max(0.5, cap) * 1.2;
  const mn = Math.min(0, ...sv), lo = mn < 0 ? -Math.min(ext, Math.max(0.5, -mn * 1.2)) : 0, hi = ext; // минус — только на глубину самого большого минуса
  const clipped = (v) => v > hi || v < lo;
  const y = (v) => P.t + (1 - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (H - P.t - P.b);
  const step = [0.5, 1, 2, 5, 10, 20, 50, 100].find(v => (hi - lo) / v <= 4) || 100; // 2–4 линии сетки при любом размахе
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
      tt.textContent = it.p + ', ответ оппонентов: фолд ' + fmtPct(rs[0] / rt) + '%, колл ' + fmtPct(rs[1] / rt) + '%, рейз ' + fmtPct(rs[2] / rt) + '% (' + rt + ' открытий)';
      gr.append(tt);
      RESP_COLS.forEach((col, k) => gr.append(svgText(cx + (k - 1) * 17, sy + 7, Math.round(rs[k] / rt * 100), 'middle', 'font-size:10px;font-weight:600;font-family:var(--mono);fill:' + col)));
      s.append(gr);
    }
    if (v == null) return;
    const e = evs[i], few = it.o.n < 30, g = svgEl('g');
    // два столбика рядом: слева — факт (заливка), справа — EV (контур со штриховкой)
    const bwid = e == null ? w : Math.min(24, bw * 0.3), gap = 3;
    const bar = (val, x0, isEv) => {
      const top = y(Math.max(val, 0)), bot = y(Math.min(val, 0)), col = val >= 0 ? 'var(--good)' : 'var(--bad)';
      const op = few ? 0.25 : 0.4 + 0.6 * Math.min(1, Math.abs(val) / (ext / 1.2));
      if (isEv) g.append(svgEl('rect', { x: x0 + 0.75, y: top + 0.75, width: bwid - 1.5, height: Math.max(1.5, bot - top - 1.5), rx: 4 }, 'fill:url(#evHatch' + (val >= 0 ? 'G' : 'R') + ');stroke:' + col + ';stroke-width:1.5' + (few ? ';stroke-dasharray:3 3;opacity:.6' : '')));
      else g.append(svgEl('rect', { x: x0, y: top, width: bwid, height: Math.max(1.5, bot - top), rx: 4 }, 'fill:' + col + ';opacity:' + op.toFixed(2) + (few ? ';stroke:' + col + ';stroke-dasharray:3 3' : '')));
      if (clipped(val)) { // излом на обрезанном столбике
        const yb = val >= 0 ? top + 10 : bot - 10;
        g.append(svgEl('path', { d: 'M' + (x0 - 2) + ' ' + (yb + 3) + ' L' + (x0 + bwid + 2) + ' ' + (yb - 3) + ' M' + (x0 - 2) + ' ' + (yb + 8) + ' L' + (x0 + bwid + 2) + ' ' + (yb + 2) }, 'stroke:var(--panel);stroke-width:3'));
      }
      return [top, bot];
    };
    const xf = e == null ? cx - w / 2 : cx - bwid - gap / 2;
    bar(v, xf, false);
    if (e != null) bar(e, cx + gap / 2, true);
    // подписи в полосе над графиком: факт (цвет по знаку), под ним EV
    g.append(svgText(cx, 16, signed(v, 2), 'middle', 'font-size:13px;font-weight:700;fill:' + (v >= 0 ? 'var(--good)' : 'var(--bad)')));
    if (e != null) g.append(svgText(cx, 31, 'EV ' + signed(e, 2), 'middle', 'font-size:10px;font-weight:600;fill:var(--muted)'));
    g.append(svgEl('rect', { x: P.l + i * bw, y: 0, width: bw, height: H - 2, rx: 6 }, 'fill:transparent'));
    g.setAttribute('tabindex', '0'); g.setAttribute('class', 'net-bar');
    g.setAttribute('aria-label', it.p + ': ' + signed(v, 2) + ' BB' + (e == null ? '' : ', EV ' + signed(e, 2) + ' BB') + ', ' + it.o.n + ' раз');
    const show = (ev) => showHandPop(it, v, ev, g);
    g.addEventListener('mouseenter', show); g.addEventListener('mousemove', show); g.addEventListener('focus', show);
    g.addEventListener('mouseleave', hideHandPop); g.addEventListener('blur', hideHandPop);
    g.addEventListener('click', (ev) => pinHandPop(it, v, ev, g));
    g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pinHandPop(it, v, null, g); } });
    s.append(g);
  });
  if (hasR) s.append(svgText(P.l - 6, H - P.b + 44, '%', 'end', 'font-size:10px;fill:var(--faint)'));
  const defs = svgEl('defs');
  [['G', 'var(--good)'], ['R', 'var(--bad)']].forEach(([k, col]) => {
    const pt = svgEl('pattern', { id: 'evHatch' + k, width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
    pt.append(svgEl('rect', { width: 5, height: 5 }, 'fill:' + col + ';opacity:.12'), svgEl('line', { x1: 0, y1: 0, x2: 0, y2: 5 }, 'stroke:' + col + ';stroke-width:1.6;opacity:.55'));
    defs.append(pt);
  });
  s.prepend(defs);
  const box = el('div', 'net-wrap'); box.append(s);
  const evLg = el('div', 'resp-legend row net-lg ev-lg');
  evLg.append(Object.assign(el('span'), { innerHTML: '<i class="lg-fact"></i>факт' }), Object.assign(el('span'), { innerHTML: '<i class="lg-ev"></i>' + (evLab || 'EV') }));
  const lgRow = el('div', 'net-lgs'); lgRow.append(evLg); box.append(lgRow);
  if (!hasR) return box;
  // справа — цвета ответа оппонентов (цифры под позициями), без пояснительной подписи
  const lg = el('div', 'resp-legend row net-lg net-lg-r'); lg.title = 'Цифры под позицией — первый ответ оппонентов за спиной, %';
  [['фолд', RESP_COLS[0]], ['колл', RESP_COLS[1]], ['рейз', RESP_COLS[2]]].forEach(([l, col]) => { const it = el('span'); const i = el('i'); i.style.background = col; it.append(i, document.createTextNode(l)); lg.append(it); });
  lgRow.append(lg);
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
    const L = info.labels || ['рейз', 'олл-ин', 'лимп / колл', 'фолд'];
    [[L[0], info.rz, 'var(--mx-raise)'], [L[1], info.ai, 'var(--mx-push)'], [L[2], info.lp, 'var(--mx-limp)'], [L[3], info.fo, 'var(--mx-empty)']].forEach(([lab, k, col]) => {
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

function handMatrix(mx, labels) {
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
    const info = { name, n: c.n, rz: c.x - (c.ai || 0), ai: c.ai || 0, lp: c.lp || 0, fo: c.n - c.x - (c.lp || 0), labels };
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
  if (z.n) h.append(el('span', z.sum >= 0 ? 'up' : 'down', signed(z.sum / 10 / z.n, 2) + ' BB · ' + z.n + ' раз')); // только факт
  groupTip.append(h);
  const R = 'AKQJT98765432', grid = el('div', 'gt-grid');
  const inG = []; for (let q = 0; q < 169; q++) if (handGroup(q) === k) inG.push(q);
  const gv = inG.filter(q => hands[q].n >= 3).map(q => Math.abs(hands[q].sum / 10 / hands[q].n)).sort((a, b) => a - b);
  const scale = Math.max(1, ...gv.slice(0, Math.ceil(gv.length * 0.9))); // крайние 10% не растягивают шкалу цвета
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
  const agg = (ids) => { const g = HAND_GROUPS.map(() => ({ sum: 0, es: 0, n: 0 })), h = Array.from({ length: 169 }, () => ({ sum: 0, es: 0, n: 0 })), EV = EVcol(); let skipped = 0; ids.forEach(i => { if (c.hc[i] < 0) { skipped++; return; } const z = g[handGroup(c.hc[i])]; z.sum += c.net[i]; z.es += EV[i]; z.n++; const y = h[c.hc[i]]; y.sum += c.net[i]; y.es += EV[i]; y.n++; }); return { g, h, skipped }; };
  const A = agg(o.CO.nr.all.ids), B = agg(o.BTN.nr.all.ids);
  const vals = A.g.concat(B.g).filter(z => z.n >= 5).map(z => Math.abs(z.sum / 10 / z.n));
  const max = Math.max(0.5, ...vals);
  const box = el('div', 'hg');
  const hd = el('div', 'hg-row hg-head'); hd.append(el('span', null, 'Группа рук'), el('span', null, 'CO'), el('span', null, 'BTN')); box.append(hd);
  HAND_GROUPS.forEach(([lab], k) => {
    const r = el('div', 'hg-row'); r.append(el('span', 'hg-l', lab));
    [[A.g[k], C_CO, 'CO', A.h, o.CO.nr.all.ids], [B.g[k], C_BTN, 'BTN', B.h, o.BTN.nr.all.ids]].forEach(([z, col, nm, hands, ids]) => {
      const cell = el('div', 'hg-c hg-c34'); cell.dataset.pos = nm;
      if (z.n) { cell.classList.add('click'); cell.tabIndex = 0; cell.setAttribute('role', 'button'); cell.setAttribute('aria-label', nm + ', ' + lab + ': показать руки и раздачи');
        const pin = (e) => { hideGroupTip(); pinHandPop({ p: nm, key: 'grp' + nm + k, title: nm + ' · ' + lab, o: z, mx: hands, ids, only: (q) => handGroup(q) === k }, z.sum / 10 / z.n, e, cell); };
        cell.addEventListener('click', pin); cell.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pin(null); } }); }
      cell.addEventListener('mouseenter', (e) => showGroupTip(nm, lab, k, z, hands, e)); cell.addEventListener('mousemove', moveGroupTip); cell.addEventListener('mouseleave', hideGroupTip);
      if (!z.n) { cell.append(el('span', 'hg-na', '—')); r.append(cell); return; }
      const v = z.sum / 10 / z.n;
      const tr = el('div', 'hg-track'); const f = el('div', 'hg-fill'); const w = Math.min(50, Math.abs(v) / max * 50);
      f.style.width = w + '%'; f.style.left = v >= 0 ? '50%' : (50 - w) + '%'; f.style.background = col; if (v < 0) f.style.opacity = '.7';
      tr.append(el('i', 'hg-zero'), f);
      const t = wrNode('hg-v', v, z.es / 10 / z.n, 2); const n = el('span', 'hg-n', String(z.n));
      cell.append(n, tr, t); if (z.n < 30) cell.classList.add('low'); // число раздач — слева от полосы, не упирается в соседнюю колонку
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
    const v = z.n ? z.sum / 10 / z.n : null, e = z.n ? z.es / 10 / z.n : null;
    const b = el('div', 'r34-big'); b.style.borderColor = col;
    const big = el('b'); big.innerHTML = wrHtml(v, e, 2);
    b.append(el('span', 'nm', nm), big);
    b.title = z.n.toLocaleString('ru-RU') + ' открытий · всего ' + signed(z.sum / 10, 0) + ' / ' + signed(z.es / 10, 0) + ' EV BB';
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
      const t = out[k] || (out[k] = { n: 0, r: [0, 0, 0], rn: 0, sum: 0, es: 0, sn: 0, ids: [] });
      t.n += z.n; t.rn += z.rn; t.sum += z.sum; t.es += z.es; t.sn += z.sn; z.r.forEach((v, j) => { t.r[j] += v; }); t.ids = t.ids.concat(z.ids);
    }));
    return out;
  }
  function draw() {
    const map = merged(); delete map.AI; const tot = Object.values(map).reduce((a, z) => a + z.n, 0);
    body.replaceChildren();
    if (!tot) { body.append(el('p', 'muted small', 'Нет открытий в выборке.')); return; }
    const rows = [], other = { n: 0, r: [0, 0, 0], rn: 0, sum: 0, es: 0, sn: 0, ids: [] };
    Object.entries(map).filter(([k]) => k !== 'AI').sort((a, b) => b[1].n - a[1].n).forEach(([k, z], j) => {
      if (j < 4 && z.n / tot >= 0.01) rows.push([k.replace('.', ',') + ' BB', z, 'рейз ' + k.replace('.', ',') + ' BB']);
      else { other.n += z.n; other.rn += z.rn; other.sum += z.sum; other.es += z.es; other.sn += z.sn; z.r.forEach((v, q) => { other.r[q] += v; }); other.ids = other.ids.concat(z.ids); }
    });
    if (other.n) rows.push(['другие', other, 'другие размеры рейза']);
    const t = el('div', 'sz5-t');
    const hd = el('div', 'sz5-r sz5-h'); ['Размер', 'Доля', 'Фолд', 'Рейз', 'BB'].forEach(x => hd.append(el('span', null, x))); t.append(hd);
    rows.forEach(([lab, z, full]) => {
      const r = el('div', 'sz5-r');
      const share = z.n / tot, fold = z.rn ? z.r[0] / z.rn : null, rr = z.rn ? z.r[2] / z.rn : null, bb = z.sn ? z.sum / 10 / z.sn : null;
      const sh = el('span', 'sz5-sh', fmtPct(share) + '%');
      r.append(el('b', null, lab), sh,
        Object.assign(el('span', 'sz5-v', fold == null ? '—' : fmtPct(fold) + '%'), { style: 'color:var(--good)' }),
        Object.assign(el('span', 'sz5-v', rr == null ? '—' : fmtPct(rr) + '%'), { style: 'color:var(--bad)' }),
        el('span', 'sz5-v sz5-bb ' + (bb == null ? '' : bb >= 0 ? 'up' : 'down'), bb == null ? '—' : signed(bb, 2)));
      const tk = el('span', 'sz5-tk'); const tr = el('i'); tr.style.width = Math.max(1, share * 100) + '%'; if (SZ_SIDE === 'BTN') tr.style.background = C_BTN; tk.append(tr);
      // вторая линия: число раз, полоса доли и EV под фактом
      const ev = z.sn ? z.es / 10 / z.sn : null;
      r.append(el('small', null, z.n.toLocaleString('ru-RU') + ' раз'), tk, el('span', 'sz5-ev ' + (ev == null ? '' : ev >= 0 ? 'up' : 'down'), ev == null ? '' : 'EV ' + signed(ev, 2)));
      if (z.n < 30) r.classList.add('low');
      t.append(r);
    });
    body.append(t, infoNote('Фолд — все за вами сбросили. Рейз — первый ответ оппонентов рейзом. BB — средний итог раздачи.'));
  }
  draw();
  return m;
}

// ---------- 3.7: стил против разных стеков SB и BB — три варианта показа ----------
const BX_NAMES = ['короткий', 'средний', 'глубокий'];
const bxSum = (cells) => cells.reduce((t, z) => { for (const k in t) t[k] += z[k]; return t; }, { n: 0, x: 0, rn: 0, fold: 0, rr: 0, sum: 0, es: 0, sn: 0 });
const bxCell = (o, side, i, j) => (side === 'both' ? bxSum([o.CO.bx[i][j], o.BTN.bx[i][j]]) : o[side].bx[i][j]);
const BX_MET = {
  fold: { t: 'Фолд оппонентов', v: (z) => (z.rn ? z.fold / z.rn : null), f: (v) => fmtPct(v) + '%', n: (z) => z.rn },
  bb: { t: 'BB за открытие', v: (z) => (z.sn ? z.sum / 10 / z.sn : null), e: (z) => (z.sn ? z.es / 10 / z.sn : null), f: (v) => signed(v, 2), n: (z) => z.sn },
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
  return bxListCore(o, { tag: '3.7', title: 'Стил против стеков блайндов', sub: 'результат стила с CO и BTN при разных стеках SB и BB, от лучшего сочетания к худшему; ' + BX_STK_TXT,
    tabs: [['bb', 'Винрейт за открытие, BB'], ['fold', 'Фолд обоих блайндов, %']], get: () => BX2, set: (k) => { BX2 = k; } });
}
// общий список «9 сочетаний стеков SB и BB, CO и BTN рядом» — для стила (3.7) и колд-колла
function bxListCore(o, opt) {
  const m = bxHead(opt.tag, opt.title, opt.sub);
  const body = el('div');
  m.append(segBtns(opt.tabs, opt.get(), (k) => { opt.set(k); draw(); }), body);
  if (opt.note) m.append(infoNote(opt.note));
  function draw() {
    const BX2 = opt.get(), M = BX_MET[BX2], rows = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) rows.push({ i, j, a: o.CO.bx[i][j], b: o.BTN.bx[i][j], t: M.v(bxSum([o.CO.bx[i][j], o.BTN.bx[i][j]])) });
    // сначала сочетания с выборкой от 30 раздач (по лучшему результату), малые выборки — внизу; масштаб полос — тоже по ним
    const solid = (r) => M.n(r.a) + M.n(r.b) >= 30;
    rows.sort((x, y) => (solid(y) - solid(x)) || ((y.t ?? -1e9) - (x.t ?? -1e9)));
    const sv = rows.flatMap(r => [[M.v(r.a), M.n(r.a)], [M.v(r.b), M.n(r.b)]]).filter(([v, n]) => v != null && n >= 30).map(([v]) => Math.abs(v));
    const max = Math.max(0.01, ...(sv.length ? sv : rows.flatMap(r => [M.v(r.a), M.v(r.b)]).filter(v => v != null).map(Math.abs)));
    const t = el('div', 'bx-list');
    const hd = el('div', 'bx-lr bx-lh'); hd.append(el('span', null, 'SB · BB'), el('span', null, 'CO'), el('span', null, 'BTN')); t.append(hd);
    rows.forEach(r => {
      const row = el('div', 'bx-lr');
      row.append(el('span', 'bx-ll', 'SB ' + BX_NAMES[r.i] + ' · BB ' + BX_NAMES[r.j]));
      [[r.a, C_CO], [r.b, C_BTN]].forEach(([z, col]) => {
        const v = M.v(z), n = M.n(z), cell = el('div', 'hg-c'); cell.dataset.pos = col === C_CO ? 'CO' : 'BTN';
        const tr = el('div', 'hg-track'), f = el('div', 'hg-fill');
        if (BX2 === 'bb') { tr.append(el('div', 'hg-zero')); const w = v == null ? 0 : Math.min(50, Math.abs(v) / max * 50); f.style.width = w + '%'; f.style.left = v >= 0 ? '50%' : (50 - w) + '%'; }
        else { f.style.left = '0'; f.style.width = (v == null ? 0 : Math.min(100, v / max * 100)) + '%'; }
        f.style.background = col; tr.append(f);
        cell.append(tr, M.e ? wrNode('hg-v', v, M.e(z), 2) : el('span', 'hg-v', v == null ? '—' : M.f(v)), el('span', 'hg-n', n ? String(n) : ''));
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
  const hd = el('div', 'bx-rr bx-lh'); ['', 'Фолд', '', 'BB'].forEach(x => hd.append(el('span', null, x))); t.append(hd);
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
  m.append(t, infoNote('Фолд — оба блайнда сбросили на ваш стил. BB — средний итог открытия. Бледные строки — меньше 30 раздач.'));
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

// пояснение «как читать» — свёрнуто, раскрывается по клику
function infoNote(text) { const d = el('details', 'info-note'); d.append(el('summary', null, 'Как читать'), el('p', null, text)); return d; }

// короткая разбивка по позициям в левых карточках: подпись, полоса, процент
function posStrip(title, rows) {
  const box = el('div', 'pos-strip'); box.append(el('span', 'resp-t', title));
  const mb = el('div', 'mini-bars'); const max = Math.max(0.01, ...rows.map(r => r[1] || 0));
  rows.forEach(([lab, v, tip]) => {
    const r = el('div', 'mb-row'); r.title = tip || '';
    const tr = el('div', 'mb-track'); const f = el('div', 'mb-fill'); f.style.width = (v == null ? 0 : v / max * 100) + '%'; tr.append(f);
    r.append(el('span', 'mb-l', lab), tr, el('span', 'mb-v', v == null ? '—' : fmtPct(v) + '%')); mb.append(r);
  });
  box.append(mb); return box;
}
const fillBox = (...nodes) => { const d = el('div', 'card-fill'); d.append(...nodes); return d; };

// плитки «все сбросили / колл / рейз» — общий вид для #1 и #3
function respTiles(resp, title, labels) {
  const rs = el('div', 'resp');
  const rt = resp.reduce((a, b) => a + b, 0);
  const rl = el('div', 'resp-tiles');
  (labels || [['фолд', 'var(--good)'], ['колл', 'var(--ice)'], ['рейз', 'var(--bad)']]).forEach(([lab, col], k) => {
    const it = el('span', 'resp-tile'); const b = el('b', null, rt ? fmtPct(resp[k] / rt) + '%' : '—'); b.style.color = col;
    it.append(b, el('span', null, lab)); it.title = resp[k].toLocaleString('ru-RU') + ' из ' + rt.toLocaleString('ru-RU');
    rl.append(it);
  });
  if (title) rs.append(el('span', 'resp-t', title));
  rs.append(rl);
  return rs;
}

// всплывающее окно над клеткой 4.1: диапазон пуша — какие руки и как часто вы пушили
let pushTip = null;
function showPushTip(lab, z, f, w, e, we) {
  if (!pushTip) { pushTip = el('div', 'gt'); pushTip.setAttribute('role', 'tooltip'); document.body.append(pushTip); }
  pushTip.replaceChildren();
  const h = el('div', 'gt-h'); h.append(el('b', null, lab));
  h.append(el('span', null, 'пуш ' + fmtPct(f) + '% · ' + z.x + ' из ' + z.o + (w == null ? '' : ' · ' + wrTxt(w, we, 2) + ' BB за пуш')));
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
  pushTip.append(grid, el('div', 'gt-f', any ? 'Зелёные — руки, которые в сумме принесли плюс, красные — минус; в клетке средний итог пуша этой рукой в BB. Бледные — один пуш. Тёмные — руки, которыми не пушили; пустые — не приходили.' : 'Нет пушей с известными картами в этой клетке.'));
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
  const c = DB.cols, P = ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB']; // индекс = позиция; HJ не бывает (как в Hand2Note) и не показывается
  const EV = EVcol(), pos = P.map(() => ({ x: 0, n: 0 })), netPos = P.map(() => ({ sum: 0, n: 0 })), resp = [0, 0, 0], net = { sum: 0, es: 0, n: 0 }, netStk = [[], [], [], [], [], []].map(() => ({ sum: 0, n: 0 }));
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
    if (c.net) { net.sum += c.net[i]; net.es += EV[i]; net.n++; netPos[p].sum += c.net[i]; netPos[p].n++; if (k >= 0) { netStk[k].sum += c.net[i]; netStk[k].n++; } }
  }
  const card = el('div', 'insight steal-panel pm-card');
  card.append(numTag('4+'));
  const m = card;
  m.append(el('b', 'pm-title', 'Где и как вы пушите'), el('span', 'sm-s', 'first-in пуш (до вас все сбросили): частота и винрейт по каждой позиции и стеку; в среднем ' + wrTxt(net.n ? net.sum / 10 / net.n : null, net.n ? net.es / 10 / net.n : null, 2) + ' BB за пуш, ' + net.n.toLocaleString('ru-RU') + ' пушей'));
  // матрица: строки — стек, колонки — позиции; в клетке частота пуша и винрейт за пуш
  const cell = () => ({ o: 0, x: 0, sum: 0, es: 0, n: 0, ho: null, hx: null, ids: [], mx: null });
  const M = SB.map(() => P.map(cell)), rowT = SB.map(cell), colT = P.map(cell), allT = cell();
  for (const i of idx) {
    const p = c.pos[i]; if (c.sit[i] !== 0 || p > 5) continue;
    const bb = c.bb[i] / 10, k = SB.findIndex(z => bb >= z[1] && bb < z[2]); if (k < 0) continue;
    const push = c.act[i] === 3;
    [M[k][p], rowT[k], colT[p], allT].forEach(z => { z.o++; if (push) { z.x++; if (c.net) { z.sum += c.net[i]; z.es += EV[i]; z.n++; } } });
    const hc = c.hc ? c.hc[i] : -1;
    if (hc >= 0) { const z = M[k][p]; if (!z.ho) { z.ho = new Uint32Array(169); z.hx = new Uint32Array(169); z.hs = new Float64Array(169); } z.ho[hc]++; if (push) { z.hx[hc]++; if (c.net) z.hs[hc] += c.net[i]; } }
    if (push) { const z = M[k][p]; z.ids.push(i); if (hc >= 0) { if (!z.mx) z.mx = Array.from({ length: 169 }, () => ({ n: 0, sum: 0, es: 0 })); z.mx[hc].n++; if (c.net) { z.mx[hc].sum += c.net[i]; z.mx[hc].es += EV[i]; } } }
  }
  const tb = el('div', 'pmx');
  tb.style.gridTemplateColumns = 'auto repeat(' + P.filter(p => p !== 'HJ').length + ', minmax(0, 1fr))';
  const corner = el('span', 'pmx-corner', 'стек, BB'); tb.append(corner);
  P.forEach(nm => { if (nm !== 'HJ') tb.append(el('span', 'pmx-ch', nm)); });
  const maxF = Math.max(0.01, ...M.flat().filter(z => z.x >= 5).map(z => z.x / z.o));
  const put = (z, lab, tot) => {
    const d = el('div', 'pmx-c' + (tot ? ' tot' : ''));
    if (!z.o) { d.classList.add('na'); d.append(el('b', null, '—')); return d; }
    const f = z.x / z.o, w = z.n ? z.sum / 10 / z.n : null, we = z.n ? z.es / 10 / z.n : null;
    d.style.setProperty('--f', Math.min(1, f / maxF).toFixed(3));
    d.append(el('b', null, fmtPct(f) + '%'), pmxWr(w, we));
    if (z.n < 10) d.classList.add('low');
    if (z.mx) {
      const mxN = z.mx.reduce((a, q) => a + q.n, 0), mxS = z.mx.reduce((a, q) => a + q.sum, 0), mxE = z.mx.reduce((a, q) => a + q.es, 0);
      const it = { p: lab.split(',')[0], key: 'push ' + lab, title: lab + ' · пуш ' + fmtPct(f) + '%', o: { n: mxN, sum: mxS, es: mxE }, mx: z.mx, ids: z.ids, vlab: ' BB за пуш', nlab: ' пушей с картами' };
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
    P.forEach((nm, p) => { if (nm !== 'HJ') tb.append(put(M[k][p], nm + ', ' + z0[0] + ' BB')); });
  });
  m.append(tb, infoNote('В клетке: сверху — частота пуша (как часто вы идёте олл-ин от всех возможностей открыться), снизу — винрейт за пуш в BB. Чем ярче клетка, тем чаще пуш. Бледные клетки — меньше 10 пушей. Наведите на клетку — покажутся руки, которыми вы пушили, и их итог; клик закрепит окно, а клик по руке откроет раздачи и реплеер.'));
  return card;
}

// ---------- #5 / #5+ — изоляция лимперов ----------
const ISO_POS = ['MP', 'HJ', 'CO', 'BTN', 'SB', 'BB']; // индекс = позиция − 1; HJ не показывается
function isoData(idx) {
  const c = DB.cols, EV = EVcol(), cell = () => ({ o: 0, x: 0, sum: 0, es: 0, n: 0, f: 0, fn: 0, ids: [], mx: null });
  const M = [ISO_POS.map(cell), ISO_POS.map(cell)], tot = [cell(), cell()], resp = [0, 0, 0], respL = [[0, 0, 0], [0, 0, 0]], szx = [{}, {}];
  for (const i of idx) {
    const p = c.pos[i]; if (c.sit[i] !== 1 || p < 1) continue;
    const r = c.lim[i] === 1 ? 0 : 1, z = M[r][p - 1], t = tot[r];
    const bvb = c.bvb ? c.bvb[i] === 1 : false, raised = c.act[i] >= 2;
    t.o++; if (raised) t.x++;
    z.o++; if (raised) z.x++; // как в Hand2Note: в BB считается и лимп SB
    if (!raised) continue;
    if (c.orsp && c.orsp[i] >= 0) { resp[c.orsp[i]]++; respL[r][c.orsp[i]]++; }
    if (c.act[i] === 2 && c.bb[i] / 10 - c.size[i] / 100 >= 0.5) { // сайзинг изолейта с точностью до 0.5 BB, без олл-инов
      const key = String(Math.round(c.size[i] / 50) / 2);
      const q = szx[r][key] || (szx[r][key] = { n: 0, r: [0, 0, 0], rn: 0, sum: 0, es: 0, sn: 0 });
      q.n++; if (c.orsp && c.orsp[i] >= 0) { q.r[c.orsp[i]]++; q.rn++; } if (c.net) { q.sum += c.net[i]; q.es += EV[i]; q.sn++; }
    }
    if (c.fvr && c.fvr[i] >= 0) { z.fn++; if (c.fvr[i] === 1) z.f++; }
    if (c.net) { z.sum += c.net[i]; z.es += EV[i]; z.n++; }
    z.ids.push(i);
    const hc = c.hc ? c.hc[i] : -1;
    if (hc >= 0) { if (!z.mx) z.mx = Array.from({ length: 169 }, () => ({ n: 0, sum: 0, es: 0 })); z.mx[hc].n++; if (c.net) { z.mx[hc].sum += c.net[i]; z.mx[hc].es += EV[i]; } }
  }
  return { M, tot, resp, respL, szx };
}

function isoCard(d) {
  const all = { x: d.tot[0].x + d.tot[1].x, n: d.tot[0].o + d.tot[1].o };
  const box = el('div', 'iso-box'), sub = el('div', 'iso-sub');
  [['vs 1 лимпер', d.tot[0]], ['vs 2+ лимпера', d.tot[1]]].forEach(([lab, t]) => {
    const r = el('div', 'iso-sr'); r.append(el('span', null, lab), el('b', null, pctTxt({ x: t.x, n: t.o })), el('small', null, t.x.toLocaleString('ru-RU') + ' из ' + t.o.toLocaleString('ru-RU')));
    sub.append(r);
  });
  // ответ оппонентов: против 1 лимпера, против 2+ и всего
  const rt = el('div', 'iso-rt');
  const g = el('div', 'iso-rg');
  // как в #4: в плитке процент, под ним действие
  [['vs 1 лимпер', d.respL[0], ''], ['vs 2+', d.respL[1], ''], ['Всего', d.resp, 'tot']].forEach(([lab, a, cls]) => {
    const n = a[0] + a[1] + a[2];
    g.append(el('span', 'iso-rl ' + cls, lab));
    [['фолд', 'var(--good)'], ['колл', 'var(--ice)'], ['рейз', 'var(--bad)']].forEach(([act, col], k) => {
      const v = el('span', 'resp-tile iso-rv ' + cls); const num = el('b', null, n ? fmtPct(a[k] / n) + '%' : '—'); num.style.color = col;
      v.append(num, el('span', null, act)); v.title = lab + ', ' + act + ': ' + a[k] + ' из ' + n; g.append(v);
    });
  });
  rt.append(g);
  const isoPos = ISO_POS.map((nm, p) => { const z1 = d.M[0][p], z2 = d.M[1][p]; const x = z1.x + z2.x, n = z1.o + z2.o; return [nm, n ? x / n : null, nm + ': изолейт ' + x + ' из ' + n]; });
  box.append(sub, posStrip('По позициям', isoPos.filter(r => r[0] !== 'HJ')), rt);
  return card(5, 'Изолейт лимперов', '<em>' + pctTxt(all) + '</em>', null, box);
}

// сайзинги изолейта: доля, все сбросили, рейз в ответ, винрейт
let ISO_SZ = 'all';
function isoSizing(d) {
  const box = el('div', 'iso-sz');
  const head = el('div', 'iso-sz-h'); head.append(el('b', null, 'Сайзинг изолейта'), el('span', 'sm-s', 'самые частые размеры рейза после лимпа оппонента, BB, и их результат (без олл-инов)'));
  const body = el('div');
  head.append(segBtns([['all', 'Все'], ['0', 'vs 1 лимпер'], ['1', 'vs 2+']], ISO_SZ, (k) => { ISO_SZ = k; draw(); }));
  box.append(head, body);
  function draw() {
    const src = ISO_SZ === 'all' ? [d.szx[0], d.szx[1]] : [d.szx[+ISO_SZ]], map = {};
    src.forEach(m => Object.entries(m).forEach(([k, z]) => { const t = map[k] || (map[k] = { n: 0, r: [0, 0, 0], rn: 0, sum: 0, es: 0, sn: 0 }); t.n += z.n; t.rn += z.rn; t.sum += z.sum; t.es += z.es; t.sn += z.sn; z.r.forEach((v, j) => { t.r[j] += v; }); }));
    const tot = Object.values(map).reduce((a, z) => a + z.n, 0);
    body.replaceChildren();
    if (!tot) { body.append(el('p', 'muted small', 'Нет изолейтов в выборке.')); return; }
    const rows = [], other = { n: 0, r: [0, 0, 0], rn: 0, sum: 0, es: 0, sn: 0 };
    Object.entries(map).sort((a, b) => b[1].n - a[1].n).forEach(([k, z], j) => {
      if (j < 5 && z.n / tot >= 0.03) rows.push([k.replace('.', ',') + ' BB', z]);
      else { other.n += z.n; other.rn += z.rn; other.sum += z.sum; other.es += z.es; other.sn += z.sn; z.r.forEach((v, q) => { other.r[q] += v; }); }
    });
    rows.sort((a, b) => parseFloat(a[0].replace(',', '.')) - parseFloat(b[0].replace(',', '.')));
    if (other.n) rows.push(['другие', other]);
    const t = el('div', 'sz5-t');
    const hd = el('div', 'sz5-r sz5-h'); ['Размер', 'Доля', 'Фолд', 'Рейз', 'Винрейт, BB / EV'].forEach(x => hd.append(el('span', null, x))); t.append(hd);
    rows.forEach(([lab, z]) => {
      const r = el('div', 'sz5-r');
      const share = z.n / tot, fold = z.rn ? z.r[0] / z.rn : null, rr = z.rn ? z.r[2] / z.rn : null, bb = z.sn ? z.sum / 10 / z.sn : null;
      const tk = el('span', 'sz5-tk'); const tr = el('i'); tr.style.width = Math.max(1, share * 100) + '%'; tk.append(tr);
      const fv = el('span', 'sz5-v', fold == null ? '—' : fmtPct(fold) + '%'); fv.style.color = 'var(--good)';
      const rv = el('span', 'sz5-v', rr == null ? '—' : fmtPct(rr) + '%'); rv.style.color = 'var(--bad)';
      r.append(el('b', null, lab), el('span', 'sz5-sh', fmtPct(share) + '%'), fv, rv,
        wrNode('sz5-v', bb, z.sn ? z.es / 10 / z.sn : null, 2),
        el('small', null, z.n.toLocaleString('ru-RU') + ' раз'), tk);
      if (z.n < 30) r.classList.add('low');
      t.append(r);
    });
    body.append(t);
  }
  draw();
  return box;
}

function isoPanel(d) {
  const card = el('div', 'insight steal-panel pm-card');
  card.append(numTag('5+'));
  const nAll = d.M.flat().reduce((a, z) => a + z.n, 0), sAll = d.M.flat().reduce((a, z) => a + z.sum, 0), eAll = d.M.flat().reduce((a, z) => a + z.es, 0);
  card.append(el('b', 'pm-title', 'Изолейт по позициям'), el('span', 'sm-s', 'ваш рейз после лимпа оппонента: частота и винрейт; в среднем ' + wrTxt(nAll ? sAll / 10 / nAll : null, nAll ? eAll / 10 / nAll : null, 2) + ' BB за изолейт, ' + nAll.toLocaleString('ru-RU') + ' изолейтов'));
  const tb = el('div', 'pmx iso');
  tb.style.gridTemplateColumns = 'auto repeat(' + ISO_POS.filter(p => p !== 'HJ').length + ', minmax(0, 1fr))';
  tb.append(el('span', 'pmx-corner', 'лимперов'));
  ISO_POS.forEach(nm => { if (nm !== 'HJ') tb.append(el('span', 'pmx-ch', nm)); });
  const maxF = Math.max(0.01, ...d.M.flat().filter(z => z.o >= 20).map(z => z.x / z.o));
  [['1', 0], ['2+', 1]].forEach(([lab, r]) => {
    tb.append(el('span', 'pmx-rh', lab));
    ISO_POS.forEach((nm, p) => {
      if (nm === 'HJ') return;
      const z = d.M[r][p], c = el('div', 'pmx-c');
      if (!z.o) { c.classList.add('na'); c.append(el('b', null, '—')); tb.append(c); return; }
      const f = z.x / z.o, w = z.n ? z.sum / 10 / z.n : null;
      c.style.setProperty('--f', Math.min(1, f / maxF).toFixed(3));
      c.style.background = 'rgba(var(--amber-rgb),calc(.05 + var(--f) * .45))';
      c.append(el('b', null, fmtPct(f) + '%'), pmxWr(w, z.n ? z.es / 10 / z.n : null));
      if (z.o < 20) c.classList.add('low');
      const title = nm + ', vs ' + lab + ' лимпер' + (r ? 'а' : '');
      if (z.mx) {
        const n = z.mx.reduce((a, q) => a + q.n, 0), s = z.mx.reduce((a, q) => a + q.sum, 0), es = z.mx.reduce((a, q) => a + q.es, 0);
        const it = { p: nm, key: 'iso ' + title, title: title + ' · изолейт ' + fmtPct(f) + '%', o: { n, sum: s, es }, mx: z.mx, ids: z.ids, sit: 1, vlab: ' BB за изолейт', nlab: ' изолейтов с картами' };
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
  card.append(tb, infoNote('В клетке: частота изолейта (как часто вы рейзите, когда перед вами лимпили), и винрейт за изолейт в BB. Чем ярче клетка, тем чаще изолейт; бледные — меньше 20 возможностей. Наведите на клетку — покажутся руки, клик закрепит окно, клик по руке откроет раздачи и реплеер.'), isoSizing(d));
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
  const RESP = [['фолд', 'var(--good)'], ['колл', 'var(--ice)'], ['рейз', 'var(--bad)']];
  RESP.forEach(([lab, col], k) => { const seg = el('div'); seg.style.width = (rt ? x.resp[k] / rt * 100 : 0) + '%'; seg.style.background = col; seg.title = lab + ': ' + x.resp[k] + ' из ' + rt; rbar.append(seg); });
  const rl = el('div', 'resp-tiles');
  RESP.forEach(([lab, col], k) => { const it = el('span', 'resp-tile'); const b = el('b', null, rt ? fmtPct(x.resp[k] / rt) + '%' : '—'); b.style.color = col; it.append(b, el('span', null, lab)); it.title = x.resp[k].toLocaleString('ru-RU') + ' из ' + rt.toLocaleString('ru-RU') + ' открытий'; rl.append(it); });
  rs.append(rl);
  const pos1 = ['UTG', 'MP', 'CO', 'BTN'].map(p => { const z = x.seats[p]; return [p, z && z.n ? z.x / z.n : null, p + ': ' + (z ? z.x + ' из ' + z.n : '')]; });
  cards.append(card(1, 'Открываете', '<em>' + pctTxt(x.all) + '</em>', 'рук из ' + x.all.n.toLocaleString('ru-RU') + ' возможностей, UTG–BTN', fillBox(posStrip('По позициям', pos1), rs)));

  const dall = x.all.n ? x.all.x / x.all.n : null;
  // #8 — результат открытий: столбики по позициям вокруг нуля
  const nb = bb100(x.openNet.sum, x.openNet.n);
  const perOpen = (o) => (o.n ? o.sum / 10 / o.n : null);
  const perEv = (o) => (o.n ? o.es / 10 / o.n : null);
  const unc = perOpen(x.netUnc), con = perOpen(x.netCon);
  const split = el('div', 'net-split');
  const sp1 = el('div'); sp1.append(el('span', 'k', 'без борьбы'), wrNode('b', unc, perEv(x.netUnc), 2), el('span', 'n', x.netUnc.n.toLocaleString('ru-RU') + ' раз'));
  const sp2 = el('div'); sp2.append(el('span', 'k', 'когда сыграли'), wrNode('b', con, perEv(x.netCon), 2), el('span', 'n', x.netCon.n.toLocaleString('ru-RU') + ' раз'));
  split.append(sp1, sp2);
  const c8 = card(8, 'Результат открытий', wrHtml(nb == null ? null : nb / 100, perEv(x.openNet), 2) + ' <small>BB за открытие</small>', null, netChart((LAST_NET_ITEMS = ['UTG', 'MP', 'CO', 'BTN', 'SB'].map(p => ({ p, o: x.openNetPos[p], mx: x.netMx[p], r: x.respPos[p] }))), nb == null ? null : nb / 100, 'EV открытий'));
  c8.classList.add('wide', 'span3');
  cards.append(c8);
  // #3 — стил + ответ блайндов (CO и BTN вместе), как в #1
  const so = Stats.stealExtra(DB, idx);
  const sresp = [0, 1, 2].map(k => so.CO.resp[k] + so.BTN.resp[k]);
  cards.append(card(3, 'Стил с CO и BTN', '<em>' + pctTxt(x.late) + '</em>', 'когда до вас все сбросили', fillBox(posStrip('По позициям', ['CO', 'BTN'].map(p => [p, x.latePos[p].n ? x.latePos[p].x / x.latePos[p].n : null, p + ': ' + x.latePos[p].x + ' из ' + x.latePos[p].n])), respTiles(sresp, ''))));

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
  const presp = [0, 0], pp = ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB'].map(() => ({ x: 0, n: 0 }));
  { const c = DB.cols; for (const i of idx) if (c.sit[i] === 0 && c.pos[i] <= 5 && c.act[i] >= 2) { pp[c.pos[i]].n++; if (c.act[i] === 3) pp[c.pos[i]].x++; } }
  const pushPos = ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB'].map((p, k) => [p, pp[k].n ? pp[k].x / pp[k].n : null, p + ': ' + pp[k].x + ' пушей из ' + pp[k].n + ' открытий']).filter(r => r[0] !== 'HJ');
  { const c = DB.cols; if (c.orsp) for (const i of idx) if (c.sit[i] === 0 && c.pos[i] <= 5 && c.act[i] === 3 && c.orsp[i] >= 0) presp[c.orsp[i] === 0 ? 0 : 1]++; }
  cards.append(card(4, 'Доля пушей среди открытий', '<em>' + pctTxt(x.shove) + '</em>', x.shove.x.toLocaleString('ru-RU') + ' пушей из ' + x.shove.n.toLocaleString('ru-RU') + ' открытий',
    fillBox(posStrip('По позициям — доля пушей среди открытий', pushPos), respTiles(presp, '', [['фолд', 'var(--good)'], ['колл', 'var(--ice)']]))));
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
  zone.append(row('#1', '#8'), sec('Стил с поздних позиций', 'CO и BTN, когда до вас все сбросили'), stealRow, sec('Пуши', 'олл-ин вместо обычного открытия'), row('#4', '#4+'), sec('Изоляция лимперов', 'ваш рейз после лимпа оппонента'), row('#5', '#5+'));

  // матрица рук
  const b13 = el('section', 'block'); b13.append(numTag(13));
  const h13 = el('div', 'block-head'); h13.append(el('h2', null, 'Какие руки вы открываете'), el('p', null, 'процент открытия каждой руки, когда до вас все сбросили'));
  const seg = el('div', 'seg');
  ['UTG', 'MP', 'CO', 'BTN', 'SB'].forEach(p => { const b = el('button', uiState.mxPos === p ? 'on' : '', p); b.type = 'button'; b.onclick = () => { uiState.mxPos = p; render(); }; seg.append(b); });
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
  mxSide.append(infoNote('Клетка закрашена слева направо на долю открытий этой руки: янтарная часть — рейзы, синяя — олл-ин, зелёная — лимпы, тёмная — фолды. Наведите на клетку, чтобы увидеть проценты каждого действия. Сверху от диагонали — одномастные, снизу — разномастные. Бледная заливка — меньше 5 раздач.'));
  mxBody.append(mxSide);
  b13.append(h13, mxBody); zone.append(b13);

  zone.insertBefore(sec('Диапазон открытия', 'какие руки и как вы открываете'), zone.children[1]);
  zone.insertBefore(b13, zone.children[2]); // матрица рук сразу под строкой #1 / #8
  return zone;
}

// ---------- вкладка «Колд-колл» ----------
// #6 — колд-колл против разных сайзингов открытия (без олл-инов): частоты ответа и винрейт колла
let CC_SZPOS = 'TOT';
function ccSizeBlock(r) {
  const card = el('div', 'insight cc-table');
  card.append(numTag(6), el('b', 'pm-title', 'Против сайзинга открытия'), el('span', 'sm-s', 'как вы отвечаете на открытие разного размера и какой результат дают ваши коллы'));
  const posList = ['TOT'].concat(r.CC_COLS.slice(1).filter(p => r.cc[p].n >= SMALL));
  const body = el('div');
  card.append(segBtns(posList.map(p => [p, p === 'TOT' ? 'Все без BB' : p]), CC_SZPOS, (k) => { CC_SZPOS = k; draw(); }), body,
    infoNote('Размер — до скольких BB открыл соперник. Доля — какая часть всех открытий перед вами была такого размера. Колл / 3-бет / Фолд — ваш ответ. Винрейт — средний итог раздачи после вашего колла. Бледные строки — меньше 30 раздач.'));
  function draw() {
    const rows = r.sz[CC_SZPOS] || [], tot = rows.reduce((a, z) => a + z.n, 0);
    const t = el('div', 'sz5-t cc-sz');
    const hd = el('div', 'sz5-r sz5-h'); ['Размер', 'Доля', 'Колл', '3-бет', 'Фолд', 'Винрейт колла, BB / EV'].forEach(x => hd.append(el('span', null, x))); t.append(hd);
    rows.forEach((z, k) => {
      if (!z.n) return;
      const row = el('div', 'sz5-r'); if (z.n < 30) row.classList.add('low');
      const pc = (v) => fmtPct(v / z.n) + '%', wr = z.sn ? z.sum / 10 / z.sn : null, we = z.sn ? z.es / 10 / z.sn : null;
      const share = z.n / tot, tk = el('span', 'sz5-tk'); const tr = el('i'); tr.style.width = Math.max(1, share * 100) + '%'; tk.append(tr);
      const v = (txt, col) => { const e = el('span', 'sz5-v', txt); e.style.color = col; return e; };
      row.append(el('b', null, r.CC_SZ[k][0]), el('span', 'sz5-sh', fmtPct(share) + '%'), v(pc(z.call), 'var(--ice)'), v(pc(z.rz), 'var(--bad)'), v(pc(z.fold), 'var(--good)'),
        wrNode('sz5-v', wr, we, 2), el('small', null, z.n.toLocaleString('ru-RU') + ' раз'), tk);
      t.append(row);
    });
    body.replaceChildren(tot ? t : el('p', 'muted small', 'Нет открытий в выборке.'));
  }
  draw();
  return card;
}

// #7 — колд-колл против олл-ина: частота колла пуша, винрейт по позициям и по стеку пушера
let CC_AIPOS = 'TOT';
function ccAllinBlock(r) {
  const card = el('div', 'insight cc-table');
  card.append(numTag(7), el('b', 'pm-title', 'Колл против олл-ина'), el('span', 'sm-s', 'перед вами открылись олл-ином (или почти всем стеком), а вы коллировали'));
  // таблица частоты колла пуша по позициям: наведение — руки, клик — раздачи и реплеер
  const cols = r.CC_COLS.filter(k => k === 'TOT' || r.ai[k].n >= SMALL);
  const w = heatTable({ cols, groupGapBefore: cols.indexOf('SB') >= 0 ? cols.indexOf('SB') : cols.indexOf('BB'), rows: [{ label: 'Колл пуша', data: r.ai }] });
  w.querySelectorAll('td.c').forEach(td => {
    const col = td.dataset.col, z = r.aiHands[col]; if (!z || !z.n) return;
    const it = { p: col === 'TOT' ? null : col, key: 'ccai ' + col, title: 'Колл олл-ина · ' + (col === 'TOT' ? 'все позиции без BB' : col), o: { n: z.n, sum: z.sum, es: z.es }, mx: z.mx, ids: z.ids, sit: 2, act: 1, vlab: ' BB за колл', nlab: ' коллов' };
    const v = z.sum / 10 / z.n;
    td.classList.add('click'); td.tabIndex = 0; td.setAttribute('role', 'button');
    const show = (ev) => showHandPop(it, v, ev, td);
    td.addEventListener('mouseenter', show); td.addEventListener('mousemove', show); td.addEventListener('mouseleave', hideHandPop);
    td.addEventListener('click', (ev) => pinHandPop(it, v, ev, td));
    td.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pinHandPop(it, v, null, td); } });
  });
  // винрейт колла пуша по позициям — график как #8
  const items = cols.filter(k => k !== 'TOT').map(p => { const h = r.aiHands[p]; return { p, key: 'ccai' + p, o: { n: h.n, sum: h.sum, es: h.es }, mx: h.mx, ids: h.ids, sit: 2, act: 1, title: 'Колл олл-ина · ' + p, vlab: ' BB за колл', nlab: ' коллов' }; });
  const t = r.aiHands.TOT, avg = t.n ? t.sum / 10 / t.n : null;
  const chart = el('div', 'cc-ai-chart');
  chart.append(el('span', 'resp-t', 'Винрейт колла по позициям: в среднем ' + signed(avg, 2) + ' BB, без BB'), netChart(items.filter(it => it.o.n > 0), avg, 'EV колла'));
  // по стеку того, кто пошёл олл-ин
  const body = el('div');
  const stTitle = el('span', 'resp-t', 'По стеку пушера');
  const posList = ['TOT'].concat(cols.filter(k => k !== 'TOT'));
  const draw = () => {
    const rows = r.aiStk[CC_AIPOS] || [];
    const tb = el('div', 'sz5-t cc-sz');
    const hd = el('div', 'sz5-r sz5-h'); ['Стек пушера', 'Случаев', 'Колл', '3-бет / олл-ин', 'Фолд', 'Винрейт колла, BB / EV'].forEach(x => hd.append(el('span', null, x))); tb.append(hd);
    rows.forEach((z, k) => {
      if (!z.n) return;
      const row = el('div', 'sz5-r'); if (z.n < 30) row.classList.add('low');
      const pc = (x) => fmtPct(x / z.n) + '%', wr = z.sn ? z.sum / 10 / z.sn : null, we = z.sn ? z.es / 10 / z.sn : null;
      const v = (txt, col) => { const e = el('span', 'sz5-v', txt); e.style.color = col; return e; };
      row.append(el('b', null, r.CC_AISTK[k][0]), el('span', 'sz5-sh', z.n.toLocaleString('ru-RU')), v(pc(z.call), 'var(--ice)'), v(pc(z.rz), 'var(--bad)'), v(pc(z.fold), 'var(--good)'),
        wrNode('sz5-v', wr, we, 2));
      tb.append(row);
    });
    body.replaceChildren(tb);
  };
  card.append(stTitle, segBtns(posList.map(p => [p, p === 'TOT' ? 'Все без BB' : p]), CC_AIPOS, (k) => { CC_AIPOS = k; draw(); }), body,
    infoNote('Олл-ин — открытие на весь стек или почти на весь (за спиной меньше 0,5 BB). Колл / 3-бет / олл-ин / фолд — ваш ответ, винрейт — средний итог раздачи после вашего колла. Выберите вашу позицию; «Все без BB» — все позиции, кроме BB. Бледные строки — меньше 30 раздач.'));
  draw();
  return card;
}

// #5 — ответ против открытия с произвольными диапазонами: стек открывающего и мой стек (поля «от — до»)
function rangeForm(id, cur, onSet) {
  const f = el('form', 'mx-range');
  const mkIn = (sfx, ph, val) => { const i = el('input'); i.type = 'number'; i.id = id + sfx; i.min = '0'; i.max = '1000'; i.step = '0.5'; i.placeholder = ph; i.inputMode = 'decimal'; if (val != null) i.value = String(val); return i; };
  const lo = mkIn('Lo', 'от', cur ? cur[0] : null), hi = mkIn('Hi', 'до', cur && cur[1] < 1e8 ? cur[1] : null);
  const l1 = el('label', 'sr', 'от, BB'); l1.htmlFor = id + 'Lo'; const l2 = el('label', 'sr', 'до, BB'); l2.htmlFor = id + 'Hi';
  const go = el('button', 'btn mx-go' + (cur ? ' on' : ''), 'Показать'); go.type = 'submit';
  const clr = el('button', 'btn mx-clr', 'Сброс'); clr.type = 'button'; clr.hidden = !cur; clr.onclick = () => onSet(null);
  const err = el('span', 'mx-err');
  f.append(l1, lo, el('span', 'mx-dash', '—'), l2, hi, el('span', 'mx-unit', 'BB'), go, clr, err);
  f.onsubmit = (e) => {
    e.preventDefault();
    if (lo.value === '' && hi.value === '') { onSet(null); return; }
    const a = lo.value === '' ? 0 : parseFloat(lo.value), b = hi.value === '' ? 1e9 : parseFloat(hi.value);
    if (isNaN(a) || isNaN(b) || a < 0 || b <= a) { err.textContent = 'Верхняя граница должна быть больше нижней'; return; }
    onSet([a, b]);
  };
  return f;
}
const rangeTxt = (r) => (r ? r[0] + '–' + (r[1] < 1e8 ? r[1] : '∞') + ' BB' : 'любой');
function ccOppBlock(r) {
  const b = el('section', 'block cc-table'); b.append(numTag(5));
  const h = el('div', 'block-head'); h.append(el('h2', null, 'Ваш ответ против стека открывающего'), el('p', null, 'колл, 3-бет, олл-ин или фолд каждой рукой, когда перед вами был один рейз; стеки задаёте сами'));
  const seg = el('div', 'seg');
  ['MP', 'CO', 'BTN', 'SB', 'BB'].filter(p => r.cc[p].n >= SMALL).forEach(p => { const bt = el('button', uiState.ccOPos === p ? 'on' : '', p); bt.type = 'button'; bt.onclick = () => { uiState.ccOPos = p; uiState.ccOOpen = []; render(); }; seg.append(bt); });
  // позиция открывающего: можно выбрать одну или несколько — ответ считается суммарно против них
  const segO = el('div', 'seg seg-multi');
  const opts = ['UTG', 'MP', 'CO', 'BTN', 'SB'].filter(op => r.vs[uiState.ccOPos] && r.vs[uiState.ccOPos][op] && r.vs[uiState.ccOPos][op].n > 0);
  const sel = uiState.ccOOpen.filter(op => opts.includes(op));
  const ball = el('button', sel.length ? '' : 'on', 'Все'); ball.type = 'button'; ball.setAttribute('aria-pressed', String(!sel.length)); ball.onclick = () => { uiState.ccOOpen = []; render(); }; segO.append(ball);
  opts.forEach(op => { const on = sel.includes(op); const bt = el('button', on ? 'on' : '', op); bt.type = 'button'; bt.setAttribute('aria-pressed', String(on)); bt.onclick = () => { uiState.ccOOpen = on ? sel.filter(x => x !== op) : sel.concat([op]); render(); }; segO.append(bt); });
  const body = el('div', 'block-body'); body.append(handMatrix(r.mxO, ['3-бет', 'олл-ин', 'колл', 'фолд']));
  const side = el('div', 'mx-side');
  const leg = el('div', 'resp-legend row'); [['3-бет', 'var(--mx-raise)'], ['олл-ин', 'var(--mx-push)'], ['колл', 'var(--mx-limp)'], ['фолд', 'var(--mx-empty)']].forEach(([l, col]) => { const it = el('span'); const i = el('i'); i.style.background = col; if (col === 'var(--mx-empty)') i.style.border = '1px solid var(--line2)'; it.append(i, document.createTextNode(l)); leg.append(it); });
  const n = r.mxO.reduce((a, m) => a + m.n, 0);
  // одна форма: стек открывающего и мой стек, одна кнопка «Показать»
  const form = el('form', 'cc-opp-form');
  const mkIn = (id, ph, val) => { const i = el('input'); i.type = 'number'; i.id = id; i.min = '0'; i.max = '1000'; i.step = '0.5'; i.placeholder = ph; i.inputMode = 'decimal'; if (val != null) i.value = String(val); return i; };
  const pair = (id, cur, cap) => {
    const row = el('div', 'mx-range'); const lo = mkIn(id + 'Lo', 'от', cur ? cur[0] : null), hi = mkIn(id + 'Hi', 'до', cur && cur[1] < 1e8 ? cur[1] : null);
    const l1 = el('label', 'sr', cap + ' от, BB'); l1.htmlFor = id + 'Lo'; const l2 = el('label', 'sr', cap + ' до, BB'); l2.htmlFor = id + 'Hi';
    row.append(l1, lo, el('span', 'mx-dash', '—'), l2, hi, el('span', 'mx-unit', 'BB'));
    return { row, lo, hi };
  };
  const po = pair('ccOs', uiState.ccOStkR, 'Стек открывающего'), pm = pair('ccOm', uiState.ccOMyR, 'Мой стек');
  const err = el('span', 'mx-err');
  const go = el('button', 'btn mx-go' + (uiState.ccOStkR || uiState.ccOMyR ? ' on' : ''), 'Показать'); go.type = 'submit';
  const clr = el('button', 'btn mx-clr', 'Сброс'); clr.type = 'button'; clr.hidden = !(uiState.ccOStkR || uiState.ccOMyR);
  clr.onclick = () => { uiState.ccOStkR = null; uiState.ccOMyR = null; render(); };
  const btns = el('div', 'cc-opp-btns'); btns.append(go, clr);
  form.append(el('span', 'mx-cap', 'Стек открывающего'), po.row, el('span', 'mx-cap', 'Мой диапазон'), pm.row, btns, err);
  const read = (p) => {
    if (p.lo.value === '' && p.hi.value === '') return null;
    const a = p.lo.value === '' ? 0 : parseFloat(p.lo.value), b = p.hi.value === '' ? 1e9 : parseFloat(p.hi.value);
    return isNaN(a) || isNaN(b) || a < 0 || b <= a ? 'bad' : [a, b];
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    const o = read(po), m = read(pm);
    if (o === 'bad' || m === 'bad') { err.textContent = 'В каждом диапазоне «до» должно быть больше «от»'; return; }
    uiState.ccOStkR = o; uiState.ccOMyR = m; render();
  };
  side.append(leg, el('span', 'mx-cap', 'Ваша позиция'), seg, el('span', 'mx-cap', 'Позиция открывающего — можно несколько'), segO, form,
    el('span', 'muted small', 'Открывающий: ' + (sel.length ? sel.join(' + ') : 'любая позиция') + ', ' + rangeTxt(uiState.ccOStkR) + ' · вы: ' + rangeTxt(uiState.ccOMyR) + ' · ' + n.toLocaleString('ru-RU') + ' раз перед вами был один рейз'));
  side.append(infoNote('Задайте стек открывающего и свой стек в BB: «от» и «до» можно заполнить оба или одно (пустое «до» — без верхней границы). Нажмите «Показать» — матрица покажет ваши ответы ровно в таких раздачах. «Сброс» возвращает «любой». Клетка закрашена слева направо на долю ответов этой рукой: янтарная часть — 3-бет, синяя — олл-ин, зелёная — колл, тёмная — фолд. Бледная заливка — меньше 5 раздач.'));
  body.append(side);
  b.append(h, body);
  return b;
}

// #4 — какими руками вы коллируете, 3-бетите и фолдите против открытия: по позиции и вашему стеку (как #13 во вкладке «Открытие»)
function ccRangeBlock(r, o) {
  o = o || { tag: 4, title: 'Какие руки вы коллируете', sub: 'ваш ответ каждой рукой, когда перед вами был один рейз: колл, 3-бет, олл-ин или фолд', pos: 'ccPos', stk: 'ccStk', custom: 'ccCustom', mx: r.mx, stkCap: 'Ваш стек, BB', id: 'cc' };
  const b = el('section', 'block cc-table'); b.append(numTag(o.tag));
  const h = el('div', 'block-head'); h.append(el('h2', null, o.title), el('p', null, o.sub));
  const seg = el('div', 'seg');
  ['MP', 'CO', 'BTN', 'SB', 'BB'].filter(p => r.cc[p].n >= SMALL).forEach(p => { const bt = el('button', uiState[o.pos] === p ? 'on' : '', p); bt.type = 'button'; bt.onclick = () => { uiState[o.pos] = p; render(); }; seg.append(bt); });
  const body = el('div', 'block-body'); body.append(handMatrix(o.mx, ['3-бет', 'олл-ин', 'колл', 'фолд']));
  const side = el('div', 'mx-side');
  const segS = el('div', 'seg');
  MX_STK.forEach(([id, lab]) => { const bt = el('button', uiState[o.stk] === id ? 'on' : '', lab); bt.type = 'button'; bt.onclick = () => { uiState[o.stk] = id; render(); }; segS.append(bt); });
  const cr = el('form', 'mx-range'); cr.setAttribute('aria-label', 'Свой диапазон стека');
  const mkIn = (id, ph, val) => { const i = el('input'); i.type = 'number'; i.id = id; i.min = '0'; i.max = '1000'; i.step = '0.5'; i.placeholder = ph; i.inputMode = 'decimal'; if (val != null) i.value = String(val); return i; };
  const cur = uiState[o.stk] === 'custom' && uiState[o.custom] ? uiState[o.custom] : null;
  const inLo = mkIn(o.id + 'Lo', 'от', cur ? cur[0] : null), inHi = mkIn(o.id + 'Hi', 'до', cur && cur[1] < 1e8 ? cur[1] : null);
  const lLo = el('label', 'sr', 'Стек от, BB'); lLo.htmlFor = o.id + 'Lo'; const lHi = el('label', 'sr', 'Стек до, BB'); lHi.htmlFor = o.id + 'Hi';
  const go = el('button', 'btn mx-go' + (cur ? ' on' : ''), 'Показать'); go.type = 'submit';
  const err = el('span', 'mx-err');
  cr.append(lLo, inLo, el('span', 'mx-dash', '—'), lHi, inHi, el('span', 'mx-unit', 'BB'), go, err);
  cr.onsubmit = (e) => {
    e.preventDefault();
    const lo = inLo.value === '' ? 0 : parseFloat(inLo.value), hi = inHi.value === '' ? 1e9 : parseFloat(inHi.value);
    if (isNaN(lo) || isNaN(hi) || lo < 0 || hi <= lo) { err.textContent = 'Верхняя граница должна быть больше нижней'; return; }
    uiState[o.custom] = [lo, hi]; uiState[o.stk] = 'custom'; render();
  };
  const n = o.mx.reduce((a, m) => a + m.n, 0);
  const leg = el('div', 'resp-legend row'); [['3-бет', 'var(--mx-raise)'], ['олл-ин', 'var(--mx-push)'], ['колл', 'var(--mx-limp)'], ['фолд', 'var(--mx-empty)']].forEach(([l, col]) => { const it = el('span'); const i = el('i'); i.style.background = col; if (col === 'var(--mx-empty)') i.style.border = '1px solid var(--line2)'; it.append(i, document.createTextNode(l)); leg.append(it); });
  side.append(leg, el('span', 'mx-cap', 'Ваша позиция'), seg, el('span', 'mx-cap', o.stkCap), segS, el('span', 'mx-cap', 'Свой диапазон'), cr,
    el('span', 'muted small', (cur ? 'Стек ' + cur[0] + '–' + (cur[1] < 1e8 ? cur[1] : '∞') + ' BB: ' : '') + n.toLocaleString('ru-RU') + ' раз перед вами был один рейз'));
  side.append(infoNote('Клетка закрашена слева направо на долю ответов этой рукой: янтарная часть — 3-бет, синяя — олл-ин, зелёная — колл, тёмная — фолд. Наведите на клетку, чтобы увидеть проценты. Сверху от диагонали — одномастные, снизу — разномастные. Бледная заливка — меньше 5 раздач.'));
  body.append(side);
  b.append(h, body);
  return b;
}

let CC_BX = 'bb';
// таблица «позиция против позиции»: строки — ваша позиция, колонки — кто открыл
function ccVsTable(r) {
  const heroPos = r.CC_COLS.slice(1).filter(p => r.cc[p].n >= SMALL);
  const opCols = ['UTG', 'MP', 'CO', 'BTN', 'SB'].filter(op => heroPos.some(p => r.vs[p] && r.vs[p][op] && r.vs[p][op].n >= SMALL));
  const rows = heroPos.map(p => ({ key: p, label: p, data: r.vs[p] || {} }));
  const w = heatTable({ cols: opCols, rows, noTot: true });
  w.querySelectorAll('td.c').forEach(td => {
    const p = td.dataset.row, op = td.dataset.col;
    const z = op === 'TOT' ? r.hands[p] : r.vsHands[p] && r.vsHands[p][op];
    if (!z || !z.n) return;
    const it = { p, key: 'ccvs ' + p + op, title: 'Колд-колл · ' + p + (op === 'TOT' ? '' : ' против ' + op), o: { n: z.n, sum: z.sum, es: z.es }, mx: z.mx, ids: z.ids, sit: 2, act: 1, vlab: ' BB за колд-колл', nlab: ' колд-коллов' };
    const v = z.sum / 10 / z.n;
    td.classList.add('click'); td.tabIndex = 0; td.setAttribute('role', 'button');
    const show = (ev) => showHandPop(it, v, ev, td);
    td.addEventListener('mouseenter', show); td.addEventListener('mousemove', show); td.addEventListener('mouseleave', hideHandPop);
    td.addEventListener('click', (ev) => pinHandPop(it, v, ev, td));
    td.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pinHandPop(it, v, null, td); } });
  });
  const card = el('div', 'insight cc-table');
  card.append(numTag(3), el('span', 'k', 'Колд-колл: позиция против позиции'), el('span', 's', 'строки — ваша позиция, колонки — позиция открывающего; в ячейке — доля коллов'), w,
    infoNote('Пустые ячейки (--) — ситуация невозможна: открывающий ходит раньше вас. Наведите на ячейку — матрица рук, которыми вы коллировали против этой позиции, и их итог; клик закрепит окно, клик по руке откроет раздачи и реплеер. Бледные ячейки — меньше ' + SMALL + ' раздач.'));
  return card;
}

// таблица CC: наведение на ячейку — матрица рук, которыми вы коллировали, с итогом; клик — закрепить, раздачи и реплеер
function ccTable(r) {
  // позиции, где такой ситуации почти не бывает (UTG), не показываем
  const cols = r.CC_COLS.filter(k => k === 'TOT' || r.cc[k].n >= SMALL);
  const w = heatTable({ cols, groupGapBefore: cols.indexOf('SB') >= 0 ? cols.indexOf('SB') : cols.indexOf('BB'), rows: [{ label: 'Колд-колл', data: r.cc }] });
  w.querySelectorAll('td.c').forEach(td => {
    const col = td.dataset.col, z = r.hands[col]; if (!z || !z.n) return;
    const it = { p: col === 'TOT' ? null : col, key: 'cc ' + col, title: 'Колд-колл · ' + (col === 'TOT' ? 'все позиции без BB' : col), o: { n: z.n, sum: z.sum, es: z.es }, mx: z.mx, ids: z.ids, sit: 2, act: 1, vlab: ' BB за колд-колл', nlab: ' колд-коллов' };
    const v = z.sum / 10 / z.n;
    td.classList.add('click'); td.tabIndex = 0; td.setAttribute('role', 'button');
    const show = (ev) => showHandPop(it, v, ev, td);
    td.addEventListener('mouseenter', show); td.addEventListener('mousemove', show); td.addEventListener('mouseleave', hideHandPop);
    td.addEventListener('click', (ev) => pinHandPop(it, v, ev, td));
    td.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pinHandPop(it, v, null, td); } });
  });
  return w;
}
function renderCC(idx) {
  const ccStk = uiState.ccStk === 'custom' && uiState.ccCustom ? uiState.ccCustom : (MX_STK.find(z => z[0] === uiState.ccStk) || MX_STK[0])[2];
  const r = Stats.cc(DB, idx, { mxPos: uiState.ccPos, mxStk: ccStk, oPos: uiState.ccOPos, oStk: uiState.ccOStkR, oMy: uiState.ccOMyR, oOpen: uiState.ccOOpen });
  const page = el('div', 'page');
  const head = el('div', 'page-head');
  const h1 = el('h1'); h1.append(document.createTextNode('Колд-колл '), el('span', null, 'CC'));
  head.append(h1, el('p', null, 'Как часто вы вступаете в игру коллом, когда до вас был один рейзер.'));
  page.append(head);
  // #1 — общий колд-колл, по позициям и ваш ответ на открытие; #2 — таблица по позициям (в стиле вкладки RFI)
  const posRows = ['UTG', 'MP', 'CO', 'BTN', 'SB'].filter(p => r.cc[p].n >= SMALL).map(p => { const z = r.cc[p]; return [p, z.n ? z.x / z.n : null, p + ': ' + z.x + ' из ' + z.n]; });
  const c1 = card(1, 'Колд-коллите', '<em>' + pctTxt(r.cc.TOT) + '</em>', 'из ' + r.cc.TOT.n.toLocaleString('ru-RU') + ' открытий перед вами, без BB',
    fillBox(posStrip('По позициям', posRows), respTiles(r.resp, 'Ваш ответ на открытие', [['фолд', 'var(--good)'], ['колл', 'var(--ice)'], ['3-бет', 'var(--bad)']])));
  const c2 = el('div', 'insight');
  c2.append(numTag(2), el('span', 'k', 'Колд-колл по позициям'), ccTable(r));
  const note = infoNote('TOT — все позиции без BB (колл из BB — защита большого блайнда, показан отдельной колонкой). В SB колл открытия считается колд-коллом. Наведите на ячейку — покажется матрица рук, которыми вы коллировали, и их итог; клик закрепит окно, клик по руке откроет раздачи и реплеер. Бледные ячейки — меньше ' + SMALL + ' раздач.');
  c2.append(note);
  // #8 — винрейт колд-колла по позициям, как в RFI: наведение — руки, клик — закрепить, раздачи и реплеер
  const ccPos = r.CC_COLS.slice(1).filter(k => r.cc[k].n >= SMALL);
  const items = ccPos.map(p => { const h = r.hands[p]; return { p, key: 'cc' + p, o: { n: h.n, sum: h.sum, es: h.es }, mx: h.mx, ids: h.ids, sit: 2, act: 1, title: 'Колд-колл · ' + p, vlab: ' BB за колд-колл', nlab: ' колд-коллов' }; });
  const t = r.hands.TOT, avg = t.n ? t.sum / 10 / t.n : null, avgE = t.n ? t.es / 10 / t.n : null;
  LAST_NET_ITEMS = items;
  const tb = r.hands.BB, nAll = t.n + tb.n, allF = nAll ? (t.sum + tb.sum) / 10 / nAll : null, allE = nAll ? (t.es + tb.es) / 10 / nAll : null;
  const c8 = card(8, 'Результат колд-колла', wrHtml(avg, avgE, 2) + ' <small>BB за колд-колл</small>', null, netChart(items, avg, 'EV колд-колла'));
  c8.classList.add('wide');
  const zone = el('div', 'summary'); const pair = el('div', 'sum-pair'); pair.append(c1, c8); zone.append(pair);
  c2.classList.add('cc-table');
  zone.append(c2, ccVsTable(r), ccOppBlock(r), ccSizeBlock(r), ccAllinBlock(r));
  page.append(zone);
  return page;
}

function renderRFI(idx) {
  const r = Stats.rfi(DB, idx);
  const POS = r.RFI_COLS.slice(1);
  const page = el('div', 'page');

  // заголовок и выводы
  const head = el('div', 'page-head');
  const h1 = el('h1'); h1.append(document.createTextNode('Открытие рейзом '), el('span', null, 'RFI'));
  head.append(h1, el('p', null, 'Как часто вы открываете банк рейзом, когда до вас все сбросили: результат по позициям, диапазон, стил с поздних позиций, пуши и изоляция лимперов.'));
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
  const idx = Stats.selectHands(DB, { room: state.room, type: state.type, from: state.from, to: state.to, biFrom: state.biFrom, biTo: state.biTo, tbl: state.sub === 'TOT' ? null : state.sub });
  return state.player ? idx.filter(i => state.player.mask[i]) : idx; // выбран другой игрок — только его раздачи
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
  if (!DB) { $('selCount').textContent = '—'; CURRENT_IDX = []; $('content').replaceChildren(renderWelcome()); return; }
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
  $('fRoom').onchange = (e) => { state.room = e.target.value === '' ? null : +e.target.value; state.player = null; updatePlayer(); render(); }; // смена рума — снова ваш ник этого рума
  $('fType').onchange = (e) => { state.type = e.target.value === '' ? null : +e.target.value; render(); };
  $('fFrom').onchange = (e) => { state.from = +e.target.value; render(); };
  $('fTo').onchange = (e) => { state.to = +e.target.value; render(); };
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

// Шапка игрока: при выбранном руме — ник и объём этого рума, при Alias — общий ник и вся база
const ROOM_CODES = { GGPoker: 'GG', Winamax: 'WNX', PokerStars: 'PS', PokerDom: 'PDOM', WPN: 'WPN', iPoker: 'IPK', '888poker': '888', PartyPoker: 'PP' };
let ROOM_COUNTS = [];
const kFmt = (n) => (n >= 1000 ? Math.round(n / 1000) + 'k' : String(n));
// подпись героя в реплеере: «Вы» или ник выбранного соперника (функция — чтобы не зависеть от локальных имён в реплеере)
function heroLabel() { return state.player ? state.player.name : 'Вы'; }
function heroNickOf(room) { return (DB.nicks ? Object.keys(DB.nicks).find(n => DB.nicks[n] === DB.rooms[room]) : null) || DB.hero; }
function updatePlayer() {
  if (!DB) { $('roomBadge').textContent = 'НЕТ БАЗЫ'; $('nick').textContent = '—'; $('handsCount').textContent = ''; $('playerBtn').title = ''; $('playerBtn').disabled = true; return; }
  $('playerBtn').disabled = false;
  const opp = state.player, alias = !opp && state.room == null;
  const roomName = alias ? null : DB.rooms[opp ? opp.room : state.room];
  const nick = opp ? opp.name : alias ? DB.hero : heroNickOf(state.room);
  const count = opp ? opp.count : alias ? DB.count : ROOM_COUNTS[state.room] || 0;
  $('roomBadge').textContent = alias ? 'ALIAS' : (ROOM_CODES[roomName] || roomName.slice(0, 4).toUpperCase());
  $('roomBadge').classList.toggle('room', !alias && !opp);
  $('roomBadge').classList.toggle('opp', !!opp);
  $('playerBtn').classList.toggle('is-opp', !!opp);
  $('nick').textContent = nick;
  $('handsCount').textContent = count.toLocaleString('ru-RU') + ' раздач' + (opp ? ' · соперник · ' + roomName : alias ? ' · все румы' : ' · ' + roomName);
  $('demoTag').hidden = !DB.demo;
  $('playerBtn').title = 'Выбрать игрока' + (alias && DB.nicks ? '. Alias объединяет ники: ' + Object.keys(DB.nicks).map(n => n + ' (' + DB.nicks[n] + ')').join(', ') : '');
}

// ---------- выбор игрока: ваши ники и соперники из базы ----------
// ДЕМО: в базе героя нет имён соперников, поэтому соперники синтетические —
// каждому отдаётся детерминированная часть раздач его рума. После импорта с соперниками
// mask заменит настоящий список раздач игрока, остальная механика та же.
let OPPS = [];
function buildDemoOpps() {
  const A = ['Shark', 'River', 'Grind', 'Bluff', 'Stack', 'Tilt', 'Nuts', 'Lucky', 'Fold', 'Wolf', 'Ice', 'Dark', 'Royal', 'Chip', 'Ace', 'Turbo', 'Cold', 'Silent', 'Mad', 'Crazy'];
  const B = ['Hunter', 'Rat', 'Monk', 'King', 'Fox', 'Pilot', 'Baron', 'Ghost', 'Rider', 'Bear', 'Lord', 'Ninja', 'Viper', 'Owl', 'Duke', 'Bandit'];
  let seed = 7771; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const used = new Set(Object.keys(DB.nicks || {}).concat(DB.hero)), out = [];
  const roomW = ROOM_COUNTS.slice(), tot = roomW.reduce((a, b) => a + b, 0) || 1;
  for (let k = 0; k < 48; k++) {
    let name; do { const st = Math.floor(rnd() * 4); name = st === 0 ? A[Math.floor(rnd() * A.length)] + B[Math.floor(rnd() * B.length)] + Math.floor(rnd() * 99) : st === 1 ? A[Math.floor(rnd() * A.length)].toLowerCase() + '_' + B[Math.floor(rnd() * B.length)].toLowerCase() : st === 2 ? B[Math.floor(rnd() * B.length)] + 'Of' + A[Math.floor(rnd() * A.length)] : A[Math.floor(rnd() * A.length)] + Math.floor(1000 + rnd() * 9000); } while (used.has(name));
    used.add(name);
    let r = rnd() * tot, room = 0; while (room < roomW.length - 1 && (r -= roomW[room]) > 0) room++;
    const target = Math.max(120, Math.round(5200 * Math.pow(0.9, k) * (0.8 + rnd() * 0.4)));
    const p = Math.min(1, target / Math.max(1, ROOM_COUNTS[room])), salt = Math.floor(rnd() * 1e9);
    const mask = new Uint8Array(DB.count); let count = 0;
    for (let i = 0; i < DB.count; i++) if (DB.cols.room[i] === room && (((i + 1) * 2654435761 ^ salt) >>> 0) / 4294967296 < p) { mask[i] = 1; count++; }
    out.push({ name, room, count, mask });
  }
  return out.sort((a, b) => b.count - a.count);
}

function choosePlayer(kind, v) {
  if (kind === 'alias') { state.player = null; state.room = null; }
  else if (kind === 'hero') { state.player = null; state.room = v; }
  else { state.player = v; state.room = v.room; }
  $('fRoom').value = state.room == null ? '' : String(state.room); // ник выбран — рум выставляется сам
  closePlayerMenu(); updatePlayer(); render();
}

let PM_OPEN = false;
function openPlayerMenu() {
  if (!DB) return;
  const m = $('playerMenu'); m.replaceChildren(); PM_OPEN = true;
  $('playerBtn').setAttribute('aria-expanded', 'true');
  const item = (opts) => {
    const b = el('button', 'pm-item' + (opts.on ? ' on' : '')); b.type = 'button';
    if (opts.on) b.setAttribute('aria-current', 'true');
    const bd = el('span', 'badge-reg' + (opts.cls ? ' ' + opts.cls : ''), opts.badge);
    const t = el('span', 'pm-t'); t.append(el('b', null, opts.name), el('span', null, opts.sub));
    b.append(bd, t, el('span', 'pm-n', opts.count.toLocaleString('ru-RU')));
    b.onclick = opts.pick; return b;
  };
  const code = (r) => ROOM_CODES[DB.rooms[r]] || DB.rooms[r].slice(0, 4).toUpperCase();
  // 1) ваши ники
  const mine = el('div', 'pm-sec'); mine.append(el('div', 'pm-h', 'Ваши ники'));
  mine.append(item({ badge: 'ALIAS', name: DB.hero, sub: 'все румы вместе', count: DB.count, on: !state.player && state.room == null, pick: () => choosePlayer('alias') }));
  DB.rooms.forEach((rn, r) => { if (!ROOM_COUNTS[r]) return; mine.append(item({ badge: code(r), cls: 'room', name: heroNickOf(r), sub: rn, count: ROOM_COUNTS[r], on: !state.player && state.room === r, pick: () => choosePlayer('hero', r) })); });
  // 2) другие игроки базы
  const oth = el('div', 'pm-sec pm-oth');
  const hh = el('div', 'pm-h', 'Другие игроки в базе');
  const q = el('input', 'pm-q'); q.type = 'search'; q.placeholder = 'Найти ник'; q.setAttribute('aria-label', 'Найти игрока по нику');
  const list = el('div', 'pm-list');
  const fill = () => {
    const s = q.value.trim().toLowerCase(); list.replaceChildren();
    const rows = OPPS.filter(o => !s || o.name.toLowerCase().includes(s));
    rows.forEach(o => list.append(item({ badge: code(o.room), cls: 'opp', name: o.name, sub: DB.rooms[o.room], count: o.count, on: state.player === o, pick: () => choosePlayer('opp', o) })));
    if (!rows.length) list.append(el('p', 'pm-empty', 'Никого не нашли'));
  };
  q.oninput = fill; fill();
  oth.append(hh, q, list);
  m.append(mine, oth); m.hidden = false;
  const cur = m.querySelector('.pm-item.on') || m.querySelector('.pm-item'); if (cur) cur.focus();
  if (state.player) { const on = list.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' }); }
}
function closePlayerMenu(focusBtn) {
  if (!PM_OPEN) return; PM_OPEN = false;
  $('playerMenu').hidden = true; $('playerBtn').setAttribute('aria-expanded', 'false');
  if (focusBtn) $('playerBtn').focus();
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
async function loadDb() {
  if (!mda.dbMeta) return null;
  const meta = await mda.dbMeta(); if (!meta) return null;
  const cols = {};
  for (const [name, type] of meta.cols) { const b = await mda.dbCol(name); if (b) cols[name] = typedCol(b, type); }
  return Object.assign({}, meta, { cols });
}

function setDb(db) {
  DB = db;
  if (typeof REPLAYS !== 'undefined') REPLAYS = null; // реплеи новой базы загрузятся заново
  unpin();
  document.querySelector('.filters').hidden = !db;
  if (!db) { $('demoTag').hidden = true; state.player = null; OPPS = []; closePlayerMenu(); updatePlayer(); render(); return; }
  ROOM_COUNTS = db.rooms.map(() => 0);
  db.cols.room.forEach(r => { if (r >= 0) ROOM_COUNTS[r]++; });
  Object.assign(state, { room: null, player: null, type: null, from: null, to: null, biFrom: null, biTo: null });
  OPPS = buildDemoOpps(); closePlayerMenu();
  setupFilters();
  updatePlayer();
  render();
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
  const b2 = el('button', 'btn', 'Посмотреть на демо-данных'); b2.type = 'button'; b2.onclick = async () => setDb(await mda.demoDb());
  const btns = el('div', 'welcome-btns'); btns.append(b1, b2);
  w.append(ic, el('h1', null, 'Загрузите свою базу раздач'),
    el('p', null, 'Укажите папку или zip-архив с историями турнирных раздач. Программа найдёт ваши ники, разберёт раздачи и построит все вкладки по вашей игре.'),
    btns,
    el('p', 'muted small', 'Поддерживаются истории в формате PokerStars (в том числе экспорт GGPoker и PokerDom), Winamax и ACR / WPN. База хранится только на этом компьютере и никуда не отправляется.'));
  return w;
}

function showImport(r) {
  if (!r || r.canceled) return;
  IMPORT_SCAN = r;
  $('impResult').hidden = false; $('impProgress').hidden = true;
  $('impSummary').textContent = 'Найдено ' + r.files.toLocaleString('ru-RU') + ' файлов, ' + fmtBytes(r.bytes) + ', примерно ' + r.estHands.toLocaleString('ru-RU') + ' раздач. Источник: ' + r.source;
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
  $('impNote').hidden = !!nicks.length;
  $('impNote').textContent = nicks.length ? '' : (r.nicks ? 'Не удалось найти ники героя: в файлах нет поддерживаемых историй раздач.' : 'В онлайн-превью загрузка не работает — только в установленной программе.');
  const list = $('nickList'); list.replaceChildren();
  nicks.forEach((n, k) => {
    const row = el('label', 'nick-row');
    const cb = el('input'); cb.type = 'checkbox'; cb.checked = true; cb.dataset.nick = n.nick;
    const sel = el('select'); IMPORT_ROOMS.forEach(rm => { const o = el('option', null, rm); o.value = rm; if (rm === n.room) o.selected = true; sel.append(o); });
    if (!IMPORT_ROOMS.includes(n.room)) { const o = el('option', null, n.room); o.value = n.room; o.selected = true; sel.prepend(o); }
    sel.setAttribute('aria-label', 'Рум для ника ' + n.nick);
    row.append(cb, el('b', null, n.nick), sel, el('span', 'muted small', n.hits.toLocaleString('ru-RU') + ' файлов'));
    cb.onchange = () => { syncImportBtn(); runEstimate(); };
    list.append(row);
  });
  if (!$('aliasName').value && nicks.length) $('aliasName').value = nicks[0].nick;
  syncImportBtn();
  $('impPlan').hidden = !nicks.length;
  if (nicks.length) { showBaseLocation(); runEstimate(); }
}
function syncImportBtn() { $('doImport').disabled = !document.querySelector('#nickList input:checked'); }

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
  $('estHands').textContent = '≈ ' + EST.hands.toLocaleString('ru-RU');
  $('estSize').textContent = '≈ ' + fmtBytes(EST.bytes);
  $('estTime').textContent = fmtDur(EST.seconds);
  const need = EST.bytes * 1.3 + 64 * 1024 * 1024; // запас на временные файлы при сборке
  const short = free != null && free < need;
  $('estFree').classList.toggle('bad', short); $('estSize').classList.toggle('bad', short);
  $('estNote').classList.toggle('bad', short);
  $('estNote').textContent = short
    ? 'Не хватит места: на время загрузки нужно около ' + fmtBytes(need) + '. Выберите другую папку или диск.'
    : 'Оценка по образцу ' + fmtBytes(EST.sampleBytes) + ' из ' + fmtBytes(EST.totalBytes) + ' ваших историй на этом компьютере (' + EST.cpus + ' ядер, EV считается в ' + EST.threads + ' потоков). Точные цифры — после загрузки.';
  $('doImport').disabled = short || !document.querySelector('#nickList input:checked');
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
  document.querySelectorAll('#nickList .nick-row').forEach(r => { const cb = r.querySelector('input'); if (cb.checked) nicks[cb.dataset.nick] = r.querySelector('select').value; });
  if (!Object.keys(nicks).length) return;
  const alias = $('aliasName').value.trim() || Object.keys(nicks)[0];
  $('doImport').disabled = true; $('impProgress').hidden = false;
  $('progFill').style.width = '0%'; $('progText').textContent = 'Начинаю разбор…';
  const t0 = Date.now();
  mda.onProgress((m) => {
    // этапы: разбор файлов (до 70% полосы) и расчёт EV по олл-инам (оставшиеся 30%)
    const f = m.stage === 'ev' ? 0.7 + 0.3 * m.done / Math.max(1, m.total) : 0.7 * m.done / Math.max(1, m.total);
    $('progFill').style.width = (f * 100).toFixed(1) + '%';
    const el2 = (Date.now() - t0) / 1000, left = f > 0.03 ? el2 / f - el2 : null;
    $('progText').textContent = (m.stage === 'ev'
      ? 'Считаю EV олл-инов: ' + m.done.toLocaleString('ru-RU') + ' из ' + m.total.toLocaleString('ru-RU')
      : 'Разобрано файлов: ' + m.done.toLocaleString('ru-RU') + ' из ' + m.total.toLocaleString('ru-RU')) + ' · ваших раздач: ' + m.hands.toLocaleString('ru-RU') + (left != null ? ' · осталось ' + fmtDur(left) : '');
  });
  const res = await mda.runImport({ nicks, alias });
  if (res.type === 'error' || res.error) { $('progText').textContent = 'Ошибка: ' + (res.message || res.error); syncImportBtn(); return; }
  if (!res.hands) { $('progText').textContent = 'Раздач с выбранными никами не нашлось. Проверьте ники.'; syncImportBtn(); return; }
  $('progFill').style.width = '100%';
  $('progText').textContent = 'Готово: ' + res.hands.toLocaleString('ru-RU') + ' раздач' + (res.dup ? ', повторов пропущено: ' + res.dup.toLocaleString('ru-RU') : '') + '.';
  setDb(await loadDb());
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
  setupImport(); setupPlayerMenu();
  const db = await loadDb();
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
