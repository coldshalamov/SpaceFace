// Massline threat events — read-only observer (massline rung 09).
// Runs immediately AFTER masslineTelemetry in UPDATE_ORDER: it reads the already-settled
// state.player.tether mirror (tetherGameplay) and state.player.masslineTelemetry kinematics, plus
// entities, and detects danger during an active swing. It writes ONLY its own runtime subtree at
// state.player.masslineThreats and emits exactly one documented event: `massline:threat`
// ({ kind, targetId, severity, tick, time }). It never mutates entities, attachments, the tether,
// or the telemetry subtree.
//
// Threat kinds (thresholds derived from the massline feel constants in masslineTelemetry.js so the
// reads stay consistent with the established feel):
//   • 'line-near-break'  — strain crossed the overload floor (0.75, the same bar as
//     REEL_PUMP_RISK_HIGH / the loaded→overload phase boundary): the line is approaching BREAK.
//     Emitted at most once per latch, when it first crosses — not every tick.
//   • 'hostile-on-arc'   — a hostile (via scanner.isHostileToPlayer — NEVER factionId) is closing
//     on the player while the player is genuinely swinging (|tangentialSpeed| >= 25, the
//     SNAP_CATCH_MIN_SPEED "genuinely moving" bar). Emitted at most once per hostile per latch.
//   • 'collision-course' — the player's current velocity carries them into a solid body
//     (asteroid/ship/station/drone, including the anchor itself) within ~1.5 s. Emitted at most
//     once per obstacle per latch.
import { isHostileToPlayer } from './scanner.js';

const THREAT_NEAR_BREAK_STRAIN = 0.75;   // overload floor — mirrors REEL_PUMP_RISK_HIGH (telemetry)
const THREAT_SWING_MIN_TANGENTIAL = 25;  // wu/s — mirrors SNAP_CATCH_MIN_SPEED ("genuinely moving")
const THREAT_HOSTILE_RADIUS = 260;       // wu — hostiles inside this can contest the swing
const THREAT_HOSTILE_CLOSING_MIN = 12.5; // wu/s — half the snap-catch bar; closing for real
const THREAT_HOSTILE_ETA_S = 8;          // s — eta horizon mapping closing hostiles to severity
const THREAT_COLLISION_HORIZON_S = 1.5;  // s — predicted-impact look-ahead window
const THREAT_SCAN_RADIUS = 400;          // wu — collision candidates beyond this can't matter in 1.5 s
const THREAT_SEVERITY_FLOOR = 0.25;      // any confirmed hostile/collision threat reads at least this
const THREAT_LOG_CAP = 12;               // per-latch record cap (oldest dropped)

// Solid bodies the player can actually hit. Pickups/pings/etc. are not collision threats.
const COLLIDABLE_TYPES = new Set(['asteroid', 'ship', 'station', 'drone']);

const FALLBACK = Object.freeze({
  active: false,
  threats: Object.freeze([]),
  latest: null,
});

export const masslineThreats = {
  id: 'masslineThreats',
  name: 'masslineThreats',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    // Per-latch throttle state. System-private, like masslineTelemetry's _latchedTargetId.
    this._latchedTargetId = null;
    this._nearBreakFired = false;
    this._warnedHostiles = new Set();
    this._warnedCollisions = new Set();
  },

  update(dt, state) {
    const playerState = state.player || (state.player = {});
    const runtime = ensureThreatsSubtree(playerState);

    const tether = playerState.tether;
    const active = !!(tether && tether.active && tether.targetId != null);
    if (!active) {
      // No active swing: no threat reads. Clear per-latch accumulators, emit nothing.
      writeInactive(runtime);
      this._resetLatch(null);
      return;
    }

    const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
    if (!player || !player.pos || !player.vel) {
      writeInactive(runtime);
      this._resetLatch(null);
      return;
    }

    // Latch reset: tether became active on a new targetId since our previous update. Threat
    // throttles are per-latch, so a new latch re-arms every kind.
    if (this._latchedTargetId !== tether.targetId) {
      this._resetLatch(tether.targetId);
      runtime.threats.length = 0;
      runtime.latest = null;
    }

    runtime.active = true;

    // 1. line-near-break — strain crossed the overload floor. Once per latch, on first cross.
    const strain = finite(tether.strain, 0);
    if (!this._nearBreakFired && strain >= THREAT_NEAR_BREAK_STRAIN) {
      this._nearBreakFired = true;
      this._emitThreat(runtime, state, 'line-near-break', tether.targetId, clamp01(strain));
    }

    // Swing gate for hostile-on-arc: the player is genuinely swinging (telemetry runs just before
    // us in UPDATE_ORDER, so tangentialSpeed is this tick's settled read).
    const telemetry = playerState.masslineTelemetry;
    const swinging = !!(telemetry && telemetry.active)
      && Math.abs(finite(telemetry.tangentialSpeed, 0)) >= THREAT_SWING_MIN_TANGENTIAL;

    // 2 + 3. Single entity pass: hostiles closing on the swing, bodies on a predicted impact.
    const entities = state.entities;
    if (!entities || typeof entities.values !== 'function') return;
    const playerTeam = player.team;
    for (const e of entities.values()) {
      if (!e || !e.alive || e.id === player.id || !e.pos) continue;

      if (swinging && !this._warnedHostiles.has(e.id)
          && (e.type === 'ship' || e.type === 'drone')
          && isHostileToPlayer(e, playerTeam, state)) {
        const severity = hostileClosingSeverity(player, e);
        if (severity != null) {
          this._warnedHostiles.add(e.id);
          this._emitThreat(runtime, state, 'hostile-on-arc', e.id, severity);
        }
      }

      if (!this._warnedCollisions.has(e.id)
          && COLLIDABLE_TYPES.has(e.type) && Number.isFinite(e.radius)) {
        const t = timeToImpact(player, e);
        if (t != null && t <= THREAT_COLLISION_HORIZON_S) {
          this._warnedCollisions.add(e.id);
          const severity = Math.max(THREAT_SEVERITY_FLOOR, clamp01(1 - t / THREAT_COLLISION_HORIZON_S));
          this._emitThreat(runtime, state, 'collision-course', e.id, severity);
        }
      }
    }
  },

  _resetLatch(targetId) {
    this._latchedTargetId = targetId;
    this._nearBreakFired = false;
    if (this._warnedHostiles) this._warnedHostiles.clear();
    if (this._warnedCollisions) this._warnedCollisions.clear();
  },

  // The single documented emit. The record is mirrored at runtime.latest + runtime.threats (this
  // system's own subtree) and the emitted payload IS the mirrored record (single source of truth,
  // same discipline as telemetry.snapCatch/reelPump).
  _emitThreat(runtime, state, kind, targetId, severity) {
    const tick = Number.isFinite(state.tick) ? state.tick : null;
    const time = Number.isFinite(state.simTime) ? state.simTime
      : (tick != null ? tick / 60 : null);
    const record = { kind, targetId: targetId != null ? targetId : null, severity, tick, time };
    runtime.threats.push(record);
    if (runtime.threats.length > THREAT_LOG_CAP) runtime.threats.shift();
    runtime.latest = record;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('massline:threat', record);
    }
  },
};

