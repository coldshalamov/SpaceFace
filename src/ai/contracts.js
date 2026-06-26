// SG-06 tactical AI contracts. This module contains no game-state access and no side effects.

export const AI_CONTRACT_VERSION = 1;
export const NORMALIZED_SENSOR_FRAME_FLAG = '__spacefaceNormalizedSensorFrame';
export const NORMALIZED_THRUSTER_REQUEST_FLAG = '__spacefaceNormalizedThrusterRequest';
const EMPTY_TRAJECTORY = Object.freeze([]);

export const DirectorPhase = Object.freeze({
  RESPITE: 'respite',
  BUILD: 'build',
  PEAK: 'peak',
  RETREAT: 'retreat',
});

export const SquadRole = Object.freeze({
  LEADER: 'leader',
  STRIKER: 'striker',
  SCREEN: 'screen',
  TUG: 'tug',
  THIEF: 'thief',
  SUPPORT: 'support',
});

export const ObjectiveKind = Object.freeze({
  HOLD: 'hold',
  ENGAGE: 'engage',
  FOCUS: 'focus',
  SCREEN: 'screen',
  TUG: 'tug',
  STEAL: 'steal',
  COUNTER_TETHER_CUT: 'counter_tether_cut',
  COUNTER_TETHER_OVERLOAD: 'counter_tether_overload',
  RETREAT: 'retreat',
  REFORM: 'reform',
});

export const ManeuverKind = Object.freeze({
  HOLD: 'hold',
  INTERCEPT: 'intercept',
  ORBIT: 'orbit',
  SCREEN: 'screen',
  FORMATION: 'formation',
  APPROACH_SOCKET: 'approach_socket',
  ESCAPE_TETHER: 'escape_tether',
  CUT_TETHER: 'cut_tether',
  RETREAT: 'retreat',
  CLEAR_DEADLOCK: 'clear_deadlock',
});

export const ContactKind = Object.freeze({
  SHIP: 'ship',
  PROJECTILE: 'projectile',
  TETHER: 'tether',
  OBJECTIVE: 'objective',
  HAZARD: 'hazard',
  WAYPOINT: 'waypoint',
});

export const TraceLayer = Object.freeze({
  DIRECTOR: 'director',
  SQUAD: 'squad',
  UTILITY: 'utility',
  BEHAVIOR: 'behavior',
  MANEUVER: 'maneuver',
  PERCEPTION: 'perception',
});

export function assertAIPorts(ports) {
  if (!ports || typeof ports !== 'object') throw new TypeError('SG-06 requires an AI ports object');
  requireMethod(ports.sensors, 'frameFor', 'ports.sensors');
  requireMethod(ports.actions, 'list', 'ports.actions');
  requireMethod(ports.actions, 'canStart', 'ports.actions');
  requireMethod(ports.actions, 'start', 'ports.actions');
  requireMethod(ports.actions, 'status', 'ports.actions');
  requireMethod(ports.actions, 'interrupt', 'ports.actions');
  requireMethod(ports.maneuver, 'request', 'ports.maneuver');
  requireMethod(ports.roster, 'listSquads', 'ports.roster');
  if (ports.encounter != null) requireMethod(ports.encounter, 'issue', 'ports.encounter');
  return ports;
}

export function normalizeSensorFrame(frame, entityId, tick) {
  if (frame && typeof frame === 'object' && frame[NORMALIZED_SENSOR_FRAME_FLAG] === true) return frame;
  if (!frame || typeof frame !== 'object') {
    return freezeWithFlag({
      tick,
      self: neutralSelf(entityId),
      contacts: Object.freeze([]),
      events: Object.freeze([]),
    }, NORMALIZED_SENSOR_FRAME_FLAG);
  }
  const self = normalizeSelf(frame.self, entityId);
  const contacts = Array.isArray(frame.contacts)
    ? frame.contacts.map(normalizeContact).filter(Boolean).sort(contactOrder)
    : [];
  const events = Array.isArray(frame.events)
    ? frame.events.map(normalizeEvent).filter(Boolean)
    : [];
  return freezeWithFlag({
    tick: finiteInt(frame.tick, tick),
    self: Object.freeze(self),
    contacts: Object.freeze(contacts),
    events: Object.freeze(events),
  }, NORMALIZED_SENSOR_FRAME_FLAG);
}

