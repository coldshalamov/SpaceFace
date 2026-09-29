// FIGHT-03: a draft pick's note is built by the module that authors and validates it.
// A malformed note is refused. The weapon still fits, and the draft still closes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { TECH_NODES } from '../src/data/tech.js';
import { runModifierRecord, validateRunModifier } from '../src/data/runModifiers.js';
import { economy } from '../src/systems/economy.js';
import { runSession } from '../src/systems/runSession.js';
import { ships } from '../src/systems/ships.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';

const ARENA = 'helios_core';
const SEED = 4242;

function boot() {
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  const ctx = {
    state, bus, helpers: {},
    registry: {
      get(name) {
        if (name === 'ships') return ships;
        if (name === 'economy') return economy;
        if (name === 'survivalDraft') return survivalDraft;
        return null;
      },
    },
  };
  economy.init(ctx);
  ships.init(ctx);
  if (economy.newGame) economy.newGame();
  if (ships.newGame) ships.newGame();
  runSession.init(ctx);
  survivalDraft.init(ctx);
  state.player.researchPoints += TECH_NODES.reduce((sum, node) => sum + ((node.cost && node.cost.rp) || 0), 0) + 1000;
  const creditCost = TECH_NODES.reduce((sum, node) => sum + ((node.cost && node.cost.credits) || 0), 0);
  if (creditCost > 0) economy.grantCredits(creditCost, 'test:tech');
  for (let pass = 0; pass < TECH_NODES.length + 1; pass++) {
    let progressed = false;
    for (const node of TECH_NODES) {
      if (!state.player.researchedNodes.includes(node.id) && ships.unlockTech(node.id)) progressed = true;
    }
    if (!progressed) break;
  }
  ships.buyShip({ defId: 'ship_kestrel', setActive: true, grant: true });
  const fittings = state.player.ownedShips[state.player.activeShipIndex].fittings;
  if (fittings[0]) ships.unfitModule({ slotIndex: 0 });
  return { state, bus, emitted };
}

function enterDraft(harness) {
  harness.bus.emit('run:beginRequested', {
    kind: 'survival', ruleset: 'scored', seed: SEED, arenaId: ARENA,
  });
  let from = 'loadout';
  for (const next of ['arena_intro', 'wave_intro', 'active', 'cleanup', 'draft']) {
    harness.bus.emit('run:transitionRequested', {
      expectedPhase: from, nextPhase: next, reason: 't', tick: 0,
    });
    from = next;
  }
  harness.state.run.wave = 1;
}

function named(emitted, event) {
  return emitted.filter((entry) => entry.event === event);
}

test('a kestrel pick stores the author record, including an empty hardpoint', () => {
  const harness = boot();
  enterDraft(harness);
  const offer = survivalDraft.currentOffers()[0];
  assert.equal(offer.slotIndex, 0);
  assert.equal(offer.replaces ?? null, null);
  const before = named(harness.emitted, 'run:modifierRecordRequested').length;
  harness.bus.emit('run:draftPickRequested', { offerId: offer.id });
  const notes = named(harness.emitted, 'run:modifierRecordRequested').slice(before);
  assert.equal(notes.length, 1);
  const expected = runModifierRecord({
    kind: 'weapon',
    offerId: offer.id,
    verb: offer.verb,
    defId: offer.defId,
    slotIndex: offer.slotIndex,
    replaced: offer.replaces ?? null,
    wave: 1,
  });
  assert.deepEqual(notes[0].payload.record, expected);
  assert.equal(validateRunModifier(notes[0].payload.record).ok, true);
  assert.equal(notes[0].payload.record.verb, offer.verb);
  assert.deepEqual(harness.state.run.modifiers[0], expected);
  assert.equal(harness.state.player.ownedShips[harness.state.player.activeShipIndex].fittings[0], offer.defId);
});

test('a wave the author rejects still fits the weapon and still closes the draft', () => {
  const malformed = runModifierRecord({ kind: 'weapon', offerId: 'x', defId: 'wpn_pulse_laser_s', wave: 0 });
  assert.equal(validateRunModifier(null).ok, false);
  assert.equal(validateRunModifier(malformed).ok, false);
  assert.equal(validateRunModifier(runModifierRecord({ wave: 1 })).ok, false);
  const dropped = runModifierRecord({
    kind: 'weapon', offerId: 'x', verb: 'Throw', defId: 'wpn_pulse_laser_s', wave: 1,
    consumes: ['mod_bank_shot', ''],
  });
  assert.equal(Object.hasOwn(dropped, 'consumes'), false);

  const harness = boot();
  enterDraft(harness);
  const offer = survivalDraft.currentOffers()[0];
  harness.state.run.wave = 0;
  const mark = harness.emitted.length;
  harness.bus.emit('run:draftPickRequested', { offerId: offer.id });
  const after = harness.emitted.slice(mark);
  assert.equal(after.filter((entry) => entry.event === 'run:modifierRecordRequested').length, 0);
  assert.equal(harness.state.run.modifiers.length, 0);
  assert.equal(after.filter((entry) => entry.event === 'run:draftResolved').length, 1);
  assert.equal(
    harness.state.player.ownedShips[harness.state.player.activeShipIndex].fittings[offer.slotIndex],
    offer.defId,
  );
  const again = harness.emitted.length;
  harness.bus.emit('run:draftPickRequested', { offerId: offer.id });
  const second = harness.emitted.slice(again);
  assert.equal(second.filter((entry) => entry.event === 'run:modifierRecordRequested').length, 0);
  assert.equal(second.filter((entry) => entry.event === 'run:draftResolved').length, 0);
});
