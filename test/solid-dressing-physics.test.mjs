import test from 'node:test';
import assert from 'node:assert/strict';

import { core } from '../src/core/coreSystem.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { Masks } from '../src/core/entity.js';
import { physics } from '../src/core/physics.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { measuredSkinAllowedFor } from '../src/data/collisionProxyManifests.js';
import { modelTruthRow } from '../src/data/modelTruth.js';
import { insertDressingRow, getDressingRow } from '../src/world/dressingTable.js';
import {
  dressingStaticLayerFor,
  dressingStaticVersion,
  solidDressingPlanFor,
  stampSolidDressing,
} from '../src/world/solidDressing.js';

function bootCore(seed) {
  const state = createGameState(seed);
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers });
  return {
    state,
    bus,
    helpers,
    cleanup() {
      core.destroy();
      bus.clear();
    },
  };
}

test('solid dressing plans follow the census silhouette and the craft-scale floor', () => {
  const hulk = solidDressingPlanFor('place_dead_hulk', { radius: 42 });
  assert.ok(hulk, 'dead hulk is solid');
  assert.equal(hulk.collisionProxy, 'skin:place_dead_hulk');
  // Census truth: silhouette 27.78 WU at reference radius 42 — the dressing radius matches
  // the reference, so the drawn silhouette and the collider silhouette agree exactly.
  assert.ok(Math.abs(hulk.silhouetteWu - 27.783053) < 1e-3, `hulk silhouette ${hulk.silhouetteWu}`);
  assert.ok(Math.abs(hulk.radius - 42) < 1e-6);
  assert.ok(Math.abs(hulk.drawScale - 1) < 1e-6);

  // A nav buoy draws well under the craft-scale floor: colliding it would be an invisible
  // wall around a light pin.
  assert.equal(solidDressingPlanFor('place_nav_buoy', { radius: 12 }), null);
  // Unknown or unmeasured places stay ghosts.
  assert.equal(solidDressingPlanFor('place_not_a_real_place', { radius: 30 }), null);
  assert.equal(solidDressingPlanFor(null, { radius: 30 }), null);
});

test('target-pinned POI draws re-derive the body radius so the skin scale equals the draw scale', () => {
  const row = modelTruthRow('place_quiessence_freighter_a');
  const target = 21;
  const extentX = row.bounds.size[0];
  const plan = solidDressingPlanFor('place_quiessence_freighter_a', {
    radius: 21,
    placeTargetRadius: target,
  });
  assert.ok(plan, 'memorial hull is solid');
  // The renderer fits the model's X extent to 2 x placeTargetRadius; the plan's radius makes
  // the measured skin land on the same drawn size.
  const reference = row.gameplay.entityRadius;
  assert.ok(Math.abs(plan.radius - reference * ((target * 2) / extentX)) < 1e-6);
  assert.ok(Math.abs(plan.silhouetteWu - row.shell.silhouetteRadius * ((target * 2) / extentX)) < 1e-6);
});

test('dressing rows carry solidity only when the spec opts in', () => {
  const t = bootCore(7010);
  try {
    const ghost = insertDressingRow(t.state, { pos: { x: 0, z: 0 }, radius: 42, data: { placeId: 'place_dead_hulk' } });
    assert.equal(ghost.collides, false, 'default row stays a ghost');
    assert.equal(ghost.collisionMask, undefined, 'ghost rows author no mask');

    const data = { placeId: 'place_dead_hulk' };
    const plan = stampSolidDressing(data, { radius: 42 });
    assert.ok(plan);
    const solid = insertDressingRow(t.state, {
      pos: { x: 100, z: 0 },
      radius: 42,
      collides: true,
      physicsBody: { dynamic: false, material: 'prop' },
      data,
    });
    assert.equal(solid.collides, true);
    assert.equal(solid.collisionMask, Masks.STATION);
    assert.deepEqual(solid.physicsBody, { dynamic: false, material: 'prop' });
    assert.equal(solid.data.collisionProxy, 'skin:place_dead_hulk');
    assert.ok(getDressingRow(t.state, solid.id) === solid, 'rows resolve by id for receipts');
  } finally {
    t.cleanup();
  }
});

