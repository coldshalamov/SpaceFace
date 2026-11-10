// Presentation-owner identity, deliberately independent of names and copyable userData tags.
// The diagnostic may remove one exact presented life for a synchronous offscreen draw only.
const owners = new WeakMap();

export function registerProjectileBodyOwner(mesh, owner) {
  owners.set(mesh, owner);
  return () => { if (owners.get(mesh) === owner) owners.delete(mesh); };
}

export function withProjectileBodyHidden(objects, identity, draw) {
  if (!Number.isSafeInteger(identity?.id) || !Number.isSafeInteger(identity?.occupantGeneration)
      || identity.occupantGeneration < 0) return false;
  let selected = null;
  for (const mesh of objects) {
    const owner = owners.get(mesh);
    if (!owner?.matches(identity)) continue;
    // A mixed publication cannot certify which of two bodies is the observed life.
    if (selected) return false;
    selected = owner;
  }
  return selected ? selected.withHidden(identity, draw) : false;
}
