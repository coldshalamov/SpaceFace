// Massline throw system (Wave M2 §3.3/§4.1, design/revamp/MASSLINE_PHYSICS_IDENTITY.md).
//
// The intent model in one sentence: F frees YOU, RMB throws THEM (input.js owns the RMB
// arbitration; we read actions.throwArm). Reeling is the physically-honest spin-up (conservation
// of angular momentum through the Rapier constraint); this system supplies the release
// precision the player's hardware can't, and the designed payoff of a taut release at the
// tangent. That release sends the lighter hull into a lethal meeting with a nearby body. The
// player's own exit gains no free speed — selfSlingBonusDv stays zero. The line is not given a
// break timer, a heat limit, a snap load, or a stamina bar.
//
// Runs AFTER tetherGameplay/masslineTelemetry/masslineImpacts in UPDATE_ORDER so it reads settled
// tether state. NOT in the sf-sim curated harness; every behavioral path is additionally gated on
// massline2Flag('throw') so headless contract checks see a no-op. Writes ONLY its own
// state.massline2.throw subtree (outside the sim-snapshot whitelist and the save schema) and cuts
// the attachment through the same service tetherGameplay uses. A tangent meeting aims the lighter
// hull through the physics impulse; the cut itself still adds no free speed.
import { massline2Flag } from '../data/featureFlags.js';
import { DAMAGE_MODEL } from '../data/combatDefs.js';
import { sampleThrowSolution, tetherPairKinematics } from '../combat/tetherFireControl.js';
import { resolveCollisionConsequence } from '../combat/impulseKernel.js';
import { scalarHitToDamagePacket } from '../combat/damage.js';
import { sampleFieldAcceleration } from '../core/fields/fieldKernel.js';
import { queryNearbyEntities } from '../core/spatialQuery.js';
import { forecastCadenceWindow } from '../combat/masslineReleaseGeometry.js';
import { resolveThrowWhoosh } from '../audio/masslineInstrument.js';
import { assessTangentRelease } from './tetherGameplay.js';

// --- Dials (design doc §12) -----------------------------------------------------------------
const SNAP_WINDOW_MS = 90;          // forward-only queue ceiling; 5 fixed ticks at 60 Hz
const CURSOR_AIM_GRACE = 48;        // wu of surface miss that still soft-snaps the throw aim
const SLING_RELEASE_SPEED_FRACTION = 0; // compatibility export: no free release energy
const SLING_MIN_EXIT_SPEED = 25;    // "genuinely moving" bar (mirrors SNAP_CATCH_MIN_SPEED)
const THROW_MIN_PAYLOAD_SPEED = 25; // don't auto-cut a parked payload — no throw below this
const AIM_QUERY_RADIUS = 220;       // cursor-aim entity search radius around aimWorld

const AIMABLE_TYPES = new Set(['ship', 'drone', 'asteroid', 'station', 'wreck', 'payload']);

// A taut tangent release spends the swing on a meeting inside the standard line's own reach.
// The killing budget includes a short shield-regen pad so the hull is still dead when it arrives.
export const TANGENT_MEETING_RADIUS = 390;
export const TANGENT_MEETING_MAX_SPEED = 180;
const TANGENT_MEETING_ARRIVE_S = 0.75;
const TANGENT_MEETING_SHIELD_PAD = 25;
const TANGENT_MEETING_BODY_TYPES = new Set(['ship', 'drone', 'asteroid', 'planet', 'station', 'wreck']);

// INF-016 — turning-target confidence. The intercept solver extrapolates the aim target
// ballistically, so a target changing course invalidates the release read without invalidating
// the geometry: reachability (can the payload get there) stays on the straight-line solver,
// while interception (is this the timed frame) degrades. Heading history is entity kinematics
// plus fixed ticks only — deterministic, no steering: the throw is never aimed for the player.
export const TURN_TRACK_WINDOW_TICKS = 15;
export const TURN_DEGRADE_RAD = 0.12;
export const TURN_MIN_SPEED = 15;
export function assessTargetTurn(track, targetId, vel, tick) {
  const t = Math.max(0, Math.trunc(Number(tick) || 0));
  if (targetId == null || !vel || !Number.isFinite(vel.x) || !Number.isFinite(vel.z)) {
    return { track: null, degraded: false, turnRate: 0 };
  }
  const speed = Math.hypot(vel.x, vel.z);
  let samples = track && track.id === targetId && Array.isArray(track.samples) ? track.samples : [];
  samples = [...samples.filter((s) => t - s.tick <= TURN_TRACK_WINDOW_TICKS), { vx: vel.x, vz: vel.z, tick: t }];
  const next = { id: targetId, samples };
  if (speed < TURN_MIN_SPEED) return { track: next, degraded: false, turnRate: 0 };
  const oldest = samples[0];
  const oldSpeed = Math.hypot(oldest.vx, oldest.vz);
  if (oldSpeed < TURN_MIN_SPEED || samples.length < 2) return { track: next, degraded: false, turnRate: 0 };
  const dot = oldest.vx * vel.x + oldest.vz * vel.z;
  const cos = Math.max(-1, Math.min(1, dot / (oldSpeed * speed)));
  const angle = Math.acos(cos);
  const windowS = Math.max(1 / 60, (t - oldest.tick) / 60);
  return { track: next, degraded: angle > TURN_DEGRADE_RAD, turnRate: angle / windowS };
}

const FALLBACK = Object.freeze({
  armed: false,
  payloadId: null,
  aimTargetId: null,
  aimSynthetic: false,
  releaseTarget: null,
  solution: null,
  selfSolution: null,
  lastThrow: null,
});

