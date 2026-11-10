// inf-ghost-resolve-read — a ghost contact ends one of two ways, and both read.
// scanner:ghostRevealed (W05's last pulse hardening the contact) and scanner:ghostEscaped
// (the sim despawning a contact that held escape range) had no consumer anywhere — the
// deception loop ran in silence. ghostResolveRead.js owns the plan; this file pins its
// decisions. Pure module — no sim chain.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isGhostRevealMoment,
  isGhostEscapeMoment,
  ghostHues,
  ghostColorCss,
  ghostResolvePlan,
  ghostEscapePlan,
  GHOST_RESOLVE_PRIORITY,
} from '../src/render/vfx/ghostResolveRead.js';

test('gate: both receipts need a contact id; escape needs a string-or-absent reason', () => {
  assert.equal(isGhostRevealMoment({ entityId: 31, stage: 3, confidence: 1 }), true);
  assert.equal(isGhostRevealMoment({ stage: 3 }), false);
  assert.equal(isGhostRevealMoment(null), false);
  assert.equal(isGhostEscapeMoment({ entityId: 31, reason: 'beyond_escape_range' }), true);
  assert.equal(isGhostEscapeMoment({ entityId: 31 }), true, 'a bare receipt still names the melt');
  assert.equal(isGhostEscapeMoment({ entityId: 31, reason: 7 }), false);
});

test('hue: the sensor-deception family — snap white-hot, holo voice, dimmer melt', () => {
  const { holo, snap, melt } = ghostHues();
  for (const rgb of [holo, snap, melt]) {
    for (const c of rgb) assert.ok(c >= 0 && c <= 1);
    assert.match(ghostColorCss(rgb), /^rgb\(\d+,\d+,\d+\)$/);
  }
  const sum = (rgb) => rgb[0] + rgb[1] + rgb[2];
  assert.ok(sum(snap) > sum(holo), 'the snap core burns hotter than the holo voice');
  assert.ok(sum(melt) < sum(holo), 'the melt is dimmer than the voice it leaves in');
});

test('plan: the snap obeys the S8 flash law and the settle wisp outlives it', () => {
  const plan = ghostResolvePlan(false);
  assert.ok(plan.snap.life <= 0.2, `snap inside the 0.2 s cap (got ${plan.snap.life})`);
  assert.ok(plan.settle.life > plan.snap.life * 2, 'the wisp settling outlives the snap');
  assert.equal(plan.light.kind, 'cue', 'information reads ride the cue row');
});

test('plan: the melt is quieter than the snap in every channel', () => {
  const resolve = ghostResolvePlan(false);
  const escape = ghostEscapePlan(false);
  assert.ok(escape.light.peak < resolve.light.peak, 'a dimmer light');
  assert.ok(escape.dissolve.op0 < resolve.snap.op0, 'a dimmer body');
});

test('plan: reduced motion keeps a floor on both beats — a contact tell is never silenced', () => {
  const reducedSnap = ghostResolvePlan(true);
  const fullSnap = ghostResolvePlan(false);
  const reducedMelt = ghostEscapePlan(true);
  assert.ok(reducedSnap.snap.size1 >= 2, 'the reduced snap still reads');
  assert.ok(reducedSnap.settle.op0 > 0.2, 'the reduced wisp still reads');
  assert.ok(reducedMelt.dissolve.op0 > 0.2, 'the reduced melt still reads');
  assert.ok(reducedSnap.snap.life <= 0.2, 'reduced never lifts the flash cap');
  assert.ok(fullSnap.settle.op0 > reducedSnap.settle.op0, 'reduced holds a floor, not the full peak');
});

test('priority: the tell band — below combat bursts, above scenery', () => {
  assert.ok(GHOST_RESOLVE_PRIORITY > 0 && GHOST_RESOLVE_PRIORITY <= 1);
});
