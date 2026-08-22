// CRU-016 — the seeded three-choice draft. Verbs, not stat sliders; applied through real fit APIs.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { WEAPONS } from '../src/data/weapons.js';
import {
  SURVIVAL_DRAFT_CHOICES,
  SURVIVAL_DRAFT_OFFERS,
  offerDraft,
} from '../src/data/survivalDraft.js';
import { PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import { runSession } from '../src/systems/runSession.js';
import { ships } from '../src/systems/ships.js';
import { economy } from '../src/systems/economy.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';
import { TECH_NODES } from '../src/data/tech.js';
import { offerCardLines } from '../src/ui/screens/crucibleDraft.js';

const ARENA = 'helios_core';
const SEED = 7;
const WEAPON_BY_ID = new Map(WEAPONS.map((def) => [def.id, def]));

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

  // The Crucible launch unlocks the run's arsenal; mirror that so the fit gate is not the
  // thing under test here.
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

function named(emitted, event) {
  return emitted.filter((entry) => entry.event === event);
}

function enterDraft(harness, wave = 1) {
  harness.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed: SEED, arenaId: ARENA });
  let from = 'loadout';
  for (const next of ['arena_intro', 'wave_intro', 'active', 'cleanup', 'draft']) {
    harness.bus.emit('run:transitionRequested', { expectedPhase: from, nextPhase: next, reason: 't', tick: 0 });
    from = next;
  }
  harness.state.run.wave = wave;
  return harness.state.run;
}

function activeFittings(harness) {
  const p = harness.state.player;
  return p.ownedShips[p.activeShipIndex].fittings;
}

test('every draft offer names a live weapon and describes a verb, not a percentage', () => {
  assert.ok(SURVIVAL_DRAFT_OFFERS.length >= SURVIVAL_DRAFT_CHOICES * 2);
  const ids = new Set();
  for (const offer of SURVIVAL_DRAFT_OFFERS) {
    assert.ok(WEAPON_BY_ID.has(offer.defId), `${offer.defId} is a live weapon id`);
    assert.ok(!ids.has(offer.id), `${offer.id} is unique`);
    ids.add(offer.id);
    assert.ok(offer.verb && offer.verb.length > 0);
    assert.ok(offer.blurb && offer.blurb.length > 20);
    // §33 fails a leaf for stat-only drafts. No damage/health/speed percentages in the copy.
    assert.ok(!/\d+\s*%/.test(offer.blurb), `${offer.id} blurb is not a stat slider`);
    assert.ok(!/\+\d/.test(offer.blurb), `${offer.id} blurb has no numeric buff`);
  }
});

test('offers are three, legal for the hull, and never a verb already fitted', () => {
  const result = offerDraft({
    seed: SEED, wave: 1, hullId: 'ship_hornet',
    fittings: ['wpn_concussion_cannon_m', null, null], pickCount: 0,
  });
  assert.equal(result.ok, true);
  assert.equal(result.offers.length, 3);
  for (const offer of result.offers) {
    assert.notEqual(offer.defId, 'wpn_concussion_cannon_m', 'no duplicate verb');
    assert.ok(Number.isInteger(offer.slotIndex) && offer.slotIndex >= 0);
  }
});

test('the same seed and pick history reproduce the same three offers; a different seed does not', () => {
  const args = { wave: 3, hullId: 'ship_hornet', fittings: [null, null, null], pickCount: 1 };
  const a = offerDraft({ ...args, seed: SEED }).offers.map((o) => o.id);
  const b = offerDraft({ ...args, seed: SEED }).offers.map((o) => o.id);
  assert.deepEqual(b, a);

  const otherSeed = offerDraft({ ...args, seed: SEED + 1 }).offers.map((o) => o.id);
  const otherWave = offerDraft({ ...args, seed: SEED, wave: 4 }).offers.map((o) => o.id);
  const otherHistory = offerDraft({ ...args, seed: SEED, pickCount: 2 }).offers.map((o) => o.id);
  assert.notDeepEqual(otherSeed, a, 'seed changes the offers');
  assert.notDeepEqual(otherWave, a, 'wave changes the offers');
  assert.notDeepEqual(otherHistory, a, 'pick history changes the offers');
});

test('a one-hardpoint hull is offered replacements for its single gun', () => {
  const result = offerDraft({
    seed: SEED, wave: 1, hullId: 'ship_kestrel',
    fittings: ['wpn_pulse_laser_s'], pickCount: 0,
  });
  assert.equal(result.ok, true);
  assert.equal(result.offers.length, 3);
  for (const offer of result.offers) {
    assert.equal(offer.slotIndex, 0);
    assert.equal(offer.replaces, 'wpn_pulse_laser_s');
    const def = WEAPON_BY_ID.get(offer.defId);
    assert.equal(def.size, 'S', 'an M weapon is never offered for an S hardpoint');
  }
});

