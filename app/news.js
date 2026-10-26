'use strict';
// Лента новостей: свежие материалы покерных сайтов из их открытых RSS/Atom-лент.
// Берутся только заголовок, ссылка, дата, короткое описание и картинка — полный текст читается на сайте источника.
// Если адрес ленты у сайта изменился, адрес ищется на главной странице (<link rel="alternate" type="application/rss+xml">).
// Результат хранится в папке данных программы: без интернета показывается последняя загруженная лента.
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const SOURCES = [
  { id: 'pokernews', name: 'PokerNews', lang: 'en', site: 'https://www.pokernews.com/', feeds: ['https://www.pokernews.com/rss.php'] },
  { id: 'pokerfuse', name: 'pokerfuse', lang: 'en', site: 'https://pokerfuse.com/', feeds: ['https://pokerfuse.com/rss/', 'https://pokerfuse.com/feed/'] },
  { id: 'pokertube', name: 'PokerTube', lang: 'en', site: 'https://www.pokertube.com/', feeds: ['https://www.pokertube.com/rss', 'https://www.pokertube.com/feed'] },
  { id: 'gamblingnews', name: 'GamblingNews', lang: 'en', site: 'https://www.gamblingnews.com/news/poker/', feeds: ['https://www.gamblingnews.com/news/poker/feed/'] },
  { id: 'cardplayer', name: 'CardPlayer', lang: 'en', site: 'https://www.cardplayer.com/', feeds: ['https://www.cardplayer.com/poker-news.rss'] },
  { id: 'pokerru', name: 'Poker.ru', lang: 'ru', site: 'https://poker.ru/novosti-pokera/', feeds: ['https://poker.ru/feed/'] },
  { id: 'planpokera', name: 'Planpokera', lang: 'ru', site: 'https://planpokera.com/novosti/', feeds: ['https://planpokera.com/feed/'] },
  { id: 'gipsyteam', name: 'GipsyTeam', lang: 'ru', site: 'https://www.gipsyteam.ru/', feeds: ['https://www.gipsyteam.ru/rss/news', 'https://www.gipsyteam.ru/rss'] },
  { id: 'pokeroff', name: 'Pokeroff', lang: 'ru', site: 'https://www.pokeroff.ru/', feeds: ['https://www.pokeroff.ru/rss'] }
];
const WEEK = 7 * 864e5, MAX_AGE = 14 * 864e5, FRESH = 30 * 60e3;

function get(url, depth = 0) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': 'MDA Lab news reader', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8' }, timeout: 10000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && depth < 4) { res.resume(); resolve(get(new URL(res.headers.location, url).href, depth + 1)); return; }
      if (res.statusCode !== 200) { res.resume(); reject(new Error('HTTP ' + res.statusCode)); return; }
      const parts = []; let n = 0;
      res.on('data', (d) => { n += d.length; if (n > 5e6) req.destroy(new Error('слишком большой ответ')); else parts.push(d); });
      res.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
    });
    req.on('timeout', () => req.destroy(new Error('нет ответа')));
    req.on('error', reject);
  });
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };
const unent = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e.toLowerCase()] != null ? ENT[e.toLowerCase()] : m));
const uncdata = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
const text = (s) => unent(uncdata(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const tag = (x, name) => { const m = x.match(new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>', 'i')); return m ? m[1] : ''; };
const attr = (x, name, a) => { const m = x.match(new RegExp('<' + name + '\\s[^>]*' + a + '=["\']([^"\']+)["\']', 'i')); return m ? unent(m[1]) : ''; };
function clip(s, n) { if (s.length <= n) return s; const c = s.slice(0, n); return c.slice(0, Math.max(c.lastIndexOf(' '), n - 20)).replace(/[,.;:\s]+$/, '') + '…'; }

function parseFeed(xml, src) {
  const out = [];
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const it of items) {
    const title = text(tag(it, 'title'));
    let link = text(tag(it, 'link')) || attr(it, 'link', 'href');
    const date = Date.parse(text(tag(it, 'pubDate')) || text(tag(it, 'published')) || text(tag(it, 'updated')) || text(tag(it, 'dc:date')));
    const raw = uncdata(tag(it, 'description') || tag(it, 'summary') || tag(it, 'content:encoded') || tag(it, 'content'));
    const img = attr(it, 'media:content', 'url') || attr(it, 'media:thumbnail', 'url') || (/<enclosure[^>]*type=["']image/i.test(it) ? attr(it, 'enclosure', 'url') : '') || ((raw.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || '');
    const cats = (it.match(/<category[^>]*>[\s\S]*?<\/category>/gi) || []).map(c => text(c)).filter(Boolean).slice(0, 6);
    if (!title || !/^https?:\/\//.test(link) || !isFinite(date)) continue;
    out.push({ src: src.id, lang: src.lang, title, link, date, desc: clip(text(raw), 260), img: /^https:\/\//.test(img) ? unent(img) : '', cats });
  }
  return out;
}

async function loadSource(src) {
  const tried = [];
  for (const u of src.feeds) { try { const items = parseFeed(await get(u), src); if (items.length) return items; tried.push(u + ': пусто'); } catch (e) { tried.push(u + ': ' + e.message); } }
  // адрес ленты — с главной страницы сайта
  try {
    const html = await get(src.site);
    const m = html.match(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/gi) || [];
    for (const l of m) { const h = (l.match(/href=["']([^"']+)["']/i) || [])[1]; if (!h) continue; const u = new URL(unent(h), src.site).href; try { const items = parseFeed(await get(u), src); if (items.length) { src.feeds.unshift(u); return items; } } catch (e) { tried.push(u + ': ' + e.message); } }
  } catch (e) { tried.push(src.site + ': ' + e.message); }
  throw new Error(tried.join('; '));
}

function make(userData) {
  const cacheFile = path.join(userData, 'news-cache.json');
  const readCache = () => { try { return JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch (e) { return null; } };
  let busy = null;
  async function refresh() {
    const old = readCache(), now = Date.now(), errors = [];
    const res = await Promise.all(SOURCES.map(s => loadSource(s).then(items => ({ s, items }), (e) => { errors.push({ src: s.name, error: e.message }); return { s, items: null }; })));
    // источник, который сейчас не ответил, — его материалы из прошлой загрузки
    let items = [];
    for (const { s, items: it } of res) items = items.concat(it || (old ? old.items.filter(x => x.src === s.id) : []));
    const seen = new Set();
    items = items.filter(x => now - x.date < MAX_AGE && x.date < now + 864e5 && !seen.has(x.link) && seen.add(x.link)).sort((a, b) => b.date - a.date);
    const out = { updated: now, items, errors, sources: SOURCES.map(s => ({ id: s.id, name: s.name, lang: s.lang, site: s.site })) };
    try { fs.mkdirSync(userData, { recursive: true }); fs.writeFileSync(cacheFile + '.tmp', JSON.stringify(out)); fs.renameSync(cacheFile + '.tmp', cacheFile); } catch (e) { /* без кэша */ }
    return out;
  }
  return async function news(force) {
    const c = readCache();
    if (!force && c && Date.now() - c.updated < FRESH) return c;
    if (!busy) busy = refresh().finally(() => { busy = null; });
    try { return await busy; } catch (e) { return c || { updated: 0, items: [], errors: [{ src: 'все', error: e.message }], sources: [] }; }
  };
}

module.exports = { make, parseFeed, SOURCES, WEEK };
