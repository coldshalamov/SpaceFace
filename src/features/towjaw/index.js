/** TOWJAW public integration surface. Import the small damageBridge directly
 * from the shared damage owner to avoid loading runtime/encounter modules there. */
export { TOWJAW, TOWJAW_CATALOG, TOWJAW_SLOTS, TOWJAW_MECHANISMS, TOWJAW_ATTACKS } from './catalog.js';
export { createTowjawController } from './controller.js';
export {
  buildTowjawSpawnSpecs, createTowjawRuntime, createTowjawSystem,
  getActiveTowjawRuntime, isTowjawClockInstalled,
} from './runtime.js';
export { TOWJAW_ENCOUNTER_RUNTIME } from './encounter.js';
export { interceptTowjawDamage, registerTowjawDamageRoute } from './damageBridge.js';
export {
  TOWJAW_PRESENTATION_RECIPES, buildTowjawPresentationFrame,
  createTowjawOverlay, createTowjawPresentation, mountTowjawPresentation,
  describeTowjawPresentationEvent, emitTowjawPresentationEvent,
  towjawPresentationPolicy, towjawShapeOutlines,
} from './presentation.js';
