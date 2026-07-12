// Pure deterministic sidecar helpers for Campaign 47-A (M5 task 1).
// Observes state.story.{beatIndex,branch,chainProgress,endgame*} as read-only.
// Never increments beatIndex, chooses an ending, or emits beat rewards.
// No bus, no Math.random, no wall clock — callers pass simTime and apply intents separately.

import {
  BEAT_STATUS,
  BRANCH_CHAIN,
  BRANCH_IDS,
  CAMPAIGN_BEATS,
  ENDGAME_NET_WORTH_CR,
  ENDGAME_REP_MIN,
  ENDINGS,
  FAIL_RECOVERY_COOLDOWN_S,
  MAX_FAILURES_PER_BEAT,
  OUTPOST_SPECIALIZATIONS,
  STORY_BRANCH_INTRO_TAG,
  beatDefAt,
  endingDef,
  mapOutpostDefToSpec,
  outpostSpecDef,
} from './campaignData.js';
import {
  describeBranchIntroOffer,
  describeEndingConsequences,
  inferBranchFromIntroPayload,
  isLiveBranchIntroPayload,
} from './campaignIntents.js';
import {
  buildBranchIntroAcceptReceipt,
  buildChainProgressReceipt,
  buildEncounterFailReceipt,
  buildEncounterRecoverReceipt,
  buildEndingDescriptorReceipt,
  buildOutpostSpecReceipt,
  buildStepProgressReceipt,
} from './campaignReceipts.js';
import {
  ensureCampaign47aState,
  pushCampaignHistory,
  pushCampaignReceipt,
  pushChoiceLog,
  validateCampaign47aState,
} from './campaignSchema.js';

/**
 * Read-only view of the live missions/story spine.
 * Canonical ownership: missions (beatIndex/branch/chainProgress), story (endgame*).
 */
export function readCanonicalStory(state) {
  const s = (state && state.story && typeof state.story === 'object') ? state.story : {};
  return {
    beatIndex: Number.isFinite(s.beatIndex) ? Math.floor(s.beatIndex) : 0,
    branch: BRANCH_IDS.includes(s.branch) ? s.branch : (s.branch == null ? null : null),
    chainProgress: Number.isFinite(s.chainProgress) ? Math.floor(s.chainProgress) : 0,
    flags: s.flags && typeof s.flags === 'object' ? s.flags : {},
    endgameChoice: s.endgameChoice ?? null,
    endgameOffered: !!s.endgameOffered,
    endgameDeclined: Array.isArray(s.endgameDeclined) ? s.endgameDeclined.slice() : [],
  };
}

/**
 * Ensure sidecar exists without claiming progression ownership.
 */
export function initCampaignSidecar(state, simTime = 0) {
  const own = ensureCampaign47aState(state);
  if (!own) return { ok: false, reason: 'no_state' };
  const t = Number(simTime) || 0;
  const canon = readCanonicalStory(state);
  own.observedBeatIndex = canon.beatIndex;
  if (own.beatStatus === BEAT_STATUS.IDLE) {
    own.beatStatus = BEAT_STATUS.TRACKING;
  }
  pushCampaignHistory(own, { kind: 'sidecar_init', observedBeatIndex: canon.beatIndex }, t);
  return { ok: true, own, canonical: canon, intents: [] };
}

/**
 * Sync observed beat cache from live spine. Does not write state.story.
 * Clears step progress when observed beat changes (new beat context).
 */
export function syncObservedBeat(state, simTime = 0) {
  const own = ensureCampaign47aState(state);
  if (!own) return { ok: false, reason: 'no_state' };
  const canon = readCanonicalStory(state);
  const t = Number(simTime) || 0;
  const prev = own.observedBeatIndex;
  if (prev !== canon.beatIndex) {
    own.observedBeatIndex = canon.beatIndex;
    if (own.beatStatus === BEAT_STATUS.FAILED && prev != null) {
      // Keep fail state only if still on same beat; else clear fail for new beat.
      own.beatStatus = BEAT_STATUS.TRACKING;
      own.failedAtS = null;
    } else if (own.beatStatus !== BEAT_STATUS.FAILED) {
      own.beatStatus = BEAT_STATUS.TRACKING;
    }
    pushCampaignHistory(own, {
      kind: 'observed_beat_changed',
      from: prev,
      to: canon.beatIndex,
    }, t);
  } else {
    own.observedBeatIndex = canon.beatIndex;
  }
  return { ok: true, own, canonical: canon };
}

