import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './fixtures/anvil-orchard-custody-source.mjs';
import { ready } from './fixtures/anvil-orchard-custody-ready.mjs';
import { createOrchardHarvestEncounter } from '../src/world/anvilOrchardHarvestEncounter.js';
import { stableEntityKey } from '../src/data/interactionDescriptorCatalog.js';
import { cargo } from '../src/systems/cargo.js';
import { mining } from '../src/systems/mining.js';

function guide(h) {
  const { state } = h.sim, ctx = h.sim.registry.ctx;
  state.planet = { ...(state.planet || {}), orchardFrameId: h.frame.id };
  Object.assign(h.worker.pos, { x: h.frame.pos.x + 180, z: h.frame.pos.z });
  state.player.hints.anvilOrchardAlin = { heard: { intro: true }, lastSpokeAt: -20 };
  state.settings.controls.bindings = { ...state.settings.controls.bindings, siteBeam: ['KeyN'] };
  const said = [], cancelled = [];
  ctx.helpers.voice = { say(line) { said.push(line); return true; }, cancel(id) { cancelled.push(id); } };
  const encounter = createOrchardHarvestEncounter(ctx);
  const step = (tick = 60) => { state.tick = tick; state.simTime = tick / 60; encounter.update(state); };
  const surface = () => { const line = said.at(-1); assert.ok(line?.valid()); h.sim.bus.emit('voice:surface', line); };
  const select = () => { state.player.targetId = h.frame.id; state.ui.componentSelection = {
    targetId: h.frame.id, stableKey: stableEntityKey(h.frame), componentId: 'orchard_socket_1' }; };
  return { ...h, state, said, cancelled, encounter, step, surface, select,
    close() { encounter.destroy(); h.close(); } };
}

test('occupied socket discovery teaches actual remapped release without changing finite work', async () => {
  const h = guide(await setup());
  try {
    h.step(); assert.equal(h.said.length, 0, 'empty frame has no release promise');
    assert.equal(h.accept(), 4);
    const before = JSON.stringify(h.state.sites.anvilOrchard);
    h.step(90); assert.match(h.said.at(-1).text, /Socket 2 holds 4 units.*component readout/);
    h.surface(); h.select();
    assert.equal(h.said.at(-1).valid(), false, 'changing selection retracts stale discovery');
    h.step(1021); assert.match(h.said.at(-1).text, /Hold N \(World Site beam\)/);
    h.surface(); h.step(2041);
    assert.equal(h.said.length, 2, 'each surfaced affordance is taught once');
    assert.equal(JSON.stringify(h.state.sites.anvilOrchard), before);
  } finally { h.close(); }
});

test('queued guidance is not spent and cancels at weather, range, incarnation and load boundaries', async () => {
  const h = guide(await setup());
  try {
    h.accept(); h.step(); const first = h.said.at(-1);
    h.state.tick = 600; assert.equal(first.valid(), false);
    h.step(1021); assert.equal(h.said.length, 2);
    const second = h.said.at(-1); h.worker.pos.x += 500; assert.equal(second.valid(), false);
    h.worker.pos.x -= 500; h.step(2041);
    const third = h.said.at(-1); h.worker.occupantGeneration++; assert.equal(third.valid(), false);
    h.sim.bus.emit('save:loaded', {}); assert.ok(h.cancelled.length >= 3);
    assert.equal(h.state.player.hints.anvilOrchardHarvest.heard.select, undefined);
  } finally { h.close(); }
});

test('native released pod teaches whole-lot hold capacity; attached cargo is never invited', async () => {
  const h = guide(await ready());
  try {
    h.step(); assert.match(h.said.at(-1).text, /Released pod: 4 units, 10 hold volume/);
    assert.ok(h.said.at(-1).valid());
    h.state.combat ||= {}; h.state.combat.attachments = { byId: { tow: {
      state: 'active', targetId: h.pod.id, targetGeneration: h.pod.occupantGeneration } } };
    assert.equal(h.said.at(-1).valid(), false);
    h.step(90); assert.equal(h.said.length, 1);
    delete h.state.combat.attachments.byId.tow;
    h.step(120); assert.equal(h.said.length, 2);
    h.surface(); h.step(1021); assert.equal(h.said.length, 2);
  } finally { h.close(); }
});

