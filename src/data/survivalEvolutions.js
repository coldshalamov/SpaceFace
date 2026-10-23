// Build evolutions (PQ-133.07 / CRU-038) — the named synthesis of a mature build.
//
// WHAT AN EVOLUTION IS
// --------------------
// A draft card adds a fitting. An evolution does the opposite first: it CONSUMES a named set of
// parts the run already holds — fitted or sitting in the run inventory as spares — and lands one
// evolved item in exchange, at an explicit run-credit price. The trade is the design's own rule:
// "an evolution must simplify or focus the build, not merely add every effect at once." Three
// loose behaviours and three held parts become one bounded law and two freed slots.
//
// "The run already holds" means fittings OR moduleInventory, not only mounted hardpoints. A
// two-utility-slot hull (Hornet, Kestrel, Drifter — every starter) cannot mount Bank Shot, Relay
// Arc AND Ion Payload at once; counting only fittings would make the named synthesis unreachable
// on exactly the hulls the Foundry arc runs. A part the player drafted and keeps in the hold is
// part of the build either way, so both count.
//
// SCOPE (v1)
// ----------
// Evolution offers are computed against the LIVE loadout and appended to the swarm armory's
// offer list — they are conditional on what the build holds, never on the seed, so they do not
// belong to the seeded draw inside offerDraft. They are swarm-only: the gauntlet's three-card
// draft grants a pick outright and has no wallet to charge, and "explicit conversion and cost"
// needs both. A gauntlet conversion is a different door and deliberately not this one.
//
// Pure data + one pure chooser. No bus, no state, no RNG — determinism comes from the caller's
// fittings, which are already run-deterministic.

import { MODULES } from './modules.js';
import { fits, outfitBudgetForFittings } from '../systems/ships.js';

export const SURVIVAL_EVOLUTION_SCHEMA_VERSION = 1;
export const EVOLUTION_OFFER_KIND = 'evolution';

function freezeDeep(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    for (const item of value) freezeDeep(item);
  } else {
    for (const key of Object.keys(value)) freezeDeep(value[key]);
  }
  return Object.freeze(value);
}

const MODULE_DEF_BY_ID = new Map(MODULES.map((def) => [def.id, def]));

/**
 * The named syntheses. `consumes` lists the defIds the conversion removes from the run — every
 * entry must be a real module in src/data/modules.js, and the result must fit a slot at least as
 * small as the smallest consumed part, so a build that could hold the parts can land the product.
 */
export const SURVIVAL_EVOLUTIONS = freezeDeep([
  {
    id: 'storm_carom',
    defId: 'mod_storm_carom',
    name: 'Storm Carom',
    verb: 'Evolve',
    consumes: ['mod_bank_shot', 'mod_relay_arc', 'mod_ion_payload'],
    // Priced like the tier-3 armory row — roughly two trait picks. The conversion itself is the
    // bigger payment: three held parts for one slot.
    price: 48,
    blurb: 'Banked shots storm through conductive hulls. The pack kills itself.',
  },
  {
    id: 'long_gravity',
    defId: 'mod_gravity_bumper_s_mk2',
    name: 'Gravity Bumper S Mk2',
    verb: 'Evolve',
    consumes: ['mod_gravity_bumper_s', 'mod_ram_plate'],
    price: 42,
    blurb: 'The short bumper and the ram plate become one longer gravity burst. The separate ram is gone.',
  },
  {
    id: 'long_lance',
    defId: 'mod_fire_lance_s_mk2',
    name: 'Fire Lance S Mk2',
    verb: 'Evolve',
    consumes: ['mod_fire_lance_s', 'mod_incendiary_payload'],
    price: 46,
    blurb: 'The burn payload and the short lance become one longer lance. Shots no longer set their own fires.',
  },
  {
    id: 'long_grip',
    defId: 'mod_grip_bumper_s_mk2',
    name: 'Grip Bumper S Mk2',
    verb: 'Evolve',
    consumes: ['mod_grip_bumper_s', 'mod_winch_hd'],
    price: 44,
    blurb: 'The heavy winch and the short catch become one longer grip. The faster reel is spent.',
  },
  {
    id: 'kicked_charges',
    defId: 'mod_charge_vector_rack',
    name: 'Vector Charge Rack',
    verb: 'Evolve',
    consumes: ['mod_charge_rack', 'mod_decoy_buoy_s'],
    price: 40,
    blurb: 'Thrown charges and the decoy buoy become charges you can kick behind you.',
  },
  {
    id: 'forked_volley',
    defId: 'mod_forked_core',
    name: 'Forked Core',
    verb: 'Evolve',
    consumes: ['mod_twin_mount', 'mod_herald_fan'],
    price: 36,
    blurb: 'The extra bolt and the wide fan become one split on the first hit. The loose volley is gone.',
  },
  {
    id: 'multi_latch',
    defId: 'mod_line_head_multi_latch',
    name: 'Multi-Latch Head',
    verb: 'Evolve',
    consumes: ['mod_line_head_coupler', 'mod_line_head_magnet'],
    price: 28,
    blurb: 'The coupler and the magnet become one head that holds more than one line. The two heads are spent.',
  },
  {
    id: 'twin_bridle',
    defId: 'mod_twin_bridle_m',
    name: 'Twin Bridle M',
    verb: 'Evolve',
    consumes: ['mod_monofilament_sweep_m', 'mod_transverse_snare_m'],
    price: 44,
    blurb: 'The sweep and the snare become one bridle. The two separate lines are spent.',
  },
  {
    id: 'fusion_drive',
    defId: 'mod_engine_fusion_m',
    name: 'Fusion Drive M',
    verb: 'Evolve',
    consumes: ['mod_engine_sprint_m', 'mod_engine_endurance_m'],
    price: 52,
    blurb: 'The sprint drive and the endurance drive become one fusion drive. You stop carrying both.',
  },
  {
    id: 'point_defense',
    defId: 'mod_pds_servo_s',
    name: 'Point Defense Servo S',
    verb: 'Evolve',
    consumes: ['mod_heat_lure_s', 'mod_thermal_sink_s'],
    price: 32,
    blurb: 'The heat lure and the sink become one point-defense servo. The two loose fittings are spent.',
  },
]);

