'use strict';
/* global mda, Stats */
// Вкладка «Против 3-бета» (v3B).
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
  const c1 = card(1, 'Фолдите на ' + NR, '<em>' + fmtPct(ta.fld / ta.n) + '%</em>', 'из ' + ta.n.toLocaleString('ru-RU') + ' ' + UNIT,
    fillBox(posStrip('Фолд по позициям', posRows), respTiles(rA.resp, 'Ваш ответ на ' + NR, [['фолд', 'var(--good)'], ['колл', 'var(--ice)'], ['4-бет', 'var(--bad)']])));
  // #2 — результат вашей реакции на 3-бет по позициям, факт / EV; действия задаёт фильтр «Наше действие» (по умолчанию — все)
  const pos = ['TOT'].concat(r.V3B_POS).filter(p => r.d[p].n >= 1);
  const items = pos.map(p => { const z = r.d[p]; return { p, anyPos: true, pre: true, key: 'v3 ' + p + (sr ? ' ' + sr.join('-') : '') + T.ty + f.A.join('+') + f.B + (f.SQ || []).join(''), title: 'Ваша реакция на ' + NR + (p === 'TOT' ? ' (все позиции)' : ' с ' + p), o: { n: z.n, sum: z.sum, es: z.es }, mx: z.mx, ids: z.ids, vlab: ' BB за раздачу', nlab: ' раздач' }; }); // pre — раздачи уже отобраны фильтрами (asR открыватели и asC коллеры вперемешку)
  LAST_NET_ITEMS = items;
  const avg = t.n ? t.sum / 10 / t.n : null, avgE = t.n ? t.es / 10 / t.n : null;
  const chartBox = el('div'); chartBox.append(netChart(items, avg, 'EV реакции на ' + NR));
  const c2 = card(2, 'Результат вашей реакции на ' + NR, wrHtml(avg, avgE, 2) + ' <small>BB за раздачу</small>', 'по ' + t.n.toLocaleString('ru-RU') + ' раздачам', chartBox);
  c2.classList.add('wide');
  c2.append(infoNote('Факт — средний итог этих раздач в BB (банк минус ваши вложения): сколько приносит выбранная реакция на 3-бет. EV — тот же итог с поправкой на эквити в раздачах, закончившихся олл-ином до ривера: карта выправляет удачу. Реакции задаёт фильтр «Наше действие» в шапке раздела — по умолчанию все ответы (фолд, колл, 4-бет, 4-бет олл-ином), можно сочетать, например оба 4-бета или фолд с коллом; на столбик можно навести и закрепить окно с руками, клик по руке откроет раздачи и реплеер.'));
  // #3 — за спиной вступили в 3-бет до вашего хода (без колла открытия): два класса — заколлировали 3-бет / переставили дальше
  const box3 = el('div', 'card-fill');
  const blk3 = (z, lab, hint) => {
    const b = el('div', 'v3e-row');
    const hd = el('div', 'v3e-hd');
    hd.append(el('b', null, lab), el('span', null, z.n.toLocaleString('ru-RU') + ' из ' + r.all.toLocaleString('ru-RU') + ' · ' + fmtPct(z.n / r.all) + '%'));
    hd.title = hint;
    const wr = z.sn ? z.sum / 10 / z.sn : null, we = z.sn ? z.es / 10 / z.sn : null;
    b.append(hd, respTiles([z.fld, z.call, z.r4], null, [['фолд', 'var(--good)'], ['колл', 'var(--ice)'], ['4-бет', 'var(--bad)']]), el('div', 'v3e-res', wrHtml(wr, we, 2) + ' <small>BB за раздачу</small>'));
    return b;
  };
  box3.append(
    // вы коллер: между сквизом и вашим ходом ходит и открывающий (он перед вами) — «за спиной» было бы неправдой
    blk3(r.e1.TOT, 'Кол ' + NRg + (withC ? ' до вашего хода' : ' за спиной'), 'До вашего хода ' + NR + ' заколлировал один или несколько соперников' + (withC ? ' (когда вы коллер — в том числе открывающий: он ходит между сквизом и вами)' : '') + '; короткий олл-ин, не превышающий размер ' + NRg + ', — тоже кол.'),
    blk3(r.e2.TOT, '4-бет ' + NRg + (withC ? ' до вашего хода' : ' за спиной'), 'До вашего хода кто-то переставил ' + NR + ' дальше' + (withC ? ' (когда вы коллер — в том числе открывающий)' : ' (холодный 4-бет)') + ', любой размер больше ' + NRg + '.'));
  const c3 = card(3, withC ? 'Вступили до вашего хода' : 'За спиной вступили', '<em>' + fmtPct((r.e1.TOT.n + r.e2.TOT.n) / r.all) + '%</em>', (r.e1.TOT.n + r.e2.TOT.n).toLocaleString('ru-RU') + ' из ' + r.all.toLocaleString('ru-RU') + ' ' + UNIT + ' ' + NRc, box3);
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
      el('span', 'muted small', '3-бетящий: ' + (sel.length ? sel.join(' + ') : 'любая позиция') + ', ' + rangeTxt(uiState.v3OStkR) + ' · вы: ' + rangeTxt(uiState.v3OMyR) + ' · ' + n.toLocaleString('ru-RU') + ' раз вы получали 3-бет'));
    side.append(infoNote('Задайте стек 3-бетящего и свой стек в BB: «от» и «до» можно заполнить оба или одно (пустое «до» — без верхней границы). Нажмите «Показать» — матрица покажет ваши ответы ровно в таких раздачах. «Сброс» возвращает «любой». Клетка закрашена слева направо на долю ответов этой рукой: янтарная часть — 4-бет, синяя — олл-ин, зелёная — колл, тёмная — фолд. Бледная заливка — меньше 5 раздач. Фильтры шапки раздела на эту карточку не действуют.'));
    body.append(side);
    c4.append(h, body);
  }
  // #5 — «чистые» споты 1vs1: открытие никто не коллировал (v3o=0) и до вашего хода после 3-бета никто не вступал
  // (v3c=0) — те же числа, что карточки 1–2 под фильтром «3b пот 1vs1», всегда рядом с ними, фильтр переключать не нужно.
  // Фильтры раздела — как у карточек 1–2: частоты без «нашего действия» (rA), результат — с ним (r)
  const cla = rA.cl.TOT, cl = r.cl.TOT;
  const c5body = cla.n ? fillBox(
    posStrip('Фолд по позициям', rA.V3B_POS.filter(p => rA.cl[p].n >= SMALL).map(p => { const z = rA.cl[p]; return [p, z.fld / z.n, p + ': ' + z.fld + ' из ' + z.n]; })),
    respTiles([cla.fld, cla.call, cla.r4], 'Ваш ответ на 3-бет', [['фолд', 'var(--good)'], ['колл', 'var(--ice)'], ['4-бет', 'var(--bad)']]),
    el('div', 'v3e-res', wrHtml(cl.sn ? cl.sum / 10 / cl.sn : null, cl.sn ? cl.es / 10 / cl.sn : null, 2) + ' <small>BB за раздачу</small>'))
    : el('p', 'muted small', 'В этой выборке нет чистых спотов 1vs1 — фильтр «тип трибет банка» отобрал другие банки.');
  const c5 = card(5, 'Чистые споты: фолд на 3-бет', cla.n ? '<em>' + fmtPct(cla.fld / cla.n) + '%</em>' : '<span class="muted">—</span>',
    cla.n ? 'из ' + cla.n.toLocaleString('ru-RU') + ' чистых спотов 1vs1' : 'нет чистых спотов', c5body);
  c5.append(infoNote('Чистый спот: вы открылись, никто не коллировал открытие, получил 3-бет — и до вашего хода больше никто не вступал. Ровно вы и 3-бетящий. Карточки 1–2 считают такие споты вместе с остальными (как в Hand2Note), эта — только чистые, чтобы сравнить. Частоты — по всем ответам; строка результата — с фильтром «Наше действие», как в карточке 2. Фильтры раздела действуют; те же числа с окнами рук, списками раздач и реплеером даст фильтр «тип трибет банка → 3b пот 1vs1» на карточках 1–2.'));
  const zone = el('div', 'summary'); const pair = el('div', 'sum-pair'); pair.append(c1, c2); zone.append(pair, c5, c4, c3);
  page.append(zone);
  return page;
}

