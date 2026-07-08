// routeBeam.js — Route Beam. Pattern after Magic UI "animated beam" (reference only).
// SpaceFace meaning: directed flow along a line — a plotted nav route, a trade lane with goods
// moving, a power conduit (reactor→system), a tether, a convoy path.
//
// A plotted-but-inactive route is a STATIC dashed line with a direction arrowhead. The marching dash
// (the sanctioned state-change motion, spec2/06 §5) runs ONLY while the flow is active — class-gated
// (`.is-flowing`), removed by setActive(false), and killed under reduced motion. No rAF (CSS keyframe
// on a screen surface), so it can never idle behind a closed screen once the class is off.
import { ensureFxCss, svgEl, tokenForKind } from './effectRuntime.js';

export const CUE = Object.freeze({
  effect: 'routeBeam',
  screens: ['galaxyMap', 'market', 'outfitting', 'automation', 'factions', 'stationHub'],
  triggers: ['route:plotted', 'route:active', 'power:flow', 'trade:laneActive', 'service:selected'],
  maxMs: null,       // marching is continuous WHILE a real flow is active; default state is static
  loop: true,
  activeGated: true, // animation exists only under .is-flowing (set by update/setActive), never at rest
});

const CSS_ID = 'sf-fx-beam-css';
const CSS = `
.sf-fx-beam { display:block; overflow:visible; }
.sf-fx-beam__path {
  fill:none;
  stroke: var(--sf-fx-beam, var(--accent));
  stroke-width: 2;
  stroke-dasharray: 6 6;
  stroke-linecap: round;
}
.sf-fx-beam__path.is-flowing { animation: sf-fx-march 900ms linear infinite; }
.sf-fx-beam__head { fill: var(--sf-fx-beam, var(--accent)); }
@keyframes sf-fx-march { to { stroke-dashoffset: -12; } }
@media (prefers-reduced-motion: reduce) { .sf-fx-beam__path.is-flowing { animation: none; } }
html.sf-reduce-motion .sf-fx-beam__path.is-flowing { animation: none; }
`;

/**
 * @param {HTMLElement} mountEl
 * @param {object} [opts]  { width, height }
 */
export function createRouteBeam(mountEl, opts = {}) {
  ensureFxCss(CSS_ID, CSS);
  let W = Math.max(1, opts.width || mountEl.clientWidth || 240);
  let H = Math.max(1, opts.height || mountEl.clientHeight || 160);

  const svg = svgEl('svg', { class: 'sf-fx-beam', width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
  const path = svgEl('path', { class: 'sf-fx-beam__path', d: '' });
  const head = svgEl('polygon', { class: 'sf-fx-beam__head', points: '', opacity: 0 });
  svg.appendChild(path);
  svg.appendChild(head);
  mountEl.appendChild(svg);

  let points = [];
  let flowing = false;
  let active = true;

  function toPath(pts) {
    if (!pts.length) return '';
    let d = 'M' + pts[0].x.toFixed(1) + ',' + pts[0].y.toFixed(1);
    for (let i = 1; i < pts.length; i++) d += ' L' + pts[i].x.toFixed(1) + ',' + pts[i].y.toFixed(1);
    return d;
  }

  // Arrowhead at the last segment for direction (the static-route + reduced-motion direction cue).
  function drawHead(pts) {
    if (pts.length < 2) { head.setAttribute('opacity', '0'); return; }
    const a = pts[pts.length - 2];
    const b = pts[pts.length - 1];
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const s = 7;
    const p1 = b.x.toFixed(1) + ',' + b.y.toFixed(1);
    const p2 = (b.x - s * Math.cos(ang - 0.5)).toFixed(1) + ',' + (b.y - s * Math.sin(ang - 0.5)).toFixed(1);
    const p3 = (b.x - s * Math.cos(ang + 0.5)).toFixed(1) + ',' + (b.y - s * Math.sin(ang + 0.5)).toFixed(1);
    head.setAttribute('points', p1 + ' ' + p2 + ' ' + p3);
    head.setAttribute('opacity', '1');
  }

  function applyFlow() {
    const on = flowing && active;
    if (on) path.classList.add('is-flowing');
    else path.classList.remove('is-flowing');
  }

  /**
   * @param {Array<{x:number,y:number}>} pts  the polyline in mount-local coords
   * @param {object} [o]  { active:boolean (is a real flow moving?), kind:string, direction:'to'|'from' }
   */
  function setPath(pts, o = {}) {
    points = Array.isArray(pts) ? pts.slice() : [];
    const draw = o.direction === 'from' ? points.slice().reverse() : points;
    path.setAttribute('d', toPath(draw));
    drawHead(draw);
    if (o.kind) svg.style.setProperty('--sf-fx-beam', `var(${tokenForKind(o.kind)})`);
    if (typeof o.active === 'boolean') flowing = o.active;
    applyFlow();
  }

  function setFlowing(on) { flowing = !!on; applyFlow(); }

  function update(state) {
    if (!state) return;
    if (Array.isArray(state.points)) setPath(state.points, state);
    else if (typeof state.active === 'boolean') setFlowing(state.active);
  }

  function setActive(on) {
    active = !!on;
    applyFlow(); // parks the marching dash when the screen is hidden (class removed)
  }

  function resize(w, h) {
    W = Math.max(1, w || W);
    H = Math.max(1, h || H);
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  }

  function dispose() {
    if (svg.parentNode) svg.parentNode.removeChild(svg);
  }

  return { setPath, setFlowing, update, setActive, resize, dispose, svg, cue: CUE };
}
