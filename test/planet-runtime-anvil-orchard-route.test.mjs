import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { fields } from '../src/systems/fields.js';
import { planetRuntime } from '../src/systems/planetRuntime.js';
import { traffic } from '../src/systems/traffic.js';
import { world } from '../src/systems/world.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import { addEnvironmentHeat, queueEnvironmentImpact } from '../src/systems/environmentMaterials.js';
import { PLANET_FLAGS, PLANET_SITE } from '../src/data/planets.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { ANVIL_ORCHARD, normalizeOrchardRecord } from '../src/data/anvilOrchard.js';
import { ORCHARD_GEOMETRY } from '../src/data/anvilOrchardBody.js';
import { isOrchardFrame, isOrchardPod } from '../src/data/anvilOrchardIdentity.js';

const trafficWork = { ...traffic, update(dt, state) { this._stepAnvilWork(dt, state); } };
const worldRecords = {
  name: 'world',
  init(ctx) { this.state = ctx.state; },
  upsertWorldRecord: world.upsertWorldRecord,
};

function boot() {
  PLANET_FLAGS.enabled = true;
  FIELD_FLAGS.enabled = true;
  const sim = createSimulation({ seed: 424214,
    systems: [worldRecords, trafficWork, fields, planetRuntime, flightV3, environmentalMachinery, physics] });
  const state = sim.state;
  state.mode = 'flight';
  state.world.currentSectorId = PLANET_SITE.sectorId;
  state.sites = {};
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  sim.step();
  const owner = sim.registry.get('traffic');
  const planet = sim.registry.get('planetRuntime');
  const collector = state.entities.get(state.planet.witnessId);
  const frame = state.entities.get(state.planet.orchardFrameId);
  return { sim, state, owner, planet, collector, frame };
}

