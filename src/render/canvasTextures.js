// Procedural <canvas> texture builders for the art layer (no external assets, no addons).
// Every builder returns a THREE.CanvasTexture. Textures are the most expensive procedural
// resource, so the VisualFactory caches them by key — these functions are pure given their
// args and a seed, so the same key always yields the same pixels (determinism via seed).
//
// Exports:
//   makeNoiseTexture(opts)     – value-noise / fbm grayscale tile (roughness, dust, masks)
//   makeGreebleTexture(opts)   – tech-panel greeble (rectangles, vents, rivets) for hull/station
//   makeGradientTexture(opts)  – vertical/radial color ramp (glows, energy, sky cards)
//   makeHullPanelTexture(opts) – paneled metal albedo with seams, rivets and a faint wear pass
//   makeStarTexture(opts)      – soft radial star/glow sprite (also used for halos & blinkers)
import * as THREE from 'three';

// ---- tiny seeded RNG (mulberry32) so textures are deterministic per seed -------------------
function mulberry32(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  return c;
}

function finalize(canvas, { srgb = false, anisotropy = 4, repeat = null } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = anisotropy;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (repeat) tex.repeat.set(repeat[0], repeat[1]);
  tex.needsUpdate = true;
  return tex;
}

// Value-noise sampled on an integer lattice with smooth (cosine) interpolation; fbm-summed.
function valueNoiseField(size, cells, seed) {
  const rnd = mulberry32(seed);
  const g = cells + 1;
  const grid = new Float32Array(g * g);
  for (let i = 0; i < grid.length; i++) grid[i] = rnd();
  const at = (x, y) => grid[(y % g) * g + (x % g)];
  const out = new Float32Array(size * size);
  const scale = cells / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = x * scale, fy = y * scale;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      let sx = fx - x0, sy = fy - y0;
      sx = sx * sx * (3 - 2 * sx); sy = sy * sy * (3 - 2 * sy);
      const n00 = at(x0, y0), n10 = at(x0 + 1, y0);
      const n01 = at(x0, y0 + 1), n11 = at(x0 + 1, y0 + 1);
      const a = n00 + (n10 - n00) * sx;
      const b = n01 + (n11 - n01) * sx;
      out[y * size + x] = a + (b - a) * sy;
    }
  }
  return out;
}

/**
 * Grayscale fbm/value-noise tile. Useful as a roughness map, dust overlay, or emissive mask.
 * opts: { size=256, seed=1, octaves=4, baseCells=4, contrast=1, brightness=0, tint='#ffffff' }
 */
export function makeNoiseTexture(opts = {}) {
  const { size = 256, seed = 1, octaves = 4, baseCells = 4, contrast = 1.0, brightness = 0.0, tint = '#ffffff' } = opts;
  const acc = new Float32Array(size * size);
  let amp = 1, totAmp = 0, cells = baseCells;
  for (let o = 0; o < octaves; o++) {
    const field = valueNoiseField(size, Math.max(1, Math.round(cells)), seed + o * 131);
    for (let i = 0; i < acc.length; i++) acc[i] += field[i] * amp;
    totAmp += amp; amp *= 0.5; cells *= 2;
  }
  const tc = new THREE.Color(tint);
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < acc.length; i++) {
    let v = acc[i] / totAmp;
    v = (v - 0.5) * contrast + 0.5 + brightness;
    v = Math.max(0, Math.min(1, v));
    const k = i * 4;
    img.data[k] = v * tc.r * 255;
    img.data[k + 1] = v * tc.g * 255;
    img.data[k + 2] = v * tc.b * 255;
    img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return finalize(canvas, { srgb: false });
}

/**
 * Tech-panel greeble: a base plate scattered with rectangular plates, vents and rivets.
 * Reads as industrial hull / station plating. opts: { size, seed, base, plate, line, density, srgb }
 */
