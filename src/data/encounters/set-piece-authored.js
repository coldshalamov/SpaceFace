// PQ-152.01 — authored set-piece encounters. Not a director module (unnumbered), so the
// ambient catalog and import graph stay untouched. Missions imports this for actors/place.

import { AUTHORED_SET_PIECES } from '../missions.js';
import { validateEncounterShape } from './shape.js';

function freezeActors(actors) {
  return Object.freeze(actors.map((actor) => Object.freeze({ ...actor })));
}

function piece(id, body) {
  return Object.freeze({
    id,
    shape: Object.freeze(body.shape),
    placeName: body.placeName,
    twist: body.twist,
    actors: freezeActors(body.actors),
  });
}

export const AUTHORED_SET_PIECE_ENCOUNTERS = Object.freeze({
  wrecking_ball: piece('set_piece_wrecking_ball', {
    shape: {
      situation: 'set_piece',
      place: 'refinery_approach',
      twist: 'named',
      actor: 'faction_dmc',
    },
    placeName: 'Forge dead tower',
    twist: 'The tower still holds a live feed belt — mass first, guns the slow way.',
    actors: [
      {
        role: 'demolition_tower', kind: 'wreck', scanLabel: 'DEAD TOWER',
        count: 1, radius: 26, mass: 180, hull: 160, tetherable: true,
      },
    ],
  }),
  pod_rescue: piece('set_piece_pod_rescue', {
    shape: {
      situation: 'set_piece',
      place: 'mining_belt',
      twist: 'named',
      actor: 'faction_dmc',
    },
    placeName: 'Belt hauler wreck',
    twist: 'Pods are fragile. The escorts want the line more than the hulls.',
    actors: [
      {
        role: 'life_pod', kind: 'wreck', scanLabel: 'LIFE POD',
        count: 2, radius: 7, mass: 10, hull: 36, tetherable: true,
      },
      {
        role: 'rescue_escort', kind: 'ship', scanLabel: 'RESCUE ESCORT',
        count: 2, archetype: 'wasp_swarmer', hostile: true,
      },
    ],
  }),
  long_tow: piece('set_piece_long_tow', {
    shape: {
      situation: 'set_piece',
      place: 'mining_belt',
      twist: 'named',
      actor: 'faction_dmc',
    },
    placeName: 'Ceres slag slalom',
    twist: 'The core pulls like a pendulum. Slack forfeits the premium.',
    actors: [
      {
        role: 'slag_core', kind: 'asteroid', scanLabel: 'SLAG CORE',
        count: 1, radius: 16, mass: 40, hull: 220, tetherable: true,
      },
    ],
  }),
  convoy_defence: piece('set_piece_convoy_defence', {
    shape: {
      situation: 'set_piece',
      place: 'trade_lane',
      twist: 'named',
      actor: 'reaver_pirate',
    },
    placeName: 'Tethys freight lane',
    twist: 'Raiders strip pods, they do not burn hulls first.',
    actors: [
      {
        role: 'cargo_pod', kind: 'wreck', scanLabel: 'STOLEN POD',
        count: 1, radius: 8, mass: 24, hull: 50, tetherable: true,
      },
      {
        role: 'convoy_raider', kind: 'ship', scanLabel: 'POD STRIPPER',
        count: 2, archetype: 'reaver_pirate', hostile: true,
      },
    ],
  }),
  station_door_jam: piece('set_piece_station_door_jam', {
    shape: {
      situation: 'set_piece',
      place: 'border_checkpoint',
      twist: 'named',
      actor: 'faction_scn',
    },
    placeName: 'Tethys docking ring',
    twist: 'A dead frigate can close the approach or break the wedge.',
    actors: [
      {
        role: 'jam_hulk', kind: 'wreck', scanLabel: 'DEAD FRIGATE',
        count: 1, radius: 22, mass: 160, hull: 140, tetherable: true,
      },
      {
        role: 'approach_wedge', kind: 'ship', scanLabel: 'PATROL WEDGE',
        count: 2, archetype: 'patrol_lawman', hostile: true,
      },
    ],
  }),
  impound_break: piece('set_piece_impound_break', {
    shape: {
      situation: 'set_piece',
      place: 'border_checkpoint',
      twist: 'named',
      actor: 'faction_quiet',
    },
    placeName: 'Concord lawful cradle',
    twist: 'The pound is a lock, not a cone. Reel it quiet or smash it.',
    actors: [
      {
        role: 'cradle_lock', kind: 'wreck', scanLabel: 'CRADLE LOCK',
        count: 1, radius: 10, mass: 70, hull: 90, tetherable: true,
      },
    ],
  }),
  ace_duel: piece('set_piece_ace_duel', {
    shape: {
      situation: 'set_piece',
      place: 'patrol_corridor',
      twist: 'named',
      actor: 'lancer_sniper',
    },
    placeName: 'Coalition lane',
    twist: 'The ace has no immunity phase. Mass is the fast way.',
    actors: [
      {
        role: 'ace_pilot', kind: 'ship', scanLabel: 'LANE ACE',
        count: 1, archetype: 'lancer_sniper', hostile: true, hull: 90,
      },
    ],
  }),
  reef_clearance: piece('set_piece_reef_clearance', {
    shape: {
      situation: 'set_piece',
      place: 'derelict_field',
      twist: 'named',
      actor: 'mine_layer_jackal',
    },
    placeName: 'Veil debris reef',
    twist: 'Bowl iron through the mines, or pull the line aside.',
    actors: [
      {
        role: 'reef_mine', kind: 'wreck', scanLabel: 'REEF MINE',
        count: 2, radius: 6, mass: 14, hull: 28, tetherable: true,
      },
      {
        role: 'bowl_mass', kind: 'asteroid', scanLabel: 'BOWL IRON',
        count: 1, radius: 12, mass: 36, hull: 80, tetherable: true,
      },
    ],
  }),
  loud_heist: piece('set_piece_loud_heist', {
    shape: {
      situation: 'set_piece',
      place: 'outlaw_zone',
      twist: 'named',
      actor: 'faction_quiet',
    },
    placeName: 'Quiet fence vault',
    twist: 'The hatch comes off the pins. Guns void the premium.',
    actors: [
      {
        role: 'vault_hatch', kind: 'wreck', scanLabel: 'VAULT HATCH',
        count: 1, radius: 9, mass: 48, hull: 80, tetherable: true,
      },
    ],
  }),
  heavy_tow: piece('set_piece_heavy_tow', {
    shape: {
      situation: 'set_piece',
      place: 'mining_belt',
      twist: 'named',
      actor: 'faction_dmc',
    },
    placeName: 'Ceres dead-weight berth',
    twist: 'Two hundred mass on the line. A winched hitch turns with you; a loose one pendulums.',
    actors: [
      {
        role: 'slag_core', kind: 'asteroid', scanLabel: 'DEAD-WEIGHT CORE',
        count: 1, radius: 24, mass: 200, hull: 420, tetherable: true,
      },
    ],
  }),
  ore_crusher: piece('set_piece_ore_crusher', {
    shape: {
      situation: 'set_piece',
      place: 'refinery_approach',
      twist: 'named',
      actor: 'faction_dmc',
    },
    placeName: 'Forge crusher deck',
    twist: 'Feed the jaws or cut the belt. Either way the charge moves.',
    actors: [
      {
        role: 'crusher_jaws', kind: 'wreck', scanLabel: 'CRUSHER JAWS',
        count: 1, radius: 18, mass: 220, hull: 200, tetherable: true,
      },
      {
        role: 'crusher_belt', kind: 'wreck', scanLabel: 'FEED BELT',
        count: 1, radius: 10, mass: 40, hull: 70, tetherable: true,
      },
    ],
  }),
  // ── Far-out pieces: one place of their own in each outer sector ──────────────────────────
  // Roles that carry a failure rule at the mission owner (slag_core: a destroyed core fails the
  // tow; life_pod: a lost pod fails the rescue) are reused by name; every other role is the
  // piece's own and is answered only by that piece's hooks.
  ore_barge_tow: piece('set_piece_ore_barge_tow', {
    shape: {
      situation: 'set_piece',
      place: 'outlaw_zone',
      twist: 'named',
      actor: 'faction_reach',
    },
    placeName: 'Sker bazaar shelf',
    twist: 'The barge drags like a sea anchor. The shelf lamps want a quiet hitch.',
    actors: [
      {
        role: 'slag_core', kind: 'wreck', scanLabel: 'ORE BARGE',
        count: 1, radius: 18, mass: 56, hull: 240, tetherable: true,
      },
      {
        role: 'barge_claimant', kind: 'ship', scanLabel: 'CLAIM CREW',
        count: 1, archetype: 'reaver_pirate', hostile: true,
      },
    ],
  }),
  skiff_tether_rescue: piece('set_piece_skiff_tether_rescue', {
    shape: {
      situation: 'set_piece',
      place: 'colony',
      twist: 'named',
      actor: 'faction_free',
    },
    placeName: 'Io homestead drift',
    twist: 'The skiff tumbles slow. Scavengers want the hull more than the crew.',
    actors: [
      {
        role: 'life_pod', kind: 'wreck', scanLabel: 'DRIFTING SKIFF',
        count: 1, radius: 11, mass: 30, hull: 70, tetherable: true,
      },
      {
        role: 'skiff_scavenger', kind: 'ship', scanLabel: 'SKIFF SCAVENGER',
        count: 1, archetype: 'wasp_swarmer', hostile: true,
      },
    ],
  }),
  deserter_throw: piece('set_piece_deserter_throw', {
    shape: {
      situation: 'set_piece',
      place: 'outlaw_zone',
      twist: 'named',
      actor: 'reaver_pirate',
    },
    placeName: 'Mercenary firing range',
    twist: 'The range has no cover and the deserter knows it. Mass ends it fast.',
    actors: [
      {
        role: 'range_deserter', kind: 'ship', scanLabel: 'RANGE DESERTER',
        count: 1, archetype: 'reaver_pirate', hostile: true, hull: 80,
      },
    ],
  }),
  refinery_hopper: piece('set_piece_refinery_hopper', {
    shape: {
      situation: 'set_piece',
      place: 'radiation_field',
      twist: 'named',
      actor: 'faction_dmc',
    },
    placeName: 'Expanse hopper deck',
    twist: 'The jaws run hot and the slurry sets fast. Feed them or cut the line.',
    actors: [
      {
        role: 'hopper_jaws', kind: 'wreck', scanLabel: 'HOPPER JAWS',
        count: 1, radius: 20, mass: 240, hull: 220, tetherable: true,
      },
      {
        role: 'slurry_feed', kind: 'wreck', scanLabel: 'SLURRY FEED',
        count: 1, radius: 10, mass: 44, hull: 70, tetherable: true,
      },
    ],
  }),
  toll_gate_ram: piece('set_piece_toll_gate_ram', {
    shape: {
      situation: 'set_piece',
      place: 'trade_lane',
      twist: 'named',
      actor: 'faction_mts',
    },
    placeName: 'Drift toll gate',
    twist: 'The gate rides a rail and the warden hates delay. Mass is the fast way through.',
    actors: [
      {
        role: 'toll_gate', kind: 'wreck', scanLabel: 'TOLL GATE',
        count: 1, radius: 22, mass: 140, hull: 150, tetherable: true,
      },
      {
        role: 'gate_warden', kind: 'ship', scanLabel: 'GATE WARDEN',
        count: 1, archetype: 'patrol_lawman', hostile: true,
      },
    ],
  }),
  liner_locker: piece('set_piece_liner_locker', {
    shape: {
      situation: 'set_piece',
      place: 'derelict_field',
      twist: 'named',
      actor: 'faction_vael',
    },
    placeName: 'Ashfall liner hold',
    twist: 'The hold is sealed and its plates still hold heat. Cold guns, steady line.',
    actors: [
      {
        role: 'liner_locker', kind: 'wreck', scanLabel: 'SEALED LOCKER',
        count: 1, radius: 9, mass: 64, hull: 90, tetherable: true,
      },
    ],
  }),
});

