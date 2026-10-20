import test from 'node:test';
import assert from 'node:assert/strict';
import { pallasNativeFixture } from './fixtures/pallasNativeFixture.mjs';
import { PALLAS_SHIFT as C, pallasShiftStatus, normalizePallasShift } from '../src/data/pallasWorkShift.js';
import { livingWorkStatusText, contactHailAvailability, createContactHailOffer, createContactHailResponse } from '../src/data/contactHail.js';
test('the original Sker pair physically joins and reaches the real Hollow Hub', {
  timeout: 180000
}, async () => {
  const h = await pallasNativeFixture();
  try {
    const start = {
      ...h.hauler.pos
    };
    for (let i = 0; i < 360 * 60 && !h.state.traffic.pallasWorkLoop?.arrived; i++) h.step();
    const r = h.state.traffic.pallasWorkLoop;
    const diag = JSON.stringify({
      r,
      hauler: h.hauler.pos,
      escort: h.escort.pos,
      hv: h.hauler.vel,
      ev: h.escort.vel,
      hj: h.sim.helpers.npcJobs.byEntity(h.hauler.id)?.job,
      ej: h.sim.helpers.npcJobs.byEntity(h.escort.id)?.job
    });
    assert.equal(r.phase, 'arrived', diag);
    assert.ok(r.joined);
    assert.ok(Math.hypot(h.hauler.pos.x - start.x, h.hauler.pos.z - start.z) > 2000);
    assert.ok(Math.hypot(h.hauler.pos.x - h.escort.pos.x, h.hauler.pos.z - h.escort.pos.z) <= C.joinRange);
    assert.match(livingWorkStatusText(h.hauler, {
      state: h.state
    }), /SMUGGLER DEN ARRIVAL/);
    assert.match(pallasShiftStatus(h.state, h.hauler).text, /made it to Smuggler Den/);
    assert.equal(h.events.filter(e => e.phase === 'arrived').length, 0, 'distant arrival does not send a sector-wide player toast');
    console.log('PALLAS_NATIVE', JSON.stringify({
      at: h.state.simTime,
      phase: r.phase,
      hauler: h.hauler.pos,
      escort: h.escort.pos
    }));
  } finally {
    h.close();
  }
});
test('old clock-only progress is not a receipt and missing save resets the outgoing run', () => {
  assert.equal(normalizePallasShift({
    seed: 4242,
    phase: 4,
    order: ['miner_to_hauler', 'hauler_to_hub', 'ambush', 'escort']
  }, 4242).phase, 'waiting');
  assert.equal(normalizePallasShift(null, 4242).arrived, false);
});
test('holding, leases, exact identities and terminal loss do not become phantom arrivals', async () => {
  const h = await pallasNativeFixture({
    native: false
  });
  try {
    const tick = (n = 1) => {
      for (let i = 0; i < n; i++) {
        h.state.tick++;
        h.owner.update(1 / 60, h.state);
        h.sim.bus.flush();
      }
    };
    tick(100);
    assert.equal(h.state.traffic.pallasWorkLoop.phase, 'running');
    const row = h.state.traffic.pallasWorkLoop,
      leg = row.leg,
      start = {
        ...h.hauler.pos
      };
    h.escort.pos.x -= 1000;
    tick(120);
    const hj = h.sim.helpers.npcJobs.byEntity(h.hauler.id);
    const target = h.sim.helpers.traffic.pallasWorkTarget(hj, h.hauler);
    assert.deepEqual(target.pos, h.hauler.pos, 'hauler brakes where it is while escort is absent');
    assert.equal(row.holding, true);
    assert.equal(row.leg, leg);
    assert.deepEqual({
      ...h.hauler.pos
    }, start);
    h.escort.pos = {
      x: h.hauler.pos.x - 60,
      z: h.hauler.pos.z + 42
    };
    const ej = h.sim.helpers.npcJobs.byEntity(h.escort.id);
    assert.equal(h.sim.helpers.npcJobs.claimControl(ej.job.id, {
      claimId: 'player-tow',
      holder: 'test'
    }).granted, true);
    tick(120);
    assert.equal(row.leg, leg);
    assert.equal(h.sim.helpers.traffic.pallasWorkTarget(hj, h.hauler).settled, true);
    h.sim.helpers.npcJobs.releaseControl(ej.job.id, 'player-tow');
    const originalIdentity = h.escort.data.identityKey;
    h.escort.data.identityKey = 'someone-else';
    assert.equal(h.sim.helpers.traffic.pallasWorkTarget(hj, h.hauler).blocked, true);
    tick();
    assert.match(pallasShiftStatus(h.state, h.hauler).label, /HOLD FOR ESCORT/);
    assert.match(pallasShiftStatus(h.state, h.hauler).text, /Holding here/);
    h.escort.data.identityKey = originalIdentity;
    h.escort.hull = 0;
    h.escort.alive = false;
    tick();
    assert.equal(row.phase, 'lost');
    assert.equal(row.lostRole, 'escort');
    assert.equal(row.arrived, false);
    tick();
    assert.notEqual(h.sim.helpers.npcJobs.byEntity(h.hauler.id)?.job.payload?.pallasWorkShift, C.id);
    assert.match(pallasShiftStatus(h.state, h.hauler).text, /escort is gone/);
  } finally {
    h.close();
  }
});
test('traffic Continue state resets dwell, preserves finite passage and drops legacy false progress', async () => {
  const h = await pallasNativeFixture({
    native: false
  });
  try {
    for (let i = 0; i < 100; i++) {
      h.state.tick++;
      h.owner.update(1 / 60, h.state);
    }
    const before = h.owner.serialize();
    assert.equal(before.pallasWorkLoop.phase, 'running');
    h.state.traffic.pallasWorkLoop.dwell = 1.49;
    h.owner.deserialize(before);
    assert.equal(h.state.traffic.pallasWorkLoop.phase, 'running');
    assert.equal(h.state.traffic.pallasWorkLoop.dwell, 0);
    h.owner.deserialize(null);
    assert.equal(h.state.traffic.pallasWorkLoop.phase, 'waiting');
    assert.equal(h.state.traffic.pallasWorkLoop.arrived, false);
  } finally {
    h.close();
  }
});
test('the authenticated native gate rejects nearby scalar spoofing and detached jobs', async () => {
  const h = await pallasNativeFixture();
  try {
    h.step(6);
    const job = h.sim.helpers.npcJobs.byEntity(h.hauler.id);
    assert.ok(job);
    assert.ok(h.sim.helpers.traffic.pallasWorkTarget(job, h.hauler).workPose);
    const pos = {
      ...h.hauler.pos
    };
    h.hauler.pos.x += 100;
    assert.equal(h.sim.helpers.traffic.pallasWorkTarget(job, h.hauler).blocked, true);
    Object.assign(h.hauler.pos, pos);
    assert.equal(h.sim.helpers.traffic.pallasWorkTarget({
      ...job
    }, h.hauler).blocked, true);
    const body = h.physics._sg02.records.get(h.hauler.id).body;
    body.setEnabled(false);
    assert.equal(h.sim.helpers.traffic.pallasWorkTarget(job, h.hauler).blocked, true);
    body.setEnabled(true);
  } finally {
    h.close();
  }
});
test('ordinary native Continue keeps the same two world identities and reaches Hollow Hub', {
  timeout: 180000
}, async () => {
  const h = await pallasNativeFixture();
  try {
    for (let i = 0; i < 60 * 90; i++) h.step();
    const ids = [h.hauler.data.worldRecordId, h.escort.data.worldRecordId];
    const save = h.sim.registry.get('save'),
      envelope = JSON.parse(JSON.stringify(save.serialize('pallas-mid-passage')));
    const phase = h.state.traffic.pallasWorkLoop.phase;
    assert.ok(['joining', 'running'].includes(phase));
    assert.equal(save.loadEnvelope(envelope, 'pallas-mid-passage'), true);
    h.physics._finishNativeRestore();
    h.state.mode = 'flight';
    assert.equal(await h.physics.prepareBackend(h.state), true);
    assert.equal(h.state.traffic.pallasWorkLoop.phase, phase);
    assert.equal(h.state.traffic.pallasWorkLoop.dwell, 0);
    for (const id of ids) assert.equal(h.state.entityList.filter(e => e.alive !== false && e.data?.worldRecordId === id).length, 1);
    for (let i = 0; i < 60 * 360 && !h.state.traffic.pallasWorkLoop.arrived; i++) h.step();
    assert.equal(h.state.traffic.pallasWorkLoop.phase, 'arrived');
    const finished = JSON.parse(JSON.stringify(save.serialize('pallas-arrived')));
    assert.equal(save.loadEnvelope(finished, 'pallas-arrived'), true);
    h.physics._finishNativeRestore();
    h.state.mode = 'flight';
    await h.physics.prepareBackend(h.state);
    h.step(60);
    assert.equal(h.state.traffic.pallasWorkLoop.phase, 'arrived');
    assert.equal(h.state.traffic.pallasWorkLoop.joined, true);
    for (const id of ids) assert.equal(h.state.entityList.filter(e => e.alive !== false && e.data?.worldRecordId === id).length, 1);
    console.log('PALLAS_CONTINUE', JSON.stringify({
      savedPhase: phase,
      arrived: true,
      worldRecordIds: ids
    }));
  } finally {
    h.close();
  }
});

test('ordinary Hail offers readable status on both roles and names the actual destination', async () => {
  const h = await pallasNativeFixture({ native: false });
  try {
    h.state.tick++; h.owner.update(1 / 60, h.state);
    for (const entity of [h.hauler, h.escort]) {
      h.state.player.targetId = entity.id;
      const availability = contactHailAvailability(h.state);
      assert.equal(availability.enabled, true);
      const offer = createContactHailOffer(h.state, availability, 'test-pallas-hail', 30);
      assert.ok(offer.actions.some(action => action.id === 'status'));
      const reply = createContactHailResponse(h.state, offer, 'status');
      assert.match(reply.lines[0], /patrol comes alongside/);
      if (offer.kind === 'trader') {
        const route = createContactHailResponse(h.state, offer, 'route');
        const hub = h.state.entityList.find(e => e.data?.stationId === C.stationId);
        assert.ok(route.lines[0].includes(hub.data.name));
      }
      if (offer.kind === 'patrol') {
        assert.match(createContactHailResponse(h.state, offer, 'status', { weaponsAuthorized: true }).lines[0], /WEAPONS AUTHORIZED/);
      }
    }
  } finally { h.close(); }
});
