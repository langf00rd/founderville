// Seeded, serializable RNG so every game is reproducible from its seed
// (useful later for server-side replay / anti-cheat).
(function (FG) {
  'use strict';
  class RNG {
    constructor(seed, state) {
      this.seed = seed >>> 0;
      this.state = state == null ? this.seed : state | 0;
    }
    next() {
      let a = (this.state = (this.state + 0x6d2b79f5) | 0);
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    range(a, b) { return a + (b - a) * this.next(); }
    int(a, b) { return Math.floor(this.range(a, b + 1)); }
    chance(p) { return this.next() < p; }
    pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
    gauss() {
      let u = 0, v = 0;
      while (u === 0) u = this.next();
      while (v === 0) v = this.next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(this.next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }
    // Weighted sample without replacement (Efraimidis–Spirakis)
    sample(items, n, weightFn) {
      const keyed = [];
      for (const it of items) {
        const w = weightFn ? weightFn(it) : 1;
        if (w <= 0) continue;
        keyed.push([Math.pow(this.next(), 1 / w), it]);
      }
      keyed.sort((x, y) => y[0] - x[0]);
      return keyed.slice(0, Math.max(0, Math.round(n))).map((k) => k[1]);
    }
  }
  FG.RNG = RNG;
})((globalThis.FG = globalThis.FG || {}));
