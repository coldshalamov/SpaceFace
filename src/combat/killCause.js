// AC-08: one pure kill-cause classifier (design/arcade-core/02_STYLE_KILLS.md).
//
// Converts real physical death truth into a silent style identity plus a credit/RP multiplier.
// One classifier, two consumers: the immutable `entity:killed` presentation receipt carries the
// identity for the AC-09 death signatures, and the reward writers consume the multiplier.
//
// Purity contract: no state reads, no RNG, no entity writes, no clock. Every input is a value the
// caller already snapshotted from real physics before the consequences of that same contact ran.
//
// Fail-closed contract: malformed, missing, or ambiguous input classifies as `ordinary`. The
// classifier never guesses a richer bucket, and it never infers style from colour, weapon name, or
// target class — those are explicit 02_STYLE_KILLS bans. Victim and killer identity are accepted
// for receipt traceability and deliberately do NOT select a bucket.
import { overwhelmsAttitudeControl } from './tumbleStatus.js';

export const KILL_CAUSE_VERSION = 1;

export const KILL_CAUSE_ORDINARY = 'ordinary';
export const KILL_CAUSE_TERRAIN_SMASH = 'terrain_smash';
export const KILL_CAUSE_CHAIN = 'chain';
export const KILL_CAUSE_WELL_COLLAPSE = 'well_collapse';
export const KILL_CAUSE_BURN_UP = 'burn_up';

export const KILL_CAUSE_IDS = Object.freeze([
  KILL_CAUSE_ORDINARY,
  KILL_CAUSE_TERRAIN_SMASH,
  KILL_CAUSE_CHAIN,
  KILL_CAUSE_WELL_COLLAPSE,
  KILL_CAUSE_BURN_UP,
]);

/** Flat multipliers. Chain is computed from its depth and is never read from this table. */
export const KILL_CAUSE_MULTIPLIERS = Object.freeze({
  [KILL_CAUSE_ORDINARY]: 1,
  [KILL_CAUSE_TERRAIN_SMASH]: 1.5,
  [KILL_CAUSE_CHAIN]: 1.5,
  [KILL_CAUSE_WELL_COLLAPSE]: 1.5,
  [KILL_CAUSE_BURN_UP]: 2,
});

/** Compounding chain link: 1.5, 2.25, 3.375, then the authored ceiling. */
export const CHAIN_MULTIPLIER_BASE = 1.5;
export const CHAIN_MULTIPLIER_CAP = 4;

/**
 * Zone identities. AC-13 owns the atmosphere/gravity-well producer; nothing in this slice emits
 * one, so burn-up and well-collapse classify from explicit input only and stay unreachable on the
 * current default routes rather than being faked from a stand-in.
 */
export const KILL_ZONE_ATMOSPHERE_BURN = 'atmosphere_burn';
export const KILL_ZONE_WELL_INNER = 'well_inner';

/** Low-level `presentation.cause` values that mean "this hull died from a physical contact". */
const TERRAIN_CONTACT_CAUSE = 'terrain_collision';
const CRAFT_CONTACT_CAUSE = 'ship_collision';

const ORDINARY = Object.freeze({
  version: KILL_CAUSE_VERSION,
  id: KILL_CAUSE_ORDINARY,
  multiplier: 1,
  chainDepth: 0,
});

function readZoneId(zone) {
  if (typeof zone === 'string') return zone;
  if (!zone || typeof zone !== 'object') return null;
  if (typeof zone.id === 'string') return zone.id;
  if (typeof zone.kind === 'string') return zone.kind;
  return null;
}

/**
 * Normalize the tumble truth pair. `{ victim, source }` is canonical; a bare boolean is accepted as
 * the victim-only shorthand so a fabricated "shot dead while tumbling" event stays expressible.
 * Anything else reads as "no tumble truth", which can only ever produce `ordinary`.
 */
function readTumbleFlags(tumbleState) {
  if (tumbleState === true) return { victim: true, source: false };
  if (!tumbleState || typeof tumbleState !== 'object') return { victim: false, source: false };
  return {
    victim: tumbleState.victim === true,
    source: tumbleState.source === true,
  };
}

/** Chain depth counts kills scored by one tumbling projectile; this kill is at least link 1. */
function readChainDepth(value) {
  const depth = Math.trunc(Number(value));
  return Number.isFinite(depth) && depth > 1 ? depth : 1;
}

