// Deep-space backdrop: a parallax starfield of soft ROUND stars (procedural sprite texture, not
// the default square points) layered over a colored nebula backdrop built from the generated
// nebula art. Together they kill the "dead black void" and give real depth + atmosphere.
import * as THREE from 'three';

// Soft round star sprite (radial gradient -> circular, glowing). Square PointsMaterial points are
// the #1 reason a starfield looks cheap; this fixes it.
function makeStarSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.32)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Procedural deep-space nebula: a moodier cyberpunk-noir backdrop — deep indigo base + denser
// layered clouds in magenta/cyan/violet (the signature neon palette) + dust lanes + painted distant
// planets for real depth. Sector-tintable via the optional tint so each region of the galaxy reads
// with its own atmosphere (clean-blue core vs rust-red frontier vs violet lawless edge). Wide canvas
// so it wraps the skydome without obvious repetition. Accepts an optional {tint, planets} for variety.
function makeNebulaCanvas(opts = {}) {
  const W = 2048, H = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const tint = opts.tint || null; // optional hex string to shift the whole palette toward a sector mood
  const rnd = (() => { let s = 0x9e3779b9; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();

  // base vertical gradient (slightly lighter toward the "galactic plane" middle). Deep indigo for the
  // noir mood; tintable so a sector can lean rust/violet/teal.
  const base = ctx.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0.0, '#04050c');
  base.addColorStop(0.45, tint ? shade('#0a1028', tint) : '#080d24');
  base.addColorStop(0.6, tint ? shade('#141a40', tint) : '#10183c');
  base.addColorStop(1.0, '#05060e');
  ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);

  // cloud palette — magenta, violet, cyan, teal: the cyberpunk-noir neon signature. Tinted per-sector.
  const rawPalette = ['#5a3ec8', '#7a3aa0', '#2f6fe0', '#1f8f9a', '#c83a8a', '#3a8fc8', '#8a2fa0'];
  const palette = tint ? rawPalette.map((p) => blend(p, tint, 0.35)) : rawPalette;

  // DEEP broad washes first (huge, low-alpha) to establish the moody color field
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 24; i++) {
    const x = rnd() * W, y = H * (0.05 + rnd() * 0.9), r = 600 + rnd() * 700;
    const col = palette[(rnd() * palette.length) | 0];
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.05 + rnd() * 0.06;
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // mid-size cloud blobs — the main readable structure
  for (let i = 0; i < 110; i++) {
    const x = rnd() * W, y = H * (0.05 + rnd() * 0.9), r = 140 + rnd() * 460;
    const col = palette[(rnd() * palette.length) | 0];
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.085 + rnd() * 0.15;
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // dust lanes — dark winding streaks (source-over) that break up the clouds and add structure
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(2,3,8,0.4)'; ctx.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    const x0 = rnd() * W, y0 = rnd() * H;
    ctx.lineWidth = 30 + rnd() * 120;
    ctx.globalAlpha = 0.18 + rnd() * 0.3;
    ctx.beginPath(); ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(x0 + (rnd() - 0.5) * W * 0.4, y0 + rnd() * H * 0.3,
                      x0 + (rnd() - 0.5) * W * 0.4, y0 + rnd() * H * 0.3,
                      x0 + (rnd() - 0.5) * W * 0.5, y0 + (rnd() - 0.5) * H * 0.5);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // bright cores for punch (back to additive)
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 22; i++) {
    const x = rnd() * W, y = H * (0.15 + rnd() * 0.7), r = 40 + rnd() * 130;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(180,210,255,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.2 + rnd() * 0.25; ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  // PAINTED DISTANT PLANETS — 2-3 for real backdrop depth (the system's drawPlanet, previously dead
  // code, now wired in). They read as giant far-off worlds, reinforcing the sense of a lived-in galaxy.
  if (opts.planets !== false) {
    const planetSpecs = [
      { cx: W * 0.20, cy: H * 0.30, r: 90,  bands: [[60,40,80],[40,30,70],[80,50,110]], atm: [120,80,200] },
      { cx: W * 0.82, cy: H * 0.66, r: 130, bands: [[30,50,70],[20,40,60],[50,90,110]], atm: [80,160,200] },
      { cx: W * 0.55, cy: H * 0.16, r: 55,  bands: [[90,50,40],[120,70,40],[70,40,30]], atm: [220,140,80] },
    ];
    for (const p of planetSpecs) {
      // place each planet deterministically with a stable light direction (upper-left)
      drawPlanet(ctx, p.cx, p.cy, p.r, p.bands, p.atm, -0.6, -0.5);
    }
  }

  // vignette: darken the edges so gameplay (always centered) stays high-contrast over the nebula
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.18, W / 2, H / 2, H * 0.72);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(2,3,9,0.7)');
  ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  return c;
}

// --- small color helpers for sector tinting (no deps) ---
function hexToRgb(hex) {
  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}
// linear blend of two hex colors by t (0=a,1=b)
function blend(a, b, t) {
  const pa = hexToRgb(a), pb = hexToRgb(b);
  return rgbToHex(pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t, pa[2] + (pb[2] - pa[2]) * t);
}
// shift a base hex toward a tint hue (multiplies channels then normalizes) — used for sector mood
function shade(base, tint, amt = 0.3) { return blend(base, tint, amt); }


// Paint a shaded distant planet onto a 2D context: atmosphere rim, banded body, a lit crescent and
// a dark terminator. lx,ly = direction (in canvas space) toward the light source.
function drawPlanet(ctx, cx, cy, r, bands, atm, lx, ly) {
  ctx.save();
  // atmosphere rim glow (additive)
  ctx.globalCompositeOperation = 'lighter';
  const ag = ctx.createRadialGradient(cx, cy, r * 0.88, cx, cy, r * 1.32);
  ag.addColorStop(0, `rgba(${atm[0]},${atm[1]},${atm[2]},0)`);
  ag.addColorStop(0.55, `rgba(${atm[0]},${atm[1]},${atm[2]},0.16)`);
  ag.addColorStop(1, `rgba(${atm[0]},${atm[1]},${atm[2]},0)`);
  ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(cx, cy, r * 1.32, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  // body (clipped to the disc)
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = `rgb(${bands[0][0]},${bands[0][1]},${bands[0][2]})`;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  let y = cy - r;
  while (y < cy + r) {
    const bh = r * (0.04 + Math.random() * 0.16);
    const b = bands[(Math.random() * bands.length) | 0];
    ctx.globalAlpha = 0.5 + Math.random() * 0.4;
    ctx.fillStyle = `rgb(${b[0]},${b[1]},${b[2]})`;
    ctx.fillRect(cx - r, y, r * 2, bh + 1);
    y += bh;
  }
  ctx.globalAlpha = 1;
  // lit crescent: brighten toward the light, darken the far/terminator side
  const lit = ctx.createRadialGradient(cx + lx * r * 0.6, cy + ly * r * 0.6, r * 0.1, cx, cy, r * 1.25);
  lit.addColorStop(0, 'rgba(255,250,235,0.45)');
  lit.addColorStop(0.4, 'rgba(255,250,235,0.0)');
  lit.addColorStop(1, 'rgba(255,250,235,0)');
  ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = lit;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.globalCompositeOperation = 'source-over';
  const dark = ctx.createRadialGradient(cx - lx * r * 0.9, cy - ly * r * 0.9, r * 0.1, cx - lx * r * 0.4, cy - ly * r * 0.4, r * 1.8);
  dark.addColorStop(0, 'rgba(2,3,8,0.92)');
  dark.addColorStop(0.55, 'rgba(2,3,8,0.5)');
  dark.addColorStop(1, 'rgba(2,3,8,0)');
  ctx.fillStyle = dark; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

export function createStarfield(scene, opts = {}) {
  const layers = [];
  const sprite = makeStarSprite();
  let bgTexture = null;
  let currentTint = opts.tint || null;

  // star tints (mostly cool white/blue with a few warm + teal accents)
  const TINTS = [0xffffff, 0xcfe0ff, 0x9fb6e0, 0xfff0d8, 0x8af0d6, 0xbfd2ff];
  const specs = [
    { count: 2200, spread: 5200, yLo: -1600, yHi: -120, size: 5,  par: 0.94, opacity: 0.85 },
    { count: 1300, spread: 4200, yLo: -1200, yHi: -80,  size: 9,  par: 0.86, opacity: 0.95 },
    { count: 520,  spread: 3200, yLo: -900,  yHi: -40,  size: 16, par: 0.74, opacity: 1.0 },
    { count: 90,   spread: 2400, yLo: -700,  yHi: 60,   size: 34, par: 0.60, opacity: 0.9 }, // sparse bright "hero" stars
  ];

  for (const s of specs) {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(s.count * 3);
    const col = new Float32Array(s.count * 3);
    const tmp = new THREE.Color();
    for (let i = 0; i < s.count; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * s.spread;
      pos[i * 3 + 1] = s.yLo + Math.random() * (s.yHi - s.yLo);
      pos[i * 3 + 2] = (Math.random() * 2 - 1) * s.spread;
      tmp.setHex(TINTS[(Math.random() * TINTS.length) | 0]);
      // vary brightness so the field isn't uniform
      const b = 0.45 + Math.random() * 0.55;
      col[i * 3] = tmp.r * b; col[i * 3 + 1] = tmp.g * b; col[i * 3 + 2] = tmp.b * b;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({
      map: sprite, size: s.size, sizeAttenuation: true, vertexColors: true,
      transparent: true, opacity: s.opacity, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false; pts.renderOrder = -10;
    scene.add(pts);
    layers.push({ pts, par: s.par });
  }

  // ---- nebula backdrop (with painted distant planets) ------------------------------------------
  // A PROCEDURAL moody nebula (magenta/violet/cyan neon clouds + dust lanes + painted planets on
  // deep indigo) set as scene.background, so it reliably fills the whole frame with no seams. The
  // parallax star layers above sell the motion. Sector-tintable so each region of the galaxy has
  // its own atmosphere (clean-blue core vs rust-red frontier vs violet lawless edge).
  function applyBackground(tint) {
    try {
      const tex = new THREE.CanvasTexture(makeNebulaCanvas({ tint }));
      tex.colorSpace = THREE.SRGBColorSpace;
      if (bgTexture) bgTexture.dispose();
      bgTexture = tex;
      scene.background = tex;
    } catch (_) { /* nebula optional */ }
  }
  applyBackground(currentTint);

  return {
    recenter(camPos) {
      for (const L of layers) {
        L.pts.position.x = camPos.x * (1 - L.par);
        L.pts.position.z = camPos.z * (1 - L.par);
      }
    },
    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
    setSectorTint(tint) {
      if (tint === currentTint) return;
      currentTint = tint || null;
      applyBackground(currentTint);
    },
    setWarp() { /* extended by vfx during jump */ },
  };
}
