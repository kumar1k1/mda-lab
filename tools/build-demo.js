'use strict';
// Демо-база: синтетические истории (tools/make-demo-hh.js) → обычная сборка базы программы.
// Так у демо-игрока работают все вкладки, окна матрицы, соперники и реплеер — как у настоящей базы.
//   node tools/build-demo.js [папка_базы]   (по умолчанию app/data/demo-base)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const B = require('../app/parser/build.js');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'app', 'data', 'demo-base'));
const NICKS = { DemoGG: 'GGPoker', DemoStars: 'PokerStars', DemoWina: 'Winamax' };
(async () => {
  const hh = fs.mkdtempSync(path.join(os.tmpdir(), 'mda-demo-hh-'));
  execFileSync(process.execPath, [path.join(__dirname, 'make-demo-hh.js'), hh], { stdio: 'inherit' });
  const files = []; B.walk(hh, files, 1e7);
  const r = await B.buildBase(files, NICKS, 'Демо-игрок', OUT, () => {}, {});
  const mf = path.join(OUT, 'meta.json'), meta = JSON.parse(fs.readFileSync(mf, 'utf8'));
  meta.demo = true; fs.writeFileSync(mf, JSON.stringify(meta));
  fs.rmSync(hh, { recursive: true, force: true });
  console.log('демо-база:', OUT, JSON.stringify({ hands: r.hands, opp: r.opp, players: r.players, errors: r.errors }));
})().catch(e => { console.error(e); process.exit(1); });
