const DIRECT_PHYSICAL_SIGNATURE = 'void RE_Direct_Physical(';
const DIRECT_PHYSICAL_FIRST_STATEMENT = '\n\tfloat dotNL = saturate( dot( geometryNormal, directLight.direction ) );';
const ZERO_RADIANCE_GUARD_LINE = '\n\tif (all(equal(directLight.color, vec3(0.0)))) return;';
const GUARDED_DIRECT_PHYSICAL_PREFIX = `${ZERO_RADIANCE_GUARD_LINE}${DIRECT_PHYSICAL_FIRST_STATEMENT}`;

function occurrenceCount(source, needle) {
  let count = 0;
  let offset = 0;
  while (true) {
    const index = source.indexOf(needle, offset);
    if (index < 0) return count;
    count += 1;
    offset = index + needle.length;
  }
}

function shaderChunkFrom(target) {
  const shaderChunk = target?.ShaderChunk || target;
  if (!shaderChunk || typeof shaderChunk.lights_physical_pars_fragment !== 'string') {
    throw new TypeError('Three ShaderChunk.lights_physical_pars_fragment is unavailable');
  }
  return shaderChunk;
}

/**
 * Install the exact-zero direct-light fast path into the resolved Three shader chunk.
 *
 * The caller supplies its resolved Three namespace (or a ShaderChunk-shaped object), so the
 * same installer works for the dev import map's vendor module and the retail bundle's npm Three.
 * The source prefix is version-pinned deliberately: an unrecognized upstream body must fail
 * loudly instead of receiving a blind string replacement.
 */
export function installPbrZeroRadianceGuard(target) {
  const shaderChunk = shaderChunkFrom(target);
  const source = shaderChunk.lights_physical_pars_fragment;
  if (occurrenceCount(source, DIRECT_PHYSICAL_SIGNATURE) !== 1) {
    throw new Error('Expected exactly one RE_Direct_Physical shader function anchor');
  }

  const functionStart = source.indexOf(DIRECT_PHYSICAL_SIGNATURE);
  const bodyStart = source.indexOf('{', functionStart);
  if (bodyStart < 0) throw new Error('RE_Direct_Physical shader function body is unavailable');
  const firstStatementStart = bodyStart + 1;
  const bodyPrefix = source.slice(firstStatementStart);

  if (bodyPrefix.startsWith(GUARDED_DIRECT_PHYSICAL_PREFIX)) {
    return Object.freeze({ changed: false });
  }
  if (!bodyPrefix.startsWith(DIRECT_PHYSICAL_FIRST_STATEMENT)) {
    throw new Error('Unrecognized RE_Direct_Physical shader body; refusing blind replacement');
  }

  shaderChunk.lights_physical_pars_fragment = source.slice(0, firstStatementStart)
    + GUARDED_DIRECT_PHYSICAL_PREFIX
    + source.slice(firstStatementStart + DIRECT_PHYSICAL_FIRST_STATEMENT.length);
  return Object.freeze({ changed: true });
}

export const PBR_ZERO_RADIANCE_GUARD = 'if (all(equal(directLight.color, vec3(0.0)))) return;';