test('measured skins admit presentation fx only through an explicit skin proxy declaration', () => {
  const solidRow = {
    type: 'fx',
    collides: true,
    physicsBody: { dynamic: false, material: 'prop' },
    data: { placeId: 'place_dead_hulk', collisionProxy: 'skin:place_dead_hulk' },
  };
  assert.equal(measuredSkinAllowedFor(solidRow), true);

  const ghostRow = {
    type: 'fx',
    collides: true,
    physicsBody: { dynamic: false, material: 'prop' },
    data: { placeId: 'place_dead_hulk' },
  };
  assert.equal(measuredSkinAllowedFor(ghostRow), false, 'undeclared fx stay ghosts');

  const ghostMarker = { type: 'fx', collides: false, data: {} };
  assert.equal(measuredSkinAllowedFor(ghostMarker), false);
});

test('solid dressing rows join the SG-02 static layer as fixed measured-skin bodies', async () => {
  const t = bootCore(7011);
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    const data = { placeId: 'place_conveyor_barge' };
    stampSolidDressing(data, { radius: 48 });
    const barge = insertDressingRow(t.state, {
      pos: { x: 0, z: 0 },
      rot: 0.4,
      radius: 48,
      collides: true,
      physicsBody: { dynamic: false, material: 'prop' },
      data,
    });
    const layer = dressingStaticLayerFor(t.state, [], 0);
    assert.equal(layer.statics.includes(barge), true, 'row rides the static layer');
    assert.equal(layer.staticVersion, dressingStaticVersion(t.state, 0));

    owner.syncFromEntityLayers(layer.statics, [], layer.staticVersion, null);
    const rec = owner.records.get(barge.id);
    assert.ok(rec, 'owner built a record for the row');
    assert.equal(rec.spec.dynamic, false, 'dressing solid is a fixed body');
    assert.ok(rec.proxyId && rec.proxyId.startsWith('skin:place_conveyor_barge'), `proxy ${rec.proxyId}`);
    assert.ok(rec.colliders.length >= 1, 'measured compound colliders exist');

    // Collider == drawn model: the hull surface sits at the measured silhouette, so a point
    // at the row center is inside the body and open space 200 WU out is not.
    const inside = rec.colliders.some((c) => c.projectPoint({ x: 0, y: 0, z: 0 }, true).isInside === true);
    const outside = rec.colliders.some((c) => c.projectPoint({ x: 200, y: 0, z: 0 }, true).isInside === true);
    assert.equal(inside, true, 'row center is solid');
    assert.equal(outside, false, 'open space is not solid');

    // Version folding: a dressing change (not an entity change) must force a reconcile.
    insertDressingRow(t.state, { pos: { x: 500, z: 500 }, radius: 12, data: {} });
    const next = dressingStaticLayerFor(t.state, [], 0);
    assert.notEqual(next.staticVersion, layer.staticVersion, 'dressing bump folds into the static version');
    assert.equal(next.statics.length, layer.statics.length, 'ghost rows never ride the layer');
  } finally {
    owner.dispose();
    t.cleanup();
  }
});

test('a ship flying into a solid dressing row stops at the hull instead of floating through', async () => {
  const run = async () => {
    const t = bootCore(7012);
    const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
    try {
      const ship = t.helpers.spawnEntity({
        type: 'ship',
        pos: { x: -300, z: 0 },
        vel: { x: 30, z: 0 },
        rot: Math.PI / 2,
        radius: 14,
        mass: 120,
        collides: true,
        data: { defId: 'ship_kestrel' },
      });
      const data = { placeId: 'place_dead_hulk' };
      stampSolidDressing(data, { radius: 42 });
      const hulk = insertDressingRow(t.state, {
        pos: { x: 0, z: 0 },
        rot: 0,
        radius: 42,
        collides: true,
        physicsBody: { dynamic: false, material: 'prop' },
        data,
      });
      const layer = dressingStaticLayerFor(t.state, [], 0);
      owner.syncFromEntityLayers(layer.statics, [ship], layer.staticVersion, null);
      const dt = 1 / 60;
      for (let i = 0; i < 600; i++) {
        owner.step(dt, i);
      }
      // The hulk silhouette is 27.78 WU about x=0; the 14 WU kestrel must never cross it.
      assert.ok(ship.pos.x < -27.78, `ship stopped outside the hull (x=${ship.pos.x.toFixed(2)})`);
      assert.ok(ship.pos.x > -80, `ship actually reached the hull (x=${ship.pos.x.toFixed(2)})`);
      assert.deepEqual(
        { x: hulk.pos.x, z: hulk.pos.z },
        { x: 0, z: 0 },
        'fixed dressing never moves',
      );
      return ship.pos.x;
    } finally {
      owner.dispose();
      t.cleanup();
    }
  };
  const first = await run();
  const second = await run();
  assert.equal(first, second, 'block outcome is bit-identical across runs');
});

