// Prospector origin chain — self-contained M3 candidate system.
//
// Listens to live authorities (scanner / mining / tether / cargo / economy) via the bus.
// Never writes cargo or credits directly: rewards emit economy:grantCredits only.
// Not registered in registry.js (lead integrates). Deterministic: state.rng + state.simTime.
//
// Integration seams (see submission.json):
//   - register as a system OR call init/update from onboarding/station hub
//   - saveSystem serialize/deserialize hooks
//   - first-dock UI offer panel (reads getOffer / accept / decline)
//   - origin-contract harness imports this module

import {
  PROSPECTOR_EVENTS,
  PROSPECTOR_EXTRACT_TARGET_U,
  PROSPECTOR_MAX_OFFERS,
  PROSPECTOR_OFFER,
  PROSPECTOR_ORIGIN_FAMILY,
  PROSPECTOR_ORIGIN_ID,
  PROSPECTOR_ORIGIN_SCHEMA_ID,
  PROSPECTOR_ORIGIN_SCHEMA_VERSION,
  PROSPECTOR_REOFFER_COOLDOWN_S,
  PROSPECTOR_REWARD,
  PROSPECTOR_STATUS,
  PROSPECTOR_STEP_IDS,
  PROSPECTOR_STEP_STATUS,
  PROSPECTOR_STEPS,
  assertProspectorCopyBudget,
} from './prospectorOriginDefs.js';
import {
  appraiseDeposit,
  cargoMassPressure,
  gradeAtLeast,
  holdHasOre,
  pickBestDepositAppraisal,
} from './prospectorOriginAppraisal.js';
import {
  appendRecoveryLog,
  createProspectorOriginState,
  deserializeProspectorOrigin,
  ensureProspectorOriginState,
  migrateProspectorOriginState,
  serializeProspectorOrigin,
  touchProspectorOrigin,
} from './prospectorOriginState.js';
import { COMMODITIES } from '../../data/commodities.js';

const ORE_COMMODITY_IDS = new Set(
  COMMODITIES.filter((commodity) => commodity && commodity.category === 'raw ore')
    .map((commodity) => commodity.id),
);

export {
  PROSPECTOR_EVENTS,
  PROSPECTOR_EXTRACT_TARGET_U,
  PROSPECTOR_MAX_OFFERS,
  PROSPECTOR_OFFER,
  PROSPECTOR_ORIGIN_FAMILY,
  PROSPECTOR_ORIGIN_ID,
  PROSPECTOR_ORIGIN_SCHEMA_ID,
  PROSPECTOR_ORIGIN_SCHEMA_VERSION,
  PROSPECTOR_REOFFER_COOLDOWN_S,
  PROSPECTOR_REWARD,
  PROSPECTOR_STATUS,
  PROSPECTOR_STEP_IDS,
  PROSPECTOR_STEP_STATUS,
  PROSPECTOR_STEPS,
  assertProspectorCopyBudget,
  appraiseDeposit,
  cargoMassPressure,
  createProspectorOriginState,
  deserializeProspectorOrigin,
  ensureProspectorOriginState,
  gradeAtLeast,
  holdHasOre,
  migrateProspectorOriginState,
  pickBestDepositAppraisal,
  serializeProspectorOrigin,
};

function simNow(state) {
  return Number.isFinite(state && state.simTime) ? state.simTime : 0;
}

function emit(bus, event, payload) {
  if (bus && typeof bus.emit === 'function') bus.emit(event, payload);
}

function ownOf(state) {
  return ensureProspectorOriginState(state, simNow(state));
}

function activeStep(own) {
  if (!own || !own.activeStepId) return null;
  return own.steps[own.activeStepId] || null;
}

function setStepStatus(step, status) {
  if (step) step.status = status;
}

