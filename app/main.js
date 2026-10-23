'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let win = null;

// ---------- база ----------
function loadDemo() {
  const mine = path.join(__dirname, 'data', 'my-base.json');
  const file = fs.existsSync(mine) ? mine : path.join(__dirname, 'data', 'demo-hands.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// ---------- импорт: поиск файлов и определение рума ----------
const ROOM_SIGNS = [
  { room: 'GGPoker', re: /^Poker Hand #(TM|HD|RC|SG|MT)/m },
  { room: 'PokerStars', re: /^PokerStars (Hand|Zoom Hand|Home Game Hand) #/m },
  { room: 'Winamax', re: /^Winamax Poker - /m },
  { room: 'iPoker', re: /<session sessioncode=|^GAME #\d+: /m },
  { room: '888poker', re: /^#Game No : \d+|888poker Hand History/m },
  { room: 'PartyPoker', re: /^\*{5} Hand History [Ff]or Game \d+/m },
  { room: 'ACR / WPN', re: /^Game Hand #\d+ - Tournament #/m },
  { room: 'iPoker (XML)', re: /<\?xml[\s\S]{0,200}<session/m }
];

function walk(dir, out, limit) {
  let list;
  try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const d of list) {
    if (out.length >= limit) return;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, out, limit);
    else if (/\.(txt|xml|log|hh)$/i.test(d.name)) out.push(p);
  }
}

function sniff(files) {
  const rooms = {};
  let bytes = 0, hands = 0, unknown = 0;
  for (const f of files) {
    let st; try { st = fs.statSync(f); } catch (e) { continue; }
    bytes += st.size;
    let head = '';
    try {
      const fd = fs.openSync(f, 'r'); const buf = Buffer.alloc(4096); const n = fs.readSync(fd, buf, 0, 4096, 0); fs.closeSync(fd);
      head = buf.slice(0, n).toString('utf8').replace(/^﻿/, '');
    } catch (e) { continue; }
    const sign = ROOM_SIGNS.find(s => s.re.test(head));
    if (!sign) { unknown++; continue; }
    rooms[sign.room] = rooms[sign.room] || { files: 0, bytes: 0 };
    rooms[sign.room].files++; rooms[sign.room].bytes += st.size;
    hands += Math.round(st.size / 1500); // грубая оценка до разбора
  }
  return { files: files.length, bytes, rooms, unknown, estHands: hands };
}

ipcMain.handle('db:demo', () => loadDemo());
ipcMain.handle('db:replays', () => { const f = path.join(__dirname, 'data', 'my-base-replays.json'); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {}; });
ipcMain.handle('import:pick', async (_e, mode) => {
  const r = await dialog.showOpenDialog(win, {
    title: mode === 'folder' ? 'Выберите папку с историями раздач' : 'Выберите файлы историй раздач',
    properties: mode === 'folder' ? ['openDirectory'] : ['openFile', 'multiSelections'],
    filters: mode === 'folder' ? undefined : [{ name: 'Истории раздач', extensions: ['txt', 'xml', 'hh', 'log'] }]
  });
  if (r.canceled || !r.filePaths.length) return { canceled: true };
  const files = [];
  if (mode === 'folder') walk(r.filePaths[0], files, 200000); else files.push(...r.filePaths);
  return Object.assign({ source: mode === 'folder' ? r.filePaths[0] : (files.length + ' файл(ов)') }, sniff(files));
});
ipcMain.handle('import:paths', (_e, paths) => {
  const files = [];
  (paths || []).forEach(p => { try { fs.statSync(p).isDirectory() ? walk(p, files, 200000) : files.push(p); } catch (e) { /* пропуск */ } });
  return Object.assign({ source: files.length + ' файл(ов)' }, sniff(files));
});
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
