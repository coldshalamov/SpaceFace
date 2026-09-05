import * as THREE from 'three';
import { rebuildDeepFieldStars, STELLAR_FORMATIONS } from './deepFieldStars.js';
import { SECTOR_PALETTE_CLASSES } from '../data/sectors.js';
import {
  DEEP_FIELD_VOID_SIZE, DEEP_FIELD_FINISHES, DEEP_FIELD_VERTEX, DEEP_FIELD_FRAGMENT,
  projectDebrisVertex, rgbaMipBytes,
} from './deepFieldDesign.js';

const INSTALL_MARK = Symbol.for('spaceface.deepFieldPresentation.v1');
const POSITION_B = 'aDeepFieldPositionB';
const NORMAL_B = 'aDeepFieldNormalB';
const VARIANT = 'aDeepFieldVariant';

/** Select a finish from the existing region authority, never a second sector registry. */
export function resolveDebrisFinish(palette) {
  for (const key of Object.keys(SECTOR_PALETTE_CLASSES)) {
    const candidate = SECTOR_PALETTE_CLASSES[key];
    const matches = candidate === palette || (palette && palette.nebulaTint != null
      && candidate.nebulaTint === palette.nebulaTint);
    if (matches && DEEP_FIELD_FINISHES[key]) {
      return DEEP_FIELD_FINISHES[key];
    }
  }
  return DEEP_FIELD_FINISHES.core;
}

/** Two closed, independently-normaled silhouettes, the same 80 triangles as the former flake. */
export function createFracturedDebrisGeometry() {
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const other = geometry.clone();
  const scratch = [0, 0, 0];
  for (let variant = 0; variant < 2; variant++) {
    const target = variant ? other : geometry;
    const positions = target.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      projectDebrisVertex(positions.getX(i), positions.getY(i), positions.getZ(i), variant, scratch);
      positions.setXYZ(i, scratch[0], scratch[1], scratch[2]);
    }
    target.computeVertexNormals();
    target.computeBoundingSphere();
  }
  geometry.setAttribute(POSITION_B, other.getAttribute('position').clone());
  geometry.setAttribute(NORMAL_B, other.getAttribute('normal').clone());
  geometry.boundingSphere.center.set(0, 0, 0);
  geometry.boundingSphere.radius = 1.53; // Contains both closed solids, including their bevel.
  geometry.userData.deepFieldSilhouettes = ['fractured-block', 'sheared-splinter'];
  other.dispose();
  return geometry;
}

/** Static, evenly interleaved membership also gives low-quality prefix draws both silhouettes. */
export function installDebrisVariantAttribute(geometry, count) {
  const variants = new Float32Array(count);
  for (let i = 0; i < count; i++) variants[i] = i % 2;
  geometry.setAttribute(VARIANT,
    new THREE.InstancedBufferAttribute(variants, 1).setUsage(THREE.StaticDrawUsage));
}

