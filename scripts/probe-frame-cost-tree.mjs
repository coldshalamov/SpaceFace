// Drill into a .cpuprofile written by scripts/probe-frame-cost.mjs: for every stack that passes
// through a function whose name matches --fn, attribute time to its direct callees (inclusive)
// and to the leaf functions underneath it (self). Times are ms per wall second of the profile.
//   node scripts/probe-frame-cost-tree.mjs <file.cpuprofile> --fn=setProgram [--top=30]
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const arg = (n, d) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const FN = new RegExp(arg('fn', 'render'));
const TOP = Number(arg('top', 30));
const p = JSON.parse(readFileSync(file, 'utf8'));
const byId = new Map(p.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of p.nodes) for (const c of (n.children || [])) parent.set(c, n.id);
const keyOf = (n) => `${n.callFrame.functionName || '(anon)'} ${(n.callFrame.url || '').replace(/^.*\/(src|vendor)\//, '$1/')}:${n.callFrame.lineNumber + 1}`;
const callees = new Map();
const leaves = new Map();
let inside = 0;
for (let i = 0; i < p.samples.length; i++) {
  const dt = (p.timeDeltas[i + 1] ?? p.timeDeltas[i] ?? 0) / 1000;
  const chain = [];
  for (let id = p.samples[i]; id != null; id = parent.get(id)) chain.push(byId.get(id));
  // chain[0] is the leaf; find the OUTERMOST matching frame.
  let at = -1;
  for (let j = chain.length - 1; j >= 0; j--) if (FN.test(chain[j].callFrame.functionName || '')) { at = j; break; }
  if (at < 0) continue;
  inside += dt;
  const callee = at > 0 ? keyOf(chain[at - 1]) : '(self)';
  callees.set(callee, (callees.get(callee) || 0) + dt);
  const leaf = keyOf(chain[0]);
  leaves.set(leaf, (leaves.get(leaf) || 0) + dt);
}
const per = (ms) => (ms / (p.wallMs || (p.endTime - p.startTime) / 1000) * 1000).toFixed(1).padStart(7);
console.log(`${FN}: ${per(inside)} ms/s inclusive`);
console.log('-- direct callees');
for (const [k, v] of [...callees].sort((a, b) => b[1] - a[1]).slice(0, TOP)) console.log(per(v), k);
console.log('-- leaves');
for (const [k, v] of [...leaves].sort((a, b) => b[1] - a[1]).slice(0, TOP)) console.log(per(v), k);
