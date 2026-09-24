// INF-042 — a Well's visual lifecycle agrees with its hazard lifecycle.
//
// A deployed Well or Repulsor builds, sustains, and dissipates: the kernel enforces the
// SAME phase the records publish (strength itself ramps), so no invisible active field and
// no harmful-looking expired one. Pause freezes the spans with simTime; cancellation and
// sector exit remove the field outright. Cone, seed, and unclocked snares stay full-force.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sampleFieldAcceleration } from '../src/core/fields/fieldKernel.js';
import {
  applyFieldLifecycle,
  FIELD_DISSIPATE_S,
  FIELD_WINDUP_S,
  fieldLifecyclePhase,
} from '../src/systems/fields.js';
import { fieldHud } from '../src/ui/fieldHud.js';

const DEPLOYED = 10;
const EXPIRES = 19;

function well(strength = 240) {
  return {
    kind: 'well', center: { x: 0, z: 0 }, radius: 190,
    strength, falloff: 1.6, damping: 0, createdAt: DEPLOYED, expireAt: EXPIRES,
  };
}

test('INF-042: windup, active, and dissipation with the spans fixed', () => {
  assert.equal(FIELD_WINDUP_S, 0.4);
  assert.equal(FIELD_DISSIPATE_S, 0.6);
  assert.deepEqual(fieldLifecyclePhase(DEPLOYED, EXPIRES, DEPLOYED), { phase: 'winding', mult: 0 });
  const half = fieldLifecyclePhase(DEPLOYED, EXPIRES, DEPLOYED + 0.2);
  assert.equal(half.phase, 'winding');
  assert.ok(Math.abs(half.mult - 0.5) < 1e-9, 'half built, half force');
  assert.deepEqual(fieldLifecyclePhase(DEPLOYED, EXPIRES, 12), { phase: 'active', mult: 1 });
  const fading = fieldLifecyclePhase(DEPLOYED, EXPIRES, EXPIRES - 0.3);
  assert.equal(fading.phase, 'dissipating');
  assert.ok(Math.abs(fading.mult - 0.5) < 1e-9, 'half the tail left, half the force');
  assert.deepEqual(fieldLifecyclePhase(null, EXPIRES, 12), { phase: 'active', mult: 1 });
  assert.deepEqual(fieldLifecyclePhase(DEPLOYED, Infinity, 12), { phase: 'active', mult: 1 });
});

test('INF-042: the kernel enforces the published phase on strength itself', () => {
  const list = [well(), { kind: 'repulsor', center: { x: 0, z: 0 }, radius: 170, strength: 300, falloff: 1.6, damping: 0, createdAt: DEPLOYED, expireAt: EXPIRES }];
  applyFieldLifecycle(list, DEPLOYED);
  assert.equal(list[0].strength, 0, 'a building well pulls nothing');
  assert.equal(list[0].lifecyclePhase, 'winding');
  applyFieldLifecycle(list, 12);
  assert.equal(list[0].strength, 240, 'full force from the captured base, not from a scaled value');
  assert.equal(list[0].lifecyclePhase, 'active');
  assert.equal(list[1].strength, 300, 'the repulsor ramps on the same rule');
  applyFieldLifecycle(list, EXPIRES - 0.3);
  assert.ok(list[0].strength > 0 && list[0].strength < 240, 'dissipation throttles, never snaps');
  assert.equal(list[0].lifecyclePhase, 'dissipating');
});

test('INF-042: cone, seed, and unclocked snares stay full-force', () => {
  const list = [
    { kind: 'cone', center: { x: 0, z: 0 }, radius: 100, strength: 150, falloff: 1 },
    { kind: 'well', center: { x: 0, z: 0 }, radius: 190, strength: 240, falloff: 1.6 },
  ];
  applyFieldLifecycle(list, DEPLOYED);
  assert.equal(list[0].strength, 150, 'the sustained cone never ramps');
  assert.equal(list[0].lifecyclePhase, undefined, 'and carries no phase');
  assert.equal(list[1].strength, 240, 'an NPC snare without a deploy clock never ramps');
  applyFieldLifecycle(null, DEPLOYED, 'no list survives');
});

test('INF-042: the sampled hazard IS the published strength', () => {
  const pos = { x: 100, z: 0 };
  const wound = well(0);
  const idle = sampleFieldAcceleration(pos, null, [wound], 12, null, { ax: 0, az: 0 });
  assert.deepEqual(idle, { ax: 0, az: 0 }, 'a building well bends nothing');
  const live = well(240);
  const pull = sampleFieldAcceleration(pos, null, [live], 12, null, { ax: 0, az: 0 });
  assert.ok(pull.ax < 0 && pull.az === 0, 'active pulls toward the center along the bearing');
});

test('INF-042: the pill words the enforced phase, never a fully-armed lie', () => {
  const now = 100;
  const word = (rec) => fieldHud._resolve({ active: [rec] }, now).text;
  assert.match(word({ kind: 'well', expireAt: now + 8, engaged: true, phase: 'winding' }), /FORMING/);
  assert.match(word({ kind: 'well', expireAt: now + 8, engaged: true, phase: 'dissipating' }), /FADING/);
  assert.match(word({ kind: 'well', expireAt: now + 8, engaged: true }), /ENGAGED/, 'phaseless records read as before');
  assert.match(word({ kind: 'well', expireAt: now + 8, engaged: false, phase: 'active' }), /ARMED/);
  const repulsor = fieldHud._resolve({ active: [{ kind: 'repulsor', expireAt: now + 8, engaged: true, phase: 'active' }] }, now);
  assert.match(repulsor.text, /REPULSOR/);
  assert.equal(repulsor.cls, 'field-repulsor');
});
