#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateEvidenceDocument, formatEvidenceIssue } from '../src/contracts/evidenceSchemas.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const BASE_TAPE_PATH = 'test/47a.inputs.json';
const SCENARIO_PATH = 'src/data/scenarios/47a.scenario.json';
const TACTIC_TICKS = 36120;
const BRANCH_COMMAND_TICK = 36010;
const TRACE_EVENTS = 'combat.*,tether.*,scenario.*,presentation.*';

const baseTape = readJson(BASE_TAPE_PATH);
const scenario = readJson(SCENARIO_PATH);
const branchById = new Map((scenario.branches || []).map((branch) => [branch.id, branch]));
const tempDir = mkdtempSync(join(tmpdir(), 'spaceface-47a-tactics-'));

const tactics = [
  {
    id: 'precision_pilot',
    branchId: 'escape_with_evidence',
    commands: [],
    assert(trace) {
      assert.equal(trace.metrics.tetherAttached, 1, 'precision pilot should keep one Massline attached');
      assert.equal(trace.metrics.tetherBroken, 0, 'precision pilot should preserve the spindle tether');
      assert(trace.metrics.hostileCombatFire > 0, 'precision pilot should survive live hostile pressure');
      assert(trace.metrics.projectileHits > 0, 'precision pilot should land weapon hits');
      assert(trace.combatTrace.events.some((event) =>
        event.kind === 'damage.routed' && event.actorId === 1 && event.targetId === 3),
      'precision pilot should route player weapon damage through combat');
    },
  },
  {
    id: 'momentum_predator',
    branchId: 'destroy_evidence',
    commands: [
      frameCommand(720, combatAction('action_reel', { attachment: 'latestOwned' })),
      frameCommand(722, combatAction('action_sling', { attachment: 'latestOwned' })),
      frameCommand(726, combatAction('action_cut', { attachment: 'latestOwned' })),
    ],
    assert(trace) {
      assert(trace.metrics.tetherReel >= 2, 'momentum predator should tighten the Massline before release');
      assert.equal(trace.metrics.tetherBroken, 1, 'momentum predator should sever the Massline deliberately');
      assert(combatTraceHas(trace, 'physics.impulse', { actionId: 'action_sling' }),
        'momentum predator should route sling impulse through SG-02 physics');
      assert(combatTraceHas(trace, 'attachment.broken', { reason: 'action_cut' }),
        'momentum predator should break the attachment through action_cut');
    },
  },
  {
    id: 'control_specialist',
    branchId: 'surrender_evidence',
    commands: [
      frameCommand(720, combatAction('action_reel', { attachment: 'latestOwned' })),
    ],
    assert(trace) {
      assert(trace.metrics.tetherReel >= 4, 'control specialist should prove controlled Massline tow');
      assert.equal(trace.metrics.tetherBroken, 0, 'control specialist should complete without cutting the Massline');
      assert(!combatTraceHas(trace, 'physics.impulse', { actionId: 'action_sling' }),
        'control specialist should not rely on sling impulse');
      assert(!combatTraceHas(trace, 'attachment.broken', { reason: 'action_cut' }),
        'control specialist should not cut the controlled tether');
    },
  },
  {
    id: 'covert_courier',
    branchId: 'deliver_to_contact',
    livePredicate: true,
    commands: [
      frameCommand(720, combatAction('action_reel', { attachment: 'latestOwned' })),
      frameCommand(900, combatAction('action_sling', { attachment: 'latestOwned' })),
    ],
    assert(trace) {
      assert(trace.metrics.tetherReel >= 4, 'covert courier should keep positive Massline control before diversion');
      assert.equal(trace.metrics.tetherBroken, 0, 'covert courier should preserve the evidence tether for delivery');
      assert(combatTraceHas(trace, 'physics.impulse', { actionId: 'action_sling' }),
        'covert courier should use SG-02 impulse routing without destroying the payload');
      assert(!combatTraceHas(trace, 'attachment.broken', { reason: 'action_cut' }),
        'covert courier should not convert covert delivery into evidence destruction');
    },
  },
];

