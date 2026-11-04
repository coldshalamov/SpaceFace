// Scar direction (inf-scar-skid).
//
// Every lasting hull scar used to be the same round splat regardless of how the shot arrived: a
// railgun slug raking across a hull at a shallow angle left the same mark as a dead-center
// strike, so the picture could not say WHICH SIDE got hit or HOW. The transient discharge fan
// already slants with the incoming path (presenter `_spawnImpactSurface`); the lasting mark did
// not. Now the lasting scar carries the incoming shot's surface-projected direction as a skid
// axis: a grazing hit stretches the mark downrange into a gouge that points where the shot was
// travelling, a head-on strike keeps the round blast seat, and everything between lands on a
// continuous scale.
//
// Pure decision layer: no THREE, no pools, no clock, no rng. The presenter resolves the skid at
// capture from the impact payload's own normal + approach (the same truth the discharge fan
// uses), stores it hull-local so it turns with the hull, and the pool's shader builds the card
// frame from it. Degenerate geometry (zero vectors, head-on, NaN) fails closed to the exact
// legacy mark: no skid, no stretch.
//
// Approach convention: `payload.approach` points INTO the surface (≈ −normal for a head-on
// hit), so a grazing hit's skid points downrange — the way the shot was travelling.

/** A pure graze stretches the mark to at most this multiple of the authored round size. */
export const SCAR_SKID_STRETCH_MAX = 2.2;
/** |normal · approach| at or above this reads head-on: the mark stays round. */
export const SCAR_SKID_HEAD_ON_DOT = 0.985;

/**
 * Resolve one strike's skid axis and stretch from the impact's outward normal and approach.
 * Pure; writes caller-owned `out`: { skidX, skidY, skidZ, stretch, grazing }.
 *   skidX/Y/Z  unit skid axis in the same frame as the inputs (world at capture, hull-local
 *              once rotated downstream); all zeros when the mark is round
 *   stretch    1 (head-on) .. 1 + SCAR_SKID_STRETCH_MAX (pure graze) — multiplies the mark's
 *              width along the skid axis
 *   grazing    0..1 raw graze factor for diagnostics and tuning
 */
export function resolveScarSkid(nx, ny, nz, ax, ay, az, out = {}) {
  out.skidX = 0; out.skidY = 0; out.skidZ = 0;
  out.stretch = 1;
  out.grazing = 0;
  const nl = Math.hypot(nx, ny, nz);
  const al = Math.hypot(ax, ay, az);
  if (!(nl > 1e-6) || !(al > 1e-6)) return out;
  const ix = nx / nl, iy = ny / nl, iz = nz / nl;
  const jx = ax / al, jy = ay / al, jz = az / al;
  const dot = ix * jx + iy * jy + iz * jz;
  const grazing = 1 - Math.min(1, Math.abs(dot));
  out.grazing = grazing;
  if (Math.abs(dot) >= SCAR_SKID_HEAD_ON_DOT) return out;
  const px = jx - ix * dot, py = jy - iy * dot, pz = jz - iz * dot;
  const pl = Math.hypot(px, py, pz);
  if (!(pl > 1e-4)) return out;
  out.skidX = px / pl;
  out.skidY = py / pl;
  out.skidZ = pz / pl;
  out.stretch = 1 + SCAR_SKID_STRETCH_MAX * Math.pow(grazing, 1.4);
  return out;
}

/**
 * The spawn-scoped mark size for a resolved skid: the authored round size stretched ALONG the
 * skid axis only (the card's width axis; the shader aligns the frame), height untouched.
 */
export function scarSkidSize(width, height, stretch, out = {}) {
  const s = Number.isFinite(stretch) && stretch > 1 ? Math.min(stretch, 1 + SCAR_SKID_STRETCH_MAX) : 1;
  out.width = (Number.isFinite(width) ? width : 1.6) * s;
  out.height = Number.isFinite(height) ? height : 1.1;
  return out;
}
