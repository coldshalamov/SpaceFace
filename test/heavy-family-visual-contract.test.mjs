import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createVisualFactory } from '../src/render/visualFactory.js';
import { installVisualOverrides } from '../src/render/visualOverrides.js';
import {
  audio,
  HEAVY_AUDIO_SIGNATURES,
  resolveHeavyPresentationAudioCue,
} from '../src/audio/audioSystem.js';
import { vfx } from '../src/render/vfx.js';

function canvasStub() {
  const context = {
    createImageData(width, height) { return { data: new Uint8ClampedArray(width * height * 4), width, height }; },
    putImageData() {}, fillRect() {}, strokeRect() {}, clearRect() {}, drawImage() {}, fillText() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {}, fill() {}, stroke() {}, clip() {},
    quadraticCurveTo() {}, bezierCurveTo() {}, measureText() { return { width: 10 }; },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
  };
  return { width: 256, height: 256, getContext: () => context };
}

globalThis.document ||= { createElement: () => canvasStub() };
globalThis.__SF_VISUAL_FACTORY_THROW__ = true;

const HEAVIES = [
  ['heavy_gunship', 'ship_bastion', 'heavy_gunship_world_identity'],
  ['heavy_ramscoop', 'ship_bastion', 'heavy_ramscoop_world_identity'],
  ['heavy_carrier_lite', 'ship_atlas', 'heavy_carrier_lite_world_identity'],
  ['heavy_foundry', 'ship_atlas', 'heavy_foundry_world_identity'],
];

function heavyEntity(id, lootTableId, defId, x = 0, z = 0) {
  return {
    id, type: 'ship', alive: true, team: 1, factionId: 'faction_reach', radius: 30,
    hull: 500, hullMax: 500, pos: { x, z }, vel: { x: 0, z: 0 },
    data: { defId, lootTableId, enemyTypeId: lootTableId, fittings: [], visualTier: 3 },
  };
}

function heavyPart(id, parentId, partId, radius = 5) {
  return {
    id, type: 'heavyPart', alive: true, team: 1, factionId: 'faction_reach', radius,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    data: { parentId, partId, heavyPartState: 'mounted' },
  };
}

function descendants(root, predicate) {
  const found = [];
  root.traverse((object) => { if (predicate(object)) found.push(object); });
  return found;
}

function named(root, pattern) {
  return descendants(root, (object) => pattern.test(object.name));
}

function makeBus() {
  const handlers = new Map();
  return {
    on(name, fn) {
      const list = handlers.get(name) || [];
      list.push(fn);
      handlers.set(name, list);
      return () => {
        const index = list.indexOf(fn);
        if (index >= 0) list.splice(index, 1);
      };
    },
    emit(name, payload) { for (const fn of handlers.get(name) || []) fn(payload); },
  };
}

function settle(entity, start = 0, frames = 75) {
  const update = entity.mesh && entity.mesh.userData.updateRuntimeState;
  if (typeof update !== 'function') return;
  for (let frame = 1; frame <= frames; frame++) update(entity, start + frame / 60);
}

test('four Plan 14 heavy ids own distinct hard-geometry world identities', () => {
  const factory = createVisualFactory();
  for (let i = 0; i < HEAVIES.length; i++) {
    const [stableId, defId, silhouette] = HEAVIES[i];
    const entity = heavyEntity(100 + i, stableId, defId);
    const root = factory.build(entity);
    assert.equal(root.userData.heavyPresentationId, stableId);
    assert.equal(root.userData.enemySilhouette, silhouette);
    assert.equal(root.userData.genericShipOverlaysSuppressed, true);
    assert.equal(root.userData.presentationScope, 'plan14-heavy-family-component');
    assert.equal(descendants(root, (object) => object.isSprite || object.isPoints).length, 0,
      `${stableId} uses no billboard or point identity substrate`);
    assert.equal(named(root, /DecalShell|NavBlinker|WeaponProp|Generic/i).length, 0,
      `${stableId} receives no generic ship overlay`);
  }

  const gunship = factory.build(heavyEntity(201, 'heavy_gunship', 'ship_bastion'));
  assert.equal(named(gunship, /GunshipWidePressureHull/).length, 1);
  assert.equal(named(gunship, /GunshipVisibleTurretSocket/).length, 2);

  const ramscoop = factory.build(heavyEntity(202, 'heavy_ramscoop', 'ship_bastion'));
  assert.equal(named(ramscoop, /RamscoopWedgeCheek/).length, 2);
  assert.equal(named(ramscoop, /RamscoopOversizedDriveWell/).length, 1);

  const carrier = factory.build(heavyEntity(203, 'heavy_carrier_lite', 'ship_atlas'));
  assert.equal(named(carrier, /CarrierLiteSeparatedFlightDeck/).length, 2);

  const foundry = factory.build(heavyEntity(204, 'heavy_foundry', 'ship_atlas'));
  assert.equal(named(foundry, /FoundryCargoSpine$/).length, 1);
  assert.equal(named(foundry, /FoundryPhysicalDrillHead/).length, 1);
  assert.equal(named(foundry, /FoundryCargoSpineClamp/).length, 4);
});

