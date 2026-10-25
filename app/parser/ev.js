'use strict';
// EV-результат (all-in adjusted): если все деньги зашли до ривера и карты всех оставшихся игроков известны,
// результат героя считается по эквити на момент олл-ина, а не по выпавшему борду. Побочные банки учитываются.

const RANKS = '23456789TJQKA';
const SUITS = 'cdhs';
const cardId = (s) => RANKS.indexOf(s[0]) * 4 + SUITS.indexOf(s[1]); // 0..51

// оценка лучшей 5-карточной комбинации из 7 карт: чем больше число, тем сильнее
function eval7Ref(cs) {
  const cnt = new Array(13).fill(0), suitCnt = [0, 0, 0, 0], bySuit = [[], [], [], []];
  for (const c of cs) { const r = c >> 2, s = c & 3; cnt[r]++; suitCnt[s]++; bySuit[s].push(r); }
  const straightTop = (mask) => { // старшая карта стрита по маске рангов
    for (let r = 12; r >= 4; r--) if (((mask >> (r - 4)) & 31) === 31) return r;
    if ((mask & 0x100f) === 0x100f) return 3; // колесо A-2-3-4-5
    return -1;
  };
  let fs = -1; for (let s = 0; s < 4; s++) if (suitCnt[s] >= 5) fs = s;
  if (fs >= 0) {
    let m = 0; for (const r of bySuit[fs]) m |= 1 << r;
    const st = straightTop(m);
    if (st >= 0) return 8e6 + st;
    const rs = bySuit[fs].slice().sort((a, b) => b - a).slice(0, 5);
    return 5e6 + rs.reduce((a, r) => a * 13 + r, 0);
  }
  let mask = 0; const quads = [], trips = [], pairs = [], singles = [];
  for (let r = 12; r >= 0; r--) {
    if (cnt[r]) mask |= 1 << r;
    if (cnt[r] === 4) quads.push(r); else if (cnt[r] === 3) trips.push(r); else if (cnt[r] === 2) pairs.push(r); else if (cnt[r] === 1) singles.push(r);
  }
  const kick = (excl, n) => { const out = []; for (let r = 12; r >= 0 && out.length < n; r--) if (cnt[r] && !excl.includes(r)) out.push(r); return out; };
  if (quads.length) return 7e6 + quads[0] * 13 + kick([quads[0]], 1)[0];
  if (trips.length && (trips.length > 1 || pairs.length)) { const t = trips[0], p = trips.length > 1 ? Math.max(trips[1], pairs[0] ?? -1) : pairs[0]; return 6e6 + t * 13 + p; }
  const st = straightTop(mask); if (st >= 0) return 4e6 + st;
  if (trips.length) { const k = kick([trips[0]], 2); return 3e6 + (trips[0] * 13 + k[0]) * 13 + k[1]; }
  if (pairs.length >= 2) { const k = kick([pairs[0], pairs[1]], 1); return 2e6 + (pairs[0] * 13 + pairs[1]) * 13 + k[0]; }
  if (pairs.length) { const k = kick([pairs[0]], 3); return 1e6 + ((pairs[0] * 13 + k[0]) * 13 + k[1]) * 13 + k[2]; }
  return singles.slice(0, 5).reduce((a, r) => a * 13 + r, 0);
}

