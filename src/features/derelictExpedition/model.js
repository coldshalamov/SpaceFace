/**
 * BLACKBOX RUNS persistent rules. This module has no engine, bus, wall clock,
 * renderer or economy dependency. Its record is owned by derelictExpedition.
 *
 * A cargo body may become suspended only at an intentional unload/save boundary.
 * An unexplained missing live body becomes a tombstone. That distinction is what
 * prevents leaving the sector or loading a save from minting another blackbox.
 */

export const EXPEDITION_SCHEMA_VERSION = 1;
export const EXPEDITION_LIMITS = Object.freeze({
  maxBodies: 64,
  maxCoordinate: 1e8,
  maxSpeed: 600,
  maxAngularSpeed: 24,
  maxHull: 1e9,
  maxElapsedS: 1e9,
  receiverDwellS: 2.5,
  maxDwellSampleS: 0.25,
  receiverRadius: 26,
  receiverMaxSpeed: 10,
  pressurePerSecond: 0.11,
  maxPressure: 100,
});

const OBSTACLES = Object.freeze(['shutter', 'vent', 'relay']);
const CARGO = Object.freeze(['blackbox', 'core']);
const LIFECYCLES = new Set(['unspawned', 'live', 'suspended', 'lost', 'delivered']);
const CARGO_STATES = new Set(['locked', 'available', 'recovered', 'delivered', 'lost']);
const METHODS = new Set(['tow', 'pull', 'shove', 'pin', 'rig', 'bomb', 'gun', 'destroyed', 'displaced', 'timed', 'bypass']);
const OBSTACLE_PRESSURE = Object.freeze({ shutter: 7, vent: 10, relay: 13 });
const RECOVERY_PRESSURE = Object.freeze({ blackbox: 12, core: 18 });
const DEFAULT_REWARDS = Object.freeze({ blackbox: 900, core: 1400 });
const TERMINAL_BODY = new Set(['lost', 'delivered']);
const TERMINAL_CARGO = new Set(['lost', 'delivered']);

const own = (object, key) => !!object && Object.prototype.hasOwnProperty.call(object, key);
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : null;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const bounded = (value, min, max, fallback = min) => Math.max(min, Math.min(max, finite(value, fallback)));
const token = (value, fallback) => typeof value === 'string' && !['__proto__', 'constructor', 'prototype'].includes(value)
  && /^[a-zA-Z0-9_:.\/-]{1,128}$/.test(value) ? value : fallback;
const planar = (value, fallback = { x: 0, z: 0 }, bound = EXPEDITION_LIMITS.maxCoordinate) => ({
  x: bounded(value?.x, -bound, bound, fallback.x),
  z: bounded(value?.z, -bound, bound, fallback.z),
});
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const validPoint = (p) => Number.isFinite(p?.x) && Number.isFinite(p?.z);
const rewardId = (record, kind) => `${record.siteId}:${kind}`;
const clonePoint = (p) => ({ x: p.x, z: p.z });

function bodyTemplate(spec) {
  const hull = bounded(spec.hull, 1, EXPEDITION_LIMITS.maxHull, 80);
  return {
    key: spec.key,
    lifecycle: 'unspawned',
    entityId: null,
    pos: planar(spec.position || spec.pos),
    vel: { x: 0, z: 0 },
    rot: bounded(spec.rot, -Math.PI * 2, Math.PI * 2),
    angVel: 0,
    hull,
    hullMax: hull,
    integrity: 1,
  };
}

function cargoTemplate(kind, layout) {
  const spec = Array.isArray(layout.loot) ? layout.loot.find((row) => row.id === kind) : null;
  return {
    kind,
    bodyKey: token(spec?.bodyKey || spec?.key, kind),
    status: 'locked',
    sourcePos: planar(spec?.position || layout.bodies?.find((body) => body.key === kind)?.position),
    recoveryRadius: bounded(spec?.recoveryRadius, 4, 80, 22),
    baseReward: Math.floor(bounded(spec?.baseReward, 0, 100000, DEFAULT_REWARDS[kind])),
    dwellS: 0,
    recoveredAt: null,
    deliveredAt: null,
    deliveredIntegrity: 0,
    lostReason: null,
  };
}

