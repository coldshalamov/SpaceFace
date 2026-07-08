// Pure SG-08 audio-priority arbiter. It computes a short duck envelope for
// high-importance presentation cues without importing Web Audio or runtime UI.

export const PRIORITY_DUCK_THRESHOLD = 0.8;
export const PRIORITY_DUCK_DURATION_MS = 250;
export const PRIORITY_DUCK_DB = -8;
export const PRIORITY_DUCK_TARGETS = Object.freeze(['weaponLoop', 'engineLoop']);
export const PRIORITY_DUCK_UNAFFECTED_TARGETS = Object.freeze([
  'critical',
  'music',
  'sfx',
  'ui',
  'ambient',
  'comms',
  'master',
  'combat',
]);

const DEFAULT_MIX_PROBES = Object.freeze([
  Object.freeze({ key: 'weaponLoop', role: 'weaponLoop', loop: true }),
  Object.freeze({ key: 'engineLoop', role: 'engineLoop', loop: true }),
  Object.freeze({ key: 'criticalCue', role: 'critical', critical: true }),
  'combat',
  'music',
  'sfx',
  'ui',
  'ambient',
  'comms',
  'master',
]);

export function dbToGain(db) {
  return Math.pow(10, finite(db, 0) / 20);
}

export function cuePriorityImportance(cue) {
  return clamp01(finite(cue && cue.importance, 0));
}

export function isPriorityCue(cue, opts = {}) {
  const threshold = finite(opts.threshold, PRIORITY_DUCK_THRESHOLD);
  return cuePriorityImportance(cue) >= threshold;
}

export function priorityDuckEnvelopeForCue(cue, nowMs = 0, opts = {}) {
  if (!isPriorityCue(cue, opts)) return null;
  const startMs = Math.max(0, finite(nowMs, 0));
  const durationMs = Math.max(1, finite(opts.durationMs, PRIORITY_DUCK_DURATION_MS));
  const duckDb = finite(opts.duckDb, PRIORITY_DUCK_DB);
  const duckGain = round4(dbToGain(duckDb));
  return Object.freeze({
    schema: 'spaceface.cuePriorityDuckEnvelope.v1',
    cueId: cue && (cue.cueId || cue.id || cue.eventId) || null,
    audioId: cue && (cue.audioId || cue.audioCueId || (cue.id && String(cue.id).startsWith('presentation.') ? cue.id : null)) || null,
    importance: cuePriorityImportance(cue),
    playerRelevance: clamp01(finite(cue && cue.playerRelevance, 0)),
    threshold: finite(opts.threshold, PRIORITY_DUCK_THRESHOLD),
    startMs,
    endMs: startMs + durationMs,
    durationMs,
    duckDb,
    duckGain,
    targets: PRIORITY_DUCK_TARGETS,
  });
}

export function isPriorityDuckTarget(target) {
  if (!target) return false;
  if (typeof target === 'string') {
    const key = normalizeTargetToken(target);
    return key === 'weaponloop' || key === 'engineloop';
  }

  if (target.critical || target.priorityCue) return false;
  const role = normalizeTargetToken(target.role || target.target || target.kind || target.lane);
  if (role === 'weaponloop' || role === 'engineloop') return true;

  const busName = normalizeTargetToken(target.busName || target.bus || target.output);
  const category = normalizeTargetToken(target.category || target.recipeCategory);
  const loop = target.loop === true || target.sustained === true;
  if (!loop) return false;
  if (busName === 'engine' || category === 'engine') return true;
  if (category === 'weapon') return true;
  return busName === 'combat' && (target.weapon === true || target.recipeId && String(target.recipeId).includes('wpn'));
}

export function duckGainForTarget(target, envelope, nowMs = 0) {
  if (!envelope || finite(nowMs, 0) < envelope.startMs || finite(nowMs, 0) >= envelope.endMs) return 1;
  return isPriorityDuckTarget(target) ? envelope.duckGain : 1;
}

export function createCuePriorityBus(opts = {}) {
  let active = null;
  const options = { ...opts };

  function activeEnvelope(nowMs = 0) {
    if (!active || finite(nowMs, 0) >= active.endMs) return null;
    return active;
  }

  return {
    applyCue(cue, nowMs = 0) {
      const envelope = priorityDuckEnvelopeForCue(cue, nowMs, options);
      if (envelope) active = envelope;
      return envelope;
    },

    activeEnvelope,

    gainFor(target, nowMs = 0) {
      return duckGainForTarget(target, activeEnvelope(nowMs), nowMs);
    },

    mixSnapshot(nowMs = 0, probes = DEFAULT_MIX_PROBES) {
      const snapshot = {};
      for (const probe of probes) {
        snapshot[keyForProbe(probe)] = this.gainFor(probe, nowMs);
      }
      return snapshot;
    },

    clear() {
      active = null;
    },
  };
}

function keyForProbe(probe) {
  if (typeof probe === 'string') return probe;
  return probe && (probe.key || probe.role || probe.busName || probe.category) || 'unknown';
}

function normalizeTargetToken(value) {
  return String(value || '').replace(/[_\-\s]/g, '').toLowerCase();
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp01(value) {
  const n = finite(value, 0);
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function round4(value) {
  return Math.round(finite(value, 0) * 10000) / 10000;
}
