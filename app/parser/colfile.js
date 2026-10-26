'use strict';
// Сжатая колонка на диске: c_<имя>.z (с 0.7). Значения хранятся порциями по CR строк; каждая порция —
// байты значений, переставленные «по разрядам» (сначала младшие байты всех значений, потом следующие…),
// и сжатые deflate. Перестановка собирает похожие байты вместе: небольшие числа (позиции, действия, суммы)
// сжимаются в 4–6 раз. Порции читаются по отдельности — игрок, диапазон строк или отдельные строки
// распаковывают только свои порции.
// Устройство файла: [порции][смещения порций: u32 × (число порций + 1)][подвал 24 байта:
// 'MDZ1', строк, строк в порции, байт на значение, порций, смещение таблицы смещений].
// Старые несжатые колонки c_<имя>.bin читаются как раньше.
const fs = require('fs');
const zlib = require('zlib');

const MAGIC = 0x315a444d; // 'MDZ1'
const CR = 16384;
const LEVEL = 4;

function shuffle(src, es) { // src: Uint8Array (n значений по es байт) → по разрядам
  if (es === 1) return src;
  const n = src.length / es, out = new Uint8Array(src.length);
  for (let b = 0; b < es; b++) { const o = b * n; for (let i = 0; i < n; i++) out[o + i] = src[i * es + b]; }
  return out;
}
function unshuffle(src, es, out, at) { // обратно, в out с позиции at (байты)
  const n = src.length / es;
  if (es === 1) { out.set(src, at); return; }
  for (let b = 0; b < es; b++) { const o = b * n; for (let i = 0; i < n; i++) out[at + i * es + b] = src[o + i]; }
}

// Запись колонки порциями (поток значений): push по одному или целым массивом
class ZWriter {
  constructor(file, es) { this.file = file; this.es = es; this.tmp = file + '.tmp'; this.fd = fs.openSync(this.tmp, 'w'); this.buf = new Uint8Array(CR * es); this.k = 0; this.offs = [0]; this.pos = 0; this.n = 0; }
  _flush() {
    if (!this.k) return;
    const raw = this.buf.subarray(0, this.k * this.es), z = zlib.deflateRawSync(shuffle(raw, this.es), { level: LEVEL });
    fs.writeSync(this.fd, z); this.pos += z.length; this.offs.push(this.pos); this.n += this.k; this.k = 0;
  }
  // байты одного значения (es штук) из view
  pushBytes(bytes, off) { this.buf.set(bytes.subarray(off, off + this.es), this.k * this.es); if (++this.k === CR) this._flush(); }
  pushAll(bytes) { // все значения массива подряд
    let off = 0;
    while (off < bytes.length) { const take = Math.min((CR - this.k) * this.es, bytes.length - off); this.buf.set(bytes.subarray(off, off + take), this.k * this.es); this.k += take / this.es; off += take; if (this.k === CR) this._flush(); }
  }
  close() {
    this._flush();
    const nch = this.offs.length - 1, idx = Buffer.alloc((nch + 1) * 4 + 24);
    for (let i = 0; i <= nch; i++) idx.writeUInt32LE(this.offs[i], i * 4);
    const f = (nch + 1) * 4; idx.writeUInt32LE(MAGIC, f); idx.writeUInt32LE(this.n, f + 4); idx.writeUInt32LE(CR, f + 8); idx.writeUInt32LE(this.es, f + 12); idx.writeUInt32LE(nch, f + 16); idx.writeUInt32LE(this.pos, f + 20);
    fs.writeSync(this.fd, idx); fs.closeSync(this.fd); fs.renameSync(this.tmp, this.file);
  }
}

