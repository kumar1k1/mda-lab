'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let win = null;
// для автотестов: отдельная папка данных
if (process.env.MDALAB_USERDATA) app.setPath('userData', process.env.MDALAB_USERDATA);

// ---------- база ----------
// База игрока хранится только на его компьютере, в папке данных программы (не внутри программы),
// поэтому установщик уходит без чьих-либо раздач.
// Формат — папка колонок (parser/store.js): окно получает колонки по одной, записи реплеера — по номерам раздач,
// поэтому база в гигабайты не читается целиком и не упирается в память и длину строки.
const { Worker } = require('worker_threads');
const { walk, addFile, scan } = require('./parser/build.js');
const store = require('./parser/store.js');
// Где лежит база: папка «MDA Lab база» внутри места, которое выбрал игрок (по умолчанию — папка данных программы).
// Своя подпапка нужна, чтобы пересборка и удаление базы никогда не задевали чужие файлы в выбранном месте.
const BASE_NAME = 'MDA Lab база';
const cfgFile = () => path.join(app.getPath('userData'), 'config.json');
function readCfg() { try { return JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch (e) { return {}; } }
function writeCfg(c) { fs.mkdirSync(app.getPath('userData'), { recursive: true }); fs.writeFileSync(cfgFile(), JSON.stringify(c, null, 1)); }
const defaultBase = () => path.join(app.getPath('userData'), 'base');
const baseDir = () => readCfg().baseDir || defaultBase();
let PENDING_DIR = null; // место, выбранное для следующей загрузки
function freeBytes(dir) {
  let d = dir; while (d && !fs.existsSync(d)) { const up = path.dirname(d); if (up === d) break; d = up; }
  try { const st = fs.statfsSync(d); return st.bavail * st.bsize; } catch (e) { return null; }
}
const baseFile = (n) => path.join(baseDir(), n);
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

// перевод старой базы (hands.json + replays.json) в новый формат — один раз, значения не меняются
function migrateLegacy(srcDb, srcRp, dir) {
  const tmp = dir + '.migrate';
  store.writeFromLegacy(tmp, readJson(srcDb), srcRp && fs.existsSync(srcRp) ? readJson(srcRp) : {});
  return tmp;
}
let SRC = null; // открытая база: store.BaseDir
// Демо-игрок: готовая база из синтетических раздач (tools/build-demo.js) — открывается только для просмотра,
// ваша база при этом не трогается. Загрузка своей базы или перезапуск программы выходят из демо.
let DEMO = false;
const demoDir = () => path.join(__dirname, 'data', 'demo-base');
function source() {
  if (SRC) return SRC;
  if (DEMO) return store.BaseDir.exists(demoDir()) ? (SRC = new store.BaseDir(demoDir())) : null;
  const dir = baseDir();
  if (store.BaseDir.exists(dir)) return (SRC = new store.BaseDir(dir));
  if (fs.existsSync(baseFile('hands.json'))) { // база из прежней версии программы
    const tmp = migrateLegacy(baseFile('hands.json'), baseFile('replays.json'), dir);
    fs.rmSync(dir, { recursive: true, force: true }); fs.renameSync(tmp, dir);
    return (SRC = new store.BaseDir(dir));
  }
  // при разработке (не в установленной программе) — база из папки проекта, переведённая в новый формат
  if (!app.isPackaged) {
    const dev = path.join(__dirname, 'data', 'my-base.json'), devRp = path.join(__dirname, 'data', 'my-base-replays.json');
    if (fs.existsSync(dev)) {
      const cache = path.join(app.getPath('userData'), 'dev-base');
      if (!store.BaseDir.exists(cache) || fs.statSync(path.join(cache, 'meta.json')).mtimeMs < fs.statSync(dev).mtimeMs) {
        const tmp = migrateLegacy(dev, devRp, cache); fs.rmSync(cache, { recursive: true, force: true }); fs.renameSync(tmp, cache);
      }
      return (SRC = new store.BaseDir(cache));
    }
  }
  return null;
}

ipcMain.handle('db:meta', () => { const s = source(); return s ? s.meta : null; });
ipcMain.handle('db:col', (_e, name) => { const s = source(); return s ? s.colBytes(name) : null; });
ipcMain.handle('db:replays', (_e, ids) => { const s = source(); return s && Array.isArray(ids) ? s.replays(ids) : {}; });
// соперники (база v3): список с поиском, описание и колонки одного игрока, записи реплеера с его позиции
ipcMain.handle('players:list', (_e, q, limit) => { const s = source(); return s && s.v3 ? s.playerList(q, limit) : { total: 0, players: [] }; });
ipcMain.handle('player:meta', (_e, pid) => { const s = source(); return s && s.v3 ? s.playerMeta(pid) : null; });
ipcMain.handle('player:col', (_e, pid, name) => { const s = source(); return s && s.v3 ? s.playerCol(pid, name) : null; });
ipcMain.handle('players:find', (_e, list) => { const s = source(); return s && s.v3 && Array.isArray(list) ? s.playersFind(list) : []; });
// Редактор алиасов: новый список алиасов — в meta.json базы (одной записью). Раздачи не трогаются:
// алиас — это набор ников (ваших и игроков базы), статистика собирается из них при выборе.
// Номер алиаса (aid) у ваших раздач — позиция в списке, поэтому алиасы не удаляются, а помечаются gone.
ipcMain.handle('aliases:save', (_e, list) => {
  const s = source(); if (!s || !s.v3 || !Array.isArray(list)) return { error: 'База не открыта' };
  const cur = s.meta.aliases || [{ name: s.meta.hero, nicks: s.meta.nicks || {} }];
  if (list.length < cur.length) return { error: 'Алиасы нельзя удалять — только распускать' };
  const clean = list.map((a, i) => ({
    name: String(a.name || '').trim().slice(0, 40) || ('Алиас ' + (i + 1)),
    nicks: i < cur.length ? Object.assign({}, cur[i].nicks) : {}, // ваши ники меняет только загрузка
    count: i < cur.length ? cur[i].count || 0 : 0,
    off: Object.fromEntries(Object.keys(a.off || {}).filter(n => i < cur.length && cur[i].nicks && cur[i].nicks[n]).map(n => [n, 1])),
    opp: (Array.isArray(a.opp) ? a.opp : []).filter(o => o && typeof o.n === 'string' && typeof o.r === 'string').map(o => ({ n: o.n, r: o.r })),
    mine: (Array.isArray(a.mine) ? a.mine : []).filter(m => m && Number.isInteger(m.a) && m.a !== i && cur[m.a] && cur[m.a].nicks && cur[m.a].nicks[m.n]).map(m => ({ a: m.a, n: m.n })),
    gone: a.gone && !(i < cur.length && Object.keys(cur[i].nicks || {}).length) ? 1 : undefined
  }));
  for (const a of clean) if (!a.gone) a.mine = a.mine.filter(m => !clean[m.a].gone);
  const meta = Object.assign({}, s.meta, { aliases: clean });
  if (!DEMO) { const f = path.join(s.dir, 'meta.json'), t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(meta)); fs.renameSync(t, f); }
  s.meta = meta; // демо — только в памяти
  return { ok: true, aliases: clean };
});
ipcMain.handle('player:replays', (_e, pid, ids) => { const s = source(); return s && s.v3 && Array.isArray(ids) ? s.playerReplays(pid, ids) : {}; });
ipcMain.handle('db:demo', () => { if (!store.BaseDir.exists(demoDir())) return false; DEMO = true; SRC = null; return true; });
ipcMain.handle('db:delete', () => { SRC = null; DEMO = false; try { fs.rmSync(baseDir(), { recursive: true, force: true }); } catch (e) { /* нет базы */ } return true; });
ipcMain.handle('db:info', () => {
  const stored = store.BaseDir.exists(baseDir()) || fs.existsSync(baseFile('hands.json'));
  let canAppend = false, count = 0, opp = false;
  if (stored) { try { const m = readJson(baseFile('meta.json')); canAppend = m.format === require('./parser/ingest.js').FORMAT; count = m.count || 0; opp = !!m.opp; } catch (e) { /* старая база */ } }
  return { stored, folder: baseDir(), canAppend, count, opp };
});
// место для базы: текущее/выбранное и свободное место на этом диске
ipcMain.handle('base:location', () => { const d = PENDING_DIR || baseDir(); return { dir: d, free: freeBytes(d), isDefault: d === defaultBase() }; });
ipcMain.handle('base:pick', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Где хранить базу раздач', buttonLabel: 'Хранить здесь', properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths.length) return null;
  const parent = r.filePaths[0], d = path.basename(parent) === BASE_NAME ? parent : path.join(parent, BASE_NAME);
  PENDING_DIR = d; return { dir: d, free: freeBytes(d), isDefault: false };
});
// оценка до загрузки: образец историй в фоне — раздачи, место, время на этом компьютере
ipcMain.handle('import:estimate', (_e, nicks) => new Promise((resolve) => {
  if (!lastFiles.length) return resolve(null);
  const w = new Worker(path.join(__dirname, 'import-worker.js'), { workerData: { files: lastFiles, nicks: nicks || [], mode: 'estimate' } });
  w.on('message', (m) => { resolve(m.type === 'estimate' ? m : null); w.terminate(); });
  w.on('error', () => resolve(null));
}));

