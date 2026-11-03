'use strict';
// ---------- «4-бет» (0.7.60) ----------
// Два спота:
//  A — «4-бет против 3-бета»: вы открылись первым (не олл-ин), пришёл 3-бет (без колла открытия — не сквиз), ваш ход: v3 (0 фолд, 1 колл, 2 4-бет, 3 4-бет олл-ин);
//  B — «холодный 4-бет»: перед вами открытие и 3-бет (rz = 2, без лимпов), ваш ход: act (0 фолд, 1 колл 3-бета, 2 рейз, 3 олл-ин).
// «Олл-ин» 4-бета — эффективно: пуш или ставка на весь ваш стек / стек 3-бетящего.
// Фильтры раздела: «4-бет» (все / не олл-ин / олл-ин), «Наша позиция» (IP / OOP), «Ваш стек»; по карточкам — CARD_FILTERS['4bet'].
const F4_FP = ['EP', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const F4_POS = ['EP', 'MP', 'HJ', 'CO', 'BTN', 'SB'];
const F4_STK = [['< 15 BB', 0, 15], ['15–25 BB', 15, 25], ['25–40 BB', 25, 40], ['40–100 BB', 40, 100], ['100+ BB', 100, 1e9]];
const F4_3X = [['до ×3', 0, 3.25], ['×3,5', 3.25, 3.75], ['×4', 3.75, 4.25], ['×4,5+', 4.25, 1e9]]; // 3-бет в разах от вашего открытия
const F4_4X = [['до ×2,1', 0, 2.15], ['×2,2–2,4', 2.15, 2.45], ['×2,5–2,9', 2.45, 2.95], ['×3+', 2.95, 1e9]]; // ваш 4-бет в разах от 3-бета
const F4_VALUE = new Set(); // QQ+ и AK — «вэлью», остальное — «блеф» (как 4B NAI [bluff] в Hand2Note)
(() => { const R = 'AKQJT98765432'; const ix = (a, b, s) => { const i = R.indexOf(a), j = R.indexOf(b); return a === b ? i * 13 + i : s ? Math.min(i, j) * 13 + Math.max(i, j) : Math.max(i, j) * 13 + Math.min(i, j); }; ['AA', 'KK', 'QQ'].forEach(h => F4_VALUE.add(ix(h[0], h[1]))); F4_VALUE.add(ix('A', 'K', true)); F4_VALUE.add(ix('A', 'K', false)); })();
let F4_MXPOS = 'BTN';
const F4_GROUPS = [['QQ+', (k) => { const i = Math.floor(k / 13), j = k % 13; return i === j && i <= 2; }], ['JJ–TT', (k) => { const i = Math.floor(k / 13), j = k % 13; return i === j && (i === 3 || i === 4); }], ['99–22', (k) => { const i = Math.floor(k / 13), j = k % 13; return i === j && i >= 5; }],
  ['AK', (k) => { const i = Math.floor(k / 13), j = k % 13; return i !== j && Math.min(i, j) === 0 && Math.max(i, j) === 1; }], ['AQ–AJ', (k) => { const i = Math.floor(k / 13), j = k % 13; return i !== j && Math.min(i, j) === 0 && (Math.max(i, j) === 2 || Math.max(i, j) === 3); }],
  ['AT–A2', (k) => { const i = Math.floor(k / 13), j = k % 13; return i !== j && Math.min(i, j) === 0 && Math.max(i, j) >= 4; }], ['Остальные', () => true]];
const f4Group = (k) => F4_GROUPS.findIndex(g => g[1](k));

function render4B(idx) {
  const c = DB.cols, f = secF('4bet'), sr = secRange('4bet'), ty = f.T || 'all', EV = EVcol();
  const page = el('div', 'page');
  const head = el('div', 'page-head'); const h1 = el('h1'); h1.append(document.createTextNode('4-бет '), el('span', null, '4B'));
  head.append(h1, el('p', null, 'Ваш рейз поверх 3-бета: после своего открытия и «в холодную», когда перед вами уже были открытие и 3-бет.'));
  page.append(head);
  if (!c.v3 || !c.fp) { page.append(el('p', 'muted', 'В базе нет данных о 3-бетах — откройте базу заново после обновления.')); return page; }
  const posOf = (i) => (c.fp[i] >= 0 ? F4_FP[c.fp[i]] : null);
  const inS = (i) => !sr || (c.bb[i] >= sr[0] * 10 && c.bb[i] < sr[1] * 10);
  // спот A: 4-бет после вашего открытия; RVa — ваш ход, AIa — олл-ин ли ваш 4-бет, IPa — позиция относительно 3-бетящего
  const AIa = (i) => c.v3[i] === 3 || (c.v3[i] === 2 && c.v3y && c.v3y[i] > 0 && ((c.v3s && c.v3s[i] > 0 && c.v3y[i] / 100 >= c.v3s[i] / 10 - 0.05) || c.v3y[i] / 100 >= c.bb[i] / 10 - 0.05));
  const RVa = (i) => (c.v3[i] >= 2 ? (AIa(i) ? 3 : 2) : c.v3[i]);
  const inPa = (i) => f.P === 'all' || c.v3p[i] === (f.P === 'ip' ? 1 : 0);
  const A0 = idx.filter(i => c.sit[i] === 0 && c.act[i] === 2 && c.v3[i] >= 0 && c.v3o[i] === 0 && c.v3a[i] !== 1 && !(c.c3 && c.c3[i] >= 0) && posOf(i)).filter(inPa); // против 3-бета олл-ином 4-бета не бывает — такие раздачи не возможности
  const A = A0.filter(inS);
  // спот B: холодный 4-бет
  const blind = (i) => c.fp[i] >= 5;
  const inPb = (i) => f.P === 'all' || (f.P === 'ip') === !blind(i);
  const AIb = (i) => c.act[i] === 3 || (c.act[i] === 2 && c.size[i] >= c.bb[i] * 10 - 1);
  const B = idx.filter(i => c.rz[i] === 2 && (!c.lr || c.lr[i] === 0) && posOf(i) && inPb(i) && inS(i));
  const typed = (ai) => ty === 'all' || (ty === 'ai' ? ai : !ai);
  const tyLab = ty === 'ai' ? ' олл-ином' : ty === 'nai' ? ' не олл-ином' : '';
  // ячейка: ответы и итоги; R — «Диапазон» по рукам (4-бет / олл-ин / колл / фолд), mx/ids — только 4-беты выбранного типа
  const Z = () => ({ n: 0, fld: 0, call: 0, r4: 0, ai: 0, x: 0, sum: 0, es: 0, ids: [], all: [], tsum: 0, tes: 0, act: [0, 1, 2, 3].map(() => ({ sum: 0, es: 0 })), mx: Array.from({ length: 169 }, () => ({ n: 0, sum: 0, es: 0 })), R: rangeMx() });
  const add = (z, i, v) => {
    z.n++; if (v === 0) z.fld++; else if (v === 1) z.call++; else if (v === 3) z.ai++; else z.r4++;
    const q = z.act[v]; q.sum += c.net[i]; q.es += EV[i]; z.tsum += c.net[i]; z.tes += EV[i]; z.all.push(i);
    if (v >= 2 && typed(v === 3)) { z.x++; z.sum += c.net[i]; z.es += EV[i]; z.ids.push(i); if (c.hc[i] >= 0) { const m = z.mx[c.hc[i]]; m.n++; m.sum += c.net[i]; m.es += EV[i]; } }
    if (c.hc[i] >= 0) rangeAdd(z.R, i, v === 0 ? 0 : v === 1 ? 1 : 2, v === 3, EV);
  };
  const by = (ids, key, RV) => { const g = {}; for (const i of ids) { const k = key(i); if (k == null) continue; if (!g[k]) g[k] = Z(); add(g[k], i, RV(i)); } return g; };
  const PA = by(A, posOf, RVa), TA = Z(); A.forEach(i => add(TA, i, RVa(i)));
  const PB = by(B, posOf, (i) => (c.act[i] >= 2 ? (AIb(i) ? 3 : 2) : c.act[i])), TB = Z(); B.forEach(i => add(TB, i, c.act[i] >= 2 ? (AIb(i) ? 3 : 2) : c.act[i]));
  const szOf = (z) => ({ n: rangeN(z.R), rmx: z.R, vmx: z.mx, rids: z.ids, labels: ['4-бет', 'олл-ин', 'колл', 'фолд'], capAll: 'только 4-беты' + tyLab, foldPaint: true });
  const zone = el('div', 'summary');

  // #1 — 4-бетите (как «3-бетите»): частота 4-бета против 3-бета, по позициям, ваш ответ
  const posRows = F4_POS.filter(p => PA[p] && PA[p].n >= SMALL).map(p => { const z = PA[p]; return [p, (z.r4 + z.ai) / z.n, p + ': ' + (z.r4 + z.ai) + ' из ' + z.n]; });
  const c1 = card(1, '4-бетите', TA.n ? '<em>' + fmtPct((TA.r4 + TA.ai) / TA.n) + '%</em>' : '<span class="muted">—</span>', 'из ' + cnt(TA.n, 'раз', 'gen') + ', когда на ваше открытие пришёл 3-бет',
    fillBox(posStrip('По позициям', posRows), respTiles([TA.fld, TA.call, TA.r4 + TA.ai], 'Ваш ответ на 3-бет', [['фолд', 'var(--good)'], ['колл', 'var(--ice)'], ['4-бет', 'var(--bad)']])));
  c1.append(infoNote('4-бет — ваш рейз поверх 3-бета после вашего открытия (открытие не олл-ин; сквизы, где открытие заколлировали, и 3-беты олл-ином — против них 4-бета не бывает — не входят). Процент — доля 4-бетов (обычных и олл-ином) от всех раз, когда вас 3-бетили. Холодный 4-бет — в карточке 4.'));
  // #2 — результат 4-бета по позициям
  const items = F4_POS.filter(p => PA[p] && PA[p].x >= 5).map(p => { const z = PA[p]; return { p, key: 'f42' + p + ty + f.P + (sr || []).join('-'), anyPos: true, pre: true, o: { n: z.x, sum: z.sum, es: z.es }, mx: z.mx, ids: z.ids, title: 'Ваш 4-бет' + tyLab + ' с ' + p, vlab: ' BB за 4-бет', nlab: ' 4-бетов', sz: szOf(z), szTitle: 'Ответ на 3-бет · ' + p }; });
  const avg = TA.x ? TA.sum / 10 / TA.x : null, avgE = TA.x ? TA.es / 10 / TA.x : null;
  const box2 = el('div'); box2.append(secLabel('4bet', TA.x, '4-бетов'), items.length ? netChart(items, avg, 'EV 4-бета') : el('p', 'muted small', 'Мало 4-бетов в выборке.'));
  const c2 = card(2, 'Результат 4-бета', wrHtml(avg, avgE, 2) + ' <small>BB за 4-бет</small>', null, box2); c2.classList.add('wide');
  const pair = el('div', 'sum-pair'); pair.append(c1, c2); zone.append(pair);

  // #3 — 4-бет по позициям (как верхняя таблица Hand2Note)
  {
    const cols = ['TOT'].concat(F4_POS.filter(p => PA[p] && PA[p].n));
    const G = { TOT: TA }; cols.slice(1).forEach(p => { G[p] = PA[p]; });
    // «Диапазон 4-бета» (как 4bet [Range] в Hand2Note): какую долю всех 1326 комбинаций составляет ваш 4-бет — по каждой руке частота 4-бета × число её комбинаций
    const comb = (q) => (Math.floor(q / 13) === q % 13 ? 6 : Math.floor(q / 13) < q % 13 ? 4 : 12);
    const rangeW = (R) => R.reduce((a, m, q) => a + (m.n ? comb(q) * m.x / m.n : 0), 0) / 1326;
    const ext = {}; cols.forEach(k => { ext[k] = { bl: { x: 0, n: 0 }, f5: { x: 0, n: 0 } }; });
    for (const i of A) { const v = RVa(i); if (v < 2) continue; for (const k of ['TOT', posOf(i)]) { const e = ext[k]; if (!e) continue; if (v === 2) { e.bl.n++; if (c.hc[i] >= 0 && !F4_VALUE.has(c.hc[i])) e.bl.x++; } if (c.v3f && c.v3f[i] >= 0) { e.f5.n++; if (c.v3f[i] === 0) e.f5.x++; } } }
    const D = (fn) => Object.fromEntries(cols.map(k => [k, fn(k)]));
    const w = heatTable({ cols, groupGapBefore: cols.indexOf('SB'), rows: [
      { key: 'f4', label: '4-бет', data: D(k => ({ x: G[k].r4 + G[k].ai, n: G[k].n })) },
      { key: 'rg', label: 'Диапазон 4-бета', tone: 'ice', own: true, data: D(k => ({ x: rangeW(G[k].R) * G[k].n, n: G[k].n })) },
      { key: 'nai', label: 'не олл-ин', sub: true, data: D(k => ({ x: G[k].r4, n: G[k].n })) },
      { key: 'ai', label: 'олл-ин', sub: true, data: D(k => ({ x: G[k].ai, n: G[k].n })) },
      { key: 'f5', label: 'Фолд на 5-бет', tone: 'ice', own: true, data: D(k => ext[k].f5) }] });
    // окно первого типа по строке: «4-бет» и «Фолд на 5-бет» — весь ответ на 3-бет; «Диапазон 4-бета» — только руки, которыми вы 4-бетили (с частотой);
    // «не олл-ин» и «олл-ин» — только 4-беты этого вида; «Факт / EV» и список раздач — те же 4-беты
    const only = (z, pick, lab, cap) => { const vm = Array.from({ length: 169 }, () => ({ n: 0, sum: 0, es: 0 })), ids = z.all.filter(i => pick(RVa(i))); ids.forEach(i => { if (c.hc[i] < 0) return; const m = vm[c.hc[i]]; m.n++; m.sum += c.net[i]; m.es += EV[i]; });
      const rm = z.R.map(m => { const x = pick(3) && pick(2) ? m.x : pick(3) ? m.ai : m.x - m.ai; return { n: m.n, x, ai: pick(3) ? (pick(2) ? m.ai : x) : 0, lp: 0, sum: m.sum, es: m.es }; });
      return { n: rangeN(z.R), rmx: rm, vmx: vm, rids: ids, labels: [lab, pick(3) && pick(2) ? 'олл-ин' : '', '', 'без 4-бета'], capAll: cap, foldPaint: true }; };
    w.querySelectorAll('td.c').forEach(td => { const z = G[td.dataset.col]; if (!z || !z.n) return; const pl = td.dataset.col === 'TOT' ? '' : ' · ' + td.dataset.col, row = td.dataset.row;
      const zz = row === 'rg' ? only(z, v => v >= 2, '4-бет', 'только ваши 4-беты') : row === 'nai' ? only(z, v => v === 2, '4-бет не олл-ин', 'только 4-беты не олл-ином') : row === 'ai' ? only(z, v => v === 3, '4-бет олл-ин', 'только 4-беты олл-ином') : szOf(z);
      hoverRange(td, (row === 'rg' ? 'Диапазон 4-бета' : row === 'nai' ? '4-бет не олл-ин' : row === 'ai' ? '4-бет олл-ин' : 'Ответ на 3-бет') + pl, zz); td.classList.remove('has-mx'); });
    const d = el('div', 'insight cc-table'); d.append(numTag(3), el('span', 'k', '4-бет по позициям'), el('span', 's', 'колонки — ваша позиция; «4-бет» — % от раз, когда на ваше открытие пришёл 3-бет'), w,
      infoNote('Как таблица 4-бета в Hand2Note. «Диапазон 4-бета» — какую часть всех рук (1326 комбинаций) составляет ваш 4-бет: для каждой руки — как часто вы ею 4-бетите против 3-бета, с весом числа её комбинаций (как 4bet [Range] в Hand2Note). «Не олл-ин» и «олл-ин» — как делятся 4-беты. «Фолд на 5-бет» — как часто вы сбросили, когда на ваш 4-бет поставили 5-бет. Наведите на ячейку: в строке «4-бет» — как вы ответили на 3-бет каждой рукой; в «Диапазоне 4-бета» — только руки, которыми вы 4-бетили, с частотой; в «не олл-ин» и «олл-ин» — только 4-беты этого вида. Клик закрепит окно. Бледные ячейки — меньше ' + cnt(SMALL, 'раздач', 'gen') + '.'));
    zone.append(d);
  }
  // #4 — холодный 4-бет (нижняя таблица Hand2Note)
  {
    const cols = ['TOT'].concat(F4_FP.filter(p => PB[p] && PB[p].n));
    const G = { TOT: TB }; cols.slice(1).forEach(p => { G[p] = PB[p]; });
    const f5 = {}; cols.forEach(k => { f5[k] = { x: 0, n: 0 }; });
    for (const i of B) { if (c.act[i] < 2 || !c.c4f || c.c4f[i] < 0) continue; for (const k of ['TOT', posOf(i)]) { if (!f5[k]) continue; f5[k].n++; if (c.c4f[i] === 0) f5[k].x++; } }
    const D = (fn) => Object.fromEntries(cols.map(k => [k, fn(k)]));
    const w = heatTable({ cols, groupGapBefore: cols.indexOf('SB'), rows: [
      { key: 'cc', label: 'Колл 3-бета в холодную', tone: 'ice', own: true, data: D(k => ({ x: G[k].call, n: G[k].n })) },
      { key: 'c4', label: 'Холодный 4-бет', data: D(k => ({ x: G[k].r4 + G[k].ai, n: G[k].n })) },
      { key: 'ai', label: 'из них олл-ин', sub: true, data: D(k => ({ x: G[k].ai, n: G[k].n })) },
      { key: 'f5', label: 'Фолд на 5-бет', tone: 'ice', own: true, data: D(k => f5[k]) }] });
    w.querySelectorAll('td.c').forEach(td => { const z = G[td.dataset.col]; if (z && z.n) { hoverRange(td, 'Открытие и 3-бет перед вами' + (td.dataset.col === 'TOT' ? '' : ' · ' + td.dataset.col), szOf(z)); td.classList.remove('has-mx'); } });
    const v = TB.x ? valPick(TB.sum / 10 / TB.x, TB.es / 10 / TB.x) : null;
    const d = el('div', 'insight cc-table'); d.append(numTag(4), el('span', 'k', 'Холодный 4-бет'), el('span', 's', 'перед вами открытие и 3-бет: колл, 4-бет и фолд на 5-бет; колонки — ваша позиция' + (v == null ? '' : ' · итог холодного 4-бета' + tyLab + ' ' + signed(v, 2) + ' BB')), B.length ? w : el('p', 'muted small', 'Нет таких раздач в выборке.'),
      infoNote('Как нижняя таблица Hand2Note: CC 3bet — колл 3-бета, когда вы ещё не вкладывались; Open 4bet — ваш 4-бет поверх открытия и 3-бета. «Фолд на 5-бет» — после холодного 4-бета. Наведите на ячейку — как вы ответили каждой рукой.'));
    zone.append(d);
  }

  // таблица в стиле «Против 3-бета»: раз и доля, фолд / колл / 4-бет / олл-ин — процент и итог каждой реакции, в среднем; наведение — окно первого типа
  const respTable = (list, headT) => {
    const tot = list.reduce((a, [, z]) => a + (z ? z.n : 0), 0); if (!tot) return el('p', 'muted small', 'Нет раздач в выборке.');
    const ev = VAL_MODE === 'ev', val = (q, n) => (n ? (ev ? q.es : q.sum) / 10 / n : null);
    const H = ['Фолд', 'Колл', '4-бет', 'Олл-ин'], COL = ['var(--good)', 'var(--ice)', 'var(--bad)', 'var(--amber)'];
    const box = el('div', 'v3-rt-box'), seg = valSeg(); seg.classList.add('v3-rt-seg');
    const t = el('table', 'ht v3-rt'), hr = el('tr'); [headT, 'Раз'].concat(H, ['В среднем']).forEach((h, k) => hr.append(el('th', k >= 2 ? 'num' : null, h))); const th = el('thead'); th.append(hr); t.append(th); const tb = el('tbody');
    list.forEach(([lab, z]) => { if (!z || !z.n) return;
      const tr = el('tr'); if (z.n < 30) tr.classList.add('low');
      const tdN = el('td', 'n'); tdN.append(el('b', null, z.n.toLocaleString('ru-RU')), el('small', null, fmtPct(z.n / tot) + '%')); tr.append(el('th', null, lab), tdN);
      [z.fld, z.call, z.r4, z.ai].forEach((cn, k) => { const td = el('td', 'num'), b = el('b', null, fmtPct(cn / z.n) + '%'); b.style.color = COL[k]; td.append(b); const v = val(z.act[k], cn); if (v != null) { td.append(el('span', 'v ' + (v >= 0 ? 'up' : 'down'), signed(v, 2))); td.title = H[k] + ': ' + cnt(cn, 'раз') + ' · в среднем ' + signed(z.act[k].sum / 10 / cn, 2) + ' BB факт, ' + signed(z.act[k].es / 10 / cn, 2) + ' BB EV'; } tr.append(td); });
      const a = val({ sum: z.tsum, es: z.tes }, z.n), tdA = el('td', 'num avg'); tdA.append(el('b', a >= 0 ? 'up' : 'down', signed(a, 2))); tdA.title = 'В среднем за раздачу: ' + signed(z.tsum / 10 / z.n, 2) + ' BB факт, ' + signed(z.tes / 10 / z.n, 2) + ' BB EV'; tr.append(tdA);
      const zz = { n: z.n, rmx: z.R, rids: z.all, labels: ['4-бет', 'олл-ин', 'колл', 'фолд'], capAll: 'все ваши ответы', foldPaint: true }, wt = headT + ' · ' + lab;
      tr.classList.add('click'); tr.tabIndex = 0;
      tr.addEventListener('mouseenter', (e) => showSzMx(wt, zz, tr, e)); tr.addEventListener('mousemove', (e) => { if (!SZMX_PIN && szMx && !szMx.hidden) placeSzMx(tr, e); else showSzMx(wt, zz, tr, e); }); tr.addEventListener('mouseleave', hideSzMx);
      tr.addEventListener('click', (e) => pinSzMx(wt, zz, tr, e)); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pinSzMx(wt, zz, tr); } });
      tb.append(tr); });
    t.append(tb); box.append(seg, t); return box;
  };
  const groupBy = (ids, key, Bk) => Bk.map(([lab], k) => { const z = Z(); ids.forEach(i => { if (key(i) === k) add(z, i, RVa(i)); }); return [lab, z]; });
  const sec4 = (n, title, sub, ...body) => { const d = el('div', 'insight cc-table'); d.append(numTag(n), el('b', 'pm-title', title), el('span', 'sm-s', sub), ...body); return d; };

  // #5 — чем вы 4-бетите: группы рук (как таблица справа в Hand2Note) — доля в 4-бетах и итог
  {
    const all4 = A.filter(i => RVa(i) >= 2 && typed(RVa(i) === 3) && c.hc[i] >= 0), g = F4_GROUPS.map(() => ({ n: 0, sum: 0, es: 0, ids: [], mx: Array.from({ length: 169 }, () => ({ n: 0, sum: 0, es: 0 })), f5: { x: 0, n: 0 } }));
    all4.forEach(i => { const z = g[f4Group(c.hc[i])]; z.n++; z.sum += c.net[i]; z.es += EV[i]; z.ids.push(i); const m = z.mx[c.hc[i]]; m.n++; m.sum += c.net[i]; m.es += EV[i]; if (c.v3f && c.v3f[i] >= 0) { z.f5.n++; if (c.v3f[i] === 0) z.f5.x++; } });
    const ev = VAL_MODE === 'ev', t = el('table', 'ht v3-rt'), hr = el('tr'); ['Группа рук', 'Доля в 4-бетах', 'Раз', 'Фолд на 5-бет', 'Итог 4-бета'].forEach((h, k) => hr.append(el('th', k >= 1 && k !== 2 ? 'num' : null, h))); const th = el('thead'); th.append(hr); t.append(th); const tb = el('tbody');
    g.forEach((z, k) => { if (!z.n) return; const tr = el('tr'); if (z.n < 20) tr.classList.add('low');
      const fb = el('b', null, fmtPct(z.n / all4.length) + '%'); fb.style.color = 'var(--amber)'; const tdF = el('td', 'num'); tdF.append(fb);
      const td5 = el('td', 'num'); if (z.f5.n) { const b = el('b', null, fmtPct(z.f5.x / z.f5.n) + '%'); b.style.color = 'var(--ice)'; td5.append(b, el('span', 'v', cnt(z.f5.n, 'раз'))); } else td5.append(el('span', 'muted', '—'));
      const v = (ev ? z.es : z.sum) / 10 / z.n, tdA = el('td', 'num avg'); tdA.append(el('b', v >= 0 ? 'up' : 'down', signed(v, 2))); tdA.title = signed(z.sum / 10 / z.n, 2) + ' BB факт, ' + signed(z.es / 10 / z.n, 2) + ' BB EV';
      tr.append(el('th', null, F4_GROUPS[k][0]), tdF, el('td', 'n', z.n.toLocaleString('ru-RU')), td5, tdA);
      hoverHands(tr, { p: F4_GROUPS[k][0], anyPos: true, pre: true, key: 'f45' + k + ty, title: '4-бет' + tyLab + ' · ' + F4_GROUPS[k][0], o: { n: z.n, sum: z.sum, es: z.es }, mx: z.mx, ids: z.ids, vlab: ' BB за 4-бет', nlab: ' 4-бетов' }, z.sum / 10 / z.n); tb.append(tr); });
    t.append(tb); const box = el('div', 'v3-rt-box'); const sg = valSeg(); sg.classList.add('v3-rt-seg'); box.append(sg, t);
    zone.append(sec4(5, 'Чем вы 4-бетите', 'из каких рук состоят ваши 4-беты' + tyLab + ' и что каждая группа приносит', all4.length ? box : el('p', 'muted small', 'Нет 4-бетов в выборке.'),
      infoNote('Как таблица групп рук в Hand2Note: доля группы среди всех ваших 4-бетов после открытия (в сумме 100%). «Фолд на 5-бет» — как часто вы сбросили этой группой на 5-бет. «Итог 4-бета» — средний результат раздачи (EV или факт — переключатель). Наведите на строку — руки группы и итог; клик закрепит окно.')));
  }
  // #6 — позиция против позиции 3-бетящего: доля 4-бета
  {
    const g = {}; for (const i of A) { const p = posOf(i), q = c.v3q[i], op = q >= 0 ? F4_FP[q] : null; if (!p || !op) continue; const row = g[op] || (g[op] = {}); if (!row[p]) row[p] = Z(); add(row[p], i, RVa(i)); }
    const OPS = ['MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'], cols = F4_POS.filter(p => OPS.some(op => g[op] && g[op][p])), rows0 = OPS.filter(op => g[op] && cols.some(p => g[op][p] && g[op][p].n >= SMALL)), rows = rows0.length ? rows0 : OPS.filter(op => g[op]); // мало раздач (короткий стек и т. п.) — показываем что есть, бледным, а не пустую карточку
    const body = el('div');
    if (rows.length) { const tbl = heatTable({ cols, noTot: true, rows: rows.map(op => ({ key: op, label: op, data: Object.fromEntries(cols.map(p => [p, g[op][p] ? { x: g[op][p].x, n: g[op][p].n } : null])) })) });
      tbl.querySelectorAll('td.c').forEach(td => { const z = g[td.dataset.row] && g[td.dataset.row][td.dataset.col]; if (z && z.n) { hoverRange(td, 'Вы ' + td.dataset.col + ' против 3-бета с ' + td.dataset.row, szOf(z)); td.classList.remove('has-mx'); } }); body.append(tbl); }
    else body.append(el('p', 'muted small', 'Мало данных.'));
    zone.append(sec4(6, '4-бет: ваша позиция против позиции 3-бетящего', 'строки — кто 3-бетит, колонки — ваша позиция; в ячейке — доля 4-бетов' + tyLab, body,
      infoNote('Как часто вы 4-бетите против 3-бета с каждой позиции: против 3-бета с блайндов в позиции обычно 4-бетят шире. Наведите на ячейку — как вы ответили каждой рукой.')));
  }
  // #7 — против размера 3-бета
  zone.append(sec4(7, 'Против размера 3-бета', 'как вы отвечаете на маленький и большой 3-бет',
    respTable(groupBy(A.filter(i => c.v3z[i] > 0 && c.size[i] > 0), i => (F4_3X.findIndex(q => c.v3z[i] / c.size[i] >= q[1] && c.v3z[i] / c.size[i] < q[2])), F4_3X), 'Размер 3-бета'),
    infoNote('Размер — 3-бет соперника, делённый на ваше открытие; 3-беты олл-ином во вкладку не входят (против них 4-бета не бывает). Под каждым процентом — средний итог раздачи после этой реакции.')));
  // #8 — против стека 3-бетящего
  zone.append(sec4(8, 'Против стека 3-бетящего', 'против короткого 3-бетящего 4-бет — почти всегда олл-ин, против глубокого — вопрос размера',
    respTable(groupBy(A.filter(i => c.v3s[i] > 0), i => F4_STK.findIndex(q => c.v3s[i] / 10 >= q[1] && c.v3s[i] / 10 < q[2]), F4_STK), 'Его стек'),
    infoNote('Стек 3-бетящего в начале раздачи. Наведите на строку — как вы ответили каждой рукой; клик закрепит окно.')));
  // #9 — по вашему стеку (фильтр стека раздела не действует — он и есть строки)
  zone.append(sec4(9, '4-бет по вашему стеку', 'фолд, колл и 4-бет против 3-бета при разной глубине',
    respTable(groupBy(A0, i => F4_STK.findIndex(q => c.bb[i] / 10 >= q[1] && c.bb[i] / 10 < q[2]), F4_STK), 'Ваш стек'),
    infoNote('Ваш стек в начале раздачи; фильтр стека раздела здесь не действует (он и есть строки).')));
  // #10 — размер вашего 4-бета: в разах от 3-бета, фолд на 5-бет и итог
  {
    const L = F4_4X.map(() => ({ n: 0, sum: 0, es: 0, ids: [], mx: Array.from({ length: 169 }, () => ({ n: 0, sum: 0, es: 0 })), f5: [0, 0, 0], f5n: 0, hx: new Uint16Array(169) })), AIz = { n: 0, sum: 0, es: 0, ids: [], mx: Array.from({ length: 169 }, () => ({ n: 0, sum: 0, es: 0 })), f5: [0, 0, 0], f5n: 0, hx: new Uint16Array(169) };
    for (const i of A) { const v = RVa(i); if (v < 2 || !c.v3y || c.v3y[i] <= 0 || c.v3z[i] <= 0) continue; const z = v === 3 ? AIz : L[F4_4X.findIndex(q => c.v3y[i] / c.v3z[i] >= q[1] && c.v3y[i] / c.v3z[i] < q[2])]; if (!z) continue; z.n++; z.sum += c.net[i]; z.es += EV[i]; z.ids.push(i); if (c.hc[i] >= 0) { const m = z.mx[c.hc[i]]; m.n++; m.sum += c.net[i]; m.es += EV[i]; z.hx[c.hc[i]]++; } if (c.v3f && c.v3f[i] >= 0) { z.f5n++; z.f5[c.v3f[i]]++; } }
    const rows = F4_4X.map((q, k) => [q[0], L[k]]).concat([['олл-ин', AIz]]).filter(([, z]) => z.n), tot = rows.reduce((a, [, z]) => a + z.n, 0), ev = VAL_MODE === 'ev';
    const t = el('table', 'ht v3-rt'), hr = el('tr'); ['Размер 4-бета', '4-бетов', 'Против 5-бета: фолд', 'колл', 'олл-ин', 'В среднем'].forEach((h, k) => hr.append(el('th', k >= 2 ? 'num' : null, h))); const th = el('thead'); th.append(hr); t.append(th); const tb = el('tbody');
    rows.forEach(([lab, z]) => { const tr = el('tr'); if (z.n < 20) tr.classList.add('low');
      const tdN = el('td', 'n'); tdN.append(el('b', null, z.n.toLocaleString('ru-RU')), el('small', null, fmtPct(z.n / tot) + '%')); tr.append(el('th', null, lab), tdN);
      [0, 1, 2].forEach(k => { const td = el('td', 'num'); if (!z.f5n) td.append(el('span', 'muted', '—')); else { const b = el('b', null, fmtPct(z.f5[k] / z.f5n) + '%'); b.style.color = ['var(--good)', 'var(--ice)', 'var(--bad)'][k]; td.append(b, el('span', 'v', cnt(z.f5[k], 'раз'))); } tr.append(td); });
      const v = (ev ? z.es : z.sum) / 10 / z.n, tdA = el('td', 'num avg'); tdA.append(el('b', v >= 0 ? 'up' : 'down', signed(v, 2))); tdA.title = signed(z.sum / 10 / z.n, 2) + ' BB факт, ' + signed(z.es / 10 / z.n, 2) + ' BB EV'; tr.append(tdA);
      const zz = { n: rangeN(TA.R), rmx: TA.R.map((m, q) => ({ n: m.n, x: z.hx[q], ai: lab === 'олл-ин' ? z.hx[q] : 0, lp: m.lp, sum: m.sum, es: m.es })), vmx: z.mx, rids: z.ids, labels: ['4-бет ' + lab, lab === 'олл-ин' ? 'олл-ин' : '', 'колл', 'фолд или другой размер'], capAll: 'только 4-беты ' + lab, foldPaint: true };
      hoverRange(tr, '4-бет ' + lab, zz); tr.classList.remove('has-mx'); tb.append(tr); });
    t.append(tb); const box = el('div', 'v3-rt-box'); const sg = valSeg(); sg.classList.add('v3-rt-seg'); box.append(sg, t);
    zone.append(sec4(10, 'Размер вашего 4-бета', 'во сколько раз больше 3-бета вы 4-бетите и как играете против 5-бета', rows.length ? box : el('p', 'muted small', 'Нет 4-бетов в выборке.'),
      infoNote('Размер — ваш 4-бет, делённый на 3-бет соперника; олл-ин — отдельной строкой. «Против 5-бета» — ваш ход, когда на 4-бет ответили 5-бетом. Наведите на строку — диапазон: все ваши ответы на 3-бет, 4-беты этим размером выделены; клик закрепит окно. Тип 4-бета из шапки здесь не применяется — он и есть строки.')));
  }
  // #11 — какие руки вы 4-бетите: матрица по позиции
  {
    const b = el('section', 'block'); b.append(numTag(11));
    const hh = el('div', 'block-head'); hh.append(el('h2', null, 'Какие руки вы 4-бетите'), el('p', null, 'как вы отвечаете на 3-бет каждой рукой: 4-бет, олл-ин, колл, фолд'));
    const av = F4_POS.filter(p => PA[p] && PA[p].n), mxp = av.includes(F4_MXPOS) || !av.length ? F4_MXPOS : av[av.length - 1];
    const seg = el('div', 'seg'); av.forEach(p => { const bt = el('button', mxp === p ? 'on' : '', p); bt.type = 'button'; bt.onclick = () => { F4_MXPOS = p; renderNext(); }; seg.append(bt); });
    const z = PA[mxp] || TA, mxBody = el('div', 'block-body');
    mxBody.append(handMatrix(z.R.map(m => ({ n: m.n, x: m.x, ai: m.ai, lp: m.lp })), ['4-бет', 'олл-ин', 'колл', 'фолд']));
    const side = el('div', 'mx-side'); side.append(el('span', 'mx-cap', 'Ваша позиция'), seg, el('p', 'muted small', cnt(z.n, 'раз') + ' вас 3-бетили · 4-бет ' + (z.n ? fmtPct((z.r4 + z.ai) / z.n) : '—') + '%'));
    mxBody.append(side);
    b.append(hh, mxBody, infoNote('Цвет клетки — как вы ответили этой рукой на 3-бет после своего открытия: 4-бет, олл-ин, колл; фолд — тёмным.'));
    zone.append(b);
  }
  // порядок: 1–2 рядом, дальше по номеру
  const num = (n) => +((n.querySelector(':scope > .num-tag') || n.querySelector('.num-tag') || {}).textContent || '#99').slice(1);
  [...zone.children].slice(1).sort((x, y) => num(x) - num(y)).forEach(n => zone.append(n));
  page.append(zone);
  return page;
}
