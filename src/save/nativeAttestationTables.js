// Exact, inspectable native snapshot attestation tables. No solver state or authority is omitted.
// The generic envelope still has its 200k-node/12MiB wire bound. Expansion has a separate
// 200k-node/12MiB physics bound, checked before allocating any reconstructed body graphs.
export function validateNativeAttestationTables(payload, validateLegacy = false) {
  const fail = reason => ({ ok: false, reason: `native_attestation_${reason}` });
  const own = (o, k) => Object.getOwnPropertyDescriptor(o, k);
  if (payload == null) return { ok: true, legacy: true };
  if (typeof payload !== 'object' || Array.isArray(payload)) return fail('shape');
  const schema = own(payload, 'schema');
  if (schema && !('value' in schema)) return fail('accessor');
  if (schema?.value !== 4) {
    if (own(payload, 'attestations')) return fail('mixed_format');
    if (!validateLegacy) return { ok: true, legacy: true };
  }
  const MAX_NODES = 200000, MAX_BYTES = 12 * 1024 * 1024;
  function stringBytes(s) {
    let n = 2;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c === 34 || c === 92 || c === 8 || c === 9 || c === 10 || c === 12 || c === 13) n += 2;
      else if (c < 32) n += 6;
      else if (c < 128) n++;
      else if (c < 2048) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && s.charCodeAt(i + 1) >= 0xdc00 && s.charCodeAt(i + 1) <= 0xdfff) { n += 4; i++; }
      else if (c >= 0xd800 && c <= 0xdfff) n += 6;
      else n += 3;
      if (n > MAX_BYTES) throw Error('bytes');
    }
    return n;
  }
  function measure(root) {
    const active = new Set(); let nodes = 0, bytes = 0, maxDepth = 0;
    function visit(v, depth) {
      if (++nodes > MAX_NODES) throw Error('nodes');
      if (depth > 62) throw Error('depth');
      maxDepth = Math.max(depth, maxDepth);
      if (v === null) bytes += 4;
      else if (typeof v === 'string') bytes += stringBytes(v);
      else if (typeof v === 'boolean') bytes += v ? 4 : 5;
      else if (typeof v === 'number' && Number.isFinite(v)) bytes += String(Object.is(v, -0) ? 0 : v).length;
      else if (typeof v === 'object') {
        if (active.has(v)) throw Error('cycle');
        const array = Array.isArray(v), proto = Object.getPrototypeOf(v);
        if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) throw Error('prototype');
        const keys = Reflect.ownKeys(v);
        if (keys.some(k => typeof k !== 'string')) throw Error('symbol');
        const entries = [];
        if (array) {
          if (v.length > 50000 || keys.length !== v.length + 1) throw Error('collection');
          for (let i = 0; i < v.length; i++) { const d = own(v, String(i)); if (!d || !('value' in d) || !d.enumerable) throw Error('descriptor'); entries.push(d.value); }
        } else {
          if (keys.length > 50000) throw Error('collection');
          for (const k of keys) { const d = own(v, k); if (!d || !('value' in d) || !d.enumerable || k === '__proto__' || k === 'constructor' || k === 'prototype') throw Error('descriptor'); entries.push([k, d.value]); }
        }
        active.add(v); bytes += 2 + Math.max(0, entries.length - 1);
        for (const entry of entries) { if (array) visit(entry, depth + 1); else { bytes += stringBytes(entry[0]) + 1; visit(entry[1], depth + 1); } if (bytes > MAX_BYTES) throw Error('bytes'); }
        active.delete(v);
      } else throw Error('type');
      if (bytes > MAX_BYTES) throw Error('bytes');
    }
    visit(root, 0); return { nodes, bytes, maxDepth };
  }
  try {
    const compact = measure(payload);
    if (schema?.value !== 4) return { ok: true, legacy: true, expandedNodes: compact.nodes, expandedBytes: compact.bytes };
    const tables = payload.attestations, bodies = payload.bodies;
    if (!tables || Array.isArray(tables) || Object.keys(tables).sort().join(',') !== 'contracts,native,schema' || tables.schema !== 1
      || !Array.isArray(tables.contracts) || !Array.isArray(tables.native)
      || !bodies || Array.isArray(bodies)) return fail('shape');
    const ids = Object.keys(bodies);
    if (ids.length > 2048 || tables.contracts.length > ids.length || tables.native.length > ids.length) return fail('count');
    const order = payload.bodyOrder;
    if (!Array.isArray(order) || order.length !== ids.length || new Set(order).size !== ids.length || order.some(id => typeof id !== 'string' || !own(bodies, id))) return fail('body_order');
    const allowed = 'bodyResponseInertiaScale,bodyResponseMassScale,contactEpisode,contractRef,createdCanSleep,effectiveInertiaY,effectiveMass,forcesDirty,handle,identity,nativeRef,sleepAllowed,sourceLife,state,tumbleMaterial';
    const used = [new Set(), new Set()];
    const base = { ...payload, bodies: {} }; delete base.attestations;
    let expanded = measure(base);
    // Replace the empty bodies object's two braces with the equivalent per-body members.
    for (let index = 0; index < order.length; index++) {
      const id = order[index], row = bodies[id];
      if (!row || Array.isArray(row) || Object.keys(row).sort().join(',') !== allowed) return fail('body_shape');
      const refs = [row.contractRef, row.nativeRef], lists = [tables.contracts, tables.native];
      for (let k = 0; k < 2; k++) {
        const ref = refs[k];
        if (!Number.isSafeInteger(ref) || ref < 0 || ref >= lists[k].length) return fail('reference');
        if (!used[k].has(ref)) { if (ref !== used[k].size) return fail('reference_order'); used[k].add(ref); }
      }
      const material = {};
      for (const key of Object.keys(row)) {
        if (key === 'contractRef') material.contract = tables.contracts[row.contractRef];
        else if (key === 'nativeRef') material.native = tables.native[row.nativeRef];
        else material[key] = row[key];
      }
      const cost = measure(material);
      if (cost.maxDepth + 2 > 62) return fail('depth');
      expanded.nodes += cost.nodes; expanded.bytes += stringBytes(id) + 1 + cost.bytes + (index ? 1 : 0);
      if (expanded.nodes > MAX_NODES) return fail('expanded_nodes');
      if (expanded.bytes > MAX_BYTES) return fail('expanded_bytes');
    }
    for (const [i, list] of [tables.contracts, tables.native].entries()) {
      if (used[i].size !== list.length) return fail('unused');
      const seen = new Set();
      for (const row of list) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) return fail('table_shape');
        const expected = i === 0 ? 'canSleep,collisionGroups,manifest,material,proportions,proxyScale,spec' : 'angularDamping,centerOfMass,colliders,enabled,inertia,inverseMass,linearDamping,mass,type';
        if (Object.keys(row).sort().join(',') !== expected) return fail('table_shape');
        if (i === 1 && (!['angularDamping','linearDamping','mass','type'].every(k => Number.isFinite(row[k])) || typeof row.enabled !== 'boolean' || !Array.isArray(row.colliders))) return fail('table_type');
        if (i === 0 && (typeof row.canSleep !== 'boolean' || !Number.isSafeInteger(row.collisionGroups) || !row.spec || typeof row.spec !== 'object')) return fail('table_type');
        const key = JSON.stringify(row); if (seen.has(key)) return fail('duplicate'); seen.add(key);
      }
    }
    return { ok: true, legacy: false, compactNodes: compact.nodes, expandedNodes: expanded.nodes, expandedBytes: expanded.bytes };
  } catch (error) { return fail(error.message || 'invalid'); }
}

