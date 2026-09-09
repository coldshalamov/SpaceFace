// PQ-152.01 — authored set-piece encounters. Not a director module (unnumbered), so the
// ambient catalog and import graph stay untouched. Missions imports this for actors/place.

import { AUTHORED_SET_PIECES } from '../missions.js';

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
});

export function authoredSetPieceEncounter(id) {
  return AUTHORED_SET_PIECE_ENCOUNTERS[id] || null;
}

for (const row of AUTHORED_SET_PIECES) {
  const encounter = AUTHORED_SET_PIECE_ENCOUNTERS[row.id];
  if (!encounter) {
    throw new Error(`PQ-152.01 missing encounter for ${row.id}`);
  }
  if (encounter.id !== row.encounterId) {
    throw new Error(`PQ-152.01 encounter id mismatch for ${row.id}`);
  }
}

export default AUTHORED_SET_PIECE_ENCOUNTERS;
