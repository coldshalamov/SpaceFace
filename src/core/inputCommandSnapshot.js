// Bounded fixed-tick snapshots of the raw input command surface. Slots and readers are allocated
// once; normal reserve/capture/consume traffic retains no state.input object graphs.

const EMPTY_OBJECT = Object.freeze({});

const ACTION_KEYS = Object.freeze([
  'brake',
  'cruise',
  'tetherFire',
  'tetherCut',
  'reelDelta',
  'chargeThrow',
  'chargeDetonate',
  'scanPulse',
  'autopursuit',
  'deployBeacon',
  'bulletTime',
  'cloakToggle',
  'throwArm',
  'travelBurn',
  'deployMassSeed',
  'deployWell',
  'deployRepulsor',
  'toggleClearingCone',
  'toggleSkimCollector',
  'siteBeam',
  'aimedMine',
]);

const MASSLINE_KEYS = Object.freeze([
  'phase',
  'latch',
  'cut',
  'lineControl',
  'lineLength',
  'reelIn',
  'payOut',
  'orbitDirection',
  'pump',
  'buffered',
  'source',
]);

const TRAVEL_KEYS = Object.freeze([
  'state',
  'cap',
  'ceiling',
  'rampMult',
  'spoolT',
  'cooldownT',
  'engagedT',
  'breakReason',
]);

const AXIS_KEYS = Object.freeze([
  'moveX',
  'moveZ',
  'turnIntent',
  'aimWorldX',
  'aimWorldZ',
  'aimAngle',
  'mouseNdcX',
  'mouseNdcY',
  'pointerScreenX',
  'pointerScreenY',
  'pointerScreenActive',
]);

const AUTO_TARGET_KEYS = Object.freeze([
  'active',
  'screenX',
  'screenY',
  'worldX',
  'worldZ',
  'magnitude',
]);

const ROUTE_KEYS = Object.freeze([
  'active',
  'drawing',
  'cursorX',
  'cursorY',
  'pointIndex',
  'pointCount',
  'firstX',
  'firstZ',
  'lastX',
  'lastZ',
  'inputActivitySequence',
]);

const COMMAND_KEYS = Object.freeze([
  'boost',
  'brake',
  'fire',
  'fireGroup',
  'autoFire',
  'aimIntentActive',
  'deployCountermeasure',
  'tetherMode',
]);

const SLOT_FREE = 0;
const SLOT_RESERVED = 1;
const SLOT_CAPTURED = 2;
const SLOT_CONSUMING = 3;

function finite(value) {
  return Number.isFinite(value) ? value : 0;
}

function commandValue(value) {
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
  return Number.isFinite(value) ? value : null;
}

function createScalarMap(keys, initialValue = null) {
  const map = Object.create(null);
  for (const key of keys) map[key] = initialValue;
  return map;
}

export function createInputCommandSnapshotRecord() {
  return {
    sequence: 0,
    targetTick: 0,
    lifecycleGeneration: 0,
    boost: false,
    brake: false,
    fire: false,
    fireGroup: null,
    autoFire: false,
    aimIntentActive: false,
    deployCountermeasure: false,
    tetherMode: null,
    axes: createScalarMap(AXIS_KEYS, 0),
    actions: createScalarMap(ACTION_KEYS, false),
    massline: createScalarMap(MASSLINE_KEYS),
    travelDrive: createScalarMap(TRAVEL_KEYS),
    autoTarget: createScalarMap(AUTO_TARGET_KEYS, 0),
    route: createScalarMap(ROUTE_KEYS, 0),
  };
}

function requireLease(slot, token) {
  if (slot.status !== SLOT_CONSUMING || token !== slot.activeLease) {
    throw new Error('InputCommandSnapshot lease is no longer active');
  }
  return slot.data;
}

