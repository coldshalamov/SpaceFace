// SG-08 semantic presentation event contract.
// This module is deliberately renderer/audio/DOM-free so simulation producers and headless tools
// can validate envelopes without importing a presentation backend.

export const PRESENTATION_EVENT_VERSION = 1;

export const CRITICAL_SLICE_EVENT_IDS = Object.freeze([
  'tether.attach',
  'tether.near_break',
  'tether.break',
  'shield.collapse',
  'subsystem.disabled',
]);

export const PRESENTATION_EVENT_SCHEMA = Object.freeze({
  $id: 'spaceface.presentation-event.v1',
  type: 'object',
  required: ['id'],
  additionalProperties: true,
  properties: {
    version: { type: 'integer', const: PRESENTATION_EVENT_VERSION },
    id: { type: 'string', pattern: '^[a-z][a-z0-9_]*(?:\\.[a-z][a-z0-9_]*)+$' },
    importance: { type: 'number', minimum: 0, maximum: 1 },
    playerRelevance: { type: 'number', minimum: 0, maximum: 1 },
    direction: {
      anyOf: [
        { type: 'null' },
        { type: 'object', required: ['x', 'z'], properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } } },
      ],
    },
    magnitude: { type: 'number', minimum: 0 },
    material: { type: 'string' },
    distance: { type: 'number', minimum: 0 },
    position: { type: 'object', required: ['x', 'z'], properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } } },
    sourceId: { anyOf: [{ type: 'string' }, { type: 'integer' }, { type: 'null' }] },
    targetId: { anyOf: [{ type: 'string' }, { type: 'integer' }, { type: 'null' }] },
    subsystemId: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    socket: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    simTimeMs: { type: 'number', minimum: 0 },
    sequence: { anyOf: [{ type: 'string' }, { type: 'integer' }, { type: 'null' }] },
    tags: { type: 'array', items: { type: 'string' }, uniqueItems: true },
    payload: { type: 'object' },
  },
});

const EVENT_ID_RE = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}

function entityPosition(state, id) {
  if (!state || id == null || !state.entities || typeof state.entities.get !== 'function') return null;
  const entity = state.entities.get(id);
  return entity && entity.pos ? entity.pos : null;
}

function positionFrom(raw, state) {
  const p = raw && (raw.position || raw.pos || raw.hitPoint || raw.contactPos || raw.sourcePos);
  if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) {
    return { x: p.x, y: finite(p.y), z: p.z };
  }
  const id = raw && (raw.targetId ?? raw.sourceId ?? raw.attackerId ?? raw.ownerId ?? raw.id);
  const ep = entityPosition(state, id);
  return ep ? { x: finite(ep.x), y: finite(ep.y), z: finite(ep.z) } : null;
}

function normalizeDirection(direction) {
  if (!direction || !Number.isFinite(direction.x) || !Number.isFinite(direction.z)) return null;
  const x = direction.x;
  const y = finite(direction.y);
  const z = direction.z;
  const length = Math.hypot(x, y, z);
  if (length < 1e-6) return null;
  return { x: x / length, y: y / length, z: z / length };
}

function inferSpatial(raw, state, position) {
  const suppliedDirection = normalizeDirection(raw && raw.direction);
  const suppliedDistance = raw && raw.distance;
  if (suppliedDirection && Number.isFinite(suppliedDistance)) {
    return { direction: suppliedDirection, distance: Math.max(0, suppliedDistance) };
  }

  const player = state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : null;
  if (!player || !player.pos || !position) {
    return {
      direction: suppliedDirection,
      distance: Number.isFinite(suppliedDistance) ? Math.max(0, suppliedDistance) : 0,
    };
  }

  const dx = position.x - finite(player.pos.x);
  const dy = finite(position.y) - finite(player.pos.y);
  const dz = position.z - finite(player.pos.z);
  const distance = Math.hypot(dx, dy, dz);
  return {
    direction: suppliedDirection || normalizeDirection({ x: dx, y: dy, z: dz }),
    distance: Number.isFinite(suppliedDistance) ? Math.max(0, suppliedDistance) : distance,
  };
}

