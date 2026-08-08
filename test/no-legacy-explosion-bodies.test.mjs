import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { vfx } from '../src/render/vfx.js';
import {
  EXPLOSION_CAUSE_SCHEDULES,
  EXPLOSION_SCHEDULES,
  explosionScheduleFor,
} from '../src/render/combat/phasedExplosions.js';

const source = readFileSync(new URL('../src/render/vfx.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function spriteKind(name) {
  const match = source.match(new RegExp(`const ${name} = (\\d+);`));
  assert.ok(match, `${name} numeric kind must remain inspectable`);
  return Number(match[1]);
}

const SPR_FLASH_KIND = spriteKind('SPR_FLASH');
const SPR_RING_KIND = spriteKind('SPR_RING');

function captureExplosionLifecycle({ dirX, dirZ, reduced = false, serial = 41 }) {
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

test('the phased lifecycle is the only executable explosion implementation', () => {
  assert.doesNotMatch(source, /\n\s*_explodeSmall\s*\(/,
    'remove the unreachable legacy small-ship ring explosion body');
  assert.doesNotMatch(source, /\n\s*_explodeCapital\s*\(/,
    'remove the unreachable legacy capital ring explosion body');

  const start = source.indexOf('  _explode(p, big) {');
  const end = source.indexOf('  // ---- mining beam visual', start);
  assert.ok(start >= 0 && end > start, 'explosion routing seam must remain present');
  const body = source.slice(start, end);
  assert.doesNotMatch(body, /_spawnSprite\(SPR_(?:RING|FLASH)/,
    'routing must queue the phased lifecycle instead of retaining a second unreachable visual body');
});

test('explosion residue uses the irregular smoke role instead of the circular additive glow card', () => {
  const start = source.indexOf("    if (phase === 'residue') {");
  const end = source.indexOf('\n    }\n  },\n\n  _explode', start);
  assert.ok(start >= 0 && end > start, 'residue phase must remain inspectable');
  const body = source.slice(start, end);
  assert.match(body, /_spawnSprite\(SPR_PUFF/,
    'residue remains on the bounded pooled smoke lifecycle');
  assert.match(source, /if \(s\.kind === SPR_PUFF\) \{\s*smokeOrder\[smokeCount\+\+\] = i;/,
    'puff events must enter the bounded far-to-near smoke order');
  assert.match(source, /writeInstancedSpriteFields\(\s*this\._spriteBatches,\s*'smoke'/,
    'ordered puffs must route through the allocation-free irregular smoke bucket writer');
  assert.match(source, /function makeSmokeTexture\(\)/);
});

test('primary rupture and pressure remain non-ring while bright cores stay directional', () => {
  const start = source.indexOf('  _emitExplosionPhase(');
  const end = source.indexOf('  _explode(p, big)', start);
  assert.ok(start >= 0 && end > start, 'phased destruction emitter must remain inspectable');
  const body = source.slice(start, end);
  const ruptureStart = body.indexOf("    if (phase === 'rupture') {");
  const debrisStart = body.indexOf("    if (phase === 'debris') {", ruptureStart);
  const pressureStart = body.indexOf("    if (phase === 'pressure') {", debrisStart);
  const residueStart = body.indexOf("    if (phase === 'residue') {", pressureStart);
  assert.ok(ruptureStart >= 0 && debrisStart > ruptureStart && pressureStart > debrisStart && residueStart > pressureStart);
  assert.doesNotMatch(body.slice(ruptureStart, debrisStart), /SPR_RING/,
    'primary rupture must not rebuild an expanding ring');
  assert.doesNotMatch(body.slice(pressureStart, residueStart), /SPR_RING/,
    'pressure residue must remain paired shears rather than a ring');
  assert.doesNotMatch(body, /Math\.random\(\)/,
    'fixed destruction receipts must retain stable silhouettes across normal-route captures');
  assert.match(body, /phase === 'breakup'/,
    'capital destruction retains a structural breakup stage before rupture');
  assert.match(body, /explosionPattern(?:01|Signed)/,
    'irregular placement comes from the deterministic presentation mixer');

  const normal = captureExplosionLifecycle({ dirX: 1, dirZ: 0 });
  const normalReplay = captureExplosionLifecycle({ dirX: 1, dirZ: 0 });
  const reduced = captureExplosionLifecycle({ dirX: 1, dirZ: 0, reduced: true });
  const reducedReplay = captureExplosionLifecycle({ dirX: 1, dirZ: 0, reduced: true });
  assert.deepEqual(normalReplay, normal,
    'identical normal receipts must replay identical structural calls');
  assert.deepEqual(reducedReplay, reduced,
    'identical reduced receipts must replay identical structural calls');

  const allCalls = [...normal, ...reduced];
  const heatCores = allCalls.filter((call) => (
    call.type === 'sprite' && call.args[0] === SPR_FLASH_KIND
  ));
  assert.ok(heatCores.length > 0);
  assert.ok(heatCores.every((call) => Number(call.args[12]) > 1 && Number.isFinite(call.args[13])),
    'normal and reduced bright cores must use explicit aspect and direction, never circular fallback');
  assert.equal(allCalls.filter((call) => (
    call.type === 'sprite'
    && call.args[0] === SPR_RING_KIND
    && /:(?:rupture|pressure)$/.test(call.phase)
  )).length, 0, 'runtime rupture and pressure must never emit SPR_RING');

  const rotated = captureExplosionLifecycle({ dirX: 0, dirZ: 1 });
  const normalFlashes = normal.filter((call) => call.type === 'sprite' && call.args[0] === SPR_FLASH_KIND);
  const rotatedFlashes = rotated.filter((call) => call.type === 'sprite' && call.args[0] === SPR_FLASH_KIND);
  assert.equal(rotatedFlashes.length, normalFlashes.length);
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
  const normalAxes = explicitAxes(normal);
  const rotatedAxes = explicitAxes(rotated);
  assert.ok(normalAxes.length > 0);
  assert.equal(rotatedAxes.length, normalAxes.length);
  for (let i = 0; i < normalAxes.length; i++) {
    assert.ok(Math.abs(rotatedAxes[i].args[10] + normalAxes[i].args[11]) < 1e-9
      && Math.abs(rotatedAxes[i].args[11] - normalAxes[i].args[10]) < 1e-9,
    `streak axis ${i} must rotate with the receipt direction`);
  }
});

test('causal destruction profiles retain pooled non-ring structural language', () => {
  for (const cause of Object.keys(EXPLOSION_CAUSE_SCHEDULES)) {
    if (cause === 'generic') continue;
    const calls = [];
    const harness = Object.create(vfx);
    harness._burst = 1;
    harness.state = { settings: { video: {}, accessibility: {} } };
    harness.bus = { emit() {} };
    harness._spawnSprite = (...args) => calls.push({ type: 'sprite', args });
    harness._spawnProjectileTrailStreak = (...args) => calls.push({ type: 'streak', args });
    harness._flashLight = (...args) => calls.push({ type: 'light', args });
    const entry = {
      cause, classId: 'ordinary', serial: 9, x: 0, z: 0, radius: 8,
      dirX: 1, dirZ: 0, hasNormal: true, normalX: 0, normalZ: 1,
      targetVelocityX: 4, targetVelocityZ: -2,
    };
    for (const event of explosionScheduleFor('ordinary', cause).events) {
      harness._emitExplosionPhase(event.phase, entry);
    }
    assert.ok(calls.some((call) => call.type === 'streak'), `${cause} retains structural streaks`);
    assert.equal(calls.some((call) => call.type === 'sprite' && call.args[0] === SPR_RING_KIND), false,
      `${cause} must not regain a circular primary ring`);
  }
});
