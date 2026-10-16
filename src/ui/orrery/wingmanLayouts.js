// ORRERY composition for the wingman radial (src/ui/wingmanRadial.js — design/frontend/ORRERY.md §6 Radials).
//
// The dial wore the superseded Deckplate skin: smoked-glass wedges with an inner glass reflection, a
// machined hub collar built from a metal border-box gradient, metal key chips, and a live drop-shadow
// filter on the selected segment (a per-frame filter on HUD vectors in flight, which the flight rules
// forbid). It is now an instrument of light:
//
//   - the disc is ONE pool of shade at about 55 %, its rim feathered over ~40 px, never a plate;
//   - the four keys are arcs of light: a band under a crisp edge, the chosen one's edge amber with a
//     faint amber fill (the Hand), its legend brightened so it reads on the tint;
//   - the digits are bare thin numerals, not chips; the bezel lamps are beads that light amber with a
//     halo under the Hand; the hub is a glass disc inside one ring of light; title, pips, craft count and TAB stack with air so they never collide.
//
// It restyles the dial's existing nodes (classes, roles and keys are untouched) and pins nothing.
// Static alpha, masks and strokes only: no backdrop-filter, no filter.
import { injectOrrery } from './tokens.js';

const STYLE_ID = 'sf-orrery-wingman';
const W = 'html body .sf-wradial';
const BONE = '236 230 216';
const STAND = `${W}:has(.sf-wradial__wedge:hover) .sf-wradial__wedge:not(:hover)`;
// a bezel bead whose key is not under the pointer goes back to bone while any key is hovered
const LAMP_STAND = ['top', 'right', 'bottom', 'left'].map((side) =>
  `${W}:has(.sf-wradial__wedge:hover):not(:has(.sf-wradial__wedge--${side}:hover)) .sf-wradial__lamp--${side} { background:rgb(${BONE} / .92); box-shadow:0 0 0 2px rgb(5 7 10), 0 0 8px rgb(${BONE} / .4); }`).join('\n');

