import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ceresTenderClearanceFixture, compiledNativeRadius } from './fixtures/ceres-tender-clearance.mjs';
import { activityActorSlotById, CERES_ACTIVITY_BANDS } from '../src/data/sectorActivityPockets.js';

// Pure native shape query at a hypothetical heading/offset. Never changes a live body or actor.
function clearanceAt(tender, station, offset, yaw = 0, anchor = station) {
  const origin = anchor.body.translation();
  let minimum = Infinity;
  const contacts = [];
  for (const [i, a] of tender.colliders.entries()) {
    const p = a.translationWrtParent(), r = a.rotationWrtParent();
    const qy = Math.sin(yaw / 2), qw = Math.cos(yaw / 2);
    const position = { x: origin.x + offset.x + Math.cos(yaw) * p.x + Math.sin(yaw) * p.z,
      y: origin.y + p.y, z: origin.z + offset.z - Math.sin(yaw) * p.x + Math.cos(yaw) * p.z };
    const rotation = { x: qw * r.x + qy * r.z, y: qw * r.y + qy * r.w,
      z: qw * r.z - qy * r.x, w: qw * r.w - qy * r.y };
    for (const [j, b] of station.colliders.entries()) {
      const contact = a.shape.contactShape(position, rotation, b.shape, b.translation(), b.rotation(), 150);
      if (!contact) continue;
      minimum = Math.min(minimum, contact.distance);
      if (contact.distance < 0) contacts.push({ tenderCollider: i, stationCollider: j, distance: contact.distance });
    }
  }
  return { minimum, contacts };
}

