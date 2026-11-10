// M3 Hunter origin chain — isolated candidate (not registry-wired).
//
// Begins at first dock, non-binding, teaches target identification → pursuit under
// combat doctrine → lawful counterplay/clean finish. Uses live hostility/heat/doctrine
// authorities. Single-writer safe: emits economy:grantCredits; never writes credits/heat/rep.
//
// Determinism: state.rng / own rngSeed + state.simTime only. No unseeded PRNG or wall clock.

import { stepMulberry32 } from '../../core/rng.js';
import { normalizeCombatDoctrineId, DOCTRINE_TELEGRAPH_TICKS } from '../../ai/combatDoctrine.js';
import { isPlayerWanted, THRESHOLD as WANTED_THRESHOLD } from '../../systems/heat.js';
import { contactStateWord, isHostileToPlayer } from '../../systems/scanner.js';
import {
  HUNTER_FORBIDDEN_MARK_WORDS,
  HUNTER_LEGAL_MARK_WORDS,
  HUNTER_OFFER_STATUS,
  HUNTER_ORIGIN_DOCTRINE_POOL,
  HUNTER_ORIGIN_EVENTS,
  HUNTER_ORIGIN_ID,
  HUNTER_ORIGIN_REWARD,
  HUNTER_ORIGIN_STEPS,
  HUNTER_PHASE,
  HUNTER_RECOVERY_HINTS,
  HUNTER_STEP_BY_ID,
  stepDefAt,
} from './hunterOriginData.js';
import {
  createHunterOriginState,
  ensureHunterOriginState,
  getHunterOriginState,
  migrateHunterOrigin,
  serializeHunterOrigin,
  deserializeHunterOrigin,
  hunterOriginSaveSchema,
} from './hunterOriginSave.js';

export {
  HUNTER_ORIGIN_ID,
  HUNTER_ORIGIN_REWARD,
  HUNTER_ORIGIN_STEPS,
  HUNTER_ORIGIN_EVENTS,
  HUNTER_OFFER_STATUS,
  HUNTER_PHASE,
  createHunterOriginState,
  ensureHunterOriginState,
  getHunterOriginState,
  migrateHunterOrigin,
  serializeHunterOrigin,
  deserializeHunterOrigin,
  hunterOriginSaveSchema,
};

const FORBIDDEN_MARK = new Set(HUNTER_FORBIDDEN_MARK_WORDS);
const LEGAL_MARK = new Set(HUNTER_LEGAL_MARK_WORDS);

// ── Target identification (live authorities) ─────────────────────────────────

/**
 * Classify a contact using live scanner hostility + heat-gated lawful rules + doctrine ids.
 * Pure read of entity + state; does not mutate.
 */
export function classifyHunterContact(state, entity) {
  if (!entity) {
    return {
      contactWord: null,
      hostile: false,
      lawful: false,
      civilian: false,
      illegalToKill: false,
      legalBounty: false,
      doctrineId: null,
      enemyTypeId: null,
      label: null,
    };
  }
  const playerTeam = 0;
  const data = entity.data || {};
  const ai = data.ai || {};
  const word = contactStateWord(entity, playerTeam, state);
  const hostile = isHostileToPlayer(entity, playerTeam, state);
  const lawful = !!(ai.lawful || data.factionLawful || entity.factionLawful);
  const civilian = entity.team === 2 || !!ai.passive
    || String(ai.archetype || '').includes('trad')
    || String(ai.archetype || '').includes('miner');
  const illegalToKill = !!(data.illegalToKill || entity.illegalToKill || lawful);
  const doctrineId = normalizeCombatDoctrineId(
    ai.combatDoctrineId || data.combatDoctrineId || null,
  );
  const enemyTypeId = data.enemyTypeId || data.typeId || entity.typeId || null;
  const legalBounty = !!(hostile && !lawful && !civilian && !illegalToKill && LEGAL_MARK.has(word));

  return {
    contactWord: word,
    hostile,
    lawful,
    civilian,
    illegalToKill,
    legalBounty,
    doctrineId,
    enemyTypeId: enemyTypeId == null ? null : String(enemyTypeId),
    label: data.name || entity.name || enemyTypeId || word || null,
    playerWanted: isPlayerWanted(state),
    wantedThreshold: WANTED_THRESHOLD,
  };
}

