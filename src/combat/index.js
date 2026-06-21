export { createCombatKernel, getCombatKernel } from './kernel.js';
export { createCombatCatalog, ensureCombatState, ensureCombatant } from './runtime.js';
export { createDamageRouter, legacyHitToDamagePacket, normalizeDamagePacket, scalarHitToDamagePacket } from './damage.js';
export { phaseAt } from './actions.js';
export { appendCombatTrace, readCombatTrace, stableStringify } from './trace.js';
export { assertValidCombatCatalog, validateCombatCatalog, validateDamagePacket } from './validate.js';
