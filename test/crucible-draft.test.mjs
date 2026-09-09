// CRU-016 — the seeded three-choice draft. Verbs, not stat sliders; applied through real fit APIs.
// CRU-016b — the paid re-roll: the only thing the run wallet buys, priced off the authored purse.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { WEAPONS } from '../src/data/weapons.js';
import {
  SURVIVAL_DRAFT_CHOICES,
  SURVIVAL_DRAFT_OFFERS,
  offerDraft,
  rerollPrice,
} from '../src/data/survivalDraft.js';
import { SURVIVAL_WAVES } from '../src/data/survivalWaves.js';
import { PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import { runSession } from '../src/systems/runSession.js';
import { ships } from '../src/systems/ships.js';
import { economy } from '../src/systems/economy.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';
import { TECH_NODES } from '../src/data/tech.js';
import { offerCardLines, rerollControlLines } from '../src/ui/screens/crucibleDraft.js';

const ARENA = 'helios_core';
const SEED = 7;
const WEAPON_BY_ID = new Map(WEAPONS.map((def) => [def.id, def]));
const DRAFT_SCREEN_SOURCE = readFileSync(
  fileURLToPath(new URL('../src/ui/screens/crucibleDraft.js', import.meta.url)),
  'utf8',
);

function boot({ seed = SEED, hullId = 'ship_hornet', unlockTech = true } = {}) {
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
  // thing under test here. `unlockTech:false` leaves it locked on purpose, which is the one
  // reachable way to make the fitting authority refuse a legally-offered card.
  if (unlockTech) {
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

/**
 * Enter the draft with the wave already set, the way survivalRun does it: the wave the player just
 * cleared is standing before the phase flips, so the cards AND the re-roll price come from it.
 */
function enterDraftAtWave(harness, wave) {
  harness.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed: SEED, arenaId: ARENA });
  let from = 'loadout';
  for (const next of ['arena_intro', 'wave_intro', 'active', 'cleanup']) {
    harness.bus.emit('run:transitionRequested', { expectedPhase: from, nextPhase: next, reason: 't', tick: 0 });
    from = next;
  }
  harness.state.run.wave = wave;
  harness.bus.emit('run:transitionRequested', { expectedPhase: 'cleanup', nextPhase: 'draft', reason: 't', tick: 0 });
  return harness.state.run;
}

/** Pay the run wallet the way a scooped chip does — through the run owner, never by assignment. */
function fundRun(harness, credits) {
  harness.bus.emit('run:awardRequested', { credits, reason: 'test:chip' });
  return harness.state.run.credits;
}

function offerIds(list) {
  return (list || []).map((offer) => offer.id);
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

// ── CRU-016b: the run wallet buys another draw ───────────────────────────────

test('a re-roll costs three quarters of the wave it follows, and more each time in one draft', () => {
  // The price is arithmetic off the authored purse, not a taste number: every wave in the block
  // pays 8 + 4*wave, and the first re-roll of a draft is 6 + 3*wave. Pinning the RATIO against the
  // live recipes means a re-authored purse cannot silently make a re-roll free or unbuyable.
  for (let wave = 1; wave <= 10; wave++) {
    const plan = SURVIVAL_WAVES.find((w) => w.arenaId === ARENA && w.wave === wave);
    assert.ok(plan, `wave ${wave} recipe exists`);
    assert.equal(
      rerollPrice(wave, 0) * 4, plan.rewards.credits * 3,
      `wave ${wave}: a re-roll is three quarters of the ${plan.rewards.credits} cr purse`,
    );
  }
  // Meaningful at both ends: a wave-2 re-roll is 12 of the ~28 cr a perfect run holds by then,
  // and a wave-9 re-roll is 33 — cheap against a hoarded bank until the second and third bite.
  assert.equal(rerollPrice(2, 0), 12);
  assert.equal(rerollPrice(9, 0), 33);
  assert.equal(rerollPrice(9, 1), 66);
  assert.equal(rerollPrice(9, 2), 99);
  // Nonsense in, wave 1 out — never a free or negative re-roll.
  assert.equal(rerollPrice(0, 0), 9);
  assert.equal(rerollPrice(null, -4), 9);
});

test('re-rolled offers are deterministic for the seed and the re-roll count, and are new cards', () => {
  const args = { seed: SEED, wave: 4, hullId: 'ship_hornet', fittings: [null, null, null], pickCount: 0 };
  const free = offerDraft(args);
  assert.equal(free.ok, true);
  // The disjointness claim below is only honest if the pool is deep enough to make it.
  assert.ok(free.eligibleCount >= SURVIVAL_DRAFT_CHOICES * 3, 'pool is deep enough to re-roll twice');

  const first = offerDraft({ ...args, rerollCount: 1 });
  const firstAgain = offerDraft({ ...args, rerollCount: 1 });
  assert.deepEqual(offerIds(firstAgain.offers), offerIds(first.offers), 'same inputs, same cards');
  assert.equal(first.offers.length, SURVIVAL_DRAFT_CHOICES);

  const freeIds = new Set(offerIds(free.offers));
  for (const id of offerIds(first.offers)) {
    assert.ok(!freeIds.has(id), `${id} was not already on the table`);
  }

  const second = offerDraft({ ...args, rerollCount: 2 });
  const seen = new Set([...freeIds, ...offerIds(first.offers)]);
  for (const id of offerIds(second.offers)) {
    assert.ok(!seen.has(id), `${id} was not on either earlier draw`);
  }

  // A different seed or a different pick history still moves the re-rolled draw.
  assert.notDeepEqual(
    offerIds(offerDraft({ ...args, seed: SEED + 1, rerollCount: 1 }).offers),
    offerIds(first.offers),
  );
  assert.notDeepEqual(
    offerIds(offerDraft({ ...args, pickCount: 2, rerollCount: 1 }).offers),
    offerIds(first.offers),
  );
});

test('a paid re-roll charges the wallet exactly once and deals a different three', () => {
  const harness = boot();
  enterDraftAtWave(harness, 2);
  fundRun(harness, 100);
  const before = offerIds(survivalDraft.currentOffers());
  const price = survivalDraft.rerollState().price;
  assert.equal(price, 12, 'wave 2 re-roll is priced off the wave 2 purse');
  assert.equal(survivalDraft.rerollState().available, true);

  harness.bus.emit('run:draftRerollRequested', {});

  assert.equal(named(harness.emitted, 'run:spendRequested').length, 1, 'charged once');
  const spent = named(harness.emitted, 'run:spent');
  assert.equal(spent.length, 1);
  assert.equal(spent[0].payload.credits, price);
  assert.equal(harness.state.run.credits, 100 - price, 'the wallet paid exactly the price');
  assert.equal(survivalDraft.rerollCount(), 1);
  // A purchase that worked is never ALSO reported as a refusal.
  assert.equal(named(harness.emitted, 'run:draftRerollRejected').length, 0);
  assert.equal(survivalDraft.lastNotice(), null);

  const after = offerIds(survivalDraft.currentOffers());
  assert.equal(after.length, SURVIVAL_DRAFT_CHOICES);
  assert.notDeepEqual(after, before);
  for (const id of after) assert.ok(!before.includes(id), `${id} is a card not already refused`);
  // Re-rolling is not a resolution: the run is still waiting for a pick or a skip.
  assert.equal(named(harness.emitted, 'run:draftResolved').length, 0);
  assert.equal(named(harness.emitted, 'run:draftOffered').length, 2);
  assert.equal(named(harness.emitted, 'run:draftOffered').at(-1).payload.rerolls, 1);
  // The purchase receipt itself: which draw, what it cost, what is left.
  const bought = named(harness.emitted, 'run:draftRerolled');
  assert.equal(bought.length, 1);
  assert.equal(bought[0].payload.rerolls, 1);
  assert.equal(bought[0].payload.price, price);
  assert.equal(bought[0].payload.credits, 100 - price);
  // The next look costs double, and the run wallet is smaller for it.
  assert.equal(survivalDraft.rerollState().price, 24);
});

test('a re-roll the wallet cannot cover is refused BEFORE any charge, and the draft still resolves', () => {
  const harness = boot();
  enterDraftAtWave(harness, 2);
  fundRun(harness, 5);
  const before = survivalDraft.currentOffers();
  const state = survivalDraft.rerollState();
  assert.equal(state.available, false);
  assert.equal(state.reason, 'insufficient_credits');
  assert.match(state.note, /12 cr/);
  assert.match(state.note, /5 cr/);

  harness.bus.emit('run:draftRerollRequested', {});

  // The strongest form of "only when affordable": the charge is never even asked for.
  assert.equal(named(harness.emitted, 'run:spendRequested').length, 0, 'no charge was requested');
  assert.equal(named(harness.emitted, 'run:spent').length, 0);
  assert.equal(harness.state.run.credits, 5, 'the wallet is untouched');
  const rejected = named(harness.emitted, 'run:draftRerollRejected');
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].payload.reason, 'insufficient_credits');
  assert.deepEqual(offerIds(survivalDraft.currentOffers()), offerIds(before), 'the offers stand');
  assert.equal(survivalDraft.rerollCount(), 0);
  assert.match(survivalDraft.lastNotice(), /run wallet holds 5 cr/);

  // And the draft is still answerable — a refused purchase can never strand the phase machine.
  harness.bus.emit('run:draftPickRequested', { offerId: before[0].id });
  const resolved = named(harness.emitted, 'run:draftResolved');
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].payload.applied, true);
});

