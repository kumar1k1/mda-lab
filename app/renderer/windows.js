'use strict';
/* global mda, Stats */
// Окно «Диапазон / Факт, BB / EV, BB» с матрицей и списком раздач справа — общее для всех вкладок.
// окно с матрицей ответа на открытие одного размера (строка #6). Наведение — посмотреть, клик — закрепить;
// в закреплённом окне переключатель: диапазон (колл / 3-бет / олл-ин / фолд), факт BB с каждой рукой, EV BB с каждой рукой
let szMx = null, SZMX_PIN = null, SZMX_MODE = 'rng', SZMX_SEL = null, SZMX_LIST = null, SZMX_PART = 'all'; // SZMX_SEL — рука, раздачи которой открыты справа
// пока открыто закреплённое окно (матрица / список раздач) — страница под ним не прокручивается колесом
function syncScrollLock() { document.body.classList.toggle('noscroll', !!(SZMX_PIN || pinned || IDS_LIST)); }
function szMxEl() {
  if (!szMx) {
    szMx = el('div', 'szmx'); szMx.setAttribute('role', 'dialog'); szMx.hidden = true; document.body.append(szMx);
    document.addEventListener('mousedown', (e) => { if (SZMX_PIN && !szMx.contains(e.target) && !e.target.closest('.has-mx, .il-bg, .rp-bg, .rv-bg, [role=dialog]')) unpinSzMx(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && SZMX_PIN && !document.querySelector('.il-bg, .rv-bg')) unpinSzMx(); });
  }
  return szMx;
}
// раздачи одной руки из строки #6 — список с реплеером
// как в окне матрицы результата (hands-ui.js): матрица остаётся слева, раздачи руки — справа в том же окне
function szHandList(title, z, k, name) { SZMX_SEL = { k, name }; drawSzMx(title, z, true); clampPop(szMx); } // окно не перецентрируем — остаётся на месте
function szValGrid(mx, mode, onPick) {
  const R = 'AKQJT98765432', wrap = el('div', 'szv');
  const vals = mx.filter(c => c.n >= 3).map(c => Math.abs((mode === 'ev' ? c.es : c.sum) / 10 / c.n)).sort((a, b) => a - b);
  const scale = Math.max(1, vals[Math.floor(vals.length * 0.9)] || 1); // крайние 10% не растягивают шкалу цвета
  for (let i = 0; i < 13; i++) for (let j = 0; j < 13; j++) {
    const c = mx[i * 13 + j], name = i === j ? R[i] + R[j] : i < j ? R[i] + R[j] + 's' : R[j] + R[i] + 'o';
    const cell = el('div', 'szv-c'); cell.append(el('span', 'h', name));
    if (!c.n) cell.classList.add('na');
    else {
      const v = (mode === 'ev' ? c.es : c.sum) / 10 / c.n, t = Math.min(1, Math.abs(v) / scale);
      cell.style.background = 'rgba(' + (v >= 0 ? 'var(--good-rgb)' : 'var(--bad-rgb)') + ',' + (0.18 + 0.6 * t).toFixed(2) + ')';
      cell.append(el('span', 'v', (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(Math.abs(v) >= 10 ? 0 : 1)));
      if (c.n < 5) cell.classList.add('low');
      cell.title = name + ': ' + signed(c.sum / 10 / c.n, 2) + ' BB факт · ' + signed(c.es / 10 / c.n, 2) + ' BB EV · ' + cnt(c.n, 'раз') + ' — нажмите, чтобы открыть раздачи';
      if (onPick) { const k = i * 13 + j; cell.classList.add('click'); cell.tabIndex = 0; cell.setAttribute('role', 'button'); cell.onclick = () => onPick(k, name); cell.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(k, name); } }; }
    }
    wrap.append(cell);
  }
  return wrap;
}
function drawSzMx(title, z, pinned) {
  const z0 = z; // исходные данные окна: z ниже может стать выборкой одной вкладки (колл / рейз / фолд)
  const m = szMxEl(); if (SZMX_LIST) { SZMX_LIST.stop(); SZMX_LIST = null; } m.replaceChildren(); m.classList.toggle('pinned', !!pinned);
  const sel = pinned ? SZMX_SEL : null; m.classList.toggle('with-list', !!sel);
  const left = el('div', 'szmx-l');
  const h = el('div', 'szmx-h'); h.append(el('b', null, title), el('span', null, cnt(z.n, 'раз')));
  if (pinned) { const grip = el('span', 'hp-grip', '⠿'); grip.setAttribute('aria-hidden', 'true'); h.prepend(grip); const x = el('button', 'szmx-x', '×'); x.type = 'button'; x.title = 'Закрыть'; x.setAttribute('aria-label', 'Закрыть'); x.onclick = unpinSzMx; h.append(x); enableDrag(m, h); } // окно можно передвигать за шапку
  m.append(h);
  const mode = pinned ? SZMX_MODE : 'rng';
  // вкладки по вашему ответу (весь диапазон / колл / 5-бет / фолд) — если окно их даёт (z.parts); в каждой — диапазон, факт и EV
  const PART = pinned && z.parts && SZMX_PART !== 'all' && z.parts[SZMX_PART] ? SZMX_PART : 'all';
  if (pinned && z.parts) {
    const segP = el('div', 'szmx-part'); segP.setAttribute('role', 'group'); segP.setAttribute('aria-label', 'Какой ответ');
    // вкладки-карточки: итог раздач с этим ответом в BB за раздачу — факт и EV (у фолда — только число раздач)
    const tot = (zz) => zz.rmx.reduce((acc, m) => { acc.s += m.sum; acc.e += m.es; acc.n += m.n; return acc; }, { s: 0, e: 0, n: 0 });
    [['all', 'Весь диапазон'], ['call', z.labels[2] || 'колл'], ['rz', z.labels[0] || 'рейз'], ['fold', z.labels[3] || 'фолд']].forEach(([k, t]) => {
      const zk = k === 'all' ? z : z.parts[k], n = zk.n, b = el('button', 'szmx-pt' + (PART === k ? ' on' : '')); b.type = 'button'; b.disabled = !n; b.setAttribute('aria-pressed', String(PART === k));
      const top = el('span', 'pt-h'); top.append(el('b', null, t), el('span', null, cnt(n, 'раз'))); b.append(top);
      if (k !== 'fold' && n) { const T = tot(zk); const f = T.n ? T.s / 10 / T.n : null, e = T.n ? T.e / 10 / T.n : null; const v = el('span', 'pt-v'); v.append(el('span', f >= 0 ? 'up' : 'down', signed(f, 2)), el('span', 'pt-ev ' + (e >= 0 ? 'up' : 'down'), 'EV ' + signed(e, 2))); b.append(v); b.title = t + ': ' + signed(f, 2) + ' BB факт, ' + signed(e, 2) + ' BB EV за раздачу, ' + cnt(n, 'раз') + '; всего ' + signed(T.s / 10, 1) + ' BB / EV ' + signed(T.e / 10, 1) + ' BB'; }
      else if (k === 'fold') b.append(el('span', 'pt-v muted', 'без итога'));
      b.onclick = () => { SZMX_PART = k; SZMX_SEL = null; drawSzMx(title, z0, true); }; segP.append(b);
    });
    left.append(segP, el('div', 'szmx-ptcap', 'BB за раздачу: факт и EV. «Весь диапазон» — все ответы вместе, включая фолды. 5-бет — любой ваш рейз на 4-бет: и олл-ином, и не олл-ином.'));
  }
  if (PART !== 'all') {
    // только этот ответ: в «Диапазоне» — доля этого ответа у каждой руки, в факте и EV — итог именно этих раздач
    const pz = z.parts[PART], L0 = z.labels;
    const rmx = z.rmx.map((m, q) => ({ n: m.n, x: PART === 'rz' ? m.x : 0, ai: 0, lp: PART === 'call' ? m.lp : 0, fo: PART === 'fold' ? pz.rmx[q].n : undefined }));
    const LB2 = PART === 'rz' ? [L0[0], '', '', 'другие ответы'] : PART === 'call' ? ['', '', L0[2], 'другие ответы'] : ['', '', '', L0[3]];
    z = Object.assign({}, z, { rmx, vmx: pz.rmx, rids: pz.rids, labels: LB2, parts: null, foldPaint: PART === 'fold', capAll: (L0[{ rz: 0, call: 2, fold: 3 }[PART]] || '') + ' — только эти раздачи' });
  }
  if (pinned) {
    const seg = el('div', 'seg szmx-seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Что показать');
    [['rng', 'Диапазон'], ['net', 'Факт, BB'], ['ev', 'EV, BB']].forEach(([k, t]) => { const b = el('button', mode === k ? 'on' : '', t); b.type = 'button'; b.setAttribute('aria-pressed', String(mode === k)); b.onclick = () => { SZMX_MODE = k; drawSzMx(title, z0, true); }; seg.append(b); });
    left.append(seg);
  }
  if (mode === 'rng') {
    const LB = z.labels || ['3-бет', 'олл-ин', 'колл', 'фолд']; // порядок: янтарная, синяя, зелёная, тёмная часть клетки
    // фолд — своим цветом (z.foldPaint), руки, которых в выборке не было, — пустые клетки
    const fp = !!z.foldPaint, foldCol = fp ? 'var(--mx-fold)' : 'var(--mx-empty)';
    const legItems = [[LB[2], 'var(--mx-limp)'], [LB[0], 'var(--mx-raise)'], [LB[1], 'var(--mx-push)'], [LB[3], foldCol]];
    legItems.push(['руки не было (серая рамка)', 'var(--bg)']); // пустые клетки — руки, которых в выборке не встречалось
    const leg = el('div', 'resp-legend row'); legItems.filter(x => x[0]).forEach(([l, col]) => { const it = el('span'); const i = el('i'); i.style.background = col; if (col === 'var(--mx-empty)' || col === 'var(--bg)') i.style.border = '1px solid var(--line2)'; it.append(i, document.createTextNode(l)); leg.append(it); });
    const mxEl = handMatrix(z.rmx, LB, { fold: fp });
    if (pinned) [...mxEl.children].forEach((cell, k) => { if (!(z.vmx || z.rmx)[k].n) return; const nm = cell.querySelector('.h').textContent; cell.classList.add('click'); cell.tabIndex = 0; cell.setAttribute('role', 'button'); cell.setAttribute('aria-label', nm + ' — открыть раздачи'); cell.onclick = () => szHandList(title, z0, k, nm); cell.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); szHandList(title, z0, k, nm); } }; });
    left.append(leg, mxEl);
  } else {
    left.append(el('div', 'szmx-cap', (mode === 'ev' ? 'EV' : 'Фактический результат') + ' с каждой рукой в BB за раздачу — ' + (z.capAll || 'все ответы (колл, 3-бет, фолд)') + '. Нажмите на руку — раздачи и реплеер.'), szValGrid(z.vmx || z.rmx, mode, pinned ? (k, nm) => szHandList(title, z0, k, nm) : null));
  }
  if (!pinned) left.append(el('div', 'szmx-hint', 'Клик — закрепить окно и показать результат по рукам'));
  m.append(left);
  if (sel) {
    // выбранная рука подсвечена; справа — её раздачи (в режиме «EV, BB» — итог по EV)
    left.querySelectorAll('.mx-c, .szv-c').forEach((cell, q) => { if (q === sel.k) cell.classList.add('sel'); });
    const hc = DB.cols.hc;
    SZMX_LIST = idsPanel((z.rids || []).filter(i => hc[i] === sel.k), { title: sel.name, ev: mode === 'ev' });
    m.append(SZMX_LIST.node);
  }
  m.hidden = false;
}
function placeSzMx(row, e) {
  const m = szMx, rr = row.getBoundingClientRect(), w = m.offsetWidth, hh = m.offsetHeight;
  // как во всём проекте: окно сбоку от курсора (справа, а если не влезает — слева)
  if (e && e.clientX != null) {
    let x = e.clientX + 16, y = e.clientY - hh / 2;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - 16;
    x = Math.max(8, x); y = Math.max(8, Math.min(y, window.innerHeight - hh - 8));
    m.style.left = x + 'px'; m.style.top = y + 'px'; return;
  }
  let x = rr.right + 12, y = rr.top + rr.height / 2 - hh / 2;
  if (x + w > window.innerWidth - 8) { x = Math.max(8, Math.min(rr.left + 40, window.innerWidth - w - 8)); y = rr.bottom + 8; if (y + hh > window.innerHeight - 8) y = rr.top - hh - 8; }
  y = Math.max(8, Math.min(y, window.innerHeight - hh - 8));
  m.style.left = x + 'px'; m.style.top = y + 'px';
}
function showSzMx(title, z, row, e) { if (SZMX_PIN || document.querySelector('.hand-pop.pinned') || hoverMuted(e)) return; drawSzMx(title, z, false); placeSzMx(row, e); }
function pinSzMx(title, z, row, e) {
  if (SZMX_PIN && SZMX_PIN.row === row) { unpinSzMx(); return; }
  SZMX_PIN = { row }; SZMX_SEL = null; SZMX_PART = 'all'; drawSzMx(title, z, true);
  placeSzMx(row, e); // тот же якорь, что при наведении: окно центрировано на курсоре и не смещается
  syncScrollLock();
}
function unpinSzMx() { SZMX_PIN = null; SZMX_SEL = null; if (SZMX_LIST) { SZMX_LIST.stop(); SZMX_LIST = null; } if (szMx) { szMx.hidden = true; szMx.classList.remove('with-list'); } syncScrollLock(); }
function hideSzMx() { if (szMx && !SZMX_PIN) szMx.hidden = true; }