export const masslineThrow = {
  id: 'masslineThrow',
  name: 'masslineThrow',

  init(ctx) {
    this.destroy(); // Reinitialisation must not duplicate bus listeners.
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this.registry = ctx.registry;
    this._aimScratch = [];
    // Pointer authority may persist for many fixed ticks. Keep both possible target shapes resident
    // so a held mouse/right-stick/touch aim mutates transient truth instead of allocating per tick.
    this._pointerEntityReleaseTarget = entityReleaseTarget(null, 'pointer');
    this._pointerPointReleaseTarget = pointReleaseTarget('point', 'pointer', 0, 0, 2);
    this._solutionWasOn = false;
    this._throwArmWasHeld = false;
    this._pendingSnap = null;
    this._throwPrediction = {};
    this._selfPrediction = {};
    this._throwTurnTrack = null;
    this._selfTurnTrack = null;
    this._pendingReleaseValidation = null;
    this._releaseLatchActive = false;
    this._releaseLatchPayloadId = null;
    this._releaseLatchAttachmentId = null;
    // Swing cache: telemetry wipes on the cut tick (the mirror is already inactive when it runs),
    // so the release consumers read last tick's settled swing from here.
    this._swing = null;
    this._armAuthorized = false;
    this._windowForecast = null;
    this._releaseAttemptTick = -1;
    this._tangentMeeting = null;
    this._unsubs = [];
    if (this.bus && typeof this.bus.on === 'function') {
      this._unsubs.push(this.bus.on('tether:cut', (p) => this._onManualCut(p || {})));
      for (const name of ['save:loaded', 'game:new', 'game:started', 'sector:exit', 'sector:enter']) {
        this._unsubs.push(this.bus.on(name, () => this._resetCadenceThrow(this.state)));
      }
    }
  },

  destroy() {
    for (const off of this._unsubs || []) { if (typeof off === 'function') off(); }
    this._unsubs = [];
  },

  _resetCadenceThrow(state) {
    if (state) writeIdle(ensureThrowSubtree(state));
    this._clearReleaseLatch();
    this._throwPrediction = {}; this._selfPrediction = {};
    this._throwTurnTrack = null; this._selfTurnTrack = null;
    this._swing = null; this._pendingSnap = null; this._windowForecast = null;
    this._pendingReleaseValidation = null; this._armAuthorized = false;
    this._releaseAttemptTick = -1; this._solutionWasOn = false;
    // A held input across a menu/load/latch boundary is NOT a new throw press.
    this._throwArmWasHeld = !!(state && state.input && state.input.actions && state.input.actions.throwArm);
  },

  update(dt, state) {
    const runtime = ensureThrowSubtree(state);
    this._settleReleaseValidation(state, runtime);
    this._advanceTangentMeeting(state, dt);
    const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
    const tether = state.player && state.player.tether;
    if (!massline2Flag('throw') || state.mode !== 'flight' || !player || !player.alive
        || !tether || !tether.active || tether.targetId == null) {
      this._resetCadenceThrow(state);
      return;
    }
    const payload = state.entities.get(tether.targetId);
    if (!payload || payload.alive === false || !payload.pos || !payload.vel) {
      this._resetCadenceThrow(state);
      return;
    }
    this._syncReleaseTargetOnLatch(state, player, payload, tether, runtime);
    const kin = tetherPairKinematics(player, payload);
    this._swing = { anchorId: payload.id, playerMass: Math.max(0.1, finite(player.mass, 1)),
      taut: String(tether.phase || 'slack') !== 'slack',
      load: String(tether.phase || 'slack') === 'slack' ? 0 : clamp01(finite(tether.load, 0)) };
    const armed = !!(state.input && state.input.actions && state.input.actions.throwArm);
    const pressed = armed && !this._throwArmWasHeld;
    this._throwArmWasHeld = armed;
    if (!armed) this._armAuthorized = false;
    if (pressed) this._armAuthorized = true;
    runtime.armed = armed || !!this._pendingSnap;
    runtime.payloadId = payload.id;
    runtime.selfSolution = this._selfSolution(state, player, kin.omega);
    const aim = this._resolveThrowAim(state, player, payload, runtime);
    const mode = releaseAssistMode(state);
    const identity = releasePredictionIdentity(payload.id, runtime.releaseTarget);
    if (this._pendingSnap && (this._pendingSnap.identity !== identity
        || this._pendingSnap.attachmentId !== tether.attachmentId || !aim)) {
      this.bus.emit('massline:releaseCancelled', { sourceId: player.id, payloadId: payload.id,
        reason: 'release_identity_changed', tick: state.tick });
      this._pendingSnap = null;
      runtime.armed = armed;
      this._armAuthorized = false;
      runtime.solution = null; this._throwPrediction = {}; this._windowForecast = null;
      this._solutionWasOn = false;
      return; // A changed pointer/target never redirects an already queued release.
    }
    if (!aim) {
      runtime.aimTargetId = null; runtime.aimSynthetic = false; runtime.solution = null;
      this._windowForecast = null; this._solutionWasOn = false;
      // A manual throw without a selected target is still a legal cut, not a swallowed input.
      if (pressed && mode !== 'arm') this._executeThrow(state, player, payload, { entity: null }, {
        valid: false, errorRad: Math.PI, tolRad: 0, onSolution: false, interceptAngle: Math.atan2(payload.vel.z, payload.vel.x),
        payloadSpeed: Math.hypot(payload.vel.x, payload.vel.z), timeOfFlight: 0,
      }, mode === 'off' ? 'off' : 'snap-manual');
      return;
    }
    runtime.aimTargetId = aim.entity ? aim.entity.id : null;
    runtime.aimSynthetic = !aim.entity;
    // INF-016: a turning aim target invalidates the cached pre-turn sample and degrades the
    // read. The geometry below still solves straight-line from current endpoints.
    const turn = assessTargetTurn(this._throwTurnTrack, aim.entity ? aim.entity.id : null,
      aim.entity ? aim.entity.vel : null, state.tick);
    this._throwTurnTrack = turn.track;
    if (turn.degraded) this._throwPrediction = {};
    const fieldSampler = this._buildFieldSampler(state, payload);
    const solution = sampleThrowSolution(this._throwPrediction, payload, aim.target, {
      tick: state.tick, omega: kin.omega, identity, fieldSampler,
      requireFresh: armed || !!this._pendingSnap,
    });
    solution.degraded = turn.degraded;
    solution.turnRate = turn.turnRate;
    solution.reachable = solution.valid === true;
    if (turn.degraded) solution.onSolution = false;
    // The player gets a release read BEFORE committing, not only while the release is armed.
    // Forecast cost is bounded and runs at 15 Hz. The contact gate above is current-tick truth.
    const movingWinch = Math.abs(finite(tether.cadence && tether.cadence.reelVelocity)) > 2;
    if (!this._windowForecast || this._windowForecast.identity !== identity
        || this._windowForecast.coasting !== !movingWinch
        || state.tick < this._windowForecast.tick || state.tick - this._windowForecast.tick >= 4) {
      const nextWindow = movingWinch
        ? { model: 'coast', reliable: false, reason: 'coast_required', enterS: null, exitS: null, widthS: null }
        : forecastCadenceWindow(player, payload, aim.target, { restLength: tether.restLength, fieldAware: !!fieldSampler });
      this._windowForecast = { identity, tick: state.tick, coasting: !movingWinch, ...nextWindow };
    }
    const forecast = this._windowForecast;
    const ageS = Math.max(0, state.tick - forecast.tick) / 60;
    const window = { ...forecast,
      reliable: forecast.reliable && !movingWinch,
      reason: movingWinch ? 'coast_required' : forecast.reason,
      enterS: forecast.enterS == null ? null : Math.max(0, forecast.enterS - ageS),
      exitS: forecast.exitS == null ? null : Math.max(0, forecast.exitS - ageS) };
    if (!window.reliable || window.exitS === 0 && !solution.onSolution) window.enterS = null;
    solution.window = window;
    solution.timeToSolution = solution.onSolution ? 0 : window.enterS;
    runtime.solution = mirrorSolution(runtime.solution, solution);
    const onNow = !!(solution.valid && solution.onSolution && !solution.decisionStale && !solution.degraded);
    if (onNow !== this._solutionWasOn) {
      if (onNow) this.bus.emit('audio:cue', { id: 'massline.solutionLock' });
      this.bus.emit('massline:releaseWindow', { sourceId: player.id, payloadId: payload.id,
        targetId: runtime.aimTargetId, open: onNow, tick: state.tick,
        clearance: solution.clearance, relativeSpeed: solution.relativeSpeed });
    }
    this._solutionWasOn = onNow;
    if (mode === 'arm') {
      if (armed && this._armAuthorized && onNow && solution.relativeSpeed >= THROW_MIN_PAYLOAD_SPEED) {
        this._executeThrow(state, player, payload, aim, solution, 'arm');
      }
      return;
    }
    if (mode === 'off') {
      if (pressed) this._executeThrow(state, player, payload, aim, solution, 'off');
      return;
    }
    if (this._pendingSnap) {
      if (onNow || state.tick >= this._pendingSnap.deadlineTick) {
        this._executeThrow(state, player, payload, aim, solution, onNow ? 'snap' : 'snap-manual');
      }
      return;
    }
    if (!pressed) return;
    if (onNow) { this._executeThrow(state, player, payload, aim, solution, 'snap'); return; }
    if (window.reliable && window.enterS > 0 && window.enterS <= SNAP_WINDOW_MS / 1000) {
      this._pendingSnap = { identity, attachmentId: tether.attachmentId,
        deadlineTick: state.tick + Math.floor(SNAP_WINDOW_MS / 1000 * 60) };
      runtime.armed = true;
      return;
    }
    this._executeThrow(state, player, payload, aim, solution, 'snap-manual');
  },

  // Build a pure field-acceleration sampler for the release predictor, or null when no continuous
  // field is active (so the predictor stays exactly ballistic). The closure reuses scratch objects
  // — zero allocation per predictor step.
  _buildFieldSampler(state, payload) {
    const snapshot = state.fields && Array.isArray(state.fields.snapshot) ? state.fields.snapshot : null;
    if (!snapshot || snapshot.length === 0) return null;
    const targetId = state.player && state.player.targetId;
    const profile = {
      mass: Math.max(0.1, Number.isFinite(payload.physicsBody && payload.physicsBody.mass) ? payload.physicsBody.mass : (Number.isFinite(payload.mass) ? payload.mass : 1)),
      type: payload.type,
      team: payload.team,
      id: payload.id,
      marked: targetId != null && payload.id === targetId,
    };
    const simTime = state.simTime;
    const pS = { x: 0, z: 0 }, vS = { x: 0, z: 0 }, out = { ax: 0, az: 0 };
    return (px, pz, vx, vz) => {
      pS.x = px; pS.z = pz; vS.x = vx; vS.z = vz;
      return sampleFieldAcceleration(pS, vS, snapshot, simTime, profile, out);
    };
  },

  _syncReleaseTargetOnLatch(state, player, payload, tether, runtime) {
    const attachmentId = tether && tether.attachmentId != null ? tether.attachmentId : null;
    const isNewLatch = !this._releaseLatchActive
      || this._releaseLatchPayloadId !== payload.id
      || (attachmentId != null && this._releaseLatchAttachmentId !== attachmentId);
    if (!isNewLatch) return;

    this._pendingSnap = null; this._windowForecast = null; this._armAuthorized = false; this._solutionWasOn = false;
    this._releaseLatchActive = true;
    this._releaseLatchPayloadId = payload.id;
    this._releaseLatchAttachmentId = attachmentId;
    runtime.releaseTarget = seedReleaseTarget(state, player, payload);
  },

  _clearReleaseLatch() {
    this._releaseLatchActive = false;
    this._releaseLatchPayloadId = null;
    this._releaseLatchAttachmentId = null;
  },

  _resolveThrowAim(state, player, payload, runtime) {
    const aimWorld = state.input && state.input.aimWorld;
    const preciseAim = !!(state.input && state.input.aimIntentActive === true
      && aimWorld && Number.isFinite(aimWorld.x) && Number.isFinite(aimWorld.z));
    if (preciseAim) {
      const candidates = queryNearbyEntities(
        state, { x: aimWorld.x, z: aimWorld.z }, AIM_QUERY_RADIUS, this._aimScratch, state.entityList || [],
      );
      let best = null;
      let bestMiss = Infinity;
      for (const e of candidates) {
        if (!e || e.alive === false || !e.pos) continue;
        if (e.id === player.id || e.id === payload.id) continue;
        if (!AIMABLE_TYPES.has(e.type)) continue;
        const miss = Math.max(0, Math.hypot(e.pos.x - aimWorld.x, e.pos.z - aimWorld.z) - Math.max(0, finite(e.radius, 0)));
        if (miss <= CURSOR_AIM_GRACE && (miss < bestMiss || miss === bestMiss && String(e.id) < String(best && best.id))) { best = e; bestMiss = miss; }
      }
      if (best) {
        const target = this._pointerEntityReleaseTarget;
        target.kind = 'entity';
        target.source = 'pointer';
        target.targetId = best.id;
        target.pos = null;
        target.radius = 0;
        runtime.releaseTarget = target;
      } else {
        const target = this._pointerPointReleaseTarget;
        target.kind = 'point';
        target.source = 'pointer';
        target.targetId = null;
        target.pos.x = aimWorld.x;
        target.pos.z = aimWorld.z;
        target.radius = 2;
        runtime.releaseTarget = target;
      }
    }

    const releaseTarget = runtime.releaseTarget;
    if (!releaseTarget) return null;
    if (releaseTarget.targetId != null) {
      const entity = state.entities && state.entities.get ? state.entities.get(releaseTarget.targetId) : null;
      if (!validReleaseEntity(entity, player.id, payload.id)) {
        runtime.releaseTarget = null;
        return null;
      }
      return {
        entity,
        target: { pos: entity.pos, vel: entity.vel || ZERO_VELOCITY, radius: entity.radius },
      };
    }
    const pos = releaseTarget.pos;
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) {
      runtime.releaseTarget = null;
      return null;
    }
    return {
      entity: null,
      target: { pos, vel: ZERO_VELOCITY, radius: positive(releaseTarget.radius, 2) },
    };
  },

  // Self-sling solution (case B): the PLAYER is the payload; the aim is the selected target.
  _selfSolution(state, player, omega) {
    const aim = this._resolveSelfAim(state);
    if (!aim) { this._selfTurnTrack = null; return null; }
    // INF-016: same turning-target rule as the throw read — a maneuvering self-sling
    // destination cannot leave a release-ready marker from its pre-turn course.
    const selfAimEntity = aim.targetId != null && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(aim.targetId) : null;
    const selfTurn = assessTargetTurn(this._selfTurnTrack, aim.targetId,
      selfAimEntity ? selfAimEntity.vel : null, state.tick);
    this._selfTurnTrack = selfTurn.track;
    if (selfTurn.degraded) this._selfPrediction = {};
    const baseSpeed = Math.hypot(finite(player.vel && player.vel.x), finite(player.vel && player.vel.z));
    const anticipatedBonusDv = selfSlingBonusDv(
      baseSpeed,
      this._swing && this._swing.load,
      this._swing && this._swing.taut,
    );
    const predictedSpeed = baseSpeed + anticipatedBonusDv;
    const speedScale = baseSpeed > 1 ? predictedSpeed / baseSpeed : 1;
    const solution = sampleThrowSolution(
      this._selfPrediction,
      {
        pos: player.pos,
        radius: player.radius,
        vel: {
          x: finite(player.vel && player.vel.x) * speedScale,
          z: finite(player.vel && player.vel.z) * speedScale,
        },
      },
      aim.target,
      {
        tick: state.tick,
        omega,
        identity: `${player.id}:${aim.kind}:${aim.targetId == null ? 'point' : aim.targetId}`,
      },
    );
    if (!solution.valid) return null;
    return {
      targetId: aim.targetId,
      targetKind: aim.kind,
      valid: true,
      reachable: true,
      degraded: selfTurn.degraded,
      turnRate: selfTurn.turnRate,
      errorRad: solution.errorRad,
      tolRad: solution.tolRad,
      onSolution: selfTurn.degraded ? false : solution.onSolution,
      timeToSolution: solution.timeToSolution,
      interceptAngle: solution.interceptAngle,
      payloadSpeed: solution.payloadSpeed,
      timeOfFlight: solution.timeOfFlight,
      sampleTick: solution.sampleTick,
      sampleAgeTicks: solution.sampleAgeTicks,
      sampleIntervalTicks: solution.sampleIntervalTicks,
      sampleSequence: solution.sampleSequence,
      sampled: solution.sampled,
      targetPos: { x: aim.target.pos.x, z: aim.target.pos.z },
      predicted: solution.predicted ? { ...solution.predicted } : null,
      anticipatedBonusDv,
    };
  },

  _resolveSelfAim(state) {
    const selectedId = state.player ? state.player.targetId : null;
    if (selectedId != null) {
      const selected = state.entities.get(selectedId);
      if (selected && selected.alive !== false && selected.pos) {
        return {
          targetId: selected.id,
          kind: 'entity',
          target: { pos: selected.pos, vel: selected.vel || { x: 0, z: 0 }, radius: selected.radius },
        };
      }
    }
    const waypoint = state.nav && state.nav.waypoint;
    if (!waypoint) return null;
    if (waypoint.targetEntityId != null) {
      const entity = state.entities.get(waypoint.targetEntityId);
      if (entity && entity.alive !== false && entity.pos) {
        return {
          targetId: entity.id,
          kind: 'waypoint',
          target: { pos: entity.pos, vel: entity.vel || { x: 0, z: 0 }, radius: entity.radius },
        };
      }
    }
    if (!waypoint.pos || !Number.isFinite(waypoint.pos.x) || !Number.isFinite(waypoint.pos.z)) return null;
    return {
      targetId: null,
      kind: 'waypoint',
      target: {
        pos: waypoint.pos,
        vel: { x: 0, z: 0 },
        radius: positive(waypoint.arrivalRadius, 12),
      },
    };
  },

  // Execute an armed throw: cut through the same attachment service tetherGameplay uses (its
  // reconcile pass emits the canonical tether:released/releaseRated next tick), then announce the
  // throw. masslineImpacts arms its sling tracker off the latch transition automatically, so the
  // shipped whip-impact/whip-damage chain composes with zero extra wiring.
  _executeThrow(state, player, payload, aim, solution, mode) {
    if (this._releaseAttemptTick === state.tick) return false;
    const attachments = combatAttachments(this);
    const attachmentId = state.player.tether.attachmentId;
    if (!attachments || attachmentId == null) return false;
    // INF-050 — snapshot the line's tension BEFORE the cut releases it; the throw whoosh
    // bends with the strain/load the sling actually let go with, not a flat authored voice.
    const tetherSnapshot = state.player && state.player.tether ? state.player.tether : null;
    const whoosh = resolveThrowWhoosh({
      strain: tetherSnapshot ? tetherSnapshot.strain : null,
      load: tetherSnapshot ? tetherSnapshot.load : null,
    });
    const result = attachments.cut(attachmentId, player.id, 'tether_cut');
    if (!result || !result.ok) return false;
    const tangentRelease = assessTangentRelease(state, payload.id);
    if (tangentRelease) this._beginTangentMeeting(state, tangentRelease);

    this._releaseAttemptTick = state.tick;
    this._armAuthorized = false;
    const runtime = ensureThrowSubtree(state);
    const releaseId = `massline:throw:${state.tick}:${payload.id}`;
    const prediction = predictionReceipt(solution);
    const impulses = [];
    runtime.lastThrow = {
      releaseId,
      payloadId: payload.id,
      aimTargetId: aim.entity ? aim.entity.id : null,
      aimSynthetic: !aim.entity,
      errorRad: solution.errorRad,
      payloadSpeed: solution.payloadSpeed,
      mode,
      tick: state.tick,
      time: finite(state.simTime, state.tick / 60),
      prediction,
      correction: null,
      impulses,
      cut: {
        accepted: true,
        attachmentId,
        reason: 'tether_cut',
      },
    };
    runtime.armed = false;
    runtime.solution = null;
    this._pendingSnap = null;
    this._pendingReleaseValidation = {
      releaseId,
      kind: 'throw',
      entityId: payload.id,
      source: 'massline',
      releaseTick: state.tick,
      prediction,
      impulses,
      releasePosition: { x: finite(payload.pos && payload.pos.x), z: finite(payload.pos && payload.pos.z) },
    };

    this.bus.emit('massline:throw', { ...runtime.lastThrow });
    this.bus.emit('audio:cue', {
      id: 'massline.throw',
      position: { x: payload.pos.x, z: payload.pos.z },
      gain: whoosh.gain,
      rate: whoosh.rate,
    });
    this.bus.emit('presentation:vfxCue', {
      id: 'massline.throw', lane: 'massline_throw',
      pos: { x: payload.pos.x, z: payload.pos.z },
      particles: 14, lights: 1,
      direction: Math.atan2(payload.vel.z, payload.vel.x),
    });
    return true;
  },

  _settleReleaseValidation(state, runtime) {
    const pending = this._pendingReleaseValidation;
    if (!pending || state.tick <= pending.releaseTick) return;
    const entity = state.entities && state.entities.get ? state.entities.get(pending.entityId) : null;
    if (!entity || !entity.vel) {
      this._pendingReleaseValidation = null;
      return;
    }
    const actualAngle = Math.atan2(finite(entity.vel.z), finite(entity.vel.x));
    const predictedAngle = finite(pending.prediction && pending.prediction.interceptAngle, actualAngle);
    const divergenceRad = angleDelta(predictedAngle, actualAngle);
    const tolRad = Math.max(0, finite(pending.prediction && pending.prediction.tolRad, 0));
    const receipt = {
      schema: 'spaceface.masslineReleaseValidation.v1',
      releaseId: pending.releaseId,
      kind: pending.kind,
      source: pending.source,
      entityId: pending.entityId,
      releaseTick: pending.releaseTick,
      validatedTick: state.tick,
      prediction: { ...pending.prediction },
      actual: {
        angle: actualAngle,
        speed: Math.hypot(finite(entity.vel.x), finite(entity.vel.z)),
        velocity: { x: finite(entity.vel.x), z: finite(entity.vel.z) },
      },
      trajectory: releaseTrajectoryReceipt(pending, entity.vel),
      divergenceRad,
      withinTolerance: Math.abs(divergenceRad) <= tolRad,
      impulses: pending.impulses.map((entry) => ({
        ...entry,
        impulse: entry.impulse ? { ...entry.impulse } : null,
      })),
    };
    runtime.lastReleaseValidation = receipt;
    if (runtime.lastThrow && runtime.lastThrow.releaseId === receipt.releaseId) {
      runtime.lastThrow.validation = receipt;
    }
    if (runtime.lastSelfSling && runtime.lastSelfSling.releaseId === receipt.releaseId) {
      runtime.lastSelfSling.validation = receipt;
    }
    this._pendingReleaseValidation = null;
    this.bus.emit('massline:releaseValidated', receipt);
  },

  // Cut changes the constraint topology, not the player's velocity. Winch work/thrust already
  // earned the exit speed. Repeated cut/regrab is no longer a free 15%-per-cycle propulsion pump.
  // A taut tangent release is a different question: it commits a lighter hull to a meeting.
  _onManualCut(payload = {}) {
    const state = this.state;
    if (!massline2Flag('throw') || !state || state.mode !== 'flight') return;
    if (payload.tangentRelease) this._beginTangentMeeting(state, payload.tangentRelease);
    if (!this._swing) return;
    const player = state.entities && state.entities.get && state.entities.get(state.playerId);
    if (!player || !player.alive || !player.vel) return;
    const speed = Math.hypot(finite(player.vel.x), finite(player.vel.z));
    if (speed < SLING_MIN_EXIT_SPEED || !this._swing.taut) return;
    const runtime = ensureThrowSubtree(state);
    const prediction = predictionReceipt(runtime.selfSolution || {});
    const releaseId = `massline:self-sling:${state.tick}:${player.id}`;
    const receipt = { releaseId, source: 'massline', physicsEarned: true,
      targetId: runtime.selfSolution && runtime.selfSolution.targetId,
      anchorId: this._swing.anchorId, corrected: false, bonusDv: 0, load: this._swing.load,
      exitAngle: Math.atan2(player.vel.z, player.vel.x), exitSpeed: speed, tick: state.tick,
      prediction, impulses: [], releasePosition: { x: finite(player.pos.x), z: finite(player.pos.z) } };
    runtime.lastSelfSling = receipt;
    this._pendingReleaseValidation = { releaseId, kind: 'self-sling', entityId: player.id,
      source: 'massline', releaseTick: state.tick, prediction, impulses: [],
      releasePosition: { ...receipt.releasePosition } };
    this.bus.emit('massline:selfSling', receipt);
    this.bus.emit('audio:cue', { id: 'massline.sling', position: { x: player.pos.x, z: player.pos.z } });
  },

  _beginTangentMeeting(state, release) {
    if (!massline2Flag('throw') || !release || release.taut !== true) return null;
    const plan = planTangentReleaseMeeting(state, release);
    if (!plan) return null;
    const hull = state.entities.get(plan.hullId);
    this._tangentMeeting = {
      hullId: plan.hullId,
      bodyId: plan.bodyId,
      closingSpeed: plan.closingSpeed,
      vx: finite(hull && hull.vel && hull.vel.x),
      vz: finite(hull && hull.vel && hull.vel.z),
    };
    const runtime = ensureThrowSubtree(state);
    runtime.tangentMeeting = {
      hullId: plan.hullId,
      bodyId: plan.bodyId,
      closingSpeed: plan.closingSpeed,
      tick: state.tick,
    };
    return plan;
  },

  // The solver is not asked to notice a lucky overlap. Each tick the lighter hull is aimed at
  // the body already chosen; the collision law scores the hit when the surfaces meet.
  _advanceTangentMeeting(state, dt) {
    const meeting = this._tangentMeeting;
    if (!meeting || !(dt > 0) || !state || !state.entities || typeof state.entities.get !== 'function') return;
    const hull = state.entities.get(meeting.hullId);
    const body = state.entities.get(meeting.bodyId);
    if (!hull || hull.alive === false || !hull.pos || !body || body.alive === false || !body.pos) {
      this._tangentMeeting = null;
      return;
    }
    const dx = body.pos.x - hull.pos.x;
    const dz = body.pos.z - hull.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > TANGENT_MEETING_RADIUS * 1.25) {
      this._tangentMeeting = null;
      return;
    }
    const surface = dist - meetingRadius(hull) - meetingRadius(body);
    if (surface <= Math.max(1.5, meeting.closingSpeed * dt)) {
      this._commitTangentMeeting(state, meeting, hull, body, dx, dz, dist);
      return;
    }
    const dirX = dx / dist;
    const dirZ = dz / dist;
    const desiredVx = dirX * meeting.closingSpeed;
    const desiredVz = dirZ * meeting.closingSpeed;
    const mass = meetingMass(hull);
    const physics = this.helpers && this.helpers.combatPhysics;
    if (physics && typeof physics.applyImpulse === 'function') {
      physics.applyImpulse({
        entityId: hull.id,
        impulse: { x: (desiredVx - meeting.vx) * mass, z: (desiredVz - meeting.vz) * mass },
        point: null,
        reason: 'tangent_release',
        tick: state.tick,
      });
    }
    meeting.vx = desiredVx;
    meeting.vz = desiredVz;
    if (!hull.vel) hull.vel = { x: desiredVx, z: desiredVz };
    else { hull.vel.x = desiredVx; hull.vel.z = desiredVz; }
    // Flight can overwrite the body before the next solve. The entity step is what closes
    // the meeting, so a taut release does not wait on a rock happening to lie ahead.
    hull.pos.x += desiredVx * dt;
    hull.pos.z += desiredVz * dt;
  },

  _commitTangentMeeting(state, meeting, hull, body, dx, dz, dist) {
    this._tangentMeeting = null;
    const span = dist > 1e-8 ? dist : 1;
    const normal = { x: dx / span, z: dz / span };
    const mass = meetingMass(hull);
    const receipt = resolveCollisionConsequence({
      target: hull,
      other: body,
      exchangedMomentum: Math.max(1, mass * meeting.closingSpeed),
      tick: state.tick,
      provenance: {
        actorId: state.playerId,
        weaponId: 'massline',
        tag: 'massline',
        appliedTick: state.tick,
      },
      preSolveClosingSpeed: meeting.closingSpeed,
      pos: { x: hull.pos.x, z: hull.pos.z },
      normal,
    });
    const impactDamage = receipt ? receipt.impactDamage : 0;
    let routed = false;
    const kernel = meetingDamageKernel(this);
    if (kernel && impactDamage > 0) {
      const packet = scalarHitToDamagePacket({
        damage: impactDamage,
        damageType: 'kinetic',
        pos: { x: hull.pos.x, z: hull.pos.z },
        normal,
        source: {
          kind: `collision_${receipt.surface}`,
          weaponId: 'massline',
          impulseProvenance: 'massline',
        },
      });
      packet.flags = { allowAnyTarget: true };
      const result = kernel.routeDamage({
        attackerId: state.playerId,
        targetId: hull.id,
        packet,
        origin: { kind: 'collision', id: receipt.surface, weaponId: 'massline' },
      });
      routed = !!(result && result.ok);
    }
    const runtime = ensureThrowSubtree(state);
    const committed = {
      schema: 'spaceface.tangentReleaseMeeting.v1',
      hullId: hull.id,
      bodyId: body.id,
      closingSpeed: meeting.closingSpeed,
      impactDamage,
      surface: receipt ? receipt.surface : null,
      routed,
      killed: hull.alive === false,
      tick: state.tick,
    };
    runtime.lastTangentMeeting = committed;
    runtime.tangentMeeting = null;
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit('massline:tangentMeeting', committed);
  },

};

