// ORRERY New Game — the screen's own sheet (design/frontend/ORRERY.md §6 New game).
// This is the composition file the newGame screen owns: rules that answer the screen's own
// audit and belong to no shared sheet. It sits BESIDE the shared overlays this screen also
// loads — `newGameLayouts.js` (the 2026-10 polish overlay, shared) and the `.orr-newgame`
// block in `screenLayouts.js` (the library sheet). Those are off-limits to the screen, so a
// one-character name apart: newGameLayouts.js is shared, this file (new-gameLayouts.js) is
// the screen's. Scoped to `.orr-newgame` only; nothing here styles another surface.
//
// What it answers (audit 2026-10-24, shots `new-game` @1920×1080 + 1366×768):
// - the seed is a code: ORRERY §3.4 reserves Spline Sans Mono for seeds; the input painted it
//   in the display face like the pilot name.
// - a disabled field must look disabled: Launch dims every word via aria-disabled, but the
//   pilot/seed inputs and the Run+ keepsake select kept full ink.
// - ≤860px-tall viewports collapsed the form's section gaps to 4px (the shared sheet's
//   "keep every Tab stop above the fold" band) and the column read as one wall of type; the
//   foot with Launch is its own grid row now, so the air can come back without hurting reach.
// - the difficulty stop words carried the caption padding (2px vertical): a ~20px hit target
//   under the 24px WCAG floor. stopDial re-measures its stations, so the word can breathe.

import { injectOrrery } from './tokens.js';

const STYLE_ID = 'sf-orrery-new-game-screen';
// Same selector shape the shared overlays use (html body, the doubled screen class): the shared
// polish sheet pins colour at (1,4,2) !important, and a quieter base would lose to it.
const NG = 'html body #screens > .k-screen.orr-newgame.orr-newgame';
const BONE = 'var(--dp-ink, #e8e2d4)';

// Colour-bearing rules sit under (forced-colors: none): there the system palette owns every
// word and the UA already grays disabled text. Type, spacing and hit-target rules stay global.
export const NEW_GAME_SCREEN_CSS = `
/* the seed is a code (ORRERY §3.4): mono face, tabular, one tracking step loose */
${NG} .orr-ng-seed {
  font-family:var(--dp-face-code, "Spline Sans Mono") !important;
  font-size:17px !important; font-weight:450 !important; letter-spacing:.09em;
  font-variant-numeric:tabular-nums; }
${NG} .orr-ng-seed::placeholder { letter-spacing:.03em; }

@media (forced-colors: none) {
  /* a spent field reads spent: dim ink, no caret, dim placeholder */
  ${NG} .orr-ng-input:disabled,
  ${NG} .orr-ng-input[aria-disabled="true"] {
    color:color-mix(in srgb, ${BONE} 38%, transparent) !important;
    caret-color:transparent !important; }
  ${NG} .orr-ng-input:disabled::placeholder {
    color:color-mix(in srgb, ${BONE} 24%, transparent) !important; }

  /* the seed hint: the field's one correction line, in the etched label voice */
  ${NG} .orr-ng-seed-hint {
    margin:6px 0 0; font-family:var(--dp-face-label, "Archivo"); font-stretch:112%;
    font-weight:600; font-size:12px; letter-spacing:.14em; text-transform:uppercase;
    color:color-mix(in srgb, ${BONE} 66%, transparent); }
}

/* difficulty stops: a choice is a hit target, not a caption (the row scale re-measures) */
${NG} .orr-stopscale .k-word { padding:8px 6px !important; }

/* short viewports: the shared band compresses the section gaps to 4px, which reads as one
   wall of type. One beat of air back — the foot (Back / Launch) is its own grid row, so
   column scroll cannot hide the primary verb. */
@media (max-height:860px) {
  ${NG} .orr-ng-gap { height:9px; }
}
`;

export function injectNewGameScreenSheet(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.getElementById !== 'function' || typeof doc.createElement !== 'function') return;
  injectOrrery(doc);
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = NEW_GAME_SCREEN_CSS;
  doc.head.appendChild(style);
}
