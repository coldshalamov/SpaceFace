// Authored deep-field structure art.
//
// The deep field's distant solid forms are drawn ONCE, at full quality, into an offscreen canvas
// and then submitted as a single textured quad. That is the same "bake it, don't shade it live"
// direction the painted planets and the L1 nebula already follow: static backdrop art has no
// business paying per-frame procedural shading, and a canvas bake is where soft edges, internal
// value structure and real object detail are actually affordable.
//
// WHY THIS REPLACES THE OLD POLYGON PLATES
// The previous version filled a 12-vertex outline with a flat plate and let a bounding-box
// normalized shader guess at "armour planes". On a thin silhouette that normalization washes out
// completely, so the object rendered as one uniform value with hard aliased edges — measurably a
// glitch, not an object. Worse, a 12-vertex outline cannot depict anything: a passerby has to be
// able to say "that is a relay mast" from the sky alone, and an abstract stick cannot carry that.
//
// Each builder below therefore draws the object the way a distant object is actually read:
//   1. a strong, correct silhouette (mast taper + footing; freighter hull + bridge + break),
//   2. a few BOLD internal divisions that survive at 80-150 px (lattice bays, cargo module gaps,
//      a severed midsection),
//   3. a subdued value ramp so the form reads as volume — lit top planes, mid plates, deep shadow
//      undersides — while the whole object stays just above the void value,
//   4. a soft outer edge so it never aliases into a stair-step.
//
// Everything is deterministic authored art: no Math.random, no ambient time, no renderer state.
// The recipes in `deepFieldStructureRecipes.js` stay the source of truth for placement, scale,
// opacity and base value; this module only knows how to draw a named object.

// ----------------------------------------------------------------------------
// Value ramp — one base colour in, a legible but subdued set of planes out.
// ----------------------------------------------------------------------------
function parseHex(hex) {
  const s = String(hex || '#161b23').trim().replace('#', '');
  const full = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  const n = Number.parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(n)) return [22, 27, 35];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function clamp255(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function shade(rgb, mult, alpha = 1) {
  return `rgba(${clamp255(rgb[0] * mult)},${clamp255(rgb[1] * mult)},${clamp255(rgb[2] * mult)},${alpha})`;
}

// The ramp is deliberately compressed. A distant object is read from CONTRAST between its planes,
// not from absolute brightness, so the brightest plane is a small-area edge and the mass of the
// object stays near the void value the recipes author. The recipe colour is the object's MID value:
// `base` sits just under it and only thin edge highlights reach `edge`, so a structure never turns
// into the loudest thing in a sky whose void is near-black.
export function structureValueRamp(hex) {
  const rgb = parseHex(hex);
  return {
    rgb,
    deep: shade(rgb, 0.30),
    shadow: shade(rgb, 0.54),
    base: shade(rgb, 0.84),
    plate: shade(rgb, 1.16),
    lit: shade(rgb, 1.85),
    edge: shade(rgb, 2.20),
    // Tiny window/service strips carry a warm accent. The structural mass remains in shadow.
    hot: shade([Math.max(92, rgb[0] * 2.8), Math.max(70, rgb[1] * 1.8), Math.max(45, rgb[2])], 1),
  };
}

// ----------------------------------------------------------------------------
// Small canvas drawing helpers (authored art, no dependencies)
// ----------------------------------------------------------------------------
function poly(ctx, pts, fill) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function stroke(ctx, pts, color, width, cap = 'butt') {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.lineWidth = width;
  ctx.lineCap = cap;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function disc(ctx, x, y, r, fill) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.25, r), 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

// Soft-edged fill: the shape plus a same-coloured blurred halo, so a distant object never ends in
// an aliased stair-step. The crisp pass is drawn over the halo to keep internal edges defined.
function softPoly(ctx, pts, fill, blur) {
  ctx.save();
  ctx.shadowColor = fill;
  ctx.shadowBlur = blur;
  poly(ctx, pts, fill);
  poly(ctx, pts, fill);
  ctx.restore();
}

function verticalGrad(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [t, c] of stops) g.addColorStop(t, c);
  return g;
}

