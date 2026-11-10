// rippleField.js — Ping Ripple. Pattern after Magic UI "ripple" (reference, not a dependency).
// SpaceFace meaning: a discrete event radiating from a point — a scan pulse, a contact detection, a
// trade confirmation, a claim landing. ONE ripple = ONE event; never on hover, never on a timer.
//
// SVG rings whose radius/opacity are driven per-frame by a self-parking rAF driver, so a finished
// ring is REMOVED (no permanent ripples) and the driver parks the instant no ring is alive. ttl is
// capped ≤500 ms. Reduced motion → a static ring mark that only fades (no expansion).
import { clamp01, createRafDriver, prefersReducedMotion, resolveToken, svgEl, tokenForKind } from './effectRuntime.js';

export const CUE = Object.freeze({
  effect: 'rippleField',
  screens: ['galaxyMap', 'exploration', 'market', 'stationHub', 'radar'],
  triggers: ['scan:pulse', 'contact:detected', 'economy:tradeCompleted', 'dock:docked'],
  maxMs: 500,
  loop: false,
});

const MAX_TTL_MS = 500;

/**
 * @param {HTMLElement} mountEl
 * @param {object} [opts]  { width, height, motionReduce }
 */
export function createRippleField(mountEl, opts = {}) {
  let W = Math.max(1, opts.width || mountEl.clientWidth || 240);
  let H = Math.max(1, opts.height || mountEl.clientHeight || 240);

  const svg = svgEl('svg', { class: 'sf-fx-ripple', width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
  svg.style.setProperty('position', 'absolute');
  svg.style.setProperty('inset', '0');
  svg.style.setProperty('pointer-events', 'none');
  mountEl.appendChild(svg);

  // Each ripple: { el, x, y, r0, r1, ttl, born, color }. `born` is elapsed-ms at spawn (driver clock).
  const ripples = [];
  let active = true;
  let clock = 0; // last elapsed value the driver reported; the single time source for births

  const driver = createRafDriver((elapsed) => {
    clock = elapsed;
    return step(elapsed);
  });

  function step(now) {
    const reduce = prefersReducedMotion(opts);
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      const age = now - rp.born;
      const p = clamp01(age / rp.ttl);
      const r = reduce ? rp.r1 : rp.r0 + (rp.r1 - rp.r0) * easeOut(p);
      rp.el.setAttribute('r', String(r));
      rp.el.setAttribute('opacity', String((1 - p) * 0.8));
      if (p >= 1) {
        if (rp.el.parentNode) rp.el.parentNode.removeChild(rp.el);
        ripples.splice(i, 1);
      }
    }
    return ripples.length > 0; // park when the last ripple dies
  }

  function easeOut(p) { return 1 - (1 - p) * (1 - p); }

  /**
   * Emit exactly one ripple from (x,y).
   * @param {number} x
   * @param {number} y
   * @param {object} [o]  { kind, radius, ttl }
   */
  function ping(x, y, o = {}) {
    if (!active) return;
    // If the driver is parked it is about to restart with elapsed re-based to 0 — re-base the birth
    // clock too, so this ripple's age is measured from the fresh run (not a stale prior-run elapsed).
    const restarting = !driver.running;
    if (restarting) clock = 0;
    const ttl = Math.min(MAX_TTL_MS, Math.max(60, o.ttl || 460));
    const r1 = Math.max(6, o.radius || Math.min(W, H) * 0.42);
    const color = resolveToken(tokenForKind(o.kind), 'transparent');
    const circle = svgEl('circle', {
      cx: x, cy: y, r: prefersReducedMotion(opts) ? r1 : 2,
      fill: 'none', stroke: color, 'stroke-width': 2, opacity: 0.8,
    });
    svg.appendChild(circle);
    ripples.push({ el: circle, r0: 2, r1, ttl, born: clock });
    if (restarting) driver.start();
  }

  /** Remove every live ripple immediately. */
  function clear() {
    for (const rp of ripples) { if (rp.el.parentNode) rp.el.parentNode.removeChild(rp.el); }
    ripples.length = 0;
    driver.stop();
  }

  function update() { /* ripples are event-driven via ping(); nothing to re-read per state tick */ }

  function setActive(on) {
    active = !!on;
    if (!active) { driver.stop(); return; }
    if (ripples.length) driver.start();
  }

  function resize(w, h) {
    W = Math.max(1, w || W);
    H = Math.max(1, h || H);
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  }

  function dispose() {
    clear();
    if (svg.parentNode) svg.parentNode.removeChild(svg);
  }

  return { ping, clear, update, setActive, resize, dispose, svg, cue: CUE };
}
