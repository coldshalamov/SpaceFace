import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createVisualFactory } from '../src/render/visualFactory.js';
import { installVisualOverrides } from '../src/render/visualOverrides.js';
import {
  audio,
  MEDIUM_AUDIO_SIGNATURES,
  resolveMediumPresentationAudioCue,
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

const MEDIUMS = [
  ['marauder_brawler', 'medium_marauder'],
  ['lancer_sniper', 'medium_lancer'],
  ['hostile_interceptor', 'medium_interceptor'],
  ['bulwark_escort', 'medium_bulwark'],
  ['corsair_raider', 'medium_corsair'],
  ['torcher_denial', 'medium_torcher'],
];

function mediumEntity(id, lootTableId, x = 0, z = 0) {
  return {
    id,
    type: 'ship',
    alive: true,
    team: 1,
    factionId: 'faction_reavers',
    radius: 8,
    hull: 100,
    hullMax: 100,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    data: {
      defId: 'ship_wasp',
      lootTableId,
      silhouette: 'fighter_wasp',
      fittings: ['wpn_pulse_laser'],
      miningBeam: { range: 60 },
      visualTier: 3,
    },
  };
}

function buildFamily() {
  const factory = createVisualFactory();
  const family = new Map();
  for (let i = 0; i < MEDIUMS.length; i++) {
    const entity = mediumEntity(100 + i, MEDIUMS[i][0], i * 28, 0);
    entity.mesh = factory.build(entity);
    family.set(MEDIUMS[i][0], entity);
  }
  return family;
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
    emit(name, payload) {
      for (const fn of handlers.get(name) || []) fn(payload);
    },
  };
}

function settle(entity, start = 0, frames = 60) {
  for (let frame = 1; frame <= frames; frame++) {
    entity.mesh.userData.updateRuntimeState(entity, start + frame / 60);
  }
}

test('six stable medium ids own faceted silhouettes and hard mechanical state tells', () => {
  const family = buildFamily();
  for (const [lootTableId, silhouette] of MEDIUMS) {
    const root = family.get(lootTableId).mesh;
    assert.equal(root.userData.mediumPresentationId, lootTableId);
    assert.equal(root.userData.enemySilhouette, silhouette);
    assert.equal(root.userData.genericShipOverlaysSuppressed, true);
    assert.equal(typeof root.userData.setMediumPresentationState, 'function');
    assert.equal(typeof root.userData.updateRuntimeState, 'function');
    assert.equal(descendants(root, (object) => object.isSprite || object.isPoints).length, 0,
      `${lootTableId} has no soft square/disc or point identity substrate`);
    assert.equal(named(root, /Weapon|Turret|Paint|DecalShell|NavBlinker/i).length, 0,
      `${lootTableId} receives no generic Wasp overlays or hardpoints`);
    const materialNames = descendants(root, (object) => object.material && object.material.name)
      .map((object) => object.material.name);
    assert.ok(materialNames.some((name) => /Marauder|Lancer|Interceptor|Bulwark|Corsair|Torcher/.test(name)),
      `${lootTableId} retains its authored material system`);
  }

  const marauder = family.get('marauder_brawler');
  assert.equal(named(marauder.mesh, /MarauderRcsFaultVane/).length, 4);
  marauder.mesh.userData.setMediumPresentationState('disrupted', true);
  settle(marauder);
  assert.ok(marauder.mesh.userData.mediumPresentationState.disrupted > 0.9);

  const lancer = family.get('lancer_sniper');
  const chargeRail = named(lancer.mesh, /LancerChargeRail/)[0];
  assert.ok(chargeRail, 'Lancer charge rails remain separated from the long faceted barrel');
  const chargeStartZ = chargeRail.position.z;
  lancer.mesh.userData.setMediumPresentationState('charge', true);
  settle(lancer);
  assert.ok(lancer.mesh.userData.mediumPresentationState.charge > 0.9);
  assert.ok(chargeRail.position.z > chargeStartZ, 'charge-up physically draws the exposed bus forward');

  const interceptor = family.get('hostile_interceptor');
  assert.equal(named(interceptor.mesh, /InterceptorTwinNose/).length, 2);
  assert.equal(named(interceptor.mesh, /InterceptorDriveShutter/).length, 4);
  interceptor.mesh.userData.setMediumPresentationState('disrupted', true);
  settle(interceptor);
  assert.notEqual(named(interceptor.mesh, /InterceptorTwinNose/)[0].rotation.z, 0,
    'external frame loss racks the two independently rooted noses');

  const bulwark = family.get('bulwark_escort');
  const ring = named(bulwark.mesh, /BulwarkProjectedShieldEmitterRing/)[0];
  assert.ok(ring && ring.geometry.type === 'TorusGeometry', 'projected shield owns a thick hardware ring');
  bulwark.mesh.userData.setMediumPresentationState('link', true);
  settle(bulwark);
  assert.ok(bulwark.mesh.userData.mediumPresentationState.link > 0.9);

  const corsair = family.get('corsair_raider');
  const towArm = named(corsair.mesh, /CorsairTailTowArm/)[0];
  const stowedRotation = towArm.rotation.z;
  corsair.data.corsairCargoTow = { cargoId: 'cargo-1' };
  settle(corsair);
  assert.ok(corsair.mesh.userData.mediumPresentationState.tow > 0.9);
  assert.notEqual(towArm.rotation.z, stowedRotation,
    'the tail rig opens around the existing authoritative SG-02 cargo attachment');
  delete corsair.data.corsairCargoTow;
  settle(corsair, 1, 150);
  assert.ok(corsair.mesh.userData.mediumPresentationState.tow < 0.1, 'tow hardware mechanically releases');

  const torcher = family.get('torcher_denial');
  assert.equal(named(torcher.mesh, /TorcherVentWallCollar/).length, 1);
  assert.equal(named(torcher.mesh, /TorcherRefractoryVentCore/).length, 2);
  const collars = named(torcher.mesh, /TorcherVentWallCollar/)[0];
  assert.equal(collars.count, 6, 'six open collars are rendered as one bounded instanced assembly');
  assert.equal(collars.geometry.type, 'TorusGeometry',
    'twin vent cages retain real wall thickness and openings');
});

