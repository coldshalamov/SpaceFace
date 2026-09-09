// PQ-134.02 — causal VFX/audio grammar (CRU-051).
// Eight families, non-colour identity, hero survival under saturation, accessibility variants.

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { causalKindsFromSpec } from '../src/systems/adventureMigration.js';
import {
  CAUSAL_VFX_FAMILY_LIST,
  CAUSAL_VFX_FAMILIES,
  CAUSAL_VFX_GRAMMAR,
  HERO_ADMISSION_FLOOR,
  causalKindsFromAttackSpec,
  classifyCausalVfxFamily,
  isHeroCausalEvent,
  nonColourDistinctions,
  resolveCausalVfxPresentation,
  scaleHeroAdmissionPriority,
} from '../src/presentation/causalVfxGrammar.js';
import {
  admitStructuralFxCue,
  STRUCTURAL_FX_FAMILIES,
  structuralFxFamilyFromReceipt,
} from '../src/presentation/cueArbitration.js';
import {
  ArcadeStructuralFx,
  ARCADE_STRUCTURAL_FX_CAPACITY,
} from '../src/render/combat/arcadeStructuralFx.js';
import { spawnCausalStructuralBurst } from '../src/render/combat/causalStructuralBurst.js';
import { vfx } from '../src/render/vfx.js';

void THREE;

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

