'use strict';
// Собирает кликабельное онлайн-превью программы в один HTML-файл.
const fs = require('fs');
const path = require('path');
const R = path.join(__dirname, '..', 'app', 'renderer');
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');

const html = read('index.html');
const body = html.split('<body>')[1].split('<script src="stats.js"></script>')[0];
fs.copyFileSync(path.join(__dirname, '..', 'app', 'data', 'my-base-replays.json'), path.join(__dirname, 'replays.json'));
const icon = 'data:image/png;base64,' + fs.readFileSync(path.join(R, 'icon.png')).toString('base64');

const out = [
  '<title>MDA Lab</title>',
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700;800&amp;family=JetBrains+Mono:wght@500;700&amp;display=swap">',
  '<meta name="claude:viewport-fit-sides" content="cover">',
  '<style>', read('styles.css'), fs.readFileSync(path.join(__dirname, 'preview.css'), 'utf8'), '</style>',
  body.replace('src="icon.png"', 'src="' + icon + '"'),
  '<script type="application/json" id="myBase">', fs.readFileSync(path.join(__dirname, '..', 'app', 'data', 'my-base.json'), 'utf8'), '</script>',
  '<script>', read('demo-gen.js'), '</script>',
  '<script>', fs.readFileSync(path.join(__dirname, 'shim.js'), 'utf8'), '</script>',
  '<script>', read('stats.js'), '</script>',
  '<script>', read('replay.js'), '</script>',
  '<script>', read('app.js'), '</script>',
  '<script>', read('hands-ui.js'), '</script>'
].join('\n');
fs.writeFileSync(path.join(__dirname, 'MDA-Lab-preview.html'), out);
console.log('bytes', Buffer.byteLength(out));
