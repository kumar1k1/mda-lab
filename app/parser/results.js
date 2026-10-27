'use strict';
// Данные для «Личный кабинет → Результаты»: у каждой вашей раздачи — время, турнир, сколько турниров было открыто
// одновременно, сессия и минута от её начала. Остальное (EV, позиция, стек, рум, бай-ин) окно берёт из колонок базы.
//
// Время. Румы пишут время по-разному: Winamax и WPN — UTC, PokerStars — время компьютера игрока (первое в заголовке),
// GG — зависит от выгрузки (обычно тоже время компьютера). Для румов без UTC берётся часовой пояс компьютера; если сессии
// ясно совпадают с UTC-румами при другом сдвиге (больше часа разницы) — берётся он.
// Сессия: перерыв больше 45 минут. Турнир: рум + номер турнира; пауза больше 90 минут — другой розыгрыш.
const UTC_ROOMS = new Set(['Winamax', 'WPN']);
const SES_GAP = 45, TOUR_GAP = 90;

function minuteOf(d) { const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2})/.exec(d || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000 : -1; }

function compute(base, post) {
  const N = base.meta.count, rooms = base.meta.rooms || [];
  const room = base.column('room'), aidC = base.column('aid'), rpp = base.column('rpp');
  const raw = new Int32Array(N).fill(-1), tid = new Array(N);
  const titleIdx = new Map(), titles = [];
  const ids = []; for (let i = 0; i < N; i++) if (!rpp || rpp[i] >= 0) ids.push(i);
  const STEP = 4000;
  for (let a = 0; a < ids.length; a += STEP) {
    const part = ids.slice(a, a + STEP), R = base.replays(part);
    for (const i of part) {
      const r = R[i]; if (!r) continue;
      raw[i] = minuteOf(r.d);
      const t = r.t || '', num = (/#(\d{5,})/.exec(t) || [])[1];
      const key = room[i] + '|' + (num || t);
      let k = titleIdx.get(key); if (k == null) { k = titles.length; titleIdx.set(key, k); titles.push({ t: t.slice(0, 120), room: room[i] }); }
      tid[i] = k;
    }
    if (post) post({ done: Math.min(ids.length, a + STEP), total: ids.length });
  }
  // сдвиг к UTC: группа = рум + ник (у разных ников одного рума выгрузки бывают разные)
  const nkC = base.column('nk'), grp = (i) => room[i] * 64 + (nkC ? Math.max(0, nkC[i]) : 0);
  const localOff = (m) => new Date(m * 60000).getTimezoneOffset(); // время компьютера → UTC: плюс это число минут
  const ref = new Set(), stat = {}, useEst = new Map();
  for (let i = 0; i < N; i++) if (raw[i] >= 0 && UTC_ROOMS.has(rooms[room[i]])) for (let d = -6; d <= 6; d += 3) ref.add(Math.floor((raw[i] + d) / 3));
  if (ref.size) {
    const G = new Map(); for (let i = 0; i < N; i++) if (raw[i] >= 0 && !UTC_ROOMS.has(rooms[room[i]])) { const g = grp(i); if (!G.has(g)) G.set(g, []); G.get(g).push(raw[i]); }
    for (const [g, ts0] of G) {
      if (ts0.length < 500) continue;
      const ts = ts0.length > 40000 ? ts0.filter((_, j) => j % Math.ceil(ts0.length / 40000) === 0) : ts0;
      let best = 0, bestHit = -1;
      for (let o = -12; o <= 14; o++) { let hit = 0; for (const t of ts) if (ref.has(Math.floor((t - o * 60) / 3))) hit++; if (hit > bestHit) { bestHit = hit; best = o; } }
      const share = bestHit / ts.length, loc = -localOff(ts[0]) / 60;
      // время компьютера — по умолчанию; подбор — только при ясном совпадении и расхождении больше часа
      const use = share >= 0.5 && Math.abs(best - loc) > 1;
      if (use) useEst.set(g, -best * 60);
      stat[rooms[Math.floor(g / 64)] + (nkC ? '#' + (g % 64) : '')] = { hours: best, share: Math.round(share * 100), local: loc, used: use ? 'подбор' : 'время компьютера' };
    }
  }
  const t = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) if (raw[i] >= 0) t[i] = UTC_ROOMS.has(rooms[room[i]]) ? raw[i] : useEst.has(grp(i)) ? raw[i] + useEst.get(grp(i)) : raw[i] + localOff(raw[i]);
  // по каждому алиасу отдельно: турниры (розыгрыши), одновременность, сессии
  const conc = new Int8Array(N), ses = new Int32Array(N).fill(-1), since = new Int32Array(N), tour = new Int32Array(N).fill(-1);
  const sessions = []; // [start, end, aid]
  const tours = []; // [titleIdx, start, end]
  const byAid = new Map(); for (let i = 0; i < N; i++) if (t[i] >= 0) { const a = aidC ? aidC[i] : 0; if (!byAid.has(a)) byAid.set(a, []); byAid.get(a).push(i); }
  for (const [a, list] of byAid) {
    list.sort((x, y) => t[x] - t[y] || x - y);
    const open = new Map();
    for (const i of list) { const k = tid[i]; let cur = open.get(k); if (cur == null || t[i] - tours[cur][2] > TOUR_GAP) { cur = tours.length; tours.push([k, t[i], t[i]]); open.set(k, cur); } tours[cur][2] = t[i]; tour[i] = cur; }
    const ev = []; for (const i of list) { const x = tours[tour[i]]; if (x[1] === t[i] && !x.seen) { x.seen = 1; ev.push([x[1], 1], [x[2] + 1, -1]); } }
    ev.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    let e = 0, c = 0, s = -1;
    for (const i of list) {
      while (e < ev.length && ev[e][0] <= t[i]) c += ev[e++][1];
      conc[i] = Math.max(1, Math.min(127, c));
      if (s < 0 || t[i] - sessions[s][1] > SES_GAP) { s = sessions.length; sessions.push([t[i], t[i], a]); }
      sessions[s][1] = t[i]; ses[i] = s; since[i] = t[i] - sessions[s][0];
    }
  }
  return {
    n: N, t, conc, ses, since, tour,
    tours: tours.map(x => [x[0], x[1], x[2]]), titles, sessions,
    tz: stat
  };
}

// в окно: массивы — байтами
function pack(res) {
  const b = (ta) => new Uint8Array(ta.buffer, ta.byteOffset, ta.byteLength);
  return { n: res.n, t: b(res.t), conc: b(res.conc), ses: b(res.ses), since: b(res.since), tour: b(res.tour), tours: res.tours, titles: res.titles, sessions: res.sessions, tz: res.tz };
}
module.exports = { compute, pack, minuteOf };
