// OVH-01a2 — the Pilot Tree's route: the sim deals, the screen only asks.
// Design: design/program/fleet/packets/OVH-01a2-pilot-route.md over 04_SWARM.md §3 and
// 06_PROGRESSION_AND_ECONOMY.md §2. The run owner deals at fixed moments (a level-up commit
// that banked a pick; a choice that leaves picks waiting), an empty draw opens no offer, only
// live nodes are dealt, the screen asks through run:pilotCardRequested / run:pilotRerollRequested,
// and both intents cross the worker lane's forward set. state.run.pilot reaches the main side
// through the same domain mirror the rest of state.run rides.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createRunState, RUN_XP_LEVEL_BASE, RUN_XP_LEVEL_STEP } from '../src/core/runState.js';
import { MAIN_TO_SIM_BUS_EVENTS } from '../src/core/mainToSimEventSurface.js';
// The worker lane's read model — the canonical mirror src/core/simLaneMain.js applies on the
// main side. Proven at the differ level, like test/domain-differ-node-lifecycle.test.mjs.
import * as simReadModel from '../scripts/lib/simReadModel.mjs';
import { PILOT_LIVE_NODE_IDS, withPilotLiveNodesForTest } from '../src/data/pilotLive.js';
import { PILOT_EVOLUTIONS, PILOT_NODES, eligiblePilotCards, getPilotCard, pilotPoints } from '../src/data/pilotTree.js';
import { runSession } from '../src/systems/runSession.js';

const ALL_PILOT_CARDS = Object.freeze([
  ...PILOT_NODES.map((node) => node.id),
  ...PILOT_EVOLUTIONS.map((evo) => evo.id),
]);
const withAllCardsLive = (fn) => withPilotLiveNodesForTest(ALL_PILOT_CARDS, fn);

function boot(seed = 1) {
  const state = createGameState(seed);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  runSession.init({ state, bus });
  return { state, bus, emitted };
}

function named(emitted, event) {
  return emitted.filter((entry) => entry.event === event);
}

function beginSwarm(harness, seed = 7) {
  harness.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed });
  const walk = [['loadout', 'arena_intro'], ['arena_intro', 'wave_intro'], ['wave_intro', 'active']];
  for (const [from, to] of walk) {
    harness.bus.emit('run:transitionRequested', { expectedPhase: from, nextPhase: to, reason: 'test', tick: 0 });
  }
  return harness.state.run;
}

test('a level-up deals exactly once, with no offer open', () => withAllCardsLive(() => {
  const harness = boot(21);
  beginSwarm(harness, 21);
  assert.equal(harness.state.run.pilot.offer, null, 'no offer before the first level');

  // Exactly the level-2 threshold: the commit banks a pick and the owner deals once.
  harness.bus.emit('run:awardRequested', { xp: RUN_XP_LEVEL_BASE, reason: 'kill' });
  assert.equal(harness.state.run.level, 2);
  assert.equal(harness.state.run.pilot.banked, 1);
  const offered = named(harness.emitted, 'run:pilotOffered');
  assert.equal(offered.length, 1, 'exactly one deal');
  assert.equal(harness.state.run.pilot.offer.cards.length, 3);
  assert.equal(harness.state.run.pilot.offer.rerolls, 0);
  const dealtHand = harness.state.run.pilot.offer.cards;

  // The rest of the level-3 cost: one more pick banked, no second deal.
  harness.bus.emit('run:awardRequested', { xp: RUN_XP_LEVEL_BASE + RUN_XP_LEVEL_STEP, reason: 'kill' });
  assert.equal(harness.state.run.level, 3);
  assert.equal(harness.state.run.pilot.banked, 2);
  assert.equal(named(harness.emitted, 'run:pilotOffered').length, 1, 'an open offer is not replaced');
  assert.deepEqual(harness.state.run.pilot.offer.cards, dealtHand);

  // A purse-only award is not a deal moment at all.
  harness.bus.emit('run:awardRequested', { credits: 400, reason: 'purse' });
  assert.equal(named(harness.emitted, 'run:pilotOffered').length, 1);
}));

