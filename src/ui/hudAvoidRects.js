import { frameCostFixOn } from '../render/frameCostSwitches.js';
// The rects a world label must not sit in (G16-04): the Swarm centre column's live children
// (round callouts, the ignition countdown, PILE-UP / chain words), the Stage banner, and the HUD
// corner panels. Read from the live DOM so a layout change is followed, never hard-coded; cached
// for a short real-time window because the labels re-seat every frame and a rect read forces layout.

const HUD_AVOID_SELECTORS = [
  '.sf-sj__col > *:not([hidden])',
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
  '.sf-commtape',
  // The flight cluster (speed dial, hull/shield, power ring): 'CONCUSSION CANNON S · 500' printed over the speed
  // numeral in a Swarm fight (lead look, round 12).
  '#hud .orr-speeddial',
  // Dial labels can extend outside the instrument box.
  '#hud .orr-speeddial__lab',
  '#hud .orr-cluster',
  '#hud .sf-radar-wrap',
];
const TOUCH_AVOID_SELECTORS = [
  // The phone deck (MOB-02/03): world labels printed over the vitals strip, the keys and the first-run hint
  // in a phone Swarm round (lead look 2026-11-12). Absent on desktop, so these cost nothing there.
  '.mf-status',
  '.mf-pause',
  '.mf-edge',
  '.mf-buttons > *',
  '.mf-dock:not([hidden])',
  '.mf-toast:not([hidden])',
  '.mf-caption:not([hidden])',
  '.mf-ghost:not([hidden]) > svg',
  '.mf-ghost-label',
];
const TOAST_SELECTOR = '.sf-toast:not(.sf-toast--out)';
const STAGE_SELECTOR = '.sf-stage__item';
const ALERT_SELECTOR = '.sf-alert';
const FIELD_BUILD_SELECTOR = '.fb-pill-btn:not([hidden])';
export const AVOID_SELECTORS = Object.freeze([
  ...HUD_AVOID_SELECTORS,
  `#sf-stage-banner ${STAGE_SELECTOR}`,
  '#sf-stage-banner #alerts > *',
  `#alerts ${ALERT_SELECTOR}`,
  `#toasts ${TOAST_SELECTOR}`,
  '#sf-sector-law',
  FIELD_BUILD_SELECTOR,
  ...TOUCH_AVOID_SELECTORS.map((selector) => `#sf-touch-overlay ${selector}`),
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

const DEFAULT_TTL_MS = 800;
const defaultQuery = AVOID_SELECTORS.join(',');
// The Swarm centre column's live children change with every callout; the column itself is stable,
// so the children are walked by hand and only the stable panels go through one cached query.
const SJ_COLUMN_SELECTOR = '.sf-sj__col';
const hudQuery = HUD_AVOID_SELECTORS.filter((selector) => !selector.startsWith(SJ_COLUMN_SELECTOR)).join(',');
// The mounted HUD panels are structural: they are found once and kept, re-found only after this
// long or on a viewport resize. Re-running a 17-selector query over the whole HUD subtree on every
// read was 28 ms of every second of a round-6 Swarm fight.
const STRUCTURE_TTL_MS = 3000;
const touchQuery = TOUCH_AVOID_SELECTORS.join(',');

function byDocumentOrder(a, b) {
  return a.compareDocumentPosition(b) & 4 ? -1 : 1;
}

const structureCache = new WeakMap();
function cachedDocEl(doc, entry, prop, id) {
  let el = entry[prop];
  if (!el || el.isConnected === false) el = entry[prop] = doc.getElementById(id) || null;
  return el;
}
function hudStructure(doc, hud, t) {
  let entry = structureCache.get(hud);
  if (entry && t - entry.at < STRUCTURE_TTL_MS && !entry.stale) {
    let colsDead = entry.columns.length === 0;
    if (!colsDead) {
      for (let i = 0; i < entry.columns.length; i++) {
        if (entry.columns[i].isConnected === false) { colsDead = true; break; }
      }
    }
    if (colsDead) entry.columns = Array.from(hud.querySelectorAll(SJ_COLUMN_SELECTOR));
    return entry;
  }
  if (!entry) {
    entry = {
      at: -Infinity, stale: true, panels: [], columns: [],
      stage: null, alerts: null, toasts: null, touchOverlay: null, sectorLaw: null,
    };
    structureCache.set(hud, entry);
    doc?.defaultView?.addEventListener?.('resize', () => { entry.stale = true; }, { passive: true });
  }
  entry.panels = Array.from(hud.querySelectorAll(hudQuery));
  entry.columns = Array.from(hud.querySelectorAll(SJ_COLUMN_SELECTOR));
  entry.at = t;
  entry.stale = false;
  return entry;
}

function defaultAvoidElements(doc) {
  const hud = doc?.getElementById?.('hud');
  const uiRoot = doc?.getElementById?.('ui-root');
  if (!hud?.querySelectorAll || !uiRoot?.querySelectorAll) {
    return doc?.querySelectorAll?.(defaultQuery) || [];
  }

  // World labels refresh during HUD churn. Keep obstacle discovery inside the mounted HUD
  // and its overlay owners, away from the screens and other unchanging document subtrees.
  const structure = hudStructure(doc, hud, doc.defaultView?.performance?.now?.() ?? globalThis.performance?.now?.() ?? Date.now());
  const elements = new Set();
  for (const column of structure.columns) {
    const kids = column.children;
    if (kids) for (let i = 0; i < kids.length; i += 1) { if (!kids[i].hidden) elements.add(kids[i]); }
  }
  for (const el of structure.panels) {
    if (el && el.isConnected !== false) elements.add(el);
  }
  const add = (root, selector) => {
    if (!root) return;
    const childCount = root.childElementCount ?? root.children?.length;
    if (childCount === 0) return;
    for (const el of root.querySelectorAll(selector)) elements.add(el);
  };
  const stage = cachedDocEl(doc, structure, 'stage', 'sf-stage-banner');
  const alerts = cachedDocEl(doc, structure, 'alerts', 'alerts');
  add(stage, STAGE_SELECTOR);
  add(alerts, stage?.contains(alerts) ? `:scope > *,${ALERT_SELECTOR}` : ALERT_SELECTOR);
  add(cachedDocEl(doc, structure, 'toasts', 'toasts'), TOAST_SELECTOR);
  add(uiRoot, `:scope > ${FIELD_BUILD_SELECTOR}`);
  add(cachedDocEl(doc, structure, 'touchOverlay', 'sf-touch-overlay'), touchQuery);
  // Sector law moves out of the HUD and into #ui-root in the mobile layout.
  const sectorLaw = cachedDocEl(doc, structure, 'sectorLaw', 'sf-sector-law');
  if (sectorLaw) elements.add(sectorLaw);
  return Array.from(elements).sort(byDocumentOrder);
}

function hasHiddenAncestor(el) {
  if (!el) return false;
  if (el.parentElement === undefined && typeof el.closest === 'function') {
    return !!el.closest('[hidden]');
  }
  for (let p = el; p; p = p.parentElement) {
    if (p.hidden || (typeof p.hasAttribute === 'function' && p.hasAttribute('hidden'))) return true;
  }
  return false;
}

// A selector list run over the whole document is the expensive part of an ad-hoc reader (every
// screen is mounted under it). The panels such a list names are mounted once, so the found nodes
// are kept for this long while they all stay connected; their rectangles are still read fresh.
const SELECTOR_NODES_KEEP_MS = 3000;
function selectorNodes(doc, query, keep) {
  if (keep && keep.els) {
    const t = doc?.defaultView?.performance?.now?.() ?? Date.now();
    let live = t - keep.at < SELECTOR_NODES_KEEP_MS;
    for (let i = 0; live && i < keep.els.length; i += 1) if (keep.els[i].isConnected === false) live = false;
    if (live) return keep.els;
  }
  const els = doc?.querySelectorAll?.(query) || [];
  if (keep) {
    keep.els = Array.from(els);
    keep.at = doc?.defaultView?.performance?.now?.() ?? Date.now();
    return keep.els;
  }
  return els;
}

function readRectRows(doc, query, exclude, keep = null, rectMemo = null) {
  let elements;
  try {
    elements = query === defaultQuery ? defaultAvoidElements(doc) : selectorNodes(doc, query, keep);
  }
  catch (_) { elements = []; }
  const rows = [];
  for (const el of elements) {
    if (exclude?.(el) || el.hidden || hasHiddenAncestor(el)) continue;
    let rect;
    if (rectMemo && rectMemo.has(el)) {
      rect = rectMemo.get(el);
    } else {
      rect = visibleRect(el.getBoundingClientRect?.());
      if (rectMemo) rectMemo.set(el, rect);
    }
    if (rect) rows.push({ el, rect });
  }
  return rows;
}

const sharedHudSnapshots = new WeakMap();
const docSnapshots = new WeakMap();

// Layout-change invalidations arrive in bursts in a busy fight (every receipt card, caption and
// alert re-announces). Each one used to force a fresh querySelectorAll + getBoundingClientRect
// sweep on the next frame — the Swarm round-20 profile showed ~86 ms of forced layout per second.
// An invalidation now re-reads on the next get() only once this long has passed since the last
// read: at most ~7 reads a second, while a quiet HUD still follows a real change within a frame.
export const AVOID_RECT_INVALIDATE_COALESCE_MS = 500;
// ?rfx=-hudRects (or a live probe flip) restores the old every-invalidation / every-frame reads so
// the saving can be measured against its absence in one page.
const hudRectCacheOn = () => frameCostFixOn('hudRects');

// Reading a rectangle straight after the frame's HUD writes makes the browser lay the whole page
// out on the spot (5-118 ms a time in a round-6 Swarm fight). The browser lays the page out once per
// frame anyway, after the frame callbacks, and a ResizeObserver callback runs right after that pass:
// rectangles read there are already computed and cost nothing. afterLayout(doc, fn) runs fn in that
// slot of the current frame (a hidden one-pixel sentinel is nudged so the observer fires). Hosts
// without a ResizeObserver or a body (tests, partial DOMs) get `false` back and read directly.
//
// The slot is free only while nothing in it writes: a job that moves the HUD (the receipt lane)
// followed by a job that reads a rectangle made the browser lay the whole page out a second time
// inside the slot (60+ ms in a round-6 fight, 87 ms inside the longest main-thread task). So jobs
// that only read run first, jobs declared as writers (opts.writes) run last, and the slot stops
// taking new jobs once it has spent AFTER_LAYOUT_BUDGET_MS: the rest ride the next frame's slot.
export const AFTER_LAYOUT_BUDGET_MS = 2;
const layoutPhases = new WeakMap();
export function afterLayout(doc, fn, opts = null) {
  const view = doc && doc.defaultView;
  const Observer = view && view.ResizeObserver;
  if (typeof Observer !== 'function' || !doc.body || typeof doc.createElement !== 'function'
    || typeof doc.body.appendChild !== 'function') return false;
  let phase = layoutPhases.get(doc);
  if (!phase) {
    const sentinel = doc.createElement('div');
    if (!sentinel || !sentinel.style) return false;
    sentinel.setAttribute?.('aria-hidden', 'true');
    sentinel.style.cssText = 'position:fixed;left:-99px;top:0;width:1px;height:1px;visibility:hidden;pointer-events:none;contain:strict;';
    phase = { sentinel, pending: new Set(), writers: new Set(), tall: false, observer: null, running: false, nudgeQueued: false, nudgedAt: -Infinity, carry: null };
    try {
      phase.observer = new Observer(() => {
        if (!phase.pending.size) return;
        const all = Array.from(phase.pending);
        const run = all.filter((job) => !phase.writers.has(job)).concat(all.filter((job) => phase.writers.has(job)));
        phase.pending.clear();
        phase.running = true;
        const perf = view.performance;
        const started = perf && typeof perf.now === 'function' ? perf.now() : 0;
        let done = 0;
        try {
          for (; done < run.length; done += 1) {
            // Always one job; after that only while the slot is inside its budget.
            if (done > 0 && perf && perf.now() - started > AFTER_LAYOUT_BUDGET_MS) break;
            const job = run[done];
            phase.writers.delete(job);
            try { job(); } catch (_) { /* one reader never blocks the rest */ }
          }
        } finally { phase.running = false; }
        if (done < run.length) {
          // Carried jobs keep their order ahead of anything asked for during this slot.
          const late = Array.from(phase.pending);
          phase.pending.clear();
          for (let i = done; i < run.length; i += 1) phase.pending.add(run[i]);
          for (const job of late) phase.pending.add(job);
          if (!phase.nudgeQueued && phase.carry && typeof view.requestAnimationFrame === 'function') {
            phase.nudgeQueued = true;
            view.requestAnimationFrame(phase.carry);
          }
        }
      });
      doc.body.appendChild(sentinel);
      phase.observer.observe(sentinel);
    } catch (_) { return false; }
    layoutPhases.set(doc, phase);
  }
  if (phase.sentinel.isConnected === false) { try { doc.body.appendChild(phase.sentinel); } catch (_) { return false; } }
  const first = phase.pending.size === 0;
  phase.pending.add(fn);
  if (opts && opts.writes === true) phase.writers.add(fn);
  const clock = () => (view.performance && typeof view.performance.now === 'function' ? view.performance.now() : Date.now());
  const nudge = () => {
    phase.nudgeQueued = false;
    if (!phase.pending.size) return;
    phase.tall = !phase.tall;
    phase.sentinel.style.height = phase.tall ? '2px' : '1px';
    phase.nudgedAt = clock();
  };
  phase.carry = nudge;
  if (phase.running) {
    // Asked from inside the post-layout slot itself: nudging the sentinel now would make the
    // observer loop on its own element, so the job takes the next frame's slot.
    if (!phase.nudgeQueued && typeof view.requestAnimationFrame === 'function') {
      phase.nudgeQueued = true;
      view.requestAnimationFrame(nudge);
    } else if (!phase.nudgeQueued) { phase.pending.delete(fn); return false; }
  } else if (first || (!phase.nudgeQueued && clock() - phase.nudgedAt > 200)) {
    // A second nudge in one frame would put the sentinel back to its old size and cancel the
    // first; jobs left over from a frame that never rendered get a fresh nudge after a while.
    nudge();
  }
  return true;
}
// A read asked for after layout that has not arrived this long later (hidden window, an observer
// that never fires) is taken directly instead.
const AFTER_LAYOUT_PATIENCE_MS = 400;

function createRectSnapshot(doc, query, ttl, exclude, perFrameWhenOff = false, customNow = false) {
  let rows = [];
  let at = -Infinity;
  let lastReadAt = -Infinity;
  let dirty = false;
  let askedAt = -Infinity;
  let asked = false;
  const invalidate = () => { dirty = true; };
  // A viewport resize moves every panel at once: re-read on the very next get().
  const invalidateNow = () => { at = -Infinity; keptNodes.els = null; };
  doc?.defaultView?.addEventListener?.('resize', invalidateNow, { passive: true });
  const keptNodes = { els: null, at: -Infinity };
  const readAfterLayout = () => {
    asked = false;
    rows = readRectRows(doc, query, exclude, keptNodes);
    dirty = false;
  };
  const snapshot = {
    get(t, proactive = false, rectMemo = null) {
      if (proactive === true) {
        if (at !== -Infinity && (lastReadAt === -Infinity || t - lastReadAt > 1500)) {
          return rows;
        }
      } else {
        lastReadAt = t;
      }
      const cacheOn = hudRectCacheOn();
      const effectiveTtl = cacheOn
        ? (!customNow && ttl >= 200 ? Math.max(ttl, 1000) : ttl)
        : (perFrameWhenOff ? 0 : ttl);
      const coalesceMs = cacheOn ? AVOID_RECT_INVALIDATE_COALESCE_MS : 0;
      if (t - at >= effectiveTtl || (dirty && t - at >= coalesceMs)) {
        // The first read, a custom clock (tests) and the measurable old path read on the spot;
        // every later refresh waits for this frame's own layout pass.
        if (asked && t - askedAt < AFTER_LAYOUT_PATIENCE_MS) return rows;
        if (cacheOn && !customNow && at !== -Infinity && !asked && afterLayout(doc, readAfterLayout)) {
          asked = true;
          askedAt = t;
          at = t;
          return rows;
        }
        asked = false;
        rows = readRectRows(doc, query, exclude, keptNodes, rectMemo);
        at = t;
        dirty = false;
      }
      return rows;
    },
    invalidate,
  };
  if (doc) {
    let live = docSnapshots.get(doc);
    if (!live) docSnapshots.set(doc, live = new Set());
    live.add(invalidate);
    let due = dueSnapshots.get(doc);
    if (!due) dueSnapshots.set(doc, due = new Set());
    due.add(snapshot);
  }
  return snapshot;
}

const dueSnapshots = new WeakMap();

/**
 * Read phase for the UI frame: refresh every snapshot that is due BEFORE the HUD starts writing
 * this frame. A rect read after DOM writes forces a synchronous layout; reading them all first
 * costs at most one layout (usually none: the browser laid the page out at the last paint), and
 * every later get() in the frame returns the cached rows. uiRoot.frame calls this first.
 */
export function refreshDueAvoidRects(doc, t = (doc?.defaultView?.performance?.now() ?? globalThis.performance?.now() ?? Date.now())) {
  const due = doc && dueSnapshots.get(doc);
  if (!due) return;
  const rectMemo = new Map();
  for (const snapshot of due) snapshot.get(t, true, rectMemo);
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
  const customNow = typeof opts.now === 'function';
  const now = opts.now || (() => (doc?.defaultView?.performance?.now() ?? globalThis.performance?.now() ?? Date.now()));
  const extraQuery = opts.extraSelectors?.join(',');
  // Share the expensive default query and geometry reads across compatible TTLs (>= 200ms).
  // Short-interval test/custom readers keep their own refresh schedule.
  const shared = doc && !opts.selectors && !customNow && ttl >= 200;
  let snapshot;
  if (shared) {
    snapshot = sharedHudSnapshots.get(doc);
    if (!snapshot) {
      snapshot = createRectSnapshot(doc, defaultQuery, ttl);
      sharedHudSnapshots.set(doc, snapshot);
    }
  } else {
    const query = [opts.selectors?.join(',') ?? defaultQuery, extraQuery].filter(Boolean).join(',');
    snapshot = createRectSnapshot(doc, query, ttl, opts.exclude, false, customNow);
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
        found = [...found, ...extras].sort((a, b) => byDocumentOrder(a.el, b.el));
      }
      cache = found.map(({ rect }) => rect);
      return cache;
    },
    invalidate: snapshot.invalidate,
  };
}

