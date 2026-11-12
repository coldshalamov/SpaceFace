// Floating-text rules (G16-04) — pure, DOM-free. One place decides:
//   * which words MERGE (the same word, near in time and place, becomes one label with a count),
//   * how many may live at once (a cap with priorities), and
//   * where a label may NOT sit (a seat that avoids the HUD panels and the Swarm centre column).
// floatingText.js (world floats + pad tags) and swarmJuiceHud.js (the kill words) both call this,
// so the two layers obey one law and the tests pin it without a browser.

export const FT_MAX_LIVE = 4;
export const FT_MERGE_WINDOW_S = 1.5;
export const FT_MERGE_RADIUS_PX = 220;
/** When no clear seat exists a label dims to this instead of covering a panel at full strength. */
export const FT_YIELD_OPACITY = 0.35;

/** Lower number loses its seat first: damage numbers < status words < words the player earned. */
export const FT_PRIORITY = Object.freeze({ damage: 0, status: 1, earned: 2 });

const EARNED_CLASS = /sf-ft--(bounty|credits|rights)\b/;
const DAMAGE_CLASS = /sf-ft--(hull|shield|player)\b/;

/** Priority of a pooled float from its class string (and, for Swarm kill words, its cause). */
export function floatPriority(cls = '', opts = {}) {
  if (opts.earned) return FT_PRIORITY.earned;
  const c = String(cls);
  if (EARNED_CLASS.test(c)) return FT_PRIORITY.earned;
  if (DAMAGE_CLASS.test(c)) return FT_PRIORITY.damage;
  return FT_PRIORITY.status;
}

const NUM_WORD = /^\+(\d+)(\s*CR)?\s+(.+?)(?:\s+×(\d+))?$/;
const COUNT_WORD = /^(.+?)(?:\s+×(\d+))?$/;

/**
 * Split a float's text into its mergeable parts. A bare numeral (a damage number) has no key —
 * damage numbers keep their own short-burst aggregation and never merge here.
 *   '+12 SHUNTED' -> { key:'SHUNTED', num:12, unit:'', count:1 }
 *   'FRIENDLY FIRE ×3' -> { key:'FRIENDLY FIRE', num:null, unit:'', count:3 }
 */
export function parseFloatWord(text) {
  const t = String(text == null ? '' : text).trim();
  if (!t || /^[\d.,]+$/.test(t)) return null;
  let m = NUM_WORD.exec(t);
  if (m) {
    return { key: m[3].trim().toUpperCase(), word: m[3].trim(), num: Number(m[1]), unit: m[2] ? ' CR' : '',
      count: m[4] ? Number(m[4]) : 1 };
  }
  m = COUNT_WORD.exec(t);
  if (!m) return null;
  return { key: m[1].trim().toUpperCase(), word: m[1].trim(), num: null, unit: '', count: m[2] ? Number(m[2]) : 1 };
}

/** Rebuild the one label: a summed figure when the word carried one, else "WORD ×n". */
export function formatFloatWord(p) {
  if (!p) return '';
  if (p.num != null) return `+${Math.round(p.num)}${p.unit} ${p.word}`;
  return p.count > 1 ? `${p.word} ×${p.count}` : p.word;
}

/** Fold `next` (parsed) into `into` (parsed) in place. */
export function mergeFloatWord(into, next) {
  into.count = (into.count || 1) + (next.count || 1);
  if (into.num != null && next.num != null) into.num += next.num;
  return into;
}

/**
 * Find the live label a new word should merge into: same key, born within the window, and within
 * the radius (screen px). Items: { key, x, y, born }. Returns the index or -1.
 */
export function findMergeTarget(items, key, x, y, now, opts = {}) {
  if (!key) return -1;
  const win = opts.windowS ?? FT_MERGE_WINDOW_S;
  const rad = opts.radiusPx ?? FT_MERGE_RADIUS_PX;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it || it.key !== key) continue;
    if (now - it.born > win) continue;
    const d = Math.hypot((it.x || 0) - x, (it.y || 0) - y);
    if (d <= rad && d < bestD) { best = i; bestD = d; }
  }
  return best;
}

/**
 * Which live label gives up its seat for a newcomer of `priority`. Lowest priority goes first, the
 * oldest within it. Returns -1 when every live label outranks the newcomer: the newcomer is the
 * one dropped. Below the cap nothing is evicted (-2 = "room, no victim needed").
 */
