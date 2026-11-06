import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { installSimCommandSink, uninstallSimCommandSink, laneCommandSink, laneInputWrite } from '../src/core/simLaneCommands.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { buildEncounterCausality } from '../src/world/encounterCausality.js';
import { createSimulation } from '../src/core/sim.js';
import { encounterDirector, planEncounters } from '../src/systems/encounterDirector.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { traffic } from '../src/systems/traffic.js';
import { contactHailAvailability, createContactHailOffer, createContactHailResponse } from '../src/data/contactHail.js';

const SECTOR = 'sector_helios_prime';
const STATION = 'station_helios';
const TALLY = sectorLocalToGlobalForSector({ x: 120, z: 180 }, SECTOR);
const scenarioContract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));

test('same loaded Helios worker retains assistance, disabled-family priority and rescued-worker voice', () => {
  const sim = createSimulation({ seed: 4242, systems: [traffic] });
  try {
    const { state } = sim;
    state.mode = 'flight'; state.world.currentSectorId = SECTOR;
    const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 } });
    state.playerId = player.id;
    const barge = sim.spawn({ type: 'ship', team: 2, pos: { x: 30, z: 0 },
      data: { callsign: 'TALLY BARGE', activityActorSlotId: 'helios_starter_ore_carrier',
        trafficRole: 'ore_carrier', worldRecordId: 'wr_priority_barge', jobId: 'job:wr_priority_barge',
        ai: { passive: true, archetype: 'fleeing_trader' } } });
    const rec = { id: barge.id, role: 'ore_carrier', worldRecordId: barge.data.worldRecordId, dockSeq: 0 };
    state.traffic.freighters.push(rec);
    const lanes = sim.registry.get('traffic');
    lanes._setTrafficManifest(barge, rec,
      lanes._buildMinerManifest(barge, 0, 'cmdty_ore_iron', 4, 'ore_carrier'));
    state.player.targetId = barge.id;
    state.player.activeShipIndex = 0;
    state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: [null, null, null, null, null, null] }];
    state.npcJobs = { byId: { [barge.data.jobId]: { job: { kind: 'hauler' } } } };
    const loose = sim.spawn({ type: 'payload', mass: 12, pos: { x: 60, z: 0 },
      data: { towable: true, cargoManifest: { lines: [{ commodityId: 'cmdty_ore_iron', qty: 2 }] } } });
    const offer = () => {
      const availability = contactHailAvailability(state);
      assert.equal(availability.kind, 'worker', 'the actual job record selects the worker family');
      return { availability, model: createContactHailOffer(state, availability, 'priority-request', 40) };
    };
    let current = offer();
    assert.equal(current.availability.towAssistBodyId, loose.id);
    assert.ok(current.model.actions.some(action => action.id === 'tow_assist'),
      'contextual freight voice must not replace the available physical assistance');
    assert.ok(current.model.actions.some(action => action.id === 'route'));
    assert.ok(current.model.actions.some(action => action.id === 'heave_to'));

    state.combat = { entities: { [String(barge.id)]: { capabilities: { drive: false },
      subsystems: { subsystem_drive: { effectiveDisabled: true } } } } };
    current = offer();
    assert.equal(current.availability.disabledHauler, null,
      'the existing RECOVER/STEAL/ABANDON owner is Ceres-only; do not fake its eligibility on Helios');
    assert.ok(current.model.actions.some(action => action.id === 'tow_assist'));
    assert.ok(current.model.actions.some(action => action.id === 'status'));
    assert.notEqual(current.model.lines[1], 'Let me get this lot in.', 'disabled work outranks the radio coda');
    state.combat.entities[String(barge.id)].capabilities.drive = true;
    state.combat.entities[String(barge.id)].subsystems.subsystem_drive.effectiveDisabled = false;

    barge.data.rescuedWorkerPerson = 'returned-worker';
    state.player.uniqueWrecks = { rescuedWorkers: { people: { 'returned-worker': {
      personKey: 'returned-worker', outcome: 'returned', role: 'ore_carrier', worldRecordId: barge.data.worldRecordId,
    } } } };
    assert.match(offer().model.lines[1], /YOU PULLED MY POD/);
    delete barge.data.rescuedWorkerPerson;
    loose.alive = false;
    state.player.ownedShips[0].fittings[5] = 'mod_cargo_scanner_s';
    current = offer();
    assert.ok(current.model.actions.some(action => action.id === 'heave_to'),
      'an existing job control keeps its slot ahead of optional manifest inspection');
    delete barge.data.jobId;
    barge.data.jobPhase = 'transit';
    current = offer();
    assert.ok(current.model.actions.some(action => action.id === 'manifest'));
    state.player.ownedShips[0].fittings[5] = null;
    assert.equal(createContactHailResponse(state, current.model, 'manifest'), null,
      'the worker-family manifest still rechecks the private fitted scanner');
  } finally { sim.dispose(); }
});

