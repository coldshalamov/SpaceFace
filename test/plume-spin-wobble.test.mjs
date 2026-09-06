// PQ-139.04 — tumbling ships corkscrew their trail (enemy card-plume half).
// The player's contrail corkscrew is proven in test/contrail-corkscrew.test.mjs. This file proves
// the enemy half: the fleet's card plume carries a per-instance spin pair (amp, phase), the amp
// comes from the hull's angVel (zero at rest, saturated at a hard tumble, softened under
// reduced motion), the phase turns with the hull in the fleet's endFrame, and the packed GPU
// publication actually carries the pair the vertex shader bows the card with.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  ContinuousPlumeSystem,
  spinWobbleAmp,
  SPIN_WOBBLE_AMP_WU,
  SPIN_WOBBLE_REF_RAD_S,
  SPIN_WOBBLE_REDUCED_MOTION_SCALE,
} from '../src/render/thruster/systems/continuousPlume.js';
import { FamilyProductionFleet } from '../src/render/thruster/systems/familyFleet.js';
import {
  FLOW_FLIPBOOK_VERTEX,
  SPIN_WOBBLE_WAVENUMBER,
} from '../src/render/thruster/materials/flowFlipbookMaterial.js';
import { KESTREL_MAIN_PLUME_RECIPE } from '../src/render/thruster/recipes/kestrelRecipes.js';
import { listThrusterRecipePacks } from '../src/render/thruster/recipes/registry.js';

const A11Y = { reducedMotion: false, reducedFlash: false, lowQuality: false, qualityTier: 'high' };
const REDUCED = { ...A11Y, reducedMotion: true };
const SOCKETS = [{ x: 0, y: 0, z: 0, ax: -1, ay: 0, az: 0 }];

test('the wobble amplitude is zero at rest, grows with spin, and saturates at a hard tumble', () => {
  assert.equal(spinWobbleAmp(0), 0, 'a ship that is not spinning keeps its plume exactly where it was');
  assert.equal(spinWobbleAmp(NaN), 0);
  assert.equal(spinWobbleAmp(Infinity), 0);
  const half = spinWobbleAmp(SPIN_WOBBLE_REF_RAD_S / 2);
  const full = spinWobbleAmp(SPIN_WOBBLE_REF_RAD_S);
  const wild = spinWobbleAmp(SPIN_WOBBLE_REF_RAD_S * 5);
  assert.ok(half > 0 && half < full, 'a slower spin draws a narrower screw');
  assert.equal(full, SPIN_WOBBLE_AMP_WU);
  assert.equal(wild, SPIN_WOBBLE_AMP_WU, 'a wild tumble does not fling the plume off the screen');
});

test('reduced motion softens the wobble but never silences the direction', () => {
  const normal = spinWobbleAmp(4, false);
  const reduced = spinWobbleAmp(4, true);
  assert.ok(reduced > 0, 'a spun ship must still read as spun with reduce-motion on');
  assert.ok(Math.abs(reduced - normal * SPIN_WOBBLE_REDUCED_MOTION_SCALE) < 1e-9);
});

test('the fleet card plume packs the spin pair its ship carries, and packs zeros at rest', () => {
  const plume = new ContinuousPlumeSystem(THREE, KESTREL_MAIN_PLUME_RECIPE, { distortionEnabled: false });
  const rest = new ContinuousPlumeSystem(THREE, KESTREL_MAIN_PLUME_RECIPE, { distortionEnabled: false });
  try {
    plume.beginUpdate(A11Y);
    // The fleet passes the ship record as driveSignals: spin + accumulated spinPhase ride on it.
    plume.writeEntity(1 / 60, 0.6, SOCKETS, { boost: 0, spin: 4, spinPhase: 1.25 }, { plumeDrive: 0.6, boostBlend: 0 }, 1);
    // A second entity — the packed publication must stride per instance, not just fill slot 0.
    plume.writeEntity(1 / 60, 0.6, SOCKETS, { boost: 0, spin: 3, spinPhase: 2.5 }, { plumeDrive: 0.6, boostBlend: 0 }, 1);
    plume.endUpdate();

    rest.beginUpdate(A11Y);
    rest.writeEntity(1 / 60, 0.6, SOCKETS, { boost: 0, spin: 0, spinPhase: 0 }, { plumeDrive: 0.6, boostBlend: 0 }, 1);
    rest.endUpdate();

    const slot = plume.pool.slots[0];
    assert.equal(slot.spinAmp, SPIN_WOBBLE_AMP_WU, 'a 4 rad/s tumble saturates the wobble');
    assert.equal(slot.spinPhase, 1.25, 'the screw carries the phase the hull accumulated');
    assert.equal(rest.pool.slots[0].spinAmp, 0, 'at rest the packed amp is exactly zero');
    // The interleaved GPU publication carries the pair at (stride 20, offset 18): instance 0
    // at 18/19 AND instance 1 at 38/39 — the stride itself is pinned, not just instance 0.
    const batch = plume.layerBatches[0];
    const slot1 = plume.pool.slots.find((s) => s.alive && s.socketIndex === 0 && s !== slot
      && (s.spinAmp !== slot.spinAmp || s.spinPhase !== slot.spinPhase));
    assert.ok(slot1, 'the second entity must write its own slot');
    assert.equal(batch.backing.stride, 20);
    assert.equal(batch.backing.array[18], slot.spinAmp);
    assert.equal(batch.backing.array[19], slot.spinPhase);
    assert.equal(batch.spin[0], slot.spinAmp);
    assert.equal(batch.spin[1], slot.spinPhase);
    assert.equal(batch.backing.array[38], slot1.spinAmp, 'instance 1 packs at stride 20 (offset 38)');
    assert.equal(batch.backing.array[39], slot1.spinPhase);
    assert.equal(batch.spin[2], slot1.spinAmp);
    assert.equal(batch.spin[3], slot1.spinPhase);
    // A different phase on the second write replaces, never accumulates, in the pool.
  } finally {
    plume.dispose();
    rest.dispose();
  }
});

