// SG-02 physics command membrane.
//
// Flight, combat, and gameplay systems may describe forces, torques, and impulses here. Only the
// physics system should consume those commands and mutate body/entity motion. WeakMaps keep transient
// commands and measured telemetry out of saves, replays, and renderer-facing entity graphs.

import { PHYSICS_MATERIALS } from '../data/physicsMaterials.js';

export const PHYSICS_COMMAND_SCHEMA_VERSION = 1;
export const PHYSICS_BODY_SCHEMA_VERSION = 1;
export const PHYSICS_TELEMETRY_SCHEMA_VERSION = 1;
export const PHYSICS_BODY_RESPONSE_LIMITS = Object.freeze({ minScale: 0.25, maxScale: 8 });

const COMMANDS = new WeakMap();
const TELEMETRY = new WeakMap();
// Exceptional native construction failures are process-local, never save authority. Most
// callers need no native-ready protocol; only a failed live replacement closes this gate.
const NATIVE_BODY_FAILURES = new WeakMap();
export function markPhysicsBodyNativeFailure(entity, owner) {
  if (!entity) return null;
  const body=entity.physicsBody;
  const receipt={owner,life:entity.occupantGeneration,body,proxy:body?.collisionProxyManifest,revision:body?.revision};
  NATIVE_BODY_FAILURES.set(entity,receipt);
  return receipt;
}
export function clearPhysicsBodyNativeFailure(entity, owner, receipt) {
  if (entity && receipt?.owner===owner && NATIVE_BODY_FAILURES.get(entity)===receipt) NATIVE_BODY_FAILURES.delete(entity);
}
export function physicsBodyNativeReady(entity) {
  const failure=entity && NATIVE_BODY_FAILURES.get(entity);
  return !failure || failure.life!==entity.occupantGeneration;
}

const AUTHORITY_CACHE = new WeakMap();
const NORMALIZED_BODY_CACHE = new WeakMap();
const RESOLVED_BODY_CACHE = new WeakMap();
// Retained-command bookkeeping lives in side-channel maps so the consumed command object keeps
// exactly its published shape ({schemaVersion, control, impulses, torqueImpulses, bodyResponse})
// for consumers and for key-enumerating diagnostics.
const CONSUMED_COMMANDS = new WeakSet();
// Optional opaque ownership for opt-in controllers. Public command shape stays unchanged.
const PENDING_OWNED_CONTROLS = new WeakMap();
const OWNED_CONTROL_RECEIPTS = new WeakMap();
const CONTROL_RECORDS = new WeakMap();       // entity -> reusable control record
const BODY_RESPONSE_RECORDS = new WeakMap(); // entity -> reusable {massScale,inertiaScale}
// Retained projectile-continuation bookkeeping lives in side-channel maps so the queued
// physics command keeps exactly its published 5-key shape and transient bounce rewrites stay
// out of saves, replays, and renderer-facing entity graphs.
const PROJECTILE_CONTINUATIONS = new WeakMap(); // entity -> reusable continuation record
const CONSUMED_CONTINUATIONS = new WeakSet();
const VECTOR_POOL = [];

const DEFAULT_THRUSTERS = Object.freeze([
  Object.freeze({ id: 'drive-port', forward: 1, reverse: 0.8, strafe: 0.45, yaw: 0.8 }),
  Object.freeze({ id: 'drive-starboard', forward: 1, reverse: 0.8, strafe: 0.45, yaw: 0.8 }),
  Object.freeze({ id: 'rcs-port', forward: 0.35, reverse: 0.55, strafe: 1, yaw: 1 }),
  Object.freeze({ id: 'rcs-starboard', forward: 0.35, reverse: 0.55, strafe: 1, yaw: 1 }),
]);

/** Replace the continuous force/torque command for this tick. */
export function writePhysicsControl(entity, control = {}) {
  if (!entity || typeof entity !== 'object') return null;
  PENDING_OWNED_CONTROLS.delete(entity);
  const command = commandFor(entity);
  let value = CONTROL_RECORDS.get(entity);
  if (!value) {
    value = {
      schemaVersion: PHYSICS_COMMAND_SCHEMA_VERSION,
      mode: 'uncontrolled',
      force: { x: 0, y: 0, z: 0 },
      torque: { x: 0, y: 0, z: 0 },
      authority: { forward: 1, reverse: 1, strafe: 1, yaw: 1 },
      source: 'unknown',
      maxSpeed: Infinity,
    };
    CONTROL_RECORDS.set(entity, value);
  }
  value.mode = String(control.mode || 'uncontrolled');
  vector3Into(value.force, control.force);
  vector3Into(value.torque, control.torque);
  normalizeAuthorityInto(value.authority, control.authority);
  value.source = String(control.source || 'unknown');
  value.maxSpeed = positive(control.maxSpeed, Infinity);
  command.control = value;
  return value;
}

