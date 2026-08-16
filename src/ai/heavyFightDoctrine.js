// Plan 14 heavy-fight shaping for the live SG-06 doctrine stack.
//
// This module owns no velocity, collision, health, or weapon writes. It only turns the immutable
// heavy identity visible in a sensor frame into deterministic phase/lane decisions. Maneuver,
// Flight V3, Rapier, and combat remain the physical authorities downstream.

export const HeavyFightKind = Object.freeze({
  TURRET_BOAT: 'turret_boat',
  COMMITTED_RAM: 'committed_ram',
});

export const HEAVY_RAM_SPOOL_TICKS = 30;
export const HEAVY_RAM_APPROACH_WU = 440;
export const HEAVY_RAM_OVERSHOOT_WU = 260;
export const HEAVY_RAM_LANE_EXTENSION_WU = 760;
export const HEAVY_RAM_COMMIT_MAX_TICKS = 600;
export const HEAVY_RAM_RECOVER_TICKS = 90;

export function heavyFightKind(self) {
  const authored = self && self.heavyFightShape;
  const capability = String(authored && authored.capability || '');
  if (authored?.runtime !== 'combat_doctrine') return null;
  if (capability === HeavyFightKind.TURRET_BOAT && self.combatRoleId === 'heavy_gunship') {
    return HeavyFightKind.TURRET_BOAT;
  }
  if (capability === HeavyFightKind.COMMITTED_RAM && self.combatRoleId === 'heavy_ramscoop'
    && authored.ramPlateAvailable === true && self.ramAuthorized === true) {
    return HeavyFightKind.COMMITTED_RAM;
  }
  return null;
}

export function heavyFlightProfile(self, fallback) {
  const kind = heavyFightKind(self);
  return kind ? `heavy_${kind}` : fallback;
}

export function initialHeavyFightPhase(flightProfile) {
  if (flightProfile === 'heavy_turret_boat') return 'turret_pressure';
  if (flightProfile === 'heavy_committed_ram') return 'ram_approach';
  return null;
}

/** Mutate the doctrine's private transient record and return true when this is a heavy profile. */
export function updateHeavyFight(record, tick, self, target, distance, enter) {
  if (record.flightProfile === 'heavy_turret_boat') {
    if (record.phase !== 'turret_pressure') enter(record, 'turret_pressure', tick, null);
    record.fireWindow = true;
    record.flightPoint = null;
    record.committedCollisionCourse = false;
    return true;
  }
  if (record.flightProfile !== 'heavy_committed_ram') return false;

  const age = tick - record.phaseStartedTick;
  record.fireWindow = false;
  if (record.phase === 'ram_approach' && distance <= HEAVY_RAM_APPROACH_WU) {
    enter(record, 'ram_spool', tick, 'ram_burn');
  } else if (record.phase === 'ram_spool' && age >= HEAVY_RAM_SPOOL_TICKS) {
    lockRamLane(record, self, target);
    enter(record, 'ram_commit', tick, null);
  } else if (record.phase === 'ram_commit') {
    const passed = ramLaneDistance(record, self) >= record.ramLane.targetDistance + HEAVY_RAM_OVERSHOOT_WU;
    if (passed || age >= HEAVY_RAM_COMMIT_MAX_TICKS) {
      record.outcome = passed ? 'ram_overshot_locked_target' : 'ram_commit_expired';
      enter(record, 'ram_recover', tick, null);
    }
  } else if (record.phase === 'ram_recover' && age >= HEAVY_RAM_RECOVER_TICKS) {
    record.ramLane = null;
    record.flightPoint = null;
    record.committedCollisionCourse = false;
    record.cycle++;
    enter(record, 'ram_approach', tick, null);
  }
  record.committedCollisionCourse = record.phase === 'ram_commit';
  return true;
}

function lockRamLane(record, self, target) {
  const sx = finite(self && self.pos && self.pos.x);
  const sz = finite(self && self.pos && self.pos.z);
  const tx = finite(target && target.pos && target.pos.x, sx + Math.cos(finite(self && self.rot)));
  const tz = finite(target && target.pos && target.pos.z, sz + Math.sin(finite(self && self.rot)));
  const dx = tx - sx;
  const dz = tz - sz;
  const targetDistance = Math.hypot(dx, dz);
  const fallbackX = Math.cos(finite(self && self.rot));
  const fallbackZ = Math.sin(finite(self && self.rot));
  const dirX = targetDistance > 1 ? dx / targetDistance : fallbackX;
  const dirZ = targetDistance > 1 ? dz / targetDistance : fallbackZ;
  record.ramLane = { originX: sx, originZ: sz, dirX, dirZ, targetDistance };
  record.flightPoint = Object.freeze({
    x: sx + dirX * (targetDistance + HEAVY_RAM_LANE_EXTENSION_WU),
    z: sz + dirZ * (targetDistance + HEAVY_RAM_LANE_EXTENSION_WU),
  });
}

function ramLaneDistance(record, self) {
  const lane = record.ramLane;
  if (!lane) return 0;
  const dx = finite(self && self.pos && self.pos.x) - lane.originX;
  const dz = finite(self && self.pos && self.pos.z) - lane.originZ;
  return dx * lane.dirX + dz * lane.dirZ;
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}
