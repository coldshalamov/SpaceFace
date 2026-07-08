// supplyTree.js — Dependency Spindle. Pattern after Magic UI "file tree" (reference only).
// SpaceFace meaning: a directed acyclic graph of supply — who PRODUCES a good and who CONSUMES it. The
// selected commodity is the spindle hub; producer station-types fan out to one side, consumers to the
// other. Edges are static unless a flow is active (a route is hauling the good), in which case the
// marching dash runs along the active edge only (class-gated, dropped by setActive(false), killed under
// reduced motion). No rAF.
//
// The spindle is a STATE READOUT, not decoration: a node lights up (kind colour) to mean "this
// station-type is a producer/consumer of the selected good." An empty side means "no known producer /
// no consumer" — that absence is the information.
import { ensureFxCss, svgEl, tokenForKind } from './effectRuntime.js';

export const CUE = Object.freeze({
  effect: 'supplyTree',
  screens: ['market', 'outfitting', 'crafting', 'automation', 'stationHub'],
  triggers: ['commodity:selected', 'route:active', 'craft:queueChanged'],
  maxMs: null,        // marching edge is continuous WHILE a real flow is active; default is static
  loop: true,
  activeGated: true,  // animation exists only under .is-flowing (set by setFlow), never at rest
});

const CSS_ID = 'sf-fx-tree-css';
const CSS = `
.sf-fx-tree { display:block; overflow:visible; }
.sf-fx-tree__edge {
  fill: none;
  stroke: color-mix(in srgb, var(--ink-mute) 45%, transparent);
  stroke-width: 1.5;
  stroke-dasharray: 4 4;
  stroke-linecap: round;
  transition: stroke 200ms var(--ease, ease-out), stroke-width 200ms var(--ease, ease-out);
}
.sf-fx-tree__edge.is-flowing { animation: sf-fx-tree-march 900ms linear infinite; }
.sf-fx-tree__edge--produce { stroke: color-mix(in srgb, var(--good) 55%, transparent); }
.sf-fx-tree__edge--consume { stroke: color-mix(in srgb, var(--warn) 55%, transparent); }
.sf-fx-tree__node-halo { fill: color-mix(in srgb, var(--ink-mute) 16%, transparent); transition: fill 200ms var(--ease, ease-out); }
.sf-fx-tree__node-halo--produce.is-active { fill: color-mix(in srgb, var(--good) 22%, transparent); }
.sf-fx-tree__node-halo--consume.is-active { fill: color-mix(in srgb, var(--warn) 22%, transparent); }
.sf-fx-tree__node { fill: color-mix(in srgb, var(--ink-mute) 30%, transparent); transition: fill 200ms var(--ease, ease-out); }
.sf-fx-tree__node--hub { fill: var(--sf-fx-tree-hub, var(--accent)); }
.sf-fx-tree__node--produce.is-active { fill: var(--good); }
.sf-fx-tree__node--consume.is-active { fill: var(--warn); }
.sf-fx-tree__lbl { font-family: var(--mono); fill: var(--ink-dim); font-size: 9px; letter-spacing: .04em; }
.sf-fx-tree__lbl--role { font-size: 8px; fill: var(--ink-mute); letter-spacing: .14em; text-transform: uppercase; }
.sf-fx-tree__cap { font-family: var(--mono); fill: var(--ink-mute); font-size: 8px; letter-spacing: .14em; text-transform: uppercase; }
@keyframes sf-fx-tree-march { to { stroke-dashoffset: -8; } }
@media (prefers-reduced-motion: reduce) { .sf-fx-tree__edge.is-flowing { animation: none; } }
html.sf-reduce-motion .sf-fx-tree__edge.is-flowing { animation: none; }
`;

/**
 * @param {HTMLElement} mountEl
 * @param {object} [opts]  { width, height }
 */