// ---------- импорт ----------
let lastFiles = [];
function prepare(files, source) { lastFiles = files; return Object.assign({ source }, scan(files)); }
ipcMain.handle('import:pick', async (_e, mode) => {
  const r = await dialog.showOpenDialog(win, {
    title: mode === 'folder' ? 'Выберите папку с историями раздач' : 'Выберите файлы историй раздач',
    properties: mode === 'folder' ? ['openDirectory'] : ['openFile', 'multiSelections'],
    filters: mode === 'folder' ? undefined : [{ name: 'Истории раздач и zip-архивы', extensions: ['txt', 'xml', 'hh', 'log', 'zip'] }]
  });
  if (r.canceled || !r.filePaths.length) return { canceled: true };
  const files = [];
  if (mode === 'folder') walk(r.filePaths[0], files, 2e6); else r.filePaths.forEach(p => addFile(p, files, 2e6));
  return prepare(files, mode === 'folder' ? r.filePaths[0] : files.length + ' файл(ов)');
});
ipcMain.handle('import:paths', (_e, paths) => {
  const files = [];
  (paths || []).forEach(p => { try { fs.statSync(p).isDirectory() ? walk(p, files, 2e6) : addFile(p, files, 2e6); } catch (e) { /* пропуск */ } });
  return prepare(files, (paths || []).length === 1 ? path.basename(paths[0]) : (paths || []).length + ' объектов');
});
// Загрузка: mode 'append' — дописать новые раздачи в текущую базу (повторы пропускаются),
// иначе — собрать новую базу во временной папке и заменить ею прежнюю только после успешной сборки.
ipcMain.handle('import:run', (e, opts) => new Promise((resolve) => {
  if (!lastFiles.length) return resolve({ error: 'Сначала выберите файлы' });
  const prev = baseDir();
  const append = opts.mode === 'append' && store.BaseDir.exists(prev);
  const dir = append ? prev : (PENDING_DIR || prev), tmp = dir + '.tmp', old = dir + '.old';
  try { fs.mkdirSync(path.dirname(dir), { recursive: true }); } catch (err) { return resolve({ error: 'Не удаётся создать папку для базы: ' + err.message }); }
  if (!append) fs.rmSync(tmp, { recursive: true, force: true });
  SRC = null; DEMO = false; // база будет меняться — закрываем; загрузка своей базы выходит из демо
  const w = new Worker(path.join(__dirname, 'import-worker.js'), { workerData: { files: lastFiles, nicks: opts.nicks, alias: opts.alias, outDir: append ? dir : tmp, mode: append ? 'append' : 'build' } });
  w.on('message', (m) => {
    if (m.type === 'progress') { if (!e.sender.isDestroyed()) e.sender.send('import:progress', m); return; }
    if (append) { SRC = null; PENDING_DIR = null; return resolve(m); }
    if (m.type === 'done' && m.hands) {
      SRC = null; fs.rmSync(old, { recursive: true, force: true });
      if (fs.existsSync(dir)) fs.renameSync(dir, old);
      fs.renameSync(tmp, dir); fs.rmSync(old, { recursive: true, force: true });
      // база переехала в новое место — старую убираем, новое запоминаем
      if (prev !== dir) { if (path.basename(prev) === BASE_NAME || prev === defaultBase()) fs.rmSync(prev, { recursive: true, force: true }); writeCfg(Object.assign(readCfg(), { baseDir: dir })); }
      PENDING_DIR = null;
    } else fs.rmSync(tmp, { recursive: true, force: true });
    resolve(m);
  });
  w.on('error', (err) => { if (!append) fs.rmSync(tmp, { recursive: true, force: true }); resolve({ type: 'error', message: String(err && err.message || err) }); });
}));
ipcMain.handle('app:version', () => app.getVersion());

