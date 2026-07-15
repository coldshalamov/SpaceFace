// BP-13/B9 Pirate doctrine data.
//
// These records parameterize later pirate systems without creating a new AI FSM.
// Unknown legacy doctrines return null so existing scavenger/balanced/official
// encounters do not silently become parley pirates.

const DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'toll',
    label: 'Toll Collector',
    demandType: 'tithe',
    targetPreference: 'liquid-value',
    barkSituation: 'demand-cargo',
    contactWord: 'TOLL',
    scanReadout: 'Toll collector: likely to scan, demand a tithe, then break off if paid.',
    startsParley: true,
    cargoStrategy: 'tithe-or-credits',
    complianceOutcome: 'break-off',
    parleyMode: 'toll',
  }),
  Object.freeze({
    id: 'thief',
    label: 'Cargo Thief',
    demandType: 'none',
    targetPreference: 'cargo-value',
    barkSituation: 'attack',
    contactWord: 'THIEF',
    scanReadout: 'Cargo thief: skips the demand window and goes straight for valuable cargo.',
    startsParley: false,
    cargoStrategy: 'grab-cargo',
    complianceOutcome: 'none',
    parleyMode: 'raid',
    disguised: true,
  }),
  Object.freeze({
    id: 'salvage-jackal',
    label: 'Salvage Jackal',
    demandType: 'salvage-claim',
    targetPreference: 'wreck-salvage',
    barkSituation: 'warn',
    contactWord: 'JACKAL',
    scanReadout: 'Salvage jackal: wants the wreck, the black box, and the loose parts.',
    startsParley: true,
    cargoStrategy: 'mark-wreck',
    complianceOutcome: 'leave-wreck',
    parleyMode: 'claim',
  }),
  Object.freeze({
    id: 'tech-raider',
    label: 'Tech Raider',
    demandType: 'module-ransom',
    targetPreference: 'reactor-tech',
    barkSituation: 'demand-cargo',
    contactWord: 'TECH RAIDER',
    scanReadout: 'Tech raider: hunts modules, reactor parts, and high-value ship tech.',
    startsParley: true,
    cargoStrategy: 'strip-modules',
    complianceOutcome: 'break-off',
    parleyMode: 'ransom',
  }),
  Object.freeze({
    id: 'ideological',
    label: 'Ideological Raider',
    demandType: 'oath-or-departure',
    targetPreference: 'faction-symbol',
    barkSituation: 'taunt',
    contactWord: 'ZEALOT',
    scanReadout: 'Ideological raider: targets flags, uniforms, and symbolic enemies.',
    startsParley: false,
    cargoStrategy: 'terrorize',
    complianceOutcome: 'none',
    parleyMode: 'attack',
  }),
]);

