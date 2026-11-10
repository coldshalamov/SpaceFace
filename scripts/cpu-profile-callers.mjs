// Who called a function in a V8 .cpuprofile, with inclusive time per caller chain.
//   node scripts/cpu-profile-callers.mjs <file.cpuprofile> <functionName> [depth]
// Pair with `node scripts/probe-frame-solid.mjs --cpu-profile`.
import { readFileSync } from 'node:fs';
const [file, target, depthArg] = process.argv.slice(2);
const depth = Number(depthArg) || 6;
const p = JSON.parse(readFileSync(file, 'utf8'));
const byId = new Map(p.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of p.nodes) for (const c of n.children || []) parent.set(c, n.id);
const self = new Map();
for (let i = 0; i < p.samples.length; i++) {
  const dt = p.timeDeltas[i + 1] ?? p.timeDeltas[i] ?? 0;
  self.set(p.samples[i], (self.get(p.samples[i]) || 0) + dt);
}
const key = (f) => `${f.functionName || '(anon)'} ${(f.url || '').replace(/^https?:\/\/[^/]+\//, '').replace(/\?.*/, '')}:${f.lineNumber + 1}`;
const agg = new Map();
let total = 0;
for (const [id, us] of self) {
  const chain = [];
  for (let n = byId.get(id); n; n = byId.get(parent.get(n.id))) chain.push(n);
  const idx = chain.findIndex((x) => x.callFrame.functionName === target);
  if (idx < 0) continue;
  total += us;
  const up = chain.slice(idx, idx + depth).map((x) => key(x.callFrame)).join('\n      <- ');
  agg.set(up, (agg.get(up) || 0) + us);
}
console.log(`${target}: ${Math.round(total / 1000)} ms inclusive`);
for (const [k, v] of [...agg].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`  ${Math.round(v / 1000)}ms ${k}`);
}
