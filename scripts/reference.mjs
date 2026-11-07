#!/usr/bin/env node
// Versioned determinism references — record | diff | list.
//
// WHY THIS EXISTS
// ---------------
// `test/47a.*.expected.json` are authoritative golden envelopes. They are supposed to change
// only for a deliberate, reviewed gameplay reason, but the repo's historical workflow was to
// hand-edit the hash and paste a paragraph into `notes`. That left no machine-readable history
// and no proof the new envelope was produced by a clean, repeatable run.
//
// This tool makes a re-record an append-only event:
//   test/references/<id>/v1.expected.json   the full envelope
//   test/references/<id>/v1.snapshot.json.gz   the canonical snapshot the envelope describes
//   test/references/<id>/history.jsonl      one line per version (at/hash/prevHash/reason/ticket/...)
//   test/references/<id>/index.json         current version table and run pins
//
// Safety, all enforced before anything is written:
//   * --reason (>= 20 chars) and --ticket are required.
//   * the envelope's seed, input tape and scenario contract must match the run.
//   * sf-sim runs with --hash --repeat <cleanRunCountRequired>; repeat divergence fails.
//   * moved event counts require --events-changed (they are part of the envelope contract).
//   * a failed run, a mismatched inspect hash, or an existing version file never writes.
//
// Commands:
//   node scripts/reference.mjs record --from test/47a.telemetry.save-v23.expected.json \
//     --reason "why this re-record is intentional and reviewed" --ticket Q5 [--id 47a-save-v23] \
//     [--events-changed] [--clean-runs 5] [--ticks 720] [--reload-at 600] [--json]
//   node scripts/reference.mjs diff --id 47a-save-v23 [--from v1] [--to v2|working] [--json]
//   node scripts/reference.mjs list [--id 47a-save-v23] [--json]

import { spawnSync } from 'node:child_process';
import {
  appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync,
} from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const REFERENCE_ROOT = 'test/references';
const ENVELOPE_SCHEMA = 'spaceface.telemetryEnvelope.v1';
const INDEX_SCHEMA = 'spaceface.referenceIndex.v1';

export function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

export function sanitizeId(value) {
  const id = String(value || '').trim();
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(id)) {
    throw new Error(`reference id must match [a-z0-9][a-z0-9._-]{0,63}: ${JSON.stringify(id)}`);
  }
  return id;
}

export function defaultIdFor(envelopePath) {
  return sanitizeId(basename(String(envelopePath), '.expected.json').replace(/[^a-zA-Z0-9._-]+/g, '-').toLowerCase());
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function writeJsonAtomic(file, value) {
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, file);
}

function isoNow(now) {
  const value = typeof now === 'function' ? now() : now;
  return value instanceof Date ? value.toISOString() : new Date(value || Date.now()).toISOString();
}

function gitIdentity(root) {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true });
  const status = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8', windowsHide: true });
  return {
    gitHead: head.status === 0 ? head.stdout.trim() : null,
    dirty: status.status === 0 ? status.stdout.trim().length > 0 : null,
  };
}

export function validateRecordOptions({ envelope, reason, ticket, cleanRuns }) {
  if (!envelope || typeof envelope !== 'object') throw new Error('envelope is required');
  if (envelope.schema !== ENVELOPE_SCHEMA) throw new Error(`envelope schema must be ${ENVELOPE_SCHEMA}`);
  if (!Number.isInteger(envelope.seed)) throw new Error('envelope.seed must be an integer');
  if (!envelope.sourceInputTape) throw new Error('envelope.sourceInputTape is required');
  if (!envelope.sourceScenarioContract) throw new Error('envelope.sourceScenarioContract is required');
  if (!/^[0-9a-f]{64}$/i.test(String(envelope.acceptanceCriteria?.authoritativeHash || ''))) {
    throw new Error('envelope.acceptanceCriteria.authoritativeHash must be a 64-char hex hash');
  }
  const text = String(reason || '').trim();
  if (text.length < 20) throw new Error('--reason must be at least 20 characters');
  if (!String(ticket || '').trim()) throw new Error('--ticket is required');
  const required = envelope.acceptanceCriteria?.cleanRunCountRequired;
  if (required != null && (!Number.isInteger(required) || required < 1)) {
    throw new Error('envelope.acceptanceCriteria.cleanRunCountRequired must be a positive integer');
  }
  if (cleanRuns != null && (!Number.isInteger(cleanRuns) || cleanRuns < 1)) {
    throw new Error('--clean-runs must be a positive integer');
  }
  if (cleanRuns != null && required != null && cleanRuns < required) {
    throw new Error(`--clean-runs ${cleanRuns} is below the envelope's cleanRunCountRequired ${required}`);
  }
  return {
    cleanRunCountRequired: required == null ? 1 : required,
    reason: text,
    ticket: String(ticket).trim(),
  };
}

