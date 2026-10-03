// Headless balance test: `node tools/simulate.js`
// Plays many games with scripted bots of different skill to check difficulty.
require('../js/rng.js'); require('../js/data.js'); require('../js/market.js'); require('../js/engine.js');
const FG = globalThis.FG, D = FG.data, E = FG.engine;

function bestSeg(pid) { return Object.entries(D.PRODUCTS[pid].fit).sort((a, b) => b[1] - a[1])[0][0]; }

const bots = {
  smart(pid, seed) {
    const pr = D.PRODUCTS[pid], seg = bestSeg(pid), S = D.SEGMENTS[seg];
    const feats = pr.features.filter((f) => !f.ai).sort((a, b) => (b.appeal[seg] || 0) - (a.appeal[seg] || 0)).slice(0, 1).map((f) => f.id);
    const s = E.createGame({ founder: 'bot', productId: pid, seed, build: { scope: 'mvp', features: feats, model: 'subscription', price: Math.max(2, Math.round((S.wtp[0] + S.wtp[1]) / 2 * 0.7)), trial: 'trial7', onboarding: 'instant' } });
    const chans = Object.entries(S.channels).filter(([c]) => !D.CHANNELS[c].nopost).sort((a, b) => b[1] - a[1]).map((e) => e[0]);
    const angle = Object.entries(S.angles).sort((a, b) => b[1] - a[1])[0][0];
    const text = `Struggling with ${S.vocab.slice(0, 4).join(', ')}? I built ${pr.name} for this: ${pr.keywords.slice(0, 4).join(' ')}. Would love feedback.`;
    while (s.phase === 'build' || s.phase === 'market') {
      const tryDo = (id, a) => E.perform(s, id, a).ok;
      if ((s.interviews[seg] || 0) < 2) tryDo('interview', { seg });
      for (const c of chans.slice(0, 2)) if (D.CHANNELS[c].community && (s.rep[c] || 0) < 3) tryDo('engage', { channel: c });
      if (s.phase === 'market') {
        if (s.personas.some((p) => p.st === 3)) tryDo('onboard', {});
        if (!s.content.length) tryDo('content', { seg, text });
        tryDo('outreach', { channel: Object.keys(S.channels).find((c) => D.CHANNELS[c].outreach), seg, style: 'personal', angle: 'pain', text });
      }
      for (const c of chans.slice(0, 3)) tryDo('post', { channel: c, seg, angle, text });
      if (s.phase === 'build' || s.phase === 'market') E.endDay(s);
    }
    return s;
  },
  average(pid, seed) {
    const pr = D.PRODUCTS[pid], seg = bestSeg(pid);
    const s = E.createGame({ founder: 'bot', productId: pid, seed, build: { scope: 'v1', features: pr.features.slice(0, 2).map((f) => f.id), model: 'subscription', price: 12, trial: 'trial7', onboarding: 'account' } });
    const chans = ['x', 'linkedin', 'instagram', 'reddit', 'facebook'];
    let i = 0;
    while (s.phase === 'build' || s.phase === 'market') {
      const c = chans[i++ % chans.length];
      E.perform(s, 'post', { channel: c, seg: i % 2 ? seg : '', angle: 'features', text: pr.tagline });
      if (s.phase === 'market') { E.perform(s, 'post', { channel: chans[(i + 2) % 5], seg, angle: 'pain', text: pr.tagline }); if (s.day % 5 === 0 && s.cash > 400) E.perform(s, 'ads', { channel: 'instagram', seg, angle: 'features', text: pr.tagline, budget: 100 }); }
      E.endDay(s);
    }
    return s;
  },
  naive(pid, seed) {
    const pr = D.PRODUCTS[pid];
    const s = E.createGame({ founder: 'bot', productId: pid, seed, build: { scope: 'polished', features: pr.features.slice(0, 3).map((f) => f.id), model: 'subscription', price: 25, trial: 'none', onboarding: 'account' } });
    while (s.phase === 'build' || s.phase === 'market') {
      if (s.phase === 'market' && s.cash > 300) E.perform(s, 'ads', { channel: 'linkedin', seg: '', angle: 'hype', text: 'The revolutionary AI-powered app!!! 🚀🚀🚀', budget: 200 });
      E.perform(s, 'post', { channel: 'reddit', seg: '', angle: 'hype', text: '' });
      E.endDay(s);
    }
    return s;
  },
};

const N = +process.argv[2] || 20;
for (const [name, bot] of Object.entries(bots)) {
  const rows = [];
  for (const pid of Object.keys(D.PRODUCTS)) {
    const days = [];
    let fails = 0;
    for (let k = 0; k < N; k++) {
      const s = bot(pid, 1000 + k);
      if (s.phase === 'won') days.push(s.firstPaidDay); else fails++;
    }
    days.sort((a, b) => a - b);
    rows.push(`${pid.padEnd(11)} win ${String(N - fails).padStart(3)}/${N}  median ${days.length ? days[Math.floor(days.length / 2)] : '-'}  best ${days[0] || '-'}`);
  }
  console.log(`\n== ${name} ==\n` + rows.join('\n'));
}
