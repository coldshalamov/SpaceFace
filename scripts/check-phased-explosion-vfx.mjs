import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  explosionPattern01,
  EXPLOSION_SCHEDULES,
  PhasedExplosionLifecycle,
} from '../src/render/combat/phasedExplosions.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(ROOT, 'src/render/vfx.js'), 'utf8');
const phaseBlock = source.slice(source.indexOf('  _emitExplosionPhase('), source.indexOf('  _explode(p, big)'));
const ruptureBlock = phaseBlock.slice(phaseBlock.indexOf("phase === 'rupture'"), phaseBlock.indexOf("phase === 'debris'"));
const pressureBlock = phaseBlock.slice(phaseBlock.indexOf("phase === 'pressure'"), phaseBlock.indexOf("phase === 'residue'"));
const ringCount = (pressureBlock.match(/SPR_RING/g) || []).length;

assert.match(source, /_onKilled\(p\)[\s\S]{0,250}_queueExplosion/);
assert.match(source, /_onDestroyed\(p\)[\s\S]{0,900}_explode\(p, false\)/);
assert.ok(ruptureBlock.includes('SPR_COMBUSTION'), 'rupture must use irregular combustion volumes');
assert.ok(ruptureBlock.includes('_spawnProjectileTrailStreak'), 'rupture retains restrained directional tongues');
assert.ok(!ruptureBlock.includes('SPR_RING'), 'rupture primary language must not contain a ring');
assert.equal(ringCount, 0, 'destruction pressure phase must not reintroduce a full circular ring');
assert.ok(pressureBlock.includes('SPR_PUFF') && pressureBlock.includes('for (const side of [-1, 1])'),
  'pressure phase must use paired directional vapor shears');
assert.ok(phaseBlock.includes("phase === 'residue'") && phaseBlock.includes('SPR_PUFF'), 'residue phase required');
assert.ok(phaseBlock.includes('flashOpacityScale'), 'accessibility scaling required');
assert.ok(phaseBlock.includes("phase === 'breakup'"), 'capital structural breakup required before rupture');
assert.ok(!phaseBlock.includes('Math.random()'), 'destruction layout must replay deterministically for a fixed receipt');
assert.ok(!phaseBlock.includes('SPR_FLASH'), 'reduced destruction must not expose a circular flash fallback');
assert.equal(explosionPattern01(21, 'rupture', 3, 4), explosionPattern01(21, 'rupture', 3, 4),
  'presentation pattern must be stable for a fixed serial and phase');

const lifecycle = new PhasedExplosionLifecycle({ capacity: 6 });
const emitted = { small: [], ordinary: [], capital: [] };
for (const classId of Object.keys(emitted)) lifecycle.start({ classId, radius: classId === 'capital' ? 60 : 8 });
for (let i = 0; i < 80; i++) lifecycle.update(0.05, (phase, entry) => emitted[entry.classId].push(phase));
for (const [classId, phases] of Object.entries(emitted)) {
  assert.deepEqual(phases, EXPLOSION_SCHEDULES[classId].events.map((event) => event.phase));
}

const report = {
  schema: 'spaceface.phasedExplosionVfx.v1',
  ok: true,
  capacity: lifecycle.capacity,
  schedules: Object.fromEntries(Object.entries(EXPLOSION_SCHEDULES).map(([id, value]) => [id, value.events])),
  primaryRuptureUsesRings: false,
  pressureLanguage: 'paired-directional-vapor-shears',
  pressureRingCount: ringCount,
  deterministicPresentationPattern: true,
  capitalPreRupturePhases: EXPLOSION_SCHEDULES.capital.events
    .filter((event) => event.phase !== 'rupture' && event.at < 0.64)
    .map((event) => event.phase),
  emitted,
};
const out = resolve(ROOT, '.devshots/graphics/phased-explosion-verify.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, report: out, classes: Object.keys(emitted) }));
