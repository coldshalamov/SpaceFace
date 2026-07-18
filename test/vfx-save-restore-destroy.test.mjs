// M6: entity:destroyed with reason:'save_restore' must not spawn destruction VFX.
// saveSystem._clearEntities() emits that reason for every entity on F9 load; treating those
// as gameplay explosions fills the particle cap and stalls the frame.
import assert from 'node:assert/strict';
import * as THREE from 'three';

const { vfx } = await import('../src/render/vfx.js');

function makeVfxSystem() {
  const scene = new THREE.Scene();
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
      on() { return () => {}; },
      emit() { /* cosmetic camera:shake etc. — no-op in unit test */ },
    },
    helpers: {},
  });
  assert.ok(system._scene, 'vfx must attach to the provided render scene');
  return system;
}

function snapshot(system) {
  const snap = system.inspect();
  return {
    liveParticles: snap.liveParticles,
    liveSprites: snap.liveSprites,
    activeLights: snap.activeLights,
  };
}

function advanceExplosion(system, dt = 0.2) {
  system._explosions.update(dt, system._explosionEmitter);
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

// ── normal destroy: still produces destruction VFX ──────────────────────────
const combatSys = makeVfxSystem();
const beforeCombat = snapshot(combatSys);
combatSys._onDestroyed({
  ...asteroidPayload,
  // no reason, or an explicit gameplay reason — either must explode
});
advanceExplosion(combatSys);
const afterCombat = snapshot(combatSys);
assert.ok(afterCombat.liveParticles > beforeCombat.liveParticles,
  `normal entity:destroyed must spawn particles (got ${afterCombat.liveParticles})`);
assert.ok(afterCombat.liveSprites > beforeCombat.liveSprites,
  `normal entity:destroyed must spawn sprites (got ${afterCombat.liveSprites})`);
assert.ok(afterCombat.activeLights > beforeCombat.activeLights,
  `normal entity:destroyed must flash lights (got ${afterCombat.activeLights})`);

// Explicit non-restore reason still explodes (combat/mining/sector paths).
const combatSys2 = makeVfxSystem();
combatSys2._onDestroyed({
  ...asteroidPayload,
  id: 99,
  reason: 'combat',
});
advanceExplosion(combatSys2);
const afterCombat2 = snapshot(combatSys2);
assert.ok(afterCombat2.liveParticles > 0, 'reason:combat must still explode');
assert.ok(afterCombat2.liveSprites > 0, 'reason:combat must still spawn sprites');

// Ships remain no-op on entity:destroyed (entity:killed owns ship explosions) — regression guard.
const shipSys = makeVfxSystem();
shipSys._onDestroyed({
  id: 7,
  type: 'ship',
  pos: { x: 0, z: 0 },
  radius: 10,
});
assert.deepEqual(snapshot(shipSys), { liveParticles: 0, liveSprites: 0, activeLights: 0 },
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
