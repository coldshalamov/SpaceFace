import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Passive, bounded observer. No frame pump, recurring timer, actor input or game-state write.
export function installStationHandoffTimingObserver() {
  if (window.__SF_HANDOFF_TIMING) return;
  const timing = { supported: false, longTasks: [], error: null };
  window.__SF_HANDOFF_TIMING = timing;
  try {
    if (typeof PerformanceObserver !== 'function'
      || !PerformanceObserver.supportedEntryTypes?.includes('longtask')) return;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        timing.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
        if (timing.longTasks.length > 16) timing.longTasks.shift();
      }
    });
    observer.observe({ type: 'longtask', buffered: true });
    timing.supported = true;
  } catch (error) { timing.error = String(error?.message || error).slice(0, 300); }
}

// Failure-only, observer-only evidence for station arrival and mission-board handoffs.
// Keep this collector self-contained: Playwright serializes it into the page realm.
export function collectStationHandoffSnapshot() {
  const text = (v, cap = 200) => typeof v === 'string' ? v.slice(0, cap) : null;
  const number = (v) => typeof v === 'number' && Number.isFinite(v) ? v : null;
  const bool = (v) => typeof v === 'boolean' ? v : null;
  const id = (v) => typeof v === 'string' ? text(v) : number(v);
  const sf = window.SF;
  const state = sf?.state;
  const ui = sf?.registry?.get?.('ui');
  const player = state?.entities?.get?.(state.playerId);
  const inspect = (el) => {
    if (!el) return { present: false };
    const style = getComputedStyle(el), rect = el.getBoundingClientRect();
    return { present: true, connected: bool(el.isConnected), hidden: bool(el.hidden),
      inert: bool(el.inert), classes: text(el.getAttribute('class'), 500), ariaHidden: text(el.getAttribute('aria-hidden')),
      display: text(style.display), visibility: text(style.visibility), opacity: text(style.opacity),
      rect: { x: number(rect.x), y: number(rect.y), width: number(rect.width), height: number(rect.height) } };
  };
  const roots = [...document.querySelectorAll('[data-screen="station"]')];
  const root = roots[0];
  const board = state?.missions?.boards?.[state?.ui?.dockedStationId];
  const slots = Array.isArray(board?.slots) ? board.slots : [];
  let lane = null;
  let laneDiagnosticError = null;
  try {
    const d = typeof sf?.simLaneDiag === 'function' ? sf.simLaneDiag() : null;
    if (d) {
      lane = { lane: text(d.lane), closed: bool(d.closed), ready: bool(d.laneReady),
        replyCount: number(d.replyCount), postedDirectives: number(d.postedDirectives),
        inFlight: bool(d.inFlight), pendingRpcs: number(d.pendingRpcs), error: text(d.error, 1000),
        domainAppliedKeys: Object.fromEntries(Object.entries(d.domainAppliedKeys || {})
          .filter(([key]) => /^(missions(?:\.|$)|ui\.(docked|dockedStationId)$)/.test(key))
          .slice(0, 64).map(([key, count]) => [key.slice(0, 200), number(count)])) };
    }
  } catch (error) { laneDiagnosticError = text(error?.message, 300); }
  // The existing presentation witness records actual completed frames, phase costs and lifecycle.
  // Its bounded history distinguishes stopped frames from late worker domains without a new timer.
  const timing = window.__SF_HANDOFF_TIMING;
  const stamp = typeof performance !== 'undefined' ? number(performance.now()) : null;
  const numericFields = ['wallMs', 'tick', 'simTime', 'executedFrames', 'renderUpdates',
    'rendererFrame', 'drawCalls', 'frameErrorCount', 'callbackMs', 'simMs', 'renderMs',
    'vfxMs', 'uiMs', 'admissionMs', 'topPhaseP95', 'geometryPending'];
  const witnessRow = (row) => row && typeof row === 'object' ? {
    ...Object.fromEntries(numericFields.map((key) => [key, number(row[key])])),
    lifecycle: text(row.lifecycle), visibilityState: text(row.visibilityState),
    suspended: bool(row.suspended), documentHidden: bool(row.documentHidden),
    contextLost: bool(row.contextLost), rendererFrameObserved: bool(row.rendererFrameObserved),
    lastFrameError: text(row.lastFrameError, 500), topPhase: text(row.topPhase),
  } : null;
  let witness = null, witnessError = null;
  try {
    const recorder = window.__SF_WITNESS__;
    if (recorder) {
      const recent = typeof recorder.recent === 'function' ? recorder.recent() : [];
      witness = { current: witnessRow(recorder.snapshot?.()),
        recent: Array.isArray(recent) ? recent.slice(-8).map(witnessRow) : [] };
    }
  } catch (error) { witnessError = text(error?.message, 300); }
  let presentation = null, frameTiming = null, presentationError = null;
  try {
    const d = sf?.loop?.getDiagnostics?.();
    if (d) presentation = {
      ...Object.fromEntries(['requestedFrames', 'executedFrames', 'renderUpdates',
        'completedTicksConsumed', 'frameCapSkips', 'frameErrorCount', 'consecutiveFrameErrors',
        'presentationStallCount', 'lastPresentMs', 'stepsThisFrame'].map((key) => [key, number(d[key])])),
      lifecycleState: text(d.lifecycleState), requestedLifecycleState: text(d.requestedLifecycleState),
      lastLifecycleReason: text(d.lastLifecycleReason), visibilityState: text(d.visibilityState),
      suspended: bool(d.suspended), destroyed: bool(d.destroyed), presentationStalled: bool(d.presentationStalled),
      lastFrameError: text(d.lastFrameError, 500),
    };
    const f = state?.perfRuntime?.readFrameSample?.({});
    if (f) frameTiming = Object.fromEntries(['frameDtMs', 'callbackMs', 'untrackedMs',
      'callbackIntervalMs', 'externalCallbackGapMs', 'callbackDispatchLagMs', 'simMs', 'simFrameMs',
      'presentationMs', 'renderMs', 'vfxMs', 'feelMs', 'uiMs', 'admissionMs'].map((key) => [key, number(f[key])]));
  } catch (error) { presentationError = text(error?.message, 300); }
  let paints = [];
  try {
    paints = performance.getEntriesByType('paint').slice(-4)
      .map((entry) => ({ name: text(entry.name), startTime: number(entry.startTime), duration: number(entry.duration) }));
  } catch (_) { /* unsupported paint entries are not evidence of no frames */ }
  return {
    timing: { now: stamp, documentHidden: bool(document.hidden), visibilityState: text(document.visibilityState),
      longTaskObserverSupported: bool(timing?.supported), observerError: text(timing?.error, 300),
      longTasks: Array.isArray(timing?.longTasks) ? timing.longTasks.slice(-16).map((entry) => ({
        startTime: number(entry.startTime), duration: number(entry.duration) })) : [],
      // Paint Timing reports initial paint only; witness counters are the live-frame evidence.
      initialPaints: paints, witness, witnessError, presentation, frameTiming, presentationError },
    mode: text(state?.mode), tick: number(state?.tick), simTime: number(state?.simTime),
    requestedLane: text(sf?.ctx?.simLane), lane, laneDiagnosticError,
    player: player ? { id: id(player.id), alive: bool(player.alive), hull: number(player.hull) } : null,
    docked: bool(state?.ui?.docked), dockedStationId: id(state?.ui?.dockedStationId),
    screenStack: Array.isArray(state?.ui?.screenStack) ? state.ui.screenStack.slice(0, 16).map(id) : null,
    topScreen: id(ui?.screenManager?.top?.()), stationRegistered: bool(ui?._registeredScreens?.has?.('station')),
    frameErrors: number(ui?._fe), stationRootCount: roots.length,
    stationRoots: roots.slice(0, 4).map(inspect),
    dock: inspect(root?.querySelector('.sx-dock')), contracts: inspect(root?.querySelector('.sx-ct')),
    operation: text(root?.getAttribute('data-operation')), view: text(root?.getAttribute('data-view')),
    boardPresent: Array.isArray(board?.slots), boardCount: slots.length,
    postedIds: slots.slice(0, 64).map((row) => id(row?.id)),
    renderedRows: [...(root?.querySelectorAll('.sx-ct-row') || [])].slice(0, 64)
      .map((row) => ({ missionId: text(row.getAttribute('data-mid')),
        decisionId: text(row.getAttribute('data-adventure-id')), connected: bool(row.isConnected) })),
    recentLaneEvents: Array.isArray(window.__SF_LANE_APPLIED)
      ? window.__SF_LANE_APPLIED.slice(-16).map((row) => text(typeof row === 'string' ? row : row?.type)) : [],
  };
}

