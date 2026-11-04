// The dying tell (inf-dying-drive): a failing hull's drive gutters.
//
// The plume already names the maneuver (drive-mode heat) and the faction in its sheath;
// what it could not say was how close the ship is to death, because no hull truth reached
// it. The sim already owns e.hull / e.hullMax — the same fields the smoke trail reads — so
// the drive now reads them too: below the fail band the bell cools toward ember and, when
// critical, sputters on its own deterministic phase. Pure decision layer; the pool applies
// it per slot, tests pin it directly.

/** Hull fraction below which the drive starts to gutter. */
export const DRIVE_HULL_FAIL_FRAC = 0.4;
/** Hull fraction below which the bell is dying and sputters hard. */
export const DRIVE_HULL_CRITICAL_FRAC = 0.12;

/** Frozen no-op answer for an intact or unknown hull — shareable, never allocated. */
export const DRIVE_DYING_INTACT = Object.freeze({
  fail: 0, cool: 0, sputter: 0, dim: 1, turbulenceAdd: 0,
});

/**
 * Pure resolver. `hullFrac` is the hull the sim owns (0..1, unknown reads intact);
 * `sputterPhase` advances with sim dt on the ship record; `entityPhase` is the entity's
 * static offset so a crowd does not sputter in unison. The same inputs always answer the
 * same way — no ambient randomness.
 */
export function resolveDyingDrive(hullFrac, sputterPhase = 0, entityPhase = 0) {
  const frac = Number.isFinite(hullFrac) ? Math.max(0, Math.min(1, hullFrac)) : 1;
  if (frac >= DRIVE_HULL_FAIL_FRAC) return DRIVE_DYING_INTACT;
  const fail = (DRIVE_HULL_FAIL_FRAC - frac) / DRIVE_HULL_FAIL_FRAC;
  const critical = frac < DRIVE_HULL_CRITICAL_FRAC;
  // A wounded bell misses beats: deterministic sputter on the ship's own phase.
  const beat = Math.max(0, Math.sin((Number(sputterPhase) || 0) * 13 + (Number(entityPhase) || 0) * 6.283));
  const sputter = critical ? beat * 0.55 + 0.2 : beat * 0.18;
  const cool = fail * (critical ? 0.85 : 0.5);
  // Ember lean: green and blue collapse harder than red, so the bell reads burnt, not gray.
  const dim = Math.max(0.15, 1 - cool * 0.72 - sputter * 0.55);
  return {
    fail, cool, sputter, dim,
    turbulenceAdd: fail * 0.8,
  };
}

/**
 * Apply one dying answer to one plume slot (plain object with color[3] and turbulence —
 * the same slot shape the drive-mode heat pass writes). Red falls last: the picture cools
 * toward ember instead of toward flat gray.
 */
export function applyDyingDriveToSlot(slot, dying) {
  if (!slot || !dying || !(dying.fail > 0)) return;
  const d = dying.dim;
  slot.color[0] *= Math.min(1, d * 1.35);
  slot.color[1] *= Math.max(0.08, d);
  slot.color[2] *= Math.max(0.04, d * 0.8);
  slot.turbulence = (slot.turbulence || 0) + dying.turbulenceAdd;
}
