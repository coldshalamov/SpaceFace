// Weak points (BP-02 combat ceiling — "scanning weak-point reward loop").
//
// Large hulls expose a subsystem arc that takes bonus damage when a shot lands inside it. This turns
// scanning from an info dump into tactics: the scan reveals WHERE the soft spot is, and flanking to
// hit that arc is rewarded. Everything here is PURE + DETERMINISTIC + DATA-DRIVEN:
//   * which classes have a weak point — a small table (contract 7: classes without an entry behave
//     identically, no weak point, no bonus);
//   * where the arc is — a fixed offset from the hull's facing (no per-entity state, no RNG);
//   * whether a hit is in the arc — pure geometry.
// The bonus application (combat.js) and the scan reveal (scanner.js → HUD) BOTH gate on the
// `combat.weakPoints` feature flag, so the deterministic 47-A golden sim never sees any of this.

// arcCenter is an angle OFFSET from the ship's facing (rot): 0 = nose, ±PI = tail. Most weak points
// are the drive/reactor exposed at the REAR, rewarding the classic "flank the big ship" play.
const REAR = Math.PI;

export const WEAK_POINTS_BY_CLASS = Object.freeze({
  freighter:     { label: 'DRIVE COIL',    arcCenter: REAR, arcHalfWidth: 0.95, bonusMult: 1.6,  hint: 'REAR' },
  heavy_hauler:  { label: 'DRIVE COIL',    arcCenter: REAR, arcHalfWidth: 1.00, bonusMult: 1.6,  hint: 'REAR' },
  mining_barge:  { label: 'ORE PROCESSOR', arcCenter: REAR, arcHalfWidth: 0.90, bonusMult: 1.5,  hint: 'REAR' },
  battlecruiser: { label: 'REACTOR VENT',  arcCenter: REAR, arcHalfWidth: 0.75, bonusMult: 1.5,  hint: 'REAR' },
  flagship:      { label: 'REACTOR VENT',  arcCenter: REAR, arcHalfWidth: 0.60, bonusMult: 1.45, hint: 'REAR' },
  capital:       { label: 'REACTOR VENT',  arcCenter: REAR, arcHalfWidth: 0.70, bonusMult: 1.5,  hint: 'REAR' },
  gunship:       { label: 'AMMO MAGAZINE', arcCenter: REAR, arcHalfWidth: 0.70, bonusMult: 1.5,  hint: 'REAR' },
});

function wrapAngle(a) {
  a = a % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  else if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/** Weak-point spec for a live ship/drone by its class (data.shipClass || role), or null. Pure.
 *  An entity may author its own arc (`data.weakPoint`) — a boss's readable seam differs from the
 *  class default: the Iron Maw exposes a PROW RIB, so crossing its bow is the rewarded flank. */
export function weakPointForEntity(e) {
  if (!e || (e.type !== 'ship' && e.type !== 'drone')) return null;
  const authored = e.data && e.data.weakPoint;
  if (authored && typeof authored === 'object' && Number.isFinite(authored.arcCenter)) {
    // FB-020: a window may author the turret-loss edge it opens on — the Iron Maw's PROW RIB is
    // only exposed once the edge-2 effects tear the bow plate (`data._turretEdge`, written by
    // the tacticalAI edge applicator).
    if (Number.isFinite(authored.opensAtTurretEdge)
      && !((e.data._turretEdge | 0) >= authored.opensAtTurretEdge)) return null;
    return authored;
  }
  const cls = (e.data && (e.data.shipClass || e.data.class)) || e.role || '';
  return WEAK_POINTS_BY_CLASS[cls] || null;
}

/** True if `hitPos` lands inside the target's weak-point arc (relative to its facing). Pure geometry. */
export function isHitInWeakArc(target, hitPos, wp) {
  if (!target || !target.pos || !hitPos || !wp) return false;
  const dx = hitPos.x - target.pos.x, dz = hitPos.z - target.pos.z;
  if (dx * dx + dz * dz < 1e-6) return false;
  const hitAng = Math.atan2(dz, dx);
  const rel = wrapAngle(hitAng - (target.rot || 0));   // hit bearing in the hull's local frame
  return Math.abs(wrapAngle(rel - wp.arcCenter)) <= wp.arcHalfWidth;
}
