'use strict';
// Собирает базу героя из папки с историями раздач: node tools/build-hero-db.js <папка> <выход.json>
const fs = require('fs');
const path = require('path');
const { parseText } = require('../app/parser/parse.js');

const NICKS = { '77molodoy77': 'Winamax', 'dzmitry pranko': 'GGPoker', 'easyWin777': 'WPN', 'Kumar1k': 'PokerStars', 'molodoy_777': 'PokerDom' };
const ROOMS = ['GGPoker', 'Winamax', 'PokerStars', 'PokerDom', 'WPN'];
const heroes = new Set(Object.keys(NICKS));
const [dir, out] = process.argv.slice(2);

const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.txt$/i.test(e.name)) files.push(p); } })(dir);

const seen = new Set(); const recs = []; let errors = 0, dup = 0; const byFmt = {};
for (const f of files) {
  const r = parseText(fs.readFileSync(f, 'utf8'), heroes);
  errors += r.errors;
  for (const h of r.hands) {
    const key = h.id + '|' + h.tour;
    if (seen.has(key)) { dup++; continue; }
    seen.add(key); h.room = NICKS[h.hero]; recs.push(h);
  }
}
// ник героя каждой раздачи нужен для рума: перепарсим быстро по имени в записи нет, поэтому определяем по формату
recs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
const start = recs[0].date.slice(0, 7);
const [sy, sm] = start.split('-').map(Number);
const cols = { room: [], type: [], month: [], tbl: [], pos: [], bb: [], sit: [], lim: [], act: [], size: [], fti: [], bvb: [], fvr: [], day: [], hc: [], net: [], sto: [], f3b: [], orsp: [], bmin: [], sbs: [], bbs: [] };
const rp = {};
for (const h of recs) {
  const [y, m] = h.date.split('-').map(Number);
  cols.room.push(ROOMS.indexOf(h.room)); cols.type.push(h.pko); cols.month.push((y - sy) * 12 + (m - sm));
  cols.tbl.push(h.tblMax && h.tblMax <= 6 ? 6 : 9); cols.pos.push(h.pos); cols.bb.push(h.bb);
  cols.sit.push(h.sit); cols.lim.push(h.lim); cols.act.push(h.act); cols.size.push(h.size); cols.fti.push(h.fti); cols.bvb.push(h.bvb); cols.fvr.push(h.fvr);
  if (h.rp && h.hc >= 0) rp[cols.room.length - 1] = h.rp;
  cols.day.push(Math.round((Date.UTC(y, m - 1, +h.date.slice(8, 10)) - Date.UTC(sy, sm - 1, 1)) / 864e5)); cols.hc.push(h.hc); cols.net.push(h.net); cols.sto.push(h.sto); cols.f3b.push(h.f3b); cols.orsp.push(h.orsp); cols.bmin.push(h.bmin); cols.sbs.push(h.sbs); cols.bbs.push(h.bbs);
}
const db = { format: 'mdalab-hands-v1', demo: false, hero: '777molodoy777', nicks: NICKS, rooms: ROOMS, types: ['Обычный', 'PKO'], periodStart: start, count: recs.length, cols };
fs.writeFileSync(out, JSON.stringify(db));
for (const k in rp) delete rp[k].bb;
fs.writeFileSync(out.replace(/\.json$/, '') + '-replays.json', JSON.stringify(rp));
const rc = {}; recs.forEach(h => { rc[h.room] = (rc[h.room] || 0) + 1; });
console.log('files', files.length, 'hands', recs.length, 'dup', dup, 'skipped', errors, rc, 'bytes', fs.statSync(out).size);
