'use strict';
// Двоичная запись реплеера (формат базы rpz = 2): те же данные, что JSON-запись (места, стеки, действия, борд,
// вскрытия, турнир, дата), но числа — короткими целыми, карты — одним байтом, позиции и типы действий — кодами.
// Хранится без дополнительного сжатия: примерно вдвое меньше прежней сжатой JSON-записи и быстрее в чтении.
// Надёжность: запись, которую нельзя восстановить один в один (необычные поля, карты, позиции), хранится
// в прежнем виде — JSON (первый байт '{' после распаковки), поэтому декодер читает любую запись.

const POS = ['UTG', 'UTG+1', 'UTG+2', 'MP', 'MP+1', 'HJ', 'CO', 'BTN', 'SB', 'BB', '?', 'LJ', 'EP'];
const TYPES = ['S', 'A', 'SB', 'BB', 'f', 'x', 'c', 'b', 'r', 'U', 'W'];
const RANKS = '23456789TJQKA', SUITS = 'cdhs';
const VER = 2, VER_T = 3; // 3 — турнир номером из таблицы турниров базы

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
  for (const k of keys) if (!['pl', 'h', 'hc', 'ev', 'bd', 'sh', 't', 'd', 'c'].includes(k)) return null;
  const w = new W(); w.u8(VER);
  // флаги наличия полей
  const has = (k) => k in rec;
  let fl = 0; ['hc', 'bd', 'sh', 't', 'd'].forEach((k, i) => { if (has(k)) fl |= 1 << i; }); if (rec.hc === null) fl |= 32; if (has('c')) fl |= 64;
  w.u8(fl);
  // турнир — сразу после флагов: при записи в базу строка заменяется номером в таблице турниров базы (internTitle)
  if (has('t')) { if (typeof rec.t !== 'string') return null; w.str(rec.t); }
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
  // анте в начале: подряд игроки 0, 1, 2… с одинаковой суммой — одной записью (так почти в каждой турнирной раздаче)
  let na = 0; const ev = rec.ev;
  while (na < ev.length && ev[na].length === 4 && ev[na][0] === 0 && ev[na][2] === 'A' && ev[na][1] === na && ev[na][3] === ev[0][3]) na++;
  const aa = na ? cent(ev[0][3]) : 0; if (aa == null) return null;
  w.uv(na); if (na) w.sv(aa);
  w.uv(ev.length - na);
  for (let q = na; q < ev.length; q++) {
    const e = ev[q];
    const tc = TYPES.indexOf(e[2]); if (tc < 0 || !(e.length === 4 || e.length === 5) || !Number.isInteger(e[0]) || e[0] < 0 || e[0] > 7 || !Number.isInteger(e[1]) || e[1] < -1 || e[1] > 126) return null;
    if (e.length === 5 && e[4] !== 0 && e[4] !== 1) return null;
    const a = cent(e[3]); if (a == null) return null;
    // байт 1: улица и тип (+ флаг пятого элемента), байт 2: игрок + 1 (+ флаг «сумма не ноль»), затем сумма и пятый элемент
    w.u8(e[0] * 16 + tc + (e.length === 5 ? 128 : 0)); w.u8((e[1] + 1) | (a !== 0 ? 128 : 0));
    if (a !== 0) w.sv(a);
    if (e.length === 5) w.u8(e[4]);
  }
  if (has('bd')) { w.uv(rec.bd.length); for (const c of rec.bd) { const b = cardB(c); if (b < 0) return null; w.u8(b); } }
  if (has('sh')) { const ks = Object.keys(rec.sh); w.uv(ks.length); for (const k of ks) { if (!/^\d+$/.test(k) || typeof rec.sh[k] !== 'string') return null; w.uv(+k); if (!cardsW(rec.sh[k])) return null; } }
  if (has('d')) { // «ГГГГ-ММ-ДД ЧЧ:ММ» — минутами (4–5 байт вместо 16), иное — строкой
    if (typeof rec.d !== 'string') return null;
    const dm = /^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2})$/.exec(rec.d);
    if (dm && dm[4].length === 2) { w.u8(1); w.uv(Math.round(Date.UTC(+dm[1], +dm[2] - 1, +dm[3], +dm[4], +dm[5]) / 60000)); } else { w.u8(0); w.str(rec.d); }
  }
  // большой блайнд в фишках (с 0.7.2): для показа стеков и ставок в фишках
  if (has('c')) { const c = typeof rec.c === 'number' && rec.c > 0 ? cent(rec.c) : null; if (c == null) return null; w.uv(c); }
  return w.out();
}
function decodeBin(b, titles) {
  const r = new R(b); const ver = r.u8(), fl = r.u8(), rec = {};
  let t; if (fl & 8) { if (ver === VER_T) { const id = r.uv(); t = titles && titles[id] != null ? titles[id] : ''; } else t = r.str(); }
  const cardsR = () => { const n = r.uv(), cs = []; for (let i = 0; i < n; i++) cs.push(cardS(r.u8())); return cs.join(' '); };
  const n = r.uv(); rec.pl = [];
  for (let i = 0; i < n; i++) { const pc = r.u8(), st = r.sv() / 100, hh = r.u8(), seat = r.uv(); rec.pl.push([POS[pc], st, hh, seat]); }
  rec.h = r.sv();
  if (fl & 1) rec.hc = fl & 32 ? null : cardsR();
  rec.ev = [];
  const na = r.uv(); if (na) { const aa = r.sv() / 100; for (let i = 0; i < na; i++) rec.ev.push([0, i, 'A', aa]); }
  const ne = r.uv();
  for (let i = 0; i < ne; i++) {
    const x = r.u8(), y = r.u8(), a = y & 128 ? r.sv() / 100 : 0;
    const e = [(x & 127) >> 4, (y & 127) - 1, TYPES[x & 15], a]; if (x & 128) e.push(r.u8()); rec.ev.push(e);
  }
  if (fl & 2) { const k = r.uv(); rec.bd = []; for (let i = 0; i < k; i++) rec.bd.push(cardS(r.u8())); }
  if (fl & 4) { const k = r.uv(); rec.sh = {}; for (let i = 0; i < k; i++) { const key = r.uv(); rec.sh[key] = cardsR(); } }
  if (fl & 8) rec.t = t;
  if (fl & 16) { if (r.u8()) { const t = new Date(r.uv() * 60000), z = (v) => String(v).padStart(2, '0'); rec.d = t.getUTCFullYear() + '-' + z(t.getUTCMonth() + 1) + '-' + z(t.getUTCDate()) + ' ' + z(t.getUTCHours()) + ':' + z(t.getUTCMinutes()); } else rec.d = r.str(); }
  if (fl & 64) rec.c = r.uv() / 100;
  if (fl & 128) { const k = r.uv(); rec.np = []; for (let i = 0; i < k; i++) rec.np.push(r.uv()); } // кто за столом (см. appendNames)
  return rec;
}
// исходная запись → байты: двоичный вид, если он восстанавливает запись один в один, иначе JSON.
// Дополнительно не сжимается: двоичный вид уже плотный (сжатие давало ~1%, а время — заметное).
function encodeRec(rec) {
  try { const b = encodeBin(rec); if (b && JSON.stringify(decodeBin(b)) === JSON.stringify(rec)) return Buffer.from(b); } catch (e) { /* JSON */ }
  return Buffer.from(JSON.stringify(rec), 'utf8');
}
// строка турнира → номер в таблице турниров базы (getId(строка) → номер); прочие записи — как есть
function internTitle(b, getId) {
  if (b[0] !== VER || !(b[1] & 8)) return b;
  const r = new R(b); r.p = 2; const t = r.str(), rest = b.subarray(r.p);
  const w = new W(); w.u8(VER_T); w.u8(b[1]); w.uv(getId(t));
  return Buffer.concat([w.out(), rest]);
}
// байты базы (rpz = 2) → запись; titles — таблица турниров базы
function decodeRecBin(b, titles) {
  return b[0] === VER || b[0] === VER_T ? decodeBin(b, titles) : JSON.parse(b.toString('utf8'));
}

// Кто сидел за столом (с 0.7.2): дописывается в конец записи при загрузке в базу, по месту на игрока —
// 0 неизвестно, нечётное 1 + 2·k — ваш ник номер k в meta.heroNicks, чётное 2 + 2·p — соперник p в списке игроков базы.
function playersIn(b) { // число мест в двоичной записи
  const r = new R(b); r.p = 2; if (b[1] & 8) { if (b[0] === VER_T) r.uv(); else r.str(); } return r.uv();
}
function appendNames(b, codes) {
  if ((b[0] !== VER && b[0] !== VER_T) || (b[1] & 128)) return b;
  const w = new W(); w.uv(codes.length); for (const c of codes) w.uv(c);
  const out = Buffer.concat([b, w.out()]); out[1] |= 128; return out;
}

// номер турнира у записи вида 3 (для подгрузки дописанной таблицы турниров)
function titleId(b) { const r = new R(b); r.p = 2; return r.uv(); }

module.exports = { encodeRec, decodeRecBin, internTitle, titleId, encodeBin, decodeBin, playersIn, appendNames };
