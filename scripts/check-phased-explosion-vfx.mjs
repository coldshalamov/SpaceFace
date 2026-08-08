import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EXPLOSION_CAUSE_SCHEDULES,
  EXPLOSION_SCHEDULES,
  explosionScheduleFor,
  PhasedExplosionLifecycle,
} from '../src/render/combat/phasedExplosions.js';
import { vfx } from '../src/render/vfx.js';

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

// SPR_FLASH is a pooled substrate, not inherently a circular fallback: explicit aspect + roll turn
// the compact ignition/rupture cores into directional heat slashes. Drive the real phase renderer so
// the check rejects circular cards without banning the accepted bright-core structure by token name.
const spriteKind = (name) => {
  const match = source.match(new RegExp(`const ${name} = (\\d+);`));
  assert.ok(match, `${name} numeric kind must remain inspectable`);
  return Number(match[1]);
};
const SPR_FLASH_KIND = spriteKind('SPR_FLASH');
const SPR_RING_KIND = spriteKind('SPR_RING');

function captureStructuralCalls({ dirX, dirZ, reduced = false, serial = 31 }) {
  const calls = [];
  let phaseLabel = null;
  const harness = Object.create(vfx);
  harness._burst = 1;
  harness.state = {
    settings: { video: { motionReduce: reduced }, accessibility: { flashReduce: reduced } },
  };
  harness.bus = { emit: () => {} };
  harness._spawnSprite = (...args) => calls.push({ type: 'sprite', phase: phaseLabel, args });
  harness._spawnProjectileTrailStreak = (...args) => calls.push({ type: 'streak', phase: phaseLabel, args });
  harness._impactParticleCone = (...args) => calls.push({ type: 'cone', phase: phaseLabel, args });
  harness._flashLight = (...args) => calls.push({ type: 'light', phase: phaseLabel, args });
  for (const [classId, scheduleDef] of Object.entries(EXPLOSION_SCHEDULES)) {
    for (const event of scheduleDef.events) {
      phaseLabel = `${classId}:${event.phase}`;
      harness._emitExplosionPhase(event.phase, {
        classId, serial, x: 0, z: 0, radius: classId === 'capital' ? 60 : 8, dirX, dirZ,
      });
    }
  }
  return calls;
}

const normalCalls = captureStructuralCalls({ dirX: 1, dirZ: 0 });
const normalReplay = captureStructuralCalls({ dirX: 1, dirZ: 0 });
const reducedCalls = captureStructuralCalls({ dirX: 1, dirZ: 0, reduced: true });
const reducedReplay = captureStructuralCalls({ dirX: 1, dirZ: 0, reduced: true });
assert.deepEqual(normalReplay, normalCalls,
  'two identical normal receipts must produce identical structural calls');
assert.deepEqual(reducedReplay, reducedCalls,
  'two identical reduced receipts must produce identical structural calls');

const allLifecycleCalls = [...normalCalls, ...reducedCalls];
const phaseFlashCalls = allLifecycleCalls
  .filter((call) => call.type === 'sprite' && call.args[0] === SPR_FLASH_KIND);
assert.ok(phaseFlashCalls.length > 0, 'destruction must retain compact bright heat cores');
assert.ok(phaseFlashCalls.every((call) => Number(call.args[12]) > 1 && Number.isFinite(call.args[13])),
  'destruction heat cores must be explicitly anisotropic and direction-locked, never circular fallbacks');

const rupturePressureRings = allLifecycleCalls.filter((call) => (
  call.type === 'sprite'
  && call.args[0] === SPR_RING_KIND
  && /:(?:rupture|pressure)$/.test(call.phase)
));
assert.equal(rupturePressureRings.length, 0,
  'runtime rupture and pressure phases must never emit SPR_RING');

