'use strict';
// Обновление базы без перезаливки рук.
// Новые версии программы иногда начинают сохранять то, чего в старой базе нет (анте, фолд на контбет, размер контбета…).
// В базе уже лежит запись каждой раздачи для реплеера: места, стеки, блайнды и анте, все действия с суммами по улицам.
// Недостающие колонки досчитываются прямо из этих записей — без исходных файлов историй и без пересчёта EV.
// Каждое обновление — запись в MIGRATIONS; выполненные отмечаются в meta.mig, поэтому каждое идёт один раз.
// Строки без записи реплеера (очень старые базы) остаются неизвестными (-1) — для них нужна перезаливка.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

const ACT = new Set(['f', 'x', 'c', 'b', 'r']);
const pre = (rec) => rec.ev.filter(e => e[0] === 0 && ACT.has(e[2]));

// фолд на контбет флопа после колд-колла (как parse.js → playerRec):
// ровно один рейз до игрока, игрок коллирует, после него префлоп никто не рейзит;
// на флопе первым ставит префлоп-рейзер; ответ игрока — фолд (1) или продолжение (0), иначе -1
function fcbOf(rec, s) {
  const p = pre(rec), hi = p.findIndex(e => e[1] === s); if (hi < 0) return -1;
  const before = p.slice(0, hi), rz = before.filter(e => e[2] === 'r' || e[2] === 'b');
  if (rz.length !== 1 || p[hi][2] !== 'c' || p.slice(hi + 1).some(e => e[2] === 'r' || e[2] === 'b')) return -1;
  const raiser = rz[0][1], F = rec.ev.filter(e => e[0] === 1 && ACT.has(e[2]));
  const jb = F.findIndex(e => e[2] === 'b' || e[2] === 'r');
  if (jb < 0 || F[jb][1] !== raiser || F[jb][2] !== 'b') return -1;
  const nx = F.slice(jb + 1).find(e => e[1] === s || e[2] === 'r' || e[2] === 'b');
  return nx && nx[1] === s ? (nx[2] === 'f' ? 1 : 0) : -1;
}
// все анте раздачи, BB×100 (суммы в записи — уже в BB)
function antOf(rec) { let a = 0; for (const e of rec.ev) if (e[0] === 0 && e[2] === 'A') a += e[3]; return Math.min(32000, Math.round(a * 100)); }
// размер первой ставки флопа в % банка к флопу
function cbsOf(rec) { return require('./parse.js').cbetPct(rec); }

// need(cols, i) — нужно ли досчитать строку i (по уже загруженным колонкам); calc(rec, seat, cols, i) — значение
const MIGRATIONS = [
  { id: 'fcb', col: ['fcb', 'i8'], uses: ['rz', 'act'], need: (C, i) => C.rz[i] === 1 && C.act[i] === 1 && C.fcb[i] < 0, calc: (rec, s) => fcbOf(rec, s) },
  // анте нужно для MDF защиты BB (#6.1) — досчитывается у защит BB против одного рейза
  { id: 'ant', col: ['ant', 'i16'], uses: ['rz', 'pos'], need: (C, i) => C.rz[i] === 1 && C.pos[i] === 6 && C.ant[i] < 0, calc: (rec) => antOf(rec) },
  { id: 'cbs', col: ['cbs', 'i16'], uses: ['fcb'], need: (C, i) => C.fcb[i] >= 0 && C.cbs[i] < 0, calc: (rec) => cbsOf(rec) }
];
const ALL_IDS = MIGRATIONS.map(m => m.id);

// какие обновления ещё не сделаны для этой базы (только база v3 — у неё записи реплеера на каждую строку)
function pending(meta) {
  if (!meta || meta.format !== 'mdalab-cols-v3' || meta.demo) return [];
  const done = new Set(meta.mig || []);
  return ALL_IDS.filter(id => !done.has(id));
}

const TY = { i8: Int8Array, i16: Int16Array, i32: Int32Array, u32: Uint32Array, f64: Float64Array };
function readCol(dir, name, type, n) {
  const f = path.join(dir, 'c_' + name + '.bin');
  if (!fs.existsSync(f)) return null;
  const b = fs.readFileSync(f), A = TY[type];
  const a = new A(n); new Uint8Array(a.buffer).set(b.subarray(0, Math.min(b.length, n * A.BYTES_PER_ELEMENT)));
  return a;
}
function writeCol(dir, name, a) {
  const f = path.join(dir, 'c_' + name + '.bin'), t = f + '.tmp';
  fs.writeFileSync(t, Buffer.from(a.buffer, a.byteOffset, a.byteLength)); fs.renameSync(t, f);
}
const TYPES_OF = { rz: 'i8', act: 'i8', pos: 'i8', fcb: 'i8', ant: 'i16', cbs: 'i16' };

