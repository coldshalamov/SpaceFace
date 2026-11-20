import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { foundryPlateShape, foundryPlateProxy, foundryReturnCourse, predictFoundryPlateContact } from '../src/data/foundryPlate.js';
import { planArenaInstall, survivalArena } from '../src/systems/survivalArena.js';
import { createVisualFactory } from '../src/render/visualFactory.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { createBus } from '../src/core/eventBus.js';
import { createRunState } from '../src/core/runState.js';
import { createAlerts } from '../src/ui/alerts.js';
import { createStage } from '../src/ui/stage.js';
import { survivalHud } from '../src/ui/survivalHud.js';
import { projectBridgeEvent } from '../scripts/lib/simEventBridge.mjs';
import { installDom } from './helpers/mini-dom.mjs';
import { makeEntity } from '../src/core/entity.js';
import { resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { resolveCollisionProxyManifest, validateCollisionProxyManifest } from '../src/data/collisionProxyManifests.js';
import { physics } from '../src/core/physics.js';
import { compileAttackSpec } from '../src/combat/attackSpec.js';
import { createLineage } from '../src/combat/attackLineage.js';
import { resolveRicochet } from '../src/combat/surfaceReflection.js';

const near = (actual, expected, epsilon = 1e-4) => assert.ok(Math.abs(actual - expected) <= epsilon,
  `${actual} != ${expected}`);
function fixture() {
  const state = { tick: 10, simTime: 10 / 60, world: {}, entities: new Map(), entityList: [], nextEntityId: 1 };
  const helpers = { spawnEntity(spec) {
    const entity = makeEntity({ ...spec, id: state.nextEntityId++ });
    state.entities.set(entity.id, entity); state.entityList.push(entity); return entity;
  } };
  const host = Object.create(survivalArena); host.state = state; host.ctx = { helpers };
  host._roomIds = []; host._roomSolids = new Map();
  const install = planArenaInstall({ arenaId: 'helios_core', arenaPhase: 'idle', wave: 3, seed: 13304,
    anchor: { x: 700, z: -300 }, laneGate: 'ne' });
  const toys = install.toys.filter(toy => toy.kind === 'plate');
  host._materializeRoom(toys, 3);
  return { state, host, toys, plates: state.entityList, helpers };
}

test('the authored bank, live slab and native proxy share width, normal and reference mass', () => {
  const h = fixture(); const factory = createVisualFactory();
  for (let i = 0; i < h.plates.length; i++) {
    const plate = h.plates[i]; const toy = h.toys[i]; const shape = foundryPlateShape(plate);
    near(shape.halfWidth, toy.halfWidth); near(shape.radius, toy.radius);
    near(-Math.sin(plate.rot), toy.normal.x); near(Math.cos(plate.rot), toy.normal.z);
    assert.equal(plate.mass, 1690); assert.equal(plate.physicsBody.inertiaY, 456976);
    assert.equal(plate.physicsBody.dynamic, false); assert.equal(plate.hull, 101040);
    assert.equal(resolvePhysicsBodySpec(plate).mass, 1690);
    const manifest = resolveCollisionProxyManifest(plate);
    assert.equal(validateCollisionProxyManifest(manifest).ok, true);
    near(manifest.primitives[0].hx * plate.radius, shape.halfWidth);
    near(manifest.primitives[0].hz * plate.radius, shape.halfDepth);
    const visual = factory.build(plate); assert.ok(visual);
    const box = new THREE.Box3().setFromObject(visual);
    near(box.max.x, shape.halfWidth); near(box.max.z, shape.halfDepth); near(box.max.y, shape.halfHeight);
    const body = visual.children.find(object => object.isMesh);
    assert.equal(body.material.isMeshStandardMaterial, true);
    assert.equal(body.material.transparent, false, 'a bank is a solid visible surface');
    const restored = JSON.parse(JSON.stringify(plate));
    assert.deepEqual(foundryPlateShape(restored), shape);
    assert.deepEqual(foundryPlateProxy(shape), plate.physicsBody.collisionProxyManifest);
  }
});

test('actual native OBB contact lands on the visible bank face at its authored inward normal', async () => {
  const h = fixture(); const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    owner.syncFromEntities(h.plates); owner.step(1 / 60, 11);
    for (let i = 0; i < h.plates.length; i++) {
      const plate = h.plates[i]; const shape = foundryPlateShape(plate); const n = h.toys[i].normal;
      const tangent = { x: n.z, z: -n.x }; const offset = shape.halfWidth * 0.8;
      const origin = { x: plate.pos.x + tangent.x * offset + n.x * 100, y: 0,
        z: plate.pos.z + tangent.z * offset + n.z * 100 };
      const ray = new owner.RAPIER.Ray(origin, { x: -n.x, y: 0, z: -n.z });
      const collider = owner.records.get(plate.id).colliders[0];
      assert.equal(collider.shapeType(), 1, 'Rapier cuboid, not a radius26 ball');
      const hit = collider.castRayAndGetNormal(ray, 200, true); assert.ok(hit);
      near(hit.timeOfImpact, 100 - shape.halfDepth, 1e-3);
      near(hit.normal.x, n.x, 1e-5); near(hit.normal.z, n.z, 1e-5);
      const missOrigin = { x: plate.pos.x + tangent.x * (shape.halfWidth + 3) + n.x * 100, y: 0,
        z: plate.pos.z + tangent.z * (shape.halfWidth + 3) + n.z * 100 };
      assert.equal(collider.castRayAndGetNormal(new owner.RAPIER.Ray(missOrigin,
        { x: -n.x, y: 0, z: -n.z }), 200, true), null, 'empty bounding-circle corners remain passable');
    }
  } finally { owner.dispose(); }
});

