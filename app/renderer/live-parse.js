'use strict';
// Разбор страниц The Hendon Mob для вкладки «Офлайн-серии» (страницы скачивает main.js → live.js, здесь — только разбор).
//   list(html)      — календарь фестивалей за месяц: festival.php?a=l&y=2026&m=11
//   festival(html)  — расписание фестиваля: festival.php?a=r&n=71101
// Валюта бай-ина — по знаку перед суммой и стране фестиваля; пересчёт в доллары — в live.js окна (курсы из main.js).
(function (G) {
  const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11, january: 0, february: 1, march: 2, april: 3, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };
  const doc = (html) => new DOMParser().parseFromString(html, 'text/html');
  const txt = (n) => (n ? n.textContent : '').replace(/\s+/g, ' ').trim();
  const day = (y, m, d) => Date.UTC(y, m, d) / 864e5; // номер дня (UTC)
  // «9 - 18 Oct 2026», «27 Oct - 4 Nov 2026», «28 Aug 2026 - 9 Apr 2027», «2 Oct 2026», «Oct 2026», «27 October - 4 November 2026»
  function range(s) {
    const part = (p) => { const m = /^(\d{1,2})?\s*([A-Za-z]{3,9})?\s*(\d{4})?$/.exec(p.trim()); return m ? { d: m[1] ? +m[1] : null, m: m[2] && MON[m[2].toLowerCase()] != null ? MON[m[2].toLowerCase()] : null, y: m[3] ? +m[3] : null } : null; };
    const [a0, b0] = String(s || '').split(/\s+-\s+|\s*–\s*/); const b = part(b0 != null ? b0 : a0), a = b0 != null ? part(a0) : { ...b };
    if (!a || !b || b.y == null || b.m == null) return null;
    if (a.y == null) a.y = a.m != null && a.m > b.m ? b.y - 1 : b.y; if (a.m == null) a.m = b.m;
    const s1 = day(a.y, a.m, a.d || 1), e1 = b.d ? day(b.y, b.m, b.d) : day(b.y, b.m + 1, 0);
    return [s1, b0 == null && a.d == null ? e1 : e1];
  }
  function list(html) {
    const d = doc(html), out = [];
    d.querySelectorAll('tr.db-list__entry').forEach(r => {
      const a = r.querySelector('td.db-list__name a[href*="festival.php"]'); if (!a) return;
      const id = (/[?&]n=(\d+)/.exec(a.getAttribute('href') || '') || [])[1]; if (!id) return;
      const nm = txt(a), cell = txt(r.querySelector('td.db-list__name')), city = cell.slice(cell.lastIndexOf(nm) + nm.length).replace(/^\s*,\s*/, '').trim();
      const fl = r.querySelector('.db-list__flag span'), dt = txt(r.querySelector('.db-list__date')), rg = range(dt);
      if (!rg) return;
      out.push({ id: +id, name: nm, city, country: fl ? (fl.getAttribute('title') || txt(fl)) : '', iso3: fl ? ((/flag-tiny-([a-z]{3})/.exec(fl.className) || [])[1] || '') : '', tour: (r.querySelector('td.db-list__name img') || {}).alt || '', s: rg[0], e: rg[1], dt });
    });
    return out;
  }
  // ---- одна строка расписания ----
  const SYM = /^(A\$|NZ\$|HK\$|NT\$|S\$|C\$|R\$|US\$|MOP|CHF|Kč|zł|Ft|лв|kr|RM|Rp|[€$£¥₩₱₫₹฿₺R])\s*/;
  const num = (s) => { s = String(s).trim(); if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return +s.replace(/,/g, ''); if (/^\d{1,3}(\.\d{3})+$/.test(s)) return +s.replace(/\./g, ''); return +s.replace(/,/g, '.'); };
  const mult = (u) => !u ? 1 : /^k/i.test(u) ? 1e3 : /^(m|mil|million)/i.test(u) ? 1e6 : 1;
  // гарантия: «€150,000 Guaranteed», «€1.5m GTD», «$1M GTD», «₩300,000,000 guaranteed», «200K GTD»
  const GTD = /(A\$|NZ\$|HK\$|NT\$|S\$|C\$|R\$|US\$|CHF|Kč|zł|kr|[€$£¥₩₱₫₹฿₺])?\s?(\d[\d.,]*)\s?(k|m|mil|million)?\b\s*(?:guaranteed|gtd|garantiert|garantizad[oa]s?|garantit[oa]|garanti(?:s|e)?)/i;
  function gtdOf(s) { const m = GTD.exec(s || ''); if (!m) return null; const v = num(m[2]) * mult(m[3]); return v >= 1000 ? { v, sym: m[1] || '' } : null; }
  function row(tr, ctx) {
    const dc = tr.querySelector('td.date'), nc = tr.querySelector('td.name'); if (!dc || !nc) return null;
    const nn = tr.querySelector('td.event_notes'), tmp = nn ? nn.cloneNode(true) : null; if (tmp) tmp.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
    const notes = (tmp ? tmp.textContent : '').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
    // дата и время: из ссылки «в Google Календарь» (там год и точное время), иначе по тексту
    let t0 = null, t1 = null, tz = '';
    const g = dc.querySelector('a[href*="calendar"]');
    if (g) { const h = decodeURIComponent(g.getAttribute('href') || ''); const m = /dates=(\d{8})(?:T(\d{6}))?(?:\/(\d{8}))?/.exec(h); if (m) { t0 = m[1].slice(0, 4) + '-' + m[1].slice(4, 6) + '-' + m[1].slice(6, 8) + (m[2] ? 'T' + m[2].slice(0, 2) + ':' + m[2].slice(2, 4) : ''); if (m[3]) t1 = m[3].slice(0, 4) + '-' + m[3].slice(4, 6) + '-' + m[3].slice(6, 8); } const z = /ctz=([^&]+)/.exec(h); if (z) tz = z[1]; }
    const dtx = txt(dc).replace(/Add to Google Calendar/i, '').trim();
    if (!t0) {
      // «Tue 27 - Fri 30 Oct at 7.00 pm», «Fri 23 Oct», «Wed 28 Oct - Wed 4 Nov at 1.00 pm»
      const m1 = /^(?:[A-Za-z]{3}\s+)?(\d{1,2})(?:\s+([A-Za-z]{3,9}))?/.exec(dtx), mons = dtx.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/ig) || [];
      const mt = m1 && m1[2] && MON[m1[2].toLowerCase()] != null ? m1[2] : mons[0];
      const mo = mt ? MON[mt.toLowerCase()] : null;
      if (m1 && mo != null) { let y = ctx.y; if (ctx.m != null && mo < ctx.m - 6) y++; t0 = y + '-' + String(mo + 1).padStart(2, '0') + '-' + String(+m1[1]).padStart(2, '0'); }
      const tm = /at\s+(\d{1,2})[.:](\d{2})\s*(am|pm)?/i.exec(dtx); if (t0 && tm) { let h = +tm[1]; if (tm[3]) { h %= 12; if (/pm/i.test(tm[3])) h += 12; } t0 += 'T' + String(h).padStart(2, '0') + ':' + tm[2]; }
    }
    return Object.assign({ t1, tz, dtx }, ev(txt(nc), notes, t0));
  }
  // турнир по тексту: «€ 210 + 40 + 200 No Limit Hold'em - MYSTERY …» + заметки (стек, уровни, гарантия)
  function ev(nameText, notes, t0, gtd0) {
    let name = nameText, sym = '';
    const sm = SYM.exec(name); if (sm && /\d/.test(name.slice(sm[0].length, sm[0].length + 2))) { sym = sm[1]; name = name.slice(sm[0].length); }
    let parts = null; const bm = /^(\d[\d.,]*(?:\s*\+\s*\d[\d.,]*)*)\s+(.*)$/.exec(name);
    if (bm && sym) { parts = bm[1].split('+').map(num).filter(Number.isFinite); name = bm[2]; }
    const game = /omaha|plo\b|\bplo\d|pot limit o/i.test(name) ? 'PLO' : /hold.?em|nlh|nlhe/i.test(name) ? 'NLH' : /h\.?o\.?r\.?s\.?e|mixed|\b\d{1,2}[\s-]?game\b|dealer.?s choice|stud|razz|badugi|triple draw|2-7|pineapple|short deck|6\+/i.test(name) ? 'Mix' : (parts ? 'NLH' : '');
    const title = name.replace(/^(No Limit Hold'?em|Pot Limit Omaha(?:\s*\d\/?\d?)?|NLH|NLHE|PLO\d?)\s*[-–:]\s*/i, '').trim() || name;
    const sat = /satellite|\bsat\b|qualifier|\bstep\s*\d|mega\s*sat|super\s*sat|one\s*shot\s+to|accumulator/i.test(name);
    const g1 = gtd0 || (!sat ? gtdOf(name) : null) || gtdOf(notes);
    const st = /(\d[\d.,]*)\s*(k|K)?\s*(?:starting\s*)?(?:stack|chips)/.exec(notes) || /(?:chips|stack|starting stack)\s*:\s*(\d[\d.,\s]*\d|\d)\s*(k|K)?/i.exec(notes); const stack = st ? num(String(st[1]).replace(/\s/g, '')) * (st[2] ? 1000 : 1) : null;
    const lv = /(\d{1,3}(?:\/\d{1,3})?)\s*[- ]?\s*min(?:ute)?s?\b/i.exec(notes); const clock = lv ? lv[1] : '';
    const bounty = /bount|\bko\b|knockout|pko/i.test(name + ' ' + notes), myst = /myster/i.test(name + ' ' + notes);
    const flight = /\bday\s*(1[a-z]?|\d+[a-z]?)\b|\bflight\s*[a-z0-9]+|final\s*table|\bday\s*2\b/i.exec(name); const cont = !parts && /day\s*[2-9]|final\s*table|day\s*\d+\s*(?:&|and)|restart/i.test(name);
    // поздняя регистрация и ре-энтри: «Late reg Lvl 10», «Late reg 8 Levels», «UNL RE», «Single Re-entry», «Freezeout»
    const both = name + ' ' + notes;
    const lr = /late\s*reg(?:istration)?\.?\s*:?\s*(?:until\s*)?(?:lvl|level)?\s*(\d{1,2})\b|late\s*reg(?:istration)?\.?\s*(\d{1,2})\s*(?:lvls?|levels?)/i.exec(notes), lrs = /late\s*reg(?:istration)?\.?\s*(?:until\s*)?(start of day \d|closed|day \d)/i.exec(notes);
    const late = lr ? 'до ' + (lr[1] || lr[2]) + '-го уровня' : lrs ? (/closed/i.test(lrs[1]) ? 'закрыта' : 'до начала ' + lrs[1].replace(/start of /i, '').replace(/day/i, 'дня')) : '';
    const re = /\bUNL\s*RE\b|unlimited\s*re-?entr|re-?entr(?:y|ies)\s*:\s*unlimited/i.test(both) ? 'безлимитный ре-энтри' : /single\s*re-?entr|1\s*re-?entr/i.test(both) ? '1 ре-энтри' : (/(\d)\s*x?\s*re-?entr/i.exec(both) || [])[1] ? (/(\d)\s*x?\s*re-?entr/i.exec(both))[1] + ' ре-энтри' : /freeze\s*out/i.test(both) ? 'фризаут' : /re-?entr/i.test(both) ? 'ре-энтри' : /re-?buy/i.test(both) ? 'ребаи' : '';
    return { late, re, t0, sym, parts, buy: parts ? parts.reduce((a, b) => a + b, 0) : null, name: title, full: name, game, sat, gtd: g1, stack, clock, bounty, myst, flight: flight ? flight[0] : '', cont, main: /main\s*event/i.test(name), hr: /high\s*roller|super\s*high|\bhr\b/i.test(name), notes };
  }
  function festival(html) {
    const d = doc(html);
    if (/_cf_chl_opt|Just a moment|Enable JavaScript and cookies to continue/.test(html) && !d.querySelector('table.table--festival-schedule, .content-meta')) return { challenge: true };
    const h1 = d.querySelector('.content-meta h1'), fl = h1 && h1.querySelector('span[class*="flag"]');
    const name = h1 ? txt(h1).replace(fl ? txt(fl) : '', '').trim() : txt(d.querySelector('title')).replace(/:.*$/, '');
    const dates = txt(d.querySelector('.header-image__date')), rg = range(dates);
    const venue = txt(d.querySelector('.header-image__venue'));
    const ctx = { y: rg ? new Date(rg[0] * 864e5).getUTCFullYear() : new Date().getFullYear(), m: rg ? new Date(rg[0] * 864e5).getUTCMonth() : null };
    const rows = [...d.querySelectorAll('table.table--festival-schedule tr')].map(tr => row(tr, ctx)).filter(Boolean);
    const site = [...d.querySelectorAll('.content-meta a, .festival-info a, .header-image a')].map(a => a.getAttribute('href') || '').find(h => /^https?:\/\//.test(h) && !/hendonmob|google\.com/.test(h)) || '';
    return { name, venue, dates, s: rg ? rg[0] : null, e: rg ? rg[1] : null, country: fl ? (fl.getAttribute('title') || '') : '', rows, site, notFound: /was not found/i.test(txt(d.querySelector('.container-custom__main'))) };
  }
  // ---------- PokerDiscover (pokerdiscover.com): без защиты от ботов ----------
  // календарь: /series — все серии на год вперёд одной страницей
  function pdList(html) {
    const d = doc(html), out = [];
    d.querySelectorAll('div.tournaments[data-id]').forEach(it => {
      const a = it.querySelector('a.title'); if (!a) return;
      const tm = it.querySelector('time'), dt = tm ? tm.getAttribute('datetime') || '' : '', m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dt), r = /(\d{2})\.(\d{2})\s*-\s*(\d{2})\.(\d{2})/.exec(txt(tm));
      if (!m) return;
      const y = +m[1], s0 = day(y, +m[2] - 1, +m[3]); let e0 = s0;
      if (r) { let ey = y; if (+r[4] < +m[2]) ey++; e0 = day(ey, +r[4] - 1, +r[3]); }
      const loc = txt(it.querySelector('address span')), k = loc.lastIndexOf(','), fl = it.querySelector('[class*="flag-icon-"]');
      const title = txt(a), name = title.replace(/\s*\|\s*[^|]*?\d{1,2}\s*(?:-\s*\d{1,2}\s*)?[A-Z]{3}.*$/, '').trim() || title;
      out.push({ id: +it.getAttribute('data-id'), slug: (a.getAttribute('href') || '').replace(/^\/?series\//, ''), name, title, venue: txt(it.querySelector('address p')), city: k > 0 ? loc.slice(0, k).trim() : loc, country: k > 0 ? loc.slice(k + 1).trim() : '', iso2: fl ? ((/flag-icon-([a-z]{2})\b/.exec(fl.className) || [])[1] || '') : '', s: s0, e: e0 });
    });
    return out;
  }
  // расписание серии: /series/<slug>, вкладка «Tournaments» — ближайшие турниры (прошедшие сайт убирает)
  function pdFestival(html, y0) {
    const d = doc(html), rows = [];
    const y = y0 || new Date().getFullYear(); let lastM = null, yy = y;
    d.querySelectorAll('#tab-tournaments .custom-table__row').forEach(r => {
      const tm = txt(r.querySelector('.col-1')), m = /(\d{2})\.(\d{2})(?:\s+(\d{1,2}):(\d{2}))?/.exec(tm);
      let t0 = null; if (m) { if (lastM != null && +m[2] < lastM - 6) yy++; lastM = +m[2]; t0 = yy + '-' + m[2] + '-' + m[1] + (m[3] ? 'T' + m[3].padStart(2, '0') + ':' + m[4] : ''); }
      const c2 = r.querySelector('.col-2'); if (!c2) return;
      const lab = c2.querySelector('.label'), labT = txt(lab), main = c2.cloneNode(true); main.querySelectorAll('.label').forEach(x => x.remove());
      // «… (Event #1), Hold'em, Re-entry,» — служебные пометки сайта в конце строки
      let nameT = txt(main).replace(/,\s*$/, ''); const tags = [];
      for (;;) { const k = nameT.lastIndexOf(', '); if (k < 0) break; const tail = nameT.slice(k + 2).trim(); if (!/^(hold'?em|omaha.*|plo\d?|h\.o\.r\.s\.e\.?|mixed.*|stud.*|re-?entry|re-?buy|freezeout|turbo|hyper.*|deep\s*stack|knockout|bounty|registration closed|late registration|.*-max|heads.?up|short deck|pineapple.*|razz|badugi|2-7.*|8-game|dealer.?s choice)$/i.test(tail)) break; tags.push(tail); nameT = nameT.slice(0, k).trim(); }
      // гарантия-метка: «1 000 000€ Guaranteed», «$200.000 GTD»
      let g = null; const gm = /([€$£¥₩])?\s?(\d[\d .,]*\d|\d)\s?([€$£¥₩])?\s*(?:guaranteed|gtd)/i.exec(labT); if (gm) { const v = +gm[2].replace(/[ .,](?=\d{3}\b)/g, '').replace(/,/g, '.'); if (v >= 1000) g = { v, sym: gm[1] || gm[3] || '' }; }
      const notes = txt(r.querySelector('.custom-table__content-toggle'));
      const e = ev(nameT, notes + (tags.length ? ' ' + tags.join(' ') : ''), t0, g); e.notes = notes;
      if (!e.game) { const tg = tags.join(' '); e.game = /omaha|plo/i.test(tg) ? 'PLO' : /hold/i.test(tg) ? 'NLH' : tg ? 'Mix' : ''; }
      if (/registration closed/i.test(tags.join(' ')) && !e.parts) e.cont = true;
      e.tags = tags; e.total = txt(r.querySelector('.col-3 .block-medium'));
      if (!e.parts && e.total) { const bm2 = /^([€$£¥₩])?\s?(\d[\d .,]*\d|\d)\s?([€$£¥₩]|[A-Z]{3})?$/.exec(e.total); if (bm2) { const v = num(bm2[2].replace(/\s/g, '')); if (v > 0) { e.parts = [v]; e.buy = v; e.sym = bm2[1] || (bm2[3] && bm2[3].length === 1 ? bm2[3] : '') || (bm2[3] === 'EUR' ? '€' : bm2[3] === 'GBP' ? '£' : bm2[3] === 'USD' ? '$' : ''); e.cont = false; if (!e.game) e.game = 'NLH'; } } }
      rows.push(e);
    });
    const h1 = d.querySelector('h1'), org = [...d.querySelectorAll('*')].find(x => x.children.length === 0 && /^Organizer:/.test(txt(x)));
    return { name: h1 ? txt(h1) : '', venue: org ? txt(org).replace(/^Organizer:\s*/, '') : '', rows };
  }
  G.LIVEP = { list, festival, range, gtdOf, pdList, pdFestival };
  if (typeof module !== 'undefined') module.exports = G.LIVEP;
})(typeof window !== 'undefined' ? window : globalThis);
