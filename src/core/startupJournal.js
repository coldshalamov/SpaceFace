// Retail startup observer: no debug bus, scene walk, GPU calls, or gameplay writes.
// Commit each boundary immediately: a killed mobile page cannot run an unload handler.
import { sanitizeErrorText } from './errorBoundary.js';

export const STARTUP_JOURNAL_KEY = 'sf:startup-journal:v1';
const MAX_EVENTS = 16;
const MAX_CHECKPOINT_ROWS = 3;
const MAX_JOURNAL_CHARS = 32768;
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
  let supportCheckpoints = false;
  try { supportCheckpoints = new URLSearchParams(host.location?.search || '').get('launchReport') === '1'; } catch {}
  let previous = null;
  try {
    const raw = storage?.getItem(STARTUP_JOURNAL_KEY);
    if (raw && raw.length < MAX_JOURNAL_CHARS) {
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
      ...(value.loading && { loading: cleanLoadingStaging(value.loading, MAX_CHECKPOINT_ROWS) }),
      events: Array.isArray(value.events) ? value.events.slice(-MAX_EVENTS).map(cleanEvent) : [] };
  };
  previous = cleanPrevious(previous);
  let timer = null, disposed = false, lastSample = '', priorPicture = null, dirty = false;
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
    try {
      const encode = () => JSON.stringify({ schema: 1, previous, current });
      let encoded = encode();
      // Expanded diagnostic facts must still fit the reader's existing size bound. Keep
      // document identity, staging and the most recent event in both documents; trim old rows.
      while (encoded.length >= MAX_JOURNAL_CHARS) {
        const events = previous?.events.length > 1 ? previous.events : current.events.length > 1 ? current.events : null;
        if (!events) break;
        events.shift(); encoded = encode();
      }
      storage?.setItem(STARTUP_JOURNAL_KEY, encoded);
    } catch {}
    dirty = false;
  }
  function record(event, payload = {}) {
    if (disposed) return;
    const row = cleanEvent({ event, at: now(), ...payload });
    const last = current.events.at(-1);
    // Same-stage pulses can change the resource count. Keep the latest fact in memory and
    // persist at the existing 1Hz boundary (or the next distinct event), never on every pulse.
    if (last && event === 'game:loadingProgress' && last.event === event && last.id === row.id) {
      if (last.detail !== row.detail || last.progress !== row.progress || last.ceiling !== row.ceiling) {
        current.events[current.events.length - 1] = row;
        dirty = true;
      }
      return false;
    }
    current.events.push(row);
    if (current.events.length > MAX_EVENTS) current.events.shift();
    persist();
  }
  function stopSampling() {
    if (timer !== null) host.clearInterval?.(timer);
    timer = null;
  }
  function startSampling() {
    if (timer === null) timer = host.setInterval?.(() => sample(true), 1000) ?? null;
  }
  function sample(checkpoint = false) {
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
      // Only the explicit phone-support route pays the existing owner census, once per
      // sample or lifecycle interruption. Ordinary launches retain their no-census contract.
      // A killed document cannot run pagehide, so commit while it is still answering.
      if (checkpoint && supportCheckpoints && (state?.mode === 'loading'
          || (state?.mode === 'flight' && typeof render?.releaseOpeningPresentationHold === 'function'))) {
        const loading = readLoadingStaging(render, MAX_CHECKPOINT_ROWS);
        loading.capturedAt = now();
        if (JSON.stringify(loading) !== JSON.stringify(current.loading)) { current.loading = loading; dirty = true; }
      }
      const encoded = JSON.stringify(value);
      if (lastSample !== encoded || dirty) { lastSample = encoded; current.sample = value; persist(); }
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
        delete current.loading;
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
      if (record(event, payload) !== false) sample();
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
    listen(document, event, payload => {
      const canvas = payload.target;
      const mainCanvas = state?.render?.renderer?.domElement;
      record(event, { error: payload.statusMessage, canvas: canvas?.id,
        mainCanvas: canvas && mainCanvas ? canvas === mainCanvas : undefined,
        width: canvas?.width, height: canvas?.height });
      sample(true);
    }, true);
  }
  listen(document, 'visibilitychange', () => { sample(true); record('visibility', { id: document.visibilityState }); });
  listen(host, 'pagehide', event => { sample(true); record('pagehide', { id: event.persisted ? 'cached' : 'leaving' }); });
  listen(host, 'pageshow', event => record('pageshow', { id: event.persisted ? 'cached' : 'shown' }));
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
  for (const key of ['detail', 'canvas']) {
    const scalar = text(value[key]);
    if (scalar) result[key] = scalar.slice(0, key === 'detail' ? 240 : 80);
  }
  for (const key of ['progress', 'ceiling', 'width', 'height']) {
    if (Number.isFinite(value[key])) result[key] = value[key];
  }
  if (typeof value.mainCanvas === 'boolean') result.mainCanvas = value.mainCanvas;
  return result;
}