test('a second banked pick deals after the first choice', () => withAllCardsLive(() => {
  const harness = boot(22);
  beginSwarm(harness, 22);
  // Level 3 from scratch: two picks banked, one hand dealt.
  harness.bus.emit('run:awardRequested', { xp: 2 * RUN_XP_LEVEL_BASE + RUN_XP_LEVEL_STEP, reason: 'kill' });
  assert.equal(harness.state.run.pilot.banked, 2);
  assert.equal(named(harness.emitted, 'run:pilotOffered').length, 1);
  const firstHand = harness.state.run.pilot.offer.cards;

  // Taking a card leaves one pick waiting — the owner deals a fresh hand immediately.
  assert.equal(runSession.choosePilotCard(harness.state, 0), true);
  assert.equal(harness.state.run.pilot.banked, 1);
  assert.equal(named(harness.emitted, 'run:pilotOffered').length, 2, 'the waiting pick gets a fresh hand');
  assert.equal(harness.state.run.pilot.offer.cards.length, 3);

  // The last pick: taking it empties the bank — no third deal.
  assert.equal(runSession.choosePilotCard(harness.state, 0), true);
  assert.equal(harness.state.run.pilot.banked, 0);
  assert.equal(named(harness.emitted, 'run:pilotOffered').length, 2);
  assert.equal(harness.state.run.pilot.offer, null);
  // The two hands came from the run's own rng at fixed moments — both are real deals.
  assert.ok(firstHand.length === 3 && harness.state.run.pilot.nodes.length === 2);
}));

test('a level-up never promises a pick the tree cannot give', () => {
  // Release list 2026-11-19: "A level-up must always offer a real pick or not happen" — runs used to
  // bank picks after the skills ran out, and the HUD promised cards that never came.
  const harness = boot(23);
  withPilotLiveNodesForTest([], () => {
  beginSwarm(harness, 23);
  harness.bus.emit('run:awardRequested', { xp: RUN_XP_LEVEL_BASE, reason: 'kill' });
  assert.equal(harness.state.run.level, 2, 'the level still rises');
  assert.equal(harness.state.run.pilot.banked, 0, 'but no pick is banked with nothing to take');
  assert.equal(harness.state.run.pilot.offer, null);
  assert.equal(named(harness.emitted, 'run:levelUp').length, 0, 'and no level-up beat promises one');
  });
  // Once cards exist, the next level banks and deals at once.
  withAllCardsLive(() => {
    harness.bus.emit('run:awardRequested', { xp: RUN_XP_LEVEL_BASE + RUN_XP_LEVEL_STEP, reason: 'kill' });
  });
  assert.equal(harness.state.run.pilot.banked, 1);
  assert.equal(named(harness.emitted, 'run:pilotOffered').length, 1);
  assert.equal(harness.state.run.pilot.offer.cards.length, 3);
});

test('only live nodes are ever dealt — draw, re-roll and choose', () => {
  const live = ['gunner_steady_hands', 'ghost_decoy', 'bruiser_stagger', 'rigger_long_reel'];
  withPilotLiveNodesForTest(live, () => {
    const harness = boot(24);
    beginSwarm(harness, 24);
    harness.bus.emit('run:awardRequested', { xp: RUN_XP_LEVEL_BASE, credits: 1000, reason: 'kill' });
    const hand = harness.state.run.pilot.offer.cards;
    assert.equal(hand.length, 3);
    for (const id of hand) assert.ok(live.includes(id), `dealt ${id} is live`);

    assert.equal(runSession.rerollPilotOffer(harness.state), true);
    for (const id of harness.state.run.pilot.offer.cards) {
      assert.ok(live.includes(id), `re-rolled ${id} is live`);
    }
    assert.equal(runSession.choosePilotCard(harness.state, 0), true);
    assert.ok(live.includes(harness.state.run.pilot.nodes[0]), 'the chosen card was live');

    // A stale hand showing a non-live card is refused in words.
    harness.state.run.pilot.offer = { cards: ['gunner_drum'], rerolls: 0 };
    assert.equal(runSession.choosePilotCard(harness.state, 0), false);
    const rejected = named(harness.emitted, 'run:pilotCardRejected');
    assert.equal(rejected.at(-1).payload.reason, 'not_eligible');
    assert.equal(rejected.at(-1).payload.nodeId, 'gunner_drum');
    assert.equal(harness.state.run.pilot.nodes.includes('gunner_drum'), false, 'nothing applied');
  });
});