// Та же оценка, что eval7Ref (числа совпадают один в один), но без временных массивов —
// в расчёте EV она вызывается миллионы раз, и выделение памяти было главной тратой времени.
const _cnt = new Int32Array(13), _sc = new Int32Array(4), _sm = new Int32Array(4);
function stTop(mask) { for (let r = 12; r >= 4; r--) if (((mask >> (r - 4)) & 31) === 31) return r; return (mask & 0x100f) === 0x100f ? 3 : -1; }
function eval7(cs) {
  _cnt.fill(0); _sc.fill(0); _sm.fill(0);
  for (let i = 0; i < cs.length; i++) { const c = cs[i], r = c >> 2, s = c & 3; _cnt[r]++; _sc[s]++; _sm[s] |= 1 << r; }
  let fs = -1; for (let s = 0; s < 4; s++) if (_sc[s] >= 5) fs = s;
  if (fs >= 0) {
    const m = _sm[fs], st = stTop(m);
    if (st >= 0) return 8e6 + st;
    let v = 0, k = 0; for (let r = 12; r >= 0 && k < 5; r--) if (m & (1 << r)) { v = v * 13 + r; k++; }
    return 5e6 + v;
  }
  let mask = 0, q0 = -1, t0 = -1, t1 = -1, p0 = -1, p1 = -1, nT = 0, nP = 0;
  for (let r = 12; r >= 0; r--) {
    const c = _cnt[r]; if (!c) continue; mask |= 1 << r;
    if (c === 4) { if (q0 < 0) q0 = r; } else if (c === 3) { if (nT === 0) t0 = r; else if (nT === 1) t1 = r; nT++; } else if (c === 2) { if (nP === 0) p0 = r; else if (nP === 1) p1 = r; nP++; }
  }
  // старшие карты, кроме указанных рангов (как kick в eval7Ref)
  const kick = (x1, x2, n) => { let v = 0, k = 0; for (let r = 12; r >= 0 && k < n; r--) if (_cnt[r] && r !== x1 && r !== x2) { v = v * 13 + r; k++; } return { v, k }; };
  if (q0 >= 0) { let kr = -1; for (let r = 12; r >= 0; r--) if (_cnt[r] && r !== q0) { kr = r; break; } return 7e6 + q0 * 13 + kr; }
  if (nT && (nT > 1 || nP)) { const p = nT > 1 ? Math.max(t1, nP ? p0 : -1) : p0; return 6e6 + t0 * 13 + p; }
  const st = stTop(mask); if (st >= 0) return 4e6 + st;
  if (nT) { let a = -1, b = -1; for (let r = 12; r >= 0; r--) if (_cnt[r] && r !== t0) { if (a < 0) a = r; else { b = r; break; } } return 3e6 + (t0 * 13 + a) * 13 + b; }
  if (nP >= 2) { let a = -1; for (let r = 12; r >= 0; r--) if (_cnt[r] && r !== p0 && r !== p1) { a = r; break; } return 2e6 + (p0 * 13 + p1) * 13 + a; }
  if (nP) { const ks = []; for (let r = 12; r >= 0 && ks.length < 3; r--) if (_cnt[r] && r !== p0) ks.push(r); return 1e6 + ((p0 * 13 + ks[0]) * 13 + ks[1]) * 13 + ks[2]; }
  let v = 0, k = 0; for (let r = 12; r >= 0 && k < 5; r--) if (_cnt[r] === 1) { v = v * 13 + r; k++; }
  return v;
}

// префлоп-столкновения: канонический ключ (лучшая из 24 перестановок мастей) и кэш доли банка героя
const PERMS = []; (function gen(a, rest) { if (!rest.length) { PERMS.push(a); return; } rest.forEach((x, i) => gen(a.concat([x]), rest.slice(0, i).concat(rest.slice(i + 1)))); })([], [0, 1, 2, 3]);
const PRE_CACHE = new Map();
function preKey(hero, others) {
  let best = null;
  for (const pm of PERMS) {
    const enc = (hc) => hc.map(c => (c >> 2) * 4 + pm[c & 3]).sort((x, y) => y - x).map(c => String.fromCharCode(48 + c)).join('');
    const k = enc(hero) + '|' + others.map(enc).sort().join(',');
    if (best === null || k < best) best = k;
  }
  return best;
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0 || 1; }