test('live direct-authored mounting preserves the six designed-procedural medium identities', () => {
  const factory = installVisualOverrides(createVisualFactory(), {
    releaseMode: true,
    directAuthoredMount: true,
  });
  for (let i = 0; i < MEDIUMS.length; i++) {
    const [stableId, silhouette] = MEDIUMS[i];
    const entity = mediumEntity(300 + i, stableId);
    const visual = factory.build(entity);
    assert.equal(visual.userData.authoredAdmissionSubstrate, undefined,
      `${stableId} must not be replaced by the zero-draw GLB admission boundary`);
    assert.equal(visual.userData.authoredAssetState, 'designed-procedural-settled');
    assert.equal(visual.userData.authoredVisualRoot, `${silhouette}-hard-geometry`);
    assert.equal(visual.userData.mediumPresentationId, stableId);
    assert.equal(visual.visible, true);
  }
});

test('Bulwark links, Corsair tow, and Torcher hazards are bounded world-owned hard geometry', () => {
  const family = buildFamily();
  const bulwark = family.get('bulwark_escort');
  const lancer = family.get('lancer_sniper');
  const corsair = family.get('corsair_raider');
  const torcher = family.get('torcher_denial');
  const cargo = { id: 901, type: 'pickup', alive: true, radius: 4, pos: { x: 92, z: 18 } };
  corsair.data.corsairCargoTow = { attachmentId: 'tow_contract' };
  const bus = makeBus();
  const scene = new THREE.Scene();
  const state = {
    playerId: 999,
    simTime: 1,
    tick: 60,
    entities: new Map([...family.values(), cargo].map((entity) => [entity.id, entity])),
    entityList: [...family.values(), cargo],
    combat: {
      attachments: {
        byId: {
          tow_contract: {
            id: 'tow_contract', state: 'active', ownerId: corsair.id, targetId: cargo.id,
          },
        },
      },
    },
    mediumEnemyRuntime: {
      bulwarkLinksByTarget: {
        [lancer.id]: { sourceId: bulwark.id, targetId: lancer.id },
      },
      torcherTrails: [{
        id: 'torcher_trail_contract',
        sourceId: torcher.id,
        center: { x: torcher.pos.x - 24, z: torcher.pos.z - 12 },
        radius: 32,
        createdAt: 0,
        expiresAt: 5,
      }],
    },
    settings: { video: { particleQuality: 'medium', motionReduce: false }, accessibility: { flashReduce: false } },
    render: { scene },
  };
  const system = Object.create(vfx);
  system.init({ state, bus, helpers: {} });
  const count = system._updateMediumWorldTells();
  assert.equal(count, 3);
  assert.equal(system._mediumWorldTells.links.length, 12, 'link structure uses a fixed pool');
  assert.equal(system._mediumWorldTells.tows.length, 8, 'tow cable structure uses a fixed pool');
  assert.equal(system._mediumWorldTells.trails.length, 48, 'hazard structure uses a fixed pool');
  assert.equal(system._mediumWorldTells.links.filter((slot) => slot.mesh.visible).length, 1);
  assert.equal(system._mediumWorldTells.tows.filter((slot) => slot.mesh.visible).length, 1);
  assert.equal(system._mediumWorldTells.trails.filter((slot) => slot.mesh.visible).length, 1);
  assert.equal(named(system._mediumWorldTells.group, /CorsairPhysicalTowCable/).length, 8);
  assert.equal(descendants(system._mediumWorldTells.group, (object) => object.isSprite || object.isPoints).length, 0);
  assert.equal(named(system._mediumWorldTells.group, /TorcherHeatWakeCellVolumes/).length, 48);
  assert.equal(named(system._mediumWorldTells.group, /TorcherHeatWakeCellRibs/).length, 48);
  assert.ok(system._mediumWorldTells.trailGeometry.getAttribute('aHeight'),
    'fractured heat cells retain a longitudinal analytic-animation coordinate');
  assert.notEqual(system._mediumWorldTells.trailGeometry.type, 'ConeGeometry');
  assert.equal(system._mediumWorldTells.trailMaterial.transparent, true);
  assert.equal(system._mediumWorldTells.trailMaterial.opacity, 1,
    'heat envelope changes geometry reach rather than material opacity');
  assert.match(system._mediumWorldTells.trailMaterial.fragmentShader,
    /1\.0 - smoothstep\(0\.72, 1\.0, vHeight\)/);
  assert.doesNotMatch(system._mediumWorldTells.trailMaterial.fragmentShader, /noise|fbm/i);

  bus.emit('ai:doctrinePhase', { entityId: lancer.id, phase: 'charge_cue' });
  settle(lancer);
  assert.ok(lancer.mesh.userData.mediumPresentationState.charge > 0.9);

  const beforeParticles = system._liveCount;
  const beforeSprites = system._liveSpriteCount;
  bus.emit('presentation:vfxCue', { id: 'ship.rcsDisrupt', targetId: bulwark.id, position: bulwark.pos });
  bus.emit('ai:flee', { entityId: torcher.id });
  assert.equal(system._liveCount, beforeParticles, 'medium mechanical tells suppress generic particle bursts');
  assert.equal(system._liveSpriteCount, beforeSprites, 'medium mechanical tells suppress generic glow cards');
  assert.equal(torcher.mesh.userData.mediumPresentationState.retreatTarget, 1);

  bus.emit('save:loaded');
  assert.equal(system._mediumWorldTells.links.some((slot) => slot.mesh.visible), false);
  assert.equal(system._mediumWorldTells.tows.some((slot) => slot.mesh.visible), false);
  assert.equal(system._mediumWorldTells.trails.some((slot) => slot.mesh.visible), false);
  system.destroy();
  assert.equal(scene.getObjectByName('MediumFamilyOwnedWorldTells'), undefined);
});

