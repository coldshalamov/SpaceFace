import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { setPresentationAdmission, PRESENTATION_ADMISSION } from '../src/core/presentationAdmission.js';
import { mothlight } from '../src/systems/mothlight.js';
import { weapons } from '../src/systems/weapons.js';
import { MOTHLIGHT as C, MOTH_ENEMY as E } from '../src/data/mothlight.js';
import { mothlightPhysicalBody } from '../src/data/mothlightBody.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { normalizeActivity } from '../src/ai/doctrine.js';
import { createMothlightVisualDriver, MOTHLIGHT_MOTION_NODES } from '../src/render/mothlightVisuals.js';
import { validateMotionBank } from '../src/contracts/motionBank.js';

const near = (a, b) => assert(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const yaw = node => new THREE.Euler().setFromQuaternion(node.quaternion).y;
async function fixture() {
  const native = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  const physics = { name: 'physics', init() { this._sg02 = native; } };
  const sim = createSimulation({ seed: 10, systems: [physics, mothlight, weapons] }), s = sim.state;
  s.mode = 'flight'; s.tick = 120; s.simTime = 2; s.world.currentSectorId = C.sectorId;
  s.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const player = sim.spawn({ type: 'ship', team: 0, hull: 1000, mass: 40, radius: 4, pos: { x: 400, z: 0 },
    physicsBody: { schemaVersion: 1, shape: 'ball', dynamic: true, radius: 4, mass: 40, inertiaY: 80 }, data: {} }); s.playerId = player.id; player.isPlayer = true;
  const spec = makeShipEntitySpec(E.shipId, { team: 1, factionId: E.factionId, pos: { x: 0, z: 0 } });
  Object.assign(spec, { hull: E.hull, hullMax: E.hull, cap: E.cap, capMax: E.cap, shield: 0, mass: 60, physicsBody: mothlightPhysicalBody() });
  Object.assign(spec.data, { lootTableId: C.enemyId, weapons: [{ defId: C.weaponId, slotIndex: 0, _cooldown: 0 }], fittings: [], miningBeam: null,
    combat: { targetId: player.id }, intent: { fire: true, aimAngle: 0, targetId: player.id },
    ai: { archetype: E.aiArchetype, combatDoctrineId: E.combatDoctrineId, activity: normalizeActivity({ kind: 'attack_run', startedTick: 0 }),
      roe: 'weapons_free', motive: 'industrial_interdiction', engagementTrigger: 'mothlight_lane', zoneId: 'visual:mothlight',
      approachTelegraph: E.telegraph.line, noFireResponseWindowS: 1 } });
  const tender = sim.spawn(spec), owner = sim.registry.get('mothlight'); tender.data.encounter = { id: 'visual:mothlight' };
  const row = owner.bind(tender, 'visual'); native.syncFromEntities(s.entityList); native.step(1 / 60, s.tick);
  const scene = new THREE.Scene(); s.render.scene = scene; const views = [];
  setPresentationAdmission(player, PRESENTATION_ADMISSION.ready);
  function visual(e, lamp = false) {
    const root = new THREE.Group(), nodes = {};
    if (!lamp) for (const name of MOTHLIGHT_MOTION_NODES) { const node = new THREE.Group(); node.name = name; root.add(node); nodes[name] = node; }
    const material = new THREE.MeshStandardMaterial({ emissive: 0xb47938, emissiveIntensity: 6.6 }); material.name = 'Material_Emissive_Amber';
    const glow = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material); root.add(glow);
    root.userData.mothlightAuthoredSource = { assetId: lamp ? 'SF_PROP_MOTHLIGHT_LAMP' : 'SF_SHIP_MOTHLIGHT_TENDER',
      file: `assets/ships/release/parts/wholeships/${lamp ? 'mothlight_lamp' : 'mothlight'}.glb` };
    scene.add(root); e.mesh = root; setPresentationAdmission(e, PRESENTATION_ADMISSION.ready);
    let driver = createMothlightVisualDriver(root, e);
    const view = { root, nodes, glow, e, step(a11y = {}) { driver.update(e, s.simTime, a11y, s); },
      reopen() { driver.dispose(); driver = createMothlightVisualDriver(root, e); },
      close() { driver.dispose(); glow.geometry.dispose(); material.dispose(); } }; views.push(view); return view;
  }
  const main = visual(tender), shots = []; sim.bus.on('combat:fire', p => { if (p.ownerId === tender.id) shots.push(p); });
  const tick = () => { s.tick++; s.simTime = s.tick / 60; owner.update(1 / 60, s); sim.registry.get('weapons').update(1 / 60, s);
    native.syncFromEntities(s.entityList); native.step(1 / 60, s.tick); for (const view of views) view.step(); };
  const until = fn => { let n = 0; while (!fn() && n++ < 600) tick(); assert(fn(), `phase ${row.phase}`); };
  return { sim, s, native, tender, owner, row, main, visual, tick, until, shots,
    close() { for (const view of views) view.close(); sim.dispose(); native.dispose(); } };
}

