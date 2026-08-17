// Plan 34 — field & tether VFX. Measurement for the owner force-narration gate.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { FIELD_DEFS, FIELD_MAX_ACTIVE, FIELD_PALETTE } from '../src/data/fields.js';
import { vfx, FIELD_FLOW_MAX_FIELDS } from '../src/render/vfx.js';

function makeField(kind, extra = {}) {
  const pal = extra.palette || FIELD_PALETTE[kind] || FIELD_PALETTE.well;
  const def = FIELD_DEFS[kind] || FIELD_DEFS.well;
  return {
    id: extra.id || `field-${kind}`,
    kind,
    center: extra.center || { x: 40, z: -25 },
    radius: extra.radius || 80,
    dir: extra.dir || { x: 1, z: 0 },
    halfAngleRad: extra.halfAngleRad || 0.45,
    falloff: extra.falloff != null ? extra.falloff : def.falloff,
    engaged: extra.engaged !== false,
    palette: pal,
    tag: extra.tag || null,
  };
}

function makeHarness(active = []) {
  const system = Object.create(vfx);
  system._scene = new THREE.Scene();
  system._fieldGeomInitialized = false;
  system._fieldGeom = null;
  system._t = 2;
  system._ctmp = new THREE.Color();
  system._c0 = new THREE.Color();
  system._c1 = new THREE.Color();
  system._zeroPos = { x: 0, z: 0 };
  system._spawnLocalXZ = { x: 0, z: 0 };
  system._entityLocalXZ = { x: 0, z: 0 };
  system._frameMembrane = null;
  system.helpers = {};
  system.state = {
    simTime: 2,
    playerId: 1,
    entities: new Map(),
    entityList: [],
    fields: { active },
    player: { tether: { active: false } },
    settings: {
      video: { motionReduce: false, flashReduce: false, bloom: true },
      accessibility: { flashReduce: false },
    },
  };
  return system;
}

function coreColorHex(vol) {
  const material = vol && vol.userData && vol.userData.energyCore && vol.userData.energyCore.material;
  assert.ok(material && material.uniforms && material.uniforms.uColorB, 'energy core must expose uColorB');
  return `#${material.uniforms.uColorB.value.getHexString()}`;
}

test('deployed well and repulsor devices are shootable hulls; presentation pool matches the 6-field cap', () => {
  assert.equal(FIELD_DEFS.well.hull, 42);
  assert.equal(FIELD_DEFS.repulsor.hull, 42);
  assert.equal(FIELD_FLOW_MAX_FIELDS, FIELD_MAX_ACTIVE);
  assert.equal(FIELD_FLOW_MAX_FIELDS, 6);
});

test('well flow is inward, repulsor flow is outward, cone flow follows the wedge', () => {
  const well = makeField('well');
  const repulsor = makeField('repulsor', { id: 'field-repulsor' });
  const cone = makeField('cone', { id: 'field-cone', dir: { x: 1, z: 0 } });
  const system = makeHarness([well, repulsor, cone]);
  const samples = [];
  system._spawnParticle = (px, pz, vx, vz) => {
    samples.push({ px, pz, vx, vz });
  };

  const classify = (field) => {
    samples.length = 0;
    system._emitFieldParticle(field, field.radius, field.palette, 0.25, 0.6, 1, 1, 0.7);
    assert.ok(samples.length >= 1, `${field.kind} must emit a flow sample`);
    const sample = samples[0];
    const rx = sample.px - field.center.x;
    const rz = sample.pz - field.center.z;
    const radial = Math.hypot(rx, rz) || 1;
    return {
      radial: (sample.vx * rx + sample.vz * rz) / radial,
      along: sample.vx * (field.dir.x || 0) + sample.vz * (field.dir.z || 0),
    };
  };

  assert.ok(classify(well).radial < 0, 'well filaments drift inward');
  assert.ok(classify(repulsor).radial > 0, 'repulsor ribs drift outward');
  assert.ok(classify(cone).along > 0, 'cone chevrons travel along the wedge');
});

