// ORRERY motion: motion has mass (design/frontend/ORRERY.md §3.5).
//
// One shared rAF scheduler for every instrument, one spring solver, one reduced-motion switch.
// Springs, not easing curves, because SpaceFace is a physics game and its interface should move
// like objects with inertia: the Hand overshoots and settles, a gauge leans into its new value.
//
// Reduced motion follows the game setting (html.sf-reduce-motion), not the OS query: see tokens.js.

export const SPRINGS = Object.freeze({
  swing: Object.freeze({ k: 170, c: 16 }),   // the Hand, radial selection, carousels (slight overshoot)
  settle: Object.freeze({ k: 260, c: 28 }),  // arrivals, gauges (no overshoot)
  snap: Object.freeze({ k: 420, c: 38 }),    // focus, hover, press
});

export function reducedMotion() {
  return globalThis.document?.documentElement?.classList.contains('sf-reduce-motion') === true;
}

const frameListeners = new Set();
let frameHandle = 0;

function tick(now) {
  frameHandle = 0;
  for (const listener of [...frameListeners]) {
    let keep = false;
    try { keep = listener(now) !== false; } catch (error) { keep = false; console.warn('[orrery] frame listener failed', error); }
    if (!keep) frameListeners.delete(listener);
  }
  if (frameListeners.size && typeof requestAnimationFrame === 'function') frameHandle = requestAnimationFrame(tick);
}

/** Run `listener(now)` every frame until it returns false or the returned function is called. */
export function onFrame(listener) {
  frameListeners.add(listener);
  if (!frameHandle && typeof requestAnimationFrame === 'function') frameHandle = requestAnimationFrame(tick);
  return () => { frameListeners.delete(listener); };
}

/**
 * A retargetable spring. `set(to)` moves toward a new target from wherever the value is now,
 * keeping its velocity, so a gauge interrupted mid-swing leans into the new reading naturally.
 */
export function createSpring({ value = 0, preset = 'settle', onUpdate, precision = 0.0005 } = {}) {
  const params = typeof preset === 'string' ? (SPRINGS[preset] || SPRINGS.settle) : preset;
  let x = value;
  let v = 0;
  let target = value;
  let off = null;
  let last = null;

  const emit = () => { if (typeof onUpdate === 'function') onUpdate(x); };

  function step(now) {
    const dt = last == null ? 1 / 60 : Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    for (let i = 0; i < steps; i += 1) {
      const a = -params.k * (x - target) - params.c * v;
      v += a * h;
      x += v * h;
    }
    const scale = Math.max(1, Math.abs(target));
    if (Math.abs(v) < precision * scale * 4 && Math.abs(x - target) < precision * scale) {
      x = target; v = 0; emit(); off = null; last = null;
      return false;
    }
    emit();
    return true;
  }

  return {
    get value() { return x; },
    get target() { return target; },
    set(to, { instant = false } = {}) {
      const next = Number.isFinite(to) ? to : target;
      // Already resting on this target: nothing to animate and nothing to paint. HUD instruments
      // call set() every frame, and a paint of an unchanged value still dirties the SVG's style.
      if (!instant && !off && next === target && x === target && v === 0) return;
      target = next;
      if (instant || reducedMotion() || typeof requestAnimationFrame !== 'function') {
        if (off) { off(); off = null; }
        x = target; v = 0; last = null; emit();
        return;
      }
      if (!off) off = onFrame(step);
    },
    kick(velocity) { v += velocity; if (!off) off = onFrame(step); },
    stop() { if (off) { off(); off = null; } last = null; },
  };
}

/** Stagger helper: sets --orr-delay on each element so CSS arrival animations cascade. */
export function stagger(elements, { base = 0, step = 28 } = {}) {
  let i = 0;
  for (const element of elements) {
    if (element && element.style) element.style.setProperty('--orr-delay', `${base + step * i}ms`);
    i += 1;
  }
}