test('sealed twelve-group bank and all three tiers retain source iris, hatch and original lamp coordinates', () => {
  const bank = JSON.parse(readFileSync(new URL('../assets/ships/motions/mothlight.motion.json', import.meta.url))); validateMotionBank(bank);
  assert.equal(bank.sourceAssetId, 'SF_SHIP_MOTHLIGHT_TENDER'); assert.deepEqual(bank.bindings.map(b => b.node).sort(), [...MOTHLIGHT_MOTION_NODES].sort());
  for (const suffix of ['', '_lod1', '_lod2']) {
    const bytes = readFileSync(new URL(`../assets/ships/parts/wholeships/mothlight${suffix}.glb`, import.meta.url));
    const doc = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
    for (const b of bank.bindings) { const n = doc.nodes.find(n => n.name === b.node); assert(n); assert.deepEqual(n.translation, b.restPose.translation); }
  }
});

test('actual forty-eight-tick supply hatch hands off one original only after native stock revision acceptance', async () => {
  const h = await fixture(); try {
    h.main.step(); h.until(() => h.row.phase === 'deploy'); for (let i = 0; i < 24; i++) h.tick();
    near(h.main.nodes.MOTION_MOTHLIGHT_HATCH_1.position.z, -1.8); assert(h.main.nodes.MOTION_MOTHLIGHT_STOCK_1.visible);
    h.until(() => h.row.lamps.lamp_1.status === 'releasing'); assert.equal(h.tender.mass, 58);
    assert.equal(h.main.nodes.MOTION_MOTHLIGHT_STOCK_1.visible, false); h.tick();
    const loose = h.owner._find(h.row.key, 'lamp_1'); assert(loose); assert.equal(loose.mass, 2);
    for (const name of ['MOTION_MOTHLIGHT_STOCK_2', 'MOTION_MOTHLIGHT_STOCK_3', 'MOTION_MOTHLIGHT_STOCK_4']) assert(h.main.nodes[name].visible);
    assert.equal(h.s.entityList.filter(e => e.alive && e.data.mothlightLampId).length, 1);
  } finally { h.close(); }
});

test('false ballistic cap and real six-petal iris share the actual charge envelope; only accepted true fire earns a finite close', async () => {
  const h = await fixture(); try {
    h.until(() => h.row.phase === 'false_charge'); const e = h.owner._find(h.row.key, h.row.falseLampId); const lamp = h.visual(e, true);
    for (let i = 0; i < 33; i++) h.tick(); near(lamp.glow.material.emissiveIntensity, 6.6 * .54);
    near(yaw(h.main.nodes.MOTION_MOTHLIGHT_IRIS_1), 0); near(h.main.glow.material.emissiveIntensity, 0);
    h.until(() => h.row.phase === 'true_charge'); for (let i = 0; i < 33; i++) h.tick();
    near(h.main.glow.material.emissiveIntensity, 6.6 * .54); near(yaw(h.main.nodes.MOTION_MOTHLIGHT_IRIS_1), 12 * Math.PI / 180);
    near(lamp.glow.material.emissiveIntensity, 0); const before = JSON.stringify(h.row); h.main.step(); assert.equal(JSON.stringify(h.row), before);
    h.until(() => h.shots.length === 1); near(yaw(h.main.nodes.MOTION_MOTHLIGHT_IRIS_1), 24 * Math.PI / 180);
    h.main.reopen(); h.main.step(); near(yaw(h.main.nodes.MOTION_MOTHLIGHT_IRIS_1), 0, 'cold mount never replays accepted shot');
    for (let i = 0; i < 20; i++) h.tick(); near(yaw(h.main.nodes.MOTION_MOTHLIGHT_IRIS_1), 0); assert.equal(h.shots.length, 1);
  } finally { h.close(); }
});

test('denied gunfire, reduced motion, stale native/life/source and scene hiding never manufacture shot animation', async () => {
  const h = await fixture(); try {
    h.until(() => h.row.phase === 'true_charge'); for (let i = 0; i < 12; i++) h.tick();
    h.main.step({ reducedMotion: true, reducedFlash: true }); near(yaw(h.main.nodes.MOTION_MOTHLIGHT_IRIS_1), 24 * Math.PI / 180);
    h.tender.cap = 0; h.until(() => h.row.phase === 'reload'); assert.equal(h.shots.length, 0);
    assert.equal(h.row.acceptedAttack, null); // Warning machinery parks; it earns no shot receipt or accent.
    for (let i = 0; i < 22; i++) h.tick(); near(yaw(h.main.nodes.MOTION_MOTHLIGHT_IRIS_1), 0);
    h.until(() => h.row.phase === 'true_charge'); for (let i = 0; i < 12; i++) h.tick(); assert(yaw(h.main.nodes.MOTION_MOTHLIGHT_IRIS_1) > 0);
    h.s.tick += 3; h.main.step(); near(yaw(h.main.nodes.MOTION_MOTHLIGHT_IRIS_1), 0);
    h.native.syncFromEntities(h.s.entityList); h.native.step(1 / 60, h.s.tick); h.main.step(); assert(yaw(h.main.nodes.MOTION_MOTHLIGHT_IRIS_1) > 0);
    h.main.root.visible = false; h.main.step(); near(yaw(h.main.nodes.MOTION_MOTHLIGHT_IRIS_1), 0); h.main.root.visible = true;
    h.main.root.userData.mothlightAuthoredSource.file = 'wrong.glb'; h.main.step(); near(yaw(h.main.nodes.MOTION_MOTHLIGHT_IRIS_1), 0);
    h.s.entities.set(h.tender.id, { ...h.tender, occupantGeneration: h.tender.occupantGeneration + 1 }); h.main.step(); near(yaw(h.main.nodes.MOTION_MOTHLIGHT_IRIS_1), 0);
  } finally { h.close(); }
});
