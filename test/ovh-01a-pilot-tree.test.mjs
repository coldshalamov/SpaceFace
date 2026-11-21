// OVH-01a — the Pilot Tree engine: data, banked picks, the three-card draw.
// Design: design/overhaul/06_PROGRESSION_AND_ECONOMY.md §2 (the tree) and
// design/overhaul/04_SWARM.md §3 (how a run uses it). This packet ships the engine only —
// the card UI (OVH-01b) and node effects (OVH-01c…) follow.
//
// OVH-01a2: only LIVE nodes are dealt (src/data/pilotLive.js — empty until an effect ships), so
// every test below that needs eligible cards wraps its body in withAllCardsLive, the packet's
// sanctioned test seam. The route itself (fixed deal moments, intents, the empty-deal rule) is
// covered by test/ovh-01a2-pilot-route.test.mjs.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import {
  RUN_XP_LEVEL_BASE,
  RUN_XP_LEVEL_STEP,
  RUN_XP_SOURCES,
  createPilotProgress,
  createRunState,
  runLevelForXp,
  runXpForLevel,
  validateRunState,
} from '../src/core/runState.js';
import { swarmCourseQuota, swarmLevel, swarmRewards } from '../src/data/swarmMode.js';
import { killXpFor } from '../src/systems/survivalRewards.js';
import { withPilotLiveNodesForTest } from '../src/data/pilotLive.js';
import {
  PILOT_BEND_GROUPS,
  PILOT_BRANCHES,
  PILOT_EVOLUTIONS,
  PILOT_EVOLUTION_BRANCH_POINTS,
  PILOT_EVOLUTION_TOTAL_POINTS_FLOOR,
  PILOT_NODES,
  PILOT_REROLL_SCRAP,
  PILOT_TIER_GATES,
  eligiblePilotCards,
  getPilotCard,
  isPilotCardEligible,
  lockedPilotNodeIds,
  pilotCardWeight,
  pilotDoorForRun,
  pilotHas,
  pilotPoints,
} from '../src/data/pilotTree.js';
import {
  choosePilotCard,
  drawPilotOffer,
  rerollPilotOffer,
  runSession,
} from '../src/systems/runSession.js';

// Every card in the tree, live for the duration of one test body.
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

function swarmNodeIds() {
  return PILOT_NODES
    .filter((node) => !['trader', 'prospector', 'builder'].includes(node.branch))
    .map((node) => node.id);
}

test('data shape: the rebuilt tree (2026-11-20) — only nodes whose effect is in the build', () => {
  // The 81-node transcription of 06 §2.2 carried fifteen power bends, Second Line, Free Hand and
  // most of Ghost with no effect behind them. The tree now holds only built nodes: six combat
  // branches of at least five non-capstone nodes plus a capstone, and three Adventure work branches.
  const counts = {};
  for (const node of PILOT_NODES) counts[node.branch] = (counts[node.branch] || 0) + 1;
  assert.deepEqual(counts, {
    gunner: 7, bruiser: 6, rigger: 6, conjurer: 7, juggernaut: 8, ghost: 6,
    trader: 3, prospector: 3, builder: 3,
  });
  assert.equal(new Set(PILOT_NODES.map((node) => node.id)).size, PILOT_NODES.length, 'ids are unique');
  for (const node of PILOT_NODES) {
    assert.ok([1, 2, 3, 'capstone'].includes(node.tier), `${node.id}: valid tier`);
    assert.ok(node.name && typeof node.name === 'string', `${node.id}: named`);
    assert.ok(node.text && typeof node.text === 'string', `${node.id}: one-sentence text`);
    assert.ok(PILOT_BRANCHES.some((branch) => branch.id === node.branch), `${node.id}: known branch`);
  }
  for (const branch of PILOT_BRANCHES.filter((b) => !b.adventureOnly)) {
    const own = PILOT_NODES.filter((node) => node.branch === branch.id);
    assert.ok(own.filter((n) => n.tier !== 'capstone').length >= 5, `${branch.id}: five nodes under the capstone`);
    assert.equal(own.filter((n) => n.tier === 'capstone').length, 1, `${branch.id}: one capstone`);
  }
});

