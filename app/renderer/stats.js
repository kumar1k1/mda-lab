'use strict';
// Расчёт статов по колонкам базы рук. Работает в окне программы.
// pos (как в Hand2Note): 0 UTG, 1 MP, 2 HJ — не используется, 3 CO, 4 BTN, 5 SB, 6 BB
(function () {
  const POS = ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB']; // позиции как в Hand2Note; HJ (2) не используется — входит в MP

  // Отбор раздач по фильтрам шапки и подвкладке (размер стола)
  function selectHands(db, f) {
    const c = db.cols, n = db.count, idx = [];
    for (let i = 0; i < n; i++) {
      if (f.aid != null && c.aid && c.aid[i] !== f.aid) continue; // в базе несколько алиасов — только раздачи выбранного
      if (f.room != null && c.room[i] !== f.room) continue;
      if (f.type != null && c.type[i] !== f.type) continue;
      if (f.from != null && c.month[i] < f.from) continue;
      if (f.to != null && c.month[i] > f.to) continue;
      if (f.tbl === '6max' && c.tbl[i] !== 6) continue;
      if (f.tbl === '9max' && c.tbl[i] === 6) continue;
      if ((f.biFrom != null || f.biTo != null) && (!c.bi || c.bi[i] < 0)) continue; // при фильтре по бай-ину — только раздачи с известным бай-ином
      if (f.biFrom != null && c.bi[i] < f.biFrom) continue;
      if (f.biTo != null && c.bi[i] > f.biTo) continue;
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
  const RFI_COLS = ['TOT', 'UTG', 'MP', 'CO', 'BTN'];
  const ISO_COLS = ['TOT', 'MP', 'CO', 'BTN', 'SB', 'BB'];

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
          add(iso[one ? 'vs1' : 'vs2'][k], raised); // как в Hand2Note: в BB считается и лимп SB (блайнд против блайнда)
          if (fvr >= 0) add(iso[one ? 'vs1f' : 'vs2f'][k], fvr === 1); // фолд героя на лимп-рейз после изолейта
        });
      }
    }
    return { tot, nai, stk, iso, RFI_COLS, ISO_COLS, STACKS: STACKS.map(s => s[0]), SIZES: SIZES.map(s => s[0]) };
  }


  // Сводка для вкладки RFI: тренды, стил, результат, воронка, матрица рук, календарь
  const SHOVE_STK = [['<8', 0, 8], ['8–10', 8, 10], ['10–12', 10, 12], ['12–15', 12, 15], ['15–20', 15, 20], ['20+', 20, 1e9]];
  function rfiExtra(db, idx, opt) {
    const c = db.cols, has = (k) => c[k] != null && c[k].length === db.count, EV = c.nev || c.net;
    const R = () => ({ x: 0, n: 0 });
    const out = {
      all: R(), month: {}, last30: R(), late: R(), latePos: { CO: R(), BTN: R() }, shove: R(), shoveStk: SHOVE_STK.map(() => R()), pko: R(), reg: R(), rooms: {}, win30: [],
      openNet: { sum: 0, es: 0, n: 0 }, openNetPos: {}, respPos: {}, netUnc: { sum: 0, es: 0, n: 0 }, resp: [0, 0, 0], netMx: {}, netCon: { sum: 0, es: 0, n: 0 }, sto: R(), f3b: R(),
      funnel: { opp: 0, open: 0, nai: 0, std: 0 }, seats: {}, mx: [], cal: {}, maxDay: 0
    };
    for (let k = 0; k < 169; k++) out.mx.push(R());
    POS.forEach(p => { out.seats[p] = R(); out.openNetPos[p] = { sum: 0, es: 0, n: 0 }; out.respPos[p] = [0, 0, 0]; out.netMx[p] = Array.from({ length: 169 }, () => ({ n: 0, sum: 0, es: 0 })); });
    let maxDay = 0;
    if (has('day')) for (const i of idx) if (c.day[i] > maxDay) maxDay = c.day[i];
    out.maxDay = maxDay;
    for (const i of idx) {
      // opt.ot — тип открытия из фильтра раздела: 'nai' — только не олл-ин, 'ai' — только олл-ин (открытием считается только он)
      const p = c.pos[i], a = c.act[i], open = opt.ot === 'nai' ? a === 2 : opt.ot === 'ai' ? a === 3 : a === 2 || a === 3;
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
      if (has('net') && has('hc') && open && c.hc[i] >= 0) { const m = out.netMx[POS[p]][c.hc[i]]; m.n++; m.sum += c.net[i]; m.es += EV[i]; }
      if (has('net') && open) { out.openNet.sum += c.net[i]; out.openNet.es += EV[i]; out.openNet.n++; out.openNetPos[POS[p]].sum += c.net[i]; out.openNetPos[POS[p]].es += EV[i]; out.openNetPos[POS[p]].n++; if (has('sto') && c.sto[i] >= 0) { const g = c.sto[i] === 1 ? out.netUnc : out.netCon; g.sum += c.net[i]; g.es += EV[i]; g.n++; } }
      if (has('sto') && c.sto[i] >= 0) { out.sto.n++; if (c.sto[i] === 1) out.sto.x++; }
      if (has('f3b') && c.f3b[i] >= 0) { out.f3b.n++; if (c.f3b[i] === 1) out.f3b.x++; }
      if (has('hc') && c.hc[i] >= 0 && (opt.mxPos === 'TOT' ? p <= 5 : POS[p] === opt.mxPos) && (!opt.mxStk || (c.bb[i] >= opt.mxStk[0] * 10 && c.bb[i] < opt.mxStk[1] * 10))) { const m = out.mx[c.hc[i]]; m.n++; if (open) m.x++; if (a === 3) m.ai = (m.ai || 0) + 1; if (a === 1) m.lp = (m.lp || 0) + 1; }
      if (open && has('orsp') && c.orsp[i] >= 0) out.respPos[POS[p]][c.orsp[i]]++; // ответ оппонентов по позициям, включая SB
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
  const BX_STK = [['<15', 0, 15], ['15–35', 15, 35], ['35+', 35, 1e9]]; // стек SB и BB по отдельности, BB
  function stealExtra(db, idx, opt) {
    opt = opt || {};
    const c = db.cols, has = (k) => c[k] != null && c[k].length === db.count, EV = c.nev || c.net;
    const R = () => ({ x: 0, n: 0 });
    const Z = () => ({ sum: 0, es: 0, n: 0, ids: [] });
    const mk = () => ({ all: R(), stk: STEAL_STK.map(R), resp: [0, 0, 0], f3b: R(), net: { sum: 0, es: 0, n: 0 }, sz: [0, 0, 0, 0], szx: {}, bx: BX_STK.map(() => BX_STK.map(() => ({ n: 0, x: 0, rn: 0, fold: 0, rr: 0, sum: 0, es: 0, sn: 0, ids: [] }))), month: {}, blind: BLIND_STK.map(R),
      // результат стила (BB×10) по разрезам, с номерами раздач для списка
      nr: { all: Z(), resp: [Z(), Z(), Z()], stk: STEAL_STK.map(Z), kind: [Z(), Z()], type: [Z(), Z()], fight: [Z(), Z()], room: {}, month: {} } });
    const out = { CO: mk(), BTN: mk() };
    for (const i of idx) {
      const p = c.pos[i]; if (c.sit[i] !== 0 || (p !== 3 && p !== 4)) continue;
      const o = out[p === 3 ? 'CO' : 'BTN'], open = opt.ot === 'nai' ? c.act[i] === 2 : opt.ot === 'ai' ? c.act[i] === 3 : c.act[i] >= 2;
      o.all.n++; if (open) o.all.x++;
      const sb = c.bb[i] / 10; const k = STEAL_STK.findIndex(z => sb >= z[1] && sb < z[2]); if (k >= 0) { o.stk[k].n++; if (open) o.stk[k].x++; }
      const mo = o.month[c.month[i]] || (o.month[c.month[i]] = R()); mo.n++; if (open) mo.x++;
      if (has('bmin') && c.bmin[i] >= 0) { const bk = BLIND_STK.findIndex(z => c.bmin[i] / 10 >= z[1] && c.bmin[i] / 10 < z[2]); if (bk >= 0) { o.blind[bk].n++; if (open) o.blind[bk].x++; } }
      let bxc = null;
      if (has('sbs') && c.sbs[i] >= 0 && c.bbs[i] >= 0) {
        const f = (v) => BX_STK.findIndex(z => v / 10 >= z[1] && v / 10 < z[2]);
        bxc = o.bx[f(c.sbs[i])][f(c.bbs[i])]; bxc.n++; if (open) bxc.x++;
      }
      if (!open) continue;
      if (bxc) {
        if (has('orsp') && c.orsp[i] >= 0) { bxc.rn++; if (c.orsp[i] === 0) bxc.fold++; if (c.orsp[i] === 2) bxc.rr++; }
        if (has('net')) { bxc.sum += c.net[i]; bxc.es += EV[i]; bxc.sn++; }
        bxc.ids.push(i); // раздачи открытий — для матрицы рук при наведении (3.7)
      }
      if (has('orsp') && c.orsp[i] >= 0) o.resp[c.orsp[i]]++;
      if (has('f3b') && c.f3b[i] >= 0) { o.f3b.n++; if (c.f3b[i] === 1) o.f3b.x++; }
      if (has('net')) {
        o.net.sum += c.net[i]; o.net.es += EV[i]; o.net.n++;
        const v = c.net[i], e = EV[i], put = (z) => { z.sum += v; z.es += e; z.n++; z.ids.push(i); };
        put(o.nr.all);
        if (has('orsp') && c.orsp[i] >= 0) put(o.nr.resp[c.orsp[i]]);
        if (k >= 0) put(o.nr.stk[k]);
        put(o.nr.kind[c.act[i] === 3 ? 1 : 0]);
        put(o.nr.type[c.type[i] === 1 ? 1 : 0]);
        if (has('sto') && c.sto[i] >= 0) put(o.nr.fight[c.sto[i] === 1 ? 0 : 1]);
        put(o.nr.room[c.room[i]] || (o.nr.room[c.room[i]] = Z()));
        const mz = o.nr.month[c.month[i]] || (o.nr.month[c.month[i]] = { sum: 0, es: 0, n: 0 }); mz.sum += v; mz.es += e; mz.n++;
      }
      { // точный сайзинг: пуш отдельно, рейзы с точностью до 0.1 BB; рейз, после которого за спиной меньше 0.5 BB, — тоже пуш
        const behind = c.bb[i] / 10 - c.size[i] / 100;
        const key = c.act[i] === 3 || behind < 0.5 ? 'AI' : String(Math.round(c.size[i] / 10) / 10);
        const z = o.szx[key] || (o.szx[key] = { n: 0, r: [0, 0, 0], rn: 0, sum: 0, es: 0, sn: 0, ids: [] });
        z.n++; z.ids.push(i);
        if (has('orsp') && c.orsp[i] >= 0) { z.r[c.orsp[i]]++; z.rn++; }
        if (has('net')) { z.sum += c.net[i]; z.es += EV[i]; z.sn++; }
      }
      if (c.act[i] === 3) o.sz[3]++; else { const z = STEAL_SZ.findIndex(q => c.size[i] >= q[1] && c.size[i] < q[2]); if (z >= 0) o.sz[z]++; }
    }
    out.STK = STEAL_STK.map(z => z[0]); out.SZ = STEAL_SZ.map(z => z[0]).concat(['пуш']); out.BLIND = BLIND_STK.map(z => z[0]); out.BX = BX_STK.map(z => z[0]);
    return out;
  }

  // Колд-колл: перед первым ходом героя был ровно один рейз (открытие), герой ещё не вкладывался добровольно; CC — колл этого рейза
  const CC_COLS = ['TOT', 'UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
  const CC_SZ = [['2 BB', 0, 205], ['2,1–2,3 BB', 205, 235], ['2,4–2,6 BB', 235, 265], ['2,7–3,4 BB', 265, 345], ['3,5 BB и больше', 345, 1e9]];
  const CC_AISTK = [['< 8 BB', 0, 8], ['8–12 BB', 8, 12], ['12–20 BB', 12, 20], ['20+ BB', 20, 1e9]];
  function cc(db, idx, opt) {
    opt = opt || {};
    const c = db.cols, R = () => ({ x: 0, n: 0 }), out = { cc: {} }, EV = c.nev || c.net;
    const bxCell = () => ({ n: 0, x: 0, rn: 0, fold: 0, rr: 0, sum: 0, es: 0, sn: 0 });
    out.bx = { CO: BX_STK.map(() => BX_STK.map(bxCell)), BTN: BX_STK.map(() => BX_STK.map(bxCell)) }; // колд-колл с CO/BTN по стекам SB и BB
    out.vs = {}; out.vsHands = {}; // позиция героя → позиция открывающего
    out.hands = {}; out.resp = [0, 0, 0];
    out.mx = Array.from({ length: 169 }, () => ({ n: 0, x: 0, ai: 0, lp: 0 }));
    // против сайзинга открытия (без олл-инов) и против олл-ина: по позиции героя и TOT (TOT — без BB)
    const szCell = () => ({ n: 0, call: 0, rz: 0, fold: 0, sum: 0, es: 0, sn: 0, ids: [], mx: null });
    const hset = () => ({ n: 0, sum: 0, es: 0, ids: [], mx: Array.from({ length: 169 }, () => ({ n: 0, sum: 0, es: 0 })) });
    out.sz = {}; out.ai = {}; out.aiHands = {}; out.aiStk = {};
    CC_COLS.forEach(k => { out.sz[k] = CC_SZ.map(szCell); out.ai[k] = { x: 0, n: 0 }; out.aiHands[k] = hset(); out.aiStk[k] = CC_AISTK.map(szCell); });
    out.mxO = Array.from({ length: 169 }, () => ({ n: 0, x: 0, ai: 0, lp: 0 })); // то же, но по стеку открывающего // диапазон против открытия: колл / 3-бет / олл-ин / фолд // ваш ответ на открытие (без BB): фолд / колл / рейз
    CC_COLS.forEach(k => { out.cc[k] = R(); out.hands[k] = { n: 0, sum: 0, es: 0, ids: [], mx: Array.from({ length: 169 }, () => ({ n: 0, sum: 0, es: 0 })) }; });
    if (!c.rz) return Object.assign(out, { CC_COLS, CC_SZ, CC_AISTK });
    for (const i of idx) {
      // как в Hand2Note: «перед игроком 1 Raise» — ровно один рейз, без лимперов до него и без коллеров после
      if (c.rz[i] !== 1 || (c.cl && c.cl[i] !== 0) || (c.lr && c.lr[i] !== 0)) continue;
      const p = POS[c.pos[i]], call = c.act[i] === 1;
      const c1 = call && (!c.hpa || c.hpa[i] === 1); // «Префлоп: C» — колл был единственным ходом героя на префлопе (для винрейта и рук)
      const keys = p === 'BB' ? [p] : ['TOT', p], v0 = c.net ? c.net[i] : 0, e0 = c.net ? EV[i] : 0, a0 = c.act[i];
      const shove = c.rai && (c.rai[i] === 1 || (c.osz && c.ostk && c.osz[i] >= 0 && c.osz[i] / 100 >= c.ostk[i] / 10 - 0.5)); // открытие олл-ином (или почти всем стеком)
      if (shove) {
        keys.forEach(k => {
          const z = out.ai[k]; z.n++; if (call) z.x++;
          const sk = CC_AISTK.findIndex(q => c.ostk[i] / 10 >= q[1] && c.ostk[i] / 10 < q[2]);
          if (sk >= 0) { const q = out.aiStk[k][sk]; q.n++; if (call) { q.call++; if (c1) { q.sum += v0; q.es += e0; q.sn++; } } else if (a0 >= 2) q.rz++; else q.fold++; }
          if (c1 && c.hc[i] >= 0) { const h = out.aiHands[k], m = h.mx[c.hc[i]]; h.n++; h.sum += v0; h.es += e0; h.ids.push(i); m.n++; m.sum += v0; m.es += e0; }
        });
      } else if (c.osz && c.osz[i] >= 0) {
        const sk = CC_SZ.findIndex(q => c.osz[i] >= q[1] && c.osz[i] < q[2]);
        // защита BB: минимальная частота защиты (MDF) для этой раздачи — банк до открытия / (банк + ставка открывающего);
        // анте — настоящее из раздачи (колонка ant); в базах, собранных до неё, — 1 BB (как анте большого блайнда)
        const mdf = p === 'BB' ? (() => { const S = c.osz[i] / 100, bvb = POS[c.opos[i]] === 'SB', A = c.ant && c.ant[i] >= 0 ? c.ant[i] / 100 : 1, pot = (bvb ? 1 : 1.5) + A, bet = bvb ? S - 0.5 : S; return pot / (pot + bet); })() : 0;
        if (sk >= 0) keys.forEach(k => { const q = out.sz[k][sk]; q.n++; q.mdf = (q.mdf || 0) + mdf;
          // матрица ответа этим размером: колл / 3-бет / олл-ин / фолд по рукам (для окна при наведении на строку #6)
          if (c.hc[i] >= 0) { if (!q.rmx) q.rmx = Array.from({ length: 169 }, () => ({ n: 0, x: 0, ai: 0, lp: 0, sum: 0, es: 0 })); const m = q.rmx[c.hc[i]]; m.n++; m.sum += v0; m.es += e0; (q.rids || (q.rids = [])).push(i); if (a0 === 1) m.lp++; else if (a0 >= 2) { m.x++; if (a0 === 3) m.ai++; } } if (call) { q.call++; if (c1) { q.sum += v0; q.es += e0; q.sn++; } if (c1 && c.hc[i] >= 0) { if (!q.mx) q.mx = Array.from({ length: 169 }, () => ({ n: 0, sum: 0, es: 0 })); q.ids.push(i); q.mx[c.hc[i]].n++; q.mx[c.hc[i]].sum += v0; q.mx[c.hc[i]].es += e0; } } else if (a0 >= 2) q.rz++; else q.fold++; });
      }
      (p === 'BB' ? [out.cc[p]] : [out.cc.TOT, out.cc[p]]).forEach(z => { z.n++; if (call) z.x++; }); // TOT — без BB
      if (c.hc[i] >= 0 && p === opt.mxPos && (!opt.mxStk || (c.bb[i] >= opt.mxStk[0] * 10 && c.bb[i] < opt.mxStk[1] * 10))) {
        const m = out.mx[c.hc[i]], a = c.act[i]; m.n++;
        if (a === 1) m.lp++; else if (a >= 2) { m.x++; if (a === 3) m.ai++; }
      }
      if (c.hc[i] >= 0 && p === opt.oPos && c.ostk && (!opt.oStk || (c.ostk[i] >= opt.oStk[0] * 10 && c.ostk[i] < opt.oStk[1] * 10)) && (!opt.oMy || (c.bb[i] >= opt.oMy[0] * 10 && c.bb[i] < opt.oMy[1] * 10)) && (!opt.oOpen || !opt.oOpen.length || opt.oOpen.includes(POS[c.opos[i]]))) {
        const m = out.mxO[c.hc[i]], a = c.act[i]; m.n++;
        if (a === 1) m.lp++; else if (a >= 2) { m.x++; if (a === 3) m.ai++; }
      }
      if ((p === 'CO' || p === 'BTN') && c.sbs && c.sbs[i] >= 0 && c.bbs[i] >= 0) {
        const f = (v) => BX_STK.findIndex(z => v / 10 >= z[1] && v / 10 < z[2]);
        const z = out.bx[p][f(c.sbs[i])][f(c.bbs[i])]; z.n++;
        if (call) { z.x++; if (c.net && c1) { z.sum += c.net[i]; z.es += EV[i]; z.sn++; } }
      }
      if (c.opos && c.opos[i] >= 0) {
        const op = POS[c.opos[i]], row = out.vs[p] || (out.vs[p] = {}), z = row[op] || (row[op] = { x: 0, n: 0 });
        z.n++; if (call) z.x++;
        if (c1 && c.hc[i] >= 0) { const hr = out.vsHands[p] || (out.vsHands[p] = {}), h = hr[op] || (hr[op] = { n: 0, sum: 0, es: 0, ids: [], mx: Array.from({ length: 169 }, () => ({ n: 0, sum: 0, es: 0 })) }), v = c.net ? c.net[i] : 0, e = c.net ? EV[i] : 0; h.n++; h.sum += v; h.es += e; h.ids.push(i); h.mx[c.hc[i]].n++; h.mx[c.hc[i]].sum += v; h.mx[c.hc[i]].es += e; }
      }
      if (p !== 'BB') out.resp[c.act[i] === 0 ? 0 : c.act[i] === 1 ? 1 : 2]++;
      if (c1 && c.hc[i] >= 0) (p === 'BB' ? [p] : ['TOT', p]).forEach(k => { const h = out.hands[k], m = h.mx[c.hc[i]], v = c.net ? c.net[i] : 0, e = c.net ? EV[i] : 0; h.n++; h.sum += v; h.es += e; h.ids.push(i); m.n++; m.sum += v; m.es += e; });
    }
    return Object.assign(out, { CC_COLS, CC_SZ, CC_AISTK });
  }

  // 3-бет: перед первым ходом героя ровно один рейз (не олл-ин), без коллеров после него (с коллерами — сквиз, своя вкладка);
  // без лимперов до рейза — «3-бет», с лимперами (лимп → изолейт → ваш рейз) — «3-бет против изолейта», как в Hand2Note.
  // Позиции — «как в Hand2Note» (колонки fp / fop, parser/tbet.js): MP, HJ, CO, BTN, SB, BB; EP — только в TOT.
  const FP = ['EP', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  const TB_COLS = ['TOT', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  const TB_STK = [['< 15 BB', 0, 15], ['15–25 BB', 15, 25], ['25–40 BB', 25, 40], ['40+ BB', 40, 1e9]];
  const TB_OSTK = [['до 20 BB', 0, 20], ['20–40 BB', 20, 40], ['40+ BB', 40, 1e9]]; // корзины стека открывающего (#7.1)
  // размер 3-бета в разах от открытия — как «Split» в Hand2Note: до ближайших 0,5 (×2 … ×5, дальше ×5+); олл-ин — отдельно
  const TB_X = [['×2'], ['×2,5'], ['×3'], ['×3,5'], ['×4'], ['×4,5'], ['×5'], ['×5+'], ['олл-ин']];
  const xIdx = (ratio) => Math.min(7, Math.max(0, Math.round(ratio * 2) - 4));
  function tb(db, idx, opt) {
    opt = opt || {};
    const c = db.cols, EV = c.nev || c.net, out = {};
    const has = (k) => c[k] != null && c[k].length === db.count;
    const tbc = () => ({ n: 0, x: 0, nai: 0, ai: 0 });
    const hset = () => ({ n: 0, sum: 0, es: 0, ids: [], mx: Array.from({ length: 169 }, () => ({ n: 0, sum: 0, es: 0 })) });
    const szCell = () => ({ n: 0, call: 0, rz: 0, ai: 0, fold: 0, sum: 0, es: 0, sn: 0, ids: [], rids: [], rmx: null });
    out.opF = {}; out.tb = {}; out.hands = {}; out.handsN = {}; out.handsA = {}; out.f4mx = {}; out.f5mx = {}; out.f4cmx = {}; out.f5cmx = {}; out.f4c = {}; out.t3mx = {}; out.iso = {}; out.isoF = {}; out.f4 = {}; out.t3r = {}; out.sz = {}; out.stk = {}; out.ostk = {}; out.x = {};
    const rset = (sub) => { const z = { n: 0, rids: [], rmx: Array.from({ length: 169 }, () => ({ n: 0, x: 0, ai: 0, lp: 0, sum: 0, es: 0 })) }; if (sub) z.parts = { rz: rset(), call: rset(), fold: rset() }; return z; }; // parts — раздачи по вашему ответу (для вкладок окна)
    TB_COLS.forEach(k => { out.tb[k] = tbc(); out.hands[k] = hset(); out.handsN[k] = hset(); out.handsA[k] = hset(); out.f4mx[k] = rset(true); out.f5mx[k] = rset(true); out.f4cmx[k] = rset(true); out.f5cmx[k] = rset(true); out.f4c[k] = { n: 0, fold: 0, call: 0, rz: 0, n5: 0, x5: 0 }; out.t3mx[k] = rset(); out.iso[k] = { n: 0, x: 0 }; out.isoF[k] = { n: 0, x: 0 }; out.f4[k] = { n: 0, fold: 0, call: 0, rz: 0, n5: 0, x5: 0 }; out.t3r[k] = [0, 0, 0, 0]; out.opF[k] = { n: 0, x: 0 }; out.sz[k] = CC_SZ.map(szCell); out.stk[k] = TB_STK.map(tbc); out.ostk[k] = TB_OSTK.map(() => ({ n: 0, x: 0, ai: 0, sum: 0, es: 0, sn: 0 })); out.x[k] = TB_X.map(() => ({ n: 0, r: [0, 0, 0, 0], rn: 0, sum: 0, es: 0, ids: [] })); });
    out.vs = {}; out.vs4 = {}; out.resp = [0, 0, 0];
    // размер 3-бета по группам: в позиции (MP–BTN), SB, BB; со сбросом на 4-бет
    out.xg = {}; out.split = {}; out.xgR = {}; ['TOT', 'IP', 'SB', 'BB'].forEach(g => { out.xg[g] = TB_X.map(() => ({ n: 0, r: [0, 0, 0, 0], rn: 0, sum: 0, es: 0, ids: [], f4n: 0, f4f: 0, rmx: null })); out.split[g] = { n: 0, x: 0, fn: 0, ff: 0, b: Array.from({ length: 8 }, () => ({ x: 0, fn: 0, ff: 0 })) }; out.xgR[g] = { rmx: Array.from({ length: 169 }, () => ({ n: 0, x: 0, ai: 0, lp: 0, sum: 0, es: 0 })), rids: [] }; }); out.fineOk = 0; out.fineAll = 0;
    out.mxO = Array.from({ length: 169 }, () => ({ n: 0, x: 0, ai: 0, lp: 0 }));
    const R = { TB_COLS, TB_STK: TB_STK.map(z => z[0]), TB_OSTK: TB_OSTK.map(z => z[0]), TB_X: TB_X.map(z => z[0]), CC_SZ };
    if (!c.rz) return Object.assign(out, R);
    const fine = has('fp'), POSF = (p) => (p === 0 ? 'EP' : p === 1 || p === 2 ? 'MP' : POS[p]); // без колонок fp — грубые позиции базы
    for (const i of idx) {
      if (c.rz[i] !== 1 || (c.cl && c.cl[i] !== 0)) continue;
      const shove = c.rai[i] === 1 || (c.osz[i] >= 0 && c.ostk[i] >= 0 && c.osz[i] / 100 >= c.ostk[i] / 10 - 0.5);
      if (shove) continue; // против открытия олл-ином 3-бета не бывает
      out.fineAll++; if (fine && c.fp[i] >= 0) out.fineOk++;
      const p = fine && c.fp[i] >= 0 ? FP[c.fp[i]] : POSF(c.pos[i]);
      const op = fine && c.fop[i] >= 0 ? FP[c.fop[i]] : c.opos[i] >= 0 ? POSF(c.opos[i]) : null;
      // BB против открытия SB (блайнд против блайнда) — в колонке BB не считается, как в Hand2Note (у него это вкладка BvB); в TOT и в «позиция против позиции» — есть
      const a = c.act[i], r3 = a >= 2, bvb = p === 'BB' && op === 'SB', keys = p === 'EP' || bvb ? ['TOT'] : ['TOT', p];
      // ответ на 4-бет: t4 — 4-бет от открывающего (основные строки), t4c — холодный 4-бет игрока за спиной (отдельная строка)
      const t4r = has('t4') ? c.t4[i] : -1, t4 = t4r >= 0 && !(t4r & 8) ? t4r : -1, t4c = t4r >= 8 ? t4r & 7 : -1, t3r0 = has('t3r') ? c.t3r[i] : -1, t3 = t3r0 >= 0 ? t3r0 & 3 : -1, opF = t3r0 >= 0 ? (t3r0 & 4 ? 1 : 0) : -1; // t3 — первый ответ соперников, opF — сбросил ли открывающий
      if (c.lr && c.lr[i] > 0) { // 3-бет против изолейта
        keys.forEach(k => { const z = out.iso[k]; z.n++; if (r3) z.x++; if (r3 && t4 >= 0) { const f = out.isoF[k]; f.n++; if ((t4 & 3) === 0) f.x++; }
          if (r3 && c.hc[i] >= 0) { const nv = c.net ? c.net[i] : 0, ne = c.net ? EV[i] : 0, h = z.h || (z.h = hset()), m = h.mx[c.hc[i]]; h.n++; h.sum += nv; h.es += ne; h.ids.push(i); m.n++; m.sum += nv; m.es += ne; } }); // матрица для наведения (#11)
        continue;
      }
      const v0 = c.net ? c.net[i] : 0, e0 = c.net ? EV[i] : 0;
      keys.forEach(k => {
        const z = out.tb[k]; z.n++; if (r3) { z.x++; if (a === 3) z.ai++; else z.nai++; }
        const sk = TB_STK.findIndex(q => c.bb[i] / 10 >= q[1] && c.bb[i] / 10 < q[2]);
        if (sk >= 0) { const s = out.stk[k][sk]; s.n++; if (r3) { s.x++; if (a === 3) s.ai++; else s.nai++; } }
        if (c.osz[i] >= 0) {
          const zk = CC_SZ.findIndex(q => c.osz[i] >= q[1] && c.osz[i] < q[2]);
          if (zk >= 0) {
            const q = out.sz[k][zk]; q.n++;
            if (a === 1) q.call++; else if (a === 2) q.rz++; else if (a === 3) q.ai++; else q.fold++;
            if (r3) { q.sum += v0; q.es += e0; q.sn++; q.ids.push(i); }
            if (c.hc[i] >= 0) { if (!q.rmx) q.rmx = Array.from({ length: 169 }, () => ({ n: 0, x: 0, ai: 0, lp: 0, sum: 0, es: 0 })); const m = q.rmx[c.hc[i]]; m.n++; m.sum += v0; m.es += e0; q.rids.push(i); if (a === 1) m.lp++; else if (r3) { m.x++; if (a === 3) m.ai++; } }
            if (r3 && c.hc[i] >= 0) { if (!q.vmx) q.vmx = Array.from({ length: 169 }, () => ({ n: 0, sum: 0, es: 0 })); const v2 = q.vmx[c.hc[i]]; v2.n++; v2.sum += v0; v2.es += e0; } // «Факт/EV» в окне — только 3-беты
          }
        }
        // #7.1 — корзины стека открывающего: возможности, 3-беты (все/олл-ином) и их результат; rmx — окно «Диапазон», vmx/ids — «Факт/EV» и списки только по 3-бетам
        if (c.ostk[i] >= 0) {
          const ok = c.ostk[i] / 10 < 20 ? 0 : c.ostk[i] / 10 < 40 ? 1 : 2, q = out.ostk[k][ok];
          q.n++; if (r3) { q.x++; if (a === 3) q.ai++; q.sum += v0; q.es += e0; q.sn++; (q.ids || (q.ids = [])).push(i); }
          if (c.hc[i] >= 0) { if (!q.rmx) { q.rmx = Array.from({ length: 169 }, () => ({ n: 0, x: 0, ai: 0, lp: 0, sum: 0, es: 0 })); q.rids = []; } const m = q.rmx[c.hc[i]]; m.n++; m.sum += v0; m.es += e0; q.rids.push(i); if (a === 1) m.lp++; else if (r3) { m.x++; if (a === 3) m.ai++; } }
          if (r3 && c.hc[i] >= 0) { if (!q.vmx) q.vmx = Array.from({ length: 169 }, () => ({ n: 0, sum: 0, es: 0 })); const v2 = q.vmx[c.hc[i]]; v2.n++; v2.sum += v0; v2.es += e0; }
        }
        // #9.1 окно «Диапазон» (как #7): возможности и ответы по группам позиций — по рукам (все ответы, включая фолды и коллы); в бакет размера — сами 3-беты
        if (c.hc[i] >= 0) {
          const gs2 = ['TOT'].concat(p === 'CO' || p === 'BTN' ? ['IP'] : p === 'SB' ? ['SB'] : p === 'BB' && !bvb ? ['BB'] : []);
          const xr2 = a === 3 ? 8 : c.osz[i] > 0 ? xIdx(c.size[i] / c.osz[i]) : -1;
          gs2.forEach(g2 => { const R = out.xgR[g2], m = R.rmx[c.hc[i]]; m.n++; m.sum += v0; m.es += e0; R.rids.push(i); if (a === 1) m.lp++; else if (r3 && xr2 >= 0) { m.x++; if (a === 3) m.ai++; const B = out.xg[g2][xr2]; if (!B.rmx) B.rmx = Array.from({ length: 169 }, () => ({ n: 0, x: 0, ai: 0, sum: 0, es: 0 })); const b2 = B.rmx[c.hc[i]]; b2.n++; b2.x++; if (a === 3) b2.ai++; b2.sum += v0; b2.es += e0; } });
        }
        if (r3) {
          if (c.hc[i] >= 0) for (const h of [out.hands[k], a === 3 ? out.handsA[k] : out.handsN[k]]) { const m = h.mx[c.hc[i]]; h.n++; h.sum += v0; h.es += e0; h.ids.push(i); m.n++; m.sum += v0; m.es += e0; }
          // матрицы для наведения: ответ соперников на 3-бет (x — сбросили или 4-бет, из них ai — 4-бет, lp — колл) и ваш ход против 4-бета (x — рейз, lp — колл)
          if (c.hc[i] >= 0) {
            const put = (z, f) => { const m = z.rmx[c.hc[i]]; z.n++; z.rids.push(i); m.n++; m.sum += v0; m.es += e0; f(m); };
            if (t3 >= 0) put(out.t3mx[k], m => { if (t3 === 0) m.x++; else if (t3 === 1) m.lp++; else { m.x++; m.ai++; } }); // ai — часть x (так рисует handMatrix)
            if (t4c >= 0) { const b = t4c & 3, f = m => { if (b === 2) m.x++; else if (b === 1) m.lp++; }; const pk = b === 2 ? 'rz' : b === 1 ? 'call' : 'fold'; for (const z of (t4c & 4) === 0 ? [out.f4cmx[k], out.f5cmx[k]] : [out.f4cmx[k]]) { put(z, f); put(z.parts[pk], f); } }
            if (t4 >= 0) { const b = t4 & 3, f = m => { if (b === 2) m.x++; else if (b === 1) m.lp++; }, pk = b === 2 ? 'rz' : b === 1 ? 'call' : 'fold'; for (const z of (t4 & 4) === 0 ? [out.f4mx[k], out.f5mx[k]] : [out.f4mx[k]]) { put(z, f); put(z.parts[pk], f); } }
          }
          if (t3 >= 0) out.t3r[k][t3]++;
          if (opF >= 0) { const z = out.opF[k]; z.n++; z.x += opF; }
          if (t4c >= 0) { const f = out.f4c[k], b = t4c & 3; f.n++; if (b === 0) f.fold++; else if (b === 1) f.call++; else f.rz++; if ((t4c & 4) === 0) { f.n5++; if (b === 2) f.x5++; } }
          if (t4 >= 0) { const f = out.f4[k], b = t4 & 3; f.n++; if (b === 0) f.fold++; else if (b === 1) f.call++; else f.rz++; if ((t4 & 4) === 0) { f.n5++; if (b === 2) f.x5++; } }
          // размер 3-бета в разах от открытия; олл-ин — отдельно
          const xr = a === 3 ? 8 : c.osz[i] > 0 ? xIdx(c.size[i] / c.osz[i]) : -1;
          if (xr >= 0) { const q = out.x[k][xr]; q.n++; q.ids.push(i); q.sum += v0; q.es += e0; if (t3 >= 0) { q.r[t3]++; q.rn++; } if (c.hc[i] >= 0) { const h = q.h || (q.h = hset()), m = h.mx[c.hc[i]]; h.n++; h.sum += v0; h.es += e0; h.ids.push(i); m.n++; m.sum += v0; m.es += e0; } }
          if (xr >= 0 && (k === 'TOT' || k === 'SB' || k === 'BB' || (k === p && (p === 'CO' || p === 'BTN')))) { const gs = k === 'TOT' ? ['TOT'] : k === 'SB' || k === 'BB' ? [k] : ['IP'];
            gs.forEach(gk => { const q = out.xg[gk][xr]; q.n++; q.ids.push(i); q.sum += v0; q.es += e0; if (t3 >= 0) { q.r[t3]++; q.rn++; } if (t4 >= 0) { q.f4n++; if ((t4 & 3) === 0) q.f4f++; } }); }
        }
      });
      out.resp[a === 0 ? 0 : a === 1 ? 1 : 2]++;
      // «Split» как в Hand2Note: в позиции — CO и BTN; SB; BB без блайнда против блайнда. Частота 3-бета не олл-ином каждого размера и фолд на 4-бет после него
      { const gk = p === 'CO' || p === 'BTN' ? 'IP' : p === 'SB' ? 'SB' : p === 'BB' && !bvb ? 'BB' : null;
        for (const g of gk ? ['TOT', gk] : ['TOT']) { const sp = out.split[g]; sp.n++; if (a === 2 && c.osz[i] > 0) { const b = sp.b[xIdx(c.size[i] / c.osz[i])]; sp.x++; b.x++; if (t4 >= 0) { sp.fn++; b.fn++; if ((t4 & 3) === 0) { sp.ff++; b.ff++; } }
          if (c.hc[i] >= 0) for (const h of [sp.h || (sp.h = hset()), b.h || (b.h = hset())]) { const m = h.mx[c.hc[i]]; h.n++; h.sum += v0; h.es += e0; h.ids.push(i); m.n++; m.sum += v0; m.es += e0; } } } } // h — матрицы для наведения (#9)
      if (op) { const row = out.vs[p] || (out.vs[p] = {}), z = row[op] || (row[op] = tbc()); z.n++; if (r3) { z.x++; if (a === 3) z.ai++; else z.nai++;
        if (c.hc[i] >= 0) for (const h of [z.hA || (z.hA = hset()), (a === 3 ? z.hI || (z.hI = hset()) : z.hN || (z.hN = hset()))]) { const m = h.mx[c.hc[i]]; h.n++; h.sum += v0; h.es += e0; h.ids.push(i); m.n++; m.sum += v0; m.es += e0; } } } // hA/hN/hI — матрицы для наведения (#5): все 3-беты / не олл-ин / олл-ин
      if (op && r3 && t4 >= 0) { const row = out.vs4[p] || (out.vs4[p] = {}), f = row[op] || (row[op] = { n: 0, fold: 0, call: 0, rz: 0, n5: 0, x5: 0 }), b = t4 & 3; f.n++; if (b === 0) f.fold++; else if (b === 1) f.call++; else f.rz++; if ((t4 & 4) === 0) { f.n5++; if (b === 2) f.x5++; } }
      // #5: ответ каждой рукой против стека открывающего (позиция, позиции открывающего, стеки — из настроек блока)
      if (c.hc[i] >= 0 && p === opt.oPos && (!opt.oStk || (c.ostk[i] >= opt.oStk[0] * 10 && c.ostk[i] < opt.oStk[1] * 10)) && (!opt.oMy || (c.bb[i] >= opt.oMy[0] * 10 && c.bb[i] < opt.oMy[1] * 10)) && (!opt.oOpen || !opt.oOpen.length || opt.oOpen.includes(op))) {
        const m = out.mxO[c.hc[i]]; m.n++;
        if (a === 1) m.lp++; else if (r3) { m.x++; if (a === 3) m.ai++; }
      }
    }
    return Object.assign(out, R);
  }

  window.Stats = { POS, selectHands, rfi, rfiExtra, stealExtra, cc, tb };
})();
