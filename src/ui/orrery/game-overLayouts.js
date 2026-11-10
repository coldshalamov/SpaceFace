// End-card composition overlay — the game-over after-action sheet and the demo end card
// (design/frontend/ORRERY.md §6 Meta). The base compositions live in saveLayouts.js +
// gameOverLayouts.js (the sheet) and screenLayouts.js (the card); this file carries what the
// screens' own rebuild added: the chain beam that tells the demo run back, the career dial's
// finished size, and the 720p clearance between the sheet's foot verbs and the career ring's
// rim stations. Scoped to `.orr-gameover` / `.orr-demo-end`; injected after the base sheets
// so these rules read as the last word at equal specificity.

import { injectOrrery } from './tokens.js';

const STYLE_ID = 'sf-orrery-endcard-layouts';

const GO = 'html body #screens > .k-screen.sf-gameover.orr-gameover.orr-gameover';
const END = 'html body #screens > .k-screen.orr-demo-end';

export const END_CARD_LAYOUT_CSS = `
/* ---- demo end: the run told back as a chain beam — the card's hero instrument ----
   Acts as beads on a light rail (ORRERY §4 #6), the chain's points as the hero numeral the
   rail points into. The row is top-aligned so the rail (segment centre, 6px down) passes
   exactly through the bead centres; names hang under their beads like ladder rungs. */
${END} .sf-demo-end__chain { display:flex; align-items:flex-start; margin:0 0 26px; min-width:0; }
${END} .sf-demo-end__act { flex:0 0 auto; display:flex; flex-direction:column; align-items:center; gap:7px; min-width:0; }
${END} .sf-demo-end__act__name { font-size:12px; letter-spacing:.18em; color:rgb(236 230 216 / .8); white-space:nowrap; text-shadow:0 1px 0 rgb(4 6 9 / .8); }
${END} .sf-demo-end__act__dot { width:12px; height:12px; overflow:visible; flex:0 0 auto; }
${END} .sf-demo-end__seg { flex:1 1 16px; min-width:12px; height:12px; margin:0 3px; overflow:visible;
  transform-origin:left center; animation:sf-end-seg-in 460ms var(--dp-ease-out, ease-out) both; animation-delay:calc(140ms + var(--i, 0) * 90ms); }
@keyframes sf-end-seg-in { from { transform:scaleX(0); } to { transform:scaleX(1); } }
html.sf-reduce-motion ${END} .sf-demo-end__seg { animation:none; }
/* the run replaying: one ice pulse rides the finished rail on arrival, then rests */
${END} .sf-demo-end__seg__pulse { fill:none; stroke:var(--dp-ice, #8fcbff); stroke-width:1.2; stroke-dasharray:.05 .95; stroke-dashoffset:.05; opacity:0;
  animation:sf-end-pulse 1.1s linear 1.05s 2; }
@keyframes sf-end-pulse { 0% { stroke-dashoffset:.05; opacity:.7; } 88% { opacity:.7; } 100% { stroke-dashoffset:-.95; opacity:0; } }
html.sf-reduce-motion ${END} .sf-demo-end__seg__pulse { display:none; }
${END} .sf-demo-end__tip { flex:0 0 auto; width:9px; height:12px; margin:0 2px 0 1px; overflow:visible; }
${END} .sf-demo-end__points { flex:0 0 auto; display:flex; flex-direction:column; align-items:flex-end; gap:6px; margin:-14px 0 0 10px; min-width:0; }
${END} .sf-demo-end__points__n { font-family:var(--dp-face-numeral, "Archivo"); font-weight:250; font-variation-settings:"wght" 250, "wdth" 100;
  font-size:44px; line-height:.9; color:var(--dp-phos, rgb(223 238 255)); font-variant-numeric:tabular-nums; }
${END} .sf-demo-end__points__w { letter-spacing:.24em; color:rgb(236 230 216 / .6); }
/* the register and the beam stack from the top of the stage band (the panel is height:100%;
   the kit's default align-content stretch would otherwise pad the space between them) */
${END} .sf-demo-end__stage.k-panel { align-content:start; }
/* the register and the beam breathe over the wide plates instead of stopping at the 760px cap */
@media (min-width:1500px) {
  ${END} .sf-demo-end__stage.k-panel { grid-template-columns:minmax(0, min(1040px, 80vw)); }
}
/* the ways-out dial: ticks and a hub over the ring, sized to read as the instrument it is,
   standing close enough to the key that its bearing reads */
@media (min-width:761px) {
  ${END} .sf-demo-end__dial { width:124px; height:124px; margin-right:16px; }
  ${END} .sf-demo-end__foot { gap:26px; }
}
/* phone: the beam wraps rather than squeezing a name off the glass */
@media (max-width:760px) {
  ${END} .sf-demo-end__chain { flex-wrap:wrap; row-gap:14px; }
  ${END} .sf-demo-end__seg { flex:1 1 12px; }
  ${END} .sf-demo-end__points { align-items:flex-start; }
}

/* ---- game over: the rim stations keep their air over the foot verbs at 720p ----
   The ring's left stations bleed left of the recap column over the grid gap; at narrow widths
   the verb rail reaches that airspace, so the verbs condense (width axis, not size below the
   floor) and the stations ride a little closer to the rim. */
@media (max-width:1500px) {
  ${GO} .sf-go-st { left:calc(50% + var(--sx, 0) * (var(--r) + 14px * var(--sv))); }
  ${GO} .sf-go-foot > .k-words { padding-right:calc(10px * var(--sv)); }
  ${GO} .sf-go-foot .k-word.sf-go-verb { letter-spacing:.12em; font-size:12px; }
}
`;

export function injectEndCardLayouts(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.getElementById !== 'function' || typeof doc.createElement !== 'function') return;
  injectOrrery(doc);
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = END_CARD_LAYOUT_CSS;
  doc.head.appendChild(style);
}
