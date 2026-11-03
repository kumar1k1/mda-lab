'use strict';
/* global mda, Stats */
// Вкладка «Открытие» (RFI).
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
  if (hoverMuted(e) || SZMX_PIN || document.querySelector('.hand-pop.pinned')) return; // закреплённое окно открыто — подсказки не наслаиваются
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
    // порядок строк постоянный (SB короткий → глубокий, внутри BB короткий → глубокий): при смене фильтров строки не переставляются
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
        // наведение — матрица рук этих открытий и их итог (как в 3.4); клик — закрепить окно, раздачи и реплеер
        if (z.ids && z.ids.length) {
          const cc = DB.cols, E = EVcol(), mx = Array.from({ length: 169 }, () => ({ n: 0, sum: 0, es: 0 })), o2 = { n: 0, sum: 0, es: 0 };
          z.ids.forEach(i => { o2.n++; o2.sum += cc.net[i]; o2.es += E[i]; if (cc.hc[i] >= 0) { const q = mx[cc.hc[i]]; q.n++; q.sum += cc.net[i]; q.es += E[i]; } });
          const pos = cell.dataset.pos, it = { p: pos, key: 'bx' + pos + r.i + r.j + z.ids.length, title: 'Стил с ' + pos + ' · SB ' + BX_NAMES[r.i] + ' · BB ' + BX_NAMES[r.j], o: o2, mx, ids: z.ids };
          const v2 = o2.sum / 10 / o2.n;
          cell.classList.add('click'); cell.tabIndex = 0; cell.setAttribute('role', 'button');
          const show = (e) => showHandPop(it, v2, e, cell);
          cell.addEventListener('mouseenter', show); cell.addEventListener('mousemove', show); cell.addEventListener('mouseleave', hideHandPop);
          cell.addEventListener('click', (e) => pinHandPop(it, v2, e, cell));
          cell.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pinHandPop(it, v2, null, cell); } });
        }
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

