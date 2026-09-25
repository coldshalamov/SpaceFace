#!/usr/bin/env node

/**
 * Bucket a class's objects by their "first strong pinning structure" — for every
 * target node, BFS upward through strong edges only (property/element/internal
 * table slots) until we reach either a named container (Map/Set table reached via
 * a property edge, e.g. `assets`, `cache`) or exhaust --depth hops. Records the
 * chain label per object.
 *
 * Usage:
 *   node scripts/lib/heapOwnerBuckets.mjs <snapshot> --class=LoadedRenderPackage [--depth=30]
 */

import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const filePath = args.find((a) => !a.startsWith('--'));
const classArg = args.find((a) => a.startsWith('--class='));
const depthArg = args.find((a) => a.startsWith('--depth='));
const CLASS = classArg ? classArg.slice(8) : 'LoadedRenderPackage';
const DEPTH = depthArg ? Math.max(1, parseInt(depthArg.slice(8), 10) || 30) : 30;

if (!filePath) { console.error('usage: heapOwnerBuckets.mjs <snapshot> --class=X [--depth=N]'); process.exit(2); }

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
const nodeType = (i) => typeNames[nodes[i * NW + fType]] ?? '?';
const nodeName = (i) => strings[nodes[i * NW + fName]] ?? '?';

// Build a forward edge index and a multi-parent inbound index of STRONG edges.
const edgeBase = new Int32Array(nodeCount);
{ let c = 0; for (let i = 0; i < nodeCount; i++) { edgeBase[i] = c; c += (nodes[i * NW + fEdges] | 0) * EW; } }
const etName = (b) => edgeNames[edges[b + eType]] ?? '';
const enName = (b) => { const t = etName(b); const n = edges[b + eName]; return t === 'element' || t === 'hidden' ? String(n) : (strings[n] ?? String(n)); };
const toIdx = (b) => Math.floor(edges[b + eTo] / NW);

// inbound: target -> list of {from, label} for strong edges (skip weak/shortcuts and
// obvious shape noise: __proto__/map/prototype/code/shared/scope_info/elements/properties)
const SKIP_NAMES = new Set(['__proto__', 'prototype', 'map', 'code', 'shared', 'scope_info',
  'previous', 'context', 'descriptors', 'transition', 'back_pointer', 'elements', 'properties',
  'constructor_or_backing_store', 'dependent_code', 'feedback_cell', 'feedback_vector', 'script',
  'shared_function_info', 'native_context', 'builtins', 'initial_map', 'prototype_info',
  'constructor', 'raw', 'reactions', 'constructor_name', 'transitions', 'instance_type',
  'instance_type_name', 'instance_size', 'visitor_id', 'visitor_name', 'elements_kind',
  'elements_kind_name', 'enum_length', 'number_of_own_descriptors', 'prototype_data',
  'enum_cache', 'validity_cell', 'm egacache', 'megamorphic_cache', 'code_cache']);
const inbound = new Map(); // toIdx -> [{from, label}]
let cursor = 0;
for (let i = 0; i < nodeCount; i++) {
  const cnt = nodes[i * NW + fEdges] | 0;
  for (let e = 0; e < cnt; e++, cursor += EW) {
    const t = etName(cursor);
    if (t === 'weak' || t === 'shortcut') continue;
    const nm = enName(cursor);
    if (SKIP_NAMES.has(nm)) continue;
    if (t === 'context') continue; // contexts are shared; walk them manually if needed
    const to = toIdx(cursor);
    if (to < 0 || to >= nodeCount) continue;
    let list = inbound.get(to);
    if (!list) { list = []; inbound.set(to, list); }
    if (list.length < 64) list.push({ from: i, label: `${t}:${nm}` });
  }
}

// Targets
const targets = [];
for (let i = 0; i < nodeCount; i++) {
  const key = `${nodeType(i)}${nodeName(i)}`;
  if (key === CLASS || nodeName(i) === CLASS || key.endsWith(CLASS)) targets.push(i);
}
console.log(`targets: ${targets.length} of "${CLASS}"`);

const buckets = new Map();
for (const t of targets) {
  // BFS upward; stop at first node reached through a `property:` edge that lands on a
  // container-ish node (Map/Set/array/object holding collections) or a named runtime object.
  const seen = new Set([t]);
  let queue = [t];
  let label = '(no strong parent)';
  for (let d = 0; d < DEPTH && queue.length; d++) {
    const next = [];
    let hit = null;
    for (const cur of queue) {
      const parents = inbound.get(cur) || [];
      for (const p of parents) {
        const [kind, name] = p.label.split(':');
        // A Map/Set/array reached via a named property is a pinning collection.
        if (kind === 'property' && /^(assets|cache|records|tasks|pending|libraries|library|templates|slots|entries|items|map|table|stores|resources|owners|instances|prepared|queue|jobs|requests|pool|pools|meshes|byEntity|pendingAssetTasks|failures|loaded|decoded|packages|parts|recordsBy|index|order|all|set|list|buffer|promises)/i.test(name)) {
          hit = `...${nodeName(p.from)}.${name} [${nodeType(p.from)}]`;
          break;
        }
      }
      if (hit) break;
      for (const p of parents) {
        if (!seen.has(p.from)) { seen.add(p.from); next.push(p.from); }
      }
    }
    if (hit) { label = hit; break; }
    queue = next;
  }
  // If BFS exhausted, reconstruct a short signature of the deepest parents.
  if (label === '(no strong parent)') {
    const parents = inbound.get(t) || [];
    if (parents.length) label = parents.slice(0, 3).map((p) => `${nodeName(p.from)}<${p.label}`).join(' | ');
  }
  buckets.set(label, (buckets.get(label) || 0) + 1);
}

const rows = [...buckets.entries()].sort((a, b) => b[1] - a[1]);
for (const [label, count] of rows) console.log(`${String(count).padStart(6)}  ${label}`);
