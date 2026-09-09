#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateEvidenceDocument, formatEvidenceIssue } from '../src/contracts/evidenceSchemas.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const BASE_TAPE_PATH = 'test/47a.inputs.json';
const SCENARIO_PATH = 'src/data/scenarios/47a.scenario.json';
const BRANCH_COMMAND_TICK = 36010;
const POLICY_TICKS = 36120;
const RELOAD_AFTER_BRANCH_TICK = 36060;

const baseTape = readJson(BASE_TAPE_PATH);
const scenario = readJson(SCENARIO_PATH);
const envelope = readJson('test/47a.telemetry.expected.json');
const branches = scenario.branches || [];
const tempDir = mkdtempSync(join(tmpdir(), 'spaceface-47a-policy-'));

try {
  const completions = [];
  for (const branch of branches) {
    const tapePath = writePolicyTape(branch);
    const trace = runJson([
      'scripts/sf-sim.mjs',
      'trace',
      '47a',
      '--seed',
      String(baseTape.seed),
      '--ticks',
      String(POLICY_TICKS),
      '--inputs',
      tapePath,
      '--events',
      'scenario.*,presentation.*',
      '--limit',
      '420',
      '--physics-backend',
      'rapier-dynamic',
    ]);

    assert.equal(trace.scenarioContract.activeBeatId, 'resolution_branch',
      `${branch.id} policy should run from the resolution beat`);
    assert.equal(trace.scenarioContract.resolvedBranchId, branch.id,
      `${branch.id} policy should resolve the authored branch`);
    assert.equal(trace.metrics.scenarioBranchResolved, 1,
      `${branch.id} policy should emit one branch resolution`);
    assert.equal(trace.metrics.scenarioFactChanged, branch.worldFactEffects.length,
      `${branch.id} policy should emit one fact change per authored effect`);
    assert.equal(trace.traceSummary.types['scenario:branchResolved'], 1,
      `${branch.id} trace should include branch resolution evidence`);
    assert.equal(trace.traceSummary.types['scenario:factChanged'], branch.worldFactEffects.length,
      `${branch.id} trace should include fact delta evidence`);
    const branchRecord = trace.trace.records.find((record) => record.type === 'scenario:branchResolved'
      && record.payload.branchId === branch.id);
    assert(branchRecord, `${branch.id} trace should carry the branch resolution payload`);
    assert.deepEqual(branchRecord.payload.lifecycle, branch.lifecycle,
      `${branch.id} trace should carry authored lifecycle text`);
    assert.equal(branchRecord.payload.lifecycle.aftermath, branch.lifecycle.aftermath,
      `${branch.id} trace should carry authored aftermath text`);
    assert(trace.trace.records.some((record) => record.type === 'presentation:cue'
      && record.payload.id === 'scenario.branch.resolved'
      && record.payload.sourceEvent === 'scenario:branchResolved'),
    `${branch.id} policy should route branch aftermath through SG-08`);

    const changedFactIds = new Set();
    for (const effect of branch.worldFactEffects) {
      assert.equal(trace.scenarioContract.factValues[effect.factId], effect.value,
        `${branch.id} should set ${effect.factId} to ${effect.value}`);
      changedFactIds.add(effect.factId);
    }
    assert(changedFactIds.size >= 1, `${branch.id} should change at least one immediate world fact`);

    const reloadInspect = runJson([
      'scripts/sf-sim.mjs',
      'inspect',
      '47a',
      '--seed',
      String(baseTape.seed),
      '--tick',
      String(POLICY_TICKS),
      '--inputs',
      tapePath,
      '--reload-at',
      String(RELOAD_AFTER_BRANCH_TICK),
      '--physics-backend',
      'rapier-dynamic',
    ]);
    assert.equal(reloadInspect.metrics.saveReloads, 1, `${branch.id} policy should execute a save/reload after resolution`);
    assert.equal(reloadInspect.scenarioContract.activeBeatId, 'resolution_branch',
      `${branch.id} reload should preserve the resolution beat`);
    assert.equal(reloadInspect.scenarioContract.resolvedBranchId, branch.id,
      `${branch.id} reload should preserve resolved branch`);
    assert.deepEqual(reloadInspect.scenarioContract.resolution.lifecycle, branch.lifecycle,
      `${branch.id} reload should preserve branch lifecycle text`);
    for (const effect of branch.worldFactEffects) {
      assert.equal(reloadInspect.scenarioContract.factValues[effect.factId], effect.value,
        `${branch.id} reload should preserve ${effect.factId} as ${effect.value}`);
    }

    completions.push(branch.id);
  }

  assert(completions.length >= envelope.acceptanceCriteria.policyCompletionCountMin,
    '47-A policy suite should complete the minimum authored policy count');
  assert.equal(completions.length, branches.length, '47-A policy suite should cover every authored branch');
  console.log(`SG-05 branch policy checks OK (${completions.join(', ')})`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

function writePolicyTape(branch) {
  const lastFrame = baseTape.frames[baseTape.frames.length - 1] || { input: {} };
  let wroteBranchFrame = false;
  const frames = baseTape.frames.map((frame) => {
    const commands = (frame.commands || [])
      .filter((command) => command && command.kind !== 'scenarioBranch')
      .map((command) => ({ ...command }));
    const out = {
      tick: frame.tick,
      input: { ...(frame.input || {}) },
      ...(commands.length ? { commands } : {}),
    };
    if (frame.tick === BRANCH_COMMAND_TICK) {
      out.commands = [branchCommand(branch)];
      wroteBranchFrame = true;
    }
    return out;
  });
  if (!wroteBranchFrame) {
    frames.push({
      tick: BRANCH_COMMAND_TICK,
      input: { ...(lastFrame.input || {}) },
      commands: [branchCommand(branch)],
    });
  }

  const tape = {
    ...baseTape,
    id: `47a-policy-${branch.id}`,
    notes: [
      ...(baseTape.notes || []),
      `Generated SG-05 branch policy tape for ${branch.id}.`,
    ],
    frames,
  };
  const report = validateEvidenceDocument(tape, { file: `${tape.id}.json` });
  assert(report.ok, report.issues.map(formatEvidenceIssue).join('\n'));
  const tapePath = join(tempDir, `${branch.id}.json`);
  writeFileSync(tapePath, JSON.stringify(tape, null, 2));
  return tapePath;
}

function branchCommand(branch) {
  return {
    kind: 'scenarioBranch',
    branchId: branch.id,
    source: branch.policyId,
  };
}

function runJson(args) {
  const stdout = execFileSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 32,
  });
  return JSON.parse(stdout);
}

function readJson(rel) {
  return JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8'));
}
