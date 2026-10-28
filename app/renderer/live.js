'use strict';
// «Офлайн-серии»: живые покерные фестивали по всему миру на ближайшие 2 месяца (данные PokerDiscover; запасной источник — The Hendon Mob).
// Слева — серии с выбором региона и стран, справа — полное расписание выбранной серии: дата и время, бай-ин и гарантия
// в долларах (и в валюте серии), стартовый стек и длина уровней.
// Страницы скачивает main.js (live.js) — по одной, с паузами; разбор — renderer/live-parse.js.
// Расписания подкачиваются в фоне по одному раз в 25 с (ближайшие и крупные — первыми), чтобы знать гарантии и бай-ины
// всех серий; если сайт попросит проверку — фон останавливается на час, проверку проходит сам человек.
(function () {
  const root = document.getElementById('pgLive'); if (!root) return;
  const P = window.LIVEP, api = window.mda || {};
  const DAY = 864e5, WINDOW = 61; // окно — 2 месяца от сегодня
  const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };
  const today = () => Math.floor(Date.now() / DAY);

  // ---------- страны, регионы, валюты ----------
  const REG = [['eu', 'Европа'], ['cis', 'СНГ и Кавказ'], ['asia', 'Азия и Ближний Восток'], ['na', 'США и Канада'], ['latam', 'Латинская Америка'], ['africa', 'Африка'], ['oce', 'Океания'], ['other', 'Круизы и другое']];
  const REGN = Object.fromEntries(REG);
  const C = {};
  const add = (reg, s) => s.split('|').forEach(x => { const [en, ru, cur] = x.split(':'); C[en] = { ru, reg, cur: cur || 'USD' }; });
  add('eu', 'England:Англия:GBP|Scotland:Шотландия:GBP|Wales:Уэльс:GBP|Northern Ireland:Северная Ирландия:GBP|United Kingdom:Великобритания:GBP|Ireland:Ирландия:EUR|All-Ireland:Ирландия:EUR|France:Франция:EUR|Spain:Испания:EUR|Portugal:Португалия:EUR|Italy:Италия:EUR|Germany:Германия:EUR|Austria:Австрия:EUR|Switzerland:Швейцария:CHF|Liechtenstein:Лихтенштейн:CHF|Belgium:Бельгия:EUR|Netherlands:Нидерланды:EUR|Luxembourg:Люксембург:EUR|Denmark:Дания:DKK|Norway:Норвегия:NOK|Sweden:Швеция:SEK|Finland:Финляндия:EUR|Iceland:Исландия:ISK|Estonia:Эстония:EUR|Latvia:Латвия:EUR|Lithuania:Литва:EUR|Poland:Польша:PLN|Czech Republic:Чехия:EUR|Slovakia:Словакия:EUR|Hungary:Венгрия:HUF|Slovenia:Словения:EUR|Croatia:Хорватия:EUR|Serbia:Сербия:EUR|Bosnia & Herzegovina:Босния и Герцеговина:EUR|Montenegro:Черногория:EUR|North Macedonia:Северная Македония:EUR|Albania:Албания:EUR|Kosovo:Косово:EUR|Bulgaria:Болгария:EUR|Romania:Румыния:RON|Greece:Греция:EUR|Cyprus:Кипр:EUR|Northern Cyprus:Северный Кипр:EUR|Malta:Мальта:EUR|Monaco:Монако:EUR|San Marino:Сан-Марино:EUR|Andorra:Андорра:EUR|Gibraltar:Гибралтар:GBP|Isle of Man:Остров Мэн:GBP|Jersey:Джерси:GBP|Guernsey:Гернси:GBP|Faroe Islands:Фарерские острова:DKK|Åland Islands:Аландские острова:EUR|Turkey:Турция:TRY');
  add('cis', 'Russia:Россия:RUB|Belarus:Беларусь:BYN|Ukraine:Украина:UAH|Moldova:Молдова:EUR|Georgia:Грузия:USD|Armenia:Армения:USD|Azerbaijan:Азербайджан:USD|Kazakhstan:Казахстан:USD|Kyrgyzstan:Киргизия:USD|Uzbekistan:Узбекистан:USD|Tajikistan:Таджикистан:USD|Turkmenistan:Туркмения:USD');
  add('asia', 'South Korea:Южная Корея:KRW|Japan:Япония:JPY|China:Китай:CNY|Taiwan:Тайвань:TWD|Hong Kong:Гонконг:HKD|Macau:Макао:HKD|Vietnam:Вьетнам:USD|Philippines:Филиппины:PHP|Thailand:Таиланд:THB|Malaysia:Малайзия:MYR|Singapore:Сингапур:SGD|Indonesia:Индонезия:IDR|Cambodia:Камбоджа:USD|Laos:Лаос:USD|India:Индия:INR|Nepal:Непал:USD|Sri Lanka:Шри-Ланка:USD|Mongolia:Монголия:USD|United Arab Emirates:ОАЭ:AED|Israel:Израиль:ILS|Lebanon:Ливан:USD|Jordan:Иордания:USD|Bahrain:Бахрейн:USD|Qatar:Катар:USD|Kuwait:Кувейт:USD|Oman:Оман:USD|Saudi Arabia:Саудовская Аравия:USD|Pakistan:Пакистан:USD|Bangladesh:Бангладеш:USD|Brunei:Бруней:USD|North Korea:КНДР:USD');
  add('na', 'United States:США:USD|Canada:Канада:CAD|Bermuda:Бермуды:USD');
  add('latam', 'Mexico:Мексика:USD|Panama:Панама:USD|Costa Rica:Коста-Рика:USD|Colombia:Колумбия:USD|Peru:Перу:USD|Chile:Чили:USD|Argentina:Аргентина:USD|Uruguay:Уругвай:USD|Brazil:Бразилия:BRL|Bahamas:Багамы:USD|Dominican Republic:Доминикана:USD|Puerto Rico:Пуэрто-Рико:USD|Aruba:Аруба:USD|Netherlands Antilles:Нидерландские Антилы:USD|Sint Maarten:Синт-Мартен:USD|Jamaica:Ямайка:USD|Trinidad and Tobago:Тринидад и Тобаго:USD|Barbados:Барбадос:USD|Cayman Islands:Каймановы острова:USD|Guatemala:Гватемала:USD|Honduras:Гондурас:USD|El Salvador:Сальвадор:USD|Nicaragua:Никарагуа:USD|Ecuador:Эквадор:USD|Bolivia:Боливия:USD|Paraguay:Парагвай:USD|Venezuela:Венесуэла:USD|Cuba:Куба:USD|Belize:Белиз:USD|Guadeloupe:Гваделупа:EUR|Turks and Caicos Islands:Тёркс и Кайкос:USD|Antigua and Barbuda:Антигуа и Барбуда:USD|Federation of Saint Kitts and Nevis:Сент-Китс и Невис:USD|Grenada:Гренада:USD|Anguilla:Ангилья:USD|Haiti:Гаити:USD|Suriname:Суринам:USD|Guyana:Гайана:USD|French Guiana:Французская Гвиана:EUR');
  add('africa', 'South Africa:ЮАР:ZAR|Morocco:Марокко:EUR|Egypt:Египет:USD|Kenya:Кения:USD|Tanzania:Танзания:USD|Nigeria:Нигерия:USD|Ghana:Гана:USD|Mauritius:Маврикий:USD|Namibia:Намибия:ZAR|Botswana:Ботсвана:USD|Zambia:Замбия:USD|Zimbabwe:Зимбабве:USD|Tunisia:Тунис:EUR|Seychelles:Сейшелы:USD|Madagascar:Мадагаскар:EUR|Mozambique:Мозамбик:USD|Senegal:Сенегал:EUR|Ivory Coast:Кот-д’Ивуар:EUR|Ethiopia:Эфиопия:USD|Angola:Ангола:USD|Réunion Island:Реюньон:EUR|Swaziland:Эсватини:ZAR');
  add('oce', 'Australia:Австралия:AUD|New Zealand:Новая Зеландия:NZD|Fiji:Фиджи:USD|Guam:Гуам:USD|New Caledonia:Новая Каледония:EUR|Vanuatu:Вануату:USD|French Polynesia:Французская Полинезия:EUR|Northern Mariana Islands:Северные Марианские острова:USD|Marshall Islands:Маршалловы острова:USD|Nauru:Науру:USD');
  add('other', 'International:Круиз / международный:USD');
  // другие написания стран (у PokerDiscover)
  [['Czechia', 'Czech Republic'], ['Korea', 'South Korea'], ['Republic of Korea', 'South Korea'], ['Korea, Republic of', 'South Korea'], ['Viet Nam', 'Vietnam'], ['Macao', 'Macau'], ['Russian Federation', 'Russia'], ['Türkiye', 'Turkey'], ['UK', 'United Kingdom'], ['USA', 'United States'], ['Macedonia (FYROM)', 'North Macedonia'], ['Bosnia and Herzegovina', 'Bosnia & Herzegovina'], ['The Bahamas', 'Bahamas'], ['Aland Islands', 'Åland Islands'], ['Taiwan, Province of China', 'Taiwan'], ['Cabo Verde', 'International']].forEach(([a, b]) => { if (C[b] && !C[a]) C[a] = C[b]; });
  const cOf = (en) => C[en] || { ru: en || '—', reg: 'other', cur: 'USD' };
  // валюта по знаку перед суммой; «$», «kr», «¥» — по стране
  const SYMC = { '€': 'EUR', '£': 'GBP', '₩': 'KRW', '₱': 'PHP', '₫': 'VND', '₹': 'INR', '฿': 'THB', '₺': 'TRY', 'Kč': 'CZK', 'zł': 'PLN', 'Ft': 'HUF', 'лв': 'BGN', 'R': 'ZAR', 'RM': 'MYR', 'Rp': 'IDR', 'CHF': 'CHF', 'A$': 'AUD', 'NZ$': 'NZD', 'HK$': 'HKD', 'NT$': 'TWD', 'S$': 'SGD', 'C$': 'CAD', 'R$': 'BRL', 'MOP': 'MOP', 'US$': 'USD' };
  const curOf = (sym, country) => { const cc = cOf(country).cur; if (sym === '$') return /^(CAD|AUD|NZD|TWD|HKD|SGD)$/.test(cc) ? cc : 'USD'; if (sym === 'kr') return /^(SEK|NOK|DKK|ISK)$/.test(cc) ? cc : 'SEK'; if (sym === '¥') return cc === 'CNY' ? 'CNY' : 'JPY'; return SYMC[sym] || (sym ? null : cc); };
  let FX = { rates: { USD: 1 } };
  const usd = (v, cur) => { const r = cur && FX.rates[cur]; return r ? v / r : null; };
  const sp = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const money = (v) => v == null ? '—' : '$' + sp(v);
  const big = (v) => v == null ? '—' : v >= 1e6 ? '$' + (v / 1e6).toFixed(v >= 1e7 ? 0 : 2).replace(/\.?0+$/, '').replace('.', ',') + ' млн' : v >= 1e4 ? '$' + Math.round(v / 1e3) + ' тыс.' : money(v);
  const symTxt = (sym) => sym || '';
  const MONR = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const MONS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const dOf = (d) => new Date(d * DAY);
  const dTxt = (s, e) => { const a = dOf(s), b = dOf(e); if (s === e) return a.getUTCDate() + ' ' + MONS[a.getUTCMonth()]; return a.getUTCMonth() === b.getUTCMonth() ? a.getUTCDate() + '–' + b.getUTCDate() + ' ' + MONS[b.getUTCMonth()] : a.getUTCDate() + ' ' + MONS[a.getUTCMonth()] + ' – ' + b.getUTCDate() + ' ' + MONS[b.getUTCMonth()]; };

  // ---------- крупная серия: по сводке расписания, а пока её нет — по туру и названию ----------
  const TOURS = /^(WSOP|WSOPC|WPT|PSLIVE|APT|APPT|GUKPT|PPL|888|THMC|CNPWIN|TRITON|EPT|PGT|PKRGO|MPF|IO|KOV|TF|JPF|SUP)$/i;
  const BIGN = /\b(WSOP|World Series of Poker|EPT|European Poker Tour|WPT|World Poker Tour|Triton|APPT|Asia Pacific Poker Tour|Asian Poker Tour|PokerStars|Unibet|partypoker|888|GUKPT|Irish (?:Poker )?Open|Battle of Malta|Malta Poker Festival|Kings? of|King's|Merit|Eureka|Estrellas|Super Circuit|Millions?|Poker Masters|Super High Roller|Festival in|Circus Poker|Banco Casino Masters|Hendon Mob Championship|Poker Dream|Jeju Poker Festival|Gods of Poker|Hanoi Series|Novibet|Circuito Nacional|Barriere Poker Tour|CAPT)\b/i;
  const SMALL = /recurring|monthly|weekly|league|ladies|seniors|deaf|staff|cheap and deep|roughrider|amateur|apat|grosvenor g[23]00|star 250|monsterstacks|deepstacks? \d|lovers|christmas special|bring your friend|one day|trailblazer|cashcows/i;
  let SUM = {};
  const nameGtd = (f) => { const g = P.gtdOf(f.title || f.name); if (!g) return null; return usd(g.v, curOf(g.sym, f.country)); };
  function isBig(f) {
    const s = SUM[f.id];
    if (s && s.n) return (s.gtd || 0) >= 1e5 || (s.maxB || 0) >= 1000;
    const g = nameGtd(f); if (g != null) return g >= 1e5;
    if (SMALL.test(f.name)) return false;
    return TOURS.test(f.tour || '') || BIGN.test(f.name);
  }

  // ---------- состояние ----------
  const ST = (() => { try { return JSON.parse(localStorage.getItem('mda.live') || '{}') || {}; } catch (e) { return {}; } })();
  ST.reg = ST.reg || ''; ST.cs = Array.isArray(ST.cs) ? ST.cs : []; ST.mon = ST.mon || ''; ST.big = true; // только крупные серии: гарантия от $100 000, бай-ины от $1 000, крупные туры ST.q = '';
  ST.noSat = ST.noSat !== false; ST.gtdOnly = !!ST.gtdOnly; ST.game = ST.game || ''; ST.bi = ST.bi || '';
  const save = () => { try { localStorage.setItem('mda.live', JSON.stringify({ reg: ST.reg, cs: ST.cs, mon: ST.mon, big: ST.big, noSat: ST.noSat, gtdOnly: ST.gtdOnly, game: ST.game, bi: ST.bi, sel: ST.sel, pk: ST.pk })); } catch (e) { /* без сохранения */ } };
  let LIST = null, LERR = [], loading = false, FEST = {}, OPEN = null; // OPEN — { id, data | error | loading }
  const PREVIEW = !!window.LIVE_SAMPLE && !(api.liveList && api.liveFest && !api.livePreview);

  // ---------- каркас ----------
  root.classList.add('lv-page');
  const head = el('div', 'lv-head');
  const ht = el('div', 'nw-ht'); ht.append(el('h1', null, 'Офлайн-серии'), el('p', 'nw-sub', 'Крупные живые покерные фестивали по всему миру на ближайшие 2 месяца: гарантия от $100 000 или бай-ины от $1 000, туры WSOP, EPT, WPT, APT, Triton и другие. Нажмите на серию — справа откроется полное расписание: бай-ины и гарантии в долларах, стек и длина уровней.'));
  const tools = el('div', 'lv-tools');
  const pickB = el('button', 'btn lv-btn lv-pickb', 'Подобрать под бюджет'); pickB.type = 'button'; pickB.title = 'Подобрать серии и план турниров под вашу сумму';
  pickB.onclick = () => { if (PICK) { PICK = false; drawDet(); } else openPick(); pickB.classList.toggle('on', PICK); };
  tools.append(pickB);
  head.append(ht, tools);
  const regBar = el('div', 'lv-regs'); regBar.setAttribute('role', 'group'); regBar.setAttribute('aria-label', 'Регион');
  const cBar = el('div', 'lv-cs'); cBar.setAttribute('role', 'group'); cBar.setAttribute('aria-label', 'Страны');
  const monSeg = el('div', 'seg bx-seg lv-mon'); monSeg.setAttribute('role', 'group'); monSeg.setAttribute('aria-label', 'Месяц');
  const status = el('div', 'lv-status'); status.setAttribute('aria-live', 'polite');
  const filt = el('div', 'lv-filt'); filt.append(monSeg, status);
  const body = el('div', 'lv-body');
  const listBox = el('div', 'lv-list'); listBox.setAttribute('aria-label', 'Серии');
  const det = el('section', 'lv-det'); det.setAttribute('aria-label', 'Расписание серии'); det.tabIndex = -1;
  body.append(listBox, det);
  root.append(head, regBar, cBar, filt, body);

  // ---------- данные ----------
  const months = () => { const a = today(), b = a + WINDOW, out = []; let d = dOf(a); d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); while (d.getTime() / DAY <= b) { out.push([d.getUTCFullYear(), d.getUTCMonth() + 1]); d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)); } return out; };
  const fromSample = () => window.LIVE_SAMPLE.list.map(r => ({ id: r[0], name: r[1], city: r[2], country: r[3], iso3: r[4], tour: r[5], s: r[6], e: r[7] }));
  const sampleFest = (id) => { const f = window.LIVE_SAMPLE.fest[id]; if (!f) return null; return Object.assign({}, f, { rows: f.rows.map(r => ({ t0: r[0], t1: r[1], sym: r[2], parts: r[3], buy: r[3] ? r[3].reduce((a, b) => a + b, 0) : null, name: r[4], game: r[5], sat: !!r[6], gtd: r[7] ? { v: r[7][0], sym: r[7][1] } : null, stack: r[8], clock: r[9], bounty: !!r[10], myst: !!r[11], flight: r[12], cont: !!r[13], main: !!r[14], hr: !!r[15], notes: r[16] })) }); };
  async function loadList(force) {
    if (loading) return; loading = true; drawStatus();
    try {
      if (api.liveRates) { try { FX = await api.liveRates() || FX; } catch (e) { /* запасные */ } } else FX = { rates: { USD: 1, EUR: 0.93, GBP: 0.79, CAD: 1.38, AUD: 1.52, KRW: 1380, TWD: 32.5, HKD: 7.8, ZAR: 18, CZK: 23.4, PHP: 57, BRL: 5.6, SEK: 10.6, NOK: 10.9, DKK: 6.95, CHF: 0.86, ISK: 138 }, src: 'превью', t: Date.UTC(2026, 9, 27) };
      if (api.liveSum) { try { SUM = await api.liveSum(null) || {}; } catch (e) { SUM = {}; } }
      let errs = [], old = [];
      if (PREVIEW) { MH.sample = fromSample(); MH.sample.forEach(f => { const d = sampleFest(f.id); if (d) SUM[f.id] = summary(f, d); }); }
      else if (api.livePdList && !SRC_HM) {
        // основной источник — PokerDiscover: весь календарь одной страницей, без проверок «вы человек»
        const r = await api.livePdList(force, !root.hidden);
        if (r && r.html) { const L = P.pdList(r.html); if (L.length) MH.pd = L; }
        if (r && r.old) setTimeout(async () => { try { const n = await api.livePdList(true, !root.hidden); if (n && n.html && !n.error) { const L = P.pdList(n.html); if (L.length) { MH.pd = L; buildList(); drawRegions(); drawCountries(); drawList(); } } } catch (e) { /* остаётся сохранённый */ } }, 300);
        if (!MH.pd) { SRC_HM = true; loading = false; return loadList(force); } // PokerDiscover недоступен — запасной источник The Hendon Mob
      } else {
        for (const [y, m] of months()) {
          const r = await api.liveList(y, m, force, !root.hidden); // вкладка не открыта — окно проверки не показывать
          if (r && r.html) MH[y + '-' + m] = P.list(r.html);
          if (r && r.old) old.push([y, m]);
          if (r && r.error) errs.push({ y, m, msg: r.error, challenge: r.challenge, stale: r.stale });
        }
      }
      buildList(); LERR = errs;
      if (old.length) setTimeout(() => refreshMonths(old), 300); // сохранённый календарь — сразу, свежий — следом
    } catch (e) { LERR = [{ msg: 'Не удалось загрузить календарь: ' + (e && e.message || e) }]; }
    loading = false; drawAll(); bgStart();
  }
  const MH = {}; // серии по месяцам календаря
  function buildList() {
    const a = today(), b = a + WINDOW, seen = new Set(), all = Object.values(MH).flat();
    LIST = all.filter(f => { if (seen.has(f.id) || f.e < a || f.s > b || f.e - f.s > 60) return false; seen.add(f.id); return true; }).sort((x, y) => x.s - y.s || x.e - y.e);
  }
  async function refreshMonths(list) {
    for (const [y, m] of list) { try { const r = await api.liveList(y, m, true, !root.hidden); if (r && r.html && !r.error) { MH[y + '-' + m] = P.list(r.html); buildList(); drawRegions(); drawCountries(); drawList(); } } catch (e) { /* остаётся сохранённый */ } }
  }
  function summary(f, d) {
    const ev = d.rows.filter(r => r.buy && !r.sat), cur = (r) => curOf(r.sym, d.country || f.country);
    const bs = ev.map(r => usd(r.buy, cur(r))).filter(v => v != null), gs = d.rows.filter(r => r.gtd && !r.sat).map(r => usd(r.gtd.v, curOf(r.gtd.sym || r.sym, d.country || f.country))).filter(v => v != null);
    const me = ev.filter(r => r.main).map(r => usd(r.buy, cur(r))).filter(v => v != null);
    return { v: 3, ev: compact(f, d), n: d.rows.filter(r => r.buy).length, minB: bs.length ? Math.min(...bs) : null, maxB: bs.length ? Math.max(...bs) : null, gtd: gs.length ? Math.max(...gs) : null, me: me.length ? Math.max(...me) : null, at: Date.now() };
  }
  // турниры серии в сжатом виде — для подбора под бюджет (бай-ин и гарантия в $, флаги, сколько входов можно)
  function compact(f, d) {
    const country = d.country || f.country;
    // продолжения (Day 2, Day 3, Final Day) — не новый турнир, даже если у строки указан бай-ин
    const CONT = /\bday\s*[2-9]\b|\bfinal\s*(?:day|table)\b|\bday\s*\d+\s*(?:&|and)\b|\brestart\b/i;
    return d.rows.filter(r => r.buy && !r.cont && !CONT.test(r.name || '')).map(r => {
      const b = usd(r.buy, curOf(r.sym, country)); if (b == null) return null;
      const g = r.gtd ? usd(r.gtd.v, curOf(r.gtd.sym || r.sym, country)) : null, re = r.re || '', mx = /^(\d) ре-энтри/.exec(re);
      const evn = /event\s*#\s*(\d+[a-z]?)/i.exec(r.name || ''); // флайты одного турнира — по номеру Event #, иначе по названию
      const k = evn ? '#' + evn[1].toLowerCase() : (r.name || '').replace(/[\s,(\-–:]*\b(?:day\s*1\s*[a-z]?|flight\s*[a-z0-9]+)\b.*$/i, '').trim().toLowerCase(); // флайты одного турнира (Day 1A, 1B…) — один ключ
      return { t: r.t0 || '', b: Math.round(b), g: g ? Math.round(g) : 0, f: (r.main ? 'm' : '') + (r.hr ? 'h' : '') + (r.sat ? 's' : '') + (r.bounty || r.myst ? 'x' : '') + (r.game && r.game !== 'NLH' ? 'o' : ''), n: String(r.name || '').slice(0, 100), c: /фризаут/.test(re) ? 1 : mx ? +mx[1] + 1 : 99, k };
    }).filter(Boolean);
  }
  async function getFest(f, force, bg) {
    if (f.slug && api.livePdFest) {
      const r = await api.livePdFest(f.slug, force, !bg);
      if (bg && !force && r && r.old) return getFest(f, true, bg); // фон: сохранённое устарело — берём свежее с сайта
      if (!r || (!r.html && r.error)) return { error: r ? r.error : 'Нет ответа', challenge: r && r.challenge };
      const d0 = P.pdFestival(r.html, dOf(f.s).getUTCFullYear()), d = { name: f.name, venue: f.venue ? f.venue + (f.city ? ', ' + f.city : '') : d0.venue, country: f.country, rows: d0.rows };
      const out = { data: d, stale: r.stale, t: r.t, cached: !!r.cached };
      if (r.old && !bg && !force) setTimeout(async () => { const n = await getFest(f, true, root.hidden).catch(() => null); if (n && n.data && OPEN && OPEN.f.id === f.id && !OPEN.loading) { OPEN = Object.assign({ f }, n); drawDet(); drawList(); } }, 200);
      const s = d.rows.length ? summary(f, d) : { n: 0 }; s.at = r.stale ? Date.now() : r.t || Date.now(); /* сайт не ответил — не опрашивать каждые 2 с */ SUM[f.id] = s; if (api.liveSum) api.liveSum(f.id, s).catch(() => {});
      return out;
    }
    if (PREVIEW) { const d = sampleFest(f.id); return d ? { data: d } : { error: 'В превью полное расписание есть у трёх серий: Battle of Malta, WSOPC Dusk Till Dawn и Circus Poker Series. В программе — у всех.', preview: true }; }
    const r = await api.liveFest(f.id, force, !bg); // фон окно проверки не показывает
    if (bg && !force && r && r.old) return getFest(f, true, bg);
    if (!r || (!r.html && r.error)) return { error: r ? r.error : 'Нет ответа', challenge: r && r.challenge };
    const d = P.festival(r.html);
    if (d.challenge) return { error: 'Сайт The Hendon Mob попросил подтвердить, что вы не робот.', challenge: true };
    const out = { data: d, stale: r.stale, t: r.t };
    // сохранённое расписание показано сразу; если оно старше 3 дней — свежее подгружается следом и подменяет его
    if (r.old && !bg && !force) setTimeout(async () => { const n = await getFest(f, true, root.hidden).catch(() => null); if (n && n.data && OPEN && OPEN.f.id === f.id && !OPEN.loading) { OPEN = Object.assign({ f }, n); drawDet(); drawList(); } }, 200);
    if (d.rows.length) { const s = summary(f, d); s.at = r.stale ? Date.now() : r.t || Date.now(); /* сайт не ответил — не опрашивать каждые 2 с */ SUM[f.id] = s; if (api.liveSum) api.liveSum(f.id, s).catch(() => {}); }
    else { SUM[f.id] = { n: 0, at: Date.now() }; if (api.liveSum) api.liveSum(f.id, SUM[f.id]).catch(() => {}); }
    if (r.challenge) out.challenge = true;
    return out;
  }

  // ---------- фоновая подкачка расписаний ----------
  let bgT = null, bgGap = 6e3, bgPause = 0, bgBusy = false, SRC_HM = false; // SRC_HM — запасной источник (The Hendon Mob)
  function bgNext() {
    if (!LIST) return null;
    const fresh = (s) => s && Date.now() - s.at < 3 * DAY && (s.v === 3 || !s.n); // v3 — со списком турниров для подбора
    const todo = LIST.filter(f => !fresh(SUM[f.id]));
    todo.sort((a, b) => (isBig(b) - isBig(a)) || a.s - b.s);
    return todo[0] || null;
  }
  function bgStart() { if (PREVIEW || !api.liveFest || bgT) return; bgT = setTimeout(bgTick, 3e3); }
  async function bgTick() {
    bgT = null; if (bgBusy) return;
    if (Date.now() < bgPause) { bgT = setTimeout(bgTick, bgPause - Date.now() + 1e3); return; }
    const f = bgNext(); if (!f) { drawStatus(); return; }
    if (OPEN && OPEN.loading) { bgT = setTimeout(bgTick, 5e3); return; }
    bgBusy = true;
    let quick = false;
    try { const r = await getFest(f, false, true); quick = !!r.cached; if (r.challenge && !r.data) { bgPause = Date.now() + 20 * 60e3; bgGap = Math.min(bgGap * 2, 120e3); } }
    catch (e) { /* следующая */ }
    bgBusy = false; drawList(); drawStatus(); if (PICK) pickSoon(4e3);
    bgT = setTimeout(bgTick, quick ? 120 : SRC_HM || PREVIEW ? bgGap : 2e3); // взято с диска — следующая сразу
  }

  // ---------- рисование ----------
  const known = () => LIST ? LIST.filter(f => SUM[f.id] && SUM[f.id].at).length : 0;
  function drawStatus() {
    status.replaceChildren();
    if (loading) { status.append(el('span', null, 'Загружаю календарь…' + (SRC_HM ? ' Если откроется окно сайта «Подтвердите, что вы человек» — поставьте галочку один раз, дальше всё загрузится само.' : ''))); return; }
    if (!LIST) return;
    const k = known(), n = LIST.length;
    const t = el('span', null, PREVIEW ? 'Превью: календарь на 27 октября 2026' : 'Расписаний собрано: ' + k + ' из ' + n + (k < n ? (Date.now() < bgPause ? ' · подкачка на паузе (сайт попросил проверку)' : ' · подкачиваются в фоне') : ''));
    status.append(t);
    if (!PREVIEW && FX.src) status.append(el('span', 'lv-fx', 'курсы: ' + (FX.src === 'запасные курсы' ? 'примерные' : 'на ' + new Date(FX.t).toLocaleDateString('ru-RU'))));
  }
  const filtered = () => {
    if (!LIST) return [];
    return LIST.filter(f => {
      const c = cOf(f.country);
      if (ST.reg && c.reg !== ST.reg) return false;
      if (ST.cs.length && !ST.cs.includes(f.country)) return false;
      if (ST.big && !isBig(f)) return false;
      if (ST.mon) { const [y, m] = ST.mon.split('-').map(Number), a = Date.UTC(y, m - 1, 1) / DAY, b = Date.UTC(y, m, 0) / DAY; if (f.e < a || f.s > b) return false; }
      if (ST.q) { const s = (f.name + ' ' + f.city + ' ' + f.country + ' ' + c.ru + ' ' + f.tour).toLowerCase(); if (!s.includes(ST.q)) return false; }
      return true;
    });
  };
  function drawRegions() {
    regBar.replaceChildren();
    const base = (LIST || []).filter(f => !ST.big || isBig(f));
    const cnt = {}; base.forEach(f => { const r = cOf(f.country).reg; cnt[r] = (cnt[r] || 0) + 1; });
    const tile = (id, label, n) => { const b = el('button', 'lv-reg' + (ST.reg === id ? ' on' : '')); b.type = 'button'; b.setAttribute('aria-pressed', String(ST.reg === id)); b.append(el('b', null, label), el('span', null, n + ' ' + plural(n, 'серия', 'серии', 'серий'))); b.onclick = () => { ST.reg = id; ST.cs = []; save(); drawAll(); }; return b; };
    regBar.append(tile('', 'Весь мир', base.length));
    REG.forEach(([id, l]) => { if (cnt[id]) regBar.append(tile(id, l, cnt[id])); });
  }
  const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };
  function drawCountries() {
    cBar.replaceChildren();
    const base = (LIST || []).filter(f => (!ST.big || isBig(f)) && (!ST.reg || cOf(f.country).reg === ST.reg));
    const cnt = new Map(); base.forEach(f => cnt.set(f.country, (cnt.get(f.country) || 0) + 1));
    const arr = [...cnt].sort((a, b) => b[1] - a[1] || cOf(a[0]).ru.localeCompare(cOf(b[0]).ru, 'ru'));
    if (!arr.length) return;
    const all = el('button', 'lv-c' + (!ST.cs.length ? ' on' : ''), 'Все страны'); all.type = 'button'; all.setAttribute('aria-pressed', String(!ST.cs.length)); all.onclick = () => { ST.cs = []; save(); drawAll(); }; cBar.append(all);
    arr.forEach(([en, n]) => { const on = ST.cs.includes(en), b = el('button', 'lv-c' + (on ? ' on' : '')); b.type = 'button'; b.setAttribute('aria-pressed', String(on)); b.append(document.createTextNode(cOf(en).ru), el('span', null, String(n))); b.title = on ? 'Убрать страну из выбора' : 'Добавить страну — можно выбрать несколько'; b.onclick = () => { ST.cs = on ? ST.cs.filter(x => x !== en) : ST.cs.concat([en]); save(); drawAll(); }; cBar.append(b); });
  }
  function drawMonths() {
    monSeg.replaceChildren();
    const ms = months().map(([y, m]) => y + '-' + m);
    if (ST.mon && !ms.includes(ST.mon)) ST.mon = '';
    [['', 'Все месяцы']].concat(ms.map(k => { const [y, m] = k.split('-').map(Number); return [k, MONR[m - 1].replace(/^./, c => c.toUpperCase()) + (y !== new Date().getFullYear() ? ' ' + y : '')]; })).forEach(([v, l]) => { const b = el('button', ST.mon === v ? 'on' : null, l); b.type = 'button'; b.onclick = () => { ST.mon = v; save(); drawAll(); }; monSeg.append(b); });
  }
  // список перерисовывается на месте: прокрутка сохраняется, двигается только колёсиком
  function drawList() { const top = listBox.scrollTop; drawList0(); listBox.scrollTop = top; }
  function drawList0() {
    listBox.replaceChildren();
    if (!LIST) { listBox.append(loading ? window.mdaLoad('Загружаю календарь…' + (SRC_HM ? ' Если откроется окно сайта «Подтвердите, что вы человек» — поставьте галочку один раз, дальше всё загрузится само.' : '')) : el('p', 'lv-empty', 'Календарь ещё не загружен.')); return; }
    LERR.filter((e, i) => LERR.findIndex(x => x.msg === e.msg) === i).forEach(e => { const w = el('div', 'lv-warn'); w.append(el('span', null, e.msg + (e.stale ? ' Показана последняя сохранённая версия.' : ''))); if (e.challenge && api.livePass) { const b = el('button', 'btn lv-btn', 'Пройти проверку'); b.type = 'button'; b.onclick = async () => { b.disabled = true; await api.livePass('list', e.y, e.m); loadList(false); }; w.append(b); } listBox.append(w); });
    const arr = filtered(), a = today();
    if (!arr.length) { listBox.append(el('p', 'lv-empty', 'Крупных серий по этим условиям нет — выберите другой регион, страну или месяц.')); return; }
    let grp = null;
    arr.forEach(f => {
      const g = f.s <= a ? 'now' : (() => { const d = dOf(f.s); return d.getUTCFullYear() + '-' + d.getUTCMonth(); })();
      if (g !== grp) { grp = g; const d = dOf(f.s); listBox.append(el('h3', 'lv-grp', g === 'now' ? 'Идут сейчас' : MONR[d.getUTCMonth()].replace(/^./, c => c.toUpperCase()) + ' ' + d.getUTCFullYear())); }
      const c = cOf(f.country), s = SUM[f.id];
      const it = el('button', 'lv-it' + (ST.sel === f.id ? ' on' : '')); it.type = 'button'; it.setAttribute('aria-pressed', String(ST.sel === f.id));
      const dt = el('div', 'lv-it-d'), A = dOf(f.s), B = dOf(f.e); dt.append(el('b', null, A.getUTCDate() + ' ' + MONS[A.getUTCMonth()]), el('b', 'to', f.e > f.s ? '– ' + B.getUTCDate() + ' ' + MONS[B.getUTCMonth()] : ''), el('span', null, (f.e - f.s + 1) + ' ' + plural(f.e - f.s + 1, 'день', 'дня', 'дней')));
      const mid = el('div', 'lv-it-m'); mid.append(el('b', null, f.name));
      const sub = el('span', 'lv-it-s', (f.city ? f.city + ', ' : '') + c.ru); mid.append(sub);
      if (s && s.n) { const z = el('span', 'lv-it-z'); z.append(el('em', null, s.n + ' ' + plural(s.n, 'турнир', 'турнира', 'турниров'))); if (s.minB != null) z.append(el('em', null, money(s.minB) + (s.maxB > s.minB ? '–' + money(s.maxB) : ''))); if (s.gtd) z.append(el('em', 'g', 'GTD до ' + big(s.gtd))); mid.append(z); }
      else if (s && s.at && !s.n) mid.append(el('span', 'lv-it-z dim', 'расписание ещё не опубликовано'));
      it.append(dt, mid);
      if (f.s <= a && f.e >= a) it.append(el('i', 'lv-live', 'идёт'));
      it.onclick = () => openFest(f);
      listBox.append(it);
    });
  }
  function drawAll() { drawRegions(); drawCountries(); drawMonths(); drawStatus(); drawList(); if (PICK) drawPickRes(); else if (!OPEN) drawDet(); } // подбор следует за регионом, страной и месяцем

  // ---------- расписание серии ----------
  async function openFest(f, force) {
    if (PICK) { FROMPICK = true; PICK = false; pickB.classList.remove('on'); } else if (!force) FROMPICK = false;
    ST.sel = f.id; save(); drawList();
    OPEN = { f, loading: true }; drawDet();
    let r; try { r = await getFest(f, force); } catch (e) { r = { error: String(e && e.message || e) }; }
    if (!OPEN || OPEN.f.id !== f.id) return;
    OPEN = Object.assign({ f }, r); drawDet(); drawList();
  }
  const fmtDay = (iso) => { const d = new Date(iso.slice(0, 10) + 'T00:00:00Z'); return d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' }).replace(/^./, c => c.toUpperCase()); };
  const kNum = (v) => v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0).replace('.', ',') + 'K' : String(v);
  function drawDet() {
    if (PICK) return drawPick();
    det.replaceChildren();
    if (!OPEN) { const p = el('div', 'lv-ph'); p.append(el('b', null, 'Выберите серию слева'), el('span', null, 'Здесь появится её полное расписание: дни и время, бай-ины и гарантии в долларах, стартовый стек и длина уровней.')); det.append(p); return; }
    const f = OPEN.f, c = cOf(f.country);
    const h = el('div', 'lv-dh');
    const t = el('div'); t.append(el('h2', null, (OPEN.data && OPEN.data.name) || f.name), el('p', null, [OPEN.data && OPEN.data.venue || f.city, c.ru, dTxt(f.s, f.e)].filter(Boolean).join(' · ')));
    const pd = !!f.slug || PREVIEW;
    const ln = el('a', 'lv-src', pd ? 'PokerDiscover ↗' : 'The Hendon Mob ↗'); ln.href = f.slug ? 'https://pokerdiscover.com/series/' + f.slug : PREVIEW ? 'https://pokerdiscover.com/series' : 'https://pokerdb.thehendonmob.com/festival.php?a=r&n=' + f.id; ln.target = '_blank'; ln.rel = 'noopener'; ln.title = pd ? 'Страница серии на сайте PokerDiscover' : 'Страница серии на сайте The Hendon Mob';
    const acts = el('div', 'lv-dh-a');
    if (FROMPICK) { const bb = el('button', 'btn lv-btn', '← К подбору'); bb.type = 'button'; bb.onclick = openPick; acts.append(bb); }
    acts.append(ln);
    if (!PREVIEW && api.liveFest) { const rb = el('button', 'btn lv-btn', 'Обновить'); rb.type = 'button'; rb.onclick = () => openFest(f, true); acts.append(rb); }
    h.append(t, acts); det.append(h);
    if (OPEN.loading) { det.append(window.mdaLoad('Загружаю расписание…' + (SRC_HM ? ' Если откроется окно сайта «Подтвердите, что вы человек» — поставьте галочку один раз, дальше всё загрузится само.' : ''))); return; }
    if (OPEN.error && !OPEN.data) {
      const w = el('div', 'lv-warn'); w.append(el('span', null, OPEN.error));
      if (OPEN.challenge && api.livePass) { const b = el('button', 'btn lv-btn', 'Пройти проверку'); b.type = 'button'; b.onclick = async () => { b.disabled = true; const r = await api.livePass('fest', f.id); if (r && r.ok) openFest(f); else b.disabled = false; }; w.append(b, el('small', null, 'Откроется окно сайта — поставьте галочку «Я не робот», окно закроется само.')); }
      det.append(w); return;
    }
    const d = OPEN.data, country = d.country || f.country;
    if (OPEN.stale) det.append(el('p', 'lv-note', 'Сайт сейчас недоступен — показана сохранённая версия расписания.'));
    if (!d.rows.length) { det.append(el('p', 'lv-empty', 'Организатор ещё не опубликовал расписание этой серии. Обычно оно появляется за 2–4 недели до старта.')); return; }
    const s = summary(f, d);
    const chips = el('div', 'lv-chips');
    const chip = (k, v, cls) => { const x = el('div', 'lv-chip' + (cls ? ' ' + cls : '')); x.append(el('span', null, k), el('b', null, v)); chips.append(x); };
    chip('Турниров', String(s.n)); if (s.minB != null) chip('Бай-ины', money(s.minB) + (s.maxB > s.minB ? ' – ' + money(s.maxB) : ''));
    if (s.me) chip('Главное событие', money(s.me)); if (s.gtd) chip('Макс. гарантия', big(s.gtd), 'g');
    det.append(chips);
    // фильтры расписания
    const fb = el('div', 'lv-ff');
    const tog = (label, key, help) => { const b = el('button', 'lv-tg' + (ST[key] ? ' on' : ''), label); b.type = 'button'; b.setAttribute('aria-pressed', String(!!ST[key])); if (help) b.title = help; b.onclick = () => { ST[key] = !ST[key]; save(); drawDet(); }; return b; };
    const seg = (key, opts, label) => { const g = el('div', 'seg bx-seg'); g.setAttribute('role', 'group'); g.setAttribute('aria-label', label); opts.forEach(([v, l]) => { const b = el('button', ST[key] === v ? 'on' : null, l); b.type = 'button'; b.onclick = () => { ST[key] = v; save(); drawDet(); }; g.append(b); }); return g; };
    fb.append(tog('Без сателлитов', 'noSat', 'Скрыть сателлиты и отборочные'), tog('Только с гарантией', 'gtdOnly'),
      seg('game', [['', 'Все игры'], ['NLH', 'Холдем'], ['PLO', 'Омаха'], ['Mix', 'Другие']], 'Игра'),
      seg('bi', [['', 'Любой бай-ин'], ['a', 'до $300'], ['b', '$300–1 000'], ['c', '$1 000–3 000'], ['d', '$3 000+']], 'Бай-ин'));
    det.append(fb);
    const inBi = (v) => !ST.bi || v == null ? !ST.bi : ST.bi === 'a' ? v < 300 : ST.bi === 'b' ? v >= 300 && v < 1000 : ST.bi === 'c' ? v >= 1000 && v < 3000 : v >= 3000;
    const rows = d.rows.filter(r => {
      if (ST.noSat && r.sat) return false;
      const cur = curOf(r.sym, country), bu = r.buy != null ? usd(r.buy, cur) : null;
      if (ST.gtdOnly && !r.gtd) return false;
      if (ST.game && r.game && r.game !== ST.game) return false;
      if (ST.game && !r.game && !r.cont) return false;
      if (ST.bi && !(r.cont || r.buy == null) && !inBi(bu)) return false;
      if (ST.bi && (r.cont || r.buy == null)) return false;
      return true;
    });
    if (!rows.length) { det.append(el('p', 'lv-empty', 'Под эти фильтры турниров нет.')); return; }
    const tb = el('div', 'lv-tb'); const hd = el('div', 'lv-tr lv-th'); ['Время', 'Турнир', 'Бай-ин', 'Гарантия', 'Стек · уровень · рег.'].forEach(x => hd.append(el('span', null, x))); tb.append(hd);
    let day = '';
    rows.forEach(r => {
      const dd = (r.t0 || '').slice(0, 10);
      if (dd && dd !== day) { day = dd; tb.append(el('div', 'lv-day', fmtDay(dd))); }
      const cur = curOf(r.sym, country), bu = r.buy != null ? usd(r.buy, cur) : null;
      const tr = el('div', 'lv-tr' + (r.cont || r.buy == null ? ' cont' : '') + (r.main ? ' main' : '') + (r.sat ? ' sat' : ''));
      tr.append(el('span', 'lv-tm', r.t0 && r.t0.length > 10 ? r.t0.slice(11, 16) : '—'));
      const nm = el('div', 'lv-nm'); nm.append(el('b', null, r.name));
      const tags = el('span', 'lv-tags');
      const tag = (x, cls) => tags.append(el('i', cls || null, x));
      if (r.main) tag('Главное событие', 'm'); if (r.hr) tag('Хайроллер', 'h'); if (r.myst) tag('Мистери-баунти', 'b'); else if (r.bounty) tag('Баунти', 'b');
      if (r.game && r.game !== 'NLH') tag(r.game === 'PLO' ? 'Омаха' : 'Другая игра'); if (r.sat) tag('Сателлит', 's'); if (r.cont) tag('продолжение', 's');
      if (tags.childNodes.length) nm.append(tags);
      const extra = (r.notes || '').split('\n').filter(x => !/guaranteed prize pool/i.test(x)).join(' ').replace(/\d[\d.,]*\s*k?\s*(?:starting\s*)?(?:stack|chips)\s*,?/ig, '').replace(/\d{1,3}(?:\/\d{1,3})?\s*[- ]?min(?:ute)?s?\s*(?:clock|levels?)?\s*,?/ig, '').replace(/late\s*reg(?:istration)?\.?[^,.]*[,.]?/ig, '').replace(/\bUNL\s*RE\b|unl(?:imited)?\.?\s*re-?entry/ig, '').replace(/re-?entr(?:y|ies)\s*:\s*[\w-]+/ig, '').replace(/(?:chips|starting stack|stack)\s*:\s*[\d\s.,]+k?/ig, '').replace(/late\s*reg(?:istration)?\s*:\s*[^,.]*/ig, '').replace(/^[\s,.;]+|[\s,.;]+$/g, '').replace(/\s{2,}/g, ' ').trim(); if (extra) { const n = el('small', null, extra); nm.append(n); }
      tr.append(nm);
      const bc = el('span', 'lv-bi'); if (r.buy != null) { bc.append(el('b', null, bu != null ? money(bu) : symTxt(r.sym) + sp(r.buy))); if (cur !== 'USD') bc.append(el('small', null, symTxt(r.sym) + r.parts.map(sp).join(' + '))); else if (r.parts.length > 1) bc.append(el('small', null, '$' + r.parts.map(sp).join(' + '))); } else bc.append(el('span', 'dim', '—'));
      tr.append(bc);
      const gc = el('span', 'lv-gt'); if (r.gtd) { const gcur = curOf(r.gtd.sym || r.sym, country), gu = usd(r.gtd.v, gcur); gc.append(el('b', null, gu != null ? big(gu) : symTxt(r.gtd.sym) + sp(r.gtd.v))); if (gcur !== 'USD') gc.append(el('small', null, symTxt(r.gtd.sym || r.sym) + sp(r.gtd.v))); } else gc.append(el('span', 'dim', '—'));
      tr.append(gc);
      const st = el('span', 'lv-st'); st.append(el('b', null, [r.stack ? kNum(r.stack) : '', r.clock ? r.clock + ' мин' : ''].filter(Boolean).join(' · ') || '—'));
      if (r.late) st.append(el('small', null, 'поздняя рег. ' + r.late)); if (r.re) st.append(el('small', null, r.re));
      st.title = 'Стартовый стек · длина уровня' + (r.late ? '\nПоздняя регистрация: ' + r.late : '') + (r.re ? '\nВход: ' + r.re : '');
      tr.append(st);
      tb.append(tr);
    });
    det.append(tb);
    det.append(el('p', 'lv-note', 'Бай-ины и гарантии пересчитаны в доллары по курсу ' + (FX.src === 'запасные курсы' ? '(примерному)' : 'на ' + (FX.t ? new Date(FX.t).toLocaleDateString('ru-RU') : 'сегодня')) + '; ниже мелко — в валюте серии. Время — местное время площадки. ' + (PREVIEW ? 'Превью — сохранённый пример расписания; в программе оно загружается с PokerDiscover' : 'Источник — ' + (f.slug ? 'PokerDiscover' : 'The Hendon Mob')) + '; перед поездкой сверяйте расписание с организатором.'));
  }

  // ---------- подбор серии под бюджет ----------
  // Игрок задаёт сумму, диапазон бай-инов, какие турниры играет, сколько турниров и сколько входов в каждый.
  // Для каждой серии строится план: главное событие (если выбрано) — первым, дальше по выбранному порядку;
  // из флайтов одного турнира — один, два турнира со стартом ближе 3 часов не ставятся, прошедшие — пропускаются.
  // Серии ранжируются: больше турниров / крупнее гарантии / раньше. План можно поправить галочками.
  let PICK = false, FROMPICK = false, pickT = null, pickForm = null, pickRes = null;
  const PEDIT = {}, POPEN = new Set();
  const PK0 = { fill: true, bud: 3000, lo: 0, hi: 0, n: 6, ent: 1.5, main: true, side: true, hr: false, bnt: true, sat: false, nlh: true, sort: 'n' };
  ST.pk = Object.assign({}, PK0, ST.pk && typeof ST.pk === 'object' ? ST.pk : {}); delete ST.pk.trav; // бюджет — только покерные расходы
  const pickSoon = (ms) => { if (pickT) return; pickT = setTimeout(() => { pickT = null; if (PICK) drawPickRes(); }, ms || 150); };
  function openPick() { PICK = true; FROMPICK = false; pickB.classList.add('on'); pickForm = null; drawPick(); }
  const tms = (t) => { if (!t) return null; const v = Date.parse(t.length > 10 ? t.slice(0, 16) + ':00Z' : t.slice(0, 10) + 'T00:00:00Z'); return Number.isFinite(v) ? v : null; };
  const kind = (e) => e.f.includes('s') ? 'sat' : e.f.includes('m') ? 'main' : e.f.includes('h') ? 'hr' : e.f.includes('x') ? 'bnt' : 'side';
  const entOf = (e, ent) => Math.min(ent, e.c);
  function cands(f) {
    const s = SUM[f.id]; if (!s || !s.ev) return null;
    const mon = ST.mon ? (([y, m]) => [Date.UTC(y, m - 1, 1), Date.UTC(y, m, 1)])(ST.mon.split('-').map(Number)) : null;
    const k = ST.pk, now = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60e3) / DAY) * DAY; // сегодня по местной дате
    return s.ev.map((e, i) => Object.assign({ i, ms: tms(e.t) }, e)).filter(e => {
      if (e.ms != null && e.ms < now) return false; // уже прошёл
      if (mon && e.ms != null && (e.ms < mon[0] || e.ms >= mon[1])) return false; // выбран месяц — турниры этого месяца
      if (k.lo && e.b < k.lo) return false; if (k.hi && e.b > k.hi) return false;
      if (k.nlh && e.f.includes('o')) return false;
      const any = k.main || k.side || k.bnt || k.hr || k.sat; // ни один вид не выбран — все виды
      return !any || !!k[kind(e)];
    });
  }
  // стоимость плана: первый флайт турнира — бай-ин × входы, каждый следующий флайт того же турнира — ещё один вход (бай-ин)
  function costs(pick, k) {
    const seen = new Set(), m = new Map();
    pick.slice().sort((a, b) => (a.ms || 0) - (b.ms || 0)).forEach(e => { m.set(e.i, seen.has(e.k) ? e.b : e.b * entOf(e, k.ent)); seen.add(e.k); });
    return m;
  }
  const clash = (pick, e) => e.ms != null && pick.some(p => p.ms != null && Math.abs(p.ms - e.ms) < 3 * 3600e3);
  function plan(f) {
    const C = cands(f); if (!C) return null;
    const k = ST.pk, avail = k.bud, cost = (e) => e.b * entOf(e, k.ent);
    let pick;
    if (PEDIT[f.id]) pick = C.filter(e => PEDIT[f.id].has(e.i));
    else {
      const ord = C.slice().sort((a, b) => ((kind(b) === 'main') - (kind(a) === 'main')) || (k.sort === 'g' ? (b.g - a.g) || (b.b - a.b) : (a.b - b.b) || (b.g - a.g)) || ((a.ms || 0) - (b.ms || 0)));
      pick = []; let tot = 0; const used = new Set();
      for (const e of ord) {
        if (used.size >= k.n) break;
        const c = cost(e); if (tot + c > avail || used.has(e.k) || clash(pick, e)) continue;
        pick.push(e); tot += c; used.add(e.k);
      }
      // остаток бюджета — на дополнительные входы через следующие флайты тех же турниров (главное событие — первым)
      if (k.fill) {
        const first = new Map(); pick.forEach(e => first.set(e.k, e.ms));
        const more = C.filter(e => first.has(e.k) && !pick.includes(e) && e.ms != null && first.get(e.k) != null && e.ms > first.get(e.k))
          .sort((a, b) => ((kind(b) === 'main') - (kind(a) === 'main')) || (a.ms - b.ms));
        for (const e of more) { if (tot + e.b > avail || clash(pick, e)) continue; pick.push(e); tot += e.b; }
      }
    }
    pick.sort((a, b) => (a.ms || 0) - (b.ms || 0));
    const cm = costs(pick, k), keys = new Set(pick.map(e => e.k));
    const tot = pick.reduce((a, e) => a + cm.get(e.i), 0);
    const gk = new Set(); let gtd = 0; pick.forEach(e => { if (!gk.has(e.k)) { gk.add(e.k); gtd += e.g || 0; } });
    const days = pick.filter(e => e.ms != null).map(e => Math.floor(e.ms / DAY));
    return { f, C, pick, cm, nT: keys.size, extra: pick.length - keys.size, tot, gtd, main: pick.find(e => kind(e) === 'main'), d0: days.length ? Math.min(...days) : null, d1: days.length ? Math.max(...days) : null, over: tot > k.bud };
  }
  function drawPick() {
    if (!pickForm) {
      det.replaceChildren();
      const h = el('div', 'lv-dh'); const t = el('div'); t.append(el('h2', null, 'Подобрать серию под бюджет'), el('p', null, 'Укажите, сколько готовы потратить и что играете — программа соберёт план турниров для каждой серии и покажет, какие серии вам по карману. Подбор идёт по региону, странам и месяцу, которые нажаты сверху.'));
      const x = el('button', 'btn lv-btn', 'Закрыть'); x.type = 'button'; x.onclick = () => { PICK = false; pickB.classList.remove('on'); drawDet(); };
      const a = el('div', 'lv-dh-a'); a.append(x); h.append(t, a); det.append(h);
      pickForm = el('div', 'lv-pk'); pickRes = el('div', 'lv-pk-res');
      const k = ST.pk, upd = () => { save(); Object.keys(PEDIT).forEach(i => delete PEDIT[i]); pickSoon(200); };
      const num = (label, key, help, step) => { const w = el('label', 'lv-pk-f'); w.append(el('span', null, label)); const i = el('input', 'lv-pk-in'); i.type = 'number'; i.min = '0'; i.step = String(step || 50); i.value = k[key] || ''; i.placeholder = key === 'hi' ? 'любой' : '0'; i.oninput = () => { k[key] = Math.max(0, +i.value || 0); upd(); }; w.append(i); if (help) w.append(el('small', null, help)); return w; };
      const row1 = el('div', 'lv-pk-row');
      row1.append(num('Ваш бюджет, $', 'bud', 'только на бай-ины и ре-энтри', 100), num('Бай-ин от, $', 'lo', '', 50), num('Бай-ин до, $', 'hi', 'пусто — любой', 50));
      const row2 = el('div', 'lv-pk-row');
      const nW = el('label', 'lv-pk-f'); nW.append(el('span', null, 'Сколько турниров готовы сыграть')); const nI = el('input', 'lv-pk-in'); nI.type = 'number'; nI.min = '1'; nI.max = '60'; nI.value = k.n; nI.oninput = () => { k.n = Math.max(1, Math.min(60, +nI.value || 1)); upd(); }; nW.append(nI, el('small', null, 'не больше этого числа'));
      const segW = (label, key, opts, help) => { const w = el('div', 'lv-pk-f'); w.append(el('span', null, label)); const g = el('div', 'seg bx-seg'); g.setAttribute('role', 'group'); g.setAttribute('aria-label', label); opts.forEach(([v, l]) => { const b = el('button', k[key] === v ? 'on' : null, l); b.type = 'button'; b.onclick = () => { k[key] = v; [...g.children].forEach(c => c.classList.toggle('on', c === b)); upd(); }; g.append(b); }); w.append(g); if (help) w.append(el('small', null, help)); return w; };
      row2.append(nW, segW('Входов в турнир в среднем', 'ent', [[1, '1'], [1.5, '1,5'], [2, '2'], [3, '3']], 'с ре-энтри; во фризаут — всегда 1'), segW('Остаток бюджета', 'fill', [[true, 'На доп. флайты'], [false, 'Оставить']], 'вылетели во флайте — заход в следующий'), segW('Игра', 'nlh', [[true, 'Только холдем'], [false, 'Все игры']], 'омаха и другие — по «Все игры»'), segW('Что важнее', 'sort', [['n', 'Больше турниров'], ['g', 'Крупнее гарантии'], ['d', 'Ближе по дате']]));
      const row3 = el('div', 'lv-pk-types'); row3.append(el('span', 'lv-pk-l', 'Какие турниры играете:'));
      [['main', 'Главное событие'], ['side', 'Обычные турниры'], ['bnt', 'Баунти и мистери'], ['hr', 'Хайроллеры'], ['sat', 'Сателлиты']].forEach(([key, l]) => { const b = el('button', 'lv-tg' + (k[key] ? ' on' : ''), l); b.type = 'button'; b.setAttribute('aria-pressed', String(!!k[key])); b.onclick = () => { k[key] = !k[key]; b.classList.toggle('on', k[key]); b.setAttribute('aria-pressed', String(k[key])); upd(); }; row3.append(b); });
      pickForm.append(row1, row2, row3, el('small', 'lv-pk-hint', 'Можно выбрать несколько видов; если не выбран ни один — подбираются все виды турниров.'));
      det.append(pickForm, pickRes);
    }
    drawPickRes();
  }
  function drawPickRes() {
    if (!pickRes) return;
    const top = det.scrollTop; pickRes.replaceChildren();
    const k = ST.pk;
    if (!LIST) { pickRes.append(window.mdaLoad('Загружаю календарь…')); return; }
    if (!k.bud) { pickRes.append(el('p', 'lv-empty', 'Введите бюджет — сумму, которую готовы потратить на серию.')); return; }
    const base = filtered(), wait = base.filter(f => !SUM[f.id] || (SUM[f.id].n && SUM[f.id].v !== 3)).length;
    let P = base.map(plan).filter(p => p && p.pick.length);
    const none = base.filter(f => SUM[f.id] && SUM[f.id].ev).length - P.length;
    P.sort(k.sort === 'g' ? (a, b) => b.gtd - a.gtd || b.nT - a.nT : k.sort === 'd' ? (a, b) => (a.d0 || a.f.s * DAY) - (b.d0 || b.f.s * DAY) : (a, b) => b.nT - a.nT || a.tot - b.tot);
    const info = el('p', 'lv-pk-info', P.length ? 'Подходит ' + P.length + ' ' + plural(P.length, 'серия', 'серии', 'серий') + '.' : 'Под эти условия серий нет — увеличьте бюджет, расширьте диапазон бай-инов или выберите больше видов турниров.');
    if (none > 0) info.append(' Не подошли: ' + none + ' (нет турниров в вашем диапазоне или не хватает бюджета).');
    if (wait && PREVIEW) info.append(' В превью расписание есть у трёх серий, в программе подбор идёт по всем.');
    else if (wait) info.append(' Ещё ' + wait + ' ' + plural(wait, 'серия ждёт', 'серии ждут', 'серий ждут') + ' загрузки расписания — подбор обновится сам.');
    // где ищем — то, что нажато сверху
    const where = el('div', 'lv-pk-where'); where.append(el('span', null, 'Ищу в:'));
    const wv = [ST.reg ? REGN[ST.reg] : 'Весь мир'];
    if (ST.cs.length) wv.push(ST.cs.map(x => cOf(x).ru).join(', '));
    if (ST.mon) { const [y, m] = ST.mon.split('-').map(Number); wv.push(MONR[m - 1] + ' ' + y); } else wv.push('все месяцы');
    where.append(el('b', null, wv.join(' · ')), el('small', null, 'меняется кнопками региона, стран и месяца сверху'));
    pickRes.append(where, info);
    P.slice(0, 40).forEach(p => pickRes.append(pickCard(p)));
    det.scrollTop = top;
  }
  const dShort = (d) => { const x = dOf(d); return x.getUTCDate() + ' ' + MONS[x.getUTCMonth()]; };
  function pickCard(p) {
    const f = p.f, c = cOf(f.country), k = ST.pk, open = POPEN.has(f.id);
    const card = el('div', 'lv-pc' + (p.over ? ' over' : ''));
    const hd = el('div', 'lv-pc-h');
    const t = el('div'); t.append(el('b', null, f.name), el('span', null, [(f.city ? f.city + ', ' : '') + c.ru, dTxt(f.s, f.e)].join(' · ')));
    const sb = el('button', 'btn lv-btn', 'Расписание →'); sb.type = 'button'; sb.onclick = () => openFest(f);
    hd.append(t, sb); card.append(hd);
    const load = Math.round(p.tot / k.bud * 100);
    const st = el('div', 'lv-pc-s');
    const cell = (a, b, cls) => { const x = el('div', cls || null); x.append(el('span', null, a), el('b', null, b)); st.append(x); };
    cell('Турниров в плане', p.nT + (p.nT < k.n ? ' из ' + k.n : ''));
    if (p.extra) cell('Доп. входы (флайты)', '+' + p.extra);
    cell('Стоимость', money(p.tot));
    cell('Загрузка бюджета', load + '%', p.over ? 'bad' : null);
    cell('Остаток', money(Math.max(0, k.bud - p.tot)));
    if (p.gtd) cell('Сумма гарантий', big(p.gtd), 'g');
    if (p.d0 != null) cell('Дни на серии', (p.d0 === p.d1 ? dShort(p.d0) : dShort(p.d0) + ' – ' + dShort(p.d1)) + ' (' + (p.d1 - p.d0 + 1) + ' ' + plural(p.d1 - p.d0 + 1, 'день', 'дня', 'дней') + ')');
    card.append(st);
    const bar = el('div', 'lv-pc-bar'); const fill = el('i'); fill.style.width = Math.min(100, load) + '%'; bar.append(fill); card.append(bar);
    if (k.main) { const me = p.C.find(e => kind(e) === 'main'); card.append(el('p', 'lv-pc-n', p.main ? 'Главное событие в плане: ' + p.main.n + ' — ' + money(p.main.b) : me ? 'Главное событие (' + money(me.b) + (entOf(me, k.ent) > 1 ? ' × ' + String(entOf(me, k.ent)).replace('.', ',') : '') + ') не помещается в бюджет' : 'Главного события в вашем диапазоне бай-инов нет')); }
    const groups = new Set(p.C.map(e => e.k)).size;
    if (p.nT < k.n && !PEDIT[f.id]) {
      const rest = p.C.filter(e => !p.pick.some(x => x.k === e.k)), restG = new Set(rest.map(e => e.k)).size;
      const cheap = rest.length ? Math.min(...rest.map(e => e.b * entOf(e, k.ent))) : 0;
      card.append(el('p', 'lv-pc-n', !restG
        ? 'В этой серии под ваши условия всего ' + groups + ' ' + plural(groups, 'турнир', 'турнира', 'турниров') + ' — флайты (Day 1A, 1B…) одного турнира считаются одним турниром.' + (k.fill ? (p.extra ? ' Остаток бюджета пущен на доп. входы через следующие флайты.' : '') : ' Остаток можно пустить на доп. входы через флайты — «Остаток бюджета: на доп. флайты».')
        : 'Ещё ' + restG + ' ' + plural(restG, 'турнир не вошёл', 'турнира не вошли', 'турниров не вошли') + ' — ' + (p.tot + cheap > k.bud ? 'не хватает бюджета' : 'старт ближе 3 часов к турниру из плана') + '. Можно добавить галочкой.'));
    }
    const tg = el('button', 'lv-pc-t', open ? 'Скрыть план ▴' : 'Показать план и поправить ▾'); tg.type = 'button';
    tg.onclick = () => { if (POPEN.has(f.id)) POPEN.delete(f.id); else POPEN.add(f.id); card.replaceWith(pickCard(plan(f))); };
    card.append(tg);
    if (open) {
      const tb = el('div', 'lv-pc-tb'), sel = new Set(p.pick.map(e => e.i));
      if (PEDIT[f.id]) { const rb = el('button', 'lv-pc-t', 'Вернуть автоматический план'); rb.type = 'button'; rb.onclick = () => { delete PEDIT[f.id]; card.replaceWith(pickCard(plan(f))); }; tb.append(rb); }
      p.C.slice().sort((a, b) => (a.ms || 0) - (b.ms || 0)).forEach(e => {
        const on = sel.has(e.i), r = el('label', 'lv-pc-r' + (on ? ' on' : ''));
        const cb = el('input'); cb.type = 'checkbox'; cb.checked = on;
        cb.onchange = () => { const s = PEDIT[f.id] || new Set(sel); if (cb.checked) s.add(e.i); else s.delete(e.i); PEDIT[f.id] = s; card.replaceWith(pickCard(plan(f))); };
        const en = entOf(e, k.ent), K = kind(e);
        const nm = el('span', 'lv-pnm'); nm.append(el('b', null, e.n)); const tags = { main: 'главное', hr: 'хайроллер', bnt: 'баунти', sat: 'сателлит' }; if (tags[K]) nm.append(el('i', K, tags[K])); if (e.c === 1) nm.append(el('i', null, 'фризаут'));
        const isX = on && p.cm.get(e.i) === e.b && p.pick.some(x => x.k === e.k && x.ms < e.ms);
        if (isX) nm.append(el('i', null, 'ещё вход'));
        r.append(cb, el('span', 'lv-pdt', e.ms != null ? dShort(Math.floor(e.ms / DAY)) + (e.t.length > 10 ? ' ' + e.t.slice(11, 16) : '') : '—'), nm, el('span', 'lv-pbi', isX ? money(e.b) + ' · ещё вход' : money(e.b) + (en > 1 ? ' × ' + String(en).replace('.', ',') + ' = ' + money(e.b * en) : '')), el('span', 'lv-pgt', e.g ? big(e.g) : ''));
        tb.append(r);
      });
      card.append(tb);
      if (p.over) card.append(el('p', 'lv-pc-n bad', 'План дороже бюджета на ' + money(p.tot - k.bud) + '.'));
    }
    return card;
  }

  // ---------- запуск ----------
  ST.q = '';
  drawAll();
  let started = false;
  const start = () => { if (started) return; started = true; loadList(false).then(() => { if (ST.sel && LIST) { const f = LIST.find(x => x.id === ST.sel); if (f && !root.hidden) openFest(f); } }); };
  // календарь грузится при первом открытии вкладки, а в программе — и сам через минуту после запуска (для фоновой подкачки)
  const tab = document.getElementById('tabLive'); if (tab) tab.addEventListener('click', () => { if (!started) start(); else if (!loading && LERR.some(e => e.challenge)) loadList(false); });
  if (!root.hidden) start(); else if (!PREVIEW && api.liveList) setTimeout(start, 10e3);
  window.MDALive = { reload: () => loadList(true) };
})();
