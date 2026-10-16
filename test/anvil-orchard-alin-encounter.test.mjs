import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceQueue, voiceArbiter } from '../src/ui/voiceArbiter.js';

test('targeted voice validity retracts active and queued lines without changing ordinary floor', () => {
  const q = new VoiceQueue({ barkMinGapMs: 0 });
  let current = true;
  q.enqueue({ id: 'alin', text: 'Current cue', valid: () => current }, 0);
  assert.equal(q.step(0).id, 'alin');
  current = false;
  q.enqueue({ id: 'ordinary', text: 'Ordinary' }, 1);
  assert.equal(q.step(1)?.id, 'ordinary');
  q.enqueue({ id: 'stale', text: 'Stale', priority: 99, valid: () => false }, 2);
  assert.equal(q.step(2), null);
  assert.equal(q.active.id, 'ordinary');
  q.enqueue({ id: 'throws', text: 'Throws', priority: 99, valid: () => { throw Error('gone'); } }, 3);
  assert.equal(q.step(3), null);
  assert.equal(q.active.id, 'ordinary');
  assert.equal(q.cancel('ordinary'), true);
  assert.equal(q.active, null);
});

import { setup } from './fixtures/anvil-orchard-custody-source.mjs';
import { createOrchardEncounter } from '../src/world/anvilOrchardEncounter.js';

async function encounter() {
  const h = await setup();
  Object.assign(h.worker.pos, { x: h.frame.pos.x + 200, z: h.frame.pos.z });
  const ctx = h.sim.registry.ctx;
  const voice = { ...voiceArbiter }; voice.init(ctx);
  const alin = createOrchardEncounter(ctx);
  const heard = [], cleared = [];
  h.sim.bus.on('voice:surface', e => heard.push(e));
  h.sim.bus.on('voice:clear', e => cleared.push(e));
  const tick = (n, seconds = n / 60) => {
    h.sim.state.tick = n; h.sim.state.simTime = seconds;
    alin.update(h.sim.state); voice.update(1 / 60, h.sim.state);
  };
  return { ...h, voice, alin, heard, cleared, tick, close() { alin.destroy(); h.close(); } };
}

test('Alin introduction spends only surfaced milestone; queued sector and life changes are refused', async () => {
  const h = await encounter();
  try {
    h.sim.helpers.voice.say({ id: 'danger', channel: 'alert', priority: 110, text: 'Danger', ttl: 30 });
    h.voice.update(0, h.sim.state);
    h.tick(1);
    assert.equal(h.sim.state.player.hints.anvilOrchardAlin.heard.intro, undefined);
    h.sim.state.world.currentSectorId = 'elsewhere'; h.tick(2);
    h.sim.helpers.voice.cancel('danger'); h.voice.update(0, h.sim.state);
    assert.equal(h.heard.some(e => e.kind === 'anvil-orchard-alin'), false);
    h.sim.state.world.currentSectorId = 'sector_tethys_junction'; h.tick(3);
    assert.match(h.heard.at(-1).text, /Foreman Alin: The orchard is ready/);
    assert.equal(h.sim.state.player.hints.anvilOrchardAlin.heard.intro, true);
    h.worker.occupantGeneration++; h.voice.update(0, h.sim.state);
    assert.ok(h.cleared.some(e => e.id === 'alin:intro:intro'));
  } finally { h.close(); }
});

test('late forecast remains truthful and active caption clears at the gust boundary', async () => {
  const h = await encounter();
  try {
    h.tick(650);
    assert.match(h.heard.at(-1).text, /Gust approaching.*Wind toward NE\./); // +z is flight north
    assert.doesNotMatch(h.heard.at(-1).text, /in two/);
    h.sim.state.tick = 720; h.sim.state.simTime = 12;
    h.voice.update(0, h.sim.state);
    assert.equal(h.voice.queue.active, null);
    assert.equal(h.cleared.length, 1);
  } finally { h.close(); }
});

