#!/usr/bin/env node

/**
 * Asset-residency attribution for a V8 .heapsnapshot.
 *
 * Follows the registry's `memoryUnits` context variable (a Map inside the
 * createAssetResidencyRegistry closure) -> unit records {identity, bytes, resources:Set}
 * -> resourceEntry {resource, assets:Set} -> assetEntry {key, owners:Map(owner->metadata)}
 * and reports which asset keys pin the retained bytes and under which owner roles.
 *
 * Usage:
 *   node scripts/lib/heapResidencyAttribution.mjs <snapshot.heapsnapshot> [--top=40]
 */

import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const filePath = args.find((a) => !a.startsWith('--'));
const topArg = args.find((a) => a.startsWith('--top='));
const TOP = topArg ? Math.max(1, parseInt(topArg.slice(6), 10) || 40) : 40;

if (!filePath) {
  console.error('usage: node heapResidencyAttribution.mjs <snapshot> [--top=N]');
  process.exit(2);
}

const snapshot = JSON.parse(await readFile(filePath, 'utf8'));
const meta = snapshot.snapshot.meta || snapshot.snapshot;
const { node_fields: nodeFields, node_types: nodeTypes, edge_fields: edgeFields, edge_types: edgeTypes } = meta;
const nodes = snapshot.nodes;
const edges = snapshot.edges;
const strings = snapshot.strings;
const fType = nodeFields.indexOf('type');
const fName = nodeFields.indexOf('name');
const fSize = nodeFields.indexOf('self_size');
const fEdges = nodeFields.indexOf('edge_count');
const NW = nodeFields.length;
const eType = edgeFields.indexOf('type');
const eName = edgeFields.indexOf('name_or_index');
const eTo = edgeFields.indexOf('to_node');
const EW = edgeFields.length;
const typeNames = (nodeTypes && nodeTypes[0]) || [];
const edgeNames = (edgeTypes && edgeTypes[0]) || [];
const nodeCount = Math.floor(nodes.length / NW);
const typeName = (i) => typeNames[nodes[i * NW + fType]] ?? '?';
const nodeName = (i) => strings[nodes[i * NW + fName]] ?? '?';
const selfSize = (i) => nodes[i * NW + fSize];

const edgeBase = new Int32Array(nodeCount);
{ let c = 0; for (let i = 0; i < nodeCount; i++) { edgeBase[i] = c; c += (nodes[i * NW + fEdges] | 0) * EW; } }
const eCount = (i) => nodes[i * NW + fEdges] | 0;
const eTypeAt = (b) => edgeNames[edges[b + eType]] ?? '';
const eNameAt = (b) => { const t = eTypeAt(b); const n = edges[b + eName]; return t === 'element' || t === 'hidden' ? String(n) : (strings[n] ?? String(n)); };
const eToAt = (b) => Math.floor(edges[b + eTo] / NW);

function prop(i, name, types = null) {
  const base = edgeBase[i];
  const n = eCount(i);
  for (let k = 0; k < n; k++) {
    const b = base + k * EW;
    const t = eTypeAt(b);
    if (types && !types.includes(t)) continue;
    if (!types && t !== 'property' && t !== 'internal') continue;
    if (eNameAt(b) === name) return eToAt(b);
  }
  return -1;
}
function* outEdges(i, types) {
  const base = edgeBase[i];
  const n = eCount(i);
  for (let k = 0; k < n; k++) {
    const b = base + k * EW;
    const t = eTypeAt(b);
    if (types && !types.includes(t)) continue;
    yield { type: t, name: eNameAt(b), to: eToAt(b) };
  }
}

// 1. Find context edges named `memoryUnits` -> Map nodes (one per registry closure).
const memoryUnitMaps = [];
for (let i = 0; i < nodeCount; i++) {
  const base = edgeBase[i];
  const n = eCount(i);
  for (let k = 0; k < n; k++) {
    const b = base + k * EW;
    if (eTypeAt(b) !== 'context') continue;
    if (eNameAt(b) !== 'memoryUnits') continue;
    const to = eToAt(b);
    if (typeName(to) === 'object' && nodeName(to) === 'Map') memoryUnitMaps.push({ ctx: i, map: to });
  }
}
console.log(`memoryUnits maps found: ${memoryUnitMaps.length}`);

// Map internals: Map -> 'table' -> backing array -> element slots are entries
// (V8 OrderedHashTable: each entry is [key, value, chain]; value at index+1... but in
// snapshot form the table array's elements point at key/value pairs directly).
function* mapEntries(mapIdx) {
  const table = prop(mapIdx, 'table');
  if (table < 0) return;
  for (const e of outEdges(table, ['internal', 'element'])) {
    yield e.to; // value nodes (unit records) — keys and values interleave; filter by shape
  }
}