/** Deterministic doctrine pick from the live M1.5 pool using origin rngSeed. */
export function pickHunterDoctrine(own) {
  const n = HUNTER_ORIGIN_DOCTRINE_POOL.length;
  if (n <= 0) return null;
  const draw = drawOriginRng(own);
  const idx = Math.min(n - 1, Math.floor(draw * n));
  return HUNTER_ORIGIN_DOCTRINE_POOL[idx];
}

function drawOriginRng(own) {
  const next = stepMulberry32(own.rngSeed >>> 0 || 1);
  own.rngSeed = next.seed;
  return next.value;
}

function pushHistory(own, simTime, kind, detail = '') {
  own.history.push({ at: Number(simTime) || 0, kind: String(kind), detail: String(detail || '') });
  if (own.history.length > 32) own.history.splice(0, own.history.length - 32);
}

function emit(bus, event, payload) {
  if (bus && typeof bus.emit === 'function') bus.emit(event, payload);
}

// ── Offer lifecycle (first dock, non-binding) ────────────────────────────────

/**
 * First-dock seam. Idempotent: only opens the offer once per latent/declined state.
 * Does not force accept; does not exclude other careers.
 */
export function onHunterFirstDock(state, { stationId = null, simTime = 0 } = {}, bus = null) {
  const own = ensureHunterOriginState(state);
  const t = Number.isFinite(simTime) ? simTime : (state.simTime || 0);
  if (!own.offer.firstDockSeen) {
    own.offer.firstDockSeen = true;
    own.offer.firstDockStationId = stationId != null ? String(stationId) : null;
    pushHistory(own, t, 'first_dock', own.offer.firstDockStationId || '');
  }
  // Non-binding re-offer: latent or declined may surface again at dock.
  if (
    own.offer.status === HUNTER_OFFER_STATUS.LATENT
    || own.offer.status === HUNTER_OFFER_STATUS.DECLINED
  ) {
    return offerHunterOrigin(state, { simTime: t, stationId }, bus);
  }
  return { ok: true, status: own.offer.status, reoffered: false };
}

export function offerHunterOrigin(state, { simTime = 0, stationId = null } = {}, bus = null) {
  const own = ensureHunterOriginState(state);
  if (
    own.offer.status === HUNTER_OFFER_STATUS.ACCEPTED
    || own.offer.status === HUNTER_OFFER_STATUS.COMPLETED
  ) {
    return { ok: false, reason: 'already_committed', status: own.offer.status };
  }
  const t = Number.isFinite(simTime) ? simTime : (state.simTime || 0);
  own.offer.status = HUNTER_OFFER_STATUS.OFFERED;
  own.offer.offeredAtSimTime = t;
  if (stationId != null) own.offer.firstDockStationId = String(stationId);
  own.phase = HUNTER_PHASE.IDLE;
  pushHistory(own, t, 'offered');
  emit(bus, HUNTER_ORIGIN_EVENTS.OFFERED, {
    careerId: HUNTER_ORIGIN_ID,
    exclusive: false,
    stationId: own.offer.firstDockStationId,
    steps: HUNTER_ORIGIN_STEPS.map((s) => ({ id: s.id, title: s.title, line: s.line })),
    reward: {
      credits: own.reward.credits,
      unlockId: own.reward.unlockId,
      unlockLabel: own.reward.unlockLabel,
    },
  });
  return { ok: true, status: own.offer.status, reoffered: true };
}

/** Decline keeps the chain available — non-binding. */
export function declineHunterOrigin(state, { simTime = 0 } = {}, bus = null) {
  const own = ensureHunterOriginState(state);
  if (own.offer.status !== HUNTER_OFFER_STATUS.OFFERED) {
    return { ok: false, reason: 'not_offered', status: own.offer.status };
  }
  const t = Number.isFinite(simTime) ? simTime : (state.simTime || 0);
  own.offer.status = HUNTER_OFFER_STATUS.DECLINED;
  own.offer.declineCount = (own.offer.declineCount | 0) + 1;
  own.phase = HUNTER_PHASE.IDLE;
  own.stepId = null;
  pushHistory(own, t, 'declined', String(own.offer.declineCount));
  emit(bus, HUNTER_ORIGIN_EVENTS.DECLINED, {
    careerId: HUNTER_ORIGIN_ID,
    declineCount: own.offer.declineCount,
    reofferAllowed: true,
  });
  return { ok: true, status: own.offer.status, reofferAllowed: true };
}

