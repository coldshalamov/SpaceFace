// src/audio/trailerScore.js — PLACEHOLDER for Robin's uncommitted trailer-score module.
// 6a9eec796e ("Polish the small tells a player can hear and see") imports bindTrailerScore in
// audioSystem.js but the module was never committed, so audioSystem.js failed to load. This inert
// stub keeps the import resolvable: it binds nothing and returns a no-op dispose. Replace it whole
// with the real module when it lands.

/** @returns {() => void} dispose */
export function bindTrailerScore(_audio) {
  return () => {};
}
