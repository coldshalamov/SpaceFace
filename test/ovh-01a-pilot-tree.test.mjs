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
    .filter((node) => !node.adventureOnly && node.branch !== 'industry')
    .map((node) => node.id);
}

test('data shape: 06 §2.2 transcribed exactly — 81 nodes, every branch ten but Conjurer', () => {
  // 06 §2.1 states the ten-node branch (3+3+3+capstone → 70 across seven branches), but §2.2's
  // Conjurer table carries the fifteen bends as tier-2/3 nodes on top of its authored tiers
  // (3 + 15 + 2 + capstone = 21). The bends must be nodes for the exclusive-bend locks to exist,
  // so the exact transcription is 81, not the packet headline's 70.
  const counts = {};
  for (const node of PILOT_NODES) counts[node.branch] = (counts[node.branch] || 0) + 1;
  assert.deepEqual(counts, {
    gunner: 10, bruiser: 10, rigger: 10, conjurer: 21, juggernaut: 10, ghost: 10, industry: 10,
  });
  assert.equal(PILOT_NODES.length, 81);
  assert.equal(new Set(PILOT_NODES.map((node) => node.id)).size, 81, 'ids are unique');
  const tiers = { 1: 0, 2: 0, 3: 0, '2-3': 0, capstone: 0 };
  for (const node of PILOT_NODES) {
    assert.ok(tiers, `tier ${node.tier} is one of 1 / 2 / 3 / 2-3 / capstone`);
    assert.ok(typeof node.tier in tiers || tiers[node.tier] !== undefined, `${node.id}: valid tier`);
    assert.ok(node.name && typeof node.name === 'string', `${node.id}: named`);
    assert.ok(node.text && typeof node.text === 'string', `${node.id}: one-sentence text`);
    assert.ok(PILOT_BRANCHES.some((branch) => branch.id === node.branch), `${node.id}: known branch`);
  }
  // The six combat branches follow 3+3+3+capstone; Conjurer alone bends the shape.
  for (const branch of PILOT_BRANCHES.filter((b) => b.id !== 'conjurer')) {
    const own = PILOT_NODES.filter((node) => node.branch === branch.id);
    assert.equal(own.filter((n) => n.tier === 1).length, 3, `${branch.id}: three tier-1`);
    assert.equal(own.filter((n) => n.tier === 2).length, 3, `${branch.id}: three tier-2`);
    assert.equal(own.filter((n) => n.tier === 3).length, 3, `${branch.id}: three tier-3`);
    assert.equal(own.filter((n) => n.tier === 'capstone').length, 1, `${branch.id}: one capstone`);
  }
  const conjurer = PILOT_NODES.filter((node) => node.branch === 'conjurer');
  assert.equal(conjurer.filter((n) => n.tier === 1).length, 3);
  assert.equal(conjurer.filter((n) => n.tier === '2-3').length, 15, 'the fifteen bends');
  assert.equal(conjurer.filter((n) => n.tier === 3).length, 2, 'Echo and Combo');
  assert.equal(conjurer.filter((n) => n.tier === 'capstone').length, 1);
});

test('data shape: six shared combat branches plus Adventure-only Industry, mottos as written', () => {
  assert.deepEqual(PILOT_BRANCHES.map((branch) => branch.id), [
    'gunner', 'bruiser', 'rigger', 'conjurer', 'juggernaut', 'ghost', 'industry',
  ]);
  assert.equal(PILOT_BRANCHES[0].motto, 'nothing survives the stream');
  assert.equal(PILOT_BRANCHES[3].motto, 'one press and the whole field moves');
  assert.equal(PILOT_BRANCHES[6].adventureOnly, true, 'Industry exists only in Adventure');
  // Ghost's four *(Adventure)* nodes and nothing else carry the flag.
  assert.deepEqual(
    PILOT_NODES.filter((node) => node.adventureOnly).map((node) => node.id).sort(),
    ['ghost_ghost_line', 'ghost_puppeteer', 'ghost_shadow_walker', 'ghost_vanish'],
  );
});

