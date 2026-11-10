// Deckplate typed properties -- the custom properties the system animates.
//
// CSS.registerProperty gives a custom property a TYPE. An untyped custom property is a string and a
// string cannot be interpolated; typed as <number> or <length>, the browser can transition it, and
// everything computed from it moves with it. That is what lets a lamp WARM through amber instead of
// fading up in opacity, and what lets the attention lamp TRAVEL to the next item.
//
// This file also used to register a CSS paint worklet that machined a brushed-steel plate
// procedurally at the device's resolution. It was CSS imitating a material, the owner ruled that out
// on 2026-09-22 (design/frontend/ONE_PHOTOGRAPH.md section 0), and it is gone with its seed and
// grain properties. The file keeps its name because deckplate/index.js and its callers import it.
//
// Without registerProperty the values still render at their initial value; they simply do not
// travel.

let registered = false;

/** The typed properties. They must exist before the first style resolution that animates them. */
const TYPED = Object.freeze([
  // Where the stage's key light comes FROM, in degrees -- written once per scene by the stage (P1),
  // read by the reverse point light. No surface is shaded by it any more.
  { name: '--dp-key-angle', syntax: '<angle>', initialValue: '142deg', inherits: true },
  // How hard the key is driving, 0..1.6.
  { name: '--dp-key-power', syntax: '<number>', initialValue: '1', inherits: true },
  // A lamp's current, 0..1. Drives colour temperature and bloom radius together, so a lamp warms
  // through amber rather than fading up.
  { name: '--dp-lamp-current', syntax: '<number>', initialValue: '0', inherits: false },
  // THE ATTENTION LAMP. Where the reader is looking, in the focused container's own coordinates.
  // Typed as lengths so the lamp TRAVELS to the next item instead of teleporting, and inherited so
  // every child can compute its own distance from it and light accordingly.
  { name: '--dp-focus-x', syntax: '<length>', initialValue: '-9999px', inherits: true },
  { name: '--dp-focus-y', syntax: '<length>', initialValue: '-9999px', inherits: true },
  { name: '--dp-focus-power', syntax: '<number>', initialValue: '0', inherits: true },
]);

/**
 * Register the typed properties. Idempotent, safe to call from any surface, and safe on a platform
 * without registerProperty.
 * @param {typeof globalThis} [scope]
 * @returns {void}
 */
export function injectDeckplatePaint(scope = globalThis) {
  if (registered) return;
  registered = true;
  const css = scope && scope.CSS;
  if (!css || typeof css.registerProperty !== 'function') return;
  for (const descriptor of TYPED) {
    // A property already registered throws; another surface may have got here first, and a
    // duplicate is not an error worth propagating to a screen mount.
    try { css.registerProperty(descriptor); } catch { /* already declared */ }
  }
}

/** Exported for tests and for a surface that wants to know what it may animate. */
export const DECKPLATE_TYPED_PROPERTIES = TYPED;
