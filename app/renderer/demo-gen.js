'use strict';
/* exported generateDemoHands */
// ДЕМО-база рук героя (синтетика, откалибрована под цифры со скриншота).
// Реальную базу в этом же формате будет выдавать парсер историй раздач.
//
// Формат: колонки одинаковой длины (одна позиция массива = одна раздача героя).
//   room  0 GGPoker, 1 PokerStars, 2 Winamax
//   type  0 обычный MTT, 1 PKO
//   month номер месяца от начала периода
//   tbl   размер стола (максимум мест): 6 или 9
//   pos   0 EP, 1 MP, 2 HJ, 3 CO, 4 BTN, 5 SB, 6 BB
//   bb    эффективный стек героя в BB ×10
//   sit   0 до героя все сфолдили, 1 до героя только лимпы, 2 до героя был рейз
//   lim   число лимперов до героя
//   act   0 фолд, 1 лимп/колл/чек, 2 рейз, 3 олл-ин
//   size  размер рейза героя в BB ×100 (0 если не рейз)
//   fti   после изолейта героя: 1 — все лимперы сфолдили, 0 — кто-то продолжил, -1 — н/д
function generateDemoHands() {

let seed = 122000;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pick = (w) => { let r = rnd() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; } return w.length - 1; };

const N = 121847;
const cols = { room: [], type: [], month: [], tbl: [], pos: [], bb: [], sit: [], lim: [], act: [], size: [], fti: [] };

// RFI по бакетам стека [<12, 12-16, 16-20, 20-30, 30+] для EP..BTN, SB
const RFI = [
  [0.25, 0.30, 0.35, 0.45, 0.60, 0.50],
  [0.049, 0.081, 0.08, 0.086, 0.056, 0.30],
  [0.13, 0.093, 0.14, 0.14, 0.19, 0.33],
  [0.13, 0.15, 0.18, 0.24, 0.25, 0.36],
  [0.19, 0.23, 0.27, 0.35, 0.47, 0.40]
];
const AI_SHARE = [0.9, 0.15, 0.05, 0.01, 0.002];
const ISO1 = [0, 0.10, 0.18, 0.21, 0.28, 0.18, 0.22];
const ISO2 = [0, 0.0, 0.17, 0.31, 0.14, 0.13, 0.17];
const FTI1 = [0, 0, 0.30, 0.50, 0.64, 0.50, 0.58];
const FTI2 = [0, 0, 0, 0.5, 0.25, 0.2, 0.2];
const UNOPENED = [0.9, 0.7, 0.6, 0.52, 0.45, 0.4, 0];
const LIMPED = [0.001, 0.0035, 0.004, 0.0045, 0.005, 0.006, 0.02];

for (let i = 0; i < N; i++) {
  const room = pick([0.55, 0.3, 0.15]);
  const type = rnd() < 0.42 ? 1 : 0;
  const month = Math.floor(rnd() * 21);
  const tbl = rnd() < 0.18 ? 6 : 9;
  const pos = tbl === 9 ? pick([2, 2, 1, 1, 1, 1, 1]) : pick([1, 0, 1, 1, 1, 1, 1]);
  const bucket = pick([10, 5, 5, 10, 70]);
  const lo = [3, 12, 16, 20, 30][bucket], hi = [12, 16, 20, 30, 120][bucket];
  const bb = Math.round((lo + rnd() * (hi - lo)) * 10);
  const r = rnd();
  const sit = r < UNOPENED[pos] ? 0 : r < UNOPENED[pos] + LIMPED[pos] ? 1 : 2;
  let lim = 0, act = 0, size = 0, fti = -1;
  if (sit === 0 && pos !== 6) {
    const p = RFI[bucket][Math.min(pos, 5)];
    if (rnd() < p) {
      if (rnd() < AI_SHARE[bucket]) { act = 3; size = bb * 10; }
      else {
        act = 2;
        const sb = pick([97.6, 1.9, 0.5]);
        size = Math.round(([2.0, 2.26, 2.65][sb] + rnd() * [0.25, 0.33, 0.8][sb]) * 100);
      }
    } else if (pos === 5 && rnd() < 0.25) act = 1;
  } else if (sit === 1) {
    lim = rnd() < 0.8 ? 1 : 2 + Math.floor(rnd() * 2);
    const p = (lim === 1 ? ISO1 : ISO2)[pos];
    if (rnd() < p) {
      act = bucket === 0 ? 3 : 2;
      size = act === 3 ? bb * 10 : Math.round((3 + lim + rnd()) * 100);
      fti = rnd() < (lim === 1 ? FTI1 : FTI2)[pos] ? 1 : 0;
    } else act = pos === 6 ? 1 : (rnd() < 0.3 ? 1 : 0);
  } else if (sit === 2) {
    act = pick([80, 13, 7]) === 0 ? 0 : (rnd() < 0.65 ? 1 : 2);
  }
  cols.room.push(room); cols.type.push(type); cols.month.push(month); cols.tbl.push(tbl); cols.pos.push(pos);
  cols.bb.push(bb); cols.sit.push(sit); cols.lim.push(lim); cols.act.push(act); cols.size.push(size); cols.fti.push(fti);
}

return {
  format: 'mdalab-hands-v1',
  demo: true,
  hero: 'Демо-игрок',
  rooms: ['GGPoker', 'PokerStars', 'Winamax'],
  types: ['Обычный', 'PKO'],
  periodStart: '2025-01',
  count: N,
  cols
};
}
if (typeof module !== 'undefined') module.exports = { generateDemoHands };
