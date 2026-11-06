import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { factionPresence } from '../src/systems/factionPresence.js';
import { stationServices } from '../src/systems/stationServices.js';
import { economy } from '../src/systems/economy.js';
import { missions } from '../src/systems/missions.js';
import { economyContracts } from '../src/systems/economyContracts.js';
import { masslineTelemetry } from '../src/systems/masslineTelemetry.js';
import { configureDomainMirroring, createDomainMirroringProfile, createDomainDiffer, applyDomainPathUpdate } from '../scripts/lib/simReadModel.mjs';
import { factionPresenceServiceRows, yardJobReadout, serviceQuote } from '../src/ui/station/serviceQuotes.js';
import { departureReadinessChips } from '../src/ui/station/stationDepartureModel.js';
import { kesslerWeightSlipChoice, kesslerWeightSlipReply } from '../src/ui/station/massSlipConversation.js';
import { presentSurfaceDecisions } from '../src/ui/adventureDecisions.js';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';

function boot() {
  const state = createGameState(4242), bus = createBus(), systems = {};
  const registry = { get: name => systems[name] || null };
  const ctx = { state, bus, registry, helpers: {} };
  Object.create(core).init(ctx);
  for (const owner of [stationServices, factionPresence, missions, economyContracts, masslineTelemetry]) {
    const instance = Object.create(owner); instance.init(ctx); systems[owner.name] = instance;
  }
  const econ = Object.create(economy); econ.state = state; econ.bus = bus; econ._registry = registry; econ._lastDockedStation = null;
  systems.economy = econ;
  const player = ctx.helpers.spawnEntity({ type: 'ship', isPlayer: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 10, hull: 60, hullMax: 100,
    armorHp: 0, armorMax: 0, flags: { docked: true } });
  state.playerId = player.id; state.player.credits = 100000;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 100, capMass: 100 };
  state.mode = 'flight'; state.onboarding = { active: false, finished: true };
  configureDomainMirroring(createDomainMirroringProfile('station'));
  const differ = createDomainDiffer({ probe: false }), facade = createGameState(4242);
  let clock = 0;
  function sync(n = 12) {
    for (let i = 0; i < n; i++) for (const update of differ.diff(state, ++clock).updates) {
      const segs = update.segs.length === 1 && update.segs[0].includes('.') ? update.segs[0].split('.') : update.segs;
      const holder = new Map([[segs[0], facade[segs[0]]]]);
      applyDomainPathUpdate(holder, { ...structuredClone(update), segs }, new Set());
      facade[segs[0]] = holder.get(segs[0]);
    }
  }
  return { state, bus, systems, player, facade, sync };
}

test('paid yard job crosses the production differ to the meter, quotes and departure warning', () => {
  const h = boot(), { state, bus, systems, player, facade, sync } = h;
  state.world.currentSectorId = 'sector_helios_prime'; state.ui.docked = true; state.ui.dockedStationId = 'station_helios';
  bus.emit('dock:docked', { stationId: 'station_helios' });
  const before = state.player.credits;
  systems.economy.handleService({ type: 'repair' });
  assert.ok(state.player.credits < before, 'the real economy charged for the work');
  assert.ok(systems.stationServices.enqueuePlayerJob({ type: 'refuel', units: 2, stationId: 'station_helios' }));
  assert.ok(systems.stationServices.enqueuePlayerJob({ type: 'repair', units: 2, stationId: 'station_helios' }));
  sync(65);
  assert.deepEqual(yardJobReadout(facade), yardJobReadout(state));
  assert.match(yardJobReadout(facade).detail, /\+2 more jobs/);
  assert.equal(serviceQuote('repair', facade, player).disabled, true);
  assert.equal(serviceQuote('refuel', facade, player).disabled, true);
  facade.entities.set(player.id, player);
  assert.ok(!presentSurfaceDecisions(facade, 'station_helios', 'market').some(row => row.kind === 'repair'),
    'the decision surface accounts for the real repair already booked');
  assert.ok(departureReadinessChips(facade).some(chip => chip.label === 'Yard' && /undock cancels/i.test(chip.text)));
  assert.equal(facade.stationServices.player.jobs, undefined, 'the unbounded authoritative queue did not cross the wire');
  for (let i = 0; i < 5; i++) { state.simTime++; systems.stationServices.update(1, state); }
  sync();
  assert.deepEqual(yardJobReadout(facade), yardJobReadout(state), 'live progress comes from the real yard owner');
  state.ui.docked = false; state.ui.dockedStationId = null; bus.emit('dock:undocked', {}); sync();
  assert.equal(yardJobReadout(facade), null);
  assert.ok(!departureReadinessChips(facade).some(chip => chip.label === 'Yard'));
});