export function acceptHunterOrigin(state, { simTime = 0 } = {}, bus = null) {
  const own = ensureHunterOriginState(state);
  if (
    own.offer.status !== HUNTER_OFFER_STATUS.OFFERED
    && own.offer.status !== HUNTER_OFFER_STATUS.DECLINED
  ) {
    // Allow accept from declined without re-offer UI in tests/integration.
    if (own.offer.status !== HUNTER_OFFER_STATUS.LATENT) {
      return { ok: false, reason: 'not_offerable', status: own.offer.status };
    }
  }
  if (own.offer.status === HUNTER_OFFER_STATUS.COMPLETED) {
    return { ok: false, reason: 'already_completed', status: own.offer.status };
  }
  const t = Number.isFinite(simTime) ? simTime : (state.simTime || 0);
  own.offer.status = HUNTER_OFFER_STATUS.ACCEPTED;
  own.offer.acceptAtSimTime = t;
  own.exclusive = false;
  pushHistory(own, t, 'accepted');
  emit(bus, HUNTER_ORIGIN_EVENTS.ACCEPTED, {
    careerId: HUNTER_ORIGIN_ID,
    exclusive: false,
    mutualNonExclusion: true,
  });
  return enterStep(state, 0, { simTime: t }, bus);
}

export function abandonHunterOrigin(state, { simTime = 0 } = {}, bus = null) {
  const own = ensureHunterOriginState(state);
  if (own.offer.status !== HUNTER_OFFER_STATUS.ACCEPTED) {
    return { ok: false, reason: 'not_active', status: own.offer.status };
  }
  const t = Number.isFinite(simTime) ? simTime : (state.simTime || 0);
  own.offer.status = HUNTER_OFFER_STATUS.ABANDONED;
  own.phase = HUNTER_PHASE.IDLE;
  own.stepId = null;
  clearTarget(own);
  resetProgress(own);
  own.failure = null;
  pushHistory(own, t, 'abandoned');
  // Abandoned becomes re-offerable (treated like decline for dock re-offer).
  own.offer.status = HUNTER_OFFER_STATUS.DECLINED;
  return { ok: true, status: own.offer.status, reofferAllowed: true };
}

// ── Step machine ─────────────────────────────────────────────────────────────

function clearTarget(own) {
  own.target.entityId = null;
  own.target.enemyTypeId = null;
  own.target.label = null;
  own.target.contactWord = null;
  own.target.doctrineId = null;
  own.target.lawful = false;
  own.target.legalBounty = false;
}

function resetProgress(own) {
  own.progress.identifyConfirmed = false;
  own.progress.pursuitContactTicks = 0;
  own.progress.pursuitHeld = false;
  own.progress.counterplayReady = false;
  own.progress.counterplayResolved = false;
  own.progress.cleanFinish = false;
}

function enterStep(state, stepIndex, { simTime = 0 } = {}, bus = null) {
  const own = ensureHunterOriginState(state);
  const step = stepDefAt(stepIndex);
  if (!step) {
    return completeChain(state, { simTime }, bus);
  }
  const t = Number.isFinite(simTime) ? simTime : (state.simTime || 0);
  own.stepIndex = stepIndex;
  own.stepId = step.id;
  own.phase = HUNTER_PHASE.ACTIVE;
  own.failure = null;
  if (stepIndex === 0) {
    clearTarget(own);
    resetProgress(own);
  } else if (stepIndex === 1) {
    own.progress.pursuitContactTicks = 0;
    own.progress.pursuitHeld = false;
    // Assign doctrine for pursuit drill if mark lacks one.
    if (!own.target.doctrineId) {
      own.target.doctrineId = pickHunterDoctrine(own);
    }
  } else if (stepIndex === 2) {
    own.progress.counterplayReady = false;
    own.progress.counterplayResolved = false;
    own.progress.cleanFinish = false;
  }
  pushHistory(own, t, 'step_enter', step.id);
  emit(bus, HUNTER_ORIGIN_EVENTS.STEP_ENTER, {
    careerId: HUNTER_ORIGIN_ID,
    stepId: step.id,
    stepIndex,
    line: step.line,
    objective: step.objective,
    teach: step.teach,
  });
  return { ok: true, stepId: step.id, stepIndex, phase: own.phase };
}