/**
 * Record a world signal as ordered AND step progress for the observed canonical beat.
 * Does NOT advance state.story.beatIndex. Does NOT emit beat rewards.
 *
 * @returns {{ ok, reason?, own, stepsComplete?, completedSteps?, receipt?, intents? }}
 */
export function recordBeatStep(state, signal, payload = {}, simTime = 0) {
  const own = ensureCampaign47aState(state);
  if (!own) return { ok: false, reason: 'no_state' };

  const t = Number(simTime) || 0;
  syncObservedBeat(state, t);
  const canon = readCanonicalStory(state);
  const beatIndex = canon.beatIndex;
  const def = beatDefAt(beatIndex);

  if (!def) return { ok: false, reason: 'no_beat', own };

  // Recovery path: certain signals re-arm failed beats without advancing spine.
  if (own.beatStatus === BEAT_STATUS.FAILED) {
    return tryRecoverFromSignal(state, own, signal, t);
  }

  // B7 is observe-only — never complete via sidecar steps.
  if (def.observeOnly || beatIndex === 7) {
    return {
      ok: true,
      reason: 'observe_only',
      own,
      stepsComplete: false,
      observeOnly: true,
      canonical: canon,
      intents: [],
    };
  }

  // B4: require live branch-intro acceptance payload.
  if (beatIndex === 4) {
    return recordBranchIntroStep(state, own, signal, payload, t, canon);
  }

  // B5: require actual chain completions against live branch + counts.
  if (beatIndex === 5) {
    return recordChainStep(state, own, signal, payload, t, canon);
  }

  // B6: require actual asset/outpost deploy.
  if (beatIndex === 6) {
    return recordAssetDeployStep(state, own, signal, payload, t, canon);
  }

  // Ordered AND steps for B0–B3 (and generic).
  return recordOrderedSteps(state, own, def, signal, payload, t, canon);
}

function getOrCreateStepBucket(own, beatIndex, simTime) {
  if (!own.stepProgress || typeof own.stepProgress !== 'object') own.stepProgress = {};
  const key = String(beatIndex);
  if (!own.stepProgress[key]) {
    own.stepProgress[key] = { completed: [], updatedAtS: Number(simTime) || 0 };
  }
  if (!Array.isArray(own.stepProgress[key].completed)) {
    own.stepProgress[key].completed = [];
  }
  return own.stepProgress[key];
}

function recordOrderedSteps(state, own, def, signal, payload, simTime, canon) {
  const steps = def.steps || [];
  if (!steps.length) {
    return { ok: false, reason: 'no_steps', own };
  }

  const bucket = getOrCreateStepBucket(own, def.beat, simTime);
  const completed = new Set(bucket.completed);

  // Find the next expected step in order (AND / ordered).
  let nextStep = null;
  for (const step of steps) {
    if (!completed.has(step.id)) {
      nextStep = step;
      break;
    }
  }

  if (!nextStep) {
    return {
      ok: true,
      reason: 'already_complete',
      own,
      stepsComplete: true,
      completedSteps: bucket.completed.slice(),
      intents: [],
    };
  }

  if (!stepAcceptsSignal(nextStep, signal)) {
    // Out-of-order or wrong signal — reject without completing later steps early.
    // Also reject if signal matches a later step before prior ones.
    const laterHit = steps.find((s) => !completed.has(s.id) && s.id !== nextStep.id && stepAcceptsSignal(s, signal));
    if (laterHit) {
      return {
        ok: false,
        reason: `step_out_of_order:need_${nextStep.id}`,
        own,
        needStep: nextStep.id,
        gotSignal: signal,
      };
    }
    return { ok: false, reason: `signal_mismatch:${signal}`, own, needStep: nextStep.id };
  }

  // Prior requirements
  if (nextStep.requiresPrior) {
    for (const prior of nextStep.requiresPrior) {
      if (!completed.has(prior)) {
        return { ok: false, reason: `requires_prior:${prior}`, own };
      }
    }
  }

  bucket.completed.push(nextStep.id);
  bucket.updatedAtS = simTime;
  own.beatStatus = BEAT_STATUS.TRACKING;
  own.observedBeatIndex = def.beat;

  const stepsComplete = steps.every((s) => bucket.completed.includes(s.id));
  const receipt = buildStepProgressReceipt({
    beatIndex: def.beat,
    stepId: nextStep.id,
    signal,
    completedSteps: bucket.completed,
    stepsComplete,
    simTime,
    attempt: own.attempt,
  });
  pushCampaignReceipt(own, receipt);
  pushCampaignHistory(own, {
    kind: 'step_progress',
    beatIndex: def.beat,
    stepId: nextStep.id,
    signal,
    stepsComplete,
  }, simTime);

  return {
    ok: true,
    own,
    stepId: nextStep.id,
    stepsComplete,
    completedSteps: bucket.completed.slice(),
    receipt,
    intents: receipt.intents.slice(),
    canonical: canon,
    // Explicit: sidecar never advances live spine.
    advancedCanonicalBeat: false,
  };
}

