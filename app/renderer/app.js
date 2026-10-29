'use strict';
/* global mda, Stats */
const $ = (id) => document.getElementById(id);
// Русские названия турниров «кракозябрами» (UTF-8, прочитанный как Windows-1252): «ÐŸÐžÐšÐ•Ð ÐžÐš» → «ПОКЕРОК».
// Так записаны некоторые выгрузки; у раздач, загруженных до 0.7.20, название исправляется при показе.
const CP1252B = { 0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F };
function fixMojibake(str) {
  str = String(str || ''); if (!/[ÐÑâ][\u0080-¿Œ-™]/.test(str)) return str;
  if (str.includes(' · ')) return str.split(' · ').map(fixMojibake).join(' · '); // « · #номер» дописывает программа — части по отдельности
  const b = []; for (const ch of str) { const c = ch.codePointAt(0); if (c === 0x20 && (b[b.length - 1] === 0xD0 || b[b.length - 1] === 0xD1)) b.push(0xA0); /* «Р» = D0 A0: неразрывный пробел стал обычным */ else if (c <= 0xFF) b.push(c); else if (CP1252B[c] != null) b.push(CP1252B[c]); else return str; }
  const out = new TextDecoder('utf-8').decode(new Uint8Array(b)).replace(/\uFFFD+$/, ''); // название бывает обрезано посреди буквы
  return out.includes('\uFFFD') ? str : out;
}
window.fixMojibake = fixMojibake;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

let DB = null;
let CURRENT_IDX = [];
let LAST_NET_ITEMS = [];
const state = { tab: 'rfi', sub: 'TOT', alias: 0, nickView: null, nickA: null, room: null, player: null, type: null, from: null, to: null,  };

