// Node-side freeze watch. A box-wide stall (virtio balloon reclaim, a hung host)
// freezes this process, so the 1s timer fires late. process.hrtime is the clock:
// wall time can be stepped, and the in-page sim clock stops too, which is how a
// host freeze was graded as a game sim_stalled FAIL.
//
// A gap under HARNESS_FREEZE_MS is ordinary event-loop delay and is not recorded.
// In-page frame_time and long-task accounting are not touched here.

import { execFileSync } from 'node:child_process';
import { dmesgStampMs } from './browser.mjs';

/** Monotonic gap that counts as this process being frozen, not as a slow turn. */
export const HARNESS_FREEZE_MS = 20_000;
export const HARNESS_FREEZE_TICK_MS = 1_000;

export function defaultMonoMs() {
  return Number(process.hrtime.bigint() / 1_000_000n);
}

/**
 * Record gaps where the 1s timer fires at least `gapMs` late by monotonic time.
 * `startWall` is the wall clock at the previous tick. `endWall` is when the
 * timer actually ran. Both are the injected `now` clock (Date.now in production),
 * same epoch as play samples.
 */
export function createFreezeWatch({
  intervalMs = HARNESS_FREEZE_TICK_MS,
  gapMs = HARNESS_FREEZE_MS,
  now = Date.now,
  mono = defaultMonoMs,
  schedule = setInterval,
  clear = clearInterval,
} = {}) {
  const freezes = [];
  let timer = null;
  let lastMono = null;
  let lastWall = null;
  let stopped = false;

  const sample = () => {
    const wall = now();
    const mark = mono();
    if (lastMono != null) {
      const lag = mark - lastMono;
      if (Number.isFinite(lag) && lag >= gapMs) {
        freezes.push({ startWall: lastWall, endWall: wall, lagMs: Math.round(lag) });
      }
    }
    lastMono = mark;
    lastWall = wall;
  };

  return {
    start() {
      if (timer != null || stopped) return;
      sample();
      timer = schedule(sample, intervalMs);
      if (timer && typeof timer.unref === 'function') timer.unref();
    },
    stop() {
      if (stopped) return;
      stopped = true;
      if (timer != null) clear(timer);
      timer = null;
      if (lastMono != null) sample();
    },
    snapshot() {
      return freezes.map((row) => ({ ...row }));
    },
  };
}

/** Stall interrupt wall window, or null when the harness did not stamp one. */
export function stallWallWindow(stall) {
  if (!stall) return null;
  const end = Number(stall.wallEnd);
  const start = Number(stall.wallStart);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return { start, end };
}

/** Freezes whose [startWall, endWall] overlaps the stall's wall window. */
export function overlappingHarnessFreezes(stall, freezes) {
  const window = stallWallWindow(stall);
  if (!window) return [];
  const hits = [];
  for (const freeze of freezes || []) {
    const start = Number(freeze && freeze.startWall);
    const end = Number(freeze && freeze.endWall);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (start <= window.end && window.start <= end) hits.push(freeze);
  }
  return hits;
}

export function formatHarnessFreeze(freeze) {
  const lagS = Math.round(Number(freeze && freeze.lagMs) / 1000);
  const start = Number.isFinite(Number(freeze && freeze.startWall)) ? new Date(Number(freeze.startWall)).toISOString() : '?';
  const end = Number.isFinite(Number(freeze && freeze.endWall)) ? new Date(Number(freeze.endWall)).toISOString() : '?';
  return `harness clock frozen ${lagS} s (${start} → ${end})`;
}

/** Balloon reclaim or a kernel hung-task. Not an oom-kill, and not "invoked oom-killer". */
export function isHostPressureLine(line) {
  const text = String(line || '');
  if (/virtio_balloon/i.test(text) && /out of puff/i.test(text)) return true;
  if (/\bhung_task\b/i.test(text)) return true;
  if (/blocked for more than\b/i.test(text)) return true;
  return false;
}

/** Pressure lines at or after sinceMs. Unstamped lines are dropped when sinceMs is set. */
export function parseHostPressureLines(text, sinceMs = null) {
  const out = [];
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line || !isHostPressureLine(line)) continue;
    if (sinceMs != null) {
      const stamp = dmesgStampMs(line);
      if (stamp == null || stamp < sinceMs) continue;
    }
    out.push(line);
  }
  return out;
}

export function readHostPressure(sinceMs, exec = execFileSync) {
  try {
    const text = exec('dmesg', ['-T'], { encoding: 'utf8', timeout: 5000, maxBuffer: 8 * 1024 * 1024 });
    return { lines: parseHostPressureLines(text, sinceMs), error: null };
  } catch (err) {
    return { lines: [], error: String(err && err.message || err).split('\n')[0].slice(0, 180) };
  }
}

/**
 * Unique pressure lines whose kernel stamp falls in the stall window or in one
 * of the freezes that overlapped it. A puff outside that span is not evidence
 * for this stall.
 */
export function hostPressureCovering(lines, stallWindow, freezes) {
  const spans = [];
  if (stallWindow) spans.push(stallWindow);
  for (const freeze of freezes || []) {
    const start = Number(freeze && freeze.startWall);
    const end = Number(freeze && freeze.endWall);
    if (Number.isFinite(start) && Number.isFinite(end)) spans.push({ start, end });
  }
  const out = [];
  const seen = new Set();
  for (const line of lines || []) {
    if (seen.has(line) || !isHostPressureLine(line)) continue;
    const stamp = dmesgStampMs(line);
    if (stamp == null) continue;
    if (!spans.some((span) => stamp >= span.start && stamp <= span.end)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}
