import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { world } from '../src/systems/world.js';
import { weapons } from '../src/systems/weapons.js';
import { spawnPayloadEntity } from '../src/combat/industrialBeam.js';
import { makeEvidenceSpindleSpec, spawn47aScenarioCast } from '../src/data/scenarios/47aLiveScene.js';
import { drainDeferredEnterMaterializers } from '../src/core/sectorEnterDefer.js';

const HELIOS = 'sector_helios_prime';
const CERES = 'sector_ceres_belt';

function harness({ sliced = false, deferred = false } = {}) {
  const sim = createSimulation({ seed: 4242, systems: [world, weapons] });
  const { state, bus } = sim;
  const owner = sim.registry.get('world');
  if (sliced) {
    // Put weapons beyond the initial listener budget without replacing the bus.
    const weaponOwner = sim.registry.get('weapons');
    weaponOwner.destroy();
    bus.on('sector:enter', () => {});
    weaponOwner.init({ state, bus, helpers: sim.helpers });
    bus.setEmitSliceBudget('sector:enter', 1);
  }
  state.render.sectorEnterCookWillRun = () => deferred;
  const spawned = [];
  // Production world exposes this seam for residency observers. Keep its actual
  // departure, serial, current-sector, and sector:enter ordering; replace only
  // the unrelated catalog population with the exact authored scenario cast.
  owner._applyResidencyPlan = () => {
    const cast = spawn47aScenarioCast({ state, liveColdStartSafe: true, spawn: spec => sim.spawn(spec) });
    cast.spindle = sim.spawn(makeEvidenceSpindleSpec());
    spawned.push(cast);
  };
  return { sim, state, bus, owner, spawned, settle() {
    bus.flushSlicedEmits();
    drainDeferredEnterMaterializers(state, state.world.sectors[state.world.currentSectorId]);
    bus.flush();
  } };
}

for (const sliced of [false, true]) for (const deferred of [false, true]) {
  test(`fresh 47-A payloads survive ${sliced ? 'sliced' : 'inline'} enter / ${deferred ? 'deferred' : 'direct'} weapons materialization`, () => {
    const h = harness({ sliced, deferred });
    try {
      h.state.mode = 'loading';
      h.state.world.currentSectorId = null;
      h.owner.enterSector(HELIOS);
      const cast = h.spawned[0];
      h.state.mode = 'flight';
      h.state.tick = 1;
      h.bus.emit('game:started', {});
      h.settle();
      for (const entity of [cast.spindle, cast.civilianPod]) {
        assert.ok(entity, 'the production cast contains the required payload');
        assert.equal(h.state.entities.get(entity.id), entity);
        assert.equal(h.state.entityIndex.payloads.includes(entity), true);
      }
    } finally { h.sim.dispose(); }
  });
}

for (const continuous of [false, true]) {
  test(`${continuous ? 'continuous residency' : 'hard jump'} removes departure payload before destination materializes`, () => {
    const h = harness({ sliced: true, deferred: true });
    try {
      h.state.mode = 'flight';
      h.state.world.currentSectorId = CERES;
      const departing = spawnPayloadEntity(h.state, {}, h.sim.helpers);
      const removed = [];
      h.bus.on('entity:destroyed', event => removed.push(event));
      const materialize = h.owner._applyResidencyPlan;
      h.owner._applyResidencyPlan = (...args) => {
        assert.equal(h.state.entities.has(departing.id), false, 'cleanup precedes destination materialization');
        materialize(...args);
      };
      h.owner.enterSector(HELIOS, { continuous, fromJump: !continuous });
      h.settle();
      const cast = h.spawned[0];
      assert.equal(h.state.entities.get(cast.spindle.id), cast.spindle);
      assert.equal(h.state.entities.get(cast.civilianPod.id), cast.civilianPod);
      assert.equal(removed.filter(e => e.id === departing.id && e.reason === 'payload_sector_transition').length, 1);
    } finally { h.sim.dispose(); }
  });
}

test('same-sector Continue rematerialization preserves saved payload identity and custody', () => {
  const h = harness({ sliced: true });
  try {
    h.state.mode = 'loading';
    h.state.world.currentSectorId = HELIOS;
    const restored = spawnPayloadEntity(h.state, {}, h.sim.helpers);
    h.owner.enterSector(HELIOS, { restoreDurableRecords: true, sliceNeighbors: true });
    h.bus.emit('save:loaded', {});
    h.settle();
    assert.equal(h.state.entities.get(restored.id), restored);
    assert.equal(h.state.entities.get(h.spawned[0].spindle.id), h.spawned[0].spindle);
  } finally { h.sim.dispose(); }
});

test('departure preserves anchored, world-record and player-tether payload custody', () => {
  const h = harness();
  try {
    h.state.world.currentSectorId = CERES;
    const anchored = spawnPayloadEntity(h.state, {}, h.sim.helpers);
    anchored.data.anchored = true;
    const saved = spawnPayloadEntity(h.state, { worldRecordId: 'saved-payload' }, h.sim.helpers);
    const tethered = spawnPayloadEntity(h.state, {}, h.sim.helpers);
    h.state.player.tether = { targetId: tethered.id };
    h.owner.enterSector(HELIOS);
    h.settle();
    for (const entity of [anchored, saved, tethered]) assert.equal(h.state.entities.get(entity.id), entity);
  } finally { h.sim.dispose(); }
});

test('different-sector restore retires old payloads before a sliced exit tail can run', () => {
  const h = harness({ sliced: true });
  try {
    h.state.mode = 'loading';
    h.state.world.currentSectorId = CERES;
    const departing = spawnPayloadEntity(h.state, {}, h.sim.helpers);
    const seen = [];
    h.bus.on('sector:exit', () => seen.push('first'));
    h.bus.on('sector:exit', () => seen.push('tail'));
    h.bus.setEmitSliceBudget('sector:exit', 1);
    const materialize = h.owner._applyResidencyPlan;
    h.owner._applyResidencyPlan = (...args) => {
      assert.deepEqual(seen, ['first'], 'the real exit listener tail is still pending');
      assert.equal(h.state.entities.has(departing.id), false);
      materialize(...args);
    };
    // No manual early drain: world performs departure, residency and enter itself.
    h.owner.enterSector(HELIOS, { restoreDurableRecords: true, sliceNeighbors: true });
    h.settle();
    assert.deepEqual(seen, ['first', 'tail']);
    assert.equal(h.state.entities.get(h.spawned[0].spindle.id), h.spawned[0].spindle);
    assert.equal(h.state.entities.get(h.spawned[0].civilianPod.id), h.spawned[0].civilianPod);
  } finally { h.sim.dispose(); }
});
