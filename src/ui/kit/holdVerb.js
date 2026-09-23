import { el } from './dom.js';

/**
 * Hold-to-fire verb (D30): a footer word whose consequence is big enough that a tap must not
 * fire it — ending a run, taking the win. Keyboard and pad feed the same helper, so the two
 * devices share one timer and one filling ring.
 *
 * `feed(held)` is called by the owner however its device reports state: the keyboard path
 * calls it on keydown/keyup edges and the helper clocks the hold itself on rAF; a per-frame
 * pad path passes `feed(held, heldForSeconds)` and the helper paints and fires from that.
 * At `ms` the verb fires exactly once; it must be released before it can arm again.
 *
 * The ring is a `span.dp-holdring` appended to the button (aria-hidden), painted by the
 * `--sf-hold-p` custom property the component sheet turns into a conic fill.
 */
export function attachHoldVerb(button, { ms = 600, onFire } = {}) {
  if (!button || typeof button.appendChild !== 'function') {
    return { feed() {}, dispose() {} };
  }
  let ring = button.querySelector && button.querySelector('.dp-holdring');
  if (!ring) {
    ring = el('span', 'dp-holdring');
    ring.setAttribute('aria-hidden', 'true');
    button.appendChild(ring);
  }
  const paint = (p) => {
    const v = Math.max(0, Math.min(1, p));
    if (ring.style && typeof ring.style.setProperty === 'function') ring.style.setProperty('--sf-hold-p', String(v));
  };
  const raf = globalThis.requestAnimationFrame || null;
  const now = () => (globalThis.performance && performance.now ? performance.now() : Date.now());

  let armedAt = -1;   // ms timestamp the current hold began (clocked path), -1 when disarmed
  let fired = false;  // the hold that fired is done until release — no double-fire on the edge
  let frame = 0;

  const step = () => {
    frame = 0;
    if (armedAt < 0 || fired) return;
    const p = (now() - armedAt) / ms;
    if (p >= 1) { fired = true; disarm(); if (onFire) onFire(); return; }
    paint(p);
    if (raf) frame = raf(step);
  };
  const disarm = () => {
    armedAt = -1;
    if (frame && globalThis.cancelAnimationFrame) cancelAnimationFrame(frame);
    frame = 0;
    paint(0);
  };

  return {
    /** @param {boolean} held is the verb's key/button currently down?
     *  @param {number} [heldForSec] seconds already held, when the caller owns the clock. */
    feed(held, heldForSec) {
      if (!held) { disarm(); fired = false; return; }
      if (fired) return;
      if (typeof heldForSec === 'number') {
        const p = (heldForSec * 1000) / ms;
        if (p >= 1) { fired = true; paint(0); if (onFire) onFire(); return; }
        paint(p);
        return;
      }
      if (armedAt < 0) { armedAt = now(); if (raf && !frame) frame = raf(step); }
    },
    dispose() { disarm(); fired = false; },
  };
}
