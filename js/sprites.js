// Procedural pixel art: icons, people, buildings. No image assets needed.
(function (FG) {
  'use strict';

  const PAL = {
    ink: '#1a1c2c', plum: '#5d275d', red: '#b13e53', orange: '#ef7d57', yellow: '#ffcd75', lime: '#a7f070', green: '#38b764',
    teal: '#257179', navy: '#29366f', blue: '#3b5dc9', sky: '#41a6f6', cyan: '#73eff7', white: '#f4f4f4', silver: '#94b0c2', slate: '#566c86', dark: '#333c57',
  };

  const ICONS = {
    wrench: ['....##.', '...#..#', '...#.#.', '..###..', '.###...', '###....', '##.....'],
    cup: ['.......', '#####..', '#####.#', '#####.#', '#####..', '.###...', '#######'],
    book: ['##...##', '#.##..#', '#.#.#.#', '#.##..#', '#.#.#.#', '#.##..#', '#######'],
    mail: ['#######', '##...##', '#.#.#.#', '#..#..#', '#.....#', '#######', '.......'],
    coin: ['..###..', '.#####.', '###.###', '##...##', '###.###', '.#####.', '..###..'],
    flag: ['#####..', '######.', '#####..', '#......', '#......', '#......', '#......'],
    rocket: ['...#...', '..###..', '..#.#..', '..###..', '.#####.', '#.###.#', '..#.#..'],
    bird: ['.......', '..##...', '.####.#', '######.', '.####..', '..#....', '.......'],
    tie: ['.#####.', '..###..', '...#...', '..###..', '..###..', '..###..', '...#...'],
    alien: ['....##.', '...#...', '.#####.', '#######', '##.#.##', '#######', '.#####.'],
    note: ['..#####', '..#...#', '..#...#', '..#...#', '###.###', '###.###', '.......'],
    camera: ['.......', '..##...', '#######', '##...##', '##.#.##', '##...##', '#######'],
    people: ['.#...#.', '###.###', '.#...#.', '###.###', '###.###', '#.#.#.#', '.......'],
    bubble: ['.#####.', '#######', '#.#.#.#', '#######', '.#####.', '.##....', '#......'],
    y: ['#######', '#.###.#', '##.#.##', '###.###', '###.###', '###.###', '#######'],
    play: ['#######', '##.####', '##..###', '##...##', '##..###', '##.####', '#######'],
    gamepad: ['.......', '.#####.', '##.##.#', '#...###', '##.##.#', '.##.##.', '.......'],
    clock: ['..###..', '.#...#.', '#..#..#', '#..##.#', '#.....#', '.#...#.', '..###..'],
    box: ['.#####.', '#.....#', '#######', '#..#..#', '#..#..#', '#..#..#', '#######'],
    bug: ['#.....#', '.#.#.#.', '..###..', '#######', '..###..', '#######', '..###..'],
    moon: ['..###..', '.##....', '##.....', '##.....', '##.....', '.##....', '..###..'],
    scroll: ['######.', '#....##', '#.###.#', '#.....#', '#.###.#', '#.....#', '#######'],
    dumbbell: ['.......', '##...##', '##...##', '#######', '##...##', '##...##', '.......'],
    heart: ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...', '.......'],
    star: ['...#...', '..###..', '#######', '.#####.', '.##.##.', '##...##', '.......'],
    eye: ['.......', '..###..', '.#...#.', '#..#..#', '.#...#.', '..###..', '.......'],
    hourglass: ['#######', '.#...#.', '..#.#..', '...#...', '..#.#..', '.#####.', '#######'],
    angry: ['.#####.', '#######', '#.###.#', '#######', '##...##', '.#####.', '.......'],
    sun: ['#..#..#', '.#####.', '.#####.', '#######', '.#####.', '.#####.', '#..#..#'],
    bolt: ['...###.', '..###..', '.###...', '######.', '...###.', '..###..', '.##....'],
    book2: ['#######', '#.....#', '#.###.#', '#.....#', '#.###.#', '#.....#', '#######'],
  };

  const iconCache = {};
  function iconURL(name, color = PAL.white, scale = 1) {
    const key = name + color + scale;
    if (iconCache[key]) return iconCache[key];
    const rows = ICONS[name] || ICONS.star;
    const c = document.createElement('canvas');
    c.width = 7 * scale; c.height = 7 * scale;
    const x = c.getContext('2d');
    x.fillStyle = color;
    rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '#') x.fillRect(i * scale, j * scale, scale, scale); }));
    return (iconCache[key] = c.toDataURL());
  }
  function icon(name, color, cls = '') { return `<img class="px-icon ${cls}" src="${iconURL(name, color)}" alt="">`; }
  function drawIcon(ctx, name, x, y, color) {
    const rows = ICONS[name] || ICONS.star;
    ctx.fillStyle = color;
    rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '#') ctx.fillRect(x + i, y + j, 1, 1); }));
  }

  // ---------- people ----------
  const SKIN = ['#8d5524', '#c68642', '#e0ac69', '#f1c27d', '#5c3a1e', '#ffdbac', '#a0662f'];
  const HAIR = ['#1a1c2c', '#3b2a1a', '#5d275d', '#b86f50', '#e8c170', '#333c57'];
  function look(seed, shirt) {
    return { skin: SKIN[seed % SKIN.length], hair: HAIR[(seed * 7 + 3) % HAIR.length], style: (seed * 13) % 6, shirt, pants: ['#29366f', '#333c57', '#566c86', '#5d275d'][(seed * 3) % 4] };
  }
  function drawPerson(ctx, x, y, L, frame = 0) {
    const P = (c, px, py, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(x + px, y + py, w, h); };
    // hair top
    P(L.hair, 2, 0, 4, 1); P(L.hair, 1, 1, 6, 1);
    if (L.style === 3) P(L.hair, 3, -1, 2, 1); // bun
    if (L.style === 5) { P(PAL.orange, 1, 0, 6, 2); } // head wrap
    if (L.style === 2) { P(PAL.red, 1, 1, 6, 1); P(PAL.red, 6, 2, 2, 1); } // cap
    // face
    P(L.skin, 1, 2, 6, 3); P(L.skin, 2, 5, 4, 1);
    P(L.hair, 1, 2, 1, L.style === 1 ? 4 : 1); P(L.hair, 6, 2, 1, L.style === 1 ? 4 : 1);
    if (L.style === 4) { P(L.hair, 0, 1, 1, 3); P(L.hair, 7, 1, 1, 3); }
    P(PAL.ink, 2, 3); P(PAL.ink, 5, 3);
    // body
    P(L.shirt, 1, 6, 6, 3); P(L.skin, 0, 7, 1, 2); P(L.skin, 7, 7, 1, 2);
    P(L.pants, 2, 9, 4, 1);
    if (frame % 2 === 0) { P(L.pants, 2, 10, 1, 1); P(L.pants, 5, 10, 1, 1); P(PAL.ink, 2, 11, 1, 1); P(PAL.ink, 5, 11, 1, 1); }
    else { P(L.pants, 3, 10, 1, 1); P(L.pants, 4, 10, 1, 1); P(PAL.ink, 3, 11, 1, 1); P(PAL.ink, 4, 11, 1, 1); }
  }

  const portraitCache = {};
  function portraitURL(seed, shirt, bg) {
    const key = seed + shirt + bg;
    if (portraitCache[key]) return portraitCache[key];
    const c = document.createElement('canvas');
    c.width = 12; c.height = 12;
    const x = c.getContext('2d');
    x.fillStyle = bg || PAL.dark; x.fillRect(0, 0, 12, 12);
    drawPerson(x, 2, 1, look(seed, shirt), 0);
    return (portraitCache[key] = c.toDataURL());
  }

  // ---------- buildings ----------
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, (n >> 16) + amt)), g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt)), b = Math.max(0, Math.min(255, (n & 255) + amt));
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  function rect(ctx, c, x, y, w, h) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }

  function drawBuilding(ctx, P, x, y, w, h, hover) {
    const ink = PAL.ink;
    rect(ctx, 'rgba(26,28,44,.35)', x + 3, y + h - 2, w - 2, 4); // shadow
    if (P.id === 'square') return drawSquare(ctx, P, x, y, w, h);
    if (P.id === 'launchpad') return drawPad(ctx, P, x, y, w, h);
    const tower = P.id === 'x' || P.id === 'linkedin';
    const roofH = tower ? 5 : 13;
    const wallTop = tower ? y + 2 : y + roofH;
    // wall
    rect(ctx, ink, x, wallTop, w, y + h - wallTop);
    rect(ctx, P.wall, x + 1, wallTop + 1, w - 2, y + h - wallTop - 2);
    rect(ctx, shade(P.wall, -25), x + 1, y + h - 4, w - 2, 3);
    if (tower) {
      rect(ctx, ink, x - 1, y, w + 2, 4); rect(ctx, P.roof, x, y + 1, w, 2);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        if (r === 3 && (c === 1 || c === 2)) continue;
        rect(ctx, ink, x + 4 + c * 10, y + 7 + r * 8, 7, 6); rect(ctx, (r + c) % 3 ? PAL.sky : PAL.yellow, x + 5 + c * 10, y + 8 + r * 8, 5, 4);
      }
    } else {
      // stepped roof
      for (let i = 0; i < roofH; i++) {
        const inset = Math.floor((roofH - i) * 0.9);
        rect(ctx, ink, x - 2 + inset, y + i, w + 4 - inset * 2, 1);
        rect(ctx, i === roofH - 1 ? shade(P.roof, -40) : i % 3 === 0 ? shade(P.roof, 20) : P.roof, x - 1 + inset, y + i, w + 2 - inset * 2, 1);
      }
      // windows
      for (const wx of [x + 4, x + w - 12]) {
        rect(ctx, ink, wx, wallTop + 5, 8, 8); rect(ctx, PAL.sky, wx + 1, wallTop + 6, 6, 6);
        rect(ctx, PAL.cyan, wx + 1, wallTop + 6, 2, 2); rect(ctx, ink, wx + 4, wallTop + 6, 1, 6); rect(ctx, ink, wx + 1, wallTop + 9, 6, 1);
      }
    }
    // door
    const dw = P.id === 'garage' ? 18 : 9, dx = x + Math.floor((w - dw) / 2);
    rect(ctx, ink, dx - 1, y + h - 13, dw + 2, 12);
    rect(ctx, P.id === 'garage' ? PAL.silver : '#7a4b2a', dx, y + h - 12, dw, 11);
    if (P.id === 'garage') for (let i = 0; i < 5; i++) rect(ctx, PAL.slate, dx, y + h - 11 + i * 2, dw, 1);
    else rect(ctx, PAL.yellow, dx + dw - 3, y + h - 7, 1, 1);
    // sign with icon
    const sx = x + Math.floor(w / 2) - 5, sy = tower ? y + h - 24 : wallTop + 2;
    if (!tower) {
      rect(ctx, ink, sx - 1, sy - 1, 11, 11); rect(ctx, PAL.white, sx, sy, 9, 9);
      drawIcon(ctx, P.icon, sx + 1, sy + 1, shade(P.roof, -10));
    } else {
      rect(ctx, ink, sx - 1, sy - 1, 11, 11); rect(ctx, P.roof, sx, sy, 9, 9);
      drawIcon(ctx, P.icon, sx + 1, sy + 1, PAL.white);
    }
    if (hover) { ctx.strokeStyle = PAL.yellow; ctx.lineWidth = 1; ctx.strokeRect(x - 2.5, y - 1.5, w + 5, h + 3); }
  }
  function drawSquare(ctx, P, x, y, w, h) {
    rect(ctx, '#d9c49a', x, y + 6, w, h - 6);
    rect(ctx, '#c4ad80', x, y + h - 2, w, 2);
    for (let i = 0; i < w; i += 6) for (let j = y + 8; j < y + h - 2; j += 6) rect(ctx, '#cbb489', x + i + ((j / 6) % 2 ? 3 : 0), j, 2, 2);
    const cx = x + w / 2 - 8, cy = y + 14;
    rect(ctx, PAL.ink, cx - 1, cy - 1, 18, 14); rect(ctx, PAL.silver, cx, cy, 16, 12); rect(ctx, PAL.sky, cx + 2, cy + 2, 12, 8); rect(ctx, PAL.cyan, cx + 7, cy - 6, 2, 9);
    rect(ctx, PAL.cyan, cx + 5, cy - 6, 6, 1);
    // flag pole
    rect(ctx, PAL.ink, x + 3, y, 1, 22); rect(ctx, P.roof, x + 4, y, 7, 5);
    rect(ctx, '#7a4b2a', x + w - 14, y + h - 9, 12, 2); rect(ctx, '#7a4b2a', x + w - 13, y + h - 7, 1, 3); rect(ctx, '#7a4b2a', x + w - 4, y + h - 7, 1, 3);
  }
  function drawPad(ctx, P, x, y, w, h) {
    rect(ctx, PAL.ink, x + 2, y + h - 8, w - 4, 7); rect(ctx, PAL.slate, x + 3, y + h - 7, w - 6, 5);
    for (let i = 0; i < w - 8; i += 6) rect(ctx, PAL.yellow, x + 5 + i, y + h - 5, 3, 1);
    const rx = x + w / 2 - 5;
    rect(ctx, PAL.ink, rx + 3, y + 1, 4, 2); rect(ctx, PAL.ink, rx + 1, y + 3, 8, 26);
    rect(ctx, PAL.white, rx + 2, y + 4, 6, 24); rect(ctx, P.roof, rx + 3, y + 2, 4, 3);
    rect(ctx, PAL.sky, rx + 3, y + 10, 4, 4); rect(ctx, PAL.ink, rx - 2, y + 22, 4, 8); rect(ctx, P.roof, rx - 1, y + 23, 2, 6);
    rect(ctx, PAL.ink, rx + 8, y + 22, 4, 8); rect(ctx, P.roof, rx + 9, y + 23, 2, 6);
    rect(ctx, PAL.orange, rx + 3, y + 29, 4, 2);
  }
  function drawTree(ctx, x, y) {
    rect(ctx, 'rgba(26,28,44,.3)', x + 1, y + 15, 12, 3);
    rect(ctx, '#7a4b2a', x + 5, y + 10, 3, 7);
    rect(ctx, PAL.ink, x + 1, y, 11, 12); rect(ctx, '#257147', x + 2, y + 1, 9, 10); rect(ctx, PAL.green, x + 3, y + 2, 5, 4);
  }

  FG.px = { PAL, ICONS, icon, iconURL, drawIcon, drawPerson, look, portraitURL, drawBuilding, drawTree, shade };
})((globalThis.FG = globalThis.FG || {}));
