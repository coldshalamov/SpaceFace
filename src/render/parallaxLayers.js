import * as THREE from 'three';
import {
  createFracturedDebrisGeometry, installDebrisVariantAttribute, decorateDebrisMaterial,
  resolveDebrisFinish,
} from './deepFieldPresentation.js';
import { getReadyRockSurfaceTextures } from './rockSurfaceLibrary.js';
import { CAMERA_ZOOM_MAX, PHYSICS_EARNED_SPEED_ZOOM_MAX, CONTEXT_ZOOM_MAX, BOOST_CAMERA_ZOOM_TARGET } from './camera.js';
import { stampOpeningSubmissionPackage } from './openingSubmissionPlan.js';
import { installSpaceBackgroundFrameCoordinateBridge } from './spaceBackgroundFrameCoordinates.js';
import { SHARED_MATERIAL_ROLE, stampSharedMaterialRole } from './sharedMaterialRoles.js';

// renderer.js imports this module before it constructs SpaceBackground. Install the coordinate
// adapter at that boundary so every ordinary browser/Electron route receives the same fix.
installSpaceBackgroundFrameCoordinateBridge();

const PALETTE_LERP_SECONDS = 1.5;
const FALLBACK_DUST = '#35406a';
const ROCK_BASE = 0xb4aea3;

// Quiet orbital remnants, all well below the playable plane. Stars and celestial landmarks own
// the composition; these sparse, small opaque chips only give a secondary depth cue. Keep the
// authored mesh surface, but stop paying for a permanent foreground-looking asteroid belt.
//
// The wrap tile is frozen for the life of the field. Growing it at runtime (the old 1.2× zoom
// steps) scaled every chip and changed the wrap period, so the whole belt vanished and came back
// in a new arrangement the instant speed-zoom crossed a step — both arrow-key cruise and idle
// sit on opposite sides of that line. Size the cell for CAMERA_ZOOM_MAX up front instead.
export const PARALLAX_WRAP_ZOOM_CAP = CAMERA_ZOOM_MAX * PHYSICS_EARNED_SPEED_ZOOM_MAX
  * (1 + CONTEXT_ZOOM_MAX) * BOOST_CAMERA_ZOOM_TARGET;
export const PARALLAX_WRAP_FOV_DEG = 50;
export const PARALLAX_WRAP_TILT_DEG = 60;
export const PARALLAX_WRAP_ASPECT = 4;
const PARALLAX_TILE_MARGIN = 1.12 / 0.78; // keep the shader's edge-shrink zone offscreen

export function requiredParallaxWrapTile({
  y = 0,
  zoom = PARALLAX_WRAP_ZOOM_CAP,
  fov = PARALLAX_WRAP_FOV_DEG,
  tilt = PARALLAX_WRAP_TILT_DEG,
  aspect = PARALLAX_WRAP_ASPECT,
  margin = PARALLAX_TILE_MARGIN,
} = {}) {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : PARALLAX_WRAP_ZOOM_CAP;
  const fovDeg = Number.isFinite(fov) ? fov : PARALLAX_WRAP_FOV_DEG;
  const tiltDeg = Number.isFinite(tilt) ? tilt : PARALLAX_WRAP_TILT_DEG;
  const asp = Number.isFinite(aspect) && aspect > 0 ? aspect : PARALLAX_WRAP_ASPECT;
  const halfFovRad = Math.max(4, fovDeg * 0.5) * Math.PI / 180;
  const tiltRad = tiltDeg * Math.PI / 180;
  const sideTan = Math.tan(halfFovRad);
  const height = z * Math.sin(tiltRad) + Math.abs(Number(y) || 0);
  const denominator = Math.max(0.05, Math.sin(tiltRad) - sideTan * Math.cos(tiltRad));
  const halfSide = sideTan * asp * height / denominator;
  const lookReach = Math.abs(-z * Math.cos(tiltRad)
    + height * (Math.cos(tiltRad) + sideTan * Math.sin(tiltRad)) / denominator);
  return Math.max(halfSide, lookReach) * (Number.isFinite(margin) && margin > 0 ? margin : PARALLAX_TILE_MARGIN) * 2;
}

