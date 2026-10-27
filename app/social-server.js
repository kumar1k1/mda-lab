'use strict';
// Сервер чата MDA Lab: аккаунты, кто в сети, друзья, сообщения и скриншоты.
// На время разработки он работает внутри самой программы: на одном компьютере включается «Этот компьютер — сервер»,
// остальные копии подключаются к нему по адресу в локальной сети. Потом этот же файл без изменений запускается
// на арендованном сервере (node social-server.js <папка данных> [порт]) — программам нужно поменять только адрес.
// Только встроенные модули Node: http, crypto, fs.
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VER = 1, PORT = 47810;
const MAX_IMG = 3 * 1024 * 1024, MAX_BODY = 6 * 1024 * 1024, MAX_TEXT = 2000;

function make(dir, opts) {
  opts = opts || {};
  fs.mkdirSync(path.join(dir, 'img'), { recursive: true });
  const dbf = path.join(dir, 'db.json');
  let D = { users: [], tokens: {}, friends: [], requests: [], msgs: [], seq: 0 };
  try { D = Object.assign(D, JSON.parse(fs.readFileSync(dbf, 'utf8'))); } catch (e) { /* новая база */ }
  let saveT = null;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(saveNow, 300); };
  const saveNow = () => { clearTimeout(saveT); saveT = null; try { fs.writeFileSync(dbf + '.tmp', JSON.stringify(D)); fs.renameSync(dbf + '.tmp', dbf); } catch (e) { /* следующая запись */ } };

  // ---- пароли и входы: пароль — только хэш scrypt с солью, ключ входа хранится как sha256 ----
  const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
  const hashPass = (p, salt) => crypto.scryptSync(p, salt, 32).toString('hex');
  const newId = () => 'u' + crypto.randomBytes(6).toString('hex');
  const issue = (u) => { const t = crypto.randomBytes(32).toString('hex'); D.tokens[sha(t)] = { u: u.id, t: Date.now() }; save(); return t; };
  const byId = (id) => D.users.find(u => u.id === id);
  const byNick = (n) => D.users.find(u => u.nickL === String(n || '').toLowerCase());
  const authOf = (req, url) => {
    const m = /^Bearer\s+(\w+)$/.exec(req.headers.authorization || ''), t = m ? m[1] : url.searchParams.get('token') || '';
    const r = t && D.tokens[sha(t)]; return r ? byId(r.u) : null;
  };

  // ---- кто в сети: открытые соединения событий ----
  const conns = new Map(); // uid → Set(res)
  const online = (u) => !!(conns.get(u.id) && conns.get(u.id).size) && u.showOnline !== false;
  const push = (uid, kind, data) => { const s = conns.get(uid); if (!s) return; const line = 'data: ' + JSON.stringify(Object.assign({ kind }, data || {})) + '\n\n'; for (const r of s) { try { r.write(line); } catch (e) { /* закрыто */ } } };
  const pushAll = (kind, data) => { for (const uid of conns.keys()) push(uid, kind, data); };

  // ---- друзья ----
  const pair = (a, b) => a < b ? a + '|' + b : b + '|' + a;
  const isFriend = (a, b) => D.friends.includes(pair(a, b));
  const reqIdx = (from, to) => D.requests.findIndex(r => r[0] === from && r[1] === to);

  const pub = (u, me) => {
    const fr = me && isFriend(me.id, u.id);
    return { id: u.id, nick: u.nick, online: online(u), seen: online(u) ? Date.now() : (u.showOnline === false ? 0 : u.seen || u.since), status: online(u) ? (u.status || '') : '', since: u.since, nicks: fr && u.showNicks ? u.nicks || null : null };
  };
  const meOf = (u) => ({ id: u.id, nick: u.nick, email: u.email || '', since: u.since, showOnline: u.showOnline !== false, openRequests: u.openRequests !== false, showNicks: !!u.showNicks, status: u.status || '' });
  const msgOut = (m, me) => ({ id: m.id, from: m.a === me.id ? 'me' : m.a, t: m.t, text: m.text || '', img: m.img ? '/img/' + m.img : null });

  function state(me) {
    const users = D.users.filter(u => u.id !== me.id).map(u => pub(u, me));
    const friends = D.friends.map(p => p.split('|')).filter(p => p.includes(me.id)).map(p => p[0] === me.id ? p[1] : p[0]);
    const requests = D.requests.filter(r => r[1] === me.id).map(r => r[0]), sent = D.requests.filter(r => r[0] === me.id).map(r => r[1]);
    const unread = {}, last = {};
    for (const m of D.msgs) {
      if (m.b === me.id) { if (!m.read) unread[m.a] = (unread[m.a] || 0) + 1; last[m.a] = msgOut(m, me); }
      else if (m.a === me.id) last[m.b] = msgOut(m, me);
    }
    return { me: meOf(me), users, friends, requests, sent, unread, last, server: { ver: VER, name: opts.name || '' } };
  }

  // ---- ответы ----
  const send = (res, code, obj) => { const b = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(b), 'Cache-Control': 'no-store' }); res.end(b); };
  const fail = (res, code, error) => send(res, code, { ok: false, error });
  const body = (req) => new Promise((resolve, reject) => {
    const parts = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > MAX_BODY) { reject(new Error('слишком большой запрос')); req.destroy(); } else parts.push(c); });
    req.on('end', () => { try { resolve(n ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {}); } catch (e) { reject(new Error('плохой запрос')); } });
    req.on('error', reject);
  });
  // попытки входа: не больше 10 за 5 минут с одного адреса
  const tries = new Map();
  const limited = (ip) => { const t = Date.now(), a = (tries.get(ip) || []).filter(x => t - x < 300e3); a.push(t); tries.set(ip, a); return a.length > 10; };

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x'), p = url.pathname, ip = req.socket.remoteAddress || '';
    if (req.method === 'GET' && p === '/ping') return send(res, 200, { ok: true, mda: 'social', ver: VER, users: D.users.length, name: opts.name || '' });
    if (req.method === 'POST' && (p === '/register' || p === '/login')) {
      if (limited(ip)) return fail(res, 429, 'Слишком много попыток — подождите несколько минут');
      const b = await body(req), nick = String(b.nick || '').trim(), pass = String(b.pass || '');
      if (p === '/register') {
        if (!/^[A-Za-z0-9_]{3,20}$/.test(nick)) return fail(res, 400, 'Никнейм: 3–20 символов, латинские буквы, цифры и _');
        if (pass.length < 8) return fail(res, 400, 'Пароль — не меньше 8 символов');
        if (byNick(nick)) return fail(res, 409, 'Ник ' + nick + ' уже занят');
        const email = String(b.email || '').trim().slice(0, 120);
        const salt = crypto.randomBytes(16).toString('hex');
        const u = { id: newId(), nick, nickL: nick.toLowerCase(), salt, hash: hashPass(pass, salt), email, since: Date.now(), seen: Date.now() };
        D.users.push(u); const token = issue(u); pushAll('users');
        return send(res, 200, { ok: true, token, me: meOf(u) });
      }
      const u = byNick(nick);
      if (!u || !crypto.timingSafeEqual(Buffer.from(hashPass(pass, u.salt), 'hex'), Buffer.from(u.hash, 'hex'))) return fail(res, 401, 'Неверный ник или пароль');
      return send(res, 200, { ok: true, token: issue(u), me: meOf(u) });
    }
    if (req.method === 'GET' && p.startsWith('/img/')) {
      const me = authOf(req, url); if (!me) return fail(res, 401, 'Нужно войти');
      const name = p.slice(5); if (!/^[a-f0-9]{32}\.(jpg|png)$/.test(name)) return fail(res, 404, 'нет');
      const m = D.msgs.find(x => x.img === name); if (!m || (m.a !== me.id && m.b !== me.id)) return fail(res, 404, 'нет'); // картинку видят только двое из переписки
      const f = path.join(dir, 'img', name); if (!fs.existsSync(f)) return fail(res, 404, 'нет');
      res.writeHead(200, { 'Content-Type': name.endsWith('.png') ? 'image/png' : 'image/jpeg', 'Cache-Control': 'private, max-age=31536000' });
      return fs.createReadStream(f).pipe(res);
    }
    const me = authOf(req, url); if (!me) return fail(res, 401, 'Нужно войти');
    if (req.method === 'GET' && p === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write('retry: 3000\n\n');
      const was = online(me); if (!conns.has(me.id)) conns.set(me.id, new Set()); conns.get(me.id).add(res);
      if (!was) pushAll('presence', { id: me.id });
      push(me.id, 'hello');
      const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch (e) { /* закрыто */ } }, 25e3);
      req.on('close', () => {
        clearInterval(hb); const s = conns.get(me.id); if (s) { s.delete(res); if (!s.size) conns.delete(me.id); }
        if (!online(me)) { me.seen = Date.now(); save(); pushAll('presence', { id: me.id }); }
      });
      return;
    }
    if (req.method === 'GET' && p === '/state') return send(res, 200, Object.assign({ ok: true }, state(me)));
    if (req.method === 'GET' && p === '/msgs') {
      const w = url.searchParams.get('with'), out = D.msgs.filter(m => (m.a === me.id && m.b === w) || (m.a === w && m.b === me.id)).slice(-500).map(m => msgOut(m, me));
      return send(res, 200, { ok: true, msgs: out });
    }
    if (req.method !== 'POST') return fail(res, 404, 'нет такого адреса');
    const b = await body(req);
    if (p === '/logout') { const h = /^Bearer\s+(\w+)$/.exec(req.headers.authorization || ''); if (h) delete D.tokens[sha(h[1])]; save(); return send(res, 200, { ok: true }); }
    if (p === '/me') {
      if (b.email != null) me.email = String(b.email).trim().slice(0, 120);
      for (const k of ['showOnline', 'openRequests', 'showNicks']) if (b[k] != null) me[k] = !!b[k];
      if (b.status != null) me.status = String(b.status).slice(0, 60);
      if (b.nicks && typeof b.nicks === 'object') { const n = {}; Object.entries(b.nicks).slice(0, 30).forEach(([k, v]) => { n[String(k).slice(0, 40)] = String(v).slice(0, 30); }); me.nicks = n; }
      if (b.pass) {
        const o = String(b.pass.old || ''), nw = String(b.pass.new || '');
        if (hashPass(o, me.salt) !== me.hash) return fail(res, 400, 'Старый пароль неверный');
        if (nw.length < 8) return fail(res, 400, 'Новый пароль — не меньше 8 символов');
        me.salt = crypto.randomBytes(16).toString('hex'); me.hash = hashPass(nw, me.salt);
      }
      save(); pushAll('users'); return send(res, 200, { ok: true, me: meOf(me) });
    }
    if (p === '/friend') {
      const o = byId(b.id); if (!o || o.id === me.id) return fail(res, 404, 'Нет такого пользователя');
      const act = b.act;
      if (act === 'add') {
        if (isFriend(me.id, o.id)) return send(res, 200, { ok: true });
        const back = reqIdx(o.id, me.id);
        if (back >= 0) { D.requests.splice(back, 1); D.friends.push(pair(me.id, o.id)); } // встречная заявка — сразу друзья
        else { if (o.openRequests === false) return fail(res, 403, o.nick + ' не принимает заявки'); if (reqIdx(me.id, o.id) < 0) D.requests.push([me.id, o.id]); }
      } else if (act === 'accept') { const i = reqIdx(o.id, me.id); if (i < 0) return fail(res, 404, 'Заявки нет'); D.requests.splice(i, 1); if (!isFriend(me.id, o.id)) D.friends.push(pair(me.id, o.id)); }
      else if (act === 'decline') { const i = reqIdx(o.id, me.id); if (i >= 0) D.requests.splice(i, 1); }
      else if (act === 'cancel') { const i = reqIdx(me.id, o.id); if (i >= 0) D.requests.splice(i, 1); }
      else if (act === 'remove') D.friends = D.friends.filter(x => x !== pair(me.id, o.id));
      else return fail(res, 400, 'плохой запрос');
      save(); push(me.id, 'friends', { id: o.id }); push(o.id, 'friends', { id: me.id, act, nick: me.nick });
      return send(res, 200, { ok: true });
    }
    if (p === '/send') {
      const o = byId(b.to); if (!o) return fail(res, 404, 'Нет такого пользователя');
      if (!isFriend(me.id, o.id)) return fail(res, 403, 'Писать можно только друзьям');
      const text = String(b.text || '').slice(0, MAX_TEXT).trim(); let img = null;
      if (b.img) {
        const m = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(String(b.img)); if (!m) return fail(res, 400, 'Картинка — только JPEG или PNG');
        const buf = Buffer.from(m[2], 'base64'); if (buf.length > MAX_IMG) return fail(res, 413, 'Картинка больше 3 МБ');
        img = crypto.randomBytes(16).toString('hex') + (m[1] === 'png' ? '.png' : '.jpg'); fs.writeFileSync(path.join(dir, 'img', img), buf);
      }
      if (!text && !img) return fail(res, 400, 'Пустое сообщение');
      const msg = { id: ++D.seq, a: me.id, b: o.id, t: Date.now(), text, img, read: false };
      D.msgs.push(msg); save();
      push(o.id, 'msg', { from: me.id, nick: me.nick, text: text.slice(0, 80), img: !!img }); push(me.id, 'sent', { to: o.id });
      return send(res, 200, { ok: true, msg: msgOut(msg, me) });
    }
    if (p === '/read') { let n = 0; for (const m of D.msgs) if (m.a === b.with && m.b === me.id && !m.read) { m.read = true; n++; } if (n) save(); return send(res, 200, { ok: true }); }
    return fail(res, 404, 'нет такого адреса');
  }

  let srv = null;
  return {
    port: () => (srv && srv.address() ? srv.address().port : 0),
    start(port, bind) {
      return new Promise((resolve, reject) => {
        srv = http.createServer((req, res) => { handle(req, res).catch(e => { try { fail(res, 400, String(e.message || e)); } catch (x) { /* уже ответили */ } }); });
        srv.keepAliveTimeout = 65e3;
        srv.once('error', reject);
        srv.listen(port == null ? PORT : port, bind || '0.0.0.0', () => resolve(srv.address().port));
      });
    },
    stop() { saveNow(); for (const s of conns.values()) for (const r of s) { try { r.end(); } catch (e) { /* нет */ } } conns.clear(); return new Promise(r => (srv ? srv.close(() => r()) : r())); },
    stats: () => ({ users: D.users.length, online: [...conns.keys()].length, msgs: D.msgs.length })
  };
}

// адреса этого компьютера в локальной сети — их вводят на другом компьютере
function lanAddrs() {
  const out = []; const ifs = require('os').networkInterfaces();
  for (const [name, list] of Object.entries(ifs)) for (const a of list || []) if (a.family === 'IPv4' && !a.internal && !/^169\.254\./.test(a.address)) out.push({ ip: a.address, name });
  // сначала обычные домашние сети
  return out.sort((a, b) => (/^192\.168\./.test(b.ip) - /^192\.168\./.test(a.ip)) || (/^100\./.test(a.ip) - /^100\./.test(b.ip)));
}

module.exports = { make, lanAddrs, PORT, VER };

if (require.main === module) {
  const dir = process.argv[2] || path.join(process.cwd(), 'social-data'), port = +process.argv[3] || PORT;
  const s = make(dir, { name: 'MDA Lab' });
  s.start(port).then(p => console.log('MDA Lab social server on port', p, 'data in', dir));
}
