#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateEvidenceDocument, formatEvidenceIssue } from '../src/contracts/evidenceSchemas.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const tempDir = mkdtempSync(join(tmpdir(), 'spaceface-47a-counter-tether-'));

const probes = [
  {
    id: 'dash',
    tapeId: '47a-live-counter-tether-dash',
    ticks: 90,
    command: {
      kind: 'combatAction',
      actor: 'player_kestrel',
      actionId: 'action_attach',
      target: 'scavenger_thief',
      source: 'player',
    },
    assert(result) {
      assert.equal(result.metrics.enemyActionDash > 0, true, 'SG-06 thief should start action_dash as counter-tether overload');
      assertSg06Action(result, 'action_dash');
      assertEvent(result, 'ai:counterTether', (record) => record.payload && record.payload.kind === 'overload_dash');
    },
  },
  {
    id: 'cut',
    tapeId: '47a-live-counter-tether-cut',
    ticks: 9,
    command: {
      kind: 'combatAction',
      actor: 'scavenger_thief',
      actionId: 'action_attach',
      target: 'evidence_spindle_47a',
      source: 'sg06-probe',
    },
    assert(result) {
      assert.equal(result.metrics.enemyActionCut > 0, true, 'SG-06 thief should start action_cut on its exposed Massline');
      assertSg06Action(result, 'action_cut');
      assertEvent(result, 'ai:counterTether', (record) => record.payload && record.payload.kind === 'line_cut');
      assert(result.combatTrace.events.some((event) =>
        event.kind === 'attachment.broken' && event.reason === 'action_cut'),
      'SG-06 line-cut probe should break the live SG-02 attachment through action_cut');
    },
  },
];

try {
  const completed = [];
  for (const probe of probes) {
    const tapePath = writeTape(probe);
    const result = runJson([
      'scripts/sf-sim.mjs',
      'trace',
      '47a',
      '--seed',
      '47',
      '--ticks',
      String(probe.ticks),
      '--inputs',
      tapePath,
      '--events',
      'combat.*,tether.*,ai.*,scenario.*',
      '--limit',
      '800',
      '--physics-backend',
      'rapier-dynamic',
      '--tactical-ai',
      '--counter-tether-probe',
      probe.id,
    ]);
    assertCore(result, probe.id);
    probe.assert(result);
    completed.push(probe.id);
  }
  console.log(`47-A live counter-tether checks OK (${completed.join(', ')})`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

function writeTape(probe) {
  const tape = {
    schema: 'spaceface.goldenInputTape.v1',
    id: probe.tapeId,
    scenario: '47-A: The Mass Discrepancy',
    seed: 47,
    tickRate: 60,
    notes: [
      `Generated live SG-06 counter-tether probe: ${probe.id}.`,
      'The setup command creates only the Massline precondition; acceptance requires SG-06-origin SG-03 actions.',
    ],
    frames: [
      { tick: 0, input: input() },
      { tick: 2, input: input(), commands: [probe.command] },
      { tick: 60, input: input() },
    ],
  };
  const report = validateEvidenceDocument(tape, { file: `${probe.tapeId}.json` });
  assert(report.ok, report.issues.map(formatEvidenceIssue).join('\n'));
  const path = join(tempDir, `${probe.id}.json`);
  writeFileSync(path, JSON.stringify(tape, null, 2));
  return path;
}

function input() {
  return { moveZ: 0, moveX: 0, boost: false, fire: false, fireGroup: null, aimAngle: 0 };
}

function assertCore(result, probeId) {
  assert.equal(result.schema, 'spaceface.sfSimTraceResult.v1', `${probeId} should return a trace result`);
  assert.equal(result.physicsBackend, 'rapier-dynamic', `${probeId} should use SG-02 dynamic physics`);
  assert.equal(result.tacticalAI, true, `${probeId} should opt into SG-06 tactical AI`);
  assert.equal(result.counterTetherProbe, probeId, `${probeId} should report the active counter-tether probe`);
  assert(result.metrics.systems.includes('tacticalAI'), `${probeId} should run the SG-06 tactical system`);
  assert(result.metrics.systems.includes('aiPorts'), `${probeId} should run production AI ports`);
  assert(result.metrics.systems.includes('aiEncounter'), `${probeId} should run the encounter owner`);
  assert.equal(result.metrics.tetherAttached > 0, true, `${probeId} should create a live Massline attachment`);
  assert.equal(result.metrics.enemyCounterTetherBehavior > 0, true, `${probeId} should count SG-06-origin enemy counterplay`);
  assert(result.metrics.aiPorts && result.metrics.aiPorts.flushedManeuvers > 0,
    `${probeId} should flush SG-06 maneuver requests into SG-02`);
  assert.equal(result.metrics.aiPorts.lastDropReason, null,
    `${probeId} should not drop SG-06 maneuver requests`);
  assert.deepEqual(result.combatTrace.events.filter((event) => event.kind === 'action.rejected'), [],
    `${probeId} should not reject scripted or SG-06 actions`);
}

function assertSg06Action(result, actionId) {
  assert(result.combatTrace.events.some((event) =>
    event.kind === 'action.started'
    && event.actionId === actionId
    && event.source
    && event.source.kind === 'ai'
    && event.source.controllerId === 'sg06'),
  `combat trace should include SG-06-origin ${actionId}`);
}

function assertEvent(result, type, predicate) {
  assert(result.trace.records.some((record) => record.type === type && predicate(record)),
    `event trace should include ${type}`);
}

function runJson(args) {
  const stdout = execFileSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 64,
  });
  return JSON.parse(stdout);
}