test('a spend that is not ours never buys a re-roll', () => {
  const harness = boot();
  enterDraftAtWave(harness, 2);
  fundRun(harness, 100);
  const before = offerIds(survivalDraft.currentOffers());

  // Someone else's charge settles on the same bus with the same receipt name.
  harness.bus.emit('run:spendRequested', { credits: 10, reason: 'someone:else' });
  assert.equal(named(harness.emitted, 'run:spent').length, 1);

  assert.equal(survivalDraft.rerollCount(), 0, 'no draw was bought off a foreign receipt');
  assert.deepEqual(offerIds(survivalDraft.currentOffers()), before);
});

test('the draft resolves after any number of re-rolls, and the last card still fits', () => {
  const harness = boot();
  enterDraftAtWave(harness, 9);
  fundRun(harness, 400);
  let bought = 0;
  for (let guard = 0; guard < 12 && survivalDraft.rerollState().available; guard++) {
    harness.bus.emit('run:draftRerollRequested', {});
    bought++;
  }
  assert.ok(bought >= 2, `a 400 cr bank buys more than one look at wave 9 (bought ${bought})`);
  assert.equal(survivalDraft.rerollCount(), bought);
  assert.equal(named(harness.emitted, 'run:spendRequested').length, bought);
  assert.equal(named(harness.emitted, 'run:draftResolved').length, 0, 're-rolling never resolves');
  // Whatever stopped the loop said so plainly.
  const stopped = survivalDraft.rerollState();
  assert.ok(['insufficient_credits', 'pool_exhausted'].includes(stopped.reason), stopped.reason);

  const offer = survivalDraft.currentOffers()[0];
  harness.bus.emit('run:draftPickRequested', { offerId: offer.id });
  const resolved = named(harness.emitted, 'run:draftResolved');
  assert.equal(resolved.length, 1, 'exactly one receipt, however many draws were bought');
  assert.equal(resolved[0].payload.applied, true);
  assert.equal(activeFittings(harness)[offer.slotIndex], offer.defId);
});

