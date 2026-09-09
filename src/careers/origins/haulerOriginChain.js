// Pure deterministic FSM for the Hauler origin chain (M3 isolated candidate).
// No bus, no Math.random, no wall clock — callers pass simTime and seed side effects separately.

import {
  applyHaulerStepChoice,
  HAULER_COMPLETION_REWARD,
  HAULER_FAIL_RETRY_COOLDOWN_S,
  HAULER_MAX_FAILURES_PER_STEP,
  HAULER_REOFFER_COOLDOWN_S,
  HAULER_STEPS,
  haulerChoiceForStep,
  haulerChoicesForStep,
} from './haulerOriginData.js';
import {
  buildFirstDockOriginOffer,
  buildHaulerStepMissionOffer,
  buildStepMarketSnapshot,
  stepDefAt,
} from './haulerOriginOffers.js';
import {
  ensureHaulerOriginState,
  pushHaulerHistory,
  validateHaulerOriginState,
} from './haulerOriginSchema.js';

/**
 * First dock: non-binding origin offer. Idempotent within the same offer epoch unless declined cooldown elapsed.
 * @returns {{ ok:boolean, reason?:string, offer?:object, own?:object }}
 */
export function onFirstDock(state, stationId, simTime = 0) {
  const own = ensureHaulerOriginState(state);
  if (!own) return { ok: false, reason: 'no_state' };
  if (own.status === 'completed') return { ok: false, reason: 'already_completed', own };
  if (own.status === 'active') return { ok: false, reason: 'already_active', own };

  const t = Number(simTime) || 0;
  if (!own.firstDockSeen) {
    own.firstDockSeen = true;
    own.firstDockStationId = stationId || 'station_helios';
    own.firstDockAtS = t;
  }

  if (own.status === 'declined') {
    const elapsed = t - (own.declinedAtS ?? 0);
    if (elapsed < HAULER_REOFFER_COOLDOWN_S) {
      return { ok: false, reason: 'reoffer_cooldown', own, remainingS: HAULER_REOFFER_COOLDOWN_S - elapsed };
    }
  }

  if (own.status === 'step_failed') {
    const elapsed = t - (own.failedAtS ?? 0);
    if (elapsed < HAULER_FAIL_RETRY_COOLDOWN_S) {
      return { ok: false, reason: 'fail_cooldown', own, remainingS: HAULER_FAIL_RETRY_COOLDOWN_S - elapsed };
    }
  }

  // Re-offer when idle, declined (after cooldown), or step_failed (after cooldown).
  if (own.status === 'offered' && own.offeredAtS != null) {
    return { ok: true, reason: 'already_offered', offer: buildFirstDockOriginOffer(state, stationId, own.offerNonce), own };
  }

  const priorStatus = own.status;
  const recovering = priorStatus === 'step_failed' || (own.stepId != null && own.stepIndex > 0 && priorStatus !== 'idle');
  own.offerNonce = (own.offerNonce | 0) + 1;
  own.status = 'offered';
  own.offeredAtS = t;
  // Fresh chain starts at step 0; recovery keeps the failed/current step index.
  if (!recovering && own.stepId == null && priorStatus !== 'step_failed') {
    own.stepIndex = 0;
  }
  const offer = buildFirstDockOriginOffer(state, stationId || own.firstDockStationId, own.offerNonce);
  // When mid-chain or recovery, preview the current step instead of always step 0.
  if (own.stepIndex > 0 || priorStatus === 'step_failed') {
    const step = stepDefAt(own.stepIndex);
    if (step) {
      own.stepId = step.id;
      offer.firstStepId = step.id;
      offer.previewMission = buildHaulerStepMissionOffer(
        state,
        step,
        own.attempt,
        own.offerNonce,
        { choiceId: own.choicesByStep && own.choicesByStep[step.id] || null },
      );
      offer.copy = {
        ...offer.copy,
        title: `Hauler — ${step.title}`,
        body: priorStatus === 'step_failed' ? (step.recoveryLine || step.acceptLine) : step.acceptLine,
      };
    }
  }
  pushHaulerHistory(own, { kind: 'offered', stationId: stationId || own.firstDockStationId, stepIndex: own.stepIndex }, t);
  return { ok: true, offer, own };
}

