import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { SECTOR_WONDER_MANIFESTS } from '../src/data/sectorWonders.js';
import { worldSiteManifestById } from '../src/data/worldSiteManifests.js';
import { validateWorldSiteManifest } from '../src/systems/worldSiteKernel.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { mining } from '../src/systems/mining.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { SECTORS } from '../src/data/sectors.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';
import { createSectorArranger, clearsKeepouts } from '../src/world/arranger.js';
import { worldSiteMapMarkers } from '../src/ui/worldSiteMapLayer.js';

function harness(manifest) {
  const state = { simTime: 0, tick: 0, meta: { seed: 4242 }, rng: () => 0.5,
    entities: new Map(), entityList: [], freeIds: [], mode: 'flight', playerId: 1,
    input: { fireGroup: 2, aimAngle: 0, actions: { mine: true, siteBeam: true } },
    ui: { beamMode: 'auto', componentSelection: null },
    player: { credits: 900, reputation: {}, cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 100, capMass: 100 },
      miningBeam: { tierId: 'beam_industrial', dps: 100, range: 500 } },
    world: { currentSectorId: manifest.sectorId, discovery: {} }, content: { commodities: [] } };
  const player = { id: 1, alive: true, type: 'ship', team: 0, pos: { ...manifest.placement.pos },
    vel: { x: 0, z: 0 }, radius: 10, flags: { docked: false }, data: { miningBeam: state.player.miningBeam } };
  state.entities.set(1, player); state.entityList.push(player);
  let nextId = 100;
  const helpers = { spawnEntity(spec) {
    const entity = { id: nextId++, alive: true, flags: {}, vel: { x: 0, z: 0 }, ...spec, data: spec.data || {} };
    state.entities.set(entity.id, entity); state.entityList.push(entity); return entity;
  }, removeEntity(id) { const entity = state.entities.get(id); if (entity) entity.alive = false; } };
  const bus = createBus(), systems = {}, registry = { get: name => systems[name] || null };
  for (const [name, prototype] of Object.entries({ asteroidSites, mining, environmentalMachinery })) {
    systems[name] = Object.create(prototype); systems[name].init({ state, bus, helpers, registry });
  }
  bus.emit('sector:enter', { sectorId: manifest.sectorId });
  const entities = () => [...state.entities.values()].filter(e => e.alive !== false && e.data?.worldSiteId === manifest.id);
  const component = id => entities().find(e => e.data.worldSiteComponentId === id);
  const beam = operation => {
    const target = component(operation.componentId);
    assert.ok(target, `${manifest.id}/${operation.componentId} is offered by the normal producer`);
    player.pos = { x: target.pos.x, z: target.pos.z - 90 };
    state.player.targetId = target.id; state.tick++; state.simTime += 1;
    systems.mining._stopBeam();
    systems.mining._runPlayerBeam(player, { dps: 100, range: 500, directToCargo: false }, 1, state);
  };
  return { state, player, bus, systems, entities, component, beam };
}

