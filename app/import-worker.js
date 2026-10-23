'use strict';
// Фоновая сборка базы: разбирает файлы, пишет базу во временные файлы и сообщает прогресс.
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const { buildDb } = require('./parser/build.js');

const { files, nicks, alias, outDb, outRp } = workerData;
try {
  const r = buildDb(files, nicks, alias, (done, total, hands) => parentPort.postMessage({ type: 'progress', done, total, hands }));
  if (!r.db) { parentPort.postMessage({ type: 'done', hands: 0, dup: r.dup, errors: r.errors }); return; }
  fs.writeFileSync(outDb, JSON.stringify(r.db));
  fs.writeFileSync(outRp, JSON.stringify(r.rp));
  parentPort.postMessage({ type: 'done', hands: r.hands, dup: r.dup, errors: r.errors, rooms: r.db.rooms });
} catch (e) {
  parentPort.postMessage({ type: 'error', message: String(e && e.message || e) });
}