/** Construct one finite site. Do not call this to replace an existing record. */
export function createExpeditionRecord({ layout, seed = layout?.seed ?? 0, siteId = layout?.id || 'blackbox_vesta', sectorId = 'sector_vesta_forge', now = 0 } = {}) {
  if (!object(layout) || !Array.isArray(layout.bodies)) throw new TypeError('BLACKBOX RUNS requires an authored layout');
  if (layout.bodies.length > EXPEDITION_LIMITS.maxBodies) throw new RangeError('Expedition body budget exceeded');
  const bodies = {};
  for (const spec of layout.bodies) {
    const key = token(spec?.key, null);
    if (!key || own(bodies, key)) throw new TypeError('Expedition body keys must be unique plain IDs');
    bodies[key] = bodyTemplate(spec);
  }
  const cargo = { blackbox: cargoTemplate('blackbox', layout), core: cargoTemplate('core', layout) };
  for (const item of Object.values(cargo)) {
    if (!own(bodies, item.bodyKey)) throw new TypeError(`Missing physical cargo body: ${item.bodyKey}`);
  }
  return {
    schemaVersion: EXPEDITION_SCHEMA_VERSION,
    siteId: token(siteId, 'blackbox_vesta'),
    sectorId: token(sectorId, 'sector_vesta_forge'),
    seed: (finite(seed) >>> 0),
    variant: token(layout.variant?.id || layout.variant, 'split_keel'),
    origin: planar(layout.origin),
    rotation: bounded(layout.rotation, -Math.PI * 2, Math.PI * 2),
    createdAt: bounded(now, 0, EXPEDITION_LIMITS.maxElapsedS),
    accepted: false,
    phase: 'offered',
    elapsedS: 0,
    pressure: 0,
    pressureStage: 0,
    primaryComplete: false,
    abandoned: false,
    visitCount: 0,
    obstacles: Object.fromEntries(OBSTACLES.map((key) => [key, { opened: false, method: null, openedAt: null }])),
    bodies,
    cargo,
    receiver: {
      position: planar(layout.receiver?.position || layout.receiver?.pos),
      radius: bounded(layout.receiver?.radius, 8, 80, EXPEDITION_LIMITS.receiverRadius),
      maxSpeed: bounded(layout.receiver?.maxSpeed, 0.5, 25, EXPEDITION_LIMITS.receiverMaxSpeed),
    },
    rewards: {},
  };
}

/** Deliberate opt-in only. Repeated encounters cannot restart a site. */
export function acceptExpedition(record) {
  if (!record || record.accepted || isExpeditionTerminal(record)) return false;
  record.accepted = true;
  record.abandoned = false;
  record.visitCount = 1;
  record.phase = 'scouting';
  return true;
}

export function abandonExpedition(record) {
  if (!record?.accepted || record.abandoned || isExpeditionTerminal(record)) return false;
  record.abandoned = true;
  record.phase = 'abandoned';
  for (const item of Object.values(record.cargo)) item.dwellS = 0;
  return true;
}

export function resumeExpedition(record) {
  if (!record?.accepted || !record.abandoned || isExpeditionTerminal(record)) return false;
  record.abandoned = false;
  record.visitCount = Math.min(1000000, record.visitCount + 1);
  derivePhase(record);
  return true;
}

export function isExpeditionTerminal(record) {
  return !!record?.accepted && CARGO.every((kind) => TERMINAL_CARGO.has(record.cargo?.[kind]?.status));
}

