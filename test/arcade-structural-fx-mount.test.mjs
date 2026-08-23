// PQ-134.01 — ArcadeStructuralFx mounted behind cueArbitration.
//
// Proves the live request path: kill / hard-collision / bank-shot receipts admit through
// deriveVfxAdmissionMetadata, spawn into the fixed-capacity pool, honour table cull and
// reduced-motion, expose per-family high-water, and dispose on context loss.
// Does not mint a presentation recipe or move lane-budget totals.

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import {
  admitStructuralFxCue,
  CUE_BUDGET_DECLARATION,
  CUE_LANE_BUDGETS,
  CUE_LANE_CRITICAL_RESERVE,
  STRUCTURAL_FX_CUE_KIND,
  STRUCTURAL_FX_FAMILIES,
  structuralFxFamilyFromReceipt,
} from '../src/presentation/cueArbitration.js';
import { deriveVfxAdmissionMetadata } from '../src/presentation/vfxAdmissionPriority.js';
import {
  ARCADE_STRUCTURAL_FX_CAPACITY,
} from '../src/render/combat/arcadeStructuralFx.js';
import { vfx } from '../src/render/vfx.js';

const PLAYER_ID = 1;
const TARGET_ID = 9;

function makeCanvas() {
  const listeners = [];
  return {
    addEventListener(type, fn) { listeners.push({ type, fn }); },
    removeEventListener(type, fn) {
      for (let i = listeners.length - 1; i >= 0; i--) {
        if (listeners[i].type === type && listeners[i].fn === fn) listeners.splice(i, 1);
      }
    },
    dispatchEvent(event) {
      const type = event && event.type;
      for (const listener of listeners) {
        if (listener.type === type) listener.fn(event);
      }
      return true;
    },
  };
}

function makeVfxHarness({ motionReduce = false, flashReduce = false, withCanvas = false } = {}) {
  const scene = new THREE.Scene();
  const player = {
    id: PLAYER_ID,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 4, z: 1 },
    rot: 0,
    radius: 6,
  };
  const target = {
    id: TARGET_ID,
    type: 'ship',
    alive: true,
    pos: { x: 8, z: 3 },
    vel: { x: -2, z: 0 },
    rot: 0,
    radius: 8,
  };
  const canvas = withCanvas ? makeCanvas() : null;
  const state = {
    playerId: PLAYER_ID,
    player: { targetId: TARGET_ID },
    entities: new Map([[PLAYER_ID, player], [TARGET_ID, target]]),
    entityList: [player, target],
    simTime: 12,
    tick: 720,
    settings: {
      video: { particleQuality: 'low', motionReduce, engineTrails: false },
      accessibility: { flashReduce },
    },
    render: {
      scene,
      renderer: canvas ? { domElement: canvas } : null,
    },
  };
  const bus = createBus();
  const system = Object.create(vfx);
  system.init({ state, bus, helpers: { player: () => player } });
  return { system, state, bus, player, target, scene, canvas };
}

function spawned(system) {
  const info = system.inspect().arcadeStructuralFx;
  if (!info || !info.pools) return { blades: 0, arcs: 0, shards: 0 };
  return {
    blades: info.pools.blades.spawned,
    arcs: info.pools.arcs.spawned,
    shards: info.pools.shards.spawned,
  };
}

function emitKill(bus, overrides = {}) {
  bus.emit('entity:killed', {
    id: TARGET_ID,
    killerId: PLAYER_ID,
    type: 'ship',
    pos: { x: 8, z: 3 },
    radius: 8,
    vel: { x: -2, z: 0 },
    direction: { x: 1, z: 0.2 },
    ...overrides,
  });
}

// ── cueArbitration kind (no recipe, no budget move) ───────────────────────────

test('structural-fx cue kind is declared without moving lane budgets', () => {
  assert.equal(STRUCTURAL_FX_CUE_KIND, 'vfx.arcade_structural');
  assert.equal(CUE_BUDGET_DECLARATION.structuralFx.kind, STRUCTURAL_FX_CUE_KIND);
  assert.equal(CUE_BUDGET_DECLARATION.instancing.arcadeStructuralFx, 'src/render/combat/arcadeStructuralFx.js');
  assert.equal(CUE_BUDGET_DECLARATION.structuralFx.laneBudgetsCharged, false);
  assert.equal(CUE_BUDGET_DECLARATION.lanes.camera, 3);
  assert.equal(CUE_BUDGET_DECLARATION.lanes.vfx, 8);
  assert.equal(CUE_BUDGET_DECLARATION.lanes.audio, 6);
  assert.equal(CUE_BUDGET_DECLARATION.lanes.ui, 6);
  assert.equal(CUE_BUDGET_DECLARATION.lanes.accessibility, 6);
  assert.deepEqual(CUE_BUDGET_DECLARATION.lanes, CUE_LANE_BUDGETS);
  assert.deepEqual(CUE_BUDGET_DECLARATION.criticalReserve, CUE_LANE_CRITICAL_RESERVE);
  assert.equal(CUE_LANE_CRITICAL_RESERVE.camera, 1);
  assert.equal(CUE_LANE_CRITICAL_RESERVE.vfx, 3);
});

