// Deterministic behavior identities for every registered faction kit. K1 owns the five expansion
// factions; D1 extends the same typed sampler to the nine original factions.
// These are simulation-facing ROE/shape inputs, separate from pirate parley doctrines.
// Conditional hostility lives here instead of being faked through reputation relations.

import { hash32, mulberry32 } from '../core/rng.js';

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

function combatSignature({
  preferredMassClasses,
  preferredWeaponFamilies,
  signatureBehavior,
  signatureSpecialist,
  retreatDiscipline,
  paletteClaim,
}) {
  return {
    preferredMassClasses,
    preferredWeaponFamilies,
    signatureBehavior,
    signatureSpecialist,
    retreatDiscipline,
    paletteClaim: {
      factionId: paletteClaim,
      exclusivePerScene: true,
      redundantReads: ['silhouette', 'iff_glyph'],
    },
  };
}

export const FACTION_DOCTRINES = freeze({
  faction_scn: {
    id: 'concord_measured_interdiction',
    combatSignature: combatSignature({
      preferredMassClasses: ['medium', 'heavy'], preferredWeaponFamilies: ['kinetic', 'pd'],
      signatureBehavior: 'tight_wedge_interdiction', signatureSpecialist: 'pd_screen_escort',
      retreatDiscipline: 'disciplined_vector_out', paletteClaim: 'faction_scn',
    }),
    pursuit: [0.46, 0.58],
    engagementRange: [430, 470],
    formations: ['interdiction_line', 'warrant_screen'],
    liveFormations: ['line'],
    combatDoctrineId: 'ranged_disengager',
    firstFire: false,
    disableThenRun: false,
    disableChance: [0.30, 0.42],
    retreatAt: [0.34, 0.42],
    destroyTarget: true,
  },
  faction_mts: {
    id: 'meridian_convoy_preservation',
    combatSignature: combatSignature({
      preferredMassClasses: ['medium', 'heavy'], preferredWeaponFamilies: ['energy', 'kinetic'],
      signatureBehavior: 'asset_bound_screen', signatureSpecialist: 'bulwark_escort',
      retreatDiscipline: 'asset_bound', paletteClaim: 'faction_mts',
    }),
    pursuit: [0.08, 0.18],
    engagementRange: [350, 380],
    formations: ['insured_column', 'cargo_screen'],
    liveFormations: ['line'],
    combatDoctrineId: 'ranged_disengager',
    firstFire: false,
    disableThenRun: false,
    disableChance: [0.45, 0.60],
    retreatAt: [0.58, 0.68],
    destroyTarget: false,
  },
  faction_dmc: {
    id: 'drift_worksite_defense',
    combatSignature: combatSignature({
      preferredMassClasses: ['medium', 'heavy'], preferredWeaponFamilies: ['industrial', 'ordnance'],
      signatureBehavior: 'terrain_herding', signatureSpecialist: 'mine_layer_jackal',
      retreatDiscipline: 'terrain_bound', paletteClaim: 'faction_dmc',
    }),
    pursuit: [0.28, 0.40],
    engagementRange: [315, 350],
    formations: ['cutter_wedge', 'shift_screen'],
    liveFormations: ['wedge'],
    combatDoctrineId: 'ranged_disengager',
    firstFire: false,
    disableThenRun: false,
    disableChance: [0.62, 0.76],
    retreatAt: [0.44, 0.54],
    destroyTarget: false,
  },
  faction_reach: {
    id: 'reach_predatory_overcommit',
    combatSignature: combatSignature({
      preferredMassClasses: ['light', 'medium'], preferredWeaponFamilies: ['impulse', 'tether'],
      signatureBehavior: 'prize_intact_disable_and_dump', signatureSpecialist: 'field_anchor_controller',
      retreatDiscipline: 'loss_triggered_dump_and_run', paletteClaim: 'faction_reach',
    }),
    pursuit: [0.78, 0.92],
    engagementRange: [245, 285],
    formations: ['raider_spear', 'scar_wedge'],
    liveFormations: ['wedge'],
    combatDoctrineId: 'interceptor_flyby',
    firstFire: true,
    disableThenRun: false,
    disableChance: [0.16, 0.28],
    retreatAt: [0.16, 0.24],
    destroyTarget: true,
  },
  faction_quiet: {
    id: 'quiet_long_watch',
    combatSignature: combatSignature({
      preferredMassClasses: ['light', 'medium'], preferredWeaponFamilies: ['kinetic', 'emp'],
      signatureBehavior: 'blind_range_control', signatureSpecialist: 'jammer_specialist',
      retreatDiscipline: 'silent_breakaway', paletteClaim: 'faction_quiet',
    }),
    pursuit: [0.42, 0.52],
    engagementRange: [505, 545],
    formations: ['silent_ring', 'blind_orbit'],
    liveFormations: ['ring'],
    combatDoctrineId: 'ranged_disengager',
    firstFire: true,
    disableThenRun: false,
    disableChance: [0.52, 0.66],
    retreatAt: [0.30, 0.38],
    destroyTarget: true,
  },
  faction_vael: {
    id: 'vael_clause_lattice',
    combatSignature: combatSignature({
      preferredMassClasses: ['medium', 'heavy'], preferredWeaponFamilies: ['energy', 'ordnance'],
      signatureBehavior: 'long_range_clause_lattice', signatureSpecialist: 'pd_screen_escort',
      retreatDiscipline: 'contractual_withdrawal', paletteClaim: 'faction_vael',
    }),
    pursuit: [0.34, 0.46],
    engagementRange: [550, 590],
    formations: ['clause_wedge', 'contract_vector'],
    liveFormations: ['wedge'],
    combatDoctrineId: 'ranged_disengager',
    firstFire: true,
    disableThenRun: false,
    disableChance: [0.34, 0.48],
    retreatAt: [0.70, 0.80],
    destroyTarget: true,
  },
  faction_free: {
    id: 'frontier_mutual_cover',
    combatSignature: combatSignature({
      preferredMassClasses: ['light', 'medium'], preferredWeaponFamilies: ['mixed'],
      signatureBehavior: 'improvised_mutual_cover', signatureSpecialist: 'hostile_interceptor',
      retreatDiscipline: 'neighbor_cover', paletteClaim: 'faction_free',
    }),
    pursuit: [0.20, 0.32],
    engagementRange: [380, 415],
    formations: ['neighbor_wedge', 'open_screen'],
    liveFormations: ['wedge'],
    combatDoctrineId: 'tether_control_raider',
    firstFire: false,
    disableThenRun: false,
    disableChance: [0.40, 0.56],
    retreatAt: [0.50, 0.60],
    destroyTarget: false,
  },
  faction_choir: {
    id: 'choir_ascending_chorus',
    combatSignature: combatSignature({
      preferredMassClasses: ['light', 'medium'], preferredWeaponFamilies: ['thermal', 'energy'],
      signatureBehavior: 'volatile_chorus_charge', signatureSpecialist: 'ember_swarmer',
      retreatDiscipline: 'fanatical', paletteClaim: 'faction_choir',
    }),
    pursuit: [0.62, 0.74],
    engagementRange: [440, 475],
    formations: ['chorus_ring', 'procession_orbit'],
    liveFormations: ['ring'],
    combatDoctrineId: 'interceptor_flyby',
    firstFire: true,
    disableThenRun: false,
    disableChance: [0.08, 0.20],
    retreatAt: [0.10, 0.18],
    destroyTarget: true,
  },
  faction_helix: {
    id: 'helix_controlled_escalation',
    combatSignature: combatSignature({
      preferredMassClasses: ['medium'], preferredWeaponFamilies: ['emp', 'energy'],
      signatureBehavior: 'controlled_disable', signatureSpecialist: 'hostile_repair_tender',
      retreatDiscipline: 'procedural_withdrawal', paletteClaim: 'faction_helix',
    }),
    pursuit: [0.50, 0.62],
    engagementRange: [405, 435],
    formations: ['directorate_line', 'compliance_screen'],
    liveFormations: ['line'],
    combatDoctrineId: 'ranged_disengager',
    firstFire: false,
    disableThenRun: false,
    disableChance: [0.72, 0.84],
    retreatAt: [0.40, 0.48],
    destroyTarget: false,
  },
  faction_understory: {
    id: 'understory_afterwake',
    combatSignature: combatSignature({
      preferredMassClasses: ['medium', 'heavy'], preferredWeaponFamilies: ['industrial', 'tether'],
      signatureBehavior: 'wreck_shadow_recovery', signatureSpecialist: 'tether_control_raider',
      retreatDiscipline: 'host_preservation', paletteClaim: 'faction_understory',
    }),
    pursuit: [0.14, 0.30],
    engagementRange: [410, 450],
    formations: ['wake_cluster', 'host_shadow', 'spore_ring'],
    liveFormations: ['ring', 'wedge'],
    combatDoctrineId: 'ranged_disengager',
    firstFire: false,
    disableThenRun: false,
    disableChance: [0.58, 0.74],
    retreatAt: [0.48, 0.62],
    destroyTarget: false,
    ledgerHullOnly: true,
  },
  faction_fulfillment: {
    id: 'fulfillment_fixed_route',
    combatSignature: combatSignature({
      preferredMassClasses: ['medium', 'heavy'], preferredWeaponFamilies: ['kinetic', 'pd'],
      signatureBehavior: 'fixed_route_grid', signatureSpecialist: 'pd_screen_escort',
      retreatDiscipline: 'route_preservation', paletteClaim: 'faction_fulfillment',
    }),
    pursuit: [0.04, 0.13],
    engagementRange: [365, 400],
    formations: ['perfect_column', 'holding_grid', 'route_stack'],
    liveFormations: ['line'],
    combatDoctrineId: 'ranged_disengager',
    firstFire: false,
    fixedRoute: true,
    disableThenRun: false,
    disableChance: [0.92, 1],
    retreatAt: [0.68, 0.82],
    destroyTarget: false,
  },
  faction_archive: {
    id: 'archive_redaction',
    combatSignature: combatSignature({
      preferredMassClasses: ['medium'], preferredWeaponFamilies: ['emp', 'kinetic'],
      signatureBehavior: 'redaction_standoff', signatureSpecialist: 'lancer_sniper',
      retreatDiscipline: 'evidence_preservation', paletteClaim: 'faction_archive',
    }),
    pursuit: [0, 0.05],
    engagementRange: [455, 490],
    formations: ['reading_ring', 'folio_spiral', 'closed_stack'],
    liveFormations: ['ring'],
    combatDoctrineId: 'ranged_disengager',
    firstFire: false,
    stationDefenseAggression: 1,
    disableThenRun: false,
    disableChance: [0.88, 1],
    retreatAt: [0.78, 0.90],
    destroyTarget: false,
  },
  faction_pitborn: {
    id: 'pitborn_disable_and_run',
    combatSignature: combatSignature({
      preferredMassClasses: ['medium', 'heavy'], preferredWeaponFamilies: ['impulse', 'industrial'],
      signatureBehavior: 'disable_strip_and_run', signatureSpecialist: 'tether_control_raider',
      retreatDiscipline: 'loss_triggered_break', paletteClaim: 'faction_pitborn',
    }),
    pursuit: [0.62, 0.82],
    engagementRange: [300, 340],
    formations: ['broken_wedge', 'yard_pack', 'scrap_hook'],
    liveFormations: ['wedge'],
    combatDoctrineId: 'interceptor_flyby',
    firstFire: true,
    firstFireAgainst: ['faction_scn'],
    disableThenRun: true,
    disableChance: [0.72, 0.88],
    retreatAt: [0.28, 0.42],
    destroyTarget: false,
    civilianHullsSacrosanct: true,
  },
  faction_verge_layers: {
    id: 'verge_observer_lattice',
    combatSignature: combatSignature({
      preferredMassClasses: ['medium'], preferredWeaponFamilies: ['emp', 'energy'],
      signatureBehavior: 'observer_lattice', signatureSpecialist: 'jammer_specialist',
      retreatDiscipline: 'phase_withdrawal', paletteClaim: 'faction_verge_layers',
    }),
    pursuit: [0.24, 0.40],
    engagementRange: [500, 530],
    formations: ['prism_lattice', 'phase_arc', 'silent_tessellation'],
    liveFormations: ['ring'],
    combatDoctrineId: 'ranged_disengager',
    firstFire: false,
    firstFireCondition: 'gate_closer',
    disableThenRun: false,
    disableChance: [0.98, 1],
    retreatAt: [0.88, 0.96],
    destroyTarget: false,
  },
});