// Configured CPU fixture, not ordinary flight: real production owners and the actual
// main bus -> worker command drain -> Scanner -> serialized reply -> main event replay.
test('optional Helios Hail follows the same accepted freight leg through production worker replies', async t => {
  const host = createSimHost(), main = createGameState(4242), bus = createBus();
  let lane, receive, pending = Promise.resolve(), tick = 0;
  const heard = [];
  for (const type of ['contactHail:offer', 'contactHail:response', 'contactHail:clear']) {
    bus.on(type, payload => heard.push({ type, payload }));
  }
  const asWorker = async fn => {
    const sink = laneCommandSink();
    uninstallSimCommandSink();
    try { return await fn(); } finally { if (sink) installSimCommandSink(sink); }
  };
  const drain = async () => {
    for (;;) { const current = pending; await current; if (current === pending) break; }
    await Promise.resolve();
  };
  try {
    lane = createSimLaneRuntime({ state: main, bus, registry: {}, helpers: {},
      flags: { lane: 'worker', sab: false, warnings: [] }, clockMode: 'worker-local',
      channelFactory: () => ({ onMessage(fn) { receive = fn; }, terminate() {}, post(message) {
        if (message.kind === 'init') pending = pending.then(async () => {
          const reply = await asWorker(() => host.init({ ...structuredClone(message),
            profile: 'production', seed: 4242, bridgeAll: true, scenarioContract }));
          receive(structuredClone({ kind: 'ready', seq: message.seq, ...reply }));
        });
        if (message.kind === 'clockCommand') pending = pending.then(async () => {
          const reply = await asWorker(() => host.tick({ ...structuredClone(message), kind: 'tick' }));
          receive(structuredClone({ kind: 'clockTick', ...reply, commandSequence: message.commandSequence }));
        });
      } }),
    });
    await lane.readyPromise;
    const { state, runtime, registry, bus: workerBus } = host.host;
    const traffic = registry.get('traffic');
    state.mode = 'flight'; state.ui.docked = false; state.world.currentSectorId = SECTOR;
    main.mode = 'flight'; main.ui.docked = false;
    const station = runtime.spawn({ type: 'station', team: 2, pos: { x: TALLY.x + 200, z: TALLY.z },
      radius: 40, data: { stationId: STATION, name: 'Helios' } });
    const player = runtime.spawn({ type: 'ship', team: 0, isPlayer: true, hull: 100, hullMax: 100,
      pos: { x: TALLY.x + 20, z: TALLY.z }, data: { defId: 'ship_kestrel' } });
    const barge = runtime.spawn({ type: 'ship', team: 2, hull: 120, hullMax: 120,
      pos: { ...TALLY }, vel: { x: 0, z: 0 }, radius: 9,
      data: { defId: 'ship_ironback', callsign: 'TALLY BARGE', trafficRole: 'ore_carrier',
        activityActorSlotId: 'helios_starter_ore_carrier', worldRecordId: 'wr_hail_barge',
        ai: { passive: true, archetype: 'fleeing_trader' } } });
    state.playerId = player.id;
    state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: [null, null, null, null, null, null] }];
    state.player.activeShipIndex = 0;
    const rec = { id: barge.id, role: 'ore_carrier', worldRecordId: barge.data.worldRecordId,
      dockSeq: 0, targetId: station.id, carrying: true };
    state.traffic.freighters.push(rec);
    const loaded = traffic._buildMinerManifest(barge, 0, 'cmdty_ore_iron', 4, 'ore_carrier',
      { fieldId: 'f_helios_starter', minerWorldRecordId: 'wr_hail_cutter' });
    traffic._setTrafficManifest(barge, rec, loaded);
    const sync = async () => {
      const reply = await asWorker(() => host.tick({ tick: ++tick, steps: 0, commands: [] }));
      receive(structuredClone({ kind: 'clockTick', ...reply }));
    };
    const hail = async (choice = 'route') => {
      const start = heard.length;
      laneInputWrite(main, 'player.targetId', barge.id);
      bus.emit('contactHail:request', { targetId: barge.id, source: 'radio-regression' });
      await drain();
      const offer = heard.slice(start).find(row => row.type === 'contactHail:offer')?.payload;
      assert.ok(offer, 'Scanner offer crossed the production worker reply');
      if (!choice) return offer;
      bus.emit('contactHail:choice', { targetId: barge.id, requestId: offer.requestId, choice });
      await drain();
      return { offer, response: heard.slice(start).find(row => row.type === 'contactHail:response')?.payload };
    };
    await sync();

    await t.test('loaded reply keeps identity, Route and the fitted private scanner gate', async () => {
      const { offer, response } = await hail();
      assert.match(offer.lines[0], /^TALLY BARGE/);
      assert.equal(offer.lines[1], 'Let me get this lot in.');
      assert.equal(response.lines[1], offer.lines[1]);
      assert.match(response.lines[0], /HELIOS/);
      assert.ok(!offer.actions.some(action => action.id === 'manifest'));
      const denied = await hail('manifest');
      assert.equal(denied.response, undefined);
      state.player.ownedShips[0].fittings[5] = 'mod_cargo_scanner_s';
      const inspected = await hail('manifest');
      assert.ok(inspected.offer.actions.some(action => action.id === 'manifest'));
      assert.match(inspected.response.lines.join(' '), /4 .*IRON/i);
      state.player.ownedShips[0].fittings[5] = null;
      barge.data.jobPhase = 'transit';
      const workerDenied = await hail('manifest');
      assert.equal(workerDenied.offer.kind, 'worker');
      assert.equal(workerDenied.response, undefined, 'a job stamp does not bypass private scanning');
      state.player.ownedShips[0].fittings[5] = 'mod_cargo_scanner_s';
      assert.match((await hail('manifest')).response.lines.join(' '), /4 .*IRON/i);
      state.player.ownedShips[0].fittings[5] = null;
      delete barge.data.jobPhase;
    });

    await t.test('an actual bound raid changes the optional reply, not another ambient channel', async () => {
      const raid = { id: 'hail-raid', shapeId: 'opening_hauler_raid', phase: 'conflict',
        roles: { [barge.id]: 'hauler' }, data: { adoptedCarrier: { entityId: barge.id,
          generation: barge.occupantGeneration, worldRecordId: barge.data.worldRecordId,
          manifestId: loaded.manifestId } } };
      state.encounterDirector.live[raid.id] = raid;
      barge.data.ai.encounterId = raid.id;
      assert.equal((await hail()).response.lines[1], 'Keep them off this load.');
      raid.data.adoptedCarrier.generation++;
      assert.equal((await hail()).response.lines[1], 'Let me get this lot in.');
      delete barge.data.ai.encounterId; delete state.encounterDirector.live[raid.id];
    });

    await t.test('only accepted owner unload opens relief; only recorded physical escape earns gratitude', async () => {
      await asWorker(() => {
        traffic._stepHeliosOreCarrier(barge, rec, [station], state);
        state.simTime += 6;
        traffic._stepHeliosOreCarrier(barge, rec, [station], state);
      });
      assert.equal(state.traffic.heliosFreightTallies.at(-1).disposition, 'counted');
      assert.equal(traffic._emitArrival(barge, rec, { data: {} }), false);
      assert.equal((await hail()).response.lines[1], 'Let me get this lot in.');
      const arrivals = [];
      workerBus.on('freight:arrival', receipt => arrivals.push(receipt));
      await asWorker(() => {
        Object.assign(barge.pos, station.pos); Object.assign(player.pos, { x: station.pos.x + 20, z: station.pos.z });
        traffic._stepHeliosOreCarrier(barge, rec, [station], state);
      });
      assert.equal(arrivals.length, 1);
      assert.equal(arrivals[0].manifestId, loaded.manifestId);
      assert.equal(rec.manifest.totalQty, 0);
      assert.equal(state.traffic.heliosFreightTallies.at(-1).disposition, 'delivered');
      assert.equal((await hail()).response.lines[1], 'Empty. Lovely.');
      const cause = buildEncounterCausality({ seed: 4242, encounterId: 'earned-hail-escape',
        shapeId: 'opening_hauler_raid', sectorId: SECTOR, zoneId: 'lane' });
      Object.assign(cause, { manifestId: loaded.manifestId, carrierWorldRecordId: barge.data.worldRecordId,
        adoptedWorkingBarge: true, commodityId: 'cmdty_ore_iron', totalQty: 4 });
      await asWorker(() => workerBus.emit('encounter:resolved', { encounterId: cause.encounterId,
        shape: cause.shapeId, sectorId: SECTOR, outcome: 'defended', causality: cause, t: state.simTime }));
      assert.equal((await hail()).response.lines[1], 'Empty. Lovely.', 'NPC-only or generic defended earns no credit');
      delete state.aftermathWrecks.causes[cause.fingerprint];
      cause.resolutionMethod = 'physical_escape';
      await asWorker(() => workerBus.emit('encounter:resolved', { encounterId: cause.encounterId,
        shape: cause.shapeId, sectorId: SECTOR, outcome: 'defended', causality: cause, t: state.simTime }));
      assert.equal(state.aftermathWrecks.causes[cause.fingerprint].resolutionMethod, 'physical_escape');
      assert.equal((await hail()).response.lines[1], 'You kept that load aboard. Empty. Lovely.');
    });

    await t.test('loss, unrelated work, a foreign durable carrier and stale body cannot borrow the coda', async () => {
      const tally = state.traffic.heliosFreightTallies.at(-1);
      tally.disposition = 'lost';
      assert.equal((await hail()).response.lines[1], 'Nothing aboard yet.');
      tally.disposition = 'delivered';
      const cause = Object.values(state.aftermathWrecks.causes)
        .find(row => row.manifestId === loaded.manifestId);
      cause.outcome = 'robbed';
      assert.equal((await hail()).response.lines[1], 'Nothing aboard yet.', 'a conflicting robbery never borrows relief');
      cause.outcome = 'defended';
      barge.data.cargoDumped = true;
      assert.equal((await hail()).response.lines[1], 'Nothing aboard yet.');
      delete barge.data.cargoDumped;
      const empty = barge.data.cargoManifest;
      rec.dockSeq = barge.data.freightDockSeq = 2;
      traffic._setTrafficManifest(barge, rec, traffic._buildMinerManifest(barge, 2, null, 0, 'ore_carrier'));
      assert.equal((await hail()).response.lines[1], 'Nothing aboard yet.');
      rec.dockSeq = barge.data.freightDockSeq = 1;
      traffic._setTrafficManifest(barge, rec, empty);
      const worldRecordId = barge.data.worldRecordId;
      barge.data.worldRecordId = rec.worldRecordId = 'wr_other_barge';
      traffic._setTrafficManifest(barge, rec, traffic._buildMinerManifest(barge, 1, null, 0, 'ore_carrier'));
      assert.equal((await hail()).response.lines[1], 'Nothing aboard yet.');
      barge.data.worldRecordId = rec.worldRecordId = worldRecordId;
      traffic._setTrafficManifest(barge, rec, empty);
      const offer = await hail(null), start = heard.length;
      barge.occupantGeneration++;
      bus.emit('contactHail:choice', { targetId: barge.id, requestId: offer.requestId, choice: 'route' });
      await drain();
      assert.ok(!heard.slice(start).some(row => row.type === 'contactHail:response'));
      assert.ok(heard.slice(start).some(row => row.type === 'contactHail:clear'));
    });
  } finally { lane?.close(); host.shutdown(); }
});

