// Site-keyed warn dedup for sim/systems catch tails — the renderer's stormWarn
// contract without the render-internal import. A persistent per-tick fault pays
// WARN_DEDUP_VERBATIM verbatim warns then a >=1 s suppressed-count heartbeat
// instead of ~60 Hz Error+stack serialization on the presented-frame thread.

import { perfNow } from './perfRuntime.js';

const WARN_DEDUP_VERBATIM = 8;
const WARN_DEDUP_CAP = 256;
const WARN_DEDUP_HEARTBEAT_MS = 1000;

const _warnDedupLog = new Map();

function dedup(site, level, args) {
  const now = perfNow();
  let row = _warnDedupLog.get(site);
  if (!row) {
    if (_warnDedupLog.size >= WARN_DEDUP_CAP) {
      // Evict the oldest row instead of clearing: a cap-hit clear() re-arms
      // every storming site's verbatim budget simultaneously.
      const oldest = _warnDedupLog.keys().next();
      if (!oldest.done) _warnDedupLog.delete(oldest.value);
    }
    row = { logged: 0, suppressed: 0, lastWarnAt: -Infinity };
    _warnDedupLog.set(site, row);
  }
  const sink = level === 'error' ? console.error : console.warn;
  if (row.logged < WARN_DEDUP_VERBATIM) {
    row.logged += 1;
    sink.call(console, ...args);
    return;
  }
  row.suppressed += 1;
  if (now - row.lastWarnAt >= WARN_DEDUP_HEARTBEAT_MS) {
    row.lastWarnAt = now;
    sink.call(console, `'${site}' faulted ${row.suppressed} more times; latest:`, ...args);
    row.suppressed = 0;
  }
}

export function dedupWarn(site, ...args) {
  if (typeof console === 'undefined' || !console.warn) return;
  dedup(site, 'warn', args);
}

export function dedupError(site, ...args) {
  if (typeof console === 'undefined' || !console.error) return;
  dedup(site, 'error', args);
}

// Lane-fault rollup — shared home so non-renderer modules (partsLibrary
// teardown twins, systems) stamp the same `state.render.laneFaults` ledger the
// hitches parking logic and audit probes read, without importing renderer.js.
// Per-state memo: the row-quarantine consult calls this once per mesh row per
// presented pass (~36 sites × N rows) — the epoch string is identical across a
// whole epoch, so mint it once per (enter, restoreSeq) pair per state.
const _serviceFaultEpochMemo = new WeakMap();

export function serviceFaultEpoch(state) {
  const st = state || {};
  const enter = st.world && st.world.enterSerial != null ? st.world.enterSerial : null;
  const restore = Number(st.contextRestoreSeq) || 0;
  const memo = typeof st === 'object' && st !== null ? _serviceFaultEpochMemo.get(st) : null;
  if (memo && memo.enter === enter && memo.restore === restore) return memo.value;
  const value = `${enter == null ? 'x' : enter}|${restore}`;
  if (typeof st === 'object' && st !== null) {
    _serviceFaultEpochMemo.set(st, { enter, restore, value });
  }
  return value;
}

export function noteLaneFault(state, lane, parked = false) {
  const render = state && state.render;
  if (!render) return;
  const rollup = render.laneFaults || (render.laneFaults = {});
  const row = rollup[lane] || (rollup[lane] = { faults: 0, parkedEpoch: null, lastAt: 0 });
  row.faults += 1;
  if (parked === true) row.parkedEpoch = serviceFaultEpoch(state);
  row.lastAt = perfNow();
}