test('data shape: six shared combat branches plus three Adventure-only work branches', () => {
  assert.deepEqual(PILOT_BRANCHES.map((branch) => branch.id), [
    'gunner', 'bruiser', 'rigger', 'conjurer', 'juggernaut', 'ghost', 'trader', 'prospector', 'builder',
  ]);
  assert.deepEqual(PILOT_BRANCHES.map((branch) => branch.name), [
    'Guns', 'Knockback', 'Line', 'Powers', 'Ramming', 'Stealth', 'Trading', 'Mining', 'Building',
  ]);
  assert.deepEqual(PILOT_BRANCHES.filter((b) => b.adventureOnly).map((b) => b.id), ['trader', 'prospector', 'builder']);
  assert.equal(PILOT_NODES.filter((node) => node.adventureOnly).length, 0, 'no single node is door-flagged');
});

test('tier gates: 2 / 4 / 6 points in-branch with the point in hand; Stealth nodes need the Cloak', () => withAllCardsLive(() => {
  assert.deepEqual(PILOT_TIER_GATES, { 1: 0, 2: 2, 3: 4, capstone: 6 });
  const door = 'adventure';
  const held = (points, nodes = []) => ({ points, nodes, banked: 0, offer: null });
  assert.equal(isPilotCardEligible(getPilotCard('gunner_drum'), held({ gunner: 0 }), door), false);
  assert.equal(isPilotCardEligible(getPilotCard('gunner_drum'), held({ gunner: 1 }), door), true);
  assert.equal(isPilotCardEligible(getPilotCard('gunner_ricochet'), held({ gunner: 2 }), door), false);
  assert.equal(isPilotCardEligible(getPilotCard('gunner_ricochet'), held({ gunner: 3 }), door), true);
  assert.equal(isPilotCardEligible(getPilotCard('gunner_gold_thread'), held({ gunner: 4 }), door), false);
  assert.equal(isPilotCardEligible(getPilotCard('gunner_gold_thread'), held({ gunner: 5 }), door), true);
  assert.equal(isPilotCardEligible(getPilotCard('ghost_cold_drift'), held({ ghost: 0 }), door), false, 'Cold Drift waits for the Cloak');
  assert.equal(isPilotCardEligible(getPilotCard('ghost_cloak'), held({ ghost: 0 }), door), true);
  assert.equal(isPilotCardEligible(getPilotCard('ghost_cold_drift'), held({ ghost: 1 }, ['ghost_cloak']), door), true);
}));

test('capstones and evolutions: named builds with plain one-line text', () => {
  const spots = [
    ['gunner_gold_thread', 'capstone', 'Gold Thread'],
    ['bruiser_newtons_cradle', 'capstone', "Newton's Cradle"],
    ['rigger_hurricane', 'capstone', 'Hurricane'],
    ['conjurer_avalanche', 'capstone', 'Landslide'],
    ['juggernaut_juggernaut', 'capstone', 'Juggernaut'],
    ['ghost_phantom', 'capstone', 'Phantom'],
  ];
  for (const [id, tier, name] of spots) {
    const node = getPilotCard(id);
    assert.ok(node, `${id} exists`);
    assert.equal(node.tier, tier, `${id} tier`);
    assert.equal(node.name, name, `${id} name`);
  }
  for (const evo of PILOT_EVOLUTIONS) {
    assert.ok(evo.build && evo.text, `${evo.id}: a build a player can describe, and what changes`);
  }
});

test('evolutions: two branches at 4 points each open a named build', () => withAllCardsLive(() => {
  assert.deepEqual(PILOT_EVOLUTIONS.map((evo) => [evo.id, [...evo.requires]]), [
    ['evolution_orbital_saw', ['gunner', 'rigger']],
    ['evolution_wrecking_ball', ['bruiser', 'rigger']],
    ['evolution_freight_train', ['juggernaut', 'rigger']],
    ['evolution_meteor_shower', ['conjurer', 'gunner']],
    ['evolution_black_hole', ['conjurer', 'ghost']],
  ]);
  assert.equal(PILOT_EVOLUTION_TOTAL_POINTS_FLOOR, 8);
  assert.equal(PILOT_EVOLUTION_BRANCH_POINTS, 4, 'an evolution opens when both branches reach tier 3');
  const pilot = { points: { gunner: 4, rigger: 4 }, nodes: [], banked: 0, offer: null };
  assert.equal(isPilotCardEligible(getPilotCard('evolution_orbital_saw'), pilot, 'swarm'), true);
  assert.equal(isPilotCardEligible(getPilotCard('evolution_orbital_saw'),
    { points: { gunner: 6, rigger: 3 }, nodes: [], banked: 0, offer: null }, 'swarm'), false);
}));