function isUnitRecord(i) {
  return prop(i, 'identity') >= 0 && prop(i, 'resources') >= 0;
}
function setMembers(i) {
  // a Set node -> 'table' -> array -> elements are member nodes
  const table = prop(i, 'table');
  if (table < 0) return [];
  const out = [];
  for (const e of outEdges(table, ['internal', 'element'])) out.push(e.to);
  return out;
}
function mapOwnerRoles(ownersMap) {
  const roles = [];
  const table = prop(ownersMap, 'table');
  if (table < 0) return roles;
  for (const e of outEdges(table, ['internal', 'element'])) {
    // metadata record {role?, sectorId?, ...} — V8 map entries expose key/value pairs;
    // the value node has a 'role' string property.
    const meta = e.to;
    const role = prop(meta, 'role');
    if (role >= 0 && typeName(role) === 'string') roles.push(nodeName(role));
    else {
      // maybe the element is the metadata itself with nested role string edge
      for (const ee of outEdges(meta, ['property'])) {
        if (ee.name === 'role' && typeName(ee.to) === 'string') roles.push(nodeName(ee.to));
      }
    }
  }
  return roles;
}

// 2. Walk each memoryUnits map; attribute bytes to asset keys.
const perKey = new Map(); // key -> {bytes, units, roles:Set, keys}
let totalUnits = 0;
let totalBytes = 0;
const unattributed = [];

for (const { map } of memoryUnitMaps) {
  for (const member of mapEntries(map)) {
    if (!isUnitRecord(member)) continue;
    totalUnits++;
    // bytes is an inline SMI — no edge. Read via the resources set's entries instead.
    // Find asset keys: unit.resources -> Set -> resourceEntry -> .assets -> Set -> assetEntry -> .key
    const resSetIdx = prop(member, 'resources');
    const keys = new Set();
    const roles = new Set();
    let bytesGuess = 0;
    for (const resEntry of setMembers(resSetIdx)) {
      const assetsSet = prop(resEntry, 'assets');
      for (const assetEntry of setMembers(assetsSet)) {
        const keyIdx = prop(assetEntry, 'key');
        if (keyIdx >= 0 && typeName(keyIdx) === 'string') keys.add(nodeName(keyIdx));
        const ownersIdx = prop(assetEntry, 'owners');
        if (ownersIdx >= 0) for (const r of mapOwnerRoles(ownersIdx)) roles.add(r);
      }
      // resourceEntry.bytes is also inline SMI; approximate via memory bytes edge? none.
    }
    // The unit's own bytes are a SMI field; not an edge. Approximate unit bytes by summing
    // JSArrayBufferData payloads reachable under the identity object (BufferAttribute.array,
    // texture mipmaps[].data / source.data, plain typed arrays) — bounded BFS, deduped.
    const idIdx = prop(member, 'identity');
    let unitBytes = 0;
    if (idIdx >= 0) {
      const seen = new Set([idIdx]);
      const queue = [idIdx];
      let hops = 0;
      while (queue.length && hops < 6) {
        const next = [];
        for (const cur of queue) {
          if (typeName(cur).includes('JSArrayBufferData')) { unitBytes += selfSize(cur); continue; }
          for (const e of outEdges(cur)) {
            if (e.type === 'weak' || e.type === 'shortcut') continue;
            const name = e.name;
            if (name === '__proto__' || name === 'map' || name === 'prototype') continue;
            if (e.to < 0 || seen.has(e.to)) continue;
            seen.add(e.to);
            next.push(e.to);
          }
        }
        queue.length = 0;
        queue.push(...next);
        hops++;
      }
      if (!unitBytes) unitBytes = selfSize(idIdx);
    }
    totalBytes += unitBytes;
    if (keys.size === 0) {
      unattributed.push({ member, bytes: unitBytes });
      continue;
    }
    for (const key of keys) {
      let row = perKey.get(key);
      if (!row) { row = { bytes: 0, units: 0, roles: new Set() }; perKey.set(key, row); }
      row.bytes += unitBytes / keys.size;
      row.units += 1;
      for (const r of roles) row.roles.add(r);
    }
  }
}

console.log(`units: ${totalUnits}  approx bytes: ${(totalBytes / 1048576).toFixed(1)} MB  unattributed units: ${unattributed.length}`);
const rows = [...perKey.entries()].sort((a, b) => b[1].bytes - a[1].bytes);
for (const [key, row] of rows.slice(0, TOP)) {
  console.log(`${(row.bytes / 1048576).toFixed(2).padStart(9)} MB  units:${String(row.units).padStart(4)}  roles:${[...row.roles].sort().join('|') || '-'}  ${key.slice(0, 120)}`);
}
if (unattributed.length) {
  const mb = unattributed.reduce((s, u) => s + u.bytes, 0) / 1048576;
  console.log(`unattributed total: ${mb.toFixed(1)} MB over ${unattributed.length} units`);
}
