// Storage adapter. Everything the game persists goes through FG.storage.
// Today: browser localStorage. Later: set FG_CONFIG.storage = 'api' and
// implement the endpoints described in README.md (see docs/schema.sql).
(function (FG) {
  'use strict';
  const cfg = Object.assign({ storage: 'local', apiBase: '/api' }, globalThis.FG_CONFIG || {});
  const K = { lb: 'fc.leaderboard.v1', save: 'fc.save.v1', player: 'fc.player.v1' };

  const safe = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };

  const sortLb = (a, b) => a.days - b.days || a.realMs - b.realMs;

  const LocalAdapter = {
    async getLeaderboard({ productId = null, limit = 50 } = {}) {
      return safe.get(K.lb, []).filter((e) => !productId || e.productId === productId).sort(sortLb).slice(0, limit);
    },
    async submitScore(entry) {
      const all = safe.get(K.lb, []);
      all.push(entry);
      all.sort(sortLb);
      safe.set(K.lb, all.slice(0, 500));
      return { rank: all.findIndex((e) => e.id === entry.id) + 1, total: all.length };
    },
    async saveGame(state) { return safe.set(K.save, state); },
    async loadGame() { return safe.get(K.save, null); },
    async clearGame() { safe.del(K.save); },
    async getPlayer() { return safe.get(K.player, { name: '' }); },
    async setPlayer(p) { return safe.set(K.player, p); },
  };

  function ApiAdapter(base) {
    const j = async (path, opts = {}) => {
      const r = await fetch(base + path, { headers: { 'Content-Type': 'application/json' }, credentials: 'include', ...opts });
      if (!r.ok) throw new Error(`${r.status} ${path}`);
      return r.status === 204 ? null : r.json();
    };
    return {
      getLeaderboard: ({ productId = null, limit = 50 } = {}) => j(`/leaderboard?limit=${limit}${productId ? '&productId=' + encodeURIComponent(productId) : ''}`),
      submitScore: (entry) => j('/leaderboard', { method: 'POST', body: JSON.stringify(entry) }),
      // Saves stay local even in API mode (cheap & fast); move server-side if you want cross-device resume.
      saveGame: LocalAdapter.saveGame, loadGame: LocalAdapter.loadGame, clearGame: LocalAdapter.clearGame,
      getPlayer: LocalAdapter.getPlayer, setPlayer: LocalAdapter.setPlayer,
    };
  }

  FG.storage = cfg.storage === 'api' ? ApiAdapter(cfg.apiBase) : LocalAdapter;
  FG.storage.mode = cfg.storage;
})((globalThis.FG = globalThis.FG || {}));
