'use strict';
/* global generateDemoHands */
// Браузерная замена функций программы для онлайн-превью.
(function () {
  const SIGNS = [
    ['GGPoker', /^Poker Hand #(TM|HD|RC|SG|MT)/m],
    ['PokerStars', /^PokerStars (Hand|Zoom Hand|Home Game Hand) #/m],
    ['Winamax', /^Winamax Poker - /m],
    ['iPoker', /<session sessioncode=|^GAME #\d+: /m],
    ['888poker', /^#Game No : \d+|888poker Hand History/m],
    ['PartyPoker', /^\*{5} Hand History [Ff]or Game \d+/m],
    ['ACR / WPN', /^Game Hand #\d+ - Tournament #/m]
  ];
  async function sniff(files, source) {
    const rooms = {}; let bytes = 0, est = 0, unknown = 0, n = 0;
    for (const f of files) {
      if (!/\.(txt|xml|log|hh)$/i.test(f.name)) continue;
      n++; bytes += f.size;
      let head = '';
      try { head = (await f.slice(0, 4096).text()).replace(/^﻿/, ''); } catch (e) { continue; }
      const s = SIGNS.find(x => x[1].test(head));
      if (!s) { unknown++; continue; }
      rooms[s[0]] = rooms[s[0]] || { files: 0, bytes: 0 };
      rooms[s[0]].files++; rooms[s[0]].bytes += f.size; est += Math.round(f.size / 1500);
    }
    return { source, files: n, bytes, rooms, unknown, estHands: est };
  }
  function choose(folder) {
    return new Promise(resolve => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.multiple = true; inp.accept = '.txt,.xml,.log,.hh';
      if (folder) inp.webkitdirectory = true;
      inp.onchange = async () => {
        const files = Array.from(inp.files || []);
        if (!files.length) return resolve({ canceled: true });
        const root = folder && files[0].webkitRelativePath ? files[0].webkitRelativePath.split('/')[0] : files.length + ' файл(ов)';
        resolve(await sniff(files, root));
      };
      inp.click();
    });
  }
  let cache = null;
  window.mda = {
    db: async () => cache || (cache = (document.getElementById('myBase') ? JSON.parse(document.getElementById('myBase').textContent) : null)),
    demoDb: async () => generateDemoHands(),
    dbInfo: async () => ({ stored: false }),
    deleteDb: async () => true,
    runImport: async () => ({ error: 'в онлайн-превью загрузка не работает' }),
    onProgress: () => {},
    pick: (mode) => choose(mode === 'folder'),
    dropped: (files) => sniff(Array.from(files), files.length + ' файл(ов)'),
    replays: async () => { try { const r = await fetch('replays.json'); return r.ok ? await r.json() : {}; } catch (e) { return {}; } },
    version: async () => 'превью'
  };
})();
