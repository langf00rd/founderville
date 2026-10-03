// The town map: buildings = places you can act, townsfolk = the market.
(function (FG) {
  'use strict';
  const px = () => FG.px;
  const W = 344, H = 232, COLS = 6, PW = 48, PH = 40, STEP_X = 56, STEP_Y = 74;
  const PX = (c) => 8 + c * STEP_X;
  const PY = (r) => 12 + r * STEP_Y;
  const VX = Array.from({ length: COLS + 1 }, (_, c) => 4 + c * STEP_X);
  const HY = [74, 148, 222];
  const SLOTS = ['garage', 'cafe', 'library', 'postoffice', 'adagency', 'square', 'launchpad', 'x', 'linkedin', 'reddit', 'tiktok', 'instagram', 'facebook', 'whatsapp', 'hackernews', 'youtube', 'discord', null];

  function mount(root, { onPick }) {
    const D = FG.data, P = px();
    root.innerHTML = '';
    root.classList.add('town');
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H; cv.className = 'town-canvas';
    root.appendChild(cv);
    const overlay = document.createElement('div');
    overlay.className = 'town-overlay';
    root.appendChild(overlay);
    const ctx = cv.getContext('2d');

    // static background
    const bg = document.createElement('canvas');
    bg.width = W; bg.height = H;
    const b = bg.getContext('2d');
    b.fillStyle = '#5ba65b'; b.fillRect(0, 0, W, H);
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 260; i++) { b.fillStyle = r() > 0.5 ? '#4b8f4b' : '#6dbb5f'; b.fillRect(Math.floor(r() * W), Math.floor(r() * H), 2, 1); }
    for (const y of HY) { b.fillStyle = '#c4ad80'; b.fillRect(0, y - 7, W, 14); b.fillStyle = '#d9c49a'; b.fillRect(0, y - 6, W, 12); }
    for (const x of VX) { b.fillStyle = '#c4ad80'; b.fillRect(x - 4, 0, 8, H); b.fillStyle = '#d9c49a'; b.fillRect(x - 3, 0, 6, H); }
    for (let i = 0; i < 30; i++) { b.fillStyle = '#cbb489'; const y = HY[i % 3]; b.fillRect(Math.floor(r() * W), y - 4 + Math.floor(r() * 8), 2, 1); }
    const places = {};
    SLOTS.forEach((id, i) => {
      const c = i % COLS, rw = Math.floor(i / COLS);
      const x = PX(c), y = PY(rw);
      if (!id) {
        P.drawTree(b, x + 2, y + 6); P.drawTree(b, x + 22, y + 14); P.drawTree(b, x + 30, y);
        b.fillStyle = '#1a1c2c'; b.fillRect(x + 6, y + 30, 22, 12); b.fillStyle = '#41a6f6'; b.fillRect(x + 7, y + 31, 20, 10); b.fillStyle = '#73eff7'; b.fillRect(x + 10, y + 33, 5, 1);
        return;
      }
      const place = D.PLACES.find((p) => p.id === id);
      P.drawBuilding(b, place, x + 2, y, PW - 4, PH);
      places[id] = { x, y, door: { x: x + PW / 2, y: y + PH + 2 } };
      const btn = document.createElement('button');
      btn.className = 'place-btn';
      btn.dataset.place = id;
      btn.style.left = (x / W) * 100 + '%';
      btn.style.top = (y / H) * 100 + '%';
      btn.style.width = (PW / W) * 100 + '%';
      btn.style.height = ((PH + 14) / H) * 100 + '%';
      btn.innerHTML = `<span class="place-label">${place.name}</span><span class="place-badge" data-badge="${id}"></span>`;
      btn.title = `${place.name}: ${place.sub}`;
      btn.addEventListener('click', () => onPick(id));
      overlay.appendChild(btn);
    });

    // townsfolk
    let npcs = [];
    let founder = { x: places.garage.door.x, y: places.garage.door.y + 6 };
    let bubbles = {};
    function refresh(state, highlight = []) {
      if (!state) return;
      const segColor = (s) => D.SEGMENTS[s].color;
      const pool = state.personas;
      const hl = new Set(highlight);
      const pick = [];
      pool.forEach((p) => { if (hl.has(p.id)) pick.push(p); });
      const notable = pool.filter((p) => !hl.has(p.id) && (p.st >= 2 || p.st === -1));
      for (let i = 0; i < notable.length && pick.length < 22; i++) pick.push(notable[(i * 7919) % notable.length]);
      for (let i = 0; pick.length < 36 && i < pool.length; i++) { const p = pool[(i * 104729 + state.day * 31) % pool.length]; if (!pick.includes(p)) pick.push(p); }
      const old = Object.fromEntries(npcs.map((n) => [n.id, n]));
      npcs = pick.map((p, i) => {
        const o = old[p.id];
        const node = o ? o.node : [Math.floor(((p.id * 37) % VX.length)), Math.floor((p.id * 11) % HY.length)];
        return { id: p.id, st: p.st, look: P.look(p.id, segColor(p.s)), x: o ? o.x : VX[node[0]], y: o ? o.y : HY[node[1]], node, target: o ? o.target : null, f: i % 2 };
      });
      bubbles = {};
      const until = performance.now() + 4500;
      hl.forEach((id) => (bubbles[id] = until));
      // place badges (reputation stars)
      overlay.querySelectorAll('[data-badge]').forEach((el) => {
        const id = el.dataset.badge;
        const rep = state.rep[id] || 0;
        el.textContent = rep ? '★' + rep : '';
      });
    }
    function moveFounder(placeId) { const p = places[placeId]; if (p) founder = { x: p.door.x, y: p.door.y + 6 }; }

    function step(n) {
      if (!n.target) {
        const [cx, cy] = n.node;
        const opts = [];
        if (cx > 0) opts.push([cx - 1, cy]); if (cx < VX.length - 1) opts.push([cx + 1, cy]);
        if (cy > 0) opts.push([cx, cy - 1]); if (cy < HY.length - 1) opts.push([cx, cy + 1]);
        n.target = opts[Math.floor(Math.random() * opts.length)];
        n.wait = Math.random() < 0.3 ? Math.floor(Math.random() * 30) : 0;
      }
      if (n.wait > 0) { n.wait--; return; }
      const tx = VX[n.target[0]], ty = HY[n.target[1]];
      const dx = Math.sign(tx - n.x), dy = Math.sign(ty - n.y);
      n.x += dx * 0.5; n.y += dy * 0.5;
      if (Math.abs(n.x - tx) < 0.5 && Math.abs(n.y - ty) < 0.5) { n.x = tx; n.y = ty; n.node = n.target; n.target = null; }
    }

    let running = true, last = 0, tick = 0;
    const founderLook = { skin: '#a0662f', hair: '#1a1c2c', style: 3, shirt: '#ffcd75', pants: '#29366f' };
    function frame(t) {
      if (!running) return;
      requestAnimationFrame(frame);
      if (t - last < 66) return;
      last = t; tick++;
      ctx.drawImage(bg, 0, 0);
      const sorted = npcs.slice().sort((a, b) => a.y - b.y);
      for (const n of sorted) {
        step(n);
        const bx = Math.round(n.x) - 4, by = Math.round(n.y) - 10;
        P.drawPerson(ctx, bx, by, n.look, n.wait > 0 ? 0 : Math.floor(tick / 3) + n.f);
        const mark = n.st === 4 ? ['coin', '#ffcd75'] : n.st === 3 ? ['hourglass', '#a7f070'] : n.st === -1 ? ['angry', '#b13e53'] : n.st === 2 ? ['star', '#73eff7'] : null;
        if (bubbles[n.id] && bubbles[n.id] > t) {
          ctx.fillStyle = '#1a1c2c'; ctx.fillRect(bx - 1, by - 11, 11, 10); ctx.fillStyle = '#f4f4f4'; ctx.fillRect(bx, by - 10, 9, 8); ctx.fillRect(bx + 2, by - 2, 2, 1);
          P.drawIcon(ctx, mark ? mark[0] : 'eye', bx + 1, by - 10, mark ? (mark[0] === 'coin' ? '#ef7d57' : mark[0] === 'hourglass' ? '#38b764' : mark[0] === 'angry' ? '#b13e53' : '#3b5dc9') : '#566c86');
        } else if (mark) P.drawIcon(ctx, mark[0], bx + 1, by - 9 + (Math.floor(tick / 6) % 2), mark[1]);
      }
      P.drawPerson(ctx, Math.round(founder.x) - 4, Math.round(founder.y) - 10, founderLook, 0);
      ctx.fillStyle = '#ffcd75'; ctx.fillRect(Math.round(founder.x) - 1, Math.round(founder.y) - 14 + (Math.floor(tick / 5) % 2), 2, 2);
    }
    requestAnimationFrame(frame);
    return { refresh, moveFounder, destroy() { running = false; } };
  }

  FG.town = { mount };
})((globalThis.FG = globalThis.FG || {}));
