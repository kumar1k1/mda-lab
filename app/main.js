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
const { Worker } = require('worker_threads');
const { walk, addFile, scan } = require('./parser/build.js');
const baseDir = () => path.join(app.getPath('userData'), 'base');
const baseFile = (n) => path.join(baseDir(), n);
// при разработке (не в установленной программе) можно открыть базу из папки проекта
const devFile = (n) => (!app.isPackaged ? path.join(__dirname, 'data', n) : null);
function pickFile(name, devName) {
  const f = baseFile(name); if (fs.existsSync(f)) return f;
  const d = devFile(devName); return d && fs.existsSync(d) ? d : null;
}
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

ipcMain.handle('db:get', () => { const f = pickFile('hands.json', 'my-base.json'); return f ? readJson(f) : null; });
ipcMain.handle('db:replays', () => { const f = pickFile('replays.json', 'my-base-replays.json'); return f ? readJson(f) : {}; });
ipcMain.handle('db:demo', () => readJson(path.join(__dirname, 'data', 'demo-hands.json')));
ipcMain.handle('db:delete', () => { try { fs.rmSync(baseDir(), { recursive: true, force: true }); } catch (e) { /* нет базы */ } return true; });
ipcMain.handle('db:info', () => ({ stored: fs.existsSync(baseFile('hands.json')), folder: baseDir() }));

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
  fs.mkdirSync(baseDir(), { recursive: true });
  const tmpDb = baseFile('hands.tmp'), tmpRp = baseFile('replays.tmp');
  const w = new Worker(path.join(__dirname, 'import-worker.js'), { workerData: { files: lastFiles, nicks: opts.nicks, alias: opts.alias, outDb: tmpDb, outRp: tmpRp } });
  w.on('message', (m) => {
    if (m.type === 'progress') { if (!e.sender.isDestroyed()) e.sender.send('import:progress', m); return; }
    if (m.type === 'done' && m.hands) { fs.renameSync(tmpDb, baseFile('hands.json')); fs.renameSync(tmpRp, baseFile('replays.json')); }
    resolve(m);
  });
  w.on('error', (err) => resolve({ type: 'error', message: String(err && err.message || err) }));
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
