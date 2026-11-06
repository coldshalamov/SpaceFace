// Cinderglass Job — operation model. Owns the phase machine, actor knowledge,
// approach selection and terminal records. Runs inside cinderglassJob's runtime;
// never touches DOM, physics handles, or another owner's state directly.

import {
  CINDERGLASS_JOB_PHASES as P,
  CINDERGLASS_JOB_CUSTODY as C,
  CINDERGLASS_JOB_OUTCOMES as O,
  CINDERGLASS_JOB_TEXT as T,
  CINDERGLASS_JOB_SECTOR_ID,
  CINDERGLASS_JOB_TALA_CONTACT_ID,
  CINDERGLASS_JOB_TALA_BASE_CR,
  CINDERGLASS_JOB_TALA_DAMAGED_CR,
  CINDERGLASS_JOB_BROKER_CR,
  CINDERGLASS_JOB_DEPOSIT_CR,
  CINDERGLASS_JOB_DAMAGED_FRACTION,
} from './definition.js';
import { isBlackFlagAdventure } from '../../shipjack/model.js';
import { cinderglassJobFirstDeliveryComplete } from './contact.js';

function cloneRow(value) {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cloneRow);
  const out = {};
  for (const [key, item] of Object.entries(value)) out[key] = cloneRow(item);
  return out;
}

export const CINDERGLASS_JOB_STATE_VERSION = 1;
const RECEIPTS_CAP = 12;
const FACTS_CAP = 24;
const OFFER_COOLDOWN_S = 90;

export function createCinderglassJobState() {
  return {
    version: CINDERGLASS_JOB_STATE_VERSION,
    runId: 0,
    operationId: null,
    everAdmitted: false,
    cohortAdmitted: false,
    publicRequested: false,
    promptRevision: 0,
    lastRefusal: null,
    pendingReceive: null,
    settlement: null,
    custodyReceipt: null,
    receiveQuote: null,
    approachPrompt: null,
    serviceProgressS: 0,
    laybyRemainingS: 0,
    laybyDone: false,
    phase: P.OFFER,
    approach: null,            // 'negotiated' | 'quiet' | 'violent' once committed
    outcome: null,             // CINDERGLASS_JOB_OUTCOMES row once terminal
    custody: C.CARRIED,
    offer: null,               // { offerId, epoch, expiresAtS, declinedCount }
    offerEpoch: 0,
    nextOfferAtS: 0,
    declinedCount: 0,
    scanDone: false,
    podMarked: false,
    proposalShown: false,
    depositPaid: false,
    depositRefunded: false,
    serviceAttemptId: 0,
    suspicion: 0,              // captain/escort raised awareness 0..3
    captainAlive: true,
    runFinished: false,
    podHullAtRelease: null,
    rememberedFacts: [],       // bounded rows {id, atS, text}
    receipts: [],              // bounded rows {kind, atS, ...}
    actors: {
      tala: { contacted: false, paid: false, knowsOutcome: false },
      dask: { dealAccepted: false, dealRefused: false, alive: true, suspicion: 0, knowsTheft: false },
      broker: { contacted: false, paid: false },
    },
    entities: {
      carrierId: null, escortAId: null, escortBId: null,
      podId: null, cradleId: null, brokerId: null, laybyId: null,
      latchId: null, latchMountId: null, brokerAttachmentId: null,
      carrierJobId: null, escortAJobId: null, escortBJobId: null,
      clampAttachmentId: null, cradleAttachmentId: null,
      pendingClamp: false, clampAttempts: 0,
    },
  };
}

export function rememberFact(st, atS, id, text) {
  if (!st.rememberedFacts) st.rememberedFacts = [];
  const existing = st.rememberedFacts.find((f) => f && f.id === id);
  if (existing) { existing.text = text; return; }
  st.rememberedFacts.push({ id, atS: Number(atS) || 0, text });
  if (st.rememberedFacts.length > FACTS_CAP) st.rememberedFacts.splice(0, st.rememberedFacts.length - FACTS_CAP);
}

export function recordReceipt(st, atS, row) {
  if (!st.receipts) st.receipts = [];
  st.receipts.push({ atS: Number(atS) || 0, ...row });
  if (st.receipts.length > RECEIPTS_CAP) st.receipts.splice(0, st.receipts.length - RECEIPTS_CAP);
}

/* ── Eligibility ── */
export function cinderglassJobOfferEligible(state) {
  if (!isBlackFlagAdventure(state)) return false;
  if ((state.world && state.world.currentSectorId) !== CINDERGLASS_JOB_SECTOR_ID) return false;
  if (!cinderglassJobFirstDeliveryComplete(state)) return false;
  if (!state.player) return false;
  return true;
}

export function cinderglassJobOfferOpen(st, state) {
  if (!st.publicRequested) return false;
  if (!cinderglassJobOfferEligible(state)) return false;
  if (st.outcome && st.outcome !== O.DECLINED) return false;  // story closed for this run
  if (st.phase !== P.OFFER && st.phase !== P.CLOSED) return false;
  if (st.offer && st.offer.open) return false;
  return Number(state.simTime) >= Number(st.nextOfferAtS || 0);
}

export function cinderglassJobMakeOffer(st, state) {
  const offerId = `cg_offer_${++st.offerEpoch}`;
  st.outcome = null;                       // a fresh offer after decline reopens the operation
  st.phase = P.OFFER;
  st.offer = { offerId, open: true, offeredAtS: Number(state.simTime) || 0 };
  st.actors.tala.contacted = true;
  return {
    offerId,
    operationId: st.operationId,
    epoch: st.offerEpoch,
    fromId: CINDERGLASS_JOB_TALA_CONTACT_ID,
    fromName: 'Tala Rook',
    title: T.offerTitle,
    line: T.offerLine,
    detail: T.offerDetail,
    terms: {
      intactCr: CINDERGLASS_JOB_TALA_BASE_CR,
      damagedCr: CINDERGLASS_JOB_TALA_DAMAGED_CR,
      depositCr: CINDERGLASS_JOB_DEPOSIT_CR,
      brokerCr: CINDERGLASS_JOB_BROKER_CR,
    },
    actions: [
      { id: 'accept', label: T.accept },
      { id: 'decline', label: T.decline },
    ],
  };
}

export function cinderglassJobDecline(st, state) {
  st.declinedCount = (st.declinedCount | 0) + 1;
  st.offer = null;
  st.publicRequested = false;
  st.nextOfferAtS = (Number(state.simTime) || 0) + OFFER_COOLDOWN_S;
  st.outcome = O.DECLINED;
  st.phase = P.CLOSED;
  rememberFact(st, Number(state.simTime) || 0, 'declined', T.declinedLine);
}

/* ── Terminal records ── */
export function cinderglassJobClose(st, atS, outcome, extra = {}) {
  if (st.outcome) return null;
  st.outcome = { id: outcome, atS: Number(atS) || 0, ...cloneRow(extra) };
  st.phase = P.CLOSED;
  st.offer = null;
  st.approachPrompt = null;
  st.receiveQuote = null;
  st.actors.tala.knowsOutcome = true;
  return st.outcome;
}

/* ── Approach selection (one-time, honest) ── */
export function cinderglassJobCommitApproach(st, approach) {
  st.approach = approach;
  return st.approach;
}
