import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalDraft, CRUCIBLE_PURCHASE_SPEND_REASON } from '../src/systems/survivalDraft.js';
import { ships } from '../src/systems/ships.js';
import { economy } from '../src/systems/economy.js';
import { TECH_NODES } from '../src/data/tech.js';
import { isSwarmDraftWave } from '../src/data/swarmMode.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { offerDraft } from '../src/data/survivalDraft.js';

function shop({ cash = 100, unlock = true } = {}) {
  const state = createGameState(4242);
  const bus = createBus();
  const events = [];
  for (const name of ['run:spent', 'run:draftResolved', 'run:shopPurchased']) {
    bus.on(name, payload => events.push({ name, payload }));
  }
  const registry = { get: name => ({ ships, economy, survivalDraft })[name] };
  const ctx = { state, bus, registry, helpers: {} };
  economy.init(ctx); ships.init(ctx); economy.newGame(); ships.newGame();
  // The public Crucible launch supplies the complete arsenal to this ephemeral run.
  if (unlock) state.player.researchedNodes = TECH_NODES.map(n => n.id);
  ships.buyShip({ defId: 'ship_hornet', grant: true, setActive: true });
  runSession.init(ctx); survivalDraft.init(ctx);
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: 4242, arenaId: 'helios_core' });
  let phase = 'loadout';
  for (const next of ['arena_intro', 'wave_intro', 'active', 'cleanup']) {
    bus.emit('run:transitionRequested', { expectedPhase: phase, nextPhase: next }); phase = next;
  }
  state.run.wave = 1;
  bus.emit('run:awardRequested', { credits: cash, reason: 'round_loot' });
  bus.emit('run:transitionRequested', { expectedPhase: 'cleanup', nextPhase: 'draft' });
  return { state, bus, events };
}

test('every Swarm round offers shopping and requires defeating a finite pack', () => {
  for (const wave of [1, 2, 5, 10, 30, 100]) {
    assert.equal(isSwarmDraftWave(wave), true);
    const plan = planWave({ seed: 4242, wave, arenaId: 'helios_core', ruleset: 'swarm' });
    assert.equal(plan.completionRules.kind, 'cohort');
    assert.ok(plan.swarm.killTarget > 0);
    assert.equal(plan.level, 1, 'higher rounds do not inflate hull points');
  }
});

test('Swarm can add a second favourite gun, without offering to replace a gun with itself', () => {
  const input = { seed: 4242, wave: 1, hullId: 'ship_hornet',
    fittings: ['wpn_autocannon_m'], count: 100, ruleset: 'swarm' };
  const copy = offerDraft(input).offers.find(o => o.defId === 'wpn_autocannon_m');
  assert.ok(copy, 'a volume-fire build can buy another cannon');
  assert.notEqual(copy.slotIndex, 0);
  const gauntlet = offerDraft({ ...input, ruleset: 'scored' }).offers;
  assert.ok(!gauntlet.some(o => o.defId === 'wpn_autocannon_m'));
});

test('purchase spends exactly its price, fits the real hull, and keeps the shop open', () => {
  const h = shop();
  const campaignCash = h.state.player.credits;
  const offer = survivalDraft.currentOffers().find(o => o.available);
  assert.ok(offer);
  assert.equal(survivalDraft.resolvePick({ offerId: offer.id }), true);
  assert.equal(h.state.run.credits, 100 - offer.price);
  const p = h.state.player;
  assert.equal(p.ownedShips[p.activeShipIndex].fittings[offer.slotIndex], offer.defId);
  assert.equal(h.state.run.phase, 'draft');
  assert.equal(h.events.filter(e => e.name === 'run:draftResolved').length, 0);
  assert.equal(h.state.player.credits, campaignCash);
  assert.equal(survivalDraft.resolvePick({ offerId: offer.id }), false, 'double-click cannot buy twice');
  assert.equal(h.state.run.credits, 100 - offer.price);
  h.bus.emit('run:spent', { reason: CRUCIBLE_PURCHASE_SPEND_REASON, credits: offer.price });
  assert.equal(h.events.filter(e => e.name === 'run:shopPurchased').length, 1, 'stale receipt cannot fit again');
  survivalDraft.resolvePick({ offerId: null });
  assert.equal(h.events.filter(e => e.name === 'run:draftResolved').length, 1, 'launch resolves the stop once');
});

test('unaffordable and unknown offers preserve the wallet, loadout and open shop', () => {
  const h = shop({ cash: 0 });
  const fittings = JSON.stringify(h.state.player.ownedShips);
  const offer = survivalDraft.currentOffers()[0];
  assert.ok(offer.price > 0);
  assert.equal(survivalDraft.resolvePick({ offerId: offer.id }), false);
  assert.equal(survivalDraft.resolvePick({ offerId: 'stale-card' }), false);
  assert.equal(h.state.run.credits, 0);
  assert.equal(JSON.stringify(h.state.player.ownedShips), fittings);
  assert.equal(h.state.run.phase, 'draft');
  assert.equal(h.events.filter(e => e.name === 'run:spent').length, 0);
});

test('a fitting refusal after payment refunds run money and never grants a free spare', () => {
  const h = shop();
  const offer = survivalDraft.currentOffers().find(o => o.available);
  const inventory = JSON.stringify(h.state.player.moduleInventory);
  const fit = ships.fitModule;
  try {
    ships.fitModule = () => false;
    assert.equal(survivalDraft.resolvePick({ offerId: offer.id }), false);
  } finally { ships.fitModule = fit; }
  assert.equal(h.state.run.credits, 100);
  assert.equal(JSON.stringify(h.state.player.moduleInventory), inventory);
  assert.equal(h.state.run.phase, 'draft');
  assert.match(survivalDraft.lastNotice(), /refunded/);
});
