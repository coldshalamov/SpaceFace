import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { scanner } from '../src/systems/scanner.js';

function fixture() {
  const sim = createSimulation({ seed: 4242, systems: [scanner] });
  const { state } = sim;
  state.mode = 'flight'; state.input.actions = {};
  state.world.currentSectorId = 'sector_inference26_known';
  state.world.activeSector = { id: state.world.currentSectorId, pois: [] };
  const player = sim.spawn({ type: 'ship', team: 0, radius: 10, hull: 100,
    pos: { x: 0, z: 0 }, data: {} });
  state.playerId = player.id;
  const communicator = sim.spawn({ type: 'wreck', team: 2, radius: 8, hull: 1,
    pos: { x: 100, z: 0 }, data: { isCommunicator: true, name: 'Emergency Communicator' } });
  const pulse = () => { state.simTime += 8.1; state.input.actions.scanPulse = true; sim.runTicks(1); };
  return { sim, state, player, pulse, id: `signal:entity:${communicator.id}` };
}

test('backing away does not forget an identified distress communicator on the next pulse', () => {
  const h = fixture();
  try {
    h.pulse();
    const first = h.state.signalInvestigation.records[h.id];
    assert.equal(first.classification, 'DISTRESS COMMUNICATOR');
    h.player.pos.x = -900;
    h.pulse();
    const later = h.state.signalInvestigation.records[h.id];
    assert.equal(later.classification, first.classification);
    assert.equal(later.stage, 3);
    assert.equal(later.bestDistance, 100);
    assert.ok(later.distance > first.distance && later.strength < first.strength,
      'the remembered identity does not freeze the live range or strength');
  } finally { h.sim.dispose(); }
});

test('a saved close-range identification remains known on the second distant pulse', () => {
  const h = fixture();
  try {
    h.pulse();
    const system = h.sim.registry.get('scanner');
    system.deserialize(JSON.parse(JSON.stringify(system.serialize())));
    h.player.pos.x = -900;
    h.pulse();
    assert.equal(h.state.signalInvestigation.records[h.id].classification, 'DISTRESS COMMUNICATOR');
    assert.equal(h.state.signalInvestigation.records[h.id].scanCount, 2);
  } finally { h.sim.dispose(); }
});