test('tier gates: 2 / 4 / 6 points in-branch with the point in hand, bends at the tier-2 bound', () => withAllCardsLive(() => {
  assert.deepEqual(PILOT_TIER_GATES, { 1: 0, 2: 2, 3: 4, '2-3': 2, capstone: 6 });
  const door = 'adventure';
  const held = (points) => ({ points, nodes: [], banked: 0, offer: null });
  // A tier opens when held points + the point in hand reach the gate: tier 2 from 1 held,
  // tier 3 from 3 held — and the capstone from 5 held, which is 04 §3's "a capstone card
  // appears only once a branch holds 5 points" exactly.
  assert.equal(isPilotCardEligible(getPilotCard('gunner_shred'), held({ gunner: 0 }), door), false);
  assert.equal(isPilotCardEligible(getPilotCard('gunner_shred'), held({ gunner: 1 }), door), true);
  assert.equal(isPilotCardEligible(getPilotCard('gunner_ricochet'), held({ gunner: 2 }), door), false);
  assert.equal(isPilotCardEligible(getPilotCard('gunner_ricochet'), held({ gunner: 3 }), door), true);
  assert.equal(isPilotCardEligible(getPilotCard('gunner_gold_thread'), held({ gunner: 4 }), door), false);
  assert.equal(isPilotCardEligible(getPilotCard('gunner_gold_thread'), held({ gunner: 5 }), door), true);
  assert.equal(isPilotCardEligible(getPilotCard('conjurer_pull_vortex'), held({ conjurer: 0 }), door), false);
  assert.equal(isPilotCardEligible(getPilotCard('conjurer_pull_vortex'), held({ conjurer: 1 }), door), true);
}));

test('spot transcriptions: names and sentences straight from 06 §2.2', () => {
  const spots = [
    ['gunner_gold_thread', 'capstone', 'Gold Thread',
      'Your Hose stream pierces everything in a line; held for three seconds it becomes a beam that lights the room.'],
    ['bruiser_newtons_cradle', 'capstone', 'Newton\'s Cradle',
      'Momentum you give passes from body to body without loss, up to five times.'],
    ['rigger_untouchable_wrecking_train', 'capstone', 'Untouchable / Wrecking Train',
      'Light: shots that would hit you while you orbit an ANCHOR hit the anchor instead. Heavy: tow up to four bodies chained behind you.'],
    ['rigger_hummingbird', 2, 'Hummingbird',
      'Orbiting an ANCHOR, you move and fire 30 % faster. (best on light hulls)'],
    ['conjurer_avalanche', 'capstone', 'Avalanche',
      'The plough holds twice as many bodies, captures enemies as well as rocks, and launches them at double speed.'],
    ['juggernaut_juggernaut', 'capstone', 'Juggernaut',
      'Above cruise speed, you take no damage from anything you hit, and everything you hit takes double.'],
    ['ghost_undertaker', 'capstone', 'Undertaker',
      'Bodies you tumble do not recover their helm until they hit something.'],
    ['industry_foreman', 'capstone', 'Foreman',
      'Mark a module on the board and your yard builds it from its own stock.'],
    ['bruiser_through_and_through', 2, 'Through and Through',
      'Needle shots nail the last body they reach to whatever is behind it for two seconds.'],
  ];
  for (const [id, tier, name, text] of spots) {
    const node = getPilotCard(id);
    assert.ok(node, `${id} exists`);
    assert.equal(node.tier, tier, `${id} tier`);
    assert.equal(node.name, name, `${id} name`);
    assert.equal(node.text, text, `${id} text`);
  }
  // The Shove bend Avalanche and the Conjurer capstone Avalanche are distinct nodes.
  assert.notEqual(getPilotCard('conjurer_shove_avalanche'), getPilotCard('conjurer_avalanche'));
  assert.equal(getPilotCard('conjurer_shove_avalanche').bendPower, 'Shove');
});