/** Player declines the non-binding origin. Does not lock peers. */
export function declineOrigin(state, simTime = 0) {
  const own = ensureHaulerOriginState(state);
  if (!own) return { ok: false, reason: 'no_state' };
  if (own.status !== 'offered') return { ok: false, reason: 'not_offered', own };
  const t = Number(simTime) || 0;
  own.status = 'declined';
  own.declinedAtS = t;
  own.activeContract = null;
  pushHaulerHistory(own, { kind: 'declined' }, t);
  return { ok: true, own };
}

/**
 * Choose the service class for an offered freight step. The decision is durable, but remains
 * editable until mission authority accepts the contract; active cargo can never be repriced.
 */
export function chooseHaulerStep(state, choiceId, simTime = 0) {
  const own = ensureHaulerOriginState(state);
  if (!own) return { ok: false, reason: 'no_state' };
  if (own.status !== 'offered') return { ok: false, reason: `bad_status:${own.status}`, own };
  const step = stepDefAt(own.stepIndex);
  if (!step) return { ok: false, reason: 'no_step', own };
  const choice = haulerChoiceForStep(step.id, choiceId);
  if (!choice) return { ok: false, reason: 'invalid_choice', own };
  own.choicesByStep = own.choicesByStep && typeof own.choicesByStep === 'object'
    ? own.choicesByStep : { route_risk: null };
  own.choicesByStep[step.id] = choice.id;
  pushHaulerHistory(own, {
    kind: 'step_choice',
    stepId: step.id,
    choiceId: choice.id,
    choiceLabel: choice.label,
    consequence: choice.summary,
  }, Number(simTime) || 0);
  return {
    ok: true,
    own,
    stepId: step.id,
    choice: { ...choice },
    choices: haulerChoicesForStep(step.id).map((row) => ({ ...row })),
    intents: [
      {
        event: 'career:origin:choiceResolved',
        payload: {
          careerId: 'hauler',
          stepId: step.id,
          choiceId: choice.id,
          label: choice.label,
          consequence: choice.summary,
        },
      },
      {
        event: 'toast',
        payload: { text: `${choice.label}: ${choice.summary}.`, kind: 'info', ttl: 5 },
      },
    ],
  };
}

/**
 * Accept current origin step. Returns intents for authorities (mission offer, collateral charge).
 * Does not mutate credits/cargo.
 */
export function acceptOrigin(state, simTime = 0, options = {}) {
  const own = ensureHaulerOriginState(state);
  if (!own) return { ok: false, reason: 'no_state' };
  if (own.status !== 'offered' && own.status !== 'step_failed') {
    // Allow accept from offered only; step_failed must re-offer first via dock.
    if (own.status !== 'offered') return { ok: false, reason: `bad_status:${own.status}`, own };
  }
  if (own.status === 'step_failed') {
    return { ok: false, reason: 'must_reoffer_after_fail', own };
  }

  const step = stepDefAt(own.stepIndex);
  if (!step) return { ok: false, reason: 'no_step', own };
  const choiceId = own.choicesByStep && own.choicesByStep[step.id] || null;
  const choices = haulerChoicesForStep(step.id);
  if (choices.length > 0 && !haulerChoiceForStep(step.id, choiceId)) {
    return { ok: false, reason: 'choice_required', own, step, choices };
  }
  const authoredStep = applyHaulerStepChoice(step, choiceId);

  const t = Number(simTime) || 0;
  const marketOptions = { allowSynthetic: !!options.allowSyntheticMarkets, choiceId };
  const missionOffer = buildHaulerStepMissionOffer(
    state, authoredStep, own.attempt, own.offerNonce, marketOptions,
  );
  const marketSnapshot = buildStepMarketSnapshot(state, authoredStep, marketOptions);
  if (!marketSnapshot) return { ok: false, reason: 'market_unavailable', own };

  own.status = 'active';
  own.stepId = authoredStep.id;
  own.acceptedAtS = t;
  own.marketSnapshot = marketSnapshot;
  own.marketLegs = { buy: null, sell: null };
  own.activeContract = {
    offerId: missionOffer.id,
    missionId: null,
    stepId: authoredStep.id,
    stepIndex: authoredStep.index,
    missionType: authoredStep.missionType,
    commodityId: authoredStep.commodityId,
    qty: authoredStep.qty,
    originStationId: authoredStep.originStationId,
    originSectorId: authoredStep.originSectorId,
    destStationId: authoredStep.destStationId,
    destSectorId: authoredStep.destSectorId,
    reward_cr: missionOffer.reward_cr,
    collateral_cr: missionOffer.collateral_cr,
    riskTier: authoredStep.riskTier,
    deadlineS: missionOffer.deadlineS,
    attempt: own.attempt,
    choiceId: authoredStep.choiceId || null,
    choiceLabel: authoredStep.choiceLabel || '',
    choiceSummary: authoredStep.choiceSummary || '',
    teach: authoredStep.teach,
    marketTruth: marketSnapshot,
  };

  const intents = [];
  // The shared careerOrigins system hands missionOffer to missions.postAndAcceptAuthoredOffer().
  // Missions owns board insertion, collateral, active ids, settlement, and completion payout.
  intents.push({
    event: 'career:origin:step',
    payload: {
      careerId: 'hauler',
      stepId: authoredStep.id,
      stepIndex: authoredStep.index,
      offerId: missionOffer.id,
      choiceId: authoredStep.choiceId || null,
      choiceLabel: authoredStep.choiceLabel || null,
      choiceSummary: authoredStep.choiceSummary || null,
      teach: authoredStep.teach,
      marketTruth: marketSnapshot,
    },
  });
  intents.push({
    event: 'toast',
    payload: { text: authoredStep.acceptLine, kind: 'info', ttl: 4 },
  });

  pushHaulerHistory(own, {
    kind: 'accepted',
    stepId: authoredStep.id,
    offerId: missionOffer.id,
    reward_cr: missionOffer.reward_cr,
    collateral_cr: missionOffer.collateral_cr,
  }, t);

  return { ok: true, own, step: authoredStep, missionOffer, intents, marketSnapshot };
}

