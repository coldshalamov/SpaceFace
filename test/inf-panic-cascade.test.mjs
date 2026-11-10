// inf-panic-cascade — the pack's worst moment breaks it like one animal. The BLOOM
// pathology spine authored three cascades; grief shipped (inf-brood-grief), and panic
// scatter/knot stayed authored-but-unwired. This completes the panic law on the authored
// numbers exactly:
//   trigger — one CREDITED kill of a body at/above BROOD_PANIC_KILL_MASS (90) arms every
//   living neighbor inside BROOD_CASCADE_RADIUS;
//   scatter — each neighbor bolts outward from the corpse for its own seeded slice of the
//   authored band (BROOD_PANIC_SCATTER_MIN_S..MAX_S, fixed-seed per body), at
//   BROOD_PANIC_SCATTER_ACCEL, overriding the ordinary flock jitter;
//   knot — then it converges back onto the corpse at BROOD_PANIC_REFORM_ACCEL until inside
//   BROOD_PANIC_KNOT_RADIUS, for BROOD_PANIC_REFORM_S after its own scatter ends;
//   law — a mass kill nobody credits arms nothing; a light kill mourns (grief) but never
//   panics; a windup holds its telegraphed attack while the pack breaks around it; the
//   same seed replays the same break.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createBus } from '../src/core/eventBus.js';
import { createBroodEngine } from '../src/systems/swarmBrood.js';
import { BROOD_PHASE_FLOCK, BROOD_PHASE_WINDUP } from '../src/systems/swarmBrood.js';
import {
  BROOD_CASCADE_GRIEF,
  BROOD_CASCADE_NONE,
  BROOD_CASCADE_PANIC,
  BROOD_CASCADE_RADIUS,
  BROOD_GRIEF_S,
  BROOD_PANIC_REFORM_S,
  BROOD_PANIC_SCATTER_MAX_S,
  BROOD_PANIC_SCATTER_MIN_S,
} from '../src/data/swarmBrood.js';

const DT = 1 / 60;
const SEED = 4242;
const CORPSE = { x: 2000, z: 2000 };

// Wave 15 fields the wake_eel (mass 120 — above the authored mass kill threshold) beside
// its mite fodder (mass 8 — below it), so one fixture serves both trigger laws.
function fixture(wave = 15) {
  const state = createGameState(SEED), bus = createBus();
  state.mode = 'flight';
  state.simTime = 30;
  state.run = Object.assign(createRunState({ kind: 'survival', ruleset: 'swarm', seed: SEED }),
    { wave, phase: 'active' });
  const player = { id: state.nextEntityId++, type: 'ship', alive: true,
    hull: 40, hullMax: 200, radius: 8, mass: 400, pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, data: {} };
  state.playerId = player.id;
  state.entities.set(player.id, player); state.entityList.push(player);
  state.entityIndex = { __spacefaceEntityIndexV1: true, ready: true, shipLike: [player], asteroids: [] };
  const engine = createBroodEngine({ getState: () => state, bus, fieldList: () => [] });
  engine.prepareWave(state.run, state.run.wave);
  engine.spawnWave(state);
  return { state, bus, player, engine, bodies: engine._bodies };
}

/** The body's family id — liveFamilyId is indexed by family slot, the body's by family[i]. */
function famIdOf(bodies, i) {
  return bodies.liveFamilyId[bodies.family[i]];
}

/** Stage one mass victim plus neighbors at the corpse: victim first, then neighbor slots. */
function stageMassKill(h, neighbors) {
  const { bodies } = h;
  const v = bodies.alive.findIndex((alive, i) => alive === 1 && famIdOf(bodies, i) === 'wake_eel');
  assert.ok(v >= 0, 'wave 15 fields a wake_eel to be the mass kill');
  bodies.px[v] = CORPSE.x; bodies.pz[v] = CORPSE.z;
  bodies.vx[v] = 0; bodies.vz[v] = 0;
  const slots = [];
  for (const spec of neighbors) {
    const i = bodies.alive.findIndex((alive, k) => alive === 1
      && k !== v && !slots.includes(k) && famIdOf(bodies, k) === 'mite');
    assert.ok(i >= 0, 'a mite neighbor exists to stage');
    bodies.px[i] = spec.x; bodies.pz[i] = spec.z;
    bodies.vx[i] = 0; bodies.vz[i] = 0;
    bodies.phase[i] = spec.windup ? BROOD_PHASE_WINDUP : BROOD_PHASE_FLOCK;
    if (spec.windup) bodies.timer[i] = 5; // a long telegraph: it must hold through the break
    slots.push(i);
  }
  return { v, slots };
}

