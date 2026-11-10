// FNV-1a 32-bit hash → hex string. Used for save-corruption detection (NOT security).
// Math.imul gives correct 32-bit wraparound; the literal `* 16777619` would lose precision
// above 2^53 (ARCHITECTURE §4.5; matches core/rng.js hash32 mixing).
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
