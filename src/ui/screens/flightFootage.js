import { createFootageVideoCodec, decodeFootageFrameToBlob } from './footageVideoCodec.js';

// Actual presented pixels, independent of simulation and its native renderer objects.
// The ring lives only in this UI module; no Blob, stream, video or bitmap enters GameState.
export const FLIGHT_FOOTAGE_LIMITS = Object.freeze({ seconds: 30, fps: 10, width: 640, height: 360, maxBytes: 32 * 1024 * 1024 });

export function createFootageRing(limits = FLIGHT_FOOTAGE_LIMITS) {
  const frames = [];
  let bytes = 0;
  const frameBytes = (frame) => {
    if (Number.isFinite(frame?.byteSize)) return Math.max(0, frame.byteSize);
    if (frame?.blob && Number.isFinite(frame.blob.size)) return Math.max(0, frame.blob.size);
    if (frame?.encoded && Number.isFinite(frame.encoded.byteLength)) return Math.max(0, frame.encoded.byteLength);
    if (frame?.encoded?.data && Number.isFinite(frame.encoded.data.byteLength)) return Math.max(0, frame.encoded.data.byteLength);
    return 0;
  };
  return {
    frames,
    push(frame) {
      const size = frameBytes(frame);
      if ((!frame?.blob && !frame?.encoded) || !Number.isFinite(frame.tick) || size <= 0 || size > limits.maxBytes) return false;
      if (frames.length && frame.tick <= frames.at(-1).tick) return false;
      const stored = Number.isFinite(frame.byteSize) ? frame : { ...frame, byteSize: size };
      frames.push(stored); bytes += size;
      while (frames.length && (bytes > limits.maxBytes || frames.length > limits.seconds * limits.fps
        || frame.tick - frames[0].tick > limits.seconds * 60)) bytes -= frameBytes(frames.shift());
      return true;
    },
    window(start, end) { return frames.filter((frame) => frame.tick >= start && frame.tick <= end); },
    clear() { frames.length = 0; bytes = 0; },
    get bytes() { return bytes; },
  };
}

let active = null;
export function getFlightFootage() { return active; }

/**
 * Worker body, shipped to a Blob-URL worker through Function.toString (the boot ring's pattern), so it
 * references nothing outside itself. It scales a presented frame onto an OffscreenCanvas and encodes the
 * JPEG there. The sync GPU-to-CPU readback that canvas.toBlob does on the main thread waits for the whole
 * queued render on an integrated GPU (~11 ms a capture inside Crucible, 11% of the main thread); in a
 * worker the same wait stalls only the worker.
 */
export function footageEncoderRuntime() {
  let canvas = null, context = null;
  self.onmessage = async ({ data }) => {
    const { id, bitmap, width, height, sourceKind, willReadFrequently = false } = data;
    const readbackOptimized = willReadFrequently === true;
    let resized = null;
    let sourceClosed = false;
    const closeSource = () => {
      if (sourceClosed) return;
      sourceClosed = true;
      try { bitmap.close?.(); } catch { /* already closed */ }
    };
    try {
      if (!canvas) {
        canvas = new OffscreenCanvas(width, height);
        try {
          context = readbackOptimized
            ? canvas.getContext('2d', { willReadFrequently: true })
            : canvas.getContext('2d');
        } catch (error) {
          // Older OffscreenCanvas implementations may reject the context-options dictionary. Keep the
          // opt-in reversible: the worker still has a concrete 2D fallback, and a missing context is
          // reported through the existing worker-retirement path below.
          if (!readbackOptimized) throw error;
          context = canvas.getContext('2d');
        }
        if (!context && readbackOptimized) context = canvas.getContext('2d');
        if (!context) throw new Error('footage worker 2d context unavailable');
      }
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      let drawable = bitmap;
      // The track-source experiment transfers a VideoFrame directly to this worker. Resize it here,
      // beside the JPEG encode, so the main thread does not first turn the full-size stream frame into
      // an ImageBitmap through a detached <video>. The normal ImageBitmap contract stays byte-for-byte
      // compatible with the established path.
      if (sourceKind === 'video-frame') {
        if (typeof createImageBitmap !== 'function') throw new Error('worker createImageBitmap unavailable');
        resized = await createImageBitmap(bitmap, {
          resizeWidth: width,
          resizeHeight: height,
          resizeQuality: 'medium',
        });
        closeSource();
        drawable = resized;
      }
      context.drawImage(drawable, 0, 0, width, height);
      if (resized) {
        try { resized.close?.(); } catch { /* already closed */ }
        resized = null;
      } else closeSource();
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.88 });
      self.postMessage({ id, blob });
    } catch (error) {
      if (resized) { try { resized.close?.(); } catch { /* already closed */ } }
      closeSource();
      self.postMessage({ id, failed: String(error) });
    }
  };
}

