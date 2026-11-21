'use strict';
// Минимальный декодер PNG (8 бит, RGB/RGBA, без чересстрочности) — этого достаточно для кадров,
// которые браузер получает через canvas.toBlob('image/png'). Без зависимостей.
const zlib = require('node:zlib');

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_SIDE = 1280;

function readHeader(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 33 || !buf.subarray(0, 8).equals(SIG)) throw new Error('Это не PNG-изображение');
  if (buf.toString('ascii', 12, 16) !== 'IHDR') throw new Error('Повреждённый PNG');
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20), bitDepth = buf[24], colorType = buf[25], interlace = buf[28];
  if (!w || !h || w > MAX_SIDE || h > MAX_SIDE) throw new Error('Недопустимый размер изображения');
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || interlace) throw new Error('Неподдерживаемый формат PNG');
  return { w, h, colorType };
}

function decodePng(buf) {
  const { w, h, colorType } = readHeader(buf);
  const bpp = colorType === 2 ? 3 : 4, stride = w * bpp;
  const idat = [];
  for (let p = 8; p + 12 <= buf.length;) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8);
    if (len > buf.length) throw new Error('Повреждённый PNG');
    if (type === 'IDAT') idat.push(buf.subarray(p + 8, p + 8 + len));
    if (type === 'IEND') break;
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat), { maxOutputLength: (stride + 1) * h + 16 });
  if (raw.length < (stride + 1) * h) throw new Error('Повреждённый PNG');
  const out = new Uint8Array(w * h * 3);
  let prev = Buffer.alloc(stride), cur = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    raw.copy(cur, 0, y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = cur[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      else if (f !== 0) throw new Error('Повреждённый PNG');
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) { const o = (y * w + x) * 3; out[o] = cur[x * bpp]; out[o + 1] = cur[x * bpp + 1]; out[o + 2] = cur[x * bpp + 2]; }
    [prev, cur] = [cur, prev];
  }
  return { w, h, data: out };
}

module.exports = { decodePng, readHeader };
