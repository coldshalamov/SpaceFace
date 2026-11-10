import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { provenanceLedger } from '../src/systems/provenanceLedger.js';

function boot() {
  const sim = createSimulation({ seed: 43117, systems: [provenanceLedger] });
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = 'sector_helios_prime';
  return sim;
}

test('a remote named claim keeps its own history rather than a recent unrelated crime', () => {
  const sim = boot();
  sim.bus.emit('law:incidentReceipt', { incidentId: 'unrelated', targetId: 'hauler-a',
    sectorId: 'sector_helios_prime', cause: 'assault', outcome: 'witnessed' });
  const crime = sim.state.provenance.chains[0];
  const oldNodes = crime.nodes.length;
  sim.bus.emit('claim:defenseResolved', { bodyId: 'claim-c', defenseId: 'defense-c',
    sectorId: 'sector_ceres_belt', outcome: 'defended', text: 'The yard held.' });
  sim.bus.emit('claim:raidRepelled', { bodyId: 'claim-c', defenseId: 'defense-c' });
  const claim = sim.state.provenance.chains.find((c) => c.nodes.some((n) => n.bodyId === 'claim-c'));
  assert.equal(sim.state.provenance.chains.length, 2);
  assert.notEqual(claim.id, crime.id);
  assert.equal(claim.sectorId, 'sector_ceres_belt');
  assert.equal(crime.nodes.length, oldNodes);
  assert.equal(claim.nodes.length, 1, 'generic companion event does not duplicate the detailed outcome');
  sim.state.tick++;
  sim.bus.emit('claim:defenseResolved', { bodyId: 'claim-c', defenseId: 'defense-d',
    sectorId: 'sector_ceres_belt', outcome: 'raided', text: 'The next raid took stock.' });
  assert.equal(sim.state.provenance.chains.length, 2);
  assert.equal(claim.nodes.length, 2, 'later outcomes continue the same workpiece history');
  sim.registry.get('provenanceLedger').destroy();
});

test('legacy unnamed claim outcomes use their reported sector for the existing fallback', () => {
  const sim = boot();
  for (const sectorId of ['sector_ceres_belt', 'sector_helios_prime']) {
    sim.bus.emit('law:incidentReceipt', { incidentId: sectorId, targetId: sectorId,
      sectorId, cause: 'assault', outcome: 'witnessed' });
  }
  const remote = sim.state.provenance.chains.find((c) => c.sectorId === 'sector_ceres_belt');
  const local = sim.state.provenance.chains.find((c) => c.sectorId === 'sector_helios_prime');
  const remoteCount = remote.nodes.length, localCount = local.nodes.length;
  sim.bus.emit('claim:defenseResolved', { sectorId: 'sector_ceres_belt', outcome: 'defended' });
  assert.equal(remote.nodes.length, remoteCount + 1);
  assert.equal(local.nodes.length, localCount);
  sim.registry.get('provenanceLedger').destroy();
});
