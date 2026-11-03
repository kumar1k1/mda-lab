'use strict';
/* global mda, Stats */
// Вкладка «Колд-колл» (CC).
// ---------- вкладка «Колд-колл» ----------
// #6 — колд-колл против разных сайзингов открытия (без олл-инов): частоты ответа и винрейт колла
let CC_SZPOS = 'TOT';

function ccSizeBlock(r) {
  const card = el('div', 'insight cc-table');
  card.append(numTag(6), el('b', 'pm-title', 'Против сайзинга открытия'), el('span', 'sm-s', 'как вы отвечаете на открытие разного размера и какой результат дают ваши коллы'));
  const posList = ['TOT'].concat(r.CC_COLS.slice(1).filter(p => r.cc[p].n >= SMALL));
  const body = el('div');
  card.append(segBtns(posList.map(p => [p, p === 'TOT' ? 'Все без BB' : p]), CC_SZPOS, (k) => { CC_SZPOS = k; draw(); }), body,
    infoNote('Размер — до скольких BB открыл соперник. Доля — какая часть всех открытий перед вами была такого размера. Колл / 3-бет / Фолд — ваш ответ. Винрейт — средний итог раздачи после вашего колла. Наведите на строку — матрица ответов; клик закрепит окно: «Диапазон» — все ответы, «Факт, BB» и «EV, BB» — итоги ваших коллов, клик по руке — только раздачи с коллом. Бледные строки — меньше 30 раздач.'));
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
        wrNode('sz5-v', wr, we, 2), el('small', null, cnt(z.n, 'раз')), tk);
      // наведение на строку — матрица рук: колл / 3-бет / олл-ин / фолд против этого размера; «Факт/EV» и раздачи — только коллы
      if (z.rmx) {
        const title = (CC_SZPOS === 'TOT' ? 'Вы на всех позициях без BB' : 'Вы на ' + CC_SZPOS) + ' · перед вами открытие ' + r.CC_SZ[k][0];
        const zz = Object.assign({}, z, { vmx: z.mx || null, rids: z.ids || z.rids, capAll: 'только ваши коллы' });
        row.classList.add('has-mx'); row.tabIndex = 0;
        row.addEventListener('mouseenter', (e) => showSzMx(title, zz, row, e)); row.addEventListener('mousemove', (e) => { if (!SZMX_PIN && szMx && !szMx.hidden) placeSzMx(row, e); }); row.addEventListener('mouseleave', hideSzMx);
        row.addEventListener('focus', () => showSzMx(title, zz, row)); row.addEventListener('blur', hideSzMx);
        row.addEventListener('click', (e) => pinSzMx(title, zz, row, e));
        row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pinSzMx(title, zz, row); } });
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
    const t = svgEl('title'); t.textContent = x.lab + ': защита ' + fmtPct(def) + '% (колл ' + fmtPct(call) + '%, 3-бет ' + fmtPct(rz) + '%), нужно по шансам банка ' + fmtPct(mdf) + '%, ' + cnt(z.n, 'раз'); g.append(t);
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
const rangeTxt = (r) => (r ? (r[1] < 1e8 ? r[0] + '–' + r[1] : r[0] + '+') + ' BB' : 'любой');
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
    el('span', 'muted small', 'Открывающий: ' + (sel.length ? sel.join(' + ') : 'любая позиция') + ', ' + rangeTxt(uiState.ccOStkR) + ' · вы: ' + rangeTxt(uiState.ccOMyR) + ' · ' + cnt(n, 'раз') + ' перед вами был один рейз'));
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
    el('span', 'muted small', (cur ? 'Стек ' + cur[0] + '–' + (cur[1] < 1e8 ? cur[1] : '∞') + ' BB: ' : '') + cnt(n, 'раз') + ' перед вами был один рейз'));
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
  { const sg = valSeg(); sg.classList.add('v3-rt-seg'); card.append(sg); }
  // таблица: группа рук × позиция
  const vals = []; pos.forEach(p => agg[p].g.forEach(z => { if (z.n >= 5) vals.push(Math.abs(valPick(z.sum, z.es) / 10 / z.n)); }));
  vals.sort((a, b) => a - b); const scale = Math.max(0.5, vals[Math.floor(vals.length * 0.9)] || 0.5);
  const tbl = el('div', 'ccg-t'); tbl.style.setProperty('--ncol', pos.length);
  const hd = el('div', 'ccg-r ccg-head'); hd.append(el('span', null, 'Группа рук')); pos.forEach(p => hd.append(el('span', null, p))); tbl.append(hd);
  HAND_GROUPS.forEach(([lab], k) => {
    const row = el('div', 'ccg-r'); row.append(el('span', 'ccg-l', lab));
    pos.forEach(p => {
      const z = agg[p].g[k], hands = agg[p].h, cell = el('div', 'ccg-c');
      cell.addEventListener('mouseenter', (e) => showGroupTip(p, lab, k, z, hands, e, o.verb)); cell.addEventListener('mousemove', moveGroupTip); cell.addEventListener('mouseleave', hideGroupTip);
      if (!z.n) { cell.append(el('span', 'hg-na', '—')); row.append(cell); return; }
      const v = valPick(z.sum, z.es) / 10 / z.n, t = Math.min(1, Math.abs(v) / scale); // цвет и число — по выбранному «EV / факт»
      cell.style.background = 'rgba(' + (v >= 0 ? 'var(--good-rgb)' : 'var(--bad-rgb)') + ',' + (0.08 + 0.32 * t).toFixed(2) + ')';
      const f = el('b', v >= 0 ? 'up' : 'down', signed(v, 2) + (VAL_MODE === 'ev' ? ' EV' : ''));
      cell.append(f, el('span', 'ccg-n', String(z.n))); cell.title = signed(z.sum / 10 / z.n, 2) + ' BB факт, ' + signed(z.es / 10 / z.n, 2) + ' BB EV · ' + z.n;
      if (z.n < 30) cell.classList.add('low');
      cell.classList.add('click'); cell.tabIndex = 0; cell.setAttribute('role', 'button'); cell.setAttribute('aria-label', p + ', ' + lab + ': ' + signed(v, 2) + ' BB, ' + z.n + nlabOf(z.n, o.nlab) + ' — показать руки и раздачи');
      const pin = (e) => { hideGroupTip(); pinHandPop({ p: o.p ? p : null, key: o.key + p + k, title: (o.nameOf ? o.nameOf(p) : o.name + ' · ' + p) + ' · ' + lab, o: z, mx: hands, ids: r.hands[p].ids, only: (q) => handGroup(q) === k, sit: 2, act: o.act, vlab: o.vlab, nlab: o.nlab }, v, e, cell); };
      cell.addEventListener('click', pin); cell.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pin(null); } });
      row.append(cell);
    });
    tbl.append(row);
  });
  const wrap = el('div', 'ccg-wrap'); wrap.append(tbl); card.append(wrap);
  card.append(infoNote(o.note || 'В ячейке — результат колд-колла группой рук с этой позиции в BB (EV или факт — переключатель над таблицей; оба числа — при наведении), справа мелко — число колд-коллов. Цвет — плюс или минус. Наведите — матрица рук группы и их итог; клик закрепит окно, клик по руке откроет раздачи и реплеер. Бледные ячейки — меньше 30 раздач.'));
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
    if (pts.length < 5) { body.append(el('p', 'muted small', 'Мало игроков с достаточной выборкой' + (P0 === 'TOT' ? '' : ' на ' + P0) + ' (нужно ≥ ' + cnt(MIN_CC, 'возможностей', 'gen') + ' колд-колла и ≥ ' + MIN_CB + ' контбетов после него).')); return; }
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
      g.addEventListener('mouseenter', (e) => tip(e, 'Максимальный винрейт', line, 'по ' + cnt(Math.round(best.wh), 'колд-коллов', 'dat') + ' ' + cnt(best.np, 'игроков') + ' рядом с этой точкой (ваши раздачи тоже учтены)'));
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
    const bestTxt = best ? 'Максимальный винрейт по базе' + at + ': колд-колл около ' + Math.round(best.x * 100) + '%, фолд на контбет около ' + Math.round(best.y * 100) + '% — ' + bb(best.v) + ' ± ' + best.se.toFixed(2).replace('.', ',') + ' BB за колд-колл (рядом ' + cnt(best.np, 'игроков') + ' и ' + cnt(Math.round(best.wh), 'колд-коллов') + '; всего в расчёте ' + cnt(pool.length, 'игроков') + ' и ' + cnt(poolH, 'колд-коллов') + ').' + (best.se > 0.3 ? ' Погрешность большая — точку уточнит база побольше (датамайнинг).' : '')
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

