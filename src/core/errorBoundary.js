// Global error boundary + the bounded ring of recent runtime errors.
//
// An uncaught exception or an unhandled promise rejection used to die silently in the console:
// the player saw a frozen game and a beta tester had nothing to copy into a report. This module
//  - keeps the last RING_MAX errors (message, short stack head, mode, sim time) for the
//    diagnostics report (src/ui/diagnosticsReport.js), and
//  - tells the player once per TOAST_COOLDOWN_MS that something went wrong, through the
//    presentation-only receipt route (src/core/receiptPresenter.js), never the event bus: the
//    notice is raised by the wall clock, and a bus `toast` is heard by simulation listeners too.
//    It does NOT read `window.SF`: that handle exists only inside SF_DEBUG_ONLY blocks that the
//    retail bundle strips, so a boundary that used it was silent in exactly the build players run.
//
// Defensive by construction: the boundary guards everything else, so nothing here may throw.
// Pure of main.js (which runs boot() at import time) so the behaviour is unit-testable.

import { presentReceipt } from './receiptPresenter.js';

export const RING_MAX = 20;
export const TOAST_COOLDOWN_MS = 10000;
const MESSAGE_MAX = 240;
const INPUT_MAX = 20000;
const STACK_LINES = 3;
const STACK_LINE_MAX = 160;

// Strip the machine-specific part of any path or URL: a stack line from an Electron build or a
// failed fetch carries `file:///C:/Users/<name>/...`, which must never reach a pasted report.
// Each match collapses to its file name, keeping any `:line:col` tail, e.g. `main.js:12:5`.
//
// Covered: Windows drive and `\\?\` paths, UNC shares (`\\HOME-SERVER\Users\...`), file and
// http(s)/blob URLs, POSIX home trees (/Users, /home, /root, WSL /mnt/c/Users). An account or
// folder name may hold spaces ("Jane Doe"), and a JSON-escaped path doubles every backslash, so
// separators match as runs. A POSIX or file-URL folder name is up to four space-joined words that
// a slash follows directly, which keeps the sweep off the prose around a path. A home folder with
// nothing after it ("scandir '/Users/Jane Doe'") collapses to `<path>`, never to the account name.
const SEP = String.raw`[\\/]+`;
const DIR_WORD = String.raw`(?:[^\\/\s*?"<>|()']|'(?=[^\\/\s*?"<>|()']))+`; // an apostrophe only inside a name (O'Brien)
const DIR_NAME = `${DIR_WORD}(?: ${DIR_WORD}){0,3}`;
const LAST_WORD = String.raw`[^\\/\s*?"<>|()']*`;
const WIN_DIR = String.raw`(?:[^\\/:*?"<>|\r\n]+[\\/]+)*[^\\/:*?"<>|\s]*`;
const AFTER_BARE_HOME = String.raw`(?!'[^\\/\s*?"<>|()'])(?=['")\]<>,;]|$)`;
const PATH_RE = new RegExp([
  // A home folder that ends the path.
  String.raw`(?:\/mnt\/[A-Za-z])?\/(?:Users|home)\/` + DIR_NAME + AFTER_BARE_HOME,
  String.raw`[A-Za-z]:` + SEP + String.raw`(?:Users|Documents and Settings)` + SEP + DIR_NAME + AFTER_BARE_HOME,
  // Windows drive path, optionally `\\?\`-prefixed; directory segments may contain spaces.
  String.raw`(?:\\{2}\?\\)?[A-Za-z]:` + SEP + WIN_DIR,
  // UNC share: \\server\share\... (a JSON-escaped one has four leading backslashes; the bound keeps
  // a long run of backslashes from costing quadratic time).
  String.raw`\\{2,4}[^\\/\s:*?"<>|]+` + SEP + String.raw`[^\\/\s:*?"<>|]+(?:` + SEP + String.raw`(?:[^\\/:*?"<>|\r\n]+[\\/]+)*[^\\/:*?"<>|\s]*)?`,
  // file:// URLs, which can carry a raw space in a folder name.
  String.raw`file:\/\/[^\/\s()'"<>]*\/+(?:` + DIR_NAME + String.raw`[\\/]+)*` + LAST_WORD,
  // http(s):// and blob: URLs.
  String.raw`(?:https?|blob):\/\/[^\s()'"<>]*`,
  // POSIX home trees.
  String.raw`(?:\/mnt\/[A-Za-z])?\/(?:Users|home|root)\/(?:` + DIR_NAME + String.raw`\/+)*` + LAST_WORD,
].join('|'), 'g');

