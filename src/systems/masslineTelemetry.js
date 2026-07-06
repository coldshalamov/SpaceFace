// Massline kinematics telemetry — read-only observer.
// Prompt 01: this system only reads state (player, target, tether) and writes its own runtime
// subtree at state.player.masslineTelemetry. It never mutates entities, attachments, or the
// tether itself. tetherGameplay mirrors state.player.tether after combat and physics have settled
// (it runs earlier in UPDATE_ORDER), so by the time this update runs the mirrored tether state is
// current for this tick.
// Rung 05 amends the "emits no events" rule by exactly one event: `tether:snapCatch` (below).
// Everything else stays observer-only.
//
// Snap-catch (massline rung 05): the "snag something passing by" trick read. A snap-catch is a
// latch where the line goes taut FAST (within SNAP_CATCH_WINDOW_S of latch) on a genuinely moving
// catch (relative speed at the taut moment >= SNAP_CATCH_MIN_SPEED) and the capture LANDS — the
// phase reaches loaded/overload instead of stalling back to slack. Quality is swing conversion:
// |tangentialSpeed at completion| / relative speed at the snap (the massline-feel bar: >=85%
// tangential preserved = clean). Emitted at most once per latch; mirrored at telemetry.snapCatch.
const SNAP_CATCH_WINDOW_S = 1.0;   // taut within this of latch = a snag, not a slow reel
const SNAP_CATCH_MIN_SPEED = 25;   // wu/s relative speed at the taut moment = a moving catch
const SNAP_CATCH_CLEAN = 0.85;     // quality tiers mirror the release-rating bands
const SNAP_CATCH_GOOD = 0.55;

// Reel-pump (massline rung 06): the "pump a loaded line" trick read. A pump stroke is a sustained
// reel-in (tether.reelStrength rising) while the line is under real tension (phase loaded/overload,
// NOT slack/capture-only) and actually shortening (restLength falling). reelRisk is the strain at the
// pump moment — pumping an overloaded line risks a snap. tether:reelPump fires at most once per
// stroke; the stroke ends when reelStrength decays below REEL_PUMP_RESET (debounce so a held reel
// doesn't spam one event per tick). Mirrored at telemetry.reelPump. Reads tetherGameplay's already-
// mirrored tether.reelStrength/reeling/strain (rung 04); this system stays observer-only.
const REEL_PUMP_ARM = 0.55;        // reelStrength at/above this while loaded = a pump stroke begins
const REEL_PUMP_RESET = 0.15;      // reelStrength below this ends the stroke (debounce)
const REEL_PUMP_RISK_HIGH = 0.75;  // strain at/above this = 'high' risk (overload territory)
const REEL_PUMP_RISK_MED = 0.45;   // strain at/above this = 'medium' risk

// Arc-preview (massline rung 12 renders this; rung 11 is the data): the PREDICTED sling if the
// player cut right now, recomputed each active tick from the same kinematics update() already has.
// Pure data — no events, no render. Fields at telemetry.arcPreview:
//   exitSpeed  = current world speed (what a cut-now coast keeps; ballistic after the cut)
//   exitAngle  = world heading of the cut-now exit vector (atan2(vel.z, vel.x), [-PI, PI])
//   peakSpeed  = targetSpeed + |relVel| — the best exit speed this swing could convert to if the
//                remaining relative motion were fully swung tangential (triangle inequality
//                guarantees peakSpeed >= current speed)
//   timeToWhip = seconds until the line goes taut again on the current heading (0 if taut now,
//                null if it never would within ARC_WHIP_HORIZON_S)
//   viable     = the cut would actually convert: line under real load (loaded/overload), motion
//                tangential-dominant (the rateRelease tangentQuality read), genuinely moving
//                (the SNAP_CATCH_MIN_SPEED bar), and the exit ray clears the anchor body
//                (vs immediately re-snagging/impacting it).
const ARC_VIABLE_TANGENT_QUALITY = 0.5;              // |tangential| / (|tangential| + |radial|) floor
const ARC_VIABLE_MIN_EXIT_SPEED = SNAP_CATCH_MIN_SPEED; // wu/s — the "genuinely moving" bar
const ARC_WHIP_HORIZON_S = 8;                        // s — beyond this the whip read is "never"

