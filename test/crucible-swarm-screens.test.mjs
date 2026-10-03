// SWARM-05 — the functional screen wiring the arcade mode reads and writes through:
// sell-back, the card lock that carries into the next armory, the build-recommended
// shelf, the door's Hangar ledger, the results take, and the HUD's boss meter.
//
// The harness drives the REAL owners — runSession owns state.run and the wallet,
// survivalDraft owns the armory, ships owns fittings — the same seams the screens emit on.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { swarmPurchasePrice, swarmSellPrice } from '../src/data/survivalDraft.js';
import { verbBuildFamily, summarizeRunBuild } from '../src/data/runModifiers.js';
import {
  emptyHangar,
  hangarRank,
  trackPrice,
} from '../src/data/swarmHangar.js';
import { TECH_NODES } from '../src/data/tech.js';
import { economy } from '../src/systems/economy.js';
import { runSession } from '../src/systems/runSession.js';
import { ships } from '../src/systems/ships.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';
import {
  buyCrucibleHangarTrack,
  resetCrucibleMetaForTests,
  saveCrucibleMeta,
} from '../src/systems/survivalRecords.js';
import { survivalHud } from '../src/ui/survivalHud.js';
import { resultCelebration } from '../src/ui/screens/crucible.js';

const SWARM = 'swarm';
const ARENA = 'helios_core';
const SEED = 4242;

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
  // The door unlocks the run arsenal; mirror that so fitting is what is under test.
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

function beginSwarm(h, { credits = 0 } = {}) {
  h.bus.emit('run:beginRequested', {
    kind: 'survival', ruleset: SWARM, seed: SEED, arenaId: ARENA,
  });
  if (credits > 0) {
    h.bus.emit('run:awardRequested', { credits, reason: 'test:purse' });
  }
  h.bus.emit('run:transitionRequested', {
    expectedPhase: 'loadout', nextPhase: 'draft', reason: 't', tick: 0,
  });
  return h.state.run;
}

function transition(h, from, to) {
  h.bus.emit('run:transitionRequested', { expectedPhase: from, nextPhase: to, reason: 't', tick: 0 });
}

function reopenDraft(h) {
  transition(h, 'draft', 'wave_intro');
  transition(h, 'wave_intro', 'active');
  transition(h, 'active', 'cleanup');
  transition(h, 'cleanup', 'draft');
}

function named(emitted, event) {
  return emitted.filter((entry) => entry.event === event);
}

function activeFittings(h) {
  const p = h.state.player;
  return p.ownedShips[p.activeShipIndex].fittings;
}

function fakeStorage() {
  const bag = new Map();
  return {
    getItem(key) { return bag.has(key) ? bag.get(key) : null; },
    setItem(key, value) { bag.set(key, String(value)); },
    removeItem(key) { bag.delete(key); },
  };
}

function fakeDom() {
  const make = (tagName) => {
    const node = {
      tagName,
      id: '',
      className: '',
      textContent: '',
      children: [],
      parentNode: null,
      style: {},
      dataset: {},
      attributes: {},
      listeners: {},
      appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      addEventListener(name, fn) { (this.listeners[name] = this.listeners[name] || []).push(fn); },
    };
    node.classList = {
      add(...names) { node.className = [...node.className.split(/\s+/), ...names].filter(Boolean).join(' '); },
      contains(name) { return node.className.split(/\s+/).includes(name); },
    };
    return node;
  };
  const head = make('head');
  head.id = 'head';
  return { head, createElement: make, getElementById: () => null, _make: make };
}

function textLines(node, out = []) {
  if (node.children.length) {
    for (const child of node.children) textLines(child, out);
  } else if (node.textContent) {
    out.push(node.textContent);
  }
  return out;
}

/* ---- sell-back ------------------------------------------------------------ */

test('SWARM-05: sell price is half the shelf price, and unknowns have none', () => {
  const price = swarmPurchasePrice('wpn_pulse_laser_s');
  assert.ok(Number.isInteger(price) && price > 0);
  assert.equal(swarmSellPrice('wpn_pulse_laser_s'), Math.floor(price / 2));
  assert.equal(swarmSellPrice('mod_bank_shot'), Math.floor(swarmPurchasePrice('mod_bank_shot') / 2));
  assert.equal(swarmSellPrice('not_a_fitting'), null);
  assert.equal(swarmSellPrice(null), null);
});

