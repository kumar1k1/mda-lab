'use strict';
// Реплеер 2: стол — один SVG (чёткий при любом размере окна, сохраняется картинкой), ход раздачи считается
// один раз (Replay.frames), на каждом шаге меняются только изменившиеся подписи и фишки. Шкала времени по улицам,
// эквити в олл-ине, размер ставки в % банка, SPR, листание раздач списка, копирование хода и сохранение картинки.
(function () {
  // ---------- эквити (та же быстрая оценка руки, что в parser/ev.js → eval7f) ----------
  const top1 = (x) => 31 - Math.clz32(x);
  function stTopM(m) { const s = m & (m << 1) & (m << 2) & (m << 3) & (m << 4); if (s) return top1(s); return (m & 0x100f) === 0x100f ? 3 : -1; }
  function pc(x) { x = x - ((x >> 1) & 0x55555555); x = (x & 0x33333333) + ((x >> 2) & 0x33333333); return Math.imul((x + (x >> 4)) & 0x0F0F0F0F, 0x01010101) >>> 24; }
  function topN(x, n) { let v = 0; for (let k = 0; k < n; k++) { const r = top1(x); v = v * 13 + r; x &= ~(1 << r); } return v; }
  function ev7(cs, len) {
    let m0 = 0, m1 = 0, m2 = 0, m3 = 0, c1 = 0, c2 = 0, c3 = 0, c4 = 0;
    for (let i = 0; i < len; i++) {
      const c = cs[i], b = 1 << (c >> 2), s = c & 3;
      if (s === 0) m0 |= b; else if (s === 1) m1 |= b; else if (s === 2) m2 |= b; else m3 |= b;
      if (c3 & b) c4 |= b; else if (c2 & b) c3 |= b; else if (c1 & b) c2 |= b; else c1 |= b;
    }
    const fm = pc(m0) >= 5 ? m0 : pc(m1) >= 5 ? m1 : pc(m2) >= 5 ? m2 : pc(m3) >= 5 ? m3 : 0;
    if (fm) { const st = stTopM(fm); if (st >= 0) return 8e6 + st; return 5e6 + topN(fm, 5); }
    const mask = c1;
    if (c4) { const q = top1(c4); return 7e6 + q * 13 + top1(mask & ~(1 << q)); }
    const trips = c3, pairs = c2 & ~c3;
    if (trips) { const t0 = top1(trips), t2 = trips & ~(1 << t0); if (t2 || pairs) { const p = t2 ? Math.max(top1(t2), pairs ? top1(pairs) : -1) : top1(pairs); return 6e6 + t0 * 13 + p; } }
    const st = stTopM(mask); if (st >= 0) return 4e6 + st;
    if (trips) { const t0 = top1(trips); return 3e6 + t0 * 169 + topN(mask & ~(1 << t0), 2); }
    if (pairs) { const p0 = top1(pairs), r1 = pairs & ~(1 << p0); if (r1) { const p1 = top1(r1); return 2e6 + (p0 * 13 + p1) * 13 + top1(mask & ~(1 << p0) & ~(1 << p1)); } return 1e6 + p0 * 2197 + topN(mask & ~(1 << p0), 3); }
    return topN(mask, 5);
  }
  const RANKS = '23456789TJQKA', SUITS = 'cdhs';
  const cid = (s) => RANKS.indexOf(s[0]) * 4 + SUITS.indexOf(s[1]);
  // доли банка игроков (ничья делится) при известной части борда; префлоп — 20 000 случайных досок, флоп/тёрн — все
  function equity(hands, board) {
    const used = new Set(board); hands.forEach(h => h.forEach(c => used.add(c)));
    const deck = []; for (let c = 0; c < 52; c++) if (!used.has(c)) deck.push(c);
    const need = 5 - board.length, n = hands.length, eq = new Float64Array(n), h7 = new Array(7), vals = new Float64Array(n);
    const b5 = board.concat(new Array(need).fill(0)); let runs = 0;
    const score = () => { let m = -Infinity, w = 0; for (let i = 0; i < n; i++) { const hc = hands[i]; let L = 0; for (const c of hc) h7[L++] = c; for (const c of b5) h7[L++] = c; vals[i] = ev7(h7, L); if (vals[i] > m) m = vals[i]; } for (let i = 0; i < n; i++) if (vals[i] === m) w++; for (let i = 0; i < n; i++) if (vals[i] === m) eq[i] += 1 / w; runs++; };
    if (need === 0) score();
    else if (need === 1) for (const a of deck) { b5[4] = a; score(); }
    else if (need === 2) for (let x = 0; x < deck.length; x++) for (let y = x + 1; y < deck.length; y++) { b5[3] = deck[x]; b5[4] = deck[y]; score(); }
    else { let s = 12345; const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; const d = deck.slice();
      for (let q = 0; q < 20000; q++) { for (let j = 0; j < need; j++) { const z = j + Math.floor(rnd() * (d.length - j)); const t = d[j]; d[j] = d[z]; d[z] = t; b5[board.length + j] = d[j]; } score(); } }
    return Array.from(eq, v => v / runs);
  }

  // ---------- вспомогательное ----------
  const NS = 'http://www.w3.org/2000/svg';
  const S = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.append(e); return e; };
  const T = (txt, attrs, parent) => { const e = S('text', attrs, parent); e.textContent = txt; return e; };
  const fmt = (v) => { const r = Math.round(v * 100) / 100; return (Number.isInteger(r) ? String(r) : r.toFixed(r * 10 % 1 === 0 ? 1 : 2)).replace('.', ','); };
  const sgn = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v));
  const SUITCH = { s: '♠', h: '♥', d: '♦', c: '♣' };
  const SUITCOL = { s: '#1B1D22', h: '#D23B3B', d: '#2F6FE0', c: '#1E8A4C' };
  const STREET = ['Префлоп', 'Флоп', 'Тёрн', 'Ривер', 'Итог'];
  const ru = (t) => String(t).replace(/(\d)\.(\d)/g, '$1,$2'); // десятичная запятая
  const W = 1000, H = 718, CX = 500, CY = 370;
  // карта: белая плашка, ранг и масть; без кода — рубашка
  function card(parent, x, y, code, w) {
    const h = w * 1.4, g = S('g', { transform: 'translate(' + x + ',' + y + ')' }, parent);
    if (!code) { S('rect', { width: w, height: h, rx: w * 0.14, class: 'rv-back' }, g); S('rect', { x: 4, y: 4, width: w - 8, height: h - 8, rx: w * 0.1, class: 'rv-back-in' }, g); return g; }
    S('rect', { width: w, height: h, rx: w * 0.14, class: 'rv-card' }, g);
    const col = SUITCOL[code[1]] || '#1B1D22';
    T(code[0] === 'T' ? '10' : code[0], { x: w * 0.5, y: h * 0.46, 'text-anchor': 'middle', class: 'rv-rank', style: 'fill:' + col + ';font-size:' + (w * 0.5) + 'px' }, g);
    T(SUITCH[code[1]] || '', { x: w * 0.5, y: h * 0.86, 'text-anchor': 'middle', style: 'fill:' + col + ';font-size:' + (w * 0.42) + 'px' }, g);
    return g;
  }

  let CUR = null; // { list, pos, i, cache }
  window.openReplayer = async function (i, list) {
    const ids = Array.isArray(list) && list.includes(i) ? list.slice() : [i];
    CUR = { list: ids, pos: ids.indexOf(i), cache: new Map() };
    await show(i);
  };
  async function getRp(i) { if (CUR.cache.has(i)) return CUR.cache.get(i); const r = (await replaysFor([i]))[i] || null; CUR.cache.set(i, r); if (CUR.cache.size > 12) CUR.cache.delete(CUR.cache.keys().next().value); return r; }
  function prefetch() { const L = CUR.list, p = CUR.pos; [L[p + 1], L[p - 1]].forEach(j => { if (j != null && !CUR.cache.has(j)) getRp(j); }); }

  async function show(i) {
    const rp = await getRp(i); if (!rp) return;
    const keepSpeed = RP && RP.speed;
    if (RP) closeReplayer(true);
    build(i, rp, keepSpeed);
    prefetch();
  }
  window.closeReplayer = function (keepCur) {
    if (!RP) return;
    RP.stop(); document.removeEventListener('keydown', RP.keys); RP.bg.remove(); RP = null;
    if (!keepCur) CUR = null;
  };

  function build(i, rp, keepSpeed) {
    const fr = Replay.frames(rp), n = rp.pl.length, H0 = rp.h;
    const c = DB.cols, net = c.net[i] / 10, nev = c.nev ? c.nev[i] / 10 : net;
    // ---------- каркас ----------
    const bg = el('div', 'rv-bg'); bg.setAttribute('role', 'dialog'); bg.setAttribute('aria-modal', 'true'); bg.setAttribute('aria-label', 'Реплеер раздачи');
    const box = el('div', 'rv');
    const head = el('div', 'rv-head');
    const ttl = el('div', 'rv-title');
    const room = DB.rooms[c.room[i]] || '';
    ttl.append(el('b', null, rp.t || room), el('span', null, [room, rp.d, 'вы на ' + rp.pl[H0][0] + ', стек ' + fmt(rp.pl[H0][1]) + ' BB'].filter(Boolean).join(' · ')));
    const res = el('div', 'rv-res');
    const chip = (lab, v) => { const d = el('div', 'rv-rchip ' + (v > 0 ? 'up' : v < 0 ? 'down' : '')); d.append(el('span', null, lab), el('b', null, sgn(v) + ' BB')); return d; };
    res.append(chip('Итог', net)); if (Math.abs(nev - net) > 0.005) res.append(chip('По EV', nev));
    const tools = el('div', 'rv-tools');
    const ib = (label, svg, fn, cls) => { const b = el('button', 'rv-ib' + (cls ? ' ' + cls : '')); b.type = 'button'; b.title = label; b.setAttribute('aria-label', label); b.innerHTML = svg; b.onclick = fn; return b; };
    const ic = (d, fill) => '<svg width="18" height="18" viewBox="0 0 24 24" ' + (fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"') + ' aria-hidden="true">' + d + '</svg>';
    const nav = el('div', 'rv-nav');
    const L = CUR.list, p = CUR.pos;
    const prevB = ib('Предыдущая раздача (PgUp)', ic('<path d="M15 18l-6-6 6-6"/>'), () => step(-1)); prevB.disabled = p <= 0;
    const nextB = ib('Следующая раздача (PgDn)', ic('<path d="M9 18l6-6-6-6"/>'), () => step(1)); nextB.disabled = p >= L.length - 1;
    nav.append(prevB, el('span', 'rv-navn', (p + 1) + ' из ' + L.length), nextB);
    const copyB = ib('Скопировать ход раздачи', ic('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'), () => copyText());
    const pngB = ib('Сохранить картинкой', ic('<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>'), () => savePng());
    const closeB = ib('Закрыть (Esc)', ic('<path d="M6 6l12 12M18 6L6 18"/>'), () => closeReplayer());
    tools.append(nav, copyB, pngB, closeB);
    head.append(ttl, res, tools);

    // ---------- стол ----------
    const main = el('div', 'rv-main');
    const stage = el('div', 'rv-stage');
    const svg = S('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'rv-svg', role: 'img', 'aria-label': 'Стол' });
    const defs = S('defs', null, svg);
    const gr = S('radialGradient', { id: 'rvFelt', cx: '50%', cy: '42%', r: '65%' }, defs);
    S('stop', { offset: '0%', 'stop-color': '#1F5146' }, gr); S('stop', { offset: '70%', 'stop-color': '#143A33' }, gr); S('stop', { offset: '100%', 'stop-color': '#0F2C27' }, gr);
    S('ellipse', { cx: CX, cy: CY, rx: 430, ry: 238, class: 'rv-rail' }, svg);
    S('ellipse', { cx: CX, cy: CY, rx: 410, ry: 220, fill: 'url(#rvFelt)', class: 'rv-felt' }, svg);
    // борд: пять мест
    const CW = 58, bx0 = CX - (5 * CW + 4 * 10) / 2, by0 = CY - 50;
    const boardG = S('g', null, svg);
    for (let k = 0; k < 5; k++) S('rect', { x: bx0 + k * (CW + 10), y: by0, width: CW, height: CW * 1.4, rx: 8, class: 'rv-slot' }, svg);
    svg.append(boardG);
    const potT = T('', { x: CX, y: by0 + CW * 1.4 + 34, 'text-anchor': 'middle', class: 'rv-pot' }, svg);
    const subT = T('', { x: CX, y: by0 + CW * 1.4 + 58, 'text-anchor': 'middle', class: 'rv-sub' }, svg);
    const streetT = T('', { x: CX, y: by0 - 18, 'text-anchor': 'middle', class: 'rv-street' }, svg);
    // места: вы — внизу по центру, остальные — по кругу
    const seats = rp.pl.map((pl, k) => {
      const ang = Math.PI / 2 + (k - H0) * 2 * Math.PI / n;
      const sx = CX + 412 * Math.cos(ang), sy = CY + 262 * Math.sin(ang);
      const bxp = CX + 250 * Math.cos(ang), byp = CY + 112 * Math.sin(ang);
      // карты — со стороны центра стола, подписи действия и эквити — с внешней стороны (вверху стола — над местом, внизу — под ним)
      const cardY = sy - 66, actY = sy - 100; // у всех одинаково: карты над местом, действие над картами, эквити под местом
      const g = S('g', { class: 'rv-seat' + (k === H0 ? ' hero' : '') }, svg);
      const cardsG = S('g', null, g);
      S('rect', { x: sx - 78, y: sy - 4, width: 156, height: 52, rx: 14, class: 'rv-plate' }, g);
      const posT = T(k === H0 ? (heroLabel() + ' · ' + pl[0]) : pl[0], { x: sx, y: sy + 18, 'text-anchor': 'middle', class: 'rv-pos' }, g);
      const stT = T('', { x: sx, y: sy + 38, 'text-anchor': 'middle', class: 'rv-stack' }, g);
      if (pl[0] === 'BTN') { const dx = sx + 64 * (sx > CX ? -1 : 1), dy = sy - 22; S('circle', { cx: dx, cy: dy, r: 13, class: 'rv-dealer' }, g); T('D', { x: dx, y: dy + 5, 'text-anchor': 'middle', class: 'rv-dealer-t' }, g); }
      // ставка: фишка + сумма; действие — плашкой над местом
      const betG = S('g', { class: 'rv-betg' }, svg);
      S('circle', { cx: bxp - 22, cy: byp, r: 10, class: 'rv-chip' }, betG); S('circle', { cx: bxp - 22, cy: byp, r: 5.5, class: 'rv-chip-in' }, betG);
      const betT = T('', { x: bxp - 6, y: byp + 6, class: 'rv-bet' }, betG);
      const actG = S('g', { class: 'rv-actg' }, g); const actR = S('rect', { x: sx - 70, y: actY, width: 140, height: 26, rx: 13, class: 'rv-act' }, actG); const actT = T('', { x: sx, y: actY + 18, 'text-anchor': 'middle', class: 'rv-act-t' }, actG);
      const eqG = S('g', { class: 'rv-eqg' }, g); S('rect', { x: sx - 52, y: sy + 53, width: 104, height: 24, rx: 12, class: 'rv-eq' }, eqG); const eqT = T('', { x: sx, y: sy + 70, 'text-anchor': 'middle', class: 'rv-eq-t' }, eqG);
      return { g, cardsG, posT, stT, betG, betT, actG, actR, actT, eqG, eqT, sx, sy, cardY, cardsKey: '' };
    });
    stage.append(svg);

    // ---------- ход раздачи по улицам ----------
    const side = el('div', 'rv-side');
    const log = el('ol', 'rv-log');
    const lis = [];
    let lastStreet = -1;
    fr.forEach((f, k) => {
      if (k === 0) return;
      if (f.street !== lastStreet) { lastStreet = f.street; const h = el('li', 'rv-log-h', STREET[f.street]); log.append(h); }
      const li = el('li', 'rv-log-i'); li.textContent = ru(f.text); li.tabIndex = 0; li.onclick = () => go(k); li.onkeydown = (e) => { if (e.key === 'Enter') go(k); };
      lis[k] = li; log.append(li);
    });
    side.append(log);
    main.append(stage, side);

    // ---------- шкала времени и кнопки ----------
    const bar = el('div', 'rv-bar');
    const scrub = el('div', 'rv-scrub'); scrub.setAttribute('role', 'slider'); scrub.setAttribute('aria-label', 'Ход раздачи'); scrub.tabIndex = 0;
    const segs = []; let s0 = 1;
    for (let k = 2; k <= fr.length; k++) { if (k === fr.length || fr[k].street !== fr[s0].street) { segs.push({ a: s0, b: k - 1, st: fr[s0].street }); s0 = k; } }
    const total = fr.length - 1;
    segs.forEach(sg => { const d = el('div', 'rv-seg s' + sg.st); d.style.flexGrow = String(sg.b - sg.a + 1); d.append(el('span', null, STREET[sg.st])); scrub.append(d); });
    const knob = el('div', 'rv-knob'); scrub.append(knob);
    const pick = (e) => { const r = scrub.getBoundingClientRect(); const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); go(1 + Math.round(x * (total - 1))); };
    scrub.addEventListener('pointerdown', (e) => { scrub.setPointerCapture(e.pointerId); stop(); pick(e); const mv = (ev) => pick(ev); const up = () => { scrub.removeEventListener('pointermove', mv); scrub.removeEventListener('pointerup', up); }; scrub.addEventListener('pointermove', mv); scrub.addEventListener('pointerup', up); });
    const ctrl = el('div', 'rv-ctrl');
    const I = (d) => ic(d, true);
    const st = { k: 0, timer: null };
    ctrl.append(ib('В начало (Home)', I('<path d="M6 5h2v14H6zM20 5v14L9 12z"/>'), () => go(1)), ib('Шаг назад (←)', I('<path d="M18 5v14L7 12z"/>'), () => go(st.k - 1)));
    const playB = ib('Воспроизвести (пробел)', I('<path d="M7 4.5v15l13-7.5z"/>'), () => toggle(), 'main'); ctrl.append(playB);
    ctrl.append(ib('Шаг вперёд (→)', I('<path d="M6 5v14l11-7z"/>'), () => go(st.k + 1)), ib('В конец (End)', I('<path d="M16 5h2v14h-2zM4 5v14l11-7z"/>'), () => go(fr.length - 1)));
    const speedSeg = el('div', 'seg bx-seg rv-speed'); const SPD = [['1200', '1×'], ['700', '2×'], ['350', '4×']];
    let speed = keepSpeed || '700';
    SPD.forEach(([v, l]) => { const b = el('button', null, l); b.type = 'button'; b.dataset.v = v; b.classList.toggle('on', v === speed); b.onclick = () => { speed = v; speedSeg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); if (st.timer) { stop(); toggle(); } if (RP) RP.speed = v; }; speedSeg.append(b); });
    const now = el('div', 'rv-now');
    ctrl.append(speedSeg, now);
    bar.append(scrub, ctrl);
    box.append(head, main, bar); bg.append(box); document.body.append(bg);
    bg.addEventListener('click', (e) => { if (e.target === bg) closeReplayer(); });

    // ---------- эквити в олл-ине: с момента, когда торговля закончилась, и карты всех дошедших известны ----------
    const cardsOf = (j) => (j === H0 ? rp.hc : rp.sh && rp.sh[j]) || null;
    let aiFrom = -1;
    for (let k = 1; k < fr.length; k++) {
      const f = fr[k], live = []; for (let j = 0; j < n; j++) if (!f.folded[j]) live.push(j);
      if (live.length < 2 || f.street >= 4) continue;
      const canAct = live.filter(j => !(f.allin[j] && f.stacks[j] <= 0.01));
      const maxB = Math.max(...f.bets), matched = live.every(j => f.bets[j] >= maxB - 0.01 || (f.allin[j] && f.stacks[j] <= 0.01));
      const actionsLeft = fr.slice(k + 1).some(g => g.actor >= 0 && g.street < 4 && /: (чек|колл|бет|рейз|фолд)/.test(g.text));
      if (live.some(j => f.allin[j]) && canAct.length <= 1 && matched && !actionsLeft && live.every(j => cardsOf(j))) { aiFrom = k; break; }
    }
    const eqCache = new Map();
    const eqAt = (f) => {
      const live = []; for (let j = 0; j < n; j++) if (!f.folded[j]) live.push(j);
      const key = f.board + ':' + live.join(',');
      if (!eqCache.has(key)) { const e = equity(live.map(j => cardsOf(j).split(' ').map(cid)), (rp.bd || []).slice(0, f.board).map(cid)); const m = {}; live.forEach((j, q) => { m[j] = e[q]; }); eqCache.set(key, m); }
      return eqCache.get(key);
    };

    // ---------- шаг ----------
    let boardShown = -1;
    function go(k) {
      k = Math.max(1, Math.min(fr.length - 1, k)); st.k = k;
      const f = fr[k], prev = fr[k - 1];
      if (f.board !== boardShown) { boardShown = f.board; boardG.replaceChildren(); (rp.bd || []).slice(0, f.board).forEach((cd, q) => card(boardG, bx0 + q * (CW + 10), by0, cd, CW)); }
      const inBets = f.bets.reduce((a, b) => a + b, 0);
      potT.textContent = f.pot + inBets > 0.001 ? 'Банк ' + fmt(f.pot + inBets) + ' BB' : '';
      streetT.textContent = STREET[f.street];
      // SPR на флопе и дальше: эффективный стек героя против самого большого стека соперника / банк
      if (f.street >= 1 && f.street <= 3 && !f.folded[H0]) {
        let opp = 0; for (let j = 0; j < n; j++) if (j !== H0 && !f.folded[j]) opp = Math.max(opp, f.stacks[j]);
        const eff = Math.min(f.stacks[H0], opp), pot = f.pot + inBets; subT.textContent = pot > 0 && eff > 0 ? 'SPR ' + fmt(eff / pot) : '';
      } else subT.textContent = '';
      const eq = aiFrom > 0 && k >= aiFrom && f.street < 4 ? eqAt(f) : null;
      seats.forEach((s, j) => {
        s.g.classList.toggle('folded', f.folded[j]); s.g.classList.toggle('act', f.actor === j); s.g.classList.toggle('won', f.won[j] > 0);
        s.stT.textContent = f.allin[j] && f.stacks[j] <= 0.01 ? 'олл-ин' : fmt(f.stacks[j]) + ' BB';
        const show = j === H0 ? rp.hc : f.show && rp.sh && rp.sh[j] ? rp.sh[j] : (eq && rp.sh && rp.sh[j] ? rp.sh[j] : null);
        const key = f.folded[j] && j !== H0 ? 'x' : show || 'back';
        if (key !== s.cardsKey) {
          s.cardsKey = key; s.cardsG.replaceChildren();
          if (key !== 'x') { const cs = show ? show.split(' ') : [null, null], w = 44; cs.forEach((cd, q) => card(s.cardsG, s.sx - (cs.length * (w + 4) - 4) / 2 + q * (w + 4), s.cardY, cd, w)); }
        }
        // ставка на столе
        if (f.bets[j] > 0.001) { s.betG.style.display = ''; s.betT.textContent = fmt(f.bets[j]); } else s.betG.style.display = 'none';
        // действие: на этой улице; фолд — только в момент хода; бет/рейз — с размером
        const a = f.act[j];
        if (!a || (a.t === 'f' && f.actor !== j)) s.actG.style.display = 'none';
        else {
          let txt = { f: 'Фолд', x: 'Чек', c: 'Колл', b: 'Бет', r: 'Рейз до', w: 'Выигрыш +' + fmt(a.v) }[a.t] || '';
          if (a.t !== 'f' && a.t !== 'x' && a.t !== 'w') txt += ' ' + fmt(a.v);
          if (f.actor === j && prev && (a.t === 'b' || a.t === 'r')) {
            const potBefore = prev.pot + prev.bets.reduce((x, y) => x + y, 0), maxPrev = Math.max(...prev.bets);
            if (a.t === 'b' && potBefore > 0) txt += ' · ' + Math.round(a.v / potBefore * 100) + '%';
            if (a.t === 'r' && maxPrev > 0) txt += ' · ×' + fmt(a.v / maxPrev);
          }
          if (a.ai && a.t !== 'w' && a.t !== 'f') txt = 'Олл-ин ' + fmt(a.v);
          s.actT.textContent = txt; s.actG.style.display = '';
          s.actG.setAttribute('class', 'rv-actg t-' + (a.ai && a.t !== 'w' ? 'ai' : a.t) + (f.actor === j ? ' now' : ''));
          const w2 = Math.max(70, txt.length * 8.4 + 22); s.actR.setAttribute('x', s.sx - w2 / 2); s.actR.setAttribute('width', w2);
        }
        if (eq && eq[j] != null) { s.eqG.style.display = ''; s.eqT.textContent = 'эквити ' + Math.round(eq[j] * 100) + '%'; } else s.eqG.style.display = 'none';
      });
      // шкала и лента
      knob.style.left = (total > 1 ? (k - 1) / (total - 1) * 100 : 0) + '%';
      scrub.setAttribute('aria-valuenow', String(k)); scrub.setAttribute('aria-valuemax', String(total)); scrub.setAttribute('aria-valuetext', ru(f.text));
      lis.forEach((li, q) => { if (li) li.classList.toggle('cur', q === k); });
      if (lis[k]) lis[k].scrollIntoView({ block: 'nearest' });
      now.textContent = ru(f.text);
      if (k >= fr.length - 1) stop();
    }
    function stop() { clearInterval(st.timer); st.timer = null; playB.innerHTML = I('<path d="M7 4.5v15l13-7.5z"/>'); playB.setAttribute('aria-label', 'Воспроизвести (пробел)'); }
    function toggle() {
      if (st.timer) { stop(); return; }
      if (st.k >= fr.length - 1) go(1);
      playB.innerHTML = I('<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>'); playB.setAttribute('aria-label', 'Пауза (пробел)');
      st.timer = setInterval(() => go(st.k + 1), +speed);
    }
    function step(d) { const L2 = CUR.list, q = CUR.pos + d; if (q < 0 || q >= L2.length) return; CUR.pos = q; show(L2[q]); }
    function copyText() {
      const lines = [(rp.t || room) + ' · ' + rp.d, 'Вы: ' + rp.pl[H0][0] + ', ' + (rp.hc || '') + ', стек ' + fmt(rp.pl[H0][1]) + ' BB'];
      let ls = -1; fr.forEach((f, k) => { if (k < 1) return; if (f.street !== ls) { ls = f.street; lines.push('', STREET[f.street] + (f.board ? ' [' + rp.bd.slice(0, f.board).join(' ') + ']' : '')); } if (f.actor >= 0 || /забира|Вскрытие|Возврат/.test(f.text)) lines.push('  ' + ru(f.text)); });
      lines.push('', 'Итог: ' + sgn(net) + ' BB' + (Math.abs(nev - net) > 0.005 ? ' (по EV ' + sgn(nev) + ' BB)' : ''));
      const txt = lines.join('\n');
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => flash(copyB, 'Скопировано')).catch(() => flash(copyB, 'Не удалось скопировать'));
    }
    function savePng() {
      const clone = svg.cloneNode(true); clone.setAttribute('xmlns', NS); clone.setAttribute('width', W * 2); clone.setAttribute('height', H * 2);
      const css = document.createElementNS(NS, 'style'); css.textContent = RV_SVG_CSS; clone.insertBefore(css, clone.firstChild);
      const bgR = document.createElementNS(NS, 'rect'); bgR.setAttribute('width', W); bgR.setAttribute('height', H); bgR.setAttribute('fill', '#0F1218'); clone.insertBefore(bgR, clone.firstChild.nextSibling);
      // подпись на картинке: турнир, дата, ваш результат
      const cap = document.createElementNS(NS, 'text'); cap.setAttribute('x', 18); cap.setAttribute('y', 30); cap.setAttribute('style', "font-family:Onest,'Segoe UI',sans-serif;font-size:17px;font-weight:700;fill:#C3C9D6");
      cap.textContent = [rp.t || room, rp.d, 'итог ' + sgn(net) + ' BB' + (Math.abs(nev - net) > 0.005 ? ', по EV ' + sgn(nev) + ' BB' : '')].filter(Boolean).join(' · '); clone.append(cap);
      const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
      const img = new Image();
      img.onload = () => { const cv = document.createElement('canvas'); cv.width = W * 2; cv.height = H * 2; cv.getContext('2d').drawImage(img, 0, 0); const a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = 'раздача ' + (rp.d || '').replace(/[: ]/g, '-') + '.png'; document.body.append(a); a.click(); a.remove(); flash(pngB, 'Сохранено'); };
      img.onerror = () => flash(pngB, 'Не удалось сохранить');
      img.src = url;
    }
    function flash(b, msg) { const t = el('span', 'rv-flash', msg); b.parentNode.append(t); setTimeout(() => t.remove(), 1400); }
    const keys = (e) => {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === 'Escape') closeReplayer();
      else if (e.key === 'ArrowRight') { stop(); go(st.k + 1); } else if (e.key === 'ArrowLeft') { stop(); go(st.k - 1); }
      else if (e.key === 'Home') { stop(); go(1); } else if (e.key === 'End') { stop(); go(fr.length - 1); }
      else if (e.key === 'PageDown') { e.preventDefault(); step(1); } else if (e.key === 'PageUp') { e.preventDefault(); step(-1); }
      else if (e.key === ' ') { e.preventDefault(); toggle(); } else return;
    };
    RP = { bg, stop, keys, speed };
    document.addEventListener('keydown', keys);
    go(1); // без автозапуска: воспроизведение — кнопкой ▶ или пробелом, шаги — стрелками и шкалой
    playB.focus();
  }

  // стили SVG — и в окне (styles.css), и в сохранённой картинке
  const RV_SVG_CSS = `
.rv-rail{fill:#1A202B;stroke:#2C3445;stroke-width:2}
.rv-felt{stroke:#0A1F1B;stroke-width:3}
.rv-slot{fill:none;stroke:rgba(255,255,255,.10);stroke-width:1.5;stroke-dasharray:4 5}
.rv-card{fill:#F7F5EF}
.rv-back{fill:#7A2E2E;stroke:#F7F5EF;stroke-width:2.5}.rv-back-in{fill:none;stroke:rgba(247,245,239,.35);stroke-width:1.2}
.rv-rank{font-family:Onest,'Segoe UI',sans-serif;font-weight:800}
.rv-pot{font-family:'JetBrains Mono',Consolas,monospace;font-size:20px;font-weight:700;fill:#F6E7C1}
.rv-sub{font-family:'JetBrains Mono',Consolas,monospace;font-size:14px;fill:rgba(246,231,193,.7)}
.rv-street{font-family:Onest,'Segoe UI',sans-serif;font-size:14px;font-weight:700;fill:rgba(255,255,255,.45);letter-spacing:.06em}
.rv-plate{fill:#1B2130;stroke:#343C4E;stroke-width:1.5}
.rv-seat.hero .rv-plate{fill:#2A2416;stroke:#F2B544;stroke-width:2}
.rv-seat.act .rv-plate{stroke:#F2B544;stroke-width:3}
.rv-seat.won .rv-stack{fill:#7FD7A2}
.rv-seat.folded{opacity:.38}
.rv-pos{font-family:Onest,'Segoe UI',sans-serif;font-size:15px;font-weight:800;fill:#ECEFF5}
.rv-stack{font-family:'JetBrains Mono',Consolas,monospace;font-size:14px;fill:#C3C9D6}
.rv-dealer{fill:#F4F1E8;stroke:#111;stroke-width:1}.rv-dealer-t{font-family:Onest,sans-serif;font-size:13px;font-weight:800;fill:#111}
.rv-chip{fill:#F2B544;stroke:#1B1406;stroke-width:1.5}.rv-chip-in{fill:none;stroke:#1B1406;stroke-width:1.2;stroke-dasharray:2 2}
.rv-bet{font-family:'JetBrains Mono',Consolas,monospace;font-size:16px;font-weight:700;fill:#F6E7C1}
.rv-act{fill:#3A4152}.rv-act-t{font-family:Onest,'Segoe UI',sans-serif;font-size:13px;font-weight:800;fill:#ECEFF5}
.rv-actg.t-c .rv-act{fill:#6EC3E8}.rv-actg.t-c .rv-act-t{fill:#06202C}
.rv-actg.t-b .rv-act,.rv-actg.t-r .rv-act{fill:#F2B544}.rv-actg.t-b .rv-act-t,.rv-actg.t-r .rv-act-t{fill:#1B1406}
.rv-actg.t-ai .rv-act{fill:#FF7B6B}.rv-actg.t-ai .rv-act-t{fill:#2A0B07}
.rv-actg.t-w .rv-act{fill:#7FD7A2}.rv-actg.t-w .rv-act-t{fill:#0B2A17}
.rv-actg.t-f .rv-act{fill:#5F687B}
.rv-eq{fill:rgba(8,10,14,.85);stroke:#7FD7A2;stroke-width:1.2}.rv-eq-t{font-family:'JetBrains Mono',Consolas,monospace;font-size:12.5px;font-weight:700;fill:#7FD7A2}`;
  const st = document.createElement('style'); st.textContent = RV_SVG_CSS; document.head.append(st);
})();