function freezeWrapTile(authored, y) {
  const need = requiredParallaxWrapTile({ y, zoom: PARALLAX_WRAP_ZOOM_CAP });
  return Math.max(authored, Math.ceil(need / 40) * 40);
}

const FAR = { count: 24, factor: 0.12, tile: freezeWrapTile(2400, -160), y: -160, yJitter: 24, radius0: 0.8, radius1: 4 };
const MID = { count: 128, factor: 0.24, tile: freezeWrapTile(2000, -100), y: -100, yJitter: 16, radius0: 0.25, radius1: 1.2 };
const NEAR = { count: 24, factor: 0.40, tile: freezeWrapTile(2000, -60), y: -60, yJitter: 10, radius0: 0.05, radius1: 0.2 };
export const PARALLAX_BANDS = { far: FAR, mid: MID, near: NEAR };

const MID_LOW_COUNT = Math.max(1, Math.floor(MID.count * 0.5));
const MID_SPIN_AXIS_ATTRIBUTE = 'aParallaxSpinAxis';
const MID_SPIN_PARAMS_ATTRIBUTE = 'aParallaxSpinParams';
const MID_SPIN_SHADER_KEY = 'spaceface-parallax-mid-debris-gpu-spin-v2';
const INSTANCE_WRAP_SHADER_KEY = 'spaceface-parallax-instance-wrap-v2';
const EMPTY_OBJECT = {};

let active = null;

export function init(scene, state, bus, initialPalette) {
  if (active) active.dispose();
  active = new ParallaxLayers(scene, state, bus, initialPalette);
  return active;
}

export function update(dt) {
  if (active) active.update(dt);
}

export function dispose() {
  if (!active) return;
  active.dispose();
  active = null;
}

/** GLSL-equivalent scalar wrap, exported for continuity tests and diagnostics. */
export function wrapParallaxCoordinate(base, globalFocus, factor, tile) {
  const period = Number.isFinite(tile) && tile > 0 ? tile : 1;
  const value = (Number.isFinite(base) ? base : 0)
    - (Number.isFinite(globalFocus) ? globalFocus : 0) * (Number.isFinite(factor) ? factor : 0);
  const half = period * 0.5;
  return ((value + half) % period + period) % period - half;
}

/** Authored centers already live in the frozen wrap cell. Kept so older callers stay identity. */
export function parallaxDistributionCoordinate(base, authoredTile, effectiveTile) {
  void authoredTile;
  void effectiveTile;
  return Number.isFinite(base) ? base : 0;
}

class ParallaxLayers {
  constructor(scene, state, bus, initialPalette) {
    this.scene = scene;
    this.state = state || {};
    this.bus = bus || null;
    this.groups = [];
    this._layers = [];
    this._bandMaterials = [];

    this._colorStart = new THREE.Color();
    this._colorTarget = new THREE.Color();
    this._colorCurrent = new THREE.Color();
    this._colorScratch = new THREE.Color();
    this._rockBase = new THREE.Color(ROCK_BASE);
    this._paletteIdentity = initialPalette || readPalette(this.state);
    resolvePaletteColor(this._colorCurrent, this._paletteIdentity);
    this._colorStart.copy(this._colorCurrent);
    this._colorTarget.copy(this._colorCurrent);
    this._paletteElapsed = PALETTE_LERP_SECONDS;
    this._paletteActive = false;
    // Color and physical finish share the existing sector transition; rocks never morph or respawn.
    this._finishTarget = resolveDebrisFinish(this._paletteIdentity);
    this._finishStart = { ...this._finishTarget };
    this._finishCurrent = { ...this._finishTarget };

    this._matrix = new THREE.Matrix4();
    this._pos = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
    this._scale = new THREE.Vector3();
    this._euler = new THREE.Euler();

    this._qualityLow = null;
    this._motionReduce = null;

    this._chipTemplate = createFracturedDebrisGeometry();
    this._sharedMaps = getReadyRockSurfaceTextures();

    this._debrisSpinUniforms = {
      primaryTime: { value: 0 },
      tailTime: { value: 0 },
    };

    this._createFarDust();
    this._createMidDebris();
    this._createNearMotes();
    this._syncQuality();
    this._applyPaletteColor(this._colorCurrent);
  }

