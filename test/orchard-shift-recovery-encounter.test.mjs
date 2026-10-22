import test from 'node:test';
import assert from 'node:assert/strict';
import { bootShift } from './fixtures/orchard-shift-recovery.mjs';
import { createOrchardShiftEncounter } from '../src/world/anvilOrchardShiftEncounter.js';
import { stepLatchRepair } from '../src/combat/latchRepair.js';
import { anvilBuyerApproach, anvilWorkerRecordId, ANVIL_WORK } from '../src/systems/anvilWork.js';
import { PLANET_SITE } from '../src/data/planets.js';
import { voiceArbiter } from '../src/ui/voiceArbiter.js';
const KEY = 'anvilOrchardShift';
function setup() {
  const t = bootShift(), ctx = t.sim.registry.ctx;
  const voice = { ...voiceArbiter }; voice.init(ctx);
  const encounter = createOrchardShiftEncounter(ctx), heard = [];
  t.sim.bus.on('voice:surface', p => { if (p.kind === 'anvil-orchard-shift') heard.push(p); });
  function update() { encounter.update(t.state); voice.update(1 / 60, t.state); }
  function line() {
    const a = { id: 'actual-line', state: 'active', ownerId: t.player.id, targetId: t.receiver.id,
      ownerGeneration: t.player.occupantGeneration, targetGeneration: t.receiver.occupantGeneration,
      phase: 'loaded', restLength: 100 };
    t.state.combat.attachments.byId[a.id] = a;
    t.state.player.tether = { active: true, targetId: t.receiver.id, attachmentId: a.id, phase: 'loaded' };
    return a;
  }
  function repair() {
    t.disable(); update(); line();
    stepLatchRepair(t.state, 1 / 60, t.sim.bus);
    assert.equal(t.state.combat.entities[t.receiver.id].capabilities.drive, true);
  }
  function load(qty = 7) {
    t.owner._setTrafficManifest(t.receiver, t.state.traffic.freighters.find(r => r.id === t.receiver.id),
      t.owner._buildMinerManifest(t.receiver, 0, PLANET_SITE.harvest.commodityShallow, qty));
    t.receiver.data.itinerary.phase = 'delivery';
  }
  function deliver() {
    load(); t.receiver.pos = anvilBuyerApproach(t.receiver, t.station); t.receiver.vel = { x: 0, z: 0 };
    assert.equal(t.owner._deliverAnvilReceiver(t.receiver, t.station), true);
    t.player.pos = { x: t.receiver.pos.x, z: t.receiver.pos.z + 100 };
  }
  function later() { t.state.simTime += 12; t.state.tick += 720; update(); }
  function reload() {
    const saver = t.sim.registry.get('save');
    const data = JSON.parse(JSON.stringify(saver.serialize('orchard-shift')));
    assert.equal(saver.loadEnvelope(data), true); t.state.mode = 'flight';
    t.receiver = t.state.entityList.find(e => e.alive && e.data?.worldRecordId === anvilWorkerRecordId(t.state, 'receiver'));
    t.player = t.state.entities.get(t.state.playerId);
    t.station = t.state.entityList.find(e => e.alive && e.data?.stationId === ANVIL_WORK.buyerId);
    return data;
  }
  return Object.assign(t, { voice, encounter, heard, update, line, repair, load, deliver, later, reload,
    close() { encounter.destroy(); voice.destroy?.(); t.sim.dispose(); } });
}

test('real latch repair and actual finite receiver handoff earn distinct, deduplicated Alin acknowledgements', () => {
  const t = setup(); try {
    const credits = t.state.player.credits;
    t.repair(); assert.ok(t.state.player.hints[KEY]);
    t.later(); assert.ok(t.heard.some(p => /Drive’s back/.test(p.text)));
    t.deliver(); t.later(); assert.ok(t.heard.some(p => /Tethys signed for 7 units/.test(p.text)));
    const receipt = t.state.economy.committedIntents[`freight:anvil-delivery:${t.receiver.data.worldRecordId}:0`].receipt;
    t.sim.bus.emit('economy:freightAccepted', receipt); t.later();
    assert.equal(t.heard.filter(p => /Tethys signed for/.test(p.text)).length, 1);
    assert.equal(t.receiver.data.cargoManifest.totalQty, 0);
    assert.equal(t.state.player.credits, credits);
  } finally { t.close(); }
});

