'use strict';
// Поток разбора: получает номера файлов, разбирает раздачи целиком (герой + соперники) и отдаёт их основному потоку
// порциями по ~2000 раздач. После каждой порции ждёт подтверждения — так даже файл в гигабайты не копится в памяти:
// если основной поток ещё занят предыдущим файлом, этот поток просто ждёт.
// Ход раздачи для реплеера сразу сжимается (deflate-raw) — так он и хранится в базе.
const { parentPort, workerData } = require('worker_threads');
const zlib = require('zlib');
const { parseTextAll } = require('./parse.js');
const { eachText } = require('./build.js');
const { hash53, SCHEMA } = require('./store.js');
const { rowVals } = require('./ingest.js');
const NC = SCHEMA.length, CNAMES = SCHEMA.map(c => c[0]);
const { closeAll } = require('./zip.js');

const { files } = workerData;
const heroes = new Set(workerData.heroes), observer = !!workerData.observer, exclude = new Set(workerData.exclude || []);
const BATCH = 2000;
const queue = []; let busy = false, ackResolve = null;

function waitAck() { return new Promise(r => { ackResolve = r; }); }
async function work(fi) {
  let hands = [], errors = 0, seq = 0;
  // числовые значения строк (ваша + соперников) — сразу плотным массивом по колонкам SCHEMA: основной поток
  // только раскладывает числа по колонкам, без разбора тысяч объектов (раньше это было узким местом загрузки)
  let vals = new Float64Array(1 << 16), nRows = 0;
  const addRow = (rec) => {
    if ((nRows + 1) * NC > vals.length) { const v2 = new Float64Array(vals.length * 2); v2.set(vals); vals = v2; }
    const rv = rowVals(rec, 0), o = nRows * NC; for (let c = 0; c < NC; c++) { const x = rv[CNAMES[c]]; vals[o + c] = x == null ? NaN : x; }
    return nRows++;
  };
  // сжатые записи порции — в один плотный буфер, передаётся без копирования.
  // (буфер от deflateRawSync — 16 КБ под запись в ~300 байт: передавать его как есть значит раздувать память в десятки раз)
  const flush = async (done) => {
    let total = 0; for (const h of hands) if (h.rpz) total += h.rpz.length;
    const buf = new Uint8Array(total); let off = 0;
    for (const h of hands) { if (h.rpz) { buf.set(h.rpz, off); h.rpzOff = off; h.rpzLen = h.rpz.length; off += h.rpz.length; } else h.rpzOff = -1; h.rpz = undefined; }
    const vb = vals.slice(0, nRows * NC);
    parentPort.postMessage({ fi, seq: seq++, hands, errors, done, rpzBuf: buf, vals: vb }, [buf.buffer, vb.buffer]);
    hands = []; errors = 0; nRows = 0; await waitAck();
  };
  try {
    await eachText(files[fi], async (text) => {
      const r = parseTextAll(text, heroes, observer, exclude); errors += r.errors;
      for (const h of r.hands) {
        const rp = h.rp; if (rp) delete rp.bb;
        const heroRp = !!(h.hero && h.hero.rp); if (h.hero) delete h.hero.rp; // запись реплеера — у каждой вашей раздачи
        const vi = h.hero ? addRow(h.hero) : nRows;
        for (const o of h.opps) addRow(o);
        hands.push({ k: hash53(h.id + '|' + h.tour), room: h.room, hn: h.hero ? h.hero.hero : null, hhc: h.hero ? h.hero.hc : -1, vi, on: h.opps.map(o => o.hero), os: h.opps.map(o => o.seatIdx), onr: h.opps.map(o => (o.needRp ? 1 : 0)), heroRp, rpz: rp ? zlib.deflateRawSync(Buffer.from(JSON.stringify(rp), 'utf8')) : null });
      }
      if (hands.length >= BATCH) await flush(false);
    });
  } catch (e) { /* файл не прочитан — пропускаем */ }
  await flush(true);
}
async function pump() {
  if (busy) return; busy = true;
  while (queue.length) await work(queue.shift());
  busy = false;
}
parentPort.on('message', (m) => {
  if (m.type === 'ack') { const r = ackResolve; ackResolve = null; if (r) r(); return; }
  if (m.type === 'stop') { closeAll(); process.exit(0); }
  queue.push(m.fi); pump();
});
