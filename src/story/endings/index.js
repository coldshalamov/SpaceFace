// Public API: pure B7 endings eligibility + resolution plans (M5).
// story.js is the sole live adapter. No registered system.

export {
  BRANCH_FACTION,
  CAPITAL_SHIP_DEF_IDS,
  ENDGAME_NET_WORTH_CR,
  ENDGAME_REP_MIN,
  ENDING_DEFS,
  ENDING_IDS,
  SANDBOX_DEF,
  SANDBOX_ID,
  SANDBOX_MODE_OPEN_FRONTIER,
  endingDef,
  isEndingId,
  isSandboxId,
  listEndingDefs,
} from './endingDefs.js';

export {
  evaluateEndingEligibility,
  evaluateSharedGate,
  listBoardEligibleEndingIds,
  listEligibleEndingIds,
  listEndingEligibility,
  listUniqueEndingIds,
  snapshotEndingFacts,
} from './eligibility.js';

export {
  POST_ENDING_SCHEMA,
  advancePostEndingContinuity,
  assertEndingUniqueness,
  createPostEndingContinuity,
  endingReceiptId,
  normalizePostEndingContinuity,
  planEndingResolution,
  planPendingConfirmation,
} from './resolve.js';
