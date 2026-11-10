// inf-brood-grief — the room notices your kill. The BLOOM pathology spine (src/data/swarmBrood.js
// / bloomLadder.js) authored the whole cascade family — filament flinch, panic scatter/knot,
// aggression, grief — pinned by catalog-law tests, and none of it ever ran: no engine, no
// renderer, no consumer. This wires the two per-death readings through the engine's own death
// seam, on the authored numbers exactly:
//   filament flinch — "a node's death pushes linked members outward this hard" (26 wu/s Δv);
//   grief — a credited death arms every living neighbor inside the cascade reach; each mourner
//   bends toward its corpse for BROOD_GRIEF_S until it reaches the mourning ring.
// The flinch is the web's instant recoil; the grief is the sag back over the dead — together
// they read as the fight's shape bending toward where you are winning. Panic scatter/knot and
// the aggression cascade stay authored-but-unwired (named next steps); nothing here invents
// numbers, and the population law is untouched (grief moves nobody in or out of the plan).

import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createBus } from '../src/core/eventBus.js';
import { createBroodEngine } from '../src/systems/swarmBrood.js';
import {
  BROOD_CASCADE_GRIEF,
  BROOD_CASCADE_NONE,
  BROOD_CASCADE_RADIUS,
  BROOD_FILAMENT_FLINCH_DV,
  BROOD_GRIEF_S,
} from '../src/data/swarmBrood.js';

const DT = 1 / 60;

