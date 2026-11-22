// Per-function profile for the smoothness referee (scripts/probe-smooth-electron.mjs --profile).
//
// Takes a CDP sampling CPU profile of the MAIN thread recorded across the judged window and turns it
// into tables in "ms per presented frame", counting only samples taken while the world was live
// (flight, time running, no veil, judged segment): level-up cards, the shop, the pause plate and
// loading are left out tick by tick.
//
// Clock: profile timestamps are not performance.now(). The probe runs a named spin
// (`__smProfSync`) at a recorded performance.now() at the start and at the end of the profile; the
// samples that landed in each spin give the offset. The two offsets must agree or no table is made.
//
// Frames are bucketed by display refreshes taken (frame times are quantised to the refresh, so a
// plain "> 50 ms" cut would split identical frames by jitter):
//   made30  = 2 refreshes or fewer (33 ms: the Milestone-1 frame)
//   three   = 3 refreshes (50 ms: the frame the game sits on today)
//   long    = 4 refreshes or more (67 ms and up: the frames a player feels as hitches)

const SYNC_FN = '__smProfSync';
export const SMOOTH_PROFILE_SYNC_FN = SYNC_FN;

const fileOf = (url) => String(url || '').replace(/^.*\/(src|scripts|vendor|node_modules)\//, '$1/').replace(/^https?:\/\/[^/]+\//, '').replace(/\?.*$/, '');

export function summarizeSmoothProfile({ profile, syncs, ticks, liveAt, frames, refreshMs = 1000 / 60 }) {
  const out = { ok: false, why: '', sampleCount: 0 };
  if (!profile || !Array.isArray(profile.nodes) || !Array.isArray(profile.samples)) { out.why = 'no profile'; return out; }
  const byId = new Map();
  for (const n of profile.nodes) byId.set(n.id, n);
  const parent = new Map();
  for (const n of profile.nodes) for (const c of (n.children || [])) parent.set(c, n.id);
  const keyCache = new Map();
  const keyOf = (id) => {
    let k = keyCache.get(id);
    if (k) return k;
    const f = byId.get(id).callFrame;
    const file = fileOf(f.url);
    k = { fn: `${f.functionName || '(anon)'}${file ? ` ${file}:${f.lineNumber + 1}` : ''}`, file: file || (/^\(.*\)$/.test(f.functionName) ? f.functionName : '(native)'), name: f.functionName || '' };
    keyCache.set(id, k);
    return k;
  };
  // Stack (leaf to entry point) per node id, cached: keys, and whether the sync spin is on it.
  const stackCache = new Map();
  const stackOf = (id) => {
    let s = stackCache.get(id);
    if (s) return s;
    const keys = []; const seen = new Set(); let sync = false; let entry = null;
    for (let cur = id; cur != null; cur = parent.get(cur)) {
      const k = keyOf(cur);
      if (k.name === '(root)') break;
      if (k.name === SYNC_FN) sync = true;
      entry = k.fn;
      if (!seen.has(k.fn)) { seen.add(k.fn); keys.push(k.fn); }
    }
    s = { keys, sync, entry: entry || '(root)' };
    stackCache.set(id, s);
    return s;
  };

  const samples = profile.samples;
  const deltas = profile.timeDeltas || [];
  const n = samples.length;
  out.sampleCount = n;
  const ts = new Float64Array(n); // ms on the profiler clock
  { let acc = profile.startTime; for (let i = 0; i < n; i++) { acc += deltas[i] || 0; ts[i] = acc / 1000; } }

  // ---- clock alignment ----
  const offsets = [];
  for (const sy of syncs || []) {
    if (!sy || !Number.isFinite(sy.a) || !Number.isFinite(sy.b)) continue;
    offsets.push({ mid: (sy.a + sy.b) / 2, len: sy.b - sy.a, hits: [] });
  }
  if (offsets.length < 2) { out.why = 'clock sync spins missing'; return out; }
  // The spins are far apart (the whole judged window): assign marker samples to the first or second
  // by order, split at the largest gap.
  const marks = [];
  for (let i = 0; i < n; i++) if (stackOf(samples[i]).sync) marks.push(ts[i]);
  if (marks.length < 6) { out.why = `clock sync: only ${marks.length} samples landed in the spins`; return out; }
  let cut = 1; let gap = 0;
  for (let i = 1; i < marks.length; i++) if (marks[i] - marks[i - 1] > gap) { gap = marks[i] - marks[i - 1]; cut = i; }
  const meanOf = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const first = marks.slice(0, cut); const second = marks.slice(cut);
  if (first.length < 3 || second.length < 3) { out.why = `clock sync: spins not both sampled (${first.length}, ${second.length})`; return out; }
  const off0 = meanOf(first) - offsets[0].mid;
  const off1 = meanOf(second) - offsets.at(-1).mid;
  out.clock = { offsetStartMs: +off0.toFixed(2), offsetEndMs: +off1.toFixed(2), disagreeMs: +(off1 - off0).toFixed(2), markSamples: [first.length, second.length] };
  if (Math.abs(off1 - off0) > 3) { out.why = `clock sync: start and end offsets disagree by ${(off1 - off0).toFixed(1)} ms`; return out; }
  const span = Math.max(1, offsets.at(-1).mid - offsets[0].mid);
  const pageMs = (i) => { const rough = ts[i] - off0; const f = Math.min(1, Math.max(0, (rough - offsets[0].mid) / span)); return ts[i] - (off0 + (off1 - off0) * f); };

  // ---- ticks -> frames ----
  const { tn, flags, scr } = ticks;
  const T = tn.length;
  const frameOfTick = new Int32Array(T).fill(-1);
  const bucketOf = (f) => { const r = Math.round(f.ms / refreshMs); return r <= 2 ? 'made30' : r === 3 ? 'three' : 'long'; };
  const BUCKETS = ['all', 'made30', 'three', 'long'];
  const mk = () => ({ frames: 0, intervalMs: 0, cbMs: 0, total: 0, idle: 0, gc: 0, screens: 0, self: new Map(), file: new Map(), incl: new Map(), entry: new Map() });
  const B = Object.fromEntries(BUCKETS.map((b) => [b, mk()]));
  const frameBucket = new Array(frames.length);
  frames.forEach((f, fi) => {
    if (!Number.isInteger(f.i0) || !Number.isInteger(f.i1)) return;
    for (let k = f.i0 + 1; k <= f.i1 && k < T; k++) frameOfTick[k] = fi;
    const b = bucketOf(f); frameBucket[fi] = b;
    for (const name of ['all', b]) { B[name].frames++; B[name].intervalMs += f.ms; B[name].cbMs += f.cb || 0; }
  });
  const add = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
  let used = 0; let droppedNotLive = 0; let droppedNoFrame = 0; let k = 1;
  for (let i = 0; i < n; i++) {
    const p = pageMs(i);
    while (k < T && tn[k] <= p) k++;
    if (k >= T) break;
    if (k < 1 || p < tn[k - 1]) continue; // before the recorder's first tick
    const dt = (deltas[i + 1] ?? deltas[i] ?? 0) / 1000;
    if (!(dt > 0) || dt > 250) continue;
    const seg = (flags[k] >> 1) & 3;
    if (!(liveAt[k] && liveAt[k - 1] && (seg === 1 || seg === 2))) { droppedNotLive += dt; continue; }
    const fi = frameOfTick[k];
    if (fi < 0) { droppedNoFrame += dt; continue; }
    used += dt;
    const leaf = keyOf(samples[i]);
    const st = stackOf(samples[i]);
    for (const name of ['all', frameBucket[fi]]) {
      const b = B[name];
      b.total += dt;
      if (leaf.name === '(idle)') b.idle += dt;
      if (leaf.name === '(garbage collector)') b.gc += dt;
      if (scr && scr[k] > 0) b.screens += dt;
      add(b.self, leaf.fn, dt); add(b.file, leaf.file, dt); add(b.entry, st.entry, dt);
      for (const key of st.keys) add(b.incl, key, dt);
    }
  }
  out.usedMs = +used.toFixed(0); out.droppedNotLiveMs = +droppedNotLive.toFixed(0); out.droppedNoFrameMs = +droppedNoFrame.toFixed(0);
  if (!(B.all.frames > 0) || !(used > 0)) { out.why = 'no live samples landed in a presented frame'; return out; }

  const r2 = (v) => +v.toFixed(2);
  out.buckets = {};
  for (const name of BUCKETS) {
    const b = B[name]; const f = Math.max(1, b.frames);
    out.buckets[name] = { frames: b.frames, intervalMs: r2(b.intervalMs / f), callbackMs: r2(b.cbMs / f), sampledMs: r2(b.total / f), idleMs: r2(b.idle / f),
      busyMs: r2((b.total - b.idle) / f), gcMs: r2(b.gc / f), screenOpenMs: r2(b.screens / f) };
  }
  const table = (field, topAll, topOther) => {
    const keys = new Set();
    const top = (m, c) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, c).map(([key]) => key);
    for (const key of top(B.all[field], topAll)) keys.add(key);
    for (const name of ['three', 'long']) for (const key of top(B[name][field], topOther)) keys.add(key);
    return [...keys].map((key) => {
      const row = { fn: key };
      for (const name of BUCKETS) row[name] = r2((B[name][field].get(key) || 0) / Math.max(1, B[name].frames));
      return row;
    }).sort((a, b) => b.all - a.all);
  };
  out.self = table('self', 70, 30);
  out.byFile = table('file', 40, 15);
  out.inclusive = table('incl', 110, 40);
  out.entryPoints = table('entry', 14, 8);
  out.ok = true;
  return out;
}