test('the existing raid alert names only its adopted worker and stays one primary alert', () => {
  for (const adopted of [true, false]) {
    const sim = createSimulation({ seed: 4242, systems: [spawnBudget, encounterDirector] });
    try {
      const { state, bus } = sim;
      state.mode = 'flight'; state.world.currentSectorId = SECTOR;
      state.playerId = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 100, hullMax: 100 }).id;
      if (adopted) sim.spawn({ type: 'ship', team: 2, pos: { x: 100, z: 0 }, hull: 120, hullMax: 120,
        data: { callsign: 'TALLY BARGE', activityActorSlotId: 'helios_starter_ore_carrier',
          trafficRole: 'ore_carrier', worldRecordId: 'wr_alert_barge', cargoManifest: {
            manifestId: 'actual-ore', role: 'ore_carrier', totalQty: 3,
            lines: [{ commodityId: 'cmdty_ore_iron', qty: 3 }] } } });
      const plan = planEncounters(4242, SECTOR, 0, zonesForSector(SECTOR))
        .find(row => row.shapeId === 'opening_hauler_raid');
      state.encounterDirector.pending = [{ ...plan, dueAt: 0, defers: 0, fireReadyHoldSince: -3600 }];
      state.encounterDirector.pressure.combat = 30;
      const alerts = [];
      bus.on('encounter:voice', event => { if (event.primary) alerts.push(event); });
      sim.runTicks(150);
      assert.equal(alerts.length, 1);
      if (adopted) assert.equal(alerts[0].text, 'TALLY BARGE: Keep them off this load.');
      else assert.doesNotMatch(alerts[0].text, /TALLY BARGE|ORE BARGE|Keep them off this load/);
    } finally { sim.dispose(); }
  }
});