/** Issue a one-use opaque receipt for exactly this continuous-control submission.
 * A later control write always revokes pending ownership, even with identical numbers/source.
 * This token is process-local, never serialized or accepted from a copied data record.
 */
export function writeOwnedPhysicsControl(entity, control = {}) {
  const value = writePhysicsControl(entity, control);
  if (!value) return null;
  const receipt = Object.freeze({});
  OWNED_CONTROL_RECEIPTS.set(receipt, {
    entity, life: entity.occupantGeneration, bodySpec: entity.physicsBody,
    command: COMMANDS.get(entity), control: value,
  });
  PENDING_OWNED_CONTROLS.set(entity, receipt);
  return receipt;
}

function ownedControlRecord(entity, receipt, command) {
  const issued = receipt && OWNED_CONTROL_RECEIPTS.get(receipt);
  return issued && issued.entity === entity && issued.life === entity.occupantGeneration
    && issued.bodySpec === entity.physicsBody && issued.command === command
    && issued.control === command?.control && PENDING_OWNED_CONTROLS.get(entity) === receipt
    ? issued : null;
}

/** Cancel only this still-pending exact submission. Other controls and impulses survive. */
export function cancelOwnedPhysicsControl(entity, receipt) {
  const command = entity && COMMANDS.get(entity);
  if (!command || CONSUMED_COMMANDS.has(command) || !ownedControlRecord(entity, receipt, command)) return false;
  command.control = null;
  PENDING_OWNED_CONTROLS.delete(entity);
  return true;
}

/** Native owner only: capture exact ownership while consuming this command, once.
 * The native owner publishes it only after successfully applying and stepping the control.
 * A generic consume, a source label, or matching force numbers is not a native witness.
 */
export function takeConsumedPhysicsControlReceipt(entity, command) {
  const receipt = entity && PENDING_OWNED_CONTROLS.get(entity);
  if (!command || !CONSUMED_COMMANDS.has(command) || !ownedControlRecord(entity, receipt, command)) return null;
  PENDING_OWNED_CONTROLS.delete(entity);
  return receipt;
}

/** Queue a world-space linear impulse. The physics owner applies it on its next tick. */
export function queuePhysicsImpulse(entity, impulse, evidence = null) {
  if (!entity || typeof entity !== 'object') return false;
  const command = commandFor(entity);
  command.impulses.push(pooledVector3(impulse, evidence));
  return true;
}

/** Queue a world-space angular impulse. SpaceFace only uses the Y component physically. */
export function queuePhysicsTorqueImpulse(entity, impulse, evidence = null) {
  if (!entity || typeof entity !== 'object') return false;
  const command = commandFor(entity);
  command.torqueImpulses.push(pooledVector3(impulse, evidence));
  return true;
}

/**
 * Queue a projectile bounce continuation (PQ-133.04): the outgoing velocity, yaw, and a
 * de-penetration offset bounded to one body-radius pad along the outgoing unit velocity
 * (the exact legacy nudgeAlongVelocity math). The immediate authoritative kinematic-mirror
 * write keeps the legacy backend and synchronous consumers on the reflected motion; the
 * SG-02 owner re-applies the record to the real Rapier body at the start of its next step.
 * The record is retained (consume-once, re-armed by the next queue) in a side-channel map,
 * so the published 5-key physics command shape stays untouched.
 */