  update(dt) {
    const frameDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
    this._detectPaletteChange();
    this._syncQuality();

    // Camera focus is frame-local. Procedural membership must be sampled in galactic-global space,
    // while each finite draw group remains centered on the local camera. Moving the whole group with
    // a modulo used to make every asteroid teleport together at a tile seam and made a rebase select
    // an unrelated field. The shader now wraps every instance independently from global focus.
    const camera = this.state.camera || EMPTY_OBJECT;
    const focus = camera.focus || camera.obj && camera.obj.position || null;
    const localX = focus && Number.isFinite(focus.x) ? focus.x : 0;
    const localZ = focus && Number.isFinite(focus.z) ? focus.z : 0;
    const origin = this.state.world && this.state.world.frameOrigin || EMPTY_OBJECT;
    const worldX = localX + (Number.isFinite(origin.x) ? origin.x : 0);
    const worldZ = localZ + (Number.isFinite(origin.z) ? origin.z : 0);

    for (let i = 0; i < this._layers.length; i++) {
      const layer = this._layers[i];
      layer.group.position.x = localX;
      layer.group.position.z = localZ;
      layer.motionUniforms.worldFocus.value.set(worldX, worldZ);
    }

    this._updatePalette(frameDt);
    this._updateDebris(frameDt);
  }

  dispose() {
    for (let i = 0; i < this.groups.length; i++) {
      const group = this.groups[i];
      if (this.scene) this.scene.remove(group);
      disposeGroup(group, this._sharedMaps);
    }
    this.groups.length = 0;
    this._layers.length = 0;
    this._bandMaterials.length = 0;
    if (this._chipTemplate) {
      this._chipTemplate.dispose();
      this._chipTemplate = null;
    }
  }

  _createFarDust() {
    const band = this._spawnChipBand({
      spec: FAR,
      name: 'Parallax_FarDust',
      layer: 'farDust',
      renderOrder: -9,
      seed: 0x17a2c9,
      colorMul: 0.16,
      spin: false,
    });
    this._farGroup = band.group;
    this._farMesh = band.mesh;
  }

  _createMidDebris() {
    const band = this._spawnChipBand({
      spec: MID,
      name: 'Parallax_MidDebris',
      layer: 'midDebris',
      renderOrder: -6,
      seed: 0x47a2e1,
      colorMul: 0.24,
      spin: true,
    });
    this._midGroup = band.group;
    this._debrisMesh = band.mesh;
  }

  _createNearMotes() {
    const band = this._spawnChipBand({
      spec: NEAR,
      name: 'Parallax_NearSpeedMotes',
      layer: 'nearSpeedMotes',
      renderOrder: 2,
      seed: 0xe147ac,
      colorMul: 0.30,
      spin: true,
    });
    this._nearGroup = band.group;
    this._nearMesh = band.mesh;
  }

