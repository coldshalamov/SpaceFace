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
 * The loader is backed by stream-json's SAX parser. It never creates one
 * UTF-8 string for the complete capture, which is necessary for captures
 * larger than V8's maximum string length.
 */

import { createReadStream } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parser } from 'stream-json';

const PARSER_OPTIONS = {
  packKeys: true,
  packStrings: true,
  packNumbers: true,
  streamKeys: false,
  streamStrings: false,
  streamNumbers: false,
};

function valueToken(token) {
  if (token.name === 'numberValue') {
    const value = Number(token.value);
    if (!Number.isFinite(value)) throw new Error(`invalid heap snapshot number: ${token.value}`);
    return value;
  }
  if (token.name === 'stringValue' || token.name === 'trueValue'
      || token.name === 'falseValue' || token.name === 'nullValue') return token.value;
  return undefined;
}

function isPrimitiveToken(token) {
  return token.name === 'numberValue' || token.name === 'stringValue'
    || token.name === 'trueValue' || token.name === 'falseValue' || token.name === 'nullValue';
}

function isContainerStart(token) {
  return token.name === 'startObject' || token.name === 'startArray';
}

function isContainerEnd(token) {
  return token.name === 'endObject' || token.name === 'endArray';
}

function declaredArrayLength(snapshot, field) {
  const meta = snapshot?.meta;
  if (!meta) return null;
  if (field === 'nodes' && Number.isSafeInteger(meta.node_count)
      && Array.isArray(meta.node_fields)) {
    return meta.node_count * meta.node_fields.length;
  }
  if (field === 'edges' && Number.isSafeInteger(meta.edge_count)
      && Array.isArray(meta.edge_fields)) {
    return meta.edge_count * meta.edge_fields.length;
  }
  return null;
}

function assembleSnapshotTokens(tokens) {
  let cursor = 0;
  const parse = () => {
    const token = tokens[cursor++];
    if (!token) throw new Error('invalid heap snapshot metadata: unexpected end');
    if (token.name === 'startObject') {
      const object = {};
      while (tokens[cursor]?.name !== 'endObject') {
        const key = tokens[cursor++];
        if (!key || key.name !== 'keyValue') throw new Error('invalid heap snapshot metadata key');
        object[key.value] = parse();
      }
      cursor += 1;
      return object;
    }
    if (token.name === 'startArray') {
      const array = [];
      while (tokens[cursor]?.name !== 'endArray') array.push(parse());
      cursor += 1;
      return array;
    }
    if (isPrimitiveToken(token)) return valueToken(token);
    throw new Error(`invalid heap snapshot metadata token: ${token.name}`);
  };
  const result = parse();
  if (cursor !== tokens.length) throw new Error('invalid heap snapshot metadata: trailing tokens');
  return result;
}

function appendNumericValue(target, value, count) {
  if (target instanceof Float64Array) {
    if (count >= target.length) throw new Error('heap snapshot numeric array exceeds declared length');
    target[count] = value;
    return;
  }
  target.push(value);
}

function finishNumericArray(target, count, field) {
  if (target instanceof Float64Array) {
    if (count !== target.length) {
      throw new Error(`heap snapshot ${field} length ${count} differs from declared ${target.length}`);
    }
    return target;
  }
  return Float64Array.from(target);
}

/**
 * Read only the requested top-level arrays from a V8 heap snapshot.
 *
 * `arrays` may contain `nodes`, `edges`, `locations`, or `samples`; `strings`
 * is controlled separately because it is a string table rather than a numeric
 * array. Numeric arrays use Float64Array when the snapshot declares their
 * length, preserving signed sizes and IDs without 32-bit coercion.
 */
