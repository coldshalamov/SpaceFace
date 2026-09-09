import test from 'node:test';
import assert from 'node:assert/strict';

import { SET_PIECE_MISSIONS } from '../src/data/missions.js';
import { runSp1NativeDurationAudit } from '../scripts/check-depth-program-sp1-duration.mjs';

test('SP1 completes every authored route through native objective events inside its deadlines', async () => {
  const report = await runSp1NativeDurationAudit();
  const expectedRoutes = new Set(SET_PIECE_MISSIONS.flatMap((definition) => (
    definition.branches.map((branch) => `${definition.id}/${branch.id}`)
  )));

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.claim, 'native-objective-event audit; modeled travel/action time, not a human playtime claim');
  assert.equal(report.driverShortcutCount, 0, 'the audit source contains no direct settlement invocation');
  assert.equal(report.routes.length, expectedRoutes.size);
  assert.deepEqual(
    new Set(report.routes.map((route) => `${route.archetypeId}/${route.branchId}`)),
    expectedRoutes,
  );

  for (const route of report.routes) {
    assert.equal(route.status, 'completed', `${route.archetypeId}/${route.branchId}`);
    assert.ok(route.elapsedS > 0, `${route.archetypeId}/${route.branchId}: modeled time advances`);
    assert.equal(route.deadlineBreaches, 0, `${route.archetypeId}/${route.branchId}: no deadline breach`);
    assert.equal(route.branchChoiceCount, 1, `${route.archetypeId}/${route.branchId}: one authored choice`);
    assert.equal(route.terminalReceiptCount, 1, `${route.archetypeId}/${route.branchId}: exact-once terminal receipt`);
    assert.ok(route.modeledDistanceU > 0, `${route.archetypeId}/${route.branchId}: authored travel distance`);
    if (route.sectorTransitions > 0) {
      assert.ok(route.nativeEvents.includes('sector:enter'),
        `${route.archetypeId}/${route.branchId}: cross-sector travel emits the native event`);
    }
    assert.ok(route.stageRows.every((stage) => stage.elapsedS > 0 && stage.objectiveElapsedS <= stage.deadlineS),
      `${route.archetypeId}/${route.branchId}: every stage advances time inside its own deadline`);
    assert.ok(route.stageRows.every((stage) => stage.boardApproachS > 0 && stage.boardAccepted === true),
      `${route.archetypeId}/${route.branchId}: every stage returns to its real board before accept`);
  }

  const witnessRoutes = report.routes.filter((route) => route.archetypeId === 'witness_run');
  assert.ok(witnessRoutes.every((route) => route.travelLineCount >= 2),
    'the witness speaks during native travel on both routes');

  const defend = report.routes.find((route) => route.archetypeId === 'hearing' && route.branchId === 'defend');
  assert.equal(defend.combatKillCount, 3, 'defend route resolves its siege screen through three tagged kills');
  assert.ok(defend.nativeEvents.includes('entity:killed'));

  const investigationRoutes = report.routes.filter((route) => route.archetypeId === 'investigation_chain');
  assert.ok(investigationRoutes.every((route) => route.nativeEvents.includes('salvage:completed')),
    'both investigation outcomes physically recover a wreck before the disposition choice');
});