function readBodySnapshot(body, snapshot) {
  if (!object(snapshot) || snapshot.alive === false || !(finite(snapshot.hull, body.hull) > 0)
      || !validPoint(snapshot.pos || snapshot.position)) return null;
  const hull = bounded(snapshot.hull, 0, body.hullMax, body.hull);
  return {
    pos: planar(snapshot.pos || snapshot.position, body.pos),
    vel: planar(snapshot.vel || snapshot.velocity, body.vel, EXPEDITION_LIMITS.maxSpeed),
    rot: bounded(snapshot.rot ?? snapshot.rotation, -Math.PI * 2, Math.PI * 2, body.rot),
    angVel: bounded(snapshot.angVel ?? snapshot.angularVelocity, -EXPEDITION_LIMITS.maxAngularSpeed, EXPEDITION_LIMITS.maxAngularSpeed, body.angVel),
    hull,
    integrity: bounded(snapshot.integrity, 0, 1, hull / body.hullMax),
  };
}

function markCargoLost(record, bodyKey, reason) {
  for (const kind of CARGO) {
    const item = record.cargo[kind];
    if (item.bodyKey !== bodyKey || TERMINAL_CARGO.has(item.status)) continue;
    item.status = 'lost';
    item.dwellS = 0;
    item.lostReason = token(reason, 'missing_body');
  }
}

/** Record loss as a terminal fact before removing or retiring the native entity. */
export function loseExpeditionBody(record, key, reason = 'destroyed') {
  const body = record?.bodies?.[key];
  if (!body || TERMINAL_BODY.has(body.lifecycle)) return false;
  body.lifecycle = 'lost';
  body.entityId = null;
  body.hull = 0;
  body.integrity = 0;
  markCargoLost(record, key, reason);
  derivePhase(record);
  return true;
}

/**
 * Called only after spawnEntity/adoption succeeds. Runtime IDs are bookkeeping,
 * never durable identity; the site ID + key identifies the physical body.
 */
export function markBodyMaterialized(record, key, snapshot) {
  const body = record?.bodies?.[key];
  if (!body || TERMINAL_BODY.has(body.lifecycle)) return false;
  const next = readBodySnapshot(body, snapshot);
  if (!next) return false;
  const incomingId = snapshot.entityId ?? snapshot.id;
  if (body.lifecycle === 'live' && body.entityId != null && Number.isSafeInteger(incomingId) && body.entityId !== incomingId) return false;
  Object.assign(body, next);
  body.lifecycle = 'live';
  body.entityId = Number.isSafeInteger(snapshot.entityId) && snapshot.entityId >= 0 ? snapshot.entityId
    : Number.isSafeInteger(snapshot.id) && snapshot.id >= 0 ? snapshot.id : null;
  return true;
}

/**
 * null means the adapter looked for a previously live body and did not find it.
 * A suspended/unspawned body is intentionally absent and cannot be lost by a
 * world lookup performed before the sector materializer has run.
 */
export function observeExpeditionBody(record, key, snapshot) {
  const body = record?.bodies?.[key];
  if (!body || body.lifecycle !== 'live') return false;
  const next = readBodySnapshot(body, snapshot);
  if (!next) return loseExpeditionBody(record, key, snapshot?.alive === false || snapshot?.hull <= 0 ? 'destroyed' : 'missing_body');
  Object.assign(body, next);
  return true;
}

/**
 * Capture BEFORE intentional sector unload. Every live body must be accounted
 * for; an omitted/missing snapshot is a loss, not permission to respawn it.
 */
export function suspendExpedition(record, snapshots = {}) {
  if (!record) return false;
  for (const key of Object.keys(record.bodies)) {
    const body = record.bodies[key];
    if (body.lifecycle !== 'live') continue;
    observeExpeditionBody(record, key, own(snapshots, key) ? snapshots[key] : null);
    if (body.lifecycle === 'live') {
      body.lifecycle = 'suspended';
      body.entityId = null;
    }
  }
  for (const item of Object.values(record.cargo)) item.dwellS = 0;
  return true;
}

function derivePhase(record) {
  if (!record.accepted) { record.phase = 'offered'; return; }
  record.primaryComplete = record.cargo.blackbox.status === 'delivered';
  if (isExpeditionTerminal(record)) {
    record.phase = record.primaryComplete ? 'complete' : 'failed';
    record.abandoned = false;
  } else if (record.abandoned) record.phase = 'abandoned';
  else if (record.primaryComplete) record.phase = 'extracted';
  else if (CARGO.some((kind) => record.cargo[kind].status === 'recovered')) record.phase = 'returning';
  else if (record.obstacles.shutter.opened || record.cargo.blackbox.status === 'lost') record.phase = 'recovering';
  else record.phase = 'scouting';
}

