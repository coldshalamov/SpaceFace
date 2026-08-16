import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { FACTION_BACKROOM, FACTION_MISSION_DOCTRINES } from '../src/data/factionPlay.js';
import { WEAPONS } from '../src/data/weapons.js';
import { actions } from '../src/systems/actions.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { cargo } from '../src/systems/cargo.js';
import { combat } from '../src/systems/combat.js';
import { economy } from '../src/systems/economy.js';
import {
  earnedConflictSalvageQtyForState,
  factionBackroomAccessForState,
  factionLicensedFitOfferForState,
  factions,
} from '../src/systems/factions.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { heat } from '../src/systems/heat.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { mining } from '../src/systems/mining.js';
import { missions } from '../src/systems/missions.js';
import { pirateDisguise, playerSpoofStatusForState } from '../src/systems/pirateDisguise.js';
import { makeShipEntitySpec, ships } from '../src/systems/ships.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { weapons } from '../src/systems/weapons.js';
import { customsPrompt } from '../src/ui/customsPrompt.js';
import { isOrdinaryOutfittingItem } from '../src/ui/screens/outfitting.js';

const LICENSED_FIT_ID = 'wpn_flak_turret_s';
const CONFLICT_PAIR = 'faction_dmc:faction_mts';
const CONFLICT_SECTOR = 'sector_tethys_junction';
const LICENSE_SECTOR = 'sector_helios_prime';
const LICENSE_STATION = 'station_helios';
const SALVAGE_ID = 'cmdty_classified_salvage';

function licensedWeapon() {
  const def = WEAPONS.find((weapon) => weapon.id === LICENSED_FIT_ID);
  assert.ok(def, 'the licensed fit is an existing weapon definition');
  return def;
}

function setFlightState(state) {
  state.mode = 'flight';
  state.ui.docked = false;
  state.ui.dockedStationId = null;
  state.world.currentSectorId = CONFLICT_SECTOR;
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.aiBackend = 'sg06-tactical';
  state.input.actions = {};
  state.input.fire = false;
}

function aimPlayerAt(state, player, target) {
  const angle = Math.atan2(target.pos.z - player.pos.z, target.pos.x - player.pos.x);
  state.input.aimAngle = angle;
  state.input.aimWorld = { x: target.pos.x, z: target.pos.z };
  state.input.autoAim = { targetId: target.id };
  state.player.targetId = target.id;
  player.data.combat.targetId = target.id;
}

async function preparePhysics(t, sim) {
  const owner = sim.registry.get('physics');
  assert.ok(owner, 'production physics owner is present');
  assert.equal(await owner.prepareBackend(sim.state, { reset: true }), true);
  t.after(() => {
    owner._disableSg02DynamicAuthority?.();
    sim.dispose();
  });
  return owner;
}

function spawnHeliosInspectionActors(sim, patrolWorldRecordId, { station = true } = {}) {
  const { state } = sim;
  let stationEntity = null;
  if (station) {
    stationEntity = sim.spawn({
      type: 'station', team: 2, factionId: 'faction_scn', pos: { x: 0, z: 0 }, radius: 42,
      data: { stationId: LICENSE_STATION, factionId: 'faction_scn', dockRadius: 72 },
    });
  }
  const patrol = sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_scn', pos: { x: 180, z: 0 },
    hull: 140, hullMax: 140, radius: 7,
    data: {
      trafficRole: 'patrol',
      worldRecordId: patrolWorldRecordId,
      homeSectorId: LICENSE_SECTOR,
      sectorId: LICENSE_SECTOR,
      durable: true,
      ai: { lawful: true, spawnContext: 'patrol', passive: false },
      intent: {}, combat: {},
    },
  });
  return { station: stationEntity, patrol };
}

