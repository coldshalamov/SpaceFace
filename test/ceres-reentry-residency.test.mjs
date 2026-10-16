import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { CERES_SHIPBREAK_MANIFEST as manifest } from '../src/data/ceresShipbreak.js';
import { world } from '../src/systems/world.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { asteroidFormations } from '../src/systems/asteroidFormations.js';

function harness(t) {
  const sim = createSimulation({ seed: 47, systems: [world, asteroidSites, asteroidFormations] });
  t.after(() => sim.dispose());
  const state = sim.state;
  state.mode = 'flight';
  const player = sim.spawn({ type: 'ship', team: 0,
    pos: sectorLocalToGlobalForSector({ x: 0, z: 0 }, manifest.sectorId),
    vel: { x: 0, z: 0 }, radius: 10, mass: 1, collides: false });
  state.playerId = player.id;
  const created = [], removed = [];
  const spawn = sim.helpers.spawnEntity;
  const remove = sim.helpers.removeEntity;
  sim.helpers.spawnEntity = function (spec) {
    const entity = spawn.call(this, spec);
    created.push(entity);
    return entity;
  };
  sim.helpers.removeEntity = function (id, ...args) {
    removed.push(id);
    return remove.call(this, id, ...args);
  };
  const enter = () => sim.registry.get('world').enterSector(manifest.sectorId,
    { continuous: true, noTeleport: true, placePlayer: false });
  const sections = () => state.entityList.filter(e => e.alive !== false
    && e.data?.worldSiteId === manifest.id && e.data.worldSiteStructural);
  enter();
  sim.step(SIM_DT);
  created.length = removed.length = 0;
  return { sim, state, player, created, removed, enter, sections };
}

test('actual same-sector entries never recreate, remove, or reorder distant stowed Ceres sections', t => {
  const h = harness(t);
  const record = h.state.sites.worldById[manifest.id];
  const durable = structuredClone(record);
  const entities = [...h.state.entityList];
  const farRows = structuredClone(h.state.world.farActors.rows);
  assert.equal(h.sections().length, 0);
  assert.ok(manifest.payloads.every(p => record.payloads[p.id].status === 'stowed'));
  for (let i = 0; i < 3; i++) h.enter();
  assert.equal(h.created.length, 0, 'sector:enter must not briefly mint three doomed payload bodies');
  assert.equal(h.removed.length, 0, 're-entry cannot hide churn by removing its new bodies');
  assert.deepEqual(h.state.entityList.map(e => e.id), entities.map(e => e.id));
  for (let i = 0; i < entities.length; i++) assert.equal(h.state.entityList[i], entities[i]);
  assert.deepEqual(h.state.world.farActors.rows, farRows);
  assert.deepEqual(h.state.sites.worldById[manifest.id], durable, 're-entry cannot advance or reset the site');
});

test('approach still rematerializes authored anatomy and re-entry preserves released and tethered bodies', t => {
  const h = harness(t);
  h.player.pos.x = manifest.placement.pos.x;
  h.player.pos.z = manifest.placement.pos.z - 100;
  h.sim.step(SIM_DT);
  const sections = h.sections();
  assert.equal(sections.length, 3, 'the real residency tick materializes all authored sections on approach');
  const site = h.state.entityList.filter(e => e.alive !== false && e.data?.worldSiteId === manifest.id);
  assert.equal(site.length, 1 + manifest.components.length + manifest.collisionProxies.length,
    'approach restores the root, clamps, shell colliders and three structural component bodies');
  const record = h.state.sites.worldById[manifest.id];
  assert.equal(record.stageId, 'working');
  assert.ok(sections.every(e => e.physicsBody && e.collides));
  const released = sections.find(e => e.data.worldSitePayloadId === 'long_plate');
  const tethered = sections.find(e => e.data.worldSitePayloadId === 'crossbeam');
  record.payloads.long_plate.status = 'released';
  record.components[manifest.payloads.find(p => p.id === 'long_plate').structural.supportComponentId].status = 'released';
  h.player.pos.x += 4000;
  released.pos.x = h.player.pos.x;
  released.pos.z = h.player.pos.z;
  tethered.flags ||= {};
  tethered.flags.tethered = true;
  h.sim.step(SIM_DT);
  assert.equal(released.alive, true, 'released section beside the player stays resident');
  assert.equal(tethered.alive, true, 'a real tether flag retains the same structural body');
  h.created.length = h.removed.length = 0;
  h.enter();
  assert.equal(h.created.length, 0, 'only the unretained stowed sibling remains dormant');
  assert.equal(h.removed.length, 0);
  assert.ok(h.sections().includes(released));
  assert.ok(h.sections().includes(tethered));
  assert.equal(record.payloads.long_plate.status, 'released');
});