test('repeat uses ninety simulated seconds and off-sector or distant approach stays silent', async () => {
  const h = await encounter();
  try {
    h.worker.pos.x += 1000; h.tick(0); assert.equal(h.heard.length, 0);
    h.worker.pos.x -= 1000; h.tick(1, 0);
    h.tick(5400, 89.9); assert.equal(h.heard.filter(e => /Same sky/.test(e.text)).length, 0);
    h.tick(5401, 90); assert.equal(h.heard.filter(e => /Same sky/.test(e.text)).length, 1);
    h.tick(5402, 90); assert.equal(h.heard.filter(e => /Same sky/.test(e.text)).length, 1);
  } finally { h.close(); }
});

test('production worker normal Anvil admission transports surfaced Alin and lifecycle clears', async () => {
  const { createSimHost } = await import('../scripts/lib/simWorkerHost.mjs');
  const { readFileSync } = await import('node:fs');
  const { PLANET_SITE, PLANET_FLAGS } = await import('../src/data/planets.js');
  const { makeShipEntitySpec } = await import('../src/systems/ships.js');
  const lane = createSimHost();
  try {
    const init = await lane.init({ profile: 'production', seed: 424214, bridgeAll: true,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url))) });
    const { state, sim, registry } = lane.host;
    state.mode = 'flight'; state.world.currentSectorId = PLANET_SITE.sectorId;
    PLANET_FLAGS.enabled = true;
    let reply = await lane.tick({ tick: 1, steps: 1, ackEnd: init.journalSequence });
    const frame = state.entities.get(state.planet.orchardFrameId);
    assert.ok(frame, 'normal planet owner admits the canonical frame');
    const player = sim.spawn({ ...makeShipEntitySpec('ship_kestrel', {
      pos: { x: frame.pos.x + 550, z: frame.pos.z }, rot: Math.PI }), isPlayer: true });
    state.playerId = player.id;
    assert.equal(await registry.get('physics').prepareBackend(state), true);
    // Approach fixture starts just inside radio range; all encounter discovery and
    // arbitration use the production clock and worker event bridge.
    const events = [];
    for (let i = 0; i < 90; i++) {
      reply = await lane.tick({ tick: i + 2, steps: 1, ackEnd: reply.journalEnd });
      events.push(...(reply.events || []));
      if (events.some(e => e.t === 'voice:surface' && e.p.kind === 'anvil-orchard-alin')) break;
    }
    const voices = events.filter(e => e.t === 'voice:surface' && e.p.kind === 'anvil-orchard-alin');
    assert.ok(voices.some(e => /The orchard is ready/.test(e.p.text)), JSON.stringify(events.filter(e=>e.t.startsWith('voice:'))));
    assert.equal(state.player.hints.anvilOrchardAlin.heard.intro, true);
    assert.doesNotThrow(() => structuredClone(voices));
    state.world.currentSectorId = 'elsewhere';
    reply = await lane.tick({ tick: 100, steps: 1, ackEnd: reply.journalEnd });
    assert.ok(reply.events.some(e => e.t === 'voice:clear' && e.p.id.startsWith('alin:')));
  } finally { await lane.shutdown(); }
});

test('actual Save/Continue retains introduction and cancels the pre-load targeted floor', async () => {
  const h = await encounter();
  try {
    h.tick(10);
    const saves = h.sim.registry.get('save');
    const envelope = JSON.parse(JSON.stringify(saves.serialize('alin-introduction')));
    let finalized = 0, completion;
    h.sim.helpers.finalizeLoadedGame = () => {
      finalized++;
      completion = h.facade.prepareBackend(h.sim.state).then(ok => {
        assert.equal(ok, true); h.sim.state.mode = 'flight';
      });
      return completion;
    };
    assert.equal(saves.loadEnvelope(envelope), true);
    assert.equal(finalized, 1); await completion;
    assert.equal(h.sim.state.mode, 'flight');
    assert.equal(h.sim.state.player.hints.anvilOrchardAlin.heard.intro, true);
    h.tick(11);
    assert.equal(h.heard.filter(e => /The orchard is ready/.test(e.text)).length, 1);
    assert.ok(h.cleared.some(e => e.id === 'alin:intro:intro'));
  } finally { h.close(); }
});

