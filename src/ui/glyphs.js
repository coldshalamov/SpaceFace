// src/ui/glyphs.js — shared line-glyph vocabulary for the HUD/map marks that were Unicode text
// stand-ins (contact-roster class glyphs, receipt kind icons, hazard zone glyphs, ghost contacts,
// target-panel engagement marks). Complements `station/icons.js` (tile/menu icons): same language —
// 24x24 grid, stroke=currentColor, 1.6 stroke, round caps/joins, no fills — but this module also
// serves CANVAS consumers: every glyph is stored as plain path data so `drawGlyph` can stroke it
// through Path2D with identical geometry (no <circle>/<rect>, those are pre-converted to arcs).
//
// Provenance: 4-round adversarial design duel vs gemini-3.7-flash (arena + rendered galleries in
// .dev/icon-arena/, shot_v4.png is the shipped set). Constraints that survived every round:
//   * IFF orthogonality — hostile=triangle, friendly=diamond, neutral=square, target=ring;
//     the dashed `ghost_*` variants mean "unconfirmed contact" and keep the same silhouettes.
//   * Ship classes read as a size/complexity ladder: scout < fighter < gunship < frigate < capital;
//     miner/freighter are civilian silhouettes outside the warship ladder.
//   * No glyph may read as a real-world symbol (the credits roundel read as ©, the g2 cube as cargo).
//   * 12px canvas / 16px DOM legibility: no parallel strokes closer than ~3 grid units.
//
// This module is deliberately DEPENDENCY-FREE (same rule as station/icons.js) so probes and
// galleries can import it directly.

const STROKE_ATTRS = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
// Unconfirmed-contact dash cadence (tuned for 12px canvas). Stored as a numeric array because
// canvas setLineDash needs numbers; strokesToMarkup joins it for the SVG attribute.
const DASH = [3.4, 2.2];