function makeVfxHarness({ motionReduce = false, flashReduce = false, forcedColors = false } = {}) {
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
  const state = {
    playerId: PLAYER_ID,
    player: { targetId: TARGET_ID },
    entities: new Map([[PLAYER_ID, player], [TARGET_ID, target]]),
    entityList: [player, target],
    simTime: 12,
    tick: 720,
    settings: {
      video: { particleQuality: 'low', motionReduce, engineTrails: false },
      accessibility: { flashReduce, forcedColors },
    },
    render: {
      scene,
      renderer: { domElement: makeCanvas() },
    },
  };
  const bus = createBus();
  const system = Object.create(vfx);
  system.init({ state, bus, helpers: { player: () => player } });
  return { system, state, bus, player, target, scene };
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

function writeSpec(
  spec, priority, life, x, y, z, vx, vy, vz, drag, gravity,
  angle, angularVelocity, pitch, pitchVelocity, roll, rollVelocity,
  length0, length1, width0, width1, minWidthPixels, minLengthPixels,
  intensity, color, endColor,
) {
  spec.priority = priority;
  spec.life = life;
  spec.x = x; spec.y = y; spec.z = z;
  spec.vx = vx; spec.vy = vy; spec.vz = vz;
  spec.drag = drag; spec.gravity = gravity;
  spec.angle = angle; spec.angularVelocity = angularVelocity;
  spec.pitch = pitch; spec.pitchVelocity = pitchVelocity;
  spec.roll = roll; spec.rollVelocity = rollVelocity;
  spec.length0 = length0; spec.length1 = length1;
  spec.width0 = width0; spec.width1 = width1;
  spec.minWidthPixels = minWidthPixels; spec.minLengthPixels = minLengthPixels;
  spec.intensity = intensity;
  spec.color = color;
  spec.endColor = endColor;
}

function burst(fx, family, extra = {}) {
  const presentation = resolveCausalVfxPresentation(family, extra);
  const spec = {};
  return spawnCausalStructuralBurst({
    fx,
    spec,
    writeSpec,
    presentation,
    mixed: 0x51ed,
    phase: presentation.phase,
    baseAngle: 0.4,
    lx: 1, ly: 0.5, lz: 2,
    tvx: 0, tvy: 0, tvz: 0,
    radius: 6,
    priority: extra.priority ?? (extra.hero ? 0.95 : 0.4),
    dv: 8,
    reduced: !!extra.reduced,
    pattern01: (mixed, phase, i, salt) => ((mixed + i * 17 + salt * 13) & 0xffff) / 0xffff,
    patternSigned: (mixed, phase, i, salt) => (((mixed + i * 17 + salt * 13) & 0xffff) / 0xffff) * 2 - 1,
  });
}

test('eight causal families exist and kill aliases direct', () => {
  assert.deepEqual([...CAUSAL_VFX_FAMILY_LIST], [
    'direct', 'bank', 'chain', 'collision', 'terrain', 'tether', 'field', 'reaction',
  ]);
  for (const id of CAUSAL_VFX_FAMILY_LIST) {
    assert.equal(CAUSAL_VFX_FAMILIES[id], id);
    assert.ok(CAUSAL_VFX_GRAMMAR[id], id);
    const row = CAUSAL_VFX_GRAMMAR[id];
    assert.ok(row.silhouette);
    assert.ok(row.motion);
    assert.ok(row.layout);
    assert.ok(row.audioCue);
    const total = row.blades + row.arcs + row.shards;
    assert.ok(total > 0, `${id} must request at least one primitive`);
  }
  assert.equal(STRUCTURAL_FX_FAMILIES.kill, 'direct');
  assert.equal(classifyCausalVfxFamily('entity:killed', {}), 'direct');
});

test('every family pair is distinguishable without colour', () => {
  const pairs = [];
  for (let i = 0; i < CAUSAL_VFX_FAMILY_LIST.length; i++) {
    for (let j = i + 1; j < CAUSAL_VFX_FAMILY_LIST.length; j++) {
      const a = CAUSAL_VFX_FAMILY_LIST[i];
      const b = CAUSAL_VFX_FAMILY_LIST[j];
      const diffs = nonColourDistinctions(a, b);
      assert.ok(diffs.length > 0, `${a} vs ${b} must differ by more than hue`);
      pairs.push(`${a} / ${b}: ${diffs.join('; ')}`);
    }
  }
  assert.equal(pairs.length, 28);
});

test('classifier maps live receipts onto all eight families and refuses ordinary hits', () => {
  assert.equal(structuralFxFamilyFromReceipt('entity:killed', {}), 'direct');
  assert.equal(structuralFxFamilyFromReceipt('projectile:bank', { pos: { x: 1, z: 1 } }), 'bank');
  assert.equal(structuralFxFamilyFromReceipt('projectile:hit', { generation: 1 }), 'chain');
  assert.equal(structuralFxFamilyFromReceipt('combat:collisionConsequence', { control: 'tumble' }), 'collision');
  assert.equal(structuralFxFamilyFromReceipt('combat:collisionConsequence', {
    control: 'tumble', surface: 'terrain',
  }), 'terrain');
  assert.equal(structuralFxFamilyFromReceipt('tether:broken', { pos: { x: 1, z: 1 } }), 'tether');
  assert.equal(structuralFxFamilyFromReceipt('combat:statusApplied', { field: true }), 'field');
  assert.equal(structuralFxFamilyFromReceipt('combat:statusApplied', { statusId: 'burn' }), 'reaction');
  assert.equal(structuralFxFamilyFromReceipt('projectile:hit', { pos: { x: 1, z: 1 } }), null);
  assert.equal(structuralFxFamilyFromReceipt('combat:collisionConsequence', { control: 'stagger' }), null);
  assert.equal(classifyCausalVfxFamily('presentation:vfxCue', { family: 'chain' }), 'chain');
});

test('causalKindsFromAttackSpec agrees with causalKindsFromSpec', () => {
  const specs = [
    {},
    { emitter: { rootCount: 3 } },
    { trajectory: { bounces: 2 } },
    { propagation: { chain: { count: 2 } } },
    { propagation: { split: { count: 2 }, pierce: 1 } },
    { propagation: { orbit: { count: 1 } } },
    { payload: [{ kind: 'status' }] },
  ];
  for (const spec of specs) {
    assert.deepEqual(causalKindsFromAttackSpec(spec), causalKindsFromSpec(spec));
  }
});

test('hero admission sits in the reserved band and keeps relative order', () => {
  assert.ok(scaleHeroAdmissionPriority(0) >= HERO_ADMISSION_FLOOR);
  assert.ok(scaleHeroAdmissionPriority(0.2) > scaleHeroAdmissionPriority(0.1));
  assert.ok(isHeroCausalEvent('entity:killed', {}));
  const state = {
    playerId: PLAYER_ID,
    player: { targetId: TARGET_ID },
    entities: new Map([[PLAYER_ID, { id: PLAYER_ID, pos: { x: 0, z: 0 } }]]),
  };
  const kill = admitStructuralFxCue('entity:killed', {
    id: TARGET_ID, killerId: PLAYER_ID, pos: { x: 4, z: 0 },
  }, state);
  assert.equal(kill.hero, true);
  assert.ok(kill.admissionPriority >= HERO_ADMISSION_FLOOR);
});

test('forced-colors keeps silhouette and counts, changes hex', () => {
  for (const id of CAUSAL_VFX_FAMILY_LIST) {
    const full = resolveCausalVfxPresentation(id, {});
    const forced = resolveCausalVfxPresentation(id, { forcedColors: true });
    assert.equal(forced.silhouette, full.silhouette);
    assert.equal(forced.layout, full.layout);
    assert.equal(forced.blades, full.blades);
    assert.equal(forced.arcs, full.arcs);
    assert.equal(forced.shards, full.shards);
    assert.notEqual(forced.color, full.color);
  }
});

test('reduced-motion keeps a signature primitive and uses fewer of them', () => {
  for (const id of CAUSAL_VFX_FAMILY_LIST) {
    const full = resolveCausalVfxPresentation(id, {});
    const reduced = resolveCausalVfxPresentation(id, { reduced: true });
    const fullTotal = full.blades + full.arcs + full.shards;
    const reducedTotal = reduced.blades + reduced.arcs + reduced.shards;
    assert.ok(reducedTotal >= 1, `${id} reduced must still speak`);
    assert.ok(reducedTotal < fullTotal, `${id} reduced ${reducedTotal} must be below full ${fullTotal}`);
    const sig = CAUSAL_VFX_GRAMMAR[id].signaturePrimitive;
    if (sig === 'blade') assert.ok(reduced.blades >= 1);
    if (sig === 'arc') assert.ok(reduced.arcs >= 1);
    if (sig === 'shard') assert.ok(reduced.shards >= 1);
  }
});

test('same seed and events spawn the same inspect counters', () => {
  const a = new ArcadeStructuralFx(null);
  const b = new ArcadeStructuralFx(null);
  burst(a, 'direct', { hero: true });
  burst(b, 'direct', { hero: true });
  burst(a, 'chain');
  burst(b, 'chain');
  assert.deepEqual(a.inspect(), b.inspect());
  a.dispose();
  b.dispose();
});

test('hero kill obtains a blade slot after the pool is full without growing capacity', () => {
  const fx = new ArcadeStructuralFx(null);
  const cap = ARCADE_STRUCTURAL_FX_CAPACITY.blades;
  for (let i = 0; i < cap; i++) {
    assert.equal(fx.spawnBlade({
      x: i, z: 0, priority: 0.2, life: 8, color: '#888888', endColor: '#444444',
    }), true);
  }
  const filled = fx.inspect().pools.blades;
  assert.equal(filled.live, cap);
  assert.equal(filled.highWater, cap);
  const spawnedCount = burst(fx, 'direct', { hero: true, priority: 0.96 });
  assert.ok(spawnedCount > 0);
  const after = fx.inspect().pools.blades;
  assert.equal(after.live, cap);
  assert.equal(after.highWater, cap);
  assert.equal(after.capacity, cap);
  assert.ok(after.evicted > filled.evicted);
  assert.ok(after.spawned > filled.spawned);
  for (const mesh of fx.getMeshes()) {
    assert.equal(mesh.instanceMatrix.array.length, mesh.count * 16);
  }
  fx.dispose();
});

test('live kill still claims a blade when the arcade pool is saturated', () => {
  const { system, bus } = makeVfxHarness();
  system._initArcadeStructural();
  const fx = system._arcadeStructural;
  const cap = ARCADE_STRUCTURAL_FX_CAPACITY.blades;
  for (let i = 0; i < cap; i++) {
    fx.spawnBlade({
      x: i * 0.05, z: 0, priority: 0.2, life: 8, color: '#777777', endColor: '#333333',
    });
  }
  const before = fx.inspect().pools.blades;
  assert.equal(before.live, cap);
  bus.emit('entity:killed', {
    id: TARGET_ID,
    killerId: PLAYER_ID,
    type: 'ship',
    pos: { x: 8, z: 3 },
    radius: 8,
    vel: { x: -2, z: 0 },
    direction: { x: 1, z: 0.2 },
  });
  const after = fx.inspect().pools.blades;
  assert.ok(after.spawned > before.spawned, 'hero kill must obtain a blade slot');
  assert.equal(after.live, cap);
  assert.equal(after.highWater, cap);
  assert.ok(after.evicted > before.evicted);
  system.destroy();
});

test('tether, field, reaction, chain, and terrain receipts spawn through the live mount', () => {
  const { system, bus } = makeVfxHarness();
  const before = spawned(system);
  bus.emit('tether:broken', { pos: { x: 4, z: 1 }, targetId: TARGET_ID });
  bus.emit('combat:statusApplied', { pos: { x: 5, z: 1 }, statusId: 'gravity-well', field: true });
  bus.emit('combat:statusApplied', { pos: { x: 5, z: 2 }, statusId: 'burn' });
  bus.emit('projectile:hit', { pos: { x: 3, z: 1 }, targetId: TARGET_ID, generation: 2 });
  bus.emit('combat:collisionConsequence', {
    targetId: TARGET_ID,
    control: 'tumble',
    surface: 'terrain',
    pos: { x: 6, z: 2 },
    deltaV: 18,
  });
  const after = spawned(system);
  assert.ok(after.blades + after.arcs + after.shards > before.blades + before.arcs + before.shards);
  system.destroy();
});

test('structural pool high-water never exceeds capacity after mixed family bursts', () => {
  const fx = new ArcadeStructuralFx(null);
  for (const id of CAUSAL_VFX_FAMILY_LIST) burst(fx, id, { hero: id === 'direct' });
  for (const id of CAUSAL_VFX_FAMILY_LIST) burst(fx, id, { reduced: true });
  const info = fx.inspect();
  for (const kind of ['blades', 'arcs', 'shards']) {
    assert.ok(info.pools[kind].highWater <= ARCADE_STRUCTURAL_FX_CAPACITY[kind]);
    assert.equal(info.pools[kind].capacity, ARCADE_STRUCTURAL_FX_CAPACITY[kind]);
  }
  fx.dispose();
});
