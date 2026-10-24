'use strict';
// Чтение историй раздач прямо из zip-архивов, без распаковки на диск.
// Файл внутри архива обозначается строкой «zip::<путь к архиву>::<имя внутри>».
const fs = require('fs');
const zlib = require('zlib');

const PREFIX = 'zip::';
const HH_EXT = /\.(txt|xml|log|hh)$/i;
const cache = new Map(); // путь к архиву -> { fd, entries: Map(имя -> запись) }

function open(zipPath) {
  let z = cache.get(zipPath);
  if (z) return z;
  const fd = fs.openSync(zipPath, 'r');
  const size = fs.fstatSync(fd).size;
  // конец центрального каталога (EOCD) — в последних 64 КБ архива
  const tailLen = Math.min(size, 65557), tail = Buffer.alloc(tailLen);
  fs.readSync(fd, tail, 0, tailLen, size - tailLen);
  let e = -1;
  for (let i = tailLen - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) { fs.closeSync(fd); throw new Error('не zip-архив'); }
  let count = tail.readUInt16LE(e + 10), cdSize = tail.readUInt32LE(e + 12), cdOff = tail.readUInt32LE(e + 16);
  // ZIP64 (архивы больше 4 ГБ или больше 65 535 файлов)
  if (e >= 20 && tail.readUInt32LE(e - 20) === 0x07064b50) {
    const loc = Number(tail.readBigUInt64LE(e - 20 + 8)), b = Buffer.alloc(56);
    fs.readSync(fd, b, 0, 56, loc);
    if (b.readUInt32LE(0) === 0x06064b50) { count = Number(b.readBigUInt64LE(32)); cdSize = Number(b.readBigUInt64LE(40)); cdOff = Number(b.readBigUInt64LE(48)); }
  }
  const cd = Buffer.alloc(cdSize); fs.readSync(fd, cd, 0, cdSize, cdOff);
  const entries = new Map();
  for (let p = 0, k = 0; k < count && p + 46 <= cd.length; k++) {
    if (cd.readUInt32LE(p) !== 0x02014b50) break;
    const method = cd.readUInt16LE(p + 10);
    let comp = cd.readUInt32LE(p + 20), unc = cd.readUInt32LE(p + 24), off = cd.readUInt32LE(p + 42);
    const nl = cd.readUInt16LE(p + 28), xl = cd.readUInt16LE(p + 30), cl = cd.readUInt16LE(p + 32);
    const name = cd.toString('utf8', p + 46, p + 46 + nl);
    // поля ZIP64 в extra
    let x = p + 46 + nl; const xe = x + xl;
    while (x + 4 <= xe) {
      const id = cd.readUInt16LE(x), len = cd.readUInt16LE(x + 2); let q = x + 4;
      if (id === 0x0001) {
        if (unc === 0xffffffff) { unc = Number(cd.readBigUInt64LE(q)); q += 8; }
        if (comp === 0xffffffff) { comp = Number(cd.readBigUInt64LE(q)); q += 8; }
        if (off === 0xffffffff) { off = Number(cd.readBigUInt64LE(q)); q += 8; }
      }
      x += 4 + len;
    }
    if (!name.endsWith('/')) entries.set(name, { method, comp, unc, off });
    p += 46 + nl + xl + cl;
  }
  z = { fd, entries };
  cache.set(zipPath, z);
  return z;
}

// список историй раздач в архиве в виде «виртуальных» путей
function listZip(zipPath, out, limit) {
  let z; try { z = open(zipPath); } catch (e) { return; }
  for (const [name] of z.entries) { if (out.length >= limit) return; if (HH_EXT.test(name) && !name.split('/').pop().startsWith('._')) out.push(PREFIX + zipPath + '::' + name); }
}

const isZipPath = (f) => f.startsWith(PREFIX);
function splitPath(f) { const s = f.slice(PREFIX.length), i = s.indexOf('::'); return [s.slice(0, i), s.slice(i + 2)]; }

function entryOf(f) { const [zp, name] = splitPath(f); const z = open(zp); const en = z.entries.get(name); if (!en) throw new Error('нет файла в архиве'); return { z, en }; }
function zipSize(f) { return entryOf(f).en.unc; }
function zipRead(f) {
  const { z, en } = entryOf(f);
  const h = Buffer.alloc(30); fs.readSync(z.fd, h, 0, 30, en.off);
  const start = en.off + 30 + h.readUInt16LE(26) + h.readUInt16LE(28);
  const data = Buffer.alloc(en.comp); fs.readSync(z.fd, data, 0, en.comp, start);
  if (en.method === 0) return data;
  if (en.method === 8) return zlib.inflateRawSync(data);
  throw new Error('сжатие этого архива не поддерживается');
}
// большая запись архива — потоком (без чтения целиком в память): распаковка кусками
function zipStream(f) {
  const { z, en } = entryOf(f);
  const [zp] = splitPath(f);
  const h = Buffer.alloc(30); fs.readSync(z.fd, h, 0, 30, en.off);
  const start = en.off + 30 + h.readUInt16LE(26) + h.readUInt16LE(28);
  const raw = fs.createReadStream(zp, { start, end: start + en.comp - 1, highWaterMark: 4 * 1024 * 1024 });
  if (en.method === 0) return raw;
  if (en.method === 8) return raw.pipe(zlib.createInflateRaw({ chunkSize: 4 * 1024 * 1024 }));
  throw new Error('сжатие этого архива не поддерживается');
}
function closeAll() { for (const z of cache.values()) { try { fs.closeSync(z.fd); } catch (e) { /* уже закрыт */ } } cache.clear(); }

module.exports = { listZip, isZipPath, zipSize, zipRead, zipStream, closeAll };