export function queueProjectileContinuation(entity, continuation = {}) {
  if (!entity || typeof entity !== 'object') return false;
  const velocity = continuation.velocity;
  const vx = velocity ? Number(velocity.x) : NaN;
  const vz = velocity ? Number(velocity.z) : NaN;
  const yaw = Number(continuation.yaw);
  if (!Number.isFinite(vx) || !Number.isFinite(vz) || !Number.isFinite(yaw)) return false;
  let record = PROJECTILE_CONTINUATIONS.get(entity);
  if (!record) {
    record = {
      schemaVersion: PHYSICS_COMMAND_SCHEMA_VERSION,
      velocity: { x: 0, z: 0 },
      yaw: 0,
      tick: 0,
      offset: { x: 0, z: 0 },
    };
    PROJECTILE_CONTINUATIONS.set(entity, record);
  } else {
    CONSUMED_CONTINUATIONS.delete(record);
  }
  const speed = Math.hypot(vx, vz);
  record.velocity.x = vx;
  record.velocity.z = vz;
  record.yaw = yaw;
  record.tick = Number.isInteger(continuation.tick) && continuation.tick >= 0
    ? continuation.tick
    : 0;
  const pad = (entity.radius || 0.7) + 0.05;
  if (speed > 0) {
    record.offset.x = (vx / speed) * pad;
    record.offset.z = (vz / speed) * pad;
  } else {
    record.offset.x = 0;
    record.offset.z = 0;
  }
  if (entity.vel && typeof entity.vel === 'object') {
    entity.vel.x = vx;
    entity.vel.z = vz;
  } else {
    entity.vel = { x: vx, z: vz };
  }
  entity.rot = yaw;
  if (entity.pos && typeof entity.pos === 'object' && speed > 0) {
    entity.pos.x += record.offset.x;
    entity.pos.z += record.offset.z;
  }
  return true;
}

/**
 * Physics-only: consume this entity's queued projectile continuation once. Returns null when
 * nothing is queued or the record was already read; the next queueProjectileContinuation
 * re-arms the retained record in place.
 */
export function consumeProjectileContinuation(entity) {
  if (!entity || typeof entity !== 'object') return null;
  const record = PROJECTILE_CONTINUATIONS.get(entity) || null;
  if (!record || CONSUMED_CONTINUATIONS.has(record)) return null;
  CONSUMED_CONTINUATIONS.add(record);
  return record;
}

/**
 * Physics-only: atomically consume all commands written before this system's turn. The record
 * is retained (marked consumed, not deleted) so next tick's writes reuse the same command
 * object and arrays; consumers must read the returned contents before the next write cycle.
 */
export function consumePhysicsCommand(entity) {
  const command = COMMANDS.get(entity) || null;
  if (!command || CONSUMED_COMMANDS.has(command)) return null;
  CONSUMED_COMMANDS.add(command);
  return command;
}

export function clearPhysicsAuthority(entity) {
  if (!entity || typeof entity !== 'object') return;
  COMMANDS.delete(entity);
  CONTROL_RECORDS.delete(entity);
  PENDING_OWNED_CONTROLS.delete(entity);
  BODY_RESPONSE_RECORDS.delete(entity);
  PROJECTILE_CONTINUATIONS.delete(entity);
  TELEMETRY.delete(entity);
  AUTHORITY_CACHE.delete(entity);
  NORMALIZED_BODY_CACHE.delete(entity);
  RESOLVED_BODY_CACHE.delete(entity);
}

/** Physics-only: publish measured post-solve state without polluting authoritative serialization. */
export function writePhysicsTelemetry(entity, telemetry = {}) {
  if (!entity || typeof entity !== 'object') return null;
  const value = Object.freeze({
    schemaVersion: PHYSICS_TELEMETRY_SCHEMA_VERSION,
    tick: Math.max(0, Math.trunc(finite(telemetry.tick))),
    bodyHandle: finite(telemetry.bodyHandle, -1),
    dynamic: !!telemetry.dynamic,
    ccd: !!telemetry.ccd,
    mass: positive(telemetry.mass, 1),
    inertiaY: positive(telemetry.inertiaY, 1),
    force: Object.freeze(vector3(telemetry.force)),
    torque: Object.freeze(vector3(telemetry.torque)),
    linearAcceleration: Object.freeze(vector3(telemetry.linearAcceleration)),
    angularAccelerationY: finite(telemetry.angularAccelerationY),
    lateralAcceleration: finite(telemetry.lateralAcceleration),
    authority: Object.freeze(normalizeAuthority(telemetry.authority)),
    mode: String(telemetry.mode || 'uncontrolled'),
  });
  TELEMETRY.set(entity, value);
  return value;
}

export function readPhysicsTelemetry(entity) {
  return entity && TELEMETRY.get(entity) || null;
}

