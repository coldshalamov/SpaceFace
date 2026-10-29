import assert from 'node:assert/strict';
import test from 'node:test';

import { MODULES } from '../src/data/modules.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { SHIPS } from '../src/data/ships.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { getNodeSystemFactoryTable } from '../src/runtime/nodeSystemFactoryTable.js';
import { mining as miningSystem } from '../src/systems/mining.js';
import { makeShipEntitySpec, fittingsFromDefaultModules, buildSlotList, stationShopOffer } from '../src/systems/ships.js';
import { HELIOS_POCKET_ACTOR_SLOT_ORDER, activityPocketById } from '../src/data/sectorActivityPockets.js';
import { promoteAsteroidFieldRock } from '../src/world/asteroidField.js';

const DT = 1 / 60;
const HELIOS = 'sector_helios_prime';
const CERES = 'sector_ceres_belt';
const DRIVE_ID = 'mod_swing_drive_s';
const FUEL_CELLS = 'cmdty_fuel_cells';

function memoryStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
  };
}

async function boot(seed = 4242) {
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = memoryStorage();
  const lookup = getNodeSystemFactoryTable();
  // This fixture authors normalized control input; all gameplay, jump, mission, economy,
  // physics, save and NPC owners remain the production system instances.
  lookup.set('input', { name: 'input', init() {}, update() {}, destroy() {} });
  const runtime = await createAuthoritativeRuntime({
    profileId: 'production', nodeSafeOnly: true, seed, systemLookup: lookup,
  });
  const { state, bus } = runtime;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.aiBackend = 'sg06-tactical';
  state.player.credits = NEW_GAME.credits;
  const ships = runtime.getSystem('ships');
  ships.newGame();
  const player = runtime.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
    team: 0, factionId: 'faction_free', isPlayer: true, player: state.player,
    fittings: fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules || []),
    pos: { x: 0, z: 0 }, rot: 0,
  }));
  state.playerId = player.id;
  ships.recomputeActiveShip();
  const world = runtime.getSystem('world');
  world.newGame();
  runtime.getSystem('economy').newGame();
  world.enterSector(HELIOS, {});
  bus.emit('game:started', {});
  await runtime.getSystem('physics').prepareBackend(state, { reset: true });
  await runtime.runTicks(60, DT);
  return {
    runtime, state, bus, player, ships,
    close() {
      runtime.dispose();
      if (previousStorage === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = previousStorage;
    },
  };
}

async function jumpTo(h, sectorId) {
  const { runtime, state, bus } = h;
  const previous = state.world.currentSectorId;
  bus.emit('world:requestJump', { targetSectorId: sectorId, via: 'gate' });
  assert.equal(state.jump.state, 'CHARGING', `legal gate jump begins from ${previous} to ${sectorId}`);
  for (let tick = 0; tick < 1800 && state.world.currentSectorId !== sectorId; tick++) {
    await runtime.runTicks(1, DT);
  }
  assert.equal(state.world.currentSectorId, sectorId, `gate jump arrives at ${sectorId}`);
}

function dockAt(h, stationId) {
  const { state, bus, player } = h;
  const station = state.entityList.find((entity) => entity?.alive !== false
    && entity.type === 'station' && entity.data?.stationId === stationId);
  assert.ok(station, `${stationId} is materialized by the current sector`);
  state.ui.docked = true;
  state.ui.dockedStationId = stationId;
  if (player.flags) player.flags.docked = true;
  bus.emit('dock:docked', { stationId, playerId: player.id });
  return station;
}

