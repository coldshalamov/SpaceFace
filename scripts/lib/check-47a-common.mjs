import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateEvidenceDocument, formatEvidenceIssue } from '../../src/contracts/evidenceSchemas.js';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const BASE_TAPE_PATH = 'test/47a.inputs.json';
export const SCENARIO_PATH = 'src/data/scenarios/47a.scenario.json';

export function readJson(relPath) {
  return JSON.parse(readFileSync(join(ROOT, relPath), 'utf8'));
}

export function readScenarioContract() {
  return readJson(SCENARIO_PATH);
}

export function runJson(args) {
  const stdout = execFileSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 64,
  });
  return JSON.parse(stdout);
}

export function runSfSim(args) {
  return runJson(['scripts/sf-sim.mjs', ...args]);
}

export function runTrace({
  ticks,
  inputPath = BASE_TAPE_PATH,
  events = 'combat:actionStarted,combat.*,tether.*,scenario.*',
  limit = 400,
  physicsBackend = 'rapier-dynamic',
  tacticalAI = false,
  counterTetherProbe = null,
  reloadAt = null,
} = {}) {
  const args = [
    'trace',
    '47a',
    '--seed',
    '47',
    '--ticks',
    String(ticks),
    '--inputs',
    inputPath,
    '--events',
    events,
    '--limit',
    String(limit),
    '--physics-backend',
    physicsBackend,
  ];
  if (tacticalAI) args.push('--tactical-ai');
  if (counterTetherProbe) args.push('--counter-tether-probe', counterTetherProbe);
  if (reloadAt != null) args.push('--reload-at', String(reloadAt));
  return runSfSim(args);
}

export function runInspect({
  tick,
  inputPath = BASE_TAPE_PATH,
  physicsBackend = 'rapier-dynamic',
  reloadAt = null,
} = {}) {
  const args = [
    'inspect',
    '47a',
    '--seed',
    '47',
    '--tick',
    String(tick),
    '--inputs',
    inputPath,
    '--physics-backend',
    physicsBackend,
  ];
  if (reloadAt != null) args.push('--reload-at', String(reloadAt));
  return runSfSim(args);
}

export function execNodeScript(scriptPath) {
  return execFileSync(process.execPath, [scriptPath], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 64,
  });
}

export function actorById(contract, id) {
  const actor = (contract.actors || []).find((entry) => entry.id === id);
  assert(actor, `47-A contract should include actor ${id}`);
  return actor;
}

export function beatById(contract, id) {
  const beat = (contract.beats || []).find((entry) => entry.id === id);
  assert(beat, `47-A contract should include beat ${id}`);
  return beat;
}

export function branchById(contract, id) {
  const branch = (contract.branches || []).find((entry) => entry.id === id);
  assert(branch, `47-A contract should include branch ${id}`);
  return branch;
}

export function proofMetricById(contract, id) {
  const metric = (contract.proofMetrics || []).find((entry) => entry.id === id);
  assert(metric, `47-A contract should include proof metric ${id}`);
  return metric;
}

export function entityByActorId(result, actorId) {
  const entity = (result.snapshot?.entities || []).find((entry) => entry.data?.scenarioActorId === actorId);
  assert(entity, `47-A inspect snapshot should include actor entity ${actorId}`);
  return entity;
}

export function physicsBodyByEntityId(result, entityId) {
  const body = (result.snapshot?.physics?.bodies || []).find((entry) => entry.id === entityId);
  assert(body, `47-A inspect snapshot should include physics body ${entityId}`);
  return body;
}

export function assertIncludesAll(actual, expected, label) {
  const set = new Set(actual || []);
  for (const item of expected) {
    assert(set.has(item), `${label} should include ${item}`);
  }
}

export function assertBeatEntered(result, beatId) {
  assert((result.scenarioContract?.enteredBeatIds || []).includes(beatId),
    `47-A sim should enter beat ${beatId}`);
}

export function assertNoRejectedActions(result, label = '47-A trace') {
  const rejected = (result.combatTrace?.events || []).filter((event) => event.kind === 'action.rejected');
  assert.deepEqual(rejected, [], `${label} should not reject scripted combat actions`);
}

export function combatTraceHas(result, kind, fields = {}) {
  return (result.combatTrace?.events || []).some((event) => {
    if (event.kind !== kind) return false;
    return Object.entries(fields).every(([key, value]) => event[key] === value);
  });
}

export function traceHas(result, type, predicate = () => true) {
  return (result.trace?.records || []).some((record) => record.type === type && predicate(record));
}

export function makeCombatCommand({ actor = 'player_kestrel', actionId, source = 'player', target = null, attachment = null }) {
  return {
    kind: 'combatAction',
    actor,
    actionId,
    source,
    ...(target == null ? {} : { target }),
    ...(attachment == null ? {} : { attachment }),
  };
}

export function writeTapeWithCommands({ id, notes = [], commands = [], dropScenarioBranches = false }) {
  const baseTape = readJson(BASE_TAPE_PATH);
  const byTick = new Map();
  for (const frame of baseTape.frames || []) {
    const frameCommands = (frame.commands || [])
      .filter((command) => !(dropScenarioBranches && command && command.kind === 'scenarioBranch'))
      .map((command) => ({ ...command }));
    byTick.set(frame.tick, {
      tick: frame.tick,
      input: { ...(frame.input || {}) },
      ...(frameCommands.length ? { commands: frameCommands } : {}),
    });
  }
  for (const item of commands) {
    const frame = frameAt(byTick, item.tick);
    frame.commands = [...(frame.commands || []), item.command];
  }
  const tape = {
    ...baseTape,
    id,
    notes: [...(baseTape.notes || []), ...notes],
    frames: [...byTick.values()].sort((a, b) => a.tick - b.tick),
  };
  const report = validateEvidenceDocument(tape, { file: `${id}.json` });
  assert(report.ok, report.issues.map(formatEvidenceIssue).join('\n'));
  const tempDir = mkdtempSync(join(tmpdir(), `${id}-`));
  const path = join(tempDir, `${id}.json`);
  writeFileSync(path, JSON.stringify(tape, null, 2));
  return {
    path,
    cleanup: () => rmSync(tempDir, { recursive: true, force: true }),
  };
}

function frameAt(byTick, tick) {
  if (byTick.has(tick)) return byTick.get(tick);
  const previous = [...byTick.values()]
    .filter((frame) => frame.tick < tick)
    .sort((a, b) => b.tick - a.tick)[0];
  const frame = {
    tick,
    input: { ...((previous && previous.input) || {}) },
  };
  byTick.set(tick, frame);
  return frame;
}