/**
 * `min(cap, base ** depth)`, accumulated by repeated multiplication rather than `**`.
 *
 * Exponentiation is implementation-approximated in ECMAScript, so `1.5 ** 3` is not guaranteed to
 * be exactly 3.375 on every engine. Every value this ladder visits below the cap is a small dyadic
 * rational, so repeated multiplication is exact — and a payout table must not drift by an ulp
 * between hosts. The cap also bounds the loop.
 */
export function chainMultiplierForDepth(depth) {
  const links = readChainDepth(depth);
  let multiplier = 1;
  for (let link = 0; link < links && multiplier < CHAIN_MULTIPLIER_CAP; link++) {
    multiplier *= CHAIN_MULTIPLIER_BASE;
  }
  return Math.min(CHAIN_MULTIPLIER_CAP, multiplier);
}

function frozenCause(id, multiplier, chainDepth = 0) {
  return Object.freeze({
    version: KILL_CAUSE_VERSION,
    id,
    multiplier,
    chainDepth,
  });
}

/**
 * Classify one death into its silent style bucket.
 *
 * Input: `{ victimId, killerId, cause, tumbleState, impactVelocity, zone, chainDepth }`
 *   cause          — the low-level `presentation.cause` the death already carries
 *   tumbleState    — `{ victim, source }` pre-contact tumble truth, snapshotted by the caller
 *   impactVelocity — contact delta-v in wu/s
 *   zone           — explicit execution-zone identity (AC-13), or null
 *   chainDepth     — how many kills this tumbling projectile has now scored, including this one
 *
 * Bucket priority is zone before contact: a body that died inside an atmosphere or a well's inner
 * band died of that place, whatever else it was touching on the way down. Contact buckets then
 * resolve chain before terrain, because a craft contact and a terrain contact are mutually
 * exclusive surfaces and only the source-tumbling test separates a chain from an ordinary ram.
 */
export function classifyKillCause(input) {
  if (!input || typeof input !== 'object') return ORDINARY;

  const zone = readZoneId(input.zone);
  if (zone === KILL_ZONE_ATMOSPHERE_BURN) {
    return frozenCause(KILL_CAUSE_BURN_UP, KILL_CAUSE_MULTIPLIERS[KILL_CAUSE_BURN_UP]);
  }
  if (zone === KILL_ZONE_WELL_INNER) {
    return frozenCause(KILL_CAUSE_WELL_COLLAPSE, KILL_CAUSE_MULTIPLIERS[KILL_CAUSE_WELL_COLLAPSE]);
  }

  const cause = typeof input.cause === 'string' ? input.cause : null;
  const tumble = readTumbleFlags(input.tumbleState);

  // A craft death is a chain link only when the body that hit it was ALREADY a projectile. Two
  // ships flying into each other under power is an ordinary collision, not the arcade payoff.
  if (cause === CRAFT_CONTACT_CAUSE && tumble.source) {
    const depth = readChainDepth(input.chainDepth);
    return frozenCause(KILL_CAUSE_CHAIN, chainMultiplierForDepth(depth), depth);
  }

  // Terrain smash is the tumbling body arriving hard. A hull that was still under its own control
  // when it clipped a rock, or one that grazed below the shared tumble threshold, is ordinary — and
  // so is a tumbling ship shot dead in open space, which never reaches this branch at all.
  if (cause === TERRAIN_CONTACT_CAUSE && tumble.victim
    && overwhelmsAttitudeControl(Number(input.impactVelocity))) {
    return frozenCause(KILL_CAUSE_TERRAIN_SMASH, KILL_CAUSE_MULTIPLIERS[KILL_CAUSE_TERRAIN_SMASH]);
  }

  return ORDINARY;
}

/** Multiplier carried by a classified receipt. Any missing or malformed receipt pays ×1. */
export function styleMultiplierOf(style) {
  const multiplier = Number(style && style.multiplier);
  return Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
}

/**
 * The single rounding edge for every style-multiplied payout. Credits and RP are whole numbers, so
 * the multiplier resolves to an integer exactly once, at the moment the channel pays — never on a
 * running balance and never on a material quantity.
 */
export function applyStyleMultiplier(amount, multiplier) {
  const base = Number(amount);
  if (!Number.isFinite(base) || base <= 0) return 0;
  const scale = Number(multiplier);
  const safe = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return Math.max(0, Math.round(base * safe));
}
