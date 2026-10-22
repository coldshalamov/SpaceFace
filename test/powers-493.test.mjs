// Row 493 (CRAFT-POWERS): holding a power's key outlines the bodies it will move, one colour each.
import test from 'node:test';
import assert from 'node:assert/strict';
import { powerHeld, powerPreviewPlan, POWER_PREVIEW_TINT, POWER_PREVIEW_RANGE } from '../src/data/powerPreview.js';
import { POWER_VERBS } from '../src/systems/powerVerbs.js';

function mkState({ heldPower = null, bodies = [] } = {}) {
  const actions = {};
  if (heldPower) actions[heldPower] = { held: true };
  const entities = new Map();
  entities.set(1, { id: 1, pos: { x: 0, z: 0 }, yaw: 0, radius: 12 });
  for (const b of bodies) entities.set(b.id, b);
  return { playerId: 1, entities, entityList: [...entities.values()], input: { actions } };
}

test('powerHeld reads the merged hold flag; every power has a tint and a range', () => {
  assert.equal(powerHeld(mkState({ heldPower: 'pull' })), 'pull');
  assert.equal(powerHeld(mkState()), null);
  for (const p of POWER_VERBS) {
    assert.ok(POWER_PREVIEW_TINT[p], `tint for ${p}`);
    assert.ok(POWER_PREVIEW_RANGE[p] > 0, `range for ${p}`);
  }
  // distinct colours — "one colour each" is the row's rule
  assert.equal(new Set(Object.values(POWER_PREVIEW_TINT)).size, 5);
});

test('pull outlines in-range bodies with paths toward the player', () => {
  const s = mkState({ heldPower: 'pull', bodies: [
    { id: 2, pos: { x: 100, z: 0 }, radius: 10 },
    { id: 3, pos: { x: 900, z: 0 }, radius: 10 }, // beyond pull range
  ]});
  const plan = powerPreviewPlan(s);
  assert.equal(plan.power, 'pull');
  assert.equal(plan.tint, 'amber');
  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].id, 2);
  assert.ok(plan.moves[0].toX < plan.moves[0].x, 'path pulls toward the ship');
});

test('shove cone ignores bodies behind the hull; pin anchors with no path', () => {
  const s = mkState({ heldPower: 'shove', bodies: [
    { id: 2, pos: { x: 120, z: 0 }, radius: 10 },  // ahead (yaw 0 = +x)
    { id: 3, pos: { x: -120, z: 0 }, radius: 10 }, // behind
  ]});
  const plan = powerPreviewPlan(s);
  assert.deepEqual(plan.moves.map((m) => m.id), [2]);
  const pin = powerPreviewPlan(mkState({ heldPower: 'pin', bodies: [{ id: 2, pos: { x: 120, z: 0 }, radius: 10 }] }));
  assert.equal(pin.moves[0].toX, pin.moves[0].x, 'pin anchors — no predicted path');
});

test('plan is deterministic and capped at 24 outlines', () => {
  const bodies = [];
  for (let i = 0; i < 40; i++) bodies.push({ id: 10 + i, pos: { x: 50 + i * 2, z: 0 }, radius: 8 });
  const s = mkState({ heldPower: 'pull', bodies });
  const a = powerPreviewPlan(s), b = powerPreviewPlan(s);
  assert.deepEqual(a.moves.map((m) => m.id), b.moves.map((m) => m.id));
  assert.ok(a.moves.length <= 24);
});