export async function loadHeapSnapshot(filePath, { arrays = [], includeStrings = true } = {}) {
  const wantedArrays = new Set(arrays);
  const result = {};
  const contextStack = [];
  let snapshotTokens = null;
  let snapshotDepth = 0;
  let snapshotMetadata = null;

  const stream = createReadStream(filePath).pipe(parser.asStream(PARSER_OPTIONS));
  for await (const token of stream) {
    const parent = contextStack[contextStack.length - 1] || null;
    const isKey = token.name === 'keyValue';

    if (isKey) {
      if (!parent || parent.kind !== 'object') throw new Error('invalid heap snapshot object key');
      parent.pendingKey = token.value;
    }

    if (snapshotTokens) {
      snapshotTokens.push(token);
      if (isContainerStart(token)) snapshotDepth += 1;
      else if (isContainerEnd(token)) {
        snapshotDepth -= 1;
        if (snapshotDepth === 0) {
          snapshotMetadata = assembleSnapshotTokens(snapshotTokens);
          result.snapshot = snapshotMetadata;
          snapshotTokens = null;
        }
      }
    }

    if (isKey) continue;

    if (isContainerStart(token)) {
      const kind = token.name === 'startObject' ? 'object' : 'array';
      const path = parent
        ? (parent.kind === 'object' ? [...parent.path, parent.pendingKey]
          : [...parent.path, parent.nextIndex])
        : [];
      const context = { kind, path, pendingKey: null, nextIndex: 0, selected: null };
      if (parent) {
        if (parent.kind === 'object') parent.pendingKey = null;
        else parent.nextIndex += 1;
      }

      if (path.length === 1 && path[0] === 'snapshot' && kind === 'object') {
        snapshotTokens = [token];
        snapshotDepth = 1;
      } else if (path.length === 1 && kind === 'array') {
        const field = path[0];
        if (field === 'strings' && includeStrings) {
          context.selected = { field, kind: 'strings', values: [] };
        } else if (wantedArrays.has(field)) {
          const expected = declaredArrayLength(snapshotMetadata, field);
          const values = Number.isSafeInteger(expected) && expected >= 0
            ? new Float64Array(expected) : [];
          context.selected = { field, kind: 'numbers', values, count: 0 };
        }
      }
      contextStack.push(context);
      continue;
    }

    if (isContainerEnd(token)) {
      const context = contextStack.pop();
      if (!context) throw new Error('invalid heap snapshot container close');
      if (context.selected?.kind === 'numbers') {
        result[context.selected.field] = finishNumericArray(
          context.selected.values,
          context.selected.count,
          context.selected.field,
        );
      } else if (context.selected?.kind === 'strings') {
        result.strings = context.selected.values;
      }
      continue;
    }

    if (isPrimitiveToken(token)) {
      const context = contextStack[contextStack.length - 1];
      if (!context) throw new Error('invalid heap snapshot primitive outside root');
      if (context.selected?.kind === 'numbers') {
        if (token.name !== 'numberValue') throw new Error(`heap snapshot ${context.selected.field} contains a non-number`);
        appendNumericValue(context.selected.values, valueToken(token), context.selected.count);
        context.selected.count += 1;
      } else if (context.selected?.kind === 'strings') {
        if (token.name !== 'stringValue') throw new Error('heap snapshot strings contains a non-string');
        context.selected.values.push(token.value);
      }
      if (context.kind === 'object') context.pendingKey = null;
      else context.nextIndex += 1;
      continue;
    }

    if (token.name === 'startString' || token.name === 'endString'
        || token.name === 'stringChunk' || token.name === 'startNumber'
        || token.name === 'endNumber' || token.name === 'numberChunk'
        || token.name === 'startKey' || token.name === 'endKey') {
      throw new Error(`unexpected unpacked heap snapshot token: ${token.name}`);
    }
    // Parser options above intentionally omit stream-only tokens. Unknown parser tokens are
    // rejected so a future stream-json default cannot silently corrupt the path accounting.
    throw new Error(`unexpected heap snapshot token: ${token.name}`);
  }

  if (contextStack.length !== 0 || snapshotTokens) throw new Error('incomplete heap snapshot JSON');
  if (!result.snapshot || typeof result.snapshot !== 'object') {
    throw new Error('heap snapshot has no snapshot metadata');
  }
  return result;
}

