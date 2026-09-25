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
  };
}
