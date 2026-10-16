// One finite velocity plane at the Charon star marker.
// It damps speed into its face and does not write a body's velocity.

export const VELOCITY_PLANE_ID = 'charon_star_marker_plane';

export const VELOCITY_PLANE = Object.freeze({
  siteId: 'charon_star_marker',
  radius: 180,
  damping: 1.25,
  normal: Object.freeze({ x: 1, z: 0 }),
  frame: Object.freeze({ x: 4, z: 0 }),
});

export function velocityPlaneRecord(center) {
  const c = center || { x: 0, z: 0 };
  return {
    id: VELOCITY_PLANE_ID,
    kind: 'plane',
    center: { x: c.x, z: c.z },
    dir: { x: VELOCITY_PLANE.normal.x, z: VELOCITY_PLANE.normal.z },
    radius: VELOCITY_PLANE.radius,
    damping: VELOCITY_PLANE.damping,
    strength: 0,
    frame: { x: VELOCITY_PLANE.frame.x, z: VELOCITY_PLANE.frame.z },
    durationS: Infinity,
  };
}

export function ensureVelocityPlane(world, site, center) {
  if (!site || site.siteId !== VELOCITY_PLANE.siteId) return false;
  const fields = world && world.registry && world.registry.get && world.registry.get('fields');
  if (!fields || typeof fields.kernelList !== 'function' || typeof fields.registerExternal !== 'function') return false;
  const live = fields.kernelList();
  if (live && live.some((field) => field && field.id === VELOCITY_PLANE_ID)) return false;
  fields.registerExternal(velocityPlaneRecord(center));
  if (world.bus && world.bus.emit) {
    world.bus.emit('comms:log', {
      from: site.name,
      kind: 'machine',
      text: `VELOCITY PLANE. THE FACE MOVES AT ${VELOCITY_PLANE.frame.x} ALONG +X INSIDE RADIUS ${VELOCITY_PLANE.radius} OF CENTER ${Math.round(center.x)}, ${Math.round(center.z)}. SIDEWAYS SPEED IS LEFT ALONE.`,
    });
  }
  return true;
}
