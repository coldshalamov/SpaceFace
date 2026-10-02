// Hull swap must retune the LIVE physics body, not just the flat entity radius.
// setActiveShip mutates data.defId in place on the same data object; before the fix,
// syncDerivedPhysicsMass owned only mass/inertia and the measured-proxy cache keyed on the
// data shell — so the old hull's Rapier hitbox and skin proxy survived the swap.
//   node --test test/ship-hull-physics-swap.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import {
  ensurePhysicsBodySpec,
  setThrusterHealth,
} from '../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { resolveCollisionProxyManifest } from '../src/data/collisionProxyManifests.js';
import { getDerivedStats, makeShipEntitySpec, ships } from '../src/systems/ships.js';

function dockAtHelios(state) {
  state.ui.docked = true;
  state.ui.dockedStationId = 'station_helios';
}

function starterFleet(player) {
  player.ownedShips = [
    { defId: 'ship_kestrel', fittings: [] },
    { defId: 'ship_bastion', fittings: [] },
  ];
  player.activeShipIndex = 0;
}

function pointInsideAny(rec, x, z) {
  for (const collider of rec.colliders) {
    if (collider.projectPoint({ x, y: 0, z }, true).isInside === true) return true;
  }
  return false;
}

test('ui:setActiveShip retunes radius, physics body, and measured skin to the new hull', async () => {
  const sim = createSimulation({ seed: 47, systems: [ships] });
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  const bastionOwner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    const { state, bus } = sim;
    starterFleet(state.player);
    dockAtHelios(state);
    const pose = { pos: { x: 120, z: -40 }, rot: 0.3 };
    const e = sim.spawn(makeShipEntitySpec('ship_kestrel', {
      isPlayer: true, player: state.player, pos: pose.pos, rot: pose.rot,
    }));
    state.playerId = e.id;

    // Stamp authored wear BEFORE the swap: contact override + a damaged thruster must survive.
    const body = ensurePhysicsBodySpec(e);
    body.contact = { friction: 0.7, restitution: 0.15 };
    setThrusterHealth(e, 'drive-port', 0.5);
    const thruster = () => body.thrusters.find((item) => item.id === 'drive-port');

    owner.syncFromEntities(state.entityList);
    owner.step(1 / 60);
    const rec0 = owner.records.get(e.id);
    const kestrel = getDerivedStats('ship_kestrel', [], state.player);
    assert.equal(kestrel.radius, 14);
    assert.equal(rec0.spec.radius, 14);
    assert.match(rec0.proxyId, /ship_kestrel/, 'kestrel measured skin before the swap');

    bus.emit('ui:setActiveShip', { index: 1 });
    assert.equal(state.player.activeShipIndex, 1, 'the shipyard intent was accepted');

    const bastion = getDerivedStats('ship_bastion', [], state.player);
    assert.equal(bastion.radius, 22);
    assert.equal(e.radius, 22, 'entity radius follows the derived bastion hull');
    assert.equal(e.physicsBody, body, 'the save-safe body record mutates in place');
    assert.equal(body.radius, 22, 'physics body radius follows the hull');
    assert.equal(body.contact.friction, 0.7, 'authored contact override survives the swap');
    assert.equal(body.contact.restitution, 0.15);
    assert.equal(thruster().health, 0.5, 'thruster wear survives the swap');

    owner.syncFromEntities(state.entityList);
    owner.step(1 / 60);
    const rec1 = owner.records.get(e.id);
    assert.notEqual(rec1.body, rec0.body, 'the spec change rebuilds the Rapier body');
    assert.equal(rec1.spec.radius, 22);
    assert.match(rec1.proxyId, /ship_bastion/, 'measured skin follows the new hull');

    // An independently spawned Bastion at the entity's CURRENT pose must produce identical
    // geometry — zero velocity means e.pos is nearly the spawn pose, but the owner owns the
    // write-back so never assume it.
    const fresh = sim.spawn(makeShipEntitySpec('ship_bastion', {
      pos: { x: e.pos.x, z: e.pos.z }, rot: e.rot,
    }));
    bastionOwner.syncFromEntities([fresh]);
    const recB = bastionOwner.records.get(fresh.id);
    assert.equal(rec1.colliders.length, recB.colliders.length,
      'the swapped hull keeps the same collider count as a fresh bastion');
    for (let i = 0; i < recB.colliders.length; i += 1) {
      const a = rec1.colliders[i].shape;
      const b = recB.colliders[i].shape;
      assert.equal(a.type, b.type, `collider ${i} shape type`);
      if (a.vertices && b.vertices) {
        assert.deepEqual([...a.vertices], [...b.vertices], `collider ${i} vertices`);
      }
    }
    const c1 = rec1.body.translation();
    const cB = recB.body.translation();
    for (let k = 0; k < 24; k += 1) {
      const angle = (k / 24) * Math.PI * 2;
      for (const r of [4, 10, 18, 26]) {
        const ox = Math.cos(angle) * r;
        const oz = Math.sin(angle) * r;
        assert.equal(pointInsideAny(rec1, c1.x + ox, c1.z + oz),
          pointInsideAny(recB, cB.x + ox, cB.z + oz),
          `coverage probe angle ${k} radius ${r}`);
      }
    }

    // Repeating the same recompute + sync preserves the rebuilt body.
    sim.registry.get('ships').recomputeEntity(e.id);
    owner.syncFromEntities(state.entityList);
    assert.equal(owner.records.get(e.id).body, rec1.body,
      'an unchanged recompute must not rebuild the body');

    // A pure operational-mass refresh moves mass but cannot retune geometry.
    const massBefore = e.mass;
    const bodyMassBefore = body.mass;
    state.player.cargo.usedMass = 40;
    bus.emit('cargo:changed');
    bus.emit('cargo:massSettled');
    assert.ok(e.mass > massBefore,
      `the cargo refresh actually ran: operational mass ${massBefore} -> ${e.mass}`);
    assert.equal(body.mass, e.mass, 'the body record tracks the new operational mass');
    assert.ok(body.mass > bodyMassBefore, 'physics body mass follows the cargo refresh');
    assert.equal(e.radius, 22, 'cargo churn cannot move the entity radius');
    assert.equal(body.radius, 22, 'cargo churn cannot move the body radius');
    owner.syncFromEntities(state.entityList);
    const recMass = owner.records.get(e.id);
    assert.equal(recMass.spec.radius, 22);
    assert.match(recMass.proxyId, /ship_bastion/);

    // Swapping back restores the Kestrel geometry.
    bus.emit('ui:setActiveShip', { index: 0 });
    owner.syncFromEntities(state.entityList);
    owner.step(1 / 60);
    const rec2 = owner.records.get(e.id);
    assert.equal(e.radius, 14);
    assert.equal(body.radius, 14);
    assert.equal(rec2.spec.radius, 14);
    assert.match(rec2.proxyId, /ship_kestrel/, 'the kestrel skin returns on swap-back');
    assert.notEqual(rec2.body, rec1.body);
    assert.equal(thruster().health, 0.5, 'thruster wear survives both swaps');
    assert.equal(body.contact.friction, 0.7);
  } finally {
    owner.dispose();
    bastionOwner.dispose();
    sim.dispose();
  }
});