function recordBranchIntroStep(state, own, signal, payload, simTime, canon) {
  if (signal !== 'mission:accepted') {
    return { ok: false, reason: `signal_mismatch:${signal}`, own, needStep: 'branch_intro_accept' };
  }
  if (!isLiveBranchIntroPayload(payload)) {
    return {
      ok: false,
      reason: 'not_live_branch_intro',
      own,
      need: {
        storyTag: STORY_BRANCH_INTRO_TAG,
        types: ['bulk_trade', 'patrol_clear', 'smuggling_run'],
      },
    };
  }

  const branch = inferBranchFromIntroPayload(payload) || canon.branch;
  if (!branch || !BRANCH_IDS.includes(branch)) {
    return { ok: false, reason: 'branch_required', own };
  }

  const bucket = getOrCreateStepBucket(own, 4, simTime);
  if (!bucket.completed.includes('branch_intro_accept')) {
    bucket.completed.push('branch_intro_accept');
  }
  bucket.updatedAtS = simTime;
  own.beatStatus = BEAT_STATUS.TRACKING;
  own.observedBeatIndex = 4;
  own.flags.branch_intro_observed = branch;

  const receipt = buildBranchIntroAcceptReceipt({
    branch,
    missionType: payload.type,
    storyTag: payload.storyTag || STORY_BRANCH_INTRO_TAG,
    factionId: payload.factionId || null,
    simTime,
    attempt: own.attempt,
  });
  pushCampaignReceipt(own, receipt);
  pushChoiceLog(own, { kind: 'branch_intro_observed', branch, type: payload.type }, simTime);
  pushCampaignHistory(own, { kind: 'branch_intro_accept', branch }, simTime);

  const stepReceipt = buildStepProgressReceipt({
    beatIndex: 4,
    stepId: 'branch_intro_accept',
    signal,
    completedSteps: bucket.completed,
    stepsComplete: true,
    simTime,
    attempt: own.attempt,
  });
  pushCampaignReceipt(own, stepReceipt);

  return {
    ok: true,
    own,
    stepId: 'branch_intro_accept',
    branch,
    stepsComplete: true,
    completedSteps: bucket.completed.slice(),
    receipt,
    intents: receipt.intents.concat(stepReceipt.intents),
    canonical: canon,
    advancedCanonicalBeat: false,
  };
}

