'use strict';
// Поток разбора: получает номера файлов, разбирает раздачи целиком (герой + соперники) и отдаёт их основному потоку.
// Ход раздачи для реплеера сразу сжимается (deflate-raw) — так он и хранится в базе.
const { parentPort, workerData } = require('worker_threads');
const zlib = require('zlib');
const { parseTextAll } = require('./parse.js');
const { eachText } = require('./build.js');
const { hash53 } = require('./store.js');
const { closeAll } = require('./zip.js');

const { files } = workerData;
const heroes = new Set(workerData.heroes);
parentPort.on('message', async (m) => {
  if (m.type === 'stop') { closeAll(); process.exit(0); }
  const fi = m.fi, hands = []; let errors = 0;
  try {
    await eachText(files[fi], (text) => {
      const r = parseTextAll(text, heroes); errors += r.errors;
      for (const h of r.hands) {
        const rp = h.rp; if (rp) delete rp.bb;
        const heroRp = !!h.hero.rp; delete h.hero.rp; // у героя — запись реплеера только в его спотах (как раньше)
        hands.push({ k: hash53(h.hero.id + '|' + h.hero.tour), hero: h.hero, opps: h.opps, heroRp, rpz: rp ? zlib.deflateRawSync(Buffer.from(JSON.stringify(rp), 'utf8')) : null });
      }
    });
  } catch (e) { /* файл не прочитан — пропускаем */ }
  parentPort.postMessage({ fi, hands, errors });
});