test('direct authored mounting preserves heavy designed-procedural identity admission', () => {
  const factory = installVisualOverrides(createVisualFactory(), {
    releaseMode: true,
    directAuthoredMount: true,
  });
  for (let i = 0; i < HEAVIES.length; i++) {
    const [stableId, defId, silhouette] = HEAVIES[i];
    const entity = heavyEntity(300 + i, stableId, defId);
    const visual = factory.build(entity);
    assert.equal(visual.userData.authoredAdmissionSubstrate, undefined);
    assert.equal(visual.userData.authoredAssetState, 'designed-procedural-settled');
    assert.equal(visual.userData.authoredVisualRoot, `${silhouette}-hard-geometry`);
    assert.equal(visual.userData.heavyPresentationId, stableId);
    assert.equal(visual.visible, true);
  }
});

test('physical heavy parts and charged ore own readable opaque production forms', () => {
  const factory = createVisualFactory();
  const parts = [
    heavyPart(401, 1, 'heavy_gunship_turret_ring_port'),
    heavyPart(402, 2, 'heavy_ramscoop_armored_prow', 7),
    heavyPart(403, 2, 'heavy_ramscoop_drive_cluster', 7),
    heavyPart(404, 3, 'heavy_carrier_lite_bay_port', 6),
    heavyPart(405, 4, 'heavy_foundry_cutter_port', 6),
    heavyPart(406, 4, 'heavy_foundry_ore_mine_rack', 6),
  ];
  for (const part of parts) {
    part.mesh = factory.build(part);
    assert.equal(part.mesh.userData.heavyPartVisual, true);
    assert.equal(part.mesh.userData.heavyPartId, part.data.partId);
    assert.equal(descendants(part.mesh, (object) => object.isSprite || object.isPoints).length, 0);
  }
  assert.equal(named(parts[0].mesh, /HeavyTurretVisibleRing/).length, 1);
  assert.equal(named(parts[1].mesh, /RamscoopPhysicalProwPlate/).length, 1);
  const plasmaSheets = named(parts[2].mesh, /RamscoopAdvectedPlasmaSheet/);
  assert.equal(plasmaSheets.length, 3);
  assert.ok(plasmaSheets.every((sheet) => sheet.material.isShaderMaterial && sheet.geometry.type === 'BufferGeometry'));
  assert.equal(named(parts[3].mesh, /CarrierPhysicalHangarMouth/).length, 1);
  assert.equal(named(parts[3].mesh, /CarrierBayRetractingDoor/).length, 2);
  assert.equal(named(parts[4].mesh, /FoundryCutterLoadBoom/).length, 1);
  assert.equal(named(parts[5].mesh, /FoundryRackPhysicalOreLoad/).length, 3);

  const ore = {
    id: 450, type: 'payload', alive: true, radius: 4.2, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    data: { kind: 'charged_ore_mine', parentId: 4 },
  };
  const oreVisual = factory.build(ore);
  assert.equal(oreVisual.userData.worldIdentity, 'foundry-charged-ore');
  assert.equal(named(oreVisual, /ChargedOreAngularBody/).length, 1);
  assert.equal(named(oreVisual, /ChargedOreRecessedChargeSeam/).length, 3);
  assert.equal(descendants(oreVisual, (object) => object.isSprite || object.isPoints).length, 0);
  assert.ok(descendants(oreVisual, (object) => object.material)
    .every((object) => object.material.transparent !== true));
});