// Depth Program S3 Reach cultures. These are combat-facing profiles, not additional B9 parley
// doctrines: keeping a separate roster preserves the five-doctrine demand/scan contract while the
// live SG-06 adapters consume each culture's complete factionPresenceDoctrine.
const REACH_CULTURE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'maw',
    label: 'The Maw',
    combatReadout: 'Reaver blades commit hard in a wedge, slash through, and break before the hull folds.',
    factionPresenceDoctrine: Object.freeze({
      pursuitCommitment: 0.88,
      preferredRange: 285,
      liveFormation: 'wedge',
      retreatHullFraction: 0.27,
      combatDoctrineId: 'interceptor_flyby',
      disableThenRun: false,
      firstFire: true,
      firstFireAgainst: Object.freeze([]),
      firstFireCondition: null,
      stationDefenseAggression: 0.82,
      disableChance: 0.12,
      destroyTarget: true,
      fixedRoute: false,
    }),
  }),
  Object.freeze({
    id: 'rust-lords',
    label: 'The Rust-Lords',
    combatReadout: 'Jury-rigged line crews hold volume, foul drives with tethers, and make the scrap field theirs.',
    factionPresenceDoctrine: Object.freeze({
      pursuitCommitment: 0.64,
      preferredRange: 360,
      liveFormation: 'line',
      retreatHullFraction: 0.49,
      combatDoctrineId: 'tether_control_raider',
      disableThenRun: false,
      firstFire: true,
      firstFireAgainst: Object.freeze([]),
      firstFireCondition: null,
      stationDefenseAggression: 0.72,
      disableChance: 0.58,
      destroyTarget: true,
      fixedRoute: false,
    }),
  }),
  Object.freeze({
    id: 'drift-kings',
    label: 'The Drift-Kings',
    combatReadout: 'Masked corsairs work a long ring, pick the cleanest firing lane, and disengage on their own terms.',
    factionPresenceDoctrine: Object.freeze({
      pursuitCommitment: 0.46,
      preferredRange: 455,
      liveFormation: 'ring',
      retreatHullFraction: 0.38,
      combatDoctrineId: 'ranged_disengager',
      disableThenRun: false,
      firstFire: false,
      firstFireAgainst: Object.freeze([]),
      firstFireCondition: null,
      stationDefenseAggression: 0.54,
      disableChance: 0.08,
      destroyTarget: true,
      fixedRoute: false,
    }),
  }),
]);

export const PIRATE_DOCTRINE_IDS = Object.freeze(DEFINITIONS.map((d) => d.id));
export const PIRATE_DOCTRINES = Object.freeze(Object.fromEntries(DEFINITIONS.map((d) => [d.id, d])));
export const REACH_CULTURE_IDS = Object.freeze(REACH_CULTURE_DEFINITIONS.map((culture) => culture.id));
export const REACH_CULTURE_DOCTRINES = Object.freeze(Object.fromEntries(
  REACH_CULTURE_DEFINITIONS.map((culture) => [culture.id, culture]),
));

export function isPirateDoctrine(id) {
  return !!pirateDoctrineById(id);
}

export function pirateDoctrineById(id) {
  if (id == null) return null;
  return PIRATE_DOCTRINES[String(id)] || null;
}

export function reachCultureDoctrineById(id) {
  if (id == null) return null;
  return REACH_CULTURE_DOCTRINES[String(id)] || null;
}

export function pirateDoctrineForEntity(entity) {
  if (typeof entity === 'string') return pirateDoctrineById(entity);
  const data = entity && entity.data || null;
  const ai = data && data.ai || entity && entity.ai || null;
  return pirateDoctrineById(
    ai && ai.doctrine ||
    data && data.pirateDoctrine ||
    entity && entity.doctrine ||
    null,
  );
}

export function pirateDoctrineReadout(entityOrId) {
  const doctrine = pirateDoctrineForEntity(entityOrId);
  if (!doctrine) return null;
  return {
    doctrineId: doctrine.id,
    label: doctrine.label,
    demandType: doctrine.demandType,
    targetPreference: doctrine.targetPreference,
    barkSituation: doctrine.barkSituation,
    contactWord: doctrine.contactWord,
    scanReadout: doctrine.scanReadout,
    startsParley: doctrine.startsParley,
  };
}

export function pirateParleyPlanForEntity(entityOrId) {
  const doctrine = pirateDoctrineForEntity(entityOrId);
  if (!doctrine) return null;
  const barkSequence = doctrine.startsParley
    ? ['scan', doctrine.barkSituation, 'attack']
    : doctrine.barkSituation === 'attack'
      ? ['scan', 'attack']
      : ['scan', doctrine.barkSituation, 'attack'];
  return {
    doctrineId: doctrine.id,
    startsParley: doctrine.startsParley,
    parleyMode: doctrine.parleyMode,
    demandType: doctrine.demandType,
    targetPreference: doctrine.targetPreference,
    barkSequence,
    cargoStrategy: doctrine.cargoStrategy,
    complianceOutcome: doctrine.complianceOutcome,
  };
}
