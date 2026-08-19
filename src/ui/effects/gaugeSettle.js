import { prefersReducedMotion } from './effectRuntime.js';

const MAX_SETTLE_MS = 180;
const MIN_SETTLE_MS = 72;
const VALUE_EPS = 0.0008;
const VELOCITY_EPS = 0.003;
const MAX_OVERSHOOT = 0.12;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function clamp01(value) {
  return clamp(finite(value, 0), 0, 1);
}

function inertiaFactor(inertia = 1, massRatio = 1) {
  const i = clamp(finite(inertia, 1), 0.45, 2.5);
  const m = clamp(finite(massRatio, 1), 0.4, 2.6);
  return clamp(0.64 + i * 0.34 + (m - 1) * 0.2, 0.5, 1.65);
}

export function settleDurationMs(shieldRegenRate) {
  const regen = Math.max(0, finite(shieldRegenRate, 0));
  const norm = regen / (regen + 18);
  return Math.round(MAX_SETTLE_MS - (MAX_SETTLE_MS - MIN_SETTLE_MS) * norm);
}

export function settleOvershoot(delta, opts = {}) {
  const amp = Math.abs(finite(delta, 0));
  const inertia = inertiaFactor(opts.inertia, opts.massRatio);
  return Math.min(MAX_OVERSHOOT, amp * (0.18 + 0.1 * inertia));
}

export function planGaugeSettle(fromValue, toValue, opts = {}) {
  const reduced = opts.reducedMotion === true || prefersReducedMotion(opts);
  const from = clamp01(fromValue);
  const target = clamp01(toValue);
  const delta = target - from;
  if (reduced || Math.abs(delta) < VALUE_EPS) {
    return {
      immediate: true,
      targetValue: target,
      peakValue: target,
      upMs: 0,
      downMs: 0,
      durationMs: 0,
    };
  }
  const durationMs = settleDurationMs(opts.shieldRegenRate);
  const upMs = Math.max(48, Math.round(durationMs * 0.54));
  const downMs = Math.max(28, durationMs - upMs);
  const peakDelta = settleOvershoot(delta, opts) * Math.sign(delta || 1);
  const peakValue = clamp(target + peakDelta, -0.08, 1.08);
  return {
    immediate: false,
    targetValue: target,
    peakValue,
    upMs,
    downMs,
    durationMs,
  };
}

export function createGaugeSettleSpring(initialValue = 0) {
  const spring = {
    value: clamp01(initialValue),
    target: clamp01(initialValue),
    velocity: 0,
    lastTarget: clamp01(initialValue),
  };

  function snap(next) {
    const target = clamp01(next);
    spring.value = target;
    spring.target = target;
    spring.lastTarget = target;
    spring.velocity = 0;
    return target;
  }

  function step(nextTarget, dtS, opts = {}) {
    const target = clamp01(nextTarget);
    const reduced = opts.reducedMotion === true || prefersReducedMotion(opts);
    if (reduced || !Number.isFinite(dtS) || dtS <= 0) return snap(target);

    spring.target = target;
    const deltaTarget = spring.target - spring.lastTarget;
    spring.lastTarget = spring.target;
    const durationS = settleDurationMs(opts.shieldRegenRate) / 1000;
    const inert = inertiaFactor(opts.inertia, opts.massRatio);
    const damping = clamp(0.92 - (inert - 1) * 0.24, 0.5, 0.92);
    const omega = 4.8 / Math.max(0.05, durationS);
    if (Math.abs(deltaTarget) > VALUE_EPS) {
      spring.velocity += Math.sign(deltaTarget) * settleOvershoot(deltaTarget, opts) * omega * 1.9;
    }
    const accel = omega * omega * (spring.target - spring.value) - 2 * damping * omega * spring.velocity;
    spring.velocity += accel * dtS;
    spring.value += spring.velocity * dtS;
    if (Math.abs(spring.target - spring.value) < VALUE_EPS && Math.abs(spring.velocity) < VELOCITY_EPS) {
      spring.value = spring.target;
      spring.velocity = 0;
    }
    spring.value = clamp(spring.value, -0.08, 1.08);
    return spring.value;
  }

  return {
    step,
    snap,
    get value() { return spring.value; },
    get target() { return spring.target; },
  };
}