test('the two intents route to the owner, and refusals are said in words', () => withAllCardsLive(() => {
  const harness = boot(25);
  beginSwarm(harness, 25);
  harness.bus.emit('run:awardRequested', { xp: RUN_XP_LEVEL_BASE, credits: 1000, reason: 'kill' });
  assert.equal(harness.state.run.pilot.offer.cards.length, 3, 'a hand waits');

  // The reroll intent reaches the owner's purse and redraws.
  harness.bus.emit('run:pilotRerollRequested', {});
  assert.equal(harness.state.run.credits, 1000 - 150);
  assert.equal(harness.state.run.pilot.offer.rerolls, 1);
  assert.equal(named(harness.emitted, 'run:pilotOfferRerolled').length, 1);

  // The card intent applies the card through the owner.
  const card = getPilotCard(harness.state.run.pilot.offer.cards[1]);
  harness.bus.emit('run:pilotCardRequested', { index: 1 });
  assert.deepEqual(harness.state.run.pilot.nodes, [card.id]);
  assert.equal(pilotPoints(harness.state, card.branch), 1);
  assert.equal(harness.state.run.pilot.banked, 0);
  assert.equal(harness.state.run.pilot.offer, null);
  assert.equal(named(harness.emitted, 'run:pilotCardChosen').length, 1);

  // Every further ask is refused with a receipt the screen can print.
  harness.bus.emit('run:pilotCardRequested', { index: 0 });
  harness.bus.emit('run:pilotRerollRequested', {});
  harness.bus.emit('run:pilotCardRequested', { index: 9 });
  const cardRefusals = named(harness.emitted, 'run:pilotCardRejected').map((entry) => entry.payload.reason);
  assert.deepEqual(cardRefusals, ['no_offer', 'no_offer']);
  assert.equal(named(harness.emitted, 'run:pilotRerollRejected').at(-1).payload.reason, 'no_offer');

  // An out-of-range index on a live hand is its own refusal.
  harness.bus.emit('run:awardRequested', { xp: RUN_XP_LEVEL_BASE + RUN_XP_LEVEL_STEP, reason: 'kill' });
  harness.bus.emit('run:pilotCardRequested', { index: 7 });
  assert.equal(named(harness.emitted, 'run:pilotCardRejected').at(-1).payload.reason, 'invalid_index');
  assert.equal(named(harness.emitted, 'run:pilotCardChosen').length, 1, 'nothing was applied');

  // A broke re-roll is refused with the purse spelled out, and nothing is charged.
  harness.state.run.pilot.banked = 1;
  harness.bus.emit('run:spendRequested', { credits: harness.state.run.credits, reason: 'drain' });
  const creditsBefore = harness.state.run.credits;
  harness.bus.emit('run:pilotRerollRequested', {});
  const rerollRefusal = named(harness.emitted, 'run:pilotRerollRejected').at(-1).payload;
  assert.equal(rerollRefusal.reason, 'insufficient_credits');
  assert.equal(rerollRefusal.price, 150);
  assert.equal(harness.state.run.credits, creditsBefore);
  assert.equal(named(harness.emitted, 'run:pilotOfferRerolled').length, 1, 'no paid redraw happened');
}));

test('two runs with the same seed and inputs deal identical hands', () => withAllCardsLive(() => {
  const play = () => {
    const harness = boot(4242);
    beginSwarm(harness, 4242);
    const hands = [];
    const awards = [
      { xp: RUN_XP_LEVEL_BASE, credits: 400, reason: 'kill' },
      { xp: RUN_XP_LEVEL_BASE + RUN_XP_LEVEL_STEP, reason: 'kill' },
      { credits: 150, reason: 'purse' },
      { xp: RUN_XP_LEVEL_BASE + 2 * RUN_XP_LEVEL_STEP, reason: 'kill' },
    ];
    for (const award of awards) {
      harness.bus.emit('run:awardRequested', award);
      const offer = harness.state.run.pilot.offer;
      hands.push(offer ? [...offer.cards] : null);
      // Scripted play: whenever a hand is open, its first card is taken.
      if (offer) runSession.choosePilotCard(harness.state, 0);
    }
    return { hands, pilot: JSON.parse(JSON.stringify(harness.state.run.pilot)) };
  };
  const a = play();
  const b = play();
  assert.deepEqual(a.hands, b.hands, 'every dealt hand is identical');
  assert.deepEqual(a.pilot, b.pilot, 'and so is the whole pilot record at the end');
  assert.ok(a.hands.some((hand) => hand !== null), 'the script actually dealt');
}));