function combatAttachments(host) {
  const actions = host.registry && host.registry.get && host.registry.get('actions');
  if (actions && actions.kernel && actions.kernel.attachments) return actions.kernel.attachments;
  const combat = host.registry && host.registry.get && host.registry.get('combat');
  return combat && combat.kernel && combat.kernel.attachments ? combat.kernel.attachments : null;
}

function meetingDamageKernel(host) {
  const combat = host.registry && host.registry.get && host.registry.get('combat');
  if (combat && combat.kernel && typeof combat.kernel.routeDamage === 'function') return combat.kernel;
  const actions = host.registry && host.registry.get && host.registry.get('actions');
  if (actions && actions.kernel && typeof actions.kernel.routeDamage === 'function') return actions.kernel;
  return null;
}

/**
 * The body a taut tangent release will actually meet. The coupled endpoint wins over anything
 * sitting on the exit ray, so a rock that happens to lie ahead is not the kill.
 * Returns null when the release is not a taut tangent, or when no lighter hull can die on a
 * nearby body under the collision law.
 */
export function planTangentReleaseMeeting(state, release) {
  if (!release || release.taut !== true || !state || !state.entities || typeof state.entities.get !== 'function') return null;
  const owner = state.entities.get(release.ownerId);
  const payload = state.entities.get(release.payloadId);
  if (!owner || !payload || !owner.pos || !payload.pos) return null;
  const heavier = Math.max(meetingMass(owner), meetingMass(payload));
  const earned = Math.abs(finite(release.tangentialSpeed));
  const tethered = lighterEndpoint(owner, payload);
  if (tethered && !isOwnCraft(tethered, state.playerId)) {
    const coupled = meetingForHull(state, tethered, owner, payload, earned);
    if (coupled) return coupled;
  }
  const candidates = [];
  forEachEntity(state, (entity) => {
    if (!isMeetingHull(entity) || isOwnCraft(entity, state.playerId)) return;
    if (entity.id === owner.id || entity.id === payload.id) return;
    if (!(meetingMass(entity) < heavier)) return;
    if (!nearPair(entity, owner, payload)) return;
    candidates.push(entity);
  });
  candidates.sort((a, b) => {
    const da = Math.hypot(a.pos.x - payload.pos.x, a.pos.z - payload.pos.z);
    const db = Math.hypot(b.pos.x - payload.pos.x, b.pos.z - payload.pos.z);
    if (Math.abs(da - db) > 1e-6) return da - db;
    return compareMeetingIds(a.id, b.id);
  });
  for (let i = 0; i < candidates.length; i++) {
    const meeting = meetingForHull(state, candidates[i], owner, payload, earned);
    if (meeting) return meeting;
  }
  return null;
}

