// screenMemory.js — J4 "Screen state memory" (CANONICAL_BUILD_MAP §11.12).
//
// A per-screen state bag, persisted per save: active tab, filters, sort order, layer set, zoom,
// selection, scroll position. Invisible when present, infuriating when absent — inhibitor #7 is
// "galaxyMap.js persists no layer toggle, commodity, zoom or tab; every open is a fresh open."
//
// It is Phase 0 rather than a feature for the reason §11.9 gives: anything every screen needs must
// exist before the first screen is built, or every screen gets touched a second time.
//
// FOUR THINGS THIS MODULE DECIDES, each because getting them wrong is expensive later:
//
//  1. WHERE IT LIVES. `state.ui.screenMemory`. `core/simSnapshot.js` builds the replay hash from an
//     explicit ALLOW-LIST (meta/tick/simTime/mode/playerId/player/input/economy/missions/scenario/
//     story/combat/entities/physics) and `ui` is not on it, so UI state here cannot drift the 47a
//     determinism goldens. This is the same placement causeLedger uses and documents.
//
//  2. WHAT MAY BE RESTORED. Restoring a pending destructive confirmation would re-arm a decision the
//     player never made twice. Keys are screened by name against DENY_KEY, and values are screened
//     by SHAPE — only JSON primitives, flat arrays, and one level of flat object survive. Anything
//     else is dropped at write time, not at read time, so a bad value never reaches the save file.
//
//  3. THE CAP AND EVICTION POLICY, which §11.12's trap demands be declared with the key. 16 screens
//     (the registry holds ~19; a player realistically revisits far fewer), least-recently-touched
//     evicted first. 24 keys per screen, oldest-written evicted first. Strings clamp to 160 chars,
//     arrays to 32 entries. The bound is on the WRITE path so the ceiling holds even if a screen
//     loops.
//
//  4. STALENESS IS THE CALLER'S PROBLEM, and it is a real one. A filter restored from three hours
//     ago that now matches nothing is exactly the "correct-but-blank reads as broken" defect J3
//     exists to catch — so each bag carries the `simTime` it was written at, and screens that
//     restore a filter can tell the player why a pane is empty instead of silently lying.
//
// PURE and VIEW-ONLY: no imports, no DOM, no sim mutation. Everything is plain data so the save
// system can serialize it without a bespoke codec.

export const SCREEN_MEMORY_VERSION = 1;

// Declared caps — see note 3. Changing these is a save-shape decision, not a tuning knob.
export const MAX_SCREENS = 16;
export const MAX_KEYS_PER_SCREEN = 24;
const MAX_STRING = 160;
const MAX_ARRAY = 32;
const MAX_OBJECT_KEYS = 32;

// Keys whose restoration would re-arm a decision, resurrect a transient, or leak. Matched on the
// KEY NAME because that is the only thing available at write time. Screens that genuinely need one
// of these words for benign state should rename the key — the cost of a false positive here is a
// forgotten preference; the cost of a false negative is a destructive prompt the player never
// opened, pre-confirmed.
const DENY_KEY = /confirm|pending|armed|destruct|delete|undock|exit|token|secret|password|session|handle|callback|_el$|Element$/i;

/** A bag holds DATA, not objects with behaviour. A class instance, a DOM node, a Map and a Set all
 *  fail this, which is the point — they would serialize to `{}` and restore as a lie. */