export function formatSmoothProfile(p, { title = '' } = {}) {
  if (!p || !p.ok) return `PROFILE NOT MADE: ${p ? p.why : 'no data'}\n`;
  const L = [];
  const pad = (v, w) => String(v).padStart(w);
  const b = p.buckets;
  L.push(`MAIN-THREAD PROFILE, live world only${title ? `: ${title}` : ''}`);
  L.push('All numbers are ms per presented frame. The sampler itself costs a few percent: read shares, not totals; judge the game on an unprofiled run.');
  L.push(`clock: start/end offsets disagree by ${p.clock.disagreeMs} ms (sync samples ${p.clock.markSamples.join(' + ')}); ${p.usedMs} ms of samples used, ${p.droppedNotLiveMs} ms left out as not live (cards, shop, pause, loading), ${p.droppedNoFrameMs} ms outside a judged frame`);
  L.push('');
  L.push(`${'frames by display refreshes taken'.padEnd(36)}${pad('all', 9)}${pad('made 30', 9)}${pad('3 (50ms)', 9)}${pad('4+ long', 9)}`);
  const row = (label, f) => L.push(`${label.padEnd(36)}${pad(f(b.all), 9)}${pad(f(b.made30), 9)}${pad(f(b.three), 9)}${pad(f(b.long), 9)}`);
  row('frames', (x) => x.frames);
  row('presented interval, mean ms', (x) => x.intervalMs);
  row('sampled ms (should match interval)', (x) => x.sampledMs);
  row('  main thread busy', (x) => x.busyMs);
  row('  main thread idle', (x) => x.idleMs);
  row('  of busy: garbage collector', (x) => x.gcMs);
  row('game callback, mean ms (recorder)', (x) => x.callbackMs);
  row('with a UI screen on the stack', (x) => x.screenOpenMs);
  const section = (name, rows, count) => {
    L.push('');
    L.push(name);
    L.push(`${pad('all', 8)}${pad('made30', 8)}${pad('3', 8)}${pad('4+', 8)}  function`);
    for (const r of rows.slice(0, count)) L.push(`${pad(r.all.toFixed(2), 8)}${pad(r.made30.toFixed(2), 8)}${pad(r.three.toFixed(2), 8)}${pad(r.long.toFixed(2), 8)}  ${r.fn}`);
  };
  section('BY ENTRY POINT (what the browser called: frame callback, timers, observers, messages, input)', p.entryPoints, 24);
  section('SELF TIME BY FILE', p.byFile, 50);
  section('SELF TIME BY FUNCTION', p.self, 110);
  section('INCLUSIVE TIME BY FUNCTION (a function and everything it calls)', p.inclusive, 170);
  return `${L.join('\n')}\n`;
}

