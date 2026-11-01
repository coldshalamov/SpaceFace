// Retail startup observer: no debug bus, scene walk, GPU calls, or gameplay writes.
// Commit each boundary immediately: a killed mobile page cannot run an unload handler.
import { sanitizeErrorText } from './errorBoundary.js';

export const STARTUP_JOURNAL_KEY = 'sf:startup-journal:v1';
const MAX_EVENTS = 16;
const installed = new WeakMap();
let currentJournal = null;
const text = value => typeof value === 'string' ? sanitizeErrorText(value, 240) : undefined;
const finite = value => Number.isFinite(value) ? value : null;

export function startupJournalSnapshot() {
  try { return currentJournal?.snapshot() || null; } catch { return null; }
}

export function installStartupJournal({ bus, state, host = globalThis, document = host.document,
  storage, now = () => Date.now() } = {}) {
  if (installed.has(bus)) return installed.get(bus);
  if (storage === undefined) { try { storage = host.sessionStorage; } catch { storage = null; } }
  let previous = null;
  try {
    const raw = storage?.getItem(STARTUP_JOURNAL_KEY);
    if (raw && raw.length < 32768) {
      const saved = JSON.parse(raw);
      if (saved.schema === 1) previous = saved.current?.status !== 'boot' ? saved.current : saved.previous;
    }
  } catch { /* unavailable storage must never prevent launch */ }
  const current = { startedAt: now(), timeOrigin: finite(host.performance?.timeOrigin),
    status: 'boot', phase: null, events: [] };
  const cleanPrevious = value => {
    if (!value || typeof value !== 'object') return null;
    return { startedAt: finite(value.startedAt), timeOrigin: finite(value.timeOrigin),
      status: text(value.status), phase: text(value.phase), sample: cleanSample(value.sample),
      events: Array.isArray(value.events) ? value.events.slice(-MAX_EVENTS).map(cleanEvent) : [] };
  };
  previous = cleanPrevious(previous);
  let timer = null, disposed = false, lastSample = '', priorPicture = null;
  const removers = [];
  const snapshot = () => {
    const result = JSON.parse(JSON.stringify({ schema: 1, previous, current }));
    // This census is deliberately on demand, never on the journal's one-second sampler.
    if (state?.mode === 'loading'
        || (state?.mode === 'flight' && typeof state.render?.releaseOpeningPresentationHold === 'function')) {
      result.loading = readLoadingStaging(state.render);
    }
    return result;
  };
  function persist() {
    try { storage?.setItem(STARTUP_JOURNAL_KEY, JSON.stringify({ schema: 1, previous, current })); } catch {}
  }
  function record(event, payload = {}) {
    if (disposed) return;
    const row = cleanEvent({ event, at: now(), ...payload });
    const last = current.events.at(-1);
    // Progress pulses repeat every frame/window; keep their latest value, not an I/O storm.
    if (last && event === 'game:loadingProgress' && last.event === event && last.id === row.id) return;
    current.events.push(row);
    if (current.events.length > MAX_EVENTS) current.events.shift();
    persist();
  }
  function stopSampling() {
    if (timer !== null) host.clearInterval?.(timer);
    timer = null;
  }
  function startSampling() {
    if (timer === null) timer = host.setInterval?.(sample, 1000) ?? null;
  }
  function sample() {
    if (disposed) return;
    try {
      const render = state?.render;
      const phase = render?.openingFirstPicturePhase;
      current.phase = text(phase?.stage) || current.phase;
      const info = render?.renderer?.info;
      const value = cleanSample({ mode: state?.mode, tick: state?.tick,
        phase: phase?.stage, phaseOutcome: phase?.outcome,
        contextLost: render?.contextLost, firstPlayableFrameAt: render?.firstPlayableFrameAt,
        veil: render?.flightVeilHoldsSim, geometries: info?.memory?.geometries,
        textures: info?.memory?.textures, programs: info?.programs?.length });
      const encoded = JSON.stringify(value);
      if (lastSample !== encoded) { lastSample = encoded; current.sample = value; persist(); }
      if (state?.mode === 'flight' && Number.isFinite(render?.firstPlayableFrameAt)
          && render.firstPlayableFrameAt !== priorPicture
          && render?.flightVeilHoldsSim !== true) {
        current.status = 'playing'; record('first-playable-picture'); stopSampling();
      }
    } catch { /* a partial renderer is valid diagnostic input */ }
  }
  const listen = (target, event, fn, capture = false) => {
    if (!target?.addEventListener) return;
    target.addEventListener(event, fn, capture);
    removers.push(() => target.removeEventListener(event, fn, capture));
  };
  for (const event of ['game:new', 'game:load', 'game:loadingProgress', 'mode:changed',
    'game:startFailed', 'game:exitToMenu', 'ui:loadingHidden']) {
    removers.push(bus.on(event, (payload = {}) => {
      if (event === 'game:new' || event === 'game:load') {
        priorPicture = state?.render?.firstPlayableFrameAt;
        current.status = 'launch-requested'; current.phase = null; startSampling();
      } else if (event === 'game:loadingProgress' && !String(payload.id || '').startsWith('boot-')) {
        current.status = 'loading'; current.phase = text(payload.id); startSampling();
      } else if (event === 'mode:changed' && payload.mode === 'menu' && payload.previousMode === 'loading') {
        current.status = 'returned-to-menu'; stopSampling();
      } else if (event === 'game:startFailed') {
        current.status = 'failed'; stopSampling();
      } else if (event === 'game:exitToMenu') {
        current.status = 'exit-requested'; stopSampling();
      }
      record(event, payload);
      sample();
    }));
  }
  listen(document, 'click', event => {
    const control = event.target?.closest?.('[data-action], .sf-ng-launch');
    const action = control?.getAttribute('data-action') || (control?.classList.contains('sf-ng-launch') ? 'launch' : null);
    if (!['newGame', 'continue', 'launch'].includes(action)) return;
    if (action === 'newGame') { current.status = 'new-game-setup'; startSampling(); }
    record('public-control', { id: action });
  }, true);
  for (const event of ['webglcontextlost', 'webglcontextrestored', 'webglcontextcreationerror']) {
    listen(document, event, payload => { record(event, { error: payload.statusMessage }); sample(); }, true);
  }
  listen(document, 'visibilitychange', () => record('visibility', { id: document.visibilityState }));
  listen(host, 'pagehide', event => record('pagehide', { id: event.persisted ? 'cached' : 'leaving' }));
  listen(host, 'error', event => record('error', { error: event.message }));
  listen(host, 'unhandledrejection', event => record('unhandledrejection', { error: event.reason?.message }));
  const journal = Object.freeze({ snapshot, dispose() {
    if (disposed) return;
    disposed = true; stopSampling();
    for (const remove of removers) { try { remove?.(); } catch {} }
    installed.delete(bus);
    if (currentJournal === journal) currentJournal = null;
  } });
  installed.set(bus, journal); currentJournal = journal;
  // Read-only copies, deliberately available in retail. Never expose state or the bus.
  try { host.__SF_STARTUP__ = Object.freeze({ snapshot }); } catch {}
  record('document-start');
  return journal;
}

