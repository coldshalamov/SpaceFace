import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { MASSLINE2_FLAGS, snapshotFeatureMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { terrainAnchors } from '../src/systems/terrainAnchors.js';

// VERB-07 — rocks dropped for the opening hauler raid are not wiped by the ordinary
// 45-second encounter aftermath. They stay until the player leaves the neighbourhood
// (sector teardown owns them), while every other encounter's anchors still take the sweep.

function boot() {
  const snap = snapshotFeatureMaps();
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.terrainAnchors = true;
  const state = createGameState(47);
  state.simTime = 30;
  state.entityList = [];
  const bus = createBus();
  const spawned = [];
  let nextId = 100;
  const helpers = {
    hash32,
    mulberry32,
    spawnEntity(spec) {
      const entity = { id: nextId++, alive: true, ...spec };
      spawned.push(entity);
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const system = Object.create(terrainAnchors);
  system.init({ state, bus, helpers });
  return { state, bus, system, spawned, snap };
}

function teardown(system, bus, snap) {
  system.destroy?.();
  bus.clear();
  restoreFeatureMaps(snap);
}

test('the opening fight keeps its rocks past 45 seconds', () => {
  const { state, bus, system, spawned, snap } = boot();
  try {
    bus.emit('encounter:telegraph', {
      encounterId: 'raid_1', kind: 'opening_hauler_raid', pos: { x: 400, z: -200 },
    });
    assert.ok(spawned.length >= 2, `expected raid anchors, got ${spawned.length}`);
    for (const rock of spawned) assert.equal(rock.data.neighbourhoodAnchor, true);

    bus.emit('encounter:resolved', { encounterId: 'raid_1', shape: 'opening_hauler_raid' });
    for (const rock of spawned) {
      assert.equal(rock.data.terrainAnchorEncounterIds.length, 0);
      assert.equal(rock.data.despawnAt, undefined, 'raid rocks took the 45s aftermath wipe');
      assert.equal(rock.data.neighbourhoodAnchor, true);
    }

    // Walking the clock far past the aftermath window leaves the rocks in the world —
    // only sector teardown takes them now.
    state.simTime = 30 + 900;
    system.update(1, state);
    for (const rock of spawned) assert.equal(rock.alive, true);
  } finally {
    const { bus: b, system: s } = { bus, system };
    teardown(s, b, snap);
  }
});

test('ordinary encounter anchors still take the 45s sweep beside the raid rocks', () => {
  const { state, bus, system, spawned, snap } = boot();
  try {
    bus.emit('encounter:telegraph', { encounterId: 'enc_plain', kind: 'skirmish', pos: { x: 4000, z: 0 } });
    const plain = spawned.splice(0);
    bus.emit('encounter:resolved', { encounterId: 'enc_plain', shape: 'skirmish' });
    for (const rock of plain) {
      assert.ok(rock.data.despawnAt <= state.simTime + 45, 'plain anchors must still expire');
      assert.notEqual(rock.data.neighbourhoodAnchor, true);
    }
  } finally {
    teardown(system, bus, snap);
  }
});

test('a rock shared with a later encounter still survives once the raid mark is on it', () => {
  const { state, bus, system, spawned, snap } = boot();
  try {
    bus.emit('encounter:telegraph', {
      encounterId: 'raid_1', kind: 'opening_hauler_raid', pos: { x: 400, z: -200 },
    });
    const raidRocks = spawned.splice(0);
    // A second fight telegraphs over the same bubble: it adopts the raid rocks and spawns
    // its own shortfall beside them.
    bus.emit('encounter:telegraph', { encounterId: 'enc_2', kind: 'skirmish', pos: { x: 420, z: -180 } });
    const shared = raidRocks.filter((r) => r.data.terrainAnchorEncounterIds.includes('enc_2'));
    assert.ok(shared.length >= 1, 'no raid rock was shared with the second encounter');

    // The raid ends while the second fight still owns the shared rocks — no wipe.
    bus.emit('encounter:resolved', { encounterId: 'raid_1', shape: 'opening_hauler_raid' });
    for (const rock of shared) assert.ok(rock.data.despawnAt > state.simTime + 45
      || rock.data.despawnAt === undefined, 'shared raid rock wiped while still owned');

    // The second fight ends: ownership empties, but the neighbourhood mark keeps the rocks.
    bus.emit('encounter:resolved', { encounterId: 'enc_2', shape: 'skirmish' });
    for (const rock of raidRocks) {
      assert.equal(rock.data.terrainAnchorEncounterIds.length, 0);
      assert.equal(rock.data.despawnAt, undefined, 'neighbourhood rock took the sweep late');
    }
  } finally {
    teardown(system, bus, snap);
  }
});

test('a raid-adopted rock survives even when an unrelated owner resolves last', () => {
  const { state, bus, system, spawned, snap } = boot();
  try {
    bus.emit('encounter:telegraph', { encounterId: 'enc_1', kind: 'skirmish', pos: { x: 400, z: -200 } });
    const rocks = spawned.splice(0);
    bus.emit('encounter:telegraph', {
      encounterId: 'raid_1', kind: 'opening_hauler_raid', pos: { x: 420, z: -180 },
    });
    const adopted = rocks.filter((r) => r.data.terrainAnchorEncounterIds.includes('raid_1'));
    assert.ok(adopted.length >= 1, 'the raid adopted none of the rocks');
    for (const rock of adopted) assert.equal(rock.data.neighbourhoodAnchor, true);

    // The raid ends first — the foreign owner still holds the rocks, so no wipe either way.
    bus.emit('encounter:resolved', { encounterId: 'raid_1', shape: 'opening_hauler_raid' });
    for (const rock of adopted) assert.ok(rock.data.terrainAnchorEncounterIds.includes('enc_1'));

    // The last owner is an ordinary fight — the neighbourhood mark still keeps the rocks.
    bus.emit('encounter:resolved', { encounterId: 'enc_1', shape: 'skirmish' });
    for (const rock of adopted) {
      assert.equal(rock.data.terrainAnchorEncounterIds.length, 0);
      assert.equal(rock.data.despawnAt, undefined, 'raid-adopted rock wiped by a late unrelated owner');
    }
  } finally {
    teardown(system, bus, snap);
  }
});

test('the raid adopting an already-clamped rock lifts the wipe', () => {
  const { state, bus, system, spawned, snap } = boot();
  try {
    bus.emit('encounter:telegraph', { encounterId: 'enc_1', kind: 'skirmish', pos: { x: 400, z: -200 } });
    const rocks = spawned.splice(0);
    bus.emit('encounter:resolved', { encounterId: 'enc_1', shape: 'skirmish' });
    for (const rock of rocks) assert.ok(rock.data.despawnAt <= state.simTime + 45);

    // The opening raid fires inside the same bubble: it adopts the doomed rocks and any
    // shortfall it spawns is marked neighbourhood.
    bus.emit('encounter:telegraph', {
      encounterId: 'raid_1', kind: 'opening_hauler_raid', pos: { x: 420, z: -180 },
    });
    const adopted = rocks.filter((r) => r.data.terrainAnchorEncounterIds.includes('raid_1'));
    assert.ok(adopted.length >= 1, 'the raid adopted none of the doomed rocks');

    bus.emit('encounter:resolved', { encounterId: 'raid_1', shape: 'opening_hauler_raid' });
    for (const rock of adopted) {
      assert.equal(rock.data.despawnAt, undefined, 'adopted rock kept its 45s doom timer');
      assert.equal(rock.data.neighbourhoodAnchor, true);
    }
    // Rocks the raid never adopted keep their ordinary sweep — the rescue is scoped.
    for (const rock of rocks.filter((r) => !adopted.includes(r))) {
      assert.ok(rock.data.despawnAt <= state.simTime + 45, 'unadopted rock lost its sweep');
    }
  } finally {
    teardown(system, bus, snap);
  }
});
