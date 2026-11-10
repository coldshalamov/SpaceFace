// §1.8 comms/hails audit — lifecycle regressions.
//
//   1. The scanner-side heave-to latch (_contactHailHeaveTo) is entity- and simTime-bound but
//      rode across game:new / load / sector boundaries: a fresh run restarts simTime at 0, so a
//      latch stamped near the end of a previous run refused heave-to on every OTHER target
//      until the new clock passed the old deadline.
//   2. When every member of a toll squad died or left the roster mid-demand, the record closed
//      silently (phase 'gone', no pirateParley:resolved) — the decision-deck card kept
//      COMPLY/REFUSE/RUN verbs that all dead-ended on the resolved record until its own
//      deadline+grace expired it.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { scanner } from '../src/systems/scanner.js';
import { pirateParley } from '../src/systems/pirateParley.js';
import { economy } from '../src/systems/economy.js';
import { cargo } from '../src/systems/cargo.js';
import { parleyReceiptText } from '../src/ui/pirateParleyPrompt.js';

function stepSeconds(sim, seconds) {
  sim.runTicks(Math.max(1, Math.ceil(seconds / SIM_DT)));
}

function bootScanner() {
  const granted = [];
  const sim = createSimulation({
    seed: 4701,
    systems: [scanner],
    helpers: {
      traffic: {
        heaveToEntity(id) {
          granted.push(id);
          return { granted: true, untilSimT: sim.state.simTime + 5 };
        },
      },
    },
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 100, hullMax: 100 });
  state.playerId = player.id;
  const availability = { enabled: true, heaveToAvailable: true, kind: 'worker' };
  const hail = (target) => sim.registry.get('scanner')
    ._requestContactHeaveTo(target, availability, { wanted: false, ai: {} });
  return { sim, state, bus, granted, hail };
}

test('heave-to latch does not ride a new run\'s rewound clock', () => {
  const { sim, state, bus, hail } = bootScanner();
  const targetA = sim.spawn({ type: 'ship', team: 2, pos: { x: 100, z: 0 }, data: {} });
  const targetB = sim.spawn({ type: 'ship', team: 2, pos: { x: 200, z: 0 }, data: {} });

  state.simTime = 4000;
  assert.equal(hail(targetA).granted, true, 'first heave-to grants');
  state.simTime = 4006; // past activeUntil, inside the 12 s cool-off
  const refused = hail(targetB);
  assert.equal(refused.granted, false, 'a different target inside the window stays refused');
  assert.equal(refused.reason, 'cooldown');

  // A fresh run restarts simTime at 0. Before the fix the latch kept its 4017 deadline and
  // locked heave-to on every other target for the whole old timestamp.
  state.simTime = 0;
  bus.emit('game:new', {});
  const after = hail(targetB);
  assert.equal(after.granted, true, 'lifecycle reset clears the stale latch');
});

test('heave-to latch does not leak across a sector boundary', () => {
  const { sim, state, bus, hail } = bootScanner();
  const targetA = sim.spawn({ type: 'ship', team: 2, pos: { x: 100, z: 0 }, data: {} });
  const targetB = sim.spawn({ type: 'ship', team: 2, pos: { x: 200, z: 0 }, data: {} });

  state.simTime = 100;
  assert.equal(hail(targetA).granted, true);
  bus.emit('sector:enter', { sectorId: 'sector_elsewhere' });
  // The stamped target is unreachable in the new sector; without the boundary clear, the latch
  // would refuse this different target as 'another_target_active' for up to ~17 s.
  const after = hail(targetB);
  assert.equal(after.granted, true, 'sector:enter clears the entity-bound latch');
});

test('a toll hail resolves when the whole squad dies mid-demand', () => {
  const voices = [];
  const sim = createSimulation({
    seed: 4701,
    systems: [economy, cargo, pirateParley],
    helpers: { voice: { say(payload) { voices.push(structuredClone(payload)); return true; } } },
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_tethys_junction';
  state.world.sectors.sector_tethys_junction = {
    id: 'sector_tethys_junction',
    factionId: 'faction_reach',
    security: 0.25,
  };
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 200, hullMax: 200 });
  state.playerId = player.id;
  state.player.cargo.items = { cmdty_refined_metals: 12 };
  sim.registry.get('cargo').recompute();
  const pirate = sim.spawn({
    type: 'ship', team: 1, factionId: 'faction_reach',
    pos: { x: 140, z: 0 }, hull: 100, hullMax: 100,
    data: {
      ai: { doctrine: 'toll', squadId: 'sq_gone_toll', archetype: 'pirate_raider', spawnContext: 'ambient' },
      intent: { fire: true, moveX: 0, moveZ: 0 },
      combat: { targetId: player.id },
    },
  });
  const resolved = [];
  const demands = [];
  bus.on('pirateParley:demand', (p) => demands.push(structuredClone(p)));
  bus.on('pirateParley:resolved', (p) => resolved.push(structuredClone(p)));

  stepSeconds(sim, 2.5); // scan -> demand lands; the deck card is live now
  assert.ok(demands.length >= 1, 'toll demand surfaced');

  pirate.alive = false; // the hailing crew dies mid-decision
  sim.step();

  const gone = resolved.find((p) => p.outcome === 'gone');
  assert.ok(gone, 'squad loss emits a resolved receipt so the live card closes');
  assert.equal(gone.squadId, 'sq_gone_toll');
  assert.equal(state.pirateParley.squads.sq_gone_toll.phase, 'gone');
});

test('the gone receipt reads as a lost hail, not a bare outcome word', () => {
  assert.match(parleyReceiptText({ outcome: 'gone' }), /hail lost|channel closed/i);
});
