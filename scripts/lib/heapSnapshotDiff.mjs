#!/usr/bin/env node

/**
 * Diff two V8 .heapsnapshot files (captured via SF_SOAK_HEAP_SNAPSHOTS=1 in
 * releaseSoakProbe). Aggregates retained self-size by (node_type, name) in
 * each snapshot and prints the classes that grew the most — the names the
 * leak hunt needs, without a Chrome UI.
 *
 * Usage:
 *   node scripts/lib/heapSnapshotDiff.mjs <before.heapsnapshot> <after.heapsnapshot> [--top=40]
 *
 * Snapshot format (V8/Chrome): JSON { snapshot: { node_fields, node_types,
 * edge_fields, edge_types }, nodes: [...], edges: [...], strings: [...] }.
 * Nodes are a flat typed array; each record is node_fields.length wide.
 * Only self_size is aggregated here — dominator/retainer analysis belongs in
 * DevTools once the class is named.
 */

import { readFile } from 'node:fs/promises';

const [beforePath, afterPath] = process.argv.slice(2);
const topArg = process.argv.slice(2).find((a) => a.startsWith('--top='));
const TOP = topArg ? Math.max(1, parseInt(topArg.slice(6), 10) || 40) : 40;

if (!beforePath || !afterPath) {
  console.error('usage: node heapSnapshotDiff.mjs <before.heapsnapshot> <after.heapsnapshot> [--top=40]');
  process.exit(2);
}

function aggregate(snapshot) {
  // The schema lives on `snapshot.meta` in the real CDP capture format (node_fields etc.
  // sit under meta, beside node_count/edge_count — verified against a live capture).
  const meta = snapshot.snapshot.meta || snapshot.snapshot;
  const { node_fields: nodeFields, node_types: nodeTypes } = meta;
  const nodes = snapshot.nodes;
  const strings = snapshot.strings;
  const typeIdx = nodeFields.indexOf('type');
  const nameIdx = nodeFields.indexOf('name');
  const sizeIdx = nodeFields.indexOf('self_size');
  const idIdx = nodeFields.indexOf('id');
  if (typeIdx < 0 || nameIdx < 0 || sizeIdx < 0) {
    throw new Error(`unrecognized node_fields: ${nodeFields.join(',')}`);
  }
  const width = nodeFields.length;
  const typeNames = (nodeTypes && nodeTypes[0]) || [];
  const byClass = new Map();
  const byId = idIdx >= 0 ? new Map() : null;
  for (let off = 0; off + width <= nodes.length; off += width) {
    const type = typeNames[nodes[off + typeIdx]] ?? String(nodes[off + typeIdx]);
    const name = strings[nodes[off + nameIdx]] ?? '?';
    const size = nodes[off + sizeIdx] | 0;
    const key = `${type}${name}`;
    const prev = byClass.get(key);
    if (prev) { prev.bytes += size; prev.count += 1; }
    else byClass.set(key, { bytes: size, count: 1 });
    if (byId) byId.set(nodes[off + idIdx], { key, size });
  }
  return { byClass, byId };
}

const [beforeJson, afterJson] = await Promise.all([
  readFile(beforePath, 'utf8').then(JSON.parse),
  readFile(afterPath, 'utf8').then(JSON.parse),
]);
const before = aggregate(beforeJson);
const after = aggregate(afterJson);

const rows = [];
for (const [key, a] of after.byClass) {
  const b = before.byClass.get(key);
  const dBytes = a.bytes - (b ? b.bytes : 0);
  const dCount = a.count - (b ? b.count : 0);
  if (dBytes > 0 || dCount > 0) rows.push({ key, dBytes, dCount, afterBytes: a.bytes, afterCount: a.count });
}
rows.sort((x, y) => y.dBytes - x.dBytes);

let totalDelta = 0;
for (const [key, a] of after.byClass) totalDelta += a.bytes - (before.byClass.get(key)?.bytes || 0);
console.log(`aggregate self-size delta: ${(totalDelta / 1048576).toFixed(1)} MB across ${after.byClass.size} classes`);
console.log('--- top growth by self-size ---');
for (const r of rows.slice(0, TOP)) {
  console.log(`${(r.dBytes / 1048576).toFixed(2).padStart(8)} MB  +${String(r.dCount).padStart(6)} objs  (now ${(r.afterBytes / 1048576).toFixed(1)} MB / ${r.afterCount})  ${r.key}`);
}