test('SWARM-05: the ships authority consumes a spare by its own instanceId only', () => {
  const h = boot();
  const p = h.state.player;
  p.moduleInventory = [
    { defId: 'wpn_pulse_laser_s', instanceId: 'spare-1', count: 1 },
    { defId: 'wpn_pulse_laser_s', instanceId: 'spare-2', count: 1 },
  ];
  const taken = ships.takeInventoryModuleInstance('spare-2');
  assert.equal(taken.instanceId, 'spare-2');
  assert.equal(p.moduleInventory.length, 1);
  assert.equal(p.moduleInventory[0].instanceId, 'spare-1');
  assert.equal(ships.takeInventoryModuleInstance('stale-id'), null);
  assert.equal(p.moduleInventory.length, 1);
});

test('SWARM-05: selling a fitted swarm module pays half and empties the slot', () => {
  const h = boot();
  beginSwarm(h, { credits: 500 });
  // Buy a real card so a fitted module exists at a known slot.
  const offer = survivalDraft.currentOffers().find((o) => o.defId && o.available
    && o.kind !== 'hull' && o.kind !== 'service' && Number.isInteger(o.slotIndex));
  assert.ok(offer, 'a buyable fitting exists on the opening shelf');
  h.bus.emit('run:draftPickRequested', { offerId: offer.id });
  assert.equal(activeFittings(h)[offer.slotIndex], offer.defId, 'the buy is bolted on');
  // runSession commits REPLACE state.run — read the live run, never a held reference.
  const creditsAfterBuy = h.state.run.credits;

  h.bus.emit('run:refitSellRequested', { slotIndex: offer.slotIndex });
  const sell = named(h.emitted, 'run:refitChanged')
    .find((e) => e.payload.action === 'sell' && e.payload.ok);
  assert.ok(sell, 'the sell receipt lands');
  assert.equal(sell.payload.credits, swarmSellPrice(offer.defId));
  assert.equal(sell.payload.defId, offer.defId);
  assert.equal(activeFittings(h)[offer.slotIndex] === offer.defId, false, 'the slot is clear');
  assert.equal(h.state.run.credits, creditsAfterBuy + swarmSellPrice(offer.defId),
    'the wallet took half');
});

test('SWARM-05: selling a spare removes that record only, by instanceId', () => {
  const h = boot();
  beginSwarm(h, { credits: 100 });
  const p = h.state.player;
  p.moduleInventory = [
    { defId: 'wpn_pulse_laser_s', instanceId: 'spare-a', count: 1 },
    { defId: 'wpn_pulse_laser_s', instanceId: 'spare-b', count: 1 },
  ];
  h.bus.emit('run:refitSellRequested', { instanceId: 'spare-a' });
  const sell = named(h.emitted, 'run:refitChanged')
    .find((e) => e.payload.action === 'sell' && e.payload.ok);
  assert.ok(sell);
  assert.equal(p.moduleInventory.length, 1);
  assert.equal(p.moduleInventory[0].instanceId, 'spare-b', 'the other identical spare stays');
  assert.equal(h.state.run.credits, 100 + swarmSellPrice('wpn_pulse_laser_s'));

  // A stale id refuses without touching inventory or wallet.
  h.bus.emit('run:refitSellRequested', { instanceId: 'spare-a' });
  const last = named(h.emitted, 'run:refitChanged').pop();
  assert.equal(last.payload.ok, false);
  assert.equal(p.moduleInventory.length, 1);
  assert.equal(h.state.run.credits, 100 + swarmSellPrice('wpn_pulse_laser_s'));
});

test('SWARM-05: an empty sell request refuses instead of doing nothing silently', () => {
  const h = boot();
  beginSwarm(h);
  h.bus.emit('run:refitSellRequested', {});
  const last = named(h.emitted, 'run:refitChanged').pop();
  assert.equal(last.payload.action, 'sell');
  assert.equal(last.payload.ok, false);
  assert.ok(typeof last.payload.reason === 'string' && last.payload.reason.length > 0);
});

