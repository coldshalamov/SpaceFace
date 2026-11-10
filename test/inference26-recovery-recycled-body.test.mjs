import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { recoveryEncounter } from '../src/systems/recoveryEncounter.js';

test('a new recovery on a recycled body id receives its own destruction instead of a settled older call', () => {
  const sim = createSimulation({ seed: 4242, systems: [recoveryEncounter] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_ceres_belt';
  const player = sim.spawn({ type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, data: {} });
  state.playerId = player.id;
  const receipts = [];
  bus.on('recovery:receipt', payload => receipts.push(payload));
  const track = pointId => {
    const wreck = sim.spawn({ type: 'wreck', alive: true, pos: { x: 120, z: 0 },
      vel: { x: 0, z: 0 }, hull: 1, hullMax: 1, data: { salvagePointId: pointId } });
    bus.emit('signal:investigated', { sourceKind: 'distress', entityId: wreck.id,
      sectorId: state.world.currentSectorId, signalId: `signal:${pointId}`, pos: { ...wreck.pos } });
    bus.emit('scan:pulse', {});
    state.player.tether = { active: true, targetId: wreck.id };
    sim.runTicks(155);
    const record = state.recoveryEncounters.records[`recovery:${pointId}`];
    assert.equal(record.phase, 'decision');
    return { wreck, record };
  };
  const first = track('first-body');
  bus.emit('recovery:choose', { recoveryId: first.record.id, choice: 'rescue' });
  assert.equal(first.record.outcome, 'rescue');
  sim.helpers.removeEntity(first.wreck.id, { immediate: true });
  sim.runTicks(1);

  const second = track('second-body');
  assert.equal(second.wreck.id, first.wreck.id, 'the real allocator must exercise body-id reuse');
  sim.helpers.removeEntity(second.wreck.id, { immediate: true });
  sim.runTicks(1);
  assert.equal(second.record.phase, 'failed', 'the new situation cannot remain open without its body');
  assert.equal(state.recoveryEncounters.outcomes[second.record.id].failure, 'wreck_destroyed');
  assert.equal(state.recoveryEncounters.outcomes[second.record.id].credits, 0);
  assert.equal(state.recoveryEncounters.activeId, null);
  assert.deepEqual(receipts.map(receipt => receipt.outcome), ['rescue', 'failed']);
});
