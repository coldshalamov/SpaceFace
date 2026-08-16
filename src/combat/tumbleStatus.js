// AC-04 — canonical control-loss ("tumble") identity, shared by every authored source that can
// genuinely overwhelm a hull: the Massline (throw / whip), physical contact
// (systems/collisionConsequences.js), and a direct authored weapon impulse (combat damage routing).
//
// One status id, one zero-control/recovery owner (systems/tumbleStates.js), distinct provenance per
// source. Sources keep their own admission gates and their own entry geometry; what they share is
// this identity, the physical entry threshold, and the entry-spin band.
//
// This module is pure over a state snapshot. It never schedules, clears, or mutates anything, and it
// never touches `rot`, `angVel`, or velocity — entry torque always crosses the physics command port
// at the producer.
import { COLLISION_CONSEQUENCE_LIMITS } from './impulseKernel.js';

export const TUMBLE_STATUS_ID = 'status_tumbling';
export const MASSLINE_TUMBLE_KIND = 'massline_tumble';
export const COLLISION_TUMBLE_KIND = 'collision_tumble';
export const IMPULSE_TUMBLE_KIND = 'impulse_tumble';

/** Supported tumble kind -> coarse source label carried into presentation and physics provenance. */
export const TUMBLE_KIND_SOURCES = Object.freeze({
  [MASSLINE_TUMBLE_KIND]: 'massline',
  [COLLISION_TUMBLE_KIND]: 'collision',
  [IMPULSE_TUMBLE_KIND]: 'weapon_impulse',
});

// Entry spin band, shared so a contact tumble and an authored-impulse tumble of the same severity
// read the same. Matches the contact-consequence band this slice generalizes from.
export const TUMBLE_ENTRY_SPIN_MIN = 0.8;   // rad/s
export const TUMBLE_ENTRY_SPIN_MAX = 4;     // rad/s

// A fully overwhelmed hull owns the widest control-loss window the contact-consequence kernel
// grants. An authored impulse past the same delta-v threshold owns the same window — reused, not a
// second hidden dial.
export const TUMBLE_ENTRY_DURATION_TICKS = COLLISION_CONSEQUENCE_LIMITS.maxStaggerTicks;

export function isSupportedTumbleKind(kind) {
  return typeof kind === 'string' && Object.prototype.hasOwnProperty.call(TUMBLE_KIND_SOURCES, kind);
}

export function tumbleSourceForKind(kind) {
  return isSupportedTumbleKind(kind) ? TUMBLE_KIND_SOURCES[kind] : null;
}

/** The supported kind a scheduled/active `status_tumbling` record carries, or null. */
export function tumbleKindOf(status) {
  const kind = status && status.data && status.data.kind;
  return isSupportedTumbleKind(kind) ? kind : null;
}

/**
 * The live tumble record for this entity from ANY supported source (active first, then the pending
 * queue in schedule order). This is what the shared control-loss owner reads.
 */
export function readTumbleStatus(state, entityOrId) {
  return findTumbleStatus(state, entityOrId, (status) => tumbleKindOf(status) !== null);
}

export function isTumbling(state, entityOrId) {
  return readTumbleStatus(state, entityOrId) !== null;
}

/**
 * Massline-only view. Deliberately NARROW and unchanged: `masslineImpactDamage` uses it to decide
 * which uncontrolled hulls take whip contact damage, and widening it would silently extend that
 * damage to collision and weapon-impulse tumbles.
 */
export function readMasslineTumbleStatus(state, entityOrId) {
  return findTumbleStatus(state, entityOrId, isMasslineTumble);
}

export function isMasslineTumbling(state, entityOrId) {
  return readMasslineTumbleStatus(state, entityOrId) !== null;
}

/** Immutable provenance/timing view for presentation and traces. Pure; never fabricates a cause. */
export function describeTumbleStatus(status) {
  const kind = tumbleKindOf(status);
  if (!kind) return null;
  const data = status.data;
  return Object.freeze({
    kind,
    source: typeof data.source === 'string' ? data.source : TUMBLE_KIND_SOURCES[kind],
    cause: typeof data.cause === 'string' ? data.cause : null,
    startedAt: Number.isFinite(data.startedAt) ? data.startedAt : null,
    until: Number.isFinite(data.until) ? data.until : null,
    spin: Number.isFinite(data.spin) ? Math.abs(data.spin) : null,
    attackerId: status.attackerId == null ? null : status.attackerId,
  });
}

/**
 * Ticks of tumble window this hull already owns (the widest of the active record and any queued
 * application). Takeover uses it so a shorter second source cannot truncate a longer live spin —
 * `statuses.js` applies `status_tumbling` in `refresh` mode, which rewrites `expiresTick` outright.
 */
