const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext();
  await ctx.addInitScript(() => { try { localStorage.setItem('mda.welcome.later', '1'); } catch (e) {} });
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('http://127.0.0.1:8783/MDA-Lab-preview.html');
  await pg.waitForFunction(() => typeof DB !== 'undefined' && DB && DB.cols && DB.cols.v3, null, { timeout: 180000 });
  const res = await pg.evaluate(() => {
    const c = DB.cols, POS = Stats.POS, FP = ['EP', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'], bad = [], EV = c.nev || c.net; let checks = 0;
    const eq = (n, a, b) => { checks++; if (Math.abs(a - b) > 1e-6) bad.push(n + ': программа ' + a + ', пересчёт ' + b); };
    const all = Stats.selectHands(DB, {});
    // ---- Открытие: карточка 1 (места) и 8 (результат), с типом открытия
    for (const ot of [undefined, 'nai', 'ai']) {
      const x = Stats.rfiExtra(DB, all, { ot });
      const S = {}, N = {};
      for (const i of all) { if (c.sit[i] !== 0 || c.pos[i] === 6) continue; const p = POS[c.pos[i]], a = c.act[i], open = ot === 'nai' ? a === 2 : ot === 'ai' ? a === 3 : a >= 2;
        const s = S[p] || (S[p] = { n: 0, x: 0 }); s.n++; if (open) s.x++;
        if (open) { const z = N[p] || (N[p] = { n: 0, sum: 0, ids: 0 }); z.n++; z.sum += c.net[i]; if (c.hc[i] >= 0) z.ids++; } }
      Object.keys(S).forEach(p => { eq('RFI #1 ' + (ot || 'все') + ' ' + p + ' n', x.seats[p].n, S[p].n); eq('RFI #1 ' + (ot || 'все') + ' ' + p + ' x', x.seats[p].x, S[p].x);
        const z = N[p] || { n: 0, sum: 0, ids: 0 }; eq('RFI #8 ' + (ot || 'все') + ' ' + p + ' n', x.openNetPos[p].n, z.n); eq('RFI #8 ' + (ot || 'все') + ' ' + p + ' sum', x.openNetPos[p].sum, z.sum); eq('RFI #8 список ' + (ot || 'все') + ' ' + p, x.openNetPos[p].ids.length, z.ids); });
    }
    // ---- Колд-колл: карточка 1/2 (частота), 8 (результат), 7 (против олл-ина)
    { const r = Stats.cc(DB, all, {}); const C = {}, H = {}, A = {};
      for (const i of all) { if (c.rz[i] !== 1 || c.cl[i] !== 0 || c.lr[i] !== 0) continue; const p = POS[c.pos[i]], call = c.act[i] === 1, ks = p === 'BB' ? ['BB'] : ['TOT', p];
        const shove = c.rai[i] === 1 || (c.osz[i] >= 0 && c.osz[i] / 100 >= c.ostk[i] / 10 - 0.5);
        for (const k of ks) { const z = C[k] || (C[k] = { n: 0, x: 0 }); z.n++; if (call) z.x++;
          if (call && c.hpa[i] === 1 && c.hc[i] >= 0) { const h = H[k] || (H[k] = { n: 0, sum: 0 }); h.n++; h.sum += c.net[i]; }
          if (shove) { const a = A[k] || (A[k] = { n: 0, x: 0 }); a.n++; if (call) a.x++; } } }
      Object.keys(C).forEach(k => { eq('CC #1/#2 ' + k + ' n', r.cc[k].n, C[k].n); eq('CC #1/#2 ' + k + ' x', r.cc[k].x, C[k].x); const h = H[k] || { n: 0, sum: 0 }; eq('CC #8 ' + k + ' n', r.hands[k].n, h.n); eq('CC #8 ' + k + ' sum', r.hands[k].sum, h.sum); const a = A[k] || { n: 0, x: 0 }; eq('CC #7 ' + k + ' n', r.ai[k].n, a.n); eq('CC #7 ' + k + ' x', r.ai[k].x, a.x); }); }
    // ---- Против 3-бета: карточки 1, 2, 3, 5 — фильтры раздела отбираются здесь заново, по смыслу колонок
    const isC = i => c.c3[i] >= 0;
    const combos = [{}, { B: 'hu' }, { B: 'sq', SQ: ['r', 'c'] }, { B: 'sq', SQ: ['c'] }, { T: 'ai' }, { T: 'nai', P: 'ip' }, { P: 'oop' }, { S: [0, 15] }] // «наше действие» убрано из шапки (03.11.2026);
    for (const cb of combos) {
      // отбор так, как он описан пользователю (без кода app.js)
      const base = all.filter(i => (c.v3[i] >= 0 || isC(i)) && (!cb.S || (c.bb[i] >= cb.S[0] * 10 && c.bb[i] < cb.S[1] * 10)));
      const RA = i => isC(i) ? c.c3a[i] : c.v3a[i], RP = i => isC(i) ? c.c3p[i] : c.v3p[i], RV = i => isC(i) ? c.c3[i] : c.v3[i];
      let sel = base.filter(i => (!cb.T || RA(i) === (cb.T === 'ai' ? 1 : 0)) && (!cb.P || RP(i) === (cb.P === 'ip' ? 1 : 0)));
      sel = sel.filter(i => cb.B === 'hu' ? !isC(i) && c.v3o[i] === 0 && c.v3e[i] === 0 : cb.B === 'sq' ? ((!isC(i) && c.v3o[i] === 1 && cb.SQ.includes('r')) || (isC(i) && cb.SQ.includes('c'))) : !isC(i));
      const selA = sel;
      // программа: тот же путь, что renderV3B
      const prog = (() => { for (const k in SECF) delete SECF[k]; const f = secF('vs3bet'); if (cb.T) f.T = cb.T; if (cb.P) f.P = cb.P; if (cb.B) f.B = cb.B; if (cb.SQ) f.SQ = cb.SQ.slice(); if (cb.S) f.S = cb.S[0] === 0 ? 's15' : 's25';
        state.tab = 'vs3bet'; const idx = currentIdx(); let got = null; const o = Stats.v3b; const runs = []; Stats.v3b = function (db, ix, opt) { const r = o(db, ix, opt); runs.push(r); return r; }; try { renderV3B(idx); } finally { Stats.v3b = o; } return runs; })();
      const rA = prog[0], r = prog[1], nm = JSON.stringify(cb);
      const pos = (i) => FP[c.fp[i]];
      const tally = (ids, f) => { const z = { n: 0, fld: 0, call: 0, r4: 0, sum: 0 }; for (const i of ids) if (!f || f(i)) { z.n++; const v = RV(i); if (v === 0) z.fld++; else if (v === 1) z.call++; else z.r4++; z.sum += c.net[i]; } return z; };
      const t1 = tally(sel), t2 = tally(selA);
      ['n', 'fld', 'call', 'r4'].forEach(f => eq('v3B #1 ' + nm + ' ' + f, rA.d.TOT[f], t1[f]));
      ['n', 'sum'].forEach(f => eq('v3B #2 ' + nm + ' ' + f, r.d.TOT[f], t2[f]));
      for (const p of ['EP', 'MP', 'HJ', 'CO', 'BTN', 'SB']) { const z = tally(sel, i => pos(i) === p); eq('v3B #1 ' + nm + ' ' + p + ' fld', rA.d[p].fld, z.fld); eq('v3B #1 ' + nm + ' ' + p + ' n', rA.d[p].n, z.n); }
      const e1 = tally(selA, i => (isC(i) ? c.c3e[i] : c.v3e[i]) === 1 && (isC(i) || c.v3o[i] === 0)), e2 = tally(selA, i => (isC(i) ? c.c3e[i] : c.v3e[i]) === 2 && (isC(i) || c.v3o[i] === 0));
      eq('v3B #3 кол ' + nm, r.e1.TOT.n, e1.n); eq('v3B #3 4-бет ' + nm, r.e2.TOT.n, e2.n); eq('v3B #3 знаменатель ' + nm, r.all, t2.n);
      const cl = tally(sel, i => !isC(i) && c.v3o[i] === 0 && c.v3e[i] === 0); eq('v3B #5 ' + nm + ' n', rA.cl.TOT.n, cl.n); eq('v3B #5 ' + nm + ' fld', rA.cl.TOT.fld, cl.fld);
      const clA = tally(selA, i => !isC(i) && c.v3o[i] === 0 && c.v3e[i] === 0); eq('v3B #5 результат ' + nm, r.cl.TOT.sum, clA.sum);
    }
    return { bad, checks };
  });
  console.log('проверок', res.checks, 'расхождений', res.bad.length); res.bad.slice(0, 40).forEach(x => console.log('  ' + x)); console.log('errs', errs); await b.close();
})();
