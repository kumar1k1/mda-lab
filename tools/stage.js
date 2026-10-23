'use strict';
// Готовит папку для установщика: node tools/stage.js <electron-win-папка> <выход-stage>
// Личная база (app/data/my-base*.json) в установщик НЕ попадает: программа стартует пустой,
// а каждый игрок загружает свою базу — она хранится только у него в папке данных программы.
const fs = require('fs');
const path = require('path');

const [electronDir, out] = process.argv.slice(2);
if (!electronDir || !out) { console.error('usage: node tools/stage.js <electron-win> <stage>'); process.exit(1); }
const APP = path.join(__dirname, '..', 'app');
const PRIVATE = /(^|[\\/])data[\\/](my-base.*|.*\.off)$/; // личные данные — не копировать

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(electronDir, out, { recursive: true });
const dst = path.join(out, 'resources', 'app');
fs.cpSync(APP, dst, { recursive: true, filter: (src) => !PRIVATE.test(path.relative(APP, src)) });
fs.copyFileSync(path.join(__dirname, '..', 'build', 'icon.ico'), path.join(out, 'icon.ico'));

// проверка: в папке установщика не должно быть ничьих раздач
const bad = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/my-base|^hands\.json$|^replays\.json$|\.off$/.test(e.name)) bad.push(p); } })(dst);
// и ни одного из ников, по которым собиралась личная база
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(js|json|html)$/.test(e.name) && /777molodoy777|77molodoy77|dzmitry pranko|easyWin777|Kumar1k|molodoy_777/.test(fs.readFileSync(p, 'utf8'))) bad.push(p + ' (ник)'); } })(dst);
if (bad.length) { console.error('ОСТАНОВЛЕНО: в установщик попали личные данные:\n' + bad.join('\n')); process.exit(2); }
console.log('stage готов без личных данных:', out);
