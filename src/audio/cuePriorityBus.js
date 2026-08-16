// Pure SG-08 audio-priority arbiter. It computes a short duck envelope for
// high-importance presentation cues without importing Web Audio or runtime UI.

export const PRIORITY_DUCK_THRESHOLD = 0.8;
export const PRIORITY_DUCK_DURATION_MS = 250;
export const PRIORITY_DUCK_DB = -8;
export const AUDIO_PRIORITY_LADDER = Object.freeze([
  'playerCriticalPhysics',
  'weapons',
  'pickupStream',
  'deaths',
  'worldEvents',
  'comms',
  'ambienceMusic',
]);
export const PRIORITY_DUCK_TARGETS = Object.freeze([
  'weaponLoop', 'pickupStream', 'deaths', 'worldEvents', 'comms', 'ambient', 'music', 'engineLoop',
]);
export const PRIORITY_DUCK_UNAFFECTED_TARGETS = Object.freeze([
  'critical',
  'master',
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
    priorityLane: cuePriorityLane(cue),
    priorityRank: cuePriorityRank(cue),
    threshold: finite(opts.threshold, PRIORITY_DUCK_THRESHOLD),
    startMs,
    endMs: startMs + durationMs,
    durationMs,
    duckDb,
    duckGain,
    targets: PRIORITY_DUCK_TARGETS,
  });
}

export function isPriorityDuckTarget(target, envelope = null) {
  if (!target) return false;
  const cueRank = envelope && Number.isFinite(envelope.priorityRank) ? envelope.priorityRank : 1;
  if (typeof target === 'string') {
    return audioPriorityRank(target) > cueRank;
  }

  if (target.critical || target.priorityCue) return false;
  return audioPriorityRank(target) > cueRank;
}

export function duckGainForTarget(target, envelope, nowMs = 0) {
  if (!envelope || finite(nowMs, 0) < envelope.startMs || finite(nowMs, 0) >= envelope.endMs) return 1;
  return isPriorityDuckTarget(target, envelope) ? envelope.duckGain : 1;
}

export function cuePriorityLane(cue) {
  const explicit = cue && (cue.priorityLane || cue.priorityRole || cue.audioLane || cue.role);
  if (explicit) return canonicalPriorityLane(explicit);
  return 'playerCriticalPhysics';
}

export function cuePriorityRank(cue) {
  return audioPriorityRank(cuePriorityLane(cue));
}

export function audioPriorityRank(target) {
  const token = priorityToken(target);
  if (['playercriticalphysics', 'playercritical', 'critical', 'hullwarning', 'tetherstrain', 'impact'].includes(token)) return 1;
  if (['weapons', 'weapon', 'weaponloop', 'combat'].includes(token)) return 2;
  if (['pickupstream', 'pickup', 'miningreward'].includes(token)) return 3;
  if (['deaths', 'death', 'explosion', 'cookoff'].includes(token)) return 4;
  if (['worldevents', 'worldevent', 'world'].includes(token)) return 5;
  if (['comms', 'bark', 'radio'].includes(token)) return 6;
  return 7;
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

function priorityToken(target) {
  if (typeof target === 'string') return normalizeTargetToken(target);
  if (!target) return '';
  return normalizeTargetToken(
    target.priorityLane || target.priorityRole || target.role || target.target || target.kind
    || target.lane || target.category || target.recipeCategory || target.busName || target.bus
    || target.output,
  );
}

function canonicalPriorityLane(value) {
  const rank = audioPriorityRank(value);
  return AUDIO_PRIORITY_LADDER[rank - 1];
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
