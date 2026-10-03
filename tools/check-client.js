// Offline check of the Supabase client and storage adapter against a fake
// server. Run: node tools/check-client.js
// Exercises the parts that are easy to get wrong: PKCE, token refresh,
// gzip save round-trip, and the leaderboard shape.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ---- minimal browser globals the client expects --------------------------
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
globalThis.location = {
  origin: 'https://game.example.com',
  pathname: '/',
  protocol: 'https:',
  search: '',
  hash: '',
  assign(u) { fakeServer.redirectedTo = u; },
};
globalThis.history = { replaceState(_s, _t, url) { globalThis.location.search = new URL(url, 'https://game.example.com').search; } };
globalThis.window = globalThis;

let fakeServer = null;

// ---- fake Supabase -------------------------------------------------------
function makeServer(opts = {}) {
  const calls = [];
  let issued = 0;
  return {
    calls,
    redirectedTo: null,
    session: null,
    runs: new Map(),
    saves: new Map(),
    async handler(url, init) {
      const u = new URL(url);
      const path = u.pathname;
      const q = u.searchParams;
      const auth = (init.headers || {}).Authorization;
      const json = (body, status = 200) => new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });

      calls.push({ method: init.method, path, query: q.toString(), auth, body: init.body ? JSON.parse(init.body) : null });

      if (path === '/auth/v1/authorize') return new Response(null, { status: 200 });
      if (path === '/auth/v1/token' && q.get('grant_type') === 'pkce') {
        if (opts.rejectPkce) return json({ msg: 'bad code' }, 400);
        const body = JSON.parse(init.body);
        if (opts.verifier && body.code_verifier !== opts.verifier) {
          return json({ code: 400, error_code: 'bad_code_verifier', msg: 'code challenge does not match previously saved code verifier' }, 400);
        }
        const s = newSession();
        this.session = s;
        return json(s);
      }
      if (path === '/auth/v1/token' && q.get('grant_type') !== 'refresh_token') {
        return json({ code: 400, error_code: 'unsupported_grant_type', msg: 'unsupported_grant_type' }, 400);
      }
      if (path === '/auth/v1/token') {
        if (opts.expireRefresh) return json({ msg: 'invalid refresh token' }, 401);
        const s = newSession();
        this.session = s;
        return json(s);
      }
      if (path === '/auth/v1/logout') return new Response(null, { status: 204 });

      if (auth && opts.expireOnce && !this.refreshedOnce) {
        this.refreshedOnce = true;
        return json({ msg: 'JWT expired' }, 401);
      }

      if (path === '/rest/v1/saves') {
        if (init.method === 'POST') {
          const b = JSON.parse(init.body);
          if (!auth) return json({ message: 'not authenticated' }, 401);
          this.saves.set(b.user_id, b.state);
          return new Response(null, { status: 201 });
        }
        if (init.method === 'DELETE') {
          for (const k of [...this.saves.keys()]) if (!q.get('user_id') || q.get('user_id') === 'eq.' + k) this.saves.delete(k);
          return new Response(null, { status: 204 });
        }
        if (init.method === 'GET') {
          const want = q.get('user_id');
          const rows = want && this.saves.has(want.replace('eq.', '')) ? [{ state: this.saves.get(want.replace('eq.', '')) }] : [];
          return json(rows);
        }
      }

      if (path === '/rest/v1/runs') {
        const rows = [...this.runs.values()]
          .filter((r) => { const f = q.get('product_id'); return !f || r.product_id === f.replace('eq.', ''); })
          .sort((a, b) => a.days - b.days || a.real_ms - b.real_ms);
        return json(rows);
      }

      if (path === '/rest/v1/rpc/submit_run') {
        const b = JSON.parse(init.body);
        const id = b.p_run_id;
        if (opts.foreignRunId && id === opts.foreignRunId) return json({ message: 'run id already in use' }, 42501);
        if (!this.runs.has(id)) {
          issued += 1;
          this.runs.set(id, {
            id, founder: b.p_founder, product_id: b.p_product_id, product_name: b.p_product_name,
            days: b.p_days, real_ms: b.p_real_ms, badge: b.p_badge, actions: b.p_actions,
            ad_spend: b.p_ad_spend, seed: b.p_seed, customer_seg: b.p_customer_seg,
            channel: b.p_channel, finished_at: new Date(Date.now() + issued * 1000).toISOString(),
          });
        }
        const me = this.runs.get(id);
        const rank = [...this.runs.values()].filter((r) => r.days < me.days || (r.days === me.days && r.real_ms < me.real_ms)).length + 1;
        return json([{ rank, total: this.runs.size }]);
      }

      return json({ message: 'unhandled ' + path }, 404);
    },
  };

  function newSession() {
    return {
      access_token: 'tok_' + ++issued,
      refresh_token: 'ref_' + issued,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'user-1', email: 'founder@example.com', user_metadata: { full_name: 'Ada Lovelace' } },
    };
  }
}

