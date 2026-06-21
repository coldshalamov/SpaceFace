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
const LIVE_BRANCH_ID = 'deliver_to_contact';
const LIVE_PREDICATE_ID = 'predicate.47a.deliver_to_contact.live_state';

const baseTape = readJson(BASE_TAPE_PATH);
const scenario = readJson(SCENARIO_PATH);
const branch = (scenario.branches || []).find((item) => item.id === LIVE_BRANCH_ID);
assert(branch, `scenario should include ${LIVE_BRANCH_ID}`);

const tempDir = mkdtempSync(join(tmpdir(), 'spaceface-47a-live-branch-'));

try {
  const tapePath = writeLivePredicateTape();
  const trace = runTrace(tapePath);
  assertLivePredicateResolution(trace, 'uninterrupted', { expectCombatTraceImpulse: true });

  const reloadTrace = runTrace(tapePath, RELOAD_AFTER_LIVE_EVIDENCE_TICK);
  assert.equal(reloadTrace.metrics.saveReloads, 1, 'live branch predicate check should execute one save/reload');
  assertLivePredicateResolution(reloadTrace, `reload@${RELOAD_AFTER_LIVE_EVIDENCE_TICK}`, { expectCombatTraceImpulse: false });
  assert.equal(reloadTrace.sha256, trace.sha256,
    'live branch predicate should survive save/reload without hash drift');

  console.log(`47-A live branch predicate OK (${LIVE_BRANCH_ID}, ${LIVE_PREDICATE_ID})`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

function writeLivePredicateTape() {
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

  addCommand(byTick, 720, combatAction('action_reel', { attachment: 'latestOwned' }));
  addCommand(byTick, 900, combatAction('action_sling', { attachment: 'latestOwned' }));

  const tape = {
    ...baseTape,
    id: '47a-live-branch-predicate-deliver-to-contact',
    notes: [
      ...(baseTape.notes || []),
      'Generated no-scenarioBranch tape: covert courier must resolve from live combat/tether/handoff state.',
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

function assertLivePredicateResolution(trace, label, options = {}) {
  assert.equal(trace.scenarioContract.activeBeatId, 'resolution_branch',
    `${label} should reach the 47-A resolution beat`);
  assert.equal(trace.scenarioContract.resolvedBranchId, LIVE_BRANCH_ID,
    `${label} should resolve ${LIVE_BRANCH_ID} without a scenarioBranch command`);
  assert.equal(trace.scenarioContract.resolution.source, 'live-state',
    `${label} should mark the resolution as live-state`);
  assert.equal(trace.scenarioContract.resolution.predicateId, LIVE_PREDICATE_ID,
    `${label} should name the live-state predicate`);
  assert.equal(trace.metrics.scenarioBranchResolved, 1,
    `${label} should emit one branch resolution`);
  assert.equal(trace.metrics.scenarioFactChanged, branch.worldFactEffects.length,
    `${label} should apply every authored branch fact effect`);
  assert.equal(trace.metrics.tetherBroken, 0, `${label} should keep the evidence tether intact`);
  assert.equal(trace.traceSummary.types['scenario:branchResolved'], 1,
    `${label} trace should include branch resolution evidence`);
  assert(trace.trace.records.some((record) => record.type === 'combat:actionStarted'
    && record.payload.actionId === 'action_sling'),
  `${label} trace should include the SG-03 action that unlocked covert delivery`);
  assert(trace.trace.records.some((record) => record.type === 'scenario:branchResolved'
    && record.payload.branchId === LIVE_BRANCH_ID
    && record.payload.source === 'live-state'),
  `${label} trace should carry live-state branch payload`);

  const conditionByKind = new Map((trace.scenarioContract.resolution.predicateEvidence.conditions || [])
    .map((condition) => [condition.kind, condition]));
  assert.equal(conditionByKind.get('actionStarted').actionId, 'action_sling',
    `${label} predicate should require the live sling action`);
  assert.equal(conditionByKind.get('actionStarted').targetActorId, 'evidence_spindle_47a',
    `${label} predicate should target the evidence spindle`);
  assert.equal(conditionByKind.get('attachmentActive').count, 1,
    `${label} predicate should require a final active player-owned Massline`);
  assert.equal(conditionByKind.get('actorDistance').targetActorId, 'kessler_handoff_beacon',
    `${label} predicate should require the authored handoff beacon`);
  assert(conditionByKind.get('actorDistance').distance <= conditionByKind.get('actorDistance').maxDistance,
    `${label} predicate should prove final handoff proximity`);
  assert.equal(conditionByKind.get('eventCount').count, 0,
    `${label} predicate should prove no tether break occurred`);

  assertNoRejectedActions(trace, label);
  if (options.expectCombatTraceImpulse) {
    assert(combatTraceHas(trace, 'physics.impulse', { actionId: 'action_sling' }),
      `${label} should route sling through SG-02 physics`);
  }
  assert(!combatTraceHas(trace, 'attachment.broken', { reason: 'action_cut' }),
    `${label} should not convert covert delivery into evidence destruction`);
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
