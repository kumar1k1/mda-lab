'use strict';
// Разбор турнирных историй раздач: PokerStars (и экспорт GG/PokerDom в его формате), Winamax, WPN (ACR).
// На выходе — записи раздач героя для префлоп-статов (формат mdalab-hands, колонки — store.js SCHEMA).

const HEADERS = /^(?:PokerStars Hand #|Winamax Poker - Tournament "|Game Hand #)/m;
const SPLIT = /\r?\n(?=(?:PokerStars Hand #|Winamax Poker - Tournament "|Game Hand #))/;
const POS_IDX = { UTG: 0, MP: 1, CO: 3, BTN: 4, SB: 5, BB: 6 }; // 2 (HJ) не используется — в Hand2Note он входит в MP

const num = (s) => parseFloat(String(s).replace(/,/g, ''));

// бай-ин турнира в долларах (центы) по заголовку раздачи; −1 — неизвестен (у WPN в истории его нет)
const FX = { '$': 1, '€': 1.1, '£': 1.27, '¥': 0.14, '₽': 0.011 };
function buyInCents(header, fmt) {
  const toC = (v, cur) => Math.round(v * (FX[cur] || 1) * 100);
  if (fmt === 'wmx') {
    const m = header.match(/buyIn: ([^l]*?)\s+level:/); if (!m) return -1;
    const parts = [...m[1].matchAll(/([\d.]+)\s?€/g)]; return parts.length ? toC(parts.reduce((a, x) => a + parseFloat(x[1]), 0), '€') : -1;
  }
  if (fmt !== 'ps') return -1;
  const t = header.match(/Tournament #\d+, (.*?) (?:Hold'em|Omaha)/); if (!t) return -1;
  const name = t[1];
  const sum = name.match(/^((?:[$€£]\s?[\d.,]+\+?)+)\s*(USD|EUR|GBP)?$/) || name.match(/^((?:[$€£][\d.,]+\+)+[$€£][\d.,]+)/);
  if (sum) { const cur = sum[1][0]; return toC([...sum[1].matchAll(/[\d.,]+/g)].reduce((a, x) => a + parseFloat(x[0].replace(/,/g, '')), 0), cur); }
  // экспорт GG: бай-ин записан в названии турнира («$54 Bounty Hunters…»); суммы гарантий ($1M GTD) пропускаем
  for (const m of name.matchAll(/([$€£¥₽])\s?(\d[\d,]*(?:\.\d+)?)(\s?[KkMm]\b)?(\s?GTD)?/g)) {
    if (m[3] || m[4]) continue;
    return toC(parseFloat(m[2].replace(/,/g, '')), m[1]);
  }
  return -1;
}

function detectFormat(head) {
  if (head.startsWith('PokerStars Hand #')) return 'ps';
  if (head.startsWith('Winamax Poker - Tournament "')) return 'wmx';
  if (head.startsWith('Game Hand #')) return 'wpn';
  return null;
}

// Позиции по порядку хода префлоп: места между BB и баттоном (не включая) + BTN, SB, BB.
function assignPositions(order, btnSeat, sbSeat, bbSeat, tblMax, seated) {
  // как в Hand2Note: позиции считаются по игрокам назад от BB — SB, BTN, CO (кто реально поставил блайнд и где фишка дилера, не важно);
  // UTG — первый ход префлоп, только если стол полный; все остальные ранние места — MP
  // order — номера мест по часовой стрелке, начиная с первого после BB (без BB)
  const pos = {};
  if (bbSeat != null) pos[bbSeat] = 'BB';
  const k = order.length;
  order.forEach((s, i) => {
    const fromEnd = k - 1 - i;
    pos[s] = fromEnd === 0 ? 'SB' : fromEnd === 1 ? 'BTN' : fromEnd === 2 ? 'CO' : (i === 0 && tblMax && (seated || k + 1) === tblMax ? 'UTG' : 'MP');
  });
  return pos;
}


// Карты героя → номер класса руки в матрице 13×13 (строка/столбец по рангам A..2; одномастные выше диагонали)
const RANKS = 'AKQJT98765432';
function handClass(cards) {
  const m = cards && cards.match(/([2-9TJQKA])([shdc])\s+([2-9TJQKA])([shdc])/);
  if (!m) return -1;
  const a = RANKS.indexOf(m[1]), b = RANKS.indexOf(m[3]);
  const hi = Math.min(a, b), lo = Math.max(a, b);
  if (a === b) return a * 13 + a;
  return m[2] === m[4] ? hi * 13 + lo : lo * 13 + hi;
}

// Результат раздачи для героя в фишках: забрал из банка + возвраты − вложил (анте, блайнды, ставки)
function heroNet(lines, heroName, fmt) {
  let invested = 0, back = 0, street = 0, collected = 0, summaryWon = 0, inSummary = false;
  const pre = (l) => l.startsWith(heroName + ':') || l.startsWith(heroName + ' ');
  for (const l of lines) {
    if (/^\*\*\* SUMMARY/.test(l)) { inSummary = true; continue; }
    if (inSummary) {
      if (fmt === 'wpn' && l.indexOf(': ' + heroName + ' ') > 0) { const w = l.match(/won ([\d.,]+)/); if (w) summaryWon += num(w[1]); }
      continue;
    }
    if (/^\*\*\* (FLOP|TURN|RIVER)/.test(l)) { street = 0; continue; }
    const ub = l.match(/^Uncalled bet \(([\d.,]+)\) returned to (.+)$/);
    if (ub) { if (ub[2].trim() === heroName) back += num(ub[1]); continue; }
    if (!pre(l)) continue;
    const r = l.slice(heroName.length).replace(/^:/, '').trim();
    let m;
    if ((m = r.match(/^posts (?:the )?ante ([\d.,]+)/))) invested += num(m[1]);
    else if ((m = r.match(/^posts (?:the )?(?:small|big) blind ([\d.,]+)/))) { invested += num(m[1]); street += num(m[1]); }
    else if ((m = r.match(/^(?:calls|bets) ([\d.,]+)/))) { invested += num(m[1]); street += num(m[1]); }
    else if ((m = r.match(/^raises [\d.,]+ to ([\d.,]+)/))) { const to = num(m[1]); invested += to - street; street = to; }
    else if ((m = r.match(/^collected ([\d.,]+)/))) collected += num(m[1]);
  }
  if (fmt === 'wpn' && collected === 0) collected = summaryWon;
  return collected + back - invested;
}

// Ход раздачи для реплеера: места (позиция, стек), карты героя, все действия по улицам, борд, вскрытия, выигрыши.
// Суммы в BB с точностью до сотых. Имена соперников не сохраняются — только позиции.
function buildReplay(lines, ctx) {
  const { seatNums, seats, pos, heroName, bb, who, fmt, header, sbAmt } = ctx;
  const r2 = (v) => Math.round(v / bb * 100) / 100;
  const order = seatNums.slice();
  const pIdx = {}; order.forEach((sn, i) => { pIdx[seats[sn].name] = i; });
  const pl = order.map(sn => [pos[sn] || '?', r2(seats[sn].stack), seats[sn].name === heroName ? 1 : 0, sn]);
  const ev = []; // [улица, игрок, тип, сумма]; улицы 0 префлоп,1 флоп,2 тёрн,3 ривер,4 итог
  const shown = {}; const board = [];
  let street = 0, inSummary = false, wpnWon = {}, collectedAny = false;
  for (const l of lines) {
    if (/^\*\*\* SUMMARY/.test(l)) { inSummary = true; continue; }
    if (inSummary) {
      if (fmt === 'wpn') { const m = l.match(/^Seat \d+: (.+?) (?:\([^)]*\) )?(?:showed \[[^\]]*\] and )?(?:did not show and )?won ([\d.,]+)/); if (m && m[1] in pIdx) wpnWon[m[1]] = (wpnWon[m[1]] || 0) + num(m[2]); }
      const sh = l.match(/^Seat \d+: (.+?) (?:\([^)]*\) )?(?:showed|mucked) \[([^\]]+)\]/); if (sh && sh[1] in pIdx && !shown[pIdx[sh[1]]]) shown[pIdx[sh[1]]] = sh[2];
      continue;
    }
    const st = l.match(/^\*\*\* (FLOP|TURN|RIVER) \*\*\*(.*)$/);
    if (st) {
      street = { FLOP: 1, TURN: 2, RIVER: 3 }[st[1]];
      const br = st[2].match(/\[([^\]]+)\]/g) || [];
      const last = br.length ? br[br.length - 1].slice(1, -1).trim().split(/\s+/) : [];
      if (street === 1) board.push(...last); else if (last.length) board.push(last[last.length - 1]);
      ev.push([street, -1, 'S', 0]);
      continue;
    }
    const ub = l.match(/^Uncalled bet \(([\d.,]+)\) returned to (.+)$/);
    if (ub && ub[2].trim() in pIdx) { ev.push([street, pIdx[ub[2].trim()], 'U', r2(num(ub[1]))]); continue; }
    const n = who(l); if (!n || !(n in pIdx)) continue;
    const i = pIdx[n];
    const rest = l.slice(n.length).replace(/^:/, '').trim();
    let m;
    if ((m = rest.match(/^posts (?:the )?ante ([\d.,]+)/))) ev.push([0, i, 'A', r2(num(m[1]))]);
    else if ((m = rest.match(/^posts (?:the )?small blind ([\d.,]+)/))) ev.push([0, i, 'SB', r2(num(m[1]))]);
    else if ((m = rest.match(/^posts (?:the )?big blind ([\d.,]+)/))) ev.push([0, i, 'BB', r2(num(m[1]))]);
    else if (/^folds/.test(rest)) ev.push([street, i, 'f', 0]);
    else if (/^checks/.test(rest)) ev.push([street, i, 'x', 0]);
    else if ((m = rest.match(/^calls ([\d.,]+)/))) ev.push([street, i, 'c', r2(num(m[1])), /all-in/.test(rest) ? 1 : 0]);
    else if ((m = rest.match(/^bets ([\d.,]+)/))) ev.push([street, i, 'b', r2(num(m[1])), /all-in/.test(rest) ? 1 : 0]);
    else if ((m = rest.match(/^raises [\d.,]+ to ([\d.,]+)/))) ev.push([street, i, 'r', r2(num(m[1])), /all-in/.test(rest) ? 1 : 0]);
    else if ((m = rest.match(/^shows \[([^\]]+)\]/))) shown[i] = m[1];
    else if ((m = rest.match(/^collected ([\d.,]+)/))) { ev.push([4, i, 'W', r2(num(m[1]))]); collectedAny = true; }
  }
  if (fmt === 'wpn' && !collectedAny) Object.keys(wpnWon).forEach(nm => ev.push([4, pIdx[nm], 'W', r2(wpnWon[nm])]));
  const heroI = pIdx[heroName];
  const dealt = lines.find(l => l.startsWith('Dealt to ' + heroName + ' ['));
  const hc = dealt ? dealt.slice(dealt.indexOf('[') + 1, dealt.indexOf(']')) : null;
  let tl = '';
  if (fmt === 'wmx') {
    // номер турнира у Winamax — только в имени стола: Table: 'EXPLORER(1067668170)#005' — без него одноимённые турниры,
    // идущие одновременно (несколько флайтов), сливались бы в один. Пишется в скобках, не через «#»: ключ повторов
    // (dedupe.js) берёт первый «#номер», и старые и новые записи одной раздачи должны совпасть
    const t = header.match(/Tournament "([^"]*)"(?: buyIn: ([^ ]+(?: \+ [^ ]+)*))?/), tb = lines.find(l => l.startsWith("Table: '")), id = tb && (tb.match(/\((\d{5,})\)#?\d*'/) || [])[1];
    tl = t ? t[1] + (t[2] ? ' · ' + t[2] : '') + (id ? ' · (' + id + ')' : '') : '';
  }
  else if (fmt === 'ps') { const t = header.match(/Tournament #(\d+), (.*?) (?:Hold'em|Holdem)/); tl = t ? t[2].replace(/â‚½/g, '₽') + ' · #' + t[1] : ''; }
  else { const t = header.match(/Tournament #(\d+)/); tl = t ? 'Турнир #' + t[1] : ''; }
  const tm = header.match(/(\d{4}\/\d{2}\/\d{2}) (\d{1,2}:\d{2})/);
  return { pl, h: heroI, hc, ev, bd: board, sh: shown, t: tl, d: tm ? tm[1].replace(/\//g, '-') + ' ' + tm[2] : '', c: Math.round(bb * 100) / 100, bb: 1 };
}

// Общая разметка раздачи: заголовок, места, блайнды, позиции, префлоп-действия — одна на всех игроков.
// рум раздачи по заголовку — для загрузки без героя (датамайнинг), где рум не задан ником
function roomOf(fmt, lines) {
  if (fmt === 'wmx') return 'Winamax';
  if (fmt === 'wpn') return 'WPN';
  if (lines.slice(0, 3).some(l => /^Table 'PDOM_/.test(l))) return 'PokerDom';
  return /\bET\]?\s*$/.test(lines[0]) ? 'PokerStars' : 'GGPoker'; // у PokerStars в заголовке время ET; экспорт GG в формате PokerStars — без него
}
// observer — раздача без героя (датамайнинг): точка обзора — игрок на BB, все игроки записываются как соперники
function parseCtx(text, fmt, heroes, observer) {
  const lines = text.split(/\r?\n/);
  const header = lines[0];
  let bb = null, sbAmt = null, tour = null, date = null;
  if (fmt === 'wmx') {
    const m = header.match(/\((\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?\)/);
    if (m) { if (m[3]) { sbAmt = num(m[2]); bb = num(m[3]); } else { sbAmt = num(m[1]); bb = num(m[2]); } }
    const t = header.match(/Tournament "([^"]*)"/); tour = t && t[1];
  } else {
    const m = header.match(/\(([\d.,]+)\/([\d.,]+)/);
    if (m) { sbAmt = num(m[1]); bb = num(m[2]); }
    const t = header.match(/Tournament #(\d+)/); tour = t && t[1];
  }
  const idm = header.match(/HandId: #([\w-]+)|Hand #(\d+)/);
  const id = idm ? (idm[1] || idm[2]) : null;
  const d = header.match(/(\d{4})\/(\d{2})\/(\d{2})/);
  if (d) date = d[1] + '-' + d[2] + '-' + d[3];
  const tl = lines.find(l => /^Table[: ]/.test(l)) || '';
  const maxM = tl.match(/(\d+)-max/); const tblMax = maxM ? +maxM[1] : null;
  const btnM = tl.match(/Seat #(\d+) is the button/); const btnSeat = btnM ? +btnM[1] : null;
  const isPdom = /^Table 'PDOM_/.test(tl);

  // места
  const seats = {}; const byName = {};
  let bounty = /bounty|knockout|\bKO\b|Progressive KO/i.test(header);
  for (const l of lines) {
    if (/^\*\*\*/.test(l)) break;
    const m = l.match(/^Seat (\d+): (.+?) \(([^)]*)\)(.*)$/);
    if (!m) continue;
    if (/out of hand|will be allowed to play/.test(l)) continue;
    const stack = num((m[3].match(/[\d.,]+/) || ['0'])[0]);
    if (/bounty/i.test(m[3])) bounty = true;
    seats[+m[1]] = { seat: +m[1], name: m[2], stack };
    byName[m[2]] = +m[1];
  }
  // герой — тот из известных ников, кому раздали карты («Dealt to»): в базе может быть несколько алиасов,
  // и за одним столом могут сидеть ники разных алиасов (вы и друг). Без «Dealt to» (PokerDom) — первый найденный.
  const heroCands = Object.keys(byName).filter(n => heroes.has(n));
  let heroName = heroCands.length > 1 ? (heroCands.find(n => lines.some(l => l.startsWith('Dealt to ' + n + ' ['))) || heroCands[0]) : heroCands[0];
  const obs = !heroName && !!observer;
  if ((!heroName && !obs) || !bb) return null;
  const names = Object.keys(byName).sort((a, b) => b.length - a.length);
  // кто действует в строке: ник в начале строки, за ним «:» или пробел; самый длинный подходящий ник.
  // ники разложены по первому символу — строка сверяется только с никами на ту же букву (раньше — со всеми)
  const byFirst = new Map(); for (const n of names) { const k = n.charCodeAt(0); if (!byFirst.has(k)) byFirst.set(k, []); byFirst.get(k).push(n); }
  const who = (l) => { const b = byFirst.get(l.charCodeAt(0)); if (!b) return undefined; for (let i = 0; i < b.length; i++) { const n = b[i]; if (l.startsWith(n)) { const ch = l.charCodeAt(n.length); if (ch === 58 || ch === 32) return n; } } return undefined; };

  // блайнды
  let sbSeat = null, bbSeat = null;
  for (const l of lines) {
    if (/^\*\*\* (FLOP|SUMMARY)/.test(l)) break;
    const n = who(l); if (!n) continue;
    if (/posts (the )?small blind/.test(l)) sbSeat = byName[n];
    else if (/posts (the )?big blind/.test(l) && bbSeat == null) bbSeat = byName[n];
  }
  if (obs) { if (bbSeat == null || !seats[bbSeat]) return null; heroName = seats[bbSeat].name; }
  // анте: сумма всех анте раздачи (обычные анте каждого игрока или одно анте большого блайнда)
  let anteTot = 0;
  for (const l of lines) { if (/^\*\*\* (HOLE CARDS|PRE-FLOP)/.test(l)) break; const am = l.match(/posts (?:the )?ante ([\d.,]+)/); if (am) anteTot += num(am[1]); }
  const seatedAll = Object.keys(seats).length; // все, кто сидит за столом (для UTG «стол полный»)
  // как в Hand2Note: в раздаче только те, кто поставил анте/блайнд или ходил на префлопе; севший за стол «в ожидании» (без анте и без хода) не считается
  {
    const inHand = new Set(); let pre = false;
    for (const l of lines) {
      if (/^\*\*\* (FLOP|TURN|RIVER|SHOW|SUMMARY)/.test(l)) break;
      if (/^\*\*\* (HOLE CARDS|PRE-FLOP)/.test(l)) { pre = true; continue; }
      const n = who(l); if (!n) continue;
      const rest = l.slice(n.length).replace(/^:/, '').trim();
      if (/^posts /.test(rest) || (pre && /^(folds|checks|calls|bets|raises)/.test(rest)) || /^is all-in/.test(rest)) inHand.add(byName[n]);
    }
    if (inHand.size >= 2 && heroName && inHand.has(byName[heroName])) for (const sn of Object.keys(seats).map(Number)) if (!inHand.has(sn)) { delete byName[seats[sn].name]; delete seats[sn]; }
  }
  const seatNums = Object.keys(seats).map(Number).sort((a, b) => a - b);
  if (bbSeat == null || seatNums.length < 2) return null;
  const startI = seatNums.indexOf(bbSeat);
  const order = [];
  for (let i = 1; i <= seatNums.length; i++) order.push(seatNums[(startI + i) % seatNums.length]);
  // order: от первого после BB по кругу до BB включительно
  const pos = assignPositions(order.slice(0, -1), btnSeat, sbSeat, bbSeat, tblMax, seatedAll);

  // префлоп-действия
  let inPre = false; const acts = [];
  for (const l of lines) {
    if (/^\*\*\* (HOLE CARDS|PRE-FLOP)/.test(l)) { inPre = true; continue; }
    if (!inPre) continue;
    if (/^\*\*\* /.test(l)) break;
    const n = who(l); if (!n) continue;
    const rest = l.slice(n.length).replace(/^:/, '').trim();
    const am = rest.match(/^(folds|checks|calls|bets|raises)\s*([\d.,]+)?(?:\s+to\s+([\d.,]+))?/);
    if (!am) continue;
    acts.push({ name: n, a: am[1], amt: am[3] ? num(am[3]) : am[2] ? num(am[2]) : 0, allin: /all-in/.test(rest) });
  }
  // действия на флопе (для фолда на контбет)
  const facts = []; let inFlop = false;
  for (const l of lines) {
    if (/^\*\*\* FLOP/.test(l)) { inFlop = true; continue; }
    if (!inFlop) continue;
    if (/^\*\*\* /.test(l)) break;
    const n = who(l); if (!n) continue;
    const rest = l.slice(n.length).replace(/^:/, '').trim();
    const am = rest.match(/^(folds|checks|calls|bets|raises)/);
    if (am) facts.push({ name: n, a: am[1] });
  }
  return { lines, header, fmt, bb, sbAmt, tour, id, date, tblMax, isPdom, bounty, seats, byName, seatNums, order, pos, acts, who, sbSeat, bbSeat, heroName, anteTot, facts, observer: obs, room: obs ? roomOf(fmt, lines) : null };
}

// Запись одного игрока раздачи (те же правила, что для героя). opp — соперник: карты — только если показаны,
// ход раздачи для реплеера не строится здесь (one per hand), отмечается needRp.
function playerRec(c, heroName, opp) {
  const { lines, header, fmt, bb, sbAmt, tour, id, date, tblMax, isPdom, bounty, seats, byName, seatNums, order, pos, acts, who, sbSeat, bbSeat } = c;
  let rec;
  const mkRp = () => { if (opp) { rec.needRp = 1; return undefined; } return buildReplay(lines, { seatNums, seats, pos, heroName, bb, who, fmt, header, sbAmt }); };
  const hi = acts.findIndex(x => x.name === heroName);
  const heroSeat = byName[heroName];
  const hpos = pos[heroSeat];
  if (!hpos) return null;
  rec = { id, hero: heroName, date, tour, tblMax, n: seatNums.length, pos: POS_IDX[hpos], bb: Math.round(seats[heroSeat].stack / bb * 10), pko: bounty ? 1 : 0, pdom: isPdom, bi: buyInCents(header, fmt), sit: 3, lim: 0, act: 0, size: 0, fti: -1, bvb: 0, fvr: -1 };
  rec.ant = c.anteTot > 0 && bb ? Math.min(32000, Math.round(c.anteTot / bb * 100)) : 0; // анте раздачи в BB×100
  const dealt = opp ? null : lines.find(l => l.startsWith('Dealt to ' + heroName + ' ['));
  rec.hc = dealt ? handClass(dealt.slice(dealt.indexOf('['))) : opp ? shownOf(c, heroName) : -1;
  rec.net = Math.round(netOf(c, heroName) / bb * 1000) / 100; // ×10 BB, без округления до 0.1 BB (округление давало сдвиг около +1 bb/100)
  rec.hpa = 0; rec.sto = -1; rec.f3b = -1; rec.orsp = -1; rec.rz = 0; rec.cl = 0; rec.lr = 0; rec.rai = 0; rec.opos = -1; rec.ostk = -1; rec.osz = -1;
  // самый короткий стек среди блайндов (кроме героя), BB×10 — для стила против коротких/глубоких блайндов
  const bl = [sbSeat, bbSeat].filter(sn => sn != null && sn !== heroSeat && seats[sn]).map(sn => seats[sn].stack);
  rec.bmin = bl.length ? Math.round(Math.min(...bl) / bb * 10) : -1;
  // стеки малого и большого блайнда по отдельности, BB×10 (-1 — нет блайнда или это герой)
  const st = (sn) => (sn != null && sn !== heroSeat && seats[sn] ? Math.round(seats[sn].stack / bb * 10) : -1);
  rec.sbs = st(sbSeat); rec.bbs = st(bbSeat);
  // стеки всех, кто ходит после героя префлоп (BB): самый короткий, сколько коротких/средних/глубоких, покрывает ли герой всех
  {
    const hi0 = order.indexOf(heroSeat), beh = hi0 < 0 ? [] : order.slice(hi0 + 1).filter(sn => seats[sn]).map(sn => seats[sn].stack / bb);
    rec.bh = beh.length ? Math.round(Math.min(...beh) * 10) : -1;
    rec.bsh = beh.filter(v => v < 12).length; rec.bmd = beh.filter(v => v >= 12 && v < 25).length; rec.bdp = beh.filter(v => v >= 25).length;
    rec.cov = beh.length ? (seats[heroSeat].stack / bb >= Math.max(...beh) ? 1 : 0) : -1;
  }
  rec.hpa = acts.filter(x => x.name === heroName).length; // сколько раз герой ходил префлоп («C» в Hand2Note — ровно один ход-колл)
  if (hi < 0) return rec; // герой не действовал префлоп (все сбросили до BB)
  const before = acts.slice(0, hi);
  const raises = before.filter(x => x.a === 'raises' || x.a === 'bets').length;
  const calls = before.filter(x => x.a === 'calls').length;
  // для колд-колла: сколько рейзов было до первого хода героя, сколько коллеров после первого рейза, был ли первый рейз олл-ином
  rec.rz = raises;
  { const fr = before.findIndex(x => x.a === 'raises' || x.a === 'bets'); rec.cl = fr < 0 ? 0 : before.slice(fr + 1).filter(x => x.a === 'calls').length; rec.lr = fr < 0 ? 0 : before.slice(0, fr).filter(x => x.a === 'calls').length; rec.rai = fr < 0 ? 0 : (before[fr].allin ? 1 : 0); rec.opos = fr < 0 ? -1 : (POS_IDX[pos[byName[before[fr].name]]] ?? -1); rec.ostk = fr < 0 || !seats[byName[before[fr].name]] ? -1 : Math.round(seats[byName[before[fr].name]].stack / bb * 10); rec.osz = fr < 0 ? -1 : Math.round(before[fr].amt / bb * 100); }
  if (raises) rec.sit = 2;
  else if (calls) { rec.sit = 1; rec.lim = new Set(before.filter(x => x.a === 'calls').map(x => x.name)).size; }
  else rec.sit = 0;
  const h = acts[hi];
  if (h.a === 'folds') rec.act = 0;
  else if (h.a === 'calls' || h.a === 'checks') rec.act = 1;
  else { rec.act = h.allin ? 3 : 2; rec.size = Math.round(h.amt / bb * 100); }
  // после открытия: забрал ли блайнды без сопротивления и как сыграл против 3-бета
  if (rec.sit === 0 && rec.act >= 2) {
    const after = acts.slice(hi + 1);
    const rr = after.findIndex(x => x.name !== heroName && (x.a === 'raises' || x.a === 'bets'));
    const called = after.some(x => x.name !== heroName && x.a === 'calls');
    rec.sto = rr < 0 && !called ? 1 : 0;
    const first = after.find(x => x.name !== heroName && x.a !== 'folds');
    rec.rp = mkRp();
    rec.orsp = !first ? 0 : first.a === 'calls' ? 1 : 2; // ответ соперников по первому действию (как в Hand2Note): 0 все фолд, 1 колл, 2 рейз
    if (rr >= 0) { const nx = after.slice(rr + 1).find(x => x.name === heroName); rec.f3b = nx ? (nx.a === 'folds' ? 1 : 0) : -1; }
  }
  // колд-колл (один рейз до героя, герой коллирует): ход раздачи для реплеера
  if (rec.rz === 1 && rec.act === 1) rec.rp = mkRp();
  // фолд на контбет флопа после колд-колла: префлоп-рейзер первым ставит на флопе, герой отвечает (1 — фолд, 0 — колл/рейз, -1 — не было)
  rec.fcb = -1;
  if (rec.rz === 1 && rec.act === 1 && !acts.slice(hi + 1).some(x => x.a === 'raises' || x.a === 'bets')) {
    const raiser = (before.find(x => x.a === 'raises' || x.a === 'bets') || {}).name, F = c.facts || [];
    const jb = F.findIndex(x => x.a === 'bets' || x.a === 'raises');
    if (raiser && jb >= 0 && F[jb].name === raiser && F[jb].a === 'bets') {
      const nxt = F.slice(jb + 1).find(x => x.name === heroName || x.a === 'raises' || x.a === 'bets');
      if (nxt && nxt.name === heroName) rec.fcb = nxt.a === 'folds' ? 1 : 0;
    }
  }
  // против лимперов: блайнд против блайнда (лимпил только SB) и реакция героя на ререйз после изолейта
  if (rec.sit === 1) {
    const lset = new Set(before.filter(x => x.a === 'calls').map(x => pos[byName[x.name]]));
    rec.bvb = lset.size === 1 && lset.has('SB') ? 1 : 0;
    if (rec.act === 2) {
      const after = acts.slice(hi + 1);
      const limpNames = new Set(before.filter(x => x.a === 'calls').map(x => x.name));
      const rr = after.findIndex(x => limpNames.has(x.name) && (x.a === 'raises' || x.a === 'bets'));
      if (rr >= 0) { const nx = after.slice(rr + 1).find(x => x.name === heroName); rec.fvr = nx ? (nx.a === 'folds' ? 1 : 0) : -1; }
      else rec.fvr = -1;
    } else rec.fvr = -1;
  }
  // фолд лимперов на изолейт
  if (rec.sit === 1 && rec.act >= 2) {
    const limpers = new Set(before.filter(x => x.a === 'calls').map(x => x.name));
    let allFold = true, seen = 0;
    for (const x of acts.slice(hi + 1)) {
      if (!limpers.has(x.name)) continue;
      seen++; if (x.a !== 'folds') allFold = false;
      limpers.delete(x.name);
    }
    rec.fti = seen ? (allFold ? 1 : 0) : -1;
    // ответ оппонентов на изолейт по первому действию (как для открытий) и ход раздачи для реплеера
    const first = acts.slice(hi + 1).find(x => x.name !== heroName && x.a !== 'folds');
    rec.orsp = !first ? 0 : first.a === 'calls' ? 1 : 2;
    rec.rp = mkRp();
  }
  return rec;
}

// Карты игрока, если он их показал (вскрытие или «mucked [...]» в итогах) → класс руки, иначе −1
function shownClass(lines, name) {
  for (const l of lines) {
    if (l.startsWith(name + ': shows [') || l.startsWith(name + ' shows [')) return handClass(l.slice(l.indexOf('[')));
    const m = l.match(/^Seat \d+: (.+?) (?:\([^)]*\) )?(?:showed|mucked) \[([^\]]+)\]/);
    if (m && m[1] === name) return handClass('[' + m[2] + ']');
  }
  return -1;
}

// То же, что heroNet и shownClass, но за один проход по раздаче для всех игроков сразу (результат кэшируется в разметке):
// раньше каждый игрок заново просматривал все строки раздачи — при 6–9 игроках это была заметная доля разбора.
function netOf(c, name) {
  if (!c._net) {
    const inv = {}, back = {}, st = {}, col = {}, won = {}; let inSummary = false;
    for (const l of c.lines) {
      if (inSummary) {
        if (c.fmt === 'wpn') { const i = l.indexOf(': '); if (i > 0 && l.startsWith('Seat ')) { const rest = l.slice(i + 2), n = c.who(rest); if (n) { const w = rest.match(/won ([\d.,]+)/); if (w) won[n] = (won[n] || 0) + num(w[1]); } } }
        continue;
      }
      if (l.startsWith('*** ')) { if (/^\*\*\* SUMMARY/.test(l)) inSummary = true; else if (/^\*\*\* (FLOP|TURN|RIVER)/.test(l)) for (const k in st) st[k] = 0; continue; }
      if (l.startsWith('Uncalled bet')) { const ub = l.match(/^Uncalled bet \(([\d.,]+)\) returned to (.+)$/); if (ub) { const n = ub[2].trim(); back[n] = (back[n] || 0) + num(ub[1]); } continue; }
      const n = c.who(l); if (!n) continue;
      const r = l.slice(n.length).replace(/^:/, '').trim();
      let m;
      if ((m = r.match(/^posts (?:the )?ante ([\d.,]+)/))) inv[n] = (inv[n] || 0) + num(m[1]);
      else if ((m = r.match(/^posts (?:the )?(?:small|big) blind ([\d.,]+)/)) || (m = r.match(/^(?:calls|bets) ([\d.,]+)/))) { const v = num(m[1]); inv[n] = (inv[n] || 0) + v; st[n] = (st[n] || 0) + v; }
      else if ((m = r.match(/^raises [\d.,]+ to ([\d.,]+)/))) { const to = num(m[1]); inv[n] = (inv[n] || 0) + to - (st[n] || 0); st[n] = to; }
      else if ((m = r.match(/^collected ([\d.,]+)/))) col[n] = (col[n] || 0) + num(m[1]);
    }
    c._net = { inv, back, col, won };
  }
  const N = c._net; let collected = N.col[name] || 0;
  if (c.fmt === 'wpn' && collected === 0) collected = N.won[name] || 0;
  return collected + (N.back[name] || 0) - (N.inv[name] || 0);
}
function shownOf(c, name) {
  if (!c._shown) {
    const sh = {};
    for (const l of c.lines) {
      const n = c.who(l);
      if (n && (l.startsWith(n + ': shows [') || l.startsWith(n + ' shows [')) && !(n in sh)) { sh[n] = handClass(l.slice(l.indexOf('['))); continue; }
      if (l.startsWith('Seat ')) { const m = l.match(/^Seat \d+: (.+?) (?:\([^)]*\) )?(?:showed|mucked) \[([^\]]+)\]/); if (m && !(m[1] in sh)) sh[m[1]] = handClass('[' + m[2] + ']'); }
    }
    c._shown = sh;
  }
  return name in c._shown ? c._shown[name] : -1;
}

function parseHand(text, fmt, heroes) {
  const c = parseCtx(text, fmt, heroes);
  return c ? playerRec(c, c.heroName, false) : null;
}

// Раздача целиком: запись героя (как parseHand) и записи всех соперников, участвовавших в раздаче.
// rp — ход раздачи (с позиции героя): у героя — как раньше; если реплеер нужен только соперникам — строится один раз на раздачу.
// observer: загрузка без героя — героя нет (hero: null), соперники — все игроки, кроме ников exclude (ваши алиасы)
function parseHandAll(text, fmt, heroes, observer, exclude) {
  const c = parseCtx(text, fmt, observer ? EMPTY : heroes, observer);
  if (!c) return null;
  const hero = c.observer ? null : playerRec(c, c.heroName, false);
  if (!hero && !c.observer) return null;
  const skip = c.observer ? (exclude || EMPTY) : heroes;
  const opps = [];
  for (const sn of c.seatNums) {
    const name = c.seats[sn].name;
    if (skip.has(name)) continue;
    const r = playerRec(c, name, true);
    if (r) { r.seatIdx = c.seatNums.indexOf(sn); opps.push(r); }
  }
  if (c.observer && !opps.length) return null;
  // у соперников — тоже у каждой раздачи: реплеер с места соперника и EV олл-ина, где видны его карты
  for (const r of opps) r.needRp = 1;
  let rp = (hero && hero.rp) || null;
  // запись реплеера — у каждой вашей раздачи (не только в спотах вкладок): раздачи любой ячейки открываются в реплеере
  if (!rp && (hero || opps.some(r => r.needRp))) rp = buildReplay(c.lines, { seatNums: c.seatNums, seats: c.seats, pos: c.pos, heroName: c.heroName, bb: c.bb, who: c.who, fmt: c.fmt, header: c.header, sbAmt: c.sbAmt });
  if (hero && rp && !hero.rp) hero.rp = rp;
  // размер контбета (% банка флопа) — для ориентира равновесия (MDF) в #9
  if (rp) { const cs = cbetPct(rp); for (const r of [hero, ...opps]) if (r && r.fcb >= 0) r.cbs = cs; }
  return { hero, opps, rp, id: c.id, tour: c.tour, room: c.room };
}
const EMPTY = new Set();
// банк к флопу и первая ставка на флопе по записи реплеера → ставка в % банка (-1, если не вышло)
function cbetPct(rp) {
  let pot = 0; const cur = {};
  for (const e of rp.ev) {
    if (e[0] !== 0) break;
    const [, i, t, v] = e;
    if (t === 'A') pot += v;
    else if (t === 'SB' || t === 'BB') cur[i] = (cur[i] || 0) + v;
    else if (t === 'c') cur[i] = (cur[i] || 0) + v;
    else if (t === 'r') cur[i] = v;
    else if (t === 'U') cur[i] = (cur[i] || 0) - v;
  }
  for (const k in cur) pot += cur[k];
  const b = rp.ev.find(e => e[0] === 1 && e[2] === 'b');
  if (!b || !(pot > 0)) return -1;
  return Math.max(0, Math.min(30000, Math.round(b[3] / pot * 100)));
}

function parseText(text, heroes) {
  text = text.replace(/^﻿/, '').replace(/^\s+/, '');
  const fmt = detectFormat(text.slice(0, 40));
  if (!fmt || !HEADERS.test(text)) return { fmt: null, hands: [], errors: 0 };
  const out = []; let errors = 0;
  for (const chunk of text.split(SPLIT)) {
    const c = chunk.replace(/^\s+/, '');
    if (!detectFormat(c.slice(0, 40))) continue;
    try { const r = parseHand(c, fmt, heroes); if (r) out.push(r); else errors++; } catch (e) { errors++; }
  }
  return { fmt, hands: out, errors };
}

// Как parseText, но раздача целиком: герой + соперники (parseHandAll)
// В базу идут только турниры по безлимитному холдему (МТТ, сит-н-гоу, спины): кэш, омаха, стад и другие игры
// отсеиваются ещё при разборе и никуда не сохраняются. Решение — по первой строке раздачи.
function nlhTour(c) {
  const h = c.slice(0, c.indexOf('\n') > 0 ? c.indexOf('\n') : 400);
  if (!/tournament/i.test(h)) return false; // кэш-игры (у Winamax — «CashGame», у PokerStars/GG/WPN — без «Tournament»)
  // игра — словами рядом: «Hold'em No Limit» (PokerStars, GG), «Holdem no limit» (Winamax), «Holdem (No Limit)» (WPN);
  // по названию турнира не судим (в нём бывают «Omaha», «Draw» и т. п.)
  return /hold'?em\s*\(?\s*no ?limit/i.test(h);
}
function parseTextAll(text, heroes, observer, exclude) {
  text = text.replace(/^\uFEFF/, '').replace(/^\s+/, '');
  const fmt = detectFormat(text.slice(0, 40));
  if (!fmt || !HEADERS.test(text)) return { fmt: null, hands: [], errors: 0 };
  const out = []; let errors = 0, skipped = 0;
  for (const chunk of text.split(SPLIT)) {
    const c = chunk.replace(/^\s+/, '');
    if (!detectFormat(c.slice(0, 40))) continue;
    if (!nlhTour(c)) { skipped++; continue; }
    try { const r = parseHandAll(c, fmt, heroes, observer, exclude); if (r) out.push(r); else errors++; } catch (e) { errors++; }
  }
  return { fmt, hands: out, errors, skipped };
}

module.exports = { nlhTour, parseText, parseTextAll, parseHand, parseHandAll, assignPositions, handClass, heroNet, POS_IDX, cbetPct };
