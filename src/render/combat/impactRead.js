// §22 G6 — an impulse hit names its axis and a shape. Shield and hull do not share one.

function axisFrom(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const len = Math.hypot(x, z);
  if (len < 1e-6) return null;
  return { x: x / len, z: z / len };
}

export function impactRead(payload) {
  const approach = payload && (payload.approach || payload.impulse);
  let axis = approach ? axisFrom(Number(approach.x), Number(approach.z)) : null;
  if (!axis && payload && payload.normal) {
    axis = axisFrom(-Number(payload.normal.x), -Number(payload.normal.z));
  }
  // SFQ-B183 — an unsigned axis stays unsigned. The old fallback invented +X here, aiming a real
  // effect down a direction nobody measured (standard rule E2: never fabricate a force from an
  // unsigned scalar). axisX/axisZ read 0,0 and callers present their honest unaimed read instead.
  const signed = !!axis;
  const shield = !!(payload && (payload.shieldAbsorbed || payload.shieldHit || payload.brokeShield) && !payload.hullHit);
  const hull = !!(payload && payload.hullHit);
  const shapeId = shield ? 'shield-scar' : (hull ? 'hull-cone' : 'armor-cone');
  return signed
    ? { shapeId, axisX: axis.x, axisZ: axis.z, signed }
    : { shapeId, axisX: 0, axisZ: 0, signed };
}

export function impactAxisAngle(read) {
  return Math.atan2(read.axisZ, read.axisX);
}

/**
 * SFQ-B183 — the throw read for a collision-consequence receipt. The receipt's optional
 * `throwDir` is the sim owner's signed answer to "which way did this contact throw the
 * victim" (+normal for a bId victim, −normal for an aId victim — the physics receipt's
 * aId→bId orientation carries that sign). Signed only when the field exists; an absent
 * field is the honest unsigned axis, never a direction rebuilt from the raw normal.
 */
export function collisionThrowRead(payload) {
  const dir = payload && payload.throwDir;
  const x = Number(dir && dir.x);
  const z = Number(dir && dir.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return { signed: false, x: 0, z: 0, angle: 0 };
  const length = Math.hypot(x, z);
  if (!(length > 1e-6)) return { signed: false, x: 0, z: 0, angle: 0 };
  const ux = x / length;
  const uz = z / length;
  return { signed: true, x: ux, z: uz, angle: Math.atan2(uz, ux) };
}
