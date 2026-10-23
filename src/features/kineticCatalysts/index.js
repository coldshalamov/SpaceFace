// Deliberate public seam. Simulation imports remain renderer- and DOM-independent.
export {
  CATALYST_IDS, CATALYST_EXCLUSIVE_GROUP, KINETIC_CATALYSTS,
  CATALYST_CATALOG, CATALYST_MODULES, KINETIC_LIMITS, resolveCatalyst,
} from './catalog.js';
export { createKineticCatalystKernel } from './kernel.js';
export {
  CATALYST_TRIAL_RECEIPT_ID, validateCatalystFittings, readFittedCatalyst,
  findCatalystFitConflict, normalizeCatalystReceipts, readCatalystTrialReceipt,
  claimCatalystTrial, completeCatalystTrial,
} from './fitting.js';
export {
  createKineticCatalystsRuntime, kineticCatalysts, kineticCatalystsFor,
} from './runtime.js';
export { TRIAL_CONFIG, catalystTrialEvidence, KINETIC_CATALYST_TRIAL_RUNTIME } from './fieldTrial.js';
export {
  CATALYST_PRESENTATION_LIMITS, createCatalystPresentationFrame,
  buildCatalystPresentation, createCatalystPresentationAdapter,
} from './presentation.js';
