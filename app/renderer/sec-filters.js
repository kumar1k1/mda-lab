'use strict';
/* global mda, Stats */
// Фильтры раздела (полоса под шапкой): ваш стек, свой диапазон, тип действия; правило — docs/filters.md.
// pre — префикс ключей в uiState (S — стек, C — свой диапазон, T — тип); types — кнопки типа или null
const RES_STK = [['all', 'Любой', null], ['s15', '< 15', [0, 15]], ['s25', '15–25', [15, 25]], ['s40', '25–40', [25, 40]], ['s40p', '40+', [40, 1e9]]];
// кнопки стека с постоянным местом под свой диапазон: пока его нет — «свой» (неактивна), после «Показать» — «20–30 BB»;
// ширина ряда не меняется, кнопки не прыгают
function stkSeg(cust, cur, on) {
  const seg = segBtns(RES_STK.map(x => [x[0], x[1]]).concat([['custom', cust ? rangeTxt(cust) : 'свой']]), cust ? 'custom' : cur, on);
  const last = seg.lastElementChild; last.classList.add('res-cust'); if (!cust) { last.disabled = true; last.title = 'Введите свой диапазон ниже и нажмите «Показать»'; }
  return seg;
}
// шапка карточки «Результат …»: слева крупно итог и подпись выборки, справа — переключатели
function resHead(card) {
  const k = card.querySelector(':scope > .k'), v = card.querySelector(':scope > .v'), ctl = card.querySelector('.tb-res-ctl'), lab = card.querySelector('.tb-res-n');
  if (!k || !v || !ctl) return card;
  card.classList.add('res-host');
  const top = el('div', 'res-top'), left = el('div', 'res-left');
  left.append(k, v); if (lab) left.append(lab);
  top.append(left, ctl);
  const tag = card.querySelector(':scope > .num-tag'); if (tag) tag.after(top); else card.prepend(top);
  return card;
}
// Фильтры раздела — в шапке рядом с «Все столы / 6-max / 7–9 max» и действуют на все карточки раздела:
// ваш стек (кнопки и свой диапазон) — отбор раздач по стеку для всего раздела; тип действия (все / не олл-ин / олл-ин) —
// для карточек результата этого действия (где тип имеет смысл). Свои для каждого раздела.
const SECF = {};
const SEC_TYPES = { rfi: [['all', 'Все открытия'], ['nai', 'Не олл-ин'], ['ai', 'Олл-ин']], cc: null, '3bet': [['all', 'Все 3-беты'], ['nai', 'Не олл-ин'], ['ai', 'Олл-ин']], vs3bet: [['all', 'Все 3-беты'], ['nai', 'Не олл-ин'], ['ai', 'Олл-ин']] };
const secF = (tab) => SECF[tab] || (SECF[tab] = { S: 'all', C: null, T: 'all', A: [], B: 'all', P: 'all', SQ: null }); // A — «наше действие» (Против 3-бета): список выбранных, пустой = любое; B — «тип трибет банка», P — «наша позиция», SQ — подтумблеры сквиз-пота ['r','c'] (null = оба) там же
function secRange(tab) { if (!(tab in SEC_TYPES)) return null; const f = secF(tab); return f.S === 'custom' && f.C ? f.C : (RES_STK.find(x => x[0] === f.S) || RES_STK[0])[2]; }
// тип действия раздела: проверка раздачи и подпись выборки для карточки.
// «олл-ин» вашего 3-бета — эффективно: фактический пуш или рейз, покрывающий стек открывающего (в этом споте коллеров нет)
function secType(tab) {
  const ty = (tab in SEC_TYPES && SEC_TYPES[tab]) ? secF(tab).T : 'all', c = DB.cols;
  const aiOf = tab === '3bet' ? (i) => c.act[i] === 3 || (c.act[i] === 2 && c.ostk[i] > 0 && c.size[i] >= c.ostk[i] * 10 - 1) : (i) => c.act[i] === 3;
  return { ty, flt: ty !== 'all', pass: (i) => ty === 'all' || (ty === 'ai' ? aiOf(i) : c.act[i] === 2 && !aiOf(i)) };
}
function secLabel(tab, n, what) {
  const t = secType(tab), rng = secRange(tab), tl = t.flt ? (SEC_TYPES[tab].find(x => x[0] === t.ty) || [])[1] : '';
  return el('span', 'muted small tb-res-n', [tl, rng ? (tl ? 'ваш' : 'Ваш') + ' стек ' + rangeTxt(rng) : ''].filter(Boolean).join(', ') + (tl || rng ? ': ' : '') + (WORDS[what.split(' ')[0]] ? cnt(n, what.split(' ')[0]) + what.slice(what.split(' ')[0].length) : n.toLocaleString('ru-RU') + ' ' + what));
}
function drawSecFilters(tab) {
  const box = $('secFilters'); if (!box) return; box.replaceChildren();
  if (!(tab in SEC_TYPES) || !DB) { box.hidden = true; return; }
  box.hidden = false; const f = secF(tab), types = SEC_TYPES[tab];
  box.classList.toggle('sec-f-grid', tab === 'vs3bet'); // «Против 3-бета»: сетка 2×2 — слева «3-бет соперника» над «типом трибет банка», справа «наше действие» и «ваш стек» под ним; правая колонка не заезжает на левую
  // группы, как фильтры над ними: подпись сверху, кнопки под ней
  const grp = (lab, ...nodes) => { const g = el('div', 'sf-g'); g.append(el('span', 'flt-k', lab)); const row = el('div', 'sf-row'); row.append(...nodes); g.append(row); return g; };
  if (types) box.append(grp(tab === 'rfi' ? 'Открытие' : tab === 'vs3bet' ? '3-бет соперника' : '3-бет', segBtns(types, f.T, (k) => { f.T = k; renderNext(); })));
  // «Против 3-бета»: наше действие на 3-бет — под фильтром типа 3-бета соперника; действия можно сочетать (фолд+колл, оба 4-бета…)
  if (tab === 'vs3bet') {
    const seg = el('div', 'seg bx-seg');
    const sync = () => seg.querySelectorAll('button').forEach(b => { const on2 = b.dataset.k === 'all' ? !f.A.length : f.A.includes(b.dataset.k); b.classList.toggle('on', on2); b.setAttribute('aria-pressed', String(on2)); });
    const mk = (k, t) => { const b = el('button', null, t); b.type = 'button'; b.dataset.k = k; b.title = k === 'all' ? 'Все ответы на 3-бет' : 'Можно выбрать несколько — повторный клик снимает'; b.onclick = () => { if (k === 'all') f.A = []; else { const j = f.A.indexOf(k); if (j >= 0) f.A.splice(j, 1); else f.A.push(k); } sync(); renderNext(); }; return b; };
    seg.append(mk('all', 'Любое'), mk('fold', 'Фолд'), mk('call', 'Колл'), mk('r4', '4-бет'), mk('ai', '4-бет олл-ин')); sync();
    box.append(grp('Наше действие', seg));
    // тип 3-бет банка по чужим коллам (под «нашим действием»): 1vs1 / сквиз поверх колла открытия;
    // у «сквиз пот» — подтумблеры asR (вы открылись, открытие заколлировали, сквиз поверх) и asC (вы заколлировали чужое открытие, сквиз за спиной)
    const bseg = segBtns([['all', 'Все'], ['hu', '3b пот 1vs1'], ['sq', 'сквиз пот']], f.B, (k) => { if (k === 'sq') f.SQ = ['r', 'c']; f.B = k; renderNext(); }); // повторный клик по «сквиз пот» возвращает asR + asC вместе
    if (f.B === 'sq') {
      const sqBtn = [...bseg.querySelectorAll('button')].find(x => x.textContent.trim() === 'сквиз пот');
      if (sqBtn) sqBtn.title = 'Все сквиз-споты (asR + asC). Повторный клик возвращает оба семейства, если выключали чип.';
      [['r', 'asR', 'asR — вы открылись первым, ваше открытие заколлировали, и сквиз поднял банк поверх коллов.'], ['c', 'asC', 'asC — вы заколлировали чужое открытие (до вас одно открытие, коллеры могли быть до и после вас), и за спиной прилетел сквиз.']].forEach(([k, t, tip]) => {
        const chip = el('button', 'sq-sub' + (f.SQ.includes(k) ? ' on' : ''), t);
        chip.type = 'button'; chip.title = tip; chip.setAttribute('aria-pressed', String(f.SQ.includes(k)));
        chip.onclick = (e) => {
          e.stopPropagation();
          const j = f.SQ.indexOf(k);
          if (j >= 0) { if (f.SQ.length === 1) return; f.SQ.splice(j, 1); } else f.SQ.push(k);
          renderNext();
        };
        bseg.append(chip);
      });
    }
    box.append(grp('Тип трибет банка', bseg));
  }
  const cust = f.S === 'custom' ? f.C : null;
  // свой диапазон — под кнопками стека, с тем же левым краем
  const fr = rangeForm('secRng', cust, (v) => { if (v) { f.C = v; f.S = 'custom'; } else { f.C = null; f.S = 'all'; } render(); });
  // «Против 3-бета»: «Наша позиция» — на одной линии с полями «от / до» фильтра стека (сетка: позиция слева, форма справа)
  if (tab === 'vs3bet') {
    box.append(grp('Ваш стек, BB', stkSeg(cust, f.S, (k) => { f.S = k; renderNext(); })));
    const pg = grp('Наша позиция', segBtns([['all', 'Все'], ['ip', 'IP'], ['oop', 'OOP']], f.P, (k) => { f.P = k; renderNext(); }));
    const pq = el('span', 'flt-q', '?');
    pq.title = 'Ваша позиция относительно 3-бетящего (первого агрессора — трибетера или сквизера) на постфлопе:\nIP — вы действуете последним на флопе, терне и ривере (в позиции), OOP — первым, до агрессора (вне позиции).';
    pq.setAttribute('aria-label', 'Что значит IP и OOP');
    pg.append(pq);
    box.append(pg, fr);
  } else {
    const g = grp('Ваш стек, BB', stkSeg(cust, f.S, (k) => { f.S = k; renderNext(); }));
    g.append(fr);
    box.append(g);
  }
}
// раздачи набора (ids) под фильтр: итог, матрица рук, список
function subHands(z, pass) {
  const c = DB.cols, E = EVcol(), o = { n: 0, sum: 0, es: 0, ids: [], mx: Array.from({ length: 169 }, () => ({ n: 0, sum: 0, es: 0 })) };
  (z.ids || []).forEach(i => { if (!pass(i)) return; o.n++; o.sum += c.net[i]; o.es += E[i]; o.ids.push(i); if (c.hc[i] >= 0) { const m = o.mx[c.hc[i]]; m.n++; m.sum += c.net[i]; m.es += E[i]; } });
  return o;
}


