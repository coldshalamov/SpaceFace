/**
 * Equal-spacing history path sampler for thruster plasma.
 * Pure CPU: no THREE, no allocation after construction.
 * Live head is always the current nozzle; history holds older samples.
 */

export const PATH_SAMPLER_INTERPOLATION_CAP = 24;

/**
 * @param {number} capacity max retained samples including live head
 */
export function createPathSampler(capacity = 40) {
  const n = Math.max(4, capacity | 0);
  const xs = new Float32Array(n);
  const zs = new Float32Array(n);
  const rots = new Float32Array(n);
  let head = 0;
  let count = 0;
  let hasLive = false;
  let liveX = 0;
  let liveZ = 0;
  let liveRot = 0;
  let committedX = 0;
  let committedZ = 0;
  let committedRot = 0;
  let ownerIdentity = null;
  let sampleElapsed = 0;

  function clear() {
    head = 0;
    count = 0;
    hasLive = false;
    ownerIdentity = null;
    sampleElapsed = 0;
  }

  function seedLive(x, z, rot, owner) {
    liveX = x;
    liveZ = z;
    liveRot = rot;
    committedX = x;
    committedZ = z;
    committedRot = rot;
    hasLive = true;
    head = 0;
    count = 0;
    ownerIdentity = owner != null ? owner : null;
    sampleElapsed = 0;
    xs[0] = x;
    zs[0] = z;
    rots[0] = rot;
  }

  function appendHistory(x, z, rot) {
    head = (head + 1) % n;
    xs[head] = x;
    zs[head] = z;
    rots[head] = rot;
    if (count < n - 1) count++;
  }

  /**
   * @returns {boolean} true if path advanced
   */
  function follow(x, z, rot, dt, owner, sampleSpacingWU, discontinuityWU, samplePeriodS) {
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(rot)) {
      clear();
      return false;
    }
    if (!hasLive || (owner != null && ownerIdentity !== owner)) {
      seedLive(x, z, rot, owner);
      return true;
    }

    const frameDx = x - liveX;
    const frameDz = z - liveZ;
    const frameDistance = Math.hypot(frameDx, frameDz);
    const discontinuity = Number.isFinite(discontinuityWU) && discontinuityWU > 0
      ? discontinuityWU
      : 240;
    if (!Number.isFinite(frameDistance) || frameDistance > discontinuity) {
      seedLive(x, z, rot, owner);
      return false;
    }

    const elapsed = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
    sampleElapsed += elapsed;
    const spacing = Number.isFinite(sampleSpacingWU) && sampleSpacingWU > 0
      ? sampleSpacingWU
      : 2.0;
    const period = Number.isFinite(samplePeriodS) && samplePeriodS > 0
      ? samplePeriodS
      : 1 / 30;

    const dx = x - committedX;
    const dz = z - committedZ;
    const distance = Math.hypot(dx, dz);

    if (distance > spacing) {
      const maxInserts = Math.min(PATH_SAMPLER_INTERPOLATION_CAP, Math.max(1, n - 1));
      const startX = committedX;
      const startZ = committedZ;
      const startRot = committedRot;
      let deltaRot = rot - startRot;
      if (deltaRot > Math.PI) deltaRot -= Math.PI * 2;
      else if (deltaRot < -Math.PI) deltaRot += Math.PI * 2;
      const totalDist = distance;
      let inserts = 0;
      while (inserts < maxInserts) {
        const remX = x - committedX;
        const remZ = z - committedZ;
        const remaining = Math.hypot(remX, remZ);
        if (!(remaining > spacing)) break;
        const inv = spacing / remaining;
        const ix = committedX + remX * inv;
        const iz = committedZ + remZ * inv;
        const traveled = Math.hypot(ix - startX, iz - startZ);
        const pathT = totalDist > 0 ? Math.min(1, traveled / totalDist) : 1;
        const ir = startRot + deltaRot * pathT;
        appendHistory(ix, iz, ir);
        committedX = ix;
        committedZ = iz;
        committedRot = ir;
        inserts++;
      }
      const remX = x - committedX;
      const remZ = z - committedZ;
      const remaining = Math.hypot(remX, remZ);
      if (remaining > spacing + 1e-6) {
        const snapT = 1 - spacing / remaining;
        const sx = committedX + remX * snapT;
        const sz = committedZ + remZ * snapT;
        const traveled = Math.hypot(sx - startX, sz - startZ);
        const pathT = totalDist > 0 ? Math.min(1, traveled / totalDist) : 1;
        appendHistory(sx, sz, startRot + deltaRot * pathT);
        committedX = sx;
        committedZ = sz;
        committedRot = startRot + deltaRot * pathT;
      }
      sampleElapsed = 0;
    } else if (sampleElapsed >= period && distance > spacing * 0.15) {
      appendHistory(committedX, committedZ, committedRot);
      committedX = x;
      committedZ = z;
      committedRot = rot;
      sampleElapsed = 0;
    }

    liveX = x;
    liveZ = z;
    liveRot = rot;
    return true;
  }

  /**
   * Enumerate path from live nozzle (s=0) to oldest sample (s→1).
   * Writes into preallocated arrays: outX, outZ, outS (normalized age along path).
   * @returns {number} point count written
   */
  function sampleInto(outX, outZ, outS, maxPoints) {
    if (!hasLive || !outX || !outZ) return 0;
    const max = Math.min(
      maxPoints | 0,
      outX.length,
      outZ.length,
      outS ? outS.length : maxPoints,
    );
    if (max < 1) return 0;

    // Live head first.
    outX[0] = liveX;
    outZ[0] = liveZ;
    if (outS) outS[0] = 0;
    let written = 1;
    const histCount = Math.min(count, max - 1);
    // history is newest→oldest from head backward
    for (let i = 0; i < histCount; i++) {
      const slot = ((head - i) % n + n) % n;
      outX[written] = xs[slot];
      outZ[written] = zs[slot];
      if (outS) outS[written] = histCount <= 0 ? 0 : (i + 1) / (histCount + 1);
      written++;
    }
    // Normalize s so last is ~1
    if (outS && written > 1) {
      const last = written - 1;
      for (let i = 0; i < written; i++) outS[i] = i / last;
    }
    return written;
  }

  function inspect() {
    return {
      capacity: n,
      historyCount: count,
      hasLive,
      liveX,
      liveZ,
      liveRot,
      visiblePointCount: hasLive ? Math.min(n, count + 1) : 0,
    };
  }

  return {
    follow,
    clear,
    sampleInto,
    inspect,
    get hasLive() { return hasLive; },
    get liveX() { return liveX; },
    get liveZ() { return liveZ; },
    get liveRot() { return liveRot; },
  };
}