// ----------------------------------------------------------------------------
// Relay mast — a lattice communications tower with cross-arms, a dish and a beacon.
// ----------------------------------------------------------------------------
// Reads as "tower" from the silhouette alone: a tapering truss with repeated bays, arms that get
// shorter toward the top, and a dish hung off one side. Detail that would vanish at 90 px (wire
// bracing, bolt rows) is omitted on purpose.
function paintRelayMast(ctx, w, h, ramp) {
  const X = (lx) => (lx + 1) * 0.5 * w;      // lx in [-1, 1] spans the full width
  const Y = (ly) => (1 - ly) * h;            // ly in [0, 1], 0 = base, 1 = apex
  const brace = Math.max(0.9, w * 0.030);
  const detail = Math.max(0.9, w * 0.022);
  const halfAt = (ly) => 0.15 + 0.19 * Math.pow(1 - ly, 1.1);  // taper: wide base, narrow top
  const top = 0.985;

  // --- ground contact: a footing pad, so the tower stands on something -----
  const footY = Y(0);
  softPoly(ctx, [
    [X(-0.34), footY], [X(0.34), footY], [X(0.22), Y(0.05)], [X(-0.22), Y(0.05)],
  ], ramp.shadow, Math.max(1, w * 0.02));

  // --- the truss: a solid tapering mass with cross-bracing -----------------
  // Mass FIRST and at the base value. An earlier pass drew bright rails over a dark interior and
  // read as a neon wireframe; the truss has to be the object, with the lattice as shadow inside it.
  const tower = [
    [X(-halfAt(0.02)), Y(0.02)], [X(halfAt(0.02)), Y(0.02)],
    [X(halfAt(top)), Y(top)], [X(-halfAt(top)), Y(top)],
  ];
  softPoly(ctx, tower, ramp.base, Math.max(1, w * 0.025));
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(tower[0][0], tower[0][1]);
  for (let i = 1; i < tower.length; i++) ctx.lineTo(tower[i][0], tower[i][1]);
  ctx.closePath();
  ctx.clip();
  // Raking light from the upper left: lit left plane, shadowed right plane. No per-frame lighting.
  const minY = Y(top);
  const maxY = Y(0.02);
  ctx.fillStyle = verticalGrad(ctx, 0, minY, 0, maxY, [
    [0, ramp.plate], [0.45, ramp.base], [1, ramp.shadow],
  ]);
  ctx.fillRect(0, minY - 1, w, (maxY - minY) + 2);
  ctx.beginPath();
  ctx.moveTo(X(0.0), minY);
  ctx.lineTo(X(halfAt(0.02)), minY);
  ctx.lineTo(X(halfAt(0.02)), maxY);
  ctx.lineTo(X(0.0), maxY);
  ctx.closePath();
  ctx.fillStyle = shade(ramp.rgb, 0.6);
  ctx.fill();
  ctx.restore();

  const bays = 8;
  for (let b = 0; b < bays; b++) {
    const ly0 = 0.04 + (top - 0.04) * (b / bays);
    const ly1 = 0.04 + (top - 0.04) * ((b + 1) / bays);
    const h0 = halfAt(ly0);
    const h1 = halfAt(ly1);
    // Alternate the X so the bracing zig-zags up the tower, as shadow inside the mass.
    if (b % 2 === 0) {
      stroke(ctx, [[X(-h0), Y(ly0)], [X(h1), Y(ly1)]], ramp.deep, brace);
    } else {
      stroke(ctx, [[X(h0), Y(ly0)], [X(-h1), Y(ly1)]], ramp.deep, brace);
    }
  }
  // Two thin rails read as the structural edges; the lit one is the raking-light side.
  stroke(ctx, [[X(-halfAt(0.02)), Y(0.02)], [X(-halfAt(top)), Y(top)]], ramp.lit, detail);
  stroke(ctx, [[X(halfAt(0.02)), Y(0.02)], [X(halfAt(top)), Y(top)]], ramp.shadow, detail);

  // --- cross-arms: graduated, with upward antenna elements -----------------
  const arms = [
    { ly: 0.58, reach: 0.56, elements: 3 },
    { ly: 0.78, reach: 0.40, elements: 2 },
  ];
  for (const arm of arms) {
    const y = Y(arm.ly);
    const t = Math.max(1.3, w * 0.030);
    for (const side of [-1, 1]) {
      softPoly(ctx, [
        [X(0), y], [X(side * arm.reach), y],
        [X(side * arm.reach), y + t], [X(0), y + t],
      ], ramp.plate, Math.max(1, w * 0.02));
      stroke(ctx, [[X(0), y], [X(side * arm.reach), y]], ramp.shadow, Math.max(0.8, w * 0.012));
      for (let e = 1; e <= arm.elements; e++) {
        const lx = side * (arm.reach * (e / (arm.elements + 0.5)));
        stroke(ctx, [[X(lx), y], [X(lx), y - t * 1.9]], ramp.lit, detail);
      }
    }
  }

  // --- dish: a solid shallow bowl hung off the upper truss -----------------
  // Filled with its own light/shadow gradient and a bright leading rim only on the lit arc. An
  // outlined ring reads as a hoop, not a dish, which is what an earlier pass produced.
  const dx = X(0.50);
  const dy = Y(0.46);
  const rx = w * 0.22;
  const ry = h * 0.062;
  ctx.save();
  ctx.translate(dx, dy);
  ctx.rotate(-0.34);
  // The bowl is a SOLID lit disc with a shallow concave interior, never an outline: an outlined
  // ring reads as a hoop on a stick, which is what an earlier pass produced.
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = verticalGrad(ctx, -rx * 0.5, -ry, rx * 0.6, ry, [
    [0, ramp.lit], [0.42, ramp.plate], [1, ramp.shadow],
  ]);
  ctx.fill();
  // concave interior: a soft off-centre depression, not a black hole
  ctx.beginPath();
  ctx.ellipse(rx * 0.10, ry * 0.06, rx * 0.66, ry * 0.62, 0, 0, Math.PI * 2);
  ctx.fillStyle = shade(ramp.rgb, 0.5);
  ctx.fill();
  // bright leading rim on the lit arc only
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 0.94, ry * 0.94, 0, Math.PI * 0.72, Math.PI * 1.55);
  ctx.lineWidth = Math.max(1, w * 0.024);
  ctx.strokeStyle = ramp.edge;
  ctx.stroke();
  ctx.restore();
  // feed horn on its strut, pointed back up the dish axis
  const fx = dx - rx * 0.60;
  const fy = dy - ry * 2.3;
  stroke(ctx, [[dx - rx * 0.35, dy + ry * 0.25], [fx, fy]], ramp.shadow, detail);
  disc(ctx, fx, fy, Math.max(0.9, w * 0.022), ramp.plate);

  // --- apex beacon ---------------------------------------------------------
  stroke(ctx, [[X(0), Y(top)], [X(0), Y(1.0)]], ramp.plate, Math.max(1, w * 0.026));
  disc(ctx, X(0), Y(1.0), Math.max(1.1, w * 0.028), ramp.hot);

  // --- service platform, to break the tower's vertical monotony ------------
  softPoly(ctx, [
    [X(-0.23), Y(0.30)], [X(0.23), Y(0.30)],
    [X(0.23), Y(0.30) + Math.max(1, w * 0.024)], [X(-0.23), Y(0.30) + Math.max(1, w * 0.024)],
  ], ramp.plate, Math.max(1, w * 0.018));
}

