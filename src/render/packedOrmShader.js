import { canonicalizeSurfaceProgramFamilyKey } from './illustratedSurface.js';
import { registerGeometryPreservingShaderHook } from './shaderPoseProvenance.js';

export function installSingleSamplePackedOrmShader(material) {
  if (!material || material.userData?.spacefacePackedOrmSingleSample === true) return material;
  const orm = material.roughnessMap;
  if (!sameTextureSamplingForPackedOrm(orm, material.metalnessMap)
      || !sameTextureSamplingForPackedOrm(orm, material.aoMap)) return material;

  const originalOnBeforeCompile = material.onBeforeCompile;
  const originalProgramCacheKey = material.customProgramCacheKey();
  material.onBeforeCompile = function packedOrmSingleSampleShader(shader, renderer) {
    if (typeof originalOnBeforeCompile === 'function') {
      originalOnBeforeCompile.call(this, shader, renderer);
    }
    const replacements = [
      [
        '#include <roughnessmap_fragment>',
        [
          'float roughnessFactor = roughness;',
          '#ifdef USE_ROUGHNESSMAP',
          '\tvec4 sfPackedOrmTexel = texture2D( roughnessMap, vRoughnessMapUv );',
          '\troughnessFactor *= sfPackedOrmTexel.g;',
          '#endif',
        ].join('\n'),
      ],
      [
        '#include <metalnessmap_fragment>',
        [
          'float metalnessFactor = metalness;',
          '#ifdef USE_METALNESSMAP',
          '\tmetalnessFactor *= sfPackedOrmTexel.b;',
          '#endif',
        ].join('\n'),
      ],
      [
        '#include <aomap_fragment>',
        [
          '#ifdef USE_AOMAP',
          '\tfloat ambientOcclusion = ( sfPackedOrmTexel.r - 1.0 ) * aoMapIntensity + 1.0;',
          '\treflectedLight.indirectDiffuse *= ambientOcclusion;',
          '\t#if defined( USE_CLEARCOAT )',
          '\t\tclearcoatSpecularIndirect *= ambientOcclusion;',
          '\t#endif',
          '\t#if defined( USE_SHEEN )',
          '\t\tsheenSpecularIndirect *= ambientOcclusion;',
          '\t#endif',
          '\t#if defined( USE_ENVMAP ) && defined( STANDARD )',
          '\t\tfloat dotNV = saturate( dot( geometryNormal, geometryViewDir ) );',
          '\t\treflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );',
          '\t#endif',
          '#endif',
        ].join('\n'),
      ],
    ];
    for (const [needle, replacement] of replacements) {
      if (!shader.fragmentShader.includes(needle)) {
        throw new Error(`[render] packed-ORM shader contract changed: missing ${needle}`);
      }
      shader.fragmentShader = shader.fragmentShader.replace(needle, replacement);
    }
  };
  registerGeometryPreservingShaderHook(material.onBeforeCompile, originalOnBeforeCompile);
  material.customProgramCacheKey = () => canonicalizeSurfaceProgramFamilyKey(
    originalProgramCacheKey,
    'spaceface-packed-orm-single-sample-v1',
  );
  material.userData = {
    ...(material.userData || {}),
    spacefacePackedOrmSingleSample: true,
    spacefacePackedOrmTextureSamples: 1,
  };
  material.needsUpdate = true;
  return material;
}

function sameTextureSamplingForPackedOrm(left, right) {
  if (!left || !right || (left.channel || 0) !== (right.channel || 0)) return false;
  const sameSource = left === right
    || (left.source && left.source === right.source)
    || (left.image && left.image === right.image);
  if (!sameSource || left.flipY !== right.flipY || left.wrapS !== right.wrapS || left.wrapT !== right.wrapT) {
    return false;
  }
  if (left.matrixAutoUpdate && typeof left.updateMatrix === 'function') left.updateMatrix();
  if (right.matrixAutoUpdate && typeof right.updateMatrix === 'function') right.updateMatrix();
  const leftMatrix = left.matrix?.elements || [];
  const rightMatrix = right.matrix?.elements || [];
  if (leftMatrix.length !== rightMatrix.length) return false;
  for (let i = 0; i < leftMatrix.length; i += 1) {
    if (Math.abs(leftMatrix[i] - rightMatrix[i]) > 1e-6) return false;
  }
  return true;
}


// Called while blueprint materials are still private and before their admission compile.
// Requiring one Texture object gives identical sampler state as well as UV transform and image.
export function installAuthoredPackedOrmOnPrimitives(primitives) {
  const seen = new Set();
  for (const primitive of primitives || []) {
    const list = Array.isArray(primitive.material) ? primitive.material : [primitive.material];
    for (const material of list) {
      if (!material || seen.has(material)) continue;
      seen.add(material);
      if ((!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial)
          || material.transparent || material.opacity < 1 || material.transmission > 0) continue;
      const orm = material.roughnessMap;
      if (!orm || material.metalnessMap !== orm || material.aoMap !== orm) continue;
      installSingleSamplePackedOrmShader(material);
    }
  }
}