// ---------- вкладки (группы и список будем менять) ----------
const GROUPS = [
  { title: 'Префлоп', tabs: [
    { id: 'rfi', code: 'RFI', label: 'Открытие', render: renderRFI },
    { id: 'cc', code: 'CC', label: 'Колд-колл', render: renderCC, plan: 'Колд-колл против открытия по позициям, сайзингам открытия и стеку.' },
    { id: '3bet', code: '3B', label: '3-бет', render: renderTB },
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
  ] },
  { title: 'База', tabs: [
    { id: 'aliases', code: 'ALS', label: 'Редактор алиасов', render: () => renderAliasEditor() }
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
// ячейка таблицы: цвет показывает, как часто бывает действие (бледный — редко, насыщенный — часто); цифры всегда тёмные
const HEAT = { amber: [[247, 232, 196], [222, 146, 28]], ice: [[214, 234, 245], [62, 152, 204]] };
function heat(td, p, max, tone) {
  const [lo, hi] = HEAT[tone === 'ice' ? 'ice' : 'amber'];
  const t = max > 0 ? Math.min(1, p / max) : 0;
  td.style.background = 'rgb(' + lo.map((v, k) => Math.round(v + (hi[k] - v) * t)).join(',') + ')';
  td.style.color = '#15120c';
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
  const scaleKey = (r, ri) => (r.own ? 'own' + ri : r.tone || 'amber'); // own — своя шкала цвета у строки (другая величина в той же таблице)
  o.rows.forEach((r, ri) => {
    const tone = scaleKey(r, ri);
    o.cols.forEach(c => { const cc = r.data[c]; if (cc && cc.n >= SMALL) maxBy[tone] = Math.max(maxBy[tone] || 0, cc.x / cc.n); });
  });
  o.rows.forEach((r, ri) => {
    const tr = el('tr', r.split ? 'split' : null);
    tr.append(el('td', 'lbl' + (r.sub ? ' sub' : ''), r.label));
    o.cols.forEach((c, i) => {
      if (o.groupGapBefore === i) tr.append(el('td', 'gap'));
      const cc = r.data[c], p = rate(cc);
      const td = el('td', 'c' + (i === 0 && !o.noTot ? ' tot' : '')); td.dataset.col = c; td.dataset.row = r.key || r.label;
      if (p == null) { td.classList.add('na'); td.textContent = '--'; td.title = 'нет раздач'; }
      else {
        td.textContent = fmtPct(p);
        heat(td, p, maxBy[scaleKey(r, ri)] || p || 1, r.tone);
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
const uiState = { mxPos: 'UTG', mxStk: '20–30', mxCustom: null, ccPos: 'BTN', ccStk: '20–30', ccCustom: null, ccOPos: 'BTN', ccOStkR: null, ccOMyR: null, ccOOpen: [], tbOPos: 'BTN', tbOStkR: null, tbOMyR: null, tbOOpen: [], tbRes: 'all', tbResC: null, tbResT: 'all' };
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
// после клика по кнопке (переключатель, «Показать», «Сброс») страница перерисовывается под неподвижной мышью —
// всплывающие окна при наведении не открываются, пока мышь не сдвинется хотя бы на 24 px от места клика
let HMUTE = null;
document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('button') && !e.target.closest('.hand-pop, .szmx')) { HMUTE = { x: e.clientX, y: e.clientY }; [typeof hideHandPop === 'function' && hideHandPop, typeof hideSzMx === 'function' && hideSzMx, typeof hideGroupTip === 'function' && hideGroupTip, typeof hideMxTip === 'function' && hideMxTip].forEach(f => { if (f) try { f(); } catch (x) { /* окна ещё нет */ } }); } }, true);
function hoverMuted(e) { if (!HMUTE || !e || e.clientX == null) return false; if (Math.hypot(e.clientX - HMUTE.x, e.clientY - HMUTE.y) < 24) return true; HMUTE = null; return false; }
window.hoverMuted = hoverMuted;
let mxTip = null;
function showMxTip(info, e) {
  if (hoverMuted(e)) return;
  if (!mxTip) { mxTip = el('div', 'mx-tip'); mxTip.setAttribute('role', 'tooltip'); document.body.append(mxTip); }
  mxTip.replaceChildren();
  const h = el('div', 'mt-h'); h.append(el('b', null, info.name), el('span', null, info.n ? info.n + ' раз' : 'не было'));
  mxTip.append(h);
  if (info.n) {
    const L = info.labels || ['рейз', 'олл-ин', 'лимп / колл', 'фолд'];
    [[L[0], info.rz, 'var(--mx-raise)'], [L[1], info.ai, 'var(--mx-push)'], [L[2], info.lp, 'var(--mx-limp)'], [L[3], info.fo, 'var(--mx-empty)']].filter(([lab]) => lab).forEach(([lab, k, col]) => {
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

function handMatrix(mx, labels, opt) {
  opt = opt || {}; // opt.fold — закрасить и долю фолда (своим цветом), а не оставлять тёмной
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
      [[rz, ''], [ai, 'push'], [lp, 'limp'], [opt.fold ? (c.fo != null ? c.fo : c.n - c.x - lp) : 0, 'fold']].forEach(([cnt, cls]) => {
        if (!cnt) return;
        const f = el('div', 'mx-fill' + (cls ? ' ' + cls : '')); f.style.left = (left / c.n * 100).toFixed(2) + '%'; f.style.width = (cnt / c.n * 100).toFixed(2) + '%';
        cell.append(f); left += cnt;
      });
      if (c.n < 5) cell.classList.add('low');
    }
    const lab = el('div', 'mx-lab'); lab.append(el('span', 'h', name));

    cell.append(lab);
    const info = { name, n: c.n, rz: c.x - (c.ai || 0), ai: c.ai || 0, lp: c.lp || 0, fo: c.fo != null ? c.fo : c.n - c.x - (c.lp || 0), labels };
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
function showGroupTip(pos, label, k, z, hands, e, verb) {
  if (hoverMuted(e)) return;
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
  groupTip.append(grid, el('div', 'gt-f', 'Выделены руки группы; в клетке — результат руки с ' + pos + ' в BB. Серые — руки группы, которыми ' + (verb || 'не открывались') + '. Клик — закрепить окно и открыть раздачи.'));
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
  if (hoverMuted(e)) return;
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

// Переключатели над графиком «Результат …» (RFI #8, колд-колл #8, 3-бет #2): тип действия, ваш стек и свой диапазон стека.
// pre — префикс ключей в uiState (S — стек, C — свой диапазон, T — тип); types — кнопки типа или null
const RES_STK = [['all', 'Любой стек', null], ['s15', '< 15', [0, 15]], ['s25', '15–25', [15, 25]], ['s40', '25–40', [25, 40]], ['s40p', '40+', [40, 1e9]]];
function resFilter(pre, types) {
  const S = uiState, cust = S[pre + 'S'] === 'custom' && S[pre + 'C'] ? S[pre + 'C'] : null;
  const rng = cust || (RES_STK.find(x => x[0] === S[pre + 'S']) || RES_STK[0])[2], ty = types ? (S[pre + 'T'] || 'all') : 'all', c = DB.cols;
  const pass = (i) => (!rng || (c.bb[i] >= rng[0] * 10 && c.bb[i] < rng[1] * 10)) && (ty === 'all' || (ty === 'ai' ? c.act[i] === 3 : c.act[i] === 2));
  const ctl = el('div', 'tb-res-ctl');
  if (types) ctl.append(segBtns(types, ty, (k) => { S[pre + 'T'] = k; renderNext(); }));
  ctl.append(stkSeg(cust, S[pre + 'S'] || 'all', (k) => { S[pre + 'S'] = k; renderNext(); }),
    rangeForm(pre + 'Rng', cust, (v) => { if (v) { S[pre + 'C'] = v; S[pre + 'S'] = 'custom'; } else { S[pre + 'C'] = null; S[pre + 'S'] = 'all'; } render(); }));
  const tyLab = types && ty !== 'all' ? (types.find(x => x[0] === ty) || [])[1] : '';
  const label = (n, what) => el('span', 'muted small tb-res-n', [tyLab, rng ? (tyLab ? 'ваш' : 'Ваш') + ' стек ' + rangeTxt(rng) : ''].filter(Boolean).join(', ') + (tyLab || rng ? ': ' : '') + n.toLocaleString('ru-RU') + ' ' + what);
  return { rng, ty, flt: !!rng || ty !== 'all', pass, ctl, label };
}
// кнопки стека с постоянным местом под свой диапазон: пока его нет — «свой» (неактивна), после «Показать» — «20–30 BB»;
// ширина ряда не меняется, кнопки не прыгают
function stkSeg(cust, cur, on) {
  const seg = segBtns(RES_STK.map(x => [x[0], x[1]]).concat([['custom', cust ? rangeTxt(cust) : 'свой']]), cust ? 'custom' : cur, on);
  const last = seg.lastElementChild; last.classList.add('res-cust'); if (!cust) { last.disabled = true; last.title = 'Введите свой диапазон ниже и нажмите «Показать»'; }
  return seg;
}
// шапка карточки «Результат …»: слева крупно итог и подпись выборки, справа — переключатели
function resHead(card) {
  const k = card.querySelector(':scope > .k'), v = card.querySelector(':scope > .v'), ctl = card.querySelector('.tb-res-ctl'), lab = card.querySelector('.tb-res-n');
  if (!k || !v || !ctl) return card;
  const top = el('div', 'res-top'), left = el('div', 'res-left');
  left.append(k, v); if (lab) left.append(lab);
  top.append(left, ctl);
  const tag = card.querySelector(':scope > .num-tag'); if (tag) tag.after(top); else card.prepend(top);
  return card;
}
// раздачи набора (ids) под фильтр: итог, матрица рук, список
function subHands(z, pass) {
  const c = DB.cols, E = EVcol(), o = { n: 0, sum: 0, es: 0, ids: [], mx: Array.from({ length: 169 }, () => ({ n: 0, sum: 0, es: 0 })) };
  (z.ids || []).forEach(i => { if (!pass(i)) return; o.n++; o.sum += c.net[i]; o.es += E[i]; o.ids.push(i); if (c.hc[i] >= 0) { const m = o.mx[c.hc[i]]; m.n++; m.sum += c.net[i]; m.es += E[i]; } });
  return o;
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
  // #8 — результат открытий по позициям; переключатели: открытие рейзом / олл-ином, ваш стек, свой диапазон
  const F8 = resFilter('rfiRes', [['all', 'Все открытия'], ['nai', 'Не олл-ин'], ['ai', 'Олл-ин']]);
  let it8, avg8, ev8, n8;
  if (!F8.flt) { it8 = ['UTG', 'MP', 'CO', 'BTN', 'SB'].map(p => ({ p, o: x.openNetPos[p], mx: x.netMx[p], r: x.respPos[p] })); avg8 = nb == null ? null : nb / 100; ev8 = perEv(x.openNet); n8 = x.openNet.n; }
  else {
    const cc = DB.cols, EVc = EVcol(), H = {}; let T = { n: 0, sum: 0, es: 0 };
    ['UTG', 'MP', 'CO', 'BTN', 'SB'].forEach(p => { H[p] = { n: 0, sum: 0, es: 0, ids: [], mx: Array.from({ length: 169 }, () => ({ n: 0, sum: 0, es: 0 })), r: [0, 0, 0] }; });
    for (const i of idx) { if (cc.sit[i] !== 0 || cc.act[i] < 2) continue; const z = H[Stats.POS[cc.pos[i]]]; if (!z || !F8.pass(i)) continue; z.n++; z.sum += cc.net[i]; z.es += EVc[i]; z.ids.push(i); T.n++; T.sum += cc.net[i]; T.es += EVc[i]; if (cc.hc[i] >= 0) { const m = z.mx[cc.hc[i]]; m.n++; m.sum += cc.net[i]; m.es += EVc[i]; } if (cc.orsp && cc.orsp[i] >= 0) z.r[cc.orsp[i]]++; }
    it8 = ['UTG', 'MP', 'CO', 'BTN', 'SB'].map(p => ({ p, key: 'rfi8 ' + p + F8.ty + (F8.rng || []).join('-'), o: { n: H[p].n, sum: H[p].sum, es: H[p].es }, mx: H[p].mx, ids: H[p].ids, r: H[p].r }));
    avg8 = T.n ? T.sum / 10 / T.n : null; ev8 = T.n ? T.es / 10 / T.n : null; n8 = T.n;
  }
  LAST_NET_ITEMS = it8;
  const box8 = el('div'); box8.append(F8.ctl, F8.label(n8, 'открытий'), netChart(it8, avg8, 'EV открытий'));
  const c8 = resHead(card(8, 'Результат открытий', wrHtml(avg8, ev8, 2) + ' <small>BB за открытие</small>', null, box8));
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
  ['UTG', 'MP', 'CO', 'BTN', 'SB'].forEach(p => { const b = el('button', uiState.mxPos === p ? 'on' : '', p); b.type = 'button'; b.onclick = () => { uiState.mxPos = p; renderNext(); }; seg.append(b); });
  const mxBody = el('div', 'block-body'); mxBody.append(handMatrix(x.mx));
  const mxSide = el('div', 'mx-side');
  const segS = el('div', 'seg');
  MX_STK.forEach(([id, lab]) => { const b = el('button', uiState.mxStk === id ? 'on' : '', lab); b.type = 'button'; b.onclick = () => { uiState.mxStk = id; renderNext(); }; segS.append(b); });
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
// окно с матрицей ответа на открытие одного размера (строка #6). Наведение — посмотреть, клик — закрепить;
// в закреплённом окне переключатель: диапазон (колл / 3-бет / олл-ин / фолд), факт BB с каждой рукой, EV BB с каждой рукой
let szMx = null, SZMX_PIN = null, SZMX_MODE = 'rng', SZMX_SEL = null, SZMX_LIST = null, SZMX_PART = 'all'; // SZMX_SEL — рука, раздачи которой открыты справа
function szMxEl() {
  if (!szMx) {
    szMx = el('div', 'szmx'); szMx.setAttribute('role', 'dialog'); szMx.hidden = true; document.body.append(szMx);
    document.addEventListener('mousedown', (e) => { if (SZMX_PIN && !szMx.contains(e.target) && !e.target.closest('.has-mx, .il-bg, .rp-bg, .rv-bg, [role=dialog]')) unpinSzMx(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && SZMX_PIN && !document.querySelector('.il-bg, .rv-bg')) unpinSzMx(); });
  }
  return szMx;
}
// раздачи одной руки из строки #6 — список с реплеером
// как в окне матрицы результата (hands-ui.js): матрица остаётся слева, раздачи руки — справа в том же окне
function szHandList(title, z, k, name) { SZMX_SEL = { k, name }; drawSzMx(title, z, true); centerPop(szMx); }
function szValGrid(mx, mode, onPick) {
  const R = 'AKQJT98765432', wrap = el('div', 'szv');
  const vals = mx.filter(c => c.n >= 3).map(c => Math.abs((mode === 'ev' ? c.es : c.sum) / 10 / c.n)).sort((a, b) => a - b);
  const scale = Math.max(1, vals[Math.floor(vals.length * 0.9)] || 1); // крайние 10% не растягивают шкалу цвета
  for (let i = 0; i < 13; i++) for (let j = 0; j < 13; j++) {
    const c = mx[i * 13 + j], name = i === j ? R[i] + R[j] : i < j ? R[i] + R[j] + 's' : R[j] + R[i] + 'o';
    const cell = el('div', 'szv-c'); cell.append(el('span', 'h', name));
    if (!c.n) cell.classList.add('na');
    else {
      const v = (mode === 'ev' ? c.es : c.sum) / 10 / c.n, t = Math.min(1, Math.abs(v) / scale);
      cell.style.background = 'rgba(' + (v >= 0 ? 'var(--good-rgb)' : 'var(--bad-rgb)') + ',' + (0.18 + 0.6 * t).toFixed(2) + ')';
      cell.append(el('span', 'v', (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(Math.abs(v) >= 10 ? 0 : 1)));
      if (c.n < 5) cell.classList.add('low');
      cell.title = name + ': ' + signed(c.sum / 10 / c.n, 2) + ' BB факт · ' + signed(c.es / 10 / c.n, 2) + ' BB EV · ' + c.n + ' раз — нажмите, чтобы открыть раздачи';
      if (onPick) { const k = i * 13 + j; cell.classList.add('click'); cell.tabIndex = 0; cell.setAttribute('role', 'button'); cell.onclick = () => onPick(k, name); cell.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(k, name); } }; }
    }
    wrap.append(cell);
  }
  return wrap;
}
function drawSzMx(title, z, pinned) {
  const z0 = z; // исходные данные окна: z ниже может стать выборкой одной вкладки (колл / рейз / фолд)
  const m = szMxEl(); if (SZMX_LIST) { SZMX_LIST.stop(); SZMX_LIST = null; } m.replaceChildren(); m.classList.toggle('pinned', !!pinned);
  const sel = pinned ? SZMX_SEL : null; m.classList.toggle('with-list', !!sel);
  const left = el('div', 'szmx-l');
  const h = el('div', 'szmx-h'); h.append(el('b', null, title), el('span', null, z.n.toLocaleString('ru-RU') + ' раз'));
  if (pinned) { const x = el('button', 'szmx-x', '×'); x.type = 'button'; x.title = 'Закрыть'; x.setAttribute('aria-label', 'Закрыть'); x.onclick = unpinSzMx; h.append(x); }
  m.append(h);
  const mode = pinned ? SZMX_MODE : 'rng';
  // вкладки по вашему ответу (весь диапазон / колл / 5-бет / фолд) — если окно их даёт (z.parts); в каждой — диапазон, факт и EV
  const PART = pinned && z.parts && SZMX_PART !== 'all' && z.parts[SZMX_PART] ? SZMX_PART : 'all';
  if (pinned && z.parts) {
    const segP = el('div', 'szmx-part'); segP.setAttribute('role', 'group'); segP.setAttribute('aria-label', 'Какой ответ');
    // вкладки-карточки: итог раздач с этим ответом в BB за раздачу — факт и EV (у фолда — только число раздач)
    const tot = (zz) => zz.rmx.reduce((acc, m) => { acc.s += m.sum; acc.e += m.es; acc.n += m.n; return acc; }, { s: 0, e: 0, n: 0 });
    [['all', 'Весь диапазон'], ['call', z.labels[2] || 'колл'], ['rz', z.labels[0] || 'рейз'], ['fold', z.labels[3] || 'фолд']].forEach(([k, t]) => {
      const zk = k === 'all' ? z : z.parts[k], n = zk.n, b = el('button', 'szmx-pt' + (PART === k ? ' on' : '')); b.type = 'button'; b.disabled = !n; b.setAttribute('aria-pressed', String(PART === k));
      const top = el('span', 'pt-h'); top.append(el('b', null, t), el('span', null, n.toLocaleString('ru-RU') + ' раз')); b.append(top);
      if (k !== 'fold' && n) { const T = tot(zk); const f = T.n ? T.s / 10 / T.n : null, e = T.n ? T.e / 10 / T.n : null; const v = el('span', 'pt-v'); v.append(el('span', f >= 0 ? 'up' : 'down', signed(f, 2)), el('span', 'pt-ev ' + (e >= 0 ? 'up' : 'down'), 'EV ' + signed(e, 2))); b.append(v); b.title = t + ': ' + signed(f, 2) + ' BB факт, ' + signed(e, 2) + ' BB EV за раздачу, ' + n + ' раз; всего ' + signed(T.s / 10, 1) + ' BB / EV ' + signed(T.e / 10, 1) + ' BB'; }
      else if (k === 'fold') b.append(el('span', 'pt-v muted', 'без итога'));
      b.onclick = () => { SZMX_PART = k; SZMX_SEL = null; drawSzMx(title, z0, true); }; segP.append(b);
    });
    left.append(segP, el('div', 'szmx-ptcap', 'BB за раздачу: факт и EV. «Весь диапазон» — все ответы вместе, включая фолды. 5-бет — любой ваш рейз на 4-бет: и олл-ином, и не олл-ином.'));
  }
  if (PART !== 'all') {
    // только этот ответ: в «Диапазоне» — доля этого ответа у каждой руки, в факте и EV — итог именно этих раздач
    const pz = z.parts[PART], L0 = z.labels;
    const rmx = z.rmx.map((m, q) => ({ n: m.n, x: PART === 'rz' ? m.x : 0, ai: 0, lp: PART === 'call' ? m.lp : 0, fo: PART === 'fold' ? pz.rmx[q].n : undefined }));
    const LB2 = PART === 'rz' ? [L0[0], '', '', 'другие ответы'] : PART === 'call' ? ['', '', L0[2], 'другие ответы'] : ['', '', '', L0[3]];
    z = Object.assign({}, z, { rmx, vmx: pz.rmx, rids: pz.rids, labels: LB2, parts: null, foldPaint: PART === 'fold', capAll: (L0[{ rz: 0, call: 2, fold: 3 }[PART]] || '') + ' — только эти раздачи' });
  }
  if (pinned) {
    const seg = el('div', 'seg szmx-seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Что показать');
    [['rng', 'Диапазон'], ['net', 'Факт, BB'], ['ev', 'EV, BB']].forEach(([k, t]) => { const b = el('button', mode === k ? 'on' : '', t); b.type = 'button'; b.setAttribute('aria-pressed', String(mode === k)); b.onclick = () => { SZMX_MODE = k; drawSzMx(title, z0, true); }; seg.append(b); });
    left.append(seg);
  }
  if (mode === 'rng') {
    const LB = z.labels || ['3-бет', 'олл-ин', 'колл', 'фолд']; // порядок: янтарная, синяя, зелёная, тёмная часть клетки
    // фолд — своим цветом (z.foldPaint), руки, которых в выборке не было, — пустые клетки
    const fp = !!z.foldPaint, foldCol = fp ? 'var(--mx-fold)' : 'var(--mx-empty)';
    const legItems = [[LB[2], 'var(--mx-limp)'], [LB[0], 'var(--mx-raise)'], [LB[1], 'var(--mx-push)'], [LB[3], foldCol]];
    if (fp) legItems.push(['руки не было', 'var(--bg)']);
    const leg = el('div', 'resp-legend row'); legItems.filter(x => x[0]).forEach(([l, col]) => { const it = el('span'); const i = el('i'); i.style.background = col; if (col === 'var(--mx-empty)' || col === 'var(--bg)') i.style.border = '1px solid var(--line2)'; it.append(i, document.createTextNode(l)); leg.append(it); });
    const mxEl = handMatrix(z.rmx, LB, { fold: fp });
    if (pinned) [...mxEl.children].forEach((cell, k) => { if (!(z.vmx || z.rmx)[k].n) return; const nm = cell.querySelector('.h').textContent; cell.classList.add('click'); cell.tabIndex = 0; cell.setAttribute('role', 'button'); cell.setAttribute('aria-label', nm + ' — открыть раздачи'); cell.onclick = () => szHandList(title, z0, k, nm); cell.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); szHandList(title, z0, k, nm); } }; });
    left.append(leg, mxEl);
  } else {
    left.append(el('div', 'szmx-cap', (mode === 'ev' ? 'EV' : 'Фактический результат') + ' с каждой рукой в BB за раздачу — ' + (z.capAll || 'все ответы (колл, 3-бет, фолд)') + '. Нажмите на руку — раздачи и реплеер.'), szValGrid(z.vmx || z.rmx, mode, pinned ? (k, nm) => szHandList(title, z0, k, nm) : null));
  }
  if (!pinned) left.append(el('div', 'szmx-hint', 'Клик — закрепить окно и показать результат по рукам'));
  m.append(left);
  if (sel) {
    // выбранная рука подсвечена; справа — её раздачи (в режиме «EV, BB» — итог по EV)
    left.querySelectorAll('.mx-c, .szv-c').forEach((cell, q) => { if (q === sel.k) cell.classList.add('sel'); });
    const hc = DB.cols.hc;
    SZMX_LIST = idsPanel((z.rids || []).filter(i => hc[i] === sel.k), { title: sel.name, ev: mode === 'ev' });
    m.append(SZMX_LIST.node);
  }
  m.hidden = false;
}
function placeSzMx(row, e) {
  const m = szMx, rr = row.getBoundingClientRect(), w = m.offsetWidth, hh = m.offsetHeight;
  // как во всём проекте: окно сбоку от курсора (справа, а если не влезает — слева)
  if (e && e.clientX != null) {
    let x = e.clientX + 16, y = e.clientY - hh / 2;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - 16;
    x = Math.max(8, x); y = Math.max(8, Math.min(y, window.innerHeight - hh - 8));
    m.style.left = x + 'px'; m.style.top = y + 'px'; return;
  }
  let x = rr.right + 12, y = rr.top + rr.height / 2 - hh / 2;
  if (x + w > window.innerWidth - 8) { x = Math.max(8, Math.min(rr.left + 40, window.innerWidth - w - 8)); y = rr.bottom + 8; if (y + hh > window.innerHeight - 8) y = rr.top - hh - 8; }
  y = Math.max(8, Math.min(y, window.innerHeight - hh - 8));
  m.style.left = x + 'px'; m.style.top = y + 'px';
}
function showSzMx(title, z, row, e) { if (SZMX_PIN || hoverMuted(e)) return; drawSzMx(title, z, false); placeSzMx(row, e); }
function pinSzMx(title, z, row, e) {
  if (SZMX_PIN && SZMX_PIN.row === row) { unpinSzMx(); return; }
  SZMX_PIN = { row }; SZMX_SEL = null; SZMX_PART = 'all'; drawSzMx(title, z, true); placeSzMx(row, e);
}
function unpinSzMx() { SZMX_PIN = null; SZMX_SEL = null; if (SZMX_LIST) { SZMX_LIST.stop(); SZMX_LIST = null; } if (szMx) { szMx.hidden = true; szMx.classList.remove('with-list'); } }
function hideSzMx() { if (szMx && !SZMX_PIN) szMx.hidden = true; }

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
      // наведение на строку — матрица рук: колл / 3-бет / олл-ин / фолд против этого размера
      if (z.rmx) {
        const title = (CC_SZPOS === 'TOT' ? 'Вы на всех позициях без BB' : 'Вы на ' + CC_SZPOS) + ' · перед вами открытие ' + r.CC_SZ[k][0];
        row.classList.add('has-mx'); row.tabIndex = 0;
        row.addEventListener('mouseenter', (e) => showSzMx(title, z, row, e)); row.addEventListener('mousemove', (e) => { if (!SZMX_PIN && szMx && !szMx.hidden) placeSzMx(row, e); }); row.addEventListener('mouseleave', hideSzMx);
        row.addEventListener('focus', () => showSzMx(title, z, row)); row.addEventListener('blur', hideSzMx);
        row.addEventListener('click', (e) => pinSzMx(title, z, row, e));
        row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pinSzMx(title, z, row); } });
      }
      t.append(row);
    });
    body.replaceChildren(tot ? t : el('p', 'muted small', 'Нет открытий в выборке.'));
  }
  draw();
  return card;
}

// #7 — колд-колл против олл-ина: частота колла пуша, винрейт по позициям и по стеку пушера
let CC_AIPOS = 'TOT';
// #6.1 — защита BB по размеру открытия против минимальной частоты защиты (MDF)
function bbDefendBlock(r) {
  const card = el('div', 'insight cc-table bbd');
  card.append(numTag('6.1'), el('b', 'pm-title', 'Защита BB по размеру открытия'), el('span', 'sm-s', 'как часто вы защищаете BB (колл + 3-бет) против открытия каждого размера и сколько нужно по шансам банка'));
  const rows = (r.sz.BB || []).map((z, k) => ({ z, k, lab: r.CC_SZ[k][0] })).filter(x => x.z.n);
  if (!rows.length) { card.append(el('p', 'muted small', 'Нет открытий против вашего BB в выборке.')); return card; }
  const W = 640, H = 230, P = { l: 38, r: 12, t: 22, b: 44 };
  const s = svgRoot(W, H, 'Защита BB по размеру открытия');
  const y = (v) => P.t + (1 - v) * (H - P.t - P.b);
  const gw = (W - P.l - P.r) / rows.length, bw = Math.min(56, gw * 0.5);
  [0, 0.25, 0.5, 0.75, 1].forEach(v => { s.append(svgEl('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v) }, 'stroke:var(--line);stroke-width:1')); s.append(svgText(P.l - 6, y(v) + 4, Math.round(v * 100) + '%', 'end', 'font-size:10px')); });
  const mdfPts = [];
  rows.forEach((x, i) => {
    const z = x.z, cx = P.l + i * gw + gw / 2, call = z.call / z.n, rz = z.rz / z.n, def = call + rz, mdf = z.mdf / z.n;
    const g = svgEl('g', { class: z.n < 30 ? 'low' : '' });
    g.append(svgEl('rect', { x: cx - bw / 2, y: y(call), width: bw, height: y(0) - y(call), rx: 3 }, 'fill:var(--ice)'));
    g.append(svgEl('rect', { x: cx - bw / 2, y: y(def), width: bw, height: Math.max(0, y(call) - y(def)), rx: 3 }, 'fill:var(--bad)'));
    const t = svgEl('title'); t.textContent = x.lab + ': защита ' + fmtPct(def) + '% (колл ' + fmtPct(call) + '%, 3-бет ' + fmtPct(rz) + '%), нужно по шансам банка ' + fmtPct(mdf) + '%, ' + z.n + ' раз'; g.append(t);
    s.append(g);
    s.append(svgText(cx, y(def) - 6, fmtPct(def) + '%', 'middle', 'font-size:11px;font-weight:700;fill:' + (def < mdf ? 'var(--bad)' : 'var(--good)')));
    s.append(svgText(cx, H - P.b + 16, x.lab, 'middle', 'font-size:10px;fill:var(--soft)'));
    s.append(svgText(cx, H - P.b + 30, String(z.n), 'middle', 'font-size:9px;fill:var(--faint)'));
    mdfPts.push([cx, y(mdf)]);
  });
  s.append(svgEl('polyline', { points: mdfPts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' '), fill: 'none' }, 'stroke:var(--amber);stroke-width:2;stroke-dasharray:6 4'));
  mdfPts.forEach(p => s.append(svgEl('circle', { cx: p[0], cy: p[1], r: 3.5 }, 'fill:var(--amber)')));
  const lg = el('div', 'resp-legend row sm-lg');
  [['колл', 'var(--ice)'], ['3-бет', 'var(--bad)'], ['нужно по шансам банка (MDF)', 'var(--amber)']].forEach(([lab, col]) => { const it = el('span'); const i = el('i'); i.style.background = col; it.append(i, document.createTextNode(lab)); lg.append(it); });
  const chart = el('div', 'bbd-chart'); chart.append(s);
  // таблица под графиком: защита, нужно, разница, винрейт коллов
  const t = el('div', 'sz5-t bbd-t');
  const hd = el('div', 'sz5-r sz5-h'); ['Размер', 'Защита', 'Нужно (MDF)', 'Разница', 'Винрейт колла, BB / EV'].forEach(x => hd.append(el('span', null, x))); t.append(hd);
  rows.forEach(x => {
    const z = x.z, def = (z.call + z.rz) / z.n, mdf = z.mdf / z.n, d = (def - mdf) * 100;
    const row = el('div', 'sz5-r'); if (z.n < 30) row.classList.add('low');
    const dd = el('span', 'sz5-v ' + (d >= 0 ? 'up' : 'down'), (d >= 0 ? '+' : '−') + Math.abs(d).toFixed(1) + ' п.п.');
    row.append(el('b', null, x.lab), el('span', 'sz5-v', fmtPct(def) + '%'), el('span', 'sz5-v', fmtPct(mdf) + '%'), dd, wrNode('sz5-v', z.sn ? z.sum / 10 / z.sn : null, z.sn ? z.es / 10 / z.sn : null, 2));
    t.append(row);
  });
  const tw = el('div', 'bbd-wrap'); tw.append(t);
  card.append(lg, chart, tw, infoNote('Защита — доля раздач, где вы на BB ответили на открытие коллом или 3-бетом (открытия олл-ином — в блоке #7). Жёлтая линия — минимальная частота защиты (MDF): банк до открытия ÷ (банк + ставка открывающего), с настоящими анте раздачи (в базе, собранной до версии 0.6, — анте 1 BB); если открыл SB — с учётом его малого блайнда. Защита ниже линии — вы перефолживаете против такого размера, соперник выигрывает открытием в лоб. Это ориентир: с плохими руками защищаться не обязательно, но сильно ниже линии — повод расширить защиту. Бледные столбики и строки — меньше 30 раздач.'));
  return card;
}

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
  ['MP', 'CO', 'BTN', 'SB', 'BB'].filter(p => r.cc[p].n >= SMALL).forEach(p => { const bt = el('button', uiState.ccOPos === p ? 'on' : '', p); bt.type = 'button'; bt.onclick = () => { uiState.ccOPos = p; uiState.ccOOpen = []; renderNext(); }; seg.append(bt); });
  // позиция открывающего: можно выбрать одну или несколько — ответ считается суммарно против них
  const segO = el('div', 'seg seg-multi');
  const opts = ['UTG', 'MP', 'CO', 'BTN', 'SB'].filter(op => r.vs[uiState.ccOPos] && r.vs[uiState.ccOPos][op] && r.vs[uiState.ccOPos][op].n > 0);
  const sel = uiState.ccOOpen.filter(op => opts.includes(op));
  const ball = el('button', sel.length ? '' : 'on', 'Все'); ball.type = 'button'; ball.setAttribute('aria-pressed', String(!sel.length)); ball.onclick = () => { uiState.ccOOpen = []; renderNext(); }; segO.append(ball);
  opts.forEach(op => { const on = sel.includes(op); const bt = el('button', on ? 'on' : '', op); bt.type = 'button'; bt.setAttribute('aria-pressed', String(on)); bt.onclick = () => { uiState.ccOOpen = on ? sel.filter(x => x !== op) : sel.concat([op]); renderNext(); }; segO.append(bt); });
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
  clr.onclick = () => { uiState.ccOStkR = null; uiState.ccOMyR = null; renderNext(); };
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
function tbOppBlock(r) {
  const b = el('section', 'block cc-table'); b.append(numTag(6));
  const h = el('div', 'block-head'); h.append(el('h2', null, 'Ваш ответ против стека открывающего'), el('p', null, 'какими руками вы 3-бетите (и олл-ином), коллируете и сбрасываете против открытия; стеки открывающего и свои задаёте сами'));
  const seg = el('div', 'seg');
  ['MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'].filter(p => r.tb[p].n >= SMALL).forEach(p => { const bt = el('button', uiState.tbOPos === p ? 'on' : '', p); bt.type = 'button'; bt.onclick = () => { uiState.tbOPos = p; uiState.tbOOpen = []; renderNext(); }; seg.append(bt); });
  // позиция открывающего: можно выбрать одну или несколько — ответ считается суммарно против них
  const segO = el('div', 'seg seg-multi');
  const opts = ['EP', 'MP', 'HJ', 'CO', 'BTN', 'SB'].filter(op => r.vs[uiState.tbOPos] && r.vs[uiState.tbOPos][op] && r.vs[uiState.tbOPos][op].n > 0);
  const sel = uiState.tbOOpen.filter(op => opts.includes(op));
  const ball = el('button', sel.length ? '' : 'on', 'Все'); ball.type = 'button'; ball.setAttribute('aria-pressed', String(!sel.length)); ball.onclick = () => { uiState.tbOOpen = []; renderNext(); }; segO.append(ball);
  opts.forEach(op => { const on = sel.includes(op); const bt = el('button', on ? 'on' : '', op); bt.type = 'button'; bt.setAttribute('aria-pressed', String(on)); bt.onclick = () => { uiState.tbOOpen = on ? sel.filter(x => x !== op) : sel.concat([op]); renderNext(); }; segO.append(bt); });
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
  const po = pair('tbOs', uiState.tbOStkR, 'Стек открывающего'), pm = pair('tbOm', uiState.tbOMyR, 'Мой стек');
  const err = el('span', 'mx-err');
  const go = el('button', 'btn mx-go' + (uiState.tbOStkR || uiState.tbOMyR ? ' on' : ''), 'Показать'); go.type = 'submit';
  const clr = el('button', 'btn mx-clr', 'Сброс'); clr.type = 'button'; clr.hidden = !(uiState.tbOStkR || uiState.tbOMyR);
  clr.onclick = () => { uiState.tbOStkR = null; uiState.tbOMyR = null; renderNext(); };
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
    uiState.tbOStkR = o; uiState.tbOMyR = m; render();
  };
  side.append(leg, el('span', 'mx-cap', 'Ваша позиция'), seg, el('span', 'mx-cap', 'Позиция открывающего — можно несколько'), segO, form,
    el('span', 'muted small', 'Открывающий: ' + (sel.length ? sel.join(' + ') : 'любая позиция') + ', ' + rangeTxt(uiState.tbOStkR) + ' · вы: ' + rangeTxt(uiState.tbOMyR) + ' · ' + n.toLocaleString('ru-RU') + ' раз перед вами было открытие'));
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
  ['MP', 'CO', 'BTN', 'SB', 'BB'].filter(p => r.cc[p].n >= SMALL).forEach(p => { const bt = el('button', uiState[o.pos] === p ? 'on' : '', p); bt.type = 'button'; bt.onclick = () => { uiState[o.pos] = p; renderNext(); }; seg.append(bt); });
  const body = el('div', 'block-body'); body.append(handMatrix(o.mx, ['3-бет', 'олл-ин', 'колл', 'фолд']));
  const side = el('div', 'mx-side');
  const segS = el('div', 'seg');
  MX_STK.forEach(([id, lab]) => { const bt = el('button', uiState[o.stk] === id ? 'on' : '', lab); bt.type = 'button'; bt.onclick = () => { uiState[o.stk] = id; renderNext(); }; segS.append(bt); });
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
// #2.1 — результат колд-колла по группам рук и позициям (как #3.4 во вкладке RFI): факт / EV, наведение — руки группы,
// клик — закрепить окно с раздачами и реплеером
function ccGroupBlock(r, o) {
  o = o || { cols: r.CC_COLS.slice(1), tag: '2.1', title: 'Результат колд-колла по группам рук', sub: 'BB за колд-колл: всего и по группам рук, факт / EV', name: 'Колд-колл', verb: 'не коллировали', act: 1, vlab: ' BB за колд-колл', nlab: ' колд-коллов', none: 'Нет колд-коллов в выборке.', key: 'ccg', p: true };
  const pos = o.cols.filter(p => r.hands[p] && r.hands[p].n);
  const c = DB.cols, EV = EVcol(), agg = {};
  pos.forEach(p => {
    const g = HAND_GROUPS.map(() => ({ sum: 0, es: 0, n: 0 })), h = Array.from({ length: 169 }, () => ({ sum: 0, es: 0, n: 0 }));
    r.hands[p].ids.forEach(i => { const k = c.hc[i]; if (k < 0) return; const z = g[handGroup(k)]; z.sum += c.net[i]; z.es += EV[i]; z.n++; const y = h[k]; y.sum += c.net[i]; y.es += EV[i]; y.n++; });
    agg[p] = { g, h };
  });
  const card = el('div', 'insight cc-table ccg');
  card.append(numTag(o.tag), el('span', 'k', o.title), el('span', 's', o.sub));
  if (!pos.length) { card.append(el('p', 'muted', o.none)); return card; }
  // крупные цифры по позициям
  const top = el('div', 'ccg-top');
  pos.forEach(p => { const z = r.hands[p]; const b = el('div', 'ccg-big'); const big = el('b'); big.innerHTML = wrHtml(z.sum / 10 / z.n, z.es / 10 / z.n, 2); b.append(el('span', 'nm', p), big, el('span', 'cnt', z.n.toLocaleString('ru-RU'))); top.append(b); });
  card.append(top);
  // таблица: группа рук × позиция
  const vals = []; pos.forEach(p => agg[p].g.forEach(z => { if (z.n >= 5) vals.push(Math.abs(z.sum / 10 / z.n)); }));
  vals.sort((a, b) => a - b); const scale = Math.max(0.5, vals[Math.floor(vals.length * 0.9)] || 0.5);
  const tbl = el('div', 'ccg-t'); tbl.style.setProperty('--ncol', pos.length);
  const hd = el('div', 'ccg-r ccg-head'); hd.append(el('span', null, 'Группа рук')); pos.forEach(p => hd.append(el('span', null, p))); tbl.append(hd);
  HAND_GROUPS.forEach(([lab], k) => {
    const row = el('div', 'ccg-r'); row.append(el('span', 'ccg-l', lab));
    pos.forEach(p => {
      const z = agg[p].g[k], hands = agg[p].h, cell = el('div', 'ccg-c');
      cell.addEventListener('mouseenter', (e) => showGroupTip(p, lab, k, z, hands, e, o.verb)); cell.addEventListener('mousemove', moveGroupTip); cell.addEventListener('mouseleave', hideGroupTip);
      if (!z.n) { cell.append(el('span', 'hg-na', '—')); row.append(cell); return; }
      const v = z.sum / 10 / z.n, t = Math.min(1, Math.abs(v) / scale);
      cell.style.background = 'rgba(' + (v >= 0 ? 'var(--good-rgb)' : 'var(--bad-rgb)') + ',' + (0.08 + 0.32 * t).toFixed(2) + ')';
      const f = el('b', v >= 0 ? 'up' : 'down', signed(v, 2)), ev = z.es / 10 / z.n;
      cell.append(f, el('span', 'ccg-ev ' + (ev >= 0 ? 'up' : 'down'), signed(ev, 2) + ' EV'), el('span', 'ccg-n', String(z.n)));
      if (z.n < 30) cell.classList.add('low');
      cell.classList.add('click'); cell.tabIndex = 0; cell.setAttribute('role', 'button'); cell.setAttribute('aria-label', p + ', ' + lab + ': ' + signed(v, 2) + ' BB, ' + z.n + o.nlab + ' — показать руки и раздачи');
      const pin = (e) => { hideGroupTip(); pinHandPop({ p: o.p ? p : null, key: o.key + p + k, title: (o.nameOf ? o.nameOf(p) : o.name + ' · ' + p) + ' · ' + lab, o: z, mx: hands, ids: r.hands[p].ids, only: (q) => handGroup(q) === k, sit: 2, act: o.act, vlab: o.vlab, nlab: o.nlab }, v, e, cell); };
      cell.addEventListener('click', pin); cell.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pin(null); } });
      row.append(cell);
    });
    tbl.append(row);
  });
  const wrap = el('div', 'ccg-wrap'); wrap.append(tbl); card.append(wrap);
  card.append(infoNote(o.note || 'В ячейке — результат колд-колла группой рук с этой позиции в BB: сверху факт, под ним EV, справа мелко — число колд-коллов. Цвет — плюс или минус. Наведите — матрица рук группы и их итог; клик закрепит окно, клик по руке откроет раздачи и реплеер. Бледные ячейки — меньше 30 раздач.'));
  return card;
}

// #9 — квадрант «Колд-колл × Фолд на контбет флопа»: где находится каждый игрок базы и вы
let CC_QUAD = null; // { db, rows } — таблица по игрокам базы (считается в программе один раз)
let CC_QPOS = 'TOT'; // позиция в квадранте #9
const QPOS = { TOT: 0, UTG: 1, MP: 2, CO: 4, BTN: 5, SB: 6, BB: 7 }; // номер в таблице игроков (HJ в базе входит в MP)
let qdTip = null;
function ccQuadBlock(r, idx) {
  const card = el('div', 'insight cc-table qd');
  card.append(numTag(9), el('b', 'pm-title', 'Колд-колл × Фолд на контбет флопа'), el('span', 'sm-s', 'ваша точка, равновесный ориентир и точка лучшего результата по игрокам базы'));
  const posList = ['TOT', 'MP', 'CO', 'BTN', 'SB', 'BB']; // UTG бывает только за полным столом — у соперников по нему данных нет
  const seg = segBtns(posList.map(p => [p, p === 'TOT' ? 'Все без BB' : p]), CC_QPOS, (k) => { CC_QPOS = k; draw(LAST); });
  const body = el('div', 'qd-body'); body.append(window.mdaLoad('Считаю игроков базы…')); card.append(seg, body);
  let LAST = null;
  const draw = (data) => {
    LAST = data; body.replaceChildren();
    const P0 = CC_QPOS, qi = QPOS[P0];
    // текущий игрок (вы, ваш алиас или выбранный соперник) — по текущей выборке и выбранной позиции
    const c = DB.cols; let fo = 0, fn = 0;
    // фолд на контбет — на выбранной позиции («Все без BB» — все позиции, кроме BB), как и у игроков базы
    const qp = qi - 1; // номер позиции в базе (0 UTG … 6 BB)
    const zs = []; let an = 0, as = 0; // ориентир равновесия: средняя доля α = ставка / (банк + ставка) по контбетам против вас (1 − MDF)
    if (c.fcb) for (const i of idx) { const v = c.fcb[i]; if (v < 0) continue; const ps = c.pos[i]; if (P0 === 'TOT' ? ps === 6 : ps !== qp) continue; fn++; if (v === 1) fo++; const z = c.cbs ? c.cbs[i] : -1; if (z >= 0) { an++; as += z / (100 + z); zs.push(z); } }
    const zc = r.cc[P0] || { n: 0, x: 0 };
    const me = { name: state.player ? state.player.name : (curAlias() ? curAlias().name : 'Вы'), cc: zc.n ? zc.x / zc.n : null, ccN: zc.n, fcb: fn ? fo / fn : null, fcbN: fn, eq: an >= 10 ? as / an : null, cbMed: zs.length >= 10 ? zs.sort((a, b) => a - b)[zs.length >> 1] : null, pid: state.player ? state.player.pid : null };
    if (!data || !data.ok) { body.append(el('p', 'muted small', 'В базе нет данных о фолде на контбет — их начала сохранять версия 0.6. Загрузите базу заново («Заменить базу»), чтобы появился график.')); return; }
    // ваша точка — строго по выбранной позиции (≥ 20 контбетов, иначе не выводится).
    // У игроков базы по одной позиции (кроме BB) контбетов единицы, поэтому их фолд на контбет — по всем позициям без BB, на BB — по BB.
    // Порог входа игрока: «Все без BB» — ≥ 30 возможностей колд-колла и ≥ 6 контбетов; одна позиция — ≥ 10 и ≥ 6; BB — ≥ 20 и ≥ 8.
    const MIN_CC = P0 === 'TOT' ? 30 : P0 === 'BB' ? 20 : 10, MIN_CB = P0 === 'BB' ? 8 : 6, MIN_ME = 20, qf = P0 === 'BB' ? 7 : 0;
    const meLow = me.cc == null || me.fcb == null || me.fcbN < MIN_ME;
    const SD = data.stride || 4; // 5 — с итогами колд-колл раздач (0.7.2)
    const pts = data.rows.map(x => { const t = x[5], o = t[qi * SD], cx = t[qi * SD + 1], cb = t[qf * SD + 2], f = t[qf * SD + 3]; return { pid: x[0], name: x[1], room: x[2], count: x[3], shown: x[4], cc: o ? cx / o : 0, ccN: o, ccH: cx, res: SD >= 5 ? t[qi * SD + 4] : null, fcb: cb ? f / cb : 0, fcbN: cb }; }).filter(p => p.ccN >= MIN_CC && p.fcbN >= MIN_CB);
    if (pts.length < 5) { body.append(el('p', 'muted small', 'Мало игроков с достаточной выборкой' + (P0 === 'TOT' ? '' : ' на ' + P0) + ' (нужно ≥ ' + MIN_CC + ' возможностей колд-колла и ≥ ' + MIN_CB + ' контбетов после него).')); return; }
    const ccs = pts.map(p => p.cc).sort((a, b) => a - b), xGrid = Math.min(1, Math.max(0.1, Math.ceil((ccs[Math.floor(ccs.length * 0.99)] || 0.3) * 20) / 20, meLow ? 0 : me.cc || 0));
    const bb = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2).replace('.', ',');
    // ваш итог колд-колл раздач на выбранной позиции — для сравнения
    let myRes = null;
    if (c.rz && c.act && c.net) { let n = 0, sm = 0; for (const i of idx) { const ps = c.pos[i]; if (P0 === 'TOT' ? ps === 6 : ps !== qp) continue; if (c.rz[i] !== 1 || c.cl[i] !== 0 || (c.lr && c.lr[i] !== 0) || c.act[i] !== 1) continue; n++; sm += c.nev && Number.isFinite(c.nev[i]) ? c.nev[i] : c.net[i]; } if (n >= 20) myRes = { v: sm / n / 10, n, sum: sm }; }
    // Точка максимального винрейта. Берутся все игроки базы, у кого есть хоть какая-то выборка (≥ 10 возможностей
    // колд-колла и ≥ 2 контбета после него), а не только «крупные»: у соперников из ваших раздач обычно по 20–80 рук.
    // Малая выборка игрока сглаживается к среднему по базе (байесовское сжатие): 2 контбета не дают «0% или 100%».
    // Для каждой точки сетки — средний итог колд-колл раздачи игроков рядом (вес = колд-коллы × близость по Гауссу)
    // и его погрешность по разбросу между игроками; выбирается точка с лучшей нижней границей (итог − погрешность),
    // чтобы не ловить случайный выброс.
    let best = null;
    const pool = [];
    if (SD >= 5) {
      let so = 0, sx = 0, sc = 0, sf = 0;
      const raw = data.rows.map(x => { const t = x[5]; return { pid: x[0], o: t[qi * SD], cx: t[qi * SD + 1], res: t[qi * SD + 4], cb: t[qf * SD + 2], f: t[qf * SD + 3] }; }).filter(q => q.o >= 10 && q.cb >= 2 && q.cx > 0 && !(state.player && q.pid === state.player.pid));
      raw.forEach(q => { so += q.o; sx += q.cx; sc += q.cb; sf += q.f; });
      const mc = so ? sx / so : 0, mf = sc ? sf / sc : 0, KC = 20, KF = 6;
      raw.forEach(q => pool.push({ cc: (q.cx + KC * mc) / (q.o + KC), fcb: (q.f + KF * mf) / (q.cb + KF), ccH: q.cx, res: q.res }));
    }
    if (!meLow && myRes) pool.push({ cc: me.cc, fcb: me.fcb, ccH: myRes.n, res: myRes.sum }); // ваши раздачи — тоже в общей картине
    const poolH = pool.reduce((a, p) => a + p.ccH, 0);
    if (pool.length >= 20) {
      const hx = Math.max(0.02, xGrid / 14), hy = 0.07, need = Math.max(400, poolH * 0.04);
      for (let gx = 1; gx < 40; gx++) for (let gy = 1; gy < 40; gy++) {
        const x = gx / 40 * xGrid, y = gy / 40; let wh = 0, wr = 0, np = 0; const near = [];
        for (const p of pool) { const dx = (p.cc - x) / hx, dy = (p.fcb - y) / hy, k = Math.exp(-0.5 * (dx * dx + dy * dy)); if (k < 0.01) continue; wh += k * p.ccH; wr += k * p.res; if (k > 0.3) np++; near.push([k, p]); }
        if (wh < need || np < 8) continue;
        const v = wr / wh; let vv = 0; for (const [k, p] of near) { const d = p.res - v * p.ccH; vv += k * k * d * d; }
        const se = Math.sqrt(vv) / wh / 10, val = v / 10, lo = val - se;
        if (!best || lo > best.lo) best = { x, y, v: val, se, lo, wh, np };
      }
    }
    // ось колд-колла — по вашей точке и точке максимального винрейта (без лишнего пустого места справа)
    const xMax = Math.min(1, Math.max(0.2, Math.ceil(Math.max(meLow ? 0 : me.cc || 0, best ? best.x : 0) * 1.6 * 20) / 20));
    const W = 600, H = 360, P = { l: 52, r: 16, t: 16, b: 44 };
    const s = svgRoot(W, H, 'Колд-колл и фолд на контбет флопа по игрокам базы');
    const X = (v) => P.l + Math.min(1, v / xMax) * (W - P.l - P.r), Y = (v) => P.t + (1 - v) * (H - P.t - P.b);
    // сетка и оси
    for (let v = 0; v <= 1.0001; v += 0.25) { s.append(svgEl('line', { x1: P.l, x2: W - P.r, y1: Y(v), y2: Y(v) }, 'stroke:var(--line);stroke-width:1')); s.append(svgText(P.l - 6, Y(v) + 4, Math.round(v * 100) + '%', 'end', 'font-size:11px;fill:var(--soft)')); }
    const step = xMax > 0.3 ? 0.1 : 0.05;
    for (let v = 0; v <= xMax + 1e-9; v += step) { s.append(svgEl('line', { x1: X(v), x2: X(v), y1: P.t, y2: H - P.b }, 'stroke:var(--line);stroke-width:1')); s.append(svgText(X(v), H - P.b + 15, Math.round(v * 100) + '%', 'middle', 'font-size:11px;fill:var(--soft)')); }
    s.append(svgText((P.l + W - P.r) / 2, H - 6, 'Колд-колл, % →', 'middle', 'font-size:11px;fill:var(--soft)'));
    const yl = svgText(14, (P.t + H - P.b) / 2, 'Фолд на контбет флопа, % →', 'middle', 'font-size:11px;fill:var(--soft)'); yl.setAttribute('transform', 'rotate(-90 14 ' + (P.t + H - P.b) / 2 + ')'); s.append(yl);
    const HALO = ';paint-order:stroke;stroke:var(--panel);stroke-width:4px;stroke-linejoin:round';
    const tip = (e, title, line, em) => {
      if (!qdTip) { qdTip = el('div', 'qd-tip'); qdTip.setAttribute('role', 'tooltip'); document.body.append(qdTip); }
      qdTip.replaceChildren(el('b', null, title), el('span', null, line)); if (em) qdTip.append(el('em', null, em));
      qdTip.hidden = false; const w = qdTip.offsetWidth; qdTip.style.left = Math.min(e.clientX + 14, window.innerWidth - w - 8) + 'px'; qdTip.style.top = (e.clientY + 14) + 'px';
    };
    const hide = () => { if (qdTip) qdTip.hidden = true; };
    // ориентир равновесия (MDF) — горизонталь и кольцо на вашем колд-колле
    if (!meLow && me.eq != null) {
      const ye = Y(me.eq);
      s.append(svgEl('line', { x1: P.l, x2: W - P.r, y1: ye, y2: ye }, 'stroke:var(--bg);stroke-width:5;stroke-opacity:.8'));
      s.append(svgEl('line', { x1: P.l, x2: W - P.r, y1: ye, y2: ye }, 'stroke:var(--good);stroke-width:2.2;stroke-dasharray:8 5'));
      const lt = 'равновесие (MDF) ' + (me.eq * 100).toFixed(1).replace('.', ',') + '%', lw = lt.length * 6.3 + 14;
      s.append(svgEl('rect', { x: W - P.r - lw - 4, y: ye - 22, width: lw, height: 18, rx: 9 }, 'fill:var(--good)'));
      s.append(svgText(W - P.r - 4 - lw / 2, ye - 9, lt, 'middle', 'font-family:var(--sans);font-size:11px;font-weight:800;fill:#0B1F14'));
      s.append(svgEl('line', { x1: X(me.cc), x2: X(me.cc), y1: Y(me.fcb), y2: ye }, 'stroke:var(--good);stroke-width:2;stroke-dasharray:3 3'));
      s.append(svgEl('circle', { cx: X(me.cc), cy: ye, r: 7 }, 'fill:var(--bg);fill-opacity:.6;stroke:var(--good);stroke-width:2.5'));
    }
    // точка максимального винрейта по базе — красная
    if (best) {
      const g = svgEl('g', { class: 'qd-best' }), bx = X(best.x), by = Y(best.y);
      g.append(svgEl('circle', { cx: bx, cy: by, r: 12 }, 'fill:#F04438;fill-opacity:.2'), svgEl('circle', { cx: bx, cy: by, r: 7 }, 'fill:#F04438;stroke:var(--bg);stroke-width:2'));
      const lab = 'макс. винрейт ' + bb(best.v) + ' ± ' + best.se.toFixed(2).replace('.', ',') + ' BB', right = bx < (P.l + W - P.r) / 2;
      g.append(svgText(bx + (right ? 13 : -13), by + 4, lab, right ? 'start' : 'end', 'font-family:var(--sans);font-size:12px;font-weight:800;fill:#FF6B5E' + HALO));
      const line = 'колд-колл около ' + Math.round(best.x * 100) + '% · фолд на контбет около ' + Math.round(best.y * 100) + '% · ' + bb(best.v) + ' BB в среднем за колд-колл';
      g.addEventListener('mouseenter', (e) => tip(e, 'Максимальный винрейт', line, 'по ' + Math.round(best.wh).toLocaleString('ru-RU') + ' колд-коллам ' + best.np + ' игроков рядом с этой точкой (ваши раздачи тоже учтены)'));
      g.addEventListener('mousemove', (e) => tip(e, 'Максимальный винрейт', line)); g.addEventListener('mouseleave', hide);
      s.append(g);
    }
    if (!meLow) {
      const g = svgEl('g', { class: 'qd-me' }), name = me.name;
      g.append(svgEl('circle', { cx: X(me.cc), cy: Y(me.fcb), r: 8 }), svgText(X(me.cc) + 12, Y(me.fcb) + 4, name, 'start', 'font-family:var(--sans);font-size:12px;font-weight:800;fill:var(--amber)' + HALO));
      const line = 'колд-колл ' + fmtPct(me.cc) + '% (' + me.ccN + ') · фолд на контбет ' + fmtPct(me.fcb) + '% (' + me.fcbN + ')' + (myRes ? ' · ' + bb(myRes.v) + ' BB за колд-колл' : '');
      g.addEventListener('mouseenter', (e) => tip(e, name, line)); g.addEventListener('mousemove', (e) => tip(e, name, line)); g.addEventListener('mouseleave', hide);
      s.append(g);
    }
    const wrap = el('div', 'qd-chart'); wrap.append(s);
    const at = P0 === 'TOT' ? '' : ' на ' + P0;
    const meTxt = meLow ? 'Мало данных' + at + ' для точки «' + me.name + '»: ' + (me.fcbN || 0) + ' контбет' + (me.fcbN === 1 ? '' : me.fcbN >= 2 && me.fcbN <= 4 ? 'а' : 'ов') + ' после колд-колла (нужно ≥ ' + MIN_ME + ').'
      : 'Колд-колл' + at + ' ' + fmtPct(me.cc) + '% (' + me.ccN + '), фолд на контбет ' + fmtPct(me.fcb) + '% (' + me.fcbN + ')' + (me.eq != null ? ' · равновесие ' + (me.eq * 100).toFixed(1).replace('.', ',') + '%' + (me.cbMed != null ? ' (контбет против вас обычно ' + me.cbMed + '% банка)' : '') + ' — ' + (Math.abs(me.fcb - me.eq) < 0.03 ? 'в норме' : me.fcb > me.eq ? 'перефолд на ' + fmtPct(me.fcb - me.eq) + ' п.п.' : 'недофолд на ' + fmtPct(me.eq - me.fcb) + ' п.п.') : '') + (myRes ? ' · ваш итог ' + bb(myRes.v) + ' BB за колд-колл' : '') + '.';
    const bestTxt = best ? 'Максимальный винрейт по базе' + at + ': колд-колл около ' + Math.round(best.x * 100) + '%, фолд на контбет около ' + Math.round(best.y * 100) + '% — ' + bb(best.v) + ' ± ' + best.se.toFixed(2).replace('.', ',') + ' BB за колд-колл (рядом ' + best.np.toLocaleString('ru-RU') + ' игроков и ' + Math.round(best.wh).toLocaleString('ru-RU') + ' колд-коллов; всего в расчёте ' + pool.length.toLocaleString('ru-RU') + ' игроков и ' + poolH.toLocaleString('ru-RU') + ' колд-коллов).' + (best.se > 0.3 ? ' Погрешность большая — точку уточнит база побольше (датамайнинг).' : '')
      : SD < 5 ? 'Точка максимального винрейта появится после повторной загрузки базы: старая база не хранит итоги колд-колл раздач соперников.' : 'Для точки максимального винрейта мало данных' + at + ': нужно больше игроков с колд-коллами в базе (лучше всего — датамайнинг).';
    const key = el('div', 'qd-key');
    [['qd-k-me', me.name], ['qd-k-eq', 'равновесие по MDF'], ['qd-k-best', 'максимальный винрейт (база + ваши раздачи)']].forEach(([c2, t]) => { const k = el('span', c2); k.append(el('i'), document.createTextNode(t)); key.append(k); });
    body.append(el('p', 'qd-me-txt', meTxt), el('p', 'qd-me-txt qd-best-txt', bestTxt), wrap, key,
      infoNote('Жёлтая точка — текущий выбор (вы или ваш алиас) по текущим фильтрам: колд-колл и фолд на контбет на выбранной позиции, точка выводится, если на ней ≥ ' + MIN_ME + ' контбетов после колд-колла. Колд-колл — как в #1: рейз перед игроком, без лимперов и коллеров. Фолд на контбет — банк с одним рейзером, где последним словом префлоп был ваш колл; на флопе первым ставит префлоп-рейзер. Зелёная линия и кольцо — равновесный ориентир фолда на контбет по MDF: при ставке b в банк P фолдить можно не чаще b / (P + b); ориентир — среднее этой доли по реальным размерам контбетов против вас (треть банка — 25%, полбанка — 33%, банк — 50%). Кольцо стоит на вашем колд-колле: расстояние до него — ваш перефолд или недофолд. Красная точка — где максимальный винрейт: для каждой комбинации «колд-колл × фолд на контбет» берутся игроки базы рядом с ней и ваши раздачи (у игрока — не меньше 10 возможностей колд-колла и 2 контбетов после него; маленькая выборка игрока подтягивается к среднему по базе, чтобы 2 контбета не давали «0% или 100%»), и считается их средний итог на одну колд-колл раздачу по EV олл-инов (с учётом всей дальнейшей игры в раздаче); точка — там, где этот итог максимален с учётом погрешности (берётся лучшая нижняя граница «итог − погрешность»); число после ± — погрешность по разбросу между игроками. Это наблюдение по реальным игрокам, а не теория: на маленькой базе точка может заметно гулять, надёжнее всего — на большом датамайнинге.'));
  };
  if (CC_QUAD && CC_QUAD.db === HERO_DB) draw(CC_QUAD.rows);
  else if (mda.playersCc) { const db = HERO_DB; mda.playersCc().then(rows => { CC_QUAD = { db, rows }; if (card.isConnected) draw(rows); }); }
  else draw(null);
  return card;
}