test('pilot tree data is frozen', () => {
  assert.ok(Object.isFrozen(PILOT_BRANCHES));
  assert.ok(Object.isFrozen(PILOT_NODES));
  assert.ok(Object.isFrozen(PILOT_EVOLUTIONS));
  assert.ok(Object.isFrozen(PILOT_BEND_GROUPS));
  assert.ok(Object.isFrozen(PILOT_TIER_GATES));
  for (const node of PILOT_NODES) assert.ok(Object.isFrozen(node));
  for (const evo of PILOT_EVOLUTIONS) assert.ok(Object.isFrozen(evo));
});

test('draw rule: three distinct door-eligible cards for a fresh pilot, over many seeds', () => withAllCardsLive(() => {
  for (let seed = 1; seed <= 40; seed++) {
    const harness = boot(seed);
    beginSwarm(harness, seed);
    const cards = drawPilotOffer(harness.state);
    assert.ok(Array.isArray(cards) && cards.length === 3, `seed ${seed}: three cards`);
    assert.equal(new Set(cards).size, 3, `seed ${seed}: distinct`);
    for (const id of cards) {
      const card = getPilotCard(id);
      assert.ok(card, `seed ${seed}: ${id} is a real card`);
      assert.notEqual(card.branch, 'industry', `seed ${seed}: Swarm never offers Industry`);
      assert.notEqual(card.adventureOnly, true, `seed ${seed}: Swarm never offers Adventure-only nodes`);
    }
  }
}));

test('draw rule: the deepest branch and an untouched branch are both always on the table', () => withAllCardsLive(() => {
  const pilot = {
    points: { gunner: 4 },
    nodes: ['gunner_steady_hands', 'gunner_quick_vent', 'gunner_hollow_point', 'gunner_shred'],
    banked: 0,
    offer: null,
  };
  const untouched = new Set(['bruiser', 'rigger', 'conjurer', 'juggernaut', 'ghost']);
  for (let seed = 1; seed <= 40; seed++) {
    const harness = boot(seed);
    beginSwarm(harness, seed);
    harness.state.run.pilot = JSON.parse(JSON.stringify(pilot));
    const cards = drawPilotOffer(harness.state);
    assert.equal(cards.length, 3, `seed ${seed}: three cards`);
    assert.ok(
      cards.some((id) => id.startsWith('gunner_')),
      `seed ${seed}: commitment pays — a card from the deepest branch (gunner) is offered`,
    );
    assert.ok(
      cards.some((id) => untouched.has(getPilotCard(id).branch)),
      `seed ${seed}: a pivot stays possible — a card from an untouched branch is offered`,
    );
  }
}));

test('draw rule: a capstone appears only once its branch holds 5 points', () => withAllCardsLive(() => {
  const capstones = {};
  const at = (points, nodes) => ({ points, nodes, banked: 0, offer: null });
  const gunnerFour = ['gunner_steady_hands', 'gunner_quick_vent', 'gunner_hollow_point', 'gunner_spin_up'];
  for (let seed = 1; seed <= 40; seed++) {
    const harness = boot(seed);
    beginSwarm(harness, seed);
    harness.state.run.pilot = at({ gunner: 4 }, gunnerFour);
    for (const id of drawPilotOffer(harness.state)) {
      assert.notEqual(id, 'gunner_gold_thread', `seed ${seed}: capstone stays shut at 4 held`);
    }
  }
  let goldThreadSeen = false;
  for (let seed = 1; seed <= 40; seed++) {
    const harness = boot(seed);
    beginSwarm(harness, seed);
    const nodes = [...gunnerFour, 'gunner_drum'];
    harness.state.run.pilot = at({ gunner: 5 }, nodes);
    for (const id of drawPilotOffer(harness.state)) {
      const card = getPilotCard(id);
      if (card.tier === 'capstone') {
        capstones[card.branch] = (capstones[card.branch] || 0) + 1;
        assert.ok(harness.state.run.pilot.points[card.branch] >= 5, 'capstones only from branches holding 5');
      }
      if (id === 'gunner_gold_thread') goldThreadSeen = true;
    }
  }
  assert.equal(goldThreadSeen, true, 'the capstone is on the table at 5 held');
}));