function createWindow() {
  win = new BrowserWindow({
    width: 1380, height: 900, minWidth: 1080, minHeight: 680,
    backgroundColor: '#15171C',
    title: 'MDA Lab',
    icon: path.join(__dirname, 'renderer', 'icon.png'),
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  // Автопроверка: MDALAB_EVAL="выражение" — выполнить в окне, напечатать результат и выйти
  if (process.env.MDALAB_EVAL) {
    win.webContents.once('did-finish-load', async () => {
      await new Promise(r => setTimeout(r, 1500));
      try { console.log('EVAL:' + JSON.stringify(await win.webContents.executeJavaScript(process.env.MDALAB_EVAL))); } catch (e) { console.log('EVAL-ERROR:' + e.message); }
      app.quit();
    });
  }
  // Снимки экрана для проверки сборки: MDALAB_SNAPSHOT="js-выражение=файл.png;..."
  if (process.env.MDALAB_SNAPSHOT) {
    win.webContents.once('did-finish-load', async () => {
      await new Promise(r => setTimeout(r, 1500));
      for (const s of process.env.MDALAB_SNAPSHOT.split(';')) {
        const k = s.lastIndexOf('=');
        await win.webContents.executeJavaScript(s.slice(0, k));
        await new Promise(r => setTimeout(r, 700));
        fs.writeFileSync(s.slice(k + 1), (await win.webContents.capturePage()).toPNG());
      }
      app.quit();
    });
  }
}

app.whenReady().then(() => { Menu.setApplicationMenu(null); createWindow(); });
app.on('window-all-closed', () => app.quit());
