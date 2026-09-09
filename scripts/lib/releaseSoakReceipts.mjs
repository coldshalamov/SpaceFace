// Release-soak receipt schema + validators (headless-first).
//
// Receipts are evidence for a fixed-step long session. They must never claim
// browser GPU FPS from headless samples. Memory samples are descriptive only.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const RELEASE_SOAK_RECEIPT_SCHEMA = 'spaceface.releaseSoakReceipt.v1';

export const REQUIRED_PHASES = Object.freeze([
  'new_game',
  'flight',
  'tether_mining_combat',
  'economy',
  'dock_undock',
  'map_jump',
  'save_reload',
  'death_recovery',
  'continued_play',
]);

/** Headless ceilings — not GPU frame budgets. */
export const HEADLESS_BUDGETS = Object.freeze({
  maxUnhandledErrors: 0,
  maxEventTotal: 50_000,
  maxEntitiesOverBaseline: 48,
  maxListenerGrowth: 8,
  maxDeferredGrowth: 64,
  maxHeapGrowthMbDescriptive: 512, // descriptive only; not a GPU/FPS claim
  minimumTicksPerSecond: 120, // catastrophic CPU drift only; real browser/GPU bars remain headed
});

export function sha256Hex(value) {
  const payload = typeof value === 'string' ? value : JSON.stringify(value);
  return createHash('sha256').update(payload).digest('hex');
}

export function emptyHighWater() {
  return {
    entities: 0,
    ships: 0,
    projectiles: 0,
    deferredEvents: 0,
    listeners: 0,
    eventTotal: 0,
    reservations: 0,
  };
}

export function sampleHighWater(state, bus, eventTotal = 0) {
  const list = state.entityList || [];
  let ships = 0;
  let projectiles = 0;
  for (const e of list) {
    if (!e || e.alive === false) continue;
    if (e.type === 'ship' || e.type === 'drone') ships += 1;
    if (e.type === 'projectile') projectiles += 1;
  }
  const listeners = countListeners(bus);
  const deferred = Array.isArray(bus?.deferred) ? bus.deferred.length
    : (typeof bus?.queue === 'function' ? 0 : 0);
  // eventBus keeps deferred private; approximate via _listeners map size + optional hook
  const deferredEvents = Number(bus?._deferredLen) || deferred || 0;
  const budget = state.spawnBudget || {};
  const reservations = budget.reservations instanceof Map
    ? budget.reservations.size
    : (Array.isArray(budget.reservations) ? budget.reservations.length : 0);
  return {
    entities: list.length,
    ships,
    projectiles,
    deferredEvents,
    listeners,
    eventTotal: eventTotal | 0,
    reservations,
  };
}

export function mergeHighWater(a, b) {
  const out = emptyHighWater();
  for (const key of Object.keys(out)) {
    out[key] = Math.max(Number(a?.[key]) || 0, Number(b?.[key]) || 0);
  }
  return out;
}

export function countListeners(bus) {
  const map = bus && bus._listeners;
  if (!(map instanceof Map)) return 0;
  let total = 0;
  for (const set of map.values()) total += set ? set.size : 0;
  return total;
}

export function detectDuplicateListeners(bus) {
  const map = bus && bus._listeners;
  const dups = [];
  if (!(map instanceof Map)) return dups;
  for (const [event, set] of map.entries()) {
    if (!set || set.size < 2) continue;
    // Same function registered twice is impossible with Set; detect same-source name collisions
    // by stringifying handler names when many handlers share one event.
    const names = [...set].map((fn) => fn && (fn.name || 'anonymous'));
    const counts = new Map();
    for (const name of names) counts.set(name, (counts.get(name) || 0) + 1);
    for (const [name, n] of counts) {
      if (n >= 3 && name !== 'anonymous') {
        dups.push({ event, handler: name, count: n });
      }
    }
  }
  return dups;
}

/**
 * Detect transient collections that only grow across samples (no dips).
 * Ignores keys that legitimately ratchet (eventTotal, listeners after init).
 */
export function detectMonotonicGrowth(samples, keys = ['entities', 'ships', 'projectiles', 'deferredEvents']) {
  const findings = [];
  if (!Array.isArray(samples) || samples.length < 4) return findings;
  for (const key of keys) {
    let grew = 0;
    let dipped = 0;
    for (let i = 1; i < samples.length; i++) {
      const prev = Number(samples[i - 1]?.[key]) || 0;
      const cur = Number(samples[i]?.[key]) || 0;
      if (cur > prev) grew += 1;
      if (cur < prev) dipped += 1;
    }
    // Flag only if growth is frequent and never recovers.
    if (grew >= Math.max(3, samples.length - 2) && dipped === 0) {
      const first = Number(samples[0]?.[key]) || 0;
      const last = Number(samples[samples.length - 1]?.[key]) || 0;
      if (last > first + 8) {
        findings.push({ key, first, last, grew, dipped });
      }
    }
  }
  return findings;
}