function isPlainObject(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** Primitive that survives JSON and means the same thing on the other side. */
function cleanPrimitive(v) {
  if (v === null) return null;
  const t = typeof v;
  if (t === 'boolean') return v;
  if (t === 'number') return Number.isFinite(v) ? v : undefined;
  if (t === 'string') return v.length > MAX_STRING ? v.slice(0, MAX_STRING) : v;
  return undefined;
}

/**
 * Screen a value by SHAPE. Returns `undefined` for anything that must not be stored — a DOM node,
 * a function, a class instance, a Map, a cyclic graph. Dropping at write time means a bad value can
 * never reach the save file, so load never has to defend against one.
 */
export function sanitizeValue(v, depth = 0) {
  const prim = cleanPrimitive(v);
  if (prim !== undefined || v === null) return prim;
  if (Array.isArray(v)) {
    if (depth >= 1) return undefined;                 // no nested arrays: a bag is not a document
    const out = [];
    for (const item of v.slice(0, MAX_ARRAY)) {
      const c = cleanPrimitive(item);
      if (c !== undefined || item === null) out.push(c);
    }
    return out;
  }
  if (v && typeof v === 'object' && !isPlainObject(v)) return undefined;   // class instance / DOM / Map
  if (v && typeof v === 'object') {
    if (depth >= 1) return undefined;                 // one level only — galaxyMap's `_layers` fits
    const out = {};
    let n = 0;
    for (const k of Object.keys(v)) {
      if (n >= MAX_OBJECT_KEYS) break;
      if (DENY_KEY.test(k)) continue;
      const c = cleanPrimitive(v[k]);
      if (c !== undefined || v[k] === null) { out[k] = c; n++; }
    }
    // An object whose every member was rejected is NOT an empty object worth storing — it is a
    // value we could not represent. Storing `{}` would put noise in the save file and hand the
    // screen a lie that restores as "all layers off". Drop it. (Found by test.)
    return n > 0 ? out : undefined;
  }
  return undefined;
}

/**
 * createScreenMemory(state) — the bag store, bound to `state.ui.screenMemory`.
 *
 * Bound to live state rather than holding its own copy so a load that replaces `state.ui` wholesale
 * cannot leave the store pointing at an orphan. Every read re-reads the root.
 */
export function createScreenMemory(state) {
  function root() {
    if (!state) return null;
    if (!state.ui || typeof state.ui !== 'object') state.ui = {};
    if (!state.ui.screenMemory || typeof state.ui.screenMemory !== 'object') {
      state.ui.screenMemory = { v: SCREEN_MEMORY_VERSION, bags: {} };
    }
    const r = state.ui.screenMemory;
    if (!r.bags || typeof r.bags !== 'object') r.bags = {};
    return r;
  }

  // Recency is ordered by a monotonic WRITE COUNTER, not by simTime. Menus pause the world (owner
  // ruling, build map §11.3 — PAUSING_SCREENS in screenManager), so simTime is frozen for exactly
  // as long as the player is using screens: every bag would carry an identical timestamp and
  // eviction order would be undefined. `t` is kept alongside, but only for staleness reporting.
  // (Found by test, not by reading — the first version evicted an arbitrary bag.)
  let seq = 0;

  /** Least-recently-WRITTEN screen evicted first — a player returns to what they last used. */
  function evictScreens(bags) {
    const ids = Object.keys(bags);
    if (ids.length <= MAX_SCREENS) return;
    ids.sort((a, b) => (Number(bags[a] && bags[a].n) || 0) - (Number(bags[b] && bags[b].n) || 0));
    for (const id of ids.slice(0, ids.length - MAX_SCREENS)) delete bags[id];
  }

  /** Oldest-written key evicted first within a bag. `bag.o` is insertion order; any key missing
   *  from it (an older save, a hand-edited file) is treated as oldest and goes first. */
  function evictKeys(bag) {
    if (Object.keys(bag.d).length <= MAX_KEYS_PER_SCREEN) return;
    const tracked = (bag.o || []).filter((k) => k in bag.d);
    const untracked = Object.keys(bag.d).filter((k) => !tracked.includes(k));
    for (const k of [...untracked, ...tracked]) {
      if (Object.keys(bag.d).length <= MAX_KEYS_PER_SCREEN) break;
      delete bag.d[k];
    }
    bag.o = (bag.o || []).filter((k) => k in bag.d);
  }

  return {
    /** The whole bag for a screen. Always an object, never null — callers destructure it freely. */
    get(screenId) {
      const r = root();
      if (!r || !screenId) return {};
      const bag = r.bags[screenId];
      return (bag && bag.d) || {};
    },

    /** One value, with a fallback. The common call. */
    read(screenId, key, fallback) {
      const d = this.get(screenId);
      return key in d ? d[key] : fallback;
    },

    /** When this screen's bag was last written, in simTime. Screens use it to judge staleness. */
    writtenAt(screenId) {
      const r = root();
      const bag = r && r.bags[screenId];
      return bag ? (Number(bag.t) || 0) : 0;
    },

    /**
     * Merge a patch into a screen's bag. Denied keys and unstorable shapes are DROPPED here rather
     * than at load, so the save file can never carry one. Returns the number of keys written.
     */
    set(screenId, patch) {
      const r = root();
      if (!r || !screenId || !patch || typeof patch !== 'object') return 0;
      let bag = r.bags[screenId];
      if (!bag || typeof bag !== 'object') { bag = { t: 0, n: 0, d: {}, o: [] }; r.bags[screenId] = bag; }
      if (!bag.d || typeof bag.d !== 'object') bag.d = {};
      if (!Array.isArray(bag.o)) bag.o = [];
      let n = 0;
      for (const k of Object.keys(patch)) {
        if (DENY_KEY.test(k)) continue;
        const v = sanitizeValue(patch[k]);
        if (v === undefined) continue;
        if (!(k in bag.d)) bag.o.push(k);
        bag.d[k] = v;
        n++;
      }
      bag.t = Number(state && state.simTime) || bag.t || 0;
      bag.n = ++seq;
      evictKeys(bag);
      evictScreens(r.bags);
      return n;
    },

    /** Drop one screen's memory — used when a screen's state is invalidated by a world change. */
    forget(screenId) {
      const r = root();
      if (r && screenId) delete r.bags[screenId];
    },

    clear() {
      const r = root();
      if (r) r.bags = {};
    },

    screenCount() {
      const r = root();
      return r ? Object.keys(r.bags).length : 0;
    },

    /** Plain-data snapshot for the save file. Re-sanitized: cheap, and the save is the wrong place
     *  to discover that something slipped through. */
    serialize() {
      const r = root();
      if (!r) return { v: SCREEN_MEMORY_VERSION, bags: {} };
      const bags = {};
      for (const id of Object.keys(r.bags)) {
        const bag = r.bags[id];
        if (!bag || !bag.d) continue;
        const d = {};
        for (const k of Object.keys(bag.d)) {
          if (DENY_KEY.test(k)) continue;
          const v = sanitizeValue(bag.d[k]);
          if (v !== undefined) d[k] = v;
        }
        if (Object.keys(d).length) bags[id] = { t: Number(bag.t) || 0, n: Number(bag.n) || 0, d, o: (bag.o || []).filter((k) => k in d) };
      }
      return { v: SCREEN_MEMORY_VERSION, bags };
    },

    /** Restore from a save. Hostile input is expected: an old save, a hand-edited file, or a bag
     *  written by a build with different caps. Everything is re-screened and re-capped. */
    deserialize(raw) {
      const r = root();
      if (!r) return;
      r.bags = {};
      if (!raw || typeof raw !== 'object' || !raw.bags || typeof raw.bags !== 'object') return;
      for (const id of Object.keys(raw.bags)) {
        const bag = raw.bags[id];
        if (!bag || typeof bag !== 'object' || !bag.d || typeof bag.d !== 'object') continue;
        const d = {};
        for (const k of Object.keys(bag.d)) {
          if (DENY_KEY.test(k)) continue;
          const v = sanitizeValue(bag.d[k]);
          if (v !== undefined) d[k] = v;
        }
        if (Object.keys(d).length) {
          const n = Number(bag.n) || 0;
          r.bags[id] = { t: Number(bag.t) || 0, n, d, o: Object.keys(d) };
          if (n > seq) seq = n;   // never reissue a counter value a restored bag already holds
        }
      }
      for (const id of Object.keys(r.bags)) evictKeys(r.bags[id]);
      evictScreens(r.bags);
    },
  };
}

export default createScreenMemory;
