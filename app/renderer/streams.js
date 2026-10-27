'use strict';
// «Покерные стримы»: раздел Poker на Twitch прямо в программе (тег webview — только адреса Twitch, см. main.js)
// и список популярных покерных стримеров (по зрительским часам за месяц, TwitchMetrics, октябрь 2026):
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
    ['ChippyPoker', 'ChippyPoker', 'ru', 12110], ['GGPokerOfficial', 'GGPokerOfficial', 'en', 10909], ['TritonPoker', 'Triton Poker', 'en', 0]
  ];
  const COL = { en: '#6EC3E8', ru: '#F2B544', es: '#F08A7E', pt: '#7FD7A2', de: '#A99BF5', zh: '#F0A35E' };
  const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };
  const ST = (() => { try { return JSON.parse(localStorage.getItem('mda.streams') || '{}') || {}; } catch (e) { return {}; } })();
  const save = () => { try { localStorage.setItem('mda.streams', JSON.stringify({ lang: ST.lang })); } catch (e) { /* без сохранения */ } };
  ST.lang = ST.lang || '';
  const inApp = /Electron/.test(navigator.userAgent);
  const icon = (d) => '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';

  // ---------- каркас ----------
  root.classList.add('st-page');
  const head = el('div', 'st-head');
  const ht = el('div', 'nw-ht'); ht.append(el('h1', null, 'Покерные стримы'), el('p', 'nw-sub', 'Кто стримит покер на Twitch прямо сейчас — смотреть можно здесь же, не выходя из программы'));
  const tools = el('div', 'st-tools');
  const btn = (label, svg, fn, cls) => { const b = el('button', 'btn st-btn' + (cls ? ' ' + cls : '')); b.type = 'button'; b.innerHTML = svg; b.append(el('span', null, label)); b.onclick = fn; return b; };
  const liveB = btn('Сейчас в эфире', icon('<circle cx="12" cy="12" r="3"/><path d="M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>'), () => openUrl(DIR, null), 'on');
  const backB = btn('Назад', icon('<path d="M19 12H5M11 6l-6 6 6 6"/>'), () => { if (view && view.canGoBack()) view.goBack(); });
  const reloadB = btn('Обновить', icon('<path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5"/>'), () => { if (view) view.reload(); else drawList(); });
  const extB = btn('В браузере', icon('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'), () => window.open(curUrl, '_blank'));
  tools.append(liveB, backB, reloadB, extB);
  head.append(ht, tools);
  const body = el('div', 'st-body');
  const side = el('aside', 'st-side'); side.setAttribute('aria-label', 'Популярные покерные стримеры');
  const sh = el('div', 'st-side-h'); sh.append(el('b', null, 'Популярные стримеры'), el('span', null, 'по просмотрам за месяц'));
  const langSeg = el('div', 'seg bx-seg st-lang'); langSeg.setAttribute('role', 'group'); langSeg.setAttribute('aria-label', 'Язык');
  [['', 'Все'], ['ru', 'RU'], ['en', 'EN'], ['other', 'Другие']].forEach(([v, l]) => { const b = el('button', null, l); b.type = 'button'; b.dataset.v = v; b.onclick = () => { ST.lang = v; save(); drawList(); }; langSeg.append(b); });
  const list = el('ol', 'st-list');
  side.append(sh, langSeg, list);
  const stage = el('div', 'st-stage');
  body.append(side, stage);
  root.append(head, body);

  let view = null, curUrl = DIR, curCh = null;
  function drawList() {
    langSeg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === ST.lang));
    list.replaceChildren();
    const top = LIST.reduce((m, x) => Math.max(m, x[3]), 1);
    LIST.filter(x => !ST.lang || (ST.lang === 'other' ? !['ru', 'en'].includes(x[2]) : x[2] === ST.lang)).forEach(([login, name, lang, h]) => {
      const li = el('li'); const b = el('button', 'st-item' + (curCh === login ? ' on' : '')); b.type = 'button'; b.title = 'Открыть канал ' + name;
      const av = el('span', 'st-av', name.replace(/^[^\p{L}\p{N}]+/u, '').slice(0, 1).toUpperCase()); av.style.setProperty('--c', COL[lang] || '#9AA3B2');
      const tx = el('span', 'st-tx'); tx.append(el('b', null, name), el('em', null, lang.toUpperCase() + (h ? ' · ' + (h / 1000).toFixed(h >= 100000 ? 0 : 1).replace('.', ',') + ' тыс. ч' : ' · турниры')));
      const bar = el('i', 'st-bar'); bar.style.width = Math.max(4, Math.round(h / top * 100)) + '%'; bar.style.background = COL[lang] || '#9AA3B2';
      b.append(av, tx, bar); b.onclick = () => openUrl('https://www.twitch.tv/' + login, login);
      li.append(b); list.append(li);
    });
  }
  function setNav() { liveB.classList.toggle('on', !curCh); if (backB) backB.disabled = !(view && view.canGoBack && (() => { try { return view.canGoBack(); } catch (e) { return false; } })()); }
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
    view.addEventListener('did-fail-load', (e) => { if (e.errorCode !== -3 && e.isMainFrame !== false) { failed = true; loading.hidden = false; loading.textContent = 'Twitch не открылся (' + e.errorDescription + '). Проверьте интернет и нажмите «Обновить».'; } });
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
  drawList();
  // Twitch загружается только когда раздел открыли (не при запуске программы)
  let mounted = false;
  const onShow = () => { if (!root.hidden && !mounted) { mounted = true; mount(); setNav(); } };
  const tab = document.getElementById('tabStreams'); if (tab) tab.addEventListener('click', onShow);
  setTimeout(onShow, 0);
})();
