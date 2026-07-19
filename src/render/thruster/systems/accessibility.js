/**
 * Accessibility profile application — hot path mutates preallocated presentation.
 */

const ALL_ROLES = ['core', 'inner', 'sheath', 'vapor', 'distortion'];

/**
 * Precompile accessibility + quality data for a recipe (once at init).
 * @param {object} recipe
 * @returns {object} compiled tables (stable identity)
 */
export function compileAccessibilityTables(recipe) {
  const layers = recipe.layers || [];
  const layerByRole = Object.create(null);
  for (let i = 0; i < layers.length; i++) {
    layerByRole[layers[i].role] = layers[i];
  }
  const quality = recipe.quality || {};
  const tables = {
    layerByRole,
    highRoles: (quality.high?.layers || layers.filter((l) => l.enabled).map((l) => l.role)).slice(),
    mediumRoles: (quality.medium?.layers || []).slice(),
    lowRoles: (quality.low?.layers || []).slice(),
    reducedMotion: recipe.accessibility?.reducedMotion || null,
    reducedFlash: recipe.accessibility?.reducedFlash || null,
    lowQuality: recipe.accessibility?.lowQuality || null,
  };
  return tables;
}

/**
 * Create an empty presentation shell for reuse.
 */
export function createPresentationScratch(maxRoles = 8) {
  const roles = new Array(maxRoles);
  for (let i = 0; i < maxRoles; i++) roles[i] = '';
  return {
    roles,
    roleCount: 0,
    intensityScale: 1,
    eventLightScale: 1,
    flowSpeedScale: 1,
    softEdgeBoost: 0,
    tierKey: 'high',
    notesCount: 0,
  };
}

/**
 * Resolve presentation into preallocated `out`. No array/object allocation.
 * @param {object} recipe
 * @param {object} flags
 * @param {object} out presentation scratch
 * @param {object} [tables] from compileAccessibilityTables
 * @returns {object} out
 */
export function resolveAccessibilityPresentationInto(recipe, flags, out, tables) {
  const t = tables || compileAccessibilityTables(recipe);
  flags = flags || {};

  let tierKey = 'high';
  if (flags.lowQuality) tierKey = 'low';
  else if (flags.qualityTier === 'medium' || flags.qualityTier === 'low' || flags.qualityTier === 'high') {
    tierKey = flags.qualityTier;
  }

  let srcRoles;
  if (tierKey === 'low') srcRoles = t.lowRoles.length ? t.lowRoles : t.highRoles;
  else if (tierKey === 'medium') srcRoles = t.mediumRoles.length ? t.mediumRoles : t.highRoles;
  else srcRoles = t.highRoles;

  out.roleCount = 0;
  for (let i = 0; i < srcRoles.length && out.roleCount < out.roles.length; i++) {
    out.roles[out.roleCount++] = srcRoles[i];
  }

  out.intensityScale = 1;
  out.eventLightScale = 1;
  out.flowSpeedScale = 1;
  out.softEdgeBoost = 0;
  out.tierKey = tierKey;
  out.notesCount = 0;

  if (flags.reducedMotion && t.reducedMotion) {
    const p = t.reducedMotion;
    out.flowSpeedScale = p.flowSpeedScale ?? 0.12;
    out.softEdgeBoost += 0.06;
    if (Array.isArray(p.disableLayers)) {
      let w = 0;
      for (let i = 0; i < out.roleCount; i++) {
        const role = out.roles[i];
        let disabled = false;
        for (let d = 0; d < p.disableLayers.length; d++) {
          if (p.disableLayers[d] === role) {
            disabled = true;
            break;
          }
        }
        if (!disabled) out.roles[w++] = role;
      }
      out.roleCount = w;
    }
    // Force core
    let hasCore = false;
    for (let i = 0; i < out.roleCount; i++) if (out.roles[i] === 'core') hasCore = true;
    if (!hasCore && out.roleCount < out.roles.length) {
      for (let i = out.roleCount; i > 0; i--) out.roles[i] = out.roles[i - 1];
      out.roles[0] = 'core';
      out.roleCount += 1;
    }
    let hasSecondary = false;
    for (let i = 0; i < out.roleCount; i++) {
      if (out.roles[i] === 'sheath' || out.roles[i] === 'vapor' || out.roles[i] === 'inner') {
        hasSecondary = true;
        break;
      }
    }
    if (!hasSecondary) {
      if (t.layerByRole.sheath && out.roleCount < out.roles.length) out.roles[out.roleCount++] = 'sheath';
      else if (t.layerByRole.inner && out.roleCount < out.roles.length) out.roles[out.roleCount++] = 'inner';
    }
  }

  if (flags.reducedFlash && t.reducedFlash) {
    const p = t.reducedFlash;
    out.intensityScale *= p.intensityScale ?? 0.55;
    out.eventLightScale *= p.eventLightScale ?? 0.25;
    out.softEdgeBoost += 0.04;
  }

  if (flags.lowQuality && t.lowQuality) {
    const p = t.lowQuality;
    const maxLayers = p.maxLayers ?? 2;
    const prefer = Array.isArray(p.preferRoles) ? p.preferRoles : null;
    if (prefer && prefer.length) {
      // Rebuild from prefer then rest, cap maxLayers
      const tmp = out.roles;
      let count = 0;
      const used = Object.create(null);
      for (let i = 0; i < prefer.length && count < maxLayers; i++) {
        const role = prefer[i];
        if (t.layerByRole[role] || role === 'core') {
          tmp[count++] = role;
          used[role] = 1;
        }
      }
      for (let i = 0; i < out.roleCount && count < maxLayers; i++) {
        const role = out.roles[i];
        if (!used[role]) {
          tmp[count++] = role;
          used[role] = 1;
        }
      }
      out.roleCount = count;
    } else if (out.roleCount > maxLayers) {
      out.roleCount = maxLayers;
    }
    let hasCore = false;
    for (let i = 0; i < out.roleCount; i++) if (out.roles[i] === 'core') hasCore = true;
    if (!hasCore) {
      out.roles[0] = 'core';
      if (out.roleCount < 1) out.roleCount = 1;
    }
    out.softEdgeBoost += 0.05;
  }

  if (out.roleCount === 0) {
    out.roles[0] = 'core';
    out.roleCount = 1;
  }

  return out;
}

