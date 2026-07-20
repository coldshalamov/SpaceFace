// Massline throw system (Wave M2 §3.3/§4.1, design/revamp/MASSLINE_PHYSICS_IDENTITY.md).
//
// The intent model in one sentence: F frees YOU, RMB throws THEM (input.js owns the RMB
// arbitration; we read actions.throwArm). Reeling is the physically-honest spin-up (conservation
// of angular momentum through the Rapier constraint); this system supplies ONLY the release
// precision the player's hardware can't: a solution read each tick (mirrored for the HUD/VFX
// indicator), an auto-cut on the solution frame while the throw is armed, and a bounded post-cut
// exit correction for manual self-sling releases inside the snap window.
//
// Runs AFTER tetherGameplay/masslineTelemetry/masslineImpacts in UPDATE_ORDER so it reads settled
// tether state. NOT in the sf-sim curated harness; every behavioral path is additionally gated on
// massline2Flag('throw') so headless contract checks see a no-op. Writes ONLY its own
// state.massline2.throw subtree (outside the sim-snapshot whitelist and the save schema) and cuts
// the attachment through the same service tetherGameplay uses — never a direct vel write.
import { massline2Flag } from '../data/featureFlags.js';
import { sampleThrowSolution, tetherPairKinematics } from '../combat/tetherFireControl.js';
import { queryNearbyEntities } from '../core/spatialQuery.js';

// --- Dials (design doc §12) -----------------------------------------------------------------
const SNAP_WINDOW_MS = 90;          // manual-release forgiveness half-window
const CURSOR_AIM_GRACE = 48;        // wu of surface miss that still soft-snaps the throw aim
const SLING_BONUS_PER_DECADE = 55;  // wu/s of self-sling exit bonus per mass decade over the ship
const SLING_BONUS_MAX_DECADES = 3;  // planets/stations cap out at 3 decades of bonus
const SLING_MIN_EXIT_SPEED = 25;    // "genuinely moving" bar (mirrors SNAP_CATCH_MIN_SPEED)
const THROW_MIN_PAYLOAD_SPEED = 25; // don't auto-cut a parked payload — no throw below this
const AIM_QUERY_RADIUS = 220;       // cursor-aim entity search radius around aimWorld

const AIMABLE_TYPES = new Set(['ship', 'drone', 'asteroid', 'station', 'wreck', 'payload']);