function activateStep(own, stepId, simTime, bus) {
  own.stepIndex = PROSPECTOR_STEP_IDS.indexOf(stepId);
  own.activeStepId = stepId;
  const step = own.steps[stepId];
  if (!step) return;
  setStepStatus(step, PROSPECTOR_STEP_STATUS.ACTIVE);
  step.attempts += 1;
  if (step.startedAt == null) step.startedAt = simTime;
  touchProspectorOrigin(own, simTime);
  emit(bus, PROSPECTOR_EVENTS.STEP_ACTIVE, {
    originId: PROSPECTOR_ORIGIN_ID,
    stepId,
    index: own.stepIndex,
    objective: PROSPECTOR_STEPS[stepId].objective,
    simTime,
  });
  emit(bus, PROSPECTOR_EVENTS.PROGRESS, progressSnapshot(own, simTime));
}

function completeStep(own, stepId, simTime, bus, detail = {}) {
  const step = own.steps[stepId];
  if (!step) return;
  setStepStatus(step, PROSPECTOR_STEP_STATUS.DONE);
  step.completedAt = simTime;
  touchProspectorOrigin(own, simTime);
  emit(bus, PROSPECTOR_EVENTS.STEP_DONE, {
    originId: PROSPECTOR_ORIGIN_ID,
    stepId,
    index: step.index,
    simTime,
    ...detail,
  });
  const nextIndex = step.index + 1;
  if (nextIndex >= PROSPECTOR_STEP_IDS.length) {
    completeOrigin(own, simTime, bus);
    return;
  }
  activateStep(own, PROSPECTOR_STEP_IDS[nextIndex], simTime, bus);
}

function failStep(own, stepId, simTime, bus, failureId, copy) {
  const step = own.steps[stepId];
  const def = PROSPECTOR_STEPS[stepId];
  if (!step || !def) return;
  setStepStatus(step, PROSPECTOR_STEP_STATUS.FAILED);
  step.failCount += 1;
  step.lastFailureId = failureId || def.failure.id;
  touchProspectorOrigin(own, simTime);
  emit(bus, PROSPECTOR_EVENTS.STEP_FAILED, {
    originId: PROSPECTOR_ORIGIN_ID,
    stepId,
    failureId: step.lastFailureId,
    copy: copy || def.failure.copy,
    recovery: def.failure.recovery,
    simTime,
  });
}

function recoverStep(own, stepId, simTime, bus, recoveryId) {
  const step = own.steps[stepId];
  const def = PROSPECTOR_STEPS[stepId];
  if (!step || !def) return;
  setStepStatus(step, PROSPECTOR_STEP_STATUS.RECOVERING);
  step.recoveryCount += 1;
  step.lastRecoveryId = recoveryId || def.failure.recovery;
  appendRecoveryLog(own, {
    stepId,
    failureId: step.lastFailureId,
    recoveryId: step.lastRecoveryId,
  }, simTime);
  emit(bus, PROSPECTOR_EVENTS.STEP_RECOVERED, {
    originId: PROSPECTOR_ORIGIN_ID,
    stepId,
    recoveryId: step.lastRecoveryId,
    simTime,
  });
  // Resume the same step after recovery (meaningful retry, not skip).
  setStepStatus(step, PROSPECTOR_STEP_STATUS.ACTIVE);
  own.activeStepId = stepId;
  own.stepIndex = step.index;
  touchProspectorOrigin(own, simTime);
  emit(bus, PROSPECTOR_EVENTS.PROGRESS, progressSnapshot(own, simTime));
}

function completeOrigin(own, simTime, bus) {
  own.status = PROSPECTOR_STATUS.COMPLETED;
  own.completedAt = simTime;
  own.activeStepId = null;
  own.stepIndex = PROSPECTOR_STEP_IDS.length - 1;
  touchProspectorOrigin(own, simTime);
  grantReward(own, simTime, bus);
  emit(bus, PROSPECTOR_EVENTS.COMPLETED, {
    originId: PROSPECTOR_ORIGIN_ID,
    binding: false,
    reward: { ...own.reward, granted: own.rewardGranted },
    simTime,
  });
  emit(bus, PROSPECTOR_EVENTS.PROGRESS, progressSnapshot(own, simTime));
}

