// Dense, disposable render-side mirror of authoritative GameState entities.
// Simulation never reads this object. Journal publication and renderer bindings are the only writers.

export const PRESENTATION_DIRTY = Object.freeze({
  NONE: 0,
  TRANSFORM: 1 << 0,
  VISUAL: 1 << 1,
  BINDING: 1 << 2,
  VISIBILITY: 1 << 3,
  ALL: (1 << 4) - 1,
});

export const PRESENTATION_FLAGS = Object.freeze({
  NONE: 0,
  NO_INTERPOLATION: 1 << 0,
  FORCE_RENDER: 1 << 1,
  NEVER_CULL: 1 << 2,
});

const DEFAULT_CAPACITY = 256;
const DEFAULT_CELL_SIZE = 512;
const INVALID_INDEX = -1;
const EMPTY_OBJECT = Object.freeze({});

function finite(value) {
  return Number.isFinite(value) ? value : 0;
}

function nextGeneration(value) {
  const next = (value + 1) >>> 0;
  return next === 0 ? 1 : next;
}

function presentationFlags(entity) {
  const flags = entity && entity.flags || EMPTY_OBJECT;
  let value = PRESENTATION_FLAGS.NONE;
  if (flags.noInterp) value |= PRESENTATION_FLAGS.NO_INTERPOLATION;
  if (flags.forceRender) value |= PRESENTATION_FLAGS.FORCE_RENDER;
  if (flags.neverCull) value |= PRESENTATION_FLAGS.NEVER_CULL;
  return value;
}

function sourceEntityId(source) {
  return source && Number.isSafeInteger(source.entityId) && source.entityId > 0
    ? source.entityId
    : source && Number.isSafeInteger(source.id) && source.id > 0
      ? source.id
      : 0;
}

function sourceGeneration(source) {
  return source && Number.isSafeInteger(source.generation) && source.generation >= 0
    ? source.generation >>> 0
    : 0;
}

function sourceRevision(source) {
  return source && Number.isSafeInteger(source.revision) && source.revision >= 0
    ? source.revision >>> 0
    : 0;
}

function growTyped(source, Type, capacity, fill = null) {
  const target = new Type(capacity);
  target.set(source);
  if (fill !== null && capacity > source.length) target.fill(fill, source.length);
  return target;
}

function growRefs(source, capacity) {
  const target = new Array(capacity);
  for (let index = 0; index < source.length; index++) target[index] = source[index];
  return target;
}

/**
 * Create dense presentation storage with generation-safe handles and a render-owned spatial grid.
 * Handles are `{ slot, generation, entityId, sourceGeneration }` and remain valid only while both
 * slot generation and stable entity identity still match.
 */
