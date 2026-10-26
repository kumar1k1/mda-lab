'use strict';
// Таблица на диске — папка колонок c_<имя>.bin, строки упорядочены по ключу.
// Для больших объёмов: колонки растут прямо на диске (SpillColumn), читаются кусками (ColumnReader),
// а новая порция строк вливается в старую таблицу потоком (mergePlan + mergeColumn) —
// в памяти не держится ни вся таблица, ни её копия. Так одинаково работают и полная загрузка
// (слияние с пустой таблицей), и дозагрузка новых архивов.
const fs = require('fs');
const path = require('path');
const { TYPES, typedFrom, bufOf } = require('./store.js');

const Z = require('./colfile.js');
const CH = 1 << 16;
// файл колонки: сжатый c_<имя>.z (с 0.7), иначе прежний c_<имя>.bin; zFile — куда писать сжатую
const zFile = (dir, name) => path.join(dir, 'c_' + name + '.z');
const colFile = (dir, name) => { const z = zFile(dir, name); return fs.existsSync(z) ? z : path.join(dir, 'c_' + name + '.bin'); };
const isZ = (f) => f.endsWith('.z');
const BPE = (type) => TYPES[type].A.BYTES_PER_ELEMENT;

// Колонка, растущая на диске: в памяти только текущий кусок
class SpillColumn {
  constructor(file, name, type) {
    this.file = file; this.name = name; this.type = type; this.T = TYPES[type];
    this.fd = fs.openSync(file, 'w'); this.cur = new this.T.A(CH); this.pos = 0; this.length = 0;
  }
  push(v) {
    if (v == null || Number.isNaN(v)) v = this.type === 'f64' ? 0 : -1;
    if (v < this.T.min || v > this.T.max) throw new Error('колонка ' + this.name + ': значение ' + v + ' вне диапазона ' + this.type);
    this.cur[this.pos++] = v; this.length++;
    if (this.pos === CH) this.flush();
  }
  flush() { if (this.pos) { fs.writeSync(this.fd, bufOf(this.cur.subarray(0, this.pos))); this.pos = 0; } }
  close() { this.flush(); if (this.fd != null) fs.closeSync(this.fd); this.fd = null; }
  readAll() { this.close(); return this.length ? typedFrom(fs.readFileSync(this.file), this.type) : new this.T.A(0); }
}

// Последовательное чтение колонки кусками по ~1 млн значений
class ColumnReader {
  constructor(file, type, n) {
    this.type = type; this.T = TYPES[type]; this.n = n; this.fd = n ? fs.openSync(file, 'r') : null;
    this.bpe = this.T.A.BYTES_PER_ELEMENT; this.size = 1 << 20; this.base = 0; this.len = 0; this.a = null;
    this.zh = n && isZ(file) ? Z.head(file) : null; // сжатая колонка — читается порциями
  }
  get(i) {
    if (i < this.base || i >= this.base + this.len) {
      if (this.zh) {
        const c = Math.floor(i / this.zh.cr), b = Z.readChunk(this.fd, this.zh, c);
        this.a = typedFrom(b, this.type); this.base = c * this.zh.cr; this.len = this.a.length;
        return this.a[i - this.base];
      }
      const len = Math.min(this.size, this.n - i), b = Buffer.alloc(len * this.bpe);
      fs.readSync(this.fd, b, 0, b.length, i * this.bpe);
      this.a = typedFrom(b, this.type); this.base = i; this.len = len;
    }
    return this.a[i - this.base];
  }
  close() { if (this.fd != null) fs.closeSync(this.fd); this.fd = null; }
}

// Запись колонки кусками
// (в файл .z — сжатая колонка: значения уходят порциями в colfile.ZWriter; старый .bin с тем же именем убирается)
class ColumnWriter {
  constructor(file, type) {
    this.T = TYPES[type]; this.cur = new this.T.A(CH); this.pos = 0; this.file = file;
    if (isZ(file)) this.zw = new Z.ZWriter(file, this.T.A.BYTES_PER_ELEMENT); else this.fd = fs.openSync(file, 'w');
  }
  _out(a) { if (this.zw) this.zw.pushAll(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)); else fs.writeSync(this.fd, bufOf(a)); }
  push(v) { this.cur[this.pos++] = v; if (this.pos === CH) { this._out(this.cur); this.pos = 0; } }
  close() {
    if (this.pos) this._out(this.cur.subarray(0, this.pos));
    if (this.zw) { this.zw.close(); fs.rmSync(this.file.slice(0, -2) + '.bin', { force: true }); } else fs.closeSync(this.fd);
  }
}