export function factionDoctrineFor(factionId) {
  return FACTION_DOCTRINES[factionId] || null;
}

export function factionCombatSignatureFor(factionId) {
  return factionDoctrineFor(factionId)?.combatSignature || null;
}

/**
 * Score one already-authored encounter candidate against a faction's combat signature.
 *
 * This never expands a squad's archetype list and never overrides an identity anchor. It only
 * resolves polymorphic slots that the encounter author intentionally left open, so a faction swap
 * changes the physical wing while scripted set pieces keep their exact cast.
 */
export function factionCompositionWeight(factionId, candidate = {}) {
  const signature = factionCombatSignatureFor(factionId);
  if (!signature) return 1;
  let weight = 1;
  if (signature.preferredMassClasses.includes(candidate.massClass)) weight += 3;
  const families = Array.isArray(candidate.weaponFamilies) ? candidate.weaponFamilies : [];
  if (signature.preferredWeaponFamilies.includes('mixed') && families.length) weight += 1;
  for (const family of families) {
    if (signature.preferredWeaponFamilies.includes(family)) weight += 2;
  }
  if (candidate.id === signature.signatureSpecialist) weight += 8;
  return weight;
}

function between(rng, range) {
  return range[0] + (range[1] - range[0]) * rng();
}

function rounded(value) {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Pure distribution sampler used by AI adapters, checks, and balancing tools. The returned rows are
 * derived only from (factionId, seed, count), so save/load and browser/Electron see identical plans.
 */
export function sampleFactionBehavior(factionId, seed, count = 1) {
  const doctrine = factionDoctrineFor(factionId);
  if (!doctrine) return [];
  const size = Math.max(0, Math.floor(Number(count) || 0));
  const rng = mulberry32(hash32(seed >>> 0, factionId, 'k1-doctrine'));
  const rows = [];
  for (let index = 0; index < size; index++) {
    const formationIndex = Math.floor(rng() * doctrine.formations.length) % doctrine.formations.length;
    const liveFormationIndex = Math.floor(rng() * doctrine.liveFormations.length) % doctrine.liveFormations.length;
    const pursuit = rounded(between(rng, doctrine.pursuit));
    const engagementRange = rounded(between(rng, doctrine.engagementRange));
    const retreatAt = rounded(between(rng, doctrine.retreatAt));
    const disableChance = rounded(between(rng, doctrine.disableChance));
    rows.push(Object.freeze({
      pursuit,
      engagementRange,
      formation: doctrine.formations[formationIndex],
      disableIntent: disableChance,
      retreatAt,
      firstFire: doctrine.firstFire,
      firstFireAgainst: Object.freeze([...(doctrine.firstFireAgainst || [])]),
      firstFireCondition: doctrine.firstFireCondition || null,
      stationDefenseAggression: Number(doctrine.stationDefenseAggression) || 0,
      destroyTarget: doctrine.destroyTarget,
      fixedRoute: doctrine.fixedRoute === true,
      disableChance,
      pursuitCommitment: pursuit,
      preferredRange: engagementRange,
      liveFormation: doctrine.liveFormations[liveFormationIndex],
      retreatHullFraction: retreatAt,
      combatDoctrineId: doctrine.combatDoctrineId,
      disableThenRun: doctrine.disableThenRun === true,
    }));
  }
  return Object.freeze(rows);
}

export default FACTION_DOCTRINES;
