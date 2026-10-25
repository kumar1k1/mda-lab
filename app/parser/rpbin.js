'use strict';
// Двоичная запись реплеера (формат базы rpz = 2): те же данные, что JSON-запись (места, стеки, действия, борд,
// вскрытия, турнир, дата), но числа — короткими целыми, карты — одним байтом, позиции и типы действий — кодами.
// Записывается сжатой (deflate-raw), как раньше. Получается примерно вдвое меньше прежнего.
// Надёжность: запись, которую нельзя восстановить один в один (необычные поля, карты, позиции), хранится
// в прежнем виде — JSON (первый байт '{' после распаковки), поэтому декодер читает любую запись.
const zlib = require('zlib');

const POS = ['UTG', 'UTG+1', 'UTG+2', 'MP', 'MP+1', 'HJ', 'CO', 'BTN', 'SB', 'BB', '?', 'LJ', 'EP'];
const TYPES = ['S', 'A', 'SB', 'BB', 'f', 'x', 'c', 'b', 'r', 'U', 'W'];
const RANKS = '23456789TJQKA', SUITS = 'cdhs';
const VER = 2;

class W {
  constructor() { this.b = Buffer.alloc(512); this.n = 0; }
  need(k) { if (this.n + k > this.b.length) { const nb = Buffer.alloc(Math.max(this.b.length * 2, this.n + k)); this.b.copy(nb, 0, 0, this.n); this.b = nb; } }
  u8(v) { this.need(1); this.b[this.n++] = v; }
  uv(v) { this.need(10); while (v >= 128) { this.b[this.n++] = (v % 128) | 128; v = Math.floor(v / 128); } this.b[this.n++] = v; }
  sv(v) { this.uv(v < 0 ? -v * 2 - 1 : v * 2); } // zigzag
  str(s) { const x = Buffer.from(s, 'utf8'); this.uv(x.length); this.need(x.length); x.copy(this.b, this.n); this.n += x.length; }
  out() { return this.b.subarray(0, this.n); }
}
class R {
  constructor(b) { this.b = b; this.p = 0; }
  u8() { return this.b[this.p++]; }
  uv() { let v = 0, m = 1, c; do { c = this.b[this.p++]; v += (c & 127) * m; m *= 128; } while (c & 128); return v; }
  sv() { const v = this.uv(); return v % 2 ? -(v + 1) / 2 : v / 2; }
  str() { const n = this.uv(), s = this.b.toString('utf8', this.p, this.p + n); this.p += n; return s; }
}
const cardB = (c) => { if (typeof c !== 'string' || c.length !== 2) return -1; const r = RANKS.indexOf(c[0]), s = SUITS.indexOf(c[1]); return r < 0 || s < 0 ? -1 : r * 4 + s; };
const cardS = (b) => RANKS[b >> 2] + SUITS[b & 3];
// число с точностью 0,01 → целое (только если восстанавливается точно)
const cent = (v) => { const k = Math.round(v * 100); return k / 100 === v ? k : null; };