function recordChainStep(state, own, signal, payload, simTime, canon) {
  if (signal !== 'mission:completed') {
    return { ok: false, reason: `signal_mismatch:${signal}`, own, needStep: 'chain_complete' };
  }

  const branch = canon.branch || payload.branch || null;
  if (!branch || !BRANCH_CHAIN[branch]) {
    return { ok: false, reason: 'no_branch', own };
  }

  const chain = BRANCH_CHAIN[branch];
  // Prefer live chainProgress from state.story; allow payload progress for unit tests.
  let progress = Number.isFinite(payload.chainProgress)
    ? Math.floor(payload.chainProgress)
    : canon.chainProgress;

  // If payload mission type matches chain type, treat as +1 observation when live progress not yet updated.
  if (payload.missionType && payload.missionType === chain.missionType && payload.increment) {
    progress = (progress | 0) + 1;
  }

  const target = chain.count;
  const complete = progress >= target;

  const receipt = buildChainProgressReceipt({
    branch,
    chainProgress: progress,
    chainTarget: target,
    complete,
    simTime,
    attempt: own.attempt,
    missionType: payload.missionType || chain.missionType,
  });
  pushCampaignReceipt(own, receipt);
  pushCampaignHistory(own, {
    kind: 'chain_progress',
    progress,
    target,
    complete,
  }, simTime);

  if (!complete) {
    return {
      ok: true,
      reason: 'chain_progress',
      own,
      chainProgress: progress,
      chainTarget: target,
      stepsComplete: false,
      receipt,
      intents: receipt.intents.slice(),
      canonical: canon,
      advancedCanonicalBeat: false,
    };
  }

  const bucket = getOrCreateStepBucket(own, 5, simTime);
  if (!bucket.completed.includes('chain_complete')) {
    bucket.completed.push('chain_complete');
  }
  bucket.updatedAtS = simTime;
  own.beatStatus = BEAT_STATUS.TRACKING;
  own.observedBeatIndex = 5;

  const stepReceipt = buildStepProgressReceipt({
    beatIndex: 5,
    stepId: 'chain_complete',
    signal,
    completedSteps: bucket.completed,
    stepsComplete: true,
    simTime,
    attempt: own.attempt,
  });
  pushCampaignReceipt(own, stepReceipt);

  return {
    ok: true,
    own,
    stepId: 'chain_complete',
    chainProgress: progress,
    chainTarget: target,
    stepsComplete: true,
    completedSteps: bucket.completed.slice(),
    receipt: stepReceipt,
    intents: receipt.intents.concat(stepReceipt.intents),
    canonical: canon,
    advancedCanonicalBeat: false,
  };
}

function recordAssetDeployStep(state, own, signal, payload, simTime, canon) {
  if (signal !== 'asset:deployed') {
    return { ok: false, reason: `signal_mismatch:${signal}`, own, needStep: 'asset_deploy' };
  }
  // Require a real deploy payload (kind or id).
  if (!payload.kind && !payload.id && !payload.defId && !payload.specializationId) {
    return { ok: false, reason: 'asset_deploy_payload_required', own };
  }

  // Optional outpost specialization tagging.
  if (payload.specializationId || payload.defId) {
    const specId = payload.specializationId || mapOutpostDefToSpec(payload.defId);
    if (specId) {
      selectOutpostSpecialization(state, specId, simTime);
    }
  }

  const bucket = getOrCreateStepBucket(own, 6, simTime);
  if (!bucket.completed.includes('asset_deploy')) {
    bucket.completed.push('asset_deploy');
  }
  bucket.updatedAtS = simTime;
  own.beatStatus = BEAT_STATUS.TRACKING;
  own.observedBeatIndex = 6;
  own.flags.asset_deploy_observed = true;

  const receipt = buildStepProgressReceipt({
    beatIndex: 6,
    stepId: 'asset_deploy',
    signal,
    completedSteps: bucket.completed,
    stepsComplete: true,
    simTime,
    attempt: own.attempt,
  });
  pushCampaignReceipt(own, receipt);
  pushCampaignHistory(own, {
    kind: 'asset_deploy',
    kindPayload: payload.kind || null,
    id: payload.id || null,
  }, simTime);

  return {
    ok: true,
    own,
    stepId: 'asset_deploy',
    stepsComplete: true,
    completedSteps: bucket.completed.slice(),
    receipt,
    intents: receipt.intents.slice(),
    canonical: canon,
    advancedCanonicalBeat: false,
  };
}

function stepAcceptsSignal(step, signal) {
  return Array.isArray(step.accept) && step.accept.includes(signal);
}

