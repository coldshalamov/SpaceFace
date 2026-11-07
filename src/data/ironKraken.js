// One body, eight animated arms. Shared dimensions keep the hit volume, score and render rig
// on the same authored scale; arms are attack geometry, never eight hidden physics chains.
export const IRON_KRAKEN_HEAVY_ID = 'enemy_iron_kraken';
export const IRON_KRAKEN_COLOSSUS_ID = 'enemy_iron_kraken_colossus';

export const IRON_KRAKEN_PROFILES = Object.freeze({
  heavy: Object.freeze({
    variant: 'heavy', enemyId: IRON_KRAKEN_HEAVY_ID, scoreId: 'capital_boss_iron_kraken',
    name: 'Iron Kraken', scale: 1, coreRadius: 28, armReach: 98,
    mass: 240, hull: 280, armor: 24, armorFlat: 1,
    maxSpeed: 120, accel: 155, turnRate: 0.85, spawnDistance: 260,
    jetLength: 210, coreDamageMultiplier: 1.8,
  }),
  colossus: Object.freeze({
    variant: 'colossus', enemyId: IRON_KRAKEN_COLOSSUS_ID, scoreId: 'capital_boss_iron_kraken_colossus',
    name: 'Iron Kraken Colossus', scale: 1.85, coreRadius: 51.8, armReach: 181.3,
    mass: 900, hull: 720, armor: 54, armorFlat: 2,
    maxSpeed: 110, accel: 105, turnRate: 0.48, spawnDistance: 380,
    jetLength: 360, coreDamageMultiplier: 1.8,
  }),
});

export function ironKrakenProfileFor(entityOrId) {
  const id = typeof entityOrId === 'string' ? entityOrId
    : entityOrId?.data?.lootTableId || entityOrId?.data?.enemyTypeId;
  if (id === IRON_KRAKEN_HEAVY_ID) return IRON_KRAKEN_PROFILES.heavy;
  if (id === IRON_KRAKEN_COLOSSUS_ID) return IRON_KRAKEN_PROFILES.colossus;
  return null;
}

export const IRON_KRAKEN_ENEMIES = Object.freeze(Object.values(IRON_KRAKEN_PROFILES).map(p => Object.freeze({
  id: p.enemyId, name: p.name, shipId: 'ship_bastion', silhouette: 'iron_kraken',
  factionId: 'faction_reach', aiArchetype: 'miniboss_capital', combatDoctrineId: 'capital_broadside',
  levelRange: [1, 1], hull: p.hull, armor: p.armor, armorFlat: p.armorFlat,
  shield: 0, shieldRegen: 0, cap: 100, capRegen: 1,
  maxSpeed: p.maxSpeed, accel: p.accel, turnRate: p.turnRate,
  collisionRadius: p.coreRadius, mass: p.mass, weapons: [],
  aiDoctrine: { defaultActivity: 'reposition', roe: 'weapons_free', preferredRange: p.armReach * 1.2, leashRadius: 2400 },
  // The always-on class rear weak point must not masquerade as the timed front aperture.
  weakPoint: { label: 'MANTLE CORE', arcCenter: 0, arcHalfWidth: 0.8, bonusMult: 1,
    hint: 'The front aperture opens after each attack. Put a direct shot into the red core.' },
  physicalClass: 'specialist', shipClass: 'capital', rareSpecialist: true,
  telegraph: { bark: 'warn', cue: 'broadside_charge',
    line: 'Eight arms, one bad temper. Cross the locked jet lane; hit the open front core after it vents.' },
  counterHint: 'Dodge the marked arms and locked jet. Fire into the open front core during recovery for 1.8× damage.',
  behavior: 'recurring mechanical octopus: flank rake, committed siphon jet, gapped ink ring, exposed front-core recovery',
  bountyCr: p.variant === 'colossus' ? 900 : 360,
  loot: { creditsRange: p.variant === 'colossus' ? [160, 240] : [65, 100], drops: [] },
})));

/** Spawn-time construction only. The normal helm and canonical physics owner fly this body. */
export function applyIronKrakenSpawnSpec(spec, enemyId) {
  const p = ironKrakenProfileFor(enemyId);
  if (!p) return spec;
  const body = { schemaVersion: 1, dynamic: true, mass: p.mass,
    inertiaY: 0.4 * p.mass * p.coreRadius ** 2, radius: p.coreRadius,
    revision: 0, ccd: true, material: 'ship', shape: 'ball' };
  spec.physicsBody = body;
  spec.mass = p.mass;
  spec.radius = p.coreRadius;
  spec.visualRadius = p.armReach;
  spec.data.ironKraken = { variant: p.variant, scale: p.scale, fightId: null };
  // An empty authored weapon list otherwise inherits the backing Bastion's stock cannons.
  spec.data.weapons = [];
  spec.data.fittings = [];
  const flight = base => ({ ...base, flightClass: 'hauler', mass: body.mass, inertia: body.inertiaY,
    mainAccel: p.accel, reverseAccel: p.accel * 0.6, strafeAccel: p.accel * 0.3,
    maxSpeed: p.maxSpeed, maxYawRate: p.turnRate, angularAccel: p.turnRate * 2,
    angularBrake: p.turnRate * 3, normalMaxSpeedMult: 1, boostMult: 1, boostMaxSpeedMult: 1 });
  spec.flightModel = flight(spec.flightModel);
  if (spec.data.derived) spec.data.derived.flightModel = flight(spec.data.derived.flightModel);
  // Flight V3 resolves propulsion before the legacy flightModel. Author the real field
  // drive as well, or the giant silently flies the backing Bastion's fast fighter helm.
  const propulsion = Object.freeze({ ...spec.propulsion,
    label: 'Kraken Siphon Drive', designMass: p.mass, massLoadFactor: 1,
    maxSpeed: p.maxSpeed, combatSpeed: p.maxSpeed, boostMaxSpeed: p.maxSpeed,
    travelCeiling: p.maxSpeed, maxAccel: p.accel, maxBrakeAccel: p.accel * 0.8,
    maxYawRate: p.turnRate, yawAccel: p.turnRate * 2, yawBrake: p.turnRate * 3 });
  spec.propulsion = propulsion;
  spec.combatSpeed = p.maxSpeed;
  if (spec.data.derived) spec.data.derived.propulsion = propulsion;
  return spec;
}

// A scheduled character slot, never a weighted reinforcement pick. Specialist/boss/act rooms
// are filtered by the planner; replacing one fodder slot preserves the ordinary round quota.
export function ironKrakenForSwarmWave(wave) {
  if (!Number.isSafeInteger(wave) || wave < 7 || (wave - 7) % 6 !== 0) return null;
  return wave >= 31 && (wave - 31) % 24 === 0
    ? IRON_KRAKEN_PROFILES.colossus : IRON_KRAKEN_PROFILES.heavy;
}
