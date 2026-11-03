'use strict';
/* global mda, Stats */
// Ядро интерфейса: общие короткие помощники, база (DB) и состояние фильтров шапки (state). Загружается первым.
const $ = (id) => document.getElementById(id);
// Русские названия турниров «кракозябрами» (UTF-8, прочитанный как Windows-1252): «ÐŸÐžÐšÐ•Ð ÐžÐš» → «ПОКЕРОК».
// Так записаны некоторые выгрузки; у раздач, загруженных до 0.7.20, название исправляется при показе.
const CP1252B = { 0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F };
function fixMojibake(str) {
  str = String(str || ''); if (!/[ÐÑâ][\u0080-¿Œ-™]/.test(str)) return str;
  if (str.includes(' · ')) return str.split(' · ').map(fixMojibake).join(' · '); // « · #номер» дописывает программа — части по отдельности
  const b = []; for (const ch of str) { const c = ch.codePointAt(0); if (c === 0x20 && (b[b.length - 1] === 0xD0 || b[b.length - 1] === 0xD1)) b.push(0xA0); /* «Р» = D0 A0: неразрывный пробел стал обычным */ else if (c <= 0xFF) b.push(c); else if (CP1252B[c] != null) b.push(CP1252B[c]); else return str; }
  const out = new TextDecoder('utf-8').decode(new Uint8Array(b)).replace(/\uFFFD+$/, ''); // название бывает обрезано посреди буквы
  return out.includes('\uFFFD') ? str : out;
}
window.fixMojibake = fixMojibake;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

let DB = null;
let CURRENT_IDX = [];
let LAST_NET_ITEMS = [];
const state = { tab: 'rfi', sub: 'TOT', alias: 0, nickView: null, nickA: null, room: null, player: null, type: null, from: null, to: null,  };

