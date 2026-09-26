// src/ui/orrery/constellation.js — the Research Constellation (design/frontend/ORRERY.md §6 Meta: "Tech
// tree: a constellation — nodes as stars, links as Beams; unlocking sweeps light down the link").
//
// The research tree drawn as an orrery seen from above. Every tier is an orbit: the roots stand on the
// outermost, each tier one orbit further in, so research falls inward toward the core. The branches
// (combat, drives, industry, logistics) are sectors of the dial, each named on the rim with its progress
// as an arc. A node is a star whose light says its state: researched is full bone with a glint, open is
// a lit ring, locked is a dim point. A prerequisite is a beam between two stars: lit where both ends are
// owned, carrying an ice pulse where it leads to something you can research now, a hairline where it is
// still dark. The one amber Hand pivots at the core and swings (spring) to the chosen star; choosing
// sweeps light down the chosen star's path from its roots, and a research sweeps light into the star it
// lit.
//
// Every star is a real <button data-node> (roving tabindex; the arrow keys and the pad move between
// stars by direction) carrying its name as a label placed by a collision-free solver: a label takes the
// first place round its star that touches no star, no other label, no rim word and no beam. A label that
// finds no place is not drawn at rest; its star shows it when hovered, focused or chosen.
//
// A screen hands in the host, calls set() with the nodes and their states, and keeps its own handlers
// through onPick. Without a layout (node tests, a hidden host) the instrument stands down.

import { svg, polar, arcD, ticksD } from './svg.js';
import { injectOrrery } from './tokens.js';
import { createSpring, reducedMotion } from './motion.js';

const STYLE_ID = 'orr-constellation-style';
const BONE = '236 230 216';
const WARM = '248 244 234';
/** degrees kept clear at the top of the dial: the tier scale runs down this spoke */
const TOP_GAP = 18;
/** degrees between two branches */
const SECTOR_GAP = 7;
/** the innermost orbit, as a fraction of the outermost */
const R_MIN = 0.3;
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const f = (n) => Math.round(n * 100) / 100;