test('reduced-motion a11y scales the packed amplitude the GPU actually draws', () => {
  const plume = new ContinuousPlumeSystem(THREE, KESTREL_MAIN_PLUME_RECIPE, { distortionEnabled: false });
  try {
    plume.beginUpdate(REDUCED);
    plume.writeEntity(1 / 60, 0.6, SOCKETS, { boost: 0, spin: 4, spinPhase: 0 }, { plumeDrive: 0.6, boostBlend: 0 }, 1);
    plume.endUpdate();
    const amp = plume.pool.slots[0].spinAmp;
    assert.ok(amp > 0 && Math.abs(amp - SPIN_WOBBLE_AMP_WU * SPIN_WOBBLE_REDUCED_MOTION_SCALE) < 1e-9,
      `reduced motion must soften (not zero) the packed amp, got ${amp}`);
  } finally {
    plume.dispose();
  }
});

test('the fleet accumulates the wobble phase from the hull spin in endFrame', () => {
  const fleet = new FamilyProductionFleet(THREE, { maxShips: 4, initialShips: 1 });
  const profileId = listThrusterRecipePacks()[0].profileId;
  const dt = 1 / 60;
  try {
    // The live route: beginFrame → beginAdmitPhase → admitShip (newcomers) → endFrame.
    fleet.beginFrame(A11Y);
    fleet.beginAdmitPhase();
    const ship = fleet.admitShip(501, profileId, false);
    assert.ok(ship, 'the ship record must exist');
    fleet.setShipSockets(ship, SOCKETS, 1);
    fleet.setShipDrive(ship, { drive: 0.6, throttle: 0.6 });
    fleet.setShipSpin(ship, 3);
    fleet.endFrame(dt);
    const afterOne = ship.spinPhase;
    assert.ok(Math.abs(afterOne - 3 * dt) < 1e-9, `one frame advances the phase by spin*dt, got ${afterOne}`);

    fleet.beginFrame(A11Y);
    fleet.beginAdmitPhase();
    const again = fleet.retainShip(501, profileId, false);
    assert.equal(again, ship, 'the same hull keeps its record (and its phase)');
    fleet.setShipSockets(again, SOCKETS, 1);
    fleet.setShipDrive(again, { drive: 0.6, throttle: 0.6 });
    fleet.setShipSpin(again, 3);
    fleet.endFrame(dt);
    assert.ok(Math.abs(ship.spinPhase - 2 * 3 * dt) < 1e-9, 'the phase accumulates across frames');

    // The slots the family plume wrote this frame carry the saturated amplitude for this spin.
    const fam = fleet.families[ship.familyIndex];
    const slot = fam.plume.pool.slots.find((s) => s.alive && s.spinAmp > 0);
    assert.ok(slot, 'at least one written slot must carry the wobble');
    assert.ok(Math.abs(slot.spinAmp - SPIN_WOBBLE_AMP_WU) < 1e-9, '3 rad/s is above the 2 rad/s reference: saturated');

    // A ship that never spun packs amp 0 — the bit-identical-at-rest contract.
    fleet.beginFrame(A11Y);
    fleet.beginAdmitPhase();
    const still = fleet.admitShip(502, profileId, false);
    assert.ok(still, 'a second ship record must exist for the at-rest contract');
    fleet.setShipSockets(still, SOCKETS, 1);
    fleet.setShipDrive(still, { drive: 0.6, throttle: 0.6 });
    fleet.setShipSpin(still, 0);
    fleet.endFrame(dt);
    assert.equal(still.spinPhase, 0, 'no spin: no phase accumulated');
  } finally {
    fleet.dispose();
  }
});

test('the vertex shader consumes the spin pair with the shared wavenumber constant', () => {
  assert.match(FLOW_FLIPBOOK_VERTEX, /attribute vec2 instanceSpin;/,
    'the vertex stage must declare the spin attribute');
  assert.match(FLOW_FLIPBOOK_VERTEX, /instanceSpin\.x \* sin\(instanceSpin\.y - along \* SPIN_WOBBLE_WAVENUMBER\)/,
    'the card must bow sideways by amp*sin(phase - along*k) via the named constant, never a retyped literal');
  assert.match(FLOW_FLIPBOOK_VERTEX, new RegExp(`SPIN_WOBBLE_WAVENUMBER = ${SPIN_WOBBLE_WAVENUMBER.toFixed(2)}`),
    'the shader constant must be interpolated from the exported value, not retyped');
});
