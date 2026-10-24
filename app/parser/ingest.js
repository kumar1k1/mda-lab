'use strict';
// Загрузка историй в базу формата mdalab-cols-v3: ваши раздачи и раздачи всех соперников за столом.
//
// Одна операция на оба случая: новые раздачи вливаются в существующую базу (дозагрузка)
// или в пустую (полная загрузка). Шаги:
//   1. разбор файлов параллельно по ядрам (parse-worker.js); раздачи принимаются строго в порядке файлов,
//      повторы (номер раздачи + турнир) отсеиваются по отпечаткам уже лежащих в базе раздач;
//   2. строки пишутся в колонки прямо на диск, ход раздачи для реплеера — сжатым, один на раздачу;
//   3. новые строки упорядочиваются (ваши — по дате, соперников — по игроку и дате) и сливаются
//      со старой таблицей потоком в новое поколение колонок;
//   4. EV считается для новых строк параллельно по ядрам (для ваших — с тем же зерном, что и раньше);
//   5. meta.json переключается на новое поколение одной записью — сбой посреди загрузки не портит базу.
//
// Папка базы:
//   meta.json, rp_<n>.dat (записи реплеера, сжаты deflate-raw, только дописываются),
//   g<N>/c_*.bin (ваши раздачи, по дате), g<N>/opp/c_*.bin (раздачи соперников, по игроку и дате),
//   g<N>/opp/players.json — игроки: ник, рум, где начинаются его строки и сколько их.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { SCHEMA, ReplayWriter, HashSet53, typedFrom } = require('./store.js');
const { SpillColumn, ColumnReader, mergePlan, mergeColumn, permute, patchColumn, colFile } = require('./table.js');
const { computeEv, STRIDE } = require('./ev-pool.js');

const FORMAT = 'mdalab-cols-v3';
// колонки ваших раздач: статы + ссылка на запись реплеера + отпечаток раздачи
const HERO_SCHEMA = SCHEMA.concat([['rpp', 'i32'], ['rpo', 'u32'], ['rpl', 'u32'], ['key', 'f64']]);
// колонки раздач соперников: статы + игрок, его место в раздаче, ссылка на запись реплеера, отпечаток раздачи
const OPP_SCHEMA = SCHEMA.concat([['pid', 'i32'], ['seat', 'i8'], ['rpp', 'i32'], ['rpo', 'u32'], ['rpl', 'u32'], ['key', 'f64']]);

// значения строки по записи игрока (тот же набор и порядок, что SCHEMA); месяц и день — абсолютные
function rowVals(h, roomIdx) {
  const y = +h.date.slice(0, 4), m = +h.date.slice(5, 7), d = +h.date.slice(8, 10);
  return {
    room: roomIdx, type: h.pko, month: y * 12 + m - 1, tbl: h.tblMax && h.tblMax <= 6 ? 6 : 9, pos: h.pos, bb: h.bb,
    sit: h.sit, lim: h.lim, act: h.act, size: h.size, fti: h.fti, bvb: h.bvb, fvr: h.fvr, day: Math.round(Date.UTC(y, m - 1, d) / 864e5),
    hc: h.hc, net: h.net, sto: h.sto, f3b: h.f3b, orsp: h.orsp, bmin: h.bmin, sbs: h.sbs, bbs: h.bbs, bh: h.bh, bsh: h.bsh, bmd: h.bmd,
    bdp: h.bdp, cov: h.cov, bi: h.bi, rz: h.rz, cl: h.cl, rai: h.rai, opos: h.opos, ostk: h.ostk, osz: h.osz, nev: h.net,
    hpa: h.hpa || 0, tmx: h.tblMax || 0, np: h.n || 0, lr: h.lr || 0
  };
}
const monthOfDay = (day) => { const d = new Date(day * 864e5); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };
const day0OfMonth = (mAbs) => Math.round(Date.UTC(Math.floor(mAbs / 12), mAbs % 12, 1) / 864e5);
// зерно EV для строки соперника: от отпечатка раздачи и места — не зависит от порядка строк и дозагрузок
const oppSeed = (key, seat) => (Math.floor(key) % 2147483629) + 1 + seat * 7919;

// открыть существующую базу v3 для дозагрузки
function openOld(dir) {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  if (meta.format !== FORMAT) throw new Error('база старого формата — для дозагрузки её нужно один раз пересобрать');
  const g = path.join(dir, meta.colDir), og = path.join(g, 'opp');
  const players = JSON.parse(fs.readFileSync(path.join(og, 'players.json'), 'utf8'));
  return { meta, g, og, heroN: meta.count, oppN: meta.opp.rows, players };
}

