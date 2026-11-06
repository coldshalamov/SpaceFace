// Seeker tell (inf-seeker-tell) — the pure decision layer.
//
// The player story: in a furball, the one urgent read is WHICH rounds are hunting you. The sim
// stamps every guided round — data.kind 'missile' ⟺ tracking 'homing', turnRate names how hard
// it turns, targetId names WHO it hunts — and no renderer read any of it: a missile rack's round
// and a fixed cannon's bolt presented as the same family of tracer, so a pilot learned a round
// was guided by watching it bend after the fact. Now a guided round carries a hot pursuit lamp:
// a hard blinker riding the round itself, red-orange when it hunts the PILOT, amber when it
// hunts anyone else. Dumb tracers stay cold.
//
// Truth read: projectile entity data only — no sim state created or written. Deterministic off
// simTime and a per-round id hash; reduced motion stretches the blink period and keeps a lit
// duty floor (the beacon-lamp floor law: a dark beacon reads as a dead one). The adapter owns
// the per-round emit cadence and the sprite pool; sprites age on the presentation clock, so a
// frozen sim freezes the lamp with everything else.

/** Blink period: a hard, urgent pulse — this is a threat read, not ambient life. */
export const SEEKER_TELL_PERIOD_S = 0.36;
export const SEEKER_TELL_REDUCED_PERIOD_MUL = 3;
/** Duty fraction: the lamp's hot window as a share of its period. */
export const SEEKER_TELL_DUTY = 0.55;
/** Sprite life covers most of the period so the lamp blinks, not strobes. */
export const SEEKER_TELL_LIFE_S = 0.26;
/** Hunting the pilot is the hottest read; hunting anyone else is a step down, not silence. */
export const SEEKER_TELL_GAIN_YOU = 1.0;
export const SEEKER_TELL_GAIN_OTHER = 0.55;
/** Hunting YOU: hot pursuit red-orange. Hunting someone else: the family amber. */
export const SEEKER_TELL_COLOR_YOU = '#ff6a3d';
export const SEEKER_TELL_COLOR_OTHER = '#ffb35c';
/** Readability cull: past this range a round's lamp is a sub-pixel glint. */
export const SEEKER_TELL_MAX_RANGE_WU = 1400;
/** Shared sprite-pool residents, prioritizing rounds hunting the pilot. */
export const SEEKER_TELL_MAX_ACTIVE = 96;

/** Lamp size rides the round body: halo fractions of the round radius. */
export const SEEKER_TELL_SIZE0_FRAC = 1.5;
export const SEEKER_TELL_SIZE1_FRAC = 2.8;

/**
 * The read a round earns, or null: null means "not guided — stay cold".
 * `data` is the projectile's data bag (kind 'missile' is stamped iff tracking === 'homing',
 * turnRate > 0 means the round actually steers, targetId names the prey).
 */
export function seekerTellOfProjectile(data) {
  if (!data || data.kind !== 'missile') return null;
  const turnRate = Number(data.turnRate);
  if (!Number.isFinite(turnRate) || !(turnRate > 0)) return null;
  return data.targetId != null ? 'guided' : 'guided-untargeted';
}

/** Who the round hunts: the pilot's own id earns the hottest read. */
export function seekerTellHuntsPlayer(data, playerId, playerGeneration = null) {
  return !!data && data.targetId != null && playerId != null && data.targetId === playerId
    && data.targetGeneration != null && playerGeneration != null
    && data.targetGeneration === playerGeneration;
}

/** Deterministic per-round phase in [0,1) — the beacon-lamp hash habit. */
export function seekerTellPhase(id) {
  let hash = 2166136261;
  const text = String(id);
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return ((hash >>> 0) / 4294967296 + 0.38196601125) % 1;
}

/**
 * Is this round's lamp inside its hot duty window at `simTime`? Phased per round so a salvo
 * of seekers does not blink in lockstep. Reduced motion stretches the period, never zeroes
 * the duty.
 */
export function seekerTellLit(id, simTime, reduced = false, flashReduced = false, phase = null) {
  // A reduced-flash warning is a steady, accessibility-filtered pursuit lamp, never silence.
  if (flashReduced) return true;
  const t = Number.isFinite(simTime) ? simTime : 0;
  const period = SEEKER_TELL_PERIOD_S * (reduced ? SEEKER_TELL_REDUCED_PERIOD_MUL : 1);
  const u01 = (((t / period + (phase == null ? seekerTellPhase(id) : phase)) % 1) + 1) % 1;
  return u01 < SEEKER_TELL_DUTY;
}

/** The blinker's world-space size for a round body of `radius` (NaN-safe). */
export function seekerTellSizes(radius, out = null) {
  const rec = out || { size0: 0, size1: 0 };
  const r = Number.isFinite(radius) && radius > 0 ? radius : 2;
  rec.size0 = r * SEEKER_TELL_SIZE0_FRAC;
  rec.size1 = r * SEEKER_TELL_SIZE1_FRAC;
  return rec;
}
