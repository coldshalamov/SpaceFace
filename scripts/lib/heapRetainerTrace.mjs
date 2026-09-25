#!/usr/bin/env node

/**
 * Retainer trace for a V8 .heapsnapshot — the companion to heapSnapshotDiff.mjs.
 * heapSnapshotDiff names the grown class; this names who retains it.
 *
 * Modes:
 *   default: retainer histogram — one edge pass finds the immediate parents of every
 *            node of the target class, histogrammed by (parent class, edge name),
 *            then repeats upward for --hops levels.
 *   --chain: seed from the N largest target nodes and print each one's upward
 *            retainer chain to a pinning root, following the best single parent per
 *            step (property/element edges preferred; shape/prototype edges skipped).
 *            The chain names the actual pinning field — e.g. a Map entry, a userData
 *            slot, a registry record.
 *
 * Usage:
 *   node scripts/lib/heapRetainerTrace.mjs <after.heapsnapshot> [--class=JSArrayBufferData]
 *      [--hops=8] [--top=30] [--min-size=0] [--size-hist]
 *      [--chain --seeds=12 --depth=30]
 *
 * V8 format: nodes are `node_fields.length`-wide records; a node's edges are the next
 * `edge_count` records in the flat `edges` array; `to_node` is a node-record offset.
 */

import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const filePath = args.find((a) => !a.startsWith('--'));
const classArg = args.find((a) => a.startsWith('--class='));
const hopsArg = args.find((a) => a.startsWith('--hops='));
const topArg = args.find((a) => a.startsWith('--top='));
const minSizeArg = args.find((a) => a.startsWith('--min-size='));
const seedsArg = args.find((a) => a.startsWith('--seeds='));
const depthArg = args.find((a) => a.startsWith('--depth='));
const sizeHist = args.includes('--size-hist');
const chainMode = args.includes('--chain');
const CLASS = classArg ? classArg.slice(8) : 'JSArrayBufferData';
const HOPS = hopsArg ? Math.max(1, parseInt(hopsArg.slice(7), 10) || 8) : 8;
const TOP = topArg ? Math.max(1, parseInt(topArg.slice(6), 10) || 30) : 30;
const MIN_SIZE = minSizeArg ? Math.max(0, parseInt(minSizeArg.slice(11), 10) || 0) : 0;
const SEEDS = seedsArg ? Math.max(1, parseInt(seedsArg.slice(8), 10) || 12) : 12;
const DEPTH = depthArg ? Math.max(1, parseInt(depthArg.slice(8), 10) || 30) : 30;

