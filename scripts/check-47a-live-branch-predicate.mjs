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
const LIVE_TICKS = 36120;
const RELOAD_AFTER_LIVE_EVIDENCE_TICK = 12000;
const TRACE_EVENTS = 'combat:actionStarted,combat.*,tether.*,scenario.*,presentation.*';
const LIVE_CASES = [
  {
    id: 'surrender',
    branchId: 'surrender_evidence',
    predicateId: 'predicate.47a.surrender_evidence.live_state',
    commands: [
      frameCommand(720, combatAction('action_reel', { attachment: 'latestOwned' })),
    ],
    requiredActionId: 'action_reel',
    distanceTargetActorId: 'official_recovery_tug',
    forbiddenActionIds: ['action_sling', 'action_cut'],
    expectSlingImpulse: false,
  },
  {
    id: 'deliver',
    branchId: 'deliver_to_contact',
    predicateId: 'predicate.47a.deliver_to_contact.live_state',
    commands: [
      frameCommand(720, combatAction('action_reel', { attachment: 'latestOwned' })),
      frameCommand(900, combatAction('action_sling', { attachment: 'latestOwned' })),
    ],
    requiredActionId: 'action_sling',
    distanceTargetActorId: 'kessler_handoff_beacon',
    forbiddenActionIds: ['action_cut'],
    expectSlingImpulse: true,
  },
];

const baseTape = readJson(BASE_TAPE_PATH);
const scenario = readJson(SCENARIO_PATH);
const branchById = new Map((scenario.branches || []).map((branch) => [branch.id, branch]));
for (const liveCase of LIVE_CASES) {
  assert(branchById.has(liveCase.branchId), `scenario should include ${liveCase.branchId}`);
}

const tempDir = mkdtempSync(join(tmpdir(), 'spaceface-47a-live-branch-'));

