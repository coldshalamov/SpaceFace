// Massline kinematics telemetry — read-only observer.
// Prompt 01: this system only reads state (player, target, tether) and writes its own runtime
// subtree at state.player.masslineTelemetry. It never mutates entities, attachments, or the
// tether itself, and it emits no events. tetherGameplay mirrors state.player.tether after combat
// and physics have settled (it runs earlier in UPDATE_ORDER), so by the time this update runs the
// mirrored tether state is current for this tick.

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
});

export const masslineTelemetry = {
  id: 'masslineTelemetry',
  name: 'masslineTelemetry',

  init(ctx) {
    this.state = ctx.state;
    // Remember the targetId we are tracking so we can detect a latch change.
    this._latchedTargetId = null;
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
      return;
    }

    const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
    if (!player || !player.pos || !player.vel) {
      writeInactive(telemetry);
      this._latchedTargetId = null;
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
  },
};

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
  // keeps the subtree free of stale per-latch accumulators.
  telemetry.maxStrainSinceLatch = 0;
  telemetry.maxTangentialSpeedSinceLatch = 0;
  telemetry.maxAngularSpeedSinceLatch = 0;
  telemetry.latchTick = null;
  telemetry.latchTime = null;
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
