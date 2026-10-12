// Public compatibility facade. legacyTouch.js is the unchanged pre-mobile touch module.
// Preserve the Steam Deck/trackpad helpers and settings API imported by existing consumers.
export * from './legacyTouch.js';
import { createTouch as createLegacyTouch } from './legacyTouch.js';
import { enhanceMobileTouch } from './mobile/bridge.js';
import { createLaneTouchReducer } from './mobile/laneTouchReducer.js';
export function createTouch(ctx) {
  // Test seam. `legacy: true` keeps the old dual-stick overlay for the checks that pin it
  // (scripts/check-input-modalities.mjs); the live route always gets the phone deck. Other keys
  // (win, doc, mountView) are the bridge's own injection points. `lane: 'worker'` is the
  // worker-realm twin: no DOM — resolved frames arrive as lane descriptors.
  const seams = (ctx && ctx.mobileSeams)
    || (ctx && ctx.helpers && ctx.helpers.mobileSeams) || {};
  if (seams.lane === 'worker') return createLaneTouchReducer();
  const legacy = createLegacyTouch(ctx);
  if (seams.legacy === true) return legacy;
  return enhanceMobileTouch(legacy, ctx, seams);
}