function meetingForHull(state, hull, owner, payload, earned) {
  const coupled = preferredBody(hull, owner, payload);
  const coupledSpeed = coupled ? meetingSpeed(hull, coupled, earned) : 0;
  if (coupled && coupledSpeed > 0) {
    return freezeMeeting(hull, coupled, coupledSpeed);
  }
  let body = null;
  let bodyDist = Infinity;
  let bodyId = null;
  let speed = 0;
  forEachEntity(state, (entity) => {
    if (!entity || entity.id === hull.id || !isMeetingBody(entity)) return;
    if (coupled && entity.id === coupled.id) return;
    const dist = Math.hypot(entity.pos.x - hull.pos.x, entity.pos.z - hull.pos.z);
    if (dist > TANGENT_MEETING_RADIUS) return;
    if (body && (dist > bodyDist + 1e-6 || (Math.abs(dist - bodyDist) <= 1e-6 && compareMeetingIds(entity.id, bodyId) >= 0))) return;
    const next = meetingSpeed(hull, entity, earned);
    if (!(next > 0)) return;
    body = entity;
    bodyDist = dist;
    bodyId = entity.id;
    speed = next;
  });
  return body ? freezeMeeting(hull, body, speed) : null;
}

function freezeMeeting(hull, body, closingSpeed) {
  return Object.freeze({
    hullId: hull.id,
    bodyId: body.id,
    closingSpeed,
  });
}

