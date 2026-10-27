'use strict';
// «Офлайн-серии»: живые покерные фестивали по всему миру на ближайшие 2 месяца (данные The Hendon Mob).
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
  const nameGtd = (f) => { const g = P.gtdOf(f.name); if (!g) return null; return usd(g.v, curOf(g.sym, f.country)); };
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
  const save = () => { try { localStorage.setItem('mda.live', JSON.stringify({ reg: ST.reg, cs: ST.cs, mon: ST.mon, big: ST.big, noSat: ST.noSat, gtdOnly: ST.gtdOnly, game: ST.game, bi: ST.bi, sel: ST.sel })); } catch (e) { /* без сохранения */ } };
  let LIST = null, LERR = [], loading = false, FEST = {}, OPEN = null; // OPEN — { id, data | error | loading }
  const PREVIEW = !!window.LIVE_SAMPLE && !(api.liveList && api.liveFest && !api.livePreview);

  // ---------- каркас ----------
  root.classList.add('lv-page');
  const head = el('div', 'lv-head');
  const ht = el('div', 'nw-ht'); ht.append(el('h1', null, 'Офлайн-серии'), el('p', 'nw-sub', 'Крупные живые покерные фестивали по всему миру на ближайшие 2 месяца: гарантия от $100 000 или бай-ины от $1 000, туры WSOP, EPT, WPT, APT, Triton и другие. Нажмите на серию — справа откроется полное расписание: бай-ины и гарантии в долларах, стек и длина уровней.'));
  const tools = el('div', 'lv-tools');
  const qIn = el('input', 'lv-q'); qIn.type = 'search'; qIn.placeholder = 'Поиск: серия, город, тур'; qIn.setAttribute('aria-label', 'Поиск серии');
  qIn.oninput = () => { ST.q = qIn.value.trim().toLowerCase(); drawList(); };
  tools.append(qIn);
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
      let all = [], errs = [];
      if (PREVIEW) all = fromSample();
      else {
        for (const [y, m] of months()) {
          const r = await api.liveList(y, m, force, !root.hidden); // вкладка не открыта — окно проверки не показывать
          if (r && r.html) all = all.concat(P.list(r.html));
          if (r && r.error) errs.push({ y, m, msg: r.error, challenge: r.challenge, stale: r.stale });
        }
      }
      const a = today(), b = a + WINDOW, seen = new Set();
      LIST = all.filter(f => { if (seen.has(f.id) || f.e < a || f.s > b || f.e - f.s > 60) return false; seen.add(f.id); return true; }).sort((x, y) => x.s - y.s || x.e - y.e);
      LERR = errs;
    } catch (e) { LERR = [{ msg: 'Не удалось загрузить календарь: ' + (e && e.message || e) }]; }
    loading = false; drawAll(); bgStart();
  }
  function summary(f, d) {
    const ev = d.rows.filter(r => r.buy && !r.sat), cur = (r) => curOf(r.sym, d.country || f.country);
    const bs = ev.map(r => usd(r.buy, cur(r))).filter(v => v != null), gs = d.rows.filter(r => r.gtd && !r.sat).map(r => usd(r.gtd.v, curOf(r.gtd.sym || r.sym, d.country || f.country))).filter(v => v != null);
    const me = ev.filter(r => r.main).map(r => usd(r.buy, cur(r))).filter(v => v != null);
    return { n: d.rows.filter(r => r.buy).length, minB: bs.length ? Math.min(...bs) : null, maxB: bs.length ? Math.max(...bs) : null, gtd: gs.length ? Math.max(...gs) : null, me: me.length ? Math.max(...me) : null, at: Date.now() };
  }
  async function getFest(f, force, bg) {
    if (PREVIEW) { const d = sampleFest(f.id); return d ? { data: d } : { error: 'В превью полное расписание есть у трёх серий: Battle of Malta, WSOPC Dusk Till Dawn и Circus Poker Series. В программе — у всех.', preview: true }; }
    const r = await api.liveFest(f.id, force, !bg); // фон окно проверки не показывает
    if (!r || (!r.html && r.error)) return { error: r ? r.error : 'Нет ответа', challenge: r && r.challenge };
    const d = P.festival(r.html);
    if (d.challenge) return { error: 'Сайт The Hendon Mob попросил подтвердить, что вы не робот.', challenge: true };
    const out = { data: d, stale: r.stale, t: r.t };
    if (d.rows.length) { const s = summary(f, d); SUM[f.id] = s; if (api.liveSum) api.liveSum(f.id, s).catch(() => {}); }
    else { SUM[f.id] = { n: 0, at: Date.now() }; if (api.liveSum) api.liveSum(f.id, SUM[f.id]).catch(() => {}); }
    if (r.challenge) out.challenge = true;
    return out;
  }

  // ---------- фоновая подкачка расписаний ----------
  let bgT = null, bgGap = 25e3, bgPause = 0, bgBusy = false;
  function bgNext() {
    if (!LIST) return null;
    const fresh = (s) => s && Date.now() - s.at < 3 * DAY;
    const todo = LIST.filter(f => !fresh(SUM[f.id]));
    todo.sort((a, b) => (isBig(b) - isBig(a)) || a.s - b.s);
    return todo[0] || null;
  }
  function bgStart() { if (PREVIEW || !api.liveFest || bgT) return; bgT = setTimeout(bgTick, 8e3); }
  async function bgTick() {
    bgT = null; if (bgBusy) return;
    if (Date.now() < bgPause) { bgT = setTimeout(bgTick, bgPause - Date.now() + 1e3); return; }
    const f = bgNext(); if (!f) { drawStatus(); return; }
    if (OPEN && OPEN.loading) { bgT = setTimeout(bgTick, 5e3); return; }
    bgBusy = true;
    try { const r = await getFest(f, false, true); if (r.challenge && !r.data) { bgPause = Date.now() + 20 * 60e3; bgGap = Math.min(bgGap * 2, 120e3); } }
    catch (e) { /* следующая */ }
    bgBusy = false; drawList(); drawStatus();
    bgT = setTimeout(bgTick, bgGap);
  }

  // ---------- рисование ----------
  const known = () => LIST ? LIST.filter(f => SUM[f.id] && SUM[f.id].at).length : 0;
  function drawStatus() {
    status.replaceChildren();
    if (loading) { status.append(el('span', null, 'Загружаю календарь… Если откроется окно сайта «Подтвердите, что вы человек» — поставьте галочку один раз, дальше всё загрузится само.')); return; }
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
  function drawList() {
    listBox.replaceChildren();
    if (!LIST) { listBox.append(el('p', 'lv-empty', loading ? 'Загружаю календарь… Если откроется окно сайта «Подтвердите, что вы человек» — поставьте галочку один раз, дальше всё загрузится само.' : 'Календарь ещё не загружен.')); return; }
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
  function drawAll() { drawRegions(); drawCountries(); drawMonths(); drawStatus(); drawList(); if (!OPEN) drawDet(); }

  // ---------- расписание серии ----------
  async function openFest(f, force) {
    ST.sel = f.id; save(); drawList();
    OPEN = { f, loading: true }; drawDet();
    let r; try { r = await getFest(f, force); } catch (e) { r = { error: String(e && e.message || e) }; }
    if (!OPEN || OPEN.f.id !== f.id) return;
    OPEN = Object.assign({ f }, r); drawDet(); drawList();
  }
  const fmtDay = (iso) => { const d = new Date(iso.slice(0, 10) + 'T00:00:00Z'); return d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' }).replace(/^./, c => c.toUpperCase()); };
  const kNum = (v) => v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0).replace('.', ',') + 'K' : String(v);
  function drawDet() {
    det.replaceChildren();
    if (!OPEN) { const p = el('div', 'lv-ph'); p.append(el('b', null, 'Выберите серию слева'), el('span', null, 'Здесь появится её полное расписание: дни и время, бай-ины и гарантии в долларах, стартовый стек и длина уровней.')); det.append(p); return; }
    const f = OPEN.f, c = cOf(f.country);
    const h = el('div', 'lv-dh');
    const t = el('div'); t.append(el('h2', null, (OPEN.data && OPEN.data.name) || f.name), el('p', null, [OPEN.data && OPEN.data.venue || f.city, c.ru, dTxt(f.s, f.e)].filter(Boolean).join(' · ')));
    const ln = el('a', 'lv-src', 'The Hendon Mob ↗'); ln.href = 'https://pokerdb.thehendonmob.com/festival.php?a=r&n=' + f.id; ln.target = '_blank'; ln.rel = 'noopener'; ln.title = 'Страница серии на сайте The Hendon Mob';
    const acts = el('div', 'lv-dh-a'); acts.append(ln);
    if (!PREVIEW && api.liveFest) { const rb = el('button', 'btn lv-btn', 'Обновить'); rb.type = 'button'; rb.onclick = () => openFest(f, true); acts.append(rb); }
    h.append(t, acts); det.append(h);
    if (OPEN.loading) { det.append(el('p', 'lv-empty', 'Загружаю расписание… Если откроется окно сайта «Подтвердите, что вы человек» — поставьте галочку один раз, дальше всё загрузится само.')); return; }
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
    const tb = el('div', 'lv-tb'); const hd = el('div', 'lv-tr lv-th'); ['Время', 'Турнир', 'Бай-ин', 'Гарантия', 'Стек · уровень'].forEach(x => hd.append(el('span', null, x))); tb.append(hd);
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
      const extra = (r.notes || '').split('\n').filter(x => !/guaranteed prize pool/i.test(x)).join(' ').trim(); if (extra) { const n = el('small', null, extra); nm.append(n); }
      tr.append(nm);
      const bc = el('span', 'lv-bi'); if (r.buy != null) { bc.append(el('b', null, bu != null ? money(bu) : symTxt(r.sym) + sp(r.buy))); if (cur !== 'USD') bc.append(el('small', null, symTxt(r.sym) + r.parts.map(sp).join(' + '))); else if (r.parts.length > 1) bc.append(el('small', null, '$' + r.parts.map(sp).join(' + '))); } else bc.append(el('span', 'dim', '—'));
      tr.append(bc);
      const gc = el('span', 'lv-gt'); if (r.gtd) { const gcur = curOf(r.gtd.sym || r.sym, country), gu = usd(r.gtd.v, gcur); gc.append(el('b', null, gu != null ? big(gu) : symTxt(r.gtd.sym) + sp(r.gtd.v))); if (gcur !== 'USD') gc.append(el('small', null, symTxt(r.gtd.sym || r.sym) + sp(r.gtd.v))); } else gc.append(el('span', 'dim', '—'));
      tr.append(gc);
      tr.append(el('span', 'lv-st', [r.stack ? kNum(r.stack) : '', r.clock ? r.clock + ' мин' : ''].filter(Boolean).join(' · ') || '—'));
      tb.append(tr);
    });
    det.append(tb);
    det.append(el('p', 'lv-note', 'Бай-ины и гарантии пересчитаны в доллары по курсу ' + (FX.src === 'запасные курсы' ? '(примерному)' : 'на ' + (FX.t ? new Date(FX.t).toLocaleDateString('ru-RU') : 'сегодня')) + '; ниже мелко — в валюте серии. Время — местное время площадки. Источник — The Hendon Mob; перед поездкой сверяйте расписание с организатором.'));
  }

  // ---------- запуск ----------
  qIn.value = '';
  drawAll();
  let started = false;
  const start = () => { if (started) return; started = true; loadList(false).then(() => { if (ST.sel && LIST) { const f = LIST.find(x => x.id === ST.sel); if (f && !root.hidden) openFest(f); } }); };
  // календарь грузится при первом открытии вкладки, а в программе — и сам через минуту после запуска (для фоновой подкачки)
  const tab = document.getElementById('tabLive'); if (tab) tab.addEventListener('click', () => { if (!started) start(); else if (!loading && LERR.some(e => e.challenge)) loadList(false); });
  if (!root.hidden) start(); else if (!PREVIEW && api.liveList) setTimeout(start, 60e3);
  window.MDALive = { reload: () => loadList(true) };
})();