export function shouldSyncPhysicsBodyEntity(entity) {
  if (!entity || typeof entity !== 'object' || entity.alive === false) return false;
  // Explicit opt-out for scripted presentation entities whose pose is not owned by physics.
  // `collides:false` alone remains insufficient because several gameplay compatibility bodies
  // intentionally use it while still participating in the SG-02 body index.
  if (entity.physicsBody === false) return false;
  const authored = authoredPhysicsBody(entity);
  if (entity.collides === false && !authored && entity.type === 'fx') return false;
  const radius = positive(authored && authored.radius, positive(entity.radius, 1));
  return radius > 0;
}

export function isDynamicPhysicsBodyEntity(entity) {
  if (!entity || typeof entity !== 'object') return false;
  // Single reader: dynamic resolution lives in substanceFor (authored override else
  // defaultDynamic). Bit-identical to the inline branch this replaced.
  return substanceFor(entity).dynamic;
}

/**
 * Ensure the additive, save-safe body authoring schema exists on a dynamic craft.
 * Existing authored values win; missing values are derived from canonical entity fields.
 */
export function ensurePhysicsBodySpec(entity) {
  if (!entity || typeof entity !== 'object') return null;
  const authoredBody = authoredPhysicsBody(entity);
  if (authoredBody && NORMALIZED_BODY_CACHE.get(entity) === authoredBody) return authoredBody;
  const authored = authoredBody || {};
  const radius = positive(authored.radius, positive(entity.radius, 1));
  const dynamic = authored.dynamic == null ? defaultDynamic(entity) : !!authored.dynamic;
  let mass;
  if (authored.mass != null) {
    mass = positive(authored.mass, 1);
  } else if (!dynamic) {
    mass = positive(entity.mass, 1e6);
  } else if (Number.isFinite(authored.density) && authored.density > 0) {
    mass = defaultMass(entity, radius);
  } else if (entity.mass != null && entity.mass > 0 && entity.mass < 1e5 && (entity.type === 'ship' || entity.type === 'drone')) {
    mass = entity.mass;
  } else if (entity.mass != null && entity.mass > 0 && entity.mass < 1e5 && !['asteroid', 'wreck', 'pod', 'payload', 'prop'].includes(entity.type)) {
    mass = entity.mass;
  } else {
    mass = defaultMass(entity, radius);
  }
  const derivedModel = entity.data && entity.data.derived && entity.data.derived.flightModel;
  const modelInertia = finite(entity.flightModel && entity.flightModel.inertia, finite(derivedModel && derivedModel.inertia, 0));
  const inertiaY = positive(authored.inertiaY, positive(modelInertia, 0.5 * mass * radius * radius));
  const isCraft = entity.type === 'ship' || entity.type === 'drone';
  const shape = authored.shape ? String(authored.shape) : (isCraft ? 'capsule' : 'ball');
  const thrusters = Array.isArray(authored.thrusters)
    ? authored.thrusters.map(normalizeThruster)
    : (isCraft ? DEFAULT_THRUSTERS.map((thruster) => ({ ...thruster, health: 1 })) : []);

  const body = {
    ...authored,
    schemaVersion: PHYSICS_BODY_SCHEMA_VERSION,
    mass,
    inertiaY,
    centerOfMass: vector3(authored.centerOfMass),
    radius,
    shape,
    dynamic,
    ccd: authored.ccd == null ? defaultCcd(entity) : !!authored.ccd,
    material: String(authored.material || defaultMaterial(entity)),
    attachmentPoints: normalizeAttachmentPoints(authored.attachmentPoints),
    thrusters,
    revision: Math.max(0, Math.trunc(finite(authored.revision))),
  };
  if (Number.isFinite(authored.density) && authored.density > 0) body.density = authored.density;
  else delete body.density;
  const contact = normalizeContactOverride(authored.contact);
  if (contact) body.contact = contact;
  else delete body.contact;
  if (Number.isFinite(authored.impactDamageScale)) body.impactDamageScale = clamp(authored.impactDamageScale, 0, 8);
  else delete body.impactDamageScale;
  if (Number.isFinite(authored.fieldResponseMult)) body.fieldResponseMult = clamp(authored.fieldResponseMult, 0, 8);
  else delete body.fieldResponseMult;
  entity.physicsBody = body;
  NORMALIZED_BODY_CACHE.set(entity, body);
  return body;
}