function lighterEndpoint(owner, payload) {
  const ownerMass = meetingMass(owner);
  const payloadMass = meetingMass(payload);
  if (payloadMass < ownerMass && isMeetingHull(payload)) return payload;
  if (ownerMass < payloadMass && isMeetingHull(owner)) return owner;
  return null;
}

function preferredBody(hull, owner, payload) {
  const onLine = hull.id === owner.id || hull.id === payload.id;
  const other = onLine
    ? (hull.id === owner.id ? payload : owner)
    : (meetingMass(owner) >= meetingMass(payload) ? owner : payload);
  if (!other || other.id === hull.id || !isMeetingBody(other)) return null;
  if (Math.hypot(other.pos.x - hull.pos.x, other.pos.z - hull.pos.z) > TANGENT_MEETING_RADIUS) return null;
  return other;
}

function meetingSpeed(hull, body, earned) {
  const needed = rawDamageToKill(hull);
  if (!Number.isFinite(needed)) return 0;
  const lethal = minimumClosingSpeed(hull, body, needed);
  if (!(lethal > 0)) return 0;
  const gap = Math.max(0, Math.hypot(body.pos.x - hull.pos.x, body.pos.z - hull.pos.z)
    - meetingRadius(hull) - meetingRadius(body));
  const hurry = gap > 0 ? gap / TANGENT_MEETING_ARRIVE_S : lethal;
  const chosen = Math.max(earned, lethal, Math.min(hurry, TANGENT_MEETING_MAX_SPEED));
  return chosen > TANGENT_MEETING_MAX_SPEED ? 0 : chosen;
}

