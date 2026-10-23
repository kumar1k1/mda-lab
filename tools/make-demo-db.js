'use strict';
// Генерирует ДЕМО-базу спотов (синтетические, правдоподобные частоты).
// Реальная база будет собираться скриптом из ваших раздач в том же формате.
const fs = require('fs');
const path = require('path');
const { SCHEMA } = require('../app/engine.js');

let seed = 20261023;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const jitter = (x, a) => x * (1 + (rnd() * 2 - 1) * a);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function dist(freqs, n) {
  const sum = freqs.reduce((a, b) => a + b, 0);
  return freqs.map(f => Math.round(f / sum * n));
}

const TEXMOD = { 'Спаренный': 0.12, 'Монотон': -0.16, 'Двухмаст связанный': -0.12, 'Двухмаст несвязанный': -0.02, 'Радуга связанный': -0.08, 'Радуга A-high': 0.16, 'Радуга K–T high': 0.08, 'Радуга низкий': -0.04 };
const TEXW = { 'Спаренный': 0.17, 'Монотон': 0.05, 'Двухмаст связанный': 0.14, 'Двухмаст несвязанный': 0.26, 'Радуга связанный': 0.09, 'Радуга A-high': 0.1, 'Радуга K–T high': 0.11, 'Радуга низкий': 0.08 };
const POTW = { 'Лимп': 0.25, 'SRP': 1, '3-бет': 0.3, '4-бет': 0.04 };
const PAIRW = { 'BTN vs BB': 1, 'CO vs BB': 0.7, 'HJ vs BB': 0.55, 'UTG vs BB': 0.45, 'SB vs BB': 0.8, 'BTN vs SB': 0.35 };
const WHOW = { 'Регуляры': 0.55, 'Фиши': 0.42, 'Я': 0.03 };
const LIMW = { 'NL50': 0.45, 'NL100': 0.35, 'NL200': 0.2 };
const STW = { 'Флоп': 1, 'Тёрн': 0.55, 'Ривер': 0.34 };

const rows = [];
const S = SCHEMA;

// Постфлоп
['Флоп', 'Тёрн', 'Ривер'].forEach((street, si0) => {
  const si = si0 + 1;
  S.nodes[street].forEach((node, ni) => {
    S.pot.forEach((pot, pi) => S.pair.forEach((pair, qi) => S.role.forEach((role, ri) => S.tex.forEach((tex, ti) => S.who.forEach((who, wi) => S.lim.forEach((lim, li) => {
      const ip = role === 'В позиции';
      const fish = who === 'Фиши';
      let n = 1600000 * STW[street] * POTW[pot] * PAIRW[pair] * TEXW[tex] * WHOW[who] * LIMW[lim] * (node === 'Против чека' ? 0.35 : node === 'Против ставки' ? 0.6 : 0.5);
      if (node === 'Против чека' && !ip) n *= 0.15;
      n = Math.max(3, Math.round(jitter(n, 0.25)));
      let f;
      if (node === 'Против ставки') {
        let fold = { 'Флоп': 0.38, 'Тёрн': 0.43, 'Ривер': 0.47 }[street];
        let raise = { 'Флоп': ip ? 0.07 : 0.11, 'Тёрн': ip ? 0.05 : 0.07, 'Ривер': ip ? 0.04 : 0.06 }[street];
        if (fish) { fold -= 0.1; raise *= 0.7; }
        if (who === 'Я') { fold -= 0.02; raise *= 1.1; }
        if (tex === 'Монотон') raise *= 0.8;
        if (tex.indexOf('связанный') >= 0 && street === 'Флоп') raise *= 1.25;
        if (pot === '3-бет') fold -= 0.04;
        fold = clamp(jitter(fold, 0.06), 0.1, 0.8); raise = clamp(jitter(raise, 0.12), 0.01, 0.3);
        f = [fold, 1 - fold - raise, raise];
      } else {
        let bet = node === 'Ставка агрессора' ? { 'Флоп': ip ? 0.56 : 0.42, 'Тёрн': 0.47, 'Ривер': 0.41 }[street] : { 'Флоп': 0.46, 'Тёрн': 0.38, 'Ривер': 0.33 }[street];
        bet += TEXMOD[tex] * (street === 'Флоп' ? 1 : 0.5);
        if (pot === '3-бет') bet += 0.06;
        if (pot === 'Лимп') bet -= 0.1;
        if (fish) bet += 0.05;
        if (who === 'Я') bet -= 0.03;
        bet = clamp(jitter(bet, 0.06), 0.08, 0.9);
        // сайзинги: регуляры на флопе мелко, фиши крупнее, к риверу всё крупнее
        let sz = street === 'Флоп' ? [0.48, 0.28, 0.14, 0.07, 0.03] : street === 'Тёрн' ? [0.18, 0.3, 0.3, 0.15, 0.07] : [0.12, 0.24, 0.3, 0.2, 0.14];
        if (fish) sz = [sz[0] * 0.5, sz[1] * 0.9, sz[2] * 1.5, sz[3] * 1.6, sz[4] * 1.4];
        if (tex === 'Монотон') sz = [sz[0] * 1.4, sz[1], sz[2] * 0.8, sz[3] * 0.6, sz[4] * 0.6];
        const ss = sz.reduce((a, b) => a + b, 0);
        f = [1 - bet].concat(sz.map(x => jitter(x / ss, 0.1) * bet));
      }
      rows.push([si, ni, pi, qi, ri, ti, wi, li].concat(dist(f, n)));
    }))))));
  });
});