function copyRecord(target, source) {
  if (!target || typeof target !== 'object') {
    throw new TypeError('InputCommandSnapshot reader requires a caller-owned record');
  }
  target.sequence = source.sequence;
  target.targetTick = source.targetTick;
  target.lifecycleGeneration = source.lifecycleGeneration;
  for (const key of COMMAND_KEYS) target[key] = source[key];
  for (const key of AXIS_KEYS) target.axes[key] = source.axes[key];
  for (const key of ACTION_KEYS) target.actions[key] = source.actions[key];
  for (const key of MASSLINE_KEYS) target.massline[key] = source.massline[key];
  for (const key of TRAVEL_KEYS) target.travelDrive[key] = source.travelDrive[key];
  for (const key of AUTO_TARGET_KEYS) target.autoTarget[key] = source.autoTarget[key];
  for (const key of ROUTE_KEYS) target.route[key] = source.route[key];
  return target;
}

function createSlot() {
  const slot = {
    status: SLOT_FREE,
    priorTargetTick: 0,
    activeLease: 0,
    data: createInputCommandSnapshotRecord(),
    reader: null,
  };
  slot.reader = Object.freeze({
    copyTo(token, target) {
      return copyRecord(target, requireLease(slot, token));
    },
    read(token, group, key) {
      const data = requireLease(slot, token);
      if (group === 'metadata' || group === 'command') return data[key];
      const values = data[group];
      return values && typeof values === 'object' ? values[key] : undefined;
    },
  });
  return slot;
}

function copyInput(slot, input) {
  const data = slot.data;
  const source = input && typeof input === 'object' ? input : EMPTY_OBJECT;
  const aimWorld = source.aimWorld || EMPTY_OBJECT;
  const mouseNdc = source.mouseNdc || EMPTY_OBJECT;
  const pointer = source.pointerScreen || EMPTY_OBJECT;
  const actions = source.actions || EMPTY_OBJECT;
  const massline = actions.massline || EMPTY_OBJECT;
  const travel = source.travelDrive || EMPTY_OBJECT;
  const autoTarget = source.autoTargetVector || EMPTY_OBJECT;
  const route = source.autoTargetPath || EMPTY_OBJECT;
  const points = Array.isArray(route.points) ? route.points : null;
  const first = points && points.length ? points[0] : null;
  const last = points && points.length ? points[points.length - 1] : null;

  data.boost = source.boost === true;
  data.brake = source.brake === true;
  data.fire = source.fire === true;
  data.fireGroup = commandValue(source.fireGroup);
  data.autoFire = source.autoFire === true;
  data.aimIntentActive = source.aimIntentActive === true;
  data.deployCountermeasure = source.deployCountermeasure === true;
  data.tetherMode = commandValue(source.tetherMode);

  data.axes.moveX = finite(source.moveX);
  data.axes.moveZ = finite(source.moveZ);
  data.axes.turnIntent = finite(source.turnIntent);
  data.axes.aimWorldX = finite(aimWorld.x);
  data.axes.aimWorldZ = finite(aimWorld.z);
  data.axes.aimAngle = finite(source.aimAngle);
  data.axes.mouseNdcX = finite(mouseNdc.x);
  data.axes.mouseNdcY = finite(mouseNdc.y);
  data.axes.pointerScreenX = finite(pointer.x);
  data.axes.pointerScreenY = finite(pointer.y);
  data.axes.pointerScreenActive = pointer.active === true;

  for (const key of ACTION_KEYS) data.actions[key] = commandValue(actions[key]);
  for (const key of MASSLINE_KEYS) data.massline[key] = commandValue(massline[key]);
  for (const key of TRAVEL_KEYS) data.travelDrive[key] = commandValue(travel[key]);

  data.autoTarget.active = autoTarget.active === true;
  data.autoTarget.screenX = finite(autoTarget.screenX);
  data.autoTarget.screenY = finite(autoTarget.screenY);
  data.autoTarget.worldX = finite(autoTarget.worldX);
  data.autoTarget.worldZ = finite(autoTarget.worldZ);
  data.autoTarget.magnitude = finite(autoTarget.magnitude);

  // The variable-length route remains owned by input.js. The snapshot carries a bounded descriptor,
  // not a reference to its point array; a later transport can add an explicit route-revision channel
  // without introducing per-tick path cloning here.
  data.route.active = route.active === true;
  data.route.drawing = route.drawing === true;
  data.route.cursorX = finite(route.cursorX);
  data.route.cursorY = finite(route.cursorY);
  data.route.pointIndex = Number.isSafeInteger(route.pointIndex) ? route.pointIndex : 0;
  data.route.pointCount = points ? points.length : 0;
  data.route.firstX = finite(first && first.x);
  data.route.firstZ = finite(first && first.z);
  data.route.lastX = finite(last && last.x);
  data.route.lastZ = finite(last && last.z);
  data.route.inputActivitySequence = Number.isSafeInteger(source._activitySeq)
    ? source._activitySeq
    : 0;
}

