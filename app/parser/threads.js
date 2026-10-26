'use strict';
// Сколько потоков брать под разбор и EV — по ядрам И свободной памяти этого компьютера.
// Режим (process.env.MDALAB_PERF, задаётся в окне загрузки): auto — по умолчанию, eco — половина (удобно работать параллельно),
// max — всё под загрузку. Память: поток разбора — до ~300 МБ, поток EV — до ~200 МБ; 1,5 ГБ оставляется системе и окну программы.
const os = require('os');
function cores() { try { return os.availableParallelism ? os.availableParallelism() : (os.cpus() || []).length || 1; } catch (e) { return 1; } }
function mode() { const m = process.env.MDALAB_PERF; return m === 'eco' || m === 'max' ? m : 'auto'; }
function threadsFor(kind) {
  const c = cores(), m = mode();
  const perMb = kind === 'parse' ? 300 : 200, cap = kind === 'parse' ? 12 : 16;
  const free = os.freemem() / 1048576 - 1536;
  const byMem = Math.max(1, Math.floor(free / perMb));
  let n = m === 'max' ? c : c - 1;
  n = Math.min(n, cap, byMem);
  if (m === 'eco') n = Math.floor(n / 2);
  return Math.max(1, n);
}
module.exports = { threadsFor, cores, mode };
