// Shared inactive VFX plans. Returning a frozen object avoids a per-entity allocation on the
// flight path when a ship is not tumbling / has no thrown-body trail.

export const INACTIVE_TUMBLE_VFX_PLAN = Object.freeze({
  active: false,
  thrash: 0,
  ribbon: 0,
  hullBlur: 0,
  spawnThrash: false,
  spawnRibbon: false,
  spawnHullBlur: false,
  thrashCadenceHz: 0,
});

export function tumbleVfxLooksActive(tumble, thrownTrail) {
  if (thrownTrail && thrownTrail.active) return true;
  if (!tumble) return false;
  if (tumble.recovering) return true;
  const mode = tumble.mode;
  return mode === 'tumbling' || mode === 'drifting';
}