export function makeTrustedSensorFrame(frame, entityId, tick, options = {}) {
  if (!frame || typeof frame !== 'object') return normalizeSensorFrame(frame, entityId, tick);
  if (frame[NORMALIZED_SENSOR_FRAME_FLAG] === true) return frame;
  const freeze = options.freezeResults === false ? identity : Object.freeze;
  return freezeWithFlag({
    tick: finiteInt(frame.tick, tick),
    self: frame.self || neutralSelf(entityId),
    contacts: freeze(Array.isArray(frame.contacts) ? frame.contacts : []),
    events: freeze(Array.isArray(frame.events) ? frame.events : []),
  }, NORMALIZED_SENSOR_FRAME_FLAG, freeze);
}

export function normalizeActionDef(def) {
  if (!def || typeof def !== 'object' || typeof def.id !== 'string' || !def.id) return null;
  if (def.__spacefaceTacticalActionDef === true) return def;
  const tags = Array.isArray(def.tags) ? [...new Set(def.tags.filter((v) => typeof v === 'string'))].sort() : [];
  return Object.freeze({
    id: def.id,
    tags: Object.freeze(tags),
    minCommitTicks: finiteInt(def.minCommitTicks, 12),
    switchMargin: finite(def.switchMargin, 0.08),
    range: finite(def.range, 0),
    preferredRange: finite(def.preferredRange, finite(def.range, 0) * 0.75),
    targetKinds: Object.freeze(Array.isArray(def.targetKinds) ? def.targetKinds.slice().sort() : []),
    metadata: Object.freeze(isPlainObject(def.metadata) ? { ...def.metadata } : {}),
  });
}

export function makeThrusterRequest(entityId, tick, values = {}, options = {}) {
  const freeze = typeof options.freeze === 'function' ? options.freeze : Object.freeze;
  const forceLocal = values.forceLocal || {};
  const trajectory = Array.isArray(values.trajectory) && values.trajectory.length
    ? values.trajectory.slice(0, 8).map((point) => freeze({
        x: finite(point && point.x, 0),
        z: finite(point && point.z, 0),
        tick: finiteInt(point && point.tick, tick),
      }))
    : EMPTY_TRAJECTORY;
  return freezeWithFlag({
    version: AI_CONTRACT_VERSION,
    entityId,
    tick,
    kind: values.kind || ManeuverKind.HOLD,
    forceLocal: freeze({
      forward: clamp(finite(forceLocal.forward, 0), -1, 1),
      right: clamp(finite(forceLocal.right, 0), -1, 1),
    }),
    torqueYaw: clamp(finite(values.torqueYaw, 0), -1, 1),
    boost: !!values.boost,
    brake: !!values.brake,
    targetHeading: wrapAngle(finite(values.targetHeading, 0)),
    horizonTicks: clamp(finiteInt(values.horizonTicks, 30), 1, 240),
    trajectory: freeze(trajectory),
    reason: String(values.reason || 'no_reason'),
  }, NORMALIZED_THRUSTER_REQUEST_FLAG, freeze);
}

export function stableId(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return `n:${value}`;
  return `s:${String(value)}`;
}

export function hashUnit(seed, ...parts) {
  let h = (Number(seed) >>> 0) || 0x9e3779b9;
  const text = parts.map(stableId).join('|');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= h >>> 13;
  }
  return (h >>> 0) / 0x100000000;
}

export function clamp(value, min, max) {
  return value < min ? min : (value > max ? max : value);
}

export function saturate(value) {
  return clamp(value, 0, 1);
}

export function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function finiteInt(value, fallback = 0) {
  return Number.isInteger(value) ? value : fallback;
}

