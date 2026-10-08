import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner, createSg02CombatPhysicsPort } from '../src/core/sg02DynamicBodyOwner.js';
import { setPresentationAdmission, PRESENTATION_ADMISSION } from '../src/core/presentationAdmission.js';
import { palletJack } from '../src/systems/palletJack.js';
import { PALLET_JACK as C } from '../src/data/palletJack.js';
import { palletJackPhysicalBody } from '../src/data/palletJackBody.js';
import { createPalletJackVisualDriver, PALLET_JACK_MOTION_NODE } from '../src/render/palletJackVisuals.js';
import { validateMotionBank } from '../src/contracts/motionBank.js';

const near = (a, b) => assert(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
async function fixture() {
  const native = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  const physics = { name: 'physics', init(ctx) { this._sg02 = native; ctx.helpers.combatPhysics = createSg02CombatPhysicsPort(native); } };
  const sim = createSimulation({ seed: 9, systems: [physics, palletJack] }), s = sim.state;
  s.mode = 'flight'; s.tick = 120; s.simTime = 2; s.world.currentSectorId = C.sectors[0];
  s.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const player = sim.spawn({ type: 'ship', hull: 300, mass: 40, radius: 4, pos: { x: 60, z: 90 },
    physicsBody: { schemaVersion: 1, dynamic: true, mass: 40, radius: 4, inertiaY: 80, shape: 'ball' }, data: {} }); s.playerId = player.id;
  const actor = sim.spawn({ type: 'ship', mass: 100, radius: 20, hull: 160, hullMax: 160, pos: { x: 0, z: 0 },
    physicsBody: palletJackPhysicalBody(), data: { lootTableId: C.enemyId, authoredAssetId: C.assetId, combatProfileId: 'combat_profile_pallet_jack' } });
  const cargo = sim.spawn({ type: 'pickup', hull: 100, mass: 60, radius: 2, pos: { x: 7, z: 0 }, collides: true,
    physicsBody: { schemaVersion: 1, dynamic: true, mass: 60, radius: 2, inertiaY: 120, shape: 'ball' },
    data: { kind: 'cargo', commodityId: 'cmdty_electronics', amount: 3 } });
  native.syncFromEntities(s.entityList); native.step(1 / 60, s.tick);
  const owner = sim.registry.get('palletJack'), row = owner.begin(actor, cargo, 'visual-pallet'); assert(row);
  const scene = new THREE.Scene(), root = new THREE.Group(), clamp = new THREE.Group(); clamp.name = PALLET_JACK_MOTION_NODE;
  clamp.position.set(2, 3.1, 0); root.add(clamp); scene.add(root); actor.mesh = root; s.render.scene = scene;
  setPresentationAdmission(actor, PRESENTATION_ADMISSION.ready); setPresentationAdmission(player, PRESENTATION_ADMISSION.ready);
  root.userData.palletJackAuthoredSource = { assetId: C.assetId, file: 'assets/ships/release/parts/wholeships/pallet_jack.glb' };
  let driver = createPalletJackVisualDriver(root, actor);
  const view = a11y => driver.update(actor, s.simTime, a11y || {}, s);
  const tick = () => { s.tick++; s.simTime += 1 / 60; owner.update(1 / 60, s);
    native.syncFromEntities(s.entityList); native.step(1 / 60, s.tick); view(); };
  const until = fn => { let n = 0; while (!fn() && n++ < 250) tick(); assert(fn(), `phase ${row.phase}`); };
  return { sim, s, native, actor, cargo, owner, row, root, clamp, view, tick, until,
    reopen() { driver.dispose(); driver = createPalletJackVisualDriver(root, actor); },
    close() { driver.dispose(); sim.dispose(); native.dispose(); } };
}

test('authored clamp bank keeps the exact supported pivot in every tier', () => {
  const bank = JSON.parse(readFileSync(new URL('../assets/ships/motions/pallet-jack.motion.json', import.meta.url))); validateMotionBank(bank);
  assert.equal(bank.sourceAssetId, C.assetId); assert.deepEqual(bank.bindings.map(b => b.node), [PALLET_JACK_MOTION_NODE]);
  bank.bindings[0].restPose.translation.forEach((v, i) => near(v, [2, 3.1, 0][i]));
  for (const suffix of ['', '_lod1', '_lod2']) {
    const b = readFileSync(new URL(`../assets/ships/parts/wholeships/pallet_jack${suffix}.glb`, import.meta.url));
    const doc = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'));
    assert(doc.nodes.some(n => n.name === PALLET_JACK_MOTION_NODE));
  }
});

test('actual forty-eight-tick grab reaches the separate cargo; only the accepted native joint holds it closed', async () => {
  const h = await fixture(); try {
    h.view(); near(h.clamp.position.x, 2); h.until(() => h.row.phase === 'grab');
    for (let i = 0; i < 24; i++) h.tick(); near(h.clamp.position.x, 6); assert.equal(h.owner._line(), null);
    const before = JSON.stringify(h.row); h.view(); assert.equal(JSON.stringify(h.row), before);
    h.until(() => h.row.phase === 'escape'); near(h.clamp.position.x, 10); assert(h.owner._line());
    assert.equal(h.s.entityList.filter(e => e.alive && e.data.palletJackCargoId).length, 1);
    assert.equal(h.owner.release('parley').ok, true); h.view(); const releaseTick = h.s.tick;
    for (let i = 0; i < C.dropTicks; i++) h.tick(); near(h.clamp.position.x, 2);
    assert.equal(h.s.tick - releaseTick, 21); assert.equal(h.cargo.alive, true);
    h.reopen(); h.view(); near(h.clamp.position.x, 2, 'cold accepted release has no old drop replay');
  } finally { h.close(); }
});

test('current-native/source/life/scene fences and reduced motion do not impersonate cargo custody', async () => {
  const h = await fixture(); try {
    h.until(() => h.row.phase === 'grab'); for (let i = 0; i < 12; i++) h.tick(); assert(h.clamp.position.x > 2);
    h.view({ reducedMotion: true }); near(h.clamp.position.x, 10); assert.equal(h.owner._line(), null);
    h.s.tick += 3; h.view(); near(h.clamp.position.x, 2);
    nativeFresh(h); h.root.userData.palletJackAuthoredSource.file = 'wrong.glb'; h.view(); near(h.clamp.position.x, 2);
    h.root.userData.palletJackAuthoredSource.file = 'assets/ships/release/parts/wholeships/pallet_jack.glb'; h.view(); assert(h.clamp.position.x > 2);
    h.s.entities.set(h.actor.id, { ...h.actor, occupantGeneration: h.actor.occupantGeneration + 1 }); h.view(); near(h.clamp.position.x, 2);
  } finally { h.close(); }
});
function nativeFresh(h) { h.native.syncFromEntities(h.s.entityList); h.native.step(1 / 60, h.s.tick); }
