// Counterweight Circuit — durable section validation, capture and restore.
//
// The feature's saved section is `world.counterweightCircuit`: runtime state at
// state.world.counterweightCircuit, serialized inside the world bag at
// data.world.counterweightCircuit — the same nesting pallasHiddenCache and
// vestaOreCache use. normalizeWorldSaveRecord preserves unknown world keys, so
// the section survives the canonical normalization untouched.
//
// The instance-scoped save adapter (installCounterweightCircuitSaveAdapter)
// extends the shipped save owner exactly like salvageTender's adapter: it wraps
// the world-row fn inside _saveCapturePlan (chunked lane), mutates data.world
// inside _serializeDataSteps (streaming lane), and consumes
// session.data.world.counterweightCircuit inside _restoreChunks after the
// world's own deserialize rebuilt state.world. A disposer restores the owners.

import { COUNTERWEIGHT_EVENTS, COUNTERWEIGHT_EVENT_BY_ID } from './definition.js';
import { normalizeGhost } from './ghost.js';
import { freshEventRecord } from './scoring.js';

export const COUNTERWEIGHT_SAVE_KEY = 'counterweightCircuit';
const SCHEMA = 1;
const finite = (v, d = 0) => (Number.isFinite(v) ? v : d);

export function freshCounterweightCircuitState() {
  return {
    schema: SCHEMA,
    discovered: false,
    firstDiscoveredAt: null,
    venueSpawned: false,
    attemptCounter: 0,
    records: {},
    ghost: {},
    settings: { ghostEnabled: false, ghostReduceMotion: false },
    attempt: null,
    lastResult: null,
    revision: 0,
  };
}

function normalizeRecord(raw) {
  const out = freshEventRecord();
  if (!raw || typeof raw !== 'object') return out;
  out.completions = Math.max(0, Math.trunc(finite(raw.completions)));
  out.attempts = Math.max(0, Math.trunc(finite(raw.attempts)));
  out.bestTimeS = Number.isFinite(raw.bestTimeS) && raw.bestTimeS > 0 ? raw.bestTimeS : null;
  out.bestMedal = ['bronze', 'silver', 'gold'].includes(raw.bestMedal) ? raw.bestMedal : null;
  out.lastTimeS = Number.isFinite(raw.lastTimeS) && raw.lastTimeS > 0 ? raw.lastTimeS : null;
  out.lastMedal = ['none', 'bronze', 'silver', 'gold'].includes(raw.lastMedal) ? raw.lastMedal : null;
  out.lastAt = Number.isFinite(raw.lastAt) ? raw.lastAt : null;
  out.paid = raw.paid === true;
  out.lastAttemptKey = typeof raw.lastAttemptKey === 'string' && raw.lastAttemptKey.length < 96 ? raw.lastAttemptKey : null;
  out.lastResult = raw.lastResult && typeof raw.lastResult === 'object' ? raw.lastResult : null;
  if (!out.paid && raw.pendingReward && typeof raw.pendingReward.eventId === 'string'
    && Number.isSafeInteger(raw.pendingReward.attemptId) && raw.pendingReward.attemptId > 0
    && out.lastAttemptKey === `${raw.pendingReward.eventId}:${raw.pendingReward.attemptId}`
    && out.lastResult?.outcome === 'complete' && out.lastResult.practice !== true && out.completions > 0) {
    out.pendingReward = { eventId: raw.pendingReward.eventId, attemptId: raw.pendingReward.attemptId };
  }
  return out;
}

const LEG_KINDS = new Set(['attach', 'swing', 'release', 'transit', 'seat', 'contain', 'parkAll', 'reacquire']);
const PHASES = new Set(['staged', 'running', 'complete', 'failed', 'cancelled']);

function normalizeFsm(raw, eventId) {
  const def = COUNTERWEIGHT_EVENT_BY_ID[eventId];
  if (!raw || typeof raw !== 'object' || !def || !PHASES.has(raw.phase)) return null;
  const legStatus = Array.isArray(raw.legStatus)
    ? raw.legStatus.slice(0, def.legs.length).map((s) => (['pending', 'active', 'done', 'missed'].includes(s) ? s : 'pending'))
    : def.legs.map(() => 'pending');
  while (legStatus.length < def.legs.length) legStatus.push('pending');
  return {
    eventId,
    attemptId: Math.max(0, Math.trunc(finite(raw.attemptId))),
    practice: raw.practice === true,
    phase: raw.phase,
    legIndex: Math.max(0, Math.min(def.legs.length, Math.trunc(finite(raw.legIndex)))),
    legStartedAt: Number.isFinite(raw.legStartedAt) ? raw.legStartedAt : null,
    armedAt: Number.isFinite(raw.armedAt) ? raw.armedAt : null,
    finishedAt: Number.isFinite(raw.finishedAt) ? raw.finishedAt : null,
    elapsedS: Number.isFinite(raw.elapsedS) ? raw.elapsedS : null,
    reason: typeof raw.reason === 'string' && raw.reason.length < 48 ? raw.reason : null,
    reasonDetail: raw.reasonDetail ?? null,
    mem: raw.mem && typeof raw.mem === 'object' ? raw.mem : {
      sweepRad: {}, lastBearing: {}, dwellS: {}, attachSeen: {},
      legStartedAt: {}, transitAt: {}, insideSince: {}, impacts: 0, maxImpactDp: 0, conditionAtStart: {},
    },
    legStatus,
    result: raw.result ?? null,
  };
}

