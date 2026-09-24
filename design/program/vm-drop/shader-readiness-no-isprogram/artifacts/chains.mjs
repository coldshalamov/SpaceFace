import fs from 'fs';
const [f, re, depth = '6', t0 = '0', t1 = '1e9'] = process.argv.slice(2);
const p = JSON.parse(fs.readFileSync(f));
const byId = new Map(); for (const n of p.nodes) byId.set(n.id, n);
const parent = new Map(); for (const n of p.nodes) for (const c of (n.children || [])) parent.set(c, n.id);
const key = (n) => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-1)[0]}:${n.callFrame.lineNumber + 1}`;
const R = new RegExp(re); const agg = new Map(); let t = p.startTime;
for (let i = 0; i < p.samples.length; i++) {
  t += p.timeDeltas[i]; const rel = (t - p.startTime) / 1e6; if (rel < +t0 || rel > +t1) continue;
  const dt = (p.timeDeltas[i + 1] || p.timeDeltas[i]) / 1000;
  let id = p.samples[i]; if (!R.test(key(byId.get(id)))) continue;
  const chain = []; id = parent.get(id);
  while (id != null && chain.length < +depth) { const n = byId.get(id); const k = key(n); if (!/three\.module|^\(root\)|^\(anon\) :0/.test(k)) chain.push(k); id = parent.get(id); }
  const c = chain.join(' < '); agg.set(c, (agg.get(c) || 0) + dt);
}
for (const [k, v] of [...agg].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(v.toFixed(0).padStart(7), k);
