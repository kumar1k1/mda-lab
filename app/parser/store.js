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
  ['ostk', 'i32'], ['osz', 'i32'], ['nev', 'f64'], ['hpa', 'i8'], ['tmx', 'i8'], ['np', 'i8'], ['lr', 'i8']
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
  constructor(dir, partSize) {
    this.dir = dir; this.partSize = partSize || 256 * 1024 * 1024;
    this.part = -1; this.fd = null; this.off = 0; this.buf = []; this.bufLen = 0;
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

// Чтение папки базы: meta, колонка по имени (байты), записи реплеера по номерам раздач.
class BaseDir {
  constructor(dir) { this.dir = dir; this.meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')); this._idx = null; }
  static exists(dir) { return fs.existsSync(path.join(dir, 'meta.json')); }
  colBytes(name) { const f = path.join(this.dir, 'c_' + name + '.bin'); return fs.existsSync(f) ? fs.readFileSync(f) : null; }
  column(name) { const t = this.meta.cols.find(c => c[0] === name); const b = t && this.colBytes(name); return b ? typedFrom(b, t[1]) : null; }
  index() { if (!this._idx) { const f = path.join(this.dir, 'rp.idx'); this._idx = fs.existsSync(f) ? fs.readFileSync(f) : Buffer.alloc(0); } return this._idx; }
  replays(ids) {
    const idx = this.index(), out = {}, fds = new Map();
    try {
      for (const i of ids) {
        if (!(i >= 0 && (i + 1) * 12 <= idx.length)) continue;
        const p = idx.readInt32LE(i * 12); if (p < 0) continue;
        const off = idx.readUInt32LE(i * 12 + 4), len = idx.readUInt32LE(i * 12 + 8);
        let fd = fds.get(p); if (fd == null) { fd = fs.openSync(path.join(this.dir, 'rp_' + p + '.dat'), 'r'); fds.set(p, fd); }
        const b = Buffer.alloc(len); fs.readSync(fd, b, 0, len, off);
        out[i] = JSON.parse(b.toString('utf8'));
      }
    } finally { for (const fd of fds.values()) fs.closeSync(fd); }
    return out;
  }
  keys() { const f = path.join(this.dir, 'keys.bin'); return fs.existsSync(f) ? typedFrom(fs.readFileSync(f), 'f64') : new Float64Array(0); }
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

// 53-битный хеш строки (два 32-битных FNV-1a) — для отсева дублей без хранения строк
function hash53(s) {
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 0x5bd1e995); h2 ^= h2 >>> 15; }
  return (h1 >>> 0) * 2097152 + ((h2 >>> 0) & 0x1fffff);
}

module.exports = { HashSet53, FORMAT, SCHEMA, TYPES, ColumnBuilder, ReplayWriter, BaseDir, writeBaseDir, writeColumn, writeFromLegacy, packIndex, typedFrom, bufOf, hash53 };