test('engaged well core uses the hot sink; hostile snare is the amber well, not the player palette', () => {
  const well = makeField('well');
  const snare = makeField('well', {
    id: 'field-snare',
    tag: 'hostile',
    palette: FIELD_PALETTE.hostileSnare,
    center: { x: -80, z: 10 },
  });
  const system = makeHarness([well, snare]);
  system._updateFieldGeometry(0);
  const vols = system._fieldGeom.coreVols.filter((vol) => vol.visible);
  assert.equal(vols.length, 2);
  const wellHex = coreColorHex(vols[0]);
  const snareHex = coreColorHex(vols[1]);
  assert.equal(wellHex, FIELD_PALETTE.well.coreHot.toLowerCase());
  assert.equal(snareHex, FIELD_PALETTE.hostileSnare.coreHot.toLowerCase());
  assert.notEqual(wellHex, snareHex);
  assert.notEqual(FIELD_PALETTE.hostileSnare.filament, FIELD_PALETTE.well.filament);
});

test('repulsor berm and cone chevrons are live instance counts, and a seventh field is dropped', () => {
  const active = [
    makeField('repulsor', { id: 'r1' }),
    makeField('cone', { id: 'c1' }),
  ];
  const system = makeHarness(active);
  system._updateFieldGeometry(0);
  assert.ok(system._fieldGeom.bermMesh.count >= 8, 'repulsor berm is a piled boundary, not a HUD label');
  assert.ok(system._fieldGeom.chevronMesh.count >= 8, 'cone chevrons point the cleared lane');

  const crowded = [];
  for (let i = 0; i < 7; i++) crowded.push(makeField('well', { id: `w${i}`, center: { x: i * 30, z: 0 } }));
  const flow = makeHarness(crowded);
  let emittedFields = 0;
  flow._emitFieldFlow = (field) => {
    emittedFields++;
    return 1;
  };
  flow._updateFieldFlow();
  assert.equal(emittedFields, FIELD_FLOW_MAX_FIELDS);
});

test('tether strain reads cyan then amber then red from load, not HUD prose', () => {
  const player = {
    id: 1, alive: true, type: 'ship',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8,
  };
  const target = {
    id: 2, alive: true, type: 'ship',
    pos: { x: 40, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 6,
  };
  const system = makeHarness([]);
  system.state.entities.set(player.id, player);
  system.state.entities.set(target.id, target);
  system.state.entityList = [player, target];
  system.helpers.player = () => player;
  system._initTetherCable();
  system._spawnParticle = () => {};
  system._spawnSprite = () => null;
  system._flashLight = () => false;
  system._flashAccessibilityScratch = { life: 0, size0: 0, size1: 0, opacity0: 0, opacity1: 0 };
  system._tetherColorCool = new THREE.Color('#39d0ff');
  system._tetherColorWarm = new THREE.Color('#ffb35c');
  system._tetherColorHot = new THREE.Color('#ff5c5c');
  system._tetherColorWhite = new THREE.Color('#eaffff');

  const colorAt = (load) => {
    system.state.player.tether = {
      active: true,
      targetId: target.id,
      load,
      strain: 0,
      restLength: 40,
      phase: load > 0.7 ? 'loaded' : 'capture',
      reeling: false,
    };
    system._updateTetherCable(1);
    return system._ctmp.getHexString();
  };

  const cool = colorAt(0.08);
  const warm = colorAt(0.55);
  const hot = colorAt(0.96);
  assert.notEqual(cool, warm);
  assert.notEqual(warm, hot);
  const coolCol = new THREE.Color(`#${cool}`);
  const warmCol = new THREE.Color(`#${warm}`);
  const hotCol = new THREE.Color(`#${hot}`);
  assert.ok(coolCol.b > coolCol.r, 'slack line is cyan');
  assert.ok(warmCol.r > warmCol.b, 'working line is amber');
  assert.ok(hotCol.r > hotCol.g && hotCol.r > hotCol.b, 'near-limit line is red');
});