test('repair acknowledgement survives actual Continue before and after its voice surface', () => {
  const t = setup(); try {
    t.repair(); t.reload(); t.later();
    assert.ok(t.heard.some(p => /Drive’s back/.test(p.text)));
    const count = t.heard.length; t.reload(); t.later(); assert.equal(t.heard.length, count);
  } finally { t.close(); }
});

test('durable committed delivery survives Continue before and after acknowledgement', () => {
  const t = setup(); try {
    t.repair(); t.deliver(); t.reload(); t.later();
    assert.equal(t.heard.filter(p => /Tethys signed for 7 units/.test(p.text)).length, 1);
    t.reload(); t.later(); assert.equal(t.heard.filter(p => /Tethys signed for/.test(p.text)).length, 1);
  } finally { t.close(); }
});

test('Continue before repair clears old incarnation observation and permits a fresh genuine repair', () => {
  const t = setup(); try {
    t.disable(); t.update(); t.reload(); assert.equal(t.state.player.hints[KEY], undefined);
    t.kernel.inspect({ entityId: t.receiver.id });
    t.update(); t.line(); stepLatchRepair(t.state, 1 / 60, t.sim.bus);
    assert.ok(t.state.player.hints[KEY]);
  } finally { t.close(); }
});

for (const kind of ['healthy-forgery', 'wrong-player', 'wrong-source', 'wrong-target', 'stale-life', 'wrong-job', 'dead', 'missing', 'unresolved', 'slack', 'cut', 'missing-runtime', 'missing-drive', 'stale-observation', 'duplicate']) {
  test(`repair attribution refuses ${kind}`, () => {
    const t = setup(); try {
      if (kind !== 'healthy-forgery') t.disable();
      t.update(); const a = t.line();
      const p = { targetId: t.receiver.id, subsystemId: 'subsystem_drive', source: 'latch_repair', repairedBy: t.player.id, dependencyDisabled: false };
      if (kind === 'wrong-player') p.repairedBy = 99999;
      if (kind === 'wrong-source') p.source = 'other';
      if (kind === 'wrong-target') p.targetId = t.player.id;
      if (kind === 'stale-life') a.targetGeneration++;
      if (kind === 'wrong-job') t.receiver.data.jobId = 'other-owner';
      if (kind === 'dead') t.receiver.alive = false;
      if (kind === 'missing') t.state.entities.delete(t.receiver.id);
      if (kind === 'unresolved') t.state.combat.entities[t.receiver.id].orchardDamageUnresolved = true;
      if (kind === 'slack') { t.state.player.tether.phase = 'slack'; a.phase = 'slack'; a.restLength = 10000; }
      if (kind === 'cut') a.state = 'broken';
      // Let the real repair kernel establish an operational hull first, but
      // withhold its notification so the tested predicate is the sole rejection.
      if (!['healthy-forgery', 'dead', 'missing', 'slack', 'cut'].includes(kind)) {
        stepLatchRepair(t.state, 1 / 60, { emit() {} });
        assert.equal(t.state.combat.entities[t.receiver.id].capabilities.drive, true);
      }
      if (kind === 'missing-runtime') delete t.state.combat.entities[t.receiver.id];
      if (kind === 'missing-drive') delete t.state.combat.entities[t.receiver.id].subsystems.subsystem_drive;
      if (kind === 'stale-observation') t.update();
      if (kind === 'duplicate') t.sim.spawn({ type: 'ship', hull: 200, hullMax: 200, data: { worldRecordId: t.receiver.data.worldRecordId } });
      t.sim.bus.emit('combat:subsystemEnabled', p);
      assert.equal(t.state.player.hints[KEY], undefined);
    } finally { t.close(); }
  });
}

