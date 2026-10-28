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
const { decodeRec } = require('./store.js');

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
// обновления формата (после досчёта колонок): двоичный реплеер и сжатые колонки (0.7)
const FORMAT_IDS = ['rpbin', 'colz', 'names', 'dedup']; // names (0.7.2) — ники за столом; dedup (0.7.8) — копии раздач из разных выгрузок убираются
const ALL_IDS = MIGRATIONS.map(m => m.id).concat(FORMAT_IDS);

// какие обновления ещё не сделаны для этой базы (только база v3 — у неё записи реплеера на каждую строку)
function pending(meta) {
  if (!meta || meta.format !== 'mdalab-cols-v3' || meta.demo) return [];
  const done = new Set(meta.mig || []);
  return ALL_IDS.filter(id => !done.has(id));
}

const TY = { i8: Int8Array, i16: Int16Array, i32: Int32Array, u32: Uint32Array, f64: Float64Array };
// колонки — через table.js (сжатые .z и прежние .bin); длина — по числу строк таблицы
function readCol(dir, name, type, n) {
  const a = require('./table.js').readCol(dir, name, type); if (!a) return null;
  if (a.length === n) return a; const b = new TY[type](n); b.set(a.subarray(0, Math.min(n, a.length))); return b;
}
function writeCol(dir, name, a) { require('./table.js').writeCol(dir, name, a); }
const TYPES_OF = { rz: 'i8', act: 'i8', pos: 'i8', fcb: 'i8', ant: 'i16', cbs: 'i16' };

async function doMigrate(dir, post) {
  const r1 = doRowMigrations(dir, post);
  const mf = path.join(dir, 'meta.json'), done = r1.done.slice();
  for (const id of FORMAT_IDS) {
    const meta = JSON.parse(fs.readFileSync(mf, 'utf8'));
    if (!pending(meta).includes(id)) continue;
    let res = null;
    if (id === 'rpbin') await migRpbin(dir, meta, post); else if (id === 'names') migNames(dir, meta, post); else if (id === 'dedup') res = require('./dedupe.js').migDedup(dir, meta, post); else migColz(dir, meta, post);
    if (res === 'defer') continue; // отложено (досчитывается фоновый EV) — при следующем запуске
    const m2 = JSON.parse(fs.readFileSync(mf, 'utf8'));
    m2.mig = Array.from(new Set((m2.mig || []).concat([id])));
    const tmp = mf + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(m2)); fs.renameSync(tmp, mf);
    done.push(id);
  }
  if (post) post({ done: 1, total: 1, id: 'end' });
  return { done };
}

