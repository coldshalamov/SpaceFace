/**
 * Structural verify for Top-50 rank-10 Helios sky/lighting kit.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECTOR_PALETTE_CLASSES } from '../src/data/sectors.js';
import { SECTOR_PALETTES } from '../src/data/palettes.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, '.devshots/slice-A');
const REPORT = resolve(OUT, 'helios_sky_verify.json');
const SB = readFileSync(resolve(ROOT, 'src/render/spaceBackground.js'), 'utf8');

const failures = [];
const assert = (c, m) => { if (!c) failures.push(m); };

const core = SECTOR_PALETTE_CLASSES.core;
const helios = SECTOR_PALETTES.sector_helios_prime;

const cycles = [
  { id: 1, name: 'core palette exists', ok: !!core && Number.isFinite(core.fogDensity) },
  { id: 2, name: 'core nebulaTint present', ok: Number.isFinite(core.nebulaTint) },
  { id: 3, name: 'helios SECTOR_PALETTES entry', ok: !!helios && helios.skyColor },
  { id: 4, name: 'helios sunIntensity elevated', ok: helios.sunIntensity >= 1.2 },
  { id: 5, name: 'helios starDensity elevated', ok: helios.starDensity >= 0.95 },
  { id: 6, name: 'AZURE sky palette in spaceBackground', ok: /AZURE:\s*\{/.test(SB) },
  { id: 7, name: 'core class maps to AZURE', ok: /core:\s*'AZURE'/.test(SB) },
  { id: 8, name: 'richer AZURE emission', ok: /emission: '#3d9ad4'|emission: "#3d9ad4"/.test(SB) },
  { id: 9, name: 'sector palette transition in renderer', ok: /createSectorPaletteRig/.test(readFileSync(resolve(ROOT, 'src/render/renderer.js'), 'utf8')) },
  { id: 10, name: 'core fog density bounded', ok: core.fogDensity > 0 && core.fogDensity < 0.001 },
];

const cycleResults = cycles.map((c) => {
  assert(c.ok, `cycle ${c.id}: ${c.name}`);
  return { id: c.id, name: c.name, ok: c.ok };
});

mkdirSync(OUT, { recursive: true });
const report = {
  schema: 'spaceface.heliosSkyVerify.v1',
  pack: 'helios_sky_lighting_kit',
  rank: 10,
  core,
  helios,
  cycles: cycleResults,
  cyclesPassed: cycleResults.filter((c) => c.ok).length,
  failures,
  ok: failures.length === 0,
};
writeFileSync(REPORT, JSON.stringify(report, null, 2));
writeFileSync(resolve(OUT, 'helios-sky-note.txt'), [
  'Helios sky/lighting kit (rank 10)',
  `sunIntensity=${helios.sunIntensity} starDensity=${helios.starDensity}`,
  `cycles: ${report.cyclesPassed}/10 ok=${report.ok}`,
].join('\n'));

if (!report.ok) {
  console.error('FAIL', failures);
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, cycles: report.cyclesPassed, report: REPORT }, null, 2));