function cleanEvent(value = {}) {
  const result = { event: text(value.event)?.slice(0, 80), at: finite(value.at) };
  for (const key of ['id', 'code', 'stage', 'mode', 'previousMode', 'source', 'error']) {
    const scalar = text(value[key]);
    if (scalar) result[key] = scalar.slice(0, key === 'error' ? 240 : 80);
  }
  return result;
}

function cleanSample(value = {}) {
  const result = {};
  for (const key of ['mode', 'phase', 'phaseOutcome']) result[key] = text(value?.[key]) || null;
  for (const key of ['tick', 'firstPlayableFrameAt', 'geometries', 'textures', 'programs']) result[key] = finite(value?.[key]);
  for (const key of ['contextLost', 'veil']) result[key] = typeof value?.[key] === 'boolean' ? value[key] : null;
  return result;
}

function readLoadingStaging(render) {
  const get = (fn) => { try { return typeof fn === 'function' ? fn() : null; } catch { return null; } };
  const readiness = get(render?.authoredVisualReadiness);
  const queue = get(render?.openingAuthoredQueueDiagnostics);
  const scalarId = value => Number.isSafeInteger(value) ? value : text(value)?.slice(0, 80) || null;
  const bool = value => typeof value === 'boolean' ? value : null;
  const rows = (value, map) => Array.isArray(value) ? value.slice(0, 12).map(map) : null;
  const blockers = rows(readiness?.flightReadyBlockers, row => ({ kind: text(row?.kind) || null,
    role: text(row?.role) || null, layer: text(row?.layer) || null,
    id: scalarId(row?.metadata?.id ?? row?.id), type: text(row?.metadata?.type) || null }));
  const pending = rows(readiness?.openingPipelinePending, row => ({ id: scalarId(row?.id),
    type: text(row?.type) || null, defId: text(row?.defId) || null, status: text(row?.status) || null,
    hook: bool(row?.hook), promised: bool(row?.promised) }));
  return {
    playerId: scalarId(readiness?.playerId), playerStatus: text(readiness?.playerStatus) || null,
    startingHubId: scalarId(readiness?.startingHubId), startingHubStatus: text(readiness?.startingHubStatus) || null,
    pipelineReady: bool(readiness?.pipelineReady), ready: bool(readiness?.ready),
    flightReadyBlockers: blockers, flightReadyBlockerCount: Array.isArray(readiness?.flightReadyBlockers) ? readiness.flightReadyBlockers.length : null,
    openingPipelinePending: pending, openingPipelinePendingCount: Array.isArray(readiness?.openingPipelinePending) ? readiness.openingPipelinePending.length : null,
    queue: queue ? { present: bool(queue.present), pending: finite(queue.pending), inFlight: finite(queue.inFlight),
      running: bool(queue.running), held: bool(queue.held), openingHeld: bool(queue.openingHeld),
      firstFlightHeld: bool(queue.firstFlightHeld), frameScheduled: bool(queue.frameScheduled), compiling: finite(queue.compiling),
      jobs: rows(queue.jobs, row => ({ key: text(row?.key) || null, lifecycle: text(row?.lifecycle) || null, status: text(row?.status) || null })) } : null,
    pendingPipelineAdmissions: finite(get(render?.pendingPipelineAdmissions)),
    pendingAuthoredGpuResidency: finite(get(render?.pendingAuthoredGpuResidency)),
  };
}
