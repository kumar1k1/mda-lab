'use strict';
// Переводит базу старого формата (JSON) в папку колоночного формата без пересборки — значения не меняются.
// node tools/convert-base.js <hands.json> <replays.json> <папка-базы> [размер части реплеера, байт]
const fs = require('fs');
const { writeFromLegacy } = require('../app/parser/store.js');
const [dbF, rpF, out, part] = process.argv.slice(2);
if (!dbF || !out) { console.error('usage: node tools/convert-base.js <hands.json> <replays.json> <папка> [partSize]'); process.exit(1); }
const db = JSON.parse(fs.readFileSync(dbF, 'utf8'));
const rp = rpF && fs.existsSync(rpF) ? JSON.parse(fs.readFileSync(rpF, 'utf8')) : {};
writeFromLegacy(out, db, rp, part ? +part : undefined);
console.log('готово:', out, db.count, 'раздач');
