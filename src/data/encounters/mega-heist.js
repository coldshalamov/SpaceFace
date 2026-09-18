// PQ-170.02 — two post-ending mega-heists. Unnumbered so the director catalog stays put.
// Missions imports these actors the same way it imports authored set-piece encounters.

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

export const MEGA_HEIST_ENCOUNTERS = Object.freeze({
  mega_heist_tessera_core: piece('mega_heist_tessera_core', {
    shape: {
      situation: 'set_piece',
      place: 'derelict_field',
      twist: 'named',
      actor: 'faction_scn',
    },
    placeName: 'Ashfall archive barge',
    twist: 'The 47-A routing core is clamped in the barge bay. Yank the hatch or smash it with slag.',
    actors: [
      {
        role: 'vault_hatch', kind: 'wreck', scanLabel: 'ARCHIVE BAY HATCH',
        count: 1, radius: 11, mass: 64, hull: 90, tetherable: true,
      },
      {
        role: 'throw_mass', kind: 'asteroid', scanLabel: 'SLAG SHOT',
        count: 1, radius: 13, mass: 160, hull: 80, tetherable: true,
      },
    ],
  }),
  mega_heist_choir_reliquary: piece('mega_heist_choir_reliquary', {
    shape: {
      situation: 'set_piece',
      place: 'outlaw_zone',
      twist: 'named',
      actor: 'faction_choir',
    },
    placeName: 'Veil Pattern procession',
    twist: 'The reliquary spins on clamps. Yank it free or bowl iron through the pins.',
    actors: [
      {
        role: 'vault_hatch', kind: 'wreck', scanLabel: 'PATTERN RELIQUARY',
        count: 1, radius: 10, mass: 52, hull: 84, tetherable: true,
      },
      {
        role: 'throw_mass', kind: 'asteroid', scanLabel: 'BOWL IRON',
        count: 1, radius: 12, mass: 140, hull: 80, tetherable: true,
      },
    ],
  }),
});

export function megaHeistEncounterById(id) {
  return MEGA_HEIST_ENCOUNTERS[id] || null;
}

export default MEGA_HEIST_ENCOUNTERS;
