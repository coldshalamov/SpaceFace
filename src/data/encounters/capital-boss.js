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

function capitalEncounter({ id, placeName, twist, hullLabel, hull, mass, radius, maxSpeed, archetype, slagLabel }) {
  return Object.freeze({
    id,
    shape: Object.freeze({
      situation: 'set_piece',
      place: 'patrol_corridor',
      twist: 'named',
      actor: archetype,
    }),
    placeName,
    twist,
    subsystemRoles: CAPITAL_BOSS_SUBSYSTEM_ROLES,
    actors: freezeActors([
      {
        role: 'capital_hull',
        kind: 'ship',
        scanLabel: hullLabel,
        count: 1,
        archetype,
        hostile: true,
        hull,
        shield: 0,
        armor: 0,
        mass,
        radius,
        maxSpeed,
        shipClass: 'capital',
      },
      {
        role: 'throw_mass',
        kind: 'asteroid',
        scanLabel: slagLabel,
        count: 1,
        radius: 14,
        mass: 180,
        hull: 80,
        tetherable: true,
      },
    ]),
  });
}

export const CAPITAL_BOSS_ENCOUNTER = capitalEncounter({
  id: CAPITAL_BOSS_ENCOUNTER_ID,
  placeName: 'Coalition capital lane',
  twist: 'The heavy has no immunity phase. Mass is the fast way. Guns are the slow way.',
  hullLabel: 'CAPITAL HULK',
  hull: 96,
  mass: 420,
  radius: 28,
  maxSpeed: 72,
  archetype: 'bruiser_brawler',
  slagLabel: 'SLAG SHOT',
});

export const CAPITAL_BOSS_TOLLMAN_ENCOUNTER_ID = 'capital_boss_tollman';
export const CAPITAL_BOSS_ALA_ENCOUNTER_ID = 'capital_boss_ala';

export const CAPITAL_BOSS_TOLLMAN_ENCOUNTER = capitalEncounter({
  id: CAPITAL_BOSS_TOLLMAN_ENCOUNTER_ID,
  placeName: 'Sker toll corridor',
  twist: 'The Tollman has no immunity. Put mass through the PD screen, or shoot the long way.',
  hullLabel: 'THE TOLLMAN',
  hull: 110,
  mass: 480,
  radius: 30,
  maxSpeed: 64,
  archetype: 'pd_screen_escort',
  slagLabel: 'TOLL SLAG',
});

export const CAPITAL_BOSS_ALA_ENCOUNTER = capitalEncounter({
  id: CAPITAL_BOSS_ALA_ENCOUNTER_ID,
  placeName: 'Ashfall capital grave',
  twist: 'ALA has no phase table. Throw the mass. Guns are slower.',
  hullLabel: 'ALA DREADNOUGHT',
  hull: 128,
  mass: 560,
  radius: 34,
  maxSpeed: 58,
  archetype: 'bruiser_brawler',
  slagLabel: 'GRAVE SLAG',
});

export const CAPITAL_BOSS_ENCOUNTERS = Object.freeze({
  [CAPITAL_BOSS_ENCOUNTER_ID]: CAPITAL_BOSS_ENCOUNTER,
  [CAPITAL_BOSS_TOLLMAN_ENCOUNTER_ID]: CAPITAL_BOSS_TOLLMAN_ENCOUNTER,
  [CAPITAL_BOSS_ALA_ENCOUNTER_ID]: CAPITAL_BOSS_ALA_ENCOUNTER,
});

export function capitalBossEncounter(id = CAPITAL_BOSS_ENCOUNTER_ID) {
  return CAPITAL_BOSS_ENCOUNTERS[id] || CAPITAL_BOSS_ENCOUNTER;
}

export default CAPITAL_BOSS_ENCOUNTER;
