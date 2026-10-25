'use strict';
// Хранение базы на диске в колоночном бинарном формате (mdalab-cols-v2).
//
// Зачем: прежний формат — один большой JSON — упирается в память и в предел длины строки
// уже на сотнях мегабайт. Здесь каждая колонка — отдельный файл с числами фиксированного размера,
// записи реплеера лежат частями с индексом и читаются по одной. Сборка и чтение не требуют
// держать всю базу в памяти как объекты, поэтому формат выдерживает гигабайты историй.
//
// Папка базы:
//   meta.json            — описание: герой, ники, румы, период, число раздач, список колонок с типами
//   c_<имя>.bin          — колонка (Int8 / Int16 / Int32 / Float64, little-endian), по значению на раздачу
//   keys.bin             — Float64 хеш «номер раздачи|турнир» для отсева дублей при дозагрузке
//   rp.idx               — индекс реплеера: на раздачу part (Int32, −1 = нет записи), offset (Uint32), length (Uint32)
//   rp_<n>.dat           — записи реплеера (JSON подряд), часть не больше partSize байт
//
// Внутри программы колонки становятся типизированными массивами: c.net[i] читается так же, как раньше.

const fs = require('fs');
const path = require('path');

const FORMAT = 'mdalab-cols-v2';

// Порядок и типы колонок. Целые — с запасом по диапазону (см. проверку в ColumnBuilder.push).
const SCHEMA = [
  ['room', 'i8'], ['type', 'i8'], ['month', 'i32'], ['tbl', 'i8'], ['pos', 'i8'], ['bb', 'i32'], ['sit', 'i8'], ['lim', 'i8'],
  ['act', 'i8'], ['size', 'i32'], ['fti', 'i8'], ['bvb', 'i8'], ['fvr', 'i8'], ['day', 'i32'], ['hc', 'i16'], ['net', 'f64'],
  ['sto', 'i8'], ['f3b', 'i8'], ['orsp', 'i8'], ['bmin', 'i32'], ['sbs', 'i32'], ['bbs', 'i32'], ['bh', 'i32'], ['bsh', 'i8'],
  ['bmd', 'i8'], ['bdp', 'i8'], ['cov', 'i8'], ['bi', 'i32'], ['rz', 'i8'], ['cl', 'i8'], ['rai', 'i8'], ['opos', 'i8'],
  ['ostk', 'i32'], ['osz', 'i32'], ['nev', 'f64'], ['hpa', 'i8'], ['tmx', 'i8'], ['np', 'i8'], ['lr', 'i8'],
  ['ant', 'i16'], // все анте раздачи, BB×100 (-1 — неизвестно: базы, собранные до этой колонки)
  ['fcb', 'i8'], // после колд-колла: фолд на контбет флопа (1), продолжил (0), не было (-1)
  ['cbs', 'i16'] // размер этого контбета, % банка флопа (-1 — не было или неизвестно)
];
const TYPES = {
  i8: { A: Int8Array, min: -128, max: 127 },
  i16: { A: Int16Array, min: -32768, max: 32767 },
  i32: { A: Int32Array, min: -2147483648, max: 2147483647 },
  u32: { A: Uint32Array, min: 0, max: 4294967295 },
  f64: { A: Float64Array, min: -Infinity, max: Infinity }
};
const CHUNK = 1 << 16;

// Растущая колонка: куски по 65 536 значений, без перевыделения всей памяти.
class ColumnBuilder {
  constructor(name, type) { this.name = name; this.type = type; this.T = TYPES[type]; this.chunks = []; this.cur = null; this.pos = CHUNK; this.length = 0; }
  push(v) {
    if (v == null || Number.isNaN(v)) v = this.type === 'f64' ? 0 : -1;
    if (v < this.T.min || v > this.T.max) throw new Error('колонка ' + this.name + ': значение ' + v + ' вне диапазона ' + this.type);
    if (this.pos === CHUNK) { this.cur = new this.T.A(CHUNK); this.chunks.push(this.cur); this.pos = 0; }
    this.cur[this.pos++] = v; this.length++;
  }
  get(i) { return this.chunks[i >>> 16][i & (CHUNK - 1)]; }
  set(i, v) { this.chunks[i >>> 16][i & (CHUNK - 1)] = v; }
  // одним массивом; с перестановкой perm (perm[k] — откуда брать k-е значение)
  toArray(perm) {
    const out = new this.T.A(this.length);
    if (perm) for (let k = 0; k < this.length; k++) out[k] = this.get(perm[k]);
    else { let o = 0; for (const c of this.chunks) { const n = Math.min(CHUNK, this.length - o); out.set(n === CHUNK ? c : c.subarray(0, n), o); o += n; } }
    return out;
  }
}

