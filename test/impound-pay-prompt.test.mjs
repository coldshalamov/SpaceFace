// The impound clerk's counter — the pay path's missing producer. Standing on the clerk pad
// offers the bill once per arrival; the deck verb emits the shipped law:impoundPay intent and
// the engine re-validates reach and credits before charging.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRegistry } from '../src/core/registry.js';
import { custodyConsequences } from '../src/systems/custodyConsequences.js';
import { economy } from '../src/systems/economy.js';
import { heat } from '../src/systems/heat.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { impoundPayPrompt } from '../src/ui/impoundPayPrompt.js';
import { setPromptDeck } from '../src/ui/promptDeck.js';

const SEED = 15130;
const SECTOR = 'sector_helios_prime';

function boot(seed = SEED) {
  const sim = createSimulation({
    seed,
    systems: [economy, heat, lawSecurity, custodyConsequences, spawnBudget],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  if (!state.world.sectors) state.world.sectors = {};
  state.world.sectors[SECTOR] = { id: SECTOR, factionId: 'faction_scn', security: 0.9, tier: 0 };
  state.player.heat = 0;
  state.player.credits = 5000;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    rot: 0, hull: 200, hullMax: 200, radius: 8, mass: 28,
  });
  state.playerId = player.id;
  const offers = [];
  const recovered = [];
  bus.on('law:impoundPayOffer', (p) => offers.push(p));
  bus.on('law:impoundRecovered', (p) => recovered.push(p));
  return { sim, state, bus, player, offers, recovered };
}

function killLawman(bus, state, id) {
  bus.emit('entity:killed', {
    id,
    killerId: state.playerId,
    type: 'ship',
    victimClass: 'ship',
    factionId: 'faction_scn',
    factionLawful: true,
    targetHostileToPlayer: false,
  });
}

function raiseToImpound(bus, state) {
  bus.emit('faction:aggro', { isAggro: true, factionId: 'faction_scn' });
  killLawman(bus, state, 701);
  killLawman(bus, state, 702);
}

function liveClerk(state) {
  return (state.entityList || []).find((e) => (
    e && e.alive !== false && e.data && e.data.wantedImpoundClerk === true
  ));
}

test('clerk pad offers the bill once per arrival — edge, not a per-tick shout', () => {
  const { sim, state, player, offers } = boot();
  raiseToImpound(sim.bus, state);
  sim.step();
  sim.step();
  const clerk = liveClerk(state);
  assert.ok(clerk, 'a pound clerk staffs the yard');
  assert.equal(offers.length, 0, 'no offer before the player reaches the clerk');

  player.pos.x = clerk.pos.x;
  player.pos.z = clerk.pos.z;
  sim.step();
  assert.equal(offers.length, 1, 'arrival offers the bill');
  assert.equal(offers[0].clear, false);
  assert.ok(offers[0].owedCr > 0, 'the offer carries the real bill');
  sim.step();
  sim.step();
  assert.equal(offers.length, 1, 'holding position does not re-offer');

  player.pos.x = clerk.pos.x + 500;
  player.pos.z = clerk.pos.z + 500;
  sim.step();
  assert.equal(offers.length, 2, 'leaving clears the counter');
  assert.equal(offers[1].clear, true);

  player.pos.x = clerk.pos.x;
  player.pos.z = clerk.pos.z;
  sim.step();
  assert.equal(offers.length, 3, 'returning offers again');
  assert.equal(offers[2].clear, false);
});

test('the deck verb emits law:impoundPay — the intent the engine always listened for', () => {
  const bus = createBus();
  const state = { simTime: 10, tick: 7, ui: {}, player: { credits: 5000 } };
  impoundPayPrompt.init({ bus, state, helpers: {} });

  const specs = [];
  const resolved = [];
  setPromptDeck({
    offerDecision: (spec) => { specs.push(spec); return true; },
    resolveDecision: (id) => resolved.push(id),
  });

  const paid = [];
  const toasts = [];
  bus.on('law:impoundPay', (p) => paid.push(p));
  bus.on('toast', (p) => toasts.push(p));

  bus.emit('law:impoundPayOffer', { poundId: 'p1', billId: 'b1', clerkId: 'c1', owedCr: 900 });
  assert.equal(specs.length, 1);
  assert.equal(specs[0].id, 'impound-pay');
  assert.ok(specs[0].choices.some((c) => c.id === 'pay'));
  assert.equal(state.ui.impoundPayPrompt.owedCr, 900);

  specs[0].onChoose('pay');
  assert.equal(paid.length, 1, 'PAY emits the shipped intent');
  assert.deepEqual(resolved, ['impound-pay']);
  assert.equal(state.ui.impoundPayPrompt, undefined);

  // The engine's refusal comes back as words — a short purse names the other ways out.
  bus.emit('law:impoundPayRefused', { reason: 'short', owedCr: 900, credits: 40 });
  assert.ok(toasts.some((t) => /SHORT/.test(t.text)));

  // Leaving the pad clears the decision without an intent.
  bus.emit('law:impoundPayOffer', { poundId: 'p1', billId: 'b1', clerkId: 'c1', owedCr: 900 });
  bus.emit('law:impoundPayOffer', { poundId: 'p1', billId: 'b1', clerkId: 'c1', owedCr: 900, clear: true });
  assert.equal(paid.length, 1, 'clear never pays');
  assert.ok(resolved.length >= 2);

  // Recovery anywhere closes the counter — the pad cannot charge a released hull.
  bus.emit('law:impoundPayOffer', { poundId: 'p1', billId: 'b1', clerkId: 'c1', owedCr: 900 });
  bus.emit('law:impoundRecovered', { poundId: 'p1' });
  assert.equal(paid.length, 1);

  impoundPayPrompt.destroy();
  setPromptDeck(null);
});

test('production wiring: the manifest materializes the adapter — a lookup-only row is dead', () => {
  const state = createGameState(7);
  const registry = createRegistry({ state, bus: createBus(), helpers: {} });
  // The entries table only feeds the lookup; PRODUCTION_INIT_ORDER decides what init() reaches.
  assert.ok(registry.systems.includes(impoundPayPrompt),
    'adapter must be in the manifest init order, not just the registry lookup');
  assert.equal(registry.get('impoundPayPrompt'), impoundPayPrompt);
  // Event-only like customsPrompt: subscribes at init, never ticks.
  assert.ok(!registry.updateOrder.includes(impoundPayPrompt));
});

test('end to end: arrive, choose pay, the engine charges the bill and releases the hull', () => {
  const { sim, state, player, recovered } = boot();
  raiseToImpound(sim.bus, state);
  sim.step();
  sim.step();
  const clerk = liveClerk(state);
  assert.ok(clerk);
  player.pos.x = clerk.pos.x;
  player.pos.z = clerk.pos.z;
  sim.step();
  // The same emit the deck verb makes — the whole chain now resolves through the engine.
  sim.bus.emit('law:impoundPay', {});
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].method, 'pay');
});
