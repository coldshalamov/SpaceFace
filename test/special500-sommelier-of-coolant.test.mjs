// special-500 Phase 2 — SP2-065 "The Sommelier of Coolant" (vendor leg).
//
// The depot bar's retired Choir censer machine pours "the Thursday": a 12 cr purchase at the
// Refuel Depot bar that settles through the canonical owners — the economy owner's
// exact-payment intent (the sole credits writer), the cargo owner's public addCargo for the
// two-cell pour (fuel for the run through the world's ordinary cell path), and the factions
// owner's repDelta intent (the censer remembers patronage). These proofs pin: the canonical
// contact row exists at the depot bar and offers the purchase, the bar reply is the liturgy
// (poured vs unpoured states), a short account or a full hold buys nothing, the purchase is
// once per game, wrong berths and wrong verbs settle nothing, and a duplicate purchase after
// the flag is inert.
import test from 'node:test';
import assert from 'node:assert/strict';

import { special500Sommelier } from '../src/systems/special500Sommelier.js';
import { SOMMELIER } from '../src/data/special500/sommelier.js';
import {
  generateContacts,
  buildReply,
} from '../src/ui/station/barContacts.js';

const CAL_DAY_S = 600;

function stubBus() {
  const listeners = new Map();
  const events = [];
  return {
    events,
    emit(name, payload) {
      events.push({ name, payload });
      for (const fn of listeners.get(name) || []) fn(payload);
    },
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(fn);
      return () => {
        const rows = listeners.get(name) || [];
        const i = rows.indexOf(fn);
        if (i >= 0) rows.splice(i, 1);
      };
    },
    of: (name) => events.filter((e) => e.name === name),
  };
}

function fixtureState({ simTime = 4 * CAL_DAY_S, credits = 500, flags = {}, holdFull = false } = {}) {
  return {
    simTime,
    tick: Math.floor(simTime * 60),
    meta: { seed: 20261104 },
    story: { flags: { ...flags } },
    world: { currentSectorId: 'sector_vesta_forge' },
    player: {
      credits,
      cargo: holdFull
        ? { capVolume: 2, usedVolume: 2, items: {} }
        : { capVolume: 60, usedVolume: 0, items: {} },
    },
    ui: { docked: true, dockedStationId: SOMMELIER.stationId },
  };
}

/** The economy owner's exact-payment contract, in miniature, standing in for the real writer. */
function installEconomyStub(bus, state) {
  bus.on('economy:chargeCredits', (p) => {
    if (!p || typeof p !== 'object') return;
    if (p.requireFull === true) {
      if (p.result === true) return;
      p.result = false;
      const live = Math.max(0, Math.round(Number(state.player.credits) || 0));
      if (live !== p.expectedCredits || live < p.amount) return;
      if (typeof p.commit === 'function' && p.commit() !== true) return;
      state.player.credits = live - p.amount;
      p.result = true;
      return;
    }
    const live = Math.max(0, Math.round(Number(state.player.credits) || 0));
    state.player.credits = Math.max(0, live - Math.max(0, Math.round(Number(p.amount) || 0)));
  });
}

function boot(bus, state) {
  const system = Object.create(special500Sommelier);
  system.init({ bus, state });
  return system;
}

const talk = (state) => ({ canonicalKey: SOMMELIER.contactKey, stationId: SOMMELIER.stationId, choiceId: SOMMELIER.choiceId });

test('the depot bar carries the canonical contact, offers the pour, and reads its two states', () => {
  const state = fixtureState();
  const contacts = generateContacts(SOMMELIER.stationId, state);
  const sommelier = contacts.find((c) => c.canonicalKey === SOMMELIER.contactKey);
  assert.ok(sommelier, 'the retired censer pours at the Refuel Depot bar');
  assert.equal(sommelier.factionId, 'faction_choir', 'the depot bar is Choir-run');
  assert.ok(sommelier.choices.some((c) => c.id === SOMMELIER.choiceId), 'the rail offers the Thursday');
  const ctx = { state, bus: null };
  const unpoured = buildReply(sommelier.role, SOMMELIER.choiceId, ctx, SOMMELIER.stationId, sommelier);
  assert.ok(unpoured && /You will taste the Thursday/.test(unpoured.text), 'the liturgy is the unpoured reply');
  state.story.flags[SOMMELIER.pourFlag] = state.simTime;
  const poured = buildReply(sommelier.role, SOMMELIER.choiceId, ctx, SOMMELIER.stationId, sommelier);
  assert.ok(poured && /does not repeat it/.test(poured.text), 'the poured state remembers, and does not repeat');
});

