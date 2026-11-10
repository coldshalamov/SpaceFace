// Row 448 GOLD-COLOSSI — the one read of "is the player's line hauling on this plate, and how
// hard". Pure: no state writes, no allocation. The fight owner's tear check and the overlay's
// PLATE/HOLD read both call it, so the readout never disagrees with the rope.
//
// WHY NOT tether.tensionEstimate: that field is load against the line's BREAK rating, and the
// standard Massline is rated ~10.5M so it never snaps in ordinary play. Measured with
// scripts/probe-tether-visual-drive.mjs (--mass=420, full main burn opposing the line, 240 ticks):
// it peaks at ~5e-4 unboosted and ~1.6e-3 boosted on the starter hulls — authored holdTension
// 0.75..0.85 could never be reached. The raw line force (attachment.lastTension) at the same full
// burn is ~4200 (ship_wasp), ~3100 (ship_bulwark), ~3000 (ship_mule); boosted 5000..9300.
// holdTension is therefore a fraction of a starter hull's full-burn pull on a capital.
export const CAPITAL_PLATE_FULL_PULL = 3000;

/** The line's haul on the boss as a fraction of a starter hull's full-burn pull. */
export function capitalPlatePull(attachment) {
  const force = Number(attachment && attachment.lastTension);
  return Number.isFinite(force) && force > 0 ? force / CAPITAL_PLATE_FULL_PULL : 0;
}

// WHY NOT the latch contact point: a dynamic ship is roped at its centre of mass
// (tetherGameplay towAnchorAtCenterOfMass — a hull-offset anchor would torque it), so
// attachment.targetAnchorLocal on a capital is always {0,0} and lies inside no plate. The line
// hauls on the side of the hull that faces the pilot holding it: a plate is under the line when
// the pilot's bearing in the boss's frame falls inside the plate's angular footprint
// (atan2(plate radius, anchor distance)). Same local space as SUBSYSTEM_DEFS volumes.
export function capitalPlateUnderLine(plateSpec, boss, owner) {
  if (!plateSpec || !plateSpec.anchor || !boss || !boss.pos || !owner || !owner.pos) return false;
  const br = Math.max(1, Number(boss.radius) || 20);
  const ax = Number(plateSpec.anchor.x) * br;
  const az = Number(plateSpec.anchor.z) * br;
  const aLen = Math.hypot(ax, az);
  if (!(aLen > 1e-6)) return true; // a centred plate sits under every pull
  const dx = Number(owner.pos.x) - Number(boss.pos.x);
  const dz = Number(owner.pos.z) - Number(boss.pos.z);
  const rot = -(Number(boss.rot) || 0);
  const c = Math.cos(rot), s = Math.sin(rot);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  const lLen = Math.hypot(lx, lz);
  if (!(lLen > 1e-6)) return false;
  const cos = (lx * ax + lz * az) / (lLen * aLen);
  const halfWidth = Math.atan2(Math.max(0, Number(plateSpec.radius) || 0), aLen);
  return cos >= Math.cos(halfWidth);
}