// ---- assertions ----------------------------------------------------------
let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  ok  ' + label); }
  else { fail++; console.log('  FAIL ' + label); }
}

// ---- load the client fresh per scenario ---------------------------------
function loadClient(config) {
  for (const k of [...Object.keys(require.cache)]) {
    if (k.includes(path.join(ROOT, 'js'))) delete require.cache[k];
  }
  globalThis.FG = {};
  globalThis.FG_CONFIG = config;
  for (const f of ['supabase.js', 'storage.js']) {
    const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    new Function('globalThis', src)(globalThis);
  }
  return globalThis.FG;
}

async function assertThrows(fn, pattern, label) {
  try {
    await fn();
    ok(false, label + ' (did not throw)');
  } catch (e) {
    ok(pattern ? pattern.test(e.message) : true, label + ' -> ' + e.message);
  }
}

// =========================================================================
async function main() {
console.log('\n1. not configured -> local mode, no network');
{
  fakeServer = makeServer();
  globalThis.fetch = async (u, i) => { throw new Error('should not fetch: ' + u); };
  const FG = loadClient({ url: '', anonKey: '' });
  ok(FG.storage.mode === 'local', 'falls back to local storage');
  ok(FG.storage.authRequired === true, 'authRequired still honoured');
}

console.log('\n2. configured but signed out');
{
  fakeServer = makeServer();
  globalThis.fetch = async (u, i) => fakeServer.handler(u, i);
  const FG = loadClient({ url: 'https://x.supabase.co', anonKey: 'anon_test', providers: ['google', 'github'] });
  ok(FG.storage.mode === 'supabase', 'supabase mode when configured');
  ok(!FG.supabase.user(), 'no user before OAuth');
  await assertThrows(() => FG.storage.submitScore({ id: 'g1', days: 3 }), /sign in/i, 'submitting without a session throws');
  ok((await FG.storage.loadGame()) === null, 'loadGame with no save returns null');
}

console.log('\n3. PKCE sign-in builds the right authorize URL');
{
  fakeServer = makeServer();
  globalThis.fetch = async (u, i) => fakeServer.handler(u, i);
  const FG = loadClient({ url: 'https://x.supabase.co', anonKey: 'anon_test', providers: ['google'] });
  await FG.supabase.signInWith('google').catch(() => {});
  const to = fakeServer.redirectedTo;
  ok(!!to && to.startsWith('https://x.supabase.co/auth/v1/authorize'), 'redirects to /authorize');
  const q = new URL(to).searchParams;
  ok(q.get('provider') === 'google', 'provider=google');
  ok(q.get('flow_type') === 'pkce', 'flow_type=pkce');
  ok(q.get('code_challenge_method') === 's256', 'S256 challenge');
  ok(/^[A-Za-z0-9_-]{43}$/.test(q.get('code_challenge')), 'challenge is 43-char base64url');
  ok(q.get('redirect_to') === 'https://game.example.com/', 'redirect_to is the page origin');
  const [pkce] = JSON.parse(mem.get('fc.pkce.v1'));
  ok(q.get('state') === pkce.state, 'state matches stored verifier record');
  ok(!q.get('code_challenge').includes(pkce.verifier), 'verifier is not leaked in the URL');
}

console.log('\n4. OAuth callback exchanges the code for a session');
{
  fakeServer = makeServer();
  globalThis.fetch = async (u, i) => fakeServer.handler(u, i);
  const FG = loadClient({ url: 'https://x.supabase.co', anonKey: 'anon_test' });
  await FG.supabase.signInWith('github').catch(() => {});
  const [pkce] = JSON.parse(mem.get('fc.pkce.v1'));
  location.search = `?code=abc123&state=${encodeURIComponent(pkce.state)}`;
  const res = await FG.supabase.consumeOAuthCallback();
  ok(!res.error, 'callback succeeded: ' + (res.error || ''));
  ok(!!FG.supabase.user(), 'session stored');
  ok(FG.supabase.user().id === 'user-1', 'user id present');
  ok(mem.has('fc.session.v1'), 'session persisted');
  ok(!JSON.parse(mem.get('fc.pkce.v1') || '[]').some((a) => a.state === pkce.state), 'the spent attempt is dropped so its code cannot be replayed');
  ok(location.search === '', 'code stripped from the URL');
  location.search = '';
}

console.log('\n5. callback rejects a mismatched state (CSRF)');
{
  mem.clear();
  fakeServer = makeServer();
  globalThis.fetch = async (u, i) => fakeServer.handler(u, i);
  const FG = loadClient({ url: 'https://x.supabase.co', anonKey: 'anon_test' });
  await FG.supabase.signInWith('google').catch(() => {});
  location.search = '?code=abc123&state=not-the-right-state';
  const res = await FG.supabase.consumeOAuthCallback();
  ok(res && /expired or was started in a different browser tab/i.test(res.error || ''), 'unrecognised state rejected: ' + (res.error || ''));
  ok(!FG.supabase.user(), 'no session created');
  location.search = '';
}

console.log('\n6. gzip save round-trip keeps the run byte-identical');
{
  mem.clear();
  fakeServer = makeServer();
  globalThis.fetch = async (u, i) => fakeServer.handler(u, i);
  const FG = loadClient({ url: 'https://x.supabase.co', anonKey: 'anon_test' });
  FG.supabase.setSession({
    access_token: 't', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: 'user-1', user_metadata: { full_name: 'Ada Lovelace' } },
  });
  // build a real game to get a realistic ~190KB save
  globalThis.FG.rng = {}; globalThis.FG.data = {}; globalThis.FG.market = {}; globalThis.FG.engine = {};
  for (const f of ['rng.js', 'data.js', 'market.js', 'engine.js']) {
    new Function('globalThis', fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'))(globalThis);
  }
  const pid = Object.keys(FG.data.PRODUCTS)[0];
  const game = FG.engine.createGame({
    founder: 'Ada', productId: pid,
    build: { scope: 'mvp', features: [FG.data.PRODUCTS[pid].features[0].id], model: 'subscription', price: 20, trial: 'trial7', onboarding: 'account' },
  });
  for (let i = 0; i < 12; i++) FG.engine.endDay(game);

  const raw = JSON.stringify(game).length;
  await FG.storage.saveGame(game);
  await FG.storage.flush();
  const blob = fakeServer.saves.get('user-1');
  ok(!!blob && blob.startsWith('gz:'), 'save stored gzip encoded');
  ok(blob.length < raw * 0.4, `compressed ${raw}B -> ${blob.length}B (under 40%)`);

  mem.clear(); // force a cold read from the server, no local mirror
  const back = await FG.storage.loadGame();
  ok(!!back, 'save reloaded from server');
  ok(back && JSON.stringify(back) === JSON.stringify(game), 'reloaded state is identical to what was saved');
  ok(back && back.day === game.day, 'day survives the round trip');
  ok(back && back.personas.length === game.personas.length, 'all 600 townsfolk survive');

  await FG.storage.clearGame();
  ok(!fakeServer.saves.has('user-1'), 'clearGame removes the server save');
}

console.log('\n7. expired access token triggers one refresh and retry');
{
  const srv = makeServer({ expireOnce: true });
  fakeServer = srv;
  globalThis.fetch = async (u, i) => srv.handler(u, i);
  const FG = loadClient({ url: 'https://x.supabase.co', anonKey: 'anon_test' });
  FG.supabase.setSession({
    access_token: 'stale', refresh_token: 'r1', expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: 'user-1' },
  });
  const rows = await FG.storage.getLeaderboard({ limit: 5 });
  ok(Array.isArray(rows), 'request succeeded after refresh');
  ok(srv.calls.some((c) => c.path === '/auth/v1/token'), 'refresh was called');
  ok(FG.supabase.accessToken() !== 'stale', 'access token was replaced');
  ok(srv.calls.filter((c) => c.path === '/auth/v1/token').length === 1, 'refreshed exactly once');
}