function grantReward(own, simTime, bus) {
  if (!own || own.rewardGranted) return false;
  own.rewardGranted = true;
  own.reward.grantedAt = simTime;
  if (!own.marks.includes(PROSPECTOR_REWARD.markId)) {
    own.marks.push(PROSPECTOR_REWARD.markId);
  }
  touchProspectorOrigin(own, simTime);
  // Single-writer: credits only via economy intent.
  emit(bus, 'economy:grantCredits', {
    amount: PROSPECTOR_REWARD.credits,
    reason: PROSPECTOR_REWARD.reason,
  });
  emit(bus, PROSPECTOR_EVENTS.REWARD, {
    originId: PROSPECTOR_ORIGIN_ID,
    credits: PROSPECTOR_REWARD.credits,
    markId: PROSPECTOR_REWARD.markId,
    grossValueCr: PROSPECTOR_REWARD.grossValueCr,
    simTime,
  });
  return true;
}

export function progressSnapshot(own, simTime = 0) {
  if (!own) return null;
  const step = activeStep(own);
  return {
    originId: PROSPECTOR_ORIGIN_ID,
    family: PROSPECTOR_ORIGIN_FAMILY,
    binding: false,
    status: own.status,
    stepIndex: own.stepIndex,
    activeStepId: own.activeStepId,
    objective: step && PROSPECTOR_STEPS[step.id]
      ? PROSPECTOR_STEPS[step.id].objective
      : null,
    steps: PROSPECTOR_STEP_IDS.map((id) => ({
      id,
      status: own.steps[id].status,
      oreCollected: own.steps[id].oreCollected,
      appraisals: own.steps[id].appraisals,
      soldQty: own.steps[id].soldQty,
    })),
    rewardGranted: own.rewardGranted,
    simTime,
  };
}

/** Whether first-dock / re-offer rules allow an offer right now. */
export function canOfferProspectorOrigin(state, simTime) {
  const own = ensureProspectorOriginState(state, simTime);
  if (!own) return false;
  if (own.status === PROSPECTOR_STATUS.ACTIVE) return false;
  if (own.status === PROSPECTOR_STATUS.COMPLETED) return false;
  if (own.status === PROSPECTOR_STATUS.OFFERED) return false;
  if (own.offerCount >= PROSPECTOR_MAX_OFFERS) return false;
  if (own.status === PROSPECTOR_STATUS.DECLINED) {
    const last = own.lastDeclineAt != null ? own.lastDeclineAt : own.lastOfferAt;
    if (last != null && simTime - last < PROSPECTOR_REOFFER_COOLDOWN_S) return false;
  }
  return true;
}

/**
 * Non-binding first-dock offer. Safe to call on every dock:docked;
 * only fires when canOffer is true. Records firstDockAt once.
 */
export function offerProspectorOrigin(state, payload = {}, bus = null) {
  const simTime = simNow(state);
  const own = ownOf(state);
  if (!own) return null;

  if (own.firstDockAt == null) {
    own.firstDockAt = simTime;
    own.firstDockStationId = payload.stationId != null ? String(payload.stationId) : null;
  }

  if (!canOfferProspectorOrigin(state, simTime)) {
    return getOfferView(state);
  }

  own.status = PROSPECTOR_STATUS.OFFERED;
  own.offerCount += 1;
  own.lastOfferAt = simTime;
  touchProspectorOrigin(own, simTime);

  const offer = getOfferView(state);
  emit(bus, PROSPECTOR_EVENTS.OFFERED, {
    originId: PROSPECTOR_ORIGIN_ID,
    binding: false,
    offerCount: own.offerCount,
    stationId: own.firstDockStationId,
    simTime,
    offer,
  });
  return offer;
}

export function getOfferView(state) {
  const own = state && state.careers && state.careers.origins
    ? state.careers.origins.prospector
    : null;
  return {
    ...PROSPECTOR_OFFER,
    status: own ? own.status : PROSPECTOR_STATUS.IDLE,
    offerCount: own ? own.offerCount : 0,
    canAccept: !!(own && own.status === PROSPECTOR_STATUS.OFFERED),
    canDecline: !!(own && own.status === PROSPECTOR_STATUS.OFFERED),
    rewardPreview: {
      credits: PROSPECTOR_REWARD.credits,
      markId: PROSPECTOR_REWARD.markId,
      grossValueCr: PROSPECTOR_REWARD.grossValueCr,
      peerCapCr: PROSPECTOR_REWARD.peerCapCr,
    },
  };
}