export function sampleMemoryDescriptive() {
  const mu = typeof process !== 'undefined' && process.memoryUsage ? process.memoryUsage() : null;
  if (!mu) {
    return {
      available: false,
      note: 'process.memoryUsage unavailable',
      heapUsedBytes: null,
      heapTotalBytes: null,
      rssBytes: null,
      externalBytes: null,
    };
  }
  return {
    available: true,
    note: 'headless process memory — not browser GPU/FPS; descriptive only',
    heapUsedBytes: mu.heapUsed | 0,
    heapTotalBytes: mu.heapTotal | 0,
    rssBytes: mu.rss | 0,
    externalBytes: mu.external | 0,
  };
}

export function buildMemoryTrend(samples) {
  if (!Array.isArray(samples) || samples.length === 0) {
    return { samples: 0, heapUsedStart: null, heapUsedEnd: null, heapGrowthBytes: null, trend: 'unavailable' };
  }
  const usable = samples.filter((s) => s && s.available && Number.isFinite(s.heapUsedBytes));
  if (usable.length < 2) {
    return { samples: usable.length, heapUsedStart: usable[0]?.heapUsedBytes ?? null, heapUsedEnd: usable[0]?.heapUsedBytes ?? null, heapGrowthBytes: 0, trend: 'insufficient' };
  }
  const start = usable[0].heapUsedBytes;
  const end = usable[usable.length - 1].heapUsedBytes;
  const growth = end - start;
  let trend = 'flat';
  if (growth > 8 * 1024 * 1024) trend = 'growing';
  else if (growth < -2 * 1024 * 1024) trend = 'shrinking';
  return {
    samples: usable.length,
    heapUsedStart: start,
    heapUsedEnd: end,
    heapGrowthBytes: growth,
    heapGrowthMb: Math.round((growth / (1024 * 1024)) * 100) / 100,
    trend,
    note: 'descriptive headless heap trend; never used as browser GPU FPS evidence',
  };
}

export function validateReceipt(receipt, { mode = 'quick' } = {}) {
  const failures = [];
  if (!receipt || typeof receipt !== 'object') {
    return { pass: false, failures: ['receipt must be an object'] };
  }
  if (receipt.schema !== RELEASE_SOAK_RECEIPT_SCHEMA) {
    failures.push(`schema must be ${RELEASE_SOAK_RECEIPT_SCHEMA}`);
  }
  if (receipt.mode !== mode && receipt.mode !== 'quick' && receipt.mode !== 'full') {
    failures.push('mode must be quick or full');
  }
  if (!Number.isInteger(receipt.seed)) failures.push('seed must be an integer');
  if (!Number.isInteger(receipt.ticks) || receipt.ticks < 1) failures.push('ticks must be a positive integer');
  if (typeof receipt.hash !== 'string' || !/^[a-f0-9]{64}$/i.test(receipt.hash)) {
    failures.push('hash must be a 64-char hex digest');
  }
  if (!Array.isArray(receipt.modeTransitions) || receipt.modeTransitions.length < 2) {
    failures.push('modeTransitions must record at least two transitions');
  }
  if (!receipt.saveReload || typeof receipt.saveReload !== 'object') {
    failures.push('saveReload section required');
  } else {
    if (receipt.saveReload.equivalence !== true && receipt.pass === true) {
      failures.push('passing receipt requires saveReload.equivalence === true');
    }
    if (receipt.saveReload.equivalence === true) {
      if (!receipt.saveReload.beforeHash || !receipt.saveReload.afterHash) {
        failures.push('saveReload equivalence requires beforeHash and afterHash');
      } else if (receipt.saveReload.beforeHash !== receipt.saveReload.afterHash) {
        failures.push('saveReload equivalence claimed but hashes diverge');
      }
    }
  }
  if (!Array.isArray(receipt.phasesCompleted)) {
    failures.push('phasesCompleted must be an array');
  } else {
    for (const phase of REQUIRED_PHASES) {
      if (!receipt.phasesCompleted.includes(phase)) failures.push(`missing phase: ${phase}`);
    }
  }
  if (!receipt.eventCounts || typeof receipt.eventCounts !== 'object') {
    failures.push('eventCounts required');
  } else if ((receipt.eventCounts.total | 0) > HEADLESS_BUDGETS.maxEventTotal) {
    failures.push(`event total ${receipt.eventCounts.total} exceeds ceiling ${HEADLESS_BUDGETS.maxEventTotal}`);
  }
  if (!Array.isArray(receipt.unhandledErrors)) failures.push('unhandledErrors must be an array');
  else if (receipt.unhandledErrors.length > HEADLESS_BUDGETS.maxUnhandledErrors && receipt.pass === true) {
    failures.push('passing receipt cannot carry unhandled errors');
  }
  if (!receipt.highWater || typeof receipt.highWater !== 'object') failures.push('highWater required');
  if (!receipt.stateIntegrity || !Array.isArray(receipt.stateIntegrity.nonFinite)) {
    failures.push('stateIntegrity.nonFinite required');
  } else if (receipt.stateIntegrity.nonFinite.length > 0 && receipt.pass === true) {
    failures.push('passing receipt cannot contain non-finite state');
  }
  if (!receipt.liveness || !receipt.liveness.mission || !receipt.liveness.encounter) {
    failures.push('mission and encounter liveness receipts required');
  } else {
    if (receipt.liveness.mission.deadlocked === true && receipt.pass === true) {
      failures.push('passing receipt cannot contain a mission deadlock');
    }
    if (receipt.liveness.encounter.deadlocked === true && receipt.pass === true) {
      failures.push('passing receipt cannot contain an encounter deadlock');
    }
  }
  if (!receipt.memory || typeof receipt.memory !== 'object') failures.push('memory section required');
  else if (receipt.memory.claimsBrowserGpuFps === true) {
    failures.push('headless receipt must never claim browser GPU FPS');
  }
  if (typeof receipt.pass !== 'boolean') failures.push('pass must be boolean');
  if (receipt.performance && receipt.performance.claimsBrowserGpuFps === true) {
    failures.push('performance section must not claim browser GPU FPS from headless data');
  }
  if (!receipt.performance || !Number.isFinite(receipt.performance.ticksPerSecond)) {
    failures.push('headless performance throughput required');
  } else if (receipt.performance.catastrophicDrift === true && receipt.pass === true) {
    failures.push('passing receipt cannot contain catastrophic headless performance drift');
  }
  if (Array.isArray(receipt.failures) && receipt.pass === true && receipt.failures.length > 0) {
    failures.push('pass=true with non-empty failures');
  }
  return { pass: failures.length === 0, failures: [...new Set(failures)] };
}

