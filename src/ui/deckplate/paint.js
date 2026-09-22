// Deckplate paint — registering the worklet, and declaring the typed properties that make the
// system's light a value rather than a picture of a value.
//
// TWO PLATFORM FEATURES, both native to Chromium 136 (Electron 43) and the browser route:
//
//   CSS.paintWorklet   paints a plate's face at the DEVICE's resolution on invalidation. See
//                      paint/plate-worklet.js for why this replaces a tiling photograph of steel.
//
//   CSS.registerProperty  gives a custom property a TYPE. An untyped custom property is a string,
//                      and a string cannot be interpolated — which is why every gradient in this
//                      system has been frozen. Typed as <angle> or <number>, the browser can
//                      animate it, and every gradient built on it animates with it, on the
//                      compositor. That is what turns one warm key light from a decoration into a
//                      material response.
//
// Both degrade cleanly. Without the worklet the plate falls back to the gradient recipe
// (@supports in materials.js). Without registerProperty the light still renders at its initial
// value; it simply does not travel.

const WORKLET_URL = new URL('./paint/plate-worklet.js', import.meta.url).href;

let registered = false;

/** The typed properties. Order matters only in that these must exist before the first paint. */
const TYPED = Object.freeze([
  // Where the key light comes FROM, in degrees. One value; every plate, bevel and specular reads
  // it. Animating it rakes the light across a surface.
  { name: '--dp-key-angle', syntax: '<angle>', initialValue: '142deg', inherits: true },
  // How hard the key is driving, 0..1.6. A screen can lift this when something matters.
  { name: '--dp-key-power', syntax: '<number>', initialValue: '1', inherits: true },
  // A lamp's current, 0..1. Drives colour temperature, bloom radius and the cast on the plate
  // beneath, so a lamp WARMS through amber instead of fading up in opacity.
  { name: '--dp-lamp-current', syntax: '<number>', initialValue: '0', inherits: false },
  // Per-element grain seed and density for the worklet, so two plates are not the same plate.
  { name: '--dp-plate-seed', syntax: '<number>', initialValue: '7', inherits: true },
  { name: '--dp-grain', syntax: '<number>', initialValue: '1', inherits: true },
  // The specular band's position across a plate, -1..2. Rest is off the left edge.
  { name: '--dp-sweep', syntax: '<number>', initialValue: '-1', inherits: false },
  // THE ATTENTION LAMP. Where the reader is looking, in the focused container's own coordinates.
  // Typed as lengths so the lamp TRAVELS to the next item instead of teleporting, and inherited so
  // every child can compute its own distance from it and light accordingly.
  { name: '--dp-focus-x', syntax: '<length>', initialValue: '-9999px', inherits: true },
  { name: '--dp-focus-y', syntax: '<length>', initialValue: '-9999px', inherits: true },
  { name: '--dp-focus-power', syntax: '<number>', initialValue: '0', inherits: true },
]);

/**
 * Register the typed properties and the paint worklet. Idempotent, safe to call from any surface,
 * and safe on a platform that has neither.
 * @param {typeof globalThis} [scope]
 * @returns {void}
 */
export function injectDeckplatePaint(scope = globalThis) {
  if (registered) return;
  registered = true;
  const css = scope && scope.CSS;
  if (!css) return;

  if (typeof css.registerProperty === 'function') {
    for (const descriptor of TYPED) {
      // A property already registered throws; another surface may have got here first, and a
      // duplicate is not an error worth propagating to a screen mount.
      try { css.registerProperty(descriptor); } catch { /* already declared */ }
    }
  }

  // The worklet needs a real URL and a secure context (localhost counts). A failed load must not
  // take a screen down with it: the plate has a gradient fallback and the picture still reads.
  if (css.paintWorklet && typeof css.paintWorklet.addModule === 'function') {
    try {
      const done = css.paintWorklet.addModule(WORKLET_URL);
      if (done && typeof done.catch === 'function') done.catch(() => {});
    } catch { /* no worklet: the @supports fallback paints */ }
  }
}

/** Exported for tests and for a surface that wants to know what it may animate. */
export const DECKPLATE_TYPED_PROPERTIES = TYPED;