// План слияния двух упорядоченных наборов: plan[k] = 0 — строка из старой таблицы, 1 — из новой.
// oldFirst(i, j) — true, если старая строка i идёт не позже новой j (при равных ключах старая раньше).
function mergePlan(nOld, nNew, oldFirst) {
  const plan = new Uint8Array(nOld + nNew);
  let i = 0, j = 0;
  for (let k = 0; k < plan.length; k++) {
    if (i < nOld && (j >= nNew || oldFirst(i, j))) { i++; } else { plan[k] = 1; j++; }
  }
  return plan;
}

// Слияние одной колонки: старая читается кусками с диска, новая (уже упорядоченная) — массив в памяти.
// fixOld / fixNew — поправка значения (например, сдвиг дней при смене начала периода).
function mergeColumn(oldDir, nOld, name, type, newArr, plan, outDir, fixOld, fixNew, dflt) {
  // колонки, которой нет в старой базе (добавлена позже, например aid, nk), — старые строки получают dflt (по умолчанию 0)
  const d0 = dflt || 0;
  const r = nOld ? (fs.existsSync(colFile(oldDir, name)) ? new ColumnReader(colFile(oldDir, name), type, nOld) : { get: () => d0, close() {} }) : null;
  const w = new ColumnWriter(zFile(outDir, name), type); // база — сжатыми колонками
  let i = 0, j = 0;
  for (let k = 0; k < plan.length; k++) {
    if (plan[k]) { const v = newArr[j++]; w.push(fixNew ? fixNew(v) : v); }
    else { const v = r.get(i++); w.push(fixOld ? fixOld(v) : v); }
  }
  w.close(); if (r) r.close();
}

// Перестановка массива по perm (perm[k] — откуда брать k-е значение)
function permute(a, perm) { const out = new a.constructor(perm.length); for (let k = 0; k < perm.length; k++) out[k] = a[perm[k]]; return out; }

// Точечная запись значений в файл колонки (например, EV для новых строк после слияния)
function patchColumn(dir, name, type, positions, values) {
  if (isZ(colFile(dir, name))) { // сжатая: распаковать, поправить, записать заново
    const a = readCol(dir, name, type); for (let q = 0; q < positions.length; q++) a[positions[q]] = values[q];
    writeCol(dir, name, a); return;
  }
  const bpe = TYPES[type].A.BYTES_PER_ELEMENT, fd = fs.openSync(colFile(dir, name), 'r+'), one = new TYPES[type].A(1);
  try { for (let q = 0; q < positions.length; q++) { one[0] = values[q]; fs.writeSync(fd, bufOf(one), 0, bpe, positions[q] * bpe); } } finally { fs.closeSync(fd); }
}

// Чтение диапазона строк [start, start+count) колонки — байты (для загрузки одного игрока)
function readRange(dir, name, type, start, count) {
  const f = colFile(dir, name); if (isZ(f)) return Z.readRangeZ(f, start, count);
  const bpe = TYPES[type].A.BYTES_PER_ELEMENT, b = Buffer.alloc(count * bpe);
  if (!count) return b;
  const fd = fs.openSync(colFile(dir, name), 'r'); try { fs.readSync(fd, b, 0, b.length, start * bpe); } finally { fs.closeSync(fd); }
  return b;
}
// Значения колонки по отдельным номерам строк
function readAt(dir, name, type, ids) {
  const f = colFile(dir, name); if (isZ(f)) return typedFrom(Z.readAtZ(f, Array.from(ids)), type);
  const T = TYPES[type], bpe = T.A.BYTES_PER_ELEMENT, out = new T.A(ids.length), b = Buffer.alloc(bpe);
  const fd = fs.openSync(colFile(dir, name), 'r');
  try { for (let q = 0; q < ids.length; q++) { fs.readSync(fd, b, 0, bpe, ids[q] * bpe); out[q] = typedFrom(b, type)[0]; } } finally { fs.closeSync(fd); }
  return out;
}

// вся колонка: байты (Buffer) / типизированный массив; null — колонки нет
function readColBytes(dir, name) { const f = colFile(dir, name); if (!fs.existsSync(f)) return null; return isZ(f) ? Z.readAllZ(f) : fs.readFileSync(f); }
function readCol(dir, name, type) { const b = readColBytes(dir, name); return b ? typedFrom(b, type) : null; }
// записать всю колонку сжатой (старый .bin убирается)
function writeCol(dir, name, a) { Z.writeAllZ(zFile(dir, name), new Uint8Array(a.buffer, a.byteOffset, a.byteLength), a.BYTES_PER_ELEMENT); fs.rmSync(path.join(dir, 'c_' + name + '.bin'), { force: true }); }
const hasCol = (dir, name) => fs.existsSync(colFile(dir, name));

module.exports = { SpillColumn, ColumnReader, ColumnWriter, mergePlan, mergeColumn, permute, patchColumn, readRange, readAt, colFile, zFile, readColBytes, readCol, writeCol, hasCol, BPE };
