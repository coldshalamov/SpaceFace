// Mule LOD0 points sampled against rendered hull/armor triangles, asset coordinates.
// These are surface samples, not model sockets. The layout consumes no RNG.
const BASE = Object.freeze([
  [-2.75, 1.000, 1.45], [-2.75, 1.040, 1.75],
  [-2.35, 1.000, 1.45], [-2.35, 1.040, 1.75],
  [-1.35, 1.000, 1.45], [-1.35, 1.040, 1.75],
  [-0.35, 1.000, 1.45], [-0.35, 1.040, 1.75],
  [1.25, 1.000, 1.45], [1.25, 1.040, 1.75],
  [2.25, 1.000, 1.45], [2.25, 1.021, 1.75],
]);
const BLOOM = Object.freeze([
  [-2.75, 1.040, 2.05], [-2.35, 1.040, 2.05],
  [-1.75, 1.040, 2.05], [-1.35, 1.040, 2.05],
  [-0.35, 1.040, 2.05], [1.25, 1.040, 2.05],
  [2.25, 1.021, 2.05], [2.65, 1.021, 2.05],
]);
const AMBIENT = Object.freeze([
  [-1.75, 1.000, 1.45], [-1.75, 1.100, 1.75],
  [0.25, 1.000, 1.45], [0.25, 1.100, 1.75],
  [2.65, 1.000, 1.45], [2.65, 1.021, 1.75],
]);
const SLOTS = Object.freeze({ base: BASE, bloom: BLOOM, ambient: AMBIENT });

/**
 * Map existing ecology rows to the admitted Mule wreck, without drawing RNG.
 * host: {pos:{x,z}, rot, radius, pitch?, bank?}; datum: {center:[x,y,z], envelope}.
 * Coordinates in pos are the caller's frame (global or sector-local), not mixed.
 * Output height is relative to the flight plane; the caller must present it.
 * Renderer fit: position=-center*fit, scale=2*radius/envelope, then yaw=-rot.
 * The packaged hull child also rotates X=bank and Z=pitch in Three's XYZ order.
 * A missing/terminal host must be supplied as null. Rows are never created here.
 */
export function mapWarmFreighterGrowth(rows, host, datum, band = 'base') {
  const slots = SLOTS[band];
  const c = datum?.center;
  if (!Array.isArray(rows) || !rows.every(row => row && typeof row === 'object')
      || !slots || rows.length > slots.length || !host
      || !Number.isFinite(host.pos?.x) || !Number.isFinite(host.pos?.z)
      || !Number.isFinite(host.rot) || !Number.isFinite(host.radius) || host.radius <= 0
      || !Array.isArray(c) || c.length !== 3 || !c.every(Number.isFinite)
      || !Number.isFinite(datum.envelope) || datum.envelope <= 0
      || (host.pitch != null && !Number.isFinite(host.pitch))
      || (host.bank != null && !Number.isFinite(host.bank))) return [];
  const fit = 2 * host.radius / datum.envelope;
  const yawC = Math.cos(host.rot), yawS = Math.sin(host.rot);
  const pitchC = Math.cos(host.pitch || 0), pitchS = Math.sin(host.pitch || 0);
  const bankC = Math.cos(host.bank || 0), bankS = Math.sin(host.bank || 0);
  return rows.map((row, index) => {
    const [x, y, z] = slots[index];
    // Child rotation occurs before its recentering translation (Euler XYZ: Z then X).
    const px = pitchC * x - pitchS * y;
    const py = pitchS * x + pitchC * y;
    const bx = fit * (px - c[0]);
    const by = fit * (bankC * py - bankS * z - c[1]);
    const bz = fit * (bankS * py + bankC * z - c[2]);
    const localRot = Number.isFinite(row.rot) ? row.rot : 0;
    const size = Number.isFinite(row.scale) ? Math.max(0.5, Math.min(1.6, row.scale)) : 1;
    return {
      ...row,
      pos: { x: host.pos.x + yawC * bx - yawS * bz, z: host.pos.z + yawS * bx + yawC * bz },
      height: by,
      rot: host.rot + localRot,
      // Existing procedural growth uses data.scale * 10 as its radius.
      scale: fit * 0.045 * size,
    };
  });
}
