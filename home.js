// Pixal's homepage: a sky drawn the way the game draws it (nine flat colours in dithered bands, from the game's own
// palettes in src/lib/pixal/outdoors/sky-palettes.ts), set to the visitor's real hour and season; the village window
// blends the four painted loops (dawn, day, dusk, night) to match, and the sun dial lets you scrub through them.
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- the game's palettes, top band → bottom ----------
  const DAWN = ['#615782', '#7a6185', '#946b88', '#ab748a', '#b17a89', '#bd8487', '#c98e85', '#d99c82', '#dd9f81'];
  const DUSK = ['#fcc98a', '#efa355', '#f89d54', '#f37b55', '#e15d42', '#d44937', '#b52d3c', '#a42446', '#93184c'];
  const NIGHT = ['#12152d', '#131630', '#151832', '#161a34', '#171b35', '#191d37', '#1a1e39', '#1d213b', '#1d213c'];
  const DAY = {
    spring: ['#6eabd8', '#7ab5dd', '#86bee3', '#90c7e8', '#95cae9', '#a0cfec', '#a9d4ee', '#b6dbf1', '#b9ddf1'],
    summer: ['#4f9cdc', '#5ba5e0', '#67afe4', '#73b8e8', '#78bbe9', '#84c2eb', '#8fc9ec', '#9ed2ef', '#a2d4ef'],
    autumn: ['#6f91b1', '#7f9eb8', '#90abbe', '#9fb6c3', '#a4b8bf', '#b0bbb7', '#bbbeb0', '#cac2a6', '#cec3a4'],
    winter: ['#68788d', '#728397', '#7d8ea2', '#8798ab', '#8d9eb0', '#97a8b9', '#a1b1c1', '#afbfcd', '#b2c2d0'],
  };
  // Each band's share of the painted sky, top → bottom (measured from the game's sky.png).
  const SHARES = [0.2235, 0.0028, 0.1715, 0.1817, 0.0112, 0.2550, 0.0062, 0.0050, 0.1432];

  const month = new Date().getMonth();
  const season = month < 2 || month === 11 ? 'winter' : month < 5 ? 'spring' : month < 8 ? 'summer' : 'autumn';
  const STOPS = [DAWN, DAY[season], DUSK, NIGHT];   // t = 0, 1, 2, 3 (and 4 = dawn again)
  const NAMES = ['dawn', 'day', 'dusk', 'night'];

  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const mix = (a, b, f) => a.map((v, i) => Math.round(v + (b[i] - v) * f));
  const css = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
  const lum = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  const paletteAt = (t) => {
    const i = Math.floor(t) % 4, f = t - Math.floor(t);
    return STOPS[i].map((hex, band) => mix(rgb(hex), rgb(STOPS[(i + 1) % 4][band]), f));
  };

  // ---------- the visitor's hour → t ----------
  // Unwrapped: 3 night → 4 dawn → 5 day → 6 dusk → 7 night; read back mod 4.
  const KEYS = [[4.5, 3], [6, 4], [8.5, 5], [17, 5], [19, 6], [21, 7]];
  const tOfClock = (d = new Date()) => {
    const h = d.getHours() + d.getMinutes() / 60;
    if (h <= KEYS[0][0]) return 3;
    if (h >= KEYS[KEYS.length - 1][0]) return 3;
    for (let k = 1; k < KEYS.length; k++) {
      const [h1, v1] = KEYS[k], [h0, v0] = KEYS[k - 1];
      if (h <= h1) return (v0 + (v1 - v0) * (h - h0) / (h1 - h0)) % 4;
    }
    return 3;
  };

  // ?tod=dusk (or dawn, day, night) opens the page at that light, for sharing a particular look.
  const asked = NAMES.indexOf(new URLSearchParams(location.search).get('tod'));
  let t = asked >= 0 ? asked : tOfClock();
  let following = asked < 0;   // the sky follows the clock until the visitor drags the sun

  // ---------- the sky ----------
  const sky = document.getElementById('sky');
  const g = sky.getContext('2d');
  const PX = 5;   // one sky pixel, in CSS pixels
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const stars = Array.from({ length: 90 }, () => [Math.random(), Math.random() * 0.62, Math.random()]);
  // Two ridges of hills, as column heights in sky pixels, made once and stretched to the width.
  const ridge = (n, base, amp, seed) => Array.from({ length: n }, (_, x) => {
    const a = Math.sin(x * 0.045 + seed) * 0.5 + Math.sin(x * 0.013 + seed * 2) * 0.8 + Math.sin(x * 0.11 + seed * 3) * 0.12;
    return Math.round(base + a * amp);
  });
  let W = 0, H = 0, far = [], near = [];
  const resize = () => {
    W = Math.ceil(innerWidth / PX); H = Math.ceil(Math.max(innerHeight, document.documentElement.clientHeight) / PX);
    sky.width = W; sky.height = H;
    far = ridge(W, H * 0.2, H * 0.05, 1.7); near = ridge(W, H * 0.11, H * 0.045, 4.2);
    draw();
  };

  let tick = 0;
  function draw() {
    const pal = paletteAt(t);
    const img = g.createImageData(W, H);
    const d = img.data;
    // Band edges in rows, and a short dithered blend across each edge, as the game's sky does.
    const edges = []; let acc = 0;
    for (const s of SHARES) { acc += s; edges.push(acc * H * 0.92); }
    const blend = Math.max(2, H * 0.025);
    for (let y = 0; y < H; y++) {
      let b = edges.findIndex((e) => y < e); if (b < 0) b = 8;
      const next = Math.min(8, b + 1);
      const into = (y - (edges[b] - blend)) / blend;   // 0..1 across the blend above the next band
      for (let x = 0; x < W; x++) {
        const c = into > 0 && BAYER[(y & 3) * 4 + (x & 3)] < into ? pal[next] : pal[b];
        const o = (y * W + x) * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      }
    }
    // Stars, when it's dark enough.
    const dark = t > 2.4 && t < 3.6 ? 1 - Math.abs(t - 3) / 0.6 : 0;
    if (dark > 0) for (const [sx, sy, tw] of stars) {
      if (tw > dark || (tw * 7 + tick * 0.02) % 1 < 0.08) continue;
      const o = ((Math.floor(sy * H)) * W + Math.floor(sx * W)) * 4; d[o] = 255; d[o + 1] = 246; d[o + 2] = 214;
    }
    g.putImageData(img, 0, 0);

    // The sun (day) or moon (night): hard-edged discs, a halo of banded steps like the game's lamps.
    const night = t > 2.5 && t < 3.5, s = night ? (t - 2.5) : ((t + 0.5) % 4) / 3;
    const arc = Math.min(1, Math.max(0, s));
    // On a phone the words fill the width: the sun keeps to a low arc in the top corner, small, clear of the title.
    const narrow = W * PX < 860;
    const cx = narrow ? W * (0.55 + 0.38 * arc) : W * (0.12 + 0.76 * arc);
    const cy = narrow ? 13 - Math.sin(arc * Math.PI) * 3 : H * (0.62 - Math.sin(arc * Math.PI) * 0.42);
    const R = narrow ? 3 : Math.max(5, Math.round(H * 0.035));
    const glow = night ? [255, 246, 214] : t < 0.6 || t > 1.6 ? [255, 214, 150] : [255, 247, 220];
    for (let k = 6; k >= 1; k--) {
      g.fillStyle = `rgba(${glow[0]},${glow[1]},${glow[2]},${0.05 + (6 - k) * 0.012})`;
      g.beginPath(); g.arc(Math.round(cx), Math.round(cy), R + k * Math.round(R * 0.45), 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = css(glow); g.beginPath(); g.arc(Math.round(cx), Math.round(cy), R, 0, Math.PI * 2); g.fill();
    if (night) { g.fillStyle = css(pal[2]); g.beginPath(); g.arc(Math.round(cx + R * 0.45), Math.round(cy - R * 0.25), R * 0.9, 0, Math.PI * 2); g.fill(); }

    // Hills, tinted by the sky so the ground always belongs to the light above it.
    const shade = (c, k) => css(mix(c, [24, 30, 40], k));
    const hillFar = mix(rgb('#5f8f5a'), pal[7], 0.45), hillNear = mix(rgb('#3f6b45'), pal[8], 0.3);
    const dim = t > 2.2 && t < 3.8 ? 0.55 : 0.05;
    g.fillStyle = shade(hillFar, dim); for (let x = 0; x < W; x++) g.fillRect(x, H - far[x], 1, far[x]);
    g.fillStyle = shade(hillNear, dim + 0.12); for (let x = 0; x < W; x++) g.fillRect(x, H - near[x], 1, near[x]);

    // The page's ink follows the sky: dark on a bright day, light otherwise.
    const top = pal[3];
    const light = lum(top) > 0.5;
    document.documentElement.style.setProperty('--ink', light ? '#1f2440' : '#fff8ec');
    document.documentElement.style.setProperty('--ink-soft', light ? 'rgba(31,36,64,.78)' : 'rgba(255,248,236,.8)');
    document.documentElement.style.setProperty('--thumb', night ? '#e9e4ff' : '#f2b544');
    document.querySelector('meta[name="theme-color"]').content = css(pal[0]);
  }

  // ---------- the village window: four loops, one painting, blended by t ----------
  const videos = [...document.querySelectorAll('.frame video')];
  const showLoops = () => {
    const i = Math.floor(t) % 4, f = t - Math.floor(t);
    videos.forEach((v, k) => {
      if (k === i) { v.style.opacity = 1; v.style.zIndex = 1; }
      else if (k === (i + 1) % 4 && f > 0.001) { v.style.opacity = f; v.style.zIndex = 2; }
      else { v.style.opacity = 0; v.style.zIndex = 0; }
    });
  };
  const lead = () => videos[Math.floor(t) % 4];
  // They're the same painting in different light: keep them on the same frame so blending never ghosts.
  setInterval(() => {
    const leader = lead(); if (leader.paused) return;
    for (const v of videos) if (v !== leader && Math.abs(v.currentTime - leader.currentTime) > 0.06) v.currentTime = leader.currentTime;
  }, 400);
  const playAll = () => { if (!reduced) videos.forEach((v) => v.play().catch(() => {})); };
  const pauseAll = () => videos.forEach((v) => v.pause());
  new IntersectionObserver(([e]) => (e.isIntersecting ? playAll() : pauseAll())).observe(document.querySelector('.frame'));

  // ---------- the dial and the clock ----------
  const dial = document.getElementById('tod'), now = document.getElementById('now'), clock = document.getElementById('clock');
  const setDial = () => { dial.value = Math.round(Math.min(t, 3) * 100); };
  const describe = () => {
    const d = new Date();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const name = NAMES[Math.round(t) % 4];
    clock.textContent = following ? `${time} where you are · ${name} in Pixal` : `${name} in Pixal · ${season}`;
  };
  const apply = () => { draw(); showLoops(); describe(); };
  dial.max = 300;
  dial.addEventListener('input', () => { following = false; now.hidden = false; t = dial.value / 100; apply(); });
  now.addEventListener('click', () => { following = true; now.hidden = true; t = tOfClock(); setDial(); apply(); });
  setInterval(() => { tick++; if (following) t = tOfClock(); if (following) setDial(); apply(); }, reduced ? 30000 : 1500);

  // ---------- the bar goes solid once past the hero ----------
  const bar = document.querySelector('.bar');
  const onScroll = () => bar.classList.toggle('solid', scrollY > innerHeight * 0.75);
  addEventListener('scroll', onScroll, { passive: true });

  // ---------- the cooking story ----------
  const frames = [...document.querySelectorAll('.stage-frame img')];
  const ticks = [...document.querySelectorAll('.ticks li')];
  const steps = [...document.querySelectorAll('.step')];
  const sparks = document.querySelector('.sparks');
  let shown = 0;
  const show = (n) => {
    if (n === shown) return; shown = n;
    frames.forEach((f, k) => f.classList.toggle('on', k === n));
    ticks.forEach((x, k) => x.classList.toggle('on', k <= n));
    steps.forEach((s, k) => s.classList.toggle('on', k === n));
    if (n === 3 && !reduced) for (let k = 0; k < 18; k++) {
      const i = document.createElement('i');
      i.style.left = `${30 + Math.random() * 40}%`; i.style.top = `${48 + Math.random() * 18}%`;
      i.style.setProperty('--dx', `${(Math.random() - 0.5) * 120}px`); i.style.animationDelay = `${Math.random() * 0.4}s`;
      sparks.appendChild(i); setTimeout(() => i.remove(), 2200);
    }
  };
  steps[0].classList.add('on');
  const stepObserver = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) show(Number(e.target.dataset.step));
  }, { rootMargin: '-45% 0px -45% 0px' });
  steps.forEach((s) => stepObserver.observe(s));

  // ---------- chapters ease in as they arrive ----------
  const reveal = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); reveal.unobserve(e.target); }
  }, { rootMargin: '0px 0px -10% 0px' });
  document.querySelectorAll('.chapter > *, .card, .company-card, .strip figure').forEach((el) => { el.classList.add('reveal'); reveal.observe(el); });

  addEventListener('resize', resize);
  if (!following) now.hidden = false;
  setDial(); resize(); showLoops(); describe(); onScroll();
})();
