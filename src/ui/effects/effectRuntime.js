// effectRuntime.js — shared, view-only helpers for the command-deck effect layer.
// See design/revamp/COMMAND_DECK_EFFECTS_AND_GAMEPLAY_BIBLE.md §6 (dependency policy).
//
// Rules this module encodes so every effect obeys them by construction:
//   - No sim import, no THREE, no gameState mutation. Effects READ state and render; that is all.
//   - Deterministic: makeRng (mulberry32) is the ONLY randomness source. Math.random /
//     performance.now / Date.now are forbidden across the effect layer (the check greps for them);
//     rAF effects derive elapsed time EXCLUSIVELY from the rAF timestamp so renders are reproducible.
//   - No idle rAF: createRafDriver holds at most one pending frame and stops itself the instant its
//     bounded window ends (the shipPreviewMount / galaxyMap "start on show, cancel on hide" pattern).
//   - Palette tokens only, no raw hex: resolveToken() reads CSS custom properties; there is not a
//     single hex literal anywhere in this layer.
//   - Reduced motion: prefersReducedMotion() mirrors accessibility.js (html.sf-reduce-motion) with a
//     matchMedia fallback and an explicit opts override.
// Every helper reads globals LAZILY (never at module scope) so `import` never touches the DOM — that
// is what makes the modules import-safe in Node (scripts/check-ui-effects.mjs proves it).

// The ONLY colour tokens an effect may resolve. Exported as data so the check can cross-reference
// every getPropertyValue('--…') call against this allowlist (no off-palette hue can sneak in).
export const EFFECT_TOKENS = Object.freeze([
  '--accent', '--accent-2', '--accent-3', '--warn', '--danger', '--good',
  '--ink', '--ink-dim', '--ink-mute',
  '--sf-hostile', '--sf-friendly', '--sf-shield', '--sf-energy', '--sf-cargo',
]);

// Semantic "kind" → token. Effects that take a { kind } (ripple/beam/gauge/morph) map it here so a
// caller says what a thing MEANS ('danger', 'trade') and the palette decides the colour.
export const KIND_TOKEN = Object.freeze({
  info: '--accent', scan: '--accent', nav: '--accent', route: '--accent',
  good: '--good', trade: '--good', friendly: '--good', profit: '--good',
  warn: '--warn', heat: '--warn', caution: '--warn',
  danger: '--danger', hostile: '--danger', loss: '--danger',
  story: '--accent-3', anomaly: '--accent-3', signal: '--accent-3',
  cargo: '--accent-2', power: '--accent-2',
});

/** Map a semantic kind to its palette token name (defaults to --accent). */
export function tokenForKind(kind) {
  return (kind && KIND_TOKEN[kind]) || '--accent';
}

/**
 * Resolve a CSS custom property to a concrete colour string for <canvas> fill/stroke.
 * Call this at an animation BOUNDARY (setActive(true) / reveal() / ping()), NOT per draw — then cache
 * the value on the instance. Reading it at the boundary picks up the live theme + colorblind var
 * overrides (accessibility.js swaps them) without a hot-loop getComputedStyle.
 * Returns a safe non-hex fallback ('transparent') when there is no DOM or the token is unset.
 */
export function resolveToken(name, fallback) {
  const fb = fallback || 'transparent';
  if (typeof document === 'undefined' || !document.documentElement) return fb;
  const g = (typeof window !== 'undefined' && window.getComputedStyle)
    ? window.getComputedStyle(document.documentElement)
    : null;
  if (!g || !g.getPropertyValue) return fb;
  const v = g.getPropertyValue(name);
  return (v && v.trim()) || fb;
}

/**
 * True when vestibular motion should be suppressed. Order of truth:
 *   1. explicit opts.motionReduce (a caller passing state.settings.video.motionReduce)
 *   2. html.sf-reduce-motion (the blanket accessibility.js toggles — the canonical signal)
 *   3. matchMedia('(prefers-reduced-motion: reduce)') as an OS fallback
 * Read lazily; safe with no DOM.
 */
export function prefersReducedMotion(opts) {
  if (opts && typeof opts.motionReduce === 'boolean') return opts.motionReduce;
  if (typeof document !== 'undefined' && document.documentElement && document.documentElement.classList
      && document.documentElement.classList.contains('sf-reduce-motion')) {
    return true;
  }
  if (typeof window !== 'undefined' && window.matchMedia) {
    try { return !!window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { /* ignore */ }
  }
  return false;
}

/**
 * Deterministic PRNG (mulberry32). The ONLY randomness in the effect layer — Math.random is banned so
 * a scanner sweep / glyph scramble renders identically for a given seed (and the check stays
 * deterministic). Seed from opts; a fixed default keeps unseeded effects reproducible too.
 * @param {number} seed
 * @returns {() => number} next() → float in [0, 1)
 */
export function makeRng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A single-frame rAF driver that CANNOT idle.
 *   - holds at most one pending frame (schedule() no-ops while one is queued),
 *   - stops itself the instant tick(elapsedMs) returns false (the bounded window is done),
 *   - cancels cleanly on stop() / when there is no rAF at all.
 * `tick` receives elapsed ms measured from the FIRST frame's rAF timestamp — the sole time source, so
 * the check's fake clock makes every bounded window provably park.
 * @param {(elapsedMs:number)=>boolean} tick  return true to keep animating, false to park
 */
export function createRafDriver(tick) {
  let handle = 0;
  let running = false;
  let startTs = -1;

  function frame(ts) {
    handle = 0;
    if (!running) return;
    if (typeof ts !== 'number') ts = 0;
    if (startTs < 0) startTs = ts;
    const keepGoing = tick(ts - startTs);
    if (keepGoing && running) schedule();
    else { running = false; startTs = -1; }
  }
  function schedule() {
    if (handle || typeof requestAnimationFrame === 'undefined') return;
    handle = requestAnimationFrame(frame);
  }
  return {
    start() { if (running) return; running = true; startTs = -1; schedule(); },
    stop() {
      running = false;
      startTs = -1;
      if (handle && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(handle);
      handle = 0;
    },
    get running() { return running; },
  };
}

/**
 * Idempotent scoped <style> injection (mirrors uiRoot.injectHudCss). Call from INSIDE a factory (lazy)
 * — never at module scope. Inject-once-and-leave: the tag is NEVER removed on dispose(). Token-only
 * static CSS at rest costs nothing, and refcounting a shared <style> across instances is a bug farm.
 */
export function ensureFxCss(id, css) {
  if (typeof document === 'undefined' || !document.head) return;
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}

export const SVG_NS = 'http://www.w3.org/2000/svg';

/** Create an SVG element with attributes (guarded — call inside a factory). */
export function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) for (const k in attrs) el.setAttribute(k, String(attrs[k]));
  return el;
}

/** Clamp to [0,1]. */
export function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
