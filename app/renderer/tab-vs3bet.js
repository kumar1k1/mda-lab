'use strict';
/* global mda, Stats */
// Вкладка «Против 3-бета» (v3B).
// строка результата «факт / EV» — разметка (цвет плюса и минуса): el() кладёт текст как есть, и пользователь видел теги <span>
const htmlDiv = (cls, html) => { const d = el('div', cls); d.innerHTML = html; return d; };
// ---------- Против 3-бета: своё открытие и 3-бет соперника ----------
// Фильтры раздела: тип 3-бета соперника, наше действие на него и ваш стек — все отбирают раздачи целиком.
// Карточки 1–2 — все споты, как в Hand2Note (RF,RC,RR+): чужие коллы открытия и 3-бета не важны;
// карточка 13 — раздачи, где 3-бет кто-то заколлил за спиной; карточка 5 — те же частоты и результат
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
  // тип 3-бета соперника (сквиза для asC): олл-ин / не олл-ин — все карточки
  if (T.flt) idxS = idxS.filter(i => RA(i) >= 0 && (T.ty === 'ai' ? RA(i) === 1 : RA(i) === 0));
  // наша позиция относительно 3-бетящего/сквизера постфлоп (1 IP / 0 OOP) — все карточки
  if (f.P !== 'all') idxS = idxS.filter(i => RP(i) === (f.P === 'ip' ? 1 : 0));
  // тип 3-бет банка: 1vs1 — до вашего хода никто не вступил и открытие не коллировали (только asR);
  // сквиз пот — asR (ваше открытие заколлировали, сквиз поверх) и/или asC (вы коллер) — по подтумблерам;
  // раздачи, где за спиной вступили после 3-бета, — карточкой 13, в фильтр не входят
  if (f.B === 'hu') idxS = idxS.filter(i => !isC(i) && cb.v3o[i] === 0 && (cb.v3e ? cb.v3e[i] === 0 : cb.v3c[i] === 0));
  else if (f.B === 'sq') {
    const sq = f.SQ || ['r', 'c'];
    idxS = idxS.filter(i => (!isC(i) && cb.v3o[i] === 1 && sq.includes('r')) || (isC(i) && sq.includes('c')));
  } else idxS = idxS.filter(i => !isC(i)); // «Все» и остальные банки — только семейство открывателя (как в Hand2Note)
  const idxA = idxS; // карточка 1 — без «нашего действия»: частоты ответов по всем реакциям выбранного банка
  // «Наше действие» убрано из шапки (03.11.2026): ни одна карточка его не использовала
  const rA = Stats.v3b(DB, idxA);
  const r = Stats.v3b(DB, idxS);
  // подписи — по выборке: в «сквиз поте» соперник сквизит (а не 3-бетит), с подтумблером «вы коллер» в выборке не только ваши открытия
  const SQ = f.B === 'sq', SQS = f.SQ || ['r', 'c'], withC = SQ && SQS.includes('c'), onlyC = withC && !SQS.includes('r');
  const NR = SQ ? 'сквиз' : '3-бет', NRg = SQ ? 'сквиза' : '3-бета', NRc = SQ ? 'со сквизом' : 'с 3-бетом';
  const UNIT = onlyC ? 'ваших коллов открытия' : withC ? 'раздач' : 'открытий';
  const page = el('div', 'page');
  const head = el('div', 'page-head');
  const h1 = el('h1'); h1.append(document.createTextNode('Против 3-бета / сквиза '), el('span', null, 'v3B'));
  head.append(h1, el('p', null, (onlyC ? 'Как вы отвечаете на сквиз, когда заколлировали чужое открытие' : withC ? 'Как вы отвечаете на сквиз — после своего открытия и после колла чужого открытия' : SQ ? 'Как вы отвечаете на сквиз поверх своего открытия' : 'Как вы отвечаете на 3-бет на своё открытие') + ': фолд, колл и 4-бет по позициям и результат вашей реакции. Отдельно — раздачи, где до вашего хода вступил кто-то ещё.'));
  page.append(head);
  if (!cb.v3) { page.append(el('p', 'muted small', 'В этой базе нет колонок против 3-бета (собрана до 0.7.33). Обновление базы досчитает их из записей реплеера при следующем запуске программы.')); return page; }
  const t = r.d.TOT, ta = rA.d.TOT;
  if (!rA.all) { page.append(el('p', 'muted small', 'Нет ' + UNIT + ' ' + NRc + ' в этой выборке.')); return page; }
  // #1 «Фолдите на 3-бет» — v3Card1 (0.7.56): переключатель «Все споты / Только чистые 1vs1», таблица по позициям с окнами рук
  // #2 «Результат вашей реакции» объединена с карточкой 1 (0.7.56): итог каждой реакции по позициям — в таблице карточки 1
  // #13 «Вступили до вашего хода» и «Против размера 3-бета» — в v3ExtraCards (0.7.55), с выбором вашей позиции
  // #2 — «Ваш ответ против трибета агрессора»: матрица рук (4-бет / олл-ин / колл / фолд) при заданных
  // вашей позиции, позиции 3-бетящего, его стеке и вашем стеке; фильтры шапки раздела НЕ действуют —
  // только основные фильтры проекта (рум, период, бай-ин, столы)
  const v3oOpt = { v3oPos: uiState.v3OPos, v3oStk: uiState.v3OStkR, v3oMy: uiState.v3OMyR, v3oOpen: uiState.v3OOpen };
  const rV = Stats.v3b(DB, idx, v3oOpt); // #2 — по всем раздачам вкладки (idx до фильтров раздела), фильтры шапки раздела не действуют
  const c4 = el('section', 'block cc-table'); c4.append(numTag(2));
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
  // #3–#13 — карточки-предложения (0.7.55): отбор фильтрами раздела по таблице CARD_FILTERS — pick('S', 'T'…) пропускает
  // раздачи только через названные фильтры (те же правила, что выше у idxS)
  const PRED = {
    S: i => !sr || (cb.bb[i] >= sr[0] * 10 && cb.bb[i] < sr[1] * 10),
    T: i => !T.flt || (RA(i) >= 0 && (T.ty === 'ai' ? RA(i) === 1 : RA(i) === 0)),
    P: i => f.P === 'all' || RP(i) === (f.P === 'ip' ? 1 : 0),
    B: i => f.B === 'hu' ? !isC(i) && cb.v3o[i] === 0 && (cb.v3e ? cb.v3e[i] === 0 : cb.v3c[i] === 0) : f.B === 'sq' ? ((!isC(i) && cb.v3o[i] === 1 && (f.SQ || ['r', 'c']).includes('r')) || (isC(i) && (f.SQ || ['r', 'c']).includes('c'))) : !isC(i)
  };
  const spot = idx.filter(i => cb.v3[i] >= 0 || isC(i));
  const pick = (...L) => spot.filter(i => L.every(k => PRED[k](i)));
  const extra = v3ExtraCards({ idx, spot, pick, RV, RA, RP, isC, NR, NRg, sr, T });
  const c1 = v3Card1({ pick, RV, isC, NR, UNIT });
  extra.sort((a, b) => +a.querySelector('.num-tag').textContent.slice(1) - +b.querySelector('.num-tag').textContent.slice(1)); // по номеру: #3 … #13
  const zone = el('div', 'summary'); zone.append(c1, c4, ...extra); // #5 «Чистые споты» убрана (0.7.56) — теперь это переключатель карточки 1
  page.append(zone);
  return page;
}


