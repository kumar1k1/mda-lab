'use strict';
// ---------- «Сквиз» (0.7.57) ----------
// Спот: перед вашим первым ходом — ровно одно открытие (не олл-ин, до него без лимперов) и хотя бы один колл после него.
// Ваш ход: фолд, овер-колл или рейз — сквиз; «олл-ин» сквиза — пуш или рейз, покрывающий стек открывающего (как у 3-бета).
// Позиции — «как в Hand2Note» (fp: EP, MP, HJ, CO, BTN, SB, BB); открывающий — fop, первый коллер — sqc (миграция 0.7.57).
// Фильтры раздела: «Сквиз» (все / не олл-ин / олл-ин) и «Ваш стек»; на какие карточки действуют — CARD_FILTERS.sqz.
const SQ_FP = ['EP', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const SQ_POS = ['MP', 'HJ', 'CO', 'BTN', 'SB', 'BB']; // EP сквизит редко (нужны открытие и колл перед ним) — только в TOT
const SQ_STK = [['0–15 BB', 0, 15], ['15–25 BB', 15, 25], ['25–40 BB', 25, 40], ['40–60 BB', 40, 60], ['60+ BB', 60, 1e9]];
const SQ_OSZ = [['до 2,1 BB', 0, 215], ['2,1–2,5 BB', 215, 255], ['2,5–3 BB', 255, 305], ['3+ BB', 305, 1e9]];
const SQ_X = [['до ×3', 0, 3.25], ['×3,5', 3.25, 3.75], ['×4', 3.75, 4.25], ['×4,5', 4.25, 4.75], ['×5', 4.75, 5.25], ['×5,5+', 5.25, 1e9]];
let SQ_MXPOS = 'BB'; // #3 — позиция матрицы рук

function sqSpot(idx) {
  const c = DB.cols; if (!c.rz || !c.cl || !c.fp) return [];
  return idx.filter(i => c.rz[i] === 1 && c.cl[i] >= 1 && (!c.lr || c.lr[i] === 0) && !(c.rai && (c.rai[i] === 1 || (c.osz[i] >= 0 && c.ostk[i] >= 0 && c.osz[i] / 100 >= c.ostk[i] / 10 - 0.5))) && c.fp[i] >= 0);
}
const sqAI = (i) => { const c = DB.cols; return c.act[i] === 3 || (c.act[i] === 2 && c.ostk[i] > 0 && c.size[i] >= c.ostk[i] * 10 - 1); };
const sqZ = () => ({ n: 0, x: 0, ai: 0, nai: 0, call: 0, fold: 0, sum: 0, es: 0, sn: 0, ids: [], all: [], tsum: 0, tes: 0, act: [0, 1, 2, 3].map(() => ({ sum: 0, es: 0 })), mx: Array.from({ length: 169 }, () => ({ n: 0, sum: 0, es: 0 })), R: rangeMx() });
// add: i — раздача спота; T — тип из шапки: в числителе и итоге — только сквизы этого типа, в «Диапазоне» — все ответы
function sqAdd(z, i, T) {
  const c = DB.cols, EV = EVcol(), a = c.act[i], sq = a >= 2, ai = sq && sqAI(i), typed = sq && (!T.flt || (T.ty === 'ai' ? ai : !ai));
  z.n++; if (a === 1) z.call++; else if (!sq) z.fold++;
  if (sq) { if (ai) z.ai++; else z.nai++; }
  if (typed) { z.x++; z.sum += c.net[i]; z.es += EV[i]; z.sn++; z.ids.push(i); if (c.hc[i] >= 0) { const m = z.mx[c.hc[i]]; m.n++; m.sum += c.net[i]; m.es += EV[i]; } }
  { const q = z.act[!sq ? (a === 1 ? 1 : 0) : ai ? 3 : 2]; q.sum += c.net[i]; q.es += EV[i]; z.tsum += c.net[i]; z.tes += EV[i]; z.all.push(i); } // итог каждой реакции: фолд / овер-колл / сквиз / олл-ин
  if (c.hc[i] >= 0) rangeAdd(z.R, i, a, ai, EV);
}
const sqSz = (z, T) => ({ n: rangeN(z.R), rmx: z.R, vmx: z.mx, rids: z.ids, labels: ['сквиз', 'олл-ин', 'овер-колл', 'фолд'], capAll: 'только сквизы' + (T.flt ? (T.ty === 'ai' ? ' олл-ином' : ' не олл-ином') : ''), foldPaint: true });
const sqTyLab = (T) => T.flt ? (T.ty === 'ai' ? ' олл-ином' : ' не олл-ином') : '';

function renderSQZ(idx) {
  const c = DB.cols, sr = secRange('sqz'), T = secType('sqz'), T0 = { flt: false };
  const inS = (i) => !sr || (c.bb[i] >= sr[0] * 10 && c.bb[i] < sr[1] * 10);
  const all = sqSpot(idx), S = all.filter(inS), EV = EVcol();
  const posOf = (i) => SQ_FP[c.fp[i]];
  const page = el('div', 'page');
  const head = el('div', 'page-head'); const h1 = el('h1'); h1.append(document.createTextNode('Сквиз '), el('span', null, 'SQZ'));
  head.append(h1, el('p', null, 'Ваш рейз, когда перед вами было открытие и хотя бы один колл: как часто, какими руками и что это приносит.'));
  page.append(head);
  if (!c.sqc) page.append(el('p', 'muted small tb-wait', 'Позиции коллеров ещё досчитываются для части раздач — откройте базу заново после обновления.'));
  const zone = el('div', 'summary');
  const by = (ids, key, Tt) => { const g = {}; for (const i of ids) { const k = key(i); if (k == null) continue; if (!g[k]) g[k] = sqZ(); sqAdd(g[k], i, Tt); } return g; };
  const P = by(S, posOf, T), tot = sqZ(); S.forEach(i => sqAdd(tot, i, T));
  const P0 = by(S, posOf, T0), tot0 = sqZ(); S.forEach(i => sqAdd(tot0, i, T0));

  // #1 — сквизите: частота, по позициям, ваш ответ
  const posRows = SQ_POS.filter(p => P0[p] && P0[p].n >= SMALL).map(p => { const z = P0[p]; return [p, z.n ? (z.ai + z.nai) / z.n : null, p + ': ' + (z.ai + z.nai) + ' из ' + z.n]; });
  const c1 = card(1, 'Сквизите', tot0.n ? '<em>' + fmtPct((tot0.ai + tot0.nai) / tot0.n) + '%</em>' : '<span class="muted">—</span>', 'из ' + cnt(tot0.n, 'спотов', 'gen') + ': открытие и колл перед вами',
    fillBox(posStrip('По позициям', posRows), respTiles([tot0.fold, tot0.call, tot0.ai + tot0.nai], 'Ваш ответ на открытие с коллом', [['фолд', 'var(--good)'], ['овер-колл', 'var(--ice)'], ['сквиз', 'var(--bad)']])));
  c1.append(infoNote('Сквиз — ваш рейз после открытия и хотя бы одного колла (до открытия лимпов нет, открытие не олл-ин). Процент — доля сквизов от всех таких спотов. Из фильтров раздела действует ваш стек; тип сквиза — в карточках результата.'));

  // #2 — результат по позициям: столбики, окно первого типа (позиции, где сквизов меньше 10, не показываем — две раздачи дают «−92 BB»)
  const items = SQ_POS.filter(p => P[p] && P[p].x >= 10).map(p => { const z = P[p]; return { p, key: 'sq2' + p + T.ty + (sr || []).join('-'), anyPos: true, pre: true, o: { n: z.x, sum: z.sum, es: z.es }, mx: z.mx, ids: z.ids, title: 'Ваш сквиз' + sqTyLab(T) + ' с ' + p, vlab: ' BB за сквиз', nlab: ' сквизов', sz: sqSz(z, T), szTitle: 'Ответ на открытие с коллом · ' + p }; });
  const avg = tot.x ? tot.sum / 10 / tot.x : null, avgE = tot.x ? tot.es / 10 / tot.x : null;
  const box2 = el('div'); box2.append(secLabel('sqz', tot.x, 'сквизов'), items.length ? netChart(items, avg, 'EV сквиза') : el('p', 'muted small', 'Нет сквизов в выборке.'));
  const c2 = card(2, 'Результат сквиза', wrHtml(avg, avgE, 2) + ' <small>BB за сквиз</small>', null, box2); c2.classList.add('wide');
  const pair = el('div', 'sum-pair'); pair.append(c1, c2); zone.append(pair);

  // #4 — по позициям (как таблица SQZ / SQZ NAI / SQZ-Fold в Hand2Note) и что было после сквиза
  {
    const cols = ['TOT'].concat(SQ_POS.filter(p => P0[p] && P0[p].n));
    const G = { TOT: tot0 }; cols.slice(1).forEach(p => { G[p] = P0[p]; });
    const after = {}; cols.forEach(k => { after[k] = { f4: { x: 0, n: 0 }, all: { x: 0, n: 0 }, opf: { x: 0, n: 0 }, c5: { x: 0, n: 0 } }; });
    for (const i of S) { if (c.act[i] < 2) continue; for (const k of ['TOT', posOf(i)]) { const a = after[k]; if (!a) continue; const t3 = c.t3r[i]; if (t3 >= 0) { a.all.n++; if ((t3 & 3) === 0) a.all.x++; a.opf.n++; if (t3 & 4) a.opf.x++; } const t4 = c.t4[i]; if (t4 >= 0) { a.f4.n++; if ((t4 & 3) === 0) a.f4.x++; if ((t4 & 4) === 0) { a.c5.n++; if ((t4 & 3) === 2) a.c5.x++; } } } }
    const D = (f) => Object.fromEntries(cols.map(k => [k, f(k)]));
    const w = heatTable({ cols, groupGapBefore: cols.indexOf('SB'), rows: [
      { key: 'sq', label: 'Сквиз', data: D(k => ({ x: G[k].ai + G[k].nai, n: G[k].n })) },
      { key: 'nai', label: 'не олл-ин', sub: true, data: D(k => ({ x: G[k].nai, n: G[k].n })) },
      { key: 'ai', label: 'олл-ин', sub: true, data: D(k => ({ x: G[k].ai, n: G[k].n })) },
      { key: 'f4', label: 'Фолд на 4-бет', tone: 'ice', own: true, data: D(k => after[k].f4) }] });
    w.querySelectorAll('td.c').forEach(td => { const z = G[td.dataset.col]; if (z && z.n) hoverRange(td, 'Ответ на открытие с коллом' + (td.dataset.col === 'TOT' ? '' : ' · ' + td.dataset.col), sqSz(z, T0)); });
    const w2 = heatTable({ cols, groupGapBefore: cols.indexOf('SB'), rows: [
      { key: 'all', label: 'Все сбросили — банк ваш', tone: 'ice', own: true, data: D(k => after[k].all) },
      { key: 'opf', label: 'Открывающий сбросил', tone: 'ice', own: true, data: D(k => after[k].opf) }] });
    const d = el('div', 'insight cc-table'); d.append(numTag(4), el('span', 'k', 'Сквиз по позициям'), el('span', 's', 'колонки — ваша позиция; «Сквиз» — % от спотов «открытие + колл», «Фолд на 4-бет» — % от раз, когда на ваш сквиз пришёл 4-бет'), w,
      el('span', 's tb-sub', 'После вашего сквиза'), w2,
      infoNote('Как верхняя таблица сквизов в Hand2Note: SQZ — все сквизы, «не олл-ин» и «олл-ин» — как они делятся. Наведите на ячейку строки сквиза — диапазон: как вы ответили каждой рукой (фолд, овер-колл, сквиз, олл-ин); клик закрепит окно, клик по руке откроет раздачи. Бледные ячейки — меньше ' + cnt(SMALL, 'раздач', 'gen') + '.'));
    zone.append(d);
  }

  // #5 — позиция против «открывающий + коллер» (как SQZ TOT / SQZ NAI в Hand2Note)
  {
    const grp = (q) => (q >= 0 && q <= 2 ? 'MP' : q >= 0 ? SQ_FP[q] : null); // EP–HJ — «MP» (ранние и средние открытия)
    const colOf = (i) => { const o = grp(c.fop[i]), k = c.sqc ? c.sqc[i] : -1; if (!o) return null; if (o === 'MP') return 'MP+CC'; const cl = k >= 0 ? SQ_FP[k] : null; return cl ? o + '+' + cl : null; };
    const g = {}; for (const i of S) { const p = posOf(i), col = colOf(i); if (!col || !['CO', 'BTN', 'SB', 'BB'].includes(p)) continue; const row = g[p] || (g[p] = {}); if (!row[col]) row[col] = sqZ(); sqAdd(row[col], i, T); }
    const ORDER = ['MP+CC', 'CO+BTN', 'CO+SB', 'CO+BB', 'BTN+SB', 'BTN+BB', 'SB+BB'];
    const rows = ['CO', 'BTN', 'SB', 'BB'].filter(p => g[p]), cols = ORDER.filter(k => rows.some(p => g[p][k] && g[p][k].n >= SMALL));
    const body = el('div');
    if (!rows.length || !cols.length) body.append(el('p', 'muted small', 'Мало данных.'));
    else {
      const tbl = heatTable({ cols, noTot: true, rows: rows.map(p => ({ key: p, label: p + ' vs', data: Object.fromEntries(cols.map(k => [k, g[p][k] ? { x: g[p][k].x, n: g[p][k].n } : null])) })) });
      tbl.querySelectorAll('td.c').forEach(td => { const z = g[td.dataset.row] && g[td.dataset.row][td.dataset.col]; if (z && z.n) hoverRange(td, 'Вы ' + td.dataset.row + ' против ' + td.dataset.col, sqSz(z, T)); });
      body.append(tbl);
    }
    const d = el('div', 'insight cc-table'); d.append(numTag(5), el('span', 'k', 'Сквиз: ваша позиция против открывающего и коллера'), el('span', 's', 'строки — где вы, колонки — открывающий + первый коллер; в ячейке — доля сквизов' + sqTyLab(T)), body,
      infoNote('Как таблицы SQZ TOT и SQZ NAI в Hand2Note. «MP+CC» — открытие с ранних и средних позиций (EP, MP, HJ) и любой колл; остальные колонки — открывающий и первый коллер (CO+BTN — открыл CO, заколлировал BTN). Тип сквиза — фильтром раздела («Не олл-ин» — как SQZ NAI). Наведите на ячейку — диапазон ответов по рукам. Бледные ячейки — меньше ' + cnt(SMALL, 'раздач', 'gen') + '.'));
    zone.append(d);
  }

  // таблица «строки → частота, результат» для карточек 5–7: одна строка — один срез
  // таблица в стиле «Против 3-бета» (v3RespTable): раз и доля, фолд / овер-колл / сквиз / олл-ин — процент и итог каждой реакции, фолд на 4-бет, в среднем
  const rowsTable = (list, head) => {
    const tot = list.reduce((a, [, z]) => a + (z ? z.n : 0), 0); if (!tot) return el('p', 'muted small', 'Нет раздач в выборке.');
    const ev = VAL_MODE === 'ev', val = (q, n) => (n ? (ev ? q.es : q.sum) / 10 / n : null);
    const H = ['Фолд', 'Овер-колл', 'Сквиз', 'Олл-ин'], COL = ['var(--good)', 'var(--ice)', 'var(--bad)', 'var(--amber)'];
    const box = el('div', 'v3-rt-box'), seg = valSeg(); seg.classList.add('v3-rt-seg');
    const t = el('table', 'ht v3-rt'), hr = el('tr'); [head, 'Раз'].concat(H, ['Фолд на 4-бет', 'В среднем']).forEach((h, k) => hr.append(el('th', k >= 2 ? 'num' : null, h))); const th = el('thead'); th.append(hr); t.append(th); const tb = el('tbody');
    list.forEach(([lab, z, f4]) => { if (!z || !z.n) return;
      const tr = el('tr'); if (z.n < 30) tr.classList.add('low');
      const tdN = el('td', 'n'); tdN.append(el('b', null, z.n.toLocaleString('ru-RU')), el('small', null, fmtPct(z.n / tot) + '%')); tr.append(el('th', null, lab), tdN);
      [z.fold, z.call, z.nai, z.ai].forEach((cn, k) => { const td = el('td', 'num'), b = el('b', null, fmtPct(cn / z.n) + '%'); b.style.color = COL[k]; td.append(b); const v = val(z.act[k], cn); if (v != null) { td.append(el('span', 'v ' + (v >= 0 ? 'up' : 'down'), signed(v, 2))); td.title = H[k] + ': ' + cnt(cn, 'раз') + ' · в среднем ' + signed(z.act[k].sum / 10 / cn, 2) + ' BB факт, ' + signed(z.act[k].es / 10 / cn, 2) + ' BB EV'; } tr.append(td); });
      const tdF = el('td', 'num'); if (f4 && f4.n) { const b = el('b', null, fmtPct(f4.x / f4.n) + '%'); b.style.color = 'var(--ice)'; tdF.append(b, el('span', 'v', cnt(f4.n, 'раз'))); } else tdF.append(el('span', 'muted', '—')); tr.append(tdF);
      const a = val({ sum: z.tsum, es: z.tes }, z.n), tdA = el('td', 'num avg'); tdA.append(el('b', a >= 0 ? 'up' : 'down', signed(a, 2))); tdA.title = 'В среднем за раздачу по всем вашим ответам: ' + signed(z.tsum / 10 / z.n, 2) + ' BB факт, ' + signed(z.tes / 10 / z.n, 2) + ' BB EV'; tr.append(tdA);
      // наведение — окно первого типа: как вы ответили каждой рукой; клик — закрепить (вкладки «Диапазон / Факт / EV»)
      const zz = { n: z.n, rmx: z.R, rids: z.all, labels: ['сквиз', 'олл-ин', 'овер-колл', 'фолд'], capAll: 'все ваши ответы', foldPaint: true }, wt = head + ' · ' + lab;
      tr.classList.add('click'); tr.tabIndex = 0;
      tr.addEventListener('mouseenter', (e) => showSzMx(wt, zz, tr, e)); tr.addEventListener('mousemove', (e) => { if (!SZMX_PIN && szMx && !szMx.hidden) placeSzMx(tr, e); else showSzMx(wt, zz, tr, e); }); tr.addEventListener('mouseleave', hideSzMx);
      tr.addEventListener('click', (e) => pinSzMx(wt, zz, tr, e)); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pinSzMx(wt, zz, tr); } });
      tb.append(tr); });
    t.append(tb); box.append(seg, t); return box;
  };
  const f4Of = (ids) => { const z = { x: 0, n: 0 }; ids.forEach(i => { if (c.act[i] >= 2 && c.t4[i] >= 0) { z.n++; if ((c.t4[i] & 3) === 0) z.x++; } }); return z; };
  const group = (ids, key, B) => B.map(([lab], k) => { const sub = ids.filter(i => key(i) === k), z = sqZ(); sub.forEach(i => sqAdd(z, i, T0)); return [lab, z, f4Of(sub)]; }); // тип сквиза — колонки таблицы, фильтр типа не нужен

  // #6 — один коллер или два и больше
  zone.append(sqSec(6, 'Против одного и двух+ коллеров', 'чем больше коллеров, тем сильнее нужен диапазон сквиза и тем больше мёртвых денег в банке',
    rowsTable(group(S, i => (c.cl[i] >= 2 ? 1 : 0), [['1 коллер'], ['2+ коллера']]), 'Коллеров'),
    infoNote('«Сквиз» — доля сквизов от спотов строки, «не олл-ин» и «олл-ин» — как они делятся. «Фолд на 4-бет» — как часто вы сбросили, когда на ваш сквиз ответили 4-бетом. Под каждым процентом — средний итог раздачи после этой реакции, «В среднем» — по всем ответам (EV или факт — переключатель над таблицей). Наведите на строку — как вы ответили каждой рукой; клик закрепит окно.')));
  // #8 — по вашему стеку (фильтр стека раздела не действует: он и есть строки)
  { const A0 = all; zone.append(sqSec(8, 'Сквиз по вашему стеку', 'как глубина меняет частоту сквиза и долю олл-инов',
    rowsTable(group(A0, i => SQ_STK.findIndex(q => c.bb[i] / 10 >= q[1] && c.bb[i] / 10 < q[2]), SQ_STK), 'Ваш стек'),
    infoNote('Стек — ваш стек в начале раздачи; фильтр стека раздела здесь не действует (он и есть строки). На коротком стеке сквиз обычно олл-ин, на глубоком — обычным размером.'))); }
  // #7 — против размера открытия
  zone.append(sqSec(7, 'Против размера открытия', 'как часто вы сквизите против маленького и большого открытия',
    rowsTable(group(S, i => SQ_OSZ.findIndex(q => c.osz[i] >= q[1] && c.osz[i] < q[2]), SQ_OSZ), 'Открытие'),
    infoNote('Размер открытия «до», в BB. Против маленького открытия коллеры дешевле и шире — сквиз приносит больше мёртвых денег.')));

  // #9 — размер вашего сквиза: в разах от открытия, ответ соперников и итог (вид — как таблицы «Против 3-бета»)
  {
    const mk = () => ({ n: 0, r: [0, 0, 0, 0], rs: [0, 1, 2, 3].map(() => ({ sum: 0, es: 0 })), rn: 0, sum: 0, es: 0, ids: [], mx: Array.from({ length: 169 }, () => ({ n: 0, sum: 0, es: 0 })), hx: new Uint16Array(169) });
    const sq = S.filter(i => c.act[i] >= 2 && c.osz[i] > 0), B = SQ_X.map(mk), AI = mk();
    for (const i of sq) { const z = sqAI(i) ? AI : B[SQ_X.findIndex(q => c.size[i] / c.osz[i] >= q[1] && c.size[i] / c.osz[i] < q[2])]; if (!z) continue; z.n++; z.sum += c.net[i]; z.es += EV[i]; z.ids.push(i); if (c.hc[i] >= 0) { const m = z.mx[c.hc[i]]; m.n++; m.sum += c.net[i]; m.es += EV[i]; z.hx[c.hc[i]]++; } const t3 = c.t3r[i]; if (t3 >= 0) { const k = t3 & 3; z.rn++; z.r[k]++; z.rs[k].sum += c.net[i]; z.rs[k].es += EV[i]; } }
    const L = SQ_X.map((q, k) => [q[0], B[k]]).concat([['олл-ин', AI]]).filter(([, z]) => z.n), tot8 = L.reduce((a, [, z]) => a + z.n, 0);
    const ev = VAL_MODE === 'ev', val = (q, n) => (n ? (ev ? q.es : q.sum) / 10 / n : null);
    const H = ['Все сбросили', 'Колл', '4-бет'], COL = ['var(--good)', 'var(--ice)', 'var(--bad)'];
    const t = el('table', 'ht v3-rt'), hr = el('tr'); ['Размер', 'Сквизов'].concat(H, ['В среднем']).forEach((h, k) => hr.append(el('th', k >= 2 ? 'num' : null, h))); const th = el('thead'); th.append(hr); t.append(th); const tb = el('tbody');
    L.forEach(([lab, z]) => { const tr = el('tr'); if (z.n < 30) tr.classList.add('low');
      const tdN = el('td', 'n'); tdN.append(el('b', null, z.n.toLocaleString('ru-RU')), el('small', null, fmtPct(z.n / tot8) + '%')); tr.append(el('th', null, lab), tdN);
      [[z.r[0], z.rs[0]], [z.r[1], z.rs[1]], [z.r[2] + z.r[3], { sum: z.rs[2].sum + z.rs[3].sum, es: z.rs[2].es + z.rs[3].es }]].forEach(([cn, q], k) => { const td = el('td', 'num'); if (!z.rn) { td.append(el('span', 'muted', '—')); tr.append(td); return; } const b = el('b', null, fmtPct(cn / z.rn) + '%'); b.style.color = COL[k]; td.append(b); const v = val(q, cn); if (v != null) { td.append(el('span', 'v ' + (v >= 0 ? 'up' : 'down'), signed(v, 2))); td.title = H[k] + ': ' + cnt(cn, 'раз') + ' · в среднем ' + signed(q.sum / 10 / cn, 2) + ' BB факт, ' + signed(q.es / 10 / cn, 2) + ' BB EV'; } tr.append(td); });
      const a = val(z, z.n), tdA = el('td', 'num avg'); tdA.append(el('b', a >= 0 ? 'up' : 'down', signed(a, 2))); tdA.title = 'В среднем за сквиз: ' + signed(z.sum / 10 / z.n, 2) + ' BB факт, ' + signed(z.es / 10 / z.n, 2) + ' BB EV'; tr.append(tdA);
      // окно первого типа: «Диапазон» — все ваши ответы в споте, выделены сквизы этим размером; «Факт / EV» и список — только эти сквизы
      const zz = { n: rangeN(tot0.R), rmx: tot0.R.map((m, q) => ({ n: m.n, x: z.hx[q], ai: lab === 'олл-ин' ? z.hx[q] : 0, lp: m.lp, sum: m.sum, es: m.es })), vmx: z.mx, rids: z.ids, labels: ['сквиз ' + lab, lab === 'олл-ин' ? 'олл-ин' : '', 'овер-колл', 'фолд или другой размер'], capAll: 'только сквизы ' + lab, foldPaint: true };
      hoverRange(tr, 'Сквиз ' + lab, zz); tr.classList.remove('has-mx'); tb.append(tr); });
    t.append(tb); const box = el('div', 'v3-rt-box'); const sg = valSeg(); sg.classList.add('v3-rt-seg'); box.append(sg, t);
    zone.append(sqSec(9, 'Размер вашего сквиза', 'во сколько раз больше открытия вы сквизите, как отвечают соперники и что это приносит', L.length ? box : el('p', 'muted small', 'Нет сквизов в выборке.'),
      infoNote('Размер — ваш сквиз, делённый на открытие, округлённый до 0,5; олл-ин — отдельной строкой. «Все сбросили / Колл / 4-бет» — первый ответ соперников (открывающего и коллеров), под процентом — средний итог таких раздач. Наведите на строку — диапазон: все ваши ответы в споте, сквизы этим размером выделены; клик закрепит окно с вкладками «Диапазон / Факт / EV». Тип сквиза из шапки здесь не применяется — он и есть строки.')));
  }
  // #10 — ответ соперников на сквиз и ваш ход против 4-бета
  {
    const sq = S.filter(i => c.act[i] >= 2 && T.pass(i)), R = [0, 0, 0, 0], RS = [0, 1, 2, 3].map(() => ({ sum: 0, es: 0, n: 0 })), F = [0, 0, 0], FS = [0, 1, 2].map(() => ({ sum: 0, es: 0, n: 0 }));
    for (const i of sq) { const t3 = c.t3r[i]; if (t3 >= 0) { const k = t3 & 3; R[k]++; RS[k].sum += c.net[i]; RS[k].es += EV[i]; RS[k].n++; } const t4 = c.t4[i]; if (t4 >= 0) { const k = Math.min(2, t4 & 3); F[k]++; FS[k].sum += c.net[i]; FS[k].es += EV[i]; FS[k].n++; } }
    const tiles = (cnts, sums, labs, title) => { const box = el('div', 'resp'); box.append(el('span', 'resp-t', title)); const rl = el('div', 'resp-tiles'); const tt = cnts.reduce((a, b) => a + b, 0);
      labs.forEach(([lab, col], k) => { const it = el('span', 'resp-tile'); const b = el('b', null, tt ? fmtPct(cnts[k] / tt) + '%' : '—'); b.style.color = col; it.append(b, el('span', null, lab)); const z = sums[k]; if (z.n) it.append(pmxWr(z.sum / 10 / z.n, z.es / 10 / z.n)); it.title = cnts[k] + ' из ' + tt; rl.append(it); }); box.append(rl); return box; };
    const body = el('div', 'card-fill'); body.append(tiles(R, RS, [['все сбросили', 'var(--good)'], ['колл', 'var(--ice)'], ['4-бет', 'var(--bad)'], ['4-бет олл-ин', 'var(--mx-push)']], 'Ответ соперников на ваш сквиз' + sqTyLab(T)));
    // подробно (колонка sqr): кто заколлировал — открывающий, другой игрок, несколько; 4-бет от открывающего или от коллера, обычный или олл-ином;
    // в строках 4-бета — ваш ход против него (фолд / колл / 5-бет) и итог каждого
    if (c.sqr) {
      const RW = [['Все сбросили — банк ваш', v => (v & 3) === 0], ['Колл: только открывающий', v => (v & 3) === 1 && (v >> 4 & 3) === 1 && (v & 4)], ['Колл: только другой игрок (не открывающий)', v => (v & 3) === 1 && (v >> 4 & 3) === 1 && !(v & 4)],
        ['Колл: двое и больше', v => (v & 3) === 1 && (v >> 4 & 3) >= 2], ['└ среди них открывающий', v => (v & 3) === 1 && (v >> 4 & 3) >= 2 && (v & 4)],
        ['4-бет от открывающего, не олл-ин', v => (v & 3) === 2 && (v & 64)], ['4-бет от открывающего, олл-ин', v => (v & 3) === 3 && (v & 64)],
        ['4-бет от другого игрока, не олл-ин', v => (v & 3) === 2 && !(v & 64)], ['4-бет от другого игрока, олл-ин', v => (v & 3) === 3 && !(v & 64)]];
      const known = sq.filter(i => c.sqr[i] >= 0), ev = VAL_MODE === 'ev', val = (q, n) => (n ? (ev ? q.es : q.sum) / 10 / n : null);
      const t = el('table', 'ht v3-rt'), hr = el('tr'); ['Ответ соперников', 'Раз', 'Ваш фолд', 'Колл', '5-бет', 'В среднем'].forEach((h, k) => hr.append(el('th', k >= 2 ? 'num' : null, h))); const th = el('thead'); th.append(hr); t.append(th); const tb = el('tbody');
      RW.forEach(([lab, f]) => {
        const ids = known.filter(i => f(c.sqr[i])); if (!ids.length) return;
        const z = { n: ids.length, sum: 0, es: 0, a: [0, 1, 2].map(() => ({ n: 0, sum: 0, es: 0 })), mx: Array.from({ length: 169 }, () => ({ n: 0, sum: 0, es: 0 })) };
        ids.forEach(i => { z.sum += c.net[i]; z.es += EV[i]; if (c.hc[i] >= 0) { const m = z.mx[c.hc[i]]; m.n++; m.sum += c.net[i]; m.es += EV[i]; } const t4 = c.t4[i]; if (t4 >= 0) { const q = z.a[Math.min(2, t4 & 3)]; q.n++; q.sum += c.net[i]; q.es += EV[i]; } });
        const tr = el('tr', lab.startsWith('└') ? 'sub' : ''); if (z.n < 20) tr.classList.add('low');
        const tdN = el('td', 'n'); tdN.append(el('b', null, z.n.toLocaleString('ru-RU')), el('small', null, fmtPct(z.n / known.length) + '%')); tr.append(el('th', null, lab), tdN);
        const n4 = z.a[0].n + z.a[1].n + z.a[2].n, COL = ['var(--good)', 'var(--ice)', 'var(--bad)'];
        z.a.forEach((q, k) => { const td = el('td', 'num'); if (!n4) { td.append(el('span', 'muted', '—')); tr.append(td); return; } const b = el('b', null, fmtPct(q.n / n4) + '%'); b.style.color = COL[k]; td.append(b); const v = val(q, q.n); if (v != null) td.append(el('span', 'v ' + (v >= 0 ? 'up' : 'down'), signed(v, 2))); td.title = cnt(q.n, 'раз'); tr.append(td); });
        const a2 = val(z, z.n), tdA = el('td', 'num avg'); tdA.append(el('b', a2 >= 0 ? 'up' : 'down', signed(a2, 2))); tdA.title = signed(z.sum / 10 / z.n, 2) + ' BB факт, ' + signed(z.es / 10 / z.n, 2) + ' BB EV за раздачу'; tr.append(tdA);
        hoverHands(tr, { p: lab, anyPos: true, pre: true, key: 'sq10' + lab + T.ty, title: 'Сквиз → ' + lab.replace('└ ', ''), o: { n: z.n, sum: z.sum, es: z.es }, mx: z.mx, ids, vlab: ' BB за раздачу', nlab: ' раздач' }, z.sum / 10 / z.n);
        tb.append(tr);
      });
      t.append(tb); const box = el('div', 'v3-rt-box'); const sg = valSeg(); sg.classList.add('v3-rt-seg'); box.append(el('span', 'resp-t', 'Подробно: кто заколлировал и кто 4-бетил'), sg, t); body.append(box);
    } else body.append(el('p', 'muted small', 'Подробная разбивка (кто заколлировал, кто 4-бетил) появится после обновления базы.'));
    zone.append(sqSec(10, 'Что происходит после сквиза', 'как отвечают соперники и что это приносит; в строках 4-бета — ваш ход против него', body,
      infoNote('Сверху — первый ответ соперников на ваш сквиз' + sqTyLab(T) + ', под процентом — средний итог таких раздач. Таблица ниже — подробно: заколлировал только открывающий, только другой игрок или несколько (отдельно — когда среди них открывающий); 4-бет от открывающего или от другого игрока, обычный или олл-ином. Считается ответ до первого рейза поверх сквиза: колл 4-бета в разбивку коллов не входит. В строках 4-бета — ваш ход против него: фолд, колл или 5-бет и средний итог каждого; «В среднем» — итог раздачи по строке (EV или факт — переключатель). Наведите на строку — руки и их итог; клик закрепит окно, клик по руке откроет раздачи и реплеер.')));
  }

  // #11 — результат по группам рук
  {
    const H = {}; SQ_POS.forEach(p => { if (P[p] && P[p].x >= 10) H[p] = { n: P[p].x, sum: P[p].sum, es: P[p].es, ids: P[p].ids, mx: P[p].mx }; });
    zone.append(ccGroupBlock({ hands: H }, { cols: SQ_POS, tag: 11, title: 'Результат сквиза по группам рук', sub: 'BB за сквиз' + sqTyLab(T) + ': по позициям и группам рук', name: 'Сквиз', nameOf: (p) => 'Ваш сквиз с ' + p, verb: 'не сквизили', vlab: ' BB за сквиз', nlab: ' сквизов', none: 'Нет сквизов в выборке.', key: 'sqg', p: false,
      note: 'В ячейке — результат сквиза группой рук с этой позиции в BB (EV или факт — переключатель над таблицей), справа мелко — число сквизов. Наведите — руки группы и их итог; клик закрепит окно, клик по руке откроет раздачи и реплеер. Бледные ячейки — меньше 30 раздач.' }));
  }

  // #3 — какие руки вы сквизите: матрица по позиции
  {
    const b = el('section', 'block'); b.append(numTag(3));
    const hh = el('div', 'block-head'); hh.append(el('h2', null, 'Какие руки вы сквизите'), el('p', null, 'как часто каждой рукой вы сквизите, овер-коллируете и сбрасываете'));
    const seg = el('div', 'seg'); SQ_POS.filter(p => P0[p] && P0[p].n).forEach(p => { const bt = el('button', SQ_MXPOS === p ? 'on' : '', p); bt.type = 'button'; bt.onclick = () => { SQ_MXPOS = p; renderNext(); }; seg.append(bt); });
    const z = P0[SQ_MXPOS] || tot0, mxBody = el('div', 'block-body');
    mxBody.append(handMatrix(z.R.map(m => ({ n: m.n, x: m.x, ai: m.ai, lp: m.lp })), ['сквиз', 'олл-ин', 'овер-колл', 'фолд']));
    const side = el('div', 'mx-side'); side.append(el('span', 'mx-cap', 'Ваша позиция'), seg, el('p', 'muted small', cnt(z.n, 'спотов') + ' · сквиз ' + (z.n ? fmtPct((z.ai + z.nai) / z.n) : '—') + '%'));
    mxBody.append(side);
    b.append(hh, mxBody, infoNote('Цвет клетки — как вы ответили этой рукой на открытие с коллом: сквиз, олл-ин, овер-колл; фолд — тёмным. Из фильтров раздела действует ваш стек.'));
    zone.append(b);
  }
  // порядок: 1–2 рядом, дальше по номеру (#3 — руки, сразу после результата)
  const num = (n) => +((n.querySelector(':scope > .num-tag') || n.querySelector('.num-tag') || {}).textContent || '#99').slice(1);
  [...zone.children].slice(1).sort((x, y) => num(x) - num(y)).forEach(n => zone.append(n));
  page.append(zone);
  return page;
}
// карточка-секция: номер, заголовок, подзаголовок, содержимое
function sqSec(n, title, sub, ...body) { const d = el('div', 'insight cc-table'); d.append(numTag(n), el('b', 'pm-title', title), el('span', 'sm-s', sub), ...body); return d; }
