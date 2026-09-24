import { readFileSync } from 'node:fs';
const load = (n) => JSON.parse(readFileSync(`/workspace/spaceface-scratch/r170-cap/${n}/metafile.json`, 'utf8'));
const per = (m) => { const r = {}; for (const [out, o] of Object.entries(m.outputs)) for (const [i, v] of Object.entries(o.inputs)) (r[i] ||= []).push(v.bytesInOutput); for (const k in r) r[k] = r[k].reduce((a, b) => a + b, 0); return r; };
const a = per(load(process.argv[2])), b = per(load(process.argv[3]));
let same = 0; const diffs = [];
for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { if (a[k] === b[k]) same++; else diffs.push([k, a[k] ?? null, b[k] ?? null]); }
console.log('inputs with identical bytesInOutput:', same); for (const d of diffs) console.log('DIFF', ...d);
// chunk grouping: outputs keyed by sorted input list
const groups = (m) => new Set(Object.values(m.outputs).map((o) => Object.keys(o.inputs).sort().join('|')));
const ga = groups(load(process.argv[2])), gb = groups(load(process.argv[3]));
for (const g of ga) if (!gb.has(g)) console.log('ONLY-A chunk inputs:', g.slice(0, 300));
for (const g of gb) if (!ga.has(g)) console.log('ONLY-B chunk inputs:', g.slice(0, 300));
