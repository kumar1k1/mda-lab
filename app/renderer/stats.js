'use strict';
// Расчёт статов по колонкам базы рук. Работает в окне программы.
// pos: 0 EP, 1 MP, 2 HJ, 3 CO, 4 BTN, 5 SB, 6 BB
(function () {
  const POS = ['EP', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

  // Отбор раздач по фильтрам шапки и подвкладке (размер стола)
  function selectHands(db, f) {
    const c = db.cols, n = db.count, idx = [];
    for (let i = 0; i < n; i++) {
      if (f.room != null && c.room[i] !== f.room) continue;
      if (f.type != null && c.type[i] !== f.type) continue;
      if (f.from != null && c.month[i] < f.from) continue;
      if (f.to != null && c.month[i] > f.to) continue;
      if (f.tbl === '6max' && c.tbl[i] !== 6) continue;
      if (f.tbl === '9max' && c.tbl[i] === 6) continue;
      if (f.minBB != null && c.bb[i] < f.minBB * 10) continue;
      if (f.maxBB != null && c.bb[i] >= f.maxBB * 10) continue;
      idx.push(i);
    }
    return idx;
  }

  // Счётчик доли: x из n
  const cell = () => ({ x: 0, n: 0 });
  const grid = (rows, cols) => { const g = {}; rows.forEach(r => { g[r] = {}; cols.forEach(k => { g[r][k] = cell(); }); }); return g; };
  const add = (c, hit) => { c.n++; if (hit) c.x++; };

  const STACKS = [['30+', 30, 1e9], ['20-30', 20, 30], ['16-20', 16, 20], ['12-16', 12, 16]];
  const SIZES = [['2-2.25', 0, 225], ['2.25-2.6', 225, 260], ['2.6-3.5', 260, 351]];
  const RFI_COLS = ['TOT', 'EP', 'MP', 'HJ', 'CO', 'BTN'];
  const ISO_COLS = ['TOT', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

  function rfi(db, idx) {
    const c = db.cols;
    const tot = grid(['TOT'], RFI_COLS);
    const nai = grid(['NAI'].concat(SIZES.map(s => s[0])), RFI_COLS);
    const stk = grid(STACKS.map(s => s[0]), RFI_COLS);
    const iso = grid(['vs1', 'vs1f', 'vs2', 'vs2f'], ISO_COLS);
    for (const i of idx) {
      const p = c.pos[i], a = c.act[i];
      if (c.sit[i] === 0 && p <= 4) {
        const raised = a === 2 || a === 3;
        const keys = ['TOT', POS[p]];
        keys.forEach(k => {
          add(tot.TOT[k], raised);
          add(nai.NAI[k], a === 2);
          SIZES.forEach(s => add(nai[s[0]][k], a === 2 && c.size[i] >= s[1] && c.size[i] < s[2]));
        });
        const bb = c.bb[i] / 10;
        const st = STACKS.find(s => bb >= s[1] && bb < s[2]);
        if (st) keys.forEach(k => add(stk[st[0]][k], a === 2)); // по стеку — открытия не олл-ином, как в HUD
      }
      if (c.sit[i] === 1 && p >= 1) {
        const one = c.lim[i] === 1;
        const raised = a === 2 || a === 3;
        const bvb = c.bvb ? c.bvb[i] === 1 : false;
        const fvr = c.fvr ? c.fvr[i] : -1;
        ['TOT', POS[p]].forEach(k => {
          if (!bvb || k === 'TOT') add(iso[one ? 'vs1' : 'vs2'][k], raised); // в колонке BB — без блайнда против блайнда, в TOT — все (как в HUD)
          if (fvr >= 0) add(iso[one ? 'vs1f' : 'vs2f'][k], fvr === 1); // фолд героя на лимп-рейз после изолейта
        });
      }
    }
    return { tot, nai, stk, iso, RFI_COLS, ISO_COLS, STACKS: STACKS.map(s => s[0]), SIZES: SIZES.map(s => s[0]) };
  }


  // Сводка для вкладки RFI: тренды, стил, результат, воронка, матрица рук, календарь
  const SHOVE_STK = [['<8', 0, 8], ['8–10', 8, 10], ['10–12', 10, 12], ['12–15', 12, 15], ['15–20', 15, 20], ['20+', 20, 1e9]];
  function rfiExtra(db, idx, opt) {
    const c = db.cols, has = (k) => Array.isArray(c[k]);
    const R = () => ({ x: 0, n: 0 });
    const out = {
      all: R(), month: {}, last30: R(), late: R(), latePos: { CO: R(), BTN: R() }, shove: R(), shoveStk: SHOVE_STK.map(() => R()), pko: R(), reg: R(), rooms: {}, win30: [],
      openNet: { sum: 0, n: 0 }, openNetPos: {}, netUnc: { sum: 0, n: 0 }, resp: [0, 0, 0], netMx: {}, netCon: { sum: 0, n: 0 }, sto: R(), f3b: R(),
      funnel: { opp: 0, open: 0, nai: 0, std: 0 }, seats: {}, mx: [], cal: {}, maxDay: 0
    };
    for (let k = 0; k < 169; k++) out.mx.push(R());
    POS.forEach(p => { out.seats[p] = R(); out.openNetPos[p] = { sum: 0, n: 0 }; out.netMx[p] = Array.from({ length: 169 }, () => ({ n: 0, sum: 0 })); });
    let maxDay = 0;
    if (has('day')) for (const i of idx) if (c.day[i] > maxDay) maxDay = c.day[i];
    out.maxDay = maxDay;
    for (const i of idx) {
      const p = c.pos[i], a = c.act[i], open = a === 2 || a === 3;
      if (has('day')) {
        const d = out.cal[c.day[i]] || (out.cal[c.day[i]] = { hands: 0, x: 0, n: 0, net: 0 });
        d.hands++; if (has('net')) d.net += c.net[i];
        if (c.sit[i] === 0 && p <= 4) { d.n++; if (open) d.x++; }
      }
      if (c.sit[i] !== 0 || p === 6) continue;
      // места за столом (включая SB)
      out.seats[POS[p]].n++; if (open) out.seats[POS[p]].x++;
      if (p === 3 || p === 4) { out.late.n++; if (open) out.late.x++; const lp = out.latePos[POS[p]]; lp.n++; if (open) lp.x++; }
      out.funnel.opp++;
      if (open) { out.funnel.open++; if (a === 2) { out.funnel.nai++; if (c.size[i] < 225) out.funnel.std++; } }
      if (open) { out.shove.n++; if (a === 3) out.shove.x++; const sb = c.bb[i] / 10; const k = SHOVE_STK.findIndex(z => sb >= z[1] && sb < z[2]); if (k >= 0) { out.shoveStk[k].n++; if (a === 3) out.shoveStk[k].x++; } }
      if (has('net') && has('hc') && open && c.hc[i] >= 0) { const m = out.netMx[POS[p]][c.hc[i]]; m.n++; m.sum += c.net[i]; }
      if (has('net') && open) { out.openNet.sum += c.net[i]; out.openNet.n++; out.openNetPos[POS[p]].sum += c.net[i]; out.openNetPos[POS[p]].n++; if (has('sto') && c.sto[i] >= 0) { const g = c.sto[i] === 1 ? out.netUnc : out.netCon; g.sum += c.net[i]; g.n++; } }
      if (has('sto') && c.sto[i] >= 0) { out.sto.n++; if (c.sto[i] === 1) out.sto.x++; }
      if (has('f3b') && c.f3b[i] >= 0) { out.f3b.n++; if (c.f3b[i] === 1) out.f3b.x++; }
      if (has('hc') && c.hc[i] >= 0 && (opt.mxPos === 'TOT' ? p <= 5 : POS[p] === opt.mxPos) && (!opt.mxStk || (c.bb[i] >= opt.mxStk[0] * 10 && c.bb[i] < opt.mxStk[1] * 10))) { const m = out.mx[c.hc[i]]; m.n++; if (open) m.x++; if (a === 3) m.ai = (m.ai || 0) + 1; if (a === 1) m.lp = (m.lp || 0) + 1; }
      if (p > 4) continue; // ниже — RFI как в таблице: EP..BTN
      out.all.n++; if (open) out.all.x++;
      if (open && has('orsp') && c.orsp[i] >= 0) out.resp[c.orsp[i]]++;
      const mo = out.month[c.month[i]] || (out.month[c.month[i]] = R()); mo.n++; if (open) mo.x++;
      if (has('day') && c.day[i] > maxDay - 30) { out.last30.n++; if (open) out.last30.x++; }
      if (has('day')) { const w = Math.floor((maxDay - c.day[i]) / 30); const b = out.win30[w] || (out.win30[w] = R()); b.n++; if (open) b.x++; }
      const t = c.type[i] === 1 ? out.pko : out.reg; t.n++; if (open) t.x++;
      const r = out.rooms[c.room[i]] || (out.rooms[c.room[i]] = R()); r.n++; if (open) r.x++;
    }
    out.SHOVE_STK = SHOVE_STK.map(z => z[0]);
    for (let w = 0; w < out.win30.length; w++) if (!out.win30[w]) out.win30[w] = R();
    return out;
  }


  // Подробно о стиле с CO и BTN
  const STEAL_STK = [['<12', 0, 12], ['12–20', 12, 20], ['20–30', 20, 30], ['30+', 30, 1e9]];
  const STEAL_SZ = [['2–2.25', 0, 225], ['2.25–2.6', 225, 260], ['2.6+', 260, 1e9]];
  const BLIND_STK = [['≤10', 0, 10], ['10–20', 10, 20], ['20+', 20, 1e9]];
  function stealExtra(db, idx) {
    const c = db.cols, has = (k) => Array.isArray(c[k]);
    const R = () => ({ x: 0, n: 0 });
    const Z = () => ({ sum: 0, n: 0, ids: [] });
    const mk = () => ({ all: R(), stk: STEAL_STK.map(R), resp: [0, 0, 0], f3b: R(), net: { sum: 0, n: 0 }, sz: [0, 0, 0, 0], szx: {}, month: {}, blind: BLIND_STK.map(R),
      // результат стила (BB×10) по разрезам, с номерами раздач для списка
      nr: { all: Z(), resp: [Z(), Z(), Z()], stk: STEAL_STK.map(Z), kind: [Z(), Z()], type: [Z(), Z()], fight: [Z(), Z()], room: {}, month: {} } });
    const out = { CO: mk(), BTN: mk() };
    for (const i of idx) {
      const p = c.pos[i]; if (c.sit[i] !== 0 || (p !== 3 && p !== 4)) continue;
      const o = out[p === 3 ? 'CO' : 'BTN'], open = c.act[i] >= 2;
      o.all.n++; if (open) o.all.x++;
      const sb = c.bb[i] / 10; const k = STEAL_STK.findIndex(z => sb >= z[1] && sb < z[2]); if (k >= 0) { o.stk[k].n++; if (open) o.stk[k].x++; }
      const mo = o.month[c.month[i]] || (o.month[c.month[i]] = R()); mo.n++; if (open) mo.x++;
      if (has('bmin') && c.bmin[i] >= 0) { const bk = BLIND_STK.findIndex(z => c.bmin[i] / 10 >= z[1] && c.bmin[i] / 10 < z[2]); if (bk >= 0) { o.blind[bk].n++; if (open) o.blind[bk].x++; } }
      if (!open) continue;
      if (has('orsp') && c.orsp[i] >= 0) o.resp[c.orsp[i]]++;
      if (has('f3b') && c.f3b[i] >= 0) { o.f3b.n++; if (c.f3b[i] === 1) o.f3b.x++; }
      if (has('net')) {
        o.net.sum += c.net[i]; o.net.n++;
        const v = c.net[i], put = (z) => { z.sum += v; z.n++; z.ids.push(i); };
        put(o.nr.all);
        if (has('orsp') && c.orsp[i] >= 0) put(o.nr.resp[c.orsp[i]]);
        if (k >= 0) put(o.nr.stk[k]);
        put(o.nr.kind[c.act[i] === 3 ? 1 : 0]);
        put(o.nr.type[c.type[i] === 1 ? 1 : 0]);
        if (has('sto') && c.sto[i] >= 0) put(o.nr.fight[c.sto[i] === 1 ? 0 : 1]);
        put(o.nr.room[c.room[i]] || (o.nr.room[c.room[i]] = Z()));
        const mz = o.nr.month[c.month[i]] || (o.nr.month[c.month[i]] = { sum: 0, n: 0 }); mz.sum += v; mz.n++;
      }
      { // точный сайзинг: пуш отдельно, рейзы с точностью до 0.1 BB; рейз, после которого за спиной меньше 0.5 BB, — тоже пуш (так пишет PokerDom)
        const behind = c.bb[i] / 10 - c.size[i] / 100;
        const key = c.act[i] === 3 || behind < 0.5 ? 'AI' : String(Math.round(c.size[i] / 10) / 10);
        const z = o.szx[key] || (o.szx[key] = { n: 0, r: [0, 0, 0], rn: 0, sum: 0, sn: 0, ids: [] });
        z.n++; z.ids.push(i);
        if (has('orsp') && c.orsp[i] >= 0) { z.r[c.orsp[i]]++; z.rn++; }
        if (has('net')) { z.sum += c.net[i]; z.sn++; }
      }
      if (c.act[i] === 3) o.sz[3]++; else { const z = STEAL_SZ.findIndex(q => c.size[i] >= q[1] && c.size[i] < q[2]); if (z >= 0) o.sz[z]++; }
    }
    out.STK = STEAL_STK.map(z => z[0]); out.SZ = STEAL_SZ.map(z => z[0]).concat(['пуш']); out.BLIND = BLIND_STK.map(z => z[0]);
    return out;
  }

  window.Stats = { POS, selectHands, rfi, rfiExtra, stealExtra };
})();
