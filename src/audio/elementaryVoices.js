// CV-EAR-1 / AQ-VOICE — one continuous Elementary voice for the rope, one for the engine.
//
// Pitch and gain are decided here, on numbers the sim already published. The graph is a
// stable keyed const so a later frame updates the running voice instead of restarting it.
// WebRenderer mounts on the AudioContext the game already owns (see audioSystem).

import { el } from '@elemaudio/core';
import { THROTTLE_WINDOWS } from '../presentation/throttleAnswer.js';
import {
  MASSLINE_HUM_BASE_HZ,
  MASSLINE_HUM_STRAIN_HZ,
  TETHER_TONE_ATTACK_S,
  TETHER_TONE_GAIN_BASE,
  TETHER_TONE_GAIN_SPAN,
  TETHER_TONE_MOTION_REDUCE,
  TETHER_TONE_RELEASE_S,
  TETHER_TONE_SILENCE,
  resolveTetherLineLoad,
} from './masslineInstrument.js';

/** Existing engine-hum fundamentals. Idle is silent; the others are the authored tiers. */
export const ENGINE_TIER_HZ = Object.freeze({
  idle: 55,
  thrust: 78,
  boost: 110,
  cruise: 65,
});

/** Half the loud cue, so "the voice" cannot be a whisper that any twitch would pass. */
export const ENGINE_VOICE_THRESHOLD = THROTTLE_WINDOWS.loudGain * 0.5;

/** A quarter-second release must land here, and the first step must still be above it. */
export const ENGINE_SILENCE_CEILING = THROTTLE_WINDOWS.loudGain * 0.05;

export const ELEMENTARY_VOICE_KEYS = Object.freeze([
  'engHz', 'engGain', 'engDuck', 'ropeHz', 'ropeGain', 'ropeDuck',
]);

function clamp(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return n < lo ? lo : n > hi ? hi : n;
}

function approach(current, target, dt, riseTau, fallTau) {
  const from = Number.isFinite(current) ? current : 0;
  if (!(dt > 0)) return from;
  const tau = target > from ? riseTau : fallTau;
  if (!(tau > 0)) return target;
  return from + (target - from) * (1 - Math.exp(-dt / tau));
}

export function readDriveSpeed01(player) {
  const vel = player && player.vel;
  const speed = Math.hypot(Number(vel && vel.x) || 0, Number(vel && vel.z) || 0);
  const derived = player && player.data && player.data.derived;
  const cap = Number(derived && derived.maxSpeed);
  if (!(cap > 0) || !Number.isFinite(speed)) return null;
  return clamp(speed / cap, 0, 1);
}

/**
 * Coast, loaded acceleration, and braking are different work, not three volumes.
 * Pitch drops when throttle is ahead of speed. Braking speaks even at zero throttle.
 * A missing speed leaves the authored tier fundamental alone.
 */
export function engineEffortVoice(tierHz, { throttle = 0, speed01 = null, braking = false } = {}) {
  const base = Number(tierHz) > 0 ? Number(tierHz) : ENGINE_TIER_HZ.thrust;
  const thrust = clamp(throttle, 0, 1);
  if (braking === true && thrust < 0.15) {
    return { hz: Math.round(base * 0.62 * 100) / 100, gain: 0.35, kind: 'brake' };
  }
  const speed = speed01 == null || !Number.isFinite(Number(speed01)) ? thrust : clamp(Number(speed01), 0, 1);
  const unmet = clamp(thrust - speed, 0, 1);
  const hz = Math.round(base * (1 - 0.16 * unmet) * 100) / 100;
  let kind = 'coast';
  if (thrust >= 0.2 && unmet >= 0.35) kind = 'loaded';
  else if (thrust >= 0.2) kind = 'free';
  return { hz, gain: thrust, kind };
}

/** Load → Hz. The live tether hum: 90 + load * 220. Three loads, three rising pitches. */
export function ropePitchHz(load) {
  return Math.round((MASSLINE_HUM_BASE_HZ + clamp(load, 0, 1.25) * MASSLINE_HUM_STRAIN_HZ) * 100) / 100;
}

export function engineTierHz(tier) {
  if (tier === 'boost') return ENGINE_TIER_HZ.boost;
  if (tier === 'cruise') return ENGINE_TIER_HZ.cruise;
  if (tier === 'idle') return ENGINE_TIER_HZ.idle;
  return ENGINE_TIER_HZ.thrust;
}

/**
 * Cruise and boost are already a full voice in the old tier law. Manual thrust follows the
 * stick, so 0 is silence and a half-stick is not snapped to full.
 */
export function engineCommand(throttle, tier) {
  if (tier === 'cruise' || tier === 'boost') return 1;
  const t = Number(throttle);
  if (!Number.isFinite(t) || t <= 0) return 0;
  return t > 1 ? 1 : t;
}

/** Quieter of the two ducks the game already computes. Missing values stay at unity. */
export function combineWeaponDuck(sidechain, priority) {
  const a = Number.isFinite(sidechain) ? clamp(sidechain, 0, 1) : 1;
  const b = Number.isFinite(priority) ? clamp(priority, 0, 1) : 1;
  return Math.min(a, b);
}

/**
 * Plume rule: frame throttle, else commandedThrottle, and a held stick or strafe still
 * counts when physics has zeroed the applied force.
 */
export function readPublishedThrottle(source = {}) {
  const frame = source.frame || {};
  let physics = 0;
  if (Number.isFinite(frame.throttle)) physics = frame.throttle;
  else if (Number.isFinite(frame.commandedThrottle)) physics = frame.commandedThrottle;
  const pilot = Number.isFinite(source.moveZ) && source.moveZ > 0 ? source.moveZ : 0;
  const strafe = Number.isFinite(source.moveX) ? Math.abs(source.moveX) : 0;
  return clamp(Math.max(0, physics, pilot, strafe), 0, 1);
}