test('evolutions: the five 06 names with their exact prerequisite branches', () => withAllCardsLive(() => {
  assert.deepEqual(PILOT_EVOLUTIONS.map((evo) => [evo.id, [...evo.requires]]), [
    ['evolution_orbital_saw', ['gunner', 'rigger']],
    ['evolution_molten_avalanche', ['conjurer', 'gunner']],
    ['evolution_wrecking_ball', ['bruiser', 'rigger']],
    ['evolution_black_hole', ['conjurer', 'ghost']],
    ['evolution_meteor', ['juggernaut', 'conjurer']],
  ]);
  assert.equal(PILOT_EVOLUTION_TOTAL_POINTS_FLOOR, 8, '04 §3: an evolution can appear from 8 points');
  assert.equal(PILOT_EVOLUTION_BRANCH_POINTS, 5, '06 §2.1: two branches each hold 5 points');
  const pilot = { points: { gunner: 5, rigger: 5 }, nodes: [], banked: 0, offer: null };
  assert.equal(isPilotCardEligible(getPilotCard('evolution_orbital_saw'), pilot, 'swarm'), true);
  // The 8-point floor alone is not enough — both prerequisites must hold.
  assert.equal(isPilotCardEligible(getPilotCard('evolution_orbital_saw'),
    { points: { gunner: 5, rigger: 3 }, nodes: [], banked: 0, offer: null }, 'swarm'), false);
  assert.equal(isPilotCardEligible(getPilotCard('evolution_orbital_saw'),
    { points: { gunner: 4, rigger: 4 }, nodes: [], banked: 0, offer: null }, 'swarm'), false);
}));

test('bend groups: five powers × three named bends; one taken locks its siblings', () => withAllCardsLive(() => {
  assert.deepEqual(PILOT_BEND_GROUPS.map((group) => [group.power, group.bends]), [
    ['Pull', ['conjurer_pull_vortex', 'conjurer_pull_leash', 'conjurer_pull_implode']],
    ['Shove', ['conjurer_shove_wave', 'conjurer_shove_hammer', 'conjurer_shove_avalanche']],
    ['Pin', ['conjurer_pin_nail', 'conjurer_pin_post', 'conjurer_pin_stasis']],
    ['Bomb', ['conjurer_bomb_sticky', 'conjurer_bomb_cluster', 'conjurer_bomb_sinker']],
    ['Rig', ['conjurer_rig_plough', 'conjurer_rig_sluice', 'conjurer_rig_scoop']],
  ]);
  for (const group of PILOT_BEND_GROUPS) {
    for (const id of group.bends) assert.equal(getPilotCard(id).bendPower, group.power);
  }
  const taken = { points: { conjurer: 1 }, nodes: ['conjurer_pull_vortex'], banked: 0, offer: null };
  const locked = lockedPilotNodeIds(taken);
  assert.equal(locked.has('conjurer_pull_leash'), true);
  assert.equal(locked.has('conjurer_pull_implode'), true);
  assert.equal(locked.has('conjurer_shove_wave'), false, 'other powers stay open');
  assert.equal(isPilotCardEligible(getPilotCard('conjurer_pull_leash'), taken, 'adventure'), false);
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

test('draw rule: an evolution needs 8 total points and both branches at 5', () => withAllCardsLive(() => {
  const at = (points, nodes) => ({ points, nodes, banked: 0, offer: null });
  const gunnerFive = ['gunner_steady_hands', 'gunner_quick_vent', 'gunner_hollow_point', 'gunner_spin_up', 'gunner_drum'];
  const riggerFive = ['rigger_long_reel', 'rigger_quick_latch', 'rigger_free_hand', 'rigger_hummingbird', 'rigger_crane'];
  for (let seed = 1; seed <= 40; seed++) {
    for (const [points, nodes, label] of [
      [{ gunner: 5, rigger: 4 }, [...gunnerFive, ...riggerFive.slice(0, 4)], 'prerequisite unmet'],
      [{ gunner: 4, rigger: 4 }, gunnerFourEvolutionFixture(), '8 total but no branch at 5'],
    ]) {
      const harness = boot(seed);
      beginSwarm(harness, seed);
      harness.state.run.pilot = at(points, nodes);
      for (const id of drawPilotOffer(harness.state)) {
        assert.ok(!id.startsWith('evolution_'), `seed ${seed} (${label}): no evolution card — got ${id}`);
      }
    }
  }
  let orbitalSawSeen = false;
  for (let seed = 1; seed <= 60; seed++) {
    const harness = boot(seed);
    beginSwarm(harness, seed);
    harness.state.run.pilot = at({ gunner: 5, rigger: 5 }, [...gunnerFive, ...riggerFive]);
    for (const id of drawPilotOffer(harness.state)) {
      if (id === 'evolution_orbital_saw') orbitalSawSeen = true;
    }
  }
  assert.equal(orbitalSawSeen, true, 'Orbital Saw can appear once both branches hold 5');
}));

function gunnerFourEvolutionFixture() {
  return ['gunner_steady_hands', 'gunner_quick_vent', 'gunner_hollow_point', 'gunner_spin_up',
    'rigger_long_reel', 'rigger_quick_latch', 'rigger_free_hand', 'rigger_hummingbird'];
}

test('draw rule: a taken bend never locks out other powers, and never reappears itself', () => withAllCardsLive(() => {
  const at = (points, nodes) => ({ points, nodes, banked: 0, offer: null });
  const nodes = ['conjurer_pull_vortex'];
  const otherBendSeen = new Set();
  for (let seed = 1; seed <= 60; seed++) {
    const harness = boot(seed);
    beginSwarm(harness, seed);
    harness.state.run.pilot = at({ conjurer: 1 }, nodes);
    for (const id of drawPilotOffer(harness.state)) {
      assert.notEqual(id, 'conjurer_pull_leash', `seed ${seed}: locked sibling never offered`);
      assert.notEqual(id, 'conjurer_pull_implode', `seed ${seed}: locked sibling never offered`);
      assert.notEqual(id, 'conjurer_pull_vortex', `seed ${seed}: taken node never offered`);
      if (getPilotCard(id).bendPower) otherBendSeen.add(getPilotCard(id).bendPower);
    }
  }
  assert.ok(otherBendSeen.size >= 1, 'other powers\' bends still come up');
}));

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
    nodes: swarmNodeIds().filter((id) => id !== 'ghost_decoy'),
    banked: 1,
    offer: null,
  };
  assert.deepEqual(drawPilotOffer(harness.state), ['ghost_decoy']);
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
  // A bend locked by a taken sibling is refused even if a stale offer still shows it.
  harness.state.run.pilot = { points: { conjurer: 1 }, nodes: ['conjurer_pull_vortex'], banked: 1,
    offer: { cards: ['conjurer_pull_leash'], rerolls: 0 } };
  assert.equal(choosePilotCard(harness.state, 0), false);
  assert.equal(harness.state.run.pilot.nodes.length, 1, 'nothing applied');
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
  const bare = { run: {} };
  assert.equal(pilotPoints(bare, 'gunner'), 0);
  assert.equal(pilotHas(bare, 'gunner_steady_hands'), false);
  assert.equal(pilotPoints(null, 'gunner'), 0);
  assert.equal(pilotHas(null, 'gunner_steady_hands'), false);
  // The third-card weighting rides branch investment and, for evolutions, both prerequisites.
  assert.equal(pilotCardWeight(getPilotCard('gunner_drum'), run.pilot), 4);
  assert.equal(pilotCardWeight(getPilotCard('ghost_decoy'), run.pilot), 1);
  assert.equal(pilotCardWeight(getPilotCard('evolution_wrecking_ball'), run.pilot), 1, 'uninvested prerequisites weigh nothing extra');
  assert.equal(pilotDoorForRun(run), 'swarm');
  assert.equal(pilotDoorForRun(createRunState()), 'adventure');
});