function cleanSample(value = {}) {
  const result = {};
  for (const key of ['mode', 'phase', 'phaseOutcome']) result[key] = text(value?.[key]) || null;
  for (const key of ['tick', 'firstPlayableFrameAt', 'geometries', 'textures', 'programs']) result[key] = finite(value?.[key]);
  for (const key of ['contextLost', 'veil']) result[key] = typeof value?.[key] === 'boolean' ? value[key] : null;
  return result;
}

function readLoadingStaging(render, maxRows = 12) {
  const get = (fn) => { try { return typeof fn === 'function' ? fn() : null; } catch { return null; } };
  const readiness = get(render?.authoredVisualReadiness);
  const queue = get(render?.openingAuthoredQueueDiagnostics);
  return cleanLoadingStaging({ ...readiness, queue,
    pendingPipelineAdmissions: get(render?.pendingPipelineAdmissions),
    pendingAuthoredGpuResidency: get(render?.pendingAuthoredGpuResidency),
  }, maxRows);
}

function cleanLoadingStaging(readiness, maxRows) {
  const shortText = value => text(value)?.slice(0, 80) || null;
  const queue = readiness.queue;
  const scalarId = value => Number.isSafeInteger(value) ? value : text(value)?.slice(0, 80) || null;
  const bool = value => typeof value === 'boolean' ? value : null;
  const rows = (value, map) => Array.isArray(value) ? value.slice(0, maxRows).map(map) : null;
  const count = (total, value) => Number.isSafeInteger(total) && total >= 0 ? total : Array.isArray(value) ? value.length : null;
  const blockers = rows(readiness?.flightReadyBlockers, row => ({ kind: shortText(row?.kind),
    role: shortText(row?.role), layer: shortText(row?.layer),
    id: scalarId(row?.metadata?.id ?? row?.id), type: shortText(row?.metadata?.type ?? row?.type) }));
  const pending = rows(readiness?.openingPipelinePending, row => ({ id: scalarId(row?.id),
    type: shortText(row?.type), defId: shortText(row?.defId), status: shortText(row?.status),
    hook: bool(row?.hook), promised: bool(row?.promised) }));
  return {
    capturedAt: finite(readiness.capturedAt),
    playerId: scalarId(readiness?.playerId), playerStatus: shortText(readiness?.playerStatus),
    startingHubId: scalarId(readiness?.startingHubId), startingHubStatus: shortText(readiness?.startingHubStatus),
    pipelineReady: bool(readiness?.pipelineReady), ready: bool(readiness?.ready),
    flightReadyBlockers: blockers, flightReadyBlockerCount: count(readiness?.flightReadyBlockerCount, readiness?.flightReadyBlockers),
    openingPipelinePending: pending, openingPipelinePendingCount: count(readiness?.openingPipelinePendingCount, readiness?.openingPipelinePending),
    queue: queue ? { present: bool(queue.present), pending: finite(queue.pending), inFlight: finite(queue.inFlight),
      running: bool(queue.running), held: bool(queue.held), openingHeld: bool(queue.openingHeld),
      firstFlightHeld: bool(queue.firstFlightHeld), frameScheduled: bool(queue.frameScheduled), compiling: finite(queue.compiling),
      jobs: rows(queue.jobs, row => ({ key: shortText(row?.key), lifecycle: shortText(row?.lifecycle), status: shortText(row?.status) })) } : null,
    pendingPipelineAdmissions: finite(readiness.pendingPipelineAdmissions),
    pendingAuthoredGpuResidency: finite(readiness.pendingAuthoredGpuResidency),
  };
}