test('production heavy events drive bounded physical tells and preserve runtime objects', () => {
  const factory = createVisualFactory();
  const ramscoop = heavyEntity(501, 'heavy_ramscoop', 'ship_bastion');
  const carrier = heavyEntity(502, 'heavy_carrier_lite', 'ship_atlas');
  const foundry = heavyEntity(503, 'heavy_foundry', 'ship_atlas');
  const drive = heavyPart(511, ramscoop.id, 'heavy_ramscoop_drive_cluster', 7);
  const bay = heavyPart(512, carrier.id, 'heavy_carrier_lite_bay_port', 6);
  const cutterPort = heavyPart(513, foundry.id, 'heavy_foundry_cutter_port', 6);
  const cutterStarboard = heavyPart(514, foundry.id, 'heavy_foundry_cutter_starboard', 6);
  const rack = heavyPart(515, foundry.id, 'heavy_foundry_ore_mine_rack', 6);
  const entities = [ramscoop, carrier, foundry, drive, bay, cutterPort, cutterStarboard, rack];
  for (const entity of entities) entity.mesh = factory.build(entity);

  const scene = new THREE.Scene();
  const bus = makeBus();
  const state = {
    playerId: 999, simTime: 1, tick: 60,
    entities: new Map(entities.map((entity) => [entity.id, entity])), entityList: entities,
    settings: { video: { particleQuality: 'low', motionReduce: false }, accessibility: { flashReduce: false } },
    render: { scene },
  };
  const system = Object.create(vfx);
  system.init({ state, bus, helpers: {} });

  const driveUniforms = named(drive.mesh, /RamscoopAdvectedPlasmaSheet/)
    .map((sheet) => sheet.material.uniforms);
  const objectCount = descendants(drive.mesh, () => true).length;
  bus.emit('ai:doctrinePhase', { entityId: ramscoop.id, phase: 'ram_spool' });
  settle(ramscoop);
  settle(drive);
  assert.ok(ramscoop.mesh.userData.heavyPresentationState.burn > 0.55);
  assert.ok(drive.mesh.userData.heavyPresentationState.burn > 0.55);
  bus.emit('ai:doctrinePhase', { entityId: ramscoop.id, phase: 'ram_commit' });
  settle(drive, 2);
  assert.ok(drive.mesh.userData.heavyPresentationState.burn > 0.95);
  assert.equal(descendants(drive.mesh, () => true).length, objectCount,
    'burn updates do not allocate scene objects');
  assert.deepEqual(named(drive.mesh, /RamscoopAdvectedPlasmaSheet/).map((sheet) => sheet.material.uniforms), driveUniforms,
    'burn updates retain the bounded shader uniform owners');

  settle(bay, 0, 60);
  bus.emit('heavy:bayLaunch', {
    parentId: carrier.id, bayPartId: bay.data.partId, entityId: 700, used: 1, capacity: 2, pos: carrier.pos,
  });
  settle(bay, 1, 12);
  assert.ok(bay.mesh.userData.heavyPresentationState.launch > 0.75);
  assert.ok(named(bay.mesh, /CarrierBayRetractingDoor/)[0].position.x < -1.7);

  settle(rack, 0, 60);
  bus.emit('heavy:chargedOreReleased', {
    parentId: foundry.id, rackPartId: rack.data.partId, mineId: 701, used: 2, capacity: 3, pos: foundry.pos,
  });
  settle(rack, 1, 12);
  assert.ok(rack.mesh.userData.heavyPresentationState.oreRelease > 0.75);
  assert.equal(named(rack.mesh, /FoundryRackPhysicalOreLoad/).filter((load) => load.visible).length, 1);

  settle(cutterPort, 0, 60);
  settle(cutterStarboard, 0, 60);
  bus.emit('combat:fire', {
    ownerId: foundry.id, weaponId: 'wpn_beam_laser_m', origin: foundry.pos,
    dir: { x: 1, z: 0 }, continuous: true, to: { x: 100, z: 0 },
  });
  settle(cutterPort, 1, 8);
  settle(cutterStarboard, 1, 8);
  assert.ok(cutterPort.mesh.userData.heavyPresentationState.cutterHeat > 0.65);
  assert.ok(cutterStarboard.mesh.userData.heavyPresentationState.cutterHeat > 0.65);
  system.destroy();
});

test('heavy semantic audio is event-authoritative and cooldown-bounded', () => {
  assert.equal(resolveHeavyPresentationAudioCue('ai:doctrinePhase', { phase: 'ram_spool' }),
    HEAVY_AUDIO_SIGNATURES['heavy.ramscoop.ram_spool']);
  assert.equal(resolveHeavyPresentationAudioCue('ai:doctrinePhase', { phase: 'ram_commit' }), null);
  assert.equal(resolveHeavyPresentationAudioCue('heavy:bayLaunch', {}),
    HEAVY_AUDIO_SIGNATURES['heavy.carrier.launch']);
  assert.equal(resolveHeavyPresentationAudioCue('heavy:chargedOreReleased', {}),
    HEAVY_AUDIO_SIGNATURES['heavy.foundry.ore_release']);

  const ramscoop = heavyEntity(601, 'heavy_ramscoop', 'ship_bastion');
  const bus = makeBus();
  const played = [];
  const system = Object.create(audio);
  system.play = (id, options) => { played.push({ id, options }); return true; };
  system.init({
    state: {
      settings: { audio: {} }, entities: new Map([[ramscoop.id, ramscoop]]),
      entityList: [ramscoop], simTime: 1,
    },
    bus,
    helpers: {},
  });
  bus.emit('ai:doctrinePhase', { entityId: ramscoop.id, phase: 'ram_spool' });
  assert.equal(played.at(-1).id, HEAVY_AUDIO_SIGNATURES['heavy.ramscoop.ram_spool'].recipeId);
  bus.emit('heavy:bayLaunch', { parentId: ramscoop.id, pos: ramscoop.pos });
  assert.equal(played.at(-1).id, HEAVY_AUDIO_SIGNATURES['heavy.carrier.launch'].recipeId);
  const count = played.length;
  bus.emit('heavy:bayLaunch', { parentId: ramscoop.id, pos: ramscoop.pos });
  assert.equal(played.length, count, 'heavy semantic voice is cooldown-bounded');
  system.destroy();
});
