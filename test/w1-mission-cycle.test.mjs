// W1 cycle regression: each ops module must be importable FIRST (no missions.js evaluation
// before it), because the composite spreads them in. The old restored literal spreads fixed the
// clone contract but reintroduced a TDZ whenever an ops module was the entry.
// Run: node --test test/w1-mission-cycle.test.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createGameState } from '../src/core/gameState.js';
import { missions } from '../src/systems/missions.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function importFirst(modulePath, invoke) {
  const script = `import('${modulePath}').then((m) => { ${invoke} }).catch((err) => { console.error(err); process.exit(1); });`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT, encoding: 'utf8', timeout: 30000,
  });
  assert.equal(result.status, 0, `${modulePath} failed as entry:\\n${result.stderr || result.stdout}`);
}

test('missionObjectiveOps imports first and invokes a method', () => {
  importFirst('./src/systems/missionObjectiveOps.js', `
    const ops = m.missionObjectiveOps;
    if (typeof ops._onKill !== 'function') throw new Error('missing _onKill');
    const ok = ops._bookExtrasSatisfied.call({ state: {} }, {});
    if (ok !== true) throw new Error('method did not run');
  `);
});

test('missionStoryOps imports first and invokes a method', () => {
  importFirst('./src/systems/missionStoryOps.js', `
    const ops = m.missionStoryOps;
    const rep = ops._repOf.call({ state: { factions: { faction_mts: { rep: 7 } } } }, 'faction_mts');
    if (rep !== 7) throw new Error('method did not run');
  `);
});

test('missionBoardOps imports first and invokes a method', () => {
  importFirst('./src/systems/missionBoardOps.js', `
    const ops = m.missionBoardOps;
    const needs = ops._boardNeedsStoryBranchIntro.call(
      { state: { story: { beatIndex: 0, flags: {} } } }, {}, { slots: [] });
    if (needs !== false) throw new Error('method did not run');
  `);
});

test('missionSpawningOps imports first and invokes a method', () => {
  importFirst('./src/systems/missionSpawningOps.js', `
    const ops = m.missionSpawningOps;
    const adopted = ops._adoptLiveMissionTargets.call(
      { state: { missions: { active: [] }, entities: new Map() } }, null);
    if (adopted !== 0) throw new Error('method did not run');
  `);
});

test('spread and prototype clones serialize and read rep without init', () => {
  const state = createGameState(9);
  state.missions = {
    boards: {}, active: [], completedLog: [], receipts: [], nextId: 1,
  };
  state.story = { beatIndex: 0, flags: {}, journeyActs: { seen: [], current: null } };
  state.factions = { faction_mts: { rep: 12 } };

  const spread = { ...missions, state };
  assert.equal(spread._repOf('faction_mts'), 12, 'a spread clone reads rep without init');
  const data = spread.serialize();
  assert.ok(data && Array.isArray(data.active), 'a spread clone serializes without init');

  const proto = Object.create(missions);
  proto.state = state;
  assert.equal(proto._repOf('faction_mts'), 12, 'a prototype clone reads rep without init');
  const protoData = proto.serialize();
  assert.ok(protoData && Array.isArray(protoData.active), 'a prototype clone serializes without init');
});