// Closing read for a hostile: positive range-rate toward the player inside the contest radius.
// Severity maps the closing eta onto [floor..1] — a hostile 2 s out reads hotter than one 7 s out.
function hostileClosingSeverity(player, hostile) {
  const hx = finite(hostile.pos.x, 0) - finite(player.pos.x, 0);
  const hz = finite(hostile.pos.z, 0) - finite(player.pos.z, 0);
  const dist = Math.hypot(hx, hz);
  if (dist > THREAT_HOSTILE_RADIUS || dist < 1e-6) return null;
  const rvx = finite(hostile.vel && hostile.vel.x, 0) - finite(player.vel.x, 0);
  const rvz = finite(hostile.vel && hostile.vel.z, 0) - finite(player.vel.z, 0);
  // Range rate d|h|/dt = (h·rv)/|h|; negative = the gap is shrinking. closing = -(range rate).
  const closing = -((hx * rvx + hz * rvz) / dist);
  if (closing < THREAT_HOSTILE_CLOSING_MIN) return null;
  const eta = dist / closing;
  return Math.max(THREAT_SEVERITY_FLOOR, clamp01(1 - eta / THREAT_HOSTILE_ETA_S));
}

// First-contact time for the player's ballistic path vs a solid body: smallest t > 0 with
// |r - w t| = R, where r = body - player (positions), w = player.vel - body.vel, and R is the
// combined radius. null = no predicted impact (diverging, missing, or already overlapping —
// an overlap is a collision, not a course; combat owns that).
function timeToImpact(player, e) {
  const rx = finite(e.pos.x, 0) - finite(player.pos.x, 0);
  const rz = finite(e.pos.z, 0) - finite(player.pos.z, 0);
  const rr = rx * rx + rz * rz;
  if (rr > THREAT_SCAN_RADIUS * THREAT_SCAN_RADIUS) return null;
  const wx = finite(player.vel.x, 0) - finite(e.vel && e.vel.x, 0);
  const wz = finite(player.vel.z, 0) - finite(e.vel && e.vel.z, 0);
  const ww = wx * wx + wz * wz;
  if (ww < 1e-9) return null;
  const R = Math.max(0, finite(e.radius, 0)) + Math.max(0, finite(player.radius, 6));
  if (rr <= R * R) return null;
  const rw = rx * wx + rz * wz;
  if (rw <= 0) return null;                    // moving apart or tangent — never closes
  const disc = rw * rw - ww * (rr - R * R);
  if (disc <= 0) return null;                  // closest approach still misses the body
  return (rw - Math.sqrt(disc)) / ww;
}

function ensureThreatsSubtree(playerState) {
  if (!playerState.masslineThreats) playerState.masslineThreats = freshRuntime();
  return playerState.masslineThreats;
}

function freshRuntime() {
  return {
    active: false,
    threats: [],
    latest: null,
  };
}

function writeInactive(runtime) {
  runtime.active = false;
  // Threat records are per-latch reads; clearing on inactive keeps the subtree free of stale
  // accumulators (same discipline as telemetry's max*SinceLatch).
  runtime.threats.length = 0;
  runtime.latest = null;
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

export { FALLBACK };
