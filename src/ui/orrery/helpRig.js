// src/ui/orrery/helpRig.js — the Controls Rig (design/frontend/ORRERY.md §6 Meta, Help).
//
// The player's own hull, in its produced plan render, stands on a berth: a lit annulus you could
// grip, ticks cut through it, BOW and AFT riding inside the band. Round it hang the VERB STATIONS in
// two columns, each on a leader that runs flat to the berth and then straight into the part of the
// ship that verb drives -- throttle and brake at the drive, steer at the bow, the lateral thrusters
// at the flanks, fire at the hardpoint, the Massline at its winch. A station is the verb in label
// voice and its binding as a lit key glyph (the letter over a bar of light, never a chip).
//
// The signature is the live input echo ("Press anything"): the screen hands `flare()` the stations a
// key, mouse or pad button drives, and the rig answers -- the glyph flares, a pulse of light runs the
// leader into the ship, and the part lights (the drive blooms, a flank puffs, the bow swings a ghost
// of the hull through its arc). With a pad the glyphs become the pad's own, and a drawn pad
// instrument at the berth's foot lights the button pressed. Reduced motion: the same light, with no
// travelling pulse and no swing.
//
// The rig reads no input itself and dispatches nothing: `createInputEcho` (below) listens to raw
// DOM events and the pad's raw buttons while Help is open and reports them; Help is a modal, so the
// flight input layer is already neutralised under it (systems/input.js shouldNeutralizeFlightInput).

import { svg, polar, arcD, ticksD, circularText } from './svg.js';
import { reducedMotion, onFrame } from './motion.js';
import { injectOrrery } from './tokens.js';
import { stackEvenly } from './hullSchematic.js';
import { hullPosterUrl } from '../hullPosters.js';
import { loadHullPosterManifest } from '../ship/hullPoster.js';

const STYLE_ID = 'orr-help-rig-style';
let rigSeq = 0;
const RIM_ROOT = new URL('../../../assets/ui/generated/help/rim/', import.meta.url).href;
const RIM_HULLS = new Set(['ship_kestrel', 'ship_pelican', 'ship_wasp', 'ship_hornet']);
const BONE = '236 230 216';
const HOT = '248 244 234';
const ICE = '143 203 255';
const LABEL = 'font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-variation-settings:"wdth" 112, "wght" 650; font-weight:650; text-transform:uppercase;';
const f = (n) => Math.round(n * 100) / 100;

// Plan-render marks (normalised in the published 1024² top image, nose up) when the manifest is not
// loaded yet or a hull has no entry: the Kestrel's, the starter every new pilot flies.
const FALLBACK_MARKS = Object.freeze({
  SOCKET_Camera_Focus: [0.5, 0.4938], SOCKET_Cargo_Ventral: [0.5, 0.5179], SOCKET_Engine_Main: [0.5, 0.9097],
  SOCKET_Mining_Front: [0.5, 0.1257], SOCKET_RCS_Port: [0.3018, 0.4458], SOCKET_RCS_Starboard: [0.6982, 0.4458],
  SOCKET_Trail_Main: [0.5, 0.9157], SOCKET_Utility_Dorsal: [0.3859, 0.5374], SOCKET_Weapon_Front: [0.5, 0.1149],
});
// The plan render's visible hull spans 0.076..0.923 of the frame (ortho 1.18x the long axis).
const HULL_TOP = 0.076;
const HULL_SPAN = 0.847;

/**
 * Label tops for a column: each as near its wanted centre as the column allows, in order, never
 * closer than `gap`, inside [top, bottom]. (A forward pass clears overlaps, a backward pass holds the
 * foot, a last forward pass holds the head.)
 */
export function spreadNear(want, heights, top, bottom, gap) {
  const n = want.length;
  const y = want.map((c, i) => c - heights[i] / 2);
  const fwd = () => { for (let i = 0; i < n; i += 1) { const min = i ? y[i - 1] + heights[i - 1] + gap : top; if (y[i] < min) y[i] = min; } };
  fwd();
  for (let i = n - 1; i >= 0; i -= 1) { const max = i < n - 1 ? y[i + 1] - gap - heights[i] : bottom - heights[i]; if (y[i] > max) y[i] = max; }
  fwd();
  return y;
}

/** The ship parts a verb can drive, as [u, v] in the plan render (0..1 from its top-left). */
export function rigParts(marks) {
  const m = marks && typeof marks === 'object' ? marks : FALLBACK_MARKS;
  const get = (k) => (Array.isArray(m[k]) ? [Number(m[k][0]), Number(m[k][1])] : (FALLBACK_MARKS[k] || [0.5, 0.5]).slice());
  const rcsA = get('SOCKET_RCS_Port');
  const rcsB = get('SOCKET_RCS_Starboard');
  const [flankL, flankR] = rcsA[0] <= rcsB[0] ? [rcsA, rcsB] : [rcsB, rcsA];
  const weapon = get('SOCKET_Weapon_Front');
  const mining = get('SOCKET_Mining_Front');
  const nose = Math.min(weapon[1], mining[1]);
  const drive = get('SOCKET_Engine_Main');
  const trail = get('SOCKET_Trail_Main');
  return {
    bowL: [weapon[0] - 0.034, nose + 0.075],
    bowR: [weapon[0] + 0.034, nose + 0.075],
    bow: [weapon[0], nose - 0.012],
    hardpoint: weapon,
    mining: [mining[0], Math.max(mining[1], weapon[1] + 0.03)],
    flankL,
    flankR,
    helm: get('SOCKET_Camera_Focus'),
    winch: get('SOCKET_Utility_Dorsal'),
    belly: get('SOCKET_Cargo_Ventral'),
    drive: [drive[0], drive[1] - 0.012],
    bloom: [trail[0], Math.max(trail[1], drive[1] + 0.004)],
  };
}