function addPressure(record, amount) {
  record.pressure = bounded(record.pressure + amount, 0, EXPEDITION_LIMITS.maxPressure);
}

function unlockCargo(record) {
  const access = record.obstacles.shutter.opened && record.obstacles.vent.opened;
  if (access && record.cargo.blackbox.status === 'locked') record.cargo.blackbox.status = 'available';
  if (access && record.obstacles.relay.opened && record.cargo.core.status === 'locked') record.cargo.core.status = 'available';
}

/** A stable warning schedule; callers supply forces through physicsAuthority. */
export function expeditionPressureStage(pressure) {
  return pressure >= 80 ? 3 : pressure >= 50 ? 2 : pressure >= 25 ? 1 : 0;
}

function makeReward(record, kind) {
  const item = record.cargo[kind];
  const amount = Math.floor(item.baseReward * (0.35 + 0.65 * item.deliveredIntegrity));
  return {
    id: rewardId(record, kind),
    kind,
    status: 'pending',
    amount,
    reason: `blackbox_runs:${record.siteId}:${kind}`,
    deliveredAt: item.deliveredAt,
    committedAt: null,
  };
}

function publicReward(row) {
  return { id: row.id, kind: row.kind, amount: row.amount, reason: row.reason };
}

/** Repeated queries return one pending intent, never mint another claim. */
export function pendingExpeditionRewards(record) {
  return CARGO.map((kind) => record?.rewards?.[rewardId(record, kind)])
    .filter((row) => row?.status === 'pending').map(publicReward);
}

/**
 * Mark BEFORE a synchronous economy:grantCredits emit. The existing economy
 * owner has no durable transaction ACK, so this is intentionally at-most-once.
 * The enclosing save must capture this ledger and economy together.
 */
export function commitExpeditionReward(record, id) {
  const row = record?.rewards?.[id];
  if (!row || row.status !== 'pending' || record.cargo[row.kind]?.status !== 'delivered') return null;
  row.status = 'committed';
  row.committedAt = record.elapsedS;
  return publicReward(row);
}

/**
 * Advance from measured physical facts. observation is not a player command:
 * only the production adapter may report obstacle/open and body observations.
 * No amount of elapsed time can unlock, recover, deliver, or restore cargo.
 */