export function validateRun(run, { envelope, ticks, reloadAt, cleanRuns }) {
  if (!run || typeof run !== 'object') throw new Error('sf-sim returned no JSON result');
  if (run.schema !== 'spaceface.sfSimResult.v1') throw new Error(`unexpected sf-sim schema: ${run.schema}`);
  if (!/^[0-9a-f]{64}$/i.test(String(run.sha256 || ''))) throw new Error('sf-sim result has no 64-char sha256');
  if (run.seed !== envelope.seed) {
    throw new Error(`run seed ${run.seed} does not match envelope seed ${envelope.seed}`);
  }
  if (normalizePath(run.inputTape) !== normalizePath(envelope.sourceInputTape)) {
    throw new Error(`run tape ${run.inputTape} does not match envelope tape ${envelope.sourceInputTape}`);
  }
  if (normalizePath(run.scenarioContract?.source) !== normalizePath(envelope.sourceScenarioContract)) {
    throw new Error(`run scenario ${run.scenarioContract?.source} does not match envelope scenario ${envelope.sourceScenarioContract}`);
  }
  if (run.ticks !== ticks) throw new Error(`run ticks ${run.ticks} does not match requested ${ticks}`);
  if (reloadAt != null && run.reloadAt !== reloadAt) {
    throw new Error(`run reloadAt ${run.reloadAt} does not match requested ${reloadAt}`);
  }
  if (run.repeat !== cleanRuns) throw new Error(`run repeat ${run.repeat} does not match requested ${cleanRuns}`);
  return run;
}

export function compareEventCounts(envelope, traceSummary) {
  const expected = envelope.phase0ObservedTraceCounts || {};
  const observed = traceSummary?.types || {};
  const moved = {};
  for (const [key, count] of Object.entries(expected)) {
    const now = Number(observed[key] || 0);
    if (now !== count) moved[key] = { from: count, to: now };
  }
  return moved;
}

export function flattenLeaves(value, path = '$', out = []) {
  if (value === null || typeof value !== 'object') {
    out.push({ path, value });
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenLeaves(item, `${path}[${index}]`, out));
    return out;
  }
  for (const key of Object.keys(value).sort()) flattenLeaves(value[key], `${path}.${key}`, out);
  return out;
}

export function classifyLeaf(path) {
  if (/\.(?:pos|vel|rot|angVel|prevPos|prevRot|angularVelocity|linvel|angvel)\./.test(path)) return 'motion';
  if (path.startsWith('$.economy')) return 'economy';
  if (path.startsWith('$.physics')) return 'physics';
  if (path.startsWith('$.player')) return 'player';
  if (path.startsWith('$.missions')) return 'missions';
  if (path.startsWith('$.story')) return 'story';
  if (path.startsWith('$.meta')) return 'meta';
  if (path.startsWith('$.input')) return 'input';
  if (path.startsWith('$.scenario')) return 'scenario';
  if (path.startsWith('$.combat')) return 'combat';
  if (path.startsWith('$.entities')) return 'entities';
  return 'other';
}

