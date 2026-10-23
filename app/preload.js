'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('mda', {
  db: () => ipcRenderer.invoke('db:get'),
  demoDb: () => ipcRenderer.invoke('db:demo'),
  dbInfo: () => ipcRenderer.invoke('db:info'),
  deleteDb: () => ipcRenderer.invoke('db:delete'),
  runImport: (opts) => ipcRenderer.invoke('import:run', opts),
  onProgress: (cb) => { ipcRenderer.removeAllListeners('import:progress'); ipcRenderer.on('import:progress', (_e, m) => cb(m)); },
  replays: () => ipcRenderer.invoke('db:replays'),
  pick: (mode) => ipcRenderer.invoke('import:pick', mode),
  dropped: (files) => ipcRenderer.invoke('import:paths', Array.from(files).map(f => webUtils.getPathForFile(f))),
  version: () => ipcRenderer.invoke('app:version'),
  // только для автотестов: выбрать папку без диалога
  scanPathsForTest: (process.env.MDALAB_EVAL || process.env.MDALAB_SNAPSHOT) ? (paths) => ipcRenderer.invoke('import:paths', paths) : undefined
});