/**
 * Project a captured input snapshot record back into the schema-bounded frame.input surface the
 * deterministic lab tape driver consumes (moveX/moveZ/turnIntent/boost/fire/aimAngle/reelDelta + the
 * massline grammar fields). Authored massline fields win when the caller supplies them.
 */
export function projectInputCommandRecord(data, keys = null, authored = null) {
  if (!data || typeof data !== 'object') return { moveX: 0, moveZ: 0, turnIntent: 0 };
  const axes = data.axes || EMPTY_OBJECT;
  const actions = data.actions || EMPTY_OBJECT;
  const massline = data.massline || EMPTY_OBJECT;
  const out = {
    moveX: finite(axes.moveX),
    moveZ: finite(axes.moveZ),
    turnIntent: finite(axes.turnIntent),
    boost: data.boost === true,
    fire: data.fire === true,
    reelDelta: finite(massline.reelDelta, finite(actions.reelDelta, 0)),
  };
  if (authored && typeof authored === 'object') {
    if (Number.isFinite(authored.aimAngle)) out.aimAngle = Number(authored.aimAngle);
    if (typeof authored.masslineHeld === 'boolean') out.masslineHeld = authored.masslineHeld;
    if (Number.isFinite(authored.lineLength)) out.lineLength = Number(authored.lineLength);
    if (Number.isFinite(authored.orbitDirection)) out.orbitDirection = Number(authored.orbitDirection);
  }
  return out;
}

/**
 * Bounded fixed-tick history of input command records for replay (PQ-160.00).
 *
 * One reused slot per tick in a ring: capacity = windowSeconds * tickRate (30 s at 60 Hz = 1800).
 * Records are copied into caller-owned slot storage — no state.input object graph is retained.
 * `toTape()` reconstructs the runner-consumed { events, frames } tape for deterministic replay.
 */
