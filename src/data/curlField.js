// One finite curl at the broken shepherd.
// It winds loose mass around the center and does not pull inward.

export const CURL_FIELD_ID = 'charon_broken_shepherd_curl';

export const CURL_FIELD = Object.freeze({
  siteId: 'charon_broken_shepherd',
  radius: 160,
  strength: 20,
});

export function curlFieldRecord(center) {
  const c = center || { x: 0, z: 0 };
  return {
    id: CURL_FIELD_ID,
    kind: 'curl',
    center: { x: c.x, z: c.z },
    radius: CURL_FIELD.radius,
    strength: CURL_FIELD.strength,
    damping: 0,
    durationS: Infinity,
  };
}

export function ensureCurlField(world, site, center) {
  if (!site || site.siteId !== CURL_FIELD.siteId) return false;
  const fields = world && world.registry && world.registry.get && world.registry.get('fields');
  if (!fields || typeof fields.kernelList !== 'function' || typeof fields.registerExternal !== 'function') return false;
  const live = fields.kernelList();
  if (live && live.some((field) => field && field.id === CURL_FIELD_ID)) return false;
  fields.registerExternal(curlFieldRecord(center));
  if (world.bus && world.bus.emit) {
    world.bus.emit('comms:log', {
      from: site.name,
      kind: 'machine',
      text: `CURL. LOOSE MASS WINDS COUNTERCLOCKWISE INSIDE RADIUS ${CURL_FIELD.radius} OF CENTER ${Math.round(center.x)}, ${Math.round(center.z)}. IT IS NOT PULLED IN.`,
    });
  }
  return true;
}
