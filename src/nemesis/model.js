// Save boundary and fixed resource budgets. Only this schema enters state.nemesis.
import { NEMESIS_STYLES, NEMESIS_KITS, NEMESIS_CHAPTERS } from '../data/nemesisRival.js';

export const NEMESIS_VERSION = 1;
export const LIMITS = Object.freeze({
  witnesses: 32, witnessMemoryS: 0.75, episodes: 8, evidencePerEpisode: 32, evidencePerStyle: 12, dedupe: 128,
  recentTumbles: 32, log: 24, maxCrew: 3, grudge: 9, firstContactS: 180,
  returnMinS: 120, returnMaxS: 300, retryS: 15, warningS: 6, checkS: 0.25,
  minEncounterS: 8, retreatHull: 0.32, surrenderHull: 0.18,
  maxEncounterS: 240, tumbleWindowS: 8, evidenceWindowS: 5,
});
export const OUTCOMES = Object.freeze([
  'rival_escaped', 'player_escaped', 'player_defeated', 'spared', 'destroyed', 'lost', 'interrupted',
]);
export const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
export const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
export const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
export const integer = (value, lo = 0, hi = 1000000000) => clamp(Math.floor(finite(value)), lo, hi);
export const counts = () => Object.fromEntries(NEMESIS_STYLES.map((style) => [style, 0]));
export const keyForId = (id) => typeof id === 'number' && Number.isSafeInteger(id)
  ? `n:${id}` : typeof id === 'string' && id.length > 0 && id.length <= 96 ? `s:${id}` : null;
export const boundedPush = (list, row, max) => {
  list.push(row);
  if (list.length > max) list.splice(0, list.length - max);
};
export const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 120) => typeof value === 'string' ? value.slice(0, max) : '';
const id = (value) => keyForId(value) ? value : null;
const time = (value) => Math.max(0, finite(value));
const styleId = (value) => NEMESIS_STYLES.includes(value) ? value : null;
const kitId = (value) => Object.hasOwn(NEMESIS_KITS, value) ? value : 'open';

export function freshNemesis(now = 0) {
  return {
    schemaVersion: NEMESIS_VERSION, phase: 'waiting', completed: 0, progress: 0, requestSerial: 0,
    grudge: 0, respect: 0, nextContactAt: time(now) + LIMITS.firstContactS, nextCheckAt: time(now),
    lastPrimary: 'open', episodes: [], seen: [], tumbles: [], log: [],
    pending: null, active: null, ending: null,
  };
}

export function freshEpisode(encounterId, now) {
  return { id: encounterId, at: time(now), outcome: null, counts: counts(),
    sources: { direct: 0, report: 0 }, total: 0, contradicted: false };
}

function normalizeCounts(value) {
  return Object.fromEntries(NEMESIS_STYLES.map((style) => [
    style, integer(value && value[style], 0, LIMITS.evidencePerStyle),
  ]));
}

function normalizeEpisode(value) {
  if (!isRecord(value) || !text(value.id)) return null;
  const c = normalizeCounts(value.counts);
  // Malformed saves cannot manufacture more than one encounter's evidence budget.
  let left = LIMITS.evidencePerEpisode;
  for (const style of NEMESIS_STYLES) { c[style] = Math.min(c[style], left); left -= c[style]; }
  return { id: text(value.id), at: time(value.at),
    outcome: OUTCOMES.includes(value.outcome) ? value.outcome : null,
    counts: c, total: LIMITS.evidencePerEpisode - left,
    sources: { direct: integer(value.sources && value.sources.direct, 0, 32),
      report: integer(value.sources && value.sources.report, 0, 32) },
    contradicted: value.contradicted === true,
  };
}

// Plans are reconstructed from catalogue IDs, never trusted arbitrary executable/config payloads.
export function normalizePlan(value) {
  if (!isRecord(value)) return null;
  const primary = kitId(value.primary);
  const secondaryCandidate = styleId(value.secondary);
  const secondary = secondaryCandidate !== primary ? secondaryCandidate : null;
  const chapter = integer(value.chapter, 0, 3);
  const confidence = clamp(finite(value.confidence), 0, 1);
  const plan = {
    version: 1, primary, secondary, chapter,
    level: 5 + chapter, escortCount: Math.min(2, 1 + (chapter >= 2 ? 1 : 0)),
    confidence, evidenceEpisodes: integer(value.evidenceEpisodes, 0, LIMITS.episodes),
    evidenceUnits: integer(value.evidenceUnits, 0, LIMITS.episodes * LIMITS.evidencePerEpisode),
    side: value.side === -1 ? -1 : 1,
    reason: text(value.reason, 240),
    acts: [primary, secondary || 'open', primary],
    title: NEMESIS_CHAPTERS[chapter].title,
    counterBudget: secondary ? 2 : (primary === 'open' ? 0 : 1),
  };
  return plan;
}

