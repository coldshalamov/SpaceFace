// Real native originals, public feature commands and full save owner. No hidden pose,
// presentation acknowledgement, wallet grant or replacement pod is used for beacon replies.
import test from 'node:test';
import assert from 'node:assert/strict';
import { candidateScene } from './cinderglass-job-fixture.mjs';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { nativeCinderglassPose } from '../src/features/cinderglassJob/custody.js';
import { buildCinderglassJobView } from '../src/features/cinderglassJob/readModel.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { missionLogScreen } from '../src/ui/screens/missionLog.js';

const tune = (t, rest = {}) => t.action('tuneBeacon', { revision: t.cg().promptRevision, ...rest });

async function releasedBeforeAdmission() {
  const t = await candidateScene();
  assert.equal(t.action('contact').ok, true);
  assert.equal(t.action('accept', { offerEpoch: t.cg().offerEpoch }).ok, true);
  t.step(4);
  assert.equal(t.cg().cohortAdmitted, false);
  assert.equal(tune(t).ok, false, 'carried freight retains its scanner/stealth contract');
  const pirate = t.sim.spawn(makeShipEntitySpec('ship_wasp', { team: 1, factionId: 'faction_pirate', pos: { x: 0, z: 0 } }));
  const latch = t.body('latchId');
  assert.equal(t.sim.registry.get('combat').onHit({ targetId: latch.id, ownerId: pirate.id,
    damage: 80, damageType: 'kinetic', pos: latch.pos }).ok, true);
  t.step(2);
  assert.equal(t.cg().phase, 'recovery'); assert.equal(t.cg().custody, 'released');
  assert.equal(t.cg().cohortAdmitted, false);
  assert.equal(t.sys._presentationReady, false, 'radio knowledge never substitutes a GPU receipt');
  return t;
}

test('explicit Tune obtains one native-backed fix; drift never silently updates the public waypoint', async () => {
  const t = await releasedBeforeAdmission();
  try {
    const pod = t.body('podId'), pose = nativeCinderglassPose(t.sys, t.state, pod);
    const before = structuredClone({ id: pod.id, generation: pod.occupantGeneration,
      pos: { ...pod.pos }, vel: { ...pod.vel }, hull: pod.hull, mass: pod.mass, ownerId: pod.ownerId,
      credits: t.state.player.credits, custody: t.cg().custody });
    assert.equal(t.cg().hardwareObservation, undefined);
    assert.equal(buildCinderglassJobView(t.state).navigation.some(m => m.id === 'cinderglassJob:pod'), false);
    assert.equal(tune(t).ok, true);
    const fix = structuredClone(t.cg().beaconFix);
    assert.deepEqual(fix.pos, pose.pos);
    assert.equal(fix.generation, pod.occupantGeneration);
    assert.equal(fix.source, 'cg7-cargo-beacon');
    assert.equal(t.cg().scanDone, false); assert.equal(t.cg().podMarked, false);
    assert.deepEqual({ id: pod.id, generation: pod.occupantGeneration,
      pos: { ...pod.pos }, vel: { ...pod.vel }, hull: pod.hull, mass: pod.mass, ownerId: pod.ownerId,
      credits: t.state.player.credits, custody: t.cg().custody }, before);
    // Real native impulse supplies the drift condition; the feature never writes its pose.
    queuePhysicsImpulse(pod, { x: 110, y: 0, z: -280 });
    t.step(181);
    assert.ok(Math.hypot(pod.pos.x - fix.pos.x, pod.pos.z - fix.pos.z) > 10);
    const view = buildCinderglassJobView(t.state), marker = view.navigation.find(m => m.id === 'cinderglassJob:pod');
    assert.deepEqual(marker.pos, fix.pos);
    assert.match(marker.label, /CG-7.*beacon fix.*3s old/);
    assert.equal(marker.followId, null, 'a last-received fix is not an unseen entity-follow course');
    assert.ok(view.approachPrompt.choices.some(c => c.id === 'tuneBeacon'));
    let course;
    t.bus.on('ui:setCourse', p => { course = p; });
    assert.equal(t.action('track', { markerId: marker.id }).ok, true);
    assert.deepEqual(course.pos, fix.pos); assert.equal(course.targetEntityId, null);
    assert.equal(tune(t).ok, true);
    assert.ok(t.cg().beaconFix.atS > fix.atS);
    assert.equal(t.cg().beaconFix.seq, fix.seq + 1);
    assert.deepEqual(t.cg().beaconFix.pos, nativeCinderglassPose(t.sys, t.state, pod).pos);
    assert.equal(t.originalCount(), 1);
  } finally { t.sim.dispose(); }
});

