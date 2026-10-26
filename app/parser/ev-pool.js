'use strict';
// Параллельный расчёт EV по ядрам процессора. Результат тот же, что при расчёте по одному:
// у каждой раздачи своё фиксированное зерно (номер после сортировки), порядок вычислений на итог не влияет.
const os = require('os');
const path = require('path');
const fs = require('fs');
const { evNet } = require('./ev.js');

const { asSeat, decodeRec } = require('./store.js');
// jobs: Float64Array по S = 6 чисел — k (номер строки), part, offset, length записи реплеера, зерно, место игрока (−1 — как записано).
// Возвращает Float64Array поправок EV (NaN — поправки нет).
const S = 6;
function readRec(dir, fds, part, off, len, z) {
  let fd = fds.get(part); if (fd == null) { fd = fs.openSync(path.join(dir, 'rp_' + part + '.dat'), 'r'); fds.set(part, fd); }
  const b = Buffer.alloc(len); fs.readSync(fd, b, 0, len, off); return decodeRec(b, z, dir);
}
function computeSerial(dir, jobs, onTick, z) {
  const out = new Float64Array(jobs.length / S).fill(NaN), fds = new Map();
  try {
    for (let j = 0; j < out.length; j++) {
      const e = evNet(asSeat(readRec(dir, fds, jobs[j * S + 1], jobs[j * S + 2], jobs[j * S + 3], z), jobs[j * S + 5]), jobs[j * S + 4]);
      out[j] = e == null ? NaN : e; if (onTick && j % 500 === 0) onTick(j, out.length);
    }
  } finally { for (const fd of fds.values()) fs.closeSync(fd); }
  return out;
}

async function computeEv(dir, jobs, opts) {
  opts = opts || {};
  const n = jobs.length / S, z = opts.z === 2 ? 2 : !!opts.z;
  let threads = opts.threads != null ? opts.threads : Math.max(1, Math.min(8, (os.cpus() || []).length - 1));
  let Worker; try { ({ Worker } = require('worker_threads')); } catch (e) { threads = 1; }
  if (threads <= 1 || n < 2000) return computeSerial(dir, jobs, opts.onTick, z);
  const out = new Float64Array(n).fill(NaN);
  const CH = 1000; let next = 0, done = 0;
  const samples = global.EV_SAMPLES;
  await new Promise((resolve, reject) => {
    let alive = 0, failed = false;
    const feed = (w) => {
      if (next >= n) { w.terminate(); if (--alive === 0) resolve(); return; }
      const a = next, b = Math.min(n, next + CH); next = b;
      w.postMessage({ a, jobs: jobs.slice(a * S, b * S) });
    };
    for (let t = 0; t < threads; t++) {
      const w = new Worker(path.join(__dirname, 'ev-worker.js'), { workerData: { dir, samples, z }, resourceLimits: { maxOldGenerationSizeMb: 192, maxYoungGenerationSizeMb: 32 } }); alive++;
      w.on('message', (m) => { out.set(m.res, m.a); done += m.res.length; if (opts.onTick) opts.onTick(done, n); feed(w); });
      w.on('error', (e) => { if (!failed) { failed = true; reject(e); } });
      feed(w);
    }
  });
  return out;
}

module.exports = { computeEv, computeSerial, STRIDE: S };
