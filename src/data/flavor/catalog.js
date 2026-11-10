// Browser-safe flavor registry. Node discovers authored modules and writes the static import
// graph; browser, Electron, tests, and the release bundle consume the same frozen catalogue.

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function defineFlavorPack({ id, kind, entries, description = '', schemaVersion = 1 }) {
  if (!id || !kind || !Array.isArray(entries) || entries.length === 0) {
    throw new Error('Flavor packs require id, kind, and entries.');
  }
  return deepFreeze({ schemaVersion, id, kind, description, entries });
}

export function buildFlavorCatalog(records) {
  const sorted = [...records].sort((a, b) => namespaceOf(a).flavorOrder - namespaceOf(b).flavorOrder);
  const orders = new Set();
  const ids = new Set();
  const registry = {};
  for (const record of sorted) {
    const module = namespaceOf(record);
    if (!Number.isInteger(module.flavorOrder) || module.flavorOrder <= 0) {
      throw new Error('Flavor module order must be a positive integer.');
    }
    if (orders.has(module.flavorOrder)) throw new Error(`Duplicate flavor order ${module.flavorOrder}.`);
    orders.add(module.flavorOrder);
    const pack = module.default;
    if (!pack || pack.id !== module.flavorId || pack.kind !== module.flavorKind) {
      throw new Error('Flavor modules must export flavorId/flavorKind matching their default pack.');
    }
    if (ids.has(pack.id)) throw new Error(`Duplicate flavor pack id ${pack.id}.`);
    ids.add(pack.id);
    validateCopyShape(pack, record.sourceFile || `${pack.id}.js`);
    registry[pack.id] = pack;
  }
  return deepFreeze(registry);
}

export function collectFlavorTextEntries(records) {
  const entries = [];
  for (const record of records || []) {
    const pack = namespaceOf(record).default;
    collectText(pack, [record.sourceFile || `${pack.id}.js`], entries);
  }
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.key)) throw new Error(`Duplicate flavor text key ${entry.key}.`);
    seen.add(entry.key);
  }
  return deepFreeze(entries);
}

export function buildFlavorSourceIndex(packs) {
  const index = {};
  for (const pack of Object.values(packs || {})) collectSources(pack, index, pack.id, {});
  return deepFreeze(index);
}

function collectText(node, path, output) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.text === 'string') {
    output.push(deepFreeze({
      key: `src/data/flavor/${path[0]}#${path.slice(1).join('/') || 'root'}`,
      id: typeof node.id === 'string' ? node.id : path.at(-1),
      kind: 'flavor',
      text: node.text,
    }));
  }
  for (const [key, child] of Object.entries(node)) {
    if (key === 'text') continue;
    if (Array.isArray(child)) {
      child.forEach((value, index) => collectText(value, [...path, key, stableSegment(value, index)], output));
    } else if (child && typeof child === 'object') {
      collectText(child, [...path, key, stableSegment(child, key)], output);
    }
  }
}

function collectSources(node, output, packId, context) {
  if (!node || typeof node !== 'object') return;
  const nextContext = {
    ...context,
    ...(typeof node.programSlot === 'string' ? { programSlot: node.programSlot } : {}),
    ...(typeof node.wreckId === 'string' ? { wreckId: node.wreckId } : {}),
  };
  if (typeof node.sourceRef === 'string' && node.sourceRef) {
    if (output[node.sourceRef]) throw new Error(`Duplicate flavor source ref ${node.sourceRef}.`);
    output[node.sourceRef] = deepFreeze({ ...nextContext, ...node, packId });
  }
  for (const child of Object.values(node)) {
    if (Array.isArray(child)) child.forEach((value) => collectSources(value, output, packId, nextContext));
    else if (child && typeof child === 'object') collectSources(child, output, packId, nextContext);
  }
}

function validateCopyShape(pack, sourceFile) {
  const textIds = new Set();
  visit(pack, []);

  function visit(node, path) {
    if (!node || typeof node !== 'object') return;
    if (Object.hasOwn(node, 'text')) {
      if (typeof node.id !== 'string' || !node.id || typeof node.text !== 'string' || !node.text.trim()) {
        throw new Error(`${sourceFile} copy at ${path.join('.') || '<root>'} requires id and text.`);
      }
      if (textIds.has(node.id)) throw new Error(`${sourceFile} duplicates copy id ${node.id}.`);
      textIds.add(node.id);
    }
    for (const [key, child] of Object.entries(node)) {
      if (['lines', 'fragments', 'ticker'].includes(key) && Array.isArray(child)) {
        for (const value of child) {
          if (!value || typeof value !== 'object' || typeof value.id !== 'string' || typeof value.text !== 'string') {
            throw new Error(`${sourceFile} ${key} arrays require { id, text } copy records.`);
          }
        }
      }
      if (Array.isArray(child)) child.forEach((value, index) => visit(value, [...path, key, index]));
      else if (child && typeof child === 'object') visit(child, [...path, key]);
    }
  }
}

function namespaceOf(record) {
  return record && record.namespace ? record.namespace : record;
}

function stableSegment(value, fallback) {
  return value && typeof value.id === 'string' && value.id ? value.id : String(fallback);
}
