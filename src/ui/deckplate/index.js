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
import { DECKPLATE_HARDWARE_CSS } from './hardware.js';
import { DECKPLATE_LAYOUT_CSS } from './layout.js';
import { DECKPLATE_LIGHT_CSS } from './light.js';
import { DECKPLATE_TRANSITION_CSS } from './transition.js';
import { injectDeckplatePaint } from './paint.js';
import { DECKPLATE_SCREENS_CSS } from './screens.js';

export { DECKPLATE_TOKENS_CSS } from './tokens.js';
export { DECKPLATE_MATERIALS_CSS } from './materials.js';
export { DECKPLATE_COMPONENTS_CSS, DECKPLATE_COMPONENTS_FORCED_CSS } from './components.js';
export { DECKPLATE_HARDWARE_CSS } from './hardware.js';
export { DECKPLATE_LAYOUT_CSS } from './layout.js';
export { DECKPLATE_LIGHT_CSS } from './light.js';
export { DECKPLATE_TRANSITION_CSS, withScreenTransition } from './transition.js';
export { dpMark, setDpMark, hasDpMark, factionCrestName, DP_MARK_NAMES } from './marks.js';
export { attachAttentionLamp } from './attend.js';
export { injectDeckplatePaint, DECKPLATE_TYPED_PROPERTIES } from './paint.js';
export { DP_MOTION, replayDpAnimation, dpReducedMotion } from './motion.js';
export { dpIcon, hasDpIcon, DP_ICON_NAMES } from './icons.js';

const STYLE_ID = 'sf-deckplate-style';

/** The combined sheet, exported for tests and for surfaces that build their own style node. */
export const DECKPLATE_CSS =
  DECKPLATE_TOKENS_CSS + '\n' +
  DECKPLATE_MATERIALS_CSS + '\n' +
  DECKPLATE_COMPONENTS_CSS + '\n' +
  DECKPLATE_HARDWARE_CSS + '\n' +
  DECKPLATE_LAYOUT_CSS + '\n' +
  // The second substance. It comes after the machine so a veil can sit over a plate, and before
  // the placement layer so a screen can still position what the light layer defines.
  DECKPLATE_LIGHT_CSS + '\n' +
  DECKPLATE_TRANSITION_CSS + '\n' +
  DECKPLATE_SCREENS_CSS + '\n' +
  DECKPLATE_COMPONENTS_FORCED_CSS;

export function injectDeckplate(doc = globalThis.document) {
  // The typed properties must exist before the first paint, or the gradients that read them
  // resolve as invalid rather than as their initial value. Registering is idempotent.
  injectDeckplatePaint(doc?.defaultView || globalThis);
  if (!doc?.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = DECKPLATE_CSS;
  doc.head.appendChild(style);
}