// Карточки, на которые фильтры раздела не действуют (у них свои поля стека или они по всей выборке — docs/filters.md).
// Когда в разделе выбран хоть один фильтр раздела, у таких карточек справа вверху — метка, чтобы не казалось, что фильтр «не сработал».
// Метка в углу (position: absolute) — высота карточки не меняется, соседние карточки не прыгают.
const SEC_EXEMPT = { rfi: ['#4+', '#13'], cc: ['#5'], '3bet': ['#6'], vs3bet: ['#4'] };
function secActive(tab) {
  if (!(tab in SEC_TYPES) || !SECF[tab]) return false;
  const f = SECF[tab];
  return f.S !== 'all' || f.T !== 'all' || (f.A && f.A.length > 0) || (f.B && f.B !== 'all') || (f.P && f.P !== 'all');
}
function markExempt(root, tab) {
  const list = SEC_EXEMPT[tab]; if (!list || !secActive(tab)) return;
  root.querySelectorAll('.num-tag').forEach(t => {
    if (!list.includes(t.textContent.trim())) return;
    const host = t.closest('.insight, .block'); if (!host || host.querySelector(':scope > .sec-exempt')) return;
    const m = el('span', 'sec-exempt', 'без фильтров раздела'); m.title = 'Фильтры раздела (ваш стек, тип и другие) на эту карточку не действуют — у неё свои настройки или она считается по всей выборке. Фильтры шапки (рум, период, бай-ин, столы) действуют.';
    host.append(m);
  });
}
