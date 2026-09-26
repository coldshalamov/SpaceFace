// Deckplate motion — the JS half of the choreography. The curves and durations live as tokens
// (deckplate/tokens.js); this module exposes them to JS and owns the one motion primitive the
// CSS cannot do alone: REPLAYING a one-shot mechanical animation when live state changes
// (a bracket latches, a relay closes) without leaving timers or rAF behind.
//
// Contract: no loops, no rAF held open, no ambient clocks. A replay is a class removal +
// a forced reflow + a class add — the compositor runs it, JS walks away. Reduced motion is
// honoured at the call site: a replay under reduced motion is a no-op (the state class the
// caller ALSO sets is what carries the information).

// Motion follows the GAME's setting (html.sf-reduce-motion), never the OS media query: the OS
// hint feeds the setting through the System preference (accessibility.js), and reading it here as
// well would strip effects from a player who explicitly chose Full on a reduce-OS machine.
const REDUCED = () =>
  globalThis.document?.documentElement?.classList.contains('sf-reduce-motion') === true
  || false; // nothing else: the OS hint feeds the setting, it is never read here

export const DP_MOTION = Object.freeze({
  cut: 80,
  settle: 220,
  breathe: 3400,
  escalate: 560,
});

/**
 * Restart a CSS one-shot animation class on an element when its state changes.
 * @param {Element|null} el the animated element
 * @param {string} cls the one-shot class (e.g. 'dp-bracket--snap')
 * @returns {void}
 */
export function replayDpAnimation(el, cls) {
  if (!el || !el.classList || REDUCED()) return;
  if (el.classList.contains(cls)) {
    el.classList.remove(cls);
    // Force style resolution so the re-added class restarts the animation. One forced reflow
    // per discrete state change is the contract — never call this per frame.
    void el.offsetWidth;
  }
  el.classList.add(cls);
}

export { REDUCED as dpReducedMotion };