test('draw rule: an evolution needs both branches at 4', () => withAllCardsLive(() => {
  const at = (points, nodes) => ({ points, nodes, banked: 0, offer: null });
  const gunnerFour = ['gunner_steady_hands', 'gunner_hollow_point', 'gunner_drum', 'gunner_spin_up'];
  const riggerFour = ['rigger_long_reel', 'rigger_quick_latch', 'rigger_sweet_spot', 'rigger_crane'];
  for (let seed = 1; seed <= 40; seed++) {
    const harness = boot(seed);
    beginSwarm(harness, seed);
    harness.state.run.pilot = at({ gunner: 4, rigger: 3 }, [...gunnerFour, ...riggerFour.slice(0, 3)]);
    for (const id of drawPilotOffer(harness.state)) {
      assert.ok(!id.startsWith('evolution_'), `seed ${seed}: no evolution card at 4 + 3 — got ${id}`);
    }
  }
  let orbitalSawSeen = false;
  for (let seed = 1; seed <= 60; seed++) {
    const harness = boot(seed);
    beginSwarm(harness, seed);
    harness.state.run.pilot = at({ gunner: 4, rigger: 4 }, [...gunnerFour, ...riggerFour]);
    for (const id of drawPilotOffer(harness.state)) {
      if (id === 'evolution_orbital_saw') orbitalSawSeen = true;
    }
  }
  assert.equal(orbitalSawSeen, true, 'Orbital Saw can appear once both branches hold 4');
}));

function gunnerFourEvolutionFixture() {
  return ['gunner_steady_hands', 'gunner_quick_vent', 'gunner_hollow_point', 'gunner_spin_up',
    'rigger_long_reel', 'rigger_quick_latch', 'rigger_free_hand', 'rigger_hummingbird'];
}

test('draw rule: graceful with fewer than three eligible, and empty when nothing is', () => withAllCardsLive(() => {
  const harness = boot(5);
  beginSwarm(harness, 5);
  // Everything the Swarm door offers is taken: no card can be drawn — and an empty draw opens
  // NO offer (OVH-01a2 step 2): the pick stays banked, the offer stays null.
  harness.state.run.pilot = { points: {}, nodes: swarmNodeIds(), banked: 1, offer: null };
  assert.deepEqual(drawPilotOffer(harness.state), [], 'empty offer when nothing is eligible');
  assert.equal(harness.state.run.pilot.offer, null, 'an empty draw opens no offer');
  assert.equal(harness.state.run.pilot.banked, 1, 'the pick stays banked');
  // Exactly one eligible card comes back on its own.
  harness.state.run.pilot = {
    points: {},
    nodes: swarmNodeIds().filter((id) => id !== 'bruiser_stagger'),
    banked: 1,
    offer: null,
  };
  assert.deepEqual(drawPilotOffer(harness.state), ['bruiser_stagger']);
}));

test('the draw is deterministic for one seed', () => withAllCardsLive(() => {
  const pilot = () => ({ points: { gunner: 2 }, nodes: ['gunner_steady_hands', 'gunner_quick_vent'], banked: 2, offer: null });
  const series = () => {
    const harness = boot(99);
    beginSwarm(harness, 99);
    harness.state.run.pilot = pilot();
    const draws = [drawPilotOffer(harness.state)];
    draws.push(drawPilotOffer(harness.state));
    draws.push(drawPilotOffer(harness.state));
    return draws;
  };
  assert.deepEqual(series(), series(), 'identical seed and pilot draw identical offers, every draw');
}));

test('choose applies the card: point, node, banked − 1, offer cleared', () => withAllCardsLive(() => {
  const harness = boot(11);
  beginSwarm(harness, 11);
  harness.state.run.pilot = { points: {}, nodes: [], banked: 1, offer: null };
  const cards = drawPilotOffer(harness.state);
  const branch = getPilotCard(cards[0]).branch;
  assert.equal(choosePilotCard(harness.state, 0), true);
  // Every commit replaces state.run; read the live run at each step.
  assert.deepEqual(harness.state.run.pilot.points, { [branch]: 1 });
  assert.deepEqual(harness.state.run.pilot.nodes, [cards[0]]);
  assert.equal(harness.state.run.pilot.banked, 0);
  assert.equal(harness.state.run.pilot.offer, null);
  const chosen = named(harness.emitted, 'run:pilotCardChosen');
  assert.equal(chosen.length, 1);
  assert.equal(chosen[0].payload.nodeId, cards[0]);
  assert.equal(chosen[0].payload.branch, branch);
  // Bad indices and a missing offer change nothing.
  drawPilotOffer(harness.state);
  assert.equal(choosePilotCard(harness.state, 3), false);
  assert.equal(choosePilotCard(harness.state, -1), false);
  assert.equal(choosePilotCard(harness.state, '1'), false);
  harness.state.run.pilot.offer = null;
  assert.equal(choosePilotCard(harness.state, 0), false);
  assert.equal(named(harness.emitted, 'run:pilotCardChosen').length, 1);
}));