test('arbiter validity performs zero entity or native scans over ninety simulated seconds', async () => {
  const h = await encounter();
  try {
    h.tick(1);
    let entityScans = 0, nativeReads = 0;
    const values = h.sim.state.entities.values.bind(h.sim.state.entities);
    h.sim.state.entities.values = () => { entityScans++; return values(); };
    const read = h.facade.readOrchardPodReady;
    h.facade.readOrchardPodReady = (...args) => { nativeReads++; return read.apply(h.facade, args); };
    h.sim.state.planet = { orchardFrameId: h.frame.id, orchardFrameGeneration: h.frame.occupantGeneration };
    // Real Alin entries spend the first half behind a danger floor, then use the
    // normal active floor. The encounter runs on its production 2Hz cadence.
    h.sim.helpers.voice.say({ id: 'block', channel: 'alert', priority: 110, text: 'Fixture floor', ttl: 45 });
    for (let tick = 2; tick <= 5400; tick++) {
      h.sim.state.tick = tick; h.sim.state.simTime = tick / 60;
      if (tick % 30 === 0) h.alin.update(h.sim.state);
      h.voice.update(1 / 60, h.sim.state);
    }
    assert.equal(entityScans, 0); assert.equal(nativeReads, 0);
  } finally { h.close(); }
});

async function releasedEncounter() {
  const h = await encounter(); h.tick(0);
  assert.equal(h.accept(), 4);
  assert.equal(h.owner.requestOrchardFiniteRelease(h.frame, 1, h.sim.state), true);
  for (let tick = 1; tick <= 30; tick++) {
    h.sim.state.tick = tick; h.owner.step(1 / 60, tick);
    h.owner.publishCompletedOrchardContacts(h.owner.completedOrchardTail(), () => h.owner.drainContactImpacts());
  }
  h.pod = h.sim.state.entityList.find(e => e.data?.orchardKind === 'pod');
  assert.equal(h.owner.prepareOrchardPodHandoff(h.frame, h.pod, 1, h.sim.state).commit(), true);
  Object.assign(h.worker.pos, { x: h.frame.pos.x + 200, z: h.frame.pos.z });
  Object.assign(h.sim.state.planet ||= {}, { center: { x: h.frame.pos.x - 1245, z: h.frame.pos.z },
    player: { heat: 0 }, ships: {} });
  return h;
}

for (const hazard of ['hot-player', 'hot-history', 'malformed-history', 'accessor-history', 'unsafe-boundary']) {
  test(`safe cue refuses ${hazard} and later admits a proven untouched cold pod`, async () => {
    const h = await releasedEncounter();
    try {
      const planet = h.sim.state.planet, originalCenter = { ...planet.center };
      if (hazard === 'hot-player') planet.player.heat = 0.1;
      if (hazard === 'hot-history') h.pod.orchardThermalExposure = { heat: 0.8 };
      if (hazard === 'malformed-history') h.pod.orchardThermalExposure = undefined;
      if (hazard === 'accessor-history') Object.defineProperty(h.pod, 'orchardThermalExposure', {
        get() { throw Error('must not read unknown history'); }, configurable: true });
      if (hazard === 'unsafe-boundary') planet.center.x = h.pod.pos.x - 1040;
      h.tick(400);
      assert.equal(h.heard.some(e => /You are clear/.test(e.text)), false);
      planet.player.heat = 0; planet.center = originalCenter;
      delete h.pod.orchardThermalExposure;
      assert.equal(h.facade.readOrchardPodReady(h.pod) != null, true);
      h.tick(401);
      assert.equal(h.heard.filter(e => /You are clear/.test(e.text)).length, 1);
      planet.player.heat = 0.1; h.voice.update(0, h.sim.state);
      assert.equal(h.voice.queue.active, null, 'active safe claim retracts when the player becomes hot');
    } finally { h.close(); }
  });
}

