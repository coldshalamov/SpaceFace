import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { FRESH_RUN_SYSTEMS, resetFreshRunSystems } from '../src/core/runReset.js';
import { scanner } from '../src/systems/scanner.js';
import { admitNpcCounterplayBark, barkDirector } from '../src/systems/barkDirector.js';

// The scanner pulse cooldown is an absolute simTime deadline held on the system instance,
// never serialized. New Game and loading an older save both restart the clock below that
// deadline, so without a lifecycle reset one late-run pulse disables scanning for the
// whole next run. Reset must come through the canonical FRESH_RUN_SYSTEMS registry pass —
// the same path main.resetRunState drives — not a hand-called hook.

function boot(systems = [scanner]) {
  const sim = createSimulation({ seed: 9021, systems });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.input.actions = state.input.actions || {};
  state.world.currentSectorId = 'sector_test_signals';
  state.world.activeSector = { id: 'sector_test_signals', pois: [] };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 10, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  const pulses = [];
  bus.on('scan:pulse', (p) => pulses.push(p));
  return { sim, state, bus, player, pulses };
}

function pulse(t) {
  t.state.input.actions.scanPulse = true;
  t.sim.runTicks(1);
}

test('canonical fresh-run reset clears scanner cooldown/state and bark receipt cache', () => {
  assert.ok(FRESH_RUN_SYSTEMS.includes('scanner'), 'scanner participates in New Game reset');
  assert.ok(FRESH_RUN_SYSTEMS.includes('barkDirector'), 'barkDirector participates in New Game reset');

  const t = boot([scanner, barkDirector]);
  const { state } = t;

  // A pulse at a late-run clock holds the scanner for 8 s of sim time.
  state.simTime = 3600;
  pulse(t);
  assert.equal(t.pulses.length, 1);
  pulse(t);
  assert.equal(t.pulses.length, 1, 'immediate re-pulse is inside the cooldown');
  state.simTime = 3607;
  pulse(t);
  assert.equal(t.pulses.length, 1, 'still locked 7 s after the pulse');
  state.simTime = 3609;
  pulse(t);
  assert.equal(t.pulses.length, 2, 'cooldown expired: pulse is allowed again');

  // Seed the run-local state a New Game must not inherit — including ephemeral
  // absolute-simTime latches on the barkDirector instance itself.
  state.signalInvestigation.completed['sig_old'] = { id: 'sig_old', outcome: 'investigated' };
  state.signalInvestigation.receipts.push({ id: 'sig_old', outcome: 'investigated', completedAt: 3590 });
  state.barkDirector.entities['1'] = {
    entityId: '1', factionId: 'faction_reach', lastSituation: 'warn',
    lastSpokenAt: 3590, said: { warn: true }, history: [{ situation: 'warn' }],
  };
  const bark = t.sim.registry.get('barkDirector');
  bark._npcCounterplayAt = 3600;
  bark._bodyNearMisses.set(999, { until: 9999 });

  // main.resetRunState restarts the clock before resetFreshRunSystems runs.
  state.simTime = 0;
  resetFreshRunSystems(t.sim.registry);

  assert.deepEqual(state.signalInvestigation.receipts, []);
  assert.deepEqual(state.signalInvestigation.completed, {});
  assert.deepEqual(state.barkDirector.entities, {});
  assert.equal(bark._bodyNearMisses.size, 0, 'old near-miss tracks must not survive New Game');
  assert.ok(
    admitNpcCounterplayBark(bark, { actorId: 'npc_1', role: 'specialist' }, state.simTime),
    'counterplay cadence latch must not carry the old run\'s timestamp into a fresh clock',
  );

  // The old late-run deadline must not follow the fresh clock: scanning works at t≈0.
  pulse(t);
  assert.equal(t.pulses.length, 3, 'scan works immediately after New Game reset');
});

test('deserialize drops the transient pulse cooldown but keeps saved signal state', () => {
  const t = boot([scanner]);
  const { state } = t;
  const instance = t.sim.registry.get('scanner');

  state.simTime = 3600;
  pulse(t);
  assert.equal(t.pulses.length, 1);

  // Persisted signal work rides the serialized sidecar.
  state.signalInvestigation.completed['sig_keep'] = { id: 'sig_keep', outcome: 'investigated' };
  state.signalInvestigation.receipts.push({ id: 'sig_keep', outcome: 'investigated', completedAt: 3590 });
  const saved = instance.serialize();

  // Loading an older save restores a lower clock; the old deadline is meaningless there.
  state.simTime = 100;
  state.signalInvestigation = null;
  instance.deserialize(saved);

  pulse(t);
  assert.equal(t.pulses.length, 2, 'scan is not locked out after loading an earlier save');
  assert.ok(state.signalInvestigation.completed['sig_keep'], 'completed signals survive the load');
  assert.equal(state.signalInvestigation.receipts.length, 1);
  assert.equal(state.signalInvestigation.receipts[0].id, 'sig_keep');
});

test('destroy unsubscribes the ghost-swarm listener; a replacement owns it alone', () => {
  const t = boot([scanner]);
  const { state, bus } = t;
  const first = t.sim.registry.get('scanner');
  const ghostCount = () => state.entityList.filter(
    (e) => e.data && (e.data.isGhost || e.data.ghost),
  ).length;

  first.destroy();
  bus.emit('sensorGhost:swarm', { pos: { x: 0, z: 0 }, count: 2, encounterId: 'demo' });
  assert.equal(ghostCount(), 0, 'a destroyed scanner must not answer swarm events');

  // A replacement on the same bus is the single listener — exactly the asked count spawns.
  const second = Object.assign({}, scanner);
  second.init({ state, bus, helpers: t.sim.helpers, registry: t.sim.registry });
  bus.emit('sensorGhost:swarm', { pos: { x: 0, z: 0 }, count: 2, encounterId: 'demo' });
  assert.equal(ghostCount(), 2, 'one live listener spawns exactly the requested ghosts');
});