test('production projectile receipt and bank reflection retain the off-center slab face normal', () => {
  const h = fixture(); const plate = h.plates[0]; const n = h.toys[0].normal;
  const tangent = { x: n.z, z: -n.x }; const shape = foundryPlateShape(plate);
  const at = (distance) => ({ x: plate.pos.x + tangent.x * 38 + n.x * distance,
    z: plate.pos.z + tangent.z * 38 + n.z * distance });
  const projectile = h.helpers.spawnEntity({ type: 'projectile', radius: 0.7, collides: true,
    pos: at(0), ownerId: 900, vel: { x: -n.x * 300, z: -n.z * 300 },
    data: { damageType: 'kinetic', damage: 1 } });
  // prevPos is a runtime integration record, not part of the factory's durable schema.
  projectile.prevPos = at(100);
  const bus = createBus(); let payload;
  bus.on('projectile:hit', value => { payload = value; });
  const host = Object.create(physics); host.init({ state: h.state, bus, helpers: h.helpers });
  host.sweepProjectiles(1 / 3, h.state);
  assert.ok(payload, 'actual production sweep issued the receipt');
  assert.equal(payload.targetId, plate.id);
  const faceDistance = (payload.pos.x - plate.pos.x) * n.x + (payload.pos.z - plate.pos.z) * n.z;
  near(faceDistance, shape.halfDepth + projectile.radius);
  near(payload.normal.x, n.x, 1e-5); near(payload.normal.z, n.z, 1e-5);
  assert.deepEqual(payload.normal, payload.receipt.normal);
  const compiled = compileAttackSpec({ weaponId: 'wpn_pulse_laser_s', modifiers: [['mod_bank_shot', 1]] });
  assert.equal(compiled.ok, true);
  const result = resolveRicochet(createLineage({ spec: compiled.spec }), compiled.spec, payload.receipt, projectile);
  assert.equal(result.ok, true); near(result.velocity.x, n.x * 300, 1e-3); near(result.velocity.z, n.z * 300, 1e-3);
});

test('legacy room plates retain their datum while gate contacts use the visible post footprint', () => {
  const legacy = foundryPlateShape({ radius: 26, data: { roomKind: 'plate' } });
  assert.equal(legacy.referenceRadius, 26); assert.equal(legacy.halfWidth, 48);
  assert.equal(legacy.halfDepth, 16.900000000000002);
  const h = fixture();
  h.host._materializeRoom([{ id: 'gate', kind: 'gate', solid: true, radius: 16, pos: { x: -400, z: -400 } }], 3);
  const gate = h.state.entityList.at(-1);
  assert.equal(gate.radius, 16);
  const proxy = resolveCollisionProxyManifest(gate);
  assert.equal(proxy.id, 'foundry:furniture-gate');
  assert.equal(proxy.compactHull.length, 6);
  near(Math.max(...proxy.compactHull.map(p => Math.hypot(p.x, p.z))) * gate.radius, 3.2);
  assert.equal(gate.mass, 640); assert.equal(gate.rot, 0);
});

