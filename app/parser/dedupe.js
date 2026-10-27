'use strict';
// Повторы одной и той же раздачи из разных выгрузок. У GG одна раздача может прийти дважды с разными номерами
// (#246310634758 и #206310634758 — разные конвертеры) и по-разному записанным названием турнира, поэтому ключ
// «номер раздачи + турнир» их не ловит. Ключ содержания: номер турнира, время, ваше место и карты, борд, места и стеки,
// все действия — у двух разных раздач он совпасть не может, у двух копий одной — совпадает всегда.
// Ключи всех раздач базы хранятся в ckeys.bin (Float64), загрузка пропускает раздачу с уже известным ключом.
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

// Обновление старой базы: найти копии раздач, убрать их строки (ваши и соперников этой раздачи), записать ckeys.bin.
// Пока фоновый EV не досчитан, номера строк трогать нельзя — тогда обновление откладывается до следующего запуска.
function migDedup(dir, meta, post) {
  if (fs.existsSync(path.join(dir, 'ev-pending.bin'))) return 'defer';
  const T = require('./table.js'), { decodeRec, HashSet53 } = require('./store.js'), { BlockReader } = require('./blockreader.js');
  const { HERO_SCHEMA, OPP_SCHEMA } = require('./ingest.js');
  const g = path.join(dir, meta.colDir), og = path.join(g, 'opp'), nH = meta.count || 0, nO = meta.opp ? meta.opp.rows || 0 : 0;
  const z = meta.rpz === 2 ? 2 : !!meta.rpz;
  const rpp = T.readCol(g, 'rpp', 'i32'), rpo = T.readCol(g, 'rpo', 'u32'), rpl = T.readCol(g, 'rpl', 'u32'), key = T.readCol(g, 'key', 'f64');
  const seen = new HashSet53(nH), kept = [], dropH = new Uint8Array(nH), dropKeys = new HashSet53(1024);
  const br = new BlockReader(dir); let nDrop = 0;
  // ваши раздачи по порядку файлов реплеера (быстрее читать), повтор — вторая и следующие копии по порядку строк
  const ord = Array.from({ length: nH }, (_, i) => i).filter(i => rpp[i] >= 0).sort((a, b) => a - b);
  let done = 0;
  for (const i of ord) {
    let ck = 0; try { ck = ckOf(decodeRec(br.get(rpp[i], rpo[i], rpl[i]), z, dir)); } catch (e) { ck = 0; }
    if (ck) { if (seen.has(ck)) { dropH[i] = 1; dropKeys.add(key[i]); nDrop++; } else { seen.add(ck); kept.push(ck); } }
    if (post && ++done % 20000 === 0) post({ done, total: ord.length, id: 'dedup' });
  }
  br.close();
  // ключи раздач, у которых остались ваши строки, — их строки соперников не трогаем
  const keepKeys = new HashSet53(nH); for (let i = 0; i < nH; i++) if (!dropH[i]) keepKeys.add(key[i]);
  let dropO = null, nDropO = 0;
  if (nO && nDrop) {
    const ok = T.readCol(og, 'key', 'f64'); dropO = new Uint8Array(nO);
    for (let i = 0; i < nO; i++) if (dropKeys.has(ok[i]) && !keepKeys.has(ok[i])) { dropO[i] = 1; nDropO++; }
  }
  if (nDrop) {
    // переписывание колонок — тоже с прогрессом (на большой базе это самая долгая часть)
    const nCols = HERO_SCHEMA.length + (dropO ? OPP_SCHEMA.length : 0); let cDone = 0;
    const filt = (d, schema, drop, n) => {
      for (const [nm, t] of schema) {
        if (post) post({ done: ++cDone, total: nCols, id: 'dedupw' });
        if (!T.hasCol(d, nm)) continue;
        const a = T.readCol(d, nm, t); if (!a) continue;
        const out = new a.constructor(n - drop.reduce((s, x) => s + x, 0)); let j = 0;
        for (let i = 0; i < a.length && i < n; i++) if (!drop[i]) out[j++] = a[i];
        T.writeCol(d, nm, out);
      }
    };
    filt(g, HERO_SCHEMA, dropH, nH);
    if (dropO) filt(og, OPP_SCHEMA, dropO, nO);
    // игроки: число строк и начало блока (строки соперников идут блоками по игрокам, в порядке номеров)
    const pf = path.join(og, 'players.json');
    if (dropO && fs.existsSync(pf)) {
      const pl = JSON.parse(fs.readFileSync(pf, 'utf8')), pid = T.readCol(og, 'pid', 'i32'), cnt = new Float64Array(pl.length);
      for (let i = 0; i < pid.length; i++) if (pid[i] >= 0 && pid[i] < pl.length) cnt[pid[i]]++;
      let s = 0; pl.forEach((p, k) => { p.s = s; p.c = cnt[k]; s += cnt[k]; });
      fs.writeFileSync(pf + '.tmp', JSON.stringify(pl)); fs.renameSync(pf + '.tmp', pf);
    }
    const mf = path.join(dir, 'meta.json'), m2 = JSON.parse(fs.readFileSync(mf, 'utf8'));
    m2.count = nH - nDrop; if (m2.opp) m2.opp.rows = nO - nDropO;
    // алиасы: число раздач — по колонке алиаса
    const aid = T.hasCol(g, 'aid') ? T.readCol(g, 'aid', 'i16') : null;
    if (aid && m2.aliases) { const c = new Float64Array(m2.aliases.length); for (let i = 0; i < aid.length; i++) if (aid[i] >= 0 && aid[i] < c.length) c[aid[i]]++; m2.aliases.forEach((a, k) => { a.count = c[k]; }); }
    m2.dups = (m2.dups || 0) + nDrop;
    m2.cols = m2.cols.filter(c => c[0] !== 'dup'); // отметка копий (0.7.9) больше не нужна
    fs.writeFileSync(mf + '.tmp', JSON.stringify(m2)); fs.renameSync(mf + '.tmp', mf);
  }
  for (const d of [g, og]) for (const f of ['c_dup.z', 'c_dup.bin']) fs.rmSync(path.join(d, f), { force: true });
  writeKeys(dir, kept);
  if (post) post({ done: ord.length, total: ord.length, id: 'dedup' });
  return { removed: nDrop, removedOpp: nDropO };
}

module.exports = { ckOf, readKeys, writeKeys, migDedup };