test('deliberate reputation unlocks, buys, fits and physically fires the existing SCN license reward', async (t) => {
  const systems = [factions, economy, ships, actions, weapons, physics, combat];
  const sim = createSimulation({
    seed: 0x470001,
    systems,
    updateOrder: [factions, economy, ships, actions, weapons, physics, combat],
  });
  const { state, bus } = sim;
  const shipSystem = sim.registry.get('ships');
  state.world.currentSectorId = LICENSE_SECTOR;
  state.ui.docked = true;
  state.ui.dockedStationId = LICENSE_STATION;
  state.player.credits = 50_000;
  state.player.moduleInventory = [];
  state.player.ownedShips = [{
    defId: 'ship_kestrel',
    fittings: ['wpn_pulse_laser_s', null, null, null, null, null],
  }];
  state.player.activeShipIndex = 0;
  bus.emit('game:started', {});
  bus.emit('dock:docked', { stationId: LICENSE_STATION });

  const def = licensedWeapon();
  assert.equal(def.factionLicense.factionId, 'faction_scn');
  assert.equal(isOrdinaryOutfittingItem(def), false,
    'the existing flak fit is absent from the ordinary outfitting catalog');
  assert.equal(def.purchasable, false,
    'the default station shipworks filter also hides the licensed fit');

  const locked = { defId: LICENSED_FIT_ID };
  bus.emit('ui:buyFactionFit', locked);
  assert.deepEqual(locked.result, {
    ok: false,
    reason: 'standing_required',
    minRep: 30,
    currentRep: 0,
  });
  assert.equal(state.player.moduleInventory.length, 0);

  bus.emit('mission:completed', { factionId: 'faction_scn', repMult: 1 });
  bus.emit('mission:completed', { factionId: 'faction_scn', repMult: 1 });
  const offer = factionLicensedFitOfferForState(state, LICENSED_FIT_ID);
  assert.equal(offer.available, true, 'two real faction mission outcomes cross Accepted standing');
  assert.ok(offer.price > 0);

  const beforeCredits = state.player.credits;
  const bought = { defId: LICENSED_FIT_ID };
  bus.emit('ui:buyFactionFit', bought);
  assert.equal(bought.result.ok, true);
  assert.equal(beforeCredits - state.player.credits, offer.price,
    'the economy owner performs the one licensed debit');
  const inventoryItem = state.player.moduleInventory.find((item) => item.defId === LICENSED_FIT_ID);
  assert.ok(inventoryItem, 'ships owner receives the licensed fit into ordinary inventory');
  assert.equal(shipSystem.fitModule({ slotIndex: 0, instanceId: inventoryItem.instanceId }), true);
  assert.equal(state.player.ownedShips[0].fittings[0], LICENSED_FIT_ID);

  // Losing access never confiscates an already purchased fit.
  bus.emit('faction:repDelta', { factionId: 'faction_scn', delta: -100, reason: 'route_reversal' });
  assert.equal(factionLicensedFitOfferForState(state, LICENSED_FIT_ID).available, false);
  assert.equal(state.player.ownedShips[0].fittings[0], LICENSED_FIT_ID);

  setFlightState(state);
  await preparePhysics(t, sim);
  const player = sim.spawn(makeShipEntitySpec('ship_kestrel', {
    isPlayer: true,
    team: 0,
    factionId: 'faction_free',
    player: state.player,
    pos: { x: 0, z: 0 },
    rot: 0,
    fittings: state.player.ownedShips[0].fittings,
  }));
  const target = sim.spawn(makeShipEntitySpec('ship_wasp', {
    team: 1,
    factionId: 'faction_reach',
    pos: { x: 150, z: 0 },
    rot: Math.PI,
    fittings: [],
  }));
  state.playerId = player.id;
  target.shield = 0;
  target.shieldMax = 0;
  const startHull = target.hull;
  aimPlayerAt(state, player, target);
  const fires = [];
  const hits = [];
  bus.on('combat:fire', (payload) => {
    if (payload.ownerId === player.id) fires.push(structuredClone(payload));
  });
  bus.on('projectile:hit', (payload) => {
    if (payload.ownerId === player.id) hits.push(structuredClone(payload));
  });
  state.input.fire = true;
  for (let tick = 0; tick < 180 && target.hull === startHull; tick++) sim.step(SIM_DT);

  assert.ok(fires.some((payload) => payload.weaponId === LICENSED_FIT_ID),
    'the owned licensed instance reaches the ordinary weapons firing path after standing falls');
  assert.ok(hits.some((payload) => payload.targetId === target.id));
  assert.ok(target.hull < startHull,
    'the licensed flak round crosses Rapier and the combat owner into a live opposing hull');
});

