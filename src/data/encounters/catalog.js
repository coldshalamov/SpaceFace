// Browser-safe encounter registry. Authored encounter modules are discovered by the Node index
// generator; runtime consumes the checked-in static import graph so browser, Electron, Node, and
// the release bundle all see the same synchronous catalogue.

import {
  validateEncounterShape,
  SITUATION_VOCABULARY,
  PLACE_VOCABULARY,
  TWIST_VOCABULARY,
  ACTOR_VOCABULARY,
} from './shape.js';

export {
  validateEncounterShape,
  SITUATION_VOCABULARY,
  PLACE_VOCABULARY,
  TWIST_VOCABULARY,
  ACTOR_VOCABULARY,
};

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function defineEncounter(trigger, body = {}) {
  const encounter = { ...trigger, ...body };
  validateEncounterShape(encounter.shape, trigger?.id || body?.id || 'unknown');
  return deepFreeze(encounter);
}

export function buildEncounterCatalog(modules) {
  const sorted = [...modules].sort((a, b) => a.encounterOrder - b.encounterOrder);
  const orders = new Set();
  const ids = new Set();
  const registry = {};
  for (const module of sorted) {
    if (!Number.isInteger(module.encounterOrder) || module.encounterOrder <= 0) {
      throw new Error('Encounter module order must be a positive integer.');
    }
    if (orders.has(module.encounterOrder)) throw new Error(`Duplicate encounter order ${module.encounterOrder}.`);
    orders.add(module.encounterOrder);
    const encounter = module.default;
    const trigger = module.trigger;
    if (!encounter || !trigger || typeof encounter.id !== 'string' || encounter.id !== trigger.id) {
      throw new Error('Encounter module must export matching trigger.id and default.id.');
    }
    if (ids.has(encounter.id)) throw new Error(`Duplicate encounter id ${encounter.id}.`);
    ids.add(encounter.id);
    validateEncounterShape(encounter.shape, encounter.id);
    registry[encounter.id] = encounter;
  }
  return Object.freeze(registry);
}
