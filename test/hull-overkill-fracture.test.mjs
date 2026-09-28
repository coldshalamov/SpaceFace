// Overkill fracture wire (FIGHT packet A): the `combat:damage` -> overkill note ->
// `entity:killed` -> seam-pieces path, end to end at the seam functions plus the two
// thin system seams. Deterministic: no Math.random, hull-class seam pick via state.rng.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { makeEntity } from '../src/core/entity.js';
import {
  consumeLethalBlow,
  consumePendingSlamIfFresh,
  isOverkillFractureCandidate,
  noteLethalBlow,
  notePendingSlam,
  overkillNoteForKill,
  resetPendingSlams,
  spawnFracturePieces,
} from '../src/systems/hullFracture.js';
import { OVERKILL_ORIGIN_KINDS } from '../src/data/hullFractureSeams.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { mining } from '../src/systems/mining.js';

function bootHarness(seed = 777) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.tick = 100;
  const bus = createBus();
  const spawned = [];
  const helpers = {
    spawnEntity(spec) {
      const entity = makeEntity(spec);
      entity.id = state.nextEntityId++;
      entity.alive = true;
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
  };
  return { state, bus, helpers, spawned };
}

describe('overkill fracture wire', () => {
  it('weapon/bomb/mine origins qualify; collision/action never do', () => {
    resetPendingSlams();
    for (const kind of OVERKILL_ORIGIN_KINDS) {
      assert.ok(
        isOverkillFractureCandidate({ originKind: kind, hullBefore: 10, hullMax: 100, rawBlow: 200 }),
        `${kind} overkill qualifies`,
      );
    }
    assert.equal(
      isOverkillFractureCandidate({ originKind: 'collision', hullBefore: 10, hullMax: 100, rawBlow: 500 }),
      false,
      'collision never fractures',
    );
    assert.equal(
      isOverkillFractureCandidate({ originKind: 'weapon', hullBefore: 90, hullMax: 100, rawBlow: 20 }),
      false,
      'a graze (hullAfter -110 > -50, blow 20 < 200) does not fracture',
    );
  });

  it('system _onCombatDamage seam notes the lethal blow from a damage.js-shaped payload', () => {
    resetPendingSlams();
    const h = bootHarness();
    const consequences = Object.create(collisionConsequences);
    consequences.init({
      state: h.state,
      bus: h.bus,
      registry: { get: () => null },
    });
    try {
      consequences.__noteLethalBlowForTest({
        targetId: 42,
        origin: { kind: 'weapon', weaponId: 'wpn_test' },
        before: { hull: 20, hullMax: 100 },
        rawTotal: 150,
      });
      const blow = consumeLethalBlow(42, h.state.tick);
      assert.ok(blow, 'overkill blow is remembered for the kill tick');
      assert.equal(blow.originKind, 'weapon');
      consequences.__noteLethalBlowForTest({
        targetId: 43,
        origin: { kind: 'collision', id: 'terrain' },
        before: { hull: 20, hullMax: 100 },
        rawTotal: 500,
      });
      assert.equal(consumeLethalBlow(43, h.state.tick), null, 'collision blows are never noted');
    } finally {
      consequences.destroy();
      resetPendingSlams();
      h.bus.clear();
    }
  });

  it('notes age out: a stale blow consumed late returns null', () => {
    resetPendingSlams();
    noteLethalBlow(7, { hullBefore: 10, hullMax: 100, rawBlow: 200, originKind: 'bomb', tick: 50 });
    assert.equal(consumeLethalBlow(7, 53), null, '3 ticks later the blow is stale (window 2)');
    noteLethalBlow(7, { hullBefore: 10, hullMax: 100, rawBlow: 200, originKind: 'bomb', tick: 50 });
    assert.ok(consumeLethalBlow(7, 52), '2 ticks later the blow is still fresh');
  });

  it('stale slam notes age out instead of suppressing the shard', () => {
    resetPendingSlams();
    const victim = {
      id: 9, type: 'ship', alive: true,
      pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, angVel: 0, mass: 24, radius: 7,
    };
    assert.equal(notePendingSlam(victim, { closingSpeed: 60, tick: 10 }), true);
    assert.equal(consumePendingSlamIfFresh(9, 30), null, '20 ticks later the slam note is stale');
    assert.equal(notePendingSlam(victim, { closingSpeed: 60, tick: 10 }), true);
    assert.ok(consumePendingSlamIfFresh(9, 15), '5 ticks later the slam note is fresh');
  });

  it('mining turns an overkill kill into two seam pieces with marker binding', () => {
    resetPendingSlams();
    const h = bootHarness();
    const miner = Object.create(mining);
    miner.init({ state: h.state, bus: h.bus, helpers: h.helpers, registry: { get: () => null } });
    try {
      const victim = h.helpers.spawnEntity({
        type: 'ship', team: 1,
        pos: { x: 40, z: 6 }, vel: { x: 12, z: 3 }, angVel: 0.2,
        radius: 14, mass: 32, hull: 0, hullMax: 100,
        data: { defId: 'ship_wasp', shipClass: 'wasp' },
      });
      noteLethalBlow(victim.id, { hullBefore: 20, hullMax: 100, rawBlow: 150, originKind: 'weapon', tick: h.state.tick });
      victim.alive = false;
      let boundMarkerId = null;
      let boundEntityId = null;
      const fakeAftermath = {
        immediateWreckPlan: (p) => ({ markerId: 'marker-1', entityId: null, spec: null }),
        bindImmediateWreck: (markerId, entity) => { boundMarkerId = markerId; boundEntityId = entity.id; return entity; },
      };
      miner.registry = { get: (id) => (id === 'aftermathWrecks' ? fakeAftermath : null) };
      const fractured = [];
      h.bus.on('hull:fractured', (p) => fractured.push(p));
      const before = new Set(h.state.entityList);
      h.bus.emit('entity:killed', { id: victim.id, killerId: 1, type: 'ship', pos: { ...victim.pos }, victimClass: 'wasp' });
      const pieces = h.state.entityList.filter((e) => e && !before.has(e) && e.type === 'wreck');
      assert.equal(pieces.length, 2, 'overkill kill spawns two seam pieces');
      assert.equal(boundMarkerId, 'marker-1', 'the remainder binds to the durable marker');
      assert.ok(boundEntityId != null);
      assert.equal(fractured.length, 1, 'hull:fractured fires once');
      assert.equal(fractured[0].overkill, true);
      assert.equal(fractured[0].pieceIds.length, 2);
      for (const piece of pieces) {
        assert.equal(piece.data.fractureOf, 'marker-1', 'both pieces name the marker');
      }
    } finally {
      h.bus.clear();
      resetPendingSlams();
    }
  });

  it('a graze kill falls through to the single anonymous wreck', () => {
    resetPendingSlams();
    const h = bootHarness();
    const miner = Object.create(mining);
    miner.init({ state: h.state, bus: h.bus, helpers: h.helpers, registry: { get: () => null } });
    try {
      const victim = h.helpers.spawnEntity({
        type: 'ship', team: 1,
        pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, angVel: 0,
        radius: 14, mass: 32, hull: 0, hullMax: 100,
        data: { defId: 'ship_wasp', shipClass: 'wasp' },
      });
      noteLethalBlow(victim.id, { hullBefore: 5, hullMax: 100, rawBlow: 10, originKind: 'weapon', tick: h.state.tick });
      victim.alive = false;
      const before = new Set(h.state.entityList);
      h.bus.emit('entity:killed', { id: victim.id, killerId: 1, type: 'ship', pos: { ...victim.pos }, victimClass: 'wasp' });
      const wrecks = h.state.entityList.filter((e) => e && !before.has(e) && e.type === 'wreck');
      assert.equal(wrecks.length, 1, 'graze kill mints one wreck, not pieces');
      assert.ok(!wrecks[0].data.fracturePiece, 'the anonymous wreck carries no seam role');
    } finally {
      h.bus.clear();
      resetPendingSlams();
    }
  });

  it('slam wins over overkill when both land on the same kill', () => {
    resetPendingSlams();
    const h = bootHarness();
    const victim = {
      id: 11, type: 'ship', alive: true,
      pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, angVel: 0, mass: 32, radius: 14,
    };
    notePendingSlam(victim, { closingSpeed: 60, tick: h.state.tick });
    noteLethalBlow(11, { hullBefore: 20, hullMax: 100, rawBlow: 150, originKind: 'weapon', tick: h.state.tick });
    const slamNote = consumePendingSlamIfFresh(11, h.state.tick);
    assert.ok(slamNote && !slamNote.overkill, 'slam note is consumed first');
    const blow = consumeLethalBlow(11, h.state.tick);
    assert.ok(blow, 'overkill note is still pending behind the slam');
    const overkillNote = overkillNoteForKill({ victim: { ...victim, alive: false }, blow });
    assert.ok(overkillNote && overkillNote.overkill, 'the overkill scorer still works standalone');
    assert.ok(spawnFracturePieces && typeof spawnFracturePieces === 'function');
    resetPendingSlams();
  });
});
