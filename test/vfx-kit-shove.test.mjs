// The VFX kit and Shove (2026-11-20 VFX rebuild). The rule: a power is LIGHT, MATTER and a FRONT
// that reaches the field's true edge — never semi-opaque cloth ribbons hugging the hull. Energy
// draws additive or premultiplied (it adds light), and the effect's timing has a frame-0 peak.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PowerFx, shoveFrontDelay, SHOVE_FRONT_S, POWER_FIELD_MAX_RADIUS } from '../src/render/vfx/kit/powerFx.js';
import { SparkField, sparkSpec } from '../src/render/vfx/kit/sparkField.js';
import { ShockShell } from '../src/render/vfx/kit/shockShell.js';
import { FieldForcePresentation } from '../src/render/forceLanguage/fieldForcePresentation.js';

function host() {
  const calls = { light: [], distortion: [] };
  return {
    calls,
    toLocal: (x, z, out) => { out.x = x; out.z = z; return out; },
    flashLight: (pos, color, peak, decay, dist) => { calls.light.push({ pos, color, peak, decay, dist }); return true; },
    distortion: (spec) => { calls.distortion.push(spec); },
  };
}
function state(extra = {}) {
  return { simTime: 1, playerId: 1, settings: { video: {}, accessibility: {} }, fields: { active: [] }, entityList: [], ...extra };
}

test('kit energy adds light: sparks are premultiplied (ONE, ONE_MINUS_SRC_ALPHA), fronts additive — never normal-blended cloth', () => {
  const sparks = new SparkField(new THREE.Scene(), { capacity: 8 });
  const shells = new ShockShell(new THREE.Scene(), { capacity: 4 });
  assert.equal(sparks.material.blending, THREE.CustomBlending);
  assert.equal(sparks.material.blendSrc, THREE.OneFactor);
  assert.equal(sparks.material.blendDst, THREE.OneMinusSrcAlphaFactor);
  assert.equal(shells.material.blending, THREE.CustomBlending);
  assert.equal(shells.material.blendSrc, THREE.OneFactor, 'fronts add their full colour (not scaled by a zero alpha)');
  assert.equal(shells.material.blendDst, THREE.OneFactor);
  assert.equal(sparks.material.depthWrite, false);
  sparks.dispose(); shells.dispose();
});

test('Shove casts a light front to the TRUE field edge with a frame-0 peak, sparks, kicked dust and one light', () => {
  const h = host();
  const fx = new PowerFx(new THREE.Scene(), h);
  const s = state();
  fx.update(0, s);
  fx.onFieldDeployed({ fieldId: 'f1', kind: 'repulsor', center: { x: 50, z: -20 }, radius: 170 }, s);
  assert.equal(fx.stats.casts, 1);
  assert.equal(fx.stats.shells, 2, 'a hot lip and a trailing shock');
  const B = fx.shells.arrays[1];
  assert.equal(B[1], 170, 'the front travels to the field radius, not a 48 WU stand-in');
  assert.ok(fx.stats.particles > 120 && fx.stats.particles < 420, `particles within the per-cast budget (${fx.stats.particles})`);
  assert.equal(h.calls.light.length, 1, 'one HeroLight per cast');
  assert.ok(h.calls.light[0].peak >= 8, 'the cast spike is a real flash, not a glow');
  assert.equal(h.calls.distortion.length, 1);
  // Frame 0: the core flash is born at the cast instant (no smoothstep fade-in).
  const A = fx.sparks.arrays[0];
  assert.equal(A[3], fx.time, 'core flash birth is the cast frame');
  fx.dispose();
});

test('a body in the field gets its contact burst exactly when the front reaches it', () => {
  const h = host();
  const fx = new PowerFx(new THREE.Scene(), h);
  const rock = { id: 7, type: 'asteroid', alive: true, pos: { x: 100, z: 0 }, radius: 10 };
  const s = state({ entityList: [{ id: 1, type: 'ship', isPlayer: true, alive: true, pos: { x: 0, z: 0 }, radius: 12 }, rock] });
  fx.update(0, s);
  fx.onFieldDeployed({ fieldId: 'f2', kind: 'repulsor', center: { x: 0, z: 0 }, radius: 170 }, s);
  const expected = fx.time + shoveFrontDelay(90, 170);
  const A = fx.sparks.arrays[0];
  let found = false;
  for (let i = 0; i < fx.sparks.highWater; i++) if (Math.abs(A[i * 4 + 3] - expected) < 1e-6 && A[i * 4] > 80) { found = true; break; }
  assert.ok(found, 'a burst is born at the front arrival time on the facing side of the rock');
  assert.ok(shoveFrontDelay(170, 170) <= SHOVE_FRONT_S + 1e-9 && shoveFrontDelay(0, 170) === 0);
  fx.dispose();
});