export function stepExpedition(record, observation = {}, dt = 0) {
  const previousPhase = record.phase;
  const events = [];
  const elapsed = bounded(dt, 0, EXPEDITION_LIMITS.maxElapsedS);
  if (!record.accepted) return { events, rewardIntents: [], phaseChanged: false };
  if (!isExpeditionTerminal(record)) {
    record.elapsedS = bounded(record.elapsedS + elapsed, 0, EXPEDITION_LIMITS.maxElapsedS);
    addPressure(record, elapsed * EXPEDITION_LIMITS.pressurePerSecond);
  }
  if (observation.present === false || record.abandoned) {
    for (const item of Object.values(record.cargo)) item.dwellS = 0;
  } else if (!isExpeditionTerminal(record)) {
    for (const key of OBSTACLES) {
      const fact = observation.obstacles?.[key];
      if (fact?.opened !== true) continue;
      if (record.obstacles[key].opened) {
        // Passing a working machine proves access, not mechanical shutdown.
        // Later destruction/displacement is stronger physical evidence and may
        // disable its hazard. Upgrade that evidence without reopening the room,
        // charging another pressure increment or emitting a second opening.
        if (['bypass', 'timed'].includes(record.obstacles[key].method)
          && METHODS.has(fact.method) && !['bypass', 'timed'].includes(fact.method)) {
          record.obstacles[key].method = fact.method;
        }
        continue;
      }
      record.obstacles[key] = { opened: true, method: METHODS.has(fact.method) ? fact.method : 'displaced', openedAt: record.elapsedS };
      addPressure(record, OBSTACLE_PRESSURE[key]);
      events.push({ type: 'obstacle_opened', obstacle: key, method: record.obstacles[key].method });
    }
    unlockCargo(record);
    for (const kind of CARGO) {
      const item = record.cargo[kind];
      const body = record.bodies[item.bodyKey];
      if (TERMINAL_CARGO.has(item.status)) continue;
      if (body.lifecycle === 'lost') { markCargoLost(record, item.bodyKey, 'missing_body'); continue; }
      const fact = observation.cargo?.[kind];
      // A synthetic cargo report cannot create custody. Root must materialize and
      // observe a live body through the real entity owner before advancing this.
      if (body.lifecycle !== 'live' || !fact || !validPoint(fact.pos || fact.position)) {
        item.dwellS = 0;
        continue;
      }
      const snapshot = readBodySnapshot(body, fact);
      if (!snapshot) {
        loseExpeditionBody(record, item.bodyKey, 'destroyed');
        events.push({ type: 'cargo_lost', cargo: kind, reason: 'destroyed' });
        continue;
      }
      Object.assign(body, snapshot);
      if (item.status === 'locked') { item.dwellS = 0; continue; }
      if (item.status === 'available' && distance(body.pos, item.sourcePos) >= item.recoveryRadius) {
        item.status = 'recovered';
        item.recoveredAt = record.elapsedS;
        addPressure(record, RECOVERY_PRESSURE[kind]);
        events.push({ type: 'cargo_recovered', cargo: kind });
      }
      const receiver = record.receiver;
      // Require the ship nearby as well as the cargo; NPC drift into the cradle
      // cannot finish an expedition the player never returned from.
      const playerNearby = validPoint(observation.playerPos)
        && distance(observation.playerPos, receiver.position) <= receiver.radius + 90;
      const measuredVelocity = fact.vel || fact.velocity;
      const settling = item.status === 'recovered' && playerNearby && validPoint(measuredVelocity)
        && distance(body.pos, receiver.position) <= receiver.radius
        && Math.hypot(body.vel.x, body.vel.z) <= receiver.maxSpeed
        && body.hull > 0 && body.integrity > 0;
      item.dwellS = settling ? item.dwellS + Math.min(elapsed, EXPEDITION_LIMITS.maxDwellSampleS) : 0;
      if (item.dwellS + 1e-9 < EXPEDITION_LIMITS.receiverDwellS) continue;
      item.status = 'delivered';
      item.dwellS = EXPEDITION_LIMITS.receiverDwellS;
      item.deliveredAt = record.elapsedS;
      item.deliveredIntegrity = body.integrity;
      body.lifecycle = 'delivered';
      body.entityId = null;
      if (!own(record.rewards, rewardId(record, kind))) record.rewards[rewardId(record, kind)] = makeReward(record, kind);
      events.push({ type: 'cargo_delivered', cargo: kind, integrity: item.deliveredIntegrity, rewardId: rewardId(record, kind) });
    }
  }
  const stage = expeditionPressureStage(record.pressure);
  if (stage > record.pressureStage) events.push({ type: 'pressure_stage', stage });
  record.pressureStage = stage;
  derivePhase(record);
  return { events, rewardIntents: pendingExpeditionRewards(record), phaseChanged: previousPhase !== record.phase };
}

/**
 * Reconcile a save against the regenerated authored layout. Unknown IDs are
 * discarded; absent accepted bodies fail closed. A save's live body becomes a
 * suspended snapshot so only the runtime materializer may restore it once.
 */
