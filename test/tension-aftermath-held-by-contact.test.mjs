// SR-06 — an ongoing fight must not consume its own recovery window.
// The tension engine moves peak -> aftermath when the peak budget is spent even while contact
// continues (that already stops new combat being stacked on the fight). Before this fix the
// aftermath clock kept running during that same fight, so a long engagement reached
// `arc_complete` -> quiet -> opportunity while still in contact, and the player's earned
// respite after the last shot was gone. The clock now holds while contact lasts.
import test from 'node:test';
import assert from 'node:assert/strict';

import { TensionDirector } from '../src/ai/tensionDirector.js';

const CALM = { hull: 1, shield: 1, nearbyCombat: 0 };
const FIGHT = { hull: 0.9, shield: 0.6, nearbyCombat: 1 };

function run(dir, fromS, toS, sensors, phases) {
  for (let t = fromS; t <= toS; t++) {
    dir.advance(t, sensors);
    phases.push([t, dir.state.phase]);
  }
}

function enterPeak() {
  const dir = new TensionDirector({ now: 0 });
  const phases = [];
  run(dir, 0, 70, CALM, phases); // quiet (65 s goal) -> opportunity
  assert.equal(dir.state.phase, 'opportunity');
  return { dir, phases };
}

test('aftermath does not age while the fight that spent the peak budget continues', () => {
  const { dir, phases } = enterPeak();
  // A long fight: 4 minutes in contact. Peak budget (60-75 s) expires mid-fight.
  run(dir, 71, 310, FIGHT, phases);
  const seen = new Set(phases.filter(([t]) => t > 70).map(([, p]) => p));
  assert.ok(seen.has('peak'), 'contact delivers the peak');
  assert.ok(!seen.has('quiet') && !seen.has('opportunity'),
    `the fight must not complete its own arc: ${[...seen].join(',')}`);
  assert.ok(['aftermath', 'recovery'].includes(dir.state.phase), dir.state.phase);
  assert.equal(dir.state.policy.allowCombat, false, 'no new combat is stacked on the running fight');

  if (dir.state.phase === 'aftermath') {
    assert.ok(dir.state.activeS - dir.state.phaseEnteredS <= 1, 'aftermath clock held during contact');
  }

  // Contact releases at t=310. The respite (combat tail + authored aftermath dwell) follows it.
  const releasedAt = 310;
  const after = [];
  run(dir, releasedAt + 1, releasedAt + 200, CALM, after);
  const firstQuiet = after.find(([, p]) => p === 'quiet');
  assert.ok(firstQuiet, 'the arc completes once the fight is over');
  assert.ok(firstQuiet[0] - releasedAt >= 85,
    `respite after the last contact lasted ${firstQuiet[0] - releasedAt}s, expected the authored aftermath`);
});

test('a short fight that resolves inside the peak still gets a normal aftermath', () => {
  const { dir, phases } = enterPeak();
  run(dir, 71, 95, FIGHT, phases);
  run(dir, 96, 400, CALM, phases);
  const aftermathAt = phases.find(([t, p]) => t > 70 && p === 'aftermath');
  const quietAt = phases.find(([t, p]) => aftermathAt && t > aftermathAt[0] && p === 'quiet');
  assert.ok(aftermathAt && quietAt, 'peak -> aftermath -> quiet');
  const dwell = quietAt[0] - aftermathAt[0];
  assert.ok(dwell >= 85 && dwell <= 101, `aftermath dwell ${dwell}s matches the authored goal`);
});

test('holding the aftermath clock survives snapshot/restore', () => {
  const { dir, phases } = enterPeak();
  run(dir, 71, 200, FIGHT, phases);
  const copy = new TensionDirector({ now: 200, snapshot: dir.snapshot() });
  assert.equal(copy.state.phase, dir.state.phase);
  assert.ok(copy.state.phaseEnteredS <= copy.state.activeS, 'restored clock stays valid');
});
