import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REDUCED_MOTION_INFORMATION_CUES,
  buildReducedMotionContactCue,
} from '../src/ui/reducedMotionInformation.js';
import { blockedOutputAlertText, applyBlockedOutputMachine } from '../src/ui/alerts.js';
import { buildDamageIndicatorCue } from '../src/ui/damageIndicators.js';
import { masslineTetherStatus } from '../src/ui/hud.js';
import { resolveCollisionFeel } from '../src/render/feel.js';

test('PQ-165.03 every named fact has a non-vestibular channel', () => {
  const ids = REDUCED_MOTION_INFORMATION_CUES.map((row) => row.id);
  for (const need of ['impactDirection', 'telegraphs', 'shieldSide', 'loadedLine', 'blockedOutput']) {
    assert.ok(ids.includes(need), need);
  }
  for (const row of REDUCED_MOTION_INFORMATION_CUES) {
    assert.ok(row.information && row.information.length > 8, row.id);
    assert.ok(row.owner, row.id);
  }
});

test('PQ-165.03 a shield hit still names the side without shake', () => {
  const cue = buildDamageIndicatorCue({
    applied: 8,
    dominantLayer: 'shield',
    attackerId: 9,
    after: { shield: 20, shieldMax: 55 },
  });
  assert.equal(cue.layer, 'shield');
  assert.equal(cue.glyph, 'S');
  const feel = resolveCollisionFeel({ dp: 80 }, {
    deltaV: 80, playerDistance: 0, motionReduce: true, mode: 'flight',
  });
  assert.equal(feel, null, 'collision shake stays off');
});

test('PQ-165.03 a taut line still reads LOADED from load, not from shake', () => {
  const status = masslineTetherStatus({
    active: true, phase: 'loaded', load: 0.62, strain: 1e-4, automaticBreakAllowed: false,
  });
  assert.match(String(status.text), /LOADED/i);
});

test('PQ-165.03 a hull scrape still points at the other body when motion is reduced', () => {
  const cue = buildReducedMotionContactCue({
    aId: 'player',
    bId: 'rock-1',
    pos: { x: 12, z: -4 },
    otherPos: { x: 12, z: -4 },
  }, 'player');
  assert.equal(cue.dominantLayer, 'hull');
  assert.equal(cue.attackerId, 'rock-1');
  assert.equal(cue.attackerPos.x, 12);
  assert.equal(buildReducedMotionContactCue({ aId: 2, bId: 3, pos: { x: 1, z: 1 } }, 'player'), null);
});

test('PQ-165.03 a starved mill still has a word on the flight HUD', () => {
  assert.equal(blockedOutputAlertText({ machineId: 'mill-1', state: 'starved' }), 'OUTPUT BLOCKED');
  assert.equal(blockedOutputAlertText({ state: 'running' }), null);
});

test('PQ-165.03 a running mill does not hide a starved neighbour', () => {
  let blocked = applyBlockedOutputMachine(new Set(), { siteId: 's1', machineId: 'a', state: 'starved' });
  blocked = applyBlockedOutputMachine(blocked, { siteId: 's1', machineId: 'b', state: 'running' });
  assert.equal(blocked.size, 1);
  assert.ok(blocked.has('s1::a'));
  blocked = applyBlockedOutputMachine(blocked, { siteId: 's1', machineId: 'a', state: 'running' });
  assert.equal(blocked.size, 0);
});