const CSS = `
.con-sky { position:absolute; inset:0; isolation:isolate; }
.con-sky::before { content:""; position:absolute; z-index:-1; left:var(--con-cx, 50%); top:var(--con-cy, 50%); width:var(--con-pool, 900px); height:var(--con-pool, 900px);
  transform:translate(-50%, -50%); pointer-events:none; border-radius:50%;
  background:radial-gradient(closest-side, rgb(5 7 10 / .86), rgb(5 7 10 / .72) 62%, rgb(5 7 10 / .34) 84%, rgb(5 7 10 / 0)); }
.con-sky.is-off > * { display:none !important; }
.con-sky > svg.con-sky__svg { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; pointer-events:none; }
.con-sky__stars { position:absolute; inset:0; pointer-events:none; }

/* the dial: orbits, the rim scale, the branch sectors, the tier spoke */
.orr-svg .con-orbit { fill:none; stroke:rgb(${BONE} / .15); stroke-width:1; vector-effect:non-scaling-stroke; }
.orr-svg .con-orbit.is-outer { stroke:rgb(${BONE} / .26); }
.orr-svg .con-rim { fill:none; stroke:rgb(${BONE} / .2); stroke-width:1; }
.orr-svg .con-rim--major { stroke:rgb(${BONE} / .55); }
.orr-svg .con-sector__track { fill:none; stroke:rgb(${BONE} / .2); stroke-width:2; stroke-linecap:butt; }
.orr-svg .con-sector__fill { fill:none; stroke:rgb(${WARM}); stroke-width:2; stroke-linecap:butt; transition:stroke-dasharray .6s var(--dp-ease-out, ease-out); }
.orr-svg .con-sector__bloom { fill:none; stroke:rgb(${WARM}); stroke-width:7; opacity:.16; stroke-linecap:butt; }
.orr-svg text.con-sector__name { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:var(--con-rim-px, 10px); letter-spacing:.26em;
  text-transform:uppercase; fill:rgb(${BONE} / .74); }
.orr-svg text.con-sector__name tspan.con-sector__count { fill:rgb(${WARM}); letter-spacing:.1em; }
.orr-svg text.con-tier { font-family:var(--dp-face-label, "Archivo"); font-stretch:100%; font-weight:600; font-size:var(--con-tier-px, 9.5px); letter-spacing:.06em;
  fill:rgb(${BONE} / .6); text-anchor:middle; dominant-baseline:central; }
.orr-svg .con-spoke { stroke:rgb(${BONE} / .16); stroke-width:1; stroke-dasharray:1 4; }
.orr-svg .con-core__track { fill:none; stroke:rgb(${BONE} / .2); stroke-width:1.5; }
.orr-svg .con-core__fill { fill:none; stroke:rgb(${WARM}); stroke-width:2.5; stroke-linecap:round; }
.orr-svg .con-core__ticks { stroke:rgb(${BONE} / .28); stroke-width:1; }
.orr-svg .con-drift { fill:none; stroke:rgb(${BONE} / .14); stroke-width:1; }

/* beams: a prerequisite as a line of light */
.orr-svg .con-beam__core { fill:none; stroke:rgb(${BONE} / .17); stroke-width:1; stroke-linecap:round; }
.orr-svg .con-beam__bloom { fill:none; stroke:rgb(${WARM}); stroke-width:6; opacity:0; stroke-linecap:round; }
.orr-svg .con-beam__sweep { fill:none; stroke:rgb(255 251 242); stroke-width:2.2; stroke-linecap:round; stroke-dasharray:.28 1.4; stroke-dashoffset:.3; opacity:0; }
.orr-svg .con-beam[data-state="open"] .con-beam__core { stroke:rgb(${BONE} / .44); stroke-width:1.2; }
.orr-svg .con-beam[data-state="lit"] .con-beam__core { stroke:rgb(${WARM} / .88); stroke-width:1.5; }
.orr-svg .con-beam[data-state="lit"] .con-beam__bloom { opacity:.2; }
.orr-svg .con-beam.is-path .con-beam__core { stroke:rgb(${BONE} / .5); stroke-width:1.3; }
.orr-svg .con-beam.is-path[data-state="open"] .con-beam__core { stroke:rgb(${WARM} / .8); stroke-width:1.5; }
.orr-svg .con-beam.is-path[data-state="lit"] .con-beam__core { stroke:rgb(255 251 242); stroke-width:1.8; }
.orr-svg .con-beam.is-path .con-beam__bloom { opacity:.14; }
.orr-svg .con-beam.is-path[data-state="lit"] .con-beam__bloom { opacity:.3; }
.orr-svg .con-beam.is-sweep .con-beam__sweep { animation:con-sweep 560ms cubic-bezier(.3, .1, .3, 1) both; animation-delay:var(--con-d, 0ms); }
@keyframes con-sweep { 0% { opacity:1; stroke-dashoffset:.3; } 88% { opacity:1; } 100% { opacity:0; stroke-dashoffset:-1.1; } }
.orr-svg .con-pulse { fill:var(--dp-ice, #8fcbff); }
.orr-svg .con-pulse-bloom { fill:var(--dp-ice, #8fcbff); opacity:.28; }

/* stars: the light says the state */
.orr-svg .con-star__halo { opacity:0; }
.orr-svg .con-star__ring { fill:rgb(5 7 10 / .9); stroke:rgb(${BONE} / .34); stroke-width:1; }
.orr-svg .con-star__core { fill:rgb(${BONE} / .55); transform-box:fill-box; transform-origin:center; transform:scale(.5); }
.orr-svg .con-star__glint { fill:none; stroke:rgb(${WARM}); stroke-width:1; opacity:0; stroke-linecap:round; }
.orr-svg .con-star[data-state="locked"] .con-star__ring { stroke-dasharray:2 2.2; }
.orr-svg .con-star[data-state="available"] .con-star__ring { stroke:rgb(${WARM}); stroke-width:1.5; }
.orr-svg .con-star[data-state="available"] .con-star__core { fill:rgb(${WARM}); transform:scale(.46); }
.orr-svg .con-star[data-state="available"] .con-star__halo { opacity:.22; }
.orr-svg .con-star[data-state="available"].is-ready .con-star__halo { opacity:.34; animation:con-breathe 3.4s ease-in-out infinite; }
@keyframes con-breathe { 0%, 100% { opacity:.24; } 50% { opacity:.46; } }
.orr-svg .con-star[data-state="researched"] .con-star__ring { fill:rgb(${WARM}); stroke:rgb(${WARM}); stroke-width:1; }
.orr-svg .con-star[data-state="researched"] .con-star__core { fill:rgb(255 253 247); transform:none; }
.orr-svg .con-star[data-state="researched"] .con-star__halo { opacity:.55; }
.orr-svg .con-star[data-state="researched"] .con-star__glint { opacity:.7; }
.orr-svg .con-star.is-hot .con-star__ring { stroke:rgb(${WARM}); stroke-dasharray:none; }
.orr-svg .con-star.is-hot[data-state="locked"] .con-star__core { fill:rgb(${WARM} / .85); }
.orr-svg .con-star.is-flare .con-star__halo { animation:con-flare 900ms ease-out both; }
@keyframes con-flare { 0% { opacity:.9; transform:scale(.4); } 100% { opacity:.2; transform:scale(1); } }
.orr-svg .con-star__halo { transform-box:fill-box; transform-origin:center; }

/* the chosen star: a bone reticle; the Hand is the only amber */
.orr-svg .con-reticle path { fill:none; stroke:rgb(${WARM}); stroke-width:1.4; stroke-linecap:butt; }
.orr-svg .con-reticle circle { fill:none; stroke:rgb(${WARM} / .34); stroke-width:1; }
.orr-svg .con-reticle.is-snap > g { animation:con-snap 360ms cubic-bezier(.34, 1.36, .64, 1) both; transform-box:fill-box; transform-origin:center; }
@keyframes con-snap { from { opacity:0; transform:scale(1.7) rotate(-30deg); } to { opacity:1; transform:none; } }
.orr-svg .con-hand__arm { fill:none; stroke:var(--dp-hand, #f2b950); stroke-width:1.7; stroke-linecap:round; }
.orr-svg .con-hand__bloom { fill:none; stroke:var(--dp-hand, #f2b950); stroke-width:7; opacity:.22; stroke-linecap:round; }
.orr-svg .con-hand__tip { fill:none; stroke:var(--dp-hand, #f2b950); stroke-width:1.7; stroke-linejoin:miter; }
.orr-svg .con-hand__hub { fill:var(--dp-hand, #f2b950); }
.orr-svg .con-hand__hubring { fill:rgb(5 7 10); stroke:rgb(${WARM}); stroke-width:1.3; }
.orr-svg .con-hand__pin { fill:rgb(255 244 214); }

/* arrival: the orbits draw from the rim inward, the stars light, the beams draw after them */
.con-sky.is-arriving .con-orbit, .con-sky.is-arriving .con-sector__track { stroke-dasharray:1 1; stroke-dashoffset:1; animation:con-draw 620ms var(--dp-ease-out, ease-out) forwards; animation-delay:var(--con-d, 0ms); }
.con-sky.is-arriving .con-beam__core { stroke-dasharray:1 1; stroke-dashoffset:1; animation:con-draw 520ms var(--dp-ease-out, ease-out) forwards; animation-delay:var(--con-d, 0ms); }
.con-sky.is-arriving .con-star, .con-sky.is-arriving .con-label-in { opacity:0; animation:con-in 380ms var(--dp-ease-out, ease-out) forwards; animation-delay:var(--con-d, 0ms); }
.con-sky.is-arriving .con-rimwords { opacity:0; animation:con-in 420ms var(--dp-ease-out, ease-out) 420ms forwards; }
@keyframes con-draw { to { stroke-dashoffset:0; } }
@keyframes con-in { to { opacity:1; } }
.orr-svg .con-rimdrift { transform-box:view-box; animation:orr-drift 1400s linear infinite; }

/* the stars as controls: a hit disc on the star, the label beside it */
.con-star-btn { position:absolute; width:30px; height:30px; margin:-15px 0 0 -15px; padding:0; border:0 !important; background:none !important; box-shadow:none !important;
  cursor:pointer; pointer-events:auto; color:inherit; font:inherit; outline:none !important; min-width:0 !important; min-height:0 !important; }
.con-star-btn::before { content:""; position:absolute; left:50%; top:50%; width:var(--con-focus, 30px); height:var(--con-focus, 30px); margin:calc(var(--con-focus, 30px) / -2) 0 0 calc(var(--con-focus, 30px) / -2);
  border-radius:50% !important; box-shadow:0 0 0 1px rgb(${WARM} / 0); transition:box-shadow .16s linear; pointer-events:none; }
.con-star-btn:focus-visible::before { box-shadow:0 0 0 1px rgb(${WARM} / .95), 0 0 0 4px rgb(${WARM} / .14); }
.con-star-btn::after { content:none !important; }
.con-label { position:absolute; display:block; box-sizing:border-box; white-space:nowrap; pointer-events:auto; cursor:pointer; line-height:1;
  text-shadow:0 0 2px rgb(4 6 9), 0 0 4px rgb(4 6 9), 0 0 8px rgb(4 6 9 / .9); }
.con-label.is-w, .con-label.is-nw, .con-label.is-sw { text-align:right; }
.con-label.is-n, .con-label.is-s { text-align:center; }
.con-label.is-dropped { display:none; }
.con-label.is-under-hand { opacity:.3; transition:opacity .2s linear; }
.con-star-btn:is(:hover, :focus-visible) > .con-label.is-under-hand { opacity:1; }
.con-label__name { display:block; font-family:var(--dp-face-read, "Instrument Sans"), "Instrument Sans", system-ui, sans-serif; font-weight:500; font-size:var(--con-px, 13px);
  line-height:var(--con-lh, 16px); letter-spacing:.005em; color:rgb(${BONE} / .7); text-transform:none; }
.con-label__cost { display:block; margin-top:2px; font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:var(--con-cost-px, 10.5px); line-height:1.2;
  letter-spacing:.1em; text-transform:uppercase; color:rgb(${BONE} / .6); font-variant-numeric:tabular-nums; }
.con-star-btn[data-state="available"] .con-label__name { color:rgb(${WARM} / .96); }
.con-star-btn[data-state="available"].is-ready .con-label__cost { color:var(--dp-phos, #dfeeff); }
.con-star-btn[data-state="researched"] .con-label__name { color:rgb(${WARM}); }
.con-star-btn:is(:hover, :focus-visible, .is-chosen) .con-label__name { color:rgb(255 252 245); }
.con-star-btn.is-chosen .con-label__name { font-weight:600; }
/* a label with no place of its own at rest shows over a pool of shade when its star is hovered, focused or chosen */
.con-star-btn:is(:hover, :focus-visible, .is-chosen) > .con-label.is-dropped { display:block; z-index:3; }
.con-label.is-dropped::before { content:""; position:absolute; z-index:-1; inset:-10px -16px; pointer-events:none;
  background:radial-gradient(closest-side, rgb(4 6 9 / .92), rgb(4 6 9 / .7) 60%, rgb(4 6 9 / 0)); }
.con-star-btn:is(:hover, :focus-visible, .is-chosen) { z-index:2; }

html.sf-reduce-motion .con-sky.is-arriving * { animation:none !important; }
html.sf-reduce-motion .orr-svg .con-star .con-star__halo { animation:none !important; }
html.sf-reduce-motion .orr-svg .con-rimdrift, html.sf-reduce-motion .orr-svg .con-pulse, html.sf-reduce-motion .orr-svg .con-pulse-bloom { animation:none; display:none; }
html.sf-reduce-motion .orr-svg .con-beam.is-sweep .con-beam__sweep, html.sf-reduce-motion .orr-svg .con-reticle.is-snap > g { animation:none; }
@media (forced-colors:active) {
  .con-sky::before { display:none; }
  .orr-svg .con-star__ring, .orr-svg .con-beam__core, .orr-svg .con-orbit { stroke:CanvasText; }
  .orr-svg .con-hand__arm, .orr-svg .con-hand__tip { stroke:Highlight; }
  .con-label__name, .con-label__cost { color:CanvasText !important; forced-color-adjust:none; }
}
`;

