import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';
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
  h.bus.emit('combat:outcome', { sectorId: SECTOR, killerId: h.state.playerId });
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

for (const terminal of ['completed', 'retired']) {
  test(`a ${terminal} bound wreck cannot be offered again through its gone victim`, () => {
    const h = makeHarness();
    const wrecks = Object.create(aftermathWrecks);
    wrecks.init({ state: h.state, bus: h.bus, helpers: h.helpers });
    const deck = makeDeck();
    const prompt = createAftermathChoicePrompt({ bus: h.bus, state: h.state, deck });
    try {
      const victim = h.helpers.spawnEntity({ type: 'ship', team: 1, alive: true,
        pos: { x: 95, z: 0 }, vel: { x: 0, z: 0 }, hull: 100, hullMax: 100,
        data: { name: 'Sable Courier', ai: { hostileTeams: [0] } } });
      victim.alive = false;
      victim.hull = 0;
      h.bus.emit('entity:killed', { id: victim.id, type: 'ship', killerId: h.state.playerId });
      const [marker] = h.state.aftermathWrecks.bySector[SECTOR];
      const wreck = h.state.entityList.find(entity => entity.data?.markerId === marker.markerId);
      assert.ok(wreck?.alive, 'the kill minted a live wreck through its owner');
      h.helpers.removeEntity(victim.id, { immediate: true });
      h.bus.flush();
      assert.equal(h.state.combatOutcome.aftermath.targets.salvage, marker.markerId);
      const oldCard = deck.mounted.get('aftermath:field');
      assert.ok(oldCard, 'the nearby witnessed kill mounts a real salvage option');
      assert.match(oldCard.detail, /Wreck: Sable Courier/);

      if (terminal === 'completed') {
        for (const material of Object.keys(wreck.data.salvagePool)) delete wreck.data.salvagePool[material];
        h.bus.emit('salvage:completed', { wreckId: wreck.id, markerId: marker.markerId, source: 'player_beam' });
      } else {
        wreck.alive = false;
        wreck.hull = 0;
        h.bus.emit('entity:killed', { id: wreck.id, type: 'wreck', killerId: h.state.playerId });
      }
      assert.equal(h.state.aftermathWrecks.bySector[SECTOR].length, 0, 'the canonical owner retired the marker');
      assert.equal(deck.mounted.has('aftermath:field'), false, 'the retired option releases the prompt');
      assert.equal(h.state.combatOutcome.aftermath?.targets.salvage ?? null, null);
      oldCard.onChoose('salvage');
      assert.equal(h.state.combatOutcome.chosen, undefined, 'an old click cannot select the drained field');
    } finally { prompt.destroy(); wrecks.destroy(); h.sys.destroy(); }
  });
}

// NOTICE-01: a mounted FIELD RESPONSE card may not sit for minutes after its field ended.
// One offer generation carries one housekeeping TTL (a ttlAt — the deck's undisplayed expiry,
// not a fake countdown), expires through the ordinary deck tick, and can only remount on a
// genuinely new publish.
test('one offer generation carries a housekeeping TTL and cannot pin the lane', () => {
  const h = makeHarness();
  const deck = makeDeck();
  const updates = [];
  deck.updateDecision = (id, spec) => { updates.push(spec); deck.mounted.set(id, spec); return true; };
  createAftermathChoicePrompt({ bus: h.bus, state: h.state, deck });
  const offer = () => ({
    sectorId: SECTOR,
    choices: [{ id: 'salvage', label: 'Salvage' }, { id: 'escape', label: 'Leave' }],
  });

  h.state.aftermathWrecks = { bySector: { [SECTOR]: [{ markerId: 'wreck-1', victimId: 900 }] } };
  h.bus.emit('combat:outcome', { sectorId: SECTOR, killerId: h.state.playerId });
  h.bus.emit('combat:aftermathChoices', offer());
  const spec = deck.mounted.get('aftermath:field');
  assert.ok(spec, 'the witnessed field mounts');
  assert.equal(spec.deadlineAt == null, true, 'no countdown deadline — the offer has no real urgency');
  assert.equal(spec.ttlAt, h.state.simTime + 120, 'one offer generation carries the TTL');

  h.state.simTime += 10;
  h.bus.emit('combat:aftermathChoices', { ...offer(), refreshOnly: true });
  assert.equal(updates.at(-1).ttlAt, spec.ttlAt,
    'a refresh keeps the mounted card\'s remaining time instead of re-arming');

  spec.onExpire();                 // the deck fires this when the TTL passes, then removes the card
  deck.mounted.delete('aftermath:field');
  h.bus.emit('combat:aftermathChoices', { ...offer(), refreshOnly: true });
  assert.equal(deck.mounted.has('aftermath:field'), false,
    'a dead offer generation cannot remount on a refresh');

  h.state.simTime += 200;
  h.bus.emit('combat:aftermathChoices', offer());
  const remounted = deck.mounted.get('aftermath:field');
  assert.ok(remounted, 'a genuinely new publish re-offers the field');
  assert.equal(remounted.ttlAt, h.state.simTime + 120, 'with a fresh TTL');
});

test('a live field keeps its card across a no-op republish', () => {
  const h = makeHarness();
  const deck = makeDeck();
  createAftermathChoicePrompt({ bus: h.bus, state: h.state, deck });

  h.state.aftermathWrecks = { bySector: { [SECTOR]: [{ markerId: 'wreck-1', victimId: 900 }] } };
  h.bus.emit('combat:outcome', { sectorId: SECTOR, killerId: h.state.playerId });
  h.bus.emit('sector:enter');
  assert.equal(deck.mounted.has('aftermath:field'), true);

  h.bus.emit('custody:aftermathChanged');
  assert.equal(deck.mounted.has('aftermath:field'), true, 'a live field keeps its offer mounted');
});