const rotatedCalls = captureStructuralCalls({ dirX: 0, dirZ: 1 });
const normalFlashes = normalCalls.filter((call) => call.type === 'sprite' && call.args[0] === SPR_FLASH_KIND);
const rotatedFlashes = rotatedCalls.filter((call) => call.type === 'sprite' && call.args[0] === SPR_FLASH_KIND);
assert.equal(rotatedFlashes.length, normalFlashes.length, 'rotation probe must preserve heat-core count');
for (let i = 0; i < normalFlashes.length; i++) {
  const delta = Math.atan2(
    Math.sin(rotatedFlashes[i].args[13] - normalFlashes[i].args[13]),
    Math.cos(rotatedFlashes[i].args[13] - normalFlashes[i].args[13]),
  );
  assert.ok(Math.abs(delta - Math.PI / 2) < 1e-9,
    `heat-core roll ${i} must rotate with the receipt direction`);
}
const explicitAxes = (calls) => calls.filter((call) => (
  call.type === 'streak' && Number.isFinite(call.args[10]) && Number.isFinite(call.args[11])
));
const normalAxes = explicitAxes(normalCalls);
const rotatedAxes = explicitAxes(rotatedCalls);
assert.ok(normalAxes.length > 0, 'destruction must retain explicit directional streak axes');
assert.equal(rotatedAxes.length, normalAxes.length, 'rotation probe must preserve explicit streak-axis count');
for (let i = 0; i < normalAxes.length; i++) {
  assert.ok(Math.abs(rotatedAxes[i].args[10] + normalAxes[i].args[11]) < 1e-9
    && Math.abs(rotatedAxes[i].args[11] - normalAxes[i].args[10]) < 1e-9,
  `streak axis ${i} must rotate 90 degrees with the receipt direction`);
}

const lifecycle = new PhasedExplosionLifecycle({ capacity: 6 });
const emitted = { small: [], ordinary: [], capital: [] };
for (const classId of Object.keys(emitted)) lifecycle.start({ classId, radius: classId === 'capital' ? 60 : 8 });
for (let i = 0; i < 80; i++) lifecycle.update(0.05, (phase, entry) => emitted[entry.classId].push(phase));
for (const [classId, phases] of Object.entries(emitted)) {
  assert.deepEqual(phases, EXPLOSION_SCHEDULES[classId].events.map((event) => event.phase));
}

const causeEmitted = {};
const causeSignatures = new Set();
for (const cause of Object.keys(EXPLOSION_CAUSE_SCHEDULES)) {
  const causeLifecycle = new PhasedExplosionLifecycle({ capacity: 1 });
  const phases = [];
  causeLifecycle.start({ classId: 'ordinary', cause, direction: { x: 1, z: 0 } });
  for (let i = 0; i < 80; i++) causeLifecycle.update(0.05, (phase) => phases.push(phase));
  const schedule = explosionScheduleFor('ordinary', cause);
  assert.deepEqual(phases, schedule.events.map((event) => event.phase));
  const signature = schedule.events.map((event) => `${event.phase}@${event.at}`).join('|');
  causeSignatures.add(signature);
  causeEmitted[cause] = phases;
}
assert.equal(causeSignatures.size, Object.keys(EXPLOSION_CAUSE_SCHEDULES).length,
  'all causal profiles require distinct temporal signatures');

const report = {
  schema: 'spaceface.phasedExplosionVfx.v1',
  ok: true,
  capacity: lifecycle.capacity,
  schedules: Object.fromEntries(Object.entries(EXPLOSION_SCHEDULES).map(([id, value]) => [id, value.events])),
  causeSchedules: Object.fromEntries(Object.entries(EXPLOSION_CAUSE_SCHEDULES)
    .map(([id, value]) => [id, value.events])),
  primaryRuptureUsesRings: false,
  pressureLanguage: 'paired-directional-vapor-shears',
  pressureRingCount: ringCount,
  directionalHeatCores: phaseFlashCalls.length,
  deterministicPresentationPattern: true,
  deterministicStructuralReplay: true,
  directionRotationCalls: { heatCores: normalFlashes.length, explicitAxes: normalAxes.length },
  capitalPreRupturePhases: EXPLOSION_SCHEDULES.capital.events
    .filter((event) => event.phase !== 'rupture' && event.at < 0.64)
    .map((event) => event.phase),
  emitted,
  causeEmitted,
};
const out = resolve(ROOT, '.devshots/graphics/phased-explosion-verify.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  ok: true,
  report: out,
  classes: Object.keys(emitted),
  causes: Object.keys(causeEmitted),
}));