export function createInputCommandHistory(options = {}) {
  const tickRate = Number.isFinite(options.tickRate) && options.tickRate > 0
    ? options.tickRate
    : 60;
  const seconds = Number.isFinite(options.seconds) && options.seconds > 0 ? options.seconds : 30;
  const capacity = Math.max(1, Math.floor(
    Number.isFinite(options.capacity) && options.capacity > 0
      ? options.capacity
      : Math.round(seconds * tickRate),
  ));
  const slots = Array.from({ length: capacity }, () => ({
    tick: -1,
    sequence: 0,
    lifecycleGeneration: 0,
    data: createInputCommandSnapshotRecord(),
    keys: Object.create(null),
    events: [],
    authored: null,
  }));
  let write = 0;
  let size = 0;
  let recorded = 0;
  let overwritten = 0;
  let firstTick = -1;
  let lastTick = -1;

  function record(tick, input, meta = {}) {
    const t = Number.isFinite(tick) ? Math.max(0, Math.floor(tick)) : 0;
    if (size >= capacity) overwritten += 1;
    const slot = slots[write];
    slot.tick = t;
    slot.sequence = Number.isSafeInteger(meta.sequence) ? meta.sequence : (recorded + 1);
    slot.lifecycleGeneration = Number.isSafeInteger(meta.lifecycleGeneration)
      && meta.lifecycleGeneration >= 0
      ? meta.lifecycleGeneration
      : 0;
    copyInput({ data: slot.data }, input);
    const keySource = meta.keys && typeof meta.keys === 'object' ? meta.keys : null;
    slot.keys = Object.create(null);
    if (keySource) {
      for (const key of Object.keys(keySource)) {
        if (keySource[key]) slot.keys[key] = true;
      }
    }
    slot.events = Array.isArray(meta.events)
      ? meta.events.map((ev) => (ev && typeof ev === 'object' ? { ...ev } : ev))
      : [];
    slot.authored = meta.authored && typeof meta.authored === 'object'
      ? { ...meta.authored }
      : null;
    write = (write + 1) % capacity;
    if (size < capacity) size += 1;
    recorded += 1;
    firstTick = firstTick < 0 ? t : firstTick;
    lastTick = t;
    return t;
  }

  function slotAt(offsetFromNewest) {
    return slots[(write - 1 - offsetFromNewest + capacity * 2) % capacity];
  }

  function read(tick) {
    const t = Number.isFinite(tick) ? Math.floor(tick) : -1;
    for (let i = 0; i < size; i++) {
      const slot = slotAt(i);
      if (slot.tick === t) return slot;
    }
    return null;
  }

  function newest() {
    return size > 0 ? slotAt(0) : null;
  }

  function oldest() {
    return size > 0 ? slotAt(size - 1) : null;
  }

  function forEach(fn) {
    if (typeof fn !== 'function') return;
    for (let i = 0; i < size; i++) {
      const slot = slotAt(i);
      fn(slot, slot.tick);
    }
  }

  function toFrames() {
    const frames = [];
    forEach((slot) => {
      frames.push({ tick: slot.tick, input: projectInputCommandRecord(slot.data, slot.keys, slot.authored) });
    });
    frames.sort((a, b) => a.tick - b.tick);
    return frames;
  }

  function toEvents() {
    const events = [];
    forEach((slot) => {
      if (!slot.events.length) return;
      for (const ev of slot.events) events.push({ ...ev, tick: slot.tick });
    });
    events.sort((a, b) => (a.tick - b.tick) || ((a.sequence | 0) - (b.sequence | 0)));
    return events;
  }

  function toTape() {
    return { events: toEvents(), frames: toFrames() };
  }

  function clear() {
    for (const slot of slots) {
      slot.tick = -1;
      slot.events = [];
      slot.authored = null;
      slot.keys = Object.create(null);
    }
    write = 0;
    size = 0;
    recorded = 0;
    overwritten = 0;
    firstTick = -1;
    lastTick = -1;
  }

  return {
    capacity,
    tickRate,
    windowSeconds: capacity / tickRate,
    record,
    read,
    newest,
    oldest,
    forEach,
    toFrames,
    toEvents,
    toTape,
    clear,
    get size() { return size; },
    get recorded() { return recorded; },
    get overwritten() { return overwritten; },
    get firstTick() { return firstTick; },
    get lastTick() { return lastTick; },
    get windowTicks() { return size > 0 ? Math.max(0, lastTick - firstTick) : 0; },
    diagnostics() {
      return {
        capacity,
        tickRate,
        windowSeconds: capacity / tickRate,
        size,
        recorded,
        overwritten,
        firstTick,
        lastTick,
        windowTicks: size > 0 ? Math.max(0, lastTick - firstTick) : 0,
      };
    },
  };
}