export function diffSnapshots(before, after) {
  const left = new Map(flattenLeaves(before).map((leaf) => [leaf.path, leaf.value]));
  const right = new Map(flattenLeaves(after).map((leaf) => [leaf.path, leaf.value]));
  const fieldClasses = {};
  const motionDiffs = [];
  const sample = [];
  let changed = 0;
  let added = 0;
  let removed = 0;
  const bump = (kind) => { fieldClasses[kind] = (fieldClasses[kind] || 0) + 1; };
  for (const [path, value] of left) {
    if (!right.has(path)) {
      removed++;
      bump(classifyLeaf(path));
      if (sample.length < 40) sample.push({ path, change: 'removed' });
      continue;
    }
    const next = right.get(path);
    if (Object.is(value, next)) continue;
    changed++;
    const kind = classifyLeaf(path);
    bump(kind);
    const row = { path, before: value, after: next, class: kind };
    if (kind === 'motion') motionDiffs.push(row);
    if (sample.length < 40) sample.push(row);
  }
  for (const path of right.keys()) {
    if (left.has(path)) continue;
    added++;
    bump(classifyLeaf(path));
    if (sample.length < 40) sample.push({ path, change: 'added' });
  }
  return {
    hashEqual: false,
    changed,
    added,
    removed,
    totalDiffs: changed + added + removed,
    fieldClasses,
    motionCount: motionDiffs.length,
    motionDiffs: motionDiffs.slice(0, 40),
    sample,
  };
}

function listVersionFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((name) => /^v(\d+)\.expected\.json$/.exec(name))
    .filter(Boolean)
    .map((match) => ({ version: Number(match[1]), file: match[0] }))
    .sort((a, b) => a.version - b.version);
}

function snapshotFileFor(dir, version) {
  return join(dir, `v${version}.snapshot.json.gz`);
}

function writeSnapshot(dir, version, snapshot) {
  const file = snapshotFileFor(dir, version);
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, gzipSync(JSON.stringify(snapshot)));
  renameSync(tmp, file);
  return basename(file);
}

function readSnapshot(dir, version) {
  const file = snapshotFileFor(dir, version);
  if (!existsSync(file)) return null;
  return JSON.parse(gunzipSync(readFileSync(file)).toString('utf8'));
}

function traceDelta(moved) {
  return moved;
}

function defaultRunSim({ root, envelope, ticks, reloadAt, cleanRuns }) {
  const args = [
    'scripts/sf-sim.mjs', 'run', '47a',
    '--seed', String(envelope.seed),
    '--ticks', String(ticks),
    '--inputs', envelope.sourceInputTape,
    '--hash', '--repeat', String(cleanRuns),
  ];
  if (reloadAt != null) args.push('--reload-at', String(reloadAt));
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  if (result.status !== 0) {
    throw new Error(`sf-sim run failed (exit ${result.status}): ${(result.stderr || result.stdout || '').trim().slice(-2000)}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`sf-sim run returned invalid JSON: ${error.message}`);
  }
}

function defaultRunInspect({ root, envelope, ticks, reloadAt }) {
  const args = [
    'scripts/sf-sim.mjs', 'inspect', '47a',
    '--seed', String(envelope.seed),
    '--tick', String(ticks),
    '--inputs', envelope.sourceInputTape,
  ];
  if (reloadAt != null) args.push('--reload-at', String(reloadAt), '--canonicalize-at', String(reloadAt));
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  if (result.status !== 0) {
    throw new Error(`sf-sim inspect failed (exit ${result.status}): ${(result.stderr || result.stdout || '').trim().slice(-2000)}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`sf-sim inspect returned invalid JSON: ${error.message}`);
  }
}

function buildEnvelope(envelope, { hash, moved, reloadAt, at, ticket, reason, version }) {
  const next = JSON.parse(JSON.stringify(envelope));
  next.acceptanceCriteria = { ...(next.acceptanceCriteria || {}), authoritativeHash: hash };
  if (next.acceptanceCriteria.authoritativeHashByReloadAt && reloadAt != null) {
    next.acceptanceCriteria.authoritativeHashByReloadAt = {
      ...next.acceptanceCriteria.authoritativeHashByReloadAt,
      [String(reloadAt)]: hash,
    };
  }
  if (Object.keys(moved).length) {
    const observed = envelope.phase0ObservedTraceCounts || {};
    next.phase0ObservedTraceCounts = Object.fromEntries(
      Object.keys(observed).map((key) => [key, moved[key] ? moved[key].to : observed[key]]),
    );
  }
  const note = `[reference] v${version} recorded ${at} by scripts/reference.mjs; ticket ${ticket}; `
    + `reason: ${reason}; previous hash: ${envelope.acceptanceCriteria?.authoritativeHash}.`;
  next.notes = [...(Array.isArray(next.notes) ? next.notes : []), note];
  return next;
}

