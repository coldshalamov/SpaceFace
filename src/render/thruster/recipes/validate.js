/**
 * Recipe validation — pure JS, no Three.js dependency.
 */
import {
  RECIPE_SCHEMA_VERSION,
  RECIPE_KINDS,
  LAYER_ROLES,
  QUALITY_TIERS,
  REQUIRED_TOP_LEVEL,
} from './schema.js';

/**
 * @typedef {object} ValidationIssue
 * @property {'error'|'warning'} severity
 * @property {string} path
 * @property {string} message
 */

/**
 * @param {unknown} recipe
 * @returns {{ ok: boolean, errors: ValidationIssue[], warnings: ValidationIssue[], recipe: object|null }}
 */
export function validateRecipe(recipe) {
  /** @type {ValidationIssue[]} */
  const errors = [];
  /** @type {ValidationIssue[]} */
  const warnings = [];

  const err = (path, message) => errors.push({ severity: 'error', path, message });
  const warn = (path, message) => warnings.push({ severity: 'warning', path, message });

  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) {
    return { ok: false, errors: [{ severity: 'error', path: '', message: 'recipe must be a plain object' }], warnings, recipe: null };
  }

  const r = /** @type {Record<string, any>} */ (recipe);

  for (const key of REQUIRED_TOP_LEVEL) {
    if (r[key] === undefined || r[key] === null) err(key, `missing required field "${key}"`);
  }
  if (errors.length) return { ok: false, errors, warnings, recipe: null };

  if (r.schemaVersion !== RECIPE_SCHEMA_VERSION) {
    err('schemaVersion', `expected ${RECIPE_SCHEMA_VERSION}, got ${r.schemaVersion}`);
  }
  if (typeof r.id !== 'string' || !r.id.trim()) err('id', 'id must be a non-empty string');
  if (!RECIPE_KINDS.includes(r.kind)) err('kind', `kind must be one of ${RECIPE_KINDS.join(', ')}`);
  if (typeof r.engineFamily !== 'string' || !r.engineFamily.trim()) {
    err('engineFamily', 'engineFamily must be a non-empty string');
  }

  // Geometry
  const g = r.geometry;
  if (!g || typeof g !== 'object') {
    err('geometry', 'geometry object required');
  } else {
    if (!['localNegX', 'localNegZ', 'socketForward'].includes(g.axis)) {
      err('geometry.axis', 'invalid axis');
    }
    if (!isNum(g.baseLength, 0.05, 40)) err('geometry.baseLength', 'baseLength out of range');
    if (!isNum(g.baseWidth, 0.02, 12)) err('geometry.baseWidth', 'baseWidth out of range');
    if (!isInt(g.segmentCount, 1, 64)) err('geometry.segmentCount', 'segmentCount must be integer 1..64');
    if (!['stream', 'jet', 'puff'].includes(g.aspect)) err('geometry.aspect', 'invalid aspect');
    // Rejection guard: continuous plume must not be a short puff cone substitute
    if (r.kind === 'continuous_plume' && g.aspect === 'puff') {
      err('geometry.aspect', 'continuous_plume cannot use puff aspect (reads as flash/balls)');
    }
    if (r.kind === 'impulse_burst' && g.aspect === 'stream' && g.baseLength > g.baseWidth * 6) {
      warn('geometry', 'impulse_burst with stream-like aspect risks reading as miniature main engine');
    }
  }

  // Layers
  if (!Array.isArray(r.layers) || r.layers.length < 2) {
    err('layers', 'at least two layers required (core + sheath/vapor separation)');
  } else {
    const roles = new Set();
    for (let i = 0; i < r.layers.length; i++) {
      const L = r.layers[i];
      const p = `layers[${i}]`;
      if (!L || typeof L !== 'object') {
        err(p, 'layer must be object');
        continue;
      }
      if (!LAYER_ROLES.includes(L.role)) err(`${p}.role`, `role must be one of ${LAYER_ROLES.join(', ')}`);
      if (roles.has(L.role) && L.role !== 'vapor') {
        warn(`${p}.role`, `duplicate role ${L.role}`);
      }
      roles.add(L.role);
      if (typeof L.enabled !== 'boolean') err(`${p}.enabled`, 'enabled must be boolean');
      if (!L.texture || typeof L.texture !== 'object') {
        err(`${p}.texture`, 'texture descriptor required');
      } else {
        if (typeof L.texture.id !== 'string' || !L.texture.id) err(`${p}.texture.id`, 'texture.id required');
        if (!['flow', 'flipbook', 'soft_radial', 'noise'].includes(L.texture.mode)) {
          err(`${p}.texture.mode`, 'invalid texture mode');
        }
        if (L.texture.mode === 'flipbook') {
          if (!isInt(L.texture.cols, 1, 16) || !isInt(L.texture.rows, 1, 16)) {
            err(`${p}.texture`, 'flipbook requires cols/rows integers');
          }
          if (!isNum(L.texture.fps, 1, 60)) err(`${p}.texture.fps`, 'fps must be 1..60');
        }
      }
      if (!['additive', 'alpha', 'multiply'].includes(L.blend)) err(`${p}.blend`, 'invalid blend');
      if (!isNum(L.softEdge, 0.02, 0.95)) err(`${p}.softEdge`, 'softEdge must be 0.02..0.95 (hides card edges)');
      if (!isNum(L.intensity, 0, 40)) err(`${p}.intensity`, 'intensity out of range');
      if (!isNum(L.opacity, 0, 1)) err(`${p}.opacity`, 'opacity must be 0..1');
      if (L.colorHex != null && !/^#[0-9a-fA-F]{6}$/.test(L.colorHex)) {
        err(`${p}.colorHex`, 'colorHex must be #RRGGBB');
      }
      if (L.role === 'core' && L.softEdge < 0.08) {
        warn(`${p}.softEdge`, 'very hard core edge risks harsh silhouette');
      }
      if (L.role === 'distortion' && L.blend !== 'alpha') {
        warn(`${p}.blend`, 'distortion layer usually uses alpha/interface pass');
      }
    }
    if (!roles.has('core')) err('layers', 'core layer required for engine identity');
    if (!roles.has('sheath') && !roles.has('vapor')) {
      err('layers', 'sheath or vapor layer required (outer dissipation)');
    }
    if (r.kind === 'continuous_plume' && !roles.has('inner') && !roles.has('sheath')) {
      warn('layers', 'continuous plume without inner+sheath may read flat');
    }
  }

  // Throttle continuous response
  const th = r.throttle;
  if (!th || typeof th !== 'object') {
    err('throttle', 'throttle object required');
  } else {
    for (const key of ['length', 'width', 'turbulence', 'coreSheathBalance', 'dissipation', 'flowSpeed']) {
      validateCurve(th[key], `throttle.${key}`, err);
    }
    if (!isNum(th.idle, 0, 0.35)) err('throttle.idle', 'idle must be 0..0.35 (visible idle glow without full thrust)');
    if (r.kind === 'continuous_plume') {
      // Must vary all critical dimensions with throttle
      for (const key of ['length', 'width', 'turbulence', 'coreSheathBalance', 'dissipation']) {
        const c = th[key];
        if (c && Math.abs((c.at1 ?? 1) - (c.at0 ?? 0)) < 0.05) {
          err(`throttle.${key}`, 'continuous plume must respond continuously (at0 and at1 too similar)');
        }
      }
    }
  }

  // Timing
  const t = r.timing;
  if (!t || typeof t !== 'object') {
    err('timing', 'timing object required');
  } else {
    if (!isNum(t.attack, 0, 2)) err('timing.attack', 'attack out of range');
    if (!isNum(t.sustain, 0, 10)) err('timing.sustain', 'sustain out of range');
    if (!isNum(t.release, 0, 4)) err('timing.release', 'release out of range');
    if (r.kind === 'impulse_burst') {
      const total = (t.attack || 0) + (t.sustain || 0) + (t.release || 0);
      if (total > 0.55) err('timing', 'impulse_burst total envelope must be ≤ 0.55s (short directional pulse)');
      if (t.sustain > 0.18) err('timing.sustain', 'impulse sustain too long — risks main-engine read');
      if (t.attack < 0.01) warn('timing.attack', 'near-zero attack may read as generic flash');
    }
    if (r.kind === 'continuous_plume' && t.sustain < 1) {
      warn('timing.sustain', 'continuous plume typically has long/infinite sustain while throttled');
    }
  }

  // Event light (bounded)
  const el = r.eventLight;
  if (!el || typeof el !== 'object') {
    err('eventLight', 'eventLight object required');
  } else {
    if (typeof el.enabled !== 'boolean') err('eventLight.enabled', 'must be boolean');
    if (!isNum(el.maxIntensity, 0, 8)) err('eventLight.maxIntensity', 'must be 0..8 (bounded contribution)');
    if (!isNum(el.maxRange, 0, 40)) err('eventLight.maxRange', 'must be 0..40');
    if (el.color != null && !/^#[0-9a-fA-F]{6}$/.test(el.color)) err('eventLight.color', 'must be #RRGGBB');
    if (el.maxIntensity > 5) warn('eventLight.maxIntensity', 'high event light may dominate bloom read');
  }

  // Accessibility
  const a = r.accessibility;
  if (!a || typeof a !== 'object') {
    err('accessibility', 'accessibility object required');
  } else {
    for (const profile of ['reducedMotion', 'reducedFlash', 'lowQuality']) {
      const p = a[profile];
      if (!p || typeof p !== 'object') {
        err(`accessibility.${profile}`, 'profile object required');
        continue;
      }
      if (typeof p.preserveSilhouette !== 'boolean' || p.preserveSilhouette !== true) {
        err(`accessibility.${profile}.preserveSilhouette`, 'must be true — reduced modes must keep engine identity');
      }
      if (typeof p.preserveFeedback !== 'boolean' || p.preserveFeedback !== true) {
        err(`accessibility.${profile}.preserveFeedback`, 'must be true — must not disable all useful feedback');
      }
      if (profile === 'reducedMotion') {
        if (!isNum(p.flowSpeedScale, 0, 0.35)) {
          err(`accessibility.${profile}.flowSpeedScale`, 'must be 0..0.35 (slow, not off)');
        }
        if (p.disableLayers && Array.isArray(p.disableLayers) && p.disableLayers.includes('core')) {
          err(`accessibility.${profile}.disableLayers`, 'cannot disable core layer');
        }
        validateRoleMap(p.roleLengthScale, `accessibility.${profile}.roleLengthScale`, 0.4, 1.5, err);
        validateRoleMap(p.roleWidthScale, `accessibility.${profile}.roleWidthScale`, 0.4, 1.6, err);
        validateRoleMap(p.roleIntensityGain, `accessibility.${profile}.roleIntensityGain`, 0.5, 1.5, err);
        validateRoleMap(p.roleOpacityGain, `accessibility.${profile}.roleOpacityGain`, 0.5, 1.5, err);
      }
      if (profile === 'reducedFlash') {
        if (!isNum(p.intensityScale, 0.15, 0.85)) {
          err(`accessibility.${profile}.intensityScale`, 'must damp flash without erasing (0.15..0.85)');
        }
        if (!isNum(p.eventLightScale, 0, 0.5)) {
          err(`accessibility.${profile}.eventLightScale`, 'must be 0..0.5');
        }
        validateRoleMap(p.roleIntensityGain, `accessibility.${profile}.roleIntensityGain`, 0.5, 1.5, err);
      }
      if (profile === 'lowQuality') {
        if (!isInt(p.maxLayers, 1, 4)) err(`accessibility.${profile}.maxLayers`, 'maxLayers 1..4');
        if (p.maxLayers < 2) warn(`accessibility.${profile}.maxLayers`, 'single layer risks identity loss');
      }
    }
  }

  // Quality tiers
  const q = r.quality;
  if (!q || typeof q !== 'object') {
    err('quality', 'quality object required');
  } else {
    for (const tier of QUALITY_TIERS) {
      if (!q[tier] || typeof q[tier] !== 'object') err(`quality.${tier}`, 'tier config required');
      else {
        if (!isInt(q[tier].segments, 1, 64)) err(`quality.${tier}.segments`, 'segments integer required');
        if (!Array.isArray(q[tier].layers)) err(`quality.${tier}.layers`, 'layers role list required');
      }
    }
  }

  // Identity (must not be tint-only)
  const idn = r.identity;
  if (!idn || typeof idn !== 'object') {
    err('identity', 'identity object required');
  } else {
    for (const key of ['flowCharacter', 'geometryCharacter', 'timingCharacter', 'layeringCharacter']) {
      if (!idn[key] || typeof idn[key] !== 'object') {
        err(`identity.${key}`, 'required for non-tint engine identity');
      }
    }
    if (idn.flowCharacter) {
      if (!isNum(idn.flowCharacter.swirl, 0, 2)) err('identity.flowCharacter.swirl', '0..2');
      if (!isNum(idn.flowCharacter.fork, 0, 2)) err('identity.flowCharacter.fork', '0..2');
      if (!isNum(idn.flowCharacter.noiseScale, 0.2, 5)) err('identity.flowCharacter.noiseScale', '0.2..5');
      if (!isNum(idn.flowCharacter.baseFlow, 0.2, 8)) err('identity.flowCharacter.baseFlow', '0.2..8');
    }
    if (idn.layeringCharacter) {
      validateRoleMap(idn.layeringCharacter.boostLengthGain, 'identity.layeringCharacter.boostLengthGain', 0, 2, err);
      validateRoleMap(idn.layeringCharacter.boostWidthGain, 'identity.layeringCharacter.boostWidthGain', 0, 2, err);
      if (idn.layeringCharacter.boostStructuralDrive != null
        && !isNum(idn.layeringCharacter.boostStructuralDrive, 0, 0.5)) {
        err('identity.layeringCharacter.boostStructuralDrive', 'must be 0..0.5');
      }
    }
  }

  // Kind-specific structural distinction
  if (r.kind === 'impulse_burst') {
    if (g && g.baseLength >= (g.baseWidth || 1) * 4.5) {
      err('geometry', 'RCS impulse must be short directional jet, not elongated main-engine stream');
    }
    if (th && th.idle > 0.05) {
      err('throttle.idle', 'impulse recipes should not hold continuous idle plume');
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    recipe: errors.length === 0 ? r : null,
  };
}

/**
 * Parse JSON text and validate.
 * @param {string} jsonText
 */
export function parseAndValidateRecipe(jsonText) {
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch (e) {
    return {
      ok: false,
      errors: [{ severity: 'error', path: '', message: `JSON parse error: ${e.message}` }],
      warnings: [],
      recipe: null,
    };
  }
  return validateRecipe(data);
}

function isNum(v, min, max) {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
}

function isInt(v, min, max) {
  return Number.isInteger(v) && v >= min && v <= max;
}

function validateRoleMap(map, path, min, max, err) {
  if (map == null) return;
  if (typeof map !== 'object' || Array.isArray(map)) {
    err(path, 'must be an object keyed by layer role');
    return;
  }
  for (const [role, value] of Object.entries(map)) {
    if (!LAYER_ROLES.includes(role)) err(`${path}.${role}`, 'unknown layer role');
    else if (!isNum(value, min, max)) err(`${path}.${role}`, `must be finite ${min}..${max}`);
  }
}

function validateCurve(curve, path, err) {
  if (!curve || typeof curve !== 'object') {
    err(path, 'curve object required { at0, at1, exp? }');
    return;
  }
  if (!isNum(curve.at0, 0, 8)) err(`${path}.at0`, 'at0 must be finite 0..8');
  if (!isNum(curve.at1, 0, 8)) err(`${path}.at1`, 'at1 must be finite 0..8');
  if (curve.exp != null && !isNum(curve.exp, 0.2, 4)) err(`${path}.exp`, 'exp must be 0.2..4');
}

/**
 * Sample a throttle response curve at t in [0,1] (and beyond for turbo).
 * @param {{ at0: number, at1: number, exp?: number }} curve
 * @param {number} throttle 0..1+
 */
export function sampleCurve(curve, throttle) {
  const t = Math.max(0, throttle);
  const exp = curve.exp ?? 1;
  const u = Math.min(1.5, t); // allow slight overdrive
  const shaped = Math.pow(Math.min(1, u), exp);
  const base = curve.at0 + (curve.at1 - curve.at0) * shaped;
  if (u > 1) {
    // turbo extension: continue slope gently
    return base + (curve.at1 - curve.at0) * (u - 1) * 0.45;
  }
  return base;
}
