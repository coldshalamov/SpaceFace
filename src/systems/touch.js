// Public compatibility facade. legacyTouch.js is the unchanged pre-mobile touch module.
// Preserve the Steam Deck/trackpad helpers and settings API imported by existing consumers.
export * from './legacyTouch.js';
import { createTouch as createLegacyTouch } from './legacyTouch.js';
import { enhanceMobileTouch } from './mobile/bridge.js';
export function createTouch(ctx) {
  return enhanceMobileTouch(createLegacyTouch(ctx), ctx);
}