test('SWARM-05: a gauntlet run has no sell-back — there is no shop to sell to', () => {
  const h = boot();
  h.bus.emit('run:beginRequested', {
    kind: 'survival', ruleset: 'scored', seed: SEED, arenaId: 'cinder_run',
  });
  h.bus.emit('run:transitionRequested', {
    expectedPhase: 'loadout', nextPhase: 'draft', reason: 't', tick: 0,
  });
  h.state.player.moduleInventory = [{ defId: 'wpn_pulse_laser_s', instanceId: 's1', count: 1 }];
  h.bus.emit('run:refitSellRequested', { instanceId: 's1' });
  assert.equal(h.state.player.moduleInventory.length, 1, 'nothing was consumed');
  assert.equal(named(h.emitted, 'run:refitChanged').length, 0, 'no receipt at all');
});

/* ---- the card lock --------------------------------------------------------- */

test('SWARM-05: a held card travels into the next armory marked as such', () => {
  const h = boot();
  beginSwarm(h);
  const offers = survivalDraft.currentOffers();
  const keep = offers.find((o) => o.defId && !o.purchased
    && o.kind !== 'hull' && o.kind !== 'service');
  assert.ok(keep, 'a card to hold exists');
  h.bus.emit('run:draftLockRequested', { offerId: keep.id });
  const held = named(h.emitted, 'run:draftLockChanged').pop();
  assert.equal(held.payload.locked, true);
  assert.equal(held.payload.offerId, keep.id);
  // While the armory is still open the card reads as held.
  assert.equal(survivalDraft.currentOffers().find((o) => o.id === keep.id).held, true);

  h.bus.emit('run:draftPickRequested', { offerId: null });
  reopenDraft(h);
  const next = survivalDraft.currentOffers();
  const carried = next.filter((o) => o.lockedIn);
  assert.equal(carried.length, 1, 'exactly one card rode in on the hold');
  assert.equal(carried[0].id, keep.id);
  // And it is not duplicated: the same id appears once.
  assert.equal(next.filter((o) => o.id === keep.id).length, 1);
});

test('SWARM-05: the hold toggles off, and refuses services, hulls and ghosts', () => {
  const h = boot();
  beginSwarm(h);
  const offers = survivalDraft.currentOffers();
  const keep = offers.find((o) => o.defId && o.kind !== 'hull' && o.kind !== 'service');
  h.bus.emit('run:draftLockRequested', { offerId: keep.id });
  h.bus.emit('run:draftLockRequested', { offerId: keep.id });
  const released = named(h.emitted, 'run:draftLockChanged').pop();
  assert.equal(released.payload.locked, false, 'asking again lets the card go');

  const service = offers.find((o) => o.kind === 'service');
  assert.ok(service, 'the service counter is on the shelf');
  // The receipt log is cumulative — a refusal is no NEW event, so measure the delta.
  const beforeDeny = named(h.emitted, 'run:draftLockChanged').length;
  h.bus.emit('run:draftLockRequested', { offerId: service.id });
  assert.equal(named(h.emitted, 'run:draftLockChanged').length, beforeDeny,
    'a service row cannot ride a hold — no receipt at all');

  h.bus.emit('run:draftLockRequested', { offerId: 'bogus_card' });
  assert.equal(named(h.emitted, 'run:draftLockChanged').length, beforeDeny);
});

/* ---- recommended for your build ------------------------------------------- */

test('SWARM-05: the shelf is empty until the run has a build', () => {
  const h = boot();
  beginSwarm(h);
  assert.deepEqual(survivalDraft.recommendedOffers(), []);
});

test('SWARM-05: once the run leans into a family the shelf stocks it', () => {
  const h = boot();
  beginSwarm(h, { credits: 1000 });
  const offers = survivalDraft.currentOffers();
  // 'snarl' is the Web card — chain family by the build summary's own table.
  const snarl = offers.find((o) => o.verb === 'Web' && o.available);
  assert.ok(snarl, 'the Web card is on the shelf');
  h.bus.emit('run:draftPickRequested', { offerId: snarl.id });
  const build = summarizeRunBuild(h.state.run.modifiers);
  assert.equal(build.dominant, 'chain');
  const shelf = survivalDraft.recommendedOffers();
  assert.ok(shelf.length > 0 && shelf.length <= 3, 'three picks at most');
  assert.ok(shelf.every((o) => verbBuildFamily(o.verb) === 'chain'),
    'every recommendation feeds the run\'s dominant family');
  assert.ok(shelf.every((o) => !o.purchased), 'sold rows do not headline');
});

/* ---- the door Hangar ledger ------------------------------------------------ */

