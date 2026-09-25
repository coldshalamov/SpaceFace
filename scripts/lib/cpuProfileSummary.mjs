// Summarize a V8 .cpuprofile (CDP Profiler.stop result) into self time, inclusive time and
// per-file self time, so a probe can say which functions the main thread actually spent on.
//
// Inclusive time counts a function once per stack even when it recurses (a node is not credited
// again under an ancestor node with the same function key).

function shortUrl(url) {
  const text = String(url || '');
  if (!text) return '';
  const cut = text.replace(/^https?:\/\/[^/]+\//, '').replace(/\?.*$/, '');
  return cut;
}

function fnKey(frame) {
  const name = frame.functionName || '(anonymous)';
  return `${name} ${shortUrl(frame.url)}:${(frame.lineNumber | 0) + 1}`;
}

/**
 * The longest stretches of back-to-back non-idle samples (a long task / long frame), each with the
 * game-source functions that owned most of it. Answers "what paid for the 5 s frame".
 */
export function longestBusyStretches(profile, options = {}) {
  const count = Number.isFinite(options.count) ? options.count : 5;
  const minMs = Number.isFinite(options.minMs) ? options.minMs : 100;
  const nodes = Array.isArray(profile && profile.nodes) ? profile.nodes : [];
  const samples = Array.isArray(profile && profile.samples) ? profile.samples : [];
  const deltas = Array.isArray(profile && profile.timeDeltas) ? profile.timeDeltas : [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const parent = new Map();
  for (const node of nodes) for (const child of node.children || []) parent.set(child, node.id);
  const isIdle = (id) => {
    const name = byId.get(id)?.callFrame?.functionName || '';
    return name === '(idle)';
  };
  const stretches = [];
  let t = Number(profile && profile.startTime) || 0;
  let start = -1;
  let startT = 0;
  for (let i = 0; i <= samples.length; i++) {
    if (i < samples.length) t += Number(deltas[i] || 0);
    const busy = i < samples.length && !isIdle(samples[i]);
    if (busy && start < 0) { start = i; startT = t; }
    if (!busy && start >= 0) {
      const ms = (t - startT) / 1000;
      if (ms >= minMs) stretches.push({ from: start, to: i, ms, atMs: (startT - (Number(profile.startTime) || 0)) / 1000 });
      start = -1;
    }
  }
  stretches.sort((a, b) => b.ms - a.ms);
  return stretches.slice(0, count).map((stretch) => {
    const inclusive = new Map();
    for (let i = stretch.from; i < stretch.to; i++) {
      const dt = Number(deltas[i + 1] ?? deltas[i] ?? 0);
      const seen = new Set();
      for (let cur = samples[i]; cur != null; cur = parent.get(cur)) {
        const frame = byId.get(cur)?.callFrame;
        if (!frame) break;
        const key = fnKey(frame);
        if (seen.has(key)) continue;
        seen.add(key);
        inclusive.set(key, (inclusive.get(key) || 0) + dt);
      }
    }
    // Frame-loop wrappers own every stretch; the interesting rows are one level below them.
    const WRAPPERS = /^(frame|renderUpdate|presentLastCompletedSnapshot|runRenderUpdatePhase|drawPreparedFrame|_renderPostRoute|render|timePassGroup|renderScenePass|advanceSimulation|advance|advanceFixedTimestep|stepSimulation|step|prepareFrame|runFeelAndUi) /;
    const top = [...inclusive.entries()]
      .filter(([key]) => !WRAPPERS.test(key))
      .filter(([key]) => /\bsrc\/|\(program\)|\(garbage collector\)|getProgramParameter|compressedTex|texSubImage|bufferData/.test(key))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([fn, us]) => ({ fn, ms: Math.round(us / 100) / 10 }));
    return { ms: Math.round(stretch.ms), atMs: Math.round(stretch.atMs), top };
  });
}

export function summarizeCpuProfile(profile, options = {}) {
  const top = Number.isFinite(options.top) ? options.top : 30;
  const nodes = Array.isArray(profile && profile.nodes) ? profile.nodes : [];
  const samples = Array.isArray(profile && profile.samples) ? profile.samples : [];
  const deltas = Array.isArray(profile && profile.timeDeltas) ? profile.timeDeltas : [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const parent = new Map();
  for (const node of nodes) for (const child of node.children || []) parent.set(child, node.id);

  // Sample time: each sample's duration is the NEXT delta (V8 convention: delta precedes the sample).
  const selfUs = new Map();
  for (let i = 0; i < samples.length; i++) {
    const dt = Number(deltas[i + 1] ?? deltas[i] ?? 0);
    selfUs.set(samples[i], (selfUs.get(samples[i]) || 0) + Math.max(0, dt));
  }

  const self = new Map();
  const total = new Map();
  const files = new Map();
  let totalUs = 0;
  let idleUs = 0;
  let gcUs = 0;
  let programUs = 0;
  for (const [id, us] of selfUs) {
    const node = byId.get(id);
    if (!node) continue;
    totalUs += us;
    const frame = node.callFrame || {};
    const name = frame.functionName || '';
    if (name === '(idle)') { idleUs += us; continue; }
    if (name === '(garbage collector)') gcUs += us;
    if (name === '(program)') programUs += us;
    const key = fnKey(frame);
    self.set(key, (self.get(key) || 0) + us);
    const file = shortUrl(frame.url) || name;
    files.set(file, (files.get(file) || 0) + us);
    const seen = new Set();
    for (let cur = id; cur != null; cur = parent.get(cur)) {
      const curNode = byId.get(cur);
      if (!curNode) break;
      const curKey = fnKey(curNode.callFrame || {});
      if (seen.has(curKey)) continue;
      seen.add(curKey);
      total.set(curKey, (total.get(curKey) || 0) + us);
    }
  }
  const ms = (us) => Math.round(us / 100) / 10;
  const rank = (map, filter = null) => [...map.entries()]
    .filter(([key]) => !filter || filter.test(key))
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([key, us]) => ({ fn: key, ms: ms(us) }));
  return {
    wallMs: ms(totalUs),
    busyMs: ms(totalUs - idleUs),
    idleMs: ms(idleUs),
    gcMs: ms(gcUs),
    programMs: ms(programUs),
    topSelf: rank(self),
    topTotal: rank(total),
    topTotalInGameSource: rank(total, /\bsrc\//),
    byFile: rank(files),
    longestStretches: longestBusyStretches(profile, { count: options.stretches ?? 5 }),
  };
}
