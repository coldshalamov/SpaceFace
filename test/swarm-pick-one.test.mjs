// S11 — pick one of three cards. The swarm armory deals three authored cards as the screen;
// the generated catalog waits behind Browse all, and a re-roll re-deals the cards, never the
// shelf underneath them.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { offerDraft } from '../src/data/survivalDraft.js';
import { runSession } from '../src/systems/runSession.js';
import { ships } from '../src/systems/ships.js';
import { economy } from '../src/systems/economy.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';
import { TECH_NODES } from '../src/data/tech.js';
import { crucibleDraftScreen } from '../src/ui/screens/crucibleDraft.js';
import { fakeDom, findAll } from './helpers/fake-dom.mjs';

const SEED = 7;
const ARENA = 'helios_core';

function boot({ seed = SEED, hullId = 'ship_hornet' } = {}) {
  const state = createGameState(seed);
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
  const registry = {
    get(name) {
      if (name === 'ships') return ships;
      if (name === 'economy') return economy;
      if (name === 'survivalDraft') return survivalDraft;
      return null;
    },
  };
  const ctx = { state, bus, helpers: {}, registry };
  economy.init(ctx);
  ships.init(ctx);
  if (economy.newGame) economy.newGame();
  if (ships.newGame) ships.newGame();
  runSession.init(ctx);
  survivalDraft.init(ctx);
  state.player.researchPoints += TECH_NODES.reduce((s, n) => s + ((n.cost && n.cost.rp) || 0), 0) + 1000;
  const cost = TECH_NODES.reduce((s, n) => s + ((n.cost && n.cost.credits) || 0), 0);
  if (cost > 0) economy.grantCredits(cost, 'test:tech');
  for (let pass = 0; pass < TECH_NODES.length + 1; pass++) {
    let progressed = false;
    for (const node of TECH_NODES) {
      if (!state.player.researchedNodes.includes(node.id) && ships.unlockTech(node.id)) progressed = true;
    }
    if (!progressed) break;
  }
  ships.buyShip({ defId: hullId, setActive: true, grant: true });
  return { state, bus, emitted, ctx, registry };
}

function enterSwarmDraft(harness, wave = 2) {
  harness.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: SEED, arenaId: ARENA });
  let from = 'loadout';
  for (const next of ['arena_intro', 'wave_intro', 'active', 'cleanup']) {
    harness.bus.emit('run:transitionRequested', { expectedPhase: from, nextPhase: next, reason: 't', tick: 0 });
    from = next;
  }
  harness.state.run.wave = wave;
  harness.bus.emit('run:transitionRequested', { expectedPhase: 'cleanup', nextPhase: 'draft', reason: 't', tick: 0 });
  return harness.state.run;
}

function fundRun(harness, credits) {
  harness.bus.emit('run:awardRequested', { credits, reason: 'test:chip' });
}

const swarmArgs = {
  seed: SEED, wave: 2, pickCount: 0, rerollCount: 0, count: 8,
  hullId: 'ship_hornet', fittings: [null, null, null], ruleset: 'swarm',
};

test('pool authored deals only written cards; the plain draw is unchanged', () => {
  const authored = offerDraft({ ...swarmArgs, pool: 'authored' });
  assert.equal(authored.ok, true);
  assert.ok(authored.offers.length > 0);
  for (const offer of authored.offers) {
    assert.equal(offer.catalog, false, `${offer.id} is an authored card, not a catalog row`);
  }
  const shelf = offerDraft(swarmArgs);
  assert.ok(shelf.offers.some((offer) => offer.catalog === true), 'the shelf still stocks catalog rows');
  // `count` bounds the DRAW, not the pool: authored keeps every legal row it can offer.
  assert.ok(authored.eligibleCount < shelf.eligibleCount, 'the authored pool is the smaller one');
});

test('a swarm armory deals three authored cards on top of the shelf', () => {
  const harness = boot();
  enterSwarmDraft(harness, 2);
  const offers = survivalDraft.currentOffers();
  const dealt = offers.filter((offer) => offer.dealt === true);
  assert.equal(dealt.length, 3, 'exactly the dealt three carry the mark');
  assert.deepEqual(offers.slice(0, 3).map((o) => o.id), dealt.map((o) => o.id), 'dealt leads');
  for (const offer of dealt) assert.equal(offer.catalog, false, 'a dealt card is authored');
  const shelfIds = new Set(offers.slice(3).map((o) => o.id));
  for (const offer of dealt) assert.ok(!shelfIds.has(offer.id), `${offer.id} does not repeat on the shelf`);
  assert.ok(offers.length > 3, 'the shelf is still stocked');
});

