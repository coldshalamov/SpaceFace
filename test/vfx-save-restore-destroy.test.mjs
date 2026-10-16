// M6: entity:destroyed with reason:'save_restore' must not spawn destruction VFX.
// saveSystem._clearEntities() emits that reason for every entity on F9 load; treating those
// as gameplay explosions fills the particle cap and stalls the frame.
//
// The inverse also has to hold, and that is the half that rotted: a real destroy must still put
// destruction on the glass. The explosion no longer draws as sprite/particle cards — `_explosions`
// hands each phase to the instanced `_explosionRupture` fan, which owns its own mesh and its own
// per-frame update. A test that only counted `inspect().liveParticles/liveSprites` therefore read
// a working explosion as a dead one. The census below counts every channel destruction can use and
// drives the rupture update the render loop drives, so this fails again if explosions stop.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDynamicBufferCoordinator } from '../src/render/dynamicBufferRanges.js';

const { vfx } = await import('../src/render/vfx.js');

function makeVfxSystem(coordinated = false) {
  const scene = new THREE.Scene();
  if (coordinated) createDynamicBufferCoordinator(scene);
  const handlers = new Map();
  const state = {
    playerId: 1,
    entities: new Map(),
    entityList: [],
    settings: { video: { particleQuality: 'medium' } },
    render: { scene },
  };
  const system = Object.create(vfx);
  system.init({
    state,
    bus: {
      on(name, fn) {
        const list = handlers.get(name) || [];
        list.push(fn);
        handlers.set(name, list);
        return () => {
          const index = list.indexOf(fn);
          if (index >= 0) list.splice(index, 1);
        };
      },
      emit(name, payload) {
        for (const fn of handlers.get(name) || []) fn(payload);
      },
    },
    helpers: {},
  });
  system.__emitForTest = (name, payload) => {
    for (const fn of handlers.get(name) || []) fn(payload);
  };
  assert.ok(system._scene, 'vfx must attach to the provided render scene');
  return system;
}

function snapshot(system) {
  const snap = system.inspect();
  return {
    liveParticles: snap.liveParticles,
    liveSprites: snap.liveSprites,
    activeLights: snap.activeLights,
    // The rupture fan is real destruction presentation too — it is instanced geometry attached to
    // the scene, not a CPU particle. Counting it is what lets this test see a real explosion again.
    ruptureInstances: system._explosionRupture ? system._explosionRupture.activeCount : 0,
    ruptureVisible: !!(system._explosionRupture && system._explosionRupture.mesh
      && system._explosionRupture.mesh.visible),
  };
}

// Total destruction presentation across every channel an explosion can own.
function destructionCensus(system) {
  const s = snapshot(system);
  return s.liveParticles + s.liveSprites + s.ruptureInstances + s.activeLights;
}

// The render loop advances the rupture immediately after the phase lifecycle (vfx.js update), which
// is what resolves the fan's on-glass visibility. A test that skips it sees a latched fan as absent.
function advanceExplosion(system, dt = 0.2) {
  system._explosions.update(dt, system._explosionEmitter);
  system._explosionRupture?.update(
    Number.isFinite(system.state && system.state.simTime) ? system.state.simTime : 0,
    system.state && system.state.settings,
  );
}

const asteroidPayload = {
  id: 42,
  type: 'asteroid',
  pos: { x: 10, z: -20 },
  radius: 12,
  factionId: null,
};

// ── save_restore: no destruction VFX ────────────────────────────────────────
const restoreSys = makeVfxSystem();
const beforeRestore = snapshot(restoreSys);
assert.equal(beforeRestore.liveParticles, 0);
assert.equal(beforeRestore.liveSprites, 0);
assert.equal(beforeRestore.activeLights, 0);

// Simulate a bulk clear (many entities) — still must stay at zero.
for (let i = 0; i < 40; i++) {
  restoreSys._onDestroyed({
    ...asteroidPayload,
    id: 1000 + i,
    pos: { x: i * 3, z: -i * 2 },
    reason: 'save_restore',
  });
}
advanceExplosion(restoreSys);
const afterRestore = snapshot(restoreSys);
assert.equal(afterRestore.liveParticles, 0,
  'save_restore must spawn zero particles (F9 clear is not a combat destroy)');
assert.equal(afterRestore.liveSprites, 0,
  'save_restore must spawn zero explosion sprites');
assert.equal(afterRestore.activeLights, 0,
  'save_restore must activate zero flash lights');
assert.equal(afterRestore.ruptureInstances, 0,
  'save_restore must emit zero rupture instances');