export function makeGreebleTexture(opts = {}) {
  const {
    size = 256, seed = 7, density = 1.0,
    base = '#2a2f3a', plate = '#3a4250', line = '#10141c', accent = '#5a6678', srgb = true,
  } = opts;
  const rnd = mulberry32(seed);
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // coarse panel grid seams
  ctx.strokeStyle = line; ctx.lineWidth = Math.max(1, size / 256);
  const grid = 4 + Math.floor(rnd() * 3);
  for (let i = 1; i < grid; i++) {
    const p = Math.round((i / grid) * size);
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
  }

  // scattered raised plates
  const plates = Math.round(26 * density);
  for (let i = 0; i < plates; i++) {
    const w = (0.06 + rnd() * 0.20) * size;
    const h = (0.05 + rnd() * 0.16) * size;
    const x = rnd() * (size - w), y = rnd() * (size - h);
    const shade = rnd();
    ctx.fillStyle = shade > 0.7 ? accent : plate;
    ctx.globalAlpha = 0.55 + rnd() * 0.4;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    // vent slats on some plates
    if (rnd() > 0.6) {
      ctx.strokeStyle = line;
      const slats = 2 + Math.floor(rnd() * 4);
      for (let s = 1; s < slats; s++) {
        const sy = y + (s / slats) * h;
        ctx.beginPath(); ctx.moveTo(x + 2, sy); ctx.lineTo(x + w - 2, sy); ctx.stroke();
      }
    }
  }

  // rivets
  ctx.globalAlpha = 0.5;
  const rivets = Math.round(60 * density);
  for (let i = 0; i < rivets; i++) {
    const x = rnd() * size, y = rnd() * size, r = Math.max(0.8, size / 256 * (0.8 + rnd()));
    ctx.fillStyle = rnd() > 0.5 ? accent : line;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  return finalize(canvas, { srgb });
}

/**
 * Color gradient ramp. type 'linear' (vertical) or 'radial' (center→edge).
 * opts: { size, type, stops:[[t,'#hex'],...], srgb }
 */
export function makeGradientTexture(opts = {}) {
  const { size = 256, type = 'linear', stops = [[0, '#ffffff'], [1, '#000000']], srgb = true } = opts;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  let grad;
  if (type === 'radial') {
    grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  } else {
    grad = ctx.createLinearGradient(0, 0, 0, size);
  }
  for (const [t, col] of stops) grad.addColorStop(Math.max(0, Math.min(1, t)), col);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return finalize(canvas, { srgb });
}

/**
 * Paneled metal hull albedo: base hull color, paneling with seams, weld lines, rivets, a few
 * accent-painted panels and a faint procedural wear/dirt pass. Reads great under MeshStandard.
 * opts: { size, seed, hull, accent, panelCount, wear }
 */
export function makeHullPanelTexture(opts = {}) {
  const {
    size = 256, seed = 11, hull = '#8893a6', accent = '#39d0ff', panelCount = 12, wear = 0.5,
  } = opts;
  const rnd = mulberry32(seed);
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const base = new THREE.Color(hull);

  // base fill with a subtle vertical sheen
  const g = ctx.createLinearGradient(0, 0, 0, size);
  const top = base.clone().multiplyScalar(1.18);
  const bot = base.clone().multiplyScalar(0.78);
  g.addColorStop(0, '#' + top.getHexString());
  g.addColorStop(0.5, '#' + base.getHexString());
  g.addColorStop(1, '#' + bot.getHexString());
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);

  // panel plates of slightly varied shade
  const cols = Math.max(2, Math.round(Math.sqrt(panelCount)));
  const cw = size / cols;
  for (let cx = 0; cx < cols; cx++) {
    for (let cy = 0; cy < cols; cy++) {
      const jitter = 0.86 + rnd() * 0.30;
      const c = base.clone().multiplyScalar(jitter);
      ctx.fillStyle = '#' + c.getHexString();
      const px = cx * cw, py = cy * cw;
      const inset = cw * 0.06;
      ctx.fillRect(px + inset, py + inset, cw - inset * 2, cw - inset * 2);
    }
  }

  // seam lines (darker) + highlight edge for depth
  ctx.lineWidth = Math.max(1, size / 256);
  for (let i = 0; i <= cols; i++) {
    const p = Math.round(i * cw);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath(); ctx.moveTo(p + 1, 0); ctx.lineTo(p + 1, size); ctx.stroke();
  }

  // a couple of accent-painted panels (faction color)
  const accentPanels = 1 + Math.floor(rnd() * 2);
  for (let i = 0; i < accentPanels; i++) {
    const cx = Math.floor(rnd() * cols), cy = Math.floor(rnd() * cols);
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.5 + rnd() * 0.3;
    const px = cx * cw, py = cy * cw, inset = cw * 0.18;
    ctx.fillRect(px + inset, py + inset, cw - inset * 2, cw - inset * 2);
    ctx.globalAlpha = 1;
  }

  // rivets along seams
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  for (let i = 0; i <= cols; i++) {
    for (let j = 0; j < size; j += Math.max(6, cw / 4)) {
      const p = Math.round(i * cw);
      ctx.beginPath(); ctx.arc(p, j, Math.max(0.8, size / 320), 0, Math.PI * 2); ctx.fill();
    }
  }

  // wear / grime pass: scattered translucent dark blotches
  if (wear > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    const blotches = Math.round(40 * wear);
    for (let i = 0; i < blotches; i++) {
      ctx.globalAlpha = (0.06 + rnd() * 0.14) * wear;
      const x = rnd() * size, y = rnd() * size, r = (0.02 + rnd() * 0.08) * size;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  return finalize(canvas, { srgb: true });
}

/**
 * Soft radial glow sprite (white core → transparent edge). Used for stars, engine glow, halos
 * and blinking nav lights. opts: { size, color, core, falloff }
 */
export function makeStarTexture(opts = {}) {
  const { size = 128, color = '#ffffff', core = 0.0, falloff = 1.0 } = opts;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const c = new THREE.Color(color);
  const r = Math.floor(c.r * 255), g = Math.floor(c.g * 255), b = Math.floor(c.b * 255);
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(255,255,255,1)`);
  grad.addColorStop(Math.min(0.5, 0.12 + core), `rgba(${r},${g},${b},0.95)`);
  grad.addColorStop(Math.min(0.95, 0.5 + 0.4 * falloff), `rgba(${r},${g},${b},0.18)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Tangent-space NORMAL map for a paneled hull: flat plates with beveled seam grooves between them
 * and a gentle convex bow across each plate. Sampled by MeshStandardMaterial.normalMap so the hull
 * catches the scene's key/rim/fill directional lights instead of reading as flat shading. Output is
 * linear (no sRGB encode) — normal maps must stay linear.
 * opts: { size, seed, panelCount, bevel }   bevel = groove depth strength (0..1, ~0.5 default)
 */
export function makeHullNormalMap(opts = {}) {
  const { size = 256, seed = 23, panelCount = 12, bevel = 0.5 } = opts;
  const rnd = mulberry32(seed);
  const cols = Math.max(2, Math.round(Math.sqrt(panelCount)));
  const cw = size / cols;

  // Build a height field: each plate sits at +bow near its center, drops to 0 in the seam grooves.
  // Groove width as a fraction of cell; bow amplitude scales with bevel.
  const groove = cw * 0.10;
  const bow = bevel * 14; // height units
  const half = size / 2;
  const field = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // distance from nearest seam line (in cell space)
      const fx = x / cw, fy = y / cw;
      const lx = fx - Math.floor(fx), ly = fy - Math.floor(fy);
      const dx = Math.min(lx, 1 - lx) * cw; // px from nearest vertical seam
      const dy = Math.min(ly, 1 - ly) * cw; // px from nearest horizontal seam
      let h = 0;
      if (dx > groove && dy > groove) {
        // inside a plate: gentle convex bow, peak at plate center, slight per-plate jitter
        const px = lx - 0.5, py = ly - 0.5;
        const plateJitter = (rnd() - 0.5) * bow * 0.15; // deterministic-ish via row stepping
        h = bow * (1 - (px * px + py * py) * 2.2) + plateJitter;
      }
      field[y * size + x] = h;
    }
  }
  // derive normal from height gradient (Sobel-ish), encode to [0,1] RGB (tangent space: +Z out)
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const at = (x, y) => field[((y + size) % size) * size + ((x + size) % size)];
  const strength = 1.0 + bevel * 1.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x - 1, y) - at(x + 1, y)) * strength;
      const dy = (at(x, y - 1) - at(x, y + 1)) * strength;
      const nx = dx, ny = dy, nz = 18; // normal before normalize; nz tunes flatness
      const len = Math.hypot(nx, ny, nz) || 1;
      const k = (y * size + x) * 4;
      img.data[k] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[k + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[k + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finalize(canvas, { srgb: false });
}

/**
 * Second-frequency greeble detail: fine vents, access hatches, cable runs and small warning plates
 * scattered over a transparent base. Designed as an OVERLAY (transparent where there's no detail)
 * layered via a second decal mesh on top of the primary hull greeble, so close-up hulls read as
 * densely detailed without re-baking the whole surface. opts: { size, seed, density, accent }
 */
export function makeGreebleDetailTexture(opts = {}) {
  const { size = 256, seed = 51, density = 1.0, accent = '#6a7488' } = opts;
  const rnd = mulberry32(seed);
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size); // transparent base

  // fine vent slats (small horizontal grille clusters)
  const vents = Math.round(10 * density);
  for (let i = 0; i < vents; i++) {
    const w = (0.05 + rnd() * 0.10) * size, h = (0.03 + rnd() * 0.05) * size;
    const x = rnd() * (size - w), y = rnd() * (size - h);
    ctx.fillStyle = 'rgba(20,24,32,0.85)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(10,14,20,0.9)'; ctx.lineWidth = 1;
    const slats = 3 + Math.floor(rnd() * 4);
    for (let s = 1; s < slats; s++) { const sy = y + (s / slats) * h; ctx.beginPath(); ctx.moveTo(x, sy); ctx.lineTo(x + w, sy); ctx.stroke(); }
  }
  // small access hatches (square with a handle dot)
  const hatches = Math.round(8 * density);
  for (let i = 0; i < hatches; i++) {
    const s = (0.04 + rnd() * 0.06) * size;
    const x = rnd() * (size - s), y = rnd() * (size - s);
    ctx.fillStyle = 'rgba(40,46,58,0.8)'; ctx.fillRect(x, y, s, s);
    ctx.strokeStyle = 'rgba(8,12,18,0.9)'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, s, s);
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(x + s * 0.5, y + s * 0.78, s * 0.10, 0, Math.PI * 2); ctx.fill();
  }
  // cable runs (thin slightly-curving lines)
  ctx.strokeStyle = 'rgba(60,66,78,0.7)'; ctx.lineWidth = Math.max(1, size / 256);
  const cables = Math.round(6 * density);
  for (let i = 0; i < cables; i++) {
    const x0 = rnd() * size, y0 = rnd() * size;
    ctx.beginPath(); ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(x0 + (rnd() - 0.5) * size * 0.3, y0 + rnd() * size * 0.3,
                      x0 + (rnd() - 0.5) * size * 0.3, y0 + rnd() * size * 0.3,
                      x0 + (rnd() - 0.5) * size * 0.4, y0 + size * (0.1 + rnd() * 0.2));
    ctx.stroke();
  }
  return finalize(canvas, { srgb: true });
}