const FALLBACK = Object.freeze({
  armed: false,
  payloadId: null,
  aimTargetId: null,
  aimSynthetic: false,
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
    this._solutionWasOn = false;
    this._throwArmWasHeld = false;
    this._pendingSnap = null;
    this._throwPrediction = {};
    this._selfPrediction = {};
    this._pendingReleaseValidation = null;
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
      return;
    }

    // Cache the live swing for the release consumers (see _onManualCut).
    const kin = tetherPairKinematics(player, payload);
    const telemetry = state.player.masslineTelemetry;
    this._swing = {
      tick: state.tick,
      omega: kin.omega,
      anchorId: payload.id,
      anchorMass: Math.max(0.1, finite(payload.mass, 1)),
      playerMass: Math.max(0.1, finite(player.mass, 1)),
      tangentialSpeed: telemetry && telemetry.active ? finite(telemetry.tangentialSpeed, 0) : 0,
    };

    const armed = !!(state.input && state.input.actions && state.input.actions.throwArm);
    const pressed = armed && !this._throwArmWasHeld;
    this._throwArmWasHeld = armed;
    runtime.armed = armed || !!this._pendingSnap;
    runtime.payloadId = payload.id;

    // Self-sling read (case B) is always live while latched: YOUR exit solution toward the
    // selected target, consumed by the indicator and by the manual-cut snap assist.
    runtime.selfSolution = this._selfSolution(state, player, payload, kin.omega);

    if (!armed && !this._pendingSnap) {
      runtime.aimTargetId = null;
      runtime.aimSynthetic = false;
      runtime.solution = null;
      this._throwPrediction = {};
      this._solutionWasOn = false;
      return;
    }

    // Throw aim: entity near the cursor wins, else the selected target (never the payload
    // itself), else a synthetic point at the cursor — the player always gets SOME solution,
    // and the indicator shows which aim is armed.
    const aim = this._resolveThrowAim(state, player, payload);
    runtime.aimTargetId = aim.entity ? aim.entity.id : null;
    runtime.aimSynthetic = !aim.entity;
    const solution = sampleThrowSolution(
      this._throwPrediction,
      { pos: payload.pos, vel: payload.vel },
      aim.target,
      {
        tick: state.tick,
        omega: kin.omega,
        identity: `${payload.id}:${aim.entity ? aim.entity.id : 'cursor'}`,
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
    // waits for the exact frame and a just-late press receives one bounded angular correction.
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

    const windowRad = Math.abs(kin.omega) * (SNAP_WINDOW_MS / 1000);
    const correction = Math.abs(solution.errorRad) <= solution.tolRad + windowRad
      ? this._correctPayloadExit(state, payload, solution)
      : null;
    if (correction && correction.accepted) {
      this._executeThrow(state, player, payload, aim, solution, 'snap-corrected', correction);
      return;
    }
    this._executeThrow(state, player, payload, aim, solution, 'snap-manual');
  },

  _resolveThrowAim(state, player, payload) {
    const aimWorld = state.input && state.input.aimWorld;
    if (aimWorld && Number.isFinite(aimWorld.x) && Number.isFinite(aimWorld.z)) {
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
      if (best) return { entity: best, target: { pos: best.pos, vel: best.vel || { x: 0, z: 0 }, radius: best.radius } };
    }
    const selectedId = state.player ? state.player.targetId : null;
    if (selectedId != null && selectedId !== payload.id) {
      const sel = state.entities.get(selectedId);
      if (sel && sel.alive !== false && sel.pos) {
        return { entity: sel, target: { pos: sel.pos, vel: sel.vel || { x: 0, z: 0 }, radius: sel.radius } };
      }
    }
    // Synthetic cursor point: zero velocity, token radius (tightest honest tolerance).
    const px = aimWorld && Number.isFinite(aimWorld.x) ? aimWorld.x : player.pos.x;
    const pz = aimWorld && Number.isFinite(aimWorld.z) ? aimWorld.z : player.pos.z;
    return { entity: null, target: { pos: { x: px, z: pz }, vel: { x: 0, z: 0 }, radius: 2 } };
  },

  // Self-sling solution (case B): the PLAYER is the payload; the aim is the selected target.
  _selfSolution(state, player, payload, omega) {
    const aim = this._resolveSelfAim(state);
    if (!aim) return null;
    const baseSpeed = Math.hypot(finite(player.vel && player.vel.x), finite(player.vel && player.vel.z));
    const anticipatedBonusDv = selfSlingBonusDv(
      payload && payload.mass,
      player.mass,
      this._swing && this._swing.tangentialSpeed,
    );
    const predictedSpeed = baseSpeed + anticipatedBonusDv;
    const speedScale = baseSpeed > 1 ? predictedSpeed / baseSpeed : 1;
    const solution = sampleThrowSolution(
      this._selfPrediction,
      {
        pos: player.pos,
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

  _correctPayloadExit(state, payload, solution) {
    const physics = this.helpers && this.helpers.combatPhysics;
    if (!physics || typeof physics.applyImpulse !== 'function' || !payload.vel) return null;
    const speed = Math.hypot(finite(payload.vel.x), finite(payload.vel.z));
    if (!(speed > 1)) return null;
    const mass = Math.max(0.1, finite(payload.mass, 1));
    const vx = Math.cos(solution.interceptAngle) * speed - payload.vel.x;
    const vz = Math.sin(solution.interceptAngle) * speed - payload.vel.z;
    const impulse = { x: vx * mass, z: vz * mass };
    const accepted = !!physics.applyImpulse({
      entityId: payload.id,
      impulse,
      point: null,
      reason: 'massline_throw_snap',
      tick: state.tick,
    });
    return {
      entityId: payload.id,
      reason: 'massline_throw_snap',
      accepted,
      impulse,
      angularCorrectionRad: solution.errorRad,
      tick: state.tick,
    };
  },

  // Execute an armed throw: cut through the same attachment service tetherGameplay uses (its
  // reconcile pass emits the canonical tether:released/releaseRated next tick), then announce the
  // throw. masslineImpacts arms its sling tracker off the latch transition automatically, so the
  // shipped whip-impact/whip-damage chain composes with zero extra wiring.
  _executeThrow(state, player, payload, aim, solution, mode, correction = null) {
    const attachments = combatAttachments(this);
    const attachmentId = state.player.tether.attachmentId;
    if (!attachments || attachmentId == null) return false;
    const result = attachments.cut(attachmentId, player.id, 'tether_cut');
    if (!result || !result.ok) return false;

    const runtime = ensureThrowSubtree(state);
    const releaseId = `massline:throw:${state.tick}:${payload.id}`;
    const prediction = predictionReceipt(solution);
    const impulses = correction && correction.accepted ? [correction] : [];
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
      correction,
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

  // Manual F-cut released the PLAYER (case B). Two bounded assists, both flag-gated and both
  // driven by last tick's cached swing:
  //  1. Snap window: if the selected-target exit error is inside what the swing sweeps in
  //     SNAP_WINDOW_MS, rotate the exit velocity onto the solution with an impulse (bounded by
  //     construction: correction angle <= |omega| * window).
  //  2. Anchor-mass slingshot bonus (§4.1 approved approximation): bigger anchor = mightier
  //     fling, log-scaled in mass decades over the ship, applied along the (corrected) exit.
  _onManualCut(payload) {
    const state = this.state;
    if (!massline2Flag('throw') || !state || state.mode !== 'flight') return;
    const swing = this._swing;
    if (!swing) return;
    const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
    if (!player || !player.alive || !player.vel) return;
    const speed = Math.hypot(finite(player.vel.x), finite(player.vel.z));
    if (speed < SLING_MIN_EXIT_SPEED) return;

    const physics = this.helpers && this.helpers.combatPhysics;
    const canImpulse = physics && typeof physics.applyImpulse === 'function';
    let exitAngle = Math.atan2(player.vel.z, player.vel.x);
    let corrected = false;
    const impulses = [];

    // 1) Snap the exit onto the selected-target solution when the release landed in the window.
    const runtime = ensureThrowSubtree(state);
    const self = runtime.selfSolution;
    const assistMode = releaseAssistMode(state);
    if (canImpulse && self && assistMode !== 'off' && Math.abs(swing.omega) > 1e-3) {
      const windowRad = Math.abs(swing.omega) * (SNAP_WINDOW_MS / 1000);
      const err = finite(self.errorRad, Math.PI);
      if (Math.abs(err) <= Math.max(windowRad, self.tolRad || 0)) {
        const target = Math.atan2(player.vel.z, player.vel.x) + err;
        const vx = Math.cos(target) * speed - player.vel.x;
        const vz = Math.sin(target) * speed - player.vel.z;
        const impulse = { x: vx * swing.playerMass, z: vz * swing.playerMass };
        const accepted = !!physics.applyImpulse({
          entityId: player.id,
          impulse,
          point: null,
          reason: 'massline_selfsling_snap',
          tick: state.tick,
        });
        impulses.push({
          entityId: player.id,
          reason: 'massline_selfsling_snap',
          accepted,
          impulse,
          angularCorrectionRad: err,
          tick: state.tick,
        });
        if (accepted) { exitAngle = target; corrected = true; }
      }
    }

    // 2) Anchor-mass release bonus — only from a genuine swing (tangential-dominant read cached
    // from the live line), never from a parked tap-latch-tap.
    let bonusDv = 0;
    if (canImpulse && Math.abs(swing.tangentialSpeed) >= SLING_MIN_EXIT_SPEED) {
      const proposedBonusDv = selfSlingBonusDv(
        swing.anchorMass,
        swing.playerMass,
        swing.tangentialSpeed,
      );
      if (proposedBonusDv > 0) {
        const impulse = {
          x: Math.cos(exitAngle) * proposedBonusDv * swing.playerMass,
          z: Math.sin(exitAngle) * proposedBonusDv * swing.playerMass,
        };
        const accepted = !!physics.applyImpulse({
          entityId: player.id,
          impulse,
          point: null,
          reason: 'massline_sling_bonus',
          tick: state.tick,
        });
        impulses.push({
          entityId: player.id,
          reason: 'massline_sling_bonus',
          accepted,
          impulse,
          deltaSpeed: proposedBonusDv,
          tick: state.tick,
        });
        if (accepted) bonusDv = proposedBonusDv;
      }
    }

    if (corrected || bonusDv > 0) {
      const releaseId = `massline:self-sling:${state.tick}:${player.id}`;
      const prediction = predictionReceipt(self || {});
      const receipt = {
        releaseId,
        source: 'massline',
        physicsEarned: bonusDv > 0,
        targetId: self ? self.targetId : null,
        anchorId: swing.anchorId,
        corrected,
        bonusDv,
        exitAngle,
        exitSpeed: speed + bonusDv,
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
    }
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

function selfSlingBonusDv(anchorMass, playerMass, tangentialSpeed) {
  if (Math.abs(finite(tangentialSpeed)) < SLING_MIN_EXIT_SPEED) return 0;
  const massRatio = Math.max(1, finite(anchorMass, 1) / Math.max(0.1, finite(playerMass, 1)));
  const decades = Math.log10(massRatio);
  const clamped = Math.min(SLING_BONUS_MAX_DECADES, Math.max(0, decades));
  return clamped > 0.15 ? clamped * SLING_BONUS_PER_DECADE : 0;
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
  runtime.solution = null;
  runtime.selfSolution = null;
}

function finite(v, fb = 0) { return Number.isFinite(v) ? v : fb; }
function positive(v, fb) { return Number.isFinite(v) && v > 0 ? v : fb; }

export { FALLBACK };
