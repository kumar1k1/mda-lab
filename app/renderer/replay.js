'use strict';
// Реплеер: превращает сохранённый ход раздачи в последовательность кадров (стеки, ставки, банк, борд).
(function () {
  const STREETS = ['Префлоп', 'Флоп', 'Тёрн', 'Ривер', 'Итог'];
  const r2 = (v) => Math.round(v * 100) / 100;

  function frames(rp) {
    const n = rp.pl.length;
    const st = { stacks: rp.pl.map(p => p[1]), bets: new Array(n).fill(0), pot: 0, folded: new Array(n).fill(false), board: 0, street: 0, actor: -1, text: 'Раздача начинается', show: false, won: new Array(n).fill(0), allin: new Array(n).fill(false), act: new Array(n).fill(null) };
    const out = [];
    const snap = () => out.push({ stacks: st.stacks.map(r2), bets: st.bets.map(r2), pot: r2(st.pot), folded: st.folded.slice(), board: st.board, street: st.street, actor: st.actor, text: st.text, show: st.show, won: st.won.slice(), allin: st.allin.slice(), act: st.act.map(a => (a ? Object.assign({}, a) : null)) });
    const name = (i) => (i === rp.h ? 'Вы' : rp.pl[i][0]) + (i === rp.h ? '' : '');
    snap();
    // анте и блайнды — одним кадром
    let k = 0;
    while (k < rp.ev.length && ['A', 'SB', 'BB'].includes(rp.ev[k][2])) {
      const [, i, t, a] = rp.ev[k];
      st.stacks[i] -= a;
      if (t === 'A') st.pot += a; else st.bets[i] += a;
      k++;
    }
    st.text = 'Анте и блайнды'; st.actor = -1; snap();
    // Возврат неуравненной ставки — без отдельного шага (фишки возвращаются в том же кадре, где закончилась торговля);
    // вскрытие и раздача банка (в том числе дележ и побочные банки) — одним итоговым кадром.
    let collected = false; const wins = [];
    for (; k < rp.ev.length; k++) {
      const [s, i, t, a, ai] = rp.ev[k];
      st.actor = i;
      if (t === 'S') {
        st.bets.forEach(b => { st.pot += b; }); st.bets.fill(0);
        st.street = s; st.board = s === 1 ? 3 : s === 2 ? 4 : 5; st.actor = -1;
        st.act = st.act.map((a, j) => (st.folded[j] ? a : null)); // новая улица — подписи действий сбрасываются
        st.text = STREETS[s]; snap(); continue;
      }
      if (t === 'A' || t === 'SB' || t === 'BB') { st.stacks[i] -= a; if (t === 'A') st.pot += a; else st.bets[i] += a; continue; }
      if (t === 'f') { st.folded[i] = true; st.text = name(i) + ': фолд'; st.act[i] = { t: 'f' }; }
      else if (t === 'x') { st.text = name(i) + ': чек'; st.act[i] = { t: 'x' }; }
      else if (t === 'c') { st.stacks[i] -= a; st.bets[i] += a; st.text = name(i) + ': колл ' + r2(a) + ' BB'; st.act[i] = { t: 'c', v: r2(st.bets[i]) }; }
      else if (t === 'b') { st.stacks[i] -= a; st.bets[i] += a; st.text = name(i) + ': бет ' + r2(a) + ' BB'; st.act[i] = { t: 'b', v: r2(a) }; }
      else if (t === 'r') { const add = a - st.bets[i]; st.stacks[i] -= add; st.bets[i] = a; st.text = name(i) + ': рейз до ' + r2(a) + ' BB'; st.act[i] = { t: 'r', v: r2(a) }; }
      else if (t === 'U') {
        st.stacks[i] += a; st.bets[i] -= a;
        if (out.length > 2) { const keep = out[out.length - 1]; const txt = st.text, ac = st.actor; st.text = keep.text; st.actor = keep.actor; out.pop(); snap(); st.text = txt; st.actor = ac; continue; }
        st.text = 'Возврат неуравненной ставки ' + r2(a) + ' BB: ' + name(i);
      }
      else if (t === 'W') {
        if (!collected) { st.bets.forEach(b => { st.pot += b; }); st.bets.fill(0); collected = true; st.street = 4; st.actor = -1; if (Object.keys(rp.sh || {}).length) st.show = true; st.act = st.act.map(() => null); }
        st.stacks[i] += a; st.pot -= a; st.won[i] += a; st.act[i] = { t: 'w', v: r2(st.won[i]) };
        if (!wins.includes(i)) wins.push(i);
        continue; // кадр — один на все выигрыши, после цикла
      }
      if (ai) { st.allin[i] = true; st.text += ' — олл-ин'; if (st.act[i]) st.act[i].ai = true; }
      snap();
    }
    if (wins.length) {
      const who = (i) => (i === rp.h ? 'Вы' : name(i)), amt = (i) => r2(st.won[i]) + ' BB';
      const same = wins.length > 1 && wins.every(i => Math.abs(st.won[i] - st.won[wins[0]]) < 0.02);
      if (wins.length === 1) st.text = (wins[0] === rp.h ? 'Вы забираете ' : name(wins[0]) + ' забирает ') + amt(wins[0]);
      else if (same) st.text = 'Банк делят ' + wins.map(who).join(' и ') + ': по ' + amt(wins[0]);
      else st.text = 'Банк: ' + wins.map(i => who(i) + ' ' + amt(i)).join(', ');
      st.actor = -1; snap();
    }
    const last = out[out.length - 1]; if (Math.abs(last.pot) < 0.1) last.pot = 0; // округление копеек WPN
    return out;
  }

  window.Replay = { frames, STREETS };
  if (typeof module !== 'undefined') module.exports = { frames };
})();