export function normalizeExpeditionRecord(raw, options = {}) {
  if (!object(raw) || raw.schemaVersion !== EXPEDITION_SCHEMA_VERSION) return null;
  const record = createExpeditionRecord({
    ...options,
    seed: options.seed ?? raw.seed,
    siteId: options.siteId ?? raw.siteId,
    sectorId: options.sectorId ?? raw.sectorId,
    now: raw.createdAt,
  });
  if (raw.siteId !== record.siteId || raw.sectorId !== record.sectorId || (raw.seed >>> 0) !== record.seed) return null;
  record.accepted = raw.accepted === true;
  record.elapsedS = bounded(raw.elapsedS, 0, EXPEDITION_LIMITS.maxElapsedS);
  record.pressure = bounded(raw.pressure, 0, EXPEDITION_LIMITS.maxPressure);
  record.pressureStage = expeditionPressureStage(record.pressure);
  record.abandoned = raw.abandoned === true && record.accepted;
  record.visitCount = Math.floor(bounded(raw.visitCount, record.accepted ? 1 : 0, 1000000));
  for (const key of OBSTACLES) {
    const row = raw.obstacles?.[key];
    if (row?.opened === true) {
      record.obstacles[key] = {
        opened: true,
        method: METHODS.has(row.method) ? row.method : 'displaced',
        openedAt: bounded(row.openedAt, 0, record.elapsedS),
      };
    }
  }
  for (const key of Object.keys(record.bodies)) {
    const body = record.bodies[key];
    const row = object(raw.bodies?.[key]);
    if (!row || !LIFECYCLES.has(row.lifecycle)) {
      if (record.accepted) loseExpeditionBody(record, key, 'missing_save_body');
      continue;
    }
    if (row.lifecycle === 'lost') { loseExpeditionBody(record, key, 'saved_loss'); continue; }
    if (row.lifecycle === 'delivered') {
      // Only a matching delivered cargo record can authorize this tombstone.
      const cargoKind = CARGO.find((kind) => record.cargo[kind].bodyKey === key);
      if (cargoKind && raw.cargo?.[cargoKind]?.status === 'delivered') body.lifecycle = 'delivered';
      else loseExpeditionBody(record, key, 'invalid_delivery');
      continue;
    }
    // A save is durable custody evidence, not a partial observation. Never heal
    // an incomplete/corrupt live snapshot from the authored spawn template.
    const validSavedSnapshot = validPoint(row.pos) && validPoint(row.vel)
      && Number.isFinite(row.hull) && row.hull > 0
      && Number.isFinite(row.integrity) && row.integrity > 0 && row.integrity <= 1
      && Number.isFinite(row.rot) && Number.isFinite(row.angVel);
    const snapshot = validSavedSnapshot ? readBodySnapshot(body, row) : null;
    if (!snapshot) { loseExpeditionBody(record, key, 'invalid_save_body'); continue; }
    Object.assign(body, snapshot);
    body.lifecycle = row.lifecycle === 'live' && options.rehydrate !== false ? 'suspended' : row.lifecycle;
    body.entityId = body.lifecycle === 'live' && Number.isSafeInteger(row.entityId) && row.entityId >= 0 ? row.entityId : null;
  }
  for (const kind of CARGO) {
    const item = record.cargo[kind];
    const body = record.bodies[item.bodyKey];
    const row = object(raw.cargo?.[kind]);
    if (body.lifecycle === 'lost') {
      item.status = 'lost';
      item.lostReason = token(row?.lostReason, 'saved_loss');
    } else if (!row || !CARGO_STATES.has(row.status)) {
      if (record.accepted) loseExpeditionBody(record, item.bodyKey, 'missing_save_cargo');
    } else if (row.status === 'lost') {
      loseExpeditionBody(record, item.bodyKey, row.lostReason || 'saved_loss');
    } else if (row.status === 'delivered' && body.lifecycle === 'delivered') {
      item.status = 'delivered';
      item.dwellS = EXPEDITION_LIMITS.receiverDwellS;
      item.deliveredAt = bounded(row.deliveredAt, 0, record.elapsedS);
      item.deliveredIntegrity = bounded(row.deliveredIntegrity, 0, 1);
      item.recoveredAt = bounded(row.recoveredAt, 0, item.deliveredAt);
    } else if (body.lifecycle === 'delivered') {
      loseExpeditionBody(record, item.bodyKey, 'inconsistent_delivery');
      item.status = 'lost';
      item.lostReason = 'inconsistent_delivery';
    } else {
      item.status = row.status === 'delivered' ? 'lost' : row.status;
      item.dwellS = 0; // Continuous docking evidence is invalidated by a load.
      item.recoveredAt = Number.isFinite(row.recoveredAt) ? bounded(row.recoveredAt, 0, record.elapsedS) : null;
      if (item.status === 'lost') loseExpeditionBody(record, item.bodyKey, 'inconsistent_delivery');
    }
    if (item.status !== 'delivered') continue;
    const id = rewardId(record, kind);
    const savedReward = object(raw.rewards?.[id]);
    const reward = makeReward(record, kind);
    // Missing/invalid settlement evidence is treated as already consumed, never
    // as a fresh payout. Ordinary saves always include the pending/commit row.
    reward.status = savedReward?.id === id && savedReward.kind === kind && savedReward.status === 'pending' ? 'pending' : 'committed';
    reward.committedAt = reward.status === 'committed' ? bounded(savedReward?.committedAt, 0, record.elapsedS, item.deliveredAt) : null;
    record.rewards[id] = reward;
  }
  // A claimed available/recovered state cannot waive the essential access chain.
  // Lost/delivered states remain tombstones even if other save fields disagree.
  for (const kind of CARGO) {
    const item = record.cargo[kind];
    const access = record.obstacles.shutter.opened && record.obstacles.vent.opened
      && (kind === 'blackbox' || record.obstacles.relay.opened);
    if (!TERMINAL_CARGO.has(item.status) && !access) item.status = 'locked';
  }
  unlockCargo(record);
  derivePhase(record);
  return record;
}

