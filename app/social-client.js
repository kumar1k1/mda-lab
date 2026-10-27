'use strict';
// Связь программы с сервером чата (social-server.js) — из главного процесса: окно программы само в сеть не ходит.
// Настройки в папке данных: social.json { server: 'адрес:порт', host: true/false, token (зашифрован средствами Windows) }.
// host — «этот компьютер — сервер»: сервер запускается внутри программы, а сама программа подключается к нему же.
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { safeStorage } = require('electron');
const S = require('./social-server.js');
// NET = false — пока без сети: аккаунты хранятся на этом компьютере (тот же сервер, но только для самой программы,
// адрес 127.0.0.1 — снаружи недоступен, брандмауэр не спрашивает). Выбор сервера и чат скрыты.
// NET = true — как в 0.7.11: «этот компьютер — сервер» / подключиться по адресу, чат. Аккаунты из папки social-server сохраняются.
const NET = false;

function make(userData, emit) {
  const file = path.join(userData, 'social.json');
  let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { /* первый запуск */ }
  const saveCfg = () => { fs.mkdirSync(userData, { recursive: true }); fs.writeFileSync(file, JSON.stringify(cfg)); };
  const enc = () => { try { return safeStorage.isEncryptionAvailable(); } catch (e) { return false; } };
  const getToken = () => { if (!cfg.tok) return ''; try { return cfg.tokEnc ? safeStorage.decryptString(Buffer.from(cfg.tok, 'base64')) : Buffer.from(cfg.tok, 'base64').toString('utf8'); } catch (e) { return ''; } };
  const setToken = (t) => { if (!t) { delete cfg.tok; delete cfg.tokEnc; } else { const e = enc(); cfg.tokEnc = e; cfg.tok = (e ? safeStorage.encryptString(t) : Buffer.from(t, 'utf8')).toString('base64'); } saveCfg(); };

  let host = null; // встроенный сервер
  let ready = null; // локальный режим: запуск сервера для этой программы
  const base = () => {
    if (!NET) return host ? new URL('http://127.0.0.1:' + host.port()) : null;
    let s = String(cfg.server || '').trim(); if (!s) return null;
    if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
    try { const u = new URL(s); if (!u.port && u.protocol === 'http:') u.port = String(S.PORT); return u; } catch (e) { return null; }
  };

  async function request(method, p, body, opt) {
    opt = opt || {};
    if (!NET) { try { await (ready || (ready = startLocal())); } catch (e) { ready = null; return { ok: false, error: 'Не удалось открыть хранилище аккаунтов: ' + e.message }; } }
    return new Promise((resolve) => {
      const b = base(); if (!b) return resolve({ ok: false, error: 'Сервер чата не выбран', noServer: true });
      const data = body ? Buffer.from(JSON.stringify(body)) : null, tok = opt.noAuth ? '' : getToken();
      const mod = b.protocol === 'https:' ? https : http;
      const req = mod.request({ hostname: b.hostname, port: b.port || (b.protocol === 'https:' ? 443 : 80), path: p, method, timeout: opt.timeout || 8000,
        headers: Object.assign({ Accept: 'application/json' }, data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}, tok ? { Authorization: 'Bearer ' + tok } : {}) }, (res) => {
        const parts = []; res.on('data', c => parts.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(parts);
          if (opt.raw) return resolve(res.statusCode === 200 ? { ok: true, buf, type: res.headers['content-type'] || 'image/jpeg' } : { ok: false });
          let j = null; try { j = JSON.parse(buf.toString('utf8')); } catch (e) { j = { ok: false, error: 'Ответ не от сервера MDA Lab' }; }
          if (res.statusCode === 401 && !opt.noAuth) { j.auth = false; }
          resolve(j);
        });
      });
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', (e) => resolve({ ok: false, offline: true, error: 'Нет связи с сервером ' + b.host + (e.code === 'ECONNREFUSED' ? ' — программа-сервер не запущена или не включён режим сервера' : e.message === 'timeout' || e.code === 'ETIMEDOUT' || e.code === 'EHOSTUNREACH' ? ' — компьютер недоступен (другая сеть или брандмауэр)' : '') }));
      if (data) req.write(data); req.end();
    });
  }

  // ---- поток событий: пока он открыт, сервер считает нас «в сети» ----
  let es = null, esTimer = null, connected = false, wantEvents = false, backoff = 2000;
  const setConn = (v, err) => { if (connected !== v || err) { connected = v; emit('conn', { connected: v, error: err || '' }); } };
  function openEvents() {
    closeEvents(true); wantEvents = true;
    const b = base(), tok = getToken(); if (!b || !tok) return;
    const mod = b.protocol === 'https:' ? https : http;
    const req = mod.request({ hostname: b.hostname, port: b.port, path: '/events', method: 'GET', headers: { Accept: 'text/event-stream', Authorization: 'Bearer ' + tok } }, (res) => {
      if (res.statusCode === 401) { setToken(''); setConn(false); emit('auth', { loggedOut: true }); res.resume(); return; }
      if (res.statusCode !== 200) { res.resume(); retry(); return; }
      backoff = 2000; setConn(true); let buf = '';
      res.setEncoding('utf8');
      res.on('data', (c) => {
        buf += c; let i;
        while ((i = buf.indexOf('\n\n')) >= 0) { const chunk = buf.slice(0, i); buf = buf.slice(i + 2); const d = chunk.split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6)).join('\n'); if (d) { try { emit('ev', JSON.parse(d)); } catch (e) { /* пропуск */ } } }
      });
      res.on('end', () => { setConn(false); retry(); });
      res.on('error', () => { setConn(false); retry(); });
    });
    req.on('error', (e) => { setConn(false, 'Нет связи с сервером ' + b.host); retry(); });
    req.end(); es = req;
  }
  function retry() { if (!wantEvents) return; clearTimeout(esTimer); esTimer = setTimeout(openEvents, backoff); backoff = Math.min(backoff * 2, 30e3); }
  function closeEvents(keepWant) { if (!keepWant) wantEvents = false; clearTimeout(esTimer); if (es) { try { es.destroy(); } catch (e) { /* нет */ } es = null; } }

  async function startHost() {
    if (host) return host.port();
    host = S.make(path.join(userData, 'social-server'), { name: require('os').hostname() });
    try { await host.start(cfg.port || S.PORT); } catch (e) { host = null; throw new Error(e.code === 'EADDRINUSE' ? 'Порт ' + (cfg.port || S.PORT) + ' занят — возможно, сервер уже запущен в другой копии программы' : String(e.message || e)); }
    return host.port();
  }
  async function startLocal() { if (host) return; host = S.make(path.join(userData, 'social-server'), { name: 'local' }); await host.start(0, '127.0.0.1'); }
  async function stopHost() { if (host) { await host.stop(); host = null; } }

  const status = () => ({ net: NET, server: cfg.server || '', host: !!cfg.host, hosting: NET && host ? { port: host.port(), addrs: S.lanAddrs().map(a => a.ip + (host.port() === S.PORT ? '' : ':' + host.port())), stats: host.stats() } : null, loggedIn: !!getToken(), connected });

  return {
    async init() {
      if (!NET) { ready = startLocal().catch(e => { ready = null; throw e; }); try { await ready; connected = true; } catch (e) { /* при запросе — ещё раз */ } return; }
      if (cfg.host) { try { await startHost(); } catch (e) { emit('conn', { connected: false, error: e.message }); } }
      if (getToken()) openEvents();
    },
    status,
    // выбор сервера: { host: true } — этот компьютер; { server: '192.168.1.5' } — другой
    async setServer(o) {
      if (!NET) return { ok: false, error: 'Подключение к серверу появится позже' };
      o = o || {}; const prev = cfg.server;
      if (o.host) {
        try { const port = await startHost(); cfg.host = true; cfg.server = '127.0.0.1:' + port; } catch (e) { return { ok: false, error: e.message }; }
      } else {
        const addr = String(o.server || '').trim(); if (!addr) return { ok: false, error: 'Введите адрес компьютера-сервера' };
        const old = cfg.server; cfg.server = addr;
        const p = await request('GET', '/ping', null, { noAuth: true, timeout: 5000 });
        if (!p || !p.mda) { cfg.server = old; return { ok: false, error: p && p.error ? p.error : 'По этому адресу нет сервера MDA Lab' }; }
        cfg.host = false; await stopHost();
      }
      if (prev !== cfg.server) { setToken(''); closeEvents(); setConn(false); } // у другого сервера — свои аккаунты
      saveCfg();
      return Object.assign({ ok: true }, status());
    },
    async call(method, p, body) {
      const auth = p === '/register' || p === '/login';
      const r = await request(method, p, body, { noAuth: auth, timeout: p === '/send' ? 30000 : 8000 });
      if (auth && r && r.ok && r.token) { setToken(r.token); delete r.token; if (NET) openEvents(); }
      if (r && r.auth === false) { setToken(''); closeEvents(); emit('auth', { loggedOut: true }); }
      return r;
    },
    async logout() { await request('POST', '/logout', {}); setToken(''); closeEvents(); if (NET) setConn(false); return { ok: true }; },
    async img(p) { if (!/^\/img\/[a-f0-9]{32}\.(jpg|png)$/.test(String(p))) return null; const r = await request('GET', p, null, { raw: true, timeout: 20000 }); return r.ok ? 'data:' + r.type + ';base64,' + r.buf.toString('base64') : null; },
    async quit() { closeEvents(); await stopHost(); }
  };
}
module.exports = { make };
