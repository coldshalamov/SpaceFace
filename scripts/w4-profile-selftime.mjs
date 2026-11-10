// W4 lane: aggregate a V8 .cpuprofile into self-time per function.
// Usage: node scripts/w4-profile-selftime.mjs <file.cpuprofile> [--top N]
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const topArg = process.argv.find((a) => a.startsWith('--top='));
const TOP = topArg ? Number(topArg.slice(6)) : 60;

const prof = JSON.parse(readFileSync(file, 'utf8'));
const interval = prof.sampleInterval || 1000; // microseconds
const nodes = new Map();
for (const n of prof.nodes) nodes.set(n.id, n);

// hitCount per node -> self microseconds
const selfByFunc = new Map();
let totalUs = 0;
for (const n of prof.nodes) {
  const hits = n.hitCount || 0;
  totalUs += hits * interval;
  const cf = n.callFrame;
  const key = `${cf.functionName || '(anonymous)'} @ ${cf.url.replace(/\\/g, '/').split('/').slice(-2).join('/')}:${cf.lineNumber + 1}`;
  selfByFunc.set(key, (selfByFunc.get(key) || 0) + hits * interval);
}

const sorted = [...selfByFunc.entries()].sort((a, b) => b[1] - a[1]);
console.log(`total sampled: ${(totalUs / 1000).toFixed(1)} ms across ${prof.nodes.length} nodes, interval ${interval}us`);
for (const [fn, us] of sorted.slice(0, TOP)) {
  console.log(`${(us / 1000).toFixed(1).padStart(8)} ms  ${((us / totalUs) * 100).toFixed(1).padStart(5)}%  ${fn}`);
}
