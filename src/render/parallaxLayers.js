import * as THREE from 'three';
import { displacementScalar } from './objectSpaceGeology.js';
import { getReadyRockSurfaceTextures } from './rockSurfaceLibrary.js';
import { stampOpeningSubmissionPackage } from './openingSubmissionPlan.js';
import { installSpaceBackgroundFrameCoordinateBridge } from './spaceBackgroundFrameCoordinates.js';

// renderer.js imports this module before it constructs SpaceBackground. Install the coordinate
// adapter at that boundary so every ordinary browser/Electron route receives the same fix.
installSpaceBackgroundFrameCoordinateBridge();

const PALETTE_LERP_SECONDS = 1.5;
const FALLBACK_DUST = '#35406a';
const ROCK_BASE = 0xb4aea3;

// Opaque geology chips, not glow cards. One instanced draw per band. Counts are sized so the
// chase camera sees a readable belt of matter between the sky and the play plane — the previous
// additive tetrahedra / point sprites could only fake density by lighting up.
const FAR = { count: 80, factor: 0.22, tile: 3000, y: -96, yJitter: 36, radius0: 7, radius1: 28 };
const MID = { count: 1400, factor: 0.55, tile: 560, y: -28, yJitter: 18, radius0: 0.28, radius1: 3.4 };
const NEAR = { count: 96, factor: 1.18, tile: 460, y: 4, yJitter: 9, radius0: 0.07, radius1: 0.42 };

// The wrap cell must always be wider than the visible frustum footprint at the band's plane, or
// the cell edge itself becomes an on-screen line: chips pop across it and empty sky shows outside
// it. The authored tile is sized for the default chase view; when the player zooms out (or widens
// FOV) the effective tile grows in discrete steps so the edge stays off-screen. Instance counts
// never change — the same authored chips spread over the larger cell.
const PARALLAX_TILE_MARGIN = 1.12;
const PARALLAX_TILE_MAX_SCALE = 4;
const PARALLAX_TILE_STEP = 1.2;
const MID_LOW_COUNT = Math.max(1, Math.floor(MID.count * 0.5));
const MID_SPIN_AXIS_ATTRIBUTE = 'aParallaxSpinAxis';
const MID_SPIN_PARAMS_ATTRIBUTE = 'aParallaxSpinParams';
const MID_SPIN_SHADER_KEY = 'spaceface-parallax-mid-debris-gpu-spin-v2';
const INSTANCE_WRAP_SHADER_KEY = 'spaceface-parallax-instance-wrap-v1';
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

    this._matrix = new THREE.Matrix4();
    this._pos = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
    this._scale = new THREE.Vector3();
    this._euler = new THREE.Euler();

    this._qualityLow = null;
    this._motionReduce = null;

    this._chipTemplate = createChipGeometry(2);
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
    this._updateWrapTiles();
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
      colorMul: 0.28,
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
      colorMul: 0.78,
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
      colorMul: 1.05,
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
      tile: { value: spec.tile },
    };
    const material = createChipMaterial(this._sharedMaps, colorMul);
    configureParallaxBandGpuMotion(
      material,
      motionUniforms,
      spin ? this._debrisSpinUniforms : null,
    );

    const geometry = this._chipTemplate.clone();
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

    const farCount = low ? Math.max(1, Math.floor(FAR.count * 0.5)) : FAR.count;
    const midCount = low ? MID_LOW_COUNT : MID.count;
    let nearCount = low ? Math.floor(NEAR.count * 0.5) : NEAR.count;
    if (motionReduce) nearCount = Math.floor(nearCount * 0.5);
    if (NEAR.count > 0) nearCount = Math.max(1, nearCount);

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
        version: 3,
        layer: group.userData.layer || group.name,
        factor: Number(group.userData.factor) || 0,
        tileSize: Number(group.userData.tileSize) || 0,
        wrapMode: 'per-instance-global-focus',
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
    }
  }

  /**
   * Keep each band's wrap cell wider than the visible frustum footprint at the band's plane.
   * The effective tile only changes in discrete PARALLAX_TILE_STEP multiples of the authored tile,
   * so between steps the wrap is bit-identical (no reflow) and a step boundary is a single instant
   * re-layout instead of continuous churn. Instance counts are untouched.
   */
  _updateWrapTiles() {
    const camera = this.state.camera || EMPTY_OBJECT;
    const camObj = camera.obj || EMPTY_OBJECT;
    const zoom = Number.isFinite(camera.liveZoom) ? camera.liveZoom
      : Number.isFinite(camera.zoom) ? camera.zoom : 144;
    const fovDeg = Number.isFinite(camera.fov) ? camera.fov : 50;
    const aspect = Number.isFinite(camObj.aspect) && camObj.aspect > 0 ? camObj.aspect : 16 / 9;
    const tiltDeg = Number.isFinite(camera.tilt) ? camera.tilt : 60;
    const halfFovRad = Math.max(4, fovDeg * 0.5) * Math.PI / 180;
    // Steepest ray still inside the frustum (tilt − half fov above the camera axis) — where it
    // hits the band plane is the far edge of the visible footprint along the look direction.
    const lookTan = Math.tan(Math.max(6, tiltDeg - fovDeg * 0.5) * Math.PI / 180);
    const sideTan = Math.tan(halfFovRad);
    for (let i = 0; i < this._layers.length; i++) {
      const layer = this._layers[i];
      const planeDist = zoom + Math.abs(Number(layer.y) || 0);
      const planeScale = zoom > 0 ? planeDist / zoom : 1;
      const halfSide = sideTan * zoom * aspect * planeScale;
      const lookReach = planeDist / lookTan;
      const scaled = Math.max(halfSide, lookReach) * PARALLAX_TILE_MARGIN * 2;
      const base = layer.tile;
      const capped = Math.min(scaled, base * PARALLAX_TILE_MAX_SCALE);
      const steps = capped > base
        ? Math.ceil(Math.log(capped / base) / Math.log(PARALLAX_TILE_STEP))
        : 0;
      const effTile = steps > 0 ? Math.min(base * Math.pow(PARALLAX_TILE_STEP, steps), base * PARALLAX_TILE_MAX_SCALE) : base;
      if (effTile !== layer.effTile) {
        layer.effTile = effTile;
        layer.motionUniforms.tile.value = effTile;
      }
    }
  }

  _updateDebris(dt) {
    const uniforms = this._debrisSpinUniforms;
    if (!uniforms || dt <= 0) return;
    const midCount = this._debrisMesh ? this._debrisMesh.count : 0;
    if (midCount > 0 || (this._nearMesh && this._nearMesh.count > 0)) uniforms.primaryTime.value += dt;
    if (midCount > MID_LOW_COUNT) uniforms.tailTime.value += dt;
  }
}

function createChipGeometry(variantIndex) {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const len = Math.hypot(x, y, z) || 1;
    const nx = x / len;
    const ny = y / len;
    const nz = z / len;
    const lift = 1 + displacementScalar(nx, ny, nz, variantIndex) * 2.15;
    // Flattened flake, not a round pebble: meteoritic chips read as broken matter.
    pos.setXYZ(i, nx * lift * 1.12, ny * lift * 0.38, nz * lift * 0.82);
  }
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

function createChipMaterial(maps, colorMul) {
  return new THREE.MeshStandardMaterial({
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
  });
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
      version: 1,
      mode: 'per-instance-global-focus',
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