export async function captureStationHandoffScreenshot(page, context) {
  if (typeof page.screenshot !== 'function') return null;
  const boundary = String(context?.boundary || 'handoff').replace(/[^a-z0-9]+/gi, '-').slice(0, 80);
  const file = resolve('scratch/check-ci-report/station-handoff', `${Date.now()}-${boundary}.png`);
  await mkdir(resolve('scratch/check-ci-report/station-handoff'), { recursive: true });
  // Default screenshot semantics preserve animations. Do not freeze/unhide/alter the failed view.
  await page.screenshot({ path: file, type: 'png', timeout: 2000 });
  return file;
}

export async function reportStationHandoffFailure(page, context, issues, originalError) {
  let timer, screenshotTimer;
  const screenshot = Promise.race([
    Promise.resolve().then(() => captureStationHandoffScreenshot(page, context)),
    new Promise((_, reject) => { screenshotTimer = setTimeout(() => reject(new Error('station handoff screenshot exceeded 2000ms')), 2000); }),
  ]).then((path) => { if (path) console.error('[station-handoff] screenshot:', path); })
    .catch((error) => { try { console.error('[station-handoff] screenshot unavailable:', error?.message); } catch (_) {} })
    .finally(() => clearTimeout(screenshotTimer));
  try {
    const snapshot = await Promise.race([
      page.evaluate(collectStationHandoffSnapshot),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('station handoff snapshot exceeded 2000ms')), 2000);
      }),
    ]);
    // Only bounded existing diagnostic fields, never request headers, bodies, storage or saves.
    const recent = (rows) => (Array.isArray(rows) ? rows : []).slice(-8).map((row) => ({
      type: String(row.type || '').slice(0, 40), text: String(row.text || '').slice(0, 1200),
      at: String(row.at || '').slice(0, 80), method: String(row.method || '').slice(0, 16),
    }));
    console.error('[station-handoff] snapshot:', JSON.stringify({ ...context, ...snapshot,
      pageErrors: recent(issues.errorIssues()), pageWarnings: recent(issues.warningIssues()) }));
  } catch (error) {
    try { console.error('[station-handoff] snapshot unavailable:', error?.message); } catch (_) { /* preserve failure */ }
  } finally { clearTimeout(timer); }
  await screenshot;
  throw originalError;
}

