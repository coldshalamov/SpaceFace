// Retained visibility queries over PresentationWorld's render-owned spatial grid.
// Results are deterministic by stable entity ID and carry slot-generation snapshots.
import { PRESENTATION_FLAGS } from './presentationWorld.js';

const INVALID_SLOT = -1;

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

  function query(options = {}) {
    ensureCapacity();
    const bounds = options.bounds || ZERO_BOUNDS;
    const sourceOrigin = options.origin || ZERO_ORIGIN;
    originScratch.x = finite(sourceOrigin.x);
    originScratch.z = finite(sourceOrigin.z);
    const origin = originScratch;
    const playerId = options.playerId;
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

    const expansion = world.maxRadius;
    const centerX = finite(bounds.x) + origin.x;
    const centerZ = finite(bounds.z) + origin.z;
    world.collectSpatialBounds(
      centerX - Math.max(0, finite(bounds.halfX)) - expansion,
      centerX + Math.max(0, finite(bounds.halfX)) + expansion,
      centerZ - Math.max(0, finite(bounds.halfZ)) - expansion,
      centerZ + Math.max(0, finite(bounds.halfZ)) + expansion,
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
    result.culledCount = Math.max(0, world.boundCount - visibleSlots.length);

    diagnostics.queries++;
    diagnostics.candidates = result.candidateCount;
    diagnostics.visible = result.visibleCount;
    diagnostics.newlyVisible = result.newlyVisibleCount;
    diagnostics.hidden = result.hiddenCount;
    diagnostics.culled = result.culledCount;
    return result;
  }

  function reset() {
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
