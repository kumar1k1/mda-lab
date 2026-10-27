'use strict';
// «Покерные стримы»: раздел Poker на Twitch прямо в программе (тег webview — только адреса Twitch, см. main.js)
// и список покерных стримеров (топ-50 по зрительским часам за месяц, TwitchMetrics, октябрь 2026, и каналы серий)
// со значком «В эфире» (проверка в main.js, streams:live):
// клик — канал открывается в окне справа; «Сейчас в эфире» — живые покерные стримы, самые смотрящие сверху.
(function () {
  const root = document.getElementById('pgStreams'); if (!root) return;
  const DIR = 'https://www.twitch.tv/directory/category/poker?sort=VIEWER_COUNT';
  const LIST = [
    ['LexVeldhuis', 'Lex Veldhuis', 'en', 144120], ['avr0ra112', 'avr0ra112', 'en', 60663], ['Tom_Poker_NL', 'Tom_Poker_NL', 'en', 60148],
    ['santazzzua', 'santazzzua', 'en', 50709], ['Spraggy', 'Spraggy', 'en', 48823], ['KmartPoker', 'KmartPoker', 'en', 48353],
    ['ryan8503031', '大泓', 'zh', 43833], ['PapoMC', 'PapoMC', 'es', 42774], ['PokerNightTV', 'PokerNightTV', 'en', 41569],
    ['innerpsycho', 'innerpsycho', 'ru', 40658], ['DNegsPoker', 'Daniel Negreanu', 'en', 39987], ['abarone68', 'abarone68', 'en', 35383],
    ['SPR_poker', 'SPR_poker', 'ru', 33772], ['girafganger7', 'girafganger7', 'en', 32926], ['pai_do_nuts', 'pai_do_nuts', 'pt', 29285],
    ['Jenzoou', 'Jenzoou', 'de', 27567], ['KelvinKerber1', 'KelvinKerber1', 'pt', 25039], ['Kalthorr', 'Kalthorr', 'en', 21777],
    ['DanielPetersenPoker', 'DanielPetersenPoker', 'en', 21576], ['ITCPokerTEAM', 'ITCPokerTEAM', 'ru', 21484], ['PokerStars', 'PokerStars', 'en', 20659],
    ['anao19_', 'anao19_', 'en', 20220], ['Zapahzamazki', 'Zapahzamazki', 'ru', 17212], ['SteveEnriquez', 'SteveEnriquez', 'es', 17145],
    ['minthon19', 'minthon19', 'ru', 17089], ['QeeeeKotor', 'QeeeeKotor', 'ru', 14809], ['TheRealALTAL', 'TheRealALTAL', 'ru', 14189],
    ['briz90s', 'briz90s', 'ru', 13807], ['mishainner24', 'mishainner24', 'ru', 13112], ['babyshark4', 'babyshark4', 'ru', 12789],
    ['ChippyPoker', 'ChippyPoker', 'ru', 12110], ['GGPokerOfficial', 'GGPokerOfficial', 'en', 10909],
    ['vocerpoker', 'vocerpoker', 'en', 16916], ['easywithaces', 'easywithaces', 'en', 16378], ['pokerroomkingsDE', 'pokerroomkingsDE', 'de', 16042],
    ['peacendloove', 'peacendloove', 'en', 15454], ['Nando_Olimpio', 'Nando_Olimpio', 'pt', 14121], ['winTVlive', 'winTVlive', 'en', 13975],
    ['ALLinPav', 'ALLinPav', 'en', 13600], ['GonzaloDorrego', 'GonzaloDorrego', 'es', 13239], ['OS793', 'OS793', 'de', 13178],
    ['ArquibancadaPoker', 'ArquibancadaPoker', 'pt', 12696], ['illusorypoker', 'illusorypoker', 'en', 12274], ['natural8_hongkong', 'natural8_hongkong', 'zh', 12104],
    ['Beriuzy', 'Beriuzy', 'en', 11952], ['Wolfkind7', 'Wolfkind7', 'en', 11535], ['baakemi', 'baakemi', 'pt', 11301],
    ['PokerRoomKings', 'PokerRoomKings', 'en', 11001], ['WisternJL', 'WisternJL', 'en', 10889], ['kdogwin', '懂事的懂', 'zh', 10859],
    ['TritonPoker', 'Triton Poker', 'en', 0], ['WSOP', 'WSOP', 'en', 0], ['PokerGO', 'PokerGO', 'en', 0], ['WPT', 'World Poker Tour', 'en', 0]
  ];
  // каналы серий, румов и шоу (не личные стримеры) — отдельной группой
  const ORG = new Set(['pokernighttv', 'pokerstars', 'ggpokerofficial', 'pokerroomkingsde', 'pokerroomkings', 'natural8_hongkong', 'wintvlive', 'tritonpoker', 'wsop', 'pokergo', 'wpt', 'itcpokerteam', 'arquibancadapoker']);
  const isOrg = (login) => ORG.has(login.toLowerCase());
  const COL = { en: '#6EC3E8', ru: '#F2B544', es: '#F08A7E', pt: '#7FD7A2', de: '#A99BF5', zh: '#F0A35E' };
  const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };
  const ST = (() => { try { return JSON.parse(localStorage.getItem('mda.streams') || '{}') || {}; } catch (e) { return {}; } })();
  const save = () => { try { localStorage.setItem('mda.streams', JSON.stringify({ lang: ST.lang, only: ST.only, kind: ST.kind })); } catch (e) { /* без сохранения */ } };
  ST.lang = ST.lang || ''; ST.only = !!ST.only; ST.kind = ST.kind || '';
  const LIVE = {}; let liveAt = 0, liveBusy = false; // кто в эфире (login в нижнем регистре → true / false / null — не узнали)
  const inApp = /Electron/.test(navigator.userAgent);
  const icon = (d) => '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';

  // ---------- каркас ----------
  root.classList.add('st-page');
  const head = el('div', 'st-head');
  const ht = el('div', 'nw-ht'); ht.append(el('h1', null, 'Покерные стримы'), el('p', 'nw-sub', 'Кто стримит покер на Twitch прямо сейчас — смотреть можно здесь же, не выходя из программы'));
  const tools = el('div', 'st-tools');
  const btn = (label, svg, fn, cls) => { const b = el('button', 'btn st-btn' + (cls ? ' ' + cls : '')); b.type = 'button'; b.innerHTML = svg; b.append(el('span', null, label)); b.onclick = fn; return b; };
  // «Сейчас в эфире» — переключатель: нажата — в списке только те, кто в эфире; отжата — весь список.
  // Статусы обновляются сами (при открытии раздела и каждые 2 минуты), кнопок «Обновить» и «Назад» нет.
  const liveB = btn('Сейчас в эфире', icon('<circle cx="12" cy="12" r="3"/><path d="M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>'), () => { ST.only = !ST.only; save(); drawList(); });
  liveB.setAttribute('aria-pressed', String(ST.only));
  tools.append(liveB);
  head.append(ht, tools);
  const body = el('div', 'st-body');
  const side = el('aside', 'st-side'); side.setAttribute('aria-label', 'Популярные покерные стримеры');
  const sh = el('div', 'st-side-h'); const shSub = el('span', null, 'по просмотрам за месяц'); sh.append(el('b', null, 'Покерные стримеры'), shSub);
  const langSeg = el('div', 'seg bx-seg st-lang'); langSeg.setAttribute('role', 'group'); langSeg.setAttribute('aria-label', 'Язык');
  [['', 'Все'], ['ru', 'RU'], ['en', 'EN'], ['other', 'Другие']].forEach(([v, l]) => { const b = el('button', null, l); b.type = 'button'; b.dataset.v = v; b.onclick = () => { ST.lang = v; save(); drawList(); }; langSeg.append(b); });
  const list = el('ol', 'st-list');
  const kindSeg = el('div', 'seg bx-seg st-lang st-kind'); kindSeg.setAttribute('role', 'group'); kindSeg.setAttribute('aria-label', 'Кто стримит');
  [['', 'Все'], ['solo', 'Стримеры'], ['org', 'Серии и румы']].forEach(([v, l]) => { const b = el('button', null, l); b.type = 'button'; b.dataset.v = v; b.onclick = () => { ST.kind = v; save(); drawList(); }; kindSeg.append(b); });
  side.append(sh, kindSeg, langSeg, list);
  const stage = el('div', 'st-stage');
  body.append(side, stage);
  root.append(head, body);

  let view = null, curUrl = DIR, curCh = null;
  // перерисовка списка — только когда что-то изменилось (статусы, фильтры, открытый канал): иначе каждые 2 минуты
  // список собирался заново и картинки превью перекачивались — открытый стрим на секунду подтормаживал
  let lastKey = '';
  function updSub() {
    const st = (login) => LIVE[login.toLowerCase()];
    const nLive = LIST.filter(x => st(x[0]) === true).length, known = LIST.some(x => st(x[0]) === true || st(x[0]) === false);
    const t = liveAt && !known ? 'не удалось проверить, кто в эфире — нет связи с Twitch' : liveAt ? 'в эфире ' + nLive + ' из ' + LIST.length + ' · проверено в ' + new Date(liveAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : inApp ? 'проверяю, кто в эфире…' : 'кто в эфире — видно в программе';
    if (shSub.textContent !== t) shSub.textContent = t;
  }
  const THUMBS = new Map(); // login → { img, at } — картинка превью переиспользуется, новая — не чаще раза в 5 минут
  const thumbOf = (login) => {
    const k = login.toLowerCase(), now = Date.now(); let t = THUMBS.get(k);
    if (!t || now - t.at > 300e3) {
      const img = (t && t.img) || el('img', 'st-thumb'); img.alt = ''; img.decoding = 'async'; img.loading = 'lazy';
      img.onerror = () => { img.hidden = true; }; img.onload = () => { img.hidden = false; };
      img.src = 'https://static-cdn.jtvnw.net/previews-ttv/live_user_' + k + '-160x90.jpg?t=' + Math.floor(now / 300e3);
      t = { img, at: now }; THUMBS.set(k, t);
    }
    return t.img;
  };
  function drawList() {
    const key = [ST.lang, ST.only, ST.kind, curCh, LIST.map(x => { const v = LIVE[x[0].toLowerCase()]; return v === true ? 1 : v === false ? 0 : '-'; }).join('')].join('|');
    updSub();
    if (key === lastKey) return; lastKey = key;
    langSeg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === ST.lang));
    kindSeg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === ST.kind));
    liveB.classList.toggle('on', ST.only); liveB.setAttribute('aria-pressed', String(ST.only));
    list.replaceChildren();
    const top = LIST.reduce((m, x) => Math.max(m, x[3]), 1);
    const st = (login) => LIVE[login.toLowerCase()];
    const rows = LIST.filter(x => !ST.lang || (ST.lang === 'other' ? !['ru', 'en'].includes(x[2]) : x[2] === ST.lang)).filter(x => !ST.only || st(x[0]) === true).filter(x => !ST.kind || (ST.kind === 'org') === isOrg(x[0]));
    rows.sort((a, b) => (st(b[0]) === true) - (st(a[0]) === true) || b[3] - a[3]); // в эфире — сверху
    if (!rows.length) list.append(el('li', 'st-empty', ST.only ? 'Сейчас никто из списка не в эфире.' : 'Нет стримеров.'));
    rows.forEach(([login, name, lang, h]) => {
      const live = st(login);
      const li = el('li'); const b = el('button', 'st-item' + (curCh === login ? ' on' : '')); b.type = 'button'; b.title = 'Открыть канал ' + name;
      const av = el('span', 'st-av', name.replace(/^[^\p{L}\p{N}]+/u, '').slice(0, 1).toUpperCase()); av.style.setProperty('--c', COL[lang] || '#9AA3B2');
      const tx = el('span', 'st-tx'); tx.append(el('b', null, name), el('em', null, lang.toUpperCase() + (h ? ' · ' + (h / 1000).toFixed(h >= 100000 ? 0 : 1).replace('.', ',') + ' тыс. ч' : '') + (isOrg(login) ? ' · канал' : '')));
      const bar = el('i', 'st-bar'); bar.style.width = Math.max(4, Math.round(h / top * 100)) + '%'; bar.style.background = COL[lang] || '#9AA3B2';
      const badge = live === true ? el('span', 'st-live', 'В эфире') : live === false ? el('span', 'st-off', 'не в сети') : null;
      if (live === true) { b.classList.add('is-live'); b.append(thumbOf(login)); }
      if (badge) tx.querySelector('b').append(badge);
      b.append(av, tx, bar); b.onclick = () => openUrl('https://www.twitch.tv/' + login, login);
      b.setAttribute('aria-label', name + (live === true ? ', в эфире' : live === false ? ', не в сети' : ''));
      li.append(b); list.append(li);
    });
  }
  function setNav() { /* кнопок навигации нет */ }
  function openUrl(url, ch) {
    curUrl = url; curCh = ch; drawList();
    if (view) { view.loadURL(url).catch(() => {}); setNav(); return; } // ошибку загрузки показывает did-fail-load
    if (!inApp) { preview(url, ch); setNav(); return; }
  }
  // в программе — окно Twitch; в онлайн-превью webview нет, там — карточка со ссылкой
  function mount() {
    if (!inApp) { preview(curUrl, curCh); return; }
    view = document.createElement('webview');
    view.className = 'st-view'; view.setAttribute('partition', 'persist:twitch'); view.setAttribute('src', curUrl);
    view.setAttribute('allowpopups', '');
    const loading = el('div', 'st-loading', 'Открываю Twitch…');
    let failed = false;
    view.addEventListener('did-start-loading', () => { failed = false; loading.hidden = false; loading.textContent = 'Открываю Twitch…'; });
    view.addEventListener('did-stop-loading', () => { if (!failed) loading.hidden = true; setNav(); });
    view.addEventListener('did-navigate', (e) => { curUrl = e.url; const m = /^https:\/\/www\.twitch\.tv\/([A-Za-z0-9_]+)\/?$/.exec(e.url); curCh = m && !/^(directory|search|settings|videos)$/i.test(m[1]) ? m[1] : null; drawList(); setNav(); });
    view.addEventListener('did-navigate-in-page', (e) => { if (e.isMainFrame) { curUrl = e.url; setNav(); } });
    view.addEventListener('did-fail-load', (e) => { if (e.errorCode !== -3 && e.isMainFrame !== false) { failed = true; loading.hidden = false; loading.textContent = 'Twitch не открылся (' + e.errorDescription + '). Проверьте интернет — программа попробует снова.'; setTimeout(() => { if (failed && view) view.reload(); }, 20e3); } });
    stage.replaceChildren(view, loading);
  }
  function preview(url, ch) {
    const c = el('div', 'st-prev');
    c.innerHTML = icon('<rect x="2.5" y="5" width="19" height="13" rx="2.5"/><path d="M10 9l5 3-5 3z"/>');
    c.append(el('h2', null, ch ? 'Канал ' + ch : 'Сейчас в эфире: раздел Poker на Twitch'),
      el('p', null, 'В программе здесь открывается Twitch: живые покерные стримы, самые смотрящие сверху, и сам стрим — с чатом, на весь экран. В онлайн-превью Twitch встроить нельзя.'));
    const a = el('a', 'btn-load', 'Открыть на Twitch'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; c.append(a);
    stage.replaceChildren(c);
  }
  // кто в эфире — при открытии раздела, по «Обновить» и каждые 2 минуты, пока раздел открыт
  async function checkLive(force) {
    if (!window.mda || !window.mda.streamsLive || liveBusy) return;
    if (!force && Date.now() - liveAt < 100e3) return;
    liveBusy = true;
    try { const r = await window.mda.streamsLive(LIST.map(x => x[0])); for (const k in r) LIVE[k] = r[k] && typeof r[k] === 'object' ? true : r[k]; const ok = Object.values(r).some(v => v === true || v === false); liveAt = ok ? Date.now() : Date.now() - 85e3; /* без ответа — повтор через ~15 с */ } catch (e) { /* нет сети — без значков */ }
    liveBusy = false; drawList();
  }
  setInterval(() => { if (!root.hidden) checkLive(false); }, 120e3);
  drawList();
  // Twitch загружается только когда раздел открыли (не при запуске программы)
  let mounted = false;
  const onShow = () => { if (root.hidden) return; checkLive(false); if (!mounted) { mounted = true; mount(); setNav(); } };
  const tab = document.getElementById('tabStreams'); if (tab) tab.addEventListener('click', onShow);
  // ушли на другую вкладку — стрим на паузе (и без звука); вернулись — продолжается с того же места
  const PAUSE = "document.querySelectorAll('video').forEach(v => { if (!v.paused) { v.dataset.mdaPaused = '1'; v.pause(); } }); true";
  const RESUME = "document.querySelectorAll('video').forEach(v => { if (v.dataset.mdaPaused === '1') { delete v.dataset.mdaPaused; v.play().catch(() => {}); } }); true";
  new MutationObserver(() => {
    if (!view) return;
    try {
      if (root.hidden) { view.setAudioMuted(true); view.executeJavaScript(PAUSE).catch(() => {}); }
      else { view.executeJavaScript(RESUME).catch(() => {}).finally(() => { try { view.setAudioMuted(false); } catch (e) { /* окно ещё не готово */ } }); }
    } catch (e) { /* окно Twitch ещё не загружено */ }
  }).observe(root, { attributes: true, attributeFilter: ['hidden'] });
  setTimeout(onShow, 0);
})();