const EVOLUTION_BY_ID = new Map(SURVIVAL_EVOLUTIONS.map((evo) => [evo.id, evo]));

export function survivalEvolutionById(id) {
  return EVOLUTION_BY_ID.get(id) || null;
}

/** Every defId any synthesis can consume or produce, for validators and tests. */
export const SURVIVAL_EVOLUTION_DEF_IDS = Object.freeze(
  SURVIVAL_EVOLUTIONS.flatMap((evo) => [evo.defId, ...evo.consumes]),
);

/**
 * The synthesis offers a build can currently take, in offer shape — the same rows the draft
 * surface, the purchase path and the availability map all read. An offer exists only when every
 * consumed part is held (fitted or in the run inventory) and the result has somewhere to land:
 * the first empty compatible slot, else a slot a fitted part is about to vacate. Returns [] when
 * nothing qualifies — the absence IS the offer state, not an error.
 */
export function evolutionOffersFor({ hullId, slots, fittings, moduleInventory } = {}) {
  const held = new Set();
  for (const defId of Array.isArray(fittings) ? fittings : []) {
    if (typeof defId === 'string' && defId) held.add(defId);
  }
  for (const item of Array.isArray(moduleInventory) ? moduleInventory : []) {
    if (item && typeof item.defId === 'string' && item.defId) held.add(item.defId);
  }
  const offers = [];
  const slotList = Array.isArray(slots) ? slots : [];
  const fitted = Array.isArray(fittings) ? fittings : [];
  for (const evo of SURVIVAL_EVOLUTIONS) {
    if (held.has(evo.defId)) continue; // already synthesized — the parts are gone with it
    if (evo.consumes.some((defId) => !held.has(defId))) continue;
    const resultDef = MODULE_DEF_BY_ID.get(evo.defId);
    if (!resultDef) continue;
    let slotIndex = -1;
    for (let i = 0; i < slotList.length; i++) {
      if (!fitted[i] && fits(slotList[i], resultDef)) { slotIndex = i; break; }
    }
    if (slotIndex < 0) {
      // No empty landing spot: the first slot a consumed part occupies is about to be freed by
      // the conversion itself, so the result can land where its parts stood.
      slotIndex = fitted.findIndex((defId) => evo.consumes.includes(defId));
      if (slotIndex < 0 || !fits(slotList[slotIndex], resultDef)) continue;
    }
    // The outfit budget sees the build AFTER conversion — consumed parts that were mounted are
    // already gone, so the check never charges the result for slots it is about to inherit.
    const prospective = fitted.slice();
    for (const defId of evo.consumes) {
      const at = prospective.indexOf(defId);
      if (at >= 0) prospective[at] = null;
    }
    prospective[slotIndex] = evo.defId;
    const budget = outfitBudgetForFittings(hullId, prospective);
    if (budget && !budget.fits) continue;
    offers.push({
      id: `evo_${evo.id}`,
      defId: evo.defId,
      name: evo.name,
      verb: evo.verb,
      blurb: evo.blurb,
      kind: EVOLUTION_OFFER_KIND,
      shape: null,
      consumes: evo.consumes.slice(),
      price: evo.price,
      slotIndex,
      replaces: null,
    });
  }
  return offers;
}