try {
  const completed = [];
  for (const tactic of tactics) {
    const tapePath = writeTacticTape(tactic);
    const trace = runJson([
      'scripts/sf-sim.mjs',
      'trace',
      '47a',
      '--seed',
      String(baseTape.seed),
      '--ticks',
      String(TACTIC_TICKS),
      '--inputs',
      tapePath,
      '--events',
      TRACE_EVENTS,
      '--limit',
      '520',
      '--physics-backend',
      'rapier-dynamic',
    ]);

    assert.equal(trace.scenarioContract.activeBeatId, 'resolution_branch',
      `${tactic.id} should reach the 47-A resolution beat`);
    assert.equal(trace.scenarioContract.resolvedBranchId, tactic.branchId,
      `${tactic.id} should resolve ${tactic.branchId}`);
    assert.equal(trace.metrics.scenarioBranchResolved, 1,
      `${tactic.id} should emit one branch resolution`);
    assert.equal(trace.metrics.scenarioFactChanged, branchById.get(tactic.branchId).worldFactEffects.length,
      `${tactic.id} should apply all branch fact effects`);
    assert.equal(trace.scenarioContract.resolution.source,
      tactic.livePredicate ? 'live-state' : branchById.get(tactic.branchId).policyId,
      `${tactic.id} should resolve through the expected branch source`);
    if (tactic.livePredicate) {
      assert.equal(trace.scenarioContract.resolution.predicateId, 'predicate.47a.deliver_to_contact.live_state',
        `${tactic.id} should resolve through the authored live-state predicate`);
    }
    assert.equal(trace.metrics.firstTetherAttachTick, 4,
      `${tactic.id} should keep the canonical first Massline attach timing`);
    assert.equal(trace.metrics.combatDamage > 0, true, `${tactic.id} should preserve combat damage proof`);
    assert.equal(trace.metrics.hostileCombatFire > 0, true, `${tactic.id} should preserve hostile pressure proof`);
    assertNoRejectedActions(trace, tactic.id);
    assertBranchFacts(trace, branchById.get(tactic.branchId), tactic.id);
    tactic.assert(trace);
    completed.push({ id: tactic.id, branchId: tactic.branchId, sha256: trace.sha256 });
  }

  assert.equal(new Set(completed.map((item) => item.id)).size, tactics.length,
    '47-A tactic suite should contain distinct tactic IDs');
  assert.equal(new Set(completed.map((item) => item.branchId)).size, tactics.length,
    '47-A tactic suite should complete distinct authored branches');
  assert.equal(new Set(completed.map((item) => item.branchId)).size, branchById.size,
    '47-A tactic suite should cover every authored branch, not only the minimum tactic count');
  for (const branchId of branchById.keys()) {
    assert(completed.some((item) => item.branchId === branchId),
      `47-A tactic suite should include authored branch ${branchId}`);
  }
  console.log(`47-A tactic checks OK (${completed.map((item) => `${item.id}:${item.branchId}`).join(', ')})`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

function writeTacticTape(tactic) {
  const branch = branchById.get(tactic.branchId);
  assert(branch, `${tactic.id} branch should exist: ${tactic.branchId}`);
  const byTick = new Map();
  for (const frame of baseTape.frames || []) {
    if (hasScenarioBranch(frame)) continue;
    byTick.set(frame.tick, {
      tick: frame.tick,
      input: { ...(frame.input || {}) },
      ...(Array.isArray(frame.commands) ? { commands: frame.commands.map((command) => ({ ...command })) } : {}),
    });
  }

  for (const item of tactic.commands) {
    const frame = frameAt(byTick, item.tick);
    const commands = Array.isArray(frame.commands) ? frame.commands.slice() : [];
    commands.push(item.command);
    frame.commands = commands;
  }
  if (!tactic.livePredicate) {
    frameAt(byTick, BRANCH_COMMAND_TICK).commands = [{
      kind: 'scenarioBranch',
      branchId: tactic.branchId,
      source: branch.policyId,
    }];
  }

  const tape = {
    ...baseTape,
    id: `47a-tactic-${tactic.id.replaceAll('_', '-')}`,
    notes: [
      ...(baseTape.notes || []),
      `Generated 47-A tactic policy: ${tactic.id} -> ${tactic.branchId}.`,
    ],
    frames: [...byTick.values()].sort((a, b) => a.tick - b.tick),
  };
  const report = validateEvidenceDocument(tape, { file: `${tape.id}.json` });
  assert(report.ok, report.issues.map(formatEvidenceIssue).join('\n'));
  const path = join(tempDir, `${tactic.id}.json`);
  writeFileSync(path, JSON.stringify(tape, null, 2));
  return path;
}

function frameAt(byTick, tick) {
  if (byTick.has(tick)) return byTick.get(tick);
  const previous = [...byTick.values()].filter((frame) => frame.tick < tick).sort((a, b) => b.tick - a.tick)[0];
  const frame = {
    tick,
    input: { ...((previous && previous.input) || {}) },
  };
  byTick.set(tick, frame);
  return frame;
}

function frameCommand(tick, command) {
  return { tick, command };
}

function combatAction(actionId, options = {}) {
  return {
    kind: 'combatAction',
    actor: 'player_kestrel',
    actionId,
    source: 'player',
    ...(options.target ? { target: options.target } : {}),
    ...(options.attachment ? { attachment: options.attachment } : {}),
  };
}

function assertBranchFacts(trace, branch, tacticId) {
  assert(branch, `${tacticId} should reference a branch`);
  for (const effect of branch.worldFactEffects || []) {
    assert.equal(trace.scenarioContract.factValues[effect.factId], effect.value,
      `${tacticId} should set ${effect.factId} to ${effect.value}`);
  }
  assert.deepEqual(trace.scenarioContract.resolution.lifecycle, branch.lifecycle,
    `${tacticId} should preserve authored lifecycle text`);
}

function assertNoRejectedActions(trace, tacticId) {
  const rejected = trace.combatTrace.events.filter((event) => event.kind === 'action.rejected');
  assert.deepEqual(rejected, [], `${tacticId} should not reject any scripted combat action`);
}

function combatTraceHas(trace, kind, fields = {}) {
  return trace.combatTrace.events.some((event) => {
    if (event.kind !== kind) return false;
    return Object.entries(fields).every(([key, value]) => event[key] === value);
  });
}

function hasScenarioBranch(frame) {
  return (frame.commands || []).some((command) => command && command.kind === 'scenarioBranch');
}

function runJson(args) {
  const stdout = execFileSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 64,
  });
  return JSON.parse(stdout);
}

function readJson(rel) {
  return JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8'));
}
