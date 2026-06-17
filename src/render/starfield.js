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

// Procedural deep-space nebula: deep-blue base + layered soft colored cloud blobs (additive) +
// faint banding. Wide canvas so it wraps the skydome without obvious repetition.
function makeNebulaCanvas() {
  const W = 2048, H = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  // base vertical gradient (slightly lighter toward the "galactic plane" middle)
  const base = ctx.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0.0, '#05060f');
  base.addColorStop(0.45, '#0a1030');
  base.addColorStop(0.6, '#121a44');
  base.addColorStop(1.0, '#06080f');
  ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);

  // soft cloud blobs, additive — brighter/larger so the nebula clearly reads as a full-frame backdrop
  const palette = ['#3a5cc8', '#5a3ec8', '#1f8f9a', '#7a3aa0', '#2f6fe0', '#1f9a7a', '#a04a8a'];
  ctx.globalCompositeOperation = 'lighter';
  const rnd = (() => { let s = 0x9e3779b9; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
  for (let i = 0; i < 120; i++) {
    const x = rnd() * W;
    const y = H * (0.05 + rnd() * 0.9);
    const r = 140 + rnd() * 460;
    const col = palette[(rnd() * palette.length) | 0];
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.085 + rnd() * 0.15;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // a few brighter cores for punch
  for (let i = 0; i < 18; i++) {
    const x = rnd() * W, y = H * (0.15 + rnd() * 0.7), r = 40 + rnd() * 120;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(170,205,255,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.2 + rnd() * 0.22; ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // distant planets painted into the upper backdrop (scale + a sense of place)
  drawPlanet(ctx, W * 0.20, H * 0.30, 150, [[35, 64, 126], [58, 102, 176], [29, 52, 100], [79, 124, 214]], [110, 168, 255], -0.6, -0.5);
  drawPlanet(ctx, W * 0.82, H * 0.22, 78, [[110, 53, 38], [156, 85, 54], [79, 36, 23], [192, 130, 78]], [255, 154, 90], 0.5, -0.4);

  // vignette: darken the edges so gameplay (always centered) stays high-contrast over the nebula
  ctx.globalCompositeOperation = 'source-over';
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.18, W / 2, H / 2, H * 0.72);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(2,3,9,0.7)');
  ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  return c;
}

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

export function createStarfield(scene) {
  const layers = [];
  const sprite = makeStarSprite();

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
  // A PROCEDURAL nebula (soft colored clouds on deep blue) set as scene.background, so it reliably
  // fills the whole frame behind everything with no edges/seams and no projection guesswork (the
  // dark B-013 asset rendered as a near-black void; a flat plane showed rectangular seams; a
  // skydome only revealed an inconsistent slice). The parallax star layers above sell the motion.
  try {
    const tex = new THREE.CanvasTexture(makeNebulaCanvas());
    tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;
  } catch (_) { /* nebula optional */ }

  return {
    recenter(camPos) {
      for (const L of layers) {
        L.pts.position.x = camPos.x * (1 - L.par);
        L.pts.position.z = camPos.z * (1 - L.par);
      }
    },
    setWarp() { /* extended by vfx during jump */ },
  };
}