export function acceptProspectorOrigin(state, bus = null) {
  const simTime = simNow(state);
  const own = ownOf(state);
  if (!own || own.status !== PROSPECTOR_STATUS.OFFERED) {
    return { ok: false, reason: 'not_offered' };
  }
  own.status = PROSPECTOR_STATUS.ACTIVE;
  own.acceptedAt = simTime;
  own.binding = false;
  touchProspectorOrigin(own, simTime);
  emit(bus, PROSPECTOR_EVENTS.ACCEPTED, {
    originId: PROSPECTOR_ORIGIN_ID,
    binding: false,
    excludesOtherOrigins: false,
    simTime,
  });
  activateStep(own, PROSPECTOR_STEP_IDS[0], simTime, bus);
  return { ok: true, progress: progressSnapshot(own, simTime) };
}

export function declineProspectorOrigin(state, bus = null) {
  const simTime = simNow(state);
  const own = ownOf(state);
  if (!own || own.status !== PROSPECTOR_STATUS.OFFERED) {
    return { ok: false, reason: 'not_offered' };
  }
  own.status = PROSPECTOR_STATUS.DECLINED;
  own.lastDeclineAt = simTime;
  own.activeStepId = null;
  own.stepIndex = -1;
  touchProspectorOrigin(own, simTime);
  emit(bus, PROSPECTOR_EVENTS.DECLINED, {
    originId: PROSPECTOR_ORIGIN_ID,
    binding: false,
    reofferAfterS: PROSPECTOR_REOFFER_COOLDOWN_S,
    simTime,
  });
  return { ok: true, reofferAfterS: PROSPECTOR_REOFFER_COOLDOWN_S };
}

/** Abandon mid-chain (still non-binding; does not lock other careers). */
export function abandonProspectorOrigin(state, bus = null) {
  const simTime = simNow(state);
  const own = ownOf(state);
  if (!own || own.status !== PROSPECTOR_STATUS.ACTIVE) {
    return { ok: false, reason: 'not_active' };
  }
  own.status = PROSPECTOR_STATUS.ABANDONED;
  own.abandonedAt = simTime;
  own.activeStepId = null;
  touchProspectorOrigin(own, simTime);
  return { ok: true };
}

// ── Live authority handlers ──────────────────────────────────────────────────

export function handleScanCompleted(state, payload = {}, bus = null) {
  const own = ownOf(state);
  if (!own || own.status !== PROSPECTOR_STATUS.ACTIVE) return null;
  const step = activeStep(own);
  if (!step || step.id !== 'appraise') return null;
  if (step.status !== PROSPECTOR_STEP_STATUS.ACTIVE
    && step.status !== PROSPECTOR_STEP_STATUS.RECOVERING) {
    return null;
  }

  const simTime = simNow(state);
  const found = payload.found || {};
  const asteroidsFound = Math.max(0, Math.floor(Number(found.asteroids) || 0));

  // Normal play stamps scanned asteroids before emitting scan:completed. Prefer that live
  // authority; payload.entities remains a supporting harness seam only.
  let appraisal = null;
  if (state.entityList || (state.entities && state.entities.values)) {
    const list = state.entityList
      || (state.entities ? [...state.entities.values()] : []);
    const scanned = list.filter((e) => e && e.type === 'asteroid' && e.data
      && (e.data.scanOreGlyph || e.data.scanHighlightUntil));
    if (scanned.length) appraisal = pickBestDepositAppraisal(scanned);
  }
  if (!appraisal && Array.isArray(payload.entities) && payload.entities.length) {
    appraisal = pickBestDepositAppraisal(payload.entities);
  }

  if (!appraisal || !appraisal.ok || asteroidsFound <= 0) {
    failStep(own, 'appraise', simTime, bus, 'empty_pulse');
    // Immediate recovery path: stay on step, teach retry.
    recoverStep(own, 'appraise', simTime, bus, 'retry_scan');
    return { ok: false, recovery: 'retry_scan' };
  }

  step.appraisals += 1;
  step.bestGrade = appraisal.grade;
  step.depositId = appraisal.depositId;
  touchProspectorOrigin(own, simTime);

  emit(bus, PROSPECTOR_EVENTS.APPRAISAL, {
    originId: PROSPECTOR_ORIGIN_ID,
    appraisal,
    simTime,
  });

  if (!appraisal.meetsMinGrade) {
    failStep(own, 'appraise', simTime, bus, 'low_grade');
    recoverStep(own, 'appraise', simTime, bus, 'retry_scan');
    return { ok: false, recovery: 'retry_scan', appraisal };
  }

  completeStep(own, 'appraise', simTime, bus, { appraisal });
  return { ok: true, appraisal };
}

