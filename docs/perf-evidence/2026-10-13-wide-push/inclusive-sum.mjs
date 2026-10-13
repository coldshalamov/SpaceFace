import fs from 'node:fs';
const needles = process.argv[2].split(',');
const dirs = process.argv.slice(3);
for (const dir of dirs) {
  const prof = JSON.parse(fs.readFileSync(`.devshots/main-thread-profile/${dir}/profile.cpuprofile`, 'utf8'));
  const nodes = new Map(prof.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of prof.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const cache = new Map();
  const hits = (id) => {
    if (cache.has(id)) return cache.get(id);
    const set = new Set(); let cur = id;
    while (cur != null) { const cf = nodes.get(cur).callFrame; for (const n of needles) if ((cf.url + ':' + cf.functionName).includes(n)) set.add(n); cur = parent.get(cur); }
    cache.set(id, set); return set;
  };
  const totals = Object.fromEntries(needles.map((n) => [n, 0]));
  for (let i = 0; i < prof.samples.length; i++) {
    const dt = (prof.timeDeltas[i] || 0) / 1000;
    for (const n of hits(prof.samples[i])) totals[n] += dt;
  }
  console.log(dir.padEnd(22), needles.map((n) => `${n.split(':').pop()} ${totals[n].toFixed(0)}ms`).join('  '));
}
