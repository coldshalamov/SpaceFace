// An already-running public flight route owns the canvas and its capture lifecycle.
// Never boot a second simulation to fabricate playback from position metadata.

export async function capturePresentedFrames(page, { startTick, endTick, maxFrames = 300 } = {}) {
  if (!page?.evaluate) return { ok: false, reason: 'live-flight-page-required', framesArePlayback: false, frames: [] };
  const captured = await page.evaluate(async ({ startTick, endTick, maxFrames }) => {
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
      return { frames, width: canvas.width, height: canvas.height, startTick: rows[0].tick, endTick: rows.at(-1).tick,
        fps: selected.length / ((rows.at(-1).tick - rows[0].tick) / 60 + 0.1), source: 'recorded-flight' };
    } finally { canvas.width = 0; canvas.height = 0; }
  }, { startTick, endTick, maxFrames });
  if (!captured) return { ok: false, reason: 'presented-flight-frames-required', framesArePlayback: false, frames: [] };
  return { ok: true, ...captured, frames: captured.frames.map((bytes) => new Uint8Array(Buffer.from(bytes, 'base64'))), framesArePlayback: true };
}

export async function attemptHeadedPlayback(options = {}) {
  const capture = await capturePresentedFrames(options.page, options);
  return { attempted: !!options.page, ok: capture.ok, videoVerified: false, producedVideo: false,
    error: capture.ok ? null : capture.reason, ...capture };
}
