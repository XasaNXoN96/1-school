'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../server/app');

async function startTestApp(opts = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'school-'));
  const app = createApp({ dbFile: ':memory:', dataDir, publicDir: path.join(__dirname, '..', 'public'), ...opts });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;

  function client() {
    let cookie = '';
    return async (method, url, body) => {
      const res = await fetch(base + url, {
        method,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      const set = res.headers.getSetCookie?.() || [];
      for (const c of set) { const kv = c.split(';')[0]; cookie = kv.endsWith('=') ? '' : kv; }
      const data = await res.json().catch(() => null);
      return { status: res.status, data };
    };
  }
  const close = () => { app.server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); };
  return { ...app, base, client, close, dataDir };
}

module.exports = { startTestApp };