test('SWARM-05: a Hangar track buy banks the rank and persists the bounty', () => {
  resetCrucibleMetaForTests();
  const storage = fakeStorage();
  const profile = { hangar: emptyHangar() };
  // Rank 0 costs 100 and rank 1 250 — the purse has to stand both buys this test makes.
  profile.hangar.bounty = 500;
  saveCrucibleMeta(profile, storage);

  const buy = buyCrucibleHangarTrack('plating', storage);
  assert.equal(buy.ok, true);
  assert.equal(buy.rank, 1);
  assert.equal(buy.price, trackPrice('plating', 0));
  assert.equal(buy.hangar.bounty, 500 - trackPrice('plating', 0));
  const again = buyCrucibleHangarTrack('plating', storage);
  assert.equal(again.ok, true);
  assert.equal(again.rank, 2);
  assert.equal(hangarRank(again.hangar, 'plating'), 2);
});

test('SWARM-05: a Hangar buy the bounty cannot stand refuses with the owner\'s reason', () => {
  resetCrucibleMetaForTests();
  const storage = fakeStorage();
  const profile = { hangar: emptyHangar() };
  profile.hangar.bounty = 10;
  saveCrucibleMeta(profile, storage);
  const buy = buyCrucibleHangarTrack('plating', storage);
  assert.equal(buy.ok, false);
  // The wrapper hands back the swarmHangar owner's own reason verbatim — the surface maps it.
  assert.equal(buy.reason, 'short');
  assert.equal(hangarRank(buy.hangar, 'plating'), 0);
});

/* ---- the take on the results plate ----------------------------------------- */

test('SWARM-05: the celebration band reads the settled run, stars and all', () => {
  resetCrucibleMetaForTests();
  const previousDocument = globalThis.document;
  const doc = fakeDom();
  globalThis.document = doc;
  try {
    const result = {
      ruleset: SWARM,
      arenaId: 'helios_core',
      outcome: 'extracted',
      wave: 10,
      bankedBounty: 140,
      hangarBounty: 515,
      unlocksEarned: ['unlock_kit_ricochet'],
      bestLineId: 'swarm:helios_core:score',
      ladderDelta: {
        zones: { 0: { stars: 2, gained: 2 } },
        newStars: 2,
        newCheckpoint: { zoneIndex: 0, startWave: 10, purse: 45 },
      },
    };
    const band = resultCelebration(result);
    assert.ok(band, 'a swarm result earns the take');
    const lines = textLines(band).join(' | ');
    assert.match(lines, /NEW BEST/);
    assert.match(lines, /★★☆ · 2 new/);
    assert.match(lines, /140 cr banked/);
    assert.match(lines, /515 cr/);
    assert.match(lines, /Ricochet Runner/, 'the unlock id resolves to its label');
    assert.match(lines, /Round 10/);
    assert.match(lines, /opens at 2 stars/, 'the next arena\'s gate is named');
  } finally {
    globalThis.document = previousDocument;
  }
});

test('SWARM-05: a non-swarm result earns no band at all', () => {
  assert.equal(resultCelebration({ ruleset: 'scored', wave: 6 }), null);
  assert.equal(resultCelebration(null), null);
  // A swarm run with nothing settled still names the goal ahead when a profile exists.
  resetCrucibleMetaForTests();
  const previousDocument = globalThis.document;
  const doc = fakeDom();
  globalThis.document = doc;
  try {
    const band = resultCelebration({ ruleset: SWARM, arenaId: 'helios_core', wave: 3 });
    assert.ok(band);
    assert.match(textLines(band).join(' '), /opens at 2 stars/);
  } finally {
    globalThis.document = previousDocument;
  }
});

/* ---- the HUD boss meter ---------------------------------------------------- */

test('SWARM-05: the boss census reads champion bodies and nothing else', () => {
  const state = {
    entities: new Map([
      [1, { id: 1, alive: true, hull: 40, hullMax: 80, data: { swarmChampion: true } }],
      [2, { id: 2, alive: true, hull: 10, hullMax: 10, data: {} }],
      [3, { id: 3, alive: false, hull: 0, hullMax: 20, data: { swarmChampion: true } }],
    ]),
  };
  const vitals = survivalHud._bossVitals(state);
  assert.equal(vitals.count, 1, 'only the living champion counts');
  assert.equal(vitals.pct, 0.5);
  assert.equal(survivalHud._bossVitals({ entities: new Map() }), null);
  assert.equal(survivalHud._bossVitals({}), null);
});
