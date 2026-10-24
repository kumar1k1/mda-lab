'use strict';
// Сборка базы героя из файлов историй раздач. Общая для программы (импорт) и для tools/build-hero-db.js.
// База пишется потоково в папку колоночного формата (store.js) — выдерживает гигабайты историй.
const fs = require('fs');
const path = require('path');
const { parseText } = require('./parse.js');
const { listZip, isZipPath, zipSize, zipRead, zipStream, closeAll } = require('./zip.js');
const { computeEv } = require('./ev-pool.js');
const { SCHEMA, ColumnBuilder, ReplayWriter, writeBaseDir, writeColumn, packIndex, hash53, HashSet53 } = require('./store.js');

// признаки рума по началу файла
const ROOM_SIGNS = [
  { room: 'GGPoker', re: /^Poker Hand #(TM|HD|RC|SG|MT)/m },
  { room: 'PokerStars', re: /^PokerStars (Hand|Zoom Hand|Home Game Hand) #/m },
  { room: 'Winamax', re: /^Winamax Poker - /m },
  { room: 'iPoker', re: /<session sessioncode=|^GAME #\d+: /m },
  { room: '888poker', re: /^#Game No : \d+|888poker Hand History/m },
  { room: 'PartyPoker', re: /^\*{5} Hand History [Ff]or Game \d+/m },
  { room: 'ACR / WPN', re: /^Game Hand #\d+ - Tournament #/m },
  { room: 'iPoker (XML)', re: /<\?xml[\s\S]{0,200}<session/m }
];
// какие форматы разбирает парсер
const SUPPORTED = new Set(['PokerStars', 'Winamax', 'ACR / WPN']);

function walk(dir, out, limit) {
  let list;
  try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const d of list) {
    if (out.length >= limit) return;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, out, limit);
    else addFile(p, out, limit);
  }
}
// обычный файл истории или zip-архив (истории внутри читаются без распаковки)
function addFile(p, out, limit) {
  if (/\.zip$/i.test(p)) listZip(p, out, limit);
  else if (/\.(txt|xml|log|hh)$/i.test(p)) out.push(p);
}
const fileSize = (f) => (isZipPath(f) ? zipSize(f) : fs.statSync(f).size);

function readHead(f, n) {
  if (isZipPath(f)) { try { return zipRead(f).slice(0, n).toString('utf8').replace(/^\uFEFF/, ''); } catch (e) { return ''; } }
  try {
    const fd = fs.openSync(f, 'r'); const buf = Buffer.alloc(n); const k = fs.readSync(fd, buf, 0, n, 0); fs.closeSync(fd);
    return buf.slice(0, k).toString('utf8').replace(/^﻿/, '');
  } catch (e) { return ''; }
}

// Быстрый обзор: румы, объём, кандидаты в ники героя (кому чаще всего «раздали карты»).
function scan(files) {
  const rooms = {}; let bytes = 0, est = 0, unknown = 0;
  const nickCount = {}; // nick -> { room -> count }
  const noDealt = {}, seatCount = {}; // румы без карт героя: сколько файлов и кто в них сидел
  for (const f of files) {
    let size; try { size = fileSize(f); } catch (e) { continue; }
    bytes += size;
    const head = readHead(f, 4096);
    const sign = ROOM_SIGNS.find(s => s.re.test(head));
    if (!sign) { unknown++; continue; }
    const r = rooms[sign.room] || (rooms[sign.room] = { files: 0, bytes: 0, supported: SUPPORTED.has(sign.room) });
    r.files++; r.bytes += size; est += Math.round(size / 1500);
    if (!r.supported) continue;
    // первая раздача каждого файла: кому «раздали карты» — это и есть игрок, чья это история
    const m = /^Dealt to (.+?) \[/m.exec(head);
    let who = m ? m[1] : null;
    if (!who) { // рум не пишет карты героя (PokerDom): герой — тот, кто сидит за столом почти в каждом файле
      let room = sign.room; if (room === 'PokerStars' && /^Table 'PDOM_/m.test(head)) room = 'PokerDom';
      noDealt[room] = (noDealt[room] || 0) + 1;
      new Set([...head.matchAll(/^Seat \d+: (.+?) \(/gm)].map(x => x[1])).forEach(n => { const c = seatCount[room] || (seatCount[room] = {}); c[n] = (c[n] || 0) + 1; });
    }
    if (who) {
      let room = sign.room;
      if (room === 'PokerStars' && /^Table 'PDOM_/m.test(head)) room = 'PokerDom';
      const c = nickCount[who] || (nickCount[who] = {}); c[room] = (c[room] || 0) + 1;
    }
  }
  Object.keys(noDealt).forEach(room => {
    const c = seatCount[room] || {};
    Object.keys(c).filter(n => c[n] >= Math.max(3, noDealt[room] * 0.5)).forEach(n => { const d = nickCount[n] || (nickCount[n] = {}); d[room] = (d[room] || 0) + c[n]; });
  });
  // кандидаты: ники, которым раздавали карты заметно часто (в чужих раздачах карты не видны)
  const nicks = [];
  Object.keys(nickCount).forEach(n => {
    const by = nickCount[n]; const room = Object.keys(by).sort((a, b) => by[b] - by[a])[0];
    nicks.push({ nick: n, room: room === 'ACR / WPN' ? 'WPN' : room, hits: Object.values(by).reduce((a, b) => a + b, 0) });
  });
  const maxHits = Math.max(1, ...nicks.map(x => x.hits));
  const cand = nicks.filter(x => x.hits >= Math.max(2, maxHits * 0.01)).sort((a, b) => b.hits - a.hits).slice(0, 12);
  closeAll();
  return { files: files.length, bytes, rooms, unknown, estHands: est, nicks: cand };
}

// ---------- чтение больших файлов кусками ----------
// Файл истории (или файл внутри zip) может весить гигабайты, а строка в JS ограничена ~0,5 ГБ,
// поэтому большие файлы читаются потоком и режутся на куски по границе раздачи:
// каждый кусок начинается с заголовка раздачи и разбирается как обычный файл.
const BIG = 64 * 1024 * 1024, PIECE = 16 * 1024 * 1024;
const MARKS = ['\nPokerStars Hand #', '\nWinamax Poker - Tournament "', '\nGame Hand #'].map(m => Buffer.from(m));
function lastHandStart(buf) { let p = -1; for (const m of MARKS) p = Math.max(p, buf.lastIndexOf(m)); return p; }
async function streamPieces(stream, cb) {
  let carry = null;
  for await (const chunk of stream) {
    const buf = carry ? Buffer.concat([carry, chunk]) : chunk;
    if (buf.length < PIECE) { carry = buf; continue; }
    const cut = lastHandStart(buf);
    if (cut > 0) { cb(buf.toString('utf8', 0, cut)); carry = Buffer.from(buf.subarray(cut + 1)); } else carry = buf;
  }
  if (carry && carry.length) cb(carry.toString('utf8'));
}
async function eachText(f, cb) {
  if (isZipPath(f)) {
    if (zipSize(f) <= BIG) cb(zipRead(f).toString('utf8'));
    else await streamPieces(zipStream(f), cb);
    return;
  }
  if (fs.statSync(f).size <= BIG) cb(fs.readFileSync(f).toString('utf8'));
  else await streamPieces(fs.createReadStream(f, { highWaterMark: 4 * 1024 * 1024 }), cb);
}

// ---------- потоковая сборка базы ----------
// Раздачи сразу раскладываются по колонкам (без списка объектов в памяти), записи реплеера пишутся на диск.
// Итог тот же, что у прежней сборки: дубли (номер раздачи + турнир) отсеиваются, раздачи упорядочены по дате
// (при равной дате — в порядке файлов), EV считается после сортировки с тем же зерном, что и раньше.
// nicks: { ник: рум }, alias: имя Alias, outDir: папка новой базы. onProgress(done, total, hands).
async function buildBase(files, nicks, alias, outDir, onProgress, opts) {
  opts = opts || {};
  const heroes = new Set(Object.keys(nicks));
  const ROOMS = [...new Set(Object.values(nicks))];
  fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  const B = {}; for (const [name, type] of SCHEMA) B[name] = new ColumnBuilder(name, type);
  const dkey = new ColumnBuilder('date', 'i32'), khash = new ColumnBuilder('key', 'f64');
  const rpw = new ReplayWriter(outDir, opts.partSize);
  const seen = new HashSet53(); let errors = 0, dup = 0, n = 0;
  const add = (h) => {
    const hk = hash53(h.id + '|' + h.tour);
    if (!seen.add(hk)) { dup++; return; }
    h.room = nicks[h.hero];
    const y = +h.date.slice(0, 4), m = +h.date.slice(5, 7), d = +h.date.slice(8, 10);
    const rec = {
      room: ROOMS.indexOf(h.room), type: h.pko, month: y * 12 + m - 1, tbl: h.tblMax && h.tblMax <= 6 ? 6 : 9, pos: h.pos, bb: h.bb,
      sit: h.sit, lim: h.lim, act: h.act, size: h.size, fti: h.fti, bvb: h.bvb, fvr: h.fvr, day: Math.round(Date.UTC(y, m - 1, d) / 864e5),
      hc: h.hc, net: h.net, sto: h.sto, f3b: h.f3b, orsp: h.orsp, bmin: h.bmin, sbs: h.sbs, bbs: h.bbs, bh: h.bh, bsh: h.bsh, bmd: h.bmd,
      bdp: h.bdp, cov: h.cov, bi: h.bi, rz: h.rz, cl: h.cl, rai: h.rai, opos: h.opos, ostk: h.ostk, osz: h.osz, nev: h.net,
      hpa: h.hpa || 0, tmx: h.tblMax || 0, np: h.n || 0, lr: h.lr || 0
    };
    for (const [name] of SCHEMA) B[name].push(rec[name]);
    dkey.push(y * 10000 + m * 100 + d); khash.push(hk);
    if (h.rp && h.hc >= 0) { delete h.rp.bb; rpw.add(h.rp); } else rpw.add(null);
    n++;
  };
  for (let k = 0; k < files.length; k++) {
    try { await eachText(files[k], (text) => { const r = parseText(text, heroes); errors += r.errors; for (const h of r.hands) add(h); }); } catch (e) { /* файл не прочитан — пропускаем */ }
    if (onProgress && (k % 25 === 0 || k === files.length - 1)) onProgress(k + 1, files.length, n, 'parse');
  }
  closeAll(); rpw.close(); seen.clear();
  if (!n) { fs.rmSync(outDir, { recursive: true, force: true }); return { hands: 0, dup, errors, rooms: ROOMS }; }

  // порядок по дате; при равной дате — как в файлах (как устойчивая сортировка прежней сборки)
  let dk = dkey.toArray(); const perm = new Uint32Array(n); for (let i = 0; i < n; i++) perm[i] = i;
  perm.sort((a, b) => dk[a] - dk[b] || a - b);
  dk = null;
  // колонки упорядочиваются по одной и сразу пишутся на диск, растущая колонка освобождается —
  // так в памяти не держатся две копии базы одновременно
  const m0 = B.month.get(perm[0]), sy = Math.floor(m0 / 12), sm = m0 % 12 + 1, day0 = Math.round(Date.UTC(sy, sm - 1, 1) / 864e5);
  let net = null;
  for (const [name] of SCHEMA) {
    if (name === 'nev') continue;
    const a = B[name].toArray(perm); B[name] = null;
    if (name === 'month') for (let k = 0; k < n; k++) a[k] -= m0;
    if (name === 'day') for (let k = 0; k < n; k++) a[k] -= day0;
    writeColumn(outDir, name, a);
    if (name === 'net') net = a;
  }
  // EV-итог (all-in adjusted): по эквити на момент олл-ина; зерно — номер раздачи после сортировки, как раньше.
  // Считается параллельно по ядрам процессора — итог тот же, что при расчёте по одному.
  const nev = Float64Array.from(net), rpPart = rpw.idxPart, rpOff = rpw.idxOff, rpLen = rpw.idxLen;
  let m = 0; for (let k = 0; k < n; k++) if (rpPart.get(perm[k]) >= 0) m++;
  const jobs = new Float64Array(m * 5);
  for (let k = 0, j = 0; k < n; k++) { const o = perm[k], p = rpPart.get(o); if (p < 0) continue; jobs.set([k, p, rpOff.get(o), rpLen.get(o), k + 1], j * 5); j++; }
  const ev = await computeEv(outDir, jobs, { threads: opts.threads, onTick: (d, t) => { if (onProgress) onProgress(d, t, n, 'ev'); } });
  for (let j = 0; j < m; j++) { const e = ev[j]; if (!Number.isNaN(e)) { const k = jobs[j * 5]; nev[k] = Math.round((net[k] / 10 + e) * 1000) / 100; } }
  writeColumn(outDir, 'nev', nev);
  const idx = packIndex(rpw.idxPart.toArray(perm), rpw.idxOff.toArray(perm), rpw.idxLen.toArray(perm));
  const periodStart = sy + '-' + String(sm).padStart(2, '0');
  const meta = { demo: false, hero: alias || Object.keys(nicks)[0], nicks, rooms: ROOMS, types: ['Обычный', 'PKO'], periodStart, count: n };
  writeBaseDir(outDir, meta, {}, khash.toArray(perm), idx, SCHEMA); // колонки уже на диске
  return { hands: n, dup, errors, rooms: ROOMS };
}

// ---------- оценка до загрузки ----------
// Прогоняет образец историй (по умолчанию ~16 МБ, равномерно по списку файлов) тем же разбором и расчётом EV,
// что и загрузка, и пересчитывает на весь объём: сколько раздач, сколько места займёт база и сколько времени уйдёт
// на этом компьютере (EV — параллельно по ядрам).
const BYTES_PER_HAND = 87 + 8 + 12; // колонки + ключ дубля + индекс реплеера (см. store.js)
async function estimate(files, heroNicks, opts) {
  opts = opts || {};
  const os = require('os'), { evNet } = require('./ev.js');
  const heroes = new Set(heroNicks);
  const sizes = files.map(f => { try { return fileSize(f); } catch (e) { return 0; } });
  const total = sizes.reduce((a, b) => a + b, 0);
  const budget = opts.sampleBytes || 16 * 1024 * 1024;
  // образец: файлы через равные промежутки, пока не наберём budget байт
  const order = []; const step = Math.max(1, Math.floor(files.length / Math.max(1, Math.min(files.length, 400))));
  for (let i = 0; i < files.length && order.length < files.length; i += step) order.push(i);
  let sBytes = 0, sHands = 0, rps = [], rpBytes = 0; const t0 = Date.now();
  for (const i of order) {
    if (sBytes >= budget) break;
    try { await eachText(files[i], (text) => { const r = parseText(text, heroes); for (const h of r.hands) { sHands++; if (h.rp && h.hc >= 0) { rps.push(h.rp); rpBytes += JSON.stringify(h.rp).length; } } }); } catch (e) { /* пропуск */ }
    sBytes += sizes[i];
  }
  closeAll();
  const parseMs = Date.now() - t0;
  // EV: замер на образце олл-инов и прочих записей (не дольше ~3 с)
  let evMs = 0, evN = 0; const tE = Date.now();
  for (let k = 0; k < rps.length && Date.now() - tE < 3000; k++) { evNet(rps[k], k + 1); evN++; }
  evMs = Date.now() - tE;
  const threads = Math.max(1, Math.min(8, (os.cpus() || []).length - 1));
  const scale = sBytes ? total / sBytes : 0;
  const hands = Math.round(sHands * scale), rpHands = Math.round(rps.length * scale);
  const evPerRec = evN ? evMs / evN : 0;
  const seconds = (parseMs * scale + rpHands * evPerRec / threads) / 1000 * 1.1 + 2; // +10% на запись и сортировку
  const bytes = Math.round(hands * BYTES_PER_HAND + (rps.length ? rpBytes / rps.length : 0) * rpHands);
  return { totalBytes: total, sampleBytes: sBytes, hands, bytes, seconds: Math.round(seconds), threads, cpus: (os.cpus() || []).length, exact: sBytes >= total };
}

module.exports = { ROOM_SIGNS, SUPPORTED, walk, addFile, scan, buildBase, eachText, estimate };
