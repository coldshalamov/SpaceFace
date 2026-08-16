import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import { createVisualFactory } from '../src/render/visualFactory.js';
import { audio, resolveAudioCueRecipeId, SWARMER_AUDIO_SIGNATURES } from '../src/audio/audioSystem.js';
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

const FAMILY = [
  ['dart_swarmer', 'dart_needle'],
  ['flea_swarmer', 'flea_grapnel'],
  ['skitter_swarmer', 'skitter_lowprofile'],
  ['ember_swarmer', 'ember_corecage'],
];

function swarmer(id, lootTableId, silhouette) {
  return {
    id,
    type: 'ship',
    alive: true,
    team: 1,
    factionId: 'faction_reavers',
    radius: 7,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    data: {
      defId: 'ship_wasp',
      lootTableId,
      silhouette,
      fittings: ['wpn_pulse_laser', 'wpn_pulse_laser'],
      miningBeam: { range: 60 },
      visualTier: 3,
    },
  };
}

function buildFamily() {
  const factory = createVisualFactory();
  return new Map(FAMILY.map(([lootTableId, silhouette], index) => {
    const entity = swarmer(index + 10, lootTableId, silhouette);
    const mesh = factory.build(entity);
    entity.mesh = mesh;
    return [lootTableId, entity];
  }));
}

function descendants(root, predicate) {
  const found = [];
  root.traverse((object) => { if (predicate(object)) found.push(object); });
  return found;
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
    emit(name, payload) {
      for (const fn of handlers.get(name) || []) fn(payload);
    },
  };
}

test('swarmer bodies preserve distinct hard silhouettes and suppress generic Wasp overlays', () => {
  const family = buildFamily();
  for (const [lootTableId, silhouette] of FAMILY) {
    const root = family.get(lootTableId).mesh;
    assert.equal(root.userData.enemySilhouette, silhouette);
    assert.equal(root.userData.genericShipOverlaysSuppressed, true);
    assert.equal(descendants(root, (object) => object.isSprite || object.isPoints).length, 0,
      `${lootTableId} owns no point/sprite identity substrate`);
    assert.equal(descendants(root, (object) => /Weapon|Turret|Paint|DecalShell|NavBlinker/i.test(object.name)).length, 0,
      `${lootTableId} receives no generic Wasp hardpoint/paint overlay`);
  }

  const dart = family.get('dart_swarmer').mesh;
  dart.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(dart.userData.hull).getSize(new THREE.Vector3());
  assert.ok(size.x > size.z * 1.55, `Dart needle points along factory +X (x=${size.x}, z=${size.z})`);

  const flea = family.get('flea_swarmer').mesh;
  const redArms = descendants(flea, (object) => object.isMesh && object.material?.name === 'FleaRedGrapplerMetal');
  assert.equal(redArms.length, 12, 'four red grapplers retain upper, fore and claw geometry');
  assert.equal(typeof flea.userData.setSwarmerDoctrinePhase, 'function');
  const foldedX = redArms[0].position.x;
  flea.userData.setSwarmerDoctrinePhase('anchor_hold');
  for (let frame = 1; frame <= 36; frame++) flea.userData.updateRuntimeState(family.get('flea_swarmer'), frame / 60);
  assert.ok(flea.userData.fleaPresentation.deployment > 0.9, 'hold opens the grappler silhouette');
  assert.notEqual(redArms[0].position.x, foldedX);
  flea.userData.setSwarmerDoctrinePhase('recover');
  for (let frame = 37; frame <= 156; frame++) flea.userData.updateRuntimeState(family.get('flea_swarmer'), frame / 60);
  assert.ok(flea.userData.fleaPresentation.deployment < 0.2, 'recover visibly stows the arms');

  const skitter = family.get('skitter_swarmer').mesh;
  assert.ok(skitter.userData.visualLanguage.includes('flat-plate'));
  const ember = family.get('ember_swarmer').mesh;
  const core = descendants(ember, (object) => object.isMesh && object.material?.name === 'EmberOrangeReactorCore')[0];
  assert.ok(core, 'Ember exposes a physical orange reactor core');
  assert.ok(core.material.emissive.r > core.material.emissive.g * 2.2);
  assert.ok(ember.userData.emberCorePresentation.physicalCore);
});

