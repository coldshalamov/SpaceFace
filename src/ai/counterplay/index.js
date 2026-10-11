export {
  COUNTERPLAY_DOCTRINES,
  COUNTERPLAY_DOCTRINE_IDS,
  TELEGRAPH_TICKS,
  REACTION_DELAY_TICKS,
  counterplayDoctrineById,
  isCounterplayDoctrineId,
} from './catalog.js';
export {
  createCounterplayMemory,
  serializeCounterplayMemory,
  restoreCounterplayMemory,
} from './memory.js';
export {
  limitKnowledge,
  emptySensed,
  segmentBlocked,
  pointSegmentDistance,
  contactByRole,
  forgetStaleIdentity,
  predictReleasePoint,
} from './observe.js';
export { decideCounterplay } from './decide.js';
export { COUNTERPLAY_POLICIES } from './policies.js';
export { gateCounterplayFire } from './authorityGate.js';
export { applyCounterplayIntent, applyCounterplayRepair } from './adapterPatch.js';
