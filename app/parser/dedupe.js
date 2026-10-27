'use strict';
// Повторы одной и той же раздачи из разных выгрузок. У GG одна раздача может прийти дважды с разными номерами
// (#246310634758 и #206310634758 — разные конвертеры) и по-разному записанным названием турнира, поэтому ключ
// «номер раздачи + турнир» их не ловит. Ключ содержания: номер турнира, время, ваше место и карты, борд, места и стеки,
// все действия — у двух разных раздач он совпасть не может, у двух копий одной — совпадает всегда.
// Ключи раздач базы хранятся в ckeys.bin (Float64); копия загружается (как в Hand2Note), но отмечается в колонке dup.
const fs = require('fs');
const path = require('path');
const { hash53 } = require('./store.js');

const tourOf = (t) => { const m = /#(\d+)/.exec(t || ''); return m ? m[1] : (t || ''); };
function ckOf(rec) {
  if (!rec || !rec.pl || !rec.ev) return 0;
  return hash53(tourOf(rec.t) + '|' + (rec.d || '') + '|' + (rec.h == null ? 'u' : rec.h) + '|' + (rec.hc || '') + '|' + (rec.bd || []).join('') + '|' + JSON.stringify(rec.pl.map(p => [p[0], p[1], p[3]])) + '|' + JSON.stringify(rec.ev));
}
const ckFile = (dir) => path.join(dir, 'ckeys.bin');
function readKeys(dir) {
  const f = ckFile(dir); if (!fs.existsSync(f)) return new Float64Array(0);
  const b = fs.readFileSync(f); return new Float64Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}
function writeKeys(dir, arr) { const f = ckFile(dir), t = f + '.tmp'; fs.writeFileSync(t, Buffer.from(Float64Array.from(arr).buffer)); fs.renameSync(t, f); }

// Обновление старой базы: найти копии раздач и отметить их строки (ваши и соперников этой раздачи) в колонке dup.
// Строки не удаляются: число раздач остаётся как в Hand2Note, а фильтр «без повторов» убирает копии из подсчётов.
// Пока фоновый EV не досчитан, обновление откладывается до следующего запуска.
function migDupFlag(dir, meta, post) {
  if (fs.existsSync(path.join(dir, 'ev-pending.bin'))) return 'defer';
  const T = require('./table.js'), { decodeRec, HashSet53 } = require('./store.js'), { BlockReader } = require('./blockreader.js');
  const g = path.join(dir, meta.colDir), og = path.join(g, 'opp'), nH = meta.count || 0, nO = meta.opp ? meta.opp.rows || 0 : 0;
  const z = meta.rpz === 2 ? 2 : !!meta.rpz;
  const rpp = T.readCol(g, 'rpp', 'i32'), rpo = T.readCol(g, 'rpo', 'u32'), rpl = T.readCol(g, 'rpl', 'u32'), key = T.readCol(g, 'key', 'f64');
  const seen = new HashSet53(nH), kept = [], dupH = new Int8Array(nH), copyKeys = new HashSet53(1024);
  const br = new BlockReader(dir); let nCopy = 0, done = 0;
  for (let i = 0; i < nH; i++) {
    if (rpp[i] < 0) continue;
    let ck = 0; try { ck = ckOf(decodeRec(br.get(rpp[i], rpo[i], rpl[i]), z, dir)); } catch (e) { ck = 0; }
    if (ck) { if (seen.has(ck)) { dupH[i] = 1; copyKeys.add(key[i]); nCopy++; } else { seen.add(ck); kept.push(ck); } }
    if (post && ++done % 20000 === 0) post({ done, total: nH, id: 'dedup' });
  }
  br.close();
  T.writeCol(g, 'dup', dupH);
  if (nO) {
    const keepKeys = new HashSet53(nH); for (let i = 0; i < nH; i++) if (!dupH[i]) keepKeys.add(key[i]);
    const ok = T.readCol(og, 'key', 'f64'), dupO = new Int8Array(nO);
    if (nCopy) for (let i = 0; i < nO; i++) if (copyKeys.has(ok[i]) && !keepKeys.has(ok[i])) dupO[i] = 1;
    T.writeCol(og, 'dup', dupO);
  }
  const mf = path.join(dir, 'meta.json'), m2 = JSON.parse(fs.readFileSync(mf, 'utf8'));
  if (!m2.cols.some(c => c[0] === 'dup')) m2.cols.push(['dup', 'i8']);
  m2.copies = nCopy;
  fs.writeFileSync(mf + '.tmp', JSON.stringify(m2)); fs.renameSync(mf + '.tmp', mf);
  writeKeys(dir, kept);
  if (post) post({ done: nH, total: nH, id: 'dedup' });
  return { copies: nCopy };
}

module.exports = { ckOf, readKeys, writeKeys, migDupFlag };