export function recordReference({
  root = ROOT,
  envelope,
  envelopeLabel = 'inline-envelope',
  id,
  reason,
  ticket,
  eventsChanged = false,
  cleanRuns = null,
  ticks = 720,
  reloadAt = 600,
  now = () => new Date(),
  runSim = defaultRunSim,
  runInspect = defaultRunInspect,
  log = () => {},
} = {}) {
  const checked = validateRecordOptions({ envelope, reason, ticket, cleanRuns });
  const referenceId = sanitizeId(id || defaultIdFor(envelopeLabel));
  if (!Number.isInteger(ticks) || ticks < 1) throw new Error('--ticks must be a positive integer');
  if (reloadAt != null && (!Number.isInteger(reloadAt) || reloadAt <= 0 || reloadAt >= ticks)) {
    throw new Error('--reload-at must be greater than 0 and less than --ticks');
  }
  const runs = cleanRuns == null ? checked.cleanRunCountRequired : cleanRuns;
  const dir = resolve(root, REFERENCE_ROOT, referenceId);
  const existing = listVersionFiles(dir);
  const previousVersion = existing.length ? existing[existing.length - 1].version : 0;
  const previousEnvelope = previousVersion
    ? readJson(join(dir, `v${previousVersion}.expected.json`))
    : null;
  const previousSnapshot = previousVersion ? readSnapshot(dir, previousVersion) : null;

  log(`reference ${referenceId}: running ${runs} clean run(s) at seed ${envelope.seed}, ${ticks} ticks${reloadAt != null ? `, reload@${reloadAt}` : ''}`);
  const run = validateRun(
    runSim({ root, envelope, ticks, reloadAt, cleanRuns: runs }),
    { envelope, ticks, reloadAt, cleanRuns: runs },
  );
  const moved = compareEventCounts(envelope, run.traceSummary);
  if (Object.keys(moved).length && !eventsChanged) {
    throw new Error(`event counts moved (${Object.keys(moved).join(', ')}); pass --events-changed after reviewing them`);
  }
  const inspected = runInspect({ root, envelope, ticks, reloadAt });
  if (inspected?.sha256 !== run.sha256) {
    throw new Error(`inspect hash ${inspected?.sha256} does not match the repeat-proved run hash ${run.sha256}`);
  }
  if (!inspected.snapshot || typeof inspected.snapshot !== 'object') {
    throw new Error('inspect returned no canonical snapshot');
  }

  const at = isoNow(now);
  const version = previousVersion + 1;
  const nextEnvelope = buildEnvelope(envelope, {
    hash: run.sha256, moved, reloadAt, at, ticket: checked.ticket, reason: checked.reason, version,
  });
  const hashChanged = run.sha256 !== envelope.acceptanceCriteria?.authoritativeHash;
  let delta;
  if (previousSnapshot) {
    const snapshotDelta = diffSnapshots(previousSnapshot, inspected.snapshot);
    delta = {
      hashChanged,
      previousHash: previousEnvelope.acceptanceCriteria?.authoritativeHash || null,
      newHash: run.sha256,
      ...snapshotDelta,
      traceChanged: traceDelta(moved),
    };
  } else {
    delta = {
      baseline: true,
      hashChanged: false,
      previousHash: null,
      newHash: run.sha256,
      changed: 0, added: 0, removed: 0, totalDiffs: 0,
      fieldClasses: {}, motionCount: 0, motionDiffs: [], sample: [],
      traceChanged: traceDelta(moved),
    };
  }

  // All checks passed. Only now create the directory and write append-only files.
  mkdirSync(dir, { recursive: true });
  const versionFile = join(dir, `v${version}.expected.json`);
  if (existsSync(versionFile)) throw new Error(`refusing to overwrite existing ${versionFile}`);
  const tmpVersion = `${versionFile}.tmp-${process.pid}`;
  writeFileSync(tmpVersion, `${JSON.stringify(nextEnvelope, null, 2)}\n`);
  renameSync(tmpVersion, versionFile);
  const snapshotFile = writeSnapshot(dir, version, inspected.snapshot);

  const historyRow = {
    at, hash: run.sha256,
    prevHash: previousEnvelope?.acceptanceCriteria?.authoritativeHash || envelope.acceptanceCriteria?.authoritativeHash || null,
    reason: checked.reason, ticket: checked.ticket, cleanRuns: runs, delta,
  };
  appendFileSync(join(dir, 'history.jsonl'), `${JSON.stringify(historyRow)}\n`);

  const identity = gitIdentity(root);
  const index = readIndex(root, referenceId);
  const row = {
    version, file: basename(versionFile), snapshotFile, hash: run.sha256,
    at, reason: checked.reason, ticket: checked.ticket, cleanRuns: runs,
    ticks, reloadAt, seed: envelope.seed,
    inputTape: normalizePath(envelope.sourceInputTape),
    scenarioContract: normalizePath(envelope.sourceScenarioContract),
    gitHead: identity.gitHead, dirty: identity.dirty, delta,
  };
  const nextIndex = {
    schema: INDEX_SCHEMA,
    id: referenceId,
    envelope: normalizePath(envelopeLabel),
    createdAt: index?.createdAt || at,
    updatedAt: at,
    versions: [...(index?.versions || []).filter((entry) => entry.version !== version), row].sort((a, b) => a.version - b.version),
    latest: version,
  };
  writeJsonAtomic(join(dir, 'index.json'), nextIndex);
  return { id: referenceId, version, hash: run.sha256, previousHash: historyRow.prevHash, delta, envelope: nextEnvelope, index: nextIndex };
}

