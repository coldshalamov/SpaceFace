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
  '.fb-pill-btn:not([hidden])',   // Field Build chip: world tags keep out of its slot
  // The flight cluster (speed dial, hull/shield, power ring): 'CONCUSSION CANNON S · 500' printed over the speed
  // numeral in a Swarm fight (lead look, round 12).
  '#hud .orr-speeddial',
  // Dial labels can extend outside the instrument box.
  '#hud .orr-speeddial__lab',
  '#hud .orr-cluster',
  // The phone deck (MOB-02/03): world labels printed over the vitals strip, the keys and the first-run hint
  // in a phone Swarm round (lead look 2026-11-12). Absent on desktop, so these cost nothing there.
  '#sf-touch-overlay .mf-status',
  '#sf-touch-overlay .mf-pause',
  '#sf-touch-overlay .mf-edge',
  '#sf-touch-overlay .mf-buttons > *',
  '#sf-touch-overlay .mf-dock:not([hidden])',
  '#sf-touch-overlay .mf-toast:not([hidden])',
  '#sf-touch-overlay .mf-caption:not([hidden])',
  '#sf-touch-overlay .mf-ghost:not([hidden]) > svg',
  '#sf-touch-overlay .mf-ghost-label',
  '#hud .sf-radar-wrap',
]);

function visibleRect(r) {
  if (!r) return null;
  const w = r.width ?? r.w;
  const h = r.height ?? r.h;
  const x = r.left ?? r.x;
  const y = r.top ?? r.y;
  return w > 1 && h > 1 && Number.isFinite(x) && Number.isFinite(y) ? { x, y, w, h } : null;
}

/** Keep only rects with real area, as plain {x,y,w,h}. */
export function visibleRects(list) {
  const out = [];
  for (const r of list) {
    const rect = visibleRect(r);
    if (rect) out.push(rect);
  }
  return out;
}

function readRectRows(doc, query, exclude) {
  let elements;
  try { elements = doc?.querySelectorAll?.(query) || []; }
  catch (_) { elements = []; }
  const rows = [];
  for (const el of elements) {
    if (exclude?.(el) || el.hidden || el.closest?.('[hidden]')) continue;
    const rect = visibleRect(el.getBoundingClientRect?.());
    if (rect) rows.push({ el, rect });
  }
  return rows;
}

const DEFAULT_TTL_MS = 800;
const defaultQuery = AVOID_SELECTORS.join(',');
const sharedHudSnapshots = new WeakMap();
const docSnapshots = new WeakMap();

function createRectSnapshot(doc, query, ttl, exclude) {
  let rows = [];
  let at = -Infinity;
  const invalidate = () => { at = -Infinity; };
  doc?.defaultView?.addEventListener?.('resize', invalidate, { passive: true });
  if (doc) {
    let live = docSnapshots.get(doc);
    if (!live) docSnapshots.set(doc, live = new Set());
    live.add(invalidate);
  }
  return {
    get(t) {
      if (t - at >= ttl) {
        rows = readRectRows(doc, query, exclude);
        at = t;
      }
      return rows;
    },
    invalidate,
  };
}

/**
 * The HUD's own invalidation funnels (receipt lane, caption placement, panel open/close,
 * resize) already know when obstacles moved; callers that re-publish text-obstacle
 * geometry poke this so every snapshot re-reads on its next get() instead of waiting for
 * its TTL. Rect reads therefore follow real layout changes, not the wall clock.
 */
export function invalidateAvoidRects(doc) {
  const live = doc && docSnapshots.get(doc);
  if (live) for (const invalidate of live) invalidate();
}

/**
 * @param {Document} doc
 * @param {{ selectors?: readonly string[], extraSelectors?: readonly string[], ttlMs?: number, now?: () => number, exclude?: (el: Element) => boolean }} [opts]
 */
export function createAvoidRects(doc, opts = {}) {
  const ttl = opts.ttlMs ?? DEFAULT_TTL_MS;
  const now = opts.now || (() => (doc?.defaultView?.performance?.now() ?? globalThis.performance?.now() ?? Date.now()));
  const extraQuery = opts.extraSelectors?.join(',');
  // Share the expensive default query and geometry reads. The faster touch reader and any
  // custom queries keep their own refresh schedule and apply exclusions before layout reads.
  const shared = doc && !opts.selectors && !opts.now && ttl === DEFAULT_TTL_MS;
  let snapshot;
  if (shared) {
    snapshot = sharedHudSnapshots.get(doc);
    if (!snapshot) {
      snapshot = createRectSnapshot(doc, defaultQuery, ttl);
      sharedHudSnapshots.set(doc, snapshot);
    }
  } else {
    const query = [opts.selectors?.join(',') ?? defaultQuery, extraQuery].filter(Boolean).join(',');
    snapshot = createRectSnapshot(doc, query, ttl, opts.exclude);
  }

  let source;
  let cache = [];
  return {
    get() {
      const rows = snapshot.get(now());
      if (source === rows) return cache;
      source = rows;
      let found = shared && opts.exclude ? rows.filter(({ el }) => !opts.exclude(el)) : rows;
      if (shared && extraQuery) {
        const existing = new Set(found.map(({ el }) => el));
        const extras = readRectRows(doc, extraQuery, (el) => existing.has(el) || opts.exclude?.(el));
        // Match querySelectorAll's document order, including ties in label seating.
        found = [...found, ...extras].sort((a, b) => a.el.compareDocumentPosition(b.el) & 4 ? -1 : 1);
      }
      cache = found.map(({ rect }) => rect);
      return cache;
    },
    invalidate: snapshot.invalidate,
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
