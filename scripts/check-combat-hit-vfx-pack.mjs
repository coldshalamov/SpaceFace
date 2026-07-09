/**
 * Structural verify for Top-50 rank-5 combat hit/shield/hull VFX pack.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VFX = resolve(ROOT, 'src/render/vfx.js');
const OUT = resolve(ROOT, '.devshots/slice-A');
const REPORT = resolve(OUT, 'combat_hit_vfx_verify.json');
const src = readFileSync(VFX, 'utf8');
const failures = [];
const assert = (c, m) => { if (!c) failures.push(m); };

const cycles = [
  { id: 1, name: '_onDamage handler', re: /_onDamage\s*\(/ },
  { id: 2, name: 'shield absorbed branch', re: /shieldAbsorbed/ },
  { id: 3, name: 'brokeShield ring flash', re: /brokeShield[\s\S]{0,400}SPR_RING/ },
  { id: 4, name: 'shield hit fresnel', re: /SPR_FRESNEL/ },
  { id: 5, name: 'armor hit sparks elevated', re: /armorHit[\s\S]{0,500}Math\.max\(10/ },
  { id: 6, name: 'hull hit smoke puff', re: /hullHit[\s\S]{0,300}SPR_PUFF/ },
  { id: 7, name: 'hull embers elevated count', re: /hullHit[\s\S]{0,600}k < 7/ },
  { id: 8, name: 'shield break particle floor 14', re: /Math\.max\(14, Math\.round\(24/ },
  { id: 9, name: 'impactSparks helper', re: /_impactSparks/ },
  { id: 10, name: 'camera shake on player hit', re: /camera:shake/ },
];

const cycleResults = cycles.map((c) => {
  const ok = c.re.test(src);
  assert(ok, `cycle ${c.id}: ${c.name}`);
  return { id: c.id, name: c.name, ok };
});

mkdirSync(OUT, { recursive: true });
const report = {
  schema: 'spaceface.combatHitVfxVerify.v1',
  pack: 'combat_hit_vfx',
  rank: 5,
  cycles: cycleResults,
  cyclesPassed: cycleResults.filter((c) => c.ok).length,
  failures,
  ok: failures.length === 0,
};
writeFileSync(REPORT, JSON.stringify(report, null, 2));
writeFileSync(resolve(OUT, 'combat-hit-pack-note.txt'), [
  'Combat hit VFX pack (rank 5)',
  `cycles: ${report.cyclesPassed}/10 ok=${report.ok}`,
  'States: shield hit, shield break, armor sparks, hull smoke/embers, player camera kick',
].join('\n'));

if (!report.ok) {
  console.error('FAIL', failures);
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, cycles: report.cyclesPassed, report: REPORT }, null, 2));
