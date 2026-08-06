// Throwaway probe payload for capture-gameplay.mjs --eval.
// Enables perfRuntime background-job tracking and enriches getReport() with
// per-slice admission attribution + authored-upgrade diagnostics (entity/asset ids).
// Does not modify any game source files.
(() => {
  const sf = window.SF;
  const state = sf && sf.state;
  const perf = state && state.perfRuntime;
  if (!perf || typeof perf.setBackgroundJobTrackingEnabled !== 'function') {
    return 'NO_PERF_RUNTIME';
  }

  const enabled = perf.setBackgroundJobTrackingEnabled(true);
  // Optional: render-work kinds for pipeline/GPU residency blocking slices.
  if (typeof perf.setRenderWorkEnabled === 'function') perf.setRenderWorkEnabled(true);

  const probe = {
    schema: 'spaceface.admissionProbe.v1',
    enabledAtMs: performance.now(),
    slices: [],
    frames: [],
    maxSliceMs: 0,
    maxFrameAdmissionMs: 0,
  };
  window.__ADMISSION_PROBE__ = probe;

  const identity = () => {
    try {
      return typeof perf.readFrameIdentity === 'function'
        ? perf.readFrameIdentity({})
        : { displayFrameId: null, renderFrameId: null, simTick: null };
    } catch {
      return { displayFrameId: null, renderFrameId: null, simTick: null };
    }
  };

  // Record every synchronous admission slice with frame origin.
  if (typeof perf.recordAdmissionWork === 'function' && !perf.__admissionProbeWrapped) {
    const origRecord = perf.recordAdmissionWork.bind(perf);
    perf.recordAdmissionWork = (ms) => {
      const n = Number(ms);
      if (Number.isFinite(n) && n > 0) {
        const id = identity();
        const entry = {
          ms: n,
          t: performance.now(),
          displayFrameId: id.displayFrameId,
          renderFrameId: id.renderFrameId,
          simTick: id.simTick,
          callbackOpen: perf.__probeCallbackOpen === true,
        };
        probe.slices.push(entry);
        if (probe.slices.length > 512) probe.slices.splice(0, probe.slices.length - 512);
        if (n > probe.maxSliceMs) probe.maxSliceMs = n;
      }
      return origRecord(ms);
    };
    perf.__admissionProbeWrapped = true;
  }

  // Snapshot admissionMs attributed into each display frame at beginFrame.
  if (typeof perf.beginFrame === 'function' && !perf.__admissionProbeBeginWrapped) {
    const origBegin = perf.beginFrame.bind(perf);
    perf.beginFrame = (...args) => {
      perf.__probeCallbackOpen = true;
      const result = origBegin(...args);
      try {
        const report = typeof perf.getReport === 'function' ? perf.getReport() : null;
        const admissionMs = report && report.loop ? Number(report.loop.admissionMs) : NaN;
        if (Number.isFinite(admissionMs) && admissionMs > 0) {
          const id = identity();
          const frame = {
            admissionMs,
            displayFrameId: id.displayFrameId,
            renderFrameId: id.renderFrameId,
            simTick: id.simTick,
            t: performance.now(),
          };
          probe.frames.push(frame);
          if (probe.frames.length > 256) probe.frames.splice(0, probe.frames.length - 256);
          if (admissionMs > probe.maxFrameAdmissionMs) probe.maxFrameAdmissionMs = admissionMs;
        }
      } catch { /* probe only */ }
      return result;
    };
    perf.__admissionProbeBeginWrapped = true;
  }

  if (typeof perf.endFrame === 'function' && !perf.__admissionProbeEndWrapped) {
    const origEnd = perf.endFrame.bind(perf);
    perf.endFrame = (...args) => {
      perf.__probeCallbackOpen = false;
      return origEnd(...args);
    };
    perf.__admissionProbeEndWrapped = true;
  }

  // Clear probe buffers when measurement window resets (capture-gameplay calls reset after warmup).
  if (typeof perf.reset === 'function' && !perf.__admissionProbeResetWrapped) {
    const origReset = perf.reset.bind(perf);
    perf.reset = (...args) => {
      probe.slices.length = 0;
      probe.frames.length = 0;
      probe.maxSliceMs = 0;
      probe.maxFrameAdmissionMs = 0;
      probe.measurementResetAtMs = performance.now();
      return origReset(...args);
    };
    perf.__admissionProbeResetWrapped = true;
  }

  // Fold probe + upgrade diagnostics into the normal perf report so capture-gameplay serializes them.
  if (typeof perf.getReport === 'function' && !perf.__admissionProbeReportWrapped) {
    const origGetReport = perf.getReport.bind(perf);
    perf.getReport = () => {
      const report = origGetReport();
      const scene = state.render && state.render.scene;
      const ud = scene && scene.userData && scene.userData.authoredUpgradeDiagnostics;
      const jobs = ud && Array.isArray(ud.jobs) ? ud.jobs : [];
      report.admissionProbe = {
        schema: probe.schema,
        enabled: true,
        maxSliceMs: probe.maxSliceMs,
        maxFrameAdmissionMs: probe.maxFrameAdmissionMs,
        sliceCount: probe.slices.length,
        frameCount: probe.frames.length,
        // Full buffers for offline analysis.
        slices: probe.slices.slice(),
        frames: probe.frames.slice(),
        upgradeJobs: jobs.slice(-128).map((j) => ({
          sequence: j.sequence,
          key: j.key,
          entityId: j.entityId,
          entityType: j.entityType,
          priority: j.priority,
          status: j.status,
          durationMs: j.durationMs,
          estimatedBytes: j.estimatedBytes,
          cacheStatus: j.cacheStatus,
          assetUrls: Array.isArray(j.assetUrls) ? j.assetUrls.slice(0, 12) : [],
          backgroundJobId: j.backgroundJobId,
          backgroundJobOrigin: j.backgroundJobOrigin || null,
          startedAtMs: j.startedAtMs,
          endedAtMs: j.endedAtMs,
        })),
      };
      return report;
    };
    perf.__admissionProbeReportWrapped = true;
  }

  return `backgroundJobTracking=${enabled}`;
})()
