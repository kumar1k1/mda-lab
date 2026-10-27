'use strict';
// Лента новостей: материалы покерных сайтов за последний месяц (заголовок, описание, ссылка на источник).
// Теги ставятся здесь по словам заголовка, описания и рубрик сайта; материалы про трекеры, HUD и софт
// поднимаются наверх отдельным блоком «Важно для вас» — они касаются работы с этой программой.
(function () {
  const root = document.getElementById('pgNews'); if (!root) return;
  const DAY = 864e5, MONTH = 31 * DAY; // лента — за последний месяц
  const TAGS = [
    { id: 'soft', name: 'Софт и трекеры', re: /\b(hud|huds|tracker|trackers|hand2note|pokertracker|holdem manager|hold'em manager|software|third-party|screenshield|rta|real-time assistance|client)\b|трекер|софт|худ|программ|клиент/i },
    { id: 'sec', name: 'Честная игра', re: /\b(cheat|cheating|cheater|bot|bots|superuser|superusers|security|malware|collusion|hack|hacked|integrity|fraud)\b|мошен|суперюзер|бот[аыов]?\b|безопасн|читер|вирус|взлом/i },
    { id: 'law', name: 'Законы и регулирование', re: /\b(regulat\w*|legal\w*|law|laws|licen[cs]\w*|court|sues|sued|lawsuit|police|raid|raided|bill|gambling ban)\b|закон|лиценз|суд|регулир|запрет|полици/i },
    { id: 'tour', name: 'Турниры и серии', re: /\b(series|festival|championship|main event|guarantee[ds]?|gtd|schedule|calendar|satellite|qualif\w*|wsop|ept|wpt|pgt|poker masters|circuit|scoop|wcoop|sunday)\b|сери[яиюей]|турнир|фестивал|гарант|отбор|сателлит|расписан|воскресник/i },
    { id: 'win', name: 'Результаты', re: /\b(wins?|won|winner|victory|title|bracelet|trophy|trophies|champion|runs the table|denies|crowned|final table)\b|выиграл|побед|чемпион|браслет|финальн|пиджак/i },
    { id: 'promo', name: 'Румы и акции', re: /\b(promo\w*|rakeback|bonus|leaderboard|jackpot|freeroll\w*|happy hour|giveaway)\b|акци[яиюей]|рейкбек|бонус|лидерборд|джекпот|фриролл|запустил|розыгрыш|разыграет/i },
    { id: 'strat', name: 'Стратегия', re: /\b(strategy|tips|how to|gto|solver|lesson|mistakes|exploit\w*)\b|стратег|совет|разбор|ошибк|обучен/i },
    { id: 'people', name: 'Люди и соцсети', re: /\b(interview|podcast|social media|stream\w*|ambassador)\b|соцсет|интервью|подкаст|стрим|амбассадор|блог/i }
  ];
  const TAG = Object.fromEntries(TAGS.map(t => [t.id, t]));
  const SRC_COL = ['#F2B544', '#6EC3E8', '#7FD7A2', '#F08A7E', '#A99BF5', '#E9C46A', '#5CC8E6', '#F0A35E', '#C792EA', '#8FD3C7', '#F5A3C7', '#B5C96A', '#8AB4F8', '#E8A87C'];
  const tagsOf = (it) => { const s = it.title + ' ' + it.desc + ' ' + (it.cats || []).join(' '); const out = TAGS.filter(t => t.re.test(s)).map(t => t.id); if (it.kind === 'strat' && !out.includes('strat')) out.unshift('strat'); return out.slice(0, 3); };
  const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };
  const ST = (() => { try { return JSON.parse(localStorage.getItem('mda.news') || '{}') || {}; } catch (e) { return {}; } })();
  const save = () => { try { localStorage.setItem('mda.news', JSON.stringify({ tag: ST.tag, lang: ST.lang })); } catch (e) { /* без сохранения */ } };
  ST.tag = ST.tag || ''; ST.lang = ST.lang || ''; ST.q = '';
  let DATA = null, loading = false, SRCS = {};

  const ago = (t, now) => {
    const m = Math.round((now - t) / 60e3);
    if (m < 60) return Math.max(1, m) + ' мин назад';
    const h = Math.round(m / 60); if (h < 24) return h + ' ч назад';
    const d = Math.floor((now - t) / DAY); return d === 1 ? 'вчера' : d + ' дн. назад';
  };
  const dayName = (t, now) => {
    const a = new Date(t), b = new Date(now); a.setHours(0, 0, 0, 0); b.setHours(0, 0, 0, 0);
    const d = Math.round((b - a) / DAY);
    if (d === 0) return 'Сегодня'; if (d === 1) return 'Вчера';
    return new Date(t).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, c => c.toUpperCase());
  };

  // ---------- каркас ----------
  root.classList.remove('page-soon'); root.classList.add('news-page'); root.replaceChildren();
  const wrap = el('div', 'nw');
  const head = el('div', 'nw-head');
  const ht = el('div', 'nw-ht'); ht.append(el('h1', null, 'Лента новостей'));
  const sub = el('p', 'nw-sub', 'Покерные новости за месяц из открытых лент сайтов'); ht.append(sub);
  const refresh = el('button', 'btn nw-refresh'); refresh.type = 'button';
  refresh.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5"/></svg><span>Обновить</span>';
  refresh.onclick = () => load(true);
  head.append(ht, refresh);
  const bar = el('div', 'nw-bar');
  const chips = el('div', 'nw-chips'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', 'Темы');
  const right = el('div', 'nw-right');
  const langSeg = el('div', 'seg bx-seg nw-lang'); langSeg.setAttribute('role', 'group'); langSeg.setAttribute('aria-label', 'Язык');
  [['', 'Все'], ['ru', 'RU'], ['en', 'EN']].forEach(([v, l]) => { const b = el('button', null, l); b.type = 'button'; b.dataset.v = v; b.onclick = () => { ST.lang = v; save(); draw(); }; langSeg.append(b); });
  const search = el('input', 'nw-search'); search.type = 'search'; search.placeholder = 'Поиск по новостям'; search.setAttribute('aria-label', 'Поиск по новостям');
  search.oninput = () => { ST.q = search.value.trim().toLowerCase(); draw(); };
  right.append(langSeg, search);
  bar.append(chips, right);
  const body = el('div', 'nw-body');
  const foot = el('p', 'nw-foot');
  wrap.append(head, bar, body, foot); root.append(wrap);

  function card(it, src, now, big) {
    const a = el('a', 'nw-card' + (big ? ' big' : '')); a.href = it.link; a.target = '_blank'; a.rel = 'noopener noreferrer';
    if (it.img) { const im = el('div', 'nw-img'); const i = el('img'); i.src = it.img; i.alt = ''; i.loading = 'lazy'; i.onerror = () => im.remove(); im.append(i); a.append(im); }
    const meta = el('div', 'nw-meta');
    const s = el('span', 'nw-src'); s.style.setProperty('--c', src.color); s.append(el('i'), document.createTextNode(src.name)); meta.append(s);
    meta.append(el('span', 'nw-lang-b', it.lang.toUpperCase()), el('span', 'nw-time', ago(it.date, now)));
    a.append(meta, el('h3', 'nw-title', it.title));
    if (it.desc) a.append(el('p', 'nw-desc', it.desc));
    if (it.also && it.also.length) a.append(el('p', 'nw-also', 'Также пишут: ' + it.also.map(x => (SRCS[x.src] || { name: x.src }).name).join(', ')));
    const tg = el('div', 'nw-tags'); it.tags.forEach(t => tg.append(el('span', 'nw-tag t-' + t, TAG[t].name))); if (it.tags.length) a.append(tg);
    return a;
  }

  function draw() {
    if (!DATA) return;
    const now = DATA.asOf || Date.now(), srcs = SRCS;
    (DATA.sources || []).forEach((s, i) => { srcs[s.id] = { name: s.name, color: SRC_COL[i % SRC_COL.length] }; });
    const all = DATA.items.map(it => Object.assign({}, it, { tags: tagsOf(it) }));
    const inLang = all.filter(it => !ST.lang || it.lang === ST.lang);
    const week = inLang.filter(it => now - it.date < MONTH);
    // чипы тем с числом материалов за месяц
    chips.replaceChildren();
    const chip = (id, name, n) => { const b = el('button', 'nw-chip' + (id ? ' t-' + id : '')); b.type = 'button'; b.setAttribute('aria-pressed', String(ST.tag === id)); b.append(document.createTextNode(name), el('span', null, String(n))); b.onclick = () => { ST.tag = id; save(); draw(); }; chips.append(b); };
    chip('', 'Все', week.length);
    TAGS.forEach(t => { const n = week.filter(it => it.tags.includes(t.id)).length; if (n) chip(t.id, t.name, n); });
    langSeg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === ST.lang));
    // «Важно для вас»: софт и трекеры (касается работы с программой)
    const q = ST.q, match = (it) => (!ST.tag || it.tags.includes(ST.tag)) && (!q || (it.title + ' ' + it.desc).toLowerCase().includes(q));
    const softT = (it) => TAG.soft.re.test(it.title) ? 1 : 0; // сначала те, где о софте сказано в заголовке
    const imp = inLang.filter(it => it.tags.includes('soft') && match(it)).sort((x, y) => softT(y) - softT(x) || y.date - x.date).slice(0, 3);
    const impSet = new Set(imp.map(it => it.link));
    const list = week.filter(it => match(it) && !impSet.has(it.link));
    body.replaceChildren();
    if (imp.length) {
      const box = el('section', 'nw-imp'); box.setAttribute('aria-label', 'Важно для вас');
      const h = el('div', 'nw-imp-h'); h.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>';
      h.append(el('b', null, 'Важно для вас'), el('span', null, 'касается трекеров, HUD и софта рядом с клиентом рума'));
      const g = el('div', 'nw-imp-g'); imp.forEach(it => g.append(card(it, srcs[it.src] || { name: it.src, color: '#888' }, now, true)));
      box.append(h, g); body.append(box);
    }
    if (!list.length && !imp.length) { const e = el('div', 'nw-empty'); e.append(el('b', null, 'Ничего не найдено'), el('span', null, 'Измените тему, язык или поиск.')); body.append(e); }
    // по дням
    let cur = null, grid = null;
    list.forEach(it => {
      const d = dayName(it.date, now);
      if (d !== cur) { cur = d; const sec = el('section', 'nw-day'); sec.append(el('h2', null, d)); grid = el('div', 'nw-grid'); sec.append(grid); body.append(sec); }
      grid.append(card(it, srcs[it.src] || { name: it.src, color: '#888' }, now, false));
    });
    const nSrc = new Set(DATA.items.map(it => it.src)).size;
    sub.textContent = 'Покерные новости за месяц · ' + week.length + ' материалов из ' + nSrc + ' источников' + (DATA.updated ? ' · обновлено ' + new Date(DATA.updated).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '');
    foot.textContent = (DATA.note ? DATA.note + ' ' : '') + 'Заголовки и описания — из открытых лент сайтов, полный текст открывается на сайте источника.' + (DATA.errors && DATA.errors.length ? ' Не ответили: ' + DATA.errors.map(e => e.src).join(', ') + '.' : '');
  }

  async function load(force) {
    if (loading || !window.mda || !window.mda.newsGet) return;
    loading = true; refresh.disabled = true; refresh.classList.add('spin');
    if (!DATA) body.replaceChildren(window.mdaLoad ? window.mdaLoad('Загружаю новости…') : el('div', 'nw-empty', 'Загружаю новости…'));
    try { DATA = await window.mda.newsGet(force); } catch (e) { if (!DATA) body.replaceChildren(el('div', 'nw-empty', 'Не удалось загрузить новости: ' + e.message)); }
    loading = false; refresh.disabled = false; refresh.classList.remove('spin');
    draw();
  }
  // загрузка — когда раздел открыли впервые (и при запуске, если он открыт)
  const tab = document.getElementById('tabNews');
  // при каждом открытии раздела — свежая лента (программа сама перекачивает её, если прошло больше 10 минут)
  const onShow = () => { if (!root.hidden && !(DATA && DATA.asOf)) load(false); };
  if (tab) tab.addEventListener('click', onShow);
  setTimeout(onShow, 0);
})();
