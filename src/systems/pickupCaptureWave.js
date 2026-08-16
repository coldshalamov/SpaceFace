// Pickup capture wave (Arcade Core AC-12).
//
// AC-02 owns the one range/homing policy in pickupAttraction.js and mining owns collection. This
// module owns only *when* a pickup joins the vacuum, *where* it enters the hull, and *how loud and
// high* its arrival reads. Nothing here touches reward amounts, cargo, or credits.
//
// Everything is transient: the schedule is rebuilt from live entities, never serialized, and reset
// on lifecycle boundaries. Sim callers pass state.simTime; there is no wall clock and no rng here.

/** Ripple spacing between consecutive captures. 24–40 drops stream over ~1–1.6 s. */
export const CAPTURE_WAVE_SPACING_S = 0.04;
/** Chain bookkeeping ceiling before dead chains are collected. */
const CAPTURE_WAVE_CHAIN_GC_AT = 8;

/** A pickup landing more than this after the previous one starts a fresh pitch ladder. */
export const PICKUP_CHAIN_RESET_S = 0.32;
/** The ladder saturates on the eighth pickup of a chain (index 7). */
export const PICKUP_CHAIN_PITCH_STEPS = 7;
/** One equal-tempered semitone per rung. Seven rungs is a perfect fifth — bounded, never shrill. */
export const PICKUP_CHAIN_SEMITONE = Math.pow(2, 1 / 12);
/** Past this many chained pickups the cloud shimmers: voices thin out and gain decays. */
export const PICKUP_CHAIN_SOFT_CAP = 8;
/** Floor so a thinned voice is still audible rather than a silent stub. */
export const PICKUP_CHAIN_MIN_GAIN = 0.34;

export const PICKUP_MATERIAL_RECIPE = 'sfx_loot_collect';
export const PICKUP_CREDIT_RECIPE = 'sfx_ui_confirm';
/** Materials read light and bright; money reads rounder and lower. */
export const PICKUP_MATERIAL_BASE_RATE = 1;
export const PICKUP_CREDIT_BASE_RATE = 0.82;
export const PICKUP_MATERIAL_BASE_GAIN = 0.5;
export const PICKUP_CREDIT_BASE_GAIN = 0.62;

const CREDIT_CHIP_GRANT_PREFIX = 'kill:credit_chip:';

/**
 * True when an `economy:grantCredits` / `credits:changed` reason came from a collected credit chip.
 * The chip already speaks with its own rounder voice, so the generic positive-credit confirm must
 * stay silent for that grant instead of layering two money sounds on one pickup.
 */
export function isCreditChipGrantReason(reason) {
  return typeof reason === 'string' && reason.startsWith(CREDIT_CHIP_GRANT_PREFIX);
}

export function createCaptureWave() {
  return {
    entries: new Map(),
    chainSizes: new Map(),
    chainStart: -Infinity,
    lastActivateAt: -Infinity,
    chainId: 0,
  };
}

export function resetCaptureWave(wave) {
  if (!wave) return;
  if (wave.entries) wave.entries.clear();
  if (wave.chainSizes) wave.chainSizes.clear();
  wave.chainStart = -Infinity;
  wave.lastActivateAt = -Infinity;
  wave.chainId = 0;
}

function compareCaptureCandidates(a, b) {
  if (a.distance !== b.distance) return a.distance - b.distance;
  // Stable tiebreak on pickup identity so an equidistant pair cannot swap order between ticks.
  const ai = a.id;
  const bi = b.id;
  if (typeof ai === 'number' && typeof bi === 'number') return ai - bi;
  const as = String(ai);
  const bs = String(bi);
  return as < bs ? -1 : as > bs ? 1 : 0;
}

function collectChains(wave) {
  if (!wave.chainSizes || wave.chainSizes.size <= CAPTURE_WAVE_CHAIN_GC_AT) return;
  const live = new Set();
  for (const entry of wave.entries.values()) live.add(entry.chainId);
  for (const chainId of [...wave.chainSizes.keys()]) {
    if (!live.has(chainId)) wave.chainSizes.delete(chainId);
  }
}