test('Trusted backrooms sell one-use forged identities that pass matching patrols and fail mismatched customs', () => {
  const systems = [lawSecurity, cargo, economy, factions, heat, customsPrompt, pirateDisguise];
  const sim = createSimulation({ seed: 0x470047, systems, updateOrder: systems });
  const { state, bus } = sim;
  state.world.currentSectorId = LICENSE_SECTOR;
  state.player.credits = 20_000;
  state.player.cargo.items = { cmdty_narcotics: 2 };
  state.player.cargo.capVolume = 80;
  state.player.cargo.capMass = 80;
  const player = sim.spawn({
    type: 'ship', team: 0, factionId: 'faction_free', pos: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 8, data: { intent: {}, combat: {} },
  });
  state.playerId = player.id;
  spawnHeliosInspectionActors(sim, 'world:plan47:helios:patrol:01');
  sim.registry.get('cargo').recompute();
  bus.emit('game:started', {});

  state.mode = 'docked';
  state.ui.docked = true;
  state.ui.dockedStationId = LICENSE_STATION;
  bus.emit('dock:docked', { stationId: LICENSE_STATION });
  const locked = { serviceId: FACTION_BACKROOM.serviceId };
  bus.emit('ui:buyFactionBackroom', locked);
  assert.deepEqual(locked.result, {
    ok: false,
    reason: 'standing_required',
    minRep: FACTION_BACKROOM.minRep,
    currentRep: 0,
  });

  for (let i = 0; i < 10; i++) bus.emit('mission:completed', { factionId: 'faction_scn', repMult: 1 });
  const access = factionBackroomAccessForState(state, LICENSE_STATION);
  assert.equal(access.available, true, 'real faction mission outcomes open the legitimate-station backroom');
  const creditsBefore = state.player.credits;
  const bought = { serviceId: FACTION_BACKROOM.serviceId };
  bus.emit('ui:buyFactionBackroom', bought);
  assert.equal(bought.result.ok, true);
  assert.equal(creditsBefore - state.player.credits, FACTION_BACKROOM.price,
    'Economy performs the only backroom debit');
  assert.equal(playerSpoofStatusForState(state, 'faction_scn').ready, true,
    'pirateDisguise owns a concrete one-use manifest after purchase');

  const passed = [];
  const made = [];
  const contraband = [];
  bus.on('playerSpoof:passed', (payload) => passed.push(structuredClone(payload)));
  bus.on('playerSpoof:made', (payload) => made.push(structuredClone(payload)));
  bus.on('contraband:scanned', (payload) => contraband.push(structuredClone(payload)));
  state.mode = 'flight';
  state.ui.docked = false;
  state.ui.dockedStationId = null;
  bus.emit('dock:undocked', {});
  sim.step(SIM_DT);
  const matchingCase = state.player.lawfulInspection?.active;
  assert.ok(matchingCase, 'a durable lawful patrol physically offers the customs stop');
  bus.emit('lawfulInspection:choose', { caseId: matchingCase.id, choice: 'comply', source: 'plan47' });
  assert.equal(passed.length, 1);
  assert.equal(passed[0].matched, true);
  assert.equal(state.player.lawfulInspection.last.outcome, 'cleared');
  assert.equal(state.player.cargo.items.cmdty_narcotics, 2,
    'the matching manifest crosses the real scan without confiscation');
  assert.equal(playerSpoofStatusForState(state, 'faction_scn').ready, false,
    'the successful manifest is consumed exactly once');

  // A trusted MTS backroom can forge MTS papers, but presenting that crest to an SCN patrol is a
  // legible mismatch: the disguise is made and the ordinary scan penalties continue untouched.
  for (let i = 0; i < 10; i++) bus.emit('mission:completed', { factionId: 'faction_mts', repMult: 1 });
  state.mode = 'docked';
  state.ui.docked = true;
  state.ui.dockedStationId = 'station_tethys';
  bus.emit('dock:docked', { stationId: 'station_tethys' });
  const wrongPapers = { serviceId: FACTION_BACKROOM.serviceId };
  bus.emit('ui:buyFactionBackroom', wrongPapers);
  assert.equal(wrongPapers.result.ok, true);
  assert.equal(playerSpoofStatusForState(state, 'faction_mts').sourceFactionId, 'faction_mts');
  state.mode = 'flight';
  state.world.currentSectorId = LICENSE_SECTOR;
  state.ui.docked = false;
  state.ui.dockedStationId = null;
  bus.emit('dock:undocked', {});
  spawnHeliosInspectionActors(sim, 'world:plan47:helios:patrol:02', { station: false });
  sim.registry.get('economy')._rng = () => 0;
  for (let i = 0; i < 31 && !state.player.lawfulInspection?.active; i++) sim.step(SIM_DT);
  const mismatchCase = state.player.lawfulInspection?.active;
  assert.ok(mismatchCase, 'a second durable patrol supplies a distinct real customs challenge');
  bus.emit('lawfulInspection:choose', { caseId: mismatchCase.id, choice: 'comply', source: 'plan47' });
  assert.equal(made.length, 1);
  assert.equal(made[0].matched, false);
  assert.equal(state.player.lawfulInspection.last.outcome, 'contraband_discovered');
  assert.equal(contraband.length, 1, 'ordinary Economy confiscation still settles the failed disguise');
  assert.equal(state.player.cargo.items.cmdty_narcotics, undefined);
  const exposed = playerSpoofStatusForState(state, 'faction_scn');
  assert.equal(exposed.exposed, true);
  state.simTime = exposed.exposureUntil + 0.01;
  assert.equal(playerSpoofStatusForState(state, 'faction_scn').exposed, false,
    'being made is local and expires rather than becoming a permanent lock');
  sim.dispose();
});

