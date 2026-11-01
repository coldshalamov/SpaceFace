import test from 'node:test';
import assert from 'node:assert/strict';
import { swarmRoundPreview } from '../src/data/swarmLadder.js';
import { SWARM_SPECIALIST_BRIEFS } from '../src/data/swarmSpecialists.js';

test('guaranteed specialist debuts expose preparation intel without promising random recurrence', () => {
  for (const [wave, id] of [[6, 'mine_layer_jackal'], [9, 'warden_escort'], [22, 'field_anchor_controller']]) {
    const preview = swarmRoundPreview({ wave, seed: 4242, arenaId: 'ricochet_foundry' });
    assert.equal(preview.specialist, SWARM_SPECIALIST_BRIEFS[id]);
    assert.equal(preview.specialist.name, preview.newcomer);
    assert.ok(preview.specialist.threat.length > 30);
    assert.ok(preview.specialist.counter.length > 30);
    assert.equal(swarmRoundPreview({ wave: wave + 1, seed: 4242 }).specialist, null);
  }
  assert.match(SWARM_SPECIALIST_BRIEFS.warden_escort.counter, /Shoot the warden.*out of range.*shot line/i);
  assert.match(SWARM_SPECIALIST_BRIEFS.mine_layer_jackal.counter, /open flank.*shoot.*throw/i);
  assert.match(SWARM_SPECIALIST_BRIEFS.field_anchor_controller.counter, /Displace.*spool.*active.*outside the ring/i);
});