export function aggregate(snapshot) {
  // The schema lives on `snapshot.meta` in the real CDP capture format (node_fields etc.
  // sit under meta, beside node_count/edge_count — verified against a live capture).
  const meta = snapshot.snapshot.meta || snapshot.snapshot;
  const { node_fields: nodeFields, node_types: nodeTypes } = meta;
  const nodes = snapshot.nodes;
  const strings = snapshot.strings;
  const typeIdx = nodeFields.indexOf('type');
  const nameIdx = nodeFields.indexOf('name');
  const sizeIdx = nodeFields.indexOf('self_size');
  if (typeIdx < 0 || nameIdx < 0 || sizeIdx < 0) {
    throw new Error(`unrecognized node_fields: ${nodeFields.join(',')}`);
  }
  const width = nodeFields.length;
  const typeNames = (nodeTypes && nodeTypes[0]) || [];
  const byClass = new Map();
  for (let off = 0; off + width <= nodes.length; off += width) {
    const type = typeNames[nodes[off + typeIdx]] ?? String(nodes[off + typeIdx]);
    const name = strings[nodes[off + nameIdx]] ?? '?';
    const size = Number(nodes[off + sizeIdx]);
    const key = `${type}${name}`;
    const previous = byClass.get(key);
    if (previous) {
      previous.bytes += size;
      previous.count += 1;
    } else {
      byClass.set(key, { bytes: size, count: 1 });
    }
  }
  return { byClass };
}

async function main(argv = process.argv.slice(2)) {
  const positional = argv.filter((argument) => !argument.startsWith('--'));
  const [beforePath, afterPath] = positional;
  const topArg = argv.find((argument) => argument.startsWith('--top='));
  const top = topArg ? Math.max(1, parseInt(topArg.slice(6), 10) || 40) : 40;

  if (!beforePath || !afterPath) {
    console.error('usage: node heapSnapshotDiff.mjs <before.heapsnapshot> <after.heapsnapshot> [--top=40]');
    process.exitCode = 2;
    return;
  }

  // Load sequentially. The retained class map is small; retaining both raw node arrays while
  // parsing the second 600 MB capture would needlessly increase the peak heap.
  let beforeRaw = await loadHeapSnapshot(beforePath, { arrays: ['nodes'], includeStrings: true });
  const before = aggregate(beforeRaw);
  beforeRaw = null;
  let afterRaw = await loadHeapSnapshot(afterPath, { arrays: ['nodes'], includeStrings: true });
  const after = aggregate(afterRaw);
  afterRaw = null;

  const rows = [];
  for (const [key, current] of after.byClass) {
    const previous = before.byClass.get(key);
    const dBytes = current.bytes - (previous ? previous.bytes : 0);
    const dCount = current.count - (previous ? previous.count : 0);
    if (dBytes > 0 || dCount > 0) {
      rows.push({ key, dBytes, dCount, afterBytes: current.bytes, afterCount: current.count });
    }
  }
  rows.sort((a, b) => b.dBytes - a.dBytes);

  let totalDelta = 0;
  for (const [key, current] of after.byClass) {
    totalDelta += current.bytes - (before.byClass.get(key)?.bytes || 0);
  }
  console.log(`aggregate self-size delta: ${(totalDelta / 1048576).toFixed(1)} MB across ${after.byClass.size} classes`);
  console.log('--- top growth by self-size ---');
  for (const row of rows.slice(0, top)) {
    console.log(`${(row.dBytes / 1048576).toFixed(2).padStart(8)} MB  +${String(row.dCount).padStart(6)} objs  (now ${(row.afterBytes / 1048576).toFixed(1)} MB / ${row.afterCount})  ${row.key}`);
  }
}

const isMainModule = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