for (const kind of ['receipt-event-only', 'wrong-source', 'wrong-quantity', 'wrong-station', 'wrong-record', 'pre-repair', 'dead', 'missing', 're-disabled', 'bad-memory', 'future-sequence']) {
  test(`delivery acknowledgement refuses ${kind}`, () => {
    const t = setup(); try {
      if (kind === 'pre-repair') t.deliver();
      t.repair();
      if (kind !== 'pre-repair' && kind !== 'receipt-event-only') t.deliver();
      const id = `freight:anvil-delivery:${t.receiver.data.worldRecordId}:0`;
      const committed = t.state.economy.committedIntents?.[id];
      if (kind === 'receipt-event-only') t.sim.bus.emit('economy:freightAccepted', { receiptId: id.slice(8), source: 'anvil_work', qty: 7 });
      if (kind === 'wrong-source') committed.receipt.source = 'mission_delivery';
      if (kind === 'wrong-quantity') committed.result.qty = 9;
      if (kind === 'wrong-station') committed.receipt.stationId = 'wrong';
      if (kind === 'wrong-record') committed.receipt.receiptId = 'wrong';
      if (kind === 'dead') t.receiver.alive = false;
      if (kind === 'missing') t.state.entities.delete(t.receiver.id);
      if (kind === 're-disabled') t.disable();
      if (kind === 'future-sequence') t.state.player.hints[KEY].sequence = 999;
      if (kind === 'bad-memory') t.state.player.hints[KEY].recordId = 'foreign';
      t.later(); assert.equal(t.heard.some(p => /Tethys signed for/.test(p.text)), false);
    } finally { t.close(); }
  });
}

test('forecast alert keeps priority over shift bark and lifetime changes retract queued claims', () => {
  const t = setup(); try {
    t.sim.helpers.voice.say({ id: 'forecast', channel: 'alert', text: 'Gust approaching.', ttl: 30 });
    t.voice.update(0, t.state); t.disable(); t.update();
    assert.equal(t.heard.length, 0);
    t.receiver.alive = false; t.sim.helpers.voice.cancel('forecast'); t.voice.update(0, t.state);
    assert.equal(t.heard.length, 0);
  } finally { t.close(); }
});

test('bounded native original-tender repair and thrust-driven buyer delivery preserve finite custody', async () => {
  const { flightV3 } = await import('../src/systems/flightV3.js');
  const { physics } = await import('../src/core/physics.js');
  const { combat } = await import('../src/systems/combat.js');
  const t = bootShift([flightV3, physics, combat]);
  const encounter = createOrchardShiftEncounter(t.sim.registry.ctx);
  try {
    const receiver = t.receiver, recordId = receiver.data.worldRecordId;
    t.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    t.owner._setTrafficManifest(receiver, t.state.traffic.freighters.find(r => r.id === receiver.id),
      t.owner._buildMinerManifest(receiver, 0, PLANET_SITE.harvest.commodityShallow, 7));
    const target = anvilBuyerApproach(receiver, t.station);
    // Focused encounter starts on the final clear buyer approach, before native admission.
    // The test does not stand in for the already-proven planet-wide delivery route.
    receiver.pos = { x: target.x + 85, z: target.z }; receiver.rot = Math.PI;
    receiver.data.itinerary.phase = 'delivery'; receiver.data.itinerary.buyerIngressReached = true;
    t.player.pos = { x: receiver.pos.x, z: receiver.pos.z + 110 };
    receiver.hull = 188; t.disable(); encounter.update(t.state);
    const retainedQty = receiver.data.cargoManifest.totalQty;
    const spilled = t.state.entityList.filter(e => e.type === 'payload' && e.data?.spillCause).reduce((n, e) => n + e.data.amount, 0);
    assert.equal(retainedQty + spilled, 7); assert.equal(spilled, 1, 'real disable damage spills cargo; never refill it');
    const facade = t.sim.registry.get('physics'); assert.equal(await facade.prepareBackend(t.state), true);
    const kernel = t.sim.registry.get('combat').kernel;
    const created = kernel.attachments.create({ defId: 'tether_standard', ownerId: t.player.id, targetId: receiver.id,
      sourceWorld: { ...t.player.pos }, targetWorld: { ...receiver.pos } });
    assert.equal(created.ok, true, created.reason);
    t.state.player.tether = { active: true, targetId: receiver.id, attachmentId: created.attachment.id, phase: 'slack' };
    assert.ok(created.attachment.physicsHandle != null);
    for (let i = 0; i < 180 && !t.state.player.hints[KEY]; i++) {
      t.owner._stepAnvilReceiver(receiver); t.sim.step();
      stepLatchRepair(t.state, 1 / 60, t.sim.bus); encounter.update(t.state);
    }
    assert.ok(t.state.player.hints[KEY], 'native taut attachment and real repair event establish player help');
    assert.equal(kernel.attachments.breakAttachment(created.attachment, 'manual_release', t.player.id).ok, true);
    t.state.player.tether.active = false;
    const start = { ...receiver.pos }; let acceptanceDelta = null;
    for (let i = 0; i < 3600 && receiver.data.itinerary.sequence === 0; i++) {
      const before = t.state.economy.markets[ANVIL_WORK.buyerId][PLANET_SITE.harvest.commodityShallow].stock;
      t.owner._stepAnvilReceiver(receiver);
      if (receiver.data.itinerary.sequence === 1) acceptanceDelta = t.state.economy.markets[ANVIL_WORK.buyerId][PLANET_SITE.harvest.commodityShallow].stock - before;
      t.sim.step(); encounter.update(t.state);
    }
    assert.equal(receiver.data.itinerary.sequence, 1, `final approach ${JSON.stringify(receiver.pos)} target ${JSON.stringify(target)}`);
    assert.ok(Math.hypot(receiver.pos.x - start.x, receiver.pos.z - start.z) > 40, 'actual native movement, no post-admission pose writes');
    assert.equal(receiver.data.worldRecordId, recordId); assert.equal(receiver.data.cargoManifest.totalQty, 0);
    assert.ok(Math.abs(acceptanceDelta - retainedQty) < 1e-9, 'measure actual retained acceptance before ongoing consumption');
    const receipt = t.state.economy.committedIntents[`freight:anvil-delivery:${recordId}:0`].receipt;
    assert.equal(receipt.qty, retainedQty); assert.equal(receipt.qty + spilled, 7); assert.equal(receipt.source, 'anvil_work');
  } finally { encounter.destroy(); t.sim.dispose(); }
});

