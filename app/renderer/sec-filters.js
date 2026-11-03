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
// подпись числа под графиком результата (RFI 8, CC 8, 3-бет 2): «1 232 открытия»; выбранные фильтры раздела — на метке карточки (markFilters)
function secLabel(tab, n, what) {
  const w = what.split(' ')[0];
  return el('span', 'muted small tb-res-n', WORDS[w] ? cnt(n, w) + what.slice(w.length) : n.toLocaleString('ru-RU') + ' ' + what);
}
const PQ_TIP = 'Ваша позиция относительно 3-бетящего (первого агрессора — трибетера или сквизера) на постфлопе:\nIP — вы действуете последним на флопе, терне и ривере (в позиции), OOP — первым, до агрессора (вне позиции).';
function drawSecFilters(tab) {
  const box = $('secFilters'); if (!box) return; box.replaceChildren();
  if (!(tab in SEC_TYPES) || !DB) { box.hidden = true; return; }
  box.hidden = false; const f = secF(tab), types = SEC_TYPES[tab];
  box.classList.toggle('sec-f-grid', tab === 'vs3bet'); // «Против 3-бета»: сетка 2×2 — слева «3-бет соперника» и «тип трибет банка», справа «наша позиция» и «ваш стек»
  // группы, как фильтры над ними: подпись сверху, кнопки под ней
  const grp = (lab, ...nodes) => { const g = el('div', 'sf-g'); g.append(el('span', 'flt-k', lab)); const row = el('div', 'sf-row'); row.append(...nodes); g.append(row); return g; };
  if (types) box.append(grp(tab === 'rfi' ? 'Открытие' : tab === 'vs3bet' ? '3-бет соперника' : '3-бет', segBtns(types, f.T, (k) => { f.T = k; renderNext(); })));
  if (tab === 'vs3bet') {
    // тип 3-бет банка по чужим коллам (под «3-бетом соперника»): 1vs1 / сквиз поверх колла открытия;
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
  // «Против 3-бета»: порядок в сетке (по колонкам) — 3-бет соперника, тип банка | наша позиция, ваш стек (поля «от / до» — под кнопками стека)
  if (tab === 'vs3bet') {
    const pg = grp('Наша позиция', segBtns([['all', 'Все'], ['ip', 'IP'], ['oop', 'OOP']], f.P, (k) => { f.P = k; renderNext(); }));
    const pq = el('span', 'flt-q', '?');
    pq.title = PQ_TIP;
    pq.setAttribute('aria-label', 'Что значит IP и OOP');
    pg.querySelector('.sf-row').append(pq);
    const g = grp('Ваш стек, BB', stkSeg(cust, f.S, (k) => { f.S = k; renderNext(); }));
    g.append(fr);
    box.append(pg, g);
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
// ЕДИНАЯ ТАБЛИЦА: какая карточка раздела отвечает на какие фильтры раздела (буквы): S — ваш стек, T — тип (открытия / 3-бета / 3-бета соперника),
// A — «наше действие», B — «тип трибет банка», P — «наша позиция»; '' — фильтры раздела не действуют (свои настройки или вся выборка).
// По ней ставится метка «без фильтров раздела» и её же проверяет tests/audit/filters-table.js (переключает каждый фильтр и смотрит, какие
// карточки поменялись). Меняете, на что действует фильтр, — меняйте здесь, в коде карточки и в docs/filters.md.
const CARD_FILTERS = {
  rfi: { '#1': 'ST', '#2': 'ST', '#3': '', '#4': 'ST', '#5': 'ST', '#6': 'S', '#7': 'ST', '#8': 'S', '#9': '', '#10': 'S', '#11': 'S' },
  cc: { '#1': 'S', '#2': 'S', '#3': 'S', '#4': 'S', '#5': 'S', '#6': '', '#7': 'S', '#8': 'S', '#9': 'S' },
  '3bet': { '#1': 'S', '#2': 'ST', '#3': '', '#4': 'S', '#5': 'ST', '#6': 'ST', '#7': 'ST', '#8': 'S', '#9': 'S', '#10': 'ST', '#11': 'S' },
  vs3bet: { '#1': 'STBP', '#2': '', '#3': 'STBP', '#4': 'STBP', '#5': 'STB', '#6': 'STB', '#7': 'SBP', '#8': 'STBP', '#9': 'STBP', '#10': 'STBP', '#11': 'ST', '#12': 'STBP', '#13': 'STBP' } // порядок карточек 03.11.2026; «наше действие» сейчас не действует ни на одну
};
const SEC_EXEMPT = Object.fromEntries(Object.entries(CARD_FILTERS).map(([t, m]) => [t, Object.keys(m).filter(k => !m[k])]));
window.CARD_FILTERS = CARD_FILTERS;
function secActive(tab) {
  if (!(tab in SEC_TYPES) || !SECF[tab]) return false;
  const f = SECF[tab];
  return f.S !== 'all' || f.T !== 'all' || (f.B && f.B !== 'all') || (f.P && f.P !== 'all');
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

// Метка выбранных фильтров раздела на карточке (справа вверху, рядом с номером): только те фильтры, что на неё действуют
// (буквы CARD_FILTERS) и выбраны не «по умолчанию». Коротко: «стек 15–25 BB · олл-ин · IP». Метка в углу — высота карточки
// не меняется. У подкарточек (RFI 3.4, 3.5, 3.7) — в строке заголовка.
function secChips(tab, letters) {
  const f = SECF[tab]; if (!f) return [];
  const out = [], sr = secRange(tab);
  if (letters.includes('S') && sr) { const pre = RES_STK.find(x => x[0] === f.S && x[2]); out.push('стек ' + (pre ? pre[1] + ' BB' : rangeTxt(sr))); } // «< 15 BB», свой — «12–18 BB»
  if (letters.includes('T') && f.T && f.T !== 'all') out.push(tab === 'vs3bet' ? (f.T === 'ai' ? '3-бет олл-ин' : '3-бет не олл-ин') : f.T === 'ai' ? 'олл-ин' : 'не олл-ин');
  if (letters.includes('B') && f.B && f.B !== 'all') { const sq = f.SQ || ['r', 'c']; out.push(f.B === 'hu' ? '1vs1' : 'сквиз' + (sq.length === 1 ? (sq[0] === 'r' ? ' (вы рейзер)' : ' (вы коллер)') : '')); }
  if (letters.includes('P') && f.P && f.P !== 'all') out.push(f.P === 'ip' ? 'IP' : 'OOP');
  if (letters.includes('A') && f.A && f.A.length) out.push(f.A.map(a => ({ fold: 'фолд', call: 'колл', r4: '4-бет', ai: '4-бет олл-ин' })[a]).join(' + '));
  return out;
}
function markFilters(root, tab) {
  const T = CARD_FILTERS[tab]; if (!T || !secActive(tab)) return;
  root.querySelectorAll('.num-tag').forEach(t => {
    const k = t.textContent.trim(), L = T[k]; if (!L) return;
    const chips = secChips(tab, L); if (!chips.length) return;
    const txt = chips.join(' · ');
    if (t.classList.contains('sm-tag')) { const hh = t.parentElement; if (hh && !hh.querySelector('.sec-on')) { const m = el('span', 'sec-on sec-on-in', txt); m.title = 'Фильтры раздела на этой карточке: ' + txt; hh.append(m); } return; }
    const host = t.closest('.insight, .block'); if (!host || host.querySelector(':scope > .sec-on')) return;
    const m = el('span', 'sec-on', txt); m.title = 'Фильтры раздела на этой карточке: ' + txt; host.append(m);
  });
}
