// Retained visibility queries over PresentationWorld's render-owned spatial grid.
// Results are deterministic by stable entity ID and carry slot-generation snapshots.
import { PRESENTATION_FLAGS, PRESENTATION_DIRTY } from './presentationWorld.js';

const INVALID_SLOT = -1;

// Quiet settled retain: when presentationWorld.dirtyCount is 0, layout/maxRadius are
// unchanged, and the cull rectangle + origin + playerId are bit-identical, the visible
// set cannot change — skip spatial collect / sort / exactVisible / hidden diff.
// Soft-GPU fps not claimed. Bench toggle restores always-walk.
//
// Pose-dirty retain: TRANSFORM-only dirties on already-visible roots cannot admit
// newcomers (those are not in the prior visible set). Re-exactVisible the dirty slots;
// hide any that left the cull; skip spatial collect when the retain key still matches.
// BINDING/VISUAL/VISIBILITY dirties and dirties outside the prior visible set fail open.
let PRESENTATION_QUERY_ZERO_DIRTY_RETAIN = true;
let PRESENTATION_QUERY_POSE_DIRTY_RETAIN = true;
export function setPresentationQueryZeroDirtyRetainForBench(enabled) {
  PRESENTATION_QUERY_ZERO_DIRTY_RETAIN = enabled !== false;
  return PRESENTATION_QUERY_ZERO_DIRTY_RETAIN;
}
export function getPresentationQueryZeroDirtyRetainForBench() {
  return PRESENTATION_QUERY_ZERO_DIRTY_RETAIN !== false;
}
export function setPresentationQueryPoseDirtyRetainForBench(enabled) {
  PRESENTATION_QUERY_POSE_DIRTY_RETAIN = enabled !== false;
  return PRESENTATION_QUERY_POSE_DIRTY_RETAIN;
}
export function getPresentationQueryPoseDirtyRetainForBench() {
  return PRESENTATION_QUERY_POSE_DIRTY_RETAIN !== false;
}

function finite(value) {
  return Number.isFinite(value) ? value : 0;
}

/**
 * Query a frame-local cull rectangle without scanning every registered mesh root. Result arrays and
 * diagnostics are retained; consumers must finish reading them before the next query call.
 */