/**
 * Non-hot-path helper (allocates roles array). Systems use Into variant.
 */
export function resolveAccessibilityPresentation(recipe, flags = {}) {
  const out = createPresentationScratch(8);
  resolveAccessibilityPresentationInto(recipe, flags, out, compileAccessibilityTables(recipe));
  return {
    roles: out.roles.slice(0, out.roleCount),
    intensityScale: out.intensityScale,
    eventLightScale: out.eventLightScale,
    flowSpeedScale: out.flowSpeedScale,
    softEdgeBoost: out.softEdgeBoost,
    notes: [],
    tierKey: out.tierKey,
  };
}

export function assertAccessibilityInvariants(recipe) {
  const failures = [];
  for (const name of ['reducedMotion', 'reducedFlash', 'lowQuality']) {
    const p = recipe.accessibility?.[name];
    if (!p) {
      failures.push(`missing accessibility.${name}`);
      continue;
    }
    if (p.preserveSilhouette !== true) failures.push(`${name}.preserveSilhouette must be true`);
    if (p.preserveFeedback !== true) failures.push(`${name}.preserveFeedback must be true`);
  }

  const rm = resolveAccessibilityPresentation(recipe, { reducedMotion: true });
  if (!rm.roles.includes('core')) failures.push('reducedMotion dropped core');
  if (rm.roles.length < 1) failures.push('reducedMotion left zero layers');
  if (rm.flowSpeedScale <= 0 && recipe.kind === 'continuous_plume') {
    failures.push('reducedMotion zeroed flow without alternate feedback path');
  }

  const rf = resolveAccessibilityPresentation(recipe, { reducedFlash: true });
  if (rf.intensityScale <= 0.05) failures.push('reducedFlash erased intensity');
  if (!rf.roles.includes('core')) failures.push('reducedFlash dropped core');

  const lq = resolveAccessibilityPresentation(recipe, { lowQuality: true });
  if (!lq.roles.includes('core')) failures.push('lowQuality dropped core');
  if (lq.roles.length < 1) failures.push('lowQuality left zero layers');

  return { ok: failures.length === 0, failures };
}

export { ALL_ROLES };
