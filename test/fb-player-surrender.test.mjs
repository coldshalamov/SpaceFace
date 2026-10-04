// FB-119 — a player can surrender to the law: cut engines, hold inside a lawful responder's
// scan cone, and be taken into custody instead of fighting to destruction.
//
// The design contract under test (seed 4242, NETS tier):
//
//   * The verb IS the act: engines cut + slow inside a lawful responder's cone while wanted at
//     NETS/IMPOUND opens the surrender hold — the same door the explicit law:playerSurrender
//     intent reaches.
//   * Holding LAW_SURRENDER_HOLD_S accepts custody: combat:surrendered goes out with
//     player:true, lawful fire stands down (unlawful raiders are NOT disarmed), and exactly one
//     priced bill is posted through the composed-obligation ledger at the impound quote.
//   * The bill is a debt, not a theft: heat is never cleared and no credits are charged.
//   * The refusal voice says why: firing, moving, a dead or out-of-cone responder, a sub-custody
//     sheet, or no responder at all each name their reason on law:surrenderRefused + a toast.
//   * A cancelled hold stays cancelled while the window never broke — firing and then just
//     sitting still is an argument, not compliance. Leave the window once and the verb re-arms.
//   * No teleport: custody is the bill and the stand-down, not a moved ship.

import test from 'node:test';
import assert from 'node:assert/strict';

import { lawSecurity } from '../src/systems/lawSecurity.js';
import { quoteImpoundBill } from '../src/systems/custodyConsequences.js';

const SEED = 4242;
const HOLD_S = 4;

function makeBus() {
  const handlers = new Map();
  const log = [];
  return {
    emitLog: log,
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, []);
      handlers.get(evt).push(fn);
    },
    off(evt, fn) {
      const list = handlers.get(evt) || [];
      handlers.set(evt, list.filter((h) => h !== fn));
    },
    emit(evt, payload) {
      log.push({ evt, payload });
      for (const fn of handlers.get(evt) || []) fn(payload);
      return true;
    },
  };
}

function events(bus, name) {
  return bus.emitLog.filter((row) => row.evt === name);
}

function makeLaw(player = {}) {
  const entities = new Map();
  const state = {
    meta: { seed: SEED },
    simTime: 40,
    tick: 80,
    mode: 'flight',
    playerId: 'player',
    player: { heat: 0, credits: 5000, cargo: { items: {} }, ...player },
    world: { currentSectorId: 'sector_helios_prime' },
    entities,
    entityList: [],
  };
  const bus = makeBus();
  const law = Object.create(lawSecurity);
  law.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  return { state, bus, law, entities };
}

function add(run, entity) {
  run.entities.set(entity.id, entity);
  run.state.entityList.push(entity);
  return entity;
}

// The scripted geometry: a lawful patrol holds the player inside its scan cone (CUSTOMS_SCAN_RANGE
// is 90, half-angle 0.55 off heading rot=0 → +x). The player is dead slow, engines cut.
function custodyScene({ heat = 0.65, credits = 5000, withRaider = true } = {}) {
  const run = makeLaw({ heat, credits });
  const player = add(run, {
    id: 'player', type: 'ship', alive: true,
    pos: { x: 40, z: 5000 }, vel: { x: 0, z: 0 }, rot: 0, data: {},
  });
  const patrol = add(run, {
    id: 'patrol', type: 'ship', alive: true, rot: 0, factionId: 'faction_scn',
    pos: { x: 0, z: 5000 },
    data: { ai: { lawful: true }, intent: { fire: true }, combat: { targetId: 'player' } },
  });
  let raider = null;
  if (withRaider) {
    raider = add(run, {
      id: 'raider', type: 'ship', alive: true, rot: 0, factionId: 'faction_reach',
      pos: { x: 0, z: 5600 },
      data: { ai: { lawful: false }, intent: { fire: true }, combat: { targetId: 'player' } },
    });
  }
  return { run, player, patrol, raider };
}

test('the verb is the act: holding still in a lawful cone opens the hold and accepts custody', () => {
  const { run, player, patrol, raider } = custodyScene();
  const { law, bus, state } = run;

  // No explicit ask — the physical window alone arms the hold on the next law tick.
  law.update(1 / 60, state);
  const hold = state.lawSecurity.playerSurrender;
  assert.ok(hold, 'the act of holding still inside the cone opens the surrender hold');
  assert.equal(hold.phase, 'holding');
  assert.equal(events(bus, 'law:surrenderHold').length, 1);
  assert.equal(events(bus, 'law:surrenderRefused').length, 0, 'a physical hold is never a refusal');

  // The hold accepts inside 6 s of wall hold — 4 s of accrued sim time is the rule.
  for (let i = 0; i < 360 && hold.phase === 'holding'; i++) law.update(1 / 60, state);
  assert.equal(hold.phase, 'accepted', 'the hold accepts well inside the 6 s window');
  const accepted = events(bus, 'law:surrenderAccepted');
  assert.equal(accepted.length, 1, 'custody accepts exactly once');
  assert.equal(accepted[0].payload.priceCr, quoteImpoundBill(state.player));
  const surrendered = events(bus, 'combat:surrendered');
  assert.equal(surrendered.length, 1);
  assert.equal(surrendered[0].payload.player, true, 'the player variant of combat:surrendered');

  // Stand-down: every lawful engager drops the player target; the unlawful raider does not.
  assert.equal(patrol.data.intent.fire, false);
  assert.equal(patrol.data.ai.passive, true);
  assert.equal(patrol.data.combat.targetId, null);
  assert.equal(raider.data.intent.fire, true, 'the law’s custody never disarms a pirate');

  // Exactly one priced bill, at the impound quote — a debt, not a theft.
  const bills = law.composedDisposition().filter((row) => row.label === 'surrender');
  assert.equal(bills.length, 1, 'one surrender bill is posted');
  assert.equal(bills[0].amountCr, quoteImpoundBill(state.player));
  assert.equal(bills[0].advertisePay, true);
  assert.equal(state.player.heat, 0.65, 'surrender never clears heat for free');
  assert.equal(events(bus, 'heat:clear').length, 0);
  assert.equal(events(bus, 'economy:chargeCredits').length, 0, 'the bill is posted, not charged');
});

