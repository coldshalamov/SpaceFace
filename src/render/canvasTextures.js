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