  _spawnChipBand({ spec, name, layer, renderOrder, seed, colorMul, spin }) {
    const group = new THREE.Group();
    group.name = name;
    group.renderOrder = renderOrder;
    group.userData.layer = layer;
    group.userData.factor = spec.factor;
    group.userData.tileSize = spec.tile;
    group.userData.baseCount = spec.count;
    group.userData.activeCount = spec.count;

    const motionUniforms = {
      worldFocus: { value: new THREE.Vector2() },
      factor: { value: spec.factor },
      authoredTile: { value: spec.tile },
      tile: { value: spec.tile },
    };
    const material = createChipMaterial(this._sharedMaps, colorMul);
    configureParallaxBandGpuMotion(
      material,
      motionUniforms,
      spin ? this._debrisSpinUniforms : null,
    );

    decorateDebrisMaterial(material, spin);
    const geometry = this._chipTemplate.clone();
    installDebrisVariantAttribute(geometry, spec.count);
    let spinAxes = null;
    let spinParams = null;
    if (spin) {
      spinAxes = new THREE.InstancedBufferAttribute(new Float32Array(spec.count * 3), 3)
        .setUsage(THREE.StaticDrawUsage);
      spinParams = new THREE.InstancedBufferAttribute(new Float32Array(spec.count * 3), 3)
        .setUsage(THREE.StaticDrawUsage);
      geometry.setAttribute(MID_SPIN_AXIS_ATTRIBUTE, spinAxes);
      geometry.setAttribute(MID_SPIN_PARAMS_ATTRIBUTE, spinParams);
    }

    const mesh = new THREE.InstancedMesh(geometry, material, spec.count);
    mesh.name = `${name}_Instances`;
    mesh.renderOrder = renderOrder;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    group.add(mesh);

    const colors = new Float32Array(spec.count * 3);
    const rnd = makeRand(seed);

    for (let i = 0; i < spec.count; i++) {
      const x = (rnd() - 0.5) * spec.tile;
      const z = (rnd() - 0.5) * spec.tile;
      const y = spec.y + (rnd() - 0.5) * spec.yJitter;
      const r = rnd();
      const radius = spec.radius0 + r * r * r * (spec.radius1 - spec.radius0);
      const squat = 0.55 + rnd() * 0.7;
      const stretch = 0.7 + rnd() * 0.85;

      this._pos.set(x, y, z);
      this._euler.set(rnd() * Math.PI, rnd() * Math.PI * 2, rnd() * Math.PI);
      this._quat.setFromEuler(this._euler);
      this._scale.set(radius * stretch, radius * squat, radius);
      this._matrix.compose(this._pos, this._quat, this._scale);
      mesh.setMatrixAt(i, this._matrix);

      const shade = 0.72 + rnd() * 0.4;
      colors[i * 3] = shade;
      colors[i * 3 + 1] = shade * (0.94 + rnd() * 0.08);
      colors[i * 3 + 2] = shade * (0.86 + rnd() * 0.12);

      if (spinAxes && spinParams) {
        let ax = rnd() * 2 - 1;
        let ay = rnd() * 2 - 1;
        let az = rnd() * 2 - 1;
        const len = Math.hypot(ax, ay, az) || 1;
        const offset = i * 3;
        spinAxes.array[offset] = ax / len;
        spinAxes.array[offset + 1] = ay / len;
        spinAxes.array[offset + 2] = az / len;
        spinParams.array[offset] = rnd() * Math.PI * 2;
        spinParams.array[offset + 1] = 0.02 + rnd() * 0.08;
        spinParams.array[offset + 2] = layer === 'midDebris' && i >= MID_LOW_COUNT ? 1 : 0;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3).setUsage(THREE.StaticDrawUsage);

    this.scene.add(group);
    this.groups.push(group);
    this._layers.push({ group, factor: spec.factor, tile: spec.tile, y: spec.y, effTile: spec.tile, motionUniforms });
    this._bandMaterials.push({ material, colorMul });
    return { group, mesh, motionUniforms };
  }

  _syncQuality() {
    const video = this.state.settings && this.state.settings.video || EMPTY_OBJECT;
    const low = video.particleQuality === 'low';
    const motionReduce = video.motionReduce === true;
    if (low === this._qualityLow && motionReduce === this._motionReduce) return;
    this._qualityLow = low;
    this._motionReduce = motionReduce;

    // This small static population fits every tier. Quality/reduced-motion changes must not
    // blink half the scenery out of existence; reduced motion changes animation, not membership.
    const farCount = FAR.count;
    const midCount = MID.count;
    const nearCount = NEAR.count;

    if (this._farMesh) {
      this._farMesh.count = farCount;
      if (this._farGroup) this._farGroup.userData.activeCount = farCount;
    }
    if (this._debrisMesh) {
      this._debrisMesh.count = midCount;
      if (this._midGroup) this._midGroup.userData.activeCount = midCount;
    }
    if (this._nearMesh) {
      this._nearMesh.count = nearCount;
      if (this._nearGroup) this._nearGroup.userData.activeCount = nearCount;
    }
    this._publishOpeningSubmissionPackages();
  }

  _publishOpeningSubmissionPackages() {
    for (const layer of this._layers) {
      const group = layer && layer.group;
      const mesh = group && group.children && group.children.find((child) => child && child.isInstancedMesh);
      if (!group || !mesh) continue;
      const geometry = mesh.geometry;
      const material = mesh.material;
      stampOpeningSubmissionPackage(group, {
        schema: 'spaceface.parallaxProducerManifest.v1',
        producer: `parallax:${group.name}`,
        version: 4,
        layer: group.userData.layer || group.name,
        factor: Number(group.userData.factor) || 0,
        tileSize: Number(group.userData.tileSize) || 0,
        wrapMode: 'per-instance-global-focus',
        tileFrozen: true,
        baseCount: Number(group.userData.baseCount) || 0,
        activeCount: Number(group.userData.activeCount) || 0,
        geometryAttributes: geometry ? Object.keys(geometry.attributes || {}).sort() : [],
        geometryDrawRange: geometry && geometry.drawRange
          ? {
            start: Number(geometry.drawRange.start) || 0,
            count: Number(geometry.drawRange.count) || 0,
          }
          : null,
        materialType: material && material.type || null,
        materialCustomProgramKey: material && typeof material.customProgramCacheKey === 'function'
          ? (() => { try { return String(material.customProgramCacheKey() || ''); } catch (_) { return ''; } })()
          : '',
      }, {
        producer: `parallax:${group.name}`,
        assetId: group.userData.assetId || group.name,
        replace: true,
      });
    }
  }

  _detectPaletteChange() {
    const palette = readPalette(this.state);
    if (!palette || palette === this._paletteIdentity) return;
    this._paletteIdentity = palette;
    this._finishStart.roughness = this._finishCurrent.roughness;
    this._finishStart.metalness = this._finishCurrent.metalness;
    this._finishStart.normalStrength = this._finishCurrent.normalStrength;
    this._finishTarget = resolveDebrisFinish(palette);
    this._colorStart.copy(this._colorCurrent);
    resolvePaletteColor(this._colorTarget, palette);
    this._paletteElapsed = 0;
    this._paletteActive = true;
  }

  _updatePalette(dt) {
    if (!this._paletteActive) return;
    this._paletteElapsed = Math.min(PALETTE_LERP_SECONDS, this._paletteElapsed + dt);
    const rawT = PALETTE_LERP_SECONDS > 0 ? this._paletteElapsed / PALETTE_LERP_SECONDS : 1;
    const t = rawT * rawT * (3 - 2 * rawT);
    this._colorCurrent.lerpColors(this._colorStart, this._colorTarget, t);
    const from = this._finishStart;
    const to = this._finishTarget;
    this._finishCurrent.roughness = from.roughness + (to.roughness - from.roughness) * t;
    this._finishCurrent.metalness = from.metalness + (to.metalness - from.metalness) * t;
    this._finishCurrent.normalStrength = from.normalStrength + (to.normalStrength - from.normalStrength) * t;
    this._applyPaletteColor(this._colorCurrent);
    if (rawT >= 1) {
      this._paletteActive = false;
      this._colorCurrent.copy(this._colorTarget);
      this._applyPaletteColor(this._colorCurrent);
    }
  }

  _applyPaletteColor(color) {
    for (let i = 0; i < this._bandMaterials.length; i++) {
      const band = this._bandMaterials[i];
      this._colorScratch.copy(this._rockBase).lerp(color, 0.38).multiplyScalar(band.colorMul);
      band.material.color.copy(this._colorScratch);
      band.material.roughness = this._finishCurrent.roughness;
      band.material.metalness = this._finishCurrent.metalness;
      band.material.normalScale.setScalar(this._finishCurrent.normalStrength);
    }
  }

  _updateDebris(dt) {
    const uniforms = this._debrisSpinUniforms;
    if (!uniforms || dt <= 0 || this._motionReduce) return;
    const midCount = this._debrisMesh ? this._debrisMesh.count : 0;
    if (midCount > 0 || (this._nearMesh && this._nearMesh.count > 0)) uniforms.primaryTime.value += dt;
    if (midCount > MID_LOW_COUNT) uniforms.tailTime.value += dt;
  }
}

function createChipMaterial(maps, colorMul) {
  return stampSharedMaterialRole(new THREE.MeshStandardMaterial({
    color: new THREE.Color(ROCK_BASE).multiplyScalar(colorMul),
    map: maps && maps.baseColor || null,
    normalMap: maps && maps.normal || null,
    normalScale: new THREE.Vector2(0.82, 0.82),
    roughnessMap: maps && maps.orm || null,
    metalnessMap: maps && maps.orm || null,
    aoMap: maps && maps.orm || null,
    roughness: maps ? 1 : 0.9,
    metalness: maps ? 1 : 0.05,
    envMapIntensity: 0.28,
    fog: true,
    transparent: false,
    depthWrite: true,
    depthTest: true,
  }), SHARED_MATERIAL_ROLE.ROCK);
}

function configureParallaxBandGpuMotion(material, motionUniforms, spinUniforms = null) {
  const originalOnBeforeCompile = material.onBeforeCompile;
  const originalProgramCacheKey = material.customProgramCacheKey();
  const spin = !!spinUniforms;

  material.onBeforeCompile = function parallaxBandGpuMotion(shader, renderer) {
    if (typeof originalOnBeforeCompile === 'function') originalOnBeforeCompile.call(this, shader, renderer);

    shader.uniforms.uParallaxWorldFocus = motionUniforms.worldFocus;
    shader.uniforms.uParallaxFactor = motionUniforms.factor;
    shader.uniforms.uParallaxTile = motionUniforms.tile;
    if (spin) {
      shader.uniforms.uParallaxPrimaryTime = spinUniforms.primaryTime;
      shader.uniforms.uParallaxTailTime = spinUniforms.tailTime;
    }

    const declarations = [
      '#include <common>',
      'uniform vec2 uParallaxWorldFocus;',
      'uniform float uParallaxFactor;',
      'uniform float uParallaxTile;',
    ];
    if (spin) {
      declarations.push(
        `attribute vec3 ${MID_SPIN_AXIS_ATTRIBUTE};`,
        `attribute vec3 ${MID_SPIN_PARAMS_ATTRIBUTE};`,
        'uniform float uParallaxPrimaryTime;',
        'uniform float uParallaxTailTime;',
        'vec3 sfRotateParallaxDebris(vec3 point, vec3 axis, float angle) {',
        '  float c = cos(angle);',
        '  float s = sin(angle);',
        '  return point * c + cross(axis, point) * s + axis * dot(axis, point) * (1.0 - c);',
        '}',
      );
    }
    shader.vertexShader = replaceRequiredShaderSource(
      shader.vertexShader,
      '#include <common>',
      declarations.join('\n'),
      'common declarations',
    );

    if (spin) {
      shader.vertexShader = replaceRequiredShaderSource(
        shader.vertexShader,
        '#include <begin_vertex>',
        [
          '#include <begin_vertex>',
          `float sfParallaxTime = mix(uParallaxPrimaryTime, uParallaxTailTime, ${MID_SPIN_PARAMS_ATTRIBUTE}.z);`,
          `float sfParallaxAngle = ${MID_SPIN_PARAMS_ATTRIBUTE}.x + ${MID_SPIN_PARAMS_ATTRIBUTE}.y * sfParallaxTime;`,
          'transformed = sfRotateParallaxDebris(transformed, ' + MID_SPIN_AXIS_ATTRIBUTE + ', sfParallaxAngle);',
        ].join('\n'),
        'local vertex rotation',
      );
    }

    // Wrap + edge shrink run before project_vertex so the chip can be scaled into nothing as it
    // approaches the wrap-cell edge. A chip that dissolves before the boundary cannot pop across
    // it, and the empty region outside the cell can never show a chip vanishing mid-screen.
    shader.vertexShader = replaceRequiredShaderSource(
      shader.vertexShader,
      '#include <begin_vertex>',
      [
        '#include <begin_vertex>',
        'vec2 sfParallaxBaseCenter = instanceMatrix[3].xz;',
        'vec2 sfParallaxWrappedCenter = mod(',
        '  sfParallaxBaseCenter - uParallaxWorldFocus * uParallaxFactor + uParallaxTile * 0.5,',
        '  uParallaxTile',
        ') - uParallaxTile * 0.5;',
        'vec2 sfParallaxDelta = sfParallaxWrappedCenter - sfParallaxBaseCenter;',
        'float sfParallaxEdge = max(abs(sfParallaxWrappedCenter.x), abs(sfParallaxWrappedCenter.y))',
        '  / (uParallaxTile * 0.5);',
        'transformed *= 1.0 - smoothstep(0.78, 0.97, sfParallaxEdge);',
      ].join('\n'),
      'wrapped instance center + edge shrink',
    );

    shader.vertexShader = replaceRequiredShaderSource(
      shader.vertexShader,
      '#include <project_vertex>',
      [
        '#include <project_vertex>',
        'mvPosition.xyz += (modelViewMatrix * vec4(sfParallaxDelta.x, 0.0, sfParallaxDelta.y, 0.0)).xyz;',
        'gl_Position = projectionMatrix * mvPosition;',
      ].join('\n'),
      'projected instance wrap',
    );
  };

  material.customProgramCacheKey = () => [
    originalProgramCacheKey,
    INSTANCE_WRAP_SHADER_KEY,
    spin ? MID_SPIN_SHADER_KEY : '',
  ].filter(Boolean).join('|');
  material.userData = {
    ...(material.userData || {}),
    spacefaceParallaxInstanceWrap: {
      version: 2,
      mode: 'per-instance-global-focus',
      tileFrozen: true,
      uniforms: motionUniforms,
    },
    ...(spin ? {
      spacefaceParallaxMidDebrisGpuSpin: {
        version: 2,
        axisAttribute: MID_SPIN_AXIS_ATTRIBUTE,
        paramsAttribute: MID_SPIN_PARAMS_ATTRIBUTE,
        uniforms: spinUniforms,
      },
    } : {}),
  };
  material.needsUpdate = true;
}

function replaceRequiredShaderSource(source, needle, replacement, label) {
  if (typeof source !== 'string' || !source.includes(needle)) {
    throw new Error(`[render] parallax band shader contract changed: missing ${label}`);
  }
  return source.replace(needle, replacement);
}

function readPalette(state) {
  return state && state.render ? state.render.sectorPalette : null;
}

function resolvePaletteColor(target, palette) {
  const value = palette && (palette.dust != null ? palette.dust : palette.nebulaTint);
  try { target.set(value != null ? value : FALLBACK_DUST); }
  catch (_) { target.set(FALLBACK_DUST); }
  return target;
}

function makeRand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function disposeGroup(group, sharedMaps) {
  group.traverse((obj) => {
    if (obj.isInstancedMesh && obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (let i = 0; i < materials.length; i++) {
        const material = materials[i];
        if (!material) continue;
        const maps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'];
        for (let m = 0; m < maps.length; m++) {
          const tex = material[maps[m]];
          if (!tex) continue;
          const shared = sharedMaps && (
            tex === sharedMaps.baseColor || tex === sharedMaps.normal || tex === sharedMaps.orm
          );
          if (!shared) tex.dispose();
        }
        material.dispose();
      }
    }
  });
}
