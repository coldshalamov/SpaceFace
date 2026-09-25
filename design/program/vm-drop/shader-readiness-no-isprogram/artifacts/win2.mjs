import fs from 'fs';
const [f, t0s = '0', t1s = '15', mode = 'self'] = process.argv.slice(2);
const p = JSON.parse(fs.readFileSync(f));
const byId = new Map(); for (const n of p.nodes) byId.set(n.id, n);
const parent = new Map(); for (const n of p.nodes) for (const c of (n.children || [])) parent.set(c, n.id);
const key = (n) => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-1)[0]}:${n.callFrame.lineNumber + 1}`;
let t = p.startTime; const self = new Map(), incl = new Map(); let total = 0, idle = 0;
for (let i = 0; i < p.samples.length; i++) {
  t += p.timeDeltas[i]; const rel = (t - p.startTime) / 1e6; if (rel < +t0s || rel > +t1s) continue;
  const dt = (p.timeDeltas[i + 1] || p.timeDeltas[i]) / 1000; total += dt;
  let id = p.samples[i]; const k = key(byId.get(id)); if (k.startsWith('(idle)')) { idle += dt; continue; }
  self.set(k, (self.get(k) || 0) + dt);
  const seen = new Set(); while (id != null) { const kk = key(byId.get(id)); if (!seen.has(kk)) { seen.add(kk); incl.set(kk, (incl.get(kk) || 0) + dt); } id = parent.get(id); }
}
console.log(`window ${t0s}-${t1s}s total ${total.toFixed(0)} ms idle ${idle.toFixed(0)} ms`);
const m = mode === 'self' ? self : incl;
for (const [k, v] of [...m].sort((a, b) => b[1] - a[1]).slice(0, +(process.env.TOP || 40))) console.log(v.toFixed(1).padStart(9), k);