/**
 * Static contracts for launcher/asset route parity without launching a browser.
 * Mirrors the spirit of check:launch-policy: shared gameServer, one player route.
 */
export function assertStaticLauncherContracts(root) {
  const failures = [];
  const read = (rel) => {
    try {
      return readFileSync(path.join(root, rel), 'utf8');
    } catch (err) {
      failures.push(`missing file ${rel}: ${err.message}`);
      return '';
    }
  };
  const server = read('server.js');
  const electron = read('electron/main.cjs');
  const gameServer = read('scripts/lib/gameServer.cjs');
  const main = read('src/main.js');

  if (gameServer && !/createGameServer|module\.exports|exports\./.test(gameServer)) {
    failures.push('scripts/lib/gameServer.cjs must export the shared game server');
  }
  if (server && !/gameServer|createGameServer|require\(.*gameServer/.test(server)) {
    failures.push('server.js must delegate to scripts/lib/gameServer.cjs');
  }
  if (electron && !/gameServer|createGameServer|require\(.*gameServer/.test(electron)) {
    failures.push('electron/main.cjs must delegate to scripts/lib/gameServer.cjs');
  }
  if (main && !/createGameState|mode\s*=\s*['"]menu['"]/.test(main)) {
    failures.push('src/main.js must boot menu via createGameState path');
  }
  // Reject duplicated MIME tables inlined into launchers (launch-policy spirit).
  if (server && /MIME\s*=\s*\{[\s\S]*application\/javascript/.test(server) && !/gameServer/.test(server)) {
    failures.push('server.js must not re-inline a MIME table without shared gameServer');
  }
  if (electron && /MIME\s*=\s*\{[\s\S]*application\/javascript/.test(electron) && !/gameServer/.test(electron)) {
    failures.push('electron/main.cjs must not re-inline a MIME table without shared gameServer');
  }
  return { pass: failures.length === 0, failures };
}

export function assertStaticTimeEffectsContracts(root) {
  const failures = [];
  let src = '';
  try {
    src = readFileSync(path.join(root, 'src/core/timeEffects.js'), 'utf8');
  } catch (err) {
    return { pass: false, failures: [`timeEffects missing: ${err.message}`] };
  }
  if (!/export function createTimeEffects/.test(src)) {
    failures.push('createTimeEffects export required');
  }
  if (!/\.clear\s*=|\bclear\(/.test(src)) {
    failures.push('timeEffects must expose clear() to drop stale sources');
  }
  if (!/\.set\s*=|\bset\(/.test(src)) {
    failures.push('timeEffects must expose set() for owned scale requests');
  }
  return { pass: failures.length === 0, failures };
}

export function summarizeEventCounts(eventLog) {
  const byType = Object.create(null);
  for (const entry of eventLog || []) {
    const t = entry && entry.type ? String(entry.type) : 'unknown';
    byType[t] = (byType[t] || 0) + 1;
  }
  return {
    total: (eventLog || []).length,
    byType,
  };
}

export function formatReceiptSummary(receipt) {
  const mem = receipt.memory?.trend || {};
  return [
    `mode=${receipt.mode}`,
    `seed=${receipt.seed}`,
    `ticks=${receipt.ticks}`,
    `hash=${String(receipt.hash || '').slice(0, 12)}…`,
    `phases=${(receipt.phasesCompleted || []).length}`,
    `events=${receipt.eventCounts?.total ?? 0}`,
    `saveEq=${receipt.saveReload?.equivalence === true}`,
    `errors=${(receipt.unhandledErrors || []).length}`,
    `heapTrend=${mem.trend || 'n/a'}`,
    `pass=${receipt.pass}`,
  ].join(' ');
}
