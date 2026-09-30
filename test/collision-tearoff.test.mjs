// Collision tear-off (physical plating on hard sub-lethal hits): the rung below the lethal
// fracture. Drives the real _resolveContact -> receipt -> damage gate -> spawnCollisionTearOff
// chain with a stub combat kernel; asserts admission rules (severity, non-lethal, cooldown,
// cap) and the shard body contract (momentum inheritance, bounded mass, sector ownership).
// Deterministic: seeded state.rng only, no wall clock.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { makeEntity } from '../src/core/entity.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { spawnCollisionTearOff, resetPendingSlams } from '../src/systems/hullFracture.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';

function bootHarness(seed = 9017) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.tick = 500;
  state.world.currentSectorId = 'sector-test';
  const bus = createBus();
  const helpers = {
    spawnEntity(spec) {
      const entity = makeEntity(spec);
      entity.id = state.nextEntityId++;
      entity.alive = true;
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  return { state, bus, helpers };
}

function bootSystem(h, { hullBefore = 80 } = {}) {
  const applied = [];
  const consequences = Object.create(collisionConsequences);
  consequences.init({
    state: h.state,
    bus: h.bus,
    helpers: h.helpers,
    registry: {
      get: (id) => (id === 'combat' ? {
        kernel: {
          routeDamage(packet) {
            applied.push(packet);
            return { ok: true };
          },
        },
      } : null),
    },
  });
  return { consequences, applied };
}

function makeShip(h, { x = 0, z = 0, vx = 0, vz = 0, mass = 40, radius = 12 } = {}) {
  return h.helpers.spawnEntity({
    type: 'ship', team: 1,
    pos: { x, z }, vel: { x: vx, z: vz }, angVel: 0.1,
    radius, mass, hull: 80, hullMax: 100,
    data: { defId: 'ship_test' },
  });
}

// A hard contact: huge exchanged momentum and closing speed so the kernel authors debrisCount
// above the tear-off rung (18 at the top of the ladder).
const HARD_CONTACT = {
  pos: { x: 5, z: 0 }, normal: { x: 1, z: 0 },
  preSolveClosingSpeed: 60, tick: 500, kind: 'contact',
};

function hardHit(consequences, victim, rammer, { momentum = 40000, tick = 500 } = {}) {
  return consequences._resolveContact(victim, rammer, HARD_CONTACT, momentum, tick, null, false);
}

function tearOffs(state) {
  return state.entityList.filter((e) => e && e.type === 'wreck' && e.data && e.data.collisionTearOff);
}

// The whole consequence path (and therefore tear-off) rides the production flag — tests seed
// it on and restore it, the same contract the sibling consequence tests use.
describe('collision tear-off', { concurrency: false }, () => {
  const previousFlag = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  process.on('exit', () => { COMBAT_FLAGS.weaponImpulseConsequences = previousFlag; });

  it('a hard damaging hit sheds a physical plating shard with inherited momentum', () => {
    resetPendingSlams();
    const h = bootHarness();
    const { consequences, applied } = bootSystem(h);
    const victim = makeShip(h, { vx: 30, vz: -8 });
    const rammer = makeShip(h, { x: 100, mass: 60 });
    const before = h.state.entityList.length;
    try {
      hardHit(consequences, victim, rammer);
      // _resolveContact resolves both hulls: the rammer also takes damage and sheds its own
      // plating — filter to the victim's shards for the one-sided assertions.
      const shards = tearOffs(h.state).filter((s) => s.data.collisionTearOffOf === victim.id);
      assert.ok(applied.length > 0, 'the hit actually dealt damage');
      assert.equal(shards.length, 2, 'a max-severity slam sheds both authored shards');
      const shard = shards[0];
      // Momentum inheritance: shard velocity carries the victim's frame velocity plus a fling.
      assert.ok(Math.abs(shard.vel.x - 30) + Math.abs(shard.vel.z - -8) > 0.1,
        'shard velocity differs from the victim by the separation fling');
      assert.ok(shard.vel.x < 30 || Math.abs(shard.vel.z) < Math.abs(-8) + 45,
        'fling stays inside the bounded envelope');
      assert.ok(shard.collides === true && shard.physicsBody, 'shard is a real physics body');
      assert.equal(shard.data.collisionTearOffOf, victim.id);
      assert.equal(shard.data.homeSectorId, 'sector-test');
      assert.equal(shard.data.persistenceOwner, 'collisionConsequences');
      assert.ok(shard.mass > 0.3 && shard.mass < 40 * 0.05, 'shard mass is a bounded hull fraction');
      assert.equal(h.state.entityList.length, before + 4, 'both hulls shed two shards');
    } finally {
      consequences.destroy();
      h.bus.clear();
      resetPendingSlams();
    }
  });

  it('soft contacts and lethal hits shed nothing', () => {
    resetPendingSlams();
    const h = bootHarness();
    const { consequences } = bootSystem(h);
    const victim = makeShip(h);
    const rammer = makeShip(h, { x: 100 });
    try {
      // Soft: momentum too low to cross the authored debris rung.
      hardHit(consequences, victim, rammer, { momentum: 20 });
      assert.equal(tearOffs(h.state).length, 0, 'a graze sheds no plating');
      // Lethal: damage kills the hull — the lethal fracture path owns the breakup.
      const dying = makeShip(h, { x: 50 });
      dying.alive = false;
      consequences._maybeTearOffPlating(dying, {
        debrisCount: 18, pos: { x: 0, z: 0 }, normal: { x: 1, z: 0 },
        exchangedMomentum: 40000, feelDeltaV: 60, deltaV: 40,
      }, { ok: true }, 500);
      assert.equal(tearOffs(h.state).length, 0, 'a kill sheds no tear-off (fracture owns it)');
      // No damage applied: a contact the kernel scored hard but the damage route rejected.
      const untouched = makeShip(h, { x: 60 });
      consequences._maybeTearOffPlating(untouched, {
        debrisCount: 18, pos: { x: 0, z: 0 }, normal: { x: 1, z: 0 },
        exchangedMomentum: 40000, feelDeltaV: 60, deltaV: 40,
      }, null, 500);
      assert.equal(tearOffs(h.state).length, 0, 'no applied damage, no plating');
    } finally {
      consequences.destroy();
      h.bus.clear();
      resetPendingSlams();
    }
  });

  it('per-victim cooldown and the live cap bound shard growth', () => {
    resetPendingSlams();
    const h = bootHarness();
    const { consequences } = bootSystem(h);
    const victim = makeShip(h);
    const rammer = makeShip(h, { x: 100 });
    const victimShards = () => tearOffs(h.state)
      .filter((s) => s.data.collisionTearOffOf === victim.id);
    try {
      hardHit(consequences, victim, rammer, { tick: 500 });
      assert.equal(victimShards().length, 2);
      hardHit(consequences, victim, rammer, { tick: 501 });
      assert.equal(victimShards().length, 2, 'cooldown suppresses the immediate repeat');
      hardHit(consequences, victim, rammer, { tick: 500 + 121 });
      assert.equal(victimShards().length, 4, 'a fresh slam after the cooldown sheds again');
      // Cap: fill the live set to TEAROFF_LIVE_CAP and confirm admission refuses.
      for (const shard of tearOffs(h.state)) shard.alive = true;
      for (let i = 0; i < 20; i++) {
        const fake = makeShip(h, { x: 200 + i });
        consequences._tearOffLive.add(fake.id);
      }
      const fresh = makeShip(h, { x: 400 });
      hardHit(consequences, fresh, rammer, { tick: 500 + 121 });
      assert.equal(
        tearOffs(h.state).filter((s) => s.data.collisionTearOffOf === fresh.id).length, 0,
        'live cap refuses new shards',
      );
      // Reap: killed shards leave the live set on the next update, reopening admission.
      for (const id of consequences._tearOffLive) {
        const e = h.state.entities.get(id);
        if (e) e.alive = false;
      }
      h.state.tick = 700;
      consequences.update(1 / 60, h.state);
      assert.equal(consequences._tearOffLive.size, 0, 'dead shards reap out of the live set');
      h.state.tick = 800;
      hardHit(consequences, fresh, rammer, { tick: 800 });
      assert.equal(
        tearOffs(h.state).filter((s) => s.data.collisionTearOffOf === fresh.id).length, 2,
        'reaping reopens admission',
      );
    } finally {
      consequences.destroy();
      h.bus.clear();
      resetPendingSlams();
    }
  });

  it('shard direction is deterministic for a seeded run', () => {
    const run = (seed) => {
      resetPendingSlams();
      const h = bootHarness(seed);
      const spawned = spawnCollisionTearOff(
        { state: h.state, helpers: h.helpers, bus: h.bus },
        {
          victimId: 1, tick: 9, pos: { x: 3, z: -2 }, normal: { x: 0, z: 1 },
          vel: { x: 10, z: 4 }, angVel: 0.2, mass: 50, radius: 10,
          momentum: 30000, closingSpeed: 50, count: 2,
        },
      );
      return spawned.map((s) => [
        Number(s.vel.x.toFixed(6)), Number(s.vel.z.toFixed(6)),
        Number(s.mass.toFixed(6)), Number(s.radius.toFixed(6)),
      ]);
    };
    const a = run(4242);
    const b = run(4242);
    const c = run(4243);
    assert.deepEqual(a, b, 'same seed, same shards');
    assert.notDeepEqual(a, c, 'a different seed picks different seams');
    assert.equal(a.length, 2, 'count 2 authors two shards');
  });
});
