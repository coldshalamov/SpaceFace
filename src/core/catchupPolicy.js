// Catch-up and clock policy. Extra fixed steps keep the table clock only.
// Calendar owners run at 2 Hz (or on clockWake.calendar). Glass/HUD/voice never
// run on extra catch-up steps. Near owners run on the primary tick, not catch-up.

import {
  CALENDAR_CLOCK_PERIOD_TICKS,
  SYSTEM_CLOCK,
  getSystemCapability,
  getSystemClock,
} from '../runtime/authoritativeSystemManifest.js';

export const CATCHUP_SKIP_CAPABILITIES = Object.freeze(['hud', 'voice']);
export { CALENDAR_CLOCK_PERIOD_TICKS, SYSTEM_CLOCK };

export function isCatchupPresentationSkip(state) {
  return !!(state && (state.simCatchupIndex | 0) > 0);
}

export function isCalendarTick(state) {
  if (state && state.clockWake && state.clockWake.calendar === true) return true;
  const tick = state && Number.isInteger(state.tick) ? state.tick : 0;
  const period = CALENDAR_CLOCK_PERIOD_TICKS;
  if (tick <= 1) return true;
  return ((tick % period) + period) % period === 0;
}

export function shouldSkipSystemOnCatchup(systemName, state) {
  if (!isCatchupPresentationSkip(state)) return false;
  return getSystemClock(systemName) !== SYSTEM_CLOCK.TABLE;
}

/**
 * Single skip used by createSimulation and createRegistry.
 * Catch-up extra steps: table only. Primary ticks: calendar at 2 Hz; table/near/glass run.
 */
function isProductionClockState(state) {
  return !!(state && state.runtime && state.runtime.profileId === 'production');
}

export function shouldSkipSystemThisStep(systemName, state) {
  const clock = getSystemClock(systemName);
  if (isCatchupPresentationSkip(state) && clock !== SYSTEM_CLOCK.TABLE) return true;
  if (clock === SYSTEM_CLOCK.CALENDAR && isProductionClockState(state) && !isCalendarTick(state)) {
    return true;
  }
  return false;
}

/**
 * Partition an update list once at host init. Production primary ticks iterate `combat`
 * (table + near + glass) so calendar names are not even visited. Calendar ticks and
 * non-production profiles keep `all`. Catch-up extra steps keep `table`.
 */
export function partitionUpdateSystems(systems) {
  const all = [];
  const table = [];
  const combat = [];
  const calendar = [];
  const list = Array.isArray(systems) ? systems : [];
  for (let i = 0; i < list.length; i++) {
    const system = list[i];
    if (!system || typeof system.update !== 'function') continue;
    all.push(system);
    const clock = getSystemClock(system.name);
    if (clock === SYSTEM_CLOCK.TABLE) table.push(system);
    if (clock === SYSTEM_CLOCK.CALENDAR) calendar.push(system);
    else combat.push(system);
  }
  return { all, table, combat, calendar };
}

export function updateQueueForThisStep(partitions, state) {
  if (!partitions) return [];
  if (isCatchupPresentationSkip(state)) return partitions.table;
  if (isProductionClockState(state) && !isCalendarTick(state)) return partitions.combat;
  return partitions.all;
}

export function shouldRunSystemThisStep(systemName, state) {
  return !shouldSkipSystemThisStep(systemName, state);
}

/** Kept for callers that still branch on the old HUD/voice capability names. */
export function isLegacyCatchupPresentationCapability(systemName) {
  const cap = getSystemCapability(systemName);
  const kind = cap && cap.capability;
  return kind === 'hud' || kind === 'voice';
}
