// THE WORLD REMEMBERS - U-A: the licensed hunter's offer, answered in flight.
// Writ hails first and offers to take the bounty; warrantOfferPrompt is the prompt-deck adapter
// that carries the answer. It shows the live amount and the time left, emits only the
// `warrant:acceptPayment` intent, and the real economy settles it (bounty:cleared ->
// warrant:hunterPaid). A short purse is refused out loud; nothing here writes credits.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRegistry } from '../src/core/registry.js';
import {
  WARRANT_HUNTERS,
  WARRANT_OFFER_WINDOW_S,
  WARRANT_WAVE_ARRIVAL_DELAY_S,
  warrantHunterById,
} from '../src/data/warrantHunters.js';
import { economy } from '../src/systems/economy.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { normalizeMemory } from '../src/systems/warrantHunterWaves.js';
import { setPromptDeck } from '../src/ui/promptDeck.js';
import { warrantOfferPrompt } from '../src/ui/warrantOfferPrompt.js';

const SECTOR = 'sector_helios_prime';
const SEEDS = [4242, 8008];
const WRIT = 'wh_ines_garrow';

function fakeDeck() {
  const specs = [];
  const resolved = [];
  setPromptDeck({
    offerDecision: (spec) => { specs.push(spec); return true; },
    resolveDecision: (id) => resolved.push(id),
  });
  return { specs, resolved };
}

/** A real sim (economy + lawSecurity) with Writ the only eligible hunter, the prompt mounted. */
function boot(seed, { bounty = 1200, credits = 5000 } = {}) {
  const sim = createSimulation({ seed, systems: [economy, lawSecurity, spawnBudget] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  if (!state.world.sectors) state.world.sectors = {};
  state.world.sectors[SECTOR] = { id: SECTOR, factionId: 'faction_scn', security: 0.9, tier: 0 };
  state.player.heat = 0.5; // NETS
  state.player.bounty = bounty;
  state.player.credits = credits;
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 8 });
  state.playerId = player.id;
  sim.helpers.voice = { say: () => true };
  const hunters = {};
  for (const h of WARRANT_HUNTERS) if (h.id !== WRIT) hunters[h.id] = { recoverUntilT: 1e9 };
  hunters[WRIT] = {};
  state.lawSecurity.warrantHunters = normalizeMemory({
    arrivalCount: 0, lastWaveArrival: 0, lastWaveT: null, bolder: 0, hunters,
  });
  const deck = fakeDeck();
  warrantOfferPrompt.init({ bus, state, helpers: sim.helpers });
  const log = { accept: [], paid: [], cleared: [], refused: [], closed: [], toasts: [], offers: [] };
  bus.on('warrant:acceptPayment', (p) => log.accept.push(p));
  bus.on('warrant:hunterPaid', (p) => log.paid.push(p));
  bus.on('bounty:cleared', (p) => log.cleared.push(p));
  bus.on('warrant:hunterOfferRefused', (p) => log.refused.push(p));
  bus.on('warrant:hunterOfferClosed', (p) => log.closed.push(p));
  bus.on('warrant:hunterOffer', (p) => log.offers.push(p));
  bus.on('toast', (p) => log.toasts.push(p));
  return { sim, state, bus, player, deck, log, law: sim.registry.get('lawSecurity') };
}

/** Jump in, let the wave land, then pull the boss inside hail range so the offer opens. */
function openOffer(ctx) {
  for (let i = 0; i < 4; i++) {
    ctx.bus.emit('jump:arrive', {});
    if (ctx.law._warrantWaves._view().pending) break;
  }
  ctx.state.simTime += WARRANT_WAVE_ARRIVAL_DELAY_S + 1;
  ctx.sim.step();
  ctx.sim.step();
  const live = ctx.law._warrantWaves._view().live;
  let boss = null;
  for (const [id, entry] of live) if (entry.role === 'boss') boss = ctx.state.entities.get(id);
  assert.ok(boss, 'Writ is on the lane');
  boss.pos = { x: 400, z: 0 };
  ctx.sim.step();
  return boss;
}

function finish(ctx) {
  warrantOfferPrompt.destroy();
  setPromptDeck(null);
  ctx.law._warrantWaves.destroy();
}

