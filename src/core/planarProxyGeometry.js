// The solver is constrained to XZ, but Rapier computes contacts in 3D. A shallow
// prism permits a roof normal along locked Y. Give each projected convex piece a
// roof farther away than its enclosing planar radius, plus the contact envelope.
// XZ coordinates/decomposition and zero-density authored mass stay unchanged.
export function planarProxyPrismHalfHeight(verts, scale) {
  let minX = Infinity; let maxX = -Infinity;
  let minZ = Infinity; let maxZ = -Infinity;
  let coordinateScale = 0;
  for (const v of verts) {
    const x = Math.fround(v.x * scale); const z = Math.fround(v.z * scale);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    coordinateScale = Math.max(coordinateScale, Math.abs(x), Math.abs(z));
  }
  const cx = (minX + maxX) * 0.5; const cz = (minZ + maxZ) * 0.5;
  let reach = 0;
  for (const v of verts) {
    reach = Math.max(reach, Math.hypot(Math.fround(v.x * scale) - cx, Math.fround(v.z * scale) - cz));
  }
  // Predictive-contact distance and allowed penetration do not inflate shapes.
  // Adding those absolute world distances here destroys similarity at tiny scales.
  // Keep only a relative f32 margin for vertex conversion/support arithmetic and
  // local offsets. The roof lies strictly beyond the projected enclosing radius.
  const roundoff = 32 * (2 ** -23) * Math.max(coordinateScale, reach);
  return reach + roundoff;
}


export function planarProxyObbHalfHeight(hx, hz) {
  return planarProxyPrismHalfHeight([{x:-hx,z:-hz},{x:hx,z:hz}],1);
}