test('admitStructuralFxCue classifies kill, hard collision, and bank, and refuses the rest', () => {
  const state = {
    playerId: PLAYER_ID,
    player: { targetId: TARGET_ID },
    entities: new Map([[PLAYER_ID, { id: PLAYER_ID, pos: { x: 0, z: 0 } }]]),
  };
  const kill = admitStructuralFxCue('entity:killed', {
    id: TARGET_ID, killerId: PLAYER_ID, pos: { x: 6, z: 2 },
  }, state);
  assert.equal(kill.kind, STRUCTURAL_FX_CUE_KIND);
  assert.equal(kill.family, STRUCTURAL_FX_FAMILIES.kill);
  assert.equal(kill.playerCaused, true);
  const expected = deriveVfxAdmissionMetadata({
    id: TARGET_ID, killerId: PLAYER_ID, pos: { x: 6, z: 2 },
  }, state);
  assert.equal(kill.admissionPriority, expected.admissionPriority);

  assert.equal(structuralFxFamilyFromReceipt('combat:collisionConsequence', { control: 'tumble' }), 'collision');
  assert.equal(structuralFxFamilyFromReceipt('combat:collisionConsequence', { control: 'stagger' }), null);
  assert.equal(admitStructuralFxCue('combat:collisionConsequence', { control: 'stagger' }, state), null);

  assert.equal(structuralFxFamilyFromReceipt('projectile:bank', { pos: { x: 1, z: 1 } }), 'bank');
  assert.equal(structuralFxFamilyFromReceipt('projectile:hit', { bounce: true }), 'bank');
  assert.equal(structuralFxFamilyFromReceipt('projectile:hit', { pos: { x: 1, z: 1 } }), null);
  assert.ok(admitStructuralFxCue('combat:bankShot', { pos: { x: 2, z: 1 }, ownerId: PLAYER_ID }, state));
});

test('player-caused kill admits above an unrelated distant kill', () => {
  const state = {
    playerId: PLAYER_ID,
    player: { targetId: TARGET_ID },
    entities: new Map([[PLAYER_ID, { id: PLAYER_ID, pos: { x: 0, z: 0 } }]]),
  };
  const hero = admitStructuralFxCue('entity:killed', {
    id: TARGET_ID, killerId: PLAYER_ID, pos: { x: 4, z: 0 },
  }, state);
  const distant = admitStructuralFxCue('entity:killed', {
    id: 77, killerId: 44, pos: { x: 400, z: 0 },
  }, state);
  assert.ok(hero.admissionPriority > distant.admissionPriority);
});

// ── live mount ────────────────────────────────────────────────────────────────

test('entity:killed requests blades, arcs, and shards through cue admission', () => {
  const { system, bus } = makeVfxHarness();
  const before = spawned(system);
  emitKill(bus);
  const after = spawned(system);
  assert.ok(after.blades > before.blades, `kill must spawn blades, delta ${after.blades - before.blades}`);
  assert.ok(after.arcs > before.arcs, 'kill must spawn arcs');
  assert.ok(after.shards > before.shards, 'kill must spawn shards');
  const stats = system.inspect().arcadeStructuralFxStats;
  assert.ok(stats.blades.highWater > 0);
  assert.ok(stats.blades.highWater <= ARCADE_STRUCTURAL_FX_CAPACITY.blades);
  assert.ok(stats.arcs.highWater <= ARCADE_STRUCTURAL_FX_CAPACITY.arcs);
  assert.ok(stats.shards.highWater <= ARCADE_STRUCTURAL_FX_CAPACITY.shards);
  assert.equal(stats.blades.capacity, ARCADE_STRUCTURAL_FX_CAPACITY.blades);
  system.destroy();
});