/** The off-main-thread JPEG encoder, or null where Worker/OffscreenCanvas/createImageBitmap are missing. */
export function createFootageEncoder(scope = globalThis, { timeoutMs = 5000, willReadFrequently = false } = {}) {
  if (typeof scope.Worker !== 'function' || typeof scope.OffscreenCanvas !== 'function'
    || typeof scope.createImageBitmap !== 'function' || typeof scope.Blob !== 'function'
    || typeof scope.URL?.createObjectURL !== 'function') return null;
  let worker = null, url = null, nextId = 0, broken = false;
  const readbackOptimized = willReadFrequently === true;
  const waiting = new Map();
  const failAll = (reason) => {
    broken = true;
    for (const entry of waiting.values()) entry.reject(new Error(reason));
    waiting.clear();
  };
  // One idempotent retirement for every fatal path (worker error, message error, a failed transfer, dispose): pending
  // requests reject, the thread ends and the Blob URL is released, so a dead worker never stays owned (OffscreenCanvas,
  // thread) while the main-thread fallback records.
  const retire = (reason) => {
    failAll(reason);
    if (worker) { try { worker.terminate(); } catch { /* already gone */ } worker = null; }
    if (url) { try { scope.URL.revokeObjectURL?.(url); } catch { /* nothing to revoke */ } url = null; }
  };
  try {
    url = scope.URL.createObjectURL(new scope.Blob([`(${footageEncoderRuntime.toString()})();`], { type: 'text/javascript' }));
    worker = new scope.Worker(url, { name: 'spaceface-footage' });
  } catch {
    if (url) { try { scope.URL.revokeObjectURL?.(url); } catch { /* nothing to revoke */ } }
    return null;
  }
  worker.onerror = (event) => { event?.preventDefault?.(); retire(event?.message || 'footage worker error'); };
  worker.onmessageerror = () => retire('footage worker message error');
  worker.onmessage = ({ data }) => {
    const entry = waiting.get(data?.id);
    if (!entry) return;
    waiting.delete(data.id);
    if (data.failed || !data.blob) entry.reject(new Error(data.failed || 'footage worker returned no frame'));
    else entry.resolve(data.blob);
  };
  return {
    get usable() { return !broken; },
    /** Transfers an ImageBitmap or VideoFrame; resolves with the JPEG blob. */
    encode(bitmap, width, height, sourceKind = 'bitmap') {
      if (broken || !worker) { bitmap.close?.(); return Promise.reject(new Error('footage worker retired')); }
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        // A worker that neither replies nor errors must not hold the recorder's one in-flight slot forever:
        // the request fails after the timeout and counts toward the caller's three-strikes retirement.
        const timer = setTimeout(() => {
          if (waiting.delete(id)) reject(new Error('footage worker timed out'));
        }, timeoutMs);
        waiting.set(id, {
          resolve: (blob) => { clearTimeout(timer); resolve(blob); },
          reject: (error) => { clearTimeout(timer); reject(error); },
        });
        const message = { id, bitmap, width, height, willReadFrequently: readbackOptimized };
        if (sourceKind !== 'bitmap') message.sourceKind = sourceKind;
        try { worker.postMessage(message, [bitmap]); }
        catch (error) {
          // The transfer never happened, so the bitmap is still ours to release.
          waiting.delete(id); clearTimeout(timer);
          try { bitmap.close?.(); } catch { /* already closed */ }
          retire(String(error)); reject(error);
        }
      });
    },
    dispose() { retire('footage encoder disposed'); },
  };
}