/** Keep the save-safe physics authoring record aligned with ships-owned derived stats. */
export function syncDerivedPhysicsMass(entity, mass, inertiaY, radius) {
  // A derived-stat refresh changes authored mass/inertia, and a hull swap changes radius too.
  // Re-normalizing the entire body would replace the save-safe record and invalidate WeakMap
  // caches even when those values did not change, so preserve an existing body object and
  // initialize only when one is absent.
  const body = authoredPhysicsBody(entity) || ensurePhysicsBodySpec(entity);
  if (!body) return null;
  const nextMass = positive(mass, body.mass);
  const nextInertiaY = positive(inertiaY, body.inertiaY);
  const nextRadius = positive(radius, body.radius);
  if (body.mass === nextMass && body.inertiaY === nextInertiaY && body.radius === nextRadius) {
    return body;
  }
  body.mass = nextMass;
  body.inertiaY = nextInertiaY;
  body.radius = nextRadius;
  body.revision = Math.max(0, Math.trunc(finite(body.revision))) + 1;
  return body;
}

export function measureThrusterAuthority(entity) {
  const body = ensurePhysicsBodySpec(entity);
  if (!body || !body.thrusters.length) return normalizeAuthority({});
  const cached = AUTHORITY_CACHE.get(entity);
  if (cached && cached.body === body && cached.revision === body.revision) return cached.authority;
  let forward = 0, reverse = 0, strafe = 0, yaw = 0;
  let forwardMax = 0, reverseMax = 0, strafeMax = 0, yawMax = 0;
  for (const thruster of body.thrusters) {
    const health = clamp(finite(thruster.health, 1), 0, 1);
    forward += health * thruster.forward; forwardMax += thruster.forward;
    reverse += health * thruster.reverse; reverseMax += thruster.reverse;
    strafe += health * thruster.strafe; strafeMax += thruster.strafe;
    yaw += health * thruster.yaw; yawMax += thruster.yaw;
  }
  const authority = normalizeAuthority({
    forward: forwardMax > 0 ? forward / forwardMax : 0,
    reverse: reverseMax > 0 ? reverse / reverseMax : 0,
    strafe: strafeMax > 0 ? strafe / strafeMax : 0,
    yaw: yawMax > 0 ? yaw / yawMax : 0,
  });
  AUTHORITY_CACHE.set(entity, { body, revision: body.revision, authority });
  return authority;
}

export function setThrusterHealth(entity, thrusterId, health) {
  const body = ensurePhysicsBodySpec(entity);
  if (!body) return null;
  const thruster = body.thrusters.find((item) => item.id === thrusterId);
  if (!thruster) return null;
  thruster.health = clamp(finite(health, thruster.health), 0, 1);
  body.revision++;
  return { id: thruster.id, health: thruster.health, authority: measureThrusterAuthority(entity) };
}

export function damageThruster(entity, thrusterId, damage) {
  const body = ensurePhysicsBodySpec(entity);
  if (!body) return null;
  const thruster = body.thrusters.find((item) => item.id === thrusterId);
  if (!thruster) return null;
  return setThrusterHealth(entity, thrusterId, thruster.health - Math.max(0, finite(damage)));
}

export function resolvePhysicsBodySpec(entity) {
  const body = ensurePhysicsBodySpec(entity);
  if (!body) return null;
  const revision = Math.max(0, Math.trunc(finite(body.revision)));
  const cached = RESOLVED_BODY_CACHE.get(entity);
  if (cached && cached.body === body && cached.revision === revision) return cached.spec;
  const spec = {
    schemaVersion: body.schemaVersion,
    mass: positive(body.mass, 1),
    inertiaY: positive(body.inertiaY, 1),
    centerOfMass: vector3(body.centerOfMass),
    radius: positive(body.radius, 1),
    shape: String(body.shape || (entity.type === 'ship' || entity.type === 'drone' ? 'capsule' : 'ball')),
    dynamic: !!body.dynamic,
    ccd: !!body.ccd,
    material: String(body.material || 'default'),
    attachmentPoints: normalizeAttachmentPoints(body.attachmentPoints),
    revision,
  };
  if (body.density != null) spec.density = body.density;
  const resolvedContact = normalizedContactFor(body.contact, revision);
  if (resolvedContact) spec.contact = resolvedContact;
  if (body.impactDamageScale != null) spec.impactDamageScale = body.impactDamageScale;
  if (body.fieldResponseMult != null) spec.fieldResponseMult = body.fieldResponseMult;
  RESOLVED_BODY_CACHE.set(entity, { body, revision, spec });
  return spec;
}

