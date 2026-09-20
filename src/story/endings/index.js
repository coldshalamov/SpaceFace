// Existing M5 API remains intact. Story is the sole live adapter; no new registry slot.
export {
  BRANCH_FACTION, CAPITAL_SHIP_DEF_IDS, ENDGAME_NET_WORTH_CR, ENDGAME_REP_MIN,
  ENDING_DEFS, ENDING_IDS, SANDBOX_DEF, SANDBOX_ID, SANDBOX_MODE_OPEN_FRONTIER,
  endingDef, isEndingId, isSandboxId, listEndingDefs,
} from './endingDefs.js';
export {
  TOW_CLASS_MIN, evaluateEndingEligibility, evaluateSharedGate, listBoardEligibleEndingIds,
  listEligibleEndingIds, listEndingEligibility, listUniqueEndingIds, snapshotEndingFacts,
  isChoiceECourierReady, assessEndingHistory,
} from './eligibility.js';
export {
  POST_ENDING_SCHEMA, advancePostEndingContinuity, assertEndingUniqueness,
  createPostEndingContinuity, endingReceiptId, normalizePostEndingContinuity,
  planEndingResolution, planPendingConfirmation,
} from './resolve.js';
export { LIFE_LEDGER_SCHEMA, readLifeLedger } from './lifeLedger.js';
export {
  WRITTEN_FINALE_SCHEMA, createWrittenFinale, normalizeWrittenFinale, isWrittenFinaleActive,
  advanceWrittenFinale, writtenEndingArchive, endingAmbientLine, endingHomeGraffiti, endingContinuationLine,
} from './finaleRuntime.js';
