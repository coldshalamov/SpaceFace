import { DEFAULT_VFX_ADMISSION_PRIORITY } from '../presentation/vfxAdmissionPriority.js';

export const MOMENTUM_SINK_VFX_HZ = 12;
export const MOMENTUM_SINK_VFX_TARGET_CAPACITY = 6;
export const MOMENTUM_SINK_VFX_DEADBAND_SPEED = 0.25;

// These are the already-established causal/current-target tiers used by the thrown-body cue.
// Momentum Sink shares those tiers rather than reserving capacity or inventing a new priority lane.
const PLAYER_CAUSED_PRIORITY = 0.92;
const CURRENT_TARGET_PRIORITY = 0.98;
const MAX_AUTHORED_RELATIVE_SPEED = 180;
const RESIDUE_LIFE_S = 1 / MOMENTUM_SINK_VFX_HZ;

export const MOMENTUM_SINK_VFX_COLORS = Object.freeze({
  core: '#fff0bf',
  compression: '#ff9d48',
  particleStart: '#fff5d6',
  particleEnd: '#ff713d',
});

export function createMomentumSinkVfxPlanScratch() {
  return {
    active: false,
    targetX: 0,
    targetZ: 0,
    targetVelocityX: 0,
    targetVelocityZ: 0,
    frameVelocityX: 0,
    frameVelocityZ: 0,
    relativeVelocityX: 0,
    relativeVelocityZ: 0,
    relativeSpeed: 0,
    axisX: 0,
    axisZ: 0,
    perpX: 0,
    perpZ: 0,
    radius: 0,
    life: 0,
    width: 0,
    length: 0,
    opacity: 0,
    centerOffset: 0,
    sideOffset: 0,
    convergenceSpeed: 0,
    particleSpeed: 0,
    carryX: 0,
    carryZ: 0,
    streakCount: 0,
    particleCount: 0,
    admissionPriority: DEFAULT_VFX_ADMISSION_PRIORITY,
  };
}

/**
 * Resolve one allocation-free world-space Momentum Sink presentation plan.
 *
 * The stored attacker-frame velocity is combat-owned truth. This planner never looks up an
 * attacker, writes velocity, or subtracts the render frame origin. Existing VFX spawners own the
 * single global-to-frame conversion.
 */
export function resolveMomentumSinkVfxPlan(out, input) {
  if (!out) return null;
  const plan = out;
  resetPlan(plan);
  if (!input || input.frameReady !== true) return plan;

  const position = input.targetPosition;
  const velocity = input.targetVelocity;
  const frameVelocity = input.frameVelocity;
  if (!finiteXZ(position) || !finiteXZ(velocity) || !finiteXZ(frameVelocity)) return plan;

  const relativeX = velocity.x - frameVelocity.x;
  const relativeZ = velocity.z - frameVelocity.z;
  const relativeSpeed = Math.hypot(relativeX, relativeZ);
  if (!Number.isFinite(relativeSpeed) || !(relativeSpeed > MOMENTUM_SINK_VFX_DEADBAND_SPEED)) {
    return plan;
  }

  const axisX = -relativeX / relativeSpeed;
  const axisZ = -relativeZ / relativeSpeed;
  if (!Number.isFinite(axisX) || !Number.isFinite(axisZ)) return plan;

  const radiusInput = Number(input.radius);
  const radius = clamp(Number.isFinite(radiusInput) ? radiusInput : 6, 2, 30);
  const speedT = clamp01(
    (relativeSpeed - MOMENTUM_SINK_VFX_DEADBAND_SPEED)
      / (MAX_AUTHORED_RELATIVE_SPEED - MOMENTUM_SINK_VFX_DEADBAND_SPEED),
  );
  const motionReduce = input.motionReduce === true;
  const flashReduce = input.flashReduce === true;
  const fullLength = clamp(6 + radius * 0.45 + speedT * 18, 7, 31);
  const fullWidth = clamp(0.26 + radius * 0.025 + speedT * 0.2, 0.3, 0.92);
  const fullOpacity = 0.58 + speedT * 0.18;

  plan.active = true;
  plan.targetX = position.x;
  plan.targetZ = position.z;
  plan.targetVelocityX = velocity.x;
  plan.targetVelocityZ = velocity.z;
  plan.frameVelocityX = frameVelocity.x;
  plan.frameVelocityZ = frameVelocity.z;
  plan.relativeVelocityX = relativeX;
  plan.relativeVelocityZ = relativeZ;
  plan.relativeSpeed = relativeSpeed;
  // This is the signed convergence direction: frame velocity minus target velocity.
  plan.axisX = axisX;
  plan.axisZ = axisZ;
  plan.perpX = -axisZ;
  plan.perpZ = axisX;
  plan.radius = radius;
  plan.life = RESIDUE_LIFE_S;
  plan.length = motionReduce ? clamp(fullLength * 0.62, 5, 15) : fullLength;
  plan.width = motionReduce ? fullWidth * 0.78 : fullWidth;
  plan.opacity = motionReduce
    ? (flashReduce ? 0.22 : 0.3)
    : (flashReduce ? fullOpacity * 0.54 : fullOpacity);
  plan.centerOffset = radius * 0.65 + plan.length * 0.22;
  plan.sideOffset = motionReduce ? 0 : clamp(radius * 0.55 + speedT * 2.5, 2, 18);
  plan.convergenceSpeed = motionReduce ? 0 : clamp(4 + relativeSpeed * 0.05, 4, 18);
  plan.particleSpeed = motionReduce ? 0 : clamp(6 + relativeSpeed * 0.07, 6, 24);
  // Carry follows the target's real translation; only the side channels add convergence travel.
  plan.carryX = velocity.x;
  plan.carryZ = velocity.z;
  plan.streakCount = motionReduce ? 1 : 3;
  plan.particleCount = motionReduce || flashReduce ? 0 : 2;
  plan.admissionPriority = input.targetRelevant === true
    ? CURRENT_TARGET_PRIORITY
    : input.playerCaused === true
      ? PLAYER_CAUSED_PRIORITY
      : DEFAULT_VFX_ADMISSION_PRIORITY;
  return plan;
}

function resetPlan(plan) {
  plan.active = false;
  plan.targetX = 0;
  plan.targetZ = 0;
  plan.targetVelocityX = 0;
  plan.targetVelocityZ = 0;
  plan.frameVelocityX = 0;
  plan.frameVelocityZ = 0;
  plan.relativeVelocityX = 0;
  plan.relativeVelocityZ = 0;
  plan.relativeSpeed = 0;
  plan.axisX = 0;
  plan.axisZ = 0;
  plan.perpX = 0;
  plan.perpZ = 0;
  plan.radius = 0;
  plan.life = 0;
  plan.width = 0;
  plan.length = 0;
  plan.opacity = 0;
  plan.centerOffset = 0;
  plan.sideOffset = 0;
  plan.convergenceSpeed = 0;
  plan.particleSpeed = 0;
  plan.carryX = 0;
  plan.carryZ = 0;
  plan.streakCount = 0;
  plan.particleCount = 0;
  plan.admissionPriority = DEFAULT_VFX_ADMISSION_PRIORITY;
  return plan;
}

function finiteXZ(value) {
  return !!value
    && typeof value.x === 'number' && Number.isFinite(value.x)
    && typeof value.z === 'number' && Number.isFinite(value.z);
}

function clamp01(value) {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}
