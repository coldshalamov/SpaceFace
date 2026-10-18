// Hull stencils: spray tags, registry stencils, yard hazard marks — a macro map sampled in
// hull space, the sanctioned "placed deliberately on the deck" decal form (FORGE.md rule 6).
//
// One shared canvas sheet per decal style, drawn in code (seeded, deterministic; words are set
// in code from real fonts — never generated lettering). The sheet is drawn in NORMALIZED HULL
// SPACE: +u toward the nose, +v across the beam, aspect-corrected in the shader so a mark drawn
// round lands round. The illustrated-surface hook samples it once on top-facing surfaces and
// mixes the mark colour over the paint — no new draws, one texture fetch for hulls that wear a
// decal, and a shared 1x1 fallback keeps every other program identical.
import {
  CanvasTexture, ClampToEdgeWrapping, DataTexture, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace,
} from 'three';

const SHEET = 1024;
// The beam only spans size.z/spanMax of the sheet on a typical hull, so every mark stays inside
// this central band; marks drawn outside it would exist only on absurdly wide hulls.
const V_BAND = [0.30, 0.70];

// Matches SHIP_DECALS in src/core/shipAppearance.js (minus 'none', which draws nothing).
export const STENCIL_STYLE_IDS = Object.freeze(['borrowed_time', 'concord', 'industrial', 'frontier']);

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const px = (v) => v * SHEET;

function cutThrough(ctx) {
  ctx.globalCompositeOperation = 'destination-out';
}
function paintOver(ctx) {
  ctx.globalCompositeOperation = 'source-over';
}

/** Classic stencil bridges: two thin slots punched across a word's cap band. */
function bridgeCut(ctx, x, y, w, capPx, rng) {
  cutThrough(ctx);
  ctx.globalAlpha = 1;
  const slot = Math.max(2, capPx * 0.055);
  for (const at of [0.34, 0.62]) {
    ctx.fillRect(x - w * 0.02, y - capPx + capPx * at, w * 1.04, slot);
  }
  // A few seeded bites out of the letter edges so paint reads sprayed by hand, not plotted.
  const bites = Math.max(3, Math.round(w / 90));
  for (let i = 0; i < bites; i++) {
    const bx = x + rng() * w, by = y - rng() * capPx;
    ctx.beginPath();
    ctx.arc(bx, by, slot * (0.4 + rng() * 0.9), 0, Math.PI * 2);
    ctx.fill();
  }
  paintOver(ctx);
}

/** Wear: seeded speck bites anywhere inside a mark's box. */
function chip(ctx, x, y, w, h, count, rng) {
  cutThrough(ctx);
  ctx.globalAlpha = 1;
  for (let i = 0; i < count; i++) {
    const cx = x + rng() * w, cy = y + rng() * h;
    const r = 1 + rng() * (SHEET * 0.004);
    ctx.beginPath();
    if (rng() < 0.5) ctx.arc(cx, cy, r, 0, Math.PI * 2);
    else ctx.rect(cx, cy, r * (1 + rng() * 3), r * 0.7);
    ctx.fill();
  }
  paintOver(ctx);
}