function rawDamageToKill(hull) {
  const shieldMul = DAMAGE_MODEL.shieldMultipliers.kinetic || 1;
  const armorMul = DAMAGE_MODEL.armorMultipliers.kinetic || 1;
  const hullMul = DAMAGE_MODEL.hullMultipliers.kinetic || 1;
  const hullFraction = Math.max(0.05, 1 - (Number(DAMAGE_MODEL.subsystemShare) || 0));
  const shield = Math.max(0, Number(hull.shield) || 0) + TANGENT_MEETING_SHIELD_PAD;
  const armor = Math.max(0, Number(hull.armorHp) || 0);
  const flat = Math.max(0, Number(hull.armorFlat) || 0);
  const hp = Math.max(0, Number(hull.hull) || 0);
  if (!(hp > 0)) return Infinity;
  return shield / shieldMul + flat + armor / armorMul + hp / (hullMul * hullFraction);
}

function minimumClosingSpeed(hull, body, needed) {
  if (impactAtSpeed(hull, body, TANGENT_MEETING_MAX_SPEED) + 1e-6 < needed) return 0;
  let lo = 0;
  let hi = TANGENT_MEETING_MAX_SPEED;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (impactAtSpeed(hull, body, mid) + 1e-6 >= needed) hi = mid;
    else lo = mid;
  }
  return hi;
}