function injectStyle(doc) {
  if (!doc || !doc.head || typeof doc.getElementById !== 'function' || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

/** Prerequisite depth: the longest chain of prerequisites under a node (0 for a root). */
export function constellationDepths(nodes) {
  const byId = new Map();
  for (const n of nodes || []) if (n && n.id) byId.set(n.id, n);
  const memo = new Map();
  const walk = (id, seen) => {
    if (memo.has(id)) return memo.get(id);
    const n = byId.get(id);
    const pre = n && Array.isArray(n.prereqs) ? n.prereqs.filter((p) => byId.has(p)) : [];
    if (!pre.length || seen.has(id)) return 0;
    seen.add(id);
    let d = 0;
    for (const p of pre) d = Math.max(d, walk(p, seen) + 1);
    seen.delete(id);
    memo.set(id, d);
    return d;
  };
  const out = {};
  for (const id of byId.keys()) out[id] = walk(id, new Set());
  return out;
}

/**
 * Slots across each branch's sector, by the barycentre heuristic: a child sits under the mean of its
 * parents, a parent over the mean of its children, one slot apart at least, inside the branch's width.
 */
function assignSlots(nodes, branchOf, depth, maxDepth, branchIds) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const rows = new Map();
  for (const b of branchIds) rows.set(b, Array.from({ length: maxDepth + 1 }, () => []));
  for (const n of nodes) rows.get(branchOf(n))[depth[n.id]].push(n.id);
  const parents = new Map();
  const kids = new Map();
  for (const n of nodes) {
    const pre = (n.prereqs || []).filter((p) => byId.has(p));
    parents.set(n.id, pre);
    for (const p of pre) { if (!kids.has(p)) kids.set(p, []); kids.get(p).push(n.id); }
  }
  const width = new Map();
  const slot = {};
  for (const b of branchIds) {
    const w = Math.max(1, ...rows.get(b).map((r) => r.length));
    width.set(b, w);
    for (const r of rows.get(b)) r.forEach((id, i) => { slot[id] = (i + 0.5) * (w / r.length) - 0.5; });
  }
  const place = (ids, want, w) => {
    if (!ids.length) return;
    const order = ids.map((id, i) => ({ id, x: want(id), i })).sort((a, b) => (a.x - b.x) || (a.i - b.i));
    for (let i = 0; i < order.length; i += 1) order[i].x = Math.max(order[i].x, i === 0 ? 0 : order[i - 1].x + 1);
    for (let i = order.length - 1; i >= 0; i -= 1) order[i].x = Math.min(order[i].x, i === order.length - 1 ? w - 1 : order[i + 1].x - 1);
    for (const o of order) slot[o.id] = o.x;
    ids.splice(0, ids.length, ...order.map((o) => o.id));
  };
  const mean = (list, own) => (list.length ? list.reduce((s, id) => s + slot[id], 0) / list.length : own);
  const same = (b) => (id) => branchOf(byId.get(id)) === b;
  for (let it = 0; it < 8; it += 1) {
    for (const b of branchIds) {
      const R = rows.get(b);
      const w = width.get(b);
      for (let d = 1; d <= maxDepth; d += 1) place(R[d], (id) => mean(parents.get(id).filter(same(b)), slot[id]), w);
      for (let d = maxDepth - 1; d >= 0; d -= 1) place(R[d], (id) => (slot[id] + mean((kids.get(id) || []).filter(same(b)), slot[id])) / 2, w);
    }
  }
  return { rows, width, slot };
}

/**
 * The dial's geometry for a host of W x H: the centre, the outer radius, one orbit per tier, a sector
 * per branch (clockwise from the tier spoke at the top, in the order given) and every star's place.
 * `labelOut` is how far a label may stand outside the outermost orbit at the sides.
 */
export function layoutConstellation(nodes, branches, { width: W, height: H, labelOut = 140, rimOut = 34, avoid = [] } = {}) {
  const list = (nodes || []).filter((n) => n && n.id);
  if (!list.length || !(W > 0) || !(H > 0)) return null;
  const branchIds = [];
  for (const b of branches || []) if (b && b.id && !branchIds.includes(b.id)) branchIds.push(b.id);
  const fallback = branchIds[branchIds.length - 1] || 'other';
  if (!branchIds.length) branchIds.push(fallback);
  const branchOf = (n) => (n && branchIds.includes(n.branch) ? n.branch : fallback);
  const depth = constellationDepths(list);
  const maxDepth = Math.max(1, ...Object.values(depth));
  const { rows, width, slot } = assignSlots(list, branchOf, depth, maxDepth, branchIds);
  const rn = Array.from({ length: maxDepth + 1 }, (_, d) => 1 - (d * (1 - R_MIN)) / maxDepth);
  const used = branchIds.filter((b) => rows.get(b).some((r) => r.length));
  const need = new Map();
  for (const b of used) need.set(b, Math.max(1.6, ...rows.get(b).map((r, d) => r.length / rn[d])));
  const avail = 360 - TOP_GAP - SECTOR_GAP * Math.max(0, used.length - 1);
  const total = used.reduce((s, b) => s + need.get(b), 0);
  const sectors = [];
  let a = TOP_GAP / 2;
  for (const b of used) {
    const span = (avail * need.get(b)) / total;
    const meta = (branches || []).find((x) => x && x.id === b) || { id: b, label: b };
    sectors.push({ id: b, label: meta.label || b, a0: a, a1: a + span, ids: rows.get(b).flat() });
    a += span + SECTOR_GAP;
  }
  // the radius: the height bounds it (the rim words stand outside the outer orbit), and the labels at
  // the sides need their room
  // the radius: the height bounds it (the rim words stand outside the outer orbit), the labels at the
  // sides need their room, and the dial stands clear of anything it must avoid (the screen's title);
  // the centre slides to wherever the dial can be largest
  const edge = rimOut + 26;
  const distTo = (x, y, r) => Math.hypot(Math.max(r.x - x, 0, x - (r.x + r.w)), Math.max(r.y - y, 0, y - (r.y + r.h)));
  const fit = (x, y) => Math.min(y - edge, H - y - edge, x - labelOut, W - x - labelOut,
    ...avoid.map((r) => distTo(x, y, r) - rimOut - 10));
  let cx = W / 2;
  let cy = H / 2;
  let R = fit(cx, cy);
  for (let x = W * 0.38; x <= W * 0.64; x += 4) {
    for (let y = H * 0.44; y <= H * 0.58; y += 4) {
      const r = fit(x, y);
      if (r > R + 0.5) { R = r; cx = x; cy = y; }
    }
  }
  R = Math.max(40, R);
  const radii = rn.map((k) => R * k);
  const stars = {};
  for (const s of sectors) {
    const w = width.get(s.id);
    for (const id of s.ids) {
      const d = depth[id];
      const t = (slot[id] + 0.5) / w;
      const bearing = s.a0 + t * (s.a1 - s.a0);
      const [x, y] = polar(cx, cy, radii[d], bearing);
      stars[id] = { id, x, y, r: radii[d], bearing, depth: d, branch: s.id };
    }
  }
  return { W, H, cx, cy, R, radii, maxDepth, sectors, stars, depth };
}

/**
 * A transfer orbit from one star to another: radius and bearing interpolated together (the bearing
 * eased, so the beam leaves its parent heading inward and arrives in its child the same way), the short
 * way round, trimmed clear of both stars. Returns points in host px.
 */
export function transferPoints(cx, cy, from, to, trim = 0) {
  let da = to.bearing - from.bearing;
  while (da > 180) da -= 360;
  while (da < -180) da += 360;
  const arc = Math.abs(da) * (Math.PI / 180) * ((from.r + to.r) / 2);
  const n = Math.max(2, Math.min(64, Math.ceil(arc / 7) + 2));
  const ease = (t) => t * t * (3 - 2 * t);
  const raw = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    raw.push(polar(cx, cy, from.r + (to.r - from.r) * t, from.bearing + da * ease(t)));
  }
  const clear = (p, s) => Math.hypot(p[0] - s.x, p[1] - s.y) >= trim;
  let a = 0;
  while (a < raw.length - 1 && !clear(raw[a], from)) a += 1;
  let b = raw.length - 1;
  while (b > a && !clear(raw[b], to)) b -= 1;
  const pts = raw.slice(a, b + 1);
  // land the ends on the trim circle exactly, so every beam stops the same distance from its star
  const land = (p, q, s) => {
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const lo = 0;
    let hi = 1;
    let t = lo;
    for (let k = 0; k < 18; k += 1) {
      const m = (t + hi) / 2;
      if (Math.hypot(p[0] + dx * m - s.x, p[1] + dy * m - s.y) >= trim) hi = m; else t = m;
    }
    return [p[0] + dx * hi, p[1] + dy * hi];
  };
  if (a > 0 && pts.length) pts.unshift(land(raw[a - 1], raw[a], from));
  if (b < raw.length - 1 && pts.length) pts.push(land(raw[b + 1], raw[b], to));
  return pts;
}