test('hard collision requests arcs and shards and no blades; stagger does not', () => {
  const { system, bus } = makeVfxHarness();
  const baseline = spawned(system);
  bus.emit('combat:collisionConsequence', {
    targetId: TARGET_ID,
    control: 'stagger',
    impactDamage: 4,
    deltaV: 12,
    pos: { x: 6, z: -2 },
    surface: 'craft',
    normal: { x: 1, z: 0 },
  });
  assert.deepEqual(spawned(system), baseline, 'stagger must not request structural primitives');

  bus.emit('combat:collisionConsequence', {
    targetId: TARGET_ID,
    control: 'tumble',
    impactDamage: 8,
    deltaV: 28,
    pos: { x: 6, z: -2 },
    surface: 'craft',
    normal: { x: 0.8, z: 0.6 },
  });
  const after = spawned(system);
  assert.equal(after.blades, baseline.blades, 'hard collision must not spawn blades');
  assert.ok(after.arcs > baseline.arcs, 'hard collision must spawn arcs');
  assert.ok(after.shards > baseline.shards, 'hard collision must spawn shards');
  system.destroy();
});

test('bank shot requests blades, arcs, and shards', () => {
  const { system, bus } = makeVfxHarness();
  const before = spawned(system);
  bus.emit('projectile:bank', {
    targetId: TARGET_ID,
    ownerId: PLAYER_ID,
    pos: { x: 5, z: 2 },
    approach: { x: 1, z: 0 },
    radius: 4,
  });
  const after = spawned(system);
  assert.ok(after.blades > before.blades, 'bank shot must spawn blades');
  assert.ok(after.arcs > before.arcs, 'bank shot must spawn arcs');
  assert.ok(after.shards > before.shards, 'bank shot must spawn shards');
  system.destroy();
});

test('flagged projectile:hit is a bank; an ordinary hit is not', () => {
  const { system, bus } = makeVfxHarness();
  const before = spawned(system);
  bus.emit('projectile:hit', {
    targetId: TARGET_ID,
    ownerId: PLAYER_ID,
    pos: { x: 5, z: 2 },
    approach: { x: 1, z: 0 },
    damage: 4,
  });
  assert.equal(spawned(system).blades, before.blades, 'ordinary hit must not request blades');

  bus.emit('projectile:hit', {
    targetId: TARGET_ID,
    ownerId: PLAYER_ID,
    pos: { x: 5, z: 2 },
    approach: { x: 0, z: 1 },
    bounce: true,
  });
  assert.ok(spawned(system).blades > before.blades, 'bounce hit must request bank blades');
  system.destroy();
});

test('reduced-motion kill requests fewer blades than the full-motion kill', () => {
  const full = makeVfxHarness();
  const reduced = makeVfxHarness({ motionReduce: true });
  emitKill(full.bus);
  emitKill(reduced.bus);
  const fullSpawned = spawned(full.system).blades;
  const reducedSpawned = spawned(reduced.system).blades;
  assert.ok(fullSpawned > 0);
  assert.ok(reducedSpawned > 0);
  assert.ok(reducedSpawned < fullSpawned, `reduced ${reducedSpawned} must be below full ${fullSpawned}`);
  full.system.destroy();
  reduced.system.destroy();
});

test('off-table kill is culled and does not grow the pool', () => {
  const { system, bus } = makeVfxHarness();
  const before = spawned(system);
  emitKill(bus, { pos: { x: 80000, z: 80000 } });
  assert.deepEqual(spawned(system), before);
  system.destroy();
});

test('stats high-water per family never exceeds fixed capacity after a burst', () => {
  const { system, bus } = makeVfxHarness();
  for (let i = 0; i < 12; i++) emitKill(bus, { id: 100 + i, pos: { x: i * 0.4, z: 1 } });
  const stats = system.inspect().arcadeStructuralFxStats;
  for (const kind of ['blades', 'arcs', 'shards']) {
    assert.ok(stats[kind].highWater > 0, `${kind} high-water must move`);
    assert.ok(stats[kind].highWater <= ARCADE_STRUCTURAL_FX_CAPACITY[kind]);
    assert.equal(stats[kind].capacity, ARCADE_STRUCTURAL_FX_CAPACITY[kind]);
  }
  system.destroy();
});

test('WebGL context loss disposes the pool; the next kill remounts it', () => {
  const { system, bus, canvas } = makeVfxHarness({ withCanvas: true });
  emitKill(bus);
  assert.ok(spawned(system).blades > 0);
  const group = system._arcadeStructural.group;
  assert.ok(group.parent, 'pool must be in the scene before loss');
  canvas.dispatchEvent({ type: 'webglcontextlost' });
  assert.equal(system.inspect().arcadeStructuralFx, null);
  assert.equal(group.parent, null);
  emitKill(bus);
  assert.ok(spawned(system).blades > 0, 'kill after restore must remount and spawn');
  system.destroy();
});