export function handleMiningYield(state, payload = {}, bus = null) {
  const own = ownOf(state);
  if (!own || own.status !== PROSPECTOR_STATUS.ACTIVE) return null;
  const step = activeStep(own);
  if (!step || step.id !== 'extract') return null;
  if (step.status === PROSPECTOR_STEP_STATUS.FAILED) return null;

  const simTime = simNow(state);
  const qty = Math.max(0, Math.floor(Number(payload.qty) || 0));
  if (qty <= 0) return null;

  // Fail closed: missing minerId is not evidence that the player mined this yield.
  if (payload.minerId == null || state.playerId == null || payload.minerId !== state.playerId) return null;
  const commodityId = String(payload.commodityId || '');
  if (!ORE_COMMODITY_IDS.has(commodityId)) return null;

  step.oreCollected += qty;
  own.minedOre[commodityId] = (own.minedOre[commodityId] || 0) + qty;
  touchProspectorOrigin(own, simTime);

  const pressure = cargoMassPressure(state);
  if (pressure.strained) {
    step.riskEvents += 1;
    emit(bus, PROSPECTOR_EVENTS.RISK, {
      originId: PROSPECTOR_ORIGIN_ID,
      kind: 'mass_strain',
      pressure,
      simTime,
    });
  }

  emit(bus, PROSPECTOR_EVENTS.PROGRESS, progressSnapshot(own, simTime));

  if (step.oreCollected >= PROSPECTOR_EXTRACT_TARGET_U) {
    completeStep(own, 'extract', simTime, bus, {
      oreCollected: step.oreCollected,
      riskEvents: step.riskEvents,
    });
    return { ok: true, oreCollected: step.oreCollected };
  }
  return { ok: true, partial: true, oreCollected: step.oreCollected };
}

export function handleCargoFull(state, payload = {}, bus = null) {
  const own = ownOf(state);
  if (!own || own.status !== PROSPECTOR_STATUS.ACTIVE) return null;
  const step = activeStep(own);
  if (!step || step.id !== 'extract') return null;

  const simTime = simNow(state);
  step.riskEvents += 1;
  failStep(own, 'extract', simTime, bus, 'hold_jammed');
  recoverStep(own, 'extract', simTime, bus, 'free_cargo_then_resume');
  emit(bus, PROSPECTOR_EVENTS.RISK, {
    originId: PROSPECTOR_ORIGIN_ID,
    kind: 'cargo_full',
    commodityId: payload.commodityId || null,
    simTime,
  });
  return { ok: false, recovery: 'free_cargo_then_resume' };
}

export function handleTetherLatched(state, payload = {}, bus = null) {
  const own = ownOf(state);
  if (!own || own.status !== PROSPECTOR_STATUS.ACTIVE) return null;
  const step = activeStep(own);
  if (!step || step.id !== 'extract') return null;
  const simTime = simNow(state);
  step.tetherLatches += 1;
  touchProspectorOrigin(own, simTime);
  emit(bus, PROSPECTOR_EVENTS.PROGRESS, progressSnapshot(own, simTime));
  return { ok: true, tetherLatches: step.tetherLatches, targetId: payload.targetId };
}

