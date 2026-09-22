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
  if (!axis) axis = { x: 1, z: 0 };
  const shield = !!(payload && (payload.shieldAbsorbed || payload.shieldHit || payload.brokeShield) && !payload.hullHit);
  const hull = !!(payload && payload.hullHit);
  const shapeId = shield ? 'shield-scar' : (hull ? 'hull-cone' : 'armor-cone');
  return { shapeId, axisX: axis.x, axisZ: axis.z };
}

export function impactAxisAngle(read) {
  return Math.atan2(read.axisZ, read.axisX);
}
