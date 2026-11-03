'use strict';
/* global mda, Stats */
// Общие элементы карточек: числа и цвета, таблицы с подсветкой, мини-графики, карточка, график результата, матрица рук.
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
const uiState = { mxPos: 'UTG', mxStk: '20–30', mxCustom: null, ccPos: 'BTN', ccStk: '20–30', ccCustom: null, ccOPos: 'BTN', ccOStkR: null, ccOMyR: null, ccOOpen: [], tbOPos: 'BTN', tbOStkR: null, tbOMyR: null, tbOOpen: [], tbRes: 'all', tbResC: null, tbResT: 'all', v3OPos: 'CO', v3OStkR: null, v3OMyR: null, v3OOpen: [] };
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
// Что показывать в ячейках таблиц одним числом: EV (с поправкой на эквити в олл-инах) или факт. Общий выбор для всего проекта
// (переключатель valSeg в карточках); оба числа — в подсказке при наведении.
let VAL_MODE = 'ev';
const valPick = (f, e) => (VAL_MODE === 'ev' && e != null ? e : f);
function valSeg() { const s = segBtns([['ev', 'EV, BB'], ['net', 'Факт, BB']], VAL_MODE, (k) => { VAL_MODE = k; renderNext(); }); s.classList.add('val-seg'); s.title = 'Что показывать в ячейках: EV (с поправкой на эквити в олл-инах) или фактический результат. Оба числа — в подсказке при наведении.'; return s; }
function pmxWr(f, e) {
  const s = el('span', 'pmx-w'), v = valPick(f, e);
  s.append(el('span', 'pmx-wf ' + (v == null ? '' : v >= 0 ? 'up' : 'down'), v == null ? '—' : signed(v, 2) + (VAL_MODE === 'ev' && e != null ? ' EV' : '')));
  if (f != null) s.title = signed(f, 2) + ' BB факт' + (e != null ? ', ' + signed(e, 2) + ' BB EV' : '');
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
      tt.textContent = it.p + ', ответ оппонентов: фолд ' + fmtPct(rs[0] / rt) + '%, колл ' + fmtPct(rs[1] / rt) + '%, рейз ' + fmtPct(rs[2] / rt) + '% (' + cnt(rt, 'открытий') + ')';
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
    g.setAttribute('aria-label', it.p + ': ' + signed(v, 2) + ' BB' + (e == null ? '' : ', EV ' + signed(e, 2) + ' BB') + ', ' + cnt(it.o.n, 'раз'));
    if (it.sz) { // окно первого типа («Диапазон»): наведение — матрица ответов рукой, клик — закрепить с вкладками «Диапазон / Факт / EV»
      g.addEventListener('mouseenter', (e) => showSzMx(it.szTitle || it.p, it.sz, g, e)); g.addEventListener('mousemove', (e) => { if (!SZMX_PIN && szMx && !szMx.hidden) placeSzMx(g, e); }); g.addEventListener('mouseleave', hideSzMx);
      g.addEventListener('click', (e) => pinSzMx(it.szTitle || it.p, it.sz, g, e)); g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pinSzMx(it.szTitle || it.p, it.sz, g); } });
    } else {
    const show = (ev) => showHandPop(it, v, ev, g);
    g.addEventListener('mouseenter', show); g.addEventListener('mousemove', show); g.addEventListener('focus', show);
    g.addEventListener('mouseleave', hideHandPop); g.addEventListener('blur', hideHandPop);
    g.addEventListener('click', (ev) => pinHandPop(it, v, ev, g));
    g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pinHandPop(it, v, null, g); } });
    }
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
  if (hoverMuted(e) || SZMX_PIN || document.querySelector('.hand-pop.pinned')) return; // закреплённое окно открыто — подсказки не наслаиваются
  if (!mxTip) { mxTip = el('div', 'mx-tip'); mxTip.setAttribute('role', 'tooltip'); document.body.append(mxTip); }
  mxTip.replaceChildren();
  const h = el('div', 'mt-h'); h.append(el('b', null, info.name), el('span', null, info.n ? cnt(info.n, 'раз') : 'не было'));
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
      cell.title = label + ': ' + cnt(d.hands, 'рук') + ', RFI ' + (d.n ? Math.round(d.x / d.n * 100) + '%' : '—') + ', результат ' + signed(d.net / 10, 0) + ' BB';
    } else cell.title = label + ': не играли';
    grid.append(cell);
  }
  wrap.append(grid);
  return wrap;
}