const FALLBACK = Object.freeze({
  active: false,
  targetId: null,
  phase: 'slack',
  previousPhase: 'slack',
  distance: 0,
  restLength: 0,
  strain: 0,
  load: 0,
  radialSpeed: 0,
  tangentialSpeed: 0,
  angularSpeed: 0,
  playerSpeed: 0,
  targetSpeed: 0,
  maxStrainSinceLatch: 0,
  maxTangentialSpeedSinceLatch: 0,
  maxAngularSpeedSinceLatch: 0,
  latchTick: null,
  latchTime: null,
  snapCatch: null,
  reelPump: null,
  arcPreview: null,
});

export const masslineTelemetry = {
  id: 'masslineTelemetry',
  name: 'masslineTelemetry',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    // Remember the targetId we are tracking so we can detect a latch change.
    this._latchedTargetId = null;
    // Per-latch snap-catch state (rung 05). System-private, like _latchedTargetId.
    this._snap = null;
    // Per-latch reel-pump state (rung 06). Same privacy discipline.
    this._pump = null;
  },

  update(dt, state) {
    const playerState = state.player || (state.player = {});
    const telemetry = ensureTelemetrySubtree(playerState);

    const tether = playerState.tether;
    const active = !!(tether && tether.active && tether.targetId != null);

    if (!active) {
      // No active tether: report inactive and preserve no stale target kinematics. Do not throw.
      writeInactive(telemetry);
      this._latchedTargetId = null;
      this._snap = null;
      this._pump = null;
      return;
    }

    const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
    if (!player || !player.pos || !player.vel) {
      writeInactive(telemetry);
      this._latchedTargetId = null;
      this._snap = null;
      this._pump = null;
      return;
    }

    const target = state.entities && state.entities.get ? state.entities.get(tether.targetId) : null;
    if (!target || !target.pos || !target.vel) {
      // Missing target must not throw; treat as inactive without keeping stale kinematics.
      writeInactive(telemetry);
      // We do not clear _latchedTargetId here: the tether still nominally points at this id, so
      // if the target returns next tick we keep treating it as the same latch.
      return;
    }

    // Latch reset: tether became active on a new targetId since our previous update.
    if (this._latchedTargetId !== tether.targetId) {
      telemetry.maxStrainSinceLatch = 0;
      telemetry.maxTangentialSpeedSinceLatch = 0;
      telemetry.maxAngularSpeedSinceLatch = 0;
      telemetry.latchTick = Number.isFinite(state.tick) ? state.tick : null;
      telemetry.latchTime = Number.isFinite(state.simTime)
        ? state.simTime
        : (telemetry.latchTick != null ? telemetry.latchTick / 60 : null);
      this._latchedTargetId = tether.targetId;
      // Rung 05: new latch re-arms snap-catch with the real latch timestamp so the
      // SNAP_CATCH_WINDOW_S gate measures from actual latch, not from first observed taut.
      this._snap = freshSnap(telemetry.latchTime, telemetry.latchTick);
      telemetry.snapCatch = null;
      // Rung 06: new latch re-arms reel-pump (idle stroke, ready to detect the first pump).
      this._pump = freshPump();
      telemetry.reelPump = null;
    }

    const kinematics = computeLineKinematics(player, target);
    const strain = finite(tether.strain, 0);
    // Presentation load (rung 04) — tetherGameplay computes it in _mirror; we only relay it so
    // HUD/feedback consumers can read one subtree. Distinct from strain (physical break ratio).
    const load = finite(tether.load, 0);
    const restLength = finite(tether.restLength, 0);
    const phase = typeof tether.phase === 'string' && tether.phase ? tether.phase : 'slack';
    const playerSpeed = Math.hypot(finite(player.vel.x, 0), finite(player.vel.z, 0));
    const targetSpeed = Math.hypot(finite(target.vel.x, 0), finite(target.vel.z, 0));

    telemetry.active = true;
    telemetry.targetId = tether.targetId;
    telemetry.previousPhase = telemetry.phase != null ? telemetry.phase : phase;
    telemetry.phase = phase;
    telemetry.distance = kinematics.distance;
    telemetry.restLength = restLength;
    telemetry.strain = strain;
    telemetry.load = load;
    telemetry.radialSpeed = kinematics.radialSpeed;
    telemetry.tangentialSpeed = kinematics.tangentialSpeed;
    telemetry.angularSpeed = kinematics.angularSpeed;
    telemetry.playerSpeed = playerSpeed;
    telemetry.targetSpeed = targetSpeed;

    if (strain > telemetry.maxStrainSinceLatch) telemetry.maxStrainSinceLatch = strain;
    if (Math.abs(kinematics.tangentialSpeed) > telemetry.maxTangentialSpeedSinceLatch) {
      telemetry.maxTangentialSpeedSinceLatch = Math.abs(kinematics.tangentialSpeed);
    }
    if (Math.abs(kinematics.angularSpeed) > telemetry.maxAngularSpeedSinceLatch) {
      telemetry.maxAngularSpeedSinceLatch = Math.abs(kinematics.angularSpeed);
    }

    // Rung 11: arc-preview — the predicted sling if the player cut right now. Pure data recomputed
    // from this tick's kinematics; the render (rung 12) reads it. Observer-only, no events.
    updateArcPreview(telemetry, player, target, kinematics, phase, restLength, playerSpeed, targetSpeed);

    // Rung 05: snap-catch detection. Observer-only except for exactly one event (tether:snapCatch),
    // emitted at most once per latch and mirrored at telemetry.snapCatch. See header for the trick
    // definition. We never mutate entities/attachments/tether — only this system's own subtree + bus.
    this._stepSnapCatch(telemetry, dt, state, kinematics, strain, phase);

    // Rung 06: reel-pump detection. Same discipline — observer-only except exactly one event
    // (tether:reelPump), emitted at most once per pump stroke and mirrored at telemetry.reelPump.
    this._stepReelPump(telemetry, dt, state, strain, phase);
  },

  // Reel-pump state machine. A stroke is idle -> pumping -> spent. We arm a stroke when reelStrength
  // crosses REEL_PUMP_ARM while the line is loaded (phase loaded/overload) and shortening; we emit
  // tether:reelPump at the arm moment with the strain-as-risk read; the stroke then refuses to re-arm
  // until reelStrength decays below REEL_PUMP_RESET (debounce so a held reel fires once, not per tick).
  // Pumping on slack/capture-only tension does not count — there's no load to pump against.
  _stepReelPump(telemetry, dt, state, strain, phase) {
    const pump = this._pump;
    if (!pump) return;
    const tether = state.player && state.player.tether;
    if (!tether) return;

    const reelStrength = finite(tether.reelStrength, 0);
    const loaded = phase === 'loaded' || phase === 'overload';

    // Debounce: once a pump has fired, hold it spent until the reel decays back to idle. This is the
    // "one event per pump stroke" guarantee — a continuous held reel is ONE pump, not many.
    if (pump.stage === 'spent') {
      if (reelStrength < REEL_PUMP_RESET) {
        pump.stage = 'idle';
        pump.fired = false;
        pump.peakStrain = 0;
        pump.startTick = null;
        pump.startTime = null;
      }
      return;
    }

    // Track the worst strain observed during an armed/pumping stroke for the risk read.
    if (pump.stage === 'pumping' && strain > pump.peakStrain) pump.peakStrain = strain;

    // Arm + fire: reelStrength first crosses the arm threshold while under real load.
    if (pump.stage === 'idle' && loaded && reelStrength >= REEL_PUMP_ARM) {
      pump.stage = 'pumping';
      pump.fired = false;
      pump.peakStrain = strain;
      pump.startTick = Number.isFinite(state.tick) ? state.tick : null;
      pump.startTime = Number.isFinite(state.simTime) ? state.simTime
        : (pump.startTick != null ? pump.startTick / 60 : null);
    }

    if (pump.stage === 'pumping' && !pump.fired) {
      // Fire once at the moment the stroke is established as a real loaded pump. Using peakStrain
      // captured so far (== strain at arm for the first tick) keeps the risk read honest.
      const riskStrain = pump.peakStrain > 0 ? pump.peakStrain : strain;
      const risk = riskStrain >= REEL_PUMP_RISK_HIGH ? 'high'
        : riskStrain >= REEL_PUMP_RISK_MED ? 'medium'
        : 'low';
      const record = {
        targetId: telemetry.targetId,
        time: pump.startTime,
        tick: pump.startTick,
        reelStrength,
        strain: riskStrain,
        risk,
      };
      pump.fired = true;
      telemetry.reelPump = record;
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit('tether:reelPump', record);
      }
    }

    // A pumping stroke ends (goes spent) when the reel releases OR the load drops away.
    if (pump.stage === 'pumping' && (reelStrength < REEL_PUMP_RESET || !loaded)) {
      pump.stage = 'spent';
    }
  },

  // Snap-catch state machine. A latch begins fresh (armed). We watch for the line going taut
  // (slack -> capture/loaded/overload). If that happens within SNAP_CATCH_WINDOW_S of latch AND the
  // catch was genuinely moving (relSpeed >= SNAP_CATCH_MIN_SPEED), we record the candidate and wait
  // for it to LAND (phase reaches loaded/overload without first going back to slack). On landing we
  // score it (tangential preserved / rel speed at snap) and emit once. A return to slack at any
  // point while armed-or-candidate disqualifies the latch (it stalled, not snagged).
  _stepSnapCatch(telemetry, dt, state, kinematics, strain, phase) {
    const snap = this._snap;
    if (!snap) return;                       // no latch context (shouldn't happen post-init)
    if (snap.completed || snap.disqualified) return;

    const now = Number.isFinite(state.simTime) ? state.simTime
      : (Number.isFinite(state.tick) ? state.tick / 60 : null);
    if (now == null || snap.latchTime == null) return;

    const elapsed = now - snap.latchTime;
    const taut = phase === 'capture' || phase === 'loaded' || phase === 'overload';
    const landed = phase === 'loaded' || phase === 'overload';
    const relSpeed = Math.hypot(
      finite(playerRelVel(state, 'x'), 0),
      finite(playerRelVel(state, 'z'), 0),
    );

    // Disqualify: window expired without ever going taut (slow reel, not a snag).
    if (snap.stage === 'armed' && !taut && elapsed > SNAP_CATCH_WINDOW_S) {
      snap.disqualified = true;
      return;
    }
    // Disqualify: the line went slack again before landing (stalled, not caught).
    if (phase === 'slack' && snap.stage === 'candidate') {
      snap.disqualified = true;
      return;
    }

    // First taut moment: record the snap candidate if the catch was genuinely moving.
    if (snap.stage === 'armed' && taut) {
      if (relSpeed >= SNAP_CATCH_MIN_SPEED) {
        snap.stage = 'candidate';
        snap.snapRelSpeed = relSpeed;
        snap.snapTick = Number.isFinite(state.tick) ? state.tick : null;
        snap.snapTime = now;
      } else {
        // Taut but static — not a snap-catch. Keep monitoring in case speed builds then a second
        // taut transition occurs; but if it never does, the window expiry above disqualifies.
      }
      return;
    }

    // Candidate landed: score and emit. Quality = tangential preserved / rel speed at the snap.
    if (snap.stage === 'candidate' && landed) {
      const tangentAbs = Math.abs(kinematics.tangentialSpeed);
      const quality = snap.snapRelSpeed > 1e-6 ? clamp01(tangentAbs / snap.snapRelSpeed) : 0;
      const rating = quality >= SNAP_CATCH_CLEAN ? 'clean'
        : quality >= SNAP_CATCH_GOOD ? 'good'
        : 'rough';
      const record = {
        targetId: telemetry.targetId,
        latchTime: snap.latchTime,
        snapTime: snap.snapTime,
        landTime: now,
        snapRelSpeed: snap.snapRelSpeed,
        landTangentialSpeed: tangentAbs,
        quality,
        rating,
      };
      snap.completed = true;
      telemetry.snapCatch = record;
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit('tether:snapCatch', record);
      }
    }
  },
};