test('projectile sweeps and contact receipts see solid dressing rows', () => {
  const t = bootCore(7013);
  try {
    const { state, bus } = t;
    const data = { placeId: 'place_dead_hulk' };
    stampSolidDressing(data, { radius: 42 });
    const hulk = insertDressingRow(state, {
      pos: { x: 0, z: 0 },
      rot: 0,
      radius: 42,
      collides: true,
      physicsBody: { dynamic: false, material: 'prop' },
      data,
    });

    // Projectile-sweep layer: the folded statics feed the projectile broadphase.
    const proj = {
      id: 990001, type: 'projectile', alive: true, collides: true,
      // Real rounds collide against ship/asteroid/station categories (DEFAULT_MASK.projectile).
      collisionMask: Masks.SHIP | Masks.ASTEROID | Masks.STATION,
      pos: { x: -60, z: 0 }, prevPos: { x: -60, z: 0 },
      vel: { x: 400, z: 0 }, rot: Math.PI / 2, radius: 1,
      ownerId: 990002, team: 1,
      data: { damage: 5, weaponId: 'test' },
    };
    state.entityList = [proj];
    state.entityIndex = {
      __spacefaceEntityIndexV1: true,
      ready: true,
      spatialStatics: [hulk],
      spatialDynamics: [proj],
      spatialStaticVersion: 7,
      spatialDynamicsVersion: 3,
      projectiles: [proj],
      collidables: [hulk, proj],
    };
    const impactPayloads = [];
    bus.on('projectile:hit', (payload) => impactPayloads.push(payload));
    physics.init({ state, bus, helpers: {} });
    physics._syncProjectileBroadphase(state);
    assert.equal(physics._projectileBroadphaseReady, true);
    const dt = 1 / 60;
    for (let tick = 0; tick < 40 && proj.alive; tick++) {
      proj.prevPos.x = proj.pos.x;
      proj.prevPos.z = proj.pos.z;
      proj.pos.x += proj.vel.x * dt;
      proj.pos.z += proj.vel.z * dt;
      physics.sweepProjectiles(dt, state);
    }
    assert.equal(proj.alive, false, 'the round dies on the hull it was aimed at');
    assert.equal(impactPayloads.length, 1, 'projectile:hit emitted');
    assert.equal(impactPayloads[0].targetId, hulk.id, 'the hit target is the dressing row');

    // Contact receipts: a solver receipt for a row resolves through the dressing table so
    // the impact event still fires with both ids.
    const impacts = [];
    bus.on('physics:impact', (payload) => impacts.push(payload));
    physics._sg02 = {
      drainContactImpacts: () => [{
        aId: 990002,
        bId: hulk.id,
        impulse: 6,
        normal: { x: 1, z: 0 },
        pos: { x: -30, z: 0 },
        causalActorId: 990002,
        preSolveClosingSpeed: 30,
      }],
    };
    state.entities = new Map([[990002, { id: 990002, alive: true, mass: 120, pos: { x: -40, z: 0 } }]]);
    const emitted = physics._emitSg02ContactImpacts(state);
    assert.equal(emitted, 1, 'receipt against a dressing row emits');
    assert.equal(impacts.length, 1);
    assert.equal(impacts[0].bId, hulk.id);
  } finally {
    core.destroy();
    t.bus.clear();
  }
});