/**
 * Step 1 — identify: player nominates an entity as the mark.
 * Uses live classification; lawful/civilian marks fail with recovery.
 */
export function confirmHunterMark(state, entity, { simTime = 0 } = {}, bus = null) {
  const own = ensureHunterOriginState(state);
  if (own.offer.status !== HUNTER_OFFER_STATUS.ACCEPTED || own.stepId !== 'identify') {
    return { ok: false, reason: 'wrong_step', stepId: own.stepId };
  }
  if (own.phase !== HUNTER_PHASE.ACTIVE && own.phase !== HUNTER_PHASE.RECOVERING) {
    return { ok: false, reason: 'not_active', phase: own.phase };
  }

  const t = Number.isFinite(simTime) ? simTime : (state.simTime || 0);
  const cls = classifyHunterContact(state, entity);

  if (!entity) {
    return failStep(state, 'no_mark', { simTime: t }, bus);
  }
  if (cls.lawful || FORBIDDEN_MARK.has(cls.contactWord) && cls.contactWord === 'PATROL') {
    return failStep(state, 'marked_lawful', { simTime: t, detail: cls.contactWord }, bus);
  }
  if (cls.civilian || FORBIDDEN_MARK.has(cls.contactWord)) {
    return failStep(state, 'marked_civilian', { simTime: t, detail: cls.contactWord }, bus);
  }
  if (!cls.legalBounty) {
    return failStep(state, 'marked_civilian', { simTime: t, detail: cls.contactWord || 'unknown' }, bus);
  }

  own.target.entityId = entity.id;
  own.target.enemyTypeId = cls.enemyTypeId;
  own.target.label = cls.label;
  own.target.contactWord = cls.contactWord;
  own.target.doctrineId = cls.doctrineId || pickHunterDoctrine(own);
  own.target.lawful = false;
  own.target.legalBounty = true;
  own.progress.identifyConfirmed = true;
  own.phase = HUNTER_PHASE.ACTIVE;
  own.failure = null;
  pushHistory(own, t, 'identified', String(entity.id));
  emit(bus, 'hunterOrigin:identified', {
    careerId: HUNTER_ORIGIN_ID,
    entityId: entity.id,
    contactWord: cls.contactWord,
    doctrineId: own.target.doctrineId,
  });
  return completeStep(state, { simTime: t }, bus);
}

/**
 * Step 2 — pursuit: tick contact maintenance. Call when mark remains a legal hostile contact.
 * `inContact` is supplied by lead/sensors; this candidate stays spawn-agnostic.
 */
export function tickHunterPursuit(state, { inContact = false, simTime = 0, dtTicks = 1 } = {}, bus = null) {
  const own = ensureHunterOriginState(state);
  if (own.offer.status !== HUNTER_OFFER_STATUS.ACCEPTED || own.stepId !== 'pursuit') {
    return { ok: false, reason: 'wrong_step', stepId: own.stepId };
  }
  if (own.phase === HUNTER_PHASE.FAILED) {
    return { ok: false, reason: 'failed', failure: own.failure };
  }
  if (own.phase === HUNTER_PHASE.RECOVERING) {
    return { ok: false, reason: 'recovering', failure: own.failure };
  }

  const step = HUNTER_STEP_BY_ID.pursuit;
  const need = step.pursuitContactTicks;
  const ticks = Math.max(1, dtTicks | 0);

  if (inContact) {
    own.progress.pursuitContactTicks += ticks;
  }

  if (own.progress.pursuitContactTicks >= need) {
    own.progress.pursuitHeld = true;
    own.progress.counterplayReady = true;
    const t = Number.isFinite(simTime) ? simTime : (state.simTime || 0);
    emit(bus, 'hunterOrigin:pursuitHeld', {
      careerId: HUNTER_ORIGIN_ID,
      entityId: own.target.entityId,
      doctrineId: own.target.doctrineId,
      ticks: own.progress.pursuitContactTicks,
      telegraphTicks: DOCTRINE_TELEGRAPH_TICKS,
    });
    return completeStep(state, { simTime: t }, bus);
  }
  return {
    ok: true,
    progress: own.progress.pursuitContactTicks,
    need,
    doctrineId: own.target.doctrineId,
  };
}

