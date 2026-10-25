'use strict';
// Сборка базы героя из файлов историй раздач. Общая для программы (импорт) и для tools/build-hero-db.js.
// База пишется потоково в папку колоночного формата (store.js) — выдерживает гигабайты историй.
const fs = require('fs');
const path = require('path');
const { parseText } = require('./parse.js');
const { listZip, isZipPath, zipSize, zipRead, zipStream, closeAll } = require('./zip.js');

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

// Рум файла в формате PokerStars: PokerDom — по столу PDOM_, экспорт GGPoker — по заголовку без часового пояса
// (PokerStars пишет время с ET: «… MSK [2026/03/08 13:31:34 ET]» или «… ET»; GG при экспорте — только дату и время)
function roomOfHead(room, head) {
  if (room !== 'PokerStars') return room;
  if (/^Table 'PDOM_/m.test(head)) return 'PokerDom';
  const h = (head.match(/^PokerStars (?:Hand|Zoom Hand|Home Game Hand) #.*$/m) || [''])[0];
  return h && !/\bET\]?\s*$/.test(h) ? 'GGPoker' : 'PokerStars';
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
    const rk = roomOfHead(sign.room, head); // в таблице румов — настоящий рум (экспорт GG и PokerDom — в формате PokerStars)
    const r = rooms[rk] || (rooms[rk] = { files: 0, bytes: 0, supported: SUPPORTED.has(sign.room) });
    r.files++; r.bytes += size; est += Math.round(size / 1500);
    if (!r.supported) continue;
    // первая раздача каждого файла: кому «раздали карты» — это и есть игрок, чья это история
    const m = /^Dealt to (.+?) \[/m.exec(head);
    let who = m ? m[1] : null;
    // PokerDom не пишет карты героя: герой — тот, кто сидит за столом почти в каждом файле.
    // В других румах файлы без «Dealt to» — датамайнинг (чужие столы): героя там нет.
    if (!who && roomOfHead(sign.room, head) === 'PokerDom') {
      const room = 'PokerDom';
      noDealt[room] = (noDealt[room] || 0) + 1;
      new Set([...head.matchAll(/^Seat \d+: (.+?) \(/gm)].map(x => x[1])).forEach(n => { const c = seatCount[room] || (seatCount[room] = {}); c[n] = (c[n] || 0) + 1; });
    }
    if (who) {
      const room = roomOfHead(sign.room, head);
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
    if (cut > 0) { await cb(buf.toString('utf8', 0, cut)); carry = Buffer.from(buf.subarray(cut + 1)); } else carry = buf;
  }
  if (carry && carry.length) await cb(carry.toString('utf8'));
}
async function eachText(f, cb) {
  if (isZipPath(f)) {
    if (zipSize(f) <= BIG) await cb(zipRead(f).toString('utf8'));
    else await streamPieces(zipStream(f), cb);
    return;
  }
  if (fs.statSync(f).size <= BIG) await cb(fs.readFileSync(f).toString('utf8'));
  else await streamPieces(fs.createReadStream(f, { highWaterMark: 4 * 1024 * 1024 }), cb);
}

// ---------- сборка базы ----------
// Сборка и дозагрузка — в ingest.js (герой + соперники, разбор по ядрам, слияние потоком).
// Подключается при вызове, чтобы не было круговой зависимости (потоки разбора используют eachText отсюда).
const buildBase = (...a) => require('./ingest.js').buildBase(...a);
const appendBase = (files, nicks, alias, dir, onProgress, opts) => require('./ingest.js').ingestGrouped(files, nicks, alias, dir, onProgress, opts);

// ---------- оценка до загрузки ----------
// Прогоняет образец историй (~16 МБ, равномерно по списку файлов) тем же разбором (вы + все соперники)
// и тем же расчётом EV, что и загрузка, и пересчитывает на весь объём: сколько раздач, сколько места
// займёт база и сколько времени уйдёт на этом компьютере (разбор и EV — параллельно по ядрам).
const HERO_ROW = 87 + 12 + 8, OPP_ROW = 87 + 4 + 1 + 12 + 8; // колонки + ссылка на реплеер + отпечаток (+ игрок и место)
async function estimate(files, heroNicks, opts) {
  opts = opts || {};
  const os = require('os'), zlib = require('zlib'), { evNet } = require('./ev.js'), { parseTextAll } = require('./parse.js'), { asSeat } = require('./store.js');
  const heroes = new Set(heroNicks);
  const sizes = files.map(f => { try { return fileSize(f); } catch (e) { return 0; } });
  const total = sizes.reduce((a, b) => a + b, 0);
  const budget = opts.sampleBytes || 16 * 1024 * 1024;
  const order = []; const step = Math.max(1, Math.floor(files.length / Math.max(1, Math.min(files.length, 400))));
  for (let i = 0; i < files.length; i += step) order.push(i);
  let sMined = 0, sBytes = 0, sHands = 0, sOpp = 0, rpN = 0, rpBytes = 0; const evRecs = []; const t0 = Date.now();
  for (const i of order) {
    if (sBytes >= budget) break;
    try {
      await eachText(files[i], (text) => {
        const r = parseTextAll(text, heroes, !heroes.size); // без ников — как датамайнинг: только соперники
        for (const h of r.hands) {
          if (h.hero) sHands++; else sMined++; sOpp += h.opps.length;
          if (h.rp) { rpN++; rpBytes += zlib.deflateRawSync(Buffer.from(JSON.stringify(h.rp))).length; }
          if (h.hero && h.hero.rp && h.hero.hc >= 0) evRecs.push([h.rp, -1]);
          for (const o of h.opps) if (o.needRp && o.hc >= 0 && h.rp) evRecs.push([h.rp, o.seatIdx]);
        }
      });
    } catch (e) { /* пропуск */ }
    sBytes += sizes[i];
  }
  closeAll();
  const parseMs = Date.now() - t0;
  let evMs = 0, evN = 0; const tE = Date.now();
  for (let k = 0; k < evRecs.length && Date.now() - tE < 4000; k++) { evNet(asSeat(evRecs[k][0], evRecs[k][1]), k + 1); evN++; }
  evMs = Date.now() - tE;
  const cpus = (os.cpus() || []).length, threads = Math.max(1, Math.min(8, cpus - 1));
  const scale = sBytes ? total / sBytes : 0;
  const hands = Math.round(sHands * scale), opp = Math.round(sOpp * scale);
  const evJobs = evRecs.length * scale, evPer = evN ? evMs / evN : 0;
  // потоки дают не линейное ускорение (логические ядра, общая память): берём ~60% от числа потоков.
  // Разбор не быстрее, чем основной поток успевает раскладывать строки по колонкам (~60 мкс на вашу раздачу, ~45 мкс на строку соперника) —
  // в датамайнинге строк соперников в 6–8 раз больше раздач, и это главный предел (сверено на загрузке 1,3 ГБ Winamax: 6,7 млн строк).
  const eff = Math.max(1, threads * 0.6);
  const parseSec = Math.max(parseMs * scale / eff * 1.25 / 1000, hands * 60e-6 + opp * 45e-6);
  // EV олл-инов считается в фоне уже после загрузки (раздачи доступны сразу) — отдельной цифрой
  const seconds = parseSec + (hands + opp) * 2e-5 + 3, evSeconds = evJobs * evPer / eff / 1000;
  const bytes = Math.round(hands * HERO_ROW + opp * OPP_ROW + (rpN ? rpBytes / rpN : 0) * rpN * scale + hands * 8);
  return { totalBytes: total, sampleBytes: sBytes, hands, mined: Math.round(sMined * scale), opp, bytes, seconds: Math.round(seconds), evSeconds: Math.round(evSeconds), threads, cpus, exact: sBytes >= total };
}

module.exports = { fileSize, ROOM_SIGNS, SUPPORTED, walk, addFile, scan, buildBase, appendBase, eachText, estimate };