function steps(h, seconds) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) { h.state.simTime += DT; h.engine.step(h.state); }
}

const distOf = (h, i) => Math.hypot(h.bodies.px[i] - CORPSE.x, h.bodies.pz[i] - CORPSE.z);

test('a credited mass kill scatters the pack outward from the corpse', () => {
  const h = fixture();
  const { v, slots } = stageMassKill(h, [
    { x: CORPSE.x, z: CORPSE.z + 40 },
    { x: CORPSE.x + 40, z: CORPSE.z },
    { x: CORPSE.x - 40, z: CORPSE.z },
  ]);
  h.engine.onExplosion({ pos: CORPSE, radius: 4, ownerId: h.player.id });
  assert.equal(h.bodies.alive[v], 0, 'the mass body dies by the room\'s own explosion law');
  const census = h.engine.census();
  assert.ok(census.panicking >= 3, `the neighbors join the pathology (got ${census.panicking})`);
  assert.equal(h.engine.view.cascade, BROOD_CASCADE_PANIC,
    'the panic kind publishes on the view while the window is live');

  // Grief would pull these mourners IN; panic must carry them OUT — the scatter is the
  // cascade's own reading, not the mourning with a sign flipped.
  const start = slots.map((i) => distOf(h, i));
  steps(h, 0.5);
  slots.forEach((i, k) => {
    const now = distOf(h, i);
    assert.ok(now > start[k] + 10,
      `the neighbor bolts outward (staged ${start[k].toFixed(1)} -> ${now.toFixed(1)})`);
  });
  h.engine.clear();
});

test('then the knot: the scattered pack converges back onto the corpse', () => {
  const h = fixture();
  const { slots } = stageMassKill(h, [
    { x: CORPSE.x, z: CORPSE.z + 40 },
    { x: CORPSE.x + 40, z: CORPSE.z },
  ]);
  h.engine.onExplosion({ pos: CORPSE, radius: 4, ownerId: h.player.id });
  // Past the widest scatter band the reform window is running: distance must be closing.
  steps(h, BROOD_PANIC_SCATTER_MAX_S);
  const atKnot = slots.map((i) => distOf(h, i));
  steps(h, BROOD_PANIC_REFORM_S);
  slots.forEach((i, k) => {
    const now = distOf(h, i);
    assert.ok(now < atKnot[k] - 15,
      `the knot closes on the corpse (${atKnot[k].toFixed(1)} -> ${now.toFixed(1)})`);
  });
  h.engine.clear();
});

test('the mass kill must be credited: a blast nobody owns breaks nothing', () => {
  const h = fixture();
  const { slots } = stageMassKill(h, [
    { x: CORPSE.x, z: CORPSE.z + 40 },
  ]);
  h.engine.onExplosion({ pos: CORPSE, radius: 4, ownerId: 999999 });
  assert.equal(h.engine.census().panicking, 0, 'a kill nobody credits is a kill the pack ignores');
  assert.equal(h.engine.view.cascade, BROOD_CASCADE_NONE);
  steps(h, 0.5);
  assert.ok(distOf(h, slots[0]) < 41, 'the neighbor never bolts');
  h.engine.clear();
});

test('a light kill mourns but never panics: the threshold is the authored mass', () => {
  const h = fixture(15);
  // A mite (mass 8) dies at the same spot its neighbors hold: grief answers, panic does not.
  const v = h.bodies.alive.findIndex((alive, i) => alive === 1 && famIdOf(h.bodies, i) === 'mite');
  assert.ok(v >= 0);
  h.bodies.px[v] = CORPSE.x; h.bodies.pz[v] = CORPSE.z;
  h.bodies.vx[v] = 0; h.bodies.vz[v] = 0;
  const b = h.bodies.alive.findIndex((alive, i) => alive === 1 && i !== v
    && famIdOf(h.bodies, i) === 'mite');
  h.bodies.px[b] = CORPSE.x; h.bodies.pz[b] = CORPSE.z + 40;
  h.bodies.vx[b] = 0; h.bodies.vz[b] = 0;
  h.bodies.phase[b] = BROOD_PHASE_FLOCK;
  h.engine.onExplosion({ pos: CORPSE, radius: 4, ownerId: h.player.id });
  const census = h.engine.census();
  assert.ok(census.mourners >= 1, 'the light kill still mourns');
  assert.equal(census.panicking, 0, 'a fodder kill does not break the pack');
  assert.equal(h.engine.view.cascade, BROOD_CASCADE_GRIEF, 'the kind reads grief, not panic');
  h.engine.clear();
});