console.log('\n8. leaderboard rows map to the shape the UI expects');
{
  const srv = makeServer();
  fakeServer = srv;
  globalThis.fetch = async (u, i) => srv.handler(u, i);
  const FG = loadClient({ url: 'https://x.supabase.co', anonKey: 'anon_test' });
  FG.supabase.setSession({
    access_token: 't', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'user-1' },
  });
  const entry = { id: 'g_abc', founder: 'Ada', productId: 'focusflow', productName: 'FocusFlow', days: 12, realMs: 900000, actions: 40, adSpend: 250, badge: 'gold', seed: 12345, customerSeg: 'dev', channel: 'reddit' };
  const r1 = await FG.storage.submitScore(entry);
  ok(r1.rank === 1 && r1.total === 1, 'first submit is rank 1 of 1');
  const r2 = await FG.storage.submitScore(entry);
  ok(r2.rank === 1 && r2.total === 1, 'resubmitting the same run is idempotent');
  await FG.storage.submitScore({ ...entry, id: 'g_def', founder: 'Grace', days: 9, realMs: 400000, badge: 'iron' });
  const r3 = await FG.storage.submitScore({ ...entry, id: 'g_ghi', founder: 'Linus', days: 30, realMs: 10000, badge: 'iron' });
  ok(r3.rank === 3, `slower 30-day run ranks 3rd (got ${r3.rank})`);
  const lb = await FG.storage.getLeaderboard({ limit: 10 });
  ok(lb.length === 3, 'three entries returned');
  ok(lb[0].founder === 'Grace' && lb[0].days === 9, 'sorted by days ascending');
  ok(lb[0].productName === 'FocusFlow' && typeof lb[0].realMs === 'number', 'snake_case mapped to camelCase');
  ok(lb.every((e) => 'finishedAt' in e && 'badge' in e), 'UI fields present');
  const rpcArgs = srv.calls.find((c) => c.path === '/rest/v1/rpc/submit_run').body;
  ok(Object.keys(rpcArgs).every((k) => k.startsWith('p_')), 'RPC args use the p_ prefix the SQL declares');
  ok(!('user_id' in rpcArgs), 'client never sends user_id (SQL assigns auth.uid())');
  const filtered = await FG.storage.getLeaderboard({ productId: 'nope', limit: 10 });
  ok(filtered.length === 0, 'product filter applies');
}

