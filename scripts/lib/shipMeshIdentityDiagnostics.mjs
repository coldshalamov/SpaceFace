// Observer-only evidence. Kept self-contained so the exact implementation can be serialized
// alongside the browser sampler without a window hook, fetch, or production module import.
export function createShipMeshIdentityObserver() {
  const roots = new WeakMap();
  const MAX_NODES = 256;
  const MAX_CHANGES = 16;
  const text = value => typeof value === 'string' ? value.slice(0, 180) : null;
  return function observe(root, count, context = {}) {
    if (!root || typeof root.traverse !== 'function') return null;
    const scalar = value => typeof value === 'number' && Number.isFinite(value) ? value : text(value);
    const entityId = scalar(context.entityId);
    const generation = scalar(context.generation);
    const lodLevel = text(context.lodLevel);
    const key = JSON.stringify([entityId, generation, lodLevel]);
    const signal = JSON.stringify([text(context.compositionId), text(context.authoredState),
      typeof context.slotsKey === 'string' ? context.slotsKey.slice(0, 4096) : null]);
    const prior = roots.get(root);
    if (prior && prior.key === key && prior.signal === signal && prior.count === count) return prior.change;
    const rows = new Map();
    let seen = 0;
    let missingIdentity = 0;
    let collectionError = null;
    try { root.traverse(object => {
      if (!object?.isMesh) return;
      seen++;
      if (rows.size >= MAX_NODES) return;
      const uuid = text(object.uuid);
      if (!uuid || rows.has(uuid)) { missingIdentity++; return; }
      const data = object.userData || {};
      rows.set(uuid, {
        uuid, name: text(object.name), parentName: text(object.parent?.name),
        geometryUuid: text(object.geometry?.uuid),
        partUrl: text(data.spacefacePartUrl),
        damageRole: text(data.damageRole || data.spacefaceTags?.damageRole),
        instanceProxy: data.spacefaceInstanceProxy === true,
        visible: object.visible !== false,
      });
    }); } catch (error) { collectionError = text(error?.message) || 'mesh identity collection failed'; }
    const snapshot = { key, signal, count, rows, truncated: seen > MAX_NODES || missingIdentity > 0 || collectionError != null || seen !== count, change: null };
    if (prior && prior.key === key && (prior.count !== count || prior.signal !== signal)) {
      const added = [], removed = [];
      let addedCount = 0, removedCount = 0;
      for (const [id, row] of rows) if (!prior.rows.has(id)) {
        addedCount++; if (added.length < MAX_CHANGES) added.push(row);
      }
      for (const [id, row] of prior.rows) if (!rows.has(id)) {
        removedCount++; if (removed.length < MAX_CHANGES) removed.push(row);
      }
      snapshot.change = {
        rootUuid: text(root.uuid), entityId, generation, lodLevel,
        collectionError, observedAtFrame: scalar(context.frame),
        beforeCount: prior.count, afterCount: count,
        added, removed, observedAddedCount: addedCount, observedRemovedCount: removedCount,
        membershipComplete: !prior.truncated && !snapshot.truncated,
        rowsTruncated: addedCount > MAX_CHANGES || removedCount > MAX_CHANGES,
      };
    }
    roots.set(root, snapshot);
    return snapshot.change;
  };
}

// Playwright serializes a callback rather than its lexical imports. Both functions below are
// repository-controlled source, never page/user strings. Compile the closure on the Node side.
export function bindShipMeshIdentityObserver(sample) {
  return new Function('options', `const createShipMeshIdentityObserver = ${createShipMeshIdentityObserver.toString()}; return (${sample.toString()})(options);`);
}
