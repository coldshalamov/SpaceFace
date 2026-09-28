// src/ui/orrery/helpInstruments.js — Help's small instruments (design/frontend/ORRERY.md §6 Meta).
//
// Each tab of Help is its own instrument in the ORRERY grammar (light over glass, bands with body, one
// amber Hand):
// - the LOOP ORRERY: the six core loops ride a lit ring; choosing one turns the ring (with mass) until
//   that loop reaches the gate at the Hand, and its steps run out of the gate as stations on a beam;
// - the HULL DIAL: the chosen hull's produced render inside a ring of five arc gauges (hull, shield,
//   handling, cargo, price against the fleet's best), the figures rolling to their values;
// - the PRICE SCALE: every good on one logarithmic ruler, the chosen one's price band lit; you scrub the
//   ruler to pick (pointer drag or arrow keys);
// - the ORE MIX: the six asteroid types orbit a split ring of the open type's ore drops, each share a lit
//   arc with its ore on a leader.
// Plus keyGlyph(): a binding drawn as its letter over a bar of light, never a chip.

import { svg, polar, arcD, ticksD } from './svg.js';
import { createSpring, reducedMotion, onFrame } from './motion.js';
import { injectOrrery } from './tokens.js';
import { rollTo } from './text.js';
import { hullPosterUrl } from '../hullPosters.js';

const STYLE_ID = 'orr-help-instruments-style';
// Hero renders made for Help where the shared set has none (tools/art/render_hull.py, the game's own GLBs;
// assets/ui/generated/help/manifest.json). Hulls whose GLBs carry only runtime textures render blank in
// Blender, so they keep the class numeral until their renders exist.
const HELP_HULL_ROOT = new URL('../../../assets/ui/generated/help/hulls/', import.meta.url).href;
const HELP_HULLS = new Set(['ship_mule', 'ship_drifter', 'ship_hawser', 'ship_ranger']);
export function helpHullArt(shipId) {
  return hullPosterUrl(shipId, 'hero') || (HELP_HULLS.has(shipId) ? `${HELP_HULL_ROOT}${shipId}.hero.webp` : null);
}
// The asteroid types, rendered from the game's own rock bodies in their belt palette
// (tools/art/render_rock_type.py).
const ROCK_ROOT = new URL('../../../assets/ui/generated/help/rocks/', import.meta.url).href;
export function rockArt(typeId) {
  const k = String(typeId || '').replace(/^ast_/, '').replace(/_rock$|_cloud$/, '').replace('rare_', '');
  return k ? `${ROCK_ROOT}rock_${k}.webp` : null;
}
const BONE = '236 230 216';
const HOT = '248 244 234';
const ICE = '143 203 255';
const LABEL = 'font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-variation-settings:"wdth" 112, "wght" 650; font-weight:650; text-transform:uppercase;';
const BODY = 'font-family:var(--dp-face-body, "Instrument Sans"), system-ui, sans-serif;';
const f = (n) => Math.round(n * 100) / 100;