test('the Foundry round panel shows return guidance, yields to an actual bank approach, and clears each cue', () => {
  const { document, restore } = installDom();
  const panel = Object.create(survivalHud);
  try {
    const removeChild = child => { child.remove(); return child; };
    const hudRoot = document.createElement('div');
    hudRoot.id = 'hud';
    const panelHost = document.createElement('div');
    panelHost.className = 'sf-leftcontext';
    panelHost.removeChild = removeChild;
    hudRoot.appendChild(panelHost);
    document.body.appendChild(hudRoot);
    const stage = createStage({ document });
    const alerts = document.createElement('div');
    alerts.id = 'alerts';
    stage.slotEl('banner').appendChild(alerts);
    const h = fixture();
    h.state.mode = 'flight';
    h.state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 });
    Object.assign(h.state.run, { arenaId: 'helios_core', wave: 1, phase: 'active' });
    h.state.settings = { gameplay: { physicsBackend: 'rapier-dynamic' } };
    const bank = h.plates[0];
    // Saved seed 4242, 1.25 simulated seconds before the first observed bank impact.
    bank.pos = { x: -1651.9338133418412, z: -2332.6958429984616 };
    bank.rot = 1.079603700927107;
    const pilot = h.helpers.spawnEntity({ type: 'ship', alive: true, radius: 16,
      pos: { x: -1854.31298828125, z: -2214.513916015625 },
      vel: { x: 148.0164794921875, z: -64.03546142578125 } });
    h.state.playerId = pilot.id;
    const hud = createBus();
    createAlerts({ bus: hud, state: h.state, stage });
    panel.init({ bus: hud, state: h.state });
    hud.emit('alert', { key: 'other', text: 'Separate status', ttl: null });
    alerts.firstElementChild.removeChild = removeChild;
    hud.emit('alert', { key: 'foundry-return', sev: 'info', text: 'Foundry gate →', ttl: null });
    const guidance = expected => {
      const line = panelHost.querySelector('.sf-crun__guidance');
      assert.ok(line && !line.hidden && !line.parentElement.hidden, 'guidance is exposed in the flight panel');
      assert.equal(line.textContent, expected);
      assert.equal(line.classList.contains('sf-crun__intro'), false, 'mobile collapsed intro policy cannot hide guidance');
      assert.equal(panelHost.querySelector('.sf-crun__phase').textContent, 'FIGHT');
      assert.equal(alerts.textContent, 'Separate status', 'the guidance does not displace or duplicate the ordinary banner');
    };
    let spoken = 0;
    hud.on('voice:say', () => spoken++);
    h.host.bus = createBus();
    const updates = [];
    h.host.bus.on('alert', payload => {
      updates.push(payload);
      const bridged = projectBridgeEvent('alert', payload);
      assert.equal(bridged.lane, 'presentation');
      hud.emit('alert', bridged.flat);
    });
    const repaint = () => panel.update(1 / 60, h.state);
    const step = tick => { h.state.tick = tick; h.host.update(1 / 60, h.state); repaint(); };
    repaint();
    guidance('Foundry gate →');
    step(264);
    guidance('Bank plate ahead · Turn clear');
    step(268);
    assert.equal(updates.length, 1, 'one approach does not turn into repeated alerts');
    pilot.vel.x *= -1;
    pilot.vel.z *= -1;
    step(272);
    guidance('Foundry gate →');
    hud.emit('alert', { key: 'foundry-return', action: 'clear' });
    repaint();
    assert.equal(panelHost.querySelector('.sf-crun__guidance'), null);
    hud.emit('alert', { key: 'foundry-return', sev: 'info', text: 'Foundry gate →', ttl: null });
    hud.emit('run:started', {});
    repaint();
    assert.equal(panelHost.querySelector('.sf-crun__guidance'), null, 'Again starts with clear guidance');
    h.state.run = null;
    hud.emit('alert', { key: 'other', text: 'Adventure status', ttl: null });
    repaint();
    assert.equal(alerts.textContent, 'Adventure status');
    assert.equal(spoken, 0);
  } finally {
    panel.destroy();
    restore();
  }
});

