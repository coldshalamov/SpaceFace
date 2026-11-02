// INFERENCE WF-02 — pilots who flee at low hull remember you.
// A wing the pilot broke and let run used to vanish: pirateDisengage marked them fleeing and
// forgot them. The wing's leader is now remembered on the moral ledger as a spared escape —
// a named crew the return encounter can bring back, and a name the band's hails can say.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { pirateDisengage } from '../src/systems/pirateDisengage.js';
import {
  ensureMoralMemory,
  nextMoralDebt,
  hailLineForMoralDebt,
} from '../src/systems/moralMemory.js';

function boot() {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.simTime = 500;
  state.tick = 30000;
  const bus = createBus();
  const player = { id: 'pilot', type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, hull: 200, hullMax: 200 };
  state.entities.set('pilot', player);
  state.playerId = 'pilot';
  const member = (id) => ({
    id, type: 'ship', alive: true, team: 3, pos: { x: 300, z: 120 },
    vel: { x: 0, z: 0 }, rot: 0, hull: 40, hullMax: 140,
    factionId: 'faction_reach',
    data: { ai: { roe: 'weapons_free', activity: { kind: 'attack_run', reason: 'raid_run', targetId: 'pilot' } },
      combat: { targetId: 'pilot' }, intent: { fire: true } },
  });
  return { state, bus, player, member };
}

test('a wing the pilot broke and let run is remembered by name', () => {
  const { state, bus, member } = boot();
  pirateDisengage.init({ state, bus, helpers: {}, registry: null });
  const members = [member(31), member(32)];
  for (const m of members) state.entities.set(m.id, m);
  const rec = { squadId: 'raid_0042', reason: 'damage-retreat', outcome: 'fled',
    memberIds: members.map((m) => m.id) };

  pirateDisengage._disengage(rec, members, state.entities.get('pilot'), state.simTime, state);

  const memory = ensureMoralMemory(state);
  const debt = memory.debts['wing:raid_0042'];
  assert.ok(debt, 'the fled wing keeps an account on the ledger');
  assert.equal(debt.cause, 'spared_escape');
  assert.equal(debt.status, 'pending');
  assert.ok(/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(debt.name), `the account carries a person's name (${debt.name})`);
  assert.equal(debt.archetype, 'pirate_squad');
  assert.equal(memory.mercyCount, 1, 'the ledger counts the mercy');
  assert.ok(Array.isArray(debt.witnessIds) && debt.witnessIds.length === 1,
    'a crew witness rode along with the deed');
  // The crew actually fled: every member is marked and the player is off their books.
  assert.equal(members[0].data.ai.fsm, 'flee');
  assert.equal(members[0].data.ai.pirateDisengaged, true);
});

test('the same wing fleeing twice is still one account', () => {
  const { state, bus, member } = boot();
  pirateDisengage.init({ state, bus, helpers: {}, registry: null });
  const members = [member(33)];
  state.entities.set(33, members[0]);
  const rec = { squadId: 'raid_0007', reason: 'wing-loss', outcome: 'fled', memberIds: [33] };
  const threat = state.entities.get('pilot');

  pirateDisengage._disengage(rec, members, threat, state.simTime, state);
  const first = ensureMoralMemory(state).debts['wing:raid_0007'];
  const mercy = ensureMoralMemory(state).mercyCount;
  const witnessCount = ensureMoralMemory(state).witnessOrder.length;

  pirateDisengage._disengage(rec, members, threat, state.simTime + 60, state);
  const memory = ensureMoralMemory(state);
  assert.equal(memory.debts['wing:raid_0007'], first, 'the dedupe returns the same record');
  assert.equal(memory.mercyCount, mercy, 'no second mercy counted');
  assert.equal(memory.witnessOrder.length, witnessCount, 'no second witness minted');
});

test('a wing a patrol scared off is not the pilot’s mercy', () => {
  const { state, bus, member } = boot();
  pirateDisengage.init({ state, bus, helpers: {}, registry: null });
  const members = [member(34)];
  state.entities.set(34, members[0]);
  const patrol = { id: 900, type: 'ship', alive: true, team: 1, pos: { x: 20, z: 0 }, vel: { x: 0, z: 0 } };
  state.entities.set(900, patrol);
  const rec = { squadId: 'raid_0009', reason: 'lawful-patrol-nearby', outcome: 'fled', memberIds: [34] };

  pirateDisengage._disengage(rec, members, patrol, state.simTime, state);
  const memory = ensureMoralMemory(state);
  assert.equal(memory.debts['wing:raid_0009'], undefined, 'no account for a patrol scare');
  assert.equal(memory.mercyCount, 0);
});

test('the remembered wing can come back and the band says the name', () => {
  const { state, bus, member } = boot();
  pirateDisengage.init({ state, bus, helpers: {}, registry: null });
  const members = [member(35)];
  state.entities.set(35, members[0]);
  const rec = { squadId: 'raid_0011', reason: 'damage-retreat', outcome: 'fled', memberIds: [35] };
  pirateDisengage._disengage(rec, members, state.entities.get('pilot'), state.simTime, state);

  const memory = ensureMoralMemory(state);
  const debt = nextMoralDebt(state);
  assert.ok(debt, 'the fled wing is a returnable account');
  assert.equal(debt.id, 'wing:raid_0011');
  const line = hailLineForMoralDebt(state, debt.id);
  assert.ok(line && line.includes(debt.name), `a hail speaks the remembered name (${line})`);
});
