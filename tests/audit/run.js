// Полная сверка 4 вкладок одной командой: npm run audit  (нужна полная база: MDALAB_BASE=<папка базы v3>)
// 1) собирает превью из базы, 2) поднимает локальный сервер на 127.0.0.1:8783, 3) по очереди запускает проверки,
// 4) печатает итог и завершает с кодом 1, если хоть одна проверка нашла ошибку.
'use strict';
const path = require('path'), fs = require('fs'), http = require('http'), { execFileSync, spawn } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
if (!process.env.MDALAB_BASE) { console.error('Укажите папку полной базы: MDALAB_BASE=<папка> npm run audit'); process.exit(2); }
console.log('Сборка превью из базы…');
execFileSync(process.execPath, [path.join(ROOT, 'preview', 'build.js')], { stdio: 'inherit', env: process.env });
const DIR = path.join(ROOT, 'preview'), TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => { const f = path.join(DIR, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(DIR) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
// каждая проверка и строка, по которой видно «всё хорошо»
const CHECKS = [
  ['3bet-numbers.js', 'Все числа «3-бета»', /расхождений: 0\b/],
  ['rfi-cc-v3b-numbers.js', '«Открытие», «Колд-колл», «Против 3-бета»', /расхождений 0\b/],
  ['filters-table.js', 'Таблица фильтров раздела', /ошибок 0\b/],
  ['windows-vs-filters.js', 'Окна и списки раздач против фильтров', null], // свой разбор: в каждой строке «ошибок 0»
  ['replayer-links.js', 'Реплеер по раздачам ситуаций', /совпало (\d+) из \1\b/],
  ['click-flow.js', 'Мышью: окно → список раздач → реплеер', /сценариев (\d+) успешно \1\b/],
];
const run = (file) => new Promise((res) => { const out = []; const p = spawn(process.execPath, [path.join(__dirname, file), fs.mkdtempSync(path.join(require('os').tmpdir(), 'mda-audit-'))], { cwd: ROOT }); p.stdout.on('data', d => { out.push(d); process.stdout.write(d); }); p.stderr.on('data', d => process.stderr.write(d)); p.on('close', (code) => res({ code, text: Buffer.concat(out).toString() })); });
srv.listen(8783, '127.0.0.1', async () => {
  const res = [];
  for (const [f, name, ok] of CHECKS) {
    console.log('\n=== ' + name + ' (' + f + ')');
    const r = await run(f);
    const pageErr = /errs \[\s*'/.test(r.text);
    let good = r.code === 0 && !pageErr;
    if (good && ok) good = ok.test(r.text);
    if (good && !ok) { const rows = r.text.split('\n').filter(l => /ошибок \d+/.test(l)); good = rows.length > 0 && rows.every(l => /ошибок 0\b/.test(l)); }
    res.push([name, good]);
  }
  srv.close();
  console.log('\n===== ИТОГ');
  res.forEach(([n, g]) => console.log((g ? 'OK    ' : 'ОШИБКА') + '  ' + n));
  process.exit(res.every(x => x[1]) ? 0 : 1);
});
