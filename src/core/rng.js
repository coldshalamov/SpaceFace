// Deterministic RNG + hashing + angle wrap. The simulation NEVER calls Math.random();
// all sim randomness derives from these seeded streams (see ARCHITECTURE §0.5).

/** mulberry32 PRNG factory → returns a function producing floats in [0,1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic uint32 hash of the given args (FNV-1a over their joined string). */
export function hash32(...args) {
  let h = 0x811c9dc5;
  const str = args.join('|');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
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