test('real cargo refusal never acknowledges; accepted finite pickup survives Save/Continue once', async () => {
  const raw = await ready();
  const registry = raw.sim.registry, get = registry.get.bind(registry);
  registry.get = name => name === 'cargo' ? cargo : get(name);
  cargo.init(registry.ctx); mining.init(registry.ctx);
  const h = guide(raw);
  try {
    const cap = h.state.player.cargo.capVolume;
    h.state.player.cargo.capVolume = 0;
    mining._collectPickupViaEvent(h.pod, h.worker);
    assert.equal(h.state.player.hints.anvilOrchardHarvest?.collected, undefined);
    h.state.player.cargo.capVolume = cap; h.state.simTime = 2;
    mining._collectPickupViaEvent(h.pod, h.worker);
    assert.equal(h.state.sites.anvilOrchard.lots[0].outcome, 'delivered');
    assert.deepEqual(h.state.player.hints.anvilOrchardHarvest?.collected, { lotId: h.pod.data.worldRecordId, units: 4 });
    h.step(120); assert.match(h.said.at(-1).text, /4 units of hydrogen accepted into your hold/);
    const saved = JSON.parse(JSON.stringify(h.sim.registry.get('save').serialize('harvest-guide')));
    assert.equal(saved.data.player.hints.anvilOrchardHarvest.heard.collected, undefined);
    let completion;
    h.sim.helpers.finalizeLoadedGame = () => {
      completion = h.facade.prepareBackend(h.state).then(ok => { assert.equal(ok, true); h.state.mode = 'flight'; });
      return completion;
    };
    const restore = async envelope => {
      assert.equal(h.sim.registry.get('save').loadEnvelope(envelope), true);
      await completion;
      assert.equal(h.state.mode, 'flight');
      // This focused owner composition has no planetRuntime; restore its frame
      // locator only. The actual native frame/cargo/ledger come from Save/Continue.
      h.state.planet.orchardFrameId = h.state.entityList.find(e => e.alive && e.data?.orchardKind === 'frame').id;
    };
    await restore(saved); h.step(150);
    assert.equal(h.said.length, 2, 'accepted but unheard acknowledgment is offered after Continue');
    h.surface();
    const surfaced = JSON.parse(JSON.stringify(h.sim.registry.get('save').serialize('harvest-guide-heard')));
    assert.equal(surfaced.data.player.hints.anvilOrchardHarvest.heard.collected, true);
    await restore(surfaced); h.step(1021); assert.equal(h.said.length, 2);

  } finally { h.close(); }
});

test('attempted, partial, wrong-player and duplicate receipts cannot invent or multiply acknowledgment', async () => {
  const h = guide(await ready());
  try {
    const receipt = { pickupId: h.pod.id, collectorId: h.worker.id, kind: 'ore',
      commodityId: 'cmdty_gas_hydrogen', amount: 4, acceptedAmount: 4, rejectedAmount: 0 };
    for (const patch of [{}, { collectorId: -1 }, { acceptedAmount: 0, rejectedAmount: 4 },
      { acceptedAmount: 2, rejectedAmount: 2 }, { commodityId: 'cmdty_ore_iron' }, { pickupId: -1 }]) {
      h.sim.bus.emit('pickup:collected', { ...receipt, ...patch });
    }
    assert.equal(h.state.player.hints.anvilOrchardHarvest, undefined,
      'even a complete-looking event cannot replace delivered custody and real cargo');
    assert.equal(h.state.sites.anvilOrchard.lots[0].outcome, 'retained');
    assert.equal(h.state.player.cargo.items.cmdty_gas_hydrogen || 0, 0);
  } finally { h.close(); }
});

test('decision cadence is bounded and queued voice checks do not rescan entities or native custody', async () => {
  const h = guide(await ready());
  try {
    let scans = 0, native = 0;
    const values = h.state.entities.values.bind(h.state.entities);
    h.state.entities.values = () => { scans++; return values(); };
    const read = h.facade.readOrchardPodReady.bind(h.facade);
    h.facade.readOrchardPodReady = (...args) => { native++; return read(...args); };
    h.step(); assert.equal(scans, 0); assert.equal(native, 1);
    const cue = h.said.at(-1);
    for (let i = 0; i < 5400; i++) assert.equal(cue.valid(), true);
    for (let tick = 61; tick < 90; tick++) h.step(tick);
    assert.equal(scans, 0); assert.equal(native, 1);
    h.surface(); h.step(1021); assert.equal(scans, 0); assert.equal(native, 1);
  } finally { h.close(); }
});

