'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('mda', {
  dbMeta: () => ipcRenderer.invoke('db:meta'),
  dbCol: (name) => ipcRenderer.invoke('db:col', name),
  replaysFor: (ids) => ipcRenderer.invoke('db:replays', Array.from(ids)),
  playersList: (q, limit) => ipcRenderer.invoke('players:list', q, limit),
  playerMeta: (pid) => ipcRenderer.invoke('player:meta', pid),
  playerCol: (pid, name) => ipcRenderer.invoke('player:col', pid, name),
  playerReplays: (pid, ids) => ipcRenderer.invoke('player:replays', pid, Array.from(ids)),
  demoDb: () => ipcRenderer.invoke('db:demo'),
  dbInfo: () => ipcRenderer.invoke('db:info'),
  deleteDb: () => ipcRenderer.invoke('db:delete'),
  runImport: (opts) => ipcRenderer.invoke('import:run', opts),
  estimate: (nicks) => ipcRenderer.invoke('import:estimate', nicks),
  baseLocation: () => ipcRenderer.invoke('base:location'),
  pickBaseDir: () => ipcRenderer.invoke('base:pick'),
  onProgress: (cb) => { ipcRenderer.removeAllListeners('import:progress'); ipcRenderer.on('import:progress', (_e, m) => cb(m)); },
  pick: (mode) => ipcRenderer.invoke('import:pick', mode),
  dropped: (files) => ipcRenderer.invoke('import:paths', Array.from(files).map(f => webUtils.getPathForFile(f))),
  version: () => ipcRenderer.invoke('app:version'),
  // только для автотестов: выбрать папку без диалога
  scanPathsForTest: (process.env.MDALAB_EVAL || process.env.MDALAB_SNAPSHOT) ? (paths) => ipcRenderer.invoke('import:paths', paths) : undefined
});