for (const seed of SEEDS) {
  test(`seed ${seed}: the offer mounts with the hunter, her line, the live amount and the deadline`, () => {
    const ctx = boot(seed, { bounty: 1200, credits: 5000 });
    assert.equal(ctx.deck.specs.length, 0, 'no offer, no prompt');
    openOffer(ctx);
    assert.equal(ctx.log.offers.length, 1);
    const offer = ctx.log.offers[0];
    assert.equal(offer.amountCr, 1200);
    assert.ok(offer.line && offer.line.length > 0, 'the hail line rides the offer');
    assert.equal(ctx.deck.specs.length, 1);
    const spec = ctx.deck.specs[0];
    assert.equal(spec.id, 'warrant-offer');
    assert.equal(spec.sender, 'WRIT — INES GARROW');
    assert.equal(spec.headline, 'SETTLE THE BOUNTY');
    assert.equal(spec.detail, `${offer.line} The bounty stands at 1200 cr.`, 'affordable: no purse warning');
    assert.equal(spec.choices[0].id, 'accept', 'ACCEPT is the first answer (Digit1)');
    assert.equal(spec.choices[0].label, 'PAY 1200 CR');
    assert.equal(spec.deadlineAt, offer.untilT, 'the deck counts down the waves module\'s own deadline');
    assert.equal(spec.deadlineAt, ctx.state.simTime + WARRANT_OFFER_WINDOW_S, 'one window from the hail');
    assert.equal(ctx.state.ui.warrantOfferPrompt.owedCr, 1200);
    finish(ctx);
  });

  test(`seed ${seed}: accept with enough credits runs through the real economy and Writ stands down`, () => {
    const ctx = boot(seed, { bounty: 1200, credits: 5000 });
    const boss = openOffer(ctx);
    ctx.deck.specs[0].onChoose('accept');
    assert.equal(ctx.log.accept.length, 1, 'the prompt emitted exactly one intent');
    assert.equal(ctx.log.accept[0].hunterId, WRIT);
    assert.equal(ctx.log.cleared.length, 1, 'economy cleared the bounty');
    assert.equal(ctx.log.cleared[0].amount, 1200);
    assert.equal(ctx.state.player.bounty, 0);
    assert.equal(ctx.state.player.credits, 3800, 'economy was the only credits writer');
    assert.equal(ctx.log.paid.length, 1, 'warrant:hunterPaid follows bounty:cleared');
    assert.equal(ctx.log.paid[0].hunterId, WRIT);
    assert.equal(ctx.log.paid[0].amountCr, 1200);
    assert.equal(boss.data.ai.forcePlayerTarget, false);
    assert.ok(ctx.deck.resolved.includes('warrant-offer'), 'the card is gone');
    assert.equal(ctx.state.ui.warrantOfferPrompt, undefined);
    finish(ctx);
  });

  test(`seed ${seed}: accept without credits is refused out loud, nothing is charged`, () => {
    const ctx = boot(seed, { bounty: 1200, credits: 300 });
    const popups = [];
    ctx.bus.on('comms:popup', (p) => popups.push(p));
    openOffer(ctx);
    const spec = ctx.deck.specs[0];
    assert.match(spec.detail, /You hold 300 cr\.$/, 'a short purse is shown before the choice');
    popups.length = 0;
    spec.onChoose('accept');
    assert.equal(ctx.log.accept.length, 1);
    assert.equal(ctx.log.cleared.length, 0, 'no bounty:cleared');
    assert.equal(ctx.log.paid.length, 0);
    assert.equal(ctx.state.player.credits, 300);
    assert.equal(ctx.state.player.bounty, 1200);
    assert.equal(ctx.log.refused.length, 1);
    assert.equal(ctx.log.refused[0].reason, 'short');
    assert.equal(ctx.log.refused[0].shortfallCr, 900);
    const hunter = warrantHunterById(WRIT);
    assert.ok(popups.some((p) => p.sender === hunter.name && p.text === hunter.voice.refused[0]), 'Writ says no');
    assert.ok(ctx.log.toasts.some((t) => /SHORT/.test(t.text) && /1200/.test(t.text) && /300/.test(t.text)));
    assert.equal(ctx.deck.resolved.includes('warrant-offer'), false, 'a short purse leaves the channel open');
    assert.equal(ctx.state.ui.warrantOfferPrompt.hunterId, WRIT);
    // The same card can pay once the credits are there; the first refusal did not burn the offer.
    ctx.state.player.credits = 1200;
    spec.onChoose('accept');
    assert.equal(ctx.log.paid.length, 1, 'a second press settles it');
    assert.equal(ctx.state.player.credits, 0);
    assert.ok(ctx.deck.resolved.includes('warrant-offer'), 'paying closes the card');
    finish(ctx);
  });

  test(`seed ${seed}: decline emits nothing; docking closes the card; the waves' own window still ends the offer`, () => {
    const ctx = boot(seed);
    openOffer(ctx);
    ctx.deck.specs[0].onChoose('decline');
    assert.equal(ctx.log.accept.length, 0, 'decline sends no intent');
    assert.equal(ctx.log.refused.length, 0);
    assert.ok(ctx.deck.resolved.includes('warrant-offer'));
    // The waves module keeps its clock: the offer expires on its own deadline.
    ctx.state.simTime = ctx.log.offers[0].untilT + 0.5;
    ctx.sim.step();
    assert.equal(ctx.log.closed.at(-1).reason, 'expired');
    finish(ctx);

    const docked = boot(seed);
    openOffer(docked);
    const before = docked.deck.resolved.length;
    docked.bus.emit('dock:docked', {});
    assert.ok(docked.deck.resolved.length > before, 'docking closes the card');
    assert.equal(docked.log.accept.length, 0);
    assert.equal(docked.state.ui.warrantOfferPrompt, undefined);
    finish(docked);
  });
}