test('choose applies an evolution without granting branch points, and refuses a stale locked bend', () => withAllCardsLive(() => {
  const harness = boot(12);
  beginSwarm(harness, 12);
  harness.state.run.pilot = { points: { gunner: 5, rigger: 5 }, nodes: [], banked: 1,
    offer: { cards: ['evolution_orbital_saw'], rerolls: 0 } };
  assert.equal(choosePilotCard(harness.state, 0), true);
  assert.deepEqual(harness.state.run.pilot.points, { gunner: 5, rigger: 5 }, 'evolutions add no points');
  assert.deepEqual(harness.state.run.pilot.nodes, ['evolution_orbital_saw']);
  // A card the pilot cannot take is refused even if a stale offer still shows it.
  harness.state.run.pilot = { points: {}, nodes: [], banked: 1,
    offer: { cards: ['ghost_phantom'], rerolls: 0 } };
  assert.equal(choosePilotCard(harness.state, 0), false);
  assert.equal(harness.state.run.pilot.nodes.length, 0, 'nothing applied');
}));

test('reroll costs Scrap from the run purse, redraws, and refuses when broke', () => withAllCardsLive(() => {
  const harness = boot(13);
  beginSwarm(harness, 13);
  harness.bus.emit('run:awardRequested', { credits: 1000, xp: RUN_XP_LEVEL_BASE, reason: 'test' });
  assert.equal(harness.state.run.pilot.banked, 1);
  // The level-up already dealt a hand (OVH-01a2); a direct owner draw replaces it.
  drawPilotOffer(harness.state);
  const firstOffer = harness.state.run.pilot.offer.cards;
  assert.equal(harness.state.run.pilot.offer.rerolls, 0);

  assert.equal(rerollPilotOffer(harness.state), true);
  assert.equal(harness.state.run.credits, 1000 - PILOT_REROLL_SCRAP);
  assert.equal(harness.state.run.pilot.offer.rerolls, 1);
  assert.equal(harness.state.run.pilot.offer.cards.length, 3);
  assert.equal(PILOT_REROLL_SCRAP, 150, 'the named starting price');
  assert.equal(named(harness.emitted, 'run:pilotOfferRerolled').length, 1);

  assert.equal(rerollPilotOffer(harness.state), true);
  assert.equal(harness.state.run.credits, 1000 - 2 * PILOT_REROLL_SCRAP);
  assert.equal(harness.state.run.pilot.offer.rerolls, 2);

  // Out of Scrap: refused without spending or touching the offer.
  harness.bus.emit('run:spendRequested', { credits: harness.state.run.credits, reason: 'drain' });
  const before = JSON.stringify(harness.state.run.pilot.offer);
  assert.equal(rerollPilotOffer(harness.state), false);
  assert.equal(harness.state.run.credits, 0);
  assert.equal(JSON.stringify(harness.state.run.pilot.offer), before);
  assert.equal(named(harness.emitted, 'run:pilotOfferRerolled').length, 2);
  assert.equal(named(harness.emitted, 'run:spendRejected').length, 1);
  // A first offer must exist before any reroll can be paid for.
  harness.state.run.pilot.offer = null;
  assert.equal(rerollPilotOffer(harness.state), false);

  // The redraw is real: over rerolls the offers cannot all be identical to the first.
  const seen = new Set([JSON.stringify(firstOffer)]);
  harness.bus.emit('run:awardRequested', { credits: 1000, reason: 'purse' });
  drawPilotOffer(harness.state);
  for (let i = 0; i < 4; i++) {
    assert.equal(rerollPilotOffer(harness.state), true);
    seen.add(JSON.stringify(harness.state.run.pilot.offer.cards));
  }
  assert.ok(seen.size > 1, 'rerolls redraw the table');
}));

test('reroll refuses without charging when nothing at all is eligible', () => withAllCardsLive(() => {
  const harness = boot(14);
  beginSwarm(harness, 14);
  harness.bus.emit('run:awardRequested', { credits: 500, reason: 'purse' });
  harness.state.run.pilot = { points: {}, nodes: swarmNodeIds(), banked: 1, offer: { cards: [], rerolls: 0 } };
  assert.equal(rerollPilotOffer(harness.state), false);
  assert.equal(harness.state.run.credits, 500, 'the redraw cannot produce a card, so it charges nothing');
}));

