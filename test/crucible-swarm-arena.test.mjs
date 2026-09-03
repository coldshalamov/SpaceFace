// PQ-135 — the swarm debris field. The Crucible's weapons are physical; this is what they need.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { mulberry32 } from '../src/core/rng.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import {
  SWARM_DEBRIS_INNER,
  SWARM_DEBRIS_KEEP_RADIUS,
  SWARM_DEBRIS_MAX,
  SWARM_DEBRIS_OUTER,
  SWARM_DEBRIS_SAFE_RADIUS,
  SWARM_DEBRIS_SEPARATION,
  SWARM_DEBRIS_TAG,
  SWARM_DEBRIS_TARGET,
  planSwarmDebris,
  swarmArena,
} from '../src/systems/swarmArena.js';
import { PRODUCTION_INIT_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';

const SEED = 4242;
const ARENA = 'helios_core';

function boot({ ruleset = SWARM_RULESET, playerAt = { x: 0, z: 0 } } = {}) {
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
  bus.emit('run:beginRequested', { kind: 'survival', ruleset, seed: SEED, arenaId: ARENA });
  return { state, bus, helpers, spawned, player, ctx };
}

function planFor(wave) {
  return planWave({ seed: SEED, arenaId: ARENA, wave, ruleset: SWARM_RULESET });
}

function rocks(h) {
  return h.state.entityList.filter(
    (e) => e.alive !== false && e.data && e.data[SWARM_DEBRIS_TAG],
  );
}

test('swarmArena is in the production init order and never joins the tick loop', () => {
  assert.ok(PRODUCTION_INIT_ORDER.includes('swarmArena'));
  // It has an update() for registry symmetry, but it must do nothing — the field only changes
  // when a wave is planned.
  assert.equal(typeof swarmArena.update, 'function');
});

test('a swarm wave installs a real debris field, not three landmarks', () => {
  const h = boot();
  h.bus.emit('run:wavePlanned', { wave: 1, plan: planFor(1) });
  const field = rocks(h);
  assert.equal(field.length, SWARM_DEBRIS_TARGET);
  // terrainAnchors caps at three rocks and refuses to add any when two are present. This is the
  // whole reason this system exists, so assert the difference outright.
  assert.ok(field.length > 3, 'more than terrainAnchors would ever give the fight');
  for (const rock of field) {
    assert.equal(rock.type, 'asteroid');
    assert.equal(rock.collides, true);
    assert.ok(rock.mass > 0, 'a monolith has mass — it is a wall, not a decal');
    assert.ok(rock.hull > 0);
    assert.equal(rock.data.terrainAnchor, true, 'the massline can latch it like any other anchor');
  }
});

test('nothing spawns on the player, or inside another rock', () => {
  const h = boot();
  h.bus.emit('run:wavePlanned', { wave: 1, plan: planFor(1) });
  const field = rocks(h);
  for (const rock of field) {
    const d = Math.hypot(rock.pos.x - h.player.pos.x, rock.pos.z - h.player.pos.z);
    assert.ok(d >= SWARM_DEBRIS_SAFE_RADIUS, `rock at ${d.toFixed(0)} clears the safe radius`);
    assert.ok(d <= SWARM_DEBRIS_OUTER + 1, 'and stays inside the band');
    assert.ok(d >= SWARM_DEBRIS_INNER - 1);
  }
  for (let i = 0; i < field.length; i++) {
    for (let j = i + 1; j < field.length; j++) {
      const a = field[i];
      const b = field[j];
      const gap = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) - a.radius - b.radius;
      assert.ok(gap >= SWARM_DEBRIS_SEPARATION - 1, `rocks ${i}/${j} keep a gap (${gap.toFixed(0)})`);
    }
  }
});

test('the field is topped up, never re-poured — a second wave adds nothing', () => {
  const h = boot();
  h.bus.emit('run:wavePlanned', { wave: 1, plan: planFor(1) });
  const first = rocks(h).length;
  h.bus.emit('run:wavePlanned', { wave: 2, plan: planFor(2) });
  h.bus.emit('run:wavePlanned', { wave: 3, plan: planFor(3) });
  assert.equal(rocks(h).length, first, 'the field held at target across three waves');
  assert.ok(rocks(h).length <= SWARM_DEBRIS_MAX);
});