const CSS = `
.orr-hi-svg { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; pointer-events:none; }
.orr-hi-svg .orr-hi__band { fill:none; stroke:rgb(${BONE} / var(--orr-band-a, .3)); stroke-linecap:butt; }
.orr-hi-svg .orr-hi__edge { fill:none; stroke:rgb(${BONE} / .58); stroke-width:1.6px; }
.orr-hi-svg .orr-hi__notch { fill:none; stroke:rgb(5 7 10 / .92); stroke-width:1.6px; stroke-linecap:butt; }
.orr-hi-svg .orr-hi__tick { fill:none; stroke:rgb(${BONE} / .45); stroke-width:1.5px; stroke-linecap:butt; }
.orr-hi-svg .orr-hi__tick--major { stroke:rgb(${BONE} / .8); stroke-width:2px; }
.orr-hi-svg .orr-hi__lit { fill:none; stroke:rgb(${HOT}); stroke-linecap:butt; }
.orr-hi-svg .orr-hi__lit-bloom { fill:none; stroke:rgb(255 244 222 / .22); stroke-linecap:butt; }
.orr-hi-svg .orr-hi__hand { fill:none; stroke:var(--dp-hand, #f2b950); stroke-width:2.6px; stroke-linecap:round; }
.orr-hi-svg .orr-hi__hand-bloom { fill:none; stroke:rgb(242 185 80 / .24); stroke-width:11px; stroke-linecap:round; }
.orr-hi-svg .orr-hi__hand-bead { fill:var(--dp-hand-hot, #ffd98c); }
.orr-hi-svg .orr-hi__beam { fill:none; stroke:rgb(${BONE} / .55); stroke-width:2px; stroke-linecap:round; }
.orr-hi-svg .orr-hi__beam-band { fill:none; stroke:rgb(${BONE} / .2); stroke-width:8px; stroke-linecap:round; }
.orr-hi-svg .orr-hi__pulse { fill:none; stroke:rgb(236 247 255); stroke-width:3.4px; stroke-linecap:round; stroke-dasharray:.1 1.2; stroke-dashoffset:.1; animation:orr-hi-pulse 2.8s cubic-bezier(.45, 0, .55, 1) infinite; }
.orr-hi-svg .orr-hi__pulse-bloom { fill:none; stroke:rgb(${ICE} / .45); stroke-width:12px; stroke-linecap:round; stroke-dasharray:.14 1.2; stroke-dashoffset:.14; animation:orr-hi-pulse 2.8s cubic-bezier(.45, 0, .55, 1) infinite; }
@keyframes orr-hi-pulse { 0% { stroke-dashoffset:.12; opacity:0; } 8% { opacity:1; } 86% { opacity:1; } 100% { stroke-dashoffset:-1.04; opacity:0; } }
.orr-hi-rise { animation:orr-hi-rise .46s var(--dp-ease-out, ease-out) both; animation-delay:var(--orr-delay, 0ms); }
@keyframes orr-hi-rise { from { opacity:0; translate:0 6px; } to { opacity:1; translate:none; } }
html.sf-reduce-motion .orr-hi-rise { animation:none; }
html.sf-reduce-motion .orr-hi-svg .orr-hi__pulse, html.sf-reduce-motion .orr-hi-svg .orr-hi__pulse-bloom { animation:none; display:none; }

/* ---------------------------------------------------------------- LOOP ORRERY */
.orr-hloop { position:relative; width:100%; height:100%; min-height:300px; isolation:isolate; }
.orr-hloop__pool { position:absolute; border-radius:50%; pointer-events:none; z-index:-1;
  background:radial-gradient(closest-side, rgb(5 7 10 / .84), rgb(5 7 10 / .62) 60%, rgb(5 7 10 / 0)); }
.orr-hloop__body { all:unset; box-sizing:border-box; position:absolute; left:0; top:0; z-index:3; width:var(--chip, 46px); height:var(--chip, 46px);
  margin:calc(var(--chip, 46px) / -2) 0 0 calc(var(--chip, 46px) / -2); border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; color:rgb(${HOT}); }
.orr-hloop__body::before { content:""; position:absolute; inset:0; border-radius:50%; background:rgb(8 11 16); box-shadow:inset 0 0 0 2px rgb(${BONE} / .78), 0 0 0 5px rgb(5 7 10);
  transition:box-shadow .16s linear, background .16s linear; }
.orr-hloop__glyph { position:relative; z-index:1; width:52%; height:52%; display:block; }
.orr-hloop__glyph svg { width:100%; height:100%; display:block; }
.orr-hloop__body:hover::before { box-shadow:inset 0 0 0 2px rgb(255 255 255), 0 0 0 5px rgb(5 7 10); background:rgb(22 25 30); }
.orr-hloop__body:focus-visible { outline:none; }
.orr-hloop__body:focus-visible::before { box-shadow:inset 0 0 0 3px rgb(255 255 255), 0 0 0 5px rgb(5 7 10 / .9), 0 0 14px rgb(255 250 236 / .5); }
.orr-hloop__body[aria-selected="true"]::before { background:rgb(${HOT}); box-shadow:0 0 0 5px rgb(5 7 10 / .9), 0 0 18px rgb(255 244 222 / .5); }
.orr-hloop__body[aria-selected="true"] { color:#15120d; }
.orr-hloop__name { position:absolute; left:0; top:0; ${LABEL} font-size:clamp(12px, .66vw, 16px); letter-spacing:.14em; line-height:1.25; color:rgb(${BONE} / .82); white-space:nowrap; pointer-events:none;
  text-shadow:0 0 8px rgb(4 6 9 / .95); transition:color .16s linear, opacity .16s linear; }
.orr-hloop__name.is-hot { color:rgb(255 255 255); }
.orr-hloop__hub { position:absolute; z-index:2; transform:translate(-50%, -50%); display:flex; flex-direction:column; align-items:center; gap:10px; pointer-events:none; text-align:center; color:rgb(${HOT}); }
.orr-hloop__hubglyph { display:block; filter:drop-shadow(0 0 16px rgb(255 244 222 / .32)); }
.orr-hloop__hubglyph svg { width:100%; height:100%; display:block; }
.orr-hloop__of { ${LABEL} font-size:clamp(12px, .6vw, 15px); letter-spacing:.3em; color:rgb(${BONE} / .76); }
.orr-hloop__read { position:absolute; z-index:2; display:flex; flex-direction:column; gap:0; }
.orr-hloop__read::before { content:""; position:absolute; z-index:-1; left:-40px; right:-60px; top:-30px; bottom:-30px; pointer-events:none;
  background:radial-gradient(closest-side, rgb(5 7 10 / .7), rgb(5 7 10 / .4) 60%, rgb(5 7 10 / 0)); }
.orr-hloop__kicker { margin:0 0 8px; ${LABEL} font-size:clamp(12px, .6vw, 15px); letter-spacing:.26em; color:rgb(${BONE} / .76); }
.orr-hloop__title { margin:0 0 16px; font-family:var(--dp-face-display, "Archivo"); font-stretch:125%; font-variation-settings:"wdth" 125, "wght" 800; font-weight:800;
  font-size:clamp(24px, 2vw, 40px); line-height:1; letter-spacing:.02em; text-transform:uppercase; color:rgb(${HOT}); }
.orr-hloop__steps { list-style:none; margin:0; padding:0; position:relative; }
.orr-hloop__step { position:relative; display:flex; align-items:center; gap:14px; padding:9px 0 9px 40px; ${BODY} font-size:clamp(15px, .8vw, 19px); line-height:1.35; color:rgb(${HOT}); }
.orr-hloop__step > b { ${LABEL} font-size:clamp(12px, .6vw, 15px); letter-spacing:.12em; color:rgb(${BONE} / .78); font-variant-numeric:tabular-nums; flex:none; width:22px; }
.orr-hloop__step > span { display:inline-flex; flex-wrap:wrap; align-items:baseline; gap:0 .35em; }
.orr-hloop__step .orr-hkey { font-size:clamp(15px, .8vw, 19px); padding-bottom:6px; }
.orr-hloop__why { margin:22px 0 0; max-width:520px; ${BODY} font-size:clamp(14px, .76vw, 18px); line-height:1.5; color:rgb(${BONE} / .86); }
.orr-hloop__why::before { content:"Why it pays"; display:block; margin:0 0 6px; ${LABEL} font-size:clamp(12px, .6vw, 15px); letter-spacing:.24em; color:rgb(${BONE} / .76); }
.orr-hloop__orbit-pulse { fill:none; stroke:rgb(236 247 255); stroke-width:3px; stroke-linecap:round; stroke-dasharray:.05 .95; animation:orr-hloop-orbit 7s linear infinite; }
.orr-hloop__orbit-pulse-bloom { fill:none; stroke:rgb(${ICE} / .42); stroke-width:12px; stroke-linecap:round; stroke-dasharray:.07 .93; animation:orr-hloop-orbit 7s linear infinite; }
@keyframes orr-hloop-orbit { from { stroke-dashoffset:1; } to { stroke-dashoffset:0; } }
html.sf-reduce-motion .orr-hloop__orbit-pulse, html.sf-reduce-motion .orr-hloop__orbit-pulse-bloom { display:none; }
.orr-hloop.is-small .orr-hloop__name { white-space:normal; width:max-content; max-width:132px; }
.orr-hloop.is-small .orr-hloop__of { display:none; }
.orr-hloop.is-off > * { display:none; }

/* ---------------------------------------------------------------- HULL DIAL */
.orr-hdial { position:relative; width:100%; height:100%; min-height:280px; isolation:isolate; }
.orr-hdial__pool { position:absolute; border-radius:50%; pointer-events:none; z-index:-1;
  background:radial-gradient(closest-side, rgb(5 7 10 / .84), rgb(5 7 10 / .62) 60%, rgb(5 7 10 / 0)); }
.orr-hdial__art { position:absolute; z-index:1; pointer-events:none; object-fit:contain; opacity:0; transition:opacity .4s var(--dp-ease-out, ease-out), transform .6s var(--dp-ease-out, ease-out);
  filter:drop-shadow(0 16px 22px rgb(0 0 0 / .65)); }
.orr-hdial__art.is-ready { opacity:1; }
.orr-hdial__tier { position:absolute; z-index:1; transform:translate(-50%, -50%); display:flex; flex-direction:column; align-items:center; gap:10px; pointer-events:none; }
.orr-hdial__tier > b { font-family:var(--dp-face-numeral, "Archivo"); font-stretch:100%; font-variation-settings:"wdth" 100, "wght" 250; font-weight:250; line-height:.86; letter-spacing:-.02em; color:var(--dp-phos, #dfeeff); }
.orr-hdial__tier > span { ${LABEL} font-size:clamp(12px, .64vw, 16px); letter-spacing:.3em; color:rgb(${BONE} / .76); }
.orr-hdial__g { position:absolute; z-index:2; display:flex; flex-direction:column; gap:3px; pointer-events:none; white-space:nowrap; }
.orr-hdial__g.is-left { align-items:flex-end; text-align:right; }
.orr-hdial__g-name { ${LABEL} font-size:clamp(12px, .6vw, 15px); letter-spacing:.22em; color:rgb(${BONE} / .74); }
.orr-hdial__g-val { font-family:var(--dp-face-numeral, "Archivo"); font-stretch:100%; font-variation-settings:"wdth" 100, "wght" 250; font-weight:250; font-size:clamp(30px, 2.1vw, 48px);
  line-height:1; letter-spacing:-.01em; color:rgb(${HOT}); font-variant-numeric:tabular-nums; }
.orr-hdial__g-val small { font-size:.5em; margin-left:4px; ${LABEL} letter-spacing:.14em; color:rgb(${BONE} / .76); }
.orr-hdial .orr-hdial__gain { fill:none; stroke:rgb(${HOT}); stroke-linecap:butt; }
.orr-hdial .orr-hdial__gain-bloom { fill:none; stroke:rgb(255 244 222 / .25); stroke-linecap:round; }
.orr-hdial .orr-hi__lit-bloom { stroke-linecap:round; }
.orr-hdial .orr-hdial__loss { fill:none; stroke:rgb(${BONE} / .9); stroke-linecap:butt; }
.orr-hdial .orr-hdial__loss-cut { fill:none; stroke:rgb(5 7 10); stroke-linecap:butt; }
.orr-hdial .orr-hi-svg text.orr-hdial__end, .orr-hdial text.orr-hdial__end { font-family:var(--dp-face-label, "Archivo"); font-size:12px; font-weight:650; letter-spacing:.16em; text-transform:uppercase; fill:rgb(${BONE} / .8); }
.orr-hdial .orr-hdial__ref { fill:rgb(5 7 10); stroke:rgb(${BONE} / .9); stroke-width:2px; }
.orr-hdial__g-val.is-long { font-size:clamp(26px, 1.6vw, 36px); }
.orr-hdial__g-delta { font-family:var(--dp-face-numeral, "Archivo"); font-variation-settings:"wdth" 100, "wght" 420; font-size:clamp(13px, .72vw, 17px); letter-spacing:.02em;
  color:rgb(${BONE} / .74); font-variant-numeric:tabular-nums; white-space:nowrap; }
.orr-hdial__g-delta.is-better { color:rgb(255 255 255); }
.orr-hdial__g-delta.is-worse { color:rgb(${BONE} / .74); }
.orr-hdial__vs { position:absolute; z-index:2; transform:translate(-50%, -100%); display:flex; align-items:center; gap:10px; white-space:nowrap; pointer-events:none; }
.orr-hdial__vs-k { ${LABEL} font-size:clamp(12px, .6vw, 15px); letter-spacing:.24em; color:rgb(${BONE} / .76); }
.orr-hdial__vs b { ${LABEL} font-size:clamp(12px, .64vw, 16px); letter-spacing:.2em; color:rgb(${HOT}); }
.orr-hdial__vs-bead { display:block; width:9px; height:9px; border-radius:50%; box-shadow:inset 0 0 0 2px rgb(${BONE} / .9); background:rgb(5 7 10); }
.orr-hdial__art.is-swing { transition:none; transform:translateX(18px); opacity:0; }
.orr-hdial.is-off > * { display:none; }

/* ---------------------------------------------------------------- PRICE DIAL */
.orr-hpdial { position:relative; width:100%; height:100%; min-height:300px; isolation:isolate; cursor:grab; outline:none; touch-action:none; }
.orr-hpdial.is-turning { cursor:grabbing; }
.orr-hpdial__pool { position:absolute; border-radius:50%; pointer-events:none; z-index:-1;
  background:radial-gradient(closest-side, rgb(5 7 10 / .84), rgb(5 7 10 / .62) 60%, rgb(5 7 10 / 0)); }
.orr-hpdial__hub { position:absolute; z-index:2; transform:translate(-50%, -50%); display:flex; flex-direction:column; align-items:center; gap:6px; pointer-events:none; color:rgb(${HOT}); text-align:center; }
.orr-hpdial__glyph { display:block; filter:drop-shadow(0 0 14px rgb(255 244 222 / .3)); }
.orr-hpdial__glyph svg { width:100%; height:100%; display:block; stroke-width:1.05px; }
.orr-hpdial__glyph svg :is(path, rect, circle, ellipse) { fill:rgb(${HOT} / .13); }
.orr-hpdial__glyph.is-foe { color:#ff7a66; }
.orr-hpdial__price { display:flex; align-items:flex-end; gap:8px; margin-top:6px; }
.orr-hpdial__price b { font-family:var(--dp-face-numeral, "Archivo"); font-stretch:100%; font-variation-settings:"wdth" 100, "wght" 250; font-weight:250; line-height:.9;
  letter-spacing:-.02em; color:var(--dp-phos, #dfeeff); font-variant-numeric:tabular-nums lining-nums; }
.orr-hpdial__price small { ${LABEL} font-size:clamp(12px, .6vw, 15px); letter-spacing:.2em; color:rgb(${BONE} / .8); padding-bottom:.5em; }
.orr-hpdial__name { ${LABEL} font-size:clamp(12px, .64vw, 16px); letter-spacing:.2em; color:rgb(${HOT}); }
.orr-hpdial__hint { position:absolute; transform:translateX(-50%); ${LABEL} font-size:clamp(12px, .6vw, 15px); letter-spacing:.24em; color:rgb(${BONE} / .74); white-space:nowrap; pointer-events:none; }
.orr-hpdial .orr-hi-svg text.orr-hpdial__decade { font-family:var(--dp-face-label, "Archivo"); font-size:12px; font-weight:650; letter-spacing:.12em; fill:rgb(${BONE} / .82); }
.orr-hpdial .orr-hpdial__good { stroke:rgb(${BONE} / .78); stroke-width:2px; stroke-linecap:butt; }
.orr-hpdial .orr-hpdial__good.is-foe { stroke:rgb(255 110 90 / .95); }
.orr-hpdial .orr-hpdial__good.is-out { stroke:rgb(${BONE} / .18); }
.orr-hpdial .orr-hpdial__good.is-chosen { stroke:rgb(255 255 255); stroke-width:3px; }
.orr-hpdial .orr-hpdial__index { stroke:rgb(${HOT}); stroke-width:2.5px; stroke-linecap:round; }
.orr-hpdial .orr-hpdial__index-bloom { stroke:rgb(255 244 222 / .22); stroke-width:10px; stroke-linecap:round; }
.orr-hpdial .orr-hpdial__index-bead { fill:rgb(${HOT}); }
.orr-hpdial:focus-visible .orr-hpdial__index, .orr-hpdial.is-turning .orr-hpdial__index { stroke:rgb(255 255 255); stroke-width:3.5px; }
.orr-hpdial.is-off > * { display:none; }

/* ---------------------------------------------------------------- ORE MIX */
.orr-hmix { position:relative; width:100%; height:100%; min-height:300px; isolation:isolate; }
.orr-hmix__pool { position:absolute; border-radius:50%; pointer-events:none; z-index:-1;
  background:radial-gradient(closest-side, rgb(5 7 10 / .84), rgb(5 7 10 / .62) 60%, rgb(5 7 10 / 0)); }
.orr-hmix__rock { all:unset; box-sizing:border-box; position:absolute; left:0; top:0; z-index:3; border-radius:50%; cursor:pointer; }
.orr-hmix__rock::before { content:""; position:absolute; inset:-5px; border-radius:50%; background:rgb(5 7 10 / .9); box-shadow:inset 0 0 0 1.5px rgb(${BONE} / .4); transition:box-shadow .16s, background .16s; }
.orr-hmix__thumb { position:relative; display:block; width:118%; height:118%; margin:-9%; object-fit:contain; pointer-events:none; opacity:.78; transition:opacity .16s linear, transform .3s var(--dp-ease-over, ease-out); }
.orr-hmix__rock:hover .orr-hmix__thumb { opacity:1; transform:scale(1.08); }
.orr-hmix__rock:focus-visible { outline:none; }
.orr-hmix__rock:focus-visible::before { box-shadow:inset 0 0 0 3px rgb(255 255 255), 0 0 12px rgb(255 250 236 / .5); }
.orr-hmix__rock[aria-pressed="true"]::before { box-shadow:inset 0 0 0 2.5px rgb(${HOT}), 0 0 16px rgb(255 244 222 / .4); }
.orr-hmix__rock[aria-pressed="true"] .orr-hmix__thumb { opacity:1; }
.orr-hmix__rockart { position:absolute; z-index:1; pointer-events:none; object-fit:contain; opacity:0; transition:opacity .4s var(--dp-ease-out, ease-out);
  animation:orr-hmix-drift 900s linear infinite; filter:drop-shadow(0 18px 26px rgb(0 0 0 / .6)); }
.orr-hmix__rockart.is-ready { opacity:1; }
@keyframes orr-hmix-drift { to { transform:rotate(360deg); } }
html.sf-reduce-motion .orr-hmix__rockart { animation:none; }
.orr-hmix__rock.is-above .orr-hmix__rock-name { top:auto; bottom:calc(100% + 10px); }
.orr-hmix__rock-name { position:absolute; left:50%; top:calc(100% + 10px); transform:translateX(-50%); ${LABEL} font-size:clamp(12px, .6vw, 15px); letter-spacing:.16em; color:rgb(${BONE} / .8); white-space:nowrap; pointer-events:none; text-shadow:0 0 8px rgb(4 6 9 / .95); }
.orr-hmix__rock[aria-pressed="true"] .orr-hmix__rock-name, .orr-hmix__rock:is(:hover, :focus-visible) .orr-hmix__rock-name { color:rgb(255 255 255); }
.orr-hmix__centre { position:absolute; z-index:2; transform:translate(-50%, -50%); display:flex; flex-direction:column; align-items:center; gap:4px; pointer-events:none; text-align:center; }
.orr-hmix__centre > b { line-height:1.05; font-family:var(--dp-face-display, "Archivo"); font-stretch:125%; font-variation-settings:"wdth" 125, "wght" 800; font-weight:800; font-size:clamp(16px, 1.1vw, 24px); letter-spacing:.06em; text-transform:uppercase; color:rgb(${HOT}); }
.orr-hmix__centre > span { ${LABEL} font-size:clamp(12px, .6vw, 15px); letter-spacing:.22em; color:rgb(${BONE} / .76); white-space:nowrap; }
.orr-hmix.is-small .orr-hmix__centre > span { letter-spacing:.14em; }
.orr-hmix__lbl { all:unset; box-sizing:border-box; position:absolute; z-index:3; display:flex; flex-direction:column; gap:1px; white-space:nowrap; cursor:pointer; }
.orr-hmix__lbl.is-left { align-items:flex-end; text-align:right; }
.orr-hmix__lbl-name { ${BODY} font-size:clamp(14px, .74vw, 18px); color:rgb(${HOT}); line-height:1.2; }
.orr-hmix__lbl-pc { font-family:var(--dp-face-numeral, "Archivo"); font-variation-settings:"wdth" 100, "wght" 400; font-size:clamp(13px, .7vw, 17px); color:rgb(${BONE} / .78); font-variant-numeric:tabular-nums; }
.orr-hmix__lbl:is(:hover, :focus-visible) .orr-hmix__lbl-name { color:rgb(255 255 255); text-decoration:underline 2px rgb(255 255 255 / .6); text-underline-offset:4px; outline:none; }
.orr-hmix__lbl.is-chosen .orr-hmix__lbl-name { color:rgb(255 255 255); font-weight:600; }
.orr-hmix__lbl.is-chosen .orr-hmix__lbl-pc { color:rgb(${HOT}); }
.orr-hmix.is-small .orr-hmix__centre > b { font-size:14px; white-space:nowrap; }
.orr-hmix.is-off > * { display:none; }

`;