/**
 * Taut line only. Slack and a missing tether publish load 0 and playing false. FB-079:
 * the caller's resolved tow mass lifts the read through the same law the legacy hum's
 * resolveTetherTone uses — one writer (resolveTetherLineLoad), so a heavy tow creaks on
 * this backend exactly as authored there, and never through a slack line.
 */
export function readTetherLoad(tether, towMass) {
  return resolveTetherLineLoad(tether, towMass);
}

/**
 * Advance the two envelopes. `dt` is flight time; paused or non-flight callers pass the
 * hold flags and the envelopes do not move. Returned gains are pre-duck; `heard*` includes it.
 * Mutates and returns `state` so the audio frame can keep one object.
 */
export function stepElementaryVoices(state, input = {}) {
  const out = state && typeof state === 'object' ? state : { engineGain: 0, ropeGain: 0 };
  const hold = input.paused === true || input.flight === false;
  const dt = hold ? 0 : Math.max(0, Number(input.dt) || 0);
  const tier = input.tier || 'idle';
  const command = engineCommand(input.throttle, tier);
  const effort = engineEffortVoice(engineTierHz(tier), {
    throttle: command,
    speed01: input.speed01,
    braking: input.braking === true,
  });
  let engineTarget = THROTTLE_WINDOWS.loudGain * command;
  if (effort.kind === 'brake') engineTarget = THROTTLE_WINDOWS.loudGain * effort.gain;
  out.engineGain = approach(
    out.engineGain, engineTarget, dt,
    THROTTLE_WINDOWS.cueRiseTau, THROTTLE_WINDOWS.cueFallTau,
  );

  const playing = input.playing === true;
  const load = clamp(input.load, 0, 1.25);
  // Slack matches the published tether tone: quiet at the silence floor, not a hard cut.
  let ropeTarget = TETHER_TONE_SILENCE;
  if (playing) {
    const shaped = TETHER_TONE_GAIN_BASE
      + Math.pow(Math.min(load, 1), 1.25) * TETHER_TONE_GAIN_SPAN;
    const motion = input.motionReduce ? TETHER_TONE_MOTION_REDUCE : 1;
    ropeTarget = shaped * motion;
    if (input.motionReduce) ropeTarget = Math.max(ropeTarget, TETHER_TONE_SILENCE * 8);
  }
  out.ropeGain = approach(
    out.ropeGain, ropeTarget, dt,
    TETHER_TONE_ATTACK_S, TETHER_TONE_RELEASE_S,
  );

  const duck = (Number.isFinite(input.sidechainDuck) || Number.isFinite(input.priorityDuck))
    ? combineWeaponDuck(input.sidechainDuck, input.priorityDuck)
    : (Number.isFinite(input.duck) ? clamp(input.duck, 0, 1) : 1);

  out.engineHz = effort.hz;
  out.ropeHz = ropePitchHz(load);
  out.duck = duck;
  out.heardEngine = out.engineGain * duck;
  out.heardRope = out.ropeGain * duck;
  out.engineTarget = engineTarget;
  return out;
}

function finiteOr(v, fallback) {
  return Number.isFinite(v) ? v : fallback;
}

function keyedVoice(hzKey, hz, gainKey, gain, duckKey, duck) {
  // Pitch de-zips across a tier change. Gain and duck are already enveloped upstream;
  // smoothing them again would push the voice past the 120 ms / 250 ms windows.
  return el.mul(
    el.cycle(el.sm(el.const({ key: hzKey, value: hz }))),
    el.const({ key: gainKey, value: gain }),
    el.const({ key: duckKey, value: duck }),
  );
}

/**
 * Left = engine, right = rope. Keys are stable across calls so the renderer updates props.
 * Each channel owns its duck key (`engDuck` / `ropeDuck`) at the same value — one duck,
 * two buses, no shared node across the two rendered roots.
 */
export function buildElementaryVoiceGraph(voice = {}) {
  const duck = finiteOr(voice.duck, 1);
  const left = keyedVoice(
    'engHz', finiteOr(voice.engineHz, ENGINE_TIER_HZ.thrust),
    'engGain', finiteOr(voice.engineGain, 0),
    'engDuck', duck,
  );
  const right = keyedVoice(
    'ropeHz', finiteOr(voice.ropeHz, MASSLINE_HUM_BASE_HZ),
    'ropeGain', finiteOr(voice.ropeGain, 0),
    'ropeDuck', duck,
  );
  return { left, right };
}

/** Walk a rendered Elementary node for keyed constants. Cons cells are `{hd, tl}`; empty is 0. */
export function collectElementaryConsts(node, out = [], seen = new Set()) {
  if (node == null || typeof node === 'number' || typeof node === 'string') return out;
  if (typeof node !== 'object' || seen.has(node)) return out;
  seen.add(node);
  if (Object.prototype.hasOwnProperty.call(node, 'hd') || Object.prototype.hasOwnProperty.call(node, 'tl')) {
    collectElementaryConsts(node.hd, out, seen);
    collectElementaryConsts(node.tl, out, seen);
    return out;
  }
  const props = node.props;
  if (props && typeof props.key === 'string') out.push({ key: props.key, value: props.value });
  collectElementaryConsts(node.children, out, seen);
  return out;
}

/** 0 while Elementary owns the beds. null leaves the legacy cue gain alone. */
export function legacyContinuousGain(connected) {
  return connected ? 0 : null;
}