test('level-ups bank one pick each, and only runs that can level carry a pilot', (t) => {
  const harness = boot(15);
  beginSwarm(harness, 15);
  assert.deepEqual(harness.state.run.pilot, createPilotProgress(), 'a begun Swarm run carries a fresh pilot record');
  assert.equal(validateRunState(harness.state.run).ok, true);

  harness.bus.emit('run:awardRequested', { xp: RUN_XP_LEVEL_BASE, reason: 'kill' });
  assert.equal(harness.state.run.level, 2);
  assert.equal(harness.state.run.pilot.banked, 1);
  const levelUps = named(harness.emitted, 'run:levelUp');
  assert.equal(levelUps.length, 1);
  assert.equal(levelUps[0].payload.banked, 1);

  // No new level, no new bank.
  harness.bus.emit('run:awardRequested', { xp: RUN_XP_LEVEL_BASE, reason: 'kill' });
  assert.equal(harness.state.run.level, 2);
  assert.equal(harness.state.run.pilot.banked, 1);
  assert.equal(named(harness.emitted, 'run:levelUp').length, 1);

  // A big award crossing two levels banks both picks at once (level 4 costs 138 total).
  harness.bus.emit('run:awardRequested', { xp: RUN_XP_LEVEL_BASE * 2 + RUN_XP_LEVEL_STEP * 3, reason: 'boss' });
  assert.equal(harness.state.run.level, 4);
  assert.equal(harness.state.run.pilot.banked, 3);
  assert.equal(named(harness.emitted, 'run:levelUp').length, 2);
  t.diagnostic(`curve: level 2 at ${runXpForLevel(2)} xp, level 4 at ${runXpForLevel(4)} xp`);

  // Adventure never levels here: no pilot record, awards refused, envelope still valid.
  const adventure = boot(16);
  adventure.bus.emit('run:beginRequested', { kind: 'adventure', seed: 3 });
  assert.equal('pilot' in adventure.state.run, false);
  adventure.bus.emit('run:awardRequested', { credits: 10, xp: 10, reason: 'nope' });
  assert.equal(adventure.state.run.xp, 0);
  assert.equal(validateRunState(adventure.state.run).ok, true);
  assert.equal(drawPilotOffer(adventure.state), null, 'the draw refuses a run that cannot level');
  // Exit-to-menu tears the run down to the fresh adventure envelope — pilot and all.
  adventure.bus.emit('game:exitToMenu', {});
  assert.equal('pilot' in adventure.state.run, false);
  assert.equal(validateRunState(adventure.state.run).ok, true);
});

test('run state: the pilot record validates, and rejects malformed offers', () => {
  const run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: 1 });
  run.phase = 'active';
  run.pilot = createPilotProgress();
  assert.equal(validateRunState(run).ok, true, 'absent pilot stays optional');
  delete run.pilot;
  assert.equal(validateRunState(run).ok, true);
  run.pilot = { points: { gunner: 2, rigger: 0 }, nodes: ['gunner_shred'], banked: 1,
    offer: { cards: ['gunner_drum', 'ghost_decoy'], rerolls: 3 } };
  assert.equal(validateRunState(run).ok, true);
  for (const bad of [
    { points: 3, nodes: [], banked: 0, offer: null },
    { points: {}, nodes: 'gunner_shred', banked: 0, offer: null },
    { points: { gunner: 1.5 }, nodes: [], banked: 0, offer: null },
    { points: {}, nodes: [7], banked: 0, offer: null },
    { points: {}, nodes: [], banked: -1, offer: null },
    { points: {}, nodes: [], banked: 0, offer: { cards: ['a', 'b', 'c', 'd'], rerolls: 0 } },
    { points: {}, nodes: [], banked: 0, offer: { cards: ['a'], rerolls: -1 } },
    { points: {}, nodes: [], banked: 0, offer: 'x' },
    { points: {}, nodes: [], banked: 0, offer: null, bogus: true },
  ]) {
    run.pilot = bad;
    assert.equal(validateRunState(run).ok, false, JSON.stringify(bad));
  }
});

