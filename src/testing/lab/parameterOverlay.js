// Registered parameter overlays for lab sweeps (§18).
// Unknown paths are rejected. Values appear in the reproducibility key and result artifact.

export const PARAMETER_OVERLAY_SCHEMA = 'spaceface.labParameterOverlay.v1';

/** Registered tunable paths → apply + read helpers. */
const REGISTRY = new Map();

/**
 * @param {string} path
 * @param {{
 *   schema?: string,
 *   version?: number|string,
 *   apply: (state: object, value: unknown, ctx?: object) => void,
 *   read?: (state: object) => unknown,
 *   validate?: (value: unknown) => boolean,
 * }} def
 */
export function registerParameter(path, def) {
  if (!path || typeof path !== 'string') throw new Error('parameter path required');
  if (!def || typeof def.apply !== 'function') throw new Error(`parameter ${path}: apply required`);
  REGISTRY.set(path, {
    path,
    schema: def.schema || PARAMETER_OVERLAY_SCHEMA,
    version: def.version ?? 1,
    apply: def.apply,
    read: def.read || null,
    validate: def.validate || ((v) => v !== undefined),
  });
}

export function getRegisteredParameter(path) {
  return REGISTRY.get(path) || null;
}

export function listRegisteredParameters() {
  return [...REGISTRY.keys()].sort();
}

/**
 * Validate overlay values against the registry (no application).
 * @param {{ schema?: string, version?: number|string, values?: Record<string, unknown> }|null} overlay
 */
export function validateParameterOverlay(overlay) {
  if (overlay == null) return { ok: true, issues: [] };
  const issues = [];
  if (typeof overlay !== 'object' || Array.isArray(overlay)) {
    return { ok: false, issues: [{ path: '$', message: 'overlay must be an object' }] };
  }
  const values = overlay.values || {};
  if (typeof values !== 'object' || Array.isArray(values)) {
    issues.push({ path: '$.values', message: 'values must be an object' });
    return { ok: false, issues };
  }
  for (const [path, value] of Object.entries(values)) {
    const def = REGISTRY.get(path);
    if (!def) {
      issues.push({ path: `$.values.${path}`, message: `unknown parameter path: ${path}` });
      continue;
    }
    if (!def.validate(value)) {
      issues.push({ path: `$.values.${path}`, message: `invalid value for ${path}` });
    }
  }
  return { ok: issues.length === 0, issues };
}

/**
 * Apply a validated overlay to state (and optional ctx for lab-owned tunables).
 * @returns {{ applied: Record<string, unknown>, rejected: string[] }}
 */
export function applyParameterOverlay(state, overlay, ctx = {}) {
  const applied = {};
  const rejected = [];
  if (!overlay || !overlay.values) return { applied, rejected };
  for (const [path, value] of Object.entries(overlay.values)) {
    const def = REGISTRY.get(path);
    if (!def) {
      rejected.push(path);
      continue;
    }
    if (!def.validate(value)) {
      rejected.push(path);
      continue;
    }
    def.apply(state, value, ctx);
    applied[path] = value;
  }
  return { applied, rejected };
}

export function overlayReproKey(overlay) {
  if (!overlay || !overlay.values) return null;
  const paths = Object.keys(overlay.values).sort();
  const ordered = {};
  for (const p of paths) ordered[p] = overlay.values[p];
  return {
    schema: overlay.schema || PARAMETER_OVERLAY_SCHEMA,
    version: overlay.version ?? 1,
    values: ordered,
  };
}

// ── Built-in registered paths ────────────────────────────────────────────────

registerParameter('gameplay.orbitAssistStrength', {
  version: 1,
  validate: (v) => typeof v === 'string' || v === null,
  apply(state, value) {
    if (!state.settings) state.settings = {};
    if (!state.settings.gameplay) state.settings.gameplay = {};
    state.settings.gameplay.orbitAssistStrength = value;
  },
  read(state) {
    return state.settings && state.settings.gameplay && state.settings.gameplay.orbitAssistStrength;
  },
});

registerParameter('lab.entrySpeed', {
  version: 1,
  validate: (v) => typeof v === 'number' && Number.isFinite(v),
  apply(_state, value, ctx) {
    if (ctx && ctx.params) ctx.params.entrySpeed = value;
  },
});

registerParameter('lab.lineLength', {
  version: 1,
  validate: (v) => typeof v === 'number' && Number.isFinite(v) && v > 0,
  apply(_state, value, ctx) {
    if (ctx && ctx.params) ctx.params.lineLength = value;
  },
});

registerParameter('lab.anchorMass', {
  version: 1,
  validate: (v) => typeof v === 'number' && Number.isFinite(v) && v > 0,
  apply(_state, value, ctx) {
    if (ctx && ctx.params) ctx.params.anchorMass = value;
  },
});

registerParameter('lab.maxImpulse', {
  version: 1,
  validate: (v) => typeof v === 'number' && Number.isFinite(v) && v > 0,
  apply(_state, value, ctx) {
    if (ctx && ctx.params) ctx.params.maxImpulse = value;
  },
});
