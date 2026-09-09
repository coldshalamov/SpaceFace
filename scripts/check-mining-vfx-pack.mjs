/**
 * Structural verify for Top-50 rank-9 mining VFX pack.
 * States: beam start/stop, tick spray, yield/ore chunks, ore tint.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VFX = resolve(ROOT, 'src/render/vfx.js');
const OUT = resolve(ROOT, '.devshots/slice-A');
const REPORT = resolve(OUT, 'mining_vfx_verify.json');

const failures = [];
const assert = (c, m) => { if (!c) failures.push(m); };
const src = readFileSync(VFX, 'utf8');

const cycles = [
  { id: 1, name: 'mining start handler', re: /_onMiningStart/ },
  { id: 2, name: 'mining stop handler', re: /_onMiningStop/ },
  { id: 3, name: 'mining beam init ribbon', re: /_initMiningBeam/ },
  { id: 4, name: 'mining beam update pulse', re: /_updateMiningBeam/ },
  { id: 5, name: 'mining tick contact spray', re: /_onMiningTick/ },
  { id: 6, name: 'mining yield burst', re: /_onMiningYield/ },
  { id: 7, name: 'ore-tinted beam color', re: /oreColor|beam\.color/ },
  { id: 8, name: 'rank9 denser tick spray', re: /Math\.max\(12, Math\.round\(22/ },
  { id: 9, name: 'rank9 ore chunk fragments', re: /chunkN|Chunky ore fragments/ },
  { id: 10, name: 'events wired mining:yield', re: /mining:yield/ },
];

const cycleResults = cycles.map((c) => {
  const ok = c.re.test(src);
  assert(ok, `cycle ${c.id}: ${c.name}`);
  return { id: c.id, name: c.name, ok };
});

mkdirSync(OUT, { recursive: true });
const report = {
  schema: 'spaceface.miningVfxVerify.v1',
  pack: 'mining_vfx',
  rank: 9,
  cycles: cycleResults,
  cyclesPassed: cycleResults.filter((c) => c.ok).length,
  failures,
  ok: failures.length === 0,
};
writeFileSync(REPORT, JSON.stringify(report, null, 2));
writeFileSync(resolve(OUT, 'mining-pack-note.txt'), [
  'Mining VFX pack (rank 9)',
  `cycles: ${report.cyclesPassed}/10 ok=${report.ok}`,
  'States: beam start/stop, tick spray+chips, yield burst+chunks, ore tint',
].join('\n'));

if (!report.ok) {
  console.error('FAIL', failures);
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, cycles: report.cyclesPassed, report: REPORT }, null, 2));
