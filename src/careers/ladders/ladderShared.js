// Shared deterministic career-ladder engine (CL-00).
// Generic FSM + definition registry + receipt/idempotency helpers.
// Never writes credits, cargo, rep, heat, missions, or story beatIndex.
// Branch ladders (Hauler/Hunter/Prospector) register data definitions later.

import { drawSeeded, hash32 } from '../../core/rng.js';

export const CAREER_LADDERS_SCHEMA_ID = 'spaceface.careerLadders.v1';
export const CAREER_LADDERS_SCHEMA_VERSION = 1;

export const LADDER_STATUS = Object.freeze({
  LATENT: 'latent',
  OFFERED: 'offered',
  ACTIVE: 'active',
  STEP_FAILED: 'step_failed',
  RECOVERING: 'recovering',
  COMPLETED: 'completed',
  DECLINED: 'declined',
  ABANDONED: 'abandoned',
});

export const STEP_STATUS = Object.freeze({
  PENDING: 'pending',
  ACTIVE: 'active',
  FAILED: 'failed',
  RECOVERING: 'recovering',
  DONE: 'done',
});

export const CAREER_LADDER_EVENTS = Object.freeze({
  // UI → system
  ACCEPT: 'career:ladder:accept',
  DECLINE: 'career:ladder:decline',
  ABANDON: 'career:ladder:abandon',
  CHOOSE: 'career:ladder:choose',
  RECOVER: 'career:ladder:recover',
  // system → world
  OFFERED: 'career:ladder:offered',
  STEP_ACTIVE: 'career:ladder:stepActive',
  STEP_DONE: 'career:ladder:stepDone',
  STEP_FAILED: 'career:ladder:stepFailed',
  STEP_RECOVERED: 'career:ladder:stepRecovered',
  COMPLETED: 'career:ladder:completed',
  PROGRESS: 'career:ladder:progress',
  CHOICE_RESOLVED: 'career:ladder:choiceResolved',
});

/**
 * Canonical reward / consequence intent event names (owners elsewhere).
 * Heat is intentionally omitted: heat.js has no public intent listener (owner writes via
 * internal _raise only). Until a canonical heat owner seam exists, ladder defs must not
 * advertise heat consequences — validation rejects them and emit paths omit them.
 */
export const LADDER_REWARD_EVENTS = Object.freeze({
  GRANT_CREDITS: 'economy:grantCredits',
  CHARGE_CREDITS: 'economy:chargeCredits',
  REP_DELTA: 'faction:repDelta',
});

/** Intent-shaped reward object keys only (never direct owner writes). */
export const LADDER_ALLOWED_REWARD_KEYS = Object.freeze([
  'credits',
  'chargeCredits',
  'rep',
  'intents',
]);

/** Bare / dotted keys that look like direct writes — always rejected on definitions. */
export const LADDER_FORBIDDEN_REWARD_KEYS = Object.freeze([
  'cargo',
  'heat',
  'beatIndex',
  'rep_direct',
  'player.credits',
  'player.cargo',
  'player.heat',
  'player.rep',
  'state.player.credits',
  'state.player.cargo',
  'state.player.heat',
  'state.player.beatIndex',
]);

const ALLOWED_REWARD_KEY_SET = new Set(LADDER_ALLOWED_REWARD_KEYS);
const FORBIDDEN_REWARD_KEY_SET = new Set(LADDER_FORBIDDEN_REWARD_KEYS);
const CANONICAL_REWARD_EVENT_SET = new Set(Object.values(LADDER_REWARD_EVENTS));

export const HISTORY_CAP = 24;
export const ATTEMPT_MULT_FLOOR = 0.7;
export const ATTEMPT_MULT_TABLE = Object.freeze([1, 0.85, 0.7]);
export const DEFAULT_RECOVERY_COOLDOWN_S = 30;
export const META_KEY = '__meta';

const LADDER_STATUS_SET = new Set(Object.values(LADDER_STATUS));
const STEP_STATUS_SET = new Set(Object.values(STEP_STATUS));

/** True when an event name is a heat owner-bypass / fake heat advertisement. */
export function isForbiddenHeatEvent(eventName) {
  const e = String(eventName || '');
  if (!e) return false;
  return e === 'heat:delta' || e === 'heat:raise' || e === 'heat:set' || e.startsWith('heat:');
}

/** True when an intent event is a known canonical owner seam for ladder rewards. */
export function isCanonicalRewardEvent(eventName) {
  return CANONICAL_REWARD_EVENT_SET.has(String(eventName || ''));
}

// ── small pure helpers ────────────────────────────────────────────────────────

export function simTimeOf(state) {
  return Number.isFinite(state && state.simTime) ? state.simTime : 0;
}

export function masterSeedOf(state) {
  return ((state && state.meta && state.meta.seed) || (state && state.seed) || 1) >>> 0 || 1;
}

/** ladderRngSeed = hash32(masterSeed, 'careerLadder', careerId) >>> 0 */
export function computeLadderRngSeed(masterSeed, careerId) {
  return hash32((masterSeed >>> 0) || 1, 'careerLadder', String(careerId || '')) >>> 0;
}