// Быстрая оценка на битовых масках (те же числа, что eval7 и eval7Ref, без массивов и циклов по рангам) —
// в расчёте EV это главная трата времени. Совпадение проверено перебором миллионов случайных рук.
const top1 = (x) => 31 - Math.clz32(x);
function stTopM(m) { const s = m & (m << 1) & (m << 2) & (m << 3) & (m << 4); if (s) return top1(s); return (m & 0x100f) === 0x100f ? 3 : -1; }
function pc(x) { x = x - ((x >> 1) & 0x55555555); x = (x & 0x33333333) + ((x >> 2) & 0x33333333); return Math.imul((x + (x >> 4)) & 0x0F0F0F0F, 0x01010101) >>> 24; }
function topN(x, n) { let v = 0; for (let k = 0; k < n; k++) { const r = top1(x); v = v * 13 + r; x &= ~(1 << r); } return v; }
function eval7f(cs, len) {
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
  if (trips) {
    const t0 = top1(trips), t2 = trips & ~(1 << t0);
    if (t2 || pairs) { const p = t2 ? Math.max(top1(t2), pairs ? top1(pairs) : -1) : top1(pairs); return 6e6 + t0 * 13 + p; }
  }
  const st = stTopM(mask); if (st >= 0) return 4e6 + st;
  if (trips) { const t0 = top1(trips); return 3e6 + t0 * 169 + topN(mask & ~(1 << t0), 2); }
  if (pairs) {
    const p0 = top1(pairs), r1 = pairs & ~(1 << p0);
    if (r1) { const p1 = top1(r1); return 2e6 + (p0 * 13 + p1) * 13 + top1(mask & ~(1 << p0) & ~(1 << p1)); }
    return 1e6 + p0 * 2197 + topN(mask & ~(1 << p0), 3);
  }
  return topN(mask, 5);
}

