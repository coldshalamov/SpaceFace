// Global error boundary + the bounded ring of recent runtime errors.
//
// An uncaught exception or an unhandled promise rejection used to die silently in the console:
// the player saw a frozen game and a beta tester had nothing to copy into a report. This module
//  - keeps the last RING_MAX errors (message, short stack head, mode, sim time) for the
//    diagnostics report (src/ui/diagnosticsReport.js), and
//  - tells the player once per TOAST_COOLDOWN_MS that something went wrong, over the event bus
//    main.js hands it. It does NOT read `window.SF`: that handle exists only inside
//    SF_DEBUG_ONLY blocks that the retail bundle strips, so a boundary that used it was silent
//    in exactly the build players run.
//
// Defensive by construction: the boundary guards everything else, so nothing here may throw.
// Pure of main.js (which runs boot() at import time) so the behaviour is unit-testable.

export const RING_MAX = 20;
export const TOAST_COOLDOWN_MS = 10000;
const MESSAGE_MAX = 240;
const STACK_LINES = 3;
const STACK_LINE_MAX = 160;

// Strip the machine-specific part of any path or URL: a stack line from an Electron build or a
// failed fetch carries `file:///C:/Users/<name>/...`, which must never reach a pasted report.
// Each match collapses to its file name, keeping any `:line:col` tail, e.g. `main.js:12:5`.
const PATH_RE = new RegExp([
  // Windows drive path; directory segments may contain spaces ("C:\Users\John Smith\...").
  '[A-Za-z]:[\\\\/](?:[^\\\\/:*?"<>|\\r\\n]+[\\\\/])*[^\\\\/:*?"<>|\\s]*',
  // file:// and http(s):// URLs.
  '(?:file|https?|blob):\\/\\/[^\\s()\'"<>]*',
  // POSIX home directories.
  '\\/(?:Users|home)\\/[^\\s()\'"<>]*',
].join('|'), 'g');

