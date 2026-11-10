// scripts/prof-crucible-summarize.mjs — summarize a .cpuprofile by self time (perf lane, disposable).
// Dedupes by call-frame key (a function at many call paths is ONE cost), prints line-level
// positionTicks for the top functions.
import { readFileSync } from 'node:fs';
const file = process.argv[2] || '.devshots/pq13304-prof/seed13502.cpuprofile';
const topN = parseInt(process.argv[3] || '45', 10);
const p = JSON.parse(readFileSync(file, 'utf8'));
const { nodes, samples, timeDeltas } = p;
const byId = new Map(nodes.map((n) => [n.id, n]));
const agg = new Map(); // frameKey -> {us, frame, node}
let total = 0;
for (let i = 0; i < samples.length; i++) {
  const n = byId.get(samples[i]);
  if (!n) continue;
  const dt = timeDeltas[i] || 0;
  total += dt;
  const f = n.callFrame;
  const url = (f.url || '').replace(/^file:\/\/\/?/, '').split(/[\\/]/).slice(-2).join('/');
  const key = `${f.functionName || '(anon)'} [${url}:${f.lineNumber + 1}]`;
  let e = agg.get(key);
  if (!e) { e = { us: 0, frame: f, node: n, key }; agg.set(key, e); }
  e.us += dt;
}
const top = [...agg.values()].sort((a, b) => b.us - a.us).slice(0, topN);
console.log(`total sampled: ${(total / 1000).toFixed(0)} ms`);
for (const e of top) {
  console.log(`${(e.us / 1000).toFixed(1).padStart(9)} ms  ${(100 * e.us / total).toFixed(1).padStart(5)}%  ${e.key}`);
  if (e.node.positionTicks && e.node.positionTicks.length) {
    const lines = e.node.positionTicks.slice().sort((a, b) => b.ticks - a.ticks).slice(0, 8)
      .map((pt) => `L${e.frame.lineNumber + 1 + pt.line}:${pt.ticks}`).join(' ');
    console.log(`${' '.repeat(21)}${lines}`);
  }
}