// One targeted browser-process trace for the cold market dock. CDP root-session tracing can
// finish without executing JavaScript in the blocked page; it is not another page snapshot.
export async function startStationHandoffTrace(browser) {
  const log = (...args) => { try { console.error(...args); } catch (_) {} };
  const bounded = async (work, label, budgetMs = 2000) => {
    let timer;
    try {
      return await Promise.race([Promise.resolve().then(work), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} exceeded ${budgetMs}ms`)), budgetMs);
      })]);
    } finally { clearTimeout(timer); }
  };
  let session = null, stream = null, stopped = false, started = false, retired = false;
  let traceStage = 'start', traceBytes = 0;
  let resolveComplete;
  const complete = new Promise((resolve) => { resolveComplete = resolve; });
  const onComplete = (event) => { stream = event.stream; resolveComplete(event); };
  const starting = (async () => {
    session = await browser.newBrowserCDPSession();
    session.on('Tracing.tracingComplete', onComplete);
    await session.send('Tracing.start', {
      transferMode: 'ReturnAsStream', streamFormat: 'json', streamCompression: 'gzip',
      traceConfig: {
        recordMode: 'recordContinuously', traceBufferSizeInKb: 8192, enableSampling: true,
        includedCategories: ['devtools.timeline', 'v8.execute', 'toplevel',
          'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.stack',
          'disabled-by-default-v8.cpu_profiler', 'disabled-by-default-devtools.screenshot'],
        excludedCategories: ['*'],
      },
    });
    started = true;
  })();
  try { await bounded(() => starting, 'station handoff trace start'); }
  catch (error) { log('[station-handoff] trace start unavailable:', error?.message); }
  return {
    async stop() {
      if (stopped) return;
      stopped = true;
      try {
        await bounded(async () => {
          await starting;
          if (!started || retired) return;
          traceStage = 'Tracing.end';
          await session.send('Tracing.end');
          traceStage = 'Tracing.tracingComplete';
          await complete;
          if (retired) return;
          const chunks = [];
          let bytes = 0;
          for (;;) {
            traceStage = 'IO.read';
            const part = await session.send('IO.read', { handle: stream, size: 65536 });
            if (retired) return;
            const chunk = Buffer.from(part.data || '', part.base64Encoded ? 'base64' : 'utf8');
            bytes += chunk.length;
            traceBytes = bytes;
            if (bytes > 16 * 1024 * 1024) throw new Error('station handoff trace exceeded 16MiB storage limit');
            chunks.push(chunk);
            if (part.eof) break;
          }
          if (retired) return;
          traceStage = 'artifact write';
          const dir = resolve('scratch/check-ci-report/station-handoff');
          const file = resolve(dir, `${Date.now()}-market-dock.trace.json.gz`);
          await mkdir(dir, { recursive: true });
          if (retired) return;
          await writeFile(file, Buffer.concat(chunks));
          log('[station-handoff] browser trace:', file, `(${bytes} bytes)`);
        // Browser trace finalization is post-actor work, not part of a gameplay wait.
        }, 'station handoff trace stop/read', 15000);
      } catch (error) { log('[station-handoff] browser trace unavailable:', error?.message, `(stage=${traceStage}, bytes=${traceBytes})`); }
      finally {
        retired = true;
        // Cleanup is also bounded. Browser close remains the terminal owner if CDP is unavailable.
        try {
          await bounded(async () => {
            try { if (stream && session) await session.send('IO.close', { handle: stream }); }
            finally {
              if (session) { session.removeListener('Tracing.tracingComplete', onComplete); await session.detach(); }
            }
          }, 'station handoff trace cleanup');
        } catch (error) { log('[station-handoff] trace cleanup unavailable:', error?.message); }
      }
    },
  };
}
