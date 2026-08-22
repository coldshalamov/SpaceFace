// Combat Lab telemetry overlay. Pure reads of owners that already count; never a second tally.
//
// Live hostiles are a fold of state.entityList through scanner.isHostileToPlayer — not spawn-budget
// current(), which is reserved slots (including never-hostile team-2 patrols and unbound reservations).
//
// Deferred (verified: no honest live owner, or a disabled counter whose 0 would be a vacuous zero):
// - Orbit nodes: no runtime type, index, or counter exists.
// - queryCandidates / collisionPairs / vfxEmissions: src/core/perfCounters.js totals gated by
//   perfCountersRequested(); this overlay does not enable them.
// Spatial-hash queries ship as the always-on cumulative SpatialHash.diagnostics.queries total.

import { isHostileToPlayer } from '../../systems/scanner.js';

export const CRUCIBLE_LAB_TELEMETRY_REFRESH_MS = 250;

export const CRUCIBLE_LAB_TELEMETRY_KEYS = Object.freeze([
  'tick',
  'frameTimeMs',
  'renderTimeMs',
  'entityCount',
  'liveHostiles',
  'liveProjectiles',
  'activeFields',
  'contacts',
  'spatialQueries',
  'spawnBudgetCurrent',
  'spawnBudgetMax',
]);

function nullSnapshot() {
  const snapshot = {};
  for (let i = 0; i < CRUCIBLE_LAB_TELEMETRY_KEYS.length; i++) {
    snapshot[CRUCIBLE_LAB_TELEMETRY_KEYS[i]] = null;
  }
  return snapshot;
}

const MISSING = Object.freeze(nullSnapshot());

const ROWS = Object.freeze([
  { key: 'tick', label: 'Tick', sampled: false, format: 'int' },
  { key: 'frameTimeMs', label: 'Frame ms (sampled)', sampled: true, format: 'ms' },
  { key: 'renderTimeMs', label: 'Render ms (sampled)', sampled: true, format: 'ms' },
  { key: 'entityCount', label: 'Entities', sampled: false, format: 'int' },
  { key: 'liveHostiles', label: 'Live hostiles', sampled: false, format: 'int' },
  { key: 'liveProjectiles', label: 'Projectiles', sampled: false, format: 'int' },
  { key: 'activeFields', label: 'Fields', sampled: false, format: 'int' },
  { key: 'contacts', label: 'Contacts', sampled: false, format: 'int' },
  { key: 'spatialQueries', label: 'Spatial-hash queries (cumulative)', sampled: false, format: 'int' },
  { key: 'spawnBudget', label: 'Spawn budget', sampled: false, format: 'budget' },
]);

const UNAVAILABLE_MARK = '—';

function numericOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function positiveMsOrNull(value) {
  const ms = numericOrNull(value);
  return ms !== null && ms > 0 ? ms : null;
}

function hasLiveGame(ctx) {
  if (!ctx || ctx.registry == null) return false;
  const state = ctx.state;
  if (!state || typeof state !== 'object') return false;
  const entities = state.entities;
  if (!entities || typeof entities.get !== 'function') return false;
  return entities.get(state.playerId) != null;
}

function readBudgetMethod(budget, method) {
  if (!budget || typeof budget[method] !== 'function') return null;
  try {
    return numericOrNull(budget[method]());
  } catch {
    return null;
  }
}

function readFrameSample(state) {
  const perf = state && state.perfRuntime;
  if (!perf || typeof perf.readFrameSample !== 'function') return null;
  try {
    return perf.readFrameSample({});
  } catch {
    return null;
  }
}

function readLiveHostiles(state) {
  const list = state.entityList;
  if (!Array.isArray(list)) return null;
  const entities = state.entities;
  const player = entities && typeof entities.get === 'function'
    ? entities.get(state.playerId)
    : null;
  const playerTeam = player ? player.team : undefined;
  let count = 0;
  for (let i = 0; i < list.length; i++) {
    if (isHostileToPlayer(list[i], playerTeam, state)) count += 1;
  }
  return count;
}

