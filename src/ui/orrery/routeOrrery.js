// src/ui/orrery/routeOrrery.js — the Route Orrery (design/frontend/ORRERY.md §4 #6 Beam, §6 Contracts).
//
// The belt drawn as an orrery round the berth you are docked at: a ring for every jump of depth,
// the sectors you can reach standing on those rings at their real bearings, the lanes between them
// as faint light. A contract's route is a beam from here to its berth with a pulse travelling the
// way you will fly, a tick where each jump lands, and the Hand's bead on the destination. Where a
// sector on the way is dangerous, a red arc stands round it: that is the one threat on the screen.
// Every sector drawn is named; a name takes the first place round its node that touches nothing
// else, and a sector whose name finds no place is not drawn at all.
//
// A screen hands in the host and calls `set()` with the origin and destination; the instrument
// reads the world's sector graph itself. Without a layout (node tests) or a graph it stands down.

import { SECTORS, dangerIndex } from '../../data/sectors.js';
import { svg, polar, arcD, ticksD } from './svg.js';
import { injectOrrery } from './tokens.js';
import { reducedMotion, createSpring } from './motion.js';

const STYLE_ID = 'orr-route-orrery-style';
const BONE = '236 230 216';

const CSS = `
.orr-route { position:relative; width:100%; height:100%; min-height:200px; isolation:isolate; }
/* a pool of shade under the instrument, no edge: its rest light survives a lit set behind it */
.orr-route::before { content:""; position:absolute; z-index:-1; left:50%; top:50%; width:118%; height:118%; transform:translate(-50%, -50%); pointer-events:none;
  background:radial-gradient(closest-side, rgb(6 8 11 / .82), rgb(6 8 11 / .6) 55%, rgb(6 8 11 / 0)); }
.orr-route > svg { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; pointer-events:none; }
.orr-route__caption { position:absolute; left:0; right:0; bottom:0; display:flex; align-items:baseline; justify-content:center; gap:12px; pointer-events:none;
  font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:10.5px; letter-spacing:.14em; text-transform:uppercase;
  color:rgb(${BONE} / .66); white-space:nowrap; }
.orr-route__caption > .orr-route__jumps { font-family:var(--dp-face-numeral, "Archivo"); font-stretch:100%; font-weight:400; font-size:24px; letter-spacing:0;
  color:rgb(248 244 234); font-variant-numeric:tabular-nums; line-height:1; }
.orr-route.is-off::before, .orr-route.is-off > svg, .orr-route.is-off > .orr-route__caption { display:none; }
.orr-route.is-tether > .orr-route__caption { display:none; }
/* weight, not wire: every ring of depth is a luminous band under a crisp edge; the near ring is the brighter */
.orr-svg .orr-route__ring { --orr-edge-a:.52; --orr-band-a:.29; --orr-w-band:7px; --orr-w-edge:1.5px; }
.orr-svg .orr-route__ring--near { --orr-edge-a:.64; --orr-band-a:.32; }
.orr-svg .orr-route__lane { stroke:rgb(${BONE} / .26); }
.orr-svg .orr-route__beam { stroke:var(--dp-hand, #f2b950); }
.orr-svg .orr-route__beam-bloom { stroke:var(--dp-hand, #f2b950); opacity:.2; }
.orr-svg .orr-route__swing { stroke:var(--dp-hand, #f2b950); }
.orr-svg .orr-route__swing-bloom { stroke:var(--dp-hand, #f2b950); opacity:.2; }
.orr-route__beamg { transition:opacity .25s linear; }
.orr-svg .orr-route__leader { stroke:rgb(${BONE} / .45); }
.orr-svg .orr-route__leader--dest { stroke:rgb(${BONE} / .7); }
.orr-svg .orr-route__pulse { fill:var(--dp-ice, #8fcbff); }
.orr-svg .orr-route__pulse-bloom { fill:var(--dp-ice, #8fcbff); opacity:.28; }
.orr-svg .orr-route__node { fill:rgb(6 8 11 / .9); stroke:rgb(${BONE} / .85); stroke-width:1.8; }
/* a sector off the route: a filled body with a lit rim, never a pinprick */
.orr-svg .orr-route__dot { fill:rgb(${BONE} / .5); stroke:rgb(248 244 234 / .88); stroke-width:1.2; }
.orr-svg .orr-route__dot-bloom { fill:rgb(${BONE}); opacity:.12; }
.orr-svg .orr-route__node--here { stroke:rgb(248 244 234); }
.orr-svg .orr-route__here-core { fill:rgb(248 244 234); }
.orr-svg .orr-route__hop { stroke:rgb(${BONE} / .88); }
.orr-svg .orr-route__hand-glow { fill:var(--dp-hand, #f2b950); opacity:.1; }
.orr-svg .orr-route__hand-bead { fill:var(--dp-hand, #f2b950); opacity:.85; }
.orr-svg .orr-route__hand-ring { stroke:var(--dp-hand, #f2b950); }
.orr-svg .orr-route__threat { stroke:var(--dp-danger, #ff5038); opacity:.85; }
.orr-svg .orr-route__threat-bloom { stroke:var(--dp-danger, #ff5038); opacity:.22; }
.orr-svg text.orr-route__name { font-size:10px; font-weight:650; letter-spacing:.1em; fill:rgb(${BONE} / .78); text-transform:uppercase;
  paint-order:stroke; stroke:rgb(4 6 9 / .85); stroke-width:3px; stroke-linejoin:round; }
.orr-svg text.orr-route__name--faint { fill:rgb(${BONE} / .58); font-size:9.5px; }
.orr-svg text.orr-route__name--live { fill:rgb(248 244 234); }
.orr-svg text.orr-route__name--berth { fill:rgb(${BONE} / .7); font-size:8.5px; letter-spacing:.1em; }
.orr-svg text.orr-route__tag { font-size:8px; font-weight:650; letter-spacing:.28em; fill:rgb(${BONE} / .5); }
.orr-svg .orr-route__crosshair { stroke:rgb(248 244 234); opacity:.78; }
.orr-route__fade { opacity:0; animation:orr-route-fade .46s var(--dp-ease-out, ease-out) forwards; animation-delay:var(--orr-delay, 0ms); }
@keyframes orr-route-fade { to { opacity:1; } }
html.sf-reduce-motion .orr-route__fade { animation:none; opacity:1; }
html.sf-reduce-motion .orr-route__pulse-g { display:none; }
`;

