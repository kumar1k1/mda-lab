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
let SQ_MXPOS = 'BB'; // #11 — позиция матрицы рук

function sqSpot(idx) {
  const c = DB.cols; if (!c.rz || !c.cl || !c.fp) return [];
  return idx.filter(i => c.rz[i] === 1 && c.cl[i] >= 1 && (!c.lr || c.lr[i] === 0) && !(c.rai && (c.rai[i] === 1 || (c.osz[i] >= 0 && c.ostk[i] >= 0 && c.osz[i] / 100 >= c.ostk[i] / 10 - 0.5))) && c.fp[i] >= 0);
}
const sqAI = (i) => { const c = DB.cols; return c.act[i] === 3 || (c.act[i] === 2 && c.ostk[i] > 0 && c.size[i] >= c.ostk[i] * 10 - 1); };
const sqZ = () => ({ n: 0, x: 0, ai: 0, nai: 0, call: 0, fold: 0, sum: 0, es: 0, sn: 0, ids: [], mx: Array.from({ length: 169 }, () => ({ n: 0, sum: 0, es: 0 })), R: rangeMx() });
// add: i — раздача спота; T — тип из шапки: в числителе и итоге — только сквизы этого типа, в «Диапазоне» — все ответы
function sqAdd(z, i, T) {
  const c = DB.cols, EV = EVcol(), a = c.act[i], sq = a >= 2, ai = sq && sqAI(i), typed = sq && (!T.flt || (T.ty === 'ai' ? ai : !ai));
  z.n++; if (a === 1) z.call++; else if (!sq) z.fold++;
  if (sq) { if (ai) z.ai++; else z.nai++; }
  if (typed) { z.x++; z.sum += c.net[i]; z.es += EV[i]; z.sn++; z.ids.push(i); if (c.hc[i] >= 0) { const m = z.mx[c.hc[i]]; m.n++; m.sum += c.net[i]; m.es += EV[i]; } }
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

  // #3 — по позициям (как таблица SQZ / SQZ NAI / SQZ-Fold в Hand2Note) и что было после сквиза
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
      { key: 'f4', label: 'Фолд на 4-бет', tone: 'ice', own: true, data: D(k => after[k].f4) },
      { key: 'c5', label: '5-бет', tone: 'ice', own: true, data: D(k => after[k].c5) }] });
    w.querySelectorAll('td.c').forEach(td => { const z = G[td.dataset.col]; if (z && z.n) hoverRange(td, 'Ответ на открытие с коллом' + (td.dataset.col === 'TOT' ? '' : ' · ' + td.dataset.col), sqSz(z, T0)); });
    const w2 = heatTable({ cols, groupGapBefore: cols.indexOf('SB'), rows: [
      { key: 'all', label: 'Все сбросили — банк ваш', tone: 'ice', own: true, data: D(k => after[k].all) },
      { key: 'opf', label: 'Открывающий сбросил', tone: 'ice', own: true, data: D(k => after[k].opf) }] });
    const d = el('div', 'insight cc-table'); d.append(numTag(3), el('span', 'k', 'Сквиз по позициям'), el('span', 's', 'колонки — ваша позиция; «Сквиз» — % от спотов «открытие + колл», «Фолд на 4-бет» — % от раз, когда на ваш сквиз пришёл 4-бет, «5-бет» — % от 4-бетов не на весь стек'), w,
      el('span', 's tb-sub', 'После вашего сквиза'), w2,
      infoNote('Как верхняя таблица сквизов в Hand2Note: SQZ — все сквизы, «не олл-ин» и «олл-ин» — как они делятся. Наведите на ячейку строки сквиза — диапазон: как вы ответили каждой рукой (фолд, овер-колл, сквиз, олл-ин); клик закрепит окно, клик по руке откроет раздачи. Бледные ячейки — меньше ' + cnt(SMALL, 'раздач', 'gen') + '.'));
    zone.append(d);
  }

  // #4 — позиция против «открывающий + коллер» (как SQZ TOT / SQZ NAI в Hand2Note)
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
    const d = el('div', 'insight cc-table'); d.append(numTag(4), el('span', 'k', 'Сквиз: ваша позиция против открывающего и коллера'), el('span', 's', 'строки — где вы, колонки — открывающий + первый коллер; в ячейке — доля сквизов' + sqTyLab(T)), body,
      infoNote('Как таблицы SQZ TOT и SQZ NAI в Hand2Note. «MP+CC» — открытие с ранних и средних позиций (EP, MP, HJ) и любой колл; остальные колонки — открывающий и первый коллер (CO+BTN — открыл CO, заколлировал BTN). Тип сквиза — фильтром раздела («Не олл-ин» — как SQZ NAI). Наведите на ячейку — диапазон ответов по рукам. Бледные ячейки — меньше ' + cnt(SMALL, 'раздач', 'gen') + '.'));
    zone.append(d);
  }

  // таблица «строки → частота, результат» для карточек 5–7: одна строка — один срез
  const rowsTable = (list, head, tagKey) => {
    const t = el('table', 'ht v3-rt'), hr = el('tr'); [head, 'Спотов', 'Сквиз', 'не олл-ин', 'олл-ин', 'Фолд на 4-бет', 'Итог сквиза'].forEach(h => hr.append(el('th', null, h))); const th = el('thead'); th.append(hr); t.append(th);
    const tb = el('tbody');
    list.forEach(([lab, z, f4]) => { if (!z || !z.n) return; const tr = el('tr'); const pc = (x, n) => n ? fmtPct(x / n) + '%' : '—';
      const v = z.x ? valPick(z.sum / 10 / z.x, z.es / 10 / z.x) : null;
      tr.append(el('th', null, lab), el('td', 'c', z.n.toLocaleString('ru-RU')), el('td', 'c', pc(z.ai + z.nai, z.n)), el('td', 'c', pc(z.nai, z.n)), el('td', 'c', pc(z.ai, z.n)), el('td', 'c', f4 && f4.n ? pc(f4.x, f4.n) : '—'));
      const tv = el('td', 'c'); if (v == null) tv.textContent = '—'; else { tv.append(el('b', v >= 0 ? 'up' : 'down', signed(v, 2))); tv.title = signed(z.sum / 10 / z.x, 2) + ' BB факт, ' + signed(z.es / 10 / z.x, 2) + ' BB EV · ' + cnt(z.x, 'сквизов'); } tr.append(tv);
      if (z.n < 30) tr.classList.add('low');
      hoverRange(tr, lab, sqSz(z, T)); tb.append(tr); });
    t.append(tb); const box = el('div', 'v3-rt-box'); const sg = valSeg(); sg.classList.add('v3-rt-seg'); box.append(sg, t); return box;
  };
  const f4Of = (ids) => { const z = { x: 0, n: 0 }; ids.forEach(i => { if (c.act[i] >= 2 && c.t4[i] >= 0) { z.n++; if ((c.t4[i] & 3) === 0) z.x++; } }); return z; };
  const group = (ids, key, B) => B.map(([lab], k) => { const sub = ids.filter(i => key(i) === k), z = sqZ(); sub.forEach(i => sqAdd(z, i, T)); return [lab, z, f4Of(sub)]; });

  // #5 — один коллер или два и больше
  zone.append(sqSec(5, 'Против одного и двух+ коллеров', 'чем больше коллеров, тем сильнее нужен диапазон сквиза и тем больше мёртвых денег в банке',
    rowsTable(group(S, i => (c.cl[i] >= 2 ? 1 : 0), [['1 коллер'], ['2+ коллера']]), 'Коллеров', 'sq5'),
    infoNote('«Сквиз» — доля сквизов от спотов строки, «не олл-ин» и «олл-ин» — как они делятся. «Фолд на 4-бет» — как часто вы сбросили, когда на ваш сквиз ответили 4-бетом. «Итог сквиза» — средний результат раздачи после вашего сквиза' + sqTyLab(T) + ' (EV или факт — переключатель над таблицей). Наведите на строку — диапазон ответов по рукам.')));
  // #6 — по вашему стеку (фильтр стека раздела не действует: он и есть строки)
  { const A0 = all; zone.append(sqSec(6, 'Сквиз по вашему стеку', 'как глубина меняет частоту сквиза и долю олл-инов — как таблица «stack» в Hand2Note',
    rowsTable(group(A0, i => SQ_STK.findIndex(q => c.bb[i] / 10 >= q[1] && c.bb[i] / 10 < q[2]), SQ_STK), 'Ваш стек', 'sq6'),
    infoNote('Стек — ваш стек в начале раздачи; фильтр стека раздела здесь не действует (он и есть строки). На коротком стеке сквиз обычно олл-ин, на глубоком — обычным размером.'))); }
  // #7 — против размера открытия
  zone.append(sqSec(7, 'Против размера открытия', 'как часто вы сквизите против маленького и большого открытия',
    rowsTable(group(S, i => SQ_OSZ.findIndex(q => c.osz[i] >= q[1] && c.osz[i] < q[2]), SQ_OSZ), 'Открытие', 'sq7'),
    infoNote('Размер открытия «до», в BB. Против маленького открытия коллеры дешевле и шире — сквиз приносит больше мёртвых денег.')));

  // #8 — размер вашего сквиза: в разах от открытия, ответ соперников и итог
  {
    const sq = S.filter(i => c.act[i] >= 2 && c.osz[i] > 0), B = SQ_X.map(() => ({ n: 0, r: [0, 0, 0, 0], rn: 0, sum: 0, es: 0, ids: [], mx: Array.from({ length: 169 }, () => ({ n: 0, sum: 0, es: 0 })) })), AI = { n: 0, r: [0, 0, 0, 0], rn: 0, sum: 0, es: 0, ids: [], mx: Array.from({ length: 169 }, () => ({ n: 0, sum: 0, es: 0 })) };
    for (const i of sq) { const z = sqAI(i) ? AI : B[SQ_X.findIndex(q => c.size[i] / c.osz[i] >= q[1] && c.size[i] / c.osz[i] < q[2])]; if (!z) continue; z.n++; z.sum += c.net[i]; z.es += EV[i]; z.ids.push(i); if (c.hc[i] >= 0) { const m = z.mx[c.hc[i]]; m.n++; m.sum += c.net[i]; m.es += EV[i]; } const t3 = c.t3r[i]; if (t3 >= 0) { z.rn++; z.r[t3 & 3]++; } }
    const L = SQ_X.map((q, k) => [q[0], B[k]]).concat([['олл-ин', AI]]).filter(([, z]) => z.n), tot8 = L.reduce((a, [, z]) => a + z.n, 0);
    const t = el('table', 'ht v3-rt'), hr = el('tr'); ['Размер', 'Доля', 'Все сбросили', 'Колл', '4-бет', 'Итог'].forEach(h => hr.append(el('th', null, h))); const th = el('thead'); th.append(hr); t.append(th); const tb = el('tbody');
    L.forEach(([lab, z]) => { const tr = el('tr'), pc = (x, n) => n ? fmtPct(x / n) + '%' : '—', v = valPick(z.sum / 10 / z.n, z.es / 10 / z.n);
      const tv = el('td', 'c'); tv.append(el('b', v >= 0 ? 'up' : 'down', signed(v, 2))); tv.title = signed(z.sum / 10 / z.n, 2) + ' BB факт, ' + signed(z.es / 10 / z.n, 2) + ' BB EV';
      tr.append(el('th', null, lab), el('td', 'c', pc(z.n, tot8) + ' · ' + z.n), el('td', 'c', pc(z.r[0], z.rn)), el('td', 'c', pc(z.r[1], z.rn)), el('td', 'c', pc(z.r[2] + z.r[3], z.rn)), tv); if (z.n < 30) tr.classList.add('low');
      hoverHands(tr, { p: lab, anyPos: true, pre: true, key: 'sq8' + lab, title: 'Сквиз ' + lab, o: { n: z.n, sum: z.sum, es: z.es }, mx: z.mx, ids: z.ids, vlab: ' BB за сквиз', nlab: ' сквизов' }, z.sum / 10 / z.n); tb.append(tr); });
    t.append(tb); const box = el('div', 'v3-rt-box'); const sg = valSeg(); sg.classList.add('v3-rt-seg'); box.append(sg, t);
    zone.append(sqSec(8, 'Размер вашего сквиза', 'во сколько раз больше открытия вы сквизите, как отвечают соперники и что это приносит', L.length ? box : el('p', 'muted small', 'Нет сквизов в выборке.'),
      infoNote('Размер — ваш сквиз, делённый на открытие, округлённый до 0,5; олл-ин — отдельной строкой. «Все сбросили / Колл / 4-бет» — первый ответ соперников (открывающего и коллеров). Наведите на строку — руки этих сквизов и итог; клик закрепит окно. Тип сквиза из шапки здесь не применяется — он и есть строки.')));
  }

  // #9 — ответ соперников на сквиз и ваш ход против 4-бета
  {
    const sq = S.filter(i => c.act[i] >= 2 && T.pass(i)), R = [0, 0, 0, 0], RS = [0, 1, 2, 3].map(() => ({ sum: 0, es: 0, n: 0 })), F = [0, 0, 0], FS = [0, 1, 2].map(() => ({ sum: 0, es: 0, n: 0 }));
    for (const i of sq) { const t3 = c.t3r[i]; if (t3 >= 0) { const k = t3 & 3; R[k]++; RS[k].sum += c.net[i]; RS[k].es += EV[i]; RS[k].n++; } const t4 = c.t4[i]; if (t4 >= 0) { const k = Math.min(2, t4 & 3); F[k]++; FS[k].sum += c.net[i]; FS[k].es += EV[i]; FS[k].n++; } }
    const tiles = (cnts, sums, labs, title) => { const box = el('div', 'resp'); box.append(el('span', 'resp-t', title)); const rl = el('div', 'resp-tiles'); const tt = cnts.reduce((a, b) => a + b, 0);
      labs.forEach(([lab, col], k) => { const it = el('span', 'resp-tile'); const b = el('b', null, tt ? fmtPct(cnts[k] / tt) + '%' : '—'); b.style.color = col; it.append(b, el('span', null, lab)); const z = sums[k]; if (z.n) it.append(pmxWr(z.sum / 10 / z.n, z.es / 10 / z.n)); it.title = cnts[k] + ' из ' + tt; rl.append(it); }); box.append(rl); return box; };
    const body = el('div', 'card-fill'); body.append(tiles(R, RS, [['все сбросили', 'var(--good)'], ['колл', 'var(--ice)'], ['4-бет', 'var(--bad)'], ['4-бет олл-ин', 'var(--mx-push)']], 'Ответ соперников на ваш сквиз' + sqTyLab(T)),
      tiles(F, FS, [['фолд', 'var(--good)'], ['колл', 'var(--ice)'], ['5-бет', 'var(--bad)']], 'Ваш ход против 4-бета'));
    zone.append(sqSec(9, 'Что происходит после сквиза', 'как отвечают соперники и как вы играете против 4-бета; под процентом — средний итог раздачи (EV или факт)', body,
      infoNote('Верхний ряд — первый ответ соперников на ваш сквиз: все сбросили (банк ваш), кто-то заколлировал, поставили 4-бет (обычный или олл-ин). Нижний — ваш ход, когда на сквиз пришёл 4-бет. Число под процентом — средний итог таких раздач в BB.')));
  }

  // #10 — результат по группам рук
  {
    const H = {}; SQ_POS.forEach(p => { if (P[p] && P[p].x >= 10) H[p] = { n: P[p].x, sum: P[p].sum, es: P[p].es, ids: P[p].ids, mx: P[p].mx }; });
    zone.append(ccGroupBlock({ hands: H }, { cols: SQ_POS, tag: 10, title: 'Результат сквиза по группам рук', sub: 'BB за сквиз' + sqTyLab(T) + ': по позициям и группам рук', name: 'Сквиз', nameOf: (p) => 'Ваш сквиз с ' + p, verb: 'не сквизили', vlab: ' BB за сквиз', nlab: ' сквизов', none: 'Нет сквизов в выборке.', key: 'sqg', p: false,
      note: 'В ячейке — результат сквиза группой рук с этой позиции в BB (EV или факт — переключатель над таблицей), справа мелко — число сквизов. Наведите — руки группы и их итог; клик закрепит окно, клик по руке откроет раздачи и реплеер. Бледные ячейки — меньше 30 раздач.' }));
  }

  // #11 — какие руки вы сквизите: матрица по позиции
  {
    const b = el('section', 'block'); b.append(numTag(11));
    const hh = el('div', 'block-head'); hh.append(el('h2', null, 'Какие руки вы сквизите'), el('p', null, 'как часто каждой рукой вы сквизите, овер-коллируете и сбрасываете'));
    const seg = el('div', 'seg'); SQ_POS.filter(p => P0[p] && P0[p].n).forEach(p => { const bt = el('button', SQ_MXPOS === p ? 'on' : '', p); bt.type = 'button'; bt.onclick = () => { SQ_MXPOS = p; renderNext(); }; seg.append(bt); });
    const z = P0[SQ_MXPOS] || tot0, mxBody = el('div', 'block-body');
    mxBody.append(handMatrix(z.R.map(m => ({ n: m.n, x: m.x, ai: m.ai, lp: m.lp })), ['сквиз', 'олл-ин', 'овер-колл', 'фолд']));
    const side = el('div', 'mx-side'); side.append(el('span', 'mx-cap', 'Ваша позиция'), seg, el('p', 'muted small', cnt(z.n, 'спотов') + ' · сквиз ' + (z.n ? fmtPct((z.ai + z.nai) / z.n) : '—') + '%'));
    mxBody.append(side);
    b.append(hh, mxBody, infoNote('Цвет клетки — как вы ответили этой рукой на открытие с коллом: сквиз, олл-ин, овер-колл; фолд — тёмным. Из фильтров раздела действует ваш стек.'));
    zone.append(b);
  }
  page.append(zone);
  return page;
}
// карточка-секция: номер, заголовок, подзаголовок, содержимое
function sqSec(n, title, sub, ...body) { const d = el('div', 'insight cc-table'); d.append(numTag(n), el('b', 'pm-title', title), el('span', 'sm-s', sub), ...body); return d; }
