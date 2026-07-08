// morphLabel.js — Readout Morph. Pattern after Magic UI "morphing/animated text" (reference only).
// SpaceFace meaning: a value CHANGED — price tick, credits delta, ETA countdown, cargo count. The
// morph draws the eye to the change and nowhere else; it fires on value change ONLY, never at rest.
//
// A ≤180 ms crossfade between two stacked spans, driven by CSS animations that auto-play on insert and
// auto-revert (no forwards fill, no animationend dependency, no rAF, no timers). Cleanup is
// fire-and-forget: at most two children, the stale outgoing span is removed on the next set(). No blur
// filters. Reduced motion → instant swap, but the ≤250 ms direction colour flash is kept (mint up /
// red down) because a colour change is information, not vestibular motion.
import { ensureFxCss } from './effectRuntime.js';

export const CUE = Object.freeze({
  effect: 'morphLabel',
  screens: ['market', 'hud', 'stationHub', 'missions'],
  triggers: ['value:changed', 'price:tick', 'credits:changed', 'eta:changed'],
  maxMs: 250,
  loop: false,
});

const CSS_ID = 'sf-fx-morph-css';
const CSS = `
.sf-fx-morph { position:relative; display:inline-block; white-space:nowrap; color: inherit; }
.sf-fx-morph__v { position:absolute; left:0; top:0; color: inherit; }
.sf-fx-morph__v.is-cur { position:relative; }
@keyframes sf-fx-mv-in-up   { from { opacity:0; transform:translateY(0.35em); color:var(--good);   } to { opacity:1; transform:none; } }
@keyframes sf-fx-mv-in-down { from { opacity:0; transform:translateY(0.35em); color:var(--danger); } to { opacity:1; transform:none; } }
@keyframes sf-fx-mv-in-flat { from { opacity:0; transform:translateY(0.35em); } to { opacity:1; transform:none; } }
@keyframes sf-fx-mv-out     { from { opacity:1; } to { opacity:0; transform:translateY(-0.35em); } }
@keyframes sf-fx-flash-up   { from { color:var(--good);   } to { color:inherit; } }
@keyframes sf-fx-flash-down { from { color:var(--danger); } to { color:inherit; } }
.sf-fx-morph__v.in-up   { animation: sf-fx-mv-in-up   180ms var(--ease, ease-out); }
.sf-fx-morph__v.in-down { animation: sf-fx-mv-in-down 180ms var(--ease, ease-out); }
.sf-fx-morph__v.in-flat { animation: sf-fx-mv-in-flat 180ms var(--ease, ease-out); }
.sf-fx-morph__v.out     { animation: sf-fx-mv-out     180ms var(--ease, ease-out) forwards; opacity:0; }
@media (prefers-reduced-motion: reduce) {
  .sf-fx-morph__v.in-up   { animation: sf-fx-flash-up   250ms var(--ease, ease-out); }
  .sf-fx-morph__v.in-down { animation: sf-fx-flash-down 250ms var(--ease, ease-out); }
  .sf-fx-morph__v.in-flat { animation: none; }
  .sf-fx-morph__v.out     { animation: none; }
}
html.sf-reduce-motion .sf-fx-morph__v.in-up   { animation: sf-fx-flash-up   250ms var(--ease, ease-out); }
html.sf-reduce-motion .sf-fx-morph__v.in-down { animation: sf-fx-flash-down 250ms var(--ease, ease-out); }
html.sf-reduce-motion .sf-fx-morph__v.in-flat { animation: none; }
html.sf-reduce-motion .sf-fx-morph__v.out     { animation: none; }
`;

/**
 * @param {HTMLElement} mountEl
 * @param {object} [opts]  { text, numeric:boolean }
 */
export function createMorphLabel(mountEl, opts = {}) {
  ensureFxCss(CSS_ID, CSS);
  const numeric = !!opts.numeric;

  const root = document.createElement('span');
  root.className = 'sf-fx-morph';
  mountEl.appendChild(root);

  let current = null;
  let outgoing = null;
  let lastNum = null;

  function removeOutgoing() {
    if (outgoing && outgoing.parentNode) outgoing.parentNode.removeChild(outgoing);
    outgoing = null;
  }

  function makeSpan(text, dirClass) {
    const span = document.createElement('span');
    span.className = 'sf-fx-morph__v is-cur ' + dirClass;
    span.textContent = String(text == null ? '' : text);
    return span;
  }

  function inferDir(text) {
    if (!numeric) return 'in-flat';
    const num = parseFloat(String(text).replace(/[^0-9.\-]/g, ''));
    if (Number.isNaN(num)) return 'in-flat';
    let cls = 'in-flat';
    if (lastNum != null) cls = num > lastNum ? 'in-up' : num < lastNum ? 'in-down' : 'in-flat';
    lastNum = num;
    return cls;
  }

  /**
   * @param {string|number} text
   * @param {object} [o]  { dir:'up'|'down' }  — explicit direction overrides numeric inference
   */
  function set(text, o = {}) {
    const dirClass = o.dir === 'up' ? 'in-up' : o.dir === 'down' ? 'in-down' : inferDir(text);
    removeOutgoing();                      // drop the previous morph's stale outgoing span
    const prev = current;
    const span = makeSpan(text, dirClass); // auto-plays its in-animation on insert
    root.appendChild(span);
    current = span;
    if (prev) {
      prev.classList.remove('is-cur');
      prev.classList.add('out');           // auto-plays its out-animation; reverts to hidden
      outgoing = prev;
    }
  }

  function update(state) {
    if (!state) return;
    if (state.text != null) set(state.text, state);
    else if (state.value != null) set(state.value, state);
  }

  // No rAF — the crossfade is pure CSS. setActive kept for contract uniformity.
  function setActive() { /* nothing to park */ }

  function dispose() {
    removeOutgoing();
    if (root.parentNode) root.parentNode.removeChild(root);
    current = null;
  }

  if (opts.text != null) set(opts.text);
  return { set, update, setActive, dispose, root, cue: CUE };
}
