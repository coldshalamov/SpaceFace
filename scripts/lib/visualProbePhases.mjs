/**
 * Keep browser-probe lifecycle reporting explicit and bounded.
 *
 * A phase is advanced immediately before the await that can block it. That
 * means a timeout names the operation being awaited, rather than guessing
 * from a later symptom such as a dark canvas.
 */
export const VISUAL_PROBE_PHASES = Object.freeze([
  'server-ready',
  'document-loaded',
  'SF-boot-ready',
  'authored-library-ready',
  'flight-ready',
  'first-playable-frame',
  'scene-isolated',
  'sample-started',
  'sample-complete',
  'cleanup-complete',
]);

export function createVisualProbePhaseTracker({
  now = () => Date.now(),
  onPhase = null,
} = {}) {
  const startedAt = now();
  const entries = [];
  const awaits = [];
  let current = null;

  function start(phase, detail = null) {
    if (!VISUAL_PROBE_PHASES.includes(phase)) {
      throw new RangeError(`unknown visual probe phase: ${phase}`);
    }
    const entry = {
      phase,
      atMs: Math.max(0, now() - startedAt),
      status: 'started',
      ...(detail && typeof detail === 'object' ? { detail: { ...detail } } : {}),
    };
    entries.push(entry);
    current = phase;
    if (typeof onPhase === 'function') onPhase(entry);
    return entry;
  }

  function complete(phase, detail = null) {
    const entry = [...entries].reverse().find((candidate) => (
      candidate.phase === phase && candidate.status === 'started'
    ));
    if (!entry) {
      throw new Error(`visual probe phase was not started: ${phase}`);
    }
    entry.status = 'complete';
    entry.completedAtMs = Math.max(entry.atMs, now() - startedAt);
    if (detail && typeof detail === 'object') entry.completeDetail = { ...detail };
    current = null;
    if (typeof onPhase === 'function') onPhase({ ...entry });
    return entry;
  }

  function mark(phase, detail = null) {
    start(phase, detail);
    return complete(phase);
  }

  function beforeAwait(operation, detail = null) {
    const entry = {
      operation: String(operation || 'unnamed-await'),
      phase: current,
      atMs: Math.max(0, now() - startedAt),
      ...(detail && typeof detail === 'object' ? { detail: { ...detail } } : {}),
    };
    awaits.push(entry);
    if (typeof onPhase === 'function') onPhase({ type: 'await', ...entry });
    return entry;
  }

  function snapshot() {
    return {
      order: [...VISUAL_PROBE_PHASES],
      current,
      completed: entries.filter((entry) => entry.status === 'complete').map((entry) => entry.phase),
      awaits: awaits.map((entry) => ({
        operation: entry.operation,
        phase: entry.phase,
        atMs: entry.atMs,
        ...(entry.detail ? { detail: { ...entry.detail } } : {}),
      })),
      entries: entries.map((entry) => ({
        phase: entry.phase,
        atMs: entry.atMs,
        status: entry.status,
        ...(entry.completedAtMs != null ? { completedAtMs: entry.completedAtMs } : {}),
        ...(entry.detail ? { detail: { ...entry.detail } } : {}),
        ...(entry.completeDetail ? { completeDetail: { ...entry.completeDetail } } : {}),
      })),
    };
  }

  return Object.freeze({ start, complete, mark, beforeAwait, snapshot });
}

export function phaseError(error, tracker, phase = null) {
  const source = error instanceof Error ? error : new Error(String(error));
  const wrapped = new Error(
    `${phase || tracker?.snapshot?.().current || 'unknown'}: ${source.message}`,
    { cause: source },
  );
  wrapped.name = source.name || 'Error';
  wrapped.probePhase = phase || tracker?.snapshot?.().current || 'unknown';
  wrapped.phaseReport = tracker?.snapshot?.() || null;
  const awaits = wrapped.phaseReport && wrapped.phaseReport.awaits;
  wrapped.awaitedOperation = awaits && awaits.length ? awaits[awaits.length - 1].operation : null;
  return wrapped;
}

export async function awaitVisualProbePhase(tracker, phase, operation, detail = null) {
  if (typeof operation !== 'function') throw new TypeError('phase operation must be a function');
  tracker.start(phase, detail);
  tracker.beforeAwait(`phase:${phase}`, detail);
  try {
    const value = await operation();
    tracker.complete(phase);
    return value;
  } catch (error) {
    if (error && error.phaseReport && error.probePhase === phase) throw error;
    throw phaseError(error, tracker, phase);
  }
}

export async function awaitVisualProbeOperation(tracker, operation, fn, detail = null) {
  if (typeof fn !== 'function') throw new TypeError('phase operation must be a function');
  tracker.beforeAwait(operation, detail);
  try {
    return await fn();
  } catch (error) {
    if (error && error.phaseReport && error.probePhase === tracker?.snapshot?.().current) throw error;
    throw phaseError(error, tracker);
  }
}
