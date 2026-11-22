// Ordinary frame rate, on the record (referee, 2026-11-22). Every ten seconds of live flight the
// desktop build prints one line: frames per second, frame time p50/p95, the worst frame, world
// speed, the frame cap in force and the resolution scale. The shell (electron/main.cjs) appends it
// to the launch log and to userData/frame-rate-log.jsonl, so the next time the owner plays his
// real numbers exist without anyone asking him for anything (npm run check:owner-session reads them).
//
// Called once per presented frame. Allocation-free between reports: a fixed histogram of frame
// intervals (1 ms buckets), a few counters, and one small JSON string every ten seconds.
const WINDOW_MS = 10000;
const BUCKETS = 256;
const hist = new Uint16Array(BUCKETS);
let windowStartMs = -1;
let windowSimStart = 0;
let lastPresentMs = -1;
let frames = 0;
let worstMs = 0;
let over50 = 0;
let over100 = 0;
let liveMs = 0;
let reports = 0;

function reset(nowMs, simTime) {
  hist.fill(0);
  windowStartMs = nowMs;
  windowSimStart = simTime;
  frames = 0; worstMs = 0; over50 = 0; over100 = 0; liveMs = 0;
}

function percentile(p) {
  const want = Math.max(1, Math.ceil(frames * p));
  let seen = 0;
  for (let i = 0; i < BUCKETS; i++) {
    seen += hist[i];
    if (seen >= want) return i;
  }
  return BUCKETS - 1;
}

/**
 * @param state game state (mode, timeScale, simTime, render.frameCap, render.dynResScale)
 * @param nowMs  wall clock of this presented frame
 * @param log    line sink (default console.info); injectable for tests
 */
export function noteFrameRatePresent(state, nowMs, log) {
  const live = !!state && state.mode === 'flight' && Number(state.timeScale) > 0
    && !(state.ui && state.ui.docked === true)
    && !(state.render && state.render.flightVeilHoldsSim === true);
  if (!live) { lastPresentMs = -1; return; }
  const simTime = Number(state.simTime) || 0;
  if (windowStartMs < 0) reset(nowMs, simTime);
  if (lastPresentMs >= 0) {
    const dt = nowMs - lastPresentMs;
    // A gap of more than two seconds is a pause the live test missed (a hidden window), not a frame.
    if (dt > 0 && dt < 2000) {
      frames++;
      liveMs += dt;
      hist[dt >= BUCKETS - 1 ? BUCKETS - 1 : dt | 0]++;
      if (dt > worstMs) worstMs = dt;
      if (dt > 50) over50++;
      if (dt > 100) over100++;
    }
  }
  lastPresentMs = nowMs;
  if (liveMs < WINDOW_MS) return;
  const simAdvanced = simTime - windowSimStart;
  const render = state.render || {};
  const line = `{"schema":"spaceface.frameRate.v1","n":${++reports},"liveS":${(liveMs / 1000).toFixed(1)},"fps":${(frames / (liveMs / 1000)).toFixed(1)}`
    + `,"p50":${percentile(0.5)},"p95":${percentile(0.95)},"worst":${Math.round(worstMs)},"over50":${over50},"over100":${over100}`
    + `,"world":${simAdvanced >= 0 && simAdvanced < 60 ? (simAdvanced / (liveMs / 1000)).toFixed(3) : 'null'}`
    + `,"cap":${Number(render.frameCap) || 0},"scale":${Number.isFinite(render.dynResScale) ? Number(render.dynResScale).toFixed(2) : 'null'}`
    + `,"swarm":${state.run && state.run.arenaId ? `"round ${Number.isInteger(state.run.wave) ? state.run.wave : '?'}"` : 'null'}}`;
  reset(nowMs, simTime);
  try { (log || console.info)('[frame-rate]', line); } catch (_) { /* the recorder must never disturb the game */ }
}
