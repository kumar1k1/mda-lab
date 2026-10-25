'use strict';
// Фоновый досчёт EV после загрузки (parser/ingest.js → finishEv): раздачи уже доступны, EV дописывается в базу.
const { parentPort, workerData } = require('worker_threads');
const { finishEv } = require('./parser/ingest.js');
finishEv(workerData.dir, { onTick: (done, total) => parentPort.postMessage({ type: 'progress', done, total }) })
  .then(() => parentPort.postMessage({ type: 'done' }))
  .catch(e => parentPort.postMessage({ type: 'error', message: String(e && e.message || e) }));