assert.equal(afterRestore.ruptureVisible, false,
  'save_restore must leave the rupture fan hidden');

// Non-asteroid types that would otherwise explode must also stay silent.
for (const type of ['wreck', 'drone', 'asteroid_large', 'station_debris']) {
  restoreSys._onDestroyed({
    id: 2000,
    type,
    pos: { x: 1, z: 1 },
    radius: 8,
    reason: 'save_restore',
  });
}
assert.deepEqual(snapshot(restoreSys), afterRestore,
  'save_restore must remain a no-op for all explode-eligible types');

// Production propulsion pools are transient world-space presentation too. They must not survive
// a save restore or sector boundary at their old coordinates.
const energySys = makeVfxSystem();
energySys._initEnergy();
energySys._energy.rcsSystem.fire([4, 0, -3], [0, 0, -1], 1);
energySys._energy.rcsSystem.update(1 / 60, {});
assert.equal(energySys._energy.rcsSystem.pool.activeImpulseCount, 1,
  'precondition: a production RCS impulse is live');
energySys.__emitForTest('save:loaded');
assert.equal(energySys._energy.rcsSystem.pool.activeImpulseCount, 0,
  'save:loaded must clear production RCS impulses at pre-load coordinates');
assert.equal(energySys._energy.plumeDrive, 0);
assert.equal(energySys._energy.rcsCooldown, 0);

energySys._energy.rcsSystem.fire([-2, 0, 6], [0, 0, 1], 1);
energySys._energy.rcsSystem.update(1 / 60, {});
assert.equal(energySys._energy.rcsSystem.pool.activeImpulseCount, 1);
energySys.__emitForTest('sector:enter');
assert.equal(energySys._energy.rcsSystem.pool.activeImpulseCount, 0,
  'sector:enter must clear production RCS impulses at old-sector coordinates');

// Cosmetic pools belong to the world that emitted them. A load/jump can reuse its local
// coordinates while paused, so retirement must also publish empty draws before another update.
for (const boundary of ['sector:exit', 'sector:enter', 'game:new', 'game:newGame', 'save:restoring', 'save:loaded']) {
  const coordinated = boundary === 'sector:enter' || boundary === 'save:loaded';
  const system = makeVfxSystem(coordinated);
  assert.equal(!!system._particleDynamicBufferOwner, coordinated,
    `${boundary}: cover both production buffer coordination and standalone consumers`);
  system.state.simTime = 40;
  const fields = [{ id: 'durable-field', radius: 20 }];
  system.state.fields = { active: fields };
  const particleMesh = system._shardMesh;
  const spriteBatches = system._spriteBatches;
  const color = new THREE.Color('#ffb35c');
  system._spawnParticle(10, 20, 4, 2, 3, 2, 0.2, color, color, 0, 0.2, 0);
  for (const kind of [0, 1, 2, 4]) {
    system._spawnSprite(kind, 10, 0.2, 20, 3, 2, 5, 0.8, 0, '#ffb35c', 0, 0);
  }
  system._integrateParticles(1 / 60);
  system._integrateSprites(1 / 60);
  system._gas.emitCombustion({ x: 10, z: 20, scale: 5 });
  system._gas.update(40);
  system._gas.update(40 + 1 / 60);
  system._weaponPresenter.handleFire({ ownerId: 1, weaponId: 'wpn_pulse_laser_s' }, { x: 10, z: 20 }, 0);
  system._weaponPresenter.update(1 / 60, { state: system.state });
  const quarks = system._weaponPresenter.quarks;
  quarks.spawnCollisionSpall(10, 0.2, 20, 1, 0, 0, 3);
  quarks.update(1 / 60);
  assert.equal(particleMesh.count, 1, `${boundary}: shard draw is live before the boundary`);
  assert.equal(Object.values(spriteBatches).filter((bucket) => bucket?.mesh)
    .reduce((sum, bucket) => sum + bucket.mesh.count, 0), 4,
  `${boundary}: each transient-volume draw is live before the boundary`);
  assert.equal(system._gas.liveCount, 1, `${boundary}: gas is live before the boundary`);
  assert.ok(system._weaponPresenter.discharges.mesh.count > 0,
    `${boundary}: real weapon discharge is drawn before the boundary`);
  assert.ok(quarks.collisionSpall.particleNum > 0, `${boundary}: debris is live before the boundary`);

  system.__emitForTest(boundary);
  assert.equal(system.inspect().liveParticles, 0, `${boundary}: retire old-world shards`);
  assert.equal(system.inspect().liveSprites, 0, `${boundary}: retire old-world transient volumes`);
  assert.equal(particleMesh.count, 0, `${boundary}: paused draw cannot retain old-world shards`);
  assert.ok(Object.values(spriteBatches).filter((bucket) => bucket?.mesh)
    .every((bucket) => bucket.mesh.count === 0), `${boundary}: publish empty transient-volume draws`);
  assert.equal(system._gas.liveCount, 0, `${boundary}: retire old-world gas`);
  assert.equal(system._gas.mesh.count, 0, `${boundary}: publish empty gas draw`);
  assert.equal(system._weaponPresenter.discharges.mesh.count, 0,
    `${boundary}: publish empty old-world weapon discharge draw`);
  assert.equal(quarks.collisionSpall.particleNum, 0, `${boundary}: retire old-world debris`);
  assert.ok(quarks.renderer.batches.every((batch) => batch.geometry.instanceCount === 0),
    `${boundary}: publish empty debris draws`);
  assert.equal(system.state.fields.active, fields, `${boundary}: simulation fields remain owned by simulation`);
  assert.equal(system._shardMesh, particleMesh, `${boundary}: retain the existing particle pool`);
  assert.equal(system._spriteBatches, spriteBatches, `${boundary}: retain the existing volume pools`);

  // Repeated boundary notifications must not duplicate free slots or strand the next event.
  system.__emitForTest(boundary);
  system._spawnParticle(30, 40, 1, 0, 1, 2, 0.2, color, color, 0, 0.2, 0);
  system._spawnSprite(1, 30, 0.2, 40, 1, 2, 5, 0.8, 0, '#ffb35c', 0, 0);
  system._integrateParticles(1 / 60);
  system._integrateSprites(1 / 60);
  assert.equal(system.inspect().liveParticles, 1, `${boundary}: next-world particle is admitted`);
  assert.equal(system.inspect().liveSprites, 1, `${boundary}: next-world volume is admitted`);
  assert.equal(system._freeParticleCount, system._cap - 1, `${boundary}: particle slots remain balanced`);
  assert.equal(system._freeSpriteCount, system._spr.length - 1, `${boundary}: volume slots remain balanced`);
  system.destroy();
}

