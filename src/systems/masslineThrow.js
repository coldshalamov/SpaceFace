// Massline throw system (Wave M2 §3.3/§4.1, design/revamp/MASSLINE_PHYSICS_IDENTITY.md).
//
// The intent model in one sentence: F frees YOU, RMB throws THEM (input.js owns the RMB
// arbitration; we read actions.throwArm). Reeling is the physically-honest spin-up (conservation
// of angular momentum through the Rapier constraint); this system supplies ONLY the release
// precision the player's hardware can't: a solution read each tick (mirrored for the HUD/VFX
// indicator) and an auto-cut on the solution frame while the throw is explicitly armed. Manual
// self-sling cuts keep the real body/constraint-derived exit velocity and add no release impulse.
//
// Runs AFTER tetherGameplay/masslineTelemetry/masslineImpacts in UPDATE_ORDER so it reads settled
// tether state. NOT in the sf-sim curated harness; every behavioral path is additionally gated on
// massline2Flag('throw') so headless contract checks see a no-op. Writes ONLY its own
// state.massline2.throw subtree (outside the sim-snapshot whitelist and the save schema) and cuts
// the attachment through the same service tetherGameplay uses — never a direct vel write.
import { massline2Flag } from '../data/featureFlags.js';
import { sampleThrowSolution, tetherPairKinematics } from '../combat/tetherFireControl.js';
import { sampleFieldAcceleration } from '../core/fields/fieldKernel.js';
import { queryNearbyEntities } from '../core/spatialQuery.js';

// --- Dials (design doc §12) -----------------------------------------------------------------
const SNAP_WINDOW_MS = 90;          // manual-release forgiveness half-window
const CURSOR_AIM_GRACE = 48;        // wu of surface miss that still soft-snaps the throw aim
const SLING_MIN_EXIT_SPEED = 25;    // "genuinely moving" bar for self-sling telemetry
const THROW_MIN_PAYLOAD_SPEED = 25; // don't auto-cut a parked payload — no throw below this
const AIM_QUERY_RADIUS = 220;       // cursor-aim entity search radius around aimWorld

