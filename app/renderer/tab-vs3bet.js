'use strict';
/* global mda, Stats */
// Вкладка «Против 3-бета» (v3B).
// строка результата «факт / EV» — разметка (цвет плюса и минуса): el() кладёт текст как есть, и пользователь видел теги <span>
const htmlDiv = (cls, html) => { const d = el('div', cls); d.innerHTML = html; return d; };
// ---------- Против 3-бета: своё открытие и 3-бет соперника ----------
// Фильтры раздела: тип 3-бета соперника, наше действие на него и ваш стек — все отбирают раздачи целиком.
// Карточки 1–2 — все споты, как в Hand2Note (RF,RC,RR+): чужие коллы открытия и 3-бета не важны;
// карточка 3 — раздачи, где 3-бет кто-то заколлил за спиной; карточка 5 — те же частоты и результат
// только на «чистых» спотах 1vs1 (открытие без коллов, до вашего хода никто не вступал).
function renderV3B(idx) {
  const sr = secRange('vs3bet'), f = secF('vs3bet'), cb = DB.cols;
  let idxS = sr ? idx.filter(i => cb.bb[i] >= sr[0] * 10 && cb.bb[i] < sr[1] * 10) : idx;
  const T = secType('vs3bet');
  // два семейства спотов: asR — вы открылись и получили 3-бет (v3*), asC — вы заколлировали чужое открытие, за спиной сквиз (c3*).
  // Все фильтры работают с унифицированными значениями: RV — ваш ход, RA — «олл-ин» рейза соперника, RP — позиция относительно него
  const isC = i => cb.c3 != null && cb.c3[i] >= 0;
  const RV = i => isC(i) ? cb.c3[i] : cb.v3[i];
  const RA = i => isC(i) ? (cb.c3a != null ? cb.c3a[i] : -1) : cb.v3a[i];
  const RP = i => isC(i) ? (cb.c3p != null ? cb.c3p[i] : -1) : cb.v3p[i];
  const AV = { fold: 0, call: 1, r4: 2, ai: 3 };
  // тип 3-бета соперника (сквиза для asC): олл-ин / не олл-ин — все карточки
  if (T.flt) idxS = idxS.filter(i => RA(i) >= 0 && (T.ty === 'ai' ? RA(i) === 1 : RA(i) === 0));
  // наша позиция относительно 3-бетящего/сквизера постфлоп (1 IP / 0 OOP) — все карточки
  if (f.P !== 'all') idxS = idxS.filter(i => RP(i) === (f.P === 'ip' ? 1 : 0));
  // тип 3-бет банка: 1vs1 — до вашего хода никто не вступил и открытие не коллировали (только asR);
  // сквиз пот — asR (ваше открытие заколлировали, сквиз поверх) и/или asC (вы коллер) — по подтумблерам;
  // раздачи, где за спиной вступили после 3-бета, — карточкой 3, в фильтр не входят
  if (f.B === 'hu') idxS = idxS.filter(i => !isC(i) && cb.v3o[i] === 0 && (cb.v3e ? cb.v3e[i] === 0 : cb.v3c[i] === 0));
  else if (f.B === 'sq') {
    const sq = f.SQ || ['r', 'c'];
    idxS = idxS.filter(i => (!isC(i) && cb.v3o[i] === 1 && sq.includes('r')) || (isC(i) && sq.includes('c')));
  } else idxS = idxS.filter(i => !isC(i)); // «Все» и остальные банки — только семейство открывателя (как в Hand2Note)
  const idxA = idxS; // карточка 1 — без «нашего действия»: частоты ответов по всем реакциям выбранного банка
  if (f.A.length) idxS = idxS.filter(i => f.A.some(a => RV(i) === AV[a])); // «наше действие» — можно несколько; карточки 2–3
  const rA = Stats.v3b(DB, idxA);
  const r = Stats.v3b(DB, idxS);
  // подписи — по выборке: в «сквиз поте» соперник сквизит (а не 3-бетит), с подтумблером «вы коллер» в выборке не только ваши открытия
  const SQ = f.B === 'sq', SQS = f.SQ || ['r', 'c'], withC = SQ && SQS.includes('c'), onlyC = withC && !SQS.includes('r');
  const NR = SQ ? 'сквиз' : '3-бет', NRg = SQ ? 'сквиза' : '3-бета', NRc = SQ ? 'со сквизом' : 'с 3-бетом';
  const UNIT = onlyC ? 'ваших коллов открытия' : withC ? 'раздач' : 'открытий';
  const page = el('div', 'page');
  const head = el('div', 'page-head');
  const h1 = el('h1'); h1.append(document.createTextNode('Против 3-бета '), el('span', null, 'v3B'));
  head.append(h1, el('p', null, (onlyC ? 'Как вы отвечаете на сквиз, когда заколлировали чужое открытие' : withC ? 'Как вы отвечаете на сквиз — после своего открытия и после колла чужого открытия' : SQ ? 'Как вы отвечаете на сквиз поверх своего открытия' : 'Как вы отвечаете на 3-бет на своё открытие') + ': фолд, колл и 4-бет по позициям и результат вашей реакции. Отдельно — раздачи, где до вашего хода вступил кто-то ещё.'));
  page.append(head);
  if (!cb.v3) { page.append(el('p', 'muted small', 'В этой базе нет колонок против 3-бета (собрана до 0.7.33). Обновление базы досчитает их из записей реплеера при следующем запуске программы.')); return page; }
  const t = r.d.TOT, ta = rA.d.TOT;
  if (!rA.all) { page.append(el('p', 'muted small', 'Нет ' + UNIT + ' ' + NRc + ' в этой выборке.')); return page; }
  // #1 — фолд на 3-бет: частота по позициям и все ответы (как в Hand2Note: чужие коллы не важны); «наше действие» не применяется
  const posRows = rA.V3B_POS.filter(p => rA.d[p].n >= SMALL).map(p => { const z = rA.d[p]; return [p, z.fld / z.n, p + ': ' + z.fld + ' из ' + z.n]; });
  const c1 = card(1, 'Фолдите на ' + NR, '<em>' + fmtPct(ta.fld / ta.n) + '%</em>', 'из ' + cnt(ta.n, UNIT, 'gen'),
    fillBox(posStrip('Фолд по позициям', posRows), respTiles(rA.resp, 'Ваш ответ на ' + NR, [['фолд', 'var(--good)'], ['колл', 'var(--ice)'], ['4-бет', 'var(--bad)']])));
  // #2 — результат вашей реакции на 3-бет по позициям, факт / EV; действия задаёт фильтр «Наше действие» (по умолчанию — все)
  const pos = ['TOT'].concat(r.V3B_POS).filter(p => r.d[p].n >= 1);
  const items = pos.map(p => { const z = r.d[p]; return { p, anyPos: true, pre: true, key: 'v3 ' + p + (sr ? ' ' + sr.join('-') : '') + T.ty + f.A.join('+') + f.B + (f.SQ || []).join(''), title: 'Ваша реакция на ' + NR + (p === 'TOT' ? ' (все позиции)' : ' с ' + p), o: { n: z.n, sum: z.sum, es: z.es }, mx: z.mx, ids: z.ids, vlab: ' BB за раздачу', nlab: ' раздач' }; }); // pre — раздачи уже отобраны фильтрами (asR открыватели и asC коллеры вперемешку)
  LAST_NET_ITEMS = items;
  const avg = t.n ? t.sum / 10 / t.n : null, avgE = t.n ? t.es / 10 / t.n : null;
  const chartBox = el('div'); chartBox.append(netChart(items, avg, 'EV реакции на ' + NR));
  const c2 = card(2, 'Результат вашей реакции на ' + NR, wrHtml(avg, avgE, 2) + ' <small>BB за раздачу</small>', 'по ' + cnt(t.n, 'раздач', 'dat'), chartBox);
  c2.classList.add('wide');
  c2.append(infoNote('Факт — средний итог этих раздач в BB (банк минус ваши вложения): сколько приносит выбранная реакция на 3-бет. EV — тот же итог с поправкой на эквити в раздачах, закончившихся олл-ином до ривера: карта выправляет удачу. Реакции задаёт фильтр раздела «Наше действие» — по умолчанию все ответы (фолд, колл, 4-бет, 4-бет олл-ином), можно сочетать, например оба 4-бета или фолд с коллом; на столбик можно навести и закрепить окно с руками, клик по руке откроет раздачи и реплеер.'));
  // #3 «Вступили до вашего хода» и «Против размера 3-бета» — в v3ExtraCards (0.7.55), с выбором вашей позиции
  // #4 — «Ваш ответ против трибета агрессора»: матрица рук (4-бет / олл-ин / колл / фолд) при заданных
  // вашей позиции, позиции 3-бетящего, его стеке и вашем стеке; фильтры шапки раздела НЕ действуют —
  // только основные фильтры проекта (рум, период, бай-ин, столы)
  const v3oOpt = { v3oPos: uiState.v3OPos, v3oStk: uiState.v3OStkR, v3oMy: uiState.v3OMyR, v3oOpen: uiState.v3OOpen };
  const rV = Stats.v3b(DB, idx, v3oOpt); // #4 — по всем раздачам вкладки (idx до фильтров раздела), фильтры шапки раздела не действуют
  const c4 = el('section', 'block cc-table'); c4.append(numTag(4));
  {
    const h = el('div', 'block-head'); h.append(el('h2', null, 'Ваш ответ против трибета агрессора'), el('p', null, 'какими руками вы 4-бетите, коллируете, пушите и фолдите против 3-бета; вашу позицию, позицию 3-бетящего и стеки задаёте сами'));
    // умные связки позиций: порядок хода EP → MP(вкл. HJ) → CO → BTN → SB → BB;
    // 3-бетящий действует позже открывающего — его позиция не может быть раньше вашей;
    // одинаковая позиция возможна только для MP (за 8+ столами два места MP; HJ за 6-max тоже MP)
    const POS_ORDER = { EP: 0, MP: 1, CO: 3, BTN: 4, SB: 5, BB: 6 };
    const MY_POS = ['EP', 'MP', 'CO', 'BTN', 'SB'];
    const posN = (p) => (rV.d[p] ? rV.d[p].n : 0) + (p === 'MP' && rV.d['HJ'] ? rV.d['HJ'].n : 0); // MP включает HJ
    const seg = el('div', 'seg');
    MY_POS.filter(p => posN(p) >= SMALL).forEach(p => { const bt = el('button', uiState.v3OPos === p ? 'on' : '', p); bt.type = 'button'; bt.title = p === 'MP' ? 'MP и HJ (за 6-max среднее место — HJ)' : ''; bt.onclick = () => { uiState.v3OPos = p; uiState.v3OOpen = uiState.v3OOpen.filter(op => POS_ORDER[op] > POS_ORDER[p] || (op === 'MP' && p === 'MP')); renderNext(); }; seg.append(bt); });
    const segO = el('div', 'seg seg-multi');
    // 3-бетящий: только позиции позже вашей; одинаковая MP — только за 7+ max (два места MP);
    // при фильтре 6-max MP×MP невозможна (одно среднее место)
    const hero = POS_ORDER[uiState.v3OPos] != null ? POS_ORDER[uiState.v3OPos] : 3;
    const is6 = state.sub === '6max';
    const opts = Object.keys(POS_ORDER).filter(op => POS_ORDER[op] > hero || (op === 'MP' && hero === 1 && !is6));
    const sel = uiState.v3OOpen.filter(op => opts.includes(op));
    const ball = el('button', sel.length ? '' : 'on', 'Все'); ball.type = 'button'; ball.setAttribute('aria-pressed', String(!sel.length)); ball.onclick = () => { uiState.v3OOpen = []; renderNext(); }; segO.append(ball);
    opts.forEach(op => { const on = sel.includes(op); const bt = el('button', on ? 'on' : '', op); bt.type = 'button'; bt.setAttribute('aria-pressed', String(on)); bt.onclick = () => { uiState.v3OOpen = on ? sel.filter(x => x !== op) : sel.concat([op]); renderNext(); }; segO.append(bt); });
    const body = el('div', 'block-body'); body.append(handMatrix(rV.mxV || [], ['4-бет', 'олл-ин', 'колл', 'фолд']));
    const side = el('div', 'mx-side');
    const leg = el('div', 'resp-legend row'); [['4-бет', 'var(--mx-raise)'], ['олл-ин', 'var(--mx-push)'], ['колл', 'var(--mx-limp)'], ['фолд', 'var(--mx-empty)']].forEach(([l, col]) => { const it = el('span'); const i = el('i'); i.style.background = col; if (col === 'var(--mx-empty)') i.style.border = '1px solid var(--line2)'; it.append(i, document.createTextNode(l)); leg.append(it); });
    const n = (rV.mxV || []).reduce((a, m) => a + m.n, 0);
    const form = el('form', 'cc-opp-form');
    const mkIn = (id, ph, val) => { const i = el('input'); i.type = 'number'; i.id = id; i.min = '0'; i.max = '1000'; i.step = '0.5'; i.placeholder = ph; i.inputMode = 'decimal'; if (val != null) i.value = String(val); return i; };
    const pairF = (id, cur, cap) => {
      const row = el('div', 'mx-range'); const lo = mkIn(id + 'Lo', 'от', cur ? cur[0] : null), hi = mkIn(id + 'Hi', 'до', cur && cur[1] < 1e8 ? cur[1] : null);
      const l1 = el('label', 'sr', cap + ' от, BB'); l1.htmlFor = id + 'Lo'; const l2 = el('label', 'sr', cap + ' до, BB'); l2.htmlFor = id + 'Hi';
      row.append(l1, lo, el('span', 'mx-dash', '—'), l2, hi, el('span', 'mx-unit', 'BB'));
      return { row, lo, hi };
    };
    const po = pairF('v3Os', uiState.v3OStkR, 'Стек 3-бетящего'), pm = pairF('v3Om', uiState.v3OMyR, 'Мой стек');
    const err = el('span', 'mx-err');
    const go = el('button', 'btn mx-go' + (uiState.v3OStkR || uiState.v3OMyR ? ' on' : ''), 'Показать'); go.type = 'submit';
    const clr = el('button', 'btn mx-clr', 'Сброс'); clr.type = 'button'; clr.hidden = !(uiState.v3OStkR || uiState.v3OMyR);
    clr.onclick = () => { uiState.v3OStkR = null; uiState.v3OMyR = null; renderNext(); };
    const btns = el('div', 'cc-opp-btns'); btns.append(go, clr);
    form.append(el('span', 'mx-cap', 'Стек 3-бетящего'), po.row, el('span', 'mx-cap', 'Мой диапазон'), pm.row, btns, err);
    const readF = (p) => {
      if (p.lo.value === '' && p.hi.value === '') return null;
      const a = p.lo.value === '' ? 0 : parseFloat(p.lo.value), b = p.hi.value === '' ? 1e9 : parseFloat(p.hi.value);
      return isNaN(a) || isNaN(b) || a < 0 || b <= a ? 'bad' : [a, b];
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      const o = readF(po), m = readF(pm);
      if (o === 'bad' || m === 'bad') { err.textContent = 'В каждом диапазоне «до» должно быть больше «от»'; return; }
      uiState.v3OStkR = o; uiState.v3OMyR = m; render();
    };
    side.append(leg, el('span', 'mx-cap', 'Ваша позиция'), seg, el('span', 'mx-cap', 'Позиция 3-бетящего — можно несколько'), segO, form,
      el('span', 'muted small', '3-бетящий: ' + (sel.length ? sel.join(' + ') : 'любая позиция') + ', ' + rangeTxt(uiState.v3OStkR) + ' · вы: ' + rangeTxt(uiState.v3OMyR) + ' · ' + cnt(n, 'раз') + ' вы получали 3-бет'));
    side.append(infoNote('Задайте стек 3-бетящего и свой стек в BB: «от» и «до» можно заполнить оба или одно (пустое «до» — без верхней границы). Нажмите «Показать» — матрица покажет ваши ответы ровно в таких раздачах. «Сброс» возвращает «любой». Клетка закрашена слева направо на долю ответов этой рукой: янтарная часть — 4-бет, синяя — олл-ин, зелёная — колл, тёмная — фолд. Бледная заливка — меньше 5 раздач. Фильтры раздела на эту карточку не действуют — только фильтры шапки (рум, тип турнира, период, бай-ин, столы).'));
    body.append(side);
    c4.append(h, body);
  }
  // #5 «Чистые споты 1vs1» — v3Card5 (0.7.56): строится ниже, после отбора pick()
  // #6–#15 — карточки-предложения (0.7.55): отбор фильтрами раздела по таблице CARD_FILTERS — pick('S', 'T'…) пропускает
  // раздачи только через названные фильтры (те же правила, что выше у idxS)
  const PRED = {
    S: i => !sr || (cb.bb[i] >= sr[0] * 10 && cb.bb[i] < sr[1] * 10),
    T: i => !T.flt || (RA(i) >= 0 && (T.ty === 'ai' ? RA(i) === 1 : RA(i) === 0)),
    P: i => f.P === 'all' || RP(i) === (f.P === 'ip' ? 1 : 0),
    B: i => f.B === 'hu' ? !isC(i) && cb.v3o[i] === 0 && (cb.v3e ? cb.v3e[i] === 0 : cb.v3c[i] === 0) : f.B === 'sq' ? ((!isC(i) && cb.v3o[i] === 1 && (f.SQ || ['r', 'c']).includes('r')) || (isC(i) && (f.SQ || ['r', 'c']).includes('c'))) : !isC(i),
    A: i => !f.A.length || f.A.some(a => RV(i) === AV[a])
  };
  const spot = idx.filter(i => cb.v3[i] >= 0 || isC(i));
  const pick = (...L) => spot.filter(i => L.every(k => PRED[k](i)));
  const extra = v3ExtraCards({ idx, spot, pick, RV, RA, RP, isC, NR, NRg, sr, T });
  const c5 = v3Card5({ pick, RV, isC });
  const zone = el('div', 'summary'); const pair = el('div', 'sum-pair'); pair.append(c1, c2); zone.append(pair, c5, c4, ...extra);
  page.append(zone);
  return page;
}