// name -> [d, opacity?, dasharray?]  (all coordinates on the 24x24 grid)
const STROKES = {
  // ---- A. ship classes: needle -> keel ladder ----------------------------------------------
  scout:     [['M12 3.5 15.5 13.5 12 11 8.5 13.5Z'], ['M12 13.5v6', 0.75]],
  fighter:   [['M12 3 15 9.5 20.5 13.5 17.5 15.5 15.5 14.5V20.5L12 18.5 8.5 20.5V14.5L6.5 15.5 3.5 13.5 9 9.5Z'], ['M12 7v5', 0.65]],
  gunship:   [['M6.5 8.5h11l3 4-3 5.5h-11L3.5 12.5Z'], ['M6.5 8.5V5M17.5 8.5V5', 0.85], ['M9.5 13h5', 0.6]],
  frigate:   [['M12 3.5 15 8v9l-3 3.5L9 17V8Z'], ['M9 10.5 4.5 12l4.5 1.5M15 10.5 19.5 12 15 13.5', 0.85], ['M12 8v8', 0.5]],
  capital:   [['M12 3 20.5 17l-2.8 2-5.7-1.6L6.3 19l-2.8-2Z'], ['M9.5 11.5 12 9l2.5 2.5', 0.8], ['M7.5 15h9', 0.65]],
  miner:     [['M12 3.5 14.5 9h-5Z'], ['M7.5 12h9l1.5 8h-12Z'], ['M12 9v3', 0.9], ['M9.5 15.5h5', 0.55]],
  freighter: [['M4 8.5h13l3 4v5H4Z'], ['M9 8.5v9M14 8.5v9', 0.6], ['M6 17.5v2.5h12v-2.5', 0.55]],
  station:   [['M19.5 12A7.5 7.5 0 1 0 4.5 12A7.5 7.5 0 1 0 19.5 12'], ['M14.2 12A2.2 2.2 0 1 0 9.8 12A2.2 2.2 0 1 0 14.2 12'], ['M12 4.5V7M12 17v2.5M4.5 12H7M17 12h2.5', 0.8]],
  wreck:     [['M12 3.5 5 12.5l3.5 1.5 2.5-3 2 1.2Z'], ['M15 12 13 15.5l2.5 4.5 3.5-3Z'], ['M7 7l1.8 1M18.5 6.5v2M19.5 10.5h-2', 0.7]],
  asteroid:  [['M8 5.5 15 4l5 5-1 6-5.5 4.5L7 18l-3.5-5Z'], ['M11.4 11A1.4 1.4 0 1 0 8.6 11A1.4 1.4 0 1 0 11.4 11', 0.7], ['M16 15A1 1 0 1 0 14 15A1 1 0 1 0 16 15', 0.5]],

  // ---- B. receipts ---------------------------------------------------------------------------
  ok:      [['M4.5 12.5 9.5 17.5 19.5 6.5']],
  err:     [['M6 6l12 12M18 6 6 18']],
  warn:    [['M12 3.5 21 19.5H3Z'], ['M12 8.5v5M12 16.8v.1']],
  info:    [['M20.5 12A8.5 8.5 0 1 0 3.5 12A8.5 8.5 0 1 0 20.5 12'], ['M12 11v5M12 7.8v.1']],
  credits: [['M12 3.5 19.5 7.75v8.5L12 20.5l-7.5-4.25v-8.5Z'], ['M14.8 9.7a3.3 3.3 0 1 0 0 4.6', 0.9]],
  rep:     [['M12 3.5 19.5 6.5v5.5c0 4.8-3.5 8.5-7.5 9.5-4-1-7.5-4.7-7.5-9.5V6.5Z'], ['M8.5 13 12 9.5l3.5 3.5'], ['M9.5 16 12 13.5l2.5 2.5', 0.7]],

  // ---- C. hazards ----------------------------------------------------------------------------
  radiation:      [['M13.5 12A1.5 1.5 0 1 0 10.5 12A1.5 1.5 0 1 0 13.5 12'], ['M14.1 8.4 16.4 4.4A8.8 8.8 0 0 0 7.6 4.4L9.9 8.4A4.2 4.2 0 0 1 14.1 8.4Z'], ['M14.1 15.6 16.4 19.6A8.8 8.8 0 0 0 20.8 12L16.2 12A4.2 4.2 0 0 1 14.1 15.6Z'], ['M9.9 15.6 7.6 19.6A8.8 8.8 0 0 1 3.2 12L7.8 12A4.2 4.2 0 0 0 9.9 15.6Z']],
  nebula:         [['M12 4.5 13.7 10.3 19.5 12l-5.8 1.7L12 19.5l-1.7-5.8L4.5 12l5.8-1.7Z'], ['M17.5 4.5 19.5 7.5 17.5 10.5 15.5 7.5Z', 0.8]],
  dense_asteroid: [['M11 4 17.5 3.5 20.5 8 18.5 13.5 12.5 14 9.5 9Z'], ['M11 4 14 9l4.5 4.5', 0.55], ['M4.5 14.5 9 13.5l2 3.5-3.5 3.5-3.5-2Z', 0.85], ['M17 17l2.5-.5 1 3-2.5 1-1.5-2Z', 0.7]],
  debris:         [['M4.5 9 12 4.5l4 6-7.5 4.5Z'], ['M8.5 7 12 12.5', 0.55], ['M14.5 14 19.5 13l-1 5.5-4.5-.5Z', 0.85], ['M3.5 16.5l3.5 2.5M19 5.5 21 7', 0.75]],

  // ---- D. IFF echoes (solid = scanned) + ghosts (dashed = unconfirmed) -----------------------
  // Shapes are orthogonal to SEMANTIC_PALETTE.shape (triangle/diamond/square/ring) so the roster
  // glyph and the radar shape stay the same geometry at every size.
  iff_hostile:    [['M12 4.5 20 19H4Z']],
  iff_friendly:   [['M12 4.5 19.5 12 12 19.5 4.5 12Z']],
  iff_neutral:    [['M5 5h14v14H5Z']],
  iff_ally:       [['M5 8.5 12 15.5 19 8.5']],
  iff_target:     [['M20.5 12A8.5 8.5 0 1 0 3.5 12A8.5 8.5 0 1 0 20.5 12'], ['M14.4 12A2.4 2.4 0 1 0 9.6 12A2.4 2.4 0 1 0 14.4 12']],
  ghost_hostile:  [['M12 4.5 20 19H4Z', 1, DASH]],
  ghost_friendly: [['M12 4.5 19.5 12 12 19.5 4.5 12Z', 1, DASH]],
  ghost_neutral:  [['M5 5h14v14H5Z', 1, DASH]],
  ghost_ally:     [['M5 8.5 12 15.5 19 8.5', 1, DASH]],
  unknown:        [['M12 3.5 20.5 12 12 20.5 3.5 12Z', 1, DASH], ['M10.2 9.7c0-1.9 3.8-1.9 3.8 0 0 1.6-1.9 2-1.9 3.6'], ['M12 16v.1']],

  // ---- E. engagement marks --------------------------------------------------------------------
  guns_lock: [['M4 8.5V4.5h4M16 4.5h4v4M4 15.5v4h4M16 19.5h4v-4'], ['M13.5 12A1.5 1.5 0 1 0 10.5 12A1.5 1.5 0 1 0 13.5 12'], ['M12 6.5v2M12 15.5v2M6.5 12h2M15.5 12h2', 0.75]],
  weakpoint: [['M20 12A8 8 0 1 0 4 12A8 8 0 1 0 20 12', 1, [4, 3]], ['M12 8.5l3.5 3.5-3.5 3.5L8.5 12Z']],
  component: [['M12 3.5 19.5 7.8v8.4L12 20.5l-7.5-4.3V7.8Z'], ['M14.8 12A2.8 2.8 0 1 0 9.2 12A2.8 2.8 0 1 0 14.8 12'], ['M12 3.5v5.7M12 14.8v5.7M4.5 12h5.7M13.8 12h5.7', 0.6]],
  closing:   [['M12 5v14', 0.5], ['M6 8.5 9.5 12 6 15.5M18 8.5 14.5 12 18 15.5']],
  opening:   [['M12 5v14', 0.5], ['M9 8.5 5.5 12 9 15.5M15 8.5 18.5 12 15 15.5']],
};

