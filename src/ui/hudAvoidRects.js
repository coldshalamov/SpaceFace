// The rects a world label must not sit in (G16-04): the Swarm centre column's live children
// (round callouts, the ignition countdown, PILE-UP / chain words), the Stage banner, and the HUD
// corner panels. Read from the live DOM so a layout change is followed, never hard-coded; cached
// for a short real-time window because the labels re-seat every frame and a rect read forces layout.

export const AVOID_SELECTORS = Object.freeze([
  '.sf-sj__col > *:not([hidden])',
  '#sf-stage-banner .sf-stage__item',
  '#sf-stage-banner #alerts > *',
  '#alerts .sf-alert',
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
  const ttl = opts.ttlMs ?? 120;
  const now = opts.now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const exclude = opts.exclude || null;
  const query = selectors.join(',');
  let cache = [];
  let at = -Infinity;
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