const AIMABLE_TYPES = new Set(['ship', 'drone', 'asteroid', 'station', 'wreck', 'payload']);

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
    this._pendingReleaseValidation = null;
    this._releaseLatchActive = false;
    this._releaseLatchPayloadId = null;
    this._releaseLatchAttachmentId = null;
    // Swing cache: telemetry wipes on the cut tick (the mirror is already inactive when it runs),
    // so the release consumers read last tick's settled swing from here.
    this._swing = null;
    this._unsubs = [];
    if (this.bus && typeof this.bus.on === 'function') {
      this._unsubs.push(this.bus.on('tether:cut', (p) => this._onManualCut(p || {})));
    }
  },

  destroy() {
    for (const off of this._unsubs || []) { if (typeof off === 'function') off(); }
    this._unsubs = [];
  },

  update(dt, state) {
    const runtime = ensureThrowSubtree(state);
    this._settleReleaseValidation(state, runtime);
    if (!massline2Flag('throw') || state.mode !== 'flight') {
      writeIdle(runtime);
      this._clearReleaseLatch();
      this._throwPrediction = {};
      this._selfPrediction = {};
      this._swing = null;
      this._throwArmWasHeld = false;
      this._pendingSnap = null;
      return;
    }
    const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
    const tether = state.player && state.player.tether;
    const active = !!(player && player.alive && tether && tether.active && tether.targetId != null);
    if (!active) {
      writeIdle(runtime);
      this._clearReleaseLatch();
      this._throwPrediction = {};
      this._selfPrediction = {};
      this._swing = null;
      this._throwArmWasHeld = false;
      this._pendingSnap = null;
      return;
    }
    const payload = state.entities.get(tether.targetId);
    if (!payload || payload.alive === false || !payload.pos || !payload.vel) {
      writeIdle(runtime);
      this._clearReleaseLatch();
      return;
    }

    this._syncReleaseTargetOnLatch(state, player, payload, tether, runtime);

    // Cache the live swing for the release consumers (see _onManualCut).
    const kin = tetherPairKinematics(player, payload);
    this._swing = {
      anchorId: payload.id,
      playerMass: Math.max(0.1, finite(player.mass, 1)),
      taut: String(tether.phase || 'slack') !== 'slack',
      load: String(tether.phase || 'slack') === 'slack' ? 0 : clamp01(finite(tether.load, 0)),
    };

    const armed = !!(state.input && state.input.actions && state.input.actions.throwArm);
    const pressed = armed && !this._throwArmWasHeld;
    this._throwArmWasHeld = armed;
    runtime.armed = armed || !!this._pendingSnap;
    runtime.payloadId = payload.id;

    // Self-sling read (case B) is always live while latched: YOUR exit solution toward the
    // selected target, consumed by the indicator and release predictor.
    runtime.selfSolution = this._selfSolution(state, player, kin.omega);

    // Precision-input provenance is per tick, not per throw-arm hold. Let a genuine mouse,
    // gamepad, or touch aim paint the transient destination as soon as the line is latched; the
    // solver below still stays asleep until the player arms the throw.
    const aim = this._resolveThrowAim(state, player, payload, runtime);

    if (!armed && !this._pendingSnap) {
      runtime.aimTargetId = null;
      runtime.aimSynthetic = false;
      runtime.solution = null;
      this._throwPrediction = {};
      this._solutionWasOn = false;
      return;
    }

    // Release aim is captured once when the line latches. Gun/UI selection may continue to change,
    // but it never continuously steers an armed throw. Only a current input-owned precision intent
    // may repaint the release target while the line remains live.
    if (!aim) {
      runtime.aimTargetId = null;
      runtime.aimSynthetic = false;
      runtime.solution = null;
      this._throwPrediction = {};
      this._solutionWasOn = false;
      return;
    }
    runtime.aimTargetId = aim.entity ? aim.entity.id : null;
    runtime.aimSynthetic = !aim.entity;
    // Field-aware release (PQ-012): when continuous fields are active, inject a pure sampler so the
    // predictor shows the BENT release path (a throw released inside a Well curves). Only built when
    // a field snapshot exists — absent it, the predictor is byte-identical to the ballistic model.
    const fieldSampler = this._buildFieldSampler(state, payload);
    const solution = sampleThrowSolution(
      this._throwPrediction,
      { pos: payload.pos, vel: payload.vel },
      aim.target,
      {
        tick: state.tick,
        omega: kin.omega,
        identity: releasePredictionIdentity(payload.id, runtime.releaseTarget),
        fieldSampler,
      },
    );
    runtime.solution = mirrorSolution(runtime.solution, solution);

    // Solution-lock cue: one clean blip the first frame the window opens (rising edge only), so
    // the ear learns the release rhythm even before the eye finds the indicator.
    const onNow = !!(solution.valid && solution.onSolution);
    if (onNow && !this._solutionWasOn) this.bus.emit('audio:cue', { id: 'massline.solutionLock' });
    this._solutionWasOn = onNow;

    // Hold-to-arm release (default assist mode): the line cuts itself on the first solution
    // frame. Entirely early-side — a missed window costs one revolution, never the setup.
    const assistMode = releaseAssistMode(state);
    if (assistMode === 'arm') {
      if (armed && solution.valid && solution.onSolution && solution.payloadSpeed >= THROW_MIN_PAYLOAD_SPEED) {
        this._executeThrow(state, player, payload, aim, solution, 'arm');
      }
      return;
    }

    // `off` and `snap` are press-to-throw modes. OFF means no precision help, not "RMB does
    // nothing". SNAP keeps the same manual decision, but an early press inside the 90 ms window
    // waits for the exact frame. A late press cuts immediately and preserves the payload's earned
    // exit vector; release assistance never steers either endpoint.
    if (assistMode === 'off') {
      if (pressed && solution.valid) this._executeThrow(state, player, payload, aim, solution, 'off');
      return;
    }

    const now = finite(state.simTime, state.tick / 60);
    if (this._pendingSnap) {
      if (solution.valid && solution.onSolution) {
        this._executeThrow(state, player, payload, aim, solution, 'snap');
      } else if (now >= this._pendingSnap.until) {
        this._executeThrow(state, player, payload, aim, solution, 'snap-manual');
      }
      return;
    }
    if (!pressed || !solution.valid) return;

    if (solution.onSolution) {
      this._executeThrow(state, player, payload, aim, solution, 'snap');
      return;
    }
    if (solution.timeToSolution != null && solution.timeToSolution > 0
      && solution.timeToSolution <= SNAP_WINDOW_MS / 1000) {
      this._pendingSnap = { until: now + SNAP_WINDOW_MS / 1000 + 1 / 30 };
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
        if (miss <= CURSOR_AIM_GRACE && miss < bestMiss) { best = e; bestMiss = miss; }
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
    if (!aim) return null;
    const solution = sampleThrowSolution(
      this._selfPrediction,
      {
        pos: player.pos,
        vel: {
          x: finite(player.vel && player.vel.x),
          z: finite(player.vel && player.vel.z),
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
      errorRad: solution.errorRad,
      tolRad: solution.tolRad,
      onSolution: solution.onSolution,
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
      anticipatedBonusDv: 0,
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
    const attachments = combatAttachments(this);
    const attachmentId = state.player.tether.attachmentId;
    if (!attachments || attachmentId == null) return false;
    const result = attachments.cut(attachmentId, player.id, 'tether_cut');
    if (!result || !result.ok) return false;

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
    this.bus.emit('audio:cue', { id: 'massline.throw', position: { x: payload.pos.x, z: payload.pos.z } });
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

  // Manual cut preserves the player's real exit direction and speed. AC-07: the cut itself
  // applies no impulse, writes no velocity, and does not claim physics-earned bonus energy.
  // Rapier / the tether constraint already produced the exit the player keeps.
  _onManualCut() {
    const state = this.state;
    if (!massline2Flag('throw') || !state || state.mode !== 'flight') return;
    const swing = this._swing;
    if (!swing) return;
    const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
    if (!player || !player.alive || !player.vel) return;
    const preReleaseVelocity = { x: finite(player.vel.x), z: finite(player.vel.z) };
    const speed = Math.hypot(preReleaseVelocity.x, preReleaseVelocity.z);
    if (speed < SLING_MIN_EXIT_SPEED) return;
    if (!swing.taut) return;

    const exitAngle = Math.atan2(preReleaseVelocity.z, preReleaseVelocity.x);
    const runtime = ensureThrowSubtree(state);
    const self = runtime.selfSolution;
    const postReleaseVelocity = { x: finite(player.vel.x), z: finite(player.vel.z) };
    const impulses = [];
    const releaseId = `massline:self-sling:${state.tick}:${player.id}`;
    const prediction = predictionReceipt(self || {});
    const receipt = {
      releaseId,
      source: 'massline',
      physicsEarned: true,
      targetId: self ? self.targetId : null,
      anchorId: swing.anchorId,
      corrected: false,
      bonusDv: 0,
      releaseAddedDv: 0,
      load: swing.load,
      taut: true,
      exitAngle,
      exitSpeed: speed,
      preReleaseVelocity,
      postReleaseVelocity,
      tick: state.tick,
      prediction,
      impulses,
      releasePosition: { x: finite(player.pos && player.pos.x), z: finite(player.pos && player.pos.z) },
    };
    runtime.lastSelfSling = receipt;
    this._pendingReleaseValidation = {
      releaseId,
      kind: 'self-sling',
      entityId: player.id,
      source: 'massline',
      releaseTick: state.tick,
      prediction,
      impulses,
      releasePosition: { ...receipt.releasePosition },
    };
    this.bus.emit('massline:selfSling', receipt);
    this.bus.emit('audio:cue', { id: 'massline.sling', position: { x: player.pos.x, z: player.pos.z } });
  },
};

function combatAttachments(host) {
  const actions = host.registry && host.registry.get && host.registry.get('actions');
  if (actions && actions.kernel && actions.kernel.attachments) return actions.kernel.attachments;
  const combat = host.registry && host.registry.get && host.registry.get('combat');
  return combat && combat.kernel && combat.kernel.attachments ? combat.kernel.attachments : null;
}

export function releaseAssistMode(state) {
  const raw = state && state.settings && state.settings.gameplay
    && state.settings.gameplay.masslineReleaseAssist;
  return raw === 'snap' || raw === 'off' ? raw : 'arm';
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

// AC-07 retired the load-scaled release flourish. The export stays so callers can still
// ask "how much extra Δv does a release add?" and receive the honest answer: none.
export function selfSlingBonusDv(_exitSpeed, _lineLoad, _taut) {
  return 0;
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