test('useMeasuredSkin:false hulls still retune the Rapier capsule to the new proportions', async () => {
  const sim = createSimulation({ seed: 48, systems: [ships] });
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  const bastionOwner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    const { state, bus } = sim;
    starterFleet(state.player);
    dockAtHelios(state);
    const pose = { pos: { x: 400, z: 400 }, rot: 0 };
    const e = sim.spawn(makeShipEntitySpec('ship_kestrel', {
      isPlayer: true, player: state.player, pos: pose.pos, rot: pose.rot,
    }));
    state.playerId = e.id;
    ensurePhysicsBodySpec(e);
    e.physicsBody.useMeasuredSkin = false;
    assert.equal(resolveCollisionProxyManifest(e), null, 'opt-out keeps the authored capsule');

    owner.syncFromEntities(state.entityList);
    const rec0 = owner.records.get(e.id);
    assert.equal(rec0.proxyId, null);
    assert.equal(rec0.colliders.length, 1, 'capsule fallback for the opted-out craft');
    const shape0 = rec0.colliders[0].shape;
    assert.equal(shape0.type, 2, 'Rapier capsule');
    const capRadius0 = shape0.radius;
    const halfHeight0 = shape0.halfHeight;

    bus.emit('ui:setActiveShip', { index: 1 });
    owner.syncFromEntities(state.entityList);
    const rec1 = owner.records.get(e.id);
    assert.notEqual(rec1.body, rec0.body, 'the radius change rebuilds the body');
    assert.equal(rec1.colliders.length, 1);
    const shape1 = rec1.colliders[0].shape;
    assert.equal(shape1.type, 2, 'still a capsule, not a skin');
    assert.notEqual(shape1.radius, capRadius0, 'cap radius follows the bastion hull');
    assert.notEqual(shape1.halfHeight, halfHeight0, 'spine length follows the bastion hull');

    // Parity with a fresh opted-out Bastion at the same pose.
    const fresh = sim.spawn(makeShipEntitySpec('ship_bastion', { pos: pose.pos, rot: pose.rot }));
    ensurePhysicsBodySpec(fresh);
    fresh.physicsBody.useMeasuredSkin = false;
    bastionOwner.syncFromEntities([fresh]);
    const recB = bastionOwner.records.get(fresh.id);
    assert.equal(recB.colliders.length, 1);
    const shapeB = recB.colliders[0].shape;
    assert.ok(Math.abs(shape1.radius - shapeB.radius) < 1e-6,
      `cap radius ${shape1.radius} matches a fresh bastion capsule ${shapeB.radius}`);
    assert.ok(Math.abs(shape1.halfHeight - shapeB.halfHeight) < 1e-6,
      `spine ${shape1.halfHeight} matches a fresh bastion capsule ${shapeB.halfHeight}`);
  } finally {
    owner.dispose();
    bastionOwner.dispose();
    sim.dispose();
  }
});
