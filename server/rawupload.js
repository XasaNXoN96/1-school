'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { HttpError } = require('./http');

const MAX_BYTES = 150 * 1024 * 1024; // 150 МБ
const EXTS = ['mp4', 'webm', 'mp3', 'ogg', 'wav', 'm4a', 'pdf', 'doc', 'docx', 'xls', 'xlsx'];

// Проверка «магических байтов» — чтобы под видом видео не загрузили что-то другое.
function sniffMedia(head, ext) {
  const s4 = head.subarray(0, 4).toString('latin1');
  if (ext === 'mp4' || ext === 'm4a') return head.subarray(4, 8).toString('latin1') === 'ftyp';
  if (ext === 'webm') return head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
  if (ext === 'ogg') return s4 === 'OggS';
  if (ext === 'wav') return s4 === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WAVE';
  if (ext === 'pdf') return head.subarray(0, 4).toString('latin1') === '%PDF';
  if (ext === 'docx' || ext === 'xlsx') return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
  if (ext === 'doc' || ext === 'xls') return head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0;
  if (ext === 'mp3') return head.subarray(0, 3).toString('latin1') === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0);
  return false;
}

// Потоковая загрузка видео/аудио (тело запроса — сам файл).
async function handleRawUpload(req, uploadsDir, ext) {
  ext = String(ext || '').toLowerCase();
  if (!EXTS.includes(ext)) throw new HttpError(400, `Допустимы форматы: ${EXTS.join(', ')}`);
  const declared = Number(req.headers['content-length'] || 0);
  if (declared > MAX_BYTES) throw new HttpError(413, 'Файл больше 150 МБ');
  fs.mkdirSync(uploadsDir, { recursive: true });
  const name = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
  const dest = path.join(uploadsDir, name);
  const out = fs.createWriteStream(dest);
  let size = 0, head = Buffer.alloc(0), tooBig = false;
  try {
    await new Promise((resolve, reject) => {
      req.on('data', (chunk) => {
        size += chunk.length;
        if (head.length < 16) head = Buffer.concat([head, chunk.subarray(0, 16 - head.length)]);
        if (size > MAX_BYTES) { tooBig = true; req.destroy(); return; }
        if (!out.write(chunk)) { req.pause(); out.once('drain', () => req.resume()); }
      });
      req.on('end', () => out.end(resolve));
      req.on('error', reject);
      req.on('close', () => { if (tooBig) reject(new Error('too big')); });
      out.on('error', reject);
    });
  } catch {
    out.destroy(); fs.rmSync(dest, { force: true });
    throw new HttpError(tooBig ? 413 : 400, tooBig ? 'Файл больше 150 МБ' : 'Загрузка прервана');
  }
  if (!size || !sniffMedia(head, ext)) { fs.rmSync(dest, { force: true }); throw new HttpError(400, 'Файл не похож на допустимый формат (видео, аудио, PDF, Word, Excel)'); }
  return { file: name };
}

module.exports = { handleRawUpload };