/**
 * Pure snapshot of Combat Lab telemetry. Never writes, never emits, never enables counters.
 *
 * No live game (no registry, or playerId not present in state.entities) returns the full key
 * set with every value null — menu-state zeros are not measurements.
 *
 * `perfCountersRequested()` gates Tier-1 session totals (queryCandidates, collisionPairs,
 * vfxEmissions, …). Those are not live Combat Lab occupancy rows, and this reader does not
 * enable them. Vacuous zeros from a disabled counter set are not shown.
 */
export function readCrucibleLabTelemetry(ctx) {
  if (!hasLiveGame(ctx)) return nullSnapshot();

  const snapshot = nullSnapshot();

  try {
    const state = ctx.state;

    // tick: src/core/gameState.js state.tick (incremented by src/core/coreSystem.js)
    snapshot.tick = numericOrNull(state.tick);

    // frameTimeMs: src/core/perfRuntime.js readFrameSample().frameDtMs (sampled last frame interval)
    // renderTimeMs: src/core/perfRuntime.js readFrameSample().renderMs (sampled presentation phase)
    // Zero is the uninitialized default, not a measured frame.
    const sample = readFrameSample(state);
    snapshot.frameTimeMs = positiveMsOrNull(sample && sample.frameDtMs);
    snapshot.renderTimeMs = positiveMsOrNull(sample && sample.renderMs);

    // entityCount: src/core/gameState.js state.entityList.length (the list's own length)
    snapshot.entityCount = Array.isArray(state.entityList)
      ? numericOrNull(state.entityList.length)
      : null;

    // liveHostiles: src/systems/scanner.js isHostileToPlayer over state.entityList
    snapshot.liveHostiles = readLiveHostiles(state);

    // spawnBudgetCurrent / spawnBudgetMax: src/systems/spawnBudget.js current()/max()
    const budget = ctx.helpers && ctx.helpers.spawnBudget;
    snapshot.spawnBudgetCurrent = readBudgetMethod(budget, 'current');
    snapshot.spawnBudgetMax = readBudgetMethod(budget, 'max');

    // liveProjectiles: src/core/coreSystem.js state.entityIndex.projectiles.length
    const projectiles = state.entityIndex && state.entityIndex.projectiles;
    snapshot.liveProjectiles = Array.isArray(projectiles)
      ? numericOrNull(projectiles.length)
      : null;

    // activeFields: src/systems/fields.js activeFieldSnapshot → state.fields.snapshot.length
    const fields = state.fields && state.fields.snapshot;
    snapshot.activeFields = Array.isArray(fields) ? numericOrNull(fields.length) : null;

    // contacts: src/core/physics.js _publishRuntime → state.physicsRuntime.diagnostics.rapierContacts
    const contacts = state.physicsRuntime
      && state.physicsRuntime.diagnostics
      && state.physicsRuntime.diagnostics.rapierContacts;
    snapshot.contacts = numericOrNull(contacts);

    // spatialQueries: src/core/spatialHash.js SpatialHash.diagnostics.queries (cumulative)
    const spatialQueries = state.spatialHash
      && state.spatialHash.diagnostics
      && state.spatialHash.diagnostics.queries;
    snapshot.spatialQueries = numericOrNull(spatialQueries);
  } catch {
    return nullSnapshot();
  }

  return snapshot;
}

function formatInt(value) {
  return value === null ? UNAVAILABLE_MARK : String(value | 0);
}

function formatMs(value) {
  if (value === null || !(value > 0)) return UNAVAILABLE_MARK;
  return value.toFixed(1);
}

function formatBudget(current, max) {
  if (current === null && max === null) return UNAVAILABLE_MARK;
  return `${current === null ? UNAVAILABLE_MARK : String(current | 0)}/${max === null ? UNAVAILABLE_MARK : String(max | 0)}`;
}

