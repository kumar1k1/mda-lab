const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1380, height: 950 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('mda.welcome.later', '1'); } catch (e) {} });
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('http://127.0.0.1:8783/MDA-Lab-preview.html');
  await pg.waitForFunction(() => typeof DB !== 'undefined' && DB && DB.cols && DB.cols.fp, null, { timeout: 180000 });
  const res = await pg.evaluate(() => {
    const out = [], bad = (m) => out.push(m);
    const c = DB.cols, N = DB.count, FP = ['EP', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'], POS = Stats.POS;
    const idxAll = Stats.selectHands(DB, {});
    // независимый отбор возможностей 3-бета
    const opp = [];
    for (const i of idxAll) {
      if (c.rz[i] !== 1 || c.cl[i] !== 0) continue;
      if (c.rai[i] === 1 || (c.osz[i] >= 0 && c.ostk[i] >= 0 && c.osz[i] / 100 >= c.ostk[i] / 10 - 0.5)) continue;
      const p = c.fp[i] >= 0 ? FP[c.fp[i]] : null, op = c.fop[i] >= 0 ? FP[c.fop[i]] : null;
      const a = c.act[i]; opp.push({ i, p, op, iso: c.lr[i] > 0, a, ai: a === 3 || (a === 2 && c.ostk[i] > 0 && c.size[i] >= c.ostk[i] * 10 - 1), bvb: p === 'BB' && op === 'SB' });
    }
    const r = Stats.tb(DB, idxAll, {});
    const cols = (o) => o.p === 'EP' || o.bvb ? ['TOT'] : ['TOT', o.p];
    const eq = (name, a, b2) => { if (Math.abs(a - b2) > 1e-6) bad(name + ': программа ' + a + ', пересчёт ' + b2); };
    const mk = () => ({ n: 0, x: 0, ai: 0, nai: 0 });
    const T = {}; r.TB_COLS.forEach(k => T[k] = mk());
    const ISO = {}; r.TB_COLS.forEach(k => ISO[k] = { n: 0, x: 0 });
    const F4 = {}, F4C = {}, T3 = {}, OPF = {}, H = {}, SZ = {}, OS = {};
    r.TB_COLS.forEach(k => { F4[k] = { n: 0, fold: 0, call: 0, rz: 0, n5: 0, x5: 0 }; F4C[k] = { n: 0, fold: 0, call: 0, rz: 0, n5: 0, x5: 0 }; T3[k] = [0, 0, 0, 0]; OPF[k] = { n: 0, x: 0 }; H[k] = { n: 0, sum: 0, es: 0 }; SZ[k] = [0, 0, 0, 0, 0].map(() => ({ n: 0, rz: 0, ai: 0, call: 0, fold: 0, sum: 0, sn: 0 })); OS[k] = [0, 0, 0].map(() => ({ n: 0, x: 0, ai: 0, sum: 0, sn: 0 })); });
    const EV = c.nev || c.net, SZB = [205, 235, 265, 345, 1e9];
    for (const o of opp) {
      const i = o.i, r3 = o.a >= 2;
      for (const k of cols(o)) {
        if (o.iso) { ISO[k].n++; if (r3) ISO[k].x++; continue; }
        const t = T[k]; t.n++; if (r3) { t.x++; if (o.ai) t.ai++; else t.nai++; }
        if (r3 && c.hc[i] >= 0) { H[k].n++; H[k].sum += c.net[i]; H[k].es += EV[i]; }
        if (r3) {
          const t4 = c.t4[i], t3 = c.t3r[i];
          if (t3 >= 0) { T3[k][t3 & 3]++; OPF[k].n++; if (t3 & 4) OPF[k].x++; }
          if (t4 >= 0) { const F = t4 & 8 ? F4C[k] : F4[k], bb = t4 & 3; F.n++; F[['fold', 'call', 'rz'][bb]]++; if (!(t4 & 4)) { F.n5++; if (bb === 2) F.x5++; } }
        }
        if (c.osz[i] >= 0) { const zk = SZB.findIndex(v => c.osz[i] < v), q = SZ[k][zk]; q.n++; q[o.a === 1 ? 'call' : o.ai ? 'ai' : o.a === 2 ? 'rz' : 'fold']++; if (r3) { q.sum += c.net[i]; q.sn++; } }
        if (c.ostk[i] >= 0) { const s = c.ostk[i] / 10, q = OS[k][s < 20 ? 0 : s < 40 ? 1 : 2]; q.n++; if (r3) { q.x++; if (o.ai) q.ai++; q.sum += c.net[i]; q.sn++; } }
      }
    }
    r.TB_COLS.forEach(k => {
      ['n', 'x', 'ai', 'nai'].forEach(f => eq('#1/#3 3-бет ' + k + '.' + f, r.tb[k][f], T[k][f]));
      eq('#3 nai+ai=x ' + k, r.tb[k].nai + r.tb[k].ai, r.tb[k].x);
      ['n', 'x'].forEach(f => eq('#11 изолейт ' + k + '.' + f, r.iso[k][f], ISO[k][f]));
      ['n', 'fold', 'call', 'rz', 'n5', 'x5'].forEach(f => { eq('#3 фолд на 4-бет ' + k + '.' + f, r.f4[k][f], F4[k][f]); eq('#3 холодный 4-бет ' + k + '.' + f, r.f4c[k][f], F4C[k][f]); });
      eq('#3 f4 fold+call+rz=n ' + k, r.f4[k].fold + r.f4[k].call + r.f4[k].rz, r.f4[k].n);
      for (let q = 0; q < 4; q++) eq('#3 ответ на 3-бет ' + k + '[' + q + ']', r.t3r[k][q], T3[k][q]);
      eq('#3 открывающий сбросил ' + k + '.n', r.opF[k].n, OPF[k].n); eq('#3 открывающий сбросил ' + k + '.x', r.opF[k].x, OPF[k].x);
      eq('#2 руки ' + k + '.n', r.hands[k].n, H[k].n); eq('#2 руки ' + k + '.sum', r.hands[k].sum, H[k].sum); eq('#2 руки ' + k + '.es', r.hands[k].es, H[k].es);
      eq('#2 hands = handsN+handsA ' + k, r.handsN[k].n + r.handsA[k].n, r.hands[k].n);
      SZ[k].forEach((q, j) => { const z = r.sz[k][j]; ['n', 'rz', 'ai', 'call', 'fold', 'sum', 'sn'].forEach(f => eq('#7 сайзинг ' + k + '[' + j + '].' + f, z[f], q[f])); eq('#7 сумма ответов ' + k + j, z.rz + z.ai + z.call + z.fold, z.n); });
      OS[k].forEach((q, j) => { const z = r.ostk[k][j]; ['n', 'x', 'ai', 'sum', 'sn'].forEach(f => eq('#7.1 стек открывающего ' + k + '[' + j + '].' + f, z[f], q[f])); });
      // #3 матрицы окна = строки таблицы
      eq('#3 окно фолд на 4-бет ' + k, r.f4mx[k].n, r.f4[k].n); eq('#3 окно холодного 4-бета ' + k, r.f4cmx[k].n, r.f4c[k].n);
    });
    // #5 vs: сумма по открывающим = все возможности позиции (BB — с BvB)
    ['MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'].forEach(p => { const row = r.vs[p] || {}; let n = 0, x = 0; Object.values(row).forEach(z => { n += z.n; x += z.x; }); const bvb = (row.SB || { n: 0, x: 0 }); const exp = opp.filter(o => !o.iso && o.p === p && o.op); eq('#5 строка ' + p + ' n', n, exp.length); eq('#5 строка ' + p + ' x', x, exp.filter(o => o.a >= 2).length); });
    // #9 split
    const SP = { TOT: 0, IP: 0, SB: 0, BB: 0 };
    for (const o of opp) if (!o.iso) { const g = o.p === 'CO' || o.p === 'BTN' ? 'IP' : o.p === 'SB' ? 'SB' : o.p === 'BB' && !o.bvb ? 'BB' : null; SP.TOT++; if (g) SP[g]++; }
    Object.keys(SP).forEach(g => { eq('#9 split ' + g + '.n', r.split[g].n, SP[g]); const sb = r.split[g].b.reduce((a, z) => a + z.x, 0); eq('#9 сумма колонок ' + g, sb, r.split[g].x); });
    // #9.1: xg — размеры 3-бетов группы; окно «Диапазон» (xgR) — по одной записи на раздачу с рукой
    ['TOT', 'IP', 'SB', 'BB'].forEach(g => {
      const inG = (o) => g === 'TOT' || (g === 'IP' ? o.p === 'CO' || o.p === 'BTN' : g === 'SB' ? o.p === 'SB' : o.p === 'BB' && !o.bvb);
      const exp = opp.filter(o => !o.iso && inG(o) && c.hc[o.i] >= 0);
      const n = r.xgR[g].rmx.reduce((a, m) => a + m.n, 0); eq('#9.1 окно «Диапазон» ' + g + ': раздач', n, exp.length);
      const sum = r.xgR[g].rmx.reduce((a, m) => a + m.sum, 0); eq('#9.1 окно «Диапазон» ' + g + ': сумма', sum, exp.reduce((a, o) => a + c.net[o.i], 0));
      const tb3 = opp.filter(o => !o.iso && inG(o) && o.a >= 2 && (o.a === 3 || c.osz[o.i] > 0));
      eq('#9.1 3-бетов в таблице ' + g, r.xg[g].reduce((a, z) => a + z.n, 0), tb3.length);
      const bx = r.xg[g].reduce((a, z) => a + (z.rmx ? z.rmx.reduce((s, m) => s + m.n, 0) : 0), 0); eq('#9.1 окно размеров (руки 3-бетов) ' + g, bx, tb3.filter(o => c.hc[o.i] >= 0).length);
    });
    // тип 3-бета из шапки (#5, #7, #7.1): только 3-беты этого типа в числителе и результате; остальное без изменений
    for (const ty of ['nai', 'ai']) {
      const A = ty === 'ai' ? 3 : 2, pick = ty;
      // то же преобразование, что в renderTB (r57)
      const typed = (z, num, sub) => !z ? z : Object.assign({}, z, { [num]: sub ? (pick === 'ai' ? z.ai : z[num] - z.ai) : (pick === 'ai' ? 0 : z[num]), ai: pick === 'ai' ? z.ai : 0, sum: pick === 'ai' ? z.sI : z.sN, es: pick === 'ai' ? z.eI : z.eN, sn: pick === 'ai' ? z.nI : z.nN });
      const rt = Object.assign({}, r, { sz: Object.fromEntries(Object.entries(r.sz).map(([p, arr]) => [p, arr.map(z => typed(z, 'rz', false))])), ostk: Object.fromEntries(Object.entries(r.ostk).map(([p, arr]) => [p, arr.map(z => typed(z, 'x', true))])), vs: Object.fromEntries(Object.entries(r.vs).map(([p, row]) => [p, Object.fromEntries(Object.entries(row).map(([op, z]) => [op, Object.assign({}, z, { x: z[pick] })]))])) });
      r.TB_COLS.forEach(k => {
        eq('тип ' + ty + ': #3 не меняется ' + k, rt.tb[k].x, r.tb[k].x); eq('тип ' + ty + ': #3 4-бет не меняется ' + k, rt.f4[k].n, r.f4[k].n);
        const os = [0, 0, 0].map(() => ({ x: 0, ai: 0, sum: 0, sn: 0 })), sz = [0, 0, 0, 0, 0].map(() => ({ rz: 0, ai: 0, sum: 0, sn: 0, n: 0 }));
        for (const o of opp) { if (o.iso || !cols(o).includes(k)) continue; const i = o.i, hit = o.a >= 2 && (A === 3) === o.ai;
          if (c.ostk[i] >= 0) { const s = c.ostk[i] / 10, q = os[s < 20 ? 0 : s < 40 ? 1 : 2]; if (hit) { q.x++; if (A === 3) q.ai++; q.sum += c.net[i]; q.sn++; } }
          if (c.osz[i] >= 0) { const q = sz[SZB.findIndex(v => c.osz[i] < v)]; q.n++; if (hit) { q[A === 3 ? 'ai' : 'rz']++; q.sum += c.net[i]; q.sn++; } } }
        os.forEach((q, j) => ['x', 'ai', 'sum', 'sn'].forEach(f => eq('тип ' + ty + ': #7.1 ' + k + '[' + j + '].' + f, rt.ostk[k][j][f], q[f])));
        sz.forEach((q, j) => ['n', 'rz', 'ai', 'sum', 'sn'].forEach(f => eq('тип ' + ty + ': #7 ' + k + '[' + j + '].' + f, rt.sz[k][j][f], q[f])));
      });
      ['MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'].forEach(p => { let x = 0, n = 0; Object.values(rt.vs[p] || {}).forEach(z => { x += z.x; n += z.n; }); const exp = opp.filter(o => !o.iso && o.p === p && o.op); eq('тип ' + ty + ': #5 ' + p + ' n', n, exp.length); eq('тип ' + ty + ': #5 ' + p + ' x', x, exp.filter(o => o.a >= 2 && (A === 3) === o.ai).length);
        Object.entries(rt.vs[p] || {}).forEach(([op, z]) => { eq('тип ' + ty + ': #5 ' + p + '/' + op + ' x = ' + ty, z.x, (r.vs[p][op] || {})[ty] || 0); }); });
    }
    return { out, n: opp.length };
  });
  console.log('возможностей:', res.n, 'расхождений:', res.out.length); res.out.slice(0, 60).forEach(x => console.log(' ', x));
  console.log('errs', errs); await b.close();
})();