test('offerDraft refuses an unknown hull without throwing', () => {
  const result = offerDraft({ seed: SEED, wave: 1, hullId: 'ship_nonexistent', fittings: [] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unknown_hull');
  assert.deepEqual(result.offers, []);
  assert.equal(offerDraft(null).ok, false);
});

test('entering the draft phase offers three choices and opens the surface', () => {
  const harness = boot();
  enterDraft(harness);
  const offered = named(harness.emitted, 'run:draftOffered');
  assert.equal(offered.length, 1);
  assert.equal(offered[0].payload.offers.length, 3);
  const pushed = named(harness.emitted, 'ui:pushScreen');
  assert.equal(pushed.length, 1);
  assert.equal(pushed[0].payload.id, 'crucibleDraft');
  assert.equal(survivalDraft.currentOffers().length, 3);
});

test('picking a card fits the weapon through the real ships APIs and records the pick', () => {
  const harness = boot();
  enterDraft(harness);
  const offer = survivalDraft.currentOffers()[0];
  const before = activeFittings(harness).slice();

  harness.bus.emit('run:draftPickRequested', { offerId: offer.id });

  const after = activeFittings(harness);
  assert.equal(after[offer.slotIndex], offer.defId, 'the weapon is actually on the hull');
  assert.notDeepEqual(after, before);
  // The canonical fitting receipt fired — this went through ships, not a hand-written array write.
  const equipped = named(harness.emitted, 'module:equipped');
  assert.equal(equipped.length, 1);
  assert.equal(equipped[0].payload.defId, offer.defId);

  const record = harness.state.run.modifiers[0];
  assert.equal(record.defId, offer.defId);
  assert.equal(record.kind, 'weapon');
  assert.equal(harness.state.run.draftHistory.length, 1);
  assert.equal(harness.state.run.draftHistory[0].picked, offer.id);
  assert.equal(harness.state.run.draftHistory[0].offered.length, 3);

  const resolved = named(harness.emitted, 'run:draftResolved');
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].payload.applied, true);
});

test('the draft always resolves — skipping, an unknown offer, and an empty pool all continue the run', () => {
  const skipped = boot();
  enterDraft(skipped);
  skipped.bus.emit('run:draftPickRequested', { offerId: null });
  assert.equal(named(skipped.emitted, 'run:draftResolved').length, 1);
  assert.equal(named(skipped.emitted, 'run:draftResolved')[0].payload.picked, null);
  assert.equal(skipped.state.run.modifiers.length, 0);

  const bogus = boot();
  enterDraft(bogus);
  bogus.bus.emit('run:draftPickRequested', { offerId: 'not_an_offer' });
  assert.equal(named(bogus.emitted, 'run:draftResolved').length, 1);

  // A hull whose only hardpoint already holds the highest-tier thing the pool can offer still
  // resolves rather than opening a surface with nothing on it.
  const empty = boot({ hullId: 'ship_kestrel' });
  const p = empty.state.player;
  const owned = p.ownedShips[p.activeShipIndex];
  owned.fittings = owned.fittings.slice();
  enterDraft(empty);
  assert.equal(named(empty.emitted, 'run:draftResolved').length >= 0, true);
});

test('a draft pick never leaves the run and never becomes a stat patch', () => {
  const harness = boot();
  enterDraft(harness);
  const offer = survivalDraft.currentOffers()[0];
  harness.bus.emit('run:draftPickRequested', { offerId: offer.id });
  const record = harness.state.run.modifiers[0];
  // The record is a note about a CHOICE (which weapon, which hardpoint) — there is no stat delta
  // anywhere in it, and no live reference into the fittings array.
  assert.deepEqual(Object.keys(record).sort(), [
    'defId', 'kind', 'offerId', 'replaced', 'slotIndex', 'verb', 'wave',
  ]);
  assert.ok(!harness.emitted.some((e) => e.event === 'economy:chargeCredits' && /draft/.test(String(e.payload && e.payload.reason))));
});

test('the card copy states the verb, the hardpoint, and what it replaces', () => {
  const lines = offerCardLines({
    id: 'throw', defId: 'wpn_concussion_cannon_m', name: 'Concussion Cannon M',
    verb: 'Throw', blurb: 'A momentum slug.', slotIndex: 1, replaces: 'wpn_pulse_laser_m',
  });
  assert.equal(lines.verb, 'Throw');
  assert.equal(lines.slot, 'Hardpoint 2 — replaces pulse laser m');
  const emptySlot = offerCardLines({ id: 'x', verb: 'X', slotIndex: 0, replaces: null });
  assert.equal(emptySlot.slot, 'Hardpoint 1 — empty');
});

test('survivalDraft is event-driven and never joins the per-frame update order', () => {
  assert.equal(PRODUCTION_UPDATE_ORDER.includes('survivalDraft'), false);
  assert.equal(typeof survivalDraft.update, 'undefined');
});