test('late delivery recognition never backtracks into a repair acknowledgement that was not heard', () => {
  const t = setup(); try {
    t.repair(); t.deliver(); t.later(); t.later(); t.reload(); t.later();
    assert.equal(t.heard.filter(p => /Tethys signed for/.test(p.text)).length, 1);
    assert.equal(t.heard.filter(p => /Drive’s back/.test(p.text)).length, 0);
    assert.equal(t.state.player.hints[KEY].heardRepair, false, 'never claim unheard audio was heard');
  } finally { t.close(); }
});

test('reset retracts active/queued speech and destroy removes the repair listener', () => {
  const t = setup(); try {
    t.disable(); t.update(); assert.ok(t.voice.queue.active);
    t.encounter.reset(); t.voice.update(0, t.state); assert.equal(t.voice.queue.active, null);
    t.encounter.update(t.state); t.line(); t.encounter.destroy();
    stepLatchRepair(t.state, 1 / 60, t.sim.bus); assert.equal(t.state.player.hints[KEY], undefined);
    assert.equal(t.voice.queue.active, null);
  } finally { t.close(); }
});

test('full decisions are bounded to two per second and far cached workers do not scan the population', () => {
  const t = setup(); try {
    t.update(); let scans = 0;
    const values = t.state.entities.values.bind(t.state.entities);
    t.state.entities.values = () => { scans++; return values(); };
    for (let i = 1; i < 30; i++) { t.state.tick = i; t.state.simTime = i / 60; t.update(); }
    assert.equal(scans, 0, 'no full decisions between cadence ticks');
    t.state.tick = 30; t.update(); assert.ok(scans > 0 && scans < 15);
    t.player.pos.x += 10000; scans = 0;
    for (let i = 31; i <= 180; i++) { t.state.tick = i; t.state.simTime = i / 60; t.update(); }
    assert.equal(scans, 0, 'far cached identity avoids damage/canonical population walks');
  } finally { t.close(); }
});

test('unrelated subsystem events do not traverse Orchard population', () => {
  const t = setup(); try {
    let scans = 0; const values = t.state.entities.values.bind(t.state.entities);
    t.state.entities.values = () => { scans++; return values(); };
    for (let n = 0; n < 100; n++) {
      t.sim.bus.emit('combat:subsystemDisabled', { targetId: t.player.id, subsystemId: 'subsystem_drive' });
      t.sim.bus.emit('combat:subsystemEnabled', { targetId: t.player.id, subsystemId: 'subsystem_drive', source: 'latch_repair', repairedBy: t.player.id, dependencyDisabled: false });
      t.sim.bus.emit('combat:subsystemEnabled', { targetId: t.receiver.id, subsystemId: 'subsystem_weapon', source: 'latch_repair', repairedBy: t.player.id, dependencyDisabled: false });
    }
    assert.equal(scans, 0);
  } finally { t.close(); }
});
