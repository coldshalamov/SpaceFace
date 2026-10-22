// weight-pitborn-519 — W-PITBORN (build_map §34.5 row 519, bible 02 §13).
//
// Proves the row's done-when on the real data and the runtime owner:
//   data/factions/pitborn.js   five ballast sizes, the E-41 match table, the E-40 crowd
//                              meter, the 43-piece Yardmaster, Magnet Head, Ma Sprocket
//   systems/faction_pitborn.js style fills the crowd meter and decays; tiers bark; the
//                              purse scales; the Yardmaster strips 43 authored pieces;
//                              balls accrete junk; the horn names a ball
//
// Run: node --test test/weight-pitborn-519.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import {
  pitbornCull,
  spawnBallastBall,
  spawnYardmaster,
  ensurePitbornState,
  crowdTierFor,
  cullPurseFor,
} from '../src/systems/faction_pitborn.js';
import faction, {
  PITBORN_BALLAST_BALLS,
  PITBORN_BALLAST_MATCH,
  PITBORN_CULL,
  PITBORN_YARDMASTER,
  PITBORN_MAGNET_HEAD,
} from '../src/data/factions/pitborn.js';
import { WRECK_AFTERMATH_MODELS } from '../src/data/wreckAftermathDressing.js';

const SEED = 4242;

function boot() {
  const bus = createBus();
  const sim = createSimulation({ seed: SEED, bus, systems: [pitbornCull] });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_ashfall_reach';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 60000, z: 60000 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  return { sim, state, bus, player };
}

test('data: five ballast sizes, the 43-piece pool, crowd meter and the roster', () => {
  assert.equal(PITBORN_BALLAST_BALLS.length, 5, 'ballast balls come in five sizes');
  for (let i = 1; i < PITBORN_BALLAST_BALLS.length; i++) {
    assert.ok(PITBORN_BALLAST_BALLS[i].mass > PITBORN_BALLAST_BALLS[i - 1].mass, 'sizes scale up');
  }
  assert.equal(PITBORN_YARDMASTER.pieceCount, 43, 'the colossus is 43 authored pieces');
  assert.ok(WRECK_AFTERMATH_MODELS.length >= PITBORN_YARDMASTER.pieceCount,
    'the aftermath catalog feeds the accretion');
  assert.ok(PITBORN_CULL.tiers.length >= 4 && PITBORN_CULL.decayPerS > 0);
  assert.equal(PITBORN_BALLAST_MATCH.rival, 'Clatter');
  assert.equal(PITBORN_MAGNET_HEAD.soldAtCull, true, 'the Cull sells the Magnet Head');
  assert.equal(faction.custom.crowdRatesYourStyle, true);
  assert.ok(faction.shipRoles.some((r) => r.role === 'yardmaster-capital'));
});

test('the Cull crowd meter (E-40): style fills it, it decays, the purse scales', () => {
  const { sim, state, bus, player } = boot();
  try {
    const pit = ensurePitbornState(state);
    const sys = sim.registry.get('pitbornCull');
    const tierEvents = [];
    bus.on('pitborn:crowdTier', (p) => tierEvents.push(p));

    // A plain kill scores the kill row; an impact kill reads louder.
    bus.emit('entity:killed', { id: 9991, killerId: player.id });
    assert.equal(pit.crowd.score, PITBORN_CULL.stylePoints.kill);
    bus.emit('entity:killed', { id: 9992, killerId: player.id, styleCause: 'impact' });
    assert.equal(pit.crowd.score, PITBORN_CULL.stylePoints.kill + PITBORN_CULL.stylePoints.impact);

    // Enough style crosses a tier and Ma Sprocket calls it.
    sys.awardCrowdStyle(state, 'multikill', PITBORN_CULL.stylePoints.multikill);
    assert.ok(pit.crowd.score >= PITBORN_CULL.tiers[1].at);
    assert.equal(tierEvents.length, 1, 'one tier-up bark');
    assert.equal(pit.crowd.tier, crowdTierFor(pit.crowd.score).id);

    // The crowd cools at the authored rate.
    const before = pit.crowd.score;
    sim.runTicks(120);
    assert.ok(Math.abs(pit.crowd.score - Math.max(0, before - PITBORN_CULL.decayPerS * 2)) < 1e-6,
      'the meter decays between moments of style');

    // Kills by someone else are not your show.
    const after = pit.crowd.score;
    bus.emit('entity:killed', { id: 9993, killerId: 'npc_1' });
    assert.equal(pit.crowd.score, after, 'foreign kills move nothing');

    // The purse scales with the settled score and lands on the leaderboard.
    pit.crowd.score = 80;
    const purse = sys.settleCull(state, { killed: 12 });
    assert.equal(purse, cullPurseFor(80));
    assert.ok(purse > PITBORN_CULL.purseBase, 'style paid');
    assert.equal(pit.leaderboard.length, 1);
    assert.equal(pit.leaderboard[0].kills, 12);
    assert.equal(pit.crowd.score, 0, 'the meter resets for the next run');
  } finally {
    sim.dispose();
  }
});

