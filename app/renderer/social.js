'use strict';
// Аккаунт, «Личный кабинет → Мои данные» и чат с друзьями.
// В программе всё идёт через сервер чата (social-server.js): его запускает одна из копий программы («этот компьютер —
// сервер»), остальные подключаются по адресу. В превью (без программы) — демо-данные в этом окне.
// Интерфейс говорит с данными только через объект API ниже.
(function () {
  const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };
  const ico = (d, s) => '<svg width="' + (s || 18) + '" height="' + (s || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  // хранилище окна; если браузер его не даёт (превью в чужом окне) — память этой страницы, чтобы вход не терялся
  const MEM = {};
  const LS = { get(k, d) { try { const v = localStorage.getItem(k); if (v != null) return JSON.parse(v); } catch (e) { /* ниже */ } return k in MEM ? MEM[k] : d; }, set(k, v) { MEM[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* только память */ } } };
  const now = () => Date.now(), MIN = 60e3, H = 3600e3;
  const COLORS = ['#F2B544', '#6EC3E8', '#7FD7A2', '#F08A7E', '#A99BF5', '#E9C46A', '#5CC8E6', '#F0A35E'];
  const colorOf = (s) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
  const ago = (t) => { const d = now() - t; return d < 2 * MIN ? 'только что' : d < H ? Math.round(d / MIN) + ' мин назад' : d < 24 * H ? Math.round(d / H) + ' ч назад' : Math.round(d / 24 / H) + ' дн. назад'; };
  const hhmm = (t) => new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  // ---------- данные (демо) ----------
  const SEED = () => {
    const t = now();
    return {
      users: [
        { id: 'u1', nick: 'AceHunter', online: true, status: 'играет 4 стола', seen: t },
        { id: 'u2', nick: 'RiverRat_by', online: true, status: 'в сети', seen: t },
        { id: 'u3', nick: 'Kotik_MTT', online: false, status: '', seen: t - 2 * H },
        { id: 'u4', nick: 'ShortStackPro', online: true, status: 'разбирает раздачи', seen: t },
        { id: 'u5', nick: 'BluffMaster', online: false, status: '', seen: t - 26 * H },
        { id: 'u6', nick: 'GrindQueen', online: false, status: '', seen: t - 35 * MIN },
        { id: 'u7', nick: 'ICM_Wizard', online: true, status: 'в сети', seen: t },
        { id: 'u8', nick: 'Fold2Win', online: false, status: '', seen: t - 5 * 24 * H }
      ],
      friends: ['u1', 'u3', 'u4'], requests: ['u7'], sent: [],
      chats: {
        u1: [{ from: 'u1', t: t - 50 * MIN, text: 'Привет! Глянь раздачу, я тут на ривере олл-ин блефанул 🙈' }, { from: 'me', t: t - 48 * MIN, text: 'Кидай скрин из реплеера' }, { from: 'u1', t: t - 47 * MIN, img: 'demo', text: '' }, { from: 'u1', t: t - 46 * MIN, text: 'Вот, A9s против 77 на K-7-5-8-2' }],
        u4: [{ from: 'u4', t: t - 3 * H, text: 'Сколько у тебя фолд на 3-бет в PKO?' }]
      },
      unread: { u1: 2 }
    };
  };
  let D = LS.get('mda.social.demo', null) || SEED(); const saveD = () => LS.set('mda.social.demo', D);
  const API = {
    account: () => LS.get('mda.account', null),
    register: async (nick, email) => { const a = { nick, email: email || '', since: now(), rooms: {} }; LS.set('mda.account', a); return { ok: true, account: a }; },
    login: async (nick) => { const a = LS.get('mda.account', null) || { nick, email: '', since: now() }; a.nick = nick; LS.set('mda.account', a); return { ok: true, account: a }; },
    logout: () => { delete MEM['mda.account']; try { localStorage.removeItem('mda.account'); } catch (e) { /* нет */ } },
    update: (patch) => { const a = Object.assign(API.account() || {}, patch); LS.set('mda.account', a); return a; },
    users: () => D.users, user: (id) => D.users.find(u => u.id === id),
    friends: () => D.friends.map(API.user).filter(Boolean), requests: () => D.requests.map(API.user).filter(Boolean),
    isFriend: (id) => D.friends.includes(id), isSent: (id) => D.sent.includes(id),
    addFriend: (id) => { if (!D.sent.includes(id)) D.sent.push(id); saveD(); setTimeout(() => { D.sent = D.sent.filter(x => x !== id); if (!D.friends.includes(id)) D.friends.push(id); saveD(); redraw(); }, 2500); }, // в демо заявку принимают через 2,5 с
    accept: (id) => { D.requests = D.requests.filter(x => x !== id); if (!D.friends.includes(id)) D.friends.push(id); saveD(); },
    decline: (id) => { D.requests = D.requests.filter(x => x !== id); saveD(); },
    removeFriend: (id) => { D.friends = D.friends.filter(x => x !== id); saveD(); },
    messages: (id) => D.chats[id] || [], unread: (id) => (D.unread[id] || 0), unreadAll: () => Object.values(D.unread).reduce((a, b) => a + b, 0),
    markRead: (id) => { delete D.unread[id]; saveD(); },
    send: (id, msg) => { (D.chats[id] = D.chats[id] || []).push(Object.assign({ from: 'me', t: now() }, msg)); saveD();
      const u = API.user(id); if (u && u.online) setTimeout(() => { (D.chats[id] = D.chats[id] || []).push({ from: id, t: now(), text: msg.img ? 'Вижу скрин, сейчас гляну 👀' : 'Ок 👍' }); if (CUR !== id || panel.hidden) D.unread[id] = (D.unread[id] || 0) + 1; saveD(); redraw(); }, 1800); }
  };

  // ---------- настоящие данные: сервер чата через главный процесс ----------
  // ONLINE = false — пока только аккаунт (хранится на этом компьютере): без выбора сервера, чата и друзей.
  // true — вернуть всё из 0.7.11 (в паре с NET в social-client.js).
  const ONLINE = false;
  const R = window.mda && window.mda.social;
  const REAL = !!R;
  const ST = { st: null, me: null, users: [], friends: [], requests: [], sent: [], unread: {}, last: {}, chats: {}, conn: false, err: '' };
  const IMG = {}; // путь картинки на сервере → data:URL
  let refT = null;
  function refresh() {
    clearTimeout(refT);
    refT = setTimeout(async () => {
      await loadState(); redraw();
    }, 60);
  }
  async function loadState() {
    const r = await R.call('GET', '/state');
    try { ST.st = await R.status(); } catch (e) { /* прежний */ }
    if (r && r.ok) { Object.assign(ST, { me: r.me, users: r.users, friends: r.friends, requests: r.requests, sent: r.sent, unread: r.unread, last: r.last }); LS.set('mda.social.me', r.me); }
    else if (r && r.auth === false) loggedOut();
    return r;
  }
  async function loadMsgs(id) { const r = await R.call('GET', '/msgs?with=' + encodeURIComponent(id)); if (r && r.ok) { ST.chats[id] = r.msgs; if (CUR === id && !panel.hidden) redraw(); } }
  function loggedOut() { Object.assign(ST, { me: null, users: [], friends: [], requests: [], sent: [], unread: {}, last: {}, chats: {} }); LS.set('mda.social.me', null); }
  const fr = async (id, act) => { const r = await R.call('POST', '/friend', { id, act }); if (!r || !r.ok) toast((r && r.error) || 'Не получилось'); refresh(); return r; };
  const RAPI = {
    account: () => ST.me,
    register: async (nick, email, pass) => { const r = await R.call('POST', '/register', { nick, pass, email }); if (r && r.ok) { ST.me = r.me; refresh(); } return r; },
    login: async (nick, pass) => { const r = await R.call('POST', '/login', { nick, pass }); if (r && r.ok) { ST.me = r.me; refresh(); } return r; },
    logout: async () => { await R.logout(); loggedOut(); },
    update: async (patch) => { const r = await R.call('POST', '/me', patch); if (r && r.ok) ST.me = r.me; else toast((r && r.error) || 'Не сохранилось'); return r; },
    users: () => ST.users, user: (id) => ST.users.find(u => u.id === id),
    friends: () => ST.friends.map(RAPI.user).filter(Boolean), requests: () => ST.requests.map(RAPI.user).filter(Boolean),
    isFriend: (id) => ST.friends.includes(id), isSent: (id) => ST.sent.includes(id),
    addFriend: (id) => fr(id, 'add'), accept: (id) => fr(id, 'accept'), decline: (id) => fr(id, 'decline'), removeFriend: (id) => fr(id, 'remove'),
    messages: (id) => ST.chats[id] || [], last: (id) => ST.last[id] || null,
    unread: (id) => ST.unread[id] || 0, unreadAll: () => Object.values(ST.unread).reduce((a, b) => a + b, 0),
    markRead: (id) => { if (ST.unread[id]) { delete ST.unread[id]; R.call('POST', '/read', { with: id }); } },
    send: async (id, msg) => {
      const tmp = Object.assign({ from: 'me', t: now(), pending: true }, msg); (ST.chats[id] = ST.chats[id] || []).push(tmp); redraw();
      const r = await R.call('POST', '/send', { to: id, text: msg.text || '', img: msg.img || null });
      if (!r || !r.ok) { ST.chats[id] = (ST.chats[id] || []).filter(m => m !== tmp); toast((r && r.error) || 'Сообщение не отправлено'); redraw(); return; }
      if (msg.img && r.msg && r.msg.img) IMG[r.msg.img] = msg.img; // своя картинка уже есть — не скачивать
      loadMsgs(id); refresh();
    }
  };
  API.last = (id) => (API.messages(id).slice(-1)[0] || null);
  const A = REAL ? RAPI : API;
  if (REAL) {
    R.on((kind, d) => {
      if (kind === 'conn') { ST.conn = !!d.connected; ST.err = d.error || ''; if (ST.conn) refresh(); else redraw(); return; }
      if (kind === 'auth') { loggedOut(); redraw(); return; }
      if (kind !== 'ev' || !d) return;
      if (d.kind === 'msg') {
        if (CUR === d.from && !panel.hidden && document.hasFocus()) { loadMsgs(d.from); R.call('POST', '/read', { with: d.from }); }
        else { toast(d.nick + ': ' + (d.img ? '📷 скриншот' : d.text)); if (CUR === d.from) loadMsgs(d.from); }
      } else if (d.kind === 'sent' && CUR === d.to) loadMsgs(d.to);
      else if (d.kind === 'friends' && d.act === 'add' && d.nick) toast(ST.friends.includes(d.id) ? d.nick + ' теперь в друзьях' : d.nick + ' хочет добавить вас в друзья');
      else if (d.kind === 'friends' && d.act === 'accept' && d.nick) toast(d.nick + ' принял(а) заявку — теперь вы друзья');
      refresh();
    });
  }
  function setImg(im, src) {
    if (src === 'demo') im.src = DEMO_IMG;
    else if (/^\/img\//.test(src)) { if (IMG[src]) im.src = IMG[src]; else if (REAL) R.img(src).then(d => { if (d) { IMG[src] = d; im.src = d; } }); }
    else im.src = src;
  }

  // ---------- выбор сервера чата (только в программе) ----------
  // «Этот компьютер — сервер»: сервер запускается в этой копии программы; «Другой компьютер»: адрес из его кабинета.
  function serverBox(onDone) {
    const box = el('div', 'so-srv');
    const st = ST.st || {};
    let mode = st.server && !st.host ? 'join' : 'host';
    const seg = el('div', 'seg bx-seg'); const bH = el('button', null, 'Этот компьютер — сервер'), bJ = el('button', null, 'Подключиться к другому'); bH.type = bJ.type = 'button'; seg.append(bH, bJ);
    const note = el('p', 'so-muted'), inp = el('input', 'so-srv-in'); inp.placeholder = 'адрес, например 192.168.1.5'; inp.setAttribute('aria-label', 'Адрес компьютера-сервера'); inp.value = st.server && !st.host ? st.server : '';
    const err = el('p', 'so-err'); err.setAttribute('role', 'alert');
    const go = el('button', 'btn so-srv-go', 'Подключить'); go.type = 'button';
    const set = (m) => { mode = m; bH.classList.toggle('on', m === 'host'); bJ.classList.toggle('on', m === 'join'); inp.hidden = m === 'host'; err.textContent = '';
      note.textContent = m === 'host' ? 'Программа на этом компьютере станет сервером чата: на ней хранятся аккаунты и переписка. Она должна быть запущена, пока вы общаетесь. Windows спросит разрешение для сети — нажмите «Разрешить».' : 'Введите адрес из «Личный кабинет → Сервер чата» на компьютере-сервере. Оба компьютера должны быть в одной сети (или в общей сети Tailscale).';
      go.textContent = m === 'host' ? 'Включить сервер' : 'Подключить'; };
    bH.onclick = () => set('host'); bJ.onclick = () => { set('join'); inp.focus(); };
    inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); go.click(); } };
    go.onclick = async () => {
      go.disabled = true; err.textContent = mode === 'host' ? 'Запускаю…' : 'Проверяю адрес…';
      const r = await R.server(mode === 'host' ? { host: true } : { server: inp.value.trim() });
      go.disabled = false;
      if (!r || !r.ok) { err.textContent = (r && r.error) || 'Не получилось'; return; }
      err.textContent = ''; ST.st = r; if (!r.loggedIn) loggedOut(); onDone(r);
    };
    set(mode); box.append(seg, note, inp, err, go); return box;
  }
  const hostLine = (st) => st && st.hosting ? (st.hosting.addrs.length ? st.hosting.addrs.join(' или ') : 'нет сети') : '';

  // снимок программы: в программе — окно целиком (main: app:capture), в превью — первый график на экране
  async function capture() {
    if (window.mda && window.mda.capture) { try { const d = await window.mda.capture(); if (d) return d; } catch (e) { /* ниже */ } }
    let svg = null, best = 0;
    document.querySelectorAll('.app-page:not([hidden]) svg[viewBox]').forEach(s => { const r = s.getBoundingClientRect(), a = r.width * r.height; if (r.width > 120 && r.bottom > 0 && r.top < innerHeight && a > best) { best = a; svg = s; } });
    if (svg) { const c = svg.cloneNode(true); c.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); const st = getComputedStyle(document.body); c.setAttribute('style', 'background:' + st.backgroundColor + ';color:' + st.color + ';font-family:' + st.fontFamily); return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(c)); }
    return null;
  }
  const DEMO_IMG = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" rx="12" fill="#11151C"/><ellipse cx="160" cy="95" rx="130" ry="62" fill="#1F5146" stroke="#2C3445" stroke-width="5"/><g font-family="sans-serif" font-weight="800" font-size="20"><rect x="98" y="78" width="22" height="30" rx="4" fill="#F7F5EF"/><text x="103" y="99" fill="#1B1D22">K</text><rect x="124" y="78" width="22" height="30" rx="4" fill="#F7F5EF"/><text x="129" y="99" fill="#D23B3B">7</text><rect x="150" y="78" width="22" height="30" rx="4" fill="#F7F5EF"/><text x="155" y="99" fill="#1E8A4C">5</text><rect x="176" y="78" width="22" height="30" rx="4" fill="#F7F5EF"/><text x="181" y="99" fill="#1B1D22">8</text><rect x="202" y="78" width="22" height="30" rx="4" fill="#F7F5EF"/><text x="207" y="99" fill="#2F6FE0">2</text></g><text x="160" y="132" text-anchor="middle" font-family="monospace" font-size="13" fill="#F6E7C1">Банк 100,3 BB</text><text x="14" y="22" font-family="sans-serif" font-size="11" fill="#9AA3B2">MDA Lab · реплеер</text></svg>');

  // ---------- первый запуск: создать аккаунт или войти ----------
  function welcome(force) {
    if (A.account() && !force) return;
    if (document.querySelector('.so-welcome')) return;
    const bg = el('div', 'modal-bg so-bg'), box = el('div', 'modal so-welcome'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'soWT');
    const hero = el('div', 'so-w-hero'); hero.innerHTML = '<img src="' + (document.querySelector('.brand img') || {}).src + '" alt="" width="44" height="44">';
    hero.append(el('h2', null, 'Добро пожаловать в MDA Lab')); hero.lastChild.id = 'soWT';
    hero.append(el('p', null, ONLINE ? 'Создайте аккаунт — с ним у вас будет личный кабинет, друзья и чат с другими игроками программы.' : 'Создайте аккаунт MDA Lab — с ним у вас будет личный кабинет. Загруженная база остаётся на месте, ничего загружать заново не нужно.'));
    let mode = 'reg';
    const seg = el('div', 'seg bx-seg so-w-seg'); const bReg = el('button', 'on', 'Создать аккаунт'), bLog = el('button', null, 'У меня есть аккаунт'); bReg.type = bLog.type = 'button'; seg.append(bReg, bLog);
    const form = el('form', 'so-form'); form.noValidate = true;
    const field = (lab, type, ph, hint) => { const w = el('label', 'so-f'); w.append(el('span', null, lab)); const i = el('input'); i.type = type; i.placeholder = ph || ''; w.append(i); if (hint) w.append(el('small', null, hint)); form.append(w); return { w, i }; };
    const fN = field('Никнейм', 'text', 'например, Molodoy', ONLINE ? 'Его увидят друзья и другие игроки. 3–20 символов: буквы, цифры, _' : '3–20 символов: латинские буквы, цифры, _'); fN.i.autocomplete = 'username'; fN.i.maxLength = 20;
    const fP = field('Пароль', 'password', 'не меньше 8 символов'); fP.i.autocomplete = 'new-password';
    const fP2 = field('Повторите пароль', 'password', ''); fP2.i.autocomplete = 'new-password';
    const fE = field('Почта (по желанию)', 'email', 'name@mail.com', 'Нужна только чтобы восстановить пароль'); fE.i.autocomplete = 'email';
    const err = el('p', 'so-err'); err.setAttribute('role', 'alert'); form.append(err);
    // в программе — сначала выбрать сервер чата
    let srvW = null;
    const drawSrv = () => {
      if (!REAL || !ONLINE) return; const st = ST.st || {};
      const w = el('div', 'so-srv-w');
      if (st.server) {
        const l = el('div', 'so-srv-cur'); l.append(el('span', null, 'Сервер чата'), el('b', null, st.host ? 'этот компьютер' : st.server));
        const ch = el('button', 'so-link', 'Изменить'); ch.type = 'button'; ch.onclick = () => { w.replaceWith(srvW = pick()); }; l.append(ch); w.append(l);
        if (st.host) w.append(el('small', 'so-muted', 'Адрес для второго компьютера: ' + hostLine(st)));
      } else w.append(pick());
      if (srvW) srvW.replaceWith(w); else form.prepend(w); srvW = w;
    };
    const pick = () => { const w = el('div', 'so-srv-w'); w.append(el('span', 'so-srv-h', 'Сервер чата'), serverBox(() => { drawSrv(); fN.i.focus(); })); return w; };
    drawSrv();
    const go = el('button', 'btn-load so-go', 'Создать аккаунт'); go.type = 'submit'; form.append(go);
    const later = el('button', 'so-later', 'Позже'); later.type = 'button'; later.onclick = () => { LS.set('mda.welcome.later', 1); bg.remove(); };
    const setMode = (m) => { mode = m; bReg.classList.toggle('on', m === 'reg'); bLog.classList.toggle('on', m === 'log'); fP2.w.hidden = fE.w.hidden = m === 'log'; go.textContent = m === 'reg' ? 'Создать аккаунт' : 'Войти'; fP.i.autocomplete = m === 'reg' ? 'new-password' : 'current-password'; err.textContent = ''; };
    bReg.onclick = () => setMode('reg'); bLog.onclick = () => setMode('log');
    form.onsubmit = async (e) => {
      e.preventDefault(); const nick = fN.i.value.trim();
      if (!/^[A-Za-z0-9_]{3,20}$/.test(nick)) { err.textContent = 'Никнейм: 3–20 символов, латинские буквы, цифры и _'; fN.i.focus(); return; }
      if (fP.i.value.length < 8) { err.textContent = 'Пароль — не меньше 8 символов'; fP.i.focus(); return; }
      if (mode === 'reg' && fP.i.value !== fP2.i.value) { err.textContent = 'Пароли не совпадают'; fP2.i.focus(); return; }
      if (mode === 'reg' && fE.i.value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fE.i.value)) { err.textContent = 'Проверьте почту'; fE.i.focus(); return; }
      if (REAL && ONLINE && !(ST.st && ST.st.server)) { err.textContent = 'Сначала выберите сервер чата'; return; }
      go.disabled = true; err.textContent = '';
      const r = await (mode === 'reg' ? A.register(nick, fE.i.value.trim(), fP.i.value) : A.login(nick, fP.i.value));
      go.disabled = false;
      if (!r || !r.ok) { err.textContent = (r && r.error) || 'Не получилось'; return; }
      bg.remove(); redraw(); toast(mode === 'reg' ? 'Аккаунт создан — вы вошли как ' + nick : 'Вы вошли как ' + nick);
    };
    box.append(hero, seg, form, later); if (!REAL) box.append(el('p', 'so-demo', 'Превью: аккаунт хранится только в этом окне, пользователи — демонстрационные.'));
    bg.append(box); document.body.append(bg); fN.i.focus();
  }
  function toast(t) { const d = el('div', 'so-toast', t); d.setAttribute('role', 'status'); document.body.append(d); setTimeout(() => d.remove(), 2600); }

  // ---------- «Личный кабинет»: слева разделы, «Мои данные» ----------
  const acc = document.getElementById('pgAcc');
  let CAB = 'me'; // раздел кабинета: при запуске — «Мои данные»
  function drawCabinet() {
    if (!acc) return;
    acc.className = 'app-page so-cab'; acc.replaceChildren();
    const nav = el('nav', 'so-cab-nav'); nav.setAttribute('aria-label', 'Разделы кабинета');
    [['me', 'Мои данные', '<circle cx="12" cy="8" r="4"/><path d="M4.5 21c1-4 4-6.5 7.5-6.5s6.5 2.5 7.5 6.5"/>'], ['res', 'Результаты', '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'], ['bank', 'Банкролл', '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/>'], ['focus', 'Фокус и сессии', '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'], ['goals', 'Цели', '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>'], ['sub', 'Подписка', '<path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>']].forEach(([k, l, d], n) => {
      const ready = k === 'me' || k === 'res'; // results.js грузится после этого файла — проверяется при нажатии
      const b = el('button', 'so-cab-i' + (CAB === k ? ' on' : '')); b.type = 'button'; b.innerHTML = ico(d, 17); b.append(el('span', null, l));
      if (!ready) { b.disabled = true; b.append(el('em', null, 'скоро')); } else { b.onclick = () => { CAB = k; drawCabinet(); }; if (CAB === k) b.setAttribute('aria-current', 'page'); }
      nav.append(b);
    });
    const main = el('div', 'so-cab-main');
    if (CAB === 'res' && window.MDAResults) { main.classList.add('rs-main'); acc.append(nav, main); window.MDAResults.draw(main); return; }
    const a = A.account();
    if (!a) {
      const c = el('div', 'so-card so-empty'); c.append(el('h2', null, 'Вы не вошли'), el('p', null, 'Войдите или создайте аккаунт — тогда здесь будут ваши данные, а в чате — друзья.'));
      const b = el('button', 'btn-load', 'Войти или создать аккаунт'); b.type = 'button'; b.onclick = () => welcome(true); c.append(b); main.append(c);
    } else {
      const head = el('div', 'so-card so-me');
      const av = el('div', 'so-av big', a.nick[0].toUpperCase()); av.style.background = colorOf(a.nick);
      const who = el('div', 'so-me-t'); who.append(el('h2', null, a.nick), el('p', null, 'В MDA Lab с ' + new Date(a.since).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })));
      const st = el('span', 'so-online', 'в сети'); if (ONLINE) who.append(st);
      const out = el('button', 'btn', 'Выйти'); out.type = 'button'; out.onclick = async () => { await A.logout(); redraw(); };
      if (REAL && ONLINE && !ST.conn) { st.textContent = 'нет связи с сервером'; st.className = 'so-offline'; }
      head.append(av, who, out);
      const grid = el('div', 'so-grid');
      const card = (title) => { const c = el('section', 'so-card'); c.append(el('h3', null, title)); grid.append(c); return c; };
      const c1 = card('Аккаунт');
      const row = (lab, val, act) => { const r = el('div', 'so-row'); r.append(el('span', null, lab), el('b', null, val)); if (act) r.append(act); c1.append(r); return r; };
      row('Никнейм', a.nick); row('Почта', a.email || 'не указана');
      const ch = el('button', 'so-link', 'Сменить пароль'); ch.type = 'button'; row('Пароль', '••••••••', ch);
      ch.onclick = () => {
        if (!REAL) { toast('В превью пароль не меняется'); return; }
        if (c1.querySelector('.so-pw')) return;
        const f = el('form', 'so-pw'); const o = el('input'), n = el('input'); o.type = n.type = 'password'; o.placeholder = 'старый пароль'; n.placeholder = 'новый, от 8 символов'; o.autocomplete = 'current-password'; n.autocomplete = 'new-password'; o.setAttribute('aria-label', 'Старый пароль'); n.setAttribute('aria-label', 'Новый пароль');
        const e2 = el('p', 'so-err'); const ok = el('button', 'btn so-sm', 'Сохранить'); ok.type = 'submit';
        f.onsubmit = async (ev) => { ev.preventDefault(); if (n.value.length < 8) { e2.textContent = 'Новый пароль — не меньше 8 символов'; return; } const r = await R.call('POST', '/me', { pass: { old: o.value, new: n.value } }); if (r && r.ok) { f.remove(); toast('Пароль изменён'); } else e2.textContent = (r && r.error) || 'Не получилось'; };
        f.append(o, n, ok, e2); c1.append(f); o.focus();
      };
      const c2 = card('Ники в румах');
      c2.append(el('p', 'so-muted', ONLINE ? 'Ваши ники из загруженной базы. Друзья увидят, где вы играете, только если вы разрешите.' : 'Ваши ники из загруженной базы.'));
      const nk = (typeof HERO_DB !== 'undefined' && HERO_DB && HERO_DB.nicks) ? HERO_DB.nicks : null;
      const list = el('div', 'so-nicks');
      if (nk && Object.keys(nk).length) Object.entries(nk).forEach(([n, r]) => { const p = el('span', 'so-chip'); p.append(el('i', null, r), document.createTextNode(n)); list.append(p); });
      else list.append(el('span', 'so-muted', 'Загрузите базу — ники появятся здесь'));
      c2.append(list);
      if (ONLINE) {
      const c3 = card('Приватность');
      const tg = (lab, key, def) => { const w = el('label', 'so-tg'); const i = el('input'); i.type = 'checkbox'; i.checked = a[key] != null ? a[key] : def; i.onchange = async () => { await A.update({ [key]: i.checked }); if (key === 'showNicks' && i.checked) pushNicks(true); }; w.append(i, el('span', null, lab)); c3.append(w); };
      tg('Показывать другим, что я в сети', 'showOnline', true); tg('Принимать заявки в друзья от всех', 'openRequests', true); tg('Показывать друзьям мои ники в румах', 'showNicks', false);
      const c4 = card('Друзья');
      c4.append(el('p', 'so-muted', A.friends().length + ' в друзьях · ' + A.friends().filter(u => u.online).length + ' сейчас в сети'));
      const ob = el('button', 'btn', 'Открыть чат'); ob.type = 'button'; ob.onclick = () => openPanel(); c4.append(ob);
      if (REAL) srvCard(card('Сервер чата'));
      }
      pushNicks();
      main.append(head, grid);
    }
    if (!REAL) main.append(el('p', 'so-demo', 'Превью: данные хранятся только в этом окне, пользователи в чате — демонстрационные.'));
    else if (!a && ONLINE) { const c = el('section', 'so-card'); c.append(el('h3', null, 'Сервер чата')); srvCard(c); main.append(c); }
    acc.append(nav, main);
  }

  // карточка «Сервер чата»: где сервер, есть ли связь, адрес для второго компьютера
  function srvCard(c) {
    const st = ST.st || {};
    const row = (l, v, cls) => { const r = el('div', 'so-row'); r.append(el('span', null, l), el('b', cls || null, v)); c.append(r); };
    row('Сервер', st.host ? 'этот компьютер' : st.server || 'не выбран');
    if (st.server) row('Связь', ST.conn ? 'есть' : ST.me ? 'нет — ' + (ST.err || 'переподключаюсь…') : 'войдите в аккаунт', ST.conn ? 'so-on-t' : null);
    if (st.hosting) {
      const big = el('div', 'so-addr'); big.append(el('span', null, 'Адрес для второго компьютера'), el('b', null, hostLine(st)));
      c.append(big, el('p', 'so-muted', 'Пользователей на сервере: ' + st.hosting.stats.users + ' · сейчас подключено: ' + st.hosting.stats.online));
    }
    const ch = el('button', 'btn', st.server ? 'Изменить сервер' : 'Выбрать сервер'); ch.type = 'button';
    ch.onclick = () => { const bg = el('div', 'modal-bg so-bg'), box = el('div', 'modal so-welcome'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Сервер чата');
      const t = el('h2', 'so-srv-title', 'Сервер чата'); const cl = el('button', 'so-later', 'Отмена'); cl.type = 'button'; cl.onclick = () => bg.remove();
      box.append(t, el('p', 'so-muted', 'У каждого сервера свои аккаунты: после смены сервера войдите или создайте аккаунт заново.'), serverBox(async () => { bg.remove(); ST.st = await R.status(); redraw(); if (!ST.me) welcome(true); }), cl);
      bg.append(box); document.body.append(bg); bg.onclick = (e) => { if (e.target === bg) bg.remove(); }; };
    c.append(ch);
  }
  // ники из базы — на сервер (друзья видят их, только если включено «Показывать друзьям мои ники»)
  let nicksSent = false;
  function pushNicks(force) {
    if (!REAL || !ST.me || (nicksSent && !force)) return;
    const nk = (typeof HERO_DB !== 'undefined' && HERO_DB && HERO_DB.nicks) ? HERO_DB.nicks : null; if (!nk || !Object.keys(nk).length) return;
    nicksSent = true; R.call('POST', '/me', { nicks: nk });
  }

  // ---------- кнопка чата и аккаунта в верхней полосе ----------
  const bar = document.querySelector('.apptabs');
  const right = el('div', 'so-top');
  const chatB = el('button', 'so-chatb'); chatB.type = 'button'; chatB.innerHTML = ico('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/>', 20);
  const badge = el('span', 'so-badge'); chatB.append(badge); chatB.onclick = () => (panel.hidden ? openPanel() : closePanel());
  const meB = el('button', 'so-meb'); meB.type = 'button'; meB.onclick = () => { if (!A.account()) welcome(true); else document.getElementById('tabAcc').click(); };
  if (ONLINE) right.append(chatB); right.append(meB); if (bar) bar.append(right);

  // ---------- панель чата: друзья / все пользователи / заявки, окно переписки ----------
  const panel = el('aside', 'so-panel'); panel.hidden = true; panel.setAttribute('aria-label', 'Чат'); document.body.append(panel);
  let TAB = 'friends', CUR = null, Q = '';
  const DRAFT = {}, SHOT = {}; // недописанное сообщение и снимок — переживают перерисовку при новых событиях
  const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };
  function openPanel(id) { if (!ONLINE) return; if (!A.account()) { welcome(true); return; } panel.hidden = false; if (id) { CUR = id; A.markRead(id); if (REAL) loadMsgs(id); } else if (REAL) refresh(); redraw(); }
  function closePanel() { panel.hidden = true; redraw(); }
  function avatar(u, size) { const a = el('span', 'so-av' + (size ? ' ' + size : ''), u.nick[0].toUpperCase()); a.style.background = colorOf(u.nick); if (u.online) a.classList.add('on'); return a; }
  function drawPanel() {
    panel.replaceChildren();
    const head = el('div', 'so-ph');
    if (CUR) {
      const u = A.user(CUR);
      const back = el('button', 'so-ib'); back.type = 'button'; back.setAttribute('aria-label', 'К списку'); back.innerHTML = ico('<path d="M15 18l-6-6 6-6"/>'); back.onclick = () => { CUR = null; redraw(); };
      if (!u) { CUR = null; drawPanel(); return; }
      const t = el('div', 'so-ph-t'); t.append(el('b', null, u.nick), el('span', u.online ? 'so-on-t' : null, u.online ? (u.status || 'в сети') : (u.seen ? 'был(а) ' + ago(u.seen) : 'не в сети')));
      head.append(back, avatar(u), t);
    } else head.append(el('b', 'so-ph-title', 'Чат'));
    const x = el('button', 'so-ib'); x.type = 'button'; x.setAttribute('aria-label', 'Закрыть'); x.innerHTML = ico('<path d="M6 6l12 12M18 6L6 18"/>'); x.onclick = closePanel; head.append(x);
    panel.append(head);
    if (CUR) { drawChat(); return; }
    const tabs = el('div', 'seg bx-seg so-tabs');
    const nReq = A.requests().length;
    [['friends', 'Друзья'], ['all', 'Все'], ['req', 'Заявки' + (nReq ? ' ' + nReq : '')]].forEach(([k, l]) => { const b = el('button', TAB === k ? 'on' : null, l); b.type = 'button'; b.onclick = () => { TAB = k; redraw(); }; tabs.append(b); });
    const sr = el('input', 'so-search'); sr.type = 'search'; sr.placeholder = 'Поиск по нику'; sr.value = Q; sr.oninput = () => { Q = sr.value.trim().toLowerCase(); drawList(); };
    const list = el('div', 'so-list'); panel.append(tabs, sr, list);
    function drawList() {
      list.replaceChildren();
      let us = TAB === 'friends' ? A.friends() : TAB === 'req' ? A.requests() : A.users();
      us = us.filter(u => !Q || u.nick.toLowerCase().includes(Q)).sort((a, b) => b.online - a.online || (A.unread(b.id) - A.unread(a.id)) || a.nick.localeCompare(b.nick));
      if (TAB === 'all') { const on = A.users().filter(u => u.online).length; list.append(el('p', 'so-muted so-cnt', A.users().length + ' ' + plural(A.users().length, 'пользователь', 'пользователя', 'пользователей') + ' · ' + on + ' в сети')); }
      if (REAL && !ST.conn) list.append(el('p', 'so-err so-cnt', 'Нет связи с сервером чата' + (ST.err ? ': ' + ST.err : '') + '. Пробую снова…'));
      if (!us.length) list.append(el('p', 'so-muted so-cnt', TAB === 'friends' ? 'Пока нет друзей — найдите игроков во вкладке «Все»' : TAB === 'req' ? 'Новых заявок нет' : Q ? 'Никого не нашлось' : 'Других пользователей пока нет — зарегистрируйтесь на втором компьютере'));
      us.forEach(u => {
        const r = el('div', 'so-u'), info = el('div', 'so-u-t');
        const last = A.last(u.id);
        info.append(el('b', null, u.nick), el('span', null, TAB === 'friends' && last ? (last.from === 'me' ? 'Вы: ' : '') + (last.img ? '📷 Скриншот' : last.text) : u.online ? (u.status || 'в сети') : u.seen ? 'был(а) ' + ago(u.seen) : 'не в сети'));
        r.append(avatar(u), info);
        if (TAB === 'friends') { const n = A.unread(u.id); if (n) r.append(el('span', 'so-badge in', String(n))); r.tabIndex = 0; r.setAttribute('role', 'button'); r.onclick = () => openPanel(u.id); r.onkeydown = (e) => { if (e.key === 'Enter') openPanel(u.id); }; }
        else if (TAB === 'req') { const ok = el('button', 'btn-load so-sm', 'Принять'); ok.type = 'button'; ok.onclick = () => A.accept(u.id); const no = el('button', 'btn so-sm', 'Отклонить'); no.type = 'button'; no.onclick = () => A.decline(u.id); r.append(ok, no); }
        else if (A.isFriend(u.id)) { const m = el('button', 'btn so-sm', 'Написать'); m.type = 'button'; m.onclick = () => openPanel(u.id); r.append(m); }
        else if (A.isSent(u.id)) r.append(el('span', 'so-muted so-sm-t', 'заявка отправлена'));
        else if (A.requests().some(x => x.id === u.id)) { const ok = el('button', 'btn-load so-sm', 'Принять заявку'); ok.type = 'button'; ok.onclick = () => A.accept(u.id); r.append(ok); }
        else { const add = el('button', 'btn so-sm', '+ В друзья'); add.type = 'button'; add.onclick = async () => { add.disabled = true; const x = await A.addFriend(u.id); if (!REAL || (x && x.ok)) toast(A.isFriend(u.id) ? u.nick + ' теперь в друзьях' : 'Заявка отправлена ' + u.nick); redraw(); }; r.append(add); }
        list.append(r);
      });
    }
    drawList();
  }
  function drawChat() {
    const id = CUR, msgs = el('div', 'so-msgs'); msgs.setAttribute('role', 'log'); msgs.setAttribute('aria-live', 'polite');
    let lastDay = '';
    A.messages(id).forEach(m => {
      const day = new Date(m.t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }); if (day !== lastDay) { lastDay = day; msgs.append(el('div', 'so-day', day)); }
      const b = el('div', 'so-msg ' + (m.from === 'me' ? 'me' : 'them') + (m.pending ? ' pending' : ''));
      if (m.img) { const im = el('img', 'so-shot'); setImg(im, m.img); im.alt = 'Скриншот из MDA Lab'; im.onclick = () => { if (im.src) zoom(im.src); }; b.append(im); }
      if (m.text) b.append(el('p', null, m.text));
      b.append(el('time', null, m.pending ? 'отправляю…' : hhmm(m.t))); msgs.append(b);
    });
    if (!A.messages(id).length) msgs.append(el('p', 'so-muted so-cnt', A.isFriend(id) ? 'Сообщений пока нет — напишите первым' : 'Писать можно только друзьям'));
    const form = el('form', 'so-input');
    const shot = el('button', 'so-ib'); shot.type = 'button'; shot.title = 'Отправить скриншот программы'; shot.setAttribute('aria-label', 'Отправить скриншот программы'); shot.innerHTML = ico('<rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M8 6l1.5-2h5L16 6"/>');
    const inp = el('input'); inp.placeholder = 'Сообщение'; inp.setAttribute('aria-label', 'Сообщение'); inp.maxLength = 2000;
    inp.value = DRAFT[id] || ''; inp.oninput = () => { DRAFT[id] = inp.value; };
    const send = el('button', 'so-send'); send.type = 'submit'; send.setAttribute('aria-label', 'Отправить'); send.innerHTML = ico('<path d="M5 12h14M13 6l6 6-6 6"/>');
    const pre = el('div', 'so-pre'); pre.hidden = true;
    const showPre = () => { const d = SHOT[id]; pre.hidden = !d; pre.replaceChildren(); if (!d) return; const im = el('img'); im.src = d; im.alt = ''; const rm = el('button', 'so-ib'); rm.type = 'button'; rm.setAttribute('aria-label', 'Убрать снимок'); rm.innerHTML = ico('<path d="M6 6l12 12M18 6L6 18"/>', 14); rm.onclick = () => { delete SHOT[id]; showPre(); }; pre.append(im, rm); };
    showPre();
    shot.onclick = async () => { panel.style.visibility = 'hidden'; await new Promise(r => setTimeout(r, 150)); const d = await capture(); panel.style.visibility = ''; if (!d) { toast('Не удалось сделать снимок'); return; } SHOT[id] = d; showPre(); inp.focus(); };
    form.onsubmit = (e) => { e.preventDefault(); const t = inp.value.trim(), img = SHOT[id]; if (!t && !img) return; delete SHOT[id]; delete DRAFT[id]; A.send(id, { text: t, img: img || undefined }); if (!REAL) redraw(); };
    form.append(shot, inp, send);
    panel.append(msgs, pre, form);
    msgs.scrollTop = msgs.scrollHeight; if (!document.querySelector('.so-welcome, .so-zoom')) inp.focus();
  }
  function zoom(src) { const bg = el('div', 'modal-bg so-zoom'); const im = el('img'); im.src = src; im.alt = 'Скриншот'; bg.append(im); bg.onclick = () => bg.remove(); document.body.append(bg); }

  function redraw() {
    const a = A.account(), n = A.unreadAll();
    badge.textContent = n ? String(n) : ''; badge.hidden = !n || !a;
    chatB.setAttribute('aria-label', 'Чат' + (n ? ', непрочитанных: ' + n : '')); chatB.classList.toggle('on', !panel.hidden);
    meB.replaceChildren(); if (a) { const av = el('span', 'so-av sm', a.nick[0].toUpperCase()); av.style.background = colorOf(a.nick); meB.append(av, el('span', null, a.nick)); meB.title = 'Личный кабинет'; } else { meB.append(el('span', null, 'Войти')); meB.title = 'Войти или создать аккаунт'; }
    if (!panel.hidden) drawPanel();
    if (CAB !== 'res' || !acc || !acc.querySelector('.rs-main')) drawCabinet(); // «Результаты» не пересчитывать на каждое событие
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden && !document.querySelector('.so-zoom, .so-welcome')) closePanel(); });
  if (REAL) ST.me = LS.get('mda.social.me', null); // пока сервер не ответил — последний известный аккаунт
  redraw();
  const tA = document.getElementById('tabAcc'); if (tA) tA.addEventListener('click', drawCabinet); // ники из базы — свежие
  // первый запуск или обновление старой версии: аккаунта нет — предложить создать (база остаётся на месте)
  setTimeout(async () => {
    if (REAL) { try { ST.st = await R.status(); ST.conn = ST.st.connected; } catch (e) { ST.st = {}; } if (!ST.st.loggedIn) loggedOut(); else await loadState(); redraw(); }
    // окно входа: пока нет аккаунта — при первом запуске и после обновления старой версии (база при этом остаётся)
    if (!A.account() && !LS.get('mda.welcome.later', 0)) welcome();
  }, 600);
  window.MDASocial = { open: openPanel, welcome: () => welcome(true) };
})();
