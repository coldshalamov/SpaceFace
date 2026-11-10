// Mercy Service public surface. Importing this module does not register a system
// and does not touch missions, jobs, or world placement.

export { MERCY_DT, MERCY_SCHEMA, PHASES } from './constants.js';
export { MODEL_IDS, MERCY_MODELS, modelStateOf, worldParts } from './models.js';
export { STARTER_TETHER, secureCapability } from './equipment.js';
export { canonicalSuccessTrace, phaseOf } from './gates.js';
export {
  INCIDENTS, boardIncidents, incidentById, validateCatalog,
} from './incidents.js';
export { commandFor, zeroCommand } from './pilot.js';
export { noteImpact } from './physics.js';
export {
  acceptContract, beginIncident, commandFromGameState, createMercyFixtureSystem,
  createMercyRuntime, createMercyServiceSystem, damagePlayer, destroyMercyRuntime, destroyRescueBody,
  report, restoreMercy, runIncident, seedSector, shelveMercy, snapshotMercy,
  stepMercy, syncFocus, unshelveMercy, worldDigest,
} from './runtime.js';

export const MERCY_OWNER = 'src/response/mercyService';