/**
 * Record a market leg for step 3 (and optional truth checks on earlier steps).
 * side: 'buy' | 'sell'
 */
export function recordMarketLeg(state, side, leg, simTime = 0) {
  const own = ensureHaulerOriginState(state);
  if (!own || own.status !== 'active' || !own.activeContract) {
    return { ok: false, reason: 'not_active' };
  }
  if (side !== 'buy' && side !== 'sell') return { ok: false, reason: 'bad_side' };
  const contract = own.activeContract;
  if (leg.commodityId && leg.commodityId !== contract.commodityId) {
    return { ok: false, reason: 'wrong_commodity' };
  }
  const t = Number(simTime) || 0;
  const row = {
    stationId: leg.stationId || null,
    commodityId: leg.commodityId || contract.commodityId,
    qty: Math.max(0, Math.floor(Number(leg.qty) || 0)),
    unitPrice: Math.round(Number(leg.unitPrice) || 0),
    total: Math.round(Number(leg.total) || 0),
    atS: t,
    source: leg.source || 'trade',
  };
  own.marketLegs[side] = row;
  pushHaulerHistory(own, { kind: `market_${side}`, ...row }, t);
  return { ok: true, own, leg: row };
}

/**
 * Evaluate whether the active step is complete given an external signal.
 * signal kinds: 'mission_completed' | 'mission_failed' | 'deadline' | 'manual_delivery' | 'market_spread'
 * Options: missionPaid (missions.js already settled reward+collateral).
 */
export function evaluateStepSignal(state, signal, simTime = 0) {
  const own = ensureHaulerOriginState(state);
  if (!own || own.status !== 'active' || !own.activeContract) {
    return { ok: false, reason: 'not_active' };
  }
  const contract = own.activeContract;
  const step = stepDefAt(contract.stepIndex);
  const t = Number(simTime) || 0;
  const kind = signal && signal.kind;
  const opts = {
    missionPaid: !!(signal && signal.missionPaid),
    skipStepPayout: !!(signal && (signal.missionPaid || signal.skipStepPayout)),
  };

  if (kind === 'mission_failed' || kind === 'deadline') {
    return failStep(state, kind === 'deadline' ? 'deadline' : (signal.reason || 'mission_failed'), t);
  }

  if (kind === 'mission_completed') {
    if (signal.missionId && signal.missionId !== contract.missionId) {
      return { ok: false, reason: 'mission_mismatch' };
    }
    return succeedStep(state, t, 'mission_completed', opts);
  }

  if (kind === 'manual_delivery') {
    // Cargo authority already moved cargo; chain only advances when dest matches.
    if (signal.stationId && signal.stationId !== contract.destStationId) {
      return { ok: false, reason: 'wrong_station' };
    }
    if (contract.stepId === 'market_spread') {
      return { ok: false, reason: 'use_market_spread' };
    }
    return succeedStep(state, t, 'manual_delivery', opts);
  }

  if (kind === 'market_spread' || (step && step.id === 'market_spread' && kind === 'check_spread')) {
    return evaluateMarketSpread(state, t, opts);
  }

  return { ok: false, reason: `unknown_signal:${kind}` };
}

