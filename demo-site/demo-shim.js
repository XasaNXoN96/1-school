// Демо без сервера: подменяет /api/* данными из demo-data.json. Изменения не сохраняются.
(() => {
  window.__DEMO_ROOT = new URL('./', document.currentScript.src).href;
  const base = new URL('demo-data.json', document.currentScript.src).href;
  let DATA; const load = () => DATA || (DATA = fetch(base, { cache: 'no-store' }).then(r => r.json()));
  const real = window.fetch.bind(window);
  const K = 'demo_user';
  const cur = () => { try { return localStorage.getItem(K) || window.name.replace(/^demo:/, '') || ''; } catch { return window.name.replace(/^demo:/, ''); } };
  const setCur = (u) => { window.name = u ? 'demo:' + u : ''; try { u ? localStorage.setItem(K, u) : localStorage.removeItem(K); } catch {} };
  const J = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
  window.fetch = async (url, opts = {}) => {
    const u = typeof url === 'string' ? url : url.url;
    if (!u.startsWith('/api/')) return real(url, opts);
    const d = await load(); const method = (opts.method || 'GET').toUpperCase();
    const path = u.split('?')[0];
    if (path === '/api/auth/login') {
      let b = {}; try { b = JSON.parse(opts.body); } catch {}
      const rec = d.users[String(b.username || '').trim()];
      if (!rec || b.password !== 'Demo-2026-School') return J({ error: 'Неверный логин или пароль' }, 401);
      setCur(b.username.trim()); return J(rec.user);
    }
    if (path === '/api/auth/logout') { setCur(''); return J({ ok: true }); }
    if (path.startsWith('/api/checkin/')) {
      let b = {}; try { b = JSON.parse(opts.body || '{}'); } catch {}
      const me = (d.users[cur()] || {}).user || {};
      if (path === '/api/checkin/state') return J({ name: me.full_name || 'Rustam Karimov', enrolled: true, engine: true, check_in: null, check_out: null, review: '', radius_m: 150 });
      if (path === '/api/checkin/start') {
        const ch = { live: ['smile', 'turn_left'], face: ['turn_right', 'wink_right'], zone: ['wink_left', 'smile'], pend: ['smile', 'turn_left'] }[b.demo] || ['wink_left', 'smile'];
        return J({ token: 'demo-' + (b.demo || 'ok'), kind: b.kind || 'in', challenges: ch, ttl_sec: 180, radius_m: 150, via: 'web', name: me.full_name || 'Rustam Karimov', engine: true });
      }
      if (path === '/api/checkin/finish') {
        const scn = String(b.token || '').replace('demo-', '') || 'ok';
        const steps = (ok) => [{ id: 'wink_left', ok }, { id: 'smile', ok }];
        const mk = (status, reason, zone, face, live, extra = {}) => ({ status, reason, message: '', kind: 'in', time: '08:57', id: 0, checks: { zone, face, live }, ...extra });
        const zOk = { ok: true, distance: 42, radius: 150, accuracy: 16 };
        const R = {
          ok: mk('ok', '', zOk, { ok: true, state: 'match' }, { ok: true, steps: steps(true) }),
          pend: mk('pending', 'face_review', zOk, { ok: true, state: 'review' }, { ok: true, steps: steps(true) }),
          zone: mk('rejected', 'outside_zone', { ok: false, distance: 340, radius: 150, accuracy: 18 }, { ok: true, state: 'match' }, { ok: true, steps: steps(true) }),
          face: mk('rejected', 'other_person', zOk, { ok: false, state: 'fail' }, { ok: true, steps: steps(true) }),
          live: mk('rejected', 'liveness_failed', zOk, { ok: true, state: 'match' }, { ok: false, steps: steps(false) }),
        };
        return J(R[scn] || R.ok);
      }
    }
    if (method === 'POST' && /^\/api\/faces\/\d+$/.test(path)) return J({ id: 0, count: 3, score: 0.95, threshold: 0.45 });
    if (method === 'GET' && path === '/api/checkins') {
      const r0 = d.users[cur()]; const all = r0 && r0.map['/api/checkins']; const st = new URLSearchParams(u.split('?')[1] || '').get('status');
      if (all) return J({ ...all, attempts: st ? all.attempts.filter((a) => a.status === st) : all.attempts });
    }
    if (path === '/api/parent/login') { let b = {}; try { b = JSON.parse(opts.body); } catch {} if (String(b.code || '').trim().toUpperCase() !== 'DEMO2345') return J({ error: 'Код не найден. Для демо используйте DEMO2345' }, 401); try { sessionStorage.setItem('demo_parent', '1'); } catch {} return J({ ok: true, student_id: 1 }); }
    if (path === '/api/parent/logout') { try { sessionStorage.removeItem('demo_parent'); } catch {} return J({ ok: true }); }
    if (method === 'GET' && path.startsWith('/api/parent/')) { let on = false; try { on = !!sessionStorage.getItem('demo_parent'); } catch {} if (!on) return J({ error: 'Войдите по коду родителя' }, 401); }
    if (method !== 'GET') return J({ ok: true, demo: true });
    if (path === '/api/auth/me') { const r = d.users[cur()]; return r ? J(r.user) : J({ error: 'Требуется вход' }, 401); }
    if (d.public[path] !== undefined) {
      let v = d.public[path]; const q = new URLSearchParams(u.split('?')[1] || '');
      if (Array.isArray(v) && path === '/api/public/events') { const f = q.get('from'), t = q.get('to'); v = v.filter((x) => (!f || x.date >= f) && (!t || x.date <= t)); }
      if (Array.isArray(v)) { const k = q.get('kind'); if (k) v = v.filter((x) => x.kind === k); const n = +q.get('limit'); if (n) v = v.slice(0, n); }
      return J(v);
    }
    const r = d.users[cur()]; if (!r) return J({ error: 'Требуется вход' }, 401); const q0 = new URLSearchParams(u.split('?')[1] || '');
    if (path === '/api/events' && r.map[path]) { const f = q0.get('from'), t = q0.get('to'); return J({ ...r.map[path], events: r.map[path].events.filter((x) => (!f || x.date >= f) && (!t || x.date <= t)) }); }
    if (path === '/api/users' && Array.isArray(r.map[path])) { // «был на сайте» считаем от текущего момента
      return J(r.map[path].map((x) => (x._ago == null ? x : { ...x, last_seen: new Date(Date.now() - (x._ago <= 2 ? 30 * 1000 : x._ago * 60000)).toISOString().replace('T', ' ').slice(0, 19) })));
    }
    if (r.map[u] !== undefined) return J(r.map[u]);
    if (r.map[path] !== undefined) return J(r.map[path]);
    return J([]);
  };
  addEventListener('DOMContentLoaded', () => {
    const b = document.createElement('div');
    b.textContent = 'ДЕМО · тестовые данные, изменения не сохраняются · вход: director или teacher1 / Demo-2026-School · код родителя: DEMO2345';
    b.style.cssText = 'position:fixed;left:50%;bottom:8px;transform:translateX(-50%);z-index:99999;background:#0a2c75;color:#fff;font:12px/1.3 system-ui,sans-serif;padding:6px 12px;border-radius:999px;opacity:.92;max-width:94vw;text-align:center;pointer-events:none';
    document.body.appendChild(b);
  });
})();
