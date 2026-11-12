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

// Production uses reserved slots + dirty ranges. Rocks stay InstancedMesh. Mixed mega-batch
// and per-frame mesh packing stay off; this flag only arms the reservation/upload seam.
export const PERSISTENT_LANES_ENABLED = true;

let liveLanes = null;

// Steady-state shared results: an unchanged frame (menu, pause, docked, stationary world) must
// not allocate a fresh frozen result graph on every presentation pass.
const EMPTY_DIRTY = Object.freeze({});
const IDLE_UPLOADS = Object.freeze({ enabled: true, uploaded: 0, lanes: 0, dirty: EMPTY_DIRTY });

export function getPersistentSubmitLanes() {
  if (!liveLanes) liveLanes = createPersistentSubmitLanes();
  return liveLanes;
}

function mergeDirtyRange(ranges, start, end) {
  let insert = 0;
  while (insert < ranges.length && ranges[insert][1] < start) insert++;
  if (insert > 0 && ranges[insert - 1][1] >= start - 1) insert--;
  let nextStart = start;
  let nextEnd = end;
  while (insert < ranges.length && ranges[insert][0] <= nextEnd + 1) {
    nextStart = Math.min(nextStart, ranges[insert][0]);
    nextEnd = Math.max(nextEnd, ranges[insert][1]);
    ranges.splice(insert, 1);
  }
  ranges.splice(insert, 0, [nextStart, nextEnd]);
}

export function createPersistentSubmitLanes(options = {}) {
  const enabled = options.enabled === false
    ? false
    : (PERSISTENT_LANES_ENABLED === true || options.force === true || options.enabled === true);
  const slots = new Map();
  const freeIndices = [];
  const dirtyByLane = new Map();
  let pendingDirty = false;
  let reservations = 0;
  let releases = 0;
  let dirtyUploads = 0;
  let unchangedFrames = 0;
  let plannerRuns = 0;

  const rangesFor = (lane) => {
    let ranges = dirtyByLane.get(lane);
    if (!ranges) {
      ranges = [];
      dirtyByLane.set(lane, ranges);
    }
    return ranges;
  };

  return {
    get enabled() { return enabled; },
    reserve(id, lane = SUBMIT_LANE.OPAQUE) {
      if (!enabled || id == null) return null;
      if (slots.has(id)) return slots.get(id);
      const index = freeIndices.length > 0 ? freeIndices.pop() : slots.size;
      const slot = Object.freeze({ id, lane, index });
      slots.set(id, slot);
      reservations++;
      return slot;
    },
    release(id) {
      if (!enabled || id == null) return false;
      const slot = slots.get(id);
      const had = slots.delete(id);
      if (had) {
        freeIndices.push(slot.index);
        releases++;
      }
      return had;
    },
    markDirty(id, _kind = 'transform') {
      if (!enabled || !slots.has(id)) return false;
      const slot = slots.get(id);
      mergeDirtyRange(rangesFor(slot.lane), slot.index, slot.index + 1);
      pendingDirty = true;
      dirtyUploads++;
      return true;
    },
    drainDirtyRanges() {
      if (!enabled) return EMPTY_DIRTY;
      if (!pendingDirty) return EMPTY_DIRTY;
      const out = {};
      for (const [lane, ranges] of dirtyByLane) {
        if (ranges.length === 0) continue;
        out[lane] = Object.freeze(ranges.splice(0).map(([start, end]) => Object.freeze({
          start,
          count: end - start,
        })));
      }
      pendingDirty = false;
      return Object.freeze(out);
    },
    notePlannerRun() { plannerRuns++; return plannerRuns; },
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
        plannerRuns,
        dirtyLaneCount: dirtyByLane.size,
      });
    },
  };
}

/**
 * Drain dirty ranges into a renderer-owned uploader. Callers must upload only those
 * ranges in place. Do not pack a mixed mega-batch or rebuild meshes every frame.
 */
export function consumePersistentSubmitUploads(lanes, uploadRange) {
  if (!lanes || lanes.enabled !== true || typeof lanes.drainDirtyRanges !== 'function') {
    return Object.freeze({ enabled: false, uploaded: 0, lanes: 0, dirty: Object.freeze({}) });
  }
  const dirty = lanes.drainDirtyRanges() || {};
  let uploaded = 0;
  let laneCount = 0;
  for (const [lane, ranges] of Object.entries(dirty)) {
    if (!Array.isArray(ranges) || ranges.length === 0) continue;
    laneCount += 1;
    for (const range of ranges) {
      if (typeof uploadRange === 'function') uploadRange(lane, range);
      uploaded += 1;
    }
  }
  if (laneCount === 0) return IDLE_UPLOADS;
  return Object.freeze({ enabled: true, uploaded, lanes: laneCount, dirty });
}