test('trusted faction doctrine deterministically changes ordinary board composition without displacing anchors', () => {
  const systems = [factions, missions];
  const sim = createSimulation({ seed: 0x4700bd, systems, updateOrder: systems });
  const { state, bus } = sim;
  bus.emit('game:started', {});
  const missionSystem = sim.registry.get('missions');
  const doctrine = new Set(FACTION_MISSION_DOCTRINES.faction_scn);
  let neutralDoctrineRows = 0;
  let trustedDoctrineRows = 0;

  for (let epoch = 1; epoch <= 48; epoch++) {
    state.simTime = epoch * state.missions.config.refreshSec;
    state.factions.faction_scn.rep = 0;
    delete state.missions.boards[LICENSE_STATION];
    const neutral = missionSystem.ensureBoard(LICENSE_STATION).slots.map((offer) => offer.type);
    neutralDoctrineRows += neutral.filter((type) => doctrine.has(type)).length;

    state.factions.faction_scn.rep = FACTION_BACKROOM.minRep;
    delete state.missions.boards[LICENSE_STATION];
    const trusted = missionSystem.ensureBoard(LICENSE_STATION).slots.map((offer) => offer.type);
    trustedDoctrineRows += trusted.filter((type) => doctrine.has(type)).length;
    delete state.missions.boards[LICENSE_STATION];
    assert.deepEqual(
      missionSystem.ensureBoard(LICENSE_STATION).slots.map((offer) => offer.type),
      trusted,
      'same seed, station, epoch and standing reproduce the same trusted board',
    );
  }
  assert.ok(trustedDoctrineRows >= Math.ceil(neutralDoctrineRows * 1.2),
    `trusted SCN doctrine must materially shape posted work (${neutralDoctrineRows} -> ${trustedDoctrineRows})`);

  state.factions.faction_mts.rep = FACTION_BACKROOM.minRep;
  state.simTime += state.missions.config.refreshSec;
  delete state.missions.boards.station_tethys;
  assert.equal(missionSystem.ensureBoard('station_tethys').slots[0].type, 'escort',
    'the authored Tethys dispatch anchor remains first under doctrine weighting');
  sim.dispose();
});

