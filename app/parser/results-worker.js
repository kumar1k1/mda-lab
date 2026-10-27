'use strict';
// Расчёт данных «Результатов» (parser/results.js) в отдельном потоке: у большой базы он идёт десятки секунд,
// и в главном процессе программы окно на это время переставало отвечать на нажатия.
const { parentPort, workerData } = require('worker_threads');
try {
  const { BaseDir } = require('./store.js'), R = require('./results.js');
  const d = R.pack(R.compute(new BaseDir(workerData.dir)));
  const bufs = ['t', 'conc', 'ses', 'since', 'tour'].map(k => d[k].buffer).filter((b, i, a) => a.indexOf(b) === i);
  parentPort.postMessage({ ok: true, data: d }, bufs);
} catch (e) { parentPort.postMessage({ ok: false, error: String(e && e.stack || e) }); }