if (!filePath) {
  console.error('usage: node heapRetainerTrace.mjs <snapshot> [--class=Name] [--hops=N] [--top=N] [--min-size=B] [--size-hist] [--chain --seeds=N --depth=N]');
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
const typeName = (off) => typeNames[nodes[off + fType]] ?? String(nodes[off + fType]);
const nodeName = (off) => strings[nodes[off + fName]] ?? '?';
const classKey = (off) => `${typeName(off)}${nodeName(off)}`;
const edgeLabel = (base) => {
  const t = edgeNames[edges[base + eType]] ?? String(edges[base + eType]);
  const n = edges[base + eName];
  const name = t === 'element' || t === 'hidden' ? String(n) : (strings[n] ?? String(n));
  return `${t}:${name}`;
};
const shortNode = (off) => `${classKey(off)} #${Math.floor(off / NW)} (${(nodes[off + fSize] / 1024).toFixed(0)}KB)`;

// Edge-type ranks for "most semantic retainer" selection. Property/element edges name
// the pinning field; internal/weak/backing edges are VM noise walked through first.
// Weak edges do NOT retain — rank them below every strong edge so a chain never
// prefers a WeakMap slot over the object actually keeping the target alive.
const EDGE_RANK = { property: 0, element: 1, internal: 3, context: 4, shortcut: 5, hidden: 6, weak: 8 };
const NOISE_EDGE = new Set(['__proto__', 'prototype', 'map', 'code', 'shared', 'scope_info',
  'previous', 'context', 'descriptors', 'transition', 'back_pointer', 'elements',
  'properties', 'constructor_or_backing_store', 'dependent_code', 'feedback_cell',
  'feedback_vector', 'script', 'shared_function_info', 'native_context', 'builtins']);

// Pass 1: collect target node indices (+ sizes for seeding).
const targetOffsets = [];
{
  let off = 0;
  for (let i = 0; i < nodeCount; i++, off += NW) {
    const name = nodeName(off);
    const key = `${typeName(off)}${name}`;
    if (key === CLASS || name === CLASS || name.endsWith(` / ${CLASS}`) || key.endsWith(CLASS)) {
      if ((nodes[off + fSize] | 0) >= MIN_SIZE) targetOffsets.push(off);
    }
  }
}
let targetBytes = 0;
const buckets = new Map();
for (const off of targetOffsets) {
  const size = nodes[off + fSize] | 0;
  targetBytes += size;
  const bucket = size < 1024 ? '<1KB' : size < 16384 ? '1-16KB' : size < 131072 ? '16-128KB'
    : size < 1048576 ? '128K-1MB' : '>=1MB';
  buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
}
console.log(`targets: ${targetOffsets.length} nodes of "${CLASS}" (self ${(targetBytes / 1048576).toFixed(1)} MB)`);
if (sizeHist) {
  console.log('size buckets:', JSON.stringify(Object.fromEntries([...buckets.entries()].sort())));
}

if (chainMode) {
  // Build a full parent map in one pass: for each node, keep its best-ranked parent edge.
  // Memory: Int32Array fromIndex + Int32Array edgeBase per node (~8 B/node — fine at ~4M nodes).
  const rankOfEdge = (base) => {
    const t = edgeNames[edges[base + eType]] ?? '';
    const rank = EDGE_RANK[t] ?? 3;
    if (rank >= 3) return rank + 4; // internals/weak only when nothing semantic exists
    const name = t === 'element' || t === 'hidden' ? '' : (strings[edges[base + eName]] ?? '');
    return NOISE_EDGE.has(name) ? rank + 2 : rank;
  };
  const bestRank = new Float64Array(nodeCount).fill(Infinity);
  const parentOf = new Int32Array(nodeCount).fill(-1);
  const parentEdge = new Int32Array(nodeCount).fill(-1);
  let edgeCursor = 0;
  for (let off = 0, i = 0; i < nodeCount; i++, off += NW) {
    const count = nodes[off + fEdges] | 0;
    for (let e = 0; e < count; e++, edgeCursor += EW) {
      const toIndex = Math.floor(edges[edgeCursor + eTo] / NW);
      if (toIndex < 0 || toIndex >= nodeCount) continue;
      const r = rankOfEdge(edgeCursor);
      if (r < bestRank[toIndex]) {
        bestRank[toIndex] = r;
        parentOf[toIndex] = i;
        parentEdge[toIndex] = edgeCursor;
      }
    }
  }
  // Seed from the largest target nodes.
  const seeds = [...targetOffsets].sort((a, b) => (nodes[b + fSize] | 0) - (nodes[a + fSize] | 0)).slice(0, SEEDS);
  for (const seed of seeds) {
    console.log(`\n=== chain for ${shortNode(seed)} ===`);
    const seen = new Set();
    let cur = Math.floor(seed / NW);
    for (let depth = 0; depth < DEPTH; depth++) {
      if (seen.has(cur)) { console.log('    (cycle)'); break; }
      seen.add(cur);
      const p = parentOf[cur];
      if (p < 0) { console.log('    (no parent — root)'); break; }
      const base = parentEdge[cur];
      const label = base >= 0 ? edgeLabel(base) : '?';
      const pOff = p * NW;
      const detail = nodeName(pOff);
      const extra = detail.length > 90 ? `${detail.slice(0, 90)}…` : detail;
      console.log(`    <- ${label} <- ${typeName(pOff)}${JSON.stringify(extra.slice(0, 160))} [${(nodes[pOff + fSize] / 1024).toFixed(1)}KB]`);
      cur = p;
    }
  }
  process.exit(0);
}

// Histogram mode: hop-by-hop parent histograms.
const markFor = (offsets) => {
  const mark = new Uint8Array(nodeCount);
  for (const off of offsets) mark[Math.floor(off / NW)] = 1;
  return mark;
};
let frontier = markFor(targetOffsets);
for (let hop = 1; hop <= HOPS && frontier; hop++) {
  const hist = new Map();
  const parentMark = new Uint8Array(nodeCount);
  let edgeCursor = 0;
  for (let off = 0, i = 0; i < nodeCount; i++, off += NW) {
    const count = nodes[off + fEdges] | 0;
    for (let e = 0; e < count; e++, edgeCursor += EW) {
      const toIndex = Math.floor(edges[edgeCursor + eTo] / NW);
      if (toIndex < 0 || toIndex >= nodeCount || !frontier[toIndex]) continue;
      const key = `${classKey(off)}  --${edgeLabel(edgeCursor)}-->`;
      hist.set(key, (hist.get(key) || 0) + 1);
      if (parentMark[i] === 0) parentMark[i] = 1;
    }
  }
  let parentCount = 0;
  for (let i = 0; i < nodeCount; i++) parentCount += parentMark[i];
  console.log(`--- hop ${hop}: ${parentCount} distinct parents ---`);
  const rows = [...hist.entries()].sort((a, b) => b[1] - a[1]);
  for (const [key, count] of rows.slice(0, TOP)) {
    console.log(`${String(count).padStart(8)}  ${key}`);
  }
  if (parentCount === 0) break;
  frontier = parentMark;
}