for (const manifest of SECTOR_WONDER_MANIFESTS) {
  test(`4242: ${manifest.name} is a normal persistent place with a working industrial verb`, () => {
    assert.deepEqual(validateWorldSiteManifest(manifest), { ok: true, errors: [] });
    assert.equal(worldSiteManifestById(manifest.id), manifest);
    const h = harness(manifest), owner = h.systems.asteroidSites;
    const sections = h.entities().filter(entity => entity.data.worldSiteStructural);
    for (let i = 0; i < sections.length; i++) for (let j = i + 1; j < sections.length; j++) {
      assert.ok(Math.hypot(sections[i].pos.x - sections[j].pos.x, sections[i].pos.z - sections[j].pos.z)
        > sections[i].radius + sections[j].radius, 'finite sections have distinct non-overlapping work bays');
    }
    const sector = SECTORS.find(s => s.id === manifest.sectorId);
    const arranger = createSectorArranger(sector, { origin: sectorGlobalOrigin(sector.id) });
    const keepout = arranger.keepouts.find(row => row.id === manifest.id);
    assert.ok(keepout?.radius >= 420, 'the work envelope excludes random rocks');
    assert.deepEqual(keepout.center, manifest.placement.pos);
    assert.equal(clearsKeepouts(manifest.mapAnnotation.coursePos, 16, [keepout]), false);
    assert.ok(worldSiteMapMarkers(h.state, sector.id).some(marker => marker.id === manifest.id), 'the ordinary map offers the approach');
    const machineId = manifest.consequences[0].intents[0].payload.machineId;
    const secured = [];
    h.bus.on('sectorWonder:secured', receipt => secured.push(receipt));
    h.bus.emit('sectorWonder:secured', { siteId: manifest.id, machineId });
    assert.equal(h.state.world.discovery[manifest.sectorId]?.machineShutdowns?.[machineId], undefined,
      'an invented receipt cannot switch off a physical law');
    for (const operation of manifest.operations) {
      if (operation.verb === 'transfer') {
        h.beam(operation);
        assert.equal(owner.getWorldSite(manifest.id).completedOperations[operation.id], undefined,
          'a beam cannot deliver cargo that is still outside its receiver');
        const payload = h.entities().find(e => e.data.worldSitePayloadId === operation.payloadId);
        const receiver = h.component(operation.componentId);
        assert.ok(payload && receiver, 'both delivery holders are real live entities');
        payload.pos = { ...receiver.pos }; payload.vel = { x: 0, z: 0 };
      }
      h.beam(operation);
      assert.ok(owner.getWorldSite(manifest.id).completedOperations[operation.id], operation.id);
    }
    assert.equal(owner.getWorldSite(manifest.id).stageId, 'secured');
    assert.equal(secured.filter(receipt => receipt.operationId).length, 1, 'one actual final receipt');
    assert.equal(h.state.world.discovery[manifest.sectorId].machineShutdowns[machineId].cause, 'player_shutdown');
    const snapshot = JSON.parse(JSON.stringify(owner.serialize()));
    h.bus.emit('sector:exit', { sectorId: manifest.sectorId });
    owner.deserialize(snapshot); h.bus.emit('sector:enter', { sectorId: manifest.sectorId });
    assert.equal(owner.getWorldSite(manifest.id).stageId, 'secured');
    assert.equal(Object.keys(owner.getWorldSite(manifest.id).completedOperations).length, manifest.operations.length);
    for (const system of Object.values(h.systems)) system.destroy?.();
  });
}

test('4242: the ice keel is one finite supported body, becomes towable and retains motion on Continue', async () => {
  const manifest = SECTOR_WONDER_MANIFESTS.find(m => m.id.includes('nereid'));
  const h = harness(manifest), owner = h.systems.asteroidSites;
  const body = h.component('ice_keel'), start = { ...body.pos };
  assert.equal(body.physicsBody.dynamic, false);
  h.beam(manifest.operations[0]);
  assert.equal(body.physicsBody.dynamic, false, 'cut seam still has its clamp');
  h.beam(manifest.operations[1]);
  assert.equal(body.physicsBody.dynamic, true);
  assert.equal(h.component('ice_keel'), body, 'release preserves the body identity');
  const physics = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: 1 / 60 });
  try {
    physics.syncFromEntities([body]);
    queuePhysicsImpulse(body, { x: body.mass * 40, z: 0 }, { source: 'wonder-tow-fixture' });
    for (let tick = 0; tick < 180; tick++) physics.step(1 / 60);
    assert.ok(body.pos.x - start.x > 80, 'real Rapier mass responds to a towing impulse');
    const snapshot = JSON.parse(JSON.stringify(owner.serialize()));
    h.bus.emit('sector:exit', { sectorId: manifest.sectorId });
    owner.deserialize(snapshot); h.bus.emit('sector:enter', { sectorId: manifest.sectorId });
    const restored = h.component('ice_keel');
    assert.deepEqual(restored.pos, body.pos); assert.deepEqual(restored.vel, body.vel);
    assert.equal(restored.physicsBody.dynamic, true);
  } finally { physics.dispose(); for (const system of Object.values(h.systems)) system.destroy?.(); }
});