test('the forward set contains both pilot intents', () => {
  assert.ok(MAIN_TO_SIM_BUS_EVENTS.has('run:pilotCardRequested'),
    'run:pilotCardRequested crosses the main→sim lane');
  assert.ok(MAIN_TO_SIM_BUS_EVENTS.has('run:pilotRerollRequested'),
    'run:pilotRerollRequested crosses the main→sim lane');
});

test('state.run.pilot reaches the main side through the worker-lane domain mirror', () => {
  // `run` is a mirrored domain root (scripts/lib/simReadModel.mjs DOMAIN_MIRROR_KEYS); the differ
  // expands run.pilot and signs its leaves like any other run container — the same route the
  // draft's run offers already ride, so the breath's hand (offer, banked, nodes, points) crosses
  // with no mirror change. Proven here at the differ level, the harness
  // test/domain-differ-node-lifecycle.test.mjs uses for the same wire.
  const { applyDomainPathUpdate, createDomainDiffer } = simReadModel;
  const run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: 5 });
  run.phase = 'active';
  run.pilot = {
    points: { gunner: 1 },
    nodes: ['gunner_steady_hands'],
    banked: 1,
    offer: { cards: ['gunner_drum', 'ghost_decoy'], rerolls: 0 },
  };
  const state = { run };
  const differ = createDomainDiffer();
  const mirror = new Map();
  const apply = (tick) => {
    const result = differ.diff(state, tick);
    for (const update of result.updates) applyDomainPathUpdate(mirror, update, new WeakSet());
    return result;
  };
  apply(0);
  assert.deepEqual(mirror.get('run').pilot, run.pilot,
    'offer, banked, nodes and points all cross on the run root');

  // A changed hand ships on the run root's cadence (≤ its 30-pass cold window).
  run.pilot.offer = { cards: ['ghost_decoy'], rerolls: 2 };
  run.pilot.banked = 0;
  let shipped = false;
  for (let tick = 1; tick <= 61 && !shipped; tick++) {
    const result = apply(tick);
    if (result.updates.some((update) => update.segs[0] === 'run' && update.segs[1] === 'pilot')) {
      shipped = true;
    }
  }
  assert.ok(shipped, 'the changed pilot hand ships within the run root cadence window');
  assert.deepEqual(mirror.get('run').pilot, run.pilot);
});

test('the shipped live list deals a card at every one of 13 picks, deep, wide or mixed', () => {
  // OVH-01 never-return: levelling that grants nothing. Whatever the director has turned on,
  // a pick must always find at least one card for any style of play.
  for (const id of PILOT_LIVE_NODE_IDS) assert.ok(getPilotCard(id), `live id ${id} is a real card`);
  const branchesOf = (pilot) => Object.keys(pilot.points).filter((b) => pilot.points[b] > 0);
  const styles = {
    deep: (cards, pilot) => {
      const best = Math.max(...cards.map((c) => (c.branch ? pilot.points[c.branch] || 0 : -1)));
      return cards.find((c) => (c.branch ? pilot.points[c.branch] || 0 : -1) === best);
    },
    wide: (cards, pilot) => {
      const low = Math.min(...cards.map((c) => (c.branch ? pilot.points[c.branch] || 0 : 99)));
      return cards.find((c) => (c.branch ? pilot.points[c.branch] || 0 : 99) === low);
    },
    mixed: (cards, pilot, pick) => (pick % 2 === 0 ? styles.deep(cards, pilot) : styles.wide(cards, pilot)),
  };
  for (const [style, choose] of Object.entries(styles)) {
    const pilot = { nodes: [], points: {}, banked: 0, offer: null };
    for (let pick = 0; pick < 13; pick += 1) {
      const cards = eligiblePilotCards(pilot, 'swarm');
      assert.ok(cards.length >= 1, `${style} picker: pick ${pick + 1} has a card (held ${JSON.stringify(pilot.points)})`);
      const card = choose(cards, pilot, pick);
      pilot.nodes.push(card.id);
      if (card.kind !== 'evolution') pilot.points[card.branch] = (pilot.points[card.branch] || 0) + 1;
    }
    assert.ok(branchesOf(pilot).length >= 1);
  }
});
