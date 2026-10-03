// Storage adapter. Everything the game persists goes through FG.storage.
// Two backends: browser localStorage (offline / no config) and Supabase.
// The local mirror is always written first, so a failed network write can
// never lose a run in progress.
(function (FG) {
  'use strict';
  const cfg = Object.assign(
    { storage: 'supabase', authRequired: true },
    globalThis.FG_CONFIG || {}
  );
  const SB = FG.supabase;

  const K_LB = 'fc.leaderboard.v1';

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };

  const online = () => cfg.storage === 'supabase' && SB.configured();
  const uid = () => { const u = SB.user(); return u && u.id; };

  // Namespaced per account so two people sharing a browser don't see each
  // other's run or founder name.
  const keyFor = (kind) => `fc.${kind}.v1.${uid() || 'anon'}`;

  const sortLb = (a, b) => a.days - b.days || a.realMs - b.realMs;

  // ---------- gzip (saves are ~190KB of townsfolk raw, ~23KB compressed) ----------

  const hasCS = () => typeof globalThis.CompressionStream === 'function' && typeof globalThis.DecompressionStream === 'function';

  async function pack(text) {
    if (!hasCS()) return 'js:' + text;
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return 'gz:' + btoa(bin);
  }

  async function unpack(blob) {
    if (!blob) return null;
    try {
      if (blob.slice(0, 3) === 'gz:') {
        if (!hasCS()) return null;
        const bin = atob(blob.slice(3));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        return JSON.parse(await new Response(stream).text());
      }
      return blob.slice(0, 3) === 'js:' ? JSON.parse(blob.slice(3)) : JSON.parse(blob);
    } catch (e) {
      return null;
    }
  }

  // ---------- saves: local mirror first, then the server, on every save ----------

  // writes run one after another so an older save can never land last
  let writing = Promise.resolve();

  function saveGame(state) {
    state.savedAt = Date.now();
    store.set(keyFor('save'), state);
    if (!online() || !uid()) return Promise.resolve(true);
    const id = uid();
    writing = writing
      .then(async () => SB.table('saves').upsert({ user_id: id, state: await pack(JSON.stringify(state)) }, 'user_id'))
      .catch(() => { /* local mirror still holds the run */ });
    return writing.then(() => true);
  }

  const flush = () => writing;

  async function loadGame() {
    let local = store.get(keyFor('save'), null);
    if (!local || local.v !== 1) local = null;
    if (online() && uid()) {
      try {
        const rows = await SB.api(`/rest/v1/saves?select=state&user_id=eq.${encodeURIComponent(uid())}&limit=1`);
        const blob = rows && rows[0] && rows[0].state;
        const remote = blob ? await unpack(blob) : null;
        // the server copy lags the local one by a few seconds, so take
        // whichever was saved last
        if (remote && remote.v === 1 && (!local || (remote.savedAt || 0) > (local.savedAt || 0))) return remote;
      } catch (e) { /* fall through to the local mirror */ }
    }
    return local;
  }

  async function clearGame() {
    store.del(keyFor('save'));
    await writing;   // a save still in flight must not land after the delete
    if (online() && uid()) {
      try { await SB.api('/rest/v1/saves?user_id=eq.' + encodeURIComponent(uid()), { method: 'DELETE' }); } catch (e) {}
    }
  }

  // ---------- leaderboard ----------

  const fromRow = (r) => ({
    id: r.id,
    founder: r.founder,
    productId: r.product_id,
    productName: r.product_name,
    days: r.days,
    realMs: Number(r.real_ms),
    badge: r.badge,
    finishedAt: r.finished_at,
    actions: r.actions,
    adSpend: r.ad_spend,
    seed: r.seed,
    customerSeg: r.customer_seg,
    channel: r.channel,
    username: r.profiles && r.profiles.username,
    avatarUrl: r.profiles && r.profiles.avatar_url,
  });

  const LB_COLS = 'id,founder,product_id,product_name,days,real_ms,badge,finished_at,actions,ad_spend,seed,customer_seg,channel,profiles(username,avatar_url)';

  async function getLeaderboard({ productId = null, limit = 50 } = {}) {
    if (!online()) {
      return store.get(K_LB, []).filter((e) => !productId || e.productId === productId).sort(sortLb).slice(0, limit);
    }
    const q = new URLSearchParams({
      select: LB_COLS,
      order: 'days.asc,real_ms.asc,finished_at.asc',
      limit: String(Math.min(limit, 200)),
    });
    if (productId) q.set('product_id', 'eq.' + productId);
    try {
      const rows = await SB.table('runs').select(q.toString());
      return (rows || []).map(fromRow);
    } catch (e) {
      return store.get(K_LB, []).filter((e) => !productId || e.productId === productId).sort(sortLb).slice(0, limit);
    }
  }

  async function submitScore(entry) {
    if (!online()) {
      const all = store.get(K_LB, []);
      all.push(entry);
      all.sort(sortLb);
      store.set(K_LB, all.slice(0, 500));
      return { rank: all.findIndex((e) => e.id === entry.id) + 1, total: all.length };
    }
    if (!uid()) throw new Error('Sign in to record your score.');
    const r = await SB.table('runs').rpc('submit_run', {
      p_run_id: entry.id,
      p_founder: entry.founder,
      p_product_id: entry.productId,
      p_product_name: entry.productName,
      p_days: entry.days,
      p_real_ms: Math.round(entry.realMs),
      p_actions: entry.actions | 0,
      p_ad_spend: entry.adSpend | 0,
      p_badge: entry.badge,
      p_seed: Number(entry.seed),
      p_customer_seg: entry.customerSeg,
      p_channel: entry.channel,
    });
    const row = Array.isArray(r) ? r[0] : r;
    return { rank: Number(row.rank), total: Number(row.total) };
  }

  // ---------- player (founder name is a display choice, kept local) ----------

  async function getPlayer() {
    const p = store.get(keyFor('player'), { name: '' });
    const u = SB.user();
    if (u && !p.name) {
      const meta = u.user_metadata || {};
      p.name = (meta.full_name || meta.name || meta.user_name || '').trim().slice(0, 20);
      store.set(keyFor('player'), p);
    }
    return p;
  }
  async function setPlayer(p) { return store.set(keyFor('player'), p); }

  FG.storage = {
    mode: online() ? 'supabase' : 'local',
    configured: online,
    authRequired: cfg.authRequired,
    getLeaderboard, submitScore,
    saveGame, loadGame, clearGame, flush,
    getPlayer, setPlayer,
    session: () => SB.getSession(),
    user: () => SB.user(),
    signIn: (p) => SB.signInWith(p),
    signOut: () => SB.signOut(),
    ready: () => SB.consumeOAuthCallback(),
  };
})(globalThis.FG = globalThis.FG || {});