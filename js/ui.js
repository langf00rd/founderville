// UI layer: screens, HUD, dialogs. Talks to FG.engine and FG.storage only.
(function (FG) {
  'use strict';
  const D = FG.data, E = FG.engine, S = FG.storage, X = FG.px, C = FG.CONST;
  const app = document.getElementById('app');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString();
  const fmtTime = (ms) => { const t = Math.floor(ms / 1000), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
  const segName = (k) => (D.SEGMENTS[k] ? D.SEGMENTS[k].name : 'Anyone');
  const PI = (id) => D.PRODUCTS[id];

  const ui = { screen: 'title', game: null, saved: null, player: { name: '' }, draft: null, modal: null, action: null, form: {}, result: null, tab: 'log', lbProduct: '', lb: [], end: null, town: null, shell: false, auth: 'loading', authErr: '', authBusy: false };

  // ---------------- boot ----------------
  async function boot() {
    const cb = await S.ready();
    if (cb && cb.error) ui.authErr = cb.error;
    const u = S.user();
    if (S.authRequired) {
      ui.auth = u ? 'in' : 'out';
      if (!u && FG.supabase.isFileProtocol()) ui.authErr = 'Sign-in needs a web address. Serve the folder (npx serve .) instead of opening the file directly.';
    } else {
      ui.auth = 'in';
    }
    ui.player = await S.getPlayer();
    ui.saved = await S.loadGame();
    if (ui.saved && ui.saved.v !== 1) ui.saved = null;
    bind();
    render();
    setInterval(tickTimer, 1000);
    document.addEventListener('visibilitychange', () => { ui.lastTick = Date.now(); });
    FG.supabase.onSessionChange(async (s) => {
      ui.auth = s ? 'in' : 'out';
      if (s) {
        ui.authErr = '';
        ui.player = await S.getPlayer();
        ui.saved = await S.loadGame();
        if (ui.saved && ui.saved.v !== 1) ui.saved = null;
      } else {
        ui.player = { name: '' };
        ui.saved = null;
        ui.game = null;
      }
      render();
    });
  }

  let lastSave = 0;
  function tickTimer() {
    const now = Date.now();
    const dt = now - (ui.lastTick || now);
    ui.lastTick = now;
    const g = ui.game;
    if (ui.screen !== 'game' || !g || document.hidden || (g.phase !== 'build' && g.phase !== 'market')) return;
    g.activeMs += Math.min(dt, 5000);
    const el = document.getElementById('timer');
    if (el) el.textContent = fmtTime(g.activeMs);
    if (now - lastSave > 10000) { lastSave = now; S.saveGame(g); }
  }

  // ---------------- render router ----------------
  function render() {
    if (ui.screen !== 'game') {
      if (ui.town) { ui.town.destroy(); ui.town = null; }
      ui.shell = false;
      const screen = S.authRequired && ui.auth !== 'in' && ui.screen !== 'signin' && ui.screen !== 'leaderboard' && ui.screen !== 'end' ? 'signin' : ui.screen;
      app.innerHTML = ({ title: titleScreen, product: productScreen, plan: planScreen, end: endScreen, leaderboard: lbScreen, signin: signInScreen })[screen]() + modalHTML();
      if (screen === 'title' || screen === 'signin') drawTitleArt();
      if (ui.screen === 'end') drawMedal();
      return;
    }
    if (!ui.shell) {
      app.innerHTML = `<div class="screen game">
        <header id="hud" class="hud panel"></header>
        <div id="banner"></div>
        <main class="game-main">
          <section class="map-wrap panel"><div id="town"></div>
            <div class="legend">${X.icon('star', '#73eff7')} interested ${X.icon('hourglass', '#a7f070')} trying it ${X.icon('coin', '#ffcd75')} paying ${X.icon('angry', '#b13e53')} annoyed <span class="muted">· click a building to act</span></div>
          </section>
          <aside id="side" class="side panel"></aside>
        </main>
        <div id="modal-root"></div>
        <div id="fade" class="fade"></div>
      </div>`;
      ui.town = FG.town.mount(document.getElementById('town'), { onPick: openPlace });
      ui.town.refresh(ui.game);
      ui.shell = true;
    }
    renderHud(); renderSide(); renderModal();
  }

  // ---------------- title ----------------
  function accountBar() {
    const u = S.user();
    if (!u) return '';
    const meta = u.user_metadata || {};
    const pic = meta.picture || meta.avatar_url || '';
    const label = meta.full_name || meta.name || meta.user_name || (u.email || '').split('@')[0] || 'Founder';
    const avatar = pic
      ? `<img class="avatar" src="${esc(pic)}" alt="" referrerpolicy="no-referrer">`
      : `<span class="avatar fallback">${esc(label.slice(0, 1).toUpperCase())}</span>`;
    return `<div class="account">${avatar}<span class="who"><b>${esc(label)}</b><small>Signed in</small></span>
      <button class="btn small" data-a="signout">Sign out</button></div>`;
  }

  function signInScreen() {
    if (ui.authBusy) return `<div class="screen center"><div class="panel end-card">
      <h1 class="logo">FIRST<br>CUSTOMER</h1><p class="tagline">Talking to ${esc((FG.supabase.cfg.providers || ['google'])[0])}…</p>
      <p class="muted">Finish signing in in the tab that just opened, then come back.</p></div></div>`;
    const btns = (FG.supabase.cfg.providers || []).map((p) =>
      `<button class="btn primary wide" data-a="oauth" data-pv="${esc(p)}">${p === 'google' ? 'G' : '⌨'} Continue with ${esc(p[0].toUpperCase() + p.slice(1))}</button>`).join('');
    return `<div class="screen center"><div class="panel end-card">
      <canvas id="title-art" width="120" height="56"></canvas>
      <h1 class="logo">FIRST<br>CUSTOMER</h1>
      <p class="tagline">You built it. The market is right there.<br>Can you get one person to pay?</p>
      <div class="signin">${btns}</div>
      ${ui.authErr ? `<p class="err">${esc(ui.authErr)}</p>` : ''}
      <p class="muted small">Your score and your save are tied to your account, so you can close the tab and pick up where you left off.</p>
      <div class="row center"><button class="btn small" data-a="leaderboard">Leaderboard</button><button class="btn small" data-a="help">How to play</button></div>
    </div></div>`;
  }

  function titleScreen() {
    const s = ui.saved;
    return `<div class="screen center">
      <div class="title-card panel">
        ${accountBar()}
        <canvas id="title-art" width="120" height="56"></canvas>
        <h1 class="logo">FIRST<br>CUSTOMER</h1>
        <p class="tagline">You built it. The market is right there.<br>Can you get one person to pay?</p>
        <label class="field"><span>Founder name</span><input data-p="name" maxlength="20" value="${esc(ui.player.name)}" placeholder="Your name"></label>
        <div class="menu">
          <button class="btn primary" data-a="new">▶ New game</button>
          ${s ? `<button class="btn" data-a="continue">Continue: ${esc(PI(s.productId).name)}, day ${s.day}</button>` : ''}
          <button class="btn" data-a="leaderboard">Leaderboard</button>
          <button class="btn" data-a="help">How to play</button>
        </div>
      </div>
    </div>`;
  }
  function drawTitleArt() {
    const c = document.getElementById('title-art');
    if (!c) return;
    const x = c.getContext('2d');
    x.fillStyle = '#5ba65b'; x.fillRect(0, 0, 120, 56);
    x.fillStyle = '#d9c49a'; x.fillRect(0, 46, 120, 10);
    X.drawBuilding(x, D.PLACES[0], 8, 6, 44, 40);
    X.drawTree(x, 98, 26);
    X.drawPerson(x, 60, 36, { skin: '#a0662f', hair: '#1a1c2c', style: 3, shirt: '#ffcd75', pants: '#29366f' }, 0);
    X.drawPerson(x, 82, 36, X.look(4, '#5ec9a8'), 1);
    X.drawIcon(x, 'coin', 82, 24, '#ffcd75');
    X.drawIcon(x, 'bubble', 66, 24, '#f4f4f4');
  }

  // ---------------- product select ----------------
  function stars(n) { return '★'.repeat(n) + '☆'.repeat(3 - n); }
  function productScreen() {
    return `<div class="screen wide">
      <div class="screen-head"><button class="btn small" data-a="back-title">◀ Back</button><h2>Choose your product</h2><span></span></div>
      <p class="lead">Every product works. The question is who will pay for it, and how you reach them.</p>
      <div class="grid products">
        ${Object.values(D.PRODUCTS).map((p) => `
          <button class="panel product-card" data-a="pick-product" data-id="${p.id}">
            <div class="pc-top"><span class="icon-tile">${X.icon(p.icon, '#ffcd75')}</span><div><h3>${p.name}</h3><small>${p.category}</small></div></div>
            <p>${p.tagline}</p>
            <dl><dt>Your hunch</dt><dd>${p.hunch}</dd><dt>Market rate</dt><dd>${p.priceHint}</dd><dt>Difficulty</dt><dd class="stars">${stars(p.difficulty)}</dd></dl>
          </button>`).join('')}
      </div>
    </div>`;
  }

  // ---------------- build plan ----------------
  function planScreen() {
    const d = ui.draft, p = PI(d.productId), b = d.build;
    const days = E.buildDaysFor(d.productId, b);
    const opt = (key, val, label, sub, extra = '') => `<button class="opt ${b[key] === val ? 'on' : ''}" data-a="draft" data-k="${key}" data-v="${val}" ${extra}><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</button>`;
    return `<div class="screen wide">
      <div class="screen-head"><button class="btn small" data-a="back-product">◀ Back</button><h2>Plan ${esc(p.name)}</h2><span></span></div>
      <div class="plan">
        <section class="panel">
          <h3>1. How much do you build first?</h3>
          <div class="opts">${Object.values(D.SCOPES).map((sc) => opt('scope', sc.id, sc.name, `${sc.days} days · ${sc.desc}`)).join('')}</div>
        </section>
        <section class="panel">
          <h3>2. Features (pick up to 3)</h3>
          <div class="opts">${p.features.map((f) => `<button class="opt ${b.features.includes(f.id) ? 'on' : ''}" data-a="feature" data-id="${f.id}"><b>${f.name}</b><small>+${f.days} days</small></button>`).join('')}</div>
        </section>
        <section class="panel">
          <h3>3. Pricing</h3>
          <div class="opts">${Object.entries(D.MODELS).map(([k, m]) => opt('model', k, m.name, '')).join('')}</div>
          <label class="field inline"><span>Price ($${b.model === 'onetime' ? ' one-time' : ' per month'})</span><input type="number" min="1" max="999" data-d="price" value="${b.price}"></label>
          <p class="hint">Similar products charge ${p.priceHint}.</p>
          ${b.model === 'freemium' ? '<p class="hint">Freemium: anyone can sign up free; some upgrade later.</p>' : `<div class="opts two">${opt('trial', 'trial7', '7-day free trial', 'Pay after trying')}${opt('trial', 'none', 'No trial', 'Pay up front')}</div>`}
        </section>
        <section class="panel">
          <h3>4. Signup flow</h3>
          <div class="opts two">${opt('onboarding', 'account', 'Account first', 'Email + password before using')}${opt('onboarding', 'instant', 'Try before signup', '+1 build day')}</div>
        </section>
      </div>
      <div class="panel plan-foot">
        <div><b>Build time: ${days} days.</b> <span class="muted">Every day counts toward your score. You have ${money(C.START_CASH)} and burn ${money(C.DAILY_BURN)}/day.</span></div>
        <button class="btn primary" data-a="start">Start building ▶</button>
      </div>
    </div>`;
  }

  // ---------------- HUD ----------------
  function renderHud() {
    const g = ui.game, f = E.funnel(g), p = PI(g.productId);
    const maxH = g.phase === 'build' ? C.HOURS_BUILD : C.HOURS_MARKET;
    const pips = Array.from({ length: maxH }, (_, i) => `<i class="${i < g.hours ? 'on' : ''}"></i>`).join('');
    document.getElementById('hud').innerHTML = `
      <div class="hud-who"><span class="icon-tile sm">${X.icon(p.icon, '#ffcd75')}</span><div><b>${esc(p.name)}</b><small>${esc(g.founder)}</small></div></div>
      <div class="hud-stat"><small>DAY</small><b>${g.day}</b></div>
      <div class="hud-stat"><small>HOURS</small><span class="pips">${pips}</span></div>
      <div class="hud-stat"><small>CASH</small><b class="${g.cash < 300 ? 'warn' : ''}">${money(g.cash)}</b></div>
      <div class="hud-quest"><small>QUEST: 1 PAYING CUSTOMER</small>
        <span class="funnel">
          <span title="Aware of you">${X.icon('eye', '#94b0c2')}${f.aware}</span>
          <span title="Interested">${X.icon('star', '#73eff7')}${f.interested}</span>
          <span title="${g.phase === 'build' ? 'On waitlist' : 'Trying it'}">${X.icon('hourglass', '#a7f070')}${g.phase === 'build' ? f.waitlist : f.trial}</span>
          <span title="Paying">${X.icon('coin', '#ffcd75')}${f.paying}</span>
          <span title="Annoyed (ignore you)">${X.icon('angry', '#b13e53')}${f.annoyed}</span>
        </span></div>
      <div class="hud-stat"><small>TIME</small><b id="timer">${fmtTime(g.activeMs)}</b></div>
      <div class="hud-btns"><button class="btn primary" data-a="endday">End day ☾</button><button class="btn small" data-a="menu" aria-label="Menu">≡</button></div>`;
    document.getElementById('banner').innerHTML = g.phase === 'build'
      ? `<div class="banner panel"><span>${X.icon('wrench', '#ffcd75')} Building ${esc(p.name)}: day ${Math.min(g.buildDone + 1, g.buildDays)} of ${g.buildDays}</span><span class="bar"><i style="width:${(g.buildDone / g.buildDays) * 100}%"></i></span><span class="muted">${C.HOURS_BUILD}h/day to market while you code. Interested people join your waitlist.</span></div>`
      : '';
  }

  // ---------------- side panel ----------------
  function renderSide() {
    const g = ui.game;
    const tabs = [['log', 'Log'], ['journal', 'Journal'], ['stats', 'Stats']];
    document.getElementById('side').innerHTML = `
      <div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${ui.tab === k ? 'on' : ''}" data-a="tab" data-k="${k}">${l}</button>`).join('')}</div>
      <div class="side-body">${ui.tab === 'log' ? logView(g) : ui.tab === 'journal' ? journalView(g) : statsView(g)}</div>`;
  }

  function metricChips(m, compact) {
    if (!m) return '';
    const parts = [];
    parts.push(`<span class="chip">${m.reached} reached</span>`);
    if (m.interested) parts.push(`<span class="chip c-cyan">${m.interested} interested</span>`);
    if (m.waitlist) parts.push(`<span class="chip c-lime">${m.waitlist} waitlist</span>`);
    if (m.signups) parts.push(`<span class="chip c-lime">${m.signups} signups</span>`);
    if (m.paid) parts.push(`<span class="chip c-gold">${m.paid} paid</span>`);
    if (m.annoyed) parts.push(`<span class="chip c-red">${m.annoyed} annoyed</span>`);
    if (!compact) parts.push(`<span class="chip c-dim">vibe: ${m.reaction}</span>`);
    return `<div class="chips">${parts.join('')}</div>`;
  }
  function voiceHTML(v) {
    const seg = D.SEGMENTS[v.seg];
    return `<div class="voice t-${v.tone}"><img class="portrait" src="${X.portraitURL(v.pid, seg.color, '#333c57')}" alt=""><div><b>${esc(v.name)} <small>${v.age} · ${seg.name}</small></b><p>“${esc(v.text)}”</p></div></div>`;
  }
  function logView(g) {
    return g.feed.slice(0, 60).map((c) => `
      <article class="log-card t-${c.tone}">
        <header><span class="day">D${c.day}</span><b>${esc(c.title)}</b></header>
        ${c.body ? `<p class="muted">${esc(c.body)}</p>` : ''}
        ${c.lines.map((l) => `<p>${esc(l)}</p>`).join('')}
        ${metricChips(c.metrics, true)}
        ${c.voices.slice(0, 2).map(voiceHTML).join('')}
        ${c.learned.length ? `<p class="learned">${X.icon('book2', '#ffcd75')} ${c.learned.map(esc).join(' · ')}</p>` : ''}
      </article>`).join('') || '<p class="muted">Nothing yet.</p>';
  }
  function journalView(g) {
    return `<p class="muted small">What you've learned about the townsfolk. Fill it in by interviewing people (Cafe) and reading reactions.</p>` +
      Object.values(D.SEGMENTS).map((seg) => {
        const n = g.notes[seg.id] || {};
        const st = g.segStats[seg.id] || {};
        const q = '<span class="unk">???</span>';
        const list = (arr, fn) => (arr && arr.length ? arr.map(fn).join(', ') : q);
        return `<div class="jr">
          <h4><i class="dot" style="background:${seg.color}"></i>${seg.name} <small>${g.personas.filter((p) => p.s === seg.id).length} in town</small></h4>
          <dl>
            <dt>Need</dt><dd>${n.fit ? esc(n.fit) : q}</dd>
            <dt>Would pay</dt><dd>${n.wtp ? '~$' + n.wtp + '/mo' : q}</dd>
            <dt>Hang out on</dt><dd>${list(n.channels, (c) => D.CHANNELS[c].name)}</dd>
            <dt>Hate</dt><dd>${list(n.dislikes, (k) => D.DISLIKES[k].label)}</dd>
            <dt>Their words</dt><dd>${list(n.likes, (w) => '“' + esc(w) + '”')}</dd>
            <dt>Respond to</dt><dd>${list(n.angles, (a) => D.ANGLES[a].name)}</dd>
            <dt>Your results</dt><dd class="small">${st.reached || 0} impressions · ${st.interested || 0} interested · ${st.signups || 0} signups · ${st.paid || 0} paid · ${st.annoyed || 0} annoyed</dd>
          </dl></div>`;
      }).join('');
  }
  function statsView(g) {
    const hist = g.history.slice(-30);
    const max = Math.max(1, ...hist.map((h) => h.interested));
    const chans = Object.entries(g.chStats).sort((a, b) => b[1].reached - a[1].reached);
    return `
      <h4>Product</h4>
      <div class="kv"><span>Quality</span><b>${Math.round(g.quality * 100)}%</b><span>Bug rate</span><b>${Math.round(g.bugs * 100)}%</b><span>Social proof</span><b>${g.proof} testimonials</b><span>Price</span><b>$${g.build.price}${D.MODELS[g.build.model].unit}</b><span>Trial</span><b>${g.build.model === 'freemium' ? 'free plan' : g.build.trial === 'trial7' ? '7 days' : 'none'}</b><span>Signup</span><b>${g.build.onboarding === 'instant' ? 'try first' : 'account first'}</b></div>
      <h4>Interested people by day</h4>
      <div class="bars">${hist.map((h) => `<i title="Day ${h.day}: ${h.interested} interested, ${h.trial} trying" style="height:${(h.interested / max) * 100}%"><u style="height:${(h.trial / Math.max(1, h.interested)) * 100}%"></u></i>`).join('') || '<span class="muted small">End a day to see history.</span>'}</div>
      <h4>Channels</h4>
      <table class="tbl"><tr><th>Channel</th><th>Rep</th><th>Reach</th><th>Int.</th><th>Sign</th><th>Mad</th><th>$</th></tr>
      ${chans.map(([k, v]) => `<tr><td>${esc(E.chanName(k))}</td><td>${g.rep[k] || '-'}</td><td>${v.reached}</td><td>${v.interested}</td><td>${v.signups}</td><td>${v.annoyed}</td><td>${v.spend || ''}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">No activity yet</td></tr>'}</table>`;
  }

  // ---------------- modals ----------------
  function modalHTML() {
    const m = ui.modal;
    if (!m) return '';
    if (m.type === 'help') return dialog('How to play', 'book2', helpHTML());
    if (m.type === 'menu') return dialog('Menu', 'wrench', `<div class="menu"><button class="btn" data-a="help">How to play</button><button class="btn" data-a="save-quit">Save & quit to title</button><button class="btn danger" data-a="abandon">Abandon this run</button></div>`);
    if (m.type === 'place') return placeDialog(m.placeId);
    if (m.type === 'day') return dialog(m.card.title, 'moon', `${m.card.body ? `<p class="muted">${esc(m.card.body)}</p>` : ''}${m.card.lines.map((l) => `<p>${esc(l)}</p>`).join('')}${m.card.metrics && m.card.metrics.reached ? metricChips(m.card.metrics) : ''}${m.card.voices.map(voiceHTML).join('')}${learnedHTML(m.card)}${m.launch ? `<div class="launch-note">${m.launch.lines.map((l) => `<p>${esc(l)}</p>`).join('')}${metricChips(m.launch.metrics, true)}${m.launch.voices.map(voiceHTML).join('')}</div>` : ''}<div class="row end"><button class="btn primary" data-a="close">Day ${ui.game.day} ▶</button></div>`, m.launch ? 'Your product is LIVE!' : null);
    if (m.type === 'win') return winDialog();
    return '';
  }
  function renderModal() { const r = document.getElementById('modal-root'); if (r) r.innerHTML = modalHTML(); }
  function dialog(title, iconName, body, sub) {
    return `<div class="modal-back" data-a="backdrop"><div class="dialog panel" role="dialog" aria-label="${esc(title)}">
      <div class="dialog-head"><span class="icon-tile">${X.icon(iconName, '#ffcd75')}</span><div><h3>${esc(title)}</h3>${sub ? `<p>${esc(sub)}</p>` : ''}</div><button class="btn small" data-a="close" aria-label="Close">✕</button></div>
      <div class="dialog-body">${body}</div></div></div>`;
  }
  function learnedHTML(c) { return c.learned && c.learned.length ? `<div class="learned-box"><b>${X.icon('book2', '#ffcd75')} Journal updated</b>${c.learned.map((l) => `<p>• ${esc(l)}</p>`).join('')}</div>` : ''; }

  function helpHTML() {
    return `<div class="help">
      <p><b>Goal:</b> get your <b>first paying customer</b> in as few in-game days as possible. That's your score.</p>
      <p><b>The town is your market.</b> ${C.POP} townsfolk in 8 groups. Each has hidden needs, budgets, favourite channels and pet peeves. The product is "done"; finding who will pay is the hard part.</p>
      <p><b>Each day</b> you get ${C.HOURS_MARKET} hours (${C.HOURS_BUILD} while still building). Click buildings to spend them. End the day to see what happened. You burn ${money(C.DAILY_BURN)}/day and lose if you run out of cash or hit day ${C.MAX_DAY}.</p>
      <ul>
        <li><b>Cafe:</b> interview a group. The cheapest way to learn what they want.</li>
        <li><b>Channel buildings</b> (Forum Tavern = Reddit, etc.): post, or hang out to build reputation. Communities remove promo from strangers.</li>
        <li><b>Post Office:</b> cold outreach. Hand-written beats templates.</li>
        <li><b>Ad Agency:</b> buy reach. Not everyone likes ads.</li>
        <li><b>Library:</b> articles bring search traffic later.</li>
        <li><b>Garage:</b> fix bugs, change pricing, onboard trial users, ask for referrals.</li>
      </ul>
      <p><b>What you write matters.</b> People respond to their own words and ignore buzzwords. Read the reactions: they're your best data.</p>
      <p class="muted">Leaderboard rank = in-game days, then real play time.</p></div>`;
  }

  // ---------------- place dialog & forms ----------------
  function openPlace(id) {
    const g = ui.game;
    if (!g || (g.phase !== 'build' && g.phase !== 'market')) return;
    const place = D.PLACES.find((p) => p.id === id);
    ui.modal = { type: 'place', placeId: id };
    ui.result = null;
    ui.action = place.actions.length === 1 ? place.actions[0] : null;
    if (ui.action) initForm(place);
    if (ui.town) ui.town.moveFounder(id);
    renderModal();
  }
  function initForm(place) {
    const g = ui.game, A = ui.action;
    const keep = ui.form || {};
    const f = { seg: keep.seg || '', angle: keep.angle || 'pain', text: keep.text || '', channel: place.channel, budget: keep.budget || 100, style: keep.style || 'personal' };
    if (A === 'ads') f.channel = keep.adChannel || 'instagram';
    if (A === 'outreach') f.channel = keep.outChannel || 'email';
    if (['outreach', 'interview', 'content', 'event'].includes(A) && !f.seg) f.seg = 'students';
    if (A === 'pricing') Object.assign(f, { model: g.build.model, price: g.build.price, trial: g.build.trial, onboarding: g.build.onboarding });
    ui.form = f;
  }
  function segSelect(allowAny) {
    return `<label class="field"><span>Who are you targeting?</span><select data-f="seg">${allowAny ? `<option value="">Anyone</option>` : ''}${Object.values(D.SEGMENTS).map((s) => `<option value="${s.id}" ${ui.form.seg === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}</select></label>`;
  }
  function angleSelect(label = 'Angle') {
    return `<label class="field"><span>${label}</span><select data-f="angle">${Object.entries(D.ANGLES).map(([k, a]) => `<option value="${k}" ${ui.form.angle === k ? 'selected' : ''}>${a.name}: ${a.desc}</option>`).join('')}</select></label>`;
  }
  function textArea(ph, label = 'Your message') {
    return `<label class="field"><span>${label} <small class="muted" id="wc">${(ui.form.text.match(/\S+/g) || []).length} words</small></span><textarea data-f="text" rows="3" maxlength="400" placeholder="${esc(ph)}">${esc(ui.form.text)}</textarea></label>`;
  }
  function chanSelect(key, list) {
    return `<label class="field"><span>Channel</span><select data-f="${key}">${list.map((c) => `<option value="${c}" ${ui.form.channel === c ? 'selected' : ''}>${D.CHANNELS[c].name}</option>`).join('')}</select></label>`;
  }
  function formHTML(place) {
    const g = ui.game, A = ui.action, f = ui.form;
    const ch = f.channel && D.CHANNELS[f.channel];
    let body = '';
    if (A === 'post') {
      const rep = g.rep[f.channel] || 0;
      body = `<p class="muted">${ch.community ? `Community. Reputation ${rep}/10. ${rep < C.REP_UNLOCK ? 'Regulars may remove promo from newcomers.' : 'Regulars know you.'}` : `Followers: ${g.followers[f.channel] || 0}.`}</p>${segSelect(true)}${angleSelect()}${textArea('Who is it for? What problem does it solve? Write it like a human.')}`;
    } else if (A === 'engage') body = `<p>Spend 2h answering questions and joining conversations on ${ch.name}. No pitching. Builds reputation and followers.</p><p class="muted">Reputation now: ${g.rep[f.channel] || 0}/10</p>`;
    else if (A === 'launch_hn') body = `<p>Submit a "Show HN" post. One shot. Hacker News loves honest technical builds and hates marketing.</p>${angleSelect()}${textArea('Show HN: ...', 'Title & first comment')}`;
    else if (A === 'ads') body = `${chanSelect('adChannel', Object.values(D.CHANNELS).filter((c) => c.adRate > 0).map((c) => c.id))}${segSelect(true)}${angleSelect()}${textArea('Your ad copy', 'Ad copy')}<label class="field"><span>Budget: <b>${money(f.budget)}</b></span><input type="range" min="20" max="500" step="10" data-f="budget" value="${f.budget}"></label>`;
    else if (A === 'outreach') body = `${chanSelect('outChannel', Object.values(D.CHANNELS).filter((c) => c.outreach).map((c) => c.id))}${segSelect(false)}<div class="opts two"><button class="opt ${f.style === 'personal' ? 'on' : ''}" data-a="form" data-k="style" data-v="personal"><b>Hand-written</b><small>5 people · 4h</small></button><button class="opt ${f.style === 'template' ? 'on' : ''}" data-a="form" data-k="style" data-v="template"><b>Template blast</b><small>25 people · 2h</small></button></div>${angleSelect()}${textArea('Hi! I noticed...')}`;
    else if (A === 'interview') {
      const k = g.interviews[f.seg] || 0;
      body = `<p>Buy 3 people from a group a coffee and ask about their lives. No pitching.</p>${segSelect(false)}<p class="muted">You've interviewed ${segName(f.seg)} ${k} time${k === 1 ? '' : 's'}. ${k >= 2 ? 'Diminishing returns.' : ''}</p>`;
    } else if (A === 'content') body = `<p>Write a helpful article. It brings search visitors over the following weeks, if it uses words people actually search for.</p>${segSelect(false)}${textArea('e.g. "How I stopped chasing late invoices"', 'Title + one-line summary')}`;
    else if (A === 'event') body = `<p>Host a small demo or meetup in town ($40 snacks, 5h). Few people, lots of trust.</p>${segSelect(true)}${angleSelect('Talk style')}${textArea('What will you say?', 'Your pitch')}`;
    else if (A === 'launch_ph') body = `<p>One shot at Product Hunt. Followers and social proof help a launch take off.</p>${angleSelect()}${textArea('Tagline + first comment', 'Launch post')}`;
    else if (A === 'onboard') body = `<p>Call your trial users one by one. Help them set up and hear what they think. Doesn't scale. Works.</p><p class="muted">${g.personas.filter((p) => p.st === 3).length} trial users right now.</p>`;
    else if (A === 'referral') body = `<p>Ask happy users for a testimonial and an intro to a friend.</p>`;
    else if (A === 'improve') body = `<p>Spend 4h fixing bugs and polishing. Better quality = more trial users stay and pay.</p><p class="muted">Quality ${Math.round(g.quality * 100)}% · Bugs ${Math.round(g.bugs * 100)}%</p>`;
    else if (A === 'pricing') body = `<div class="opts">${Object.entries(D.MODELS).map(([k, m]) => `<button class="opt ${f.model === k ? 'on' : ''}" data-a="form" data-k="model" data-v="${k}"><b>${m.name}</b></button>`).join('')}</div>
      <label class="field inline"><span>Price ($)</span><input type="number" min="1" max="999" data-f="price" value="${f.price}"></label>
      ${f.model !== 'freemium' ? `<div class="opts two"><button class="opt ${f.trial === 'trial7' ? 'on' : ''}" data-a="form" data-k="trial" data-v="trial7"><b>7-day trial</b></button><button class="opt ${f.trial === 'none' ? 'on' : ''}" data-a="form" data-k="trial" data-v="none"><b>No trial</b></button></div>` : ''}
      <div class="opts two"><button class="opt ${f.onboarding === 'account' ? 'on' : ''}" data-a="form" data-k="onboarding" data-v="account"><b>Account first</b></button><button class="opt ${f.onboarding === 'instant' ? 'on' : ''}" data-a="form" data-k="onboarding" data-v="instant"><b>Try before signup</b><small>${g.build.onboarding === 'instant' ? '' : '+3h to build'}</small></button></div>`;
    const AA = E.ACTIONS[A];
    const ok = E.canDo(g, A, f);
    const cost = AA.hours(g, f) + 'h' + (AA.cash ? ', ' + money(AA.cash(g, f)) : '');
    return `<div class="form">${body}<div class="row end">${ok !== true ? `<span class="warn small">${esc(ok)}</span>` : ''}<button class="btn primary" data-a="do" ${ok !== true ? 'disabled' : ''} id="do-btn">${AA.verb} (${cost})</button></div></div>`;
  }
  function placeDialog(id) {
    const place = D.PLACES.find((p) => p.id === id);
    const g = ui.game;
    let body;
    if (ui.result) body = resultHTML(ui.result);
    else {
      const choices = place.actions.length > 1 ? `<div class="choices">${place.actions.map((a) => {
        const ok = E.canDo(g, a, a === 'post' || a === 'engage' ? { channel: place.channel } : {});
        const AA = E.ACTIONS[a];
        const h = AA.hours(g, { channel: place.channel, style: 'personal', onboarding: g.build.onboarding });
        return `<button class="choice ${ui.action === a ? 'on' : ''}" data-a="choose" data-id="${a}" ${ok !== true && ok.startsWith('Available') ? 'disabled' : ''}><span>${ui.action === a ? '▶' : '▷'} ${AA.name}</span><small>${ok === true || ok.startsWith('Needs') ? h + 'h' : esc(ok)}</small></button>`;
      }).join('')}</div>` : '';
      body = choices + (ui.action ? formHTML(place) : '<p class="muted">What do you want to do here?</p>');
    }
    return dialog(place.name, place.icon, body, place.sub);
  }
  function resultHTML(c) {
    return `<div class="result t-${c.tone}">
      <h4>${esc(c.title)}</h4>
      ${c.lines.map((l) => `<p>${esc(l)}</p>`).join('')}
      ${metricChips(c.metrics)}
      ${c.voices.map(voiceHTML).join('')}
      ${learnedHTML(c)}
      <div class="row end"><button class="btn" data-a="again">Do something else here</button><button class="btn primary" data-a="close">OK</button></div></div>`;
  }

  function winDialog() {
    const g = ui.game, fc = g.firstCustomer, seg = D.SEGMENTS[fc.seg];
    return `<div class="modal-back"><div class="dialog panel win" role="dialog">
      <div class="win-flash">A WILD CUSTOMER APPEARED!</div>
      <img class="portrait xl" src="${X.portraitURL(fc.pid, seg.color, '#29366f')}" alt="">
      <h3>${esc(fc.name)} paid for ${esc(PI(g.productId).name)}!</h3>
      <p class="muted">${fc.age} · ${seg.name} · ${esc(fc.bio)}</p>
      <p>Found you via <b>${esc(E.chanName(fc.channel))}</b> on day <b>${g.firstPaidDay}</b>.</p>
      <div class="row center"><button class="btn primary" data-a="claim">Claim your award ▶</button></div></div></div>`;
  }

  // ---------------- end screens ----------------
  function endScreen() {
    const { state: g, entry, rank, total } = ui.end;
    const won = g.phase === 'won';
    const f = E.funnel(g);
    const pm = E.analyze(g);
    if (!won) return `<div class="screen center"><div class="panel end-card">
      <h1 class="logo red">GAME OVER</h1><p>${esc(g.lostReason || '')}</p>
      <div class="stats-grid"><div><small>Days</small><b>${g.day - 1}</b></div><div><small>Aware</small><b>${f.aware}</b></div><div><small>Tried it</small><b>${Object.values(g.segStats).reduce((a, s) => a + s.signups, 0)}</b></div><div><small>Annoyed</small><b>${f.annoyed}</b></div></div>
      <h3>What happened</h3><ul class="pm">${pm.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      <p class="muted">Welcome to marketing. Most real products die exactly like this: not because they're bad, but because nobody hears about them the right way.</p>
      <div class="row center"><button class="btn primary" data-a="new">Try again</button><button class="btn" data-a="leaderboard">Leaderboard</button><button class="btn" data-a="back-title">Title</button></div></div></div>`;
    const badge = E.badgeFor(entry.days);
    const fc = g.firstCustomer;
    return `<div class="screen center"><div class="panel end-card">
      <canvas id="medal" width="32" height="40" data-color="${badge.color}"></canvas>
      <p class="award-label">AWARD UNLOCKED</p>
      <h1 class="logo gold">${esc(badge.name)}</h1>
      <p>${esc(entry.founder)} got the first paying customer for <b>${esc(entry.productName)}</b> in <b>${entry.days} days</b>.</p>
      <div class="stats-grid"><div><small>Days</small><b>${entry.days}</b></div><div><small>Play time</small><b>${fmtTime(entry.realMs)}</b></div><div><small>Rank</small><b>#${rank}${total ? ' / ' + total : ''}</b></div><div><small>Ad spend</small><b>${money(entry.adSpend)}</b></div></div>
      <p class="muted">First customer: ${esc(fc.name)}, ${fc.age}, ${D.SEGMENTS[fc.seg].name}. Came from ${esc(E.chanName(fc.channel))}.</p>
      <h3>Debrief</h3><ul class="pm">${pm.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      <p class="muted small">Badges: ${D.BADGES.map((b) => `${b.name} (${b.max === Infinity ? 'any' : '≤' + b.max + 'd'})`).join(' · ')}</p>
      <div class="row center"><button class="btn primary" data-a="new">Play again</button><button class="btn" data-a="leaderboard">Leaderboard</button></div></div></div>`;
  }
  function drawMedal() {
    const c = document.getElementById('medal');
    if (!c) return;
    const x = c.getContext('2d'), col = c.dataset.color;
    const r = (cl, a, b, w, h) => { x.fillStyle = cl; x.fillRect(a, b, w, h); };
    r('#b13e53', 8, 0, 6, 14); r('#3b5dc9', 18, 0, 6, 14); r('#1a1c2c', 9, 12, 14, 2);
    r('#1a1c2c', 7, 14, 18, 22); r('#1a1c2c', 5, 16, 22, 18);
    r(col, 8, 15, 16, 20); r(col, 6, 17, 20, 16);
    r(X.shade(col, 40), 8, 16, 6, 3);
    X.drawIcon(x, 'star', 12, 21, '#1a1c2c');
  }

  function lbScreen() {
    const rows = ui.lb;
    const hi = ui.end && ui.end.entry && ui.end.entry.id;
    return `<div class="screen wide">
      <div class="screen-head"><button class="btn small" data-a="back-title">◀ Title</button><h2>Leaderboard</h2>
      <select data-a="lb-filter" class="lb-filter"><option value="">All products</option>${Object.values(D.PRODUCTS).map((p) => `<option value="${p.id}" ${ui.lbProduct === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}</select></div>
      <p class="lead">Ranked by in-game days to first paying customer, then real play time. ${S.mode === 'local' ? '<span class="muted">(Saved on this device for now.)</span>' : ''}</p>
      <div class="panel"><table class="tbl lb"><tr><th>#</th><th>Founder</th><th>Product</th><th>Days</th><th>Time</th><th>Award</th><th>Date</th></tr>
      ${rows.map((e, i) => { const b = D.BADGES.find((x) => x.id === e.badge) || D.BADGES[3]; return `<tr class="${e.id === hi ? 'me' : ''}"><td>${i + 1}</td><td>${esc(e.founder)}</td><td>${esc(e.productName)}</td><td><b>${e.days}</b></td><td>${fmtTime(e.realMs)}</td><td><span class="badge" style="--b:${b.color}">${b.name}</span></td><td>${new Date(e.finishedAt).toLocaleDateString()}</td></tr>`; }).join('') || '<tr><td colspan="7" class="muted center">No customers yet. Be the first.</td></tr>'}
      </table></div></div>`;
  }

  // ---------------- actions ----------------
  async function showLeaderboard() { ui.lb = await S.getLeaderboard({ productId: ui.lbProduct || null, limit: 100 }); ui.modal = null; ui.screen = 'leaderboard'; render(); }
  function newGame() {
    const name = (ui.player.name || '').trim();
    if (!name) { const i = app.querySelector('[data-p="name"]'); if (i) { i.focus(); i.classList.add('shake'); setTimeout(() => i.classList.remove('shake'), 500); return; } }
    ui.modal = null; ui.screen = 'product'; render();
  }

  function afterChange(card) {
    S.saveGame(ui.game);
    const pids = card ? card.voices.map((v) => v.pid) : [];
    if (ui.town) ui.town.refresh(ui.game, pids);
    if (ui.game.phase === 'won') { ui.modal = { type: 'win' }; ui.result = null; render(); return true; }
    if (ui.game.phase === 'lost') { finish(); return true; }
    return false;
  }

  function endDay() {
    const g = ui.game;
    const feedBefore = g.feed.length ? g.feed[0] : null;
    const card = E.endDay(g);
    if (!card) return;
    // a launch card may be pushed after the day card
    const launch = g.feed[0] !== card && g.feed[0] !== feedBefore && g.feed[0].type === 'launch' ? g.feed[0] : null;
    const fade = document.getElementById('fade');
    ui.modal = null; renderModal();
    fade.innerHTML = `<div><small>${launch ? 'LAUNCH DAY' : 'NIGHT FALLS...'}</small><b>DAY ${g.day}</b></div>`;
    fade.classList.add('show');
    setTimeout(() => {
      fade.classList.remove('show');
      if (afterChange(card)) return;
      ui.modal = { type: 'day', card, launch };
      render();
    }, 1100);
  }

  async function finish() {
    const g = ui.game;
    let entry = null, rank = null, total = null;
    if (g.phase === 'won') {
      const badge = E.badgeFor(g.firstPaidDay);
      entry = { id: g.id, founder: g.founder, productId: g.productId, productName: PI(g.productId).name, days: g.firstPaidDay, realMs: Math.round(g.activeMs), actions: g.actionCount, adSpend: g.spent.ads, badge: badge.id, seed: g.seed, customerSeg: g.firstCustomer.seg, channel: g.firstCustomer.channel, finishedAt: new Date().toISOString() };
      try { const r = await S.submitScore(entry); rank = r.rank; total = r.total; } catch (e) { rank = '?'; }
    }
    await S.clearGame();
    ui.saved = null;
    ui.end = { state: g, entry, rank, total };
    ui.modal = null; ui.screen = 'end'; render();
  }

  function bind() {
    app.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-a]');
      if (!t || t.disabled) return;
      const a = t.dataset.a;
      if (a === 'backdrop') { if (e.target === t && ui.modal && ui.modal.type !== 'win') { ui.modal = null; ui.result = null; render(); } return; }
      if (t.tagName === 'SELECT') return;
      const g = ui.game;
      switch (a) {
        case 'oauth': {
          const p = t.dataset.pv;
          ui.authErr = '';
          ui.authBusy = true; render();
          S.signIn(p).catch((err) => { ui.authBusy = false; ui.authErr = err.message; render(); });
          break;
        }
        case 'signout': {
          if (ui.game) await S.saveGame(ui.game);
          await S.flush();
          await S.signOut();
          ui.auth = 'out'; ui.game = null; ui.saved = null; ui.player = { name: '' }; ui.screen = 'signin';
          render();
          break;
        }
        case 'new': newGame(); break;
        case 'continue': ui.game = ui.saved; ui.screen = 'game'; ui.modal = null; ui.tab = 'log'; ui.lastTick = Date.now(); render(); break;
        case 'leaderboard': showLeaderboard(); break;
        case 'help': ui.modal = { type: 'help' }; render(); break;
        case 'close': ui.modal = null; ui.result = null; render(); break;
        case 'back-title': ui.screen = 'title'; ui.modal = null; S.loadGame().then((s) => { ui.saved = s; render(); }); break;
        case 'back-product': ui.screen = 'product'; render(); break;
        case 'pick-product': {
          const p = PI(t.dataset.id);
          const nums = p.priceHint.match(/\d+/g).map(Number);
          ui.draft = { productId: p.id, build: { scope: 'mvp', features: [], model: 'subscription', price: Math.round((nums[0] + nums[1]) / 2), trial: 'trial7', onboarding: 'account' } };
          ui.screen = 'plan'; render(); break;
        }
        case 'draft': ui.draft.build[t.dataset.k] = t.dataset.v; render(); break;
        case 'feature': {
          const fs = ui.draft.build.features, id = t.dataset.id;
          if (fs.includes(id)) fs.splice(fs.indexOf(id), 1); else if (fs.length < 3) fs.push(id);
          render(); break;
        }
        case 'start':
          ui.game = E.createGame({ founder: ui.player.name.trim() || 'Founder', productId: ui.draft.productId, build: ui.draft.build });
          ui.screen = 'game'; ui.tab = 'log'; ui.form = {}; ui.lastTick = Date.now();
          S.saveGame(ui.game);
          ui.modal = { type: 'help' };
          render(); break;
        case 'tab': ui.tab = t.dataset.k; renderSide(); break;
        case 'menu': ui.modal = { type: 'menu' }; renderModal(); break;
        case 'save-quit': S.saveGame(g); ui.saved = g; ui.screen = 'title'; ui.modal = null; render(); break;
        case 'abandon': S.clearGame(); ui.saved = null; ui.game = null; ui.screen = 'title'; ui.modal = null; render(); break;
        case 'endday': endDay(); break;
        case 'choose': {
          const place = D.PLACES.find((p) => p.id === ui.modal.placeId);
          ui.action = t.dataset.id; initForm(place); renderModal(); break;
        }
        case 'form': ui.form[t.dataset.k] = t.dataset.v; renderModal(); break;
        case 'again': ui.result = null; renderModal(); break;
        case 'do': {
          const res = E.perform(g, ui.action, ui.form);
          if (!res.ok) { renderModal(); break; }
          ui.result = res.card;
          ui.form.text = ui.form.text; // keep message for reuse
          renderHud(); renderSide();
          if (!afterChange(res.card)) renderModal();
          break;
        }
        case 'claim': finish(); break;
      }
    });
    const onField = (e) => {
      const t = e.target;
      if (t.dataset.p === 'name') { ui.player.name = t.value; S.setPlayer(ui.player); return; }
      if (t.dataset.d === 'price') { ui.draft.build.price = Math.max(1, +t.value || 1); return; }
      if (t.dataset.a === 'lb-filter' && e.type === 'change') { ui.lbProduct = t.value; showLeaderboard(); return; }
      const k = t.dataset.f;
      if (!k) return;
      if (k === 'adChannel' || k === 'outChannel') { ui.form[k] = t.value; ui.form.channel = t.value; }
      else ui.form[k] = t.type === 'range' || t.type === 'number' ? +t.value : t.value;
      if (k === 'text') { const wc = document.getElementById('wc'); if (wc) wc.textContent = (t.value.match(/\S+/g) || []).length + ' words'; return; }
      if (e.type === 'change' || t.type === 'range') {
        if (t.type === 'range') { const lab = t.closest('.field').querySelector('b'); if (lab) lab.textContent = money(t.value); const btn = document.getElementById('do-btn'); const AA = E.ACTIONS[ui.action]; if (btn) { const ok = E.canDo(ui.game, ui.action, ui.form); btn.disabled = ok !== true; btn.textContent = `${AA.verb} (${AA.hours(ui.game, ui.form)}h, ${money(ui.form.budget)})`; } return; }
        if (t.tagName === 'SELECT') renderModal();
      }
    };
    app.addEventListener('input', onField);
    app.addEventListener('change', onField);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && ui.modal && ui.modal.type !== 'win') { ui.modal = null; ui.result = null; render(); }
    });
  }

  FG.ui = { boot, _ui: ui, _render: render };
})((globalThis.FG = globalThis.FG || {}));
