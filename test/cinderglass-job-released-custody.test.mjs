// Native attachment owner check for the actual released-before-cohort-admission state.
// This does not manufacture a renderer receipt or claim an ordinary player approach.
import test from 'node:test';
import assert from 'node:assert/strict';
import { candidateScene } from './cinderglass-job-fixture.mjs';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { CINDERGLASS_JOB_POINTS } from '../src/features/cinderglassJob/definition.js';
import { cinderglassJobObserveCustody, nativeCinderglassAttachment, nativeCinderglassPose } from '../src/features/cinderglassJob/custody.js';
import { buildCinderglassJobView } from '../src/features/cinderglassJob/readModel.js';
import { commissionEntries } from '../src/ui/screens/missionLog.js';

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

test('continuous Dione membership retains the original radio reply and accepted recovery Line', async () => {
  const marshal = CINDERGLASS_JOB_POINTS.marshal;
  const t = await candidateScene({ playerPos: { x: marshal.x - 120, z: marshal.z + 130 } });
  try {
    assert.equal(t.action('contact').ok, true);
    assert.equal(t.action('accept', { offerEpoch: t.cg().offerEpoch }).ok, true);
    t.step(4);
    const pirate = t.sim.spawn(makeShipEntitySpec('ship_wasp', { team: 1, factionId: 'faction_pirate', pos: { x: 0, z: 0 } }));
    const latch = t.body('latchId'), pod = t.body('podId');
    t.sim.registry.get('combat').onHit({ targetId: latch.id, ownerId: pirate.id,
      damage: 80, damageType: 'kinetic', pos: latch.pos });
    t.step(2);
    const identity = { id: pod.id, generation: pod.occupantGeneration };
    // Exercise the actual membership producer with no body relocation or renderer receipt.
    t.sim.registry.get('world').enterSector('sector_dione_lane', { continuous: true, noTeleport: true });
    t.sys.update(1 / 60, t.state);
    assert.equal(t.state.world.currentSectorId, 'sector_dione_lane');
    assert.equal(t.state.world.residentSectors.sector_tethys_junction.tier, 'REDUCED');
    assert.equal(t.body('podId'), pod); assert.ok(nativeCinderglassPose(t.sys, t.state, pod));
    assert.equal(t.cg().phase, 'recovery'); assert.equal(t.cg().custody, 'released');
    assert.equal(t.action('tuneBeacon', { revision: t.cg().promptRevision }).ok, true,
      'an enabled same-original cargo radio remains available across membership boundaries');
    assert.deepEqual(t.cg().beaconFix.pos, nativeCinderglassPose(t.sys, t.state, pod).pos);
    const attachments = t.sim.registry.get('combat').kernel.attachments;
    const made = attachments.create({ defId: 'tether_standard', ownerId: t.player.id, targetId: pod.id });
    assert.equal(made.ok, true, made.reason); assert.ok(made.attachment.restLength < 390);
    assert.ok(nativeCinderglassAttachment(t.sys, t.state, made.attachment));
    t.sys.update(1 / 60, t.state);
    assert.equal(t.cg().custody, 'tethered');
    assert.equal(buildCinderglassJobView(t.state).navigation.find(m => m.id === 'cinderglassJob:pod')?.followId, pod.id);
    assert.equal(t.cg().cohortAdmitted, false); assert.equal(t.sys._presentationReady, false);
    assert.equal(t.cg().settlement, null); assert.equal(t.cg().receiveQuote, null);
    assert.equal(t.cg().depositPaid, false); assert.equal(t.state.player.credits, 5000);
    assert.deepEqual({ id: pod.id, generation: pod.occupantGeneration }, identity);
    assert.equal(t.originalCount(), 1);
    t.sys._publish();
    assert.equal(t.action('track', { markerId: 'cinderglassJob:cradle' }).ok, true);
    assert.equal(t.state.nav.autopilot.active, false, 'Track keeps its preview behavior');
    assert.equal(t.state.nav.autopilot.arrivalRadius, 60);
    const entry = commissionEntries(t.state).find(e => e.key === 'cinder');
    const course = entry.actions.find(a => a.key === 'recovery:autopilotCradle');
    assert.ok(course, 'the normal Journal adapter exposes the explicit recovery flight action');
    const pose = nativeCinderglassPose(t.sys, t.state, pod);
    const publicCradle = t.state.cinderglassJobView.navigation.find(m => m.id === 'cinderglassJob:cradle');
    t.bus.emit(course.event, course.payload);
    assert.equal(course.payload.result.ok, true);
    assert.equal(t.state.nav.autopilot.active, true);
    assert.equal(t.state.nav.autopilot.arrivalRadius, 50, 'explicit tow approach leaves room for the trailing original inside the unchanged receiver gate');
    assert.deepEqual(t.state.nav.autopilot.target, publicCradle.pos);
    assert.equal(t.state.nav.route, null, 'the canonical course owner arms continuous flight, not a jump');
    assert.deepEqual(nativeCinderglassPose(t.sys, t.state, pod), pose, 'engagement cannot move the original');
    assert.equal(attachments.get(made.attachment.id).state, 'active');
    assert.equal(t.action('autopilotCradle', course.payload).reason, 'stale_recovery_view');
    assert.equal(t.action('autopilotCradle', { revision: t.cg().promptRevision, token: 'old-life' }).reason, 'stale_life');
    assert.equal(attachments.cut(made.attachment.id, t.player.id, 'player_cut').ok, true);
    assert.equal(t.action('autopilotCradle', { revision: t.cg().promptRevision }).reason, 'recovery_course_unavailable',
      'a stale tethered projection cannot start a tow without the real native Line');
  } finally { t.sim.dispose(); }
});