function impactAtSpeed(hull, body, speed) {
  const receipt = resolveCollisionConsequence({
    target: hull,
    other: body,
    exchangedMomentum: Math.max(1, meetingMass(hull) * speed),
    tick: 0,
    provenance: { actorId: null, weaponId: 'massline', tag: 'massline', appliedTick: 0 },
    preSolveClosingSpeed: speed,
  });
  return receipt ? receipt.impactDamage : 0;
}

function isMeetingHull(entity) {
  return !!(entity && entity.alive !== false && (entity.type === 'ship' || entity.type === 'drone')
    && entity.pos && Number.isFinite(entity.pos.x) && Number.isFinite(entity.pos.z)
    && Number(entity.hull) > 0);
}

function isMeetingBody(entity) {
  return !!(entity && entity.alive !== false && TANGENT_MEETING_BODY_TYPES.has(entity.type)
    && entity.pos && Number.isFinite(entity.pos.x) && Number.isFinite(entity.pos.z));
}

function isOwnCraft(entity, playerId) {
  if (!entity || entity.id === playerId) return true;
  if (entity.ownerId != null && entity.ownerId === playerId) return true;
  if (entity.factionId === 'faction_player') return true;
  const data = entity.data;
  if (data && (data.isWingman === true || data.echoOfPlayer === true)) return true;
  if (data && data.ownerId != null && data.ownerId === playerId) return true;
  return false;
}

function nearPair(entity, owner, payload) {
  const radius = TANGENT_MEETING_RADIUS;
  const toOwner = Math.hypot(entity.pos.x - owner.pos.x, entity.pos.z - owner.pos.z);
  if (toOwner <= radius) return true;
  return Math.hypot(entity.pos.x - payload.pos.x, entity.pos.z - payload.pos.z) <= radius;
}

function forEachEntity(state, fn) {
  const list = state && state.entityList;
  if (Array.isArray(list) && list.length) {
    for (let i = 0; i < list.length; i++) fn(list[i]);
    return;
  }
  const map = state && state.entities;
  if (map && typeof map.values === 'function') {
    for (const entity of map.values()) fn(entity);
  }
}

