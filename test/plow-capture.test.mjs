// R17 + 03_COMBAT.md §4 "done when": "in a seeded field of 40 rocks, one plough pass captures >= 20,
// holds them >= 4 s while turning 90°, and on launch >= 15 travel >= 3 screen depths". The owner:
// "bull doze with this cone straight through it and now you're flying at the enemies ... with 25
// big-ass asteroids barreling towards them." Real path: live runtime on rapier-dynamic.
import test from 'node:test';
import assert from 'node:assert/strict';

import { bootRealPath, writeRealPathInput } from '../scripts/lib/bench/realPath.mjs';
import { fields } from '../src/systems/fields.js';
import { FIELD_FLAGS, FIELD_DEFS } from '../src/data/fields.js';

const SEED = 4242;
const SCREEN_DEPTH_WU = 126;

test('the Plow gathers a wall of rock, holds it through a 90° turn and fires it forward', { timeout: 180_000 }, async () => {
  const previous = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  const host = await bootRealPath({
    seed: SEED,
    systems: ['actions', 'flightV3', 'collisionConsequences', fields, 'physics'],
    hulls: [{ hullId: 'ship_kestrel', pos: { x: 0, z: 0 }, isPlayer: true }],
  });
  try {
    const st = host.state;
    st.input.actions = st.input.actions || {};
    let s = SEED;
    const rnd = () => { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296; };
    for (let i = 0; i < 40; i++) {
      host.spawnObstacle({ pos: { x: 160 + rnd() * 700, z: (rnd() - 0.5) * 260 }, radius: 9 + rnd() * 9, mass: 20 + rnd() * 60, dynamic: true });
    }
    host.step(2);
    st.input.actions.toggleClearingCone = true;
    const held = () => (st.fields && st.fields.plow ? st.fields.plow.held.length : 0);
    host.step(240, { before: () => writeRealPathInput(st, { moveZ: 1 }) });
    const afterPass = held();
    assert.ok(afterPass >= 20, `03 §4: one pass captures >= 20 of 40 (captured ${afterPass})`);
    assert.ok(afterPass <= FIELD_DEFS.cone.plow.capacity, 'capacity 25');

    const rot0 = host.player.rot;
    host.step(240, { before: () => {
      const turned = Math.abs(host.player.rot - rot0);
      writeRealPathInput(st, { moveZ: 0.6, turnIntent: turned < Math.PI / 2 ? -1 : 0 });
    } });
    assert.ok(Math.abs(host.player.rot - rot0) >= Math.PI / 2 * 0.95, 'the ship turned 90°');
    const afterTurn = held();
    assert.ok(afterTurn >= 20, `03 §4: holds them >= 4 s while turning 90° (still held ${afterTurn})`);

    const ids = st.fields.plow.held.map((r) => r.id);
    const start = new Map(ids.map((id) => { const e = st.entities.get(id); return [id, { x: e.pos.x, z: e.pos.z }]; }));
    st.input.actions.toggleClearingCone = true;
    host.step(120, { before: () => writeRealPathInput(st, { moveZ: 0 }) });
    let far = 0;
    for (const id of ids) {
      const e = st.entities.get(id);
      const p0 = start.get(id);
      if (e && Math.hypot(e.pos.x - p0.x, e.pos.z - p0.z) > 3 * SCREEN_DEPTH_WU) far++;
    }
    assert.ok(far >= 15, `03 §4: on launch >= 15 travel >= 3 screen depths (${far} of ${ids.length})`);
    assert.equal(st.fields.coneActive, false, 'the launch press also closes the Plow');
    assert.equal(held(), 0, 'nothing is left aboard after the launch');
  } finally {
    host.dispose();
    FIELD_FLAGS.enabled = previous;
  }
});
