// Plan 30 — The Developer.
//
// "A tiny, immaculate ship of no known make parked behind a dead gate. It has no weapons, infinite
// dodge, and if you somehow kill it, it drops one of every credit chip denomination and a bark:
// 'rude.' It respawns next seed."
//
// It parks behind the one authored Dead Gate (Plan 25, `deadGate.js`) and keeps its OWN record —
// the gate's recovery state is fail-closed and separately gated, and hanging a second meaning on it
// would make one malformed save able to erase two different things.
//
// DETERMINISM GATE: same idiom as `PLANET_FLAGS` / `FIELD_FLAGS`. Construction is browser-only, so
// `sf-sim` and the 47-A golden tape never build this ship and its presence cannot move a golden.
//
// I-4: the "rude." line is a radio bark through the ordinary voice arbiter. It is never floating
// text over the hull.
//
// Purity contract: frozen data + pure normalization. World owns the spawn and the durable record.

const IS_BROWSER = typeof window !== 'undefined';
export const DEVELOPER_FLAGS = { enabled: IS_BROWSER };
export function developerFlag(name) { return !!DEVELOPER_FLAGS[name]; }

export const THE_DEVELOPER_SCHEMA_VERSION = 1;

export const THE_DEVELOPER = Object.freeze({
  schemaVersion: THE_DEVELOPER_SCHEMA_VERSION,
  recordId: 'the-developer:dione:v1',
  entityId: 'the_developer',
  sectorId: 'sector_dione_lane',
  gatePoiId: 'poi_dione_dead_gate',
  signalId: 'signal:entity:the_developer',
  name: 'Unregistered Hull',
  codexTitle: 'The Developer',

  // Parked BEHIND the ring: the gate anchor is (1720, -1240), and this sits further out along the
  // same outbound axis, in the ring's own shadow. You do not see it on the way in.
  fixedLocalPos: Object.freeze({ x: 1932, z: -1418 }),

  radius: 5,
  mass: 40,

  // No weapons at all, and an evasion the arsenal cannot reasonably solve. It is not invulnerable:
  // the physical verbs (tether, well, terrain) still act on it honestly, which is the only way the
  // plan's "if you somehow kill it" can ever be true.
  evasionTurnRate: 7.2,
  evasionSpeed: 210,
  evasionRadiusWu: 260,

  bark: 'rude.',

  // One of every denomination the kill-reward ladder mints, smallest to largest.
  chipDenominations: Object.freeze([20, 45, 90, 220]),

  scanCopy: Object.freeze({
    classification: 'UNREGISTERED HULL',
    detail: 'No registry, no yard mark, no wear. It is holding station behind a gate that has not worked in a lifetime, and it has already noticed you.',
  }),
});

export function freshTheDeveloperState() {
  return {
    schemaVersion: THE_DEVELOPER_SCHEMA_VERSION,
    phase: 'unseen',
    seenAt: null,
    killedSeed: null,
    killedAt: null,
  };
}

/**
 * `seed` is the live universe seed. A kill is remembered only for the seed it happened under, which
 * is literally how "it respawns next seed" is implemented — no timer, no respawn scheduler.
 */
export function normalizeTheDeveloperState(value, seed = null) {
  const source = value && typeof value === 'object' ? value : {};
  const out = freshTheDeveloperState();
  const seenAt = Number(source.seenAt);
  if (source.phase !== 'seen' && source.phase !== 'killed') return out;
  if (!Number.isFinite(seenAt) || seenAt < 0) return out;
  out.phase = 'seen';
  out.seenAt = seenAt;
  if (source.phase !== 'killed') return out;
  const killedAt = Number(source.killedAt);
  const killedSeed = Number(source.killedSeed);
  if (!Number.isFinite(killedAt) || killedAt < 0 || !Number.isFinite(killedSeed)) return out;
  // A kill recorded under a different universe than the live one is a kill in another universe.
  if (seed != null && Number.isFinite(Number(seed)) && Number(seed) !== killedSeed) return out;
  out.phase = 'killed';
  out.killedAt = killedAt;
  out.killedSeed = killedSeed;
  return out;
}

export function theDeveloperSeen(state) {
  const seed = state && state.meta ? state.meta.seed : null;
  const phase = normalizeTheDeveloperState(state && state.world && state.world.theDeveloper, seed).phase;
  return phase === 'seen' || phase === 'killed';
}

export function theDeveloperKilled(state) {
  const seed = state && state.meta ? state.meta.seed : null;
  return normalizeTheDeveloperState(state && state.world && state.world.theDeveloper, seed).phase === 'killed';
}

/** Should the hull be standing in the world right now? Killed-this-seed means no. */
export function theDeveloperShouldExist(state) {
  if (!developerFlag('enabled')) return false;
  return !theDeveloperKilled(state);
}
