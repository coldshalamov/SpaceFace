// BEACON HOLD (U10) — a claim beacon does not die mid-skirmish.
//
// The beacon was a 45-second toy: plant it to mark the good rock or call a fight to it, and
// it expired before the fight it summoned resolved. Contract (deterministic, sim-time only):
//   1. with no hostiles interested, the beacon expires on its authored TTL;
//   2. with a hostile inside the lure ring, the beacon holds past TTL, says so once, and
//      keeps luring;
//   3. when the interest leaves, the beacon expires on the next boundary;
//   4. the hold is bounded — a permanent beacon was never the deal.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { beacons } from '../src/systems/beacons.js';
import { BEACON_TTL } from '../src/systems/beacons.js';

function boot() {
  const sim = createSimulation({ seed: 4242, systems: [beacons] });
  sim.state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 12, mass: 100, hull: 100, hullMax: 100,
    data: { intent: {}, ai: {} },
  });
  sim.state.playerId = player.id;
  sim.state.player.credits = 10000;
  const toasts = [];
  sim.bus.on('toast', (p) => toasts.push(p.text));
  return { sim, state: sim.state, bus: sim.bus, player, toasts };
}

function plant(t) {
  t.bus.emit('beacon:deploy');
  const list = t.state.beacons;
  assert.equal(list.length, 1, 'the beacon is planted');
  return list[0];
}

function hostileAt(t, x, z) {
  return t.sim.spawn({
    type: 'ship', team: 1, pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 8, mass: 20, hull: 40, hullMax: 40,
    data: { intent: {}, ai: {} },
  });
}

test('beacon: no interest, the authored TTL still expires it', () => {
  const t = boot();
  plant(t);
  const deadline = t.state.simTime + BEACON_TTL + 1;
  while (t.state.simTime < deadline) t.sim.step();
  assert.equal(t.state.beacons.length, 0, 'expired on TTL');
  assert.ok(t.toasts.includes('Claim beacon expired'));
});

test('beacon: a hostile inside the lure ring holds it past TTL, once, and lures on', () => {
  const t = boot();
  const b = plant(t);
  const raider = hostileAt(t, b.x + 400, b.z);

  const past = t.state.simTime + BEACON_TTL + 5;
  while (t.state.simTime < past) t.sim.step();
  assert.equal(t.state.beacons.length, 1, 'the skirmish keeps the beacon alive');
  assert.equal(t.state.beacons[0].heldOnce, true);
  assert.ok(t.toasts.includes('Claim beacon holds — the skirmish is live'), 'the hold is said once');
  assert.equal(t.state.beacons[0].expireAt > past, true, 're-armed ahead of the boundary');
  assert.ok(raider.id, 'the hostile is still the interest');

  // The same hold does not re-announce: one line per skirmish.
  const toastsBefore = t.toasts.length;
  t.sim.step();
  assert.equal(t.toasts.filter((x) => x === 'Claim beacon holds — the skirmish is live').length, 1);
  assert.ok(t.toasts.length >= toastsBefore);
});

test('beacon: when the interest leaves, it expires; the hold is bounded', () => {
  const t = boot();
  const b = plant(t);
  const raider = hostileAt(t, b.x + 400, b.z);

  // Interest for a while, then the raider leaves: the next boundary takes the beacon.
  for (let i = 0; i < 30 && t.state.beacons.length; i++) t.sim.step();
  raider.alive = false;
  const boundary = t.state.simTime + BEACON_TTL + 2;
  while (t.state.simTime < boundary && t.state.beacons.length) t.sim.step();
  assert.equal(t.state.beacons.length, 0, 'no interest, no hold');

  // A permanent hold was never the deal: continuous interest still ends at the hard cap.
  const t2 = boot();
  const b2 = plant(t2);
  hostileAt(t2, b2.x + 400, b2.z);
  const cap = b2.deployedAt + (BEACON_TTL * 4) + 2;
  while (t2.state.simTime < cap && t2.state.beacons.length) t2.sim.step();
  assert.equal(t2.state.beacons.length, 0, 'the hard cap expires even a contested beacon');
  assert.ok(t2.toasts.includes('Claim beacon expired'));
});
