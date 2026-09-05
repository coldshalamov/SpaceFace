// Canvas 2D cannot read design tokens. This resolves them once so canvas text can.
//
// THE BUG THIS EXISTS TO KILL. Canvas 2D parses `ctx.font` with the CSS font shorthand parser, and
// that parser does NOT resolve custom properties. `ctx.font = '600 11px var(--mono,monospace)'` is
// invalid, so the assignment is silently discarded and the context keeps whatever it had — initially
// `10px sans-serif`. Verified directly in the browser rather than taken on trust:
//
//     ctx.font = '10px sans-serif';
//     ctx.font = '600 11px var(--mono,monospace)';
//     ctx.font  // -> "10px sans-serif"   (the assignment did nothing)
//
// So every such call site rendered in browser-default sans at browser-default size: the wrong
// typeface, which destroys the tabular alignment mono was chosen for, AND a size below the 12px
// floor that no stylesheet check could ever see. `techTree.js` found and fixed this for itself; the
// same defect was then sitting unnoticed in the star chart, the range, and the danger gradient.
//
// Tokens are read from the document element, so a theme scope that remaps a face is picked up on the
// next invalidation. Web fonts land after first paint, so the cache drops on `loadingdone` and the
// next redraw picks up the real face.

const FALLBACK = Object.freeze({
  mono: '"IBM Plex Mono", Consolas, "SFMono-Regular", ui-monospace, monospace',
  sans: '"IBM Plex Sans", "Segoe UI", system-ui, -apple-system, sans-serif',
  data: '"IBM Plex Mono", Consolas, monospace',
  display: '"IBM Plex Sans", "Segoe UI", sans-serif',
  subhead: '"IBM Plex Sans", "Segoe UI", sans-serif',
  body: '"IBM Plex Sans", "Segoe UI", sans-serif',
});

let cache = null;

/**
 * Resolved font-family lists for canvas text, keyed by grammar role.
 * The returned strings are complete family lists and drop straight into the font shorthand.
 */
export function canvasFonts() {
  if (cache) return cache;
  if (typeof document === 'undefined' || !document.documentElement) return FALLBACK;
  let cs;
  try { cs = getComputedStyle(document.documentElement); } catch { return FALLBACK; }
  const read = (name, fallback) => {
    const v = (cs.getPropertyValue(name) || '').trim();
    return v || fallback;
  };
  cache = Object.freeze({
    mono: read('--mono', FALLBACK.mono),
    sans: read('--font', FALLBACK.sans),
    data: read('--sf-data-face', FALLBACK.data),
    display: read('--sf-display-face', FALLBACK.display),
    subhead: read('--sf-subhead-face', FALLBACK.subhead),
    body: read('--sf-body-face', FALLBACK.body),
  });
  return cache;
}

/** Drop the cache; the next canvasFonts() re-reads the tokens. */
export function invalidateCanvasFonts() { cache = null; }

/**
 * Build a canvas font shorthand that the CSS parser will actually accept.
 * Sizes are clamped to the INSTRUMENT_GRAMMAR §3 floor: "12 px is the floor. Nothing renders below
 * it, ever." Canvas text is text, and a zoom divisor is exactly how a 9px label becomes a 4px one.
 */
export function canvasFont(weight, sizePx, role = 'mono') {
  const faces = canvasFonts();
  const family = faces[role] || faces.mono;
  const size = Math.max(12, Number.isFinite(sizePx) ? sizePx : 12);
  const w = weight == null || weight === '' ? '' : `${weight} `;
  return `${w}${size}px ${family}`;
}

/**
 * Same, for a canvas whose transform is already scaled by `zoom`.
 *
 * The floor must be applied to the SIZE THE PLAYER SEES, then divided — not to the divided value.
 * A scaled context draws `size/zoom` at `size` screen pixels, so clamping after the divide would
 * make the label grow with zoom instead of holding still. Getting this backwards is how the star
 * chart ended up asking for `8 / z` px in the first place.
 */
export function canvasFontScaled(weight, screenPx, zoom, role = 'mono') {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const faces = canvasFonts();
  const family = faces[role] || faces.mono;
  const size = Math.max(12, Number.isFinite(screenPx) ? screenPx : 12) / z;
  const w = weight == null || weight === '' ? '' : `${weight} `;
  return `${w}${size}px ${family}`;
}

if (typeof document !== 'undefined' && document.fonts && document.fonts.addEventListener) {
  // Web fonts land after first paint; drop the cache so the next redraw uses the real face.
  document.fonts.addEventListener('loadingdone', invalidateCanvasFonts);
}