test('query API: pilotHas / pilotPoints are the only way systems read the tree', () => {
  const harness = boot(17);
  beginSwarm(harness, 17);
  const run = harness.state.run;
  run.pilot = { points: { gunner: 3 }, nodes: ['gunner_steady_hands', 'evolution_orbital_saw'], banked: 0, offer: null };
  assert.equal(pilotPoints(harness.state, 'gunner'), 3);
  assert.equal(pilotPoints(harness.state, 'rigger'), 0);
  assert.equal(pilotPoints(harness.state, 'nope'), 0);
  assert.equal(pilotHas(harness.state, 'gunner_steady_hands'), true);
  assert.equal(pilotHas(harness.state, 'evolution_orbital_saw'), true);
  assert.equal(pilotHas(harness.state, 'gunner_drum'), false);
  // Absent or malformed pilot records read as zero/false, never throw.
  // A live Swarm run without its own record never reads the Adventure record.
  const bare = { run: { kind: 'survival', phase: 'active' }, player: { pilot: { points: { gunner: 9 }, nodes: ['gunner_steady_hands'] } } };
  assert.equal(pilotPoints(bare, 'gunner'), 0);
  assert.equal(pilotHas(bare, 'gunner_steady_hands'), false);
  assert.equal(pilotPoints(null, 'gunner'), 0);
  assert.equal(pilotHas(null, 'gunner_steady_hands'), false);
  // The third-card weighting rides branch investment and, for evolutions, both prerequisites.
  assert.equal(pilotCardWeight(getPilotCard('gunner_drum'), run.pilot), 4);
  assert.equal(pilotCardWeight(getPilotCard('ghost_cloak'), run.pilot), 1);
  assert.equal(pilotCardWeight(getPilotCard('evolution_wrecking_ball'), run.pilot), 1, 'uninvested prerequisites weigh nothing extra');
  assert.equal(pilotDoorForRun(run), 'swarm');
  assert.equal(pilotDoorForRun(createRunState()), 'adventure');
});

test('card sentences are player language: no internal ids or document references', () => {
  for (const node of PILOT_NODES) {
    assert.doesNotMatch(node.text, /twin_bridle|§|\b03\s*§|\bhead,?\s*\d/i,
      `${node.id} leaks an internal name or doc reference: ${node.text}`);
  }
  assert.equal(getPilotCard('rigger_second_line'), null, 'Second Line replaced the rope instead of adding one: cut');
  for (const node of [...PILOT_NODES, ...PILOT_EVOLUTIONS]) {
    assert.doesNotMatch(node.text, /ANCHOR|\brope\b|\bRig\b|\d+\s*%/, `${node.id}: plain words, no bare percentage: ${node.text}`);
  }
});

test('the swarm door never offers the work branches; Adventure offers all nine', () => withAllCardsLive(() => {
  const swarmPilot = { points: {}, nodes: [], banked: 0, offer: null };
  for (const card of eligiblePilotCards(swarmPilot, 'swarm')) {
    assert.ok(!['trader', 'prospector', 'builder'].includes(card.branch), `Swarm never offers ${card.id}`);
  }
  const maxed = { points: { gunner: 9, bruiser: 9, rigger: 9, conjurer: 9, juggernaut: 9, ghost: 9 }, nodes: ['ghost_cloak'], banked: 0, offer: null };
  const adventureEligible = eligiblePilotCards(maxed, 'adventure').map((card) => card.id);
  for (const id of ['trader_long_memory', 'ghost_vanish', 'gunner_gold_thread', 'builder_foundations']) {
    assert.ok(adventureEligible.includes(id), `adventure offers ${id}`);
  }
}));

// ---------------------------------------------------------------------------
// The XP curve against the LIVE payouts (OVH-01a #2). RUN_XP_SOURCES above is the design's
// starting table, but the shipped Swarm award sites pay more: survivalRewards awards
// killXpFor(victim.data.level), which is 3 XP on every Swarm body because swarmLevel() is 1 at
// every wave, and swarmMode's swarmRewards pays 40 + 14 × wave for the clear. The curve must
// hold 04_SWARM §3's checkpoints against THAT income, not the unwired table.
// ---------------------------------------------------------------------------

const LIVE_ROUND_SECONDS = 40; // 04 §1: thirty rounds inside 20–25 min
const LIVE_FIRST_KILL_S = 2;
const LIVE_LAST_KILL_S = 32; // the last body of a round lands by 32 s

/** What one round pays on the live Swarm route: its quota in kills, then the clear purse. */
function liveRoundIncome(wave) {
  const kills = swarmCourseQuota(wave);
  return { kills, killXp: kills * killXpFor(swarmLevel(wave)), clearXp: swarmRewards(wave).xp };
}