function evaluateMarketSpread(state, simTime, opts = {}) {
  const own = ensureHaulerOriginState(state);
  const contract = own.activeContract;
  const buy = own.marketLegs && own.marketLegs.buy;
  const sell = own.marketLegs && own.marketLegs.sell;
  if (!buy || !sell) return { ok: false, reason: 'missing_legs', own };
  if (buy.qty < contract.qty || sell.qty < contract.qty) {
    return { ok: false, reason: 'qty_short', own };
  }
  // Station match when provided.
  if (buy.stationId && buy.stationId !== contract.originStationId) {
    return { ok: false, reason: 'buy_station_mismatch', own };
  }
  if (sell.stationId && sell.stationId !== contract.destStationId) {
    return { ok: false, reason: 'sell_station_mismatch', own };
  }
  // Market truth: sell unit should not be fantasy-only; require a real ticket.
  if (!(sell.unitPrice > 0) || !(buy.unitPrice > 0)) {
    return { ok: false, reason: 'missing_prices', own };
  }
  return succeedStep(state, simTime, 'market_spread', opts);
}

function succeedStep(state, simTime, via, opts = {}) {
  const own = ensureHaulerOriginState(state);
  const contract = own.activeContract;
  const step = stepDefAt(contract.stepIndex);
  const t = Number(simTime) || 0;
  const intents = [];
  const skipStepPayout = !!opts.skipStepPayout;

  // Refund collateral on success (mirrors missions.js) unless missions already settled.
  if (!skipStepPayout && contract.collateral_cr > 0) {
    intents.push({
      event: 'economy:grantCredits',
      payload: { amount: contract.collateral_cr, reason: `hauler_origin_collateral_refund:${contract.missionId}` },
    });
  }
  // Step mission payout only if missions authority did not already pay (via flag).
  // Integration should set signal.missionPaid=true when mission:completed already granted credits.
  // Default: emit step reward for isolated harness / manual_delivery path.
  if (!skipStepPayout) {
    intents.push({
      event: 'economy:grantCredits',
      payload: {
        amount: contract.reward_cr,
        reason: `hauler_origin_step:${contract.stepId}:${contract.missionId}`,
      },
    });
  }
  intents.push({
    event: 'toast',
    payload: { text: step ? step.successLine : 'Hauler step complete', kind: 'success', ttl: 4 },
  });

  pushHaulerHistory(own, {
    kind: 'step_success',
    stepId: contract.stepId,
    via,
    reward_cr: contract.reward_cr,
  }, t);

  own.activeContract = null;
  own.attempt = 0; // reset attempt on success for next step

  const nextIndex = contract.stepIndex + 1;
  if (nextIndex >= HAULER_STEPS.length) {
    return completeOrigin(state, t, intents);
  }

  // Auto-offer next step (still non-binding — player can decline between steps).
  own.stepIndex = nextIndex;
  own.stepId = HAULER_STEPS[nextIndex].id;
  own.status = 'offered';
  own.offerNonce = (own.offerNonce | 0) + 1;
  own.offeredAtS = t;
  const nextOffer = buildHaulerStepMissionOffer(state, HAULER_STEPS[nextIndex], 0, own.offerNonce);
  intents.push({
    event: 'career:origin:step_complete',
    payload: {
      careerId: 'hauler',
      completedStepId: contract.stepId,
      nextStepId: own.stepId,
      via,
    },
  });
  intents.push({
    event: 'toast',
    payload: { text: HAULER_STEPS[nextIndex].acceptLine, kind: 'info', ttl: 4 },
  });

  return {
    ok: true,
    kind: 'step_complete',
    own,
    completedStepId: contract.stepId,
    nextStepId: own.stepId,
    nextMissionPreview: nextOffer,
    intents,
  };
}