// ---------- #6–#15: карточки-предложения «Против 3-бета» ----------
// Общий счётчик ответа: n — раздач, fld / call / r4 (4-бет не олл-ином) / ai (4-бет олл-ином), sum / es — итог в BB×10 (факт / EV),
// ids и mx — для окна рук при наведении (как у карточки 2).
function v3Cell() { return { n: 0, fld: 0, call: 0, r4: 0, ai: 0, sum: 0, es: 0, ids: [], mx: Array.from({ length: 169 }, () => ({ n: 0, sum: 0, es: 0 })) }; }
function v3Add(z, i, v, c, EV) {
  z.n++; if (v === 0) z.fld++; else if (v === 1) z.call++; else if (v === 3) z.ai++; else z.r4++;
  const nv = c.net ? c.net[i] : 0, ne = c.net ? EV[i] : 0; z.sum += nv; z.es += ne;
  if (c.hc[i] >= 0) { z.ids.push(i); const m = z.mx[c.hc[i]]; m.n++; m.sum += nv; m.es += ne; }
}
function v3Group(ids, keyOf, RV) {
  const c = DB.cols, EV = EVcol(), out = {};
  for (const i of ids) { const k = keyOf(i); if (k == null) continue; v3Add(out[k] || (out[k] = v3Cell()), i, RV(i), c, EV); }
  return out;
}
// таблица «строка — ответ на 3-бет»: раз, фолд, колл, 4-бет, 4-бет олл-ин, результат; наведение — руки этих раздач и итог
function v3RespTable(rows, title, NR, keyPre, heads) {
  const t = el('div', 'sz5-t tb-sz');
  const hd = el('div', 'sz5-r sz5-h'); [title, 'Раз'].concat(heads || ['Фолд', 'Колл', '4-бет', 'Олл-ин']).concat(['Результат, BB / EV']).forEach(x => hd.append(el('span', null, x))); t.append(hd);
  // строка-итог («Всего», «Все позиции») — сама и есть 100%: доли считаются от неё, а не от суммы строк (иначе итог удваивался)
  const isTot = (lab) => /^Вс[её]/.test(lab), totRow = rows.find(r => isTot(r[0]) && r[1]);
  const tot = totRow ? totRow[1].n : rows.reduce((a, r) => a + (r[1] ? r[1].n : 0), 0);
  rows.forEach(([lab, z]) => {
    if (!z || !z.n) return;
    const row = el('div', 'sz5-r click'); if (z.n < 30) row.classList.add('low');
    const pc = (v) => fmtPct(v / z.n) + '%', v = (txt, col) => { const e = el('span', 'sz5-v', txt); e.style.color = col; return e; };
    const tk = el('span', 'sz5-tk'), tr = el('i'); tr.style.width = Math.max(1, z.n / tot * 100) + '%'; tk.append(tr);
    row.append(el('b', null, lab), el('span', 'sz5-sh', z.n.toLocaleString('ru-RU')), v(pc(z.fld), 'var(--good)'), v(pc(z.call), 'var(--ice)'), v(pc(z.r4), 'var(--bad)'), v(pc(z.ai), 'var(--amber)'),
      wrNode('sz5-v', z.sum / 10 / z.n, z.es / 10 / z.n, 2), el('small', null, fmtPct(z.n / tot) + '% раздач'), tk);
    if (z.ids.length) { row.tabIndex = 0; row.setAttribute('role', 'button'); hoverHands(row, { p: lab, anyPos: true, pre: true, key: keyPre + lab, title: 'Ваша реакция на ' + NR + ' · ' + lab, o: { n: z.ids.length, sum: z.ids.reduce((a, i) => a + DB.cols.net[i], 0), es: z.ids.reduce((a, i) => a + EVcol()[i], 0) }, mx: z.mx, ids: z.ids, vlab: ' BB за раздачу', nlab: ' раздач' }, z.sum / 10 / z.n); }
    t.append(row);
  });
  return tot ? t : el('p', 'muted small', 'Нет раздач в выборке.');
}
// сила руки по формуле Чена (стандартная оценка стартовой руки): пары, старшая карта, одномастность, разрыв
function chenOf(k) {
  const i = Math.floor(k / 13), j = k % 13, hi = Math.min(i, j), lo = Math.max(i, j), rv = (x) => 14 - x, sc = (x) => (x === 0 ? 10 : x === 1 ? 8 : x === 2 ? 7 : x === 3 ? 6 : rv(x) / 2);
  if (i === j) return Math.max(5, sc(i) * 2);
  let s = sc(hi); if (i < j) s += 2; // одномастные — над диагональю (i < j)
  const gap = lo - hi - 1; s -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
  if (gap <= 1 && rv(hi) < 12) s += 1;
  return Math.ceil(s);
}
let V3_C3POS = 'all', V3_OSZM = 'f';
// «Итог по реакциям»: средний результат каждой вашей реакции (фолд / колл / рейз), факт / EV, и число раздач
function v3PerAct(ids, labs, RV) {
  const c = DB.cols, EV = EVcol(), z = [0, 1, 2].map(() => ({ n: 0, sum: 0, es: 0 }));
  for (const i of ids) { const v = RV(i), k = v === 0 ? 0 : v === 1 ? 1 : 2; z[k].n++; z[k].sum += c.net[i]; z[k].es += EV[i]; }
  const d = el('div', 'v3-peract'); d.append(el('span', 'muted small', 'Итог по реакциям, BB за раздачу:'));
  z.forEach((q, k) => { const b = el('span'); b.append(el('b', null, labs[k] + ' '), q.n ? wrNode('wr', q.sum / 10 / q.n, q.es / 10 / q.n, 2) : el('span', 'muted', '—'), el('small', null, ' · ' + cnt(q.n, 'раз'))); d.append(b); });
  return d;
}
// #5 — чистые споты 1vs1: вы открылись, открытие никто не коллировал, пришёл 3-бет, до вашего хода никто не вступал — ровно вы и 3-бетящий.
// Фильтры раздела: ваш стек, тип 3-бета соперника, ваша позиция относительно 3-бетящего. «Тип банка» не действует — карточка сама
// и есть банк 1vs1 (при «сквиз поте» она бы всегда была пустой); «Наше действие» — тоже нет: ваши реакции и их итог и есть содержимое.
function v3Card5(x) {
  const c = DB.cols, ids = x.pick('S', 'T', 'P').filter(i => !x.isC(i) && c.v3o[i] === 0 && (c.v3e ? c.v3e[i] === 0 : c.v3c[i] === 0));
  const posOf = (i) => (c.fp[i] >= 0 ? V3_FP[c.fp[i]] : null), g = v3Group(ids, posOf, x.RV), t = v3Group(ids, () => 't', x.RV).t;
  if (!t || !t.n) return card(5, 'Чистые споты: фолд на 3-бет', '<span class="muted">—</span>', 'нет чистых спотов 1vs1 в выборке', el('span'));
  const rows = [['Все позиции', t]].concat(V3_POS.filter(p => g[p]).map(p => [p, g[p]]));
  const body = fillBox(respTiles([t.fld, t.call, t.r4 + t.ai], 'Ваш ответ на 3-бет', [['фолд', 'var(--good)'], ['колл', 'var(--ice)'], ['4-бет', 'var(--bad)']]),
    v3RespTable(rows, 'Ваша позиция', '3-бет', 'v35'), v3PerAct(ids, ['фолд', 'колл', '4-бет'], x.RV));
  const c5 = card(5, 'Чистые споты: фолд на 3-бет', '<em>' + fmtPct(t.fld / t.n) + '%</em>', 'из ' + cnt(t.n, 'чистых спотов', 'gen') + ' 1vs1', body);
  c5.append(infoNote('Чистый спот: вы открылись, никто не коллировал открытие, пришёл 3-бет — и до вашего хода больше никто не вступал. Ровно вы и 3-бетящий. Карточки 1–2 считают такие споты вместе с остальными (как в Hand2Note), эта — только чистые, чтобы сравнить. Таблица — по вашей позиции: фолд, колл, 4-бет, 4-бет олл-ином и средний итог раздачи (факт / EV); наведите на строку — руки и итог, клик по руке откроет раздачи и реплеер. «Итог по реакциям» — сколько в среднем приносит каждая ваша реакция. Фильтры раздела: ваш стек, тип 3-бета соперника и ваша позиция относительно 3-бетящего (IP / OOP). «Тип трибет банка» не действует — карточка сама и есть банк 1vs1; «Наше действие» — тоже: ваши реакции и есть содержимое карточки.'));
  return c5;
} // выбор позиции в карточке 3 «Против 3-бета»
// подпись карточки 3, если выборка по смыслу пуста
const f3note = (x) => { const f = secF('vs3bet'); return f.B === 'hu' ? 'в «3b пот 1vs1» до вашего хода никто не вступает — выберите «Все» или «сквиз пот»' : f.B === 'sq' && f.SQ && !f.SQ.includes('r') ? 'сценарий для ваших открытий — включите подтумблер «вы рейзер»' : ''; };
const V3_STK = [['< 15 BB', 0, 15], ['15–25 BB', 15, 25], ['25–40 BB', 25, 40], ['40+ BB', 40, 1e9]];
const V3_SZ = [['до 2 BB', 0, 205], ['2,1–2,3 BB', 205, 235], ['2,4–2,6 BB', 235, 265], ['2,7–3,4 BB', 265, 345], ['3,5+ BB', 345, 1e9]];
const V3_POS = ['EP', 'MP', 'HJ', 'CO', 'BTN', 'SB'], V3_FP = ['EP', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
function v3ExtraCards(x) {
  const c = DB.cols, { pick, RV, RA, RP, NR, NRg } = x, out = [];
  const posOf = (i) => (c.fp[i] >= 0 ? V3_FP[c.fp[i]] : null), bucket = (B, v) => { const k = B.findIndex(q => v >= q[1] && v < q[2]); return k < 0 ? null : B[k][0]; };
  const sec = (n, title, sub, ...body) => { const d = el('div', 'insight cc-table'); d.append(numTag(n), el('b', 'pm-title', title), el('span', 'sm-s', sub), ...body); return d; };
  const A = pick('S', 'T', 'B', 'P'); // частоты — без «нашего действия», как карточка 1

  // #18 — ваш ответ на 3-бет по позициям: фолд, колл, 4-бет, 4-бет олл-ином (таблица как в Hand2Note)
  {
    const g = { TOT: v3Cell() }; for (const i of A) { const p = posOf(i); v3Add(g.TOT, i, RV(i), c, EVcol()); if (p && V3_POS.includes(p)) v3Add(g[p] || (g[p] = v3Cell()), i, RV(i), c, EVcol()); }
    const cols = ['TOT'].concat(V3_POS.filter(p => g[p] && g[p].n));
    const R = [['fld', 'Фолд на ' + NR, 'amber', z => z.fld], ['call', 'Колл ' + NRg, 'ice', z => z.call], ['r4', '4-бет', 'ice', z => z.r4 + z.ai], ['ai', 'из них олл-ин', 'ice', z => z.ai]];
    const tbl = heatTable({ cols, groupGapBefore: cols.indexOf('SB'), rows: R.map(([k, lab, tone, f], ri) => ({ key: k, label: lab, tone, own: true, sub: ri === 3, data: Object.fromEntries(cols.map(col => [col, g[col] ? { x: f(g[col]), n: g[col].n } : null])) })) });
    tbl.querySelectorAll('td.c').forEach(td => { const z = g[td.dataset.col]; if (!z || !z.ids.length) return; const want = { fld: [0], call: [1], r4: [2, 3], ai: [3] }[td.dataset.row]; const ids = z.ids.filter(i => want.includes(RV(i))); if (!ids.length) return;
      const mx = Array.from({ length: 169 }, () => ({ n: 0, sum: 0, es: 0 })), EV = EVcol(); let sum = 0, es = 0; for (const i of ids) { const m = mx[c.hc[i]]; m.n++; m.sum += c.net[i]; m.es += EV[i]; sum += c.net[i]; es += EV[i]; }
      hoverHands(td, { p: td.dataset.col, anyPos: true, pre: true, key: 'v318' + td.dataset.row + td.dataset.col, title: R.find(q => q[0] === td.dataset.row)[1] + (td.dataset.col === 'TOT' ? ' (все позиции)' : ' с ' + td.dataset.col), o: { n: ids.length, sum, es }, mx, ids, vlab: ' BB за раздачу', nlab: ' раздач' }, sum / 10 / ids.length); });
    const d = el('div', 'insight cc-table'); d.append(numTag(18), el('span', 'k', 'Ваш ответ на ' + NR + ' по позициям'), el('span', 's', 'колонки — ваша позиция; в ячейке — % от раздач выборки, где вы получили ' + NR + ' (те же раздачи, что в карточке 1)'), tbl,
      infoNote('Фолд, колл и 4-бет (вместе с олл-ином) дают в сумме 100% по каждой колонке; «из них олл-ин» — часть 4-бетов. Наведите на ячейку — руки, которыми вы так ответили, и их итог; клик по руке откроет раздачи и реплеер. Бледные ячейки — меньше ' + cnt(SMALL, 'раздач', 'gen') + '. «Наше действие» не применяется — ответы и есть строки таблицы.'));
    out.push(d);
  }
  // #3 — вступили до вашего хода: вы открылись, пришёл 3-бет, и до вашего хода кто-то после 3-бетящего
  // (1) только заколлировал 3-бет — один или несколько, или (2) поставил поверх 4-бет — олл-ином или нет.
  // Только ваши открытия (вы коллер в сквиз-поте — не этот сценарий). Позиция — выбор в карточке; фильтры раздела S, T, B, P.
  {
    const base = A.filter(i => !x.isC(i)), pos = V3_POS.filter(p => base.some(i => posOf(i) === p && c.v3e[i] >= 1));
    if (V3_C3POS !== 'all' && !pos.includes(V3_C3POS)) V3_C3POS = 'all';
    const sel = V3_C3POS === 'all' ? base : base.filter(i => posOf(i) === V3_C3POS);
    const s1 = sel.filter(i => c.v3e[i] === 1), s2 = sel.filter(i => c.v3e[i] === 2), all = sel.length;
    const kOf = (i) => (c.v3k && c.v3k[i] >= 0 ? (c.v3k[i] >= 2 ? '2+' : '1') : null), xOf = (i) => (c.v3x && c.v3x[i] >= 0 ? c.v3x[i] : null);
    const g1 = v3Group(s1, kOf, RV), g2 = v3Group(s2, i => (xOf(i) === 1 ? 'ai' : xOf(i) === 0 ? 'nai' : null), RV), t1 = v3Group(s1, () => 't', RV).t, t2 = v3Group(s2, () => 't', RV).t;
    const perAct = (ids, labs) => v3PerAct(ids, labs, RV);
    const head = (lab, n) => { const h = el('div', 'v3e-hd'); h.append(el('b', null, lab), el('span', null, cnt(n, 'раз') + ' из ' + cnt(all, 'раздач', 'gen') + ' · ' + (all ? fmtPct(n / all) : '0') + '%')); return h; };
    const segP = segBtns([['all', 'Все']].concat(pos.map(p => [p, p])), V3_C3POS, (k) => { V3_C3POS = k; renderNext(); });
    const box = el('div', 'card-fill');
    const b1 = el('div', 'v3e-row'), b2 = el('div', 'v3e-row');
    b1.append(head('1. ' + NR + ' заколлировали после ' + (NR === 'сквиз' ? 'сквизера' : '3-бетящего'), s1.length), v3RespTable([['1 коллер', g1['1']], ['2+ коллера', g1['2+']], ['Всего', t1]], 'Кто вступил', NR, 'v33a' + V3_C3POS), s1.length ? perAct(s1, ['фолд', 'колл', '4-бет']) : el('span'));
    b2.append(head('2. Поверх ' + NRg + ' 4-бет', s2.length), v3RespTable([['4-бет не олл-ин', g2.nai], ['4-бет олл-ин', g2.ai], ['Всего', t2]], 'Что поставили', NR, 'v33b' + V3_C3POS, ['Фолд', 'Колл', '5-бет', '5-бет олл-ин']), s2.length ? perAct(s2, ['фолд', 'колл', '5-бет']) : el('span'));
    box.append(el('span', 'mx-cap', 'Ваша позиция'), segP, b1, b2);
    const note = f3note(x);
    const c3 = card(3, 'Вступили до вашего хода', all ? '<em>' + fmtPct((s1.length + s2.length) / all) + '%</em>' : '<span class="muted">—</span>', all ? cnt(s1.length + s2.length, 'раз') + ' из ' + cnt(all, 'раздач', 'gen') + ', где вы открылись и получили ' + NR : note || 'нет раздач', box);
    c3.append(infoNote('Вы открылись, пришёл ' + NR + ', и ДО вашего хода в банк вступил кто-то после ' + (NR === 'сквиз' ? 'сквизера' : '3-бетящего') + '. Сценарий 1 — его только заколлировали (один или несколько игроков; короткий олл-ин не больше ' + NRg + ' — тоже колл). Сценарий 2 — поверх поставили 4-бет: «олл-ин» — пуш или ставка на весь стек того, кто 4-бетил. Ваши реакции: в первом — фолд, колл (овер-колл) или 4-бет; во втором — фолд, колл или 5-бет. Строка «Итог по реакциям» — сколько в среднем приносит каждая ваша реакция. Наведите на строку таблицы — руки и итог; клик по руке откроет раздачи и реплеер. Фильтры раздела: ваш стек, тип ' + NRg + ' соперника, тип банка («1vs1» по смыслу пуст — там никто не вступал) и ваша позиция относительно ' + (NR === 'сквиз' ? 'сквизера' : '3-бетящего') + '; «Наше действие» не применяется — ваши реакции и есть содержимое карточки.'));
    out.push(c3);
  }
  // #16 — против размера 3-бета: фолд на 3-бет и 4-бет без позиции и в позиции (как таблица «vs Size»), внизу — фолд на 5-бет
  {
    const base = pick('S', 'T', 'B').filter(i => !x.isC(i) && c.v3z && c.v3z[i] > 0 && c.size[i] > 0);
    const SZ = ['до ×2', '×2,5', '×3', '×3,5', '×4', '×4,5', '×5', '×5,5+', 'олл-ин'];
    const rowOf = (i) => (RA(i) === 1 ? 8 : Math.max(0, Math.min(7, Math.round(c.v3z[i] / c.size[i] * 2) - 4)));
    const G = { OOP: SZ.map(v3Cell), IP: SZ.map(v3Cell) }, F5 = { OOP: { x: 0, n: 0 }, IP: { x: 0, n: 0 } }, EV = EVcol();
    for (const i of base) { const side = RP(i) === 1 ? 'IP' : RP(i) === 0 ? 'OOP' : null; if (!side) continue; v3Add(G[side][rowOf(i)], i, RV(i), c, EV); if (c.v3f && c.v3f[i] >= 0) { F5[side].n++; if (c.v3f[i] === 0) F5[side].x++; } }
    const t = el('table', 'ht v3-sz'), h1 = el('tr'), h2 = el('tr');
    h1.append(el('th'), el('th', 'grp', 'Без позиции (OOP)'), el('th', 'gap'), el('th', 'grp', 'В позиции (IP)')); h1.children[1].colSpan = 2; h1.children[3].colSpan = 2;
    h2.append(el('th', null, 'Размер 3-бета'), el('th', null, 'Фолд'), el('th', null, '4-бет'), el('th', 'gap'), el('th', null, 'Фолд'), el('th', null, '4-бет'));
    const th = el('thead'); th.append(h1, h2); t.append(th); const tb = el('tbody');
    const cell = (z, kind, side, lab) => { const td = el('td', 'c'); if (!z.n) { td.textContent = '—'; td.classList.add('na'); return td; } const v = kind === 'f' ? z.fld / z.n : (z.r4 + z.ai) / z.n; td.append(el('b', null, fmtPct(v)), el('span', 'n', z.n)); heat(td, v, 1, kind === 'f' ? 'amber' : 'ice'); if (z.n < 20) td.classList.add('low');
      if (z.ids.length) hoverHands(td, { p: side, anyPos: true, pre: true, key: 'v316' + side + lab, title: 'Против 3-бета ' + lab + ' · ' + (side === 'IP' ? 'в позиции' : 'без позиции'), o: { n: z.ids.length, sum: z.sum, es: z.es }, mx: z.mx, ids: z.ids, vlab: ' BB за раздачу', nlab: ' раздач' }, z.sum / 10 / z.n); return td; };
    SZ.forEach((lab, k) => { if (!G.OOP[k].n && !G.IP[k].n) return; const tr = el('tr'); tr.append(el('th', null, lab), cell(G.OOP[k], 'f', 'OOP', lab), cell(G.OOP[k], '4', 'OOP', lab), el('td', 'gap'), cell(G.IP[k], 'f', 'IP', lab), cell(G.IP[k], '4', 'IP', lab)); tb.append(tr); });
    { const tr = el('tr', 'v3-f5'); const f5 = (z) => { const td = el('td', 'c'); td.colSpan = 2; if (!z.n) { td.textContent = '—'; return td; } td.append(el('b', null, fmtPct(z.x / z.n) + '%'), el('span', 'n', z.n)); heat(td, z.x / z.n, 1, 'amber'); if (z.n < 20) td.classList.add('low'); return td; }; tr.append(el('th', null, 'Фолд на 5-бет'), f5(F5.OOP), el('td', 'gap'), f5(F5.IP)); tb.append(tr); }
    t.append(tb);
    const d = el('div', 'insight cc-table'); d.append(numTag(16), el('b', 'pm-title', 'Против размера 3-бета'), el('span', 'sm-s', 'как часто вы сбрасываете и 4-бетите против 3-бета разного размера — без позиции и в позиции'), t,
      infoNote('Размер — 3-бет соперника, делённый на ваше открытие, округлённый до 0,5 (×3 — в три раза больше открытия); олл-ин — отдельной строкой. Фолд и 4-бет — доля ваших ответов, %; справа в ячейке мелко — число раздач. «Фолд на 5-бет» — как часто вы сбросили, когда после вашего 4-бета соперник поставил 5-бет. В позиции / без позиции — относительно 3-бетящего после флопа (поэтому фильтр «наша позиция» здесь не действует — он и есть колонки). Наведите на ячейку — руки этих раздач и итог. Бледные ячейки — меньше 20 раздач. Только ваши открытия (в сквиз-поте, где вы коллер, нет вашего размера открытия).'));
    out.push(d);
  }

  // #17 — ваша реакция на 3-бет по позициям в зависимости от размера вашего открытия (как таблица «F to 3B aft. OR»)
  {
    const base = A.filter(i => !x.isC(i) && c.size[i] > 0), OSZ = [['2–2,1 BB', 0, 215], ['2,1–2,5 BB', 215, 255], ['2,5–3,5 BB', 255, 355], ['3,5+ BB', 355, 1e9]];
    const g = {}; for (const i of base) { const k = OSZ.findIndex(q => c.size[i] >= q[1] && c.size[i] < q[2]), p = posOf(i); if (k < 0 || !p) continue; for (const col of ['TOT', p]) { const row = g[k] || (g[k] = {}); v3Add(row[col] || (row[col] = v3Cell()), i, RV(i), c, EVcol()); } }
    const cols = ['TOT'].concat(V3_POS.filter(p => Object.values(g).some(r => r[p] && r[p].n)));
    const M = { f: ['Фолд', z => z.fld], c: ['Колл', z => z.call], r: ['4-бет', z => z.r4 + z.ai] }, body = el('div');
    const draw = () => { const m = M[V3_OSZM]; const tbl = heatTable({ cols, rows: OSZ.map((q, k) => g[k] ? { key: String(k), label: q[0], tone: V3_OSZM === 'f' ? 'amber' : 'ice', data: Object.fromEntries(cols.map(col => [col, g[k][col] ? { x: m[1](g[k][col]), n: g[k][col].n } : null])) } : null).filter(Boolean) });
      tbl.querySelectorAll('td.c').forEach(td => { const z = g[td.dataset.row] && g[td.dataset.row][td.dataset.col]; if (!z || !z.ids.length) return; hoverHands(td, { p: td.dataset.col, anyPos: true, pre: true, key: 'v317' + td.dataset.row + td.dataset.col, title: 'Открытие ' + OSZ[+td.dataset.row][0] + (td.dataset.col === 'TOT' ? '' : ' с ' + td.dataset.col) + ' → ' + NR, o: { n: z.ids.length, sum: z.sum, es: z.es }, mx: z.mx, ids: z.ids, vlab: ' BB за раздачу', nlab: ' раздач' }, z.sum / 10 / z.n); });
      body.replaceChildren(Object.keys(g).length ? tbl : el('p', 'muted small', 'Нет раздач в выборке.')); };
    draw();
    const d = el('div', 'insight cc-table'); d.append(numTag(17), el('b', 'pm-title', 'Реакция на ' + NR + ' по размеру вашего открытия'), el('span', 'sm-s', 'строки — до скольких BB вы открылись, колонки — ваша позиция'),
      segBtns([['f', 'Фолд'], ['c', 'Колл'], ['r', '4-бет']], V3_OSZM, (k) => { V3_OSZM = k; draw(); }), body,
      infoNote('В ячейке — доля выбранной реакции (фолд, колл или 4-бет вместе с олл-ином) от раздач, где вы открылись таким размером и получили ' + NR + '; справа мелко — число раздач. Бледные ячейки — меньше ' + cnt(SMALL, 'раздач', 'gen') + '. Наведите на ячейку — руки и итог. Только ваши открытия.'));
    out.push(d);
  }
  // #6 — фолд на 3-бет: ваша позиция × позиция 3-бетящего
  {
    const g = {}; for (const i of A) { const p = posOf(i), q = x.isC(i) ? c.c3q[i] : c.v3q[i], op = q >= 0 ? V3_FP[q] : null; if (!p || !op) continue; const row = g[p] || (g[p] = {}), z = row[op] || (row[op] = v3Cell()); v3Add(z, i, RV(i), c, EVcol()); }
    const rows = V3_POS.filter(p => g[p]), cols = ['MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'].filter(op => rows.some(p => g[p][op] && g[p][op].n >= SMALL));
    const tbl = heatTable({ cols, noTot: true, rows: rows.map(p => ({ key: p, label: p, data: Object.fromEntries(cols.map(op => [op, g[p][op] ? { x: g[p][op].fld, n: g[p][op].n } : null])) })) });
    tbl.querySelectorAll('td.c').forEach(td => { const z = g[td.dataset.row] && g[td.dataset.row][td.dataset.col]; if (!z || !z.ids.length) return; hoverHands(td, { p: td.dataset.row, anyPos: true, pre: true, key: 'v36' + td.dataset.row + td.dataset.col, title: 'Вы ' + td.dataset.row + ' против ' + NRg + ' с ' + td.dataset.col, o: { n: z.ids.length, sum: z.sum, es: z.es }, mx: z.mx, ids: z.ids, vlab: ' BB за раздачу', nlab: ' раздач' }, z.sum / 10 / z.n); });
    out.push(sec(6, 'Фолд на ' + NR + ': ваша позиция против позиции ' + (NR === 'сквиз' ? 'сквизера' : '3-бетящего'), 'строки — где вы, колонки — кто ' + (NR === 'сквиз' ? 'сквизит' : '3-бетит') + '; в ячейке — как часто вы сбросили', tbl,
      infoNote('Показывает, от кого вы сдаётесь чаще всего: например, против 3-бета с блайндов многие фолдят больше, чем против 3-бета с BTN. Наведите на ячейку — руки этих раздач и итог; клик закрепит окно, клик по руке откроет раздачи. Бледные ячейки — меньше ' + cnt(SMALL, 'раздач', 'gen') + '.')));
  }
  // #7 — как часто вас 3-бетят: от ваших открытий не олл-ином, по позиции и по размеру открытия (только стек раздела)
  {
    const opens = x.idx.filter(i => c.sit[i] === 0 && c.act[i] === 2 && c.pos[i] !== 6 && PREDS(x, i)), byP = {}, byS = {};
    for (const i of opens) { const got = c.v3[i] >= 0 ? 1 : 0, p = posOf(i), sz = bucket(V3_SZ, c.size[i]); if (p) { const z = byP[p] || (byP[p] = { x: 0, n: 0 }); z.n++; z.x += got; } if (sz) { const z = byS[sz] || (byS[sz] = { x: 0, n: 0 }); z.n++; z.x += got; } }
    const tot = { x: opens.filter(i => c.v3[i] >= 0).length, n: opens.length };
    const t1 = heatTable({ cols: ['TOT'].concat(V3_POS.filter(p => byP[p])), rows: [{ key: 'p', label: 'Вас 3-бетят', data: Object.assign({ TOT: tot }, byP) }] });
    const t2 = heatTable({ cols: V3_SZ.map(z => z[0]).filter(k => byS[k]), noTot: true, rows: [{ key: 's', label: 'по размеру открытия', data: byS }] });
    out.push(sec(7, 'Как часто вас 3-бетят', 'доля ваших открытий не олл-ином, на которые пришёл 3-бет (или сквиз)', t1, el('span', 'resp-t', 'По размеру вашего открытия'), t2,
      infoNote('Считаются все ваши открытия не олл-ином (кроме BB). Если какой-то размер открытия 3-бетят заметно чаще — соперники видят в нём слабость или удобный момент. Из фильтров раздела действует только ваш стек: тип 3-бета, банк и позиция описывают уже случившийся 3-бет.')));
  }
  // #8 — по вашему стеку
  out.push(sec(8, 'Ответ на ' + NR + ' по вашему стеку', 'фолд, колл и 4-бет при разной глубине и что это приносит', v3RespTable(Object.entries(v3Group(A, i => bucket(V3_STK, c.bb[i] / 10), RV)).sort((a, b) => V3_STK.findIndex(z => z[0] === a[0]) - V3_STK.findIndex(z => z[0] === b[0])), 'Ваш стек', NR, 'v38'),
    infoNote('Стек — ваш стек в начале раздачи. Результат — средний итог раздачи после вашей реакции, факт / EV. Наведите на строку — руки и их итог. Бледные строки — меньше 30 раздач.')));
  // #9 — по стеку 3-бетящего
  out.push(sec(9, 'Против стека ' + (NR === 'сквиз' ? 'сквизера' : '3-бетящего'), 'как вы отвечаете короткому и глубокому ' + (NR === 'сквиз' ? 'сквизеру' : '3-бетящему'), v3RespTable(Object.entries(v3Group(A.filter(i => !x.isC(i)), i => c.v3s[i] >= 0 ? bucket(V3_STK, c.v3s[i] / 10) : null, RV)).sort((a, b) => V3_STK.findIndex(z => z[0] === a[0]) - V3_STK.findIndex(z => z[0] === b[0])), 'Его стек', NR, 'v39'),
    infoNote('Стек соперника в начале раздачи. Короткий 3-бетящий часто ставит всё — колл становится вопросом шансов банка; против глубокого важнее позиция и сила руки. Раздачи, где вы коллер (сквиз-пот), сюда не входят — стек сквизера в базе есть только для ваших открытий.')));
  // #10 — в позиции и без позиции (фильтр «наша позиция» не действует — он и есть строки)
  out.push(sec(10, 'В позиции и без позиции', 'ваша реакция, когда после флопа вы ходите после ' + (NR === 'сквиз' ? 'сквизера' : '3-бетящего') + ' и до него', v3RespTable(['IP', 'OOP'].map(k => [k === 'IP' ? 'В позиции' : 'Без позиции', v3Group(pick('S', 'T', 'B'), i => RP(i) === 1 ? 'IP' : RP(i) === 0 ? 'OOP' : null, RV)[k]]), 'Позиция', NR, 'v310'),
    infoNote('В позиции колл 3-бета обычно выгоднее: вы ходите последним на всех улицах. Если без позиции вы коллируете так же часто, как в позиции, а результат колла заметно хуже — стоит чаще 4-бетить или сбрасывать.')));
  // #11 — против олл-ина и не олл-ина (фильтр типа не действует — он и есть строки)
  out.push(sec(11, 'Против олл-ина и обычного ' + NRg, 'колл пуша — вопрос шансов банка, ответ на обычный ' + NR + ' — вопрос стратегии', v3RespTable([['Не олл-ин', 0], ['Олл-ин', 1]].map(([lab, k]) => [lab, v3Group(pick('S', 'B', 'P'), i => RA(i) === k ? 'x' : null, RV).x]), 'Тип ' + NRg, NR, 'v311'),
    infoNote('«Олл-ин» — эффективный: пуш, ставка на весь стек соперника или ставка, покрывающая ваш стек. В строке «Олл-ин» колонка «Колл» — как часто вы коллируете пуш; результат колла пуша лучше смотреть по EV, он не зависит от раздачи карт на борде.')));
  // #12 — результат по группам рук и реакции
  {
    const g = {}; for (const i of A) { if (c.hc[i] < 0) continue; const k = handGroup(c.hc[i]), v = RV(i), col = v === 0 ? 'Фолд' : v === 1 ? 'Колл' : '4-бет'; const row = g[k] || (g[k] = {}); v3Add(row[col] || (row[col] = v3Cell()), i, v, c, EVcol()); }
    const cols = ['Фолд', 'Колл', '4-бет'], t = el('table', 'ht v3-grp'), hr = el('tr'); hr.append(el('th', null, 'Группа рук')); cols.forEach(k => hr.append(el('th', null, k))); const th = el('thead'); th.append(hr); t.append(th);
    const tb = el('tbody');
    HAND_GROUPS.forEach((G, k) => { const row = g[k]; if (!row) return; const tr = el('tr'); tr.append(el('th', null, G[0])); cols.forEach(col => { const z = row[col], td = el('td', 'c'); if (z && z.n) { const sh = el('b', null, fmtPct(z.n / cols.reduce((a, q) => a + (row[q] ? row[q].n : 0), 0)) + '%'); const wr = wrNode('wr', z.sum / 10 / z.n, z.es / 10 / z.n, 2); td.append(sh, wr, el('span', 'n', z.n)); if (z.n < 30) td.classList.add('low'); hoverHands(td, { p: G[0], anyPos: true, pre: true, key: 'v312' + k + col, title: G[0] + ' · ' + col.toLowerCase() + ' на ' + NR, o: { n: z.ids.length, sum: z.sum, es: z.es }, mx: z.mx, ids: z.ids, vlab: ' BB за раздачу', nlab: ' раздач' }, z.sum / 10 / z.n); } else td.append('—'); tr.append(td); }); tb.append(tr); });
    t.append(tb);
    out.push(sec(12, 'Реакция по группам рук', 'как часто каждой группой вы сбрасываете, коллируете и 4-бетите и что это приносит', t,
      infoNote('В ячейке: сверху — доля этой реакции внутри группы рук, ниже — средний итог в BB (факт / EV), справа мелко — число раздач. Так видно, например, сбрасываете ли вы средние пары на 3-бет и окупаются ли коллы с A2s–A9s. Наведите на ячейку — руки и итог.')));
  }
  // #13 — сильные руки в фолд и слабые в продолжение
  {
    const H = Array.from({ length: 169 }, () => ({ n: 0, fld: 0, go: 0, sum: 0, es: 0, idsF: [], idsG: [] })), EV = EVcol();
    for (const i of A) { const k = c.hc[i]; if (k < 0) continue; const h = H[k], v = RV(i); h.n++; if (v === 0) { h.fld++; h.idsF.push(i); } else { h.go++; h.idsG.push(i); h.sum += c.net[i]; h.es += EV[i]; } }
    const list = (items, lab, kind) => { const box = el('div', 'v3-leak'); box.append(el('span', 'resp-t', lab)); if (!items.length) box.append(el('p', 'muted small', 'Таких рук нет.'));
      items.forEach(([k, h]) => { const b = el('button', 'v3-leak-r'); b.type = 'button'; const ids = kind === 'f' ? h.idsF : h.idsG; b.append(el('b', null, handName(k)), el('span', null, kind === 'f' ? fmtPct(h.fld / h.n) + '% фолд · ' + cnt(h.fld, 'раз') + ' из ' + h.n : fmtPct(h.go / h.n) + '% колл / 4-бет · ' + cnt(h.go, 'раз')));
        if (kind === 'g') b.append(wrNode('wr', h.sum / 10 / h.go, h.es / 10 / h.go, 2));
        b.onclick = () => openIdsList(handName(k) + (kind === 'f' ? ' · фолд на ' : ' · продолжили против ') + NRg, ids); box.append(b); }); return box; };
    const strong = H.map((h, k) => [k, h]).filter(([k, h]) => chenOf(k) >= 10 && h.fld > 0).sort((a, b) => b[1].fld - a[1].fld || b[1].fld / b[1].n - a[1].fld / a[1].n).slice(0, 8);
    const weak = H.map((h, k) => [k, h]).filter(([k, h]) => chenOf(k) <= 5 && h.go > 0).sort((a, b) => b[1].go - a[1].go).slice(0, 8);
    const grid = el('div', 'v3-leaks'); grid.append(list(strong, 'Сильные руки, которые вы сбросили', 'f'), list(weak, 'Слабые руки, которыми вы продолжили', 'g'));
    out.push(sec(13, 'Возможные утечки', 'сильные руки, которые уходят в фолд, и слабые, с которыми вы продолжаете', grid,
      infoNote('Сила руки — по формуле Чена (стандартная оценка стартовых рук): «сильные» — 10 очков и больше (например, 99+, AK, AQ, AJs, KQs), «слабые» — 5 и меньше. Показаны по 8 рук с наибольшим числом таких раздач; для слабых — итог продолжения (факт / EV). Клик по руке откроет эти раздачи и реплеер.')));
  }
  // #14 — по месяцам: частоты (без «нашего действия») и результат (с ним)
  {
    const byM = v3Group(A, i => c.month[i], RV), byMR = v3Group(pick('S', 'T', 'B', 'P', 'A'), i => c.month[i], RV), ms = Object.keys(byM).map(Number).sort((a, b) => a - b).filter(m => byM[m].n >= 10);
    let body;
    if (ms.length < 2) body = el('p', 'muted small', 'Для динамики нужно хотя бы два месяца по 10+ раздач.');
    else {
      body = el('div'); const lab = ms.map(m => { const t = monthLabel(m).split(' '); return t[0] + ' ' + t[1].slice(2); });
      const step = Math.ceil(lab.length / 7), labX = lab.map((t, q) => (q % step === 0 ? t : '')); const ch = el('div', 'v3-chart'); body.append(ch); ch.append(linesChart(labX, [{ values: ms.map(m => byM[m].fld / byM[m].n), color: 'var(--good)' }, { values: ms.map(m => byM[m].call / byM[m].n), color: 'var(--ice)' }, { values: ms.map(m => (byM[m].r4 + byM[m].ai) / byM[m].n), color: 'var(--bad)' }], 'Фолд, колл и 4-бет по месяцам')); body.append(
        legend([{ label: 'фолд', color: 'var(--good)' }, { label: 'колл', color: 'var(--ice)' }, { label: '4-бет', color: 'var(--bad)' }]));
      const t = el('div', 'v3-months'); ms.forEach((m, q) => { const z = byMR[m]; const d = el('div'); d.append(el('span', null, lab[q]), z && z.n ? wrNode('wr', z.sum / 10 / z.n, z.es / 10 / z.n, 1) : el('span', 'muted', '—'), el('small', null, z ? cnt(z.n, 'раздач') : '')); t.append(d); }); body.append(t);
    }
    out.push(sec(14, 'По месяцам', 'меняется ли ваша игра против ' + NRg + ' со временем', body, infoNote('Линии — доля фолда, колла и 4-бета в каждом месяце (по всем реакциям). Под графиком — результат за месяц в BB за раздачу, факт / EV; он учитывает фильтр «Наше действие». Месяцы меньше чем с 10 раздачами не показаны.')));
  }
  // #15 — по румам
  out.push(sec(15, 'По румам', 'где вы отвечаете на ' + NR + ' иначе и где это работает лучше', v3RespTable(Object.entries(v3Group(A, i => DB.rooms[c.room[i]] || null, RV)).sort((a, b) => b[1].n - a[1].n), 'Рум', NR, 'v315'),
    infoNote('В разных румах разные соперники и структуры: сравните, где вы сбрасываете чаще и где колл приносит больше. Результат — по всем реакциям выбранной выборки. Бледные строки — меньше 30 раздач.')));
  return out;
}
// #7: из фильтров раздела — только ваш стек (как у карточки 7 в таблице CARD_FILTERS)
function PREDS(x, i) { const sr = x.sr; return !sr || (DB.cols.bb[i] >= sr[0] * 10 && DB.cols.bb[i] < sr[1] * 10); }
