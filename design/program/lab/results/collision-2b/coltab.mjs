import { readFileSync, readdirSync } from 'node:fs';
const dir = process.argv[2]; const ang = process.argv[3] ?? '0';
const runs = readdirSync(dir).filter((f) => f.endsWith('.json')).flatMap((f) => JSON.parse(readFileSync(`${dir}/${f}`)).runs);
const g = new Map();
for (const r of runs) { if (r.cruise) continue; const k = r.key; if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
const avg = (a, f) => { const v = a.map(f).filter((x) => x != null && Number.isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const f = (x, d = 2) => x == null ? '  -  ' : x.toFixed(d);
let last = '';
for (const [k, a] of [...g].sort()) {
  const [m, t, v, an] = k.split('|'); if (ang !== 'all' && an !== ang) continue;
  if (m + t !== last) { console.log(`\n${m} -> ${t}   v  ang | pre    e     spin  ctl     helmS dmg   kill tgtDmg hit`); last = m + t; }
  console.log(`${''.padEnd(m.length + t.length + 4)} ${v.padStart(3)} ${an.padStart(3)} | ${f(avg(a, (r) => r.pre), 0).padStart(5)} ${f(avg(a, (r) => r.restitution))} ${f(avg(a, (r) => r.spin))} ${(a[0].control || '').padEnd(7)} ${f(avg(a, (r) => r.helmS))} ${f(avg(a, (r) => r.dmgFrac))} ${a.filter((r) => r.killed).length}/${a.length} ${f(avg(a, (r) => r.tgtDmgFrac))} ${a.filter((r) => r.hit).length}`);
}
for (const r of runs.filter((r) => r.cruise)) console.log(JSON.stringify(r));
