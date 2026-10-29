// w-501: the Breaker head makes a slammed rock split into real throwable
// chunks — admission is the masslineImpacts whip receipt, the holder seam is
// entity data.lineHeadId, and the consumed parent never re-splits.
import assert from 'node:assert/strict';
import test from 'node:test';

import { lineHeads } from '../src/systems/lineHeads.js';
import { PHYSICAL_BREAKUP_LAW } from '../src/systems/hullFracture.js';

function makeRng(seed = 12345) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function makeHarness({ headId = 'head_breaker', chunkCount = 3 } = {}) {
  const spawned = [];
  const emitted = [];
  const entities = new Map();
  const rock = {
    id: 42, type: 'asteroid', alive: true,
    pos: { x: 10, y: 0, z: -4 }, vel: { x: 30, y: 0, z: 12 },
    radius: 8, mass: 6, hull: 40, hullMax: 40, collides: true,
    data: { oreHP: 40 },
  };
  entities.set(42, rock);
  const victim = { id: 77, type: 'ship', alive: true, pos: { x: 0, y: 0, z: 0 } };
  entities.set(77, victim);
  const player = {
    id: 1, type: 'ship', alive: true,
    data: { lineHeadId: headId, derived: { lineHead: { kind: 'slam_split', chunkCount } } },
  };
  entities.set(1, player);
  const state = {
    playerId: 1,
    entities,
    entityList: [...entities.values()],
    rng: makeRng(),
    simTime: 100,
    tick: 6000,
    world: { currentSectorId: 'sector_test' },
  };
  const sys = Object.create(lineHeads);
  sys.init({
    state,
    bus: {
      on: (verb, fn) => { sys.__fn = fn; return () => {}; },
      emit: (verb, payload) => emitted.push({ verb, payload }),
    },
    helpers: {
      spawnEntity: (spec) => {
        const e = { id: 100 + spawned.length, alive: true, ...spec };
        spawned.push(e);
        return e;
      },
    },
  });
  return { sys, state, rock, player, spawned, emitted };
}

function whip(over = {}) {
  return {
    targetId: 42, victimId: 77,
    relSpeed: 80, massSpeed: 75, mass: 6, momentum: 400,
    slung: false, severity: 0.6, rating: 'solid',
    pos: { x: 5, y: 0, z: -2 }, normal: { x: 0.6, z: -0.8 },
    tick: 6000, time: 100,
    ...over,
  };
}

test('w-501: a solid whip slam on a Breaker-held rock splits it into authored chunks', () => {
  const { sys, rock, spawned, emitted } = makeHarness();
  sys.__fn(whip());
  assert.equal(rock.alive, false, 'the slammed body is consumed');
  assert.equal(rock.data.breakerConsumed, true);
  assert.equal(spawned.length, 3, 'Worked floor authors three chunks');
  for (const c of spawned) {
    assert.equal(c.type, 'wreck');
    assert.equal(c.collides, true, 'a chunk is a real physics body');
    assert.equal(c.data.breakerChunk, true);
    assert.equal(c.data.breakerChunkOf, 42);
    assert.equal(c.ttl, PHYSICAL_BREAKUP_LAW.tearOffLifetimeS);
    assert.ok(c.physicsBody && c.physicsBody.shape === 'capsule');
    assert.ok(c.mass > 0 && c.mass <= 6);
    assert.ok(Math.hypot(c.pos.x - rock.pos.x, c.pos.z - rock.pos.z) > rock.radius,
      'chunks spawn clear of the parent silhouette');
  }
  const split = emitted.find((e) => e.verb === 'lineHead:breakerSplit');
  assert.ok(split, 'the split receipt emits');
  assert.equal(split.payload.pieceIds.length, 3);
  assert.equal(split.payload.parentId, 42);
});

test('w-501: Storied provenance authors four chunks through the same seam', () => {
  const { sys, spawned } = makeHarness({ chunkCount: 4 });
  sys.__fn(whip({ rating: 'crushing' }));
  assert.equal(spawned.length, 4);
});

test('w-501: no head, wrong head, or a dead holder — the slam does nothing new', () => {
  for (const headId of [null, 'head_barb', 'head_weld']) {
    const { sys, rock, spawned } = makeHarness({ headId });
    sys.__fn(whip());
    assert.equal(spawned.length, 0, `${headId} must not split`);
    assert.equal(rock.alive, true);
  }
  const { sys, rock, spawned } = makeHarness();
  sys.state.entities.get(1).alive = false;
  sys.__fn(whip());
  assert.equal(spawned.length, 0, 'a dead holder swings nothing');
  assert.equal(rock.alive, true);
});

test('w-501: a glance is not a slam — the authored bands gate the split', () => {
  const { sys, rock, spawned } = makeHarness();
  for (const rating of ['glance', 'chip', '']) {
    sys.__fn(whip({ rating }));
    assert.equal(spawned.length, 0, `rating '${rating}' is below the slam floor`);
  }
  assert.equal(rock.alive, true);
});

test('w-501: ships, stations and already-broken bodies never split under the head', () => {
  const { sys, state, spawned } = makeHarness();
  for (const type of ['ship', 'station', 'projectile', 'shard', 'machine', 'vfx']) {
    const body = { id: 50, type, alive: true, pos: { x: 0, y: 0, z: 0 }, radius: 5, mass: 4, data: {} };
    state.entities.set(50, body);
    sys.__fn(whip({ targetId: 50 }));
    assert.equal(body.alive, true, `${type} is not ammunition-grade rock`);
    assert.equal(spawned.length, 0);
  }
});

test('w-501: one split per body — a consumed rock cannot re-split', () => {
  const { sys, state, rock, spawned } = makeHarness();
  sys.__fn(whip());
  assert.equal(spawned.length, 3);
  // Resurrect the same body and slam again — the stamp still refuses.
  rock.alive = true;
  sys.__fn(whip());
  assert.equal(spawned.length, 3, 'breakerConsumed bodies are spent');
  // And a breaker chunk itself never chains.
  const chunk = spawned[0];
  state.entities.set(chunk.id, chunk);
  sys.__fn(whip({ targetId: chunk.id }));
  assert.equal(spawned.length, 3);
});

test('w-501: the same seed yields the same chunk census', () => {
  const a = makeHarness();
  const b = makeHarness();
  a.sys.__fn(whip());
  b.sys.__fn(whip());
  assert.deepEqual(
    a.spawned.map((c) => [c.mass, c.radius, c.pos.x, c.pos.z, c.vel.x, c.vel.z]),
    b.spawned.map((c) => [c.mass, c.radius, c.pos.x, c.pos.z, c.vel.x, c.vel.z]),
  );
});