// Чтение: подвал и таблица смещений один раз; порции — по запросу (с небольшим кэшем последних)
const HEADS = new Map(); // file → { mtime, n, cr, es, nch, offs }
function head(file) {
  const st = fs.statSync(file), h0 = HEADS.get(file);
  if (h0 && h0.mtime === st.mtimeMs && h0.size === st.size) return h0;
  const fd = fs.openSync(file, 'r');
  try {
    const ft = Buffer.alloc(24); fs.readSync(fd, ft, 0, 24, st.size - 24);
    if (ft.readUInt32LE(0) !== MAGIC) throw new Error('повреждена колонка ' + file);
    const n = ft.readUInt32LE(4), cr = ft.readUInt32LE(8), es = ft.readUInt32LE(12), nch = ft.readUInt32LE(16), io = ft.readUInt32LE(20);
    const ib = Buffer.alloc((nch + 1) * 4); fs.readSync(fd, ib, 0, ib.length, io);
    const offs = new Array(nch + 1); for (let i = 0; i <= nch; i++) offs[i] = ib.readUInt32LE(i * 4);
    const h = { mtime: st.mtimeMs, size: st.size, n, cr, es, nch, offs };
    HEADS.set(file, h); if (HEADS.size > 2000) HEADS.delete(HEADS.keys().next().value);
    return h;
  } finally { fs.closeSync(fd); }
}
function readChunk(fd, h, c) { // байты значений порции c (как в несжатом файле)
  const z = Buffer.alloc(h.offs[c + 1] - h.offs[c]); fs.readSync(fd, z, 0, z.length, h.offs[c]);
  const sh = zlib.inflateRawSync(z), out = new Uint8Array(sh.length); unshuffle(sh, h.es, out, 0);
  return out;
}
// байты строк [start, start + count)
function readRangeZ(file, start, count) {
  const h = head(file), out = Buffer.alloc(count * h.es); if (!count) return out;
  const fd = fs.openSync(file, 'r');
  try {
    const c0 = Math.floor(start / h.cr), c1 = Math.floor((start + count - 1) / h.cr);
    for (let c = c0; c <= c1; c++) {
      const ch = readChunk(fd, h, c), base = c * h.cr;
      const a = Math.max(start, base), b = Math.min(start + count, base + ch.length / h.es);
      out.set(ch.subarray((a - base) * h.es, (b - base) * h.es), (a - start) * h.es);
    }
  } finally { fs.closeSync(fd); }
  return out;
}
const readAllZ = (file) => readRangeZ(file, 0, head(file).n);
// отдельные строки (по возрастанию или вразнобой) — каждая порция распаковывается один раз
function readAtZ(file, ids) {
  const h = head(file), out = Buffer.alloc(ids.length * h.es); if (!ids.length) return out;
  const fd = fs.openSync(file, 'r'), cache = new Map();
  try {
    for (let q = 0; q < ids.length; q++) {
      const c = Math.floor(ids[q] / h.cr); let ch = cache.get(c);
      if (!ch) { ch = readChunk(fd, h, c); cache.set(c, ch); if (cache.size > 64) cache.delete(cache.keys().next().value); }
      const o = (ids[q] - c * h.cr) * h.es; out.set(ch.subarray(o, o + h.es), q * h.es);
    }
  } finally { fs.closeSync(fd); }
  return out;
}
// последовательное чтение по одному значению (как ColumnReader) — порция за порцией
class ZReader {
  constructor(file) { this.h = head(file); this.fd = fs.openSync(file, 'r'); this.c = -1; this.ch = null; }
  bytesAt(i) { const c = Math.floor(i / this.h.cr); if (c !== this.c) { this.ch = readChunk(this.fd, this.h, c); this.c = c; } return [this.ch, (i - c * this.h.cr) * this.h.es]; }
  close() { if (this.fd != null) fs.closeSync(this.fd); this.fd = null; }
}
function writeAllZ(file, bytes, es) { const w = new ZWriter(file, es); w.pushAll(bytes); w.close(); }

module.exports = { ZWriter, ZReader, readRangeZ, readAllZ, readAtZ, writeAllZ, readChunk, head, CR };
