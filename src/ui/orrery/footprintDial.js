// src/ui/orrery/footprintDial.js — THE HEAT DIAL, Footprint's instrument (design/frontend/ORRERY.md §6 Meta,
// design/frontend/OVERHAUL_PLAN_2026-09-25.md Footprint row).
//
// Two rings round one reading.
//   THE BEZEL (outer) is your heat, the one number the heat system owns (src/systems/heat.js is its single
//   writer; this file only reads it). A band of light cut by its scale, the tier stops T0..T5 riding inside
//   it and the WANTED threshold cut in red. The lit segments run from the clear point to your heat, brighter
//   toward the head; while you are outside the search zone the heat system counts down to the next level
//   drop, and the head recedes toward that stop by exactly the fraction of the clock already run
//   (heatZone.outsideS / clearAfterS), the part already cooled left behind in ice. The dial reads that clock
//   whenever the screen refreshes; the sim is paused while Footprint is open, so in the game the reading
//   holds where flight left it.
//   THE SOURCE RING (inner) is the record that keeps the law after you, one sector per source: the bounty on
//   your hull and every provenance chain, each with its token (the power's crest, the bounty's seal) inside
//   the ring. It is NOT heat — nothing in state prices heat per source. Open sources share the ring by the
//   weights the screen gives them (its share of the receipts on the record: footprint.js footprintSources);
//   a settled chain keeps a fixed sliver, cold. With nothing open the rest of the ring is a cold, complete
//   arc engraved with the clean record.
//   THE HAND is the one amber thing on the dial: an arm from the hub's rim to the traced source's token and a
//   shoe that hugs its sector. Drag round the dial, arrow round the sector keys, or move a pad over them,
//   and the Hand sweeps sector to sector; the screen unfolds that source's chain beside the dial and a link
//   of light runs from the traced sector out of the dial's three-o'clock gate to it.
//   A VERB PREVIEW marks what the verb would settle (those sectors go dark, hollow, an ice edge round them),
//   what it moves (the hub's bounty line) and, for a verb that is a place, a bearing out to its name.
//
// No layout (node tests) or no SVG: it stands down (INERT) and the screen's own words carry the facts.

import { svg, polar, arcD, circularText } from './svg.js';
import { createSpring, reducedMotion } from './motion.js';
import { injectOrrery } from './tokens.js';
import { rollTo } from './text.js';
import { heatLevelFor, heatClearSecondsForLevel, heatRadiusForLevel, wantedTierInfo, THRESHOLD } from '../../systems/heat.js';

const STYLE_ID = 'orr-footprint-dial-style';
const BONE = '236 230 216';
const INK = 'rgb(248 244 234)';
const DARK = 'rgb(12 11 9)';

/** The heat scale: 0 (the clear point) at seven o'clock, 1 at five, clockwise over the top. */
export const HEAT_FROM = 210;
export const HEAT_SWEEP = 300;
const LEVELS = 5;
/** Scale divisions: a cut every 0.025 of heat; every eighth is a tier stop. */
const DIVS = 40;
/** The gate the link to the unfolded chain leaves the dial by (three o'clock). */
const GATE_DEG = 90;
/** A settled chain's sliver of the source ring, in degrees (less when many share the ring). */
const SLIVER = 16;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const clamp01 = (v) => clamp(Number.isFinite(v) ? v : 0, 0, 1);
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const f = (n) => Math.round(n * 100) / 100;

export function heatAngle(value) {
  return HEAT_FROM + HEAT_SWEEP * clamp01(value);
}

/** heat.js's heatValueForLevel (not exported): the value a level drop lands on. */
function levelValue(level) {
  if (level <= 0) return 0;
  return Math.max(THRESHOLD, Math.min(1, level / LEVELS));
}

/**
 * Read the heat system's state as the dial draws it. Pure and read-only.
 * `held` names why the clock is not running: 'inside' (inside the search zone, or no zone yet),
 * 'docked', 'impound' (the pound is a place, not a cone), or null when it is counting down.
 * `head` is the lit arc's end: the heat, less the fraction of this level's clock already run toward
 * the value the next drop lands on. `clearsIn` is the whole countdown to clean at this pace.
 */
export function heatReading(state) {
  const player = (state && state.player) || {};
  const heat = clamp01(num(player.heat));
  const level = heatLevelFor(heat);
  const tier = wantedTierInfo(heat);
  const zone = player.heatZone && typeof player.heatZone === 'object' ? player.heatZone : {};
  const radius = num(zone.radius) || heatRadiusForLevel(level);
  const clearAfter = num(zone.clearAfterS) || heatClearSecondsForLevel(level);
  const outsideS = Math.max(0, num(zone.outsideS));
  const entity = state && state.entities && typeof state.entities.get === 'function' ? state.entities.get(state.playerId) : null;
  const docked = !!((player.flags && player.flags.docked) || (entity && entity.flags && entity.flags.docked));
  let outside = false;
  if (zone.active && entity && entity.pos && zone.center) {
    const dx = num(entity.pos.x) - num(zone.center.x);
    const dz = num(entity.pos.z) - num(zone.center.z);
    outside = dx * dx + dz * dz > radius * radius;
  }
  let held = null;
  if (level > 0) {
    if (tier.id === 'impound') held = 'impound';
    else if (docked) held = 'docked';
    else if (!zone.active || !outside) held = 'inside';
  }
  const dropTo = level <= 1 ? 0 : levelValue(level - 1);
  const progress = level > 0 && !held && clearAfter > 0 ? clamp01(outsideS / clearAfter) : 0;
  const head = heat - progress * Math.max(0, heat - dropTo);
  let clearsIn = null;
  if (level > 0 && !held) {
    clearsIn = Math.max(0, clearAfter - outsideS);
    for (let l = level - 1; l >= 1; l -= 1) clearsIn += heatClearSecondsForLevel(l);
  }
  return {
    heat, level, tier: tier.id, tierLabel: tier.label, wanted: heat >= THRESHOLD,
    radius, outside, held, progress, head, dropTo, clearsIn,
  };
}