function renderStealPanel(idx, ot) {
  const o = Stats.stealExtra(DB, idx, { ot });
  // каждый пункт 3.1–3.8 — отдельное окно; общий контейнер без рамки
  const card = el('div', 'steal-split');
  card.append(el('span', 'num-tag', '#3+')); // служебная метка для раскладки, скрыта стилями
  const grid = card;
  const pct = (v) => (v == null ? '—' : fmtPct(v) + '%');
  const f3 = (z) => (z.n ? z.x / z.n : null);
  const nb = (z) => (z.n ? z.sum / 10 / z.n : null);
  grid.append(stealResultCard(o));
  grid.append(sizingCard(ot && ot !== 'all' ? Stats.stealExtra(DB, idx) : o)); // 3.5 — без олл-инов по определению: тип открытия не применяется, только стек
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
  if (hoverMuted(e) || SZMX_PIN || document.querySelector('.hand-pop.pinned')) return; // закреплённое окно открыто — подсказки не наслаиваются
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
function isoData(idx, ot) {
  const c = DB.cols, EV = EVcol(), cell = () => ({ o: 0, x: 0, sum: 0, es: 0, n: 0, f: 0, fn: 0, rmx: null, rids: null, vmx: null, ids: null });
  const M = [ISO_POS.map(cell), ISO_POS.map(cell)], tot = [cell(), cell()], resp = [0, 0, 0], respL = [[0, 0, 0], [0, 0, 0]], szx = [{}, {}];
  for (const i of idx) {
    const p = c.pos[i]; if (c.sit[i] !== 1 || p < 1) continue;
    const r = c.lim[i] === 1 ? 0 : 1, z = M[r][p - 1], t = tot[r];
    const bvb = c.bvb ? c.bvb[i] === 1 : false, raised = ot === 'nai' ? c.act[i] === 2 : ot === 'ai' ? c.act[i] === 3 : c.act[i] >= 2;
    t.o++; if (raised) t.x++;
    z.o++; if (raised) z.x++; // как в Hand2Note: в BB считается и лимп SB
    // окно «Диапазон» (как #7): все ответы по рукам — изолейт (олл-ин отдельно), колл, фолд; vmx/ids — только изолейты («Факт/EV» и раздачи)
    const hc = c.hc ? c.hc[i] : -1;
    if (hc >= 0) { if (!z.rmx) { z.rmx = Array.from({ length: 169 }, () => ({ n: 0, x: 0, ai: 0, lp: 0, sum: 0, es: 0 })); z.rids = []; } const m = z.rmx[hc]; m.n++; if (c.net) { m.sum += c.net[i]; m.es += EV[i]; } z.rids.push(i); if (raised) { m.x++; if (c.act[i] === 3) m.ai++; } else if (c.act[i] === 1) m.lp++; }
    if (!raised) continue;
    (z.ids || (z.ids = [])).push(i);
    if (hc >= 0) { if (!z.vmx) z.vmx = Array.from({ length: 169 }, () => ({ n: 0, sum: 0, es: 0 })); const vv = z.vmx[hc]; vv.n++; if (c.net) { vv.sum += c.net[i]; vv.es += EV[i]; } }
    if (c.orsp && c.orsp[i] >= 0) { resp[c.orsp[i]]++; respL[r][c.orsp[i]]++; }
    if (c.act[i] === 2 && c.bb[i] / 10 - c.size[i] / 100 >= 0.5) { // сайзинг изолейта с точностью до 0.5 BB, без олл-инов
      const key = String(Math.round(c.size[i] / 50) / 2);
      const q = szx[r][key] || (szx[r][key] = { n: 0, r: [0, 0, 0], rn: 0, sum: 0, es: 0, sn: 0 });
      q.n++; if (c.orsp && c.orsp[i] >= 0) { q.r[c.orsp[i]]++; q.rn++; } if (c.net) { q.sum += c.net[i]; q.es += EV[i]; q.sn++; }
    }
    if (c.fvr && c.fvr[i] >= 0) { z.fn++; if (c.fvr[i] === 1) z.f++; }
    if (c.net) { z.sum += c.net[i]; z.es += EV[i]; z.n++; }
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
      if (z.rmx) {
        // окно «Диапазон» (как #7): изолейт (олл-ин — синим), колл, фолд; «Факт/EV» и раздачи — только изолейты, в «Диапазоне» нажимаются только руки с изолейтом
        const zz = { n: z.o, rmx: z.rmx, vmx: z.vmx || null, rids: z.ids || z.rids, labels: ['изолейт', 'олл-ин', 'колл', 'фолд'], capAll: 'только ваши изолейты' };
        const wt = title + ' · изолейт ' + fmtPct(f) + '%';
        c.tabIndex = 0; c.setAttribute('role', 'button'); c.setAttribute('aria-label', title + ': показать руки и раздачи'); c.classList.add('click');
        c.addEventListener('mouseenter', (ev) => showSzMx(wt, zz, c, ev));
        c.addEventListener('mousemove', (ev) => { if (!SZMX_PIN && szMx && !szMx.hidden) placeSzMx(c, ev); });
        c.addEventListener('mouseleave', hideSzMx);
        c.addEventListener('click', (ev) => pinSzMx(wt, zz, c, ev));
        c.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pinSzMx(wt, zz, c, null); } });
      }
      tb.append(c);
    });
  });
  card.append(tb, infoNote('В клетке: частота изолейта (как часто вы рейзите, когда перед вами лимпили), и винрейт за изолейт в BB. Чем ярче клетка, тем чаще изолейт; бледные — меньше 20 возможностей. Наведите на клетку — матрица ответов; клик закрепит окно: «Диапазон» — все ответы (нажимаются только руки с изолейтом), «Факт, BB» и «EV, BB» — итоги изолейтов, клик по руке — только раздачи с изолейтом.'), isoSizing(d));
  return card;
}

