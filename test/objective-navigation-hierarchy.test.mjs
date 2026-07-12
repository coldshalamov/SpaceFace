import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  objectiveBearingGlyph,
  resolveObjectiveHudLayout,
} from '../src/ui/hud.js';
import {
  activeMapGoal,
  pickMapTargetAt,
} from '../src/ui/galaxyMap.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

function overlaps(a, b) {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

function bearingState(x, z) {
  const player = { id: 1, pos: { x: 0, z: 0 } };
  return {
    playerId: 1,
    entities: new Map([[1, player]]),
    waypoint: { pos: { x, z } },
  };
}

test('goal bearing is an explicit eight-way direction, not an unlabeled color', () => {
  for (const [x, z, glyph] of [
    [0, -100, '↑'], [100, -100, '↗'], [100, 0, '→'], [100, 100, '↘'],
    [0, 100, '↓'], [-100, 100, '↙'], [-100, 0, '←'], [-100, -100, '↖'],
  ]) {
    const { playerId, entities, waypoint } = bearingState(x, z);
    assert.equal(objectiveBearingGlyph({ playerId, entities }, waypoint), glyph);
  }
});

test('1280x720 floor and 1920x1080 target keep objective, vitals, action, and radar disjoint', () => {
  for (const [width, height] of [[1280, 720], [1920, 1080]]) {
    const layout = resolveObjectiveHudLayout(width, height);
    const anchors = [layout.objective, layout.vitals, layout.action, layout.rightDock];
    for (let i = 0; i < anchors.length; i += 1) {
      const a = anchors[i];
      assert.ok(a.x >= 0 && a.y >= 0, `${width}x${height} anchor ${i} starts in viewport`);
      assert.ok(a.x + a.width <= width && a.y + a.height <= height,
        `${width}x${height} anchor ${i} stays in viewport`);
      for (let j = i + 1; j < anchors.length; j += 1) {
        assert.equal(overlaps(a, anchors[j]), false,
          `${width}x${height} anchors ${i}/${j} must not overlap`);
      }
    }
    for (const anchor of anchors) {
      assert.equal(overlaps(anchor, layout.centerSafe), false,
        `${width}x${height} keeps the central playfield clear`);
    }
    const covered = anchors.reduce((sum, r) => sum + r.width * r.height, 0);
    assert.ok(covered / (width * height) < 0.25,
      `${width}x${height} persistent HUD stays under the 25% playfield budget`);
  }
});

test('flight HUD and Mission Log paint one command instead of repeated story/mission stacks', () => {
  const hud = read('../src/ui/hud.js');
  const log = read('../src/ui/screens/missionLog.js');
  const target = read('../src/ui/targetPanel.js');
  assert.match(hud, /one-objective-one-action-one-threat/);
  assert.match(hud, /setDisplay\(objWrap, false\)/,
    'legacy multi-mission HUD list must remain hidden');
  assert.match(hud, /NO GOAL MARKER · TRACK ONE CONTRACT/,
    'untracked contracts must give one explicit recovery action');
  assert.match(hud, /AMBER DIAMOND \/ GOAL/,
    'goal line must name the marker instead of relying on color alone');
  assert.match(hud, /mtWaypointDistance\(state, wp\)/,
    'goal line must include live distance');
  assert.match(hud, /objectiveBearingGlyph\(state, wp\)/,
    'goal line must include direction');
  assert.match(log, /CURRENT ACTION/);
  assert.match(log, /recommendedActions\([^)]*\)\.slice\(0, 1\)/,
    'Mission Log may paint only the highest-priority action');
  assert.match(log, /this\._storyEl\.hidden = true/,
    'long-form story card must not compete beside current action');
  assert.match(log, /if \(!isTracked\) card\.appendChild\(el\('div', 'sf-mlog-next'/,
    'tracked mission verb must not repeat in its detail card');
  assert.match(log, /BRIGHT AMBER DIAMOND = CURRENT GOAL/,
    'Mission Log must explain the exact goal glyph before opening the map');
  assert.match(target, /dataset\.hudSlot = 'current-threat'/,
    'the selected target must own the single current-threat detail slot');
  assert.equal((hud.match(/createTargetPanel\(ctx\)/g) || []).length, 1,
    'flight HUD must mount only one detailed target/threat card');
});

test('tracked goal is brighter and wins map selection over ambient context', () => {
  const state = {
    world: { currentSectorId: 'helios' },
    ui: { trackedMissionId: 'mission-1' },
    nav: {
      route: { legs: [{ from: 'helios', to: 'ceres' }] },
      waypoint: {
        missionId: 'mission-1',
        sectorId: 'ceres',
        label: 'Recovery field',
        markerKind: 'mission-objective',
        pos: { x: 420, z: -180 },
      },
    },
    missions: {
      active: [{ id: 'mission-1', status: 'active', title: 'Recover the sample', destSectorId: 'ceres' }],
    },
  };
  const goal = activeMapGoal(state);
  assert.equal(goal.sectorId, 'ceres');
  assert.equal(goal.missionId, 'mission-1');
  assert.equal(goal.markerKind, 'mission-objective');

  const ambient = { id: 'station', kind: 'station', sx: 100, sy: 100, radiusPx: 20 };
  const goalHit = {
    id: goal.id,
    kind: 'sector',
    objective: true,
    markerKind: goal.markerKind,
    sx: 103,
    sy: 100,
    radiusPx: 27,
  };
  assert.equal(pickMapTargetAt([ambient, goalHit], 100, 100)?.id, 'active-map-goal');
});