test('real voice arbitration gives the weather alert priority and does not spend queued guidance', async () => {
  const { voiceArbiter } = await import('../src/ui/voiceArbiter.js');
  const h = guide(await setup());
  const voice = { ...voiceArbiter };
  voice.init(h.sim.registry.ctx);
  try {
    h.accept();
    h.sim.helpers.voice.say({ id: 'weather', channel: 'alert', priority: 110, text: 'Gust approaching', ttl: 30 });
    voice.update(0, h.state);
    h.step(); voice.update(0, h.state);
    assert.equal(h.state.player.hints.anvilOrchardHarvest.heard.select, undefined);
    h.state.tick = 600; h.encounter.update(h.state);
    h.sim.helpers.voice.cancel('weather'); voice.update(0, h.state);
    assert.equal(voice.queue.active, null);
    assert.equal(h.state.player.hints.anvilOrchardHarvest.heard.select, undefined);
  } finally { voice.destroy?.(); h.close(); }
});

test('retired original receipt replay passes through cargo refusal rather than inventing another pickup', async () => {
  const raw = await ready();
  const registry = raw.sim.registry, get = registry.get.bind(registry);
  registry.get = name => name === 'cargo' ? cargo : get(name);
  cargo.init(registry.ctx); mining.init(registry.ctx);
  const h = guide(raw);
  try {
    mining._collectPickupViaEvent(h.pod, h.worker);
    assert.equal(h.state.player.hints.anvilOrchardHarvest.collected.units, 4);
    delete h.state.player.hints.anvilOrchardHarvest;
    const replay = { pickupId: h.pod.id, collectorId: h.worker.id, kind: 'ore',
      commodityId: 'cmdty_gas_hydrogen', amount: 4, acceptedAmount: 4, rejectedAmount: 0 };
    h.sim.bus.emit('pickup:collected', replay);
    assert.equal(replay.acceptedAmount, 0);
    assert.equal(h.state.player.hints.anvilOrchardHarvest, undefined);
    assert.equal(h.state.player.cargo.items.cmdty_gas_hydrogen, 4);
  } finally { h.close(); }
});

test('malformed saved hints reset safely without fabricating a pickup', async () => {
  const h = guide(await setup());
  try {
    h.accept();
    for (const hint of [null, [], {version: 2, heard: {}, collected: null},
      {version: 1, heard: [], collected: null}, {version: 1, heard: {}, collected: 'all'},
      {version: 1, heard: {}, collected: {lotId: 'anvil_storm_orchard:1:1', units: 400}},
      {version: 1, heard: {select: 'yes'}, collected: null}]) {
      h.state.player.hints.anvilOrchardHarvest = hint;
      h.encounter.reset(); h.step();
      assert.equal(h.state.player.hints.anvilOrchardHarvest.collected, null);
      assert.match(h.said.at(-1).text, /Socket 2 holds/);
    }
  } finally { h.close(); }
});

test('queued pickup retracts on native body replacement, restore and unavailable authority', async () => {
  const h = guide(await ready());
  try {
    h.step(); const cue = h.said.at(-1), spec = h.pod.physicsBody;
    h.pod.physicsBody = {...spec}; assert.equal(cue.valid(), false); h.pod.physicsBody = spec;
    h.facade._nativeRestorePending = true; assert.equal(cue.valid(), false); h.facade._nativeRestorePending = false;
    const record = h.owner.records.get(h.pod.id);
    h.owner.records.delete(h.pod.id); assert.equal(cue.valid(), false); h.owner.records.set(h.pod.id, record);
    h.facade._diag.sg02Ready = false; assert.equal(cue.valid(), false); h.facade._diag.sg02Ready = true;
    h.state.settings.gameplay.physicsBackend = 'custom'; assert.equal(cue.valid(), false);
    h.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    h.state.tick = 600; assert.equal(cue.valid(), false);
  } finally { h.close(); }
});