// ---------- #3–#13: карточки-предложения «Против 3-бета» ----------
// Общий счётчик ответа: n — раздач, fld / call / r4 (4-бет не олл-ином) / ai (4-бет олл-ином), sum / es — итог в BB×10 (факт / EV),
// ids и mx — для окна рук при наведении (как у карточки 2).
function v3Cell() { return { n: 0, fld: 0, call: 0, r4: 0, ai: 0, sum: 0, es: 0, act: [0, 1, 2, 3].map(() => ({ sum: 0, es: 0 })), ids: [], mx: Array.from({ length: 169 }, () => ({ n: 0, sum: 0, es: 0, x: 0, ai: 0, lp: 0 })) }; } // mx: x — рейз (из них ai — олл-ин), lp — колл; остальное — фолд (для окна «Диапазон»)
function v3Add(z, i, v, c, EV) {
  z.n++; if (v === 0) z.fld++; else if (v === 1) z.call++; else if (v === 3) z.ai++; else z.r4++;
  const nv = c.net ? c.net[i] : 0, ne = c.net ? EV[i] : 0; z.sum += nv; z.es += ne;
  { const q = z.act[v === 0 ? 0 : v === 1 ? 1 : v === 3 ? 3 : 2]; q.sum += nv; q.es += ne; } // итог каждой реакции отдельно: фолд / колл / рейз / рейз олл-ином
  if (c.hc[i] >= 0) { z.ids.push(i); const m = z.mx[c.hc[i]]; m.n++; m.sum += nv; m.es += ne; if (v === 1) m.lp++; else if (v >= 2) { m.x++; if (v === 3) m.ai++; } }
}
function v3Group(ids, keyOf, RV) {
  const c = DB.cols, EV = EVcol(), out = {};
  for (const i of ids) { const k = keyOf(i); if (k == null) continue; v3Add(out[k] || (out[k] = v3Cell()), i, RV(i), c, EV); }
  return out;
}
// таблица «строка — ответ на 3-бет»: раз, фолд, колл, 4-бет, 4-бет олл-ин, результат; наведение — руки этих раздач и итог
// Таблица «строка — ваша реакция»: раз и доля раздач; по каждой реакции — доля и ОДНО число — средний итог этой реакции
// (EV или факт — переключатель над таблицей, общий для раздела); последняя колонка — в среднем за раздачу.
// Наведение на строку — руки этих раздач и итог; клик по руке — раздачи и реплеер.
function v3RespTable(rows, title, NR, keyPre, heads) {
  const isTot = (lab) => /^Вс[её]/.test(lab), totRow = rows.find(r => isTot(r[0]) && r[1]);
  const tot = totRow ? totRow[1].n : rows.reduce((a, r) => a + (r[1] ? r[1].n : 0), 0);
  if (!tot) return el('p', 'muted small', 'Нет раздач в выборке.');
  const ev = VAL_MODE === 'ev', val = (q, n) => (n ? (ev ? q.es : q.sum) / 10 / n : null);
  const H = heads || ['Фолд', 'Колл', '4-бет', 'Олл-ин'], COL = ['var(--good)', 'var(--ice)', 'var(--bad)', 'var(--amber)'];
  const box = el('div', 'v3-rt-box');
  const seg = valSeg(); seg.classList.add('v3-rt-seg');
  const t = el('table', 'ht v3-rt'), hr = el('tr');
  [title, 'Раз'].concat(H).concat(['В среднем']).forEach((h, k) => { const th = el('th', k >= 2 ? 'num' : null, h); if (h === 'В среднем') th.title = 'Средний итог одной раздачи по всем вашим реакциям, ' + (ev ? 'EV' : 'факт') + ', BB'; hr.append(th); });
  const th = el('thead'); th.append(hr); t.append(th); const tb = el('tbody');
  rows.forEach(([lab, z]) => {
    if (!z || !z.n) return;
    const tr = el('tr', isTot(lab) ? 'tot' : ''); if (z.n < 30) tr.classList.add('low');
    const tdN = el('td', 'n'); tdN.append(el('b', null, z.n.toLocaleString('ru-RU')), el('small', null, fmtPct(z.n / tot) + '%'));
    tr.append(el('th', null, lab), tdN);
    [z.fld, z.call, z.r4, z.ai].forEach((cn, k) => {
      const td = el('td', 'num'), p = el('b', null, fmtPct(cn / z.n) + '%'); p.style.color = COL[k]; td.append(p);
      const v = val(z.act[k], cn); if (v != null) { const x = el('span', 'v ' + (v >= 0 ? 'up' : 'down'), signed(v, 2)); td.append(x); td.title = H[k] + ': ' + cnt(cn, 'раз') + ' · в среднем ' + signed(z.act[k].sum / 10 / cn, 2) + ' BB факт, ' + signed(z.act[k].es / 10 / cn, 2) + ' BB EV'; }
      tr.append(td);
    });
    const a = val(z, z.n), tdA = el('td', 'num avg'), ax = el('b', a >= 0 ? 'up' : 'down', signed(a, 2)); tdA.append(ax); tdA.title = 'В среднем за раздачу: ' + signed(z.sum / 10 / z.n, 2) + ' BB факт, ' + signed(z.es / 10 / z.n, 2) + ' BB EV; всего ' + signed(z.sum / 10, 0) + ' / ' + signed(z.es / 10, 0) + ' EV'; tr.append(tdA);
    // наведение — окно «Диапазон» (какими руками фолд / колл / рейз); клик — закрепить, в окне переключатель «Диапазон / Факт, BB / EV, BB», клик по руке — раздачи и реплеер
    if (z.ids.length) {
      tr.classList.add('click'); tr.tabIndex = 0;
      const rl = (H[2] || '4-бет').toLowerCase(), zz = { n: z.n, rmx: z.mx, rids: z.ids, labels: [rl, 'олл-ин', 'колл', 'фолд'], capAll: 'все ваши ответы', foldPaint: true }, wt = 'Ваша реакция на ' + NR + ' · ' + lab;
      tr.addEventListener('mouseenter', (e) => showSzMx(wt, zz, tr, e)); tr.addEventListener('mousemove', (e) => { if (!SZMX_PIN && szMx && !szMx.hidden) placeSzMx(tr, e); }); tr.addEventListener('mouseleave', hideSzMx);
      tr.addEventListener('click', (e) => pinSzMx(wt, zz, tr, e)); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pinSzMx(wt, zz, tr); } });
    }
    tb.append(tr);
  });
  t.append(tb); box.append(seg, t);
  return box;
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
// плитки ответа (фолд / колл / 4-бет): доля и прямо под ней средний итог этой реакции в BB за раздачу, факт / EV
function v3Tiles(ids, RV, title, labs) {
  const c = DB.cols, EV = EVcol(), z = [0, 1, 2].map(() => ({ n: 0, sum: 0, es: 0 })), n = ids.length;
  for (const i of ids) { const v = RV(i), k = v === 0 ? 0 : v === 1 ? 1 : 2; z[k].n++; z[k].sum += c.net[i]; z[k].es += EV[i]; }
  const rs = el('div', 'resp'), rl = el('div', 'resp-tiles');
  [['фолд', 'var(--good)'], ['колл', 'var(--ice)'], ['4-бет', 'var(--bad)']].map(([l, col], k) => [labs ? labs[k] : l, col]).forEach(([lab, col], k) => {
    const q = z[k], it = el('span', 'resp-tile'), b = el('b', null, n ? fmtPct(q.n / n) + '%' : '—'); b.style.color = col;
    it.append(b, el('span', null, lab), q.n ? wrNode('rt-wr', q.sum / 10 / q.n, q.es / 10 / q.n, 2) : el('span', 'rt-wr muted', '—'));
    it.title = cnt(q.n, 'раз') + ' из ' + n.toLocaleString('ru-RU') + (q.n ? ' · в среднем ' + signed(q.sum / 10 / q.n, 2) + ' BB факт, ' + signed(q.es / 10 / q.n, 2) + ' BB EV за раздачу' : '');
    rl.append(it);
  });
  if (title) rs.append(el('span', 'resp-t', title));
  rs.append(rl); return rs;
}
// «Итог по реакциям»: средний результат каждой вашей реакции (фолд / колл / рейз), факт / EV, и число раздач
function v3PerAct(ids, labs, RV) {
  const c = DB.cols, EV = EVcol(), z = [0, 1, 2].map(() => ({ n: 0, sum: 0, es: 0 }));
  for (const i of ids) { const v = RV(i), k = v === 0 ? 0 : v === 1 ? 1 : 2; z[k].n++; z[k].sum += c.net[i]; z[k].es += EV[i]; }
  const d = el('div', 'v3-peract'); d.append(el('span', 'muted small', 'Итог по реакциям, BB за раздачу:'));
  z.forEach((q, k) => { const b = el('span'); b.append(el('b', null, labs[k] + ' '), q.n ? wrNode('wr', q.sum / 10 / q.n, q.es / 10 / q.n, 2) : el('span', 'muted', '—'), el('small', null, ' · ' + cnt(q.n, 'раз'))); d.append(b); });
  return d;
}
// #1 — ваш ответ на 3-бет: фолд, колл, 4-бет. Переключатель: «Все споты» — как в Hand2Note (все открытия, получившие 3-бет:
// со сквизами и вступившими за спиной) или «Только чистые 1vs1» — вы открылись, открытие никто не коллировал, пришёл 3-бет
// и до вашего хода никто не вступал (ровно вы и 3-бетящий; раньше это была отдельная карточка 5).
// Фильтры раздела: стек, тип 3-бета соперника, IP / OOP; «тип трибет банка» — только для «Все споты» (чистые споты сами и есть
// банк 1vs1); «наше действие» — нет: ваши реакции и есть содержимое карточки.
let V3_C1MODE = 'all';
// раздачи карточек 1 и 2.1: «Все споты» (S, T, B, P) или «Только чистые 1vs1» (S, T, P + чистый спот)
function v3C1Ids(x) { const c = DB.cols; return V3_C1MODE === 'clean' ? x.pick('S', 'T', 'P').filter(i => !x.isC(i) && c.v3o[i] === 0 && (c.v3e ? c.v3e[i] === 0 : c.v3c[i] === 0)) : x.pick('S', 'T', 'B', 'P'); }
// таблица карточки 1: по вашей позиции — доля фолда / колла / 4-бета и средний итог каждой реакции (факт / EV), справа — итог всех раздач
function v3PosTable(x, ids) {
  const c = DB.cols, EV = EVcol(), NR = V3_C1MODE === 'clean' ? '3-бет' : x.NR, posOf = (i) => (c.fp[i] >= 0 ? V3_FP[c.fp[i]] : null);
  const cell = () => [0, 1, 2].map(() => ({ n: 0, sum: 0, es: 0, ids: [], mx: Array.from({ length: 169 }, () => ({ n: 0, sum: 0, es: 0 })) }));
  const G = { all: cell() }, N = { all: 0 }, T = {};
  for (const i of ids) { const v = x.RV(i), k = v === 0 ? 0 : v === 1 ? 1 : 2, p = posOf(i); for (const key of ['all'].concat(p && V3_POS.includes(p) ? [p] : [])) { const z = (G[key] || (G[key] = cell()))[k]; N[key] = (N[key] || 0) + 1; const tt = T[key] || (T[key] = { sum: 0, es: 0 }); tt.sum += c.net[i]; tt.es += EV[i]; z.n++; z.sum += c.net[i]; z.es += EV[i]; if (c.hc[i] >= 0) { z.ids.push(i); const m = z.mx[c.hc[i]]; m.n++; m.sum += c.net[i]; m.es += EV[i]; } } }
  const t = el('table', 'ht v3-grp v3-r21'), hr = el('tr'); ['Ваша позиция', 'Раз', 'Фолд', 'Колл', '4-бет', 'В среднем за раздачу'].forEach(h => { const th = el('th', null, h); if (h === 'В среднем за раздачу') { th.title = 'Средний итог одной раздачи по всем вашим решениям: итоги фолда, колла и 4-бета, взвешенные по их долям (факт / EV). Умножьте на «Раз» — получится общий итог.'; th.classList.add('help'); } hr.append(th); }); const th = el('thead'); th.append(hr); t.append(th);
  const tb = el('tbody'), LAB = ['фолд', 'колл', '4-бет'], COL = ['var(--good)', 'var(--ice)', 'var(--bad)'];
  ['all'].concat(V3_POS).forEach(key => { const row = G[key]; if (!row || !N[key]) return; const tr = el('tr'); tr.append(el('th', null, key === 'all' ? 'Все позиции' : key), el('td', 'v3-n', N[key].toLocaleString('ru-RU')));
    row.forEach((z, k) => { const td = el('td', 'c'); if (!z.n) { td.textContent = '—'; tr.append(td); return; } const b = el('b', null, fmtPct(z.n / N[key]) + '%'); b.style.color = COL[k]; td.append(b, wrNode('wr', z.sum / 10 / z.n, z.es / 10 / z.n, 2), el('span', 'n', z.n)); if (z.n < 20) td.classList.add('low');
      if (z.ids.length) hoverHands(td, { p: key, anyPos: true, pre: true, key: 'v321' + V3_C1MODE + key + k, title: LAB[k][0].toUpperCase() + LAB[k].slice(1) + ' на ' + NR + (key === 'all' ? ' (все позиции)' : ' с ' + key), o: { n: z.ids.length, sum: z.sum, es: z.es }, mx: z.mx, ids: z.ids, vlab: ' BB за раздачу', nlab: ' раздач' }, z.sum / 10 / z.n);
      tr.append(td); });
    const tt = T[key], tdT = el('td', 'v3-tot'); tdT.append(wrNode('wr', tt.sum / 10 / N[key], tt.es / 10 / N[key], 2)); tdT.title = 'В среднем за раздачу: ' + signed(tt.sum / 10 / N[key], 2) + ' BB факт, ' + signed(tt.es / 10 / N[key], 2) + ' BB EV — фолд, колл и 4-бет вместе, по их долям. Всего за ' + cnt(N[key], 'раздач') + ': ' + signed(tt.sum / 10, 0) + ' BB факт, ' + signed(tt.es / 10, 0) + ' BB EV.'; tr.append(tdT); tb.append(tr); });
  t.append(tb);
  return t;
}
function v3Card1(x) {
  const c = DB.cols, clean = V3_C1MODE === 'clean';
  const ids = v3C1Ids(x);
  const NR = clean ? '3-бет' : x.NR, posOf = (i) => (c.fp[i] >= 0 ? V3_FP[c.fp[i]] : null), g = v3Group(ids, posOf, x.RV), t = v3Group(ids, () => 't', x.RV).t;
  const seg = segBtns([['all', 'Все споты'], ['clean', 'Только чистые 1vs1']], V3_C1MODE, (k) => { V3_C1MODE = k; renderNext(); });
  const sub = !t || !t.n ? 'нет раздач в выборке' : 'из ' + (clean ? cnt(t.n, 'чистых спотов', 'gen') + ' 1vs1' : cnt(t.n, x.UNIT, 'gen'));
  const body = el('div', 'card-fill'); body.append(seg);
  if (t && t.n) {
    body.append(v3Tiles(ids, x.RV, 'Ваш ответ на ' + NR), el('span', 'resp-t', 'По вашей позиции: как часто и что приносит каждая реакция'), v3PosTable(x, ids));
  }
  const c1 = card(1, 'Фолдите на ' + NR, t && t.n ? '<em>' + fmtPct(t.fld / t.n) + '%</em>' : '<span class="muted">—</span>', sub, body);
  c1.append(infoNote('«Все споты» — как в Hand2Note: все раздачи, где вы открылись и получили ' + x.NR + ', в том числе сквиз-поты и раздачи, где до вашего хода кто-то ещё вступил. «Только чистые 1vs1» — вы открылись, открытие никто не коллировал, пришёл 3-бет и до вашего хода больше никто не вступал: ровно вы и 3-бетящий. Таблица — по вашей позиции: в каждой ячейке доля реакции, ниже — средний итог раздачи после неё (факт / EV), справа мелко — число раздач; «В среднем за раздачу» — итог одной раздачи по всем решениям вместе (фолд, колл и 4-бет по их долям); наведите на число — там же общий итог в BB. Фолд всегда стоит вложенное в открытие; колл и 4-бет показывают, окупается ли продолжение. Наведите на ячейку — руки и итог, клик по руке откроет раздачи и реплеер. В плитках ответа под долей — средний итог этой реакции в BB за раздачу, факт / EV. Фильтры раздела: ваш стек, тип 3-бета соперника, ваша позиция относительно 3-бетящего; «тип трибет банка» — только в режиме «Все споты» (чистые споты сами и есть банк 1vs1); «наше действие» не применяется — ваши реакции и есть содержимое карточки.'));
  return c1;
}
// подпись карточки 13, если выборка по смыслу пуста
const f3note = (x) => { const f = secF('vs3bet'); return f.B === 'hu' ? 'в «3b пот 1vs1» до вашего хода никто не вступает — выберите «Все» или «сквиз пот»' : f.B === 'sq' && f.SQ && !f.SQ.includes('r') ? 'сценарий для ваших открытий — включите подтумблер «вы рейзер»' : ''; };
const V3_STK = [['< 15 BB', 0, 15], ['15–25 BB', 15, 25], ['25–40 BB', 25, 40], ['40+ BB', 40, 1e9]];
const V3_SZ = [['до 2 BB', 0, 205], ['2,1–2,3 BB', 205, 235], ['2,4–2,6 BB', 235, 265], ['2,7–3,4 BB', 265, 345], ['3,5+ BB', 345, 1e9]];
const V3_POS = ['EP', 'MP', 'HJ', 'CO', 'BTN', 'SB'], V3_FP = ['EP', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
// окно первого типа по ячейке v3Cell: «Диапазон» — фолд / колл / 4-бет / олл-ин каждой рукой, «Факт / EV» и список — эти же раздачи
const v3Zz = (z) => ({ n: z.n, rmx: z.mx, rids: z.ids, labels: ['4-бет', 'олл-ин', 'колл', 'фолд'], capAll: 'все ваши ответы', foldPaint: true });
function v3ExtraCards(x) {
  const c = DB.cols, { pick, RV, RA, RP, NR, NRg } = x, out = [];
  const posOf = (i) => (c.fp[i] >= 0 ? V3_FP[c.fp[i]] : null), bucket = (B, v) => { const k = B.findIndex(q => v >= q[1] && v < q[2]); return k < 0 ? null : B[k][0]; };
  const sec = (n, title, sub, ...body) => { const d = el('div', 'insight cc-table'); d.append(numTag(n), el('b', 'pm-title', title), el('span', 'sm-s', sub), ...body); return d; };
  const A = pick('S', 'T', 'B', 'P'); // частоты — без «нашего действия», как карточка 1

  // #3 — ваш ответ на 3-бет по позициям: фолд, колл, 4-бет, 4-бет олл-ином (таблица как в Hand2Note)
  {
    const g = { TOT: v3Cell() }; for (const i of A) { const p = posOf(i); v3Add(g.TOT, i, RV(i), c, EVcol()); if (p && V3_POS.includes(p)) v3Add(g[p] || (g[p] = v3Cell()), i, RV(i), c, EVcol()); }
    const cols = ['TOT'].concat(V3_POS.filter(p => g[p] && g[p].n));
    const R = [['fld', 'Фолд на ' + NR, 'amber', z => z.fld], ['call', 'Колл ' + NRg, 'ice', z => z.call], ['r4', '4-бет', 'ice', z => z.r4 + z.ai], ['nai', 'из них не олл-ин', 'ice', z => z.r4], ['ai', 'из них олл-ин', 'ice', z => z.ai]];
    const tbl = heatTable({ cols, groupGapBefore: cols.indexOf('SB'), rows: R.map(([k, lab, tone, f], ri) => ({ key: k, label: lab, tone, own: true, sub: ri >= 3, data: Object.fromEntries(cols.map(col => [col, g[col] ? { x: f(g[col]), n: g[col].n } : null])) })) });
    tbl.querySelectorAll('td.c').forEach(td => { const z = g[td.dataset.col]; if (!z || !z.ids.length) return; const want = { fld: [0], call: [1], r4: [2, 3], nai: [2], ai: [3] }[td.dataset.row]; const ids = z.ids.filter(i => want.includes(RV(i))); if (!ids.length) return;
      const mx = Array.from({ length: 169 }, () => ({ n: 0, sum: 0, es: 0 })), EV = EVcol(); let sum = 0, es = 0; for (const i of ids) { const m = mx[c.hc[i]]; m.n++; m.sum += c.net[i]; m.es += EV[i]; sum += c.net[i]; es += EV[i]; }
      hoverHands(td, { p: td.dataset.col, anyPos: true, pre: true, key: 'v318' + td.dataset.row + td.dataset.col, title: R.find(q => q[0] === td.dataset.row)[1] + (td.dataset.col === 'TOT' ? ' (все позиции)' : ' с ' + td.dataset.col), o: { n: ids.length, sum, es }, mx, ids, vlab: ' BB за раздачу', nlab: ' раздач' }, sum / 10 / ids.length); });
    const d = el('div', 'insight cc-table'); d.append(numTag(3), el('span', 'k', 'Ваш ответ на ' + NR + ' по позициям'), el('span', 's', 'колонки — ваша позиция; в ячейке — % от раздач выборки, где вы получили ' + NR + ' (те же раздачи, что в карточке 1)'), tbl,
      infoNote('Фолд, колл и 4-бет (вместе с олл-ином) дают в сумме 100% по каждой колонке; «из них не олл-ин» и «из них олл-ин» — как делятся 4-беты (в сумме — строка «4-бет»). Наведите на ячейку — руки, которыми вы так ответили, и их итог; клик по руке откроет раздачи и реплеер. Бледные ячейки — меньше ' + cnt(SMALL, 'раздач', 'gen') + '. «Наше действие» не применяется — ответы и есть строки таблицы.'));
    out.push(d);
  }
  // #13 — вступили до вашего хода: вы открылись, пришёл 3-бет, и до вашего хода кто-то после 3-бетящего
  // (1) только заколлировал 3-бет — один или несколько, или (2) поставил поверх 4-бет — олл-ином или нет.
  // Только ваши открытия (вы коллер в сквиз-поте — не этот сценарий). Позиция — выбор в карточке; фильтры раздела S, T, B, P.
  {
    const base = A.filter(i => !x.isC(i)), pos = V3_POS.filter(p => base.some(i => posOf(i) === p && c.v3e[i] >= 1));
    if (V3_C3POS !== 'all' && !pos.includes(V3_C3POS)) V3_C3POS = 'all';
    const sel = V3_C3POS === 'all' ? base : base.filter(i => posOf(i) === V3_C3POS);
    const s1 = sel.filter(i => c.v3e[i] === 1), s2 = sel.filter(i => c.v3e[i] === 2), all = sel.length;
    const kOf = (i) => (c.v3k && c.v3k[i] >= 0 ? (c.v3k[i] >= 2 ? '2+' : '1') : null), xOf = (i) => (c.v3x && c.v3x[i] >= 0 ? c.v3x[i] : null);
    const g1 = v3Group(s1, kOf, RV), g2 = v3Group(s2, i => (xOf(i) === 1 ? 'ai' : xOf(i) === 0 ? 'nai' : null), RV), t1 = v3Group(s1, () => 't', RV).t, t2 = v3Group(s2, () => 't', RV).t;
    const head = (lab, n) => { const h = el('div', 'v3e-hd'); h.append(el('b', null, lab), el('span', null, cnt(n, 'раз') + ' из ' + cnt(all, 'раздач', 'gen') + ' · ' + (all ? fmtPct(n / all) : '0') + '%')); return h; };
    const segP = segBtns([['all', 'Все']].concat(pos.map(p => [p, p])), V3_C3POS, (k) => { V3_C3POS = k; renderNext(); });
    const box = el('div', 'card-fill');
    const b1 = el('div', 'v3e-row'), b2 = el('div', 'v3e-row');
    b1.append(head(NR[0].toUpperCase() + NR.slice(1) + ' заколлировали после ' + (NR === 'сквиз' ? 'сквизера' : '3-бетящего'), s1.length), s1.length ? v3Tiles(s1, RV, null) : el('span'), v3RespTable([['1 коллер', g1['1']], ['2+ коллера', g1['2+']], ['Всего', t1]], 'Кто вступил', NR, 'v33a' + V3_C3POS));
    b2.append(head('Поверх ' + NRg + ' поставили 4-бет', s2.length), s2.length ? v3Tiles(s2, RV, null, ['фолд', 'колл', '5-бет']) : el('span'), v3RespTable([['4-бет не олл-ин', g2.nai], ['4-бет олл-ин', g2.ai], ['Всего', t2]], 'Что поставили', NR, 'v33b' + V3_C3POS, ['Фолд', 'Колл', '5-бет', '5-бет олл-ин']));
    box.append(el('span', 'mx-cap', 'Ваша позиция'), segP, b1, b2);
    const note = f3note(x);
    const c3 = card(13, 'Мультивей против ' + NRg, all ? '<em>' + fmtPct((s1.length + s2.length) / all) + '%</em>' : '<span class="muted">—</span>', all ? 'до вашего хода в банк вошёл ещё кто-то: ' + cnt(s1.length + s2.length, 'раз') + ' из ' + cnt(all, 'раздач', 'gen') : note || 'нет раздач', box);
    c3.append(infoNote('Вы открылись, пришёл ' + NR + ', и ДО вашего хода в банк вступил кто-то после ' + (NR === 'сквиз' ? 'сквизера' : '3-бетящего') + '. Первый случай — его только заколлировали (один или несколько игроков; короткий олл-ин не больше ' + NRg + ' — тоже колл). второй — поверх поставили 4-бет: «олл-ин» — пуш или ставка на весь стек того, кто 4-бетил. Ваши реакции: в первом случае — фолд, колл (овер-колл) или 4-бет; во втором — фолд, колл или 5-бет. В плитках над таблицей — как часто вы так ответили и сколько в среднем принесла каждая реакция (факт / EV). Наведите на строку таблицы — руки и итог; клик по руке откроет раздачи и реплеер. Фильтры раздела: ваш стек, тип ' + NRg + ' соперника, тип банка («1vs1» по смыслу пуст — там никто не вступал) и ваша позиция относительно ' + (NR === 'сквиз' ? 'сквизера' : '3-бетящего') + '; «Наше действие» не применяется — ваши реакции и есть содержимое карточки.'));
    out.push(c3);
  }
  // #6 — против размера 3-бета: фолд на 3-бет и 4-бет без позиции и в позиции (как таблица «vs Size»), внизу — фолд на 5-бет
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
      if (z.ids.length) hoverRange(td, 'Против 3-бета ' + lab + ' · ' + (side === 'IP' ? 'в позиции' : 'без позиции'), v3Zz(z)); return td; };
    SZ.forEach((lab, k) => { if (!G.OOP[k].n && !G.IP[k].n) return; const tr = el('tr'); tr.append(el('th', null, lab), cell(G.OOP[k], 'f', 'OOP', lab), cell(G.OOP[k], '4', 'OOP', lab), el('td', 'gap'), cell(G.IP[k], 'f', 'IP', lab), cell(G.IP[k], '4', 'IP', lab)); tb.append(tr); });
    { const tr = el('tr', 'v3-f5'); const f5 = (z) => { const td = el('td', 'c'); td.colSpan = 2; if (!z.n) { td.textContent = '—'; return td; } td.append(el('b', null, fmtPct(z.x / z.n) + '%'), el('span', 'n', z.n)); heat(td, z.x / z.n, 1, 'amber'); if (z.n < 20) td.classList.add('low'); return td; }; tr.append(el('th', null, 'Фолд на 5-бет'), f5(F5.OOP), el('td', 'gap'), f5(F5.IP)); tb.append(tr); }
    t.append(tb);
    const d = el('div', 'insight cc-table'); d.append(numTag(6), el('b', 'pm-title', 'Против размера 3-бета'), el('span', 'sm-s', 'как часто вы сбрасываете и 4-бетите против 3-бета разного размера — без позиции и в позиции'), t,
      infoNote('Размер — 3-бет соперника, делённый на ваше открытие, округлённый до 0,5 (×3 — в три раза больше открытия); олл-ин — отдельной строкой. Фолд и 4-бет — доля ваших ответов, %; справа в ячейке мелко — число раздач. «Фолд на 5-бет» — как часто вы сбросили, когда после вашего 4-бета соперник поставил 5-бет. В позиции / без позиции — относительно 3-бетящего после флопа (поэтому фильтр «наша позиция» здесь не действует — он и есть колонки). Наведите на ячейку — диапазон: как вы ответили каждой рукой против такого размера (фолд, колл, 4-бет, олл-ин); клик закрепит окно с вкладками «Диапазон / Факт / EV», клик по руке откроет раздачи и реплеер. Бледные ячейки — меньше 20 раздач. Только ваши открытия (в сквиз-поте, где вы коллер, нет вашего размера открытия).'));
    out.push(d);
  }

  // #10 — ваша реакция на 3-бет по позициям в зависимости от размера вашего открытия (как таблица «F to 3B aft. OR»)
  {
    const base = A.filter(i => !x.isC(i) && c.size[i] > 0), OSZ = [['2–2,1 BB', 0, 215], ['2,1–2,5 BB', 215, 255], ['2,5–3,5 BB', 255, 355], ['3,5+ BB', 355, 1e9]];
    const g = {}; for (const i of base) { const k = OSZ.findIndex(q => c.size[i] >= q[1] && c.size[i] < q[2]), p = posOf(i); if (k < 0 || !p) continue; for (const col of ['TOT', p]) { const row = g[k] || (g[k] = {}); v3Add(row[col] || (row[col] = v3Cell()), i, RV(i), c, EVcol()); } }
    const cols = ['TOT'].concat(V3_POS.filter(p => Object.values(g).some(r => r[p] && r[p].n)));
    const M = { f: ['Фолд', z => z.fld], c: ['Колл', z => z.call], r: ['4-бет', z => z.r4 + z.ai] }, body = el('div');
    const draw = () => { const m = M[V3_OSZM]; const tbl = heatTable({ cols, rows: OSZ.map((q, k) => g[k] ? { key: String(k), label: q[0], tone: V3_OSZM === 'f' ? 'amber' : 'ice', data: Object.fromEntries(cols.map(col => [col, g[k][col] ? { x: m[1](g[k][col]), n: g[k][col].n } : null])) } : null).filter(Boolean) });
      tbl.querySelectorAll('td.c').forEach(td => { const z = g[td.dataset.row] && g[td.dataset.row][td.dataset.col]; if (!z || !z.ids.length) return; hoverHands(td, { p: td.dataset.col, anyPos: true, pre: true, key: 'v317' + td.dataset.row + td.dataset.col, title: 'Открытие ' + OSZ[+td.dataset.row][0] + (td.dataset.col === 'TOT' ? '' : ' с ' + td.dataset.col) + ' → ' + NR, o: { n: z.ids.length, sum: z.sum, es: z.es }, mx: z.mx, ids: z.ids, vlab: ' BB за раздачу', nlab: ' раздач' }, z.sum / 10 / z.n); });
      body.replaceChildren(Object.keys(g).length ? tbl : el('p', 'muted small', 'Нет раздач в выборке.')); };
    draw();
    const d = el('div', 'insight cc-table'); d.append(numTag(10), el('b', 'pm-title', 'Реакция на ' + NR + ' по размеру вашего открытия'), el('span', 'sm-s', 'строки — до скольких BB вы открылись, колонки — ваша позиция'),
      segBtns([['f', 'Фолд'], ['c', 'Колл'], ['r', '4-бет']], V3_OSZM, (k) => { V3_OSZM = k; draw(); }), body,
      infoNote('В ячейке — доля выбранной реакции (фолд, колл или 4-бет вместе с олл-ином) от раздач, где вы открылись таким размером и получили ' + NR + '; справа мелко — число раздач. Бледные ячейки — меньше ' + cnt(SMALL, 'раздач', 'gen') + '. Наведите на ячейку — руки и итог. Только ваши открытия.'));
    out.push(d);
  }
  // #4 — фолд на 3-бет: ваша позиция × позиция 3-бетящего
  {
    const g = {}; for (const i of A) { const p = posOf(i), q = x.isC(i) ? c.c3q[i] : c.v3q[i], op = q >= 0 ? V3_FP[q] : null; if (!p || !op) continue; const row = g[p] || (g[p] = {}), z = row[op] || (row[op] = v3Cell()); v3Add(z, i, RV(i), c, EVcol()); }
    // как таблица «Pos vs…» в Hand2Note: строки — кто 3-бетит (сверху MP, внизу BB), колонки — ваша позиция (слева EP, справа SB); ячейки — лесенкой под диагональю
    const OPS = ['MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'], G6 = {}; Object.entries(g).forEach(([p, row]) => Object.entries(row).forEach(([op, z]) => { (G6[op] || (G6[op] = {}))[p] = z; }));
    const cols = V3_POS.filter(p => g[p]), rows = OPS.filter(op => G6[op] && cols.some(p => G6[op][p] && G6[op][p].n >= SMALL));
    const tbl = heatTable({ cols, noTot: true, rows: rows.map(op => ({ key: op, label: op, data: Object.fromEntries(cols.map(p => [p, G6[op][p] ? { x: G6[op][p].fld, n: G6[op][p].n } : null])) })) });
    tbl.querySelectorAll('td.c').forEach(td => { const z = G6[td.dataset.row] && G6[td.dataset.row][td.dataset.col]; if (!z || !z.ids.length) return; hoverRange(td, 'Вы ' + td.dataset.col + ' против ' + NRg + ' с ' + td.dataset.row, v3Zz(z)); });
    out.push(sec(4, 'Фолд на ' + NR + ': ваша позиция против позиции ' + (NR === 'сквиз' ? 'сквизера' : '3-бетящего'), 'строки — кто ' + (NR === 'сквиз' ? 'сквизит' : '3-бетит') + ', колонки — ваша позиция; в ячейке — как часто вы сбросили', tbl,
      infoNote('Показывает, от кого вы сдаётесь чаще всего: например, против 3-бета с блайндов многие фолдят больше, чем против 3-бета с BTN. Наведите на ячейку — диапазон: как вы ответили каждой рукой (фолд, колл, 4-бет, олл-ин); клик закрепит окно с вкладками «Диапазон / Факт / EV», клик по руке откроет раздачи и реплеер. Бледные ячейки — меньше ' + cnt(SMALL, 'раздач', 'gen') + '.')));
  }
  // #11 — как часто вас 3-бетят: от ваших открытий не олл-ином, по позиции и по размеру открытия (стек и тип 3-бета из шапки)
  {
    // только чистые 3-беты: открытия, которые заколлировали и потом сквизанули (v3o = 1), не считаются ни в числителе, ни в знаменателе
    const opens = x.idx.filter(i => c.sit[i] === 0 && c.act[i] === 2 && c.pos[i] !== 6 && c.v3o[i] !== 1 && PREDS(x, i)), byP = {}, byS = {};
    // тип 3-бета из шапки: в числителе — только 3-беты этого типа (олл-ин / не олл-ин), знаменатель — все открытия
    const T7 = x.T && x.T.flt ? (x.T.ty === 'ai' ? 1 : 0) : -1, hit = (i) => c.v3o[i] === 0 && (T7 < 0 || c.v3a[i] === T7);
    for (const i of opens) { const got = hit(i) ? 1 : 0, p = posOf(i), sz = bucket(V3_SZ, c.size[i]); if (p) { const z = byP[p] || (byP[p] = { x: 0, n: 0 }); z.n++; z.x += got; } if (sz) { const z = byS[sz] || (byS[sz] = { x: 0, n: 0 }); z.n++; z.x += got; } }
    const tot = { x: opens.filter(hit).length, n: opens.length };
    const t1 = heatTable({ cols: ['TOT'].concat(V3_POS.filter(p => byP[p])), rows: [{ key: 'p', label: 'Вас 3-бетят', data: Object.assign({ TOT: tot }, byP) }] });
    const t2 = heatTable({ cols: V3_SZ.map(z => z[0]).filter(k => byS[k]), noTot: true, rows: [{ key: 's', label: 'по размеру открытия', data: byS }] });
    out.push(sec(11, 'Как часто вас 3-бетят', 'доля ваших открытий не олл-ином, на которые пришёл 3-бет' + (T7 === 1 ? ' олл-ином' : T7 === 0 ? ' не олл-ином' : '') + ' — без сквизов', t1, el('span', 'resp-t', 'По размеру вашего открытия'), t2,
      infoNote('Считаются ваши открытия не олл-ином (кроме BB) и только 3-беты сразу после них: если ваше открытие сначала заколлировали, а потом подняли (сквиз), такая раздача не входит ни в число 3-бетов, ни в число открытий. Если какой-то размер открытия 3-бетят заметно чаще — соперники видят в нём слабость или удобный момент. Из фильтров раздела действуют ваш стек и тип 3-бета соперника: с «Олл-ин» видно, как часто ваше открытие пушат, с «Не олл-ин» — как часто 3-бетят обычным размером (число открытий при этом не меняется). Банк, позиция и наше действие описывают то, что было уже после 3-бета, и здесь не применяются.')));
  }
  // #9 — по вашему стеку
  out.push(sec(9, 'Ответ на ' + NR + ' по вашему стеку', 'фолд, колл и 4-бет при разной глубине и что это приносит', v3RespTable(Object.entries(v3Group(A, i => bucket(V3_STK, c.bb[i] / 10), RV)).sort((a, b) => V3_STK.findIndex(z => z[0] === a[0]) - V3_STK.findIndex(z => z[0] === b[0])), 'Ваш стек', NR, 'v38'),
    infoNote('Стек — ваш стек в начале раздачи. Результат — средний итог раздачи после вашей реакции, факт / EV. Наведите на строку — руки и их итог. Бледные строки — меньше 30 раздач.')));
  // #8 — по стеку 3-бетящего
  out.push(sec(8, 'Против стека ' + (NR === 'сквиз' ? 'сквизера' : '3-бетящего'), 'как вы отвечаете короткому и глубокому ' + (NR === 'сквиз' ? 'сквизеру' : '3-бетящему'), v3RespTable(Object.entries(v3Group(A.filter(i => !x.isC(i)), i => c.v3s[i] >= 0 ? bucket(V3_STK, c.v3s[i] / 10) : null, RV)).sort((a, b) => V3_STK.findIndex(z => z[0] === a[0]) - V3_STK.findIndex(z => z[0] === b[0])), 'Его стек', NR, 'v39'),
    infoNote('Стек соперника в начале раздачи. Короткий 3-бетящий часто ставит всё — колл становится вопросом шансов банка; против глубокого важнее позиция и сила руки. Раздачи, где вы коллер (сквиз-пот), сюда не входят — стек сквизера в базе есть только для ваших открытий.')));
  // #5 — в позиции и без позиции (фильтр «наша позиция» не действует — он и есть строки)
  out.push(sec(5, 'В позиции и без позиции', 'ваша реакция, когда после флопа вы ходите после ' + (NR === 'сквиз' ? 'сквизера' : '3-бетящего') + ' и до него', v3RespTable(['IP', 'OOP'].map(k => [k === 'IP' ? 'В позиции' : 'Без позиции', v3Group(pick('S', 'T', 'B'), i => RP(i) === 1 ? 'IP' : RP(i) === 0 ? 'OOP' : null, RV)[k]]), 'Позиция', NR, 'v310'),
    infoNote('В позиции колл 3-бета обычно выгоднее: вы ходите последним на всех улицах. Если без позиции вы коллируете так же часто, как в позиции, а результат колла заметно хуже — стоит чаще 4-бетить или сбрасывать.')));
  // #7 — против олл-ина и не олл-ина (фильтр типа не действует — он и есть строки)
  out.push(sec(7, 'Против олл-ина и обычного ' + NRg, 'колл пуша — вопрос шансов банка, ответ на обычный ' + NR + ' — вопрос стратегии', v3RespTable([['Не олл-ин', 0], ['Олл-ин', 1]].map(([lab, k]) => [lab, v3Group(pick('S', 'B', 'P'), i => RA(i) === k ? 'x' : null, RV).x]), 'Тип ' + NRg, NR, 'v311'),
    infoNote('«Олл-ин» — эффективный: пуш, ставка на весь стек соперника или ставка, покрывающая ваш стек. В строке «Олл-ин» колонка «Колл» — как часто вы коллируете пуш; результат колла пуша лучше смотреть по EV, он не зависит от раздачи карт на борде.')));
  // #12 — по группам рук и реакции, в стиле «Результата стила» (#3.4 «Открытия»): строки — группы, колонки — фолд / колл / 4-бет
  {
    const COLS = [['Фолд', 'var(--good)', 'сбрасывали'], ['Колл', 'var(--ice)', 'не коллировали'], ['4-бет', 'var(--bad)', 'не 4-бетили']];
    const g = {}; for (const i of A) { if (c.hc[i] < 0) continue; const k = handGroup(c.hc[i]), v = RV(i), col = v === 0 ? 'Фолд' : v === 1 ? 'Колл' : '4-бет'; const row = g[k] || (g[k] = {}); v3Add(row[col] || (row[col] = v3Cell()), i, v, c, EVcol()); }
    const body = el('div');
    const draw = () => {
      const vals = []; Object.values(g).forEach(row => COLS.forEach(([col]) => { const z = row[col]; if (z && z.n >= 5) vals.push(Math.abs(valPick(z.sum, z.es) / 10 / z.n)); }));
      const max = Math.max(0.5, ...vals);
      const box = el('div', 'hg hg3');
      const hd = el('div', 'hg-row hg-head'); hd.append(el('span', null, 'Группа рук')); COLS.forEach(([lab]) => hd.append(el('span', null, lab))); box.append(hd);
      HAND_GROUPS.forEach(([lab], k) => { const row = g[k]; if (!row) return;
        const tot = COLS.reduce((a, [q]) => a + (row[q] ? row[q].n : 0), 0), r = el('div', 'hg-row'); r.append(el('span', 'hg-l', lab));
        COLS.forEach(([col, color, verb]) => {
          const z = row[col] || v3Cell(), cell = el('div', 'hg-c hg-c34'), nm = col.toLowerCase() + ' на ' + NR;
          if (!z.n) { cell.append(el('span', 'hg-na', '—')); r.append(cell); return; }
          const f = z.sum / 10 / z.n, e = z.es / 10 / z.n, v = valPick(f, e);
          cell.classList.add('click'); cell.tabIndex = 0; cell.setAttribute('role', 'button'); cell.setAttribute('aria-label', lab + ', ' + nm + ': показать руки и раздачи');
          const it = { p: lab, anyPos: true, pre: true, key: 'v312' + k + col, title: lab + ' · ' + nm, o: { n: z.ids.length, sum: z.sum, es: z.es }, mx: z.mx, ids: z.ids, only: (q) => handGroup(q) === k, vlab: ' BB за раздачу', nlab: ' раздач' };
          const pin = (ev) => { hideGroupTip(); pinHandPop(it, f, ev, cell); };
          cell.addEventListener('click', pin); cell.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pin(null); } });
          cell.addEventListener('mouseenter', (ev) => showGroupTip(col, lab, k, z, z.mx, ev, verb, 'в клетке — итог раздачи с этой рукой в BB, когда ваш ответ — ' + col.toLowerCase())); cell.addEventListener('mousemove', moveGroupTip); cell.addEventListener('mouseleave', hideGroupTip);
          const tr = el('div', 'hg-track'), fl = el('div', 'hg-fill'), w = Math.min(50, Math.abs(v) / max * 50);
          fl.style.width = w + '%'; fl.style.left = v >= 0 ? '50%' : (50 - w) + '%'; fl.style.background = color; if (v < 0) fl.style.opacity = '.7';
          tr.append(el('i', 'hg-zero'), fl);
          const sh = el('span', 'hg-n', fmtPct(z.n / tot) + '%'); sh.title = cnt(z.n, 'раз') + ' из ' + tot;
          const vv = el('span', 'hg-v ' + (v >= 0 ? 'up' : 'down'), signed(v, 2)); vv.title = signed(f, 2) + ' BB факт, ' + signed(e, 2) + ' BB EV · ' + cnt(z.n, 'раз');
          cell.append(sh, tr, vv); if (z.n < 30) cell.classList.add('low');
          r.append(cell);
        });
        box.append(r);
      });
      body.replaceChildren(Object.keys(g).length ? box : el('p', 'muted small', 'Нет раздач в выборке.'));
    };
    draw();
    const sg12 = valSeg(draw); sg12.classList.add('v3-rt-seg');
    out.push(sec(12, 'Реакция по группам рук', 'как часто каждой группой вы сбрасываете, коллируете и 4-бетите и что это приносит', sg12, body,
      infoNote('В ячейке: слева — доля этой реакции внутри группы рук, полоса и число справа — средний итог в BB за раздачу (EV или факт — переключатель над таблицей; оба числа — при наведении на число). Так видно, например, сбрасываете ли вы средние пары на ' + NR + ' и окупаются ли коллы с A2s–A9s. Наведите на ячейку — какие руки входят в группу и итог каждой; клик закрепит окно, клик по руке откроет раздачи и реплеер. Бледные ячейки — меньше 30 раздач.')));
  }
  return out;
}
// #11: из фильтров раздела — ваш стек (тип 3-бета — в самой карточке; как у карточки 11 в таблице CARD_FILTERS)
function PREDS(x, i) { const sr = x.sr; return !sr || (DB.cols.bb[i] >= sr[0] * 10 && DB.cols.bb[i] < sr[1] * 10); }
