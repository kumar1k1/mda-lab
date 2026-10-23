'use strict';
// Реплеер: превращает сохранённый ход раздачи в последовательность кадров (стеки, ставки, банк, борд).
(function () {
  const STREETS = ['Префлоп', 'Флоп', 'Тёрн', 'Ривер', 'Итог'];
  const r2 = (v) => Math.round(v * 100) / 100;

  function frames(rp) {
    const n = rp.pl.length;
    const st = { stacks: rp.pl.map(p => p[1]), bets: new Array(n).fill(0), pot: 0, folded: new Array(n).fill(false), board: 0, street: 0, actor: -1, text: 'Раздача начинается', show: false, won: new Array(n).fill(0), allin: new Array(n).fill(false) };
    const out = [];
    const snap = () => out.push({ stacks: st.stacks.map(r2), bets: st.bets.map(r2), pot: r2(st.pot), folded: st.folded.slice(), board: st.board, street: st.street, actor: st.actor, text: st.text, show: st.show, won: st.won.slice(), allin: st.allin.slice() });
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
    let collected = false;
    for (; k < rp.ev.length; k++) {
      const [s, i, t, a, ai] = rp.ev[k];
      st.actor = i;
      if (t === 'S') {
        st.bets.forEach(b => { st.pot += b; }); st.bets.fill(0);
        st.street = s; st.board = s === 1 ? 3 : s === 2 ? 4 : 5; st.actor = -1;
        st.text = STREETS[s]; snap(); continue;
      }
      if (t === 'A' || t === 'SB' || t === 'BB') { st.stacks[i] -= a; if (t === 'A') st.pot += a; else st.bets[i] += a; continue; }
      if (t === 'f') { st.folded[i] = true; st.text = name(i) + ': фолд'; }
      else if (t === 'x') st.text = name(i) + ': чек';
      else if (t === 'c') { st.stacks[i] -= a; st.bets[i] += a; st.text = name(i) + ': колл ' + r2(a) + ' BB'; }
      else if (t === 'b') { st.stacks[i] -= a; st.bets[i] += a; st.text = name(i) + ': бет ' + r2(a) + ' BB'; }
      else if (t === 'r') { const add = a - st.bets[i]; st.stacks[i] -= add; st.bets[i] = a; st.text = name(i) + ': рейз до ' + r2(a) + ' BB'; }
      else if (t === 'U') { st.stacks[i] += a; st.bets[i] -= a; st.text = 'Возврат неуравненной ставки ' + r2(a) + ' BB: ' + name(i); }
      else if (t === 'W') {
        if (!collected) {
          st.bets.forEach(b => { st.pot += b; }); st.bets.fill(0); collected = true;
          if (Object.keys(rp.sh || {}).length) { st.show = true; st.street = 4; st.actor = -1; st.text = 'Вскрытие'; snap(); }
          st.street = 4;
        }
        st.stacks[i] += a; st.pot -= a; st.won[i] += a; st.text = (i === rp.h ? 'Вы забираете ' : name(i) + ' забирает ') + r2(a) + ' BB';
      }
      if (ai) { st.allin[i] = true; st.text += ' — олл-ин'; }
      snap();
    }
    const last = out[out.length - 1]; if (Math.abs(last.pot) < 0.1) last.pot = 0; // округление копеек WPN
    return out;
  }

  window.Replay = { frames, STREETS };
  if (typeof module !== 'undefined') module.exports = { frames };
})();