/**
 * Whether all ordered steps for a beat are satisfied in sidecar meta.
 */
export function isBeatStepsComplete(state, beatIndex = null) {
  const own = ensureCampaign47aState(state);
  if (!own) return false;
  const canon = readCanonicalStory(state);
  const idx = beatIndex != null ? beatIndex : canon.beatIndex;
  const def = beatDefAt(idx);
  if (!def) return false;
  if (def.observeOnly) return false;
  const steps = def.steps || [];
  if (!steps.length) return false;
  const bucket = own.stepProgress && own.stepProgress[String(idx)];
  const completed = (bucket && bucket.completed) || [];
  return steps.every((s) => completed.includes(s.id));
}

export function getBeatStepStatus(state, beatIndex = null) {
  const own = ensureCampaign47aState(state);
  if (!own) return null;
  const canon = readCanonicalStory(state);
  const idx = beatIndex != null ? beatIndex : canon.beatIndex;
  const def = beatDefAt(idx);
  if (!def) return null;
  const bucket = (own.stepProgress && own.stepProgress[String(idx)]) || { completed: [] };
  const steps = (def.steps || []).map((s) => ({
    id: s.id,
    order: s.order,
    done: bucket.completed.includes(s.id),
    accept: s.accept ? s.accept.slice() : [],
  }));
  return {
    beatIndex: idx,
    beatId: def.id,
    observeOnly: !!def.observeOnly,
    steps,
    completed: bucket.completed.slice(),
    stepsComplete: isBeatStepsComplete(state, idx),
    beatStatus: own.beatStatus,
    canonical: canon,
  };
}

/**
 * Record a failed encounter / mission on the observed beat. Recoverable.
 * Does not change state.story.beatIndex.
 */
export function failEncounter(state, reason = 'encounter_failed', simTime = 0, extra = {}) {
  const own = ensureCampaign47aState(state);
  if (!own) return { ok: false, reason: 'no_state' };

  const t = Number(simTime) || 0;
  const canon = readCanonicalStory(state);
  const beatIndex = canon.beatIndex;
  // Capture live beat before any meta mutation.
  const beatBefore = state.story && state.story.beatIndex;

  const beatKey = String(beatIndex);
  const prev = (own.failuresByBeat[beatKey] | 0);
  const next = Math.min(MAX_FAILURES_PER_BEAT, prev + 1);
  own.failuresByBeat[beatKey] = next;
  own.failureCount = (own.failureCount | 0) + 1;
  own.lastFailedBeat = beatIndex;
  own.failedAtS = t;
  own.beatStatus = BEAT_STATUS.FAILED;
  own.observedBeatIndex = beatIndex;
  own.activeContract = null;

  const receipt = buildEncounterFailReceipt({
    beatIndex,
    reason,
    simTime: t,
    attempt: own.attempt,
    encounterId: extra.encounterId || null,
  });
  pushCampaignReceipt(own, receipt);
  pushCampaignHistory(own, { kind: 'fail', beatIndex, reason }, t);

  return {
    ok: true,
    own,
    receipt,
    intents: receipt.intents.slice(),
    recoverable: true,
    failuresOnBeat: next,
    // Prove no spine mutation.
    canonicalBeatUnchanged: state.story.beatIndex === beatBefore,
    advancedCanonicalBeat: false,
  };
}

/**
 * Recover from a failed beat after cooldown (or force for tests).
 * Does not change state.story.beatIndex.
 */
