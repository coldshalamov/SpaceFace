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
      on: (verb, fn) => { (sys.__fns = sys.__fns || []).push(fn); return () => {}; },
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

// The bus fans out to every whipImpact subscriber (breaker + seal) — same as production.
function fireWhip(sys, payload) {
  for (const fn of sys.__fns || []) fn(payload);
}

test('w-501: a solid whip slam on a Breaker-held rock splits it into authored chunks', () => {
  const { sys, rock, spawned, emitted } = makeHarness();
  fireWhip(sys, whip());
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
  fireWhip(sys, whip({ rating: 'crushing' }));
  assert.equal(spawned.length, 4);
});

test('w-501: no head, wrong head, or a dead holder — the slam does nothing new', () => {
  for (const headId of [null, 'head_barb', 'head_weld']) {
    const { sys, rock, spawned } = makeHarness({ headId });
    fireWhip(sys, whip());
    assert.equal(spawned.length, 0, `${headId} must not split`);
    assert.equal(rock.alive, true);
  }
  const { sys, rock, spawned } = makeHarness();
  sys.state.entities.get(1).alive = false;
  fireWhip(sys, whip());
  assert.equal(spawned.length, 0, 'a dead holder swings nothing');
  assert.equal(rock.alive, true);
});

test('w-501: a glance is not a slam — the authored bands gate the split', () => {
  const { sys, rock, spawned } = makeHarness();
  for (const rating of ['glance', 'chip', '']) {
    fireWhip(sys, whip({ rating }));
    assert.equal(spawned.length, 0, `rating '${rating}' is below the slam floor`);
  }
  assert.equal(rock.alive, true);
});

test('w-501: ships, stations and already-broken bodies never split under the head', () => {
  const { sys, state, spawned } = makeHarness();
  for (const type of ['ship', 'station', 'projectile', 'shard', 'machine', 'vfx']) {
    const body = { id: 50, type, alive: true, pos: { x: 0, y: 0, z: 0 }, radius: 5, mass: 4, data: {} };
    state.entities.set(50, body);
    fireWhip(sys, whip({ targetId: 50 }));
    assert.equal(body.alive, true, `${type} is not ammunition-grade rock`);
    assert.equal(spawned.length, 0);
  }
});

test('w-501: one split per body — a consumed rock cannot re-split', () => {
  const { sys, state, rock, spawned } = makeHarness();
  fireWhip(sys, whip());
  assert.equal(spawned.length, 3);
  // Resurrect the same body and slam again — the stamp still refuses.
  rock.alive = true;
  fireWhip(sys, whip());
  assert.equal(spawned.length, 3, 'breakerConsumed bodies are spent');
  // And a breaker chunk itself never chains.
  const chunk = spawned[0];
  state.entities.set(chunk.id, chunk);
  fireWhip(sys, whip({ targetId: chunk.id }));
  assert.equal(spawned.length, 3);
});

test('w-501: the same seed yields the same chunk census', () => {
  const a = makeHarness();
  const b = makeHarness();
  fireWhip(a.sys, whip());
  fireWhip(b.sys, whip());
  assert.deepEqual(
    a.spawned.map((c) => [c.mass, c.radius, c.pos.x, c.pos.z, c.vel.x, c.vel.z]),
    b.spawned.map((c) => [c.mass, c.radius, c.pos.x, c.pos.z, c.vel.x, c.vel.z]),
  );
});

// ── the per-step heads ───────────────────────────────────────────────────────

function makeTickHarness({ headId, heldType = 'asteroid', heldMass = 8 } = {}) {
  const entities = new Map();
  const list = [];
  const add = (e) => { entities.set(e.id, e); list.push(e); return e; };
  const holder = add({
    id: 1, type: 'ship', alive: true, factionId: 'faction_free', team: 0,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 10, y: 0, z: 0 }, radius: 12, mass: 40,
    tether: { active: true, targetId: 42 },
    data: { lineHeadId: headId, derived: { lineHead: { kind: 'x', chunkCount: 3, panicWingmen: true } } },
  });
  const held = add({
    id: 42, type: heldType, alive: true, factionId: 'faction_pirate', team: 1,
    pos: { x: 80, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, radius: 8, mass: heldMass,
    hull: 30, hullMax: 30, data: {},
  });
  const emitted = [];
  const state = {
    playerId: 1, entities, entityList: list,
    rng: makeRng(), simTime: 50, tick: 3000, mode: 'flight',
    world: { currentSectorId: 'sector_test' },
  };
  const sys = Object.create(lineHeads);
  sys.init({
    state,
    bus: { on: (verb, fn) => { sys.__fns = sys.__fns || []; sys.__fns.push(fn); return () => {}; },
           emit: (verb, payload) => emitted.push({ verb, payload }) },
    helpers: { spawnEntity: (spec) => add({ id: 500 + list.length, alive: true, ...spec }) },
  });
  return { sys, state, holder, held, entities, list, emitted };
}

test('w-501: Coupler chains loose bodies near the held mass into a following train', () => {
  const { sys, state, held, list } = makeTickHarness({ headId: 'head_coupler' });
  const loose = { id: 60, type: 'asteroid', alive: true, pos: { x: 120, y: 0, z: 10 },
                  vel: { x: 0, y: 0, z: 0 }, radius: 6, mass: 3, data: {} };
  list.push(loose); state.entities.set(60, loose);
  sys.update(1 / 60, state);
  assert.equal(loose.data.trainOf, 1, 'the loose body joins the holder’s train');
  assert.ok(loose.data.trainSlot >= 1);
  const v0 = Math.hypot(loose.vel.x, loose.vel.z);
  for (let i = 0; i < 120; i++) sys.update(1 / 60, state);
  assert.ok(Math.hypot(loose.vel.x, loose.vel.z) > v0, 'the car accelerates to follow the line');
  // Dropping the tether releases the consist.
  const holder = state.entities.get(1);
  holder.tether.active = false;
  sys.update(1 / 60, state);
  assert.equal(loose.data.trainOf, undefined);
});

