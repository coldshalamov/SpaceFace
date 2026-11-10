function finiteDelta(last, first, key) {
  const end = Number(last && last[key]);
  const start = Number(first && first[key]);
  return Number.isFinite(end) && Number.isFinite(start) ? end - start : null;
}

/**
 * Classify the two player-visible permanent-freeze families independently:
 * the rAF/simulation loop stops, or simulation continues behind an unchanged WebGL canvas.
 */
export function classifyContinueFreeze(samples, { canvasFrameHashes = [] } = {}) {
  if (!Array.isArray(samples) || samples.length < 6) {
    return { frozen: null, kind: 'inconclusive-too-few-samples' };
  }

  const tail = samples.slice(-10);
  const first = tail[0];
  const last = tail[tail.length - 1];
  const simDelta = finiteDelta(last, first, 'simTime') ?? 0;
  const frameDelta = finiteDelta(last, first, 'executedFrames') ?? 0;
  const renderDelta = finiteDelta(last, first, 'renderUpdates') ?? 0;
  const rendererFrameDelta = finiteDelta(last, first, 'rendererFrame');
  const posDelta = first.pos && last.pos
    ? Math.hypot((Number(last.pos.x) - Number(first.pos.x)) || 0,
      (Number(last.pos.z) - Number(first.pos.z)) || 0)
    : 0;
  const screenshotHashes = Array.isArray(canvasFrameHashes) ? canvasFrameHashes.filter(Boolean) : [];
  const signatures = screenshotHashes.length >= 3
    ? screenshotHashes
    : tail.map((row) => row.canvasSignature).filter(Boolean);
  const canvasObserver = screenshotHashes.length >= 3 ? 'ui-hidden-screenshot' : 'in-page-readback';
  const canvasSampled = screenshotHashes.length >= 3
    || signatures.length >= Math.min(6, tail.length);
  const canvasSignatureCount = new Set(signatures).size;
  const canvasChanged = canvasSampled && canvasSignatureCount > 1;
  const timeScale = Number(last.timeScale);
  const suspended = tail.every((row) => row.suspended === true);
  const hidden = tail.every((row) => row.documentHidden === true);
  const contextLost = last.contextLost === true;
  const facts = {
    simDelta,
    frameDelta,
    renderDelta,
    rendererFrameDelta,
    posDelta,
    canvasSampled,
    canvasChanged,
    canvasSignatureCount,
    canvasObserver,
    timeScale,
    suspended,
    hidden,
    contextLost,
  };

  if (frameDelta <= 1 && simDelta < 0.25) {
    return {
      frozen: true,
      kind: 'loop-dead',
      ...facts,
      lifecycle: last.lifecycle,
      lastLifecycleReason: last.lastLifecycleReason,
    };
  }
  if (simDelta < 0.25 && timeScale === 0) {
    return { frozen: true, kind: 'time-scale-zero', ...facts };
  }
  if (contextLost) {
    return { frozen: true, kind: 'webgl-context-lost', ...facts };
  }
  if (simDelta >= 1 && posDelta < 0.05) {
    return { frozen: true, kind: 'sim-runs-body-stuck', ...facts };
  }
  if (simDelta >= 2 && posDelta >= 2 && frameDelta >= 20) {
    if (rendererFrameDelta !== null && rendererFrameDelta <= 1) {
      return { frozen: true, kind: 'draw-dead', signal: 'renderer-frame-stalled', ...facts };
    }
    if (canvasSampled && !canvasChanged) {
      return { frozen: true, kind: 'draw-dead', signal: 'canvas-unchanged', ...facts };
    }
    if (!canvasSampled) {
      return { frozen: null, kind: 'inconclusive-canvas-unobserved', ...facts };
    }
    return { frozen: false, kind: 'sim-body-and-canvas-moving', ...facts };
  }
  return {
    frozen: simDelta < 0.5 || frameDelta < 5,
    kind: 'unclear',
    ...facts,
  };
}