test('the Yardmaster strips its 43 authored pieces one hit at a time — you keep them', () => {
  const { sim, state } = boot();
  try {
    const yard = spawnYardmaster(state, sim.helpers, { x: 0, z: 0, seed: 7 });
    const pieces = yard.data.pieces;
    assert.equal(pieces.length, PITBORN_YARDMASTER.pieceCount, '43 accreted pieces');
    assert.ok(pieces.every((p) => p.attached && p.hull === PITBORN_YARDMASTER.pieceHull));
    assert.ok(pieces.every((p) => WRECK_AFTERMATH_MODELS.some((m) => m.id === p.modelId)),
      'every piece is a real aftermath model');
    // A second seeded colossus is a different shuffle.
    const yard2 = spawnYardmaster(state, sim.helpers, { x: 9000, z: 0, seed: 8 });
    assert.notDeepEqual(
      yard.data.pieces.map((p) => p.modelId), yard2.data.pieces.map((p) => p.modelId),
      'accretion is procedural, not a fixed list');

    sim.step(); // bind the hull record
    const attachedBefore = pieces.filter((p) => p.attached).length;
    yard.hull -= PITBORN_YARDMASTER.pieceHull; // one piece worth of damage
    sim.step();
    const attachedAfter = pieces.filter((p) => p.attached).length;
    assert.equal(attachedBefore - attachedAfter, 1, 'one piece stripped per piece-hull of damage');
    const drops = state.entityList.filter((e) => e.data?.yardmasterPiece === true);
    assert.equal(drops.length, 1, 'the stripped piece dropped as a keepable body');
    assert.equal(drops[0].data.modelId, pieces.find((p) => !p.attached).modelId);

    // Dismantle it completely: the colossus dies when the last piece falls.
    yard.hull = 0;
    sim.step();
    assert.equal(yard.alive, false, 'fully stripped, the Yardmaster is gone');
    assert.equal(state.entityList.filter((e) => e.data?.yardmasterPiece).length,
      PITBORN_YARDMASTER.pieceCount, 'all 43 pieces survive as salvage');
  } finally {
    sim.dispose();
  }
});

test('ballast balls accrete contacting junk and visibly bulk', () => {
  const { sim, state } = boot();
  try {
    const ball = spawnBallastBall(state, sim.helpers, { sizeId: 'ballast_tender', x: 0, z: 0 });
    const r0 = ball.radius, m0 = ball.mass;
    const junk = sim.spawn({
      type: 'wreck', team: 2, pos: { x: ball.radius + 8, z: 0 }, radius: 10, mass: 40,
      hull: 10, hullMax: 10, collides: true, data: {},
    });
    sim.step();
    assert.equal(junk.alive, false, 'the ball ate the junk');
    assert.ok(ball.data.accretedMass >= 40);
    assert.ok(ball.mass > m0 && ball.radius > r0, 'the ball grew');
    // A ship is not junk food.
    const ship = sim.spawn({
      type: 'ship', team: 2, pos: { x: ball.radius + 8, z: 0 }, radius: 10, mass: 40,
      hull: 10, hullMax: 10, collides: true, data: {},
    });
    sim.step();
    assert.notEqual(ship.alive, false, 'ships bounce off, not into, the ball');
  } finally {
    sim.dispose();
  }
});

test('Ballast against Clatter (E-41): the horn weighs both balls and names a winner', () => {
  const { sim, state, bus } = boot();
  try {
    const pit = ensurePitbornState(state);
    const sys = sim.registry.get('pitbornCull');
    const horns = [];
    bus.on('pitborn:ballastHorn', (p) => horns.push(p));

    const ball = spawnBallastBall(state, sim.helpers, { sizeId: 'ballast_clatter', x: 0, z: 0 });
    const match = sys.startBallastMatch(state, { playerBallId: ball.id });
    assert.ok(match.hornAt > state.simTime);
    assert.ok(match.clatterMass > 0, 'Clatter starts ahead — the yard favorite');

    // Feed the player's ball past Clatter's pace, then wait out the horn.
    for (let i = 0; i < 12; i++) {
      sim.spawn({
        type: 'debris', team: 2, pos: { x: ball.radius + 6, z: i * 4 - 20 }, radius: 8, mass: 60,
        hull: 10, hullMax: 10, collides: true, data: {},
      });
      sim.step();
    }
    assert.ok(ball.data.accretedMass > 500, `player ball at ${ball.data.accretedMass}t`);
    sim.runTicks(Math.ceil(PITBORN_BALLAST_MATCH.matchS * 60) + 2);
    assert.equal(match.over, true, 'the horn sounded');
    assert.equal(horns.length, 1);
    assert.equal(match.winner, 'player', 'a bigger ball wins the name');
    assert.equal(pit.namedBalls.length, 1, 'the yard names your ball');

    // A starved ball loses to Clatter and the name is his.
    const small = spawnBallastBall(state, sim.helpers, { sizeId: 'ballast_skiff', x: 5000, z: 0 });
    const match2 = sys.startBallastMatch(state, { playerBallId: small.id });
    sim.runTicks(Math.ceil(PITBORN_BALLAST_MATCH.matchS * 60) + 2);
    assert.equal(match2.winner, PITBORN_BALLAST_MATCH.rival);
    assert.equal(pit.namedBalls.length, 1, 'Clatter takes the name, not you');
  } finally {
    sim.dispose();
  }
});
