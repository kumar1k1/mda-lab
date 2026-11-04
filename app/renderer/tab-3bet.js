'use strict';
/* global mda, Stats */
// Вкладка «3-бет» (3B).
// ---------- 3-бет (как в Hand2Note: позиции MP / HJ / CO / BTN / SB / BB, сквиз — отдельно) ----------
let TB_SZPOS = 'TOT', TB_XPOS = 'IP';
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
// #4 — 3-бет по позициям: всего, не олл-ином, олл-ином; ниже — что было после 3-бета
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
  card.append(numTag(4), el('span', 'k', '3-бет по позициям'), el('span', 's', 'колонки — ваша позиция. Строки 3-бета — % от раздач, где перед вами было одно открытие (не олл-ин) без лимперов и коллеров; «Фолд на 4-бет» — % от раз, когда на ваш 3-бет пришёл 4-бет; «5-бет» — % от раз, когда 5-бет был возможен (4-бет не на весь стек)'), w,
    el('span', 's tb-sub', 'После вашего 3-бета — колонки тоже ваша позиция, открыть мог любой игрок перед вами'), w2);
  return card;
}
// окно первого типа для 3-бета: R — весь ответ на открытие по рукам, h — сами 3-беты (итог и список, под тип из шапки)
const tbSz = (R, h, ty) => ({ n: rangeN(R), rmx: R, vmx: h.mx, rids: h.ids, labels: ['3-бет', 'олл-ин', 'колл', 'фолд'], capAll: 'только 3-беты' + (ty === 'ai' ? ' олл-ином' : ty === 'nai' ? ' не олл-ином' : ''), foldPaint: true });
// #5 — позиция против позиции: все 3-беты / без олл-инов / олл-ин
function tbVsBlock(r, ty) {
  const card = el('div', 'insight cc-table');
  const heroPos = TB_POS.filter(p => r.tb[p].n >= SMALL);
  const opCols = ['EP', 'MP', 'HJ', 'CO', 'BTN', 'SB'].filter(op => heroPos.some(p => r.vs[p] && r.vs[p][op] && r.vs[p][op].n >= SMALL));
  const body = el('div');
  card.append(numTag(5), el('span', 'k', '3-бет: позиция против позиции'), el('span', 's', 'строки — ваша позиция, колонки — позиция открывающего; тип 3-бета — фильтром раздела'), body,
    infoNote('В ячейке — доля 3-бетов от раздач, где перед вами было одно открытие (тип 3-бета — фильтром раздела). Пустые ячейки (--) — ситуация невозможна: открывающий ходит раньше вас. Наведите на ячейку — диапазон: как вы ответили каждой рукой на открытие с этой позиции (3-бет, олл-ин, колл, фолд); клик закрепит окно с вкладками «Диапазон / Факт / EV» — итог 3-бетов по рукам, клик по руке откроет раздачи и реплеер. Бледные ячейки — меньше ' + cnt(SMALL, 'раздач', 'gen') + '.'));
  function draw() {
    const rows = heroPos.map(p => { const d = {}; opCols.forEach(op => { const z = r.vs[p] && r.vs[p][op]; if (z) d[op] = z; }); return { key: p, label: p, data: d }; });
    const tbl = heatTable({ cols: opCols, rows, noTot: true });
    // наведение на ячейку — матрица рук этих 3-бетов и итог (как #4), под тип 3-бета из шапки
    const hp = ty === 'nai' ? 'hN' : ty === 'ai' ? 'hI' : 'hA';
    tbl.querySelectorAll('td.c').forEach(td => {
      const p = td.dataset.row, op = td.dataset.col, z = r.vs[p] && r.vs[p][op];
      const h = z && z[hp];
      if (!h || !h.n) return;
      const it = { p, anyPos: true, key: 'tbvs' + p + op + (ty || 'all'), title: 'Ваш 3-бет с ' + p + ' против ' + op, o: { n: h.n, sum: h.sum, es: h.es }, mx: h.mx, ids: h.ids, sit: 2, vlab: ' BB за 3-бет', nlab: ' 3-бетов' };
      const R = r.rxVs && r.rxVs[p] && r.rxVs[p][op];
      if (R) hoverRange(td, it.title, tbSz(R, h, ty)); else hoverHands(td, it, h.sum / 10 / h.n);
    });
    body.replaceChildren(tbl);
  }
  draw();
  return card;
}
// #6 — 3-бет против сайзинга открытия: ответ и результат 3-бетов
function tbSizeBlock(r, ty) {
  const card = el('div', 'insight cc-table');
  card.append(numTag(6), el('b', 'pm-title', 'Против сайзинга открытия'), el('span', 'sm-s', 'как вы отвечаете на открытие разного размера и какой результат дают ваши 3-беты'));
  const posList = ['TOT'].concat(TB_POS.filter(p => r.tb[p].n >= SMALL));
  let curP = posList.includes(TB_SZPOS) ? TB_SZPOS : 'TOT'; // выбранной позиции нет в выборке (фильтр «Наша позиция» или стек) — показываем все; сам выбор не теряется
  const body = el('div');
  card.append(segBtns(posList.map(p => [p, p === 'TOT' ? 'Все' : p]), curP, (k) => { TB_SZPOS = curP = k; draw(); }), body,
    infoNote('Размер — до скольких BB открыл соперник. Доля — какая часть открытий перед вами была такого размера. 3-бет / Олл-ин / Колл / Фолд — ваш ответ. Результат — средний итог раздачи после вашего 3-бета, факт / EV; при выбранном в фильтрах раздела типе 3-бета — только он (по умолчанию — все, вместе с олл-инами). Наведите на строку — матрица ответа рукой; клик закрепит окно. Бледные строки — меньше 30 раздач.'));
  function draw() {
    const rows = r.sz[curP] || [], tot = rows.reduce((a, z) => a + z.n, 0);
    const t = el('div', 'sz5-t tb-sz');
    const hd = el('div', 'sz5-r sz5-h'); ['Размер', 'Доля', '3-бет', 'Олл-ин', 'Колл', 'Фолд', 'Результат 3-бета, BB / EV'].forEach(x => hd.append(el('span', null, x))); t.append(hd);
    rows.forEach((z, k) => {
      if (!z.n) return;
      const row = el('div', 'sz5-r'); if (z.n < 30) row.classList.add('low');
      const pc = (v) => fmtPct(v / z.n) + '%', wr = z.sn ? z.sum / 10 / z.sn : null, we = z.sn ? z.es / 10 / z.sn : null;
      const share = z.n / tot, tk = el('span', 'sz5-tk'); const tr = el('i'); tr.style.width = Math.max(1, share * 100) + '%'; tk.append(tr);
      const v = (txt, col) => { const e = el('span', 'sz5-v', txt); e.style.color = col; return e; };
      row.append(el('b', null, r.CC_SZ[k][0]), el('span', 'sz5-sh', fmtPct(share) + '%'), v(pc(z.rz), 'var(--bad)'), v(pc(z.ai), 'var(--ice)'), v(pc(z.call), 'var(--soft)'), v(pc(z.fold), 'var(--good)'),
        wrNode('sz5-v', wr, we, 2), el('small', null, cnt(z.n, 'раз')), tk);
      if (z.rmx) {
        const title = (curP === 'TOT' ? 'Вы на всех позициях' : 'Вы на ' + curP) + ' · перед вами открытие ' + r.CC_SZ[k][0];
        // «Факт/EV» в окне и списки раздач — только по 3-бетам (тип — из шапки раздела); «Диапазон» — все ответы
        const zz = Object.assign({}, z, { vmx: z.vmx || null, rids: z.ids || z.rids, capAll: 'только ваши 3-беты' + (ty === 'ai' ? ' олл-ином' : ty === 'nai' ? ' не олл-ином' : '') });
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
// #8 «3-бет по вашему стеку» удалена по просьбе (0.7.25)
// #7 — 3-бет против стека открывающего: готовые корзины (короткий / средний / глубокий)
let TB_OSTKPOS = 'TOT';
function tbOstkBlock(r, ty) {
  const card = el('div', 'insight cc-table');
  card.append(numTag('7'), el('b', 'pm-title', 'Против стека открывающего'), el('span', 'sm-s', 'как часто вы 3-бетите против короткого, среднего и глубокого открывающего и что это приносит'));
  const posList = ['TOT'].concat(TB_POS.filter(p => r.tb[p].n >= SMALL));
  const body = el('div');
  card.append(segBtns(posList.map(p => [p, p === 'TOT' ? 'Все' : p]), TB_OSTKPOS, (k) => { TB_OSTKPOS = k; draw(); }), body,
    infoNote('Стек — стек открывающего в начале раздачи, BB: короткий до 20, средний 20–40, глубокий 40+. «Случаев» — сколько раз перед вами было одно открытие (не олл-ином) без лимперов и коллеров. 3-бет и Олл-ин — ваш ответ от этих случаев. Результат — средний итог раздачи после 3-бета, факт / EV; при выбранном в фильтрах раздела типе 3-бета — только он (по умолчанию — все, вместе с олл-инами). Наведите на строку — матрица рук этих 3-бетов и итог; клик закрепит окно, в нём — переключатель «Факт, BB» / «EV, BB», клик по руке откроет раздачи и реплеер. Бледные строки — меньше 30 раздач.'));
  function draw() {
    const rows = r.ostk[TB_OSTKPOS] || [], tot = rows.reduce((a, z) => a + z.n, 0);
    const t = el('div', 'sz5-t tb-sz');
    const hd = el('div', 'sz5-r sz5-h'); ['Стек открывающего', 'Случаев', '3-бет', 'Олл-ин', 'Результат 3-бета, BB / EV'].forEach(x => hd.append(el('span', null, x))); t.append(hd);
    rows.forEach((z, k) => {
      if (!z.n) return;
      const row = el('div', 'sz5-r'); if (z.n < 30) row.classList.add('low');
      const pc = (v) => fmtPct(v / z.n) + '%', wr = z.sn ? z.sum / 10 / z.sn : null, we = z.sn ? z.es / 10 / z.sn : null;
      const v = (txt, col) => { const e = el('span', 'sz5-v', txt); e.style.color = col; return e; };
      const share = tot ? z.n / tot : 0, tk = el('span', 'sz5-tk'); const tr = el('i'); tr.style.width = Math.max(1, share * 100) + '%'; tk.append(tr);
      row.append(el('b', null, r.TB_OSTK[k]), el('span', 'sz5-sh', z.n.toLocaleString('ru-RU')), v(pc(z.x), 'var(--bad)'), v(pc(z.ai), 'var(--ice)'),
        wrNode('sz5-v', wr, we, 2), el('small', null, cnt(z.sn, '3-бетов')), tk);
      // наведение — окно «Диапазон» (как #6): ответы по рукам в этой корзине стека; клик — закрепить, клик по руке — раздачи и реплеер
      if (z.rmx) {
        const gl = TB_OSTKPOS === 'TOT' ? 'все позиции' : 'с ' + TB_OSTKPOS;
        const zz = { n: z.n, rmx: z.rmx, vmx: z.vmx || null, rids: z.ids || z.rids, capAll: 'только ваши 3-беты' + (ty === 'ai' ? ' олл-ином' : ty === 'nai' ? ' не олл-ином' : '') }; // «Факт/EV» и списки — только 3-беты (тип — из шапки раздела)
        const wt = 'Ваш ответ против открывающего ' + r.TB_OSTK[k] + ' · ' + gl;
        row.addEventListener('mouseenter', (e) => showSzMx(wt, zz, row, e));
        row.addEventListener('mousemove', (e) => { if (!SZMX_PIN && szMx && !szMx.hidden) placeSzMx(row, e); });
        row.addEventListener('mouseleave', hideSzMx);
        row.addEventListener('click', (e) => pinSzMx(wt, zz, row, e));
        row.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pinSzMx(wt, zz, row, null); } };
      }
      t.append(row);
    });
    body.replaceChildren(tot ? t : el('p', 'muted small', 'Нет открытий в выборке.'));
  }
  draw();
  return card;
}
// #8 — «Split» как в Hand2Note: частота 3-бета не олл-ином каждого размера (в разах от открытия) и фолд на 4-бет после него
function tbSplitBlock(r) {
  const card = el('div', 'insight cc-table');
  const cols = ['TOT'].concat(r.TB_X.slice(0, 8));
  const rows = [];
  [['IP', 'В позиции (CO, BTN)'], ['SB', 'SB'], ['BB', 'BB (без SB)']].forEach(([g, lab], gi) => {
    const sp = r.split[g], d3 = { TOT: { x: sp.x, n: sp.n } }, d4 = { TOT: { x: sp.ff, n: sp.fn } };
    sp.b.forEach((b, k) => { d3[cols[k + 1]] = { x: b.x, n: sp.x }; d4[cols[k + 1]] = b.fn ? { x: b.ff, n: b.fn } : null; }); // доля размера — от ваших 3-бетов не олл-ином, не от всех раздач
    rows.push({ key: g + '3', label: lab + ': 3-бет не олл-ин', data: d3, split: gi > 0 }, { key: g + '4', label: '↳ фолд на 4-бет', sub: true, tone: 'ice', data: d4 });
  });
  const w = heatTable({ cols, rows });
  w.querySelectorAll('tr').forEach(tr => { const c3 = tr.querySelector('td.c'); if (!c3) return; if ((c3.dataset.row || '').endsWith('3')) tr.querySelectorAll('td.c.low').forEach(td => { td.classList.remove('low'); const n = td.querySelector('.n'); if (n) n.remove(); }); });
  // наведение на ячейки «3-бет не олл-ин» — матрица рук этого размера и итог (как #4)
  const SPGL = { IP: 'в позиции (CO, BTN)', SB: 'с SB', BB: 'с BB' };
  w.querySelectorAll('td.c').forEach(td => {
    const rowKey = td.dataset.row || '', col = td.dataset.col;
    if (!rowKey.endsWith('3')) return;
    const g = rowKey.slice(0, -1), sp = r.split[g]; if (!sp) return;
    const h = col === 'TOT' ? sp.h : (sp.b[cols.indexOf(col) - 1] || {}).h;
    if (!h || !h.n) return;
    const it = { p: g, anyPos: true, key: 'tbsp' + rowKey + col, title: 'Ваш 3-бет не олл-ином ' + SPGL[g] + (col === 'TOT' ? '' : ' · ' + col + ' от открытия'), o: { n: h.n, sum: h.sum, es: h.es }, mx: h.mx, ids: h.ids, sit: 2, vlab: ' BB за 3-бет', nlab: ' 3-бетов' };
    hoverHands(td, it, h.sum / 10 / h.n);
  });
  card.append(numTag(8), el('span', 'k', '3-бет по сайзингу (как «Split» в Hand2Note)'), el('span', 's', 'какими размерами вы 3-бетите не олл-ином (доля каждого размера от ваших 3-бетов, %) и как часто сбрасываете на 4-бет после него'), w,
    infoNote('Размер — ваш 3-бет, делённый на открытие, округлённый до 0,5: ×3 — в три раза больше открытия. TOT — как часто вы 3-бетите не олл-ином от всех раздач с одним открытием перед вами; в колонках — доля ваших 3-бетов не олл-ином этим размером (сумма колонок — 100%). «Фолд на 4-бет» — как часто вы сбросили, когда на 3-бет этого размера пришёл 4-бет; в ячейках с маленькой выборкой — число раздач. Как в Hand2Note: «в позиции» — CO и BTN, BB — без раздач против открытия SB.'));
  return card;
}
// #9 — размер вашего 3-бета (в разах от открытия): в позиции, SB, BB — ответ соперников, сброс на 4-бет и результат
function tbXBlock(r) {
  const card = el('div', 'insight cc-table');
  card.append(numTag('9'), el('b', 'pm-title', 'Размер вашего 3-бета: ответ соперников и результат'), el('span', 'sm-s', 'во сколько раз больше открытия вы 3-бетите в позиции, с SB и с BB; как отвечают соперники, как часто вы сбрасываете на 4-бет открывающего и какой результат'));
  const body = el('div');
  // группы без 3-бетов в выборке (например, «В позиции» при фильтре OOP) не показываем; выбранная пропала — берём первую с данными
  const XG = [['TOT', 'Все'], ['IP', 'В позиции (CO, BTN)'], ['SB', 'SB'], ['BB', 'BB']].filter(([k]) => (r.xg[k] || []).some(z => z.n));
  let curX = XG.some(([k]) => k === TB_XPOS) ? TB_XPOS : (XG.find(([k]) => k !== 'TOT') || XG[0] || ['TOT'])[0]; // сам выбор (TB_XPOS) не теряется
  if (XG.length === 2 && XG[0][0] === 'TOT') { XG.shift(); curX = XG[0][0]; } // одна группа — «Все» совпадает с ней, кнопка «Все» не нужна
  card.append(XG.length > 1 ? segBtns(XG, curX, (k) => { TB_XPOS = curX = k; draw(); }) : el('span'), body,
    infoNote('Размер — ваш 3-бет, делённый на открытие (×3 — в три раза больше). Олл-ин — отдельной строкой. «В позиции» — 3-беты с CO и BTN (как в Hand2Note), BB — без раздач против открытия SB. Фолд / Колл — первый ответ соперников. 4-бет — только 4-бет открывающего, которого вы 3-бетили; холодные 4-беты игрока за спиной не учитываются (ни здесь, ни в «Фолде на 4-бет»). «Фолд на 4-бет» — как часто вы сбросили на 4-бет открывающего (в скобках — сколько раз он был). Результат — средний итог раздачи, факт / EV. Наведите на строку — матрица рук этого размера и итог; клик закрепит окно, в нём — переключатель «Факт, BB» / «EV, BB», клик по руке откроет раздачи и реплеер.'));
  function draw() {
    const rows = r.xg[curX] || [], tot = rows.reduce((a, z) => a + z.n, 0);
    const t = el('div', 'sz5-t tb-sz');
    const hd = el('div', 'sz5-r sz5-h'); ['Размер', 'Доля', 'Фолд', 'Колл', '4-бет', 'Фолд на 4-бет', 'Результат, BB / EV'].forEach(x => hd.append(el('span', null, x))); t.append(hd);
    rows.forEach((z, k) => {
      if (!z.n) return;
      const row = el('div', 'sz5-r click'); if (z.n < 30) row.classList.add('low');
      const pc = (v) => (z.rn ? fmtPct(v / z.rn) + '%' : '—');
      const share = z.n / tot, tk = el('span', 'sz5-tk'); const tr = el('i'); tr.style.width = Math.max(1, share * 100) + '%'; tk.append(tr);
      const v = (txt, col) => { const e = el('span', 'sz5-v', txt); e.style.color = col; return e; };
      const f4 = el('span', 'sz5-v', z.f4n ? fmtPct(z.f4f / z.f4n) + '%' : '—'); f4.style.color = 'var(--amber)'; if (z.f4n) f4.append(el('span', 'evs', ' (' + z.f4n + ')'));
      row.append(el('b', null, r.TB_X[k]), el('span', 'sz5-sh', fmtPct(share) + '%'), v(pc(z.r[0]), 'var(--good)'), v(pc(z.r[1]), 'var(--ice)'), v(pc(z.f4n), 'var(--bad)'), f4,
        wrNode('sz5-v', z.sum / 10 / z.n, z.es / 10 / z.n, 2), el('small', null, cnt(z.n, 'раз')), tk);
      row.tabIndex = 0; row.setAttribute('role', 'button');
      const gl = { TOT: 'все позиции', IP: 'в позиции', SB: 'SB', BB: 'BB' }[curX];
      // наведение — окно «Диапазон» (как #6): ответы по рукам группы, подсвечен этот размер; клик — закрепить (в окне «Факт, BB» / «EV, BB»), клик по руке — раздачи и реплеер
      {
        const R = r.xgR && r.xgR[curX];
        if (R && R.rmx && z.n) {
          const mx = R.rmx.map((m2, q) => ({ n: m2.n, x: z.rmx ? z.rmx[q].x : 0, ai: z.rmx ? z.rmx[q].ai : 0, lp: m2.lp, sum: m2.sum, es: m2.es }));
          const zz = { n: R.rmx.reduce((a2, m2) => a2 + m2.n, 0), rmx: mx, vmx: z.rmx || null, rids: z.ids || R.rids, capAll: 'только ваши 3-беты этого размера' }; // «Факт/EV» и списки — только 3-беты этого размера
          const wt = 'Ваш ответ на открытие · ' + gl + (z.n ? ' · 3-бет ' + r.TB_X[k] : '');
          row.addEventListener('mouseenter', (e) => showSzMx(wt, zz, row, e));
          row.addEventListener('mousemove', (e) => { if (!SZMX_PIN && szMx && !szMx.hidden) placeSzMx(row, e); });
          row.addEventListener('mouseleave', hideSzMx);
          row.addEventListener('click', (e) => pinSzMx(wt, zz, row, e));
          row.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pinSzMx(wt, zz, row, null); } };
        }
      }
      t.append(row);
    });
    body.replaceChildren(tot ? t : el('p', 'muted small', 'Нет 3-бетов в выборке.'));
  }
  draw();
  return card;
}
// #7 «Ответ на 4-бет после вашего 3-бета» удалена по просьбе (0.7.27): фолд/колл/5-бет — строками в #4 и колонкой «Фолд на 4-бет» в #9
function tbIsoBlock(r) {
  const card = el('div', 'insight cc-table');
  const cols = r.TB_COLS.filter(k => k === 'TOT' || r.iso[k].n > 0);
  const w = heatTable({ cols, groupGapBefore: cols.indexOf('SB'), rows: [{ key: 'iso', label: '3-бет vs изолейт', data: r.iso }, { key: 'isoF', label: 'Фолд на 4-бет', tone: 'ice', data: r.isoF }] });
  // наведение на ячейку «3-бет vs изолейт» — матрица рук и итог (как #4)
  w.querySelectorAll('td.c').forEach(td => {
    if ((td.dataset.row || '') !== 'iso') return;
    const z = r.iso[td.dataset.col], h = z && z.h;
    if (!h || !h.n) return;
    const it = { p: td.dataset.col, anyPos: true, key: 'tbiso' + td.dataset.col, title: 'Ваш 3-бет против изолейта' + (td.dataset.col === 'TOT' ? '' : ' с ' + td.dataset.col), o: { n: h.n, sum: h.sum, es: h.es }, mx: h.mx, ids: h.ids, sit: 2, vlab: ' BB за 3-бет', nlab: ' 3-бетов' };
    hoverHands(td, it, h.sum / 10 / h.n);
  });
  card.append(numTag(11), el('span', 'k', '3-бет против изолейта'), el('span', 's', 'лимпер, затем рейз — и вы рейзите поверх'), w,
    infoNote('Ситуация: до вас кто-то сыграл лимп, другой игрок изолировал его рейзом, после рейза коллеров не было, и вы ответили рейзом. Hand2Note показывает это отдельно как «3B vs ISO». «Фолд на 4-бет» — вы сбросили на 4-бет после такого 3-бета. Наведите на ячейку — матрица рук и итог. Таких раздач обычно мало: в ячейках с маленькой выборкой указано число раздач.'));
  return card;
}
function renderTB(idx) {
  // Фильтры раздела — по карточкам: 5, 7 и 7.1 — стек и тип 3-бета; 6 — свои диапазоны, без них; остальные — стек (тип у 2 и 4 — ниже, по sub2/rG)
  const sr = secRange('3bet'), cb0 = DB.cols;
  // «Наша позиция» (IP / OOP) — где вы после флопа как 3-бетящий: с SB и BB ходите первым (OOP), с других мест — после открывающего (IP); все карточки, кроме #3
  const fP = secF('3bet').P, blind = (i) => (cb0.fp && cb0.fp[i] >= 0 ? cb0.fp[i] >= 5 : cb0.pos[i] >= 5);
  const idx0 = idx; if (fP && fP !== 'all') idx = idx.filter(i => (fP === 'ip') === !blind(i));
  const idxS = sr ? idx.filter(i => cb0.bb[i] >= sr[0] * 10 && cb0.bb[i] < sr[1] * 10) : idx;
  const tbOpt = { oPos: uiState.tbOPos, oStk: uiState.tbOStkR, oMy: uiState.tbOMyR, oOpen: uiState.tbOOpen };
  const r = Stats.tb(DB, idxS, tbOpt);
  const r6 = sr || idx0 !== idx ? Stats.tb(DB, idx0, tbOpt) : r; // #3 — без фильтров раздела (у неё свои диапазоны стеков)
  // Тип 3-бета из шапки раздела: у #5 меняет числитель (матрицы/итоги у неё уже по типам — hN/hI/hA),
  // у #6 и #7 — целиком частоту, результат, число 3-бетов и окна «Факт/EV»/списки (sI/iI/vmxI — олл-ин, sN/iN/vmxN — не олл-ин);
  // возможности и ответы (колл, фолд, окно «Диапазон») остаются по всем раздачам; стек уже в r
  const T57 = secType('3bet');
  const r57 = T57.flt ? Object.assign({}, r) : r; // клон: правка типа не задевает остальные карточки
  if (T57.flt) {
    const pick = T57.ty === 'ai' ? 'ai' : 'nai';
    r57.vs = Object.fromEntries(Object.entries(r.vs).map(([p, row]) => [p, Object.fromEntries(Object.entries(row).map(([op, z]) => [op, Object.assign({}, z, { x: z[pick] })]))]));
    // колонка «Олл-ин» — только при типе «Олл-ин»; у #6 колонки 3-бет и олл-ин не пересекаются (при «Олл-ин» 3-бет не олл-ином — 0, раньше дублировал олл-ин)
    // sub — вычитать ли олл-ины из числителя: у #7 x считает оба типа (вычитаем), у #6 rz — уже только не олл-ины (лишний вычет занижал долю вплоть до 0)
    const typed = (z, num, sub) => !z ? z : Object.assign({}, z, { [num]: sub ? (pick === 'ai' ? z.ai : z[num] - z.ai) : (pick === 'ai' ? 0 : z[num]), ai: pick === 'ai' ? z.ai : 0, sum: pick === 'ai' ? z.sI : z.sN, es: pick === 'ai' ? z.eI : z.eN, sn: pick === 'ai' ? z.nI : z.nN, ids: (pick === 'ai' ? z.iI : z.iN) || [], vmx: pick === 'ai' ? z.vmxI : z.vmxN });
    r57.sz = Object.fromEntries(Object.entries(r.sz).map(([p, arr]) => [p, arr.map(z => typed(z, 'rz', false))]));
    r57.ostk = Object.fromEntries(Object.entries(r.ostk).map(([p, arr]) => [p, arr.map(z => typed(z, 'x', true))]));
  }
  const page = el('div', 'page');
  const head = el('div', 'page-head');
  const h1 = el('h1'); h1.append(document.createTextNode('3-бет '), el('span', null, '3B'));
  head.append(h1, el('p', null, 'Как часто вы отвечаете рейзом на одно открытие перед вами и что это приносит.'));
  page.append(head);
  if (r.fineAll && r.fineOk < r.fineAll * 0.9) page.append(el('p', 'muted small tb-wait', 'Позиции HJ и ответы на 3-бет ещё досчитываются для части раздач — откройте базу заново после обновления.'));
  const posRows = TB_POS.filter(p => r.tb[p].n >= SMALL).map(p => { const z = r.tb[p]; return [p, z.n ? z.x / z.n : null, p + ': ' + z.x + ' из ' + z.n]; });
  const c1 = card(1, '3-бетите', '<em>' + pctTxt(r.tb.TOT) + '</em>', 'из ' + cnt(r.tb.TOT.n, 'открытий', 'gen') + ' перед вами',
    fillBox(posStrip('По позициям', posRows), respTiles(r.resp, 'Ваш ответ на открытие', [['фолд', 'var(--good)'], ['колл', 'var(--ice)'], ['3-бет', 'var(--bad)']])));
  // #2 — результат по позициям; переключатель вашего стека (BB в начале раздачи) и свой диапазон
  // стек — из шапки раздела (уже отобран в idxS); тип 3-бета — тоже из шапки, для карточек результата (#2, #10)
  const T2 = secType('3bet'), ty2 = T2.ty, flt = T2.flt, rng = null;
  const cc = DB.cols, EVc = EVcol(), inR = T2.pass;
  const sub2 = (z) => { if (!flt) return z; const o = { n: 0, sum: 0, es: 0, ids: [], mx: Array.from({ length: 169 }, () => ({ n: 0, sum: 0, es: 0 })) }; z.ids.forEach(i => { if (!inR(i)) return; const m = o.mx[cc.hc[i]]; o.n++; o.sum += cc.net[i]; o.es += EVc[i]; o.ids.push(i); m.n++; m.sum += cc.net[i]; m.es += EVc[i]; }); return o; };
  const resp = (p, z) => { if (!flt) { const a = r.t3r[p]; return [a[0], a[1], a[2] + a[3]]; } const a = [0, 0, 0]; z.ids.forEach(i => { const v = cc.t3r ? cc.t3r[i] : -1; if (v >= 0) a[Math.min(2, v & 3)]++; }); return a; };
  const H2 = {}; ['TOT'].concat(TB_POS).forEach(p => { H2[p] = sub2(r.hands[p]); });
  const pos = TB_POS.filter(p => H2[p].n >= (flt ? 1 : SMALL));
  const items = pos.map(p => { const z = H2[p], it = tbItem(r, p); Object.assign(it, { o: { n: z.n, sum: z.sum, es: z.es }, mx: z.mx, ids: z.ids, key: 'tb ' + p + (rng ? ' ' + rng.join('-') : '') + ty2 }); it.r = resp(p, z); if (r.rx && r.rx[p]) { it.sz = tbSz(r.rx[p], z, flt ? ty2 : null); it.szTitle = 'Ответ на открытие с ' + p; } return it; });
  LAST_NET_ITEMS = items;
  const t = H2.TOT, avg = t.n ? t.sum / 10 / t.n : null, avgE = t.n ? t.es / 10 / t.n : null;
  const chartBox = el('div'); chartBox.append(secLabel('3bet', t.n, '3-бетов'), netChart(items, avg, 'EV 3-бета'));
  const c2 = (card(2, 'Результат 3-бета', wrHtml(avg, avgE, 2) + ' <small>BB за 3-бет</small>', null, chartBox));
  c2.classList.add('wide');
  const zone = el('div', 'summary'); const pair = el('div', 'sum-pair'); pair.append(c1, c2); zone.append(pair);
  const rG = flt ? Object.assign({}, r, { hands: H2 }) : r; // #10 — тоже по типу 3-бета из шапки
  zone.append(tbOppBlock(r6), tbTable(r), tbVsBlock(r57, T57.ty), tbSizeBlock(r57, T57.ty), tbOstkBlock(r57, T57.ty), tbSplitBlock(r), tbXBlock(r),
    ccGroupBlock(rG, { cols: TB_POS, tag: 10, title: 'Результат 3-бета по группам рук', sub: 'BB за 3-бет: всего и по группам рук, факт / EV', name: '3-бет', nameOf: (p) => 'Ваш 3-бет с ' + p, verb: 'не 3-бетили', act: undefined, vlab: ' BB за 3-бет', nlab: ' 3-бетов', none: 'Нет 3-бетов в выборке.', key: 'tbg', p: false,
      note: 'В ячейке — результат 3-бета группой рук с этой позиции в BB (' + (flt ? (ty2 === 'ai' ? 'только 3-беты олл-ином' : 'только 3-беты не олл-ином') + ' — фильтр раздела' : 'вместе с олл-инами') + '): EV или факт — переключатель над таблицей (оба числа — при наведении), справа мелко — число 3-бетов. Цвет — плюс или минус. Наведите — матрица рук группы и их итог; клик закрепит окно, клик по руке откроет раздачи и реплеер. Бледные ячейки — меньше 30 раздач.' }),
    tbIsoBlock(r)); // порядок 03.11.2026: 3 стек открывающего, 4–5 позиции, 6 сайзинг открытия, 7 стек открывающего (корзины), 8–9 ваш размер, 10 группы рук, 11 против изолейта
  page.append(zone);
  return page;
}


// #3 — ваш ответ против стека открывающего
function tbOppBlock(r) {
  const b = el('section', 'block cc-table'); b.append(numTag(3));
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
    el('span', 'muted small', 'Открывающий: ' + (sel.length ? sel.join(' + ') : 'любая позиция') + ', ' + rangeTxt(uiState.tbOStkR) + ' · вы: ' + rangeTxt(uiState.tbOMyR) + ' · ' + cnt(n, 'раз') + ' перед вами было открытие'));
  side.append(infoNote('Задайте стек открывающего и свой стек в BB: «от» и «до» можно заполнить оба или одно (пустое «до» — без верхней границы). Нажмите «Показать» — матрица покажет ваши ответы ровно в таких раздачах. «Сброс» возвращает «любой». Клетка закрашена слева направо на долю ответов этой рукой: янтарная часть — 3-бет, синяя — олл-ин, зелёная — колл, тёмная — фолд. Бледная заливка — меньше 5 раздач.'));
  body.append(side);
  b.append(h, body);
  return b;
}