function collapsePath(token) {
  let t = token.replace(/[?#][^\s):]*/, '');
  const tail = /(?::\d+){1,2}$/.exec(t);
  const tailText = tail ? tail[0] : '';
  if (tail) t = t.slice(0, t.length - tailText.length);
  const parts = t.split(/[\\/]+/).filter(Boolean);
  const last = parts.length ? parts[parts.length - 1] : '';
  // Nothing nameable left (a bare drive root): say so rather than leave a hole.
  if (!last || /^[A-Za-z]:$/.test(last)) return '<path>' + tailText;
  return last + tailText;
}

/** Remove user-specific paths from an error string. Safe on any input. */
export function sanitizeErrorText(text, max = MESSAGE_MAX) {
  let s;
  try { s = String(text == null ? '' : text); } catch (_) { s = '(unprintable)'; }
  s = s.replace(PATH_RE, collapsePath);
  s = s.replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function stackHead(stack) {
  if (typeof stack !== 'string' || !stack) return '';
  const lines = stack.split('\n').map((l) => l.trim()).filter(Boolean);
  // V8 stacks lead with "Name: message"; the message is recorded separately, so keep the frames.
  const frames = lines.filter((l) => /^at\s|@/.test(l));
  const head = (frames.length ? frames : lines.slice(1)).slice(0, STACK_LINES);
  return head.map((l) => sanitizeErrorText(l, STACK_LINE_MAX)).join(' | ');
}

function describe(err) {
  try {
    if (err && typeof err === 'object') {
      const message = err.message != null ? err.message : (err.name || err);
      return { message: sanitizeErrorText(message), stack: stackHead(err.stack) };
    }
  } catch (_) { /* fall through to the plain-string description */ }
  return { message: sanitizeErrorText(err == null ? 'unknown error' : err), stack: '' };
}

function defaultNow() {
  return (typeof performance !== 'undefined' && performance && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();
}

/**
 * createErrorBoundary({ now, log }) -> { install, attach, record, recent, reset }
 *  - install(target)  listen for `error` / `unhandledrejection` on a window-like target.
 *  - attach({ bus, getState })  the toast route. Errors before attach are ringed, never toasted.
 *  - record(label, err, { silent })  put one error in the ring (and toast when attached + off
 *    cooldown, unless silent).
 *  - recent()  copy of the ring, oldest first.
 */
export function createErrorBoundary({ now = defaultNow, log } = {}) {
  const ring = [];
  let bus = null;
  let getState = null;
  let lastToastAt = -Infinity;
  let suppressed = 0;
  const installed = new WeakSet();
  const logError = typeof log === 'function'
    ? log
    : (label, err) => { if (typeof console !== 'undefined' && console.error) console.error('[SpaceFace]', label, err); };

  function snapshotState() {
    try {
      const state = typeof getState === 'function' ? getState() : null;
      if (!state) return {};
      const out = {};
      if (typeof state.mode === 'string') out.mode = state.mode;
      if (Number.isFinite(state.simTime)) out.simTime = Math.round(state.simTime * 10) / 10;
      return out;
    } catch (_) { return {}; }
  }

  function toast() {
    if (!bus || typeof bus.emit !== 'function') return;
    const t = now();
    if (t - lastToastAt < TOAST_COOLDOWN_MS) { suppressed += 1; return; }
    const extra = suppressed;
    suppressed = 0;
    lastToastAt = t;
    const text = extra > 0
      ? `Something went wrong again — ${extra + 1} errors were logged. If the game stops responding, reload it.`
      : 'Something went wrong, and the error was logged. If the game stops responding, reload it.';
    try { bus.emit('toast', { text, kind: 'warn', ttl: 6 }); } catch (_) { /* never throw from the boundary */ }
  }

  function record(label, err, opts) {
    // Console always gets the full error (devtools is the source of truth).
    try { logError(label, err); } catch (_) { /* ignore */ }
    let entry;
    try {
      const d = describe(err);
      entry = { at: Math.round(now()), label: String(label), message: d.message, stack: d.stack, ...snapshotState() };
      ring.push(entry);
      while (ring.length > RING_MAX) ring.shift();
    } catch (_) { entry = null; }
    if (!(opts && opts.silent)) { try { toast(); } catch (_) { /* ignore */ } }
    return entry;
  }

  function install(target) {
    if (!target || typeof target.addEventListener !== 'function' || installed.has(target)) return false;
    installed.add(target);
    try {
      target.addEventListener('error', (ev) => {
        // ev.error is the thrown value for uncaught exceptions; ev.message is the fallback.
        record('uncaught error', ev && (ev.error || ev.message));
      });
      target.addEventListener('unhandledrejection', (ev) => {
        // ev.reason is the rejection value (an Error, a string, or anything thrown).
        record('unhandled rejection', ev && (ev.reason != null ? ev.reason : ev));
      });
    } catch (_) { return false; }
    return true;
  }

  return {
    install,
    attach(opts) {
      bus = opts && opts.bus ? opts.bus : null;
      getState = opts && typeof opts.getState === 'function' ? opts.getState : null;
    },
    record,
    recent: () => ring.map((e) => ({ ...e })),
    reset() { ring.length = 0; bus = null; getState = null; lastToastAt = -Infinity; suppressed = 0; },
  };
}

// The shared instance main.js installs and the diagnostics report reads.
const shared = createErrorBoundary();

/** Install the global listeners on the page (idempotent). Safe before the game exists. */
export function installGlobalErrorBoundary(target = (typeof window !== 'undefined' ? window : null)) {
  return shared.install(target);
}
/** Hand the boundary the live bus (and a state reader for mode / sim time). */
export function attachErrorBoundary(opts) { shared.attach(opts); }
/** Put an error in the ring from a caught site (e.g. a boot failure) without a global event. */
export function recordRuntimeError(label, err, opts) { return shared.record(label, err, opts); }
/** The last RING_MAX errors, oldest first. */
export function recentRuntimeErrors() { return shared.recent(); }