function failStep(state, reason, simTime) {
  const own = ensureHaulerOriginState(state);
  const contract = own.activeContract;
  if (!contract) return { ok: false, reason: 'no_contract' };
  const step = stepDefAt(contract.stepIndex);
  const t = Number(simTime) || 0;
  own.failureCount = (own.failureCount | 0) + 1;
  own.failuresByStep[contract.stepId] = (own.failuresByStep[contract.stepId] | 0) + 1;
  own.attempt = (own.attempt | 0) + 1;
  own.status = 'step_failed';
  own.failedAtS = t;
  own.activeContract = null;

  const intents = [];
  // Collateral already charged at accept — forfeited (no refund). Intentional freight lesson.
  intents.push({
    event: 'career:origin:failed',
    payload: {
      careerId: 'hauler',
      stepId: contract.stepId,
      reason,
      attempt: own.attempt,
      canRetry: own.failuresByStep[contract.stepId] < HAULER_MAX_FAILURES_PER_STEP,
    },
  });
  intents.push({
    event: 'toast',
    payload: {
      text: step ? step.failLine : 'Hauler step failed',
      kind: 'warn',
      ttl: 4,
    },
  });

  pushHaulerHistory(own, {
    kind: 'step_failed',
    stepId: contract.stepId,
    reason,
    attempt: own.attempt,
  }, t);

  return {
    ok: true,
    kind: 'step_failed',
    own,
    reason,
    canRetry: own.failuresByStep[contract.stepId] < HAULER_MAX_FAILURES_PER_STEP,
    intents,
  };
}

function completeOrigin(state, simTime, priorIntents = []) {
  const own = ensureHaulerOriginState(state);
  const t = Number(simTime) || 0;
  own.status = 'completed';
  own.completedAtS = t;
  own.stepId = null;
  own.activeContract = null;

  const intents = priorIntents.slice();
  if (!own.rewardsGranted) {
    own.rewardsGranted = true;
    own.rewardReceipt = {
      ...HAULER_COMPLETION_REWARD,
      grantedAtS: t,
      // credits/rep are intents — receipt records the plan
    };
    intents.push({
      event: 'economy:grantCredits',
      payload: {
        amount: HAULER_COMPLETION_REWARD.credits,
        reason: HAULER_COMPLETION_REWARD.reason,
      },
    });
    for (const rep of HAULER_COMPLETION_REWARD.rep) {
      intents.push({
        event: 'faction:repDelta',
        payload: { factionId: rep.factionId, delta: rep.delta, reason: rep.reason },
      });
    }
    intents.push({
      event: 'career:origin:completed',
      payload: {
        careerId: 'hauler',
        originId: own.originId,
        reward: own.rewardReceipt,
        exclusivity: own.exclusivity,
      },
    });
    intents.push({
      event: 'toast',
      payload: { text: 'Hauler origin complete. Freight ticket stamped.', kind: 'success', ttl: 5 },
    });
  }

  pushHaulerHistory(own, { kind: 'origin_completed', rewardCr: HAULER_COMPLETION_REWARD.credits }, t);
  return {
    ok: true,
    kind: 'origin_completed',
    own,
    reward: own.rewardReceipt,
    intents,
  };
}

/** Deadline check for active timed freight (route_risk). Call from system update. */
export function tickHaulerOrigin(state, simTime = 0) {
  const own = ensureHaulerOriginState(state);
  if (!own || own.status !== 'active' || !own.activeContract) return { ok: true, kind: 'noop', own };
  const deadline = own.activeContract.deadlineS;
  if (deadline == null || !Number.isFinite(deadline)) return { ok: true, kind: 'noop', own };
  if ((Number(simTime) || 0) < deadline) return { ok: true, kind: 'noop', own };
  return evaluateStepSignal(state, { kind: 'deadline' }, simTime);
}

/** Whether another career origin remains allowed (always true for this candidate). */
export function allowsOtherCareers(state) {
  const own = ensureHaulerOriginState(state);
  if (!own) return true;
  return own.flags.otherCareersAllowed !== false && own.exclusivity.blocksOtherOrigins !== true;
}

export function getHaulerOriginPublicView(state) {
  const own = ensureHaulerOriginState(state);
  if (!own) return null;
  const validation = validateHaulerOriginState(own);
  return {
    careerId: own.careerId,
    status: own.status,
    stepIndex: own.stepIndex,
    stepId: own.stepId,
    firstDockSeen: own.firstDockSeen,
    nonBinding: true,
    allowsOtherCareers: allowsOtherCareers(state),
    activeContract: own.activeContract,
    choicesByStep: { ...(own.choicesByStep || {}) },
    choices: haulerChoicesForStep(own.stepId || stepDefAt(own.stepIndex)?.id)
      .map((choice) => ({ ...choice })),
    marketSnapshot: own.marketSnapshot,
    rewardsGranted: own.rewardsGranted,
    rewardReceipt: own.rewardReceipt,
    validation,
  };
}

export {
  succeedStep,
  failStep,
  completeOrigin,
};
