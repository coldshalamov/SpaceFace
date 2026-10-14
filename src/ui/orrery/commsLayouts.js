// ORRERY composition for the comms fan (src/ui/commsRadial.js — design/frontend/ORRERY.md §6 Radials).
//
// The fan used to be the superseded Deckplate skin: a bordered plate, a gridded scope box, a stack of
// bordered keys with chips, and a live `drop-shadow` filter on the trace (a per-frame filter on HUD
// vectors in flight, which the flight rules forbid). It is now an instrument of light:
//
//   - the whole fan stands in ONE feathered pool of shade (no box per row, no plate);
//   - the contact is a callsign in the display voice, its class and frequency as label words, and its
//     signal as a lit phosphor line on a ruled baseline (the bloom is a second wider stroke, geometry
//     not a filter);
//   - the verbs are WORDS hanging off a curved arc spine (the fan's own rail), each with a bead on the
//     spine; the chosen verb takes the Hand: its bead and word light amber and a short vertical segment
//     of light stands at its leading edge. A refused verb keeps its place and says why, its bead hollow.
//
// It restyles the fan's existing nodes (the key digit, glyph, verb and reason keep their classes, so the
// behaviour and the checks that read them are untouched) and pins nothing. Static alpha and masks only.
import { injectOrrery } from './tokens.js';

const STYLE_ID = 'sf-orrery-comms';
const F = 'html body #sf-commsfan';
const BONE = '236 230 216';
const LABEL = 'font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-variation-settings:"wdth" 112, "wght" 650; font-weight:650; text-transform:uppercase;';

