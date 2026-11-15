import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { SpaceBackground, PALETTES, layerUvOffset, screenNdcToParallaxAnchor } from '../src/render/spaceBackground.js';
import {
  installSpaceBackgroundFrameCoordinateBridge,
  resolveSpaceBackgroundGlobalCamera,
} from '../src/render/spaceBackgroundFrameCoordinates.js';

installSpaceBackgroundFrameCoordinateBridge();

test('background procedural coordinates remain global while the render root remains frame-local', () => {
  const background = frameHarness();
  const layer = background.layers[0];
  const starUniforms = background.stars.mat.uniforms;
  const rootUniform = background.layerMaterial.uniforms.uGroupOrigin.value;

  background.update(1 / 60, 1 / 60, { x: 8191, y: 120, z: -3200 });
  assert.equal(background.camX, 8191);
  assert.equal(background.camZ, -3200);
  assert.equal(background.group.position.x, 8191);
  assert.equal(background.group.position.z, -3200);
  assert.equal(starUniforms.uCamPos.value.x, 8191);
  assert.equal(starUniforms.uCamPos.value.y, -3200);

  // The next physical frame advances two world units but crosses the floating-origin threshold.
  // Local camera X/Z therefore jump by thousands while galactic-global X/Z stay continuous.
  background.state.world.frameOrigin.x = 8192;
  background.state.world.frameOrigin.z = -4096;
  background.state.world.frameOriginSeq = 1;
  background.update(1 / 60, 2 / 60, { x: 1, y: 120, z: 896 });

  assert.equal(background.camX, 8193, 'procedural sky samples galactic-global X after rebase');
  assert.equal(background.camZ, -3200, 'procedural sky samples galactic-global Z after rebase');
  assert.equal(background.localCamX, 1);
  assert.equal(background.localCamZ, 896);
  assert.equal(background.group.position.x, 1, 'Three.js root remains in the current local frame');
  assert.equal(background.group.position.z, 896, 'Three.js root remains in the current local frame');
  assert.equal(rootUniform.x, 1, 'composite ray origin is restored to local render coordinates');
  assert.equal(rootUniform.z, 896, 'composite ray origin is restored to local render coordinates');
  assert.equal(starUniforms.uCamPos.value.x, 8193, 'star membership does not reset at the rebase');
  assert.equal(starUniforms.uCamPos.value.y, -3200, 'star membership does not reset at the rebase');
  assert.deepEqual(background.lastRegionPosition, { x: 8193, z: -3200 });

  const expected = layerUvOffset(8193, -3200, layer.par, layer.tile);
  assert.equal(layer.offset.x, expected.u, 'deep-field U remains the same global closed form');
  assert.equal(layer.offset.y, expected.v, 'deep-field V remains the same global closed form');
  const art = background.layerMaterial.uniforms;
  assert.equal(art.uPaintedSkyOffset.value.x, (8193 * 0.003 / background.H) % 1,
    'painted art crosses a rebase without doubling the origin');
  assert.equal(art.uPaintedSkyOffset.value.y, (3200 * 0.003 / background.H) % 1);
  assert.equal(art.uPaintedSkyScale.value.x, 0.88);
  assert.equal(art.uPaintedSkyScale.value.y, 0.88);
});

test('global camera projection reuses caller storage and adds only frame origin', () => {
  const out = { x: -1, y: -1, z: -1 };
  const state = { world: { frameOrigin: { x: 4096, z: -8192 } } };
  assert.strictEqual(resolveSpaceBackgroundGlobalCamera(
    state,
    { x: 12.5, y: 88, z: -3.25 },
    out,
  ), out);
  assert.deepEqual(out, { x: 4108.5, y: 88, z: -8195.25 });
});

test('hero admission sees the same visible planet across a frame-origin rebase', () => {
 for (const [globalX,globalZ] of [[8192,-4096],[-16384,12288]]) {
  for (const camera of [new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 20000),
    new THREE.OrthographicCamera(-180,180,100,-100,0.1,20000)]) {
  const bg = frameHarness();
  camera.position.set(0, 140, 80); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  bg.camera = camera; bg.heroSizeK = 4; bg.quadSize = 4000;
  const anchor = screenNdcToParallaxAnchor(camera, 0, 0, {x:0,z:80}, {bgY:bg.bgY,heroDepth:12});
  const spec={kind:'planet',type:'gas',frac:0.15,seed:7,
    bx:anchor.bx+globalX*0.055,bz:anchor.bz+globalZ*0.055};
  const before=frameHarness();
  const globalCamera=camera.clone();
  globalCamera.position.x+=globalX; globalCamera.position.z+=globalZ;
  globalCamera.updateMatrixWorld(true);
  before.camera=globalCamera; before.heroSizeK=4; before.quadSize=4000;
  before.heroPlacement=[spec];
  before._spawnPlanet=function(s) { this.planets.push({spec:s,sprite:{scale:{x:20}}}); };
  before.update(1/60, 1, {x:globalCamera.position.x,y:globalCamera.position.y,z:globalCamera.position.z});
  assert.equal(before.planets.length,1,'the same physical camera admits the centered planet before rebase');
  bg.heroPlacement=[spec];
  bg._spawnPlanet=function(s) { this.planets.push({spec:s,sprite:{scale:{x:20}}}); };
  bg.state.world.frameOrigin.x=globalX; bg.state.world.frameOrigin.z=globalZ;
  bg.update(1/60, 1, {x:camera.position.x,y:camera.position.y,z:camera.position.z});
  assert.equal(bg.planets.length,1,'a planet centered on the real local camera must be admitted');
  assert.equal(bg.planets[0].spec,spec);
  }
 }
});