/**
 * Cached rects of an ad-hoc selector list for a per-frame placement pass: the same snapshot
 * machinery (TTL, resize, invalidateAvoidRects) as the HUD avoid list, so the frame never queries
 * the DOM or forces layout itself. Returns { get(): {x,y,w,h}[] , invalidate() }.
 * @param {Document} doc
 * @param {string} selectors comma list
 * @param {{ ttlMs?: number, exclude?: (el: Element) => boolean, now?: () => number }} [opts]
 */
const sharedSelectorSnapshots = new WeakMap();

export function createSelectorRects(doc, selectors, opts = {}) {
  const customNow = typeof opts.now === 'function';
  const now = opts.now || (() => (doc?.defaultView?.performance?.now() ?? globalThis.performance?.now() ?? Date.now()));
  const ttlMs = opts.ttlMs ?? 250;
  const canShare = !!(doc && !customNow);
  let snapshot;
  if (canShare) {
    let byKey = sharedSelectorSnapshots.get(doc);
    if (!byKey) sharedSelectorSnapshots.set(doc, byKey = new Map());
    const key = `${selectors}|${Math.max(ttlMs, 1000)}`;
    snapshot = byKey.get(key);
    if (!snapshot) {
      snapshot = createRectSnapshot(doc, selectors, ttlMs, undefined, true, false);
      byKey.set(key, snapshot);
    }
  } else {
    snapshot = createRectSnapshot(doc, selectors, ttlMs, opts.exclude, true, customNow);
  }
  let source;
  let cache = [];
  return {
    get() {
      const rows = snapshot.get(now());
      if (rows !== source) {
        source = rows;
        const found = canShare && opts.exclude ? rows.filter(({ el }) => !opts.exclude(el)) : rows;
        cache = found.map(({ rect }) => rect);
      }
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
