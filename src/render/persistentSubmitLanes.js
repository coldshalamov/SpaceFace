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

// The reservation/range model is ready for the renderer-owned GPU upload path, but no live buffer
// uploader consumes these ranges yet. Keep the production default off until that ownership seam is
// real; tests and an explicitly integrated caller can opt in with `{ force: true }`.
export const PERSISTENT_LANES_ENABLED = false;

let liveLanes = null;

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
      dirtyUploads++;
      return true;
    },
    drainDirtyRanges() {
      if (!enabled) return Object.freeze({});
      const out = {};
      for (const [lane, ranges] of dirtyByLane) {
        out[lane] = Object.freeze(ranges.splice(0).map(([start, end]) => Object.freeze({
          start,
          count: end - start,
        })));
      }
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