const bufOf = (ta) => Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength);
// Typed array по байтам файла/сообщения: при невыровненном начале — копия
function typedFrom(bytes, type) {
  const A = TYPES[type].A, bpe = A.BYTES_PER_ELEMENT;
  let b = bytes;
  if (b.byteOffset % bpe) b = new Uint8Array(b);
  return new A(b.buffer, b.byteOffset, Math.floor(b.byteLength / bpe));
}

// Запись реплеера частями: JSON подряд, часть закрывается при partSize байт.
class ReplayWriter {
  constructor(dir, partSize, firstPart) {
    this.dir = dir; this.partSize = partSize || 256 * 1024 * 1024;
    this.part = (firstPart || 0) - 1; this.fd = null; this.off = 0; this.buf = []; this.bufLen = 0;
    this.idxPart = new ColumnBuilder('rp.part', 'i32'); this.idxOff = new ColumnBuilder('rp.off', 'u32'); this.idxLen = new ColumnBuilder('rp.len', 'u32');
  }
  _open() { this._flush(); if (this.fd != null) fs.closeSync(this.fd); this.part++; this.fd = fs.openSync(path.join(this.dir, 'rp_' + this.part + '.dat'), 'w+'); this.off = 0; }
  _flush() { if (this.bufLen) { fs.writeSync(this.fd, Buffer.concat(this.buf, this.bufLen)); this.buf = []; this.bufLen = 0; } }
  // добавляет запись для очередной раздачи (rec == null — у раздачи нет записи)
  add(rec) {
    if (rec == null) { this.idxPart.push(-1); this.idxOff.push(0); this.idxLen.push(0); return; }
    const b = Buffer.from(JSON.stringify(rec), 'utf8');
    if (this.fd == null || this.off + b.length > this.partSize) this._open();
    this.idxPart.push(this.part); this.idxOff.push(this.off); this.idxLen.push(b.length);
    this.buf.push(b); this.bufLen += b.length; this.off += b.length;
    if (this.bufLen > 4 * 1024 * 1024) this._flush();
  }
  // готовая (сжатая) запись: возвращает [part, offset, length]
  addRaw(b) {
    if (this.fd == null || this.off + b.length > this.partSize) this._open();
    const ref = [this.part, this.off, b.length];
    this.buf.push(b); this.bufLen += b.length; this.off += b.length;
    if (this.bufLen > 4 * 1024 * 1024) this._flush();
    return ref;
  }
  get parts() { return this.part + 1; }
  close() { this._flush(); if (this.fd != null) fs.closeSync(this.fd); this.fd = null; }
  // чтение записи по исходному номеру (во время сборки, до перестановки)
  read(i) {
    const p = this.idxPart.get(i); if (p < 0) return null;
    this._flush();
    const len = this.idxLen.get(i), b = Buffer.alloc(len);
    const fd = p === this.part && this.fd != null ? this.fd : fs.openSync(path.join(this.dir, 'rp_' + p + '.dat'), 'r');
    fs.readSync(fd, b, 0, len, this.idxOff.get(i));
    if (fd !== this.fd) fs.closeSync(fd);
    return JSON.parse(b.toString('utf8'));
  }
}

// Индекс реплеера одним буфером: на раздачу 12 байт (part Int32, offset Uint32, length Uint32)
function packIndex(part, off, len) {
  const n = part.length, b = Buffer.alloc(n * 12);
  for (let k = 0; k < n; k++) { b.writeInt32LE(part[k], k * 12); b.writeUInt32LE(off[k], k * 12 + 4); b.writeUInt32LE(len[k], k * 12 + 8); }
  return b;
}