function normalizeAttempt(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const eventId = typeof raw.eventId === 'string' ? raw.eventId : null;
  if (!eventId || !COUNTERWEIGHT_EVENT_BY_ID[eventId]) return null;
  const fsm = normalizeFsm(raw.fsm, eventId);
  if (!fsm) return null;
  // A terminal attempt is history, not a resumable one.
  if (fsm.phase !== 'staged' && fsm.phase !== 'running') return null;
  const cohort = Array.isArray(raw.cohort)
    ? raw.cohort.filter((r) => typeof r === 'string' && r.length < 64).slice(0, 16)
    : [];
  const shift = raw.shift && Number.isFinite(raw.shift.x) && Number.isFinite(raw.shift.z)
    ? { x: raw.shift.x, z: raw.shift.z } : { x: 0, z: 0 };
  return { eventId, attemptId: fsm.attemptId, practice: raw.practice === true, fsm, shift, cohort };
}

/** Validate the loaded section; anything incoherent is dropped, never trusted. */
export function normalizeCounterweightCircuitState(raw) {
  const out = freshCounterweightCircuitState();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  if (raw.schema !== SCHEMA) return out;
  out.discovered = raw.discovered === true;
  out.firstDiscoveredAt = Number.isFinite(raw.firstDiscoveredAt) ? raw.firstDiscoveredAt : null;
  out.venueSpawned = raw.venueSpawned === true;
  out.attemptCounter = Math.max(0, Math.trunc(finite(raw.attemptCounter)));
  out.revision = Math.max(0, Math.trunc(finite(raw.revision)));
  if (raw.records && typeof raw.records === 'object' && !Array.isArray(raw.records)) {
    for (const def of COUNTERWEIGHT_EVENTS) {
      if (raw.records[def.id]) {
        out.records[def.id] = normalizeRecord(raw.records[def.id]);
        if (out.records[def.id].pendingReward?.eventId !== def.id) delete out.records[def.id].pendingReward;
      }
    }
  }
  if (raw.ghost && typeof raw.ghost === 'object' && !Array.isArray(raw.ghost)) {
    for (const def of COUNTERWEIGHT_EVENTS) {
      const ghost = normalizeGhost(raw.ghost[def.id], def.id);
      if (ghost) out.ghost[def.id] = ghost;
    }
  }
  if (raw.settings && typeof raw.settings === 'object') {
    out.settings.ghostEnabled = raw.settings.ghostEnabled === true;
    out.settings.ghostReduceMotion = raw.settings.ghostReduceMotion === true;
  }
  out.attempt = normalizeAttempt(raw.attempt);
  out.lastResult = raw.lastResult && typeof raw.lastResult === 'object' ? raw.lastResult : null;
  return out;
}

/** The section bytes for the world bag — a clone, plain JSON only. */
export function captureCounterweightCircuitSave(state) {
  const r = state?.world?.counterweightCircuit;
  return r ? JSON.parse(JSON.stringify(r)) : undefined;
}

/** Restore the runtime row from a validated world bag section. */
export function restoreCounterweightCircuitState(state, raw) {
  if (!state?.world) return false;
  state.world.counterweightCircuit = normalizeCounterweightCircuitState(raw);
  return true;
}

/**
 * Instance-scoped adapter over the shipped save owner — the same concrete seam
 * salvageTender uses. Nests the section inside the world bag on both save
 * lanes, consumes it on restore after the world's own deserialize, and returns
 * a disposer that restores the untouched owners.
 */
export function installCounterweightCircuitSaveAdapter(save, systemRef) {
  if (!save || typeof save !== 'object') return () => {};
  const planBefore = save._saveCapturePlan?.bind?.(save);
  const stepsBefore = save._serializeDataSteps?.bind?.(save);
  const restoreBefore = save._restoreChunks?.bind?.(save);
  if (planBefore) {
    save._saveCapturePlan = function* () {
      const rows = yield* planBefore();
      return rows.map(([key, fn]) => (key === 'world'
        ? [key, function worldWithCounterweight() {
            const bag = fn.call(this);
            const section = systemRef?.serialize?.() ?? captureCounterweightCircuitSave(this.state);
            if (bag && typeof bag === 'object' && section) bag[COUNTERWEIGHT_SAVE_KEY] = section;
            return bag;
          }]
        : [key, fn]));
    };
  }
  if (stepsBefore) {
    save._serializeDataSteps = function* () {
      const data = yield* stepsBefore();
      const section = systemRef?.serialize?.() ?? captureCounterweightCircuitSave(this.state);
      if (data?.world && typeof data.world === 'object' && section) {
        data.world[COUNTERWEIGHT_SAVE_KEY] = section;
      }
      yield 'serialize:counterweightCircuit';
      return data;
    };
  }
  if (restoreBefore) {
    save._restoreChunks = function* (session) {
      const section = session?.data?.world?.[COUNTERWEIGHT_SAVE_KEY];
      let hydrated = false;
      const hydrate = () => {
        if (hydrated) return;
        hydrated = true;
        if (section !== undefined) restoreCounterweightCircuitState(this.state, section);
        // An older save with no circuit section clears the previous session's attempt.
        systemRef?.deserialize?.(section);
      };
      // The canonical owner emits save:loaded inside its generator. Install the section at its
      // pre-loaded boundary so the lifecycle listener cannot reconcile the outgoing run first.
      for (const marker of restoreBefore(session)) {
        if (marker === 'pre-loaded') hydrate();
        yield marker;
      }
      hydrate(); // Older/test owners without a pre-loaded marker retain their prior behavior.
    };
  }
  return function disposeCounterweightCircuitSaveAdapter() {
    if (planBefore) save._saveCapturePlan = planBefore;
    if (stepsBefore) save._serializeDataSteps = stepsBefore;
    if (restoreBefore) save._restoreChunks = restoreBefore;
  };
}
