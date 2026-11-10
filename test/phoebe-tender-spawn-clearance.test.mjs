import assert from 'node:assert/strict';
import test from 'node:test';

import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { applyFeatureConfigToMaps, snapshotFeatureMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { activityActorSlotById } from '../src/data/sectorActivityPockets.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';

const SLOT = 'phoebe_shrine_tender';

// Configured production residency, not an ordinary player-flight or route-completion test.
// The real world/traffic producers author every body. No pose edits follow the initial
// observer placement, and no threat, FLEE, job phase, mission or receipt is overridden.
test('Phoebe tender fresh spawn clears native neighbors and Continue preserves its existing pose and route', async () => {
  const flags = snapshotFeatureMaps();
  let runtime;
  try {
    runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 47 });
    applyFeatureConfigToMaps(runtime.config.features);
    const state = runtime.state;
    state.mode = 'flight';
    state.ui.screenStack = [];
    const player = runtime.spawn(makeShipEntitySpec('ship_kestrel', {
      isPlayer: true, player: state.player, team: 0, pos: { x: 0, z: 0 },
    }));
    state.playerId = player.id;
    const world = runtime.getSystem('world');
    world.enterSector('sector_phoebe_echo');
    const station = state.entityList.find(e => e.data?.stationId === 'station_phoebe_echo');
    assert.ok(station, 'the actual Echo Shrine is resident');
    world.relocatePlayerInSector({
      x: station.pos.x + 500, z: station.pos.z, heading: 0,
    }, { reason: 'configured-phoebe-spawn-regression' });
    const actors = () => state.entityList.filter(e => e.alive !== false
      && e.data?.activityActorSlotId === SLOT);
    assert.equal(actors().length, 1, 'traffic admits exactly one authored tender');
    const actor = actors()[0];
    const physics = runtime.getSystem('physics');
    assert.equal(await physics.prepareBackend(state), true, 'real native authority is prepared');
    const native = physics._sg02;
    const record = native.records.get(actor.id);
    const shrine = native.records.get(station.id);
    assert.ok(record && shrine, 'both actual native bodies are present');
    assert.ok(record.colliders.length > 0 && shrine.colliders.length > 0);
    let minimumGap = Infinity;
    for (const other of native.records.values()) {
      if (other === record) continue;
      for (const a of record.colliders) {
        if (a.isSensor()) continue;
        for (const b of other.colliders) {
          if (b.isSensor()) continue;
          const contact = a.shape.contactShape(a.translation(), a.rotation(),
            b.shape, b.translation(), b.rotation(), 200);
          if (contact) minimumGap = Math.min(minimumGap, contact.distance);
        }
      }
    }
    assert.ok(Number.isFinite(minimumGap) && minimumGap > 1,
      `fresh authored tender must clear all actual native neighbors; gap=${minimumGap}`);
    const hull = actor.hull;
    const recordId = actor.data.worldRecordId;
    const jobId = actor.data.jobId;
    const route = structuredClone(state.npcJobs.byId[jobId].job.route);
    runtime.step(1 / 60);
    let minimumContact = Infinity;
    for (const collider of record.colliders) {
      native.world.contactPairsWith(collider, other => {
        if (other.isSensor()) return;
        const owner = native._colliderOwners.get(other.handle)?.rec;
        if (!owner || owner === record) return;
        native.world.contactPair(collider, other, manifold => {
          for (let i = 0; i < manifold.numContacts(); i++) {
            minimumContact = Math.min(minimumContact, manifold.contactDist(i));
          }
        });
      });
    }
    assert.ok(minimumContact >= -0.05,
      `first native tick must not depenetrate the newly authored tender; depth=${minimumContact}`);
    assert.equal(actor.hull, hull);
    assert.equal(actor.data.worldRecordId, recordId);
    assert.equal(actor.data.jobId, jobId);
    assert.deepEqual(state.npcJobs.byId[jobId].job.route, route);

    const slot = activityActorSlotById(SLOT);
    assert.deepEqual(slot.spawnOffset, { x: 94, z: -1.2 });
    assert.equal(slot.route.durationS, 73, 'spawn repair does not retime the route');
    assert.deepEqual(slot.route.marks.map(m => m.offset),
      [{ x: -30.8, z: 105.6 }, { x: 30.8, z: -105.6 }]);

    const savedPose = structuredClone(actor.pos);
    const save = runtime.getSystem('save');
    const envelope = save.serialize('phoebe-tender-spawn');
    assert.equal(save.loadEnvelope(JSON.parse(JSON.stringify(envelope)),
      'phoebe-tender-spawn'), true, 'real checksum-valid Continue succeeds');
    assert.equal(actors().length, 1, 'Continue never duplicates the authored actor');
    const restored = actors()[0];
    assert.equal(restored.data.worldRecordId, recordId);
    assert.equal(restored.data.jobId, jobId);
    assert.deepEqual({ x: restored.pos.x, y: restored.pos.y, z: restored.pos.z }, savedPose,
      'existing saved body pose wins over the fresh spawn descriptor');
    assert.deepEqual(state.npcJobs.byId[jobId].job.route, route,
      'Continue preserves the existing job route without migration');
  } finally {
    runtime?.dispose();
    restoreFeatureMaps(flags);
  }
});
