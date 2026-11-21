'use strict';
// Обёртка над рабочим потоком распознавания лиц. Интерфейс: engine.analyze(pngBuffer) -> Promise<result>.
const fs = require('node:fs');
const path = require('node:path');
const { Worker } = require('node:worker_threads');

const MAX_QUEUE = 6, TIMEOUT_MS = 40_000;

function createFaceEngine({ dir }) {
  const available = fs.existsSync(path.join(dir, 'face-api.min.js')) && fs.existsSync(path.join(dir, 'face_recognition_model-weights_manifest.json'));
  let worker = null, seq = 0, queued = 0;
  const waiting = new Map();

  function start() {
    worker = new Worker(path.join(__dirname, 'face-worker.js'), { workerData: { dir } });
    worker.unref();
    worker.on('message', ({ id, result, error }) => {
      const w = waiting.get(id); if (!w) return;
      waiting.delete(id); clearTimeout(w.timer);
      error ? w.reject(new Error(error)) : w.resolve(result);
    });
    const fail = (e) => { for (const w of waiting.values()) { clearTimeout(w.timer); w.reject(e); } waiting.clear(); worker = null; };
    worker.on('error', fail);
    worker.on('exit', () => fail(new Error('Модуль распознавания остановился')));
  }

  return {
    available,
    busy: () => queued >= MAX_QUEUE,
    analyze(png) {
      if (!available) return Promise.reject(new Error('Модуль распознавания лиц не установлен'));
      if (queued >= MAX_QUEUE) return Promise.reject(new Error('Сервер занят проверками, повторите через минуту'));
      if (!worker) start();
      const id = ++seq; queued++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { waiting.delete(id); reject(new Error('Превышено время анализа')); }, TIMEOUT_MS);
        waiting.set(id, { resolve, reject, timer });
        worker.postMessage({ id, png });
      }).finally(() => { queued--; });
    },
    close() { worker?.terminate(); worker = null; },
  };
}

module.exports = { createFaceEngine };