export function handleTetherBroke(state, payload = {}, bus = null) {
  const own = ownOf(state);
  if (!own || own.status !== PROSPECTOR_STATUS.ACTIVE) return null;
  const step = activeStep(own);
  if (!step || step.id !== 'extract') return null;
  const simTime = simNow(state);
  step.riskEvents += 1;
  failStep(own, 'extract', simTime, bus, 'line_parted');
  recoverStep(own, 'extract', simTime, bus, 'reattach');
  emit(bus, PROSPECTOR_EVENTS.RISK, {
    originId: PROSPECTOR_ORIGIN_ID,
    kind: 'tether_broke',
    targetId: payload.targetId || null,
    simTime,
  });
  return { ok: false, recovery: 'reattach' };
}

export function handleTradeCompleted(state, payload = {}, bus = null) {
  const own = ownOf(state);
  if (!own || own.status !== PROSPECTOR_STATUS.ACTIVE) return null;
  const step = activeStep(own);
  if (!step || step.id !== 'sell') return null;

  const simTime = simNow(state);
  const side = payload.side || payload.action;
  if (side !== 'sell') return null;

  const qty = Math.max(0, Math.floor(Number(payload.qty) || 0));
  const total = Math.max(0, Math.floor(Number(payload.total) || Number(payload.credits) || 0));
  if (qty <= 0) return null;

  const cid = String(payload.commodityId || '');
  if (!ORE_COMMODITY_IDS.has(cid)) return null;
  const trackedQty = Math.max(0, Math.floor(Number(own.minedOre && own.minedOre[cid]) || 0));
  if (trackedQty <= 0) return null;
  const creditedQty = Math.min(qty, trackedQty);
  own.minedOre[cid] = trackedQty - creditedQty;

  step.soldQty += creditedQty;
  step.soldCredits += total;
  touchProspectorOrigin(own, simTime);

  if (step.soldQty >= 1) {
    completeStep(own, 'sell', simTime, bus, {
      soldQty: step.soldQty,
      soldCredits: step.soldCredits,
    });
    return { ok: true, soldQty: step.soldQty };
  }
  return { ok: true, partial: true };
}

/**
 * Docked during sell step with empty hold → fail + recovery back to extract.
 * If still have ore, stay on sell (player must use market).
 */
export function handleDockedWhileActive(state, payload = {}, bus = null) {
  const own = ownOf(state);
  if (!own) return null;
  const simTime = simNow(state);

  // First-dock / re-offer path (non-binding).
  if (own.status !== PROSPECTOR_STATUS.ACTIVE) {
    return offerProspectorOrigin(state, payload, bus);
  }

  const step = activeStep(own);
  if (!step || step.id !== 'sell') return null;

  if (!holdHasOre(state)) {
    failStep(own, 'sell', simTime, bus, 'empty_hold');
    // Recovery: roll step back to extract.
    const extract = own.steps.extract;
    if (extract) {
      extract.status = PROSPECTOR_STEP_STATUS.ACTIVE;
      extract.oreCollected = 0;
      extract.completedAt = null;
    }
    own.steps.sell.status = PROSPECTOR_STEP_STATUS.PENDING;
    own.steps.sell.soldQty = 0;
    own.steps.sell.soldCredits = 0;
    own.activeStepId = 'extract';
    own.stepIndex = 1;
    appendRecoveryLog(own, {
      stepId: 'sell',
      failureId: 'empty_hold',
      recoveryId: 'return_to_extract',
    }, simTime);
    emit(bus, PROSPECTOR_EVENTS.STEP_RECOVERED, {
      originId: PROSPECTOR_ORIGIN_ID,
      stepId: 'sell',
      recoveryId: 'return_to_extract',
      simTime,
    });
    emit(bus, PROSPECTOR_EVENTS.STEP_ACTIVE, {
      originId: PROSPECTOR_ORIGIN_ID,
      stepId: 'extract',
      index: 1,
      objective: PROSPECTOR_STEPS.extract.objective,
      simTime,
    });
    return { ok: false, recovery: 'return_to_extract' };
  }
  return { ok: true, waitingForSell: true };
}