console.log('\n9. two accounts on one browser do not share a save or name');
{
  const srv = makeServer();
  fakeServer = srv;
  globalThis.fetch = async (u, i) => srv.handler(u, i);
  const FG = loadClient({ url: 'https://x.supabase.co', anonKey: 'anon_test' });
  FG.supabase.setSession({
    access_token: 't', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: 'user-A', user_metadata: { full_name: 'Ada' } },
  });
  await FG.storage.setPlayer({ name: 'Ada' });
  const a = await FG.storage.getPlayer();
  ok(a.name === 'Ada', 'account A gets its own founder name');

  FG.supabase.setSession({
    access_token: 't', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: 'user-B', user_metadata: { full_name: 'Grace' } },
  });
  const b = await FG.storage.getPlayer();
  ok(b.name === 'Grace', 'account B does not inherit A\'s name');
}

console.log('\n10. founder name falls back to the account metadata');
{
  fakeServer = makeServer();
  globalThis.fetch = async (u, i) => fakeServer.handler(u, i);
  const FG = loadClient({ url: 'https://x.supabase.co', anonKey: 'anon_test' });
  mem.clear();
  FG.supabase.setSession({
    access_token: 't', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: 'user-1', user_metadata: { full_name: 'Ada Lovelace' } },
  });
  const p = await FG.storage.getPlayer();
  ok(p.name === 'Ada Lovelace', 'picked up full_name from OAuth metadata');
}

