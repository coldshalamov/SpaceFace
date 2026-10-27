// Packet 02: a telegraph's displayed footprint IS the damage query. The Brood's spitter splash,
// acid pool and charger lane draw their footprints through the same functions the engine's damage
// queries call (combat/telegraphFootprint.js) with the engine's own victim radius, and these tests
// stand a pilot exactly on each drawn rim against the REAL engine: one wu inside is hurt, one wu
// outside is not.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import {
  createBroodEngine, BROOD_ATTACK_ARRIVAL_S, BROOD_PHASE_WINDUP, BROOD_PHASE_DASH,
} from '../src/systems/swarmBrood.js';
import {
  BROOD_CHARGER_WINDUP_S,
  BROOD_SPITTER_POOL_RADIUS,
  BROOD_SPITTER_SPLASH_RADIUS,
  BROOD_SPITTER_WINDUP_S,
  SWARM_BROOD_FAMILIES,
  SWARM_BROOD_MAX,
} from '../src/data/swarmBrood.js';
import {
  chargerLane, createBroodPresentation, poolFootprintRadius, spitterFootprintRadius,
} from '../src/render/broodPresentation.js';
import {
  circleHitRadius, corridorHalfWidth, dashReach, telegraphUrgency,
} from '../src/combat/telegraphFootprint.js';

const DT = 1 / 60;

function boot({ wave = 3, playerRadius = 6 } = {}) {
  const state = createGameState(4242);
  const bus = createBus();
  const player = {
    id: state.nextEntityId++, alive: true, type: 'ship', pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, radius: playerRadius, mass: 400, hull: 200, hullMax: 200,
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.entityIndex = { __spacefaceEntityIndexV1: true, ready: true, shipLike: [player], asteroids: [] };
  state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 });
  state.run.phase = 'active';
  state.run.wave = wave;
  state.mode = 'flight';
  state.player = state.player || { tether: null };
  const damage = [];
  const engine = createBroodEngine({
    bus, getState: () => state, fieldList: () => null,
    routeDamage: (request) => { damage.push(request); return { ok: true }; },
  });
  engine.prepareWave(state.run, wave);
  engine.spawnWave(state);
  state.simTime += BROOD_ATTACK_ARRIVAL_S;
  return { state, engine, player, damage };
}

function stepSeconds(h, seconds) {
  const ticks = Math.max(1, Math.round(seconds / DT));
  for (let i = 0; i < ticks; i++) { h.state.simTime += DT; h.state.tick += 1; h.engine.step(h.state); }
}

function isolate(engine, familyId) {
  const idx = SWARM_BROOD_FAMILIES.findIndex((f) => f.id === familyId);
  let keep = -1;
  for (let i = 0; i < SWARM_BROOD_MAX; i++) if (engine._bodies.alive[i] && engine._bodies.family[i] === idx) { keep = i; break; }
  for (let k = 0; k < SWARM_BROOD_MAX; k++) if (engine._bodies.alive[k] && k !== keep) engine._killDirectForTest(k, 'terrain');
  return keep;
}

test('the helpers are the query conventions, unchanged', () => {
  assert.equal(circleHitRadius(26, 6), 29);
  assert.equal(circleHitRadius(26, NaN), 26);
  assert.equal(corridorHalfWidth(8, 6), 14);
  assert.equal(dashReach(210, 1), 210);
  assert.equal(telegraphUrgency(0, 1), 0);
  assert.equal(telegraphUrgency(2, 1), 1);
  assert.equal(telegraphUrgency(0.25, 1), 0.25);
});