export function recoverEncounter(state, simTime = 0, opts = {}) {
  const own = ensureCampaign47aState(state);
  if (!own) return { ok: false, reason: 'no_state' };
  if (own.beatStatus !== BEAT_STATUS.FAILED) {
    return { ok: false, reason: 'not_failed', own };
  }

  const t = Number(simTime) || 0;
  const force = !!opts.force;
  const elapsed = t - (own.failedAtS ?? 0);
  if (!force && elapsed < FAIL_RECOVERY_COOLDOWN_S) {
    return {
      ok: false,
      reason: 'recovery_cooldown',
      own,
      remainingS: FAIL_RECOVERY_COOLDOWN_S - elapsed,
    };
  }

  const beatBefore = state.story && state.story.beatIndex;
  const beatIndex = readCanonicalStory(state).beatIndex;
  const prevFails = own.failuresByBeat[String(beatIndex)] | 0;
  own.beatStatus = BEAT_STATUS.RECOVERED;
  own.recoveredAtS = t;
  own.activeContract = null;
  // After recover, tracking resumes on same beat.
  own.beatStatus = BEAT_STATUS.TRACKING;

  const receipt = buildEncounterRecoverReceipt({
    beatIndex,
    simTime: t,
    attempt: own.attempt,
    previousFailures: prevFails,
  });
  pushCampaignReceipt(own, receipt);
  pushCampaignHistory(own, { kind: 'recover', beatIndex }, t);

  return {
    ok: true,
    own,
    receipt,
    intents: receipt.intents.slice(),
    canonicalBeatUnchanged: state.story.beatIndex === beatBefore,
    advancedCanonicalBeat: false,
  };
}

function tryRecoverFromSignal(state, own, signal, simTime) {
  const canon = readCanonicalStory(state);
  const def = beatDefAt(canon.beatIndex);
  const rearmOn = (def && def.recovery && def.recovery.rearmOn) || [];
  if (!rearmOn.includes(signal) && signal !== 'campaign47a:recover') {
    return { ok: false, reason: 'awaiting_recovery_signal', own, rearmOn };
  }
  return recoverEncounter(state, simTime);
}

/**
 * Tag an outpost specialization (metadata). Does not deploy assets or advance beats.
 */
export function selectOutpostSpecialization(state, specializationId, simTime = 0) {
  const own = ensureCampaign47aState(state);
  if (!own) return { ok: false, reason: 'no_state' };
  const def = outpostSpecDef(specializationId);
  if (!def) return { ok: false, reason: `bad_spec:${specializationId}`, own };

  const canon = readCanonicalStory(state);
  // Soft lock hint only — do not write beatIndex.
  if (canon.beatIndex < def.unlockBeat) {
    return { ok: false, reason: 'spec_locked', own, unlockBeat: def.unlockBeat, canonical: canon };
  }

  const t = Number(simTime) || 0;
  own.outpostSpecializationId = specializationId;
  if (!own.outpostsOwned.includes(specializationId)) {
    own.outpostsOwned.push(specializationId);
  }
  for (const f of def.consequenceFlags) own.flags[f] = true;

  const receipt = buildOutpostSpecReceipt({
    specializationId,
    simTime: t,
    observedBeatIndex: canon.beatIndex,
  });
  pushCampaignReceipt(own, receipt);
  pushChoiceLog(own, { kind: 'outpost_spec', specializationId }, t);
  pushCampaignHistory(own, { kind: 'outpost_spec', specializationId }, t);

  return {
    ok: true,
    own,
    receipt,
    intents: receipt.intents.slice(),
    specialization: def,
    advancedCanonicalBeat: false,
  };
}

/**
 * Pure query: live B7 gate observation (does not offer endgame or write endgame fields).
 */
export function observeEndgameGate(observation = {}) {
  const net = Number(observation.netWorthCr) || 0;
  const rep = Number(observation.factionRep) || 0;
  const gates = {
    netWorth: net >= ENDGAME_NET_WORTH_CR,
    rep: rep >= ENDGAME_REP_MIN,
  };
  return {
    ready: gates.netWorth && gates.rep,
    gates,
    need: {
      netWorthCr: ENDGAME_NET_WORTH_CR,
      repMin: ENDGAME_REP_MIN,
    },
    note: 'Live missions/story own endgame offer and choice — observation only',
  };
}

/**
 * Ending requirement check against observation + optional declined list.
 * Does not write endgameChoice.
 */