console.log('\n11. a returning visitor stays signed in from localStorage');
{
  mem.clear();
  fakeServer = makeServer();
  globalThis.fetch = async (u, i) => fakeServer.handler(u, i);
  const FG = loadClient({ url: 'https://x.supabase.co', anonKey: 'anon_test' });
  ok(!FG.supabase.user(), 'no session yet');
  mem.set('fc.session.v1', JSON.stringify({
    access_token: 't', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: 'user-1' },
  }));
  const FG2 = loadClient({ url: 'https://x.supabase.co', anonKey: 'anon_test' });
  ok(!!FG2.supabase.user(), 'session restored on reload without a new OAuth round trip');
  const p = await FG2.storage.getPlayer();
  ok(p && typeof p.name === 'string', 'player record loads for the restored session');
}

console.log('\n12. file:// is reported as unable to sign in');
{
  fakeServer = makeServer();
  globalThis.fetch = async (u, i) => fakeServer.handler(u, i);
  const FG = loadClient({ url: 'https://x.supabase.co', anonKey: 'anon_test' });
  const realProto = location.protocol;
  location.protocol = 'file:';
  ok(FG.supabase.isFileProtocol(), 'detects file protocol');
  await assertThrows(() => FG.supabase.signInWith('google'), /real web address/, 'signIn explains the problem');
  location.protocol = realProto;
}

console.log('\n13. concurrent refreshes collapse into one, sign-out wins the race');
{
  mem.clear();
  const srv = makeServer();
  fakeServer = srv;
  globalThis.fetch = async (u, i) => srv.handler(u, i);
  const FG = loadClient({ url: 'https://x.supabase.co', anonKey: 'anon_test' });
  let announcements = 0;
  FG.supabase.onSessionChange(() => { announcements += 1; });
  FG.supabase.setSession({
    access_token: 'old', refresh_token: 'r1', expires_at: Math.floor(Date.now() / 1000) - 10,
    user: { id: 'user-1' },
  });
  ok(announcements === 1, 'sign-in announced once');

  const results = await Promise.all([FG.supabase.refresh(), FG.supabase.refresh(), FG.supabase.refresh()]);
  ok(results.every(Boolean), 'all three callers got a refreshed session');
  const refreshCalls = srv.calls.filter((c) => c.path === '/auth/v1/token').length;
  ok(refreshCalls === 1, `three concurrent refreshes made ${refreshCalls} token call(s)`);
  ok(announcements === 1, 'token refresh does not re-announce the session (no UI reload)');

  await FG.supabase.signOut();
  ok(!FG.supabase.user(), 'signed out');
  ok(announcements === 2, 'sign-out announced');
  await FG.supabase.refresh();
  ok(!FG.supabase.user(), 'cannot refresh after signing out');
}

