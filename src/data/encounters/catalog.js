// Browser-safe encounter registry. Authored encounter modules are discovered by the Node index
// generator; runtime consumes the checked-in static import graph so browser, Electron, Node, and
// the release bundle all see the same synchronous catalogue.

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function defineEncounter(trigger, body = {}) {
  return deepFreeze({ ...trigger, ...body });
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
    const shape = module.default;
    const trigger = module.trigger;
    if (!shape || !trigger || typeof shape.id !== 'string' || shape.id !== trigger.id) {
      throw new Error('Encounter module must export matching trigger.id and default.id.');
    }
    if (ids.has(shape.id)) throw new Error(`Duplicate encounter id ${shape.id}.`);
    ids.add(shape.id);
    registry[shape.id] = shape;
  }
  return Object.freeze(registry);
}
