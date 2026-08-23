// PQ-133.11 / CRU-058 — Crucible attack traits → fitted Adventure things.
// Pure frozen data. The compiler still owns grammar; this file only names how a trait is earned
// and carried on a long-lived ship. Trait ids that become Rigs reuse the same id so one catalog
// feeds compileAttackSpec.

import { ATTACK_TRAITS } from './attackTraits.js';
import { SURVIVAL_MUTATOR_CATALOG } from './survivalMutators.js';

function freezeDeep(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    for (const item of value) freezeDeep(item);
  } else {
    for (const key of Object.keys(value)) freezeDeep(value[key]);
  }
  return Object.freeze(value);
}

/**
 * One row per landed Crucible attack trait. `fittedId` is the module or unique weapon a player
 * actually owns. Acquisition is how it is earned. Law/collateral is what the living world thinks.
 */
export const ADVENTURE_TRAIT_MAP = freezeDeep([
  {
    traitId: 'mod_twin_mount',
    form: 'rig',
    fittedId: 'mod_twin_mount',
    name: 'Twin Mount',
    slotType: 'utility',
    size: 'S',
    mass: 3,
    energyDraw: 2,
    price: 12000,
    tech: 'tech_attack_topology',
    acquisition: ['buy', 'research', 'training'],
    training: { careerId: 'hunter', stepId: 'doctrine_pursuit' },
    legality: 'legal',
    collateral: { civilians: 'spread_warning', cargo: 'none' },
    blurb: 'Mount synchronizer. A second weaker root sibling. Heat and spread rise.',
  },
  {
    traitId: 'mod_triad_mount',
    form: 'rig',
    fittedId: 'mod_triad_mount',
    name: 'Triad Mount',
    slotType: 'utility',
    size: 'M',
    mass: 6,
    energyDraw: 6,
    price: 38000,
    tech: 'tech_attack_topology',
    acquisition: ['buy', 'research'],
    legality: 'legal',
    collateral: { civilians: 'wide_spread', cargo: 'none' },
    blurb: 'Three-root synchronizer. Needs a medium utility slot — Hitch cannot carry it.',
  },
  {
    traitId: 'mod_piercing_core',
    form: 'rig',
    fittedId: 'mod_piercing_core',
    name: 'Piercing Core',
    slotType: 'utility',
    size: 'S',
    mass: 2,
    energyDraw: 1,
    price: 14000,
    tech: 'tech_attack_topology',
    acquisition: ['buy', 'research'],
    legality: 'legal',
    collateral: { civilians: 'overpen_risk', cargo: 'none' },
    blurb: 'Emitter insert. The same projectile continues through one extra body.',
  },
  {
    traitId: 'mod_forked_core',
    form: 'rig',
    fittedId: 'mod_forked_core',
    name: 'Forked Core',
    slotType: 'utility',
    size: 'S',
    mass: 3,
    energyDraw: 2,
    price: 18000,
    tech: 'tech_attack_topology',
    acquisition: ['buy', 'research', 'salvage'],
    legality: 'legal',
    collateral: { civilians: 'child_bolts', cargo: 'none' },
    blurb: 'Ammunition/emitter fork. First valid hit splits into two weaker children.',
  },
  {
    traitId: 'mod_bank_shot',
    form: 'rig',
    fittedId: 'mod_bank_shot',
    name: 'Bank Shot',
    slotType: 'utility',
    size: 'S',
    mass: 3,
    energyDraw: 2,
    price: 16000,
    tech: 'tech_ricochet_ballistics',
    acquisition: ['buy', 'research', 'recovered'],
    recoveredSiteId: 'zone_vesta_forge',
    legality: 'legal',
    collateral: { civilians: 'bounce_into_traffic', cargo: 'none' },
    blurb: 'Ballistic computer. Eligible bolts bounce from reflective surfaces.',
    alsoVariantId: 'unique_mirrorjaw_pulse',
  },
  {
    traitId: 'mod_smart_bank',
    form: 'rig',
    fittedId: 'mod_smart_bank',
    name: 'Smart Bank',
    slotType: 'utility',
    size: 'M',
    mass: 5,
    energyDraw: 5,
    price: 44000,
    tech: 'tech_ricochet_ballistics',
    acquisition: ['buy', 'research', 'stolen'],
    legality: 'contraband',
    collateral: { civilians: 'steered_bounce', cargo: 'none' },
    blurb: 'Stolen-grade targeting processor. After a bounce, steers toward a hostile. High signature.',
  },
  {
    traitId: 'mod_ion_payload',
    form: 'rig',
    fittedId: 'mod_ion_payload',
    name: 'Ion Payload',
    slotType: 'utility',
    size: 'S',
    mass: 2,
    energyDraw: 2,
    price: 15000,
    tech: 'tech_payload_conduction',
    acquisition: ['buy', 'research'],
    legality: 'restricted',
    collateral: { civilians: 'subsystem_disable', cargo: 'none' },
    blurb: 'Ionised warhead sleeve. Hits apply Ionized.',
  },
  {
    traitId: 'mod_incendiary_payload',
    form: 'rig',
    fittedId: 'mod_incendiary_payload',
    name: 'Incendiary Payload',
    slotType: 'utility',
    size: 'S',
    mass: 3,
    energyDraw: 2,
    price: 17000,
    tech: 'tech_payload_conduction',
    acquisition: ['buy', 'research'],
    legality: 'restricted',
    collateral: { civilians: 'burning', cargo: 'cooks_hold', populatedSites: 'reckless' },
    blurb: 'Thermal sleeve. Hits apply Burning. Reckless in a populated refinery.',
  },
  {
    traitId: 'mod_gravity_tag',
    form: 'rig',
    fittedId: 'mod_gravity_tag',
    name: 'Gravity Tag',
    slotType: 'utility',
    size: 'S',
    mass: 2,
    energyDraw: 2,
    price: 16000,
    tech: 'tech_payload_conduction',
    acquisition: ['buy', 'research'],
    legality: 'legal',
    collateral: { civilians: 'field_pull', cargo: 'none' },
    blurb: 'Marker sleeve. Hits apply Gravity Marked for the existing field kernel.',
  },
  {
    traitId: 'mod_relay_arc',
    form: 'rig',
    fittedId: 'mod_relay_arc',
    name: 'Relay Arc',
    slotType: 'utility',
    size: 'S',
    mass: 3,
    energyDraw: 3,
    price: 22000,
    tech: 'tech_payload_conduction',
    acquisition: ['buy', 'research'],
    legality: 'restricted',
    collateral: { civilians: 'chain_hop', cargo: 'none', populatedSites: 'reckless' },
    blurb: 'Ion-conduction module. First valid hit jumps to nearby hulls.',
    alsoVariantId: 'unique_mirrorjaw_pulse',
  },
  {
    traitId: 'mod_bank_relay',
    form: 'rig',
    fittedId: 'mod_bank_relay',
    name: 'Bank Relay',
    slotType: 'utility',
    size: 'M',
    mass: 5,
    energyDraw: 4,
    price: 48000,
    tech: 'tech_ricochet_ballistics',
    acquisition: ['buy', 'research', 'recovered'],
    recoveredSiteId: 'zone_vesta_forge',
    legality: 'restricted',
    collateral: { civilians: 'bounced_chain', cargo: 'none' },
    blurb: 'Bridge processor. A bounced hit may chain; a direct hit may not.',
    alsoVariantId: 'unique_mirrorjaw_pulse',
  },
  {
    traitId: 'mod_tether_capacitor',
    form: 'rig',
    fittedId: 'mod_tether_capacitor',
    name: 'Tether Capacitor',
    slotType: 'utility',
    size: 'S',
    mass: 3,
    energyDraw: 3,
    price: 20000,
    tech: 'tech_tractor_systems',
    acquisition: ['buy', 'research'],
    legality: 'legal',
    collateral: { civilians: 'none', cargo: 'none' },
    blurb: 'Massline conductor fitting. Payloads against the live anchor are amplified within a cap.',
  },
  {
    traitId: 'mod_conductive_path',
    form: 'rig',
    fittedId: 'mod_conductive_path',
    name: 'Conductive Path',
    slotType: 'utility',
    size: 'M',
    mass: 4,
    energyDraw: 3,
    price: 36000,
    tech: 'tech_payload_conduction',
    acquisition: ['buy', 'research'],
    legality: 'restricted',
    collateral: { civilians: 'ionized_only_chain', cargo: 'none' },
    blurb: 'Status-to-propagation bridge. Chains only hop to Ionized targets.',
  },
  {
    traitId: 'mod_cryo_payload',
    form: 'rig',
    fittedId: 'mod_cryo_payload',
    name: 'Cryo Payload',
    slotType: 'utility',
    size: 'S',
    mass: 3,
    energyDraw: 2,
    price: 19000,
    tech: 'tech_payload_conduction',
    acquisition: ['buy', 'research'],
    legality: 'legal',
    collateral: { civilians: 'helm_lock', cargo: 'none' },
    blurb: 'Coolant sleeve. Hits apply Cryo Lock — momentum kept, helm reduced.',
  },
  {
    traitId: 'mod_cryo_gyros',
    form: 'rig',
    fittedId: 'mod_cryo_gyros',
    name: 'Cryo Gyros',
    slotType: 'utility',
    size: 'M',
    mass: 7,
    energyDraw: 8,
    price: 62000,
    tech: 'tech_orbit_cryo',
    acquisition: ['buy', 'research', 'salvage'],
    legality: 'legal',
    collateral: { civilians: 'orbit_nodes', cargo: 'none' },
    blurb: 'Utility Rig. Two orbiting field nodes; you have to fly a node onto the target.',
  },
]);