/**
 * Assign activation times to newly eligible pickups, nearest first, at a fixed ripple spacing.
 *
 * `candidates` is the caller's scratch list of `{ id, distance }`; it is sorted in place and its
 * records are not retained. Already-scheduled ids are skipped, so a live wave is never re-sorted —
 * drifting drops keep the slot they were given, which is what makes the ripple read as a wave
 * rolling outward instead of jittering every tick.
 *
 * A batch arriving while the previous tail is still in the future appends after it, producing one
 * continuous stream rather than two overlapping ripples. Once the tail has elapsed the next arrival
 * starts a fresh chain and captures immediately.
 */
export function scheduleCaptureCandidates(wave, candidates, simTime, spacing = CAPTURE_WAVE_SPACING_S) {
  if (!wave || !wave.entries || !Array.isArray(candidates) || candidates.length === 0) return 0;
  const now = Number.isFinite(simTime) ? simTime : 0;
  const step = Number.isFinite(spacing) && spacing > 0 ? spacing : CAPTURE_WAVE_SPACING_S;
  candidates.sort(compareCaptureCandidates);
  let assigned = 0;
  for (const candidate of candidates) {
    if (!candidate || candidate.id == null) continue;
    if (wave.entries.has(candidate.id)) continue;
    let chainId = wave.chainId;
    let chainIndex = chainId > 0 ? (wave.chainSizes.get(chainId) || 0) : 0;
    // Slots are chainStart + index * spacing rather than an accumulated sum, so a long ripple
    // cannot drift off the grid one float epsilon at a time.
    let activateAt = wave.chainStart + chainIndex * step;
    if (chainId <= 0 || !(activateAt > now)) {
      // The previous chain's tail has already passed: this drop opens a new ladder and homes now.
      chainId = wave.chainId += 1;
      wave.chainStart = now;
      wave.chainSizes.set(chainId, 0);
      chainIndex = 0;
      activateAt = now;
    }
    wave.chainSizes.set(chainId, chainIndex + 1);
    wave.entries.set(candidate.id, { activateAt, chainId, chainIndex });
    wave.lastActivateAt = activateAt;
    assigned++;
  }
  if (assigned) collectChains(wave);
  return assigned;
}

export function captureEntry(wave, id) {
  if (!wave || !wave.entries || id == null) return null;
  return wave.entries.get(id) || null;
}

export function captureActivatedAt(wave, id) {
  const entry = captureEntry(wave, id);
  return entry ? entry.activateAt : null;
}

export function isCaptureActive(wave, id, simTime) {
  const entry = captureEntry(wave, id);
  if (!entry) return false;
  return Number.isFinite(simTime) && simTime >= entry.activateAt;
}

/**
 * Index and running size of the ripple this pickup belongs to, for presentation and audio.
 * `chainCount` is the chain's size so far — a batch scheduled together reports the whole batch.
 */
export function captureChainInfo(wave, id) {
  const entry = captureEntry(wave, id);
  if (!entry) return null;
  const size = (wave.chainSizes && wave.chainSizes.get(entry.chainId)) || (entry.chainIndex + 1);
  return {
    chainId: entry.chainId,
    chainIndex: entry.chainIndex,
    chainCount: size,
    activateAt: entry.activateAt,
  };
}

export function releaseCaptureEntry(wave, id) {
  if (!wave || !wave.entries || id == null) return false;
  return wave.entries.delete(id);
}

/**
 * Drop schedule rows whose pickup died, was collected, or left the vacuum band.
 * `shouldKeep(id)` is the caller's liveness test; the wave never holds an entity reference itself.
 */