const writeColumn = (dir, name, a) => fs.writeFileSync(path.join(dir, 'c_' + name + '.bin'), bufOf(a));
// Пишет готовую базу в папку. cols — { имя: typed array }, keys — Float64Array, rpIndex — Buffer индекса.
// written — колонки, уже записанные на диск по одной (writeColumn), их только перечисляем в meta.
function writeBaseDir(dir, meta, cols, keys, rpIndex, written) {
  fs.mkdirSync(dir, { recursive: true });
  const colsMeta = [];
  for (const [name, type] of SCHEMA) {
    const a = cols[name];
    if (a) writeColumn(dir, name, a);
    else if (!(written && fs.existsSync(path.join(dir, 'c_' + name + '.bin')))) continue;
    colsMeta.push([name, type]);
  }
  if (keys) fs.writeFileSync(path.join(dir, 'keys.bin'), bufOf(keys));
  if (rpIndex) fs.writeFileSync(path.join(dir, 'rp.idx'), rpIndex);
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(Object.assign({}, meta, { format: FORMAT, cols: colsMeta })));
}

// Чтение папки базы (форматы v2 и v3): meta, колонка по имени (байты), записи реплеера по номерам раздач,
// а в v3 — ещё игроки-соперники: список, их колонки (диапазон строк) и записи реплеера с их позиции.
class BaseDir {
  constructor(dir) {
    this.dir = dir; this.meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
    this.v3 = this.meta.format === 'mdalab-cols-v3';
    this.g = this.v3 ? path.join(dir, this.meta.colDir) : dir; this.og = path.join(this.g, 'opp');
    this.z = !!this.meta.rpz; this._idx = null; this._players = null;
  }
  static exists(dir) { return fs.existsSync(path.join(dir, 'meta.json')); }
  colBytes(name) { const f = path.join(this.g, 'c_' + name + '.bin'); return fs.existsSync(f) ? fs.readFileSync(f) : null; }
  column(name) { const t = this.meta.cols.find(c => c[0] === name); const b = t && this.colBytes(name); return b ? typedFrom(b, t[1]) : null; }
  index() { if (!this._idx) { const f = path.join(this.dir, 'rp.idx'); this._idx = fs.existsSync(f) ? fs.readFileSync(f) : Buffer.alloc(0); } return this._idx; }
  _readRecs(refs, seats) { // refs: [[id, part, off, len]]
    const out = {}, fds = new Map();
    try {
      for (let q = 0; q < refs.length; q++) {
        const [i, p, off, len] = refs[q]; if (p < 0) continue;
        let fd = fds.get(p); if (fd == null) { fd = fs.openSync(path.join(this.dir, 'rp_' + p + '.dat'), 'r'); fds.set(p, fd); }
        const b = Buffer.alloc(len); fs.readSync(fd, b, 0, len, off);
        const rec = decodeRec(b, this.z); out[i] = seats ? asSeat(rec, seats[q]) : rec;
      }
    } finally { for (const fd of fds.values()) fs.closeSync(fd); }
    return out;
  }
  replays(ids) {
    ids = ids.filter(i => i >= 0 && i < this.meta.count);
    if (this.v3) {
      const { readAt } = require('./table.js');
      const p = readAt(this.g, 'rpp', 'i32', ids), o = readAt(this.g, 'rpo', 'u32', ids), l = readAt(this.g, 'rpl', 'u32', ids);
      return this._readRecs(ids.map((i, q) => [i, p[q], o[q], l[q]]));
    }
    const idx = this.index(), refs = [];
    for (const i of ids) if ((i + 1) * 12 <= idx.length) refs.push([i, idx.readInt32LE(i * 12), idx.readUInt32LE(i * 12 + 4), idx.readUInt32LE(i * 12 + 8)]);
    return this._readRecs(refs);
  }
  keys() { const f = path.join(this.dir, 'keys.bin'); return fs.existsSync(f) ? typedFrom(fs.readFileSync(f), 'f64') : new Float64Array(0); }
  // ---- соперники (v3)
  players() { if (!this._players) this._players = this.v3 && fs.existsSync(path.join(this.og, 'players.json')) ? JSON.parse(fs.readFileSync(path.join(this.og, 'players.json'), 'utf8')) : []; return this._players; }
  // список для выбора: по числу раздач; q — начало ника (без учёта регистра)
  playerList(q, limit) {
    const s = (q || '').trim().toLowerCase(), all = this.players(), out = [];
    const mine = this.meta.nicks || {}; // ники алиасов — это вы и ваши алиасы, не соперники
    const memb = this.memberKeys(); // игроки базы, добавленные в алиасы, — показываются под алиасом
    for (let i = 0; i < all.length; i++) { const p = all[i]; if (p.c && !mine[p.n] && !memb.has(this.meta.rooms[p.r] + '\u0001' + p.n) && (!s || p.n.toLowerCase().startsWith(s))) out.push(i); }
    out.sort((a, b) => all[b].c - all[a].c || (all[a].n < all[b].n ? -1 : 1));
    return { total: out.length, players: out.slice(0, limit || 100).map(i => ({ pid: i, name: all[i].n, room: all[i].r, count: all[i].c, shown: all[i].sh })) };
  }
  // описание «базы» одного соперника — как у вашей базы, чтобы все вкладки считали так же
  // колд-колл и фолд на контбет флопа после колд-колла по каждому игроку базы (для квадранта во вкладке «Колд-колл»):
  // [pid, ник, рум, раздач, вскрытий, [по позициям: возможностей CC, CC, контбетов после колд-колла, фолдов на них]×8] — только у кого есть хоть что-то; считается один раз
  playersCc() {
    if (this._cc) return this._cc;
    const pl = this.players(), n = pl.reduce((a, p) => a + p.c, 0), out = [];
    if (!n || !this.meta.cols.some(c => c[0] === 'fcb')) return (this._cc = { ok: false, rows: [] });
    const { readRange } = require('./table.js'), T = (nm, t) => typedFrom(readRange(this.og, nm, t, 0, n), t);
    const rz = T('rz', 'i8'), cl = T('cl', 'i8'), lr = T('lr', 'i8'), pos = T('pos', 'i8'), act = T('act', 'i8'), fcb = T('fcb', 'i8');
    // по позициям: 0 — все без BB (как «Колд-колл» в #1), 1+pos — UTG, MP, HJ, CO, BTN, SB, BB (номера позиций базы 0…6)
    for (let pid = 0; pid < pl.length; pid++) {
      const p = pl[pid], st = new Array(8 * 4).fill(0); let any = false;
      for (let i = p.s; i < p.s + p.c; i++) {
        // «все» — без BB (как в #1), и колд-колл, и фолд на контбет; BB — отдельно (защита большого блайнда)
        const ps = pos[i], kc = ps === 6 ? [7] : [0, 1 + ps], kf = kc;
        if (rz[i] === 1 && cl[i] === 0 && lr[i] === 0) { any = true; for (const k of kc) { st[k * 4]++; if (act[i] === 1) st[k * 4 + 1]++; } }
        if (fcb[i] >= 0) { any = true; for (const k of kf) { st[k * 4 + 2]++; if (fcb[i] === 1) st[k * 4 + 3]++; } }
      }
      if (any) out.push([pid, p.n, p.r, p.c, p.sh || 0, st]);
    }
    return (this._cc = { ok: true, rows: out });
  }
  memberKeys() { const m = new Set(); for (const a of this.meta.aliases || []) if (!a.gone) for (const o of a.opp || []) m.add(o.r + '\u0001' + o.n); return m; }
  // игроки базы по нику и руму (для участников алиасов): [{pid, count, shown} | null]
  playersFind(list) {
    const all = this.players(), idx = new Map(); all.forEach((p, i) => idx.set(this.meta.rooms[p.r] + '\u0001' + p.n, i));
    return (list || []).map(([n, r]) => { const i = idx.get(r + '\u0001' + n); return i == null ? null : { pid: i, name: all[i].n, room: all[i].r, count: all[i].c, shown: all[i].sh }; });
  }
  // колонки соперников: общие со строками героя (без колонки алиаса aid — она только у ваших раздач)
  oppCols() { return this.meta.cols.filter(c => c[0] !== 'aid'); }
  playerMeta(pid) {
    const p = this.players()[pid]; if (!p) return null;
    const room = this.meta.rooms[p.r];
    return { format: this.meta.format, demo: false, hero: p.n, nicks: { [p.n]: room }, rooms: this.meta.rooms, types: this.meta.types, periodStart: this.meta.periodStart, count: p.c, cols: this.oppCols(), pid, opponent: true };
  }
  playerCol(pid, name) {
    const p = this.players()[pid], t = this.oppCols().find(c => c[0] === name); if (!p || !t) return null;
    return require('./table.js').readRange(this.og, name, t[1], p.s, p.c);
  }
  playerReplays(pid, ids) {
    const pl = this.players()[pid]; if (!pl) return {};
    ids = ids.filter(i => i >= 0 && i < pl.c);
    const { readAt } = require('./table.js'), rows = ids.map(i => pl.s + i);
    const p = readAt(this.og, 'rpp', 'i32', rows), o = readAt(this.og, 'rpo', 'u32', rows), l = readAt(this.og, 'rpl', 'u32', rows), st = readAt(this.og, 'seat', 'i8', rows);
    return this._readRecs(ids.map((i, q) => [i, p[q], o[q], l[q]]), Array.from(st));
  }
}

