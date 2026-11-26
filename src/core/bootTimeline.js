// The boot timeline is the startup wall clock: one shared marks list minted by index.html's
// inline script before any module evaluates, so parse-time events land in order. Modules append
// through bootMark(); probes and the capture tool read the same object off window as
// `window.__SF_BOOT_TIMELINE__` ({version, timeOrigin, marks:[{name,t,detail}], mark, line, table}).
const KEY = '__SF_BOOT_TIMELINE__';

function nowMs(host) {
  return (host.performance && typeof host.performance.now === 'function')
    ? host.performance.now()
    : Date.now() - (host.__SF_BOOT_TIMELINE__?.epochWall || 0);
}

export function ensureBootTimeline(host = globalThis) {
  const existing = host && host[KEY];
  if (existing && Array.isArray(existing.marks) && typeof existing.mark === 'function') return existing;
  const timeline = {
    version: 1,
    timeOrigin: host.performance && Number.isFinite(host.performance.timeOrigin)
      ? host.performance.timeOrigin : 0,
    epochWall: Date.now() - nowMs(host),
    marks: [{ name: 'navigation-start', t: 0, detail: null }],
    mark(name, detail = null, at = null) {
      const t = Number.isFinite(at) ? at : nowMs(host);
      const row = { name: String(name), t, detail: detail == null ? null : String(detail).slice(0, 240) };
      timeline.marks.push(row);
      try { host.performance?.mark?.(`sf:${row.name}`, { startTime: Math.max(0, t) }); } catch { /* older hosts */ }
      return row;
    },
    table() {
      let prev = 0;
      return timeline.marks.map((row) => {
        const out = { name: row.name, ms: Math.round(row.t), deltaMs: Math.round(row.t - prev), detail: row.detail };
        prev = row.t;
        return out;
      });
    },
    line() {
      return timeline.marks.map((row) => `${row.name}=${Math.round(row.t)}`).join(' ');
    },
  };
  host[KEY] = timeline;
  return timeline;
}

/** Append a mark. Missing timeline (tests, workers) mints one. */
export function bootMark(name, detail = null, host = globalThis) {
  return ensureBootTimeline(host).mark(name, detail);
}

/** Mark only when the name has not already been recorded this navigation. */
export function bootMarkOnce(name, detail = null, host = globalThis) {
  const timeline = ensureBootTimeline(host);
  if (timeline.marks.some((row) => row.name === name)) return null;
  return timeline.mark(name, detail);
}

/** Back- or forward-dated mark (e.g. the Electron process start read from a wall clock). */
export function bootMarkAt(name, t, detail = null, host = globalThis) {
  return ensureBootTimeline(host).mark(name, detail, t);
}

export function bootTimelineTable(host = globalThis) {
  return ensureBootTimeline(host).table();
}

export function bootTimelineLine(host = globalThis) {
  return ensureBootTimeline(host).line();
}