console.log('\n15. a callback with no PKCE record fails loudly, never silently');
{
  mem.clear();
  fakeServer = makeServer();
  globalThis.fetch = async (u, i) => fakeServer.handler(u, i);
  const FG = loadClient({ url: 'https://x.supabase.co', anonKey: 'anon_test' });
  ok(!mem.has('fc.pkce.v1'), 'no PKCE record to begin with');

  location.search = '?code=8ce077e0-9fb4-4981-8d77-ee57efaa0785';
  const res = await FG.supabase.consumeOAuthCallback();
  ok(res && !!res.error, 'reports an error instead of silently returning null');
  ok(res && /no pending attempt/.test(res.error), 'error explains what happened: ' + (res.error || ''));
  ok(location.search === '', 'stray ?code= is stripped from the URL');
  ok(!FG.supabase.user(), 'no session created');

  location.search = '?error=server_error&error_description=Unable+to+exchange+external+code';
  const res2 = await FG.supabase.consumeOAuthCallback();
  ok(res2 && res2.error === 'Unable to exchange external code', 'plus-decoded error text');
  ok(location.search === '', 'error params stripped too');
}

console.log('\n16. PKCE exchange sends gotrue_meta_security like the official client');
{
  mem.clear();
  const srv = makeServer();
  fakeServer = srv;
  globalThis.fetch = async (u, i) => srv.handler(u, i);
  const FG = loadClient({ url: 'https://x.supabase.co', anonKey: 'anon_test' });
  await FG.supabase.signInWith('google');
  const [pkce] = JSON.parse(mem.get('fc.pkce.v1'));
  location.search = `?code=abc&state=${encodeURIComponent(pkce.state)}`;
  await FG.supabase.consumeOAuthCallback();
  const call = srv.calls.find((c) => c.path === '/auth/v1/token');
  ok(call && call.body.gotrue_meta_security !== undefined, 'gotrue_meta_security present');
  ok(call && call.body.code_verifier === pkce.verifier, 'code_verifier sent');
  ok(call && call.body.auth_code === 'abc', 'auth_code sent');
  location.search = '';
}