// таблицы базы: ваши строки и строки соперников
function tablesOf(dir, meta) {
  const g = path.join(dir, meta.colDir), t = [{ d: g, n: meta.count || 0, hero: true }];
  if (meta.opp && meta.opp.rows) t.push({ d: path.join(g, 'opp'), n: meta.opp.rows, hero: false });
  return t;
}
// Реплеер → двоичный вид (rpz = 2): все записи переписываются в новые части rp_*.dat (номера — после старых),
// ссылки rpp/rpo/rpl у ваших строк и строк соперников (и у недосчитанного фонового EV) — на новые места; старые части удаляются.
async function migRpbin(dir, meta, post) {
  if (meta.rpz === 2) return;
  const { ReplayWriter, decodeRec: dec } = require('./store.js'), RB = require('./rpbin.js');
  const zOld = !!meta.rpz, oldParts = meta.rpParts || 0, tabs = tablesOf(dir, meta);
  for (const t of tabs) { t.rpp = readCol(t.d, 'rpp', 'i32', t.n); t.rpo = readCol(t.d, 'rpo', 'u32', t.n); t.rpl = readCol(t.d, 'rpl', 'u32', t.n); }
  // все различные записи (одну раздачу могут делить ваша строка и строки соперников)
  const idx = new Map(), P = [], O = [], L = [];
  for (const t of tabs) for (let i = 0; i < t.n; i++) { const p = t.rpp[i]; if (p < 0) continue; const k = p * 4294967296 + t.rpo[i]; if (!idx.has(k)) { idx.set(k, P.length); P.push(p); O.push(t.rpo[i]); L.push(t.rpl[i]); } }
  const ord = Array.from(P.keys()).sort((a, b) => P[a] - P[b] || O[a] - O[b]); // чтение по порядку файлов
  const w = new ReplayWriter(dir, undefined, oldParts);
  const titles = [], tmap = new Map(), tid = (s) => { let i = tmap.get(s); if (i == null) { i = titles.length; titles.push(s); tmap.set(s, i); } return i; };
  const NP = new Int32Array(P.length), NO = new Uint32Array(P.length), NL = new Uint32Array(P.length);
  // перекодирование — пачками по 20 000 записей на нескольких ядрах; результаты пишутся строго по порядку
  const BATCH = 20000, nb = Math.ceil(ord.length / BATCH);
  const threads = require('./threads.js').threadsFor('ev');
  let done = 0;
  const put = (u, b) => { const ref = w.addRaw(RB.internTitle(b, tid)); NP[u] = ref[0]; NO[u] = ref[1]; NL[u] = ref[2]; };
  if (threads <= 1 || ord.length < 2 * BATCH) {
    const { BlockReader } = require('./blockreader.js'), br = new BlockReader(dir);
    for (const u of ord) { let b; try { b = RB.encodeRec(dec(br.get(P[u], O[u], L[u]), zOld, dir)); } catch (e) { b = Buffer.from('null'); } put(u, b); if (post && ++done % 5000 === 0) post({ done, total: P.length, id: 'rpbin' }); }
    br.close();
  } else {
    await new Promise((resolve, reject) => {
      const ready = new Map(); let next = 0, want = 0, alive = 0, failed = false;
      const ws = [];
      const feed = (wk) => {
        if (next >= nb) { wk.terminate(); return; }
        const id = next++, us = ord.slice(id * BATCH, (id + 1) * BATCH);
        wk.postMessage({ id, P: Float64Array.from(us, u => P[u]), O: Float64Array.from(us, u => O[u]), L: Float64Array.from(us, u => L[u]) });
      };
      const drain = () => {
        while (ready.has(want)) {
          const { buf, lens } = ready.get(want); ready.delete(want);
          const us = ord.slice(want * BATCH, (want + 1) * BATCH), b = Buffer.from(buf); let off = 0;
          for (let i = 0; i < us.length; i++) { put(us[i], b.subarray(off, off + lens[i])); off += lens[i]; }
          done += us.length; if (post) post({ done, total: P.length, id: 'rpbin' }); want++;
        }
        if (want >= nb) resolve();
      };
      for (let t = 0; t < threads; t++) {
        const wk = new Worker(path.join(__dirname, 'rpbin-worker.js'), { workerData: { dir, z: zOld } }); ws.push(wk); alive++;
        wk.on('message', (m) => { ready.set(m.id, m); feed(wk); drain(); });
        wk.on('error', (e) => { if (!failed) { failed = true; ws.forEach(x => x.terminate()); reject(e); } });
        feed(wk);
      }
    });
  }
  w.close();
  fs.writeFileSync(path.join(dir, 'rp-titles.json'), JSON.stringify(titles));
  const remap = (p, o) => idx.get(p * 4294967296 + o);
  for (const t of tabs) {
    for (let i = 0; i < t.n; i++) { if (t.rpp[i] < 0) continue; const u = remap(t.rpp[i], t.rpo[i]); t.rpp[i] = NP[u]; t.rpo[i] = NO[u]; t.rpl[i] = NL[u]; }
    writeCol(t.d, 'rpp', t.rpp); writeCol(t.d, 'rpo', t.rpo); writeCol(t.d, 'rpl', t.rpl);
  }
  // недосчитанный фоновый EV: ссылки в его списке — тоже на новые места
  const pf = path.join(dir, 'ev-pending.bin');
  if (fs.existsSync(pf)) {
    const b = fs.readFileSync(pf), J = new Float64Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    for (let j = 0; j < J.length; j += 6) { const u = remap(J[j + 1], J[j + 2]); if (u != null) { J[j + 1] = NP[u]; J[j + 2] = NO[u]; J[j + 3] = NL[u]; } }
    fs.writeFileSync(pf, Buffer.from(J.buffer));
  }
  const mf = path.join(dir, 'meta.json'), m2 = JSON.parse(fs.readFileSync(mf, 'utf8'));
  m2.rpz = 2; m2.rpParts = w.parts;
  const tmp = mf + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(m2)); fs.renameSync(tmp, mf);
  for (let p = 0; p < oldParts; p++) fs.rmSync(path.join(dir, 'rp_' + p + '.dat'), { force: true });
}
// Ники за столом (0.7.2): в старых записях реплеера мест без имён, но база знает, кто где сидел — у строк соперников
// есть игрок (pid) и место (seat), у ваших строк — номер вашего ника (nk). Каждая запись дописывается кодами мест
// (rpbin.appendNames) и переписывается в новые части rp_*.dat; ссылки обеих таблиц — на новые места.
function migNames(dir, meta, post) {
  if (meta.rpz !== 2) return;
  const RB = require('./rpbin.js'), { ReplayWriter } = require('./store.js'), { BlockReader } = require('./blockreader.js');
  const oldParts = meta.rpParts || 0, tabs = tablesOf(dir, meta);
  for (const t of tabs) { t.rpp = readCol(t.d, 'rpp', 'i32', t.n); t.rpo = readCol(t.d, 'rpo', 'u32', t.n); t.rpl = readCol(t.d, 'rpl', 'u32', t.n); }
  const idx = new Map(), P = [], O = [], L = [];
  const uOf = tabs.map(t => { const u = new Int32Array(t.n).fill(-1); for (let i = 0; i < t.n; i++) { const p = t.rpp[i]; if (p < 0) continue; const k = p * 4294967296 + t.rpo[i]; let v = idx.get(k); if (v == null) { v = P.length; idx.set(k, v); P.push(p); O.push(t.rpo[i]); L.push(t.rpl[i]); } u[i] = v; } return u; });
  const N = P.length, heroNk = new Int16Array(N).fill(-1);
  const H = tabs[0], nk = readCol(H.d, 'nk', 'i16', H.n);
  if (nk) for (let i = 0; i < H.n; i++) if (uOf[0][i] >= 0 && nk[i] >= 0) heroNk[uOf[0][i]] = nk[i];
  // строки соперников по записям (подсчётом): start[u] … start[u + 1]
  const start = new Int32Array(N + 1); let oSeat = null, oPid = null, oRow = null;
  if (tabs[1]) {
    const T2 = tabs[1], seat = readCol(T2.d, 'seat', 'i8', T2.n), pid = readCol(T2.d, 'pid', 'i32', T2.n), u2 = uOf[1];
    for (let i = 0; i < T2.n; i++) if (u2[i] >= 0) start[u2[i] + 1]++;
    for (let u = 0; u < N; u++) start[u + 1] += start[u];
    const fill = start.slice(0, N); oRow = new Int32Array(start[N]);
    for (let i = 0; i < T2.n; i++) if (u2[i] >= 0) oRow[fill[u2[i]]++] = i;
    oSeat = seat; oPid = pid;
  }
  const ord = Array.from(P.keys()).sort((a, b) => P[a] - P[b] || O[a] - O[b]);
  const br = new BlockReader(dir), w = new ReplayWriter(dir, undefined, oldParts);
  const NP = new Int32Array(N), NO = new Uint32Array(N), NL = new Uint32Array(N);
  let done = 0;
  for (const u of ord) {
    let b = br.get(P[u], O[u], L[u]);
    try {
      if ((b[0] === 2 || b[0] === 3 || b[0] === 4 || b[0] === 5) && !(b[1] & 128)) {
        const { n, h } = RB.seatsOf(b), codes = new Array(n).fill(0);
        if (oRow) for (let q = start[u]; q < start[u + 1]; q++) { const i = oRow[q], s = oSeat[i]; if (s >= 0 && s < n && oPid[i] >= 0) codes[s] = 2 + 2 * oPid[i]; }
        if (heroNk[u] >= 0 && h >= 0 && h < n) codes[h] = 1 + 2 * heroNk[u];
        b = RB.appendNames(Buffer.from(b), codes);
      }
    } catch (e) { /* запись как была */ }
    const ref = w.addRaw(b); NP[u] = ref[0]; NO[u] = ref[1]; NL[u] = ref[2];
    if (post && ++done % 5000 === 0) post({ done, total: N, id: 'names' });
  }
  br.close(); w.close();
  const remap = (p, o) => idx.get(p * 4294967296 + o);
  for (const t of tabs) {
    for (let i = 0; i < t.n; i++) { if (t.rpp[i] < 0) continue; const u = remap(t.rpp[i], t.rpo[i]); t.rpp[i] = NP[u]; t.rpo[i] = NO[u]; t.rpl[i] = NL[u]; }
    writeCol(t.d, 'rpp', t.rpp); writeCol(t.d, 'rpo', t.rpo); writeCol(t.d, 'rpl', t.rpl);
  }
  const pf = path.join(dir, 'ev-pending.bin');
  if (fs.existsSync(pf)) {
    const b = fs.readFileSync(pf), J = new Float64Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    for (let j = 0; j < J.length; j += 6) { const u = remap(J[j + 1], J[j + 2]); if (u != null) { J[j + 1] = NP[u]; J[j + 2] = NO[u]; J[j + 3] = NL[u]; } }
    fs.writeFileSync(pf, Buffer.from(J.buffer));
  }
  const mf = path.join(dir, 'meta.json'), m2 = JSON.parse(fs.readFileSync(mf, 'utf8'));
  m2.rpParts = w.parts;
  const tmp = mf + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(m2)); fs.renameSync(tmp, mf);
  for (let p = 0; p < oldParts; p++) fs.rmSync(path.join(dir, 'rp_' + p + '.dat'), { force: true });
}
// Колонки → сжатые (.z): каждая c_*.bin переписывается сжатой и удаляется
function migColz(dir, meta, post) {
  const T = { rpp: 'i32', rpo: 'u32', rpl: 'u32', key: 'f64', aid: 'i16', nk: 'i16', pid: 'i32', seat: 'i8' };
  for (const [n, t] of meta.cols) T[n] = t;
  const tabs = tablesOf(dir, meta), files = [];
  for (const t of tabs) for (const f of fs.readdirSync(t.d)) { const m = /^c_(.+)\.bin$/.exec(f); if (m && T[m[1]]) files.push([t.d, m[1]]); }
  let done = 0;
  for (const [d, n] of files) {
    const a = require('./table.js').readCol(d, n, T[n]); if (a) writeCol(d, n, a);
    if (post) post({ done: ++done, total: files.length, id: 'colz' });
  }
}