// ----------------------------------------------------------------------------
// Derelict hauler — a broken freighter seen in profile, severed amidships.
// ----------------------------------------------------------------------------
// Reads as "ship" from the hull's length, the raised bridge, the repeated cargo modules, the
// engine bells and — most of all — the torn midsection that splits one hull into two halves at
// different angles. A flat streak cannot say any of that, which is why the old plate failed.
function paintDerelictHauler(ctx, w, h, ramp) {
  const X = (lx) => (lx + 1) * 0.5 * w;      // lx in [-1, 1]
  const Y = (ly) => (1 - ly) * h;            // ly in [0, 1], 0 = keel, 1 = dorsal
  const ribW = Math.max(0.7, w * 0.012);
  const panel = Math.max(0.7, w * 0.010);
  const frame = Math.max(1.1, w * 0.026);

  // --- the two hull halves, split at the break and misaligned --------------
  // The gap between them is WIDE and the halves sit at different heights and angles: a hairline
  // seam reads as panel line, not as a severed hull, which is what an earlier pass produced.
  // Fore (right in art space): the intact half with the bridge.
  const fore = [
    [X(0.16), Y(0.32)], [X(0.62), Y(0.30)], [X(0.84), Y(0.35)], [X(0.94), Y(0.48)],
    [X(0.90), Y(0.67)], [X(0.70), Y(0.73)], [X(0.36), Y(0.72)], [X(0.17), Y(0.65)],
  ];
  // Aft (left): the broken half, dropped and yawed nose-down as it drifts.
  const aft = [
    [X(-0.18), Y(0.21)], [X(-0.52), Y(0.18)], [X(-0.84), Y(0.22)], [X(-0.96), Y(0.34)],
    [X(-0.92), Y(0.52)], [X(-0.64), Y(0.58)], [X(-0.30), Y(0.56)], [X(-0.19), Y(0.47)],
  ];

  const paintHull = (pts, label) => {
    softPoly(ctx, pts, ramp.base, Math.max(1.5, w * 0.03));
    // Volume: lit dorsal planes, deep shadow at the keel.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.clip();
    const minY = Math.min(...pts.map((p) => p[1]));
    const maxY = Math.max(...pts.map((p) => p[1]));
    ctx.fillStyle = verticalGrad(ctx, 0, minY, 0, maxY, [
      [0, ramp.shadow], [0.42, ramp.base], [0.68, ramp.plate], [1, ramp.lit],
    ]);
    ctx.fillRect(0, minY - 1, w, (maxY - minY) + 2);
    ctx.restore();
    // Panel lines across the hull: they give length and scale.
    const xs = [];
    for (let i = 0; i < pts.length; i++) xs.push(pts[i][0]);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    for (let t = 0.08; t < 0.95; t += 0.115) {
      const x = x0 + (x1 - x0) * t;
      stroke(ctx, [[x, minY + 1], [x, maxY - 1]], shade(ramp.rgb, 0.44), ribW);
    }
    // Dorsal edge highlight — the single brightest line on the object.
    stroke(ctx, [pts[4], pts[5], pts[6]], ramp.edge, panel, 'round');
    void label;
  };
  paintHull(aft, 'aft');
  paintHull(fore, 'fore');

  // --- the break: an exposed torn cross-section across the gap -------------
  // Near-black, jagged, and wider at the top than the bottom, so it reads as a hull opened up
  // rather than as a seam. Torn frame stubs bridge the wound.
  poly(ctx, [
    [X(0.16), Y(0.32)], [X(0.17), Y(0.65)], [X(0.10), Y(0.70)], [X(0.02), Y(0.62)],
    [X(-0.05), Y(0.66)], [X(-0.12), Y(0.55)], [X(-0.19), Y(0.47)], [X(-0.18), Y(0.21)],
    [X(-0.10), Y(0.27)], [X(-0.02), Y(0.22)], [X(0.08), Y(0.28)],
  ], ramp.deep);
  ctx.save();
  ctx.globalAlpha = 0.85;
  for (const [a, b] of [
    [[X(0.15), Y(0.36)], [X(-0.17), Y(0.26)]],
    [[X(0.16), Y(0.50)], [X(-0.18), Y(0.42)]],
    [[X(0.15), Y(0.62)], [X(-0.14), Y(0.56)]],
  ]) stroke(ctx, [a, b], ramp.shadow, frame * 0.6);
  ctx.restore();
  // floating debris torn off the wound, spread across the gap and beyond
  for (const [lx, ly, s, rot] of [
    [-0.02, 0.36, 0.050, 0.4], [0.10, 0.24, 0.038, -0.6], [-0.06, 0.74, 0.046, 0.2],
    [0.26, 0.42, 0.034, 1.0], [-0.30, 0.68, 0.030, -0.3],
  ]) {
    ctx.save();
    ctx.translate(X(lx), Y(ly));
    ctx.rotate(rot);
    const pw = w * s;
    const ph = pw * 0.55;
    softPoly(ctx, [[-pw, -ph], [pw, -ph * 0.7], [pw * 0.8, ph], [-pw * 0.9, ph * 0.8]],
      ramp.shadow, Math.max(1, w * 0.014));
    ctx.restore();
  }

  // --- cargo modules: bold separated blocks, the freighter's signature -----
  const module = (lx0, lx1, ly0, ly1) => {
    softPoly(ctx, [
      [X(lx0), Y(ly0)], [X(lx1), Y(ly0)], [X(lx1), Y(ly1)], [X(lx0), Y(ly1)],
    ], ramp.plate, Math.max(1, w * 0.02));
    stroke(ctx, [[X(lx0), Y(ly1)], [X(lx1), Y(ly1)]], ramp.edge, panel);
    stroke(ctx, [[X(lx0), Y(ly0)], [X(lx1), Y(ly0)]], shade(ramp.rgb, 0.4), panel);
    // corner posts
    stroke(ctx, [[X(lx0), Y(ly0)], [X(lx0), Y(ly1)]], shade(ramp.rgb, 0.5), ribW);
    stroke(ctx, [[X(lx1), Y(ly0)], [X(lx1), Y(ly1)]], shade(ramp.rgb, 0.5), ribW);
  };
  // dorsal container stack on the intact half
  module(0.22, 0.36, 0.73, 0.87);
  module(0.38, 0.52, 0.73, 0.89);
  module(0.54, 0.66, 0.73, 0.86);
  // ventral containers still clamped to the broken half
  module(-0.74, -0.46, 0.07, 0.19);
  module(-0.42, -0.24, 0.08, 0.20);

  // --- bridge: a raised command block at the fore, with lit windows --------
  softPoly(ctx, [
    [X(0.62), Y(0.73)], [X(0.86), Y(0.74)], [X(0.88), Y(0.91)], [X(0.60), Y(0.89)],
  ], ramp.plate, Math.max(1, w * 0.02));
  stroke(ctx, [[X(0.60), Y(0.90)], [X(0.88), Y(0.92)]], ramp.edge, panel);
  // a stub mast on the bridge
  stroke(ctx, [[X(0.79), Y(0.91)], [X(0.81), Y(0.99)]], ramp.shadow, frame * 0.8);
  disc(ctx, X(0.81), Y(0.995), Math.max(1, w * 0.015), ramp.hot);
  // window row along each hull's mid-band; the wound itself stays dark
  for (let i = 0; i < 13; i++) {
    const lx = -0.86 + i * 0.125;
    if (lx > -0.24 && lx < 0.20) continue;          // the wound
    if (lx > 0.56) continue;                        // bridge handled separately
    const ly = lx < 0 ? 0.38 : 0.45;                // the aft half sits lower
    disc(ctx, X(lx), Y(ly), Math.max(0.5, w * 0.0060), ramp.hot);
  }
  ctx.save();
  ctx.globalAlpha = 0.8;
  stroke(ctx, [[X(0.64), Y(0.81)], [X(0.85), Y(0.82)]], ramp.hot, Math.max(1, w * 0.015));
  ctx.restore();

  // --- engine bells at the stern, with dead exhaust voids ------------------
  for (const [lx, ly, s] of [[-0.96, 0.28, 0.10], [-0.94, 0.40, 0.13], [-0.92, 0.53, 0.10]]) {
    const bx = X(lx);
    const by = Y(ly);
    const bw = w * s;
    const bh = h * s * 1.15;
    softPoly(ctx, [
      [bx, by - bh * 0.5], [bx, by + bh * 0.5],
      [bx - bw, by + bh * 0.78], [bx - bw, by - bh * 0.78],
    ], ramp.plate, Math.max(1, w * 0.014));
    poly(ctx, [
      [bx - bw * 0.38, by - bh * 0.52], [bx - bw * 0.38, by + bh * 0.52],
      [bx - bw, by + bh * 0.78], [bx - bw, by - bh * 0.78],
    ], ramp.deep);
  }

  // --- frame ribs, so each half keeps its own structural rhythm ------------
  for (const [lx, ly0, ly1] of [
    [0.30, 0.33, 0.73], [0.70, 0.36, 0.73],
    [-0.32, 0.20, 0.56], [-0.62, 0.20, 0.55],
  ]) {
    stroke(ctx, [[X(lx), Y(ly0)], [X(lx), Y(ly1)]], shade(ramp.rgb, 0.5), ribW);
  }
}

