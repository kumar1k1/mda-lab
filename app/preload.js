'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('mda', {
  demoDb: () => ipcRenderer.invoke('db:demo'),
  replays: () => ipcRenderer.invoke('db:replays'),
  pick: (mode) => ipcRenderer.invoke('import:pick', mode),
  dropped: (files) => ipcRenderer.invoke('import:paths', Array.from(files).map(f => webUtils.getPathForFile(f))),
  version: () => ipcRenderer.invoke('app:version')
});