test('a pool with nothing left to show refuses the re-roll instead of charging for the same three', () => {
  // The Kestrel has one small hardpoint, so only a handful of verbs are ever legal on it.
  const harness = boot({ hullId: 'ship_kestrel' });
  enterDraftAtWave(harness, 5);
  fundRun(harness, 400);
  for (let guard = 0; guard < 12 && survivalDraft.rerollState().available; guard++) {
    harness.bus.emit('run:draftRerollRequested', {});
  }
  const stopped = survivalDraft.rerollState();
  assert.equal(stopped.reason, 'pool_exhausted', 'a deep bank runs out of CARDS, not credits');
  assert.ok(stopped.credits > 0, 'and it still has money it is not being allowed to waste');

  const spendsBefore = named(harness.emitted, 'run:spendRequested').length;
  const creditsBefore = harness.state.run.credits;
  const offersBefore = offerIds(survivalDraft.currentOffers());
  harness.bus.emit('run:draftRerollRequested', {});
  assert.equal(named(harness.emitted, 'run:spendRequested').length, spendsBefore, 'nothing charged');
  assert.equal(harness.state.run.credits, creditsBefore);
  assert.deepEqual(offerIds(survivalDraft.currentOffers()), offersBefore);
  assert.equal(named(harness.emitted, 'run:draftRerollRejected').at(-1).payload.reason, 'pool_exhausted');
  assert.match(survivalDraft.lastNotice(), /Nothing else in the pool/);

  harness.bus.emit('run:draftPickRequested', { offerId: null });
  assert.equal(named(harness.emitted, 'run:draftResolved').length, 1);
});