function ccVsTable(r) {
  const heroPos = r.CC_COLS.slice(1).filter(p => r.cc[p].n >= SMALL);
  const opCols = ['UTG', 'MP', 'CO', 'BTN', 'SB'].filter(op => heroPos.some(p => r.vs[p] && r.vs[p][op] && r.vs[p][op].n >= SMALL));
  const rows = heroPos.map(p => ({ key: p, label: p, data: r.vs[p] || {} }));
  const w = heatTable({ cols: opCols, rows, noTot: true });
  w.querySelectorAll('td.c').forEach(td => {
    const p = td.dataset.row, op = td.dataset.col;
    const z = op === 'TOT' ? r.hands[p] : r.vsHands[p] && r.vsHands[p][op];
    if (!z || !z.n) return;
    const it = { p, key: 'ccvs ' + p + op, title: 'Ваш колд-колл с ' + p + (op === 'TOT' ? '' : ' против открытия с ' + op), o: { n: z.n, sum: z.sum, es: z.es }, mx: z.mx, ids: z.ids, sit: 2, act: 1, vlab: ' BB за колд-колл', nlab: ' колд-коллов' };
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
    const it = { p: col === 'TOT' ? null : col, key: 'cc ' + col, title: 'Ваш колд-колл' + (col === 'TOT' ? ' (все позиции без BB)' : ' с ' + col), o: { n: z.n, sum: z.sum, es: z.es }, mx: z.mx, ids: z.ids, sit: 2, act: 1, vlab: ' BB за колд-колл', nlab: ' колд-коллов' };
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
  // #8: переключатели вашего стека и свой диапазон (как «Результат 3-бета»)
  const F8 = resFilter('ccRes', null), HH = (p) => (F8.flt ? subHands(r.hands[p], F8.pass) : r.hands[p]);
  const items = ccPos.map(p => { const h = HH(p); return { p, key: 'cc' + p + (F8.rng || []).join('-'), o: { n: h.n, sum: h.sum, es: h.es }, mx: h.mx, ids: h.ids, sit: 2, act: 1, title: 'Ваш колд-колл с ' + p, vlab: ' BB за колд-колл', nlab: ' колд-коллов' }; });
  const t = HH('TOT'), avg = t.n ? t.sum / 10 / t.n : null, avgE = t.n ? t.es / 10 / t.n : null;
  LAST_NET_ITEMS = items;
  const tb = r.hands.BB, nAll = t.n + tb.n, allF = nAll ? (t.sum + tb.sum) / 10 / nAll : null, allE = nAll ? (t.es + tb.es) / 10 / nAll : null;
  const box8 = el('div'); box8.append(F8.ctl, F8.label(t.n, 'колд-коллов без BB'), netChart(items, avg, 'EV колд-колла'));
  const c8 = resHead(card(8, 'Результат колд-колла', wrHtml(avg, avgE, 2) + ' <small>BB за колд-колл</small>', null, box8));
  c8.classList.add('wide');
  const zone = el('div', 'summary'); const pair = el('div', 'sum-pair'); pair.append(c1, c8); zone.append(pair);
  c2.classList.add('cc-table');
  zone.append(c2, ccGroupBlock(r), ccVsTable(r), ccOppBlock(r), ccSizeBlock(r), bbDefendBlock(r), ccAllinBlock(r)); // #9 «Колд-колл × Фолд на контбет» убран по просьбе (функция ccQuadBlock оставлена)
  page.append(zone);
  return page;
}

// ---------- 3-бет (как в Hand2Note: позиции MP / HJ / CO / BTN / SB / BB, сквиз — отдельно) ----------
let TB_VS = 'all', TB_SZPOS = 'TOT', TB_STKPOS = 'TOT', TB_XPOS = 'IP';
const TB_POS = ['MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const tbItem = (r, p, title) => { const z = r.hands[p]; return { p, anyPos: true, key: 'tb ' + p, title: title || 'Ваш 3-бет' + (p === 'TOT' ? ' (все позиции)' : ' с ' + p), o: { n: z.n, sum: z.sum, es: z.es }, mx: z.mx, ids: z.ids, sit: 2, vlab: ' BB за 3-бет', nlab: ' 3-бетов' }; };
function hoverHands(td, it, v) {
  td.classList.add('click'); td.tabIndex = 0; td.setAttribute('role', 'button');
  const show = (ev) => showHandPop(it, v, ev, td);
  td.addEventListener('mouseenter', show); td.addEventListener('mousemove', show); td.addEventListener('mouseleave', hideHandPop);
  td.addEventListener('click', (ev) => pinHandPop(it, v, ev, td));
  td.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pinHandPop(it, v, null, td); } });
}
const sub = (z, k) => ({ x: z[k], n: z.n });
// #3 — 3-бет по позициям: всего, не олл-ином, олл-ином; ниже — что было после 3-бета
function tbTable(r) {
  const cols = r.TB_COLS.filter(k => k === 'TOT' || r.tb[k].n >= SMALL);
  const card = el('div', 'insight cc-table');
  const D = (f) => { const o = {}; cols.forEach(k => { o[k] = f(k); }); return o; };
  const w = heatTable({ cols, groupGapBefore: cols.indexOf('SB'), rows: [
    { key: 'all', label: '3-бет', data: r.tb },
    { key: 'nai', label: '3-бет не олл-ин', sub: true, data: D(k => sub(r.tb[k], 'nai')) },
    { key: 'ai', label: '3-бет олл-ин', sub: true, data: D(k => sub(r.tb[k], 'ai')) },
    { key: 'f4', label: 'Фолд на 4-бет', own: true, split: true, data: D(k => ({ x: r.f4[k].fold, n: r.f4[k].n })) },
    { key: 'f5', label: '5-бет', own: true, data: D(k => ({ x: r.f4[k].x5, n: r.f4[k].n5 })) },
    { key: 'f4c', label: 'Фолд на холодный 4-бет', own: true, split: true, data: D(k => ({ x: r.f4c[k].fold, n: r.f4c[k].n })) },
    { key: 'f5c', label: '5-бет на холодный 4-бет', own: true, data: D(k => ({ x: r.f4c[k].x5, n: r.f4c[k].n5 })) }] });
  // наведение на ячейку: 3-бет / не олл-ин / олл-ин — матрица рук и их результат; фолд на 4-бет и 5-бет — чем вы сбрасывали,
  // коллировали и рейзили против 4-бета; «Соперники сбросили» — на какие руки соперники сбрасывали, коллировали, 4-бетили
  // подписи окон — от вашей позиции: «Ваш 3-бет с HJ → холодный 4-бет за спиной», чтобы HJ не читался как позиция соперника
  const me = (col, what) => (what || 'Ваш 3-бет') + (col === 'TOT' ? ' (все позиции)' : ' с ' + col);
  const RES = { all: [r.hands, 'Ваш 3-бет'], nai: [r.handsN, 'Ваш 3-бет не олл-ином'], ai: [r.handsA, 'Ваш 3-бет олл-ином'] };
  const RNG = { f4c: [r.f4cmx, ' → холодный 4-бет за спиной', ['5-бет', '', 'колл', 'фолд'], 'ваши ответы на холодный 4-бет'], f5c: [r.f5cmx, ' → холодный 4-бет за спиной (не олл-ин)', ['5-бет', '', 'колл', 'фолд'], 'ваши ответы на холодный 4-бет'], f4: [r.f4mx, ' → 4-бет открывающего', ['5-бет', '', 'колл', 'фолд'], 'ваши ответы на 4-бет'], f5: [r.f5mx, ' → 4-бет открывающего (не олл-ин)', ['5-бет', '', 'колл', 'фолд'], 'ваши ответы на 4-бет'], t3: [r.t3mx, ': ваши руки и ответ соперников', ['соперники сбросили', 'соперники 4-бет', 'соперники колл', ''], 'все ваши 3-беты'] };
  const wire = (td) => {
    const row = td.dataset.row, col = td.dataset.col;
    if (RES[row]) { const z = RES[row][0][col]; if (!z || !z.n) return; const it = tbItem(r, col, me(col, RES[row][1])); Object.assign(it, { key: 'tb' + row + col, o: { n: z.n, sum: z.sum, es: z.es }, mx: z.mx, ids: z.ids }); hoverHands(td, it, z.sum / 10 / z.n); return; }
    const d = RNG[row]; if (!d) return; const z = d[0][col]; if (!z || !z.n) return;
    const zz = Object.assign({}, z, { labels: d[2], capAll: d[3], foldPaint: !!d[2][3] }), title = me(col) + d[1];
    td.classList.add('click', 'has-mx'); td.tabIndex = 0; td.setAttribute('role', 'button');
    td.addEventListener('mouseenter', (e) => showSzMx(title, zz, td, e)); td.addEventListener('mousemove', (e) => { if (!SZMX_PIN && szMx && !szMx.hidden) placeSzMx(td, e); }); td.addEventListener('mouseleave', hideSzMx);
    td.addEventListener('click', (e) => pinSzMx(title, zz, td, e));
    td.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pinSzMx(title, zz, td); } });
  };
  w.querySelectorAll('td.c').forEach(wire);
  const t3 = (k) => { const a = r.t3r[k], n = a[0] + a[1] + a[2] + a[3]; return { x: a[0], n }; };
  const w2 = heatTable({ cols, groupGapBefore: cols.indexOf('SB'), rows: [
    { key: 'opf', label: 'Открывающий сбросил', tone: 'ice', own: true, data: D(k => r.opF[k]) },
    { key: 't3', label: 'Все сбросили — банк ваш', tone: 'ice', own: true, data: D(t3) }] });
  card.append(numTag(3), el('span', 'k', '3-бет по позициям'), el('span', 's', 'колонки — ваша позиция; в ячейке — % от раздач, где перед вами было одно открытие (не олл-ин) без коллеров и вы сделали 3-бет'), w,
    el('span', 's tb-sub', 'После вашего 3-бета — колонки тоже ваша позиция, открыть мог любой игрок перед вами'), w2);
  return card;
}
// #5 — позиция против позиции: все 3-беты / без олл-инов / олл-ин
function tbVsBlock(r) {
  const card = el('div', 'insight cc-table');
  const heroPos = TB_POS.filter(p => r.tb[p].n >= SMALL);
  const opCols = ['EP', 'MP', 'HJ', 'CO', 'BTN', 'SB'].filter(op => heroPos.some(p => r.vs[p] && r.vs[p][op] && r.vs[p][op].n >= SMALL));
  const body = el('div');
  card.append(numTag(5), el('span', 'k', '3-бет: позиция против позиции'), el('span', 's', 'строки — ваша позиция, колонки — позиция открывающего'),
    segBtns([['all', 'Все 3-беты'], ['nai', 'Без олл-инов'], ['ai', 'Только олл-ин']], TB_VS, (k) => { TB_VS = k; draw(); }), body,
    infoNote('«Все 3-беты» — доля 3-бетов вместе с олл-инами, «Без олл-инов» — только 3-беты не олл-ином, «Только олл-ин» — 3-беты олл-ином. Пустые ячейки (--) — ситуация невозможна: открывающий ходит раньше вас. Бледные ячейки — меньше ' + SMALL + ' раздач.'));
  function draw() {
    const rows = heroPos.map(p => { const d = {}; opCols.forEach(op => { const z = r.vs[p] && r.vs[p][op]; if (z) d[op] = TB_VS === 'all' ? z : sub(z, TB_VS); }); return { key: p, label: p, data: d }; });
    body.replaceChildren(heatTable({ cols: opCols, rows, noTot: true }));
  }
  draw();
  return card;
}
// #7 — 3-бет против сайзинга открытия: ответ и результат 3-бетов
function tbSizeBlock(r) {
  const card = el('div', 'insight cc-table');
  card.append(numTag(7), el('b', 'pm-title', 'Против сайзинга открытия'), el('span', 'sm-s', 'как вы отвечаете на открытие разного размера и какой результат дают ваши 3-беты'));
  const posList = ['TOT'].concat(TB_POS.filter(p => r.tb[p].n >= SMALL));
  const body = el('div');
  card.append(segBtns(posList.map(p => [p, p === 'TOT' ? 'Все' : p]), TB_SZPOS, (k) => { TB_SZPOS = k; draw(); }), body,
    infoNote('Размер — до скольких BB открыл соперник. Доля — какая часть открытий перед вами была такого размера. 3-бет / Олл-ин / Колл / Фолд — ваш ответ. Результат — средний итог раздачи после вашего 3-бета (вместе с олл-инами), факт / EV. Наведите на строку — матрица ответа рукой; клик закрепит окно. Бледные строки — меньше 30 раздач.'));
  function draw() {
    const rows = r.sz[TB_SZPOS] || [], tot = rows.reduce((a, z) => a + z.n, 0);
    const t = el('div', 'sz5-t tb-sz');
    const hd = el('div', 'sz5-r sz5-h'); ['Размер', 'Доля', '3-бет', 'Олл-ин', 'Колл', 'Фолд', 'Результат 3-бета, BB / EV'].forEach(x => hd.append(el('span', null, x))); t.append(hd);
    rows.forEach((z, k) => {
      if (!z.n) return;
      const row = el('div', 'sz5-r'); if (z.n < 30) row.classList.add('low');
      const pc = (v) => fmtPct(v / z.n) + '%', wr = z.sn ? z.sum / 10 / z.sn : null, we = z.sn ? z.es / 10 / z.sn : null;
      const share = z.n / tot, tk = el('span', 'sz5-tk'); const tr = el('i'); tr.style.width = Math.max(1, share * 100) + '%'; tk.append(tr);
      const v = (txt, col) => { const e = el('span', 'sz5-v', txt); e.style.color = col; return e; };
      row.append(el('b', null, r.CC_SZ[k][0]), el('span', 'sz5-sh', fmtPct(share) + '%'), v(pc(z.rz), 'var(--bad)'), v(pc(z.ai), 'var(--ice)'), v(pc(z.call), 'var(--soft)'), v(pc(z.fold), 'var(--good)'),
        wrNode('sz5-v', wr, we, 2), el('small', null, z.n.toLocaleString('ru-RU') + ' раз'), tk);
      if (z.rmx) {
        const title = (TB_SZPOS === 'TOT' ? 'Вы на всех позициях' : 'Вы на ' + TB_SZPOS) + ' · перед вами открытие ' + r.CC_SZ[k][0];
        row.classList.add('has-mx'); row.tabIndex = 0;
        row.addEventListener('mouseenter', (e) => showSzMx(title, z, row, e)); row.addEventListener('mousemove', (e) => { if (!SZMX_PIN && szMx && !szMx.hidden) placeSzMx(row, e); }); row.addEventListener('mouseleave', hideSzMx);
        row.addEventListener('focus', () => showSzMx(title, z, row)); row.addEventListener('blur', hideSzMx);
        row.addEventListener('click', (e) => pinSzMx(title, z, row, e));
        row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pinSzMx(title, z, row); } });
      }
      t.append(row);
    });
    body.replaceChildren(tot ? t : el('p', 'muted small', 'Нет открытий в выборке.'));
  }
  draw();
  return card;
}
// #8 — 3-бет по вашему стеку
function tbStackBlock(r) {
  const card = el('div', 'insight cc-table');
  const posList = ['TOT'].concat(TB_POS.filter(p => r.tb[p].n >= SMALL));
  const body = el('div');
  card.append(numTag(8), el('span', 'k', '3-бет по вашему стеку'), el('span', 's', 'как часто вы 3-бетите и как часто — олл-ином, в зависимости от стека в BB'),
    segBtns(posList.map(p => [p, p === 'TOT' ? 'Все' : p]), TB_STKPOS, (k) => { TB_STKPOS = k; draw(); }), body,
    infoNote('Стек — ваш стек в начале раздачи. На коротком стеке 3-бет почти всегда олл-ин. Бледные ячейки — меньше ' + SMALL + ' раздач.'));
  function draw() {
    const z = r.stk[TB_STKPOS], d = (f) => { const o = {}; r.TB_STK.forEach((lab, k) => { o[lab] = f(z[k]); }); return o; };
    body.replaceChildren(heatTable({ cols: r.TB_STK, noTot: true, rows: [{ label: '3-бет', data: d(q => q) }, { label: 'не олл-ин', sub: true, data: d(q => sub(q, 'nai')) }, { label: 'олл-ин', sub: true, data: d(q => sub(q, 'ai')) }] }));
  }
  draw();
  return card;
}
// #9 — «Split» как в Hand2Note: частота 3-бета не олл-ином каждого размера (в разах от открытия) и фолд на 4-бет после него
function tbSplitBlock(r) {
  const card = el('div', 'insight cc-table');
  const cols = ['TOT'].concat(r.TB_X.slice(0, 8));
  const rows = [];
  [['IP', 'В позиции (CO, BTN)'], ['SB', 'SB'], ['BB', 'BB (без SB)']].forEach(([g, lab], gi) => {
    const sp = r.split[g], d3 = { TOT: { x: sp.x, n: sp.n } }, d4 = { TOT: { x: sp.ff, n: sp.fn } };
    sp.b.forEach((b, k) => { d3[cols[k + 1]] = { x: b.x, n: sp.n }; d4[cols[k + 1]] = b.fn ? { x: b.ff, n: b.fn } : null; });
    rows.push({ key: g + '3', label: lab + ': 3-бет не олл-ин', data: d3, split: gi > 0 }, { key: g + '4', label: '↳ фолд на 4-бет', sub: true, tone: 'ice', data: d4 });
  });
  const w = heatTable({ cols, rows });
  w.querySelectorAll('tr').forEach(tr => { const c3 = tr.querySelector('td.c'); if (!c3) return; if ((c3.dataset.row || '').endsWith('3')) tr.querySelectorAll('td.c.low').forEach(td => { td.classList.remove('low'); const n = td.querySelector('.n'); if (n) n.remove(); }); });
  card.append(numTag(9), el('span', 'k', '3-бет по сайзингу (как «Split» в Hand2Note)'), el('span', 's', 'как часто вы 3-бетите не олл-ином каждым размером и как часто сбрасываете на 4-бет после него'), w,
    infoNote('Размер — ваш 3-бет, делённый на открытие, округлённый до 0,5: ×3 — в три раза больше открытия. Строка «3-бет не олл-ин» — доля от всех раздач с одним открытием перед вами (в TOT — всего, в колонке — этим размером; сумма колонок равна TOT). «Фолд на 4-бет» — как часто вы сбросили, когда на 3-бет этого размера пришёл 4-бет; в ячейках с маленькой выборкой — число раздач. Как в Hand2Note: «в позиции» — CO и BTN, BB — без раздач против открытия SB.'));
  return card;
}
// #9.1 — размер вашего 3-бета (в разах от открытия): в позиции, SB, BB — ответ соперников, сброс на 4-бет и результат
function tbXBlock(r) {
  const card = el('div', 'insight cc-table');
  card.append(numTag('9.1'), el('b', 'pm-title', 'Размер вашего 3-бета: ответ соперников и результат'), el('span', 'sm-s', 'во сколько раз больше открытия вы 3-бетите в позиции, с SB и с BB; как отвечают соперники, как часто вы сбрасываете на 4-бет и какой результат'));
  const body = el('div');
  card.append(segBtns([['TOT', 'Все'], ['IP', 'В позиции (CO, BTN)'], ['SB', 'SB'], ['BB', 'BB']], TB_XPOS, (k) => { TB_XPOS = k; draw(); }), body,
    infoNote('Размер — ваш 3-бет, делённый на открытие (×3 — в три раза больше). Олл-ин — отдельной строкой. «В позиции» — 3-беты с CO и BTN (как в Hand2Note), BB — без раздач против открытия SB. Фолд / Колл / 4-бет — первый ответ соперников. «Фолд на 4-бет» — как часто вы сбросили, когда на этот 3-бет пришёл 4-бет (в скобках — сколько раз был 4-бет). Результат — средний итог раздачи, факт / EV. Клик по строке — раздачи и реплеер.'));
  function draw() {
    const rows = r.xg[TB_XPOS] || [], tot = rows.reduce((a, z) => a + z.n, 0);
    const t = el('div', 'sz5-t tb-sz');
    const hd = el('div', 'sz5-r sz5-h'); ['Размер', 'Доля', 'Фолд', 'Колл', '4-бет', 'Фолд на 4-бет', 'Результат, BB / EV'].forEach(x => hd.append(el('span', null, x))); t.append(hd);
    rows.forEach((z, k) => {
      if (!z.n) return;
      const row = el('div', 'sz5-r click'); if (z.n < 30) row.classList.add('low');
      const pc = (v) => (z.rn ? fmtPct(v / z.rn) + '%' : '—');
      const share = z.n / tot, tk = el('span', 'sz5-tk'); const tr = el('i'); tr.style.width = Math.max(1, share * 100) + '%'; tk.append(tr);
      const v = (txt, col) => { const e = el('span', 'sz5-v', txt); e.style.color = col; return e; };
      const f4 = el('span', 'sz5-v', z.f4n ? fmtPct(z.f4f / z.f4n) + '%' : '—'); f4.style.color = 'var(--amber)'; if (z.f4n) f4.append(el('span', 'evs', ' (' + z.f4n + ')'));
      row.append(el('b', null, r.TB_X[k]), el('span', 'sz5-sh', fmtPct(share) + '%'), v(pc(z.r[0]), 'var(--good)'), v(pc(z.r[1]), 'var(--ice)'), v(pc(z.r[2] + z.r[3]), 'var(--bad)'), f4,
        wrNode('sz5-v', z.sum / 10 / z.n, z.es / 10 / z.n, 2), el('small', null, z.n.toLocaleString('ru-RU') + ' раз'), tk);
      row.tabIndex = 0; row.setAttribute('role', 'button');
      const gl = { TOT: 'все позиции', IP: 'в позиции', SB: 'SB', BB: 'BB' }[TB_XPOS];
      const open = () => openIdsList('Ваш 3-бет ' + r.TB_X[k] + ' · ' + gl, z.ids);
      row.onclick = open; row.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
      t.append(row);
    });
    body.replaceChildren(tot ? t : el('p', 'muted small', 'Нет 3-бетов в выборке.'));
  }
  draw();
  return card;
}
// #11 — ваша реакция на 4-бет после 3-бета: по позициям и против каждой позиции открывающего
let TB_4 = 'fold';
function tb4Block(r) {
  const card = el('div', 'insight cc-table');
  const cols = r.TB_COLS.filter(k => k === 'TOT' || r.f4[k].n > 0 || r.f4c[k].n > 0);
  const D = (f) => { const o = {}; cols.forEach(k => { o[k] = f(r.f4[k]); }); return o; };
  const w = heatTable({ cols, groupGapBefore: cols.indexOf('SB'), rows: [
    { label: 'Фолд на 4-бет', tone: 'ice', data: D(f => ({ x: f.fold, n: f.n })) },
    { label: 'Колл 4-бета', tone: 'ice', data: D(f => ({ x: f.call, n: f.n })) },
    { label: 'Рейз на 4-бет', tone: 'ice', data: D(f => ({ x: f.rz, n: f.n })) },
    { label: '5-бет (когда был возможен)', data: D(f => ({ x: f.x5, n: f.n5 })) },
    { label: 'Холодный 4-бет: фолд', tone: 'ice', own: true, split: true, data: Object.fromEntries(cols.map(k => [k, { x: r.f4c[k].fold, n: r.f4c[k].n }])) },
    { label: 'Холодный 4-бет: колл', tone: 'ice', own: true, sub: true, data: Object.fromEntries(cols.map(k => [k, { x: r.f4c[k].call, n: r.f4c[k].n }])) },
    { label: 'Холодный 4-бет: рейз', tone: 'ice', own: true, sub: true, data: Object.fromEntries(cols.map(k => [k, { x: r.f4c[k].rz, n: r.f4c[k].n }])) },
    { label: 'Холодный 4-бет: 5-бет (когда был возможен)', tone: 'ice', own: true, sub: true, data: Object.fromEntries(cols.map(k => [k, { x: r.f4c[k].x5, n: r.f4c[k].n5 }])) }] });
  const heroPos = TB_POS.filter(p => r.vs4[p]);
  const opCols = ['EP', 'MP', 'HJ', 'CO', 'BTN', 'SB'].filter(op => heroPos.some(p => r.vs4[p][op]));
  const body = el('div');
  card.append(numTag(10), el('span', 'k', 'Ответ на 4-бет после вашего 3-бета'), el('span', 's', 'как часто вы сбрасываете, коллируете и ставите 5-бет — по позициям и против каждой позиции открывающего'), w,
    el('span', 's tb-sub', 'Против позиции открывающего'), segBtns([['fold', 'Фолд'], ['call', 'Колл'], ['x5', '5-бет']], TB_4, (k) => { TB_4 = k; draw(); }), body,
    infoNote('Верхние строки — 4-бет от открывающего (того, кого вы 3-бетили); нижние — холодный 4-бет от игрока, который ходил после вас. Считаются раздачи, где вы после 4-бета сделали ход. «Рейз на 4-бет» — любой ваш рейз (обычно олл-ин). «5-бет» — как в Hand2Note: доля рейзов только там, где 4-бет был не олл-ином и у вас оставались фишки на рейз. В таблице ниже строки — ваша позиция, колонки — позиция открывающего. 4-бетов немного, поэтому почти все ячейки с маленькой выборкой: в них указано число раздач.'));
  function draw() {
    const rows = heroPos.map(p => { const d = {}; opCols.forEach(op => { const f = r.vs4[p][op]; if (f) d[op] = TB_4 === 'x5' ? { x: f.x5, n: f.n5 } : { x: f[TB_4], n: f.n }; }); return { key: p, label: p, data: d }; });
    body.replaceChildren(heroPos.length ? heatTable({ cols: opCols, rows, noTot: true }) : el('p', 'muted small', 'Нет 4-бетов против ваших 3-бетов в выборке.'));
  }
  draw();
  return card;
}
// #10 — 3-бет против изолейта (лимп → рейз → ваш рейз), как «3B vs ISO» в Hand2Note
function tbIsoBlock(r) {
  const card = el('div', 'insight cc-table');
  const cols = r.TB_COLS.filter(k => k === 'TOT' || r.iso[k].n > 0);
  card.append(numTag(11), el('span', 'k', '3-бет против изолейта'), el('span', 's', 'лимпер, затем рейз — и вы рейзите поверх'),
    heatTable({ cols, groupGapBefore: cols.indexOf('SB'), rows: [{ label: '3-бет vs изолейт', data: r.iso }, { label: 'Фолд на 4-бет', tone: 'ice', data: r.isoF }] }),
    infoNote('Ситуация: до вас кто-то сыграл лимп, другой игрок изолировал его рейзом, после рейза коллеров не было, и вы ответили рейзом. Hand2Note показывает это отдельно как «3B vs ISO». «Фолд на 4-бет» — вы сбросили на 4-бет после такого 3-бета. Таких раздач обычно мало: в ячейках с маленькой выборкой указано число раздач.'));
  return card;
}
function renderTB(idx) {
  const r = Stats.tb(DB, idx, { oPos: uiState.tbOPos, oStk: uiState.tbOStkR, oMy: uiState.tbOMyR, oOpen: uiState.tbOOpen });
  const page = el('div', 'page');
  const head = el('div', 'page-head');
  const h1 = el('h1'); h1.append(document.createTextNode('3-бет '), el('span', null, '3B'));
  head.append(h1, el('p', null, 'Как часто вы отвечаете рейзом на одно открытие перед вами и что это приносит.'));
  page.append(head);
  if (r.fineAll && r.fineOk < r.fineAll * 0.9) page.append(el('p', 'muted small tb-wait', 'Позиции HJ и ответы на 3-бет ещё досчитываются для части раздач — откройте базу заново после обновления.'));
  const posRows = TB_POS.filter(p => r.tb[p].n >= SMALL).map(p => { const z = r.tb[p]; return [p, z.n ? z.x / z.n : null, p + ': ' + z.x + ' из ' + z.n]; });
  const c1 = card(1, '3-бетите', '<em>' + pctTxt(r.tb.TOT) + '</em>', 'из ' + r.tb.TOT.n.toLocaleString('ru-RU') + ' открытий перед вами',
    fillBox(posStrip('По позициям', posRows), respTiles(r.resp, 'Ваш ответ на открытие', [['фолд', 'var(--good)'], ['колл', 'var(--ice)'], ['3-бет', 'var(--bad)']])));
  // #2 — результат по позициям; переключатель вашего стека (BB в начале раздачи) и свой диапазон
  const STK2 = [['all', 'Любой стек', null], ['s15', '< 15', [0, 15]], ['s25', '15–25', [15, 25]], ['s40', '25–40', [25, 40]], ['s40p', '40+', [40, 1e9]]];
  const rng = uiState.tbRes === 'custom' && uiState.tbResC ? uiState.tbResC : (STK2.find(x => x[0] === uiState.tbRes) || STK2[0])[2];
  const ty2 = uiState.tbResT || 'all', flt = rng || ty2 !== 'all'; // тип 3-бета: все / не олл-ин / олл-ин
  const cc = DB.cols, EVc = EVcol(), inR = (i) => (!rng || (cc.bb[i] >= rng[0] * 10 && cc.bb[i] < rng[1] * 10)) && (ty2 === 'all' || (ty2 === 'ai' ? cc.act[i] === 3 : cc.act[i] === 2));
  const sub2 = (z) => { if (!flt) return z; const o = { n: 0, sum: 0, es: 0, ids: [], mx: Array.from({ length: 169 }, () => ({ n: 0, sum: 0, es: 0 })) }; z.ids.forEach(i => { if (!inR(i)) return; const m = o.mx[cc.hc[i]]; o.n++; o.sum += cc.net[i]; o.es += EVc[i]; o.ids.push(i); m.n++; m.sum += cc.net[i]; m.es += EVc[i]; }); return o; };
  const resp = (p, z) => { if (!flt) { const a = r.t3r[p]; return [a[0], a[1], a[2] + a[3]]; } const a = [0, 0, 0]; z.ids.forEach(i => { const v = cc.t3r ? cc.t3r[i] : -1; if (v >= 0) a[Math.min(2, v & 3)]++; }); return a; };
  const H2 = {}; ['TOT'].concat(TB_POS).forEach(p => { H2[p] = sub2(r.hands[p]); });
  const pos = TB_POS.filter(p => H2[p].n >= (flt ? 1 : SMALL));
  const items = pos.map(p => { const z = H2[p], it = tbItem(r, p); Object.assign(it, { o: { n: z.n, sum: z.sum, es: z.es }, mx: z.mx, ids: z.ids, key: 'tb ' + p + (rng ? ' ' + rng.join('-') : '') + ty2 }); it.r = resp(p, z); return it; });
  LAST_NET_ITEMS = items;
  const t = H2.TOT, avg = t.n ? t.sum / 10 / t.n : null, avgE = t.n ? t.es / 10 / t.n : null;
  const ctl = el('div', 'tb-res-ctl');
  ctl.append(segBtns([['all', 'Все 3-беты'], ['nai', 'Не олл-ин'], ['ai', 'Олл-ин']], ty2, (k) => { uiState.tbResT = k; renderNext(); }), stkSeg(uiState.tbRes === 'custom' ? uiState.tbResC : null, uiState.tbRes || 'all', (k) => { uiState.tbRes = k; renderNext(); }),
    rangeForm('tbRes', uiState.tbRes === 'custom' ? uiState.tbResC : null, (v) => { if (v) { uiState.tbResC = v; uiState.tbRes = 'custom'; } else { uiState.tbResC = null; uiState.tbRes = 'all'; } render(); }));
  const chartBox = el('div'); chartBox.append(ctl, el('span', 'muted small tb-res-n', [ty2 === 'ai' ? 'Олл-ин' : ty2 === 'nai' ? 'Не олл-ин' : '', rng ? 'ваш стек ' + rangeTxt(rng) : ''].filter(Boolean).join(', ').replace(/^в/, (m) => (ty2 === 'all' ? 'В' : m)) + (flt ? ': ' : '') + t.n.toLocaleString('ru-RU') + ' 3-бетов'), netChart(items, avg, 'EV 3-бета'));
  const c2 = resHead(card(2, 'Результат 3-бета', wrHtml(avg, avgE, 2) + ' <small>BB за 3-бет</small>', null, chartBox));
  c2.classList.add('wide');
  const zone = el('div', 'summary'); const pair = el('div', 'sum-pair'); pair.append(c1, c2); zone.append(pair);
  zone.append(tbTable(r),
    ccGroupBlock(r, { cols: TB_POS, tag: 4, title: 'Результат 3-бета по группам рук', sub: 'BB за 3-бет: всего и по группам рук, факт / EV', name: '3-бет', nameOf: (p) => 'Ваш 3-бет с ' + p, verb: 'не 3-бетили', act: undefined, vlab: ' BB за 3-бет', nlab: ' 3-бетов', none: 'Нет 3-бетов в выборке.', key: 'tbg', p: false,
      note: 'В ячейке — результат 3-бета группой рук с этой позиции в BB (вместе с олл-инами): сверху факт, под ним EV, справа мелко — число 3-бетов. Цвет — плюс или минус. Наведите — матрица рук группы и их итог; клик закрепит окно, клик по руке откроет раздачи и реплеер. Бледные ячейки — меньше 30 раздач.' }),
    tbVsBlock(r), tbOppBlock(r), tbSizeBlock(r), tbStackBlock(r), tbSplitBlock(r), tbXBlock(r), tb4Block(r), tbIsoBlock(r));
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
  const idx = Stats.selectHands(DB, { aid: DB === HERO_DB && !state.player ? state.alias : null, room: state.room, type: state.type, from: state.from, to: state.to, biFrom: state.biFrom, biTo: state.biTo, tbl: state.sub === 'TOT' ? null : state.sub });
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
let RS_F = 0, LASTBTN = null;
document.addEventListener('click', (e) => { LASTBTN = e.target && e.target.closest ? e.target.closest('button') : null; }, true);
function renderNext() {
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
      b.onclick = () => { if (t.id === 'aliases' && state.tab !== 'aliases') PREV_TAB = state.tab; state.tab = t.id; renderNext(); $('content').scrollTop = 0; };
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
  if (!DB) { $('selCount').textContent = '—'; CURRENT_IDX = []; $('content').replaceChildren(renderWelcome()); return; }
  const idx = currentIdx();
  const tool = tab.id === 'aliases'; // вкладка-инструмент: без столов и счётчика выборки
  subs.hidden = tool;
  $('selCount').textContent = tool ? '' : idx.length.toLocaleString('ru-RU') + ' рук в выборке';
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
  $('handsCount').textContent = count.toLocaleString('ru-RU') + ' раздач' + (opp ? ' · соперник · ' + roomName : nv ? ' · ' + roomName + (A && A.k === state.nickA && A.off.has(nv) ? ' · вне алиаса' : '') : alias && A ? ' · ' + nicksLabel(nickCount(A)) + (aliasRooms(A).length > 1 ? ' · все румы' : '') : alias ? '' : ' · ' + roomName);
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
    $('impModeAppendSub').textContent = 'сейчас в базе ' + DBINFO.count.toLocaleString('ru-RU') + ' раздач — новые допишутся, повторы пропустятся';
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
    ? (res.added ? 'Добавлено ' + res.added.toLocaleString('ru-RU') + ' раздач' : 'Новых раздач нет') + (res.dup ? ', повторов пропущено: ' + res.dup.toLocaleString('ru-RU') : '') + (res.refilled ? '; у ' + res.refilled.toLocaleString('ru-RU') + ' уже загруженных раздач дописаны время, турнир и реплеер' : '') + (res.bounty ? '; у ' + res.bounty.toLocaleString('ru-RU') + ' уже загруженных раздач дописаны баунти' : '') + '. Всего в базе: ' + res.hands.toLocaleString('ru-RU') + ' раздач, соперников: ' + (res.players || 0).toLocaleString('ru-RU') + '.'
    : 'Готово: ' + res.hands.toLocaleString('ru-RU') + ' раздач' + (res.players ? ', соперников: ' + res.players.toLocaleString('ru-RU') : '') + (res.dup ? ', повторов пропущено: ' + res.dup.toLocaleString('ru-RU') : '') + (res.refilled ? '; у ' + res.refilled.toLocaleString('ru-RU') + ' уже загруженных раздач дописаны время, турнир и реплеер' : '') + (res.bounty ? '; у ' + res.bounty.toLocaleString('ru-RU') + ' уже загруженных раздач дописаны баунти' : '') + '.';
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
