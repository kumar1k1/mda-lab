'use strict';
// «Личный кабинет → Результаты»: где и когда вы играете лучше всего.
// Данные: колонки базы (EV, факт, позиция, стек, рум, тип, бай-ин, размер стола) + из главного процесса время, турнир,
// число одновременных турниров и сессия каждой раздачи (parser/results.js). Всё считается здесь под выбранные фильтры.
// Интервалы — бутстрэп по сессиям (сессии перетасовываются целиком: соседние раздачи одной сессии не независимы).
(function () {
  const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };
  const svgNS = 'http://www.w3.org/2000/svg';
  const sv = (t, a, txt) => { const e = document.createElementNS(svgNS, t); if (a) for (const k in a) e.setAttribute(k, a[k]); if (txt != null) e.textContent = txt; return e; };
  // хранилище окна; если браузер его не даёт (превью в чужом окне) — память этой страницы, чтобы вход не терялся
  const MEM = {};
  const LS = { get(k, d) { try { const v = localStorage.getItem(k); if (v != null) return JSON.parse(v); } catch (e) { /* ниже */ } return k in MEM ? MEM[k] : d; }, set(k, v) { MEM[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* только память */ } } };
  const DEF = { tilt: 40, cmp: 'd30', period: 'all', room: -1, bounty: 'all', speed: 'all', kind: 'all', bi: 'all', tbl: 'all', metric: 'ev', adj: 1, pFrom: '', pTo: '', biFrom: '', biTo: '' };
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
      // местное время, час, день недели и месяц каждой раздачи — один раз (смещение пояса — по дню, не по раздаче)
      const N = d.n, T = DATA.t, LT = new Int32Array(N), HOUR = new Int8Array(N), DOW = new Int8Array(N), MON = new Int32Array(N), offDay = new Map();
      for (let i = 0; i < N; i++) {
        const t = T[i]; if (t < 0) { LT[i] = -1; HOUR[i] = -1; DOW[i] = -1; MON[i] = -1; continue; }
        const dk = Math.floor(t / 1440); let o = offDay.get(dk); if (o == null) { o = new Date(t * 60000).getTimezoneOffset(); offDay.set(dk, o); }
        const m = t - o; LT[i] = m; const md = ((m % 1440) + 1440) % 1440; HOUR[i] = Math.floor(md / 60);
        const day = Math.floor(m / 1440); DOW[i] = ((day + 3) % 7 + 7) % 7; // 1 янв 1970 — четверг (пн = 0)
        let mo = offDay.get('m' + day); if (mo == null) { const dt = new Date(day * 864e5); mo = dt.getUTCFullYear() * 12 + dt.getUTCMonth(); offDay.set('m' + day, mo); } MON[i] = mo;
      }
      Object.assign(DATA, { LT, HOUR, DOW, MON });
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
  function select(D, range) {
    const c = D.db.cols, N = D.n, out = [];
    const alias = (typeof state !== 'undefined' && D.db.aliases && D.db.aliases.length > 1 && c.aid) ? state.alias : -1;
    let tMax = 0; for (let i = 0; i < N; i++) if (D.t[i] > tMax) tMax = D.t[i];
    // свой период — по местным датам «с» и «по» включительно
    const cust = !range && F.period === 'custom', dayM = (v) => { const t = Date.parse(v + 'T00:00:00Z'); return Number.isFinite(t) ? t / 60000 : NaN; };
    const cf = cust && Number.isFinite(dayM(F.pFrom)) ? dayM(F.pFrom) : -Infinity, ct = cust && Number.isFinite(dayM(F.pTo)) ? dayM(F.pTo) + 1440 : Infinity;
    // свой бай-ин — от и до (в валюте турнира; в базе — центы)
    const bcu = F.bi === 'custom', bf = bcu && F.biFrom !== '' && Number.isFinite(+F.biFrom) ? Math.round(+F.biFrom * 100) : -Infinity, bt = bcu && F.biTo !== '' && Number.isFinite(+F.biTo) ? Math.round(+F.biTo * 100) : Infinity;
    const from = range ? range[0] : F.period === 'all' || F.period === 'custom' ? -Infinity : tMax - ({ m1: 30, m3: 91, m6: 182, y1: 365 }[F.period] || 0) * 1440, to = range ? range[1] : Infinity;
    for (let i = 0; i < N; i++) {
      if (D.t[i] < 0 || D.t[i] < from || D.t[i] >= to) continue;
      if (cust && (D.LT[i] < cf || D.LT[i] >= ct)) continue;
      if (alias >= 0 && c.aid[i] !== alias) continue;
      if (F.room >= 0 && c.room[i] !== F.room) continue;
      const tr = D.tour[i], k = tr >= 0 ? D.tours[tr][0] : -1, cl = k >= 0 ? D.cls[k] : { speed: 0, myst: false, sat: false };
      const bty = cl.myst ? 2 : c.type && c.type[i] === 1 ? 1 : 0;
      if (F.bounty !== 'all' && bty !== +F.bounty) continue;
      if (F.speed !== 'all' && cl.speed !== +F.speed) continue;
      if (F.kind !== 'all' && (cl.sat ? 1 : 0) !== +F.kind) continue;
      if (bcu) { const b = c.bi ? c.bi[i] : -1; if (b < 0 || b < bf || b > bt) continue; }
      else if (F.bi !== 'all' && biBand(c.bi ? c.bi[i] : -1) !== +F.bi.slice(1)) continue;
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
    if (!X.sid) { const sesMap = new Map(); X.sid = new Int32Array(X.idx.length); X.idx.forEach((i, j) => { let s = sesMap.get(D.ses[i]); if (s == null) { s = sesMap.size; sesMap.set(D.ses[i], s); } X.sid[j] = s; }); X.Sn = sesMap.size; } // один раз на выборку
    const sid = X.sid, Sn = X.Sn, sn = new Float64Array(Sn * K), ss = new Float64Array(Sn * K);
    const n = new Float64Array(K), sum = new Float64Array(K), sesN = new Float64Array(K), sesSeen = new Uint8Array(Sn * K);
    X.idx.forEach((i, j) => { const k = keyOf(i, j); if (k < 0 || k >= K) return; const q = sid[j] * K + k; sn[q]++; ss[q] += vals[j]; n[k]++; sum[k] += vals[j]; if (!sesSeen[q]) { sesSeen[q] = 1; sesN[k]++; } });
    const rows = []; for (let k = 0; k < K; k++) rows.push({ k, n: n[k], v: n[k] ? sum[k] / n[k] * 100 : NaN, sum: sum[k], ses: sesN[k], lo: NaN, hi: NaN });
    // 95% интервал: ошибка среднего с учётом того, что раздачи одной сессии связаны (кластерная оценка по сессиям)
    if (opt.ci !== false && Sn > 2) {
      const vr = new Float64Array(K), ns = new Float64Array(K), m = rows.map(r => r.n ? r.sum / r.n : 0);
      for (let z = 0; z < Sn; z++) { const b = z * K; for (let k = 0; k < K; k++) { const c = sn[b + k]; if (!c) continue; const d = ss[b + k] - m[k] * c; vr[k] += d * d; ns[k]++; } }
      rows.forEach((r, k) => { if (r.n && ns[k] >= 3) { const se = Math.sqrt(vr[k] * ns[k] / (ns[k] - 1)) / r.n * 100; r.lo = r.v - 1.96 * se; r.hi = r.v + 1.96 * se; } });
    }
    return rows;
  }
  const sure = (r) => Number.isFinite(r.lo) && (r.lo > 0 || r.hi < 0);

  // ---------- графики ----------
  function niceTicks(lo, hi, n) {
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0];
    if (hi - lo < 1e-6) { lo = Math.min(lo, -1); hi = Math.max(hi, 1); } // почти ноль (одна сессия после поправки) — обычная шкала
    const span = hi - lo, step0 = span / (n || 4), mag = Math.pow(10, Math.floor(Math.log10(step0))), f = step0 / mag;
    const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag, out = [];
    for (let v = Math.ceil(lo / step) * step, k = 0; v <= hi + step * 1e-6 && k < 50; v += step, k++) out.push(Math.abs(v) < step * 1e-6 ? 0 : v);
    return out;
  }
  // мало раздач для выводов — вместо графика надпись (порог — 300 раздач хотя бы в одной группе)
  const MINN = 300;
  const lack = () => { const d = el('div', 'rs-lack'); d.append(el('b', null, 'Не хватает данных'), el('span', null, 'для нормальной выборки под эти фильтры')); return d; };
  // столбцы со знаком: зелёные — плюс, красные — минус; бледные — мало раздач; усы — 95% интервал; best — янтарная обводка
  function bars(rows, o) {
    o = o || {};
    const W = o.w || 600, H = o.h || 240, pl = 40, pr = 10, pt = 22, pb = o.sub2 ? 58 : o.sub ? 44 : 30;
    const list = rows.filter(r => r.n > 0 && Number.isFinite(r.v));
    const svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'rs-svg', role: 'img', 'aria-label': o.aria || 'график' });
    const minN = o.minN || MINN;
    if (!list.some(r => r.n >= minN)) return lack();
    const maxN = Math.max(...list.map(r => r.n));
    const solid = list.filter(r => r.n >= minN), vs = (solid.length ? solid : list).map(r => r.v); let lo = Math.min(0, ...vs), hi = Math.max(0, ...vs);
    if (hi - lo < 1e-6) { lo = -5; hi = 5; }
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
    if (!cells.some(c => c.n >= (o.minN || 200))) return lack();
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

  // таблица-тепловая карта: строки × столбцы, в клетке — BB/100 (цвет: зелёный плюс, красный минус; бледно — мало раздач)
  function grid2(o) {
    const R = o.rows.length, C = o.cols.length, W = o.w || 600, pl = o.pl || 78, pt = 22, cw = (W - pl - 4) / C, ch = o.ch || (o.text ? 30 : 22), H = pt + R * ch + 6;
    const svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'rs-svg', role: 'img', 'aria-label': o.aria || 'таблица' });
    const minN = o.minN || 300, cells = [];
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) cells.push(Object.assign({ r, c }, o.get(r, c)));
    if (!cells.some(x => x.n >= minN)) return lack();
    const lim = Math.max(8, ...cells.filter(x => x.n >= minN && Number.isFinite(x.v)).map(x => Math.abs(x.v)));
    o.cols.forEach((l, c) => svg.append(sv('text', { x: pl + c * cw + cw / 2, y: 14, 'text-anchor': 'middle', class: 'rs-sub' }, l)));
    o.rows.forEach((l, r) => svg.append(sv('text', { x: pl - 8, y: pt + r * ch + ch / 2 + 4, 'text-anchor': 'end', class: 'rs-lab' }, l)));
    for (const x of cells) {
      const g = sv('g'), rx = pl + x.c * cw, ry = pt + x.r * ch;
      const rect = sv('rect', { x: rx + 1, y: ry + 1, width: cw - 2, height: ch - 2, rx: 4, class: 'rs-cell' });
      g.append(rect);
      if (x.n && Number.isFinite(x.v)) {
        const small = x.n < minN, a = (small ? 0.3 : 1) * (0.1 + 0.85 * Math.min(1, Math.abs(x.v) / lim));
        rect.style.fill = (x.v >= 0 ? 'rgba(var(--good-rgb),' : 'rgba(var(--bad-rgb),') + a.toFixed(2) + ')';
        if (o.text && cw > 34) g.append(sv('text', { x: rx + cw / 2, y: ry + ch / 2 + 4, 'text-anchor': 'middle', class: 'rs-cellv' + (small ? ' small' : '') }, fmt(x.v, Math.abs(x.v) >= 100 ? 0 : 1)));
        g.append(sv('title', null, o.rows[x.r] + ' · ' + o.cols[x.c] + ': ' + fmt(x.v) + ' BB/100 · ' + num(x.n) + ' ' + plural(x.n, 'раздача', 'раздачи', 'раздач') + (small ? ' (мало)' : '')));
      }
      svg.append(g);
    }
    return svg;
  }
  // точки: x, y, размер по числу раздач
  function scatter(pts, o) {
    if (pts.length < 3) return lack();
    const W = o.w || 600, H = o.h || 260, pl = 48, pr = 10, pt = 12, pb = 30;
    const svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'rs-svg', role: 'img', 'aria-label': o.aria || 'точки' });
    if (!pts.length) return svg;
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const x0 = 0, x1 = Math.max(...xs) * 1.05 || 1; let y0 = Math.min(0, ...ys), y1 = Math.max(0, ...ys); const pd = (y1 - y0) * 0.08 || 10; y0 -= pd; y1 += pd;
    const X = (v) => pl + (v - x0) / (x1 - x0) * (W - pl - pr), Y = (v) => pt + (y1 - v) / (y1 - y0) * (H - pt - pb);
    for (const tk of niceTicks(y0, y1, 4)) svg.append(sv('line', { x1: pl, x2: W - pr, y1: Y(tk), y2: Y(tk), class: tk === 0 ? 'rs-zero' : 'rs-gl' }), sv('text', { x: pl - 6, y: Y(tk) + 4, 'text-anchor': 'end', class: 'rs-ax' }, (tk > 0 ? '+' : '') + num(tk)));
    for (const tk of niceTicks(0, x1, 6)) svg.append(sv('text', { x: X(tk), y: H - 10, 'text-anchor': 'middle', class: 'rs-ax' }, tk + (o.xu || '')));
    const maxN = Math.max(...pts.map(p => p.n));
    pts.forEach(p => { const c = sv('circle', { cx: X(p.x), cy: Y(p.y), r: (3 + 7 * Math.sqrt(p.n / maxN)).toFixed(1), class: 'rs-dot ' + (p.y >= 0 ? 'pos' : 'neg') }); c.append(sv('title', null, p.tip)); svg.append(c); });
    return svg;
  }
  // календарь: недели × дни, клетка — результат дня
  function calendar(days, o) {
    if (days.size < 2) return lack();
    const keys = [...days.keys()].sort((a, b) => a - b); if (!keys.length) return sv('svg');
    const last = keys[keys.length - 1], first = Math.max(keys[0], last - 7 * 53 + 1);
    const dowOf = (d) => (new Date(d * 864e5).getUTCDay() + 6) % 7, start = first - dowOf(first), weeks = Math.ceil((last - start + 1) / 7);
    const W = 1150, pl = 28, pt = 18, cs = Math.min(19, (W - pl - 4) / weeks), H = pt + 7 * cs + 4;
    const svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'rs-svg', role: 'img', 'aria-label': 'календарь игровых дней' });
    const vals = keys.filter(k => k >= first).map(k => days.get(k)).filter(x => x.n >= 300).map(x => Math.abs(x.v)); const lim = Math.max(10, ...vals);
    const MN = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']; let pm = -1;
    for (let d = start; d <= last; d++) {
      const w = Math.floor((d - start) / 7), r = dowOf(d), x = pl + w * cs, y = pt + r * cs, dt = new Date(d * 864e5);
      if (r === 0 && dt.getUTCMonth() !== pm) { pm = dt.getUTCMonth(); svg.append(sv('text', { x, y: 11, class: 'rs-sub' }, MN[pm])); }
      if (d < first) continue;
      const rect = sv('rect', { x: x + 1, y: y + 1, width: cs - 2, height: cs - 2, rx: 3, class: 'rs-cell' }), z = days.get(d);
      if (z) { const a = (z.n < 300 ? 0.35 : 1) * (0.15 + 0.85 * Math.min(1, Math.abs(z.v) / lim)); rect.style.fill = (z.sum >= 0 ? 'rgba(var(--good-rgb),' : 'rgba(var(--bad-rgb),') + a.toFixed(2) + ')'; rect.append(sv('title', null, dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) + ': ' + fmt(z.sum, 0) + ' BB (' + fmt(z.v) + ' BB/100) · ' + num(z.n) + ' раздач')); }
      svg.append(rect);
    }
    ['пн', '', 'ср', '', 'пт', '', 'вс'].forEach((l, r) => { if (l) svg.append(sv('text', { x: pl - 6, y: pt + r * cs + cs / 2 + 4, 'text-anchor': 'end', class: 'rs-sub' }, l)); });
    return svg;
  }
  // имя турнира для рейтинга: без номеров, дней и стадий
  function fixText(s) { if (/Ð|Ñ/.test(s)) { try { return decodeURIComponent(escape(s)); } catch (e) { /* как есть */ } } return s; }
  function tourName(t) {
    let s = fixText(String(t || ''));
    if (/^Турнир #\d+$/.test(s)) return 'Без названия (в истории только номер)';
    s = s.replace(/\s*·\s*#\d+\s*$/, '').replace(/^#\d+\s*-\s*/, '').replace(/\[(Day|Stage|День)[^\]]*\]/gi, '').replace(/\b(Day|Stage)\s*\d+\w*/gi, '').replace(/\s{2,}/g, ' ').trim();
    return s || 'Без названия';
  }
  // ---------- страница ----------
  let ROOT = null, WAIT = 0, WT = null, GEN = 0;
  const CACHE = new Map(); // ключ фильтров → готовые блоки страницы (переключение назад — мгновенно)
  const tick = () => new Promise(r => setTimeout(r, 0));
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
  // «Период» со своим интервалом дат
  const isoDay = (m) => new Date(Math.floor(m / 1440) * 864e5).toISOString().slice(0, 10);
  function periodBox(D) {
    if (D.dMin == null) { let a = Infinity, b = -Infinity; for (let i = 0; i < D.n; i++) { const v = D.LT[i]; if (v < 0) continue; if (v < a) a = v; if (v > b) b = v; } D.dMin = isoDay(a); D.dMax = isoDay(b); D.dMaxM = b; }
    const w = seg('Период', 'period', [['all', 'Всё'], ['y1', 'Год'], ['m6', '6 мес'], ['m3', '3 мес'], ['m1', '30 дней'], ['custom', 'Свой']], () => {
      if (F.period === 'custom') { if (!F.pTo) F.pTo = D.dMax; if (!F.pFrom) F.pFrom = isoDay(D.dMaxM - 30 * 1440) < D.dMin ? D.dMin : isoDay(D.dMaxM - 30 * 1440); saveF(); }
      draw();
    });
    if (F.period === 'custom') {
      const r = el('div', 'rs-range'); const a = el('input'), b = el('input'); a.type = b.type = 'date'; a.min = b.min = D.dMin; a.max = b.max = D.dMax; a.value = F.pFrom; b.value = F.pTo;
      a.setAttribute('aria-label', 'Период с'); b.setAttribute('aria-label', 'Период по');
      const apply = () => { let x = a.value, y = b.value; if (x && y && x > y) { const t = x; x = y; y = t; } F.pFrom = x; F.pTo = y; saveF(); draw(); };
      a.onchange = b.onchange = apply;
      r.append(el('span', null, 'с'), a, el('span', null, 'по'), b); w.append(r);
    }
    return w;
  }
  // «Бай-ин» со своим интервалом
  function biBox() {
    const w = sel('Бай-ин', 'bi', BI.concat([['custom', 'Свой…']]));
    if (F.bi === 'custom') {
      const r = el('div', 'rs-range'); const a = el('input'), b = el('input');
      for (const x of [a, b]) { x.type = 'number'; x.min = '0'; x.step = 'any'; x.inputMode = 'decimal'; x.className = 'rs-num-in'; }
      a.placeholder = 'от'; b.placeholder = 'до'; a.value = F.biFrom; b.value = F.biTo; a.setAttribute('aria-label', 'Бай-ин от'); b.setAttribute('aria-label', 'Бай-ин до');
      const apply = () => { let x = a.value.trim(), y = b.value.trim(); if (x !== '' && y !== '' && +x > +y) { const t = x; x = y; y = t; } if (F.biFrom === x && F.biTo === y) return; F.biFrom = x; F.biTo = y; saveF(); draw(); };
      // применяется по Enter или когда курсор ушёл из обоих полей (переход «от» → «до» не пересчитывает)
      a.onkeydown = b.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } };
      r.addEventListener('focusout', (e) => { if (!r.contains(e.relatedTarget)) apply(); });
      r.append(a, el('span', null, '—'), b, el('small', null, '$ / €')); w.append(r);
    }
    return w;
  }
  function card(title, hint, wide) {
    const c = el('section', 'rs-card' + (wide ? ' wide' : '')); const h = el('div', 'rs-card-h'); h.append(el('h3', null, title)); if (hint) h.append(el('p', null, hint)); c.append(h); return c;
  }
  function legend(items) { const l = el('div', 'rs-leg'); items.forEach(([cls, t]) => { const i = el('span'); i.append(el('i', cls), document.createTextNode(t)); l.append(i); }); return l; }
  function note(t) { return el('p', 'rs-note', t); }

  // ошибка в одном расчёте не должна оставлять страницу недорисованной
  async function draw(root) {
    try { await draw0(root); }
    catch (e) { console.error('results', e); if (ROOT) { ROOT.querySelectorAll('.rs-card .rs-note').forEach(n => { if (n.textContent === 'Считаю…') n.textContent = 'Не удалось досчитать под эти фильтры.'; }); ROOT.append(note('Ошибка расчёта: ' + (e && e.message || e) + '. Измените фильтры или нажмите «Сбросить».')); } }
  }
  async function draw0(root) {
    if (root) { ROOT = root; WAIT = 0; } if (!ROOT) return;
    const R = ROOT, gen = ++GEN;
    const ckey = JSON.stringify(F) + '|' + DKEY + '|' + (typeof state !== 'undefined' ? state.alias : 0) + '|' + (typeof HERO_DB !== 'undefined' && HERO_DB ? HERO_DB.count : 0);
    if (DATA && DATA.db === (typeof HERO_DB !== 'undefined' ? HERO_DB : null) && CACHE.has(ckey)) { const keep = R.scrollTop; R.replaceChildren(...CACHE.get(ckey)); R.scrollTop = keep; return; }
    const keepTop = R.scrollTop; R.replaceChildren();
    const head = el('div', 'rs-head'); head.append(el('h2', null, 'Результаты'), el('p', null, 'Где и когда вы играете лучше всего: число столов, ход сессии, время, дни и форматы турниров. Наведите на столбец — подробности; усы — 95% интервал.'));
    R.append(head);
    const D = await load();
    if (!D) {
      // база ещё грузится (или результаты не прочитались) — показать ожидание и попробовать снова, пока страница открыта
      const e = el('div', 'rs-card'); const busy = WAIT < 120;
      e.append(el('h3', null, busy ? 'Загружаю базу…' : 'Нет данных'), el('p', 'rs-note', busy ? 'Статистика появится, как только база загрузится.' : typeof HERO_DB !== 'undefined' && HERO_DB ? 'Не удалось прочитать время раздач из базы.' : 'Загрузите базу на вкладке «Моя база» — здесь появится статистика.'));
      R.append(e);
      if (busy) { WAIT++; clearTimeout(WT); WT = setTimeout(() => { if (ROOT === R && R.isConnected) draw(); }, 500); }
      return;
    }
    WAIT = 0;
    if (R !== ROOT) return;
    const c = D.db.cols, rooms = D.db.rooms || [];
    // фильтры
    const fb = el('div', 'rs-filters');
    fb.append(
      periodBox(D),
      sel('Рум', 'room', [[-1, 'Все румы']].concat(rooms.map((r, k) => [k, r]))),
      seg('Баунти', 'bounty', [['all', 'Все'], ['0', 'Без'], ['1', 'PKO'], ['2', 'Mystery']]),
      seg('Скорость', 'speed', [['all', 'Все'], ['0', 'Обычная'], ['1', 'Турбо'], ['2', 'Гипер']]),
      biBox(),
      seg('Стол', 'tbl', [['all', 'Все'], ['1', '6-max'], ['2', '7–8'], ['3', '9-max']]),
      seg('Тип', 'kind', [['all', 'Все'], ['0', 'Обычные'], ['1', 'Сателлиты']]),
      seg('Считать', 'metric', [['ev', 'EV'], ['net', 'Факт']]),
      seg('Поправка', 'adj', [[1, 'На позицию и стек'], [0, 'Без']])
    );
    const reset = el('button', 'rs-reset', 'Сбросить'); reset.type = 'button'; reset.onclick = () => { Object.assign(F, DEF); saveF(); draw(); };
    if (Object.keys(DEF).some(k => !['cmp', 'tilt', 'pFrom', 'pTo', 'biFrom', 'biTo'].includes(k) && String(F[k]) !== String(DEF[k]))) fb.append(reset);
    R.append(fb);
    const X = select(D);
    if (!X.idx.length) { R.append(note('Под эти фильтры раздач нет. Ослабьте фильтры или нажмите «Сбросить».')); return; }
    const mName = (F.metric === 'net' ? 'Факт' : 'EV') + (F.adj ? ' с поправкой' : '');
    const tzOff = (m) => new Date(m * 60000).getTimezoneOffset();
    const lt = (i) => D.LT[i]; // местное время (посчитано при загрузке)
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
    const cI = card('Главное', 'Выводы под текущие фильтры. «Надёжно» — интервал не захватывает ноль; «тенденция» — может быть случайностью.', true);
    cI.append(el('p', 'rs-note', 'Считаю…')); grid.append(cI);
    R.scrollTop = keepTop;
    const step = async () => { await tick(); return gen !== GEN || !R.isConnected; };
    if (await step()) return;
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
    if (await step()) return;
    // ---- ход сессии ----
    const gS = groups(D, X, (i) => Math.min(9, Math.floor(D.since[i] / 60)), 10);
    const cS = card('По ходу сессии', 'Результат по часам от начала сессии (сессия — игра без перерыва больше 45 минут). Видно, когда падает концентрация.');
    cS.append(bars(gS.map((r, q) => Object.assign(r, { label: q === 9 ? '9+ ч' : q + '–' + (q + 1) })), { sub: true, aria: 'результат по ходу сессии' }));
    // наклон
    {
      let n = 0, sx = 0, sy = 0; X.idx.forEach((i, j) => { n++; sx += D.since[i] / 60; sy += X.v[j] * 100; });
      const mx = sx / n, my = sy / n; let sxx = 0, sxy = 0; X.idx.forEach((i, j) => { const dx = D.since[i] / 60 - mx; sxx += dx * dx; sxy += dx * (X.v[j] * 100 - my); });
      const sl = sxx ? sxy / sxx : 0, cs = new Map(); X.idx.forEach((i, j) => { const dx = D.since[i] / 60 - mx, e = X.v[j] * 100 - my - sl * dx; cs.set(D.ses[i], (cs.get(D.ses[i]) || 0) + dx * e); });
      let v2 = 0; for (const x of cs.values()) v2 += x * x; const G = cs.size, se = sxx && G >= 3 ? Math.sqrt(v2 * G / (G - 1)) / sxx : NaN, lo = sl - 1.96 * se, hi = sl + 1.96 * se;
      const s = el('p', 'rs-verdict ' + (hi < 0 ? 'neg' : lo > 0 ? 'pos' : ''));
      if (!Number.isFinite(se)) { s.append(el('b', null, 'Мало сессий'), document.createTextNode(' — чтобы оценить, падает ли игра к концу сессии, нужно хотя бы 3 сессии под эти фильтры.')); cS.append(s); }
      else {
      s.append(el('b', null, (sl < 0 ? 'Каждый час сессии: ' : 'Каждый час сессии: ') + fmt(sl, 2) + ' BB/100'), document.createTextNode(hi < 0 ? ' — результат надёжно падает к концу сессии. ' : lo > 0 ? ' — к концу сессии вы играете даже лучше. ' : ' — ровного падения нет, разница в пределах случайности. '), el('span', 'rs-muted', '95%: от ' + fmt(lo, 2) + ' до ' + fmt(hi, 2)));
      cS.append(s); }
    }
    grid.append(cS);
    if (await step()) return;
    // ---- длина сессии ----
    const SL = [[0, 120, 'до 2 ч'], [120, 240, '2–4 ч'], [240, 360, '4–6 ч'], [360, 480, '6–8 ч'], [480, 600, '8–10 ч'], [600, 1e9, '10+ ч']];
    const slOf = (s) => { const z = D.sessions[s], L = z[1] - z[0]; return SL.findIndex(b => L >= b[0] && L < b[1]); };
    const gL = groups(D, X, (i) => slOf(D.ses[i]), SL.length);
    const cL = card('Длина сессии', 'Весь результат сессий разной длины. Под столбцом — сколько было таких сессий.');
    cL.append(bars(gL.map((r, q) => Object.assign(r, { label: SL[q][2], sub: r.ses ? r.ses + ' ' + plural(r.ses, 'сессия', 'сессии', 'сессий') : '' })), { sub: true, aria: 'результат по длине сессии' }));
    grid.append(cL);
    if (await step()) return;
    // ---- дни недели ----
    const gD = groups(D, X, (i) => D.DOW[i], 7);
    const okD = gD.filter(r => r.n >= nH * 0.04); const bestD = okD.length ? okD.reduce((a, b) => b.v > a.v ? b : a) : null;
    const cD = card('Дни недели', 'По вашему времени (часовой пояс компьютера).');
    cD.append(bars(gD.map((r, q) => Object.assign(r, { label: DOW[q], best: r === bestD })), { sub: true, aria: 'результат по дням недели' }));
    grid.append(cD);
    if (await step()) return;
    // ---- время суток ----
    const gH = groups(D, X, (i) => D.HOUR[i], 24);
    const cH = card('Время суток', 'Результат по часу начала раздачи, по вашему времени. Бледные часы — мало раздач.', true);
    cH.append(bars(gH.map((r, q) => Object.assign(r, { label: String(q).padStart(2, '0') })), { w: 1150, h: 260, sub: true, aria: 'результат по часам', minN: Math.max(300, nH * 0.01) }));
    grid.append(cH);
    if (await step()) return;
    // ---- неделя × часы ----
    const gW = groups(D, X, (i) => D.DOW[i] * 24 + D.HOUR[i], 168, { ci: false });
    const cW = card('Неделя × часы', 'Каждая клетка — день недели и час. Зелёный — плюс, красный — минус; чем ярче, тем сильнее. Бледные клетки — мало раздач.', true);
    cW.append(heat(gW, { minN: Math.max(150, nH * 0.004) }));
    grid.append(cW);
    if (await step()) return;
    // ---- накопленный результат ----
    {
      const step = Math.max(1, Math.floor(nH / 700)), pe = [], pn = []; let a = 0, b = 0;
      const ord = X.idx.map((i, j) => j).sort((p, q) => D.t[X.idx[p]] - D.t[X.idx[q]]);
      ord.forEach((j, q) => { a += X.ev[j]; b += X.net[j]; if (q % step === 0 || q === ord.length - 1) { pe.push([q + 1, a]); pn.push([q + 1, b]); } });
      const marks = []; let pm = -1; ord.forEach((j, q) => { const m = D.MON[X.idx[j]]; if (m !== pm) { if (pm >= 0) marks.push([q, ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][m % 12] + (m % 12 === 0 ? ' ' + Math.floor(m / 12) : '')]); pm = m; } });
      const cG = card('Накопленный результат', 'Сумма BB по раздачам по порядку: янтарная — EV, голубая — фактический результат. Разница между ними — везение.', true);
      const mk2 = []; marks.forEach(m => { if (!mk2.length || (m[0] - mk2[mk2.length - 1][0]) / nH * 1080 > 70) mk2.push(m); });
      if (nH < MINN) cG.append(lack());
      else { cG.append(lines([{ pts: pe, cls: 'ev' }, { pts: pn, cls: 'net' }], { marks: mk2, aria: 'накопленный результат' })); cG.append(legend([['lg-ev', 'EV, BB'], ['lg-net', 'факт, BB']])); }
      grid.append(cG);
    }
    if (await step()) return;
    // ---- месяцы ----
    {
      const mk = (i) => D.MON[i];
      const ms = [...new Set(X.idx.map(mk))].sort((a, b) => a - b).slice(-18), mi = new Map(ms.map((m, k) => [m, k]));
      const gM = groups(D, X, (i) => { const k = mi.get(mk(i)); return k == null ? -1 : k; }, ms.length);
      const MN = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
      const cM = card('По месяцам', 'Последние ' + ms.length + ' ' + plural(ms.length, 'месяц', 'месяца', 'месяцев') + ' с игрой.');
      cM.append(bars(gM.map((r, q) => Object.assign(r, { label: MN[ms[q] % 12] + (ms.length > 12 || q === 0 || ms[q] % 12 === 0 ? ' ' + String(Math.floor(ms[q] / 12)).slice(2) : '') })), { sub: true, aria: 'результат по месяцам' }));
      grid.append(cM);
    }
    if (await step()) return;
    // ---- позиции и глубина стека (без поправки — иначе они обнуляются) ----
    {
      const raw = F.metric === 'net' ? X.net : X.ev;
      const gP = groups(D, X, (i) => c.pos[i], 7, { vals: raw });
      const cP = card('Позиции', 'Без поправки: сколько BB/100 приносит каждая позиция (блайнды всегда в минусе — это нормально).');
      cP.append(bars(gP.map((r, q) => Object.assign(r, { label: POS[q] })).filter(r => r.n), { sub: true, aria: 'результат по позициям' }));
      grid.append(cP);
      const gK = groups(D, X, (i) => stkB(c.bb[i] / 10), 5, { vals: raw });
      const cK = card('Глубина стека', 'Без поправки: результат при разном вашем стеке — ранняя стадия (глубоко) против пуш-фолда.');
      cK.append(bars(gK.map((r, q) => Object.assign(r, { label: STK[q] })), { sub: true, aria: 'результат по глубине стека' }));
      grid.append(cK);
    }
    if (await step()) return;
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
      tb.append(body); const wrap = el('div', 'rs-table-w'); wrap.append(tb); cF.append(nH < MINN ? lack() : wrap);
      cF.append(note('«~» — интервал захватывает ноль: разница может быть случайной. Везение — факт минус EV (олл-ины, которые выиграли или проиграли сверх ожидания).'));
      grid.append(cF);
    }
    if (await step()) return;
    // ---- сравнение двух периодов (остальные фильтры действуют, «Период» — нет) ----
    {
      const cC = card('Сравнение периодов', 'Последний период против предыдущего такой же длины. Остальные фильтры страницы действуют, «Период» — нет.', true);
      const CMP = [['d30', '30 дней'], ['d90', '3 месяца'], ['d182', '6 месяцев'], ['d365', 'Год']];
      if (!CMP.some(x => x[0] === F.cmp)) F.cmp = 'd30';
      const segC = el('div', 'seg bx-seg'); CMP.forEach(([v, l]) => { const b = el('button', F.cmp === v ? 'on' : null, l); b.type = 'button'; b.setAttribute('aria-pressed', String(F.cmp === v)); b.onclick = () => { F.cmp = v; saveF(); draw(); }; segC.append(b); });
      cC.append(segC);
      let tMax = 0; for (let i = 0; i < D.n; i++) if (D.t[i] > tMax) tMax = D.t[i];
      const L = +F.cmp.slice(1) * 1440, A = select(D, [tMax - L + 1, tMax + 1]), B = select(D, [tMax - 2 * L + 1, tMax - L + 1]);
      const stat = (Y) => {
        const n = Y.idx.length, ses = new Set(), tours = new Set(); let e = 0, f = 0, v = 0;
        Y.idx.forEach((i, j) => { ses.add(D.ses[i]); if (D.tour[i] >= 0) tours.add(D.tour[i]); e += Y.ev[j]; f += Y.net[j]; v += Y.v[j]; });
        let m = 0; for (const z of ses) { const q = D.sessions[z]; m += Math.max(15, q[1] - q[0]); }
        let cs = 0; Y.idx.forEach(i => { cs += D.conc[i]; });
        return { n, ses: ses.size, tours: tours.size, h: m / 60, ev: n ? e / n * 100 : NaN, net: n ? f / n * 100 : NaN, v: n ? v / n * 100 : NaN, evh: m ? e / (m / 60) : NaN, conc: n ? cs / n : NaN, len: ses.size ? m / 60 / ses.size : NaN };
      };
      const a = stat(A), b = stat(B);
      const dfmt = (d, digits) => !Number.isFinite(d) ? '' : (d > 0 ? '▲ ' : d < 0 ? '▼ ' : '') + Math.abs(d).toFixed(digits == null ? 1 : digits);
      const rows = [
        ['Раздач', num(a.n), num(b.n), a.n - b.n, 0, 0],
        ['Турниров', num(a.tours), num(b.tours), a.tours - b.tours, 0, 0],
        ['Сессий', num(a.ses), num(b.ses), a.ses - b.ses, 0, 0],
        ['Часов игры', num(a.h), num(b.h), a.h - b.h, 0, 0],
        ['Средняя сессия, ч', a.len.toFixed(1), b.len.toFixed(1), a.len - b.len, 1, 0],
        ['Столов одновременно (в среднем)', a.conc.toFixed(1), b.conc.toFixed(1), a.conc - b.conc, 1, 0],
        ['EV, BB/100', fmt(a.ev), fmt(b.ev), a.ev - b.ev, 1, 1],
        ['Факт, BB/100', fmt(a.net), fmt(b.net), a.net - b.net, 1, 1],
        ['Везение, BB/100', fmt(a.net - a.ev), fmt(b.net - b.ev), (a.net - a.ev) - (b.net - b.ev), 1, 1],
        ['EV в час, BB', fmt(a.evh), fmt(b.evh), a.evh - b.evh, 1, 1]
      ];
      const lab = CMP.find(x => x[0] === F.cmp)[1].toLowerCase();
      const tb = el('table', 'rs-table rs-cmp'); const hr = el('tr');
      ['', 'Последние ' + lab, 'Предыдущие ' + lab, 'Разница'].forEach((t, q) => { const h = el('th', q ? 'num' : null, t); h.scope = 'col'; hr.append(h); });
      const th = el('thead'); th.append(hr); tb.append(th); const body = el('tbody');
      rows.forEach(([l, x, y, d, dg, good]) => { const tr = el('tr'); const h = el('th', null, l); h.scope = 'row'; tr.append(h, el('td', 'num', x), el('td', 'num rs-dim', y), el('td', 'num' + (good && Number.isFinite(d) ? (d >= 0 ? ' pos' : ' neg') : ''), (a.n && b.n) ? dfmt(d, dg) : '')); body.append(tr); });
      tb.append(body); const w = el('div', 'rs-table-w'); w.append(tb);
      if (a.n < MINN || b.n < MINN) cC.append(lack());
      else cC.append(w);
      if (a.n < MINN || b.n < MINN) { /* надпись выше */ }
      else if (Math.min(a.n, b.n) < 5000) cC.append(note('Меньше 5 000 раздач в периоде — разница в BB/100 почти наверняка случайна.'));
      grid.append(cC);
    }
    // ===== дополнительные блоки (#16 и дальше) =====
    {
      const raw = F.metric === 'net' ? X.net : X.ev;
      const alias = (typeof state !== 'undefined' && D.db.aliases && D.db.aliases.length > 1 && c.aid) ? state.alias : -1;
      // все раздачи (без фильтров формата) — для событий: крупные проигрыши, новые турниры, перерывы, румы
      const sesT = new Map(), sesLoss = new Map(), sesStart = new Map();
      const thr = +(F.tilt || 40);
      for (let i = 0; i < D.n; i++) {
        if (D.t[i] < 0 || (alias >= 0 && c.aid[i] !== alias)) continue;
        const s = D.ses[i]; if (!sesT.has(s)) { sesT.set(s, []); sesLoss.set(s, []); sesStart.set(s, []); }
        sesT.get(s).push(D.t[i]); if (c.net[i] / 10 <= -thr) sesLoss.get(s).push(D.t[i]);
      }
      for (const [s, a] of sesT) a.sort((p, q) => p - q);
      for (const [s, a] of sesLoss) a.sort((p, q) => p - q);
      // начало каждого розыгрыша турнира — по первой раздаче
      for (let i = 0; i < D.n; i++) { const tr = D.tour[i]; if (tr < 0 || D.t[i] !== D.tours[tr][1]) continue; const st = sesStart.get(D.ses[i]); if (st && !st.some(z => z[1] === tr)) st.push([D.t[i], tr]); }
      for (const [s, a] of sesStart) a.sort((p, q) => p[0] - q[0]);
      const lastBefore = (arr, t, strict) => { let lo = 0, hi = arr.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (strict ? arr[m] < t : arr[m] <= t) { r = m; lo = m + 1; } else hi = m - 1; } return r >= 0 ? arr[r] : null; };

      if (await step()) return;
      // #16 после крупного проигрыша
      {
        const cA = card('После крупного проигрыша', 'Как вы играете сразу после проигранной раздачи на ' + thr + '+ BB (на любом столе) — проверка на тильт. «Обычно» — все остальные раздачи.');
        const sg = el('div', 'seg bx-seg'); [[25, '25+ BB'], [40, '40+ BB'], [70, '70+ BB']].forEach(([v, l]) => { const b = el('button', thr === v ? 'on' : null, l); b.type = 'button'; b.onclick = () => { F.tilt = v; saveF(); draw(); }; sg.append(b); }); cA.append(sg);
        const L = ['Обычно', '0–10 мин', '10–30 мин', '30–60 мин'];
        const g = groups(D, X, (i) => { const lt0 = lastBefore(sesLoss.get(D.ses[i]) || [], D.t[i], true); if (lt0 == null) return 0; const d = D.t[i] - lt0; return d < 10 ? 1 : d < 30 ? 2 : d < 60 ? 3 : 0; }, 4);
        cA.append(bars(g.map((r, q) => Object.assign(r, { label: L[q] })), { sub: true, aria: 'результат после крупного проигрыша' }));
        const b0 = g[0], b1 = g[1];
        if (b0.n && b1.n) cA.append(el('p', 'rs-verdict ' + (b1.v < b0.v ? 'neg' : 'pos'), 'Первые 10 минут после крупного проигрыша: ' + fmt(b1.v) + ' против обычных ' + fmt(b0.v) + ' BB/100' + (sure(b1) && b1.v < 0 ? ' — похоже на тильт: после такого банка стоит взять минуту паузы.' : '.')));
        grid.append(cA);
      }
      if (await step()) return;
      // #17 после регистрации в новом турнире
      {
        const L = ['Без нового стола', '0–5 мин', '5–15 мин', '15–30 мин'];
        const g = groups(D, X, (i) => { const st = sesStart.get(D.ses[i]) || []; let best = null; for (let k = st.length - 1; k >= 0; k--) { if (st[k][0] > D.t[i]) continue; if (st[k][1] === D.tour[i]) continue; best = st[k][0]; break; } if (best == null) return 0; const d = D.t[i] - best; return d < 5 ? 1 : d < 15 ? 2 : d < 30 ? 3 : 0; }, 4);
        const cN = card('Когда открываете новый турнир', 'Результат на остальных столах в первые минуты после того, как сели за новый турнир: цена отвлечения на регистрацию и новый стол.');
        cN.append(bars(g.map((r, q) => Object.assign(r, { label: L[q] })), { sub: true, aria: 'результат после открытия нового турнира' }));
        grid.append(cN);
      }
      if (await step()) return;
      // #18 столы × ход сессии
      {
        const TB = ['1–2', '3–4', '5–6', '7–8', '9+'], tb = (n) => n <= 2 ? 0 : n <= 4 ? 1 : n <= 6 ? 2 : n <= 8 ? 3 : 4, SH = ['0–1', '1–2', '2–3', '3–4', '4–5', '5–6', '6–7', '7+'];
        const g = groups(D, X, (i) => tb(D.conc[i]) * 8 + Math.min(7, Math.floor(D.since[i] / 60)), 40, { ci: false });
        const cX = card('Столы × ход сессии', 'Строки — сколько столов, столбцы — час от начала сессии. Например: 7–8 столов нормально в начале, но плохо к концу.');
        cX.append(grid2({ rows: TB.map(x => x + ' ст.'), cols: SH.map(x => x + ' ч'), get: (r, cc) => g[r * 8 + cc], text: true, aria: 'столы и ход сессии', minN: 500 }));
        grid.append(cX);
      }
      if (await step()) return;
      // #19 час суток × час сессии
      {
        const HB = ['00–02', '02–04', '04–06', '06–08', '08–10', '10–12', '12–14', '14–16', '16–18', '18–20', '20–22', '22–24'], SH = ['0–1', '1–2', '2–3', '3–4', '4–5', '5–6', '6–7', '7+'];
        const g = groups(D, X, (i) => (D.HOUR[i] >> 1) * 8 + Math.min(7, Math.floor(D.since[i] / 60)), 96, { ci: false });
        const used = HB.map((_, r) => g.slice(r * 8, r * 8 + 8).some(x => x.n)).map((u, r) => u ? r : -1).filter(r => r >= 0);
        const cY = card('Время суток × час сессии', 'Отделяет «поздно по часам» от «устали за длинную сессию»: если краснеет столбец — дело в длине сессии, если строка — во времени суток.');
        cY.append(grid2({ rows: used.map(r => HB[r]), cols: SH.map(x => x + ' ч'), get: (r, cc) => g[used[r] * 8 + cc], text: true, aria: 'время суток и ход сессии', minN: 500 }));
        grid.append(cY);
      }
      if (await step()) return;
      // #20 стиль игры по ходу сессии и по столам
      {
        const sit = c.sit, act = c.act, rz = c.rz, cl = c.cl, lr = c.lr, f3b = c.f3b, fcb = c.fcb, pos = c.pos;
        const M = [['Открытие', (i) => sit[i] === 0 && pos[i] <= 5 ? (act[i] >= 2 ? 1 : 0) : -1], ['Колд-колл', (i) => rz[i] === 1 && cl[i] === 0 && lr[i] === 0 && pos[i] !== 6 ? (act[i] === 1 ? 1 : 0) : -1], ['Фолд на 3-бет', (i) => f3b[i] >= 0 ? (f3b[i] === 1 ? 1 : 0) : -1], ['Фолд на контбет', (i) => fcb && fcb[i] >= 0 ? (fcb[i] === 1 ? 1 : 0) : -1]];
        const tbl = (title, keyOf, labels) => {
          const K = labels.length, A = M.map(() => labels.map(() => [0, 0])), T = M.map(() => [0, 0]);
          X.idx.forEach(i => { const k = keyOf(i); if (k < 0 || k >= K) return; M.forEach(([, f], m) => { const v = f(i); if (v < 0) return; A[m][k][0] += v; A[m][k][1]++; T[m][0] += v; T[m][1]++; }); });
          const t = el('table', 'rs-table rs-style'); const hr = el('tr'); [title].concat(M.map(m => m[0])).forEach((h, q) => { const th = el('th', q ? 'num' : null, h); th.scope = 'col'; hr.append(th); }); const th = el('thead'); th.append(hr); t.append(th);
          const tb = el('tbody');
          labels.forEach((l, k) => { const tr = el('tr'); const h = el('th', null, l); h.scope = 'row'; tr.append(h);
            M.forEach((_, m) => { const [x, n] = A[m][k], [tx, tn] = T[m]; const p = n ? x / n : NaN, p0 = tn ? tx / tn : NaN, se = Math.sqrt(p0 * (1 - p0) / Math.max(1, n)), z = n ? (p - p0) / (se || 1) : 0;
              const td = el('td', 'num' + (n >= 50 && Math.abs(z) >= 2 ? (z > 0 ? ' up' : ' down') : ''), n ? (p * 100).toFixed(1) + '%' : '—'); td.title = n ? x + ' из ' + n + ' (в среднем ' + (p0 * 100).toFixed(1) + '%)' : ''; tr.append(td); });
            tb.append(tr); });
          const trA = el('tr', 'rs-avg'); const hA = el('th', null, 'В среднем'); hA.scope = 'row'; trA.append(hA); M.forEach((_, m) => { const [tx, tn] = T[m]; trA.append(el('td', 'num', tn ? (tx / tn * 100).toFixed(1) + '%' : '—')); }); tb.append(trA);
          t.append(tb); const w = el('div', 'rs-table-w'); w.append(t); return w;
        };
        const cZ = card('Стиль игры: усталость и многостол', 'Меняется ли ваша игра (а не только результат). Цветом — заметное отличие от вашего среднего: янтарный — чаще, голубой — реже.', true);
        const two = el('div', 'rs-two');
        two.append(tbl('Час сессии', (i) => Math.min(6, Math.floor(D.since[i] / 60)), ['0–1 ч', '1–2 ч', '2–3 ч', '3–4 ч', '4–5 ч', '5–6 ч', '6+ ч']), tbl('Столов', (i) => { const n = D.conc[i]; return n <= 2 ? 0 : n <= 4 ? 1 : n <= 6 ? 2 : n <= 8 ? 3 : 4; }, ['1–2', '3–4', '5–6', '7–8', '9+']));
        cZ.append(nH < MINN ? lack() : two); grid.append(cZ);
      }
      if (await step()) return;
      // #21 рейтинг турниров по названию
      {
        const nameIdx = new Map(), names = []; const tn = D.titles.map(x => { const k = x.room + '|' + tourName(x.t); let q = nameIdx.get(k); if (q == null) { q = names.length; nameIdx.set(k, q); names.push({ room: rooms[x.room] || '', name: tourName(x.t) }); } return q; });
        const keyOf = (i) => D.tour[i] >= 0 ? tn[D.tours[D.tour[i]][0]] : -1;
        const K = names.length, gv = groups(D, X, keyOf, K, { B: 100 }), ge = groups(D, X, keyOf, K, { vals: X.ev, ci: false }), gn = groups(D, X, keyOf, K, { vals: X.net, ci: false });
        const tours = names.map(() => new Set()); X.idx.forEach(i => { const k = keyOf(i); if (k >= 0) tours[k].add(D.tour[i]); });
        const minH = Math.max(400, Math.round(X.idx.length * 0.004));
        const list = gv.map((r, k) => Object.assign(r, { k })).filter(r => r.n >= minH).sort((a, b) => b.v - a.v);
        const cR = card('Рейтинг турниров', 'Турниры с одним названием вместе (номер розыгрыша, день и стадия не важны). Только где больше ' + num(minH) + ' раздач. Сверху — где вы зарабатываете больше всего.', true);
        const t = el('table', 'rs-table'); const hr = el('tr'); ['', 'Рум', 'Розыгрышей', 'Раздач', 'EV/100', 'Факт/100', mName + ', BB/100'].forEach((h, q) => { const th = el('th', q > 1 ? 'num' : null, h); th.scope = 'col'; hr.append(th); }); const th = el('thead'); th.append(hr); t.append(th);
        const tb = el('tbody'); const lim = Math.max(10, ...list.map(r => Math.abs(r.v)));
        list.forEach((r, q) => { const k = r.k, tr = el('tr', 'rs-norow'); const h = el('th', null, (q + 1) + '. ' + names[k].name); h.scope = 'row'; h.title = names[k].name; tr.append(h, el('td', null, names[k].room), el('td', 'num', num(tours[k].size)), el('td', 'num', num(r.n)), el('td', 'num ' + (ge[k].v >= 0 ? 'pos' : 'neg'), fmt(ge[k].v)), el('td', 'num ' + (gn[k].v >= 0 ? 'pos' : 'neg'), fmt(gn[k].v)));
          const td = el('td', 'rs-mini'); const s = sv('svg', { viewBox: '0 0 160 18', class: 'rs-mini-svg', 'aria-hidden': 'true' }); const xx = (v) => 80 + Math.max(-1, Math.min(1, v / lim)) * 74;
          s.append(sv('line', { x1: 80, x2: 80, y1: 1, y2: 17, class: 'rs-zero' })); if (Number.isFinite(r.lo)) s.append(sv('line', { x1: xx(r.lo), x2: xx(r.hi), y1: 9, y2: 9, class: 'rs-ci' }));
          s.append(sv('rect', { x: Math.min(80, xx(r.v)), y: 5, width: Math.max(2, Math.abs(xx(r.v) - 80)), height: 8, rx: 2, class: 'rs-bar ' + (r.v >= 0 ? 'pos' : 'neg'), 'fill-opacity': .9 }));
          td.append(s, el('span', 'rs-mini-v ' + (r.v >= 0 ? 'pos' : 'neg'), fmt(r.v) + (sure(r) ? '' : ' ~'))); tr.append(td); tb.append(tr); });
        t.append(tb); const w = el('div', 'rs-table-w rs-scroll'); w.append(t); cR.append(list.length ? w : lack());
        grid.append(cR);
      }
      if (await step()) return;
      // #22 столы × скорость, #23 бай-ин × рум
      {
        const TB = ['1–2', '3–4', '5–6', '7–8', '9+'], tb = (n) => n <= 2 ? 0 : n <= 4 ? 1 : n <= 6 ? 2 : n <= 8 ? 3 : 4;
        const spd = (i) => { const tr = D.tour[i], k = tr >= 0 ? D.tours[tr][0] : -1; return k >= 0 ? D.cls[k].speed : 0; };
        const g = groups(D, X, (i) => spd(i) * 5 + tb(D.conc[i]), 15, { ci: false });
        const c1 = card('Столы × скорость', 'Оптимальное число столов отдельно для обычных, турбо и гипер.');
        c1.append(grid2({ rows: SPEED, cols: TB.map(x => x + ' ст.'), get: (r, cc) => g[r * 5 + cc], text: true, aria: 'столы и скорость', minN: 500 })); grid.append(c1);
        const BIL = BI.slice(1).map(x => x[1]);
        const g2 = groups(D, X, (i) => { const b = biBand(c.bi ? c.bi[i] : -1); return b < 1 ? -1 : c.room[i] * 5 + b - 1; }, rooms.length * 5, { ci: false });
        const usedR = rooms.map((_, r) => g2.slice(r * 5, r * 5 + 5).some(x => x.n) ? r : -1).filter(r => r >= 0);
        const c2 = card('Бай-ин × рум', 'Где каждый уровень бай-инов играется лучше.');
        c2.append(grid2({ rows: usedR.map(r => rooms[r]), cols: BIL, get: (r, cc) => g2[usedR[r] * 5 + cc], text: true, aria: 'бай-ин и рум', minN: 500 })); grid.append(c2);
      }
      if (await step()) return;
      // #24 один рум или несколько одновременно
      {
        const ev2 = []; D.tours.forEach((x, k) => { const room = D.titles[x[0]] ? D.titles[x[0]].room : -1; ev2.push([x[1], 1, room], [x[2] + 1, -1, room]); }); ev2.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        const ord = X.idx.map((i, j) => j).sort((p, q) => D.t[X.idx[p]] - D.t[X.idx[q]]); const nr = new Int8Array(X.idx.length); const cnt = new Map(); let e = 0;
        for (const j of ord) { const t = D.t[X.idx[j]]; while (e < ev2.length && ev2[e][0] <= t) { const [, d, r] = ev2[e++]; cnt.set(r, (cnt.get(r) || 0) + d); } let k = 0; for (const v of cnt.values()) if (v > 0) k++; nr[j] = Math.max(1, Math.min(3, k)); }
        const g = groups(D, X, (i, j) => nr[j] - 1, 3);
        const cM = card('Один рум или несколько', 'Результат, когда открыт один клиент, два или три и больше одновременно.');
        cM.append(bars(g.map((r, q) => Object.assign(r, { label: ['1 рум', '2 рума', '3+ рума'][q] })), { sub: true, aria: 'один или несколько румов' })); grid.append(cM);
      }
      if (await step()) return;
      // #25 календарь
      {
        const days = new Map(); X.idx.forEach((i, j) => { const d = Math.floor(lt(i) / 1440); const z = days.get(d) || { n: 0, sum: 0 }; z.n++; z.sum += raw[j]; days.set(d, z); });
        for (const z of days.values()) z.v = z.sum / z.n * 100;
        const pos = [...days.values()].filter(z => z.sum > 0).length;
        const cK = card('Календарь', 'Каждый игровой день — клетка: зелёный — день в плюсе по ' + (F.metric === 'net' ? 'факту' : 'EV') + ', красный — в минусе. В плюсе ' + pos + ' из ' + days.size + ' ' + plural(days.size, 'дня', 'дней', 'дней') + '.', true);
        cK.append(calendar(days, {})); grid.append(cK);
      }
      if (await step()) return;
      // #26 все сессии точками + лучшие и худшие
      {
        const S = new Map(); X.idx.forEach((i, j) => { const s = D.ses[i]; const z = S.get(s) || { n: 0, sum: 0 }; z.n++; z.sum += raw[j]; S.set(s, z); });
        const pts = [...S].map(([s, z]) => { const q = D.sessions[s], h = (q[1] - q[0]) / 60, d = new Date((q[0] - tzOff(q[0])) * 60000); return { s, x: h, y: z.sum, n: z.n, date: d, tip: d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' }) + ' ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') + ' · ' + h.toFixed(1) + ' ч · ' + num(z.n) + ' раздач · ' + fmt(z.sum, 0) + ' BB' }; });
        const cP = card('Все сессии', 'Каждая точка — сессия: по горизонтали длина в часах, по вертикали результат в BB (' + (F.metric === 'net' ? 'факт' : 'EV') + '). Размер — число раздач.', true);
        const two = el('div', 'rs-two'); two.append(scatter(pts, { w: 640, xu: ' ч', aria: 'сессии' }));
        const lst = el('div', 'rs-best'); const srt = pts.slice().sort((a, b) => b.y - a.y);
        const block = (title, arr, cls) => { const b = el('div'); b.append(el('h4', null, title)); const ol = el('ol'); arr.forEach(p => { const li = el('li'); li.append(el('b', cls, fmt(p.y, 0) + ' BB'), document.createTextNode(' — ' + p.tip.split(' · ').slice(0, 3).join(' · '))); ol.append(li); }); b.append(ol); return b; };
        lst.append(block('Лучшие сессии', srt.slice(0, 3), 'pos'), block('Худшие сессии', srt.slice(-3).reverse(), 'neg'));
        two.append(lst); cP.append(pts.length < 3 || nH < MINN ? lack() : two); grid.append(cP);
      }
      if (await step()) return;
      // #27 перерывы
      {
        const brk = new Map(); for (const [s, a] of sesT) { const b = []; for (let k = 1; k < a.length; k++) if (a[k] - a[k - 1] >= 10) b.push([a[k - 1], a[k]]); brk.set(s, b); }
        const g = groups(D, X, (i) => { const n = (brk.get(D.ses[i]) || []).length; return n === 0 ? 0 : n === 1 ? 1 : 2; }, 3);
        const g2 = groups(D, X, (i) => { const b = brk.get(D.ses[i]) || []; if (!b.length) return -1; const t = D.t[i]; for (const [p0, p1] of b) { if (t >= p1 && t < p1 + 30) return 1; if (t <= p0 && t > p0 - 30) return 0; } return -1; }, 2);
        const cB = card('Перерывы', 'Пауза — 10–45 минут без раздач внутри сессии. Слева — сессии без пауз и с паузами; справа — последние 30 минут перед паузой против первых 30 минут после неё.');
        const two = el('div', 'rs-two');
        two.append(bars(g.map((r, q) => Object.assign(r, { label: ['без пауз', '1 пауза', '2+ паузы'][q], sub: r.ses ? r.ses + ' ' + plural(r.ses, 'сессия', 'сессии', 'сессий') : '' })), { w: 300, sub: true, aria: 'сессии с паузами' }), bars(g2.map((r, q) => Object.assign(r, { label: ['до паузы', 'после паузы'][q] })), { w: 300, sub: true, aria: 'до и после паузы' }));
        cB.append(two); grid.append(cB);
      }
      if (await step()) return;
      // #28 красные и зелёные зоны: все пары условий
      {
        const HB3 = ['00–03', '03–06', '06–09', '09–12', '12–15', '15–18', '18–21', '21–24'];
        const dims = [
          ['время', 8, (i) => Math.floor(D.HOUR[i] / 3), (k) => HB3[k]],
          ['столы', 3, (i) => { const n = D.conc[i]; return n <= 4 ? 0 : n <= 6 ? 1 : 2; }, (k) => ['1–4 стола', '5–6 столов', '7+ столов'][k]],
          ['сессия', 3, (i) => { const h = D.since[i] / 60; return h < 2 ? 0 : h < 5 ? 1 : 2; }, (k) => ['первые 2 ч', '2–5 ч сессии', 'после 5 ч'][k]],
          ['день', 7, (i) => D.DOW[i], (k) => DOW[k]],
          ['скорость', 3, (i) => { const tr = D.tour[i], q = tr >= 0 ? D.tours[tr][0] : -1; return q >= 0 ? D.cls[q].speed : 0; }, (k) => SPEED[k].toLowerCase()],
          ['рум', rooms.length, (i) => c.room[i], (k) => rooms[k]]
        ];
        const all = [], minZ = Math.max(1500, Math.round(X.idx.length * 0.02));
        for (let a = 0; a < dims.length; a++) for (let b = a + 1; b < dims.length; b++) {
          const [, Ka, fa, la] = dims[a], [, Kb, fb2, lb] = dims[b];
          const g = groups(D, X, (i) => fa(i) * Kb + fb2(i), Ka * Kb, { B: 80 });
          g.forEach((r, k) => { if (r.n >= minZ && Number.isFinite(r.v)) all.push({ r, label: la(Math.floor(k / Kb)) + ' · ' + lb(k % Kb) }); });
        }
        all.sort((p, q) => p.r.v - q.r.v);
        const cZ = card('Красные и зелёные зоны', 'Программа перебрала все пары условий (время, столы, час сессии, день, скорость, рум) с ' + num(minZ) + '+ раздачами и показывает самые слабые и самые сильные сочетания.', true);
        const two = el('div', 'rs-two');
        const lst = (title, arr, cls) => { const b = el('div', 'rs-zone ' + cls); b.append(el('h4', null, title)); arr.forEach(x => { const d = el('div', 'rs-zone-i'); d.append(el('span', null, x.label), el('b', x.r.v >= 0 ? 'pos' : 'neg', fmt(x.r.v)), el('small', null, num(x.r.n) + ' р.' + (sure(x.r) ? ' · надёжно' : ''))); d.title = '95%: от ' + fmt(x.r.lo) + ' до ' + fmt(x.r.hi); b.append(d); }); return b; };
        two.append(lst('Красные зоны — где теряете', all.slice(0, 6), 'bad'), lst('Зелёные зоны — где зарабатываете', all.slice(-6).reverse(), 'good'));
        cZ.append(all.length ? two : lack()); grid.append(cZ);
      }
      if (await step()) return;
      // #29 позиция × стек
      {
        const g = groups(D, X, (i) => c.pos[i] * 5 + stkB(c.bb[i] / 10), 35, { ci: false, vals: raw });
        const cQ = card('Позиция × стек', 'Без поправки: сколько BB/100 приносит позиция при разной глубине вашего стека. Блайнды всегда в минусе — сравнивайте строку с самой собой.');
        const pr = POS.map((_, r) => g.slice(r * 5, r * 5 + 5).some(x => x.n) ? r : -1).filter(r => r >= 0);
        cQ.append(grid2({ rows: pr.map(r => POS[r]), cols: STK, get: (r, cc) => g[pr[r] * 5 + cc], text: true, aria: 'позиция и стек', minN: 300, pl: 50 })); grid.append(cQ);
      }
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
      const list = el('div', 'rs-ins');
      ins.forEach(x => { const d = el('div', 'rs-in ' + x.cls); const h = el('b', null, x.title); if (x.badge) h.append(el('em', x.badge === 'надёжно' ? 'sure' : null, x.badge)); d.append(h, el('p', null, x.text)); list.append(d); });
      cI.lastChild.remove(); cI.append(nH < MINN ? lack() : list);
    }
    grid.querySelectorAll(':scope > .rs-card').forEach(cd => { if (cd.querySelector('.rs-lack') && !cd.querySelector('svg.rs-svg, table')) cd.querySelectorAll('.rs-leg, .rs-verdict').forEach(x => x.remove()); });
    // номера блоков — чтобы было удобно обсуждать, что убрать или поменять
    { let k = 0; const tag = (node) => { const t = el('span', 'rs-num', '#' + (++k)); node.append(t); };
      tag(fb); tag(kp); grid.querySelectorAll(':scope > .rs-card').forEach(c => tag(c.querySelector('.rs-card-h') || c)); }
    if (gen !== GEN) return;
    R.append(note('Расчёт: ' + mName + ' в BB на 100 раздач. Поправка вычитает средний результат вашей позиции и глубины стека, чтобы ранние стадии и короткие стеки не искажали сравнение времени и столов. Время румов приведено к одному часовому поясу. Деньги, ICM и баунти не учитываются — только фишки.'));
    CACHE.set(ckey, [...R.childNodes]); if (CACHE.size > 10) CACHE.delete(CACHE.keys().next().value);
  }
  // данные «Результатов» грузятся заранее, в свободное время после загрузки базы — вкладка открывается без ожидания
  (function pre(k) { if (k > 240) return; if (typeof HERO_DB !== 'undefined' && HERO_DB) { const go = () => load().catch(() => {}); setTimeout(() => (window.requestIdleCallback ? window.requestIdleCallback(go, { timeout: 4000 }) : go()), 1500); return; } setTimeout(() => pre(k + 1), 500); })(0);
  window.MDAResults = { draw, reset: () => { DATA = null; DKEY = null; CACHE.clear(); } };
})();