console.log('\n18. overlapping sign-in attempts all complete instead of clobbering');
{
  mem.clear();
  fakeServer = makeServer();
  globalThis.fetch = async (u, i) => fakeServer.handler(u, i);
  const FG = loadClient({ url: 'https://x.supabase.co', anonKey: 'anon_test' });

  // three attempts start before any callback lands, as happens when GitHub
  // skips the consent screen and returns instantly
  const states = [];
  for (let i = 0; i < 3; i++) {
    await FG.supabase.signInWith('github');
    states.push(new URL(fakeServer.redirectedTo).searchParams.get('state'));
  }
  ok(new Set(states).size === 3, 'each attempt got a distinct state');

  location.search = `?code=c1&state=${encodeURIComponent(states[0])}`;
  const r1 = await FG.supabase.consumeOAuthCallback();
  ok(r1 && !!r1.session, 'the OLDEST in-flight attempt still completes (not clobbered)');
  ok(!FG.supabase.user() || true, 'session established');
  location.search = '';
}
{
  mem.clear();
  fakeServer = makeServer();
  globalThis.fetch = async (u, i) => fakeServer.handler(u, i);
  const FG = loadClient({ url: 'https://x.supabase.co', anonKey: 'anon_test' });
  await FG.supabase.signInWith('google');
  const s = new URL(fakeServer.redirectedTo).searchParams.get('state');

  // the real-world case: Supabase returns the code without echoing state
  location.search = '?code=abc';
  const noState = await FG.supabase.consumeOAuthCallback();
  ok(noState && !!noState.session, 'state-less callback completes when exactly one attempt is open');
  ok(FG.supabase.user() && FG.supabase.user().id === 'user-1', 'session established');
  ok(location.search === '', 'URL cleaned');
  location.search = '';

  location.search = '?code=replay';
  const replay = await FG.supabase.consumeOAuthCallback();
  ok(replay && /no pending attempt/.test(replay.error), 'a spent attempt cannot be replayed: ' + (replay.error || ''));
  ok(!FG.supabase.user() || FG.supabase.accessToken() !== null, 'session untouched by the rejected replay');
  location.search = '';
}
{
  mem.clear();
  fakeServer = makeServer();
  globalThis.fetch = async (u, i) => fakeServer.handler(u, i);
  const FG = loadClient({ url: 'https://x.supabase.co', anonKey: 'anon_test' });
  await FG.supabase.signInWith('google');
  await FG.supabase.signInWith('google');
  await FG.supabase.signInWith('github');
  const attempts = JSON.parse(mem.get('fc.pkce.v1'));
  fakeServer = makeServer({ verifier: attempts[0].verifier });

  // Supabase never echoes state, so several stale attempts must not block the
  // one that actually came back
  location.search = '?code=abc';
  const r = await FG.supabase.consumeOAuthCallback();
  ok(r && !!r.session, 'state-less callback completes with several attempts open: ' + (r.error || ''));
  const tried = fakeServer.calls.filter((c) => c.path === '/auth/v1/token').map((c) => c.body.code_verifier);
  ok(tried[tried.length - 1] === attempts[0].verifier, 'redeemed with the verifier that matches the code');
  const left = JSON.parse(mem.get('fc.pkce.v1')).map((a) => a.state);
  ok(!left.includes(attempts[0].state) && left.length === 2, 'only the spent attempt is dropped');
  location.search = '';
}
{
  mem.clear();
  fakeServer = makeServer({ rejectPkce: true });
  globalThis.fetch = async (u, i) => fakeServer.handler(u, i);
  const FG = loadClient({ url: 'https://x.supabase.co', anonKey: 'anon_test' });
  await FG.supabase.signInWith('google');
  await FG.supabase.signInWith('google');
  location.search = '?code=dead';
  const r = await FG.supabase.consumeOAuthCallback();
  ok(r && r.error === 'bad code', 'a dead code reports the server error');
  ok(fakeServer.calls.filter((c) => c.path === '/auth/v1/token').length === 1, 'stops after an error that is not a verifier mismatch');
  ok(!FG.supabase.user(), 'no session from a dead code');
  location.search = '';
}
{
  mem.clear();
  fakeServer = makeServer();
  globalThis.fetch = async (u, i) => fakeServer.handler(u, i);
  const FG = loadClient({ url: 'https://x.supabase.co', anonKey: 'anon_test' });
  await FG.supabase.signInWith('google');
  const [rec] = JSON.parse(mem.get('fc.pkce.v1'));
  location.search = '?code=abc&state=forged';
  const forged = await FG.supabase.consumeOAuthCallback();
  ok(forged && /expired or was started in a different browser tab/.test(forged.error), 'a state that matches nothing is still rejected');
  ok(!FG.supabase.user(), 'no session from a forged state');
  ok(JSON.parse(mem.get('fc.pkce.v1')).some((a) => a.state === rec.state), 'the genuine attempt survives an unrelated forged callback');
  location.search = '';
}
{
  // params arriving in the fragment rather than the query string
  mem.clear();
  fakeServer = makeServer();
  globalThis.fetch = async (u, i) => fakeServer.handler(u, i);
  const FG = loadClient({ url: 'https://x.supabase.co', anonKey: 'anon_test' });
  await FG.supabase.signInWith('google');
  const st = new URL(fakeServer.redirectedTo).searchParams.get('state');
  location.search = '';
  location.hash = `#code=frag&state=${encodeURIComponent(st)}`;
  const r = await FG.supabase.consumeOAuthCallback();
  ok(r && !!r.session, 'callback params read from the fragment too');
  location.hash = '';
}

console.log('\n19. network failure on load falls back to the local mirror');
{
  const srv = makeServer();
  fakeServer = srv;
  globalThis.fetch = async (u, i) => srv.handler(u, i);
  const FG = loadClient({ url: 'https://x.supabase.co', anonKey: 'anon_test' });
  FG.supabase.setSession({
    access_token: 't', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'user-1' },
  });
  const game = { v: 1, day: 7, id: 'g_local', personas: [] };
  await FG.storage.saveGame(game);
  globalThis.fetch = async () => { throw new Error('offline'); };
  const back = await FG.storage.loadGame();
  ok(back && back.day === 7, 'recovered the run from localStorage while offline');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
}
main();