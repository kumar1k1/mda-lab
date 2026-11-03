// пустые ячейки групп рук («—», без .click) окна не имеют — не берём; живой сценарий мышью: наведение → клик (окно закрепилось) → клик по руке (список раздач) → ▶ (реплеер) → закрыть; 4 вкладки × 2 набора фильтров
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('mda.welcome.later', '1'); } catch (e) {} });
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('http://127.0.0.1:8783/MDA-Lab-preview.html');
  await pg.waitForFunction(() => typeof DB !== 'undefined' && DB && DB.cols && DB.cols.v3, null, { timeout: 180000 });
  let ok = 0, tried = 0; const fails = [], kinds = {};
  const SEL = '#content .net-bar, #content td.c.click, #content .sz5-r.has-mx, #content .sz5-r.click, #content .hg-c.click, #content .pmx-c, #content .bx-c';
  const reset = () => pg.evaluate(() => { if (window.closeReplayer) closeReplayer(); if (window.unpinSzMx) unpinSzMx(); if (window.unpin) unpin(); if (window.hideHandPop) hideHandPop(); if (window.hideSzMx) hideSzMx(); });
  for (const tab of ['rfi', 'cc', '3bet', 'vs3bet']) for (const f of [{}, { S: 's25', T: 'nai' }]) {
    await pg.evaluate(([t, f]) => { for (const k in SECF) delete SECF[k]; Object.assign(secF(t), f); if (!SEC_TYPES[t]) delete secF(t).T; __go(t, 'TOT'); }, [tab, f]); await pg.waitForTimeout(400);
    const n = await pg.locator(SEL).count();
    for (let k = 0; k < n; k += Math.max(1, Math.floor(n / 14))) {
      tried++; const lab = tab + (f.S ? ' (стек 15–25, не олл-ин)' : '');
      try {
        const e = pg.locator(SEL).nth(k); await e.scrollIntoViewIfNeeded(); await pg.mouse.move(5, 5); await e.hover({ timeout: 2000 }); await pg.waitForTimeout(120); await e.click({ timeout: 2000 }); await pg.waitForTimeout(250);
        const kind = await pg.evaluate(() => { const hp = document.querySelector('.hand-pop.pinned'); if (hp && !hp.hidden) return 'hp'; const sz = document.querySelector('.szmx'); if (sz && !sz.hidden) return 'sz'; return null; });
        if (!kind) { fails.push(lab + ' #' + k + ': окно не закрепилось'); await reset(); continue; }
        kinds[kind] = (kinds[kind] || 0) + 1;
        const cellSel = kind === 'hp' ? '.hand-pop.pinned .hp-c[title*="показать"]:not(.out):not(.na)' : '.szmx .mx-c.click, .szmx .szv-c.click';
        const cells = pg.locator(cellSel); const cn = await cells.count();
        if (!cn) { ok++; await reset(); continue; }
        await cells.nth(Math.floor(cn / 3)).click({ timeout: 2000 }); await pg.waitForTimeout(500);
        const play = pg.locator('.hp-play:visible').first();
        if (!(await play.count())) { const msg = await pg.evaluate(() => (document.querySelector('.hp-list, .szmx-list, .hp-rows') || {}).innerText || ''); if (/Нет раздач|не было/.test(msg)) { ok++; await reset(); continue; } fails.push(lab + ' #' + k + ': список раздач не открылся'); await reset(); continue; }
        await play.click({ timeout: 2000 }); await pg.waitForTimeout(600);
        const open = await pg.evaluate(() => { const r = document.querySelector('.rv-bg'); return !!(r && !r.hidden); });
        if (open) ok++; else fails.push(lab + ' #' + k + ': реплеер не открылся');
      } catch (err) { fails.push(lab + ' #' + k + ': ' + err.message.split('\n')[0].slice(0, 90)); }
      await reset();
    }
  }
  console.log('сценариев', tried, 'успешно', ok, 'окна', JSON.stringify(kinds)); fails.slice(0, 25).forEach(x => console.log('  ' + x)); console.log('errs', errs.slice(0, 5)); await b.close();
})();