function compareMeetingIds(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function meetingMass(entity) {
  const physicsMass = entity && entity.physicsBody && entity.physicsBody.mass;
  const mass = Number.isFinite(physicsMass) && physicsMass > 0 ? physicsMass : Number(entity && entity.mass);
  return Number.isFinite(mass) && mass > 0 ? mass : 1;
}

function meetingRadius(entity) {
  const radius = Number(entity && entity.radius);
  return Number.isFinite(radius) && radius > 0 ? radius : 2;
}

export function releaseAssistMode(state) {
  const raw = state && state.settings && state.settings.gameplay
    && state.settings.gameplay.masslineReleaseAssist;
  // CADENCE retains M5: 'snap' is the default — the throw releases on the player's press with a 90 ms forgiveness
  // window, never silently on the first solution frame. 'arm' and 'off' remain authored choices.
  return raw === 'arm' || raw === 'off' ? raw : 'snap';
}

function ensureThrowSubtree(state) {
  const root = state.massline2 || (state.massline2 = {});
  if (!root.throw) {
    root.throw = {
      armed: false, payloadId: null, aimTargetId: null, aimSynthetic: false,
      releaseTarget: null,
      solution: null, selfSolution: null, lastThrow: null, lastSelfSling: null,
      lastReleaseValidation: null,
    };
  }
  return root.throw;
}

function mirrorSolution(existing, solution) {
  const out = existing && typeof existing === 'object' ? existing : {};
  out.valid = solution.valid;
  out.relativeSpeed = solution.relativeSpeed;
  out.missDistance = solution.missDistance;
  out.clearance = solution.clearance;
  out.impactTime = solution.impactTime;
  out.model = solution.model;
  out.decisionTick = solution.decisionTick;
  out.decisionStale = solution.decisionStale === true;
  out.degraded = solution.degraded === true;
  out.turnRate = Number.isFinite(solution.turnRate) ? solution.turnRate : 0;
  out.reachable = solution.valid === true;
  out.window = solution.window || null;
  out.fieldAware = !!solution.fieldAware;
  out.projectedPath = solution.projectedPath || null;
  out.errorRad = solution.errorRad;
  out.tolRad = solution.tolRad;
  out.onSolution = solution.onSolution;
  out.interceptAngle = solution.interceptAngle;
  out.payloadSpeed = solution.payloadSpeed;
  out.timeToSolution = solution.timeToSolution;
  out.timeOfFlight = solution.timeOfFlight;
  out.sampleTick = solution.sampleTick;
  out.sampleAgeTicks = solution.sampleAgeTicks;
  out.sampleIntervalTicks = solution.sampleIntervalTicks;
  out.sampleSequence = solution.sampleSequence;
  out.sampled = solution.sampled;
  out.predicted = solution.predicted ? { ...solution.predicted } : null;
  return out;
}

function predictionReceipt(solution) {
  return {
    valid: !!solution.valid,
    errorRad: finite(solution.errorRad, Math.PI),
    tolRad: Math.max(0, finite(solution.tolRad, 0)),
    onSolution: !!solution.onSolution,
    interceptAngle: finite(solution.interceptAngle, 0),
    payloadSpeed: Math.max(0, finite(solution.payloadSpeed, 0)),
    timeToSolution: Number.isFinite(solution.timeToSolution) ? solution.timeToSolution : null,
    timeOfFlight: Math.max(0, finite(solution.timeOfFlight, 0)),
    sampleTick: Math.max(0, Math.trunc(finite(solution.sampleTick, 0))),
    sampleAgeTicks: Math.max(0, Math.trunc(finite(solution.sampleAgeTicks, 0))),
    sampleIntervalTicks: Math.max(1, Math.trunc(finite(solution.sampleIntervalTicks, 1))),
    sampleSequence: Math.max(0, Math.trunc(finite(solution.sampleSequence, 0))),
    predicted: solution.predicted ? {
      x: finite(solution.predicted.x),
      z: finite(solution.predicted.z),
    } : null,
  };
}

export function selfSlingBonusDv(exitSpeed, lineLoad, taut) {
  const speed = Math.abs(finite(exitSpeed));
  const load = taut ? clamp01(finite(lineLoad)) : 0;
  if (speed < SLING_MIN_EXIT_SPEED || !(load > 0)) return 0;
  return speed * SLING_RELEASE_SPEED_FRACTION * load;
}

function releaseTrajectoryReceipt(pending, actualVelocity) {
  const prediction = pending.prediction || {};
  const releasePosition = pending.releasePosition || { x: 0, z: 0 };
  const timeOfFlight = Math.max(0, finite(prediction.timeOfFlight, 0));
  const predictedPosition = prediction.predicted ? {
    x: finite(prediction.predicted.x),
    z: finite(prediction.predicted.z),
  } : null;
  const actualProjectedPosition = {
    x: finite(releasePosition.x) + finite(actualVelocity && actualVelocity.x) * timeOfFlight,
    z: finite(releasePosition.z) + finite(actualVelocity && actualVelocity.z) * timeOfFlight,
  };
  return {
    timeOfFlight,
    releasePosition: { x: finite(releasePosition.x), z: finite(releasePosition.z) },
    predictedPosition,
    actualProjectedPosition,
    divergenceWU: predictedPosition
      ? Math.hypot(
        actualProjectedPosition.x - predictedPosition.x,
        actualProjectedPosition.z - predictedPosition.z,
      )
      : null,
  };
}

function angleDelta(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function writeIdle(runtime) {
  runtime.armed = false;
  runtime.payloadId = null;
  runtime.aimTargetId = null;
  runtime.aimSynthetic = false;
  runtime.releaseTarget = null;
  runtime.solution = null;
  runtime.selfSolution = null;
}

function finite(v, fb = 0) { return Number.isFinite(v) ? v : fb; }
function positive(v, fb) { return Number.isFinite(v) && v > 0 ? v : fb; }
function clamp01(v) { return Math.max(0, Math.min(1, finite(v))); }

const ZERO_VELOCITY = Object.freeze({ x: 0, z: 0 });

function seedReleaseTarget(state, player, payload) {
  const selectedId = state.player ? state.player.targetId : null;
  if (selectedId != null && selectedId !== payload.id && selectedId !== player.id) {
    const selected = state.entities && state.entities.get ? state.entities.get(selectedId) : null;
    if (validReleaseEntity(selected, player.id, payload.id)) {
      return entityReleaseTarget(selected.id, 'selection');
    }
  }

  const waypoint = state.nav && state.nav.waypoint;
  if (!waypoint) return null;
  if (waypoint.targetEntityId != null) {
    const entity = state.entities && state.entities.get ? state.entities.get(waypoint.targetEntityId) : null;
    if (validReleaseEntity(entity, player.id, payload.id)) {
      return entityReleaseTarget(entity.id, 'waypoint', 'waypoint');
    }
  }
  if (!waypoint.pos || !Number.isFinite(waypoint.pos.x) || !Number.isFinite(waypoint.pos.z)) return null;
  return pointReleaseTarget(
    'waypoint',
    'waypoint',
    waypoint.pos.x,
    waypoint.pos.z,
    positive(waypoint.arrivalRadius, 12),
  );
}

function validReleaseEntity(entity, playerId, payloadId) {
  return !!(entity
    && entity.id !== playerId
    && entity.id !== payloadId
    && entity.alive !== false
    && entity.pos
    && Number.isFinite(entity.pos.x)
    && Number.isFinite(entity.pos.z)
    && AIMABLE_TYPES.has(entity.type));
}

function entityReleaseTarget(targetId, source, kind = 'entity') {
  return { kind, source, targetId, pos: null, radius: 0 };
}

function pointReleaseTarget(kind, source, x, z, radius) {
  return {
    kind,
    source,
    targetId: null,
    pos: { x: finite(x), z: finite(z) },
    radius: positive(radius, 2),
  };
}

function releasePredictionIdentity(payloadId, releaseTarget) {
  if (!releaseTarget) return `${String(payloadId)}:none`;
  const kind = String(releaseTarget.kind || 'point');
  const source = String(releaseTarget.source || 'unknown');
  if (releaseTarget.targetId != null) {
    return `${String(payloadId)}:${kind}:${source}:entity:${String(releaseTarget.targetId)}`;
  }
  const pos = releaseTarget.pos;
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) {
    return `${String(payloadId)}:${kind}:${source}:invalid`;
  }
  return `${String(payloadId)}:${kind}:${source}:point:${String(pos.x)}:${String(pos.z)}`;
}

export { FALLBACK };