// детерминированный генератор, чтобы EV при каждой сборке получался одинаковым
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// rp — ход раздачи (как для реплеера). Возвращает поправку EV к фактическому итогу героя в BB (EV = факт + поправка) или null.
// Только если после олл-ина торговля закончилась до ривера. Как в Hand2Note: каждый банк (основной и побочные) считается по эквити на тот момент, когда он «закрылся» олл-ином,
// и только между игроками, которые за него борются; карты остальных игроков при этом из колоды не убираются.
function evNet(rp, seed) {
  if (!rp || !rp.ev || !rp.hc) return null;
  const n = rp.pl.length, h = rp.h;
  const contrib = new Array(n).fill(0), streetBet = new Array(n).fill(0), folded = new Array(n).fill(false), allin = new Array(n).fill(false);
  const snaps = []; // после каждого действия: улица, вложения, кто олл-ин
  let anyAllin = false;
  for (const [st, i, t, a, ai] of rp.ev) {
    if (t === 'S') { streetBet.fill(0); continue; }
    if (t === 'A') { contrib[i] += a; continue; }
    if (t === 'SB' || t === 'BB') { contrib[i] += a; streetBet[i] += a; if (ai) allin[i] = true; continue; }
    if (t === 'f') { folded[i] = true; continue; }
    if (t === 'c' || t === 'b') { contrib[i] += a; streetBet[i] += a; if (ai) { allin[i] = true; anyAllin = true; } }
    else if (t === 'r') { contrib[i] += a - streetBet[i]; streetBet[i] = a; if (ai) { allin[i] = true; anyAllin = true; } }
    else if (t === 'U') { contrib[i] -= a; }
    else if (t !== 'x') continue;
    snaps.push({ st, c: contrib.slice(), ai: allin.slice() });
  }
  if (!anyAllin || folded[h]) return null;
  // как в Hand2Note: поправка только если торговля закончилась до ривера (дальше доска просто докладывается);
  // если после олл-ина двое с фишками ещё ходили на ривере (ставки или чеки) — EV равен факту
  const lastStreet = Math.max(0, ...rp.ev.filter(e => ['c', 'b', 'r', 'x'].includes(e[2])).map(e => e[0]));
  if (lastStreet >= 3) return null;
  const live = []; for (let i = 0; i < n; i++) if (!folded[i]) live.push(i);
  if (live.length < 2) return null;
  const cards = {};
  for (const i of live) {
    const s = i === h ? rp.hc : rp.sh && rp.sh[i];
    if (!s) return null; // карты кого-то из дошедших до вскрытия неизвестны
    cards[i] = s.split(' ').map(cardId);
  }
  const bd = (rp.bd || []).map(cardId);
  if (bd.length < 5) return null;
  // банки по уровням вложений дошедших до вскрытия
  const levels = [...new Set(live.map(i => contrib[i]))].sort((a, b) => a - b);
  const pots = []; let prev = 0;
  for (const L of levels) {
    let amt = 0; for (let i = 0; i < n; i++) amt += Math.max(0, Math.min(contrib[i], L) - Math.min(contrib[i], prev));
    const elig = live.filter(i => contrib[i] >= L);
    if (amt > 0 && elig.length >= 2 && elig.includes(h)) pots.push({ amt, elig, L, lo: prev });
    prev = L;
  }
  const r = rng(seed || 12345);
  let delta = 0;
  for (const p of pots) {
    // банк закрыт олл-ином, если кто-то из претендентов пошёл олл-ин ровно на его уровень (или торговаться дальше может только один);
    // момент закрытия — когда все претенденты вложили этот уровень
    const capped = p.elig.some(i => allin[i] && Math.abs(contrib[i] - p.L) < 1e-6);
    const k = snaps.findIndex(sn => p.elig.every(i => sn.c[i] >= p.L - 1e-9) && (capped || p.elig.filter(i => !sn.ai[i]).length <= 1));
    if (k < 0) continue;
    const st = snaps[k].st; if (st >= 3) continue; // закрылся на ривере — без поправки
    const known = st === 0 ? 0 : st === 1 ? 3 : 4;
    const board0 = bd.slice(0, known);
    // доля банка героя на доске board (то же, что раньше, но без временных массивов на каждую доску)
    const E = p.elig, ne = E.length, hands7 = E.map(() => []), vals = new Float64Array(ne);
    const share = (board) => {
      let m = -Infinity;
      for (let j = 0; j < ne; j++) {
        const hh = hands7[j], ci = cards[E[j]]; let L = 0;
        for (let q = 0; q < ci.length; q++) hh[L++] = ci[q];
        for (let q = 0; q < board.length; q++) hh[L++] = board[q];
        const v = eval7f(hh, L); vals[j] = v; if (v > m) m = v;
      }
      let w = 0, hasH = false; for (let j = 0; j < ne; j++) if (vals[j] === m) { w++; if (E[j] === h) hasH = true; }
      return hasH ? p.amt / w : 0;
    };
    const actual = share(bd);
    // колода: без карт претендентов этого банка и известной доски (карты остальных считаются неизвестными, как в Hand2Note)
    const used = new Set(board0); p.elig.forEach(i => cards[i].forEach(c => used.add(c)));
    const deck = []; for (let c = 0; c < 52; c++) if (!used.has(c)) deck.push(c);
    const need = 5 - known; let tot = 0, runs = 0;
    const b5 = board0.concat(new Array(need).fill(0));
    if (need === 1) for (const a of deck) { b5[known] = a; tot += share(b5); runs++; }
    else if (need === 2) { for (let x = 0; x < deck.length; x++) for (let y = x + 1; y < deck.length; y++) { b5[known] = deck[x]; b5[known + 1] = deck[y]; tot += share(b5); runs++; } }
    else { // префлоп: выборка досок. Эквити зависит только от карт претендентов (масти — с точностью до перестановки),
      // поэтому доля банка героя запоминается по каноническому ключу: одинаковые столкновения (AKs против QQ и т. п.)
      // считаются один раз. Зерно выборки — от ключа, так что ответ одинаков при любом порядке расчёта.
      const key = preKey(cards[h], E.filter(i => i !== h).map(i => cards[i]));
      let frac = PRE_CACHE.get(key);
      if (frac == null) {
        const rk = rng(hashStr(key)), N = global.EV_SAMPLES || 20000, d = deck.slice(); let t2 = 0;
        for (let q = 0; q < N; q++) { for (let j = 0; j < need; j++) { const z = j + Math.floor(rk() * (d.length - j)); const tmp = d[j]; d[j] = d[z]; d[z] = tmp; b5[known + j] = d[j]; } t2 += share(b5); }
        frac = t2 / N / p.amt;
        if (PRE_CACHE.size > 400000) PRE_CACHE.clear();
        PRE_CACHE.set(key, frac);
      }
      tot = frac * p.amt; runs = 1;
    }
    delta += tot / runs - actual;
  }
  return pots.length ? delta : null;
}

module.exports = { evNet, eval7, eval7f, eval7Ref, cardId };