function injectStyle(doc) {
  if (!doc || !doc.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

function canDraw(host) {
  const doc = host && host.ownerDocument ? host.ownerDocument : globalThis.document;
  return !!(host && doc && typeof doc.createElementNS === 'function' && typeof host.getBoundingClientRect === 'function') ? doc : null;
}

function observe(host, fn) {
  let frame = 0;
  const schedule = () => {
    if (frame) return;
    const raf = globalThis.requestAnimationFrame;
    if (typeof raf === 'function') frame = raf(() => { frame = 0; fn(); });
    else fn();
  };
  let ro = null;
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(schedule); ro.observe(host); }
  return {
    schedule,
    stop() { if (ro) ro.disconnect(); if (frame && typeof globalThis.cancelAnimationFrame === 'function') globalThis.cancelAnimationFrame(frame); frame = 0; },
  };
}

function rise(node, delay, on) {
  if (!on) return node;
  node.classList.add('orr-hi-rise');
  node.style.setProperty('--orr-delay', `${delay}ms`);
  return node;
}

/** A band ring with ticks cut through it (an annulus you could grip), plus its edges. */
function bandRing(g, cx, cy, r, w, { a = 0.3, notches = 72, from = 0, to = 360 } = {}) {
  g.appendChild(svg('path', { d: arcD(cx, cy, r, from, to), class: 'orr-hi__band', style: `stroke-width:${w}px; --orr-band-a:${a}` }));
  if (notches) g.appendChild(svg('path', { d: ticksD(cx, cy, r + w / 2, notches, { len: w, inward: true, from, to }), class: 'orr-hi__notch' }));
  g.appendChild(svg('path', { d: arcD(cx, cy, r + w / 2, from, to), class: 'orr-hi__edge' }));
  g.appendChild(svg('path', { d: arcD(cx, cy, r - w / 2, from, to), class: 'orr-hi__edge', style: 'stroke:rgb(236 230 216 / .34)' }));
}

/** A key glyph: the key's letter over a bar of light (never a chip). A sentence reads as quiet text. */
export function keyGlyph(label, { small = false } = {}) {
  const doc = globalThis.document;
  const node = doc.createElement('span');
  const text = String(label == null ? '' : label).trim();
  const none = !text || text === '—' || text === '-';
  const keyParts = text.split(/\s+\/\s+|\//).map((q) => q.trim()).filter(Boolean);
  const isKeys = keyParts.length > 1 && keyParts.every((q) => q.length <= 9 && !/\s\S+\s/.test(q));
  const sentence = !none && !isKeys && (text.length > 16 || /[:(]|when |button|prompted|->|near |target |then /i.test(text));
  node.className = 'orr-hkey' + (small ? ' orr-hkey--small' : '') + (none ? ' orr-hkey--none' : '') + (sentence ? ' orr-hkey--text' : '');
  if (none) { node.textContent = 'not bound'; node.classList.add('orr-hkey--word'); return node; }
  if (sentence) { node.textContent = text; return node; }
  const parts = text.split(/\s+\/\s+|\//).map((s) => s.trim()).filter(Boolean);
  if (parts.length > 1 && parts.every((p) => p.length <= 9)) {
    parts.forEach((p, i) => {
      if (i) { const sep = doc.createElement('span'); sep.className = 'orr-hkey__sep'; sep.textContent = '·'; node.appendChild(sep); }
      node.appendChild(doc.createTextNode(p));
    });
    if (parts.some((p) => p.length > 3)) node.classList.add('orr-hkey--word');
    return node;
  }
  node.textContent = text;
  if (text.length > 3) node.classList.add('orr-hkey--word');
  return node;
}

// ================================================================================================
// LOOP ORRERY

// The six loops' pictograms, in the interface's icon hand (24 grid, round caps): the berth you dock at,
// the trade that crosses it, the rock you mine, the wrench you refit with, the recovery arrow, the
// reticle you track by.
export const LOOP_GLYPHS = Object.freeze({
  dock: '<path d="M16.4 9.4A6.6 6.6 0 1 0 16.4 14.6"/><circle cx="10.6" cy="12" r="2.2"/><path d="M22 8.8 17.2 12 22 15.2 20.6 12Z"/>',
  trade: '<path d="M5 9h13.5l-3.5-3.5"/><path d="M19 15H5.5L9 18.5"/><circle cx="12" cy="12" r="1.4"/>',
  mine: '<path d="m5 15.5 2.6-6.2 6-2.3 5 3.6-.8 6.2-6.3 2.4Z"/><path d="m13.6 7 4.6-4.4M9.5 12.5l3 2"/>',
  refit: '<path d="M14.8 4.4a4.2 4.2 0 0 0-5 5.5L4.2 15.5l4.3 4.3 5.6-5.6a4.2 4.2 0 0 0 5.5-5l-2.8 2.8-3.1-.4-.4-3.1Z"/>',
  recover: '<path d="M19 12a7 7 0 1 1-2.2-5.1"/><path d="M19.3 4.2v4.3H15"/><path d="M12 9.2v5.6M9.2 12h5.6"/>',
  track: '<circle cx="12" cy="12" r="6.6"/><circle cx="12" cy="12" r="1.8"/><path d="M12 2.8v3.4M12 17.8v3.4M2.8 12h3.4M17.8 12h3.4"/>',
});

// chip-size variants where the hub drawing is too busy to read at ~20px
const LOOP_GLYPHS_CHIP = Object.freeze({
  dock: '<path d="M16 8.2A6.4 6.4 0 1 0 16 15.8"/><path d="M21.5 8.6 16.8 12 21.5 15.4"/>',
});
function loopGlyphSvg(key, chip = false) {
  const d = (chip && LOOP_GLYPHS_CHIP[key]) || LOOP_GLYPHS[key] || LOOP_GLYPHS.track;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${chip ? 2 : 1.4}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
}

/** A step's words, with any key it names drawn as a key glyph ("E near a station", "Mission Log (J)"). */
function stepNodes(doc, text) {
  const out = [];
  const src = String(text || '');
  const lead = /^([A-Z0-9]{1,2}) (?=[a-z])/.exec(src);
  let rest = src;
  if (lead) { out.push(keyGlyph(lead[1], { small: true })); rest = src.slice(lead[0].length); }
  const parts = rest.split(/\(([A-Z0-9]{1,3})\)/);
  parts.forEach((p, i) => {
    if (i % 2) { out.push(keyGlyph(p, { small: true })); return; }
    const t = p.trim();
    if (t) out.push(doc.createTextNode(i === 0 && !lead ? t.charAt(0).toUpperCase() + t.slice(1) : t));
  });
  return out;
}

/**
 * The six core loops ride a lit ring, each a chip carrying its pictogram; a pulse of light runs the
 * ring clockwise, because the loops feed one another. Choosing one turns the ring (with mass) until
 * that loop reaches the gate at the Hand; its pictogram stands in the hub, and its steps run out of
 * the gate as stations on a beam, first step first.
 * @param {HTMLElement} host
 * @param {{ loops: {id:string,name:string,glyph:string,steps:string[],why:string}[], onPick: (index:number) => void }} o
 */
export function createLoopOrrery(host, { loops = [], onPick = () => {} } = {}) {
  const doc = canDraw(host);
  const inert = { set() {}, dispose() {} };
  if (!doc || !loops.length) return inert;
  injectOrrery(doc);
  injectStyle(doc);
  host.classList.add('orr-hloop', 'is-off');
  const n = loops.length;
  const STEP = 360 / n;
  const GATE = 90;
  const pool = doc.createElement('i'); pool.className = 'orr-hloop__pool';
  const under = svg('svg', { class: 'orr-hi-svg', 'aria-hidden': 'true', focusable: 'false' });
  const over = svg('svg', { class: 'orr-hi-svg', 'aria-hidden': 'true', focusable: 'false', style: 'z-index:2' });
  const hub = doc.createElement('div'); hub.className = 'orr-hloop__hub';
  const hubGlyph = doc.createElement('span'); hubGlyph.className = 'orr-hloop__hubglyph';
  const of = doc.createElement('span'); of.className = 'orr-hloop__of';
  hub.append(hubGlyph, of);
  const read = doc.createElement('div'); read.className = 'orr-hloop__read'; read.setAttribute('aria-live', 'polite');
  const kicker = doc.createElement('p'); kicker.className = 'orr-hloop__kicker';
  const title = doc.createElement('h2'); title.className = 'orr-hloop__title';
  const steps = doc.createElement('ol'); steps.className = 'orr-hloop__steps';
  const why = doc.createElement('p'); why.className = 'orr-hloop__why';
  read.append(kicker, title, steps, why);
  const group = doc.createElement('div');
  group.setAttribute('role', 'listbox');
  group.setAttribute('aria-label', 'Core loops');
  group.style.cssText = 'position:absolute; inset:0; pointer-events:none;';
  const names = [];
  const bodies = loops.map((loop, i) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'orr-hloop__body';
    b.setAttribute('role', 'option');
    b.dataset.loop = String(i);
    b.dataset.action = 'help-loop:' + i;
    b.style.pointerEvents = 'auto';
    const glyph = doc.createElement('span'); glyph.className = 'orr-hloop__glyph'; glyph.innerHTML = loopGlyphSvg(loop.glyph, true);
    b.appendChild(glyph);
    b.setAttribute('aria-label', `${i + 1}. ${loop.name}`);
    b.addEventListener('click', () => onPick(i));
    b.addEventListener('pointerenter', () => names[i].classList.add('is-hot'));
    b.addEventListener('pointerleave', () => names[i].classList.toggle('is-hot', i === selected));
    b.addEventListener('keydown', (ev) => {
      const dir = ev.key === 'ArrowDown' || ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowUp' || ev.key === 'ArrowLeft' ? -1 : 0;
      if (!dir) return;
      ev.preventDefault();
      const next = (i + dir + n) % n;
      onPick(next);
      const nb = bodies[next];
      if (nb && typeof nb.focus === 'function') nb.focus();
    });
    group.appendChild(b);
    const name = doc.createElement('span'); name.className = 'orr-hloop__name'; name.textContent = loop.name; name.setAttribute('aria-hidden', 'true');
    names.push(name);
    return b;
  });
  const nameLayer = doc.createElement('div');
  nameLayer.style.cssText = 'position:absolute; inset:0; pointer-events:none; z-index:3;';
  nameLayer.append(...names);
  host.append(pool, under, over, hub, read, group, nameLayer);

  let selected = 0;
  let geo = null;
  let arrived = false;
  let beamG = null;
  let tickG = null;
  let wheelAt = 0;
  const spring = createSpring({ value: 0, preset: 'swing', onUpdate: (v) => paintBodies(v) });

  function paintBodies(v) {
    if (!geo) return;
    const { cx, cy, R, chip } = geo;
    bodies.forEach((b, i) => {
      const deg = GATE + (i - v) * STEP;
      const [x, y] = polar(cx, cy, R, deg);
      b.style.left = `${f(x)}px`;
      b.style.top = `${f(y)}px`;
      // the name stands radially outside its own chip, anchored on the side facing the chip
      const [lx, ly] = polar(cx, cy, R + chip / 2 + 12, deg);
      const a = (deg * Math.PI) / 180;
      const tx = -50 + Math.sin(a) * 50;
      const ty = -50 - Math.cos(a) * 50;
      const name = names[i];
      name.style.transform = `translate(${f(lx)}px, ${f(ly)}px) translate(${f(tx)}%, ${f(ty)}%)`;
      name.style.textAlign = Math.sin(a) > 0.3 ? 'left' : Math.sin(a) < -0.3 ? 'right' : 'center';
      // the loop at the gate is named in the reading, so its ring name rests
      const off = ((((deg - GATE) % 360) + 540) % 360) - 180;
      name.style.opacity = Math.abs(off) < 34 ? '0' : '1';
    });
    if (tickG) tickG.setAttribute('transform', `rotate(${f(-v * STEP)} ${f(cx)} ${f(cy)})`);
  }

  function paintRead(swing) {
    const loop = loops[selected];
    kicker.textContent = `Loop ${String(selected + 1).padStart(2, '0')} of ${String(n).padStart(2, '0')}`;
    title.textContent = loop.name;
    hubGlyph.innerHTML = loopGlyphSvg(loop.glyph);
    of.textContent = `Loop ${String(selected + 1).padStart(2, '0')} · ${String(n).padStart(2, '0')}`;
    steps.textContent = '';
    loop.steps.forEach((s, i) => {
      const li = doc.createElement('li');
      li.className = 'orr-hloop__step';
      const num = doc.createElement('b'); num.textContent = String(i + 1).padStart(2, '0');
      const t = doc.createElement('span');
      t.append(...stepNodes(doc, s));
      li.append(num, t);
      rise(li, 80 + i * 70, swing && !reducedMotion());
      steps.appendChild(li);
    });
    why.textContent = loop.why;
    bodies.forEach((b, i) => { b.setAttribute('aria-selected', String(i === selected)); b.tabIndex = i === selected ? 0 : -1; });
    names.forEach((nm, i) => nm.classList.toggle('is-hot', i === selected));
  }

  // The steps run out of the gate: the first step stands level with it, a trunk carries the light
  // from the gate to the beam, and one pulse runs the whole way, gate first, last step last.
  function paintBeam() {
    if (!geo || !beamG) return;
    beamG.textContent = '';
    const { cx, cy, R, chip } = geo;
    const items = [...steps.children];
    if (!items.length) return;
    const first = items[0];
    const firstMid = steps.offsetTop + first.offsetTop + first.offsetHeight / 2;
    read.style.top = `${f(Math.max(0, Math.min(geo.H - read.offsetHeight, cy - firstMid)))}px`;
    const hostBox = host.getBoundingClientRect();
    const ys = items.map((li) => { const r = li.getBoundingClientRect(); return r.top - hostBox.top + r.height / 2; });
    const xs = read.getBoundingClientRect().left - hostBox.left + 14;
    const [gx, gy] = polar(cx, cy, R + chip / 2 + 4, GATE);
    const top = ys[0];
    const bottom = ys[ys.length - 1];
    const run = Math.abs(top - gy) < 2
      ? `M ${f(gx)} ${f(gy)} L ${f(xs)} ${f(gy)} L ${f(xs)} ${f(bottom)}`
      : `M ${f(gx)} ${f(gy)} L ${f(xs - 14)} ${f(gy)} Q ${f(xs)} ${f(gy)} ${f(xs)} ${f(gy + Math.sign(top - gy) * 14)} L ${f(xs)} ${f(top)} L ${f(xs)} ${f(bottom)}`;
    beamG.appendChild(svg('path', { d: run, class: 'orr-hi__beam-band' }));
    beamG.appendChild(svg('path', { d: run, class: 'orr-hi__beam' }));
    beamG.appendChild(svg('path', { d: run, class: 'orr-hi__pulse-bloom', pathLength: 1 }));
    beamG.appendChild(svg('path', { d: run, class: 'orr-hi__pulse', pathLength: 1 }));
    ys.forEach((y) => {
      beamG.appendChild(svg('circle', { cx: f(xs), cy: f(y), r: 7.5, fill: 'rgb(5 7 10)', stroke: `rgb(${BONE} / .82)`, 'stroke-width': 2 }));
      beamG.appendChild(svg('circle', { cx: f(xs), cy: f(y), r: 2.8, fill: `rgb(${HOT})` }));
    });
  }

  function layout() {
    const W = host.clientWidth || 0;
    const H = host.clientHeight || 0;
    if (W < 360 || H < 260) { host.classList.add('is-off'); geo = null; return; }
    host.classList.remove('is-off');
    const small = W < 900 || H < 480;
    host.classList.toggle('is-small', small);
    const bandW = small ? 12 : 14;
    const chip = small ? 44 : Math.round(Math.max(56, Math.min(72, H * 0.066)));
    // the widest name on the ring decides how much room the ring leaves for its words
    let nameW = 0;
    for (const nm of names) nameW = Math.max(nameW, nm.offsetWidth || 0);
    if (!nameW) nameW = small ? 170 : 220;
    const nameRoom = Math.min(nameW + 16, small ? 180 : 250);
    const R = Math.max(110, Math.min(H * 0.36, W * 0.21, (W - nameRoom - 460) / 2));
    const cx = nameRoom + R + chip / 2;
    const cy = H / 2;
    geo = { W, H, R, cx, cy, bandW, small, chip };
    host.style.setProperty('--chip', `${chip}px`);
    under.setAttribute('viewBox', `0 0 ${W} ${H}`);
    over.setAttribute('viewBox', `0 0 ${W} ${H}`);
    under.textContent = '';
    over.textContent = '';
    const arriveNow = !arrived && !reducedMotion();
    const pd = R * 3;
    Object.assign(pool.style, { left: `${f(cx - pd / 2)}px`, top: `${f(cy - pd / 2)}px`, width: `${f(pd)}px`, height: `${f(pd)}px` });
    const g = svg('g', {});
    bandRing(g, cx, cy, R, bandW, { a: 0.3, notches: 72 });
    // the loops feed one another: a pulse runs the ring clockwise
    const orbit = arcD(cx, cy, R, -90, 270);
    g.appendChild(svg('path', { d: orbit, class: 'orr-hloop__orbit-pulse-bloom', pathLength: 1 }));
    g.appendChild(svg('path', { d: orbit, class: 'orr-hloop__orbit-pulse', pathLength: 1 }));
    // the hub's ring: a band with body, a tick under every loop (it turns with the ring)
    const hubR = R * 0.56;
    g.appendChild(svg('path', { d: arcD(cx, cy, hubR, 0, 360), class: 'orr-hi__band', style: 'stroke-width:7px; --orr-band-a:.15' }));
    g.appendChild(svg('path', { d: arcD(cx, cy, hubR, 0, 360), class: 'orr-hi__edge', style: 'stroke:rgb(236 230 216 / .5)' }));
    tickG = svg('g', {});
    const tickParts = [];
    for (let i = 0; i < n; i += 1) {
      const [t0x, t0y] = polar(cx, cy, hubR - 6, GATE + i * STEP);
      const [t1x, t1y] = polar(cx, cy, hubR + 8, GATE + i * STEP);
      tickParts.push(`M ${f(t0x)} ${f(t0y)} L ${f(t1x)} ${f(t1y)}`);
    }
    tickG.appendChild(svg('path', { d: tickParts.join(' '), class: 'orr-hi__tick orr-hi__tick--major' }));
    g.appendChild(tickG);
    const drift = svg('g', { class: 'orr-drift', style: `transform-origin:${f(cx)}px ${f(cy)}px; --orr-drift-s:600s` });
    drift.appendChild(svg('path', { d: ticksD(cx, cy, R + bandW / 2 + 12, 120, { len: 3, major: 10, majorLen: 7, inward: false }), class: 'orr-hi__tick', style: 'stroke:rgb(236 230 216 / .3)' }));
    g.appendChild(drift);
    under.appendChild(rise(g, 0, arriveNow));
    // the Hand: it pivots on the hub's ring and reaches the gate -- the screen's one amber
    const hg = svg('g', {});
    const [h0x, h0y] = polar(cx, cy, hubR, GATE);
    const [h1x, h1y] = polar(cx, cy, R - chip / 2 - 8, GATE);
    hg.appendChild(svg('path', { d: `M ${f(h0x)} ${f(h0y)} L ${f(h1x)} ${f(h1y)}`, class: 'orr-hi__hand-bloom', style: 'stroke-width:9px' }));
    hg.appendChild(svg('path', { d: `M ${f(h0x)} ${f(h0y)} L ${f(h1x)} ${f(h1y)}`, class: 'orr-hi__hand', style: 'stroke-width:3px' }));
    hg.appendChild(svg('circle', { cx: f(h0x), cy: f(h0y), r: 6, class: 'orr-hi__hand-bead' }));
    over.appendChild(rise(hg, 360, arriveNow));
    beamG = svg('g', {});
    over.appendChild(beamG);
    // the hub holds the chosen loop's pictogram
    const gs = Math.round(hubR * (small ? 1.12 : 1.18));
    // a small hub holds the pictogram alone
    of.style.display = hubR < 120 ? 'none' : '';
    hub.style.top = `${f(cy + (hubR < 120 ? 0 : 10))}px`;
    hub.style.left = `${f(cx)}px`;
    hub.style.top = `${f(cy + (small ? 0 : 10))}px`;
    hubGlyph.style.width = `${gs}px`;
    hubGlyph.style.height = `${gs}px`;
    // the reading stands right of the gate and right of the names on the ring's east side
    const eastReach = cx + (R + chip / 2 + 12) * Math.sin(Math.PI / 6) + nameW * 0.75 + 24;
    const readLeft = Math.max(cx + R + chip / 2 + (small ? 60 : 90), eastReach);
    Object.assign(read.style, { left: `${f(readLeft)}px`, top: `${f(Math.max(0, cy - R))}px`, width: `${f(Math.max(260, Math.min(620, W - readLeft - 10)))}px` });
    arrived = true;
    paintBodies(spring.value);
    paintBeam();
  }

  const obs = observe(host, layout);
  const onWheel = (ev) => {
    if (!geo) return;
    const now = Date.now();
    if (now - wheelAt < 220 || Math.abs(ev.deltaY) < 4) return;
    wheelAt = now;
    ev.preventDefault();
    onPick((selected + (ev.deltaY > 0 ? 1 : -1) + n) % n);
  };
  host.addEventListener('wheel', onWheel, { passive: false });

  return {
    set({ selected: next = 0, swing = false } = {}) {
      const target = Math.max(0, Math.min(n - 1, Number(next) || 0));
      let t = target;
      const cur = spring.value;
      while (t - cur > n / 2) t -= n;
      while (t - cur < -n / 2) t += n;
      selected = target;
      paintRead(swing);
      paintBeam();
      spring.set(t, { instant: !swing });
      paintBodies(spring.value);
      obs.schedule();
    },
    dispose() {
      obs.stop();
      spring.stop();
      host.removeEventListener('wheel', onWheel);
      host.textContent = '';
      host.classList.remove('orr-hloop', 'is-off');
    },
  };
}

// ================================================================================================
// HULL DIAL

const GAUGES = Object.freeze([
  // price is what the hull costs: lower is the better side of this gauge
  { key: 'price', name: 'Price', fmt: (v) => Math.round(v).toLocaleString('en-US'), unit: 'cr', lowerIsBetter: true, centre: true },
  { key: 'handling', name: 'Handling', fmt: (v) => v.toFixed(2) },
  { key: 'cargo', name: 'Cargo', fmt: (v) => Math.round(v).toLocaleString('en-US'), unit: 'u' },
  { key: 'hull', name: 'Hull', fmt: (v) => Math.round(v).toLocaleString('en-US') },
  { key: 'shield', name: 'Shield', fmt: (v) => Math.round(v).toLocaleString('en-US') },
]);

/**
 * The fraction of the fleet's best a hull reaches on one gauge. The fleet spans two orders of
 * magnitude from the starter to the flagship, so size reads on a square-root scale, price on a log
 * scale, and handling (a narrow band) straight.
 */
export function gaugeFraction(key, ship, maxima) {
  const v = Number(ship && ship[key]) || 0;
  const m = Number(maxima && maxima[key]) || 1;
  if (key === 'price') return v <= 0 ? 0 : Math.max(0.04, Math.min(1, Math.log10(v + 1) / Math.log10(m + 1)));
  if (key === 'handling') return Math.max(0, Math.min(1, v / m));
  return Math.max(0, Math.min(1, Math.sqrt(v / m)));
}

/** The signed difference the chosen hull makes against the pinned one, as a player reads it. */
export function gaugeDelta(gd, chosen, ref) {
  const a = Number(chosen && chosen[gd.key]) || 0;
  const b = Number(ref && ref[gd.key]) || 0;
  const d = a - b;
  const better = gd.lowerIsBetter ? d < 0 : d > 0;
  const same = Math.abs(d) < (gd.key === 'handling' ? 0.005 : 0.5);
  const abs = Math.abs(d);
  const txt = gd.key === 'handling' ? abs.toFixed(2) : Math.round(abs).toLocaleString('en-US');
  return { d, better, same, text: same ? 'same' : `${d > 0 ? '+' : '−'}${txt}${gd.unit ? ' ' + gd.unit : ''}` };
}

/**
 * The chosen hull stands in a dial of five arc gauges; the player's own hull is PINNED on every gauge
 * as a dim bead, so each arc reads the difference: the stretch between the pinned bead and the chosen
 * head lights bone where the chosen hull is better and stays an unlit outline where it is worse (a
 * lower number is not a threat, so never red), with the signed difference under each figure.
 * `pinned` re-pins from outside (the screen's Pin verb, key C).
 * @param {HTMLElement} host @param {{ maxima: object }} o
 */
export function createHullDial(host, { maxima = {} } = {}) {
  const doc = canDraw(host);
  const inert = { set() {}, dispose() {} };
  if (!doc) return inert;
  injectOrrery(doc);
  injectStyle(doc);
  host.classList.add('orr-hdial', 'is-off');
  const pool = doc.createElement('i'); pool.className = 'orr-hdial__pool';
  const under = svg('svg', { class: 'orr-hi-svg', 'aria-hidden': 'true', focusable: 'false' });
  const art = doc.createElement('img'); art.className = 'orr-hdial__art'; art.alt = ''; art.decoding = 'async'; art.draggable = false;
  art.addEventListener('load', () => art.classList.add('is-ready'));
  const tier = doc.createElement('div'); tier.className = 'orr-hdial__tier';
  const tierNum = doc.createElement('b');
  const tierRole = doc.createElement('span');
  tier.append(tierNum, tierRole);
  const over = svg('svg', { class: 'orr-hi-svg', 'aria-hidden': 'true', focusable: 'false', style: 'z-index:2' });
  const labels = GAUGES.map((gd) => {
    const g = doc.createElement('div'); g.className = 'orr-hdial__g';
    const name = doc.createElement('span'); name.className = 'orr-hdial__g-name'; name.textContent = gd.name;
    const val = doc.createElement('span'); val.className = 'orr-hdial__g-val';
    const num = doc.createElement('span');
    val.appendChild(num);
    if (gd.unit) { const u = doc.createElement('small'); u.textContent = gd.unit; val.appendChild(u); }
    const delta = doc.createElement('span'); delta.className = 'orr-hdial__g-delta';
    g.append(name, val, delta);
    return { g, num, delta };
  });
  host.append(pool, under, art, tier, over, ...labels.map((l) => l.g));

  let ship = null;
  let ref = null;
  let geo = null;
  let arrived = false;
  const fills = GAUGES.map(() => null);
  const refFrac = GAUGES.map(() => 0);
  const springs = GAUGES.map((_, i) => createSpring({ value: 0, preset: 'settle', onUpdate: (v) => paintFill(i, v) }));

  // five gauges round the dial, each 56 degrees, the first centred on the crown
  const span = 56;
  const gapDeg = 16;
  const startOf = (i) => -span / 2 + i * (span + gapDeg);

  function paintFill(i, v) {
    const fl = fills[i];
    if (!fl || !geo) return;
    const { cx, cy, R } = geo;
    const a0 = startOf(i);
    const at = (t) => a0 + span * Math.max(0.001, Math.min(1, t));
    const r = refFrac[i];
    const lo = Math.min(v, r);
    const hi = Math.max(v, r);
    const gd = GAUGES[i];
    // the shared stretch (both hulls reach it) is lit; the difference is the gain or the shortfall.
    // Price is centre-zero: the pinned hull sits at the crown, cheaper runs left, dearer right.
    const base = gd.centre ? '' : arcD(cx, cy, R, a0, at(lo));
    fl.lit.setAttribute('d', base);
    fl.bloom.setAttribute('d', base);
    const diff = hi - lo > 0.004 ? arcD(cx, cy, R, at(lo), at(hi)) : '';
    const better = gd.lowerIsBetter ? v < r : v > r;
    fl.gain.setAttribute('d', better ? diff : '');
    fl.gainBloom.setAttribute('d', better ? diff : '');
    fl.loss.setAttribute('d', better ? '' : diff);
    fl.lossCut.setAttribute('d', better ? '' : diff);
    const [bx, by] = polar(cx, cy, R, at(v));
    fl.bead.setAttribute('cx', f(bx));
    fl.bead.setAttribute('cy', f(by));
    const [rx, ry] = polar(cx, cy, R, at(r));
    fl.ref.setAttribute('cx', f(rx));
    fl.ref.setAttribute('cy', f(ry));
  }

  function layout() {
    const W = host.clientWidth || 0;
    const H = host.clientHeight || 0;
    if (!ship || W < 300 || H < 260) { host.classList.add('is-off'); geo = null; return; }
    host.classList.remove('is-off');
    const small = W < 620 || H < 460;
    host.classList.toggle('is-small', small);
    const bandW = small ? 12 : 16;
    // the readings stand outside the ring, so the ring leaves them room on both sides
    let R = Math.min(H * 0.36, H / 2 - bandW / 2 - 30 - 80);
    GAUGES.forEach((_, i) => {
      const mid = startOf(i) + span / 2;
      const sn = Math.abs(Math.sin((mid * Math.PI) / 180));
      if (sn < 0.3) return;
      const w = labels[i].g.offsetWidth || (small ? 90 : 130);
      R = Math.min(R, (W / 2 - 8 - w) / sn - bandW / 2 - 30);
    });
    R = Math.max(96, R);
    const cx = W / 2;
    const cy = H / 2;
    geo = { W, H, R, cx, cy, bandW, small };
    under.setAttribute('viewBox', `0 0 ${W} ${H}`);
    over.setAttribute('viewBox', `0 0 ${W} ${H}`);
    under.textContent = '';
    over.textContent = '';
    const arriveNow = !arrived && !reducedMotion();
    const pd = R * 2.9;
    Object.assign(pool.style, { left: `${f(cx - pd / 2)}px`, top: `${f(cy - pd / 2)}px`, width: `${f(pd)}px`, height: `${f(pd)}px` });
    const g = svg('g', {});
    GAUGES.forEach((_, i) => bandRing(g, cx, cy, R, bandW, { a: 0.3, notches: 40, from: startOf(i), to: startOf(i) + span }));
    const drift = svg('g', { class: 'orr-drift orr-drift--rev', style: `transform-origin:${f(cx)}px ${f(cy)}px; --orr-drift-s:720s` });
    drift.appendChild(svg('path', { d: ticksD(cx, cy, R + bandW / 2 + 16, 120, { len: 3, major: 10, majorLen: 8, inward: true }), class: 'orr-hi__tick', style: 'stroke:rgb(236 230 216 / .3)' }));
    g.appendChild(drift);
    under.appendChild(rise(g, 0, arriveNow));
    GAUGES.forEach((_, i) => {
      const grp = svg('g', {});
      const bloom = svg('path', { d: '', class: 'orr-hi__lit-bloom', style: `stroke-width:${bandW + 8}px` });
      const lit = svg('path', { d: '', class: 'orr-hi__lit', style: `stroke-width:${Math.round(bandW * 0.42)}px` });
      // the gain: a full-width lit band; the shortfall: the band's outline only
      // the gain: a 10px slab of light with a soft 5px bloom; the shortfall: the same slab, hollow
      const slab = Math.min(10, bandW - 2);
      const gainBloom = svg('path', { d: '', class: 'orr-hdial__gain-bloom', style: `stroke-width:${slab + 5}px` });
      const gain = svg('path', { d: '', class: 'orr-hdial__gain', style: `stroke-width:${slab}px` });
      const loss = svg('path', { d: '', class: 'orr-hdial__loss', style: `stroke-width:${slab}px` });
      const lossCut = svg('path', { d: '', class: 'orr-hdial__loss-cut', style: `stroke-width:${slab - 3}px` });
      const ref = svg('circle', { r: small ? 5 : 6.5, class: 'orr-hdial__ref' });
      const bead = svg('circle', { r: small ? 4 : 5.5, fill: 'rgb(255 253 246)' });
      grp.append(bloom, lit, gainBloom, gain, loss, lossCut, ref, bead);
      over.appendChild(grp);
      fills[i] = { bloom, lit, gain, gainBloom, loss, lossCut, ref, bead };
      // the price arc's two ends say which way is which
      if (GAUGES[i].centre) {
        for (const [deg, word, anchor] of [[startOf(i) + 4, 'cheaper', 'end'], [startOf(i) + span - 4, 'dearer', 'start']]) {
          const [tx, ty] = polar(cx, cy, R + bandW / 2 + 14, deg);
          const t = svg('text', { x: f(tx), y: f(ty), 'text-anchor': anchor, 'dominant-baseline': 'central', class: 'orr-hdial__end' });
          t.textContent = word;
          grp.appendChild(t);
        }
      }
      const mid = startOf(i) + span / 2;
      const [lx, ly] = polar(cx, cy, R + bandW / 2 + 30, mid);
      const lab = labels[i].g;
      const a = ((mid % 360) + 360) % 360;
      const left = a > 180;
      const upper = a < 90 || a > 270;
      const crown = a < 20 || a > 340;
      const keel = a > 160 && a < 200;
      const centred = crown || keel;
      lab.classList.toggle('is-left', left && !centred);
      lab.style.alignItems = centred ? 'center' : '';
      lab.style.left = left && !centred ? 'auto' : `${f(lx)}px`;
      lab.style.right = left && !centred ? `${f(W - lx)}px` : 'auto';
      lab.style.top = `${f(ly)}px`;
      lab.style.transform = crown ? 'translate(-50%, -100%)' : keel ? 'translate(-50%, 0)' : upper ? 'translateY(-100%)' : 'none';
      rise(lab, 200 + i * 60, arriveNow);
    });
    const url = helpHullArt(ship.id);
    if (url) {
      const aw = R * 2.75;
      const ah = aw * 1350 / 2400;
      Object.assign(art.style, { left: `${f(cx - aw / 2)}px`, top: `${f(cy - ah / 2)}px`, width: `${f(aw)}px`, height: `${f(ah)}px`, display: 'block' });
      tier.style.display = 'none';
    } else {
      art.style.display = 'none';
      tier.style.display = 'flex';
      tier.style.left = `${f(cx)}px`;
      tier.style.top = `${f(cy)}px`;
      tierNum.style.fontSize = `${f(Math.max(64, R * 0.8))}px`;
    }
    arrived = true;
    springs.forEach((sp, i) => paintFill(i, sp.value));
  }


  const obs = observe(host, layout);
  return {
    set({ ship: next = null, pinned = null, swing = false } = {}) {
      ship = next;
      if (pinned) ref = pinned;
      if (!ship) { obs.schedule(); return; }
      if (!ref) ref = ship;
      const url = helpHullArt(ship.id);
      if (url && art.getAttribute('src') !== url) {
        art.classList.remove('is-ready');
        art.src = url;
        if (swing && !reducedMotion()) { art.classList.add('is-swing'); setTimeout(() => art.classList.remove('is-swing'), 30); }
      }
      tierNum.textContent = `T${ship.tier}`;
      tierRole.textContent = String(ship.role || '').replace(/_/g, ' ');
      GAUGES.forEach((gd, i) => {
        if (gd.centre) {
          // centre-zero on a log scale: how many decades cheaper or dearer than the pinned hull
          const a = Math.log10((Number(ship[gd.key]) || 0) + 1);
          const b = Math.log10((Number(ref[gd.key]) || 0) + 1);
          refFrac[i] = 0.5;
          springs[i].set(0.5 + 0.5 * Math.max(-1, Math.min(1, (a - b) / 1.25)));
        } else {
          refFrac[i] = gaugeFraction(gd.key, ref, maxima);
          springs[i].set(gaugeFraction(gd.key, ship, maxima));
        }
        paintFill(i, springs[i].value);
        const num = labels[i].num;
        const v = Number(ship[gd.key]) || 0;
        num.parentElement.classList.toggle('is-long', gd.fmt(v).length >= 5);
        if (gd.key === 'handling') num.textContent = gd.fmt(v);
        else rollTo(num, v);
        const dl = gaugeDelta(gd, ship, ref);
        const el = labels[i].delta;
        // the pinned hull says so once, under the crown; the other gauges say nothing
        el.textContent = ref.id === ship.id ? (i === 0 ? 'pinned' : '') : dl.text;
        el.classList.toggle('is-better', ref.id !== ship.id && !dl.same && dl.better);
        el.classList.toggle('is-worse', ref.id !== ship.id && !dl.same && !dl.better);
      });
      obs.schedule();
    },
    dispose() {
      obs.stop();
      springs.forEach((s) => s.stop());
      host.textContent = '';
      host.classList.remove('orr-hdial', 'is-off', 'is-small');
    },
  };
}

// ================================================================================================
// PRICE DIAL

const P_MIN = 5;
const P_MAX = 20000;
const DIAL_SPAN = 300; // degrees of ring the log scale runs round

/** Where a price sits on the dial's scale, in degrees from the scale's start. */
export function priceAngle(p) {
  const t = (Math.log10(Math.max(P_MIN, Math.min(P_MAX, p))) - Math.log10(P_MIN)) / (Math.log10(P_MAX) - Math.log10(P_MIN));
  return -DIAL_SPAN / 2 + t * DIAL_SPAN;
}

/**
 * Every good on one logarithmic price scale bent round a dial. The dial turns (with mass) to bring
 * the chosen good's price under a fixed bone index at the top, its swing band lit there; drag the
 * ring to turn it and the nearest good under the index is chosen (arrow keys and the wheel step
 * good by good). The hub holds the good's pictogram as a lit object over its price as a thin numeral.
 * @param {HTMLElement} host
 * @param {{ items: object[], glyph: (category:string) => string, onPick: (id:string) => void }} o
 */
export function createPriceDial(host, { items = [], glyph = () => '', onPick = () => {} } = {}) {
  const doc = canDraw(host);
  const inert = { set() {}, dispose() {} };
  if (!doc || !items.length) return inert;
  injectOrrery(doc);
  injectStyle(doc);
  host.classList.add('orr-hpdial', 'is-off');
  host.tabIndex = 0;
  host.setAttribute('role', 'slider');
  host.setAttribute('aria-label', 'Price dial: turn it to choose a good by its price');
  host.dataset.action = 'help-price-dial';
  const pool = doc.createElement('i'); pool.className = 'orr-hpdial__pool';
  const under = svg('svg', { class: 'orr-hi-svg', 'aria-hidden': 'true', focusable: 'false' });
  const over = svg('svg', { class: 'orr-hi-svg', 'aria-hidden': 'true', focusable: 'false', style: 'z-index:2' });
  const hub = doc.createElement('div'); hub.className = 'orr-hpdial__hub';
  const pict = doc.createElement('span'); pict.className = 'orr-hpdial__glyph'; pict.setAttribute('aria-hidden', 'true');
  const priceRow = doc.createElement('span'); priceRow.className = 'orr-hpdial__price';
  const num = doc.createElement('b');
  const unit = doc.createElement('small'); unit.textContent = 'cr';
  priceRow.append(num, unit);
  const nameEl = doc.createElement('span'); nameEl.className = 'orr-hpdial__name';
  hub.append(pict, priceRow, nameEl);
  const hint = doc.createElement('span'); hint.className = 'orr-hpdial__hint'; hint.textContent = 'Drag the ring · base price';
  host.append(pool, under, over, hub, hint);

  const byPrice = items.slice().sort((a, b) => a.basePrice - b.basePrice || a.name.localeCompare(b.name));
  let selectedId = byPrice[0].id;
  let filter = '';
  let geo = null;
  let arrived = false;
  let turnG = null;
  let goodEls = new Map();
  let swingEls = null;
  let drag = null;
  let lastSwingFor = '';
  const spring = createSpring({ value: 0, preset: 'swing', onUpdate: (v) => { if (turnG && geo) turnG.setAttribute('transform', `rotate(${f(v)} ${f(geo.cx)} ${f(geo.cy)})`); } });
  const visible = () => byPrice.filter((c) => !filter || (c.name + ' ' + (c.category || '')).toLowerCase().includes(filter));
  const chosen = () => byPrice.find((c) => c.id === selectedId) || byPrice[0];

  function paintChosen(swing) {
    if (!geo) return;
    const c = chosen();
    const { cx, cy, R, bandW } = geo;
    // the swing band: the good's price plus and minus its volatility, lit on the ring
    const vol = Math.max(0.04, Number(c.volatility) || 0.1);
    const a0 = priceAngle(c.basePrice * (1 - vol));
    const a1 = priceAngle(c.basePrice * (1 + vol));
    const d = arcD(cx, cy, R, a0, a1);
    swingEls.bloom.setAttribute('d', d);
    swingEls.lit.setAttribute('d', d);
    for (const [id, el] of goodEls) el.classList.toggle('is-chosen', id === c.id);
    pict.innerHTML = glyph(c.category);
    pict.classList.toggle('is-foe', c.legality === 'contraband');
    rollTo(num, c.basePrice);
    nameEl.textContent = c.name;
    host.setAttribute('aria-valuetext', `${c.name}, ${c.basePrice} credits`);
    host.setAttribute('aria-valuenow', String(c.basePrice));
    // turn the ring so the price stands under the index (the short way)
    let t = -priceAngle(c.basePrice);
    const cur = spring.value;
    while (t - cur > 180) t -= 360;
    while (t - cur < -180) t += 360;
    if (!drag) spring.set(t, { instant: !swing });
    void bandW;
  }

  function layout() {
    const W = host.clientWidth || 0;
    const H = host.clientHeight || 0;
    if (W < 300 || H < 300) { host.classList.add('is-off'); geo = null; return; }
    host.classList.remove('is-off');
    const small = W < 560 || H < 480;
    const R = Math.max(120, Math.min(H * 0.4, W * 0.42));
    const cx = W / 2;
    const cy = H / 2 + (small ? 8 : 14);
    const bandW = small ? 16 : 22;
    geo = { W, H, R, cx, cy, bandW, small };
    under.setAttribute('viewBox', `0 0 ${W} ${H}`);
    over.setAttribute('viewBox', `0 0 ${W} ${H}`);
    under.textContent = '';
    over.textContent = '';
    const arriveNow = !arrived && !reducedMotion();
    const pd = R * 2.8;
    Object.assign(pool.style, { left: `${f(cx - pd / 2)}px`, top: `${f(cy - pd / 2)}px`, width: `${f(pd)}px`, height: `${f(pd)}px` });
    // the ring that turns: the price scale's band, its decades and their figures, a tick for every good
    turnG = svg('g', {});
    const band = svg('g', {});
    bandRing(band, cx, cy, R, bandW, { a: 0.3, notches: 0, from: -DIAL_SPAN / 2, to: DIAL_SPAN / 2 });
    turnG.appendChild(band);
    const minor = [];
    const major = [];
    for (let dec = 1; dec <= 10000; dec *= 10) {
      for (let k = 1; k <= 9; k += 1) {
        const p = dec * k;
        if (p < P_MIN || p > P_MAX) continue;
        const a = priceAngle(p);
        const [x0, y0] = polar(cx, cy, R - bandW / 2, a);
        const [x1, y1] = polar(cx, cy, R - bandW / 2 - (k === 1 ? 12 : 6), a);
        (k === 1 ? major : minor).push(`M ${f(x0)} ${f(y0)} L ${f(x1)} ${f(y1)}`);
      }
    }
    turnG.appendChild(svg('path', { d: minor.join(' '), class: 'orr-hi__tick' }));
    turnG.appendChild(svg('path', { d: major.join(' '), class: 'orr-hi__tick orr-hi__tick--major' }));
    for (const [p, t] of [[10, '10'], [100, '100'], [1000, '1k'], [10000, '10k']]) {
      const [x, y] = polar(cx, cy, R - bandW / 2 - 26, priceAngle(p));
      const tx = svg('text', { x: f(x), y: f(y), 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'orr-hpdial__decade' });
      tx.textContent = t;
      turnG.appendChild(tx);
    }
    // every good: a notch cut into the band at its price, longer when it is the chosen one
    goodEls = new Map();
    const shown = new Set(visible().map((c) => c.id));
    for (const c of byPrice) {
      const a = priceAngle(c.basePrice);
      const [x0, y0] = polar(cx, cy, R + bandW / 2 + 2, a);
      const [x1, y1] = polar(cx, cy, R + bandW / 2 + 9, a);
      const el = svg('path', { d: `M ${f(x0)} ${f(y0)} L ${f(x1)} ${f(y1)}`, class: 'orr-hpdial__good' + (shown.has(c.id) ? '' : ' is-out') + (c.legality === 'contraband' ? ' is-foe' : '') });
      turnG.appendChild(el);
      goodEls.set(c.id, el);
    }
    swingEls = {
      bloom: svg('path', { d: '', class: 'orr-hi__lit-bloom', style: 'stroke-width:0' }),
      lit: svg('path', { d: '', class: 'orr-hi__lit', style: `stroke-width:${Math.round(bandW * 0.36)}px` }),
    };
    turnG.append(swingEls.bloom, swingEls.lit);
    under.appendChild(rise(turnG, 0, arriveNow));
    // the fixed parts: the hub's ring (a band with body), the index needle at the top
    under.appendChild(svg('path', { d: arcD(cx, cy, R * 0.62, 0, 360), class: 'orr-hi__band', style: 'stroke-width:7px; --orr-band-a:.15' }));
    under.appendChild(svg('path', { d: arcD(cx, cy, R * 0.62, 0, 360), class: 'orr-hi__edge', style: 'stroke:rgb(236 230 216 / .46)' }));
    const drift = svg('g', { class: 'orr-drift orr-drift--rev', style: `transform-origin:${f(cx)}px ${f(cy)}px; --orr-drift-s:800s` });
    drift.appendChild(svg('path', { d: ticksD(cx, cy, R * 0.62 - 6, 72, { len: 3, major: 6, majorLen: 7, inward: true }), class: 'orr-hi__tick', style: 'stroke:rgb(236 230 216 / .3)' }));
    under.appendChild(drift);
    const [ix0, iy0] = polar(cx, cy, R - bandW / 2 - 4, 0);
    const [ix1, iy1] = polar(cx, cy, R + bandW / 2 + 40, 0);
    over.appendChild(svg('path', { d: `M ${f(ix0)} ${f(iy0)} L ${f(ix1)} ${f(iy1)}`, class: 'orr-hpdial__index-bloom' }));
    over.appendChild(svg('path', { d: `M ${f(ix0)} ${f(iy0)} L ${f(ix1)} ${f(iy1)}`, class: 'orr-hpdial__index' }));
    over.appendChild(svg('circle', { cx: f(ix1), cy: f(iy1), r: 4, class: 'orr-hpdial__index-bead' }));
    // the hub
    hub.style.left = `${f(cx)}px`;
    hub.style.top = `${f(cy)}px`;
    const gs = Math.round(R * 0.66);
    pict.style.width = `${gs}px`;
    pict.style.height = `${gs}px`;
    num.style.fontSize = `${f(Math.max(40, Math.min(96, R * 0.26)))}px`;
    hint.style.left = `${f(cx)}px`;
    hint.style.top = `${f(cy + R + bandW / 2 + (small ? 16 : 24))}px`;
    arrived = true;
    spring.set(spring.target, { instant: true });
    paintChosen(false);
  }

  // turning the ring by hand: the angle the pointer moves round the hub turns the scale with it
  const angleAt = (ev) => {
    const r = host.getBoundingClientRect();
    const x = ev.clientX - r.left - geo.cx;
    const y = ev.clientY - r.top - geo.cy;
    return (Math.atan2(x, -y) * 180) / Math.PI;
  };
  const nearestAt = (rot) => {
    const want = -rot;
    let best = null; let bd = Infinity;
    for (const c of visible()) { const d = Math.abs(priceAngle(c.basePrice) - want); if (d < bd) { bd = d; best = c; } }
    return best;
  };
  const onDown = (ev) => {
    if (!geo || ev.button !== 0) return;
    const r = host.getBoundingClientRect();
    const dx = ev.clientX - r.left - geo.cx;
    const dy = ev.clientY - r.top - geo.cy;
    const dist = Math.hypot(dx, dy);
    if (dist < geo.R * 0.62 || dist > geo.R + geo.bandW + 50) return;
    drag = { a0: angleAt(ev), rot0: spring.value };
    try { host.setPointerCapture(ev.pointerId); } catch (e) { /* synthetic */ }
    host.classList.add('is-turning');
    ev.preventDefault();
  };
  const onMove = (ev) => {
    if (!drag || !geo) return;
    let da = angleAt(ev) - drag.a0;
    while (da > 180) da -= 360;
    while (da < -180) da += 360;
    const rot = Math.max(-DIAL_SPAN / 2, Math.min(DIAL_SPAN / 2, drag.rot0 + da));
    spring.set(rot, { instant: true });
    const c = nearestAt(rot);
    if (c && c.id !== selectedId) onPick(c.id);
  };
  const onUp = () => {
    if (!drag) return;
    drag = null;
    host.classList.remove('is-turning');
    paintChosen(true); // settle onto the chosen good's price
  };
  const step = (dir) => {
    const list = visible();
    if (!list.length) return;
    let i = list.findIndex((c) => c.id === selectedId);
    i = Math.max(0, Math.min(list.length - 1, (i < 0 ? 0 : i) + dir));
    if (list[i] && list[i].id !== selectedId) onPick(list[i].id);
  };
  const onKey = (ev) => {
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') { ev.preventDefault(); step(1); }
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') { ev.preventDefault(); step(-1); }
  };
  let wheelAt = 0;
  const onWheel = (ev) => {
    const now = Date.now();
    if (now - wheelAt < 90 || Math.abs(ev.deltaY) < 2) return;
    wheelAt = now;
    ev.preventDefault();
    step(ev.deltaY > 0 ? 1 : -1);
  };
  host.addEventListener('pointerdown', onDown);
  host.addEventListener('pointermove', onMove);
  host.addEventListener('pointerup', onUp);
  host.addEventListener('pointercancel', onUp);
  host.addEventListener('keydown', onKey);
  host.addEventListener('wheel', onWheel, { passive: false });
  const obs = observe(host, layout);

  return {
    set({ selectedId: id, filter: q, swing = false } = {}) {
      if (id != null) selectedId = id;
      if (q != null) {
        filter = String(q).trim().toLowerCase();
        const shown = new Set(visible().map((c) => c.id));
        for (const [gid, el] of goodEls) el.classList.toggle('is-out', !shown.has(gid));
      }
      const key = selectedId;
      if (geo) paintChosen(swing && key !== lastSwingFor);
      else obs.schedule();
      lastSwingFor = key;
    },
    dispose() {
      obs.stop();
      spring.stop();
      host.removeEventListener('pointerdown', onDown);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerup', onUp);
      host.removeEventListener('pointercancel', onUp);
      host.removeEventListener('keydown', onKey);
      host.removeEventListener('wheel', onWheel);
      host.textContent = '';
      host.classList.remove('orr-hpdial', 'is-off', 'is-turning');
    },
  };
}

// ================================================================================================
// ORE MIX

/**
 * The six asteroid types stand on a scale across the top (each a body sized by how common it is);
 * the chosen type's ore drops open below as a split ring, each ore its share of the circle as a lit
 * arc with its name on a leader; a beam runs from the chosen type down into the ring.
 * @param {HTMLElement} host
 * @param {{ asteroids: object[], ores: object[], onPickRock: (id:string) => void, onPickOre: (id:string) => void }} o
 */
export function createOreMix(host, { asteroids = [], ores = [], onPickRock = () => {}, onPickOre = () => {} } = {}) {
  const doc = canDraw(host);
  const inert = { set() {}, dispose() {} };
  if (!doc || !asteroids.length) return inert;
  injectOrrery(doc);
  injectStyle(doc);
  const box = doc.createElement('div');
  box.className = 'orr-hmix is-off';
  host.appendChild(box);
  const pool = doc.createElement('i'); pool.className = 'orr-hmix__pool';
  const under = svg('svg', { class: 'orr-hi-svg', 'aria-hidden': 'true', focusable: 'false' });
  const over = svg('svg', { class: 'orr-hi-svg', 'aria-hidden': 'true', focusable: 'false', style: 'z-index:2' });
  const centre = doc.createElement('div'); centre.className = 'orr-hmix__centre';
  const cName = doc.createElement('b'); const cSub = doc.createElement('span'); const cSub2 = doc.createElement('span');
  centre.append(cName, cSub, cSub2);
  const rockImg = doc.createElement('img'); rockImg.className = 'orr-hmix__rockart'; rockImg.alt = ''; rockImg.decoding = 'async'; rockImg.draggable = false;
  rockImg.addEventListener('load', () => rockImg.classList.add('is-ready'));
  const group = doc.createElement('div');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Asteroid types');
  group.style.cssText = 'position:absolute; inset:0; pointer-events:none;';
  const nameOf = (a) => a.id.replace('ast_', '').replace(/_/g, ' ');
  const maxW = Math.max(...asteroids.map((a) => a.spawnWeight || 1));
  const totalW = asteroids.reduce((s, a) => s + (a.spawnWeight || 0), 0) || 1;
  const rocks = asteroids.map((a, i) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'orr-hmix__rock';
    b.dataset.rock = a.id;
    b.dataset.action = 'help-rock:' + a.id;
    b.style.pointerEvents = 'auto';
    b.setAttribute('aria-label', `${nameOf(a)} asteroids`);
    const thumb = doc.createElement('img'); thumb.className = 'orr-hmix__thumb'; thumb.alt = ''; thumb.decoding = 'async'; thumb.draggable = false;
    const art = rockArt(a.id);
    if (art) thumb.src = art;
    const nm = doc.createElement('span'); nm.className = 'orr-hmix__rock-name'; nm.textContent = nameOf(a);
    b.append(thumb, nm);
    b.addEventListener('click', () => onPickRock(a.id));
    b.addEventListener('keydown', (ev) => {
      const dir = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? -1 : 0;
      if (!dir) return;
      ev.preventDefault();
      const next = asteroids[(i + dir + asteroids.length) % asteroids.length];
      onPickRock(next.id);
      const nb = rocks.find((r) => r.dataset.rock === next.id);
      if (nb && typeof nb.focus === 'function') nb.focus();
    });
    group.appendChild(b);
    return b;
  });
  const lblLayer = doc.createElement('div');
  lblLayer.style.cssText = 'position:absolute; inset:0; pointer-events:none;';
  box.append(pool, under, rockImg, over, centre, group, lblLayer);

  let rockId = asteroids[0].id;
  let oreId = null;
  let geo = null;
  let arrived = false;
  let turn = null;
  const spin = createSpring({ value: 0, preset: 'swing', onUpdate: (v) => { if (turn && geo) turn.setAttribute('transform', `rotate(${f(v)} ${f(geo.cx)} ${f(geo.cy)})`); } });

  function layout() {
    const W = box.clientWidth || 0;
    const H = box.clientHeight || 0;
    if (W < 320 || H < 300) { box.classList.add('is-off'); geo = null; return; }
    box.classList.remove('is-off');
    const small = W < 620 || H < 470;
    box.classList.toggle('is-small', small);
    // the scale of rock types across the top
    const sy = small ? 40 : 52;
    const sx0 = Math.max(46, W * 0.09);
    const sx1 = W - sx0;
    const top = sy + (small ? 50 : 70);
    const R = Math.max(80, Math.min((H - top) * 0.36, (W - (small ? 240 : 340)) / 2));
    const cx = W / 2;
    const cy = top + (H - top) / 2;
    const bandW = small ? 16 : 24;
    geo = { W, H, R, cx, cy, bandW, small, sy, sx0, sx1 };
    under.setAttribute('viewBox', `0 0 ${W} ${H}`);
    over.setAttribute('viewBox', `0 0 ${W} ${H}`);
    under.textContent = '';
    const arriveNow = !arrived && !reducedMotion();
    const pd = R * 3.4;
    Object.assign(pool.style, { left: `${f(cx - pd / 2)}px`, top: `${f(cy - pd / 2)}px`, width: `${f(pd)}px`, height: `${f(pd)}px` });
    const g = svg('g', {});
    // the scale: a band with body and a ruler of ticks under it
    g.appendChild(svg('path', { d: `M ${f(sx0 - 24)} ${sy} L ${f(sx1 + 24)} ${sy}`, class: 'orr-hi__band', style: 'stroke-width:9px' }));
    g.appendChild(svg('path', { d: `M ${f(sx0 - 24)} ${sy} L ${f(sx1 + 24)} ${sy}`, class: 'orr-hi__edge', style: 'stroke-width:2px; stroke:rgb(236 230 216 / .6)' }));
    const minor = [];
    for (let k = 0; k <= 50; k += 1) {
      const x = sx0 - 24 + ((sx1 - sx0 + 48) * k) / 50;
      minor.push(`M ${f(x)} ${f(sy + 7)} L ${f(x)} ${f(sy + (k % 5 ? 11 : 16))}`);
    }
    g.appendChild(svg('path', { d: minor.join(' '), class: 'orr-hi__tick' }));
    // the mix ring's track and the scales round it
    g.appendChild(svg('path', { d: arcD(cx, cy, R, 0, 360), class: 'orr-hi__band', style: `stroke-width:${bandW}px; --orr-band-a:.12` }));
    const drift = svg('g', { class: 'orr-drift', style: `transform-origin:${f(cx)}px ${f(cy)}px; --orr-drift-s:900s` });
    drift.appendChild(svg('path', { d: ticksD(cx, cy, R - bandW / 2 - 10, 72, { len: 3, major: 6, majorLen: 8, inward: true }), class: 'orr-hi__tick', style: 'stroke:rgb(236 230 216 / .32)' }));
    drift.appendChild(svg('path', { d: ticksD(cx, cy, R + bandW / 2 + 10, 120, { len: 3, major: 10, majorLen: 7, inward: false }), class: 'orr-hi__tick', style: 'stroke:rgb(236 230 216 / .28)' }));
    g.appendChild(drift);
    under.appendChild(rise(g, 0, arriveNow));
    asteroids.forEach((a, i) => {
      const x = asteroids.length > 1 ? sx0 + ((sx1 - sx0) * i) / (asteroids.length - 1) : cx;
      const size = Math.round((small ? 26 : 34) + (small ? 12 : 16) * Math.sqrt((a.spawnWeight || 1) / maxW));
      const b = rocks[i];
      Object.assign(b.style, { left: `${f(x - size / 2)}px`, top: `${f(sy - size / 2)}px`, width: `${size}px`, height: `${size}px` });
      b.dataset.x = String(x);
      b.dataset.size = String(size);
      // names alternate below and above the scale so neighbours never touch
      b.classList.toggle('is-above', i % 2 === 1);
      rise(b, 120 + i * 50, arriveNow);
    });
    // the open type's rock fills the hub; its words stand under it, inside the ring
    const rs = R * (small ? 1.3 : 1.72);
    Object.assign(rockImg.style, { left: `${f(cx - rs / 2)}px`, top: `${f(cy - rs / 2 - R * (small ? 0.2 : 0.1))}px`, width: `${f(rs)}px`, height: `${f(rs)}px` });
    centre.style.left = `${f(cx)}px`;
    centre.style.top = `${f(cy + R * (small ? 0.46 : 0.58))}px`;
    centre.style.maxWidth = `${f(R * 1.3)}px`;
    arrived = true;
    paintMix(false);
  }

  function paintMix(swing) {
    if (!geo) return;
    const { cx, cy, R, bandW, W, sy } = geo;
    const rock = asteroids.find((a) => a.id === rockId) || asteroids[0];
    rocks.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.rock === rock.id)));
    cName.textContent = nameOf(rock);
    cSub.textContent = `${Math.round((100 * (rock.spawnWeight || 0)) / totalW)}% of rocks`;
    cSub2.textContent = `ore up to tier ${rock.tierCap}`;
    const art = rockArt(rock.id);
    if (art && rockImg.getAttribute('src') !== art) { rockImg.classList.remove('is-ready'); rockImg.src = art; }
    over.textContent = '';
    lblLayer.textContent = '';
    // a beam from the chosen type on the scale down into the ring
    const rb = rocks.find((b) => b.dataset.rock === rock.id);
    const rx = rb ? Number(rb.dataset.x) : cx;
    const rs = rb ? Number(rb.dataset.size) : 20;
    const y0 = sy + rs / 2 + 30;
    const y1 = cy - R - bandW / 2 - 16;
    const d = `M ${f(rx)} ${f(y0)} C ${f(rx)} ${f((y0 + y1) / 2)}, ${f(cx)} ${f((y0 + y1) / 2)}, ${f(cx)} ${f(y1)}`;
    over.appendChild(svg('path', { d, class: 'orr-hi__beam-band' }));
    over.appendChild(svg('path', { d, class: 'orr-hi__beam' }));
    over.appendChild(svg('path', { d, class: 'orr-hi__pulse-bloom', pathLength: 1 }));
    over.appendChild(svg('path', { d, class: 'orr-hi__pulse', pathLength: 1 }));
    over.appendChild(svg('circle', { cx: f(cx), cy: f(y1), r: 3.5, fill: 'rgb(236 247 255)' }));
    // the split ring: each ore its share of the circle, a band with ticks cut through, a gap between
    turn = svg('g', {});
    over.appendChild(turn);
    const entries = Object.entries(rock.oreTable || {}).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, [, w]) => s + w, 0) || 1;
    let at = 0;
    const gap = 3;
    const placed = [];
    entries.forEach(([id, w], k) => {
      const sweep = (360 * w) / total;
      const a0 = at + gap / 2;
      const a1 = at + sweep - gap / 2;
      const chosen = id === oreId;
      const dd = arcD(cx, cy, R, a0, a1);
      turn.appendChild(svg('path', { d: dd, class: 'orr-hi__band', style: `stroke-width:${bandW}px; --orr-band-a:${chosen ? 0.7 : k % 2 ? 0.3 : 0.44}` }));
      turn.appendChild(svg('path', { d: ticksD(cx, cy, R + bandW / 2, Math.max(2, Math.round(sweep / 5)), { len: bandW, inward: true, from: a0, to: a1 }), class: 'orr-hi__notch' }));
      if (chosen) {
        turn.appendChild(svg('path', { d: dd, class: 'orr-hi__lit-bloom', style: `stroke-width:${bandW + 12}px` }));
        turn.appendChild(svg('path', { d: dd, class: 'orr-hi__lit', style: `stroke-width:${Math.round(bandW * 0.4)}px` }));
      }
      placed.push({ id, w, mid: at + sweep / 2, chosen });
      at += sweep;
    });
    // each share's ore on a leader outside the ring, left or right, never on top of another
    const rows = { L: [], R: [] };
    placed.forEach((p) => { const a = ((p.mid % 360) + 360) % 360; (a > 180 ? rows.L : rows.R).push({ ...p, a }); });
    for (const [side, list] of Object.entries(rows)) {
      list.sort((a, b) => polar(cx, cy, R, a.mid)[1] - polar(cx, cy, R, b.mid)[1]);
      let lastY = -Infinity;
      list.forEach((p) => {
        const ore = ores.find((o) => o.id === p.id);
        const [x0, y0e] = polar(cx, cy, R + bandW / 2 + 2, p.mid);
        const [x1, y1e] = polar(cx, cy, R + bandW / 2 + (geo.small ? 22 : 34), p.mid);
        const ly = Math.max(y1e, lastY + (geo.small ? 38 : 46));
        lastY = ly;
        const left = side === 'L';
        const x2 = left ? Math.min(x1, cx - R - bandW) - 24 : Math.max(x1, cx + R + bandW) + 24;
        over.appendChild(svg('path', { d: `M ${f(x0)} ${f(y0e)} L ${f(x1)} ${f(y1e)} L ${f(x1)} ${f(ly)} L ${f(x2)} ${f(ly)}`, fill: 'none', stroke: p.chosen ? 'rgb(255 255 255)' : `rgb(${BONE} / .66)`, 'stroke-width': p.chosen ? 2.2 : 1.6, 'stroke-linejoin': 'round' }));
        const lbl = doc.createElement('button');
        lbl.type = 'button';
        lbl.className = 'orr-hmix__lbl' + (left ? ' is-left' : '') + (p.chosen ? ' is-chosen' : '');
        lbl.dataset.action = 'help-ore:' + p.id;
        lbl.style.pointerEvents = 'auto';
        const nm = doc.createElement('span'); nm.className = 'orr-hmix__lbl-name'; nm.textContent = ore ? ore.name : p.id;
        const pc = doc.createElement('span'); pc.className = 'orr-hmix__lbl-pc'; pc.textContent = `${Math.round(p.w * 100)}% of the yield`;
        lbl.append(nm, pc);
        lbl.style.top = `${f(ly)}px`;
        lbl.style.transform = 'translateY(-50%)';
        if (left) lbl.style.right = `${f(W - x2 + 8)}px`; else lbl.style.left = `${f(x2 + 8)}px`;
        lbl.addEventListener('click', () => onPickOre(p.id));
        lblLayer.appendChild(lbl);
      });
    }
    if (swing && !reducedMotion()) { spin.set(-28, { instant: true }); spin.set(0); } else spin.set(0, { instant: true });
  }

  const obs = observe(box, layout);
  return {
    set({ rockId: r, oreId: o, swing = false } = {}) {
      if (r) rockId = r;
      oreId = o || null;
      if (geo) paintMix(swing); else obs.schedule();
    },
    dispose() {
      obs.stop();
      spin.stop();
      box.remove();
    },
  };
}

void onFrame;
