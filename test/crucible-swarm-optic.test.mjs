// build_map §24 "Arenas" — every live swarm room carries one optic lattice.
// compileSwarmOptic (src/data/swarmOpticArenas.js) owns the per-arena recipe; swarmArena
// stamps it player-relative on the wave-1 transition. The fixture bar: the wave-1 stamp
// matches compileSwarmOptic(arenaId) exactly, and a second wave does not double it.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  OPTIC_LATTICE_SPACING,
  OPTIC_RAY_COUNT,
  opticHeadings,
  traceOpticRay,
} from '../src/combat/opticField.js';
import { OPTIC_STRUCTURES } from '../src/data/opticStructures.js';
import { compileSwarmOptic } from '../src/data/swarmOpticArenas.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import {
  SWARM_DEBRIS_TAG,
  SWARM_OPTIC_TAG,
  swarmArena,
} from '../src/systems/swarmArena.js';

const SEED = 4242;

// The live swarm rooms, by their real arena ids (survivalWaves / adventureArenaSites).
const HELIOS = 'helios_core';
const LAGRANGE = 'lagrange_crucible';
const CINDER = 'cinder_sluice';
const CRYO = 'cryo_drift';
const STORM = 'storm_lattice';
const ARENAS = [HELIOS, LAGRANGE, CINDER, CRYO, STORM];

function boot(arenaId, playerAt = { x: 0, z: 0 }) {
  const state = createGameState(SEED);
  const bus = createBus();
  const spawned = [];
  const helpers = {
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = { ...spec, id, alive: true, pos: { x: spec.pos.x, z: spec.pos.z } };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { ...playerAt }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;

  const ctx = { state, bus, helpers };
  runSession.init(ctx);
  survivalRun.init(ctx);
  swarmArena.init(ctx);
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: SWARM_RULESET, seed: SEED, arenaId });
  return { state, bus, helpers, spawned, player };
}

function planFor(arenaId, wave) {
  return planWave({ seed: SEED, arenaId, wave, ruleset: SWARM_RULESET });
}

function opticRocks(h) {
  return h.state.entityList.filter((e) => e.data && e.data[SWARM_OPTIC_TAG]);
}

function cellsOf(layout) {
  const map = new Map();
  for (const body of layout.bodies) map.set(`${body.ix},${body.iz}`, body.material);
  return map;
}

/** Count 4-connected runs in a list of [ix, iz] cells — one run is one contiguous gap. */
function connectedRuns(cells) {
  const pending = cells.map(([ix, iz]) => `${ix},${iz}`);
  let runs = 0;
  while (pending.length) {
    runs += 1;
    const stack = [pending.pop()];
    while (stack.length) {
      const [ix, iz] = stack.pop().split(',').map(Number);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const key = `${ix + dx},${iz + dz}`;
        const at = pending.indexOf(key);
        if (at >= 0) {
          pending.splice(at, 1);
          stack.push(key);
        }
      }
    }
  }
  return runs;
}

test('Helios carries a fuse on the rear lane', () => {
  const layout = compileSwarmOptic(HELIOS);
  const cells = cellsOf(layout);
  assert.equal(layout.bodies.filter((b) => b.material === 'diamond').length, 4);
  for (let ix = 0; ix < 4; ix++) {
    assert.equal(cells.get(`${ix},0`), 'diamond', `fuse cell ${ix},0`);
    assert.equal(cells.get(`${ix},1`), 'stone', `north flank ${ix}`);
    assert.equal(cells.get(`${ix},-1`), 'stone', `south flank ${ix}`);
  }
  // Heading π/2 folds +ix onto +z, so the lane runs along the rear (+z) of the anchor.
  assert.ok(layout.origin.z > 0, 'the fuse sits on the rear lane');
  for (const body of layout.bodies) {
    assert.ok(body.z >= -1e-9, `body ${body.ix},${body.iz} leaked forward of the lane`);
  }
  const mouth = layout.bodies.findIndex((b) => b.ix === 0 && b.iz === 0);
  const chained = traceOpticRay(layout.bodies, mouth, Math.PI / 2);
  assert.ok(chained >= 0 && layout.bodies[chained].material === 'diamond'
    && layout.bodies[chained].ix === 1, 'a bolt down the lane walks the fuse');
});

test('Lagrange carries two mirrors for the kinetic bank gun', () => {
  const layout = compileSwarmOptic(LAGRANGE);
  assert.equal(layout.bodies.length, 2);
  assert.ok(layout.bodies.every((b) => b.material === 'metal'));
});

test('Cinder carries a stone pocket with exactly one gap for a door', () => {
  const layout = compileSwarmOptic(CINDER);
  assert.ok(layout.bodies.every((b) => b.material === 'stone'), 'the pocket is all stone');
  const cells = cellsOf(layout);
  const missingBorder = [];
  for (let ix = 0; ix <= 3; ix++) {
    for (let iz = -1; iz <= 2; iz++) {
      const border = ix === 0 || ix === 3 || iz === -1 || iz === 2;
      const present = cells.has(`${ix},${iz}`);
      if (border && !present) missingBorder.push([ix, iz]);
      if (!border) assert.equal(present, false, `interior ${ix},${iz} must stay hollow`);
    }
  }
  assert.equal(connectedRuns(missingBorder), 1, 'exactly one contiguous gap — the door');
  assert.ok(missingBorder.every(([ix]) => ix === 3), 'the door faces the +x fight lane');
});

