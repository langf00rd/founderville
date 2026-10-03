// Game engine: pure state + rules. No DOM. Runs in the browser and in Node
// (see tools/simulate.js), so it can later run server-side too.
(function (FG) {
  'use strict';
  const D = FG.data;
  const C = (FG.CONST = { POP: 600, START_CASH: 1500, DAILY_BURN: 15, HOURS_BUILD: 3, HOURS_MARKET: 8, MAX_DAY: 120, TRIAL_DAYS: 7, REP_UNLOCK: 3 });

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const sigmoid = (x) => 1 / (1 + Math.exp(-x));
  const product = (s) => D.PRODUCTS[s.productId];
  const feat = (s, id) => product(s).features.find((f) => f.id === id);

  // ---------- helpers on hidden truth ----------
  function isAI(s) { return !!product(s).isAI || s.build.features.some((id) => (feat(s, id) || {}).ai); }
  function fitFor(s, seg) {
    let f = product(s).fit[seg] || 0;
    for (const id of s.build.features) { const ft = feat(s, id); if (ft && ft.appeal[seg]) f += ft.appeal[seg]; }
    return clamp(f, 0, 1);
  }
  function value(s, p) { return clamp(fitFor(s, p.s) * 0.85 + 0.15 * s.quality + p.b, 0, 1); }
  function monthly(s) { return s.build.model === 'onetime' ? s.build.price / 5 : s.build.price; }
  function priceRatio(s, p) { return monthly(s) / Math.max(1, p.w); }
  function priceOK(r) { return r <= 1 ? 1 : r <= 1.4 ? 0.5 : r <= 2 ? 0.15 : 0.03; }
  function subPenalty(s, p) { return s.build.model === 'subscription' && p.d.subscriptions ? 1 - 0.5 * p.d.subscriptions : 1; }

  // ---------- text analysis ----------
  function escapeRe(x) { return x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function analyzeText(text) {
    const raw = (text || '').trim();
    const lower = raw.toLowerCase();
    const tokens = lower.match(/[a-z0-9']+/g) || [];
    const ta = { raw, lower, tokens, words: tokens.length, empty: tokens.length < 3 };
    ta.hype = hits(ta, D.HYPE_WORDS) > 0;
    ta.jargon = hits(ta, D.JARGON_WORDS) > 0;
    ta.ai = hits(ta, D.AI_WORDS) > 0;
    let emo = 0;
    try { emo = (raw.match(/\p{Extended_Pictographic}/gu) || []).length; } catch (e) { emo = 0; }
    ta.emoji = emo > 2 || /!!!/.test(raw);
    ta.cache = {};
    return ta;
  }
  function wordHit(tokens, w) {
    if (w.length <= 5) return tokens.some((t) => t === w || t === w + 's' || t === w + 'es');
    const stem = w.slice(0, Math.max(5, w.length - 3));
    return tokens.some((t) => t.startsWith(stem));
  }
  function hits(ta, list) {
    let n = 0;
    for (const w of list) {
      if (/[^a-z0-9]/.test(w)) { if (new RegExp('(^|[^a-z0-9])' + escapeRe(w)).test(ta.lower)) n++; }
      else if (wordHit(ta.tokens, w)) n++;
    }
    return n;
  }
  function cachedHits(ta, key, list) {
    if (ta.cache[key] == null) ta.cache[key] = hits(ta, list);
    return ta.cache[key];
  }
  function textScore(s, p, ta, fit) {
    if (!ta || ta.empty) return -0.25;
    const seg = D.SEGMENTS[p.s];
    const segHits = cachedHits(ta, 'v:' + p.s, seg.vocab);
    const turn = cachedHits(ta, 't:' + p.s, seg.turnoffs);
    const prodHits = cachedHits(ta, 'prod', product(s).keywords);
    const intHits = hits(ta, p.i);
    let sc = Math.min(3, segHits) * 0.12 + Math.min(2, intHits) * 0.15 + Math.min(3, prodHits) * 0.07 * (0.3 + fit);
    sc -= turn * 0.25;
    if (ta.words > 90) sc -= 0.15;
    return clamp(sc, -0.8, 0.75);
  }

  function triggersFor(s, ctx) {
    const t = {};
    const ta = ctx.ta;
    if (ctx.kind === 'ads') t.ads = 1;
    if (ctx.kind === 'outreach') t.cold = ctx.personal ? 0.35 : 1;
    if (ctx.angle === 'hype') t.hype = 1; else if (ta && ta.hype) t.hype = 0.7;
    if (ta && ta.ai) t.ai_hype = 1; else if (isAI(s) && ctx.kind !== 'referral') t.ai_hype = 0.35;
    if (ta && ta.jargon) { t.jargon = 1; t.corporate = 0.7; }
    if (ctx.angle === 'features') t.corporate = Math.max(t.corporate || 0, 0.5);
    if (ta && ta.emoji) t.emoji = 1;
    if (ctx.angle === 'discount') t.discount = 1;
    if (ctx.selfPromo) t.self_promo = 1;
    for (const c of product(s).concerns || []) if (!s.build.features.includes(c.unless)) t[c.key] = 0.6;
    return t;
  }

  const KIND = {
    organic: { bonus: 0, cap: 0.12 }, ads: { bonus: -0.15, cap: 0.07 }, outreach: { bonus: 0, cap: 0.12 },
    engage: { bonus: 0.2, cap: 0.08 }, interview: { bonus: 0.6, cap: 0.4 }, seo: { bonus: 0.3, cap: 0.3 },
    event: { bonus: 0.5, cap: 0.45 }, launch: { bonus: 0.15, cap: 0.22 }, referral: { bonus: 0.8, cap: 0.55 },
    press: { bonus: 0.3, cap: 0.25 }, waitlist: { bonus: 0.9, cap: 0.75 },
  };

  function evaluate(s, rng, p, ctx) {
    const seg = D.SEGMENTS[p.s];
    const fit = fitFor(s, p.s);
    let sc = (fit - 0.4) * 2.2;
    if (ctx.angle) sc += (seg.angles[ctx.angle] || 0) * 0.9;
    if (ctx.ta) sc += textScore(s, p, ctx.ta, fit);
    let noproof = false;
    if (ctx.angle === 'proof') {
      const pf = s.proof + s.paying * 2;
      if (pf < 1) { sc -= 0.7; noproof = true; } else sc += Math.min(0.5, 0.1 * pf);
    }
    sc += (KIND[ctx.kind] || {}).bonus || 0;
    if (ctx.personal) sc += 0.5;
    if (ctx.community) sc += Math.min(0.4, (s.rep[ctx.channel] || 0) * 0.05);
    if (s.phase === 'market') sc += (s.quality - 0.7) * 0.6;
    sc -= p.k * 0.6;
    sc -= Math.min(0.9, p.seen * 0.15);
    if (s.effects.some((e) => e.type === 'competitor')) sc -= 0.2;
    sc += ctx.extra || 0;
    const trig = [];
    const T = ctx.trig || (ctx.trig = triggersFor(s, ctx));
    for (const k in p.d) if (T[k]) { sc -= 0.75 * p.d[k] * T[k]; trig.push({ key: k, w: p.d[k] * T[k] }); }
    sc += rng.gauss() * 0.35;
    return { s: sc, trig, fit, noproof };
  }

  // ---------- stats ----------
  function bump(obj, key, field, n = 1) {
    if (!key) return;
    obj[key] = obj[key] || { reached: 0, interested: 0, signups: 0, paid: 0, annoyed: 0, spend: 0 };
    obj[key][field] += n;
  }
  function newRes() {
    return { reached: 0, newAware: 0, interested: 0, signups: 0, waitlist: 0, paid: 0, annoyed: 0, scoreSum: 0, n: 0, trig: {}, followers: 0,
      voices: { paid: [], signup: [], annoyed: [], neg: [], meh: [] } };
  }
  function voice(list, p, text, reveal, tone) {
    if (list.length >= 6) return;
    list.push({ pid: p.id, name: p.n, seg: p.s, age: p.a, look: p.look, text, reveal: reveal || null, tone: tone || 'neu' });
  }

  // ---------- core exposure ----------
  function expose(s, rng, p, ctx, res) {
    if (p.st === -1 || p.st === 4) return;
    res.reached++;
    bump(s.segStats, p.s, 'reached'); bump(s.chStats, ctx.channel, 'reached');
    const ev = evaluate(s, rng, p, ctx);
    res.scoreSum += ev.s; res.n++;
    p.seen++;
    if (p.st === 0) { p.st = 1; res.newAware++; }
    for (const t of ev.trig) { res.trig[t.key] = (res.trig[t.key] || 0) + 1; s.trigTotals[t.key] = (s.trigTotals[t.key] || 0) + 1; }
    if (ev.trig.length && p.st < 3) {
      const worst = ev.trig.reduce((a, b) => (b.w > a.w ? b : a));
      if (rng.chance(0.3 * worst.w)) {
        p.st = -1; p.ann = worst.key; res.annoyed++;
        bump(s.segStats, p.s, 'annoyed'); bump(s.chStats, ctx.channel, 'annoyed');
        voice(res.voices.annoyed, p, rng.pick(D.DISLIKES[worst.key].quotes), { type: 'dislike', key: worst.key }, 'bad');
        return;
      }
    }
    if (ctx.followable && ev.s > 1 && rng.chance(0.25)) res.followers++;
    if (p.st === 3) { p.b = Math.min(0.3, p.b + 0.01); return; }
    const pc = sigmoid((ev.s - 1.0) * 2.4) * (ctx.cap != null ? ctx.cap : KIND[ctx.kind].cap);
    if (rng.chance(pc)) {
      if (p.st < 2) { p.st = 2; p.src = p.src || ctx.channel; res.interested++; bump(s.segStats, p.s, 'interested'); bump(s.chStats, ctx.channel, 'interested'); }
      attemptSignup(s, rng, p, ctx, res);
    } else if (ev.trig.length) {
      const k = ev.trig[0].key; voice(res.voices.neg, p, rng.pick(D.DISLIKES[k].quotes), { type: 'dislike', key: k }, 'bad');
    } else if (ev.noproof) voice(res.voices.neg, p, rng.pick(D.VOICES.noproof), { type: 'noproof' }, 'bad');
    else if (ev.fit < 0.3) voice(res.voices.meh, p, rng.pick(D.VOICES.lowfit), { type: 'lowfit' }, 'neu');
    else if (p.seen > 4) voice(res.voices.meh, p, rng.pick(D.VOICES.fatigue), { type: 'fatigue' }, 'neu');
    else voice(res.voices.meh, p, rng.pick(D.VOICES.meh), null, 'neu');
  }

  function attemptSignup(s, rng, p, ctx, res) {
    const b = s.build;
    if (s.phase === 'build') {
      if (!p.wl) { p.wl = true; res.waitlist++; s.waitlist++; voice(res.voices.signup, p, rng.pick(D.VOICES.waitlist), null, 'good'); }
      return;
    }
    const val = value(s, p);
    const r = priceRatio(s, p);
    let f = 0.38 * (0.4 + val * 0.8);
    if (b.onboarding === 'account') f *= p.d.long_onboarding ? 0.45 : 0.8;
    f *= subPenalty(s, p);
    if (b.model === 'freemium') f *= 1.3;
    const shocked = b.model !== 'freemium' && r > 1.6;
    if (shocked) f *= 0.35;
    if (ctx.kind === 'referral' || ctx.kind === 'waitlist') f *= 1.4;

    if (b.trial === 'none' && b.model !== 'freemium') {
      const pp = 0.12 * val * val * (0.5 + s.quality * 0.6) * priceOK(r) * subPenalty(s, p) * (ctx.kind === 'referral' ? 1.5 : 1);
      if (rng.chance(pp)) { convert(s, p, res, ctx.channel, 'bought right away'); return; }
      if (r > 1) voice(res.voices.neg, p, priceQuote(s, p, rng), { type: 'wtp', value: p.w }, 'bad');
      else voice(res.voices.meh, p, 'No free trial? I\'m not paying for something I haven\'t tried.', { type: 'notrial' }, 'neu');
      return;
    }
    if (rng.chance(f)) {
      p.st = 3; p.td = 0; p.tr = 1;
      res.signups++; bump(s.segStats, p.s, 'signups'); bump(s.chStats, ctx.channel, 'signups');
      voice(res.voices.signup, p, rng.pick(b.model === 'freemium' ? D.VOICES.free : D.VOICES.signup), null, 'good');
    } else if (shocked) voice(res.voices.neg, p, priceQuote(s, p, rng), { type: 'wtp', value: p.w }, 'bad');
    else if (b.onboarding === 'account' && p.d.long_onboarding) voice(res.voices.neg, p, D.VOICES.account[0], { type: 'dislike', key: 'long_onboarding' }, 'bad');
    else voice(res.voices.meh, p, rng.pick(D.VOICES.bounce), null, 'neu');
  }

  function priceQuote(s, p, rng) {
    const unit = D.MODELS[s.build.model].unit;
    const fair = s.build.model === 'onetime' ? p.w * 5 : p.w;
    return rng.pick([`$${s.build.price}${unit}? I was thinking more like $${fair}.`, `Saw the price and left. Maybe at $${fair}...`]);
  }

  function convert(s, p, res, channel, how) {
    p.st = 4; s.paying++;
    if (res) { res.paid++; voice(res.voices.paid, p, how === 'upgraded' ? D.VOICES.paid[1] : D.VOICES.paid[0], null, 'good'); }
    bump(s.segStats, p.s, 'paid'); bump(s.chStats, p.src || channel, 'paid');
    if (!s.firstPaidDay) {
      s.firstPaidDay = s.day;
      s.firstCustomer = { pid: p.id, name: p.n, seg: p.s, age: p.a, bio: p.bio, how, channel: p.src || channel, look: p.look };
    }
  }

  // ---------- audience selection ----------
  function audience(s, rng, { channel, seg, n, boost = 4, only = false, weights = null, filter = null }) {
    const cands = s.personas.filter((p) => (!channel || p.ch.includes(channel)) && (!only || p.s === seg) && (!filter || filter(p)));
    return rng.sample(cands, n, (p) => (seg && p.s === seg ? boost : 1) * (weights ? (weights[p.s] != null ? weights[p.s] : 0.3) : 1));
  }

  // ---------- notes (what the founder has learned) ----------
  function note(s, seg) {
    return (s.notes[seg] = s.notes[seg] || { fit: null, wtp: null, channels: [], dislikes: [], likes: [], angles: [], heard: [] });
  }
  function learn(s, seg, field, val) {
    const n = note(s, seg);
    if (Array.isArray(n[field])) { if (!n[field].includes(val)) { n[field].push(val); return true; } return false; }
    if (n[field] !== val) { n[field] = val; return true; }
    return false;
  }
  function observe(s, voices) {
    const learned = [];
    for (const v of voices) {
      if (!v.reveal) continue;
      if (v.reveal.type === 'dislike' && learn(s, v.seg, 'dislikes', v.reveal.key)) learned.push(`${D.SEGMENTS[v.seg].name} dislike: ${D.DISLIKES[v.reveal.key].label}`);
      if (v.reveal.type === 'wtp') { const n = note(s, v.seg); n.heard.push(v.reveal.value); if (n.heard.length >= 2 && !n.wtp) { n.wtp = median(n.heard); learned.push(`${D.SEGMENTS[v.seg].name} would pay ~$${n.wtp}/mo`); } }
      if (v.reveal.type === 'lowfit' && !note(s, v.seg).fit) { note(s, v.seg).fit = 'weak?'; learned.push(`${D.SEGMENTS[v.seg].name} may not need this`); }
    }
    return learned;
  }
  const median = (a) => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };

  function pickVoices(res, rng) {
    const out = [];
    const take = (list, k) => { for (const v of rng.shuffle(list).slice(0, k)) if (out.length < 4) out.push(v); };
    take(res.voices.paid, 2); take(res.voices.signup, 1); take(res.voices.annoyed, 1); take(res.voices.neg, 2);
    take(res.voices.signup, 2); take(res.voices.meh, 2); take(res.voices.annoyed, 2); take(res.voices.neg, 2);
    return out;
  }

  function reaction(res) {
    if (!res.n) return 'No one';
    const a = res.scoreSum / res.n;
    return a > 1.2 ? 'Loved it' : a > 0.6 ? 'Mixed' : a > 0 ? 'Lukewarm' : 'Cold';
  }

  function card(s, rng, res, meta) {
    const voices = res ? pickVoices(res, rng) : [];
    const learned = observe(s, voices).concat(meta.learned || []);
    const c = { day: s.day, type: meta.type, place: meta.place || null, title: meta.title, body: meta.body || '', lines: meta.lines || [],
      metrics: res ? { reached: res.reached, newAware: res.newAware, interested: res.interested, signups: res.signups, waitlist: res.waitlist, paid: res.paid, annoyed: res.annoyed, reaction: reaction(res) } : null,
      voices, learned, tone: meta.tone || (res && res.paid ? 'win' : res && res.annoyed > res.interested ? 'bad' : 'neu') };
    s.feed.unshift(c);
    if (s.feed.length > 150) s.feed.length = 150;
    return c;
  }

  // ---------- actions ----------
  const ACTIONS = {
    post: {
      name: 'Post', verb: 'Post', hours: (s, a) => D.CHANNELS[a.channel].hours,
      run(s, rng, a) {
        const ch = D.CHANNELS[a.channel];
        const ta = analyzeText(a.text);
        const rep = s.rep[a.channel] || 0;
        let reach = (ch.organic + (s.followers[a.channel] || 0) * 0.6 + rep * 1.5) * rng.range(0.7, 1.3);
        if (s.effects.some((e) => e.type === 'algo' && e.channel === a.channel)) reach *= 0.5;
        let removed = false, selfPromo = false;
        if (ch.community && rep < C.REP_UNLOCK && a.angle !== 'education') {
          selfPromo = true;
          if (rng.chance(a.angle === 'story' ? 0.35 : 0.55)) { removed = true; reach *= 0.15; }
        }
        const ctx = { kind: 'organic', channel: a.channel, angle: a.angle, ta, community: ch.community, selfPromo, followable: true };
        const res = newRes();
        for (const p of audience(s, rng, { channel: a.channel, seg: a.seg, n: reach })) expose(s, rng, p, ctx, res);
        let viral = false;
        if (!removed && res.n && res.scoreSum / res.n > 0.9 && rng.chance(ch.viral * 3)) {
          viral = true;
          for (const p of audience(s, rng, { channel: a.channel, seg: a.seg, n: reach * rng.range(2, 4), boost: 2 })) expose(s, rng, p, ctx, res);
        }
        s.followers[a.channel] = (s.followers[a.channel] || 0) + res.followers;
        const lines = [];
        if (removed) lines.push(`A moderator removed your post: you have no history in this community. Build reputation first (Hang out).`);
        else if (selfPromo) lines.push('Some regulars side-eyed your promo. You have little reputation here yet.');
        if (viral) lines.push('It took off! People are sharing it.');
        if (res.followers) lines.push(`+${res.followers} followers on ${ch.name}.`);
        return card(s, rng, res, { type: 'post', place: a.channel, title: `${viral ? 'Viral post' : 'Posted'} on ${ch.name}`, lines });
      },
    },
    engage: {
      name: 'Hang out', verb: 'Hang out', hours: () => 2,
      run(s, rng, a) {
        const ch = D.CHANNELS[a.channel];
        s.rep[a.channel] = Math.min(10, (s.rep[a.channel] || 0) + 2);
        const gained = rng.int(1, 3);
        s.followers[a.channel] = (s.followers[a.channel] || 0) + gained;
        const res = newRes();
        const ctx = { kind: 'engage', channel: a.channel, angle: 'education', ta: null };
        for (const p of audience(s, rng, { channel: a.channel, n: 4 })) expose(s, rng, p, ctx, res);
        const r = s.rep[a.channel];
        return card(s, rng, res, { type: 'engage', place: a.channel, title: `Helped people on ${ch.name}`,
          lines: [`You answered questions and joined conversations. Reputation ${r}/10${ch.community && r >= C.REP_UNLOCK ? ' (promo now tolerated)' : ''}. +${gained} followers.`] });
      },
    },
    ads: {
      name: 'Run ads', verb: 'Buy ads', hours: () => 1, cash: (s, a) => +a.budget,
      run(s, rng, a) {
        const ch = D.CHANNELS[a.channel];
        const ta = analyzeText(a.text);
        const budget = +a.budget;
        s.cash -= budget; s.spent.ads += budget; bump(s.chStats, a.channel, 'spend', budget);
        const n = budget * ch.adRate * rng.range(0.8, 1.2);
        const ctx = { kind: 'ads', channel: a.channel, angle: a.angle, ta };
        const res = newRes();
        for (const p of audience(s, rng, { channel: a.channel, seg: a.seg, n, boost: 12 })) expose(s, rng, p, ctx, res);
        const cps = res.signups + res.waitlist ? `$${Math.round(budget / (res.signups + res.waitlist + res.paid))} per signup` : 'no signups';
        return card(s, rng, res, { type: 'ads', place: 'adagency', title: `$${budget} of ads on ${ch.name}`, lines: [`Result: ${cps}.`] });
      },
    },
    outreach: {
      name: 'Outreach', verb: 'Send', hours: (s, a) => (a.style === 'personal' ? 4 : 2),
      run(s, rng, a) {
        const ch = D.CHANNELS[a.channel];
        const ta = analyzeText(a.text);
        const personal = a.style === 'personal';
        const n = personal ? 5 : 25;
        const ctx = { kind: 'outreach', channel: a.channel, angle: a.angle, ta, personal, cap: personal ? 0.35 : 0.08 };
        const res = newRes();
        const list = audience(s, rng, { channel: a.channel, seg: a.seg, n, only: true, filter: (p) => p.st >= 0 && p.st <= 2 });
        for (const p of list) expose(s, rng, p, ctx, res);
        const lines = [];
        if (list.length < n) lines.push(`You could only find ${list.length} ${D.SEGMENTS[a.seg].name.toLowerCase()} to message on ${ch.name}.`);
        return card(s, rng, res, { type: 'outreach', place: 'postoffice', title: `${personal ? 'Hand-written' : 'Template'} messages to ${n} ${D.SEGMENTS[a.seg].name} via ${ch.name}`, lines });
      },
    },
    interview: {
      name: 'Interview', verb: 'Interview', hours: () => 3,
      run(s, rng, a) {
        const seg = D.SEGMENTS[a.seg];
        const k = (s.interviews[a.seg] = (s.interviews[a.seg] || 0) + 1);
        const n = note(s, a.seg);
        const lines = [], learned = [];
        const fit = fitFor(s, a.seg);
        const topCh = Object.entries(seg.channels).sort((x, y) => y[1] - x[1]).map((e) => e[0]);
        const dl = Object.entries(seg.dislikes).sort((x, y) => y[1] - x[1]).map((e) => e[0]);
        const ppl = s.personas.filter((p) => p.s === a.seg);
        const wtp = median(ppl.map((p) => p.w));
        const vocabCount = {};
        ppl.forEach((p) => p.i.forEach((w) => (vocabCount[w] = (vocabCount[w] || 0) + 1)));
        const likes = Object.entries(vocabCount).sort((x, y) => y[1] - x[1]).map((e) => e[0]);
        const angles = Object.entries(seg.angles).sort((x, y) => y[1] - x[1]).map((e) => e[0]);
        const fitWord = fit >= 0.7 ? 'strong' : fit >= 0.4 ? 'some' : 'weak';
        if (k === 1) {
          n.fit = fitWord; learned.push(`${seg.name}: ${fitWord} need for ${product(s).name}`);
          lines.push(fit >= 0.7 ? '"Wait, does this exist already? I need it."' : fit >= 0.4 ? '"I could see myself using it... sometimes."' : '"Honestly? I don\'t really have this problem."');
          topCh.slice(0, 3).forEach((c) => learn(s, a.seg, 'channels', c));
          lines.push(`"I'm mostly on ${topCh.slice(0, 3).map((c) => D.CHANNELS[c].name).join(', ')}."`);
          dl.slice(0, 2).forEach((d) => learn(s, a.seg, 'dislikes', d));
          lines.push(`"What I can't stand: ${dl.slice(0, 2).map((d) => D.DISLIKES[d].label.toLowerCase()).join(' and ')}."`);
          learned.push(`${seg.name} hang out on ${topCh.slice(0, 3).map((c) => D.CHANNELS[c].name).join(', ')}`);
        } else if (k === 2) {
          n.wtp = wtp; learned.push(`${seg.name} would pay ~$${wtp}/mo`);
          lines.push(`"If it really worked, I'd pay maybe $${wtp} a month."`);
          likes.slice(0, 5).forEach((w) => learn(s, a.seg, 'likes', w));
          lines.push(`Words they kept using: ${likes.slice(0, 5).map((w) => '"' + w + '"').join(', ')}.`);
          angles.slice(0, 2).forEach((g) => learn(s, a.seg, 'angles', g));
          lines.push(`They respond to: ${angles.slice(0, 2).map((g) => D.ANGLES[g].name.toLowerCase()).join(', ')}. They roll their eyes at: ${D.ANGLES[angles[angles.length - 1]].name.toLowerCase()}.`);
        } else {
          dl.forEach((d) => learn(s, a.seg, 'dislikes', d));
          topCh.slice(0, 5).forEach((c) => learn(s, a.seg, 'channels', c));
          lines.push(`You've heard most of it now. Full list of pet peeves: ${dl.map((d) => D.DISLIKES[d].label.toLowerCase()).join(', ')}.`);
        }
        const res = newRes();
        const ctx = { kind: 'interview', channel: 'local', angle: 'story', ta: null };
        for (const p of audience(s, rng, { seg: a.seg, n: 3, only: true, filter: (p) => p.st >= 0 && p.st < 3 })) expose(s, rng, p, ctx, res);
        return card(s, rng, res, { type: 'interview', place: 'cafe', title: `Coffee chats with 3 ${seg.name}`, lines, learned });
      },
    },
    content: {
      name: 'Write article', verb: 'Publish', hours: () => 4,
      run(s, rng, a) {
        const ta = analyzeText(a.text);
        const seg = D.SEGMENTS[a.seg];
        const h = ta.empty ? 0 : hits(ta, seg.vocab) + hits(ta, product(s).keywords);
        const power = ta.empty ? 0.3 : 0.6 + Math.min(3, h) * 0.5;
        s.content.push({ day: s.day, seg: a.seg, power, title: ta.raw.slice(0, 80) });
        return card(s, rng, null, { type: 'content', place: 'library', title: `Published: "${ta.raw.slice(0, 60) || 'Untitled post'}"`,
          lines: [`Search traffic starts trickling in after ~3 days and grows over time.`, h >= 2 ? 'It uses words your audience actually searches for.' : 'Hmm, few words your audience would search for. Might not rank.'] , tone: 'neu' });
      },
    },
    event: {
      name: 'Host meetup', verb: 'Host', hours: () => 5, cash: () => 40,
      run(s, rng, a) {
        s.cash -= 40; s.spent.events += 40;
        const res = newRes();
        const ctx = { kind: 'event', channel: 'local', angle: a.angle || 'story', ta: analyzeText(a.text) };
        for (const p of audience(s, rng, { channel: 'local', seg: a.seg, n: rng.int(8, 14), boost: 5 })) expose(s, rng, p, ctx, res);
        return card(s, rng, res, { type: 'event', place: 'square', title: `Hosted a small meetup in town`, lines: ['Snacks: $40. Face-to-face trust: priceless.'] });
      },
    },
    launch_ph: {
      name: 'Launch on Product Hunt', verb: 'Launch', hours: () => 4, once: true, market: true,
      run(s, rng, a) {
        const totalF = Object.values(s.followers).reduce((x, y) => x + y, 0);
        const n = 35 + totalF * 0.3 + s.proof * 3;
        const ctx = { kind: 'launch', channel: 'producthunt', angle: a.angle, ta: analyzeText(a.text), extra: (s.quality - 0.7) * 1.2 + Math.min(0.4, totalF * 0.01) };
        const res = newRes();
        const W = { developers: 3, creators: 2, freelancers: 2, professionals: 1.5, students: 1 };
        for (const p of audience(s, rng, { n, weights: W })) expose(s, rng, p, ctx, res);
        const avg = res.n ? res.scoreSum / res.n : 0;
        const rank = avg > 1.1 ? '#2 Product of the Day' : avg > 0.7 ? '#7 of the day' : avg > 0.3 ? '#19 of the day' : '#43 of the day';
        return card(s, rng, res, { type: 'launch', place: 'launchpad', title: `Launched on Product Hunt: ${rank}`, lines: [totalF < 20 ? 'Launches go better when you already have followers to rally.' : 'Your followers showed up to support you.'] });
      },
    },
    launch_hn: {
      name: 'Show HN', verb: 'Submit', hours: () => 2, once: true, market: true,
      run(s, rng, a) {
        const ta = analyzeText(a.text);
        const front = rng.chance(0.15 + fitFor(s, 'developers') * 0.25 + (ta.hype ? -0.1 : 0) + ((s.rep.hackernews || 0) >= C.REP_UNLOCK ? 0.1 : 0));
        const ctx = { kind: 'launch', channel: 'hackernews', angle: a.angle, ta };
        const res = newRes();
        const W = { developers: 5, freelancers: 1.5 };
        for (const p of audience(s, rng, { channel: 'hackernews', n: front ? 70 : 8, weights: W })) expose(s, rng, p, ctx, res);
        return card(s, rng, res, { type: 'launch', place: 'hackernews', title: front ? 'Show HN hit the front page!' : 'Show HN sank without a trace', lines: [front ? 'Brace for brutal comments.' : '3 upvotes. One was you.'] });
      },
    },
    onboard: {
      name: 'Onboard trial users', verb: 'Onboard', hours: () => 2, market: true,
      run(s, rng) {
        const users = s.personas.filter((p) => p.st === 3).slice(0, 6);
        const res = newRes();
        for (const p of users) {
          p.b = Math.min(0.3, p.b + 0.12);
          const r = priceRatio(s, p);
          if (r > 1) voice(res.voices.neg, p, `I like it. But $${s.build.price}${D.MODELS[s.build.model].unit} is steep for me. ~$${s.build.model === 'onetime' ? p.w * 5 : p.w} feels fair.`, { type: 'wtp', value: p.w }, 'bad');
          else if (value(s, p) < 0.5) voice(res.voices.meh, p, "It's fine, but I don't really need it every day.", { type: 'lowfit' }, 'neu');
          else voice(res.voices.signup, p, rng.pick(['Thanks for the call! This makes much more sense now.', 'Love that the founder actually talked to me.', 'Okay, the setup tip fixed my problem.']), null, 'good');
        }
        return card(s, rng, res, { type: 'onboard', place: 'garage', title: `Personally onboarded ${users.length} trial user${users.length === 1 ? '' : 's'}`, lines: ['Doing things that don\'t scale: they\'re now more likely to stick and pay.'], tone: 'neu' });
      },
      can: (s) => s.personas.some((p) => p.st === 3) || 'No trial users yet.',
    },
    referral: {
      name: 'Ask for referrals', verb: 'Ask', hours: () => 1, market: true,
      run(s, rng) {
        const happy = s.personas.filter((p) => (p.st === 3 || p.st === 4) && value(s, p) >= 0.55);
        const res = newRes();
        let testimonials = 0;
        for (const p of happy) {
          if (rng.chance(0.45)) { s.proof++; testimonials++; }
          if (rng.chance(0.5)) for (const f of audience(s, rng, { seg: p.s, n: rng.int(1, 2), only: true, filter: (x) => x.st >= 0 && x.st < 3 })) expose(s, rng, f, { kind: 'referral', channel: 'referral', angle: 'proof', ta: null }, res);
        }
        return card(s, rng, res, { type: 'referral', place: 'garage', title: happy.length ? `Asked ${happy.length} happy user${happy.length === 1 ? '' : 's'} for help` : 'Nobody is happy enough to vouch for you yet',
          lines: [`+${testimonials} testimonial${testimonials === 1 ? '' : 's'} (social proof: ${s.proof}).`] });
      },
      can: (s) => s.personas.some((p) => p.st === 3 || p.st === 4) || 'You need users first.',
    },
    improve: {
      name: 'Improve product', verb: 'Build', hours: () => 4, market: true,
      run(s, rng) {
        s.quality = Math.min(0.95, s.quality + 0.04);
        s.bugs = Math.max(0.02, s.bugs - 0.05);
        return card(s, rng, null, { type: 'improve', place: 'garage', title: 'Shipped fixes & polish', lines: [`Quality ${Math.round(s.quality * 100)}%, bug rate ${Math.round(s.bugs * 100)}%.`], tone: 'neu' });
      },
    },
    pricing: {
      name: 'Change pricing', verb: 'Save', hours: (s, a) => 1 + (a.onboarding === 'instant' && s.build.onboarding !== 'instant' ? 3 : 0),
      run(s, rng, a) {
        const before = `${D.MODELS[s.build.model].name} $${s.build.price}`;
        Object.assign(s.build, { model: a.model, price: Math.max(1, Math.round(+a.price)), trial: a.trial, onboarding: a.onboarding });
        return card(s, rng, null, { type: 'pricing', place: 'garage', title: 'Updated pricing & onboarding',
          lines: [`${before} → ${D.MODELS[s.build.model].name} $${s.build.price}. Trial: ${s.build.trial === 'trial7' ? '7 days' : 'none'}. Signup: ${s.build.onboarding === 'instant' ? 'try first' : 'account first'}.`], tone: 'neu' });
      },
    },
  };

  function canDo(s, id, a = {}) {
    const A = ACTIONS[id];
    if (!A) return 'Unknown action';
    if (s.phase !== 'build' && s.phase !== 'market') return 'Game over';
    if (A.market && s.phase !== 'market') return 'Available after launch';
    if (A.once && s.used[id]) return 'Already done';
    const h = A.hours(s, a);
    if (h > s.hours) return `Needs ${h}h (you have ${s.hours}h)`;
    if (A.cash && A.cash(s, a) > s.cash) return 'Not enough cash';
    if (A.can) { const r = A.can(s); if (r !== true) return r; }
    return true;
  }

  function perform(s, id, a = {}) {
    const ok = canDo(s, id, a);
    if (ok !== true) return { ok: false, error: ok };
    const rng = new FG.RNG(s.seed, s.rng);
    const A = ACTIONS[id];
    s.hours -= A.hours(s, a);
    s.actionCount++;
    if (A.once) s.used[id] = true;
    const c = A.run(s, rng, a);
    s.rng = rng.state;
    checkEnd(s);
    return { ok: true, card: c };
  }

  // ---------- end of day ----------
  function endDay(s) {
    if (s.phase !== 'build' && s.phase !== 'market') return null;
    const rng = new FG.RNG(s.seed, s.rng);
    const res = newRes();
    const lines = [];

    // search traffic from articles
    let seo = 0;
    for (const c of s.content) {
      const age = s.day - c.day;
      if (age < 3) continue;
      const n = Math.round(c.power * Math.min(1.5, (age - 2) / 4) * rng.range(0.5, 1.5));
      const ctx = { kind: 'seo', channel: 'search', angle: 'education', ta: null };
      for (const p of audience(s, rng, { seg: c.seg, n, boost: 8 })) { expose(s, rng, p, ctx, res); seo++; }
    }
    if (seo) lines.push(`${seo} people found your articles via search.`);

    // trial users
    let churned = 0, converted = 0;
    if (s.phase === 'market') {
      for (const p of s.personas) {
        if (p.st !== 3) continue;
        p.td++;
        if (rng.chance(s.bugs * 0.12)) { p.st = 2; churned++; voice(res.voices.neg, p, rng.pick(D.VOICES.bug), null, 'bad'); continue; }
        const val = value(s, p), po = priceOK(priceRatio(s, p));
        if (s.build.model === 'freemium') {
          if (rng.chance(0.022 * val * val * po * (0.5 + s.quality * 0.6))) { convert(s, p, res, p.src, 'upgraded'); converted++; }
        } else if (p.td >= C.TRIAL_DAYS) {
          if (rng.chance(0.26 * val * val * (0.5 + s.quality * 0.6) * po * subPenalty(s, p) * (1 + p.b * 2))) { convert(s, p, res, p.src, 'upgraded'); converted++; }
          else { p.st = 2; churned++; voice(res.voices.neg, p, priceRatio(s, p) > 1 ? priceQuote(s, p, rng) : rng.pick(D.VOICES.trialEnd), priceRatio(s, p) > 1 ? { type: 'wtp', value: p.w } : null, 'bad'); }
        } else if (rng.chance(0.01 * val * val * po)) { convert(s, p, res, p.src, 'upgraded'); converted++; }
      }
      // word of mouth
      for (const p of s.personas) {
        if ((p.st === 4 || (p.st === 3 && value(s, p) > 0.65)) && rng.chance(0.06)) {
          for (const f of audience(s, rng, { seg: p.s, n: 1, only: true, filter: (x) => x.st >= 0 && x.st < 3 })) expose(s, rng, f, { kind: 'referral', channel: 'word of mouth', angle: 'proof', ta: null }, res);
        }
      }
    }
    if (converted) lines.push(`${converted} trial user${converted > 1 ? 's' : ''} paid!`);
    if (churned) lines.push(`${churned} trial user${churned > 1 ? 's' : ''} dropped off.`);

    // random events
    if (rng.chance(0.1)) {
      const roll = rng.next();
      const goodSegs = Object.keys(D.SEGMENTS).filter((k) => fitFor(s, k) >= 0.45);
      if (roll < 0.35 && goodSegs.length) {
        const seg = rng.pick(goodSegs);
        lines.push(`Event: a newsletter for ${D.SEGMENTS[seg].name.toLowerCase()} mentioned you!`);
        for (const p of audience(s, rng, { seg, n: 7, only: true })) expose(s, rng, p, { kind: 'press', channel: 'press', angle: 'story', ta: null }, res);
      } else if (roll < 0.55) {
        const ch = rng.pick(['x', 'instagram', 'tiktok', 'facebook', 'linkedin', 'reddit']);
        s.effects.push({ type: 'algo', channel: ch, until: s.day + 3 });
        lines.push(`Event: ${D.CHANNELS[ch].name} changed its algorithm. Organic reach halved for 3 days.`);
      } else if (roll < 0.7) {
        s.effects.push({ type: 'competitor', until: s.day + 4 });
        lines.push('Event: a well-funded competitor launched. People are a bit more skeptical for a few days.');
      } else if (roll < 0.85 && s.phase === 'market') {
        let lost = 0;
        for (const p of s.personas) if (p.st === 3 && rng.chance(0.12)) { p.st = 2; lost++; }
        lines.push(`Event: your server went down for 4 hours. ${lost} trial user${lost === 1 ? '' : 's'} gave up.`);
      } else {
        const seg = goodSegs.length ? rng.pick(goodSegs) : 'freelancers';
        lines.push('Event: a friend introduced you to someone who might need this.');
        for (const p of audience(s, rng, { seg, n: 1, only: true, filter: (x) => x.st >= 0 && x.st < 3 })) expose(s, rng, p, { kind: 'referral', channel: 'intro', angle: 'story', ta: null }, res);
      }
    }
    s.effects = s.effects.filter((e) => e.until > s.day);

    // money & build
    s.cash -= C.DAILY_BURN; s.spent.burn += C.DAILY_BURN;
    let launched = false;
    if (s.phase === 'build') {
      s.buildDone++;
      if (s.buildDone >= s.buildDays) launched = true;
    }

    s.history.push({ day: s.day, ...funnel(s), cash: s.cash });
    const dayCard = card(s, rng, res.reached || res.paid || churned ? res : null, {
      type: 'day', title: `End of day ${s.day}`, lines: lines.length ? lines : ['A quiet day.'],
      tone: converted ? 'win' : 'neu',
      body: s.phase === 'build' ? `Build progress: ${Math.min(s.buildDone, s.buildDays)}/${s.buildDays} days. ${rng.pick(D.BUILD_LOG)}` : '',
    });

    s.day++;
    s.hours = s.phase === 'build' && !launched ? C.HOURS_BUILD : C.HOURS_MARKET;
    if (launched) launch(s, rng);
    s.rng = rng.state;
    checkEnd(s);
    return dayCard;
  }

  function launch(s, rng) {
    s.phase = 'market';
    s.hours = C.HOURS_MARKET;
    const res = newRes();
    const wl = s.personas.filter((p) => p.wl && p.st >= 0 && p.st < 3);
    for (const p of wl) if (rng.chance(0.65)) attemptSignup(s, rng, p, { kind: 'waitlist', channel: p.src || 'waitlist' }, res);
    card(s, rng, res, { type: 'launch', place: 'garage', title: `${product(s).name} is LIVE!`, tone: 'win',
      lines: [wl.length ? `You emailed your waitlist of ${wl.length}. ${res.signups} signed up${res.paid ? ' and ' + res.paid + ' paid' : ''}.` : 'Nobody is waiting for it. Time to find your people.', 'You now have 8 hours a day for marketing.'] });
  }

  function checkEnd(s) {
    if (s.firstPaidDay && s.phase !== 'won') { s.phase = 'won'; return; }
    if (s.phase === 'won') return;
    if (s.cash <= 0) { s.phase = 'lost'; s.lostReason = 'You ran out of money.'; }
    else if (s.day > C.MAX_DAY) { s.phase = 'lost'; s.lostReason = `${C.MAX_DAY} days passed without a paying customer.`; }
  }

  function funnel(s) {
    const f = { aware: 0, interested: 0, trial: 0, paying: 0, annoyed: 0, waitlist: 0 };
    for (const p of s.personas) {
      if (p.st === -1) { f.annoyed++; continue; }
      if (p.st >= 1) f.aware++;
      if (p.st >= 2) f.interested++;
      if (p.st === 3) f.trial++;
      if (p.st === 4) f.paying++;
      if (p.wl && p.st < 3) f.waitlist++;
    }
    return f;
  }

  // ---------- game creation ----------
  function buildDaysFor(productId, build) {
    const pr = D.PRODUCTS[productId];
    return D.SCOPES[build.scope].days + build.features.reduce((a, id) => a + pr.features.find((f) => f.id === id).days, 0) + (build.onboarding === 'instant' ? 1 : 0);
  }

  function createGame({ founder, productId, build, seed }) {
    if (seed == null) seed = Math.floor(Math.random() * 4294967296) >>> 0;
    const rng = new FG.RNG(seed);
    const personas = FG.market.generate(rng, C.POP);
    const scope = D.SCOPES[build.scope];
    const s = {
      v: 1, id: 'g_' + seed.toString(36) + '_' + Date.now().toString(36), seed, rng: rng.state, founder, productId,
      build: { ...build, price: Math.max(1, Math.round(+build.price)) }, phase: 'build', day: 1,
      buildDays: buildDaysFor(productId, build), buildDone: 0, hours: C.HOURS_BUILD, cash: C.START_CASH,
      spent: { ads: 0, events: 0, burn: 0 }, personas, rep: {}, followers: {}, content: [], quality: scope.quality, bugs: scope.bugs,
      proof: 0, paying: 0, waitlist: 0, used: {}, notes: {}, interviews: {}, segStats: {}, chStats: {}, trigTotals: {},
      feed: [], history: [], effects: [], firstPaidDay: null, firstCustomer: null, startedAt: Date.now(), activeMs: 0, actionCount: 0,
    };
    card(s, rng, null, { type: 'system', place: 'garage', title: `Day 1: you start building ${product(s).name}`, tone: 'neu',
      lines: [`Estimated build: ${s.buildDays} days. While coding you have ${C.HOURS_BUILD}h/day to talk to people.`, 'Tip: smart founders start finding customers before the product is finished.'] });
    return s;
  }

  // ---------- post-mortem ----------
  function analyze(s) {
    const out = [];
    const f = funnel(s);
    const total = s.firstPaidDay || s.day;
    if (s.buildDays / total > 0.45) out.push(`You spent ${s.buildDays} of ${total} days building. Shipping sooner gives the market more time to respond.`);
    const fits = Object.keys(D.SEGMENTS).map((k) => [k, fitFor(s, k)]).sort((a, b) => b[1] - a[1]);
    const [best] = fits[0];
    const seen = (seg) => s.personas.filter((p) => p.s === seg && p.seen > 0).length;
    const tot = (seg) => s.personas.filter((p) => p.s === seg).length;
    const reachedBest = seen(best);
    out.push(`Your best-fit audience was ${D.SEGMENTS[best].name}. You reached ${reachedBest} of the ${tot(best)} in town${reachedBest < tot(best) / 3 ? '. That\'s not many' : ''}.`);
    const tried = s.personas.filter((p) => p.tr);
    if (tried.length >= 5) {
      const pricey = tried.filter((p) => priceRatio(s, p) > 1).length;
      if (pricey / tried.length > 0.4) out.push(`${tried.length} people tried it, but ${pricey} of them thought the price was more than it's worth to them. Check "Would pay" in your Journal.`);
    }
    const wasted = Object.keys(D.SEGMENTS).filter((k) => fitFor(s, k) < 0.3 && seen(k) > 15).map((k) => `${D.SEGMENTS[k].name} (${seen(k)})`);
    if (wasted.length) out.push(`You spent attention on people who don't need this: ${wasted.join(', ')}.`);
    const trig = Object.entries(s.trigTotals).sort((a, b) => b[1] - a[1]);
    if (trig.length) out.push(`Biggest turn-off: ${D.DISLIKES[trig[0][0]].label.toLowerCase()} (hit ${trig[0][1]} people).`);
    if (f.annoyed > 20) out.push(`${f.annoyed} people now actively ignore you. Annoyed people rarely come back.`);
    if (s.spent.ads) {
      const adSign = (s.chStats && Object.entries(s.chStats).filter(([k, v]) => v.spend > 0).reduce((a, [, v]) => a + v.signups + v.paid, 0)) || 0;
      out.push(`Ads: $${s.spent.ads} spent. ${adSign ? `About $${Math.round(s.spent.ads / adSign)} per signup` : 'Little to show for it'}.`);
    }
    if (f.aware > 0) {
      const i = f.interested / f.aware;
      if (i < 0.08) out.push(`Only ${Math.round(i * 100)}% of people who saw you got interested. Your message or audience is off.`);
    }
    const chans = Object.entries(s.chStats).filter(([, v]) => v.signups + v.paid > 0).sort((a, b) => (b[1].signups + b[1].paid) - (a[1].signups + a[1].paid));
    if (chans.length) out.push(`Best channel: ${chanName(chans[0][0])} (${chans[0][1].signups} signups).`);
    if (!Object.keys(s.interviews).length) out.push('You never interviewed anyone. Talking to users is the cheapest research there is.');
    return out;
  }
  function chanName(id) { return (D.CHANNELS[id] && D.CHANNELS[id].name) || ({ search: 'Search (articles)', referral: 'Referrals', 'word of mouth': 'Word of mouth', producthunt: 'Product Hunt', press: 'Press', intro: 'Intros', waitlist: 'Waitlist' }[id] || id); }

  function badgeFor(days) { return D.BADGES.find((b) => days <= b.max); }

  FG.engine = { createGame, perform, canDo, endDay, funnel, analyze, badgeFor, buildDaysFor, fitFor, ACTIONS, analyzeText, chanName };
})((globalThis.FG = globalThis.FG || {}));
