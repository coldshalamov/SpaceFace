// Main-thread self-time summary of a Chrome trace (the JSON array/object CDP Tracing.end streams back).
//
// Why this exists: a V8 CPU profile calls everything outside JavaScript "(program)". On the 2026-10-13
// loading profile that was 25-50 % of every second of the main thread, and the profile cannot say whether it
// is style/layout, paint, compositor commit, IPC to the GPU process, or the browser's own scheduling. A
// timeline trace can. This module is pure: events in, rows out, so it is unit-testable.
//
//   summarizeMainThread(events, { windows: [{ id, fromUs, toUs }] }) ->
//     { pid, tid, windows: [{ id, wallUs, busyUs, rows: [{ name, selfUs, share, count }] }] }

/** Trace event arrays come either bare or wrapped as { traceEvents }. */
export function traceEventsOf(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.traceEvents)) return parsed.traceEvents;
  return [];
}

/** The renderer main thread of the process that did the most work: the game window, not a helper. */
export function findGameMainThread(events) {
  const mainThreads = new Map(); // `${pid}:${tid}` -> { pid, tid, busyUs }
  for (const event of events) {
    if (event.ph === 'M' && event.name === 'thread_name' && event.args && event.args.name === 'CrRendererMain') {
      mainThreads.set(`${event.pid}:${event.tid}`, { pid: event.pid, tid: event.tid, busyUs: 0 });
    }
  }
  for (const event of events) {
    if (event.ph !== 'X' || !(event.dur > 0)) continue;
    const thread = mainThreads.get(`${event.pid}:${event.tid}`);
    if (thread && event.name === 'RunTask') thread.busyUs += event.dur;
  }
  let best = null;
  for (const thread of mainThreads.values()) if (!best || thread.busyUs > best.busyUs) best = thread;
  return best;
}

/** Complete events of one thread, begin/end pairs folded in, sorted by start (parents before children). */
export function threadSlices(events, pid, tid) {
  const slices = [];
  const open = [];
  const sorted = events
    .filter((event) => event.pid === pid && event.tid === tid && (event.ph === 'X' || event.ph === 'B' || event.ph === 'E'))
    .sort((a, b) => a.ts - b.ts || (b.dur || 0) - (a.dur || 0));
  for (const event of sorted) {
    if (event.ph === 'X') {
      if (event.dur >= 0) slices.push({ name: event.name, ts: event.ts, dur: event.dur });
    } else if (event.ph === 'B') {
      open.push(event);
    } else if (event.ph === 'E') {
      const begin = open.pop();
      if (begin) slices.push({ name: begin.name, ts: begin.ts, dur: Math.max(0, event.ts - begin.ts) });
    }
  }
  return slices.sort((a, b) => a.ts - b.ts || b.dur - a.dur);
}

/** Self time per slice: its duration minus its direct children's. Nested slices must be properly contained. */
export function selfTimes(slices) {
  const out = [];
  const stack = [];
  const close = (until) => {
    while (stack.length && stack[stack.length - 1].end <= until) {
      const done = stack.pop();
      out.push({ name: done.name, ts: done.ts, selfUs: Math.max(0, done.dur - done.childUs) });
    }
  };
  for (const slice of slices) {
    close(slice.ts);
    const parent = stack[stack.length - 1];
    if (parent && slice.ts + slice.dur <= parent.end + 1) parent.childUs += slice.dur;
    stack.push({ name: slice.name, ts: slice.ts, dur: slice.dur, end: slice.ts + slice.dur, childUs: 0 });
  }
  close(Infinity);
  return out;
}

export function summarizeMainThread(events, { windows = [], top = 24 } = {}) {
  const thread = findGameMainThread(events);
  if (!thread) return { pid: null, tid: null, windows: [] };
  const selves = selfTimes(threadSlices(events, thread.pid, thread.tid));
  const rows = windows.map((window) => {
    const byName = new Map();
    let busyUs = 0;
    for (const item of selves) {
      if (item.ts < window.fromUs || item.ts >= window.toUs) continue;
      if (item.name === 'RunTask' || item.name === 'ThreadControllerImpl::RunTask') {
        // The task wrapper's own self time is scheduler overhead outside any named work.
        const entry = byName.get('(task overhead)') || { selfUs: 0, count: 0 };
        entry.selfUs += item.selfUs; entry.count += 1; byName.set('(task overhead)', entry);
        busyUs += item.selfUs;
        continue;
      }
      const entry = byName.get(item.name) || { selfUs: 0, count: 0 };
      entry.selfUs += item.selfUs; entry.count += 1; byName.set(item.name, entry);
      busyUs += item.selfUs;
    }
    return {
      id: window.id,
      wallUs: window.toUs - window.fromUs,
      busyUs,
      rows: [...byName.entries()]
        .map(([name, value]) => ({ name, selfUs: value.selfUs, count: value.count, share: busyUs > 0 ? value.selfUs / busyUs : 0 }))
        .sort((a, b) => b.selfUs - a.selfUs)
        .slice(0, top),
    };
  });
  return { pid: thread.pid, tid: thread.tid, windows: rows };
}

export function renderTraceSummaryMarkdown(summary) {
  const lines = ['# Main-thread timeline summary (self time per trace event)', ''];
  if (summary.pid == null) return `${lines.join('\n')}No CrRendererMain thread found in the trace.\n`;
  lines.push(`Game renderer pid ${summary.pid}, main thread tid ${summary.tid}.`, '');
  for (const window of summary.windows) {
    lines.push(`## ${window.id} — ${(window.wallUs / 1e6).toFixed(2)} s wall, ${(window.busyUs / 1e6).toFixed(2)} s busy`, '');
    lines.push('| ms | share | count | event |', '|---:|---:|---:|---|');
    for (const row of window.rows) {
      lines.push(`| ${(row.selfUs / 1000).toFixed(1)} | ${(100 * row.share).toFixed(1)}% | ${row.count} | \`${row.name}\` |`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}