// ---- trace breakdown (--trace): what the browser itself does around the game's JavaScript ----
// The sampling profile lumps everything outside JavaScript into "(program)". A trace names it:
// style, layout, paint, commit, and whether the compositor or the GPU process is the one saturated.
// Self time per event name on every thread, counted only for events that start in a live judged
// tick, in ms per presented frame. `syncTs` is the trace timestamp (us) of a performance.mark whose
// page time is `syncPageMs`.
export function summarizeSmoothTrace({ events, syncTs, syncPageMs, ticks, liveAt, frames }) {
  const out = { ok: false, why: '' };
  if (!Array.isArray(events) || !events.length) { out.why = 'no trace events'; return out; }
  if (!Number.isFinite(syncTs) || !Number.isFinite(syncPageMs)) { out.why = 'trace clock mark missing'; return out; }
  const off = syncTs / 1000 - syncPageMs;
  const { tn, flags } = ticks; const T = tn.length;
  const inFrame = new Uint8Array(T);
  let frameCount = 0;
  for (const f of frames) { if (!Number.isInteger(f.i0)) continue; frameCount++; for (let k = f.i0 + 1; k <= f.i1 && k < T; k++) inFrame[k] = 1; }
  if (!frameCount) { out.why = 'no frames'; return out; }
  const liveTick = (pageMs) => {
    let lo = 1; let hi = T - 1;
    if (!(pageMs >= tn[0]) || pageMs >= tn[T - 1]) return false;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tn[mid] > pageMs) hi = mid; else lo = mid + 1; }
    const seg = (flags[lo] >> 1) & 3;
    return !!(inFrame[lo] && liveAt[lo] && liveAt[lo - 1] && (seg === 1 || seg === 2));
  };
  const threadName = new Map(); const procName = new Map();
  for (const e of events) {
    if (e.ph !== 'M') continue;
    if (e.name === 'thread_name') threadName.set(`${e.pid}:${e.tid}`, e.args && e.args.name);
    if (e.name === 'process_name') procName.set(e.pid, e.args && e.args.name);
  }
  const byThread = new Map();
  for (const e of events) {
    if (e.ph !== 'X' || !(e.dur > 0)) continue;
    const key = `${e.pid}:${e.tid}`;
    let list = byThread.get(key); if (!list) byThread.set(key, list = []);
    list.push(e);
  }
  const threads = [];
  for (const [key, list] of byThread) {
    list.sort((a, b) => a.ts - b.ts || b.dur - a.dur);
    const self = new Map(); let busy = 0;
    const stack = [];
    const close = (s) => { if (s.live) self.set(s.name, (self.get(s.name) || 0) + Math.max(0, s.dur - s.kids) / 1000); };
    for (const e of list) {
      while (stack.length && stack.at(-1).end <= e.ts) close(stack.pop());
      const live = liveTick(e.ts / 1000 - off);
      if (stack.length) stack.at(-1).kids += e.dur; else if (live) busy += e.dur / 1000;
      const d = (e.args && e.args.data) || {};
      // Name JavaScript by what the browser called, everything else by its event name.
      const name = e.name === 'FunctionCall' || e.name === 'EvaluateScript' || e.name === 'v8.callFunction' ? 'JavaScript'
        : e.name === 'TimerFire' || e.name === 'FireAnimationFrame' || e.name === 'EventDispatch' ? `${e.name}${d.type ? ` ${d.type}` : ''}` : e.name;
      stack.push({ end: e.ts + e.dur, dur: e.dur, kids: 0, name, live });
    }
    while (stack.length) close(stack.pop());
    if (busy <= 0) continue;
    const pid = Number(key.split(':')[0]);
    threads.push({ thread: `${threadName.get(key) || key} (${procName.get(pid) || pid})`, busyMsPerFrame: +(busy / frameCount).toFixed(2),
      self: [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([name, ms]) => ({ name, ms: +(ms / frameCount).toFixed(2) })).filter((r) => r.ms >= 0.03) });
  }
  threads.sort((a, b) => b.busyMsPerFrame - a.busyMsPerFrame);
  out.ok = true; out.frames = frameCount; out.threads = threads.slice(0, 10);
  return out;
}

export function formatSmoothTrace(t, { title = '' } = {}) {
  if (!t || !t.ok) return `TRACE BREAKDOWN NOT MADE: ${t ? t.why : 'no data'}\n`;
  const L = [`BROWSER TRACE, live world only${title ? `: ${title}` : ''}`, `ms per presented frame over ${t.frames} frames; self time by event name, busiest thread first. Tracing itself slows the run: read shares.`];
  for (const th of t.threads) {
    L.push(''); L.push(`${th.thread}: busy ${th.busyMsPerFrame} ms per frame`);
    for (const r of th.self) L.push(`${String(r.ms.toFixed(2)).padStart(9)}  ${r.name}`);
  }
  return `${L.join('\n')}\n`;
}