test('Dart history and Skitter/Ember cues use bounded world geometry, never generic particles', () => {
  const family = buildFamily();
  const dart = family.get('dart_swarmer');
  const flea = family.get('flea_swarmer');
  const bus = makeBus();
  const scene = new THREE.Scene();
  const state = {
    playerId: 999,
    entities: new Map([[dart.id, dart], [flea.id, flea]]),
    entityList: [dart, flea],
    settings: { video: { particleQuality: 'medium', motionReduce: false }, accessibility: { flashReduce: false } },
    render: { scene },
  };
  const system = Object.create(vfx);
  system.init({ state, bus, helpers: {} });

  system._updateDartActualTrails(1 / 60);
  for (let frame = 1; frame <= 5; frame++) {
    dart.pos.x = frame * 5;
    dart.vel.x = 180;
    system._updateDartActualTrails(1 / 60);
  }
  const slot = system._dartActualTrails.slots.find((candidate) => candidate.entityId === dart.id);
  assert.ok(slot && slot.count >= 5);
  assert.equal(slot.x[0], 25);
  assert.equal(slot.x[1], 20, 'history retains a prior world position instead of following the hull rigidly');
  assert.ok(slot.mesh.geometry.drawRange.count > 0);
  assert.equal(descendants(system._dartActualTrails.group, (object) => object.isSprite || object.isPoints).length, 0);

  bus.emit('ai:doctrinePhase', { entityId: flea.id, phase: 'field_spool' });
  assert.equal(flea.mesh.userData.fleaPresentation.target, 0.62);

  const beforeParticles = system._liveCount;
  const beforeSprites = system._liveSpriteCount;
  bus.emit('presentation:vfxCue', {
    id: 'swarmer_rock_dust', position: { x: 14, z: -6 }, particles: 18, lights: 0,
  });
  system._updateSwarmerEventGeometry(1 / 60);
  assert.equal(system._swarmerEventGeometry.dust.visible, true);
  assert.equal(system._swarmerEventGeometry.dust.material.transparent, false);
  bus.emit('presentation:vfxCue', {
    id: 'swarmer_ember_cook_off', position: { x: -8, z: 11 }, particles: 28, lights: 1,
  });
  system._updateSwarmerEventGeometry(1 / 60);
  assert.equal(system._swarmerEventGeometry.ember.visible, true);
  assert.equal(system._swarmerEventGeometry.ember.material.name, 'EmberCookOffContainmentRibs');
  assert.equal(system._liveCount, beforeParticles, 'specialized cues do not fall through to the particle cloud');
  assert.equal(system._liveSpriteCount, beforeSprites, 'specialized cues do not spawn glow cards or rings');
  assert.equal(descendants(system._swarmerEventGeometry.group, (object) => object.isSprite || object.isPoints).length, 0);

  system.reprojectFrame(100, -50);
  assert.equal(slot.x[0], 125, 'origin reprojection shifts retained Dart world history');
  bus.emit('save:loaded');
  assert.equal(slot.entityId, null);
  assert.equal(system._swarmerEventGeometry.dust.visible, false);
  assert.equal(system._swarmerEventGeometry.ember.visible, false);
  system.destroy();
  assert.equal(scene.getObjectByName('DartActualWorldMotionTrails'), undefined);
  assert.equal(scene.getObjectByName('SwarmerCausalEventGeometry'), undefined);
});

test('swarmer semantic audio resolves to physical signatures and Ember layers a containment break', () => {
  assert.equal(resolveAudioCueRecipeId('rock_dust'), SWARMER_AUDIO_SIGNATURES.skitterRockDust.recipeId);
  assert.equal(resolveAudioCueRecipeId('swarmer_rock_dust'), 'sfx_mining_fracture_warning');
  assert.equal(resolveAudioCueRecipeId('swarmer_ember_cook_off'), 'sfx_vector_mine');

  const bus = makeBus();
  const played = [];
  const system = Object.create(audio);
  system.play = (id, options) => { played.push({ id, options }); return true; };
  system.init({
    state: { settings: { audio: {} }, entities: new Map(), entityList: [], simTime: 0 },
    bus,
    helpers: {},
  });
  bus.emit('combat:emberCookOff', { position: { x: 9, z: 4 } });
  assert.deepEqual(played.at(-1), {
    id: SWARMER_AUDIO_SIGNATURES.emberCookOff.layerRecipeId,
    options: { position: { x: 9, z: 4 }, gain: 0.42, rate: 0.62, critical: true },
  });
  system.destroy();
});

test('visual override admission derives from canonical swarmer grammar', () => {
  const source = readFileSync(new URL('../src/render/visualOverrides.js', import.meta.url), 'utf8');
  assert.match(source, /swarmerRecordFor\(entity\.data\.lootTableId\)/);
  assert.doesNotMatch(source, /DESIGNED_PROCEDURAL_SWARMERS/);
});