test('card sentences are player language: no internal ids or document references', () => {
  for (const node of PILOT_NODES) {
    assert.doesNotMatch(node.text, /twin_bridle|§|\b03\s*§|\bhead,?\s*\d/i,
      `${node.id} leaks an internal name or doc reference: ${node.text}`);
  }
  assert.equal(getPilotCard('rigger_second_line').text, 'Two lines at once.');
  assert.equal(getPilotCard('rigger_coupler').text, 'Your next latch ties two bodies together.');
});

test('the swarm door never offers Industry or the Adventure-only Ghost nodes; Adventure offers all', () => withAllCardsLive(() => {
  const swarmPilot = { points: {}, nodes: [], banked: 0, offer: null };
  for (const card of eligiblePilotCards(swarmPilot, 'swarm')) {
    assert.notEqual(card.branch, 'industry');
    assert.notEqual(card.adventureOnly, true);
  }
  // With every branch deep enough, the adventure door still offers the full seven sectors.
  const maxed = { points: { gunner: 9, bruiser: 9, rigger: 9, conjurer: 9, juggernaut: 9, ghost: 9, industry: 9 }, nodes: [], banked: 0, offer: null };
  const adventureEligible = eligiblePilotCards(maxed, 'adventure').map((card) => card.id);
  for (const id of ['industry_foreman', 'ghost_vanish', 'gunner_gold_thread', 'conjurer_pin_nail']) {
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