// Разбор файлов по ядрам; onHand(hand) вызывается строго в порядке файлов
async function parseParallel(files, heroes, onHand, onFile, threads) {
  const { Worker } = require('worker_threads');
  const P = Math.max(1, threads || Math.min(8, Math.max(1, (os.cpus() || []).length - 1)));
  let next = 0, want = 0, errors = 0; const ready = new Map();
  await new Promise((resolve, reject) => {
    const ws = []; let alive = 0, failed = false;
    const drain = () => {
      while (ready.has(want)) {
        const r = ready.get(want); ready.delete(want);
        errors += r.errors; for (const h of r.hands) onHand(h);
        want++; if (onFile) onFile(want, files.length);
      }
      if (want >= files.length && !failed) { ws.forEach(w => w.postMessage({ type: 'stop' })); resolve(); }
    };
    const feed = (w) => { if (next < files.length && ready.size < P * 8) w.postMessage({ fi: next++ }); else w.idle = true; };
    if (!files.length) return resolve();
    for (let t = 0; t < P; t++) {
      const w = new Worker(path.join(__dirname, 'parse-worker.js'), { workerData: { files, heroes: [...heroes] } });
      ws.push(w); alive++;
      w.on('message', (m) => { ready.set(m.fi, m); drain(); feed(w); ws.forEach(x => { if (x.idle && next < files.length && ready.size < P * 8) { x.idle = false; feed(x); } }); });
      w.on('error', (e) => { if (!failed) { failed = true; reject(e); } });
      feed(w); feed(w); // по два файла в работе на поток
    }
  });
  return errors;
}