export function createPresentationQueries(world) {
  if (!world || typeof world.collectSpatialBounds !== 'function') {
    throw new TypeError('PresentationQueries requires a PresentationWorld');
  }

  const candidateSlots = [];
  let visibleSlots = [];
  let visibleGenerations = [];
  let nextVisibleSlots = [];
  let nextVisibleGenerations = [];
  const newlyVisibleSlots = [];
  const newlyVisibleGenerations = [];
  const hiddenSlots = [];
  const hiddenGenerations = [];
  let candidateMarks = new Uint32Array(world.capacity);
  let previousMarks = new Uint32Array(world.capacity);
  let previousMarkGenerations = new Uint32Array(world.capacity);
  let currentMarks = new Uint32Array(world.capacity);
  let currentMarkGenerations = new Uint32Array(world.capacity);
  let markEpoch = 0;
  let visibilityEpoch = 0;
  const originScratch = { x: 0, z: 0 };
  const compareEntityId = (left, right) => world.entityIds[left] - world.entityIds[right];

  const result = {
    candidateSlots,
    visibleSlots,
    visibleGenerations,
    newlyVisibleSlots,
    newlyVisibleGenerations,
    hiddenSlots,
    hiddenGenerations,
    candidateCount: 0,
    visibleCount: 0,
    newlyVisibleCount: 0,
    hiddenCount: 0,
    culledCount: 0,
  };
  const diagnostics = {
    queries: 0,
    candidates: 0,
    visible: 0,
    newlyVisible: 0,
    hidden: 0,
    culled: 0,
    capacityGrowths: 0,
  };

  function ensureCapacity() {
    if (candidateMarks.length >= world.capacity) return;
    const capacity = world.capacity;
    const nextCandidateMarks = new Uint32Array(capacity);
    const nextPreviousMarks = new Uint32Array(capacity);
    const nextPreviousGenerations = new Uint32Array(capacity);
    const nextCurrentMarks = new Uint32Array(capacity);
    const nextCurrentGenerations = new Uint32Array(capacity);
    nextCandidateMarks.set(candidateMarks);
    nextPreviousMarks.set(previousMarks);
    nextPreviousGenerations.set(previousMarkGenerations);
    nextCurrentMarks.set(currentMarks);
    nextCurrentGenerations.set(currentMarkGenerations);
    candidateMarks = nextCandidateMarks;
    previousMarks = nextPreviousMarks;
    previousMarkGenerations = nextPreviousGenerations;
    currentMarks = nextCurrentMarks;
    currentMarkGenerations = nextCurrentGenerations;
    diagnostics.capacityGrowths++;
  }

  function nextEpoch(kind) {
    if (kind === 'candidate') {
      markEpoch = (markEpoch + 1) >>> 0;
      if (markEpoch === 0) {
        candidateMarks.fill(0);
        markEpoch = 1;
      }
      return markEpoch;
    }
    visibilityEpoch = (visibilityEpoch + 1) >>> 0;
    if (visibilityEpoch === 0) {
      previousMarks.fill(0);
      currentMarks.fill(0);
      visibilityEpoch = 1;
    }
    return visibilityEpoch;
  }

  function exactVisible(slot, bounds, origin, playerId) {
    // Doomed rows (suppressed mid-collect destroys, feed-skip tombstones) fail
    // before every bypass — player/FORCE_RENDER/NEVER_CULL included — so the
    // slot evicts into hiddenSlots and gets a real mesh hide. The flag lives
    // separate from world.visible (the query's own admission bookkeeping).
    if (world.doomed && world.doomed[slot] === 1) return false;
    if (world.alive[slot] !== 1 || !world.meshRefs[slot]) return false;
    if (world.entityIds[slot] === playerId) return true;
    const flags = world.flags[slot];
    if ((flags & (PRESENTATION_FLAGS.FORCE_RENDER | PRESENTATION_FLAGS.NEVER_CULL)) !== 0) {
      return true;
    }
    const entity = world.entityRefs[slot];
    const pos = entity && entity.pos;
    if (pos && (!Number.isFinite(pos.x) || !Number.isFinite(pos.z))) return true;
    const localX = world.x[slot] - origin.x;
    const localZ = world.z[slot] - origin.z;
    const radius = world.radii[slot];
    return Math.abs(localX - bounds.x) <= bounds.halfX + radius
      && Math.abs(localZ - bounds.z) <= bounds.halfZ + radius;
  }

  const retainCache = {
    primed: false,
    layoutVersion: -1,
    maxRadius: NaN,
    boundCount: -1,
    boundsX: NaN,
    boundsZ: NaN,
    halfX: NaN,
    halfZ: NaN,
    originX: NaN,
    originZ: NaN,
    playerId: null,
    candidateCount: 0,
  };

  function query(options = {}) {
    ensureCapacity();
    const bounds = options.bounds || ZERO_BOUNDS;
    const sourceOrigin = options.origin || ZERO_ORIGIN;
    originScratch.x = finite(sourceOrigin.x);
    originScratch.z = finite(sourceOrigin.z);
    const origin = originScratch;
    const playerId = options.playerId;
    const boundsX = finite(bounds.x);
    const boundsZ = finite(bounds.z);
    const halfX = Math.max(0, finite(bounds.halfX));
    const halfZ = Math.max(0, finite(bounds.halfZ));
    const layoutVersion = Number.isFinite(world.layoutVersion) ? world.layoutVersion : -1;
    const maxRadius = Number.isFinite(world.maxRadius) ? world.maxRadius : 0;
    const boundCount = world.boundCount | 0;
    const retainKeyMatches = retainCache.primed
        && retainCache.layoutVersion === layoutVersion
        && retainCache.maxRadius === maxRadius
        && retainCache.boundCount === boundCount
        && retainCache.boundsX === boundsX
        && retainCache.boundsZ === boundsZ
        && retainCache.halfX === halfX
        && retainCache.halfZ === halfZ
        && retainCache.originX === origin.x
        && retainCache.originZ === origin.z
        && retainCache.playerId === playerId;
    const dirtyCountNow = world.dirtyCount | 0;
    if (PRESENTATION_QUERY_ZERO_DIRTY_RETAIN && retainKeyMatches && dirtyCountNow === 0) {
      newlyVisibleSlots.length = 0;
      newlyVisibleGenerations.length = 0;
      hiddenSlots.length = 0;
      hiddenGenerations.length = 0;
      result.visibleSlots = visibleSlots;
      result.visibleGenerations = visibleGenerations;
      result.candidateCount = retainCache.candidateCount;
      result.visibleCount = visibleSlots.length;
      result.newlyVisibleCount = 0;
      result.hiddenCount = 0;
      result.culledCount = Math.max(0, boundCount - visibleSlots.length);
      diagnostics.queries++;
      diagnostics.candidates = result.candidateCount;
      diagnostics.visible = result.visibleCount;
      diagnostics.newlyVisible = 0;
      diagnostics.hidden = 0;
      diagnostics.culled = result.culledCount;
      return result;
    }
    // Pose-dirty retain: TRANSFORM-only dirties on already-visible roots. Newcomers are
    // never in the prior visible set, so they fail open to the full walk below.
    if (PRESENTATION_QUERY_ZERO_DIRTY_RETAIN
        && PRESENTATION_QUERY_POSE_DIRTY_RETAIN
        && retainKeyMatches
        && dirtyCountNow > 0) {
      const dirtySlots = world.dirtySlots;
      const dirtyMasks = world.dirtyMasks;
      const nonTransform = PRESENTATION_DIRTY.ALL & ~PRESENTATION_DIRTY.TRANSFORM;
      let poseOnly = true;
      for (let d = 0; d < dirtyCountNow; d++) {
        const slot = dirtySlots[d];
        if ((dirtyMasks[slot] & nonTransform) !== 0) { poseOnly = false; break; }
      }
      if (poseOnly) {
        // Mark prior visible for O(1) membership of dirty slots.
        const frameEpoch = nextEpoch('visibility');
        for (let index = 0; index < visibleSlots.length; index++) {
          const slot = visibleSlots[index];
          if (slot < 0 || slot >= world.capacity) continue;
          previousMarks[slot] = frameEpoch;
          previousMarkGenerations[slot] = visibleGenerations[index];
        }
        let allPriorVisible = true;
        for (let d = 0; d < dirtyCountNow; d++) {
          const slot = dirtySlots[d];
          if (previousMarks[slot] !== frameEpoch) { allPriorVisible = false; break; }
        }
        if (allPriorVisible) {
          newlyVisibleSlots.length = 0;
          newlyVisibleGenerations.length = 0;
          hiddenSlots.length = 0;
          hiddenGenerations.length = 0;
          let hideCount = 0;
          for (let d = 0; d < dirtyCountNow; d++) {
            const slot = dirtySlots[d];
            if (exactVisible(slot, bounds, origin, playerId)) continue;
            const generation = previousMarkGenerations[slot];
            hiddenSlots.push(slot);
            hiddenGenerations.push(generation);
            world.setVisibility(slot, generation, false);
            previousMarks[slot] = 0; // drop from visible compact
            hideCount++;
          }
          if (hideCount > 0) {
            let write = 0;
            for (let index = 0; index < visibleSlots.length; index++) {
              const slot = visibleSlots[index];
              if (previousMarks[slot] !== frameEpoch) continue;
              visibleSlots[write] = slot;
              visibleGenerations[write] = visibleGenerations[index];
              write++;
            }
            visibleSlots.length = write;
            visibleGenerations.length = write;
          }
          result.visibleSlots = visibleSlots;
          result.visibleGenerations = visibleGenerations;
          result.candidateCount = retainCache.candidateCount;
          result.visibleCount = visibleSlots.length;
          result.newlyVisibleCount = 0;
          result.hiddenCount = hiddenSlots.length;
          result.culledCount = Math.max(0, boundCount - visibleSlots.length);
          diagnostics.queries++;
          diagnostics.candidates = result.candidateCount;
          diagnostics.visible = result.visibleCount;
          diagnostics.newlyVisible = 0;
          diagnostics.hidden = result.hiddenCount;
          diagnostics.culled = result.culledCount;
          return result;
        }
      }
    }
    const candidateEpoch = nextEpoch('candidate');
    const frameEpoch = nextEpoch('visibility');
    candidateSlots.length = 0;
    nextVisibleSlots.length = 0;
    nextVisibleGenerations.length = 0;
    newlyVisibleSlots.length = 0;
    newlyVisibleGenerations.length = 0;
    hiddenSlots.length = 0;
    hiddenGenerations.length = 0;

    for (let index = 0; index < visibleSlots.length; index++) {
      const slot = visibleSlots[index];
      if (slot < 0 || slot >= world.capacity) continue;
      previousMarks[slot] = frameEpoch;
      previousMarkGenerations[slot] = visibleGenerations[index];
    }

    const expansion = maxRadius;
    const centerX = boundsX + origin.x;
    const centerZ = boundsZ + origin.z;
    world.collectSpatialBounds(
      centerX - halfX - expansion,
      centerX + halfX + expansion,
      centerZ - halfZ - expansion,
      centerZ + halfZ + expansion,
      candidateSlots,
    );
    world.collectSpecialSlots(candidateSlots);
    const playerSlot = Number.isSafeInteger(playerId) ? world.getSlotForEntityId(playerId) : INVALID_SLOT;
    if (playerSlot >= 0) candidateSlots.push(playerSlot);

    let write = 0;
    for (let index = 0; index < candidateSlots.length; index++) {
      const slot = candidateSlots[index];
      if (!Number.isInteger(slot) || slot < 0 || slot >= world.capacity
        || candidateMarks[slot] === candidateEpoch || world.meshRefs[slot] == null) continue;
      candidateMarks[slot] = candidateEpoch;
      candidateSlots[write++] = slot;
    }
    candidateSlots.length = write;
    candidateSlots.sort(compareEntityId);

    for (let index = 0; index < candidateSlots.length; index++) {
      const slot = candidateSlots[index];
      if (!exactVisible(slot, bounds, origin, playerId)) continue;
      const generation = world.slotGenerations[slot];
      currentMarks[slot] = frameEpoch;
      currentMarkGenerations[slot] = generation;
      nextVisibleSlots.push(slot);
      nextVisibleGenerations.push(generation);
      if (previousMarks[slot] !== frameEpoch || previousMarkGenerations[slot] !== generation) {
        newlyVisibleSlots.push(slot);
        newlyVisibleGenerations.push(generation);
        world.setVisibility(slot, generation, true);
      }
    }

    for (let index = 0; index < visibleSlots.length; index++) {
      const slot = visibleSlots[index];
      const generation = visibleGenerations[index];
      if (slot < 0 || slot >= world.capacity
        || currentMarks[slot] === frameEpoch && currentMarkGenerations[slot] === generation) continue;
      if (world.alive[slot] !== 1 || world.slotGenerations[slot] !== generation
        || !world.meshRefs[slot]) continue;
      hiddenSlots.push(slot);
      hiddenGenerations.push(generation);
      world.setVisibility(slot, generation, false);
    }

    const oldSlots = visibleSlots;
    const oldGenerations = visibleGenerations;
    visibleSlots = nextVisibleSlots;
    visibleGenerations = nextVisibleGenerations;
    nextVisibleSlots = oldSlots;
    nextVisibleGenerations = oldGenerations;

    result.visibleSlots = visibleSlots;
    result.visibleGenerations = visibleGenerations;
    result.candidateCount = candidateSlots.length;
    result.visibleCount = visibleSlots.length;
    result.newlyVisibleCount = newlyVisibleSlots.length;
    result.hiddenCount = hiddenSlots.length;
    result.culledCount = Math.max(0, boundCount - visibleSlots.length);

    retainCache.primed = true;
    retainCache.layoutVersion = layoutVersion;
    retainCache.maxRadius = maxRadius;
    retainCache.boundCount = boundCount;
    retainCache.boundsX = boundsX;
    retainCache.boundsZ = boundsZ;
    retainCache.halfX = halfX;
    retainCache.halfZ = halfZ;
    retainCache.originX = origin.x;
    retainCache.originZ = origin.z;
    retainCache.playerId = playerId;
    retainCache.candidateCount = result.candidateCount;

    diagnostics.queries++;
    diagnostics.candidates = result.candidateCount;
    diagnostics.visible = result.visibleCount;
    diagnostics.newlyVisible = result.newlyVisibleCount;
    diagnostics.hidden = result.hiddenCount;
    diagnostics.culled = result.culledCount;
    return result;
  }

  function reset() {
    retainCache.primed = false;
    for (let index = 0; index < visibleSlots.length; index++) {
      world.setVisibility(visibleSlots[index], visibleGenerations[index], false);
    }
    visibleSlots.length = 0;
    visibleGenerations.length = 0;
    nextVisibleSlots.length = 0;
    nextVisibleGenerations.length = 0;
    candidateSlots.length = 0;
    newlyVisibleSlots.length = 0;
    newlyVisibleGenerations.length = 0;
    hiddenSlots.length = 0;
    hiddenGenerations.length = 0;
    result.visibleSlots = visibleSlots;
    result.visibleGenerations = visibleGenerations;
    return result;
  }

  return {
    query,
    reset,
    getDiagnostics: () => diagnostics,
  };
}

const ZERO_ORIGIN = Object.freeze({ x: 0, z: 0 });
const ZERO_BOUNDS = Object.freeze({ x: 0, z: 0, halfX: 0, halfZ: 0 });
