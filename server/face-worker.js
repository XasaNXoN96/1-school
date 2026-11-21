'use strict';
// Рабочий поток: face-api.js на чистом JS (CPU). Модели загружаются один раз.
const path = require('node:path');
const { parentPort, workerData } = require('node:worker_threads');
const { decodePng } = require('./png');

const dir = workerData.dir;
const faceapi = require(path.join(dir, 'face-api.min.js'));
const tf = faceapi.tf;

const ready = (async () => {
  await tf.setBackend('cpu');
  await tf.ready();
  await faceapi.nets.tinyFaceDetector.loadFromDisk(dir);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(dir);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(dir);
})();

async function analyze(png) {
  const img = decodePng(Buffer.from(png));
  const t = tf.tensor3d(new Int32Array(img.data), [img.h, img.w, 3], 'int32');
  try {
    const all = await faceapi.detectAllFaces(t, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
      .withFaceLandmarks().withFaceDescriptors();
    const faces = all.map((f) => ({
      score: f.detection.score, box: { x: f.detection.box.x, y: f.detection.box.y, w: f.detection.box.width, h: f.detection.box.height },
      landmarks: f.landmarks.positions.map((p) => [p.x, p.y]), descriptor: Array.from(f.descriptor),
    })).sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h);
    // Мелкие лица на заднем плане (меньше 35% площади главного) не считаем «вторым человеком»
    const main = faces[0];
    const extra = main ? faces.slice(1).filter((f) => f.box.w * f.box.h >= 0.35 * main.box.w * main.box.h).length : 0;
    return { width: img.w, height: img.h, count: main ? 1 + extra : 0, ...(main || {}) };
  } finally { t.dispose(); }
}

parentPort.on('message', async ({ id, png }) => {
  try { await ready; parentPort.postMessage({ id, result: await analyze(png) }); }
  catch (e) { parentPort.postMessage({ id, error: String(e.message || e) }); }
});
