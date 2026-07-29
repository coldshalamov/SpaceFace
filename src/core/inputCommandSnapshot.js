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
