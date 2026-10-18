import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { combatOutcome } from '../src/systems/combatOutcome.js';
import { createAftermathChoicePrompt } from '../src/ui/aftermathChoicePrompt.js';

const SECTOR = 'sector_tethys_junction';

// A wreck-marker field with no kill receipt: the card mounts on sector:enter
// (salvage + escape), then the marker drains in-sector (salvage consumed it,
// cleanup, expiry). The field no longer exists — the mounted card must be
// resolved so it stops borrowing the answer digits.
function makeHarness() {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.tick = 40;
  state.simTime = 1;
  state.ui = {};
  state.world = { currentSectorId: SECTOR, sectors: {} };
  const bus = createBus();
  const helpers = {};
  helpers.voice = { say() { return true; } };
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, team: 0,
    hull: 100, hullMax: 100, data: { ai: { passive: true } },
  });
  state.playerId = player.id;
  player.isPlayer = true;
  Object.assign(state.entityIndex, {
    ready: true, __spacefaceEntityIndexV1: true, ships: [player], shipLike: [player], version: 1,
  });
  const sys = Object.create(combatOutcome);
  sys.init({ state, bus, helpers, registry: null });
  return { state, bus, sys, helpers };
}

function makeDeck() {
  const mounted = new Map();
  return {
    mounted,
    offerDecision(spec) { mounted.set(spec.id, spec); return true; },
    resolveDecision(id) { mounted.delete(id); return true; },
  };
}

test('a mounted aftermath card resolves when its field drains in-sector', () => {
  const h = makeHarness();
  const deck = makeDeck();
  createAftermathChoicePrompt({ bus: h.bus, state: h.state, deck });

  // Pre-existing field wreck, no fight receipt: salvage + escape mounts the card.
  h.state.aftermathWrecks = { bySector: { [SECTOR]: [{ markerId: 'wreck-1', victimId: 900 }] } };
  h.bus.emit('sector:enter');
  assert.equal(deck.mounted.has('aftermath:field'), true, 'card should mount on the live field');
  assert.deepEqual(
    deck.mounted.get('aftermath:field').choices.map((c) => c.id),
    ['salvage', 'escape'],
  );

  // In-sector drain: the marker is gone (salvaged through gameplay, cleanup, expiry).
  h.state.aftermathWrecks.bySector[SECTOR] = [];
  // Any republish seam reaches the same recompute — custody is a public bus event.
  h.bus.emit('custody:aftermathChanged');

  assert.equal(
    deck.mounted.has('aftermath:field'), false,
    'the dead field must resolve its card instead of leaving the digits claimed',
  );
});

test('a live field keeps its card across a no-op republish', () => {
  const h = makeHarness();
  const deck = makeDeck();
  createAftermathChoicePrompt({ bus: h.bus, state: h.state, deck });

  h.state.aftermathWrecks = { bySector: { [SECTOR]: [{ markerId: 'wreck-1', victimId: 900 }] } };
  h.bus.emit('sector:enter');
  assert.equal(deck.mounted.has('aftermath:field'), true);

  h.bus.emit('custody:aftermathChanged');
  assert.equal(deck.mounted.has('aftermath:field'), true, 'a live field keeps its offer mounted');
});