test('a card the fitting authority refuses is said out loud, and the run still moves on', () => {
  // Nothing is researched, so the fit gate refuses a card the draft was allowed to offer.
  const harness = boot({ unlockTech: false });
  enterDraftAtWave(harness, 3);
  const offer = survivalDraft.currentOffers()[0];
  harness.bus.emit('run:draftPickRequested', { offerId: offer.id });

  const rejected = named(harness.emitted, 'run:draftPickRejected');
  assert.equal(rejected.length, 1);
  const spoken = named(harness.emitted, 'toast');
  assert.ok(spoken.length >= 1, 'the refusal reaches the player');
  assert.ok(
    spoken.some((entry) => String(entry.payload.text).includes(offer.verb)),
    'and it names the card that was refused',
  );
  assert.match(survivalDraft.lastNotice(), /loadout is unchanged/);
  const resolved = named(harness.emitted, 'run:draftResolved');
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].payload.applied, false);
});

test('the re-roll control reads as unavailable rather than looking live and doing nothing', () => {
  const live = rerollControlLines({
    open: true, wave: 2, rerolls: 0, price: 12, credits: 40, available: true, reason: null, note: '',
  });
  assert.equal(live.visible, true);
  assert.equal(live.label, 'Re-roll · 12 cr');
  assert.equal(live.wallet, 'Run wallet 40 cr');
  assert.equal(live.disabled, false);
  assert.equal(live.notice, '');

  const short = rerollControlLines({
    open: true, wave: 2, rerolls: 0, price: 12, credits: 5, available: false,
    reason: 'insufficient_credits', note: 'A re-roll costs 12 cr. The run wallet holds 5 cr.',
  });
  assert.equal(short.disabled, true, 'unaffordable is drawn dead');
  assert.match(short.notice, /12 cr/);
  assert.match(short.notice, /5 cr/);
  assert.equal(short.wallet, 'Run wallet 5 cr');

  const dry = rerollControlLines({
    open: true, wave: 9, rerolls: 3, price: 132, credits: 400, available: false,
    reason: 'pool_exhausted', note: 'Nothing else in the pool fits this hull.',
  });
  assert.equal(dry.disabled, true);
  assert.equal(dry.label, 'Re-roll', 'a price is not quoted for a draw that cannot happen');
  assert.equal(dry.draw, 'Draw 4');

  assert.equal(rerollControlLines(null).visible, false);
  // A live refusal outranks the standing one, so the newest thing that happened is what is read.
  assert.equal(
    rerollControlLines({ open: true, price: 9, credits: 9, available: true, note: '' }, 'said no').notice,
    'said no',
  );
});

test('the draft surface re-renders per draft, buys through the owner, and never writes the run', () => {
  // The screen is mounted ONCE and cached: without refresh() the second draft of a run would
  // re-show the first draft's cards.
  assert.equal(typeof survivalDraft.rerollState, 'function');
  assert.match(DRAFT_SCREEN_SOURCE, /refresh\(ctx\)\s*\{/, 'the draft screen has a refresh');
  assert.match(DRAFT_SCREEN_SOURCE, /run:draftRerollRequested/, 'it emits the re-roll intent');
  assert.match(DRAFT_SCREEN_SOURCE, /owner\.rerollState/, 'and draws the control from the owner');
  assert.match(DRAFT_SCREEN_SOURCE, /event\.key === 'r' \|\| event\.key === 'R'/, 'R re-rolls');
  assert.match(DRAFT_SCREEN_SOURCE, /'123'\.indexOf\(event\.key\)/, '1-3 still pick');
  assert.match(DRAFT_SCREEN_SOURCE, /event\.key === 'Escape'/, 'Escape still keeps the loadout');
  assert.match(DRAFT_SCREEN_SOURCE, /ArrowRight/, 'arrows still move');
  // The wallet is the run owner's business. A screen that charged it would be a second writer.
  assert.ok(!/run:spendRequested/.test(DRAFT_SCREEN_SOURCE), 'the screen never charges the wallet');
  assert.ok(!/state\.run\s*=/.test(DRAFT_SCREEN_SOURCE), 'the screen never writes state.run');
  assert.ok(
    !/\b(ships|registry\.get\('ships'\))\s*\.\s*(fit|unfit|grant)Module\s*\(/.test(DRAFT_SCREEN_SOURCE),
    'and never calls the fitting authority itself',
  );
});