test('w-501: Barb drags a latched light hull and the wrong target types stay free', () => {
  const { sys, state, held } = makeTickHarness({ headId: 'head_barb', heldType: 'ship', heldMass: 20 });
  const d0 = Math.hypot(held.pos.x, held.pos.z);
  for (let i = 0; i < 180; i++) sys.update(1 / 60, state);
  assert.equal(held.data.barbed, 1);
  assert.ok(Math.hypot(held.vel.x, held.vel.z) > 0, 'the hooked hull is dragged along');
  // A heavy ship is not a barb target.
  const heavy = makeTickHarness({ headId: 'head_barb', heldType: 'ship', heldMass: 200 });
  heavy.sys.update(1 / 60, heavy.state);
  assert.equal(heavy.held.data.barbed, undefined);
  // An asteroid is not a ship — no drag stamp.
  const rock = makeTickHarness({ headId: 'head_barb', heldType: 'asteroid' });
  rock.sys.update(1 / 60, rock.state);
  assert.equal(rock.held.data.barbed, undefined);
  void d0;
});

test('w-501: Hush hides the held mass from scales while held and lifts on release', () => {
  const { sys, state, held } = makeTickHarness({ headId: 'head_hush' });
  sys.update(1 / 60, state);
  assert.equal(held.data.signatureHidden, true, 'the scale stamp the Weighing reads');
  assert.equal(held.data.hushHeldBy, 1);
  state.entities.get(1).tether.active = false;
  sys.update(1 / 60, state);
  assert.equal(held.data.signatureHidden, undefined, 'release restores the manifest read');
  assert.equal(held.data.hushHeldBy, undefined);
});

test('w-501: Evidence Clamp staples the held body to a touched joint — the bond outlives the Line', () => {
  const { sys, state, held, list, emitted } = makeTickHarness({ headId: 'head_evidence_clamp' });
  const joint = { id: 90, type: 'asteroid', alive: true, pos: { x: 88.5, y: 0, z: 0 },
                  vel: { x: 0, y: 0, z: 0 }, radius: 4, mass: 50, data: {} };
  list.push(joint); state.entities.set(90, joint);
  // Channel: stapleTimeS default 2.0s — under it, nothing binds.
  for (let i = 0; i < 60; i++) sys.update(1 / 60, state);
  assert.equal(held.data.stapledTo, undefined, 'channel incomplete — no bond');
  for (let i = 0; i < 80; i++) sys.update(1 / 60, state);
  assert.equal(joint.data.stapledAnchor, held.id, 'the heavier body anchors');
  assert.equal(held.data.stapledTo, joint.id, 'the rider staples to the anchor');
  assert.ok(emitted.some((e) => e.verb === 'lineHead:stapled'));
  // The bond outlives the Line: release the tether, move the anchor — the rider follows.
  state.entities.get(1).tether.active = false;
  joint.pos.x += 30; joint.pos.z += 10;
  joint.vel.x = 5;
  sys.update(1 / 60, state);
  assert.equal(held.pos.x, joint.pos.x + held.data.stapleOffset.dx);
  assert.equal(held.vel.x, 5, 'the rider keeps the anchor’s motion');
});

test('w-501: Sympathy pulls line-linked bodies toward shared momentum', () => {
  const { sys, state, holder, held } = makeTickHarness({ headId: 'head_sympathy' });
  holder.vel = { x: 40, y: 0, z: 0 };
  held.vel = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 300; i++) sys.update(1 / 60, state);
  const shared = (40 * holder.mass + 0 * held.mass) / (holder.mass + held.mass);
  assert.ok(Math.abs(holder.vel.x - shared) < 4, 'holder converges toward shared momentum');
  assert.ok(Math.abs(held.vel.x - shared) < 4, 'held converges toward shared momentum');
});

test('w-501: Seal marks a stapled hostile — lawful ships take it as their security target', () => {
  // Held rock (42) is the standard asteroid; the hostile SHIP is the whip victim.
  const { sys, state, list, emitted } = makeTickHarness({ headId: 'head_seal' });
  const victim = { id: 88, type: 'ship', alive: true, team: 1, factionId: 'faction_pirate',
                   pos: { x: 90, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, radius: 9, mass: 25,
                   data: { ai: { hostileTeams: [0] } } };
  const cop = { id: 200, type: 'ship', alive: true, team: 0, factionId: 'faction_concord',
                pos: { x: 400, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, radius: 10, mass: 30,
                data: { ai: { lawful: true } } };
  list.push(victim, cop); state.entities.set(88, victim); state.entities.set(200, cop);
  const holder = state.entities.get(1);
  sys.__fns.forEach((fn) => fn(whip({ victimId: 88 })));
  assert.ok(victim.data.sealMark, 'the mark lands on the hostile');
  assert.equal(victim.data.sealMark.by, holder.id);
  assert.equal(cop.data.ai.securityTargetId, victim.id, 'lawful ships hunt the mark');
  assert.ok(emitted.some((e) => e.verb === 'lineHead:sealed'));
  // A neutral victim (player-side civilian, team 0) takes no mark.
  const neutral = { id: 43, type: 'ship', alive: true, team: 0, factionId: 'faction_free',
                    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, data: {} };
  list.push(neutral); state.entities.set(43, neutral);
  sys.__fns.forEach((fn) => fn(whip({ victimId: 43 })));
  assert.equal(neutral.data.sealMark, undefined);
});
