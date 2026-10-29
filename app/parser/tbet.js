'use strict';
// 3-бет и что было после него (с 0.7.23). Считается по записи раздачи в виде реплеера: rec.pl — места по кругу
// стола [позиция, стек в BB, …], rec.ev — действия [улица, место, тип, сумма «до» в BB, олл-ин]. Тот же расчёт
// и при разборе историй (parse.js строит такую же лёгкую запись), и при обновлении старой базы (migrate.js).
//
// fp / fop — позиция игрока и открывающего «как в Hand2Note» во вкладке 3-бет: считается назад от баттона —
// CO (1 место до BTN), HJ (2), MP (3–4), EP (5 и дальше); SB, BB, BTN — как есть.
// Коды: 0 EP, 1 MP, 2 HJ, 3 CO, 4 BTN, 5 SB, 6 BB (-1 — неизвестно).
// t3r — ответ соперников на рейз игрока поверх ровно одного рейза (3-бет, сквиз, 3-бет против изолейта):
// 0 все сбросили, 1 колл, 2 4-бет, 3 4-бет олл-ином (-1 — не было); +4 — открывающий сбросил на этот рейз.
// t4 — ход игрока против 4-бета: 0 фолд, 1 колл, 2 5-бет; +4 — 5-бет был невозможен (4-бет олл-ином или на весь стек игрока);
// +8 — 4-бет поставил не открывающий (холодный 4-бет).
const ACT = new Set(['f', 'x', 'c', 'b', 'r']);
const FIX = { CO: 3, BTN: 4, SB: 5, BB: 6 };

function fineOf(rec, k) {
  if (k == null || k < 0 || !rec.pl[k]) return -1;
  const p = rec.pl[k][0]; if (FIX[p] != null) return FIX[p];
  const N = rec.pl.length, b = rec.pl.findIndex(x => x[0] === 'BTN'); if (b < 0) return -1;
  const d = (b - k + N) % N;
  return d === 2 ? 2 : d === 3 || d === 4 ? 1 : 0;
}

function tbetOf(rec, s) {
  const out = { fp: fineOf(rec, s), fop: -1, t3r: -1, t4: -1 };
  const p = rec.ev.filter(e => e[0] === 0 && ACT.has(e[2]));
  const hi = p.findIndex(e => e[1] === s); if (hi < 0) return out;
  const before = p.slice(0, hi), rz = before.filter(e => e[2] === 'r' || e[2] === 'b');
  if (rz.length) out.fop = fineOf(rec, rz[0][1]);
  if (rz.length !== 1 || p[hi][2] !== 'r') return out;
  const after = p.slice(hi + 1);
  const first = after.find(e => e[1] !== s && e[2] !== 'f');
  out.t3r = !first ? 0 : first[2] === 'c' ? 1 : first[4] ? 3 : 2;
  // +4 — сбросил сам открывающий (тот, кого 3-бетили), даже если до него кто-то за спиной вступил в игру
  { const oa = after.find(e => e[1] === rz[0][1]); if (oa && oa[2] === 'f') out.t3r += 4; }
  const r4 = after.findIndex(e => e[1] !== s && (e[2] === 'r' || e[2] === 'b'));
  if (r4 < 0) return out;
  const nx = after.slice(r4 + 1).find(e => e[1] === s); if (!nx) return out;
  const four = after[r4], stack = rec.pl[s] ? rec.pl[s][1] : 0;
  // +8 — 4-бет «в холодную»: его поставил не открывающий, а игрок, который ещё не вкладывался (ходит после вас)
  out.t4 = (nx[2] === 'f' ? 0 : nx[2] === 'r' || nx[2] === 'b' ? 2 : 1) + (four[4] || four[3] >= stack - 0.001 ? 4 : 0) + (four[1] !== rz[0][1] ? 8 : 0);
  return out;
}

module.exports = { tbetOf, fineOf };
