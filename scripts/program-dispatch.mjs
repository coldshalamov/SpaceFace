#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const QUEUE_PATH = path.join(ROOT, 'design/program/roadmap/program-queue.json');
const ACTIVE_DIR = path.join(ROOT, 'design/program/roadmap/active');
const TERMINAL_DEPENDENCY_STATES = new Set(['integrated', 'historical']);
const NON_DISPATCH_STATES = new Set(['integrated', 'historical', 'deferred']);

function fail(message, code = 2) {
  console.error(`program-dispatch: ${message}`);
  process.exit(code);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`cannot read ${path.relative(ROOT, file)} (${error.message})`);
  }
}

function queueRows(parsed) {
  const rows = Array.isArray(parsed)
    ? parsed
    : (parsed.queue || parsed.items || parsed.packets || parsed.tasks);
  if (!Array.isArray(rows)) fail('queue has no array at queue/items/packets/tasks');
  return rows;
}

function packetPath(id) {
  const rel = `design/program/roadmap/active/${id}.md`;
  return fs.existsSync(path.join(ROOT, rel)) ? rel : null;
}

function packetMetadata(rel) {
  if (!rel) return {};
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const read = (key) => text.match(new RegExp(`^${key}:\\s*([^\\n#]+)`, 'm'))?.[1]?.trim() || null;
  return {
    lifecycle: read('lifecycle'),
    acceptance: read('acceptance'),
    owner: read('owner'),
    packetRevision: read('packetRevision'),
  };
}

function summarize(row, byId) {
  const activePacket = packetPath(row.id);
  const meta = packetMetadata(activePacket);
  const dependencies = (row.dependsOn || []).map((id) => ({
    id,
    legacyQueueState: byId.get(id)?.state || 'missing',
    satisfied: TERMINAL_DEPENDENCY_STATES.has(byId.get(id)?.state),
  }));

  return {
    id: row.id,
    priority: row.priority ?? null,
    title: row.title || null,
    legacyQueueState: row.state || null,
    packetLifecycle: meta.lifecycle,
    packetAcceptance: meta.acceptance,
    packetOwner: meta.owner,
    packetRevision: meta.packetRevision,
    dependencyGateSatisfied: dependencies.every((entry) => entry.satisfied),
    dependencies,
    mutexes: row.mutexes || [],
    activePacket,
    checks: row.checks || [],
    evidence: row.evidence || [],
    sources: row.sources || [],
    brief: row.brief || null,
    hasPartialLanding: Boolean(row.partialIntegration || row.integrationNote),
    receipt: row.receipt || row.acceptanceRef || null,
    caution: 'Dependency-ready is not claim-ready. Re-read design/program/NOW.md and the active packet entry conditions before mutation. The queue state field is legacy combined state; do not infer route or milestone acceptance from it.',
  };
}

function usage() {
  console.log(`Usage:
  node scripts/program-dispatch.mjs --next
  node scripts/program-dispatch.mjs --id PQ-018
  node scripts/program-dispatch.mjs --list

Outputs a compact JSON dispatch record. It intentionally omits integration narratives and test transcripts.`);
}

const parsed = readJson(QUEUE_PATH);
const rows = queueRows(parsed);
const byId = new Map(rows.map((row) => [row.id, row]));
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  usage();
  process.exit(0);
}

if (args.includes('--list')) {
  const summaries = rows
    .filter((row) => packetPath(row.id))
    .sort((a, b) => (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER))
    .map((row) => summarize(row, byId));
  console.log(JSON.stringify(summaries, null, 2));
  process.exit(0);
}

const idIndex = args.indexOf('--id');
if (idIndex >= 0) {
  const id = args[idIndex + 1];
  if (!id) fail('--id requires a packet ID');
  const row = byId.get(id);
  if (!row) fail(`unknown packet ${id}`);
  console.log(JSON.stringify(summarize(row, byId), null, 2));
  process.exit(0);
}

if (args.includes('--next') || args.length === 0) {
  const row = rows
    .filter((candidate) => packetPath(candidate.id))
    .filter((candidate) => !NON_DISPATCH_STATES.has(candidate.state))
    .filter((candidate) => packetMetadata(packetPath(candidate.id)).lifecycle !== 'blocked')
    .filter((candidate) => (candidate.dependsOn || []).every((id) => TERMINAL_DEPENDENCY_STATES.has(byId.get(id)?.state)))
    .sort((a, b) => (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER))[0];
  if (!row) fail('no dependency-ready active packet found', 1);
  console.log(JSON.stringify(summarize(row, byId), null, 2));
  process.exit(0);
}

usage();
fail(`unknown arguments: ${args.join(' ')}`);