const CSS = `
.orr-hrig { position:relative; width:100%; height:100%; min-height:260px; isolation:isolate; user-select:none; -webkit-user-select:none; }
.orr-hrig.is-off > :not(.orr-hrig__foot) { display:none; }
.orr-hrig__pool { position:absolute; pointer-events:none; border-radius:50%; z-index:0;
  background:radial-gradient(closest-side, rgb(5 7 10 / .84), rgb(5 7 10 / .66) 62%, rgb(5 7 10 / 0)); }
/* the pointer carries a soft inspection light across the berth (off under reduced motion) */
.orr-hrig__spot { position:absolute; inset:0; z-index:1; pointer-events:none; opacity:0; transition:opacity .3s linear;
  background:radial-gradient(circle 220px at var(--orr-spot-x, 50%) var(--orr-spot-y, 50%), rgb(${BONE} / .07), rgb(${BONE} / .025) 55%, rgb(${BONE} / 0)); }
.orr-hrig.is-spot .orr-hrig__spot { opacity:1; }
html.sf-reduce-motion .orr-hrig__spot { display:none; }
.orr-hrig__floor { position:absolute; pointer-events:none; border-radius:50%; z-index:1;
  background:radial-gradient(closest-side, rgb(${BONE} / .10), rgb(${BONE} / .035) 58%, rgb(${BONE} / 0)); }
.orr-hrig > svg { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; pointer-events:none; }
.orr-hrig__under { z-index:2; }
.orr-hrig__hull, .orr-hrig__ghost { position:absolute; pointer-events:none; z-index:3; display:block; object-fit:contain;
  transform-origin:50% 50%; }
.orr-hrig__hull { filter:drop-shadow(0 10px 18px rgb(0 0 0 / .7)); opacity:0; transition:opacity .5s var(--dp-ease-out, ease-out); }
.orr-hrig__hull.is-ready { opacity:1; }
.orr-hrig__ghost { opacity:0; visibility:hidden; z-index:4; transition:transform .52s cubic-bezier(.34, 1.36, .64, 1), opacity .2s linear, visibility 0s linear .52s; }
.orr-hrig__ghost.is-lit { opacity:1; visibility:visible; transition-delay:0s; }
.orr-hrig__glows { position:absolute; inset:0; pointer-events:none; z-index:4; }
.orr-hrig__over { z-index:5; }
.orr-hrig__glow { position:absolute; left:0; top:0; pointer-events:none; opacity:0; visibility:hidden; border-radius:50%;
  transition:opacity .16s linear, transform .42s cubic-bezier(.34, 1.36, .64, 1), visibility 0s linear .16s; }
.orr-hrig__glow.is-lit { opacity:1; visibility:visible; transition-delay:0s; }
.orr-hrig__glow--plume { background:radial-gradient(50% 50% at 50% 22%, rgb(255 255 255), rgb(236 247 255 / .9) 12%, rgb(${ICE} / .6) 30%, rgb(${ICE} / .2) 62%, rgb(${ICE} / 0));
  transform-origin:50% 0; transform:scaleY(.25); }
.orr-hrig__glow--plume.is-lit { transform:scaleY(1); }
.orr-hrig__glow--retro { background:radial-gradient(50% 50% at 50% 70%, rgb(255 252 244 / .92), rgb(${ICE} / .55) 30%, rgb(${ICE} / .14) 64%, rgb(${ICE} / 0));
  transform-origin:50% 100%; transform:scaleY(.25); }
.orr-hrig__glow--retro.is-lit { transform:scaleY(1); }
.orr-hrig__glow--puff { background:radial-gradient(50% 50% at var(--orr-puff-x, 20%) 50%, rgb(255 252 244 / .95), rgb(${ICE} / .55) 30%, rgb(${ICE} / .14) 64%, rgb(${ICE} / 0));
  transform:scaleX(.3); }
.orr-hrig__glow--puff.is-lit { transform:scaleX(1); }
.orr-hrig__glow--spot { background:radial-gradient(closest-side, rgb(255 252 244 / .9), rgb(${ICE} / .42) 36%, rgb(${ICE} / 0)); transform:scale(.4); }
.orr-hrig__glow--spot.is-lit { transform:scale(1); }

/* leaders: a bone core over a band, a halo under the stretch that crosses the ship */
.orr-hrig .orr-hrig__halo { fill:none; stroke:rgb(4 6 9 / .78); stroke-width:5px; stroke-linecap:round; stroke-linejoin:round; }
.orr-hrig .orr-hrig__lead-band { fill:none; stroke:rgb(${BONE} / .16); stroke-width:6px; stroke-linecap:round; stroke-linejoin:round; transition:stroke .16s linear; }
.orr-hrig .orr-hrig__lead { fill:none; stroke:rgb(${BONE} / .5); stroke-width:1.6px; stroke-linecap:round; stroke-linejoin:round; transition:stroke .16s linear, stroke-width .16s linear; }
.orr-hrig .orr-hrig__lead.is-hover { stroke:rgb(${BONE} / .8); }
.orr-hrig .orr-hrig__lead.is-lit { stroke:rgb(${HOT}); stroke-width:2.2px; }
.orr-hrig .orr-hrig__lead-band.is-lit { stroke:rgb(${ICE} / .34); }
.orr-hrig .orr-hrig__beam, .orr-hrig .orr-hrig__beam-bloom { fill:none; stroke-linecap:round; stroke-linejoin:round; opacity:0; stroke-dasharray:.2 1.4; stroke-dashoffset:.2; }
.orr-hrig .orr-hrig__beam { stroke:rgb(244 250 255); stroke-width:4px; }
.orr-hrig .orr-hrig__beam-bloom { stroke:rgb(${ICE} / .55); stroke-width:14px; stroke-dasharray:.26 1.4; stroke-dashoffset:.26; }
.orr-hrig .orr-hrig__beam.is-run, .orr-hrig .orr-hrig__beam-bloom.is-run { animation:orr-hrig-beam var(--orr-beam-ms, 900ms) cubic-bezier(.4, .1, .6, .9) forwards; }
@keyframes orr-hrig-beam { 0% { opacity:1; stroke-dashoffset:.2; } 90% { opacity:1; } 100% { opacity:0; stroke-dashoffset:-1.02; } }
.orr-hrig .orr-hrig__gate { fill:none; stroke:rgb(236 247 255 / .0); stroke-linecap:butt; transition:stroke .16s linear; }
.orr-hrig .orr-hrig__gate.is-lit { stroke:rgb(236 247 255 / .78); }
.orr-hrig .orr-hrig__mark-ring { fill:rgb(4 6 9 / .7); stroke:rgb(${BONE} / .78); stroke-width:1.6px; transition:stroke .16s linear, fill .16s linear; }
.orr-hrig .orr-hrig__mark-core { fill:rgb(${HOT} / .9); transition:fill .16s linear; }
.orr-hrig .orr-hrig__mark.is-lit .orr-hrig__mark-ring { stroke:rgb(${ICE}); fill:rgb(${ICE} / .28); }
.orr-hrig .orr-hrig__mark.is-lit .orr-hrig__mark-core { fill:rgb(255 255 255); }

/* the berth */
.orr-hrig .orr-hrig__band { fill:none; stroke:rgb(${BONE} / var(--orr-band-a, .3)); }
.orr-hrig .orr-hrig__edge { fill:none; stroke:rgb(${BONE} / .58); stroke-width:1.6px; }
.orr-hrig .orr-hrig__notch { fill:none; stroke:rgb(5 7 10 / .92); stroke-linecap:butt; }
.orr-hrig .orr-hrig__tick { fill:none; stroke:rgb(${BONE} / .5); stroke-width:1.5px; stroke-linecap:butt; }
.orr-hrig .orr-hrig__tick--major { stroke:rgb(${BONE} / .8); stroke-width:2px; }
.orr-hrig .orr-hrig__bandtext text { font-size:12px; font-weight:700; letter-spacing:.3em; fill:rgb(${HOT}); }
.orr-hrig .orr-hrig__fx { opacity:0; visibility:hidden; transition:opacity .16s linear, visibility 0s linear .16s; }
.orr-hrig .orr-hrig__fx.is-lit { opacity:1; visibility:visible; transition-delay:0s; }
.orr-hrig .orr-hrig__fx-line { fill:none; stroke:rgb(236 247 255); stroke-width:2.4px; stroke-linecap:round; }
.orr-hrig .orr-hrig__fx-bloom { fill:none; stroke:rgb(${ICE} / .34); stroke-width:10px; stroke-linecap:round; }
.orr-hrig .orr-hrig__fx-fill { fill:rgb(${ICE} / .16); stroke:none; }
.orr-hrig .orr-hrig__fx-dot { fill:rgb(236 247 255); }
.orr-hrig .orr-hrig__fx-ring { fill:none; stroke:rgb(236 247 255); stroke-width:2px; }
.orr-hrig .orr-hrig__fx.is-lit .orr-hrig__fx-draw { stroke-dasharray:1 1; animation:orr-draw 520ms var(--dp-ease-out, ease-out) both; }
.orr-hrig .orr-hrig__fx.is-lit .orr-hrig__chaff { animation:orr-hrig-chaff 900ms var(--dp-ease-out, ease-out) both; transform-box:fill-box; transform-origin:center; }
@keyframes orr-hrig-chaff { from { transform:translate(var(--cx0, 0), var(--cy0, 0)) scale(.4); opacity:0; } 30% { opacity:1; } to { transform:none; opacity:1; } }
.orr-hrig .orr-hrig__fx.is-lit .orr-hrig__pulse { animation:orr-hrig-pulse 900ms ease-out infinite; transform-box:fill-box; transform-origin:center; }
@keyframes orr-hrig-pulse { from { transform:scale(.5); opacity:1; } to { transform:scale(1.5); opacity:0; } }

/* a station: the key glyph (the letter over a bar of light) and the verb */
.orr-hrig__st { all:unset; box-sizing:border-box; position:absolute; left:0; top:0; z-index:6; display:flex; align-items:center; gap:12px; cursor:pointer;
  padding:4px 0; min-height:30px; -webkit-tap-highlight-color:transparent; }
.orr-hrig__st[data-side="L"] { flex-direction:row-reverse; text-align:right; }
.orr-hrig.is-small .orr-hrig__st { gap:8px; min-height:26px; padding:2px 0; }
.orr-hrig.is-small .orr-hrig__verb { letter-spacing:.08em; }
.orr-hrig.is-small .orr-hrig__key { font-size:16px; }
.orr-hrig.is-small .orr-hrig__key--word { font-size:12px; letter-spacing:.08em; }
.orr-hrig.is-small .orr-hrig__alt { font-size:12px; }
.orr-hrig.is-small .orr-hrig__glyph { padding-bottom:6px; gap:4px; }
.orr-hrig__verb { ${LABEL} font-size:clamp(12px, .62vw, 16px); letter-spacing:.14em; line-height:1.2; color:rgb(${BONE} / .8); transition:color .16s linear; white-space:nowrap; }
.orr-hrig__glyph { position:relative; display:inline-flex; align-items:baseline; gap:6px; flex:none; padding:0 2px 7px; min-width:22px; justify-content:center; }
.orr-hrig__glyph::before { content:""; position:absolute; left:-3px; right:-3px; bottom:-1px; height:9px; border-radius:5px; background:rgb(${HOT} / .13); transition:background .16s linear; }
.orr-hrig__glyph::after { content:""; position:absolute; left:0; right:0; bottom:2px; height:2.5px; border-radius:2px; background:rgb(${HOT} / .78); transition:background .16s linear, left .2s, right .2s; }
.orr-hrig__key { font-family:var(--dp-face-numeral, "Archivo"); font-stretch:100%; font-variation-settings:"wdth" 100, "wght" 560; font-weight:560; font-size:clamp(20px, 1.05vw, 27px); line-height:1;
  letter-spacing:.02em; color:rgb(${HOT}); white-space:nowrap; transition:color .16s linear, text-shadow .16s linear; }
.orr-hrig__key--word { font-size:clamp(13px, .68vw, 17px); ${LABEL} letter-spacing:.14em; }
.orr-hrig__alt { font-family:var(--dp-face-numeral, "Archivo"); font-size:clamp(14px, .73vw, 18px); font-weight:500; line-height:1; color:rgb(${BONE} / .72); white-space:nowrap; }
.orr-hrig__pad { display:none; }
.orr-hrig.is-pad .orr-hrig__kb { display:none; }
.orr-hrig.is-pad .orr-hrig__pad { display:inline-flex; }
.orr-hrig__glyph.is-none::after { background:rgb(${BONE} / .28); left:30%; right:30%; }
.orr-hrig__glyph.is-none::before { background:none; }
.orr-hrig__glyph.is-none .orr-hrig__key { color:rgb(${BONE} / .66); font-size:13px; ${LABEL} letter-spacing:.12em; }
.orr-hrig__st:hover .orr-hrig__verb, .orr-hrig__st:focus-visible .orr-hrig__verb { color:rgb(${HOT}); }
.orr-hrig__st:focus-visible { outline:none; }
.orr-hrig__st:focus-visible .orr-hrig__glyph::before { background:rgb(${HOT} / .26); }
.orr-hrig__st.is-lit .orr-hrig__verb { color:rgb(255 255 255); text-shadow:0 0 14px rgb(${ICE} / .55); }
.orr-hrig__st.is-lit .orr-hrig__key { color:rgb(255 255 255); text-shadow:0 0 16px rgb(${ICE} / .9), 0 0 4px rgb(255 255 255 / .8); }
.orr-hrig__st.is-lit .orr-hrig__glyph::after { background:rgb(255 255 255); left:-5px; right:-5px; }
.orr-hrig__st.is-lit .orr-hrig__glyph::before { background:rgb(${ICE} / .38); }
.orr-hrig__st.is-flare .orr-hrig__glyph { animation:orr-hrig-flare 420ms cubic-bezier(.34, 1.56, .64, 1); }
@keyframes orr-hrig-flare { 0% { transform:scale(1); } 35% { transform:scale(1.24); } 100% { transform:scale(1); } }

/* the foot: the device words, the echo line, the drawn pad */
.orr-hrig__foot { position:absolute; left:0; right:0; bottom:0; z-index:6; display:flex; align-items:center; justify-content:center; gap:28px; pointer-events:none; }
.orr-hrig__echo { ${LABEL} font-size:clamp(12px, .62vw, 16px); letter-spacing:.2em; color:rgb(${BONE} / .76); display:flex; align-items:center; gap:14px; min-height:28px; white-space:nowrap; pointer-events:none; }
.orr-hrig__echo b { font-family:var(--dp-face-numeral, "Archivo"); font-variation-settings:"wdth" 100, "wght" 560; font-weight:560; font-size:18px; letter-spacing:.02em; color:rgb(255 255 255); text-transform:none; }
.orr-hrig__echo i { font-style:normal; color:rgb(${HOT}); }
.orr-hrig__echo.is-live { color:rgb(${HOT}); }
.orr-hrig__echo.is-none i { color:rgb(${BONE} / .82); }
.orr-hrig__dev { display:flex; gap:18px; pointer-events:auto; padding:0 6px 14px;
  background:linear-gradient(rgb(${BONE} / .5) 0 0) 0 calc(100% - 4px) / 100% 2px no-repeat, linear-gradient(rgb(${BONE} / .12) 0 0) 0 calc(100% - 1.5px) / 100% 7px no-repeat; }
.orr-hrig__devword { all:unset; box-sizing:border-box; cursor:pointer; position:relative; padding:4px 0 4px; ${LABEL} font-size:clamp(12px, .62vw, 16px); letter-spacing:.2em; color:rgb(${BONE} / .72); }
.orr-hrig__devword::after { content:""; position:absolute; left:50%; bottom:-12px; width:2px; height:9px; margin-left:-1px; background:rgb(${BONE} / .6); }
.orr-hrig__devword[aria-pressed="true"] { color:rgb(${HOT}); }
.orr-hrig__devword[aria-pressed="true"]::after { width:9px; height:9px; margin-left:-4.5px; bottom:-14px; border-radius:50%; background:rgb(${HOT}); box-shadow:0 0 8px rgb(255 244 222 / .55); }
.orr-hrig__devword:is(:hover, :focus-visible) { color:rgb(255 255 255); outline:none; }
.orr-hrig__devword:focus-visible::after { background:rgb(255 255 255); }
.orr-hrig__padsvg { display:none; flex:none; overflow:visible; pointer-events:none; }
.orr-hrig.is-pad .orr-hrig__padsvg, .orr-hrig__padsvg.is-shown { display:block; }
.orr-hrig__padsvg .orr-hrig__pb-body { fill:rgb(${BONE} / .12); stroke:none; }
.orr-hrig__padsvg .orr-hrig__pb-grip { fill:rgb(${BONE} / .08); stroke:none; }
.orr-hrig__padsvg .orr-hrig__pb { fill:rgb(4 6 9 / .82); stroke:rgb(${BONE} / .7); stroke-width:1.6px; transition:fill .12s linear, stroke .12s linear; }
.orr-hrig__padsvg .orr-hrig__pb-band { fill:none; stroke:rgb(${BONE} / .27); stroke-width:7px; stroke-linecap:round; stroke-linejoin:round; }
.orr-hrig__padsvg .orr-hrig__pb-edge { fill:none; stroke:rgb(${BONE} / .6); stroke-width:1.6px; stroke-linecap:round; stroke-linejoin:round; }
.orr-hrig__padsvg .orr-hrig__pb-arc { fill:none; stroke:rgb(${BONE} / .6); stroke-width:4px; stroke-linecap:round; transition:stroke .12s linear; }
.orr-hrig__padsvg text { font-family:var(--dp-face-label, "Archivo"); font-size:var(--orr-pad-fs, 12px); font-weight:700; letter-spacing:.06em; fill:rgb(${HOT}); text-anchor:middle; dominant-baseline:central; }
.orr-hrig__padsvg .is-lit .orr-hrig__pb, .orr-hrig__padsvg .orr-hrig__pb.is-lit { fill:rgb(${HOT}); stroke:rgb(255 255 255); }
.orr-hrig__padsvg .is-lit > circle ~ text { fill:#12100c; }
.orr-hrig__padsvg .is-lit > path ~ text { fill:rgb(255 255 255); }
.orr-hrig__padsvg .is-lit .orr-hrig__pb-arc, .orr-hrig__padsvg .orr-hrig__pb-arc.is-lit { stroke:rgb(236 247 255); }

.orr-hrig__whisper { position:fixed; z-index:40; left:0; top:0; pointer-events:none; ${LABEL} font-size:12px; letter-spacing:.18em; color:rgb(${HOT});
  padding:6px 10px 6px 12px; white-space:nowrap; opacity:0; transform:translate(14px, -130%); transition:opacity .18s linear;
  background:radial-gradient(closest-side, rgb(5 7 10 / .9), rgb(5 7 10 / .6) 70%, rgb(5 7 10 / 0)); }
.orr-hrig__whisper.is-on { opacity:1; }
.orr-hrig__whisper b { font-family:var(--dp-face-numeral, "Archivo"); font-weight:560; font-size:15px; letter-spacing:.02em; text-transform:none; color:rgb(255 255 255); margin-right:10px; }
.orr-hrig__whisper.is-none { color:rgb(${BONE} / .86); }

.orr-hrig__rise { animation:orr-hrig-rise .5s var(--dp-ease-out, ease-out) both; animation-delay:var(--orr-delay, 0ms); }
@keyframes orr-hrig-rise { from { opacity:0; translate:0 6px; } to { opacity:1; translate:none; } }
.orr-hrig__spin { transform-box:view-box; animation:orr-spin-in 760ms var(--dp-ease-out, ease-out) both; }

html.sf-reduce-motion .orr-hrig .orr-hrig__beam, html.sf-reduce-motion .orr-hrig .orr-hrig__beam-bloom { display:none; }
html.sf-reduce-motion .orr-hrig__st.is-flare .orr-hrig__glyph { animation:none; }
html.sf-reduce-motion .orr-hrig__rise, html.sf-reduce-motion .orr-hrig__spin { animation:none; }
html.sf-reduce-motion .orr-hrig *, html.sf-reduce-motion .orr-hrig__whisper { transition:none !important; }
html.sf-reduce-motion .orr-hrig .orr-hrig__fx.is-lit * { animation:none !important; }
@media (forced-colors: active) {
  .orr-hrig__glyph::before, .orr-hrig__glyph::after { background:CanvasText; }
  .orr-hrig__st:focus-visible { outline:2px solid Highlight; }
}
`;

