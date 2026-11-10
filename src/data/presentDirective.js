// PRESENT names one object and one volume.
// The check does not take the object, spend credits, or pause the sim.

export function judgePresentDirective(order, ctx = {}) {
  if (!order || typeof order.objectId !== 'string' || !order.objectId || !(Number(order.radius) > 0)) {
    return { accepted: false, reason: 'unnamed' };
  }
  const count = Number(ctx.cargoCount);
  const has = Number.isFinite(count) && count > 0;
  const distance = Number(ctx.distance);
  const inside = Number.isFinite(distance) && distance <= Number(order.radius);
  if (has && inside) return { accepted: true, reason: 'presented' };
  if (!inside) return { accepted: false, reason: 'outside the volume' };
  return { accepted: false, reason: 'wrong object' };
}

export function presentOrderLine(site, center) {
  const label = site && site.presentLabel ? site.presentLabel : 'named object';
  const radius = site && site.radius;
  const x = center ? Math.round(center.x) : 0;
  const z = center ? Math.round(center.z) : 0;
  return `PRESENT SPECIMEN. BRING THE ${label} INSIDE RADIUS ${radius} OF CENTER ${x}, ${z}.`;
}

export function presentMissLine(reason, label) {
  const name = label || 'named object';
  if (reason === 'outside the volume') return `OUTSIDE THE VOLUME. THE NAMED OBJECT IS THE ${name}.`;
  if (reason === 'wrong object') return `INSIDE THE VOLUME. THE NAMED OBJECT IS THE ${name}. THIS LOT IS NOT IT.`;
  return null;
}
