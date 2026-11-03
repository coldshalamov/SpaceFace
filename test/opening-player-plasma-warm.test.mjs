import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { vfx } from '../src/render/vfx.js';

function fixture() {
  const owner = Object.create(vfx), scene = new THREE.Scene();
  const player = { id: 1, type: 'ship', alive: true, data: {}, pos: { x: 0, z: 0 } };
  Object.assign(owner, {
    _scene: scene, _energy: null, _destroyed: false,
    state: { mode: 'loading', playerId: 1, entities: new Map([[1, player]]),
      contextRestoreSeq: 0, render: { admissionRunGeneration: 1 }, settings: { video: {} } },
    _productionThrusterEnabled: () => true, _extendedEngineTrailsEnabled: () => false,
    _writeProductionPlumeSockets: () => 1,
    _productionPlumeSocketView: [{ x: -12, y: 0, z: -1, ax: 1, ay: 0, az: 0 }],
    _releasePlayerPlumeEventLight() {}, _clearProductionOwnership() {},
    _engineProfileIdFor: () => 'engine_ion_small',
    _initEnergy() { throw new Error('plasma-only warm initialized the fleet'); },
  });
  return { owner, scene, player, warm: () => owner.warmupOpeningEffectSubsetForLoading({ playerPlasmaOnly: true }) };
}

test('finite player warm owns only the production plasma and keeps both forge face passes', () => {
  const f = fixture(), warm = f.warm(), stream = f.owner._openingPlayerPlasma;
  try {
    assert.equal(warm.plasmaRoot, stream.group);
    assert.deepEqual(f.scene.children.map(root => root.name), ['sf-liquid-plasma-root']);
    assert.equal(f.owner._energy, null);
    assert.equal(f.owner._openingRibbonExemplar, undefined);
    assert.equal(warm.isActive(), true);
    assert.equal(stream._ribbons.material.forceSinglePass, true);
    assert.equal(stream._forges[0].material.side, THREE.DoubleSide);
    assert.equal(stream._forges[0].material.forceSinglePass, false);
    assert.equal(stream._throats[0].material.side, THREE.DoubleSide);
    assert.ok(f.owner._vfxContextLossResources().includes(stream._centerTex));
    assert.equal(warm.releaseWarmSamples(), true);
    assert.equal(stream.group.visible, false);
    assert.equal(warm.isActive(), false);
    assert.equal(warm.releaseWarmSamples(), false);
  } finally { f.owner._disposeEnergy(); }
});

test('normal energy creation adopts the prepared plasma identities for the first real drive', () => {
  const f = fixture(), warm = f.warm(), stream = f.owner._openingPlayerPlasma;
  const materials = [stream._ribbons.material, stream._forges[0].material, stream._throats[0].material];
  const geometries = [stream._ribbons.geometry, stream._forges[0].geometry, stream._throats[0].geometry];
  try {
    warm.releaseWarmSamples();
    delete f.owner._initEnergy;
    f.owner._initEnergy();
    assert.equal(f.owner._energy.plasmaStream, stream);
    assert.equal(f.owner._openingPlayerPlasma, null);
    assert.equal(f.scene.children.filter(root => root.name === 'sf-liquid-plasma-root').length, 1);
    f.owner.state.mode = 'flight';
    stream.update(1 / 60, f.owner._productionPlumeSocketView,
      { drive: 1, throttle: 1, boost: 0, speed: 0 }, { lowQuality: true, qualityTier: 'low' }, f.player);
    assert.deepEqual([stream._ribbons.material, stream._forges[0].material, stream._throats[0].material], materials);
    assert.deepEqual([stream._ribbons.geometry, stream._forges[0].geometry, stream._throats[0].geometry], geometries);
  } finally { f.owner._disposeEnergy(); }
});

test('a superseded warm cannot reset the successor invocation or real flight history', () => {
  const f = fixture(), old = f.warm();
  try {
    f.owner.state.render.admissionRunGeneration++;
    const current = f.warm(), stream = f.owner._openingPlayerPlasma;
    assert.equal(old.isActive(), false);
    assert.equal(old.releaseWarmSamples(), false);
    assert.equal(current.isActive(), true);
    assert.equal(stream.group.visible, true);
    f.owner.state.mode = 'flight';
    assert.equal(current.releaseWarmSamples(), false);
    assert.equal(stream.group.visible, true, 'the old loading finally cannot blank live drive effects');
  } finally { f.owner._disposeEnergy(); }
});

test('context/session cancellation and disposal retire only their exact pending owner', () => {
  const f = fixture(), old = f.warm(), stream = f.owner._openingPlayerPlasma;
  f.owner.state.contextRestoreSeq++;
  assert.equal(old.releaseWarmSamples(), false);
  const current = f.warm();
  assert.equal(current.isActive(), true);
  f.owner._disposeEnergy();
  assert.equal(stream._disposed, true);
  assert.equal(stream.group, null);
  assert.equal(current.isActive(), false);
  assert.equal(current.releaseWarmSamples(), false);
  assert.equal(f.owner._openingPlayerPlasma, null);
  assert.equal(f.scene.children.length, 0);
});

test('a replaced world cannot be reset by the previous loading owner', () => {
  const f = fixture(), old = f.warm(), stream = f.owner._openingPlayerPlasma;
  try {
    f.owner.state.world = { currentSectorId: 'next', enterSerial: 2 };
    assert.equal(old.isActive(), false);
    assert.equal(old.releaseWarmSamples(), false);
    assert.equal(stream.group.visible, true);
    assert.equal(f.warm().releaseWarmSamples(), true);
  } finally { f.owner._disposeEnergy(); }
});

test('disabled or live-flight propulsion never creates a loading warm owner', () => {
  const f = fixture();
  f.owner._productionThrusterEnabled = () => false;
  assert.equal(f.warm().skipped, true);
  assert.equal(f.scene.children.length, 0);
  f.owner._productionThrusterEnabled = () => true;
  f.owner.state.mode = 'flight';
  assert.equal(f.warm().skipped, true);
  assert.equal(f.scene.children.length, 0);
});