const CSS = `
.fp-dial { position:relative; width:100%; height:100%; min-width:0; min-height:0; isolation:isolate; touch-action:none; user-select:none; -webkit-user-select:none; }
.fp-dial.is-dragging { cursor:grabbing; }
.fp-dial__pool { position:absolute; border-radius:50%; pointer-events:none; z-index:-1;
  background:radial-gradient(closest-side, rgb(5 7 10 / .92), rgb(5 7 10 / .84) 60%, rgb(5 7 10 / .52) 84%, rgb(5 7 10 / 0)); }
.fp-dial__svg { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; pointer-events:none; }
.fp-dial__svg text { font-family:var(--dp-face-label, "Archivo"), sans-serif; font-stretch:112%; font-variation-settings:"wdth" 112, "wght" 650; font-weight:650;
  text-transform:uppercase; letter-spacing:.16em; dominant-baseline:central; }
/* THE BEZEL: a band with body (lum ~70 on the glass), its scale cut through it, the heat lit in warm white */
.fp-bezel { fill:none; stroke:rgb(${BONE} / .3); stroke-linecap:butt; }
.fp-bezel-rim { fill:none; stroke:rgb(${BONE} / .6); stroke-width:1.5; }
.fp-bezel-inner { fill:none; stroke:rgb(${BONE} / .34); stroke-width:1; }
.fp-seg { fill:none; stroke:rgb(250 246 236); stroke-linecap:butt; }
.fp-seg--cool { stroke:rgb(143 203 255 / .5); }
.fp-seg-bloom { fill:none; stroke:rgb(255 240 214 / .16); stroke-linecap:butt; }
.fp-cut { fill:none; stroke:rgb(5 7 10 / .86); stroke-width:1.5; stroke-linecap:butt; }
.fp-cut--major { stroke-width:2.5; }
.fp-stop { fill:none; stroke:rgb(${BONE} / .82); stroke-width:2; stroke-linecap:butt; }
.fp-cut--wanted { stroke:var(--dp-danger, #ff5038); stroke-width:2.5; }
.fp-tier text { font-size:calc(12px * var(--fp-ts, 1)); letter-spacing:.14em; fill:${INK}; }
.fp-tier.is-lit text { fill:${DARK}; }
.fp-tier.is-cool text { fill:rgb(8 14 22); }
.fp-needle { fill:none; stroke:rgb(255 255 255); stroke-width:3; stroke-linecap:round; }
.fp-needle-bloom { fill:none; stroke:rgb(255 244 222 / .32); stroke-width:11; stroke-linecap:round; }
.fp-dial.is-cold .fp-needle, .fp-dial.is-cold .fp-needle-bloom { display:none; }
.fp-engrave text { font-size:calc(12px * var(--fp-ts, 1)); letter-spacing:.26em; fill:rgb(${BONE} / .76); }
.fp-engrave--rule text { fill:rgb(${BONE} / .7); }
.fp-engrave--wanted text { fill:rgb(255 128 106); letter-spacing:.22em; }
.fp-engrave--rule.is-preview text { fill:rgb(196 226 255); letter-spacing:.2em; }
/* the hub's rim: an orrery's inner ring with its fine scale, the Hand pivots on it */
.fp-hubrim { fill:none; stroke:rgb(${BONE} / .5); stroke-width:1.5; }
.fp-hubrim-ticks { fill:none; stroke:rgb(${BONE} / .42); stroke-width:1.25; }
.fp-hubrim-band { fill:none; stroke:rgb(${BONE} / .1); }
/* THE SOURCE RING: one sector per source, lit while it holds the record open, cold once settled */
.fp-srcring { fill:none; stroke:rgb(${BONE} / .09); }
.fp-sector { transition:transform .32s var(--dp-ease-over, ease-out), opacity .24s linear; }
.fp-sector__band { fill:none; stroke:rgb(${BONE} / .245); stroke-linecap:butt; transition:stroke .2s linear; }
.fp-sector__edge { fill:none; stroke:rgb(${BONE} / .46); stroke-width:1.5; stroke-linecap:butt; }
.fp-sector.is-open .fp-sector__band { stroke:rgb(${BONE} / .6); }
.fp-sector.is-open .fp-sector__edge { stroke:rgb(252 249 240 / .92); stroke-width:2; }
.fp-sector.is-traced .fp-sector__band { stroke:rgb(248 244 234 / .95); }
.fp-sector.is-traced:not(.is-open) .fp-sector__band { stroke:rgb(${BONE} / .56); }
.fp-sector.is-traced .fp-sector__edge { stroke:rgb(255 255 255); stroke-width:2.5; }
.fp-sector__bloom { fill:none; stroke:rgb(255 240 214 / 0); stroke-linecap:butt; transition:stroke .2s linear; }
.fp-sector.is-traced .fp-sector__bloom { stroke:rgb(255 240 214 / .15); }
.fp-sector__label text { font-size:calc(12px * var(--fp-ts, 1)); letter-spacing:.16em; fill:rgb(${BONE} / .86); }
.fp-sector.is-open .fp-sector__label text, .fp-sector.is-traced .fp-sector__label text { fill:${DARK}; }
.fp-sector.is-hover:not(.is-traced) .fp-sector__band { stroke:rgb(${BONE} / .38); }
.fp-sector.is-open.is-hover:not(.is-traced) .fp-sector__band { stroke:rgb(${BONE} / .76); }
/* the cold rest of the ring when nothing is open: the clean record, engraved */
.fp-clear__band { fill:none; stroke:rgb(${BONE} / .245); stroke-linecap:butt; }
.fp-clear__edge { fill:none; stroke:rgb(${BONE} / .42); stroke-width:1.5; }
.fp-clear text { font-size:calc(12px * var(--fp-ts, 1)); letter-spacing:.3em; fill:rgb(${BONE} / .8); }
/* a verb preview: the sectors it would settle go dark and hollow, an ice edge round them (data in motion) */
.fp-sector.is-settles .fp-sector__band { stroke:rgb(5 7 10 / .6); }
.fp-sector.is-settles .fp-sector__edge { stroke:var(--dp-ice, #8fcbff); stroke-width:2; stroke-dasharray:7 5; animation:fp-settle-march 1.2s linear infinite; }
@keyframes fp-settle-march { to { stroke-dashoffset:-24; } }
.fp-sector.is-settles .fp-sector__label text { fill:rgb(196 226 255); }
.fp-sector.is-settles .fp-sector__bloom { stroke:rgb(143 203 255 / .14); }
/* the tokens: each source's produced mark inside the ring (a power's crest, the bounty's seal) */
.fp-token { position:absolute; left:0; top:0; width:var(--fp-tok, 30px); height:var(--fp-tok, 30px); margin:calc(var(--fp-tok, 30px) / -2) 0 0 calc(var(--fp-tok, 30px) / -2);
  pointer-events:none; opacity:.58; transition:opacity .2s linear, transform .3s var(--dp-ease-over, ease-out); filter:drop-shadow(0 0 3px rgb(0 0 0 / .9)); }
.fp-token.is-open { opacity:.84; }
.fp-token.is-traced { opacity:1; transform:scale(1.3); filter:drop-shadow(0 0 6px rgb(255 244 222 / .35)) drop-shadow(0 0 2px rgb(0 0 0 / .9)); }
.fp-token.is-settles { opacity:.36; filter:grayscale(1) brightness(.8) drop-shadow(0 0 5px rgb(143 203 255 / .6)); }
/* THE HAND: the only amber on the dial */
.fp-hand__arm { fill:none; stroke:var(--dp-hand, #f2b950); stroke-width:3; stroke-linecap:round; }
.fp-hand__armbloom { fill:none; stroke:rgb(242 185 80 / .26); stroke-width:11; stroke-linecap:round; }
.fp-hand__bead { fill:var(--dp-hand-hot, #ffd98c); }
.fp-hand__beadbloom { fill:rgb(242 185 80 / .3); }
.fp-hand__ring { fill:none; stroke:var(--dp-hand, #f2b950); stroke-width:2; }
.fp-hand__shoe { fill:none; stroke:var(--dp-hand, #f2b950); stroke-width:3; stroke-linecap:round; }
.fp-hand__shoebloom { fill:none; stroke:rgb(242 185 80 / .24); stroke-width:11; stroke-linecap:round; }
.fp-dial:is(:focus-within, .is-dragging) .fp-hand__arm, .fp-dial:is(:focus-within, .is-dragging) .fp-hand__shoe, .fp-dial:is(:focus-within, .is-dragging) .fp-hand__ring { stroke:var(--dp-hand-hot, #ffd98c); }
/* THE LINK: from the traced sector along the shoe's track, out of the gate, to the unfolded chain */
.fp-link__core { fill:none; stroke:rgb(${BONE} / .72); stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
.fp-link__bloom { fill:none; stroke:rgb(${BONE} / .12); stroke-width:8; stroke-linecap:round; stroke-linejoin:round; }
.fp-link__pulse { fill:none; stroke:var(--dp-ice, #8fcbff); stroke-width:3; stroke-linecap:round; stroke-dasharray:.06 .94; stroke-dashoffset:1;
  animation:fp-link-pulse 2.4s linear infinite; opacity:.95; }
@keyframes fp-link-pulse { to { stroke-dashoffset:0; } }
.fp-link__node { fill:rgb(252 249 240); }
/* a verb that is a place: a bearing out through the bezel to its name */
.fp-bearing__core { fill:none; stroke:var(--dp-ice, #8fcbff); stroke-width:2; stroke-linecap:round; }
.fp-bearing__bloom { fill:none; stroke:rgb(143 203 255 / .18); stroke-width:8; stroke-linecap:round; }
.fp-bearing__pip { fill:var(--dp-ice, #8fcbff); }
.fp-bearing text { font-size:calc(12px * var(--fp-ts, 1)); letter-spacing:.2em; fill:rgb(200 228 255); paint-order:stroke; stroke:rgb(5 7 10 / .9); stroke-width:5px; stroke-linejoin:round; dominant-baseline:auto; }
/* the hub: your heat as the thin numeral, its tier, the clock, the bounty; a preview line in ice */
.fp-hub { position:absolute; left:0; top:0; transform:translate(-50%, -50%); display:flex; flex-direction:column; align-items:center; text-align:center; pointer-events:none; z-index:1;
  width:var(--fp-hub-w, 260px); }
.fp-hub__k { margin:0 0 4px; font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-variation-settings:"wdth" 112, "wght" 650; font-weight:650; font-size:calc(12px * var(--fp-ts, 1));
  letter-spacing:.3em; text-transform:uppercase; color:rgb(${BONE} / .78); }
.fp-hub__n { margin:0; font-family:var(--dp-face-numeral, "Archivo"); font-stretch:100%; font-variation-settings:"wdth" 100, "wght" 250; font-weight:250;
  font-variant-numeric:tabular-nums lining-nums; letter-spacing:-.03em; line-height:.84; color:rgb(223 238 255); font-size:var(--fp-hub-n, 128px); }
.fp-hub__tier { margin:10px 0 0; font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-variation-settings:"wdth" 112, "wght" 700; font-weight:700; font-size:calc(13px * var(--fp-ts, 1));
  letter-spacing:.2em; text-transform:uppercase; color:${INK}; white-space:nowrap; }
.fp-hub__clears { margin:6px 0 0; display:flex; align-items:baseline; justify-content:center; gap:.45em; font-family:var(--dp-face-label, "Archivo"); font-stretch:112%;
  font-variation-settings:"wdth" 112, "wght" 600; font-weight:600; font-size:calc(12px * var(--fp-ts, 1)); letter-spacing:.18em; text-transform:uppercase; color:rgb(${BONE} / .82); white-space:nowrap; }
.fp-hub__clears-n { font-family:var(--dp-face-numeral, "Archivo"); font-variation-settings:"wdth" 100, "wght" 400; font-weight:400; font-size:calc(19px * var(--fp-ts, 1)); letter-spacing:0; color:rgb(223 238 255); }
.fp-hub__clears-n:empty, .fp-hub__clears-n:empty + .fp-hub__clears-u { display:none; }
.fp-hub__clears-u { font-size:calc(12px * var(--fp-ts, 1)); letter-spacing:.1em; color:rgb(223 238 255 / .86); margin-left:-.2em; }
.fp-hub__bounty { margin:8px 0 0; font-family:var(--dp-face-body, "Instrument Sans"), sans-serif; font-size:calc(13px * var(--fp-ts, 1)); letter-spacing:.01em; color:rgb(${BONE} / .86); white-space:nowrap; }
.fp-hub__bounty:empty { display:none; }
.fp-hub__bounty b { font-weight:600; color:${INK}; font-variant-numeric:tabular-nums; }
.fp-hub__bounty i { font-style:normal; font-weight:600; color:rgb(196 226 255); }
.fp-hub__preview { display:none; margin:8px 0 0; max-width:100%; font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-variation-settings:"wdth" 112, "wght" 650; font-weight:650;
  font-size:calc(12px * var(--fp-ts, 1)); letter-spacing:.12em; line-height:1.35; text-transform:uppercase; color:rgb(196 226 255); text-wrap:balance; }
.fp-hub__preview:empty { display:none; }
/* the sector keys: one real button per source, on the band (the band itself shows focus) */
.fp-key { position:absolute; left:0; top:0; width:var(--fp-key, 40px); height:var(--fp-key, 40px); margin:calc(var(--fp-key, 40px) / -2) 0 0 calc(var(--fp-key, 40px) / -2);
  padding:0; border:0; border-radius:50%; background:none; box-shadow:none; color:transparent; font-size:0; cursor:pointer; opacity:1; outline:none; z-index:2; }
.fp-key:focus-visible { outline:none; }
/* arrival: the bezel draws, the sectors swing in, the Hand swings to its source */
.fp-dial.is-arriving .fp-bezel, .fp-dial.is-arriving .fp-bezel-rim { stroke-dasharray:1 1; stroke-dashoffset:1; animation:fp-draw 620ms var(--dp-ease-out, ease-out) forwards; }
@keyframes fp-draw { to { stroke-dashoffset:0; } }
.fp-dial.is-arriving .fp-dial__sources { transform-box:view-box; transform-origin:50% 50%; animation:fp-spin-in 760ms var(--dp-ease-out, ease-out) 80ms both; }
@keyframes fp-spin-in { from { transform:rotate(-40deg); opacity:0; } to { transform:none; opacity:1; } }
.fp-dial.is-arriving .fp-hub, .fp-dial.is-arriving .fp-token { animation:fp-rise 520ms var(--dp-ease-out, ease-out) 200ms both; }
@keyframes fp-rise { from { opacity:0; filter:blur(4px); } }
html.sf-reduce-motion .fp-dial.is-arriving .fp-bezel, html.sf-reduce-motion .fp-dial.is-arriving .fp-bezel-rim { animation:none; stroke-dasharray:none; stroke-dashoffset:0; }
html.sf-reduce-motion .fp-dial.is-arriving .fp-dial__sources, html.sf-reduce-motion .fp-dial.is-arriving .fp-hub, html.sf-reduce-motion .fp-dial.is-arriving .fp-token { animation:none; }
html.sf-reduce-motion .fp-link__pulse { animation:none; display:none; }
html.sf-reduce-motion .fp-sector, html.sf-reduce-motion .fp-token { transition:none; }
html.sf-reduce-motion .fp-sector.is-settles .fp-sector__edge { animation:none; }
@media (forced-colors: active) { .fp-dial__svg, .fp-dial__pool, .fp-token { display:none; } }
`;

