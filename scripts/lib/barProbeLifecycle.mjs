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

// Called only by the existing initial boot wait's rejection handler. Never evaluate
// the page here: a stalled page cannot supply evidence before cleanup.
export function rethrowBarBootFailure(error, collector, sink = (line) => console.error(line)) {
  try {
    const collected = collector.errorIssues();
    const issues = Array.isArray(collected) ? collected : [];
    const rows = issues.slice(-8).map((issue) => ({
      type: issue?.type === 'pageerror' ? 'pageerror' : issue?.type === 'error' ? 'error' : 'unknown',
      text: bootIssueText(issue?.text),
    }));
    sink('[bar-probe-boot-issues] ' + JSON.stringify({
      stage: 'initial-runtime-ready', count: issues.length, omitted: Math.max(0, issues.length - rows.length),
      issues: rows,
    }));
  } catch (_) { /* collector/output failure cannot replace the original wait rejection */ }
  throw error;
}

function bootIssueText(value) {
  // Console text and request URLs may contain credentials or private payloads.
  // Emit only recognized technical shapes, never arbitrary messages or URLs.
  const text = typeof value === 'string' ? value.slice(0, 512) : '';
  let match = /^(?:ReferenceError: )?([A-Za-z_$][\w$]{0,79}) is not defined$/.exec(text);
  if (match) return match[1] + ' is not defined';
  match = /^(?:TypeError: )?([A-Za-z_$][\w$.]{0,79}) is not a function$/.exec(text);
  if (match) return match[1] + ' is not a function';
  match = /^HTTP ([45]\d{2})\s/.exec(text);
  if (match) return 'HTTP ' + match[1] + ' [URL omitted]';
  match = /^Request failed .*?: (net::ERR_[A-Z_]{1,60})$/.exec(text);
  if (match) return 'Request failed [URL omitted]: ' + match[1];
  if (/^(?:SyntaxError: )?(?:Unexpected token|Unexpected identifier|Invalid or unexpected token)\b/.test(text)) {
    return 'JavaScript syntax error [details omitted]';
  }
  if (/^The requested module .* does not provide an export named /.test(text)) {
    return 'Requested module does not provide a named export [details omitted]';
  }
  return '[message omitted: unrecognized technical shape]';
}