test('plate warning geometry uses the closing face and leaves the empty rounded corner clear', () => {
  const { plates } = fixture();
  const slab = plates[0];
  const { halfWidth, halfDepth, rot } = foundryPlateShape(slab);
  const toWorld = (x, z) => ({ x: x * Math.cos(rot) - z * Math.sin(rot), z: x * Math.sin(rot) + z * Math.cos(rot) });
  const pilot = (x, z, vx, vz) => {
    const start = toWorld(x, z);
    return { pos: { x: slab.pos.x + start.x, z: slab.pos.z + start.z }, vel: toWorld(vx, vz), radius: 16 };
  };
  const face = predictFoundryPlateContact(slab, pilot(halfWidth - 8, halfDepth + 70, 0, -100), 1.5);
  near(face.timeToContactS, 0.54);
  near(face.closingSpeed, 100);
  const n = toWorld(0, 1);
  near(face.normal.x, n.x);
  near(face.normal.z, n.z);
  const corner = predictFoundryPlateContact(slab, pilot(halfWidth + 8, halfDepth + 70, 0, -100), 1.5);
  near(corner.timeToContactS, (70 - Math.sqrt(16 * 16 - 8 * 8)) / 100);
  near(corner.closingSpeed, 100 * Math.sqrt(0.75));
  assert.equal(predictFoundryPlateContact(slab, pilot(halfWidth + 13.6, halfDepth + 12.8, 50, -50), 1.5), null);
  assert.equal(predictFoundryPlateContact(slab, pilot(-halfWidth, halfDepth + 17, 100, 0), 1.5), null);
});

test('the Foundry shows one gate home through the real rim gap, then clears it inside', () => {
  const h = fixture();
  const at = { x: -1900, z: -2200 };
  const pilot = h.helpers.spawnEntity({ type: 'ship', alive: true, radius: 16, pos: at, vel: { x: 0, z: 0 } });
  h.state.playerId = pilot.id;
  h.state.mode = 'flight';
  h.state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 });
  Object.assign(h.state.run, { arenaId: 'helios_core', wave: 1, phase: 'wave_intro' });
  h.state.settings = { gameplay: { physicsBackend: 'rapier-dynamic' } };
  h.helpers.removeEntity = id => { h.state.entities.get(id).alive = false; h.state.entities.delete(id); };
  h.host.bus = createBus();
  const alerts = [];
  h.host.bus.on('alert', payload => alerts.push(payload));
  h.host._onWavePlanned({ wave: 1, plan: { arenaPhase: 'idle', packages: [] } });
  const step = (tick, x, z) => {
    h.state.tick = tick;
    pilot.pos = { x: at.x + x, z: at.z + z };
    h.host.update(1 / 60, h.state);
  };
  const markers = () => h.state.entityList.filter(row => row.alive && row.data?.foundryReturnGate);
  step(8, 0, 0);
  h.state.run.phase = 'active';
  step(12, 350, 0);
  assert.deepEqual(markers(), []);
  const a = Math.PI / 30;
  step(16, 460 * Math.cos(a), 460 * Math.sin(a));
  assert.equal(markers().length, 1);
  const marker = markers()[0];
  assert.equal(marker.data.scanLabel, 'Foundry gate');
  assert.equal(marker.physicsBody, false);
  assert.equal(marker.collides, false);
  near(marker.pos.x, at.x + 410 * Math.cos(Math.PI / 12));
  near(marker.pos.z, at.z);
  assert.equal(createVisualFactory().build(marker).userData.visualLanguage, 'circuit-zone');
  assert.match(alerts.at(-1).text, /Circle outside the rim/);
  const course = () => foundryReturnCourse(h.host._foundryReturnGuide, pilot, h.host._foundryReturnGate);
  const advance = (tick, point) => step(tick, point.x - at.x, point.z - at.z);
  advance(20, course().aim);
  const turn = course();
  assert.ok(!turn.throughGap && Math.hypot(turn.aim.x - pilot.pos.x, turn.aim.z - pilot.pos.z) > 1,
    'the outside leg gives way to a real turn around the rim');
  advance(24, turn.aim);
  assert.equal(markers()[0], marker);
  assert.match(alerts.at(-1).text, /^Foundry gate →$/);
  const receiptCount = alerts.length;
  advance(28, pilot.pos);
  assert.equal(alerts.length, receiptCount);
  advance(32, course().aim);
  assert.deepEqual(markers(), []);
  assert.equal(alerts.at(-1).action, 'clear');
  step(36, 610, 0);
  assert.equal(markers().length, 1);
  h.host.newGame();
  assert.deepEqual(markers(), []);
  assert.equal(alerts.at(-1).action, 'clear');
});