function injectStyle(doc) {
  if (!doc || !doc.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

/** Geometry for a dial in a w x h box: every ring's radius and width in CSS px. */
export function dialGeometry(w, h) {
  const S = Math.max(0, Math.min(w, h));
  const M = clamp(S * 0.062, 36, 52);
  const R = Math.max(40, S / 2 - M);
  const B = clamp(R * 0.064, 17, 26);
  const gap = clamp(R * 0.05, 12, 20);
  const SB = clamp(R * 0.074, 19, 30);
  const rB = R - B / 2;
  const rShoe = R - B - gap / 2;
  const rS = R - B - gap - SB / 2;
  const tok = Math.round(clamp(R * 0.088, 24, 46));
  const rTok = rS - SB / 2 - tok / 2 - clamp(R * 0.03, 7, 14);
  const hubR = clamp(R * 0.5, 96, 260);
  const arm0 = hubR + 4;
  const arm1 = rTok - tok * 0.62 - 3;
  const ts = clamp(R / 380, 1, 1.35);
  return { S, M, cx: w / 2, cy: h / 2, R, B, gap, SB, rB, rShoe, rS, tok, rTok, hubR, arm0, arm1, ts };
}

/** Shortest signed turn from a to b, degrees. */
function turn(a, b) {
  return ((b - a + 540) % 360 + 360) % 360 - 180;
}

/**
 * Where each source's sector sits, clockwise from twelve in the order given: open sources share the ring
 * by weight, a settled one keeps a fixed sliver. With nothing open, the rest of the ring is a cold arc
 * (returned as `clear`).
 */
export function sectorLayout(sources) {
  const list = Array.isArray(sources) ? sources : [];
  const settledCount = list.filter((s) => !s.open).length;
  const openList = list.filter((s) => s.open);
  const sliver = settledCount ? Math.min(SLIVER, (openList.length ? 150 : 220) / settledCount) : 0;
  const openSpan = openList.length ? 360 - sliver * settledCount : 0;
  const openTotal = openList.reduce((sum, s) => sum + Math.max(0.0001, num(s.weight, 1)), 0) || 1;
  let a = 0;
  const sectors = list.map((s) => {
    const span = s.open ? (openSpan * Math.max(0.0001, num(s.weight, 1))) / openTotal : sliver;
    const out = { id: s.id, open: !!s.open, from: a, to: a + span, mid: a + span / 2, span };
    a += span;
    return out;
  });
  const clear = openList.length ? null : { from: a, to: 360, span: 360 - a, mid: (a + 360) / 2 };
  return { sectors, clear };
}

const INERT = Object.freeze({
  hubTier: null, hubClears: null, setSources() {}, setTrace() {}, setReading() {}, setPreview() {}, setLink() {}, setBountyHtml() {},
  keys: () => [], keyFor: () => null, relayout() {}, arrive() {}, dispose() {}, geometry: null,
});

/**
 * @param {HTMLElement} host an empty box the dial fills (it stays square and centred in it)
 * @param {object} o
 * @param {(id:string, how:{focus?:boolean, drag?:boolean})=>void} [o.onTrace] a source was traced on the dial
 * @param {(id:string)=>void} [o.onEnter] Enter on a sector key (the screen moves into the chain)
 */
export function createHeatDial(host, { onTrace = null, onEnter = null } = {}) {
  const doc = host && host.ownerDocument;
  if (!doc || typeof doc.createElementNS !== 'function' || typeof host.getBoundingClientRect !== 'function') return INERT;
  injectOrrery(doc);
  injectStyle(doc);
  host.classList.add('fp-dial');

  const pool = doc.createElement('div');
  pool.className = 'fp-dial__pool';
  pool.setAttribute('aria-hidden', 'true');
  const layer = svg('svg', { class: 'orr-svg fp-dial__svg', 'aria-hidden': 'true', focusable: 'false' });
  const tokensHost = doc.createElement('div');
  tokensHost.className = 'fp-dial__tokens';
  tokensHost.setAttribute('aria-hidden', 'true');
  const hub = doc.createElement('div');
  hub.className = 'fp-hub';
  const hubK = doc.createElement('p'); hubK.className = 'fp-hub__k'; hubK.textContent = 'Heat';
  const hubN = doc.createElement('p'); hubN.className = 'fp-hub__n';
  const hubTier = doc.createElement('p'); hubTier.className = 'fp-hub__tier';
  const hubClears = doc.createElement('p'); hubClears.className = 'fp-hub__clears';
  const hubClearsW = doc.createElement('span'); hubClearsW.className = 'fp-hub__clears-w';
  const hubClearsN = doc.createElement('span'); hubClearsN.className = 'fp-hub__clears-n';
  const hubClearsU = doc.createElement('span'); hubClearsU.className = 'fp-hub__clears-u'; hubClearsU.textContent = 's';
  hubClears.append(hubClearsW, hubClearsN, hubClearsU);
  const hubBounty = doc.createElement('p'); hubBounty.className = 'fp-hub__bounty';
  const hubPreview = doc.createElement('p'); hubPreview.className = 'fp-hub__preview';
  hubPreview.setAttribute('aria-live', 'polite');
  hub.append(hubK, hubN, hubTier, hubClears, hubBounty, hubPreview);
  const keysHost = doc.createElement('div');
  keysHost.className = 'fp-dial__keys';
  keysHost.setAttribute('role', 'listbox');
  keysHost.setAttribute('aria-label', 'Sources on the heat dial');
  keysHost.setAttribute('aria-orientation', 'horizontal');
  host.append(pool, layer, tokensHost, hub, keysHost);

  let geo = null;
  let sources = [];
  let sectors = [];
  let clearArc = null;
  let tracedId = null;
  let reading = null;
  let preview = null;
  let link = null;
  let sectorEls = new Map();
  let keyEls = new Map();
  let tokenEls = new Map();
  let hand = null;
  let bezel = null;
  let linkG = null;
  let bearingG = null;
  let dragging = false;
  let dragAngle = 0;
  let numeralShown = null;
  let clearsShown = null;
  let engraving = { top: '', rule: '', clear: '' };
  const angle = createSpring({ value: -30, preset: 'swing', onUpdate: () => paintHand() });
  const span = createSpring({ value: 20, preset: 'swing', onUpdate: () => paintHand() });

  function box() {
    const r = host.getBoundingClientRect();
    return { w: Math.max(0, r.width), h: Math.max(0, r.height) };
  }

  function sectorOf(id) { return sectors.find((s) => s.id === id) || null; }

  function build() {
    const { w, h } = box();
    if (!(w > 40) || !(h > 40)) { geo = null; return; }
    geo = dialGeometry(w, h);
    const g = geo;
    layer.setAttribute('viewBox', `0 0 ${f(w)} ${f(h)}`);
    layer.textContent = '';
    const poolR = g.R + g.M * 0.95;
    Object.assign(pool.style, { left: `${f(g.cx - poolR)}px`, top: `${f(g.cy - poolR)}px`, width: `${f(poolR * 2)}px`, height: `${f(poolR * 2)}px` });
    hub.style.left = `${f(g.cx)}px`;
    hub.style.top = `${f(g.cy)}px`;
    host.style.setProperty('--fp-hub-n', `${Math.round(clamp(g.R * 0.38, 58, 156))}px`);
    host.style.setProperty('--fp-hub-w', `${Math.round(g.hubR * 1.56)}px`);
    host.style.setProperty('--fp-key', `${Math.round(g.SB + 18)}px`);
    host.style.setProperty('--fp-tok', `${g.tok}px`);
    // the dial's words grow with it past the 1920 size (never below the 12 px floor)
    host.style.setProperty('--fp-ts', String(f(g.ts)));

    // ---- the bezel ----
    const bz = svg('g', { class: 'fp-dial__bezel' });
    bz.appendChild(svg('path', { d: arcD(g.cx, g.cy, g.rB, HEAT_FROM, HEAT_FROM + HEAT_SWEEP), class: 'fp-bezel', 'stroke-width': f(g.B), pathLength: 1 }));
    // the lit segments (one per scale division) and their bloom, painted from the reading
    const segBloom = svg('g', {});
    const segs = svg('g', {});
    const segEls = [];
    for (let i = 0; i < DIVS; i += 1) {
      const bloom = svg('path', { class: 'fp-seg-bloom', 'stroke-width': f(g.B + 12), d: 'M 0 0' });
      const seg = svg('path', { class: 'fp-seg', 'stroke-width': f(g.B), d: 'M 0 0' });
      segBloom.appendChild(bloom);
      segs.appendChild(seg);
      segEls.push({ seg, bloom });
    }
    bz.append(segBloom, segs);
    bz.appendChild(svg('path', { d: arcD(g.cx, g.cy, g.R - 0.75, HEAT_FROM, HEAT_FROM + HEAT_SWEEP), class: 'fp-bezel-rim', pathLength: 1 }));
    bz.appendChild(svg('path', { d: arcD(g.cx, g.cy, g.R - g.B + 0.5, HEAT_FROM, HEAT_FROM + HEAT_SWEEP), class: 'fp-bezel-inner' }));
    // the scale cut through the band: every 0.025 a notch on the outer half, the tier stops across it
    const cuts = [];
    const majors = [];
    const tierAt = [THRESHOLD / 2, (THRESHOLD + 0.2) / 2];
    for (let l = 2; l <= LEVELS; l += 1) tierAt.push((l - 0.5) / LEVELS);
    for (let i = 0; i <= DIVS; i += 1) {
      const a = heatAngle(i / DIVS);
      const isStop = i % 8 === 0;
      if (!isStop && tierAt.some((v) => Math.abs(v - i / DIVS) < 0.6 / DIVS)) continue;
      const r0 = isStop ? g.R - g.B : g.R - g.B * 0.42;
      const [x0, y0] = polar(g.cx, g.cy, r0, a);
      const [x1, y1] = polar(g.cx, g.cy, g.R, a);
      (isStop ? majors : cuts).push(`M ${f(x0)} ${f(y0)} L ${f(x1)} ${f(y1)}`);
    }
    bz.appendChild(svg('path', { d: cuts.join(' '), class: 'fp-cut' }));
    bz.appendChild(svg('path', { d: majors.join(' '), class: 'fp-cut fp-cut--major' }));
    const stops = [];
    for (let l = 0; l <= LEVELS; l += 1) {
      const a = heatAngle(l / LEVELS);
      const [x0, y0] = polar(g.cx, g.cy, g.R + 2, a);
      const [x1, y1] = polar(g.cx, g.cy, g.R + 9, a);
      stops.push(`M ${f(x0)} ${f(y0)} L ${f(x1)} ${f(y1)}`);
    }
    bz.appendChild(svg('path', { d: stops.join(' '), class: 'fp-stop' }));
    // WANTED: the one threshold in red, cut through the band and standing proud of it
    const aw = heatAngle(THRESHOLD);
    const [wx0, wy0] = polar(g.cx, g.cy, g.R - g.B, aw);
    const [wx1, wy1] = polar(g.cx, g.cy, g.R + 11, aw);
    bz.appendChild(svg('path', { d: `M ${f(wx0)} ${f(wy0)} L ${f(wx1)} ${f(wy1)}`, class: 'fp-cut fp-cut--wanted' }));
    // the tier words ride inside the band, between their stops
    const tiers = [];
    const tierDefs = [{ w: 'T0', v: THRESHOLD / 2 }, { w: 'T1', v: (THRESHOLD + 0.2) / 2 }];
    for (let l = 2; l <= LEVELS; l += 1) tierDefs.push({ w: `T${l}`, v: (l - 0.5) / LEVELS });
    for (const t of tierDefs) {
      const a = heatAngle(t.v);
      const upright = a % 360 > 90 && a % 360 < 270;
      const node = circularText(g.cx, g.cy, g.rB, t.w, { startDeg: upright ? a + 90 : a - 90, anchor: 'middle', upright, size: 12, className: 'fp-tier' });
      node.setAttribute('data-v', String(t.v));
      bz.appendChild(node);
      tiers.push(node);
    }
    // the head: a needle across the band where the lit heat ends
    const needleBloom = svg('path', { class: 'fp-needle-bloom', d: 'M 0 0' });
    const needle = svg('path', { class: 'fp-needle', d: 'M 0 0' });
    bz.append(needleBloom, needle);
    // the engravings: what the dial reads along the top, the rule along the bottom gap, WANTED at its cut
    const engraveTop = svg('g', { class: 'fp-engrave' });
    const engraveRule = svg('g', { class: 'fp-engrave fp-engrave--rule' });
    const rEng = g.R + g.M * 0.56;
    bz.append(engraveTop, engraveRule);
    bz.appendChild(circularText(g.cx, g.cy, rEng, 'Wanted', { startDeg: aw + 90, anchor: 'middle', upright: true, size: 12, className: 'fp-engrave fp-engrave--wanted' }));
    layer.appendChild(bz);
    bezel = { segEls, tiers, needle, needleBloom, engraveTop, engraveRule, rEng };

    // ---- the hub's rim: an inner ring with its fine scale (the Hand pivots on it) ----
    const rim = svg('g', { class: 'fp-dial__hubrim' });
    rim.appendChild(svg('circle', { class: 'fp-hubrim-band', cx: f(g.cx), cy: f(g.cy), r: f(g.hubR + 5.5), 'stroke-width': 11 }));
    rim.appendChild(svg('circle', { class: 'fp-hubrim', cx: f(g.cx), cy: f(g.cy), r: f(g.hubR) }));
    const ticks = [];
    for (let i = 0; i < 120; i += 1) {
      const a = i * 3;
      const len = i % 10 === 0 ? 7 : 3.5;
      const [x0, y0] = polar(g.cx, g.cy, g.hubR + 2, a);
      const [x1, y1] = polar(g.cx, g.cy, g.hubR + 2 + len, a);
      ticks.push(`M ${f(x0)} ${f(y0)} L ${f(x1)} ${f(y1)}`);
    }
    rim.appendChild(svg('path', { class: 'fp-hubrim-ticks', d: ticks.join(' ') }));
    layer.appendChild(rim);

    // ---- the source ring ----
    const sg = svg('g', { class: 'fp-dial__sources' });
    sg.appendChild(svg('circle', { class: 'fp-srcring', cx: f(g.cx), cy: f(g.cy), r: f(g.rS), 'stroke-width': f(g.SB) }));
    layer.appendChild(sg);
    bezel.sourcesG = sg;

    // ---- the link and the bearing (under the Hand) ----
    linkG = svg('g', { class: 'fp-link' });
    bearingG = svg('g', { class: 'fp-bearing' });
    layer.append(linkG, bearingG);

    // ---- the Hand ----
    const hg = svg('g', { class: 'fp-dial__hand' });
    const shoeBloom = svg('path', { class: 'fp-hand__shoebloom', d: 'M 0 0' });
    const shoe = svg('path', { class: 'fp-hand__shoe', d: 'M 0 0' });
    const arm = svg('g', {});
    const armD = `M ${f(g.cx)} ${f(g.cy - g.arm0)} L ${f(g.cx)} ${f(g.cy - g.arm1)}`;
    arm.appendChild(svg('path', { class: 'fp-hand__armbloom', d: armD }));
    arm.appendChild(svg('path', { class: 'fp-hand__arm', d: armD }));
    arm.appendChild(svg('circle', { class: 'fp-hand__beadbloom', cx: f(g.cx), cy: f(g.cy - g.arm0), r: 8 }));
    arm.appendChild(svg('circle', { class: 'fp-hand__bead', cx: f(g.cx), cy: f(g.cy - g.arm0), r: 4.5 }));
    arm.appendChild(svg('circle', { class: 'fp-hand__ring', cx: f(g.cx), cy: f(g.cy - g.rTok), r: f(g.tok * 0.62 + 3) }));
    hg.append(shoeBloom, shoe, arm);
    layer.appendChild(hg);
    hand = { g: hg, shoe, shoeBloom, arm };

    buildSectors();
    paintReading();
    paintEngraving(engraving, true);
    paintHand();
    paintLink();
    paintPreview();
  }

  function buildSectors() {
    if (!geo || !bezel) return;
    const g = geo;
    for (const el of sectorEls.values()) el.remove();
    const oldClear = bezel.sourcesG.querySelector('.fp-clear');
    if (oldClear) oldClear.remove();
    sectorEls = new Map();
    const laid = sectorLayout(sources);
    sectors = laid.sectors;
    clearArc = laid.clear;
    const many = sectors.length + (clearArc ? 1 : 0) > 1;
    const gapDeg = many ? Math.max(1.4, (5 / g.rS) * 180 / Math.PI) : 0;
    const upright = (mid) => { const m = ((mid % 360) + 360) % 360; return m > 90 && m < 270; };
    const along = (r, mid, word, className) => circularText(g.cx, g.cy, r, word, { startDeg: upright(mid) ? mid + 90 : mid - 90, anchor: 'middle', upright: upright(mid), size: 12, className });
    const arcOf = (r, a0, a1) => (many ? arcD(g.cx, g.cy, r, a0, a1) : arcD(g.cx, g.cy, r, 0.001, 359.999));
    for (const sec of sectors) {
      const src = sources.find((s) => s.id === sec.id) || {};
      const a0 = sec.from + gapDeg / 2;
      const a1 = sec.to - gapDeg / 2;
      const sgEl = svg('g', { class: `fp-sector${src.open ? ' is-open' : ''}`, 'data-src': sec.id });
      const d = arcOf(g.rS, a0, a1);
      sgEl.appendChild(svg('path', { class: 'fp-sector__bloom', d, 'stroke-width': f(g.SB + 14) }));
      sgEl.appendChild(svg('path', { class: 'fp-sector__band', d, 'stroke-width': f(g.SB) }));
      sgEl.appendChild(svg('path', { class: 'fp-sector__edge', d: arcOf(g.rS + g.SB / 2 - 1, a0, a1) }));
      // the source's word rides inside its band when the band is long enough to hold it
      const word = String(src.label || '').toUpperCase();
      const arcLen = (g.rS * Math.PI * Math.max(0, a1 - a0)) / 180;
      if (word && arcLen >= word.length * 12 * g.ts * 0.86 + 14) sgEl.appendChild(along(g.rS, sec.mid, word, 'fp-sector__label'));
      bezel.sourcesG.appendChild(sgEl);
      sectorEls.set(sec.id, sgEl);
    }
    if (clearArc && clearArc.span > 1) {
      const cg = svg('g', { class: 'fp-clear' });
      const a0 = clearArc.from + (sectors.length ? gapDeg / 2 : 0);
      const a1 = clearArc.to - (sectors.length ? gapDeg / 2 : 0);
      cg.appendChild(svg('path', { class: 'fp-clear__band', d: arcOf(g.rS, a0, a1), 'stroke-width': f(g.SB) }));
      cg.appendChild(svg('path', { class: 'fp-clear__edge', d: arcOf(g.rS + g.SB / 2 - 1, a0, a1) }));
      const text = engraving.clear || 'Clean record';
      cg.appendChild(along(g.rS, sectors.length ? clearArc.mid : 180, String(text).toUpperCase(), ''));
      bezel.sourcesG.appendChild(cg);
    }
    buildTokens();
    buildKeys();
    paintTraced();
  }

  function buildTokens() {
    // a rebuild (a resize, new sources) keeps each token's image element, so nothing re-decodes or blinks
    const old = tokenEls;
    tokenEls = new Map();
    if (!geo) { tokensHost.textContent = ''; return; }
    const g = geo;
    for (const sec of sectors) {
      const src = sources.find((s) => s.id === sec.id) || {};
      const room = (g.rTok * Math.PI * sec.span) / 180;
      if (!src.token || room < g.tok + 6) continue;
      let img = old.get(sec.id);
      if (img && img.getAttribute('src') !== src.token) img = null;
      if (!img) {
        img = doc.createElement('img');
        img.alt = '';
        img.decoding = 'async';
        img.src = src.token;
        img.addEventListener('error', () => { img.hidden = true; });
      }
      old.delete(sec.id);
      img.className = `fp-token${src.open ? ' is-open' : ''}`;
      const [x, y] = polar(g.cx, g.cy, g.rTok, sec.mid);
      img.style.left = `${f(x)}px`;
      img.style.top = `${f(y)}px`;
      if (img.parentNode !== tokensHost) tokensHost.appendChild(img);
      tokenEls.set(sec.id, img);
    }
    for (const img of old.values()) img.remove();
  }

  function buildKeys() {
    const had = doc.activeElement && keysHost.contains(doc.activeElement) ? doc.activeElement.dataset.src : null;
    keysHost.textContent = '';
    keyEls = new Map();
    if (!geo) return;
    const g = geo;
    sources.forEach((src, index) => {
      const sec = sectorOf(src.id);
      if (!sec) return;
      const key = doc.createElement('button');
      key.type = 'button';
      key.className = 'fp-key';
      key.dataset.src = src.id;
      key.setAttribute('role', 'option');
      key.setAttribute('aria-selected', String(src.id === tracedId));
      key.setAttribute('aria-label', `Source ${index + 1} of ${sources.length}: ${src.name || src.label || src.id}${src.open ? ', open' : ', settled'}`);
      key.tabIndex = src.id === tracedId ? 0 : -1;
      const [x, y] = polar(g.cx, g.cy, g.rS, sec.mid);
      key.style.left = `${f(x)}px`;
      key.style.top = `${f(y)}px`;
      key.addEventListener('focus', () => {
        setHover(src.id, true);
        if (src.id !== tracedId && typeof onTrace === 'function') onTrace(src.id, { focus: true });
      });
      key.addEventListener('blur', () => setHover(src.id, false));
      key.addEventListener('keydown', (event) => onKey(event, src.id));
      keysHost.appendChild(key);
      keyEls.set(src.id, key);
    });
    if (had && keyEls.has(had)) { try { keyEls.get(had).focus({ preventScroll: true }); } catch (_) { /* focus is a courtesy */ } }
  }

  function onKey(event, id) {
    const index = sources.findIndex((s) => s.id === id);
    if (index < 0) return;
    let next = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % sources.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + sources.length) % sources.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = sources.length - 1;
    else if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
      event.preventDefault();
      if (typeof onEnter === 'function') onEnter(id);
      return;
    }
    if (next == null) return;
    event.preventDefault();
    event.stopPropagation();
    const target = sources[next];
    if (!target) return;
    const key = keyEls.get(target.id);
    if (key) { try { key.focus({ preventScroll: true }); } catch (_) { key.focus(); } }
    if (target.id !== tracedId && typeof onTrace === 'function') onTrace(target.id, { focus: true });
  }

  function setHover(id, on) {
    const el = sectorEls.get(id);
    if (el) el.classList.toggle('is-hover', !!on);
  }

  function paintTraced() {
    if (!geo) return;
    const lift = Math.max(5, geo.SB * 0.3);
    for (const [id, el] of sectorEls) {
      const traced = id === tracedId;
      el.classList.toggle('is-traced', traced);
      const sec = sectorOf(id);
      if (traced && sec && sectors.length > 1) {
        const a = (sec.mid - 90) * Math.PI / 180;
        el.style.transform = `translate(${f(Math.cos(a) * lift)}px, ${f(Math.sin(a) * lift)}px)`;
      } else {
        el.style.transform = '';
      }
    }
    for (const [id, img] of tokenEls) img.classList.toggle('is-traced', id === tracedId);
    for (const [id, key] of keyEls) {
      key.tabIndex = id === tracedId ? 0 : -1;
      key.setAttribute('aria-selected', String(id === tracedId));
    }
    host.classList.toggle('is-traced', !!tracedId);
  }

  function paintHand() {
    if (!hand || !geo) return;
    const g = geo;
    const empty = !tracedId || !sectors.length;
    hand.g.style.display = empty ? 'none' : '';
    if (empty) return;
    const a = dragging ? dragAngle : angle.value;
    hand.arm.setAttribute('transform', `rotate(${f(a)} ${f(g.cx)} ${f(g.cy)})`);
    const half = Math.max(3, Math.min(178, span.value / 2 - 1.2));
    const d = arcD(g.cx, g.cy, g.rShoe, a - half, a + half);
    hand.shoe.setAttribute('d', d);
    hand.shoeBloom.setAttribute('d', d);
  }

  function paintLink() {
    if (!linkG || !geo) return;
    linkG.textContent = '';
    const sec = tracedId ? sectorOf(tracedId) : null;
    if (!sec || !link) return;
    const g = geo;
    const r = g.rShoe;
    const from = sec.mid;
    const delta = turn(from, GATE_DEG);
    const [gx, gy] = polar(g.cx, g.cy, r, GATE_DEG);
    const exitX = g.cx + g.R + g.M * 0.35;
    const spineX = Math.max(exitX + 16, num(link.x, exitX + 40));
    // the gutter between the dial and the column: the link climbs there, clear of the column's words
    const gutterX = clamp(num(link.gutter, spineX - 30), exitX + 4, spineX - 12);
    const y0 = num(link.y0, gy);
    const y1 = Math.max(y0, num(link.y1, gy));
    const yJoin = clamp(gy, y0, y1);
    let d = Math.abs(delta) > 0.5 ? arcD(g.cx, g.cy, r, from, from + delta) : `M ${f(gx)} ${f(gy)}`;
    if (Math.abs(yJoin - gy) > 1) {
      const dir = yJoin > gy ? 1 : -1;
      const elbow = Math.min(12, Math.abs(yJoin - gy) / 2);
      d += ` L ${f(gutterX - elbow)} ${f(gy)} L ${f(gutterX)} ${f(gy + elbow * dir)} L ${f(gutterX)} ${f(yJoin - elbow * dir)} L ${f(gutterX + elbow)} ${f(yJoin)} L ${f(spineX)} ${f(yJoin)}`;
    } else {
      d += ` L ${f(spineX)} ${f(gy)}`;
    }
    linkG.appendChild(svg('path', { class: 'fp-link__bloom', d }));
    linkG.appendChild(svg('path', { class: 'fp-link__core', d }));
    linkG.appendChild(svg('path', { class: 'fp-link__pulse', d, pathLength: 1 }));
    linkG.appendChild(svg('circle', { class: 'fp-link__node', cx: f(spineX), cy: f(yJoin), r: 4 }));
  }

  function paintReading() {
    if (!bezel || !geo) return;
    const g = geo;
    const rd = reading || { heat: 0, head: 0, level: 0, held: null, clearsIn: null, wanted: false };
    const cold = !(rd.heat > 0.0005);
    host.classList.toggle('is-cold', cold);
    // lit segments from the clear point to the head, brighter toward it; ice from the head to the heat
    for (let i = 0; i < DIVS; i += 1) {
      const v0 = i / DIVS;
      const v1 = (i + 1) / DIVS;
      const { seg, bloom } = bezel.segEls[i];
      let d = 'M 0 0';
      let cls = 'fp-seg';
      let alpha = 0;
      if (rd.head > v0 + 0.0001) {
        d = arcD(g.cx, g.cy, g.rB, heatAngle(v0), heatAngle(Math.min(v1, rd.head)));
        const t = Math.min(1, ((v0 + Math.min(v1, rd.head)) / 2) / Math.max(0.05, rd.head));
        alpha = 0.52 + 0.46 * t * t;
      } else if (rd.heat > v0 + 0.0001) {
        const s0 = Math.max(v0, rd.head);
        d = arcD(g.cx, g.cy, g.rB, heatAngle(s0), heatAngle(Math.min(v1, rd.heat)));
        cls = 'fp-seg fp-seg--cool';
        alpha = 1;
      }
      seg.setAttribute('d', d);
      seg.setAttribute('class', cls);
      seg.style.strokeOpacity = cls === 'fp-seg' ? f(alpha) : '';
      bloom.setAttribute('d', cls === 'fp-seg' && alpha > 0.7 ? d : 'M 0 0');
    }
    const aHead = heatAngle(rd.head);
    const [nx0, ny0] = polar(g.cx, g.cy, g.R - g.B - 5, aHead);
    const [nx1, ny1] = polar(g.cx, g.cy, g.R + 5, aHead);
    const nd = cold ? 'M 0 0' : `M ${f(nx0)} ${f(ny0)} L ${f(nx1)} ${f(ny1)}`;
    bezel.needle.setAttribute('d', nd);
    bezel.needleBloom.setAttribute('d', nd);
    for (const t of bezel.tiers) {
      const v = Number(t.getAttribute('data-v'));
      t.classList.toggle('is-lit', v <= rd.head);
      t.classList.toggle('is-cool', v > rd.head && v <= rd.heat);
    }
    // the numeral rolls when the heat steps; the clock rolls with the countdown
    if (!reading) return;
    const n = Math.round(rd.heat * 100);
    if (n !== numeralShown) { numeralShown = n; rollTo(hubN, n); }
    const secs = rd.clearsIn == null ? null : Math.ceil(rd.clearsIn);
    if (secs !== clearsShown) {
      clearsShown = secs;
      if (secs == null) { hubClearsN.__orrCounter = null; hubClearsN.classList.remove('orr-counter'); hubClearsN.textContent = ''; } else rollTo(hubClearsN, secs);
    }
  }

  function paintEngraving(next, force = false) {
    const same = engraving.top === next.top && engraving.rule === next.rule && engraving.clear === next.clear;
    const clearMoved = engraving.clear !== next.clear;
    engraving = { ...next };
    if (!bezel || !geo || (same && !force)) return;
    const g = geo;
    bezel.engraveTop.textContent = '';
    if (next.top) bezel.engraveTop.appendChild(circularText(g.cx, g.cy, bezel.rEng, String(next.top).toUpperCase(), { startDeg: -90, anchor: 'middle', size: 12 }));
    paintRule(true);
    if (clearMoved && !force) buildSectors();
  }

  /** The rim's rule along the bottom: the heat's rule at rest, the previewed verb's effect in ice. */
  let ruleShown = null;
  function paintRule(force = false) {
    if (!bezel || !geo) return;
    const text = preview && preview.line ? preview.line : engraving.rule;
    const key = (preview && preview.line ? 'p:' : 'r:') + text;
    if (key === ruleShown && !force) return;
    ruleShown = key;
    const g = geo;
    bezel.engraveRule.textContent = '';
    bezel.engraveRule.classList.toggle('is-preview', !!(preview && preview.line));
    if (text) bezel.engraveRule.appendChild(circularText(g.cx, g.cy, bezel.rEng, String(text).toUpperCase(), { startDeg: 270, anchor: 'middle', upright: true, size: 12 }));
  }

  function paintPreview() {
    for (const [id, el] of sectorEls) el.classList.toggle('is-settles', !!(preview && preview.settles && preview.settles.includes(id)));
    for (const [id, img] of tokenEls) img.classList.toggle('is-settles', !!(preview && preview.settles && preview.settles.includes(id)));
    hubPreview.textContent = preview && preview.line ? preview.line : '';
    paintRule();
    if (!bearingG || !geo) return;
    bearingG.textContent = '';
    const sec = tracedId ? sectorOf(tracedId) : null;
    if (!preview || !preview.bearing || !sec) return;
    const g = geo;
    const a = sec.mid;
    const [x0, y0] = polar(g.cx, g.cy, g.rS + g.SB / 2 + 2, a);
    const [x1, y1] = polar(g.cx, g.cy, g.R + g.M * 0.8, a);
    const d = `M ${f(x0)} ${f(y0)} L ${f(x1)} ${f(y1)}`;
    bearingG.appendChild(svg('path', { class: 'fp-bearing__bloom', d }));
    bearingG.appendChild(svg('path', { class: 'fp-bearing__core', d }));
    bearingG.appendChild(svg('circle', { class: 'fp-bearing__pip', cx: f(x1), cy: f(y1), r: 4 }));
    const right = Math.sin(a * Math.PI / 180) >= 0;
    const t = svg('text', { x: f(x1 + (right ? 10 : -10)), y: f(y1 + 4), 'text-anchor': right ? 'start' : 'end' });
    t.textContent = String(preview.bearing).toUpperCase();
    bearingG.appendChild(t);
  }

  function angleAt(event) {
    if (!geo) return null;
    const r = host.getBoundingClientRect();
    const x = event.clientX - r.left - geo.cx;
    const y = event.clientY - r.top - geo.cy;
    const dist = Math.hypot(x, y);
    return { deg: ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360, dist };
  }

  function sourceAtAngle(deg) {
    for (const sec of sectors) if (deg >= sec.from && deg < sec.to) return sec.id;
    return null;
  }

  let dragId = null;
  function onDown(event) {
    if (event.button != null && event.button !== 0) return;
    const at = angleAt(event);
    if (!at || !geo || !sectors.length) return;
    if (at.dist < geo.hubR || at.dist > geo.R + geo.M) return;
    dragging = true;
    dragId = event.pointerId;
    host.classList.add('is-dragging');
    try { host.setPointerCapture(event.pointerId); } catch (_) { /* capture is a courtesy */ }
    dragAngle = angle.value + turn(angle.value, at.deg);
    traceAtAngle(at.deg);
    paintHand();
    event.preventDefault();
  }
  function traceAtAngle(deg) {
    const id = sourceAtAngle(deg);
    if (id && id !== tracedId && typeof onTrace === 'function') onTrace(id, { drag: true });
  }
  function onMove(event) {
    if (dragging && event.pointerId === dragId) {
      const at = angleAt(event);
      if (!at) return;
      dragAngle += turn(dragAngle, at.deg);
      traceAtAngle(at.deg);
      paintHand();
      return;
    }
    const at = angleAt(event);
    const inRing = at && geo && at.dist >= geo.hubR && at.dist <= geo.rS + geo.SB;
    const id = inRing ? sourceAtAngle(at.deg) : null;
    for (const [sid, el] of sectorEls) if (!(keyEls.get(sid) === doc.activeElement)) el.classList.toggle('is-hover', sid === id);
    host.style.cursor = id ? 'grab' : '';
  }
  function onUp(event) {
    if (!dragging || event.pointerId !== dragId) return;
    dragging = false;
    dragId = null;
    host.classList.remove('is-dragging');
    try { host.releasePointerCapture(event.pointerId); } catch (_) { /* released already */ }
    // the Hand leaves the pointer's angle and settles on the traced sector's middle, with its swing
    const sec = tracedId ? sectorOf(tracedId) : null;
    if (sec) {
      angle.set(dragAngle, { instant: true });
      angle.set(dragAngle + turn(dragAngle, sec.mid));
      span.set(sec.span);
    }
    const key = tracedId && keyEls.get(tracedId);
    if (key) { try { key.focus({ preventScroll: true }); } catch (_) { /* focus is a courtesy */ } }
  }
  function onLeave() {
    if (dragging) return;
    for (const [sid, el] of sectorEls) if (!(keyEls.get(sid) === doc.activeElement)) el.classList.remove('is-hover');
  }
  host.addEventListener('pointerdown', onDown);
  host.addEventListener('pointermove', onMove);
  host.addEventListener('pointerup', onUp);
  host.addEventListener('pointercancel', onUp);
  host.addEventListener('pointerleave', onLeave);

  let ro = null;
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(() => build());
    ro.observe(host);
  }

  function moveHandTo(id, { instant = false } = {}) {
    const sec = id ? sectorOf(id) : null;
    if (!sec) { paintHand(); return; }
    const target = angle.target + turn(angle.target, sec.mid);
    if (dragging) { span.set(sec.span, { instant: true }); return; }
    angle.set(target, { instant: instant || reducedMotion() });
    span.set(sec.span, { instant: instant || reducedMotion() });
  }

  build();

  return {
    hubTier,
    hubClears: hubClearsW,
    /** Replace the sources (the ring is rebuilt; the Hand keeps its angle and swings to the traced one). */
    setSources(list, { tracedId: id = tracedId } = {}) {
      sources = Array.isArray(list) ? list.slice() : [];
      tracedId = id && sources.some((s) => s.id === id) ? id : (sources[0] ? sources[0].id : null);
      buildSectors();
      moveHandTo(tracedId);
      paintLink();
      paintPreview();
    },
    setTrace(id, opts = {}) {
      if (!sources.some((s) => s.id === id)) return;
      tracedId = id;
      paintTraced();
      moveHandTo(id, opts);
      paintLink();
      paintPreview();
    },
    /** The heat as heatReading() returned it, and the words the rim carries for it. */
    setReading(next, { top = '', rule = '', clear = '' } = {}) {
      reading = next || null;
      paintReading();
      paintEngraving({ top: String(top || ''), rule: String(rule || ''), clear: String(clear || '') });
    },
    /** A verb preview: { settles: string[], line: string, bearing?: string } or null. */
    setPreview(next) {
      preview = next || null;
      paintPreview();
    },
    /** The hub's bounty line (HTML the screen escapes), or '' for none. */
    setBountyHtml(html) { hubBounty.innerHTML = html || ''; },
    /** Where the unfolded chain's spine stands, in this dial's own box: { x, y0, y1 } or null. */
    setLink(next) {
      link = next || null;
      paintLink();
    },
    keys: () => [...keyEls.values()],
    keyFor: (id) => keyEls.get(id) || null,
    relayout() { build(); },
    /** The arrival choreography (instant under reduced motion). */
    arrive() {
      if (reducedMotion()) return;
      host.classList.remove('is-arriving');
      void host.offsetWidth;
      host.classList.add('is-arriving');
      angle.set(angle.value - 40, { instant: true });
      moveHandTo(tracedId);
      setTimeout(() => host.classList.remove('is-arriving'), 1100);
    },
    get geometry() { return geo; },
    dispose() {
      angle.stop(); span.stop();
      if (ro) ro.disconnect();
      host.removeEventListener('pointerdown', onDown);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerup', onUp);
      host.removeEventListener('pointercancel', onUp);
      host.removeEventListener('pointerleave', onLeave);
    },
  };
}