export function installFlightFootage(bus, {
  stateOf,
  startDelayMs = 5000,
  // Capture the pixels that the renderer just submitted by default. `video` remains the established
  // detached-stream fallback, and `video-frame` is an explicit A/B arm using MediaStreamTrackProcessor.
  // The presented hook avoids a second compositor stream and starts the bounded worker readback from
  // the successful draw boundary while preserving the old source when the capability is absent.
  captureSource = 'presented',
  // The production recorder uses the measured software-readback context by default. An explicit false
  // keeps the GPU-backed Canvas2D arm available for controlled A/B runs without changing dimensions,
  // JPEG quality, cadence, or source type.
  willReadFrequently = true,
  // The normal recorder has one readback worker. An explicit value of 2 creates two independent
  // worker/canvas contexts so the capture candidate can overlap at most two bounded readbacks.
  readbackConcurrency = 1,
  // WebCodecs is an explicit experiment arm. JPEG remains the default and the fallback when the
  // host or encoder cannot provide a usable codec.
  captureBackend = 'jpeg',
} = {}) {
  active?.dispose();
  if (typeof document === 'undefined' || typeof stateOf !== 'function') { active = null; return null; }
  const ring = createFootageRing();
  const poses = [];
  let marks = [], lastPoseTick = -1, video = null, stream = null, callback = null;
  let canvas = null, source = null, timer = null, stopped = false, encoding = false, epoch = 0;
  let trackReader = null, trackLoopId = 0, activeCaptureSource = null;
  const requestedCaptureSource = captureSource === 'presented'
    ? 'presented'
    : captureSource === 'video-frame' ? 'video-frame' : 'video';
  const maxReadbackConcurrency = readbackConcurrency === 2 ? 2 : 1;
  const requestedCaptureBackend = captureBackend === 'webcodecs' ? 'webcodecs' : 'jpeg';
  const subscriptions = [];
  const clock = () => globalThis.performance?.now?.() ?? Date.now();
  const openingDelay = Number.isFinite(startDelayMs) ? Math.max(0, startDelayMs) : 5000;
  let openingSince = null, context = null, encoderSlots = [], encoderTried = false;
  let videoCodec = null, webCodecState = 'unknown', activeCaptureBackend = 'jpeg';
  let webCodecFailure = null;
  let presentedHook = null, presentedHookState = null;
  const makeCaptureSession = () => ({
    token: epoch,
    active: true,
    nextSequence: 0,
    nextCommitSequence: 0,
    inFlight: 0,
    maxInFlight: 0,
    lastSubmittedTick: ring.frames.at(-1)?.tick ?? -1,
    droppedBusy: 0,
    committed: 0,
    ready: new Map(),
  });
  let captureSession = makeCaptureSession();
  const disposeEncoderSlots = () => {
    for (const slot of encoderSlots) {
      try { slot.encoder?.dispose?.(); } catch { /* best-effort worker cleanup */ }
      slot.encoder = null;
      slot.busy = false;
    }
    encoderSlots = [];
  };
  const createEncoderSlot = () => {
    const encoder = createFootageEncoder(globalThis, { willReadFrequently });
    if (!encoder) return null;
    const slot = { encoder, busy: false, failures: 0 };
    encoderSlots.push(slot);
    return slot;
  };
  const acquireEncoderSlot = () => {
    const idle = encoderSlots.find((slot) => slot.encoder?.usable && !slot.busy);
    if (idle) return idle;
    if (encoderSlots.length < maxReadbackConcurrency) return createEncoderSlot();
    return null;
  };
  const retireEncoderSlot = (slot) => {
    if (!slot) return;
    try { slot.encoder?.dispose?.(); } catch { /* best-effort worker cleanup */ }
    slot.encoder = null;
    slot.busy = false;
    encoderSlots = encoderSlots.filter((entry) => entry !== slot);
  };
  const disposeVideoCodec = (markUnavailable = false) => {
    try { videoCodec?.dispose?.(); } catch { /* best-effort worker cleanup */ }
    videoCodec = null;
    activeCaptureBackend = 'jpeg';
    if (markUnavailable) webCodecState = 'unavailable';
  };
  const detachPresentedHook = () => {
    const render = presentedHookState?.render;
    if (render?.flightFootagePresentHook === presentedHook) render.flightFootagePresentHook = null;
    presentedHook = null;
    presentedHookState = null;
  };
  const stopStream = () => {
    epoch += 1;
    captureSession.active = false;
    captureSession.ready.clear();
    captureSession = makeCaptureSession();
    detachPresentedHook();
    disposeEncoderSlots();
    disposeVideoCodec();
    encoderTried = false;
    trackLoopId += 1;
    const reader = trackReader;
    trackReader = null;
    if (reader) {
      try {
        const cancelled = reader.cancel?.();
        cancelled?.catch?.(() => {});
      } catch { /* best-effort cancellation */ }
    }
    if (video && callback != null) video.cancelVideoFrameCallback?.(callback);
    callback = null;
    for (const track of stream?.getTracks() || []) track.stop();
    stream = null;
    if (video) { video.pause(); video.srcObject = null; video.removeAttribute('src'); video.load(); }
    video = null; source = null; canvas = null; context = null; encoding = false; activeCaptureSource = null;
  };
  const clear = () => {
    stopStream();
    ring.clear();
    captureSession.lastSubmittedTick = -1;
    poses.length = 0; marks = []; lastPoseTick = -1; openingSince = null;
  };
  const recordMetadata = (state) => {
    const sample = state?.replay?.latestPoseSample;
    if (!sample || sample.tick === lastPoseTick) return;
    lastPoseTick = sample.tick;
    poses.push({ tick: sample.tick, poses: sample.poses.map((pose) => ({ ...pose })), boost: sample.boost });
    while (poses.length > 300 || (poses.length && sample.tick - poses[0].tick > 1800)) poses.shift();
    marks = (sample.events || []).map((event) => ({ ...event }));
  };
  const eligible = (state) => state?.mode === 'flight' && !state.paused && !document.hidden;
  const outputSize = (frame = null) => {
    const frameWidth = Number(frame?.displayWidth || frame?.codedWidth || frame?.width);
    const frameHeight = Number(frame?.displayHeight || frame?.codedHeight || frame?.height);
    const sourceWidth = Number.isFinite(frameWidth) && frameWidth > 0 ? frameWidth : (source?.width || 640);
    const sourceHeight = Number.isFinite(frameHeight) && frameHeight > 0 ? frameHeight : (source?.height || 360);
    const scale = Math.min(1, FLIGHT_FOOTAGE_LIMITS.width / sourceWidth, FLIGHT_FOOTAGE_LIMITS.height / sourceHeight);
    return {
      width: Math.max(1, Math.round(sourceWidth * scale)),
      height: Math.max(1, Math.round(sourceHeight * scale)),
    };
  };
  const drainWorkerResults = (session) => {
    while (session.ready.has(session.nextCommitSequence)) {
      const sequence = session.nextCommitSequence++;
      const result = session.ready.get(sequence);
      session.ready.delete(sequence);
      if ((!result?.blob && !result?.encoded) || !session.active || session.token !== epoch || stopped) continue;
      if (ring.push({ tick: result.tick, blob: result.blob, encoded: result.encoded,
        width: result.width, height: result.height, byteSize: result.byteSize })) {
        session.committed += 1;
      }
    }
  };
  const finishWorkerCapture = (claim, blob = null, error = null) => {
    const { session, slot } = claim;
    if (slot?.busy) slot.busy = false;
    session.inFlight = Math.max(0, session.inFlight - 1);
    if (error) {
      if (slot) {
        slot.failures += 1;
        if (slot.failures >= 3 && encoderSlots.includes(slot)) retireEncoderSlot(slot);
      }
    } else if (slot) slot.failures = 0;
    if (!session.active || session.token !== epoch || stopped) return;
    session.ready.set(claim.sequence, {
      blob,
      tick: claim.tick,
      width: claim.width,
      height: claim.height,
    });
    drainWorkerResults(session);
    if (error && claim.presented) fallbackToVideo?.();
  };
  const reserveWorkerCapture = (state, tick, width, height) => {
    const session = captureSession;
    if (!session.active || session.token !== epoch || stopped) return null;
    if (session.inFlight >= maxReadbackConcurrency) {
      session.droppedBusy += 1;
      return null;
    }
    if (session.lastSubmittedTick >= 0 && tick - session.lastSubmittedTick < 6) return null;
    const slot = acquireEncoderSlot();
    if (!slot) {
      session.droppedBusy += 1;
      return null;
    }
    const claim = {
      session,
      token: session.token,
      sequence: session.nextSequence++,
      slot,
      state,
      tick,
      width,
      height,
      presented: false,
    };
    slot.busy = true;
    session.inFlight += 1;
    session.maxInFlight = Math.max(session.maxInFlight, session.inFlight);
    session.lastSubmittedTick = tick;
    return claim;
  };
  const reserveCodecCapture = (state, tick, width, height) => {
    const session = captureSession;
    if (!session.active || session.token !== epoch || stopped) return null;
    if (session.inFlight >= maxReadbackConcurrency) {
      session.droppedBusy += 1;
      return null;
    }
    if (session.lastSubmittedTick >= 0 && tick - session.lastSubmittedTick < 6) return null;
    const claim = {
      session,
      token: session.token,
      sequence: session.nextSequence++,
      slot: null,
      state,
      tick,
      width,
      height,
      presented: false,
      encoded: true,
    };
    session.inFlight += 1;
    session.maxInFlight = Math.max(session.maxInFlight, session.inFlight);
    session.lastSubmittedTick = tick;
    return claim;
  };
  const finishCodecCapture = (claim, encoded = null, error = null) => {
    const { session } = claim;
    session.inFlight = Math.max(0, session.inFlight - 1);
    if (!session.active || session.token !== epoch || stopped) return;
    session.ready.set(claim.sequence, {
      encoded,
      tick: claim.tick,
      width: claim.width,
      height: claim.height,
      byteSize: encoded?.byteLength,
    });
    drainWorkerResults(session);
    if (error) fallbackToJpeg?.(error);
  };
  const submitCodecFrame = (frame, claim = null) => {
    if (stopped || !frame) {
      frame?.close?.();
      if (claim) finishCodecCapture(claim);
      return;
    }
    if (claim && (claim.token !== epoch || claim.session !== captureSession || !claim.session.active)) {
      frame.close?.();
      finishCodecCapture(claim);
      return;
    }
    const state = claim?.state || stateOf();
    if (!eligible(state) || !videoCodec?.usable) {
      frame.close?.();
      if (claim) finishCodecCapture(claim, null, new Error('footage video codec unavailable'));
      return;
    }
    recordMetadata(state);
    const size = outputSize(frame);
    const capture = claim || reserveCodecCapture(state, Number(state.tick), size.width, size.height);
    if (!capture) { frame.close?.(); return; }
    const timestamp = Number.isFinite(frame.timestamp)
      ? frame.timestamp : Math.round(Number(capture.tick) * 1_000_000 / 60);
    try {
      videoCodec.encode(frame, {
        tick: capture.tick,
        timestamp,
        width: capture.width,
        height: capture.height,
      }).then((encoded) => finishCodecCapture(capture, encoded),
        (error) => finishCodecCapture(capture, null, error));
    } catch (error) {
      frame.close?.();
      finishCodecCapture(capture, null, error);
    }
  };
  const submitWorkerFrame = (frame, sourceKind, claim = null) => {
    if (stopped || !frame) {
      frame?.close?.();
      if (claim) finishWorkerCapture(claim);
      return;
    }
    if (claim && (claim.token !== epoch || claim.session !== captureSession || !claim.session.active)) {
      frame.close?.();
      finishWorkerCapture(claim);
      return;
    }
    const state = claim?.state || stateOf();
    if (!eligible(state)) {
      frame.close?.();
      if (claim) finishWorkerCapture(claim);
      else stopStream();
      return;
    }
    recordMetadata(state);
    const size = outputSize(frame);
    const capture = claim || reserveWorkerCapture(state, Number(state.tick), size.width, size.height);
    if (!capture) { frame.close?.(); return; }
    try {
      capture.slot.encoder.encode(frame, capture.width, capture.height, sourceKind)
        .then((blob) => finishWorkerCapture(capture, blob), (error) => finishWorkerCapture(capture, null, error));
    } catch (error) {
      frame.close?.();
      finishWorkerCapture(capture, null, error);
    }
  };
  const captureFrame = (frame, sourceKind = 'bitmap', claim = null) => {
    if (stopped || !frame) { frame?.close?.(); return; }
    if (activeCaptureBackend === 'webcodecs') {
      submitCodecFrame(frame, claim);
      return;
    }
    // The worker path transfers either an ImageBitmap or a VideoFrame and never touches the main
    // thread's canvas. A pool slot owns each frame until its ordered result is committed.
    if (claim || encoderSlots.some((slot) => slot.encoder?.usable)) {
      submitWorkerFrame(frame, sourceKind, claim);
      return;
    }
    const state = stateOf();
    if (!eligible(state)) { frame.close?.(); stopStream(); return; }
    recordMetadata(state);
    const tick = Number(state.tick);
    const previous = ring.frames.at(-1);
    if (encoding || (previous && tick - previous.tick < 6)) { frame.close?.(); return; }
    const { width, height } = outputSize(frame);
    const token = epoch;
    encoding = true;
    const land = (blob) => {
      if (token !== epoch || stopped) return;
      encoding = false;
      if (blob) ring.push({ tick, blob, width, height });
    };
    try {
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      context.drawImage(frame, 0, 0, width, height);
      // drawImage synchronously consumes the frame's pixels; releasing it before toBlob avoids pinning
      // a full-size VideoFrame while the fallback JPEG callback waits.
      frame.close?.();
      canvas.toBlob(land, 'image/jpeg', 0.88);
    } catch {
      frame.close?.();
      if (token === epoch && !stopped) encoding = false;
    }
  };
  const captureVideo = () => {
    if (stopped || !video) return;
    const state = stateOf();
    if (!eligible(state)) { stopStream(); return; }
    const tick = Number(state.tick);
    const previous = ring.frames.at(-1);
    if (video.readyState >= 2) {
      if (activeCaptureBackend === 'webcodecs') {
        if (typeof globalThis.VideoFrame !== 'function') {
          fallbackToJpeg?.(new Error('VideoFrame unavailable for video capture'));
        } else {
          const { width, height } = outputSize();
          const claim = reserveCodecCapture(state, tick, width, height);
          if (claim) {
            // Record only a frame that passed the capture gate. The submitted-frame helper retains
            // its existing metadata call for asynchronous completion.
            recordMetadata(state);
            try {
              const frame = new globalThis.VideoFrame(video, {
                timestamp: Math.round(tick * 1_000_000 / 60),
                alpha: 'discard',
              });
              submitCodecFrame(frame, claim);
            } catch (error) { finishCodecCapture(claim, null, error); }
          }
        }
      } else if (encoderSlots.some((slot) => slot.encoder?.usable)) {
        // Reserve a bounded independent worker/context before the asynchronous source conversion. The
        // results are committed in capture-sequence order later, so two JPEG readbacks cannot reorder the ring.
        const session = captureSession;
        if (session.inFlight < maxReadbackConcurrency
          && (session.lastSubmittedTick < 0 || tick - session.lastSubmittedTick >= 6)) {
          const { width, height } = outputSize();
          const claim = reserveWorkerCapture(state, tick, width, height);
          if (claim) {
            recordMetadata(state);
            createImageBitmap(video, { resizeWidth: width, resizeHeight: height, resizeQuality: 'medium' })
              .then((bitmap) => submitWorkerFrame(bitmap, 'bitmap', claim),
                (error) => finishWorkerCapture(claim, null, error));
          }
        }
      } else if (!encoding && (!previous || tick - previous.tick >= 6)) {
        // The established fallback keeps its main-thread JPEG path and quality when worker APIs are absent.
        captureFrame(video, 'video');
      }
    }
    if (video) callback = video.requestVideoFrameCallback?.(captureVideo) ?? null;
  };
  const startVideoCapture = () => {
    if (!stream || stopped) return false;
    try {
      video = document.createElement('video'); video.muted = true; video.playsInline = true;
      activeCaptureSource = 'video';
      video.srcObject = stream;
      video.play().then(() => {
        if (video) callback = video.requestVideoFrameCallback?.(captureVideo) ?? null;
      }).catch(stopStream);
      return true;
    } catch { return false; }
  };
  let fallbackToVideo = null;
  let fallbackToJpeg = null;
  const attachPresentedHook = (state, presentedCanvas) => {
    if (requestedCaptureSource !== 'presented' || !state?.render || !presentedCanvas) return false;
    const webCodecHook = activeCaptureBackend === 'webcodecs';
    if (!webCodecHook && (typeof globalThis.createImageBitmap !== 'function'
      || !encoderSlots.some((slot) => slot.encoder?.usable))) return false;
    if (webCodecHook && typeof globalThis.VideoFrame !== 'function') return false;
    // The presented arm is only safe when the source is the live renderer canvas. Synthetic callers
    // that expose a canvas without the renderer identity continue through the established video path.
    if (state.render.renderer?.domElement !== presentedCanvas) return false;
    const hookState = state;
    const hookCanvas = presentedCanvas;
    const hook = (canvas) => {
      if (stopped || presentedHook !== hook || presentedHookState !== hookState || canvas !== hookCanvas) return;
      const current = stateOf();
      if (current !== hookState || !eligible(current)) return;
      const now = clock();
      if (openingSince == null || now - openingSince < openingDelay) return;
      const tick = Number(current.tick);
      const { width, height } = outputSize(hookCanvas);
      if (webCodecHook) {
        const claim = reserveCodecCapture(current, tick, width, height);
        if (!claim) return;
        claim.presented = true;
        // Reserve first so rejected render callbacks do not clone pose/event metadata. Keep this
        // before VideoFrame snapshots the submitted canvas, preserving the captured tick.
        recordMetadata(current);
        try {
          // VideoFrame snapshots the successfully submitted canvas at this boundary. The frame is
          // transferred to WebCodecs; no ImageBitmap or JPEG readback is performed on this path.
          const frame = new globalThis.VideoFrame(hookCanvas, {
            timestamp: Math.round(tick * 1_000_000 / 60), alpha: 'discard',
          });
          submitCodecFrame(frame, claim);
        } catch (error) {
          finishCodecCapture(claim, null, error);
        }
      } else {
        const claim = reserveWorkerCapture(current, tick, width, height);
        if (!claim) return;
        claim.presented = true;
        recordMetadata(current);
        try {
          // Calling createImageBitmap synchronously at this boundary is intentional: it snapshots the
          // submitted canvas before a later renderer pass can overwrite the pixels. The promise only
          // carries that already-owned bitmap to the existing single worker slot.
          globalThis.createImageBitmap(hookCanvas, {
            resizeWidth: width,
            resizeHeight: height,
            resizeQuality: 'medium',
          }).then((bitmap) => submitWorkerFrame(bitmap, 'bitmap', claim),
            (error) => finishWorkerCapture(claim, null, error));
        } catch (error) {
          finishWorkerCapture(claim, null, error);
        }
      }
    };
    try {
      state.render.flightFootagePresentHook = hook;
      presentedHook = hook;
      presentedHookState = state;
      return true;
    } catch { return false; }
  };
  const startVideoFrameCapture = () => {
    if (requestedCaptureSource !== 'video-frame' || !stream) return false;
    const Processor = globalThis.MediaStreamTrackProcessor;
    const track = stream.getVideoTracks?.()[0];
    if (typeof Processor !== 'function' || !track) return false;
    let processor;
    try { processor = new Processor({ track }); } catch { return false; }
    const reader = processor?.readable?.getReader?.();
    if (!reader) return false;
    const loopId = ++trackLoopId;
    trackReader = reader;
    activeCaptureSource = 'video-frame';
    (async () => {
      let ended = false;
      try {
        while (trackReader === reader && loopId === trackLoopId && !stopped) {
          const result = await reader.read();
          if (result?.done) { ended = true; break; }
          const frame = result?.value;
          if (!frame) continue;
          if (trackReader !== reader || loopId !== trackLoopId) frame.close?.();
          else captureFrame(frame, 'video-frame');
        }
      } catch {
        // A processor can disappear during tab visibility/context changes. The live stream remains
        // valid in most browsers, so retry once through the established detached-video source.
        if (trackReader === reader && loopId === trackLoopId && !stopped) {
          trackReader = null; activeCaptureSource = null;
          startVideoCapture();
        }
      } finally {
        if (ended && trackReader === reader && loopId === trackLoopId && !stopped) {
          trackReader = null; activeCaptureSource = null;
          startVideoCapture();
        }
      }
    })();
    return true;
  };
  fallbackToJpeg = (error = null) => {
    if (activeCaptureBackend !== 'webcodecs' && !videoCodec) return false;
    webCodecFailure = error ? String(error?.message || error) : webCodecFailure;
    disposeVideoCodec(true);
    if (!encoderTried) {
      encoderTried = true;
      createEncoderSlot();
    }
    if (requestedCaptureSource === 'presented' && source && !source.captureStream) {
      const state = stateOf();
      if (attachPresentedHook(state, source)) {
        activeCaptureSource = 'presented';
        return true;
      }
    }
    return fallbackToVideo?.() ?? false;
  };
  fallbackToVideo = () => {
    if (stopped || !source?.captureStream) return false;
    detachPresentedHook();
    activeCaptureSource = null;
    try {
      trackLoopId += 1;
      const reader = trackReader;
      trackReader = null;
      try { reader?.cancel?.()?.catch?.(() => {}); } catch { /* best effort */ }
      if (video && callback != null) video.cancelVideoFrameCallback?.(callback);
      callback = null;
      if (video) { video.pause?.(); video.srcObject = null; video.removeAttribute?.('src'); video.load?.(); }
      video = null;
      stream ??= source.captureStream(FLIGHT_FOOTAGE_LIMITS.fps);
      canvas ??= document.createElement('canvas');
      context ??= canvas.getContext('2d');
      if (!startVideoCapture()) { stopStream(); return false; }
      return true;
    } catch { stopStream(); return false; }
  };
  const poll = () => {
    const state = stateOf();
    if (state?.mode === 'menu' && ring.frames.length) clear();
    if (!eligible(state)) { if (stream || presentedHook) stopStream(); return; }
    recordMetadata(state);
    const firstPictureAt = state.render?.firstPlayableFrameAt;
    const current = clock();
    openingSince ??= Number.isFinite(firstPictureAt) ? firstPictureAt : current;
    if (current - openingSince < openingDelay) return;
    const next = state.render?.renderer?.domElement || state.render?.canvas;
    const presentedCodecCandidate = requestedCaptureBackend === 'webcodecs' && requestedCaptureSource === 'presented';
    if (!next || next.width <= 0 || next.height <= 0 || (!next.captureStream && !presentedCodecCandidate)) return;
    if (source === next && (video || trackReader || presentedHook)) return;
    stopStream(); source = next;
    try {
      if (requestedCaptureBackend === 'webcodecs' && webCodecState !== 'unavailable') {
        const { width, height } = outputSize(next);
        videoCodec = createFootageVideoCodec(globalThis, {
          width,
          height,
          fps: FLIGHT_FOOTAGE_LIMITS.fps,
          maxPending: maxReadbackConcurrency,
        });
        if (videoCodec) {
          webCodecState = 'available';
          activeCaptureBackend = 'webcodecs';
        } else webCodecState = 'unavailable';
      }
      if (attachPresentedHook(state, next)) {
        activeCaptureSource = 'presented';
        return;
      }
      if (activeCaptureBackend === 'webcodecs' && requestedCaptureSource === 'presented') {
        fallbackToJpeg?.(new Error('presented VideoFrame unavailable'));
        if (activeCaptureSource === 'video') return;
      }
      if (!encoderTried) {
        encoderTried = true;
        createEncoderSlot();
      }
      if (attachPresentedHook(state, next)) {
        activeCaptureSource = 'presented';
        return;
      }
      if (!next.captureStream) { stopStream(); return; }
      stream = next.captureStream(FLIGHT_FOOTAGE_LIMITS.fps);
      canvas = document.createElement('canvas');
      context = canvas.getContext('2d');
      if (!startVideoFrameCapture() && !startVideoCapture()) stopStream();
    } catch { stopStream(); }
  };
  for (const event of ['game:new', 'game:load', 'game:loaded', 'save:loaded', 'game:exitToMenu']) {
    const off = bus?.on?.(event, clear); if (off) subscriptions.push(off);
  }
  const visibility = () => { if (document.hidden) stopStream(); else poll(); };
  document.addEventListener('visibilitychange', visibility);
  timer = setInterval(poll, 100);
  active = {
    ring,
    status() {
      return {
        capturing: activeCaptureSource === 'presented' || !!stream,
        frames: ring.frames.length,
        bytes: ring.bytes,
        captureSource: activeCaptureSource,
        requestedCaptureSource,
        captureBackend: activeCaptureBackend,
        requestedCaptureBackend,
        videoCodec: videoCodec?.info || null,
        videoCodecFailure: webCodecFailure,
        willReadFrequently: willReadFrequently === true,
        readbackConcurrency: maxReadbackConcurrency,
        activeReadbackJobs: captureSession.inFlight,
        maxReadbackJobs: captureSession.maxInFlight,
        droppedReadbackFrames: captureSession.droppedBusy,
        committedReadbackFrames: captureSession.committed,
      };
    },
    recording() {
      if (!ring.frames.length) return null;
      const base = ring.frames[0].tick, end = ring.frames.at(-1).tick;
      const rows = poses.filter((row) => row.tick >= base && row.tick <= end);
      return { seed: stateOf()?.meta?.seed || 0, tickRate: 60, ticks: end - base + 1,
        seconds: (end - base + 1) / 60, absoluteBaseTick: base, base,
        poseFrames: rows, samples: rows.flatMap((row) => row.poses),
        events: marks.filter((mark) => mark.absoluteTick >= base && mark.absoluteTick <= end)
          .map((mark) => ({ ...mark, tick: mark.absoluteTick - base })),
        inputRing: { read(tick) { const row = rows.find((entry) => entry.tick >= base + tick); return { data: { boost: !!row?.boost } }; } },
      };
    },
    clear,
    dispose() {
      stopped = true; clear(); clearInterval(timer); disposeEncoderSlots();
      subscriptions.forEach((off) => off()); document.removeEventListener('visibilitychange', visibility);
      if (active === this) active = null;
    },
  };
  return active;
}

