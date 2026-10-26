import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { hash32 } from '../src/core/rng.js';
import { recoveryEncounter, recoveryPowerSurprise } from '../src/systems/recoveryEncounter.js';
import { salvageActions } from '../src/systems/salvageActions.js';

const SEED = 4242, SECTOR = 'sector_ceres_belt';
const pointId = Array.from({ length: 100 }, (_, i) => `continue-reactor-${i}`).find(id => {
  const recoveryId = `recovery:${id}`, roll = hash32(SEED, recoveryId, 'recovery-condition');
  return !recoveryPowerSurprise(SEED, recoveryId) && roll % 5 !== 1 && roll % 4 === 0;
});
assert.ok(pointId);

function boot() {
  const sim = createSimulation({ seed: SEED, systems: [salvageActions, recoveryEncounter] });
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = SECTOR;
  const player = sim.spawn({ type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, data: {} });
  sim.state.playerId = player.id;
  return { sim, state: sim.state, bus: sim.bus, system: sim.registry.get('recoveryEncounter') };
}

function restoredHazard() {
  const first = boot();
  const wreck = first.sim.spawn({ type: 'wreck', alive: true, pos: { x: 120, z: 0 },
    vel: { x: 0, z: 0 }, hull: 1, hullMax: 1,
    data: { parentType: 'ship', salvagePointId: pointId } });
  first.bus.emit('signal:investigated', { sourceKind: 'salvage', entityId: wreck.id,
    sectorId: SECTOR, signalId: `signal:${pointId}`, pos: { ...wreck.pos } });
  first.bus.emit('scan:pulse', {});
  const record = first.state.recoveryEncounters.records[`recovery:${pointId}`];
  assert.equal(record.phase, 'hazard');
  first.sim.runTicks(120);
  const saved = first.system.serialize(), dueAt = record.hazardDueAt;
  const restored = boot();
  restored.state.simTime = first.state.simTime;
  restored.state.tick = first.state.tick;
  restored.system.deserialize(saved);
  restored.bus.emit('sector:enter', { sectorId: SECTOR });
  const continued = restored.state.recoveryEncounters.records[record.id];
  const reboundWreck = restored.state.entities.get(continued.entityId);
  assert.ok(reboundWreck, 'the saved recovery rematerializes its physical target');
  return { ...restored, record: continued, wreck: reboundWreck, dueAt };
}

test('Continue preserves the live reactor and its original dueAt instead of stranding a zero-second hazard', () => {
  const h = restoredHazard();
  const reactor = h.wreck.data.unstableReactor;
  assert.equal(typeof reactor, 'object', 'the restored hazard needs a ticking salvage reactor');
  assert.equal(reactor.dueAt, h.dueAt, 'Continue cannot grant a fresh twelve-second fuse');
  const receipts = [];
  h.bus.on('recovery:receipt', payload => receipts.push(payload));
  h.state.simTime = h.dueAt + 0.01;
  h.sim.runTicks(2);
  assert.equal(h.record.phase, 'failed');
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].failure, 'reactor_burst');
  assert.equal(receipts[0].credits, 0);
});

test('the resumed hazard can still be vented through the ordinary recovery action', () => {
  const h = restoredHazard();
  h.bus.emit('recovery:vent', { recoveryId: h.record.id });
  assert.equal(h.record.phase, 'stabilizing');
  assert.equal(h.record.hazardResolution, 'vented');
  assert.equal(h.wreck.data.unstableReactor.vented, true);
  h.state.simTime = h.dueAt + 0.01;
  h.sim.runTicks(2);
  assert.equal(h.record.phase, 'stabilizing', 'the resolved hazard stays inert after its former deadline');
  assert.equal(h.wreck.alive, true);
});
