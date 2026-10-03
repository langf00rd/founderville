// Minimal zero-dependency Supabase client: GoTrue OAuth (PKCE) + PostgREST.
// Exists so the game keeps its no-build, no-npm, plain-<script> setup.
(function (FG) {
  'use strict';

  const cfg = Object.assign(
    { url: '', anonKey: '', redirectTo: '', providers: ['google', 'github'] },
    globalThis.FG_CONFIG || {}
  );

  const K_SESSION = 'fc.session.v1';
  const K_PKCE = 'fc.pkce.v1';
  const SESSION_SKEW_SEC = 60;
  const ATTEMPT_TTL_MS = 15 * 60 * 1000;
  const MAX_ATTEMPTS = 8;

  const trimSlash = (s) => String(s || '').replace(/\/+$/, '');
  const b64url = (buf) => {
    const b = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
    let s = '';
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const randomStr = (n) => {
    const b = new Uint8Array(n);
    (globalThis.crypto || {}).getRandomValues
      ? crypto.getRandomValues(b)
      : b.forEach((_, i) => (b[i] = Math.floor(Math.random() * 256)));
    return b64url(b);
  };

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };

  const configured = () => Boolean(cfg.url && cfg.anonKey);
  const isFileProtocol = () => location.protocol === 'file:';

  // Where Supabase should send the browser back to. On file:// there is no
  // usable origin, so OAuth cannot work and callers should surface that.
  function redirectTo() {
    if (cfg.redirectTo) return cfg.redirectTo;
    if (isFileProtocol()) return '';
    return location.origin + location.pathname;
  }

  // Keep every sign-in still in flight, not just the newest. Two overlapping
  // attempts (second click, or a sign-in started in another tab) otherwise
  // make the first callback look like a forged state.
  function readAttempts() {
    const raw = store.get(K_PKCE, null);
    const list = Array.isArray(raw) ? raw : raw && raw.state ? [raw] : [];
    const fresh = list.filter((a) => a && a.state && Date.now() - a.at < ATTEMPT_TTL_MS);
    return fresh.slice(-MAX_ATTEMPTS);
  }

  function pushAttempt(a) {
    store.set(K_PKCE, readAttempts().concat([a]).slice(-MAX_ATTEMPTS));
  }

  function takeAttempt(state) {
    const list = readAttempts();
    store.set(K_PKCE, list.filter((a) => a.state !== state));
    return list.find((a) => a.state === state) || null;
  }

  async function sha256(text) {
    const data = new TextEncoder().encode(text);
    if (!globalThis.crypto || !crypto.subtle) return null;
    return crypto.subtle.digest('SHA-256', data);
  }

  // ---------- session ----------

  let session = store.get(K_SESSION, null);
  const listeners = new Set();

  function setSession(s) {
    const before = session && session.user && session.user.id;
    session = s && s.access_token ? s : null;
    if (session) store.set(K_SESSION, session); else store.del(K_SESSION);
    // Only announce who is signed in. A routine token refresh swaps the access
    // token constantly and must not make the UI reload state underneath play.
    const after = session && session.user && session.user.id;
    if (before !== after) listeners.forEach((fn) => { try { fn(session); } catch (e) {} });
    return session;
  }

  const user = () => (session && session.user) || null;
  const accessToken = () => (session && session.access_token) || null;
  const expired = () =>
    !session || typeof session.expires_at !== 'number' ||
    session.expires_at - SESSION_SKEW_SEC <= Math.floor(Date.now() / 1000);

  async function api(path, { method = 'GET', body, query, token, extraHeaders, retry = true } = {}) {
    const url = trimSlash(cfg.url) + path + (query ? '?' + query : '');
    const headers = Object.assign({ apikey: cfg.anonKey, 'Content-Type': 'application/json' }, extraHeaders);
    const tok = token === null ? null : token || accessToken();
    if (tok) headers.Authorization = 'Bearer ' + tok;

    const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });

    if (res.status === 401 && retry && tok) {
      if (await refresh()) return api(path, { method, body, query, extraHeaders, retry: false });
    }
    if (res.status === 204) return null;

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
    if (!res.ok) {
      const msg = (data && (data.msg || data.error_description || data.message || data.error)) || res.statusText;
      const err = new Error(msg || res.status + ' ' + path);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  let refreshing = null;

  async function refresh() {
    if (!session || !session.refresh_token) return false;
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        const data = await api('/auth/v1/token', {
          method: 'POST',
          query: 'grant_type=refresh_token',
          body: { refresh_token: session.refresh_token },
          token: null,
          retry: false,
        });
        return Boolean(setSession(data));
      } catch (e) {
        setSession(null);
        return false;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  // ---------- OAuth (PKCE) ----------

  async function signInWith(provider) {
    if (!configured()) throw new Error('Supabase is not configured. Set FG_CONFIG.url and FG_CONFIG.anonKey.');
    const back = redirectTo();
    if (!back) throw new Error('Sign-in needs a real web address. Serve the folder (npx serve .) instead of opening the file directly.');

    const verifier = randomStr(48);
    const digest = await sha256(verifier);
    if (!digest) throw new Error('This browser cannot do OAuth sign-in (no crypto.subtle).');

    const state = randomStr(16);
    pushAttempt({ verifier, state, at: Date.now() });

    const q = new URLSearchParams({
      provider,
      redirect_to: back,
      flow_type: 'pkce',
      code_challenge: b64url(digest),
      code_challenge_method: 's256',
      state,
    });
    location.assign(trimSlash(cfg.url) + '/auth/v1/authorize?' + q.toString());
  }

  async function consumeOAuthCallback() {
    // Supabase returns the callback in the query string on the PKCE flow, but
    // read the fragment too so the implicit style works as well.
    const params = new URLSearchParams(location.search || '');
    const hash = location.hash && location.hash.charAt(0) === '#' ? location.hash.slice(1) : '';
    for (const [k, v] of new URLSearchParams(hash)) if (!params.has(k)) params.set(k, v);
    if (!params.toString()) return null;

    history.replaceState({}, '', location.pathname);

    const errDesc = params.get('error_description') || params.get('error');
    if (errDesc) return { error: decodeURIComponent(errDesc.replace(/\+/g, ' ')) };

    const code = params.get('code');
    if (!code) return null;

    const state = params.get('state');
    if (state) {
      const pkce = takeAttempt(state);
      if (!pkce) {
        return { error: 'This sign-in attempt expired or was started in a different browser tab. Start again from this page.' };
      }
      return exchange(code, [pkce]);
    }

    // Supabase does not echo the client's state back on the PKCE redirect, so
    // there is nothing to match on. Try each pending verifier, newest first:
    // the server keeps the code until a verifier matches, and a code that was
    // injected is bound to someone else's challenge, so none of ours redeem it.
    const pending = readAttempts().reverse();
    if (!pending.length) {
      return { error: 'Sign-in came back with no security token and no pending attempt. Start again from this page.' };
    }
    return exchange(code, pending);
  }

  const badVerifier = (e) =>
    (e.data && e.data.error_code === 'bad_code_verifier') || /code verifier|code challenge/i.test(e.message);

  async function exchange(code, candidates) {
    let last;
    for (const pkce of candidates) {
      try {
        const data = await api('/auth/v1/token', {
          method: 'POST',
          query: 'grant_type=pkce',
          body: { auth_code: code, code_verifier: pkce.verifier, gotrue_meta_security: {} },
          token: null,
          retry: false,
        });
        takeAttempt(pkce.state);
        setSession(data);
        return { session: data };
      } catch (e) {
        last = e;
        if (!badVerifier(e)) break;
      }
    }
    return { error: last.message };
  }

  async function signOut() {
    if (refreshing) await refreshing;
    try {
      if (session && session.refresh_token) {
        await api('/auth/v1/logout', { method: 'POST', body: {}, retry: false });
      }
    } catch (e) { /* local sign-out must succeed regardless */ }
    setSession(null);
  }

  function getSession() {
    if (expired() && session) refresh();
    return session;
  }

  const table = (name) => ({
    select: (q = '') => api(`/rest/v1/${name}?${q}`),
    upsert: (values, onConflict) =>
      api(`/rest/v1/${name}?on_conflict=${encodeURIComponent(onConflict || 'user_id')}`, {
        method: 'POST',
        body: values,
        extraHeaders: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      }),
    rpc: (fn, args) => api(`/rest/v1/rpc/${fn}`, { method: 'POST', body: args }),
  });

  FG.supabase = {
    configured, isFileProtocol, cfg,
    api, table,
    getSession, setSession, refresh, user, accessToken, expired,
    signInWith, consumeOAuthCallback, signOut,
    onSessionChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
})(globalThis.FG = globalThis.FG || {});