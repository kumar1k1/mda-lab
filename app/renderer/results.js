'use strict';
// «Личный кабинет → Результаты»: где и когда вы играете лучше всего.
// Данные: колонки базы (EV, факт, позиция, стек, рум, тип, бай-ин, размер стола) + из главного процесса время, турнир,
// число одновременных турниров и сессия каждой раздачи (parser/results.js). Всё считается здесь под выбранные фильтры.
// Интервалы — бутстрэп по сессиям (сессии перетасовываются целиком: соседние раздачи одной сессии не независимы).
(function () {
  const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };
  const svgNS = 'http://www.w3.org/2000/svg';
  const sv = (t, a, txt) => { const e = document.createElementNS(svgNS, t); if (a) for (const k in a) e.setAttribute(k, a[k]); if (txt != null) e.textContent = txt; return e; };
  const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* нет */ } } };
  const DEF = { period: 'all', room: -1, bounty: 'all', speed: 'all', kind: 'all', bi: 'all', tbl: 'all', metric: 'ev', adj: 1 };
  const F = Object.assign({}, DEF, LS.get('mda.res.f', {}));
  const saveF = () => LS.set('mda.res.f', F);
  const fmt = (v, d) => v == null || !Number.isFinite(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d == null ? 1 : d);
  const num = (n) => Math.round(n).toLocaleString('ru-RU');
  const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };

  // ---------- данные ----------
  let DATA = null, DKEY = null, LOADING = null;
  const cp = (u) => (u instanceof Uint8Array ? u : new Uint8Array(u)).slice().buffer;
  const SPEED = ['Обычная', 'Турбо', 'Гипер'], BOUNTY = ['Без баунти', 'PKO', 'Mystery'], KIND = ['Обычные', 'Сателлиты'];
  function classify(title) {
    const s = String(title || '');
    return {
      speed: /hyper|гипер/i.test(s) ? 2 : /turbo|турбо|rapid|speed|fast/i.test(s) ? 1 : 0,
      myst: /myst/i.test(s),
      sat: /satell|qualif|сателл|ticket|\bsat\b|\bstep\b|\bsteps\b/i.test(s)
    };
  }
  async function load() {
    const db = typeof HERO_DB !== 'undefined' ? HERO_DB : null;
    if (!db || !window.mda || !window.mda.resultsData) return null;
    const key = db.count + '|' + (db.cols && db.cols.nev ? db.cols.nev.length : 0);
    if (DATA && DKEY === key && DATA.db === db) return DATA;
    if (LOADING) return LOADING;
    LOADING = (async () => {
      const d = await window.mda.resultsData(); if (!d) return null;
      const cls = d.titles.map(x => classify(x.t));
      DATA = { db, n: d.n, t: new Int32Array(cp(d.t)), conc: new Int8Array(cp(d.conc)), ses: new Int32Array(cp(d.ses)), since: new Int32Array(cp(d.since)), tour: new Int32Array(cp(d.tour)), tours: d.tours, titles: d.titles, sessions: d.sessions, cls, tz: d.tz };
      DKEY = key; return DATA;
    })().finally(() => { LOADING = null; });
    return LOADING;
  }

  // ---------- выборка под фильтры ----------
  const BI = [['all', 'Все'], ['b1', 'до 11'], ['b2', '11–27'], ['b3', '27–60'], ['b4', '60–120'], ['b5', '120+']];
  const biBand = (c) => c < 0 ? -1 : c <= 1100 ? 1 : c <= 2700 ? 2 : c <= 6000 ? 3 : c <= 12000 ? 4 : 5;
  const tblOf = (m) => m <= 0 ? 0 : m <= 6 ? 1 : m <= 8 ? 2 : 3; // 0 — неизвестно, 1 — 6-max и меньше, 2 — 7–8, 3 — 9–10
  const TBL = ['?', 'до 6-max', '7–8-max', '9-max'];
  const stkB = (x) => x < 10 ? 0 : x < 20 ? 1 : x < 40 ? 2 : x < 70 ? 3 : 4;
  const STK = ['до 10 BB', '10–20', '20–40', '40–70', '70+ BB'];
  const POS = ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  const DOW = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  function select(D) {
    const c = D.db.cols, N = D.n, out = [];
    const alias = (typeof state !== 'undefined' && D.db.aliases && D.db.aliases.length > 1 && c.aid) ? state.alias : -1;
    let tMax = 0; for (let i = 0; i < N; i++) if (D.t[i] > tMax) tMax = D.t[i];
    const from = F.period === 'all' ? -Infinity : tMax - ({ m1: 30, m3: 91, m6: 182, y1: 365 }[F.period] || 0) * 1440;
    for (let i = 0; i < N; i++) {
      if (D.t[i] < 0 || D.t[i] < from) continue;
      if (alias >= 0 && c.aid[i] !== alias) continue;
      if (F.room >= 0 && c.room[i] !== F.room) continue;
      const tr = D.tour[i], k = tr >= 0 ? D.tours[tr][0] : -1, cl = k >= 0 ? D.cls[k] : { speed: 0, myst: false, sat: false };
      const bty = cl.myst ? 2 : c.type && c.type[i] === 1 ? 1 : 0;
      if (F.bounty !== 'all' && bty !== +F.bounty) continue;
      if (F.speed !== 'all' && cl.speed !== +F.speed) continue;
      if (F.kind !== 'all' && (cl.sat ? 1 : 0) !== +F.kind) continue;
      if (F.bi !== 'all' && biBand(c.bi ? c.bi[i] : -1) !== +F.bi.slice(1)) continue;
      if (F.tbl !== 'all' && tblOf(c.tmx ? c.tmx[i] : 0) !== +F.tbl) continue;
      out.push(i);
    }
    // значение раздачи: EV или факт (BB), с поправкой — минус среднее по слою «позиция × глубина стека»
    const ev = new Float64Array(out.length), net = new Float64Array(out.length), v = new Float64Array(out.length);
    const L = new Map();
    out.forEach((i, j) => { const e = c.nev && Number.isFinite(c.nev[i]) ? c.nev[i] / 10 : c.net[i] / 10; ev[j] = e; net[j] = c.net[i] / 10; });
    const base = F.metric === 'net' ? net : ev;
    if (F.adj) {
      out.forEach((i, j) => { const k = c.pos[i] * 8 + stkB(c.bb[i] / 10); const o = L.get(k) || [0, 0]; o[0] += base[j]; o[1]++; L.set(k, o); });
      out.forEach((i, j) => { const o = L.get(c.pos[i] * 8 + stkB(c.bb[i] / 10)); v[j] = base[j] - o[0] / o[1]; });
    } else v.set(base);
    return { idx: out, ev, net, v, from, tMax };
  }

  // группы со средним (BB/100) и 95% интервалом бутстрэпом по сессиям
  let seed = 1;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  function groups(D, X, keyOf, K, opt) {
    opt = opt || {}; const vals = opt.vals || X.v;
    const sesMap = new Map(); const sid = new Int32Array(X.idx.length);
    X.idx.forEach((i, j) => { let s = sesMap.get(D.ses[i]); if (s == null) { s = sesMap.size; sesMap.set(D.ses[i], s); } sid[j] = s; });
    const Sn = sesMap.size, sn = new Float64Array(Sn * K), ss = new Float64Array(Sn * K);
    const n = new Float64Array(K), sum = new Float64Array(K), sesN = new Float64Array(K), sesSeen = new Uint8Array(Sn * K);
    X.idx.forEach((i, j) => { const k = keyOf(i, j); if (k < 0 || k >= K) return; const q = sid[j] * K + k; sn[q]++; ss[q] += vals[j]; n[k]++; sum[k] += vals[j]; if (!sesSeen[q]) { sesSeen[q] = 1; sesN[k]++; } });
    const rows = []; for (let k = 0; k < K; k++) rows.push({ k, n: n[k], v: n[k] ? sum[k] / n[k] * 100 : NaN, sum: sum[k], ses: sesN[k], lo: NaN, hi: NaN });
    if (opt.ci !== false && Sn > 2) {
      const B = opt.B || 200, bs = rows.map(() => []); seed = 7 + K;
      const bn = new Float64Array(K), bsum = new Float64Array(K);
      for (let b = 0; b < B; b++) {
        bn.fill(0); bsum.fill(0);
        for (let z = 0; z < Sn; z++) { const s = Math.floor(rnd() * Sn) * K; for (let k = 0; k < K; k++) { bn[k] += sn[s + k]; bsum[k] += ss[s + k]; } }
        for (let k = 0; k < K; k++) if (bn[k]) bs[k].push(bsum[k] / bn[k] * 100);
      }
      rows.forEach((r, k) => { const a = bs[k].sort((x, y) => x - y); if (a.length > 20) { r.lo = a[Math.floor(a.length * 0.025)]; r.hi = a[Math.floor(a.length * 0.975)]; } });
    }
    return rows;
  }
  const sure = (r) => Number.isFinite(r.lo) && (r.lo > 0 || r.hi < 0);

  // ---------- графики ----------
  function niceTicks(lo, hi, n) {
    const span = hi - lo || 1, step0 = span / (n || 4), mag = Math.pow(10, Math.floor(Math.log10(step0))), f = step0 / mag;
    const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag, out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.abs(v) < 1e-9 ? 0 : v);
    return out;
  }
  // столбцы со знаком: зелёные — плюс, красные — минус; бледные — мало раздач; усы — 95% интервал; best — янтарная обводка
  function bars(rows, o) {
    o = o || {};
    const W = o.w || 600, H = o.h || 240, pl = 40, pr = 10, pt = 22, pb = o.sub2 ? 58 : o.sub ? 44 : 30;
    const list = rows.filter(r => r.n > 0 && Number.isFinite(r.v));
    const svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'rs-svg', role: 'img', 'aria-label': o.aria || 'график' });
    if (!list.length) { svg.append(sv('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', class: 'rs-empty' }, 'нет раздач под эти фильтры')); return svg; }
    const maxN = Math.max(...list.map(r => r.n)), minN = o.minN || 300;
    const solid = list.filter(r => r.n >= minN), vs = (solid.length ? solid : list).map(r => r.v); let lo = Math.min(0, ...vs), hi = Math.max(0, ...vs);
    const pad = (hi - lo) * 0.18 || 5; lo -= lo < 0 ? pad : 0; hi += hi > 0 ? pad : 0;
    // усы не раздувают шкалу больше чем вдвое
    (solid.length ? solid : list).forEach(r => { if (Number.isFinite(r.lo)) { lo = Math.min(lo, Math.max(r.lo, lo * 2 - 5)); hi = Math.max(hi, Math.min(r.hi, hi * 2 + 5)); } });
    const y = (v) => pt + (hi - v) / (hi - lo) * (H - pt - pb);
    for (const tk of niceTicks(lo, hi, 4)) { svg.append(sv('line', { x1: pl, x2: W - pr, y1: y(tk), y2: y(tk), class: tk === 0 ? 'rs-zero' : 'rs-gl' }), sv('text', { x: pl - 6, y: y(tk) + 4, 'text-anchor': 'end', class: 'rs-ax' }, (tk > 0 ? '+' : '') + tk)); }
    const n = rows.length, bw = (W - pl - pr) / n, gap = Math.min(10, bw * 0.22);
    rows.forEach((r, q) => {
      const x = pl + q * bw + gap / 2, w = bw - gap, g = sv('g');
      if (r.n > 0 && Number.isFinite(r.v)) {
        const small = r.n < (o.minN || 300), alpha = small ? 0.28 : 0.45 + 0.55 * Math.min(1, r.n / (maxN * 0.35));
        const vc = Math.max(lo, Math.min(hi, r.v)), y0 = y(0), y1 = y(vc), cut = vc !== r.v;
        const rect = sv('rect', { x, y: Math.min(y0, y1), width: w, height: Math.max(1.5, Math.abs(y1 - y0)), rx: Math.min(4, w / 4), class: 'rs-bar ' + (r.v >= 0 ? 'pos' : 'neg') + (r.best ? ' best' : '') + (small ? ' small' : ''), 'fill-opacity': alpha.toFixed(2) });
        g.append(rect);
        if (cut) g.append(sv('path', { d: r.v > 0 ? 'M' + (x + w / 2 - 5) + ' ' + (y1 + 7) + 'l5 -6l5 6' : 'M' + (x + w / 2 - 5) + ' ' + (y1 - 7) + 'l5 6l5 -6', class: 'rs-cut' }));
        if (Number.isFinite(r.lo) && o.ci !== false) {
          const cl = (v) => Math.max(lo, Math.min(hi, v)), a = cl(r.lo), b = cl(r.hi), cx = x + w / 2;
          g.append(sv('line', { x1: cx, x2: cx, y1: y(a), y2: y(b), class: 'rs-ci' }), sv('line', { x1: cx - 4, x2: cx + 4, y1: y(a), y2: y(a), class: 'rs-ci' }), sv('line', { x1: cx - 4, x2: cx + 4, y1: y(b), y2: y(b), class: 'rs-ci' }));
        }
        if (w >= 18 || o.vlab) g.append(sv('text', { x: x + w / 2, y: r.v >= 0 ? Math.max(11, y1 - 6) : Math.min(H - pb - 3, y1 + 13), 'text-anchor': 'middle', class: 'rs-val ' + (r.v >= 0 ? 'pos' : 'neg') }, fmt(r.v, Math.abs(r.v) >= 100 ? 0 : 1)));
        g.append(sv('title', null, (r.title || r.label) + ': ' + fmt(r.v) + ' ' + (o.unit || 'BB/100') + ' · ' + num(r.n) + ' ' + plural(r.n, 'раздача', 'раздачи', 'раздач') + (Number.isFinite(r.lo) ? ' · 95%: от ' + fmt(r.lo) + ' до ' + fmt(r.hi) : '') + (r.tip ? ' · ' + r.tip : '')));
      }
      g.append(sv('text', { x: x + w / 2, y: H - pb + 16, 'text-anchor': 'middle', class: 'rs-lab' + (r.best ? ' best' : '') }, r.label));
      if (o.sub) g.append(sv('text', { x: x + w / 2, y: H - pb + 31, 'text-anchor': 'middle', class: 'rs-sub' }, r.sub != null ? r.sub : r.n ? num(r.n) : ''));
      if (o.sub2 && r.sub2) g.append(sv('text', { x: x + w / 2, y: H - pb + 45, 'text-anchor': 'middle', class: 'rs-sub ' + (r.sub2[0] === '−' ? 'neg' : 'pos') }, r.sub2));
      svg.append(g);
    });
    return svg;
  }
  // линии накопленного результата
  function lines(series, o) {
    o = o || {}; const W = 1150, H = o.h || 260, pl = 60, pr = 12, pt = 14, pb = 26;
    const svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'rs-svg', role: 'img', 'aria-label': o.aria || 'график' });
    const all = series.flatMap(s => s.pts.map(p => p[1])); if (!all.length) return svg;
    const N = Math.max(...series.map(s => s.pts.length ? s.pts[s.pts.length - 1][0] : 0)) || 1;
    let lo = Math.min(0, ...all), hi = Math.max(0, ...all); const pd = (hi - lo) * 0.06 || 1; lo -= pd; hi += pd;
    const x = (v) => pl + v / N * (W - pl - pr), y = (v) => pt + (hi - v) / (hi - lo) * (H - pt - pb);
    for (const tk of niceTicks(lo, hi, 5)) svg.append(sv('line', { x1: pl, x2: W - pr, y1: y(tk), y2: y(tk), class: tk === 0 ? 'rs-zero' : 'rs-gl' }), sv('text', { x: pl - 6, y: y(tk) + 4, 'text-anchor': 'end', class: 'rs-ax' }, (tk > 0 ? '+' : '') + num(tk)));
    (o.marks || []).forEach(m => { svg.append(sv('line', { x1: x(m[0]), x2: x(m[0]), y1: pt, y2: H - pb, class: 'rs-mark' }), sv('text', { x: x(m[0]) + 4, y: H - 8, class: 'rs-sub' }, m[1])); });
    series.forEach(s => { if (!s.pts.length) return; svg.append(sv('path', { d: 'M' + s.pts.map(p => x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1)).join('L'), class: 'rs-line ' + s.cls })); });
    return svg;
  }
  // неделя × часы
  function heat(cells, o) {
    const W = 1150, H = 270, pl = 38, pt = 8, pb = 22, cw = (W - pl - 6) / 24, ch = (H - pt - pb) / 7;
    const svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'rs-svg', role: 'img', 'aria-label': 'результат по дням недели и часам' });
    const maxN = Math.max(1, ...cells.map(c => c.n)), lim = Math.max(10, ...cells.filter(c => c.n >= (o.minN || 200)).map(c => Math.abs(c.v)));
    cells.forEach(c => {
      const d = Math.floor(c.k / 24), h = c.k % 24, x = pl + h * cw, yy = pt + d * ch;
      const r = sv('rect', { x: x + 1, y: yy + 1, width: cw - 2, height: ch - 2, rx: 3, class: 'rs-cell' });
      if (c.n) {
        const a = Math.min(1, Math.abs(c.v) / lim) * (c.n < (o.minN || 200) ? 0.35 : 1) * 0.9 + 0.08;
        r.style.fill = c.v >= 0 ? 'rgba(var(--good-rgb),' + a.toFixed(2) + ')' : 'rgba(var(--bad-rgb),' + a.toFixed(2) + ')';
        r.append(sv('title', null, DOW[d] + ', ' + String(h).padStart(2, '0') + ':00 — ' + fmt(c.v) + ' BB/100 · ' + num(c.n) + ' ' + plural(c.n, 'раздача', 'раздачи', 'раздач')));
      }
      svg.append(r);
    });
    DOW.forEach((d, q) => svg.append(sv('text', { x: pl - 8, y: pt + q * ch + ch / 2 + 4, 'text-anchor': 'end', class: 'rs-lab' }, d)));
    for (let h = 0; h < 24; h += 2) svg.append(sv('text', { x: pl + h * cw + cw / 2, y: H - 6, 'text-anchor': 'middle', class: 'rs-sub' }, String(h).padStart(2, '0')));
    return svg;
  }

  // ---------- страница ----------
  let ROOT = null;
  function seg(label, key, opts, onSet) {
    const w = el('div', 'rs-f'); w.append(el('span', 'rs-f-l', label));
    const s = el('div', 'seg bx-seg'); s.setAttribute('role', 'group'); s.setAttribute('aria-label', label);
    opts.forEach(([v, l]) => { const b = el('button', String(F[key]) === String(v) ? 'on' : null, l); b.type = 'button'; b.setAttribute('aria-pressed', String(String(F[key]) === String(v))); b.onclick = () => { F[key] = v; saveF(); (onSet || draw)(); }; s.append(b); });
    w.append(s); return w;
  }
  function sel(label, key, opts) {
    const w = el('label', 'rs-f'); w.append(el('span', 'rs-f-l', label));
    const s = el('select', 'rs-sel'); opts.forEach(([v, l]) => { const o = el('option', null, l); o.value = String(v); if (String(F[key]) === String(v)) o.selected = true; s.append(o); });
    s.onchange = () => { F[key] = typeof DEF[key] === 'number' ? +s.value : s.value; saveF(); draw(); }; w.append(s); return w;
  }
  function card(title, hint, wide) {
    const c = el('section', 'rs-card' + (wide ? ' wide' : '')); const h = el('div', 'rs-card-h'); h.append(el('h3', null, title)); if (hint) h.append(el('p', null, hint)); c.append(h); return c;
  }
  function legend(items) { const l = el('div', 'rs-leg'); items.forEach(([cls, t]) => { const i = el('span'); i.append(el('i', cls), document.createTextNode(t)); l.append(i); }); return l; }
  function note(t) { return el('p', 'rs-note', t); }

  async function draw(root) {
    if (root) ROOT = root; if (!ROOT) return;
    const R = ROOT; R.replaceChildren();
    const head = el('div', 'rs-head'); head.append(el('h2', null, 'Результаты'), el('p', null, 'Где и когда вы играете лучше всего: число столов, ход сессии, время, дни и форматы турниров. Наведите на столбец — подробности; усы — 95% интервал.'));
    R.append(head);
    const D = await load();
    if (!D) { const e = el('div', 'rs-card'); e.append(el('h3', null, 'Нет данных'), el('p', 'rs-note', typeof HERO_DB !== 'undefined' && HERO_DB ? 'Не удалось прочитать время раздач из базы.' : 'Загрузите базу на вкладке «Моя база» — здесь появится статистика.')); R.append(e); return; }
    if (R !== ROOT) return;
    const c = D.db.cols, rooms = D.db.rooms || [];
    // фильтры
    const fb = el('div', 'rs-filters');
    fb.append(
      seg('Период', 'period', [['all', 'Всё'], ['y1', 'Год'], ['m6', '6 мес'], ['m3', '3 мес'], ['m1', '30 дней']]),
      sel('Рум', 'room', [[-1, 'Все румы']].concat(rooms.map((r, k) => [k, r]))),
      seg('Баунти', 'bounty', [['all', 'Все'], ['0', 'Без'], ['1', 'PKO'], ['2', 'Mystery']]),
      seg('Скорость', 'speed', [['all', 'Все'], ['0', 'Обычная'], ['1', 'Турбо'], ['2', 'Гипер']]),
      sel('Бай-ин', 'bi', BI),
      seg('Стол', 'tbl', [['all', 'Все'], ['1', '6-max'], ['2', '7–8'], ['3', '9-max']]),
      seg('Тип', 'kind', [['all', 'Все'], ['0', 'Обычные'], ['1', 'Сателлиты']]),
      seg('Считать', 'metric', [['ev', 'EV'], ['net', 'Факт']]),
      seg('Поправка', 'adj', [[1, 'На позицию и стек'], [0, 'Без']])
    );
    const reset = el('button', 'rs-reset', 'Сбросить'); reset.type = 'button'; reset.onclick = () => { Object.assign(F, DEF); saveF(); draw(); };
    if (Object.keys(DEF).some(k => String(F[k]) !== String(DEF[k]))) fb.append(reset);
    R.append(fb);
    const X = select(D);
    if (!X.idx.length) { R.append(note('Под эти фильтры раздач нет. Ослабьте фильтры или нажмите «Сбросить».')); return; }
    const mName = (F.metric === 'net' ? 'Факт' : 'EV') + (F.adj ? ' с поправкой' : '');
    const tzOff = (m) => new Date(m * 60000).getTimezoneOffset();
    const lt = (i) => D.t[i] - tzOff(D.t[i]); // местное время
    // ---- ключевые числа ----
    const sesSet = new Set(), tourSet = new Set(); let evS = 0, netS = 0;
    X.idx.forEach((i, j) => { sesSet.add(D.ses[i]); if (D.tour[i] >= 0) tourSet.add(D.tour[i]); evS += X.ev[j]; netS += X.net[j]; });
    let mins = 0; for (const s of sesSet) { const z = D.sessions[s]; mins += Math.max(15, z[1] - z[0]); }
    const nH = X.idx.length;
    const kp = el('div', 'rs-kpis');
    const kpi = (l, v, cls, sub) => { const k = el('div', 'rs-kpi'); k.append(el('span', null, l), el('b', cls || null, v)); if (sub) k.append(el('small', null, sub)); kp.append(k); };
    kpi('Раздач', num(nH)); kpi('Турниров', num(tourSet.size)); kpi('Сессий', num(sesSet.size), null, num(mins / 60) + ' ч игры');
    kpi('EV', fmt(evS / nH * 100), evS >= 0 ? 'pos' : 'neg', 'BB/100'); kpi('Факт', fmt(netS / nH * 100), netS >= 0 ? 'pos' : 'neg', 'BB/100');
    kpi('Везение', fmt((netS - evS) / nH * 100), netS - evS >= 0 ? 'pos' : 'neg', 'факт минус EV'); kpi('EV в час', fmt(evS / (mins / 60)), evS >= 0 ? 'pos' : 'neg', 'BB/ч');
    R.append(kp);
    const grid = el('div', 'rs-grid'); R.append(grid);
    // ---- сколько столов ----
    const cb = (n) => n <= 2 ? 0 : n <= 4 ? 1 : n <= 6 ? 2 : n <= 8 ? 3 : n <= 10 ? 4 : n <= 13 ? 5 : 6;
    const CBL = ['1–2', '3–4', '5–6', '7–8', '9–10', '11–13', '14+'];
    const gT = groups(D, X, (i) => cb(D.conc[i]), 7);
    // минуты на каждом числе столов (по всем раздачам выбранного периода): для рук в час и BB в час
    const tm = new Float64Array(7); {
      const ev2 = []; const used = new Set(X.idx.map(i => D.tour[i])); D.tours.forEach((x, k) => { if (used.has(k)) ev2.push([x[1], 1], [x[2] + 1, -1]); }); ev2.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const ss = [...sesSet].map(s => D.sessions[s]).sort((a, b) => a[0] - b[0]); let e = 0, cc = 0;
      for (const z of ss) for (let t = z[0]; t <= z[1]; t++) { while (e < ev2.length && ev2[e][0] <= t) cc += ev2[e++][1]; if (cc > 0) tm[cb(cc)]++; }
    }
    const okT = gT.filter(r => r.n >= nH * 0.05); const bestT = okT.length ? okT.reduce((a, b) => b.v > a.v ? b : a) : null;
    const cT = card('Сколько столов играть', 'Результат на 100 раздач в зависимости от того, сколько турниров открыто одновременно. Под столбцом — раздач в час и ' + (F.metric === 'net' ? 'факт' : 'EV') + ' в час: больше столов — больше раздач, даже если каждая играется хуже.');
    cT.append(bars(gT.map((r, q) => Object.assign(r, { label: CBL[q], best: r === bestT, sub: tm[q] ? Math.round(r.n / tm[q] * 60) + ' рук/ч' : '', sub2: tm[q] ? fmt(r.sum / tm[q] * 60, 1) + ' BB/ч' : '', tip: tm[q] ? Math.round(tm[q] / 60) + ' ч игры' : '' })), { sub: true, sub2: true, h: 260, aria: 'результат по числу столов' }));
    cT.append(legend([['lg-pos', 'плюс'], ['lg-neg', 'минус'], ['lg-best', 'лучшее'], ['lg-small', 'мало раздач — ненадёжно']]));
    grid.append(cT);
    // ---- ход сессии ----
    const gS = groups(D, X, (i) => Math.min(9, Math.floor(D.since[i] / 60)), 10);
    const cS = card('По ходу сессии', 'Результат по часам от начала сессии (сессия — игра без перерыва больше 45 минут). Видно, когда падает концентрация.');
    cS.append(bars(gS.map((r, q) => Object.assign(r, { label: q === 9 ? '9+ ч' : q + '–' + (q + 1) })), { sub: true, aria: 'результат по ходу сессии' }));
    // наклон
    {
      const reg = (pick) => { let sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0; for (const j of pick) { const xx = D.since[X.idx[j]] / 60, yy = X.v[j] * 100; sx += xx; sy += yy; sxx += xx * xx; sxy += xx * yy; n++; } return (n * sxy - sx * sy) / (n * sxx - sx * sx); };
      const bySes = new Map(); X.idx.forEach((i, j) => { if (!bySes.has(D.ses[i])) bySes.set(D.ses[i], []); bySes.get(D.ses[i]).push(j); });
      const SS = [...bySes.values()], all = SS.flat(), sl = reg(all), bs = []; seed = 11;
      for (let b = 0; b < 150; b++) { const p = []; for (let z = 0; z < SS.length; z++) p.push(...SS[Math.floor(rnd() * SS.length)]); bs.push(reg(p)); }
      bs.sort((a, b) => a - b); const lo = bs[3], hi = bs[146];
      const s = el('p', 'rs-verdict ' + (hi < 0 ? 'neg' : lo > 0 ? 'pos' : ''));
      s.append(el('b', null, (sl < 0 ? 'Каждый час сессии: ' : 'Каждый час сессии: ') + fmt(sl, 2) + ' BB/100'), document.createTextNode(hi < 0 ? ' — результат надёжно падает к концу сессии. ' : lo > 0 ? ' — к концу сессии вы играете даже лучше. ' : ' — ровного падения нет, разница в пределах случайности. '), el('span', 'rs-muted', '95%: от ' + fmt(lo, 2) + ' до ' + fmt(hi, 2)));
      cS.append(s);
    }
    grid.append(cS);
    // ---- длина сессии ----
    const SL = [[0, 120, 'до 2 ч'], [120, 240, '2–4 ч'], [240, 360, '4–6 ч'], [360, 480, '6–8 ч'], [480, 600, '8–10 ч'], [600, 1e9, '10+ ч']];
    const slOf = (s) => { const z = D.sessions[s], L = z[1] - z[0]; return SL.findIndex(b => L >= b[0] && L < b[1]); };
    const gL = groups(D, X, (i) => slOf(D.ses[i]), SL.length);
    const cL = card('Длина сессии', 'Весь результат сессий разной длины. Под столбцом — сколько было таких сессий.');
    cL.append(bars(gL.map((r, q) => Object.assign(r, { label: SL[q][2], sub: r.ses ? r.ses + ' ' + plural(r.ses, 'сессия', 'сессии', 'сессий') : '' })), { sub: true, aria: 'результат по длине сессии' }));
    grid.append(cL);
    // ---- дни недели ----
    const gD = groups(D, X, (i) => (new Date(lt(i) * 60000).getUTCDay() + 6) % 7, 7);
    const okD = gD.filter(r => r.n >= nH * 0.04); const bestD = okD.length ? okD.reduce((a, b) => b.v > a.v ? b : a) : null;
    const cD = card('Дни недели', 'По вашему времени (часовой пояс компьютера).');
    cD.append(bars(gD.map((r, q) => Object.assign(r, { label: DOW[q], best: r === bestD })), { sub: true, aria: 'результат по дням недели' }));
    grid.append(cD);
    // ---- время суток ----
    const gH = groups(D, X, (i) => Math.floor(((lt(i) % 1440) + 1440) % 1440 / 60), 24);
    const cH = card('Время суток', 'Результат по часу начала раздачи, по вашему времени. Бледные часы — мало раздач.', true);
    cH.append(bars(gH.map((r, q) => Object.assign(r, { label: String(q).padStart(2, '0') })), { w: 1150, h: 260, sub: true, aria: 'результат по часам', minN: Math.max(300, nH * 0.01) }));
    grid.append(cH);
    // ---- неделя × часы ----
    const gW = groups(D, X, (i) => { const m = lt(i), d = (new Date(m * 60000).getUTCDay() + 6) % 7, h = Math.floor(((m % 1440) + 1440) % 1440 / 60); return d * 24 + h; }, 168, { ci: false });
    const cW = card('Неделя × часы', 'Каждая клетка — день недели и час. Зелёный — плюс, красный — минус; чем ярче, тем сильнее. Бледные клетки — мало раздач.', true);
    cW.append(heat(gW, { minN: Math.max(150, nH * 0.004) }));
    grid.append(cW);
    // ---- накопленный результат ----
    {
      const step = Math.max(1, Math.floor(nH / 700)), pe = [], pn = []; let a = 0, b = 0;
      const ord = X.idx.map((i, j) => j).sort((p, q) => D.t[X.idx[p]] - D.t[X.idx[q]]);
      ord.forEach((j, q) => { a += X.ev[j]; b += X.net[j]; if (q % step === 0 || q === ord.length - 1) { pe.push([q + 1, a]); pn.push([q + 1, b]); } });
      const marks = []; let pm = -1; ord.forEach((j, q) => { const d = new Date(lt(X.idx[j]) * 60000), m = d.getUTCFullYear() * 12 + d.getUTCMonth(); if (m !== pm) { if (pm >= 0) marks.push([q, ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][d.getUTCMonth()] + (d.getUTCMonth() === 0 ? ' ' + d.getUTCFullYear() : '')]); pm = m; } });
      const cG = card('Накопленный результат', 'Сумма BB по раздачам по порядку: янтарная — EV, голубая — фактический результат. Разница между ними — везение.', true);
      const mk2 = []; marks.forEach(m => { if (!mk2.length || (m[0] - mk2[mk2.length - 1][0]) / nH * 1080 > 70) mk2.push(m); });
      cG.append(lines([{ pts: pe, cls: 'ev' }, { pts: pn, cls: 'net' }], { marks: mk2, aria: 'накопленный результат' }));
      cG.append(legend([['lg-ev', 'EV, BB'], ['lg-net', 'факт, BB']]));
      grid.append(cG);
    }
    // ---- месяцы ----
    {
      const mk = (i) => { const d = new Date(lt(i) * 60000); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };
      const ms = [...new Set(X.idx.map(mk))].sort((a, b) => a - b).slice(-18), mi = new Map(ms.map((m, k) => [m, k]));
      const gM = groups(D, X, (i) => { const k = mi.get(mk(i)); return k == null ? -1 : k; }, ms.length);
      const MN = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
      const cM = card('По месяцам', 'Последние ' + ms.length + ' ' + plural(ms.length, 'месяц', 'месяца', 'месяцев') + ' с игрой.');
      cM.append(bars(gM.map((r, q) => Object.assign(r, { label: MN[ms[q] % 12] + (ms.length > 12 || q === 0 || ms[q] % 12 === 0 ? ' ' + String(Math.floor(ms[q] / 12)).slice(2) : '') })), { sub: true, aria: 'результат по месяцам' }));
      grid.append(cM);
    }
    // ---- позиции и глубина стека (без поправки — иначе они обнуляются) ----
    {
      const raw = F.metric === 'net' ? X.net : X.ev;
      const gP = groups(D, X, (i) => c.pos[i], 7, { vals: raw });
      const cP = card('Позиции', 'Без поправки: сколько BB/100 приносит каждая позиция (блайнды всегда в минусе — это нормально).');
      cP.append(bars(gP.map((r, q) => Object.assign(r, { label: POS[q] })), { sub: true, aria: 'результат по позициям' }));
      grid.append(cP);
      const gK = groups(D, X, (i) => stkB(c.bb[i] / 10), 5, { vals: raw });
      const cK = card('Глубина стека', 'Без поправки: результат при разном вашем стеке — ранняя стадия (глубоко) против пуш-фолда.');
      cK.append(bars(gK.map((r, q) => Object.assign(r, { label: STK[q] })), { sub: true, aria: 'результат по глубине стека' }));
      grid.append(cK);
    }
    // ---- форматы турниров: таблица ----
    {
      const cF = card('Форматы турниров', 'Нажмите на строку — она станет фильтром для всей страницы.', true);
      const secs = [];
      const tourCls = (i) => { const tr = D.tour[i], k = tr >= 0 ? D.tours[tr][0] : -1; return k >= 0 ? D.cls[k] : { speed: 0, myst: false, sat: false }; };
      secs.push(['Рум', 'room', rooms.map((r, k) => [k, r]), (i) => c.room[i]]);
      secs.push(['Баунти', 'bounty', BOUNTY.map((l, k) => [String(k), l]), (i) => tourCls(i).myst ? 2 : c.type && c.type[i] === 1 ? 1 : 0]);
      secs.push(['Скорость', 'speed', SPEED.map((l, k) => [String(k), l]), (i) => tourCls(i).speed]);
      secs.push(['Бай-ин', 'bi', BI.slice(1), (i) => biBand(c.bi ? c.bi[i] : -1) - 1]);
      secs.push(['Стол', 'tbl', [['1', '6-max и меньше'], ['2', '7–8-max'], ['3', '9-max']], (i) => tblOf(c.tmx ? c.tmx[i] : 0) - 1]);
      secs.push(['Тип', 'kind', KIND.map((l, k) => [String(k), l]), (i) => tourCls(i).sat ? 1 : 0]);
      const tb = el('table', 'rs-table'); const th = el('thead'); const hr = el('tr');
      ['', 'Раздач', 'Турниров', 'EV/100', 'Факт/100', 'Везение', mName + ', BB/100'].forEach((t, q) => { const h = el('th', q ? 'num' : null, t); h.scope = 'col'; hr.append(h); }); th.append(hr); tb.append(th);
      const body = el('tbody');
      const evRows = (keyOf, K) => groups(D, X, keyOf, K, { ci: true, B: 120 });
      for (const [name, fk, opts, keyOf] of secs) {
        const K = opts.length, gv = evRows(keyOf, K), ge = groups(D, X, keyOf, K, { vals: X.ev, ci: false }), gn = groups(D, X, keyOf, K, { vals: X.net, ci: false });
        const tours = opts.map(() => new Set()); X.idx.forEach(i => { const k = keyOf(i); if (k >= 0 && k < K && D.tour[i] >= 0) tours[k].add(D.tour[i]); });
        if (gv.filter(r => r.n).length < 1) continue;
        const sh = el('tr', 'rs-sec'); const sc = el('th', null, name); sc.colSpan = 7; sc.scope = 'colgroup'; sh.append(sc); body.append(sh);
        const lim = Math.max(5, ...gv.filter(r => r.n >= 300).map(r => Math.max(Math.abs(r.v), Math.abs(r.lo) || 0, Math.abs(r.hi) || 0)));
        opts.forEach(([val, lab], k) => {
          const r = gv[k]; if (!r.n) return;
          const tr = el('tr', String(F[fk]) === String(val) ? 'on' : null); tr.tabIndex = 0;
          const act = () => { F[fk] = String(F[fk]) === String(val) ? DEF[fk] : (typeof DEF[fk] === 'number' ? +val : val); saveF(); draw(); };
          tr.onclick = act; tr.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } };
          const luck = gn[k].v - ge[k].v;
          const cells = [lab, num(r.n), num(tours[k].size), fmt(ge[k].v), fmt(gn[k].v), fmt(luck)];
          cells.forEach((t, q) => { const td = el(q ? 'td' : 'th', q ? 'num' + (q === 3 || q === 4 ? (t[0] === '−' ? ' neg' : ' pos') : '') : null, t); if (!q) td.scope = 'row'; tr.append(td); });
          // мини-график: точка и интервал
          const td = el('td', 'rs-mini'); const s = sv('svg', { viewBox: '0 0 160 18', class: 'rs-mini-svg', 'aria-hidden': 'true' });
          const xx = (v) => 80 + Math.max(-1, Math.min(1, v / lim)) * 74;
          s.append(sv('line', { x1: 80, x2: 80, y1: 1, y2: 17, class: 'rs-zero' }));
          if (Number.isFinite(r.lo)) s.append(sv('line', { x1: xx(r.lo), x2: xx(r.hi), y1: 9, y2: 9, class: 'rs-ci' }));
          s.append(sv('rect', { x: Math.min(80, xx(r.v)), y: 5, width: Math.max(2, Math.abs(xx(r.v) - 80)), height: 8, rx: 2, class: 'rs-bar ' + (r.v >= 0 ? 'pos' : 'neg') + (r.n < 300 ? ' small' : ''), 'fill-opacity': r.n < 300 ? .3 : .9 }));
          td.append(s, el('span', 'rs-mini-v ' + (r.v >= 0 ? 'pos' : 'neg'), fmt(r.v) + (sure(r) ? '' : ' ~'))); td.title = Number.isFinite(r.lo) ? '95%: от ' + fmt(r.lo) + ' до ' + fmt(r.hi) + (sure(r) ? ' — надёжно' : ' — может быть случайностью (~)') : '';
          tr.append(td); body.append(tr);
        });
      }
      tb.append(body); const wrap = el('div', 'rs-table-w'); wrap.append(tb); cF.append(wrap);
      cF.append(note('«~» — интервал захватывает ноль: разница может быть случайной. Везение — факт минус EV (олл-ины, которые выиграли или проиграли сверх ожидания).'));
      grid.append(cF);
    }
    // ---- выводы ----
    {
      const ins = [];
      const add = (cls, title, text, r) => ins.push({ cls, title, text, badge: r ? (sure(r) ? 'надёжно' : 'тенденция') : null });
      if (bestT) add('good', 'Лучшее число столов: ' + bestT.label, fmt(bestT.v) + ' BB/100 (' + mName.toLowerCase() + ')' + (tm[bestT.k] ? ', около ' + Math.round(bestT.n / tm[bestT.k] * 60) + ' раздач в час' : '') + '.', bestT);
      const worstT = okT.length ? okT.reduce((a, b) => b.v < a.v ? b : a) : null;
      if (worstT && worstT !== bestT && worstT.v < 0) add('bad', 'Хуже всего — ' + worstT.label + ' столов', fmt(worstT.v) + ' BB/100.', worstT);
      const okH = gH.filter(r => r.n >= nH * 0.03);
      if (okH.length) { const w = okH.reduce((a, b) => b.v < a.v ? b : a), bst = okH.reduce((a, b) => b.v > a.v ? b : a);
        add('bad', 'Слабый час: ' + String(w.k).padStart(2, '0') + ':00–' + String((w.k + 1) % 24).padStart(2, '0') + ':00', fmt(w.v) + ' BB/100 на ' + num(w.n) + ' раздачах.' + (sure(w) && w.v < 0 ? ' Попробуйте в это время короткий перерыв или меньше столов.' : ''), w);
        add('good', 'Сильный час: ' + String(bst.k).padStart(2, '0') + ':00–' + String((bst.k + 1) % 24).padStart(2, '0') + ':00', fmt(bst.v) + ' BB/100.', bst); }
      if (bestD) add('good', 'Лучший день — ' + ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'][bestD.k], fmt(bestD.v) + ' BB/100.', bestD);
      const s01 = gS.slice(0, 2).reduce((a, r) => [a[0] + r.sum, a[1] + r.n], [0, 0]), sLate = gS.slice(5).reduce((a, r) => [a[0] + r.sum, a[1] + r.n], [0, 0]);
      if (s01[1] > 500 && sLate[1] > 500) add(sLate[0] / sLate[1] < s01[0] / s01[1] ? 'bad' : 'good', 'Начало и конец сессии', 'Первые 2 часа: ' + fmt(s01[0] / s01[1] * 100) + ', после 5-го часа: ' + fmt(sLate[0] / sLate[1] * 100) + ' BB/100.', null);
      const luck = (netS - evS) / nH * 100; add(luck >= 0 ? 'good' : 'bad', luck >= 0 ? 'Вам везёт' : 'Вам не везёт', 'Факт отличается от EV на ' + fmt(luck) + ' BB/100 — это олл-ины, не ваша игра.', null);
      const cI = card('Главное', 'Выводы под текущие фильтры. «Надёжно» — интервал не захватывает ноль; «тенденция» — может быть случайностью.', true);
      const list = el('div', 'rs-ins');
      ins.forEach(x => { const d = el('div', 'rs-in ' + x.cls); const h = el('b', null, x.title); if (x.badge) h.append(el('em', x.badge === 'надёжно' ? 'sure' : null, x.badge)); d.append(h, el('p', null, x.text)); list.append(d); });
      cI.append(list); grid.prepend(cI);
    }
    R.append(note('Расчёт: ' + mName + ' в BB на 100 раздач. Поправка вычитает средний результат вашей позиции и глубины стека, чтобы ранние стадии и короткие стеки не искажали сравнение времени и столов. Время румов приведено к одному часовому поясу. Деньги, ICM и баунти не учитываются — только фишки.'));
  }
  window.MDAResults = { draw, reset: () => { DATA = null; DKEY = null; } };
})();