test('spitter: the marker closes onto the real splash radius, and the rim is where the hurt starts', () => {
  for (const playerRadius of [6, 14]) {
    const rim = circleHitRadius(BROOD_SPITTER_SPLASH_RADIUS, playerRadius);
    for (const [offset, hurt] of [[rim - 1, true], [rim + 1, false]]) {
      const h = boot({ playerRadius });
      const i = isolate(h.engine, 'spitter');
      assert.ok(i >= 0);
      h.engine._bodies.px[i] = 120; h.engine._bodies.pz[i] = 0;
      h.state.simTime += DT;
      h.engine.step(h.state);
      assert.equal(h.engine._bodies.phase[i], BROOD_PHASE_WINDUP);
      assert.equal(spitterFootprintRadius(h.engine.view), rim, `drawn radius == query radius (pilot radius ${playerRadius})`);
      h.player.pos.x = h.engine._bodies.teleX[i] + offset;
      h.player.pos.z = h.engine._bodies.teleZ[i];
      stepSeconds(h, BROOD_SPITTER_WINDUP_S + 2.2);
      const splash = h.damage.filter((r) => r.origin && r.origin.id === 'brood_acid');
      assert.equal(splash.length > 0, hurt, `${offset > rim ? 'outside' : 'inside'} the drawn rim (radius ${playerRadius}): ${splash.length} hits`);
    }
  }
});

test('the pool is drawn at its full hit radius for its whole life', () => {
  const h = boot();
  const view = h.engine.view;
  assert.equal(poolFootprintRadius(view), circleHitRadius(BROOD_SPITTER_POOL_RADIUS, h.player.radius));
  // the view carries the engine's own victim radius once it has cached the pilot
  const i = isolate(h.engine, 'spitter');
  h.engine._bodies.px[i] = 120; h.engine._bodies.pz[i] = 0;
  stepSeconds(h, 0.1);
  assert.equal(view.victimRadius, h.player.radius);
});

test('charger: the lane is as wide as the pass that hurts, and exactly that far', () => {
  const rows = [];
  for (const [lateralDelta, hurt] of [[-1, true], [1, false]]) {
    const h = boot({ wave: 7 });
    const i = isolate(h.engine, 'charger');
    assert.ok(i >= 0);
    h.engine._bodies.px[i] = 250; h.engine._bodies.pz[i] = 0;
    h.state.simTime += DT;
    h.engine.step(h.state);
    assert.equal(h.engine._bodies.phase[i], BROOD_PHASE_WINDUP);
    const carrierRadius = SWARM_BROOD_FAMILIES.find((f) => f.id === 'charger').radius;
    const lane = chargerLane(h.engine.view, carrierRadius);
    assert.equal(lane.halfWidth, corridorHalfWidth(carrierRadius, h.player.radius));
    // stand the pilot on the lane's side rim, a third of the way down the committed bearing
    const bearing = h.engine._bodies.teleDir[i];
    const along = lane.reach * 0.33;
    const nx = -Math.sin(bearing); const nz = Math.cos(bearing);
    h.player.pos.x = h.engine._bodies.px[i] + Math.cos(bearing) * along + nx * (lane.halfWidth + lateralDelta);
    h.player.pos.z = h.engine._bodies.pz[i] + Math.sin(bearing) * along + nz * (lane.halfWidth + lateralDelta);
    stepSeconds(h, BROOD_CHARGER_WINDUP_S + 0.05);
    assert.equal(h.engine._bodies.phase[i], BROOD_PHASE_DASH, 'the pass committed');
    stepSeconds(h, 0.9);
    const slams = h.damage.filter((r) => r.origin && r.origin.id === 'brood_charger');
    rows.push([lateralDelta, slams.length]);
    assert.equal(slams.length > 0, hurt, `lateral ${lateralDelta > 0 ? 'outside' : 'inside'} the drawn lane: ${slams.length} slams`);
  }
  assert.ok(rows.length === 2);
});

test('the presentation mounts the lane footprint beside the hairline and disposes it', () => {
  const calls = [];
  const scene = { add: (o) => calls.push(['add', o.name]), remove: (o) => calls.push(['remove', o.name]) };
  const pres = createBroodPresentation(scene, 16);
  assert.ok(pres.lanes && pres.lines && pres.lanes.name === 'sf-swarm-brood-lanes');
  pres.dispose();
  assert.ok(calls.some((c) => c[0] === 'remove' && c[1] === 'sf-swarm-brood-lanes'));
});
