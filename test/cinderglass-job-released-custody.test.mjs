// Native attachment owner check for the actual released-before-cohort-admission state.
// This does not manufacture a renderer receipt or claim an ordinary player approach.
import test from 'node:test';
import assert from 'node:assert/strict';
import { candidateScene } from './cinderglass-job-fixture.mjs';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { CINDERGLASS_JOB_POINTS } from '../src/features/cinderglassJob/definition.js';
import { cinderglassJobObserveCustody, nativeCinderglassAttachment } from '../src/features/cinderglassJob/custody.js';
import { buildCinderglassJobView } from '../src/features/cinderglassJob/readModel.js';

test('a real Line tracks the released same original without promoting initial cohort admission', async () => {
  const marshal = CINDERGLASS_JOB_POINTS.marshal;
  const t = await candidateScene({ playerPos: { x: marshal.x - 120, z: marshal.z + 130 } });
  try {
    assert.equal(t.action('contact').ok, true);
    assert.equal(t.action('accept', { offerEpoch: t.cg().offerEpoch }).ok, true);
    t.step(4);
    assert.equal(t.cg().phase, 'dispatch'); assert.equal(t.cg().cohortAdmitted, false);
    cinderglassJobObserveCustody(t.sys, t.state);
    assert.equal(t.cg().custody, 'carried', 'an unprepared initial convoy is not released by observation');
    const pirate = t.sim.spawn(makeShipEntitySpec('ship_wasp', { team: 1, factionId: 'faction_pirate', pos: { x: 0, z: 0 } }));
    const latch = t.body('latchId'), pod = t.body('podId');
    assert.equal(t.sim.registry.get('combat').onHit({ targetId: latch.id, ownerId: pirate.id,
      damage: 80, damageType: 'kinetic', pos: latch.pos }).ok, true);
    t.step(2);
    assert.equal(t.cg().phase, 'recovery'); assert.equal(t.cg().custody, 'released');
    assert.equal(t.cg().cohortAdmitted, false); assert.equal(t.sys._presentationReady, false);
    const id = pod.id, generation = pod.occupantGeneration, credits = t.state.player.credits;
    const attachments = t.sim.registry.get('combat').kernel.attachments;
    const made = attachments.create({ defId: 'tether_standard', ownerId: t.player.id, targetId: pod.id });
    assert.equal(made.ok, true, made.reason);
    assert.ok(made.attachment.restLength < 390, 'ordinary starter Line at an authored reachable separation');
    assert.ok(nativeCinderglassAttachment(t.sys, t.state, made.attachment));
    cinderglassJobObserveCustody(t.sys, t.state);
    assert.equal(t.cg().custody, 'tethered');
    assert.equal(buildCinderglassJobView(t.state).navigation.find(m => m.id === 'cinderglassJob:pod')?.followId, pod.id);
    assert.equal(t.cg().cohortAdmitted, false, 'recovery tracking never approves initial convoy work');
    assert.equal(t.sys._presentationReady, false); assert.equal(t.cg().depositPaid, false);
    assert.equal(t.cg().settlement, null); assert.equal(t.state.player.credits, credits);
    assert.equal(pod.id, id); assert.equal(pod.occupantGeneration, generation); assert.equal(t.originalCount(), 1);
    assert.equal(attachments.cut(made.attachment.id, t.player.id, 'player_cut').ok, true);
    cinderglassJobObserveCustody(t.sys, t.state);
    assert.equal(t.cg().custody, 'released'); assert.equal(t.cg().cohortAdmitted, false);
  } finally { t.sim.dispose(); }
});
