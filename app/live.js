'use strict';
// «Офлайн-серии»: страницы The Hendon Mob (календарь фестивалей и расписание фестиваля) и курсы валют.
// Программа ведёт себя как обычный посетитель: календарь — 3 страницы (этот месяц и два следующих), расписание —
// одна страница по нажатию на серию; между запросами — пауза, ответы хранятся на компьютере (календарь — 6 ч,
// расписание — 3 дня). Если сайт попросил проверку «вы не робот» (Cloudflare), её проходит сам человек
// в открытом окне сайта (pass) — программа проверку не обходит. Разбор страниц — в окне (renderer/live-parse.js).
const fs = require('fs');
const path = require('path');

const BASE = 'https://pokerdb.thehendonmob.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const GAP = 2500; // пауза между запросами к сайту
// запасные курсы (единиц валюты за 1 $), если сервис курсов недоступен
const FX0 = { USD: 1, EUR: 0.93, GBP: 0.79, CAD: 1.38, AUD: 1.52, NZD: 1.68, CHF: 0.86, SEK: 10.6, NOK: 10.9, DKK: 6.95, ISK: 138, CZK: 23.4, PLN: 4.0, HUF: 365, BGN: 1.82, RON: 4.65, TRY: 34, KRW: 1380, JPY: 152, CNY: 7.2, TWD: 32.5, HKD: 7.8, MOP: 8.05, SGD: 1.34, PHP: 57, VND: 25300, THB: 34, MYR: 4.4, IDR: 15800, INR: 84, ZAR: 18, MAD: 9.9, KES: 129, TZS: 2700, MXN: 19.5, BRL: 5.6, ARS: 980, CLP: 950, COP: 4200, PEN: 3.75, UYU: 41, GEL: 2.7, AMD: 388, KZT: 480, RUB: 95, UAH: 41, BYN: 3.27, AED: 3.67, ILS: 3.7, EGP: 49 };

function make(userData) {
  const dir = path.join(userData, 'live');
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* нет */ }
  let ses = null, last = 0, chain = Promise.resolve();
  const S = () => { if (!ses) { const { session } = require('electron'); ses = session.fromPartition('persist:mdalive'); ses.setUserAgent(UA); } return ses; };
  const file = (k) => path.join(dir, k.replace(/[^a-z0-9_-]/gi, '_') + '.json');
  const readC = (k) => { try { return JSON.parse(fs.readFileSync(file(k), 'utf8')); } catch (e) { return null; } };
  const writeC = (k, v) => { try { const f = file(k), t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(v)); fs.renameSync(t, f); } catch (e) { /* без кэша */ } };
  const isChal = (t) => /_cf_chl_opt|challenge-platform|Just a moment\.\.\.|Enable JavaScript and cookies to continue/i.test(t) && !/db-list__entry|table--festival-schedule/.test(t);
  // запросы к сайту — по одному, с паузой
  const queue = (fn) => { const p = chain.then(async () => { const w = last + GAP - Date.now(); if (w > 0) await new Promise(r => setTimeout(r, w)); try { return await fn(); } finally { last = Date.now(); } }); chain = p.catch(() => {}); return p; };
  async function page(url, key, maxAge, force) {
    const c = readC(key);
    if (c && !force && Date.now() - c.t < maxAge) return { html: c.html, t: c.t, cached: true };
    try {
      const html = await queue(async () => {
        const ac = new AbortController(), to = setTimeout(() => ac.abort(), 20000);
        try { const r = await S().fetch(url, { signal: ac.signal, headers: { Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-GB,en;q=0.9' } }); const t = await r.text(); if (isChal(t)) { const e = new Error('challenge'); e.challenge = true; throw e; } if (!r.ok) throw new Error('HTTP ' + r.status); return t; } finally { clearTimeout(to); }
      });
      writeC(key, { t: Date.now(), html });
      return { html, t: Date.now() };
    } catch (e) {
      const out = { error: e.challenge ? 'Сайт The Hendon Mob попросил подтвердить, что вы не робот.' : 'Не удалось загрузить: ' + (e.name === 'AbortError' ? 'нет ответа' : e.message), challenge: !!e.challenge, url };
      if (c) Object.assign(out, { html: c.html, t: c.t, stale: true });
      return out;
    }
  }
  // проверка сайта — в обычном окне: человек сам ставит галочку, окно закрывается, когда страница открылась
  let passing = null;
  function pass(url, key) {
    if (passing) return passing;
    const { BrowserWindow } = require('electron');
    passing = new Promise((resolve) => {
      const w = new BrowserWindow({ width: 980, height: 760, title: 'The Hendon Mob — проверка', autoHideMenuBar: true, webPreferences: { partition: 'persist:mdalive', sandbox: true, contextIsolation: true, nodeIntegration: false } });
      let done = false; const fin = (ok) => { if (done) return; done = true; clearTimeout(tm); passing = null; try { if (!w.isDestroyed()) w.close(); } catch (e) { /* закрыто */ } resolve({ ok }); };
      const tm = setTimeout(() => fin(false), 5 * 60e3);
      const check = async () => { try { const h = await w.webContents.executeJavaScript('document.documentElement.outerHTML'); if (!isChal(h) && /db-list__entry|table--festival-schedule|content-meta/.test(h)) { if (key) writeC(key, { t: Date.now(), html: h }); fin(true); } } catch (e) { /* страница ещё грузится */ } };
      w.webContents.on('did-finish-load', check); w.webContents.on('did-navigate', () => setTimeout(check, 500));
      w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      w.on('closed', () => fin(false));
      w.loadURL(url, { userAgent: UA }).catch(() => {});
    });
    return passing;
  }
  async function rates() {
    const c = readC('fx'); if (c && Date.now() - c.t < 12 * 3600e3) return c.v;
    try {
      const { net } = require('electron'); const r = await net.fetch('https://open.er-api.com/v6/latest/USD'); const j = await r.json();
      if (j && j.rates && j.rates.EUR) { const v = { t: Date.now(), rates: j.rates, src: 'open.er-api.com' }; writeC('fx', { t: Date.now(), v }); return v; }
    } catch (e) { /* ниже — запасные */ }
    return c ? c.v : { t: 0, rates: FX0, src: 'запасные курсы' };
  }
  const monthKey = (y, m) => 'list-' + y + '-' + m;
  return {
    list: (y, m, force) => page(BASE + '/festival.php?a=l&r=0&c=&y=' + (+y) + '&m=' + (+m), monthKey(+y, +m), 6 * 3600e3, force),
    fest: (id, force) => page(BASE + '/festival.php?a=r&n=' + (+id), 'fest-' + (+id), 3 * 864e5, force),
    pass: (kind, a, b) => kind === 'fest' ? pass(BASE + '/festival.php?a=r&n=' + (+a), 'fest-' + (+a)) : pass(BASE + '/festival.php?a=l&r=0&c=&y=' + (+a) + '&m=' + (+b), monthKey(+a, +b)),
    rates,
    // сводка открытых серий (турниров, бай-ины, гарантия) — для списка; пишет окно после разбора расписания
    sumGet: () => readC('summary') || {},
    sumSet: (id, v) => { const s = readC('summary') || {}; s[+id] = v; writeC('summary', s); return true; }
  };
}
module.exports = { make, FX0 };
