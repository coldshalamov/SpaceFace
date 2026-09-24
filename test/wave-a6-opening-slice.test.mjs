// §22 A6 — the default route runs the slice (build_map.md §22.3 row A6):
// raid, a throw that kills, cargo or wreck collected, patrol in frame, dock,
// Swing Drive bought from the first-haul offer, undock with it fitted.
// One scenario, seed 4242, no debug spawns, no mission-fail — the pilot drives the
// production system set through the player input contract and the live dock/economy seams.

import assert from 'node:assert/strict';
import test from 'node:test';

import { runOpeningSliceA6 } from '../tools/agentic/a6OpeningSlice.mjs';

const BEAT_ORDER = ['raid', 'throw_kill', 'collect', 'patrol_in_frame', 'dock', 'buy_fit', 'undock_fitted'];

test('A6 opening slice plays all seven beats in order on seed 4242', { timeout: 900_000 }, async () => {
  const result = await runOpeningSliceA6({ seed: 4242 });
  const names = result.beats.map(b => b.name);
  console.log('beats:', result.beats.map(b => `${b.name}@${b.t.toFixed(1)}`).join(' -> '));
  console.log('final phase:', result.phase, 'credits:', result.credits);

  for (const required of BEAT_ORDER) {
    assert.ok(names.includes(required), `missing beat ${required} (phase ${result.phase}, saw ${names.join(',')})`);
  }
  // strict order: each required beat lands after the previous one
  let at = -1;
  for (const required of BEAT_ORDER) {
    const idx = names.indexOf(required);
    assert.ok(idx > at, `beat ${required} out of order`);
    at = idx;
  }
  assert.equal(result.phase, 'done', `scenario ended in ${result.phase}`);
  assert.ok(result.ordered, 'runOpeningSliceA6 did not certify the ordered slice');

  // the throw really killed, and the Drive really came off the first-haul rack
  const kill = result.beats.find(b => b.name === 'throw_kill');
  assert.ok(kill && kill.victim != null, 'throw_kill has no victim');
  const buy = result.beats.find(b => b.name === 'buy_fit');
  assert.equal(buy.defId, 'mod_swing_drive_s');
  const purchase = result.events.find(e => e.ev === 'module:purchased' && e.p && e.p.defId === 'mod_swing_drive_s');
  assert.ok(purchase, 'no module:purchased event for the Swing Drive');
  assert.equal(purchase.p.price, 7400, 'purchase must be the Helios first-haul offer, not the catalog price');
  const equipped = result.events.find(e => e.ev === 'module:equipped' && e.p && e.p.defId === 'mod_swing_drive_s');
  assert.ok(equipped, 'Swing Drive was bought but never fitted');
});
