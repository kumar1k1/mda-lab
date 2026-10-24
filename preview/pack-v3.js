'use strict';
// Упаковка базы v3 (ваши раздачи + соперники) для онлайн-превью.
// Хостинг артефактов отдаёт только текстовые типы и не больше ~15 МБ на файл, поэтому:
//   c_<имя>.bin.b64.json — колонки ваших раздач (base64);
//   rp.idx.b64.json      — индекс реплеера ваших раздач (part, offset, length по 12 байт);
//   rpz_<n>.b64.json     — сжатые записи реплеера, перепакованные частями по ~6 МБ;
//   opp_<k>.b64.json     — строки соперников кусками по ~50 тыс. (игрок целиком в одном куске);
//   players.json         — игроки: ник, рум, число раздач, в каком куске и с какой строки.
const fs = require('fs');
const path = require('path');
const { typedFrom, bufOf, TYPES } = require('../app/parser/store.js');
const { OPP_SCHEMA } = require('../app/parser/ingest.js');

function pack(baseDir, out) {
  const meta = JSON.parse(fs.readFileSync(path.join(baseDir, 'meta.json'), 'utf8'));
  const g = path.join(baseDir, meta.colDir), og = path.join(g, 'opp');
  fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  const b64 = (f, buf) => fs.writeFileSync(path.join(out, f + '.b64.json'), JSON.stringify(Buffer.from(buf).toString('base64')));
  const col = (dir, n, t) => typedFrom(fs.readFileSync(path.join(dir, 'c_' + n + '.bin')), t);
  // записи реплеера: перепаковка в части по ~6 МБ (только те, на которые есть ссылки)
  const PART = 6 * 1024 * 1024, map = new Map(); let part = 0, buf = [], len = 0;
  const srcFd = {};
  const flush = () => { if (len) { b64('rpz_' + part, Buffer.concat(buf, len)); part++; buf = []; len = 0; } };
  const remap = (p, o, l) => {
    if (p < 0) return [-1, 0, 0];
    const k = p + ':' + o; let r = map.get(k); if (r) return r;
    if (len + l > PART) flush();
    const fd = srcFd[p] || (srcFd[p] = fs.openSync(path.join(baseDir, 'rp_' + p + '.dat'), 'r'));
    const b = Buffer.alloc(l); fs.readSync(fd, b, 0, l, o);
    r = [part, len, l]; buf.push(b); len += l; map.set(k, r); return r;
  };
  // ваши раздачи
  for (const [n, t] of meta.cols) fs.writeFileSync(path.join(out, 'c_' + n + '.bin.b64.json'), JSON.stringify(fs.readFileSync(path.join(g, 'c_' + n + '.bin')).toString('base64')));
  const hp = col(g, 'rpp', 'i32'), ho = col(g, 'rpo', 'u32'), hl = col(g, 'rpl', 'u32'), idx = Buffer.alloc(hp.length * 12);
  for (let i = 0; i < hp.length; i++) { const [p, o, l] = remap(hp[i], ho[i], hl[i]); idx.writeInt32LE(p, i * 12); idx.writeUInt32LE(o, i * 12 + 4); idx.writeUInt32LE(l, i * 12 + 8); }
  b64('rp.idx', idx);
  // соперники: куски по ~50 тыс. строк, игрок целиком в одном куске
  const players = JSON.parse(fs.readFileSync(path.join(og, 'players.json'), 'utf8'));
  const C = {}; for (const [n, t] of OPP_SCHEMA) if (n !== 'key' && n !== 'pid') C[n] = col(og, n, t);
  const op = C.rpp, oo = C.rpo, ol = C.rpl;
  for (let i = 0; i < op.length; i++) { const [p, o, l] = remap(op[i], oo[i], ol[i]); op[i] = p; oo[i] = o; ol[i] = l; }
  flush();
  const ROWS = 50000, pl = [];
  let chunk = 0, cStart = 0, cEnd = 0;
  const writeChunk = () => {
    if (cEnd <= cStart) return;
    const cols = {}; for (const [n, t] of OPP_SCHEMA) if (C[n]) cols[n] = Buffer.from(bufOf(C[n].subarray(cStart, cEnd))).toString('base64');
    fs.writeFileSync(path.join(out, 'opp_' + chunk + '.b64.json'), JSON.stringify({ start: cStart, count: cEnd - cStart, cols }));
    chunk++; cStart = cEnd;
  };
  players.forEach((p, pid) => {
    if (p.c && cEnd - cStart + p.c > ROWS && cEnd > cStart) writeChunk();
    pl.push([p.n, p.r, p.c, p.sh || 0, chunk, p.s - cStart]); cEnd = p.s + p.c;
  });
  writeChunk();
  fs.writeFileSync(path.join(out, 'players.json'), JSON.stringify(pl));
  for (const fd of Object.values(srcFd)) fs.closeSync(fd);
  const m2 = Object.assign({}, meta, { rpParts: part, oppChunks: chunk, oppCols: OPP_SCHEMA.filter(([n]) => C[n]) });
  delete m2.colDir;
  fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify(m2));
  return { files: fs.readdirSync(out).length, rpParts: part, oppChunks: chunk };
}

module.exports = { pack };
if (require.main === module) console.log(pack(process.argv[2], process.argv[3]));