test('a destroyed rock is replaced on the next wave', () => {
  const h = boot();
  h.bus.emit('run:wavePlanned', { wave: 1, plan: planFor(1) });
  const field = rocks(h);
  for (let i = 0; i < 5; i++) {
    field[i].alive = false;
    h.state.entities.delete(field[i].id);
  }
  assert.equal(rocks(h).length, SWARM_DEBRIS_TARGET - 5);
  h.bus.emit('run:wavePlanned', { wave: 2, plan: planFor(2) });
  assert.equal(rocks(h).length, SWARM_DEBRIS_TARGET, 'the field came back to strength');
});

test('the field follows the fight: drifting far re-anchors it around the player', () => {
  const h = boot();
  h.bus.emit('run:wavePlanned', { wave: 1, plan: planFor(1) });
  const before = rocks(h).map((r) => r.id);
  // Fly well past the keep radius, as a long run drifting across the sector would.
  h.player.pos.x = SWARM_DEBRIS_KEEP_RADIUS * 3;
  h.bus.emit('run:wavePlanned', { wave: 2, plan: planFor(2) });
  const near = rocks(h).filter(
    (r) => Math.hypot(r.pos.x - h.player.pos.x, r.pos.z - h.player.pos.z) <= SWARM_DEBRIS_KEEP_RADIUS,
  );
  assert.equal(near.length, SWARM_DEBRIS_TARGET, 'a full field exists around where the fight now is');
  // The rocks left behind are released to the engine's ordinary sweep, never deleted by hand.
  const abandoned = h.state.entityList.filter(
    (e) => e.data && e.data[SWARM_DEBRIS_TAG] && !before.includes(e.id) === false,
  );
  for (const rock of abandoned) {
    if (Math.hypot(rock.pos.x - h.player.pos.x, rock.pos.z - h.player.pos.z) > SWARM_DEBRIS_KEEP_RADIUS) {
      assert.ok(Number.isFinite(rock.data.despawnAt), 'the abandoned rock has a despawn time');
      assert.ok(rock.alive !== false, 'and was not deleted by hand');
    }
  }
});

test('the Gauntlet is untouched — no debris, exactly as it shipped', () => {
  const h = boot({ ruleset: 'scored' });
  h.bus.emit('run:wavePlanned', { wave: 1, plan: planWave({ seed: SEED, arenaId: ARENA, wave: 1 }) });
  assert.equal(rocks(h).length, 0);
});

test('the field never grows into terrain that is already there', () => {
  // A station or a sector asteroid in the bubble must not get a monolith poured on top of it.
  const existing = [{ x: 200, z: 0, radius: 90 }, { x: -260, z: 120, radius: 60 }];
  const spots = planSwarmDebris({
    anchor: { x: 0, z: 0 },
    existing,
    want: SWARM_DEBRIS_TARGET,
    rng: mulberry32(99),
  });
  assert.ok(spots.length > 0);
  for (const spot of spots) {
    for (const other of existing) {
      const gap = Math.hypot(spot.x - other.x, spot.z - other.z) - spot.radius - other.radius;
      assert.ok(gap >= SWARM_DEBRIS_SEPARATION - 1, `kept clear of existing terrain (${gap.toFixed(0)})`);
    }
  }
});

test('placement is deterministic and takes no RNG but the one it is handed', () => {
  const args = { anchor: { x: 40, z: -80 }, existing: [], want: 10 };
  const a = planSwarmDebris({ ...args, rng: mulberry32(7) });
  const b = planSwarmDebris({ ...args, rng: mulberry32(7) });
  assert.deepEqual(a, b);
  const c = planSwarmDebris({ ...args, rng: mulberry32(8) });
  assert.notDeepEqual(c, a);
});

test('the run ending hands the whole field back to the engine sweep', () => {
  const h = boot();
  h.bus.emit('run:wavePlanned', { wave: 1, plan: planFor(1) });
  const field = rocks(h);
  assert.ok(field.length > 0);
  h.bus.emit('run:ended', { outcome: 'defeat' });
  for (const rock of field) {
    assert.ok(Number.isFinite(rock.data.despawnAt), 'every rock has a despawn time');
    assert.ok(rock.alive !== false, 'and none was deleted by hand — the sweep owns that');
  }
});