/**
 * A transparent DECAL sheet for hull markings: faction racing stripes, hazard chevrons and small
 * warning triangles. Used as an overlay decal so liveries/identifiers sit on the hull without
 * rebaking the base plating. Pick which decals via opts.include. opts:
 *   { size, accent, stripe=true, chevron=true, warning=true, seed }
 */
export function makeDecalSheet(opts = {}) {
  const { size = 256, accent = '#39d0ff', stripe = true, chevron = true, warning = true, seed = 7 } = opts;
  const rnd = mulberry32(seed);
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  if (stripe) {
    // two angled faction stripes across the upper third
    ctx.save();
    ctx.translate(size * 0.5, size * 0.3);
    ctx.rotate(-0.25);
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(-size * 0.6, -size * 0.03, size * 1.2, size * 0.035);
    ctx.globalAlpha = 0.5;
    ctx.fillRect(-size * 0.6, size * 0.01, size * 1.2, size * 0.02);
    ctx.restore();
  }
  if (chevron) {
    // a hazard chevron band near the lower edge
    ctx.save();
    ctx.globalAlpha = 0.8;
    const bandY = size * 0.72, bandH = size * 0.08;
    for (let x = -size; x < size * 2; x += bandH * 2) {
      ctx.fillStyle = '#3a3a2a';
      ctx.beginPath();
      ctx.moveTo(x, bandY); ctx.lineTo(x + bandH, bandY); ctx.lineTo(x + bandH * 2, bandY + bandH);
      ctx.lineTo(x + bandH, bandY + bandH); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d8c24a';
      ctx.beginPath();
      ctx.moveTo(x + bandH, bandY); ctx.lineTo(x + bandH * 2, bandY); ctx.lineTo(x + bandH * 3, bandY + bandH);
      ctx.lineTo(x + bandH * 2, bandY + bandH); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  if (warning) {
    // a few small warning triangles with a "!" — placed at deterministic spots
    const spots = [[0.18, 0.55], [0.78, 0.45], [0.5, 0.88]];
    for (const [fx, fy] of spots) {
      const cx = fx * size, cy = fy * size, r = size * 0.035;
      ctx.fillStyle = '#e0b020';
      ctx.beginPath();
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * 0.9, cy + r * 0.75); ctx.lineTo(cx - r * 0.9, cy + r * 0.75);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1a1404';
      ctx.fillRect(cx - r * 0.08, cy - r * 0.35, r * 0.16, r * 0.7);
      ctx.beginPath(); ctx.arc(cx, cy + r * 0.5, r * 0.1, 0, Math.PI * 2); ctx.fill();
    }
  }
  // a tiny ID stencil block so ships read as individually marked craft
  ctx.fillStyle = 'rgba(180,190,205,0.55)';
  ctx.font = `${Math.round(size * 0.05)}px monospace`;
  ctx.fillText('SF-' + (1000 + Math.floor(rnd() * 8999)), size * 0.06, size * 0.96);
  return finalize(canvas, { srgb: true });
}

/**
 * GRIME layer — oil streaks, rust blooms, soot, dust, and water-stain runs. Transparent overlay so
 * it darkens/weather-ops the hull beneath without re-baking the base plating. intensity 0..1 scales
 * how filthy the hull reads. This is the core of the "dirty outlaw vs clean authority" contrast.
 */
export function makeGrimeTexture(opts = {}) {
  const { size = 256, seed = 13, intensity = 0.5 } = opts;
  const rnd = mulberry32(seed);
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  // rust blooms (mottled orange-brown patches) — more on high-intensity (filthy) hulls
  const rustCount = Math.round((4 + intensity * 10));
  for (let i = 0; i < rustCount; i++) {
    const cx = rnd() * size, cy = rnd() * size, r = (0.04 + rnd() * 0.10) * size;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    const rustAlpha = 0.25 + intensity * 0.35;
    grad.addColorStop(0, `rgba(110,60,25,${rustAlpha})`);
    grad.addColorStop(0.6, `rgba(80,45,20,${rustAlpha * 0.5})`);
    grad.addColorStop(1, 'rgba(80,45,20,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  }
  // soot/smoke blackening near vents and the rear (engines belch)
  for (let i = 0; i < Math.round(intensity * 6); i++) {
    const cx = rnd() * size, cy = rnd() * size, r = (0.06 + rnd() * 0.12) * size;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, `rgba(10,10,12,${0.35 * intensity})`);
    grad.addColorStop(1, 'rgba(10,10,12,0)');
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  }
  // oil streaks — vertical runs from a source point (gravity-dripped oil)
  ctx.strokeStyle = `rgba(20,18,16,${0.3 + intensity * 0.3})`;
  ctx.lineWidth = Math.max(1, size / 200);
  for (let i = 0; i < Math.round(intensity * 8); i++) {
    const x = rnd() * size, y0 = rnd() * size * 0.7, len = (0.1 + rnd() * 0.25) * size;
    ctx.beginPath(); ctx.moveTo(x, y0);
    ctx.lineTo(x + (rnd() - 0.5) * size * 0.05, y0 + len);
    ctx.stroke();
    // a dab at the top (the leak source)
    ctx.fillStyle = `rgba(15,13,12,${0.4 * intensity})`;
    ctx.beginPath(); ctx.arc(x, y0, size * 0.012, 0, Math.PI * 2); ctx.fill();
  }
  // fine dust haze — a near-uniform low-alpha brown wash for the dull, sun-baked look
  ctx.fillStyle = `rgba(60,52,40,${intensity * 0.08})`;
  ctx.fillRect(0, 0, size, size);
  return finalize(canvas, { srgb: true });
}

/**
 * REPAIR PATCHES — bolted-on welded plates over old battle damage. Distinct rectangular plates with
 * visible bolt heads, drawn slightly off-axis from the hull plating so they read as later additions.
 * density 0..1 controls how patchy/scarred the hull is. Transparent overlay.
 */
export function makePatchTexture(opts = {}) {
  const { size = 256, seed = 29, density = 0.3 } = opts;
  const rnd = mulberry32(seed);
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const count = Math.round(density * 7);
  for (let i = 0; i < count; i++) {
    const w = (0.08 + rnd() * 0.12) * size, h = (0.06 + rnd() * 0.10) * size;
    const x = rnd() * (size - w), y = rnd() * (size - h);
    const rot = (rnd() - 0.5) * 0.4;
    ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(rot);
    // plate body — slightly different metal tone than the hull (a welded-on repair)
    ctx.fillStyle = 'rgba(55,58,66,0.9)';
    ctx.fillRect(-w / 2, -h / 2, w, h);
    // weld bead around the edge
    ctx.strokeStyle = 'rgba(28,30,34,0.95)'; ctx.lineWidth = Math.max(1, size / 220);
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    // bolt heads at the corners
    ctx.fillStyle = 'rgba(18,20,24,0.95)';
    for (const [bx, by] of [[-w/2+3,-h/2+3],[w/2-3,-h/2+3],[-w/2+3,h/2-3],[w/2-3,h/2-3]]) {
      ctx.beginPath(); ctx.arc(bx, by, Math.max(1.2, size/240), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  return finalize(canvas, { srgb: true });
}

/**
 * NOSE-ART decal — the personality of the ship. Three styles:
 *   'bomber' — WW2/Vietnam bomber look: a toothed shark mouth on the nose, a stencil motto near the
 *              cockpit, and a mascot/ghost glyph. Dark-humor "death-ship" vibe.
 *   'punk'   — cyberpunk tags: spray-paint drips, stencil band logos, anarchy marks, neon scratch.
 *   'insignia'— clean authority: a crisp faction crest + designation stripe. Pristine.
 * Returns a transparent decal sized for a flank panel. motto/mascot/tally customize the bomber look.
 */
export function makeNoseArtTexture(opts = {}) {
  const { size = 256, seed = 7, style = 'bomber', accent = '#39d0ff',
    motto = 'BORROWED TIME', mascot = 'ghost', tally = 13 } = opts;
  const rnd = mulberry32(seed);
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  if (style === 'bomber') {
    // SHARK MOUTH — a jagged red maw with white teeth, the Flying Tigers / bomber-nose classic
    const mx = size * 0.5, my = size * 0.38, mw = size * 0.42, mh = size * 0.20;
    ctx.save(); ctx.translate(mx, my);
    // mouth outline (dark red)
    ctx.fillStyle = '#7a1018';
    ctx.beginPath();
    ctx.moveTo(-mw / 2, 0);
    ctx.quadraticCurveTo(0, mh * 0.9, mw / 2, 0);                 // lower jaw
    ctx.quadraticCurveTo(0, -mh * 0.5, -mw / 2, 0);               // upper lip
    ctx.fill();
    // teeth (white triangles along both lips)
    ctx.fillStyle = '#e8e4d8';
    const teeth = 9;
    for (let i = 0; i < teeth; i++) {
      const t = i / (teeth - 1);
      const tx = -mw / 2 + t * mw;
      // upper teeth point down
      const uy = -mh * 0.18 + Math.sin(t * Math.PI) * mh * 0.05;
      ctx.beginPath(); ctx.moveTo(tx - mw / teeth * 0.3, uy); ctx.lineTo(tx + mw / teeth * 0.3, uy);
      ctx.lineTo(tx, uy + mh * 0.32); ctx.closePath(); ctx.fill();
      // lower teeth point up (offset)
      const ly = mh * 0.35 - Math.sin(t * Math.PI) * mh * 0.05;
      ctx.beginPath(); ctx.moveTo(tx - mw / teeth * 0.3, ly); ctx.lineTo(tx + mw / teeth * 0.3, ly);
      ctx.lineTo(tx, ly - mh * 0.28); ctx.closePath(); ctx.fill();
    }
    // beady eye above the mouth (menacing)
    ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(-mw * 0.3, -mh * 0.55, size * 0.018, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(-mw * 0.3, -mh * 0.55, size * 0.008, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // MOTTO stencil (the ship's dark-humor name)
    ctx.fillStyle = 'rgba(225,225,220,0.92)';
    ctx.font = `bold ${Math.round(size * 0.075)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(motto, size * 0.5, size * 0.68);

    // KILL TALLY — bomb/round marks beneath the cockpit (veteran of many fights)
    const cols = Math.min(tally, 13);
    for (let i = 0; i < cols; i++) {
      const bx = size * 0.5 + (i - (cols - 1) / 2) * size * 0.045;
      const by = size * 0.82;
      ctx.fillStyle = 'rgba(200,200,195,0.85)';
      ctx.beginPath(); ctx.arc(bx, by, size * 0.014, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(200,200,195,0.85)'; ctx.lineWidth = Math.max(1, size / 256);
      ctx.beginPath(); ctx.moveTo(bx, by - size * 0.014); ctx.lineTo(bx, by - size * 0.04); ctx.stroke();
    }

    // MASCOT glyph — a small ghost/sketch by the motto (the "haunted" ship's mascot)
    if (mascot === 'ghost') {
      const gx = size * 0.18, gy = size * 0.62, gr = size * 0.05;
      ctx.fillStyle = 'rgba(210,210,225,0.8)';
      ctx.beginPath(); ctx.arc(gx, gy, gr, Math.PI, 0); ctx.lineTo(gx + gr, gy + gr);    // ghost body
      ctx.lineTo(gx + gr * 0.66, gy + gr * 0.8); ctx.lineTo(gx + gr * 0.33, gy + gr);
      ctx.lineTo(gx, gy + gr * 0.8); ctx.lineTo(gx - gr * 0.33, gy + gr);
      ctx.lineTo(gx - gr * 0.66, gy + gr * 0.8); ctx.lineTo(gx - gr, gy + gr);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(20,20,30,0.9)';                                           // eyes
      ctx.beginPath(); ctx.arc(gx - gr * 0.35, gy, gr * 0.12, 0, Math.PI * 2);
      ctx.arc(gx + gr * 0.35, gy, gr * 0.12, 0, Math.PI * 2); ctx.fill();
    }
  } else if (style === 'punk') {
    // SPRAY-PAINT TAGS — neon stencil scrawls with drip runs, anarchy marks, scratch lettering
    ctx.save();
    // a big spray-painted tag band
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.75;
    ctx.font = `italic bold ${Math.round(size * 0.13)}px sans-serif`;
    ctx.textAlign = 'center';
    const tags = ['NO FUTURE', 'RUST', '404', 'FREE', 'VOID'];
    ctx.fillText(tags[Math.floor(rnd() * tags.length)], size * 0.5, size * 0.45);
    ctx.globalAlpha = 1;
    // drip runs under the tag
    ctx.strokeStyle = accent; ctx.lineWidth = Math.max(1, size / 200);
    for (let i = 0; i < 6; i++) {
      const x = size * (0.2 + rnd() * 0.6), y0 = size * 0.5, len = (0.05 + rnd() * 0.2) * size;
      ctx.globalAlpha = 0.5 + rnd() * 0.4;
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + len); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y0 + len, size * 0.01, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // anarchy circle-A
    const ax = size * 0.78, ay = size * 0.72, ar = size * 0.06;
    ctx.strokeStyle = 'rgba(230,230,230,0.85)'; ctx.lineWidth = Math.max(1.5, size / 170);
    ctx.beginPath(); ctx.arc(ax, ay, ar, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ax - ar, ay); ctx.lineTo(ax + ar, ay); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ax, ay - ar * 0.9); ctx.lineTo(ax, ay + ar * 0.9); ctx.stroke();
    ctx.restore();
  } else { // insignia — clean authority crest
    ctx.save();
    // crisp diamond crest
    ctx.fillStyle = accent; ctx.globalAlpha = 0.9;
    const cx = size * 0.5, cy = size * 0.45, cr = size * 0.16;
    ctx.beginPath();
    ctx.moveTo(cx, cy - cr); ctx.lineTo(cx + cr, cy); ctx.lineTo(cx, cy + cr); ctx.lineTo(cx - cr, cy);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    // inner ring
    ctx.strokeStyle = 'rgba(235,238,245,0.95)'; ctx.lineWidth = Math.max(1.5, size / 150);
    ctx.beginPath(); ctx.arc(cx, cy, cr * 0.55, 0, Math.PI * 2); ctx.stroke();
    // designation stripe (clean, orderly)
    ctx.fillStyle = 'rgba(235,238,245,0.9)';
    ctx.fillRect(size * 0.2, size * 0.72, size * 0.6, size * 0.05);
    ctx.fillStyle = 'rgba(20,30,50,0.9)';
    ctx.font = `bold ${Math.round(size * 0.045)}px monospace`; ctx.textAlign = 'center';
    ctx.fillText('AUTHORITY', size * 0.5, size * 0.76);
    ctx.restore();
  }
  return finalize(canvas, { srgb: true });
}