test('Continue preserves last-received knowledge and fresh Tune rejects old lives and replacements', async () => {
  const t = await releasedBeforeAdmission();
  try {
    assert.equal(tune(t).ok, true);
    const save = t.sim.registry.get('save'), envelope = save.serialize('cg7-beacon');
    const fix = structuredClone(t.cg().beaconFix), oldToken = t.sys.token(), id = t.body('podId').id;
    assert.deepEqual(envelope.data.world.cinderglassJob.beaconFix, fix);
    assert.equal(save.loadEnvelope(envelope, 'cg7-beacon'), true);
    t.step(10);
    assert.equal(t.body('podId').id, id); assert.equal(t.originalCount(), 1);
    assert.deepEqual(t.cg().beaconFix, fix, 'restore retains historical communication, not live pose projection');
    assert.equal(tune(t, { token: oldToken }).ok, false);
    assert.equal(tune(t).ok, true);
    const current = structuredClone(t.cg().beaconFix), pod = t.body('podId');
    const replacement = { ...pod, occupantGeneration: pod.occupantGeneration + 1, data: { ...pod.data } };
    t.state.entities.set(id, replacement);
    assert.equal(tune(t).ok, false, 'a recycled map slot cannot speak for the bound original');
    assert.deepEqual(t.cg().beaconFix, current);
    t.state.entities.set(id, pod);
    const recordId = pod.data.worldRecordId;
    pod.data.worldRecordId = 'not-the-original';
    assert.equal(tune(t).ok, false);
    assert.deepEqual(t.cg().beaconFix, current);
    pod.data.worldRecordId = recordId;
    const rec = t.sim.registry.get('physics')._sg02.records.get(id);
    rec.body.setEnabled(false);
    assert.equal(tune(t).ok, false, 'missing native readiness cannot manufacture a fix');
    assert.deepEqual(t.cg().beaconFix, current);
    rec.body.setEnabled(true);
    t.sim.registry.get('combat').onHit({ targetId: id, ownerId: t.player.id,
      damage: 500, damageType: 'kinetic', pos: pod.pos });
    assert.ok(pod.alive === false || pod.hull <= 0);
    assert.equal(tune(t).ok, false, 'a dead original cannot answer');
  } finally { t.sim.dispose(); }
});

test('mounted Journal keeps Tune reachable after Leave and forwards only the captured current recovery view', async context => {
  // Keep real timer behavior, but retire this mounted fixture's deferred UI work.
  const timers = new Set(), schedule = globalThis.setTimeout;
  context.mock.method(globalThis, 'setTimeout', (fn, ms, ...args) => {
    const handle = schedule(fn, ms, ...args); timers.add(handle); return handle;
  });
  const t = await releasedBeforeAdmission(), previousDocument = globalThis.document;
  const node = tag => ({ tagName: tag, children: [], style: {}, attrs: {}, listeners: {},
    set innerHTML(_v) { this.children = []; }, appendChild(child) { this.children.push(child); return child; },
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k] ?? null; }, removeAttribute(k) { delete this.attrs[k]; },
    addEventListener(name, fn) { this.listeners[name] = fn; }, click() { this.listeners.click?.(); } });
  globalThis.document = { createElement: node };
  const host = node('div'), screen = Object.assign(Object.create(missionLogScreen), {
    _ctx: { state: t.state, bus: t.bus }, _commissionsEl: host, _commissionHeader: node('h3') });
  const buttons = root => [...(root.tagName === 'button' ? [root] : []), ...root.children.flatMap(buttons)];
  try {
    assert.equal(t.action('leave').ok, true);
    t.state.mode = 'paused'; t.state.ui.docked = true;
    t.sys._publish();
    screen._renderCommissions(t.state);
    const oldButton = buttons(host).find(b => b.textContent === 'Tune CG-7 cargo beacon');
    assert.ok(oldButton); oldButton.click();
    const fix = structuredClone(t.cg().beaconFix);
    assert.equal(fix.source, 'cg7-cargo-beacon');
    oldButton.click();
    assert.equal(t.cg().lastRefusal.reason, 'stale_beacon_view');
    assert.deepEqual(t.cg().beaconFix, fix);
    screen._renderCommissions(t.state);
    const fresh = buttons(host).find(b => b.textContent === 'Request fresh CG-7 beacon fix');
    assert.ok(fresh); fresh.click();
    assert.equal(t.cg().beaconFix.seq, fix.seq + 1);
    assert.equal(t.cg().cohortAdmitted, false); assert.equal(t.cg().depositPaid, false);
  } finally {
    globalThis.document = previousDocument; t.sim.dispose();
    for (const handle of timers) clearTimeout(handle);
  }
});
