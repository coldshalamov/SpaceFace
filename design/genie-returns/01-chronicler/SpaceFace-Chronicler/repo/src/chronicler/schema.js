/** The Chronicler's durable schema. No renderer objects, timers, RNG draws, or dependencies. */
export const CHRONICLER_VERSION = 1;
export const DEFAULT_CONFIG = Object.freeze({
  maxStories: 96,
  maxFactsPerStory: 32,
  maxPending: 512,
  factsPerUpdate: 128,
  maxSeen: 2048,
  maxProfiles: 64,
  maxLegends: 24,
  settleSeconds: 2,
  incubationSeconds: 60,
  newsCooldown: 60,
  storyCooldown: 240,
  radioCooldown: 120,
  recallCooldown: 180,
  recallMinAge: 120,
  minNewsScore: 38,
  publishNews: true,
  offerRadio: true,
});

export const FACT_EVENTS = Object.freeze([
  'entity:killed',
  'aftermathWreck:recorded', 'aftermathWreck:spawned',
  'aftermath:causeRecorded', 'aftermath:remedied',
  'loot:manifestPayload', 'salvage:completed',
  'salvage:reactorVented', 'salvage:reactorTowedClear', 'salvage:reactorBurst',
  'aceMemory:transition', 'aceMemory:returnSpawned',
  'distress:rescued', 'heat:changed', 'contraband:scanned',
  'economy:tradeCompleted',
  // An opt-in producer contract, NOT an assertion that stock cargo/economy already emit it.
  'chronicler:provenance',
]);
export const STAGES = Object.freeze([
  'kill', 'aftermath', 'binding', 'salvage', 'recovered', 'sold', 'law',
  'ace', 'rescue', 'wanted', 'scan', 'reactor', 'trade', 'cause', 'remedy',
]);
export const REF_KINDS = Object.freeze(['death', 'marker', 'wreck', 'receipt', 'cause']);
export const COUNTERS = Object.freeze([
  'observed', 'accepted', 'ignored', 'invalid', 'duplicates', 'queueDropped',
  'detailDropped', 'storiesEvicted', 'linksResolved', 'ambiguousLinks',
  'invalidLinks', 'unresolvedLinks', 'storiesPublished', 'newsPublished',
  'radioOffered', 'recallsOffered', 'legendsFormed',
]);

export function finite(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
export function id(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? String(value) : null;
  if (typeof value !== 'string' || !value.trim() || value.length > 192) return null;
  return /[\u0000-\u001f\u007f]/.test(value) ? null : value.trim();
}
export function text(value, fallback = '', max = 160) {
  if (typeof value !== 'string') return fallback;
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) || fallback;
}
export function label(value, fallback = 'unmapped space') {
  return text(value, fallback).replace(/^(sector_|station_|cmdty_|faction_)/, '').replace(/_/g, ' ');
}
export function ref(kind, value) {
  const normalized = id(value);
  return normalized !== null && REF_KINDS.includes(kind) ? { kind, id: normalized } : null;
}
export function refKey(value) { return value ? JSON.stringify([value.kind, value.id]) : ''; }
export function clone(value) { return JSON.parse(JSON.stringify(value)); }
export function compareId(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
export function increment(metrics, key, amount = 1) {
  metrics[key] = Math.min(Number.MAX_SAFE_INTEGER, (metrics[key] || 0) + amount);
}
export function configFor(input = {}) {
  const config = { ...DEFAULT_CONFIG };
  const ceilings = {
    maxStories: 256, maxFactsPerStory: 96, maxPending: 4096,
    factsPerUpdate: 1024, maxSeen: 8192, maxProfiles: 256, maxLegends: 64,
  };
  for (const key of Object.keys(config)) {
    if (typeof config[key] === 'boolean') {
      if (typeof input[key] === 'boolean') config[key] = input[key];
    } else if (Number.isFinite(input[key])) {
      config[key] = Math.max(key in ceilings ? 1 : 0,
        Math.min(key in ceilings ? ceilings[key] : 86400, input[key]));
      if (key in ceilings) config[key] = Math.floor(config[key]);
    }
  }
  // A full causal path has seven nodes when a materialization binding is present.
  config.maxFactsPerStory = Math.max(12, config.maxFactsPerStory);
  config.factsPerUpdate = Math.min(config.factsPerUpdate, config.maxPending);
  return config;
}
export function freshMemory(config, now = 0) {
  return {
    schemaVersion: CHRONICLER_VERSION,
    config: configFor(config),
    nextFact: 1, nextStory: 1,
    clock: Math.max(0, finite(now)),
    pending: [], seen: [], stories: [], profiles: [], legends: [],
    activeWanted: null,
    cadence: { newsAt: null, radioAt: null, recallAt: null },
    recallKeys: [],
    metrics: Object.fromEntries(COUNTERS.map(key => [key, 0])),
  };
}