function injectStyle(doc) {
  if (!doc || !doc.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

// A drawn pad, Xbox layout, in its own 300 x 132 frame. Each control carries the standard button
// name(s) it answers to, so the echo can light exactly the button pressed.
const PAD_BODY = 'M 62 34 C 96 22, 204 22, 238 34 C 270 44, 294 96, 286 116 C 280 132, 252 132, 240 116 L 214 88 C 190 82, 110 82, 86 88 L 60 116 C 48 132, 20 132, 14 116 C 6 96, 30 44, 62 34 Z';
// the grips: the two lower lobes, a shade fuller than the shell
const PAD_GRIPS = Object.freeze([
  'M 62 58 C 44 70, 26 96, 20 112 C 22 124, 44 128, 56 114 L 78 90 C 76 78, 72 64, 62 58 Z',
  'M 238 58 C 256 70, 274 96, 280 112 C 278 124, 256 128, 244 114 L 222 90 C 224 78, 228 64, 238 58 Z',
]);
const PAD_CONTROLS = Object.freeze([
  { names: ['l3'], kind: 'stick', x: 84, y: 56, r: 12, text: 'L' },
  { names: ['r3'], kind: 'stick', x: 186, y: 84, r: 12, text: 'R' },
  { names: ['alt'], kind: 'face', x: 218, y: 40, r: 8, text: 'Y' },
  { names: ['action'], kind: 'face', x: 202, y: 56, r: 8, text: 'X' },
  { names: ['cancel'], kind: 'face', x: 234, y: 56, r: 8, text: 'B' },
  { names: ['accept'], kind: 'face', x: 218, y: 72, r: 8, text: 'A' },
  { names: ['dUp'], kind: 'dpad', x: 114, y: 74, w: 8, h: 9, text: '' },
  { names: ['dDown'], kind: 'dpad', x: 114, y: 94, w: 8, h: 9, text: '' },
  { names: ['dLeft'], kind: 'dpad', x: 104, y: 84, w: 9, h: 8, text: '' },
  { names: ['dRight'], kind: 'dpad', x: 124, y: 84, w: 9, h: 8, text: '' },
  { names: ['view'], kind: 'small', x: 136, y: 52, r: 4.5, text: '' },
  { names: ['menu'], kind: 'small', x: 164, y: 52, r: 4.5, text: '' },
  { names: ['home'], kind: 'small', x: 150, y: 38, r: 5.5, text: '' },
  { names: ['l1'], kind: 'arc', d: 'M 56 26 Q 74 16 100 16', tx: 44, ty: 16, text: 'LB' },
  { names: ['r1'], kind: 'arc', d: 'M 244 26 Q 226 16 200 16', tx: 256, ty: 16, text: 'RB' },
  { names: ['l2'], kind: 'arc', d: 'M 64 12 Q 78 4 98 3', tx: 52, ty: 0, text: 'LT' },
  { names: ['r2'], kind: 'arc', d: 'M 236 12 Q 222 4 202 3', tx: 248, ty: 0, text: 'RT' },
]);

function padSvg() {
  const root = svg('svg', { class: 'orr-hrig__padsvg', viewBox: '-4 -12 308 150', 'aria-hidden': 'true', focusable: 'false' });
  root.appendChild(svg('path', { d: PAD_BODY, class: 'orr-hrig__pb-body' }));
  for (const d of PAD_GRIPS) root.appendChild(svg('path', { d, class: 'orr-hrig__pb-grip' }));
  root.appendChild(svg('path', { d: PAD_BODY, class: 'orr-hrig__pb-band' }));
  root.appendChild(svg('path', { d: PAD_BODY, class: 'orr-hrig__pb-edge' }));
  const els = new Map();
  for (const c of PAD_CONTROLS) {
    const g = svg('g', { 'data-pad': c.names.join(' ') });
    if (c.kind === 'arc') {
      g.appendChild(svg('path', { d: c.d, class: 'orr-hrig__pb-arc' }));
      const t = svg('text', { x: c.tx, y: c.ty });
      t.textContent = c.text;
      g.appendChild(t);
    } else if (c.kind === 'dpad') {
      g.appendChild(svg('rect', { x: c.x - c.w / 2, y: c.y - c.h / 2, width: c.w, height: c.h, rx: 1.5, class: 'orr-hrig__pb' }));
    } else {
      g.appendChild(svg('circle', { cx: c.x, cy: c.y, r: c.r, class: 'orr-hrig__pb' }));
      if (c.kind === 'stick') g.appendChild(svg('circle', { cx: c.x, cy: c.y, r: c.r * 0.45, class: 'orr-hrig__pb', style: 'fill:none' }));
      if (c.text && c.kind === 'face') {
        const t = svg('text', { x: c.x, y: c.y + 0.5 });
        t.textContent = c.text;
        g.appendChild(t);
      }
    }
    root.appendChild(g);
    for (const n of c.names) els.set(n, g);
  }
  return { root, els };
}

/**
 * @param {HTMLElement} host positioned box the rig fills
 * @param {{ onPreview?: (id:string) => void, onDevice?: (dev:'kbm'|'pad') => void }} [opts]
 */
export function createControlsRig(host, { onPreview = null, onDevice = null, padHost = null } = {}) {
  const doc = host && host.ownerDocument ? host.ownerDocument : globalThis.document;
  const inert = {
    el: host, set() {}, flare() {}, release() {}, releaseAll() {}, setDevice() {}, padLight() {}, whisper() {}, echo() {},
    device: () => 'kbm', stationEl: () => null, relayout() {}, dispose() {},
  };
  if (!host || !doc || typeof doc.createElementNS !== 'function' || typeof host.getBoundingClientRect !== 'function') return inert;
  injectOrrery(doc);
  injectStyle(doc);
  host.classList.add('orr-hrig', 'is-off');

  const pool = doc.createElement('i'); pool.className = 'orr-hrig__pool';
  const floor = doc.createElement('i'); floor.className = 'orr-hrig__floor';
  const spot = doc.createElement('i'); spot.className = 'orr-hrig__spot';
  const onSpot = (e) => {
    const r = host.getBoundingClientRect();
    spot.style.setProperty('--orr-spot-x', `${Math.round(e.clientX - r.left)}px`);
    spot.style.setProperty('--orr-spot-y', `${Math.round(e.clientY - r.top)}px`);
    host.classList.add('is-spot');
  };
  const offSpot = () => host.classList.remove('is-spot');
  host.addEventListener('pointermove', onSpot, { passive: true });
  host.addEventListener('pointerleave', offSpot);
  const under = svg('svg', { class: 'orr-svg orr-hrig__under', 'aria-hidden': 'true', focusable: 'false' });
  const hull = doc.createElement('img');
  hull.className = 'orr-hrig__hull'; hull.alt = ''; hull.decoding = 'async'; hull.draggable = false;
  hull.addEventListener('load', () => hull.classList.add('is-ready'));
  const ghost = doc.createElement('img');
  ghost.className = 'orr-hrig__ghost'; ghost.alt = ''; ghost.decoding = 'async'; ghost.draggable = false;
  const glows = doc.createElement('div'); glows.className = 'orr-hrig__glows';
  const over = svg('svg', { class: 'orr-svg orr-hrig__over', 'aria-hidden': 'true', focusable: 'false' });
  const foot = doc.createElement('div'); foot.className = 'orr-hrig__foot';
  const dev = doc.createElement('div'); dev.className = 'orr-hrig__dev'; dev.setAttribute('role', 'group'); dev.setAttribute('aria-label', 'Show bindings for');
  const devKb = doc.createElement('button'); devKb.type = 'button'; devKb.className = 'orr-hrig__devword'; devKb.textContent = 'Keys';
  devKb.dataset.action = 'help-device:kbm';
  const devPad = doc.createElement('button'); devPad.type = 'button'; devPad.className = 'orr-hrig__devword'; devPad.textContent = 'Pad';
  devPad.dataset.action = 'help-device:pad';
  dev.append(devKb, devPad);
  const echoLine = doc.createElement('p'); echoLine.className = 'orr-hrig__echo'; echoLine.setAttribute('aria-live', 'polite');
  const pad = padSvg();
  // the drawn pad stands in its own host when the screen gives one (beside the ladder of every key),
  // so the berth keeps its size when the device changes; else it takes the foot
  if (padHost && typeof padHost.appendChild === 'function') { foot.append(dev, echoLine); padHost.appendChild(pad.root); }
  else foot.append(dev, pad.root, echoLine);
  host.append(pool, spot, floor, under, hull, ghost, glows, over, foot);
  const whisperEl = doc.createElement('div'); whisperEl.className = 'orr-hrig__whisper'; whisperEl.setAttribute('aria-hidden', 'true');
  (doc.body || host).appendChild(whisperEl);

  const uid = ++rigSeq;
  let model = null;
  let marks = null;
  let device = 'kbm';
  let frame = 0;
  let ro = null;
  let geo = null;
  let arrived = false;
  let whisperTimer = 0;
  let echoTimer = 0;
  const stationEls = new Map();     // id -> button
  const leads = new Map();          // id -> { band, core, beam, bloom }
  const fx = new Map();             // fx key -> [elements]
  const markEls = new Map();        // part -> g
  const held = new Map();           // id -> Set(sources)
  const timers = new Map();         // id -> timeout

  const promptText = () => {
    const tight = host.classList.contains('is-small');
    if (device === 'pad') return tight ? 'Press any pad button' : 'Press any pad button · the rig lights what it drives';
    return tight ? 'Press any key or click' : 'Press any key or click · the rig lights what it drives';
  };
  const restEcho = () => {
    echoLine.classList.remove('is-live', 'is-none');
    echoLine.textContent = promptText();
  };

  function paintDevice() {
    host.classList.toggle('is-pad', device === 'pad');
    pad.root.classList.toggle('is-shown', device === 'pad');
    if (padHost) padHost.classList.toggle('is-pad', device === 'pad');
    devKb.setAttribute('aria-pressed', String(device !== 'pad'));
    devPad.setAttribute('aria-pressed', String(device === 'pad'));
    if (!echoLine.classList.contains('is-live')) restEcho();
  }
  devKb.addEventListener('click', () => { setDevice('kbm'); if (onDevice) onDevice('kbm'); });
  devPad.addEventListener('click', () => { setDevice('pad'); if (onDevice) onDevice('pad'); });

  function setDevice(next) {
    const d = next === 'pad' ? 'pad' : 'kbm';
    if (d === device) return;
    device = d;
    paintDevice();
    schedule();
  }

  const schedule = () => {
    if (frame) return;
    const raf = globalThis.requestAnimationFrame;
    if (typeof raf === 'function') frame = raf(() => { frame = 0; layout(); });
    else layout();
  };
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => schedule()); ro.observe(host); }

  function glyphHtml(spec) {
    const kb = spec.kb || {};
    const pd = spec.pad || {};
    const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const keyCls = (s) => (String(s).length > 3 ? 'orr-hrig__key orr-hrig__key--word' : 'orr-hrig__key');
    const kbNone = !kb.main;
    const padNone = !pd.main;
    const kbHtml = `<span class="orr-hrig__glyph orr-hrig__kb${kbNone ? ' is-none' : ''}"><b class="${keyCls(kb.main || kb.none || 'not bound')}">${esc(kb.main || kb.none || 'not bound')}</b>`
      + (kb.alt ? `<small class="orr-hrig__alt">${esc(kb.alt)}</small>` : '') + '</span>';
    const padHtml = `<span class="orr-hrig__glyph orr-hrig__pad${padNone ? ' is-none' : ''}"><b class="${keyCls(pd.main || 'no pad')}">${esc(pd.main || 'no pad')}</b>`
      + (pd.alt ? `<small class="orr-hrig__alt">${esc(pd.alt)}</small>` : '') + '</span>';
    return kbHtml + padHtml;
  }

  function buildStations() {
    const keep = new Set();
    for (const spec of model.stations) {
      keep.add(spec.id);
      let btn = stationEls.get(spec.id);
      if (!btn) {
        btn = doc.createElement('button');
        btn.type = 'button';
        btn.className = 'orr-hrig__st';
        btn.dataset.station = spec.id;
        btn.addEventListener('pointerenter', () => { const l = leads.get(spec.id); if (l) l.core.classList.add('is-hover'); });
        btn.addEventListener('pointerleave', () => { const l = leads.get(spec.id); if (l) l.core.classList.remove('is-hover'); });
        btn.addEventListener('focus', () => { if (onPreview) onPreview(spec.id, 'focus'); });
        btn.addEventListener('click', () => { if (onPreview) onPreview(spec.id, 'click'); });
        host.appendChild(btn);
        stationEls.set(spec.id, btn);
      }
      btn.dataset.action = `help-verb:${spec.action || spec.id}`;
      btn.dataset.side = (spec.side === 'L' || spec.side === 'left') ? 'L' : 'R';
      btn.dataset.part = spec.part;
      const sig = JSON.stringify([spec.verb, spec.kb, spec.pad]);
      if (btn.dataset.sig !== sig) {
        btn.dataset.sig = sig;
        btn.innerHTML = glyphHtml(spec) + `<span class="orr-hrig__verb"></span>`;
        btn.querySelector('.orr-hrig__verb').textContent = spec.verb;
      }
      const kbWords = spec.kb && spec.kb.main ? [spec.kb.main, spec.kb.alt].filter(Boolean).join(' or ') : 'not bound';
      btn.setAttribute('aria-label', `${spec.verb}: ${kbWords}${spec.pad && spec.pad.main ? `; pad ${spec.pad.main}` : ''}. Drives the ${spec.partName || spec.part}.`);
    }
    for (const [id, btn] of stationEls) {
      if (keep.has(id)) continue;
      btn.remove();
      stationEls.delete(id);
    }
  }

  function standDown() {
    host.classList.add('is-off');
    geo = null;
  }

  function layout() {
    const W = host.clientWidth || 0;
    const H = host.clientHeight || 0;
    if (!model || W < 320 || H < 240) { standDown(); return; }
    host.classList.remove('is-off');
    const small = W < 760 || H < 470;
    host.classList.toggle('is-small', small);
    if (!echoLine.classList.contains('is-live')) restEcho();
    // the foot holds the device words, the echo line and (with a pad) the drawn pad
    const hosted = !!padHost;
    const padW = hosted ? Math.round(Math.max(200, Math.min(340, (padHost.clientWidth || 300)))) : Math.round(Math.max(210, Math.min(300, W * 0.24)));
    const padH = Math.round(padW * 150 / 308);
    pad.root.setAttribute('width', padW);
    pad.root.setAttribute('height', padH);
    // the pad's lettering stays at 12px on screen whatever the drawing's scale
    pad.root.style.setProperty('--orr-pad-fs', `${f(12.5 * 308 / padW)}px`);
    const footH = device === 'pad' && !hosted ? padH + 6 : 42;
    const top = small ? 4 : 10;
    const availH = H - footH - top - (small ? 8 : 18);
    // the station columns take their own width (the widest verb and glyph in each)
    buildStations();
    const colW = { L: 0, R: 0 };
    for (const spec of model.stations) {
      const el = stationEls.get(spec.id);
      el.style.width = 'auto';
      const k = (spec.side === 'L' || spec.side === 'left') ? 'L' : 'R';
      colW[k] = Math.max(colW[k], Math.ceil(el.offsetWidth || 150));
    }
    const gap = Math.round(Math.max(22, Math.min(46, W * 0.034)));
    // the image square: the berth's outer band edge sits at 0.49 of it
    const S = Math.max(200, Math.min(availH / 0.99, small ? Infinity : availH * 0.84, (W - colW.L - colW.R - 2 * gap - 8) / 0.98));
    const block = colW.L + gap + S * 0.98 + gap + colW.R;
    const cx = Math.max(0, (W - block) / 2) + colW.L + gap + S * 0.49;
    const cy = top + availH / 2;
    const bandW = Math.round(Math.max(14, Math.min(22, S * 0.03)));
    const Rb = S * 0.49 - bandW / 2;         // band centre radius
    const Rout = Rb + bandW / 2;
    const Rin = Rb - bandW / 2;
    const x0 = cx - S / 2;
    const y0 = cy - S / 2;
    geo = { W, H, S, cx, cy, Rb, Rout, Rin, bandW, x0, y0, small };
    const P = rigParts(marks);
    const at = (uv) => [x0 + uv[0] * S, y0 + uv[1] * S];

    // pool, floor, hull
    const poolD = S * 1.52;
    Object.assign(pool.style, { left: `${f(cx - poolD / 2)}px`, top: `${f(cy - poolD / 2)}px`, width: `${f(poolD)}px`, height: `${f(poolD)}px` });
    const floorD = S * 0.9;
    Object.assign(floor.style, { left: `${f(cx - floorD / 2)}px`, top: `${f(cy - floorD / 2)}px`, width: `${f(floorD)}px`, height: `${f(floorD)}px` });
    const hullId = hullPosterUrl(model.hullId, 'top') ? model.hullId : 'ship_kestrel';
    const url = hullPosterUrl(hullId, 'top');
    if (hull.getAttribute('src') !== url) hull.src = url;
    Object.assign(hull.style, { left: `${f(x0)}px`, top: `${f(y0)}px`, width: `${f(S)}px`, height: `${f(S)}px` });
    // the ghost that swings through a turn is the hull's rim of light (cut from the render's own alpha,
    // assets/ui/generated/help/rim), in the render's frame; the hull's texture is never lightened
    const rim = RIM_HULLS.has(hullId) ? `${RIM_ROOT}${hullId}.rim.webp` : '';
    if (rim && ghost.getAttribute('src') !== rim) ghost.src = rim;
    ghost.hidden = !rim;
    Object.assign(ghost.style, { left: `${f(x0)}px`, top: `${f(y0)}px`, width: `${f(S)}px`, height: `${f(S)}px` });
    const arriveNow = !arrived && !reducedMotion();
    const rise = (node, delay) => { if (arriveNow) { node.classList.add('orr-hrig__rise'); node.style.setProperty('--orr-delay', `${delay}ms`); } return node; };

    // ---------------------------------------------------------------- the berth
    under.setAttribute('viewBox', `0 0 ${W} ${H}`);
    over.setAttribute('viewBox', `0 0 ${W} ${H}`);
    under.textContent = '';
    const berth = svg('g', { class: arriveNow ? 'orr-hrig__spin' : '', style: `transform-origin:${f(cx)}px ${f(cy)}px` });
    berth.appendChild(svg('path', { d: arcD(cx, cy, Rb, 0, 360), class: 'orr-hrig__band', 'stroke-width': bandW }));
    // ticks cut through the band (dark notches), majors every 30 degrees also lit outside it
    berth.appendChild(svg('path', { d: ticksD(cx, cy, Rout, 72, { len: bandW, inward: true }), class: 'orr-hrig__notch', 'stroke-width': 1.6 }));
    berth.appendChild(svg('path', { d: arcD(cx, cy, Rout, 0, 360), class: 'orr-hrig__edge' }));
    berth.appendChild(svg('path', { d: arcD(cx, cy, Rin, 0, 360), class: 'orr-hrig__edge', style: 'stroke:rgb(236 230 216 / .36)' }));
    berth.appendChild(svg('path', { d: ticksD(cx, cy, Rout + 2, 12, { len: 0, major: 1, majorLen: small ? 6 : 9, inward: false }), class: 'orr-hrig__tick orr-hrig__tick--major' }));
    // BOW and AFT ride inside the band, bright on its light
    const tsize = 12;
    const bandText = svg('g', { class: 'orr-hrig__bandtext' });
    const bow = circularText(cx, cy, Rb - tsize * 0.36, 'BOW', { startDeg: -90, size: tsize, anchor: 'middle' });
    const aft = circularText(cx, cy, Rb + tsize * 0.36, 'AFT', { startDeg: 180 + 90, size: tsize, anchor: 'middle', upright: true });
    bandText.append(bow, aft);
    // a dark gap in the band under each word so it reads as cut into the ring
    for (const deg of [0, 180]) {
      berth.appendChild(svg('path', { d: arcD(cx, cy, Rb, deg - (small ? 7 : 6), deg + (small ? 7 : 6)), style: `fill:none; stroke:rgb(5 7 10 / .94); stroke-width:${bandW - 3}px` }));
    }
    berth.appendChild(bandText);
    under.appendChild(berth);
    // an outer scale that drifts, and the berth's inner cradle ticks
    const drift = svg('g', { class: 'orr-drift', style: `transform-origin:${f(cx)}px ${f(cy)}px; --orr-drift-s:840s` });
    drift.appendChild(svg('path', { d: ticksD(cx, cy, Rout + (small ? 14 : 20), 120, { len: 3, major: 10, majorLen: 7, inward: true }), class: 'orr-hrig__tick', style: 'stroke:rgb(236 230 216 / .34)' }));
    under.appendChild(rise(drift, 120));
    under.appendChild(svg('path', { d: ticksD(cx, cy, Rin - 3, 36, { len: 4, major: 3, majorLen: 8, inward: true }), class: 'orr-hrig__tick', style: 'stroke:rgb(236 230 216 / .3)' }));

    // ---------------------------------------------------------------- stations (two columns)
    const cols = { L: [], R: [] };
    for (const spec of model.stations) cols[(spec.side === 'L' || spec.side === 'left') ? 'L' : 'R'].push(spec);
    const byY = (a, b) => (P[a.part][1] - P[b.part][1]) || ((a.order || 0) - (b.order || 0));
    cols.L.sort(byY); cols.R.sort(byY);
    // the columns follow the berth's curve: each station's inner edge stands one gap off the ring
    const Rst = Rout + gap;
    const colTop = Math.max(4, cy - Rst * 0.92);
    const colBottom = Math.min(H - footH - 4, cy + Rst * 0.92);
    const placeCol = (list, side) => {
      const els = list.map((s) => stationEls.get(s.id));
      const heights = els.map((el) => Math.max(26, el.offsetHeight || 30));
      // each station sits near the height of the part it drives (so its leader runs short and flat),
      // pulled a third of the way toward an even spread so a cluster of verbs at the bow still breathes
      const even = stackEvenly(heights, cy, colTop, colBottom, { minGap: small ? 2 : 6, maxGap: small ? 26 : 62 });
      const want = list.map((spec, i) => {
        const py = at(P[spec.part])[1];
        return Math.max(colTop, Math.min(colBottom, py)) * 0.62 + (even[i] + heights[i] / 2) * 0.38;
      });
      const tops = spreadNear(want, heights, colTop, colBottom, small ? 4 : 12);
      return list.map((spec, i) => {
        const el = els[i];
        const y = tops[i];
        const w = Math.ceil(el.offsetWidth || colW[side]);
        // the station's corner nearest the berth stands one gap off it
        const dyNear = Math.max(0, Math.abs(y + heights[i] / 2 - cy) - heights[i] / 2);
        const reach = Math.sqrt(Math.max(0, Rst * Rst - Math.min(dyNear, Rst * 0.98) ** 2));
        const left = side === 'L' ? cx - reach - w : cx + reach;
        el.style.left = `${f(left)}px`;
        el.style.top = `${f(y)}px`;
        rise(el, 240 + i * 34);
        // the leader leaves the station at its glyph's inner edge
        const glyph = el.querySelector(device === 'pad' ? '.orr-hrig__pad' : '.orr-hrig__kb');
        let gw = glyph ? glyph.offsetWidth : 24;
        if (!gw) gw = 24;
        const ay = y + heights[i] / 2;
        const ax = side === 'L' ? left + w + 8 : left - 8;
        return { spec, ax, ay, side: side === 'L' ? -1 : 1, gw };
      });
    };
    const anchors = [...placeCol(cols.L, 'L'), ...placeCol(cols.R, 'R')];

    // Every verb has its own anchor on the ship: a centreline part leans toward the verb's own column,
    // and down each column the anchors run in the same order as the labels, at least a finger apart,
    // so no two leaders cross and no two share a point.
    const minSep = small ? 16 : 18;
    const anchorAt = new Map();
    for (const side of [-1, 1]) {
      let prevY = -Infinity;
      for (const a of anchors.filter((q) => q.side === side)) {
        let [px, py] = at(P[a.spec.part]);
        // a centreline part leans toward the verb's column far enough that the two columns' anchors
        // stand a full separation apart across the keel too
        if (Math.abs(px - cx) < S * 0.02) px = cx + side * Math.max(S * 0.017, minSep / 2);
        py = Math.max(py, prevY + minSep);
        prevY = py;
        // no anchor ring may sit on the berth's band (BOW and AFT ride in it): keep it inside the rim
        const ringR = small ? 3.5 : 5.4;
        const lim = Rin - ringR - 6;
        const dx = px - cx; const dy = py - cy;
        const dd = Math.hypot(dx, dy);
        if (dd > lim) { px = cx + (dx * lim) / dd; py = cy + (dy * lim) / dd; }
        // the rim can pull two anchors onto one point (throttle and brake at a small drive): step the
        // later one a full separation across its column's side
        for (const [qx, qy] of anchorAt.values()) {
          if (Math.hypot(qx - px, qy - py) < minSep) { px += side * minSep; break; }
        }
        anchorAt.set(a.spec.id, [px, py]);
      }
    }

    // ---------------------------------------------------------------- leaders, beams, marks, fx
    over.textContent = '';
    glows.textContent = '';
    leads.clear(); fx.clear(); markEls.clear();
    const halos = svg('g', {});
    const bands = svg('g', {});
    const cores = svg('g', {});
    const beams = svg('g', {});
    const marksG = svg('g', {});
    const fxG = svg('g', {});
    const gatesG = svg('g', {});
    over.append(gatesG, fxG, halos, bands, cores, beams, marksG);
    for (const a of anchors) {
      const [px, py] = anchorAt.get(a.spec.id);
      const lim = Rout * 0.94;
      const dy = Math.max(-lim, Math.min(lim, a.ay - cy));
      const rx = cx + a.side * Math.sqrt(Math.max(0, (Rout + 6) * (Rout + 6) - dy * dy));
      const ry = cy + dy;
      const d = `M ${f(a.ax)} ${f(a.ay)} L ${f(rx)} ${f(ry)} L ${f(px)} ${f(py)}`;
      const inner = `M ${f(rx)} ${f(ry)} L ${f(px)} ${f(py)}`;
      halos.appendChild(svg('path', { d: inner, class: 'orr-hrig__halo' }));
      const band = svg('path', { d, class: 'orr-hrig__lead-band' });
      const core = svg('path', { d, class: 'orr-hrig__lead' });
      const bloom = svg('path', { d, class: 'orr-hrig__beam-bloom', pathLength: 1 });
      const beam = svg('path', { d, class: 'orr-hrig__beam', pathLength: 1 });
      bands.appendChild(rise(band, 300));
      cores.appendChild(rise(core, 300));
      beams.append(bloom, beam);
      // where the leader crosses the berth, the band lights while the verb is held
      const cross = ((Math.atan2(rx - cx, -(ry - cy)) * 180) / Math.PI + 360) % 360;
      const gate = svg('path', { d: arcD(cx, cy, Rb, cross - 7, cross + 7), class: 'orr-hrig__gate', 'stroke-width': bandW });
      gatesG.appendChild(gate);
      leads.set(a.spec.id, { band, core, beam, bloom, gate });
      const g = svg('g', { class: 'orr-hrig__mark' });
      const r = small ? 3.5 : 5.4;
      g.appendChild(svg('circle', { cx: f(px), cy: f(py), r, class: 'orr-hrig__mark-ring' }));
      g.appendChild(svg('circle', { cx: f(px), cy: f(py), r: r * 0.42, class: 'orr-hrig__mark-core' }));
      marksG.appendChild(rise(g, 420));
      markEls.set(a.spec.id, g);
    }

    const add = (key, node) => { if (!fx.has(key)) fx.set(key, []); fx.get(key).push(node); return node; };
    const fxGroup = (key, layer = fxG) => { const g = svg('g', { class: 'orr-hrig__fx' }); layer.appendChild(g); return add(key, g); };
    // A plume is a tapered cone of light: a white-hot throat at the nozzle closing to a point, an ice
    // falloff along its length, and a bone core down its axis. It is geometry, never a soft disc.
    const defs = svg('defs', {});
    under.insertBefore(defs, under.firstChild);
    let plumeSeq = 0;
    const plume = (g, x, y, deg, len, half, { core = true } = {}) => {
      const id = `orr-hrig-pl-${uid}-${++plumeSeq}`;
      const [tx, ty] = polar(x, y, len, deg);
      const grad = svg('linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: f(x), y1: f(y), x2: f(tx), y2: f(ty) });
      grad.appendChild(svg('stop', { offset: '0', 'stop-color': 'rgb(248 252 255)', 'stop-opacity': '.95' }));
      grad.appendChild(svg('stop', { offset: '.22', 'stop-color': `rgb(${ICE})`, 'stop-opacity': '.62' }));
      grad.appendChild(svg('stop', { offset: '.7', 'stop-color': `rgb(${ICE})`, 'stop-opacity': '.2' }));
      grad.appendChild(svg('stop', { offset: '1', 'stop-color': `rgb(${ICE})`, 'stop-opacity': '0' }));
      defs.appendChild(grad);
      const [ax, ay] = polar(x, y, half, deg - 90);
      const [bx, by] = polar(x, y, half, deg + 90);
      const [m1x, m1y] = polar(ax, ay, len * 0.42, deg);
      const [m2x, m2y] = polar(bx, by, len * 0.42, deg);
      g.appendChild(svg('path', { d: `M ${f(ax)} ${f(ay)} Q ${f(m1x)} ${f(m1y)} ${f(tx)} ${f(ty)} Q ${f(m2x)} ${f(m2y)} ${f(bx)} ${f(by)} Z`, fill: `url(#${id})` }));
      if (core) {
        const [cx2, cy2] = polar(x, y, len * 0.62, deg);
        g.appendChild(svg('path', { d: `M ${f(x)} ${f(y)} L ${f(cx2)} ${f(cy2)}`, stroke: `url(#${id})`, 'stroke-width': Math.max(2, half * 0.24), 'stroke-linecap': 'round', fill: 'none' }));
      }
      return g;
    };
    // the drive's plume and the boost's longer one burn under the berth, so AFT stays readable over them
    const plumeLayer = svg('g', {});
    under.insertBefore(plumeLayer, defs.nextSibling);
    {
      const [dx, dy] = at(P.drive);
      plume(fxGroup('drive', plumeLayer), dx, dy + S * 0.01, 180, S * 0.27, S * 0.03);
      const [bx, by] = at(P.bloom);
      plume(fxGroup('bloom', plumeLayer), bx, by, 180, S * 0.44, S * 0.046);
      const ring = fxGroup('bloom');
      ring.appendChild(svg('circle', { cx: f(bx), cy: f(by), r: S * 0.05, class: 'orr-hrig__fx-ring orr-hrig__pulse' }));
      // brake: the drive clamps -- two arcs close round the nozzle
      const b = fxGroup('brake');
      const rr = S * 0.06;
      for (const [a0, a1] of [[-70, 70], [110, 250]]) {
        b.appendChild(svg('path', { d: arcD(dx, dy, rr, a0, a1), class: 'orr-hrig__fx-bloom' }));
        b.appendChild(svg('path', { d: arcD(dx, dy, rr, a0, a1), class: 'orr-hrig__fx-line' }));
      }
    }
    // reverse: the retro thrusters fire forward out of the bow's shoulders
    {
      const g = fxGroup('retro');
      for (const k of ['bowL', 'bowR']) { const [x, y] = at(P[k]); const len = Math.min(S * 0.12, y - (cy - Rin) - 6); if (len >= 6) plume(g, x, y, k === 'bowL' ? -12 : 12, len, S * 0.013, { core: false }); }
    }
    // steer: the hull's rim of light swings through the turn; an arc ahead of the bow shows it
    for (const [key, sign] of [['steerL', -1], ['steerR', 1]]) {
      const g = fxGroup(key);
      const r = (0.5 - HULL_TOP) * S + (small ? 10 : 16);
      const a1 = sign * 26;
      const d = arcD(cx, cy, r, 0, a1);
      g.appendChild(svg('path', { d, class: 'orr-hrig__fx-bloom' }));
      g.appendChild(svg('path', { d, class: 'orr-hrig__fx-line orr-hrig__fx-draw', pathLength: 1 }));
      const [hx, hy] = polar(cx, cy, r, a1);
      const [bx1, by1] = polar(cx, cy, r - 7, a1 - sign * 5);
      const [bx2, by2] = polar(cx, cy, r + 7, a1 - sign * 5);
      g.appendChild(svg('path', { d: `M ${f(bx1)} ${f(by1)} L ${f(hx)} ${f(hy)} L ${f(bx2)} ${f(by2)}`, class: 'orr-hrig__fx-line' }));
    }
    // lateral: the flank thruster fires outward
    {
      const [lx, ly] = at(P.flankL);
      plume(fxGroup('flankL'), lx, ly, 270, S * 0.15, S * 0.016, { core: false });
      const [qx, qy] = at(P.flankR);
      plume(fxGroup('flankR'), qx, qy, 90, S * 0.15, S * 0.016, { core: false });
    }
    // fire: two muzzle streaks out of the hardpoint
    {
      const [wx, wy] = at(P.hardpoint);
      const g = fxGroup('fire');
      // the streaks stop short of the berth's inner edge, so BOW stays readable
      const stop = cy - Rin + 8;
      const reach = Math.max(0, Math.min(S * 0.11, wy - 8 - stop));
      for (const off of reach < 6 ? [] : [-S * 0.014, S * 0.014]) {
        const d = `M ${f(wx + off)} ${f(wy - 8)} L ${f(wx + off)} ${f(wy - 8 - reach)}`;
        g.appendChild(svg('path', { d, class: 'orr-hrig__fx-bloom', style: 'stroke-width:6px' }));
        g.appendChild(svg('path', { d, class: 'orr-hrig__fx-line orr-hrig__fx-draw', pathLength: 1, style: 'stroke-width:2px' }));
      }
    }
    // mine: a beam cone forward of the mining head
    {
      const [mx, my] = at(P.mining);
      const g = fxGroup('mine');
      const reach = my - (cy - Rin) + 2;
      const spread = S * 0.05;
      g.appendChild(svg('path', { d: `M ${f(mx)} ${f(my)} L ${f(mx - spread)} ${f(my - reach)} L ${f(mx + spread)} ${f(my - reach)} Z`, class: 'orr-hrig__fx-fill' }));
      const d = `M ${f(mx)} ${f(my)} L ${f(mx)} ${f(my - reach)}`;
      g.appendChild(svg('path', { d, class: 'orr-hrig__fx-bloom' }));
      g.appendChild(svg('path', { d, class: 'orr-hrig__fx-line orr-hrig__fx-draw', pathLength: 1, style: 'stroke-dasharray:4 5' }));
    }
    // massline: the tether pays out of the winch past the berth to a caught rock
    {
      const [tx, ty] = at(P.winch);
      const g = fxGroup('winch');
      const [ex, ey] = polar(cx, cy, Rout + (small ? 24 : 40), 318);
      const mx = (tx + ex) / 2 - S * 0.085;
      const my = (ty + ey) / 2;
      const d = `M ${f(tx)} ${f(ty)} Q ${f(mx)} ${f(my)} ${f(ex)} ${f(ey)}`;
      g.appendChild(svg('path', { d, class: 'orr-hrig__fx-bloom' }));
      g.appendChild(svg('path', { d, class: 'orr-hrig__fx-line orr-hrig__fx-draw', pathLength: 1 }));
      g.appendChild(svg('circle', { cx: f(ex), cy: f(ey), r: small ? 7 : 10, class: 'orr-hrig__fx-ring' }));
      g.appendChild(svg('circle', { cx: f(ex), cy: f(ey), r: small ? 2.5 : 3.5, class: 'orr-hrig__fx-dot' }));
    }
    // countermeasure: chaff scatters from the belly
    {
      const [kx, ky] = at(P.belly);
      const g = fxGroup('belly');
      const n = 9;
      for (let i = 0; i < n; i += 1) {
        const deg = (360 * i) / n + 12;
        const rr = S * (0.085 + (i % 3) * 0.03);
        const [dx, dy] = polar(kx, ky, rr, deg);
        const c = svg('circle', { cx: f(dx), cy: f(dy), r: 2.6, class: 'orr-hrig__fx-dot orr-hrig__chaff' });
        c.style.setProperty('--cx0', `${f(kx - dx)}px`);
        c.style.setProperty('--cy0', `${f(ky - dy)}px`);
        g.appendChild(c);
      }
    }
    // draw-to-fly: a drawn course curls off the helm ahead of the ship
    {
      const [hx, hy] = at(P.helm);
      const g = fxGroup('helm');
      const [ex, ey] = polar(cx, cy, Rin - 6, 36);
      const d = `M ${f(hx)} ${f(hy)} C ${f(hx)} ${f(hy - S * 0.29)}, ${f(ex - S * 0.19)} ${f(ey + S * 0.05)}, ${f(ex)} ${f(ey)}`;
      g.appendChild(svg('path', { d, class: 'orr-hrig__fx-bloom' }));
      g.appendChild(svg('path', { d, class: 'orr-hrig__fx-line', style: 'stroke-dasharray:5 6' }));
      g.appendChild(svg('circle', { cx: f(ex), cy: f(ey), r: 3.5, class: 'orr-hrig__fx-dot' }));
    }

    // the foot sits under the berth
    foot.style.bottom = '0px';
    arrived = true;
    // re-light anything held through a relayout
    for (const id of held.keys()) paintLit(id, true);
  }

  function specOf(id) { return model && model.stations.find((s) => s.id === id); }
  function fxKeyOf(spec) { return spec.fx || spec.part; }

  function paintLit(id, on) {
    const spec = specOf(id);
    if (!spec) return;
    const btn = stationEls.get(id);
    if (btn) btn.classList.toggle('is-lit', on);
    const l = leads.get(id);
    if (l) { l.core.classList.toggle('is-lit', on); l.band.classList.toggle('is-lit', on); if (l.gate) l.gate.classList.toggle('is-lit', on); }
    // a part stays lit while any station that drives it is held
    const mk = markEls.get(id);
    if (mk) mk.classList.toggle('is-lit', on);
    const key = fxKeyOf(spec);
    const keyOn = on || [...held.keys()].some((k) => { const s = specOf(k); return s && fxKeyOf(s) === key; });
    for (const node of fx.get(key) || []) node.classList.toggle('is-lit', keyOn);
    if (key === 'steerL' || key === 'steerR') {
      const lOn = [...held.keys()].some((k) => fxKeyOf(specOf(k) || {}) === 'steerL') || (on && key === 'steerL');
      const rOn = [...held.keys()].some((k) => fxKeyOf(specOf(k) || {}) === 'steerR') || (on && key === 'steerR');
      const turn = lOn && !rOn ? -8 : rOn && !lOn ? 8 : 0;
      ghost.classList.toggle('is-lit', turn !== 0);
      ghost.style.transform = turn ? `rotate(${turn}deg)` : '';
    }
  }

  function runBeam(id) {
    const l = leads.get(id);
    const btn = stationEls.get(id);
    if (btn) {
      btn.classList.remove('is-flare');
      void btn.offsetWidth;
      btn.classList.add('is-flare');
    }
    if (!l || reducedMotion()) return;
    for (const p of [l.beam, l.bloom]) {
      p.classList.remove('is-run');
      if (typeof p.getBBox === 'function') { try { p.getBBox(); } catch (e) { /* layout flush only */ } }
      void host.offsetWidth;
      p.classList.add('is-run');
    }
  }

  /** Light stations. `hold`: stay lit until release(id, source); otherwise a short flare. */
  function flare(ids, { hold = false, source = 'echo' } = {}) {
    for (const id of ids) {
      if (!specOf(id)) continue;
      const wasHeld = held.has(id) && held.get(id).size > 0;
      if (hold) {
        if (!held.has(id)) held.set(id, new Set());
        held.get(id).add(source);
      }
      if (timers.has(id)) { clearTimeout(timers.get(id)); timers.delete(id); }
      paintLit(id, true);
      if (!wasHeld) runBeam(id);
      if (!hold) {
        timers.set(id, setTimeout(() => {
          timers.delete(id);
          if (!held.has(id)) paintLit(id, false);
        }, reducedMotion() ? 900 : 1100));
      }
    }
  }

  function release(ids, source = 'echo') {
    for (const id of ids) {
      const set = held.get(id);
      if (!set) continue;
      set.delete(source);
      if (set.size) continue;
      held.delete(id);
      // hold the light a beat after the key comes up, so a tap still reads
      timers.set(id, setTimeout(() => { timers.delete(id); if (!held.has(id)) paintLit(id, false); }, 260));
    }
  }

  function releaseAll() {
    const ids = [...held.keys()];
    held.clear();
    for (const id of ids) paintLit(id, false);
    for (const g of pad.els.values()) g.classList.remove('is-lit');
  }

  function padLight(names, on) {
    for (const n of names) { const g = pad.els.get(n); if (g) g.classList.toggle('is-lit', !!on); }
  }

  /** A whisper at the pointer: `glyph` in the numeral face, then its words. */
  function whisper(glyph, words, x, y, { none = false } = {}) {
    whisperEl.textContent = '';
    if (glyph) { const b = doc.createElement('b'); b.textContent = glyph; whisperEl.appendChild(b); }
    whisperEl.appendChild(doc.createTextNode(words));
    whisperEl.classList.toggle('is-none', !!none);
    const vw = (doc.defaultView && doc.defaultView.innerWidth) || 1920;
    const vh = (doc.defaultView && doc.defaultView.innerHeight) || 1080;
    const px = Math.max(8, Math.min(vw - 300, Number.isFinite(x) ? x : vw / 2));
    const py = Math.max(60, Math.min(vh - 20, Number.isFinite(y) ? y : vh / 2));
    whisperEl.style.left = `${f(px)}px`;
    whisperEl.style.top = `${f(py)}px`;
    whisperEl.classList.add('is-on');
    if (whisperTimer) clearTimeout(whisperTimer);
    whisperTimer = setTimeout(() => { whisperTimer = 0; whisperEl.classList.remove('is-on'); }, 1500);
  }

  /** The echo line under the berth: what was pressed and what it drives. */
  function echo(glyph, words, { none = false } = {}) {
    echoLine.textContent = '';
    const b = doc.createElement('b'); b.textContent = glyph || '';
    const i = doc.createElement('i'); i.textContent = words;
    echoLine.append(b, i);
    echoLine.classList.add('is-live');
    echoLine.classList.toggle('is-none', !!none);
    if (echoTimer) clearTimeout(echoTimer);
    echoTimer = setTimeout(() => { echoTimer = 0; restEcho(); }, 2600);
  }

  paintDevice();
  loadHullPosterManifest().then((m) => {
    const entry = m && m.hulls && model && m.hulls[model.hullId];
    const top = entry && entry.top && entry.top.marks;
    if (top) { marks = top; schedule(); }
  }).catch(() => {});

  return {
    el: host,
    /** @param {{ hullId: string, stations: object[] }} next */
    set(next) {
      const hullChanged = !model || !next || next.hullId !== model.hullId;
      model = next ? { ...next, stations: (next.stations || []).slice() } : null;
      if (hullChanged && model) {
        marks = null;
        loadHullPosterManifest().then((m) => {
          const entry = m && m.hulls && model && m.hulls[model.hullId];
          const top = entry && entry.top && entry.top.marks;
          marks = top || null;
          schedule();
        }).catch(() => {});
      }
      schedule();
    },
    flare,
    release,
    releaseAll,
    setDevice,
    padLight,
    whisper,
    echo,
    device: () => device,
    stationEl: (id) => stationEls.get(id) || null,
    relayout: schedule,
    dispose() {
      if (ro) ro.disconnect();
      host.removeEventListener('pointermove', onSpot);
      host.removeEventListener('pointerleave', offSpot);
      if (frame && typeof globalThis.cancelAnimationFrame === 'function') globalThis.cancelAnimationFrame(frame);
      frame = 0;
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      if (whisperTimer) clearTimeout(whisperTimer);
      if (echoTimer) clearTimeout(echoTimer);
      if (whisperEl.parentNode) whisperEl.parentNode.removeChild(whisperEl);
      host.textContent = '';
      host.classList.remove('orr-hrig', 'is-off', 'is-pad');
    },
  };
}

// ------------------------------------------------------------------------------------------------
// The input echo: raw keys, mouse buttons and pad buttons while Help is open, reported and never
// acted on. It never calls preventDefault (Tab, arrows, Enter and Escape keep their modal meaning)
// except to keep the browser's context menu off the rig, so a right click can show the mining beam.

// Standard-mapping pad buttons by index (the W3C standard layout gamepad.js reads).
export const PAD_STD_NAMES = Object.freeze(['accept', 'cancel', 'action', 'alt', 'l1', 'r1', 'l2', 'r2', 'view', 'menu', 'l3', 'r3', 'dUp', 'dDown', 'dLeft', 'dRight', 'home']);

function isTextEntry(t) {
  return !!(t && typeof t.closest === 'function' && t.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""], [data-text-input]'));
}

/**
 * @param {{ root: HTMLElement, rigHost?: () => HTMLElement|null, onInput: (ev: {device:'kbm'|'pad', code?:string, button?:string, axis?:string, down:boolean, x?:number, y?:number}) => void }} o
 */
export function createInputEcho({ root, rigHost = null, onInput }) {
  const doc = root && root.ownerDocument ? root.ownerDocument : globalThis.document;
  const win = doc && doc.defaultView ? doc.defaultView : globalThis.window;
  if (!doc || typeof doc.addEventListener !== 'function' || typeof onInput !== 'function') return { dispose() {}, pointer: () => null };
  let pointer = null;
  const downKeys = new Set();
  const send = (ev) => { try { onInput(ev); } catch (e) { console.warn('[help] echo failed', e); } };

  const onKeyDown = (e) => {
    if (isTextEntry(e.target)) return;
    const code = e.code || '';
    if (!code || e.repeat) return;
    downKeys.add(code);
    send({ device: 'kbm', code, down: true, x: pointer && pointer.x, y: pointer && pointer.y });
  };
  const onKeyUp = (e) => {
    const code = e.code || '';
    if (!code || !downKeys.has(code)) return;
    downKeys.delete(code);
    send({ device: 'kbm', code, down: false });
  };
  const inRig = (t) => {
    const host = typeof rigHost === 'function' ? rigHost() : null;
    return !!(host && t && typeof host.contains === 'function' && host.contains(t));
  };
  const isControl = (t) => !!(t && typeof t.closest === 'function' && t.closest('button, a, input, textarea, select, [role="tab"], [tabindex]:not([tabindex="-1"])'));
  const onPointerMove = (e) => { pointer = { x: e.clientX, y: e.clientY }; };
  const mouseCode = (b) => (b === 0 ? 'Mouse0' : b === 2 ? 'Mouse2' : b === 1 ? 'Mouse1' : `Mouse${b}`);
  const onPointerDown = (e) => {
    pointer = { x: e.clientX, y: e.clientY };
    if (e.pointerType && e.pointerType !== 'mouse') return;
    if (!root.contains(e.target) || isControl(e.target)) return;
    send({ device: 'kbm', code: mouseCode(e.button), down: true, x: e.clientX, y: e.clientY });
  };
  const onPointerUp = (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    send({ device: 'kbm', code: mouseCode(e.button), down: false });
  };
  const onContext = (e) => { if (inRig(e.target) || (root.contains(e.target) && !isControl(e.target))) e.preventDefault(); };
  const onBlur = () => {
    for (const code of downKeys) send({ device: 'kbm', code, down: false });
    downKeys.clear();
  };
  doc.addEventListener('keydown', onKeyDown, true);
  doc.addEventListener('keyup', onKeyUp, true);
  doc.addEventListener('pointermove', onPointerMove, { passive: true });
  root.addEventListener('pointerdown', onPointerDown);
  doc.addEventListener('pointerup', onPointerUp);
  root.addEventListener('contextmenu', onContext);
  if (win && typeof win.addEventListener === 'function') win.addEventListener('blur', onBlur);

  // Pads: poll the raw buttons only while a pad is (or was just) connected.
  let offFrame = null;
  let prev = [];
  let prevAxes = { up: false, down: false, left: false, right: false, aim: false };
  const nav = win && win.navigator ? win.navigator : globalThis.navigator;
  const readPad = () => {
    try {
      const list = nav && typeof nav.getGamepads === 'function' ? nav.getGamepads() : null;
      if (!list) return null;
      for (const p of list) if (p && p.connected !== false) return p;
    } catch (e) { /* no pad API */ }
    return null;
  };
  const poll = () => {
    const p = readPad();
    if (!p) { if (prev.length) { prev.forEach((on, i) => { if (on) send({ device: 'pad', button: PAD_STD_NAMES[i], down: false }); }); prev = []; } return true; }
    const now = (p.buttons || []).map((b) => !!(b && (b.pressed || (typeof b.value === 'number' && b.value > 0.5))));
    now.forEach((on, i) => {
      if (on === !!prev[i]) return;
      const name = PAD_STD_NAMES[i];
      if (name) send({ device: 'pad', button: name, down: on });
    });
    prev = now;
    const ax = p.axes || [];
    const dz = 0.5;
    const axes = {
      up: (ax[1] || 0) < -dz, down: (ax[1] || 0) > dz, left: (ax[0] || 0) < -dz, right: (ax[0] || 0) > dz,
      aim: Math.hypot(ax[2] || 0, ax[3] || 0) > dz,
    };
    for (const k of Object.keys(axes)) {
      if (axes[k] !== prevAxes[k]) send({ device: 'pad', axis: k, down: axes[k] });
    }
    prevAxes = axes;
    return true;
  };
  const startPoll = () => { if (!offFrame) offFrame = onFrame(poll); };
  const onConnect = () => startPoll();
  if (win && typeof win.addEventListener === 'function') win.addEventListener('gamepadconnected', onConnect);
  if (readPad()) startPoll();

  return {
    pointer: () => pointer,
    /** Poll now (tests and stills call this after stubbing navigator.getGamepads). */
    pollNow() { poll(); startPoll(); },
    dispose() {
      doc.removeEventListener('keydown', onKeyDown, true);
      doc.removeEventListener('keyup', onKeyUp, true);
      doc.removeEventListener('pointermove', onPointerMove);
      root.removeEventListener('pointerdown', onPointerDown);
      doc.removeEventListener('pointerup', onPointerUp);
      root.removeEventListener('contextmenu', onContext);
      if (win && typeof win.removeEventListener === 'function') {
        win.removeEventListener('blur', onBlur);
        win.removeEventListener('gamepadconnected', onConnect);
      }
      if (offFrame) { offFrame(); offFrame = null; }
    },
  };
}