/** Whitelisted JSON only: no entities, Maps, closures, renderer state or arrays of events. */
export function serializeExpeditionRecord(record) {
  if (!record || record.schemaVersion !== EXPEDITION_SCHEMA_VERSION) return null;
  const bodies = {};
  for (const key of Object.keys(record.bodies).slice(0, EXPEDITION_LIMITS.maxBodies)) {
    const body = record.bodies[key];
    bodies[key] = {
      key,
      lifecycle: body.lifecycle,
      entityId: body.entityId,
      pos: clonePoint(body.pos), vel: clonePoint(body.vel),
      rot: body.rot, angVel: body.angVel,
      hull: body.hull, hullMax: body.hullMax, integrity: body.integrity,
    };
  }
  const cargo = {};
  for (const kind of CARGO) {
    const item = record.cargo[kind];
    cargo[kind] = {
      kind: item.kind, bodyKey: item.bodyKey, status: item.status, sourcePos: clonePoint(item.sourcePos),
      recoveryRadius: item.recoveryRadius, baseReward: item.baseReward, dwellS: item.dwellS,
      recoveredAt: item.recoveredAt, deliveredAt: item.deliveredAt, deliveredIntegrity: item.deliveredIntegrity,
      lostReason: item.lostReason,
    };
  }
  return {
    schemaVersion: EXPEDITION_SCHEMA_VERSION,
    siteId: record.siteId, sectorId: record.sectorId, seed: record.seed,
    variant: record.variant, origin: clonePoint(record.origin), rotation: record.rotation,
    createdAt: record.createdAt, accepted: record.accepted, phase: record.phase,
    elapsedS: record.elapsedS, pressure: record.pressure, pressureStage: record.pressureStage,
    primaryComplete: record.primaryComplete, abandoned: record.abandoned, visitCount: record.visitCount,
    obstacles: Object.fromEntries(OBSTACLES.map((key) => [key, {
      opened: record.obstacles[key].opened, method: record.obstacles[key].method, openedAt: record.obstacles[key].openedAt,
    }])),
    bodies,
    cargo,
    receiver: { position: clonePoint(record.receiver.position), radius: record.receiver.radius, maxSpeed: record.receiver.maxSpeed },
    rewards: Object.fromEntries(CARGO.map((kind) => record.rewards[rewardId(record, kind)])
      .filter(Boolean).map((row) => [row.id, {
        id: row.id, kind: row.kind, status: row.status, amount: row.amount, reason: row.reason,
        deliveredAt: row.deliveredAt, committedAt: row.committedAt,
      }])),
  };
}
