'use strict';
// Поток обновления базы: пачка записей реплеера (по порядку файла) → двоичный вид (parser/rpbin.js).
// Записи читаются крупными кусками (BlockReader), а не по одной — миллионы мелких чтений были главной тратой времени.
const { parentPort, workerData } = require('worker_threads');
const { decodeRec } = require('./store.js');
const RB = require('./rpbin.js');
const { BlockReader } = require('./blockreader.js');
const br = new BlockReader(workerData.dir);
parentPort.on('message', ({ id, P, O, L }) => {
  const outs = [], lens = new Uint32Array(P.length);
  for (let i = 0; i < P.length; i++) {
    let nb; try { nb = RB.encodeRec(decodeRec(br.get(P[i], O[i], L[i]), workerData.z, workerData.dir)); } catch (e) { nb = Buffer.from('null'); }
    outs.push(nb); lens[i] = nb.length;
  }
  const buf = Buffer.concat(outs), ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
  parentPort.postMessage({ id, buf: ab, lens }, [ab, lens.buffer]);
});