function readIndex(root, id) {
  const file = resolve(root, REFERENCE_ROOT, id, 'index.json');
  if (!existsSync(file)) return null;
  const index = readJson(file);
  if (index?.schema !== INDEX_SCHEMA || index.id !== id) throw new Error(`invalid reference index: ${file}`);
  return index;
}

function readVersionEnvelope(root, id, version) {
  const file = resolve(root, REFERENCE_ROOT, id, `v${version}.expected.json`);
  if (!existsSync(file)) throw new Error(`missing reference version: ${file}`);
  return readJson(file);
}

function parseVersion(value) {
  const match = /^v?(\d+)$/.exec(String(value));
  if (!match) throw new Error(`version must look like v1 or 1: ${value}`);
  return Number(match[1]);
}

function versionPin(index, version) {
  const row = index.versions.find((entry) => entry.version === version);
  if (!row) throw new Error(`reference ${index.id} has no version ${version}`);
  return row;
}

export function diffReference({
  root = ROOT, id, from = null, to = 'working', now = () => new Date(),
  runInspect = defaultRunInspect, log = () => {},
} = {}) {
  const index = readIndex(root, sanitizeId(id));
  if (!index) throw new Error(`no reference ${id}; run scripts/reference.mjs list`);
  const versions = index.versions.map((entry) => entry.version);
  if (!versions.length) throw new Error(`reference ${id} has no versions`);
  const latest = versions[versions.length - 1];
  const fromVersion = from == null ? (versions.length > 1 ? versions[versions.length - 2] : latest) : parseVersion(from);
  const fromRow = versionPin(index, fromVersion);
  const fromEnvelope = readVersionEnvelope(root, id, fromVersion);
  const fromSnapshot = readSnapshot(resolve(root, REFERENCE_ROOT, id), fromVersion);
  const fromHash = fromEnvelope.acceptanceCriteria?.authoritativeHash || null;

  let toHash;
  let toSnapshot;
  let toLabel;
  let toRow;
  if (String(to) === 'working') {
    toLabel = 'working';
    toRow = fromRow;
    const inspected = runInspect({
      root, envelope: fromEnvelope, ticks: fromRow.ticks, reloadAt: fromRow.reloadAt,
    });
    toHash = inspected?.sha256 || null;
    toSnapshot = inspected?.snapshot || null;
  } else {
    const toVersion = parseVersion(to);
    toRow = versionPin(index, toVersion);
    const toEnvelope = readVersionEnvelope(root, id, toVersion);
    toHash = toEnvelope.acceptanceCriteria?.authoritativeHash || null;
    toSnapshot = readSnapshot(resolve(root, REFERENCE_ROOT, id), toVersion);
    toLabel = `v${toVersion}`;
  }

  let snapshotDelta = null;
  if (fromSnapshot && toSnapshot) {
    snapshotDelta = diffSnapshots(fromSnapshot, toSnapshot);
    snapshotDelta.hashEqual = fromHash === toHash;
  }
  const identical = fromHash === toHash;
  const report = {
    schema: 'spaceface.referenceDiff.v1',
    id,
    from: { version: fromVersion, hash: fromHash },
    to: { label: toLabel, version: toLabel === 'working' ? null : toRow?.version ?? null, hash: toHash },
    pins: {
      seed: fromRow.seed, ticks: fromRow.ticks, reloadAt: fromRow.reloadAt,
      inputTape: fromRow.inputTape, scenarioContract: fromRow.scenarioContract,
    },
    identical,
    hashDelta: { from: fromHash, to: toHash },
    snapshotDelta,
    note: snapshotDelta ? null : 'one or both versions have no stored snapshot; only hash and envelope deltas are available',
  };
  log(`reference ${id}: v${fromVersion} ${fromHash} -> ${toLabel} ${toHash}`);
  if (identical) log('  IDENTICAL: the recorded canonical hash did not move.');
  else if (snapshotDelta) {
    log(`  MOVED: ${snapshotDelta.totalDiffs} leaf fields (changed ${snapshotDelta.changed}, added ${snapshotDelta.added}, removed ${snapshotDelta.removed})`);
    log(`  motion leaves: ${snapshotDelta.motionCount}`);
    for (const [kind, count] of Object.entries(snapshotDelta.fieldClasses).sort((a, b) => b[1] - a[1])) {
      log(`    ${String(count).padStart(8)}  ${kind}`);
    }
    if (snapshotDelta.motionDiffs.length) {
      log('  first motion leaves:');
      for (const row of snapshotDelta.motionDiffs.slice(0, 8)) {
        log(`    ${row.path}: ${JSON.stringify(row.before)} -> ${JSON.stringify(row.after)}`);
      }
    }
  } else {
    log('  MOVED: hashes differ; no stored snapshot for a field-class delta (re-record a version with this tool).');
  }
  return report;
}

