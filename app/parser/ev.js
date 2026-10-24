'use strict';
// EV-результат (all-in adjusted): если все деньги зашли до ривера и карты всех оставшихся игроков известны,
// результат героя считается по эквити на момент олл-ина, а не по выпавшему борду. Побочные банки учитываются.

const RANKS = '23456789TJQKA';
const SUITS = 'cdhs';
const cardId = (s) => RANKS.indexOf(s[0]) * 4 + SUITS.indexOf(s[1]); // 0..51

// оценка лучшей 5-карточной комбинации из 7 карт: чем больше число, тем сильнее
function eval7(cs) {
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

// детерминированный генератор, чтобы EV при каждой сборке получался одинаковым
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// rp — ход раздачи (как для реплеера). Возвращает EV-итог героя в BB или null, если корректировка не нужна.
function evNet(rp, seed) {
  if (!rp || !rp.ev || !rp.hc) return null;
  const n = rp.pl.length, contrib = new Array(n).fill(0), streetBet = new Array(n).fill(0), folded = new Array(n).fill(false);
  let lastStreet = 0, anyAllin = false;
  for (const [st, i, t, a, ai] of rp.ev) {
    if (t === 'S') { streetBet.fill(0); continue; }
    if (t === 'A') { contrib[i] += a; continue; }
    if (t === 'SB' || t === 'BB') { contrib[i] += a; streetBet[i] += a; continue; }
    if (t === 'f') { folded[i] = true; continue; }
    if (t === 'x') { lastStreet = st; continue; }
    if (t === 'c' || t === 'b') { contrib[i] += a; streetBet[i] += a; lastStreet = st; if (ai) anyAllin = true; continue; }
    if (t === 'r') { contrib[i] += a - streetBet[i]; streetBet[i] = a; lastStreet = st; if (ai) anyAllin = true; continue; }
    if (t === 'U') { contrib[i] -= a; continue; }
  }
  const h = rp.h;
  if (!anyAllin || folded[h] || lastStreet >= 3) return null;
  const live = []; for (let i = 0; i < n; i++) if (!folded[i]) live.push(i);
  if (live.length < 2) return null;
  const cards = {};
  for (const i of live) {
    const s = i === h ? rp.hc : rp.sh && rp.sh[i];
    if (!s) return null; // карты кого-то из оставшихся неизвестны
    cards[i] = s.split(' ').map(cardId);
  }
  const known = lastStreet === 0 ? 0 : lastStreet === 1 ? 3 : 4;
  if ((rp.bd || []).length < known) return null;
  const board0 = rp.bd.slice(0, known).map(cardId);
  // банки: основной и побочные по уровням вложений оставшихся игроков
  const levels = [...new Set(live.map(i => contrib[i]))].sort((a, b) => a - b);
  const pots = []; let prev = 0;
  for (const L of levels) {
    let amt = 0; for (let i = 0; i < n; i++) amt += Math.max(0, Math.min(contrib[i], L) - Math.min(contrib[i], prev));
    const elig = live.filter(i => contrib[i] >= L);
    if (amt > 0) pots.push({ amt, elig });
    prev = L;
  }
  const used = new Set(board0); live.forEach(i => cards[i].forEach(c => used.add(c)));
  const deck = []; for (let c = 0; c < 52; c++) if (!used.has(c)) deck.push(c);
  const need = 5 - known;
  let total = 0, runs = 0;
  const score = (board) => {
    const val = {}; for (const i of live) val[i] = eval7(cards[i].concat(board));
    let won = 0;
    for (const p of pots) {
      const best = Math.max(...p.elig.map(i => val[i]));
      const winners = p.elig.filter(i => val[i] === best);
      if (winners.includes(h)) won += p.amt / winners.length;
    }
    total += won; runs++;
  };
  if (need === 1) for (const a of deck) score(board0.concat([a]));
  else if (need === 2) { for (let x = 0; x < deck.length; x++) for (let y = x + 1; y < deck.length; y++) score(board0.concat([deck[x], deck[y]])); }
  else { // префлоп: выборка досок
    const r = rng(seed || 12345), N = 1500, d = deck.slice();
    for (let k = 0; k < N; k++) {
      for (let j = 0; j < need; j++) { const q = j + Math.floor(r() * (d.length - j)); const tmp = d[j]; d[j] = d[q]; d[q] = tmp; }
      score(board0.concat(d.slice(0, need)));
    }
  }
  return total / runs - contrib[h];
}

module.exports = { evNet, eval7, cardId };
