// Persistent GPU submit lanes. Register once on spawn; dirty ranges update
// in place. The old per-frame opaque planner stays off.

export const SUBMIT_LANE = Object.freeze({
  OPAQUE: 'opaque',
  TRANSPARENT: 'transparent',
  SHADOW: 'shadow',
  DECAL: 'decal',
  DRIVE_EMISSIVE: 'drive',
  VFX: 'vfx',
});

export const PERSISTENT_LANES_ENABLED = true;

let liveLanes = null;

export function getPersistentSubmitLanes() {
  if (!liveLanes) liveLanes = createPersistentSubmitLanes();
  return liveLanes;
}

export function createPersistentSubmitLanes(options = {}) {
  const enabled = options.enabled === false
    ? false
    : (PERSISTENT_LANES_ENABLED === true || options.force === true || options.enabled === true);
  const slots = new Map();
  let reservations = 0;
  let releases = 0;
  let dirtyUploads = 0;
  let unchangedFrames = 0;

  return {
    get enabled() { return enabled; },
    reserve(id, lane = SUBMIT_LANE.OPAQUE) {
      if (!enabled || id == null) return null;
      if (slots.has(id)) return slots.get(id);
      const slot = Object.freeze({ id, lane, index: slots.size });
      slots.set(id, slot);
      reservations++;
      return slot;
    },
    release(id) {
      if (!enabled || id == null) return false;
      const had = slots.delete(id);
      if (had) releases++;
      return had;
    },
    markDirty(id, kind = 'transform') {
      if (!enabled || !slots.has(id)) return false;
      dirtyUploads++;
      return kind === 'transform' || kind === 'palette' || kind === 'visibility';
    },
    noteUnchangedFrame() {
      if (!enabled) return 0;
      unchangedFrames++;
      return unchangedFrames;
    },
    diagnostics() {
      return Object.freeze({
        enabled,
        liveSlots: slots.size,
        reservations,
        releases,
        dirtyUploads,
        unchangedFrames,
      });
    },
  };
}
