'use strict';
// Демо-игрок: синтетические турнирные истории раздач в формате PokerStars (как пишут PokerStars и экспорт GGPoker).
// Столы, блайнды с анте, рост уровней, вылеты; у каждого игрока свой стиль (тайтовый, лузовый, лимпер, агрессор),
// префлоп по диапазонам от позиции и стека, постфлоп по силе руки, олл-ины, сайд-поты и вскрытия.
// Эти истории разбирает обычный парсер программы — демо-база получается такой же, как настоящая:
// все вкладки, окна матрицы, соперники и реплеер. Никаких настоящих раздач и ников.
//
//   node tools/make-demo-hh.js <папка> [раздач_на_рум_GG,PS,WNX]
const fs = require('fs');
const path = require('path');
const { eval7 } = require('../app/parser/ev.js');

const OUT = process.argv[2] || path.join(__dirname, '..', 'build', 'demo-hh');
const PLAN = (process.argv[3] || '12000,7000,5000').split(',').map(Number);

// ---------- случайность (детерминированно: одна и та же демо-база при каждой сборке) ----------
let S = 0x9e3779b9;
function rnd() { S ^= S << 13; S >>>= 0; S ^= S >> 17; S ^= S << 5; S >>>= 0; return S / 4294967296; }
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (a) => a[Math.floor(rnd() * a.length)];

// ---------- карты ----------
const RK = '23456789TJQKA', ST = 'cdhs';
const cardStr = (c) => RK[c >> 2] + ST[c & 3];
// сила стартовой руки: доля комбинаций, которые слабее (1 — лучшая)
const PCT = new Float64Array(52 * 52);
{
  const raw = [];
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) {
    const r1 = a >> 2, r2 = b >> 2, hi = Math.max(r1, r2), lo = Math.min(r1, r2), suited = (a & 3) === (b & 3);
    let s;
    if (hi === lo) s = 0.52 + 0.48 * hi / 12;
    else {
      s = (hi * 2.1 + lo) / 37.2 * 0.78 + (suited ? 0.055 : 0) - Math.min(4, hi - lo - 1) * 0.022 + (hi === 12 ? 0.07 : 0) + (hi >= 9 && lo >= 8 ? 0.05 : 0);
    }
    raw.push([s, a, b]);
  }
  raw.sort((x, y) => x[0] - y[0]);
  raw.forEach(([, a, b], i) => { PCT[a * 52 + b] = PCT[b * 52 + a] = (i + 1) / raw.length; });
}
const strength = (h) => PCT[h[0] * 52 + h[1]];

// ---------- игроки ----------
const SYL = ['ka', 'ro', 'mi', 'ten', 'lo', 'vi', 'sar', 'dan', 'el', 'zo', 'ri', 'max', 'ne', 'tor', 'gal', 'pi', 'ux', 'ar', 'bel', 'cro', 'fi', 'jo', 'ky', 'lu', 'mo', 'nik', 'os', 'pe', 'qu', 'ste'];
const TAIL = ['', '', '', '7', '77', '88', '_pro', '13', '2000', '_fish', 'x', '99', 'GG', '_nl', '1', '42', 'Z'];
const used = new Set(['DemoGG', 'DemoStars', 'DemoWina']);
function nick() {
  for (;;) {
    let n = ''; const k = ri(2, 3); for (let i = 0; i < k; i++) n += pick(SYL);
    n = n[0].toUpperCase() + n.slice(1) + pick(TAIL);
    if (rnd() < 0.12) n = n.toLowerCase();
    if (!used.has(n)) { used.add(n); return n; }
  }
}
const STYLES = [
  { name: 'reg', w: 0.34, loose: 1.0, agg: 1.0, limp: 0.0, call: 1.0, post: 1.0 },
  { name: 'nit', w: 0.18, loose: 0.7, agg: 0.8, limp: 0.0, call: 0.75, post: 0.9 },
  { name: 'lag', w: 0.14, loose: 1.35, agg: 1.4, limp: 0.0, call: 1.1, post: 1.05 },
  { name: 'fish', w: 0.22, loose: 1.6, agg: 0.6, limp: 0.55, call: 1.8, post: 0.75 },
  { name: 'maniac', w: 0.05, loose: 1.9, agg: 2.0, limp: 0.1, call: 1.4, post: 0.8 },
  { name: 'short', w: 0.07, loose: 0.9, agg: 1.2, limp: 0.0, call: 0.9, post: 0.9 }
];
function style() { let x = rnd(); for (const s of STYLES) { if ((x -= s.w) <= 0) return s; } return STYLES[0]; }
const POOL = Array.from({ length: 1400 }, () => ({ name: nick(), st: style() }));
const HERO_STYLE = { name: 'hero', loose: 1.08, agg: 1.15, limp: 0.0, call: 1.0, post: 1.12 };