/* ---- the label solver ---------------------------------------------------------------------------- */

const DIRS = [
  { k: 'e', x: 1, y: 0 }, { k: 'se', x: 0.72, y: 0.72 }, { k: 's', x: 0, y: 1 }, { k: 'sw', x: -0.72, y: 0.72 },
  { k: 'w', x: -1, y: 0 }, { k: 'nw', x: -0.72, y: -0.72 }, { k: 'n', x: 0, y: -1 }, { k: 'ne', x: 0.72, y: -0.72 },
];

function rectFor(star, dir, box, gap) {
  const ax = star.x + dir.x * gap;
  const ay = star.y + dir.y * gap;
  let x;
  let y;
  if (dir.x > 0.3) x = ax; else if (dir.x < -0.3) x = ax - box.w; else x = ax - box.w / 2;
  if (dir.y > 0.3) y = ay; else if (dir.y < -0.3) y = ay - box.h; else y = star.y - box.nameH / 2;
  return { x, y, w: box.w, h: box.h };
}
const hit = (a, b, m = 0) => a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;
function discHits(rect, d) {
  const nx = Math.max(rect.x, Math.min(d.x, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(d.y, rect.y + rect.h));
  return (nx - d.x) ** 2 + (ny - d.y) ** 2 < d.r * d.r;
}
function segHits(rect, s) {
  const { x1, y1, x2, y2 } = s;
  const inside = (x, y) => x > rect.x && x < rect.x + rect.w && y > rect.y && y < rect.y + rect.h;
  if (inside(x1, y1) || inside(x2, y2)) return true;
  const cross = (ax, ay, bx, by, cx, cy, dx, dy) => {
    const den = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
    if (Math.abs(den) < 1e-9) return false;
    const u = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / den;
    const v = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / den;
    return u >= 0 && u <= 1 && v >= 0 && v <= 1;
  };
  const { x, y, w, h } = rect;
  return cross(x1, y1, x2, y2, x, y, x + w, y) || cross(x1, y1, x2, y2, x + w, y, x + w, y + h)
    || cross(x1, y1, x2, y2, x, y + h, x + w, y + h) || cross(x1, y1, x2, y2, x, y, x, y + h);
}

/** How many places round its star a label could take before any other label is placed. */
function freePlaces(it, { discs = [], rects = [], points = [], bounds }) {
  let n = 0;
  const inBounds = (r) => !bounds || (r.x >= bounds.x && r.y >= bounds.y && r.x + r.w <= bounds.x + bounds.w && r.y + r.h <= bounds.y + bounds.h);
  for (const box of it.boxes) {
    for (const dir of DIRS) {
      const rect = rectFor(it.star, dir, box, it.gap);
      if (!inBounds(rect)) continue;
      if (discs.some((d) => d.id !== it.id && discHits(rect, d))) continue;
      if (rects.some((q) => hit(rect, q, 1))) continue;
      if (points.some((p) => p.x > rect.x - 2 && p.x < rect.x + rect.w + 2 && p.y > rect.y - 2 && p.y < rect.y + rect.h + 2)) continue;
      n += 1;
    }
  }
  return n;
}

/**
 * Place every label it can. items: [{ id, star, boxes:[{w,h,nameH,lines}], gap }] in priority order.
 * Returns id -> { rect, dir, box, dropped } (a dropped label still carries a peek place).
 */
export function solveLabels(items, { discs = [], segs = [], rects = [], points = [], bounds }) {
  const placed = [];
  const out = {};
  const inBounds = (r) => !bounds || (r.x >= bounds.x && r.y >= bounds.y && r.x + r.w <= bounds.x + bounds.w && r.y + r.h <= bounds.y + bounds.h);
  const pointHit = (r) => points.some((p) => p.x > r.x - 2 && p.x < r.x + r.w + 2 && p.y > r.y - 2 && p.y < r.y + r.h + 2);
  for (const it of items) {
    const s = it.star;
    const ox = s.ox || 0;
    const oy = s.oy || 0;
    const len = Math.hypot(ox, oy) || 1;
    const dirs = DIRS.map((d) => ({ ...d, rank: 1 - (d.x * ox + d.y * oy) / len })).sort((a, b) => a.rank - b.rank);
    let best = null;
    let peek = null;
    it.boxes.forEach((box, bi) => {
      for (const [gi, gap] of [it.gap, it.gap + 9].entries()) for (const dir of dirs) {
        const rect = rectFor(s, dir, box, gap);
        if (!inBounds(rect)) continue;
        if (discs.some((d) => d.id !== it.id && discHits(rect, d))) continue;
        if (rects.some((q) => hit(rect, q, 1))) continue;
        if (pointHit(rect)) continue;
        const crossings = segs.reduce((n, sg) => n + (segHits(rect, sg) ? 1 : 0), 0);
        const score = crossings * 12 + dir.rank * 2 + bi * 3 + gi * 2.5;
        if (!peek || score < peek.score) peek = { rect, dir, box, score };
        if (placed.some((p) => hit(rect, p, 8))) continue;
        if (!best || score < best.score) best = { rect, dir, box, score };
      }
    });
    if (best) { placed.push(best.rect); out[it.id] = { ...best, dropped: false }; }
    else if (peek) out[it.id] = { ...peek, dropped: true };
    else out[it.id] = null;
  }
  return out;
}

/* ---- the instrument ------------------------------------------------------------------------------ */

/**
 * @param {HTMLElement} host
 * @param {{ onPick?: (id: string, how: string) => void, measure?: (text: string, px: number, face: string) => number,
 *   wrap?: (text: string, maxW: number, px: number) => string[] }} [opts]
 */
export function createConstellation(host, { onPick = null, measure = null, wrap = null, avoid = null } = {}) {
  const doc = host && host.ownerDocument ? host.ownerDocument : globalThis.document;
  const inert = { el: host, set() {}, choose() {}, focusChosen() {}, sweepInto() {}, relayout() {}, arrive() {}, button: () => null, dispose() {} };
  if (!host || !doc || typeof doc.createElementNS !== 'function' || typeof host.getBoundingClientRect !== 'function') return inert;
  injectOrrery(doc);
  injectStyle(doc);
  host.classList.add('con-sky', 'is-off');
  const layer = svg('svg', { class: 'orr-svg con-sky__svg', 'aria-hidden': 'true', focusable: 'false' });
  const starLayer = doc.createElement('div');
  starLayer.className = 'con-sky__stars';
  starLayer.setAttribute('role', 'group');
  starLayer.setAttribute('aria-label', 'Research constellation');
  host.append(layer, starLayer);
  starLayer.addEventListener('keydown', (event) => {
    const from = event.target && event.target.closest ? event.target.closest('.con-star-btn') : null;
    if (!from) return;
    const next = starInDirection([...buttons.values()], from, event.key);
    if (!next) return;
    event.preventDefault();
    try { next.focus(); } catch (_) { /* focus is a nicety */ }
  });

  let data = null;
  let geo = null;
  let chosen = null;
  let buttons = new Map();
  let starNodes = new Map();
  let beamNodes = [];
  let sectorFills = new Map();
  let coreFill = null;
  let reticle = null;
  let handArm = null;
  let handBloom = null;
  let handTip = null;
  let drawnKey = '';
  let frame = 0;
  let ro = null;
  let reach = 0;
  let bearing = 0;
  let arriveTimer = 0;
  let pendingArrive = false;
  const paintHand = () => {
    if (!geo || !handArm) return;
    const { cx, cy } = geo;
    const r0 = 11;
    const r1 = Math.max(r0 + 4, reach);
    const d = `M ${f(cx)} ${f(cy - r0)} L ${f(cx)} ${f(cy - r1)}`;
    handArm.setAttribute('d', d);
    handBloom.setAttribute('d', d);
    handTip.setAttribute('d', `M ${f(cx - 4.5)} ${f(cy - r1 + 6)} L ${f(cx)} ${f(cy - r1 - 0.5)} L ${f(cx + 4.5)} ${f(cy - r1 + 6)}`);
    const g = handArm.parentNode;
    if (g) g.setAttribute('transform', `rotate(${f(bearing)} ${f(cx)} ${f(cy)})`);
  };
  const angle = createSpring({ value: 0, preset: 'swing', onUpdate: (v) => { bearing = v; paintHand(); } });
  const length = createSpring({ value: 0, preset: 'settle', onUpdate: (v) => { reach = v; paintHand(); } });

  const schedule = () => {
    if (frame) return;
    const raf = globalThis.requestAnimationFrame;
    if (typeof raf === 'function') frame = raf(() => { frame = 0; layout(); });
    else layout();
  };
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => schedule()); ro.observe(host); }

  const measureText = (text, px, face) => {
    if (typeof measure === 'function') {
      const w = measure(text, px, face);
      if (Number.isFinite(w) && w > 0) return w;
    }
    return String(text).length * px * (face === 'label' ? 0.72 : 0.55);
  };
  const wrapText = (text, maxW, px) => {
    if (typeof wrap === 'function') {
      const lines = wrap(text, maxW, px);
      if (Array.isArray(lines) && lines.length) return lines;
    }
    return [String(text)];
  };

  function standDown() {
    host.classList.add('is-off');
    layer.textContent = '';
    starLayer.textContent = '';
    buttons = new Map();
    starNodes = new Map();
    beamNodes = [];
    geo = null;
  }

  function stateOf(id) { return (data && data.states && data.states[id]) || 'locked'; }
  function beamState(from, to) {
    const a = stateOf(from) === 'researched';
    const b = stateOf(to) === 'researched';
    if (a && b) return 'lit';
    if (a) return 'open';
    return 'dark';
  }
  function ancestors(id) {
    const out = new Set();
    const byId = new Map((data ? data.nodes : []).map((n) => [n.id, n]));
    const stack = [id];
    while (stack.length) {
      const n = byId.get(stack.pop());
      for (const p of (n && n.prereqs) || []) if (!out.has(p) && byId.has(p)) { out.add(p); stack.push(p); }
    }
    return out;
  }

  function layout() {
    const W = host.clientWidth || 0;
    const H = host.clientHeight || 0;
    if (!data || !data.nodes || !data.nodes.length || W < 360 || H < 300) { standDown(); return; }
    // type scale: the dial sets it, never under the 12px floor
    const probeR = Math.min((H - 120) / 2, (W - 280) / 2);
    const px = Math.max(12, Math.min(18, Math.round(probeR / 33)));
    const costPx = px >= 13 ? 10.5 + (px - 13) * 0.5 : 10;
    const nameLH = Math.round(px * 1.2);
    const costLH = Math.round(costPx * 1.25);
    const widest = Math.max(...data.nodes.map((n) => measureText(n.name, px, 'read')));
    const labelOut = Math.min(200, Math.max(110, widest + 26));
    const key = `${W}x${H}|${px}|${data.nodes.map((n) => n.id + ':' + stateOf(n.id) + ':' + (data.costs && data.costs[n.id] || '')).join(',')}`;
    if (key === drawnKey) return;
    drawnKey = key;
    const hostBox = host.getBoundingClientRect();
    const avoidRects = [];
    if (typeof avoid === 'function') {
      for (const r of avoid() || []) {
        if (r && r.width > 0 && r.height > 0) avoidRects.push({ x: r.left - hostBox.left - 12, y: r.top - hostBox.top - 10, w: r.width + 24, h: r.height + 20 });
      }
    }
    geo = layoutConstellation(data.nodes, data.branches, { width: W, height: H, labelOut, avoid: avoidRects });
    if (geo) geo.avoid = avoidRects;
    if (!geo) { standDown(); return; }
    host.classList.remove('is-off');
    host.style.setProperty('--con-px', `${px}px`);
    host.style.setProperty('--con-lh', `${nameLH}px`);
    host.style.setProperty('--con-cost-px', `${costPx}px`);
    host.style.setProperty('--con-rim-px', `${Math.max(9.5, Math.min(12, geo.R / 36)).toFixed(1)}px`);
    host.style.setProperty('--con-tier-px', `${Math.max(9.5, Math.min(12, geo.R / 38)).toFixed(1)}px`);
    host.style.setProperty('--con-cx', `${f(geo.cx)}px`);
    host.style.setProperty('--con-cy', `${f(geo.cy)}px`);
    host.style.setProperty('--con-pool', `${f(geo.R * 2 + 360)}px`);
    const showCost = geo.R >= 290;
    build({ px, costPx, nameLH, costLH, showCost });
  }

  function build({ px, costPx, nameLH, costLH, showCost }) {
    const { cx, cy, R, radii, sectors, stars } = geo;
    const sr = Math.max(4, Math.min(8, R / 64));
    host.style.setProperty('--con-focus', `${Math.round(sr * 2 + 16)}px`);
    layer.textContent = '';
    layer.setAttribute('viewBox', `0 0 ${geo.W} ${geo.H}`);
    const defs = svg('defs');
    const glow = svg('radialGradient', { id: 'con-glow' });
    glow.append(
      svg('stop', { offset: '0', 'stop-color': `rgb(${WARM})`, 'stop-opacity': '.85' }),
      svg('stop', { offset: '.28', 'stop-color': `rgb(${WARM})`, 'stop-opacity': '.34' }),
      svg('stop', { offset: '1', 'stop-color': `rgb(${WARM})`, 'stop-opacity': '0' }),
    );
    defs.appendChild(glow);
    layer.appendChild(defs);
    const motion = !reducedMotion();
    const delayed = (node, ms) => { node.style.setProperty('--con-d', `${Math.round(ms)}ms`); return node; };

    // ---- the dial --------------------------------------------------------------------------------
    const dial = svg('g', { class: 'con-dial' });
    const rimR = R + 12;
    const nameR = R + 22;
    // the orbits: each broken at the top where its tier numeral stands
    radii.forEach((r, d) => {
      const gapDeg = Math.min(20, (13 / r) * (180 / Math.PI));
      dial.appendChild(delayed(svg('path', { d: arcD(cx, cy, r, gapDeg, 360 - gapDeg), class: `con-orbit${d === 0 ? ' is-outer' : ''}`, pathLength: 1 }), 60 + d * 55));
      const t = svg('text', { class: 'con-tier', x: f(cx), y: f(cy - r) });
      t.textContent = ROMAN[d] || String(d + 1);
      dial.appendChild(t);
    });
    // the tier spoke: a dotted scale down the top gap from the rim to the core
    dial.appendChild(svg('path', { d: `M ${f(cx)} ${f(cy - R - 6)} L ${f(cx)} ${f(cy - radii[radii.length - 1] + 12)}`, class: 'con-spoke' }));
    // the rim scale, turning slowly
    const drift = svg('g', { class: motion ? 'con-rimdrift' : '', style: `transform-origin:${f(cx)}px ${f(cy)}px` });
    drift.appendChild(svg('path', { d: ticksD(cx, cy, rimR + 3, 180, { len: 2.5, major: 15, majorLen: 5, inward: false }), class: 'con-rim' }));
    dial.appendChild(drift);
    // the core: the whole tree's progress as an arc round the Hand's pivot, and its scale
    const coreR = Math.max(18, radii[radii.length - 1] * 0.46);
    dial.appendChild(svg('circle', { cx: f(cx), cy: f(cy), r: f(coreR), class: 'con-core__track' }));
    dial.appendChild(svg('path', { d: ticksD(cx, cy, coreR - 3, 36, { len: 2.5, major: 9, majorLen: 5 }), class: 'con-core__ticks' }));
    coreFill = svg('path', { d: arcD(cx, cy, coreR, 0, 359.99), class: 'con-core__fill', pathLength: 1, 'stroke-dasharray': '0 1' });
    dial.appendChild(coreFill);
    layer.appendChild(dial);

    // ---- the branch sectors on the rim: a gauge of what is researched, the name engraved beside ----
    const rimWords = svg('g', { class: 'con-rimwords' });
    sectorFills = new Map();
    const rimPoints = [];
    const rimPx = Math.max(9.5, Math.min(12, R / 36));
    for (const s of sectors) {
      dial.appendChild(delayed(svg('path', { d: arcD(cx, cy, rimR, s.a0, s.a1), class: 'con-sector__track', pathLength: 1 }), 120));
      const bloom = svg('path', { d: arcD(cx, cy, rimR, s.a0, s.a1), class: 'con-sector__bloom', pathLength: 1, 'stroke-dasharray': '0 1' });
      const fill = svg('path', { d: arcD(cx, cy, rimR, s.a0, s.a1), class: 'con-sector__fill', pathLength: 1, 'stroke-dasharray': '0 1' });
      dial.append(bloom, fill);
      sectorFills.set(s.id, { fill, bloom, ids: s.ids });
      for (const a of [s.a0, s.a1]) {
        const [x0, y0] = polar(cx, cy, rimR - 5, a);
        const [x1, y1] = polar(cx, cy, rimR + 8, a);
        dial.appendChild(svg('path', { d: `M ${f(x0)} ${f(y0)} L ${f(x1)} ${f(y1)}`, class: 'con-rim con-rim--major' }));
      }
      // the name runs clockwise from the sector's leading edge on the top half, and reads upright
      // (counter-clockwise from the trailing edge) on the lower half
      const word = String(s.label).toUpperCase();
      const count = `${s.ids.filter((id) => stateOf(id) === 'researched').length}/${s.ids.length}`;
      const textLen = (word.length + count.length + 2) * rimPx * 0.98;
      const spanDeg = (textLen / nameR) * (180 / Math.PI);
      const roots = s.ids.filter((id) => stars[id] && stars[id].depth === 0).map((id) => stars[id].bearing);
      const clearOf = (lo) => Math.min(99, ...roots.map((b) => (b < lo ? lo - b : b > lo + spanDeg ? b - lo - spanDeg : 0)));
      let lo = s.a0 + 1.5;
      for (let t = s.a0 + 1.5; t <= s.a1 - 1.5 - spanDeg; t += 0.5) if (clearOf(t) > clearOf(lo) + 0.25) lo = t;
      const mid = lo + spanDeg / 2;
      const lower = mid > 95 && mid < 265;
      const start = lower ? lo + spanDeg : lo;
      const pid = `con-rim-${s.id}-${Math.round(R)}`;
      const r = lower ? nameR + rimPx * 0.72 : nameR;
      const [x0, y0] = polar(cx, cy, r, start);
      const endDeg = lower ? start - 179 : start + 179;
      const [x1, y1] = polar(cx, cy, r, endDeg);
      rimWords.appendChild(svg('path', { id: pid, d: `M ${f(x0)} ${f(y0)} A ${f(r)} ${f(r)} 0 0 ${lower ? 0 : 1} ${f(x1)} ${f(y1)}`, fill: 'none', stroke: 'none' }));
      const text = svg('text', { class: 'con-sector__name' });
      const tp = svg('textPath', { href: `#${pid}` });
      tp.appendChild(doc.createTextNode(`${word}  `));
      const c = svg('tspan', { class: 'con-sector__count' });
      c.textContent = count;
      tp.appendChild(c);
      text.appendChild(tp);
      rimWords.appendChild(text);
      sectorFills.get(s.id).count = c;
      // the words' footprint, for the label solver
      for (let k = 0; k <= Math.ceil(textLen / 5); k += 1) {
        const deg = lower ? start - (k * 5 / nameR) * (180 / Math.PI) : start + (k * 5 / nameR) * (180 / Math.PI);
        for (const rr of [nameR - rimPx * 0.2, nameR + rimPx * 0.9]) {
          const [px0, py0] = polar(cx, cy, rr, deg);
          rimPoints.push({ x: px0, y: py0 });
        }
      }
    }
    layer.appendChild(rimWords);

    // ---- beams: each prerequisite a transfer orbit, spiralling in from the parent's orbit to the
    // child's, so a link follows the dial instead of cutting a chord across it ------------------------
    const beams = svg('g', { class: 'con-beams' });
    beamNodes = [];
    const segs = [];
    for (const n of data.nodes) {
      const to = stars[n.id];
      if (!to) continue;
      for (const p of n.prereqs || []) {
        const from = stars[p];
        if (!from) continue;
        const pts = transferPoints(cx, cy, from, to, sr + 3.5);
        if (pts.length < 2) continue;
        const d = 'M ' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L ');
        let len = 0;
        for (let i = 1; i < pts.length; i += 1) {
          len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
          segs.push({ x1: pts[i - 1][0], y1: pts[i - 1][1], x2: pts[i][0], y2: pts[i][1] });
        }
        const g = svg('g', { class: 'con-beam', 'data-from': p, 'data-to': n.id });
        const bloom = svg('path', { d, class: 'con-beam__bloom' });
        const core = delayed(svg('path', { d, class: 'con-beam__core', pathLength: 1 }), 420 + to.depth * 70);
        const sweep = svg('path', { d, class: 'con-beam__sweep', pathLength: 1 });
        g.append(bloom, core, sweep);
        beams.appendChild(g);
        beamNodes.push({ g, from: p, to: n.id, d, depth: to.depth, len });
      }
    }
    layer.appendChild(beams);

    // ---- stars -----------------------------------------------------------------------------------------
    const starG = svg('g', { class: 'con-stars' });
    starNodes = new Map();
    for (const n of data.nodes) {
      const s = stars[n.id];
      if (!s) continue;
      const g = delayed(svg('g', { class: 'con-star', 'data-node': n.id, transform: `translate(${f(s.x)} ${f(s.y)})` }), 200 + s.depth * 60);
      g.append(
        svg('circle', { r: f(sr * 3.2), class: 'con-star__halo', fill: 'url(#con-glow)' }),
        svg('path', { d: `M ${f(-sr * 2.5)} 0 L ${f(sr * 2.5)} 0 M 0 ${f(-sr * 2.5)} L 0 ${f(sr * 2.5)}`, class: 'con-star__glint' }),
        svg('circle', { r: f(sr), class: 'con-star__ring' }),
        svg('circle', { r: f(sr * 0.62), class: 'con-star__core' }),
      );
      starG.appendChild(g);
      starNodes.set(n.id, g);
    }
    layer.appendChild(starG);

    // ---- the chosen star's reticle and the Hand ------------------------------------------------------------
    reticle = svg('g', { class: 'con-reticle' });
    const rg = svg('g');
    const r0 = sr + 5;
    const r1 = sr + 10;
    const tick = [];
    for (const a of [45, 135, 225, 315]) {
      const [x0, y0] = polar(0, 0, r0, a);
      const [x1, y1] = polar(0, 0, r1, a);
      tick.push(`M ${f(x0)} ${f(y0)} L ${f(x1)} ${f(y1)}`);
    }
    rg.append(svg('circle', { r: f(r1 + 1.5) }), svg('path', { d: tick.join(' ') }));
    reticle.appendChild(rg);
    layer.appendChild(reticle);
    const hand = svg('g', { class: 'con-hand' });
    handBloom = svg('path', { class: 'con-hand__bloom', d: 'M 0 0' });
    handArm = svg('path', { class: 'con-hand__arm', d: 'M 0 0' });
    handTip = svg('path', { class: 'con-hand__tip', d: 'M 0 0' });
    hand.append(handBloom, handArm, handTip);
    layer.appendChild(hand);
    layer.append(
      svg('circle', { cx: f(cx), cy: f(cy), r: 8.5, class: 'con-hand__hubring' }),
      svg('circle', { cx: f(cx), cy: f(cy), r: 4.6, class: 'con-hand__hub' }),
      svg('circle', { cx: f(cx), cy: f(cy), r: 1.6, class: 'con-hand__pin' }),
    );

    // ---- labels: solve, then build the star buttons ----------------------------------------------------------
    const tierRects = radii.map((r) => ({ x: cx - 12, y: cy - r - 9, w: 24, h: 18 }));
    const discs = [];
    for (const [id, s] of Object.entries(stars)) discs.push({ id, x: s.x, y: s.y, r: sr + 6 });
    discs.push({ id: '__core', x: cx, y: cy, r: coreR + 8 });
    const chosenId = chosen;
    const neighbours = new Set();
    if (chosenId) {
      for (const n of data.nodes) {
        if (n.id === chosenId) for (const p of n.prereqs || []) neighbours.add(p);
        if ((n.prereqs || []).includes(chosenId)) neighbours.add(n.id);
      }
    }
    const rankOf = (id) => {
      if (id === chosenId) return 0;
      const st = stateOf(id);
      if (st === 'available') return 1;
      if (st === 'researched') return 1;
      if (neighbours.has(id)) return 3;
      return 4;
    };
    const items = data.nodes.filter((n) => stars[n.id]).map((n) => {
      const s = stars[n.id];
      // a price is carried by what you can research now; the dark stars are names (the reading has any price)
      const cost = showCost && stateOf(n.id) === 'available' ? String((data.costs && data.costs[n.id]) || '') : '';
      const costW = cost ? measureText(cost, costPx, 'label') * 1.06 : 0;
      const one = measureText(n.name, px, 'read');
      const boxes = [];
      const mk = (lines) => {
        const w = Math.ceil(Math.max(costW, ...lines.map((l) => measureText(l, px, 'read')))) + 2;
        return { w, h: lines.length * nameLH + (cost ? costLH + 2 : 0), nameH: nameLH, lines, cost };
      };
      boxes.push(mk([n.name]));
      const two = wrapText(n.name, Math.max(56, one * 0.62), px);
      if (two.length === 2) boxes.push(mk(two));
      return { id: n.id, star: { x: s.x, y: s.y, ox: s.x - cx, oy: s.y - cy }, boxes, gap: sr + 6, rank: rankOf(n.id), depth: s.depth };
    });
    const bounds = { x: 2, y: 2, w: geo.W - 4, h: geo.H - 4 };
    // within a rank, the label with the fewest free places goes first
    const statics = { discs, rects: [...tierRects, ...(geo.avoid || [])], points: rimPoints, bounds };
    for (const it of items) it.room = freePlaces(it, statics);
    items.sort((a, b) => (a.rank - b.rank) || (a.room - b.room) || (a.depth - b.depth));
    const solved = solveLabels(items, { discs, segs, rects: statics.rects, points: rimPoints, bounds });

    starLayer.textContent = '';
    buttons = new Map();
    const labelDelayBase = 520;
    for (const n of data.nodes) {
      const s = stars[n.id];
      if (!s) continue;
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'con-star-btn';
      b.dataset.node = n.id;
      b.tabIndex = -1;
      b.style.left = `${f(s.x)}px`;
      b.style.top = `${f(s.y)}px`;
      const sol = solved[n.id];
      if (sol) {
        const label = doc.createElement('span');
        label.className = `con-label con-label-in is-${sol.dir.k}${sol.dropped ? ' is-dropped' : ''}`;
        label.setAttribute('aria-hidden', 'true');
        label.style.left = `${f(sol.rect.x - s.x + 15)}px`;
        label.style.top = `${f(sol.rect.y - s.y + 15)}px`;
        label.style.width = `${Math.ceil(sol.rect.w)}px`;
        delayed(label, labelDelayBase + s.depth * 50);
        for (const line of sol.box.lines) {
          const nameEl = doc.createElement('span');
          nameEl.className = 'con-label__name';
          nameEl.textContent = line;
          label.appendChild(nameEl);
        }
        if (sol.box.cost) {
          const c = doc.createElement('span');
          c.className = 'con-label__cost';
          c.textContent = sol.box.cost;
          label.appendChild(c);
        }
        b.appendChild(label);
      }
      b.addEventListener('click', () => { if (typeof onPick === 'function') onPick(n.id, 'click'); });
      b.addEventListener('focus', () => {
        if (chosen !== n.id && typeof onPick === 'function') onPick(n.id, 'focus');
        markHot(n.id, true);
      });
      b.addEventListener('blur', () => markHot(n.id, false));
      b.addEventListener('pointerenter', () => markHot(n.id, true));
      b.addEventListener('pointerleave', () => { if (doc.activeElement !== b) markHot(n.id, false); });
      starLayer.appendChild(b);
      buttons.set(n.id, b);
    }
    paint({ instant: true });
    if (pendingArrive && motion) runArrival();
    pendingArrive = false;
  }

  function markHot(id, on) {
    const g = starNodes.get(id);
    if (g) g.classList.toggle('is-hot', !!on);
  }

  function paint({ instant = false } = {}) {
    if (!geo || !data) return;
    const researched = (id) => stateOf(id) === 'researched';
    for (const [id, g] of starNodes) {
      const st = stateOf(id);
      if (g.getAttribute('data-state') !== st) g.setAttribute('data-state', st);
      const ready = st === 'available' && !!(data.ready && data.ready[id]);
      g.classList.toggle('is-ready', ready);
      const b = buttons.get(id);
      if (b) {
        b.dataset.state = st;
        b.classList.toggle('is-ready', ready);
        b.classList.toggle('is-chosen', id === chosen);
        if (id === chosen) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
        const name = (data.nodes.find((n) => n.id === id) || {}).name || id;
        const word = st === 'researched' ? 'researched' : st === 'available' ? (ready ? 'ready to research' : 'open') : 'locked';
        const cost = st === 'researched' ? '' : String((data.costs && data.costs[id]) || '');
        b.setAttribute('aria-label', `${name}, ${word}${cost ? ', ' + cost : ''}`);
      }
    }
    // roving tab stop: the chosen star
    let stop = chosen && buttons.get(chosen);
    if (!stop) stop = buttons.values().next().value;
    for (const b of buttons.values()) b.tabIndex = b === stop ? 0 : -1;
    const path = chosen ? ancestors(chosen) : new Set();
    if (chosen) path.add(chosen);
    for (const bm of beamNodes) {
      const st = beamState(bm.from, bm.to);
      if (bm.g.getAttribute('data-state') !== st) bm.g.setAttribute('data-state', st);
      bm.g.classList.toggle('is-path', path.has(bm.from) && path.has(bm.to));
      setPulse(bm, st === 'open' && stateOf(bm.to) === 'available');
    }
    for (const [, s] of sectorFills) {
      const k = s.ids.length ? s.ids.filter(researched).length / s.ids.length : 0;
      s.fill.setAttribute('stroke-dasharray', `${f(k)} 1`);
      s.bloom.setAttribute('stroke-dasharray', `${f(k)} 1`);
      if (s.count) s.count.textContent = `${s.ids.filter(researched).length}/${s.ids.length}`;
    }
    if (coreFill) {
      const all = data.nodes.length || 1;
      const k = data.nodes.filter((n) => researched(n.id)).length / all;
      coreFill.setAttribute('stroke-dasharray', `${f(k)} 1`);
    }
    aim({ instant });
  }

  function setPulse(bm, on) {
    const has = bm.pulse && bm.pulse.parentNode;
    if (!on || reducedMotion()) { if (has) { bm.pulse.remove(); bm.pulse = null; } return; }
    if (has) return;
    const g = svg('g');
    const dur = Math.max(1.6, Math.min(3.6, bm.len / 70));
    const begin = `${(Math.random() * dur).toFixed(2)}s`;
    for (const [cls, r] of [['con-pulse-bloom', 5.5], ['con-pulse', 2.1]]) {
      const c = svg('circle', { r, class: cls });
      const m = svg('animateMotion', { dur: `${dur.toFixed(2)}s`, repeatCount: 'indefinite', path: bm.d, begin, calcMode: 'spline', keyTimes: '0;1', keySplines: '.45 0 .55 1' });
      c.appendChild(m);
      g.appendChild(c);
    }
    bm.g.appendChild(g);
    bm.pulse = g;
  }

  function aim({ instant = false } = {}) {
    if (!geo) return;
    const s = chosen && geo.stars[chosen];
    if (!s) { if (reticle) reticle.setAttribute('opacity', '0'); length.set(0, { instant: true }); return; }
    reticle.removeAttribute('opacity');
    reticle.setAttribute('transform', `translate(${f(s.x)} ${f(s.y)})`);
    const sr = Math.max(4, Math.min(8, geo.R / 64));
    // take the short way round
    let target = s.bearing;
    while (target - bearing > 180) target -= 360;
    while (target - bearing < -180) target += 360;
    angle.set(target, { instant });
    length.set(Math.max(20, s.r - sr - 15), { instant });
    paintHand();
    clearArm();
  }

  /** Labels the Hand's arm passes under step back, so the one amber line never reads through words. */
  function clearArm() {
    if (!geo) return;
    const s = chosen && geo.stars[chosen];
    const sr = Math.max(4, Math.min(8, geo.R / 64));
    const arm = s ? (() => {
      const [x1, y1] = polar(geo.cx, geo.cy, 11, s.bearing);
      const [x2, y2] = polar(geo.cx, geo.cy, Math.max(20, s.r - sr - 15), s.bearing);
      return { x1, y1, x2, y2 };
    })() : null;
    for (const [id, b] of buttons) {
      const label = b.firstElementChild;
      if (!label) continue;
      let under = false;
      if (arm && id !== chosen && !label.classList.contains('is-dropped')) {
        const x = parseFloat(label.style.left) + geo.stars[id].x - 15;
        const y = parseFloat(label.style.top) + geo.stars[id].y - 15;
        under = segHits({ x: x - 3, y: y - 2, w: label.offsetWidth + 6 || parseFloat(label.style.width) + 6, h: (label.offsetHeight || 30) + 4 }, arm);
      }
      label.classList.toggle('is-under-hand', under);
    }
  }

  function snapReticle() {
    if (!reticle || reducedMotion()) return;
    reticle.classList.remove('is-snap');
    void reticle.getBoundingClientRect();
    reticle.classList.add('is-snap');
  }

  /** Light runs down every beam into `ids` (a research), or down the chosen path (a choice). */
  function sweep(beamsToRun) {
    if (reducedMotion() || !beamsToRun.length) return;
    const minDepth = Math.min(...beamsToRun.map((b) => b.depth));
    for (const bm of beamsToRun) {
      bm.g.classList.remove('is-sweep');
      bm.g.style.setProperty('--con-d', `${(bm.depth - minDepth) * 140}ms`);
    }
    void layer.getBoundingClientRect();
    for (const bm of beamsToRun) bm.g.classList.add('is-sweep');
  }

  function runArrival() {
    host.classList.add('is-arriving');
    clearTimeout(arriveTimer);
    arriveTimer = setTimeout(() => host.classList.remove('is-arriving'), 1500);
    // the Hand swings in from the top after the dial has drawn
    const target = chosen && geo && geo.stars[chosen];
    if (target) {
      angle.set(0, { instant: true });
      length.set(18, { instant: true });
      setTimeout(() => aim(), 420);
    }
  }

  return {
    el: host,
    set(next) {
      data = next || null;
      if (data && data.chosen !== undefined) chosen = data.chosen;
      if (!geo) { layout(); return; }
      // a label's words change with its state (a researched star drops its cost): lay out again
      layout();
      paint();
    },
    choose(id, { instant = false, sweepPath = true } = {}) {
      const prev = chosen;
      chosen = id || null;
      paint({ instant });
      if (!instant && prev !== chosen) {
        snapReticle();
        if (sweepPath && chosen) {
          const path = ancestors(chosen);
          path.add(chosen);
          sweep(beamNodes.filter((b) => path.has(b.from) && path.has(b.to)));
        }
      }
    },
    /** A research landed: light sweeps into each newly researched star and the star flares. */
    sweepInto(ids) {
      const set = new Set(ids || []);
      if (!set.size) return;
      sweep(beamNodes.filter((b) => set.has(b.to)));
      if (reducedMotion()) return;
      for (const id of set) {
        const g = starNodes.get(id);
        if (!g) continue;
        g.classList.remove('is-flare');
        void layer.getBoundingClientRect();
        g.classList.add('is-flare');
      }
    },
    /** The arrival choreography on the next layout (or now, if laid out). */
    arrive() {
      if (reducedMotion()) return;
      if (geo) runArrival(); else pendingArrive = true;
    },
    focusChosen() {
      const b = chosen && buttons.get(chosen);
      if (b) { try { b.focus({ preventScroll: true }); } catch (_) { /* focus is a nicety */ } }
    },
    button: (id) => buttons.get(id) || null,
    relayout() { drawnKey = ''; schedule(); },
    dispose() {
      angle.stop();
      length.stop();
      clearTimeout(arriveTimer);
      if (ro) { try { ro.disconnect(); } catch (_) { /* gone */ } }
      if (frame && typeof globalThis.cancelAnimationFrame === 'function') globalThis.cancelAnimationFrame(frame);
    },
  };
}

/**
 * Arrow keys across the constellation: the nearest star in the pressed direction (the same ranking the
 * pad's spatial focus uses: travel along the axis, a penalty for drifting across it).
 */
export function starInDirection(buttons, from, key) {
  const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[key];
  if (!dir || !from || typeof from.getBoundingClientRect !== 'function') return null;
  const o = from.getBoundingClientRect();
  const ox = o.left + o.width / 2;
  const oy = o.top + o.height / 2;
  let best = null;
  let bestScore = Infinity;
  for (const b of buttons) {
    if (b === from) continue;
    const r = b.getBoundingClientRect();
    const dx = r.left + r.width / 2 - ox;
    const dy = r.top + r.height / 2 - oy;
    const along = dx * dir[0] + dy * dir[1];
    if (along <= 2) continue;
    const across = Math.abs(dx * dir[1] - dy * dir[0]);
    const score = along + across * 2.2;
    if (score < bestScore) { bestScore = score; best = b; }
  }
  return best;
}