test('native starter circuit earns a fit, changes the Helios work seam, and recalls it after Continue',
  { timeout: 180_000 }, async (t) => {
    const h = await boot();
    t.after(() => h.close());
    const { runtime, state, bus, player, ships } = h;
    const save = runtime.getSystem('save');
    const missions = runtime.getSystem('missions');

    // Arrive into the existing Helios shift and make one real intervention before the sealed
    // freight leg. This occurs at the authored seam while its miner is actively assigned, not
    // after elapsed gate travel has naturally completed that worker's current duty.
    await runtime.runTicks(1, DT);
    const actors = (state.traffic?.freighters || []).map((record) => state.entities.get(record.id))
      .filter((entity) => entity && entity.alive !== false && entity.data?.activityActorSlotId);
    const miner = actors.find((entity) => entity.data.activityActorSlotId === 'helios_seam_miner');
    assert.ok(miner?.data?.jobId, 'the active Helios miner is a real job-owned actor');
    assert.ok(HELIOS_POCKET_ACTOR_SLOT_ORDER.includes('helios_seam_miner'));
    const seam = activityPocketById('helios_starter_seam');
    assert.ok(seam && seam.objectSlots.some((slot) => slot.id === 'helios_seam_ore_face'));
    const field = state.world.asteroidField;
    const parentRock = field.rocks.find((record) => record?.alive !== false
      && record.data?.fieldId === 'f_helios_starter'
      && record.data?.authoredBoulderId);
    assert.ok(parentRock, 'the player arrives at the authored heavy body on the miner seam');
    const liveRock = promoteAsteroidFieldRock(state, parentRock.id, runtime.getHelpers(), 'mine');
    assert.ok(liveRock, 'the authored workpiece admits a physical mining body');
    const mining = runtime.getSystem('mining');
    let cut = 0;
    for (let i = 0; i < 12 && liveRock.alive !== false; i++) {
      cut += mining.applyMining(liveRock.id, 900, 1, player.id);
    }
    assert.ok(cut > 0 && liveRock.alive === false, 'the player physically cuts the shared seam');
    const core = state.entityList.find((entity) => entity?.alive !== false
      && entity.data?.bulkCore && entity.data?.fieldId === 'f_helios_starter');
    assert.ok(core && core.data.bulkMassU > 0, 'the cut leaves the real towable core as the next workpiece');
    assert.equal(core.data.extractedById, player.id, 'the core records the player who made it');
    assert.equal(core.flags?.persistent, true, 'player-extracted core uses the canonical saveable-entity path');

    // Ordinary Helios board → legal sealed freight → real gate transit → Ceres dock receipt.
    dockAt(h, 'station_helios');
    const firstTrade = state.missions.boards.station_helios.slots.find((row) => (
      row && row.source === 'firstTradeContract'
    ));
    assert.ok(firstTrade, 'first dock posts the authored legal Fuel Cells haul');
    const initialCredits = state.player.credits;
    assert.equal(initialCredits, NEW_GAME.credits);
    assert.equal(missions.acceptMission(firstTrade.id), true, 'the player accepts through missions owner');
    const active = state.missions.active.find((mission) => mission.source === 'firstTradeContract');
    assert.ok(active && active.type === 'cargo_delivery');
    assert.equal(state.player.cargo.items[FUEL_CELLS], 8, 'cargo writer loads the sealed manifest');
    assert.equal(state.player.cargo.usedVolume, 6.4);

    state.ui.docked = false;
    state.ui.dockedStationId = null;
    player.flags.docked = false;
    await jumpTo(h, CERES);
    dockAt(h, 'station_ceres');
    const receipt = (state.missions.receipts || []).find((row) => row?.missionId === active.id);
    assert.ok(receipt && receipt.outcome === 'completed', 'destination dock settles the accepted haul');
    assert.equal(state.player.cargo.items[FUEL_CELLS] || 0, 0, 'the delivery consumes its manifest');
    assert.equal(state.player.credits, initialCredits + 760 - 194,
      'the 760 CR legal delivery is paid by economy after the real 194 CR Ceres gate toll');

    // Return through the actual world jump owner. The first-haul Helios price then fits the
    // earned route margin, and the ships owner replaces the drill amp rather than granting a fit.
    state.ui.docked = false;
    state.ui.dockedStationId = null;
    player.flags.docked = false;
    for (let tick = 0; tick < 240 && state.jump.cooldownT > 0; tick++) await runtime.runTicks(1, DT);
    await jumpTo(h, HELIOS);
    dockAt(h, 'station_helios');
    const drive = MODULES.find((row) => row.id === DRIVE_ID);
    const offer = stationShopOffer(drive, 'station_helios');
    assert.ok(offer && state.player.credits >= offer.price,
      `the delivered legal haul covers the actual Helios fit quote (${offer?.price})`);
    const slots = buildSlotList(SHIPS.find((row) => row.id === NEW_GAME.shipId));
    const utilitySlot = slots.findIndex((slot) => slot.type === 'utility' && slot.size === 'S');
    bus.emit('ui:buyModule', {
      defId: DRIVE_ID, fitSlotIndex: utilitySlot, expectedPrice: offer.price,
      hullDefId: NEW_GAME.shipId,
    });
    assert.equal(state.player.ownedShips[0].fittings[utilitySlot], DRIVE_ID);
    assert.equal(state.player.credits, initialCredits + 760 - 194 - 246 - offer.price);
    assert.equal(player.data.derived.swingDrive, true, 'the ship capability is recalculated from the live fit');

    // SaveSystem's normal slot write and load are the continuation boundary. The fit, paid
    // receipt, remaining cargo and workpiece must still be coherent after sector re-entry.
    state.ui.docked = false;
    state.ui.dockedStationId = null;
    player.flags.docked = false;
    assert.equal(save.save('quick'), true, 'the integrated result writes through SaveSystem');
    const nextCredits = state.player.credits;
    for (let tick = 0; tick < 240 && state.jump.cooldownT > 0; tick++) await runtime.runTicks(1, DT);
    await jumpTo(h, CERES);
    assert.equal(save.load('quick'), true, 'Continue restores through the real save loader');
    assert.equal(state.world.currentSectorId, HELIOS, 'Continue returns to the saved starter sector');
    assert.equal(state.player.credits, nextCredits);
    assert.equal(state.player.ownedShips[0].fittings[utilitySlot], DRIVE_ID);
    assert.ok(state.missions.receipts.some((row) => row?.missionId === active.id
      && row.outcome === 'completed'), 'the paid haul is not offered or paid a second time');
    const restoredCore = state.entityList.find((entity) => entity?.alive !== false
      && entity.data?.bulkCore && entity.data?.fieldId === 'f_helios_starter');
    assert.ok(restoredCore, 'Continue restores the player-extracted workpiece');
    assert.equal(restoredCore.data.extractedById, player.id);
    assert.equal(restoredCore.flags?.persistent, true);
    assert.equal(state.entityList.some((entity) => entity?.alive !== false
      && entity.data?.authoredBoulderId === parentRock.data.authoredBoulderId), false,
    'the depleted authored source body does not return beside its saved core');
    const board = missions.ensureBoard('station_helios');
    assert.ok(board.slots.some((row) => row && row.source !== 'firstTradeContract'),
      'the return leaves another distinct local action on the Helios board');
  });

test('Survival mining does not mark bulk cores as persistent Adventure workpieces', () => {
  const spawned = [];
  const state = {
    playerId: 7,
    mode: 'flight',
    run: { kind: 'survival', phase: 'active' },
    simTime: 1,
    rng: () => 0.5,
  };
  const system = Object.assign(Object.create(miningSystem), {
    state,
    bus: { emit() {} },
    helpers: {
      spawnEntity(spec) {
        const entity = { id: spawned.length + 1, ...spec, alive: true };
        spawned.push(entity);
        return entity;
      },
    },
  });
  const parent = {
    id: 30, type: 'asteroid', pos: { x: 0, z: 0 }, radius: 40, mass: 500,
    data: { typeId: 'ast_metallic', fieldId: 'arena', oreHPMax: 860, yieldU: 30, seams: [] },
  };
  system._fractureAsteroid(parent, { id: 'ast_metallic' }, { id: state.playerId });
  const core = spawned.find((entity) => entity.data.bulkCore);
  assert.ok(core, 'the fracture still creates the ordinary Survival bulk core');
  assert.equal(core.data.extractedById, undefined);
  assert.equal(core.flags?.persistent, undefined, 'a Crucible pickup does not leak into Adventure Continue saves');
});
