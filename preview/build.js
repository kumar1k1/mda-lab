'use strict';
// Собирает кликабельное онлайн-превью программы в один HTML-файл.
const fs = require('fs');
const path = require('path');
const R = path.join(__dirname, '..', 'app', 'renderer');
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');

const html = read('index.html');
const body = html.split('<body>')[1].split('<script src="stats.js"></script>')[0];
// база превью — папка колонок, как в программе; записи реплеера частями по 8 МБ (лимит хостинга — 15 МБ на файл)
const { writeFromLegacy } = require('../app/parser/store.js');
const D = path.join(__dirname, '..', 'app', 'data');
// MDALAB_BASE=<папка базы v3> — превью с соперниками (база собрана из историй, в репозиторий не попадает);
// иначе — ваша база из app/data (старый формат, без соперников)
if (process.env.MDALAB_BASE) console.log('база v3:', require('./pack-v3.js').pack(process.env.MDALAB_BASE, path.join(__dirname, 'base')));
else writeFromLegacy(path.join(__dirname, 'base'), JSON.parse(fs.readFileSync(path.join(D, 'my-base.json'), 'utf8')), JSON.parse(fs.readFileSync(path.join(D, 'my-base-replays.json'), 'utf8')), 8 * 1024 * 1024);
// хостинг артефактов не отдаёт бинарные файлы — для превью колонки и индекс как base64 в .json, записи реплеера как .txt
const BD = path.join(__dirname, 'base');
if (!process.env.MDALAB_BASE) for (const f of fs.readdirSync(BD)) {
  const p = path.join(BD, f);
  if (/\.(bin|idx)$/.test(f)) { fs.writeFileSync(p + '.b64.json', JSON.stringify(fs.readFileSync(p).toString('base64'))); fs.rmSync(p); }
  else if (/\.dat$/.test(f)) fs.renameSync(p, p.replace(/\.dat$/, '.txt'));
}
const icon = 'data:image/png;base64,' + fs.readFileSync(path.join(R, 'icon.png')).toString('base64');

const out = [
  '<title>MDA Lab</title>',
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700;800&amp;family=JetBrains+Mono:wght@500;700&amp;display=swap">',
  '<meta name="claude:viewport-fit-sides" content="cover">',
  '<style>', read('styles.css'), fs.readFileSync(path.join(__dirname, 'preview.css'), 'utf8'), '</style>',
  body.replace('src="icon.png"', 'src="' + icon + '"'),
  '<script>', read('demo-gen.js'), '</script>',
  '<script>', fs.readFileSync(path.join(__dirname, 'shim.js'), 'utf8'), '</script>',
  '<script>', read('stats.js'), '</script>',
  '<script>', read('replay.js'), '</script>',
  '<script>', read('app.js'), '</script>',
  '<script>', read('hands-ui.js'), '</script>'
].join('\n');
fs.writeFileSync(path.join(__dirname, 'MDA-Lab-preview.html'), out);
console.log('bytes', Buffer.byteLength(out));
