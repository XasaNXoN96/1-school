'use strict';
const fs = require('node:fs');
const path = require('node:path');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'",
};

function send(res, status, data, headers = {}) {
  const isBuf = Buffer.isBuffer(data);
  const body = isBuf ? data : JSON.stringify(data);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': isBuf ? 'application/octet-stream' : 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

async function readBody(req, limit = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'Слишком большой запрос');
    chunks.push(chunk);
  }
  if (!size) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'Некорректный JSON'); }
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// Отдаёт файл из root (с поддержкой Range для видео/аудио). Защита от выхода за пределы папки.
function serveFile(res, root, rel, headers = {}, req = null) {
  const rootAbs = path.resolve(root);
  let abs;
  try { abs = path.resolve(rootAbs, '.' + path.sep + decodeURIComponent(rel)); } catch { return false; }
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) return false;
  try {
    let file = abs;
    if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    const stat = fs.statSync(file);
    const type = MIME[path.extname(file).toLowerCase()];
    if (!type) return false;
    const base = { ...SECURITY_HEADERS, 'Content-Type': type, 'Accept-Ranges': 'bytes', ...headers };
    const range = req && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range && (range[1] || range[2])) {
      let start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]));
      let end = range[1] && range[2] ? Number(range[2]) : stat.size - 1;
      end = Math.min(end, stat.size - 1);
      if (start > end || start >= stat.size) { res.writeHead(416, { ...base, 'Content-Range': `bytes */${stat.size}` }); res.end(); return true; }
      res.writeHead(206, { ...base, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
      fs.createReadStream(file, { start, end }).pipe(res);
      return true;
    }
    res.writeHead(200, { ...base, 'Content-Length': stat.size });
    if (stat.size > 1_000_000) fs.createReadStream(file).pipe(res); else res.end(fs.readFileSync(file));
    return true;
  } catch { return false; }
}

module.exports = { HttpError, send, readBody, parseCookies, serveFile, SECURITY_HEADERS };
