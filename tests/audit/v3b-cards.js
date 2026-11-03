// «Против 3-бета», карточки 3, 16, 17, 18 (0.7.55): числа на странице против независимого пересчёта по колонкам базы
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('mda.welcome.later', '1'); } catch (e) {} });
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('http://127.0.0.1:8783/MDA-Lab-preview.html');
  await pg.waitForFunction(() => typeof DB !== 'undefined' && DB && DB.cols && DB.cols.v3k, null, { timeout: 180000 });
  const combos = [{}, { S: 's40p' }, { T: 'ai' }, { P: 'oop' }, { B: 'sq', SQ: ['r', 'c'] }, { A: ['call'] }];
  let bad = [], checks = 0;
  for (const cb of combos) {
    const r = await pg.evaluate((cb) => {
      for (const k in SECF) delete SECF[k]; Object.assign(secF('vs3bet'), cb); V3_C3POS = 'all'; V3_C1MODE = 'all'; __go('vs3bet', 'TOT');
      const c = DB.cols, FP = ['EP', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'], idx = currentIdx(), f = secF('vs3bet'), sr = secRange('vs3bet');
      // отбор «по смыслу» — асR (ваше открытие); фильтры S, T, B, P (без «нашего действия» — у этих карточек его нет)
      const ok = (i) => c.v3[i] >= 0 && (!sr || (c.bb[i] >= sr[0] * 10 && c.bb[i] < sr[1] * 10)) && (!cb.T || c.v3a[i] === (cb.T === 'ai' ? 1 : 0)) && (!cb.P || c.v3p[i] === (cb.P === 'ip' ? 1 : 0)) && (cb.B !== 'sq' || c.v3o[i] === 1);
      const okNoP = (i) => c.v3[i] >= 0 && (!sr || (c.bb[i] >= sr[0] * 10 && c.bb[i] < sr[1] * 10)) && (!cb.T || c.v3a[i] === (cb.T === 'ai' ? 1 : 0)) && (cb.B !== 'sq' || c.v3o[i] === 1);
      const A = idx.filter(ok), out = [];
      // #18 — те же раздачи, что карточка 1: в «сквиз поте» с подтумблером «вы коллер» — и ваши коллы открытия (c3)
      const okC = (i) => cb.B === 'sq' && c.c3[i] >= 0 && (!sr || (c.bb[i] >= sr[0] * 10 && c.bb[i] < sr[1] * 10)) && (!cb.T || c.c3a[i] === (cb.T === 'ai' ? 1 : 0)) && (!cb.P || c.c3p[i] === (cb.P === 'ip' ? 1 : 0));
      const A18 = idx.filter(i => ok(i) || okC(i)), RV = (i) => (c.c3[i] >= 0 ? c.c3[i] : c.v3[i]);
      const card = (n) => { const t = [...document.querySelectorAll('#content .num-tag')].find(x => x.textContent === n); return t && t.closest('.insight'); };
      const pct = (x, n) => (n ? fmtPct(x / n) : null);
      // #18: TOT — фолд, колл, 4-бет
      { const el = card('#18'), cells = [...el.querySelectorAll('td.c')].filter(td => td.dataset.col === 'TOT'); const n = A18.length, f0 = A18.filter(i => RV(i) === 0).length, f1 = A18.filter(i => RV(i) === 1).length, f2 = A18.filter(i => RV(i) >= 2).length;
        out.push(['#18 фолд TOT', cells[0] && cells[0].firstChild.textContent.trim(), pct(f0, n)], ['#18 колл TOT', cells[1] && cells[1].firstChild.textContent.trim(), pct(f1, n)], ['#18 4-бет TOT', cells[2] && cells[2].firstChild.textContent.trim(), pct(f2, n)]); }
      // #3: число раздач в сценариях 1 и 2
      { const el = card('#3'), hds = [...el.querySelectorAll('.v3e-hd span')].map(s => parseInt(s.textContent.replace(/\s/g, ''), 10)); out.push(['#3 сценарий 1', hds[0], A.filter(i => c.v3e[i] === 1).length], ['#3 сценарий 2', hds[1], A.filter(i => c.v3e[i] === 2).length]); }
      // #16: сумма чисел раздач в ячейках «Фолд» OOP и IP (P не применяется)
      { const el = card('#16'), B16 = idx.filter(i => okNoP(i) && c.v3z[i] > 0 && c.size[i] > 0 && c.v3p[i] >= 0); let s = 0; el.querySelectorAll('tbody tr:not(.v3-f5)').forEach(tr => { const tds = tr.querySelectorAll('td.c'); [tds[0], tds[2]].forEach(td => { const n = td && td.querySelector('.n'); if (n) s += +n.textContent; }); }); out.push(['#16 раздач в таблице', s, B16.length]);
        const f5 = B16.filter(i => c.v3f[i] >= 0 && c.v3p[i] === 0), cell = el.querySelector('tr.v3-f5 td.c'); out.push(['#16 фолд на 5-бет OOP', cell && cell.firstChild ? cell.firstChild.textContent.trim().replace('%', '') : '—', f5.length ? fmtPct(f5.filter(i => c.v3f[i] === 0).length / f5.length) : '—']); }
      // #1 «Все споты»: те же раздачи, что #18; «Только чистые 1vs1»: S, T, P, «тип банка» и «наше действие» не действуют
      { const el = card('#1'), v = el.querySelector('.v em'); out.push(['#1 все споты, фолд', v ? v.textContent.replace('%', '') : '—', A18.length ? fmtPct(A18.filter(i => RV(i) === 0).length / A18.length) : '—']); }
      // #2.1: строка «Все позиции» — доли фолда / колла / 4-бета те же, что в карточке 1
      { const el = card('#2.1'), tds = el ? [...el.querySelectorAll('tbody tr')][0].querySelectorAll('td.c b') : []; const n = A18.length; ['фолд', 'колл', '4-бет'].forEach((nm, k) => out.push(['#2.1 ' + nm + ' все позиции', tds[k] ? tds[k].textContent.replace('%', '') : '—', n ? fmtPct(A18.filter(i => (k === 2 ? RV(i) >= 2 : RV(i) === k)).length / n) : '—'])); }
      V3_C1MODE = 'clean'; __go('vs3bet', 'TOT');
      { const el = card('#1'), cl = idx.filter(i => c.v3[i] >= 0 && c.v3o[i] === 0 && c.v3e[i] === 0 && (!sr || (c.bb[i] >= sr[0] * 10 && c.bb[i] < sr[1] * 10)) && (!cb.T || c.v3a[i] === (cb.T === 'ai' ? 1 : 0)) && (!cb.P || c.v3p[i] === (cb.P === 'ip' ? 1 : 0)));
        const v = el.querySelector('.v em'), sub = el.querySelector('.s'); out.push(['#1 чистые, фолд', v ? v.textContent.replace('%', '') : '—', cl.length ? fmtPct(cl.filter(i => c.v3[i] === 0).length / cl.length) : '—'], ['#1 чистых спотов', sub ? parseInt((sub.textContent.match(/из ([\d\s ]+)/) || [, '0'])[1].replace(/\D/g, ''), 10) : 0, cl.length]); }
      // #17: строка 2–2,1 BB, TOT — фолд
      { const el = card('#17'), td = [...el.querySelectorAll('td.c')].find(t => t.dataset.row === '0' && t.dataset.col === 'TOT'); const z = A.filter(i => c.size[i] > 0 && c.size[i] < 215); out.push(['#17 2–2,1 BB фолд TOT', td ? td.firstChild.textContent.trim() : '—', z.length ? fmtPct(z.filter(i => c.v3[i] === 0).length / z.length) : '—']); }
      V3_C1MODE = 'all';
      return out;
    }, cb);
    for (const [name, got, want] of r) { checks++; if (String(got) !== String(want)) bad.push(JSON.stringify(cb) + ' ' + name + ': на странице ' + got + ', пересчёт ' + want); }
  }
  console.log('проверок', checks, 'расхождений', bad.length); bad.forEach(x => console.log('  ' + x)); console.log('errs', errs); await b.close();
})();
