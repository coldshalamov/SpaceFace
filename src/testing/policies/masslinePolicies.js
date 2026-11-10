// Registered closed-loop policy IDs for the lab.
// Scenarios reference policies by stable id+version — never executable code in JSON.

import { makePdRadialController, makeDetunedController, BASELINE_CONTROLLER } from '../../../scripts/lib/masslineControlLab.mjs';

const POLICIES = new Map();

/**
 * @param {string} id
 * @param {number|string} version
 * @param {{ create: (params?: object) => function|null, description?: string }} def
 */
export function registerPolicy(id, version, def) {
  const key = `${id}@${version}`;
  POLICIES.set(key, {
    id,
    version,
    create: def.create,
    description: def.description || '',
  });
  return key;
}

export function resolvePolicy(id, version = 1, params = {}) {
  const key = `${id}@${version}`;
  const def = POLICIES.get(key);
  if (!def) {
    // Allow id without version pin if only one version exists.
    const fallback = [...POLICIES.values()].find((p) => p.id === id);
    if (!fallback) throw new Error(`unknown lab policy: ${id}@${version}`);
    return fallback.create(params || {});
  }
  return def.create(params || {});
}

export function listPolicies() {
  return [...POLICIES.values()].map((p) => ({ id: p.id, version: p.version, description: p.description }));
}

registerPolicy('massline.baseline', 1, {
  description: 'No lab controller injection (measures production tether behavior)',
  create() {
    return BASELINE_CONTROLLER;
  },
});

registerPolicy('massline.pdRadial', 1, {
  description: 'Reference orbit-radius PD controller (lab seam demonstration)',
  create(params) {
    return makePdRadialController(params || {});
  },
});

registerPolicy('massline.detuned', 1, {
  description: 'Anti-damping controller for failure-case discrimination',
  create(params) {
    return makeDetunedController(params || {});
  },
});

registerPolicy('none', 1, {
  description: 'Explicit no-policy',
  create() {
    return null;
  },
});
