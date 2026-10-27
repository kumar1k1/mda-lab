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
  const DEF = { tilt: 40, cmp: 'd30', period: 'all', room: -1, bounty: 'all', speed: 'all', kind: 'all', bi: 'all', tbl: 'all', metric: 'ev', adj: 2, pFrom: '', pTo: '', biFrom: '', biTo: '' };
  const F = Object.assign({}, DEF, LS.get('mda.res.f', {}));
  if (F.period === 'm1') F.period = 'm3'; // «30 дней» убран из периода — слишком маленькая выборка
  F.metric = 'ev'; F.adj = 2; // всегда EV и полная поправка (переключатели «Считать» и «Поправка» убраны)
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
  // ---------- поправка на ситуацию ----------
  // Ожидаемый результат раздачи в такой же ситуации — по ВСЕЙ вашей истории (не по выбранному кусочку, иначе на узких
  // фильтрах поправка съедает сигнал). Ситуация: позиция × стек (8 диапазонов) × игроков за столом × размер стола ×
  // баунти × анте. Редкие ситуации сглаживаются к более общим: ситуация → позиция×стек → позиция → всё (по 150 раздач).
  // Вклад одной раздачи ограничен ±100 BB — один огромный банк не перевешивает сотни обычных.
  const CAP = 100, SHR = 150;
  const stk8 = (x) => x < 6 ? 0 : x < 10 ? 1 : x < 15 ? 2 : x < 20 ? 3 : x < 30 ? 4 : x < 45 ? 5 : x < 70 ? 6 : 7;
  const npB = (n) => n <= 0 ? 3 : n <= 3 ? 0 : n <= 5 ? 1 : n <= 7 ? 2 : 3;
  const antB = (a) => a <= 0 ? 0 : a <= 100 ? 1 : 2;
  const btyOf = (D, i) => { const tr = D.tour[i], k = tr >= 0 ? D.tours[tr][0] : -1; return k >= 0 && D.cls[k].myst ? 2 : D.db.cols.type && D.db.cols.type[i] === 1 ? 1 : 0; };
  const evOf = (c, i) => c.nev && Number.isFinite(c.nev[i]) ? c.nev[i] / 10 : c.net[i] / 10;
  function baseline(D, metric, alias) {
    const key = metric + '|' + alias; D._bl = D._bl || {}; if (D._bl[key]) return D._bl[key];
    const c = D.db.cols, N = D.n, adj = new Float64Array(N).fill(NaN);
    const k2 = new Int16Array(N).fill(-1), k3 = new Int32Array(N).fill(-1), y = new Float64Array(N);
    const n1 = new Float64Array(8), s1 = new Float64Array(8), n2 = new Float64Array(64), s2 = new Float64Array(64), n3 = new Float64Array(64 * 4 * 4 * 3 * 3), s3 = new Float64Array(n3.length);
    let n0 = 0, s0 = 0;
    for (let i = 0; i < N; i++) {
      if (D.t[i] < 0 || (alias >= 0 && c.aid[i] !== alias)) continue;
      const v = Math.max(-CAP, Math.min(CAP, metric === 'net' ? c.net[i] / 10 : evOf(c, i))); y[i] = v;
      const p = Math.max(0, Math.min(7, c.pos[i])), a = p * 8 + stk8(c.bb[i] / 10);
      const b = (((a * 4 + npB(c.np ? c.np[i] : 0)) * 4 + tblOf(c.tmx ? c.tmx[i] : 0)) * 3 + btyOf(D, i)) * 3 + antB(c.ant ? c.ant[i] : -1);
      k2[i] = a; k3[i] = b; n0++; s0 += v; n1[p]++; s1[p] += v; n2[a]++; s2[a] += v; n3[b]++; s3[b] += v;
    }
    const m0 = n0 ? s0 / n0 : 0, m1 = n1.map((n, p) => (s1[p] + SHR * m0) / (n + SHR)), m2 = n2.map((n, a) => (s2[a] + SHR * m1[a >> 3]) / (n + SHR));
    for (let i = 0; i < N; i++) { if (k3[i] < 0) continue; const b = k3[i], a = k2[i], m3 = (s3[b] + SHR * m2[a]) / (n3[b] + SHR); adj[i] = y[i] - m3; }
    return (D._bl[key] = adj);
  }
  // квантиль нормального распределения (для строгого порога «надёжно» при многих сравнениях)
  function zq(p) {
    const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924], b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857], cc = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878], d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
    if (p < 0.02425) { const q = Math.sqrt(-2 * Math.log(p)); return (((((cc[0] * q + cc[1]) * q + cc[2]) * q + cc[3]) * q + cc[4]) * q + cc[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - 0.02425) return -zq(1 - p);
    const q = p - 0.5, r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
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
    // значение раздачи: EV или факт (BB); с поправкой — минус ожидаемое в такой же ситуации (по всей истории)
    const ev = new Float64Array(out.length), net = new Float64Array(out.length), v = new Float64Array(out.length);
    out.forEach((i, j) => { ev[j] = evOf(c, i); net[j] = c.net[i] / 10; });
    if (+F.adj) { const bl = baseline(D, F.metric, alias); out.forEach((i, j) => { v[j] = bl[i]; }); }
    else v.set(F.metric === 'net' ? net : ev);
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
      rows.forEach((r, k) => { if (r.n && ns[k] >= 3) { const se = Math.sqrt(vr[k] * ns[k] / (ns[k] - 1)) / r.n * 100; r.se = se; r.sd = se; r.lo = r.v - 1.96 * se; r.hi = r.v + 1.96 * se; } });
      // маленькие группы подтягиваются к общему среднему настолько, насколько их разброс объясняется случайностью
      // (эмпирический Байес): яркие столбцы на сотне раздач больше не выглядят как открытие
      // у групп из 1–2 сессий своей ошибки не посчитать — берётся общий разброс на раздачу с запасом ×2
      { let q = 0, q2 = 0, qn = 0; X.idx.forEach((i, j) => { const v = vals[j]; q += v; q2 += v * v; qn++; }); const sdh = qn > 1 ? Math.sqrt(Math.max(0, q2 / qn - (q / qn) ** 2)) * 100 : NaN;
        rows.forEach(r => { if (r.n && !Number.isFinite(r.se) && Number.isFinite(sdh)) { r.se = 2 * sdh / Math.sqrt(r.n); r.sd = r.se; r.lo = r.v - 1.96 * r.se; r.hi = r.v + 1.96 * r.se; } }); }
      const G = rows.filter(r => r.n && Number.isFinite(r.se) && r.se > 0);
      if (opt.shrink !== false && G.length >= 3) {
        const W = G.reduce((a, r) => a + r.n, 0), mu = G.reduce((a, r) => a + r.v * r.n, 0) / W;
        const mse = G.reduce((a, r) => a + r.se * r.se, 0) / G.length, vv = G.reduce((a, r) => a + (r.v - mu) ** 2, 0) / (G.length - 1), tau2 = Math.max(0, vv - mse);
        rows.flat = tau2 === 0; rows.mu = mu;
        G.forEach(r => { const b = tau2 / (tau2 + r.se * r.se); r.raw = r.v; r.v = mu + (r.v - mu) * b; r.sum = r.v / 100 * r.n; r.sd = r.se * Math.sqrt(b); r.lo = r.v - 1.96 * r.sd; r.hi = r.v + 1.96 * r.sd; });
      }
      // «надёжно» — с учётом числа сравнений: чем больше групп, тем строже порог
      const zc = zq(1 - 0.025 / Math.max(1, opt.m || G.length)); rows.forEach(r => { r.zc = zc; });
    }
    return rows;
  }
  const sure = (r) => Number.isFinite(r.sd) && r.sd > 0 && Math.abs(r.v) > (r.zc || 1.96) * r.sd;

  // ---------- графики ----------
  function niceTicks(lo, hi, n) {
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0];
    if (hi - lo < 1e-6) { lo = Math.min(lo, -1); hi = Math.max(hi, 1); } // почти ноль (одна сессия после поправки) — обычная шкала
    const span = hi - lo, step0 = span / (n || 4), mag = Math.pow(10, Math.floor(Math.log10(step0))), f = step0 / mag;
    const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag, out = [];
    const dec = Math.max(0, -Math.floor(Math.log10(step)));
    for (let v = Math.ceil(lo / step) * step, k = 0; v <= hi + step * 1e-6 && k < 50; v += step, k++) out.push(Math.abs(v) < step * 1e-6 ? 0 : +v.toFixed(dec));
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
    // минимальный размах шкалы — ±5 BB/100: иначе разница в десятые доли выглядит как огромные столбцы
    if (hi - lo < 10) { const mid = (hi + lo) / 2; lo = Math.min(lo, mid - 5, 0); hi = Math.max(hi, mid + 5, 0); if (lo > -5 && hi < 5) { lo = -5; hi = 5; } }
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
        g.append(sv('title', null, (r.title || r.label) + ': ' + fmt(r.v) + ' ' + (o.unit || 'BB/100') + ' · ' + num(r.n) + ' ' + plural(r.n, 'раздача', 'раздачи', 'раздач') + (Number.isFinite(r.lo) ? ' · 95%: от ' + fmt(r.lo) + ' до ' + fmt(r.hi) : '') + (r.raw != null && Math.abs(r.raw - r.v) >= 0.1 ? ' · без сглаживания: ' + fmt(r.raw) : '') + (r.tip ? ' · ' + r.tip : '')));
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
    s = s.replace(/\s*·\s*\(\d{5,}\)\s*$/, '').replace(/\s*·\s*#\d+\s*$/, '').replace(/^#\d+\s*-\s*/, '').replace(/\[(Day|Stage|День)[^\]]*\]/gi, '').replace(/\b(Day|Stage)\s*\d+\w*/gi, '').replace(/\s{2,}/g, ' ').trim();
    return s || 'Без названия';
  }
  // ---------- страница ----------
  let ROOT = null, WAIT = 0, WT = null, GEN = 0;
  // ANCHOR — блок, в котором нажали фильтр: после пересчёта страница остаётся на нём, а не прыгает в начало
  let ANCHOR = null, LAST = null;
  const stay = (cd) => { if (ROOT && cd && cd.isConnected) ANCHOR = { id: cd.dataset.anchor, off: cd.getBoundingClientRect().top - ROOT.getBoundingClientRect().top }; };
  const toAnchor = (R) => { if (!ANCHOR) return false; const a = R.querySelector('[data-anchor="' + ANCHOR.id + '"]'); if (!a) return false; R.scrollTop += (a.getBoundingClientRect().top - R.getBoundingClientRect().top) - ANCHOR.off; return true; };
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
    // жёлтая рамка — только пока список открыт: после выбора фокус снимается
    s.onchange = () => { s.blur(); F[key] = typeof DEF[key] === 'number' ? +s.value : s.value; saveF(); draw(); };
    s.onkeydown = (e) => { if (e.key === 'Escape') s.blur(); };
    w.append(s); return w;
  }
  // «Период» со своим интервалом дат
  const isoDay = (m) => new Date(Math.floor(m / 1440) * 864e5).toISOString().slice(0, 10);
  function periodBox(D) {
    if (D.dMin == null) { let a = Infinity, b = -Infinity; for (let i = 0; i < D.n; i++) { const v = D.LT[i]; if (v < 0) continue; if (v < a) a = v; if (v > b) b = v; } D.dMin = isoDay(a); D.dMax = isoDay(b); D.dMaxM = b; }
    const w = seg('Период', 'period', [['all', 'Всё'], ['y1', 'Год'], ['m6', '6 мес'], ['m3', '3 мес'], ['custom', 'Свой']], () => {
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
  // «Поправка»: короткая строка о выбранном режиме + «?» с полным объяснением всех трёх
  const ADJ = {
    2: { name: 'Полная', short: 'Влияние одного фактора при прочих равных', tip: 'Ситуация раздачи учтена, и остальные факторы тоже: в графике времени не влияют столы, в графике столов — время и т. д.',
      full: 'Всё, что делает «На ситуацию», плюс программа разделяет факторы между собой. Например, 1–2 стола у вас часто бывают поздно ночью в глубоких стадиях. Без разделения график столов показал бы смесь «мало столов» и «поздняя стадия». «Полная» оценивает столы, час сессии, время суток, день, длину сессии, скорость и рум одновременно и показывает чистое влияние каждого.', when: 'Лучше всего для решений «сколько столов», «когда устаю», «в какое время играть».' },
    1: { name: 'На ситуацию', short: 'Сравнение с вами же в тех же спотах', tip: 'Из каждой раздачи вычитается ваш обычный результат в такой же ситуации: позиция, стек, игроков за столом, размер стола, баунти, анте.',
      full: 'На баттоне почти все в плюсе, на большом блайнде — в минусе; с глубоким стеком и в пуш-фолде результаты тоже разные. Программа знает ваш обычный результат в каждой ситуации по всей истории и вычитает его. Ноль — ваш обычный уровень, плюс — играли лучше себя, минус — хуже. Вклад одной раздачи ограничен ±100 BB.', when: 'Подходит, когда интересно «лучше или хуже обычного», но факторы смешаны между собой.' },
    0: { name: 'Без', short: 'Сколько вы реально заработали', tip: 'Обычный EV в BB на 100 раздач, без поправок.',
      full: 'Показывает реальный заработок в BB/100, как в Hand2Note. Но в сравнениях он смешивает вашу игру со стадией турнира: например, в начале сессии больше ранних стадий с глубокими стеками, в конце — коротких стеков. Поэтому для выводов о фокусе он менее точен.', when: 'Для вопроса «сколько я заработал там-то», а не «где я играю лучше».' }
  };
  function adjBox() {
    const w = seg('Поправка', 'adj', [[2, 'Полная'], [1, 'На ситуацию'], [0, 'Без']]);
    w.querySelectorAll('button').forEach((b, k) => { b.title = ADJ[[2, 1, 0][k]].tip; });
    const lab = w.querySelector('.rs-f-l'), q = el('button', 'rs-q', '?'); q.type = 'button'; q.setAttribute('aria-label', 'Что значат режимы поправки'); q.setAttribute('aria-expanded', 'false');
    lab.append(q);
    const cur = ADJ[+F.adj] || ADJ[2]; w.append(el('small', 'rs-adj-s', cur.short));
    const pop = el('div', 'rs-pop'); pop.hidden = true; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Режимы поправки');
    pop.append(el('h4', null, 'Что значит «Поправка»'), el('p', 'rs-pop-i', 'Поправка убирает из сравнения то, что не зависит от вашей игры, — чтобы графики времени, столов и дней показывали именно качество игры.'));
    [2, 1, 0].forEach(k => { const x = ADJ[k], b = el('div', 'rs-pop-m' + (+F.adj === k ? ' on' : '')); const h = el('b', null, x.name); h.append(el('em', null, x.short)); b.append(h, el('p', null, x.full), el('p', 'rs-pop-w', x.when)); pop.append(b); });
    pop.append(el('p', 'rs-pop-i', 'Ключевые числа (#2), позиции (#12), стек (#13) и позиция × стек всегда без поправки — это реальный заработок.'));
    const close = () => { pop.hidden = true; q.setAttribute('aria-expanded', 'false'); document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', esc, true); };
    const outside = (e) => { if (!pop.contains(e.target) && e.target !== q) close(); };
    const esc = (e) => { if (e.key === 'Escape') { close(); q.focus(); } };
    q.onclick = (e) => { e.preventDefault(); e.stopPropagation(); if (!pop.hidden) { close(); return; } pop.hidden = false; q.setAttribute('aria-expanded', 'true'); document.addEventListener('mousedown', outside, true); document.addEventListener('keydown', esc, true); };
    w.append(pop); w.classList.add('rs-adj'); return w;
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
  // оценка группы словами: относительно вашего обычного уровня (ref), с учётом надёжности
  function verdictOf(r, ref) {
    if (!r.n) return ['none', '—'];
    if (r.n < MINN) return ['small', 'мало данных'];
    // оценить нельзя: меньше 5 сессий или погрешность больше ±20 BB/100 (несколько удачных или неудачных сессий решают всё)
    if (r.ses != null && r.ses < 5) return ['small', 'мало данных'];
    if (Number.isFinite(r.se) && 1.96 * r.se > 20) return ['small', 'не ясно'];
    // «надёжно» — по сглаженному значению и строгому порогу; сила отличия — по числу как есть (его и видно на экране)
    // сила отличия — по числу на экране: <3 как в среднем, 3–8 немного, 8–15 заметно, 15+ сильно;
    // надёжно (насыщенная плашка) или может быть случайностью (бледная) — по строгой проверке
    const R1 = (x) => Math.round(x * 10) / 10, d = r.v - (ref || 0), dr = R1(R1(r.raw != null ? r.raw : r.v) - R1(ref || 0)), strong = Number.isFinite(r.sd) && r.sd > 0 && Math.abs(d) > (r.zc || 1.96) * r.sd;
    let m = Math.abs(dr) < 3 ? 0 : Math.abs(dr) < 8 ? 1 : Math.abs(dr) < 15 ? 2 : 3; if (strong && !m) m = 1;
    if (!m) return ['eq', 'как в среднем'];
    const w = ['', 'немного ', 'заметно ', 'сильно '][m] + (dr > 0 ? 'лучше' : 'хуже');
    return strong ? [dr > 0 ? 'up' : 'down', w] : [dr > 0 ? 'up-soft' : 'down-soft', w];
  }
  // «1–2 — немного лучше, 3–4 — заметно хуже» — отличия, которые могут быть случайностью
  // реальный EV (без поправки) против нуля: в плюсе / в минусе, около нуля, мало данных
  function vRaw(r) {
        if (!r.n || r.n < MINN || (r.ses != null && r.ses < 5)) return ['small', 'мало данных'];
        if (Number.isFinite(r.se) && 1.96 * r.se > 20) return ['small', 'не ясно'];
        // подпись — по показанному числу; надёжность — цветом плашки (насыщенная — надёжно, бледная — может быть случайностью)
        const a = Math.abs(Math.round(r.v * 10) / 10), side = r.v > 0 ? 'в плюсе' : 'в минусе', solid = Number.isFinite(r.se) && a > 1.96 * r.se;
        if (a >= 2) return [(r.v > 0 ? 'up' : 'down') + (solid ? '' : '-soft'), (a >= 25 ? 'сильно ' : a >= 10 ? 'заметно ' : '') + side];
        return ['eq', 'около нуля'];
      }
  function softList(arr, ref, name) { return arr.filter(r => /-soft$/.test(verdictOf(r, ref)[0])).map(r => name(r) + ' — ' + verdictOf(r, ref)[1]).join(', '); }
  function meter(d, lim, cls) {
    const w = el('span', 'rs-meter'); const bar = el('i', cls); const f = Math.max(-1, Math.min(1, d / lim));
    bar.style.left = (f < 0 ? 50 + f * 50 : 50) + '%'; bar.style.width = Math.max(1.5, Math.abs(f) * 50) + '%'; w.append(bar); return w;
  }
  function legendWords() {
    const l = el('div', 'rs-leg'); [['up', 'лучше среднего — надёжно'], ['up-soft', 'лучше — может быть случайностью'], ['eq', 'как в среднем'], ['down-soft', 'хуже — может быть случайностью'], ['down', 'хуже среднего — надёжно'], ['small', 'мало данных / не ясно']].forEach(([c, t]) => { const i = el('span'); i.append(el('i', 'lw ' + c), document.createTextNode(t)); l.append(i); }); return l;
  }
  function card(title, hint, wide, help) {
    const c = el('section', 'rs-card' + (wide ? ' wide' : '')); c.dataset.anchor = title; const h = el('div', 'rs-card-h'); const t = el('h3', null, title); if (help) t.append(tipEl('?', help, 'rs-qt')); h.append(t); if (hint) h.append(el('p', null, hint)); c.append(h); return c;
  }
  // пояснение при наведении (и при фокусе с клавиатуры): span с подсказкой под ним
  function tipEl(text, help, cls, extra) {
    const w = el('span', 'rs-tip' + (cls ? ' ' + cls : ''), text); w.tabIndex = 0; w.setAttribute('role', 'button'); w.setAttribute('aria-label', (text === '?' ? 'Пояснение: ' : text + '. ') + help);
    const b = el('span', 'rs-tip-b'); help.split('\n\n').forEach(t => b.append(el('span', 'rs-tip-p', t))); if (extra) b.append(extra); b.setAttribute('role', 'tooltip'); w.append(b);
    // у нижнего края окна — открывается вверх, у правого — влево
    const place = () => { w.classList.remove('up', 'left'); requestAnimationFrame(() => { const r = b.getBoundingClientRect(); if (!r.height) return; if (r.bottom > window.innerHeight - 8 && w.getBoundingClientRect().top - r.height - 10 > 60) w.classList.add('up'); if (r.right > window.innerWidth - 8) w.classList.add('left'); }); };
    w.addEventListener('mouseenter', place); w.addEventListener('focus', place);
    const off = (e) => { if (!w.contains(e.target)) { w.classList.remove('open'); document.removeEventListener('mousedown', off, true); } };
    w.onclick = (e) => { e.stopPropagation(); const on = !w.classList.contains('open'); document.querySelectorAll('.rs-tip.open').forEach(x => x.classList.remove('open')); if (on) { w.classList.add('open'); place(); document.addEventListener('mousedown', off, true); } };
    w.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); w.click(); } if (e.key === 'Escape') w.classList.remove('open'); };
    return w;
  }
  function legend(items) { const l = el('div', 'rs-leg'); items.forEach(([cls, t]) => { const i = el('span'); i.append(el('i', cls), document.createTextNode(t)); l.append(i); }); return l; }
  function note(t) { return el('p', 'rs-note', t); }

  // панель фильтров (#1) — всегда строится заново по текущим настройкам (в кэше страницы её не хранить:
  // списки и поля там помнят то, что вы выбирали в прошлый раз)
  const anyF = () => Object.keys(DEF).some(k => !['cmp', 'tilt', 'pFrom', 'pTo', 'biFrom', 'biTo'].includes(k) && String(F[k]) !== String(DEF[k]));
  function filtersBar(D) {
    const rooms = D.db.rooms || [];
    const fb = el('div', 'rs-filters');
    fb.append(
      periodBox(D),
      sel('Рум', 'room', [[-1, 'Все румы']].concat(rooms.map((r, k) => [k, r]))),
      seg('Баунти', 'bounty', [['all', 'Все'], ['0', 'Без'], ['1', 'PKO'], ['2', 'Mystery']]),
      seg('Скорость', 'speed', [['all', 'Все'], ['0', 'Обычная'], ['1', 'Турбо'], ['2', 'Гипер']]),
      biBox(),
      seg('Стол', 'tbl', [['all', 'Все'], ['1', '6-max'], ['2', '7–8'], ['3', '9-max']]),
      seg('Тип', 'kind', [['all', 'Все'], ['0', 'Обычные'], ['1', 'Сателлиты']])
    );
    const reset = el('button', 'rs-reset', 'Сбросить'); reset.type = 'button'; reset.onclick = () => { Object.assign(F, DEF); saveF(); draw(); };
    if (anyF()) fb.append(reset);
    fb.append(el('span', 'rs-num', '#1'));
    return fb;
  }
  // ошибка в одном расчёте не должна оставлять страницу недорисованной
  async function draw(root) {
    const g0 = GEN + 1;
    try { await draw0(root); }
    catch (e) { console.error('results', e); const T = STAGE && STAGE.gen === GEN ? STAGE.box : ROOT; if (T) { T.querySelectorAll('.rs-card .rs-note').forEach(n => { if (n.textContent === 'Считаю…') n.textContent = 'Не удалось досчитать под эти фильтры.'; }); T.append(note('Ошибка расчёта: ' + (e && e.message || e) + '. Измените фильтры или нажмите «Сбросить».')); } }
    finally { if (GEN === g0 && ROOT) { ROOT.style.paddingBottom = ''; flush(); } }
  }
  // пересчёт под новые фильтры: новая страница собирается в стороне, старая пока видна (чуть приглушена),
  // затем подменяется целиком за один кадр и остаётся на том же блоке — без мигания и прыжков
  let STAGE = null;
  function flush() {
    if (!STAGE || STAGE.gen !== GEN) return; const { host, box } = STAGE; STAGE = null;
    const keep = host.scrollTop; host.replaceChildren(...box.childNodes); host.scrollTop = keep; toAnchor(host); ANCHOR = null;
    requestAnimationFrame(() => host.classList.remove('rs-busy'));
  }
  async function draw0(root) {
    if (root) { ROOT = root; WAIT = 0; if (!root.dataset.rsHook) { root.dataset.rsHook = '1'; const mark = (e) => { const cd = e.target.closest && e.target.closest('.rs-card'); LAST = cd ? [cd, Date.now()] : null; }; root.addEventListener('pointerdown', mark, true); root.addEventListener('keydown', mark, true); root.addEventListener('change', mark, true); } } if (!ROOT) return;
    // пересчёт из-за нажатия внутри блока (переключатель, строка таблицы) — страница остаётся на этом блоке
    if (!ANCHOR && LAST && Date.now() - LAST[1] < 1500 && LAST[0].isConnected && ROOT.contains(LAST[0])) stay(LAST[0]);
    LAST = null;
    const HOST = ROOT, gen = ++GEN;
    const staged = !!(DATA && HOST.querySelector(':scope > .rs-grid'));
    const R = staged ? document.createElement('div') : HOST;
    const ckey = JSON.stringify(F) + '|' + DKEY + '|' + (typeof state !== 'undefined' ? state.alias : 0) + '|' + (typeof HERO_DB !== 'undefined' && HERO_DB ? HERO_DB.count : 0);
    if (DATA && DATA.db === (typeof HERO_DB !== 'undefined' ? HERO_DB : null) && CACHE.has(ckey)) { const R = HOST, keep = R.scrollTop, nodes = CACHE.get(ckey).map(n => n.classList && n.classList.contains('rs-filters') ? filtersBar(DATA) : n); R.replaceChildren(...nodes); R.scrollTop = keep; toAnchor(R); ANCHOR = null; R.classList.remove('rs-busy'); STAGE = null; return; }
    const keepTop = HOST.scrollTop;
    if (staged) { STAGE = { host: HOST, box: R, gen }; HOST.classList.add('rs-busy'); const ofb = HOST.querySelector(':scope > .rs-filters'); if (ofb) ofb.replaceWith(filtersBar(DATA)); }
    else { STAGE = null; R.style.paddingBottom = R.scrollHeight + 'px'; R.replaceChildren(); R.scrollTop = keepTop; }
    const unpad = () => { HOST.style.paddingBottom = ''; };
    const head = el('div', 'rs-head'); head.append(el('h2', null, 'Результаты'), el('p', null, 'Где и когда вы играете лучше всего: число столов, ход сессии, время, дни и форматы турниров. Наведите на столбец — подробности; усы — 95% интервал.'));
    R.append(head);
    const D = await load();
    if (!D) {
      // база ещё грузится (на медленном интернете — дольше минуты): ждём, сколько нужно, пока страница открыта.
      // База есть, а данные результатов не пришли — несколько попыток, потом кнопка «Повторить».
      const hasDb = typeof HERO_DB !== 'undefined' && !!HERO_DB, inApp = !!(window.mda && window.mda.dbMeta);
      const e = el('div', 'rs-card rs-wait');
      if (!hasDb && WAIT > 20 && inApp && window.mda.dbInfo) { let st = null; try { st = await window.mda.dbInfo(); } catch (x) { /* нет */ } if (st && !st.stored) { e.append(el('h3', null, 'Нет базы'), el('p', 'rs-note', 'Загрузите базу на вкладке «Моя база» — здесь появится статистика.')); R.append(e); return; } }
      if (hasDb && WAIT > 12) {
        e.append(el('h3', null, 'Не удалось загрузить данные'), el('p', 'rs-note', 'Проверьте интернет и попробуйте ещё раз.'));
        const again = el('button', 'btn-load', 'Повторить'); again.type = 'button'; again.onclick = () => { WAIT = 0; DATA = null; DKEY = null; draw(); }; e.append(again); R.append(e); return;
      }
      e.append(el('h3', null, hasDb ? 'Загружаю данные результатов…' : 'Загружаю базу…'), el('p', 'rs-note', hasDb ? 'Ещё несколько секунд.' : 'Статистика появится сама, как только база загрузится. При медленном интернете это может занять минуту-другую.'));
      const bar = el('div', 'rs-spin'); e.append(bar); R.append(e);
      WAIT++; clearTimeout(WT); WT = setTimeout(() => { if (ROOT === HOST && HOST.isConnected) draw(); }, hasDb ? 1500 : 700);
      return;
    }
    WAIT = 0;
    if (HOST !== ROOT) return;
    const c = D.db.cols, rooms = D.db.rooms || [];
    // фильтры
    const fb = filtersBar(D);
    R.append(fb);
    // базы, загруженные версиями до 0.6, хранят время и турнир не у всех раздач — такие раздачи «Результаты» не видят
    { const al = (typeof state !== 'undefined' && D.db.aliases && D.db.aliases.length > 1 && c.aid) ? state.alias : -1; let tot = 0, ok = 0; for (let i = 0; i < D.n; i++) { if (al >= 0 && c.aid[i] !== al) continue; tot++; if (D.t[i] >= 0) ok++; }
      if (tot && ok / tot < 0.95) { const w = el('div', 'rs-cov'); w.append(el('b', null, 'Учтено ' + num(ok) + ' из ' + num(tot) + ' раздач — остальные без времени и турнира'), el('span', null, 'Эта база (или её часть) загружена старой версией программы: тогда время, турнир и запись реплеера сохранялись только у раздач, где вы вступали в игру (открытие, колл, изолейт). Поэтому здесь видна лишь часть раздач, а EV завышен — это раздачи, в которых вы играли активно. Как исправить: «Моя база» → загрузите те же истории раздач ещё раз. Дубликатов не будет — программа только допишет недостающее этим раздачам, и «Результаты» посчитаются по всем.')); R.append(w); } }
    const X = select(D);
    if (!X.idx.length) { R.append(note('Под эти фильтры раздач нет. Ослабьте фильтры или нажмите «Сбросить».')); return; }
    const mName = (F.metric === 'net' ? 'Факт' : 'EV') + (+F.adj === 2 ? ', чистый эффект' : +F.adj === 1 ? ' с поправкой' : '');
    // «Полная» поправка: совместная модель всех факторов (обратная подгонка аддитивной модели). Для блока фактора берётся
    // «частичный остаток»: результат минус вклад всех ОСТАЛЬНЫХ факторов — то есть влияние только этого фактора при прочих равных.
    const PR = {};
    let T_HEAD = null, S_HEAD = null, L_HEAD = null, D_HEAD = null, H_HEAD = null, CUM = null; // выводы #4 и #5 — те же слова попадают в «Главное» (#3)
    if (+F.adj === 2) {
      const cbF = (n) => n <= 2 ? 0 : n <= 4 ? 1 : n <= 6 ? 2 : n <= 8 ? 3 : n <= 10 ? 4 : n <= 13 ? 5 : 6;
      const slF = (s) => { const z = D.sessions[s], L = z[1] - z[0]; return L < 120 ? 0 : L < 240 ? 1 : L < 360 ? 2 : L < 480 ? 3 : L < 600 ? 4 : 5; };
      const spF = (i) => { const tr = D.tour[i], k = tr >= 0 ? D.tours[tr][0] : -1; return k >= 0 ? D.cls[k].speed : 0; };
      const FAC = { tbl: [7, (i) => cbF(D.conc[i])], ses: [10, (i) => Math.min(9, Math.floor(D.since[i] / 60))], hour: [24, (i) => D.HOUR[i]], dow: [7, (i) => D.DOW[i]], slen: [6, (i) => slF(D.ses[i])], speed: [3, spF], room: [Math.max(1, rooms.length), (i) => c.room[i]] };
      const n = X.idx.length, names = Object.keys(FAC), lev = {}, eff = {}, y = X.v, fit = new Float64Array(n);
      let mu = 0; for (let j = 0; j < n; j++) mu += y[j]; mu /= n;
      for (const nm of names) { const L = new Int16Array(n), f = FAC[nm][1]; X.idx.forEach((i, j) => { L[j] = f(i); }); lev[nm] = L; eff[nm] = new Float64Array(FAC[nm][0]); }
      for (let it = 0; it < 12; it++) {
        let moved = 0;
        for (const nm of names) {
          const K = FAC[nm][0], L = lev[nm], e = eff[nm], sm = new Float64Array(K), ct = new Float64Array(K);
          for (let j = 0; j < n; j++) { const l = L[j]; if (l < 0 || l >= K) continue; sm[l] += y[j] - mu - (fit[j] - e[l]); ct[l]++; }
          let ws = 0, wc = 0; const ne = new Float64Array(K); for (let k = 0; k < K; k++) { if (ct[k]) { ne[k] = sm[k] / ct[k]; ws += sm[k]; wc += ct[k]; } }
          const wm = wc ? ws / wc : 0; for (let k = 0; k < K; k++) ne[k] -= wm;
          for (let j = 0; j < n; j++) { const l = L[j]; if (l < 0 || l >= K) continue; fit[j] += ne[l] - e[l]; }
          for (let k = 0; k < K; k++) { moved = Math.max(moved, Math.abs(ne[k] - e[k])); e[k] = ne[k]; }
        }
        if (moved < 1e-5) break;
      }
      for (const nm of names) { const L = lev[nm], e = eff[nm], K = FAC[nm][0], pr = new Float64Array(n); for (let j = 0; j < n; j++) { const l = L[j]; pr[j] = y[j] - (fit[j] - (l >= 0 && l < K ? e[l] : 0)); } PR[nm] = pr; }
    }
    const pure = (nm) => PR[nm] ? { vals: PR[nm] } : {};
    // «ваш средний» — EV/100 по всей вашей базе; при наведении — по диапазонам стека (сравнение идёт именно с ними)
    let AVG = 0; const SB = ['до 6 BB', '6–10', '10–15', '15–20', '20–30', '30–45', '45–70', '70+ BB'], sbN = new Float64Array(8), sbS = new Float64Array(8);
    { const al = (typeof state !== 'undefined' && D.db.aliases && D.db.aliases.length > 1 && c.aid) ? state.alias : -1; let an = 0, as = 0; for (let i = 0; i < D.n; i++) { if (D.t[i] < 0 || (al >= 0 && c.aid[i] !== al)) continue; const e = evOf(c, i), k = stk8(c.bb[i] / 10); an++; as += e; sbN[k]++; sbS[k] += e; } AVG = an ? as / an * 100 : 0; }
    const avgLine = () => {
      const p = el('p', 'rs-avg-l');
      if (!+F.adj) { p.append(document.createTextNode('Сравнение с вашим средним по всей базе: '), el('b', AVG >= 0 ? 'pos' : 'neg', fmt(AVG, 1) + ' BB/100')); return p; }
      const help = 'Каждая раздача сравнивается с вашим средним в такой же ситуации: тот же стек, позиция, число игроков за столом, размер стола, баунти и анте. Поэтому короткий стек не «тянет вниз», а глубокий — не «тянет вверх».\n\nВаш средний EV по стеку:';
      const tb = el('table', 'rs-tip-t'); const hr = el('tr'); ['Стек', 'EV, BB/100', 'Раздач'].forEach((t, q) => { const h = el('th', q ? 'num' : null, t); h.scope = 'col'; hr.append(h); }); const th = el('thead'); th.append(hr); tb.append(th);
      const tbd = el('tbody'); SB.forEach((l, k) => { if (sbN[k] < 200) return; const v = sbS[k] / sbN[k] * 100, tr = el('tr'); const h = el('th', null, l); h.scope = 'row'; tr.append(h, el('td', 'num ' + (v >= 0 ? 'pos' : 'neg'), fmt(v, 1)), el('td', 'num dim', num(sbN[k]))); tbd.append(tr); });
      const trA = el('tr', 'all'); const hA = el('th', null, 'В целом'); hA.scope = 'row'; trA.append(hA, el('td', 'num ' + (AVG >= 0 ? 'pos' : 'neg'), fmt(AVG, 1)), el('td', 'num dim', num(sbN.reduce((a, x) => a + x, 0)))); tbd.append(trA); tb.append(tbd);
      p.append(document.createTextNode('Сравнение с вашим средним '), tipEl('в тех же ситуациях', help, null, tb), document.createTextNode(' — стек, позиция, стол. В целом по базе: '), el('b', AVG >= 0 ? 'pos' : 'neg', fmt(AVG, 1) + ' BB/100'));
      return p;
    };
    const addPure = (cd, txt, g) => { if (g && g.flat && g.filter(r => r.n >= MINN).length >= 2) cd.append(el('p', 'rs-verdict', 'Разницы нет: отличия между столбцами объясняются случайностью — по этим данным вариант не влияет на результат.')); };
    const tzOff = (m) => new Date(m * 60000).getTimezoneOffset();
    const lt = (i) => D.LT[i]; // местное время (посчитано при загрузке)
    // ---- ключевые числа ----
    const sesSet = new Set(), tourSet = new Set(); let evS = 0, netS = 0;
    X.idx.forEach((i, j) => { sesSet.add(D.ses[i]); if (D.tour[i] >= 0) tourSet.add(D.tour[i]); evS += X.ev[j]; netS += X.net[j]; });
    let mins = 0; for (const s of sesSet) { const z = D.sessions[s]; mins += Math.max(15, z[1] - z[0]); }
    const nH = X.idx.length;
    // ---- накопленный результат (сразу под фильтрами) ----
    {
      const step = Math.max(1, Math.floor(nH / 700)), pe = [], pn = []; let a = 0, b = 0;
      const ord = X.idx.map((i, j) => j).sort((p, q) => D.t[X.idx[p]] - D.t[X.idx[q]]);
      ord.forEach((j, q) => { a += X.ev[j]; b += X.net[j]; if (q % step === 0 || q === ord.length - 1) { pe.push([q + 1, a]); pn.push([q + 1, b]); } });
      const marks = []; let pm = -1; ord.forEach((j, q) => { const m = D.MON[X.idx[j]]; if (m !== pm) { if (pm >= 0) marks.push([q, ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][m % 12] + (m % 12 === 0 ? ' ' + Math.floor(m / 12) : '')]); pm = m; } });
      const cG = card('Накопленный результат', 'Сумма BB по раздачам по порядку: янтарная — EV, голубая — фактический результат. Разница между ними — везение.', true);
      const mk2 = []; marks.forEach(m => { if (!mk2.length || (m[0] - mk2[mk2.length - 1][0]) / nH * 1080 > 70) mk2.push(m); });
      if (nH < MINN) cG.append(lack());
      else { cG.append(lines([{ pts: pe, cls: 'ev' }, { pts: pn, cls: 'net' }], { marks: mk2, aria: 'накопленный результат' })); cG.append(legend([['lg-ev', 'EV, BB'], ['lg-net', 'факт, BB']])); }
      R.append(cG); CUM = cG;
    }
    const kp = el('div', 'rs-kpis');
    const kpi = (l, v, cls, sub) => { const k = el('div', 'rs-kpi'); k.append(el('span', null, l), el('b', cls || null, v)); if (sub) k.append(el('small', null, sub)); kp.append(k); };
    kpi('Раздач', num(nH)); kpi('Турниров', num(tourSet.size)); kpi('Сессий', num(sesSet.size), null, num(mins / 60) + ' ч игры');
    kpi('EV', fmt(evS / nH * 100), evS >= 0 ? 'pos' : 'neg', 'BB/100'); kpi('Факт', fmt(netS / nH * 100), netS >= 0 ? 'pos' : 'neg', 'BB/100');
    kpi('Везение', fmt((netS - evS) / nH * 100), netS - evS >= 0 ? 'pos' : 'neg', 'факт минус EV'); kpi('EV в час', fmt(evS / (mins / 60)), evS >= 0 ? 'pos' : 'neg', 'BB/ч');
    R.append(kp);
    const grid = el('div', 'rs-grid'); R.append(grid);
    const cI = card('Главное', 'Выводы под текущие фильтры. «Надёжно» — интервал не захватывает ноль; «тенденция» — может быть случайностью.', true);
    cI.append(el('p', 'rs-note', 'Считаю…')); grid.append(cI);
    if (!staged) R.scrollTop = keepTop;
    let anchored = staged;
    const step = async () => { if (!anchored) anchored = toAnchor(R); await tick(); return gen !== GEN || !HOST.isConnected; };
    if (await step()) return;
    // ---- сколько столов ----
    const cb = (n) => n <= 2 ? 0 : n <= 4 ? 1 : n <= 6 ? 2 : n <= 8 ? 3 : n <= 10 ? 4 : n <= 13 ? 5 : 6;
    const CBL = ['1–2', '3–4', '5–6', '7–8', '9–10', '11–13', '14+'];
    const gT = groups(D, X, (i) => cb(D.conc[i]), 7, pure('tbl'));
    // минуты на каждом числе столов (по всем раздачам выбранного периода): для рук в час и BB в час
    const tm = new Float64Array(7), tc = new Float64Array(7); {
      // время на каждом числе столов — по ВСЕМ открытым турнирам (как и само число столов у раздачи), только внутри выбранных сессий
      const ev2 = []; const al = (typeof state !== 'undefined' && D.db.aliases && D.db.aliases.length > 1 && c.aid) ? state.alias : -1, tAl = new Set(); if (al >= 0) { for (let i = 0; i < D.n; i++) if (D.tour[i] >= 0 && c.aid[i] === al) tAl.add(D.tour[i]); }
      D.tours.forEach((x, k) => { if (al < 0 || tAl.has(k)) ev2.push([x[1], 1], [x[2] + 1, -1]); }); ev2.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const ss = [...sesSet].map(s => D.sessions[s]).sort((a, b) => a[0] - b[0]); let e = 0, cc = 0;
      for (const z of ss) for (let t = z[0]; t <= z[1]; t++) { while (e < ev2.length && ev2[e][0] <= t) cc += ev2[e++][1]; if (cc > 0) { tm[cb(cc)]++; tc[cb(cc)] += cc; } }
    }
    const okT = gT.filter(r => r.n >= nH * 0.05); const bestT = okT.length ? okT.reduce((a, b) => b.v > a.v ? b : a) : null;
    const cT = card('Сколько столов играть?', 'Как меняется качество вашей игры и заработок в час в зависимости от того, сколько турниров открыто одновременно.', false, 'В каждой строке — сколько турниров было открыто одновременно.\n\n«К вашему среднему» — лучше или хуже вы играете при таком числе столов, чем обычно (что такое «ваш средний» — в подсказке «в тех же ситуациях»). «Немного / заметно / сильно лучше или хуже» — насколько отличается (3–8, 8–15, 15+ BB/100); насыщенная плашка — надёжно, бледная — может быть случайностью; «как в среднем» — меньше 3 BB/100; «мало данных» — меньше 5 сессий или 300 раздач; «не ясно» — данных хватает, но результат слишком скачет (погрешность больше ±20 BB/100).\n\n«Раздач в час» и «EV в час» — со всех столов вместе; «На 1 стол» — сколько из этого даёт каждый стол; если наиграно меньше 2 часов, EV не показывается. При фильтре формата (например, «Турбо») в час считаются только раздачи выбранных турниров, а время — всё время игры. «Часов» — сколько вы наиграли при таком числе столов.\n\nРекомендация — вариант с наибольшим EV в час, где игра не хуже среднего и наиграно 10+ часов.');
    {
      // EV в час — без поправок (сколько BB реально приходит за час игры на таком числе столов)
      const gE = groups(D, X, (i) => cb(D.conc[i]), 7, { vals: X.ev, ci: false, shrink: false });
      gT.forEach((r, q) => { r.label = CBL[q]; r.hph = tm[q] ? r.n / tm[q] * 60 : NaN; r.evh = tm[q] ? gE[q].sum / tm[q] * 60 : NaN; r.hours = tm[q] / 60; r.avgT = tm[q] ? tc[q] / tm[q] : NaN; r.evt = r.evh / r.avgT; });
      const ref = +F.adj ? 0 : (gT.mu != null ? gT.mu : 0);
      const rowsT = gT.filter(r => r.n);
      if (!rowsT.some(r => r.n >= MINN)) cT.append(lack());
      else {
        // рекомендация: среди вариантов, где игра не хуже обычного и наиграно 10+ часов, — где больше всего EV в час
        const ok = rowsT.filter(r => r.n >= MINN && r.hours >= 10 && Number.isFinite(r.evh)), bad = ok.filter(r => verdictOf(r, ref)[0] === 'down');
        const fine = ok.filter(r => !['down', 'small'].includes(verdictOf(r, ref)[0])), best = fine.length ? fine.reduce((x, y) => y.evh > x.evh ? y : x) : null;
        // что с вариантами больше проверенного диапазона: мало часов — так и сказать, с их EV в час
        const beyond = (hi) => { const more = rowsT.filter(r => +r.label.split('–')[0] > +hi && !fine.includes(r) && verdictOf(r, ref)[0] !== 'down'); if (!more.length) return ''; return 'Больше ' + hi + ' ' + plural(+hi, 'стола', 'столов', 'столов') + ' — выводов пока нет: ' + more.map(r => r.label + ' — ' + (verdictOf(r, ref)[1] === 'не ясно' ? 'результат слишком скачет' : 'мало данных') + ' (' + (r.hours >= 1 ? Math.round(r.hours) + ' ч' : 'меньше часа') + ', ' + r.ses + ' ' + plural(r.ses, 'сессия', 'сессии', 'сессий') + ')').join('; ') + '.'; };
        const softT = (arr) => { const t = softList(arr, ref, r => r.label + ' ст.'); return t ? ' (' + t + ' — может быть случайностью)' : ''; };
        const head = el('div', 'rs-head2');
        if (best && fine.length === 1) {
          const hi = best.label.split('–').pop();
          head.append(el('b', null, 'Хватает данных только для ' + best.label + ' ' + plural(+hi, 'стола', 'столов', 'столов')),
            el('span', null, 'Здесь EV в час — ' + fmt(best.evh, 1) + ' BB/ч' + (best.evh < 0 ? ' (в минусе)' : '') + '. Сравнить с другим числом столов пока не с чем. ' + beyond(hi)));
          T_HEAD = { cls: 'good', title: 'Столы: данных хватает только для ' + best.label, text: 'EV в час — ' + fmt(best.evh, 1) + ' BB/ч; сравнить пока не с чем.' };
        } else if (best) {
          const lo = fine[0].label.split('–')[0], hi = fine[fine.length - 1].label.split('–').pop();
          head.append(el('b', null, 'Лучше всего: ' + best.label + ' ' + plural(+best.label.split('–').pop(), 'стол', 'стола', 'столов')),
            el('span', null, 'Здесь больше всего EV в час — ' + fmt(best.evh, 1) + ' BB/ч. ' + (bad.length ? 'На ' + bad.map(r => r.label).join(', ') + ' столах качество игры заметно падает. ' : fine.length > 1 ? 'Надёжной разницы в качестве игры от ' + lo + ' до ' + hi + ' столов нет' + softT(fine) + '. ' : '') + beyond(hi)));
          best.rec = true;
          T_HEAD = { cls: 'good', title: 'Больше всего EV в час — на ' + best.label + ' столах', text: fmt(best.evh, 1) + ' BB/ч. ' + (bad.length ? 'На ' + bad.map(r => r.label).join(', ') + ' столах качество игры падает.' : fine.length > 1 ? 'Надёжной разницы в качестве игры от ' + lo + ' до ' + hi + ' столов нет; больше ' + hi + ' — данных мало.' : '') };
        } else { head.append(el('b', null, 'Пока без рекомендации'), el('span', null, 'Нужно хотя бы 10 часов игры на каком-то числе столов без потери качества.')); T_HEAD = null; }
        cT.append(head, avgLine());
        const tb = el('div', 'rs-rows');
        const HT = ['Столов', 'К вашему среднему', 'Раздач в час', 'EV в час', 'На 1 стол', 'Часов'];
        const hdr = el('div', 'rs-row rs-row-h'); HT.forEach(t => hdr.append(el('span', null, t))); tb.append(hdr);
        const lim = Math.max(5, ...rowsT.filter(r => r.n >= MINN).map(r => Math.abs(r.v - ref)));
        rowsT.forEach(r => {
          const [cls, txt] = verdictOf(r, ref), row = el('div', 'rs-row ' + cls + (r.rec ? ' rec' : ''));
          const nm = el('b', null, r.label); if (r.rec) nm.append(el('em', null, 'лучший EV в час'));
          row.append(nm, el('span', 'rs-chip ' + cls, txt), el('span', 'num', Number.isFinite(r.hph) ? Math.round(r.hph) : '—'), el('span', 'num ' + (r.hours < 2 ? 'dim' : r.evh >= 0 ? 'pos' : 'neg'), Number.isFinite(r.evh) && r.hours >= 2 ? fmt(r.evh, 1) : '—'), el('span', 'num ' + (r.hours < 2 ? 'dim' : r.evt >= 0 ? 'pos' : 'neg'), Number.isFinite(r.evt) && r.hours >= 2 ? fmt(r.evt, 1) : '—'), el('span', 'num dim', r.hours >= 1 ? Math.round(r.hours) : '<1'));
          row.title = r.label + ' столов: ' + num(r.n) + ' раздач, ' + r.ses + ' ' + plural(r.ses, 'сессия', 'сессии', 'сессий') + (Number.isFinite(r.se) ? ' · погрешность ±' + (1.96 * r.se).toFixed(0) + ' BB/100' : '') + (cls === 'small' ? (txt === 'не ясно' ? ' — результат слишком скачет, оценить нельзя' : ' — для оценки нужно 5+ сессий и 300+ раздач') : ' · ' + fmt(r.v - ref) + ' BB/100 к вашему среднему');
          tb.append(row);
        });
        cT.append(tb);
      }
    }
    addPure(cT, 'час сессии, время суток, день, длина сессии, скорость и рум'); grid.append(cT);
    if (await step()) return;
    // ---- ход сессии ----
    const gS = groups(D, X, (i) => Math.min(9, Math.floor(D.since[i] / 60)), 10, pure('ses'));
    const cS = card('По ходу сессии', 'Устаёте ли вы к концу сессии: качество игры по часам от её начала (сессия — игра без перерыва больше 45 минут).', false, 'Каждая клетка — час от начала сессии.\n\nЧисло — на сколько BB/100 вы играете лучше (плюс) или хуже (минус) своего среднего; что такое «ваш средний» — в подсказке «в тех же ситуациях».\n\nЧисло показано как есть, а цвет и подпись учитывают случайность: например, −5 на маленькой выборке может быть «как в среднем».\n\nПодпись — насколько отличается: немного (3–8 BB/100), заметно (8–15), сильно (15+). Цвет: зелёный — лучше, красный — хуже, серый — как в среднем; насыщенный — надёжно, бледный — может быть случайностью; пунктир — мало данных или «не ясно». В поздних часах раздач меньше и погрешность больше, поэтому −4 там может быть шумом.\n\n«Пока не доказан» — спад виден, но данных ещё мало. Наведите на клетку — точные числа.');
    {
      const ref = +F.adj ? 0 : (gS.mu != null ? gS.mu : 0);
      gS.forEach((r, q) => { r.label = q === 9 ? '9+ ч' : q + '–' + (q + 1) + ' ч'; });
      // наклон: на сколько в среднем меняется результат за каждый час сессии
      const YV = PR.ses || X.v; let n = 0, sx = 0, sy = 0; X.idx.forEach((i, j) => { n++; sx += D.since[i] / 60; sy += YV[j] * 100; });
      const mx = sx / n, my = sy / n; let sxx = 0, sxy = 0; X.idx.forEach((i, j) => { const dx = D.since[i] / 60 - mx; sxx += dx * dx; sxy += dx * (YV[j] * 100 - my); });
      const sl = sxx ? sxy / sxx : 0, cs = new Map(); X.idx.forEach((i, j) => { const dx = D.since[i] / 60 - mx, e = YV[j] * 100 - my - sl * dx; cs.set(D.ses[i], (cs.get(D.ses[i]) || 0) + dx * e); });
      let v2 = 0; for (const x of cs.values()) v2 += x * x; const G = cs.size, se = sxx && G >= 3 ? Math.sqrt(v2 * G / (G - 1)) / sxx : NaN, lo = sl - 1.96 * se, hi = sl + 1.96 * se;
      if (!gS.some(r => r.n >= MINN)) cS.append(lack());
      else {
        const firstBad = gS.find(r => r.n >= MINN && verdictOf(r, ref)[0] === 'down');
        const head = el('div', 'rs-head2');
        if (!Number.isFinite(se)) head.append(el('b', null, 'Мало сессий'), el('span', null, 'Нужно хотя бы 3 сессии под эти фильтры, чтобы оценить усталость.'));
        else if (hi < 0) head.append(el('b', 'neg', 'Да, к концу сессии вы играете хуже'), el('span', null, 'В среднем ' + fmt(sl, 1) + ' BB/100 за каждый час сессии' + (firstBad ? '; сильнее всего — в отрезке ' + firstBad.label + '.' : '.') + ' Подумайте о более коротких сессиях или перерывах.'));
        else if (lo > 0) head.append(el('b', 'pos', 'Усталости нет — к концу вы играете даже лучше'), el('span', null, 'В среднем ' + fmt(sl, 1) + ' BB/100 за каждый час сессии.'));
        else {
          // поздние часы (с 6-го) в минусе и тренд вниз — честно «возможен спад, пока не доказан»
          const late = gS.slice(5).filter(r => r.n), ln = late.reduce((a, r) => a + r.n, 0), lv = ln ? late.reduce((a, r) => a + ((r.raw != null ? r.raw : r.v) - ref) * r.n, 0) / ln : 0;
          if (sl < 0 && lv <= -2 && ln >= MINN) head.append(el('b', 'warn', 'Возможен спад к концу сессии — пока не доказан'), el('span', null, 'После 5-го часа в среднем ' + fmt(lv, 1) + ' BB/100 к вашему среднему, тренд ' + fmt(sl, 1) + ' BB/100 за час. Но это ещё в пределах случайности: длинных сессий пока мало. Стоит следить — если спад сохранится, он станет надёжным.'));
          else head.append(el('b', null, 'Усталость не видна'), el('span', null, 'Результат к концу сессии ровно не падает — изменения по часам в пределах случайности' + (firstBad ? ', но в отрезке ' + firstBad.label + ' игра заметно хуже обычного.' : '.')));
        }
        cS.append(head, avgLine());
        { const hb = head.querySelector('b'), hs = head.querySelector('span'); S_HEAD = { cls: hb.classList.contains('neg') ? 'bad' : hb.classList.contains('warn') ? 'warn' : hb.classList.contains('pos') ? 'good' : 'good', title: hb.textContent, text: hs ? hs.textContent : '' }; }
        // лента часов: цвет — оценка, число — отклонение от обычного уровня
        const tl = el('div', 'rs-tl');
        gS.forEach(r => { if (!r.n) return; const [cls, txt] = verdictOf(r, ref); const c = el('div', 'rs-tl-c ' + cls); c.append(el('span', 'h', r.label), el('b', null, cls !== 'small' ? fmt((r.raw != null ? r.raw : r.v) - ref, 1) : '—'), el('small', null, txt)); c.title = r.label + ': ' + fmt(r.v) + ' BB/100 · ' + num(r.n) + ' раздач' + (Number.isFinite(r.lo) ? ' · 95%: от ' + fmt(r.lo) + ' до ' + fmt(r.hi) : ''); tl.append(c); });
        cS.append(tl);
      }
    }
    addPure(cS, 'число столов, время суток, день, длина сессии, скорость и рум'); grid.append(cS);
    if (await step()) return;
    // ---- длина сессии ----
    const SL = [[0, 120, 'до 2 ч'], [120, 240, '2–4 ч'], [240, 360, '4–6 ч'], [360, 480, '6–8 ч'], [480, 600, '8–10 ч'], [600, 1e9, '10+ ч']];
    const slOf = (s) => { const z = D.sessions[s], L = z[1] - z[0]; return SL.findIndex(b => L >= b[0] && L < b[1]); };
    const gL = groups(D, X, (i) => slOf(D.ses[i]), SL.length, pure('slen'));
    const cL = card('Какой длины сессии играть?', 'Как вы играете в сессиях разной длины и сколько они приносят.', false, 'В каждой строке — сессии определённой длины (сессия — игра без перерыва больше 45 минут). Все раздачи сессии относятся к её длине: если сессия шла 9 часов, в строку «8–10 ч» попадают и её первые часы.\n\n«К вашему среднему» — лучше или хуже вы играете в таких сессиях, чем обычно (что такое «ваш средний» — в подсказке «в тех же ситуациях»). «Мало данных» — меньше 5 сессий или 300 раздач; «не ясно» — данных хватает, но результат слишком скачет (погрешность больше ±20 BB/100).\n\n«EV за сессию» — сколько BB в среднем приносит одна такая сессия. «EV в час» — сколько в среднем приносит час игры в таких сессиях. В длинных сессиях он обычно выше: в них больше глубоких проходов в турнирах, поэтому сам по себе он не значит, что длинные сессии выгоднее — для этого смотрите «К вашему среднему».');
    {
      const ref = 0, gLE = groups(D, X, (i) => slOf(D.ses[i]), SL.length, { vals: X.ev, ci: false, shrink: false });
      const sesL = SL.map(() => new Set()); X.idx.forEach(i => { const k = slOf(D.ses[i]); if (k >= 0) sesL[k].add(D.ses[i]); });
      gL.forEach((r, q) => { r.label = SL[q][2]; let m = 0; for (const z of sesL[q]) { const w = D.sessions[z]; m += Math.max(15, w[1] - w[0]); } r.hours = m / 60; r.evs = sesL[q].size ? gLE[q].sum / sesL[q].size : NaN; r.evh = m ? gLE[q].sum / (m / 60) : NaN; });
      const rowsL = gL.filter(r => r.n);
      if (!rowsL.some(r => r.n >= MINN)) cL.append(lack());
      else {
        const ev = rowsL.filter(r => verdictOf(r, ref)[0] !== 'small'), bad = ev.filter(r => verdictOf(r, ref)[0] === 'down'), good = ev.filter(r => verdictOf(r, ref)[0] === 'up');
        const small = rowsL.filter(r => verdictOf(r, ref)[0] === 'small');
        const tail = small.length ? ' Оценить нельзя: ' + small.map(r => r.label + ' (' + (r.ses < 5 ? r.ses + ' ' + plural(r.ses, 'сессия', 'сессии', 'сессий') : verdictOf(r, ref)[1] === 'не ясно' ? 'слишком большой разброс' : Math.round(r.hours) + ' ч игры') + ')').join(', ') + '.' : '';
        const lenFrom = (r) => r.label.startsWith('до') ? 0 : parseInt(r.label, 10), lenTo = (r) => r.label.includes('+') ? null : parseInt(r.label.split('–').pop().replace('до ', ''), 10);
        const head = el('div', 'rs-head2'); let hb, ht, hc = null;
        if (bad.length) { hb = 'Сессии ' + bad.map(r => r.label).join(', ') + ' играются хуже среднего'; hc = 'neg'; const okL = ev.filter(r => !bad.includes(r)); ht = 'Разница — ' + bad.map(r => fmt(r.v, 1)).join(', ') + ' BB/100.' + (okL.length ? ' Сессии ' + okL.map(r => r.label).join(', ') + ' — без потери качества.' : '') + tail; }
        else if (good.length) { hb = 'Лучше всего вы играете в сессиях ' + good.map(r => r.label).join(', '); hc = 'pos'; ht = 'На ' + good.map(r => Math.abs(r.v).toFixed(1)).join(', ') + ' BB/100 лучше вашего среднего.' + tail; }
        else if (ev.length > 1) { hb = 'Надёжной разницы между длинами сессий нет'; const a = lenFrom(ev[0]), z = lenTo(ev[ev.length - 1]); const st = softList(ev, ref, r => r.label); ht = 'Сессии ' + (z == null ? 'от ' + a + ' часов и длиннее' : (a ? 'от ' + a + ' ' : '') + 'до ' + z + ' часов') + ' играются в пределах случайности одинаково' + (st ? ' (' + st + ' — может быть шумом)' : '') + '.' + tail; }
        else { hb = 'Пока без вывода'; ht = 'Для сравнения нужно хотя бы два варианта длины с достаточной выборкой.' + tail; }
        head.append(el('b', hc, hb), el('span', null, ht)); cL.append(head, avgLine());
        L_HEAD = { cls: hc === 'neg' ? 'bad' : 'good', title: hb, text: ht };
        const tb = el('div', 'rs-rows rs-rows-l'); const hdr = el('div', 'rs-row rs-row-h'); ['Длина', 'К вашему среднему', 'Сессий', 'EV за сессию', 'EV в час', 'Часов'].forEach(t => hdr.append(el('span', null, t))); tb.append(hdr);
        rowsL.forEach(r => { const [cls, txt] = verdictOf(r, ref), row = el('div', 'rs-row ' + cls); row.append(el('b', null, r.label), el('span', 'rs-chip ' + cls, txt), el('span', 'num', String(r.ses)), el('span', 'num ' + (r.evs >= 0 ? 'pos' : 'neg'), Number.isFinite(r.evs) ? fmt(r.evs, 0) : '—'), el('span', 'num ' + (r.hours < 2 ? 'dim' : r.evh >= 0 ? 'pos' : 'neg'), r.hours >= 2 && Number.isFinite(r.evh) ? fmt(r.evh, 1) : '—'), el('span', 'num dim', r.hours >= 1 ? Math.round(r.hours) : '<1'));
          row.title = r.label + ': ' + num(r.n) + ' раздач, ' + r.ses + ' ' + plural(r.ses, 'сессия', 'сессии', 'сессий') + (Number.isFinite(r.se) ? ' · погрешность ±' + (1.96 * r.se).toFixed(0) + ' BB/100' : '') + (cls === 'small' ? '' : ' · ' + fmt(r.v) + ' BB/100 к вашему среднему'); tb.append(row); });
        cL.append(tb);
      }
    }
    grid.append(cL);
    if (await step()) return;
    // ---- дни недели ----
    const gD = groups(D, X, (i) => D.DOW[i], 7, pure('dow'));
    const okD = gD.filter(r => r.n >= nH * 0.04); const bestD = okD.length ? okD.reduce((a, b) => b.v > a.v ? b : a) : null;
    const cD = card('В какие дни играть?', 'Как вы играете в разные дни недели — по вашему времени.', false, 'Каждая клетка — день недели (по часовому поясу вашего компьютера).\n\nЧисло — на сколько BB/100 вы играете в этот день лучше (плюс) или хуже (минус) своего среднего; что такое «ваш средний» — в подсказке «в тех же ситуациях». Ниже — сколько раздач сыграно в этот день.\n\nЧисло показано как есть, а цвет и подпись учитывают случайность: например, −5 на маленькой выборке может быть «как в среднем».\n\nПодпись — насколько отличается: немного (3–8 BB/100), заметно (8–15), сильно (15+). Цвет: зелёный — лучше, красный — хуже, серый — как в среднем; насыщенный — надёжно, бледный — может быть случайностью; пунктир — мало данных или «не ясно».');
    {
      const ref = 0, DN = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'], DNv = ['в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу', 'в воскресенье'];
      gD.forEach((r, q) => { r.label = DOW[q]; });
      if (!gD.some(r => r.n >= MINN)) cD.append(lack());
      else {
        const ev = gD.filter(r => r.n && verdictOf(r, ref)[0] !== 'small');
        const bad = ev.filter(r => verdictOf(r, ref)[0] === 'down'), good = ev.filter(r => verdictOf(r, ref)[0] === 'up');
        const sb = ev.filter(r => verdictOf(r, ref)[0] === 'down-soft'), sg = ev.filter(r => verdictOf(r, ref)[0] === 'up-soft');
        const list = (a) => a.map(r => DNv[r.k]).join(', ');
        const head = el('div', 'rs-head2'); let hb, ht, hc = null;
        if (bad.length || good.length) {
          hb = (good.length ? 'Лучше всего — ' + list(good) : '') + (good.length && bad.length ? '; ' : '') + (bad.length ? (good.length ? 'хуже — ' : 'Хуже всего вы играете ') + list(bad) : '');
          hb = hb.charAt(0).toUpperCase() + hb.slice(1); hc = bad.length && !good.length ? 'neg' : good.length && !bad.length ? 'pos' : null;
          ht = [...good, ...bad].map(r => DNv[r.k] + ' ' + fmt(r.v, 1)).join(', ') + ' BB/100 к вашему среднему.' + (bad.length ? ' В эти дни стоит играть меньше или внимательнее.' : ''); ht = ht.charAt(0).toUpperCase() + ht.slice(1);
        } else {
          hb = 'Надёжной разницы между днями нет'; const st = softList(ev, ref, r => DN[r.k]); ht = 'Отличия между днями в пределах случайности.' + (st ? ' Не доказано, но заметно: ' + st + '.' : '');
        }
        head.append(el('b', hc, hb), el('span', null, ht)); cD.append(head, avgLine());
        D_HEAD = { cls: hc === 'neg' ? 'bad' : 'good', title: hb, text: ht };
        const tl = el('div', 'rs-tl rs-tl7');
        gD.forEach(r => { const [cls, txt] = verdictOf(r, ref); const c = el('div', 'rs-tl-c ' + cls); c.append(el('span', 'h', r.label), el('b', null, cls !== 'small' ? fmt((r.raw != null ? r.raw : r.v) - ref, 1) : '—'), el('small', null, txt), el('em', null, r.n ? num(r.n) + ' р.' : '')); c.title = DN[r.k] + ': ' + num(r.n) + ' раздач, ' + r.ses + ' ' + plural(r.ses, 'сессия', 'сессии', 'сессий') + (Number.isFinite(r.se) ? ' · погрешность ±' + (1.96 * r.se).toFixed(0) + ' BB/100' : ''); tl.append(c); });
        cD.append(tl);
      }
    }
    grid.append(cD);
    if (await step()) return;
    // ---- время суток ----
    const gH = groups(D, X, (i) => D.HOUR[i], 24, pure('hour'));
    const cH = card('В какое время играть?', 'Как вы играете в разные часы суток — по вашему времени.', true, 'Каждая клетка — час суток, когда шла раздача (по часовому поясу вашего компьютера). Показаны только часы, в которые вы играли.\n\nЧисло — на сколько BB/100 вы играете в этот час лучше (плюс) или хуже (минус) своего среднего; что такое «ваш средний» — в подсказке «в тех же ситуациях». Ниже — сколько раздач сыграно в этот час.\n\nЧисло показано как есть, а цвет и подпись учитывают случайность: например, −5 на маленькой выборке может быть «как в среднем».\n\nПодпись — насколько отличается: немного (3–8 BB/100), заметно (8–15), сильно (15+). Цвет: зелёный — лучше, красный — хуже, серый — как в среднем; насыщенный — надёжно, бледный — может быть случайностью; пунктир — мало данных или «не ясно».');
    {
      const ref = 0, hh = (q) => String(q).padStart(2, '0') + ':00', span = (q) => String(q).padStart(2, '0') + '–' + String((q + 1) % 24).padStart(2, '0');
      gH.forEach((r, q) => { r.label = hh(q); });
      const used = gH.filter(r => r.n);
      if (!used.some(r => r.n >= MINN)) cH.append(lack());
      else {
        const ev = used.filter(r => verdictOf(r, ref)[0] !== 'small'), bad = ev.filter(r => verdictOf(r, ref)[0] === 'down'), good = ev.filter(r => verdictOf(r, ref)[0] === 'up');
        const sb = ev.filter(r => verdictOf(r, ref)[0] === 'down-soft'), sg = ev.filter(r => verdictOf(r, ref)[0] === 'up-soft');
        // основное игровое время: часы с 5%+ раздач, по кругу от полудня (чтобы вечер и ночь шли подряд)
        const keys = used.filter(r => r.n >= nH * 0.05).map(r => (r.k + 12) % 24); const when = keys.length ? 'Чаще всего вы играете с ' + hh((Math.min(...keys) + 12) % 24) + ' до ' + hh((Math.max(...keys) + 13) % 24) + '. ' : '';
        const list = (a) => a.map(r => span(r.k)).join(', ');
        const head = el('div', 'rs-head2'); let hb, ht, hc = null;
        if (bad.length || good.length) {
          hb = (good.length ? 'Лучше всего вы играете в ' + list(good) : '') + (good.length && bad.length ? '; хуже — в ' : bad.length ? 'Хуже всего вы играете в ' : '') + (bad.length ? list(bad) : '');
          hc = bad.length && !good.length ? 'neg' : good.length && !bad.length ? 'pos' : null;
          ht = when + [...good, ...bad].map(r => span(r.k) + ' ' + fmt(r.v, 1)).join(', ') + ' BB/100 к вашему среднему.' + (bad.length ? ' В это время стоит играть меньше столов или сделать перерыв.' : '');
        } else {
          hb = 'Надёжной разницы между часами нет'; const st = softList(ev, ref, r => span(r.k)); ht = when + 'Отличия между часами в пределах случайности.' + (st ? ' Не доказано, но заметно: ' + st + '.' : '');
        }
        head.append(el('b', hc, hb), el('span', null, ht)); cH.append(head, avgLine());
        H_HEAD = { cls: hc === 'neg' ? 'bad' : 'good', title: hb, text: ht };
        const tl = el('div', 'rs-tl rs-tlh');
        // по кругу от самого раннего «игрового» часа — чтобы ночь шла после вечера
        const start = used.length ? used.map(r => r.k).sort((a, b) => ((a + 12) % 24) - ((b + 12) % 24))[0] : 0;
        for (let d = 0; d < 24; d++) { const r = gH[(start + d) % 24]; if (!r.n) continue; const [cls, txt] = verdictOf(r, ref); const c2 = el('div', 'rs-tl-c ' + cls); c2.append(el('span', 'h', span(r.k)), el('b', null, cls !== 'small' ? fmt((r.raw != null ? r.raw : r.v) - ref, 1) : '—'), el('small', null, txt), el('em', null, num(r.n) + ' р.')); c2.title = span(r.k) + ': ' + num(r.n) + ' раздач, ' + r.ses + ' ' + plural(r.ses, 'сессия', 'сессии', 'сессий') + (Number.isFinite(r.se) ? ' · погрешность ±' + (1.96 * r.se).toFixed(0) + ' BB/100' : ''); tl.append(c2); }
        cH.append(tl);
      }
    }
    grid.append(cH);
    if (await step()) return;
    // ---- месяцы ----
    {
      const mk = (i) => D.MON[i], MN = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
      const ms = [...new Set(X.idx.map(mk))].sort((a, b) => a - b).slice(-18), mi = new Map(ms.map((m, k) => [m, k])), K = ms.length, key = (i) => { const k = mi.get(mk(i)); return k == null ? -1 : k; };
      const gM = groups(D, X, key, K, { vals: X.ev, shrink: false }), gME = groups(D, X, key, K, { vals: X.ev, ci: false, shrink: false });
      gM.forEach((r, q) => { r.label = MN[ms[q] % 12] + ' ' + Math.floor(ms[q] / 12); r.ev100 = gME[q].v; r.evSum = gME[q].sum; });
      const cM = card('Как менялся результат по месяцам?', 'Ваш EV по месяцам и как вы играли в каждом месяце по сравнению со своим средним.', false, 'В каждой строке — месяц.\n\n«EV/100» — ваш EV в BB на 100 раздач, «Всего, BB» — сколько BB вы набрали по EV за месяц. «К вашему среднему» — насколько EV месяца выше или ниже вашего среднего EV по всей базе: немного (3–8 BB/100), заметно (8–15), сильно (15+). Насыщенная плашка — надёжно, бледная — может быть случайностью.\n\n«Мало данных» — меньше 5 сессий или 300 раздач; «не ясно» — данных хватает, но результат слишком скачет (погрешность больше ±20 BB/100).');
      const rowsM = gM.filter(r => r.n);
      if (!rowsM.some(r => r.n >= MINN)) cM.append(lack());
      else {
        const ev = rowsM.filter(r => verdictOf(r, AVG)[0] !== 'small'), bad = ev.filter(r => verdictOf(r, AVG)[0] === 'down'), good = ev.filter(r => verdictOf(r, AVG)[0] === 'up');
        const big = rowsM.filter(r => r.n >= MINN), best = big.length ? big.reduce((a, b) => b.ev100 > a.ev100 ? b : a) : null, worst = big.length ? big.reduce((a, b) => b.ev100 < a.ev100 ? b : a) : null;
        const head = el('div', 'rs-head2'); let hb, hc = null, ht;
        const nEv = ev.length, nAll = rowsM.length, few = nAll - nEv;
        const range = best && worst && best !== worst ? best.ev100 - worst.ev100 : 0;
        const rangeTxt = best && worst && best !== worst ? 'от ' + fmt(worst.ev100, 1) + ' (' + worst.label + ') до ' + fmt(best.ev100, 1) + ' BB/100 (' + best.label + ')' : '';
        const fewTxt = few ? ' Надёжно оценить можно ' + nEv + ' ' + plural(nEv, 'месяц', 'месяца', 'месяцев') + ' из ' + nAll + ' — в остальных мало сессий или слишком большой разброс.' : '';
        if (bad.length || good.length) {
          hb = (bad.length ? 'Слабые месяцы: ' + bad.map(r => r.label).join(', ') : '') + (bad.length && good.length ? '; сильные: ' : good.length ? 'Сильные месяцы: ' : '') + (good.length ? good.map(r => r.label).join(', ') : '');
          hc = bad.length && !good.length ? 'neg' : good.length && !bad.length ? 'pos' : null;
          ht = 'EV в эти месяцы надёжно ' + (bad.length && !good.length ? 'ниже' : good.length && !bad.length ? 'выше' : 'отличается от') + ' вашего среднего (' + fmt(AVG, 1) + ' BB/100): ' + [...good, ...bad].map(r => r.label + ' ' + fmt(r.ev100, 1)).join(', ') + '. Весь разброс — ' + rangeTxt + '.' + fewTxt;
        } else if (range >= 5) {
          hb = 'EV по месяцам заметно менялся: ' + rangeTxt;
          const st = softList(ev, AVG, r => r.label); ht = 'Но надёжно от вашего среднего (' + fmt(AVG, 1) + ' BB/100) не отличается ни один месяц: у одного месяца погрешность ±15–20 BB/100.' + (st ? ' Не доказано, но заметно: ' + st + '.' : '') + fewTxt;
        } else {
          hb = 'EV по месяцам почти не менялся' + (rangeTxt ? ': ' + rangeTxt : '');
          ht = 'Качество игры в пределах случайности одинаковое.' + fewTxt;
        }
        head.append(el('b', hc, hb), el('span', null, ht)); cM.append(head);
        const tb = el('div', 'rs-rows rs-rows-m'); const hdr = el('div', 'rs-row rs-row-h'); ['Месяц', 'К вашему среднему', 'Раздач', 'EV/100', 'Всего, BB'].forEach(t => hdr.append(el('span', null, t))); tb.append(hdr);
        rowsM.slice().reverse().forEach(r => { const [cls, txt] = verdictOf(r, AVG), row = el('div', 'rs-row ' + (cls === 'small' ? 'small' : '')); row.append(el('b', null, r.label), el('span', 'rs-chip ' + cls, txt), el('span', 'num dim', num(r.n)), el('span', 'num ' + (r.ev100 >= 0 ? 'pos' : 'neg'), fmt(r.ev100, 1)), el('span', 'num ' + (r.evSum >= 0 ? 'pos' : 'neg'), fmt(r.evSum, 0))); row.title = r.label + ': ' + r.ses + ' ' + plural(r.ses, 'сессия', 'сессии', 'сессий') + (Number.isFinite(r.se) ? ' · погрешность ±' + (1.96 * r.se).toFixed(0) + ' BB/100' : ''); tb.append(row); });
        cM.append(tb);
      }
      grid.append(cM);
    }
    if (await step()) return;
    // ---- позиции и глубина стека: реальный заработок (без поправки — иначе они обнуляются) ----
    {
      const raw = X.ev;
      // в плюсе / в минусе надёжно, около нуля, мало данных
      const rowsRaw = (rows, labels, cd, title1) => {
        const tb = el('div', 'rs-rows rs-rows-p'); const hdr = el('div', 'rs-row rs-row-h'); [title1, 'Итог', 'Раздач', 'EV/100', 'Всего, BB'].forEach(t => hdr.append(el('span', null, t))); tb.append(hdr);
        rows.forEach(r => { if (!r.n) return; const [cls, txt] = vRaw(r), row = el('div', 'rs-row ' + (cls === 'small' ? 'small' : '')); row.append(el('b', null, labels[r.k]), el('span', 'rs-chip ' + cls, txt), el('span', 'num dim', num(r.n)), el('span', 'num ' + (r.v >= 0 ? 'pos' : 'neg'), fmt(r.raw != null ? r.raw : r.v, 1)), el('span', 'num ' + (r.sumRaw >= 0 ? 'pos' : 'neg'), fmt(r.sumRaw, 0))); row.title = labels[r.k] + ': ' + r.ses + ' ' + plural(r.ses, 'сессия', 'сессии', 'сессий') + (Number.isFinite(r.se) ? ' · погрешность ±' + (1.96 * r.se).toFixed(0) + ' BB/100' : '') + (/-soft$/.test(cls) ? ' — знак может быть случайностью' : cls === 'up' || cls === 'down' ? ' — надёжно' : ''); tb.append(row); });
        cd.append(tb);
      };
      const gP = groups(D, X, (i) => c.pos[i], 7, { vals: raw, shrink: false }), gPs = groups(D, X, (i) => c.pos[i], 7, { vals: raw, ci: false, shrink: false });
      gP.forEach((r, q) => { r.sumRaw = gPs[q].sum; });
      const cP = card('Где вы зарабатываете: позиции', 'Реальный EV по позициям, без поправок.', false, 'В каждой строке — позиция за столом.\n\n«EV/100» — ваш EV в BB на 100 раздач с этой позиции, «Всего, BB» — сколько BB она принесла (или отняла) за всё время.\n\n«Около нуля» — меньше ±2 BB/100; «в плюсе» / «в минусе» — до 10; «заметно» — от 10; «сильно» — от 25. Насыщенная плашка — результат надёжный, бледная — на такой выборке может быть случайностью. Блайнды почти у всех в минусе — это нормально: вы платите их вслепую.');
      if (!gP.some(r => r.n >= MINN)) cP.append(lack());
      else {
        const nonBl = gP.filter(r => r.n && r.k <= 4), bl = gP.filter(r => r.n && r.k >= 5 && vRaw(r)[0] !== 'small'), ok = nonBl.filter(r => vRaw(r)[0] !== 'small');
        const best = ok.length ? ok.reduce((a, b) => b.v > a.v ? b : a) : null, losing = ok.filter(r => vRaw(r)[0] === 'down');
        const head = el('div', 'rs-head2');
        head.append(el('b', losing.length ? 'neg' : null, losing.length ? 'В минусе позиция ' + losing.map(r => POS[r.k]).join(', ') : best ? 'Больше всего приносит ' + POS[best.k] : 'По позициям мало данных'),
          el('span', null, (best ? POS[best.k] + ': ' + fmt(best.v, 1) + ' BB/100, всего ' + fmt(best.sumRaw, 0) + ' BB. ' : '') + (losing.length ? 'Обычно ранние и поздние позиции в плюсе — игру с ' + losing.map(r => POS[r.k]).join(', ') + ' стоит разобрать. ' : '') + (bl.length ? 'Блайнды: ' + bl.map(r => POS[r.k] + ' ' + fmt(r.v, 1)).join(', ') + ' BB/100' + (bl.some(r => r.v < 0) ? ' — минус на блайндах нормален.' : '.') : '') + (!ok.length && !bl.length ? 'Результат по позициям слишком скачет для выводов.' : '')));
        cP.append(head); rowsRaw(gP, POS, cP, 'Позиция');
      }
      grid.append(cP);
      const gK = groups(D, X, (i) => stkB(c.bb[i] / 10), 5, { vals: raw, shrink: false }), gKs = groups(D, X, (i) => stkB(c.bb[i] / 10), 5, { vals: raw, ci: false, shrink: false });
      gK.forEach((r, q) => { r.sumRaw = gKs[q].sum; });
      const cK = card('Где вы зарабатываете: глубина стека', 'Реальный EV при разном вашем стеке, без поправок.', false, 'В каждой строке — ваш стек в больших блайндах на начало раздачи: 70+ BB — обычно ранняя стадия, до 10 BB — пуш-фолд.\n\n«EV/100» — ваш EV в BB на 100 раздач при таком стеке, «Всего, BB» — сколько BB это принесло за всё время.\n\n«Около нуля» — меньше ±2 BB/100; «в плюсе» / «в минусе» — до 10; «заметно» — от 10; «сильно» — от 25. Насыщенная плашка — результат надёжный, бледная — на такой выборке может быть случайностью.');
      if (!gK.some(r => r.n >= MINN)) cK.append(lack());
      else {
        const ok = gK.filter(r => r.n && vRaw(r)[0] !== 'small'), best = ok.length ? ok.reduce((a, b) => b.v > a.v ? b : a) : null, worst = ok.length ? ok.reduce((a, b) => b.v < a.v ? b : a) : null, losing = ok.filter(r => vRaw(r)[0] === 'down');
        const head = el('div', 'rs-head2');
        const allPlus = ok.length && ok.every(r => r.v > 0), unsure = ok.filter(r => /-soft$/.test(vRaw(r)[0]));
        head.append(el('b', losing.length ? 'neg' : allPlus ? 'pos' : null, losing.length ? 'Вы теряете со стеком ' + losing.map(r => STK[r.k]).join(', ') : allPlus ? 'Вы в плюсе со всеми стеками' : best ? 'Больше всего — со стеком ' + STK[best.k] : 'Глубина стека'),
          el('span', null, (allPlus && best && worst ? 'От ' + fmt(worst.v, 1) + ' BB/100 (' + STK[worst.k] + ') до ' + fmt(best.v, 1) + ' (' + STK[best.k] + '). ' : (best ? STK[best.k] + ': ' + fmt(best.v, 1) + ' BB/100. ' : '') + (worst && worst !== best ? 'Меньше всего — ' + STK[worst.k] + ': ' + fmt(worst.v, 1) + ' BB/100. ' : '')) + (gK.some(r => r.n && vRaw(r)[0] === 'small') ? 'Диапазоны «не ясно» и «мало данных» в выводе не участвуют. ' : '') + (losing.length ? 'Этот диапазон стека стоит подтянуть.' : allPlus ? (unsure.length ? 'Для ' + unsure.map(r => STK[r.k]).join(', ') + ' плюс пока может быть случайностью.' : 'Везде — надёжно.') : ok.some(r => vRaw(r)[0] === 'down-soft') ? 'Со стеком ' + ok.filter(r => vRaw(r)[0] === 'down-soft').map(r => STK[r.k]).join(', ') + ' вы в минусе, но это может быть случайностью.' : 'Надёжного минуса нет ни в одном диапазоне стека.')));
        cK.append(head); rowsRaw(gK, STK, cK, 'Стек');
      }
      grid.append(cK);
    }
    if (await step()) return;
    // ---- форматы турниров: таблица ----
    {
      const cF = card('Форматы турниров', 'Нажмите на строку — она станет фильтром для всей страницы.', true); cF.dataset.anchor = 'fmt';
      const secs = [];
      const tourCls = (i) => { const tr = D.tour[i], k = tr >= 0 ? D.tours[tr][0] : -1; return k >= 0 ? D.cls[k] : { speed: 0, myst: false, sat: false }; };
      secs.push(['Рум', 'room', rooms.map((r, k) => [k, r]), (i) => c.room[i]]);
      secs.push(['Баунти', 'bounty', BOUNTY.map((l, k) => [String(k), l]), (i) => tourCls(i).myst ? 2 : c.type && c.type[i] === 1 ? 1 : 0]);
      secs.push(['Скорость', 'speed', SPEED.map((l, k) => [String(k), l]), (i) => tourCls(i).speed]);
      secs.push(['Бай-ин', 'bi', BI.slice(1), (i) => biBand(c.bi ? c.bi[i] : -1) - 1]);
      secs.push(['Стол', 'tbl', [['1', '6-max и меньше'], ['2', '7–8-max'], ['3', '9-max']], (i) => tblOf(c.tmx ? c.tmx[i] : 0) - 1]);
      secs.push(['Тип', 'kind', KIND.map((l, k) => [String(k), l]), (i) => tourCls(i).sat ? 1 : 0]);
      const tb = el('table', 'rs-table'); const th = el('thead'); const hr = el('tr');
      ['', 'Раздач', 'Турниров', 'EV/100', 'Факт/100', 'Везение'].forEach((t, q) => { const h = el('th', q ? 'num' : null, t); h.scope = 'col'; hr.append(h); }); th.append(hr); tb.append(th);
      const body = el('tbody');
      for (const [name, fk, opts, keyOf] of secs) {
        const K = opts.length, ge = groups(D, X, keyOf, K, { vals: X.ev, ci: false }), gn = groups(D, X, keyOf, K, { vals: X.net, ci: false });
        const tours = opts.map(() => new Set()); X.idx.forEach(i => { const k = keyOf(i); if (k >= 0 && k < K && D.tour[i] >= 0) tours[k].add(D.tour[i]); });
        if (ge.filter(r => r.n).length < 1) continue;
        const sh = el('tr', 'rs-sec'); const sc = el('th', null, name); sc.colSpan = 6; sc.scope = 'colgroup'; sh.append(sc); body.append(sh);
        opts.forEach(([val, lab], k) => {
          const r = ge[k]; if (!r.n) return;
          const tr = el('tr', String(F[fk]) === String(val) ? 'on' : null); tr.tabIndex = 0;
          const act = () => { stay(cF); F[fk] = String(F[fk]) === String(val) ? DEF[fk] : (typeof DEF[fk] === 'number' ? +val : val); saveF(); draw(); };
          tr.onclick = act; tr.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } };
          const luck = gn[k].v - ge[k].v;
          const cells = [lab, num(r.n), num(tours[k].size), fmt(ge[k].v), fmt(gn[k].v), fmt(luck)];
          cells.forEach((t, q) => { const td = el(q ? 'td' : 'th', q ? 'num' + (q === 3 || q === 4 ? (t[0] === '−' ? ' neg' : ' pos') : '') : null, t); if (!q) td.scope = 'row'; tr.append(td); });
          body.append(tr);
        });
      }
      tb.append(body); const wrap = el('div', 'rs-table-w'); wrap.append(tb); cF.append(nH < MINN ? lack() : wrap);
      cF.append(note('Везение — факт минус EV (олл-ины, которые выиграли или проиграли сверх ожидания).'));
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
      // ---- общие кирпичики простых блоков: строки «к вашему среднему», сетка-сочетаний, вывод сверху ----
      const HV = '«К вашему среднему» — лучше или хуже вы играете в этой ситуации, чем обычно (что такое «ваш средний» — в подсказке «в тех же ситуациях»): немного (3–8 BB/100), заметно (8–15), сильно (15+); «как в среднем» — меньше 3. Насыщенный цвет — надёжно, бледный — может быть случайностью; «мало данных» — меньше 5 сессий или 300 раздач; «не ясно» — результат слишком скачет (погрешность больше ±20 BB/100).';
      const dv = (r) => fmt(r.raw != null ? r.raw : r.v, 1);
      const vk = (r) => verdictOf(r, 0)[0];
      const split = (rows) => { const ev = rows.filter(r => r.n && !['small', 'none'].includes(vk(r))); return { ev, bad: ev.filter(r => vk(r) === 'down'), good: ev.filter(r => vk(r) === 'up'), sb: ev.filter(r => vk(r) === 'down-soft'), sg: ev.filter(r => vk(r) === 'up-soft') }; };
      const headTo = (cd, hb, hc, ht, avg) => { const h = el('div', 'rs-head2'); h.append(el('b', hc, hb), el('span', null, ht)); cd.append(h); if (avg !== false) cd.append(avgLine()); };
      const sesTip = (r) => num(r.n) + ' раздач, ' + r.ses + ' ' + plural(r.ses, 'сессия', 'сессии', 'сессий') + (Number.isFinite(r.se) ? ' · погрешность ±' + (1.96 * r.se).toFixed(0) + ' BB/100' : '');
      // строки: название | к вашему среднему | раздач | BB/100 к среднему
      const cmpRows = (rows, first, opt) => {
        opt = opt || {}; const V = opt.verdict || ((r) => verdictOf(r, 0)), val = opt.val || dv;
        const tb = el('div', 'rs-rows rs-rows-c'); const hdr = el('div', 'rs-row rs-row-h'); [first, opt.chipT || 'К вашему среднему', 'Раздач', opt.valT || 'BB/100 к среднему'].forEach(t => hdr.append(el('span', null, t))); tb.append(hdr);
        rows.forEach(r => { if (!r.n) return; const [cls, txt] = V(r), row = el('div', 'rs-row' + (cls === 'small' ? ' small' : ''));
          row.append(el('b', null, r.label), el('span', 'rs-chip ' + cls, txt), el('span', 'num dim', num(r.n)), el('span', 'num ' + (cls === 'small' ? 'dim' : (r.raw != null ? r.raw : r.v) >= 0 ? 'pos' : 'neg'), cls === 'small' ? '—' : val(r)));
          row.title = r.label + ': ' + sesTip(r); tb.append(row); });
        return tb;
      };
      // сетка сочетаний: строки × столбцы, в клетке — число и подпись (как в «По ходу сессии»)
      const matrix = (rowL, colL, get, opt) => {
        opt = opt || {}; const V = opt.verdict || ((r) => verdictOf(r, 0)), val = opt.val || dv;
        const m = el('div', 'rs-mx'); m.style.gridTemplateColumns = 'minmax(56px,auto) repeat(' + colL.length + ',minmax(0,1fr))';
        m.append(el('span', 'rs-mx-h', opt.corner || '')); colL.forEach(c => m.append(el('span', 'rs-mx-h', c)));
        rowL.forEach((rl, a) => { m.append(el('span', 'rs-mx-r', rl)); colL.forEach((cl, b) => { const r = get(a, b); if (!r || !r.n) { m.append(el('div', 'rs-tl-c none')); return; } const [cls, txt] = V(r); const c = el('div', 'rs-tl-c ' + cls); c.dataset.lab = rl + ' · ' + cl; c.append(el('b', null, cls === 'small' ? '—' : val(r)), el('small', null, txt)); if (opt.showN) c.append(el('em', null, num(r.n) + ' р.')); c.title = rl + ' · ' + cl + ': ' + sesTip(r); m.append(c); }); });
        const w = el('div', 'rs-mx-w'); w.append(m); return w;
      };
      // вывод по сочетаниям: самые слабые и сильные надёжные, иначе — заметные, но не доказанные
      const mxHead = (cells, advice) => {
        const all = cells.filter(x => x.r && x.r.n), ev = all.filter(x => !['small', 'none'].includes(vk(x.r)));
        const by = (k, s) => ev.filter(x => vk(x.r) === k).sort((p, q) => s * (p.r.v - q.r.v));
        const bad = by('down', 1), good = by('up', -1), sb = by('down-soft', 1), sg = by('up-soft', -1);
        const L = (a) => a.slice(0, 4).map(x => x.label + ' (' + dv(x.r) + ')').join(', ');
        const cnt = ' Оценить можно ' + ev.length + ' ' + plural(ev.length, 'сочетание', 'сочетания', 'сочетаний') + ' из ' + all.length + ', в остальных мало данных.';
        if (bad.length) return ['Хуже всего: ' + L(bad), 'neg', 'Надёжно хуже вашего среднего, в BB/100.' + (good.length ? ' Лучше всего: ' + L(good) + '.' : '') + (advice ? ' ' + advice : '') + cnt];
        if (good.length) return ['Лучше всего: ' + L(good), 'pos', 'Надёжно лучше вашего среднего, в BB/100. Надёжных провалов нет.' + cnt];
        const soft = [...sb.slice(0, 3), ...sg.slice(0, 3)].map(x => x.label + ' — ' + verdictOf(x.r, 0)[1] + ' (' + dv(x.r) + ')');
        return [ev.length ? 'Надёжных отличий нет' : 'Пока без вывода', null, (ev.length ? 'Все сочетания в пределах случайности.' + (soft.length ? ' Не доказано, но заметно: ' + soft.join(', ') + '.' : '') : 'Ни в одном сочетании не хватает данных.') + (ev.length ? cnt : '')];
      };
      // #15 после крупного проигрыша: короткие отрезки — тильт виден в первые минуты, на длинном отрезке растворяется
      {
        const cA = card('После крупного проигрыша', 'Проверка на тильт: как вы играете в первые минуты после проигранной раздачи на ' + thr + '+ BB (на любом столе).', false, 'Строки — сколько минут прошло после крупного проигрыша: 0–5, 5–10 и 10–15 минут. Тильт обычно виден сразу, поэтому отрезки короткие. «Обычно» — все остальные раздачи (больше 15 минут после проигрыша или без него).\n\nПорог крупного проигрыша можно выбрать: 25, 40 или 70 BB.\n\n' + HV);
        const sg = el('div', 'seg bx-seg'); [[25, '25+ BB'], [40, '40+ BB'], [70, '70+ BB']].forEach(([v, l]) => { const b = el('button', thr === v ? 'on' : null, l); b.type = 'button'; b.onclick = () => { F.tilt = v; saveF(); draw(); }; sg.append(b); }); cA.append(sg);
        const L = ['Обычно', '0–5 мин', '5–10 мин', '10–15 мин'];
        const g = groups(D, X, (i) => { const lt0 = lastBefore(sesLoss.get(D.ses[i]) || [], D.t[i], true); if (lt0 == null) return 0; const d = D.t[i] - lt0; return d < 5 ? 1 : d < 10 ? 2 : d < 15 ? 3 : 0; }, 4);
        g.forEach((r, q) => { r.label = L[q]; });
        if (!g.slice(1).some(r => r.n >= MINN)) cA.append(lack());
        else {
          const after = g.slice(1).filter(r => r.n), { ev, bad, sb } = split(after);
          const worst = ev.length ? ev.reduce((a, b) => (b.raw != null ? b.raw : b.v) < (a.raw != null ? a.raw : a.v) ? b : a) : null;
          let hb, hc = null, ht;
          if (!ev.length) { hb = 'Мало данных о минутах после проигрыша'; ht = 'Раздач в первые 15 минут после проигрыша на ' + thr + '+ BB — ' + num(after.reduce((a, r) => a + r.n, 0)) + ', оценить тильт пока нельзя.'; }
          else if (bad.length) { hb = 'Похоже на тильт'; hc = 'neg'; ht = bad.map(r => r.label + ' после проигрыша — ' + verdictOf(r, 0)[1] + ' обычного (' + dv(r) + ' BB/100)').join('; ') + '. После такого банка стоит сделать паузу на пару минут или не открывать новые столы.'; }
          else if (sb.length) { hb = 'Возможен тильт — пока не доказан'; hc = 'warn'; ht = sb.map(r => r.label + ' — ' + verdictOf(r, 0)[1] + ' (' + dv(r) + ' BB/100)').join('; ') + '. Разница может быть случайностью — стоит последить.'; }
          else { hb = 'Тильта не видно'; hc = 'pos'; ht = 'В первые 15 минут после проигрыша на ' + thr + '+ BB вы играете в пределах обычного' + (worst ? ': худший отрезок — ' + worst.label + ' (' + dv(worst) + ' BB/100 к вашему среднему).' : '.'); }
          headTo(cA, hb, hc, ht); cA.append(cmpRows(g, 'После проигрыша'));
        }
        grid.append(cA);
      }
      if (await step()) return;
      // #16 открытие новых турниров: сколько минут прошло и сколько турниров открыто разом
      {
        const others = (i) => { const st = sesStart.get(D.ses[i]) || [], out = []; for (let k = st.length - 1; k >= 0; k--) { if (st[k][0] > D.t[i]) continue; if (D.t[i] - st[k][0] >= 30) break; if (st[k][1] !== D.tour[i]) out.push(D.t[i] - st[k][0]); } return out; };
        const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
        const LT = ['Без новых турниров', '0–5 мин', '5–15 мин', '15–30 мин'], LC = ['Ни одного', '1 новый', '2 новых', '3+ новых'];
        const g = groups(D, X, (i) => { const o = others(i); if (!o.length) return 0; const d = Math.min(...o); return d < 5 ? 1 : d < 15 ? 2 : 3; }, 4);
        const gC = groups(D, X, (i) => { const o = others(i).filter(d => d < 10).length; return Math.min(3, o); }, 4);
        g.forEach((r, q) => { r.label = LT[q]; }); gC.forEach((r, q) => { r.label = LC[q]; });
        const cN = card('Когда открываете новые турниры', 'Как вы играете на остальных столах, пока садитесь за новые турниры — за один и за несколько сразу.', true, 'Левая таблица — сколько минут прошло с момента, когда открылся новый турнир. Правая — сколько новых турниров вы открыли за последние 10 минут: один, два или три и больше. Считаются раздачи на остальных столах: проверка, отвлекают ли регистрация и новые столы.\n\n«Без новых турниров» / «Ни одного» — за последние 30 / 10 минут новых турниров не было.\n\n' + HV);
        if (!g.slice(1).some(r => r.n >= MINN) && !gC.slice(1).some(r => r.n >= MINN)) cN.append(lack());
        else {
          const c1 = split(gC.slice(1)), t1 = split(g.slice(1)); let hb, hc = null, ht;
          const many = gC.slice(2).filter(r => r.n), manyEv = many.filter(r => !['small', 'none'].includes(vk(r)));
          if (c1.bad.length || t1.bad.length) { const bb = [...c1.bad, ...t1.bad]; hb = 'Новые турниры отвлекают'; hc = 'neg'; ht = cap(bb.map(r => (gC.includes(r) ? r.label.replace('новый', 'новый турнир').replace('новых', 'новых турнира') + ' за 10 минут' : 'первые ' + r.label + ' после открытия') + ' — ' + verdictOf(r, 0)[1] + ' (' + dv(r) + ' BB/100)').join('; ')) + '. Регистрируйтесь заранее или по одному турниру, а не пачкой.'; }
          else if (c1.sb.length || t1.sb.length) { const bb = [...c1.sb, ...t1.sb]; hb = 'Возможно, новые турниры отвлекают — пока не доказано'; hc = 'warn'; ht = cap(bb.map(r => (gC.includes(r) ? r.label.replace('новый', 'новый турнир').replace('новых', 'новых турнира') + ' за 10 минут' : 'первые ' + r.label + ' после открытия') + ' — ' + verdictOf(r, 0)[1] + ' обычного (' + dv(r) + ' BB/100)').join('; ')) + '. Может быть случайностью — стоит последить.'; }
          else { hb = 'Новые турниры не мешают игре'; hc = 'pos'; ht = 'И после одного нового турнира, и после нескольких сразу вы играете в пределах обычного.' + (many.length && !manyEv.length ? ' Для 2–3 турниров за 10 минут данных пока мало — вывод только по одному.' : ''); }
          headTo(cN, hb, hc, ht);
          const two = el('div', 'rs-two'); two.append(cmpRows(g, 'После открытия'), cmpRows(gC, 'Открыто за 10 мин')); cN.append(two);
        }
        grid.append(cN);
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
        // блок пока отключён: таблицы tbl(...) вернуть сюда, когда будет готова новая версия
        const cZ = card('Стиль игры: усталость и многостол', 'Меняется ли ваша игра (а не только результат) к концу сессии и при большом числе столов.', true);
        const soon = el('div', 'rs-soon'); soon.append(el('b', null, 'Будет позже'), el('span', null, 'Этот блок дорабатывается и появится в одном из следующих обновлений.'));
        cZ.append(soon); grid.append(cZ); void tbl;
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
      // #21 сочетание обычных и быстрых (турбо + гипер) столов: какое даёт больше всего EV в час без потери качества
      {
        const RB = ['0', '1–2', '3–4', '5–6', '7+'], FB = ['0', '1–2', '3–4', '5+'], rb = (n) => n <= 0 ? 0 : n <= 2 ? 1 : n <= 4 ? 2 : n <= 6 ? 3 : 4, fb = (n) => n <= 0 ? 0 : n <= 2 ? 1 : n <= 4 ? 2 : 3;
        const fastT = (k) => { const q = D.tours[k][0]; return q >= 0 && D.cls[q] && D.cls[q].speed > 0 ? 1 : 0; };
        // все турниры этого ника: события «открылся / закрылся» с признаком скорости
        const al = (typeof state !== 'undefined' && D.db.aliases && D.db.aliases.length > 1 && c.aid) ? state.alias : -1, tAl = new Set(); if (al >= 0) { for (let i = 0; i < D.n; i++) if (D.tour[i] >= 0 && c.aid[i] === al) tAl.add(D.tour[i]); }
        const evs = []; D.tours.forEach((x, k) => { if (al >= 0 && !tAl.has(k)) return; const f = fastT(k); evs.push([x[1], 1, f], [x[2] + 1, -1, f]); }); evs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        // сочетание у каждой раздачи
        const combo = new Int8Array(X.idx.length).fill(-1); { const ord = X.idx.map((i, j) => j).sort((p, q) => D.t[X.idx[p]] - D.t[X.idx[q]]); let e = 0, nR = 0, nF = 0; for (const j of ord) { const t = D.t[X.idx[j]]; while (e < evs.length && evs[e][0] <= t) { const [, d, f] = evs[e++]; if (f) nF += d; else nR += d; } combo[j] = rb(nR) * 4 + fb(nF); } }
        // время на каждом сочетании — по минутам выбранных сессий
        const cm = new Float64Array(20); { const ss = [...sesSet].map(s => D.sessions[s]).sort((a, b) => a[0] - b[0]); let e = 0, nR = 0, nF = 0; for (const z of ss) for (let t = z[0]; t <= z[1]; t++) { while (e < evs.length && evs[e][0] <= t) { const [, d, f] = evs[e++]; if (f) nF += d; else nR += d; } if (nR + nF > 0) cm[rb(nR) * 4 + fb(nF)]++; } }
        const key = (i, j) => combo[j];
        const g = groups(D, X, key, 20, {}), gE = groups(D, X, key, 20, { vals: X.ev, ci: false, shrink: false });
        const lab = (k) => { const r = Math.floor(k / 4), f = k % 4; return r && f ? RB[r] + ' обычных + ' + FB[f] + ' турбо' : r ? 'только обычные, ' + RB[r] : 'только турбо, ' + FB[f]; };
        g.forEach((r, k) => { r.label = lab(k); r.hours = cm[k] / 60; r.evh = cm[k] ? gE[k].sum / cm[k] * 60 : NaN; r.nr = Math.floor(k / 4); r.nf = k % 4; });
        const c1 = card('Сколько турбо добавлять к обычным столам', 'Какое сочетание обычных и турбо-столов даёт больше всего EV в час без потери качества игры.', true, 'В каждой строке — сколько обычных и сколько быстрых турниров (турбо и гипер вместе) было открыто одновременно.\n\n«К вашему среднему» — лучше или хуже вы играете при таком сочетании, чем обычно. «EV в час» — сколько BB в час приносят все столы вместе при таком сочетании; если наиграно меньше 2 часов, не показывается. «Часов» — сколько вы так наиграли.\n\nРекомендация — сочетание с наибольшим EV в час, где игра не хуже среднего и наиграно 10+ часов.\n\n' + HV);
        const rows = g.filter(r => r.n).sort((a, b) => a.nr - b.nr || a.nf - b.nf);
        if (!rows.some(r => r.n >= MINN)) c1.append(lack());
        else {
          const ok = rows.filter(r => r.n >= MINN && r.hours >= 10 && Number.isFinite(r.evh) && !['down', 'small'].includes(vk(r))), best = ok.length ? ok.reduce((a, b) => b.evh > a.evh ? b : a) : null;
          const bad = rows.filter(r => vk(r) === 'down'), soft = rows.filter(r => vk(r) === 'down-soft');
          const noF = ok.filter(r => r.nf === 0), bestNoF = noF.length ? noF.reduce((a, b) => b.evh > a.evh ? b : a) : null;
          let hb, hc = null, ht = '';
          if (best) { hb = 'Оптимально: ' + best.label; hc = 'pos'; ht = 'Здесь больше всего EV в час — ' + fmt(best.evh, 1) + ' BB/ч (' + Math.round(best.hours) + ' ч игры).' + (best.nf > 0 && bestNoF ? ' Без турбо лучший вариант — ' + bestNoF.label.replace('только обычные, ', '') + ' обычных: ' + fmt(bestNoF.evh, 1) + ' BB/ч, то есть турбо ' + (best.evh > bestNoF.evh ? 'добавляют' : 'не добавляют') + ' EV в час.' : best.nf === 0 ? ' Турбо-столы к обычным EV в час пока не добавляют — или их наиграно меньше 10 часов.' : ''); }
          else { hb = 'Пока без рекомендации'; ht = 'Нужно хотя бы 10 часов игры на каком-то сочетании без потери качества.'; }
          if (bad.length) { ht += ' Качество игры надёжно падает: ' + bad.map(r => r.label + ' (' + dv(r) + ' BB/100)').join(', ') + '.'; if (!best) hc = 'neg'; }
          else if (soft.length) ht += ' Возможно, хуже (не доказано): ' + soft.slice(0, 3).map(r => r.label + ' (' + dv(r) + ')').join(', ') + '.';
          headTo(c1, hb, hc, ht);
          const tb = el('div', 'rs-rows rs-rows-p'); const hdr = el('div', 'rs-row rs-row-h'); ['Сочетание', 'К вашему среднему', 'Раздач', 'EV в час', 'Часов'].forEach(t => hdr.append(el('span', null, t))); tb.append(hdr);
          rows.forEach(r => { const [cls, txt] = verdictOf(r, 0), row = el('div', 'rs-row' + (cls === 'small' ? ' small' : '') + (r === best ? ' rec' : '')); const nm = el('b', null, r.label); if (r === best) nm.append(el('em', null, 'оптимально')); row.append(nm, el('span', 'rs-chip ' + cls, txt), el('span', 'num dim', num(r.n)), el('span', 'num ' + (r.hours < 2 ? 'dim' : r.evh >= 0 ? 'pos' : 'neg'), r.hours >= 2 && Number.isFinite(r.evh) ? fmt(r.evh, 1) : '—'), el('span', 'num dim', r.hours >= 1 ? Math.round(r.hours) : '<1')); row.title = r.label + ': ' + sesTip(r); tb.append(row); });
          c1.append(tb);
        }
        grid.append(c1);
      }
      if (await step()) return;
      // #22 бай-ин × рум
      {
        const BIL = BI.slice(1).map(x => x[1]);
        const g2 = groups(D, X, (i) => { const b = biBand(c.bi ? c.bi[i] : -1); return b < 1 ? -1 : c.room[i] * 5 + b - 1; }, rooms.length * 5, {});
        const usedR = rooms.map((_, r) => g2.slice(r * 5, r * 5 + 5).some(x => x.n) ? r : -1).filter(r => r >= 0);
        const c2 = card('Бай-ин × рум', 'В каком руме какие бай-ины у вас получаются лучше.', true, 'Строки — рум, столбцы — бай-ин ($ / €).\n\nЧисло в клетке — на сколько BB/100 вы играете лучше (плюс) или хуже (минус) своего среднего, ниже — подпись и сколько раздач сыграно. Наведите на клетку — сколько сессий и погрешность.\n\n' + HV);
        if (!g2.some(r => r.n >= MINN)) c2.append(lack());
        else {
          const [hb, hc, ht] = mxHead(g2.map((r, k) => ({ r, label: (rooms[Math.floor(k / 5)] || '') + ' ' + BIL[k % 5] })), 'Эти бай-ины в этом руме стоит разобрать или играть реже.');
          headTo(c2, hb, hc, ht); c2.append(matrix(usedR.map(r => rooms[r]), BIL, (a, b) => g2[usedR[a] * 5 + b], { corner: 'рум', showN: true }));
        }
        grid.append(c2);
      }
      if (await step()) return;
      // #23 один рум или несколько одновременно
      {
        const ev2 = []; D.tours.forEach((x, k) => { const room = D.titles[x[0]] ? D.titles[x[0]].room : -1; ev2.push([x[1], 1, room], [x[2] + 1, -1, room]); }); ev2.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        const ord = X.idx.map((i, j) => j).sort((p, q) => D.t[X.idx[p]] - D.t[X.idx[q]]); const nr = new Int8Array(X.idx.length); const cnt = new Map(); let e = 0;
        for (const j of ord) { const t = D.t[X.idx[j]]; while (e < ev2.length && ev2[e][0] <= t) { const [, d, r] = ev2[e++]; cnt.set(r, (cnt.get(r) || 0) + d); } let k = 0; for (const v of cnt.values()) if (v > 0) k++; nr[j] = Math.max(1, Math.min(3, k)); }
        const g = groups(D, X, (i, j) => nr[j] - 1, 3); g.forEach((r, q) => { r.label = ['Только 1 рум', '2 рума сразу', '3+ рума сразу'][q]; r.short = ['одном руме', 'двух румах', 'трёх и больше румах'][q]; });
        const cM = card('Один рум или несколько', 'Мешает ли игре, когда одновременно открыто несколько покерных клиентов (например, GG и PokerStars).', false, 'Рум считается открытым, пока в нём идёт хотя бы один ваш турнир. Строки — сколько румов было открыто в момент раздачи: «Только 1 рум» — все столы в одном клиенте; «2 рума сразу» — столы в двух клиентах одновременно и т. д.\n\nРазные клиенты — это разные окна, кнопки, таймбанки и настройки: если внимание рассеивается, качество игры падает. Этот блок показывает, есть ли у вас такая потеря.\n\nКак делается вывод: игра в нескольких румах сразу сравнивается напрямую с игрой в одном руме (в BB/100 к вашему среднему, с поправкой на стек и позицию).\n— «Мультирум мешает» — в нескольких румах хуже на 3+ BB/100, и разница больше погрешности (надёжно).\n— «Возможно, мешает» — хуже на 3+ BB/100, но в пределах погрешности.\n— «Не мешает» — разница меньше 3 BB/100 или в пределах случайности.\nДля вывода нужно хотя бы 300 раздач и 5 сессий в каждом варианте. Погрешность — 95% интервал с учётом того, что раздачи одной сессии связаны.\n\nСтроки ниже — каждый вариант против вашего среднего.\n\n' + HV);
        if (!g.some(r => r.n >= MINN)) cM.append(lack());
        else {
          const tot = g.reduce((x, r) => x + r.n, 0), main = g.reduce((x, r) => r.n > x.n ? r : x), shareTxt = 'Чаще всего вы играете в ' + main.short + ' (' + Math.round(main.n / tot * 100) + '% раздач). ';
          // прямое сравнение: несколько румов сразу против одного (а не каждого варианта со средним)
          const g2 = groups(D, X, (i, j) => nr[j] > 1 ? 1 : 0, 2, { shrink: false }), one = g2[0], multi = g2[1];
          const okC = one.n >= MINN && multi.n >= MINN && one.ses >= 5 && multi.ses >= 5 && Number.isFinite(one.se) && Number.isFinite(multi.se);
          const d = okC ? multi.v - one.v : NaN, se = okC ? Math.sqrt(one.se ** 2 + multi.se ** 2) : NaN, sig = okC && Math.abs(d) > 1.96 * se;
          let hb, hc = null, ht;
          if (!okC) { hb = 'Сравнивать пока не с чем'; ht = shareTxt + 'Для сравнения нужно хотя бы 300 раздач и 5 сессий и в одном руме, и в нескольких сразу.'; }
          else if (d <= -3 && sig) { hb = 'Мультирум вам мешает'; hc = 'neg'; ht = shareTxt + 'В нескольких румах сразу вы играете на ' + Math.abs(d).toFixed(1) + ' BB/100 хуже, чем в одном (погрешность ±' + (1.96 * se).toFixed(1) + ') — это надёжно. Совет: держите столы в одном клиенте или открывайте второй рум только на ранних стадиях.'; }
          else if (d <= -3) { hb = 'Возможно, мультирум мешает — пока не доказано'; hc = 'warn'; ht = shareTxt + 'В нескольких румах сразу — на ' + Math.abs(d).toFixed(1) + ' BB/100 хуже, чем в одном, но погрешность ±' + (1.96 * se).toFixed(1) + ' BB/100: это может быть случайностью. Стоит последить.'; }
          else if (d >= 3 && sig) { hb = 'С несколькими румами вы играете даже лучше'; hc = 'pos'; ht = shareTxt + 'На ' + d.toFixed(1) + ' BB/100 лучше, чем в одном руме (погрешность ±' + (1.96 * se).toFixed(1) + '). Возможно, в нескольких румах вы выбираете более мягкие турниры.'; }
          else { hb = 'Мультирум не мешает'; hc = 'pos'; ht = shareTxt + 'Разница между игрой в одном руме и в нескольких сразу — ' + fmt(d, 1) + ' BB/100 (погрешность ±' + (1.96 * se).toFixed(1) + '): ' + (Math.abs(d) < 3 ? 'меньше 3 BB/100, это практически одно и то же.' : 'в пределах случайности.') + ' Можно спокойно комбинировать румы.'; }
          headTo(cM, hb, hc, ht); cM.append(cmpRows(g, 'Открыто'));
        }
        grid.append(cM);
      }
      if (await step()) return;
      // #25 все сессии: итог, лучшие и худшие
      {
        const S = new Map(); X.idx.forEach((i, j) => { const s = D.ses[i]; const z = S.get(s) || { n: 0, sum: 0 }; z.n++; z.sum += raw[j]; S.set(s, z); });
        const pts = [...S].map(([s, z]) => { const q = D.sessions[s], h = (q[1] - q[0]) / 60, d = new Date((q[0] - tzOff(q[0])) * 60000); return { s, x: h, y: z.sum, n: z.n, tip: d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) + ', ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') + ' · ' + h.toFixed(1) + ' ч · ' + num(z.n) + ' раздач' }; });
        const cP = card('Все сессии', 'Чего ждать от одной сессии: как часто она в плюсе, на чём держится итог и какие серии минусов для вас нормальны.', true, 'Сессия — игра без перерыва больше 45 минут. Итог сессии — сумма EV в BB по её раздачам под текущие фильтры.\n\nМедиана — типичная сессия: половина сессий лучше, половина хуже. Она меньше зависит от одной-двух очень удачных сессий, чем среднее.\n\n«Лучшие 10% дают …% EV» — насколько ваш плюс зависит от редких глубоких проходов. Чем больше эта доля, тем чаще обычные сессии будут около нуля или в минусе, и тем длиннее нормальные серии минусов.');
        if (pts.length < 3 || nH < MINN) cP.append(lack());
        else {
          const srt = pts.slice().sort((a, b) => b.y - a.y), pos = pts.filter(p => p.y > 0).length, share = Math.round(pos / pts.length * 100);
          const avg = pts.reduce((a, p) => a + p.y, 0) / pts.length, med = srt[Math.floor(srt.length / 2)].y, avgH = pts.reduce((a, p) => a + p.x, 0) / pts.length;
          // что даёт этот блок: как часто сессия в плюсе, насколько итог держится на редких заносах, какие серии минусов нормальны
          const tot = pts.reduce((x, p) => x + p.y, 0), top = srt.slice(0, Math.max(1, Math.round(pts.length * 0.1))), topSum = top.reduce((x, p) => x + p.y, 0);
          const chron = pts.slice().sort((p, q) => D.sessions[p.s][0] - D.sessions[q.s][0]); let nr = 0, nrMax = 0; chron.forEach(p => { if (p.y <= 0) { nr++; nrMax = Math.max(nrMax, nr); } else nr = 0; });
          const topTxt = tot > 0 ? 'Лучшие ' + top.length + ' ' + plural(top.length, 'сессия', 'сессии', 'сессий') + ' (10%) дают ' + Math.round(topSum / tot * 100) + '% всего вашего EV' + (topSum / tot > 0.7 ? ' — плюс держится на редких глубоких проходах, а в обычной сессии вы скорее около нуля или в минусе.' : topSum / tot > 0.4 ? ' — заметная часть плюса приходит из редких удачных сессий.' : ' — плюс распределён ровно, а не держится на нескольких заносах.') : 'Итог по сессиям в минусе: одна удачная сессия его не исправляет.';
          const sub = 'В среднем сессия приносит ' + fmt(avg, 0) + ' BB по EV, типичная (медиана) — ' + fmt(med, 0) + ' BB, средняя длина ' + avgH.toFixed(1) + ' ч. ' + topTxt + ' Самая длинная серия минусовых сессий подряд — ' + nrMax + '. ' + (avg > 0 ? 'Вывод: минусовая сессия для вас — обычное дело (' + (100 - share) + '% сессий), даже при плюсовой игре. Не судите об игре по одной сессии и не меняйте стратегию после серии до ' + nrMax + ' минусовых подряд — такое у вас уже бывало при общем плюсе.' : 'Вывод: в среднем сессия в минусе — смотрите блоки выше, где именно теряется EV.');
          headTo(cP, (avg > 0 ? 'Сессия в плюсе в ' : 'Сессия в плюсе только в ') + share + '% случаев (' + pos + ' из ' + pts.length + ')', share >= 55 ? 'pos' : share < 45 ? 'neg' : null, sub, false);
          const lst = el('div', 'rs-best rs-two'); const block = (title, arr, cls) => { const b = el('div'); b.append(el('h4', null, title)); const ol = el('ol'); arr.forEach(p => { const li = el('li'); li.append(el('b', cls, fmt(p.y, 0) + ' BB'), document.createTextNode(' — ' + p.tip)); ol.append(li); }); b.append(ol); return b; };
          lst.append(block('Лучшие сессии', srt.slice(0, 5), 'pos'), block('Худшие сессии', srt.slice(-5).reverse(), 'neg')); cP.append(lst);
        }
        grid.append(cP);
      }
      if (await step()) return;
    }
    // ---- выводы ----
    {
      const ins = [];
      const add = (cls, title, text, r) => ins.push({ cls, title, text, badge: r ? (sure(r) ? 'надёжно' : 'тенденция') : null });
      if (T_HEAD) add(T_HEAD.cls, T_HEAD.title, T_HEAD.text, null);
      if (H_HEAD) add(H_HEAD.cls, H_HEAD.title, H_HEAD.text, null);
      if (D_HEAD) add(D_HEAD.cls, D_HEAD.title, D_HEAD.text, null);
      if (L_HEAD) add(L_HEAD.cls, L_HEAD.title, L_HEAD.text, null);
      const s01 = gS.slice(0, 2).reduce((a, r) => [a[0] + r.sum, a[1] + r.n], [0, 0]), sLate = gS.slice(5).reduce((a, r) => [a[0] + r.sum, a[1] + r.n], [0, 0]);
      if (S_HEAD) add(S_HEAD.cls, S_HEAD.title, S_HEAD.text, null);
      const luck = (netS - evS) / nH * 100; add(luck >= 0 ? 'good' : 'bad', luck >= 0 ? 'Вам везёт' : 'Вам не везёт', 'Факт отличается от EV на ' + fmt(luck) + ' BB/100 — это олл-ины, не ваша игра.', null);
      const list = el('div', 'rs-ins');
      ins.forEach(x => { const d = el('div', 'rs-in ' + x.cls); const h = el('b', null, x.title); if (x.badge) h.append(el('em', x.badge === 'надёжно' ? 'sure' : null, x.badge)); d.append(h, el('p', null, x.text)); list.append(d); });
      cI.lastChild.remove(); cI.append(nH < MINN ? lack() : list);
    }
    grid.querySelectorAll(':scope > .rs-card').forEach(cd => { if (cd.querySelector('.rs-lack') && !cd.querySelector('svg.rs-svg, table')) cd.querySelectorAll('.rs-leg, .rs-verdict').forEach(x => x.remove()); });
    // номера блоков — чтобы было удобно обсуждать, что убрать или поменять
    { let k = 1; const tag = (node) => { const t = el('span', 'rs-num', '#' + (++k)); node.append(t); }; // #1 — панель фильтров
      if (CUM) tag(CUM.querySelector('.rs-card-h')); tag(kp); grid.querySelectorAll(':scope > .rs-card').forEach(c => tag(c.querySelector('.rs-card-h') || c)); }
    // ---- главные выводы по всем блокам: шапки блоков + заметки из строк и клеток (в т.ч. не доказанные отличия) ----
    {
      const items = { opt: [], neg: [], warn: [], pos: [] }, notesD = [], notesU = [];
      const SKIP = /^(Где вы зарабатываете|Как менялся|Сравнение периодов|Накопленный|Главное|Форматы|Рейтинг|Стиль)/;
      grid.querySelectorAll(':scope > .rs-card').forEach(cd => {
        const t = cd.querySelector('.rs-card-h h3'), nm = t ? t.firstChild.textContent.trim() : '', no = cd.querySelector('.rs-card-h .rs-num'), ref = (no ? no.textContent : '') + ' · ' + nm;
        const h = cd.querySelector('.rs-head2'), b = h && h.querySelector('b');
        if (b) {
          // «Как играть» — блоки-вопросы (столы, длина сессии, дни, время), если в них нет надёжной проблемы
          let cls = b.classList.contains('neg') ? 'neg' : b.classList.contains('warn') ? 'warn' : b.classList.contains('pos') ? 'pos' : null;
          if (cls !== 'neg' && cls !== 'warn' && /\?$/.test(nm)) cls = 'opt';
          if (cls) items[cls].push({ ref, b: b.textContent, s: (h.querySelector('span') || {}).textContent || '' });
        }
        if (SKIP.test(nm)) return;
        // заметки: каждая строка или клетка, которая заметно отличается от вашего среднего
        // подпись строки/клетки — понятной фразой: «2–3 ч» → «2–3 ч от начала сессии», «чт» → «четверг»
        const DFULL = { пн: 'понедельник', вт: 'вторник', ср: 'среда', чт: 'четверг', пт: 'пятница', сб: 'суббота', вс: 'воскресенье' };
        const nice = (l) => /^По ходу/.test(nm) ? l + ' от начала сессии' : /^Сколько столов/.test(nm) ? l + ' ' + plural(+String(l).split('–').pop() || 5, 'стол', 'стола', 'столов') : /длины сессии/.test(nm) ? 'сессии ' + l : /дни/.test(nm) ? (DFULL[l] || l) : /время/.test(nm) ? l + ' по времени суток' : /проигрыша/.test(nm) ? l + ' после крупного проигрыша' : /новые турниры/.test(nm) ? (/мин$/.test(l) ? l + ' после открытия турнира' : l.replace('новый', 'новый турнир').replace('новых', 'новых турнира') + ' за 10 минут') : l;
        const take = (cls, label, verdict, val) => { label = nice(label);
          const down = /^down/.test(cls), solid = !/-soft$/.test(cls), w = /сильно/.test(verdict) ? 3 : /заметно/.test(verdict) ? 2 : 1;
          (down ? notesD : notesU).push({ ref, label, verdict, val, solid, score: (solid ? 10 : 0) + w });
        };
        cd.querySelectorAll('.rs-row:not(.rs-row-h)').forEach(row => { const ch = row.querySelector('.rs-chip'); if (!ch) return; const k = [...ch.classList].find(x => /^(up|down)(-soft)?$/.test(x)); if (!k) return; const nums = row.querySelectorAll('.num'); take(k, row.querySelector('b').firstChild.textContent, ch.textContent, ''); });
        cd.querySelectorAll('.rs-tl-c').forEach(c2 => { const k = [...c2.classList].find(x => /^(up|down)(-soft)?$/.test(x)); if (!k) return; const lab = c2.dataset.lab || (c2.querySelector('.h') || {}).textContent || ''; take(k, lab, (c2.querySelector('small') || {}).textContent || '', (c2.querySelector('b') || {}).textContent || ''); });
      });
      const luck = (netS - evS) / nH * 100, nL = items.neg.length;
      const cS2 = card('Главные выводы', 'Итог по всем блокам выше: как играть оптимально, где вы теряете, за чем следить и что у вас уже получается.', true, 'Выводы собраны из всех блоков страницы под текущие фильтры' + (anyF() ? ' (сейчас фильтры включены — чтобы увидеть выводы по всем раздачам, нажмите «Сбросить»)' : ' — сейчас это все ваши раздачи') + '.\n\n«Как играть оптимально» — выводы о числе столов, длине сессий, днях и времени игры. «Лики» — то, что надёжно хуже вашего среднего: здесь вы теряете EV, исправлять в первую очередь. «Стоит последить» — похоже на проблему, но пока может быть случайностью. «Сильные стороны» — то, что у вас уже получается.\n\n«Где может быть просадка» и «Где может быть плюс» — заметки по отдельным строкам и клеткам блоков: часы, дни, сочетания. Сверху — надёжные и самые сильные отличия; отметка «не доказано» — отличие видно, но на такой выборке может быть случайностью. Номер слева — блок, где смотреть подробности.');
      const lead = el('div', 'rs-head2');
      lead.append(el('b', nL ? 'neg' : 'pos', nL ? 'Найдено ' + nL + ' ' + plural(nL, 'лик', 'лика', 'ликов') + ' — начните с них' : 'Надёжных ликов не найдено'),
        el('span', null, 'По ' + num(nH) + ' ' + plural(nH, 'раздаче', 'раздачам', 'раздачам') + (anyF() ? ' под текущие фильтры' : ' — вся ваша база') + ': EV ' + fmt(evS / nH * 100) + ' BB/100, ' + fmt(evS / (mins / 60)) + ' BB в час. ' + (Math.abs(luck) >= 1 ? 'Факт отличается от EV на ' + fmt(luck) + ' BB/100 — это ' + (luck > 0 ? 'везение' : 'невезение') + ' в олл-инах, не ваша игра. ' : '') + (nL ? 'Исправление ликов — самый быстрый способ поднять EV.' : 'Ниже — что стоит последить, где может быть просадка и на чём держится ваш плюс.')));
      cS2.append(lead);
      const band = (title, cls, sub) => { const d = el('section', 'rs-band ' + cls); const hh = el('div', 'rs-band-h'); hh.append(el('h4', null, title)); if (sub) hh.append(el('span', null, sub)); d.append(hh); return d; };
      const heads = (title, arr, cls, empty) => { const d = band(title, cls, arr.length ? String(arr.length) : ''); const w = el('div', 'rs-band-g'); if (!arr.length) w.append(el('p', 'rs-note', empty)); arr.forEach(x => { const it = el('div', 'rs-sum-i'); it.append(el('span', 'rs-sum-n', x.ref), el('b', null, x.b), el('p', null, x.s)); w.append(it); }); d.append(w); return d; };
      const notes = (title, arr, cls, empty) => {
        const seen = new Set(), list = arr.sort((a, b) => b.score - a.score).filter(x => { const k = x.ref + x.label; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 10);
        const d = band(title, cls, list.length ? String(list.length) : ''); const ul = el('div', 'rs-notes'); if (!list.length) ul.append(el('p', 'rs-note', empty));
        list.forEach(x => { const li = el('div', 'rs-note-i'); const top = el('div'); top.append(el('b', null, x.label), document.createTextNode(' — ' + x.verdict + (x.val && x.val !== '—' ? ' (' + x.val + ' BB/100)' : '')), x.solid ? el('em', 'sure', 'надёжно') : el('em', null, 'не доказано')); li.append(top, el('span', 'rs-sum-n', x.ref)); ul.append(li); });
        d.append(ul); return d;
      };
      if (nH < MINN) cS2.append(lack());
      else {
        const w = el('div', 'rs-bands');
        w.append(heads('Как играть оптимально', items.opt, 'opt', 'Пока без рекомендаций.'));
        const two = el('div', 'rs-band-2'); two.append(heads('Лики — где вы теряете', items.neg, 'neg', 'Надёжных потерь нет.'), heads('Стоит последить', items.warn, 'warn', 'Нечего отметить.')); w.append(two);
        w.append(heads('Сильные стороны', items.pos, 'pos', 'Надёжных сильных сторон пока не видно.'));
        const two2 = el('div', 'rs-band-2'); two2.append(notes('Где может быть просадка', notesD, 'neg', 'Заметных просадок нет ни в одной строке.'), notes('Где может быть плюс', notesU, 'pos', 'Заметных плюсов в отдельных строках нет.')); w.append(two2);
        cS2.append(w);
      }
      grid.append(cS2); const nums = R.querySelectorAll('.rs-num'); cS2.querySelector('.rs-card-h').append(el('span', 'rs-num', '#' + (nums.length + 1)));
    }
    if (gen !== GEN) return;
    R.append(note('Как считается. ' + mName + ' в BB на 100 раздач. «На ситуацию» — из каждой раздачи вычитается ваш ожидаемый результат в такой же ситуации по всей истории: позиция, стек, игроков за столом, размер стола, баунти и анте (редкие ситуации сглажены к общим). «Полная» — дополнительно совместная модель столов, часа сессии, времени суток, дня, длины сессии, скорости и рума: в блоках #4–#8 видно влияние только одного фактора при прочих равных. С поправкой вклад одной раздачи ограничен ±100 BB. Маленькие группы подтянуты к среднему (наведите — видно значение без сглаживания), «надёжно» — с учётом числа сравнений. Ключевые числа (#2), позиции и стек — без поправки. Деньги, ICM и стоимость баунти не учитываются — только фишки.'));
    const nodesNow = [...R.childNodes];
    if (staged) flush(); else { unpad(); toAnchor(R); ANCHOR = null; }
    CACHE.set(ckey, nodesNow); if (CACHE.size > 10) CACHE.delete(CACHE.keys().next().value);
  }
  // данные «Результатов» грузятся заранее, в свободное время после загрузки базы — вкладка открывается без ожидания
  (function pre(k) { if (k > 240) return; if (typeof HERO_DB !== 'undefined' && HERO_DB) { const go = () => load().catch(() => {}); setTimeout(() => (window.requestIdleCallback ? window.requestIdleCallback(go, { timeout: 4000 }) : go()), 1500); return; } setTimeout(() => pre(k + 1), 500); })(0);
  window.MDAResults = { draw, reset: () => { DATA = null; DKEY = null; CACHE.clear(); } };
})();