test('arena machinery repulsors are not casts; every live repulsor keeps a truthful boundary line that retires', () => {
  const fx = new PowerFx(new THREE.Scene(), host());
  const s = state();
  fx.onFieldDeployed({ fieldId: 'arena', kind: 'repulsor', center: { x: 0, z: 0 }, radius: POWER_FIELD_MAX_RADIUS + 140, planted: true }, s);
  assert.equal(fx.stats.casts, 0);
  s.fields.active = [{ id: 'arena', kind: 'repulsor', center: { x: 0, z: 0 }, radius: 360 }];
  fx.update(0.016, s);
  assert.equal(fx.shells.held.size, 1);
  assert.equal(fx.shells.arrays[1][1], 360, 'the line sits at the true reach');
  s.fields.active = [];
  s.simTime += 0.016; fx.update(0.016, s);
  assert.equal(fx.shells.held.size, 0, 'removal releases the line');
  fx.dispose();
});

test('Shove no longer draws cloth: the field presenter emits no ribbons for a repulsor', () => {
  const owner = new FieldForcePresentation(new THREE.Scene());
  const s = { simTime: 0, settings: { video: {}, accessibility: {} }, massSeed: null,
    fields: { active: [{ id: 'r', kind: 'repulsor', center: { x: 0, z: 0 }, dir: { x: 1, z: 0 }, radius: 170, engaged: false }] } };
  owner.update(0, s); s.simTime = 0.5; owner.update(0.5, s);
  assert.equal(owner.stats.active, 1, 'the field is still tracked (its light and lifecycle stay)');
  assert.equal(owner.batch.count, 0, 'but no folded cloth surface is drawn for it');
  owner.dispose();
});

test('origin rebase moves live particles, fronts and echoes together', () => {
  const fx = new PowerFx(new THREE.Scene(), host());
  const s = state();
  fx.onFieldDeployed({ fieldId: 'f3', kind: 'repulsor', center: { x: 10, z: 10 }, radius: 120 }, s);
  const x0 = fx.sparks.arrays[0][0];
  const sx0 = fx.shells.arrays[0][0];
  fx.reproject(-500, 250);
  assert.equal(fx.sparks.arrays[0][0], x0 - 500);
  assert.equal(fx.shells.arrays[0][0], sx0 - 500);
  assert.equal(fx.echoes.get('f3').x, 10 - 500);
  fx.dispose();
});

test('reduced motion halves the matter and drops the refraction punch', () => {
  const full = new PowerFx(new THREE.Scene(), host());
  full.onFieldDeployed({ fieldId: 'a', kind: 'repulsor', center: { x: 0, z: 0 }, radius: 170 }, state());
  const h = host();
  const calm = new PowerFx(new THREE.Scene(), h);
  calm.onFieldDeployed({ fieldId: 'b', kind: 'repulsor', center: { x: 0, z: 0 }, radius: 170 },
    state({ settings: { video: { motionReduce: true }, accessibility: {} } }));
  assert.ok(calm.stats.particles < full.stats.particles * 0.6);
  assert.equal(h.calls.distortion.length, 0);
  full.dispose(); calm.dispose();
});