const NORMALIZED_CONTACT_CACHE = new WeakMap();

function normalizedContactFor(contact, revision) {
  if (!contact || typeof contact !== 'object') return null;
  const cached = NORMALIZED_CONTACT_CACHE.get(contact);
  if (cached && cached.revision === revision) return cached.normalized;
  const normalized = normalizeContactOverride(contact);
  NORMALIZED_CONTACT_CACHE.set(contact, { revision, normalized });
  return normalized;
}

function normalizeContactOverride(contact) {
  if (!contact || typeof contact !== 'object') return null;
  const out = {};
  if (contact.friction != null) out.friction = clamp(finite(contact.friction), 0, 1);
  if (contact.restitution != null) out.restitution = clamp(finite(contact.restitution), 0, 1);
  if (contact.angularDamping != null) out.angularDamping = clamp(finite(contact.angularDamping), 0, 8);
  if (contact.restitutionCombine === 'min' || contact.restitutionCombine === 'average'
    || contact.restitutionCombine === 'max') {
    out.restitutionCombine = contact.restitutionCombine;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Replace this tick's transient mass/inertia response. This is a body-property command, not a
 * movement command: it never writes velocity, control force, facing, or a speed ceiling. The
 * physics owner restores authored properties automatically on the first tick without a response.
 */
export function writePhysicsBodyResponse(entity, response = {}) {
  if (!entity || typeof entity !== 'object') return null;
  const command = commandFor(entity);
  let value = BODY_RESPONSE_RECORDS.get(entity);
  if (!value) {
    value = { massScale: 1, inertiaScale: 1 };
    BODY_RESPONSE_RECORDS.set(entity, value);
  }
  command.bodyResponse = normalizePhysicsBodyResponseInto(value, response);
  return value;
}

export function normalizePhysicsBodyResponse(response = {}) {
  return normalizePhysicsBodyResponseInto({ massScale: 1, inertiaScale: 1 }, response);
}

function normalizePhysicsBodyResponseInto(out, response = {}) {
  const min = PHYSICS_BODY_RESPONSE_LIMITS.minScale;
  const max = PHYSICS_BODY_RESPONSE_LIMITS.maxScale;
  const massScale = clamp(positive(response.massScale, 1), min, max);
  const inertiaScale = clamp(positive(response.inertiaScale, massScale), min, max);
  out.massScale = massScale;
  out.inertiaScale = inertiaScale;
  return out;
}

function commandFor(entity) {
  let command = COMMANDS.get(entity);
  if (!command) {
    command = {
      schemaVersion: PHYSICS_COMMAND_SCHEMA_VERSION,
      control: null,
      impulses: [],
      torqueImpulses: [],
      bodyResponse: null,
    };
    COMMANDS.set(entity, command);
    return command;
  }
  if (CONSUMED_COMMANDS.has(command)) {
    // The physics owner finished reading the previous cycle's contents. Re-arm the retained
    // record in place: arrays are emptied by length truncation and the queued vector objects
    // return to the pool, so a held stale reference cannot shadow fresh writes.
    CONSUMED_COMMANDS.delete(command);
    for (let i = 0; i < command.impulses.length; i++) VECTOR_POOL.push(command.impulses[i]);
    command.impulses.length = 0;
    for (let i = 0; i < command.torqueImpulses.length; i++) VECTOR_POOL.push(command.torqueImpulses[i]);
    command.torqueImpulses.length = 0;
    command.control = null;
    command.bodyResponse = null;
  }
  return command;
}

function pooledVector3(source, evidence) {
  const value = VECTOR_POOL.pop() || { x: 0, y: 0, z: 0 };
  value.x = finite(source && source.x);
  value.y = finite(source && source.y);
  value.z = finite(source && source.z);
  if (evidence) {
    value.provenance = evidence.provenance;
    value.tick = evidence.tick;
    value.kind = evidence.kind;
  } else if ('provenance' in value || 'tick' in value || 'kind' in value) {
    // A pooled object keeps the exact fresh-object shape: evidence fields exist only when
    // evidence was supplied, never as stale leftovers from a previous queueing.
    delete value.provenance;
    delete value.tick;
    delete value.kind;
  }
  return value;
}

function vector3Into(out, source) {
  out.x = finite(source && source.x);
  out.y = finite(source && source.y);
  out.z = finite(source && source.z);
  return out;
}

function authoredPhysicsBody(entity) {
  return entity && entity.physicsBody && typeof entity.physicsBody === 'object' ? entity.physicsBody : null;
}

function vector3(source) {
  return {
    x: finite(source && source.x),
    y: finite(source && source.y),
    z: finite(source && source.z),
  };
}

function normalizeAuthority(authority = {}) {
  return normalizeAuthorityInto({
    forward: 1, reverse: 1, strafe: 1, yaw: 1,
  }, authority);
}

function normalizeAuthorityInto(out, authority = {}) {
  out.forward = clamp(finite(authority.forward, 1), 0, 1);
  out.reverse = clamp(finite(authority.reverse, 1), 0, 1);
  out.strafe = clamp(finite(authority.strafe, 1), 0, 1);
  out.yaw = clamp(finite(authority.yaw, 1), 0, 1);
  return out;
}

function normalizeThruster(source, index = 0) {
  return {
    id: String(source && source.id || `thruster-${index}`),
    health: clamp(finite(source && source.health, 1), 0, 1),
    forward: Math.max(0, finite(source && source.forward, 1)),
    reverse: Math.max(0, finite(source && source.reverse, 1)),
    strafe: Math.max(0, finite(source && source.strafe, 1)),
    yaw: Math.max(0, finite(source && source.yaw, 1)),
  };
}

function normalizeAttachmentPoints(points) {
  const out = {};
  if (points && typeof points === 'object') {
    for (const [name, point] of Object.entries(points)) out[name] = vector3(point);
  }
  if (!out.massline) out.massline = { x: 0, y: 0, z: 0 };
  return out;
}

export const FIXED_BODY_RADIUS_THRESHOLD = 90;

export const SOLID_WORLD_DENSITY = Object.freeze({
  rock: PHYSICS_MATERIALS.rock.density,        // asteroids, mining chunks: mass ~ 0.25 * R^3
  wreck: PHYSICS_MATERIALS.wreck.density,      // spaceframe / armor debris: mass ~ 0.10 * R^3
  pod: PHYSICS_MATERIALS.pod.density,          // containers, hab pods: mass ~ 0.08 * R^3
  payload: PHYSICS_MATERIALS.payload.density,  // mission payloads: mass ~ 0.08 * R^3
  buoy: PHYSICS_MATERIALS.buoy.density,        // beacons, nav pins, worklights: mass ~ 0.06 * R^3
  prop: PHYSICS_MATERIALS.prop.density,        // dressing props: mass ~ 0.06 * R^3
  pickup: 0.1,       // cargo / ore pickups: fixed 0.1
});

export function isFixedPhysicsEntity(entity, radius = null) {
  if (!entity || typeof entity !== 'object') return false;
  const data = entity.data || {};
  // 1. Stations are always fixed
  if (entity.type === 'station') return true;
  // 2. Gates and wormholes are always fixed
  if (entity.type === 'gate' || data.isGate || data.isWormhole || data.placeId === 'place_gate_jump_ring') return true;
  // 3. Landmark rocks and authored landmark sites are fixed
  if (data.isLandmark || data.isLandmarkRock || data.landmark || data.archetype === 'landmark' || (typeof data.archetypeGlb === 'string' && data.archetypeGlb.includes('landmark'))) {
    return true;
  }
  // 4. Anything over ~90 WU radius is fixed
  const r = positive(radius, positive(entity.physicsBody && entity.physicsBody.radius, positive(entity.radius, 0)));
  if (r > FIXED_BODY_RADIUS_THRESHOLD) return true;

  return false;
}

function defaultDynamic(entity, radius = null) {
  if (!entity || typeof entity !== 'object') return false;
  if (isFixedPhysicsEntity(entity, radius)) return false;
  return true;
}

function defaultCcd(entity) {
  return entity.type === 'ship' || entity.type === 'drone' || entity.type === 'payload' || entity.type === 'projectile' ||
    entity.type === 'wreck' || entity.type === 'asteroid' || entity.type === 'pod' || entity.type === 'pickup';
}

function defaultMaterial(entity) {
  if (entity.type === 'projectile') return 'projectile';
  if (entity.type === 'station') return 'station';
  if (entity.type === 'asteroid') return 'rock';
  if (entity.type === 'wreck') return 'debris';
  if (entity.type === 'pickup') return 'sensor';
  if (entity.type === 'payload') return 'payload';
  if (entity.type === 'pod') return 'debris';
  return entity.type === 'ship' || entity.type === 'drone' ? 'ship' : 'default';
}

export function defaultMass(entity, radius = null) {
  if (!entity || typeof entity !== 'object') return 1;
  const R = positive(radius, positive(entity.physicsBody && entity.physicsBody.radius, positive(entity.radius, 1)));
  const vol = R * R * R;
  const authoredDensity = entity.physicsBody && entity.physicsBody.density;
  if (Number.isFinite(authoredDensity) && authoredDensity > 0) {
    return Math.max(1, Math.round(authoredDensity * vol));
  }
  if (entity.type === 'pickup') return SOLID_WORLD_DENSITY.pickup;
  if (entity.type === 'ship' || entity.type === 'drone') {
    return positive(entity.mass, 24);
  }
  const data = entity.data || {};

  if (entity.type === 'asteroid') {
    return Math.max(1, Math.round(SOLID_WORLD_DENSITY.rock * vol));
  }
  if (entity.type === 'wreck' || data.isWreck || (typeof data.placeId === 'string' && data.placeId.startsWith('place_aftermath_'))) {
    return Math.max(1, Math.round(SOLID_WORLD_DENSITY.wreck * vol));
  }
  if (entity.type === 'pod' || data.isPod || (typeof data.placeId === 'string' && (data.placeId.startsWith('place_cargo_pod_') || data.placeId.startsWith('place_habitat_pod_') || data.placeId.startsWith('pod_')))) {
    return Math.max(1, Math.round(SOLID_WORLD_DENSITY.pod * vol));
  }
  if (entity.type === 'payload') {
    return Math.max(1, Math.round(SOLID_WORLD_DENSITY.payload * vol));
  }
  if (entity.type === 'prop' || data.isProp || data.isBuoy || (typeof data.placeId === 'string' && (data.placeId.startsWith('place_lane_') || data.placeId.startsWith('place_nav_') || data.placeId.startsWith('place_whistle')))) {
    return Math.max(1, Math.round(SOLID_WORLD_DENSITY.buoy * vol));
  }
  return Math.max(1, Math.round(0.10 * vol));
}

/**
 * Pure reader for an entity's live collider substance (Rapier SG-02 truth):
 * { shape, material, dynamic, sensor }. Authored (non-null) physicsBody values always win;
 * otherwise the answer is exactly ensurePhysicsBodySpec's defaults — defaultDynamic for
 * dynamic, defaultMaterial for material, the isCraft capsule/ball rule for shape, and
 * material === 'sensor' for sensor. No rng, no mutation, no side effects. The canonical
 * per-model statement of this truth is MODEL_SUBSTANCE_TABLE in src/data/modelTruth.js;
 * live ghost bits (debris/rock false, pickup true) live in sg02 CONTACT_MATERIALS +
 * contactMaterialFor, not here — material 'sensor' is the pickup marker this reader maps
 * to sensor:true/ghost-reading:true in substance terms.
 */
export function substanceFor(entity) {
  if (!entity || typeof entity !== 'object') {
    return { shape: 'ball', material: 'default', dynamic: false, sensor: false };
  }
  const authored = authoredPhysicsBody(entity);
  const isCraft = entity.type === 'ship' || entity.type === 'drone';
  // Coalescing mirrors ensurePhysicsBodySpec exactly (falsy authored values fall through
  // to the same defaults); dynamic keeps isDynamicPhysicsBodyEntity's != null override rule.
  const material = String((authored && authored.material) || defaultMaterial(entity));
  const shape = (authored && authored.shape) ? String(authored.shape) : (isCraft ? 'capsule' : 'ball');
  const dynamic = authored && authored.dynamic != null
    ? !!authored.dynamic
    : defaultDynamic(entity);
  return { shape, material, dynamic, sensor: material === 'sensor' };
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function positive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

export {
  SURFACE_CONTACT_SCHEMA_VERSION,
  SURFACE_RESPONSE,
  applyReflectedVelocity,
  createSurfaceContactReceipt,
  isSurfaceContactReceipt,
  reflectVelocity,
  surfaceContactFromBodies,
  surfaceResponseFor,
} from './surfaceContact.js';