/** Explicit pursuit failure (mark lost long enough). Recoverable. */
export function failHunterPursuitLost(state, { simTime = 0 } = {}, bus = null) {
  return failStep(state, 'mark_lost', { simTime }, bus);
}

/**
 * Step 3 — counterplay success paths:
 *  - `resolveHunterCounterplay` after reading the telegraph window
 *  - `resolveHunterCleanKill` when the marked hostile dies to the player without heat spike
 */
export function resolveHunterCounterplay(state, { simTime = 0, success = true } = {}, bus = null) {
  const own = ensureHunterOriginState(state);
  if (own.offer.status !== HUNTER_OFFER_STATUS.ACCEPTED || own.stepId !== 'counterplay') {
    return { ok: false, reason: 'wrong_step', stepId: own.stepId };
  }
  const t = Number.isFinite(simTime) ? simTime : (state.simTime || 0);
  if (!success) {
    return failStep(state, 'counter_failed', { simTime: t }, bus);
  }
  own.progress.counterplayResolved = true;
  own.progress.cleanFinish = true;
  emit(bus, 'hunterOrigin:counterplayDone', {
    careerId: HUNTER_ORIGIN_ID,
    mode: 'counter',
    entityId: own.target.entityId,
    doctrineId: own.target.doctrineId,
  });
  return completeStep(state, { simTime: t }, bus);
}

export function resolveHunterCleanKill(state, killPayload, { simTime = 0 } = {}, bus = null) {
  const own = ensureHunterOriginState(state);
  if (own.offer.status !== HUNTER_OFFER_STATUS.ACCEPTED || own.stepId !== 'counterplay') {
    return { ok: false, reason: 'wrong_step', stepId: own.stepId };
  }
  const t = Number.isFinite(simTime) ? simTime : (state.simTime || 0);
  const victimId = killPayload && killPayload.id;
  const killerId = killPayload && killPayload.killerId;
  if (killerId !== state.playerId) {
    return { ok: false, reason: 'not_player_kill' };
  }
  if (own.target.entityId != null && victimId !== own.target.entityId) {
    // Collateral — if unlawful victim flags present, hard fail.
    if (killPayload.factionLawful || killPayload.illegalToKill) {
      return failStep(state, 'illegal_kill', { simTime: t }, bus);
    }
    return { ok: false, reason: 'wrong_victim' };
  }
  if (killPayload.factionLawful || killPayload.illegalToKill) {
    return failStep(state, 'illegal_kill', { simTime: t }, bus);
  }
  // Heat authority: if already wanted after the kill path, treat as voided bag.
  if (isPlayerWanted(state)) {
    return failStep(state, 'heat_spiked', { simTime: t }, bus);
  }
  own.progress.counterplayResolved = true;
  own.progress.cleanFinish = true;
  emit(bus, 'hunterOrigin:counterplayDone', {
    careerId: HUNTER_ORIGIN_ID,
    mode: 'clean_kill',
    entityId: victimId,
    doctrineId: own.target.doctrineId,
  });
  return completeStep(state, { simTime: t }, bus);
}

/** Illegal fire / heat observers for steps 2–3. */
export function noteHunterIllegalFire(state, { simTime = 0 } = {}, bus = null) {
  const own = ensureHunterOriginState(state);
  if (own.offer.status !== HUNTER_OFFER_STATUS.ACCEPTED) return { ok: false, reason: 'inactive' };
  if (own.stepId !== 'pursuit' && own.stepId !== 'counterplay') return { ok: false, reason: 'wrong_step' };
  return failStep(state, 'illegal_fire', { simTime }, bus);
}

export function noteHunterHeatSpiked(state, { simTime = 0 } = {}, bus = null) {
  const own = ensureHunterOriginState(state);
  if (own.offer.status !== HUNTER_OFFER_STATUS.ACCEPTED) return { ok: false, reason: 'inactive' };
  if (own.phase === HUNTER_PHASE.COMPLETE) return { ok: false, reason: 'complete' };
  return failStep(state, 'heat_spiked', { simTime }, bus);
}

// ── Failure / recovery ───────────────────────────────────────────────────────

