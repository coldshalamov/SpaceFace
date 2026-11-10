import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { rigidBatchDepthProvenOff, rigidBatchShadowWarmActive, subscribeRigidBatchShadowWarm } from '../src/render/rigidBatchShadowGate.js';
import { prepareDirectionalShadowPipelineVariant } from '../src/render/precompile.js';
import { render as renderSystem, POST_PROCESS_ROUTE } from '../src/render/renderer.js';
import { lightCensusSignature, shadowCensusEpoch } from '../src/render/shadowDepthAdmission.js';

test('effective depth gate requires a fresh census and a disabled, unlit Nocturne caster', () => {
  const scene = new THREE.Scene(), light = new THREE.SpotLight(); scene.add(light);
  light.castShadow = true; light.intensity = 0;
  const owner = {scene, renderer:{}, _shadowSettingOn:false,
    state:{settings:{video:{shadows:false,nocturne:true,nocturneShadows:false}}},
    _nocturne:{shadowConfigured:true, shadowsEnabled:false, shadowLight:light},
    _shadowCensusMemo:{scene,epoch:3,pendingIter:null,sig:'f0|SpotLight:1:1x1'}};
  assert.equal(rigidBatchDepthProvenOff(owner,3), true);
  assert.equal(rigidBatchDepthProvenOff(owner,4), false);
  light.intensity = 1; assert.equal(rigidBatchDepthProvenOff(owner,3), false); light.intensity = 0;
  owner._nocturne.shadowsEnabled = true; assert.equal(rigidBatchDepthProvenOff(owner,3), false);
  owner._nocturne.shadowsEnabled = false;
  owner._shadowCensusMemo.sig += '|DirectionalLight:1:1x1';
  assert.equal(rigidBatchDepthProvenOff(owner,3), false);
  owner._shadowCensusMemo.sig = 'f0|SpotLight:1:1x1';
  owner.state.settings.video.nocturneShadows = true;
  assert.equal(rigidBatchDepthProvenOff(owner,3), false);
  owner.state.settings.video.nocturneShadows = false;
  for (const sig of ['', 'f0', 'unknown|SpotLight:1:1x1', 'f0|FutureLight:1:1x1',
    'f0|SpotLight:1:2x1', 'f0|SpotLight:1:1x0', 'f0|SpotLight:1:1x1|',
    'f0|DirectionalLight:1:1x1', 'f0|SpotLight:1:1x2']) {
    owner._shadowCensusMemo.sig = sig;
    assert.equal(rigidBatchDepthProvenOff(owner,3), false, `unknown census must stay exact: ${sig}`);
  }
  owner._shadowCensusMemo.sig = 'f0|SpotLight:1:1x1';
  owner._shadowCensusMemo.pendingIter = {};
  assert.equal(rigidBatchDepthProvenOff(owner,3), false);
});

test('directional warm fences before state changes and releases after failure', async () => {
  const scene = new THREE.Scene(), light = new THREE.DirectionalLight(); scene.add(light);
  const renderer = {shadowMap:{enabled:false}}, subject = new THREE.Group();
  let release, notified = 0;
  const unsubscribe = subscribeRigidBatchShadowWarm(renderer, () => {
    notified++; assert.equal(renderer.shadowMap.enabled,false); assert.equal(light.castShadow,false);
    assert.equal(rigidBatchShadowWarmActive(renderer),true);
  });
  const pending = prepareDirectionalShadowPipelineVariant(renderer,scene,subject,
    () => new Promise((_, reject) => { release = reject; }));
  assert.equal(notified,1); assert.equal(renderer.shadowMap.enabled,true);
  assert.equal(light.castShadow,true); assert.equal(rigidBatchShadowWarmActive(renderer),true);
  release(new Error('compile failed')); await assert.rejects(pending,/compile failed/);
  assert.equal(renderer.shadowMap.enabled,false); assert.equal(light.castShadow,false);
  assert.equal(rigidBatchShadowWarmActive(renderer),false); unsubscribe();
});

test('warm fence restores an active retained cohort before changing the real shadow state', async () => {
  const { createRetainedRigidOpaqueBatchController } = await import('../src/render/rigidOpaqueBatch.js');
  const scene = new THREE.Scene(), light = new THREE.DirectionalLight(); scene.add(light);
  const renderer = {shadowMap:{enabled:false}}, root = new THREE.Group();
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial();
  const a = new THREE.Mesh(geometry,material), b = new THREE.Mesh(geometry,material);
  root.add(a,b); scene.add(root); scene.updateMatrixWorld(true);
  const controller = createRetainedRigidOpaqueBatchController({scene,prepare:()=>({ready:true})});
  const unsubscribe = subscribeRigidBatchShadowWarm(renderer, () => controller.setShadowDepthDisabled(false));
  try {
    controller.setShadowDepthDisabled(true); await controller.sync(root);
    assert.equal(a.layers.mask,0); assert.equal(b.layers.mask,0);
    await prepareDirectionalShadowPipelineVariant(renderer,scene,new THREE.Group(),() => {
      assert.equal(a.layers.mask,1); assert.equal(b.layers.mask,1);
      assert.equal(light.castShadow,true); assert.equal(renderer.shadowMap.enabled,true);
    });
    assert.equal(light.castShadow,false); assert.equal(renderer.shadowMap.enabled,false);
    assert.equal(controller.getDiagnostics().instances,0);
  } finally {unsubscribe();controller.dispose();geometry.dispose();material.dispose();}
});

test('already armed directional warm fences before using new pipeline owners', async () => {
  const scene = new THREE.Scene(), light = new THREE.DirectionalLight(); scene.add(light);
  light.castShadow = true;
  const renderer = { shadowMap: { enabled: true } };
  let fenced = false;
  const unsubscribe = subscribeRigidBatchShadowWarm(renderer, () => { fenced = true; });
  try {
    await prepareDirectionalShadowPipelineVariant(renderer, scene, new THREE.Group(), () => {
      assert.equal(fenced, true);
      assert.equal(rigidBatchShadowWarmActive(renderer), true);
    }, () => true);
    assert.equal(rigidBatchShadowWarmActive(renderer), false);
    assert.equal(light.castShadow, true);
    assert.equal(renderer.shadowMap.enabled, true);
  } finally { unsubscribe(); }
});

test('post-route restores normalized sources after final Nocturne flush and before world draw', () => {
  const scene = new THREE.Scene(), light = new THREE.SpotLight(); scene.add(light);
  light.castShadow = true; light.intensity = 0;
  const owner = Object.assign(Object.create(renderSystem), {
    scene, renderer: {}, _shadowSettingOn: false,
    state: { settings: { video: { shadows: false, nocturneShadows: false } } },
    _nocturne: { shadowConfigured: true, shadowsEnabled: false, shadowLight: light,
      flush() { light.intensity = 2; } },
    _unreadyDrawableGuard: { hide() {}, restore() {} },
  });
  owner._shadowCensusMemo = { scene, epoch: shadowCensusEpoch(), pendingIter: null,
    sig: lightCensusSignature(scene) };
  assert.equal(rigidBatchDepthProvenOff(owner, shadowCensusEpoch()), true);
  let restored = false;
  owner._rigidOpaqueBatchController = { setShadowDepthDisabled(value) {
    assert.equal(value, false); assert.equal(light.intensity, 2); restored = true;
  } };
  owner.bloom = { render() { assert.equal(restored, true); return 'drawn'; } };
  assert.equal(owner._renderPostRoute(POST_PROCESS_ROUTE.BLOOM, scene, new THREE.PerspectiveCamera()), 'drawn');
});
