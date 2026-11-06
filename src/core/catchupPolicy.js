// Catch-up and clock policy. Extra fixed steps keep the table clock plus due calendar owners.
// Calendar owners run at 2 Hz (or on clockWake.calendar). Glass/HUD/voice never
// run on extra catch-up steps. Near owners run on the primary tick, not catch-up. Anything that
// feeds the physics step (a control or impulse consumed once per fixed step) is NOT a near owner:
// aiPorts and planetRuntime are table clocks, or an N-step frame would give them 1/N of their input.
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
  // Calendar membership is fixed at partition time; updateDt is called for every queued
  // system every step, so the non-calendar early-out must not re-derive the clock from
  // the manifest by name on each call.
  const calendarSet = new Set(calendar);
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
    if (!calendarSet.has(system)) return fixedDt;
    const host = currentState && typeof currentState === 'object' ? currentState : null;
    if (!host || !isProductionClockState(host)) return fixedDt;
    const simTime = Number(host.simTime);
    if (!Number.isFinite(simTime)) return fixedDt;
    let record = clockRecords.get(host);
    if (!record) {
      record = { baseline: NaN, stamps: new Map(), seeded: false };
      clockRecords.set(host, record);
    }
    const stamped = record.stamps.get(system);
    const hasStamp = stamped !== undefined;
    const prev = hasStamp ? stamped : record.baseline;
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

/**
 * Per-function stride gate for systems that stay on the 60 Hz table clock but whose scans
 * (entity-list censuses, ring tests, observers) do not need every step. `holder` is the
 * system object; the accumulator lives on it (transient, never saved). Returns the
 * accumulated dt when the gate fires, else 0. The first call for a key always fires, so a
 * single direct update() call (tests, boot) still does its work; later firings are
 * staggered by a stable per-key phase so owners do not land on the same step.
 * `n` is the stride in 60 Hz steps; accumulating dt means integrators that take the
 * returned dt see the same total time.
 */
export function strideDt(holder, key, dt, n = 4, state = null) {
  // Stride only inside the production host (same gate the calendar clock uses). Direct
  // update() drivers — tests, labs, legacy profiles — keep per-call behavior.
  if (!isProductionClockState(state)) return dt > 0 ? dt : 1 / 60;
  let acc = holder.__strideAcc;
  if (!acc) acc = holder.__strideAcc = Object.create(null);
  const period = n / 60 - 1e-6;
  const d = dt > 0 ? dt : 0;
  let r = acc[key];
  if (r === undefined) {
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
    // First call fires; the first interval is shortened by the key's phase to stagger owners.
    acc[key] = { t: 0, need: period - (((h >>> 0) % n) / 60) };
    return d > 0 ? d : 1 / 60;
  }
  r.t += d;
  if (r.t + 1e-9 < r.need) return 0;
  const out = r.t;
  r.t = 0; r.need = period;
  return out;
}