/** One bitmap at a time; seeking never mutates the live camera or bodies. */
export function createFootageViewer(canvas) {
  let token = 0, disposed = false, lastTick = null, lastRing = null, lastFrame = null;
  return {
    async show(tick) {
      // Every request is authoritative, including a no-op request for the already-visible frame.
      // This invalidates an older decode that could otherwise paint after the caller moved back.
      const own = ++token;
      const ring = active?.ring;
      const frames = ring?.frames || [];
      if (!frames.length || disposed) return false;
      let chosen = frames[0];
      for (const frame of frames) { if (frame.tick > tick) break; chosen = frame; }
      if (chosen.tick === lastTick && ring === lastRing && chosen === lastFrame) return true;
      const blob = await decodeFootageFrameToBlob(chosen);
      if (!blob) return false;
      const bitmap = await createImageBitmap(blob);
      try {
        // A clear/restart can retain the same viewer while replacing the recorder ring. Do not
        // let a delayed decode from the retired capture repaint the current viewer.
        if (disposed || own !== token || active?.ring !== ring || !ring.frames.includes(chosen)) return false;
        canvas.width = chosen.width; canvas.height = chosen.height;
        canvas.getContext('2d').drawImage(bitmap, 0, 0);
        lastTick = chosen.tick; lastRing = ring; lastFrame = chosen;
        return true;
      } finally { bitmap.close(); }
    },
    dispose() { disposed = true; token += 1; canvas.width = 0; canvas.height = 0; },
  };
}