test('authored Ceres tender starts clear of compiled station and neighboring native hulls', async () => {
  const sourcePaths = ['src/data/sectorActivityPockets.js', 'src/systems/factionPresence.js',
    'src/systems/ships.js', 'src/core/sg02DynamicBodyOwner.js',
    'src/runtime/createAuthoritativeRuntime.js', 'src/systems/environmentalMachinery.js',
    'src/systems/terrainAnchors.js', 'src/systems/environmentMaterials.js',
    'test/fixtures/ceres-tender-clearance.mjs', 'test/ceres-tender-clearance-native.test.mjs'];
  const sourceHashes = Object.fromEntries(sourcePaths.map(path => [path,
    createHash('sha256').update(readFileSync(new URL(`../${path}`, import.meta.url))).digest('hex')]));
  const startedAt = new Date().toISOString();
  const f = await ceresTenderClearanceFixture();
  try {
    const tender = f.state.entityList.find(e => e.data?.activityActorSlotId === 'ceres_refinery_tender');
    const station = f.state.entityList.find(e => e.data?.stationId === 'station_ceres');
    assert.ok(tender && station);
    const slot = activityActorSlotById('ceres_refinery_tender');
    assert.deepEqual(slot.spawnOffset, { x: -94, z: 0 });
    assert.ok(Math.hypot(slot.spawnOffset.x, slot.spawnOffset.z) <= CERES_ACTIVITY_BANDS.immediate.maxWU);
    assert.equal(tender.pos.x - station.pos.x, slot.spawnOffset.x);
    assert.equal(tender.pos.z - station.pos.z, slot.spawnOffset.z);
    assert.equal(tender.rot, 0, 'actual producer uses the default zero heading');
    const identity = { record: tender.data.worldRecordId, job: tender.data.jobId };
    assert.ok(identity.record && identity.job);
    assert.deepEqual(slot.route.marks.map(m => [m.id, m.offset]), [
      ['refinery_tender_berth', { x: -120, z: 15 }],
      ['refinery_tender_client', { x: 90, z: -75 }]
    ]);
    // Capture the authored center BEFORE the first native step: otherwise an initial
    // depenetration jump could become the test's baseline and escape detection.
    const start = { x: tender.pos.x, z: tender.pos.z };
    f.step();
    assert.ok(Math.hypot(tender.pos.x - start.x, tender.pos.z - start.z) < 0.01,
      'first native step must not depenetrate the authored spawn');
    const native = f.physics._sg02;
    const tr = native.records.get(tender.id), sr = native.records.get(station.id);
    assert.ok(tr?.colliders.length > 1 && sr?.colliders.length > 1, 'compiled hulls, not radius stand-ins');
    const old = clearanceAt(tr, sr, { x: -44, z: 24 });
    assert.ok(old.minimum < -9, 'negative control must reproduce the original native penetration');
    assert.equal(old.contacts.length, 4);
    const initial = clearanceAt(tr, sr, slot.spawnOffset);
    assert.ok(initial.minimum > 1);
    const anvil = f.state.entityList.find(e => e.data?.killMachineAnvilId === 'furnace_mouth_anvil');
    const ar = anvil && native.records.get(anvil.id);
    assert.ok(ar?.colliders.length, 'actual production anvil must have native colliders');
    const rejected = clearanceAt(tr, ar, { x: -66, z: 68 }, 0, sr);
    assert.ok(rejected.minimum < -5, 'negative control rejects the omitted-anvil candidate');
    const client = f.state.entityList.find(e => e.data?.activityObjectSlotId === 'ceres_refinery_disabled_hull');
    assert.ok(client && client.collides === false, 'client is actual nonphysical world dressing');
    const tenderRadius = compiledNativeRadius(tr);
    assert.ok(Number.isFinite(tenderRadius) && tenderRadius>0);
    const visualExclusion = client.data.visualRadius + tenderRadius;
    assert.ok(Math.hypot(start.x-client.pos.x,start.z-client.pos.z)>visualExclusion+7);
    // Sampled pose queries only: no native teleports and no claim of continuous swept clearance.
    let corridorMinimum = Infinity;
    const nearby = [...native.records.values()].filter(r => r !== tr
      && Math.hypot(r.entity.pos.x-station.pos.x,r.entity.pos.z-station.pos.z)
        <=125+tenderRadius+compiledNativeRadius(r)+1);
    for(const [from,to] of [[slot.spawnOffset,{x:-120,z:15}],[{x:-120,z:15},{x:-65,z:-65}]]) {
      for(let step=0;step<=40;step++) for(let degrees=0;degrees<360;degrees+=15) {
        const offset={x:from.x+(to.x-from.x)*step/40,z:from.z+(to.z-from.z)*step/40};
        for(const r of nearby) corridorMinimum=Math.min(corridorMinimum,
          clearanceAt(tr,r,offset,degrees*Math.PI/180,sr).minimum);
      }
    }
    assert.ok(corridorMinimum>1, `sampled resident-native approach clearance ${corridorMinimum}`);
    let yawMinimum = Infinity;
    for (let degrees = 0; degrees < 360; degrees += 5) {
      yawMinimum = Math.min(yawMinimum, clearanceAt(tr, sr, slot.spawnOffset, degrees * Math.PI / 180).minimum);
    }
    assert.ok(yawMinimum > 1, 'sampled headings at the authored spawn clear the station');
    let liveMinimum = Infinity;
    for (let step = 0; step <= 120; step++) {
      for (const a of tr.colliders) for (const record of native.records.values()) {
        if (record === tr) continue;
        for (const b of record.colliders) {
          const contact = a.contactCollider(b, 40);
          if (!contact) continue;
          liveMinimum = Math.min(liveMinimum, contact.distance);
          assert.ok(contact.distance >= 0, `tick ${f.state.tick}: tender penetrated entity ${record.entity.id}`);
        }
      }
      assert.ok(Math.hypot(tender.pos.x - start.x, tender.pos.z - start.z) < 10, 'no initial native ejection');
      assert.ok(Math.hypot(tender.pos.x-client.pos.x,tender.pos.z-client.pos.z)>visualExclusion,
        'early actual motion stays outside the conservative client visual envelope');
      if (step < 120) f.step();
    }
    // Focused steering seam, not a claim that the ordinary route completed: select its
    // client leg without moving the actor, then distinguish live-client aim from the mark.
    const runtime = f.sim.registry.get('npcJobsRuntime');
    const entry = f.state.npcJobs.byId[tender.data.jobId];
    entry.job.phase = 'transit';
    entry.job.routeIndex = 0;
    const binding = runtime._currentCeresRealTargetBinding(entry, tender);
    assert.ok(binding?.targetRef, 'the authored tender binds its actual live client');
    assert.strictEqual(binding.targetRef,client);
    const liveAim = Math.atan2(client.pos.z - tender.pos.z, client.pos.x - tender.pos.x);
    const mark = entry.job.route[1].pos;
    const markAim = Math.atan2(mark.z - tender.pos.z, mark.x - tender.pos.x);
    const aimDifference = Math.abs(Math.atan2(Math.sin(liveAim - markAim), Math.cos(liveAim - markAim)));
    assert.ok(aimDifference > 0.5, 'clear spawn retains the runtime causal-heading distinction');
    const standoff=Math.max(binding.spec.standoffWU,tender.radius+client.radius+12);
    const expectedAim=Math.hypot(client.pos.x-tender.pos.x,client.pos.z-tender.pos.z)>=standoff
      ?liveAim:Math.atan2(tender.pos.z-client.pos.z,tender.pos.x-client.pos.x);
    runtime._drive(entry, tender);
    assert.ok(Math.abs(tender.data.intent.aimAngle - expectedAim) < 1e-9,
      'native actor uses the real-client collision standoff, including outward correction when inside it');
    assert.deepEqual({ record: tender.data.worldRecordId, job: tender.data.jobId }, identity);
    console.log('CERES_TENDER_CLEARANCE', JSON.stringify({ startedAt, sourceHashes,
      tick: f.state.tick, simTime: f.state.simTime, original: old, rejected, initial, yawMinimum, corridorMinimum, liveMinimum, tenderRadius, aimDifference, standoff, expectedAim }));
  } finally { f.close(); }
});
