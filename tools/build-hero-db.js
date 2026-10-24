'use strict';
// Собирает базу героя из папки с историями раздач: node tools/build-hero-db.js <папка> <выход-папка-базы>
// Та же потоковая сборка, что и при загрузке базы в программе (app/parser/build.js), формат — папка колонок (store.js).
const fs = require('fs');
const path = require('path');
const { walk, buildBase } = require('../app/parser/build.js');

// ники героя → рум; PokerDom (molodoy_777) исключён из базы
const NICKS = { '77molodoy77': 'Winamax', 'dzmitry pranko': 'GGPoker', 'easyWin777': 'WPN', 'Kumar1k': 'PokerStars' };
const [dir, out] = process.argv.slice(2);
if (!dir || !out) { console.error('usage: node tools/build-hero-db.js <папка-историй> <папка-базы>'); process.exit(1); }

const files = []; walk(dir, files, 1e7);
(async () => {
const t0 = Date.now();
const r = await buildBase(files, NICKS, '777molodoy777', out, (d, t, h) => { if (d % 500 === 0 || d === t) process.stdout.write('\r' + d + '/' + t + ' файлов, ' + h + ' раздач   '); });
const bytes = fs.readdirSync(out).reduce((a, f) => a + fs.statSync(path.join(out, f)).size, 0);
console.log('\nfiles', files.length, 'hands', r.hands, 'dup', r.dup, 'skipped', r.errors, 'база', (bytes / 1e6).toFixed(1) + ' МБ', ((Date.now() - t0) / 1000).toFixed(1) + ' с');
})();