test('integrated Alin loss bark preempts optional harvest instructions', async () => {
  const { createOrchardEncounter } = await import('../src/world/anvilOrchardEncounter.js');
  const { voiceArbiter } = await import('../src/ui/voiceArbiter.js');
  const h = guide(await ready()); h.encounter.destroy();
  const voice = {...voiceArbiter}; voice.init(h.sim.registry.ctx);
  const alin = createOrchardEncounter(h.sim.registry.ctx);
  try {
    h.accept(4, 0);
    h.pod.alive = false; h.sim.registry.systems[0].lifetimeSweep(0, h.state);
    h.state.tick = 60; h.state.simTime = 1;
    alin.update(h.state); voice.update(0, h.state);
    assert.match(voice.queue.active.text, /Lost the harvest/);
    assert.equal(h.state.player.hints.anvilOrchardHarvest.heard.select, undefined);
  } finally { alin.destroy(); voice.destroy?.(); h.close(); }
});

test('integrated damaged-tender warning preempts a nearby optional socket instruction', async () => {
  const { bootShift } = await import('./fixtures/orchard-shift-recovery.mjs');
  const { createOrchardEncounter } = await import('../src/world/anvilOrchardEncounter.js');
  const { voiceArbiter } = await import('../src/ui/voiceArbiter.js');
  const source = await setup(), t = bootShift();
  source.accept();
  // Focused voice composition: real canonical tender and combat damage, plus a
  // source-derived frame/finite socket scene. No native flight or harvesting claim.
  const frame = t.sim.spawn({ type: 'wreck', pos: {x: t.player.pos.x + 180, z: t.player.pos.z},
    rot: source.frame.rot, radius: source.frame.radius, hull: source.frame.hull,
    physicsBody: source.frame.physicsBody, data: structuredClone(source.frame.data) });
  t.state.planet = {orchardFrameId: frame.id};
  t.state.sites ||= {};
  t.state.sites.anvilOrchard = structuredClone(source.sim.state.sites.anvilOrchard);
  t.state.player.hints.anvilOrchardAlin = {heard: {intro: true}, lastSpokeAt: -20};
  const voice = {...voiceArbiter}; voice.init(t.sim.registry.ctx);
  const alin = createOrchardEncounter(t.sim.registry.ctx);
  try {
    t.disable(); t.state.tick = 60; t.state.simTime = 1;
    alin.update(t.state); voice.update(0, t.state);
    assert.match(voice.queue.active.text, /drive is down.*Hail it/);
    assert.equal(t.state.player.hints.anvilOrchardHarvest.heard.select, undefined);
  } finally { alin.destroy(); voice.destroy?.(); t.sim.dispose(); source.close(); }
});

test('guidance waits for enough calm to read and retracts a remapped beam caption', async () => {
  const h = guide(await setup());
  try {
    h.accept(); h.select(); h.step(500); assert.equal(h.said.length, 0);
    h.step(1021); assert.match(h.said.at(-1).text, /Hold N/);
    h.state.settings.controls.bindings.siteBeam = ['KeyP'];
    assert.equal(h.said.at(-1).valid(), false);
    h.step(1051); assert.match(h.said.at(-1).text, /Hold P/);
  } finally { h.close(); }
});

test('native opening publishes a new finite row without truncating truthful selected guidance', async () => {
  const { tail } = await import('./fixtures/anvil-orchard-custody-ready.mjs');
  const raw = await setup();
  raw.worker = raw.sim.spawn({ type: 'ship', hull: 100, radius: 6,
    pos: {x: raw.frame.pos.x + 180, z: raw.frame.pos.z}, data: {defId: 'ship_kestrel'} });
  raw.sim.state.playerId = raw.worker.id;
  assert.equal(await raw.facade.prepareBackend(raw.sim.state), true);
  const h = guide(raw);
  try {
    h.accept(); h.select(); h.step(60);
    const cue = h.said.at(-1), before = h.state.sites.anvilOrchard;
    assert.equal(h.owner.requestOrchardFiniteRelease(h.frame, 1, h.state), true);
    tail(h, 61);
    assert.notEqual(h.state.sites.anvilOrchard, before);
    assert.equal(h.state.sites.anvilOrchard.sockets[1].operation, 'opening');
    assert.equal(cue.valid(), true, 'the same selected original socket is still opening');
  } finally { h.close(); }
});
