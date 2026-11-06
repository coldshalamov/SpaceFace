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
export const STENCIL_STYLE_IDS = Object.freeze([
  'borrowed_time', 'concord', 'industrial', 'frontier',
  'probate', 'addendum', 'heavy_is_honest', 'dead_schedule', 'gate_law',
]);

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
  if (capPx < 26) return; // Keep small technical stencils and labels legible
  cutThrough(ctx);
  ctx.globalAlpha = 1;
  const slot = Math.min(3, Math.max(1.5, capPx * 0.045));
  for (const at of [0.34, 0.62]) {
    ctx.fillRect(x - w * 0.02, y - capPx + capPx * at, w * 1.04, slot);
  }
  // A few seeded bites out of the letter edges so paint reads sprayed by hand, not plotted.
  const bites = Math.max(2, Math.round(w / 110));
  for (let i = 0; i < bites; i++) {
    const bx = x + rng() * w, by = y - rng() * capPx;
    ctx.beginPath();
    ctx.arc(bx, by, slot * (0.35 + rng() * 0.75), 0, Math.PI * 2);
    ctx.fill();
  }
  paintOver(ctx);
}

/** Wear: seeded speck bites and micro-scratches inside a mark's box. */
function chip(ctx, x, y, w, h, count, rng) {
  cutThrough(ctx);
  ctx.globalAlpha = 1;
  for (let i = 0; i < count; i++) {
    const cx = x + rng() * w, cy = y + rng() * h;
    const r = 1 + rng() * (SHEET * 0.0035);
    ctx.beginPath();
    const roll = rng();
    if (roll < 0.45) {
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
    } else if (roll < 0.8) {
      ctx.rect(cx, cy, r * (1 + rng() * 2.5), r * 0.7);
    } else {
      ctx.rect(cx - r * 1.8, cy, r * 3.6, 1.2);
    }
    ctx.fill();
  }
  paintOver(ctx);
}

/** Wear: a scrape dragged through a mark — the bite a docked hull takes from passing cargo. */
function scratch(ctx, x, y, w, count, rng) {
  cutThrough(ctx);
  ctx.globalAlpha = 0.8;
  for (let i = 0; i < count; i++) {
    const sx = x + rng() * w;
    const len = w * (0.06 + rng() * 0.16);
    ctx.lineWidth = 1 + rng() * 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, y + (rng() - 0.5) * 6);
    ctx.quadraticCurveTo(sx + len * 0.5, y + (rng() - 0.5) * 10, sx + len, y + (rng() - 0.5) * 6);
    ctx.stroke();
  }
  paintOver(ctx);
}