// ── normal destroy: still produces destruction VFX ──────────────────────────
const combatSys = makeVfxSystem();
const beforeCombat = destructionCensus(combatSys);
assert.equal(beforeCombat, 0, 'precondition: no destruction presentation before the destroy');
combatSys._onDestroyed({
  ...asteroidPayload,
  // no reason, or an explicit gameplay reason — either must explode
});
advanceExplosion(combatSys);
const afterCombat = snapshot(combatSys);
assert.ok(afterCombat.ruptureInstances > 0,
  `normal entity:destroyed must emit rupture instances (got ${afterCombat.ruptureInstances})`);
assert.equal(afterCombat.ruptureVisible, true,
  'the destruction rupture fan must be visible on the glass, not merely latched');
assert.ok(afterCombat.activeLights > 0,
  `normal entity:destroyed must flash lights (got ${afterCombat.activeLights})`);
assert.ok(destructionCensus(combatSys) > beforeCombat,
  'normal entity:destroyed must put destruction presentation on the glass');

// Explicit non-restore reason still explodes (combat/mining/sector paths).
const combatSys2 = makeVfxSystem();
combatSys2._onDestroyed({
  ...asteroidPayload,
  id: 99,
  reason: 'combat',
});
advanceExplosion(combatSys2);
const afterCombat2 = snapshot(combatSys2);
assert.ok(afterCombat2.ruptureInstances > 0, 'reason:combat must still explode');
assert.equal(afterCombat2.ruptureVisible, true, 'reason:combat must show the rupture fan');
assert.ok(afterCombat2.activeLights > 0, 'reason:combat must still flash lights');

// Ships remain no-op on entity:destroyed (entity:killed owns ship explosions) — regression guard.
const shipSys = makeVfxSystem();
shipSys._onDestroyed({
  id: 7,
  type: 'ship',
  pos: { x: 0, z: 0 },
  radius: 10,
});
assert.deepEqual(snapshot(shipSys),
  { liveParticles: 0, liveSprites: 0, activeLights: 0, ruptureInstances: 0, ruptureVisible: false },
  'ship entity:destroyed must still skip explode (entity:killed path)');

console.log(JSON.stringify({
  ok: true,
  test: 'vfx-save-restore-destroy',
  saveRestore: afterRestore,
  normalDestroy: afterCombat,
  combatReason: {
    liveParticles: afterCombat2.liveParticles,
    liveSprites: afterCombat2.liveSprites,
    activeLights: afterCombat2.activeLights,
  },
}, null, 2));
