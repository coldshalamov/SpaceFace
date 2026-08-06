// Explicit runtime profiles for the Deterministic Gameplay Lab (Phase 2).
//
// Profiles select authoritative feature defaults and curated system sets. They are NEVER
// inferred from typeof window, process.env, headless/headed, bundler mode, or renderer
// availability. Host adapters may choose presentation; profiles choose gameplay.

/** @typedef {{ combat: Record<string, boolean>, massline2: Record<string, boolean>, travel: Record<string, boolean> }} FeatureConfig */

/** Production browser defaults, written explicitly (no env derivation). */
export const PRODUCTION_FEATURES = Object.freeze({
  combat: Object.freeze({
    missileV2: true,
    weakPoints: true,
    momentumInherit: false,
    whipDamage: true,
    weaponImpulseConsequences: true,
    // Authoritative heat vent lockout — profile-driven, not typeof window (N1).
    weaponHeatVent: true,
  }),
  massline2: Object.freeze({
    enabled: true,
    fireControl: true,
    throw: true,
    contextAttach: true,
    bulletTime: true,
    tumble: true,
    impactDamage: true,
    cloak: true,
    lootShards: true,
    terrainAnchors: true,
    jettisonImpulse: true,
    bombPropulsion: true,
    hitchhiking: true,
    // PQ-029 / SF-27: fitted Tractor heads use a bounded overdamped rope profile.
    masslineHeadTractor: true,
    // PQ-029 / SF-27: fitted Elastic Whip heads use a lively spring-energy profile.
    masslineHeadElasticWhip: true,
    // PQ-029 / SF-27: fitted Frame Couplers exchange bounded momentum on a taut line.
    masslineHeadFrameCoupler: true,
    // PQ-030 / SF-28: fitted Monofilament Sweep heads turn a taut rope crossing into a cut.
    masslineHeadMonofilamentSweep: true,
    // PQ-030 / SF-28: fitted Transverse Snare heads deploy one visible crossing line.
    masslineHeadTransverseSnare: true,
  }),
  travel: Object.freeze({
    travelBurn: true,
    boostNeverBrakes: true,
    dashMomentum: true,
    laneBoost: true,
  }),
});

/**
 * Historical 47-A golden profile: massline/travel families off, combat Tier-B off,
 * weaponImpulseConsequences pinned false (matches scripts/sf-sim.mjs SCENARIO_COMBAT_FLAG_PINS).
 */
export const LEGACY47A_FEATURES = Object.freeze({
  combat: Object.freeze({
    missileV2: false,
    weakPoints: false,
    momentumInherit: false,
    whipDamage: false,
    weaponImpulseConsequences: false,
    // Keep 47-A combat goldens byte-stable (vent lockout would alter fire cadence).
    weaponHeatVent: false,
  }),
  massline2: Object.freeze({
    enabled: false,
    fireControl: false,
    throw: false,
    contextAttach: false,
    bulletTime: false,
    tumble: false,
    impactDamage: false,
    cloak: false,
    lootShards: false,
    terrainAnchors: false,
    jettisonImpulse: false,
    bombPropulsion: false,
    hitchhiking: false,
    masslineHeadTractor: false,
    masslineHeadElasticWhip: false,
    masslineHeadFrameCoupler: false,
    masslineHeadMonofilamentSweep: false,
    masslineHeadTransverseSnare: false,
  }),
  travel: Object.freeze({
    travelBurn: false,
    boostNeverBrakes: false,
    dashMomentum: false,
    laneBoost: false,
  }),
});

/**
 * Curated 47-A system IDs (sf-sim.mjs run47a). Core is always prepended by createSimulation
 * and is listed here for manifest completeness when materializing a full init list.
 * flightSlot / aiSlot are resolved by slot selection at materialize time.
 */
export const LEGACY47A_SYSTEM_IDS = Object.freeze([
  'scenarioRuntime',
  'presentationOrchestrator',
  'presentationAdapters',
  'actions',
  'flightSlot',
  'weapons',
  'physics',
  'combat',
  'cargo',
  'economy',
  'missions',
  'story',
  'save',
]);

/** Optional tactical-AI 47-A variant system IDs (sf-sim --tactical-ai). */
export const LEGACY47A_TACTICAL_SYSTEM_IDS = Object.freeze([
  'scenarioRuntime',
  'presentationOrchestrator',
  'presentationAdapters',
  'aiSlot',
  'aiEncounter',
  'actions',
  'flightSlot',
  'aiPorts',
  'weapons',
  'physics',
  'combat',
  'cargo',
  'economy',
  'missions',
  'story',
  'save',
]);

/**
 * @type {Readonly<Record<string, {
 *   id: string,
 *   label: string,
 *   features: FeatureConfig,
 *   systemSet: 'production' | 'legacy47a',
 *   description: string,
 * }>>}
 */
export const RUNTIME_PROFILES = Object.freeze({
  production: Object.freeze({
    id: 'production',
    label: 'Production',
    features: PRODUCTION_FEATURES,
    systemSet: 'production',
    description: 'Shipped player gameplay: full authoritative system set + browser feature defaults.',
  }),
  legacy47a: Object.freeze({
    id: 'legacy47a',
    label: 'Legacy 47-A',
    features: LEGACY47A_FEATURES,
    systemSet: 'legacy47a',
    description: 'Frozen 47-A golden: curated systems + Tier-B flags off + weaponImpulseConsequences pin.',
  }),
});

export const DEFAULT_RUNTIME_PROFILE_ID = 'production';

export function getRuntimeProfile(profileId = DEFAULT_RUNTIME_PROFILE_ID) {
  const id = typeof profileId === 'string' && profileId ? profileId : DEFAULT_RUNTIME_PROFILE_ID;
  const profile = RUNTIME_PROFILES[id];
  if (!profile) {
    throw new Error(`Unknown runtime profile: ${id}`);
  }
  return profile;
}

/** Deep-freeze-safe clone of a profile's feature config (plain mutable maps for seeding). */
export function cloneFeatureConfig(features) {
  const src = features || PRODUCTION_FEATURES;
  return {
    combat: { ...src.combat },
    massline2: { ...src.massline2 },
    travel: { ...src.travel },
  };
}

/** Immutable snapshot suitable for binding onto a runtime instance. */
export function freezeFeatureConfig(features) {
  const c = cloneFeatureConfig(features);
  return Object.freeze({
    combat: Object.freeze({ ...c.combat }),
    massline2: Object.freeze({ ...c.massline2 }),
    travel: Object.freeze({ ...c.travel }),
  });
}