test('Anvil normal producer admits one authored Orchard frame and routes finite yield without double credit', async () => {
  const t = boot();
  try {
    assert.ok(t.collector);
    assert.ok(t.frame && isOrchardFrame(t.frame));
    assert.equal(t.frame.flags.persistent, true);
    assert.equal(t.frame.data.worldSiteTargetable, true);
    assert.equal(t.frame.data.isLandmark, true);
    assert.equal(t.frame.data.homeSectorId, ANVIL_ORCHARD.sectorId);
    assert.equal(t.state.entityList.filter(e => e.alive !== false
      && e.data?.worldRecordId === ORCHARD_GEOMETRY.worldRecordId).length, 1);
    assert.ok(normalizeOrchardRecord(t.state.sites.anvilOrchard));
    assert.equal(t.state.sites.anvilOrchard.sourceRemaining, ANVIL_ORCHARD.totalUnits);
    assert.equal(t.state.world.records.byId[ORCHARD_GEOMETRY.worldRecordId]?.recordId,
      ORCHARD_GEOMETRY.worldRecordId);

    t.collector.pos.x = t.state.planet.center.x + 960;
    t.collector.pos.z = t.state.planet.center.z;
    t.collector.vel.x = 0;
    t.collector.vel.z = 70;
    t.collector.data.itinerary.phase = 'collect';
    t.planet._tickShips(SIM_DT, t.state, t.state.planet, PLANET_SITE);
    const observer = t.sim.spawn({ type: 'ship', isPlayer: true, collides: false, physicsBody: false,
      pos: { x: t.collector.pos.x + 50, z: t.collector.pos.z + 5 }, hull: 100 });
    t.state.playerId = observer.id;
    const facade = t.sim.registry.get('physics');
    assert.equal(await facade.prepareBackend(t.state), true);
    facade._syncSg02DynamicAuthorityEntities(t.state);
    assert.ok(facade.readOrchardFramePose(t.frame), 'the frame is a resident body of the real SG02 owner');
    assert.equal(addEnvironmentHeat(t.state, t.frame, 1000, { kind: 'route-test' }), false);
    assert.equal(queueEnvironmentImpact(t.state, t.frame, 140, { kind: 'route-test' }), false);
    assert.equal(t.frame.data.materialCondition, undefined,
      'landmark identity prevents debris fallback heat/impact state');

    // Use the existing worker producer after the same thermal admission used by the ordinary
    // route. Five flown units split 4 into the finite pod and exactly 1 into the existing cargo
    // manifest; neither owner sees the other's accepted units.
    assert.ok(facade._sg02.records.has(t.collector.id), 'the ordinary collector remains a real native resident');
    let cargoCalls = 0;
    const acceptCargo = t.owner.acceptAnvilHarvest;
    t.owner.acceptAnvilHarvest = function (worker, options) {
      cargoCalls++;
      return acceptCargo.call(this, worker, options);
    };
    t.planet._tickWorkerHarvest(7.2, t.state, t.state.planet, PLANET_SITE);

    const row = normalizeOrchardRecord(t.state.sites.anvilOrchard);
    const pods = t.state.entityList.filter(e => isOrchardPod(e));
    assert.equal(row.sourceRemaining, 44);
    assert.equal(row.lots.length, 1);
    assert.equal(row.lots[0].units, 4);
    assert.equal(pods.length, 1);
    assert.equal(pods[0].data.amount, 4);
    assert.equal(pods[0].data.commodityId, ANVIL_ORCHARD.commodityId);
    assert.equal(t.collector.data.cargoManifest.totalQty, 1);
    assert.equal(cargoCalls, 1, 'the existing producer receives only the unaccepted remainder');
    assert.equal(t.state.planet.ships[t.collector.id].harvestedUnits, 5);
    const rowBeforeExit = t.state.sites.anvilOrchard;
    const frameId = t.frame.id;
    t.state.planet.orchardFrameId = null;
    t.state.planet.orchardFrameGeneration = null;
    t.state.world.currentSectorId = 'sector_test_elsewhere';
    t.sim.step();
    t.state.world.currentSectorId = ANVIL_ORCHARD.sectorId;
    t.sim.step();
    assert.equal(t.state.planet.orchardFrameId, frameId,
      'sector reentry finds the durable authored frame after the transient cache is gone');
    assert.strictEqual(t.state.sites.anvilOrchard, rowBeforeExit,
      'sector reentry retains the existing finite custody row');
    assert.equal(t.state.sites.anvilOrchard.sourceRemaining, 44,
      'reentry never resets already-admitted finite source');
    assert.equal(t.state.entityList.filter(e => e.alive !== false
      && e.data?.worldRecordId === ORCHARD_GEOMETRY.worldRecordId).length, 1,
    'repeat checks reuse the same finite frame identity');
  } finally {
    t.sim.dispose();
    PLANET_FLAGS.enabled = false;
    FIELD_FLAGS.enabled = false;
  }
});

test('Anvil Orchard admission does not rematerialize a shelved frame or reset its finite row', () => {
  const t = boot();
  try {
    const row = t.state.sites.anvilOrchard;
    const lotId = `${ANVIL_ORCHARD.id}:0:1`;
    row.sourceRemaining = 44;
    row.lots = [{ id: lotId, socket: 0, cycle: 1, units: 4, outcome: 'retained' }];
    row.sockets[0] = { socket: 0, cycle: 1, lotId, status: 'stowed', operation: 'closed',
      progress: 0, handoff: 'fixed', targetRevision: null, acceptedTick: null, completedTick: null,
      openedTick: null, readyTick: null, mountLostWork: 0, mountLostTick: null };
    assert.ok(normalizeOrchardRecord(row));

    t.frame.alive = false;
    t.state.planet.orchardFrameId = null;
    t.state.planet.orchardFrameGeneration = null;
    assert.equal(t.planet._ensureOrchardFrame(t.state, t.state.planet, PLANET_SITE), null,
      'an existing world-record identity is not duplicated when its body is shelved');
    assert.equal(t.state.entityList.filter(e => e.alive !== false
      && e.data?.worldRecordId === ORCHARD_GEOMETRY.worldRecordId).length, 0);
    assert.strictEqual(t.state.sites.anvilOrchard, row);
    assert.equal(t.state.sites.anvilOrchard.sourceRemaining, 44);
    assert.equal(t.state.sites.anvilOrchard.lots[0].units, 4);
  } finally {
    t.sim.dispose();
    PLANET_FLAGS.enabled = false;
    FIELD_FLAGS.enabled = false;
  }
});
