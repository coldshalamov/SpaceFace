// Seven one-shot milestones only. Diagnostics never decide probe readiness or cleanup.
const EVENTS = new Set([
  'fixture-start', 'assertions-complete', 'browser-close-start', 'browser-close-end',
  'server-stop-request', 'server-exit', 'server-close',
]);

export function createBarProbeLifecycle({
  wallNow = Date.now,
  monotonicNow = () => performance.now(),
  sink = (line) => console.log(line),
} = {}) {
  const seen = new Set();
  let origin;
  try { origin = monotonicNow(); } catch (_) { /* diagnostics are best-effort */ }
  return (event, detail = {}) => {
    if (!EVENTS.has(event) || seen.has(event)) return;
    seen.add(event);
    try {
      const epochMs = wallNow();
      const elapsedMs = monotonicNow() - origin;
      sink('[bar-probe-lifecycle] ' + JSON.stringify({
        event,
        epochMs: Number.isFinite(epochMs) ? epochMs : null,
        elapsedMs: Number.isFinite(elapsedMs) ? elapsedMs : null,
        ...(Number.isInteger(detail.pid) && detail.pid > 0 ? { pid: detail.pid } : {}),
        ...(detail.code === null || Number.isInteger(detail.code) ? { code: detail.code } : {}),
        ...(detail.signal === null || typeof detail.signal === 'string' ? { signal: detail.signal } : {}),
        ...(typeof detail.completed === 'boolean' ? { completed: detail.completed } : {}),
      }));
    } catch (_) { /* a clock or output failure must not change the probe result */ }
  };
}
