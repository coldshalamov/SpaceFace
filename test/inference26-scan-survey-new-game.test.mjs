import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { resetFreshRunSystems } from '../src/core/runReset.js';
import { scanner } from '../src/systems/scanner.js';
import { scanReveal } from '../src/systems/scanReveal.js';

test('the canonical New Game reset starts a fresh wreck-survey career on the same seed', () => {
  const sim = createSimulation({ seed: 4242, systems: [scanner, scanReveal] });
  try {
    const { state, bus } = sim;
    state.mode = 'flight';
    state.world.currentSectorId = 'sector_inference26_new_survey';
    state.world.sectors = { [state.world.currentSectorId]: { name: 'New Survey Field' } };
    state.lossLedger = { bySector: { [state.world.currentSectorId]: [{ lossId: 'same-seed-loss',
      sectorId: state.world.currentSectorId, kind: 'trader', factionId: 'faction_drift', simDay: 0, t: 0 }] } };
    const player = sim.spawn({ type: 'ship', team: 0, radius: 10, hull: 100,
      pos: { x: 0, z: 0 }, data: {} });
    state.playerId = player.id;
    const wreck = sim.spawn({ type: 'wreck', team: 2, radius: 8, hull: 1,
      pos: { x: 100, z: 0 }, data: { provenance: { lossId: 'same-seed-loss' },
        salvagePool: { cmdty_scrap_metal: 1 } } });
    const grants = [];
    bus.on('economy:grantCredits', event => grants.push(event));
    bus.emit('scan:pulse', { pos: player.pos });
    assert.equal(grants.length, 1);
    assert.ok(state.scanReveal.investigated['same-seed-loss']);
    assert.equal(resetFreshRunSystems(sim.registry), true);
    assert.deepEqual(state.scanReveal, { investigated: {}, milestones: {} });
    // New Game rematerializes the same seeded loss with a fresh unscanned hull.
    delete wreck.data.scanRevealed;
    bus.emit('scan:pulse', { pos: player.pos });
    assert.equal(grants.length, 2, 'a new career can earn its own first survey payment');
    bus.emit('scan:pulse', { pos: player.pos });
    assert.equal(grants.length, 2, 'the new career still pays only once');
  } finally { sim.dispose(); }
});