test('choosing either side creates a real 2v2, and a player kill yields one physical lawful salvage lot', async (t) => {
  for (const [index, chosenSide] of ['faction_mts', 'faction_dmc'].entries()) {
    const tactical = createTacticalAISystem({ config: { trace: { enabled: false } } });
    const systems = [factions, economy, cargo, mining, aiPorts, tactical, flightV3, actions, weapons, physics, combat];
    const sim = createSimulation({
      seed: 0x470100 + index,
      systems,
      updateOrder: [factions, economy, cargo, mining, aiPorts, tactical, flightV3, actions, weapons, physics, combat],
    });
    const { state, bus } = sim;
    const factionSystem = sim.registry.get('factions');
    const economySystem = sim.registry.get('economy');
    const cargoSystem = sim.registry.get('cargo');
    setFlightState(state);
    state.player.cargo.items = {};
    state.player.cargo.richLots = [];
    state.player.cargo.usedVolume = 0;
    state.player.cargo.usedMass = 0;
    state.player.cargo.capVolume = 40;
    state.player.magnetRange = 250;
    bus.emit('game:started', {});
    await preparePhysics(t, sim);
    const player = sim.spawn(makeShipEntitySpec('ship_kestrel', {
      isPlayer: true,
      team: 0,
      factionId: 'faction_free',
      player: state.player,
      pos: { x: 0, z: 0 },
      rot: 0,
      fittings: [LICENSED_FIT_ID],
    }));
    state.input.moveZ = 0;
    state.input.turnIntent = 0;
    state.input.strafe = 0;
    state.input.brake = false;
    state.playerId = player.id;

    const joined = { pairKey: CONFLICT_PAIR, sideId: chosenSide };
    bus.emit('ui:chooseConflictSide', joined);
    assert.equal(joined.result.ok, true);
    assert.equal(joined.result.allyIds.length, 2);
    assert.equal(joined.result.opponentIds.length, 2);
    const front = state.conflicts[CONFLICT_PAIR].front;
    const allies = front.allyIds.map((id) => state.entities.get(id));
    const opponents = front.opponentIds.map((id) => state.entities.get(id));
    assert.ok(allies.every((entity) => entity.factionId === chosenSide && entity.team === 0));
    assert.ok(opponents.every((entity) => entity.factionId === front.opponentSide && entity.team === 1));

    // Keep the opening exchange alive long enough to observe both production AI batteries.
    for (const actor of [...allies, ...opponents]) {
      actor.hull = actor.hullMax = 1200;
      actor.shield = actor.shieldMax = 400;
    }
    const actorFires = [];
    const playerFires = [];
    const playerHits = [];
    bus.on('combat:fire', (payload) => {
      if ([...front.allyIds, ...front.opponentIds].includes(payload.ownerId)) {
        actorFires.push(structuredClone(payload));
      }
      if (payload.ownerId === player.id) playerFires.push(structuredClone(payload));
    });
    bus.on('projectile:hit', (payload) => {
      if (payload.ownerId === player.id) playerHits.push(structuredClone(payload));
    });
    for (let tick = 0; tick < 420 && !(
      actorFires.some((payload) => front.allyIds.includes(payload.ownerId))
      && actorFires.some((payload) => front.opponentIds.includes(payload.ownerId))
    ); tick++) sim.step(SIM_DT);
    assert.ok(actorFires.some((payload) => front.allyIds.includes(payload.ownerId)),
      `${chosenSide} wing physically fires through Tactical AI`);
    assert.ok(actorFires.some((payload) => front.opponentIds.includes(payload.ownerId)),
      `${front.opponentSide} wing physically fires back`);

    const victim = opponents.find((entity) => entity.alive !== false);
    assert.ok(victim);
    // The opening exchange is already proven above; let the real long-range weapon path own the
    // lethal edge without allowing a friendly battery to claim it first.
    for (const ally of allies) ally.data.weapons = [];
    state.input.fire = false;
    // Fly the ordinary controls to a flanking angle rather than shooting through the friendly
    // wing stationed between the arrival lane and its paired opponent.
    let flankDistance = Infinity;
    for (let tick = 0; tick < 900 && flankDistance > 180; tick++) {
      const flank = { x: victim.pos.x, z: victim.pos.z + 240 };
      const dx = flank.x - player.pos.x;
      const dz = flank.z - player.pos.z;
      flankDistance = Math.hypot(dx, dz);
      let turnError = Math.atan2(dz, dx) - player.rot;
      while (turnError > Math.PI) turnError -= Math.PI * 2;
      while (turnError < -Math.PI) turnError += Math.PI * 2;
      state.input.turnIntent = Math.max(-1, Math.min(1, turnError / 0.45));
      state.input.moveZ = flankDistance > 180 ? 1 : 0;
      state.input.brake = flankDistance < 140;
      sim.step(SIM_DT);
    }
    assert.ok(flankDistance <= 180, 'the player physically reaches a clear firing angle at the marked front');

    victim.hull = victim.hullMax = 3;
    victim.shield = victim.shieldMax = 0;
    state.input.moveZ = 0;
    state.input.brake = true;
    state.input.fire = true;
    for (let tick = 0; tick < 360 && state.conflicts[CONFLICT_PAIR].front.status !== 'resolved'; tick++) {
      aimPlayerAt(state, player, victim);
      let turnError = Math.atan2(victim.pos.z - player.pos.z, victim.pos.x - player.pos.x) - player.rot;
      while (turnError > Math.PI) turnError -= Math.PI * 2;
      while (turnError < -Math.PI) turnError += Math.PI * 2;
      state.input.turnIntent = Math.max(-1, Math.min(1, turnError / 0.45));
      sim.step(SIM_DT);
    }
    state.input.fire = false;
    assert.ok(playerFires.some((payload) => payload.weaponId === LICENSED_FIT_ID),
      'the player flies to the marked front and fires the live licensed control fit');
    assert.ok(playerHits.some((payload) => payload.targetId === victim.id),
      'the player lands the physical lethal hit on an exact front opponent');
    assert.equal(state.conflicts[CONFLICT_PAIR].front.status, 'resolved');
    assert.equal(state.conflicts[CONFLICT_PAIR].front.resolvedKillId, victim.id);
    const rightId = state.conflicts[CONFLICT_PAIR].front.salvageRightId;
    assert.ok(rightId);
    const pickup = state.entityList.find((entity) => entity.alive !== false
      && entity.data?.richLotSource?.provenanceId === rightId);
    assert.ok(pickup, 'real combat outcome materializes the exact physical classified-salvage lot');

    state.input.moveX = 0;
    state.input.moveZ = 0;
    state.input.turnIntent = 0;
    state.input.brake = false;
    state.input.boost = false;
    state.input.actions = {};
    state.nav.autopilot = {
      active: true,
      target: { x: pickup.pos.x, z: pickup.pos.z },
      targetEntityId: pickup.id,
      label: 'Earned salvage',
      arrivalRadius: 4,
      status: 'armed',
    };
    let pickupDistance = Infinity;
    for (let tick = 0; tick < 900 && pickupDistance > 100; tick++) {
      // The browser input owner republishes neutral raw axes every frame while the flight computer
      // is engaged; this focused host supplies that same no-manual-override input boundary.
      state.input.moveX = 0;
      state.input.moveZ = 0;
      state.input.turnIntent = 0;
      state.input.brake = false;
      state.input.boost = false;
      state.input.actions.brake = false;
      sim.step(SIM_DT);
      pickupDistance = Math.hypot(pickup.pos.x - player.pos.x, pickup.pos.z - player.pos.z);
    }
    assert.ok(pickupDistance <= 100, 'the ordinary flight computer reaches the salvage last mile');
    state.nav.autopilot.active = false;
    for (let tick = 0; tick < 900 && (state.player.cargo.items[SALVAGE_ID] || 0) < 3; tick++) {
      const dx = pickup.pos.x - player.pos.x;
      const dz = pickup.pos.z - player.pos.z;
      const distance = Math.hypot(dx, dz);
      const speed = Math.hypot(player.vel.x, player.vel.z);
      let turnError = Math.atan2(dz, dx) - player.rot;
      while (turnError > Math.PI) turnError -= Math.PI * 2;
      while (turnError < -Math.PI) turnError += Math.PI * 2;
      state.input.turnIntent = Math.max(-1, Math.min(1, turnError / 0.45));
      state.input.moveZ = Math.abs(turnError) < 0.25 && distance > 16 && speed < 28 ? 0.22 : 0;
      state.input.brake = speed > 28 || distance <= 16;
      sim.step(SIM_DT);
    }
    assert.equal(state.player.cargo.items[SALVAGE_ID], 3,
      'ordinary flight computer, pickup contact and cargo owner collect the earned world lot');
    assert.equal(earnedConflictSalvageQtyForState(state, SALVAGE_ID), 3);
    assert.equal(economySystem.illicitCargo(state).some((stack) => stack.commodityId === SALVAGE_ID), false,
      'customs honors only the resolved physical rights receipt');
    assert.equal(cargoSystem.addCargo(SALVAGE_ID, 1), 1);
    assert.deepEqual(economySystem.illicitCargo(state).find((stack) => stack.commodityId === SALVAGE_ID)?.qty, 1,
      'an otherwise identical unprovenanced unit remains illicit');

    const saved = structuredClone(factionSystem.serialize());
    factionSystem.deserialize(saved);
    assert.equal(state.conflicts[CONFLICT_PAIR].front.salvageRightId, rightId,
      'resolved fronts and salvage rights survive Continue');
    assert.equal(factionSystem.chooseConflictSide({ pairKey: CONFLICT_PAIR, sideId: chosenSide }).reason, 'already_resolved',
      'the durable front cannot become a repeatable salvage printer');

    // The ordinary Economy sale consumes the earned rich lot first, pays it exactly once, and
    // leaves the identical unprovenanced unit exposed to customs.
    state.ui.docked = true;
    state.ui.dockedStationId = 'station_tethys';
    bus.emit('dock:docked', { stationId: 'station_tethys' });
    economySystem.ensureMarket('station_tethys');
    const creditsBeforeSale = state.player.credits;
    const sold = economySystem.execute('station_tethys', SALVAGE_ID, 'sell', 3);
    assert.equal(sold.ok, true);
    assert.equal(sold.qty, 3);
    assert.equal(state.player.credits - creditsBeforeSale, sold.total);
    assert.equal(earnedConflictSalvageQtyForState(state, SALVAGE_ID), 0,
      'selling the earned lot consumes its exact lawful provenance');
    assert.equal(state.player.cargo.items[SALVAGE_ID], 1);
    assert.equal(economySystem.illicitCargo(state).find((stack) => stack.commodityId === SALVAGE_ID)?.qty, 1,
      'sale neither launders nor consumes the identical unprovenanced remainder');
  }
});

