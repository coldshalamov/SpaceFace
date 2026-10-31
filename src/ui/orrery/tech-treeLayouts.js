// src/ui/orrery/tech-treeLayouts.js — the Research screen's own composition additions, beside
// constellationLayouts.js (which owns the seat of every region on the grid and stays shared). This
// file owns the one instrument this screen adds beyond the shared constellation: the hour-verb
// pacing line (PQ-155's HOUR_VERB_CURVE, src/data/techVerbLadder.js) read as a Scale — a collapsed
// reading that names the promise (a new verb every hour) and the first rungs, and opens on hover,
// keyboard focus or a pinned click into the ten-hour ladder of verbs, laid out on the sheet's own
// spine-and-tick rows over a pool of shade. Layout and light only: no boxes, no borders — the fly's
// edge is the shade dissolving, the head's focus is the kit's bone bracket, and the durations ride
// the kit's motion tokens so `sf-reduce-motion` reaches every state instantly. Scoped to the
// Research root so nothing reaches another screen.

const STYLE_ID = 'orr-techtree-screens';
const BONE = '236 230 216';
const WARM = '248 244 234';

const T = 'html body #screens > #sf-techtree.con-research';

const TECH_TREE = `
/* The pacing line keeps the shared sheet's seat, width clamp and margins, but now hosts a control
   and an overlay, so it drops the sheet's clip (the rungs line clips instead) and takes pointers
   (the whole header is pointer-events:none — it floats over the dial). */
${T} .con-curve { overflow:visible; display:block; position:relative; white-space:normal;
  text-overflow:clip; -webkit-line-clamp:unset; pointer-events:auto; }
${T} .con-curve__head { all:unset; box-sizing:border-box; display:block; width:100%; cursor:pointer; }
${T} .con-curve__key { display:block; white-space:nowrap; color:rgb(${BONE} / .6); letter-spacing:.2em; }
/* the open affordance: a quiet chevron after the key, turning as the ladder opens */
${T} .con-curve__key::after { content:"›"; display:inline-block; margin-left:.55em; letter-spacing:0;
  color:rgb(${BONE} / .5); transition:transform var(--k-d-focus, 140ms) var(--k-ease, ease-out), color var(--k-d-focus, 140ms) var(--k-ease, ease-out); }
${T} .con-curve__rungs { display:flex; flex-wrap:wrap; margin-top:2px; line-height:1.35; height:1.35em;
  overflow:hidden; color:rgb(${BONE} / .86); }
${T} .con-curve__rung { white-space:nowrap; }
${T} .con-curve__sep { white-space:pre; }
/* ui-polish-170: a desktop head with height to spare stacks the first two rungs as a short ladder
   instead of one line. The 28ch line held only "1 Propelled charge" even at 1920, and widening it
   pulled the dial in (the sky keeps the dial clear of the head's box); one more line under the
   key costs the dial nothing, since the title's corner is what bounds it. */
@media (min-width:761px) and (min-height:601px) {
  /* the second line hangs below the head's box (negative margin): the head keeps its one-line
     height, so the sky's avoid rect and its top fade (--con-mask-top) stay where master has them */
  ${T} .con-curve__rungs { flex-direction:column; flex-wrap:nowrap; height:2.7em; margin-bottom:-1.35em; }
  ${T} .con-curve { overflow:visible !important; } /* the hung line must not be clipped by the head's own box */
  ${T} .con-curve__sep { display:none; }
  /* while the ladder is open it lists every rung, so the head folds back to one line: the fly anchors
     at the curve box's bottom and would otherwise land on the hung rung and half-fade it */
  ${T} .con-curve.is-open .con-curve__rungs { height:1.35em; margin-bottom:0; }
}
${T} .con-curve__head:is(:hover, :focus-visible) .con-curve__key { color:rgb(${WARM} / .92); }
${T} .con-curve__head:is(:hover, :focus-visible) .con-curve__key::after { color:rgb(${WARM} / .9); }
${T} .con-curve__head:is(:hover, :focus-visible) .con-curve__rungs { color:rgb(${WARM}); }
${T} .con-curve__head:active .con-curve__rungs { color:rgb(${BONE} / .7); }
/* keyboard focus reads the screen's own text-control language (underline + warm), because the
   kit's outline around this header's layer does not paint under the screen root's zoom */
${T} .con-curve__head:focus-visible .con-curve__rungs { text-decoration:underline; text-decoration-thickness:1px; text-underline-offset:3px; }
${T} .con-curve.is-open .con-curve__key::after { transform:rotate(90deg); color:rgb(${WARM} / .9); }
/* reduced motion reaches every state instantly — the chevron's turn and the key's colour step too */
html.sf-reduce-motion ${T} .con-curve__key::after { transition:none; }

/* The open ladder portals to the screen root (an absolute overlay escaping the header's own box
   neither paints nor hit-tests inside it under the screen root's zoom), and anchors to the curve's
   live rect from techTree.js. Its shade is the fly's own background at near-opaque, with the
   dissolve cut by two INTERSECTING linear masks: the rows' box is always fully shaded and the fade
   lives only in the padding band at the four edges. (A radial skirt half-lit whatever rim word the
   dial parked at the fly's edge — "Combat Basics" read through it as a smudge; a radial plateau
   cannot hug a rectangle, so its corner always leaked.) The edge is shade dissolving, never a
   border. */
${T} .con-curve__fly { position:absolute; z-index:4; margin:0;
  padding:14px 26px 16px 20px; width:max-content; min-width:24ch; max-width:min(44ch, 34vw);
  background:rgb(4 6 9 / .97);
  mask-image:linear-gradient(180deg, transparent 0, #000 14px, #000 calc(100% - 18px), transparent 100%),
    linear-gradient(90deg, transparent 0, #000 20px, #000 calc(100% - 26px), transparent 100%);
  mask-composite:intersect; }
${T} .con-curve__fly .con-row__sub { font-variant-numeric:tabular-nums; }
${T} .con-curve__fly.is-closing { opacity:0; transition:opacity var(--k-d-settle, 140ms) var(--k-ease, ease-out); }
/* sky names the open ladder stands over yield (techTree.js _syncCurveCover): !important because
   the arrival's fill-forwards label animation (.con-sky.is-arriving .con-label-in) otherwise holds
   opacity 1 above the covered state, and the walk photographs inside that window */
${T} .con-sky .con-label.is-curve-covered { opacity:0 !important; animation:none !important; }
@media (max-width:560px) {
  ${T} .con-curve__fly { max-width:min(44ch, 92vw); }
}
/* ui-polish-232: on a narrow portrait frame (≤560 wide, ≥601 tall, e.g. 390×844) the two costs stood
   gauge over gauge and took ~125px of the reading, so the inspector ran ~120px past the frame and
   Requires opened under the Back footer. The costs stand side by side as words and figures, the
   arrangement the short frames already use (the "% held" line says what the gauge draws), so the
   unlock list and Requires sit higher on the first paint. */
@media (max-width:560px) and (min-height:601px) {
  ${T} dl.con-dossier__cost { grid-template-columns:repeat(2, minmax(0, 1fr)); column-gap:16px; row-gap:0; margin:4px 0 8px !important; }
  ${T} .con-cost { grid-template-columns:minmax(0, 1fr); }
  ${T} .con-cost__gauge { display:none; }
  ${T} .con-cost dt { line-height:1.2; letter-spacing:.14em; }
  ${T} .con-cost dd { font-size:24px; margin-top:1px; }
  ${T} .con-cost__sub { margin-top:2px; letter-spacing:.06em; }
}
`;

export function injectTechTreeScreens(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.getElementById !== 'function' || typeof doc.createElement !== 'function') return;
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = TECH_TREE;
  doc.head.appendChild(style);
}