test('Pull drains toward a point: a ring falls from the TRUE reach, rim motes carry an inward field term, and the end implodes', () => {
  const h = host();
  const fx = new PowerFx(new THREE.Scene(), h);
  const s = state();
  fx.update(0, s);
  fx.onFieldDeployed({ fieldId: 'w1', kind: 'well', center: { x: 0, z: 0 }, radius: 190 }, s);
  assert.equal(fx.shells.arrays[1][0], 190, 'the first ring starts at the field radius');
  assert.equal(fx.shells.arrays[3][0], 1, 'and contracts (ease-in fall), it does not expand');
  let inward = 0;
  const F = fx.sparks.arrays[5];
  for (let i = 0; i < fx.sparks.highWater; i++) if (F[i * 4 + 2] > 0) inward++;
  assert.ok(inward >= 60, `rim motes fall inward along spiral streamlines (${inward})`);
  assert.equal(h.calls.light.length, 1);
  s.fields.active = [{ id: 'w1', kind: 'well', center: { x: 0, z: 0 }, radius: 190 }];
  for (let i = 0; i < 40; i++) { s.simTime += 0.05; fx.update(0.05, s); }
  assert.equal(fx.wells.size, 1, 'sustained while the field lives');
  s.fields.active = [];
  s.simTime += 0.05; fx.update(0.05, s);
  assert.equal(fx.wells.size, 0, 'released with an implosion when the field ends');
  fx.dispose();
});

test('Bomb is a blast, not a puff: one-frame flash, fireball that cools to soot, front, sparks, one room light', () => {
  const h = host();
  const fx = new PowerFx(new THREE.Scene(), h);
  fx.update(0, state());
  fx.bomb(0, 0, 30, 'c1');
  const C1 = fx.sparks.arrays[4];
  let soot = 0;
  let light = 0;
  for (let i = 0; i < fx.sparks.highWater; i++) { if (C1[i * 4 + 3] >= 0.8) soot++; else if (C1[i * 4 + 3] <= 0.2) light++; }
  assert.ok(soot >= 8, 'dark soot that darkens what is behind it (alpha matter)');
  assert.ok(light >= 60, 'additive fire, sparks and embers');
  assert.ok(fx.sparks.arrays[1][7] <= 0.13, 'the opening flash is a few frames, not a fade');
  assert.equal(h.calls.light.length, 1);
  assert.ok(h.calls.light[0].dist >= 100, 'the flash lights the room, not a 20 WU dot');
  fx.dispose();
});

test('the hose and the cannon look as different as they play: pin-pricks vs a wallop with a ring', () => {
  const h = host();
  const fx = new PowerFx(new THREE.Scene(), h);
  fx.update(0, state());
  fx.gunImpact('hose', 0, 0, 1, 0, false, false);
  const hose = fx.stats.particles;
  assert.ok(hose <= 6, `a hose round is a fizz (${hose} particles)`);
  assert.equal(fx.stats.shells, 0);
  assert.equal(h.calls.light.length, 0, 'no light per hose round');
  fx.gunImpact('thump', 0, 0, 1, 0, false, false);
  assert.ok(fx.stats.particles - hose >= 30, 'the cannon throws a real burst');
  assert.equal(h.calls.light.length, 0, 'the hit receipt owns the contact light; the kit adds the ring, sparks and chips');
  fx.dispose();
});

test('Pin on a body: a bolt travels the real path, and a taut cable is redrawn from the body to its stake', () => {
  const fx = new PowerFx(new THREE.Scene(), host());
  const body = { id: 9, type: 'ship', alive: true, pos: { x: 100, z: 0 }, radius: 10 };
  const s = state({ entities: new Map([[9, body]]), massSeedStakes: { list: [] } });
  fx.update(0, s);
  fx.stakeCast({ targetId: 9, from: { x: 0, z: 0 }, to: { x: 100, z: 0 }, startAt: 1, endAt: 1.11 }, s);
  const A = fx.sparks.arrays[0];
  let last = 0;
  for (let i = 0; i < fx.sparks.highWater; i++) last = Math.max(last, A[i * 4 + 3]);
  assert.ok(Math.abs(last - (fx.time + 0.11)) < 1e-4, 'the bolt head reaches the body when the sim says it lands');
  fx.staked({ targetId: 9, pos: { x: 100, z: 40 } }, s);
  s.massSeedStakes.list = [{ targetId: 9, pos: { x: 100, z: 40 }, started: true }];
  const before = fx.stats.particles;
  s.simTime += 0.016; fx.update(0.016, s);
  assert.ok(fx.stats.particles - before >= 6, 'the cable is drawn between the body and the stake point');
  fx.dispose();
});
