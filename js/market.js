// Generates the simulated townsfolk (the market). Each persona has hidden
// interests, dislikes, channels and willingness to pay.
(function (FG) {
  'use strict';
  const D = FG.data;

  function generate(rng, n) {
    const segs = Object.values(D.SEGMENTS);
    const people = [];
    let id = 0;
    for (const seg of segs) {
      const count = Math.round(n * seg.share);
      for (let i = 0; i < count; i++) {
        const ch = [];
        for (const [c, p] of Object.entries(seg.channels)) if (rng.chance(p)) ch.push(c);
        if (!ch.length) ch.push(Object.keys(seg.channels)[0]);
        const d = {};
        for (const [k, p] of Object.entries(seg.dislikes)) if (rng.chance(p)) d[k] = +rng.range(0.5, 1).toFixed(2);
        if (!Object.keys(d).length) {
          const k = rng.pick(Object.keys(seg.dislikes));
          d[k] = +rng.range(0.5, 1).toFixed(2);
        }
        people.push({
          id: id++,
          n: rng.pick(D.FIRST_NAMES) + ' ' + rng.pick(D.LAST_INITIALS) + '.',
          a: rng.int(seg.age[0], seg.age[1]),
          s: seg.id,
          bio: rng.pick(seg.bios),
          ch,
          i: rng.shuffle(seg.vocab).slice(0, 4), // personal interests
          d, // dislikes -> intensity
          w: Math.max(1, Math.round(rng.range(seg.wtp[0], seg.wtp[1]))), // monthly willingness to pay ($)
          k: +rng.range(seg.skep[0], seg.skep[1]).toFixed(2), // skepticism
          st: 0, // 0 unaware, 1 aware, 2 interested, 3 trial/free, 4 paying, -1 annoyed
          seen: 0, td: 0, wl: false, b: 0, src: null, look: rng.int(0, 5),
        });
      }
    }
    return people;
  }

  FG.market = { generate };
})((globalThis.FG = globalThis.FG || {}));
