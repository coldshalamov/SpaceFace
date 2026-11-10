// Wave F §22.8 row F5 — "A near miss talks."
//
// When a player-thrown or shoved body passes within BODY_NEAR_MISS_RADIUS_WU of a
// civilian or patrol witness without hitting, that witness emits one bark naming the
// danger in plain words. One bark per pass; a second pass after the cooldown may bark
// again; a hit never fires the near-miss bark. The player's own hull flying through
// traffic is never a witness.
//
// This fixture drives the real barkDirector advance on scripted passes, seeds 4242/8008.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  BODY_NEAR_MISS_COOLDOWN_TICKS,
  BODY_NEAR_MISS_EXIT_WU,
  barkDirector,
} from '../src/systems/barkDirector.js';

const SEEDS = [4242, 8008];

function makeHarness(seed) {
  const state = createGameState(seed);
  state.mode = 'flight';
  const bus = createBus();
  const said = [];
  const receipts = [];
  const helpers = {
    voice: {
      say: (line) => { said.push(line); return true; },
    },
  };
  bus.on('barkDirector:bodyNearMiss', (receipt) => receipts.push(receipt));

  const player = {
    id: 1, type: 'ship', team: 0, alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 4, factionId: 'player', data: {},
  };
  const hull = {
    id: 2, type: 'ship', team: 1, alive: true, pos: { x: 200, z: 0 }, vel: { x: 0, z: 0 },
    radius: 4, factionId: 'faction_reach', data: {},
  };
  const witness = {
    id: 3, type: 'ship', team: 2, alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 4, factionId: 'faction_free', data: {},
  };
  for (const e of [player, hull, witness]) {
    state.entities.set(e.id, e);
    state.entityList.push(e);
  }
  state.playerId = player.id;

  const system = Object.create(barkDirector);
  system.init({ state, bus, helpers });
  return { state, bus, system, player, hull, witness, said, receipts };
}

function step(system, state, ticks = 1) {
  for (let i = 0; i < ticks; i += 1) {
    state.tick = (state.tick | 0) + 1;
    state.simTime = (Number(state.simTime) || 0) + 1 / 60;
    system.update(1 / 60, state);
  }
}

// Fly the hull along the witness's +x axis through the given distances, one tick each.
function flyPass(harness, distances) {
  const { system, state, hull, witness } = harness;
  for (const d of distances) {
    hull.pos.x = witness.pos.x + d;
    hull.pos.z = witness.pos.z;
    step(system, state, 1);
  }
}

const APPROACH = [120, 100, 80, 60, 50, 60, 80, 100, 120];

for (const seed of SEEDS) {
  test(`a thrown hull passing a civilian barks exactly once (seed ${seed})`, () => {
    const harness = makeHarness(seed);
    try {
      harness.bus.emit('tether:released', { targetId: harness.hull.id });
      flyPass(harness, APPROACH);
      assert.equal(harness.receipts.length, 1);
      const receipt = harness.receipts[0];
      assert.equal(receipt.entityId, harness.witness.id);
      assert.equal(receipt.bodyId, harness.hull.id);
      assert.equal(receipt.source, 'throw');
      assert.match(receipt.text, /nearly hit us/, 'the bark names the danger in plain words');
      assert.equal(harness.said.length, 1);
      assert.equal(harness.said[0].kind, 'bodyNearMiss');
    } finally {
      harness.system.destroy();
    }
  });

  test(`a second pass after the cooldown barks again (seed ${seed})`, () => {
    const harness = makeHarness(seed);
    try {
      harness.bus.emit('tether:released', { targetId: harness.hull.id });
      flyPass(harness, APPROACH);
      assert.equal(harness.receipts.length, 1);
      // Parked past the exit radius for the cooldown, the pass re-arms.
      harness.hull.pos.x = harness.witness.pos.x + BODY_NEAR_MISS_EXIT_WU + 40;
      step(harness.system, harness.state, BODY_NEAR_MISS_COOLDOWN_TICKS + 5);
      flyPass(harness, APPROACH);
      assert.equal(harness.receipts.length, 2);
    } finally {
      harness.system.destroy();
    }
  });

  test(`a hit never fires the near-miss bark (seed ${seed})`, () => {
    const harness = makeHarness(seed);
    try {
      harness.bus.emit('tether:released', { targetId: harness.hull.id });
      flyPass(harness, [120, 100, 80]);
      harness.bus.emit('physics:impact', { aId: harness.hull.id, bId: harness.witness.id });
      flyPass(harness, [60, 50, 60, 80, 100, 120]);
      assert.equal(harness.receipts.length, 0);
      assert.equal(harness.said.length, 0);
    } finally {
      harness.system.destroy();
    }
  });
}
