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
      // The 960-mass spindle on a long line is a tumbling binary under the post-Package-E
      // rigid-body model; repeated reels gather it tight against the hull so the ship can
      // actually ferry it to the tug's handoff point (2026-09-29).
      frameCommand(720, combatAction('action_reel', { attachment: 'latestOwned' })),
      frameCommand(820, combatAction('action_reel', { attachment: 'latestOwned' })),
      frameCommand(920, combatAction('action_reel', { attachment: 'latestOwned' })),
      frameCommand(1020, combatAction('action_reel', { attachment: 'latestOwned' })),
    ],
    // resolution_branch only unlocks ~t36000 (beat 600s), so the live predicate evaluates in a
    // ~120-tick window there; the tug relocates to (815,95) at recovery_tug entry ~t16250. The
    // ferry times the spindle's passage for the window: a short +1 turn onto the measured
    // bearing from the post-contact drift position (~+0.16 rad from (481,41)), then a 4.6%
    // throttle tow. Full throttle snaps the Massline and outruns the 960-mass payload; the
    // fractional moveZ keeps the tow at ~5 WU/s so the spindle sits ~90-99 WU out across the
    // whole window. Retuned 2026-09-30: eb1869826's solid contacts changed the scripted
    // approach drift, and the previous 2026-09-29 bearing/throttle pair ended ~220 WU out.
    inputFrames: [
      inputFrame(31980, { turnIntent: 1 }),
      inputFrame(31984, { turnIntent: 0 }),
      inputFrame(32010, { moveZ: 0.046 }),
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
      frameCommand(820, combatAction('action_reel', { attachment: 'latestOwned' })),
      frameCommand(900, combatAction('action_sling', { attachment: 'latestOwned' })),
      frameCommand(1020, combatAction('action_reel', { attachment: 'latestOwned' })),
    ],
    // Ferry to the handoff beacon (160 WU window at (780,320), open only when
    // resolution_branch enters ~t36000): an 18-tick +1 turn onto the measured ~0.75 rad
    // bearing from the post-contact park position (481,39), then a 7.5% fractional-throttle
    // tow. The spindle crosses into the window ~35 WU out from the parked tow and sits
    // 125-142 WU from the beacon across the whole window. Retuned 2026-09-30: eb1869826's
    // solid contacts moved the scripted park position and the 2026-09-29 pair fell ~180 out.
    inputFrames: [
      inputFrame(33080, { turnIntent: 1 }),
      inputFrame(33098, { turnIntent: 0 }),
      inputFrame(33100, { moveZ: 0.075 }),
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
    // 2026-09-29: the byte-exact sha256 compare is retired. Under the landed physics packages
    // (C..F) the rapier-dynamic authority is rebuilt from entity state on load and its solver
    // warm-start micro-state is not serialized, so a mid-tension reload resumes a few 1e-1 WU
    // divergent and the event-stream hash can never match an uninterrupted run. The contract
    // that matters — the live predicate surviving a save/reload with identical semantics — is
    // asserted below: same branch, same live-state source, same predicate, same fact effects.
    assert.equal(reloadTrace.scenarioContract.resolvedBranchId, trace.scenarioContract.resolvedBranchId,
      `${liveCase.id} reload should resolve the same branch as the uninterrupted run`);
    assert.deepEqual(reloadTrace.scenarioContract.factValues, trace.scenarioContract.factValues,
      `${liveCase.id} reload should apply identical world-fact effects`);
    assert.equal(reloadTrace.scenarioContract.resolution.predicateId,
      trace.scenarioContract.resolution.predicateId,
      `${liveCase.id} reload should resolve through the same live-state predicate`);
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

  for (const item of liveCase.inputFrames || []) {
    const frame = frameAt(byTick, item.tick);
    frame.input = { ...(frame.input || {}), ...item.input };
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

function inputFrame(tick, input) {
  return { tick, input };
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