// ---------- уровни ----------
const LEVELS = [[50, 100, 12], [60, 120, 15], [75, 150, 20], [100, 200, 25], [125, 250, 30], [150, 300, 40], [200, 400, 50], [250, 500, 60], [300, 600, 75], [400, 800, 100], [500, 1000, 125], [600, 1200, 150], [800, 1600, 200], [1000, 2000, 250], [1250, 2500, 300], [1500, 3000, 400], [2000, 4000, 500], [2500, 5000, 600], [3000, 6000, 750]];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX'];

// ---------- румы ----------
const ROOMS = [
  { key: 'GG', hero: 'DemoGG', cur: '$', names: ['Bounty Hunters Deepstack Turbo', 'Bounty Hunters Big Game', 'Zodiac Bounty', 'Speed Racer Bounty', 'Mini Main Event', 'Daily Hyper'], buyins: [[5.4], [10.8], [21.6], [54], [108]], fmt: 'gg' },
  { key: 'PS', hero: 'DemoStars', cur: '$', names: ['Bounty Builder', 'Hot Turbo', 'Big Game', 'Mini Thursday Thrill'], buyins: [[2.5, 2.5, 0.5], [5, 5, 1], [10, 10, 2], [25, 25, 5], [50, 50, 9]], fmt: 'ps' },
  { key: 'WNX', hero: 'DemoWina', cur: '€', names: ['Trident Space KO', 'Explorer', 'Galactica', 'Horizon'], buyins: [[2.25, 2.25, 0.5], [4.5, 4.5, 1], [9, 9, 2], [22.5, 22.5, 5]], fmt: 'ps' }
];

let HAND_ID = 230000000000, TOUR_ID = 3900000000;
let CLOCK = Date.UTC(2025, 9, 1, 15, 0, 0); // октябрь 2025 → сентябрь 2026
const END = Date.UTC(2026, 8, 30, 23, 0, 0);
const pad = (n) => String(n).padStart(2, '0');
function stamp(t, tz) { const d = new Date(t + tz * 3600e3); return d.getUTCFullYear() + '/' + pad(d.getUTCMonth() + 1) + '/' + pad(d.getUTCDate()) + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()); }
const money = (v, cur) => cur + (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, ''));