// окно первого типа для колд-колла: R — ответ на открытие по рукам, h — колд-коллы (итог, список раздач)
const ccSz = (R, h) => ({ n: rangeN(R), rmx: R, vmx: h.mx, rids: h.ids, labels: ['3-бет', 'олл-ин', 'колл', 'фолд'], capAll: 'только колд-коллы', foldPaint: true });
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
    const R = op === 'TOT' ? r.rx[p] : r.rxVs[p] && r.rxVs[p][op];
    if (R) hoverRange(td, it.title, ccSz(R, z)); // окно первого типа: весь ответ на открытие, «Факт / EV» и список — колд-коллы
  });
  const card = el('div', 'insight cc-table');
  card.append(numTag(3), el('span', 'k', 'Колд-колл: позиция против позиции'), el('span', 's', 'строки — ваша позиция, колонки — позиция открывающего; в ячейке — доля коллов'), w,
    infoNote('Пустые ячейки (--) — ситуация невозможна: открывающий ходит раньше вас. Наведите на ячейку — диапазон: как вы ответили каждой рукой на открытие с этой позиции (колл, 3-бет, олл-ин, фолд); клик закрепит окно с вкладками «Диапазон / Факт / EV» — итог колд-коллов по рукам, клик по руке откроет раздачи и реплеер. Бледные ячейки — меньше ' + cnt(SMALL, 'раздач', 'gen') + '.'));
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
  // стек раздела — по карточкам (как в «Открытии»): карточка 5 со своими диапазонами стеков, без него
  const sr = secRange('cc'), cb = DB.cols;
  const idxS = sr ? idx.filter(i => cb.bb[i] >= sr[0] * 10 && cb.bb[i] < sr[1] * 10) : idx;
  const ccStk = uiState.ccStk === 'custom' && uiState.ccCustom ? uiState.ccCustom : (MX_STK.find(z => z[0] === uiState.ccStk) || MX_STK[0])[2];
  const ccOpt = { mxPos: uiState.ccPos, mxStk: ccStk, oPos: uiState.ccOPos, oStk: uiState.ccOStkR, oMy: uiState.ccOMyR, oOpen: uiState.ccOOpen };
  const r = Stats.cc(DB, idxS, ccOpt);
  const r5 = sr ? Stats.cc(DB, idx, ccOpt) : r; // #5 — без стека раздела
  const page = el('div', 'page');
  const head = el('div', 'page-head');
  const h1 = el('h1'); h1.append(document.createTextNode('Колд-колл '), el('span', null, 'CC'));
  head.append(h1, el('p', null, 'Как часто вы вступаете в игру коллом, когда до вас был один рейзер.'));
  page.append(head);
  // #1 — общий колд-колл, по позициям и ваш ответ на открытие; #2 — таблица по позициям (в стиле вкладки RFI)
  const posRows = ['UTG', 'MP', 'CO', 'BTN', 'SB'].filter(p => r.cc[p].n >= SMALL).map(p => { const z = r.cc[p]; return [p, z.n ? z.x / z.n : null, p + ': ' + z.x + ' из ' + z.n]; });
  const c1 = card(1, 'Колд-коллите', '<em>' + pctTxt(r.cc.TOT) + '</em>', 'из ' + cnt(r.cc.TOT.n, 'открытий', 'gen') + ' перед вами, без BB',
    fillBox(posStrip('По позициям', posRows), respTiles(r.resp, 'Ваш ответ на открытие', [['фолд', 'var(--good)'], ['колл', 'var(--ice)'], ['3-бет', 'var(--bad)']])));
  const c2 = el('div', 'insight');
  c2.append(numTag(2), el('span', 'k', 'Колд-колл по позициям'), ccTable(r));
  const note = infoNote('TOT — все позиции без BB (колл из BB — защита большого блайнда, показан отдельной колонкой). В SB колл открытия считается колд-коллом. Наведите на ячейку — покажется матрица рук, которыми вы коллировали, и их итог; клик закрепит окно, клик по руке откроет раздачи и реплеер. Бледные ячейки — меньше ' + cnt(SMALL, 'раздач', 'gen') + '.');
  c2.append(note);
  // #8 — винрейт колд-колла по позициям, как в RFI: наведение — руки, клик — закрепить, раздачи и реплеер
  const ccPos = r.CC_COLS.slice(1).filter(k => r.cc[k].n >= SMALL);
  // #8: переключатели вашего стека и свой диапазон (как «Результат 3-бета»)
  const HH = (p) => r.hands[p]; // стек отобран в шапке раздела (idx)
  const items = ccPos.map(p => { const h = HH(p); return { p, key: 'cc' + p, o: { n: h.n, sum: h.sum, es: h.es }, mx: h.mx, ids: h.ids, sit: 2, act: 1, title: 'Ваш колд-колл с ' + p, vlab: ' BB за колд-колл', nlab: ' колд-коллов', sz: r.rx[p] ? ccSz(r.rx[p], h) : null, szTitle: 'Ответ на открытие с ' + p }; });
  const t = HH('TOT'), avg = t.n ? t.sum / 10 / t.n : null, avgE = t.n ? t.es / 10 / t.n : null;
  LAST_NET_ITEMS = items;
  const tb = r.hands.BB, nAll = t.n + tb.n, allF = nAll ? (t.sum + tb.sum) / 10 / nAll : null, allE = nAll ? (t.es + tb.es) / 10 / nAll : null;
  const box8 = el('div'); box8.append(secLabel('cc', t.n, 'колд-коллов без BB'), netChart(items, avg, 'EV колд-колла'));
  const c8 = (card(8, 'Результат колд-колла', wrHtml(avg, avgE, 2) + ' <small>BB за колд-колл</small>', null, box8));
  c8.classList.add('wide');
  const zone = el('div', 'summary'); const pair = el('div', 'sum-pair'); pair.append(c1, c8); zone.append(pair);
  c2.classList.add('cc-table');
  zone.append(c2, ccGroupBlock(r), ccVsTable(r), ccOppBlock(r5), ccSizeBlock(r), bbDefendBlock(r), ccAllinBlock(r)); // #5 — без стека раздела; #9 «Колд-колл × Фолд на контбет» убран по просьбе (функция ccQuadBlock оставлена)
  page.append(zone);
  return page;
}