export function listReferences({ root = ROOT, id = null } = {}) {
  const rootDir = resolve(root, REFERENCE_ROOT);
  const ids = existsSync(rootDir)
    ? readdirSync(rootDir).filter((name) => statSync(join(rootDir, name)).isDirectory()).sort()
    : [];
  const selected = id ? [sanitizeId(id)] : ids;
  const references = [];
  for (const referenceId of selected) {
    const index = readIndex(root, referenceId);
    if (!index) {
      references.push({ id: referenceId, error: 'missing index.json' });
      continue;
    }
    const latest = index.versions.find((entry) => entry.version === index.latest);
    references.push({
      id: referenceId,
      envelope: index.envelope,
      latest: index.latest,
      latestHash: latest?.hash || null,
      updatedAt: index.updatedAt,
      versions: index.versions.map((entry) => ({
        version: entry.version, hash: entry.hash, at: entry.at,
        reason: entry.reason, ticket: entry.ticket, cleanRuns: entry.cleanRuns,
      })),
    });
  }
  return references;
}

function availableEnvelopes(root) {
  const testDir = resolve(root, 'test');
  if (!existsSync(testDir)) return [];
  return readdirSync(testDir)
    .filter((name) => /^47a\..*\.expected\.json$/.test(name))
    .sort()
    .map((name) => `test/${name}`);
}