function fixture() {
  const state = createGameState(4242), bus = createBus();
  state.mode = 'flight';
  state.simTime = 30;
  state.run = Object.assign(createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    { wave: 1, phase: 'active' });
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

// Stage one linked pair on an empty patch of the room, far from every gate clump, so the
// grief and flinch reads are clean: victim at (2000, 2000), mourner at (2000, 2050) —
// inside the cascade reach, outside the mourning ring, unreachable by any other corpse.
function stagePair(h) {
  const { bodies } = h;
  const a = bodies.alive.findIndex((v) => v === 1);
  let b = -1;
  for (let i = 0; i < bodies.alive.length; i++) {
    if (i !== a && bodies.alive[i] === 1) { b = i; break; }
  }
  assert.ok(a >= 0 && b >= 0, 'two live cells are needed for the stage');
  bodies.px[a] = 2000; bodies.pz[a] = 2000;
  bodies.px[b] = 2000; bodies.pz[b] = 2050;
  bodies.vx[a] = 0; bodies.vz[a] = 0;
  bodies.vx[b] = 0; bodies.vz[b] = 0;
  bodies.linkPartner[a] = b;
  bodies.linkPartner[b] = a;
  return { a, b };
}

test('a linked node dies: its partner flinches outward along the web, instantly', () => {
  const h = fixture();
  const { a, b } = stagePair(h);
  const corpseX = h.bodies.px[a], corpseZ = h.bodies.pz[a];
  h.engine.onExplosion({ pos: { x: corpseX, z: corpseZ }, radius: 4, ownerId: h.player.id });
  assert.equal(h.bodies.alive[a], 0, 'the victim is dead');
  assert.equal(h.bodies.alive[b], 1, 'the partner survives the blast (outside its shove reach)');
  // No step has run: the flinch is the death's own additive Δv along corpse→partner.
  const dx = h.bodies.px[b] - corpseX, dz = h.bodies.pz[b] - corpseZ;
  const d = Math.hypot(dx, dz);
  assert.ok(d > 10, 'the pair was staged with real separation');
  assert.ok(Math.abs(h.bodies.vx[b] - (dx / d) * BROOD_FILAMENT_FLINCH_DV) < 1e-6
    && Math.abs(h.bodies.vz[b] - (dz / d) * BROOD_FILAMENT_FLINCH_DV) < 1e-6,
    `the partner flinches outward at the authored ${BROOD_FILAMENT_FLINCH_DV} wu/s along the web axis`);
  h.engine.clear();
});

test('a credited kill mourns: the mourner bends toward the corpse, then the clock lets go', () => {
  const h = fixture();
  stagePair(h);
  const corpse = { x: 2000, z: 2000 };
  h.engine.onExplosion({ pos: corpse, radius: 4, ownerId: h.player.id });
  const census = h.engine.census();
  assert.ok(census.mourners >= 1, `the neighbor mourns (got ${census.mourners})`);
  assert.equal(h.engine.view.cascade, BROOD_CASCADE_GRIEF, 'the cascade kind publishes on the view');

  // The web recoiled outward; grief pulls the mourner back over its dead — inside the
  // authored window the distance to the corpse must close despite the initial flinch.
  const b = h.bodies.alive.findIndex((v) => v === 1);
  const dist = () => Math.hypot(h.bodies.px[b] - corpse.x, h.bodies.pz[b] - corpse.z);
  const atBlast = dist();
  for (let t = 0; t < 36; t++) { h.state.simTime += DT; h.engine.step(h.state); }
  assert.ok(dist() < atBlast - 1,
    `the mourner must close on the corpse (blast ${atBlast.toFixed(1)} -> ${dist().toFixed(1)})`);

  // Past the window the mourning ends: the census empties and the kind clears.
  h.state.simTime += BROOD_GRIEF_S + 0.5;
  h.engine.step(h.state);
  assert.equal(h.engine.census().mourners, 0, 'the grief window expires');
  assert.equal(h.engine.view.cascade, BROOD_CASCADE_NONE, 'the kind clears with the window');
  h.engine.clear();
});

test('an uncredited death flinches the web but arms no mourning', () => {
  const h = fixture();
  stagePair(h);
  h.engine.onExplosion({ pos: { x: 2000, z: 2000 }, radius: 4, ownerId: 999999 });
  assert.equal(h.engine.census().mourners, 0, 'a kill nobody credits is a kill the room does not mourn');
  assert.equal(h.engine.view.cascade, BROOD_CASCADE_NONE);
  const b = h.bodies.alive.findIndex((v) => v === 1);
  assert.ok(Math.hypot(h.bodies.vx[b], h.bodies.vz[b]) > 1, 'the flinch still landed');
  const dist = () => Math.hypot(h.bodies.px[b] - 2000, h.bodies.pz[b] - 2050 + 50);
  const atBlast = dist();
  for (let t = 0; t < 36; t++) { h.state.simTime += DT; h.engine.step(h.state); }
  assert.ok(dist() >= atBlast - 0.5,
    'no grief pull: the survivor does not close on an uncredited corpse');
  h.engine.clear();
});

test('a cleared room leaves no mourning in a reused slot', () => {
  const h = fixture();
  stagePair(h);
  h.engine.onExplosion({ pos: { x: 2000, z: 2000 }, radius: 4, ownerId: h.player.id });
  assert.ok(h.engine.census().mourners >= 1);
  h.engine.clear();
  h.engine.prepareWave(h.state.run, h.state.run.wave);
  h.engine.spawnWave(h.state);
  assert.equal(h.engine.census().mourners, 0, 'a fresh wave inherits no grief');
  assert.equal(h.engine.view.cascade, BROOD_CASCADE_NONE);
  h.engine.clear();
});

test('the cascade reach is the authored one, not the whole buffer', () => {
  const h = fixture();
  stagePair(h);
  // A survivor parked far outside BROOD_CASCADE_RADIUS must not mourn a death it cannot see.
  const far = h.bodies.alive.findIndex((v, i) => v === 1 && i !== h.bodies.alive.findIndex((w) => w === 1));
  assert.ok(far >= 0);
  h.bodies.px[far] = 2000;
  h.bodies.pz[far] = 2000 + BROOD_CASCADE_RADIUS + 60;
  h.bodies.vx[far] = 0; h.bodies.vz[far] = 0;
  h.engine.onExplosion({ pos: { x: 2000, z: 2000 }, radius: 4, ownerId: h.player.id });
  const farDistToCorpse = Math.hypot(h.bodies.px[far] - 2000, h.bodies.pz[far] - 2000);
  assert.ok(farDistToCorpse > BROOD_CASCADE_RADIUS, 'the far cell sits outside the reach');
  const before = { x: h.bodies.px[far], z: h.bodies.pz[far] };
  for (let t = 0; t < 30; t++) { h.state.simTime += DT; h.engine.step(h.state); }
  const moved = Math.hypot(h.bodies.px[far] - before.x, h.bodies.pz[far] - before.z);
  const towardCorpse = ((h.bodies.px[far] - before.x) * -before.x
    + (h.bodies.pz[far] - before.z) * -before.z);
  assert.ok(towardCorpse <= 0 || moved < 1,
    'a cell outside the cascade reach does not bend toward the corpse');
  h.engine.clear();
});
