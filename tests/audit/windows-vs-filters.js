// все окна при наведении во всех 4 вкладках: каждая раздача в окне/списке должна проходить фильтры шапки,
// стек раздела (если он действует на карточку), ситуацию вкладки и тип (для раздач с рейзом героя), а в v3B — все фильтры раздела
const { chromium } = require('playwright');
const COMBOS = [
  { name: 'по умолчанию', set: {} },
  { name: 'GG + 6-max + стек 15–25', set: { room: 1, sub: '6max', S: 's25' } },
  { name: 'стек < 15 + тип олл-ин', set: { S: 's15', T: 'ai' } },
  { name: 'стек 25–40 + тип не олл-ин', set: { S: 's40', T: 'nai' } },
];
const V3 = [{ name: 'v3B: сквиз, только коллер', v: { B: 'sq', SQ: ['c'] } }, { name: 'v3B: IP', v: { P: 'ip' } }, { name: 'v3B: 1vs1 + OOP', v: { B: 'hu', P: 'oop' } }, { name: 'v3B: сквиз пот', v: { B: 'sq', SQ: ['r', 'c'] } }];
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('mda.welcome.later', '1'); } catch (e) {} });
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('http://127.0.0.1:8783/MDA-Lab-preview.html');
  await pg.waitForFunction(() => typeof DB !== 'undefined' && DB && DB.cols && DB.cols.v3, null, { timeout: 180000 });
  await pg.evaluate(() => {
    window.__cap = [];
    const grab = (o, d, out, key) => { if (!o || d > 5 || typeof o !== 'object') return; if (Array.isArray(o)) { if (/^(ids|rids|list)$/.test(key || '') && o.length && Number.isInteger(o[0])) out.push(o); else if (!o.length || typeof o[0] === 'object') o.forEach(x => grab(x, d + 1, out, '')); return; } for (const k of Object.keys(o)) { if (/^(mx|rmx|vmx|labels|r)$/.test(k)) continue; grab(o[k], d + 1, out, k); } };
    for (const fn of ['showHandPop', 'pinHandPop', 'showSzMx', 'pinSzMx', 'showGroupTip', 'showPushTip', 'showMxTip']) {
      const orig = window[fn]; if (typeof orig !== 'function') continue;
      window[fn] = function (...a) { const arrs = []; a.forEach(x => grab(x, 0, arrs)); if (arrs.length) window.__cap.push({ fn, card: window.__card, title: typeof a[0] === 'string' ? a[0] : (a[0] && a[0].title) || '', ids: [].concat(...arrs) }); return orig.apply(this, a); };
    }
  });
  const report = [];
  const run = async (tab, combo, v3) => {
    await pg.evaluate(({ tab, combo, v3 }) => {
      state.room = combo.room != null ? combo.room : null; state.sub = combo.sub || 'TOT';
      for (const k in SECF) delete SECF[k];
      const f = secF(tab); if (combo.S) f.S = combo.S; if (combo.T && SEC_TYPES[tab]) f.T = combo.T;
      if (v3) Object.assign(f, v3);
      __go(tab, state.sub);
    }, { tab, combo: combo.set, v3: v3 && v3.v });
    await pg.waitForTimeout(1500);
    return pg.evaluate(({ tab }) => {
      window.__cap = [];
      const els = [...document.querySelectorAll('#content *')];
      for (const e of els) {
        const cardEl = e.closest('.insight, .block, .sm, .card') ; const tag = cardEl && cardEl.querySelector('.num-tag'); window.__card = tag ? tag.textContent.trim() : '?';
        const r = e.getBoundingClientRect(); const o = { bubbles: false, clientX: r.left + 2, clientY: r.top + 2 };
        e.dispatchEvent(new MouseEvent('mouseenter', o)); e.dispatchEvent(new MouseEvent('mouseover', Object.assign({}, o, { bubbles: true }))); e.dispatchEvent(new MouseEvent('mousemove', o)); e.dispatchEvent(new MouseEvent('mouseleave', o));
      }
      // проверка
      const c = DB.cols, idx = new Set(currentIdx()), sr = secRange(tab), ty = SEC_TYPES[tab] ? secF(tab).T : 'all', f = secF(tab);
      const STK = { rfi: ['#1', '#4', '#5', '#6', '#7', '#8', '#10', '#11', '#2'], cc: null, '3bet': null, vs3bet: null };
      const NOSTK = { cc: ['#6'], '3bet': ['#3'], vs3bet: ['#2'] };
      const TYC = { rfi: ['#1', '#4', '#5', '#7', '#2'], '3bet': ['#2', '#6', '#5', '#7', '#10'] };
      const aI3 = (i) => c.act[i] === 3 || (c.act[i] === 2 && c.ostk[i] > 0 && c.size[i] >= c.ostk[i] * 10 - 1);
      const sit = { rfi: (i, cd) => (cd === '#10' || cd === '#11') ? c.sit[i] === 1 : c.sit[i] === 0, cc: (i) => c.rz[i] === 1 && c.sit[i] === 2, '3bet': (i) => c.rz[i] === 1 && c.cl[i] === 0, vs3bet: (i) => c.v3[i] >= 0 || (c.c3 && c.c3[i] >= 0) }[tab];
      const isC = i => c.c3 && c.c3[i] >= 0, RA = i => isC(i) ? c.c3a[i] : c.v3a[i], RP = i => isC(i) ? c.c3p[i] : c.v3p[i], RV = i => isC(i) ? c.c3[i] : c.v3[i], AV = { fold: 0, call: 1, r4: 2, ai: 3 };
      const bad = {}; let nW = 0, nH = 0; const cards = new Set();
      for (const w of window.__cap) {
        nW++; cards.add(w.card);
        // какие фильтры раздела действуют на карточку — из единой таблицы программы (CARD_FILTERS в sec-filters.js)
        const L = (CARD_FILTERS[tab] || {})[w.card] || '';
        const stkOn = sr && L.includes('S');
        const tyOn = ty !== 'all' && L.includes('T');
        for (const i of w.ids) {
          nH++; const why = [];
          if (!idx.has(i)) why.push('шапка');
          if (stkOn && !(c.bb[i] >= sr[0] * 10 && c.bb[i] < sr[1] * 10)) why.push('стек раздела');
          if (!sit(i, w.card)) why.push('ситуация вкладки');
          if (tyOn && tab !== 'vs3bet' && c.act[i] >= 2) { const ai = tab === '3bet' ? aI3(i) : c.act[i] === 3; if ((ty === 'ai') !== ai) why.push('тип'); }
          if (tab === 'vs3bet') {
            if (L.includes('T') && ty !== 'all' && RA(i) !== (ty === 'ai' ? 1 : 0)) why.push('тип 3-бета соперника');
            if (L.includes('P') && f.P !== 'all' && RP(i) !== (f.P === 'ip' ? 1 : 0)) why.push('наша позиция');
            if (L.includes('A') && f.A && f.A.length && !f.A.some(a => RV(i) === AV[a])) why.push('наше действие');
            if (L.includes('B') && f.B === 'hu' && !(!isC(i) && c.v3o[i] === 0 && c.v3e[i] === 0)) why.push('банк 1vs1');
            if (L.includes('B') && (f.B === 'all' || !f.B) && isC(i)) why.push('банк «все» с asC');
          }
          for (const y of why) { const k = w.card + ' «' + String(w.title).slice(0, 60) + '» — ' + y; bad[k] = (bad[k] || 0) + 1; }
        }
      }
      document.querySelectorAll('.hand-pop').forEach(p => p.hidden = true); if (window.hideSzMx) hideSzMx();
      return { nW, nH, cards: [...cards].join(' '), bad };
    }, { tab });
  };
  for (const tab of ['rfi', 'cc', '3bet', 'vs3bet']) {
    const combos = COMBOS.map(c => [c, null]).concat(tab === 'vs3bet' ? V3.map(v => [COMBOS[0], v]) : []);
    for (const [cb, v3] of combos) {
      const r = await run(tab, cb, v3);
      const nb = Object.values(r.bad).reduce((a, x) => a + x, 0);
      console.log(tab.padEnd(7), (v3 ? v3.name : cb.name).padEnd(30), 'окон', r.nW, 'раздач', r.nH, 'ошибок', nb, '| карточки', r.cards);
      Object.entries(r.bad).slice(0, 8).forEach(([k, n]) => console.log('     ', n, k));
    }
  }
  console.log('errs', errs.slice(0, 5)); await b.close();
})();
