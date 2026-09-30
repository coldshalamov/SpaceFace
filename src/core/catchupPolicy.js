// Catch-up and clock policy. Extra fixed steps keep the table clock plus due calendar owners.
// Calendar owners run at 2 Hz (or on clockWake.calendar). Glass/HUD/voice never
// run on extra catch-up steps. Near owners run on the primary tick, not catch-up.
//
// The 60 Hz tick is the atomic deterministic unit: RNG draw order, the
// InputCommandSnapshot publish contract, TTL/corpse/event ordering, pose + dirty
// journal marks consumed same-tick, and calendar cohorts are all keyed per tick.
// Catch-up steps must therefore run as N sequential full steps — never fused
// (measured fused-able overhead: ~0, design/perf/w4-catchup-REPORT.md).

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
  const clock = getSystemClock(systemName);
  if (clock === SYSTEM_CLOCK.CALENDAR && isProductionClockState(state)) {
    return !isCalendarTick(state, systemName);
  }
  return clock !== SYSTEM_CLOCK.TABLE;
}

/**
 * Single skip used by createSimulation and createRegistry.
 * Catch-up extra steps: table plus due production calendar. Primary ticks: calendar 2 Hz; table/near/glass run.
 */
function isProductionClockState(state) {
  return !!(state && state.runtime && state.runtime.profileId === 'production');
}

export function shouldSkipSystemThisStep(systemName, state) {
  const clock = getSystemClock(systemName);
  if (isCatchupPresentationSkip(state)) {
    if (clock === SYSTEM_CLOCK.CALENDAR && isProductionClockState(state)) {
      return !isCalendarTick(state, systemName);
    }
    return clock !== SYSTEM_CLOCK.TABLE;
  }
  if (clock === SYSTEM_CLOCK.CALENDAR && isProductionClockState(state) && !isCalendarTick(state, systemName)) {
    return true;
  }
  return false;
}

/**
 * Partition an update list once at host init. `tickQueues[m]` is the queue for a primary
 * tick with tick%period === m: every non-calendar system plus the calendar owners whose
 * firing mod is m (cohort base + sub-phase), all in original update order — so a moved
 * calendar owner keeps its position relative to the rest of the tick. `tableCalendar`
 * and `catchupTickQueues[m]` are the production catch-up counterparts built the same
 * way; boot ticks (<=1) and clockWake.calendar keep `all`.
 */
export function partitionUpdateSystems(systems, { state = null, bus = null } = {}) {
  const all = [];
  const table = [];
  const combat = [];
  const calendar = [];
  const tableCalendar = [];
  const tickQueues = [];
  const catchupTickQueues = [];
  for (let m = 0; m < CALENDAR_CLOCK_PERIOD_TICKS; m++) {
    tickQueues.push([]);
    catchupTickQueues.push([]);
  }
  const list = Array.isArray(systems) ? systems : [];
  for (let i = 0; i < list.length; i++) {
    const system = list[i];
    if (!system || typeof system.update !== 'function') continue;
    all.push(system);
    const clock = getSystemClock(system.name);
    if (clock === SYSTEM_CLOCK.TABLE) {
      table.push(system);
      tableCalendar.push(system);
      for (let m = 0; m < CALENDAR_CLOCK_PERIOD_TICKS; m++) catchupTickQueues[m].push(system);
    }
    if (clock === SYSTEM_CLOCK.CALENDAR) {
      calendar.push(system);
      tableCalendar.push(system);
      tickQueues[calendarCohortTickMod(system.name)].push(system);
      catchupTickQueues[calendarCohortTickMod(system.name)].push(system);
    } else {
      combat.push(system);
      for (let m = 0; m < CALENDAR_CLOCK_PERIOD_TICKS; m++) tickQueues[m].push(system);
    }
  }
  const freshRecord = (baseline) => ({ baseline, stamps: new Map(), seeded: true });
  let clockRecords = new WeakMap();
  if (state && typeof state === 'object') {
    clockRecords.set(state, freshRecord(Number(state.simTime)));
  }
  function resetClocks() {
    if (state && typeof state === 'object') {
      clockRecords.set(state, freshRecord(Number(state.simTime)));
    } else {
      clockRecords = new WeakMap();
    }
  }
  const clockUnsubscribes = [];
  if (bus && typeof bus.on === 'function' && state && typeof state === 'object') {
    for (const eventName of ['game:new', 'save:restoring', 'save:loaded']) {
      const unsubscribe = bus.on(eventName, resetClocks);
      if (typeof unsubscribe === 'function') clockUnsubscribes.push(unsubscribe);
    }
  }
  function updateDt(system, fixedDt, currentState) {
    const host = currentState && typeof currentState === 'object' ? currentState : null;
    if (!host || !isProductionClockState(host)) return fixedDt;
    if (!system || getSystemClock(system.name) !== SYSTEM_CLOCK.CALENDAR) return fixedDt;
    const simTime = Number(host.simTime);
    if (!Number.isFinite(simTime)) return fixedDt;
    let record = clockRecords.get(host);
    if (!record) {
      record = { baseline: NaN, stamps: new Map(), seeded: false };
      clockRecords.set(host, record);
    }
    const hasStamp = record.stamps.has(system);
    const prev = hasStamp ? record.stamps.get(system) : record.baseline;
    record.stamps.set(system, simTime);
    if (!hasStamp && !record.seeded) return fixedDt;
    if (!Number.isFinite(prev)) return fixedDt;
    const elapsed = simTime - prev;
    return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : fixedDt;
  }
  function dispose() {
    for (const unsubscribe of clockUnsubscribes.splice(0)) {
      try { unsubscribe(); } catch (_) {}
    }
    clockRecords = new WeakMap();
  }
  return {
    all,
    table,
    combat,
    calendar,
    tableCalendar,
    tickQueues: calendar.length ? tickQueues : null,
    catchupTickQueues: calendar.length ? catchupTickQueues : null,
    updateDt,
    dispose,
  };
}

export function updateQueueForThisStep(partitions, state) {
  if (!partitions) return [];
  if (isCatchupPresentationSkip(state)) {
    if (!isProductionClockState(state)) return partitions.table;
    if (state && state.clockWake && state.clockWake.calendar === true) return partitions.tableCalendar;
    const tick = state && Number.isInteger(state.tick) ? state.tick : 0;
    if (tick <= 1) return partitions.tableCalendar;
    const mod = ((tick % CALENDAR_CLOCK_PERIOD_TICKS) + CALENDAR_CLOCK_PERIOD_TICKS) % CALENDAR_CLOCK_PERIOD_TICKS;
    return (partitions.catchupTickQueues && partitions.catchupTickQueues[mod]) || partitions.table;
  }
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