try {
  const completed = [];
  for (const liveCase of LIVE_CASES) {
    const tapePath = writeLivePredicateTape(liveCase);
    const trace = runTrace(tapePath);
    assertLivePredicateResolution(trace, `${liveCase.id}:uninterrupted`, liveCase);

    const reloadTrace = runTrace(tapePath, RELOAD_AFTER_LIVE_EVIDENCE_TICK);
    assert.equal(reloadTrace.metrics.saveReloads, 1, `${liveCase.id} live branch predicate check should execute one save/reload`);
    assertLivePredicateResolution(reloadTrace, `${liveCase.id}:reload@${RELOAD_AFTER_LIVE_EVIDENCE_TICK}`, liveCase, {
      afterReload: true,
    });
    assert.equal(reloadTrace.sha256, trace.sha256,
      `${liveCase.id} live branch predicate should survive save/reload without hash drift`);
    completed.push(`${liveCase.branchId}:${liveCase.predicateId}`);
  }

  console.log(`47-A live branch predicates OK (${completed.join(', ')})`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

function writeLivePredicateTape(liveCase) {
  const byTick = new Map();
  for (const frame of baseTape.frames || []) {
    const commands = (frame.commands || [])
      .filter((command) => command && command.kind !== 'scenarioBranch')
      .map((command) => ({ ...command }));
    byTick.set(frame.tick, {
      tick: frame.tick,
      input: { ...(frame.input || {}) },
      ...(commands.length ? { commands } : {}),
    });
  }

  for (const item of liveCase.commands) addCommand(byTick, item.tick, item.command);

  const tape = {
    ...baseTape,
    id: `47a-live-branch-predicate-${liveCase.id}`,
    notes: [
      ...(baseTape.notes || []),
      `Generated no-scenarioBranch tape: ${liveCase.branchId} must resolve from live combat/tether/handoff state.`,
    ],
    frames: [...byTick.values()].sort((a, b) => a.tick - b.tick),
  };
  assertNoScenarioBranch(tape);
  const report = validateEvidenceDocument(tape, { file: `${tape.id}.json` });
  assert(report.ok, report.issues.map(formatEvidenceIssue).join('\n'));
  const path = join(tempDir, `${tape.id}.json`);
  writeFileSync(path, JSON.stringify(tape, null, 2));
  return path;
}

function runTrace(tapePath, reloadAt = null) {
  const args = [
    'scripts/sf-sim.mjs',
    'trace',
    '47a',
    '--seed',
    String(baseTape.seed),
    '--ticks',
    String(LIVE_TICKS),
    '--inputs',
    tapePath,
    '--events',
    TRACE_EVENTS,
    '--limit',
    '700',
    '--physics-backend',
    'rapier-dynamic',
  ];
  if (reloadAt != null) args.push('--reload-at', String(reloadAt));
  return runJson(args);
}

function assertLivePredicateResolution(trace, label, liveCase, options = {}) {
  const branch = branchById.get(liveCase.branchId);
  assert.equal(trace.scenarioContract.activeBeatId, 'resolution_branch',
    `${label} should reach the 47-A resolution beat`);
  assert.equal(trace.scenarioContract.resolvedBranchId, liveCase.branchId,
    `${label} should resolve ${liveCase.branchId} without a scenarioBranch command`);
  assert.equal(trace.scenarioContract.resolution.source, 'live-state',
    `${label} should mark the resolution as live-state`);
  assert.equal(trace.scenarioContract.resolution.predicateId, liveCase.predicateId,
    `${label} should name the live-state predicate`);
  assert.equal(trace.metrics.scenarioBranchResolved, 1,
    `${label} should emit one branch resolution`);
  assert.equal(trace.metrics.scenarioFactChanged, branch.worldFactEffects.length,
    `${label} should apply every authored branch fact effect`);
  assert.equal(trace.metrics.tetherBroken, 0, `${label} should keep the evidence tether intact`);
  assert.equal(trace.traceSummary.types['scenario:branchResolved'], 1,
    `${label} trace should include branch resolution evidence`);
  assert(trace.trace.records.some((record) => record.type === 'combat:actionStarted'
    && record.payload.actionId === liveCase.requiredActionId),
  `${label} trace should include the SG-03 action that unlocked ${liveCase.branchId}`);
  assert(trace.trace.records.some((record) => record.type === 'scenario:branchResolved'
    && record.payload.branchId === liveCase.branchId
    && record.payload.source === 'live-state'),
  `${label} trace should carry live-state branch payload`);

  const conditions = trace.scenarioContract.resolution.predicateEvidence.conditions || [];
  const actionCondition = conditions.find((condition) =>
    condition.kind === 'actionStarted' && condition.actionId === liveCase.requiredActionId);
  assert(actionCondition, `${label} predicate should require ${liveCase.requiredActionId}`);
  assert.equal(actionCondition.targetActorId, 'evidence_spindle_47a',
    `${label} predicate should target the evidence spindle`);
  const attachmentCondition = conditions.find((condition) =>
    condition.kind === 'attachmentActive' && condition.targetActorId === 'evidence_spindle_47a');
  assert(attachmentCondition, `${label} predicate should require an active Massline`);
  assert.equal(attachmentCondition.count, 1,
    `${label} predicate should require a final active player-owned Massline`);
  const distanceCondition = conditions.find((condition) =>
    condition.kind === 'actorDistance' && condition.targetActorId === liveCase.distanceTargetActorId);
  assert(distanceCondition, `${label} predicate should require ${liveCase.distanceTargetActorId} proximity`);
  assert(distanceCondition.distance <= distanceCondition.maxDistance,
    `${label} predicate should prove final handoff proximity`);
  const tetherBreakCondition = conditions.find((condition) =>
    condition.kind === 'eventCount' && condition.eventType === 'tether:broken');
  assert(tetherBreakCondition, `${label} predicate should include no-break evidence`);
  assert.equal(tetherBreakCondition.count, 0,
    `${label} predicate should prove no tether break occurred`);
  for (const actionId of liveCase.forbiddenActionIds || []) {
    const forbidden = conditions.find((condition) =>
      condition.kind === 'eventCount'
      && condition.eventType === 'combat:actionStarted'
      && condition.actionId === actionId
      && condition.count === 0
      && condition.latestTick == null);
    assert(forbidden, `${label} predicate should reject forbidden action ${actionId}`);
  }

  assertNoRejectedActions(trace, label);
  if (liveCase.expectSlingImpulse && !options.afterReload) {
    assert(combatTraceHas(trace, 'physics.impulse', { actionId: 'action_sling' }),
      `${label} should route sling through SG-02 physics`);
  } else {
    assert(!combatTraceHas(trace, 'physics.impulse', { actionId: 'action_sling' }),
      `${label} should not rely on a sling impulse in this evidence path`);
  }
  assert(!combatTraceHas(trace, 'attachment.broken', { reason: 'action_cut' }),
    `${label} should not convert live branch resolution into evidence destruction`);
  for (const effect of branch.worldFactEffects) {
    assert.equal(trace.scenarioContract.factValues[effect.factId], effect.value,
      `${label} should set ${effect.factId} to ${effect.value}`);
  }
}

function addCommand(byTick, tick, command) {
  const frame = frameAt(byTick, tick);
  const commands = Array.isArray(frame.commands) ? frame.commands.slice() : [];
  commands.push(command);
  frame.commands = commands;
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

function assertNoScenarioBranch(tape) {
  const branchCommands = [];
  for (const frame of tape.frames || []) {
    for (const command of frame.commands || []) {
      if (command && command.kind === 'scenarioBranch') branchCommands.push({ tick: frame.tick, branchId: command.branchId });
    }
  }
  assert.deepEqual(branchCommands, [], 'live predicate tape must not contain scenarioBranch commands');
}

function assertNoRejectedActions(trace, label) {
  const rejected = trace.combatTrace.events.filter((event) => event.kind === 'action.rejected');
  assert.deepEqual(rejected, [], `${label} should not reject any scripted combat action`);
}

function combatTraceHas(trace, kind, fields = {}) {
  return trace.combatTrace.events.some((event) => {
    if (event.kind !== kind) return false;
    return Object.entries(fields).every(([key, value]) => event[key] === value);
  });
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