// ---------- одна раздача ----------
// seats: [{seat, p:{name, st}, stack}] — сидящие по порядку мест; btnI — индекс баттона в seats
function playHand(T, seats, btnI, heroName) {
  const L = LEVELS[T.level], sb = L[0], bb = L[1], ante = L[2];
  const n = seats.length;
  const P = seats.map((s, i) => ({ i, seat: s.seat, name: s.p.name, st: s.p.name === heroName ? HERO_STYLE : s.p.st, stack: s.stack, start: s.stack, inv: 0, street: 0, folded: false, allin: false, cards: null, acted: false }));
  const out = [];
  const head = T.room.fmt === 'gg'
    ? 'PokerStars Hand #' + (HAND_ID++) + ': Tournament #' + T.id + ', ' + T.title + " Hold'em No Limit - Level " + ROMAN[T.level] + ' (' + sb + '/' + bb + '(' + ante + ')) - ' + stamp(T.clock, 8)
    : 'PokerStars Hand #' + (HAND_ID++) + ': Tournament #' + T.id + ', ' + T.title + " Hold'em No Limit - Level " + ROMAN[T.level] + ' (' + sb + '/' + bb + ') - ' + stamp(T.clock, 3) + ' MSK [' + stamp(T.clock, -4) + ' ET]';
  out.push(head);
  out.push("Table '" + T.id + ' ' + T.table + "' " + T.max + '-max Seat #' + P[btnI].seat + ' is the button');
  for (const p of P) out.push('Seat ' + p.seat + ': ' + p.name + ' (' + p.stack + ' in chips' + (T.pko ? ', ' + money(T.bounty, T.room.cur) + ' bounty' : '') + ')');
  // колода
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 51; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
  let dk = 0;
  for (const p of P) p.cards = [deck[dk++], deck[dk++]];
  const board = [deck[dk++], deck[dk++], deck[dk++], deck[dk++], deck[dk++]];
  const at = (k) => P[((btnI + k) % n + n) % n];
  const put = (p, amt) => { const a = Math.min(amt, p.stack); p.stack -= a; p.inv += a; p.street += a; if (!p.stack) p.allin = true; return a; };
  // анте и блайнды
  for (const p of P) { const a = put(p, ante); out.push(p.name + ': posts the ante ' + a + (p.allin ? ' and is all-in' : '')); }
  const sbP = n === 2 ? at(0) : at(1), bbP = n === 2 ? at(1) : at(2);
  for (const p of P) p.street = 0; // анте не входит в ставку улицы
  const pa = put(sbP, sb); out.push(sbP.name + ': posts small blind ' + pa + (sbP.allin ? ' and is all-in' : ''));
  const pb = put(bbP, bb); out.push(bbP.name + ': posts big blind ' + pb + (bbP.allin ? ' and is all-in' : ''));
  out.push('*** HOLE CARDS ***');
  const hero = P.find(p => p.name === heroName);
  out.push('Dealt to ' + hero.name + ' [' + hero.cards.map(cardStr).join(' ') + ']');

  // ---------- торговля на улице ----------
  const live = () => P.filter(p => !p.folded);
  const canAct = () => P.filter(p => !p.folded && !p.allin);
  const pot = () => P.reduce((a, p) => a + p.inv, 0);
  function round(order, streetNo, decide) {
    let cur = Math.max(...P.map(p => p.street)), lastRaise = bb, raises = streetNo === 0 ? 1 : 0, aggressor = null;
    for (const p of P) p.acted = false;
    let k = 0, guard = 0;
    while (guard++ < 200) {
      const act = order.filter(p => !p.folded && !p.allin);
      if (live().length <= 1) break;
      if (!act.length) break;
      if (act.every(p => p.acted && p.street === cur)) break;
      const p = order[k % order.length]; k++;
      if (p.folded || p.allin) continue;
      if (p.acted && p.street === cur) continue;
      const toCall = cur - p.street;
      // все остальные в олл-ине или выбыли и уравнивать нечего
      if (canAct().length === 1 && toCall === 0 && p.acted) continue;
      const d = decide(p, { toCall, cur, raises, lastRaise, pot: pot(), aggressor, others: canAct().length - 1 });
      p.acted = true;
      if (d.a === 'f') { if (toCall === 0) { out.push(p.name + ': checks'); } else { p.folded = true; out.push(p.name + ': folds'); } continue; }
      if (d.a === 'c') {
        if (toCall === 0) { out.push(p.name + ': checks'); continue; }
        const a = put(p, toCall); out.push(p.name + ': calls ' + a + (p.allin ? ' and is all-in' : '')); continue;
      }
      // ставка / рейз до d.to (не меньше минимального, не больше стека)
      const maxTo = p.street + p.stack;
      let to = Math.min(maxTo, Math.max(d.to, cur + lastRaise));
      if (canAct().filter(q => q !== p).length === 0) { // некому отвечать — просто уравнять
        if (toCall > 0) { const a = put(p, toCall); out.push(p.name + ': calls ' + a + (p.allin ? ' and is all-in' : '')); } else out.push(p.name + ': checks');
        continue;
      }
      if (to <= cur) { const a = put(p, toCall); out.push(p.name + ': calls ' + a + (p.allin ? ' and is all-in' : '')); continue; }
      const add = to - p.street; put(p, add);
      if (cur === 0) out.push(p.name + ': bets ' + to + (p.allin ? ' and is all-in' : ''));
      else out.push(p.name + ': raises ' + (to - cur) + ' to ' + to + (p.allin ? ' and is all-in' : ''));
      if (to - cur >= lastRaise) { lastRaise = to - cur; for (const q of P) if (q !== p) q.acted = false; }
      cur = to; raises++; aggressor = p;
    }
    // несравнённая часть ставки возвращается
    const sorted = P.map(p => p.street).sort((a, b) => b - a);
    if (sorted[0] > sorted[1]) {
      const top = P.find(p => p.street === sorted[0]); const back = sorted[0] - sorted[1];
      top.stack += back; top.inv -= back; top.street -= back; if (top.stack > 0) top.allin = false;
      out.push('Uncalled bet (' + back + ') returned to ' + top.name);
    }
    for (const p of P) p.street = 0;
    return aggressor;
  }

  // ---------- префлоп ----------
  const preOrder = []; for (let k = 3; k < 3 + n; k++) preOrder.push(at(n === 2 ? k - 1 : k));
  const behind = (p) => { const idx = preOrder.indexOf(p); return n - 1 - idx; }; // сколько игроков ходят после (вкл. блайнды)
  let opener = null, limpers = 0, callers = 0;
  const preAgg = round(preOrder, 0, (p, s) => {
    const h = strength(p.cards), st = p.st, effBB = (p.stack + p.street) / bb;
    const isBB = p === bbP, isSB = p === sbP;
    const k = behind(p);
    const openTop = (k >= 7 ? 0.13 : k === 6 ? 0.15 : k === 5 ? 0.17 : k === 4 ? 0.2 : k === 3 ? 0.27 : k === 2 ? 0.42 : 0.38) * st.loose;
    const shove = (to) => ({ a: 'r', to: p.street + p.stack, _: to });
    if (s.raises === 1) { // никто не повышал: лимп или открытие
      if (isBB) { // лимпы до BB: изолейт или чек
        if (limpers && h > 1 - 0.22 * st.agg) return effBB < 15 ? shove() : { a: 'r', to: Math.round(bb * (3.5 + limpers)) };
        return { a: 'c' };
      }
      if (limpers) {
        if (h > 1 - openTop * 0.7 * st.agg) return effBB < 14 ? shove() : { a: 'r', to: Math.round(bb * (3 + limpers)) };
        if (h > 1 - openTop * 1.3 * st.call && rnd() < 0.5 + st.limp) { limpers++; return { a: 'c' }; }
        return { a: 'f' };
      }
      if (effBB <= 12 && h > 1 - Math.min(0.75, openTop * 1.35 + (12 - effBB) * 0.025)) { opener = p; return shove(); }
      if (st.limp && rnd() < st.limp && h > 1 - openTop * 1.5) { limpers++; return { a: 'c' }; }
      if (isSB && h > 1 - 0.55 * st.loose && rnd() < 0.35) { limpers++; return { a: 'c' }; }
      if (h > 1 - openTop) { opener = p; const sz = effBB < 20 ? 2 : k <= 1 ? 2.5 : pick([2, 2.2, 2.2, 2.5]); return { a: 'r', to: Math.round(bb * sz) }; }
      return { a: 'f' };
    }
    // против рейза
    const facingAllin = P.some(q => q.allin && q.street === s.cur && q !== p);
    const odds = s.toCall / (s.pot + s.toCall);
    if (s.raises === 2) {
      if (facingAllin || s.toCall >= p.stack) {
        const need = Math.max(0.03, 0.12 * st.call - odds * 0.1 + (effBB < 15 ? 0.1 : 0) + (isBB ? 0.06 : 0));
        return h > 1 - need ? { a: 'c' } : { a: 'f' };
      }
      const three = (0.045 + (isBB || isSB ? 0.015 : 0) + (callers ? 0.01 : 0)) * st.agg;
      if (h > 1 - three || (h > 0.7 && rnd() < 0.05 * st.agg)) return effBB < 25 ? shove() : { a: 'r', to: Math.round(s.cur * (isBB || isSB ? 4 : 3.2) + callers * s.cur) };
      const callTop = (isBB ? 0.38 : isSB ? 0.12 : 0.11 + (k <= 2 ? 0.05 : 0)) * st.call - (effBB < 20 ? 0.05 : 0);
      if (h > 1 - callTop) { callers++; return { a: 'c' }; }
      return { a: 'f' };
    }
    if (s.raises === 3) { // против 3-бета
      if (h > 1 - 0.025 * st.agg) return shove();
      if (!facingAllin && h > 1 - (p === opener ? 0.07 : 0.03) * st.call && odds < 0.4) return { a: 'c' };
      if (facingAllin && h > 1 - 0.05 * st.call) return { a: 'c' };
      return { a: 'f' };
    }
    if (h > 1 - 0.018 * st.call) return s.toCall >= p.stack ? { a: 'c' } : shove();
    return { a: 'f' };
  });

  // ---------- постфлоп ----------
  const postOrder = []; for (let k = 1; k <= n; k++) postOrder.push(at(k));
  let shown = 0;
  const streets = [['FLOP', 3], ['TURN', 4], ['RIVER', 5]];
  let aggr = preAgg;
  for (let si = 0; si < 3 && live().length > 1; si++) {
    const [nm, cnt] = streets[si];
    const b = board.slice(0, cnt);
    out.push('*** ' + nm + ' *** [' + b.slice(0, 3).map(cardStr).join(' ') + ']' + (cnt > 3 ? ' [' + b.slice(3).map(cardStr).join(' ') + ']' : '').replace(/\] \[(.+)\]$/, (m0) => m0));
    if (cnt === 4) out[out.length - 1] = '*** TURN *** [' + b.slice(0, 3).map(cardStr).join(' ') + '] [' + cardStr(b[3]) + ']';
    if (cnt === 5) out[out.length - 1] = '*** RIVER *** [' + b.slice(0, 4).map(cardStr).join(' ') + '] [' + cardStr(b[4]) + ']';
    if (canAct().length <= 1) continue; // все в олл-ине — только карты
    const topB = Math.max(...b.map(c => c >> 2));
    aggr = round(postOrder, si + 1, (p, s) => {
      const v = eval7(p.cards.concat(b)), cat = Math.floor(v / 1e6), st = p.st;
      const pr = cat === 1 ? Math.floor((v - 1e6) / 2197) : -1; // ранг пары
      let hs = cat >= 4 ? 0.95 : cat === 3 ? 0.9 : cat === 2 ? 0.8 : cat === 1 ? (pr >= topB ? 0.62 + pr / 60 : pr > (b.map(c => c >> 2).sort((x, y) => y - x)[1]) ? 0.45 : 0.32) : 0.12 + Math.max(p.cards[0] >> 2, p.cards[1] >> 2) / 100;
      hs = Math.min(0.99, hs * (0.9 + 0.1 * st.post));
      const sz = (f) => Math.max(bb, Math.round(s.pot * f));
      if (s.toCall === 0) {
        if (hs > 0.78 && rnd() < 0.75 * st.agg) return { a: 'r', to: sz(pick([0.5, 0.66, 0.75])) };
        if (aggr === p && si === 0 && rnd() < 0.62 * st.agg) return { a: 'r', to: sz(pick([0.33, 0.33, 0.5])) };
        if (hs > 0.55 && rnd() < 0.45 * st.agg) return { a: 'r', to: sz(0.5) };
        if (rnd() < 0.08 * st.agg) return { a: 'r', to: sz(0.5) };
        return { a: 'c' };
      }
      const frac = s.toCall / Math.max(1, s.pot);
      if (hs > 0.88 && rnd() < 0.45 * st.agg) return { a: 'r', to: Math.round(s.cur * 2.8) };
      const need = 0.3 + frac * 0.35 + (si === 2 ? 0.1 : 0) - (st.call - 1) * 0.12;
      if (hs > need) return { a: 'c' };
      if (cat === 0 && si < 2 && rnd() < 0.1 * st.call) return { a: 'c' }; // дро/флот
      return { a: 'f' };
    });
  }

  // ---------- итог ----------
  const L2 = live();
  const won = new Map();
  if (L2.length === 1) {
    const w = L2[0]; const amt = pot(); won.set(w, amt);
    out.push(w.name + ' collected ' + amt + ' from pot');
    if (rnd() < 0.1) out.push(w.name + ': shows [' + w.cards.map(cardStr).join(' ') + ']'); else out.push(w.name + ": doesn't show hand");
  } else {
    out.push('*** SHOW DOWN ***');
    const val = new Map(L2.map(p => [p, eval7(p.cards.concat(board))]));
    for (const p of postOrder) if (!p.folded) out.push(p.name + ': shows [' + p.cards.map(cardStr).join(' ') + ']');
    shown = L2.length;
    // банки по вложениям: основной и побочные
    const levels = [...new Set(P.map(p => p.inv).filter(v => v > 0))].sort((a, b) => a - b);
    let prev = 0; const pots = [];
    for (const lv of levels) {
      const amount = P.reduce((a, p) => a + Math.max(0, Math.min(p.inv, lv) - prev), 0);
      const elig = L2.filter(p => p.inv >= lv);
      if (amount > 0) { if (elig.length) pots.push({ amount, elig }); else if (pots.length) pots[pots.length - 1].amount += amount; }
      prev = lv;
    }
    // одинаковые составы претендентов — один банк
    const merged = [];
    for (const pt of pots) { const last = merged[merged.length - 1]; if (last && last.elig.length === pt.elig.length && last.elig.every(x => pt.elig.includes(x))) last.amount += pt.amount; else merged.push({ amount: pt.amount, elig: pt.elig.slice() }); }
    merged.forEach((pt, k) => {
      const best = Math.max(...pt.elig.map(p => val.get(p)));
      const ws = pt.elig.filter(p => val.get(p) === best);
      const share = Math.floor(pt.amount / ws.length); let odd = pt.amount - share * ws.length;
      for (const w of ws) { const a = share + (odd-- > 0 ? 1 : 0); won.set(w, (won.get(w) || 0) + a); out.push(w.name + ' collected ' + a + ' from ' + (merged.length === 1 ? 'pot' : k === 0 ? 'main pot' : 'side pot' + (merged.length > 2 ? '-' + k : ''))); }
    });
  }
  out.push('*** SUMMARY ***');
  out.push('Total pot ' + pot() + ' | Rake 0');
  const lastStreet = out.some(l => l.startsWith('*** RIVER')) ? 5 : out.some(l => l.startsWith('*** TURN')) ? 4 : out.some(l => l.startsWith('*** FLOP')) ? 3 : 0;
  if (lastStreet) out.push('Board [' + board.slice(0, lastStreet).map(cardStr).join(' ') + ']');
  for (const p of P) {
    const tag = p === at(0) ? ' (button)' : p === sbP ? ' (small blind)' : p === bbP ? ' (big blind)' : '';
    if (p.folded) out.push('Seat ' + p.seat + ': ' + p.name + tag + ' folded');
    else if (shown) out.push('Seat ' + p.seat + ': ' + p.name + tag + ' showed [' + p.cards.map(cardStr).join(' ') + '] and ' + (won.get(p) ? 'won (' + won.get(p) + ')' : 'lost'));
    else out.push('Seat ' + p.seat + ': ' + p.name + tag + ' collected (' + (won.get(p) || 0) + ')');
  }
  // стеки после раздачи
  for (const p of P) { p.stack += won.get(p) || 0; seats[p.i].stack = p.stack; }
  // проверка: фишки сохраняются
  const before = P.reduce((a, p) => a + p.start, 0), after = P.reduce((a, p) => a + p.stack, 0);
  if (before !== after) throw new Error('фишки не сошлись: ' + before + ' → ' + after + '\n' + out.join('\n'));
  return out.join('\n');
}

