'use strict';
// Окно SharkScope из реплеера: по нажатию на лупу у игрока открывается небольшое видимое окно с его страницей
// на sharkscope.com — так же, как если бы вы открыли её в браузере (один поиск на нажатие, ваш вход на сайт).
// Когда страница загрузится, в окне остаётся только график результатов игрока (самый крупный график на странице);
// нет графика или нужно войти в аккаунт — видна вся страница. F2 — «только график / вся страница», Esc — закрыть.
// Данные со страницы программа не читает и не сохраняет: она только меняет, что видно в окне.
const { BrowserWindow, shell } = require('electron');

let sw = null, mode = 'chart', poll = null;
const PART = 'persist:sharkscope';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
// найти график: самый крупный видимый canvas / svg-график (Highcharts и т.п.) и оставить в окне только его
const FIND = `(() => {
  const els = [...document.querySelectorAll('.highcharts-container, svg.highcharts-root, canvas, [class*="chart" i] svg')];
  let best = null, bs = 0;
  for (const e of els) { const r = e.getBoundingClientRect(); const s = r.width * r.height; if (r.width >= 240 && r.height >= 120 && s > bs) { bs = s; best = e; } }
  if (!best) return null;
  const box = best.closest('.highcharts-container') || best;
  box.setAttribute('data-mda-chart', '1');
  const r = box.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height) };
})()`;
const CSS_ONLY = `body *{visibility:hidden!important} [data-mda-chart],[data-mda-chart] *{visibility:visible!important}
[data-mda-chart]{position:fixed!important;left:8px!important;top:8px!important;z-index:2147483647!important;background:#fff}
html,body{overflow:hidden!important}`;
let cssKey = null;

async function showChart() {
  if (!sw || sw.isDestroyed()) return false;
  let r = null; try { r = await sw.webContents.executeJavaScript(FIND); } catch (e) { r = null; }
  if (!r) return false;
  if (cssKey) { try { await sw.webContents.removeInsertedCSS(cssKey); } catch (e) { /* нет */ } }
  cssKey = await sw.webContents.insertCSS(CSS_ONLY);
  sw.setContentSize(Math.min(1100, r.w + 16), Math.min(700, r.h + 16));
  return true;
}
async function showFull() {
  if (!sw || sw.isDestroyed()) return;
  if (cssKey) { try { await sw.webContents.removeInsertedCSS(cssKey); } catch (e) { /* нет */ } cssKey = null; }
  sw.setContentSize(1000, 720);
}
function open(url, parent, nick) {
  if (!/^https:\/\/www\.sharkscope\.com\//.test(url)) return false;
  if (!sw || sw.isDestroyed()) {
    sw = new BrowserWindow({ width: 760, height: 460, parent: parent || undefined, title: 'SharkScope', autoHideMenuBar: true, backgroundColor: '#ffffff',
      webPreferences: { partition: PART, sandbox: true, contextIsolation: true, nodeIntegration: false } });
    sw.webContents.setUserAgent(UA);
    sw.webContents.setWindowOpenHandler(({ url: u }) => { if (/^https:\/\//.test(u)) shell.openExternal(u); return { action: 'deny' }; });
    sw.webContents.on('before-input-event', (e, inp) => {
      if (inp.type !== 'keyDown') return;
      if (inp.key === 'Escape') { e.preventDefault(); sw.close(); }
      else if (inp.key === 'F2') { // F2, не буква: буквы нужны для входа в аккаунт на странице
        e.preventDefault(); mode = mode === 'chart' ? 'full' : 'chart'; if (mode === 'full') showFull(); else showChart().then(ok => { if (!ok) mode = 'full'; });
      }
    });
    sw.on('closed', () => { sw = null; clearInterval(poll); });
  }
  mode = 'chart'; cssKey = null;
  sw.setTitle('SharkScope — ' + (nick || '') + ' · F2 — только график / вся страница · Esc — закрыть');
  sw.loadURL(url);
  sw.show(); sw.focus();
  // страница сайта строится скриптом: ищем график несколько раз, пока он не появится (до ~20 с); не нашли — вся страница
  clearInterval(poll); let n = 0;
  poll = setInterval(async () => {
    if (!sw || sw.isDestroyed()) { clearInterval(poll); return; }
    n++;
    if (mode !== 'chart') { clearInterval(poll); return; }
    const ok = await showChart();
    if (ok || n > 40) { clearInterval(poll); if (!ok) { mode = 'full'; showFull(); } }
  }, 500);
  return true;
}
module.exports = { open };
