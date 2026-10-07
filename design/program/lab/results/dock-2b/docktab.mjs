import { readFileSync, readdirSync } from 'node:fs';
const dir = process.argv[2];
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const avg = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
console.log('variant         docked   meanDockS  p90DockS  contacts  worstHit  mouthMax  overshootMax  pathMean');
for (const f of files) {
  const r = JSON.parse(readFileSync(`${dir}/${f}`)).runs;
  const d = r.filter((x) => x.docked); const ts = d.map((x) => x.dockS).sort((a, b) => a - b);
  console.log(`${f.replace('.json', '').padEnd(15)} ${String(d.length).padStart(3)}/${r.length}  ${avg(ts).toFixed(2).padStart(8)}  ${(ts[Math.floor(ts.length * 0.9)] ?? NaN).toFixed(2).padStart(8)}  ${String(r.reduce((s, x) => s + x.contacts, 0)).padStart(8)}  ${Math.max(...r.map((x) => x.worstContact)).toFixed(0).padStart(8)}  ${Math.max(...r.map((x) => x.mouthSpeed || 0)).toFixed(0).padStart(8)}  ${Math.max(...r.map((x) => x.overshoot)).toFixed(1).padStart(10)}  ${avg(r.map((x) => x.pathRatio)).toFixed(2)}`);
}
if (process.argv[3]) { const r = JSON.parse(readFileSync(`${dir}/${process.argv[3]}.json`)).runs; for (const x of r) if (x.seed === 1) console.log([x.key, x.docked, x.dockS, x.contacts, x.worstContact, x.mouthSpeed, x.overshoot, x.pathRatio].join(' ')); }
