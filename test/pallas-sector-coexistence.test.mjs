import test from 'node:test';
import assert from 'node:assert/strict';
import { pallasSeamNativeFixture } from './fixtures/pallas-seam-native.mjs';
import { PALLAS_SEAM } from '../src/data/pallasSeamWork.js';
import { livingWorkStatusText, createContactHailResponse } from '../src/data/contactHail.js';
import { PALLAS_SHIFT, pallasShiftActor } from '../src/data/pallasWorkShift.js';

const actor = (h, slot) => h.state.entityList.find(e => e.alive !== false && e.data?.activityActorSlotId === slot);
const job = (h, slot) => h.sim.helpers.npcJobs.byEntity(actor(h, slot)?.id);

// Full ordinary Pallas geography/cast, selected production owners and real Rapier steps.
// No encounter ticks or rendered flight claim; no positions, readiness or cargo are forced.
test('real Sker threats hold the passage while the finite seam works through the same native Continue', { timeout: 240000 }, async t => {
  const h = await pallasSeamNativeFixture();
  t.after(() => h.close());
  const slots = [PALLAS_SEAM.miner, PALLAS_SEAM.surveyor, PALLAS_SHIFT.hauler, PALLAS_SHIFT.escort];
  const identities = slots.map(slot => actor(h, slot).data.worldRecordId);
  const yields = [], lots = [];
  h.sim.bus.on('mining:yield', event => {
    const source = h.state.entities.get(event.minerId);
    if (source?.data?.worldRecordId === identities[0]) yields.push(event.qty);
  });
  h.sim.bus.on('npcjobs:lotPosted', event => {
    if (slots.some(slot => job(h, slot)?.job.id === event.postedBy)) lots.push(event);
  });
  const credits = h.state.player.credits;
  h.step(60);
  const threatened = slots.slice(2).map(slot => job(h, slot));
  assert.ok(threatened.every(entry => entry.job.phase === 'flee'), 'actual authored raiders interrupt both passage actors');
  for (const entry of threatened) {
    const threat = h.state.entities.get(entry.threatId);
    assert.ok(threat && threat.alive !== false && threat.type === 'ship', 'hold is caused by a living ordinary threat');
  }
  assert.match(livingWorkStatusText(actor(h, PALLAS_SHIFT.hauler), { state: h.state }), /SKER RUN UNDER THREAT/);
  assert.match(createContactHailResponse(h.state, { kind: 'trader', targetId: actor(h, PALLAS_SHIFT.hauler).id }, 'status').lines[0], /avoiding danger/);
  h.step(29 * 60);
  assert.equal(job(h, PALLAS_SHIFT.hauler).job.phase, 'flee');
  const beforeShift = structuredClone(h.state.traffic.pallasWorkLoop);
  const beforeSeam = structuredClone(job(h, PALLAS_SEAM.miner).job.payload);
  const beforePoses = slots.map(slot => ({ ...actor(h, slot).pos }));
  assert.ok(['joining', 'running'].includes(beforeShift.phase), JSON.stringify(beforeShift));
  assert.ok(beforeSeam.pallasSeamSource, 'same ordinary finite source has been selected');
  const save = h.sim.registry.get('save');
  const envelope = JSON.parse(JSON.stringify(save.serialize('pallas-both-working')));
  assert.equal(save.loadEnvelope(envelope), true);
  h.physics._finishNativeRestore();
  h.state.mode = 'flight';
  assert.equal(await h.physics.prepareBackend(h.state), true);
  assert.equal(job(h, PALLAS_SHIFT.hauler).job.phase, 'flee', 'Continue preserves the real interrupted job');
  assert.match(livingWorkStatusText(actor(h, PALLAS_SHIFT.hauler), { state: h.state }), /SKER RUN UNDER THREAT/);
  assert.equal(h.state.traffic.pallasWorkLoop.phase, beforeShift.phase);
  assert.equal(h.state.traffic.pallasWorkLoop.dwell, 0);
  assert.equal(job(h, PALLAS_SEAM.miner).job.payload.pallasSeamSource, beforeSeam.pallasSeamSource);
  for (let i = 0; i < slots.length; i++) {
    const live = h.state.entityList.filter(e => e.alive !== false && e.data?.worldRecordId === identities[i]);
    assert.equal(live.length, 1, `one durable actor for ${slots[i]}`);
    assert.ok(Math.hypot(live[0].pos.x - beforePoses[i].x, live[0].pos.z - beforePoses[i].z) < .001,
      'Continue retains the actual saved worker pose');
  }
  for (let second = 0; second < 240; second++) {
    h.step(60);
    if (job(h, PALLAS_SEAM.miner).job.payload.pallasSeamFinished) break;
  }
  assert.equal(job(h, PALLAS_SEAM.miner).job.payload.pallasSeamFinished, true);
  const resource = h.state.world.resourceBodies.byId[beforeSeam.pallasSeamSource];
  assert.ok(resource && ['destroyed', 'depleted'].includes(resource.outcome), 'the original finite body has actually been exhausted');
  assert.equal(h.state.traffic.pallasWorkLoop.phase, 'joining');
  assert.equal(h.state.traffic.pallasWorkLoop.arrived, false, 'seam success cannot certify a threatened passage');
  assert.equal(h.state.traffic.pallasWorkLoop.leg, 0);
  assert.ok((h.state.npcJobs.surveyMarks?.[PALLAS_SEAM.sector] || []).some(mark => mark.fieldId === PALLAS_SEAM.field),
    'ordinary survey dispatch survives alongside the held passage');
  assert.equal(yields.reduce((a, b) => a + b, 0), 18, 'one finite eighteen-unit source, no Continue recut');
  assert.equal(lots.length, 0, 'neither loose ore nor escort work fabricates hauler cargo');
  assert.equal(h.state.player.credits, credits);
  assert.ok(pallasShiftActor(h.state, PALLAS_SHIFT.hauler));
  console.log('PALLAS_COEXISTENCE', JSON.stringify({ at: h.state.simTime, savedPhase: beforeShift.phase,
    passage: h.state.traffic.pallasWorkLoop.phase, source: beforeSeam.pallasSeamSource,
    yielded: yields.reduce((a, b) => a + b, 0), identities }));
});