// ----------------------------------------------------------------------------
// Registry + bake entry point
// ----------------------------------------------------------------------------
export const DEEP_FIELD_STRUCTURE_ART = Object.freeze({
  relay_mast: Object.freeze({ aspect: 0.62, paint: paintRelayMast }),
  derelict_hauler: Object.freeze({ aspect: 2.35, paint: paintDerelictHauler }),
});

export function resolveStructureArt(structure) {
  const art = structure && structure.art;
  if (!art) return null;
  const spec = DEEP_FIELD_STRUCTURE_ART[art.kind];
  if (!spec) return null;
  return { spec, params: art.params || null };
}

// Aspect (width / height) of the object's authored canvas. Falls back to a square.
export function structureArtAspect(structure) {
  const resolved = resolveStructureArt(structure);
  return resolved ? resolved.spec.aspect : 1;
}

// Bake one structure into an offscreen canvas at `height` px tall. Returns null when there is no
// DOM (unit tests build this module headlessly) or no authored art, so callers can degrade to the
// ribbon layer alone instead of throwing.
export function bakeDeepFieldStructure(structure, height) {
  const resolved = resolveStructureArt(structure);
  if (!resolved) return null;
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  const h = Math.max(32, Math.round(height) || 256);
  const w = Math.max(16, Math.min(2048, Math.round(h * resolved.spec.aspect)));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const ramp = structureValueRamp(structure && structure.color);
  resolved.spec.paint(ctx, w, h, ramp, resolved.params);
  return canvas;
}
