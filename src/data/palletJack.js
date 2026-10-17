import { COMMODITIES } from './commodities.js';

export const PALLET_JACK = Object.freeze({ actorId: 'pallet_jack', enemyId: 'pallet_jack',
  encounterId: 'pallet_jack_intro', owner: 'palletJack', assetId: 'SF_SHIP_PALLET_JACK',
  sectors: ['sector_ceres_belt', 'sector_tethys_junction'], targetTicks: 36, grabTicks: 48,
  dropTicks: 21, grabRange: 12, grabSpeed: 15, forkHalfWidth: 5, forkMinX: 2, forkMaxX: 12,
  cargoRadiusMax: 4, cargoMassMax: 180, cargoValueMin: 60, searchRadius: 700,
  hailRange: 420, contestForce: 1600, contestTicks: 12, requestSeconds: 5, encounterSeconds: 300, maxRecords: 1,
});
export const PALLET_JACK_ENEMY = Object.freeze({ id: PALLET_JACK.enemyId, name: 'Pallet Jack',
  shipId: 'ship_hawser', silhouette: 'pallet_jack', factionId: 'faction_reach',
  aiArchetype: 'pirate', combatDoctrineId: 'brawler_commit', levelRange: [2, 4],
  hull: 160, armor: 12, armorFlat: 1, shield: 0, shieldRegen: 0, cap: 100, capRegen: 0,
  collisionRadius: 20, mass: 100, maxSpeed: 55, accel: 24, turnRate: .8,
  combatProfileId: 'combat_profile_pallet_jack', weapons: [], rareSpecialist: true,
  physicalClass: 'specialist', shipClass: 'freighter', bountyCr: 180,
  aiDoctrine: { defaultActivity: 'reposition', roe: 'defensive', preferredRange: 100, leashRadius: 14000 },
  telegraph: { bark: 'warn', line: 'Pallet Jack is reaching for loose freight. Move the load or break its front clamp.', cue: 'attach_spool' },
  counterHint: 'After your hold, not your hull — break its fork lock or outrun the clamp.',
  behavior: 'one finite cargo-first theft; physical fork capture, contested load, parley and same-body escape',
  loot: { creditsRange: [35, 70], drops: [] },
});
const prices = new Map(COMMODITIES.map(c => [c.id, c.basePrice || 0]));
export function palletJackCargoValue(entity) {
  const d = entity?.data || {};
  if (d.salvagePool && Object.keys(d.salvagePool).length)
    return Object.entries(d.salvagePool).reduce((n, [id, amount]) => n + (prices.get(id) || 0) * Math.max(0, Number(amount) || 0), 0);
  return (prices.get(d.commodityId) || 0) * Math.max(0, Number(d.amount) || 0);
}
// Ordinary physical cargo only. Foreign source/custody/mission owners retain their decision.
export function palletJackCargoEligible(e, now = 0, adopted = false) {
  const d = e?.data || {}, f = e?.flags || {};
  if (!e?.alive || !['pickup', 'payload'].includes(e.type) || e.physicsBody === false
    || e.physicsBody?.dynamic === false || !(e.mass > 0) || e.mass > PALLET_JACK.cargoMassMax
    || !(e.radius > 0) || e.radius > PALLET_JACK.cargoRadiusMax || e.collides === false
    || !Number.isFinite(e.pos?.x) || !Number.isFinite(e.pos?.z)) return false;
  if (f.missionPinned || d.missionPinned || d.missionId || d.missionTag || d.contractId || d.questItem
    || d.missionTargetSlot != null || d.wreckMissionId || d.worldRecordSlotId || d.worldRecordId
    || d.worldSiteId || d.worldSitePayloadId || d.heistFacilityRole || d.freightCustodyPod
    || d.freightCustody || d.cargoManifest?.protected || d.cargoManifest?.reservedBy
    || d.salvageSourceKey || d.salvorClaimedBy || (d.persistenceOwner && (!adopted || d.persistenceOwner !== PALLET_JACK.owner))) return false;
  if (!adopted && (d.anchored || d.masslineLatched || d.latched || d.tethered
    || d.pickupEmbargoUntil > now || (Number.isFinite(d.despawnAt) && d.despawnAt <= now))) return false;
  const value = palletJackCargoValue(e);
  return Number.isFinite(value) && value >= PALLET_JACK.cargoValueMin;
}
export function palletJackFlightModel(body, base = {}) {
  return { ...base, flightClass: 'hauler', mass: body.mass, inertia: body.inertiaY,
    mainAccel: 24, reverseAccel: 30, strafeAccel: 9, maxSpeed: 55,
    maxYawRate: .8, angularAccel: 2.4, angularBrake: 4,
    normalMaxSpeedMult: 1, boostMult: 1, boostMaxSpeedMult: 1 };
}
export function palletJackLocalPoint(e, p) {
  const c = Math.cos(e.rot || 0), s = Math.sin(e.rot || 0);
  return { x: e.pos.x + p.x * c - p.z * s, z: e.pos.z + p.x * s + p.z * c };
}
export function palletJackForkContains(actor, cargo) {
  const c = Math.cos(actor.rot || 0), s = Math.sin(actor.rot || 0);
  const dx = cargo.pos.x - actor.pos.x, dz = cargo.pos.z - actor.pos.z, r = cargo.radius;
  const x = dx * c + dz * s, z = -dx * s + dz * c;
  return x - r >= PALLET_JACK.forkMinX && x + r <= PALLET_JACK.forkMaxX
    && Math.abs(z) + r <= PALLET_JACK.forkHalfWidth;
}