function doRowMigrations(dir, post) {
  const mf = path.join(dir, 'meta.json'), meta = JSON.parse(fs.readFileSync(mf, 'utf8'));
  const todo = MIGRATIONS.filter(m => pending(meta).includes(m.id));
  if (!todo.length) return { done: [] };
  const g = path.join(dir, meta.colDir), tables = [{ d: g, n: meta.count || 0, hero: true }];
  if (meta.opp && meta.opp.rows) tables.push({ d: path.join(g, 'opp'), n: meta.opp.rows, hero: false });
  const z = meta.rpz === 2 ? 2 : !!meta.rpz;
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
  const { BlockReader } = require('./blockreader.js'), br = new BlockReader(dir); // чтение крупными окнами по порядку файла
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
          const b = br.get(t.rpp[i], t.rpo[i], t.rpl[i]);
          let rec = null; try { rec = decodeRec(b, z, dir); } catch (e) { /* запись повреждена */ }
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
  } finally { br.close(); }
  return { done: todo.map(m => m.id), rows: total };
}

// в фоновом потоке: окно программы не замирает; onProgress({done,total})
function run(dir, onProgress) {
  return new Promise((resolve, reject) => {
    const w = new Worker(__filename, { workerData: { dir, migrate: true } });
    w.on('message', (m) => { if (m.type === 'progress') { if (onProgress) onProgress(m); } else if (m.type === 'done') resolve(m.res); else if (m.type === 'error') reject(new Error(m.msg)); });
    w.on('error', reject);
    w.on('exit', (c) => { if (c) reject(new Error('обновление базы прервано (' + c + ')')); });
  });
}

if (!isMainThread && workerData && workerData.migrate && workerData.dir) {
  doMigrate(workerData.dir, (p) => parentPort.postMessage(Object.assign({ type: 'progress' }, p)))
    .then((res) => parentPort.postMessage({ type: 'done', res }))
    .catch((e) => parentPort.postMessage({ type: 'error', msg: e && e.stack || String(e) }));
}

module.exports = { pending, run, doMigrate, ALL_IDS, fcbOf, antOf };
