import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { normalizeLivingHull } from '../src/core/livingHull.js';
import { physics } from '../src/core/physics.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { save } from '../src/save/saveSystem.js';
import { aceMemory } from '../src/systems/aceMemory.js';
import { aftermathForSector, aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { cargo } from '../src/systems/cargo.js';
import { combat } from '../src/systems/combat.js';
import { economy, LOANER_DEBT_CAP_CR, LOANER_DEBT_PER_LOSS_CR } from '../src/systems/economy.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { makeShipEntitySpec, ships } from '../src/systems/ships.js';
import { survivorPod } from '../src/systems/survivorPod.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { traffic } from '../src/systems/traffic.js';
import { serviceQuote } from '../src/ui/screens/services.js';

const SECTOR_ID = 'sector_tethys_junction';
const STATION_ID = 'station_tethys';
const STARTING_CARGO = Object.freeze([
  Object.freeze({ commodityId: 'cmdty_food', qty: 5 }),
  Object.freeze({ commodityId: 'cmdty_fuel_cells', qty: 3 }),
]);

const SYSTEMS = [
  ships,
  cargo,
  economy,
  aftermathWrecks,
  survivorPod,
  traffic,
  aceMemory,
  combat,
  tetherGameplay,
  flightV3,
  physics,
  save,
];

const UPDATE_ORDER = [
  tetherGameplay,
  flightV3,
  physics,
  survivorPod,
  traffic,
  aftermathWrecks,
  aceMemory,
  combat,
  cargo,
  economy,
  save,
];

function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

function lossMarker(state) {
  return aftermathForSector(state, SECTOR_ID).find((marker) => marker && marker.playerLoss) || null;
}

function playerHulks(state) {
  return (state.entityList || []).filter((entity) => entity && entity.alive !== false
    && entity.type === 'wreck' && entity.data && entity.data.ownedPlayerWreck === true);
}

function playerPods(state) {
  return (state.entityList || []).filter((entity) => entity && entity.alive !== false
    && entity.type === 'payload' && entity.data && entity.data.playerOccupied === true);
}

function boot({ ironman = false, credits = 5000, fittings = [] } = {}) {
  const bus = createBus();
  const voice = [];
  const sim = createSimulation({
    seed: 59059,
    bus,
    systems: SYSTEMS,
    updateOrder: UPDATE_ORDER,
    helpers: { voice: { say(payload) { voice.push(deepCopy(payload)); return true; } } },
  });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR_ID;
  state.world.currentSector = { id: SECTOR_ID, factionId: 'faction_mts' };
  state.world.activeSector = {
    id: SECTOR_ID,
    factionId: 'faction_mts',
    stations: [{ stationId: STATION_ID, pos: { x: 0, z: 0 } }],
  };
  state.settings.gameplay.difficulty = ironman ? 'ironman' : 'standard';
  state.settings.gameplay.ironman = ironman;
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.player.credits = credits;
  state.factions.faction_mts = { ...(state.factions.faction_mts || {}), rep: 125 };

  const shipsOwner = sim.registry.get('ships');
  shipsOwner.newGame();
  const owned = shipsOwner.ownedShip();
  owned.defId = 'ship_mule';
  owned.fittings = fittings.slice();
  owned.appearance = {
    version: 1,
    hullColor: '#31577a',
    accentColor: '#d7a23a',
    finish: 'worn',
    wear: 0.72,
    decalId: 'industrial',
  };
  owned.livingHull = normalizeLivingHull({
    killTally: 4,
    repairPatches: 2,
    heatScorch: 1,
    graffitiLine: 'STILL OWED',
    graffitiAuthor: 'Dock Six',
    updatedAtT: 11,
  }, 11);

  const station = sim.spawn({
    type: 'station',
    team: 2,
    factionId: 'faction_mts',
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 45,
    mass: 1_000_000,
    hull: 5_000,
    hullMax: 5_000,
    collides: false,
    flags: { persistent: true },
    data: { stationId: STATION_ID, sectorId: SECTOR_ID, size: 'L', factionId: 'faction_mts' },
  });
  const player = sim.spawn(makeShipEntitySpec(owned.defId, {
    team: 0,
    factionId: 'player',
    fittings: owned.fittings,
    appearance: owned.appearance,
    livingHull: owned.livingHull,
    isPlayer: true,
    player: state.player,
    pos: { x: 610, z: 0 },
  }));
  player.flags = Object.assign({}, player.flags, { persistent: true });
  player.vel.x = 48;
  player.vel.z = 0;
  state.playerId = player.id;
  shipsOwner.recomputeActiveShip();

  const cargoOwner = sim.registry.get('cargo');
  for (const row of STARTING_CARGO) {
    assert.equal(cargoOwner.addCargo(row.commodityId, row.qty, { sourceKind: 'plan59_fixture' }), row.qty);
  }

  const ace = sim.spawn(makeShipEntitySpec('ship_jackal', {
    team: 1,
    factionId: 'faction_reach',
    pos: { x: 680, z: 20 },
    ai: { name: 'Yara No-Cut', aceId: 'ace_yara_no_cut', archetype: 'reaver_pirate' },
  }));
  ace.data.aceMemory = { aceId: 'ace_yara_no_cut', aceName: 'Yara No-Cut' };
  ace.data.name = 'Yara No-Cut';

  const events = {
    inbound: [],
    respawn: [],
    recovered: [],
    delivered: [],
    aceVoice: [],
    creditsChanged: [],
    saveError: [],
  };
  bus.on('playerDefeat:rescueInbound', (payload) => events.inbound.push(deepCopy(payload)));
  bus.on('player:respawn', (payload) => events.respawn.push(deepCopy(payload)));
  bus.on('playerDefeat:wreckRecovered', (payload) => events.recovered.push(deepCopy(payload)));
  bus.on('playerDefeat:wreckDelivered', (payload) => events.delivered.push(deepCopy(payload)));
  bus.on('aceMemory:voice', (payload) => events.aceVoice.push(deepCopy(payload)));
  bus.on('credits:changed', (payload) => events.creditsChanged.push(deepCopy(payload)));
  bus.on('save:error', (payload) => events.saveError.push(deepCopy(payload)));

  return { sim, bus, state, station, player, ace, events, voice };
}

async function preparePhysics(route) {
  const owner = route.sim.registry.get('physics');
  assert.equal(await owner.prepareBackend(route.state, { reset: true }), true,
    'Plan 59 uses the production-default Rapier dynamic-body authority');
  route.sim.runTicks(3);
  return owner;
}

async function saveAndContinue(route, slot) {
  const owner = route.sim.registry.get('save');
  const envelope = owner.serialize(slot);
  assert.equal(owner.loadEnvelope(deepCopy(envelope), slot), true,
    `real ${slot} Continue succeeds: ${JSON.stringify(route.events.saveError.at(-1) || null)}`);
  assert.equal(await route.sim.registry.get('physics').prepareBackend(route.state), true,
    `${slot} Continue re-establishes Rapier authority for the restored physical bodies`);
  route.sim.runTicks(2);
  return envelope;
}

function buyPolicy(route, tier) {
  route.state.ui.docked = true;
  route.state.ui.dockedStationId = STATION_ID;
  route.bus.emit('dock:docked', { stationId: STATION_ID });
  const quote = serviceQuote(`insurance_${tier}`, route.state, route.state.entities.get(route.state.playerId));
  assert.equal(quote.disabled, false, `${tier} is purchasable at the real station service`);
  const before = route.state.player.credits;
  route.bus.emit('ui:service', { type: `insurance_${tier}`, amount: quote.amount });
  assert.equal(route.state.player.credits, before - quote.cost, `${tier} premium debits through Economy`);
  assert.equal(route.state.player.insurance.activePolicy.tier, tier);
  route.state.ui.docked = false;
  route.state.ui.dockedStationId = null;
  route.bus.emit('dock:undocked', { stationId: STATION_ID });
  return quote;
}

function awaitPhysicalRescue(route) {
  route.bus.emit('player:rescueRequested', { mode: 'wait', source: 'after_action' });
  for (let tick = 0; tick < 65 * 60 && route.events.respawn.length === 0; tick++) {
    route.sim.step(SIM_DT);
  }
  assert.equal(route.events.respawn.length, 1, 'the production rescue route reaches one physical interception');
  return route.events.respawn[0];
}

test('Loyalty death becomes a drifting pod, paid cargo lien, physical hulk tow, and one ace acknowledgment', async () => {
  const route = boot();
  const physicsOwner = await preparePhysics(route);
  const loyaltyQuote = buyPolicy(route, 'loyalty');
  const originalBodyId = route.state.playerId;
  const originalHull = deepCopy(route.state.player.ownedShips[0].livingHull);
  const originalAppearance = deepCopy(route.state.player.ownedShips[0].appearance);
  const originalFittings = route.state.player.ownedShips[0].fittings.slice();
  const originalPos = { x: route.player.pos.x, z: route.player.pos.z };
  const creditsAfterPremium = route.state.player.credits;

  route.sim.registry.get('combat').kill(route.player, route.ace.id, {
    context: 'weapon',
    weaponId: 'wpn_railgun_m',
    dominantLayer: 'hull',
  });

  const firstReceipt = route.state.player.activePhysicalDefeatReceipt;
  assert.ok(firstReceipt && firstReceipt.loss, 'playerDefeat owns one durable physical-loss receipt');
  const lossId = firstReceipt.loss.lossId;
  const markerId = firstReceipt.loss.wreckMarkerId;
  assert.equal(firstReceipt.loss.insuranceClaim.tier, 'loyalty');
  assert.equal(firstReceipt.loss.insuranceClaim.refitFundingCr, loyaltyQuote.refitFundingCr);
  assert.equal(firstReceipt.loss.insuranceClaim.cashPayoutCr, loyaltyQuote.cashPayoutCr);
  assert.equal(route.state.player.credits, creditsAfterPremium + loyaltyQuote.cashPayoutCr,
    'the claim exposes only cargo assessment as spendable cash; insurer-funded refit nets to zero');
  const loyaltyCashEdges = route.events.creditsChanged.filter((event) => event.delta > 0);
  assert.deepEqual(loyaltyCashEdges.map((event) => event.delta), [loyaltyQuote.cashPayoutCr],
    'Loyalty emits one real cash edge for cargo and never a transient hull-value credit');
  assert.equal(route.state.player.insurance.activePolicy, null, 'the one-loss policy is consumed at real death');
  const blockedUpgrade = route.sim.registry.get('economy').purchaseInsurancePolicy('full');
  assert.equal(blockedUpgrade.reason, 'active_loss', 'purchase and upgrade stay locked through active loss');
  assert.equal(route.state.playerId, originalBodyId, 'death keeps the camera/player identity on the same body');
  assert.equal(route.state.entities.get(route.state.playerId).type, 'payload');
  assert.equal(playerPods(route.state).length, 1, 'the player body is the only occupied survival pod');
  assert.ok(Math.hypot(route.player.vel.x, route.player.vel.z) >= 11.9,
    `the real pod has visible inherited drift (${route.player.vel.x}, ${route.player.vel.z})`);
  assert.equal(playerHulks(route.state).length, 1, 'a separate physical own hulk remains at the death site');
  assert.deepEqual(lossMarker(route.state).playerLoss.cargoManifest, STARTING_CARGO);
  assert.deepEqual(route.state.player.cargo.items, {}, 'cargo authority removes the conserved manifest from the pod');

  await saveAndContinue(route, 'plan59-pod-drift');
  const restoredPod = route.state.entities.get(route.state.playerId);
  assert.equal(restoredPod.type, 'payload');
  assert.equal(restoredPod.data.lossId, lossId);
  assert.equal(restoredPod.data.survivorPodCausal.lossId, lossId);
  assert.equal(playerPods(route.state).length, 1, 'Continue restores one canonical player payload, never a spectator duplicate');
  assert.equal(playerHulks(route.state).length, 1);
  assert.equal(lossMarker(route.state).markerId, markerId);
  assert.deepEqual(lossMarker(route.state).playerLoss.cargoManifest, STARTING_CARGO,
    'the same marker retains exact cargo custody through pod Continue');
  assert.equal(route.state.player.activePhysicalDefeatReceipt.loss.podEntityId, route.state.playerId,
    'the durable receipt adopts the restored canonical player id');
  const creditsBeforeReplay = route.state.player.credits;
  const claimCountBeforeReplay = route.state.player.insurance.claims.length;
  const markerAfterContinue = lossMarker(route.state);
  const replayedClaim = route.sim.registry.get('economy').settlePlayerLossPolicy({
    lossId,
    shipSnapshot: markerAfterContinue.playerLoss.shipSnapshot,
    cargoManifest: markerAfterContinue.playerLoss.cargoManifest,
  });
  assert.equal(replayedClaim.idempotent, true, 'Continue cannot replay a one-loss settlement');
  assert.equal(route.state.player.credits, creditsBeforeReplay);
  assert.equal(route.state.player.insurance.claims.length, claimCountBeforeReplay);

  const driftStart = { x: restoredPod.pos.x, z: restoredPod.pos.z };
  route.sim.runTicks(60);
  const driftDistance = Math.hypot(restoredPod.pos.x - driftStart.x, restoredPod.pos.z - driftStart.z);
  assert.ok(driftDistance > 2,
    `the player-tracked pod visibly drifts under Rapier after Continue (distance=${driftDistance}, vel=${restoredPod.vel.x},${restoredPod.vel.z})`);

  route.bus.emit('player:rescueRequested', { mode: 'wait', source: 'after_action' });
  assert.equal(route.state.player.activePhysicalDefeatReceipt.loss.phase, 'rescue_wait');
  let responder = null;
  let startingDistance = null;
  let minimumDistance = Infinity;
  for (let tick = 0; tick < 65 * 60 && route.events.respawn.length === 0; tick++) {
    route.sim.step(SIM_DT);
    if (!responder && route.events.inbound.length) {
      const responderId = route.events.inbound[0].responderId;
      responder = route.state.entities.get(responderId);
      startingDistance = responder && Math.hypot(
        responder.pos.x - route.state.entities.get(route.state.playerId).pos.x,
        responder.pos.z - route.state.entities.get(route.state.playerId).pos.z,
      );
    }
    const pod = route.state.entities.get(route.state.playerId);
    if (responder && pod && pod.type === 'payload') {
      minimumDistance = Math.min(minimumDistance, Math.hypot(
        responder.pos.x - pod.pos.x,
        responder.pos.z - pod.pos.z,
      ));
    }
  }
  assert.equal(route.events.inbound.length, 1, 'the liked faction dispatches exactly one rescue response after its delay');
  assert.ok(startingDistance > 300, `rescue begins as a physical approach, got ${startingDistance}`);
  assert.ok(minimumDistance < startingDistance - 150,
    `Traffic intent plus Flight V3/Rapier closes on the moving pod (${startingDistance} -> ${minimumDistance})`);
  assert.equal(route.events.respawn.length, 1);
  assert.equal(route.state.entities.get(route.state.playerId).type, 'ship');
  assert.equal(route.state.player.ownedShips[0].defId, 'ship_mule');
  assert.deepEqual(route.state.player.ownedShips[0].fittings, originalFittings);
  assert.deepEqual(route.state.player.ownedShips[0].appearance, originalAppearance);
  assert.deepEqual(route.state.player.ownedShips[0].livingHull, originalHull,
    'Loyalty refit preserves exact fit, customization, and scars before the hulk is recovered');
  assert.equal(route.state.player.activePhysicalDefeatReceipt, undefined, 'the pod receipt closes only after physical interception');

  await saveAndContinue(route, 'plan59-incomplete-own-hulk-tow');
  const continuedMarker = lossMarker(route.state);
  assert.equal(continuedMarker.markerId, markerId);
  assert.equal(continuedMarker.playerLoss.towStatus, 'offered');
  assert.deepEqual(continuedMarker.playerLoss.cargoManifest, STARTING_CARGO);
  assert.equal(playerHulks(route.state).length, 1, 'incomplete tow Continue rematerializes exactly one own hulk');
  const hulk = playerHulks(route.state)[0];

  const forged = {
    lossId,
    markerId,
    hulkEntityId: hulk.id,
    stationId: STATION_ID,
    shipSnapshot: deepCopy(continuedMarker.playerLoss.shipSnapshot),
    cargoManifest: deepCopy(continuedMarker.playerLoss.cargoManifest),
    result: null,
  };
  route.bus.emit('playerDefeat:wreckDelivered', forged);
  assert.deepEqual(forged.result, { ok: false, reason: 'delivery_not_physical' },
    'a forged delivery event cannot restore the hull');
  assert.equal(route.state.player.ownedShips[0].defId, 'ship_mule');

  route.sim.runTicks(3);
  const player = route.state.entities.get(route.state.playerId);
  route.state.input.moveZ = 1;
  route.state.input.moveX = 0;
  route.state.input.turnIntent = 0;
  route.state.input.aimAngle = 0;
  for (let tick = 0; tick < 8 * 60
    && Math.hypot(player.pos.x - hulk.pos.x, player.pos.z - hulk.pos.z) > 390; tick++) {
    route.sim.step(SIM_DT);
  }
  route.state.input.moveZ = 0;
  route.state.input.brake = true;
  for (let tick = 0; tick < 4 * 60 && Math.hypot(player.vel.x, player.vel.z) > 2; tick++) {
    route.sim.step(SIM_DT);
  }
  route.state.input.brake = false;
  assert.ok(Math.hypot(player.pos.x - hulk.pos.x, player.pos.z - hulk.pos.z) <= 399,
    'the recovered player ship physically flies into ordinary Massline acquisition range');
  assert.ok(player.pos.x < hulk.pos.x, 'the pilot arrests the approach on the station side of the hulk');
  route.state.input.actions = route.state.input.actions || {};
  route.state.input.aimWorld = { x: hulk.pos.x, z: hulk.pos.z };
  route.state.input.aimIntentActive = true;
  route.state.input.actions.tetherFire = false;
  route.sim.step(SIM_DT);
  route.state.input.actions.tetherFire = true;
  route.sim.step(SIM_DT);
  route.state.input.actions.tetherFire = false;
  route.sim.step(SIM_DT);
  assert.equal(route.state.player.tether.active, true, 'registered tetherGameplay consumes the real aim/input latch');
  assert.equal(route.state.player.tether.targetId, hulk.id);
  const attachmentId = route.state.player.tether.attachmentId;
  const kernel = route.sim.registry.get('combat').ensureKernel();
  assert.equal(kernel.attachments.get(attachmentId).state, 'active');
  const beforeTow = { x: hulk.pos.x, z: hulk.pos.z };
  route.sim.runTicks(30);
  assert.equal(route.events.recovered.length, 0,
    'creating the real attachment alone cannot complete the recovery before station-bound displacement');
  assert.equal(route.state.player.ownedShips[0].defId, 'ship_mule');

  route.state.input.actions.massline = { lineControl: true, lineLength: -1, cut: false };
  for (let tick = 0; tick < 30 * 60 && route.events.recovered.length === 0; tick++) {
    route.sim.step(SIM_DT);
  }
  route.state.input.actions.massline = null;
  assert.ok(Math.hypot(hulk.pos.x - beforeTow.x, hulk.pos.z - beforeTow.z) >= 80,
    'the attached hulk physically crosses the delivery displacement threshold');
  assert.equal(route.events.recovered.length, 1,
    `station protection accepts one physically delivered hulk: ${JSON.stringify({
      pos: { x: hulk.pos.x, z: hulk.pos.z },
      marker: lossMarker(route.state) && lossMarker(route.state).playerLoss,
      delivered: route.events.delivered,
      tether: route.state.player.tether,
    })}`);
  const recoveredHulkId = hulk.id;
  route.sim.step(SIM_DT);
  assert.equal(lossMarker(route.state), null, 'the aftermath owner removes custody only after successful delivery');
  assert.equal(playerHulks(route.state).length, 0);
  assert.equal(route.state.entities.has(recoveredHulkId), false,
    'core lifetime ownership removes the recovered hulk from the entity map');
  assert.equal(route.state.entityList.some((entity) => entity && entity.id === recoveredHulkId), false,
    'core lifetime ownership removes the recovered hulk from the canonical entity list');
  for (const bucket of ['wrecks', 'mineables', 'physicsBodies', 'physicsDynamics']) {
    assert.equal((route.state.entityIndex[bucket] || []).some((entity) => entity && entity.id === recoveredHulkId), false,
      `core lifetime ownership removes the recovered hulk from entityIndex.${bucket}`);
  }
  assert.equal((route.state.physicsRuntime.sg02Snapshot || []).some((body) => body.id === recoveredHulkId), false,
    'the next production physics step retires the recovered hulk body');
  assert.deepEqual(route.state.player.cargo.items, {},
    'the Loyalty cash settlement leaves the later hulk cargo under the consumed insurer lien');
  const loyaltyClaim = route.sim.registry.get('economy').insuranceClaimForLoss(lossId);
  assert.equal(loyaltyClaim.cargoLienOutstanding, false);
  assert.ok(loyaltyClaim.cargoLienConsumedAt >= loyaltyClaim.settledAt);
  assert.equal(route.state.player.ownedShips[0].defId, 'ship_mule');
  assert.deepEqual(route.state.player.ownedShips[0].livingHull, originalHull,
    'ships restores the exact original living-hull scars');

  const ackBefore = route.events.aceVoice.filter((event) => event.situation === 'player_loss_acknowledgment');
  assert.equal(ackBefore.length, 0,
    `the acknowledgment waits for the later appearance: ${JSON.stringify(ackBefore)}`);
  route.bus.emit('namedAce:appeared', { aceId: 'ace_yara_no_cut', aceName: 'Yara No-Cut' });
  const ackAfterFirst = route.events.aceVoice.filter((event) => event.situation === 'player_loss_acknowledgment');
  assert.equal(ackAfterFirst.length, 1,
    `the first later appearance consumes the pending acknowledgment once: ${JSON.stringify({ events: ackAfterFirst, record: route.state.aceMemory.ace_yara_no_cut })}`);
  assert.equal(route.state.aceMemory.ace_yara_no_cut.playerKillAcknowledgmentPending, false,
    `the consumed acknowledgment stays closed: ${JSON.stringify(route.state.aceMemory.ace_yara_no_cut)}`);
  route.bus.emit('namedAce:appeared', { aceId: 'ace_yara_no_cut', aceName: 'Yara No-Cut' });
  assert.equal(route.events.aceVoice.filter((event) => event.situation === 'player_loss_acknowledgment').length, 1,
    'the named ace acknowledges the later encounter exactly once');

  assert.ok(Math.hypot(originalPos.x - beforeTow.x, originalPos.z - beforeTow.z) < 40,
    'the own hulk began at the actual death site');
  if (typeof physicsOwner._disableSg02DynamicAuthority === 'function') physicsOwner._disableSg02DynamicAuthority();
});

test('Basic and Full station policies settle through Economy and drive ships-owned scar-at-stake refits', async () => {
  const fitted = ['wpn_pulse_laser_s', 'mod_shield_capacitor_m', 'mod_engine_ion_m', null, null, null];
  for (const tier of ['basic', 'full']) {
    const route = boot({ credits: 100_000, fittings: fitted });
    route.state.player.heat = tier === 'full' ? 0.4 : 0;
    const clearQuote = serviceQuote(`insurance_${tier}`, route.state, route.state.entities.get(route.state.playerId));
    if (tier === 'full') {
      assert.equal(clearQuote.wantedMultiplier, 1.6, 'the quote reads the existing WANTED heat truth');
      route.state.player.heat = 0;
      const noHeatQuote = serviceQuote(`insurance_${tier}`, route.state, route.state.entities.get(route.state.playerId));
      assert.ok(clearQuote.cost > noHeatQuote.cost, 'WANTED heat raises the station premium visibly');
      route.state.player.heat = 0.4;
    }
    const physicsOwner = await preparePhysics(route);
    const quote = buyPolicy(route, tier);
    const original = deepCopy(route.state.player.ownedShips[0]);
    const creditsAfterPremium = route.state.player.credits;
    const creditEdgeCountBeforeDeath = route.events.creditsChanged.length;

    route.sim.registry.get('combat').kill(route.player, route.ace.id, {
      context: 'weapon', weaponId: 'wpn_railgun_m', dominantLayer: 'hull',
    });
    const receipt = route.state.player.activePhysicalDefeatReceipt;
    assert.equal(receipt.loss.insuranceClaim.tier, tier);
    assert.equal(receipt.loss.insuranceClaim.refitFundingCr, quote.refitFundingCr);
    assert.equal(receipt.loss.insuranceClaim.cashPayoutCr, 0);
    assert.equal(route.state.player.credits, creditsAfterPremium,
      `${tier} refit funding is not mislabeled or left as spendable player cash`);
    assert.equal(route.events.creditsChanged.slice(creditEdgeCountBeforeDeath).some((event) => event.delta > 0), false,
      `${tier} emits no positive wallet edge for in-kind refit funding`);
    assert.equal(route.state.player.insurance.activePolicy, null, `${tier} is consumed by one death`);

    awaitPhysicalRescue(route);
    const refit = route.state.player.ownedShips[0];
    assert.equal(refit.defId, 'ship_mule');
    if (tier === 'basic') {
      assert.ok(refit.fittings.every((fit) => fit == null), 'Basic returns a stock hull with no fitted modules');
      assert.notDeepEqual(refit.appearance, original.appearance, 'Basic does not preserve customization');
      assert.notDeepEqual(refit.livingHull, original.livingHull, 'Basic makes the scars meaningfully at stake');
    } else {
      assert.deepEqual(refit.fittings, original.fittings, 'Full restores the exact current fit');
      assert.deepEqual(refit.appearance, original.appearance, 'Full restores exact customization');
      assert.deepEqual(refit.livingHull, original.livingHull, 'Full restores exact living-hull scars');
    }
    if (typeof physicsOwner._disableSg02DynamicAuthority === 'function') physicsOwner._disableSg02DynamicAuthority();
  }
});

test('one-loss cover is bound to both the purchased owned-ship index and hull identity', () => {
  const route = boot({ credits: 100_000 });
  buyPolicy(route, 'full');
  const insured = deepCopy(route.state.player.ownedShips[0]);
  route.state.player.ownedShips.push(deepCopy(insured));
  route.state.player.activeShipIndex = 1;
  const result = route.sim.registry.get('economy').settlePlayerLossPolicy({
    lossId: 'wrong_same_hull_copy',
    shipSnapshot: {
      schemaVersion: 1,
      lossId: 'wrong_same_hull_copy',
      shipIndex: 1,
      defId: insured.defId,
      fittings: insured.fittings,
      appearance: insured.appearance,
      livingHull: insured.livingHull,
    },
    cargoManifest: [],
  });
  assert.equal(result.ok, true);
  assert.equal(result.claim.tier, 'loaner', 'a second owned copy of the same hull cannot borrow the first ship policy');
  assert.equal(route.state.player.insurance.activePolicy.shipIndex, 0, 'the unmatched one-loss policy stays bound and unconsumed');
});

test('uninsured real death yields a playable loaner and caps Economy-owned loss debt', async () => {
  const route = boot({ credits: 20_000 });
  const insurance = route.state.player.insurance;
  route.state.player.debt = LOANER_DEBT_CAP_CR - 100;
  insurance.loanerDebtAccruedCr = LOANER_DEBT_CAP_CR - 100;
  const physicsOwner = await preparePhysics(route);

  route.sim.registry.get('combat').kill(route.player, route.ace.id, {
    context: 'weapon', weaponId: 'wpn_railgun_m', dominantLayer: 'hull',
  });
  const claim = route.state.player.activePhysicalDefeatReceipt.loss.insuranceClaim;
  assert.equal(claim.tier, 'loaner');
  assert.equal(claim.debtAddedCr, 100);
  assert.ok(claim.debtAddedCr < LOANER_DEBT_PER_LOSS_CR);
  assert.equal(route.state.player.debt, LOANER_DEBT_CAP_CR);
  assert.equal(route.state.player.insurance.loanerDebtAccruedCr, LOANER_DEBT_CAP_CR);

  awaitPhysicalRescue(route);
  const loaner = route.state.player.ownedShips[0];
  assert.equal(loaner.defId, 'ship_kestrel');
  assert.equal(loaner.loaner.lossId, claim.lossId);
  assert.equal(route.state.entities.get(route.state.playerId).type, 'ship', 'the bounded-debt result stays playable');
  if (typeof physicsOwner._disableSg02DynamicAuthority === 'function') physicsOwner._disableSg02DynamicAuthority();
});

test('Ironman remains terminal and never enters the physical-loss coordinator', async () => {
  const route = boot({ ironman: true });
  const physicsOwner = await preparePhysics(route);
  route.sim.registry.get('combat').kill(route.player, route.ace.id, { context: 'weapon' });
  assert.equal(route.player.alive, false);
  assert.equal(route.player.type, 'ship');
  assert.equal(route.state.player.activePhysicalDefeatReceipt, undefined);
  assert.equal(playerPods(route.state).length, 0);
  assert.equal(playerHulks(route.state).length, 0);
  assert.equal(lossMarker(route.state), null);
  if (typeof physicsOwner._disableSg02DynamicAuthority === 'function') physicsOwner._disableSg02DynamicAuthority();
});