function encodeBin(rec) {
  const keys = Object.keys(rec);
  for (const k of keys) if (!['pl', 'h', 'hc', 'ev', 'bd', 'sh', 't', 'd'].includes(k)) return null;
  const w = new W(); w.u8(VER);
  // флаги наличия полей
  const has = (k) => k in rec;
  let fl = 0; ['hc', 'bd', 'sh', 't', 'd'].forEach((k, i) => { if (has(k)) fl |= 1 << i; }); if (rec.hc === null) fl |= 32;
  w.u8(fl);
  const cardsW = (s) => { const cs = s.split(' '); w.uv(cs.length); for (const c of cs) { const b = cardB(c); if (b < 0) return false; w.u8(b); } return true; };
  w.uv(rec.pl.length);
  for (const p of rec.pl) {
    if (p.length !== 4) return null;
    const pc = POS.indexOf(p[0]); if (pc < 0) return null;
    const st = cent(p[1]); if (st == null || (p[2] !== 0 && p[2] !== 1) || !Number.isInteger(p[3]) || p[3] < 0) return null;
    w.u8(pc); w.sv(st); w.u8(p[2]); w.uv(p[3]);
  }
  if (!Number.isInteger(rec.h)) return null; w.sv(rec.h);
  if (has('hc') && rec.hc !== null) { if (typeof rec.hc !== 'string' || !cardsW(rec.hc)) return null; }
  w.uv(rec.ev.length);
  for (const e of rec.ev) {
    const tc = TYPES.indexOf(e[2]); if (tc < 0 || !(e.length === 4 || e.length === 5) || !Number.isInteger(e[0]) || e[0] < 0 || e[0] > 7 || !Number.isInteger(e[1])) return null;
    const a = cent(e[3]); if (a == null) return null;
    w.u8(e[0] * 16 + tc); w.u8(e.length === 5 ? (e[4] === 1 ? 2 : e[4] === 0 ? 1 : 255) : 0); w.sv(e[1]); w.sv(a);
    if (e.length === 5 && e[4] !== 0 && e[4] !== 1) return null;
  }
  if (has('bd')) { w.uv(rec.bd.length); for (const c of rec.bd) { const b = cardB(c); if (b < 0) return null; w.u8(b); } }
  if (has('sh')) { const ks = Object.keys(rec.sh); w.uv(ks.length); for (const k of ks) { if (!/^\d+$/.test(k) || typeof rec.sh[k] !== 'string') return null; w.uv(+k); if (!cardsW(rec.sh[k])) return null; } }
  if (has('t')) { if (typeof rec.t !== 'string') return null; w.str(rec.t); }
  if (has('d')) { if (typeof rec.d !== 'string') return null; w.str(rec.d); }
  return w.out();
}
function decodeBin(b) {
  const r = new R(b); r.u8(); const fl = r.u8(), rec = {};
  const cardsR = () => { const n = r.uv(), cs = []; for (let i = 0; i < n; i++) cs.push(cardS(r.u8())); return cs.join(' '); };
  const n = r.uv(); rec.pl = [];
  for (let i = 0; i < n; i++) { const pc = r.u8(), st = r.sv() / 100, hh = r.u8(), seat = r.uv(); rec.pl.push([POS[pc], st, hh, seat]); }
  rec.h = r.sv();
  if (fl & 1) rec.hc = fl & 32 ? null : cardsR();
  const ne = r.uv(); rec.ev = [];
  for (let i = 0; i < ne; i++) { const x = r.u8(), ai = r.u8(), pi = r.sv(), a = r.sv() / 100; const e = [x >> 4, pi, TYPES[x & 15], a]; if (ai) e.push(ai === 2 ? 1 : 0); rec.ev.push(e); }
  if (fl & 2) { const k = r.uv(); rec.bd = []; for (let i = 0; i < k; i++) rec.bd.push(cardS(r.u8())); }
  if (fl & 4) { const k = r.uv(); rec.sh = {}; for (let i = 0; i < k; i++) { const key = r.uv(); rec.sh[key] = cardsR(); } }
  if (fl & 8) rec.t = r.str();
  if (fl & 16) rec.d = r.str();
  return rec;
}
// исходная запись → сжатые байты: двоичный вид, если он восстанавливает запись один в один, иначе JSON
function encodeRec(rec) {
  let raw = null;
  try { const b = encodeBin(rec); if (b && JSON.stringify(decodeBin(b)) === JSON.stringify(rec)) raw = b; } catch (e) { raw = null; }
  if (!raw) raw = Buffer.from(JSON.stringify(rec), 'utf8');
  return zlib.deflateRawSync(raw, { level: 6 });
}
// сжатые байты → запись (оба вида: двоичный — первый байт VER, JSON — '{')
function decodeRec2(z) {
  const b = zlib.inflateRawSync(z);
  return b[0] === VER ? decodeBin(b) : JSON.parse(b.toString('utf8'));
}

module.exports = { encodeRec, decodeRec2, encodeBin, decodeBin };