test('a re-roll deals new cards and leaves the shelf standing', () => {
  const harness = boot();
  enterSwarmDraft(harness, 2);
  fundRun(harness, 100);
  // The armory's reroll rides the Hangar bench (or the Gambler perk), never the plain wallet —
  // stock it with free draws the way a bought Rerolls rank does.
  harness.state.run.telemetry.hangar = { bounty: 0, ranks: { rerolls: 2 }, settledKeys: [], ownedHulls: [], rerollsUsed: 0 };
  const before = survivalDraft.currentOffers();
  const dealtBefore = before.filter((o) => o.dealt === true).map((o) => o.id);
  const shelfBefore = before.filter((o) => o.dealt !== true).map((o) => o.id);
  const state = survivalDraft.rerollState();
  assert.equal(state.available, true, JSON.stringify(state));

  harness.bus.emit('run:draftRerollRequested', {});

  const after = survivalDraft.currentOffers();
  const dealtAfter = after.filter((o) => o.dealt === true).map((o) => o.id);
  const shelfAfter = after.filter((o) => o.dealt !== true).map((o) => o.id);
  assert.equal(dealtAfter.length, 3, 'three cards dealt again');
  assert.notDeepEqual(dealtAfter, dealtBefore, 'the cards changed');
  // The shelf never re-shuffles and gains nothing — rows only leave it when a re-roll deals
  // them as cards (the old dealt three leave it the same way at open).
  const dropped = shelfBefore.filter((id) => !shelfAfter.includes(id));
  const added = shelfAfter.filter((id) => !shelfBefore.includes(id));
  assert.deepEqual(added, [], 'no new stock appears behind the cards');
  for (const id of dropped) assert.ok(dealtAfter.includes(id), `${id} left only because it was dealt`);
  assert.deepEqual(
    shelfAfter.filter((id) => shelfBefore.includes(id)),
    shelfBefore.filter((id) => shelfAfter.includes(id)),
    'the surviving shelf keeps its order',
  );
  assert.equal(survivalDraft.rerollCount(), 1);
});

test('the armory screen shows dealt cards and keeps the shelf behind Browse all', () => {
  const savedDocument = globalThis.document;
  const doc = fakeDom();
  globalThis.document = doc;
  try {
    const root = doc._make('div');
    const emitted = [];
    const mkOffer = (id, extra = {}) => ({
      id, name: `Card ${id}`, price: 10, available: true, purchased: false,
      defId: 'wpn_autocannon_s', kind: 'weapon', verb: 'Ram', blurb: 'A blunt idea, plainly told.',
      ...extra,
    });
    const offers = [
      mkOffer('d1', { dealt: true }), mkOffer('d2', { dealt: true }), mkOffer('d3', { dealt: true }),
      mkOffer('s1'), mkOffer('s2'),
    ];
    const owner = {
      currentOffers: () => offers,
      currentWave: () => 3,
      lastNotice: () => null,
      rerollState: () => null,
      recommendedOffers: () => [],
    };
    const ctx = {
      state: { run: { phase: 'draft', ruleset: 'swarm', credits: 80, wave: 3 }, player: { ownedShips: [] } },
      registry: { get: (n) => (n === 'survivalDraft' ? owner : null) },
      screenManager: { top: () => 'crucibleDraft' },
      bus: {
        emit(name, payload) { emitted.push([name, payload]); },
        on() { return () => {}; },
        off() {},
      },
    };
    const screen = Object.create(crucibleDraftScreen);
    screen.mount(root, ctx);

    const dealtEl = screen._dealt;
    // fakeDom's innerHTML is a plain property — emulate the real DOM's clear before re-renders.
    const repaint = () => { dealtEl.children.length = 0; screen._cards.children.length = 0; screen.refresh(ctx); };
    assert.equal(dealtEl.hidden, false, 'the dealt section shows');
    const dealtCards = () => findAll(dealtEl, (n) => n.classList && n.classList.contains('sf-cru-card--dealt'));
    assert.equal(dealtCards().length, 3, 'three big cards');
    assert.equal(screen._cards.hidden, true, 'the shelf waits behind Browse all');
    assert.equal(screen._filters.hidden, true, 'filters ride the shelf');

    // One click on a dealt card is the pick: the purchase intent leaves immediately.
    dealtCards()[0].click();
    assert.deepEqual(emitted.at(-1), ['run:draftPickRequested', { offerId: 'd1' }]);

    // Browse all opens the shelf; the dealt cards stay on the screen.
    screen._browseBtn.click();
    repaint();
    assert.equal(screen._cards.hidden, false, 'Browse all opens the shelf');
    assert.equal(dealtCards().length, 3, 'cards stay up');
    const shelfRows = findAll(screen._cards, (n) => n.classList && n.classList.contains('sf-cru-card'));
    assert.equal(shelfRows.length, 2, 'shelf rows, minus dealt');
  } finally {
    globalThis.document = savedDocument;
  }
});
