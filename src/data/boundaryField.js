// One finite boundary at the Containment Ring.
// A crate passes, a coated hull sticks, and a creature turns aside.

export const BOUNDARY_FIELD_ID = 'veil_containment_ring_boundary';

export const BOUNDARY_FIELD = Object.freeze({
  siteId: 'veil_containment_ring',
  radius: 180,
  strength: 14,
  damping: 1.5,
});

export function boundaryFieldRecord(center) {
  const c = center || { x: 0, z: 0 };
  return {
    id: BOUNDARY_FIELD_ID,
    kind: 'boundary',
    center: { x: c.x, z: c.z },
    radius: BOUNDARY_FIELD.radius,
    strength: BOUNDARY_FIELD.strength,
    damping: BOUNDARY_FIELD.damping,
    durationS: Infinity,
  };
}

export function ensureBoundaryField(world, site, center) {
  if (!site || site.siteId !== BOUNDARY_FIELD.siteId) return false;
  const fields = world && world.registry && world.registry.get && world.registry.get('fields');
  if (!fields || typeof fields.kernelList !== 'function' || typeof fields.registerExternal !== 'function') return false;
  const sites = world.state && world.state.world && world.state.world.alienEcology
    ? world.state.world.alienEcology.machineSites
    : null;
  const rec = sites ? sites[site.siteId] : null;
  if (rec && rec.boundaryOnline === false) {
    if (typeof fields.unregisterExternal === 'function') fields.unregisterExternal(BOUNDARY_FIELD_ID);
    return false;
  }
  const live = fields.kernelList();
  if (live && live.some((field) => field && field.id === BOUNDARY_FIELD_ID)) return false;
  fields.registerExternal(boundaryFieldRecord(center));
  if (world.bus && world.bus.emit) {
    world.bus.emit('comms:log', {
      from: site.name,
      kind: 'machine',
      text: 'BOUNDARY. A CRATE PASSES. A COATED HULL STICKS. A CREATURE TURNS ASIDE.',
    });
  }
  return true;
}
