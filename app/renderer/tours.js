'use strict';
/* global el, DB, HERO_DB, state, replaysFor, Replay */
// «Личный кабинет → Мои турниры»: все сыгранные турниры из вашей базы (поиск по названию, рум, период), по нажатию —
// реплеер турнира: слева обычный стол, справа лента всех раздач по порядку с ходом действий и цветом результата,
// график стека и фильтры-споты (олл-ины, 3-беты, крупные банки…). Турниры — те же, что считает «Результаты»
// (рум + номер турнира; пауза больше 90 минут — другой розыгрыш).
(function () {
  const fmt = (v) => { const r = Math.round(v * 10) / 10, t = Number.isInteger(r) ? String(r) : r.toFixed(1), [a, b] = t.split('.'); return a.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (b ? ',' + b : ''); };
  const sgn = (v) => (v > 0.05 ? '+' : v < -0.05 ? '−' : '') + fmt(Math.abs(v));
  const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };
  const sp = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const pad = (n) => String(n).padStart(2, '0');
  const dTxt = (m) => { const d = new Date(m * 60000); return d.getDate() + ' ' + MON[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '') + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const durTxt = (min) => min < 60 ? min + ' мин' : Math.floor(min / 60) + ' ч ' + pad(min % 60) + ' мин';
  const SUIT = { s: '♠', h: '♥', d: '♦', c: '♣' };
  const cardsEl = (str) => { const w = el('span', 'tv-cards'); String(str || '').split(' ').filter(Boolean).forEach(c => w.append(el('i', 'tv-c s-' + c[1], (c[0] === 'T' ? '10' : c[0]) + (SUIT[c[1]] || '')))); return w; };

  // ---------- настройки списка ----------
  const ST = (() => { try { return JSON.parse(localStorage.getItem('mda.tours') || '{}') || {}; } catch (e) { return {}; } })();
  ST.q = ''; ST.only = !!ST.only; ST.room = ST.room == null ? -1 : ST.room; ST.per = ST.per || 'all'; ST.sort = ST.sort || 'new';
  const save = () => { try { localStorage.setItem('mda.tours', JSON.stringify({ room: ST.room, per: ST.per, sort: ST.sort, only: ST.only })); } catch (e) { /* без сохранения */ } };

  // ---------- отмеченные раздачи ----------
  // хранятся по устойчивому ключу раздачи (рум, время, карты), а не по номеру строки базы — дозагрузка рук их не сбивает
  const MK = (() => { try { return JSON.parse(localStorage.getItem('mda.marks') || '{}') || {}; } catch (e) { return {}; } })();
  const saveMK = () => { try { localStorage.setItem('mda.marks', JSON.stringify(MK)); } catch (e) { /* без сохранения */ } };
  const tourKey = (t) => (TL.rooms[t.room] || '') + '|' + t.name + '|' + t.start;
  const handKey = (t, rp) => tourKey(t) + '|' + (rp.d || '') + '|' + (rp.hc || '') + '|' + (rp.pl && rp.pl[rp.h] ? rp.pl[rp.h][0] + rp.pl[rp.h][1] : '');
  const marksOf = (t) => { const p = tourKey(t) + '|'; let n = 0; for (const k in MK) if (k.startsWith(p)) n++; return n; };
  // заметки к раздачам — по тому же ключу
  const NT = (() => { try { return JSON.parse(localStorage.getItem('mda.notes') || '{}') || {}; } catch (e) { return {}; } })();
  const saveNT = () => { try { localStorage.setItem('mda.notes', JSON.stringify(NT)); } catch (e) { /* без сохранения */ } };
  const notesOf = (t) => { const p = tourKey(t) + '|'; let n = 0; for (const k in NT) if (k.startsWith(p)) n++; return n; };

  // ---------- турниры из данных «Результатов» ----------
  let TL = null;
  async function data() {
    const D = window.MDAResults && await window.MDAResults.load(); if (!D) return null;
    if (TL && TL.D === D) return TL;
    const c = D.db.cols, by = new Map();
    for (let i = 0; i < D.n; i++) { const k = D.tour[i]; if (k < 0) continue; let a = by.get(k); if (!a) { a = []; by.set(k, a); } a.push(i); }
    const list = [];
    for (const [k, ids] of by) {
      ids.sort((x, y) => D.t[x] - D.t[y] || x - y);
      const tt = D.titles[D.tours[k][0]] || { t: '', room: -1 };
      let net = 0, ev = 0; const cum = [0];
      for (const i of ids) { const v = c.net[i] / 10; net += v; ev += (c.nev ? c.nev[i] : c.net[i]) / 10; cum.push(net); }
      const name = String(tt.t || '').replace(/ · \(\d{5,}\)$/, '').trim() || 'Турнир без названия';
      const bi = c.bi ? c.bi[ids[0]] : -1;
      list.push({ k, ids, name, room: tt.room, start: D.tours[k][1], end: D.tours[k][2], net, ev, cum, bi });
    }
    TL = { D, list, rooms: D.db.rooms || [] };
    return TL;
  }

  // ---------- список ----------
  let HOST = null, SHOWN = 150, LISTDIRTY = false, REDRAW = null;
  async function draw(main) {
    HOST = main; main.replaceChildren(window.mdaLoad ? window.mdaLoad('Собираю турниры из базы…') : el('p', null, 'Собираю турниры…'));
    let T = null; try { T = await data(); } catch (e) { T = null; }
    if (HOST !== main) return;
    main.replaceChildren();
    const head = el('div', 'tv-head'); head.append(el('h2', null, 'Мои турниры'), el('p', null, 'Все сыгранные турниры из вашей базы. Найдите турнир по названию или руму и нажмите на него — откроется реплеер со всеми раздачами турнира по порядку: ход действий, цвет результата, график стека и переход по спотам.'));
    main.append(head);
    if (!T || !T.list.length) { main.append(el('p', 'tv-empty', typeof HERO_DB !== 'undefined' && HERO_DB ? 'В базе пока нет турниров с записью хода раздач.' : 'Загрузите свою базу — здесь появятся ваши турниры.')); return; }
    const own = typeof DB !== 'undefined' && typeof HERO_DB !== 'undefined' && DB === HERO_DB && !(typeof state !== 'undefined' && state.player) && !(DB && DB.src);
    if (!own) main.append(el('p', 'tv-warn', 'Сейчас открыта база другого игрока или алиаса. Реплеер турниров работает с вашей базой — переключитесь на неё в «Моя база».'));
    // фильтры
    const bar = el('div', 'tv-bar');
    const q = el('input', 'tv-q'); q.type = 'search'; q.placeholder = 'Поиск по названию турнира'; q.value = ST.q; q.setAttribute('aria-label', 'Поиск по названию турнира');
    let qt = null; q.oninput = () => { clearTimeout(qt); qt = setTimeout(() => { ST.q = q.value.trim().toLowerCase(); SHOWN = 150; drawRows(); }, 150); };
    const seg = (key, opts, label) => { const g = el('div', 'seg bx-seg'); g.setAttribute('role', 'group'); g.setAttribute('aria-label', label); opts.forEach(([v, l]) => { const b = el('button', ST[key] === v ? 'on' : null, l); b.type = 'button'; b.onclick = () => { ST[key] = v; save(); [...g.children].forEach(x => x.classList.toggle('on', x === b)); SHOWN = 150; drawRows(); }; g.append(b); }); return g; };
    // только турниры, где есть отмеченные раздачи или заметки
    const onlyB = el('button', 'tv-only' + (ST.only ? ' on' : '')); onlyB.type = 'button'; onlyB.setAttribute('aria-pressed', String(ST.only));
    const flagged = () => T.list.filter(t => marksOf(t) || notesOf(t)).length;
    const onlyLab = () => { onlyB.replaceChildren(el('i', null, '★ ✎'), document.createTextNode('С отметками и заметками'), el('span', null, String(flagged()))); };
    onlyLab(); onlyB.title = 'Показать только турниры, где есть отмеченные раздачи или заметки';
    onlyB.onclick = () => { ST.only = !ST.only; save(); onlyB.classList.toggle('on', ST.only); onlyB.setAttribute('aria-pressed', String(ST.only)); SHOWN = 150; drawRows(); };
    bar.append(q, onlyB, seg('per', [['all', 'Всё время'], ['w', '7 дней'], ['q', '3 месяца'], ['y', 'Год']], 'Период'), seg('sort', [['new', 'Сначала новые'], ['old', 'Сначала старые'], ['best', 'Лучший итог'], ['worst', 'Худший итог'], ['long', 'Больше раздач']], 'Порядок'));
    const rb = el('div', 'tv-rooms'); rb.setAttribute('role', 'group'); rb.setAttribute('aria-label', 'Рум');
    const rc = new Map(); T.list.forEach(t => rc.set(t.room, (rc.get(t.room) || 0) + 1));
    const roomB = (v, label, n) => { const b = el('button', 'tv-rm' + (ST.room === v ? ' on' : '')); b.type = 'button'; b.append(document.createTextNode(label), el('span', null, String(n))); b.onclick = () => { ST.room = v; save(); [...rb.children].forEach(x => x.classList.toggle('on', x === b)); SHOWN = 150; drawRows(); }; return b; };
    rb.append(roomB(-1, 'Все румы', T.list.length));
    [...rc].sort((a, b) => b[1] - a[1]).forEach(([r, n]) => rb.append(roomB(r, T.rooms[r] || '?', n)));
    if (ST.room !== -1 && !rc.has(ST.room)) ST.room = -1;
    const sum = el('div', 'tv-sum'); sum.setAttribute('aria-live', 'polite');
    const box = el('div', 'tv-list');
    main.append(bar, rb, sum, box);
    function drawRows() {
      const now = Date.now() / 60000, lim = ST.per === 'w' ? 7 * 1440 : ST.per === 'q' ? 92 * 1440 : ST.per === 'y' ? 366 * 1440 : 0;
      onlyLab();
      let L = T.list.filter(t => (!ST.only || marksOf(t) || notesOf(t)) && (ST.room === -1 || t.room === ST.room) && (!lim || now - t.start <= lim) && (!ST.q || t.name.toLowerCase().includes(ST.q)));
      const S = { new: (a, b) => b.start - a.start, old: (a, b) => a.start - b.start, best: (a, b) => b.net - a.net, worst: (a, b) => a.net - b.net, long: (a, b) => b.ids.length - a.ids.length };
      L.sort(S[ST.sort] || S.new);
      const hands = L.reduce((a, t) => a + t.ids.length, 0), net = L.reduce((a, t) => a + t.net, 0);
      sum.replaceChildren(el('span', null, L.length + ' ' + plural(L.length, 'турнир', 'турнира', 'турниров') + ' · ' + sp(hands) + ' ' + plural(hands, 'раздача', 'раздачи', 'раздач')));
      box.replaceChildren();
      if (!L.length) { box.append(el('p', 'tv-empty', 'Под эти условия турниров нет.')); return; }
      const hd = el('div', 'tv-row tv-th'); ['Начало', 'Турнир', 'Раздач', 'Итог, BB', 'Ход турнира'].forEach(x => hd.append(el('span', null, x))); box.append(hd);
      L.slice(0, SHOWN).forEach(t => box.append(row(t, own)));
      if (L.length > SHOWN) { const more = el('button', 'btn tv-more', 'Показать ещё ' + Math.min(150, L.length - SHOWN) + ' из ' + (L.length - SHOWN)); more.type = 'button'; more.onclick = () => { SHOWN += 150; drawRows(); }; box.append(more); }
    }
    drawRows(); REDRAW = drawRows;
  }
  function spark(cum) {
    const W = 120, H = 30, n = cum.length, step = Math.max(1, Math.floor(n / 60));
    let mn = 0, mx = 0; cum.forEach(v => { if (v < mn) mn = v; if (v > mx) mx = v; }); const rg = mx - mn || 1;
    const pts = []; for (let k = 0; k < n; k += step) pts.push([k / (n - 1 || 1) * W, H - 2 - (cum[k] - mn) / rg * (H - 4)]);
    pts.push([W, H - 2 - (cum[n - 1] - mn) / rg * (H - 4)]);
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('class', 'tv-spark'); svg.setAttribute('aria-hidden', 'true');
    const z = document.createElementNS(NS, 'line'); const zy = H - 2 - (0 - mn) / rg * (H - 4); z.setAttribute('x1', 0); z.setAttribute('x2', W); z.setAttribute('y1', zy); z.setAttribute('y2', zy); z.setAttribute('class', 'z'); svg.append(z);
    const p = document.createElementNS(NS, 'polyline'); p.setAttribute('points', pts.map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ')); p.setAttribute('class', cum[n - 1] >= 0 ? 'up' : 'down'); svg.append(p);
    return svg;
  }
  function row(t, own) {
    const r = el('button', 'tv-row'); r.type = 'button'; r.disabled = !own;
    const d = el('span', 'tv-d'); d.append(el('b', null, dTxt(t.start).split(', ')[0]), el('small', null, dTxt(t.start).split(', ')[1] + ' · ' + durTxt(Math.max(1, t.end - t.start))));
    const nm = el('span', 'tv-nm'); const rm = el('i', 'tv-rb', (TL.rooms[t.room] || '?')); nm.append(el('b', null, t.name));
    const sub = el('small'); sub.append(rm); const mk = marksOf(t), nt = notesOf(t); if (mk) { const b = el('i', 'tv-mk', '★ ' + mk); b.title = 'Отмеченных раздач: ' + mk; sub.append(b); } if (nt) { const b = el('i', 'tv-nt', '✎ ' + nt); b.title = 'Раздач с заметками: ' + nt; sub.append(b); } if (t.bi > 0) sub.append(' бай-ин $' + (t.bi / 100).toFixed(t.bi % 100 ? 2 : 0).replace('.', ',')); nm.append(sub);
    const n = el('span', 'tv-n', sp(t.ids.length));
    const res = el('span', 'tv-res'); res.append(el('b', t.net >= 0 ? 'up' : 'down', sgn(t.net))); if (Math.abs(t.ev - t.net) > 0.5) res.append(el('small', null, 'EV ' + sgn(t.ev)));
    const g = el('span', 'tv-g'); g.append(spark(t.cum));
    r.append(d, nm, n, res, g);
    r.title = own ? 'Открыть реплеер турнира' : 'Реплеер — для вашей базы';
    r.onclick = () => openTour(t);
    return r;
  }

  // ---------- разбор раздачи для ленты: ход действий и цвет результата ----------
  const RZ = ['рейз', '3-бет', '4-бет', '5-бет', '6-бет'];
  function info(rp, net) {
    const h = rp.h, n = rp.pl.length, who = (i) => i === h ? 'Вы' : rp.pl[i][0];
    const folded = new Array(n).fill(false), vol = new Array(n).fill(false);
    const streets = [[]]; let s = 0, raises = 0, checked = new Set(), sawFlop = false, heroVol = false, heroBlind = false, heroAI = false, heroFold = false;
    const won = new Map();
    for (const [st, i, t, a, ai] of rp.ev) {
      if (t === 'A' || t === 'SB' || t === 'BB') { if (i === h && t !== 'A') heroBlind = true; continue; }
      if (t === 'S') { s = st; streets[s] = []; checked = new Set(); if (s >= 1 && !folded[h]) sawFlop = true; continue; }
      if (t === 'W') { won.set(i, (won.get(i) || 0) + a); continue; }
      if (t === 'U') continue;
      let txt = null;
      if (t === 'f') { folded[i] = true; if (i === h) heroFold = true; if (s > 0 || vol[i] || i === h) txt = who(i) + ' фолд'; }
      else if (t === 'x') { checked.add(i); txt = who(i) + ' чек'; }
      else if (t === 'c') { vol[i] = true; txt = who(i) + (s === 0 && raises === 0 ? ' лимп' : ' колл'); }
      else if (t === 'b') { vol[i] = true; txt = who(i) + ' бет ' + fmt(a); }
      else if (t === 'r') { vol[i] = true; if (s === 0) { txt = who(i) + ' ' + (RZ[raises] || 'рейз') + ' ' + fmt(a); raises++; } else txt = who(i) + (checked.has(i) ? ' чек-рейз ' : ' рейз ') + fmt(a); }
      if (i === h && (t === 'c' || t === 'b' || t === 'r')) heroVol = true;
      if (ai && (t === 'c' || t === 'b' || t === 'r')) { if (txt) txt += ' олл-ин'; if (i === h) heroAI = true; }
      if (txt) streets[s].push(txt);
    }
    const hw = won.get(h) || 0, others = [...won].filter(([i, v]) => i !== h && v > 0);
    const chop = hw > 0 && others.some(([, v]) => Math.abs(v - hw) <= Math.max(0.15, hw * 0.08));
    let cls;
    if (chop && Math.abs(net) < Math.max(1, hw * 0.25)) cls = 'ch';
    else if (net > 0.05) cls = sawFlop ? 'w2' : 'w1';
    else if (net < -0.05 && sawFlop) cls = 'l2';
    else if (net < -0.05 && (heroVol || heroBlind)) cls = 'l1';
    else if (!heroVol && !heroBlind) cls = 'x';
    else cls = net < 0 ? 'l1' : 'ch';
    const bd = rp.bd || [];
    const totW = [...won.values()].reduce((a, v) => a + v, 0);
    return { cls, streets, bd, ai: heroAI, tb: raises >= 2 && heroVol, big: totW >= 20 && (heroVol || sawFlop), played: cls !== 'x', heroFold };
  }
  const CLS_T = { w2: 'Выиграна с постфлопом', w1: 'Выиграна без постфлопа', ch: 'Банк поделён', l2: 'Проиграна с постфлопом', l1: 'Проиграна без постфлопа (в том числе блайнды)', x: 'Не сыграна — сброс без вложений' };

  // ---------- реплеер турнира ----------
  const SPOTS = [['all', 'Все', 'Все раздачи турнира по порядку.'], ['pl', 'Сыгранные', 'Раздачи, где вы вложили фишки сами или были на блайндах, — без пустых пасов.'], ['ai', 'Олл-ины', 'Раздачи, где вы шли олл-ин или уравнивали олл-ин.'], ['tb', '3-бет банки', 'Банки, где до флопа был 3-бет или больше, и вы в них участвовали.'], ['big', 'Крупные банки', 'Банки от 20 BB, в которых вы участвовали.'], ['win', 'Выигранные', 'Раздачи с вашим выигрышем (зелёные).'], ['lose', 'Проигранные', 'Раздачи с вашим проигрышем (красные), включая сброс с блайндов.'], ['mk', '★ Отмеченные', 'Раздачи, которые вы отметили звёздочкой в реплеере (кнопка ★ или клавиша M).'], ['nt', '✎ С заметками', 'Раздачи, к которым вы оставили заметку (поле «Заметка» внизу ленты).']];
  const inSpot = (x, f) => f === 'all' || (f === 'mk' && !!MK[x.mk]) || (f === 'nt' && !!NT[x.mk]) || (f === 'pl' && x.played) || (f === 'ai' && x.ai) || (f === 'tb' && x.tb) || (f === 'big' && x.big) || (f === 'win' && (x.cls === 'w1' || x.cls === 'w2')) || (f === 'lose' && (x.cls === 'l1' || x.cls === 'l2'));
  let BUSY = false;
  async function openTour(t) {
    if (BUSY) return; BUSY = true;
    if (window.mdaBusy) window.mdaBusy(true, 'Загружаю раздачи турнира…');
    let R = {};
    try { for (let a = 0; a < t.ids.length; a += 400) Object.assign(R, await replaysFor(t.ids.slice(a, a + 400))); } catch (e) { R = {}; }
    if (window.mdaBusy) window.mdaBusy(false);
    BUSY = false;
    const c = DB.cols, H = [];
    t.ids.forEach((i, k) => { const rp = R[i]; if (!rp) return; const net = c.net[i] / 10; H.push(Object.assign({ i, no: k + 1, rp, net, mk: handKey(t, rp), stack: rp.pl[rp.h][1] * (rp.c > 0 ? rp.c : 1), lvl: rp.c > 0 ? rp.c : 0 }, info(rp, net))); });
    if (!H.length) return;
    const side = makeSide(t, H);
    window.openReplayer(H[0].i, side.list(), { side });
  }

  // Лента раздач справа (как в Hand2Note): номер, ваши карты, позиция, доска (если открывалась), итог; цвет — результат.
  // Ход действий соперников здесь не показывается — он виден на столе.
  function makeSide(t, H) {
    let stripMk = null, stripNt = null, strip0 = null;
    const stripCounts = (flash) => { if (!stripMk) return; const m = H.filter(x => MK[x.mk]).length, n = H.filter(x => NT[x.mk]).length; stripMk.textContent = m ? '★ ' + m : ''; stripNt.textContent = n ? '✎ ' + n : ''; if (flash && root && root.classList.contains('collapsed')) { const st = stripMk.parentNode; st.classList.remove('pulse'); void st.offsetWidth; st.classList.add('pulse'); } };
    let noteBox = null, noteTa = null, noteLab = null, noteSt = null, noteDel = null, undoT = null;
    function showUndo(x, old) {
      clearTimeout(undoT); noteSt.replaceChildren();
      const u = el('button', 'tv-note-undo', 'Вернуть'); u.type = 'button';
      u.onclick = () => { clearTimeout(undoT); NT[x.mk] = old; saveNT(); counts(); refreshRow(x); if (x.i === cur) { noteTa.value = old; noteSt.textContent = 'сохранено'; noteDel.hidden = false; } const nb = document.querySelector('.rv-ib.note'); if (nb && x.i === cur) nb.classList.add('on'); if (HOST && HOST.isConnected) LISTDIRTY = true; };
      noteSt.append('удалена · ', u);
      undoT = setTimeout(() => { if (noteSt.contains(u)) noteSt.textContent = ''; }, 6000);
    }
    const refreshRow = (x) => { const old = rows.get(x.i); if (!old) return; const r = hRow(x); if (old.classList.contains('cur')) r.classList.add('cur'); old.replaceWith(r); rows.set(x.i, r); if ((filt === 'nt' && !NT[x.mk]) || (filt === 'mk' && !MK[x.mk])) fillList(); };
    const showNote = () => { if (!noteTa) return; const x = H.find(z => z.i === cur); if (!x) return; if (document.activeElement !== noteTa) noteTa.value = NT[x.mk] || ''; noteLab.textContent = 'Заметка к раздаче №' + x.no; noteSt.textContent = NT[x.mk] ? 'сохранено' : ''; if (noteDel) noteDel.hidden = !NT[x.mk]; };
    let filt = 'all', desc = false, root = null, listBox = null, rows = new Map(), cur = -1, scrollTop = 0, spotsEl = null;
    const counts = () => { stripCounts(); if (!spotsEl) return; [...spotsEl.children].forEach(b => { const n = H.filter(x => inSpot(x, b.dataset.v)).length; b.lastChild.textContent = String(n); b.disabled = !n && b.dataset.v !== filt; }); };
    const ordered = () => { const L = H.filter(x => inSpot(x, filt)); return desc ? L.reverse() : L; };
    const list = () => ordered().map(x => x.i);
    function build() {
      root = el('aside', 'tv-side'); root.setAttribute('aria-label', 'Раздачи турнира');
      const hd = el('div', 'tv-sh'); hd.append(el('b', null, t.name), el('small', null, (TL.rooms[t.room] || '') + ' · ' + dTxt(t.start) + ' · ' + H.length + ' ' + plural(H.length, 'раздача', 'раздачи', 'раздач')));
      const colB = el('button', 'tv-col'); colB.type = 'button'; colB.title = 'Убрать ленту раздач вправо'; colB.setAttribute('aria-label', 'Убрать ленту раздач вправо'); colB.textContent = 'Скрыть ›';
      colB.onclick = () => setCol(true);
      const hrow = el('div', 'tv-shr'); hrow.append(hd, colB);
      const strip = el('button', 'tv-strip'); strip.type = 'button'; strip.title = 'Показать ленту раздач'; strip.setAttribute('aria-label', 'Показать ленту раздач'); stripMk = el('em', 'tv-smk'); stripNt = el('em', 'tv-snt'); strip.append(el('span', null, '‹'), el('b', null, 'Раздачи'), stripMk, stripNt);
      strip.onclick = () => setCol(false);
      const body = el('div', 'tv-body'); root.append(strip, body); body.append(hrow);
      const fb = el('div', 'tv-spots'); fb.setAttribute('role', 'group'); fb.setAttribute('aria-label', 'Споты');
      SPOTS.forEach(([v, l, d]) => { const b = el('button', 'tv-sp' + (filt === v ? ' on' : '') + (v === 'mk' ? ' mk' : v === 'nt' ? ' nt' : '')); b.type = 'button'; b.dataset.v = v; b.title = d; b.append(document.createTextNode(l), el('span')); b.onclick = () => setFilt(v, fb, b); fb.append(b); });
      spotsEl = fb; counts();
      // порядок ленты и подсказка «?» (что значит выбранный спот и цвета) — подсказка скрыта, открывается по нажатию
      const tb = el('div', 'tv-tb');
      const ord = el('div', 'seg bx-seg tv-ord'); ord.setAttribute('role', 'group'); ord.setAttribute('aria-label', 'Порядок раздач');
      [[false, 'С первой'], [true, 'С последней']].forEach(([v, l]) => { const b = el('button', desc === v ? 'on' : null, l); b.type = 'button'; b.onclick = () => { desc = v; [...ord.children].forEach(x => x.classList.toggle('on', x === b)); fillList(); listBox.scrollTop = 0; scrollTop = 0; const L = list(); if (L.length) window.replayerGo(L[0], L); }; ord.append(b); });
      const qb = el('button', 'tv-qb'); qb.type = 'button'; qb.setAttribute('aria-expanded', 'false'); qb.append(el('b', null, '?'), document.createTextNode('Цвета и споты'));
      // перейти к раздаче по номеру: ввести номер и нажать Enter — реплеер начнёт с неё
      const go = el('div', 'tv-go');
      const gi = el('input', 'tv-gi'); gi.type = 'number'; gi.min = '1'; gi.max = String(H.length); gi.placeholder = 'Номер раздачи'; gi.title = 'Номер раздачи от 1 до ' + H.length + ' — Enter, чтобы начать с неё'; gi.setAttribute('aria-label', 'Номер раздачи, с которой начать');
      const jump = () => { const n = Math.round(+gi.value); const x = H.find(z => z.no === n); if (!x) { gi.classList.add('bad'); return; } gi.classList.remove('bad');
        if (!inSpot(x, filt)) { const fb2 = root.querySelector('.tv-spots'); filt = 'all'; [...fb2.children].forEach(b => b.classList.toggle('on', b.dataset.v === 'all')); const h = root.querySelector('.tv-sph'); if (h) h.textContent = SPOTS[0][2]; fillList(); }
        window.replayerGo(x.i, list()); };
      gi.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); jump(); } e.stopPropagation(); });
      const gb = el('button', 'tv-gb', '→'); gb.type = 'button'; gb.title = 'Начать с этой раздачи'; gb.setAttribute('aria-label', 'Начать с этой раздачи'); gb.onclick = jump;
      go.append(gi, gb);
      tb.append(ord, go, qb);
      const help = el('div', 'tv-help'); help.hidden = true;
      const fh = el('p', 'tv-sph', SPOTS[0][2]);
      const lg = el('div', 'tv-leg'); [['w2', 'выигрыш с постфлопом'], ['w1', 'выигрыш без постфлопа'], ['ch', 'поделили банк'], ['l2', 'проигрыш с постфлопом'], ['l1', 'проигрыш без постфлопа, блайнды'], ['x', 'не сыграна']].forEach(([k, l]) => { const s2 = el('span', 'tv-lg ' + k); s2.append(el('i'), document.createTextNode(l)); lg.append(s2); });
      help.append(el('b', null, 'Выбранный спот'), fh, el('b', null, 'Цвет раздачи'), lg, el('p', 'tv-sph', '★ — отмеченная раздача: кнопка ★ вверху реплеера или клавиша M.'));
      qb.onclick = () => { help.hidden = !help.hidden; qb.setAttribute('aria-expanded', String(!help.hidden)); qb.classList.toggle('on', !help.hidden); };
      body.append(fb, tb, help);
      listBox = el('div', 'tv-hl'); listBox.addEventListener('scroll', () => { scrollTop = listBox.scrollTop; }, { passive: true });
      // заметка к текущей раздаче: сохраняется сама, пока вы печатаете
      noteBox = el('div', 'tv-note'); const nh = el('div', 'tv-note-h'); noteLab = el('b', null, 'Заметка'); noteSt = el('span');
      // удалить заметку одним нажатием; несколько секунд можно вернуть
      noteDel = el('button', 'tv-note-del'); noteDel.type = 'button'; noteDel.textContent = '✕ Удалить'; noteDel.title = 'Удалить заметку этой раздачи'; noteDel.hidden = true;
      noteDel.onclick = () => { const x = H.find(z => z.i === cur); if (!x || !NT[x.mk]) return; const old = NT[x.mk]; noteTa.value = ''; clearTimeout(nt0); commit(); showUndo(x, old); };
      const nr = el('span', 'tv-note-r'); nr.append(noteSt, noteDel); nh.append(noteLab, nr);
      noteTa = el('textarea', 'tv-note-ta'); noteTa.rows = 3; noteTa.placeholder = 'Что здесь важно: ошибка, мысль, что запомнить… Сохраняется сама.'; noteTa.setAttribute('aria-label', 'Заметка к раздаче');
      let nt0 = null; const commit = () => { const x = H.find(z => z.i === cur); if (!x) return; const v = noteTa.value.trim(); const had = !!NT[x.mk]; if (v) NT[x.mk] = v; else delete NT[x.mk]; saveNT(); noteSt.textContent = v ? 'сохранено' : ''; noteDel.hidden = !v; const nb = document.querySelector('.rv-ib.note'); if (nb) { nb.classList.toggle('on', !!v); nb.title = v ? 'Заметка к раздаче — есть' : 'Заметка к раздаче'; } if (had !== !!v || v) { counts(); refreshRow(x); if (HOST && HOST.isConnected) LISTDIRTY = true; } };
      noteTa.addEventListener('input', () => { noteSt.textContent = '…'; clearTimeout(nt0); nt0 = setTimeout(commit, 400); });
      noteTa.addEventListener('blur', () => { clearTimeout(nt0); commit(); });
      noteTa.addEventListener('keydown', (e) => { if (e.key === 'Escape') { noteTa.blur(); e.stopPropagation(); } });
      noteBox.append(nh, noteTa);
      fillList(); body.append(listBox, noteBox, el('p', 'tv-keys', '↑ ↓ — раздачи (по выбранному споту) · ← → — шаги раздачи · пробел — воспроизвести'));
    }
    // свернуть / развернуть ленту (запоминается)
    let MAIN = null;
    const colOn = () => { try { return localStorage.getItem('mda.tv.col') === '1'; } catch (e) { return false; } };
    function setCol(on) { try { localStorage.setItem('mda.tv.col', on ? '1' : '0'); } catch (e) { /* без сохранения */ } applyCol(); if (!on) setTimeout(() => { const r = rows.get(cur); if (r) r.scrollIntoView({ block: 'center' }); }, 320); }
    function applyCol() { const on = colOn(); if (root) root.classList.toggle('collapsed', on); if (MAIN) MAIN.classList.toggle('tv-collapsed', on); }
    function setFilt(v, fb, b) {
      filt = v; [...fb.children].forEach(x => x.classList.toggle('on', x === b));
      const h = root.querySelector('.tv-sph'); if (h) h.textContent = (SPOTS.find(z => z[0] === v) || [])[2] || '';
      fillList();
      const L = list(); if (!L.length) return;
      window.replayerGo(L.includes(cur) ? cur : L[0], L);
    }
    function fillList() {
      listBox.replaceChildren(); rows = new Map();
      ordered().forEach(x => { const r = hRow(x); rows.set(x.i, r); listBox.append(r); });
      mark();
    }
    function hRow(x) {
      const note = NT[x.mk];
      const r = el('button', 'tv-h ' + x.cls + (note ? ' has-note' : '')); r.type = 'button'; r.title = CLS_T[x.cls] + (note ? '\nЗаметка: ' + note : '');
      const no = el('span', 'tv-no'); if (MK[x.mk]) no.append(el('i', 'tv-star', '★')); if (note) no.append(el('i', 'tv-pen', '✎')); no.append(String(x.no));
      r.append(no, cardsEl(x.rp.hc), el('span', 'tv-pos', x.rp.pl[x.rp.h][0]));
      const bd = el('span', 'tv-bd'); if (x.bd.length) bd.append(cardsEl(x.bd.join(' '))); r.append(bd);
      r.append(el('b', 'tv-net', Math.abs(x.net) < 0.05 ? '0' : sgn(x.net)));
      r.onclick = () => window.replayerGo(x.i, list());
      return r;
    }
    function mark() { rows.forEach((r, i) => r.classList.toggle('cur', i === cur)); }
    return {
      list,
      mount(main, i) {
        if (!root) build();
        if (noteTa && document.activeElement === noteTa) noteTa.blur();
        cur = i; MAIN = main; main.classList.add('tv-noanim'); main.append(root); applyCol(); listBox.scrollTop = scrollTop; mark(); showNote(); requestAnimationFrame(() => requestAnimationFrame(() => main.classList.remove('tv-noanim')));
        const r = rows.get(i); if (r) { const lb = listBox.getBoundingClientRect(), rb = r.getBoundingClientRect(); if (rb.top < lb.top || rb.bottom > lb.bottom) r.scrollIntoView({ block: 'center' }); }
      },
      close() { root = null; if (LISTDIRTY && REDRAW) { LISTDIRTY = false; REDRAW(); } },
      hasNote: (i) => { const x = H.find(z => z.i === i); return !!(x && NT[x.mk]); },
      isMarked: (i) => { const x = H.find(z => z.i === i); return !!(x && MK[x.mk]); },
      toggleMark(i) {
        const x = H.find(z => z.i === i); if (!x) return;
        if (MK[x.mk]) delete MK[x.mk]; else MK[x.mk] = Date.now();
        saveMK(); counts(); stripCounts(true);
        refreshRow(x);
        if (HOST && HOST.isConnected) LISTDIRTY = true;
      },
      focusNote() { const r = root && root.classList.contains('collapsed'); if (r) setCol(false); if (noteTa) { if (r) setTimeout(() => noteTa.focus(), 330); else noteTa.focus(); } }
    };
  }

  window.MDATours = { draw, reset: () => { TL = null; } };
})();