test('buying the Thursday charges 12 cr, pours two fuel cells, and the Choir remembers', () => {
  const bus = stubBus();
  const state = fixtureState({ credits: 500 });
  installEconomyStub(bus, state);
  const system = boot(bus, state);
  const result = system._onTalkContact(talk(state));
  assert.equal(result.outcome, 'settled');
  const charges = bus.of('economy:chargeCredits');
  assert.equal(charges.length, 1);
  assert.equal(charges[0].payload.amount, SOMMELIER.pourCr);
  assert.equal(charges[0].payload.result, true, 'the exact-payment request settled');
  assert.equal(state.player.credits, 500 - SOMMELIER.pourCr, 'the account is out the pour price only');
  assert.equal(state.player.cargo.items[SOMMELIER.pourCommodity], SOMMELIER.pourCells, 'two unsealed cells ride the hold');
  const rep = bus.of('faction:repDelta');
  assert.equal(rep.length, 1);
  assert.equal(rep[0].payload.factionId, 'faction_choir');
  assert.equal(rep[0].payload.delta, SOMMELIER.choirRepDelta, 'the censer remembers patronage');
  assert.equal(state.story.flags[SOMMELIER.pourFlag] > 0, true, 'the pour flag is the one-time gate');
  assert.equal(bus.of(SOMMELIER.receiptEvent).some((e) => e.payload.outcome === 'settled'), true);
  assert.equal(bus.of('comms:log').length, 1, 'the pour lands on the log');
});

test('a short account buys nothing: no charge, no pour, no rep', () => {
  const bus = stubBus();
  const state = fixtureState({ credits: 5 });
  installEconomyStub(bus, state);
  const system = boot(bus, state);
  const result = system._onTalkContact(talk(state));
  assert.equal(result.outcome, 'short');
  assert.equal(state.player.credits, 5);
  assert.equal(state.player.cargo.items[SOMMELIER.pourCommodity], undefined);
  assert.equal(bus.of('faction:repDelta').length, 0);
  assert.equal(state.story.flags[SOMMELIER.pourFlag], undefined);
});

test('a full hold refuses the pour: the censer does not half-pour a vintage', () => {
  const bus = stubBus();
  const state = fixtureState({ credits: 500, holdFull: true });
  installEconomyStub(bus, state);
  const system = boot(bus, state);
  const result = system._onTalkContact(talk(state));
  assert.equal(result.outcome, 'no_room');
  assert.equal(bus.of('economy:chargeCredits').length, 0, 'no charge without room for the pour');
  assert.equal(state.story.flags[SOMMELIER.pourFlag], undefined);
});

test('wrong berths and wrong verbs settle nothing', () => {
  const bus = stubBus();
  const state = fixtureState({ credits: 500 });
  installEconomyStub(bus, state);
  const system = boot(bus, state);
  assert.equal(system._onTalkContact({ canonicalKey: SOMMELIER.contactKey, stationId: 'station_forge', choiceId: SOMMELIER.choiceId }), null);
  assert.equal(system._onTalkContact({ canonicalKey: SOMMELIER.contactKey, stationId: SOMMELIER.stationId, choiceId: 'ask_vintages' }), null);
  assert.equal(system._onTalkContact({ canonicalKey: 'painter', stationId: SOMMELIER.stationId, choiceId: SOMMELIER.choiceId }), null);
  assert.equal(bus.of('economy:chargeCredits').length, 0, 'nothing charged');
  assert.equal(state.story.flags[SOMMELIER.pourFlag], undefined);
});

test('the purchase is once per game: a duplicate ask is inert after the pour', () => {
  const bus = stubBus();
  const state = fixtureState({ credits: 500 });
  installEconomyStub(bus, state);
  const system = boot(bus, state);
  system._onTalkContact(talk(state));
  const again = system._onTalkContact(talk(state));
  assert.equal(again.outcome, 'already');
  assert.equal(bus.of('economy:chargeCredits').length, 1, 'one charge, ever');
  assert.equal(bus.of('faction:repDelta').length, 1, 'one rep tick, ever');
  assert.equal(state.player.cargo.items[SOMMELIER.pourCommodity], SOMMELIER.pourCells, 'no second pour');
});

test('a stale save with the pour flag already set reads as poured, not as a new purchase', () => {
  const bus = stubBus();
  const state = fixtureState({ credits: 500, flags: { [SOMMELIER.pourFlag]: 3 * CAL_DAY_S } });
  installEconomyStub(bus, state);
  const system = boot(bus, state);
  const result = system._onTalkContact(talk(state));
  assert.equal(result.outcome, 'already');
  assert.equal(state.player.credits, 500, 'the old pour is not charged again');
  assert.equal(state.player.cargo.items[SOMMELIER.pourCommodity], undefined);
});
