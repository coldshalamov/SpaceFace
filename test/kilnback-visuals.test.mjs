import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createSimulation } from '../src/core/sim.js';
import { KILNBACK as C } from '../src/data/kilnback.js';
import { kilnback } from '../src/systems/kilnback.js';
import { fields } from '../src/systems/fields.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { validateMotionBank } from '../src/contracts/motionBank.js';
import { createKilnbackVisualDriver, KILNBACK_ASSET_ID, KILNBACK_MOTION_NODES } from '../src/render/kilnbackVisuals.js';

function fixture() {
  const oldFlag = FIELD_FLAGS.enabled; FIELD_FLAGS.enabled = true;
  const native = { tick: 717, _simTick: 120, records: new Map() };
  const physics = { name: 'physics', init() { this._sg02 = native; this._diag = { backend: 'rapier-dynamic', sg02Ready: true }; } };
  const sim = createSimulation({ seed: 83, systems: [physics, fields, kilnback] }), state = sim.state;
  state.mode = 'flight'; state.tick = 120; state.simTime = 2; state.world.currentSectorId = C.sectorId;
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const entity = sim.spawn({ type: 'ship', mass: 180, radius: 23, hull: 220, alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: { lootTableId: C.enemyId } });
  const owner = sim.registry.get('kilnback'), row = owner.bind(entity, 'visual-fixture');
  const root = new THREE.Group(), scene = new THREE.Scene(), nodes = {};
  for (const name of KILNBACK_MOTION_NODES) { const node = new THREE.Group(); node.name = name; root.add(node); nodes[name] = node; }
  const material = new THREE.MeshStandardMaterial({ color: 0x776633, emissive: 0xc87935, emissiveIntensity: 6.6 });
  material.name = 'Material_Emissive_Amber';
  const glow = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material); root.add(glow);
  const ceramic = new THREE.MeshStandardMaterial({ color: 0xa29a86, roughness: .6 }); ceramic.name = 'Material_Ceramic';
  const tank = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ceramic); nodes.MOTION_KILNBACK_CASK_PORT.add(tank);
  root.userData.kilnbackAuthoredSource = { assetId: KILNBACK_ASSET_ID, file: 'assets/ships/release/parts/wholeships/kilnback.glb' };
  scene.add(root); entity.mesh = root; state.render.scene = scene;
  const record = { entity, body: { handle: 42 }, proxyId: '', revision: 0, _postStepReadTick: native.tick };
  native.records.set(entity.id, record);
  const sync = () => { native.tick++; native._simTick = state.tick; record._postStepReadTick = native.tick;
    record.proxyId = entity.physicsBody.collisionProxyManifest.id; record.revision = entity.physicsBody.revision; };
  sync();
  const phase = (name, age = 0) => { row.phase = name; row.phaseStartTick = state.tick - age; sync(); };
  const driver = createKilnbackVisualDriver(root, entity);
  return { sim, state, root, scene, entity, row, owner, native, record, nodes, driver, glow, material, ceramic, tank, phase, sync,
    step(a11y = {}) { driver.update(entity, state.simTime, a11y, state); },
    close() { driver.dispose(); owner.destroy(); sim.dispose(); FIELD_FLAGS.enabled = oldFlag; glow.geometry.dispose(); material.dispose(); tank.geometry.dispose(); ceramic.dispose(); } };
}
const pitch = node => new THREE.Euler().setFromQuaternion(node.quaternion).x;
const near = (a, b) => assert(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const heat = root => root.getObjectByName('KILNBACK_CAUSAL_THERMAL').children.filter(n => n.name === 'KILNBACK_ACCEPTED_HEAT');

test('sealed eight-group bank preserves the three actual source tiers and cask handoff rest poses', () => {
  const bytes = readFileSync(new URL('../assets/ships/parts/wholeships/kilnback.glb', import.meta.url));
  const bank = JSON.parse(readFileSync(new URL('../assets/ships/motions/kilnback.motion.json', import.meta.url)));
  validateMotionBank(bank); assert.equal(bank.sourceGlbSha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(bank.sourceAssetId, KILNBACK_ASSET_ID);
  assert.deepEqual(bank.bindings.map(b => b.node).sort(), [...KILNBACK_MOTION_NODES].sort());
  for (const suffix of ['', '_lod1', '_lod2']) {
    const data = readFileSync(new URL(`../assets/ships/parts/wholeships/kilnback${suffix}.glb`, import.meta.url));
    const doc = JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString('utf8'));
    for (const binding of bank.bindings) {
      const node = doc.nodes.find(n => n.name === binding.node); assert(node);
      assert.deepEqual(binding.restPose.translation, node.translation || [0, 0, 0]);
      assert.deepEqual(binding.requiredAtLod, [0, 1, 2]);
    }
  }
  near(bank.bindings.find(b => b.node === 'MOTION_KILNBACK_CASK_PORT').restPose.translation[2], -10);
  near(bank.bindings.find(b => b.node === 'MOTION_KILNBACK_CASK_STARBOARD').restPose.translation[2], 10);
});

test('preheat opens over72 ticks, actual burn locks open, and reduced motion retains the warning', () => {
  const h = fixture(); try {
    h.step(); near(pitch(h.nodes.MOTION_KILNBACK_SLAT_1), 0); near(h.glow.material.emissiveIntensity, 0);
    h.phase('preheat', 36); h.step(); near(pitch(h.nodes.MOTION_KILNBACK_SLAT_1), 27.5 * Math.PI / 180);
    assert.notEqual(h.tank.material.color.getHex(), h.ceramic.color.getHex());
    h.step({ reducedMotion: true }); near(pitch(h.nodes.MOTION_KILNBACK_SLAT_1), 55 * Math.PI / 180);
    h.phase('burn'); h.step(); near(pitch(h.nodes.MOTION_KILNBACK_SLAT_6), 55 * Math.PI / 180);
    h.phase('vent', 149); h.step(); assert(h.glow.material.emissiveIntensity < .02);
    h.phase('retreat'); h.step(); near(pitch(h.nodes.MOTION_KILNBACK_SLAT_1), 0); assert.equal(h.tank.material.color.getHex(), h.ceramic.color.getHex());
  } finally { h.close(); }
});

test('a consumed pulse cannot claim heat; only an actual finite source field draws a world-anchored lane', () => {
  const h = fixture(); try {
    h.phase('burn'); h.row.pulse = 3; h.step(); assert(heat(h.root).every(n => !n.visible));
    const field = h.sim.registry.get('fields').registerThermal({ id: 'accepted-fixture-lane', kind: 'cone',
      center: { x: 14, z: 0 }, dir: { x: 1, z: 0 }, radius: C.range, halfAngleRad: C.halfAngle,
      durationS: C.pulseSeconds, ownerId: h.entity.id, thermal: { family: 'kilnback', kind: 'burn',
        sourceKey: h.row.key, ownerLife: h.entity.occupantGeneration, attackId: h.row.key + ':attack:0' } });
    assert(field); h.step(); const lane = heat(h.root).find(n => n.visible); assert(lane); near(lane.position.x, 14);
    h.root.position.x = 30; h.state.world.frameOrigin = { x: 100, z: 0 }; h.step();
    near(lane.getWorldPosition(new THREE.Vector3()).x, -86);
    h.state.simTime += C.pulseSeconds + .01; h.step(); assert(heat(h.root).every(n => !n.visible));
  } finally { h.close(); }
});

test('a source-owned cask handoff waits for native revision then leaves the exact authored gap', () => {
  const h = fixture(); try {
    h.step(); assert(h.nodes.MOTION_KILNBACK_CASK_PORT.visible);
    assert(h.owner.sever(h.row.key, 'cask_port').ok); h.step();
    assert(h.nodes.MOTION_KILNBACK_CASK_PORT.visible, 'native replacement has not accepted its new revision yet');
    h.sync(); h.step(); assert.equal(h.nodes.MOTION_KILNBACK_CASK_PORT.visible, false);
    assert.equal(h.nodes.MOTION_KILNBACK_CASK_STARBOARD.visible, true);
    h.phase('vent'); h.step();
    const vapor = h.root.getObjectByName('KILNBACK_CAUSAL_THERMAL').children.filter(n => n.name === 'KILNBACK_FINITE_CONDENSATION');
    assert.equal(vapor[0].visible, false); assert.equal(vapor[1].visible, true);
  } finally { h.close(); }
});

test('future phases, native staleness and replaced occupants rest without simulation writes; disposal restores materials', () => {
  const h = fixture(); try {
    assert.equal(createKilnbackVisualDriver(h.root, { ...h.entity, data: {} }), null);
    h.phase('preheat', 36); const before = JSON.stringify(h.row); h.step(); assert.equal(JSON.stringify(h.row), before);
    h.row.phaseStartTick = h.state.tick + 1; h.step(); near(pitch(h.nodes.MOTION_KILNBACK_SLAT_1), 0);
    h.phase('burn'); h.state.tick += 3; h.step(); near(pitch(h.nodes.MOTION_KILNBACK_SLAT_1), 0);
    h.sync(); h.step(); assert(pitch(h.nodes.MOTION_KILNBACK_SLAT_1) > 0);
    h.state.entities.set(h.entity.id, { ...h.entity, occupantGeneration: h.entity.occupantGeneration + 1 });
    h.step(); near(pitch(h.nodes.MOTION_KILNBACK_SLAT_1), 0);
    h.driver.dispose(); assert.equal(h.glow.material, h.material); assert.equal(h.tank.material, h.ceramic);
    assert.equal(h.root.getObjectByName('KILNBACK_CAUSAL_THERMAL'), undefined);
  } finally { h.close(); }
});
