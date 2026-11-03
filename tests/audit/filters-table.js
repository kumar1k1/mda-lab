// Таблица CARD_FILTERS (sec-filters.js) против поведения программы: для каждого раздела включаем по одному фильтру раздела
// и смотрим, какие карточки поменялись. Карточка с буквой фильтра должна поменяться, без буквы — остаться как была.
// Плюс: в разделе нет карточек, которых нет в таблице, и метка «без фильтров раздела» стоит ровно на карточках с ''.
const { chromium } = require('playwright');
const FL = { S: { S: 's15' }, T: { T: 'ai' }, A: { A: ['call'] }, B: { B: 'sq', SQ: ['r', 'c'] }, P: { P: 'ip' } };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('mda.welcome.later', '1'); } catch (e) {} });
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('http://127.0.0.1:8783/MDA-Lab-preview.html');
  await pg.waitForFunction(() => typeof DB !== 'undefined' && DB && DB.cols && DB.cols.v3, null, { timeout: 180000 });
  let bad = 0, checks = 0;
  const snap = (tab, f) => pg.evaluate(([tab, f]) => { for (const k in SECF) delete SECF[k]; Object.assign(secF(tab), f); __go(tab, 'TOT'); const o = {}; document.querySelectorAll('#content .num-tag').forEach(t => { const c = t.closest('.sm, .r34-m, .insight, .block'); if (!c) return; const cl = c.cloneNode(true); cl.querySelectorAll('.sec-exempt, .sec-on').forEach(x => x.remove()); o[t.textContent.trim()] = { txt: cl.innerText.replace(/\s+/g, ' '), mark: !!(t.closest('.insight, .block') || c).querySelector(':scope > .sec-exempt') }; }); return { o, table: CARD_FILTERS[tab] }; }, [tab, f]);
  for (const tab of ['rfi', 'cc', '3bet', 'vs3bet', 'sqz']) {
    const base = await snap(tab, {}), T = base.table;
    const cards = Object.keys(base.o);
    const extra = cards.filter(k => !(k in T)), missing = Object.keys(T).filter(k => !cards.includes(k));
    if (extra.length || missing.length) { bad++; console.log(tab, 'карточки вне таблицы:', extra.join(' ') || '—', '| в таблице, но нет на странице:', missing.join(' ') || '—'); }
    const used = [...new Set(Object.values(T).join(''))];
    for (const L of used) {
      const s = await snap(tab, FL[L]);
      for (const k of cards) {
        if (!(k in T)) continue; checks++;
        const changed = s.o[k] && s.o[k].txt !== base.o[k].txt, want = T[k].includes(L);
        if (changed !== want) { bad++; console.log('  ', tab, k, 'фильтр', L, want ? 'должен действовать, но карточка не изменилась' : 'не должен действовать, но карточка изменилась'); }
        const mk = s.o[k] && s.o[k].mark, wantMk = T[k] === '';
        if (mk !== wantMk) { bad++; console.log('  ', tab, k, 'метка «без фильтров раздела»:', mk ? 'есть' : 'нет', '— ожидалось', wantMk ? 'есть' : 'нет'); }
      }
    }
    console.log(tab.padEnd(7), 'карточек', cards.length, 'фильтров', used.join(''));
  }
  console.log('проверок', checks, 'ошибок', bad, 'errs', errs); await b.close();
  process.exitCode = bad || errs.length ? 1 : 0;
})();