export function authoredSetPieceEncounter(id) {
  return AUTHORED_SET_PIECE_ENCOUNTERS[id] || null;
}

/**
 * The encounter half of the catalog check: every piece has its encounter, the encounter's shape
 * is in the grammar's vocabulary, the primary role and every role a method hook (or its clear
 * role) names is an actor the piece actually spawns.
 * Returns problem strings; empty means sound.
 */
export function validateAuthoredSetPieceEncounters(
  catalog = AUTHORED_SET_PIECES,
  encounters = AUTHORED_SET_PIECE_ENCOUNTERS,
) {
  const problems = [];
  for (const row of catalog) {
    const encounter = encounters[row.id];
    if (!encounter) {
      problems.push(`missing encounter for ${row.id}`);
      continue;
    }
    if (encounter.id !== row.encounterId) problems.push(`encounter id mismatch for ${row.id}`);
    try {
      validateEncounterShape(encounter.shape, encounter.id);
    } catch (error) {
      problems.push(error.message);
    }
    const roles = new Set(encounter.actors.map((actor) => actor.role));
    if (!roles.has(row.primaryRole)) problems.push(`${row.id} primary role ${row.primaryRole} is not spawned`);
    for (const [method, hook] of Object.entries(row.methodHooks)) {
      if (!roles.has(hook.role)) problems.push(`${row.id}/${method} hooks role ${hook.role} that is never spawned`);
      if (hook.clearRole && !roles.has(hook.clearRole)) {
        problems.push(`${row.id}/${method} clears role ${hook.clearRole} that is never spawned`);
      }
    }
    for (const actor of encounter.actors) {
      if (actor.kind === 'ship' && !actor.archetype) problems.push(`${row.id}/${actor.role} ship needs an archetype`);
    }
  }
  return problems;
}

{
  const problems = validateAuthoredSetPieceEncounters();
  if (problems.length) throw new Error(`PQ-152.01 ${problems.join('; ')}`);
}

export default AUTHORED_SET_PIECE_ENCOUNTERS;