test('the card closes on every end of the offer: closed, paid, refused, death; and no offer never mounts', () => {
  const bus = createBus();
  const state = { simTime: 10, tick: 7, ui: {}, player: { credits: 5000, bounty: 800 } };
  const { specs, resolved } = fakeDeck();
  warrantOfferPrompt.init({ bus, state, helpers: {} });
  const accepts = [];
  bus.on('warrant:acceptPayment', (p) => accepts.push(p));

  bus.emit('dock:docked', {});
  bus.emit('warrant:hunterOfferClosed', { reason: 'expired' });
  assert.equal(specs.length, 0, 'closing events alone mount nothing');

  const offer = { hunterId: WRIT, name: 'Ines Garrow', amountCr: 800, untilT: 35, line: 'Settle it.' };
  for (const [event, payload] of [
    ['warrant:hunterOfferClosed', { reason: 'expired' }],
    ['warrant:hunterPaid', {}],
    ['player:death', {}],
    ['dock:docked', {}],
  ]) {
    const n = specs.length;
    const r = resolved.length;
    bus.emit('warrant:hunterOffer', offer);
    assert.equal(specs.length, n + 1, `${event}: offer mounts`);
    assert.equal(specs[n].detail, 'Settle it. The bounty stands at 800 cr.');
    bus.emit(event, payload);
    assert.ok(resolved.length > r, `${event} unmounts the card`);
  }
  // A short purse is a refusal, not an ending: the card stays so the pilot can pay inside the window.
  const beforeShort = resolved.length;
  bus.emit('warrant:hunterOffer', offer);
  bus.emit('warrant:hunterOfferRefused', { reason: 'short' });
  assert.equal(resolved.length, beforeShort, 'short leaves the card mounted');
  assert.equal(state.ui.warrantOfferPrompt.hunterId, WRIT);
  bus.emit('warrant:hunterOfferClosed', { reason: 'expired' });
  assert.ok(resolved.length > beforeShort, 'the window ending still closes it');

  assert.equal(accepts.length, 0, 'nothing ever accepts by itself');

  // A stale offer (deadline already past) and an unknown hunter never mount.
  const n = specs.length;
  bus.emit('warrant:hunterOffer', { ...offer, untilT: 9 });
  bus.emit('warrant:hunterOffer', { ...offer, hunterId: 'nobody' });
  assert.equal(specs.length, n);

  warrantOfferPrompt.destroy();
  bus.emit('warrant:hunterOffer', offer);
  assert.equal(specs.length, n, 'destroyed prompt is deaf');
  setPromptDeck(null);
});

test('accept after the offer lapsed asks the economy nothing and says so', () => {
  const bus = createBus();
  const state = { simTime: 10, tick: 7, ui: {}, player: { credits: 5000, bounty: 800 } };
  const { specs } = fakeDeck();
  warrantOfferPrompt.init({ bus, state, helpers: {} });
  const toasts = [];
  bus.on('toast', (p) => toasts.push(p));
  bus.emit('warrant:hunterOffer', { hunterId: WRIT, amountCr: 800, untilT: 35 });
  specs[0].onChoose('accept'); // nothing listens: the waves module's offer is gone
  assert.ok(toasts.some((t) => /lapsed/.test(t.text)));
  warrantOfferPrompt.destroy();
  setPromptDeck(null);
});

test('production wiring: the manifest materializes the adapter, event-only', () => {
  const state = createGameState(7);
  const registry = createRegistry({ state, bus: createBus(), helpers: {} });
  assert.ok(registry.systems.includes(warrantOfferPrompt), 'in the manifest init order, not just the lookup');
  assert.equal(registry.get('warrantOfferPrompt'), warrantOfferPrompt);
  assert.ok(!registry.updateOrder.includes(warrantOfferPrompt));
  const order = registry.systems.map((s) => s.name);
  assert.equal(order.indexOf('warrantOfferPrompt'), order.indexOf('impoundPayPrompt') + 1, 'right after impoundPayPrompt');
});