function abortIfNeeded(signal) { if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError'); }

/** Decode genuine JPEG frames for the existing GIF codec. Bounded transient RGBA storage. */
export async function resolveFlightClipFrames(clip, { signal } = {}) {
  const frames = active?.ring.window(clip.startTick, clip.endTick) || [];
  if (frames.length < 2) return null;
  const stride = Math.max(1, Math.ceil(frames.length / 150));
  const selected = frames.filter((_frame, index) => index % stride === 0);
  const scale = Math.min(1, 480 / selected[0].width, 270 / selected[0].height);
  const width = Math.max(1, Math.round(selected[0].width * scale));
  const height = Math.max(1, Math.round(selected[0].height * scale));
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d'), rgba = [];
  try {
    for (const frame of selected) {
      abortIfNeeded(signal);
      const blob = await decodeFootageFrameToBlob(frame, { signal });
      if (!blob) return null;
      const bitmap = await createImageBitmap(blob);
      try { ctx.drawImage(bitmap, 0, 0, width, height); rgba.push(ctx.getImageData(0, 0, width, height).data); }
      finally { bitmap.close(); }
    }
    const seconds = (frames.at(-1).tick - frames[0].tick) / 60 + 0.1;
    return { frames: rgba, width, height, fps: selected.length / seconds, source: 'recorded-flight',
      actualStartTick: frames[0].tick, actualEndTick: frames.at(-1).tick };
  } finally { canvas.width = 0; canvas.height = 0; }
}

/** Browser codec export: play only the recorded pixels into an isolated output canvas. */
export async function encodeFlightVideo(clip, { signal, format = 'mp4' } = {}) {
  const frames = active?.ring.window(clip.startTick, clip.endTick) || [];
  if (frames.length < 2 || typeof MediaRecorder === 'undefined') return null;
  const codecs = format === 'webm' ? ['video/webm;codecs=vp9', 'video/webm;codecs=vp8']
    : ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8'];
  const mime = codecs.find((type) => MediaRecorder.isTypeSupported(type));
  if (!mime) return null;
  const canvas = document.createElement('canvas'); canvas.width = frames[0].width; canvas.height = frames[0].height;
  const ctx = canvas.getContext('2d'), stream = canvas.captureStream(0), chunks = [];
  let recorder;
  try { recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 }); }
  catch (error) { stream.getTracks().forEach((track) => track.stop()); canvas.width = 0; canvas.height = 0; throw error; }
  let stopResolve, rejectRecord;
  const done = new Promise((resolve, reject) => { stopResolve = resolve; rejectRecord = reject; });
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  recorder.onstop = stopResolve; recorder.onerror = (event) => rejectRecord(event.error || new Error('Video encoder failed'));
  const abort = () => { if (recorder.state !== 'inactive') recorder.stop(); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    abortIfNeeded(signal); recorder.start();
    for (let i = 0; i < frames.length; i += 1) {
      abortIfNeeded(signal);
      const blob = await decodeFootageFrameToBlob(frames[i], { signal });
      if (!blob) return null;
      const bitmap = await createImageBitmap(blob);
      try { ctx.drawImage(bitmap, 0, 0); stream.getVideoTracks()[0].requestFrame?.(); } finally { bitmap.close(); }
      const delay = i + 1 < frames.length ? (frames[i + 1].tick - frames[i].tick) * 1000 / 60 : 100;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    if (recorder.state !== 'inactive') recorder.stop();
    await done; abortIfNeeded(signal);
    const bytes = new Uint8Array(await new Blob(chunks, { type: mime }).arrayBuffer());
    return { bytes, mime: mime.split(';')[0], format: mime.startsWith('video/mp4') ? 'mp4' : 'webm', source: 'recorded-flight' };
  } finally {
    signal?.removeEventListener('abort', abort);
    if (recorder.state !== 'inactive') recorder.stop();
    stream.getTracks().forEach((track) => track.stop()); canvas.width = 0; canvas.height = 0;
  }
}