export function expandNativeAttestationTables(payload) {
  const verdict = validateNativeAttestationTables(payload);
  if (!verdict.ok) return null;
  if (verdict.legacy) return payload;
  const clone = value => {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(clone);
    const result = {}; for (const key of Object.keys(value)) result[key] = clone(value[key]); return result;
  };
  const result = { ...payload, schema: 3, bodies: {} }; delete result.attestations;
  for (const id of payload.bodyOrder) {
    const row = payload.bodies[id], restored = {};
    for (const key of Object.keys(row)) {
      if (key === 'contractRef') restored.contract = clone(payload.attestations.contracts[row.contractRef]);
      else if (key === 'nativeRef') restored.native = clone(payload.attestations.native[row.nativeRef]);
      else restored[key] = clone(row[key]);
    }
    result.bodies[id] = restored;
  }
  return result;
}

export function compactNativeAttestationTables(payload) {
  const verdict = validateNativeAttestationTables(payload, true);
  if (!verdict.ok || !payload || payload.schema !== 3 || payload.attestations) return null;
  if (!payload.bodies || Array.isArray(payload.bodies) || !Array.isArray(payload.bodyOrder)) return null;
  const ids = Object.keys(payload.bodies);
  if (payload.bodyOrder.length !== ids.length || new Set(payload.bodyOrder).size !== ids.length
    || payload.bodyOrder.some(id => typeof id !== 'string' || !Object.hasOwn(payload.bodies, id))) return null;
  const sourceKeys = 'bodyResponseInertiaScale,bodyResponseMassScale,contactEpisode,contract,createdCanSleep,effectiveInertiaY,effectiveMass,forcesDirty,handle,identity,native,sleepAllowed,sourceLife,state,tumbleMaterial';
  for (const id of ids) if (!payload.bodies[id] || Array.isArray(payload.bodies[id]) || Object.keys(payload.bodies[id]).sort().join(',') !== sourceKeys) return null;
  const result = { ...payload, schema: 4, bodies: {}, attestations: { schema: 1, contracts: [], native: [] } };
  const maps = [new Map(), new Map()];
  for (const id of payload.bodyOrder || []) {
    const row = payload.bodies?.[id]; if (!row) return null;
    const compact = {};
    for (const key of Object.keys(row)) {
      if (key !== 'contract' && key !== 'native') { compact[key] = row[key]; continue; }
      const i = key === 'contract' ? 0 : 1, table = i ? result.attestations.native : result.attestations.contracts;
      const signature = JSON.stringify(row[key]);
      if (!maps[i].has(signature)) { maps[i].set(signature, table.length); table.push(row[key]); }
      compact[`${key}Ref`] = maps[i].get(signature);
    }
    result.bodies[id] = compact;
  }
  return validateNativeAttestationTables(result).ok ? result : null;
}
