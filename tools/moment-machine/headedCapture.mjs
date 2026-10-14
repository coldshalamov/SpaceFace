// An already-running public flight route owns the canvas and its capture lifecycle.
// Never boot a second simulation to fabricate playback from position metadata.
// A thrown readback, an empty ring, or any payload that is not recorded flight
// stays unverified and keeps the real error.

function captureFailure(reason, error) {
  const message = error || reason || 'capture-failed';
  return {
    ok: false,
    reason: reason || message,
    error: message,
    stderr: message,
    framesArePlayback: false,
    frames: [],
    videoVerified: false,
    producedVideo: false,
    source: null,
  };
}

export async function capturePresentedFrames(page, { startTick, endTick, maxFrames = 300 } = {}) {
  if (!page || typeof page.evaluate !== 'function') {
    return captureFailure('live-flight-page-required', 'live-flight-page-required');
  }
  let captured;
  try {
    captured = await page.evaluate(async ({ startTick, endTick, maxFrames }) => {
      const { getFlightFootage } = await import('/src/ui/screens/flightFootage.js');
      const capture = getFlightFootage();
      if (!capture?.ring.frames.length) return null;
      const all = capture.ring.frames;
      const rows = capture.ring.window(startTick ?? all[0].tick, endTick ?? all.at(-1).tick);
      if (rows.length < 2) return null;
      const stride = Math.max(1, Math.ceil(rows.length / Math.min(300, maxFrames)));
      const selected = rows.filter((_row, index) => index % stride === 0);
      const canvas = document.createElement('canvas'); canvas.width = selected[0].width; canvas.height = selected[0].height;
      const ctx = canvas.getContext('2d'), frames = [];
      try {
        for (const row of selected) {
          const bitmap = await createImageBitmap(row.blob);
          try {
            ctx.drawImage(bitmap, 0, 0);
            const bytes = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let text = ''; for (let at = 0; at < bytes.length; at += 0x8000) text += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
            frames.push(btoa(text));
          } finally { bitmap.close(); }
        }
        if (frames.length < 2) return null;
        return {
          frames,
          width: canvas.width,
          height: canvas.height,
          startTick: rows[0].tick,
          endTick: rows.at(-1).tick,
          fps: selected.length / ((rows.at(-1).tick - rows[0].tick) / 60 + 0.1),
          source: 'recorded-flight',
        };
      } finally { canvas.width = 0; canvas.height = 0; }
    }, { startTick, endTick, maxFrames });
  } catch (error) {
    const message = error && error.message ? String(error.message) : String(error);
    return captureFailure(message, message);
  }
  if (!captured || captured.source !== 'recorded-flight' || !Array.isArray(captured.frames) || captured.frames.length < 2) {
    const message = (captured && (captured.error || captured.reason)) || 'presented-flight-frames-required';
    return captureFailure(message, message);
  }
  const byteLength = captured.width * captured.height * 4;
  if (!Number.isSafeInteger(captured.width) || captured.width <= 0
    || !Number.isSafeInteger(captured.height) || captured.height <= 0
    || !Number.isSafeInteger(byteLength) || !Number.isFinite(captured.fps) || captured.fps <= 0
    || !Number.isSafeInteger(captured.startTick) || captured.startTick < 0
    || !Number.isSafeInteger(captured.endTick) || captured.endTick <= captured.startTick) {
    return captureFailure('invalid-recorded-frame-metadata');
  }
  let frames;
  try {
    frames = captured.frames.map((bytes) => {
      const raw = Buffer.from(bytes, 'base64');
      if (raw.length !== byteLength) throw new Error('invalid-recorded-frame-size');
      // Expose a Uint8Array view without copying another full RGBA clip.
      return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
    });
  } catch (error) {
    const message = error && error.message ? String(error.message) : String(error);
    return captureFailure(message, message);
  }
  if (frames.length < 2) {
    return captureFailure('presented-flight-frames-required', 'presented-flight-frames-required');
  }
  return {
    ok: true,
    frames,
    width: captured.width,
    height: captured.height,
    startTick: captured.startTick,
    endTick: captured.endTick,
    fps: captured.fps,
    source: 'recorded-flight',
    framesArePlayback: true,
    videoVerified: false,
    producedVideo: false,
    error: null,
    stderr: null,
  };
}

export async function attemptHeadedPlayback(options = {}) {
  let capture;
  try {
    capture = await capturePresentedFrames(options.page, options);
  } catch (error) {
    const message = error && error.message ? String(error.message) : String(error);
    return {
      attempted: !!options.page,
      ...captureFailure(message, message),
    };
  }
  const failed = capture.ok !== true || capture.framesArePlayback !== true || capture.source !== 'recorded-flight';
  const error = failed ? (capture.error || capture.reason || 'capture-failed') : null;
  return {
    ...capture,
    attempted: !!options.page,
    ok: !failed,
    framesArePlayback: !failed && Array.isArray(capture.frames) && capture.frames.length >= 2,
    producedVideo: false,
    videoVerified: false,
    error,
    stderr: error,
  };
}
