// Deckplate — the SpaceFace design system, one injection. Order is load-bearing: tokens, then
// materials, then components, then the forced-colours restatement (last wins inside its media
// query). Idempotent; safe to import from any surface.
//
// What this module is FOR: every player-facing surface assembles these tokens, materials and
// components. What it forbids: a hand-rolled panel, a one-off accent colour, a bespoke curve.
// The flight HUD (src/ui/views/hudStyles.js) is the first surface built on it; station, pause
// and the chart follow by assembly, not by new styling.

import { injectDeckplatePaint } from './paint.js';
export { withScreenTransition } from './transition.js';
export { dpMark, setDpMark, hasDpMark, factionCrestName, DP_MARK_NAMES } from './marks.js';
export { attachAttentionLamp } from './attend.js';
export { injectDeckplatePaint, DECKPLATE_TYPED_PROPERTIES } from './paint.js';
export { DP_MOTION, replayDpAnimation, dpReducedMotion } from './motion.js';
export { dpIcon, hasDpIcon, DP_ICON_NAMES } from './icons.js';

const STYLE_ID = 'sf-deckplate-style';

export function injectDeckplate(doc = globalThis.document) {
  // The typed properties must exist before the first paint, or the gradients that read them
  // resolve as invalid rather than as their initial value. Registering is idempotent.
  injectDeckplatePaint(doc?.defaultView || globalThis);
  if (!doc?.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('link');
  style.id = STYLE_ID;
  style.rel = 'stylesheet';
  style.href = '/styles/deckplate.generated.css';
  // The station sheet set (src/ui/station/stationStyles.js) may already be in <head> — game boot
  // loads it up front since ledger D15. This sheet writes .sx-* rules the station sheets must
  // beat, the same order first-dock injection produced; landing after it would invert the cascade.
  const stationAnchor = doc.getElementById('sx-fh-tokens');
  if (stationAnchor) doc.head.insertBefore(style, stationAnchor);
  else doc.head.appendChild(style);
}
