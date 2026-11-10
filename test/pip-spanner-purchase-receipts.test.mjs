import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession, runLifetime } from '../src/systems/runSession.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';
import { ships } from '../src/systems/ships.js';
import { economy } from '../src/systems/economy.js';
import { TECH_NODES } from '../src/data/tech.js';

function armory({ cash = 1000, damage = false } = {}) {
  const state = createGameState(4242), bus = createBus(), events = [];
  const registry = { get: name => ({ ships, economy, survivalDraft, runSession })[name] };
  const ctx = { state, bus, registry, helpers: {} };
  economy.init(ctx); ships.init(ctx); economy.newGame(); ships.newGame();
  state.player.researchedNodes = TECH_NODES.map(node => node.id);
  ships.buyShip({ defId:'ship_hornet', grant:true, setActive:true });
  const entity = { id:9001, hull:damage ? 60 : 100, hullMax:100, armorHp:damage ? 30 : 50, armorMax:50 };
  state.entities.set(entity.id, entity); state.playerId = entity.id;
  runSession.init(ctx); survivalDraft.init(ctx);
  for (const name of ['run:spent', 'run:shopPurchased', 'run:draftResolved', 'service:completed']) {
    bus.on(name, payload => events.push({ name, payload }));
  }
  bus.emit('run:beginRequested', { kind:'survival', ruleset:'swarm', seed:4242, arenaId:'helios_core' });
  let phase = 'loadout';
  for (const next of ['arena_intro','wave_intro','active','cleanup']) {
    bus.emit('run:transitionRequested', { expectedPhase:phase, nextPhase:next }); phase = next;
  }
  state.run.wave = 1;
  bus.emit('run:awardRequested', { credits:cash, reason:'round_loot' });
  bus.emit('run:transitionRequested', { expectedPhase:'cleanup', nextPhase:'draft' });
  return { state, bus, events, entity, ctx,
    offer: () => survivalDraft.currentOffers().find(offer => offer.available && Number.isInteger(offer.slotIndex)),
  };
}

test('Pip receipt reports one actual fit and charge while paused, and survives owner wallet clones', () => {
  const h = armory(), offer = h.offer(), campaignCredits = h.state.player.credits;
  const lifetime = runLifetime(h.state.run), simTime = h.state.simTime;
  assert.equal(survivalDraft.resolvePick({ offerId:offer.id }), true);
  const receipt = survivalDraft.preparationReceipt();
  assert.equal(receipt.outcome, 'accepted'); assert.equal(receipt.charged, true);
  assert.equal(receipt.price, offer.price); assert.equal(receipt.defId, offer.defId);
  assert.equal(h.state.player.ownedShips[h.state.player.activeShipIndex].fittings[receipt.slotIndex], offer.defId);
  assert.equal(h.state.run.credits, 1000 - offer.price);
  assert.equal(h.state.player.credits, campaignCredits); assert.equal(h.state.simTime, simTime);
  assert.equal(runLifetime(h.state.run), lifetime);
  receipt.outcome = 'invented';
  assert.equal(survivalDraft.preparationReceipt().outcome, 'accepted', 'callers cannot edit the stored result');
  survivalDraft.lockOffer('missing');
  assert.equal(survivalDraft.preparationReceipt().outcome, 'accepted', 'unrelated notice cannot erase success');
});

test('refused post-charge fit yields a denied, refunded receipt', () => {
  const h = armory(), offer = h.offer(), original = ships.fitModule;
  try {
    ships.fitModule = () => false;
    assert.equal(survivalDraft.resolvePick({ offerId:offer.id }), false);
  } finally { ships.fitModule = original; }
  const receipt = survivalDraft.preparationReceipt();
  assert.equal(receipt.outcome, 'denied'); assert.equal(receipt.charged, false);
  assert.match(receipt.text, /refunded/); assert.equal(h.state.run.credits, 1000);
});

test('Spanner milestone weld reports the real hull and armor restored, with one debit', () => {
  const h = armory({ damage:true });
  const offer = survivalDraft.currentOffers().find(offer => offer.service === 'weld');
  assert.ok(offer?.available);
  assert.equal(survivalDraft.resolvePick({ offerId:offer.id }), true);
  const receipt = survivalDraft.preparationReceipt();
  assert.equal(receipt.outcome, 'accepted'); assert.equal(receipt.restoredHull, 40);
  assert.equal(receipt.restoredArmor, 20); assert.equal(h.entity.hull, 100); assert.equal(h.entity.armorHp, 50);
  assert.equal(survivalDraft.resolvePick({ offerId:offer.id }), false);
  assert.equal(h.events.filter(event => event.name === 'run:spent').length, 1);
});

test('recursive fitting callback cannot purchase a second item or launch during the transaction', () => {
  const h = armory(), offer = h.offer(), original = ships.fitModule;
  const other = survivalDraft.currentOffers().find(value => value.available && value.id !== offer.id);
  let nestedPurchase, nestedLaunch, nestedReroll;
  try {
    ships.fitModule = args => {
      nestedPurchase = survivalDraft.resolvePick({ offerId:other.id });
      nestedLaunch = survivalDraft.resolvePick({ offerId:null });
      nestedReroll = survivalDraft.requestReroll();
      return original.call(ships, args);
    };
    assert.equal(survivalDraft.resolvePick({ offerId:offer.id }), true);
  } finally { ships.fitModule = original; }
  assert.equal(nestedPurchase, false); assert.equal(nestedLaunch, false); assert.equal(nestedReroll, false);
  assert.equal(h.events.filter(event => event.name === 'run:spent').length, 1);
  assert.equal(survivalDraft.resolvePick({ offerId:null }), true, 'launch is immediate after the synchronous transaction');
  assert.equal(survivalDraft.preparationReceipt(), null, 'closed armory cannot replay a receipt');
});

test('wallet callback replacing the run with the same seed never fits or refunds into its successor', () => {
  const h = armory(), offer = h.offer();
  const fittings = JSON.stringify(h.state.player.ownedShips);
  // Registered before re-initializing the draft owner, so this runs before its spend listener.
  survivalDraft.destroy();
  h.bus.on('run:spent', () => { h.state.run = structuredClone(h.state.run); h.state.run.credits = 777; });
  survivalDraft.init(h.ctx); survivalDraft._openDraft();
  assert.equal(survivalDraft.resolvePick({ offerId:offer.id }), false);
  assert.equal(h.state.run.credits, 777);
  assert.equal(JSON.stringify(h.state.player.ownedShips), fittings);
  assert.equal(survivalDraft.preparationReceipt(), null);
  assert.equal(h.events.filter(event => event.name === 'run:shopPurchased').length, 0);
});

test('changed repair entity after payment receives no old weld and refunds this same run', () => {
  const h = armory({ damage:true });
  const offer = survivalDraft.currentOffers().find(value => value.service === 'weld');
  survivalDraft.destroy();
  const replacement = { ...h.entity };
  h.bus.on('run:spent', () => h.state.entities.set(replacement.id, replacement));
  survivalDraft.init(h.ctx); survivalDraft._openDraft();
  assert.equal(survivalDraft.resolvePick({ offerId:offer.id }), false);
  assert.equal(h.state.run.credits, 1000); assert.equal(replacement.hull, 60);
  assert.equal(h.entity.hull, 60);
  assert.equal(h.events.filter(event => event.name === 'service:completed').length, 0);
});
