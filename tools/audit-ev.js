'use strict';
// Проверка EV по базе: node tools/audit-ev.js <папка базы v3>
// Независимая проверка EV по всей базе: покрытие, совпадение сохранённого EV с пересчётом, и проверка формулы EV
const path = require('path');
const { BaseDir, typedFrom } = require(__dirname + '/../app/parser/store.js');
const RD = (dir, nm, t, st, n) => typedFrom(require(__dirname + '/../app/parser/table.js').readRange(dir, nm, t, st, n), t);
const { evNet, eval7, cardId } = require(__dirname + '/../app/parser/ev.js');
const { oppSeed } = require(__dirname + '/../app/parser/ingest.js');
const b = new BaseDir(process.argv[2]);
const H = (n) => b.column(n);
const net = H('net'), nev = H('nev'), hc = H('hc'), rpp = RD(b.g, 'rpp', 'i32', 0, net.length);
const r2 = (v) => Math.round(v * 1000) / 100;
// 1) покрытие
let heroNoRp = 0; for (let i = 0; i < net.length; i++) if (hc[i] >= 0 && rpp[i] < 0) heroNoRp++;
console.log('ваши раздачи:', net.length, '| с картами, но без записи реплеера:', heroNoRp);
// 2) пересчёт EV из записи реплеера и сравнение с сохранённым (все ваши раздачи)
const ids = []; for (let i = 0; i < net.length; i++) if (hc[i] >= 0 && rpp[i] >= 0) ids.push(i);
let checked = 0, mism = 0, withEv = 0, unknownCards = 0, allinPre = 0; const bad = [];
for (let s = 0; s < ids.length; s += 5000) {
  const part = ids.slice(s, s + 5000), recs = b.replays(part);
  for (const i of part) {
    const rp = recs[i]; if (!rp) continue; checked++;
    const ev = evNet(rp, i + 1);
    const expect = ev == null || Number.isNaN(ev) ? net[i] : r2(net[i] / 10 + ev);
    if (ev != null && !Number.isNaN(ev)) withEv++;
    if (Math.abs(expect - nev[i]) > 0.011) { mism++; if (bad.length < 5) bad.push([i, net[i], nev[i], expect]); }
    // олл-ин до ривера, но карты кого-то из дошедших неизвестны — EV не посчитать (как в Hand2Note)
    const ai = rp.ev.some(e => e[4] === 1), lastSt = Math.max(0, ...rp.ev.filter(e => ['c', 'b', 'r', 'x'].includes(e[2])).map(e => e[0]));
    if (ai && lastSt < 3 && ev == null) { const folded = new Set(rp.ev.filter(e => e[2] === 'f').map(e => e[1])); const live = rp.pl.map((_, k) => k).filter(k => !folded.has(k)); if (live.length >= 2 && !folded.has(rp.h) && live.some(k => k !== rp.h && !(rp.sh && rp.sh[k]))) unknownCards++; }
  }
}
console.log('пересчитано из записей реплеера:', checked, '| с поправкой EV:', withEv, '| сохранённый EV ≠ пересчёту:', mism, bad);
console.log('олл-ин до ривера, но карты соперника не показаны (EV = факт, как в Hand2Note):', unknownCards);
// 3) независимая проверка формулы: олл-ин префлоп один на один, один банк — эквити перебором 200 000 досок
const R = (seed) => { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; };
let hu = 0, maxErr = 0, sumErr = 0; const worst = [];
for (let s = 0; s < ids.length && hu < 300; s += 5000) {
  const part = ids.slice(s, s + 5000), recs = b.replays(part);
  for (const i of part) {
    if (hu >= 300) break;
    const rp = recs[i]; if (!rp) continue;
    const ev = evNet(rp, i + 1); if (ev == null || Number.isNaN(ev)) continue;
    const folded = new Set(rp.ev.filter(e => e[2] === 'f').map(e => e[1]));
    const live = rp.pl.map((_, k) => k).filter(k => !folded.has(k));
    if (live.length !== 2) continue;
    const lastPre = rp.ev.filter(e => e[0] === 0 && ['c', 'r', 'b'].includes(e[2]));
    if (!lastPre.some(e => e[4] === 1)) continue;
    if (rp.ev.some(e => e[0] >= 1 && ['c', 'b', 'r', 'x'].includes(e[2]))) continue; // торговля была после флопа — пропускаем, нужен чистый олл-ин префлоп
    // вложения: анте, блайнды, ставки (суммарно до конца префлопа), возврат несравнённой ставки
    const contrib = new Array(rp.pl.length).fill(0), street = new Array(rp.pl.length).fill(0);
    for (const [st, k, t, a] of rp.ev) {
      if (t === 'A') contrib[k] += a; else if (t === 'SB' || t === 'BB' || t === 'c' || t === 'b') { contrib[k] += a; street[k] += a; } else if (t === 'r') { contrib[k] += a - street[k]; street[k] = a; } else if (t === 'U') contrib[k] -= a;
    }
    const pot = contrib.reduce((x, y) => x + y, 0), v = live.find(k => k !== rp.h);
    if (Math.abs(contrib[v] - contrib[rp.h]) > 0.02) continue; // разные стеки — сайд-банк, пропускаем для простоты
    const hcards = rp.hc.split(' ').map(cardId), vcards = rp.sh[v].split(' ').map(cardId), bd = rp.bd.map(cardId);
    const deck = []; const used = new Set(hcards.concat(vcards)); for (let c = 0; c < 52; c++) if (!used.has(c)) deck.push(c);
    const rr = R(777 + i); let eq = 0; const N = 200000, d = deck.slice();
    for (let q = 0; q < N; q++) { for (let j = 0; j < 5; j++) { const z = j + Math.floor(rr() * (d.length - j)); const t = d[j]; d[j] = d[z]; d[z] = t; } const B = d.slice(0, 5); const a = eval7(hcards.concat(B)), c2 = eval7(vcards.concat(B)); eq += a > c2 ? 1 : a === c2 ? 0.5 : 0; }
    eq /= N;
    const share = (B) => { const a = eval7(hcards.concat(B)), c2 = eval7(vcards.concat(B)); return a > c2 ? 1 : a === c2 ? 0.5 : 0; };
    const actualShare = share(bd);
    const myDelta = (eq - actualShare) * pot; // EV − факт
    const err = Math.abs(myDelta - ev);
    hu++; sumErr += err; if (err > maxErr) maxErr = err; if (err > 0.03 * pot) worst.push([i, rp.hc, rp.sh[v], pot.toFixed(1), ev.toFixed(2), myDelta.toFixed(2)]);
  }
}
console.log('олл-ины префлоп один на один проверено:', hu, '| средняя разница EV:', (sumErr / hu).toFixed(3), 'BB | макс:', maxErr.toFixed(3), 'BB | больше 3% банка:', worst.length, worst.slice(0, 5));
// 4) соперники
const og = b.og, pl = b.players(); const n = pl.reduce((a, p) => a + p.c, 0);
const O = { hc: RD(og, 'hc', 'i16', 0, n), rpp: RD(og, 'rpp', 'i32', 0, n), net: RD(og, 'net', 'f64', 0, n), nev: RD(og, 'nev', 'f64', 0, n), key: RD(og, 'key', 'f64', 0, n), seat: RD(og, 'seat', 'i8', 0, n) };
let oNo = 0, oShown = 0, oNoAny = 0; for (let i = 0; i < n; i++) { if (O.rpp[i] < 0) oNoAny++; if (O.hc[i] >= 0) { oShown++; if (O.rpp[i] < 0) oNo++; } }
console.log('строк соперников:', n, '| с показанными картами:', oShown, '| из них без записи реплеера:', oNo, '| всего без записи:', oNoAny);
// пересчёт EV всех строк соперников с показанными картами
let oc = 0, om = 0, oev = 0; const obad = [];
for (let pid = 0; pid < pl.length; pid++) {
  const p = pl[pid]; const want = []; for (let k = 0; k < p.c; k++) if (O.hc[p.s + k] >= 0 && O.rpp[p.s + k] >= 0) want.push(k);
  if (!want.length) continue;
  const recs = b.playerReplays(pid, want);
  for (const k of want) { const rp = recs[k]; if (!rp) continue; const i = p.s + k; oc++; const ev = evNet(rp, oppSeed(O.key[i], O.seat[i])); if (ev != null && !Number.isNaN(ev)) oev++; const exp = ev == null || Number.isNaN(ev) ? O.net[i] : r2(O.net[i] / 10 + ev); if (Math.abs(exp - O.nev[i]) > 0.011) { om++; if (obad.length < 5) obad.push([pid, k, O.net[i], O.nev[i], exp]); } }
}
console.log('соперники: пересчитано', oc, 'раздач с показанными картами | с поправкой EV:', oev, '| сохранённый EV ≠ пересчёту:', om, obad);
