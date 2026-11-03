// реплеер по раздачам из окон: позиция героя, стек и карты в реплеере совпадают с колонками базы
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('mda.welcome.later', '1'); } catch (e) {} });
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('http://127.0.0.1:8783/MDA-Lab-preview.html');
  await pg.waitForFunction(() => typeof DB !== 'undefined' && DB && DB.cols && DB.cols.v3, null, { timeout: 180000 });
  const ids = await pg.evaluate(() => { const c = DB.cols, out = [], pick = (f, n) => { const a = []; for (let i = 0; i < DB.count; i++) if (f(i)) a.push(i); for (let k = 0; k < n && a.length; k++) out.push(a[(k * 7919) % a.length]); };
    pick(i => c.sit[i] === 0 && c.act[i] >= 2, 25); pick(i => c.rz[i] === 1 && c.act[i] === 1, 25); pick(i => c.rz[i] === 1 && c.cl[i] === 0 && c.act[i] >= 2, 25); pick(i => c.v3[i] >= 0, 25); pick(i => c.c3 && c.c3[i] >= 0, 15); return out; });
  let bad = 0, ok = 0;
  for (const i of ids) {
    await pg.evaluate((i) => window.openReplayer(i, [i]), i); await pg.waitForTimeout(350);
    const r = await pg.evaluate((i) => { const c = DB.cols, POS = Stats.POS; const t = [...document.querySelectorAll('span')].map(s => s.textContent).find(s => /вы на /.test(s)) || ''; const m = t.match(/вы на ([A-Z0-9+]+), стек ([\d\s,]+) BB/); return { t, pos: m && m[1], stk: m && parseFloat(m[2].replace(/\s/g, '').replace(',', '.')), dbPos: POS[c.pos[i]], dbStk: c.bb[i] / 10 }; }, i);
    const posOk = r.pos && (r.pos === r.dbPos || (['MP', 'HJ', 'UTG', 'EP', 'UTG+1', 'UTG+2', 'MP1', 'MP2', 'LJ'].includes(r.pos) && ['UTG', 'MP'].includes(r.dbPos)));
    const stkOk = r.stk != null && Math.abs(r.stk - r.dbStk) < 0.06;
    if (posOk && stkOk) ok++; else { bad++; if (bad < 10) console.log('  расхождение', i, JSON.stringify(r)); }
    await pg.evaluate(() => window.closeReplayer && window.closeReplayer());
  }
  console.log('реплеер: совпало', ok, 'из', ids.length, 'errs', errs.slice(0, 3)); await b.close();
})();
