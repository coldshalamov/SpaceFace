// Compare read-only runtime witnesses after a native touch drag. A visible touch deck
// or an advancing HUD alone cannot establish that the ship answered the gesture.
export function assessMobileFlightControl(before, after) {
  const valid = frame => frame?.mode === 'flight' && frame.hasPos === true
    && [frame.tick, frame.posX, frame.posZ].every(Number.isFinite);
  if (!valid(before) || !valid(after)) return { passed: false, reason: 'flight-pose-unavailable' };
  if (!(Number(before.speed) <= 1)) return { passed: false, reason: 'ship-was-already-coasting' };
  const tickDelta = after.tick - before.tick;
  const distance = Math.hypot(after.posX - before.posX, after.posZ - before.posZ);
  const worldFrameDelta = Number(after.worldSubmittedFrames) - Number(before.worldSubmittedFrames);
  const passed = tickDelta > 0 && distance > 1 && Number(after.speed) > 1
    && worldFrameDelta > 0 && after.contextLost !== true && !after.lastFrameError;
  return { passed, reason: passed ? 'touch-drag-moved-ship' : 'ship-did-not-answer-touch-drag',
    tickDelta, worldFrameDelta, distance, speed: after.speed, before, after };
}

export async function exerciseMobileFlightControl(page) {
  const read = () => page.evaluate(() => {
    const frame = globalThis.__SF_WITNESS__?.snapshot?.();
    return frame && { mode: frame.mode, tick: frame.tick, hasPos: frame.hasPos,
      posX: frame.posX, posZ: frame.posZ, speed: frame.speed,
      worldSubmittedFrames: frame.worldSubmittedFrames, contextLost: frame.contextLost,
      lastFrameError: frame.lastFrameError };
  });
  // The player chooses empty space; derive the gesture from public DOM geometry only.
  const start = await page.evaluate(() => {
    const blocked = [];
    const candidates = [[.18, .78], [.15, .7], [.26, .64], [.28, .5], [.45, .6], [.2, .4]];
    for (const [fx, fy] of candidates) {
      const x = Math.round(innerWidth * fx), y = Math.round(innerHeight * fy);
      const target = document.elementFromPoint(x, y);
      const blocker = target?.closest('button,a,input,textarea,select,label,[role="button"],[role="dialog"],[role="slider"],.screen,.sf-radar-wrap,[data-sf-touch-ignore]');
      if (target && !blocker)
        return { x, y };
      blocked.push({ x, y, blocker: blocker?.outerHTML.slice(0, 220) || 'no-target' });
    }
    throw new Error(`No public empty flight space for a touch drag: ${JSON.stringify(blocked)}`);
  });
  let before = await read();
  const inherited = before;
  const session = await page.context().newCDPSession(page);
  try {
    if (Number(before?.speed) > 1) {
      // Continue preserves velocity. Hold the documented center-stick brake through
      // native input first, so inherited coasting cannot masquerade as control response.
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
      const brakeDeadline = Date.now() + 15000;
      do {
        await page.waitForTimeout(300);
        before = await read();
      } while (Number(before?.speed) > 1 && Date.now() < brakeDeadline);
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      if (!(Number(before?.speed) <= 1))
        return { passed: false, reason: 'native-center-hold-did-not-brake', inherited, before, start };
      await page.waitForTimeout(100);
      before = await read();
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove',
      touchPoints: [{ x: start.x + 90, y: start.y - 45 }] });
    const deadline = Date.now() + 12000;
    let result;
    do {
      await page.waitForTimeout(500);
      result = assessMobileFlightControl(before, await read());
      if (result.passed) return { ...result, inherited, source: 'native-cdp-touch', start };
    } while (Date.now() < deadline);
    return { ...result, inherited, source: 'native-cdp-touch', start };
  } finally {
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }).catch(() => {});
    await session.detach();
  }
}
