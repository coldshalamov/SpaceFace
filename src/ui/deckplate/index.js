// Deckplate — the SpaceFace design system, one injection. Order is load-bearing: tokens, then
// materials, then components, then the forced-colours restatement (last wins inside its media
// query). Idempotent; safe to import from any surface.
//
// What this module is FOR: every player-facing surface assembles these tokens, materials and
// components. What it forbids: a hand-rolled panel, a one-off accent colour, a bespoke curve.
// The flight HUD (src/ui/views/hudStyles.js) is the first surface built on it; station, pause
// and the chart follow by assembly, not by new styling.

import { DECKPLATE_TOKENS_CSS } from './tokens.js';
import { DECKPLATE_MATERIALS_CSS } from './materials.js';
import { DECKPLATE_COMPONENTS_CSS, DECKPLATE_COMPONENTS_FORCED_CSS } from './components.js';

export { DECKPLATE_TOKENS_CSS } from './tokens.js';
export { DECKPLATE_MATERIALS_CSS } from './materials.js';
export { DECKPLATE_COMPONENTS_CSS, DECKPLATE_COMPONENTS_FORCED_CSS } from './components.js';
export { DP_MOTION, replayDpAnimation, dpReducedMotion } from './motion.js';

const STYLE_ID = 'sf-deckplate-style';

/** The combined sheet, exported for tests and for surfaces that build their own style node. */
export const DECKPLATE_CSS =
  DECKPLATE_TOKENS_CSS + '\n' +
  DECKPLATE_MATERIALS_CSS + '\n' +
  DECKPLATE_COMPONENTS_CSS + '\n' +
  DECKPLATE_COMPONENTS_FORCED_CSS;

export function injectDeckplate(doc = globalThis.document) {
  if (!doc?.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = DECKPLATE_CSS;
  doc.head.appendChild(style);
}
