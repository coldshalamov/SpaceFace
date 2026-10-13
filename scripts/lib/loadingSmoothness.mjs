// What the player sees on the loading screen, in numbers: frame cadence, long animation frames and the
// backdrop video's dropped frames, cut into the same windows as the stage table of
// probe-main-thread-profile. Pure: observer samples in, rows out.
//
//   rafStamps     performance.now() of every requestAnimationFrame callback the page ran
//   loaf          PerformanceObserver 'long-animation-frame' entries (Chrome 123+): startTime, duration,
//                 blockingDuration, and scripts[] naming who ran
//   video         { t, total, dropped } samples of getVideoPlaybackQuality() on the backdrop <video>
//   windows       [{ id, fromMs, toMs }] in performance.now() milliseconds

export const SMOOTHNESS_BARS_MS = Object.freeze([33.4, 50, 100]);

const percentile = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0);

/** Frame-to-frame gaps for the callbacks that fall inside [fromMs, toMs). */
export function frameGapStats(rafStamps, fromMs, toMs) {
  const inside = rafStamps.filter((t) => t >= fromMs && t < toMs);
  const gaps = [];
  for (let i = 1; i < inside.length; i++) gaps.push(inside[i] - inside[i - 1]);
  const sorted = [...gaps].sort((a, b) => a - b);
  const wallMs = Math.max(0, toMs - fromMs);
  return {
    frames: inside.length,
    fps: wallMs > 0 ? (inside.length * 1000) / wallMs : 0,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    worst: sorted.length ? sorted[sorted.length - 1] : 0,
    over33: gaps.filter((g) => g > SMOOTHNESS_BARS_MS[0]).length,
    over50: gaps.filter((g) => g > SMOOTHNESS_BARS_MS[1]).length,
    over100: gaps.filter((g) => g > SMOOTHNESS_BARS_MS[2]).length,
    // Time the page spent not presenting beyond one 60 Hz frame: the part a viewer reads as stutter.
    stallMs: gaps.reduce((sum, g) => sum + Math.max(0, g - 16.7), 0),
  };
}

/** Who ran during the long animation frames of a window: total script time per source and function. */
export function loafOffenders(loaf, fromMs, toMs, top = 8) {
  const byKey = new Map();
  let frames = 0;
  let blockingMs = 0;
  for (const entry of loaf) {
    if (entry.startTime < fromMs || entry.startTime >= toMs) continue;
    frames += 1;
    blockingMs += Number(entry.blockingDuration) || 0;
    for (const script of entry.scripts || []) {
      const source = String(script.sourceURL || '').replace(/^.*\/(src|vendor)\//, '$1/') || '(inline)';
      const key = `${script.sourceFunctionName || script.invoker || '(anonymous)'} @ ${source}`;
      const row = byKey.get(key) || { key, ms: 0, count: 0, styleLayoutMs: 0 };
      row.ms += Number(script.duration) || 0;
      row.styleLayoutMs += Number(script.forcedStyleAndLayoutDuration) || 0;
      row.count += 1;
      byKey.set(key, row);
    }
  }
  return {
    frames,
    blockingMs,
    offenders: [...byKey.values()].sort((a, b) => b.ms - a.ms).slice(0, top),
  };
}

/** Dropped video frames between the first and last sample inside the window. */
export function videoDrops(video, fromMs, toMs) {
  const inside = video.filter((sample) => sample.t >= fromMs && sample.t <= toMs);
  if (inside.length < 2) return { samples: inside.length, played: 0, dropped: 0 };
  const first = inside[0];
  const last = inside[inside.length - 1];
  return { samples: inside.length, played: last.total - first.total, dropped: last.dropped - first.dropped };
}

export function summarizeLoadingSmoothness({ rafStamps = [], loaf = [], video = [], windows = [] } = {}) {
  return windows.map((window) => ({
    id: window.id,
    wallMs: window.toMs - window.fromMs,
    frames: frameGapStats(rafStamps, window.fromMs, window.toMs),
    loaf: loafOffenders(loaf, window.fromMs, window.toMs),
    video: videoDrops(video, window.fromMs, window.toMs),
  }));
}

export function smoothnessMarkdown(rows) {
  const lines = [
    '## Loading-screen smoothness (what the player sees)',
    '',
    'Frame gaps are the page\'s own requestAnimationFrame cadence; stall ms is time beyond one 60 Hz frame. The',
    'boot ring and the backdrop video render off the main thread, so a stall here is the DOM/labels/progress',
    'freezing while they keep moving. Long animation frames (LoAF) name the scripts that held the frame.',
    '',
    '| window | fps | frames | p50 ms | p95 ms | worst ms | >33 | >50 | >100 | stall ms | LoAF n / blocking ms | video dropped / played |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|',
  ];
  for (const row of rows) {
    const f = row.frames;
    lines.push(`| ${row.id} | ${f.fps.toFixed(1)} | ${f.frames} | ${f.p50.toFixed(1)} | ${f.p95.toFixed(1)} | ${f.worst.toFixed(0)} `
      + `| ${f.over33} | ${f.over50} | ${f.over100} | ${Math.round(f.stallMs)} | ${row.loaf.frames} / ${Math.round(row.loaf.blockingMs)} `
      + `| ${row.video.dropped} / ${row.video.played} |`);
  }
  lines.push('');
  for (const row of rows) {
    if (!row.loaf.offenders.length) continue;
    lines.push(`### Long animation frames in ${row.id}: who ran`, '', '| script ms | calls | forced style/layout ms | function @ source |', '|---:|---:|---:|---|');
    for (const o of row.loaf.offenders) lines.push(`| ${Math.round(o.ms)} | ${o.count} | ${Math.round(o.styleLayoutMs)} | \`${o.key}\` |`);
    lines.push('');
  }
  return lines;
}
