// Adventure's Pilot Tree record and level curve (progression lead 2026-11-20). Pure: no bus, no
// state writes, no RNG. The writer is runSession (handlers for pilot:xpEarned, pilot:nodeRequested
// and pilot:respecRequested); every effect site reads the record through pilotTree.js's
// activePilotRecord, which resolves state.player.pilot whenever no Swarm run is live.
//
// The curve (06 §2.3): about 10 points by hour 3, 25 by hour 15, 40 by hour 40. XP arrives from the
// world lead's sources (src/world/adventureXp.js — kills, jobs, hauls, mining, sales, discoveries),
// which pay roughly 1,000 XP an hour early on and a little more later. Point n costs
// BASE + STEP × (n − 1) XP, so the cumulative cost of n points is
//   BASE·n + STEP·n(n−1)/2  →  10 points ≈ 3,700 XP · 25 ≈ 20,500 · 40 ≈ 50,800.
// A level is one point: level 1 holds none, level 11 holds ten.

export const ADVENTURE_XP_POINT_BASE = 100;
export const ADVENTURE_XP_POINT_STEP = 60;
/** A single award never moves more than this (a bad caller shows up as a small award, not a jump). */
export const ADVENTURE_XP_AWARD_CAP = 1000;
/** Respec at a station: a flat fee plus a price per point refunded (credits). */
export const ADVENTURE_RESPEC_BASE_CR = 2000;
export const ADVENTURE_RESPEC_PER_POINT_CR = 400;

export const ADVENTURE_PILOT_SCHEMA = 1;

/** A fresh Adventure pilot record (state.player.pilot). */
export function createAdventurePilot() {
  return { schema: ADVENTURE_PILOT_SCHEMA, xp: 0, level: 1, points: {}, nodes: [], banked: 0, respecs: 0 };
}

/** Total XP needed to have reached `level` (level 1 costs nothing). */
export function adventureXpForLevel(level) {
  const n = Number.isInteger(level) && level > 1 ? level - 1 : 0;
  return ADVENTURE_XP_POINT_BASE * n + ADVENTURE_XP_POINT_STEP * (n * (n - 1)) / 2;
}

/** The level a total XP figure has reached. Monotone, starts at 1. */
export function adventureLevelForXp(xp) {
  const total = Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0;
  let level = 1;
  while (level < 500 && adventureXpForLevel(level + 1) <= total) level += 1;
  return level;
}

/** Points held across every branch (evolutions hold none). */
export function adventurePointsSpent(pilot) {
  let total = 0;
  for (const value of Object.values((pilot && pilot.points) || {})) {
    if (Number.isInteger(value) && value > 0) total += value;
  }
  return total;
}

/** What a respec costs this pilot right now (credits). */
export function adventureRespecFee(pilot) {
  return ADVENTURE_RESPEC_BASE_CR + ADVENTURE_RESPEC_PER_POINT_CR * adventurePointsSpent(pilot);
}

/**
 * A saved record made safe to read: unknown or malformed fields fall back to the fresh record,
 * nodes are de-duplicated strings, points are non-negative integers, and the level follows the XP.
 * Used by the save migration and on every write.
 */
export function normalizeAdventurePilot(raw) {
  const fresh = createAdventurePilot();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fresh;
  const xp = Number.isFinite(raw.xp) && raw.xp > 0 ? Math.floor(raw.xp) : 0;
  const points = {};
  if (raw.points && typeof raw.points === 'object' && !Array.isArray(raw.points)) {
    for (const [branch, value] of Object.entries(raw.points)) {
      if (branch && Number.isInteger(value) && value > 0) points[branch] = value;
    }
  }
  const nodes = Array.isArray(raw.nodes)
    ? [...new Set(raw.nodes.filter((id) => typeof id === 'string' && id))] : [];
  const level = adventureLevelForXp(xp);
  const spent = Object.values(points).reduce((s, v) => s + v, 0)
    + nodes.filter((id) => id.startsWith('evolution_')).length;
  const banked = Math.max(0, level - 1 - spent);
  return {
    schema: ADVENTURE_PILOT_SCHEMA,
    xp,
    level,
    points,
    nodes,
    banked,
    respecs: Number.isInteger(raw.respecs) && raw.respecs > 0 ? raw.respecs : 0,
  };
}
