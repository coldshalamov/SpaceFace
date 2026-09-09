// PQ-152.02 — capital boss encounter. Unnumbered so the director catalog stays put.
// Thrusters / turrets / bays reuse live combat subsystems: drive / weapon / tether_spool.

export const CAPITAL_BOSS_ENCOUNTER_ID = 'capital_boss_hulk';

export const CAPITAL_BOSS_SUBSYSTEM_ROLES = Object.freeze({
  thrusters: 'subsystem_drive',
  turrets: 'subsystem_weapon',
  bays: 'subsystem_tether_spool',
});

function freezeActors(actors) {
  return Object.freeze(actors.map((actor) => Object.freeze({ ...actor })));
}

export const CAPITAL_BOSS_ENCOUNTER = Object.freeze({
  id: CAPITAL_BOSS_ENCOUNTER_ID,
  shape: Object.freeze({
    situation: 'set_piece',
    place: 'patrol_corridor',
    twist: 'named',
    actor: 'bruiser_brawler',
  }),
  placeName: 'Coalition capital lane',
  twist: 'The heavy has no immunity phase. Mass is the fast way. Guns are the slow way.',
  subsystemRoles: CAPITAL_BOSS_SUBSYSTEM_ROLES,
  actors: freezeActors([
    {
      role: 'capital_hull',
      kind: 'ship',
      scanLabel: 'CAPITAL HULK',
      count: 1,
      archetype: 'bruiser_brawler',
      hostile: true,
      hull: 96,
      shield: 0,
      armor: 0,
      mass: 420,
      radius: 28,
      maxSpeed: 72,
      shipClass: 'capital',
    },
    {
      role: 'throw_mass',
      kind: 'asteroid',
      scanLabel: 'SLAG SHOT',
      count: 1,
      radius: 14,
      mass: 180,
      hull: 80,
      tetherable: true,
    },
  ]),
});

export function capitalBossEncounter() {
  return CAPITAL_BOSS_ENCOUNTER;
}

export default CAPITAL_BOSS_ENCOUNTER;