export const ADVENTURE_TRAIT_MAP_BY_ID = freezeDeep(
  Object.fromEntries(ADVENTURE_TRAIT_MAP.map((row) => [row.traitId, row])),
);

/**
 * Challenge mutators are run structure. Adventure already is draftless, one hull, and persistent.
 * They do not become fittings.
 */
export const ADVENTURE_MUTATOR_MAP = freezeDeep(
  SURVIVAL_MUTATOR_CATALOG.map((row) => ({
    mutatorId: row.id,
    fittedId: null,
    form: 'already_adventure',
    blurb: row.blurb,
  })),
);

/** Not a landed AttackSpec trait. Physical reward in Adventure is bounty/salvage, never run score. */
export const ADVENTURE_COLLISION_DIVIDEND = freezeDeep({
  id: 'collision_dividend',
  form: 'doctrine',
  fittedId: null,
  acquisition: ['bounty', 'salvage'],
  blurb: 'Kills pay world credits and salvage. Causal KINDs are a receipt, not a wave score.',
});

export function assertTraitMapComplete(traits = ATTACK_TRAITS) {
  const mapped = new Set(ADVENTURE_TRAIT_MAP.map((row) => row.traitId));
  const missing = [];
  for (const trait of traits) {
    if (!mapped.has(trait.id)) missing.push(trait.id);
  }
  return { ok: missing.length === 0, missing };
}
