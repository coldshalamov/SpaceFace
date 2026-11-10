import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createSimulation } from '../src/core/sim.js';
import { scissorwake, scissorwakePresentation } from '../src/systems/scissorwake.js';
import { scissorwakePhysicalBody } from '../src/data/scissorwakeBody.js';
import { SCISSORWAKE as C } from '../src/data/scissorwake.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { applySpecialistCounterplay } from '../src/ai/specialistCounterplay.js';
import { validateMotionBank } from '../src/contracts/motionBank.js';
import { createScissorwakeVisualDriver, SCISSORWAKE_MOTION_NODES, SCISSORWAKE_ASSET_ID } from '../src/render/scissorwakeVisuals.js';

function fixture() {
  const native = { tick: 771, _simTick: 120, records: new Map() };
  const physics = { name: 'physics', init() { this._sg02 = native; } };
  const sim = createSimulation({ seed: 7, systems: [physics, scissorwake] }), state = sim.state;
  state.mode = 'flight'; state.tick = 120; state.simTime = 2;
  const player = sim.spawn({ type: 'ship', mass: 28, radius: 8, hull: 100, pos: { x: 0, z: 0 }, data: {} });
  const anchor = sim.spawn({ type: 'asteroid', mass: 640, radius: 8, hull: 100, pos: { x: 120, z: 0 }, data: {} });
  const entity = sim.spawn({ type: 'ship', mass: 28, radius: 17, hull: 105, pos: { x: 60, z: 70 },
    physicsBody: scissorwakePhysicalBody(), data: { lootTableId: C.enemyId, authoredAssetId: SCISSORWAKE_ASSET_ID } });
  state.playerId = player.id; player.isPlayer = true; ensureCombatState(state);
  const attachments = createAttachmentService({ state, bus: sim.bus, catalog: createCombatCatalog(),
    helpers: { combatPhysics: { createAttachment: spec => ({ id: spec.attachmentId }), cutAttachment: () => true } } });
  const created = attachments.create({ defId: 'tether_standard', ownerId: player.id, targetId: anchor.id,
    sourceWorld: { x: 0, z: 0 }, targetWorld: { x: 120, z: 0 } }); assert(created.ok);
  const corridor = { origin: { x: 60, z: 70 }, dir: { x: 0, z: -1 }, range: C.passRangeWu, halfWidth: C.bladeRadiusWu };
  const root = new THREE.Group(), scene = new THREE.Scene(), nodes = {};
  for (const name of SCISSORWAKE_MOTION_NODES) { const node = new THREE.Group(); node.name = name; root.add(node); nodes[name] = node; }
  const material = new THREE.MeshStandardMaterial({ emissive: 0xc47a36, emissiveIntensity: 6.6 }); material.name = 'Material_Emissive_Amber';
  const aperture = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material); root.add(aperture);
  root.userData.scissorwakeAuthoredSource = { assetId: SCISSORWAKE_ASSET_ID, file: 'assets/ships/release/parts/wholeships/scissorwake.glb' };
  scene.add(root); entity.mesh = root; state.render.scene = scene;
  const record = { entity, body: { handle: 42 }, proxyId: entity.physicsBody.collisionProxyManifest.id,
    revision: entity.physicsBody.revision, _postStepReadTick: native.tick }; native.records.set(entity.id, record);
  let currentPhase = 'spool_cue', driver = createScissorwakeVisualDriver(root, entity);
  const tick = value => { state.tick = value; state.simTime = value / 60; native.tick++; native._simTick = value; record._postStepReadTick = native.tick; };
  const phase = (name, value = state.tick) => { tick(value); currentPhase = name;
    sim.bus.emit('ai:doctrinePhase', { doctrineId: C.doctrineId, entityId: entity.id, phase: name, tick: value }); };
  const apply = () => applySpecialistCounterplay({ state, specialist: entity, enemyId: C.enemyId,
    tick: state.tick, doctrinePhase: currentPhase, attachments,
    doctrine: { phaseStartedTick: 120, cutterAttachmentId: created.attachment.id, attackLine: corridor } });
  return { sim, state, entity, player, anchor, nodes, root, scene, aperture, material, record, native,
    tick, phase, apply, line: created.attachment,
    step(a11y = {}) { driver.update(entity, state.simTime, a11y, state); },
    reopen() { driver.dispose(); driver = createScissorwakeVisualDriver(root, entity); },
    close() { driver.dispose(); sim.dispose(); aperture.geometry.dispose(); material.dispose(); } };
}
const yaw = node => new THREE.Euler().setFromQuaternion(node.quaternion).y;
const near = (a, b) => assert(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('sealed three-pivot source bank matches all source tiers at their genuine rest transforms', () => {
  const bytes = readFileSync(new URL('../assets/ships/parts/wholeships/scissorwake.glb', import.meta.url));
  const bank = JSON.parse(readFileSync(new URL('../assets/ships/motions/scissorwake.motion.json', import.meta.url)));
  validateMotionBank(bank); assert.equal(bank.sourceGlbSha256, createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(bank.bindings.map(b => b.node).sort(), [...SCISSORWAKE_MOTION_NODES].sort());
  for (const suffix of ['', '_lod1', '_lod2']) {
    const file = readFileSync(new URL(`../assets/ships/parts/wholeships/scissorwake${suffix}.glb`, import.meta.url));
    const doc = JSON.parse(file.subarray(20, 20 + file.readUInt32LE(12)).toString('utf8'));
    for (const binding of bank.bindings) {
      const node = doc.nodes.find(n => n.name === binding.node); assert(node);
      assert.deepEqual(binding.restPose.translation, node.translation || [0, 0, 0]);
      assert.deepEqual(binding.restPose.rotation, node.rotation || [0, 0, 0, 1]);
    }
  }
});

test('only a real current-life commitment opens the blades over54 ticks; the72-tick pass stays locked', () => {
  const h = fixture(); try {
    h.phase('spool_cue'); h.step(); near(yaw(h.nodes.MOTION_SCISSORWAKE_BLADE_PORT), 0);
    h.apply(); h.step(); h.tick(147); h.step();
    near(yaw(h.nodes.MOTION_SCISSORWAKE_BLADE_PORT), 12 * Math.PI / 180);
    near(yaw(h.nodes.MOTION_SCISSORWAKE_BLADE_STARBOARD), -12 * Math.PI / 180);
    assert(h.nodes.MOTION_SCISSORWAKE_SPOOL.quaternion.angleTo(new THREE.Quaternion()) > .1);
    h.phase('attach_window', 174); h.step(); near(yaw(h.nodes.MOTION_SCISSORWAKE_BLADE_PORT), 24 * Math.PI / 180);
    h.tick(220); h.step(); near(yaw(h.nodes.MOTION_SCISSORWAKE_BLADE_PORT), 24 * Math.PI / 180);
    h.tick(247); h.step(); near(yaw(h.nodes.MOTION_SCISSORWAKE_BLADE_PORT), 0);
  } finally { h.close(); }
});

test('actual attachment acceptance starts one finite recovery; cold mounting never replays its cut accent', () => {
  const h = fixture(); try {
    h.phase('spool_cue'); h.apply(); h.step(); h.tick(147); h.step();
    h.entity.pos.z = 5; h.phase('attach_window', 173); assert.equal(h.apply(), null); h.step();
    h.entity.pos.z = -5; h.tick(174); const result = h.apply(); assert(result?.ok); assert.equal(h.line.state, 'broken'); h.step();
    const bright = h.aperture.material.emissiveIntensity; assert(bright > 6.6 * .36);
    h.tick(192); h.step(); assert(h.aperture.material.emissiveIntensity < bright);
    h.reopen(); h.step(); assert(h.aperture.material.emissiveIntensity <= 6.6 * .36);
    h.tick(264); h.step(); near(yaw(h.nodes.MOTION_SCISSORWAKE_BLADE_PORT), 0); near(h.aperture.material.emissiveIntensity, 0);
    h.tick(300); h.step(); near(h.aperture.material.emissiveIntensity, 0);
  } finally { h.close(); }
});

test('reduced motion retains the open cue without spool cycling; stale native/body/life/source cannot warn', () => {
  const h = fixture(); try {
    h.phase('spool_cue'); h.apply(); h.step(); h.tick(147); h.step({ reducedMotion: true, reducedFlash: true });
    near(yaw(h.nodes.MOTION_SCISSORWAKE_BLADE_PORT), 24 * Math.PI / 180);
    near(h.nodes.MOTION_SCISSORWAKE_SPOOL.quaternion.angleTo(new THREE.Quaternion()), 0);
    const before = JSON.stringify(h.entity.data); h.step(); assert.equal(JSON.stringify(h.entity.data), before);
    h.state.tick += 3; h.step(); near(yaw(h.nodes.MOTION_SCISSORWAKE_BLADE_PORT), 0);
    h.tick(150); h.record.proxyId = 'foreign'; h.step(); near(yaw(h.nodes.MOTION_SCISSORWAKE_BLADE_PORT), 0);
    h.record.proxyId = h.entity.physicsBody.collisionProxyManifest.id;
    h.entity.data._cutterCommit.sourceLife++; h.step(); near(yaw(h.nodes.MOTION_SCISSORWAKE_BLADE_PORT), 0);
    h.entity.data._cutterCommit.sourceLife--; h.step(); assert(yaw(h.nodes.MOTION_SCISSORWAKE_BLADE_PORT) > 0);
    h.root.userData.scissorwakeAuthoredSource.assetId = 'foreign'; h.step(); near(yaw(h.nodes.MOTION_SCISSORWAKE_BLADE_PORT), 0);
    h.root.userData.scissorwakeAuthoredSource.assetId = SCISSORWAKE_ASSET_ID;
    h.state.entities.set(h.entity.id, { ...h.entity, occupantGeneration: h.entity.occupantGeneration + 1 }); h.step();
    near(yaw(h.nodes.MOTION_SCISSORWAKE_BLADE_PORT), 0);
  } finally { h.close(); }
});

test('Continue clears the cue, requiring a fresh warning; disposal restores the owned material', () => {
  const h = fixture(); try {
    h.phase('spool_cue'); h.apply(); h.tick(147); h.step(); assert(yaw(h.nodes.MOTION_SCISSORWAKE_BLADE_PORT) > 0);
    const owner = h.sim.registry.get('scissorwake'); owner.deserialize(owner.serialize());
    h.step(); assert.equal(scissorwakePresentation(h.state, h.entity), null); near(yaw(h.nodes.MOTION_SCISSORWAKE_BLADE_PORT), 0);
    h.reopen(); assert.equal(h.aperture.material !== h.material, true);
  } finally { h.close(); assert.equal(h.aperture.material, h.material); }
});
