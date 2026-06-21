// SG-02 physics command membrane.
//
// Flight, combat, and gameplay systems may describe forces, torques, and impulses here. Only the
// physics system should consume those commands and mutate body/entity motion. WeakMaps keep transient
// commands and measured telemetry out of saves, replays, and renderer-facing entity graphs.

export const PHYSICS_COMMAND_SCHEMA_VERSION = 1;
export const PHYSICS_BODY_SCHEMA_VERSION = 1;
export const PHYSICS_TELEMETRY_SCHEMA_VERSION = 1;

const COMMANDS = new WeakMap();
const TELEMETRY = new WeakMap();

const DEFAULT_THRUSTERS = Object.freeze([
  Object.freeze({ id: 'drive-port', forward: 1, reverse: 0.8, strafe: 0.45, yaw: 0.8 }),
  Object.freeze({ id: 'drive-starboard', forward: 1, reverse: 0.8, strafe: 0.45, yaw: 0.8 }),
  Object.freeze({ id: 'rcs-port', forward: 0.35, reverse: 0.55, strafe: 1, yaw: 1 }),
  Object.freeze({ id: 'rcs-starboard', forward: 0.35, reverse: 0.55, strafe: 1, yaw: 1 }),
]);

/** Replace the continuous force/torque command for this tick. */
export function writePhysicsControl(entity, control = {}) {
  if (!entity || typeof entity !== 'object') return null;
  const command = commandFor(entity);
  command.control = {
    schemaVersion: PHYSICS_COMMAND_SCHEMA_VERSION,
    mode: String(control.mode || 'uncontrolled'),
    force: vector3(control.force),
    torque: vector3(control.torque),
    authority: normalizeAuthority(control.authority),
    source: String(control.source || 'unknown'),
    maxSpeed: positive(control.maxSpeed, Infinity),
  };
  return command.control;
}

/** Queue a world-space linear impulse. The physics owner applies it on its next tick. */
export function queuePhysicsImpulse(entity, impulse) {
  if (!entity || typeof entity !== 'object') return false;
  commandFor(entity).impulses.push(vector3(impulse));
  return true;
}

/** Queue a world-space angular impulse. SpaceFace only uses the Y component physically. */
export function queuePhysicsTorqueImpulse(entity, impulse) {
  if (!entity || typeof entity !== 'object') return false;
  commandFor(entity).torqueImpulses.push(vector3(impulse));
  return true;
}

/** Physics-only: atomically consume all commands written before this system's turn. */
export function consumePhysicsCommand(entity) {
  const command = COMMANDS.get(entity) || null;
  if (command) COMMANDS.delete(entity);
  return command;
}

export function clearPhysicsAuthority(entity) {
  if (!entity || typeof entity !== 'object') return;
  COMMANDS.delete(entity);
  TELEMETRY.delete(entity);
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

/**
 * Ensure the additive, save-safe body authoring schema exists on a dynamic craft.
 * Existing authored values win; missing values are derived from canonical entity fields.
 */
export function ensurePhysicsBodySpec(entity) {
  if (!entity || typeof entity !== 'object') return null;
  const authored = entity.physicsBody && typeof entity.physicsBody === 'object' ? entity.physicsBody : {};
  const radius = positive(authored.radius, positive(entity.radius, 1));
  const mass = positive(authored.mass, positive(entity.mass, 1));
  const derivedModel = entity.data && entity.data.derived && entity.data.derived.flightModel;
  const modelInertia = finite(entity.flightModel && entity.flightModel.inertia, finite(derivedModel && derivedModel.inertia, 0));
  const inertiaY = positive(authored.inertiaY, positive(modelInertia, 0.5 * mass * radius * radius));
  const isCraft = entity.type === 'ship' || entity.type === 'drone';
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
    dynamic: authored.dynamic == null ? defaultDynamic(entity) : !!authored.dynamic,
    ccd: authored.ccd == null ? defaultCcd(entity) : !!authored.ccd,
    material: String(authored.material || defaultMaterial(entity)),
    attachmentPoints: normalizeAttachmentPoints(authored.attachmentPoints),
    thrusters,
    revision: Math.max(0, Math.trunc(finite(authored.revision))),
  };
  entity.physicsBody = body;
  return body;
}

export function measureThrusterAuthority(entity) {
  const body = ensurePhysicsBodySpec(entity);
  if (!body || !body.thrusters.length) return normalizeAuthority({});
  let forward = 0, reverse = 0, strafe = 0, yaw = 0;
  let forwardMax = 0, reverseMax = 0, strafeMax = 0, yawMax = 0;
  for (const thruster of body.thrusters) {
    const health = clamp(finite(thruster.health, 1), 0, 1);
    forward += health * thruster.forward; forwardMax += thruster.forward;
    reverse += health * thruster.reverse; reverseMax += thruster.reverse;
    strafe += health * thruster.strafe; strafeMax += thruster.strafe;
    yaw += health * thruster.yaw; yawMax += thruster.yaw;
  }
  return normalizeAuthority({
    forward: forwardMax > 0 ? forward / forwardMax : 0,
    reverse: reverseMax > 0 ? reverse / reverseMax : 0,
    strafe: strafeMax > 0 ? strafe / strafeMax : 0,
    yaw: yawMax > 0 ? yaw / yawMax : 0,
  });
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
  return {
    schemaVersion: body.schemaVersion,
    mass: positive(body.mass, 1),
    inertiaY: positive(body.inertiaY, 1),
    centerOfMass: vector3(body.centerOfMass),
    radius: positive(body.radius, 1),
    dynamic: !!body.dynamic,
    ccd: !!body.ccd,
    material: String(body.material || 'default'),
    attachmentPoints: normalizeAttachmentPoints(body.attachmentPoints),
    revision: Math.max(0, Math.trunc(finite(body.revision))),
  };
}

function commandFor(entity) {
  let command = COMMANDS.get(entity);
  if (!command) {
    command = {
      schemaVersion: PHYSICS_COMMAND_SCHEMA_VERSION,
      control: null,
      impulses: [],
      torqueImpulses: [],
    };
    COMMANDS.set(entity, command);
  }
  return command;
}

function vector3(source) {
  return {
    x: finite(source && source.x),
    y: finite(source && source.y),
    z: finite(source && source.z),
  };
}

function normalizeAuthority(authority = {}) {
  return {
    forward: clamp(finite(authority.forward, 1), 0, 1),
    reverse: clamp(finite(authority.reverse, 1), 0, 1),
    strafe: clamp(finite(authority.strafe, 1), 0, 1),
    yaw: clamp(finite(authority.yaw, 1), 0, 1),
  };
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

function defaultDynamic(entity) {
  return entity.type === 'ship' || entity.type === 'drone' || entity.type === 'payload' || entity.type === 'projectile' ||
    entity.type === 'pickup' || entity.type === 'wreck' ||
    !!(entity.data && (entity.data.majorDebris || entity.data.tetherPayload));
}

function defaultCcd(entity) {
  return entity.type === 'ship' || entity.type === 'drone' || entity.type === 'payload' || entity.type === 'projectile';
}

function defaultMaterial(entity) {
  if (entity.type === 'projectile') return 'projectile';
  if (entity.type === 'station') return 'station';
  if (entity.type === 'asteroid') return 'rock';
  if (entity.type === 'wreck') return 'debris';
  if (entity.type === 'pickup') return 'sensor';
  if (entity.type === 'payload') return 'payload';
  return entity.type === 'ship' || entity.type === 'drone' ? 'ship' : 'default';
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