/** Unknown future schemas throw: failing loudly is safer than erasing a campaign. */
export function normalizeNemesis(value, now = 0) {
  if (!isRecord(value)) return freshNemesis(now);
  if (value.schemaVersion != null && value.schemaVersion !== NEMESIS_VERSION) {
    throw new RangeError(`Unsupported nemesis save version: ${String(value.schemaVersion)}`);
  }
  const out = freshNemesis(now);
  out.completed = integer(value.completed);
  out.progress = integer(value.progress ?? value.completed, 0, 3);
  out.requestSerial = integer(value.requestSerial);
  out.grudge = integer(value.grudge, 0, LIMITS.grudge);
  out.respect = integer(value.respect, 0, LIMITS.grudge);
  out.nextContactAt = time(value.nextContactAt ?? out.nextContactAt);
  out.nextCheckAt = time(value.nextCheckAt ?? now);
  out.lastPrimary = kitId(value.lastPrimary);
  out.episodes = (Array.isArray(value.episodes) ? value.episodes : []).slice(-LIMITS.episodes)
    .map(normalizeEpisode).filter(Boolean);
  out.seen = [...new Set((Array.isArray(value.seen) ? value.seen : []).slice(-LIMITS.dedupe)
    .filter((key) => typeof key === 'string' && key.length <= 240))];
  out.tumbles = (Array.isArray(value.tumbles) ? value.tumbles : []).slice(-LIMITS.recentTumbles)
    .filter((row) => isRecord(row) && keyForId(row.id))
    .map((row) => ({ id: row.id, at: time(row.at) }));
  out.log = (Array.isArray(value.log) ? value.log : []).slice(-LIMITS.log)
    .filter(isRecord).map((row) => ({ kind: text(row.kind, 40), at: time(row.at),
      encounterId: text(row.encounterId), detail: text(row.detail, 300) }));
  if (['spared', 'destroyed', 'lost'].includes(value.ending)) {
    out.ending = value.ending; out.phase = 'resolved'; return out;
  }
  const pending = value.pending;
  if (isRecord(pending) && text(pending.id) && normalizePlan(pending.plan)) {
    out.pending = { id: text(pending.id), plan: normalizePlan(pending.plan),
      sectorId: text(pending.sectorId), requestedAt: time(pending.requestedAt),
      warningAt: pending.warningAt == null ? null : time(pending.warningAt),
      notBefore: time(pending.notBefore), dispatched: pending.dispatched === true };
    out.phase = 'announced';
  }
  const active = value.active;
  if (isRecord(active) && text(active.id) && id(active.bossId) != null && normalizePlan(active.plan)) {
    const episode = normalizeEpisode(active.episode) || freshEpisode(text(active.id), now);
    out.active = {
      id: text(active.id), sectorId: text(active.sectorId), bossId: id(active.bossId),
      crewIds: [...new Set((Array.isArray(active.crewIds) ? active.crewIds : []).map(id)
        .filter((v) => v != null))].slice(0, LIMITS.maxCrew),
      startedAt: time(active.startedAt), plan: normalizePlan(active.plan), episode,
      retreatAt: active.retreatAt == null ? null : time(active.retreatAt),
      surrenderedAt: active.surrenderedAt == null ? null : time(active.surrenderedAt),
      act: integer(active.act, 0, 2), actChangedAt: time(active.actChangedAt ?? active.startedAt),
      geometryAt: time(active.geometryAt ?? active.startedAt), geometrySamples: integer(active.geometrySamples, 0, 1000),
      farSamples: integer(active.farSamples, 0, 3),
      witnesses: (Array.isArray(active.witnesses) ? active.witnesses : []).slice(-LIMITS.witnesses)
        .filter((row) => isRecord(row) && keyForId(row.id))
        .map((row) => ({ id: row.id, at: time(row.at) })),
    };
    out.pending = null; out.phase = 'encounter';
  }
  return out;
}
