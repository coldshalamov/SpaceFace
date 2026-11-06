// Explicit CPU layout fixtures. These are native skin/route checks, not an
// ordinary flight, model-visibility or gameplay-camera acceptance claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { world as worldPrototype } from '../src/systems/world.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { modelTruthRow, modelTruthSkinPrimitives } from '../src/data/modelTruth.js';
import { placeDrawScaleFromRow } from '../src/data/modelTruthMounts.js';
import { resolvePlaceDrawScale } from '../src/render/partsLibrary.js';
import { solidDressingPlanFor, dressingStaticLayerFor } from '../src/world/solidDressing.js';
import { ensureDressingTable } from '../src/world/dressingTable.js';
import { VX_FREE_DRIVE_STRUCTURES, VX_FREE_DRIVE_MARKERS,
  VX_FREE_DRIVE_POI, VX_FREE_DRIVE_SECTOR_ID as SID } from '../src/data/vxFreeDriveRing.js';

const ANCHORS = new Set(['vx_ring_plaza_gate', 'vx_ring_rib_1',
  'vx_ring_rib_5', 'vx_ring_apron_mouth']);

function worldFixture() {
  const state = createGameState(4242), bus = createBus();
  const spawnEntity = spec => {
    const row = { ...spec, id: state.nextEntityId++, alive: true,
      pos: { ...spec.pos }, vel: { x: 0, z: 0 }, data: { ...spec.data }, flags: { ...spec.flags } };
    state.entities.set(row.id, row); state.entityList.push(row); return row;
  };
  const world = Object.create(worldPrototype);
  world.init({ state, bus, helpers: { hash32, mulberry32, spawnEntity,
    requestPresentationRebuild() {} }, registry: { get: () => null } });
  world.newGame(); state.mode = 'flight'; state.world.currentSectorId = SID;
  return { state, world };
}

function ringRows(state) {
  return state.world.dressing.rows.filter(row => row.data?.vxFreeDrivePoiId === VX_FREE_DRIVE_POI.id);
}

function assertAnchorFit(body) {
  const row = modelTruthRow(body.data.placeId);
  const plan = solidDressingPlanFor(body.data.placeId, { radius: body.radius });
  assert.ok(plan && body.collides && body.physicsBody.dynamic === false);
  assert.equal(body.data.collisionProxy, plan.collisionProxy);
  const renderScale = resolvePlaceDrawScale(body.data, { entity: body,
    targetRadius: body.radius, authoredEnvelope: Math.max(...row.bounds.size),
    censusScale: placeDrawScaleFromRow(row, body) });
  assert.equal(renderScale, plan.drawScale, 'live place reader and native skin use the same scale');
  assert.equal(modelTruthSkinPrimitives(body).length, row.proposedSkin.primitives.length);
  assert.equal(row.proposedSkin.gapWu, 0, 'these are solid decks, never an advertised portal');
  return renderScale * row.bounds.size[0];
}

test('actual world and cold re-entry issue the berth art with its matching solid skin', () => {
  const fresh = worldFixture(); fresh.world.enterSector(SID);
  const saved = JSON.parse(JSON.stringify(fresh.world.serialize()));
  const cold = worldFixture(); cold.world.deserialize(saved); cold.world.enterSector(SID);
  for (const fixture of [fresh, cold]) {
    const rows = ringRows(fixture.state);
    assert.equal(rows.length, VX_FREE_DRIVE_STRUCTURES.length + VX_FREE_DRIVE_MARKERS.length);
    const widths = new Map();
    for (const definition of VX_FREE_DRIVE_STRUCTURES.filter(row => ANCHORS.has(row.id))) {
      const body = rows.find(row => row.data.vxFreeDriveId === definition.id);
      assert.ok(body, `${definition.id} materializes through the world owner`);
      assert.equal(body.data.placeId, definition.placeId);
      assert.equal(body.radius, definition.radius);
      assert.equal(body.rot, definition.rot);
      assert.deepEqual(body.pos, definition.localPos);
      widths.set(definition.id, assertAnchorFit(body));
    }
    const starter = modelTruthRow(NEW_GAME.shipId);
    assert.ok(widths.get('vx_ring_plaza_gate') > starter.bounds.size[0] * starter.drawScale * 3,
      'the Mouth has architectural breadth relative to the authored starter hull');
    assert.ok(widths.get('vx_ring_plaza_gate') > widths.get('vx_ring_rib_1'),
      'the primary cap leads the receding rib hierarchy');
  }
});

function castStarter(owner, statics, a, b) {
  const velocity = { x: b.x - a.x, y: 0, z: b.z - a.z };
  const ship = { ...makeShipEntitySpec(NEW_GAME.shipId, {
    isPlayer: true, pos: { ...a }, rot: Math.atan2(velocity.z, velocity.x),
  }), id: 900001, alive: true, occupantGeneration: 1, vel: { x: 0, z: 0 }, angVel: 0 };
  owner.syncFromEntityLayers(statics, [ship], 1, null);
  const hull = owner.records.get(ship.id);
  assert.equal(hull.proxyId, 'skin:ship_kestrel:polygon');
  return statics.filter(body => {
    const record = owner.records.get(body.id);
    assert.ok(record?.proxyId.startsWith(body.data.collisionProxy), 'actual native measured-skin record');
    return record.colliders.some(collider => hull.colliders.some(h =>
      collider.castCollider({ x: 0, y: 0, z: 0 }, h, velocity, 0, 1, true)));
  }).map(body => body.data.vxFreeDriveId);
}

test('native starter hull rounds the cap and clears the short entry and outside berth line', async () => {
  const fixture = worldFixture(), active = fixture.world._emptySectorBag();
  // Normal sector materialization has already created its dressing table before
  // the Ring pass; isolate the Ring without omitting that owner precondition.
  ensureDressingTable(fixture.state);
  fixture.world._spawnFreeDriveRing(fixture.state.world.sectors[SID], active);
  const statics = dressingStaticLayerFor(fixture.state).statics;
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    // The shortest straight connection between the first two authored buoys,
    // then the first existing gap. No radius-only envelope substitutes for the hull.
    const shortEntry = [VX_FREE_DRIVE_MARKERS[0].localPos, VX_FREE_DRIVE_MARKERS[1].localPos,
      { x: 1005, z: 225 }];
    const outside = [VX_FREE_DRIVE_POI.pos, { x: 1180, z: 215 }, { x: 1040, z: 420 },
      { x: 900, z: 630 }, { x: 820, z: 930 }, VX_FREE_DRIVE_MARKERS[2].localPos];
    for (const route of [shortEntry, outside]) {
      for (let i = 1; i < route.length; i++) {
        assert.deepEqual(castStarter(owner, statics, route[i - 1], route[i]), [],
          `berth outside segment ${JSON.stringify([route[i - 1], route[i]])}`);
      }
    }
    const mouth = statics.find(body => body.data.vxFreeDriveId === 'vx_ring_plaza_gate');
    assert.ok(castStarter(owner, statics, VX_FREE_DRIVE_POI.pos, mouth.pos).includes('vx_ring_plaza_gate'),
      'the cap is really solid; there is no fictitious fly-through opening');
  } finally { owner.dispose(); }
});