const CSS = `
/* the disc: one pool of shade, ~55 %, the rim feathered over ~40 px */
${W} { isolation:isolate; }
${W}::before { z-index:-2; inset:-84px; -webkit-mask-image:none; mask-image:none;
  background:radial-gradient(circle, rgb(5 7 10 / .6) 0, rgb(5 7 10 / .4) 52%, transparent 70%); }
${W}::after { content:""; position:absolute; left:50%; top:50%; width:372px; height:372px; transform:translate(-50%, -50%); border-radius:50%; pointer-events:none; z-index:-1;
  background:radial-gradient(circle closest-side, rgb(7 9 13 / .72) 0, rgb(7 9 13 / .6) 58%, rgb(7 9 13 / .5) 76%, rgb(7 9 13 / 0) 100%); }
${W} .sf-wradial__bed { fill:none; }
${W} .sf-wradial__bezel-edge { stroke:rgb(${BONE} / .55); stroke-width:2; }
${W} .sf-wradial__graticule { stroke:rgb(${BONE} / .55); stroke-width:1.5; }

/* the keys: arcs of light, no glass reflection, no filter */
${W} .sf-wradial__wedge::after { display:none; }
${W} .sf-wradial__seg path { fill:rgb(${BONE} / .05); stroke:rgb(${BONE} / .56); stroke-width:1.6px; filter:none !important; }
${W} .sf-wradial__wedge:is(:hover, :focus-visible) .sf-wradial__seg path { fill:rgb(242 185 80 / .15); stroke:var(--dp-hand, #f2b950); stroke-width:3.4; filter:none !important; }
${W} .sf-wradial__wedge { color:rgb(${BONE} / .9); }
${W} .sf-wradial__label { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-variation-settings:"wdth" 112, "wght" 650; font-size:var(--wr-type); letter-spacing:.14em;
  color:rgb(${BONE} / .94); text-shadow:0 0 1px rgb(3 4 7 / .9), 0 0 6px rgb(3 4 7 / .7); }
${W} .sf-wradial__wedge:is(:hover, :focus-visible) .sf-wradial__label { color:rgb(255 251 240); text-shadow:0 0 1px rgb(3 4 7 / .9), 0 0 8px rgb(3 4 7 / .8); }
${W} .sf-wradial__glyph { color:var(--dp-hand-hot, #ffd98c); opacity:.78; }
${W} .sf-wradial__glyph .accent { fill:currentColor; }
${W} .sf-wradial__wedge:is(:hover, :focus-visible) .sf-wradial__glyph { opacity:1; color:var(--dp-hand-hot, #ffd98c); }
/* the key is a bare thin numeral */
${W} :is(.sf-wradial__key, .sf-wradial__hub-scope) { min-width:0; height:auto; padding:0; border:0 !important; border-image:none; border-radius:0; background:none !important;
  font-family:var(--dp-face-numeral, "Archivo"); font-stretch:100%; font-variation-settings:"wdth" 100, "wght" 300; font-weight:300; font-size:20px; line-height:20px; letter-spacing:0;
  color:var(--dp-phos, #dfeeff); }
${W} .sf-wradial__wedge:is(:hover, :focus-visible) .sf-wradial__key { color:var(--dp-hand-hot, #ffd98c); font-size:20px; }
${W} .sf-wradial__hub-scope { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-variation-settings:"wdth" 112, "wght" 650; font-size:12px; letter-spacing:.16em; text-transform:uppercase; color:rgb(${BONE} / .8); }

/* the bezel lamps: beads that light amber, with a halo, under the Hand */
${W} .sf-wradial__lamp { width:10px; height:10px; margin:-5px 0 0 -5px; background:rgb(${BONE} / .92); box-shadow:0 0 0 2px rgb(5 7 10), 0 0 8px rgb(${BONE} / .4); }
${W}:has(.sf-wradial__wedge--top:is(:hover, :focus-visible)) .sf-wradial__lamp--top,
${W}:has(.sf-wradial__wedge--right:is(:hover, :focus-visible)) .sf-wradial__lamp--right,
${W}:has(.sf-wradial__wedge--bottom:is(:hover, :focus-visible)) .sf-wradial__lamp--bottom,
${W}:has(.sf-wradial__wedge--left:is(:hover, :focus-visible)) .sf-wradial__lamp--left {
  background:var(--dp-hand, #f2b950); box-shadow:0 0 0 2px rgb(5 7 10), 0 0 10px 2px rgb(242 185 80 / .65), 0 0 22px 5px rgb(242 185 80 / .28); }

/* one Hand: while the pointer is over a key, only that key is lit (the one holding keyboard focus stands down) */
${STAND} { color:rgb(${BONE} / .9); }
${STAND} .sf-wradial__seg path { fill:rgb(${BONE} / .05); stroke:rgb(${BONE} / .56); stroke-width:1.6px; }
${STAND} .sf-wradial__label { color:rgb(${BONE} / .94); text-shadow:0 0 1px rgb(3 4 7 / .9), 0 0 6px rgb(3 4 7 / .7); }
${STAND} .sf-wradial__glyph { opacity:.78; }
${STAND} .sf-wradial__key { color:var(--dp-phos, #dfeeff); }
${LAMP_STAND}
${W}:has(.sf-wradial__wedge:hover) .sf-wradial__hub:focus-visible::before { border-color:rgb(${BONE} / .62); }

/* the hub: glass inside one ring of light; title / pips / count / TAB stacked with air so nothing collides */
${W} .sf-wradial__hub { border:0 !important; background:radial-gradient(circle, rgb(7 9 13 / .8), rgb(7 9 13 / .62) 70%, rgb(7 9 13 / .2) 100%) !important; box-shadow:none !important; padding:14px 10px 12px !important; gap:4px !important; justify-content:center !important; color:rgb(${BONE}); overflow:hidden; }
${W} .sf-wradial__hub::before { content:""; position:absolute; inset:1px; border-radius:50%; pointer-events:none; border:1.6px solid rgb(${BONE} / .62); }
${W} .sf-wradial__hub:focus-visible { outline:none; }
${W} .sf-wradial__hub:focus-visible::before { border-color:var(--dp-hand, #f2b950); }
${W} .sf-wradial__hub-title { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-variation-settings:"wdth" 112, "wght" 650; font-size:12px; line-height:1.2; letter-spacing:.14em; color:rgb(${BONE} / .88); text-shadow:none; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
${W} .sf-wradial__hub-count { font-family:var(--dp-face-numeral, "Archivo"); font-variation-settings:"wdth" 100, "wght" 300; font-size:14px !important; line-height:1.15 !important; letter-spacing:.04em; color:var(--dp-phos, #dfeeff); text-shadow:none; max-width:100%; }
${W} .sf-wradial__hub-scope { font-size:12px !important; line-height:1.1 !important; letter-spacing:.14em; margin-top:1px; }
${W} .sf-wradial__hub-pips { min-height:6px; gap:4px; }
${W} .sf-wradial__hub-pips i { width:6px; height:6px; background:rgb(${BONE} / .3); box-shadow:none; }
${W} .sf-wradial__hub-pips i.is-on { background:rgb(248 244 234); box-shadow:0 0 6px rgb(255 240 214 / .5); }

@media (forced-colors:active) { ${W}::before, ${W}::after, ${W} .sf-wradial__hub::before { display:none; } }
`;

export function injectWingmanLayouts(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.createElement !== 'function' || typeof doc.getElementById !== 'function') return;
  injectOrrery(doc);
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