/** The moments the round's quota bodies die: evenly paced between 2 s and 32 s. */
function liveKillTimes(wave) {
  const { kills } = liveRoundIncome(wave);
  const out = [];
  for (let k = 0; k < kills; k += 1) {
    out.push(LIVE_FIRST_KILL_S + (kills <= 1 ? 0
      : (LIVE_LAST_KILL_S - LIVE_FIRST_KILL_S) * k / (kills - 1)));
  }
  return out;
}

/** Cumulative-XP events [seconds, total] for a run of `rounds`, from the live award amounts. */
function liveXpEvents(rounds) {
  const events = [];
  let total = 0;
  for (let round = 1; round <= rounds; round += 1) {
    const t0 = (round - 1) * LIVE_ROUND_SECONDS;
    const income = liveRoundIncome(round);
    for (const t of liveKillTimes(round)) events.push([t0 + t, (total += killXpFor(swarmLevel(round)))]);
    events.push([t0 + LIVE_ROUND_SECONDS, (total += income.clearXp)]);
  }
  return events;
}

function liveXpAt(events, time) {
  let xp = 0;
  for (const [t, total] of events) {
    if (t <= time) xp = total;
    else break;
  }
  return xp;
}

test('XP curve holds the 04 §3 checkpoints against the LIVE award sites', (t) => {
  assert.deepEqual(RUN_XP_SOURCES, {
    GUN_KILL: 1, ROOM_KILL: 2.5, CHAIN_LINK_STEP: 0.5, ROUND_CLEAR_PER_ROUND: 10, BOSS: 100,
  }, 'the design starting table is unchanged (its award sites are another packet)');
  assert.equal(RUN_XP_LEVEL_BASE, 24);
  assert.equal(RUN_XP_LEVEL_STEP, 22);

  // The live income itself, pinned so a later award-site change cannot silently break the curve.
  assert.equal(swarmLevel(1), 1);
  assert.equal(killXpFor(1), 3, 'a Swarm body pays killXpFor(1)');
  const round1 = liveRoundIncome(1);
  assert.equal(round1.kills, 10, 'round 1 fields its cast of ten');
  assert.equal(round1.killXp, 30, 'ten bodies × 3 XP');
  assert.equal(round1.clearXp, 54, 'swarmRewards(1) = 40 + 14');
  assert.equal(liveRoundIncome(2).kills, swarmCourseQuota(2));
  assert.equal(liveRoundIncome(10).clearXp, 40 + 14 * 10);

  const events = liveXpEvents(30);
  const atRoundEnd = (round) => liveXpAt(events, round * LIVE_ROUND_SECONDS);
  const levelAt = (round) => runLevelForXp(atRoundEnd(round));
  const crossing = events.find(([, xp]) => xp >= runXpForLevel(2))[0];

  // The arithmetic, printed for the receipt.
  t.diagnostic(`level 2 crossing: ${crossing.toFixed(2)} s into round 1 (target ≈25 s)`);
  for (const round of [1, 3, 10, 20, 30]) {
    t.diagnostic(`round ${round}: cumulative ${atRoundEnd(round).toFixed(0)} xp -> level ${levelAt(round)}`
      + ' (targets: ~6 by 3, ~14 by 10, ~26 by 20, ~32 by 30)');
  }
  t.diagnostic(`end of round 10 income: ${atRoundEnd(10)} xp; level 14 costs ${runXpForLevel(14)}`
    + ` (base ${RUN_XP_LEVEL_BASE}, step ${RUN_XP_LEVEL_STEP})`);

  // 04 §3's checkpoints, against the live payouts.
  assert.ok(crossing >= 20 && crossing <= 30, `level 2 ≈ 25 s into round 1 (got ${crossing.toFixed(2)} s)`);
  assert.equal(Number(crossing.toFixed(2)), 25.33, 'pinned: the eighth body (8 × 3 XP = the level-2 price)');
  assert.ok(Math.abs(levelAt(3) - 6) <= 1, `~6 by round 3 (got ${levelAt(3)})`);
  assert.equal(levelAt(3), 6, 'pinned: level 6 at the end of round 3');
  assert.ok(Math.abs(levelAt(10) - 14) <= 1, `~14 by round 10 (got ${levelAt(10)})`);
  assert.equal(levelAt(10), 14, 'pinned: level 14 at the end of round 10');
  assert.equal(atRoundEnd(10), 2052, 'pinned live income through round 10');

  // Sanity for the curve function itself under the retuned constants.
  assert.equal(runLevelForXp(runXpForLevel(9)), 9);
  assert.equal(runLevelForXp(runXpForLevel(9) - 1), 8);
});