function inferRelevance(raw, state, distance) {
  if (Number.isFinite(raw && raw.playerRelevance)) return clamp(raw.playerRelevance, 0, 1);
  const playerId = state && state.playerId;
  if (playerId != null) {
    const targetId = raw && (raw.targetId ?? raw.combatantId ?? raw.id);
    const sourceId = raw && (raw.sourceId ?? raw.attackerId ?? raw.ownerId ?? raw.killerId);
    if (targetId === playerId) return 1;
    if (sourceId === playerId) return 0.88;
  }
  if (distance <= 80) return 0.72;
  if (distance <= 250) return 0.52;
  if (distance <= 700) return 0.28;
  return 0.08;
}

function stablePart(value) {
  if (value == null || value === '') return '-';
  return String(value).replace(/[:|]/g, '_');
}

export function presentationDedupeKey(event) {
  if (event.dedupeKey) return String(event.dedupeKey);
  return [
    event.id,
    stablePart(event.sourceId),
    stablePart(event.targetId),
    stablePart(event.subsystemId),
    stablePart(event.material),
    stablePart(event.sequence),
  ].join('|');
}

export function validatePresentationEvent(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['event must be an object'] };
  }
  const id = raw.id || raw.eventId;
  if (typeof id !== 'string' || !EVENT_ID_RE.test(id)) errors.push('id must be a dotted lowercase semantic identifier');
  for (const field of ['importance', 'playerRelevance']) {
    if (raw[field] != null && (!Number.isFinite(raw[field]) || raw[field] < 0 || raw[field] > 1)) {
      errors.push(`${field} must be in [0,1]`);
    }
  }
  for (const field of ['magnitude', 'distance', 'simTimeMs']) {
    if (raw[field] != null && (!Number.isFinite(raw[field]) || raw[field] < 0)) errors.push(`${field} must be a non-negative number`);
  }
  if (raw.direction != null && !normalizeDirection(raw.direction)) errors.push('direction must contain a non-zero finite x/z vector');
  const p = raw.position || raw.pos || raw.hitPoint || raw.contactPos;
  if (p != null && (!Number.isFinite(p.x) || !Number.isFinite(p.z))) errors.push('position must contain finite x/z values');
  return { ok: errors.length === 0, errors };
}

export function normalizePresentationEvent(raw, state, presentationTimeMs = 0) {
  const check = validatePresentationEvent(raw);
  if (!check.ok) {
    const error = new TypeError(`Invalid presentation event: ${check.errors.join('; ')}`);
    error.validationErrors = check.errors;
    throw error;
  }

  const id = raw.id || raw.eventId;
  const position = positionFrom(raw, state);
  const spatial = inferSpatial(raw, state, position);
  const targetId = raw.targetId ?? raw.combatantId ?? (id === 'combat.kill' ? raw.id : null);
  const sourceId = raw.sourceId ?? raw.attackerId ?? raw.ownerId ?? raw.killerId ?? null;
  const magnitude = Math.max(0, finite(raw.magnitude, finite(raw.amount, finite(raw.damage, finite(raw.impulse, 1)))));
  const importance = clamp(finite(raw.importance, 0.5), 0, 1);
  const event = {
    version: PRESENTATION_EVENT_VERSION,
    id,
    importance,
    playerRelevance: inferRelevance(raw, state, spatial.distance),
    direction: spatial.direction,
    magnitude,
    material: String(raw.material || raw.damageType || raw.type || 'unknown'),
    distance: Math.max(0, finite(spatial.distance)),
    position,
    sourceId,
    targetId,
    subsystemId: raw.subsystemId || null,
    socket: raw.socket || null,
    simTimeMs: Math.max(0, finite(raw.simTimeMs, finite(state && state.simTime, 0) * 1000)),
    presentationTimeMs: Math.max(0, finite(presentationTimeMs)),
    sequence: raw.sequence ?? null,
    tags: Array.isArray(raw.tags) ? [...new Set(raw.tags.filter((tag) => typeof tag === 'string'))] : [],
    payload: raw.payload && typeof raw.payload === 'object' ? raw.payload : raw,
  };
  event.dedupeKey = presentationDedupeKey({ ...event, dedupeKey: raw.dedupeKey });
  return event;
}
