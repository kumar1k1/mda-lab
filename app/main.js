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
function source() {
  if (SRC) return SRC;
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
ipcMain.handle('db:demo', () => readJson(path.join(__dirname, 'data', 'demo-hands.json')));
ipcMain.handle('db:delete', () => { SRC = null; try { fs.rmSync(baseDir(), { recursive: true, force: true }); } catch (e) { /* нет базы */ } return true; });
ipcMain.handle('db:info', () => ({ stored: store.BaseDir.exists(baseDir()) || fs.existsSync(baseFile('hands.json')), folder: baseDir() }));
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
// сборка выбранных файлов с указанными никами; новая база заменяет прежнюю только после успешной сборки
ipcMain.handle('import:run', (e, opts) => new Promise((resolve) => {
  if (!lastFiles.length) return resolve({ error: 'Сначала выберите файлы' });
  const prev = baseDir(), dir = PENDING_DIR || prev, tmp = dir + '.tmp', old = dir + '.old';
  try { fs.mkdirSync(path.dirname(dir), { recursive: true }); } catch (err) { return resolve({ error: 'Не удаётся создать папку для базы: ' + err.message }); }
  fs.rmSync(tmp, { recursive: true, force: true });
  const w = new Worker(path.join(__dirname, 'import-worker.js'), { workerData: { files: lastFiles, nicks: opts.nicks, alias: opts.alias, outDir: tmp } });
  w.on('message', (m) => {
    if (m.type === 'progress') { if (!e.sender.isDestroyed()) e.sender.send('import:progress', m); return; }
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
  w.on('error', (err) => { fs.rmSync(tmp, { recursive: true, force: true }); resolve({ type: 'error', message: String(err && err.message || err) }); });
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
