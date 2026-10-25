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
const { SCHEMA, ReplayWriter, HashSet53, typedFrom, hash53 } = require('./store.js');
const { SpillColumn, ColumnReader, mergePlan, mergeColumn, permute, patchColumn, colFile } = require('./table.js');
const { computeEv, STRIDE } = require('./ev-pool.js');

const FORMAT = 'mdalab-cols-v3';
// колонки ваших раздач: статы + ссылка на запись реплеера + отпечаток раздачи
// aid — номер алиаса (в базе может быть несколько игроков со своими никами: вы, друг…)
const HERO_SCHEMA = SCHEMA.concat([['rpp', 'i32'], ['rpo', 'u32'], ['rpl', 'u32'], ['key', 'f64'], ['aid', 'i16'], ['nk', 'i16']]);
// nk — номер ника героя в meta.heroNicks (у одного алиаса может быть несколько ников в одном руме)
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
    hpa: h.hpa || 0, tmx: h.tblMax || 0, np: h.n || 0, lr: h.lr || 0, ant: h.ant == null ? -1 : h.ant
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

// Разбор файлов по ядрам; onHand(hand) вызывается строго в порядке файлов (и порций внутри файла).
// Порции текущего файла обрабатываются сразу и подтверждаются; порции следующих файлов ждут своей очереди
// (их потоки стоят до подтверждения). Вперёд раздаётся не больше ~256 МБ файлов — память ограничена при любых объёмах.
async function parseParallel(files, heroes, onHand, onFile, threads, po) {
  const { Worker } = require('worker_threads');
  const { fileSize } = require('./build.js');
  const P = Math.max(1, threads || Math.min(8, Math.max(1, (os.cpus() || []).length - 1)));
  const size = files.map(f => { try { return fileSize(f); } catch (e) { return 0; } });
  const AHEAD = 256 * 1024 * 1024;
  let next = 0, want = 0, errors = 0, ahead = 0;
  const pending = new Map(); // fi -> [{m, w}] порции, ждущие своей очереди
  if (!files.length) return 0;
  await new Promise((resolve, reject) => {
    const ws = []; let failed = false, finished = false;
    const assign = () => {
      for (const w of ws) {
        while (w.load < 2 && next < files.length && (ahead < AHEAD || next === want)) { ahead += size[next]; w.load++; w.postMessage({ fi: next++ }); }
      }
    };
    const take = (m, w) => {
      errors += m.errors;
      const rb = m.rpzBuf;
      for (const h of m.hands) { h.rpz = h.rpzOff >= 0 ? Buffer.from(rb.buffer, rb.byteOffset + h.rpzOff, h.rpzLen) : null; onHand(h); }
      w.postMessage({ type: 'ack' });
      if (m.done) { ahead -= size[m.fi]; w.load--; want++; if (onFile) onFile(want, files.length); }
    };
    const drain = () => {
      for (;;) {
        const q = pending.get(want); if (!q || !q.length) break;
        const { m, w } = q.shift(); if (!q.length) pending.delete(m.fi);
        take(m, w);
      }
      if (want >= files.length && !finished) { finished = true; ws.forEach(w => w.postMessage({ type: 'stop' })); resolve(); return; }
      assign();
    };
    for (let t = 0; t < P; t++) {
      // предел памяти потока: без него движок копит мусор и раздувает память при больших файлах
      const w = new Worker(path.join(__dirname, 'parse-worker.js'), { workerData: { files, heroes: [...heroes], observer: !!(po && po.observer), exclude: po && po.exclude ? [...po.exclude] : [] }, resourceLimits: { maxOldGenerationSizeMb: 384, maxYoungGenerationSizeMb: 48 } });
      w.load = 0; ws.push(w);
      w.on('message', (m) => {
        if (m.fi === want) take(m, w); else { if (!pending.has(m.fi)) pending.set(m.fi, []); pending.get(m.fi).push({ m, w }); }
        drain();
      });
      w.on('error', (e) => { if (!failed) { failed = true; reject(e); } });
    }
    assign();
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
  for (const r of Object.values(nicks)) if (!rooms.includes(r)) rooms.push(r);
  // Алиасы: у каждого своё имя и свои ники. Все раздачи этой загрузки идут в алиас с введённым именем
  // (нет такого — создаётся новый). Один ник может быть у разных алиасов (GG в экспорте пишет всех «Hero»).
  // алиас: name, nicks (ваши ники — раздачи с вашими картами), off (ваши ники, убранные из алиаса редактором),
  // opp (игроки базы, добавленные в алиас), gone (распущен — номер aid не переиспользуется)
  const aliases = old ? (old.meta.aliases ? old.meta.aliases.map(a => Object.assign({}, a, { nicks: Object.assign({}, a.nicks), count: a.count || 0 }))
    : [{ name: old.meta.hero, nicks: Object.assign({}, old.meta.nicks), count: old.heroN }]) : [];
  const heroNicks = old ? (old.meta.heroNicks ? old.meta.heroNicks.slice() : [...new Set(aliases.flatMap(a => Object.keys(a.nicks)))]) : [];
  // без ников (датамайнинг, ваших карт нет) — алиас не создаётся: все игроки раздач идут в список соперников
  const observer = !Object.keys(nicks).length;
  const want = (alias || '').trim() || Object.keys(nicks)[0] || '';
  let target = observer ? -1 : aliases.findIndex(a => !a.gone && a.name.toLowerCase() === want.toLowerCase());
  if (!observer && target < 0) { aliases.push({ name: want, nicks: {}, count: 0 }); target = aliases.length - 1; }
  // ники, которые до этой загрузки уже были у других алиасов: та же раздача того же ника — повтор, даже под другим именем алиаса
  const prevOwners = new Map(); aliases.forEach((a, i) => { if (i !== target) for (const n of Object.keys(a.nicks)) { if (!prevOwners.has(n)) prevOwners.set(n, []); prevOwners.get(n).push(i); } });
  if (!observer) Object.assign(aliases[target].nicks, nicks);
  for (const n of Object.keys(nicks)) if (!heroNicks.includes(n)) heroNicks.push(n);
  const nkOf = new Map(heroNicks.map((n, i) => [n, i]));
  const nicksAll = {}; aliases.forEach((a, i) => { if (i !== target) Object.assign(nicksAll, a.nicks); }); Object.assign(nicksAll, nicks);
  const heroes = new Set(Object.keys(nicks)); // герой раздачи — только ники этой загрузки
  const others = new Set(Object.keys(nicksAll)); // ники всех алиасов — не соперники
  // повторы: ваша раздача — по (раздача, алиас): одну раздачу могут прислать и вы, и друг, если сидели за одним столом;
  // соперники раздачи — по самой раздаче, чтобы не задвоить их при второй истории той же раздачи
  const hk2 = (k, a) => (a ? hash53(k + '|' + a) : k);
  const seen = new HashSet53(old ? old.heroN : 0), handSeen = new HashSet53(old ? old.heroN : 0);
  if (old) {
    const r = new ColumnReader(colFile(old.g, 'key'), 'f64', old.heroN), ra = fs.existsSync(colFile(old.g, 'aid')) ? new ColumnReader(colFile(old.g, 'aid'), 'i16', old.heroN) : null;
    for (let i = 0; i < old.heroN; i++) { const k = r.get(i); seen.add(hk2(k, ra ? ra.get(i) : 0)); handSeen.add(k); }
    r.close(); if (ra) ra.close();
    // раздачи, загруженные без героя (датамайнинг), есть только среди строк соперников
    if (old.oppN) { const ro = new ColumnReader(colFile(old.og, 'key'), 'f64', old.oppN); for (let i = 0; i < old.oppN; i++) handSeen.add(ro.get(i)); ro.close(); }
  }
  const addedBy = new Float64Array(aliases.length);
  const players = old ? old.players.map(p => ({ n: p.n, r: p.r, c: p.c, sh: p.sh || 0 })) : [];
  const pmap = new Map(players.map((p, i) => [p.r + '\u0001' + p.n, i]));

  const tmp = path.join(dir, 'tmp-ingest'); fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(path.join(tmp, 'opp'), { recursive: true });
  const H = {}, O = {};
  for (const [nm, t] of HERO_SCHEMA) H[nm] = new SpillColumn(colFile(tmp, nm), nm, t);
  for (const [nm, t] of OPP_SCHEMA) O[nm] = new SpillColumn(colFile(path.join(tmp, 'opp'), nm), nm, t);
  const rpw = new ReplayWriter(dir, opts.partSize, old ? old.meta.rpParts : 0);
  let dup = 0, nH = 0, nO = 0, nD = 0;

  // 1–2. разбор и раскладка по колонкам
  const errors = await parseParallel(files, heroes, (h) => {
    if (!h.hero) { // раздача без героя: только соперники, если такой раздачи ещё нет в базе
      if (!handSeen.add(h.k)) { dup++; return; }
      let ri = rooms.indexOf(h.room); if (ri < 0) { rooms.push(h.room); ri = rooms.length - 1; }
      const ref = h.rpz && h.opps.some(o => o.needRp) ? rpw.addRaw(h.rpz) : null;
      addOpps(h, ri, ref); nD++;
      return;
    }
    const aid = target;
    const po = prevOwners.get(h.hero.hero);
    if (po && po.some(a => seen.has(hk2(h.k, a)))) { dup++; return; }
    if (!seen.add(hk2(h.k, aid))) { dup++; return; }
    const newHand = handSeen.add(h.k); // раздачи ещё не было в базе (ни у одного алиаса)
    const roomIdx = rooms.indexOf(nicksAll[h.hero.hero]);
    const needRef = h.rpz && (h.heroRp || (newHand && h.opps.some(o => o.needRp)));
    const ref = needRef ? rpw.addRaw(h.rpz) : null;
    const hv = rowVals(h.hero, roomIdx);
    for (const [nm] of SCHEMA) H[nm].push(hv[nm]);
    const hr = h.heroRp && ref && h.hero.hc >= 0; // как раньше: запись реплеера у вашей раздачи — в ваших спотах и с вашими картами
    H.rpp.push(hr ? ref[0] : -1); H.rpo.push(hr ? ref[1] : 0); H.rpl.push(hr ? ref[2] : 0); H.key.push(h.k); H.aid.push(aid); H.nk.push(nkOf.has(h.hero.hero) ? nkOf.get(h.hero.hero) : -1);
    nH++; addedBy[aid]++;
    if (newHand) addOpps(h, roomIdx, ref);
  }, (d, t) => prog('parse', d, t, nH + nD), opts.parseThreads, { observer, exclude: others });
  function addOpps(h, roomIdx, ref) {
    for (const o of h.opps) {
      if (others.has(o.hero)) continue; // другой ваш алиас за тем же столом — у него свои раздачи
      const pk = roomIdx + '\u0001' + o.hero;
      let pid = pmap.get(pk); if (pid == null) { pid = players.length; players.push({ n: o.hero, r: roomIdx, c: 0, sh: 0 }); pmap.set(pk, pid); }
      const ov = rowVals(o, roomIdx);
      for (const [nm] of SCHEMA) O[nm].push(ov[nm]);
      const orr = o.needRp && ref;
      O.pid.push(pid); O.seat.push(o.seatIdx); O.rpp.push(orr ? ref[0] : -1); O.rpo.push(orr ? ref[1] : 0); O.rpl.push(orr ? ref[2] : 0); O.key.push(h.k);
      nO++;
    }
  }
  rpw.close();
  for (const c of Object.values(H)) c.close();
  for (const c of Object.values(O)) c.close();
  if (!nH && !nO) { fs.rmSync(tmp, { recursive: true, force: true }); if (!old) fs.rmSync(dir, { recursive: true, force: true }); return { hands: old ? old.heroN : 0, added: 0, dup, errors, rooms, opp: old ? old.oppN : 0, oppAdded: 0, players: old ? old.players.length : 0, aliases: aliases.map(a => a.name) }; }

  // начало периода: самый ранний месяц среди старых и новых раздач
  const dayNew = H.day.readAll();
  let minDay = Infinity; for (let i = 0; i < nH; i++) if (dayNew[i] < minDay) minDay = dayNew[i];
  if (!nH) { const od = O.day.readAll(); for (let i = 0; i < nO; i++) if (od[i] < minDay) minDay = od[i]; } // только соперники
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
    mergeColumn(old && old.g, old ? old.heroN : 0, nm, t, a, hPlan, gdir, fo, fn, nm === 'nk' || nm === 'ant' ? -1 : 0); // ник и анте старых строк неизвестны (-1)
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
    mergeColumn(old && old.og, old ? old.oppN : 0, nm, t, a, oPlan, godir, fo, fn, nm === 'ant' ? -1 : 0);
  }

  // 4. EV для новых строк — по их местам после слияния. Колонки читаются кусками по порядку строк
  //    (не целиком), список расчётов — плотный массив: память не растёт с размером базы.
  const nTot = [(old ? old.heroN : 0) + nH, (old ? old.oppN : 0) + nO];
  const scan = (table, plan, gd, cb) => {
    const R = (n, t) => new ColumnReader(colFile(gd, n), t, nTot[table]);
    const hc = R('hc', 'i16'), rpp = R('rpp', 'i32'), rpo = R('rpo', 'u32'), rpl = R('rpl', 'u32'), key = R('key', 'f64'), seat = table ? R('seat', 'i8') : null;
    for (let k = 0; k < plan.length; k++) {
      if (!plan[k] || rpp.get(k) < 0 || hc.get(k) < 0) continue;
      cb(k, rpp.get(k), rpo.get(k), rpl.get(k), key.get(k), seat ? seat.get(k) : -1);
    }
    [hc, rpp, rpo, rpl, key].concat(seat ? [seat] : []).forEach(r => r.close());
  };
  let nJobs = 0; scan(0, hPlan, gdir, () => nJobs++); const nHeroJobs = nJobs; scan(1, oPlan, godir, () => nJobs++);
  const J = new Float64Array(nJobs * STRIDE); let q = 0;
  scan(0, hPlan, gdir, (k, p, o, l) => { J.set([k, p, o, l, k + 1, -1], q * STRIDE); q++; }); // ваши — как раньше: номер раздачи после сортировки
  scan(1, oPlan, godir, (k, p, o, l, key, seat) => { J.set([k, p, o, l, oppSeed(key, seat), seat], q * STRIDE); q++; });
  const ev = await computeEv(dir, J, { z: true, threads: opts.threads, onTick: (d, t) => prog('ev', d, t, nH) });
  // запись EV: итог раздачи + поправка; позиции идут по возрастанию — итог читается кусками
  for (const [table, gd, a0, a1] of [[0, gdir, 0, nHeroJobs], [1, godir, nHeroJobs, nJobs]]) {
    const pos = [], val = [], net = new ColumnReader(colFile(gd, 'net'), 'f64', nTot[table]);
    for (let j = a0; j < a1; j++) { if (Number.isNaN(ev[j])) continue; const k = J[j * STRIDE]; pos.push(k); val.push(Math.round((net.get(k) / 10 + ev[j]) * 1000) / 100); }
    net.close();
    if (pos.length) patchColumn(gd, 'nev', 'f64', pos, val);
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
    format: FORMAT, demo: false, hero: aliases.length ? aliases[0].name : '', nicks: nicksAll, aliases: aliases.map((a, i) => Object.assign({}, a, { count: a.count + addedBy[i] })), heroNicks, rooms, types: ['Обычный', 'PKO'],
    periodStart: Math.floor(m0 / 12) + '-' + String(m0 % 12 + 1).padStart(2, '0'), count: (old ? old.heroN : 0) + nH,
    cols: SCHEMA.concat([['aid', 'i16'], ['nk', 'i16']]), colDir: 'g' + gen, opp: { rows: (old ? old.oppN : 0) + nO, players: plist.length }, rpParts: rpw.parts, rpz: 1
  };
  const mt = path.join(dir, 'meta.json.tmp'); fs.writeFileSync(mt, JSON.stringify(meta)); fs.renameSync(mt, path.join(dir, 'meta.json'));
  if (old) fs.rmSync(old.g, { recursive: true, force: true });
  fs.rmSync(tmp, { recursive: true, force: true });
  return { hands: meta.count, added: nH, mined: nD, dup, errors, rooms, opp: meta.opp.rows, oppAdded: nO, players: plist.length, aliases: meta.aliases.map(a => a.name + ' (' + a.count + ')') };
}

// Очень большие загрузки идут группами по ~4 ГБ историй: первая группа создаёт базу (или дописывается),
// каждая следующая дописывается потоком. Так пиковая память зависит от размера группы, а не от общего объёма
// (на 3 ГБ за раз — ~1,5 ГБ памяти; с группами — не больше этого при любом объёме).
const GROUP = 4 * 1024 * 1024 * 1024;
async function ingestGrouped(files, nicks, alias, dir, onProgress, opts) {
  opts = opts || {};
  const { fileSize } = require('./build.js');
  const lim = opts.groupBytes || GROUP, groups = []; let cur = [], sz = 0;
  for (const f of files) { let b = 0; try { b = fileSize(f); } catch (e) { /* размер неизвестен */ } if (cur.length && sz + b > lim) { groups.push(cur); cur = []; sz = 0; } cur.push(f); sz += b; }
  if (cur.length || !groups.length) groups.push(cur);
  let done = 0, last = null; const sum = { added: 0, dup: 0, errors: 0, oppAdded: 0 };
  for (let g = 0; g < groups.length; g++) {
    const off = done;
    const r = await ingest(groups[g], nicks, alias, dir, (d, t, h, st) => { if (onProgress) onProgress(st === 'parse' ? off + d : d, st === 'parse' ? files.length : t, h, st, g + 1, groups.length); }, opts);
    done += groups[g].length; last = r;
    sum.added += r.added || 0; sum.dup += r.dup || 0; sum.errors += r.errors || 0; sum.oppAdded += r.oppAdded || 0;
  }
  return Object.assign({}, last, sum, { groups: groups.length });
}

// Полная загрузка в новую папку
async function buildBase(files, nicks, alias, outDir, onProgress, opts) {
  fs.rmSync(outDir, { recursive: true, force: true });
  return ingestGrouped(files, nicks, alias, outDir, onProgress, opts);
}

module.exports = { ingest, ingestGrouped, buildBase, FORMAT, HERO_SCHEMA, OPP_SCHEMA, oppSeed };
