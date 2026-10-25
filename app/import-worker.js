'use strict';
// Фоновая сборка базы: разбирает файлы потоково и пишет базу во временную папку, сообщает прогресс.
const { parentPort, workerData } = require('worker_threads');
const { buildBase, appendBase, estimate } = require('./parser/build.js');

const { files, nicks, alias, outDir, mode } = workerData;
if (mode === 'estimate') {
  estimate(files, nicks).then(r => parentPort.postMessage({ type: 'estimate', ...r })).catch(e => parentPort.postMessage({ type: 'error', message: String(e && e.message || e) }));
} else (mode === 'append' ? appendBase : buildBase)(files, nicks, alias, outDir, (done, total, hands, stage, group, groups) => parentPort.postMessage({ type: 'progress', done, total, hands, stage, group, groups }), { deferEv: true }) // EV — в фоне после загрузки
  .then(r => parentPort.postMessage(Object.assign({ type: 'done' }, r)))
  .catch(e => parentPort.postMessage({ type: 'error', message: String(e && e.message || e) }));
