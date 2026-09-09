// Wave-2 feature flags (design/revamp/WAVE2_PROMPT.md, REVAMP_MASTER §3 determinism contract).
//
// ORCHESTRATOR-OWNED. Lanes *request* a flag name here; they never add their own. These gate new
// sim-affecting combat behavior.
//
// Phase 2 determinism model: DEFAULTS come from explicit runtime profiles
// (`src/runtime/runtimeProfiles.js`), not from host/environment detection.
//
// Process-global MAP objects (`COMBAT_FLAGS` / `MASSLINE2_FLAGS` / `TRAVEL_FLAGS`) remain the
// mutable single source of truth that tests `Object.assign` into. Their *initial* values match
// the legacy47a profile (gated features off) so existing Node goldens and flag-restore tests
// stay byte-identical until a runtime explicitly seeds a profile (browser production boot seeds
// `production`; sf-sim 47-A seeds `legacy47a`).
//
// Instance isolation: `createAuthoritativeRuntime` binds a frozen feature config on the runtime
// instance (`runtime.config.features` / `state.runtime.features`). Prefer those for concurrent
// multi-profile hosts. The MAP seed helpers exist for single-run process compatibility with
// call sites that still invoke combatFlag/massline2Flag/travelFlag without a runtime argument.
//
// Readers never branch on `window` — they read the map value (or optional instance features).

import {
  LEGACY47A_FEATURES,
  PRODUCTION_FEATURES,
  cloneFeatureConfig,
} from '../runtime/runtimeProfiles.js';

function mapsFromFeatures(features) {
  const f = features || LEGACY47A_FEATURES;
  return {
    combat: { ...f.combat },
    massline2: { ...f.massline2 },
    travel: { ...f.travel },
  };
}

// Initial process MAPS = legacy47a (gated off). Browser production boot / createRegistry with
// profile production re-seeds to PRODUCTION_FEATURES explicitly.
const _initial = mapsFromFeatures(LEGACY47A_FEATURES);

export const COMBAT_FLAGS = {
  // Missile LOS-tracking + finite fuel then break-and-coast (BP-02). Rewrites missile flight.
  // Production profile: ON. legacy47a / process default: OFF.
  missileV2: _initial.combat.missileV2,
  // Scanning reveals a weak point on large hostiles; hitting its arc does bonus damage (BP-02).
  weakPoints: _initial.combat.weakPoints,
  // Projectile momentum inheritance — OFF in every profile this wave.
  momentumInherit: _initial.combat.momentumInherit,
  // Massline whip damage (T3-14).
  whipDamage: _initial.combat.whipDamage,
  // Universal weapon impulse + collision consequences (PQ-009). 47-A pins this OFF.
  weaponImpulseConsequences: _initial.combat.weaponImpulseConsequences,
  // Forced heat vent lockout + dump (authoritative combat). Production ON; legacy47a OFF.
  // Never gated on typeof window — host-independent (N1).
  weaponHeatVent: _initial.combat.weaponHeatVent,
};

/** Read a combat flag by name; unknown names read false. Pure over the MAP (or instance features). */
export function combatFlag(name, features) {
  if (features && features.combat) return !!features.combat[name];
  return !!COMBAT_FLAGS[name];
}

// Massline Physics Identity (Wave M2). Master `enabled` ANDed into every read.
export const MASSLINE2_FLAGS = {
  enabled: _initial.massline2.enabled,
  fireControl: _initial.massline2.fireControl,
  throw: _initial.massline2.throw,
  contextAttach: _initial.massline2.contextAttach,
  bulletTime: _initial.massline2.bulletTime,
  tumble: _initial.massline2.tumble,
  impactDamage: _initial.massline2.impactDamage,
  cloak: _initial.massline2.cloak,
  lootShards: _initial.massline2.lootShards,
  terrainAnchors: _initial.massline2.terrainAnchors,
  jettisonImpulse: _initial.massline2.jettisonImpulse,
  bombPropulsion: _initial.massline2.bombPropulsion,
  hitchhiking: _initial.massline2.hitchhiking,
  masslineHeadTractor: _initial.massline2.masslineHeadTractor,
  masslineHeadElasticWhip: _initial.massline2.masslineHeadElasticWhip,
  masslineHeadFrameCoupler: _initial.massline2.masslineHeadFrameCoupler,
  masslineHeadMonofilamentSweep: _initial.massline2.masslineHeadMonofilamentSweep,
  masslineHeadTransverseSnare: _initial.massline2.masslineHeadTransverseSnare,
  masslineHeadTwinBridle: _initial.massline2.masslineHeadTwinBridle,
};

/** Read a massline2 flag: master `enabled` AND the named flag. Unknown names read false. */
export function massline2Flag(name, features) {
  if (features && features.massline2) {
    return !!(features.massline2.enabled && features.massline2[name]);
  }
  return !!(MASSLINE2_FLAGS.enabled && MASSLINE2_FLAGS[name]);
}

// Travel Burn (Universe Atlas Wave 1). Load-bearing on both golden flight paths when enabled.
export const TRAVEL_FLAGS = {
  travelBurn: _initial.travel.travelBurn,
  boostNeverBrakes: _initial.travel.boostNeverBrakes,
  dashMomentum: _initial.travel.dashMomentum,
  laneBoost: _initial.travel.laneBoost,
};

/** Read a travel flag by name; unknown names read false. */
export function travelFlag(name, features) {
  if (features && features.travel) return !!features.travel[name];
  return !!TRAVEL_FLAGS[name];
}

/** Snapshot mutable MAP values for restore (tests / multi-runtime dispose). */
export function snapshotFeatureMaps() {
  return {
    combat: { ...COMBAT_FLAGS },
    massline2: { ...MASSLINE2_FLAGS },
    travel: { ...TRAVEL_FLAGS },
  };
}

/** Restore MAP values from a snapshotFeatureMaps() result. */
export function restoreFeatureMaps(snapshot) {
  if (!snapshot) return;
  Object.assign(COMBAT_FLAGS, snapshot.combat);
  Object.assign(MASSLINE2_FLAGS, snapshot.massline2);
  Object.assign(TRAVEL_FLAGS, snapshot.travel);
}

/**
 * Seed process-global flag MAPS from a profile feature config.
 * Does not replace the MAP objects (tests keep Object.assign identity).
 */
export function applyFeatureConfigToMaps(features) {
  const cfg = cloneFeatureConfig(features);
  Object.assign(COMBAT_FLAGS, cfg.combat);
  Object.assign(MASSLINE2_FLAGS, cfg.massline2);
  Object.assign(TRAVEL_FLAGS, cfg.travel);
  return snapshotFeatureMaps();
}

/** Read current MAPS as a feature config object. */
export function featureConfigFromMaps() {
  return {
    combat: { ...COMBAT_FLAGS },
    massline2: { ...MASSLINE2_FLAGS },
    travel: { ...TRAVEL_FLAGS },
  };
}

export { PRODUCTION_FEATURES, LEGACY47A_FEATURES };
