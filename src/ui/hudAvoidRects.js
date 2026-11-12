// The rects a world label must not sit in (G16-04): the Swarm centre column's live children
// (round callouts, the ignition countdown, PILE-UP / chain words), the Stage banner, and the HUD
// corner panels. Read from the live DOM so a layout change is followed, never hard-coded; cached
// for a short real-time window because the labels re-seat every frame and a rect read forces layout.

export const AVOID_SELECTORS = Object.freeze([
  '.sf-sj__col > *:not([hidden])',
  '#sf-stage-banner .sf-stage__item',
  '#sf-stage-banner #alerts > *',
  '#alerts .sf-alert',
  '#toasts .sf-toast:not(.sf-toast--out)',
  '.sf-leftcontext',
  '.sf-crun',
  '.sf-bars',
  '.sf-overview',
  '.sf-target',
  '.sf-mission-tracker',
  '.sf-nav-readout',
  '.sf-radar',
  '#sf-wpnstat',
  '.sf-prail__slots',
  '.sf-cargo-panel',
  '#sf-sector-law',
  '.sf-commtape',
]);

/** Keep only rects with real area, as plain {x,y,w,h}. */
export function visibleRects(list) {
  const out = [];
  for (const r of list) {
    if (!r) continue;
    const w = r.width != null ? r.width : r.w;
    const h = r.height != null ? r.height : r.h;
    const x = r.left != null ? r.left : r.x;
    const y = r.top != null ? r.top : r.y;
    if (w > 1 && h > 1 && Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y, w, h });
  }
  return out;
}

/**
 * @param {Document} doc
 * @param {{ selectors?: readonly string[], ttlMs?: number, now?: () => number, exclude?: (el: Element) => boolean }} [opts]
 */
export function createAvoidRects(doc, opts = {}) {
  const selectors = opts.selectors || AVOID_SELECTORS;
  // 400 ms, not one frame: a rect read forces layout, and at Swarm-20 load (12 fps, 83 ms frames) a 120 ms
  // window re-read nearly every frame — 5.2 % of the main thread (lead profile 2026-11-12). HUD panels and the
  // centre column move rarely; a label yielding a few frames late is invisible, a forced layout per frame is not.
  const ttl = opts.ttlMs ?? 400;
  const now = opts.now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const exclude = opts.exclude || null;
  const query = selectors.join(',');
  let cache = [];
  let at = -Infinity;
  // A resize moves every panel: read fresh on the next ask.
  try {
    const win = doc && doc.defaultView;
    if (win && typeof win.addEventListener === 'function') win.addEventListener('resize', () => { at = -Infinity; }, { passive: true });
  } catch (_) { /* no window (tests) */ }
  return {
    get() {
      const t = now();
      if (t - at < ttl) return cache;
      at = t;
      const found = [];
      let els = [];
      try { els = doc && doc.querySelectorAll ? Array.from(doc.querySelectorAll(query)) : []; }
      catch (_) { els = []; }
      for (const el of els) {
        if (exclude && exclude(el)) continue;
        if (el.hidden || (el.closest && el.closest('[hidden]'))) continue;
        if (typeof el.getBoundingClientRect !== 'function') continue;
        found.push(el.getBoundingClientRect());
      }
      cache = visibleRects(found);
      return cache;
    },
    invalidate() { at = -Infinity; },
  };
}

/**
 * Where a centre-top plate (the rope class-up) sits so it overlaps neither the Swarm centre
 * column nor anything it already holds: just under the lowest column rect. Returns the top (px)
 * or null when the column is empty, in which case the plate keeps its ordinary lane seat.
 */
export function seatBelowColumn(columnRects, gap = 10) {
  let bottom = -Infinity;
  for (const r of columnRects) if (r && r.h > 1 && r.y + r.h > bottom) bottom = r.y + r.h;
  return Number.isFinite(bottom) ? Math.round(bottom + gap) : null;
}