test('medium semantic audio stays event-authoritative and class-specific', () => {
  assert.equal(resolveMediumPresentationAudioCue({ cueId: 'medium.bulwark.link.active' }),
    MEDIUM_AUDIO_SIGNATURES['medium.bulwark.link.active']);
  assert.equal(resolveMediumPresentationAudioCue({ cueId: 'medium.torcher.trail.laid' }),
    MEDIUM_AUDIO_SIGNATURES['medium.torcher.trail.laid']);
  assert.equal(resolveMediumPresentationAudioCue({ event: 'freight:cargoSpilled', cause: 'corsair_flee_dump' }),
    MEDIUM_AUDIO_SIGNATURES['medium.corsair.cargo_spill']);
  assert.equal(resolveMediumPresentationAudioCue({ event: 'freight:cargoSpilled', cause: 'player_jettison' }), null);

  const family = buildFamily();
  const lancer = family.get('lancer_sniper');
  const bus = makeBus();
  const played = [];
  const system = Object.create(audio);
  system.play = (id, options) => { played.push({ id, options }); return true; };
  system.init({
    state: {
      settings: { audio: {} },
      entities: new Map([[lancer.id, lancer]]),
      entityList: [lancer],
      simTime: 1,
    },
    bus,
    helpers: {},
  });
  bus.emit('ai:doctrinePhase', { entityId: lancer.id, phase: 'charge_cue' });
  assert.equal(played.at(-1).id, 'sfx_doctrine_ranged_charge');
  bus.emit('medium:semanticCue', {
    cueId: 'medium.bulwark.link.broken', sourceId: lancer.id, position: lancer.pos,
  });
  assert.equal(played.at(-1).id, MEDIUM_AUDIO_SIGNATURES['medium.bulwark.link.broken'].recipeId);
  const count = played.length;
  bus.emit('medium:semanticCue', {
    cueId: 'medium.bulwark.link.broken', sourceId: lancer.id, position: lancer.pos,
  });
  assert.equal(played.length, count, 'semantic voice is cooldown-bounded');
  system.destroy();
});