test('Continue clears only an unresolved active front whose exact local actors disappeared', () => {
  const sim = createSimulation({ seed: 0x470200, systems: [factions], updateOrder: [factions] });
  const { state, bus } = sim;
  const factionSystem = sim.registry.get('factions');
  state.world.currentSectorId = CONFLICT_SECTOR;
  bus.emit('game:started', {});
  const player = sim.spawn({
    type: 'ship', team: 0, factionId: 'faction_free', pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, rot: 0, radius: 8, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  const joined = factionSystem.chooseConflictSide({ pairKey: CONFLICT_PAIR, sideId: 'faction_mts' });
  assert.equal(joined.ok, true);
  const saved = structuredClone(factionSystem.serialize());
  for (const id of [...joined.allyIds, ...joined.opponentIds]) {
    const actor = state.entities.get(id);
    if (actor) actor.alive = false;
    state.entities.delete(id);
  }

  factionSystem.deserialize(saved);
  assert.equal(state.conflicts[CONFLICT_PAIR].front, undefined,
    'a nonpersistent active receipt cannot strand the route after Continue');
  assert.equal(factionSystem.chooseConflictSide({ pairKey: CONFLICT_PAIR, sideId: 'faction_dmc' }).ok, true,
    'the player may retry the interrupted physical front');
  sim.dispose();
});