/** Failure attempt multiplier: 1 → 0.85 → 0.7 floor. */
export function attemptMultiplier(failureCount) {
  const n = Math.max(0, Math.floor(Number(failureCount) || 0));
  if (n < ATTEMPT_MULT_TABLE.length) return ATTEMPT_MULT_TABLE[n];
  return ATTEMPT_MULT_FLOOR;
}

export function clampInt(value, min, max, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export function clonePlain(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

export function emitOn(bus, event, payload) {
  if (bus && typeof bus.emit === 'function' && event) bus.emit(event, payload);
}

export function emitIntents(bus, intents) {
  if (!Array.isArray(intents)) return;
  for (const intent of intents) {
    if (intent && intent.event) emitOn(bus, intent.event, intent.payload);
  }
}

export function pushHistory(own, entry, simTime) {
  if (!own || typeof own !== 'object') return;
  if (!Array.isArray(own.history)) own.history = [];
  own.history.push({
    t: Number.isFinite(simTime) ? simTime : 0,
    ...entry,
  });
  if (own.history.length > HISTORY_CAP) {
    own.history = own.history.slice(-HISTORY_CAP);
  }
}

export function hasReceipt(own, receiptId) {
  if (!own || !own.receipts || typeof own.receipts !== 'object') return false;
  const id = String(receiptId || '');
  return id !== '' && !!own.receipts[id];
}

/** Record a receipt. Returns false if already present (idempotent guard). */
export function grantReceipt(own, receiptId) {
  if (!own || typeof own !== 'object') return false;
  const id = String(receiptId || '');
  if (!id) return false;
  if (!own.receipts || typeof own.receipts !== 'object') own.receipts = {};
  if (own.receipts[id]) return false;
  own.receipts[id] = true;
  return true;
}

export function drawLadderRng(own, fallbackSeed) {
  return drawSeeded(own, 'rngSeed', fallbackSeed || 1);
}

// ── definition validation ─────────────────────────────────────────────────────

function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

function validatePrereq(prereq, path, errors) {
  if (!prereq || typeof prereq !== 'object' || Array.isArray(prereq)) {
    errors.push(`${path}: prerequisite must be object`);
    return;
  }
  const type = prereq.type;
  if (!isNonEmptyString(type)) {
    errors.push(`${path}: missing type`);
    return;
  }
  if (type === 'or' || type === 'and') {
    if (!Array.isArray(prereq.any || prereq.all)) {
      errors.push(`${path}: ${type} requires any/all array`);
    } else {
      const list = prereq.any || prereq.all;
      list.forEach((p, i) => validatePrereq(p, `${path}.${i}`, errors));
    }
  }
}

/**
 * Validate intent-shaped rewards only.
 * Allowed keys: credits, chargeCredits, rep, intents.
 * Rejects bare cargo/heat/beatIndex and every direct-write-shaped key.
 * Rejects fake heat events inside rewards.intents (no canonical heat owner seam yet).
 */
export function validateRewardSpec(rewards, path, errors) {
  if (rewards == null) return;
  if (typeof rewards !== 'object' || Array.isArray(rewards)) {
    errors.push(`${path}: rewards must be a plain object`);
    return;
  }
  for (const key of Object.keys(rewards)) {
    if (FORBIDDEN_REWARD_KEY_SET.has(key) || key.includes('.') || key === 'cargo' || key === 'heat' || key === 'beatIndex') {
      errors.push(`${path}: forbidden direct-write reward key '${key}'`);
      continue;
    }
    if (!ALLOWED_REWARD_KEY_SET.has(key)) {
      errors.push(`${path}: unknown reward key '${key}' (allowed: credits, chargeCredits, rep, intents)`);
    }
  }
  if (rewards.credits != null && !Number.isFinite(rewards.credits)) {
    errors.push(`${path}.credits must be finite number when present`);
  }
  if (rewards.chargeCredits != null && !Number.isFinite(rewards.chargeCredits)) {
    errors.push(`${path}.chargeCredits must be finite number when present`);
  }
  if (rewards.rep != null) {
    if (!Array.isArray(rewards.rep)) {
      errors.push(`${path}.rep must be array of {factionId,delta}`);
    } else {
      rewards.rep.forEach((r, i) => {
        if (!r || typeof r !== 'object' || !isNonEmptyString(r.factionId) || !Number.isFinite(r.delta)) {
          errors.push(`${path}.rep[${i}] must be {factionId,delta}`);
        }
      });
    }
  }
  if (rewards.intents != null) {
    if (!Array.isArray(rewards.intents)) {
      errors.push(`${path}.intents must be array of {event,payload?}`);
    } else {
      rewards.intents.forEach((intent, i) => {
        if (!intent || !isNonEmptyString(intent.event)) {
          errors.push(`${path}.intents[${i}].event required`);
          return;
        }
        if (isForbiddenHeatEvent(intent.event)) {
          errors.push(`${path}.intents[${i}]: heat consequences are not supported (no canonical heat owner seam)`);
        } else if (!isCanonicalRewardEvent(intent.event)) {
          errors.push(`${path}.intents[${i}].event must be a canonical owner intent (${[...CANONICAL_REWARD_EVENT_SET].join(', ')})`);
        }
      });
    }
  }
}

function validateChoiceConsequences(consequences, path, errors) {
  if (!Array.isArray(consequences)) return;
  consequences.forEach((c, k) => {
    const cp = `${path}[${k}]`;
    if (!c || !isNonEmptyString(c.event)) {
      errors.push(`${cp}.event required`);
      return;
    }
    if (isForbiddenHeatEvent(c.event)) {
      errors.push(`${cp}: heat consequences are not supported (no canonical heat owner seam)`);
    } else if (!isCanonicalRewardEvent(c.event)) {
      errors.push(`${cp}.event must be a canonical owner intent (${[...CANONICAL_REWARD_EVENT_SET].join(', ')})`);
    }
  });
}

/**
 * Validate a data-driven ladder definition.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateLadderDefinition(def) {
  const errors = [];
  if (!def || typeof def !== 'object' || Array.isArray(def)) {
    return { ok: false, errors: ['definition must be a plain object'] };
  }
  if (!isNonEmptyString(def.careerId)) errors.push('careerId required');
  if (!isNonEmptyString(def.title)) errors.push('title required');
  if (def.nonBinding !== true && def.nonBinding !== undefined) {
    // Framework requires non-binding careers; explicit false is rejected.
    if (def.nonBinding === false) errors.push('nonBinding must be true (no exclusive career locks)');
  }
  if (!Array.isArray(def.steps) || def.steps.length === 0) {
    errors.push('steps must be a non-empty array');
  } else {
    const ids = new Set();
    def.steps.forEach((step, i) => {
      const p = `steps[${i}]`;
      if (!step || typeof step !== 'object') {
        errors.push(`${p}: must be object`);
        return;
      }
      if (!isNonEmptyString(step.id)) errors.push(`${p}.id required`);
      else if (ids.has(step.id)) errors.push(`${p}.id duplicate: ${step.id}`);
      else ids.add(step.id);
      if (step.index != null && Number(step.index) !== i) {
        errors.push(`${p}.index must equal array index ${i}`);
      }
      if (Array.isArray(step.prerequisites)) {
        step.prerequisites.forEach((pr, j) => validatePrereq(pr, `${p}.prerequisites[${j}]`, errors));
      }
      if (step.rewards != null) {
        validateRewardSpec(step.rewards, `${p}.rewards`, errors);
      }
      if (Array.isArray(step.choices)) {
        const choiceIds = new Set();
        step.choices.forEach((ch, j) => {
          const cp = `${p}.choices[${j}]`;
          if (!ch || !isNonEmptyString(ch.id)) errors.push(`${cp}.id required`);
          else if (choiceIds.has(ch.id)) errors.push(`${cp}.id duplicate`);
          else choiceIds.add(ch.id);
          if (Array.isArray(ch.consequences)) {
            validateChoiceConsequences(ch.consequences, `${cp}.consequences`, errors);
          }
        });
      }
    });
  }
  if (def.completionBonus != null) {
    validateRewardSpec(def.completionBonus, 'completionBonus', errors);
  }
  if (def.completionRewards != null) {
    validateRewardSpec(def.completionRewards, 'completionRewards', errors);
  }
  return { ok: errors.length === 0, errors };
}

// ── definition registry (module factory — no hardcoded roles) ─────────────────

export function createDefinitionRegistry() {
  /** @type {Map<string, object>} */
  const byId = new Map();
  return {
    register(def) {
      const v = validateLadderDefinition(def);
      if (!v.ok) return { ok: false, reason: 'invalid_definition', errors: v.errors };
      const id = String(def.careerId);
      if (byId.has(id)) return { ok: false, reason: 'duplicate_careerId', careerId: id };
      byId.set(id, freezeDef(def));
      return { ok: true, careerId: id };
    },
    get(careerId) {
      return byId.get(String(careerId || '')) || null;
    },
    has(careerId) {
      return byId.has(String(careerId || ''));
    },
    list() {
      return Array.from(byId.values());
    },
    ids() {
      return Array.from(byId.keys());
    },
    clear() {
      byId.clear();
    },
    size() {
      return byId.size;
    },
  };
}

function freezeDef(def) {
  // Structured clone then shallow-freeze top + steps for safety; deep freeze optional.
  const copy = clonePlain(def);
  copy.nonBinding = true;
  if (!Array.isArray(copy.steps)) copy.steps = [];
  copy.steps = copy.steps.map((s, i) => ({ ...s, index: i }));
  return Object.freeze(copy);
}

// ── instance state factories ──────────────────────────────────────────────────

export function createStepRuntime(stepDef) {
  return {
    id: stepDef.id,
    status: STEP_STATUS.PENDING,
    attempts: 0,
    failures: 0,
    activeSinceS: null,
    failedAtS: null,
    recoveredAtS: null,
    doneAtS: null,
    choiceId: null,
    payload: {},
  };
}

export function createLadderInstanceState(def, rngSeed = 0) {
  const steps = {};
  const list = (def && Array.isArray(def.steps)) ? def.steps : [];
  for (const step of list) {
    steps[step.id] = createStepRuntime(step);
  }
  return {
    careerId: def ? String(def.careerId) : '',
    title: def ? String(def.title || def.careerId) : '',
    status: LADDER_STATUS.LATENT,
    stepIndex: 0,
    stepId: null,
    steps,
    offerNonce: 0,
    offeredAtS: null,
    acceptedAtS: null,
    completedAtS: null,
    declinedAtS: null,
    abandonedAtS: null,
    failedAtS: null,
    recoverReadyAtS: null,
    attemptMult: 1,
    rewardsGranted: false,
    completionReceiptId: null,
    activeChoiceIds: [],
    receipts: {},
    history: [],
    rngSeed: (Number(rngSeed) >>> 0) || 0,
    nonBinding: true,
    flags: {
      nonBinding: true,
      usesRealAuthorities: true,
      exclusive: false,
      blocksOtherCareers: false,
    },
  };
}

export function normalizeLadderStatus(status) {
  const s = String(status || '');
  return LADDER_STATUS_SET.has(s) ? s : LADDER_STATUS.LATENT;
}

export function normalizeStepStatus(status) {
  const s = String(status || '');
  return STEP_STATUS_SET.has(s) ? s : STEP_STATUS.PENDING;
}

// ── prerequisites ─────────────────────────────────────────────────────────────

/**
 * Evaluate a single prerequisite against live state.
 * Supported types (generic, role-agnostic):
 *  - always
 *  - never
 *  - originStatus { careerId, statuses: string[] }
 *  - originCompleted { careerId }  (soft unlock helper)
 *  - ladderStatus { careerId, statuses }
 *  - ladderStepDone { careerId, stepId }
 *  - minSimTime { seconds }
 *  - flag { path on own.flags or state }
 *  - and { all: prereq[] }
 *  - or { any: prereq[] }
 */
export function evaluatePrerequisite(state, prereq, ctx = {}) {
  if (!prereq || typeof prereq !== 'object') return false;
  const type = prereq.type;
  if (type === 'always') return true;
  if (type === 'never') return false;
  if (type === 'and') {
    const all = Array.isArray(prereq.all) ? prereq.all : [];
    return all.every((p) => evaluatePrerequisite(state, p, ctx));
  }
  if (type === 'or') {
    const any = Array.isArray(prereq.any) ? prereq.any : [];
    return any.some((p) => evaluatePrerequisite(state, p, ctx));
  }
  if (type === 'minSimTime') {
    return simTimeOf(state) >= (Number(prereq.seconds) || 0);
  }
  if (type === 'originStatus' || type === 'originCompleted') {
    const careerId = String(prereq.careerId || ctx.careerId || '');
    const origins = state && state.careers && state.careers.origins;
    const leaf = origins && origins[careerId];
    if (!leaf || typeof leaf !== 'object') return false;
    const status = leaf.status
      || (leaf.offer && leaf.offer.status)
      || null;
    if (type === 'originCompleted') {
      return status === 'completed';
    }
    const allowed = Array.isArray(prereq.statuses) ? prereq.statuses : [];
    return allowed.includes(status);
  }
  if (type === 'ladderStatus') {
    const careerId = String(prereq.careerId || '');
    const ladders = state && state.careers && state.careers.ladders;
    const leaf = ladders && ladders[careerId];
    if (!leaf) return false;
    const allowed = Array.isArray(prereq.statuses) ? prereq.statuses : [];
    return allowed.includes(leaf.status);
  }
  if (type === 'ladderStepDone') {
    const careerId = String(prereq.careerId || ctx.careerId || '');
    const stepId = String(prereq.stepId || '');
    const ladders = state && state.careers && state.careers.ladders;
    const leaf = ladders && ladders[careerId];
    if (!leaf || !leaf.steps || !leaf.steps[stepId]) return false;
    return leaf.steps[stepId].status === STEP_STATUS.DONE;
  }
  if (type === 'skillProof') {
    // Soft alternate unlock: callers may stash proof counters under state.careers.ladders.__meta.skillProof
    const meta = state && state.careers && state.careers.ladders && state.careers.ladders[META_KEY];
    const proof = meta && meta.skillProof && typeof meta.skillProof === 'object' ? meta.skillProof : null;
    if (!proof) return false;
    const key = String(prereq.key || '');
    const min = Number(prereq.min) || 0;
    return (Number(proof[key]) || 0) >= min;
  }
  // Unknown types fail closed (safe).
  return false;
}

export function evaluatePrerequisites(state, prereqs, ctx = {}) {
  if (!Array.isArray(prereqs) || prereqs.length === 0) return true;
  return prereqs.every((p) => evaluatePrerequisite(state, p, ctx));
}

// ── reward / consequence intents (never apply directly) ───────────────────────

/**
 * Build reward intents for canonical owners. Does not mutate economy/faction/heat/cargo.
 * Idempotency: caller must gate with grantReceipt before emit.
 */
export function buildRewardIntents(careerId, stepId, rewards, attemptMult = 1, reasonBase = '') {
  const intents = [];
  if (!rewards || typeof rewards !== 'object') return intents;
  const mult = Number.isFinite(attemptMult) ? attemptMult : 1;
  const reason = reasonBase || `career:ladder:${careerId}:${stepId || 'complete'}`;

  // Never interpret bare cargo/heat/beatIndex as rewards — those are forbidden direct writes.
  if (Number.isFinite(rewards.credits) && rewards.credits !== 0) {
    const amount = Math.max(0, Math.round(Number(rewards.credits) * mult));
    if (amount > 0) {
      intents.push({
        event: LADDER_REWARD_EVENTS.GRANT_CREDITS,
        payload: { amount, reason },
      });
    }
  }
  if (Number.isFinite(rewards.chargeCredits) && rewards.chargeCredits > 0) {
    intents.push({
      event: LADDER_REWARD_EVENTS.CHARGE_CREDITS,
      payload: { amount: Math.round(rewards.chargeCredits * mult), reason },
    });
  }
  if (Array.isArray(rewards.rep)) {
    for (const r of rewards.rep) {
      if (!r || !isNonEmptyString(r.factionId) || !Number.isFinite(r.delta)) continue;
      intents.push({
        event: LADDER_REWARD_EVENTS.REP_DELTA,
        payload: {
          factionId: r.factionId,
          delta: Math.round(Number(r.delta) * (r.scaleWithAttempt === false ? 1 : mult)),
          reason,
        },
      });
    }
  }
  // Explicit consequence intents — canonical owner events only; omit fake heat seams.
  if (Array.isArray(rewards.intents)) {
    for (const intent of rewards.intents) {
      if (!intent || !isNonEmptyString(intent.event)) continue;
      if (isForbiddenHeatEvent(intent.event)) continue;
      if (!isCanonicalRewardEvent(intent.event)) continue;
      intents.push({ event: intent.event, payload: intent.payload || {} });
    }
  }
  return intents;
}

export function buildChoiceConsequenceIntents(choice) {
  const intents = [];
  if (!choice || !Array.isArray(choice.consequences)) return intents;
  for (const c of choice.consequences) {
    if (!c || !isNonEmptyString(c.event)) continue;
    // Omit heat:delta / heat:* until a canonical heat owner intent exists.
    if (isForbiddenHeatEvent(c.event)) continue;
    if (!isCanonicalRewardEvent(c.event)) continue;
    intents.push({ event: c.event, payload: c.payload || {} });
  }
  return intents;
}

// ── FSM transitions (pure-ish: mutate own, return result + intents) ───────────

function getStepDef(def, stepId) {
  if (!def || !Array.isArray(def.steps)) return null;
  return def.steps.find((s) => s.id === stepId) || null;
}

function getStepDefAt(def, index) {
  if (!def || !Array.isArray(def.steps)) return null;
  return def.steps[index] || null;
}

function ensureStepRuntime(own, stepDef) {
  if (!own.steps || typeof own.steps !== 'object') own.steps = {};
  if (!own.steps[stepDef.id]) own.steps[stepDef.id] = createStepRuntime(stepDef);
  return own.steps[stepDef.id];
}

export function transitionOffer(own, def, simTime, opts = {}) {
  if (!own || !def) return { ok: false, reason: 'missing' };
  const status = own.status;
  if (status === LADDER_STATUS.ACTIVE || status === LADDER_STATUS.COMPLETED) {
    return { ok: false, reason: 'not_offerable', status };
  }
  if (status === LADDER_STATUS.OFFERED && !opts.force) {
    return { ok: true, reason: 'already_offered', own };
  }
  // Soft gate: first step prerequisites (optional).
  const first = getStepDefAt(def, 0);
  if (first && Array.isArray(first.prerequisites) && opts.state) {
    const pass = evaluatePrerequisites(opts.state, first.prerequisites, { careerId: def.careerId });
    if (!pass && !opts.ignorePrereqs) {
      return { ok: false, reason: 'prerequisites_unmet' };
    }
  }
  own.status = LADDER_STATUS.OFFERED;
  own.offeredAtS = simTime;
  own.offerNonce = clampInt(own.offerNonce, 0, 1e9, 0) + 1;
  pushHistory(own, { kind: 'offered', stepId: first ? first.id : null }, simTime);
  return {
    ok: true,
    own,
    events: [{
      event: CAREER_LADDER_EVENTS.OFFERED,
      payload: {
        careerId: def.careerId,
        nonBinding: true,
        offerNonce: own.offerNonce,
        stepId: first ? first.id : null,
        simTime,
      },
    }],
  };
}

export function transitionAccept(own, def, simTime, opts = {}) {
  if (!own || !def) return { ok: false, reason: 'missing' };
  if (own.status === LADDER_STATUS.ACTIVE) return { ok: false, reason: 'already_active' };
  if (own.status === LADDER_STATUS.COMPLETED) return { ok: false, reason: 'already_completed' };
  if (own.status === LADDER_STATUS.ABANDONED) return { ok: false, reason: 'abandoned' };
  if (own.status !== LADDER_STATUS.OFFERED && !opts.allowFromLatent) {
    return { ok: false, reason: 'not_offered', status: own.status };
  }

  const stepIndex = clampInt(opts.stepIndex != null ? opts.stepIndex : own.stepIndex, 0, def.steps.length - 1, 0);
  const stepDef = getStepDefAt(def, stepIndex);
  if (!stepDef) return { ok: false, reason: 'no_step' };

  if (opts.state && Array.isArray(stepDef.prerequisites) && !opts.ignorePrereqs) {
    if (!evaluatePrerequisites(opts.state, stepDef.prerequisites, { careerId: def.careerId })) {
      return { ok: false, reason: 'prerequisites_unmet' };
    }
  }

  const stepRt = ensureStepRuntime(own, stepDef);
  if (stepRt.status === STEP_STATUS.DONE) {
    return { ok: false, reason: 'step_already_done' };
  }

  own.status = LADDER_STATUS.ACTIVE;
  own.stepIndex = stepIndex;
  own.stepId = stepDef.id;
  own.acceptedAtS = simTime;
  own.failedAtS = null;
  own.recoverReadyAtS = null;
  own.attemptMult = attemptMultiplier(stepRt.failures);
  stepRt.status = STEP_STATUS.ACTIVE;
  stepRt.attempts += 1;
  stepRt.activeSinceS = simTime;
  pushHistory(own, { kind: 'accepted', stepId: stepDef.id, attempt: stepRt.attempts }, simTime);

  const events = [
    {
      event: CAREER_LADDER_EVENTS.STEP_ACTIVE,
      payload: {
        careerId: def.careerId,
        stepId: stepDef.id,
        stepIndex,
        nonBinding: true,
        attemptMult: own.attemptMult,
        simTime,
      },
    },
    {
      event: CAREER_LADDER_EVENTS.PROGRESS,
      payload: progressPayload(own, def, simTime),
    },
  ];
  return { ok: true, own, stepId: stepDef.id, stepIndex, events, intents: [] };
}

export function transitionDecline(own, def, simTime) {
  if (!own) return { ok: false, reason: 'missing' };
  if (own.status !== LADDER_STATUS.OFFERED && own.status !== LADDER_STATUS.LATENT) {
    return { ok: false, reason: 'not_declinable', status: own.status };
  }
  own.status = LADDER_STATUS.DECLINED;
  own.declinedAtS = simTime;
  own.stepId = null;
  pushHistory(own, { kind: 'declined' }, simTime);
  return {
    ok: true,
    own,
    events: [{
      event: CAREER_LADDER_EVENTS.PROGRESS,
      payload: { careerId: own.careerId, status: own.status, nonBinding: true, simTime },
    }],
  };
}

export function transitionAbandon(own, def, simTime) {
  if (!own) return { ok: false, reason: 'missing' };
  if (own.status !== LADDER_STATUS.ACTIVE
    && own.status !== LADDER_STATUS.STEP_FAILED
    && own.status !== LADDER_STATUS.RECOVERING
    && own.status !== LADDER_STATUS.OFFERED) {
    return { ok: false, reason: 'not_abandonable', status: own.status };
  }
  const stepId = own.stepId;
  if (stepId && own.steps && own.steps[stepId]
    && own.steps[stepId].status === STEP_STATUS.ACTIVE) {
    own.steps[stepId].status = STEP_STATUS.FAILED;
    own.steps[stepId].failedAtS = simTime;
  }
  own.status = LADDER_STATUS.ABANDONED;
  own.abandonedAtS = simTime;
  pushHistory(own, { kind: 'abandoned', stepId }, simTime);
  return {
    ok: true,
    own,
    events: [{
      event: CAREER_LADDER_EVENTS.PROGRESS,
      payload: { careerId: own.careerId, status: own.status, stepId, nonBinding: true, simTime },
    }],
  };
}

export function transitionCompleteStep(own, def, simTime, opts = {}) {
  if (!own || !def) return { ok: false, reason: 'missing' };
  if (own.status !== LADDER_STATUS.ACTIVE) return { ok: false, reason: 'not_active', status: own.status };
  const stepId = opts.stepId || own.stepId;
  const stepDef = getStepDef(def, stepId);
  if (!stepDef || own.stepId !== stepDef.id) return { ok: false, reason: 'step_mismatch' };
  const stepRt = ensureStepRuntime(own, stepDef);

  const receiptId = opts.receiptId || `step_done:${def.careerId}:${stepDef.id}:${stepRt.attempts}`;
  if (hasReceipt(own, receiptId)) {
    return { ok: true, reason: 'duplicate_receipt', duplicate: true, own, intents: [], events: [] };
  }
  if (!grantReceipt(own, receiptId)) {
    return { ok: true, reason: 'duplicate_receipt', duplicate: true, own, intents: [], events: [] };
  }

  stepRt.status = STEP_STATUS.DONE;
  stepRt.doneAtS = simTime;
  own.failedAtS = null;
  own.recoverReadyAtS = null;

  const mult = attemptMultiplier(stepRt.failures);
  own.attemptMult = mult;
  const intents = buildRewardIntents(
    def.careerId,
    stepDef.id,
    stepDef.rewards,
    mult,
    `career:ladder:${def.careerId}:${stepDef.id}`,
  );

  const events = [{
    event: CAREER_LADDER_EVENTS.STEP_DONE,
    payload: {
      careerId: def.careerId,
      stepId: stepDef.id,
      stepIndex: own.stepIndex,
      receiptId,
      attemptMult: mult,
      nonBinding: true,
      simTime,
    },
  }];

  const nextIndex = own.stepIndex + 1;
  if (nextIndex >= def.steps.length) {
    // Ladder complete
    const completeReceipt = opts.completionReceiptId || `ladder_done:${def.careerId}`;
    if (!hasReceipt(own, completeReceipt) && grantReceipt(own, completeReceipt)) {
      own.status = LADDER_STATUS.COMPLETED;
      own.completedAtS = simTime;
      own.rewardsGranted = true;
      own.completionReceiptId = completeReceipt;
      own.stepId = null;
      const bonusIntents = buildRewardIntents(
        def.careerId,
        'complete',
        def.completionBonus || def.completionRewards || null,
        1,
        `career:ladder:${def.careerId}:complete`,
      );
      intents.push(...bonusIntents);
      events.push({
        event: CAREER_LADDER_EVENTS.COMPLETED,
        payload: {
          careerId: def.careerId,
          receiptId: completeReceipt,
          nonBinding: true,
          simTime,
        },
      });
      pushHistory(own, { kind: 'completed', receiptId: completeReceipt }, simTime);
    } else if (hasReceipt(own, completeReceipt)) {
      own.status = LADDER_STATUS.COMPLETED;
      own.stepId = null;
    }
  } else {
    const nextDef = getStepDefAt(def, nextIndex);
    own.stepIndex = nextIndex;
    own.stepId = nextDef.id;
    const nextRt = ensureStepRuntime(own, nextDef);
    nextRt.status = STEP_STATUS.ACTIVE;
    nextRt.attempts += 1;
    nextRt.activeSinceS = simTime;
    own.attemptMult = attemptMultiplier(nextRt.failures);
    events.push({
      event: CAREER_LADDER_EVENTS.STEP_ACTIVE,
      payload: {
        careerId: def.careerId,
        stepId: nextDef.id,
        stepIndex: nextIndex,
        nonBinding: true,
        attemptMult: own.attemptMult,
        simTime,
      },
    });
    pushHistory(own, { kind: 'step_done', stepId: stepDef.id, nextStepId: nextDef.id }, simTime);
  }

  events.push({
    event: CAREER_LADDER_EVENTS.PROGRESS,
    payload: progressPayload(own, def, simTime),
  });

  return { ok: true, own, intents, events, receiptId };
}

export function transitionFailStep(own, def, simTime, opts = {}) {
  if (!own || !def) return { ok: false, reason: 'missing' };
  if (own.status !== LADDER_STATUS.ACTIVE) return { ok: false, reason: 'not_active', status: own.status };
  const stepId = opts.stepId || own.stepId;
  const stepDef = getStepDef(def, stepId);
  if (!stepDef || own.stepId !== stepDef.id) return { ok: false, reason: 'step_mismatch' };
  const stepRt = ensureStepRuntime(own, stepDef);

  const receiptId = opts.receiptId || `step_fail:${def.careerId}:${stepDef.id}:${stepRt.attempts}`;
  if (hasReceipt(own, receiptId)) {
    return { ok: true, reason: 'duplicate_receipt', duplicate: true, own, intents: [], events: [] };
  }
  grantReceipt(own, receiptId);

  stepRt.status = STEP_STATUS.FAILED;
  stepRt.failures += 1;
  stepRt.failedAtS = simTime;
  own.status = LADDER_STATUS.STEP_FAILED;
  own.failedAtS = simTime;
  own.attemptMult = attemptMultiplier(stepRt.failures);

  const cooldown = (stepDef.recovery && Number.isFinite(stepDef.recovery.cooldownS))
    ? stepDef.recovery.cooldownS
    : DEFAULT_RECOVERY_COOLDOWN_S;
  own.recoverReadyAtS = simTime + Math.max(0, cooldown);
  own.status = LADDER_STATUS.RECOVERING;
  stepRt.status = STEP_STATUS.RECOVERING;

  const recoveryLine = (stepDef.recovery && stepDef.recovery.hint)
    || opts.recoveryLine
    || 'Retry when ready.';

  pushHistory(own, {
    kind: 'step_failed',
    stepId: stepDef.id,
    code: opts.code || 'failed',
    failures: stepRt.failures,
  }, simTime);

  return {
    ok: true,
    own,
    intents: [],
    events: [
      {
        event: CAREER_LADDER_EVENTS.STEP_FAILED,
        payload: {
          careerId: def.careerId,
          stepId: stepDef.id,
          code: opts.code || 'failed',
          recoveryLine,
          recoverReadyAtS: own.recoverReadyAtS,
          attemptMult: own.attemptMult,
          receiptId,
          nonBinding: true,
          simTime,
        },
      },
      {
        event: CAREER_LADDER_EVENTS.PROGRESS,
        payload: progressPayload(own, def, simTime),
      },
    ],
  };
}

export function transitionRecoverStep(own, def, simTime, opts = {}) {
  if (!own || !def) return { ok: false, reason: 'missing' };
  if (own.status !== LADDER_STATUS.RECOVERING && own.status !== LADDER_STATUS.STEP_FAILED) {
    return { ok: false, reason: 'not_recovering', status: own.status };
  }
  if (Number.isFinite(own.recoverReadyAtS) && simTime < own.recoverReadyAtS && !opts.force) {
    return { ok: false, reason: 'cooldown', recoverReadyAtS: own.recoverReadyAtS };
  }
  const stepId = opts.stepId || own.stepId;
  const stepDef = getStepDef(def, stepId);
  if (!stepDef) return { ok: false, reason: 'no_step' };
  const stepRt = ensureStepRuntime(own, stepDef);

  own.status = LADDER_STATUS.ACTIVE;
  own.stepId = stepDef.id;
  own.failedAtS = null;
  own.recoverReadyAtS = null;
  own.attemptMult = attemptMultiplier(stepRt.failures);
  stepRt.status = STEP_STATUS.ACTIVE;
  stepRt.attempts += 1;
  stepRt.recoveredAtS = simTime;
  stepRt.activeSinceS = simTime;
  pushHistory(own, { kind: 'recovered', stepId: stepDef.id, attempt: stepRt.attempts }, simTime);

  return {
    ok: true,
    own,
    events: [
      {
        event: CAREER_LADDER_EVENTS.STEP_RECOVERED,
        payload: {
          careerId: def.careerId,
          stepId: stepDef.id,
          attemptMult: own.attemptMult,
          nonBinding: true,
          simTime,
        },
      },
      {
        event: CAREER_LADDER_EVENTS.STEP_ACTIVE,
        payload: {
          careerId: def.careerId,
          stepId: stepDef.id,
          stepIndex: own.stepIndex,
          nonBinding: true,
          attemptMult: own.attemptMult,
          simTime,
        },
      },
      {
        event: CAREER_LADDER_EVENTS.PROGRESS,
        payload: progressPayload(own, def, simTime),
      },
    ],
    intents: [],
  };
}

export function transitionResolveChoice(own, def, simTime, choiceId, opts = {}) {
  if (!own || !def) return { ok: false, reason: 'missing' };
  if (own.status !== LADDER_STATUS.ACTIVE) return { ok: false, reason: 'not_active', status: own.status };
  const stepDef = getStepDef(def, own.stepId);
  if (!stepDef || !Array.isArray(stepDef.choices) || stepDef.choices.length === 0) {
    return { ok: false, reason: 'no_choices' };
  }
  const choice = stepDef.choices.find((c) => c.id === choiceId);
  if (!choice) return { ok: false, reason: 'unknown_choice' };

  const receiptId = opts.receiptId || `choice:${def.careerId}:${stepDef.id}:${choiceId}`;
  if (hasReceipt(own, receiptId)) {
    return { ok: true, reason: 'duplicate_receipt', duplicate: true, own, intents: [], events: [] };
  }
  grantReceipt(own, receiptId);

  const stepRt = ensureStepRuntime(own, stepDef);
  stepRt.choiceId = choiceId;
  if (!Array.isArray(own.activeChoiceIds)) own.activeChoiceIds = [];
  own.activeChoiceIds.push(choiceId);

  const intents = buildChoiceConsequenceIntents(choice);
  pushHistory(own, { kind: 'choice', stepId: stepDef.id, choiceId }, simTime);

  return {
    ok: true,
    own,
    intents,
    events: [{
      event: CAREER_LADDER_EVENTS.CHOICE_RESOLVED,
      payload: {
        careerId: def.careerId,
        stepId: stepDef.id,
        choiceId,
        receiptId,
        nonBinding: true,
        simTime,
      },
    }],
  };
}

export function progressPayload(own, def, simTime) {
  const total = def && Array.isArray(def.steps) ? def.steps.length : 0;
  const done = own && own.steps
    ? Object.values(own.steps).filter((s) => s && s.status === STEP_STATUS.DONE).length
    : 0;
  return {
    careerId: own.careerId,
    status: own.status,
    stepId: own.stepId,
    stepIndex: own.stepIndex,
    stepsDone: done,
    stepsTotal: total,
    attemptMult: own.attemptMult,
    nonBinding: true,
    simTime,
  };
}

/**
 * Generic signal router for branch FSMs / live adapters.
 * signal.kind: 'complete' | 'fail' | 'recover' | 'choice' | 'offer' | 'accept'
 */
export function applyLadderSignal(own, def, signal, simTime, opts = {}) {
  if (!signal || typeof signal !== 'object') return { ok: false, reason: 'bad_signal' };
  const kind = String(signal.kind || '');
  if (kind === 'offer') return transitionOffer(own, def, simTime, { ...opts, ...signal });
  if (kind === 'accept') return transitionAccept(own, def, simTime, { ...opts, ...signal });
  if (kind === 'decline') return transitionDecline(own, def, simTime);
  if (kind === 'abandon') return transitionAbandon(own, def, simTime);
  if (kind === 'complete') return transitionCompleteStep(own, def, simTime, { ...opts, ...signal });
  if (kind === 'fail') return transitionFailStep(own, def, simTime, { ...opts, ...signal });
  if (kind === 'recover') return transitionRecoverStep(own, def, simTime, { ...opts, ...signal });
  if (kind === 'choice') {
    return transitionResolveChoice(own, def, simTime, signal.choiceId, { ...opts, ...signal });
  }
  return { ok: false, reason: 'unknown_signal', kind };
}

/** Assert source does not call nondeterministic wall-clock or unseeded PRNG APIs (for tests). */
export function assertNoNondeterminism(sourceText) {
  return {
    hasMathRandom: /\bMath\.random\s*\(/.test(sourceText),
    hasDateNow: /\bDate\.now\s*\(/.test(sourceText),
  };
}
