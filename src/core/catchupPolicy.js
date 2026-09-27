// Catch-up and clock policy. Extra fixed steps keep the table clock only.
// Calendar owners run at 2 Hz (or on clockWake.calendar). Glass/HUD/voice never
// run on extra catch-up steps. Near owners run on the primary tick, not catch-up.

import {
  CALENDAR_CLOCK_PERIOD_TICKS,
  SYSTEM_CLOCK,
  calendarCohortTickMod,
  getSystemCapability,
  getSystemClock,
} from '../runtime/authoritativeSystemManifest.js';

export const CATCHUP_SKIP_CAPABILITIES = Object.freeze(['hud', 'voice']);
export { CALENDAR_CLOCK_PERIOD_TICKS, SYSTEM_CLOCK };

export function isCatchupPresentationSkip(state) {
  return !!(state && (state.simCatchupIndex | 0) > 0);
}

/**
 * Calendar ticks are straddled: cohort c's owners are spread across tick%period ∈
 * [c*stride, c*stride+stride-1] ({0..9,10..19,20..29} for 30/3) — anchored owners keep the
 * cohort base tick, the rest carry a sub-phase. Boot ticks (<=1) and a clockWake.calendar
 * wake run every owner. Without a systemName this answers "does ANY calendar owner run
 * this tick" — under the spread that is every tick.
 */
export function isCalendarTick(state, systemName) {
  if (state && state.clockWake && state.clockWake.calendar === true) return true;
  const tick = state && Number.isInteger(state.tick) ? state.tick : 0;
  if (tick <= 1) return true;
  if (systemName == null) return true;
  const mod = ((tick % CALENDAR_CLOCK_PERIOD_TICKS) + CALENDAR_CLOCK_PERIOD_TICKS)
    % CALENDAR_CLOCK_PERIOD_TICKS;
  return calendarCohortTickMod(systemName) === mod;
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
 * Partition an update list once at host init. `tickQueues[m]` is the queue for a primary
 * tick with tick%period === m: every non-calendar system plus the calendar owners whose
 * firing mod is m (cohort base + sub-phase), all in original update order — so a moved
 * calendar owner keeps its position relative to the rest of the tick. Boot ticks (<=1)
 * and clockWake.calendar keep `all`; catch-up extra steps keep `table`.
 */
export function partitionUpdateSystems(systems) {
  const all = [];
  const table = [];
  const combat = [];
  const calendar = [];
  const tickQueues = [];
  for (let m = 0; m < CALENDAR_CLOCK_PERIOD_TICKS; m++) tickQueues.push([]);
  const list = Array.isArray(systems) ? systems : [];
  for (let i = 0; i < list.length; i++) {
    const system = list[i];
    if (!system || typeof system.update !== 'function') continue;
    all.push(system);
    const clock = getSystemClock(system.name);
    if (clock === SYSTEM_CLOCK.TABLE) table.push(system);
    if (clock === SYSTEM_CLOCK.CALENDAR) {
      calendar.push(system);
      tickQueues[calendarCohortTickMod(system.name)].push(system);
    } else {
      combat.push(system);
      for (let m = 0; m < CALENDAR_CLOCK_PERIOD_TICKS; m++) tickQueues[m].push(system);
    }
  }
  return { all, table, combat, calendar, tickQueues: calendar.length ? tickQueues : null };
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
  return (partitions.tickQueues && partitions.tickQueues[mod]) || partitions.combat;
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
