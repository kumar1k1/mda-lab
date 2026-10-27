'use strict';
// Аккаунт, «Личный кабинет → Мои данные» и чат с друзьями.
// ПОКА ЭТО МАКЕТ: аккаунт, пользователи и сообщения живут только в этом окне (демо-данные), сервера ещё нет.
// Интерфейс говорит с данными только через объект API ниже — когда появится сервер, заменяется только он.
(function () {
  const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };
  const ico = (d, s) => '<svg width="' + (s || 18) + '" height="' + (s || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* без сохранения */ } } };
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
    logout: () => { try { localStorage.removeItem('mda.account'); } catch (e) { /* нет */ } },
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
    if (API.account() && !force) return;
    const bg = el('div', 'modal-bg so-bg'), box = el('div', 'modal so-welcome'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'soWT');
    const hero = el('div', 'so-w-hero'); hero.innerHTML = '<img src="' + (document.querySelector('.brand img') || {}).src + '" alt="" width="44" height="44">';
    hero.append(el('h2', null, 'Добро пожаловать в MDA Lab')); hero.lastChild.id = 'soWT';
    hero.append(el('p', null, 'Создайте аккаунт — с ним у вас будет личный кабинет, друзья и чат с другими игроками программы.'));
    let mode = 'reg';
    const seg = el('div', 'seg bx-seg so-w-seg'); const bReg = el('button', 'on', 'Создать аккаунт'), bLog = el('button', null, 'У меня есть аккаунт'); bReg.type = bLog.type = 'button'; seg.append(bReg, bLog);
    const form = el('form', 'so-form'); form.noValidate = true;
    const field = (lab, type, ph, hint) => { const w = el('label', 'so-f'); w.append(el('span', null, lab)); const i = el('input'); i.type = type; i.placeholder = ph || ''; w.append(i); if (hint) w.append(el('small', null, hint)); form.append(w); return { w, i }; };
    const fN = field('Никнейм', 'text', 'например, Molodoy', 'Его увидят друзья и другие игроки. 3–20 символов: буквы, цифры, _'); fN.i.autocomplete = 'username'; fN.i.maxLength = 20;
    const fP = field('Пароль', 'password', 'не меньше 8 символов'); fP.i.autocomplete = 'new-password';
    const fP2 = field('Повторите пароль', 'password', ''); fP2.i.autocomplete = 'new-password';
    const fE = field('Почта (по желанию)', 'email', 'name@mail.com', 'Нужна только чтобы восстановить пароль'); fE.i.autocomplete = 'email';
    const err = el('p', 'so-err'); err.setAttribute('role', 'alert'); form.append(err);
    const go = el('button', 'btn-load so-go', 'Создать аккаунт'); go.type = 'submit'; form.append(go);
    const later = el('button', 'so-later', 'Позже'); later.type = 'button'; later.onclick = () => bg.remove();
    const setMode = (m) => { mode = m; bReg.classList.toggle('on', m === 'reg'); bLog.classList.toggle('on', m === 'log'); fP2.w.hidden = fE.w.hidden = m === 'log'; go.textContent = m === 'reg' ? 'Создать аккаунт' : 'Войти'; fP.i.autocomplete = m === 'reg' ? 'new-password' : 'current-password'; err.textContent = ''; };
    bReg.onclick = () => setMode('reg'); bLog.onclick = () => setMode('log');
    form.onsubmit = async (e) => {
      e.preventDefault(); const nick = fN.i.value.trim();
      if (!/^[A-Za-z0-9_]{3,20}$/.test(nick)) { err.textContent = 'Никнейм: 3–20 символов, латинские буквы, цифры и _'; fN.i.focus(); return; }
      if (fP.i.value.length < 8) { err.textContent = 'Пароль — не меньше 8 символов'; fP.i.focus(); return; }
      if (mode === 'reg' && fP.i.value !== fP2.i.value) { err.textContent = 'Пароли не совпадают'; fP2.i.focus(); return; }
      if (mode === 'reg' && fE.i.value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fE.i.value)) { err.textContent = 'Проверьте почту'; fE.i.focus(); return; }
      go.disabled = true;
      await (mode === 'reg' ? API.register(nick, fE.i.value.trim()) : API.login(nick));
      bg.remove(); redraw(); toast(mode === 'reg' ? 'Аккаунт создан — вы вошли как ' + nick : 'Вы вошли как ' + nick);
    };
    box.append(hero, seg, form, later, el('p', 'so-demo', 'Макет: аккаунт пока хранится только на этом компьютере — сервер подключим позже.'));
    bg.append(box); document.body.append(bg); fN.i.focus();
  }
  function toast(t) { const d = el('div', 'so-toast', t); d.setAttribute('role', 'status'); document.body.append(d); setTimeout(() => d.remove(), 2600); }

  // ---------- «Личный кабинет»: слева разделы, «Мои данные» ----------
  const acc = document.getElementById('pgAcc');
  function drawCabinet() {
    if (!acc) return;
    acc.className = 'app-page so-cab'; acc.replaceChildren();
    const nav = el('nav', 'so-cab-nav'); nav.setAttribute('aria-label', 'Разделы кабинета');
    [['me', 'Мои данные', '<circle cx="12" cy="8" r="4"/><path d="M4.5 21c1-4 4-6.5 7.5-6.5s6.5 2.5 7.5 6.5"/>'], ['res', 'Результаты', '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'], ['bank', 'Банкролл', '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/>'], ['focus', 'Фокус и сессии', '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'], ['goals', 'Цели', '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>'], ['sub', 'Подписка', '<path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>']].forEach(([k, l, d], n) => {
      const b = el('button', 'so-cab-i' + (n === 0 ? ' on' : '')); b.type = 'button'; b.innerHTML = ico(d, 17); b.append(el('span', null, l)); if (n) { b.disabled = true; b.append(el('em', null, 'скоро')); } nav.append(b);
    });
    const main = el('div', 'so-cab-main');
    const a = API.account();
    if (!a) {
      const c = el('div', 'so-card so-empty'); c.append(el('h2', null, 'Вы не вошли'), el('p', null, 'Войдите или создайте аккаунт — тогда здесь будут ваши данные, а в чате — друзья.'));
      const b = el('button', 'btn-load', 'Войти или создать аккаунт'); b.type = 'button'; b.onclick = () => welcome(true); c.append(b); main.append(c);
    } else {
      const head = el('div', 'so-card so-me');
      const av = el('div', 'so-av big', a.nick[0].toUpperCase()); av.style.background = colorOf(a.nick);
      const who = el('div', 'so-me-t'); who.append(el('h2', null, a.nick), el('p', null, 'В MDA Lab с ' + new Date(a.since).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })));
      const st = el('span', 'so-online', 'в сети'); who.append(st);
      const out = el('button', 'btn', 'Выйти'); out.type = 'button'; out.onclick = () => { API.logout(); redraw(); };
      head.append(av, who, out);
      const grid = el('div', 'so-grid');
      const card = (title) => { const c = el('section', 'so-card'); c.append(el('h3', null, title)); grid.append(c); return c; };
      const c1 = card('Аккаунт');
      const row = (lab, val, act) => { const r = el('div', 'so-row'); r.append(el('span', null, lab), el('b', null, val)); if (act) r.append(act); c1.append(r); return r; };
      row('Никнейм', a.nick); row('Почта', a.email || 'не указана');
      const ch = el('button', 'so-link', 'Сменить пароль'); ch.type = 'button'; ch.onclick = () => toast('Смена пароля появится вместе с сервером'); row('Пароль', '••••••••', ch);
      const c2 = card('Ники в румах');
      c2.append(el('p', 'so-muted', 'Ваши ники из загруженной базы. Друзья увидят, где вы играете, только если вы разрешите.'));
      const nk = (typeof HERO_DB !== 'undefined' && HERO_DB && HERO_DB.nicks) ? HERO_DB.nicks : null;
      const list = el('div', 'so-nicks');
      if (nk && Object.keys(nk).length) Object.entries(nk).forEach(([n, r]) => { const p = el('span', 'so-chip'); p.append(el('i', null, r), document.createTextNode(n)); list.append(p); });
      else list.append(el('span', 'so-muted', 'Загрузите базу — ники появятся здесь'));
      c2.append(list);
      const c3 = card('Приватность');
      const tg = (lab, key, def) => { const w = el('label', 'so-tg'); const i = el('input'); i.type = 'checkbox'; i.checked = a[key] != null ? a[key] : def; i.onchange = () => API.update({ [key]: i.checked }); w.append(i, el('span', null, lab)); c3.append(w); };
      tg('Показывать другим, что я в сети', 'showOnline', true); tg('Принимать заявки в друзья от всех', 'openRequests', true); tg('Показывать друзьям мои ники в румах', 'showNicks', false);
      const c4 = card('Друзья');
      c4.append(el('p', 'so-muted', API.friends().length + ' в друзьях · ' + API.friends().filter(u => u.online).length + ' сейчас в сети'));
      const ob = el('button', 'btn', 'Открыть чат'); ob.type = 'button'; ob.onclick = () => openPanel(); c4.append(ob);
      main.append(head, grid);
    }
    main.append(el('p', 'so-demo', 'Макет: данные пока хранятся только на этом компьютере, пользователи в чате — демонстрационные.'));
    acc.append(nav, main);
  }

  // ---------- кнопка чата и аккаунта в верхней полосе ----------
  const bar = document.querySelector('.apptabs');
  const right = el('div', 'so-top');
  const chatB = el('button', 'so-chatb'); chatB.type = 'button'; chatB.innerHTML = ico('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/>', 20);
  const badge = el('span', 'so-badge'); chatB.append(badge); chatB.onclick = () => (panel.hidden ? openPanel() : closePanel());
  const meB = el('button', 'so-meb'); meB.type = 'button'; meB.onclick = () => { if (!API.account()) welcome(true); else document.getElementById('tabAcc').click(); };
  right.append(chatB, meB); if (bar) bar.append(right);

  // ---------- панель чата: друзья / все пользователи / заявки, окно переписки ----------
  const panel = el('aside', 'so-panel'); panel.hidden = true; panel.setAttribute('aria-label', 'Чат'); document.body.append(panel);
  let TAB = 'friends', CUR = null, Q = '';
  function openPanel(id) { if (!API.account()) { welcome(true); return; } panel.hidden = false; if (id) { CUR = id; API.markRead(id); } redraw(); }
  function closePanel() { panel.hidden = true; redraw(); }
  function avatar(u, size) { const a = el('span', 'so-av' + (size ? ' ' + size : ''), u.nick[0].toUpperCase()); a.style.background = colorOf(u.nick); if (u.online) a.classList.add('on'); return a; }
  function drawPanel() {
    panel.replaceChildren();
    const head = el('div', 'so-ph');
    if (CUR) {
      const u = API.user(CUR);
      const back = el('button', 'so-ib'); back.type = 'button'; back.setAttribute('aria-label', 'К списку'); back.innerHTML = ico('<path d="M15 18l-6-6 6-6"/>'); back.onclick = () => { CUR = null; redraw(); };
      const t = el('div', 'so-ph-t'); t.append(el('b', null, u.nick), el('span', u.online ? 'so-on-t' : null, u.online ? (u.status || 'в сети') : 'был(а) ' + ago(u.seen)));
      head.append(back, avatar(u), t);
    } else head.append(el('b', 'so-ph-title', 'Чат'));
    const x = el('button', 'so-ib'); x.type = 'button'; x.setAttribute('aria-label', 'Закрыть'); x.innerHTML = ico('<path d="M6 6l12 12M18 6L6 18"/>'); x.onclick = closePanel; head.append(x);
    panel.append(head);
    if (CUR) { drawChat(); return; }
    const tabs = el('div', 'seg bx-seg so-tabs');
    const nReq = API.requests().length;
    [['friends', 'Друзья'], ['all', 'Все'], ['req', 'Заявки' + (nReq ? ' ' + nReq : '')]].forEach(([k, l]) => { const b = el('button', TAB === k ? 'on' : null, l); b.type = 'button'; b.onclick = () => { TAB = k; redraw(); }; tabs.append(b); });
    const sr = el('input', 'so-search'); sr.type = 'search'; sr.placeholder = 'Поиск по нику'; sr.value = Q; sr.oninput = () => { Q = sr.value.trim().toLowerCase(); drawList(); };
    const list = el('div', 'so-list'); panel.append(tabs, sr, list);
    function drawList() {
      list.replaceChildren();
      let us = TAB === 'friends' ? API.friends() : TAB === 'req' ? API.requests() : API.users();
      us = us.filter(u => !Q || u.nick.toLowerCase().includes(Q)).sort((a, b) => b.online - a.online || (API.unread(b.id) - API.unread(a.id)) || a.nick.localeCompare(b.nick));
      if (TAB === 'all') { const on = API.users().filter(u => u.online).length; list.append(el('p', 'so-muted so-cnt', API.users().length + ' пользователей · ' + on + ' в сети')); }
      if (!us.length) list.append(el('p', 'so-muted so-cnt', TAB === 'friends' ? 'Пока нет друзей — найдите игроков во вкладке «Все»' : TAB === 'req' ? 'Новых заявок нет' : 'Никого не нашлось'));
      us.forEach(u => {
        const r = el('div', 'so-u'), info = el('div', 'so-u-t');
        const last = (API.messages(u.id).slice(-1)[0] || null);
        info.append(el('b', null, u.nick), el('span', null, TAB === 'friends' && last ? (last.from === 'me' ? 'Вы: ' : '') + (last.img ? '📷 Скриншот' : last.text) : u.online ? (u.status || 'в сети') : 'был(а) ' + ago(u.seen)));
        r.append(avatar(u), info);
        if (TAB === 'friends') { const n = API.unread(u.id); if (n) r.append(el('span', 'so-badge in', String(n))); r.tabIndex = 0; r.setAttribute('role', 'button'); r.onclick = () => openPanel(u.id); r.onkeydown = (e) => { if (e.key === 'Enter') openPanel(u.id); }; }
        else if (TAB === 'req') { const ok = el('button', 'btn-load so-sm', 'Принять'); ok.type = 'button'; ok.onclick = () => { API.accept(u.id); redraw(); }; const no = el('button', 'btn so-sm', 'Отклонить'); no.type = 'button'; no.onclick = () => { API.decline(u.id); redraw(); }; r.append(ok, no); }
        else if (API.isFriend(u.id)) { const m = el('button', 'btn so-sm', 'Написать'); m.type = 'button'; m.onclick = () => openPanel(u.id); r.append(m); }
        else if (API.isSent(u.id)) r.append(el('span', 'so-muted so-sm-t', 'заявка отправлена'));
        else { const add = el('button', 'btn so-sm', '+ В друзья'); add.type = 'button'; add.onclick = () => { API.addFriend(u.id); toast('Заявка отправлена ' + u.nick); redraw(); }; r.append(add); }
        list.append(r);
      });
    }
    drawList();
  }
  function drawChat() {
    const id = CUR, msgs = el('div', 'so-msgs'); msgs.setAttribute('role', 'log'); msgs.setAttribute('aria-live', 'polite');
    let lastDay = '';
    API.messages(id).forEach(m => {
      const day = new Date(m.t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }); if (day !== lastDay) { lastDay = day; msgs.append(el('div', 'so-day', day)); }
      const b = el('div', 'so-msg ' + (m.from === 'me' ? 'me' : 'them'));
      if (m.img) { const im = el('img', 'so-shot'); im.src = m.img === 'demo' ? DEMO_IMG : m.img; im.alt = 'Скриншот из MDA Lab'; im.onclick = () => zoom(im.src); b.append(im); }
      if (m.text) b.append(el('p', null, m.text));
      b.append(el('time', null, hhmm(m.t))); msgs.append(b);
    });
    const form = el('form', 'so-input');
    const shot = el('button', 'so-ib'); shot.type = 'button'; shot.title = 'Отправить скриншот программы'; shot.setAttribute('aria-label', 'Отправить скриншот программы'); shot.innerHTML = ico('<rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M8 6l1.5-2h5L16 6"/>');
    const inp = el('input'); inp.placeholder = 'Сообщение'; inp.setAttribute('aria-label', 'Сообщение');
    const send = el('button', 'so-send'); send.type = 'submit'; send.setAttribute('aria-label', 'Отправить'); send.innerHTML = ico('<path d="M5 12h14M13 6l6 6-6 6"/>');
    const pre = el('div', 'so-pre'); pre.hidden = true; let pending = null;
    shot.onclick = async () => { panel.style.visibility = 'hidden'; await new Promise(r => setTimeout(r, 120)); const d = await capture(); panel.style.visibility = ''; if (!d) { toast('Не удалось сделать снимок'); return; } pending = d; pre.replaceChildren(); const im = el('img'); im.src = d; im.alt = ''; const rm = el('button', 'so-ib'); rm.type = 'button'; rm.setAttribute('aria-label', 'Убрать снимок'); rm.innerHTML = ico('<path d="M6 6l12 12M18 6L6 18"/>', 14); rm.onclick = () => { pending = null; pre.hidden = true; }; pre.append(im, rm); pre.hidden = false; inp.focus(); };
    form.onsubmit = (e) => { e.preventDefault(); const t = inp.value.trim(); if (!t && !pending) return; API.send(id, { text: t, img: pending || undefined }); pending = null; redraw(); };
    form.append(shot, inp, send);
    panel.append(msgs, pre, form);
    msgs.scrollTop = msgs.scrollHeight; inp.focus();
  }
  function zoom(src) { const bg = el('div', 'modal-bg so-zoom'); const im = el('img'); im.src = src; im.alt = 'Скриншот'; bg.append(im); bg.onclick = () => bg.remove(); document.body.append(bg); }

  function redraw() {
    const a = API.account(), n = API.unreadAll();
    badge.textContent = n ? String(n) : ''; badge.hidden = !n || !a;
    chatB.setAttribute('aria-label', 'Чат' + (n ? ', непрочитанных: ' + n : '')); chatB.classList.toggle('on', !panel.hidden);
    meB.replaceChildren(); if (a) { const av = el('span', 'so-av sm', a.nick[0].toUpperCase()); av.style.background = colorOf(a.nick); meB.append(av, el('span', null, a.nick)); meB.title = 'Личный кабинет'; } else { meB.append(el('span', null, 'Войти')); meB.title = 'Войти или создать аккаунт'; }
    if (!panel.hidden) drawPanel();
    drawCabinet();
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden && !document.querySelector('.so-zoom, .so-welcome')) closePanel(); });
  redraw();
  const tA = document.getElementById('tabAcc'); if (tA) tA.addEventListener('click', drawCabinet); // ники из базы — свежие
  // первый запуск: аккаунта нет — сразу предложить создать (в программе — когда ещё нет базы; в превью — всегда, для показа)
  const inApp = /Electron/.test(navigator.userAgent);
  setTimeout(async () => { if (API.account()) return; let hasBase = false; if (inApp && window.mda && window.mda.dbInfo) { try { const i = await window.mda.dbInfo(); hasBase = !!(i && i.stored); } catch (e) { /* нет */ } } if (!inApp || !hasBase) welcome(); }, 600);
  window.MDASocial = { open: openPanel, welcome: () => welcome(true) };
})();
