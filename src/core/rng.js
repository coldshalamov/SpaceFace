// Deterministic RNG + hashing + angle wrap. The simulation NEVER calls Math.random();
// all sim randomness derives from these seeded streams (see ARCHITECTURE §0.5).

/**
 * mulberry32 PRNG factory → returns a function producing floats in [0,1).
 * Continuation state is serializable via `rng.getState()` / `mulberry32FromContinuation`.
 * H9: save/load must restore continuation, not only the initial seed.
 */
export function mulberry32(seed) {
  const seed0 = (seed >>> 0) || 1;
  let a = seed0;
  let draws = 0;
  function next() {
    draws += 1;
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  next.getState = () => ({ seed0, state: a >>> 0, draws: draws | 0 });
  return next;
}

/**
 * Resume a mulberry32 stream from serialized continuation.
 * Prefer internal `state` (post-draw a); else re-seed from seed0 and advance `draws`.
 * @param {{ seed0?: number, state?: number, draws?: number }|null|undefined} cont
 */
export function mulberry32FromContinuation(cont) {
  if (cont && Number.isFinite(cont.state)) {
    const seed0 = (Number.isFinite(cont.seed0) ? cont.seed0 >>> 0 : cont.state >>> 0) || 1;
    let a = cont.state >>> 0;
    let draws = cont.draws | 0;
    function next() {
      draws += 1;
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    next.getState = () => ({ seed0, state: a >>> 0, draws: draws | 0 });
    return next;
  }
  const seed0 = (cont && Number.isFinite(cont.seed0) ? cont.seed0 >>> 0 : 1) || 1;
  const targetDraws = cont && Number.isFinite(cont.draws) ? (cont.draws | 0) : 0;
  const rng = mulberry32(seed0);
  for (let i = 0; i < targetDraws; i++) rng();
  return rng;
}

/** Advance one serializable mulberry32 seed and return { seed, value }. */
export function stepMulberry32(seed) {
  const a = (((seed >>> 0) || 1) + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return {
    seed: a >>> 0,
    value: ((t ^ (t >>> 14)) >>> 0) / 4294967296,
  };
}

/** Draw from an object's serializable uint32 seed field, initializing it if needed. */
export function drawSeeded(obj, key, fallbackSeed) {
  if (!obj || typeof obj !== 'object') throw new TypeError('drawSeeded requires an object owner');
  if (!Number.isFinite(obj[key]) || (obj[key] >>> 0) === 0) {
    obj[key] = ((fallbackSeed >>> 0) || 1);
  }
  const next = stepMulberry32(obj[key]);
  obj[key] = next.seed;
  return next.value;
}

function fnvStep(h, code) {
  h ^= code;
  return Math.imul(h, 0x01000193);
}

function fnvArg(h, arg) {
  // Array#join semantics: null/undefined contribute no characters, everything else String(arg).
  if (arg == null) return h;
  const s = typeof arg === 'string' ? arg : String(arg);
  for (let i = 0; i < s.length; i++) h = fnvStep(h, s.charCodeAt(i));
  return h;
}

/**
 * Deterministic uint32 hash of the given args (FNV-1a over their joined string).
 * Named parameters + arguments.length keep the common path (<= 8 args) allocation-free:
 * no rest array, no joined string. The loop only runs for wider calls.
 */
export function hash32(a, b, c, d, e, f, g, h) {
  let acc = fnvArg(0x811c9dc5, a);
  const n = arguments.length;
  if (n > 1) acc = fnvArg(fnvStep(acc, 0x7c), b);
  if (n > 2) acc = fnvArg(fnvStep(acc, 0x7c), c);
  if (n > 3) acc = fnvArg(fnvStep(acc, 0x7c), d);
  if (n > 4) acc = fnvArg(fnvStep(acc, 0x7c), e);
  if (n > 5) acc = fnvArg(fnvStep(acc, 0x7c), f);
  if (n > 6) acc = fnvArg(fnvStep(acc, 0x7c), g);
  if (n > 7) acc = fnvArg(fnvStep(acc, 0x7c), h);
  for (let i = 8; i < n; i++) acc = fnvArg(fnvStep(acc, 0x7c), arguments[i]);
  return acc >>> 0;
}

/** Wrap an angle (radians) to (-PI, PI]. */
export function wrapAngle(a) {
  a %= Math.PI * 2;
  if (a <= -Math.PI) a += Math.PI * 2;
  else if (a > Math.PI) a -= Math.PI * 2;
  return a;
}

/** Derive an independent seeded stream from a master seed + a label. */
export function makeStream(masterSeed, label) {
  return mulberry32(hash32(masterSeed, label));
}