test('a winding body holds its telegraph while the pack breaks around it', () => {
  const h = fixture();
  const { slots } = stageMassKill(h, [
    { x: CORPSE.x, z: CORPSE.z + 40, windup: true },
    { x: CORPSE.x + 40, z: CORPSE.z },
  ]);
  const [windup, scatter] = slots;
  h.engine.onExplosion({ pos: CORPSE, radius: 4, ownerId: h.player.id });
  const held = Math.hypot(h.bodies.px[windup] - CORPSE.x, h.bodies.pz[windup] - CORPSE.z);
  steps(h, 0.5);
  const heldNow = Math.hypot(h.bodies.px[windup] - CORPSE.x, h.bodies.pz[windup] - CORPSE.z);
  assert.ok(Math.abs(heldNow - held) < 2,
    `the telegraphed attack holds (moved ${(heldNow - held).toFixed(2)} wu)`);
  assert.ok(distOf(h, scatter) > 50, 'the flocking neighbor still scatters past it');
  h.engine.clear();
});

test('the same seed replays the same break', () => {
  const run = () => {
    const h = fixture();
    const { slots } = stageMassKill(h, [
      { x: CORPSE.x, z: CORPSE.z + 40 },
      { x: CORPSE.x + 40, z: CORPSE.z },
    ]);
    h.engine.onExplosion({ pos: CORPSE, radius: 4, ownerId: h.player.id });
    steps(h, BROOD_PANIC_SCATTER_MAX_S + BROOD_PANIC_REFORM_S);
    const out = slots.map((i) => [h.bodies.px[i], h.bodies.pz[i]]);
    h.engine.clear();
    return out;
  };
  const a = run();
  const b = run();
  assert.deepEqual(b, a, 'fixed-seed per body: the pack breaks identically');
});

test('the cascade kinds hand over in the authored order: panic, then grief, then quiet', () => {
  const h = fixture();
  const { v, slots } = stageMassKill(h, [{ x: CORPSE.x, z: CORPSE.z + 40 }]);
  // The rest of the wave keeps fighting the player behind us: cyst fuses self-burst as
  // credited kills and re-arm mourning around their own corpses, which is the room's
  // ordinary business. Silence it so this read is the staged cascade and nothing else.
  const keep = new Set([v, ...slots]);
  for (let j = 0; j < h.bodies.alive.length; j++) {
    if (h.bodies.alive[j] === 1 && !keep.has(j)) h.bodies.alive[j] = 0;
  }
  h.engine.onExplosion({ pos: CORPSE, radius: 4, ownerId: h.player.id });
  assert.equal(h.engine.view.cascade, BROOD_CASCADE_PANIC);
  steps(h, BROOD_PANIC_SCATTER_MAX_S + BROOD_PANIC_REFORM_S + 0.2);
  assert.equal(h.engine.view.cascade, BROOD_CASCADE_GRIEF,
    'the mourning outlives the panic window');
  steps(h, BROOD_GRIEF_S);
  assert.equal(h.engine.view.cascade, BROOD_CASCADE_NONE, 'then the room is quiet');
  h.engine.clear();
});

test('the knot reads: the pack re-tightens as one animal, not a starburst of strays', () => {
  const h = fixture();
  // Neighbors staged CLOSE (the common case — the pack was on the corpse already).
  const { slots } = stageMassKill(h, [
    { x: CORPSE.x, z: CORPSE.z + 30 },
    { x: CORPSE.x + 30, z: CORPSE.z },
  ]);
  const [a, b] = slots;
  const spread = () => Math.hypot(h.bodies.px[a] - h.bodies.px[b], h.bodies.pz[a] - h.bodies.pz[b]);
  h.engine.onExplosion({ pos: CORPSE, radius: 4, ownerId: h.player.id });
  steps(h, BROOD_PANIC_SCATTER_MAX_S);
  const atKnot = spread();
  steps(h, BROOD_PANIC_REFORM_S);
  assert.ok(spread() < atKnot - 10,
    `the knot pulls the scattered pair back together (${atKnot.toFixed(1)} -> ${spread().toFixed(1)})`);
  // The authored knot radius is the convergence target: the pair keeps closing toward it
  // while the window runs, from both sides of the corpse.
  assert.ok(distOf(h, a) < BROOD_CASCADE_RADIUS && distOf(h, b) < BROOD_CASCADE_RADIUS);
  h.engine.clear();
});
