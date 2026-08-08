import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { vfx } from '../src/render/vfx.js';
import { EXPLOSION_SCHEDULES } from '../src/render/combat/phasedExplosions.js';

const source = readFileSync(new URL('../src/render/vfx.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

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

  const harness = Object.create(vfx);
  harness._burst = 1;
  harness.state = { settings: { video: { motionReduce: false }, accessibility: { flashReduce: false } } };
  harness.bus = { emit: () => {} };
  harness._flashLight = () => {};
  harness._spawnProjectileTrailStreak = () => {};
  harness._impactParticleCone = () => {};
  const heatCores = [];
  harness._spawnSprite = (...args) => { if (args[0] === 0) heatCores.push(args); };
  for (const reduced of [false, true]) {
    harness.state.settings.video.motionReduce = reduced;
    harness.state.settings.accessibility.flashReduce = reduced;
    for (const [classId, scheduleDef] of Object.entries(EXPLOSION_SCHEDULES)) {
      for (const event of scheduleDef.events) {
        harness._emitExplosionPhase(event.phase, {
          classId, serial: 41, x: 0, z: 0, radius: classId === 'capital' ? 60 : 8,
          dirX: 0.8, dirZ: 0.6,
        });
      }
    }
  }
  assert.ok(heatCores.length > 0);
  assert.ok(heatCores.every((args) => Number(args[12]) > 1 && Number.isFinite(args[13])),
    'normal and reduced bright cores must use explicit aspect and direction, never circular fallback');
});
