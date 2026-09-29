#!/usr/bin/env node
/** Read-only view of Next Wave rows. Markdown owns status; catalog.json owns specifications. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACK_ROOT = 'design/program/next-wave-2026-09-28';
const SOURCES = Object.freeze({
  build: 'build_map.md',
  inference: 'design/program/INFERENCE_IDEAS.md',
});
const HELP = `Usage:
  node scripts/next-wave-read.mjs --kind build|inference --next [--root PATH]
  node scripts/next-wave-read.mjs --kind build|inference --ready [--root PATH]
  node scripts/next-wave-read.mjs --id NXB-025|NXI-097 [--root PATH]

Read-only and advisory. Reads the canonical Markdown status cells, not initial_status
from catalog.json. Does not reserve files, inspect NOW/checkpoints, or replace the PQ
queue. Confirm current source, prerequisites and exact dirty hunks before claiming.`;

export function parseOptions(argv) {
  const result = { mode: null, kind: null, root: null, id: null, help: false };
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (seen.has(arg)) throw new Error(`duplicate option ${arg}`);
    seen.add(arg);
    if (arg === '--help' || arg === '-h') { result.help = true; continue; }
    if (arg === '--next' || arg === '--ready') {
      if (result.mode) throw new Error('choose exactly one of --next, --ready or --id');
      result.mode = arg.slice(2); continue;
    }
    if (['--kind', '--root', '--id'].includes(arg)) {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      if (arg === '--id') {
        if (result.mode) throw new Error('choose exactly one of --next, --ready or --id');
        result.mode = 'id'; result.id = value;
      } else result[arg.slice(2)] = value;
      continue;
    }
    throw new Error(`unknown option ${arg}`);
  }
  if (result.help) return result;
  if (!result.mode) throw new Error('choose --next, --ready or --id');
  if (result.id) {
    if (!/^NX[BI]-\d{3}$/.test(result.id)) throw new Error('expected an NXB- or NXI- three-digit ID');
    const kind = result.id.startsWith('NXB-') ? 'build' : 'inference';
    if (result.kind && result.kind !== kind) throw new Error('--kind conflicts with --id');
    result.kind = kind;
  }
  if (!Object.hasOwn(SOURCES, result.kind)) throw new Error('--kind must be build or inference');
  return result;
}

/** Deliberately matches the ID column only, never a dependency or an ID in prose. */
export function parseCanonicalRows(markdown, kind) {
  const pattern = kind === 'build' ? /^NXB-\d{3}$/ : /^NXI-\d{3}$/;
  const rows = new Map();
  for (const [offset, line] of markdown.split(/\r?\n/).entries()) {
    if (!line.trimStart().startsWith('|') || !line.trimEnd().endsWith('|')) continue;
    const cells = line.trim().split('|').slice(1, -1).map(c => c.trim());
    const idCell = kind === 'build' ? cells[2] : cells[0];
    if (!idCell) continue;
    const id = /^\[(NX[BI]-\d{3})\]\([^)]*\)$/.exec(idCell)?.[1] ?? idCell;
    if (!pattern.test(id)) continue;
    if (kind === 'build' && cells[1] !== 'BUILD') continue;
    if (cells.length !== 6) throw new Error(`malformed ${id} canonical table row at line ${offset + 1}`);
    if (rows.has(id)) throw new Error(`duplicate canonical row for ${id}`);
    const status = cells.at(-1);
    if (!status) throw new Error(`missing status for ${id}`);
    rows.set(id, { id, status, line: offset + 1 });
  }
  return rows;
}

export function readCatalog(root) {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, PACK_ROOT, 'catalog.json'), 'utf8'));
  if (catalog.schema !== 'spaceface.next-wave.specifications.v1' || catalog.is_live_queue !== false || !Array.isArray(catalog.tasks)) {
    throw new Error('invalid immutable specification catalog');
  }
  const byId = new Map();
  for (const task of catalog.tasks) {
    if (!/^NX[BI]-\d{3}$/.test(task.id) || byId.has(task.id)) throw new Error(`invalid/duplicate specification ${task.id}`);
    if (!Array.isArray(task.paths) || typeof task.packet !== 'string') throw new Error(`invalid specification fields for ${task.id}`);
    byId.set(task.id, task);
  }
  return byId;
}

export function selectRows(root, options) {
  const source = SOURCES[options.kind];
  if (!source) throw new Error('unknown task kind');
  const byId = readCatalog(root);
  const rows = parseCanonicalRows(fs.readFileSync(path.join(root, source), 'utf8'), options.kind);
  const summarize = row => {
    const spec = byId.get(row.id);
    if (!spec) throw new Error(`${row.id} has no immutable specification`);
    return {
      id: row.id, title: spec.title, priority: spec.priority, status: row.status,
      source, sourceLine: row.line, packet: spec.packet, paths: spec.paths,
      capabilityToVerify: spec.dependency ?? null,
    };
  };
  // Validate every own row before selecting; a broken row must not disappear silently.
  const current = [...rows.values()].map(summarize);
  const counts = current.reduce((out, row) => {
    const status = row.status.split(/\s+/)[0]; out[status] = (out[status] || 0) + 1; return out;
  }, {});
  const result = {
    advisory: true, canonicalStatusSource: source, kind: options.kind, counts,
    instruction: 'Read current source and prerequisite evidence; inspect NOW/checkpoints and exact dirty hunks before claiming. No file ownership or runtime verification was performed by this selector.',
    tasks: [],
  };
  if (options.mode === 'id') {
    const row = rows.get(options.id);
    if (!row) throw new Error(`${options.id} is absent from its canonical live table; absence is not completion or eligibility`);
    result.tasks = [summarize(row)]; return result;
  }
  // No auto-promotion: WAITING stays WAITING even when its parent is done. The owner opens it.
  const ready = current.filter(row => row.status === 'OPEN');
  ready.sort((a, b) => a.priority.localeCompare(b.priority) || a.sourceLine - b.sourceLine);
  result.tasks = options.mode === 'next' ? ready.slice(0, 1) : ready;
  if (!result.tasks.length) result.note = 'No exact OPEN Next Wave rows in this surface. Inspect the other current directed board/catalog work; do not invent a feature from this result.';
  return result;
}

export function main(argv = process.argv.slice(2)) {
  try {
    const options = parseOptions(argv);
    if (options.help) { console.log(HELP); return 0; }
    const root = options.root ? path.resolve(options.root) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    console.log(JSON.stringify(selectRows(root, options), null, 2));
    return 0;
  } catch (error) {
    console.error(`next-wave-read: ${error.message}`); return 2;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
