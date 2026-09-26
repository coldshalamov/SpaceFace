// Catch-up and clock policy. Extra fixed steps keep the table clock only.
// Calendar owners run at 2 Hz (or on clockWake.calendar). Glass/HUD/voice never
// run on extra catch-up steps. Near owners run on the primary tick, not catch-up.

import {
  CALENDAR_CLOCK_COHORT_STRIDE,
  CALENDAR_CLOCK_COHORTS,
  CALENDAR_CLOCK_PERIOD_TICKS,
  SYSTEM_CLOCK,
  calendarCohortIndex,
  getSystemCapability,
  getSystemClock,
} from '../runtime/authoritativeSystemManifest.js';

export const CATCHUP_SKIP_CAPABILITIES = Object.freeze(['hud', 'voice']);
export { CALENDAR_CLOCK_PERIOD_TICKS, SYSTEM_CLOCK };

export function isCatchupPresentationSkip(state) {
  return !!(state && (state.simCatchupIndex | 0) > 0);
}

/**
 * Calendar ticks are straddled: cohort c runs when tick%period === c*stride ({0,10,20}
 * for 30/3). Boot ticks (<=1) and a clockWake.calendar wake run every cohort.
 * Without a systemName this answers "does ANY calendar cohort run this tick".
 */
export function isCalendarTick(state, systemName) {
  if (state && state.clockWake && state.clockWake.calendar === true) return true;
  const tick = state && Number.isInteger(state.tick) ? state.tick : 0;
  if (tick <= 1) return true;
  const period = CALENDAR_CLOCK_PERIOD_TICKS;
  const mod = ((tick % period) + period) % period;
  if (mod % CALENDAR_CLOCK_COHORT_STRIDE !== 0) return false;
  if (systemName == null) return true;
  return calendarCohortIndex(systemName) === (mod / CALENDAR_CLOCK_COHORT_STRIDE) | 0;
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
  if (clock === SYSTEM_CLOCK.CALENDAR && isProductionClockState(state) && !isCalendarTick(state, systemName)) {
    return true;
  }
  return false;
}

/**
 * Partition an update list once at host init. Production primary ticks iterate `combat`
 * (table + near + glass) so calendar names are not even visited. On a cohort tick the
 * queue is `cohortQueues[c]` — every non-calendar system plus cohort c's calendar owners,
 * in original update order, so the straddle only changes WHEN a calendar owner fires,
 * never its position relative to the rest of the tick. Boot ticks (<=1) and
 * clockWake.calendar keep `all`; catch-up extra steps keep `table`.
 */
export function partitionUpdateSystems(systems) {
  const all = [];
  const table = [];
  const combat = [];
  const calendar = [];
  const cohortQueues = [];
  for (let c = 0; c < CALENDAR_CLOCK_COHORTS; c++) cohortQueues.push([]);
  const list = Array.isArray(systems) ? systems : [];
  for (let i = 0; i < list.length; i++) {
    const system = list[i];
    if (!system || typeof system.update !== 'function') continue;
    all.push(system);
    const clock = getSystemClock(system.name);
    if (clock === SYSTEM_CLOCK.TABLE) table.push(system);
    if (clock === SYSTEM_CLOCK.CALENDAR) {
      calendar.push(system);
      cohortQueues[calendarCohortIndex(system.name)].push(system);
    } else {
      combat.push(system);
      for (let c = 0; c < CALENDAR_CLOCK_COHORTS; c++) cohortQueues[c].push(system);
    }
  }
  return { all, table, combat, calendar, cohortQueues };
}

export function updateQueueForThisStep(partitions, state) {
  if (!partitions) return [];
  if (isCatchupPresentationSkip(state)) return partitions.table;
  if (!isProductionClockState(state)) return partitions.all;
  if (state && state.clockWake && state.clockWake.calendar === true) return partitions.all;
  const tick = state && Number.isInteger(state.tick) ? state.tick : 0;
  if (tick <= 1) return partitions.all;
  const mod = ((tick % CALENDAR_CLOCK_PERIOD_TICKS) + CALENDAR_CLOCK_PERIOD_TICKS)
    % CALENDAR_CLOCK_PERIOD_TICKS;
  if (mod % CALENDAR_CLOCK_COHORT_STRIDE === 0) {
    return partitions.cohortQueues[(mod / CALENDAR_CLOCK_COHORT_STRIDE) | 0] || partitions.combat;
  }
  return partitions.combat;
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