// ── System object (registry-shaped; not registered until lead integrates) ────

export const prospectorOrigin = {
  name: 'prospectorOrigin',
  originId: PROSPECTOR_ORIGIN_ID,
  family: PROSPECTOR_ORIGIN_FAMILY,
  binding: false,
  schemaId: PROSPECTOR_ORIGIN_SCHEMA_ID,
  schemaVersion: PROSPECTOR_ORIGIN_SCHEMA_VERSION,

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || null;
    ensureProspectorOriginState(this.state, simNow(this.state));

    const bus = this.bus;
    if (!bus || typeof bus.on !== 'function') return;

    bus.on('dock:docked', (p) => {
      handleDockedWhileActive(this.state, p || {}, this.bus);
    });
    bus.on('scan:completed', (p) => {
      handleScanCompleted(this.state, p || {}, this.bus);
    });
    bus.on('mining:yield', (p) => {
      handleMiningYield(this.state, p || {}, this.bus);
    });
    bus.on('cargo:full', (p) => {
      handleCargoFull(this.state, p || {}, this.bus);
    });
    bus.on('tether:latched', (p) => {
      handleTetherLatched(this.state, p || {}, this.bus);
    });
    bus.on('tether:broke', (p) => {
      handleTetherBroke(this.state, p || {}, this.bus);
    });
    bus.on('economy:tradeCompleted', (p) => {
      handleTradeCompleted(this.state, p || {}, this.bus);
    });
  },

  update(_dt, state) {
    // Origin is event-driven; update only ensures state shape after load.
    if (!state) return;
    ensureProspectorOriginState(state, simNow(state));
  },

  newGame() {
    if (!this.state) return;
    if (!this.state.careers) this.state.careers = {};
    if (!this.state.careers.origins) this.state.careers.origins = {};
    this.state.careers.origins.prospector = createProspectorOriginState(simNow(this.state));
  },

  serialize() {
    return serializeProspectorOrigin(this.state);
  },

  deserialize(data) {
    return deserializeProspectorOrigin(this.state, data);
  },

  // UI / lead adapters
  getOffer() {
    return getOfferView(this.state);
  },
  accept() {
    return acceptProspectorOrigin(this.state, this.bus);
  },
  decline() {
    return declineProspectorOrigin(this.state, this.bus);
  },
  abandon() {
    return abandonProspectorOrigin(this.state, this.bus);
  },
  getProgress() {
    const own = ensureProspectorOriginState(this.state, simNow(this.state));
    return progressSnapshot(own, simNow(this.state));
  },
};

/** Contract-harness metadata (OpenCode origin-contracts may import this). */
export const PROSPECTOR_ORIGIN_CONTRACT = Object.freeze({
  originId: PROSPECTOR_ORIGIN_ID,
  family: PROSPECTOR_ORIGIN_FAMILY,
  binding: false,
  excludesOtherOrigins: false,
  schemaId: PROSPECTOR_ORIGIN_SCHEMA_ID,
  schemaVersion: PROSPECTOR_ORIGIN_SCHEMA_VERSION,
  steps: PROSPECTOR_STEP_IDS.slice(),
  reward: { ...PROSPECTOR_REWARD },
  reofferCooldownS: PROSPECTOR_REOFFER_COOLDOWN_S,
  maxOffers: PROSPECTOR_MAX_OFFERS,
  modulePath: 'src/careers/origins/prospectorOrigin.js',
  system: prospectorOrigin,
  api: Object.freeze({
    offer: offerProspectorOrigin,
    accept: acceptProspectorOrigin,
    decline: declineProspectorOrigin,
    abandon: abandonProspectorOrigin,
    canOffer: canOfferProspectorOrigin,
    serialize: serializeProspectorOrigin,
    deserialize: deserializeProspectorOrigin,
    migrate: migrateProspectorOriginState,
    ensure: ensureProspectorOriginState,
    appraise: appraiseDeposit,
  }),
});

export default prospectorOrigin;