// ---------- турнир: стол героя от посадки до вылета героя ----------
function tournament(room, heroName) {
  const max = pick([8, 8, 6, 6, 9, 7]);
  const bi = pick(room.buyins), pko = room.key === 'GG' ? rnd() < 0.7 : rnd() < 0.5;
  const nm = pick(room.names) + (pko && !/Bounty|KO/.test(room.names[0]) ? ' Bounty' : '');
  const title = room.key === 'GG' ? money(bi[0], '$') + ' ' + nm + (pko && !/Bounty/.test(nm) ? ' Bounty' : '')
    : bi.map(v => money(v, room.cur)).join('+') + ' ' + (room.cur === '€' ? 'EUR' : 'USD');
  const T = { room, id: TOUR_ID += ri(3, 900), table: ri(1, 400), max, pko: pko || /Bounty|KO/.test(title), bounty: Math.max(1, Math.round(bi[0] / 2)), title, level: ri(0, 6), clock: CLOCK };
  if (room.key !== 'GG' && T.pko) T.title = T.title.replace(/ (USD|EUR)$/, ' $1');
  const start = 10000;
  const L0 = LEVELS[T.level][1];
  const seatNums = Array.from({ length: max }, (_, i) => i + 1);
  const seated = seatNums.map(s => ({ seat: s, p: pick(POOL), stack: Math.round(start * (0.4 + rnd() * 1.4)) }));
  // ник героя за этим столом
  const hs = pick(seatNums) - 1; seated[hs].p = { name: heroName, st: HERO_STYLE }; seated[hs].stack = Math.round(L0 * ri(18, 90));
  // уникальные имена за столом
  const names = new Set(); for (const s of seated) { while (names.has(s.p.name)) s.p = pick(POOL); names.add(s.p.name); }
  let btn = ri(0, max - 1), hands = [], len = ri(25, 220), sinceLevel = 0;
  for (let h = 0; h < len; h++) {
    if (++sinceLevel > ri(9, 14) && T.level < LEVELS.length - 1) { T.level++; sinceLevel = 0; }
    // вылетевшие заменяются новыми игроками (пересадка за стол)
    for (const s of seated) if (s.stack <= 0) {
      if (s.p.name === heroName) { len = h; break; }
      let np = pick(POOL); while (seated.some(x => x.p.name === np.name)) np = pick(POOL);
      s.p = np; s.stack = Math.round(LEVELS[T.level][1] * (8 + rnd() * 60));
    }
    if (h >= len) break;
    // иногда место пустует
    const sitting = seated.filter(s => s.stack > 0 && (s.p.name === heroName || rnd() > 0.03));
    if (sitting.length < 3) continue;
    btn = (btn + 1) % max;
    let bi2 = sitting.findIndex(s => s.seat - 1 >= btn); if (bi2 < 0) bi2 = 0;
    hands.push(playHand(T, sitting, bi2, heroName));
    T.clock += ri(25, 95) * 1000;
  }
  CLOCK = T.clock + ri(1, 30) * 60e3;
  return { T, hands };
}

function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  let total = 0;
  ROOMS.forEach((room, k) => {
    const dir = path.join(OUT, room.key); fs.mkdirSync(dir, { recursive: true });
    const want = PLAN[k] || 0; let got = 0;
    // турниры размазаны по всему периоду
    const per = (END - Date.UTC(2025, 9, 1)) / Math.max(1, want / 90);
    CLOCK = Date.UTC(2025, 9, 1, 14 + k, 0, 0);
    while (got < want) {
      const { T, hands } = tournament(room, room.hero);
      if (!hands.length) continue;
      fs.writeFileSync(path.join(dir, 'HH' + T.id + '.txt'), hands.join('\n\n\n') + '\n\n\n');
      got += hands.length;
      CLOCK = Math.min(END - 864e5, CLOCK + per * (0.3 + rnd() * 1.2));
    }
    total += got; console.log(room.key, got, 'раздач');
  });
  console.log('всего', total, '→', OUT);
}
main();