test('an explicit ask with no lawful responder is refused and says why', () => {
  const run = makeLaw({ heat: 0.65 });
  const { law, bus, state } = run;
  add(run, {
    id: 'player', type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {},
  });
  const refused = law._beginPlayerSurrender();
  assert.equal(refused.reason, 'no_responder');
  assert.equal(events(bus, 'law:surrenderRefused').length, 1);
  const toast = events(bus, 'toast').pop();
  assert.ok(toast, 'the refusal voice says why');
  assert.match(toast.payload.text, /no lawful cone/i);
  assert.equal(state.lawSecurity.playerSurrender, undefined, 'a refusal never opens a hold');
});

test('a sub-custody sheet is refused: the fine door answers, not custody', () => {
  const { run } = custodyScene({ heat: 0.2, withRaider: false });
  const { law, bus, state } = run;
  const refused = law._beginPlayerSurrender();
  assert.equal(refused.reason, 'not_in_custody_tier');
  assert.equal(refused.tier, 'scan');
  assert.match(events(bus, 'toast').pop().payload.text, /custody tier/i);
  // And the auto-verb never arms on a scan sheet either.
  for (let i = 0; i < 120; i++) law.update(1 / 60, state);
  assert.equal(state.lawSecurity.playerSurrender, undefined);
});

test('firing through the hold breaks the surrender and posts no bill', () => {
  const { run } = custodyScene();
  const { law, bus, state } = run;
  law.update(1 / 60, state);
  assert.equal(state.lawSecurity.playerSurrender.phase, 'holding');

  bus.emit('combat:fire', { ownerId: 'player', targetId: 'patrol' });
  law.update(1 / 60, state);
  assert.equal(state.lawSecurity.playerSurrender.phase, 'cancelled');
  assert.equal(state.lawSecurity.playerSurrender.reason, 'fired');
  const refusal = events(bus, 'law:surrenderRefused').pop();
  assert.equal(refusal.payload.reason, 'fired');
  assert.match(events(bus, 'toast').pop().payload.text, /fired through the hold/i);
  assert.equal(events(bus, 'law:surrenderAccepted').length, 0);
  assert.equal(law.composedDisposition().some((row) => row.label === 'surrender'), false);

  // Sitting still after firing is an argument, not compliance: the cancelled hold must not
  // quietly re-arm while the window never broke.
  for (let i = 0; i < 300; i++) law.update(1 / 60, state);
  assert.equal(state.lawSecurity.playerSurrender.phase, 'cancelled',
    'a cancelled hold holds while the window never broke');

  // Break the window once — spool engines — and the verb re-arms for a deliberate hold.
  state.entities.get('player').vel = { x: 5, z: 0 };
  law.update(1 / 60, state);
  state.entities.get('player').vel = { x: 0, z: 0 };
  law.update(1 / 60, state);
  assert.equal(state.lawSecurity.playerSurrender.phase, 'holding',
    'a fresh deliberate hold opens after the window broke once');
});

test('moving out of the hold or losing the responder cancels the custody take', () => {
  const moving = custodyScene();
  moving.run.law.update(1 / 60, moving.run.state);
  assert.equal(moving.run.state.lawSecurity.playerSurrender.phase, 'holding');
  moving.player.vel = { x: 2, z: 0 };
  moving.run.law.update(1 / 60, moving.run.state);
  assert.equal(moving.run.state.lawSecurity.playerSurrender.phase, 'cancelled');
  assert.equal(moving.run.state.lawSecurity.playerSurrender.reason, 'moving');

  const lost = custodyScene();
  lost.run.law.update(1 / 60, lost.run.state);
  assert.equal(lost.run.state.lawSecurity.playerSurrender.phase, 'holding');
  lost.patrol.alive = false; // the responder is gone mid-hold
  lost.run.law.update(1 / 60, lost.run.state);
  assert.equal(lost.run.state.lawSecurity.playerSurrender.phase, 'cancelled');
  assert.equal(lost.run.state.lawSecurity.playerSurrender.reason, 'no_responder');
});

test('a second ask after acceptance is idempotent — one bill, one surrender', () => {
  const { run } = custodyScene();
  const { law, bus, state } = run;
  law.update(1 / 60, state);
  for (let i = 0; i < 360; i++) law.update(1 / 60, state);
  assert.equal(state.lawSecurity.playerSurrender.phase, 'accepted');

  const again = law._beginPlayerSurrender();
  assert.equal(again.already, true);
  assert.equal(again.phase, 'accepted');
  assert.equal(events(bus, 'law:surrenderAccepted').length, 1);
  assert.equal(events(bus, 'combat:surrendered').length, 1);
  assert.equal(law.composedDisposition().filter((row) => row.label === 'surrender').length, 1);
});