test('Cryo carries a short east fuse', () => {
  const layout = compileSwarmOptic(CRYO);
  const cells = cellsOf(layout);
  for (let ix = 0; ix < 3; ix++) {
    assert.equal(cells.get(`${ix},0`), 'diamond', `fuse cell ${ix},0`);
    assert.equal(cells.get(`${ix},1`), 'stone');
    assert.equal(cells.get(`${ix},-1`), 'stone');
  }
  assert.equal(layout.bodies.filter((b) => b.material === 'diamond').length, 3);
  // Heading 0 puts the run on +x, east of the anchor.
  assert.ok(layout.origin.x > 0, 'the fuse sits east of the island');
  const xs = layout.bodies
    .filter((b) => b.material === 'diamond')
    .map((b) => b.x)
    .sort((a, b) => a - b);
  assert.ok(xs[1] - xs[0] === OPTIC_LATTICE_SPACING && xs[2] - xs[1] === OPTIC_LATTICE_SPACING,
    'a short fuse, one lattice step per cell');
  assert.ok(layout.bodies.filter((b) => b.material === 'diamond').every((b) => b.z === 0));
});

test('Storm carries a closed 2x2 prism box ringed in stone', () => {
  const layout = compileSwarmOptic(STORM);
  const cells = cellsOf(layout);
  for (let ix = 0; ix <= 1; ix++) {
    for (let iz = 0; iz <= 1; iz++) {
      assert.equal(cells.get(`${ix},${iz}`), 'diamond', `prism cell ${ix},${iz}`);
    }
  }
  for (let ix = -1; ix <= 2; ix++) {
    for (let iz = -1; iz <= 2; iz++) {
      const border = ix === -1 || ix === 2 || iz === -1 || iz === 2;
      if (border) assert.equal(cells.get(`${ix},${iz}`), 'stone', `ring ${ix},${iz}`);
    }
  }
  assert.equal(layout.bodies.length, 16);
  // Closed: a splinter on any compass heading from any diamond lands inside the lattice.
  const headings = opticHeadings();
  for (let index = 0; index < layout.bodies.length; index++) {
    const body = layout.bodies[index];
    if (body.material !== 'diamond') continue;
    for (let step = 0; step < OPTIC_RAY_COUNT; step++) {
      const hit = traceOpticRay(layout.bodies, index, headings[step]);
      assert.ok(hit >= 0, `diamond ${body.ix},${body.iz} heading ${step} escapes the box`);
    }
  }
});

test('no arena lattice is a sector structure — the Ceres registry stays untouched', () => {
  for (const arenaId of ARENAS) {
    const layout = compileSwarmOptic(arenaId);
    assert.ok(layout && layout.bodies.length > 0, `${arenaId} compiles`);
    assert.ok(OPTIC_STRUCTURES.every((spec) => spec.id !== layout.id),
      `${layout.id} must not live in OPTIC_STRUCTURES`);
  }
  assert.equal(compileSwarmOptic('ceres_belt'), null);
  assert.equal(compileSwarmOptic('not_a_room'), null);
  assert.equal(compileSwarmOptic(undefined), null);
});

test('a wave-1 stamp matches compileSwarmOptic, and a second wave does not double it', () => {
  for (const arenaId of ARENAS) {
    const h = boot(arenaId);
    h.bus.emit('run:wavePlanned', { wave: 1, plan: planFor(arenaId, 1) });
    const layout = compileSwarmOptic(arenaId);
    const optics = opticRocks(h);
    assert.equal(optics.length, layout.bodies.length, `${arenaId} wave-1 stamp count`);

    // Every compiled cell is a live collider at anchor + origin + cell offset.
    for (const body of layout.bodies) {
      const wx = h.player.pos.x + layout.origin.x + body.x;
      const wz = h.player.pos.z + layout.origin.z + body.z;
      const rock = optics.find((e) => Math.abs(e.pos.x - wx) < 1e-6 && Math.abs(e.pos.z - wz) < 1e-6);
      assert.ok(rock, `${arenaId} missing cell ${body.ix},${body.iz} at ${wx.toFixed(0)},${wz.toFixed(0)}`);
      assert.equal(rock.data.opticMaterial, body.material);
      assert.equal(rock.data.opticCell, `${body.ix},${body.iz}`);
      assert.equal(rock.data.opticStructureId, layout.id);
      assert.equal(rock.type, 'asteroid');
      assert.equal(rock.collides, true);
      assert.equal(rock.physicsBody && rock.physicsBody.radius, body.radius);
      assert.equal(rock.data[SWARM_DEBRIS_TAG], undefined, 'a lattice cell is not debris cover');
    }

    // The same transition again, then the next wave: the stamp holds, never re-pours.
    const ids = optics.map((e) => e.id).sort((a, b) => a - b);
    h.bus.emit('run:wavePlanned', { wave: 1, plan: planFor(arenaId, 1) });
    h.bus.emit('run:wavePlanned', { wave: 2, plan: planFor(arenaId, 2) });
    const after = opticRocks(h);
    assert.equal(after.length, layout.bodies.length, `${arenaId} lattice doubled on wave 2`);
    assert.deepEqual(after.map((e) => e.id).sort((a, b) => a - b), ids,
      `${arenaId} restamped instead of keeping the live lattice`);
    for (const rock of after) {
      assert.equal(Number.isFinite(rock.data.despawnAt), false,
        `${arenaId} lattice released while the fight is still in it`);
    }
  }
});