// Префлоп
const RFI = { UTG: 0.15, HJ: 0.19, CO: 0.27, BTN: 0.44, SB: 0.38, BB: 0 };
const VS_OPEN = { UTG: [0, 0, 0], HJ: [0.9, 0.04, 0.06], CO: [0.88, 0.05, 0.07], BTN: [0.83, 0.08, 0.09], SB: [0.85, 0.03, 0.12], BB: [0.56, 0.33, 0.11] };
const VS_3B = { UTG: [0.58, 0.32, 0.1], HJ: [0.56, 0.33, 0.11], CO: [0.52, 0.36, 0.12], BTN: [0.47, 0.4, 0.13], SB: [0.44, 0.38, 0.18], BB: [0.5, 0.35, 0.15] };
S.nodes['Префлоп'].forEach((node, ni) => S.seat.forEach((seat, qi) => S.who.forEach((who, wi) => S.lim.forEach((lim, li) => {
  const fish = who === 'Фиши';
  let n = 4800000 * WHOW[who] * LIMW[lim] / 6 * (node === 'Первое действие' ? 0.6 : node === 'Против открытия' ? 0.5 : 0.08);
  let f;
  if (node === 'Первое действие') {
    if (seat === 'BB') { n = 0; f = [1, 0, 0]; }
    else {
      let r = RFI[seat], l = 0.01;
      if (fish) { r *= 0.75; l = seat === 'SB' ? 0.22 : 0.08; }
      if (who === 'Я') r *= 1.05;
      r = jitter(r, 0.05); f = [1 - r - l, l, r];
    }
  } else if (node === 'Против открытия') {
    if (seat === 'UTG') { n = 0; f = [1, 0, 0]; }
    else { f = VS_OPEN[seat].slice(); if (fish) { f[0] -= 0.1; f[1] += 0.13; f[2] -= 0.03; } f = f.map(x => jitter(Math.max(0.01, x), 0.06)); }
  } else {
    f = VS_3B[seat].slice(); if (fish) { f[0] -= 0.12; f[1] += 0.14; f[2] -= 0.02; } f = f.map(x => jitter(Math.max(0.01, x), 0.06));
  }
  rows.push([0, ni, 0, qi, 0, 0, wi, li].concat(dist(f, Math.round(jitter(Math.max(n, 0), 0.15)))));
}))));

// График выигрыша (демо)
const won = [0], ev = [0];
let w = 0, e = 0;
let dev = 0;
for (let i = 1; i <= 120; i++) { e += 0.051 * 4167 / 100 * (1 + (rnd() - 0.5) * 0.4); dev = dev * 0.94 + (rnd() - 0.5) * 140; w = e + dev; won.push(Math.round(w)); ev.push(Math.round(e)); }

const db = {
  format: 'mdalab-spots-v1',
  meta: {
    demo: true,
    title: 'Демо-база',
    room: '[РУМ]',
    stakes: 'NL50–NL200',
    hands: 4812000,
    players: 38204,
    regulars: 1912,
    period: 'янв 2025 – сен 2026',
    myHands: 500000,
    winrate: 4.7,
    evWinrate: 5.1,
    graph: { step: 4167, won, ev },
    regRule: 'Регуляр: 2 000+ раздач в базе, VPIP 18–30, разница VPIP–PFR ≤ 6'
  },
  rows
};
const out = path.join(__dirname, '..', 'app', 'data', 'demo-db.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(db));
const decisions = rows.reduce((a, r) => a + r.slice(8).reduce((x, y) => x + y, 0), 0);
console.log('rows', rows.length, 'decisions', decisions, 'bytes', fs.statSync(out).size);