/** Extend the existing wrap/spin shader, not a competing update loop or lighting model. */
export function decorateDebrisMaterial(material, spin) {
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = function deepFieldDebrisCompile(shader, renderer) {
    previousCompile.call(this, shader, renderer);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `
      #include <common>
      attribute vec3 ${POSITION_B};
      attribute vec3 ${NORMAL_B};
      attribute float ${VARIANT};
    `);
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      transformed = mix(transformed, ${POSITION_B}, step(0.5, ${VARIANT}));
    `);
    // Runs before Three's instance inverse-scale / normalMatrix transform. Rotating only vertices
    // leaves the light glued to the old surface and makes a turning solid read as a hollow dome.
    // Depth-only shader fixtures can omit normals; the standard material always includes this chunk.
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `
      #include <beginnormal_vertex>
      objectNormal = mix(objectNormal, ${NORMAL_B}, step(0.5, ${VARIANT}));
      ${spin ? `
      float sfDeepFieldAngle = aParallaxSpinParams.x + aParallaxSpinParams.y
        * mix(uParallaxPrimaryTime, uParallaxTailTime, aParallaxSpinParams.z);
      objectNormal = sfRotateParallaxDebris(objectNormal, aParallaxSpinAxis, sfDeepFieldAngle);
      #ifdef USE_TANGENT
        objectTangent = sfRotateParallaxDebris(objectTangent, aParallaxSpinAxis, sfDeepFieldAngle);
      #endif` : ''}
    `);
  };
  material.customProgramCacheKey = () => `${previousKey()}|deep-field-fracture-normal-v1`;
  material.userData.deepFieldPresentation = { version: 1, silhouettes: 2, animatedNormals: !!spin };
  material.needsUpdate = true;
}

/**
 * Narrow factory upgrade installed at the existing default-route background bridge. This does
 * not patch update(), change the camera, own simulation, or add another scene/background.
 * See docs/render/DEEP_FIELD_BACKGROUND.md for the integration and extension contract.
 */
export function installDeepFieldPresentation(Background) {
  const proto = Background && Background.prototype;
  if (!proto || proto[INSTALL_MARK]) return false;
  for (const key of ['_resolveTier', '_buildLayers', '_createPlanetBakeMaterial']) {
    if (typeof proto[key] !== 'function') throw new Error(`Deep field factory unavailable: ${key}`);
  }
  const resolveTier = proto._resolveTier;
  const buildLayers = proto._buildLayers;
  const createPlanetBakeMaterial = proto._createPlanetBakeMaterial;
  const stats = proto.stats;

  proto._resolveTier = function resolveDeepFieldTier() {
    const result = resolveTier.apply(this, arguments);
    // L0 contains a constant near-black floor plus <1-LSB dither, NOT authored nebula/star detail.
    // Its old 2048-square allocation and mip chain held essentially one color. L1/L2, stars,
    // flares, planet bake sizes, quality controls and authored structure remain untouched.
    this.bakeSizes.L0_void = DEEP_FIELD_VOID_SIZE;
    return result;
  };

  proto._buildLayers = function buildClipProofDeepField() {
    const result = buildLayers.apply(this, arguments);
    const material = this.layerMaterial;
    const mesh = this.layerMesh;
    if (!material || !mesh || !this.camera) throw new Error('Deep field layer contract unavailable');
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -1, -1, 0, 3, -1, 0, -1, 3, 0,
    ], 3));
    geometry.userData.deepFieldFullscreen = true;
    this.layerGeometry.dispose();
    this.layerGeometry = geometry;
    mesh.geometry = geometry;
    mesh.frustumCulled = false;
    material.vertexShader = DEEP_FIELD_VERTEX;
    material.fragmentShader = DEEP_FIELD_FRAGMENT;
    material.uniforms.uSkyProjectionInverse = { value: this.camera.projectionMatrixInverse };
    material.uniforms.uSkyCameraWorld = { value: this.camera.matrixWorld };
    material.name = 'SpaceFace_ClipProofDeepField';
    material.needsUpdate = true;
    // Retain opaque-first ordering and depth testing. The sky must never paint over ships/VFX.
    material.depthTest = true;
    material.depthWrite = false;
    if (this.renderer && this.group) rebuildDeepFieldStars(this);
    return result;
  };

  proto._createPlanetBakeMaterial = function createDeepFieldPlanetMaterial() {
    const material = createPlanetBakeMaterial.apply(this, arguments);
    // The old blue-grey night floor made unlit hemispheres look like lit, concave plastic.
    // Preserve surface art, rings, sunlit detail and resolution; let the silhouette own the shadow.
    material.fragmentShader = material.fragmentShader
      .replace('vec3 night = surf * 0.055 + vec3(0.014, 0.018, 0.030);',
        'vec3 night = surf * 0.016 + vec3(0.0006, 0.0008, 0.0012);')
      .replace('(0.22 + 0.78 * lit) * 1.25 * atmK', '(0.025 + 0.975 * lit) * 1.25 * atmK');
    return material;
  };

  if (typeof stats === 'function') {
    proto.stats = function deepFieldStats() {
      const base = stats.apply(this, arguments);
      return {
        ...base,
        drawCalls: base.drawCalls
          + (this.stellarFormation && this.stellarFormation.points.geometry.drawRange.count > 0 ? 1 : 0),
        stellarFormation: STELLAR_FORMATIONS[this.stellarFormation?.family]?.name || null,
        stellarFormationStars: this.stellarFormation?.activeStars || 0,
        stellarFormationBytes: this.stellarFormation?.attributeBytes || 0,
        stellarFormationRefills: this.stellarFormation?.refills || 0,
        deepFieldPresentation: 'clip-proof-fractured-v1',
        skyCarrierTriangles: 1,
        voidTextureBytes: rgbaMipBytes(DEEP_FIELD_VOID_SIZE),
        clearSectorTextureReads: 1,
      };
    };
  }
  Object.defineProperty(proto, INSTALL_MARK, { value: true });
  return true;
}