// Переключатели над графиком «Результат …» (RFI #8, колд-колл #8, 3-бет #2): тип действия, ваш стек и свой диапазон стека.

function renderRFISummary(idx, r) {
  // Фильтры раздела «Открытие» (тип открытия и ваш стек) действуют только на карточки 1, 3, 3.4, 3.5, 3.7, 4, 5, 5+ и 8;
  // карточки 4+ и 13 — по всем раздачам выборки. Тип открытия не применяется у карточки 4 (доля пушей стала бы 0 или 100%),
  // у 3.5 (сайзинг — без олл-инов по определению), у 5 и 5+ (изолейт — не открытие); у них — только стек.
  const sr = secRange('rfi'), ot = secF('rfi').T, cb = DB.cols;
  const idxF = sr ? idx.filter(i => cb.bb[i] >= sr[0] * 10 && cb.bb[i] < sr[1] * 10) : idx;
  const mxOpt = { mxPos: uiState.mxPos, mxStk: uiState.mxStk === 'custom' && uiState.mxCustom ? uiState.mxCustom : (MX_STK.find(z => z[0] === uiState.mxStk) || MX_STK[0])[2] };
  const x = Stats.rfiExtra(DB, idxF, Object.assign({ ot }, mxOpt)); // 1, 3, 8
  const xS = ot === 'all' ? x : Stats.rfiExtra(DB, idxF, mxOpt); // 4 — только стек
  const x0 = sr || ot !== 'all' ? Stats.rfiExtra(DB, idx, mxOpt) : x; // 13 — без фильтров раздела
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
  // #8 — по фильтрам раздела: x посчитан по вашему стеку и типу открытия
  const it8 = ['UTG', 'MP', 'CO', 'BTN', 'SB'].map(p => ({ p, key: 'rfi8 ' + p + ot + (sr || []).join('-'), o: x.openNetPos[p], mx: x.netMx[p], ids: x.openNetPos[p].ids, r: x.respPos[p] })) /* ids — открытия под фильтрами раздела: без них список по руке брал все раздачи шапки (стек и тип раздела не действовали) */, avg8 = nb == null ? null : nb / 100, ev8 = perEv(x.openNet), n8 = x.openNet.n;
  LAST_NET_ITEMS = it8;
  const box8 = el('div'); box8.append(secLabel('rfi', n8, 'открытий'), netChart(it8, avg8, 'EV открытий'));
  const c8 = (card(8, 'Результат открытий', wrHtml(avg8, ev8, 2) + ' <small>BB за открытие</small>', null, box8));
  c8.classList.add('wide', 'span3');
  cards.append(c8);
  // #3 — стил + ответ блайндов (CO и BTN вместе), как в #1
  const so = Stats.stealExtra(DB, idxF, { ot });
  const sresp = [0, 1, 2].map(k => so.CO.resp[k] + so.BTN.resp[k]);
  cards.append(card(3, 'Стил с CO и BTN', '<em>' + pctTxt(x.late) + '</em>', 'когда до вас все сбросили', fillBox(posStrip('По позициям', ['CO', 'BTN'].map(p => [p, x.latePos[p].n ? x.latePos[p].x / x.latePos[p].n : null, p + ': ' + x.latePos[p].x + ' из ' + x.latePos[p].n])), respTiles(sresp, ''))));

  // #4 — доля пушей и разбивка по стеку
  const st = el('div', 'mini-bars');
  const maxSh = Math.max(0.01, ...xS.shoveStk.map(z => (z.n ? z.x / z.n : 0)));
  xS.SHOVE_STK.forEach((lab, k) => {
    const z = xS.shoveStk[k]; const v = z.n ? z.x / z.n : null;
    const r = el('div', 'mb-row'); r.title = lab + ' BB: пушей ' + z.x + ' из ' + z.n + ' открытий';
    const tr = el('div', 'mb-track'); const f = el('div', 'mb-fill'); f.style.width = (v == null ? 0 : v / maxSh * 100) + '%'; tr.append(f);
    r.append(el('span', 'mb-l', lab + ' BB'), tr, el('span', 'mb-v', v == null ? '—' : fmtPct(v) + '%'));
    st.append(r);
  });
  const presp = [0, 0], pp = ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB'].map(() => ({ x: 0, n: 0 }));
  { const c = DB.cols; for (const i of idxF) if (c.sit[i] === 0 && c.pos[i] <= 5 && c.act[i] >= 2) { pp[c.pos[i]].n++; if (c.act[i] === 3) pp[c.pos[i]].x++; } }
  const pushPos = ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB'].map((p, k) => [p, pp[k].n ? pp[k].x / pp[k].n : null, p + ': ' + pp[k].x + ' пушей из ' + pp[k].n + ' открытий']).filter(r => r[0] !== 'HJ');
  { const c = DB.cols; if (c.orsp) for (const i of idxF) if (c.sit[i] === 0 && c.pos[i] <= 5 && c.act[i] === 3 && c.orsp[i] >= 0) presp[c.orsp[i] === 0 ? 0 : 1]++; }
  cards.append(card(4, 'Доля пушей среди открытий', '<em>' + pctTxt(xS.shove) + '</em>', xS.shove.x.toLocaleString('ru-RU') + ' пушей из ' + xS.shove.n.toLocaleString('ru-RU') + ' открытий',
    fillBox(posStrip('По позициям — доля пушей среди открытий', pushPos), respTiles(presp, '', [['фолд', 'var(--good)'], ['колл', 'var(--ice)']]))));
  const shovePanel = renderShovePanel(idx, st);


  const dall2 = dall;
  // раскладка по строкам: карточка слева, её инфографика справа
  const byTag = {}; [...cards.children].forEach(n => { byTag[n.querySelector('.num-tag').textContent] = n; });
  byTag['#3+'] = renderStealPanel(idxF, ot); byTag['#4+'] = shovePanel;
  byTag['#5'] = isoCard(isoData(idxF)); byTag['#5+'] = isoPanel(isoData(idxF)); // 5 и 5+ — только стек (изолейт — не открытие, тип открытия к нему не относится)
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
  const mxBody = el('div', 'block-body'); mxBody.append(handMatrix(x0.mx));
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
  const mxN = x0.mx.reduce((a, m) => a + m.n, 0);
  const mxLeg = el('div', 'resp-legend row'); [['рейз', 'var(--mx-raise)'], ['олл-ин', 'var(--mx-push)'], ['лимп / колл', 'var(--mx-limp)'], ['фолд', 'var(--mx-empty)']].forEach(([l, col]) => { const it = el('span'); const i = el('i'); i.style.background = col; if (col === 'var(--mx-empty)') i.style.border = '1px solid var(--line2)'; it.append(i, document.createTextNode(l)); mxLeg.append(it); });
  mxSide.append(mxLeg, el('span', 'mx-cap', 'Позиция'), seg, el('span', 'mx-cap', 'Ваш стек, BB'), segS, el('span', 'mx-cap', 'Свой диапазон'), cr, el('span', 'muted small', (cur ? 'Стек ' + cur[0] + '–' + (cur[1] < 1e8 ? cur[1] : '∞') + ' BB: ' : '') + mxN.toLocaleString('ru-RU') + ' возможностей открыться в выборке'));
  mxSide.append(infoNote('Клетка закрашена слева направо на долю открытий этой руки: янтарная часть — рейзы, синяя — олл-ин, зелёная — лимпы, тёмная — фолды. Наведите на клетку, чтобы увидеть проценты каждого действия. Сверху от диагонали — одномастные, снизу — разномастные. Бледная заливка — меньше 5 раздач.'));
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

