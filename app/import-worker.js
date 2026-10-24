'use strict';
// Фоновая сборка базы: разбирает файлы потоково и пишет базу во временную папку, сообщает прогресс.
const { parentPort, workerData } = require('worker_threads');
const { buildBase, estimate } = require('./parser/build.js');

const { files, nicks, alias, outDir, mode } = workerData;
if (mode === 'estimate') {
  estimate(files, nicks).then(r => parentPort.postMessage({ type: 'estimate', ...r })).catch(e => parentPort.postMessage({ type: 'error', message: String(e && e.message || e) }));
} else buildBase(files, nicks, alias, outDir, (done, total, hands, stage) => parentPort.postMessage({ type: 'progress', done, total, hands, stage }))
  .then(r => parentPort.postMessage({ type: 'done', hands: r.hands, dup: r.dup, errors: r.errors, rooms: r.rooms }))
  .catch(e => parentPort.postMessage({ type: 'error', message: String(e && e.message || e) }));