export function failStep(state, code, { simTime = 0, detail = '' } = {}, bus = null) {
  const own = ensureHunterOriginState(state);
  const t = Number.isFinite(simTime) ? simTime : (state.simTime || 0);
  const hint = HUNTER_RECOVERY_HINTS[code] || 'Reset the mark and try again.';
  own.phase = HUNTER_PHASE.FAILED;
  own.failure = {
    code: String(code),
    reason: detail ? `${code}:${detail}` : String(code),
    atSimTime: t,
    recoveryHint: hint,
  };
  pushHistory(own, t, 'step_failed', own.failure.reason);
  emit(bus, HUNTER_ORIGIN_EVENTS.STEP_FAILED, {
    careerId: HUNTER_ORIGIN_ID,
    stepId: own.stepId,
    stepIndex: own.stepIndex,
    failure: { ...own.failure },
  });
  // Immediate transition into recoverable phase (lawful failure is never hard-lock).
  own.phase = HUNTER_PHASE.RECOVERING;
  return { ok: false, failed: true, failure: { ...own.failure }, phase: own.phase };
}

/**
 * Recovery gate. Heat-related failures require !isPlayerWanted; mark failures just re-arm the step.
 */
export function recoverHunterStep(state, { simTime = 0 } = {}, bus = null) {
  const own = ensureHunterOriginState(state);
  if (own.phase !== HUNTER_PHASE.RECOVERING && own.phase !== HUNTER_PHASE.FAILED) {
    return { ok: false, reason: 'not_recovering', phase: own.phase };
  }
  const t = Number.isFinite(simTime) ? simTime : (state.simTime || 0);
  const code = own.failure && own.failure.code;

  if (code === 'heat_spiked' || code === 'illegal_kill' || code === 'illegal_fire') {
    if (isPlayerWanted(state)) {
      return {
        ok: false,
        reason: 'heat_still_wanted',
        wanted: true,
        threshold: WANTED_THRESHOLD,
        recoveryHint: HUNTER_RECOVERY_HINTS.heat_spiked,
      };
    }
  }

  // Re-arm current step; identify loses the mark.
  if (own.stepId === 'identify') {
    clearTarget(own);
    own.progress.identifyConfirmed = false;
  } else if (own.stepId === 'pursuit') {
    own.progress.pursuitContactTicks = 0;
    own.progress.pursuitHeld = false;
  } else if (own.stepId === 'counterplay') {
    own.progress.counterplayReady = false;
    own.progress.counterplayResolved = false;
    own.progress.cleanFinish = false;
  }
  own.failure = null;
  own.phase = HUNTER_PHASE.ACTIVE;
  pushHistory(own, t, 'recovered', own.stepId || '');
  emit(bus, HUNTER_ORIGIN_EVENTS.RECOVERED, {
    careerId: HUNTER_ORIGIN_ID,
    stepId: own.stepId,
    stepIndex: own.stepIndex,
  });
  return { ok: true, phase: own.phase, stepId: own.stepId };
}

function completeStep(state, { simTime = 0 } = {}, bus = null) {
  const own = ensureHunterOriginState(state);
  const t = Number.isFinite(simTime) ? simTime : (state.simTime || 0);
  const step = stepDefAt(own.stepIndex);
  pushHistory(own, t, 'step_complete', step ? step.id : String(own.stepIndex));
  emit(bus, HUNTER_ORIGIN_EVENTS.STEP_COMPLETE, {
    careerId: HUNTER_ORIGIN_ID,
    stepId: step && step.id,
    stepIndex: own.stepIndex,
  });
  const next = own.stepIndex + 1;
  if (next >= HUNTER_ORIGIN_STEPS.length) {
    return completeChain(state, { simTime: t }, bus);
  }
  return enterStep(state, next, { simTime: t }, bus);
}

