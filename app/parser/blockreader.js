'use strict';
// Чтение записей реплеера по порядку файла крупными окнами (16 МБ): запись берётся из уже прочитанного окна.
const fs = require('fs');
const path = require('path');
const WIN = 16 * 1024 * 1024;
class BlockReader {
  constructor(dir) { this.dir = dir; this.p = -1; this.fd = null; this.base = 0; this.buf = Buffer.alloc(0); }
  get(p, o, l) {
    if (p !== this.p) { if (this.fd != null) fs.closeSync(this.fd); this.fd = fs.openSync(path.join(this.dir, 'rp_' + p + '.dat'), 'r'); this.p = p; this.buf = Buffer.alloc(0); this.base = 0; }
    if (o < this.base || o + l > this.base + this.buf.length) {
      const size = fs.fstatSync(this.fd).size, n = Math.min(Math.max(WIN, l), size - o);
      const b = Buffer.allocUnsafe(Math.max(0, n)); const got = n > 0 ? fs.readSync(this.fd, b, 0, n, o) : 0;
      this.buf = b.subarray(0, got); this.base = o;
    }
    return this.buf.subarray(o - this.base, o - this.base + l);
  }
  close() { if (this.fd != null) fs.closeSync(this.fd); this.fd = null; this.p = -1; }
}
module.exports = { BlockReader };