export function createSupplyTree(mountEl, opts = {}) {
  ensureFxCss(CSS_ID, CSS);
  let W = Math.max(1, opts.width || mountEl.clientWidth || 240);
  let H = Math.max(1, opts.height || mountEl.clientHeight || 140);

  const svg = svgEl('svg', { class: 'sf-fx-tree', width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Supply chain' });
  mountEl.appendChild(svg);

  let active = true;
  let flowing = false;
  const flowEdges = []; // path elements whose source node carried flow:true

  /**
   * Lay out and render the spindle.
   * @param {Array<{id,label,role:'produce'|'consume'|'hub',flow?:boolean}>} nodes
   *   Producers fan to the left, consumers to the right, hub centered. `flow` marks an active edge.
   */
  function setNodes(nodes) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    flowEdges.length = 0;
    if (!Array.isArray(nodes) || !nodes.length) return;

    const hub = nodes.find((n) => n.role === 'hub') || { label: '', role: 'hub' };
    const producers = nodes.filter((n) => n.role === 'produce');
    const consumers = nodes.filter((n) => n.role === 'consume');

    const cx = W / 2;
    const cy = H / 2;

    // ── section captions (left = produced by, right = consumed by) ──
    const capL = svgEl('text', { class: 'sf-fx-tree__cap', x: 6, y: 12 });
    capL.textContent = 'PRODUCED BY';
    svg.appendChild(capL);
    const capR = svgEl('text', { class: 'sf-fx-tree__cap', x: W - 6, y: 12, 'text-anchor': 'end' });
    capR.textContent = 'CONSUMED BY';
    svg.appendChild(capR);

    // ── producer column (left), consumer column (right) ──
    function placeColumn(list, sideX, anchor) {
      const n = list.length;
      if (!n) {
        const empty = svgEl('text', { class: 'sf-fx-tree__lbl', x: sideX, y: cy + 3, 'text-anchor': anchor });
        empty.textContent = '— none —';
        svg.appendChild(empty);
        return [];
      }
      const placed = [];
      const top = 26;
      const bottom = H - 12;
      for (let i = 0; i < n; i++) {
        const y = n === 1 ? cy : top + (i / (n - 1)) * (bottom - top);
        placed.push({ ...list[i], x: sideX, y });
      }
      return placed;
    }
    const leftX = Math.max(54, W * 0.22);
    const rightX = Math.min(W - 54, W * 0.78);
    const placedProducers = placeColumn(producers, leftX, 'end');
    const placedConsumers = placeColumn(consumers, rightX, 'start');

    // ── edges (drawn before nodes so nodes sit on top) ──
    function edgeTo(fromX, fromY, toX, toY, kind, flow) {
      // a gentle cubic so the spindle reads as a web, not a bus
      const cpx = (fromX + toX) / 2;
      const d = `M${fromX.toFixed(1)},${fromY.toFixed(1)} C${cpx.toFixed(1)},${fromY.toFixed(1)} ${cpx.toFixed(1)},${toY.toFixed(1)} ${toX.toFixed(1)},${toY.toFixed(1)}`;
      const cls = 'sf-fx-tree__edge sf-fx-tree__edge--' + kind + (flow && active && flowing ? ' is-flowing' : '');
      const p = svgEl('path', { class: cls, d });
      if (flow) { p.setAttribute('data-flow', '1'); flowEdges.push(p); }
      svg.appendChild(p);
    }
    for (const pp of placedProducers) edgeTo(pp.x, pp.y, cx, cy, 'produce', !!pp.flow);
    for (const pc of placedConsumers) edgeTo(cx, cy, pc.x, pc.y, 'consume', !!pc.flow);

    // ── hub node + label ──
    svg.appendChild(svgEl('circle', { class: 'sf-fx-tree__node-halo', cx, cy, r: 18 }));
    const hubNode = svgEl('circle', { class: 'sf-fx-tree__node sf-fx-tree__node--hub', cx, cy, r: 9 });
    svg.appendChild(hubNode);
    if (hub.label) {
      const hubLbl = svgEl('text', { class: 'sf-fx-tree__lbl', x: cx, y: cy + 26, 'text-anchor': 'middle' });
      hubLbl.textContent = String(hub.label);
      svg.appendChild(hubLbl);
    }

    // ── producer / consumer nodes + labels ──
    function renderNode(p, kind) {
      svg.appendChild(svgEl('circle', {
        class: 'sf-fx-tree__node-halo sf-fx-tree__node-halo--' + kind + (active ? ' is-active' : ''),
        cx: p.x, cy: p.y, r: 11,
      }));
      const node = svgEl('circle', { class: 'sf-fx-tree__node sf-fx-tree__node--' + kind + (active ? ' is-active' : ''), cx: p.x, cy: p.y, r: 5 });
      svg.appendChild(node);
      // labels sit OUTBOARD of the node (left of producers, right of consumers) so they never cross
      // the spindle centerline and stay anchored to their own node.
      const lx = p.x + (kind === 'produce' ? -12 : 12);
      const anchor = kind === 'produce' ? 'end' : 'start';
      const lbl = svgEl('text', { class: 'sf-fx-tree__lbl', x: lx, y: p.y + 3, 'text-anchor': anchor });
      lbl.textContent = String(p.label || p.id || '');
      svg.appendChild(lbl);
    }
    for (const pp of placedProducers) renderNode(pp, 'produce');
    for (const pc of placedConsumers) renderNode(pc, 'consume');

    applyFlow();
  }

  function applyFlow() {
    const on = flowing && active;
    for (const e of flowEdges) {
      if (on) e.classList.add('is-flowing');
      else e.classList.remove('is-flowing');
    }
  }

  /** Mark whether a real trade flow is moving along the spindle edges. */
  function setFlow(on) { flowing = !!on; applyFlow(); }

  function update(state) {
    if (!state) return;
    if (Array.isArray(state.nodes)) setNodes(state.nodes);
    if (typeof state.flow === 'boolean') setFlow(state.flow);
  }

  function setActive(on) {
    active = !!on;
    applyFlow(); // parks the marching dash when the screen is hidden
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

  return { setNodes, setFlow, update, setActive, resize, dispose, svg, cue: CUE };
}