const BARE_HOME_RE = /^(?:(?:\/mnt\/[A-Za-z])?\/(?:Users|home)\/[^\\/]+|[A-Za-z]:[\\/]+(?:Users|Documents and Settings)[\\/]+[^\\/]+)$/;

function collapsePath(token) {
  let t = token.replace(/[?#][^\s):]*/, '');
  const tail = /(?::\d+){1,2}$/.exec(t);
  const tailText = tail ? tail[0] : '';
  if (tail) t = t.slice(0, t.length - tailText.length);
  const parts = t.split(/[\\/]+/).filter(Boolean);
  const last = parts.length ? parts[parts.length - 1] : '';
  // Nothing nameable left (a bare drive root): say so rather than leave a hole.
  if (!last || /^[A-Za-z]:$/.test(last)) return '<path>' + tailText;
  // A bare share or home folder: its last word is a share or account name, not a file name.
  if (/^\\\\[^?]/.test(token) && parts.length <= 2) return '<path>' + tailText;
  if (BARE_HOME_RE.test(t)) return '<path>' + tailText;
  return last + tailText;
}

/** Remove user-specific paths from an error string. Safe on any input. */
export function sanitizeErrorText(text, max = MESSAGE_MAX) {
  let s;
  try { s = String(text == null ? '' : text); } catch (_) { s = '(unprintable)'; }
  // Only the head is ever kept, and a pasted error can be a megabyte of minified source.
  if (s.length > INPUT_MAX) s = s.slice(0, INPUT_MAX);
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
 *  - attach({ getState, present })  the toast route: `present(spec)` shows a receipt (default: the
 *    shared presentation-only presenter, never the event bus). Errors before attach are ringed,
 *    never toasted.
 *  - record(label, err, { silent })  put one error in the ring (and toast when attached + off
 *    cooldown, unless silent).
 *  - recent()  copy of the ring, oldest first.
 */
export function createErrorBoundary({ now = defaultNow, log } = {}) {
  const ring = [];
  let present = null;
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
    if (typeof present !== 'function') return;
    const t = now();
    if (t - lastToastAt < TOAST_COOLDOWN_MS) { suppressed += 1; return; }
    const extra = suppressed;
    const text = extra > 0
      ? `Something went wrong again — ${extra + 1} errors were logged. If the game stops responding, reload it.`
      : 'Something went wrong, and the error was logged. If the game stops responding, reload it.';
    let shown = false;
    try { shown = present({ text, kind: 'warn', ttl: 6 }) !== false; } catch (_) { /* never throw from the boundary */ }
    // A line nobody could show (the receipt lane is not up yet) spends neither the cooldown nor the count.
    if (shown) { suppressed = 0; lastToastAt = t; }
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
      present = opts && typeof opts.present === 'function' ? opts.present : (opts ? presentReceipt : null);
      getState = opts && typeof opts.getState === 'function' ? opts.getState : null;
    },
    record,
    recent: () => ring.map((e) => ({ ...e })),
    reset() { ring.length = 0; present = null; getState = null; lastToastAt = -Infinity; suppressed = 0; },
  };
}

// The shared instance main.js installs and the diagnostics report reads.
const shared = createErrorBoundary();

/** Install the global listeners on the page (idempotent). Safe before the game exists. */
export function installGlobalErrorBoundary(target = (typeof window !== 'undefined' ? window : null)) {
  return shared.install(target);
}
/** Arm the receipt route (and hand over a state reader for mode / sim time). */
export function attachErrorBoundary(opts) { shared.attach(opts); }
/** Put an error in the ring from a caught site (e.g. a boot failure) without a global event. */
export function recordRuntimeError(label, err, opts) { return shared.record(label, err, opts); }
/** The last RING_MAX errors, oldest first. */
export function recentRuntimeErrors() { return shared.recent(); }