export function checkEndingRequirements(def, observation = {}, declinedList = []) {
  const missing = [];
  const req = def.requires || {};
  const declined = Array.isArray(declinedList) ? declinedList : [];

  if (req.declined && req.declined.length) {
    for (const id of req.declined) {
      if (!declined.includes(id)) missing.push(`decline:${id}`);
    }
  }
  if (req.cargoIds && req.cargoIds.length) {
    const cargo = observation.cargoIds || observation.cargo || [];
    const set = new Set(Array.isArray(cargo) ? cargo : Object.keys(cargo || {}));
    for (const id of req.cargoIds) {
      if (!set.has(id)) missing.push(`cargo:${id}`);
    }
  }
  if (req.sectorId) {
    if (observation.sectorId !== req.sectorId && !observation.forceSector) {
      missing.push(`sector:${req.sectorId}`);
    }
  }
  if (req.fullLoad && !observation.fullLoad && !observation.forceFullLoad) {
    missing.push('full_load');
  }
  if (req.noMissions && observation.hasActiveMissions && !observation.forceNoMissions) {
    missing.push('no_active_missions');
  }

  if (missing.length) return { ok: false, reason: 'requirements_unmet', missing };
  return { ok: true };
}

/** List endings whose requirements are met (query only). */
export function listAvailableEndings(observation = {}, declinedList = []) {
  return ENDINGS.filter((def) => checkEndingRequirements(def, observation, declinedList).ok);
}

/**
 * Build ending descriptor receipt (data only — never applies consequences or writes endgameChoice).
 */
export function describeEnding(endingId, simTime = 0, declined = []) {
  const def = endingDef(endingId);
  if (!def) return { ok: false, reason: `bad_ending:${endingId}` };
  const consequences = describeEndingConsequences(endingId);
  const receipt = buildEndingDescriptorReceipt({
    endingId,
    simTime: Number(simTime) || 0,
    declined,
  });
  return {
    ok: true,
    endingId,
    def,
    consequences,
    receipt,
    intents: receipt.intents.slice(),
    applied: false,
  };
}

/** Record optional sandbox mode vocabulary after live ending (metadata only). */
export function noteSandboxMode(state, mode, simTime = 0) {
  const own = ensureCampaign47aState(state);
  if (!own) return { ok: false, reason: 'no_state' };
  const valid = ENDINGS.some((e) => e.sandbox.mode === mode) || mode === 'open_frontier';
  if (!valid) return { ok: false, reason: `bad_sandboxMode:${mode}`, own };
  const t = Number(simTime) || 0;
  own.sandboxMode = mode;
  pushCampaignHistory(own, { kind: 'sandbox_mode_noted', mode }, t);
  return { ok: true, own, sandboxMode: mode, intents: [] };
}

/** Read-only public view: merges live spine observation + sidecar meta. */
export function getCampaignPublicView(state) {
  const own = ensureCampaign47aState(state);
  if (!own) return null;
  const canon = readCanonicalStory(state);
  const def = beatDefAt(canon.beatIndex);
  const stepStatus = getBeatStepStatus(state, canon.beatIndex);
  return {
    campaignId: own.campaignId,
    schemaVersion: own.schemaVersion,
    // Live spine (read-only observation)
    beatIndex: canon.beatIndex,
    branch: canon.branch,
    chainProgress: canon.chainProgress,
    endgameChoice: canon.endgameChoice,
    endgameOffered: canon.endgameOffered,
    endgameDeclined: canon.endgameDeclined,
    // Sidecar meta
    beatId: def ? def.id : null,
    beatTitle: def ? def.title : null,
    objective: def ? def.objective : null,
    beatStatus: own.beatStatus,
    stepProgress: stepStatus,
    sandboxMode: own.sandboxMode,
    outpostSpecializationId: own.outpostSpecializationId,
    outpostsOwned: own.outpostsOwned.slice(),
    failureCount: own.failureCount,
    receiptCount: own.receipts.length,
    choiceCount: own.choiceLog.length,
    ownsProgression: false,
    valid: validateCampaign47aState(own).ok,
  };
}

export function listOutpostSpecializations() {
  return OUTPOST_SPECIALIZATIONS.slice();
}

export function listBeats() {
  return CAMPAIGN_BEATS.slice();
}

export function listEndings() {
  return ENDINGS.slice();
}

export function listBranchIntroOffers() {
  return BRANCH_IDS.map((b) => describeBranchIntroOffer(b)).filter(Boolean);
}