const CSS = `
/* one pool of shade for the whole fan, feathered on every side */
${F} { isolation:isolate; width:min(392px, 42vw); }
${F}::before { content:""; position:absolute; inset:-40px -78px -34px -64px; z-index:-1; pointer-events:none;
  background:radial-gradient(ellipse closest-side at 44% 50%, rgb(3 4 7 / .86), rgb(3 4 7 / .66) 56%, rgb(3 4 7 / 0)); }

/* ---- the contact: a callsign, two label words, a lit trace ---- */
${F} .sf-commsfan__hub { position:relative; border:0 !important; border-image:none !important; border-radius:0; background:none !important; box-shadow:none !important;
  padding:6px 6px 12px 30px; row-gap:2px; column-gap:12px; color:rgb(${BONE}); filter:none !important; }
${F} .sf-commsfan__hub::before { content:""; position:absolute; left:8px; top:8px; bottom:14px; width:2px; background:rgb(${BONE} / .8); box-shadow:0 0 10px 1px rgb(${BONE} / .4); }
${F} .sf-commsfan__hub:is(:hover, :focus-visible) { filter:none !important; outline:none !important; }
${F} .sf-commsfan__hub:is(:hover, :focus-visible)::before { background:rgb(255 252 244); box-shadow:0 0 12px 2px rgb(255 240 214 / .55); }
${F} .sf-commsfan__crest { color:rgb(${BONE} / .9); }
${F} .sf-commsfan__pilot { font-family:var(--dp-face-display, "Archivo"); font-stretch:125%; font-variation-settings:"wdth" 125, "wght" 800; font-weight:800;
  font-size:20px; line-height:24px; letter-spacing:-.005em; text-transform:uppercase; color:rgb(250 246 236); text-shadow:none; }
${F} :is(.sf-commsfan__class, .sf-commsfan__freq) { ${LABEL} font-size:12px; line-height:16px; letter-spacing:.16em; color:rgb(${BONE} / .72); }
/* the trace: a phosphor line (core over its own wider bloom stroke) on a ruled baseline, no box */
${F} .sf-commsfan__ribbon { height:34px; padding:0; margin:6px 0 0; border-radius:0; box-shadow:none; filter:none !important; color:var(--dp-phos, #dfeeff);
  background:
    repeating-linear-gradient(90deg, rgb(${BONE} / .42) 0 1.5px, transparent 1.5px 12px) 0 100% / 100% 5px no-repeat,
    linear-gradient(0deg, transparent calc(50% - .75px), rgb(${BONE} / .26) calc(50% - .75px) calc(50% + .75px), transparent calc(50% + .75px)) !important; }
${F} .sf-commsfan__ribbon { overflow:visible; }
${F} .sf-commsfan__ribbon path { stroke-width:1.9; stroke-linejoin:round; stroke-linecap:round; }
${F} .sf-commsfan__ribbon path.sf-commsfan__bloom { stroke:var(--dp-ice, #8fcbff); stroke-width:6; opacity:.26; }

/* ---- the verbs: words on an arc spine, the Hand on the chosen one ---- */
${F} .sf-commsfan__wedgehost { padding-left:30px; gap:2px; }
${F} .sf-commsfan__rail { left:2px; }
${F} .sf-commsfan__rail path { fill:none; stroke-linecap:round; stroke:rgb(${BONE} / .3); stroke-width:8; }
${F} .sf-commsfan__rail path.sf-commsfan__edge { stroke:rgb(${BONE} / .72); stroke-width:1.8; }
${F} .sf-commsfan__rail { filter:none !important; }
${F} .sf-commsfan__wedge { height:38px; border:0 !important; border-radius:0; background:none !important; box-shadow:none !important; filter:none !important;
  padding:0 10px 0 6px; gap:12px; color:rgb(${BONE} / .9); text-shadow:none; transition:color .1s linear; }
/* the bead on the spine: bone at rest, the Hand's amber where the choice is */
${F} .sf-commsfan__wedge::before { left:-19px; width:10px; height:10px; margin-top:-5px; border-radius:50%; background:rgb(${BONE} / .92) !important;
  box-shadow:0 0 0 2px rgb(5 7 10), 0 0 8px 1px rgb(${BONE} / .4) !important; }
${F} .sf-commsfan__wedge::after { content:""; position:absolute; left:-4px; top:7px; bottom:7px; width:2px; background:rgb(255 217 140); box-shadow:0 0 10px 1px rgb(242 185 80 / .5); opacity:0; transition:opacity .1s linear; }
${F} .sf-commsfan__wedge:is(:hover, :focus, :focus-visible):not(.is-dim) { color:var(--dp-hand-hot, #ffd98c); text-shadow:none; box-shadow:none !important; outline:none !important; }
${F} .sf-commsfan__wedge:is(:hover, :focus, :focus-visible):not(.is-dim)::before { background:var(--dp-hand, #f2b950) !important;
  box-shadow:0 0 0 2px rgb(5 7 10), 0 0 10px 2px rgb(242 185 80 / .65), 0 0 22px 4px rgb(242 185 80 / .25) !important; }
${F} .sf-commsfan__wedge:is(:hover, :focus, :focus-visible):not(.is-dim)::after { opacity:1; }
/* one Hand: while the pointer is over the verbs, only the verb under it is lit (the one holding keyboard focus stands down) */
${F} .sf-commsfan__wedgehost:hover .sf-commsfan__wedge:not(:hover):not(.is-dim) { color:rgb(${BONE} / .9); }
${F} .sf-commsfan__wedgehost:hover .sf-commsfan__wedge:not(:hover):not(.is-dim)::before { background:rgb(${BONE} / .92) !important; box-shadow:0 0 0 2px rgb(5 7 10), 0 0 8px 1px rgb(${BONE} / .4) !important; }
${F} .sf-commsfan__wedgehost:hover .sf-commsfan__wedge:not(:hover)::after { opacity:0; }
${F} .sf-commsfan__wedgehost:hover .sf-commsfan__wedge:not(:hover):not(.is-dim) .sf-commsfan__keychip { color:var(--dp-phos, #dfeeff); }
/* a refused verb keeps its place and says why: a hollow bead, quiet words, no strike-through */
${F} .sf-commsfan__wedge.is-dim { color:rgb(${BONE} / .56); opacity:1; }
${F} .sf-commsfan__wedge.is-dim::before { background:rgb(5 7 10) !important; box-shadow:inset 0 0 0 1.5px rgb(${BONE} / .5), 0 0 0 2px rgb(5 7 10) !important; }
${F} .sf-commsfan__wedge.is-dim .sf-commsfan__verb { text-decoration:none; }
/* the key is a bare thin numeral, not a chip */
${F} .sf-commsfan__keychip { min-width:16px; height:auto; padding:0; border:0 !important; border-radius:0; background:none !important;
  font-family:var(--dp-face-numeral, "Archivo"); font-stretch:100%; font-variation-settings:"wdth" 100, "wght" 300; font-weight:300; font-size:24px; line-height:24px; letter-spacing:0;
  color:var(--dp-phos, #dfeeff); text-align:center; }
${F} .sf-commsfan__wedge:is(:hover, :focus, :focus-visible):not(.is-dim) .sf-commsfan__keychip { color:var(--dp-hand-hot, #ffd98c); background:none !important; border:0 !important; }
${F} .sf-commsfan__glyph { color:inherit; width:22px; height:22px; }
${F} .sf-commsfan__glyph .accent { fill:currentColor !important; }
${F} .sf-commsfan__verb { ${LABEL} font-size:14px; letter-spacing:.14em; color:inherit; }
${F} .sf-commsfan__why { ${LABEL} font-stretch:100%; font-variation-settings:"wdth" 100, "wght" 600; font-size:12px; letter-spacing:.1em; color:rgb(${BONE} / .6); }

html.sf-reduce-motion ${F} :is(.sf-commsfan__wedge, .sf-commsfan__wedge::after) { transition:none; }
@media (max-width:1280px), (max-height:760px) { ${F} { width:min(340px, 44vw); } ${F} .sf-commsfan__pilot { font-size:18px; } }
/* phone (portrait): the fan sat on the bottom cluster, over the contacts list, the radar, the ability
   list and the ship card, at 44vw wide so the callsign broke onto two lines. Hold it in the clear sky
   band under the status card instead, wide enough that the callsign and verbs each keep one line. */
@media (max-width:760px) and (orientation:portrait) {
  html:root[data-sf-mobile="1"] body #sf-commsfan { top:clamp(112px, 15svh, 150px); bottom:auto; width:min(340px, calc(100vw - 56px)); }
  html:root[data-sf-mobile="1"] body #sf-commsfan::before { inset:-28px -28px -24px -28px; }
}
@media (forced-colors:active) {
  ${F}::before, ${F} .sf-commsfan__hub::before { display:none; }
  ${F} .sf-commsfan__wedge::before { background:CanvasText !important; box-shadow:none !important; }
  ${F} .sf-commsfan__ribbon { background:Canvas !important; }
}
`;

export function injectCommsLayouts(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.createElement !== 'function' || typeof doc.getElementById !== 'function') return;
  injectOrrery(doc);
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