// Главная операция. dir — папка базы: пустая (полная загрузка) или существующая v3 (дозагрузка).
async function ingest(files, nicks, alias, dir, onProgress, opts) {
  opts = opts || {};
  const prog = (stage, done, total, hands) => { if (onProgress) onProgress(done, total, hands, stage); };
  fs.mkdirSync(dir, { recursive: true });
  const old = fs.existsSync(path.join(dir, 'meta.json')) ? openOld(dir) : null;
  const rooms = old ? old.meta.rooms.slice() : [];
  const nicksAll = Object.assign({}, old ? old.meta.nicks : {}, nicks);
  for (const r of Object.values(nicks)) if (!rooms.includes(r)) rooms.push(r);
  const heroes = new Set(Object.keys(nicksAll));
  const seen = new HashSet53(old ? old.heroN : 0);
  if (old) { const r = new ColumnReader(colFile(old.g, 'key'), 'f64', old.heroN); for (let i = 0; i < old.heroN; i++) seen.add(r.get(i)); r.close(); }
  const players = old ? old.players.map(p => ({ n: p.n, r: p.r, c: p.c, sh: p.sh || 0 })) : [];
  const pmap = new Map(players.map((p, i) => [p.r + '\u0001' + p.n, i]));

  const tmp = path.join(dir, 'tmp-ingest'); fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(path.join(tmp, 'opp'), { recursive: true });
  const H = {}, O = {};
  for (const [nm, t] of HERO_SCHEMA) H[nm] = new SpillColumn(colFile(tmp, nm), nm, t);
  for (const [nm, t] of OPP_SCHEMA) O[nm] = new SpillColumn(colFile(path.join(tmp, 'opp'), nm), nm, t);
  const rpw = new ReplayWriter(dir, opts.partSize, old ? old.meta.rpParts : 0);
  let dup = 0, nH = 0, nO = 0;

  // 1–2. разбор и раскладка по колонкам
  const errors = await parseParallel(files, heroes, (h) => {
    if (!seen.add(h.k)) { dup++; return; }
    const roomIdx = rooms.indexOf(nicksAll[h.hero.hero]);
    const ref = h.rpz ? rpw.addRaw(Buffer.from(h.rpz.buffer, h.rpz.byteOffset, h.rpz.byteLength)) : null;
    const hv = rowVals(h.hero, roomIdx);
    for (const [nm] of SCHEMA) H[nm].push(hv[nm]);
    const hr = h.heroRp && ref && h.hero.hc >= 0; // как раньше: запись реплеера у вашей раздачи — в ваших спотах и с вашими картами
    H.rpp.push(hr ? ref[0] : -1); H.rpo.push(hr ? ref[1] : 0); H.rpl.push(hr ? ref[2] : 0); H.key.push(h.k);
    nH++;
    for (const o of h.opps) {
      const pk = roomIdx + '\u0001' + o.hero;
      let pid = pmap.get(pk); if (pid == null) { pid = players.length; players.push({ n: o.hero, r: roomIdx, c: 0, sh: 0 }); pmap.set(pk, pid); }
      const ov = rowVals(o, roomIdx);
      for (const [nm] of SCHEMA) O[nm].push(ov[nm]);
      const orr = o.needRp && ref;
      O.pid.push(pid); O.seat.push(o.seatIdx); O.rpp.push(orr ? ref[0] : -1); O.rpo.push(orr ? ref[1] : 0); O.rpl.push(orr ? ref[2] : 0); O.key.push(h.k);
      nO++;
    }
  }, (d, t) => prog('parse', d, t, nH), opts.parseThreads);
  rpw.close();
  for (const c of Object.values(H)) c.close();
  for (const c of Object.values(O)) c.close();
  if (!nH) { fs.rmSync(tmp, { recursive: true, force: true }); if (!old) fs.rmSync(dir, { recursive: true, force: true }); return { hands: 0, added: 0, dup, errors, rooms, opp: 0, players: players.length }; }

  // начало периода: самый ранний месяц среди старых и новых раздач
  const dayNew = H.day.readAll();
  let minDay = Infinity; for (let i = 0; i < nH; i++) if (dayNew[i] < minDay) minDay = dayNew[i];
  const oldM0 = old ? (+old.meta.periodStart.slice(0, 4)) * 12 + (+old.meta.periodStart.slice(5, 7)) - 1 : Infinity;
  const m0 = Math.min(oldM0, monthOfDay(minDay)), day0 = day0OfMonth(m0);
  const oldDayShift = old ? day0OfMonth(oldM0) - day0 : 0, oldMonShift = old ? oldM0 - m0 : 0;

  const gen = (old ? +old.meta.colDir.slice(1) : 0) + 1, gdir = path.join(dir, 'g' + gen), godir = path.join(gdir, 'opp');
  fs.rmSync(gdir, { recursive: true, force: true }); fs.mkdirSync(godir, { recursive: true });
  const fixMonth = [(v) => v + oldMonShift, (v) => v - m0], fixDay = [(v) => v + oldDayShift, (v) => v - day0];
  const fix = (nm) => (nm === 'month' ? fixMonth : nm === 'day' ? fixDay : [null, null]);

  // 3а. ваши раздачи: новые по дате (при равной — в порядке файлов), старые раньше новых того же дня
  prog('merge', 0, 2, nH);
  const hPerm = new Uint32Array(nH); for (let i = 0; i < nH; i++) hPerm[i] = i;
  hPerm.sort((a, b) => dayNew[a] - dayNew[b] || a - b);
  const oldDayR = old ? new ColumnReader(colFile(old.g, 'day'), 'i32', old.heroN) : null;
  const hPlan = mergePlan(old ? old.heroN : 0, nH, (i, j) => oldDayR.get(i) + day0OfMonth(oldM0) <= dayNew[hPerm[j]]);
  if (oldDayR) oldDayR.close();
  for (const [nm, t] of HERO_SCHEMA) {
    const a = nm === 'day' ? permute(dayNew, hPerm) : permute(H[nm].readAll(), hPerm);
    const [fo, fn] = fix(nm);
    mergeColumn(old && old.g, old ? old.heroN : 0, nm, t, a, hPlan, gdir, fo, fn);
  }
  // 3б. соперники: по игроку, затем по дате
  prog('merge', 1, 2, nH);
  const pidNew = O.pid.readAll(), odayNew = O.day.readAll();
  const oPerm = new Uint32Array(nO); for (let i = 0; i < nO; i++) oPerm[i] = i;
  oPerm.sort((a, b) => pidNew[a] - pidNew[b] || odayNew[a] - odayNew[b] || a - b);
  let oPlan;
  {
    const oN = old ? old.oppN : 0, pr = oN ? new ColumnReader(colFile(old.og, 'pid'), 'i32', oN) : null, dr = oN ? new ColumnReader(colFile(old.og, 'day'), 'i32', oN) : null;
    const od0 = old ? day0OfMonth(oldM0) : 0;
    oPlan = mergePlan(oN, nO, (i, j) => { const p = pr.get(i), q = pidNew[oPerm[j]]; return p < q || (p === q && dr.get(i) + od0 <= odayNew[oPerm[j]]); });
    if (pr) { pr.close(); dr.close(); }
  }
  for (const [nm, t] of OPP_SCHEMA) {
    const a = nm === 'pid' ? permute(pidNew, oPerm) : nm === 'day' ? permute(odayNew, oPerm) : permute(O[nm].readAll(), oPerm);
    const [fo, fn] = fix(nm);
    mergeColumn(old && old.og, old ? old.oppN : 0, nm, t, a, oPlan, godir, fo, fn);
  }

  // 4. EV для новых строк — по их местам после слияния
  const jobs = [], where = []; // where: [таблица 0/1, позиция]
  const addJobs = (table, plan, perm, cols, seedOf) => {
    const hc = cols.hc.readAll(), rpp = cols.rpp.readAll(), rpo = cols.rpo.readAll(), rpl = cols.rpl.readAll(), key = cols.key.readAll(), seat = cols.seat ? cols.seat.readAll() : null;
    for (let k = 0, j = 0; k < plan.length; k++) {
      if (!plan[k]) continue;
      const o = perm[j++];
      if (rpp[o] < 0 || hc[o] < 0) continue;
      jobs.push(k, rpp[o], rpo[o], rpl[o], seedOf(k, key[o], seat ? seat[o] : -1), seat ? seat[o] : -1); where.push(table, k);
    }
  };
  addJobs(0, hPlan, hPerm, H, (k) => k + 1); // ваши — как раньше: номер раздачи после сортировки
  addJobs(1, oPlan, oPerm, O, (k, key, seat) => oppSeed(key, seat));
  const J = Float64Array.from(jobs);
  const ev = await computeEv(dir, J, { z: true, threads: opts.threads, onTick: (d, t) => prog('ev', d, t, nH) });
  for (const [table, gd] of [[0, gdir], [1, godir]]) {
    const pos = [], val = [];
    for (let q = 0; q < ev.length; q++) {
      if (where[q * 2] !== table || Number.isNaN(ev[q])) continue;
      pos.push(where[q * 2 + 1]);
    }
    if (!pos.length) continue;
    const net = typedFrom(fs.readFileSync(colFile(gd, 'net')), 'f64');
    for (let q = 0; q < ev.length; q++) { if (where[q * 2] !== table || Number.isNaN(ev[q])) continue; const k = where[q * 2 + 1]; val.push(Math.round((net[k] / 10 + ev[q]) * 1000) / 100); }
    patchColumn(gd, 'nev', 'f64', pos, val);
  }

  // 5. игроки: где начинаются строки каждого и сколько их (строки упорядочены по номеру игрока)
  const cnt = new Float64Array(players.length);
  { const r = new ColumnReader(colFile(godir, 'pid'), 'i32', (old ? old.oppN : 0) + nO); for (let i = 0; i < (old ? old.oppN : 0) + nO; i++) cnt[r.get(i)]++; r.close(); }
  const hcO = new ColumnReader(colFile(godir, 'hc'), 'i16', (old ? old.oppN : 0) + nO), shown = new Float64Array(players.length);
  { const r = new ColumnReader(colFile(godir, 'pid'), 'i32', (old ? old.oppN : 0) + nO); for (let i = 0; i < (old ? old.oppN : 0) + nO; i++) if (hcO.get(i) >= 0) shown[r.get(i)]++; r.close(); hcO.close(); }
  let start = 0;
  const plist = players.map((p, i) => { const o = { n: p.n, r: p.r, s: start, c: cnt[i], sh: shown[i] }; start += cnt[i]; return o; });
  fs.writeFileSync(path.join(godir, 'players.json'), JSON.stringify(plist));

  const meta = {
    format: FORMAT, demo: false, hero: alias || (old ? old.meta.hero : Object.keys(nicks)[0]), nicks: nicksAll, rooms, types: ['Обычный', 'PKO'],
    periodStart: Math.floor(m0 / 12) + '-' + String(m0 % 12 + 1).padStart(2, '0'), count: (old ? old.heroN : 0) + nH,
    cols: SCHEMA.slice(), colDir: 'g' + gen, opp: { rows: (old ? old.oppN : 0) + nO, players: plist.length }, rpParts: rpw.parts, rpz: 1
  };
  const mt = path.join(dir, 'meta.json.tmp'); fs.writeFileSync(mt, JSON.stringify(meta)); fs.renameSync(mt, path.join(dir, 'meta.json'));
  if (old) fs.rmSync(old.g, { recursive: true, force: true });
  fs.rmSync(tmp, { recursive: true, force: true });
  return { hands: meta.count, added: nH, dup, errors, rooms, opp: meta.opp.rows, oppAdded: nO, players: plist.length };
}

// Полная загрузка в новую папку
async function buildBase(files, nicks, alias, outDir, onProgress, opts) {
  fs.rmSync(outDir, { recursive: true, force: true });
  return ingest(files, nicks, alias, outDir, onProgress, opts);
}

module.exports = { ingest, buildBase, FORMAT, HERO_SCHEMA, OPP_SCHEMA, oppSeed };
