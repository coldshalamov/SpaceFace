// Keep a model-truth census regeneration to the rows whose model actually changed.
// `node scripts/model-truth-census.mjs` recomputes every row and float noise in LOD outline deltas
// churns rows nobody touched; this splices only the named rows onto the committed census.
//   node scripts/lib/splice-census-rows.mjs ship_hornet [row ...]
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'src/data/modelTruthCensus.json';
//   node scripts/lib/splice-census-rows.mjs --match=hornet_production_v1   (every row on that model)
const args = process.argv.slice(2);
const matches = args.filter((a) => a.startsWith('--match=')).map((a) => a.slice(8));
const wanted = new Set(args.filter((a) => !a.startsWith('--')));
const fresh = JSON.parse(readFileSync(FILE, 'utf8'));
for (const row of fresh.rows) {
  if (matches.some((m) => String(row.url || '').includes(m))) wanted.add(row.id);
}
const base = JSON.parse(execFileSync('git', ['show', `HEAD:${FILE}`], { encoding: 'utf8', maxBuffer: 1 << 28 }));
const byKey = new Map(fresh.rows.map((row) => [row.id, row]));
base.rows = base.rows.map((row) => (wanted.has(row.id) && byKey.has(row.id) ? byKey.get(row.id) : row));
writeFileSync(FILE, `${JSON.stringify(base, null, 2)}\n`);
console.log(`spliced ${[...wanted].filter((k) => byKey.has(k)).join(', ')} onto HEAD census`);
