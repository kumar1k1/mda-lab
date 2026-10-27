'use strict';
// Название программы в свойствах файла «MDA Lab.exe» (его показывают Windows: брандмауэр, диспетчер задач, свойства файла).
// В файле от Electron там «Electron» и «GitHub, Inc.». Строки ресурса VS_VERSIONINFO переписываются на месте:
// новое значение короче старого и дополняется нулями — размеры и смещения в файле не меняются.
// Использование: node tools/brand-exe.js <путь к exe>
const fs = require('fs');

const WANT = { CompanyName: 'MDA Lab', FileDescription: 'MDA Lab', ProductName: 'MDA Lab', InternalName: 'MDA Lab', OriginalFilename: 'MDA Lab.exe', LegalCopyright: 'MDA Lab' };

function brand(file) {
  const b = fs.readFileSync(file);
  const key = Buffer.from('VS_VERSION_INFO', 'utf16le');
  let at = b.indexOf(key), done = {};
  while (at >= 0) {
    const root = at - 6; // wLength, wValueLength, wType, затем szKey
    const len = b.readUInt16LE(root);
    if (len > 100 && len < 65535) { walk(b, root, root + len, done); if (Object.keys(done).length) break; }
    at = b.indexOf(key, at + 2);
  }
  const miss = Object.keys(WANT).filter(k => !done[k]);
  if (Object.keys(done).length === 0) throw new Error('в файле не найдены строки версии');
  fs.writeFileSync(file, b);
  return { changed: done, missing: miss };
}
const align = (p, base) => base + ((p - base + 3) & ~3);
function szAt(b, p) { let e = p; while (e + 1 < b.length && (b[e] | b[e + 1])) e += 2; return [b.toString('utf16le', p, e), e + 2]; }
// обход блоков: { wLength, wValueLength, wType, szKey, выравнивание, Value, выравнивание, Children }
function walk(b, start, end, done) {
  let p = start;
  while (p + 6 <= end) {
    const len = b.readUInt16LE(p), vlen = b.readUInt16LE(p + 2), type = b.readUInt16LE(p + 4);
    if (len < 6 || p + len > end) return;
    const [k, after] = szAt(b, p + 6), vstart = align(after, start);
    if (type === 1 && WANT[k] != null && vlen > 0) {
      // строковое значение: vlen — в символах (с завершающим нулём)
      const val = WANT[k], max = vlen - 1;
      if (val.length <= max) { const buf = Buffer.alloc(vlen * 2); buf.write(val, 0, 'utf16le'); buf.copy(b, vstart); done[k] = val; }
    } else {
      const childStart = k === 'VS_VERSION_INFO' ? align(vstart + vlen, start) : align(vstart + (type === 1 ? vlen * 2 : vlen), start);
      if (childStart < p + len) walk(b, childStart, p + len, done);
    }
    p = align(p + len, start);
  }
}

if (require.main === module) {
  const f = process.argv[2]; if (!f) { console.error('usage: node tools/brand-exe.js <exe>'); process.exit(1); }
  const r = brand(f); console.log('свойства файла:', JSON.stringify(r.changed), r.missing.length ? 'не найдено: ' + r.missing.join(', ') : '');
}
module.exports = { brand };
