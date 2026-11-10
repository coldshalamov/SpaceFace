// ORRERY polish overlay for the title's reference line (HELP · ARCHIVE · CIRCUITS · PHYSICS
// CHALLENGES · SANDBOX). Layout and type only, scoped to the dial title (`.orr-title`); the phone
// column is untouched. Selectors, IDs, labels and DOM order unchanged.
//
// The line is one stop on the dial, set as a single row out from the south-east tick. At five words
// that row ran ~600px over the held world and SANDBOX landed on the ship's nose at 1280×720 and
// 1920×1080 (at 960×540 the row ran the ship's whole length). It now sets as a compact block of three
// short lines under the same tick — HELP · ARCHIVE / CIRCUITS · SANDBOX / PHYSICS CHALLENGES — so the
// reference words stay on the dark rock left of the ship at every desktop size.

import { injectOrrery } from './tokens.js';

const STYLE_ID = 'sf-orrery-title-aside-layouts';
const ASIDE = 'html body .of-title.orr-title .orr-arcrail-host > ul.of-title-aside.orr-arcrail__extra';

export const TITLE_ASIDE_LAYOUT_CSS = `
/* three lines on the one stop: two zero-height flex breaks, after the second and fourth words. The
   breaks only interleave with the DOM order (HELP, ARCHIVE, CIRCUITS, SANDBOX, PHYSICS CHALLENGES), so
   Tab and the arrow keys still read the block left to right, top to bottom. */
${ASIDE} {
  flex-wrap:wrap !important; column-gap:18px !important; row-gap:4px !important;
  /* the block's max-content box is wider than its lines: only the words take the pointer */
  pointer-events:none !important; }
${ASIDE} > li { pointer-events:auto; }
${ASIDE} > li:nth-child(-n+2) { order:1; }
${ASIDE}::before { content:""; order:2; flex:0 0 100%; height:0; }
${ASIDE} > li:nth-child(n+3):nth-child(-n+4) { order:3; }
${ASIDE}::after { content:""; order:4; flex:0 0 100%; height:0; }
${ASIDE} > li:nth-child(n+5) { order:5; }
/* the words sit over lit rock rather than void: each carries a halo of dark (light, not a box) */
${ASIDE} .dp-lit__item {
  text-shadow:0 0 2px rgb(4 6 9 / .95), 0 0 8px rgb(4 6 9 / .85), 0 0 18px rgb(4 6 9 / .6) !important; }
/* 1080p: the verbs scale with the height and the etch size does not, so the block read as a caption
   beside them. One step up keeps it the quiet tier without going unreadable. */
@media (min-height:1000px) {
  ${ASIDE} { column-gap:22px !important; }
  ${ASIDE} .dp-lit__item { font-size:calc(var(--dp-fs-etch) * 1.25) !important; }
}
`;

export function injectTitleAsideLayouts(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.getElementById !== 'function' || typeof doc.createElement !== 'function') return;
  injectOrrery(doc);
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = TITLE_ASIDE_LAYOUT_CSS;
  doc.head.appendChild(style);
}