function formatRow(row, snapshot) {
  if (row.format === 'budget') {
    return formatBudget(snapshot.spawnBudgetCurrent, snapshot.spawnBudgetMax);
  }
  if (row.format === 'ms') return formatMs(snapshot[row.key]);
  return formatInt(snapshot[row.key]);
}

function applyOverlayStyle(el) {
  el.style.marginTop = '10px';
  el.style.paddingTop = '10px';
  el.style.borderTop = '1px solid var(--panel-edge, #1d3350)';
  el.style.fontSize = 'var(--t-sm, 12px)';
  el.style.fontFamily = 'var(--mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)';
  el.style.color = 'var(--ink, var(--sf-paper, #d3e6ff))';
  el.style.lineHeight = '1.35';
}

function applyRowStyle(rowEl) {
  rowEl.style.display = 'grid';
  rowEl.style.gridTemplateColumns = 'minmax(0, 1fr) 8ch';
  rowEl.style.columnGap = '12px';
  rowEl.style.alignItems = 'baseline';
}

function applyLabelStyle(el) {
  el.style.color = 'var(--ink-dim, var(--sf-calm, #84a0c8))';
  el.style.fontSize = 'var(--t-sm, 12px)';
  el.style.minWidth = '0';
}

function applyValueStyle(el) {
  el.style.fontFamily = 'var(--mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)';
  el.style.fontSize = 'var(--t-sm, 12px)';
  el.style.fontVariantNumeric = 'tabular-nums';
  el.style.textAlign = 'right';
  el.style.whiteSpace = 'nowrap';
  el.style.minWidth = '8ch';
}

function emptyDispose() {
  function dispose() {}
  dispose.resume = function resume() {};
  return dispose;
}

/**
 * Thin DOM overlay. Refreshes every 250 ms — enough to read a live fight without a rAF tax
 * or digit jitter from per-frame layout. Returns a disposer that clears the interval.
 */
export function mountCrucibleLabTelemetry(ctx, hostEl) {
  if (!hostEl || typeof hostEl.appendChild !== 'function') return emptyDispose();
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return emptyDispose();
  }

  const root = document.createElement('div');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Combat Lab telemetry');
  applyOverlayStyle(root);

  const heading = document.createElement('div');
  heading.textContent = 'Telemetry';
  heading.style.fontSize = 'var(--t-sm, 12px)';
  heading.style.color = 'var(--ink-dim, var(--sf-calm, #84a0c8))';
  heading.style.marginBottom = '6px';
  heading.style.letterSpacing = '0.04em';
  root.appendChild(heading);

  const valueEls = [];
  for (const row of ROWS) {
    const rowEl = document.createElement('div');
    applyRowStyle(rowEl);
    const labelEl = document.createElement('span');
    labelEl.textContent = row.label;
    applyLabelStyle(labelEl);
    const valueEl = document.createElement('span');
    applyValueStyle(valueEl);
    valueEl.textContent = UNAVAILABLE_MARK;
    rowEl.appendChild(labelEl);
    rowEl.appendChild(valueEl);
    root.appendChild(rowEl);
    valueEls.push({ row, valueEl });
  }

  hostEl.appendChild(root);

  function paint() {
    let snapshot = MISSING;
    try {
      snapshot = readCrucibleLabTelemetry(ctx);
    } catch {
      snapshot = MISSING;
    }
    for (const { row, valueEl } of valueEls) {
      valueEl.textContent = formatRow(row, snapshot);
    }
  }

  let timer = null;
  function stop() {
    if (timer == null) return;
    clearInterval(timer);
    timer = null;
  }
  function start() {
    if (timer != null) return;
    timer = setInterval(paint, CRUCIBLE_LAB_TELEMETRY_REFRESH_MS);
    paint();
  }

  start();
  function dispose() { stop(); }
  dispose.resume = start;
  return dispose;
}
