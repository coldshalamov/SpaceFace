export { createCombatKernel, getCombatKernel } from './kernel.js';
export { createCombatCatalog, ensureCombatState, ensureCombatant } from './runtime.js';
export { createDamageRouter, legacyHitToDamagePacket, normalizeDamagePacket, scalarHitToDamagePacket } from './damage.js';
export { phaseAt } from './actions.js';
export { appendCombatTrace, readCombatTrace, stableStringify } from './trace.js';
export { assertValidCombatCatalog, validateCombatCatalog, validateDamagePacket } from './validate.js';
export {
  compileAttackSpec,
  digestAttackSpec,
  describeAttackMetrics,
  attackSpecNeedsRuntime,
  attackSpecHasLiveHit,
  attackModifiersFromRun,
  mergeWeaponView,
  ATTACK_SPEC_SCHEMA_VERSION,
} from './attackSpec.js';
export {
  createLineage,
  createProcWorld,
  tryConsumeProc,
  trySpawnDescendant,
  lineageMetrics,
  PROC_COSTS,
  DEFAULT_CONSTRAINTS,
} from './attackLineage.js';
export { describeVolley, emitVolley, tryPierce, trySplit, tryBounce, tryChain, selectChainTarget } from './attackPropagation.js';
export { selectTargets } from './attackTargeting.js';
export { resolveRicochet, steerAfterBounce } from './surfaceReflection.js';
export {
  resolvePayload,
  fieldCouplingForStatusIds,
  statusPeriodicDamageTotal,
  CAUSAL_CHANNEL,
} from './attackPayload.js';
export {
  armAttackContinue,
  collectAttackCandidates,
  requestAttackContinue,
  resolveLiveAttackHit,
} from './attackHit.js';
export {
  createStuntDetector,
  StuntDetector,
  STUNT_SCHEMA_VERSION,
  TrickRarity,
  TRICK_DEFINITIONS,
  KNOWN_TRICK_IDS,
  STUNT_CONSTANTS,
} from './stuntTaxonomy.js';
