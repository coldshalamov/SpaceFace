import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { resetFreshRunSystems } from '../src/core/runReset.js';
import { reactiveMatter } from '../src/systems/reactiveMatter.js';
import { spectrum } from '../src/systems/spectrum/index.js';
import { SPECTRUM_PLACEMENTS } from '../src/data/spectrum/placements.js';
import { orbitalGallery } from '../src/gallery/orbital/system.js';

const SECTOR = 'sector_helios_prime';

function fixture(system) {
  const sim = createSimulation({ seed: 19, systems: [system] });
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = SECTOR;
  sim.state.run = { kind: 'adventure' };
  const player = sim.spawn({ type: 'ship', isPlayer: true, mass: 16, radius: 3,
    pos: { x: -100, z: -100 }, vel: { x: 0, z: 0 }, data: {} });
  sim.state.playerId = player.id;
  return { sim, state: sim.state, owner: sim.registry.get(system.name), player };
}

test('canonical New Game discards old material reactions and rematerializes intact freight', (t) => {
  const { sim, state, owner, player } = fixture(reactiveMatter);
  t.after(() => sim.dispose());
  sim.runTicks(1);
  const priorWorld = state.reactiveMatterWorld;
  const sparKey = `reactive:${SECTOR}:spar`;
  priorWorld.terminal.set(sparKey, 'fractured');
  priorWorld.bodies.get(sparKey).phase = 'fractured';
  owner.pending.push({ aId: player.id, bId: 99, tick: 0, closingSpeed: 100 });
  owner.cues.push({ kind: 'old-reaction' });
  state.reactiveMatterCues = owner.cues.slice();
  state.reactiveMatterLast = { spawned: ['old-fragment'] };
  state.reactiveMatterDemo = { tape: [{ from: 0, to: 100, thrust: 1 }] };
  const owned = state.entityList.filter((e) => e.data?.persistenceOwner === 'reactiveMatter');

  resetFreshRunSystems(sim.registry);
  assert.equal(state.reactiveMatterWorld, null, 'the previous run must release its terminal material ledger');
  assert.deepEqual(owner.pending, [], 'old collision receipts cannot hit recycled entity ids');
  assert.deepEqual(owner.cues, []);
  assert.deepEqual(state.reactiveMatterCues, []);
  assert.equal(state.reactiveMatterLast, null);
  assert.equal(state.reactiveMatterDemo, null);
  assert.ok(owned.every((e) => e.alive === false), 'old live material entities are released');
  assert.equal(player.alive, true);

  sim.runTicks(1);
  assert.notEqual(state.reactiveMatterWorld, priorWorld);
  assert.equal(state.reactiveMatterWorld.terminal.has(sparKey), false);
  assert.equal(state.reactiveMatterWorld.bodies.get(sparKey).phase, 'intact');
  assert.ok(state.entityList.some((e) => e.alive && e.data?.reactiveMatter?.key === sparKey),
    'the fresh run places freight even when the preceding run fractured it');
});

test('canonical New Game clears survey completion, scan deduplication and saved-body residue', (t) => {
  const { sim, state, owner } = fixture(spectrum);
  t.after(() => sim.dispose());
  sim.runTicks(1);
  const firstCase = SPECTRUM_PLACEMENTS[SECTOR][0];
  assert.equal(state.spectrum.caseId, firstCase);
  owner._completed[SECTOR] = [...SPECTRUM_PLACEMENTS[SECTOR]];
  owner._resolvedKeys.add('old-case-resolution');
  owner._savedBodies = [{ key: 'old-body' }];
  owner._pendingResult = { primary: { id: 'old-result' } };
  owner._pulseSeq = 88;
  const results = [];
  sim.bus.on('signal:scanResults', (row) => results.push(row));

  resetFreshRunSystems(sim.registry);
  assert.equal(state.spectrum, null);
  assert.equal(state.spectrumPublic, null);
  assert.deepEqual(owner._completed, {});
  assert.deepEqual(owner._sectorState, {});
  assert.equal(owner._resolvedKeys.size, 0);
  assert.equal(owner._savedBodies, null);
  assert.equal(owner._pulseSeq, 0);
  sim.runTicks(1);
  assert.equal(state.spectrum.caseId, firstCase, 'completed cases belong to the previous run');
  assert.equal(results.some((row) => row.primary?.id === 'old-result'), false);
});

test('canonical New Game delegates gallery teardown and publishes the fresh local ledger', (t) => {
  const { sim, state, owner } = fixture(orbitalGallery);
  t.after(() => sim.dispose());
  state.orbitalGalleryLedger.attempts.old = 3;
  state.orbitalGalleryLedger.best.old = { won: true, total: 20 };
  state.orbitalGallery = { source: 'live', phase: 'settled' };
  state.physicsVenuePublic = { kind: 'gallery', active: true, ledger: state.orbitalGalleryLedger };
  const subscriptions = owner._unsubs.slice();

  resetFreshRunSystems(sim.registry);
  assert.equal(state.orbitalGallery, undefined);
  assert.deepEqual(Object.keys(state.orbitalGalleryLedger.attempts), []);
  assert.deepEqual(Object.keys(state.orbitalGalleryLedger.best), []);
  assert.equal(state.physicsVenuePublic.active, false);
  assert.equal(state.physicsVenuePublic.ledger, state.orbitalGalleryLedger);
  assert.deepEqual(owner._unsubs, subscriptions, 'retained runtime subscriptions stay wired');
});
