// src/ui/units.js — the friendly unit print (owner 2026-10-28; plain-units sweep 2026-11-20).
//
// The sim measures in world units; the player reads them as meters. A speed prints "32 m/s",
// a distance "457 m" then "4.0 km" — never the internal "wu"/"WU"/"u" shorthand, which a new
// player cannot read. One home for the idiom so a screen never retypes it — and so a dial that
// wants the bare number can strip the same two letters every surface shares. Pure text: no
// state, no DOM.

/**
 * A speed: "32 m/s". The same unit the Speed Dial prints.
 */
export function formatSpeed(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `${Math.round(v)} m/s`;
}

/**
 * A distance: "457 m" under a thousand, then "4.0 km" (one decimal below 10k, none above it).
 * The shared radar grammar's rule (tacticalMapGrammar.formatRadarDistance), so a map, a dial
 * and a hover tag all quote the same reading for the same world gap.
 */
export function formatDistance(n) {
  if (n == null || (typeof n === 'string' && !n.trim())) return '\u2014';
  const d = Number(n);
  if (!Number.isFinite(d)) return '—';
  const v = Math.abs(d);
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)} km`;
  return `${Math.round(v)} m`;
}

/**
 * An acceleration as the bare reading: "4" ("4.2" under ten, where the tenth still matters).
 * The unit — the same world units per second, squared — is the dial's job, never the player's
 * problem, so this returns no unit text. Signed input keeps its sign: braking prints negative.
 */
export function formatAccel(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return String(Math.abs(v) < 10 ? Math.round(v * 10) / 10 : Math.round(v));
}