export function wrapAngle(angle) {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

export function length2(x, z) {
  return Math.hypot(x, z);
}

export function distance2(a, b) {
  return Math.hypot(finite(a && a.x) - finite(b && b.x), finite(a && a.z) - finite(b && b.z));
}

export function unit2(x, z, fallbackX = 1, fallbackZ = 0) {
  const len = Math.hypot(x, z);
  return len > 1e-9 ? { x: x / len, z: z / len } : { x: fallbackX, z: fallbackZ };
}

function requireMethod(target, name, label) {
  if (!target || typeof target[name] !== 'function') throw new TypeError(`${label}.${name}() is required`);
}

function neutralSelf(entityId) {
  return Object.freeze({
    id: entityId,
    team: null,
    pos: Object.freeze({ x: 0, z: 0 }),
    vel: Object.freeze({ x: 0, z: 0 }),
    rot: 0,
    radius: 1,
    hullFraction: 1,
    energyFraction: 1,
    heatFraction: 0,
    disabled: false,
    tethered: false,
    capabilities: Object.freeze([]),
    subsystemFractions: Object.freeze({}),
  });
}

function normalizeSelf(value, entityId) {
  if (!value || typeof value !== 'object') return neutralSelf(entityId);
  return {
    id: value.id == null ? entityId : value.id,
    team: value.team == null ? null : value.team,
    pos: freezeVec(value.pos),
    vel: freezeVec(value.vel),
    rot: wrapAngle(finite(value.rot, 0)),
    radius: Math.max(0.1, finite(value.radius, 1)),
    hullFraction: saturate(finite(value.hullFraction, 1)),
    energyFraction: saturate(finite(value.energyFraction, 1)),
    heatFraction: saturate(finite(value.heatFraction, 0)),
    disabled: !!value.disabled,
    tethered: !!value.tethered,
    capabilities: Object.freeze(Array.isArray(value.capabilities) ? [...new Set(value.capabilities)].sort() : []),
    subsystemFractions: Object.freeze(isPlainObject(value.subsystemFractions) ? { ...value.subsystemFractions } : {}),
  };
}

function normalizeContact(value) {
  if (!value || typeof value !== 'object' || value.id == null || typeof value.kind !== 'string') return null;
  return Object.freeze({
    id: value.id,
    kind: value.kind,
    team: value.team == null ? null : value.team,
    classification: typeof value.classification === 'string' ? value.classification : 'unknown',
    pos: freezeVec(value.pos),
    vel: freezeVec(value.vel),
    radius: Math.max(0, finite(value.radius, 0)),
    confidence: saturate(finite(value.confidence, 1)),
    threat: saturate(finite(value.threat, 0)),
    targetId: value.targetId == null ? null : value.targetId,
    ownerId: value.ownerId == null ? null : value.ownerId,
    attachmentId: value.attachmentId == null ? null : value.attachmentId,
    sourceSocketId: value.sourceSocketId == null ? null : String(value.sourceSocketId),
    targetSocketId: value.targetSocketId == null ? null : String(value.targetSocketId),
    ownedBySelf: !!value.ownedBySelf,
    exposed: !!value.exposed,
    tethered: !!value.tethered,
    disabled: !!value.disabled,
    objectiveValue: Math.max(0, finite(value.objectiveValue, 0)),
    massClass: Math.max(0, finite(value.massClass, 1)),
    tags: Object.freeze(Array.isArray(value.tags) ? [...new Set(value.tags)].sort() : []),
  });
}

function normalizeEvent(value) {
  if (!value || typeof value !== 'object' || typeof value.type !== 'string') return null;
  return Object.freeze({
    type: value.type,
    sourceId: value.sourceId == null ? null : value.sourceId,
    targetId: value.targetId == null ? null : value.targetId,
    magnitude: finite(value.magnitude, 0),
    tags: Object.freeze(Array.isArray(value.tags) ? value.tags.slice().sort() : []),
  });
}

function freezeVec(value) {
  return Object.freeze({ x: finite(value && value.x, 0), z: finite(value && value.z, 0) });
}

function freezeWithFlag(value, flag, freeze = Object.freeze) {
  Object.defineProperty(value, flag, { value: true });
  return freeze(value);
}

function identity(value) {
  return value;
}

function contactOrder(a, b) {
  const ak = `${a.kind}|${stableId(a.id)}`;
  const bk = `${b.kind}|${stableId(b.id)}`;
  return ak < bk ? -1 : (ak > bk ? 1 : 0);
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