export function createPresentationWorld(options = {}) {
  const initialCapacity = Math.max(
    16,
    Math.floor(Number.isFinite(options.capacity) ? options.capacity : DEFAULT_CAPACITY),
  );
  const cellSize = Math.max(
    32,
    Number.isFinite(options.cellSize) ? options.cellSize : DEFAULT_CELL_SIZE,
  );

  const byId = new Map();
  const gridColumns = new Map();
  const typeCodesByName = new Map([['', 0]]);
  const typeNames = [''];
  const diagnostics = {
    capacity: 0,
    active: 0,
    bound: 0,
    free: 0,
    highWater: 0,
    allocations: 0,
    retirements: 0,
    rebuilds: 0,
    growths: 0,
    staleHandleRejects: 0,
    duplicateIdRejects: 0,
    spatialMoves: 0,
    maxRadius: 0,
    cellSize,
  };

  let nextSlot = 0;
  let activeCount = 0;
  let boundCount = 0;
  let freeCount = 0;
  let specialCount = 0;
  let maxRadius = 0;
  let asteroidDirty = true;
  let disposed = false;

  const world = {
    capacity: 0,
    alive: new Uint8Array(0),
    visible: new Uint8Array(0),
    slotGenerations: new Uint32Array(0),
    sourceGenerations: new Uint32Array(0),
    revisions: new Uint32Array(0),
    visualRevisions: new Uint32Array(0),
    entityIds: new Float64Array(0),
    typeCodes: new Uint16Array(0),
    flags: new Uint8Array(0),
    dirtyMasks: new Uint8Array(0),
    radii: new Float64Array(0),
    prevX: new Float64Array(0),
    prevY: new Float64Array(0),
    prevZ: new Float64Array(0),
    x: new Float64Array(0),
    y: new Float64Array(0),
    z: new Float64Array(0),
    prevRot: new Float64Array(0),
    prevBank: new Float64Array(0),
    prevPitch: new Float64Array(0),
    rot: new Float64Array(0),
    bank: new Float64Array(0),
    pitch: new Float64Array(0),
    activeSlots: new Uint32Array(0),
    activePositions: new Int32Array(0),
    freeSlots: new Uint32Array(0),
    specialSlots: new Uint32Array(0),
    specialPositions: new Int32Array(0),
    cellX: new Int32Array(0),
    cellZ: new Int32Array(0),
    cellPrev: new Int32Array(0),
    cellNext: new Int32Array(0),
    entityRefs: [],
    meshRefs: [],
    diagnostics,
    cellSize,
    get activeCount() { return activeCount; },
    get boundCount() { return boundCount; },
    get freeCount() { return freeCount; },
    get maxRadius() { return maxRadius; },
    get disposed() { return disposed; },
  };

  function ensureAlive() {
    if (disposed) throw new Error('PresentationWorld has been disposed');
  }

  function ensureCapacity(required) {
    if (required <= world.capacity) return;
    let capacity = world.capacity || initialCapacity;
    while (capacity < required) capacity *= 2;

    world.alive = growTyped(world.alive, Uint8Array, capacity);
    world.visible = growTyped(world.visible, Uint8Array, capacity);
    world.slotGenerations = growTyped(world.slotGenerations, Uint32Array, capacity);
    world.sourceGenerations = growTyped(world.sourceGenerations, Uint32Array, capacity);
    world.revisions = growTyped(world.revisions, Uint32Array, capacity);
    world.visualRevisions = growTyped(world.visualRevisions, Uint32Array, capacity);
    world.entityIds = growTyped(world.entityIds, Float64Array, capacity);
    world.typeCodes = growTyped(world.typeCodes, Uint16Array, capacity);
    world.flags = growTyped(world.flags, Uint8Array, capacity);
    world.dirtyMasks = growTyped(world.dirtyMasks, Uint8Array, capacity);
    world.radii = growTyped(world.radii, Float64Array, capacity);
    world.prevX = growTyped(world.prevX, Float64Array, capacity);
    world.prevY = growTyped(world.prevY, Float64Array, capacity);
    world.prevZ = growTyped(world.prevZ, Float64Array, capacity);
    world.x = growTyped(world.x, Float64Array, capacity);
    world.y = growTyped(world.y, Float64Array, capacity);
    world.z = growTyped(world.z, Float64Array, capacity);
    world.prevRot = growTyped(world.prevRot, Float64Array, capacity);
    world.prevBank = growTyped(world.prevBank, Float64Array, capacity);
    world.prevPitch = growTyped(world.prevPitch, Float64Array, capacity);
    world.rot = growTyped(world.rot, Float64Array, capacity);
    world.bank = growTyped(world.bank, Float64Array, capacity);
    world.pitch = growTyped(world.pitch, Float64Array, capacity);
    world.activeSlots = growTyped(world.activeSlots, Uint32Array, capacity);
    world.activePositions = growTyped(world.activePositions, Int32Array, capacity, INVALID_INDEX);
    world.freeSlots = growTyped(world.freeSlots, Uint32Array, capacity);
    world.specialSlots = growTyped(world.specialSlots, Uint32Array, capacity);
    world.specialPositions = growTyped(world.specialPositions, Int32Array, capacity, INVALID_INDEX);
    world.cellX = growTyped(world.cellX, Int32Array, capacity, INVALID_INDEX);
    world.cellZ = growTyped(world.cellZ, Int32Array, capacity, INVALID_INDEX);
    world.cellPrev = growTyped(world.cellPrev, Int32Array, capacity, INVALID_INDEX);
    world.cellNext = growTyped(world.cellNext, Int32Array, capacity, INVALID_INDEX);
    world.entityRefs = growRefs(world.entityRefs, capacity);
    world.meshRefs = growRefs(world.meshRefs, capacity);
    world.capacity = capacity;
    diagnostics.capacity = capacity;
    diagnostics.growths++;
  }

  function typeCode(name) {
    const normalized = typeof name === 'string' ? name : '';
    const existing = typeCodesByName.get(normalized);
    if (existing !== undefined) return existing;
    const code = typeNames.length;
    if (code > 0xffff) throw new Error('PresentationWorld type table exhausted');
    typeCodesByName.set(normalized, code);
    typeNames.push(normalized);
    return code;
  }

  function addActive(slot) {
    world.activePositions[slot] = activeCount;
    world.activeSlots[activeCount++] = slot;
    diagnostics.active = activeCount;
    diagnostics.highWater = Math.max(diagnostics.highWater, activeCount);
  }

  function removeActive(slot) {
    const position = world.activePositions[slot];
    if (position < 0 || position >= activeCount) return;
    const lastPosition = activeCount - 1;
    const lastSlot = world.activeSlots[lastPosition];
    world.activeSlots[position] = lastSlot;
    world.activePositions[lastSlot] = position;
    world.activePositions[slot] = INVALID_INDEX;
    activeCount = lastPosition;
    diagnostics.active = activeCount;
  }

  function isSpecial(flags) {
    return (flags & (PRESENTATION_FLAGS.FORCE_RENDER | PRESENTATION_FLAGS.NEVER_CULL)) !== 0;
  }

  function setSpecialMembership(slot, enabled) {
    const position = world.specialPositions[slot];
    if (enabled) {
      if (position >= 0) return;
      world.specialPositions[slot] = specialCount;
      world.specialSlots[specialCount++] = slot;
      return;
    }
    if (position < 0 || position >= specialCount) return;
    const lastPosition = specialCount - 1;
    const lastSlot = world.specialSlots[lastPosition];
    world.specialSlots[position] = lastSlot;
    world.specialPositions[lastSlot] = position;
    world.specialPositions[slot] = INVALID_INDEX;
    specialCount = lastPosition;
  }

  function removeFromGrid(slot) {
    const cx = world.cellX[slot];
    const cz = world.cellZ[slot];
    if (cx === INVALID_INDEX || cz === INVALID_INDEX) return;
    const column = gridColumns.get(cx);
    const previous = world.cellPrev[slot];
    const next = world.cellNext[slot];
    if (previous >= 0) world.cellNext[previous] = next;
    else if (column) {
      if (next >= 0) column.set(cz, next);
      else column.delete(cz);
    }
    if (next >= 0) world.cellPrev[next] = previous;
    if (column && column.size === 0) gridColumns.delete(cx);
    world.cellX[slot] = INVALID_INDEX;
    world.cellZ[slot] = INVALID_INDEX;
    world.cellPrev[slot] = INVALID_INDEX;
    world.cellNext[slot] = INVALID_INDEX;
  }

  function insertIntoGrid(slot) {
    const cx = Math.floor(world.x[slot] / cellSize);
    const cz = Math.floor(world.z[slot] / cellSize);
    if (world.cellX[slot] === cx && world.cellZ[slot] === cz) return;
    removeFromGrid(slot);
    let column = gridColumns.get(cx);
    if (!column) {
      column = new Map();
      gridColumns.set(cx, column);
    }
    const head = column.get(cz);
    world.cellX[slot] = cx;
    world.cellZ[slot] = cz;
    world.cellPrev[slot] = INVALID_INDEX;
    world.cellNext[slot] = head === undefined ? INVALID_INDEX : head;
    if (head !== undefined) world.cellPrev[head] = slot;
    column.set(cz, slot);
    diagnostics.spatialMoves++;
  }

  function writePoseScalars(
    slot,
    nextX,
    nextY,
    nextZ,
    nextPrevX,
    nextPrevY,
    nextPrevZ,
    nextRot,
    nextBank,
    nextPitch,
    nextPrevRot,
    nextPrevBank,
    nextPrevPitch,
  ) {
    const changed = world.x[slot] !== nextX || world.y[slot] !== nextY || world.z[slot] !== nextZ
      || world.prevX[slot] !== nextPrevX || world.prevY[slot] !== nextPrevY
      || world.prevZ[slot] !== nextPrevZ || world.rot[slot] !== nextRot
      || world.bank[slot] !== nextBank || world.pitch[slot] !== nextPitch
      || world.prevRot[slot] !== nextPrevRot || world.prevBank[slot] !== nextPrevBank
      || world.prevPitch[slot] !== nextPrevPitch;
    const gridChanged = world.x[slot] !== nextX || world.z[slot] !== nextZ;
    world.prevX[slot] = nextPrevX;
    world.prevY[slot] = nextPrevY;
    world.prevZ[slot] = nextPrevZ;
    world.x[slot] = nextX;
    world.y[slot] = nextY;
    world.z[slot] = nextZ;
    world.prevRot[slot] = nextPrevRot;
    world.prevBank[slot] = nextPrevBank;
    world.prevPitch[slot] = nextPrevPitch;
    world.rot[slot] = nextRot;
    world.bank[slot] = nextBank;
    world.pitch[slot] = nextPitch;
    if (gridChanged && world.alive[slot]) insertIntoGrid(slot);
    return changed;
  }

  function writePoseValues(slot, source) {
    const nextX = finite(source && source.x);
    const nextY = finite(source && source.y);
    const nextZ = finite(source && source.z);
    const nextPrevX = Number.isFinite(source && source.prevX) ? source.prevX : nextX;
    const nextPrevY = Number.isFinite(source && source.prevY) ? source.prevY : nextY;
    const nextPrevZ = Number.isFinite(source && source.prevZ) ? source.prevZ : nextZ;
    const nextRot = finite(source && source.rot);
    const nextBank = finite(source && source.bank);
    const nextPitch = finite(source && source.pitch);
    const nextPrevRot = Number.isFinite(source && source.prevRot) ? source.prevRot : nextRot;
    const nextPrevBank = Number.isFinite(source && source.prevBank) ? source.prevBank : nextBank;
    const nextPrevPitch = Number.isFinite(source && source.prevPitch) ? source.prevPitch : nextPitch;
    return writePoseScalars(
      slot,
      nextX,
      nextY,
      nextZ,
      nextPrevX,
      nextPrevY,
      nextPrevZ,
      nextRot,
      nextBank,
      nextPitch,
      nextPrevRot,
      nextPrevBank,
      nextPrevPitch,
    );
  }

  function writeEntityPose(slot, entity) {
    const value = entity && typeof entity === 'object' ? entity : EMPTY_OBJECT;
    const pos = value.pos && typeof value.pos === 'object' ? value.pos : EMPTY_OBJECT;
    const prevPos = value.prevPos && typeof value.prevPos === 'object' ? value.prevPos : pos;
    const nextX = finite(pos.x);
    const nextY = finite(pos.y);
    const nextZ = finite(pos.z);
    const nextPrevX = Number.isFinite(prevPos.x) ? prevPos.x : nextX;
    const nextPrevY = Number.isFinite(prevPos.y) ? prevPos.y : nextY;
    const nextPrevZ = Number.isFinite(prevPos.z) ? prevPos.z : nextZ;
    const nextRot = finite(value.rot);
    const nextBank = finite(value.bank);
    const nextPitch = finite(value.pitch);
    return writePoseScalars(
      slot,
      nextX,
      nextY,
      nextZ,
      nextPrevX,
      nextPrevY,
      nextPrevZ,
      nextRot,
      nextBank,
      nextPitch,
      Number.isFinite(value.prevRot) ? value.prevRot : nextRot,
      Number.isFinite(value.prevBank) ? value.prevBank : nextBank,
      Number.isFinite(value.prevPitch) ? value.prevPitch : nextPitch,
    );
  }

  function refreshMetadata(slot, entity, visualRadius = null) {
    if (!entity || typeof entity !== 'object') return false;
    let changed = false;
    world.entityRefs[slot] = entity;
    const nextType = typeCode(entity.type);
    if (world.typeCodes[slot] !== nextType) {
      if (typeNames[world.typeCodes[slot]] === 'asteroid' || typeNames[nextType] === 'asteroid') {
        asteroidDirty = true;
      }
      world.typeCodes[slot] = nextType;
      changed = true;
    }
    const nextFlags = presentationFlags(entity);
    if (world.flags[slot] !== nextFlags) {
      world.flags[slot] = nextFlags;
      setSpecialMembership(slot, isSpecial(nextFlags));
      changed = true;
    }
    const candidateRadius = Number.isFinite(visualRadius)
      ? visualRadius
      : Number(entity.radius);
    const nextRadius = Math.max(0, Number.isFinite(candidateRadius) ? candidateRadius : 0);
    if (world.radii[slot] !== nextRadius) {
      world.radii[slot] = nextRadius;
      maxRadius = Math.max(maxRadius, nextRadius);
      diagnostics.maxRadius = maxRadius;
      changed = true;
    }
    if (changed) world.dirtyMasks[slot] |= PRESENTATION_DIRTY.VISUAL;
    return changed;
  }

  function slotForHandle(handle) {
    if (!handle || !Number.isInteger(handle.slot)) return INVALID_INDEX;
    const slot = handle.slot;
    if (slot < 0 || slot >= world.capacity || world.alive[slot] !== 1
      || world.slotGenerations[slot] !== handle.generation
      || world.entityIds[slot] !== handle.entityId
      || world.sourceGenerations[slot] !== handle.sourceGeneration) {
      diagnostics.staleHandleRejects++;
      return INVALID_INDEX;
    }
    return slot;
  }

  function allocateRecord(record, entity = null) {
    ensureAlive();
    const entityId = sourceEntityId(record);
    if (entityId === 0) throw new TypeError('PresentationWorld allocation requires a positive entity ID');
    if (byId.has(entityId)) {
      diagnostics.duplicateIdRejects++;
      throw new Error(`PresentationWorld entity ${entityId} is already active`);
    }

    const slot = freeCount > 0 ? world.freeSlots[--freeCount] : nextSlot++;
    ensureCapacity(slot + 1);
    world.alive[slot] = 1;
    world.visible[slot] = 0;
    world.slotGenerations[slot] = nextGeneration(world.slotGenerations[slot]);
    world.sourceGenerations[slot] = sourceGeneration(record);
    world.revisions[slot] = sourceRevision(record);
    world.visualRevisions[slot] = Number.isSafeInteger(record && record.visualRevision)
      ? record.visualRevision >>> 0
      : 0;
    world.entityIds[slot] = entityId;
    world.typeCodes[slot] = typeCode(record && record.entityType || entity && entity.type);
    world.flags[slot] = PRESENTATION_FLAGS.NONE;
    world.dirtyMasks[slot] = PRESENTATION_DIRTY.ALL;
    world.radii[slot] = 0;
    world.entityRefs[slot] = entity;
    world.meshRefs[slot] = null;
    world.cellX[slot] = INVALID_INDEX;
    world.cellZ[slot] = INVALID_INDEX;
    world.cellPrev[slot] = INVALID_INDEX;
    world.cellNext[slot] = INVALID_INDEX;
    world.activePositions[slot] = INVALID_INDEX;
    world.specialPositions[slot] = INVALID_INDEX;
    writePoseValues(slot, record);
    refreshMetadata(slot, entity);
    addActive(slot);
    insertIntoGrid(slot);
    byId.set(entityId, slot);
    diagnostics.allocations++;
    diagnostics.free = freeCount;
    if (typeNames[world.typeCodes[slot]] === 'asteroid') asteroidDirty = true;
    return handleForSlot(slot);
  }

  function allocateEntity(entity, generation = 0) {
    if (!entity || entity.alive === false) return null;
    const pos = entity.pos || EMPTY_OBJECT;
    const prevPos = entity.prevPos || pos;
    return allocateRecord({
      entityId: entity.id,
      generation,
      revision: 0,
      entityType: entity.type,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      prevX: prevPos.x,
      prevY: prevPos.y,
      prevZ: prevPos.z,
      rot: entity.rot,
      bank: entity.bank,
      pitch: entity.pitch,
      prevRot: entity.prevRot,
      prevBank: entity.prevBank,
      prevPitch: entity.prevPitch,
      visualRevision: entity.presentationVisualRevision,
    }, entity);
  }

  function handleForSlot(slot, target = null) {
    if (slot < 0 || slot >= world.capacity || world.alive[slot] !== 1) return null;
    const handle = target || {};
    handle.slot = slot;
    handle.generation = world.slotGenerations[slot];
    handle.entityId = world.entityIds[slot];
    handle.sourceGeneration = world.sourceGenerations[slot];
    return handle;
  }

  function handleForEntityId(entityId, target = null) {
    const slot = byId.get(entityId);
    return slot === undefined ? null : handleForSlot(slot, target);
  }

  function retireSlot(slot) {
    const entityId = world.entityIds[slot];
    const wasAsteroid = typeNames[world.typeCodes[slot]] === 'asteroid';
    removeFromGrid(slot);
    setSpecialMembership(slot, false);
    removeActive(slot);
    if (world.meshRefs[slot]) boundCount = Math.max(0, boundCount - 1);
    world.alive[slot] = 0;
    world.visible[slot] = 0;
    world.dirtyMasks[slot] = PRESENTATION_DIRTY.NONE;
    world.entityRefs[slot] = null;
    world.meshRefs[slot] = null;
    byId.delete(entityId);
    world.freeSlots[freeCount++] = slot;
    diagnostics.bound = boundCount;
    diagnostics.free = freeCount;
    diagnostics.retirements++;
    if (wasAsteroid) asteroidDirty = true;
  }

  function retire(entityId, generation = null) {
    ensureAlive();
    const slot = byId.get(entityId);
    if (slot === undefined) return false;
    if (generation !== null && world.sourceGenerations[slot] !== (generation >>> 0)) return false;
    retireSlot(slot);
    return true;
  }

  function assertRecordSlot(record) {
    const slot = byId.get(sourceEntityId(record));
    if (slot === undefined || world.alive[slot] !== 1
      || world.sourceGenerations[slot] !== sourceGeneration(record)) {
      throw new Error(`PresentationWorld record identity mismatch for entity ${sourceEntityId(record)}`);
    }
    const revision = sourceRevision(record);
    if (revision < world.revisions[slot]) {
      throw new Error(`PresentationWorld record revision moved backwards for entity ${sourceEntityId(record)}`);
    }
    return slot;
  }

  function applyTransform(record, entity = null) {
    ensureAlive();
    const slot = assertRecordSlot(record);
    const changed = writePoseValues(slot, record);
    refreshMetadata(slot, entity);
    world.revisions[slot] = sourceRevision(record);
    world.visualRevisions[slot] = Number.isSafeInteger(record && record.visualRevision)
      ? record.visualRevision >>> 0
      : world.visualRevisions[slot];
    if (changed) {
      world.dirtyMasks[slot] |= PRESENTATION_DIRTY.TRANSFORM;
      if (typeNames[world.typeCodes[slot]] === 'asteroid') asteroidDirty = true;
    }
    return slot;
  }

  function applyVisual(record, entity = null) {
    const slot = applyTransform(record, entity);
    world.visualRevisions[slot] = Number.isSafeInteger(record && record.visualRevision)
      ? record.visualRevision >>> 0
      : world.visualRevisions[slot];
    world.dirtyMasks[slot] |= PRESENTATION_DIRTY.VISUAL;
    return slot;
  }

  function bindMesh(handle, mesh, entity = null, visualRadius = null) {
    ensureAlive();
    const slot = slotForHandle(handle);
    if (slot < 0 || !mesh) return false;
    if (world.meshRefs[slot] !== mesh) {
      if (!world.meshRefs[slot]) boundCount++;
      world.meshRefs[slot] = mesh;
      world.dirtyMasks[slot] |= PRESENTATION_DIRTY.BINDING | PRESENTATION_DIRTY.TRANSFORM
        | PRESENTATION_DIRTY.VISIBILITY;
      diagnostics.bound = boundCount;
    }
    refreshMetadata(slot, entity, visualRadius);
    return true;
  }

  function unbindMesh(source, mesh = null) {
    ensureAlive();
    const slot = typeof source === 'object' ? slotForHandle(source) : byId.get(source);
    if (slot === undefined || slot < 0 || !world.meshRefs[slot]
      || mesh && world.meshRefs[slot] !== mesh) return false;
    world.meshRefs[slot] = null;
    world.visible[slot] = 0;
    world.dirtyMasks[slot] |= PRESENTATION_DIRTY.BINDING | PRESENTATION_DIRTY.VISIBILITY;
    boundCount = Math.max(0, boundCount - 1);
    diagnostics.bound = boundCount;
    return true;
  }

  function refreshVisibleEntity(slot, entity, visualRadius = null) {
    if (slot < 0 || slot >= world.capacity || world.alive[slot] !== 1 || !entity) return false;
    const changed = writeEntityPose(slot, entity);
    refreshMetadata(slot, entity, visualRadius);
    if (changed) {
      world.dirtyMasks[slot] |= PRESENTATION_DIRTY.TRANSFORM;
      if (typeNames[world.typeCodes[slot]] === 'asteroid') asteroidDirty = true;
    }
    return changed;
  }

  function clear() {
    ensureAlive();
    while (activeCount > 0) retireSlot(world.activeSlots[activeCount - 1]);
    gridColumns.clear();
    specialCount = 0;
    boundCount = 0;
    maxRadius = 0;
    asteroidDirty = true;
    diagnostics.active = 0;
    diagnostics.bound = 0;
    diagnostics.free = freeCount;
    diagnostics.maxRadius = 0;
    return true;
  }

  function rebuildFromEntities(entities, generationForEntity = null) {
    ensureAlive();
    if (!Array.isArray(entities)) throw new TypeError('PresentationWorld rebuild requires an entity array');
    clear();
    for (const entity of entities) {
      if (!entity || entity.alive === false) continue;
      const generation = typeof generationForEntity === 'function'
        ? generationForEntity(entity)
        : 0;
      allocateEntity(entity, generation);
    }
    diagnostics.rebuilds++;
    return true;
  }

  function collectColumnBounds(column, minCellZ, maxCellZ, target) {
    const span = maxCellZ - minCellZ + 1;
    if (span > column.size * 2) {
      for (const [cz, head] of column) {
        if (cz < minCellZ || cz > maxCellZ) continue;
        for (let slot = head; slot >= 0; slot = world.cellNext[slot]) target.push(slot);
      }
      return;
    }
    for (let cz = minCellZ; cz <= maxCellZ; cz++) {
      const head = column.get(cz);
      if (head === undefined) continue;
      for (let slot = head; slot >= 0; slot = world.cellNext[slot]) target.push(slot);
    }
  }

  function collectSpatialBounds(minX, maxX, minZ, maxZ, target) {
    if (!Array.isArray(target)) throw new TypeError('PresentationWorld candidate target must be an array');
    const minCellX = Math.floor(finite(minX) / cellSize);
    const maxCellX = Math.floor(finite(maxX) / cellSize);
    const minCellZ = Math.floor(finite(minZ) / cellSize);
    const maxCellZ = Math.floor(finite(maxZ) / cellSize);
    const span = maxCellX - minCellX + 1;
    if (span > gridColumns.size * 2) {
      for (const [cx, column] of gridColumns) {
        if (cx < minCellX || cx > maxCellX) continue;
        collectColumnBounds(column, minCellZ, maxCellZ, target);
      }
    } else {
      for (let cx = minCellX; cx <= maxCellX; cx++) {
        const column = gridColumns.get(cx);
        if (column) collectColumnBounds(column, minCellZ, maxCellZ, target);
      }
    }
    return target;
  }

  function collectSpecialSlots(target) {
    if (!Array.isArray(target)) throw new TypeError('PresentationWorld special target must be an array');
    for (let index = 0; index < specialCount; index++) target.push(world.specialSlots[index]);
    return target;
  }

  function setVisibility(slot, generation, value) {
    if (slot < 0 || slot >= world.capacity || world.alive[slot] !== 1
      || world.slotGenerations[slot] !== generation) return false;
    const next = value ? 1 : 0;
    if (world.visible[slot] !== next) {
      world.visible[slot] = next;
      world.dirtyMasks[slot] |= PRESENTATION_DIRTY.VISIBILITY;
    }
    return true;
  }

  function poseHasDelta(slot) {
    return world.prevX[slot] !== world.x[slot] || world.prevY[slot] !== world.y[slot]
      || world.prevZ[slot] !== world.z[slot] || world.prevRot[slot] !== world.rot[slot]
      || world.prevBank[slot] !== world.bank[slot] || world.prevPitch[slot] !== world.pitch[slot];
  }

  function clearDirty(slot, mask = PRESENTATION_DIRTY.ALL) {
    if (slot < 0 || slot >= world.capacity || world.alive[slot] !== 1) return false;
    world.dirtyMasks[slot] &= ~mask;
    return true;
  }

  function isType(slot, name) {
    return slot >= 0 && slot < world.capacity && typeNames[world.typeCodes[slot]] === name;
  }

  function consumeAsteroidDirty() {
    const value = asteroidDirty;
    asteroidDirty = false;
    return value;
  }

  function dispose() {
    if (disposed) return false;
    clear();
    disposed = true;
    return true;
  }

  ensureCapacity(initialCapacity);

  return Object.assign(world, {
    allocateRecord,
    allocateEntity,
    retire,
    applyTransform,
    applyVisual,
    bindMesh,
    unbindMesh,
    refreshVisibleEntity,
    handleForEntityId,
    handleForSlot,
    slotForHandle,
    getSlotForEntityId: (entityId) => byId.get(entityId) ?? INVALID_INDEX,
    isHandleValid: (handle) => slotForHandle(handle) >= 0,
    collectSpatialBounds,
    collectSpecialSlots,
    setVisibility,
    poseHasDelta,
    clearDirty,
    isType,
    consumeAsteroidDirty,
    rebuildFromEntities,
    clear,
    dispose,
    getTypeName: (slot) => typeNames[world.typeCodes[slot]] || '',
    getDiagnostics: () => diagnostics,
  });
}
