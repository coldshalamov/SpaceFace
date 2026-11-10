// XZ geometry for Spectrum measurements. Bearings use the scanner convention
// (atan2(dx, -dz), degrees clockwise from -Z) so a Spectrum ray and a scanner
// anomaly ray name the same direction.

export function bearingDeg(from, to) {
  const dx = (Number(to && to.x) || 0) - (Number(from && from.x) || 0);
  const dz = (Number(to && to.z) || 0) - (Number(from && from.z) || 0);
  return (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
}

export function dirFromBearing(deg) {
  const th = (Number(deg) || 0) * Math.PI / 180;
  return { x: Math.sin(th), z: -Math.cos(th) };
}

export function bearingFromDir(dir) {
  return (Math.atan2(dir.x, -dir.z) * 180 / Math.PI + 360) % 360;
}

export function pointAlong(origin, deg, distance) {
  const dir = dirFromBearing(deg);
  return {
    x: origin.x + dir.x * distance,
    z: origin.z + dir.z * distance,
  };
}

export function dist2(a, b) {
  const dx = (a.x || 0) - (b.x || 0);
  const dz = (a.z || 0) - (b.z || 0);
  return Math.hypot(dx, dz);
}

export function wrapDeg(delta) {
  const raw = Math.abs(Number(delta) || 0) % 360;
  return Math.min(raw, 360 - raw);
}

export function segmentHitsCircle(ax, az, bx, bz, cx, cz, radius) {
  const r = Number(radius) || 0;
  if (r <= 0) return false;
  const abx = bx - ax;
  const abz = bz - az;
  const acx = cx - ax;
  const acz = cz - az;
  const ab2 = abx * abx + abz * abz;
  if (ab2 < 1e-8) return acx * acx + acz * acz <= r * r;
  let t = (acx * abx + acz * abz) / ab2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const dx = ax + abx * t - cx;
  const dz = az + abz * t - cz;
  return dx * dx + dz * dz <= r * r;
}

export function lineFrame(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  return {
    ax: a.x,
    az: a.z,
    ux: dx / len,
    uz: dz / len,
    nx: -dz / len,
    nz: dx / len,
    len,
  };
}

export function reflectPoint(point, a, b) {
  const frame = lineFrame(a, b);
  const vx = point.x - frame.ax;
  const vz = point.z - frame.az;
  const along = vx * frame.ux + vz * frame.uz;
  const across = vx * frame.nx + vz * frame.nz;
  return {
    x: frame.ax + frame.ux * along - frame.nx * across,
    z: frame.az + frame.uz * along - frame.nz * across,
  };
}

export function reflectVector(vector, a, b) {
  const frame = lineFrame(a, b);
  const along = vector.x * frame.ux + vector.z * frame.uz;
  const across = vector.x * frame.nx + vector.z * frame.nz;
  return {
    x: frame.ux * along - frame.nx * across,
    z: frame.uz * along - frame.nz * across,
  };
}

// Bounce of observer→image on the finite mirror. Null when the hit misses the segment.
export function bounceOnSegment(observer, image, a, b) {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const ab2 = abx * abx + abz * abz;
  if (ab2 < 1e-8) return null;
  const ox = image.x - observer.x;
  const oz = image.z - observer.z;
  const denom = ox * abz - oz * abx;
  if (Math.abs(denom) < 1e-8) return null;
  const t = ((a.x - observer.x) * abz - (a.z - observer.z) * abx) / denom;
  if (t < 0 || t > 1) return null;
  const hitX = observer.x + ox * t;
  const hitZ = observer.z + oz * t;
  const s = ((hitX - a.x) * abx + (hitZ - a.z) * abz) / ab2;
  if (s < -0.02 || s > 1.02) return null;
  return { x: hitX, z: hitZ, s };
}

// Fold a heard echo into a bearing from the reflected observer. Charted mirrors
// only: the wall is visible, the source is not. Residual at the true source is
// ~0 when the heard bearing was the specular image.
export function foldEcho(observer, apparentBearingDeg, a, b) {
  const reflectedObserver = reflectPoint(observer, a, b);
  const reflectedDir = reflectVector(dirFromBearing(apparentBearingDeg), a, b);
  return {
    origin: reflectedObserver,
    bearingDeg: bearingFromDir(reflectedDir),
  };
}

export function segmentBlocked(from, to, occluders, ignoreId) {
  for (let i = 0; i < occluders.length; i++) {
    const occ = occluders[i];
    if (!occ || occ.id === ignoreId) continue;
    if (segmentHitsCircle(from.x, from.z, to.x, to.z, occ.x, occ.z, occ.r)) return occ.id;
  }
  return null;
}
