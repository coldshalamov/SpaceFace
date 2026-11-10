// One finite lane along The Line.
// It pushes from a named entry to a named exit and does not write velocity.

export const LANE_FIELD_ID = 'ashfall_the_line_lane';

export const LANE_FIELD = Object.freeze({
  siteId: 'ashfall_the_line',
  length: 640,
  halfWidth: 36,
  strength: 18,
  dir: Object.freeze({ x: 1, z: 0 }),
});

export function laneEnds(center) {
  const c = center || { x: 0, z: 0 };
  const half = LANE_FIELD.length / 2;
  return {
    entry: { x: c.x - LANE_FIELD.dir.x * half, z: c.z - LANE_FIELD.dir.z * half },
    exit: { x: c.x + LANE_FIELD.dir.x * half, z: c.z + LANE_FIELD.dir.z * half },
  };
}

export function laneFieldRecord(center) {
  const ends = laneEnds(center);
  return {
    id: LANE_FIELD_ID,
    kind: 'lane',
    center: { x: ends.entry.x, z: ends.entry.z },
    dir: { x: LANE_FIELD.dir.x, z: LANE_FIELD.dir.z },
    radius: LANE_FIELD.length,
    halfWidth: LANE_FIELD.halfWidth,
    strength: LANE_FIELD.strength,
    damping: 0,
    durationS: Infinity,
  };
}

export function ensureLaneField(world, site, center) {
  if (!site || site.siteId !== LANE_FIELD.siteId) return false;
  const fields = world && world.registry && world.registry.get && world.registry.get('fields');
  if (!fields || typeof fields.kernelList !== 'function' || typeof fields.registerExternal !== 'function') return false;
  const sites = world.state && world.state.world && world.state.world.alienEcology
    ? world.state.world.alienEcology.machineSites
    : null;
  const rec = sites ? sites[site.siteId] : null;
  const online = !rec || rec.laneOnline !== false;
  const live = fields.kernelList();
  const present = !!(live && live.some((field) => field && field.id === LANE_FIELD_ID));
  if (!online) {
    if (!present) return false;
    if (typeof fields.unregisterExternal === 'function') fields.unregisterExternal(LANE_FIELD_ID);
    if (world.bus && world.bus.emit) {
      world.bus.emit('comms:log', {
        from: site.name,
        kind: 'machine',
        text: 'LANE OFFLINE. THE PUSH STOPS. SPEED REMAINS.',
      });
    }
    return true;
  }
  if (present) return false;
  const ends = laneEnds(center);
  fields.registerExternal(laneFieldRecord(center));
  if (world.bus && world.bus.emit) {
    world.bus.emit('comms:log', {
      from: site.name,
      kind: 'machine',
      text: `LANE. ENTRY ${Math.round(ends.entry.x)}, ${Math.round(ends.entry.z)}. EXIT ${Math.round(ends.exit.x)}, ${Math.round(ends.exit.z)}. MOMENTUM RUNS ALONG THE LANE. OFF THE LANE, THE PUSH STOPS AND SPEED REMAINS.`,
    });
  }
  return true;
}
