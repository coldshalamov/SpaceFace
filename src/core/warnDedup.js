// Site-keyed warn dedup for sim/systems catch tails — the renderer's stormWarn
// contract without the render-internal import. A persistent per-tick fault pays
// WARN_DEDUP_VERBATIM verbatim warns then a >=1 s suppressed-count heartbeat
// instead of ~60 Hz Error+stack serialization on the presented-frame thread.

const WARN_DEDUP_VERBATIM = 8;
const WARN_DEDUP_CAP = 256;
const WARN_DEDUP_HEARTBEAT_MS = 1000;

const _warnDedupLog = new Map();

function dedup(site, level, args) {
  const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now() : Date.now();
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
