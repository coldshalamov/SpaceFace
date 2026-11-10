// src/data/encounters/shape.js — encounter grammar shape vocabularies and validation.
// Four-axis grammar: situation × place × twist × actor.

export const SITUATION_VOCABULARY = Object.freeze([
  'toll',
  'ambush',
  'patrol',
  'hunt',
  'distress',
  'salvage',
  'trade',
  'convoy',
  'claim',
  'anomaly',
  'wreck',
  'yard',
  'archive',
  'escort',
  'puzzle',
  'wake',
  'follow_on',
  'set_piece',
]);

export const PLACE_VOCABULARY = Object.freeze([
  'civilian_core',
  'trade_lane',
  'patrol_corridor',
  'border_checkpoint',
  'refinery_approach',
  'mining_belt',
  'colony',
  'derelict_field',
  'outlaw_zone',
  'radiation_field',
  'nebula_fog',
  'ambush_lane',
  'anomaly_deep',
  'planetary_mass',
]);

export const TWIST_VOCABULARY = Object.freeze([
  'none',
  'named',
  'unique_wreck',
  'k1',
  'depth',
  'follow_on',
  'player_echo',
  'logic',
  'literalized',
  'admirers',
]);

export const ACTOR_VOCABULARY = Object.freeze([
  // Factions
  'faction_reach',
  'faction_scn',
  'faction_quiet',
  'faction_mts',
  'faction_vael',
  'faction_choir',
  'faction_understory',
  'faction_fulfillment',
  'faction_archive',
  'faction_pitborn',
  'faction_verge_layers',
  'faction_free',
  'faction_dmc',
  'faction_helix',
  // Archetypes
  'reaver_pirate',
  'corsair_raider',
  'wasp_swarmer',
  'patrol_lawman',
  'mule_trader',
  'bruiser_brawler',
  'lancer_sniper',
  'mine_layer_jackal',
  'pd_screen_escort',
  'customs_cutter',
  'quiet_ghost',
  'choir_zealot',
  'field_anchor_controller',
  'tether_control_raider',
  // Ambient / uncrewed
  'none',
]);

const SITUATION_SET = new Set(SITUATION_VOCABULARY);
const PLACE_SET = new Set(PLACE_VOCABULARY);
const TWIST_SET = new Set(TWIST_VOCABULARY);
const ACTOR_SET = new Set(ACTOR_VOCABULARY);

export function validateEncounterShape(shape, encounterId = 'unknown') {
  if (!shape || typeof shape !== 'object' || Array.isArray(shape)) {
    throw new Error(`Encounter "${encounterId}" must declare a valid shape object.`);
  }

  const { situation, place, twist, actor } = shape;

  if (typeof situation !== 'string' || !SITUATION_SET.has(situation)) {
    throw new Error(
      `Encounter "${encounterId}" has invalid shape.situation: "${situation}". Allowed: ${SITUATION_VOCABULARY.join(', ')}`,
    );
  }

  if (typeof place === 'string') {
    if (!PLACE_SET.has(place)) {
      throw new Error(
        `Encounter "${encounterId}" has invalid shape.place: "${place}". Allowed: ${PLACE_VOCABULARY.join(', ')}`,
      );
    }
  } else if (Array.isArray(place)) {
    for (const p of place) {
      if (typeof p !== 'string' || !PLACE_SET.has(p)) {
        throw new Error(
          `Encounter "${encounterId}" has invalid place in shape.place array: "${p}". Allowed: ${PLACE_VOCABULARY.join(', ')}`,
        );
      }
    }
  } else {
    throw new Error(
      `Encounter "${encounterId}" shape.place must be a valid zoneType string or array of zoneTypes.`,
    );
  }

  if (typeof twist !== 'string' || !TWIST_SET.has(twist)) {
    throw new Error(
      `Encounter "${encounterId}" has invalid shape.twist: "${twist}". Allowed: ${TWIST_VOCABULARY.join(', ')}`,
    );
  }

  if (typeof actor !== 'string' || !ACTOR_SET.has(actor)) {
    throw new Error(
      `Encounter "${encounterId}" has invalid shape.actor: "${actor}". Allowed: ${ACTOR_VOCABULARY.join(', ')}`,
    );
  }

  return true;
}
