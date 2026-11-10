import fs from 'fs';
const [f, re] = process.argv.slice(2);
const p = JSON.parse(fs.readFileSync(f));
const byId = new Map(); for (const n of p.nodes) byId.set(n.id, n);
const parent = new Map(); for (const n of p.nodes) for (const c of (n.children || [])) parent.set(c, n.id);
const key = (n) => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-1)[0]}:${n.callFrame.lineNumber + 1}`;
const R = new RegExp(re); const leaf = new Map();
for (let i = 0; i < p.samples.length; i++) {
  const dt = (p.timeDeltas[i + 1] || p.timeDeltas[i]) / 1000;
  let id = p.samples[i]; const lk = key(byId.get(id)); let hit = false;
  while (id != null) { if (R.test(key(byId.get(id)))) { hit = true; break; } id = parent.get(id); }
  if (hit) leaf.set(lk, (leaf.get(lk) || 0) + dt);
}
for (const [k, v] of [...leaf].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(v.toFixed(1).padStart(8), k);
