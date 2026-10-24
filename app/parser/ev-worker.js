'use strict';
// Поток расчёта EV: получает пачку раздач (k, part, offset, length, зерно), читает их записи реплеера и считает поправку EV.
const { parentPort, workerData } = require('worker_threads');
if (workerData && workerData.samples) global.EV_SAMPLES = workerData.samples;
const { computeSerial } = require('./ev-pool.js');

parentPort.on('message', ({ a, jobs }) => {
  const res = computeSerial(workerData.dir, jobs);
  parentPort.postMessage({ a, res }, [res.buffer]);
});