test('real faction desk crosses the wire and clears when the player leaves that berth', () => {
  const { state, bus, facade, sync } = boot();
  state.factions.faction_archive = { rep: 25 }; state.ui.docked = true; state.ui.dockedStationId = 'station_drift';
  bus.emit('dock:docked', { stationId: 'station_drift' }); sync(65);
  assert.equal(factionPresenceServiceRows(facade, 'station_drift')[0]?.id, 'archive_reading_room');
  assert.equal(factionPresenceServiceRows(facade, 'station_drift')[0]?.available, true);
  state.ui.dockedStationId = 'station_helios'; bus.emit('dock:docked', { stationId: 'station_helios' }); sync();
  assert.deepEqual(factionPresenceServiceRows(facade, 'station_drift'), []);
});

test('the real audit measurement crosses the wire into Kessler and removal clears it', () => {
  const { state, bus, systems, facade, sync } = boot();
  const offer = 'eco_mass_scale_weight_audit_station_helios';
  state.world.currentSectorId = 'sector_helios_prime'; state.ui.docked = true; state.ui.dockedStationId = 'station_helios';
  for (let i = 0; i < 4; i++) bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(systems.missions.acceptMission(offer), true);
  const mission = state.missions.active.find(m => m.sourceOfferId === offer);
  const target = [...state.entities.values()].find(e => e.type === 'asteroid'
    && (e.data?.missionTag === mission.id || e.data?.missionId === mission.id));
  assert.ok(target);
  state.player.tether = { active: true, targetId: target.id, phase: 'loaded', strain: 0.4,
    load: 0.5, tensionEstimate: 0.4, restLength: 80, reelStrength: 0 };
  target.vel.x = 5;
  for (let i = 0; i < 30; i++) { state.tick++; state.simTime += 1 / 60; systems.masslineTelemetry.update(1 / 60, state); }
  sync(65);
  const choice = kesslerWeightSlipChoice(facade, 'station_helios');
  assert.equal(choice?.label, 'Show the weight slip.');
  assert.match(kesslerWeightSlipReply(facade, 'station_helios', choice.id).text, /Declared 20 t.*40 t/);
  bus.emit('customs:massSlipFiled', { slipId: `mass-slip:${offer}:0`, stationId: 'station_helios', outcome: 'mass_discrepancy_filed' });
  sync();
  assert.match(kesslerWeightSlipReply(facade, 'station_helios', choice.id).text, /office filed the difference/i);
  delete state.economyContracts.massScale.slips[`mass-slip:${offer}:0`]; sync();
  assert.equal(kesslerWeightSlipChoice(facade, 'station_helios'), null);
});

test('production host publishes an actual docked yard booking to the main-side reader', async () => {
  const host = createSimHost();
  try {
    const facade = createGameState(4242);
    const apply = reply => {
      for (const update of reply.domainUpdates || []) {
        const segs = update.segs.length === 1 && update.segs[0].includes('.') ? update.segs[0].split('.') : update.segs;
        const holder = new Map([[segs[0], facade[segs[0]]]]);
        applyDomainPathUpdate(holder, { ...update, segs }, new Set());
        facade[segs[0]] = holder.get(segs[0]);
      }
    };
    const init = await host.init({ profile: 'production', seed: 4242, bridgeAll: true,
      domainMirroring: createDomainMirroringProfile('station'),
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8')) });
    apply(structuredClone(init));
    const { state, registry, runtime } = host.host;
    state.mode = 'flight'; state.world.currentSectorId = 'sector_helios_prime';
    const player = runtime.spawn({ type: 'ship', isPlayer: true, radius: 8, hull: 50, hullMax: 100,
      pos: { x: 0, z: 0 }, data: { defId: 'ship_kestrel', fittings: [], intent: {}, ai: {} } });
    state.playerId = player.id; state.ui.docked = true; state.ui.dockedStationId = 'station_helios';
    assert.equal(registry.get('stationServices').enqueuePlayerJob({ type: 'repair', units: 30, stationId: 'station_helios' }), true);
    for (let i = 1; i <= 8; i++) apply(structuredClone(await host.tick({ tick: i, steps: 0, commands: [],
      ackEnd: init.initRebuild?.end ?? 0 })));
    assert.ok(yardJobReadout(facade), 'the detached presentation sees the host-owned job');
    assert.deepEqual(yardJobReadout(facade), yardJobReadout(state));
  } finally { host.shutdown(); }
});
