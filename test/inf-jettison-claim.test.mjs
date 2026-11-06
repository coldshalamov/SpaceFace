// inf-jettison-claim — the pod YOU jettison reads as yours-just-lost, then goes public.
//
// The player story: a deliberate dump spawns the pod aft at eject speed, stamps it yours
// (`data.playerJettisonOrigin`, only when the owner is this player) and embargoes the
// re-pickup for a brief window (`data.pickupEmbargoUntil`) — the sim refuses the re-scoop.
// The picture contradicted both: the pod joined anonymous drift the same frame, a dark
// canister whose only light is a static shared transponder material, indistinguishable
// from any other drifting payload. Now the pod's own transponder carries the claim window
// (a per-pod cloned material, the mayday-lamp grammar): a hot parting beat as it clears
// your hold, easing into a steady claim burn while the embargo runs, then relaxing to the
// anonymous read exactly when the sim makes the pod public.
//
// These tests pin the pure decision layer (resolveJettisonClaimBurn in
// src/render/ordnanceMotionPresentation.js) plus the wiring pins for the factory hand-off.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  JETTISON_CLAIM_STEADY_GAIN,
  JETTISON_CLAIM_SPIKE_GAIN,
  JETTISON_CLAIM_SPIKE_DECAY,
  resolveJettisonClaimBurn,
} from '../src/render/ordnanceMotionPresentation.js';

const BASE = 0.8; // the shared transponder's authored emissiveIntensity

test('the claim burns: a hot parting beat easing into a steady claim burn', () => {
  const until = 100;
  const atSpawn = resolveJettisonClaimBurn(98, 0, until, false, BASE);
  assert.equal(atSpawn, BASE + JETTISON_CLAIM_STEADY_GAIN + JETTISON_CLAIM_SPIKE_GAIN,
    'the parting beat peaks as the pod clears the hold');
  const settled = resolveJettisonClaimBurn(99.2, 1.2, until, false, BASE);
  assert.ok(settled > BASE && settled < atSpawn, 'the spike decays below its peak');
  assert.ok(Math.abs(settled - (BASE + JETTISON_CLAIM_STEADY_GAIN)) < 0.25,
    'after ~1s the burn sits at the steady claim level');
  const steady = BASE + JETTISON_CLAIM_STEADY_GAIN;
  const tail = resolveJettisonClaimBurn(99.9, 1.9, until, false, BASE);
  assert.ok(Math.abs(tail - steady) < Math.abs(settled - steady),
    'the tail sits closer to the steady claim than the settled sample — the window holds calm');
});

test('the claim window opens and closes exactly where the sim says', () => {
  const until = 100;
  assert.equal(resolveJettisonClaimBurn(100, 2, until, false, BASE), null,
    'at the embargo deadline the pod is public — the anonymous read');
  assert.equal(resolveJettisonClaimBurn(101, 3, until, false, BASE), null,
    'past the deadline the claim lamp retires');
  assert.equal(resolveJettisonClaimBurn(99.99, 1.99, until, false, BASE), BASE + JETTISON_CLAIM_STEADY_GAIN + Math.exp(-1.99 * JETTISON_CLAIM_SPIKE_DECAY) * JETTISON_CLAIM_SPIKE_GAIN,
    'one tick before the deadline the claim still holds');
  assert.equal(resolveJettisonClaimBurn(5, 0, Number.NaN, false, BASE), null,
    'no embargo stamp — no claim (the pod was never yours-just-dropped)');
});

test('a hot-but-anonymous base is honoured — the claim reads in the transponder voice', () => {
  const until = 100;
  const hot = resolveJettisonClaimBurn(99, 1, until, false, 2.0);
  assert.equal(hot, 2.0 + JETTISON_CLAIM_STEADY_GAIN + Math.exp(-JETTISON_CLAIM_SPIKE_DECAY) * JETTISON_CLAIM_SPIKE_GAIN,
    'the burn rides whatever base the factory authored, never restates it');
  const noBase = resolveJettisonClaimBurn(99, 1, until, false, Number.NaN);
  assert.equal(noBase, 0.8 + JETTISON_CLAIM_STEADY_GAIN + Math.exp(-JETTISON_CLAIM_SPIKE_DECAY) * JETTISON_CLAIM_SPIKE_GAIN,
    'a missing base falls to the transponder read, not to zero');
});

test('reduced flash keeps the steady claim and drops the spike; a cold pose never spikes', () => {
  const until = 100;
  const calm = resolveJettisonClaimBurn(98.1, 0.1, until, true, BASE);
  assert.equal(calm, BASE + JETTISON_CLAIM_STEADY_GAIN,
    'flash-reduced: no parting spike, the steady claim burn only');
  const cold = resolveJettisonClaimBurn(98.1, -1, until, false, BASE);
  assert.equal(cold, BASE + JETTISON_CLAIM_STEADY_GAIN,
    'a pod the tracker never saw spawn (restored save) reads the steady claim, no invented birth');
  const badTime = resolveJettisonClaimBurn(Number.NaN, 0.5, until, false, BASE);
  assert.ok(badTime > BASE, 'a broken clock degrades to the claim burn, not a crash');
});

test('wiring: the factory hands the cloned lamp only for player-jettisoned pods', () => {
  const factory = readFileSync(new URL('../src/render/visualFactory.js', import.meta.url), 'utf8');
  assert.ok(factory.includes('jettisonClaimLamp'), 'the factory hands the claim lamp');
  assert.ok(factory.includes('playerJettisonOrigin'),
    'the claim keys on the sim\'s own yours-stamp, not on any payload');
  const motion = readFileSync(
    new URL('../src/render/ordnanceMotionPresentation.js', import.meta.url), 'utf8');
  assert.ok(motion.includes('resolveJettisonClaimBurn(simTime, spawnAge, lamp.until'),
    'the pose pass drives the lamp from the pure layer');
  assert.ok(motion.includes("delete mesh.userData.jettisonClaimLamp"),
    'a settled pod retires its lamp record');
});
