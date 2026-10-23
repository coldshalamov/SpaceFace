// TOWJAW is an optional salvage-field predator. These are encounter-local limits,
// not changes to the game's ship, weapon, power, or economy balance.
const freezeRows = rows => Object.freeze(rows.map(row => Object.freeze(row)));

export const TOWJAW_SLOTS = freezeRows([
  { x: 47, z: 6, mechanism: 'jaw' },
  { x: 0, z: -47, mechanism: 'winch' },
  { x: -47, z: 0, mechanism: 'drive' },
  { x: 44, z: -15, mechanism: 'jaw' },
  { x: -14, z: -47, mechanism: 'winch' },
  { x: -45, z: 16, mechanism: 'drive' },
]);

export const TOWJAW_MECHANISMS = Object.freeze({
  jaw: Object.freeze({ x: 31, z: 4, attack: 'grapple', label: 'Jaw hinge', radius: 3.5, hull: 60 }),
  winch: Object.freeze({ x: 0, z: -31, attack: 'shotgun', label: 'Feed winch', radius: 3.5, hull: 70 }),
  drive: Object.freeze({ x: -31, z: 0, attack: 'ram', label: 'Drive clutch', radius: 3.5, hull: 65 }),
});

export const TOWJAW_ATTACKS = Object.freeze({
  grapple: Object.freeze({ mechanism: 'jaw', telegraphS: 1.65, activeS: 1.15, recoveryS: 2.8,
    inner: 15, outer: 112, halfAngle: 0.95, damage: 15, impulseDeltaV: 12 }),
  shotgun: Object.freeze({ mechanism: 'winch', telegraphS: 1.85, activeS: 2.5, recoveryS: 3.4,
    inner: 32, outer: 250, halfAngle: 0.34, scrapSpeed: 100, maxScrap: 3 }),
  ram: Object.freeze({ mechanism: 'drive', telegraphS: 2.25, activeS: 3.2, recoveryS: 4.2,
    length: 230, radius: 27, speed: 100, damage: 24, impulseDeltaV: 18 }),
});

export const TOWJAW = Object.freeze({
  id: 'pro_five_towjaw', schemaVersion: 1,
  name: 'TOWJAW', bossShipId: 'ship_hawser', sectorId: 'sector_vesta_forge',
  minArmor: 3, maxArmor: 6, maxDebris: 24, maxTracked: 32,
  maxCommands: 48, maxEvents: 24, maxStepS: 0.1,
  approachS: 2.5, scavengeS: 11, denyS: 4, exposedS: 4, recoverS: 2.5,
  reelS: 8, latchDistance: 6.5, latchSpeed: 22, latchS: 0.18,
  releaseDistance: 21, releaseHoldS: 0.12, reelRange: 230,
  spring: 4.2, damping: 3.8, reelAcceleration: 34, holdAcceleration: 48,
  bossAcceleration: 15, bossCruiseSpeed: 25, bossBrake: 1.8,
  maxForce: 30000, maxImpulse: 20000, maxTurnRate: 0.6,
  leashRadius: 780, disengageRange: 650, disengageS: 8,
  maxDurationS: 240, starvationLimit: 3, retreatS: 5,
  thrownScrapMinSpeed: 22, thrownScrapDamageScale: 0.45, thrownScrapMaxDamage: 80,
});

export const TOWJAW_CATALOG = Object.freeze({
  id: TOWJAW.id,
  title: 'TOWJAW — The Borrowed Hull',
  sectorId: TOWJAW.sectorId,
  modelId: TOWJAW.bossShipId,
  mechanisms: TOWJAW_MECHANISMS,
  attacks: TOWJAW_ATTACKS,
  armorSlots: TOWJAW_SLOTS,
  limits: TOWJAW,
});