/** Slipstream or gravity paint drip from a mark. Default flows aft along flight axis (-dx). */
function drip(ctx, x, y, length, width, color, alpha, dirX = -1, dirY = 0.08) {
  paintOver(ctx);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  const len = length * 0.75;
  const ex = x + dirX * len, ey = y + dirY * len;
  ctx.lineWidth = width * 0.75;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(ex, ey, width * 0.75, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(ex + dirX * width * 0.5, ey + dirY * width * 0.5, width * 0.45, 0, Math.PI * 2);
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
    if (inGroup < 4) {
      const x = u + group * (step * 5.4) + inGroup * step;
      const tilt = (rng() - 0.5) * 0.35;
      handStroke(ctx, [[x, v + height], [x + tilt * 0.2, v]], SHEET * 0.0055, color, alpha, rng, 2);
    } else {
      const x0 = u + group * (step * 5.4) - step * 0.3;
      handStroke(ctx, [[x0, v + height * 1.1], [x0 + step * 3.8, v - height * 0.1]],
        SHEET * 0.005, color, alpha, rng, 2);
    }
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

function hazardStripes(ctx, u, v, w, h, stripeW, colorA, colorB, alpha = 0.92) {
  paintOver(ctx);
  const x = px(u), y = px(v), width = px(w), height = px(h), sW = px(stripeW);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.fillStyle = colorA;
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = colorB;
  ctx.globalAlpha = alpha;
  for (let pos = -height; pos < width + height; pos += sW * 2) {
    ctx.beginPath();
    ctx.moveTo(x + pos, y + height);
    ctx.lineTo(x + pos + sW, y + height);
    ctx.lineTo(x + pos + sW + height, y);
    ctx.lineTo(x + pos + height, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** The yard scale: beam, pivot, two pans — what the crane weighs, what the Cull weighs. */
function weighScale(ctx, u, v, r, color, alpha = 0.9) {
  paintOver(ctx);
  const x = px(u), y = px(v), R = px(r);
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = SHEET * 0.0038;
  ctx.lineCap = 'square';
  ctx.beginPath();
  ctx.moveTo(x - R, y);
  ctx.lineTo(x + R, y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - R * 0.42);
  ctx.lineTo(x + R * 0.17, y - R * 0.02);
  ctx.lineTo(x - R * 0.17, y - R * 0.02);
  ctx.closePath();
  ctx.stroke();
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + s * R, y);
    ctx.lineTo(x + s * R, y + R * 0.24);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + s * R - R * 0.19, y + R * 0.24);
    ctx.lineTo(x + s * R + R * 0.19, y + R * 0.24);
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
  // Hero lettering: DIE LAUGHING in bone stencil across the aft deck
  stencilText(ctx, 'DIE LAUGHING', 0.13, 0.44, SHEET * 0.038, {
    color: bone, alpha: 0.90, spacing: 0.14, weight: '700',
  });
  // Spray halo first, then the crisp pass — a tag that sits ON the hull, not plotted on it.
  const tag = stencilText(ctx, 'B.T.', 0.16, 0.60, SHEET * 0.115, {
    color: orange, alpha: 0.96, rotation: -0.10, halo: 0.35, spacing: 0.04,
  });
  drip(ctx, tag.x, px(0.60) + SHEET * 0.008, SHEET * 0.048, SHEET * 0.008, orange, 0.8, -1, 0.08);
  drip(ctx, tag.x + tag.w * 0.45, px(0.60) + SHEET * 0.008, SHEET * 0.032, SHEET * 0.007, orange, 0.66, -1, 0.12);
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
  chip(ctx, px(0.13), px(0.42), px(0.24), px(0.22), 26, rng);
}

/** Concord patrol registry: crisp white serials, an inspection roundel, no-step chevrons. */
function drawConcord(ctx, rng) {
  const white = '#dde2e6', slate = '#8fa4b8';
  stencilText(ctx, 'CC-207', 0.24, 0.50, SHEET * 0.075, { color: white, alpha: 0.95, spacing: 0.10 });
  stencilText(ctx, 'PTRL·7', 0.245, 0.575, SHEET * 0.034, { color: slate, alpha: 0.85, spacing: 0.22, weight: '600' });
  roundel(ctx, 0.62, 0.47, 0.036, white, slate);
  noStepChevrons(ctx, 0.115, 0.53, 3, 0.028, white);
  stencilText(ctx, 'NO STEP', 0.125, 0.575, SHEET * 0.018, { color: white, alpha: 0.80, spacing: 0.14, weight: '600' });
  stencilText(ctx, 'INS 4412', 0.47, 0.615, SHEET * 0.024, { color: white, alpha: 0.75, spacing: 0.18, weight: '600' });
  stencilText(ctx, 'ORDNANCE / ARM', 0.39, 0.415, SHEET * 0.020, { color: slate, alpha: 0.80, spacing: 0.12, weight: '600' });
  chip(ctx, px(0.22), px(0.41), px(0.2), px(0.17), 12, rng);
  chip(ctx, px(0.56), px(0.41), px(0.13), px(0.13), 8, rng);
}

/** Work fleet: safety-yellow yard serial, lift-point targets, hazard glyph. */
function drawIndustrial(ctx, rng) {
  const yellow = '#d8a018', ink = '#1a1c20', white = '#e8e5da';
  stencilText(ctx, 'HL-09', 0.22, 0.52, SHEET * 0.095, { color: yellow, alpha: 0.96, spacing: 0.06 });
  // Heavy hazard stripes block on aft shoulder
  hazardStripes(ctx, 0.14, 0.40, 0.065, 0.20, 0.012, ink, yellow, 0.94);
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
    stencilText(ctx, 'SLING', u - 0.031, v + 0.048, SHEET * 0.018, { color: white, alpha: 0.72, spacing: 0.12, weight: '600' });
  };
  lift(0.545, 0.42);
  lift(0.545, 0.58);
  stencilText(ctx, 'LH2 FILL 120B', 0.36, 0.585, SHEET * 0.018, { color: yellow, alpha: 0.85, spacing: 0.10, weight: '600' });
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
  chip(ctx, px(0.2), px(0.42), px(0.22), px(0.16), 26, rng);
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
  stencilText(ctx, 'MAX 120T', 0.20, 0.425, SHEET * 0.024, { color: faded, alpha: 0.75, spacing: 0.14, weight: '600' });
  stencilText(ctx, 'SALVAGE CLAIM #94', 0.38, 0.58, SHEET * 0.020, { color: rust, alpha: 0.82, spacing: 0.10, weight: '600' });
  handStroke(ctx, [[0.455, 0.495], [0.575, 0.505]], SHEET * 0.005, rust, 0.7, rng, 5);
  killTally(ctx, 0.60, 0.60, 8, bleach, rng, 0.75);
  chip(ctx, px(0.24), px(0.40), px(0.14), px(0.16), 30, rng);
  chip(ctx, px(0.44), px(0.40), px(0.15), px(0.10), 20, rng);
}

/** Meridian toll ledger: the double payment, stamped and filed, weighed to the gram. */
function drawProbate(ctx, rng) {
  const gold = '#c8a13c', bone = '#e8e2d2', slate = '#9a8f78';
  // Hero: the Syndicate's whole theology, set like a heading on a form.
  stencilText(ctx, 'EVERY MAN PAYS TWICE.', 0.13, 0.47, SHEET * 0.030, { color: bone, alpha: 0.92, spacing: 0.08 });
  stencilText(ctx, 'FIRST IN FLESH. THEN IN COIN.', 0.135, 0.525, SHEET * 0.017, { color: gold, alpha: 0.85, spacing: 0.16, weight: '600' });
  // Toll-paid stamp: double rule, a punch hole where the token went through, and the date line
  // the auditor never fills in.
  const bx = px(0.585), by = px(0.395), bw = px(0.20), bh = px(0.085);
  paintOver(ctx);
  ctx.strokeStyle = gold;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = SHEET * 0.004;
  ctx.strokeRect(bx, by, bw, bh);
  ctx.lineWidth = SHEET * 0.0015;
  ctx.strokeRect(bx + SHEET * 0.006, by + SHEET * 0.006, bw - SHEET * 0.012, bh - SHEET * 0.012);
  ctx.globalAlpha = 1;
  stencilText(ctx, 'TOLL PAID', 0.625, 0.448, SHEET * 0.024, { color: gold, alpha: 0.95, spacing: 0.06 });
  cutThrough(ctx);
  ctx.beginPath();
  ctx.arc(bx + bw - SHEET * 0.018, by + bh * 0.5, SHEET * 0.0065, 0, Math.PI * 2);
  ctx.fill();
  paintOver(ctx);
  noStepChevrons(ctx, 0.60, 0.585, 3, 0.022, gold, 0.8);
  weighScale(ctx, 0.40, 0.588, 0.038, gold);
  // The ledger line: entries of no fixed length, none of them yours.
  paintOver(ctx);
  ctx.fillStyle = slate;
  ctx.globalAlpha = 0.6;
  for (let i = 0; i < 7; i++) {
    ctx.fillRect(px(0.13 + i * 0.052), px(0.622), px(0.02 + rng() * 0.024), SHEET * 0.0022);
  }
  ctx.globalAlpha = 1;
  chip(ctx, px(0.13), px(0.42), px(0.22), px(0.18), 14, rng);
  scratch(ctx, px(0.585), px(0.438), px(0.2), 4, rng);
}

/** Vael contract plate: the terms are voluntary, the addendum is twelve pages, this is page 9. */
function drawAddendum(ctx, rng) {
  const pale = '#d8dce2', red = '#a03028';
  // The page number is the biggest mark on the deck. They told you which page. Nobody reads it.
  stencilText(ctx, '9', 0.17, 0.645, SHEET * 0.185, { color: pale, alpha: 0.26, spacing: 0, weight: '700' });
  // The contract box: double rule, the header the tags quote, and the fine print under it.
  const bx = px(0.42), by = px(0.395), bw = px(0.30), bh = px(0.135);
  paintOver(ctx);
  ctx.strokeStyle = pale;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = SHEET * 0.0032;
  ctx.strokeRect(bx, by, bw, bh);
  ctx.lineWidth = SHEET * 0.0012;
  ctx.strokeRect(bx + SHEET * 0.005, by + SHEET * 0.005, bw - SHEET * 0.01, bh - SHEET * 0.01);
  ctx.globalAlpha = 1;
  stencilText(ctx, 'VOLUNTARY', 0.47, 0.455, SHEET * 0.030, { color: pale, alpha: 0.95, spacing: 0.24, weight: '700' });
  stencilText(ctx, 'STANDARD TERMS', 0.472, 0.492, SHEET * 0.016, { color: pale, alpha: 0.8, spacing: 0.3, weight: '600' });
  // Fine print: page after page, every line a different length, all of it binding.
  paintOver(ctx);
  ctx.fillStyle = pale;
  ctx.globalAlpha = 0.5;
  for (let r = 0; r < 6; r++) {
    ctx.fillRect(px(0.428), px(0.51 + r * 0.0125), px(0.14 + rng() * 0.13), SHEET * 0.002);
  }
  ctx.globalAlpha = 1;
  // The second graffiti, smaller, below the first (canon: the Vael row).
  stencilText(ctx, 'THE ADDENDUM IS ON PAGE 9.', 0.42, 0.638, SHEET * 0.017, { color: red, alpha: 0.92, spacing: 0.12, weight: '700' });
  stencilText(ctx, 'READ PAGE 9.', 0.42, 0.668, SHEET * 0.017, { color: red, alpha: 0.92, spacing: 0.12, weight: '700' });
  handStroke(ctx, [[0.42, 0.678], [0.525, 0.68]], SHEET * 0.003, red, 0.8, rng, 2);
  // Someone scraped at the fine print once. The filing remains.
  scratch(ctx, px(0.43), px(0.53), px(0.26), 5, rng);
  chip(ctx, px(0.44), px(0.40), px(0.24), px(0.12), 8, rng);
}

/** Pitborn yard mark: the chant over the scale, and a tally nobody is allowed to paint over. */
function drawHeavyIsHonest(ctx, rng) {
  const orange = '#e06428', bone = '#e8e2d2';
  // The chant, sprayed with a halo and left to run — the yard boss's whole philosophy.
  const chant = stencilText(ctx, 'HEAVY IS HONEST.', 0.13, 0.615, SHEET * 0.05, {
    color: orange, alpha: 0.95, rotation: -0.045, halo: 0.4, spacing: 0.02, weight: '700',
  });
  drip(ctx, chant.x + chant.w * 0.3, px(0.615) + SHEET * 0.01, SHEET * 0.04, SHEET * 0.008, orange, 0.8, -1, 0.1);
  drip(ctx, chant.x + chant.w * 0.72, px(0.615) + SHEET * 0.01, SHEET * 0.028, SHEET * 0.007, orange, 0.66, -1, 0.06);
  // The scale: what the crane weighs, what the Cull weighs, what everything weighs.
  weighScale(ctx, 0.60, 0.445, 0.052, bone);
  // The tally and the superstition as small print — the one rule the yards enforce themselves.
  killTally(ctx, 0.70, 0.575, 17, bone, rng);
  stencilText(ctx, 'NEVER PAINT OVER A TALLY.', 0.635, 0.615, SHEET * 0.015, { color: bone, alpha: 0.75, spacing: 0.14, weight: '600' });
  hazardStripes(ctx, 0.14, 0.41, 0.055, 0.17, 0.011, '#1a1c20', orange, 0.94);
  chip(ctx, px(0.13), px(0.44), px(0.3), px(0.2), 26, rng);
  scratch(ctx, px(0.14), px(0.56), px(0.3), 5, rng);
}

/** Fulfillment routing plate: crisp corporate order over a company that only exists in filings. */
function drawDeadSchedule(ctx, rng) {
  const white = '#e6e9ee', cyan = '#3ec8d8';
  // The header box: the promise the hull still keeps, letter-spaced like a brand manual.
  const bx = px(0.30), by = px(0.40), bw = px(0.30), bh = px(0.075);
  paintOver(ctx);
  ctx.strokeStyle = white;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = SHEET * 0.0028;
  ctx.strokeRect(bx, by, bw, bh);
  ctx.lineWidth = SHEET * 0.001;
  ctx.strokeRect(bx + SHEET * 0.0045, by + SHEET * 0.0045, bw - SHEET * 0.009, bh - SHEET * 0.009);
  ctx.globalAlpha = 1;
  stencilText(ctx, 'ON SCHEDULE', 0.315, 0.458, SHEET * 0.03, { color: white, alpha: 0.95, spacing: 0.24, weight: '700' });
  // Route columns: five destinations, five dots. Two routes still run. The rest are struck.
  paintOver(ctx);
  ctx.fillStyle = white;
  ctx.strokeStyle = white;
  for (let r = 0; r < 5; r++) {
    const ry = px(0.51 + r * 0.024);
    ctx.globalAlpha = r < 2 ? 0.85 : 0.5;
    ctx.fillRect(px(0.315), ry, px(0.21), SHEET * 0.0022);
    ctx.beginPath();
    ctx.arc(px(0.555), ry + SHEET * 0.001, SHEET * 0.0035, 0, Math.PI * 2);
    ctx.fill();
    if (r >= 2) {
      cutThrough(ctx);
      ctx.globalAlpha = 0.85;
      ctx.fillRect(px(0.30), ry - SHEET * 0.0022, px(0.27), SHEET * 0.0045);
      paintOver(ctx);
    }
  }
  // The last route's dot gets the X — cancelled, not delayed.
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = SHEET * 0.003;
  const xx = px(0.585), xy = px(0.608), xr = SHEET * 0.007;
  ctx.beginPath();
  ctx.moveTo(xx - xr, xy - xr); ctx.lineTo(xx + xr, xy + xr);
  ctx.moveTo(xx + xr, xy - xr); ctx.lineTo(xx - xr, xy + xr);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // Set by, then filed: the company name takes the strike, the paperwork stays.
  stencilText(ctx, 'SCHEDULE SET BY FULFILLMENT', 0.315, 0.662, SHEET * 0.014, { color: white, alpha: 0.75, spacing: 0.18, weight: '600' });
  cutThrough(ctx);
  ctx.fillRect(px(0.31), px(0.6565), px(0.185), SHEET * 0.0035);
  paintOver(ctx);
  stencilText(ctx, '(FILED)', 0.515, 0.662, SHEET * 0.014, { color: cyan, alpha: 0.85, spacing: 0.18, weight: '600' });
  // The serial barcode — the machine-readable half of the promise.
  paintOver(ctx);
  ctx.fillStyle = white;
  ctx.globalAlpha = 0.85;
  let bar = 0.62;
  while (bar < 0.78) {
    const w = 0.0018 + rng() * 0.0042;
    ctx.fillRect(px(bar), px(0.535), px(w), px(0.05));
    bar += w + 0.0025 + rng() * 0.003;
  }
  ctx.globalAlpha = 1;
  chip(ctx, px(0.30), px(0.40), px(0.28), px(0.06), 3, rng);
}

/** Verge gate law: three directives in measured frames, a calibration band, mass correct. */
function drawGateLaw(ctx, rng) {
  const pale = '#e2ecea', teal = '#8fd8c8';
  const directive = (v, word) => {
    const x = px(0.52), y = px(v), w = px(0.26), h = px(0.052);
    paintOver(ctx);
    ctx.strokeStyle = pale;
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = SHEET * 0.0026;
    ctx.strokeRect(x, y, w, h);
    ctx.lineWidth = SHEET * 0.004;
    for (const [tx, ty] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
      ctx.beginPath();
      ctx.moveTo(tx - SHEET * 0.008, ty);
      ctx.lineTo(tx + SHEET * 0.008, ty);
      ctx.moveTo(tx, ty - SHEET * 0.008);
      ctx.lineTo(tx, ty + SHEET * 0.008);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    stencilText(ctx, word, 0.535, v + 0.036, SHEET * 0.026, { color: pale, alpha: 0.95, spacing: 0.3, weight: '600' });
  };
  directive(0.395, 'PRESENT.');
  directive(0.472, 'WITNESS.');
  directive(0.549, 'APPEAL.');
  // The measure band: a ruler that never blinks, ticks to true mass.
  paintOver(ctx);
  ctx.strokeStyle = teal;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = SHEET * 0.0028;
  ctx.beginPath();
  ctx.moveTo(px(0.15), px(0.615));
  ctx.lineTo(px(0.44), px(0.615));
  ctx.stroke();
  for (let i = 0; i <= 14; i++) {
    const tx = px(0.15 + i * (0.29 / 14));
    const tick = i % 7 === 0 ? 0.009 : 0.005;
    ctx.beginPath();
    ctx.moveTo(tx, px(0.615) - px(tick));
    ctx.lineTo(tx, px(0.615) + px(tick));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  stencilText(ctx, 'MASS RECORDED. MASS CORRECT.', 0.15, 0.655, SHEET * 0.015, { color: teal, alpha: 0.85, spacing: 0.18, weight: '600' });
  // No chips. The tags never lie, and they do not fade.
}

const STYLE_DRAWERS = {
  borrowed_time: { draw: drawBorrowedTime, seed: 0x5eed101, strength: 0.95 },
  concord: { draw: drawConcord, seed: 0xc0dc071, strength: 0.85 },
  industrial: { draw: drawIndustrial, seed: 0x1ad5711, strength: 0.9 },
  frontier: { draw: drawFrontier, seed: 0xf207e55, strength: 0.8 },
  probate: { draw: drawProbate, seed: 0x7011347, strength: 0.85 },
  addendum: { draw: drawAddendum, seed: 0xadd9e09, strength: 0.8 },
  heavy_is_honest: { draw: drawHeavyIsHonest, seed: 0x8e2a71d, strength: 0.92 },
  dead_schedule: { draw: drawDeadSchedule, seed: 0xdead5c0, strength: 0.85 },
  gate_law: { draw: drawGateLaw, seed: 0x9e4a2c1, strength: 0.85 },
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
    texture.anisotropy = 8;
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
  float sfStDeck = smoothstep(0.35, 0.75, abs(sfStFace.y) / max(length(sfStFace), 0.00001));
  float sfStDorsal = smoothstep(-0.25, 0.0, sfStP.y);
  float sfStSpan = max(sfStencilSize.x, sfStencilSize.z);
  vec2 sfStUv = vec2((vSfHullPosition.x - sfStencilCenter.x) / sfStSpan + 0.5,
    0.5 - (vSfHullPosition.z - sfStencilCenter.z) / sfStSpan);
  float sfStInBounds = step(0.0, sfStUv.x) * step(sfStUv.x, 1.0) * step(0.0, sfStUv.y) * step(sfStUv.y, 1.0);
  vec4 sfStMark = texture2D(sfStencilMap, sfStUv);
  float sfStInk = sfStMark.a * sfStDeck * sfStDorsal * sfStInBounds * sfStencilStrength;
  diffuseColor.rgb = mix(diffuseColor.rgb, sfStMark.rgb, sfStInk);
  sfSurfaceRoughnessDelta += sfStInk * 0.18;
  sfSurfaceMetalnessScale *= (1.0 - sfStInk * 0.88);
  sfSurfaceRelief += sfStInk * 0.00018 * sfStSpan;
`;