export function remainingTumbleTicks(state, entityOrId, tick) {
  const runtime = combatRuntimeFor(state, entityOrId);
  if (!runtime) return 0;
  const now = nonNegativeInteger(tick != null ? tick : state && state.tick);
  let remaining = 0;
  const active = runtime.statuses && runtime.statuses[TUMBLE_STATUS_ID];
  if (tumbleKindOf(active) && Number.isFinite(active.expiresTick)) {
    remaining = Math.max(remaining, active.expiresTick - now);
  }
  for (const pending of Array.isArray(runtime.pendingStatuses) ? runtime.pendingStatuses : []) {
    if (!pending || pending.id !== TUMBLE_STATUS_ID || !tumbleKindOf(pending)) continue;
    const applyTick = Number.isFinite(pending.applyTick) ? pending.applyTick : now;
    const duration = Number.isFinite(pending.durationTicks) ? pending.durationTicks : 0;
    remaining = Math.max(remaining, applyTick + duration - now);
  }
  return Math.max(0, remaining);
}

/**
 * Shared admission rule for every tumble producer.
 *
 * A source never re-enters its OWN state — otherwise a body grinding along a rock would restart its
 * entry spin on every admitted contact, which is a hidden spin amplifier rather than physics. A
 * genuinely different authored source may take the state over (it carries new provenance), and a
 * takeover never shortens the window the hull already owns.
 *
 * Returns null when the entry must be refused; otherwise the resolved kind/source/duration.
 */
export function resolveTumbleEntry(state, entityOrId, input = {}) {
  const kind = input.kind;
  if (!isSupportedTumbleKind(kind)) return null;
  const current = readTumbleStatus(state, entityOrId);
  const currentKind = tumbleKindOf(current);
  if (currentKind === kind) return null;
  const requested = Math.max(1, Math.ceil(nonNegativeFinite(input.durationTicks)) || 1);
  const tick = nonNegativeInteger(input.tick != null ? input.tick : state && state.tick);
  const owned = currentKind ? remainingTumbleTicks(state, entityOrId, tick) : 0;
  return Object.freeze({
    kind,
    source: TUMBLE_KIND_SOURCES[kind],
    durationTicks: Math.max(requested, Math.ceil(owned)),
    takeoverFromKind: currentKind,
  });
}

/**
 * The one physical entry test: an external delta-v this large is past what the hull's attitude
 * authority can hold. Callers derive delta-v from the real impulse and the target's own mass, so a
 * heavy hull resists the same authored impulse that flips a light one.
 */
export function overwhelmsAttitudeControl(deltaV) {
  return Number.isFinite(deltaV) && deltaV >= COLLISION_CONSEQUENCE_LIMITS.tumbleDeltaV;
}

/** Entry spin (rad/s) for a delta-v applied to a hull of this radius, inside the shared band. */
export function resolveTumbleEntrySpin(deltaV, radius) {
  const r = Math.max(0.1, nonNegativeFinite(radius) || 1);
  const omega = nonNegativeFinite(deltaV) / r;
  return Math.max(TUMBLE_ENTRY_SPIN_MIN, Math.min(TUMBLE_ENTRY_SPIN_MAX, omega));
}

/**
 * Yaw inertia used to turn a target spin into a real angular impulse (impulse = inertia × Δω).
 * Authored body inertia wins; the fallback is the solid-disc figure for the hull's own mass/radius,
 * so heavier and wider hulls demand proportionally more angular impulse for the same spin.
 */
export function resolveTumbleInertiaY(entity) {
  const authored = entity && entity.data && entity.data.physicsBody && entity.data.physicsBody.inertiaY;
  if (Number.isFinite(authored) && authored > 0) return Math.max(0.1, authored);
  const mass = Math.max(0.1, nonNegativeFinite(entity && entity.mass) || 1);
  const radius = Math.max(0.1, nonNegativeFinite(entity && entity.radius) || 1);
  return Math.max(0.1, 0.5 * mass * radius * radius);
}

/**
 * Deterministic entry-spin sign for sources whose geometry gives none. Stable per entity id, and
 * byte-identical to the parity rule the contact path has always used.
 */
export function stableTumbleSpinSign(id) {
  return tumbleIdParity(id) ? 1 : -1;
}

function tumbleIdParity(value) {
  if (Number.isFinite(value)) return Math.abs(Math.trunc(value)) % 2;
  const text = String(value);
  let sum = 0;
  for (let i = 0; i < text.length; i++) sum += text.charCodeAt(i);
  return sum % 2;
}

function findTumbleStatus(state, entityOrId, predicate) {
  const runtime = combatRuntimeFor(state, entityOrId);
  if (!runtime) return null;

  const active = runtime.statuses && runtime.statuses[TUMBLE_STATUS_ID];
  if (predicate(active)) return active;

  for (const pending of Array.isArray(runtime.pendingStatuses) ? runtime.pendingStatuses : []) {
    if (pending && pending.id === TUMBLE_STATUS_ID && predicate(pending)) return pending;
  }
  return null;
}

function combatRuntimeFor(state, entityOrId) {
  const id = entityOrId && typeof entityOrId === 'object' ? entityOrId.id : entityOrId;
  if (id == null) return null;
  return state && state.combat && state.combat.entities
    ? state.combat.entities[String(id)] || null
    : null;
}

function isMasslineTumble(status) {
  return !!(status && status.data && status.data.kind === MASSLINE_TUMBLE_KIND);
}

function nonNegativeFinite(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function nonNegativeInteger(value) {
  return Math.max(0, Math.trunc(Number.isFinite(value) ? value : 0));
}
