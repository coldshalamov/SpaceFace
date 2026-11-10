// Optional Ashline cold-surface factor ABI. Source meshes/materials remain untouched.
import * as THREE from 'three';
import { rigidOpaqueMaterialProgramKey } from './rigidOpaqueBatchPolicy.js';

const GROUP = /^LOD[012]_MOTION_HULL_CORE_(Armor|Hull|Mechanical|MechanicalDark)$/;
export function ashlineFactorGroup(source) {
  const name = GROUP.exec(source?.name || '');
  if (!name || source?.isMesh !== true) return null;
  const m = source.material, g = source.geometry;
  if (!m?.isMeshStandardMaterial || m.isMeshPhysicalMaterial || m.transparent || m.opacity !== 1
    || m.vertexColors || m.alphaTest || !m.color || !Number.isFinite(m.roughness)
    || !Number.isFinite(m.metalness) || ![m.color.r, m.color.g, m.color.b].every(Number.isFinite)
    || !g?.getAttribute?.('position')
    || g.getAttribute('sfFactorColor') || g.getAttribute('sfFactorRM')) return null;
  return name[1] === 'Armor' || name[1] === 'Hull' ? 'paint' : 'machinery';
}

export function ashlineFactorMaterialKey(material, source) {
  const group = ashlineFactorGroup(source);
  if (!group) return null;
  // Do not hide an unsupported source hook behind the facade's inherited properties.
  if (!rigidOpaqueMaterialProgramKey(material)) return null;
  // A read-only facade allows the existing conservative policy to compare every other shader,
  // texture, uniform, role and render-state field without mutating or cloning the live material.
  const facade = Object.create(material);
  facade.color = new THREE.Color(1, 1, 1);
  facade.roughness = 1;
  facade.metalness = 1;
  const key = rigidOpaqueMaterialProgramKey(facade);
  return key ? `ashline-factor-v1:${group}|${key}` : null;
}

export function makeAshlineFactorGeometry(source) {
  const geometry = source.geometry.clone();
  const count = geometry.getAttribute('position').count, m = source.material;
  const colors = new Float32Array(count * 3), factors = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = m.color.r; colors[i * 3 + 1] = m.color.g; colors[i * 3 + 2] = m.color.b;
    factors[i * 2] = m.roughness; factors[i * 2 + 1] = m.metalness;
  }
  geometry.setAttribute('sfFactorColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('sfFactorRM', new THREE.BufferAttribute(factors, 2));
  return geometry;
}

export function applyAshlineFactorShader(material) {
  const previous = material.onBeforeCompile, previousKey = material.customProgramCacheKey();
  material.color.setRGB(1, 1, 1); material.roughness = 1; material.metalness = 1;
  material.onBeforeCompile = function(shader, renderer) {
    previous?.call(this, shader, renderer);
    const checks = [shader.vertexShader?.includes('#include <common>'),
      shader.vertexShader?.includes('#include <begin_vertex>'),
      shader.fragmentShader?.includes('#include <common>'),
      shader.fragmentShader?.includes('#include <color_fragment>'),
      shader.fragmentShader?.includes('#include <roughnessmap_fragment>'),
      shader.fragmentShader?.includes('#include <metalnessmap_fragment>')];
    if (checks.some(x => !x)) throw new Error('Ashline factor shader ABI changed');
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 sfFactorColor; attribute vec2 sfFactorRM; varying vec3 vSfFactorColor; varying vec2 vSfFactorRM;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSfFactorColor = sfFactorColor; vSfFactorRM = sfFactorRM;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vSfFactorColor; varying vec2 vSfFactorRM;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vSfFactorColor;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= vSfFactorRM.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= vSfFactorRM.y;');
  };
  material.customProgramCacheKey = () => `${previousKey}|ashline-factor-v1`;
  material.needsUpdate = true;
  return material;
}