// Перевод базы старого формата (JSON: db + rp) в папку нового формата — значения не меняются.
function writeFromLegacy(dir, db, rp, partSize) {
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const n = db.count, cols = {};
  for (const [name, type] of SCHEMA) {
    const src = db.cols[name]; if (!src) continue;
    const b = new ColumnBuilder(name, type); for (let i = 0; i < n; i++) b.push(src[i]); cols[name] = b.toArray();
  }
  const w = new ReplayWriter(dir, partSize);
  for (let i = 0; i < n; i++) w.add(rp && rp[i] ? rp[i] : null);
  w.close();
  const { cols: _c, ...meta } = db;
  writeBaseDir(dir, meta, cols, null, packIndex(w.idxPart.toArray(), w.idxOff.toArray(), w.idxLen.toArray()));
}

// Множество 53-битных хешей на типизированном массиве (открытая адресация).
// Стандартный Set ограничен ~16,7 млн записей и тратит ~40–50 байт на запись; здесь ~16–32 байта и предела нет.
class HashSet53 {
  constructor(cap) { this.cap = 1 << Math.max(16, Math.ceil(Math.log2((cap || 65536) * 2))); this.t = new Float64Array(this.cap); this.size = 0; }
  _slot(h) { return (((h % 4294967296) >>> 0) ^ Math.floor(h / 4294967296)) & (this.cap - 1); }
  has(h) {
    h += 1; let i = this._slot(h);
    for (;;) { const v = this.t[i]; if (v === 0) return false; if (v === h) return true; i = (i + 1) & (this.cap - 1); }
  }
  // добавляет хеш; false — такой уже был
  add(h) {
    h += 1; // 0 — пустая ячейка
    let i = this._slot(h);
    for (;;) { const v = this.t[i]; if (v === 0) break; if (v === h) return false; i = (i + 1) & (this.cap - 1); }
    this.t[i] = h; this.size++;
    if (this.size * 2 > this.cap) this._grow();
    return true;
  }
  _grow() { const old = this.t; this.cap *= 2; this.t = new Float64Array(this.cap); for (const v of old) if (v !== 0) { let i = this._slot(v); while (this.t[i] !== 0) i = (i + 1) & (this.cap - 1); this.t[i] = v; } }
  clear() { this.t = new Float64Array(0); this.cap = 0; this.size = 0; }
}