export function hasGlyph(name) {
  return Object.prototype.hasOwnProperty.call(STROKES, name);
}

/** Inner-<svg> markup: one <path> per stroke, opacity/dash preserved. */
function strokesToMarkup(name) {
  return STROKES[name].map(([d, opacity, dash]) => {
    let attrs = STROKE_ATTRS;
    if (dash) attrs += ` stroke-dasharray="${dash.join(' ')}"`;
    if (opacity != null && opacity < 1) attrs += ` opacity="${opacity}"`;
    return `<path ${attrs} d="${d}"/>`;
  }).join('');
}

/** `<svg>` string for DOM injection. Never contains game data, safe for innerHTML. */
export function glyphSvg(name, size = 16, cls = 'sf-glyph') {
  const inner = hasGlyph(name) ? strokesToMarkup(name) : strokesToMarkup('unknown');
  const classAttr = cls ? ` class="${cls}"` : '';
  return `<svg${classAttr} viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false">${inner}</svg>`;
}

// ---- canvas channel ---------------------------------------------------------------------------
const pathCache = new Map(); // name -> [{ p: Path2D, opacity, dash }]
function strokesForCanvas(name) {
  let strokes = pathCache.get(name);
  if (!strokes) {
    strokes = STROKES[name].map(([d, opacity, dash]) => ({ p: new Path2D(d), opacity: opacity == null ? 1 : opacity, dash }));
    pathCache.set(name, strokes);
  }
  return strokes;
}

/**
 * Stroke a glyph on a 2D context, centred on (x, y) at `px` rendered pixels.
 * Uses the context's current strokeStyle unless opts.color is given; opts.alpha multiplies the
 * per-stroke opacities. Cheap after first draw (Path2Ds are cached per glyph name).
 */
export function drawGlyph(ctx, name, x, y, px, opts = {}) {
  if (!hasGlyph(name)) return false;
  const scale = px / 24;
  ctx.save();
  ctx.translate(x - px / 2, y - px / 2);
  ctx.scale(scale, scale);
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (opts.color) ctx.strokeStyle = opts.color;
  const base = opts.alpha == null ? 1 : opts.alpha;
  for (const { p, opacity, dash } of strokesForCanvas(name)) {
    ctx.globalAlpha = base * opacity;
    ctx.setLineDash(dash || []);
    ctx.stroke(p);
  }
  ctx.restore();
  return true;
}