function parseArgs(argv) {
  const command = argv[0] || 'help';
  const options = { command, json: false };
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (arg === '--events-changed') options.eventsChanged = true;
    else if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const value = argv[++i];
      if (value == null) throw new Error(`missing value for ${arg}`);
      options[key] = value;
    } else throw new Error(`unexpected argument: ${arg}`);
  }
  return options;
}

function usage(message = null) {
  if (message) console.error(message);
  console.error(`Usage:
  node scripts/reference.mjs record --from <envelope> --reason <text> --ticket <id> [--id <id>]
      [--events-changed] [--clean-runs N] [--ticks N] [--reload-at N] [--json]
  node scripts/reference.mjs diff --id <id> [--from v1] [--to v2|working] [--json]
  node scripts/reference.mjs list [--id <id>] [--json]
`);
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    usage(error.message);
    process.exitCode = 2;
    return;
  }
  if (options.command === 'help' || options.command === '--help' || options.command === '-h') {
    usage();
    return;
  }
  try {
    if (options.command === 'record') {
      if (!options.from) throw new Error('--from is required');
      const envelopePath = resolve(ROOT, options.from);
      if (!existsSync(envelopePath)) throw new Error(`envelope not found: ${options.from}`);
      const envelope = readJson(envelopePath);
      const result = recordReference({
        root: ROOT,
        envelope,
        envelopeLabel: normalizePath(options.from),
        id: options.id || defaultIdFor(options.from),
        reason: options.reason,
        ticket: options.ticket,
        eventsChanged: options.eventsChanged === true,
        cleanRuns: options.cleanRuns == null ? null : Number(options.cleanRuns),
        ticks: options.ticks == null ? 720 : Number(options.ticks),
        reloadAt: options.reloadAt == null ? 600 : Number(options.reloadAt),
        log: options.json ? (line) => process.stderr.write(`${line}\n`) : (line) => console.log(line),
      });
      if (options.json) process.stdout.write(`${JSON.stringify({ schema: 'spaceface.referenceRecordResult.v1', ...result }, null, 2)}\n`);
      else {
        console.log(`  wrote v${result.version}  ${result.hash}`);
        console.log(`  envelope: test/references/${result.id}/v${result.version}.expected.json`);
        console.log(`  history:  test/references/${result.id}/history.jsonl`);
        if (result.delta?.totalDiffs != null && !result.delta.baseline) {
          console.log(`  delta:    ${result.delta.totalDiffs} leaves (motion ${result.delta.motionCount})`);
        }
      }
    } else if (options.command === 'diff') {
      if (!options.id) throw new Error('--id is required');
      const report = diffReference({
        root: ROOT, id: options.id, from: options.from || null, to: options.to || 'working',
        log: options.json ? () => {} : (line) => console.log(line),
      });
      if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      process.exitCode = report.identical ? 0 : 1;
    } else if (options.command === 'list') {
      const references = listReferences({ root: ROOT, id: options.id || null });
      if (options.json) process.stdout.write(`${JSON.stringify({ schema: 'spaceface.referenceList.v1', references }, null, 2)}\n`);
      else if (!references.length) {
        console.log('No references recorded. Available envelopes:');
        for (const envelope of availableEnvelopes(ROOT)) console.log(`  ${envelope}`);
        console.log('\nRecord one with: npm run ref:record -- --from <envelope> --reason "..." --ticket <id>');
      } else {
        for (const reference of references) {
          if (reference.error) { console.log(`${reference.id}: ${reference.error}`); continue; }
          console.log(`${reference.id}  latest v${reference.latest}  ${reference.latestHash}`);
          console.log(`  envelope: ${reference.envelope}  updated: ${reference.updatedAt}`);
          for (const version of reference.versions) {
            console.log(`  v${version.version}  ${version.hash}  ${version.at}  [${version.ticket}] ${version.reason}`);
          }
        }
      }
    } else {
      usage(`unknown command: ${options.command}`);
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(error.message || String(error));
    process.exitCode = 2;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