export function createInputCommandSnapshotQueue(capacity = 8) {
  const size = Math.max(1, Math.floor(Number.isFinite(capacity) ? capacity : 8));
  const slots = Array.from({ length: size }, () => createSlot());
  let read = 0;
  let write = 0;
  let count = 0;
  let leaseSequence = 0;
  let lastReservedSequence = 0;
  let lastReservedTargetTick = 0;
  let lastConsumedSequence = 0;
  let reserveCount = 0;
  let capturedCount = 0;
  let consumedCount = 0;
  let cancelledCount = 0;
  let overflowCount = 0;
  let orderErrorCount = 0;
  let consumerErrorCount = 0;

  function latestSlot(sequence) {
    if (count <= 0) return null;
    const slot = slots[(write - 1 + size) % size];
    return slot.data.sequence === sequence ? slot : null;
  }

  function cancelLatest(sequence) {
    const slot = latestSlot(sequence);
    if (!slot || slot.status === SLOT_CONSUMING) return false;
    write = (write - 1 + size) % size;
    count--;
    lastReservedSequence--;
    lastReservedTargetTick = slot.priorTargetTick;
    slot.status = SLOT_FREE;
    cancelledCount++;
    return true;
  }

  function reserve(sequence, targetTick, lifecycleGeneration) {
    if (count >= size) {
      overflowCount++;
      throw new Error(`InputCommandSnapshot queue overflow (${size})`);
    }
    if (!Number.isSafeInteger(sequence) || sequence !== lastReservedSequence + 1) {
      orderErrorCount++;
      throw new Error(`InputCommandSnapshot sequence is out of order (${sequence})`);
    }
    if (!Number.isSafeInteger(targetTick) || targetTick < 0) {
      orderErrorCount++;
      throw new Error(`InputCommandSnapshot target tick is invalid (${targetTick})`);
    }
    const slot = slots[write];
    slot.status = SLOT_RESERVED;
    slot.priorTargetTick = lastReservedTargetTick;
    slot.data.sequence = sequence;
    slot.data.targetTick = targetTick;
    slot.data.lifecycleGeneration = Number.isSafeInteger(lifecycleGeneration)
      && lifecycleGeneration >= 0
      ? lifecycleGeneration
      : 0;
    write = (write + 1) % size;
    count++;
    lastReservedSequence = sequence;
    lastReservedTargetTick = targetTick;
    reserveCount++;
    return sequence;
  }

  function capture(sequence, input, actualTick = null) {
    const slot = latestSlot(sequence);
    if (!slot || slot.status !== SLOT_RESERVED) {
      orderErrorCount++;
      throw new Error(`InputCommandSnapshot ${sequence} is not reserved`);
    }
    if (actualTick != null && actualTick !== slot.data.targetTick) {
      orderErrorCount++;
      throw new Error(
        `InputCommandSnapshot target mismatch (${actualTick} != ${slot.data.targetTick})`,
      );
    }
    copyInput(slot, input);
    slot.status = SLOT_CAPTURED;
    capturedCount++;
    return sequence;
  }

  function publish(sequence, targetTick, lifecycleGeneration, input) {
    reserve(sequence, targetTick, lifecycleGeneration);
    try {
      return capture(sequence, input, targetTick);
    } catch (error) {
      cancelLatest(sequence);
      throw error;
    }
  }

  function consume(sequence, consumer = null) {
    if (count <= 0) {
      orderErrorCount++;
      throw new Error(`InputCommandSnapshot ${sequence} is not pending`);
    }
    const slot = slots[read];
    if (slot.data.sequence !== sequence || slot.status !== SLOT_CAPTURED) {
      orderErrorCount++;
      throw new Error(
        `InputCommandSnapshot order mismatch (${sequence} != ${slot.data.sequence})`,
      );
    }

    slot.status = SLOT_CONSUMING;
    slot.activeLease = ++leaseSequence;
    let consumerError = null;
    try {
      if (typeof consumer === 'function') consumer(slot.reader, slot.activeLease);
    } catch (error) {
      consumerError = error;
      consumerErrorCount++;
    } finally {
      slot.activeLease = 0;
      slot.status = SLOT_FREE;
      read = (read + 1) % size;
      count--;
      lastConsumedSequence = sequence;
      consumedCount++;
    }
    return consumerError;
  }

  return {
    capacity: size,
    canReserve: () => count < size,
    getPendingCount: () => count,
    reserve,
    capture,
    publish,
    consume,
    cancel: cancelLatest,
    getDiagnostics() {
      return {
        capacity: size,
        pending: count,
        lastReservedSequence,
        lastReservedTargetTick,
        lastConsumedSequence,
        reserveCount,
        capturedCount,
        consumedCount,
        cancelledCount,
        overflowCount,
        orderErrorCount,
        consumerErrorCount,
      };
    },
  };
}
