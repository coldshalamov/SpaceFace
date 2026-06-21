#!/usr/bin/env node
// SpaceFace agent CLI skeleton (SG-07). Every command emits versioned JSON so agents can consume
// results without scraping human logs.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { validateShipAsset } from '../src/contracts/assetValidation.js';
import { validateEvidenceCorpus } from '../src/contracts/evidenceSchemas.js';
import { formatScenarioIssue, validateScenarioDocument } from '../src/contracts/scenarioSchemas.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const command = args.shift() || 'help';

if (command === 'help' || command === '--help' || command === '-h') usage(0);

if (command === 'validate') {
  runValidate(args);
} else if (['run', 'inspect', 'compare', 'trace', 'profile'].includes(command)) {
  runSimCommand(command, command, args);
} else if (command === 'replay') {
  const action = args.shift() || '';
  if (action !== 'verify') usage(1, 'Usage: node scripts/sf.mjs replay verify [47a|test/47a.inputs.json] [...sf-sim run args]');
  runSimCommand(command, 'run', normalizeScenarioOrTapeArgs(args), { action });
} else if (command === 'diff') {
  const diffKind = args.shift() || '';
  if (diffKind !== 'replay') usage(1, 'Usage: node scripts/sf.mjs diff replay [47a|test/47a.inputs.json] [...sf-sim compare args]');
  runSimCommand(command, 'compare', normalizeScenarioOrTapeArgs(args), { diffKind });
} else {
  usage(1, `Unknown command: ${command}`);
}

function runValidate(validateArgs) {
  if (validateArgs[0] === 'asset') {
    return runValidateAsset(validateArgs.slice(1));
  }
  if (validateArgs[0] === 'scenario') {
    return runValidateScenario(validateArgs.slice(1));
  }

  const paths = validateArgs.filter((arg) => !arg.startsWith('--'));
  if (paths.length === 0) {
    paths.push('test/47a.inputs.json', 'test/47a.telemetry.expected.json', 'src/data/scenarios/47a.scenario.json');
  }

  const entries = paths.map((path) => readJsonEntry(path));
  const validation = validateEvidenceCorpus(entries);
  const result = {
    schema: 'spaceface.sfCliResult.v1',
    ok: validation.ok,
    command: 'validate',
    result: validation,
  };

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(validation.ok ? 0 : 1);
}

function runValidateScenario(scenarioArgs) {
  const scenarioPath = scenarioArgs.find((arg) => !arg.startsWith('--')) || 'src/data/scenarios/47a.scenario.json';
  const entry = readJsonEntry(scenarioPath);
  const validation = entry.error
    ? {
        schema: 'spaceface.scenarioValidationResult.v1',
        ok: false,
        documentSchema: null,
        issueCount: 1,
        issues: [{ file: scenarioPath.replace(/\\/g, '/'), path: '$', rule: 'parse', message: entry.error }],
      }
    : validateScenarioDocument(entry.data, { file: scenarioPath });
  const result = {
    schema: 'spaceface.sfCliResult.v1',
    ok: validation.ok,
    command: 'validate',
    validateKind: 'scenario',
    result: validation,
  };
  if (!validation.ok) result.stderr = validation.issues.map(formatScenarioIssue).join('\n');
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(validation.ok ? 0 : 1);
}

function runValidateAsset(assetArgs) {
  const assetPath = assetArgs.find((arg) => !arg.startsWith('--')) || 'assets/ships/kestrel/kestrel_reference.glb';
  const validation = validateShipAsset(assetPath, { root: ROOT });
  const result = {
    schema: 'spaceface.sfCliResult.v1',
    ok: validation.ok,
    command: 'validate',
    validateKind: 'asset',
    result: validation,
  };
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(validation.ok ? 0 : 1);
}

function runSimCommand(cliCommand, simCommand, simArgs, extra = {}) {
  const child = spawnSync(process.execPath, [resolve(ROOT, 'scripts/sf-sim.mjs'), simCommand, ...simArgs], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  const parsed = parseJson(child.stdout);
  const ok = !child.error && child.status === 0 && !!parsed && parsed.ok !== false;
  const result = {
    schema: 'spaceface.sfCliResult.v1',
    ok,
    command: cliCommand,
    ...extra,
    forwardedCommand: simCommand,
    exitCode: child.status == null ? 1 : child.status,
    result: parsed,
  };
  if (child.error) result.error = child.error.message || String(child.error);
  if (!parsed && child.stdout) result.stdout = child.stdout.trim();
  if (child.stderr) result.stderr = child.stderr.trim();
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(ok ? 0 : (child.status || 1));
}

function normalizeScenarioOrTapeArgs(rawArgs) {
  const first = rawArgs[0] || '';
  if (!first || first.startsWith('--')) return ['47a', ...rawArgs];
  if (first === '47a') return rawArgs;
  return ['47a', '--inputs', first, ...rawArgs.slice(1)];
}

function readJsonEntry(path) {
  const rel = path.replace(/\\/g, '/');
  try {
    return {
      path: rel,
      data: JSON.parse(readFileSync(resolve(ROOT, path), 'utf8')),
    };
  } catch (err) {
    return {
      path: rel,
      error: err && err.message ? err.message : String(err),
    };
  }
}

function parseJson(text) {
  if (!text || !text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function usage(code, message) {
  if (message) process.stderr.write(message + '\n');
  process.stderr.write('Usage:\n');
  process.stderr.write('  node scripts/sf.mjs validate [test/47a.inputs.json test/47a.telemetry.expected.json src/data/scenarios/47a.scenario.json]\n');
  process.stderr.write('  node scripts/sf.mjs validate asset assets/ships/kestrel/kestrel_reference.glb\n');
  process.stderr.write('  node scripts/sf.mjs validate scenario src/data/scenarios/47a.scenario.json\n');
  process.stderr.write('  node scripts/sf.mjs run|inspect|compare|trace|profile 47a [...sf-sim args]\n');
  process.stderr.write('  node scripts/sf.mjs replay verify [47a|test/47a.inputs.json] [...sf-sim run args]\n');
  process.stderr.write('  node scripts/sf.mjs diff replay [47a|test/47a.inputs.json] [...sf-sim compare args]\n');
  process.exit(code);
}