// Ход раздачи с позиции другого игрока (соперника): seat — его номер в pl.
// Карты героя (того, чьими глазами записана раздача) остаются известными, карты игрока — только если показаны.
function asSeat(rec, seat) {
  if (seat == null || seat < 0 || seat === rec.h) return rec;
  const sh = Object.assign({}, rec.sh || {});
  if (rec.hc && sh[rec.h] == null) sh[rec.h] = rec.hc;
  return Object.assign({}, rec, { h: seat, hc: sh[seat] || null, sh, pl: rec.pl.map((p, j) => [p[0], p[1], j === seat ? 1 : 0, p[3]]) });
}
// запись реплеера из байтов (z — сжата deflate-raw)
function decodeRec(b, z) { return JSON.parse((z ? require('zlib').inflateRawSync(b) : b).toString('utf8')); }

// 53-битный хеш строки (два 32-битных FNV-1a) — для отсева дублей без хранения строк
function hash53(s) {
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 0x5bd1e995); h2 ^= h2 >>> 15; }
  return (h1 >>> 0) * 2097152 + ((h2 >>> 0) & 0x1fffff);
}

module.exports = { asSeat, decodeRec, HashSet53, FORMAT, SCHEMA, TYPES, ColumnBuilder, ReplayWriter, BaseDir, writeBaseDir, writeColumn, writeFromLegacy, packIndex, typedFrom, bufOf, hash53 };
