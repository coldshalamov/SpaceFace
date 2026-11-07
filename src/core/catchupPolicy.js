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
  ALL_SIM_MODES,
  CALENDAR_CLOCK_PERIOD_TICKS,
  SYSTEM_CLOCK,
  calendarCohortTickMod,
  getSystemCapability,
  getSystemClock,
  SIM_MODE,
  systemRunsInMode,
} from '../runtime/authoritativeSystemManifest.js';

export const CATCHUP_SKIP_CAPABILITIES = Object.freeze(['hud', 'voice']);
export { CALENDAR_CLOCK_PERIOD_TICKS, SYSTEM_CLOCK, SIM_MODE };

export function isCatchupPresentationSkip(state) {
  return !!(state && (state.simCatchupIndex | 0) > 0);
}

/**
 * Determine the active simulation execution mode from runtime state.
 * Returns SIM_MODE.UNSCOPED for test rigs or uninitialized states, and SIM_MODE.UNKNOWN for an
 * unrecognised explicit label. UNKNOWN has no partition, so it dispatches an empty queue: a typo
 * or an unadmitted mode must fail closed, never run the whole system set.
 */
export function resolveActiveSimMode(state) {
  if (!state || typeof state !== 'object') return SIM_MODE.UNSCOPED;
  if (state.mode == null && state.run == null && state.ui?.docked == null && state.shipbreakingYard?.activeJobId == null && state.activeOccupation == null) {
    return SIM_MODE.UNSCOPED;
  }
  if (state.run && state.run.kind === 'survival' && state.run.phase && state.run.phase !== 'inactive') {
    return SIM_MODE.SWARM;
  }
  if (state.mode === 'swarm') {
    return SIM_MODE.SWARM;
  }
  if (state.ui && state.ui.docked === true) {
    return SIM_MODE.DOCKED;
  }
  if (state.mode === 'docked') {
    return SIM_MODE.DOCKED;
  }
  if (state.mode === 'shipbreakingYard' || state.activeOccupation === 'shipbreakingYard') {
    return SIM_MODE.YARD;
  }
  if (state.mode === 'flight') {
    if (state.shipbreakingYard && state.shipbreakingYard.activeJobId != null) {
      return SIM_MODE.YARD;
    }
    return SIM_MODE.FLIGHT;
  }
  // Menu/pause/loading are known non-scheduling states; the freeze or the host owns them, and
  // they keep the historical unscoped behaviour. Anything else is an unknown label.
  if (state.mode === 'menu' || state.mode === 'paused' || state.mode === 'loading') {
    return SIM_MODE.UNSCOPED;
  }
  return SIM_MODE.UNKNOWN;
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
  const mode = resolveActiveSimMode(state);
  if (mode !== SIM_MODE.UNSCOPED && !systemRunsInMode(systemName, mode)) {
    return true;
  }
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
  const mode = resolveActiveSimMode(state);
  if (mode !== SIM_MODE.UNSCOPED && !systemRunsInMode(systemName, mode)) {
    return true;
  }
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
 *
 * Pre-partitions mode-scoped queues for instant O(1) step dispatch with zero garbage.
 */
export function partitionUpdateSystems(systems, { state = null, bus = null } = {}) {
  const all = [];
  const table = [];
  const combat = [];
  const calendar = [];
  const tableCalendar = [];
  const tickDrains = [];
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
    if (typeof system.drainTick === 'function') tickDrains.push(system);
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

  // Pre-filter partitioned queues per scheduling mode for zero-overhead dispatch during step().
  // DOCKED is a frozen-world label, not a scheduling scope: presentationFreeze skips the full
  // tick while it holds, so it deliberately has no queue here (E3 review F4). YARD is a live
  // working state - the player is towing in the yard - so it gets the flight-equivalent queue.
  const modePartitions = Object.create(null);
  for (const mode of ALL_SIM_MODES) {
    const filterFn = (s) => systemRunsInMode(s.name, mode);
    const mAll = all.filter(filterFn);
    const mTable = table.filter(filterFn);
    const mCombat = combat.filter(filterFn);
    const mCalendar = calendar.filter(filterFn);
    const mTableCalendar = tableCalendar.filter(filterFn);
    const mTickQueues = [];
    const mCatchupTickQueues = [];
    for (let m = 0; m < CALENDAR_CLOCK_PERIOD_TICKS; m++) {
      mTickQueues.push(tickQueues[m].filter(filterFn));
      mCatchupTickQueues.push(catchupTickQueues[m].filter(filterFn));
    }
    modePartitions[mode] = {
      all: mAll,
      table: mTable,
      combat: mCombat,
      calendar: mCalendar,
      tableCalendar: mTableCalendar,
      tickQueues: mTickQueues,
      catchupTickQueues: mCatchupTickQueues,
    };
  }

  const freshRecord = (baseline, mode) => ({
    baseline, stamps: new Map(), reseed: new Set(), seeded: true, mode,
  });
  // Calendar membership is fixed at partition time; updateDt is called for every queued
  // system every step, so the non-calendar early-out must not re-derive the clock from
  // the manifest by name on each call.
  const calendarSet = new Set(calendar);
  let clockRecords = new WeakMap();
  if (state && typeof state === 'object') {
    clockRecords.set(state, freshRecord(Number(state.simTime), resolveActiveSimMode(state)));
  }
  function resetClocks() {
    if (state && typeof state === 'object') {
      clockRecords.set(state, freshRecord(Number(state.simTime), resolveActiveSimMode(state)));
    } else {
      clockRecords = new WeakMap();
    }
  }
  // E3 review F2: a mode change is a clock discontinuity for owners that do not run in the new
  // mode. Do not blanket-clear every stamp: a dual-mode calendar owner (buildIdentity,
  // barkDirector, wingMorale, masslineImpactDamage, save ...) was running in both modes, so its
  // last stamp is one legitimate interval ago. Owners absent from the new mode get their stamp
  // dropped and are marked for a fixed-dt reseed when they return.
  function markReseed(record, previousMode, mode) {
    if (!record.stamps.size) return;
    for (const system of [...record.stamps.keys()]) {
      const ranBefore = systemRunsInMode(system.name, previousMode);
      const runsNow = systemRunsInMode(system.name, mode);
      if (ranBefore && runsNow) continue;
      record.stamps.delete(system);
      record.reseed.add(system);
    }
  }
  function noteStepMode(host, mode) {
    if (!host || typeof host !== 'object') return;
    const simTime = Number(host.simTime);
    const record = clockRecords.get(host);
    if (!record) {
      clockRecords.set(host, {
        baseline: simTime, stamps: new Map(), reseed: new Set(), seeded: true, mode,
      });
      return;
    }
    if (record.mode === mode) return;
    markReseed(record, record.mode, mode);
    record.mode = mode;
    record.baseline = simTime;
    record.seeded = true;
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
      // A record created by a direct caller has no legitimate prior stamp: initialize from now
      // and return the fixed dt for this first call.
      record = {
        baseline: NaN, stamps: new Map(), reseed: new Set(), seeded: false,
        mode: resolveActiveSimMode(host),
      };
      clockRecords.set(host, record);
    }
    const mode = resolveActiveSimMode(host);
    if (record.mode !== mode) {
      markReseed(record, record.mode, mode);
      record.mode = mode;
      record.baseline = simTime;
      record.seeded = true;
    }
    if (record.reseed.has(system)) {
      record.reseed.delete(system);
      record.stamps.set(system, simTime);
      return fixedDt;
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
    tickDrains,
    tickQueues: calendar.length ? tickQueues : null,
    catchupTickQueues: calendar.length ? catchupTickQueues : null,
    modePartitions,
    updateDt,
    noteStepMode,
    /**
     * Advance per-tick drain owners once per fixed step. This is the E2 economy-slice invariant:
     * a resumable pass must not depend on its owner's slower clock (economy is a 2 Hz calendar
     * owner), or the next due tick can clobber work that has not finished. Hosts call this from
     * their ordinary fixed-step path, after core.preStep and before the system queue.
     */
    drainStep(dt, currentState) {
      // A per-tick drain belongs to its owner's declared mode scope. The economy owner is an
      // Adventure/Yard calendar system; without this filter an in-flight pass kept advancing
      // once per tick inside a Swarm run, where the economy queue never runs at all.
      const mode = resolveActiveSimMode(currentState);
      for (const system of tickDrains) {
        if (system && system.name && !systemRunsInMode(system.name, mode)) continue;
        system.drainTick(dt, currentState);
      }
    },
    dispose,
  };
}

/**
 * Pure queue selection for one step. Policy (E3 review F7): an explicit mode resolves only
 * through its pre-built partition; a mode with no partition — the frozen DOCKED label, an
 * UNKNOWN label or an unrecognised string — runs nothing. `shouldSkipSystemThisStep` applies the
 * same policy (its scope lookup rejects those modes too), so the queue and the per-system skip
 * can never disagree.
 */
function selectStepQueue(partitions, state, mode) {
  if (!partitions) return [];
  let target = partitions;
  if (mode !== SIM_MODE.UNSCOPED) {
    const scoped = partitions.modePartitions ? partitions.modePartitions[mode] : null;
    if (!scoped) return [];
    target = scoped;
  }

  if (isCatchupPresentationSkip(state)) {
    if (!isProductionClockState(state)) return target.table;
    if (state && state.clockWake && state.clockWake.calendar === true) return target.tableCalendar;
    const tick = state && Number.isInteger(state.tick) ? state.tick : 0;
    if (tick <= 1) return target.tableCalendar;
    const mod = ((tick % CALENDAR_CLOCK_PERIOD_TICKS) + CALENDAR_CLOCK_PERIOD_TICKS) % CALENDAR_CLOCK_PERIOD_TICKS;
    return (target.catchupTickQueues && target.catchupTickQueues[mod]) || target.table;
  }
  if (!isProductionClockState(state)) return target.all;
  if (state && state.clockWake && state.clockWake.calendar === true) return target.all;
  const tick = state && Number.isInteger(state.tick) ? state.tick : 0;
  if (tick <= 1) return target.all;
  const mod = ((tick % CALENDAR_CLOCK_PERIOD_TICKS) + CALENDAR_CLOCK_PERIOD_TICKS)
    % CALENDAR_CLOCK_PERIOD_TICKS;
  return (target.tickQueues && target.tickQueues[mod]) || target.combat;
}

export function updateQueueForThisStep(partitions, state) {
  const mode = resolveActiveSimMode(state);
  const queue = selectStepQueue(partitions, state, mode);
  if (partitions && typeof partitions.noteStepMode === 'function') {
    partitions.noteStepMode(state, mode);
  }
  return queue;
}

/** Pure derivation for diagnostics — never writes state (E3 review F7). */
export function getStepExecutionStats(partitions, state) {
  const mode = resolveActiveSimMode(state);
  const queue = selectStepQueue(partitions, state, mode);
  const total = partitions && partitions.all ? partitions.all.length : 0;
  return {
    mode,
    activeCount: queue.length,
    totalCount: total,
    skippedCount: total - queue.length,
  };
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
