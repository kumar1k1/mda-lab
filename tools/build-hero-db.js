'use strict';
// Собирает базу героя из папки с историями раздач: node tools/build-hero-db.js <папка> <выход.json>
// Та же сборка, что и при загрузке базы в программе (app/parser/build.js).
const fs = require('fs');
const { walk, buildDb } = require('../app/parser/build.js');

// ники героя → рум; PokerDom (molodoy_777) исключён из базы
const NICKS = { '77molodoy77': 'Winamax', 'dzmitry pranko': 'GGPoker', 'easyWin777': 'WPN', 'Kumar1k': 'PokerStars' };
const [dir, out] = process.argv.slice(2);

const files = []; walk(dir, files, 1e7);
const r = buildDb(files, NICKS, '777molodoy777');
fs.writeFileSync(out, JSON.stringify(r.db));
fs.writeFileSync(out.replace(/\.json$/, '') + '-replays.json', JSON.stringify(r.rp));
const rc = {}; r.db.cols.room.forEach(k => { const n = r.db.rooms[k]; rc[n] = (rc[n] || 0) + 1; });
console.log('files', files.length, 'hands', r.hands, 'dup', r.dup, 'skipped', r.errors, rc, 'bytes', fs.statSync(out).size);