function completeChain(state, { simTime = 0 } = {}, bus = null) {
  const own = ensureHunterOriginState(state);
  const t = Number.isFinite(simTime) ? simTime : (state.simTime || 0);
  own.phase = HUNTER_PHASE.COMPLETE;
  own.offer.status = HUNTER_OFFER_STATUS.COMPLETED;
  own.stepIndex = HUNTER_ORIGIN_STEPS.length;
  own.stepId = null;
  own.failure = null;

  if (!own.reward.granted) {
    own.reward.granted = true;
    own.reward.grantedAtSimTime = t;
    // Economy single-writer: emit intent only.
    emit(bus, HUNTER_ORIGIN_EVENTS.GRANT_CREDITS, {
      amount: own.reward.credits,
      reason: HUNTER_ORIGIN_REWARD.reason,
    });
    emit(bus, HUNTER_ORIGIN_EVENTS.REWARD, {
      careerId: HUNTER_ORIGIN_ID,
      credits: own.reward.credits,
      unlockId: own.reward.unlockId,
      unlockLabel: own.reward.unlockLabel,
      boardBias: { ...own.reward.boardBias },
      dominatesOtherCareers: false,
    });
  }

  pushHistory(own, t, 'completed');
  emit(bus, HUNTER_ORIGIN_EVENTS.COMPLETED, {
    careerId: HUNTER_ORIGIN_ID,
    exclusive: false,
    reward: {
      credits: own.reward.credits,
      unlockId: own.reward.unlockId,
      unlockLabel: own.reward.unlockLabel,
    },
  });
  return {
    ok: true,
    completed: true,
    phase: own.phase,
    reward: {
      credits: own.reward.credits,
      unlockId: own.reward.unlockId,
      granted: own.reward.granted,
    },
  };
}

// ── Snapshot / presentation helpers (no HUD ownership) ───────────────────────

export function hunterOriginPresentation(state) {
  const own = getHunterOriginState(state) || createHunterOriginState(state && state.seed);
  const step = own.stepId ? HUNTER_STEP_BY_ID[own.stepId] : stepDefAt(own.stepIndex);
  return {
    careerId: HUNTER_ORIGIN_ID,
    exclusive: false,
    offerStatus: own.offer.status,
    phase: own.phase,
    stepId: own.stepId,
    stepIndex: own.stepIndex,
    line: step ? step.line : null,
    objective: step ? step.objective : null,
    failure: own.failure ? { ...own.failure } : null,
    target: { ...own.target },
    progress: { ...own.progress },
    reward: {
      credits: own.reward.credits,
      unlockLabel: own.reward.unlockLabel,
      granted: own.reward.granted,
    },
    firstDockStationId: own.offer.firstDockStationId,
  };
}

// ── Optional sim system (not registered; lead may drop into registry later) ──

export const hunterOrigin = {
  name: 'hunterOrigin',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this._subs = [];
    ensureHunterOriginState(this.state);
    this._listen('dock:docked', (p) => {
      onHunterFirstDock(this.state, {
        stationId: p && p.stationId,
        simTime: this.state.simTime || 0,
      }, this.bus);
    });
    this._listen('entity:killed', (p) => {
      const own = getHunterOriginState(this.state);
      if (!own || own.offer.status !== HUNTER_OFFER_STATUS.ACCEPTED) return;
      if (own.stepId === 'counterplay' && own.phase === HUNTER_PHASE.ACTIVE) {
        resolveHunterCleanKill(this.state, p || {}, { simTime: this.state.simTime || 0 }, this.bus);
      }
    });
    this._listen('heat:changed', (p) => {
      const own = getHunterOriginState(this.state);
      if (!own || own.offer.status !== HUNTER_OFFER_STATUS.ACCEPTED) return;
      if (own.phase !== HUNTER_PHASE.ACTIVE) return;
      if (p && typeof p.value === 'number' && p.value >= WANTED_THRESHOLD) {
        noteHunterHeatSpiked(this.state, { simTime: this.state.simTime || 0 }, this.bus);
      }
    });
  },

  newGame() {
    if (!this.state) return;
    if (!this.state.careers) this.state.careers = {};
    if (!this.state.careers.origins) this.state.careers.origins = {};
    this.state.careers.origins.hunter = createHunterOriginState(this.state.seed || 1);
  },

  update(_dt, state) {
    if (!state) return;
    this.state = state;
    ensureHunterOriginState(state);
  },

  serialize() {
    return serializeHunterOrigin(this.state);
  },

  deserialize(blob) {
    return deserializeHunterOrigin(blob, this.state, this.state && this.state.seed);
  },

  destroy() {
    for (const off of this._subs || []) {
      try { off(); } catch (_) { /* cleanup must not throw */ }
    }
    this._subs = [];
  },

  _listen(evt, fn) {
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const off = this.bus.on(evt, fn);
    if (typeof off === 'function') this._subs.push(off);
  },
};

export default hunterOrigin;
