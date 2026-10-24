'use strict';
// Разбор турнирных историй раздач: PokerStars (и экспорт GG/PokerDom в его формате), Winamax, WPN (ACR).
// На выходе — записи раздач героя для префлоп-статов (формат mdalab-hands, см. demo-gen.js).

const HEADERS = /^(?:PokerStars Hand #|Winamax Poker - Tournament "|Game Hand #)/m;
const SPLIT = /\r?\n(?=(?:PokerStars Hand #|Winamax Poker - Tournament "|Game Hand #))/;
const POS_IDX = { EP: 0, MP: 1, HJ: 2, CO: 3, BTN: 4, SB: 5, BB: 6 };

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
// Отсчёт от баттона: CO, HJ, MP; при 5+ местах перед баттоном MP занимает два места; остальные — EP (как в Hand2Note).
function assignPositions(order, btnSeat, sbSeat, bbSeat) {
  // order — номера мест по часовой стрелке, начиная с первого после BB
  const pos = {};
  if (bbSeat != null) pos[bbSeat] = 'BB';
  if (sbSeat != null) pos[sbSeat] = 'SB';
  const early = order.filter(s => s !== sbSeat && s !== bbSeat);
  if (early.length && early[early.length - 1] === btnSeat) { pos[btnSeat] = 'BTN'; early.pop(); }
  const k = early.length;
  early.forEach((s, i) => {
    const fromEnd = k - 1 - i;
    pos[s] = fromEnd === 0 ? 'CO' : fromEnd === 1 ? 'HJ' : fromEnd === 2 || (fromEnd === 3 && k >= 5) ? 'MP' : 'EP';
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
  if (fmt === 'wmx') { const t = header.match(/Tournament "([^"]*)"(?: buyIn: ([^ ]+(?: \+ [^ ]+)*))?/); tl = t ? t[1] + (t[2] ? ' · ' + t[2] : '') : ''; }
  else if (fmt === 'ps') { const t = header.match(/Tournament #(\d+), (.*?) (?:Hold'em|Holdem)/); tl = t ? t[2].replace(/â‚½/g, '₽') + ' · #' + t[1] : ''; }
  else { const t = header.match(/Tournament #(\d+)/); tl = t ? 'Турнир #' + t[1] : ''; }
  const tm = header.match(/(\d{4}\/\d{2}\/\d{2}) (\d{1,2}:\d{2})/);
  return { pl, h: heroI, hc, ev, bd: board, sh: shown, t: tl, d: tm ? tm[1].replace(/\//g, '-') + ' ' + tm[2] : '', bb: 1 };
}

function parseHand(text, fmt, heroes) {
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
  const heroName = Object.keys(byName).find(n => heroes.has(n));
  if (!heroName || !bb) return null;
  const names = Object.keys(byName).sort((a, b) => b.length - a.length);
  const who = (l) => names.find(n => l.startsWith(n + ':') || l.startsWith(n + ' '));

  // блайнды
  let sbSeat = null, bbSeat = null;
  for (const l of lines) {
    if (/^\*\*\* (FLOP|SUMMARY)/.test(l)) break;
    const n = who(l); if (!n) continue;
    if (/posts (the )?small blind/.test(l)) sbSeat = byName[n];
    else if (/posts (the )?big blind/.test(l) && bbSeat == null) bbSeat = byName[n];
  }
  const seatNums = Object.keys(seats).map(Number).sort((a, b) => a - b);
  if (bbSeat == null || seatNums.length < 2) return null;
  const startI = seatNums.indexOf(bbSeat);
  const order = [];
  for (let i = 1; i <= seatNums.length; i++) order.push(seatNums[(startI + i) % seatNums.length]);
  // order: от первого после BB по кругу до BB включительно
  const pos = assignPositions(order.slice(0, -1).concat([]), btnSeat, sbSeat, bbSeat);

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
  const hi = acts.findIndex(x => x.name === heroName);
  const heroSeat = byName[heroName];
  const hpos = pos[heroSeat];
  if (!hpos) return null;
  const rec = { id, hero: heroName, date, tour, tblMax, n: seatNums.length, pos: POS_IDX[hpos], bb: Math.round(seats[heroSeat].stack / bb * 10), pko: bounty ? 1 : 0, pdom: isPdom, bi: buyInCents(header, fmt), sit: 3, lim: 0, act: 0, size: 0, fti: -1, bvb: 0, fvr: -1 };
  const dealt = lines.find(l => l.startsWith('Dealt to ' + heroName + ' ['));
  rec.hc = dealt ? handClass(dealt.slice(dealt.indexOf('['))) : -1;
  rec.net = Math.round(heroNet(lines, heroName, fmt) / bb * 10); // ×10 BB
  rec.sto = -1; rec.f3b = -1; rec.orsp = -1; rec.rz = 0; rec.cl = 0; rec.rai = 0;
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
  if (hi < 0) return rec; // герой не действовал префлоп (все сбросили до BB)
  const before = acts.slice(0, hi);
  const raises = before.filter(x => x.a === 'raises' || x.a === 'bets').length;
  const calls = before.filter(x => x.a === 'calls').length;
  // для колд-колла: сколько рейзов было до первого хода героя, сколько коллеров после первого рейза, был ли первый рейз олл-ином
  rec.rz = raises;
  { const fr = before.findIndex(x => x.a === 'raises' || x.a === 'bets'); rec.cl = fr < 0 ? 0 : before.slice(fr + 1).filter(x => x.a === 'calls').length; rec.rai = fr < 0 ? 0 : (before[fr].allin ? 1 : 0); }
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
    rec.rp = buildReplay(lines, { seatNums, seats, pos, heroName, bb, who, fmt, header, sbAmt });
    rec.orsp = !first ? 0 : first.a === 'calls' ? 1 : 2; // ответ соперников по первому действию (как в Hand2Note): 0 все фолд, 1 колл, 2 рейз
    if (rr >= 0) { const nx = after.slice(rr + 1).find(x => x.name === heroName); rec.f3b = nx ? (nx.a === 'folds' ? 1 : 0) : -1; }
  }
  // колд-колл (один рейз до героя, герой коллирует): ход раздачи для реплеера
  if (rec.rz === 1 && rec.act === 1) rec.rp = buildReplay(lines, { seatNums, seats, pos, heroName, bb, who, fmt, header, sbAmt });
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
    rec.rp = buildReplay(lines, { seatNums, seats, pos, heroName, bb, who, fmt, header, sbAmt });
  }
  return rec;
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

module.exports = { parseText, parseHand, assignPositions, handClass, heroNet, POS_IDX };