export function pickEvictee(items, priority, max = FT_MAX_LIVE) {
  if (items.length < max) return -2;
  let v = -1;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.priority > priority) continue;
    if (v < 0 || it.priority < items[v].priority
      || (it.priority === items[v].priority && it.born < items[v].born)) v = i;
  }
  return v;
}

function hits(b, r, pad) {
  return b.x < r.x + r.w + pad && b.x + b.w > r.x - pad && b.y < r.y + r.h + pad && b.y + b.h > r.y - pad;
}

/**
 * Seat a label (box = top-left x,y and w,h in px) so it overlaps none of `rects`, staying inside
 * `bounds` {w,h}. Tries the nearest clear spot (just past each blocking edge, then the four
 * sides in turn); when nothing is clear returns the original box with `fade` = FT_YIELD_OPACITY.
 * Returns { x, y, fade } where fade is 1 when the seat is clear. x,y are the new top-left.
 */
export function seatOutOfRects(box, rects, bounds, opts = {}) {
  const pad = opts.pad ?? 4;
  const list = rects.filter((r) => r && r.w > 0 && r.h > 0);
  const blocked = (b) => list.some((r) => hits(b, r, pad));
  if (!blocked(box)) return { x: box.x, y: box.y, fade: 1 };
  const maxX = Math.max(0, (bounds.w || 0) - box.w);
  const maxY = Math.max(0, (bounds.h || 0) - box.h);
  const cands = [];
  for (const r of list) {
    if (!hits(box, r, pad)) continue;
    cands.push({ x: box.x, y: r.y + r.h + pad });          // below the blocker
    cands.push({ x: box.x, y: r.y - box.h - pad });        // above
    cands.push({ x: r.x + r.w + pad, y: box.y });          // right of it
    cands.push({ x: r.x - box.w - pad, y: box.y });        // left of it
  }
  let best = null;
  let bestD = Infinity;
  for (const c of cands) {
    if (c.x < 0 || c.y < 0 || c.x > maxX || c.y > maxY) continue;
    if (blocked({ x: c.x, y: c.y, w: box.w, h: box.h })) continue;
    const d = Math.hypot(c.x - box.x, c.y - box.y);
    if (d < bestD) { best = c; bestD = d; }
  }
  if (best) return { x: best.x, y: best.y, fade: 1 };
  return { x: box.x, y: box.y, fade: FT_YIELD_OPACITY };
}

const realNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

/**
 * The shared ledger of floating words on screen. The world floats and the Swarm kill words both
 * register here, so "at most four, merged, by priority" holds across both layers rather than per
 * layer. A layer admits a word, gets back what to do, and keeps the entry's x/y current.
 *
 *   admit({ text, x, y, priority }) ->
 *     { action:'merged', entry }  the word folded into a live label (entry.refresh(text) already called)
 *     { action:'dropped' }        every live label outranks it and the screen is full
 *     { action:'new', entry }     seat it; set entry.refresh / entry.evict, call release(entry) on expiry
 */
export function createFloatLedger(opts = {}) {
  const now = opts.now || realNow;
  const max = opts.max ?? FT_MAX_LIVE;
  const live = [];
  return {
    live,
    max,
    admit({ text, x = 0, y = 0, priority = FT_PRIORITY.status, mergeable = true }) {
      const t = now();
      const parsed = mergeable ? parseFloatWord(text) : null;
      const key = parsed ? parsed.key : null;
      const hit = findMergeTarget(live, key, x, y, t);
      if (hit >= 0) {
        const entry = live[hit];
        mergeFloatWord(entry.parsed, parsed);
        entry.born = t;
        entry.priority = Math.max(entry.priority, priority);
        entry.text = formatFloatWord(entry.parsed);
        if (typeof entry.refresh === 'function') entry.refresh(entry.text);
        return { action: 'merged', entry };
      }
      const v = pickEvictee(live, priority, max);
      if (v === -1) return { action: 'dropped' };
      if (v >= 0) {
        const victim = live[v];
        live.splice(v, 1);
        if (typeof victim.evict === 'function') victim.evict();
      }
      const entry = { key, parsed, text: String(text), x, y, born: t, priority, refresh: null, evict: null };
      live.push(entry);
      return { action: 'new', entry };
    },
    release(entry) {
      const i = live.indexOf(entry);
      if (i >= 0) live.splice(i, 1);
    },
    clear() { live.length = 0; },
  };
}

/** The one ledger the game's floating-word layers share. */
export const floatLedger = createFloatLedger();
