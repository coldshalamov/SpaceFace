import assert from 'node:assert/strict';
import test from 'node:test';
import { createShipMicroMotionTracker, resolveContactKick } from '../src/render/shipMicroMotion.js';

function createMockMesh() {
  return {
    userData: {
      hull: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
    },
  };
}

function makeShip(id, mass = 400) {
  return {
    id, mass, radius: 12, rot: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, flags: {},
  };
}

test('contact kick: mass-scaled, load-capped, frozen, NaN-safe', () => {
  const fighter = resolveContactKick('jettison', 400);
  assert.equal(fighter.intensity, 1);
  assert.ok(Math.abs(fighter.push - 0.55) < 1e-9);

  const hauler = resolveContactKick('jettison', 5000);
  assert.equal(hauler.intensity, 0.2);
  assert.ok(hauler.push < fighter.push, 'haulers barely feel the shove');

  const drone = resolveContactKick('jettison', 50);
  assert.equal(drone.intensity, 1.3);

  assert.equal(resolveContactKick('jettison', NaN).intensity, 1);
  assert.equal(resolveContactKick('jettison', 0).intensity, 1);
  assert.equal(resolveContactKick('jettison', -10).intensity, 1);

  // Jettison load scales the push but caps: a full-hold dump is one firm shove, not a launch.
  const light = resolveContactKick('jettison', 400, 0.35);
  const heavy = resolveContactKick('jettison', 400, 600);
  assert.ok(heavy.push > light.push);
  assert.ok(Math.abs(heavy.push - 0.55 * 1.6) < 1e-9);

  // Unknown kinds degrade to a soft neutral tickle, never a throw.
  const unknown = resolveContactKick('teleport', 400);
  assert.ok(Math.abs(unknown.push - 0.32) < 1e-9);
  assert.ok(Object.isFrozen(fighter) && Object.isFrozen(unknown));
});

test('contact kick: seating clamp plate jolts the host away from the attach point', () => {
  const tracker = createShipMicroMotionTracker();
  const mesh = createMockMesh();
  const host = makeShip(10);
  tracker.updateCraftMicroMotion(host, mesh, 1.0, 0.016);
  mesh.userData.hull.position.z = 0;

  // Plate seats on the starboard rim (+z): the hull rocks to port (−z) and twists.
  tracker.onChargeStuck({ chargeId: 99, hostId: 10, pos: { x: 0, z: 12 } });
  tracker.updateCraftMicroMotion(host, mesh, 1.016, 0.016);
  assert.ok(mesh.userData.hull.position.z < -0.05,
    `hull rocks away from the attach side: ${mesh.userData.hull.position.z}`);
  assert.ok(mesh.userData.hull.rotation.y < 0,
    `off-center clamp twists the hull: ${mesh.userData.hull.rotation.y}`);
  assert.ok(tracker.getRecord(10).flinchShudder > 0.05, 'clamp seating rattles');

  // Missing host id is a no-op, never a throw.
  tracker.onChargeStuck({ chargeId: 100, pos: { x: 0, z: 0 } });
  tracker.onChargeStuck(null);
});

test('contact kick: jettison breathes the throwing hull forward, scaled by load and mass', () => {
  const tracker = createShipMicroMotionTracker();
  const fighterMesh = createMockMesh();
  const haulerMesh = createMockMesh();
  const fighter = makeShip(11, 400);
  const hauler = makeShip(12, 5000);
  tracker.updateCraftMicroMotion(fighter, fighterMesh, 1.0, 0.016, { playerId: 11 });
  tracker.updateCraftMicroMotion(hauler, haulerMesh, 1.0, 0.016, { playerId: 12 });

  tracker.onJettison({ commodityId: 'cmdty_ore_iron', amount: 60 });
  tracker.updateCraftMicroMotion(fighter, fighterMesh, 1.016, 0.016, { playerId: 11 });
  assert.ok(fighterMesh.userData.hull.position.x > 0.002,
    `pod went aft, hull breathes forward: ${fighterMesh.userData.hull.position.x}`);

  // Same dump on a hauler reads far smaller.
  tracker.onJettison({ commodityId: 'cmdty_ore_iron', amount: 60 });
  tracker.updateCraftMicroMotion(hauler, haulerMesh, 1.016, 0.016, { playerId: 12 });
  assert.ok(haulerMesh.userData.hull.position.x > 0, 'hauler still answers');
  assert.ok(haulerMesh.userData.hull.position.x < fighterMesh.userData.hull.position.x,
    'mass softens the kick');
});

test('contact kick: countermeasure puff nudges forward with a yaw whisper', () => {
  const tracker = createShipMicroMotionTracker();
  const mesh = createMockMesh();
  const ship = makeShip(20);
  tracker.updateCraftMicroMotion(ship, mesh, 1.0, 0.016);
  tracker.onCountermeasure({ shipId: 20, kind: 'chaff', x: 0, z: 0 });
  assert.ok(tracker.getRecord(20).flinchShudder > 0.03, 'puff rattles the hull');
  tracker.updateCraftMicroMotion(ship, mesh, 1.016, 0.016);
  assert.ok(mesh.userData.hull.position.x > 0.0005,
    `chaff went aft, hull breathes forward: ${mesh.userData.hull.position.x}`);
  tracker.onCountermeasure(null);
  tracker.onCountermeasure({});
});

test('contact kick: beacon drops settle, scan discharges rock the mast', () => {
  const tracker = createShipMicroMotionTracker();
  const mesh = createMockMesh();
  const player = makeShip(7);
  tracker.updateCraftMicroMotion(player, mesh, 1.0, 0.016, { playerId: 7 });

  tracker.onBeaconDeployed({ id: 'beacon_1' });
  tracker.updateCraftMicroMotion(player, mesh, 1.016, 0.016, { playerId: 7 });
  assert.ok(mesh.userData.hull.position.x > 0.0005,
    `buoy went aft, hull settles forward: ${mesh.userData.hull.position.x}`);

  tracker.onScanPulse({ pos: { x: 0, z: 0 } });
  tracker.updateCraftMicroMotion(player, mesh, 1.032, 0.016, { playerId: 7 });
  const rec = tracker.getRecord(7);
  assert.ok(rec.flinchShudder > 0.01, 'array discharge shivers');
  assert.notEqual(rec.flinchPitch, 0, 'sensor mast rocks');
});
