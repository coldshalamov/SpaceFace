import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ActionVfx, ACTION_VFX_EVENTS } from '../src/render/actionVfx.js';
import { createBus } from '../src/core/eventBus.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { projectBridgeEvent } from '../scripts/lib/simEventBridge.mjs';

const EVENT = 'salvageWatch:repairWork';
function fixture() {
  const source = { id: 2, occupantGeneration: 7, type: 'ship', alive: true,
    pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12 };
  const target = { id: 3, occupantGeneration: 8, type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 20 };
  const state = { entities: new Map([[2, source], [3, target]]), entityList: [source, target],
    world: { currentSectorId: 'sector_helios_prime' }, settings: {}, meta: { seed: 1 },
    mode: 'flight', tick: 0, simTime: 1, accumulator: 0, timeScale: 1, ui: { screenStack: [] } };
  const pulse = { encounterId: 'watch:proof', sectorId: state.world.currentSectorId,
    sourceId: 2, sourceGeneration: 7, targetId: 3, targetGeneration: 8, simTime: 1 };
  return { source, target, state, pulse, out: new ActionVfx(new THREE.Scene()) };
}

test('repair work crosses production projection and actual main-lane replay into action admission', async () => {
  const f = fixture(), bus = createBus(), posts = [];
  let receive, admitted = 0;
  assert.ok(ACTION_VFX_EVENTS.includes(EVENT));
  bus.on(EVENT, p => { if (f.out.emit(EVENT, p, f.state)) admitted++; });
  const lane = createSimLaneRuntime({ state: f.state, bus, registry: {},
    flags: { lane: 'worker', warnings: [], sab: false },
    channelFactory: () => ({ post: p => posts.push(p), onMessage: fn => { receive = fn; }, terminate() {} }) });
  try {
    receive({ kind: 'ready', seq: posts[0].seq, spawnInfos: [f.source, f.target].map(e => ({
      entityId: e.id, occupantGeneration: e.occupantGeneration, type: e.type, alive: true,
      x: e.pos.x, z: e.pos.z, radius: e.radius })) });
    await lane.readyPromise;
    // Production spawn transport materializes non-enumerable occupant generations.
    f.source = f.state.entities.get(2); f.target = f.state.entities.get(3);
    assert.equal(f.source.occupantGeneration, 7); assert.equal(f.target.occupantGeneration, 8);
    const projected = projectBridgeEvent(EVENT, f.pulse);
    assert.equal(projected.dropped, false);
    assert.equal(projected.lane, 'sim');
    assert.deepEqual(structuredClone(projected.flat), f.pulse);
    lane.runner.stepOnce();
    receive({ kind: 'tickDone', seq: posts.at(-1).seq, stateTick: 1, simTime: 1,
      events: [{ t: EVENT, p: projected.flat, lane: projected.lane }] });
    assert.equal(admitted, 1);
    const slot = f.out.slots.find(s => s.alive);
    assert.equal(slot.source, f.source); assert.equal(slot.target, f.target);
    assert.equal(slot.provenance, 'body-surface');
    assert.ok(slot.x > 0 && slot.x <= f.target.radius, 'patch faces Hawser on Mule surface');
    assert.equal(slot.recipe.primitive, 'deposition');
  } finally { lane.close(); f.out.dispose(); }
});

test('repair work rejects malformed, stale, future, wrong-sector and recycled receipts without player fallback', () => {
  const f = fixture();
  try {
    for (const bad of [
      { sourceId: undefined }, { targetId: undefined }, { sourceGeneration: undefined },
      { targetGeneration: 9 }, { sourceGeneration: 6 }, { sourceId: 3 },
      { sectorId: 'elsewhere' }, { simTime: 0.5 }, { simTime: 1.01 }, { encounterId: '' },
    ]) assert.equal(f.out.emit(EVENT, { ...f.pulse, ...bad }, f.state), false);
    assert.equal(f.out.live, 0);
    f.state.entities.delete(2);
    assert.equal(f.out.emit(EVENT, f.pulse, f.state), false);
  } finally { f.out.dispose(); }
});

test('active repair patch retires on either actor death, replacement, generation change or sector exit', () => {
  for (const mutate of [
    f => { f.source.alive = false; }, f => { f.target.alive = false; },
    f => f.state.entities.set(2, { ...f.source }),
    f => f.state.entities.set(3, { ...f.target }),
    f => { f.source.occupantGeneration++; }, f => { f.target.occupantGeneration++; },
    f => { f.state.world.currentSectorId = 'elsewhere'; },
    f => { f.state.mode = 'menu'; },
  ]) {
    const f = fixture();
    try {
      assert.equal(f.out.emit(EVENT, f.pulse, f.state), true);
      mutate(f); f.state.simTime += 0.01;
      assert.equal(f.out.update(f.state), 0);
      assert.equal(f.out.slots.some(s => s.alive), false);
    } finally { f.out.dispose(); }
  }
});