function injectStyle(doc) {
  if (!doc || !doc.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

const SECTOR = new Map(SECTORS.map((s) => [s.id, s]));
const SECTOR_OF_STATION = new Map(SECTORS.flatMap((s) => (s.stations || []).map((st) => [st.id, s.id])));

/** The sector a station stands in (null when unknown). */
export function sectorOfStation(stationId) {
  return (stationId && SECTOR_OF_STATION.get(stationId)) || null;
}

/** Breadth-first over the jump lanes: depth and parent of every sector reachable from `from`. */
export function jumpDepths(from) {
  const depth = new Map();
  const parent = new Map();
  if (!SECTOR.has(from)) return { depth, parent };
  depth.set(from, 0);
  const queue = [from];
  while (queue.length) {
    const id = queue.shift();
    const d = depth.get(id);
    for (const n of (SECTOR.get(id).neighbors || [])) {
      if (!SECTOR.has(n) || depth.has(n)) continue;
      depth.set(n, d + 1);
      parent.set(n, id);
      queue.push(n);
    }
  }
  return { depth, parent };
}

/** The sectors flown through from `from` to `to`, inclusive; [] when unreachable. */
export function jumpRoute(from, to) {
  if (!from || !to) return [];
  if (from === to) return [from];
  const { depth, parent } = jumpDepths(from);
  if (!depth.has(to)) return [];
  const path = [to];
  let at = to;
  while (parent.has(at)) { at = parent.get(at); path.push(at); }
  return path.reverse();
}

const f = (n) => Math.round(n * 100) / 100;
const bearingOf = (from, to) => {
  const dx = (to.position?.x || 0) - (from.position?.x || 0);
  const dy = (to.position?.y || 0) - (from.position?.y || 0);
  if (!dx && !dy) return 0;
  return ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
};

/** Push apart bearings on one ring until none are closer than `minGap` degrees. */
function separateBearings(list, minGap = 16) {
  if (list.length < 2) return;
  for (let pass = 0; pass < 24; pass += 1) {
    list.sort((a, b) => a.deg - b.deg);
    let moved = false;
    for (let i = 0; i < list.length; i += 1) {
      const a = list[i];
      const b = list[(i + 1) % list.length];
      let gap = b.deg - a.deg;
      if (i === list.length - 1) gap += 360;
      if (gap < minGap) {
        const push = (minGap - gap) / 2;
        a.deg = (a.deg - push + 360) % 360;
        b.deg = (b.deg + push) % 360;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

const boxesTouch = (a, b, pad = 0) => a.l < b.r + pad && a.r > b.l - pad && a.t < b.b + pad && a.b > b.t - pad;
/** Does the segment (ax,ay)-(bx,by) pass through the box (sampled)? */
function segmentTouches(ax, ay, bx, by, box, pad = 2) {
  const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) / 6));
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const x = ax + (bx - ax) * t; const y = ay + (by - ay) * t;
    if (x > box.l - pad && x < box.r + pad && y > box.t - pad && y < box.b + pad) return true;
  }
  return false;
}

let pathSeq = 0;

/**
 * @param {HTMLElement} host a block the instrument fills
 * @param {{ maxRings?: number }} [opts]
 */
export function createRouteOrrery(host, { maxRings = 3, caption: captionMode = 'foot', onLayout = null } = {}) {
  const doc = host && host.ownerDocument ? host.ownerDocument : globalThis.document;
  const inert = { el: host, set() {}, relayout() {}, active: () => false, dispose() {} };
  if (!host || !doc || typeof doc.createElementNS !== 'function' || typeof host.getBoundingClientRect !== 'function') return inert;
  injectOrrery(doc);
  injectStyle(doc);
  host.classList.add('orr-route', 'is-off');
  if (captionMode === 'tether') host.classList.add('is-tether');

  const layer = svg('svg', { class: 'orr-svg orr-route__svg', 'aria-hidden': 'true', focusable: 'false' });
  host.appendChild(layer);
  const caption = doc.createElement('p');
  caption.className = 'orr-route__caption';
  caption.setAttribute('aria-hidden', 'true');
  host.appendChild(caption);

  let data = null;
  let frame = 0;
  let ro = null;
  let on = false;
  let drawnKey = '';
  let lastEnd = null;      // where the arm last pointed (bearing), for the swing to the next berth
  let swingFrom = null;    // the bearing the next layout swings the arm from, or null
  let swingSpring = null;

  const schedule = () => {
    if (frame) return;
    const raf = globalThis.requestAnimationFrame;
    if (typeof raf === 'function') frame = raf(() => { frame = 0; layout(); });
    else layout();
  };

  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(() => schedule());
    ro.observe(host);
  }

  function standDown() {
    on = false;
    host.classList.add('is-off');
    layer.textContent = '';
    caption.textContent = '';
  }

  function layout() {
    const W = host.clientWidth || 0;
    const H = host.clientHeight || 0;
    if (!data || !data.origin || W < 200 || H < 150) { standDown(); return; }
    const origin = SECTOR.get(data.origin);
    if (!origin) { standDown(); return; }
    const dest = data.dest && SECTOR.get(data.dest) ? data.dest : null;
    const route = dest ? jumpRoute(data.origin, dest) : [];
    if (dest && !route.length) { standDown(); return; }
    const key = `${W}x${H}|${data.origin}>${dest}|${data.destName}`;
    if (key === drawnKey) return;
    drawnKey = key;
    on = true;
    host.classList.remove('is-off');
    const arriveNow = !reducedMotion();
    const fade = (node, delay) => {
      if (!arriveNow) return node;
      node.classList.add('orr-route__fade');
      node.style.setProperty('--orr-delay', `${delay}ms`);
      return node;
    };

    const { depth } = jumpDepths(data.origin);
    const local = !!dest && dest === data.origin;
    const routeDepth = dest ? (depth.get(dest) || 0) : 0;
    const rings = Math.max(1, Math.min(maxRings, Math.max(routeDepth, 1) + (routeDepth >= maxRings ? 0 : 1)));
    const pad = 34;
    const capH = captionMode === 'tether' ? 0 : 26;
    const cx = W / 2;
    const cy = (H - capH) / 2;
    const R = Math.max(60, Math.min(W / 2 - pad, (H - capH) / 2 - pad + 14));
    // the near ring stands well out from the berth (its names need the room); the rest share the remainder
    const ringR = (k) => (rings === 1 ? R : R * (0.6 + (0.4 * (k - 1)) / (rings - 1)));

    // the sectors on each ring, at their real bearings, pushed apart where they would touch
    const byRing = new Map();
    for (const [id, d] of depth) {
      if (d < 1 || d > rings) continue;
      if (!byRing.has(d)) byRing.set(d, []);
      byRing.get(d).push({ id, deg: bearingOf(origin, SECTOR.get(id)), onRoute: route.includes(id) });
    }
    const place = new Map([[data.origin, { x: cx, y: cy, deg: 0, onRoute: true, d: 0 }]]);
    for (const [d, list] of byRing) {
      separateBearings(list, Math.min(24, 360 / Math.max(1, list.length)));
      for (const s of list) {
        const [x, y] = polar(cx, cy, ringR(d), s.deg);
        place.set(s.id, { x, y, deg: s.deg, onRoute: s.onRoute, d });
      }
    }

    layer.textContent = '';
    layer.setAttribute('viewBox', `0 0 ${W} ${H}`);

    // the rings of depth; the outermost carries a fine tick scale that drifts
    const ringsG = svg('g', { class: 'orr-route__rings' });
    for (let k = 1; k <= rings; k += 1) {
      const ringCls = `orr-route__ring${k === 1 ? ' orr-route__ring--near' : ''}`;
      ringsG.appendChild(svg('path', { d: arcD(cx, cy, ringR(k), 0, 360), class: `orr-band ${ringCls}` }));
      ringsG.appendChild(svg('path', { d: arcD(cx, cy, ringR(k), 0, 360), class: `orr-edge ${ringCls}` }));
    }
    const drift = svg('g', { class: 'orr-drift', style: `transform-origin:${f(cx)}px ${f(cy)}px; --orr-drift-s:640s` });
    drift.appendChild(svg('path', { d: ticksD(cx, cy, R + 6, 72, { len: 3, major: 9, majorLen: 7, inward: false }), class: 'orr-tick', style: 'stroke:rgb(236 230 216 / .3)' }));
    ringsG.appendChild(drift);
    layer.appendChild(fade(ringsG, 0));

    // the route: a beam of light the way you will fly, a pulse travelling it
    const routePts = route.map((id) => place.get(id)).filter(Boolean);
    let beamD = '';
    let endPoint = null;
    if (dest && !local) {
      beamD = routePts.map((p, i) => `${i ? 'L' : 'M'} ${f(p.x)} ${f(p.y)}`).join(' ');
      endPoint = routePts[routePts.length - 1];
    } else if (dest && local) {
      // the berth is in this sector: a short beam to a bead just off the centre
      const [bx, by] = polar(cx, cy, ringR(1) * 0.42, 52);
      beamD = `M ${f(cx)} ${f(cy)} L ${f(bx)} ${f(by)}`;
      endPoint = { x: bx, y: by, deg: 52 };
    }
    const beamSegs = [];
    if (dest && !local) for (let i = 1; i < routePts.length; i += 1) beamSegs.push([routePts[i - 1], routePts[i]]);
    else if (endPoint) beamSegs.push([{ x: cx, y: cy }, endPoint]);
    // the screen's tether leaves the origin down-left at 45 degrees: no name lies across it
    if (data.tether) { const o = place.get(data.origin) || { x: cx, y: cy }; beamSegs.push([{ x: o.x, y: o.y }, { x: o.x - 900, y: o.y + 900 }]); }
    const onRim = (pt) => !!pt && Math.abs(Math.hypot(pt.x - cx, pt.y - cy) - R) < 6;

    // the names: every drawn sector is named, or it is not drawn. A name takes the first of the
    // places round its node that touches no other name, no node and not the beam.
    const nameBoxes = [];
    const nodeR = (id) => (id === dest ? 7 : place.get(id).onRoute ? 5 : 2.2);
    const nodeHalo = (id) => (id === dest ? 20 : id === data.origin ? 14 : 9);
    const nodeBoxes = [...place].map(([id, p]) => { const k = nodeHalo(id); return { l: p.x - k, r: p.x + k, t: p.y - k, b: p.y + k, id, r0: nodeR(id) }; });
    let destBox = null;
    const labelSize = (text, small) => ({ w: text.length * (small ? 7.4 : 8.6), h: small ? 11 : 12 });
    const ringCrosses = (box) => {
      const corners = [[box.l, box.t], [box.r, box.t], [box.l, box.b], [box.r, box.b]];
      const ds = corners.map(([x, y]) => Math.hypot(x - cx, y - cy));
      const nx = Math.max(box.l, Math.min(cx, box.r)); const ny = Math.max(box.t, Math.min(cy, box.b));
      const dmin = Math.hypot(nx - cx, ny - cy); const dmax = Math.max(...ds);
      for (let k = 1; k <= rings; k += 1) { const rr = ringR(k); if (dmin < rr + 4 && dmax > rr - 4) return true; }
      return false;
    };
    function placeName(p, lines, { isDest = false, reserve = false, outside = false, preferOutside = false } = {}) {
      const sizes = lines.map((ln) => labelSize(ln.text, !!ln.small));
      const w = Math.max(...sizes.map((s) => s.w));
      const h = sizes.reduce((s, x) => s + x.h + 1, -1);
      // a name clears its own marker: the berth's ring, the station's crosshair ticks (r 13), a node's dot
      const gapR = isDest ? 14 : p.id === data.origin ? 16 : 10;
      const turns = preferOutside ? [] : [0, 45, -45, 90, -90, 135, -135, 180];
      for (const turn of turns) {
        const deg = ((p.deg + turn) % 360 + 360) % 360;
        const rad = ((deg - 90) * Math.PI) / 180;
        const ux = Math.cos(rad); const uy = Math.sin(rad);
        // the box sits just off the node along the bearing, its near edge nearest the node
        let ax; let anchor;
        if (Math.abs(ux) < 0.3) { anchor = 'middle'; ax = p.x + ux * gapR; }
        else if (ux > 0) { anchor = 'start'; ax = p.x + ux * gapR; }
        else { anchor = 'end'; ax = p.x + ux * gapR; }
        const cyText = p.y + uy * (gapR + h / 2);
        const l = anchor === 'middle' ? ax - w / 2 : anchor === 'start' ? ax : ax - w;
        const box = { l, r: l + w, t: cyText - h / 2, b: cyText + h / 2 };
        if (box.l < 2 || box.r > W - 2 || box.t < 2 || box.b > H - capH - 2) continue;
        if (nameBoxes.some((nb) => boxesTouch(nb, box, 3))) continue;
        // a ring is a connector too: no name lies across one (its box must sit wholly inside or outside every ring)
        // the two reserved names (here, the destination) keep clear air: nothing lands within 24px of them
        if (!isDest && destBox && boxesTouch(destBox, box, 8)) continue;
        if (nodeBoxes.some((nb) => nb.id !== p.id && boxesTouch({ l: nb.l, r: nb.r, t: nb.t, b: nb.b }, box, 2))) continue;
        if (beamSegs.some(([a, b]) => segmentTouches(a.x, a.y, b.x, b.y, box, 2))) continue;
        if (reserve) { nameBoxes.push(box); if (isDest) destBox = box; }
        return { box, anchor, ax, top: box.t, w, h };
      }
      if (isDest || outside || preferOutside) {
        // no room round the node: the name hangs outside the outer ring on the node's bearing, off a leader
        const rad = ((p.deg - 90) * Math.PI) / 180;
        const ux = Math.cos(rad); const uy = Math.sin(rad);
        // out along the radial in 6px steps until neither a ring nor a node lies inside the box
        let dist = R + 20; let ox = 0; let oy = 0; let anchor = 'middle'; let ax = 0; let box = null;
        for (let k = 0; k < 12; k += 1) {
          ox = cx + ux * dist; oy = cy + uy * dist;
          anchor = Math.abs(ux) < 0.3 ? 'middle' : (ux > 0 ? 'start' : 'end');
          ax = anchor === 'middle' ? ox : ox + (ux > 0 ? 4 : -4);
          const cyText = anchor === 'middle' ? oy + uy * (h / 2 + 4) : oy;
          const l0 = anchor === 'middle' ? ax - w / 2 : anchor === 'start' ? ax : ax - w;
          box = { l: Math.max(2, Math.min(W - 2 - w, l0)), t: Math.max(2, Math.min(H - capH - 2 - h, cyText - h / 2)) };
          box.r = box.l + w; box.b = box.t + h;
          const clearRings = !ringCrosses(box);
          const clearNodes = !nodeBoxes.some((nb) => boxesTouch({ l: nb.l, r: nb.r, t: nb.t, b: nb.b }, box, 6));
          const clearNames = !nameBoxes.some((nb) => boxesTouch(nb, box, 4)) && (isDest || !destBox || !boxesTouch(destBox, box, 12));
          const lx = Math.max(box.l - 3, Math.min(p.x, box.r + 3)); const ly = Math.max(box.t - 3, Math.min(p.y, box.b + 3));
          const clearLeader = !nameBoxes.some((nb) => segmentTouches(p.x, p.y, lx, ly, nb, 4));
          if (clearRings && clearNodes && clearNames && clearLeader) break;
          dist += 6;
        }
        const axc = anchor === 'middle' ? box.l + w / 2 : anchor === 'start' ? box.l : box.r;
        if (reserve) { nameBoxes.push(box); if (isDest) destBox = box; }
        // the leader lands on the word: at the point of the label's box (3px out) nearest its node
        const lx2 = Math.max(box.l - 3, Math.min(p.x, box.r + 3));
        const ly2 = Math.max(box.t - 3, Math.min(p.y, box.b + 3));
        return { box, anchor, ax: axc, top: box.t, w, h, leader: { x1: p.x, y1: p.y, x2: lx2, y2: ly2 } };
      }
      return null;
    }
    const leaderD = (ld) => `M ${f(ld.x1)} ${f(ld.y1)} L ${f(ld.x2)} ${f(ld.y2)}`;
    const textLines = (spot, lines) => {
      const g = svg('g', {});
      let y = spot.top;
      lines.forEach((ln) => {
        const size = labelSize(ln.text, !!ln.small);
        const t = svg('text', { x: f(spot.ax), y: f(y + size.h - 1.5), 'text-anchor': spot.anchor, class: `orr-route__name ${ln.cls || ''}`.trim() });
        t.textContent = ln.text;
        g.appendChild(t);
        y += size.h + 1;
      });
      return g;
    };

    // here first: its words stand on the side the route does not leave from
    const firstHop = routePts.length > 1 ? routePts[1] : null;
    const below = !firstHop || firstHop.deg < 80 || firstHop.deg > 280 || (local && endPoint && endPoint.deg < 90);
    const hereName = String(data.originName || origin.name || '').toUpperCase();
    const hereLines = [{ text: hereName, cls: 'orr-route__name--live' }];
    const hereSpot = placeName({ ...place.get(data.origin), id: data.origin, deg: below ? 180 : 0 }, hereLines, { reserve: true })
      || placeName({ ...place.get(data.origin), id: data.origin, deg: below ? 0 : 180 }, hereLines, { reserve: true });
    // then the destination: the sector it lies in, and the berth under it
    const destLines = dest && !local
      ? [{ text: String(SECTOR.get(dest).name || dest).toUpperCase(), cls: 'orr-route__name--live' }]
        .concat(data.destName && String(data.destName).toUpperCase() !== String(SECTOR.get(dest).name || '').toUpperCase()
          ? [{ text: String(data.destName).toUpperCase(), cls: 'orr-route__name--berth', small: true }] : [])
      : null;
    // a destination on the rim hangs just outside its berth on a solid leader, never in a lane
    const destSpot = destLines ? placeName({ ...place.get(dest), id: dest }, destLines, { isDest: true, reserve: true }) : null;
    if (destSpot && destSpot.leader) beamSegs.push([{ x: destSpot.leader.x1, y: destSpot.leader.y1 }, { x: destSpot.leader.x2, y: destSpot.leader.y2 }]);
    // then the rest, the route first, nearest ring first
    // a short host names only what it has room for: the route and the berth's own lane neighbours
    const compactNames = H < 340;
    const others = [...place].filter(([id, p]) => id !== data.origin && id !== dest && (!compactNames || p.onRoute || p.d <= 1))
      .sort((a, b) => (Number(b[1].onRoute) - Number(a[1].onRoute)) || (a[1].d - b[1].d));
    const drawn = new Map();
    for (const [id, p] of others) {
      const spot = placeName({ ...p, id }, [{ text: String(SECTOR.get(id).name || id).toUpperCase(), cls: p.onRoute ? 'orr-route__name--live' : 'orr-route__name--faint', small: !p.onRoute }], { reserve: true, outside: true });
      if (spot) drawn.set(id, spot);
    }

    // the lanes between the sectors that are drawn, as faint dashed light
    const isDrawn = (id) => id === data.origin || id === dest || drawn.has(id);
    const laneParts = [];
    const seen = new Set();
    for (const [id, p] of place) {
      if (!isDrawn(id)) continue;
      for (const n of (SECTOR.get(id).neighbors || [])) {
        const q = place.get(n);
        if (!q || !isDrawn(n)) continue;
        const k = id < n ? `${id}|${n}` : `${n}|${id}`;
        if (seen.has(k)) continue;
        seen.add(k);
        laneParts.push(`M ${f(p.x)} ${f(p.y)} L ${f(q.x)} ${f(q.y)}`);
      }
    }
    // the dial's rule breaks for its numerals: rings and lanes are cut 4px round every placed name
    const cutId = `orr-route-cut-${Math.random().toString(36).slice(2, 8)}`;
    const mask = svg('mask', { id: cutId, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: W, height: H });
    mask.appendChild(svg('rect', { x: 0, y: 0, width: W, height: H, fill: '#fff' }));
    for (const nb of nameBoxes) mask.appendChild(svg('rect', { x: f(nb.l - 4), y: f(nb.t - 4), width: f(nb.r - nb.l + 8), height: f(nb.b - nb.t + 8), fill: '#000' }));
    if (endPoint) mask.appendChild(svg('circle', { cx: f(endPoint.x), cy: f(endPoint.y), r: 10, fill: '#000' }));
    const defs = svg('defs', {}); defs.appendChild(mask); layer.insertBefore(defs, layer.firstChild);
    ringsG.setAttribute('mask', `url(#${cutId})`);
    if (laneParts.length) layer.appendChild(fade(svg('path', { d: laneParts.join(' '), class: 'orr-core orr-route__lane', 'stroke-width': 1.4, 'stroke-dasharray': '5 5', mask: `url(#${cutId})` }), 60));

    // the beam, its pulse, the hops and the hand ride in one group, so the arm can swing before they show
    const beamG = svg('g', { class: 'orr-route__beamg' });
    const swinging = swingFrom != null && arriveNow && !!endPoint && !local;
    layer.appendChild(beamG);
    if (beamD) {
      const id = `orr-route-path-${++pathSeq}`;
      beamG.appendChild(svg('path', { d: beamD, class: 'orr-bloom orr-route__beam-bloom', 'stroke-width': 12, pathLength: 1, 'stroke-linejoin': 'round' }));
      const core = svg('path', { id, d: beamD, class: `orr-core orr-route__beam${arriveNow && !swinging ? ' orr-draw' : ''}`, 'stroke-width': 2.4, pathLength: 1, 'stroke-linejoin': 'round' });
      core.style.setProperty('--orr-delay', '120ms');
      beamG.appendChild(core);
      if (arriveNow) {
        const pulse = svg('g', { class: 'orr-route__pulse-g' });
        const bloom = svg('circle', { r: 8, class: 'orr-route__pulse-bloom' });
        const dot = svg('circle', { r: 3, class: 'orr-route__pulse' });
        pulse.append(bloom, dot);
        // it waits at the berth while the beam draws, flies the route, rests a beat, and goes again
        const motion = svg('animateMotion', { dur: '3.4s', begin: '0s', repeatCount: 'indefinite', calcMode: 'linear',
          keyPoints: '0;0;1;1', keyTimes: '0;0.2;0.88;1' });
        motion.appendChild(svg('mpath', { href: `#${id}` }));
        pulse.appendChild(motion);
        beamG.appendChild(pulse);
      }
      // a tick across the beam where each jump lands, the destination included
      for (let i = 1; i < routePts.length; i += 1) {
        const p = routePts[i];
        const prev = routePts[i - 1];
        const ang = Math.atan2(p.y - prev.y, p.x - prev.x) + Math.PI / 2;
        const last = i === routePts.length - 1;
        const t = last ? 18 : 7;
        const c = Math.cos(ang); const s = Math.sin(ang);
        layer.appendChild(fade(svg('path', {
          d: last
            ? `M ${f(p.x + c * 13)} ${f(p.y + s * 13)} L ${f(p.x + c * t)} ${f(p.y + s * t)} M ${f(p.x - c * 13)} ${f(p.y - s * 13)} L ${f(p.x - c * t)} ${f(p.y - s * t)}`
            : `M ${f(p.x + c * t)} ${f(p.y + s * t)} L ${f(p.x - c * t)} ${f(p.y - s * t)}`,
          class: 'orr-core orr-route__hop', 'stroke-width': 2,
        }), 300 + i * 60));
      }
    }

    // threat: a red arc round the sectors on the way where the lane is dangerous
    for (const id of route) {
      if (id === data.origin) continue;
      const s = SECTOR.get(id);
      const p = place.get(id);
      if (!s || !p) continue;
      const danger = dangerIndex(s);
      if (danger < 0.5) continue;
      const span = 60 + 200 * Math.min(1, (danger - 0.5) / 0.5);
      const a0 = p.deg + 180 - span / 2;
      layer.appendChild(fade(svg('path', { d: arcD(p.x, p.y, 13, a0, a0 + span), class: 'orr-bloom orr-route__threat-bloom', 'stroke-width': 7 }), 420));
      layer.appendChild(fade(svg('path', { d: arcD(p.x, p.y, 13, a0, a0 + span), class: 'orr-core orr-route__threat', 'stroke-width': 2 }), 420));
    }

    // the sectors and their names
    let li = 0;
    for (const [id, p] of others) {
      const spot = drawn.get(id);
      if (!spot) continue;
      if (p.onRoute) layer.appendChild(fade(svg('circle', { cx: f(p.x), cy: f(p.y), r: 5, class: 'orr-route__node' }), 200 + li * 40));
      else {
        layer.appendChild(fade(svg('circle', { cx: f(p.x), cy: f(p.y), r: 7.5, class: 'orr-route__dot-bloom' }), 200 + li * 40));
        layer.appendChild(fade(svg('circle', { cx: f(p.x), cy: f(p.y), r: 3.5, class: 'orr-route__dot' }), 200 + li * 40));
      }
      if (spot.leader) layer.appendChild(fade(svg('path', { d: leaderD(spot.leader), class: 'orr-core orr-route__leader', 'stroke-width': 1.4, 'stroke-dasharray': '2.5 3' }), 240 + li * 40));
      layer.appendChild(fade(textLines(spot, [{ text: String(SECTOR.get(id).name || id).toUpperCase(), cls: p.onRoute ? 'orr-route__name--live' : 'orr-route__name--faint', small: !p.onRoute }]), 260 + li * 40));
      li += 1;
    }
    // here: a crosshair node at the centre, the berth's name beside it
    const here = svg('g', { class: 'orr-route__here' });
    here.append(
      svg('circle', { cx: f(cx), cy: f(cy), r: 8, class: 'orr-route__node orr-route__node--here' }),
      svg('circle', { cx: f(cx), cy: f(cy), r: 3, class: 'orr-route__here-core' }),
      svg('path', { d: ticksD(cx, cy, 13, 4, { len: 4, inward: true }), class: 'orr-core orr-route__crosshair', 'stroke-width': 1.5 }),
    );
    if (hereSpot) here.appendChild(textLines(hereSpot, hereLines));
    layer.appendChild(fade(here, 80));
    // the Hand's bead on the destination, the sector's name and the berth's beside it
    if (endPoint) {
      const hg = svg('g', { class: 'orr-route__hand' });
      hg.append(
        svg('circle', { cx: f(endPoint.x), cy: f(endPoint.y), r: 13, class: 'orr-route__hand-glow' }),
        svg('circle', { cx: f(endPoint.x), cy: f(endPoint.y), r: local ? 6 : 7, class: 'orr-core orr-route__hand-ring', 'stroke-width': 2, fill: 'none' }),
        svg('circle', { cx: f(endPoint.x), cy: f(endPoint.y), r: 3.8, class: 'orr-route__hand-bead' }),
      );
      beamG.appendChild(fade(hg, 520));
      if (destSpot && destSpot.leader) layer.appendChild(fade(svg('path', { d: leaderD(destSpot.leader), class: 'orr-core orr-route__leader orr-route__leader--dest', 'stroke-width': 1.5 }), 540));
      if (destSpot && destLines) layer.appendChild(fade(textLines(destSpot, destLines), 560));
      if (local) {
        const t = svg('text', { x: f(endPoint.x + 12), y: f(endPoint.y + 3), 'text-anchor': 'start', class: 'orr-route__name orr-route__name--live' });
        t.textContent = String(data.destName || 'THIS SECTOR').toUpperCase();
        layer.appendChild(fade(t, 560));
      }
    }

    // the caption: how many jumps, and where the beam ends or passes
    caption.textContent = '';
    const jumps = doc.createElement('span');
    jumps.className = 'orr-route__jumps';
    const via = doc.createElement('span');
    via.className = 'orr-route__via';
    if (!dest) { via.textContent = 'ROUTE PENDING'; }
    else if (local) { jumps.textContent = '0'; via.textContent = 'JUMPS · THIS SECTOR'; }
    else {
      const n = route.length - 1;
      const mids = route.slice(1, -1).map((id) => (SECTOR.get(id).name || id).toUpperCase());
      const destSector = (SECTOR.get(dest).name || dest).toUpperCase();
      jumps.textContent = String(n);
      via.textContent = `${n === 1 ? 'JUMP' : 'JUMPS'} · ${mids.length ? `VIA ${mids.join(' · ')} TO ` : 'TO '}${destSector}`;
    }
    caption.append(jumps, via);
    // the screen may draw the reading itself, on a line from its own key to this origin
    if (typeof onLayout === 'function') {
      const o = place.get(data.origin) || { x: cx, y: cy };
      try { onLayout({ W, H, cx, cy, R, origin: { x: o.x, y: o.y }, jumpsText: jumps.textContent, viaText: via.textContent }); } catch (_) { /* the screen's overlay is cosmetic */ }
    }

    // the arm swings from the last berth to this one (a spring with a little overshoot), and only
    // then does the route with its hops and pulse take its place
    const armR = endPoint ? Math.hypot(endPoint.x - cx, endPoint.y - cy) : 0;
    if (swinging) {
      const fromDeg = swingFrom;
      const toDeg = fromDeg + ((((endPoint.deg - fromDeg) % 360) + 540) % 360) - 180;
      const sg = svg('g', { class: 'orr-route__swingg' });
      const armBloom = svg('path', { class: 'orr-bloom orr-route__swing-bloom', 'stroke-width': 12, 'stroke-linecap': 'round' });
      const arm = svg('path', { class: 'orr-core orr-route__swing', 'stroke-width': 2.4, 'stroke-linecap': 'round' });
      sg.append(armBloom, arm);
      layer.appendChild(sg);
      beamG.style.opacity = '0';
      const paint = (deg) => { const [x, y] = polar(cx, cy, armR, deg); const d = `M ${f(cx)} ${f(cy)} L ${f(x)} ${f(y)}`; arm.setAttribute('d', d); armBloom.setAttribute('d', d); };
      paint(fromDeg);
      if (swingSpring) swingSpring.stop();
      const spring = createSpring({ value: fromDeg, preset: 'swing', precision: 0.02, onUpdate: (v) => {
        paint(v);
        if (spring.value === spring.target) { sg.remove(); beamG.style.opacity = ''; if (swingSpring === spring) swingSpring = null; }
      } });
      swingSpring = spring;
      spring.set(toDeg);
    }
    swingFrom = null;
    lastEnd = endPoint && !local ? { deg: endPoint.deg } : null;
  }

  return {
    el: host,
    /** @param {{ origin: string, dest?: string|null, originName?: string, destName?: string }} next */
    set(next) {
      const changed = !!(data && next && next.dest && next.dest !== data.dest);
      swingFrom = changed && lastEnd && !reducedMotion() ? lastEnd.deg : null;
      data = next ? { ...next } : null;
      drawnKey = '';
      schedule();
    },
    relayout: schedule,
    active: () => on,
    dispose() {
      if (ro) ro.disconnect();
      if (frame && typeof globalThis.cancelAnimationFrame === 'function') globalThis.cancelAnimationFrame(frame);
      frame = 0;
      standDown();
      for (const n of [layer, caption]) if (n.parentNode) n.parentNode.removeChild(n);
      host.classList.remove('orr-route', 'is-off');
    },
  };
}