export function pruneCaptureWave(wave, shouldKeep) {
  if (!wave || !wave.entries || wave.entries.size === 0) return 0;
  if (typeof shouldKeep !== 'function') return 0;
  let dropped = 0;
  for (const id of [...wave.entries.keys()]) {
    if (shouldKeep(id)) continue;
    wave.entries.delete(id);
    dropped++;
  }
  if (dropped) {
    if (wave.entries.size === 0) wave.chainSizes.clear();
    else collectChains(wave);
  }
  return dropped;
}

/**
 * Nearest point on the collector's XZ hull radius along the incoming vector — where the stream
 * actually enters the ship. Never the hull center.
 *
 * Zero-distance (a drop resolved exactly on the hull origin) resolves deterministically along the
 * collector's own facing, so the intake is still a real surface point and never NaN.
 */
export function hullIntakePoint(collector, fromX, fromZ, out) {
  const target = out || { x: 0, z: 0 };
  const px = Number.isFinite(fromX) ? fromX : 0;
  const pz = Number.isFinite(fromZ) ? fromZ : 0;
  if (!collector || !collector.pos) {
    target.x = px;
    target.z = pz;
    return target;
  }
  const cx = Number.isFinite(collector.pos.x) ? collector.pos.x : 0;
  const cz = Number.isFinite(collector.pos.z) ? collector.pos.z : 0;
  const radius = Number.isFinite(collector.radius) && collector.radius > 0 ? collector.radius : 0;
  let dx = px - cx;
  let dz = pz - cz;
  let len = Math.hypot(dx, dz);
  if (!(len > 1e-6)) {
    const rot = Number.isFinite(collector.rot) ? collector.rot : 0;
    dx = Math.cos(rot);
    dz = Math.sin(rot);
    len = 1;
  }
  target.x = cx + (dx / len) * radius;
  target.z = cz + (dz / len) * radius;
  return target;
}

export function createPickupChain() {
  return { index: 0, lastAt: -Infinity };
}

export function resetPickupChain(chain) {
  if (!chain) return;
  chain.index = 0;
  chain.lastAt = -Infinity;
}

/**
 * Advance the collection pitch ladder one pickup and report the voice it earns.
 *
 * The ladder state advances unconditionally — callers must invoke this before deciding whether a
 * voice is actually audible, so a muted, culled, or soft-capped pickup still moves the chain.
 * Rising is bounded to seven semitone rungs and saturates on the eighth pickup; past the soft cap
 * voices thin out and lose gain so a mote cloud shimmers instead of machine-gunning.
 */
export function advancePickupChain(chain, simTime, options) {
  const state = chain || createPickupChain();
  const now = Number.isFinite(simTime) ? simTime : 0;
  const reset = !(now - state.lastAt <= PICKUP_CHAIN_RESET_S);
  state.index = reset ? 0 : state.index + 1;
  state.lastAt = now;

  const credit = !!(options && options.credit);
  const index = state.index;
  const rung = index < PICKUP_CHAIN_PITCH_STEPS ? index : PICKUP_CHAIN_PITCH_STEPS;
  const baseRate = credit ? PICKUP_CREDIT_BASE_RATE : PICKUP_MATERIAL_BASE_RATE;
  let gain = credit ? PICKUP_CREDIT_BASE_GAIN : PICKUP_MATERIAL_BASE_GAIN;
  let play = true;
  if (index >= PICKUP_CHAIN_SOFT_CAP) {
    const over = index - PICKUP_CHAIN_SOFT_CAP;
    const stride = over < PICKUP_CHAIN_SOFT_CAP ? 2 : 3;
    play = over % stride === 0;
    const decay = 1 - over * 0.05;
    gain *= decay > PICKUP_CHAIN_MIN_GAIN ? decay : PICKUP_CHAIN_MIN_GAIN;
  }
  return {
    index,
    rung,
    reset,
    play,
    gain,
    rate: baseRate * Math.pow(PICKUP_CHAIN_SEMITONE, rung),
    recipeId: credit ? PICKUP_CREDIT_RECIPE : PICKUP_MATERIAL_RECIPE,
  };
}
