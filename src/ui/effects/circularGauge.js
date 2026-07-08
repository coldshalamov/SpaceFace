// circularGauge.js — Ring Gauge. Pattern after Magic UI "animated circular progress" (reference only).
// SpaceFace meaning: a bounded process with a deadline — cruise/jump charge, weapon heat, refine
// timer, route ETA, siege countdown, passive-income cap fill. The arc IS the number.
//
// The arc animates ONLY on a value change (a ≤240 ms CSS transition on stroke-dashoffset), snapping to
// the real sim value — never eased past truth. Reduced motion → instant. No rAF: it can never spin a
// meaningless "loading" ring at rest.
import { ensureFxCss, svgEl, tokenForKind } from './effectRuntime.js';

export const CUE = Object.freeze({
  effect: 'circularGauge',
  screens: ['hud', 'outfitting', 'market', 'missions', 'stationHub'],
  triggers: ['charge:progress', 'heat:changed', 'refine:progress', 'eta:changed'],
  maxMs: 240,
  loop: false,
});

const CSS_ID = 'sf-fx-gauge-css';
const CSS = `
.sf-fx-gauge { display:block; }
.sf-fx-gauge__track { fill:none; stroke: color-mix(in srgb, var(--ink-mute) 40%, transparent); }
.sf-fx-gauge__arc {
  fill:none;
  stroke: var(--sf-fx-arc, var(--accent));
  stroke-linecap: round;
  transition: stroke-dashoffset 240ms var(--ease, ease-out), stroke 200ms var(--ease, ease-out);
}
.sf-fx-gauge--done .sf-fx-gauge__arc { stroke: var(--good); }
@media (prefers-reduced-motion: reduce) { .sf-fx-gauge__arc { transition: none; } }
html.sf-reduce-motion .sf-fx-gauge__arc { transition: none; }
`;

/**
 * @param {HTMLElement} mountEl
 * @param {object} [opts]  { size, stroke, kind, value }
 */
export function createCircularGauge(mountEl, opts = {}) {
  ensureFxCss(CSS_ID, CSS);
  const size = Math.max(24, opts.size || 64);
  const stroke = Math.max(2, opts.stroke || 6);
  const cx = size / 2;
  const R = (size - stroke) / 2;
  const CIRC = 2 * Math.PI * R;

  const svg = svgEl('svg', { class: 'sf-fx-gauge', width: size, height: size, viewBox: `0 0 ${size} ${size}`, role: 'img' });
  const track = svgEl('circle', { class: 'sf-fx-gauge__track', cx, cy: cx, r: R, 'stroke-width': stroke });
  // rotate -90° so the arc starts at 12 o'clock and fills clockwise
  const arc = svgEl('circle', {
    class: 'sf-fx-gauge__arc', cx, cy: cx, r: R, 'stroke-width': stroke,
    'stroke-dasharray': CIRC.toFixed(2), 'stroke-dashoffset': CIRC.toFixed(2),
    transform: `rotate(-90 ${cx} ${cx})`,
  });
  svg.appendChild(track);
  svg.appendChild(arc);
  mountEl.appendChild(svg);

  let value = 0;
  if (opts.kind) svg.style.setProperty('--sf-fx-arc', `var(${tokenForKind(opts.kind)})`);

  /**
   * @param {number} v01  progress in [0,1]
   * @param {object} [o]  { kind, label }
   */
  function setValue(v01, o = {}) {
    value = v01 < 0 ? 0 : v01 > 1 ? 1 : v01;
    if (o.kind) svg.style.setProperty('--sf-fx-arc', `var(${tokenForKind(o.kind)})`);
    arc.style.setProperty('stroke-dashoffset', (CIRC * (1 - value)).toFixed(2));
    svg.setAttribute('aria-label', o.label || `${Math.round(value * 100)}%`);
    if (value >= 1) svg.classList.add('sf-fx-gauge--done');
    else svg.classList.remove('sf-fx-gauge--done');
  }

  function update(state) {
    if (!state) return;
    if (typeof state.value === 'number') setValue(state.value, state);
  }

  // Static effect: nothing to park. setActive is kept for contract uniformity.
  function setActive() { /* no rAF — the arc only moves on setValue() */ }

  function dispose() {
    if (svg.parentNode) svg.parentNode.removeChild(svg);
  }

  setValue(typeof opts.value === 'number' ? opts.value : 0);
  return { setValue, update, setActive, dispose, svg, cue: CUE };
}
