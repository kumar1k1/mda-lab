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
  let LAST_BYTES = 0;
  async function sniff(files, source) {
    const rooms = {}, nickCnt = {}; let bytes = 0, est = 0, unknown = 0, n = 0;
    for (const f of files) {
      if (!/\.(txt|xml|log|hh)$/i.test(f.name)) continue;
      n++; bytes += f.size;
      let head = '';
      try { head = (await f.slice(0, 4096).text()).replace(/^﻿/, ''); } catch (e) { continue; }
      const s = SIGNS.find(x => x[1].test(head));
      if (!s) { unknown++; continue; }
      rooms[s[0]] = rooms[s[0]] || { files: 0, bytes: 0 };
      rooms[s[0]].files++; rooms[s[0]].bytes += f.size; est += Math.round(f.size / 1500);
      const dm = head.match(/^Dealt to (.+?) \[/m); if (dm) nickCnt[dm[1] + '|' + s[0]] = (nickCnt[dm[1] + '|' + s[0]] || 0) + 1;
    }
    const nicks = Object.entries(nickCnt).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, hits]) => { const [nick, room] = k.split('|'); return { nick, room: room === 'ACR / WPN' ? 'WPN' : room, hits }; });
    LAST_BYTES = bytes;
    return { source, files: n, bytes, rooms, unknown, estHands: est, nicks };
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
  // база превью — та же папка колонок, что в программе (preview/base): описание, колонки, записи реплеера частями
  const BASE = 'base/';
  // записи реплеера: части (сжатые deflate-raw в базе v3 или текст в старом формате), с позиции нужного игрока
  const inflate = async (u8) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  const asSeat = (rec, seat) => {
    if (seat == null || seat < 0 || seat === rec.h) return rec;
    const sh = Object.assign({}, rec.sh || {}); if (rec.hc && sh[rec.h] == null) sh[rec.h] = rec.hc;
    return Object.assign({}, rec, { h: seat, hc: sh[seat] || null, sh, pl: rec.pl.map((p, j) => [p[0], p[1], j === seat ? 1 : 0, p[3]]) });
  };
  async function readRecs(refs) {
    const m = await window.mda.dbMeta(), z = !!(m && m.rpz), out = {}, dec = new TextDecoder();
    for (const [i, p, off, len, seat] of refs) {
      let part = PARTS.get(p);
      if (!part) { part = z ? b64('rpz_' + p) : fetch(BASE + 'rp_' + p + '.txt').then(r => r.arrayBuffer()).then(b => new Uint8Array(b)); PARTS.set(p, part); }
      try { let u = (await part).subarray(off, off + len); if (z) u = await inflate(u); out[i] = asSeat(JSON.parse(dec.decode(u)), seat); } catch (e) { /* часть не загрузилась */ }
    }
    return out;
  }
  let PL = null; const CHUNKS = new Map();
  const players = async () => { if (!PL) { try { const r = await fetch(BASE + 'players.json'); PL = r.ok ? await r.json() : []; } catch (e) { PL = []; } } return PL; };
  const oppChunk = (k) => { let c = CHUNKS.get(k); if (!c) { c = fetch(BASE + 'opp_' + k + '.b64.json').then(r => r.json()).then(j => { const cols = {}; for (const n in j.cols) { const t = atob(j.cols[n]), u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i); cols[n] = u; } return { start: j.start, cols }; }); CHUNKS.set(k, c); } return c; };
  const b64 = async (f) => { const r = await fetch(BASE + f + '.b64.json'); if (!r.ok) return null; const t = atob(await r.json()), u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i); return u; };
  let META, IDX = null; const PARTS = new Map();
  window.mda = {
    dbMeta: async () => { if (META !== undefined) return META; try { const r = await fetch(BASE + 'meta.json'); META = r.ok ? await r.json() : null; } catch (e) { META = null; } return META; },
    dbCol: async (name) => { try { return await b64('c_' + name + '.bin'); } catch (e) { return null; } },
    replaysFor: async (ids) => {
      if (!IDX) { try { const u = await b64('rp.idx'); IDX = u ? new DataView(u.buffer) : new DataView(new ArrayBuffer(0)); } catch (e) { IDX = new DataView(new ArrayBuffer(0)); } }
      const refs = [];
      for (const i of ids) { if (!(i >= 0 && (i + 1) * 12 <= IDX.byteLength)) continue; const p = IDX.getInt32(i * 12, true); if (p >= 0) refs.push([i, p, IDX.getUint32(i * 12 + 4, true), IDX.getUint32(i * 12 + 8, true), -1]); }
      return readRecs(refs);
    },
    // соперники (база v3)
    playersList: async (q, limit) => {
      const P = await players(); const s = (q || '').trim().toLowerCase(), out = [];
      for (let i = 0; i < P.length; i++) if (P[i][2] && (!s || P[i][0].toLowerCase().includes(s))) out.push(i);
      out.sort((a, b) => P[b][2] - P[a][2] || (P[a][0] < P[b][0] ? -1 : 1));
      return { total: out.length, players: out.slice(0, limit || 100).map(i => ({ pid: i, name: P[i][0], room: P[i][1], count: P[i][2], shown: P[i][3] })) };
    },
    playerMeta: async (pid) => {
      const P = await players(), p = P[pid]; if (!p) return null; const m = await window.mda.dbMeta();
      return { format: m.format, demo: false, hero: p[0], nicks: { [p[0]]: m.rooms[p[1]] }, rooms: m.rooms, types: m.types, periodStart: m.periodStart, count: p[2], cols: m.cols, pid, opponent: true };
    },
    playerCol: async (pid, name) => {
      const P = await players(), p = P[pid], m = await window.mda.dbMeta(); if (!p) return null;
      const t = (m.oppCols || []).find(c => c[0] === name); const ch = await oppChunk(p[4]); if (!t || !ch.cols[name]) return null;
      const bpe = { i8: 1, i16: 2, i32: 4, u32: 4, f64: 8 }[t[1]];
      return ch.cols[name].slice(p[5] * bpe, (p[5] + p[2]) * bpe);
    },
    playerReplays: async (pid, ids) => {
      const P = await players(), p = P[pid]; if (!p) return {}; const ch = await oppChunk(p[4]);
      const dv = (n) => new DataView(ch.cols[n].buffer); const rp = dv('rpp'), ro = dv('rpo'), rl = dv('rpl'), st = ch.cols.seat;
      const refs = [];
      for (const i of ids) { if (!(i >= 0 && i < p[2])) continue; const r = p[5] + i, pp = rp.getInt32(r * 4, true); if (pp >= 0) refs.push([i, pp, ro.getUint32(r * 4, true), rl.getUint32(r * 4, true), new Int8Array(st.buffer)[r]]); }
      return readRecs(refs);
    },
    demoDb: async () => generateDemoHands(),
    // в превью — примерная оценка по объёму (в программе — замер на образце ваших историй)
    estimate: async () => { const b = LAST_BYTES || 1; const cpus = navigator.hardwareConcurrency || 4, threads = Math.max(1, Math.min(8, cpus - 1)); const hands = Math.round(b / 1411); return { totalBytes: b, sampleBytes: Math.min(b, 16777216), hands, bytes: Math.round(hands * 230), seconds: Math.round(b / 14e6 + hands * 0.22 * 4.2 / 1000 / threads + 2), threads, cpus }; },
    baseLocation: async () => ({ dir: 'C:\\Users\\Игрок\\AppData\\Roaming\\MDA Lab\\base', free: 412e9 }),
    pickBaseDir: async () => ({ dir: 'D:\\Poker\\MDA Lab база', free: 1.6e12 }),
    dbInfo: async () => ({ stored: false }),
    deleteDb: async () => true,
    runImport: async () => ({ error: 'в онлайн-превью загрузка не работает' }),
    onProgress: () => {},
    pick: (mode) => choose(mode === 'folder'),
    dropped: (files) => sniff(Array.from(files), files.length + ' файл(ов)'),
    version: async () => 'превью'
  };
})();