/** One gravity drip from a mark's lower edge. */
function drip(ctx, x, y, length, width, color, alpha) {
  paintOver(ctx);
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.fillRect(x - width / 2, y, width, length * 0.7);
  ctx.beginPath();
  ctx.arc(x, y + length * 0.7, width * 0.72, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y + length, width * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** Stencil lettering set in code: fill, punch the bridges, optional spray halo underneath. */
function stencilText(ctx, str, u, v, capPx, {
  color, alpha = 1, rotation = 0, halo = 0, weight = 'bold', spacing = null, align = 'left',
}) {
  const x = px(u), y = px(v);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.font = `${weight} ${Math.round(capPx)}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  if (spacing != null && 'letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(capPx * spacing)}px`;
  const w = ctx.measureText(str).width;
  if (halo > 0) {
    ctx.save();
    ctx.filter = `blur(${Math.round(capPx * 0.16)}px)`;
    ctx.globalAlpha = halo * alpha;
    ctx.fillStyle = color;
    ctx.fillText(str, 0, 0);
    ctx.restore();
  }
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillText(str, 0, 0);
  ctx.globalAlpha = 1;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  const left = align === 'center' ? -w / 2 : (align === 'right' ? -w : 0);
  bridgeCut(ctx, left, 0, w, capPx, mulberry32((str.length * 7919 + Math.round(x * 13 + y * 7)) >>> 0));
  ctx.restore();
  return { x, y, w };
}

/** Rough hand stroke: a wobbly polyline with round caps. */
function handStroke(ctx, points, width, color, alpha, rng, wobble = 3) {
  paintOver(ctx);
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  points.forEach(([u, v], i) => {
    const x = px(u) + (rng() - 0.5) * wobble, y = px(v) + (rng() - 0.5) * wobble;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function killTally(ctx, u, v, count, color, rng, alpha = 0.92) {
  const step = 0.013, height = 0.028;
  for (let i = 0; i < count; i++) {
    const group = Math.floor(i / 5);
    const inGroup = i % 5;
    const x = u + group * (step * 6.4) + inGroup * step;
    const tilt = (rng() - 0.5) * 0.35;
    handStroke(ctx, [[x, v + height], [x + tilt * 0.2, v]], SHEET * 0.006, color, alpha, rng, 2);
  }
  // The closing slash across each complete group of five.
  for (let g = 0; g < Math.floor(count / 5); g++) {
    const x0 = u + g * (step * 6.4) - step * 0.6;
    handStroke(ctx, [[x0, v + height * 1.1], [x0 + step * 5.6, v - height * 0.1]],
      SHEET * 0.005, color, alpha, rng, 2);
  }
}

function roundel(ctx, u, v, r, ringColor, barColor, alpha = 0.95) {
  paintOver(ctx);
  const x = px(u), y = px(v), R = px(r);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = R * 0.2;
  ctx.beginPath(); ctx.arc(x, y, R * 0.82, 0, Math.PI * 2); ctx.stroke();
  // A single thin service bar through the ring — the inspection mark auditors chalk on docks.
  ctx.fillStyle = barColor;
  ctx.fillRect(x - R, y - R * 0.09, R * 2, R * 0.18);
  ctx.globalAlpha = 1;
}

function noStepChevrons(ctx, u, v, count, size, color, alpha = 0.9) {
  paintOver(ctx);
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = SHEET * 0.006;
  ctx.lineCap = 'square';
  const x0 = px(u), y = px(v), w = px(size), h = px(size * 0.62);
  for (let i = 0; i < count; i++) {
    const x = x0 + i * w * 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y + h / 2);
    ctx.lineTo(x + w / 2, y - h / 2);
    ctx.lineTo(x + w, y + h / 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// -------------------------------------------------------------------------------------------------
// The styles. Each draws its whole sheet into one canvas in hull-space coordinates.
// -------------------------------------------------------------------------------------------------

/** The Hitch's own mark: a punk spray tag, a ghost mascot, and thirteen tally strokes. */
function drawBorrowedTime(ctx, rng) {
  const orange = '#e06428', bone = '#e8e2d2', teal = '#53aaa3';
  // Spray halo first, then the crisp pass — a tag that sits ON the hull, not plotted on it.
  const tag = stencilText(ctx, 'B.T.', 0.16, 0.60, SHEET * 0.115, {
    color: orange, alpha: 0.96, rotation: -0.10, halo: 0.35, spacing: 0.04,
  });
  drip(ctx, tag.x + tag.w * 0.28, px(0.60) + SHEET * 0.008, SHEET * 0.055, SHEET * 0.009, orange, 0.8);
  drip(ctx, tag.x + tag.w * 0.74, px(0.60) + SHEET * 0.008, SHEET * 0.034, SHEET * 0.007, orange, 0.66);
  // The ghost: rounded crown, waving skirt, two hollow eyes — the mascot rides toward the nose.
  const gx = px(0.585), gy = px(0.47), gw = px(0.075), gh = px(0.10);
  paintOver(ctx);
  ctx.save();
  ctx.translate(gx, gy);
  ctx.rotate(0.06);
  ctx.fillStyle = bone;
  ctx.globalAlpha = 0.94;
  ctx.beginPath();
  ctx.arc(0, -gh * 0.18, gw * 0.5, Math.PI, 0);
  const skirt = 4;
  for (let i = 0; i <= skirt; i++) {
    const t = i / skirt;
    ctx.lineTo(gw * 0.5 - t * gw, gh * (0.42 + 0.16 * Math.sin(t * Math.PI * skirt * 0.5)));
  }
  ctx.closePath();
  ctx.fill();
  cutThrough(ctx);
  for (const ex of [-gw * 0.2, gw * 0.2]) {
    ctx.beginPath();
    ctx.ellipse(ex, -gh * 0.2, gw * 0.09, gh * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  paintOver(ctx);
  ctx.strokeStyle = teal;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = SHEET * 0.0035;
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;
  // Thirteen tally strokes — the boat has a history. (PLAYER_NOSE_ART tally: 13.)
  killTally(ctx, 0.335, 0.445, 13, bone, rng);
  chip(ctx, px(0.13), px(0.47), px(0.24), px(0.17), 26, rng);
}

/** Concord patrol registry: crisp white serials, an inspection roundel, no-step chevrons. */
function drawConcord(ctx, rng) {
  const white = '#dde2e6', slate = '#8fa4b8';
  stencilText(ctx, 'CC-207', 0.24, 0.50, SHEET * 0.075, { color: white, alpha: 0.95, spacing: 0.10 });
  stencilText(ctx, 'PTRL·7', 0.245, 0.575, SHEET * 0.034, { color: slate, alpha: 0.85, spacing: 0.22, weight: '600' });
  roundel(ctx, 0.62, 0.47, 0.036, white, slate);
  noStepChevrons(ctx, 0.115, 0.53, 3, 0.028, white);
  stencilText(ctx, 'INS 4412', 0.47, 0.615, SHEET * 0.024, { color: white, alpha: 0.72, spacing: 0.18, weight: '600' });
  chip(ctx, px(0.22), px(0.41), px(0.2), px(0.17), 14, rng);
  chip(ctx, px(0.56), px(0.41), px(0.13), px(0.13), 8, rng);
}

/** Work fleet: safety-yellow yard serial, lift-point targets, hazard glyph. */
function drawIndustrial(ctx, rng) {
  const yellow = '#d8a018', ink = '#1a1c20', white = '#e8e5da';
  stencilText(ctx, 'HL-09', 0.22, 0.52, SHEET * 0.095, { color: yellow, alpha: 0.96, spacing: 0.06 });
  // Lift points: corner brackets around a dot, the mark a crane operator looks for.
  const lift = (u, v) => {
    const x = px(u), y = px(v), s = px(0.026);
    paintOver(ctx);
    ctx.strokeStyle = white;
    ctx.globalAlpha = 0.92;
    ctx.lineWidth = SHEET * 0.0045;
    ctx.beginPath();
    for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ctx.moveTo(x + dx * s, y + dy * s * 0.45);
      ctx.lineTo(x + dx * s, y + dy * s);
      ctx.lineTo(x + dx * s * 0.45, y + dy * s);
    }
    ctx.stroke();
    ctx.fillStyle = white;
    ctx.beginPath(); ctx.arc(x, y, s * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    stencilText(ctx, 'SLING', u - 0.031, v + 0.048, SHEET * 0.018, { color: white, alpha: 0.7, spacing: 0.12, weight: '600' });
  };
  lift(0.545, 0.42);
  lift(0.545, 0.58);
  // Hazard triangle, open, so the hull reads through it.
  paintOver(ctx);
  ctx.strokeStyle = yellow;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = SHEET * 0.006;
  const tx = px(0.70), ty = px(0.50), tr = px(0.032);
  ctx.beginPath();
  ctx.moveTo(tx, ty - tr);
  ctx.lineTo(tx + tr * 0.9, ty + tr * 0.62);
  ctx.lineTo(tx - tr * 0.9, ty + tr * 0.62);
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = yellow;
  ctx.fillRect(tx - SHEET * 0.0025, ty - tr * 0.28, SHEET * 0.005, tr * 0.55);
  ctx.fillRect(tx - SHEET * 0.0025, ty + tr * 0.32, SHEET * 0.005, tr * 0.14);
  ctx.globalAlpha = 1;
  chip(ctx, px(0.2), px(0.42), px(0.22), px(0.16), 30, rng);
  chip(ctx, px(0.5), px(0.38), px(0.25), px(0.26), 18, rng);
}

/** Frontier hauler: a rough hand-painted star brand, a faded serial, route tallies. */
function drawFrontier(ctx, rng) {
  const rust = '#a44a30', faded = '#cfc8b4', bleach = '#7fa8a0';
  // The brand: a five-point star double-struck with hand wobble — claimed, not commissioned.
  const sx = px(0.30), sy = px(0.49), sr = px(0.052);
  const star = (r, alpha) => {
    paintOver(ctx);
    ctx.strokeStyle = rust;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = SHEET * 0.005;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 5; i++) {
      const a = -Math.PI / 2 + i * (Math.PI * 4 / 5);
      const x = sx + Math.cos(a) * r + (rng() - 0.5) * 4;
      const y = sy + Math.sin(a) * r + (rng() - 0.5) * 4;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  };
  star(sr, 0.85);
  star(sr * 0.72, 0.5);
  stencilText(ctx, 'RT-88', 0.46, 0.47, SHEET * 0.06, { color: faded, alpha: 0.78, spacing: 0.12 });
  handStroke(ctx, [[0.455, 0.495], [0.575, 0.505]], SHEET * 0.005, rust, 0.7, rng, 5);
  killTally(ctx, 0.60, 0.60, 8, bleach, rng, 0.75);
  chip(ctx, px(0.24), px(0.42), px(0.14), px(0.14), 34, rng);
  chip(ctx, px(0.44), px(0.42), px(0.15), px(0.08), 22, rng);
}

const STYLE_DRAWERS = {
  borrowed_time: { draw: drawBorrowedTime, seed: 0x5eed101, strength: 0.95 },
  concord: { draw: drawConcord, seed: 0xc0dc071, strength: 0.85 },
  industrial: { draw: drawIndustrial, seed: 0x1ad5711, strength: 0.9 },
  frontier: { draw: drawFrontier, seed: 0xf207e55, strength: 0.8 },
};

const sheets = new Map();
let fallbackTexture = null;

export function stencilFallbackTexture() {
  if (!fallbackTexture) {
    fallbackTexture = new DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    fallbackTexture.needsUpdate = true;
  }
  return fallbackTexture;
}

/** The shared sheet for one decal style, or null for 'none'/unknown. Lazily drawn once. */
export function stencilSheetFor(decalId) {
  const id = String(decalId || '');
  if (!STYLE_DRAWERS[id]) return null;
  let sheet = sheets.get(id);
  if (!sheet) {
    const canvas = typeof document !== 'undefined'
      ? document.createElement('canvas')
      : null;
    if (!canvas) return null;
    canvas.width = SHEET;
    canvas.height = SHEET;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, SHEET, SHEET);
    const spec = STYLE_DRAWERS[id];
    spec.draw(ctx, mulberry32(spec.seed));
    const texture = new CanvasTexture(canvas);
    texture.name = `sf-stencil-${id}`;
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.anisotropy = 4;
    texture.generateMipmaps = true;
    sheet = { texture, strength: spec.strength, id };
    sheets.set(id, sheet);
  }
  return sheet;
}

/** The per-material payload the illustrated-surface hook reads at compile time. `wear` fades a
 * decal the way it fades paint: a veteran hull's tag has been rock-sanded like the rest of it. */
export function stencilPayloadFor(decalId, bounds, wear = 0.2) {
  const sheet = stencilSheetFor(decalId);
  if (!sheet || !bounds || !Array.isArray(bounds.center) || !Array.isArray(bounds.size)) return null;
  const w = Math.min(1, Math.max(0, Number(wear) || 0));
  return {
    decalId: sheet.id,
    texture: sheet.texture,
    strength: sheet.strength * (1 - w * 0.30),
    center: bounds.center.slice(0, 3),
    size: bounds.size.slice(0, 3),
  };
}

/** Sampled inside the illustrated-surface colour block. Hull-space plan projection: the sheet
 * covers the larger horizontal span, marks land where the deck actually is. The v axis is
 * mirrored so the sheet's handedness matches the deck plane — drawn text then reads correct
 * (rotating with the hull) in every above-deck view instead of mirror-flipped. */
export const STENCIL_GLSL = /* glsl */`
  vec3 sfStP = (vSfHullPosition - sfStencilCenter) / max(sfStencilSize, vec3(0.001));
  vec3 sfStFace = cross(dFdx(vSfHullPosition), dFdy(vSfHullPosition));
  float sfStDeck = smoothstep(0.16, 0.65, abs(sfStFace.y) / max(length(sfStFace), 0.00001));
  float sfStSpan = max(sfStencilSize.x, sfStencilSize.z);
  vec2 sfStUv = vec2(sfStP.x * sfStencilSize.x / sfStSpan + 0.5,
    0.5 - sfStP.z * sfStencilSize.z / sfStSpan);
  vec4 sfStMark = texture2D(sfStencilMap, sfStUv);
  float sfStInk = sfStMark.a * sfStDeck * sfStencilStrength;
  diffuseColor.rgb = mix(diffuseColor.rgb, sfStMark.rgb, sfStInk);
`;
