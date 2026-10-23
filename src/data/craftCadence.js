// Row 497 (CRAFT-CADENCE): something happens every minute. The cadence contract:
//   * first hostile contact lands inside CADENCE_FIRST_CONTACT_S of a fresh flight,
//   * contact recurs inside [CADENCE_CONTACT_GAP_MIN_S, CADENCE_CONTACT_GAP_MAX_S],
//   * the hostile cohort spends at most CADENCE_TRAVEL_SHARE_CAP of hour one travelling
//     to the player (a fight that is still inbound is a fight the player cannot see).
// Pure data + pure helpers; the registered owner wiring these into the pacing gate is
// src/systems/encounterDirector.js (`_tickCadence`, `item.cadence` bypass in _pump).

export const CADENCE_FIRST_CONTACT_DEADLINE_S = 120;
export const CADENCE_FIRST_CONTACT_INJECT_S = 55;   // inject early so relocation resolves in time
export const CADENCE_CONTACT_GAP_MIN_S = 180;
export const CADENCE_CONTACT_GAP_MAX_S = 300;
export const CADENCE_TRAVEL_SHARE_CAP = 0.5;
export const CADENCE_HOUR_ONE_S = 3600;
/** General combat backstop: combat/minor, gates:{}, proximity-gated so it relocates to the
 * player rather than fizzling on an unreachable zone. */
export const CADENCE_BACKSTOP_SHAPE_ID = 'patrol_scan';

export function craftCadenceEnsure(dir, now) {
  if (!dir.cadence || typeof dir.cadence !== 'object') {
    dir.cadence = {
      schema: 1,
      bornAt: Number.isFinite(now) ? now : 0,
      firstContactAt: null,
      lastContactAt: null,
      contactCount: 0,
      injected: 0,
      travelS: 0,
      combatS: 0,
    };
  }
  const c = dir.cadence;
  if (!Number.isFinite(c.bornAt)) c.bornAt = Number.isFinite(now) ? now : 0;
  return c;
}

/** Is there live, in-sector combat contact right now? */
export function cadenceLiveCombat(dir, sectorId) {
  const live = dir?.live;
  if (!live || typeof live !== 'object') return false;
  for (const key in live) {
    if (!Object.hasOwn(live, key)) continue;
    const row = live[key];
    if (!row || row.phase === 'done' || row.deck !== 'combat') continue;
    if (row.sectorId && sectorId && row.sectorId !== sectorId) continue;
    return true;
  }
  return false;
}

/** Is a combat item already queued for this sector? */
export function cadencePendingCombat(dir, sectorId, ENCOUNTERS) {
  const pending = Array.isArray(dir?.pending) ? dir.pending : [];
  for (const it of pending) {
    if (!it || !it.shapeId) continue;
    if (it.sectorId && sectorId && it.sectorId !== sectorId) continue;
    const shape = ENCOUNTERS?.[it.shapeId];
    if (shape && shape.deck === 'combat') return true;
  }
  return false;
}

/**
 * Cadence verdict for this tick. Pure:
 *   - 'first_due'    — no first contact yet and the inject deadline arrived
 *   - 'recur_due'    — contact happened before but the 5-minute ceiling is reached
 *   - 'pull_forward' — inside the 3–5 window: pull queued combat toward the floor
 *   - null           — cadence satisfied
 */
export function cadenceVerdict(c, now, hasLiveCombat, hasPendingCombat) {
  if (hasLiveCombat) return null;
  if (!Number.isFinite(c.firstContactAt)) {
    if (!hasPendingCombat && now - c.bornAt >= CADENCE_FIRST_CONTACT_INJECT_S) return 'first_due';
    return null;
  }
  const gap = now - c.lastContactAt;
  if (!hasPendingCombat && gap >= CADENCE_CONTACT_GAP_MAX_S) return 'recur_due';
  if (hasPendingCombat && gap >= CADENCE_CONTACT_GAP_MIN_S) return 'pull_forward';
  return null;
}

/** Hour-one cohort travel share — the fraction of elapsed hour-one the hostile field spent
 * "in transit" (no live combat anywhere near the player). ≤50% is the contract. */
export function cadenceTravelShare(c, now) {
  const elapsed = Math.min(CADENCE_HOUR_ONE_S, Math.max(0, now - c.bornAt));
  if (elapsed <= 0) return 0;
  return Math.min(1, Math.max(0, c.travelS) / elapsed);
}