function playerRelVel(state, axis) {
  const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
  const tether = state.player && state.player.tether;
  const target = tether && tether.targetId != null && state.entities && state.entities.get
    ? state.entities.get(tether.targetId) : null;
  if (!player || !player.vel || !target || !target.vel) return 0;
  return finite(player.vel[axis], 0) - finite(target.vel[axis], 0);
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

// Per-latch snap-catch state. stage: 'armed' (just latched) -> 'candidate' (went taut fast on a
// moving catch) -> completed (landed) / disqualified (window expired or stalled to slack).
function freshSnap(latchTime, latchTick) {
  return {
    stage: 'armed',
    latchTime: latchTime != null ? latchTime : null,
    latchTick: latchTick != null ? latchTick : null,
    snapTime: null,
    snapTick: null,
    snapRelSpeed: 0,
    completed: false,
    disqualified: false,
  };
}

// Per-latch reel-pump state. stage: 'idle' (waiting for a loaded reel to arm) -> 'pumping' (armed,
// may or may not have fired yet this stroke) -> 'spent' (stroke done; debouncing until reel decays).
function freshPump() {
  return {
    stage: 'idle',
    fired: false,
    peakStrain: 0,
    startTick: null,
    startTime: null,
  };
}

function ensureTelemetrySubtree(playerState) {
  if (!playerState.masslineTelemetry) playerState.masslineTelemetry = freshRuntime();
  return playerState.masslineTelemetry;
}

function freshRuntime() {
  return {
    active: false,
    targetId: null,
    phase: 'slack',
    previousPhase: 'slack',
    distance: 0,
    restLength: 0,
    strain: 0,
    load: 0,
    radialSpeed: 0,
    tangentialSpeed: 0,
    angularSpeed: 0,
    playerSpeed: 0,
    targetSpeed: 0,
    maxStrainSinceLatch: 0,
    maxTangentialSpeedSinceLatch: 0,
    maxAngularSpeedSinceLatch: 0,
    latchTick: null,
    latchTime: null,
    snapCatch: null,
    reelPump: null,
    arcPreview: null,
  };
}

function writeInactive(telemetry) {
  telemetry.active = false;
  telemetry.targetId = null;
  // Preserve phase bookkeeping as-is (no stale target kinematics below), but do not invent a phase.
  telemetry.distance = 0;
  telemetry.restLength = 0;
  telemetry.strain = 0;
  telemetry.load = 0;
  telemetry.radialSpeed = 0;
  telemetry.tangentialSpeed = 0;
  telemetry.angularSpeed = 0;
  telemetry.playerSpeed = 0;
  telemetry.targetSpeed = 0;
  // max*SinceLatch + latchTick/Time belong to the latch that just ended; clearing them on inactive
  // keeps the subtree free of stale per-latch accumulators. reelPump is per-stroke and likewise
  // belongs to the ended latch; snapCatch is a completed-latch record and is preserved (consumers
  // may read the last catch after release).
  telemetry.maxStrainSinceLatch = 0;
  telemetry.maxTangentialSpeedSinceLatch = 0;
  telemetry.maxAngularSpeedSinceLatch = 0;
  telemetry.latchTick = null;
  telemetry.latchTime = null;
  telemetry.reelPump = null;
  // arcPreview is a live-swing projection; a released/missing line has no arc to preview.
  telemetry.arcPreview = null;
}

// Rung 11: write the arc-preview projection in place (one reused object per latch — no per-tick
// allocation). See the ARC_* constants header for the field semantics. Everything here derives
// from the same player/target kinematics the caller just computed; nothing is mutated but the
// telemetry subtree.
function updateArcPreview(telemetry, player, target, kinematics, phase, restLength, playerSpeed, targetSpeed) {
  const preview = telemetry.arcPreview
    || (telemetry.arcPreview = { peakSpeed: 0, exitAngle: 0, exitSpeed: 0, timeToWhip: null, viable: false });

  const vx = finite(player.vel.x, 0);
  const vz = finite(player.vel.z, 0);
  const relSpeed = Math.hypot(kinematics.radialSpeed, kinematics.tangentialSpeed);

  preview.exitSpeed = playerSpeed;
  preview.exitAngle = Math.atan2(vz, vx);
  preview.peakSpeed = targetSpeed + relSpeed;
  preview.timeToWhip = computeTimeToWhip(player, target, kinematics.distance, restLength);

  // Viability: the line is doing real work (loaded/overload), the motion is swing-dominant (the
  // rateRelease tangentQuality read), the exit is genuinely moving, and the cut-now coast clears
  // the anchor body instead of re-snagging/impacting it.
  const absTangential = Math.abs(kinematics.tangentialSpeed);
  const absRadial = Math.abs(kinematics.radialSpeed);
  const tangentQuality = absTangential / Math.max(absTangential + absRadial, 1e-6);
  const loaded = phase === 'loaded' || phase === 'overload';
  preview.viable = loaded
    && tangentQuality >= ARC_VIABLE_TANGENT_QUALITY
    && playerSpeed >= ARC_VIABLE_MIN_EXIT_SPEED
    && !exitRayHitsAnchor(player, target);
}

// Smallest t >= 0 with |playerPos - targetPos + relVel*t| = restLength on the current heading:
// how long until the line goes taut again (the whip). 0 when already taut; null when the relative
// drift would never consume the slack within ARC_WHIP_HORIZON_S.
function computeTimeToWhip(player, target, distance, restLength) {
  if (distance >= restLength) return 0;
  const rx = finite(player.pos.x, 0) - finite(target.pos.x, 0);
  const rz = finite(player.pos.z, 0) - finite(target.pos.z, 0);
  const wx = finite(player.vel.x, 0) - finite(target.vel.x, 0);
  const wz = finite(player.vel.z, 0) - finite(target.vel.z, 0);
  const ww = wx * wx + wz * wz;
  if (ww < 1e-9) return null;
  const rw = rx * wx + rz * wz;
  const rr = rx * rx + rz * rz;
  const disc = rw * rw - ww * (rr - restLength * restLength);
  if (disc <= 0) return null;                        // (rr < L^2 makes this positive in practice)
  const t = (-rw + Math.sqrt(disc)) / ww;
  if (!Number.isFinite(t) || t < 0 || t > ARC_WHIP_HORIZON_S) return null;
  return t;
}

// Would the cut-now coast (relative ballistic path) enter the anchor's body? Closest-approach test
// of |r - w t| vs the combined radius, same convention as masslineThreats' timeToImpact.
function exitRayHitsAnchor(player, target) {
  const rx = finite(target.pos.x, 0) - finite(player.pos.x, 0);
  const rz = finite(target.pos.z, 0) - finite(player.pos.z, 0);
  const R = Math.max(0, finite(target.radius, 0)) + Math.max(0, finite(player.radius, 6));
  const rr = rx * rx + rz * rz;
  if (rr <= R * R) return true;                      // already inside the body envelope
  const wx = finite(player.vel.x, 0) - finite(target.vel.x, 0);
  const wz = finite(player.vel.z, 0) - finite(target.vel.z, 0);
  const ww = wx * wx + wz * wz;
  if (ww < 1e-9) return false;                       // not moving relative to it — no impact course
  const rw = rx * wx + rz * wz;
  if (rw <= 0) return false;                         // coasting away from it
  return rw * rw - ww * (rr - R * R) > 0;            // path dips inside the combined radius
}

// line vector = target.pos - player.pos
// distance = length(line vector); line unit = line vector / distance
// relative velocity = player.vel - target.vel
// radialSpeed      = dot(relative velocity, line unit)
// tangentialSpeed  = 2D cross(relative velocity, line unit)  (signed: rv.x*u.z - rv.z*u.x)
// angularSpeed     = abs(tangentialSpeed) / max(distance, 1e-6)
function computeLineKinematics(player, target) {
  const dx = finite(target.pos.x, 0) - finite(player.pos.x, 0);
  const dz = finite(target.pos.z, 0) - finite(player.pos.z, 0);
  const distance = Math.hypot(dx, dz);
  const lineUnit = distance > 1e-9
    ? { x: dx / distance, z: dz / distance }
    : { x: 1, z: 0 };

  const rvx = finite(player.vel.x, 0) - finite(target.vel.x, 0);
  const rvz = finite(player.vel.z, 0) - finite(target.vel.z, 0);

  const radialSpeed = rvx * lineUnit.x + rvz * lineUnit.z;
  const tangentialSpeed = rvx * lineUnit.z - rvz * lineUnit.x; // 2D cross product (signed)
  const angularSpeed = Math.abs(tangentialSpeed) / Math.max(distance, 1e-6);

  return { distance, radialSpeed, tangentialSpeed, angularSpeed };
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

export { FALLBACK };