test('finite pod loss speaks once and preserves the original lot outcome', async () => {
  const h = await releasedEncounter();
  try {
    // Death is a focused fixture; the existing lifetime and finite-loss owners settle it.
    h.pod.alive = false;
    h.sim.registry.systems[0].lifetimeSweep(0, h.sim.state);
    const lot = h.sim.state.sites.anvilOrchard.lots[0];
    assert.equal(lot.outcome, 'lost');
    h.tick(400); h.tick(950); h.tick(1100);
    assert.equal(h.heard.filter(e => /Lost the harvest/.test(e.text)).length, 1);
    assert.equal(h.sim.state.sites.anvilOrchard.sourceRemaining, 44);
    assert.equal(lot.outcome, 'lost');
  } finally { h.close(); }
});

test('ordinary thrust crosses the authored approach radius and discovers Alin once', async () => {
  const { createSimulation } = await import('../src/core/sim.js');
  const { world } = await import('../src/systems/world.js');
  const { traffic } = await import('../src/systems/traffic.js');
  const { fields } = await import('../src/systems/fields.js');
  const { planetRuntime } = await import('../src/systems/planetRuntime.js');
  const { input, applyFlightKeyEvent } = await import('../src/systems/input.js');
  const { flightV3 } = await import('../src/systems/flightV3.js');
  const { physics } = await import('../src/core/physics.js');
  const { environmentalMachinery } = await import('../src/systems/environmentalMachinery.js');
  const { barkDirector } = await import('../src/systems/barkDirector.js');
  const { makeShipEntitySpec } = await import('../src/systems/ships.js');
  const { PLANET_SITE, PLANET_FLAGS } = await import('../src/data/planets.js');
  PLANET_FLAGS.enabled = true;
  const worldRecords = { name: 'world', init(ctx) { this.state = ctx.state; }, upsertWorldRecord: world.upsertWorldRecord };
  const trafficWork = { ...traffic, update(dt, state) { this._stepAnvilWork(dt, state); } };
  const sim = createSimulation({ seed: 424214, systems: [worldRecords, trafficWork, fields, planetRuntime,
    input, flightV3, physics, environmentalMachinery, voiceArbiter, barkDirector] });
  try {
    const state = sim.state;
    state.mode = 'flight'; state.world.currentSectorId = PLANET_SITE.sectorId; state.sites = {};
    state.settings.gameplay.physicsBackend = 'rapier-dynamic'; sim.step();
    const frame = state.entities.get(state.planet.orchardFrameId); assert.ok(frame);
    const player = sim.spawn({ ...makeShipEntitySpec('ship_kestrel', {
      pos: { x: frame.pos.x + 650, z: frame.pos.z }, rot: Math.PI }), isPlayer: true });
    state.playerId = player.id;
    assert.equal(await sim.registry.get('physics').prepareBackend(state), true);
    const heard = []; sim.bus.on('voice:surface', e => { if (e.kind === 'anvil-orchard-alin') heard.push(e); });
    sim.step(); assert.equal(heard.length, 0);
    applyFlightKeyEvent(sim.registry.get('input'), { code: 'KeyW', pressed: true });
    for (let i = 0; i < 480 && !heard.length; i++) sim.step();
    assert.ok(heard.length, `distance=${Math.hypot(player.pos.x-frame.pos.x,player.pos.z-frame.pos.z)}`);
    assert.match(heard[0].text, /The orchard is ready/);
    assert.ok(Math.hypot(player.pos.x-frame.pos.x,player.pos.z-frame.pos.z) <= 560);
    assert.equal(state.player.hints.anvilOrchardAlin.heard.intro, true);
  } finally { sim.dispose(); }
});

 test('switching the active player retracts an old-life targeted Alin floor', async () => {
  const h = await encounter();
  try {
    h.tick(1); assert.ok(h.voice.queue.active);
    const other = h.sim.spawn({ type: 'ship', pos: { x: 20000, z: 20000 }, radius: 6, hull: 100 });
    h.sim.state.playerId = other.id;
    h.voice.update(0, h.sim.state);
    assert.equal(h.voice.queue.active, null);
  } finally { h.close(); }
});
