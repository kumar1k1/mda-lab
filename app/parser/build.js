'use strict';
// Сборка базы героя из файлов историй раздач. Общая для программы (импорт) и для tools/build-hero-db.js.
const fs = require('fs');
const path = require('path');
const { parseText } = require('./parse.js');
const { listZip, isZipPath, zipSize, zipRead, closeAll } = require('./zip.js');

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
function readText(f) { return (isZipPath(f) ? zipRead(f) : fs.readFileSync(f)).toString('utf8'); }

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

// Полная сборка. nicks: { ник: рум }, alias: имя Alias. onProgress(done, total, hands).
function buildDb(files, nicks, alias, onProgress) {
  const heroes = new Set(Object.keys(nicks));
  const ROOMS = [...new Set(Object.values(nicks))];
  const seen = new Set(); const recs = []; let errors = 0, dup = 0;
  files.forEach((f, k) => {
    let text = '';
    try { text = readText(f); } catch (e) { return; }
    const r = parseText(text, heroes);
    errors += r.errors;
    for (const h of r.hands) {
      const key = h.id + '|' + h.tour;
      if (seen.has(key)) { dup++; continue; }
      seen.add(key); h.room = nicks[h.hero]; recs.push(h);
    }
    if (onProgress && (k % 25 === 0 || k === files.length - 1)) onProgress(k + 1, files.length, recs.length);
  });
  closeAll();
  if (!recs.length) return { db: null, rp: {}, hands: 0, dup, errors };
  recs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const start = recs[0].date.slice(0, 7);
  const [sy, sm] = start.split('-').map(Number);
  const cols = { room: [], type: [], month: [], tbl: [], pos: [], bb: [], sit: [], lim: [], act: [], size: [], fti: [], bvb: [], fvr: [], day: [], hc: [], net: [], sto: [], f3b: [], orsp: [], bmin: [], sbs: [], bbs: [], bh: [], bsh: [], bmd: [], bdp: [], cov: [], bi: [], rz: [], cl: [], rai: [] };
  const rp = {};
  for (const h of recs) {
    const [y, m] = h.date.split('-').map(Number);
    cols.room.push(ROOMS.indexOf(h.room)); cols.type.push(h.pko); cols.month.push((y - sy) * 12 + (m - sm));
    cols.tbl.push(h.tblMax && h.tblMax <= 6 ? 6 : 9); cols.pos.push(h.pos); cols.bb.push(h.bb);
    cols.sit.push(h.sit); cols.lim.push(h.lim); cols.act.push(h.act); cols.size.push(h.size); cols.fti.push(h.fti); cols.bvb.push(h.bvb); cols.fvr.push(h.fvr);
    if (h.rp && h.hc >= 0) { delete h.rp.bb; rp[cols.room.length - 1] = h.rp; }
    cols.day.push(Math.round((Date.UTC(y, m - 1, +h.date.slice(8, 10)) - Date.UTC(sy, sm - 1, 1)) / 864e5)); cols.hc.push(h.hc); cols.net.push(h.net); cols.sto.push(h.sto); cols.f3b.push(h.f3b); cols.orsp.push(h.orsp); cols.bmin.push(h.bmin); cols.sbs.push(h.sbs); cols.bbs.push(h.bbs); cols.bh.push(h.bh); cols.bsh.push(h.bsh); cols.bmd.push(h.bmd); cols.bdp.push(h.bdp); cols.cov.push(h.cov); cols.bi.push(h.bi); cols.rz.push(h.rz); cols.cl.push(h.cl); cols.rai.push(h.rai);
  }
  const db = { format: 'mdalab-hands-v1', demo: false, hero: alias || Object.keys(nicks)[0], nicks, rooms: ROOMS, types: ['Обычный', 'PKO'], periodStart: start, count: recs.length, cols };
  return { db, rp, hands: recs.length, dup, errors };
}

module.exports = { ROOM_SIGNS, SUPPORTED, walk, addFile, scan, buildDb };