test('sector refresh and resize project with camera and background in the same frame', () => {
  const bg=frameHarness(), camera=new THREE.PerspectiveCamera(50,16/9,0.1,20000);
  camera.position.set(0,140,80);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
  const origin={x:8192,z:-4096};bg.state.world.frameOrigin=origin;
  bg.camera=camera;bg.heroSizeK=4;bg.quadSize=4000;bg.seed=47;
  bg.localCamX=0;bg.localCamZ=80;bg.camX=origin.x;bg.camZ=origin.z+80;
  bg.group.position.set(0,bg.bgY,80);
  const anchor=screenNdcToParallaxAnchor(camera,0,0,{x:0,z:80},{bgY:bg.bgY,heroDepth:12});
  const spec={kind:'planet',type:'gas',frac:0.15,seed:7,bx:anchor.bx+origin.x*.055,bz:anchor.bz+origin.z*.055};
  const checks=[];
  const project=()=>{checks.push(bg._heroOnGlass(spec,.055,10));return 500;};
  bg._computePerspScale=project;bg._publishOpeningSubmissionPackage=()=>{};
  bg.onResize();assert.deepEqual(checks,[true]);
  bg._requestSkyPlate=()=>{};bg._skyPaletteForSector=()=>Object.keys(PALETTES)[0];
  bg._sectorTintCurrent=new THREE.Color();bg._sectorTintStart=new THREE.Color();bg._sectorTintTarget=new THREE.Color();
  bg.bakeAll=()=>{};bg._ensureNebulaBake=()=>{};bg._rebuildStarsAndFlares=()=>{};bg._spawnStructureCard=()=>{};
  bg._refreshHeroes=project;
  bg.onSectorEnter({id:'fixture'},null);
  assert.deepEqual(checks,[true,true]);
  assert.equal(camera.position.x,0);assert.equal(camera.position.z,80);
  assert.equal(bg.group.position.x,0);assert.equal(bg.group.position.z,80);
});

function frameHarness() {
  const position = {
    x: 0,
    y: 0,
    z: 0,
    set(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
    },
  };
  const rootUniform = {
    x: 0,
    y: 0,
    z: 0,
    copy(source) {
      this.x = source.x;
      this.y = source.y;
      this.z = source.z;
    },
  };
  const vector2 = () => ({
    x: 0,
    y: 0,
    set(x, y) {
      this.x = x;
      this.y = y;
    },
  });
  const layerOffset = vector2();
  const background = Object.create(SpaceBackground.prototype);
  Object.assign(background, {
    state: {
      world: { frameOrigin: { x: 0, z: 0 }, frameOriginSeq: 0 },
      render: {
        velocityLanguage: {
          schema: 'velocity_language_v1',
          drive: { parallaxGain: 0, smear: 0 },
          region: null,
        },
      },
    },
    bgTime: 0,
    camX: 0,
    camZ: 0,
    bgY: -220,
    bgIntensity: 0.7,
    nebulaOpacity: 0,
    H: 480,
    _paintedSkyReady: true,
    _paintedSkyStrength: 0,
    group: { position },
    _sectorTransition: { active: false },
    _streamPrimed: false,
    _streamCamX: 0,
    _streamCamZ: 0,
    _flowX: 0,
    _flowZ: 1,
    _smearFit: { stretch: 1, dim: 1 },
    layers: [{
      par: 0.1,
      tile: 1000,
      streamU: 0,
      streamV: 0,
      offset: layerOffset,
    }],
    layerMaterial: {
      uniforms: {
        uGroupOrigin: { value: rootUniform },
        uNebulaOpacity: { value: 0 },
        uPaintedSkyStrength: { value: 0 },
        uPaintedSkyOffset: { value: vector2() },
        uPaintedSkyScale: { value: vector2() },
      },
    },
    stars: {
      mat: {
        uniforms: {
          uCamPos: { value: vector2() },
          uTime: { value: 0 },
          uIntensity: { value: 0 },
          uPerspScale: { value: 0 },
          uFlowWorld: { value: vector2() },
          uSmearStretch: { value: 1 },
        },
      },
    },
    flares: null,
    planets: [],
    wormhole: null,
    structureMacro: null,
    structureCard: null,
    _computePerspScale: () => 500,
    _updateSectorVisualTransition() {},
    _updateRegionTint(x, z) { this.lastRegionPosition = { x, z }; },
    _updateComet() {},
    _refreshHeroes() {},
  });
  return background;
}