function doMigrate(dir, post) {
  const mf = path.join(dir, 'meta.json'), meta = JSON.parse(fs.readFileSync(mf, 'utf8'));
  const todo = MIGRATIONS.filter(m => pending(meta).includes(m.id));
  if (!todo.length) return { done: [] };
  const g = path.join(dir, meta.colDir), tables = [{ d: g, n: meta.count || 0, hero: true }];
  if (meta.opp && meta.opp.rows) tables.push({ d: path.join(g, 'opp'), n: meta.opp.rows, hero: false });
  const z = !!meta.rpz;
  // ссылки на записи реплеера и места игроков — один раз на таблицу
  for (const t of tables) {
    t.rpp = readCol(t.d, 'rpp', 'i32', t.n); t.rpo = readCol(t.d, 'rpo', 'u32', t.n); t.rpl = readCol(t.d, 'rpl', 'u32', t.n);
    t.seat = t.hero ? null : readCol(t.d, 'seat', 'i8', t.n);
  }
  // сначала считаем объём работы — для честного прогресса
  const plan = [];
  let total = 0;
  for (const m of todo) for (const t of tables) {
    if (!t.n || !t.rpp) continue;
    const C = {};
    for (const u of m.uses.concat([m.col[0]])) { C[u] = readCol(t.d, u, TYPES_OF[u], t.n); if (!C[u] && u !== m.col[0]) C.miss = true; }
    if (C.miss) continue; // нет исходных колонок — досчитать нельзя
    if (!C[m.col[0]]) { C[m.col[0]] = new TY[m.col[1]](t.n).fill(-1); }
    const rows = [];
    for (let i = 0; i < t.n; i++) if (t.rpp[i] >= 0 && m.need(C, i)) rows.push(i);
    plan.push({ m, t, C, rows }); total += rows.length;
  }
  let done = 0, last = 0;
  const fds = new Map(), fdOf = (p) => { let fd = fds.get(p); if (fd == null) { fd = fs.openSync(path.join(dir, 'rp_' + p + '.dat'), 'r'); fds.set(p, fd); } return fd; };
  try {
    // по миграциям по порядку: fcb раньше cbs (cbs берёт строки, где известен фолд на контбет)
    for (const m of todo) {
      for (const job of plan.filter(x => x.m === m)) {
        const { t, C } = job;
        // перечитать строки: fcb мог только что обновиться предыдущей миграцией
        const rows = m.id === 'cbs' ? (() => { const r = []; C.fcb = readCol(t.d, 'fcb', 'i8', t.n); for (let i = 0; i < t.n; i++) if (t.rpp[i] >= 0 && m.need(C, i)) r.push(i); return r; })() : job.rows;
        if (m.id === 'cbs') { total += rows.length - job.rows.length; }
        rows.sort((a, b) => t.rpp[a] - t.rpp[b] || t.rpo[a] - t.rpo[b]); // чтение по порядку файла
        const out = C[m.col[0]];
        for (const i of rows) {
          const b = Buffer.alloc(t.rpl[i]); fs.readSync(fdOf(t.rpp[i]), b, 0, b.length, t.rpo[i]);
          let rec = null; try { rec = JSON.parse((z ? zlib.inflateRawSync(b) : b).toString('utf8')); } catch (e) { /* запись повреждена */ }
          if (rec && rec.ev) { const v = m.calc(rec, t.hero ? rec.h : t.seat[i]); if (v != null && v >= 0) out[i] = v; }
          done++; if (post && done - last >= 2000) { last = done; post({ done, total, id: m.id }); }
        }
        writeCol(t.d, m.col[0], out);
      }
      // отметка в meta сразу после каждого обновления — прерванное обновление продолжится с места
      if (!meta.cols.some(c => c[0] === m.col[0])) meta.cols.push(m.col);
      meta.mig = Array.from(new Set((meta.mig || []).concat([m.id])));
      const tmp = mf + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(meta)); fs.renameSync(tmp, mf);
    }
  } finally { for (const fd of fds.values()) fs.closeSync(fd); }
  if (post) post({ done: total, total, id: 'end' });
  return { done: todo.map(m => m.id), rows: total };
}

// в фоновом потоке: окно программы не замирает; onProgress({done,total})
function run(dir, onProgress) {
  return new Promise((resolve, reject) => {
    const w = new Worker(__filename, { workerData: { dir } });
    w.on('message', (m) => { if (m.type === 'progress') { if (onProgress) onProgress(m); } else if (m.type === 'done') resolve(m.res); else if (m.type === 'error') reject(new Error(m.msg)); });
    w.on('error', reject);
    w.on('exit', (c) => { if (c) reject(new Error('обновление базы прервано (' + c + ')')); });
  });
}

if (!isMainThread && workerData && workerData.dir) {
  try { const res = doMigrate(workerData.dir, (p) => parentPort.postMessage(Object.assign({ type: 'progress' }, p))); parentPort.postMessage({ type: 'done', res }); }
  catch (e) { parentPort.postMessage({ type: 'error', msg: e && e.stack || String(e) }); }
}

module.exports = { pending, run, doMigrate, ALL_IDS, fcbOf, antOf };