test('repair patch follows real target, expires from receipt time and respects reduced motion', () => {
  const f = fixture();
  try {
    f.state.simTime = 1.2;
    assert.equal(f.out.emit(EVENT, f.pulse, f.state), true);
    const slot = f.out.slots.find(s => s.alive), x = slot.x;
    f.target.pos.x += 10;
    f.state.settings.accessibility = { reducedMotion: true, reducedFlash: true };
    assert.equal(f.out.update(f.state), 1);
    assert.equal(slot.x, x + 10);
    assert.equal(f.out.particleOptions.reducedMotion, true);
    assert.equal(f.out.particleOptions.reducedFlash, true);
    assert.equal(f.out.particles.live, 0);
    f.state.simTime = 1.46;
    assert.equal(f.out.update(f.state), 0, 'transport delay must not extend work');
    assert.equal(f.out.emit('beam:repaired', { targetId: 3, sourceId: 2 }, f.state), true,
      'existing player-tool recipe is unchanged');
  } finally { f.out.dispose(); }
});

test('repair work uses drawn hull bounds instead of a clamped central patch', () => {
  const f = fixture(), root = new THREE.Group();
  const geometry = new THREE.BoxGeometry(100, 10, 30), material = new THREE.MeshBasicMaterial();
  root.add(new THREE.Mesh(geometry, material)); f.target.view = { root };
  try {
    assert.equal(f.out.emit(EVENT, f.pulse, f.state), true);
    const slot = f.out.slots.find(s => s.alive);
    assert.equal(slot.provenance, 'model-bounds-surface');
    assert.equal(slot.x, 50); assert.equal(slot.y, 1);
    f.state.simTime += 0.1; f.out.update(f.state);
    assert.ok(f.out.batch.attributes.every(a => a.array.every(Number.isFinite)));
  } finally { f.out.dispose(); geometry.dispose(); material.dispose(); }
});

test('repair particles retain numeric emission sites after actor retirement and expire independently', () => {
  for (const retire of ['source', 'target', 'expiry']) {
    const f = fixture();
    try {
      assert.equal(f.out.emit(EVENT, f.pulse, f.state), true);
      f.state.simTime = 1.1; f.out.update(f.state);
      const pool = f.out.particles;
      assert.ok(pool.live > 0, 'ordinary motion emits actual repair matter');
      const emitted = pool.stats.emitted;
      const parcels = pool.system.particles.slice(0, pool.live);
      const origins = parcels.map(p => [p.forceFlow[1], p.forceFlow[3]]);
      for (const p of parcels) {
        assert.ok(p.life > 0 && p.life <= 0.387);
        assert.equal(p.forceContactCount, 0, 'no live hull attachment');
      }
      if (retire !== 'expiry') {
        const old = f[retire];
        f.state.entities.set(old.id, { ...old, occupantGeneration: old.occupantGeneration + 1,
          pos: { x: 100000, z: 100000 } });
        f.state.simTime = 1.11;
      } else f.state.simTime = 1.451;
      assert.equal(f.out.update(f.state), 0, 'surface retires without clearing unrelated particles');
      assert.equal(pool.stats.emitted, emitted, 'retired slot supplies no new matter');
      for (let i = 0; i < parcels.length; i++) {
        assert.deepEqual([parcels[i].forceFlow[1], parcels[i].forceFlow[3]], origins[i],
          'retained parcel never follows the recycled actor');
      }
      if (retire !== 'expiry') {
        assert.ok(pool.live > 0, 'already emitted matter is allowed a finite cooling tail');
        pool.reproject(-25, 12);
        for (let i = 0; i < parcels.length; i++) {
          assert.deepEqual([parcels[i].forceFlow[1], parcels[i].forceFlow[3]],
            [origins[i][0] - 25, origins[i][1] + 12], 'frame rebase only translates numeric origin');
        }
      }
      f.state.simTime = 1.838; f.out.update(f.state);
      assert.equal(pool.live, 0, 'surface lifetime plus maximum parcel lifetime bounds the total tail');
      assert.equal(pool.stats.emitted, emitted);
    } finally { f.out.dispose(); }
  }
});
