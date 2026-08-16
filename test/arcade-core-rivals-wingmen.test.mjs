import assert from 'node:assert/strict';
import test from 'node:test';

import { SIM_DT } from '../src/core/sim.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../src/systems/ships.js';
import { WING_ORDER, WING_ORDER_LIMITS } from '../src/data/wingOrders.js';
import { WINGMAN_VETERAN_DISCOUNT_PCT, WINGMAN_VETERAN_SORTIES } from '../src/data/wingmanPilots.js';
import {
  buildReply,
  emitBarContactChoice,
  generateContacts,
} from '../src/ui/screens/bar.js';
import { stationContactCounterValue } from '../src/data/stationContacts.js';

const DT = SIM_DT;
const PILOT_ID = 'pilot_nia_vek';
const HOME_STATION = 'station_helios';

test('named bar hire obeys four physical orders, earns ten-sortie title/rate, and a bad hold death survives Continue once', async (t) => {
  const route = await bootProductionRuntime(t, 0x60a11);
  const { runtime, state, bus, player } = route;
  state.ui.dockedStationId = HOME_STATION;
  state.player.credits = 5000;

  const hireCard = generateContacts(HOME_STATION, state)
    .find((contact) => contact.wingmanPilotId === PILOT_ID && contact.role === 'wingman_hire');
  assert.ok(hireCard, 'the named pilot is discoverable in an ordinary station bar');
  assert.match(hireCard.line, /Wasp .* pulse pair/i);
  assert.match(hireCard.line, /90 cr\/day .* loyalty 48/i);
  assert.equal(emitBarContactChoice(bus, {
    contactId: hireCard.id,
    pilotId: PILOT_ID,
    choiceId: 'hire',
    stationId: HOME_STATION,
  }), 'ui:hireWingman');

  const fleetShip = state.automation.fleet.find((entry) => entry.pilotId === PILOT_ID);
  assert.ok(fleetShip);
  const hiredReply = buildReply(hireCard.role, 'hire', { state, bus }, HOME_STATION, hireCard);
  assert.match(hiredReply.text, /Latch copies/i);
  assert.match(hiredReply.text, /loyalty 48/i);

  state.world.currentSectorId = 'sector_ceres_belt';
  bus.emit('sector:enter', { sectorId: state.world.currentSectorId });
  const wing = state.entities.get(fleetShip._liveId);
  assert.ok(wing && wing.alive !== false && wing.data.wingmanPilotId === PILOT_ID);
  assert.equal(wing.data.weapons.length, 2, 'the authored close-screen fit is live, not just bar copy');

  for (let sortie = 0; sortie < WINGMAN_VETERAN_SORTIES; sortie++) {
    bus.emit('dock:undocked', { stationId: HOME_STATION });
    runtime.runTicks(61, DT);
    bus.emit('dock:docked', { stationId: HOME_STATION });
  }
  const veteran = state.automation.wingmanRoster.records[PILOT_ID];
  assert.equal(veteran.sortiesSurvived, 10);
  assert.equal(veteran.title, 'Latch the Steady');
  assert.equal(veteran.rateDiscountPct, WINGMAN_VETERAN_DISCOUNT_PCT);
  assert.ok(veteran.loyalty > 48, 'surviving player sorties moves this pilot loyalty');
  const veteranCard = generateContacts(HOME_STATION, state)
    .find((contact) => contact.wingmanPilotId === PILOT_ID && contact.role === 'wingman_roster');
  assert.equal(veteranCard.name, 'Latch the Steady');
  assert.match(veteranCard.line, /10 surviving sorties .* 72 cr\/day/i,
    'the earned title and discount are visible on the same ordinary bar route');

  const orderReceipts = [];
  bus.on('wingOrder:accepted', (payload) => orderReceipts.push(structuredClone(payload)));

  issueOrder(bus, WING_ORDER.FOLLOW);
  const followStart = distanceToActivityAnchor(wing);
  const followStartPos = { ...wing.pos };
  let followClosest = followStart;
  for (let i = 0; i < 150; i++) {
    runtime.step(DT);
    followClosest = Math.min(followClosest, distanceToActivityAnchor(wing));
  }
  const followAnchor = wing.data.ai.activity.anchor;
  const followClosing = wing.vel.x * (followAnchor.x - wing.pos.x)
    + wing.vel.z * (followAnchor.z - wing.pos.z);
  assert.ok(Math.hypot(wing.pos.x - followStartPos.x, wing.pos.z - followStartPos.z) > 20
    && (followClosest < followStart - 5 || followClosing > 0),
  `follow physically responds toward its moving formation slot: ${JSON.stringify({ followStart, followClosest, followClosing, pos: wing.pos, vel: wing.vel, activity: wing.data.ai.activity })}`);

  issueOrder(bus, WING_ORDER.HOLD);
  const holdAnchor = { ...wing.data.ai.activity.anchor };
  runtime.runTicks(90, DT);
  assert.ok(Math.hypot(wing.pos.x - holdAnchor.x, wing.pos.z - holdAnchor.z) <= WING_ORDER_LIMITS.holdRadiusWu + 25,
    'hold keeps the live craft on the captured physical point');

  issueOrder(bus, WING_ORDER.SCATTER);
  const scatterAnchor = { ...wing.data.ai.activity.anchor };
  const scatterStart = Math.hypot(wing.pos.x - scatterAnchor.x, wing.pos.z - scatterAnchor.z);
  assert.ok(Math.abs(Math.hypot(scatterAnchor.x - player.pos.x, scatterAnchor.z - player.pos.z)
    - WING_ORDER_LIMITS.scatterArcWu) < 0.001);
  let scatterClosest = scatterStart;
  for (let i = 0; i < 150; i++) {
    runtime.step(DT);
    scatterClosest = Math.min(scatterClosest,
      Math.hypot(wing.pos.x - scatterAnchor.x, wing.pos.z - scatterAnchor.z));
  }
  const scatterClosing = wing.vel.x * (scatterAnchor.x - wing.pos.x)
    + wing.vel.z * (scatterAnchor.z - wing.pos.z);
  assert.ok(scatterClosest < scatterStart - 5 || scatterClosing > 0,
    `scatter opens real separation toward its wide physical slot: ${JSON.stringify({ scatterStart, scatterClosest, scatterClosing })}`);

  const target = runtime.spawn(makeEnemySpawnSpec('wasp_swarmer', 2, {
    x: wing.pos.x + 320, z: wing.pos.z,
  }));
  target.data.encounter = true;
  issueOrder(bus, WING_ORDER.ATTACK_MY_TARGET, target.id);
  assert.equal(wing.data.combat.targetId, target.id);
  const attackStart = Math.hypot(target.pos.x - wing.pos.x, target.pos.z - wing.pos.z);
  let attackClosest = attackStart;
  for (let guard = 0; guard < 360 && target.alive !== false; guard++) {
    runtime.step(DT);
    attackClosest = Math.min(attackClosest,
      Math.hypot(target.pos.x - wing.pos.x, target.pos.z - wing.pos.z));
  }
  assert.ok(attackClosest < attackStart - 20,
    `attack-my-target physically closes on the exact marked hostile: ${JSON.stringify({ attackStart, attackClosest, wing: wing.pos, target: target.pos })}`);
  assert.deepEqual(orderReceipts.map((receipt) => receipt.order), [
    WING_ORDER.FOLLOW,
    WING_ORDER.HOLD,
    WING_ORDER.SCATTER,
    WING_ORDER.ATTACK_MY_TARGET,
  ]);

  const creditsBeforeRate = state.player.credits;
  state.simTime = 599.99;
  runtime.runTicks(2, DT);
  assert.equal(creditsBeforeRate - state.player.credits, 72,
    'economy is the sole writer for the veteran discounted daily rate');

  issueOrder(bus, WING_ORDER.HOLD);
  const badHoldAnchor = { ...wing.data.ai.activity.anchor };
  const inputSystem = runtime.getSystem('input');
  inputSystem._keys.KeyW = true;
  inputSystem._keys.ShiftLeft = true;
  runtime.runTicks(420, DT);
  inputSystem._keys.KeyW = false;
  inputSystem._keys.ShiftLeft = false;
  const playerSeparation = Math.hypot(player.pos.x - badHoldAnchor.x, player.pos.z - badHoldAnchor.z);
  assert.ok(playerSeparation > 500,
    `the player physically leaves the held pilot behind before the hostile arrives (${playerSeparation})`);
  const playerDx = player.pos.x - wing.pos.x;
  const playerDz = player.pos.z - wing.pos.z;
  const playerDirectionLength = Math.hypot(playerDx, playerDz) || 1;
  const executioners = [-72, -36, 0, 36, 72].map((lane) => {
    const enemy = runtime.spawn(makeEnemySpawnSpec('heavy_gunship', 12, {
      x: wing.pos.x - playerDx / playerDirectionLength * 150 - playerDz / playerDirectionLength * lane,
      z: wing.pos.z - playerDz / playerDirectionLength * 150 + playerDx / playerDirectionLength * lane,
    }));
    enemy.data.encounter = true;
    return enemy;
  });
  for (let guard = 0; guard < 900 && veteran.status !== 'dead'; guard++) runtime.step(DT);
  assert.equal(veteran.status, 'dead',
    `a real hostile Weapons/Rapier/Combat route kills the held pilot: ${JSON.stringify({ playerSeparation, wing: { alive: wing.alive, hull: wing.hull, shield: wing.shield, pos: wing.pos, ai: wing.data.ai }, executioner: executioners.map((enemy) => ({ alive: enemy.alive, pos: enemy.pos, ai: enemy.data.ai, combat: enemy.data.combat, intent: enemy.data.intent })) })}`);
  assert.equal(veteran.deathOrder, WING_ORDER.HOLD);
  assert.equal(veteran.deathAcknowledgement, 'pending');

  const saved = JSON.parse(JSON.stringify(runtime.getSystem('automation').serialize()));
  const continuedRoute = await bootProductionRuntime(t, 0x60a11);
  const continued = continuedRoute.runtime;
  continued.getSystem('automation').deserialize(saved);
  continued.state.ui.dockedStationId = HOME_STATION;
  const restored = continued.state.automation.wingmanRoster.records[PILOT_ID];
  assert.equal(restored.status, 'dead');
  assert.equal(restored.title, 'Latch the Steady');
  assert.equal(restored.deathAcknowledgement, 'pending');
  assert.equal(continued.state.automation.fleet.some((entry) => entry.pilotId === PILOT_ID), false);

  const memorial = generateContacts(HOME_STATION, continued.state)
    .find((contact) => contact.wingmanPilotId === PILOT_ID && contact.role === 'wingman_memorial');
  assert.ok(memorial, 'the home bar carries the single pending death acknowledgement');
  emitBarContactChoice(continued.bus, {
    contactId: memorial.id,
    pilotId: PILOT_ID,
    choiceId: 'raise_glass',
    stationId: HOME_STATION,
  });
  const memorialReply = buildReply(memorial.role, 'raise_glass', {
    state: continued.state,
    bus: continued.bus,
  }, HOME_STATION, memorial);
  assert.match(memorialReply.text, /speaks Nia Vek's name once/i);
  assert.equal(continued.state.automation.wingmanRoster.records[PILOT_ID].deathAcknowledgement, 'heard');
  assert.equal(generateContacts(HOME_STATION, continued.state)
    .some((contact) => contact.role === 'wingman_memorial' && contact.wingmanPilotId === PILOT_ID), false);
});

test('ordinary miner/customs actions produce bounded personal regulars while ace memory stays per-ace', async (t) => {
  const route = await bootProductionRuntime(t, 0x60ace);
  const { runtime, state, bus } = route;
  for (let i = 0; i < 20; i++) {
    bus.emit('economy:tradeCompleted', {
      stationId: 'station_beltout', commodityId: 'cmdty_ore_iron', side: 'buy', qty: 1, total: 10,
    });
    bus.emit('customs:breakScan', { factionId: 'faction_scn' });
  }
  assert.equal(stationContactCounterValue(state, 'voss.purchases'), 12);
  assert.equal(stationContactCounterValue(state, 'hale.scanBreaks'), 4);
  assert.match(generateContacts('station_beltout', state)
    .find((contact) => contact.canonicalKey === 'voss').line, /raises a chipped cup/i);
  assert.match(generateContacts('station_customs', state)
    .find((contact) => contact.canonicalKey === 'hale').line, /Twice is a habit/i);

  bus.emit('namedAce:appeared', { aceId: 'ace_rust_lord_orro', sectorId: 'sector_ceres_belt' });
  bus.emit('namedAce:fled', { aceId: 'ace_rust_lord_orro', sectorId: 'sector_ceres_belt' });
  bus.emit('namedAce:appeared', { aceId: 'ace_maw_rake_veyra', sectorId: 'sector_sker_haven' });
  const orro = state.aceMemory.ace_rust_lord_orro;
  const veyra = state.aceMemory.ace_maw_rake_veyra;
  assert.equal(orro.fled, true);
  assert.equal(veyra.fled, false);
  assert.notEqual(orro, veyra);
  const aceSaved = JSON.parse(JSON.stringify(runtime.getSystem('aceMemory').serialize()));
  assert.equal(aceSaved.ace_rust_lord_orro.fled, true);
  assert.equal(aceSaved.ace_maw_rake_veyra.fled, false);
});

async function bootProductionRuntime(t, seed) {
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed });
  t.after(() => runtime.dispose());
  const state = runtime.state;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.input.actions = {};
  state.input.moveX = 0;
  state.input.moveZ = 0;
  state.input.turnIntent = 0;
  state.input.boost = false;
  state.input.fire = false;
  const player = runtime.spawn(makeShipEntitySpec('ship_hornet', {
    isPlayer: true,
    team: 0,
    factionId: 'faction_free',
    pos: { x: 5000, z: 5000 },
    fittings: fittingsFromDefaultModules('ship_hornet', []),
  }));
  state.playerId = player.id;
  const physics = runtime.getSystem('physics');
  assert.equal(await physics.prepareBackend(state, { reset: true }), true);
  assert.equal(state.physicsRuntime.diagnostics.backend, 'rapier-dynamic');
  return { runtime, state, bus: runtime.bus, player };
}

function issueOrder(bus, order, targetId = null) {
  bus.emit('ui:wingOrder', { order, scope: 'all', targetId });
}

function distanceToActivityAnchor(entity) {
  const anchor = entity.data?.ai?.activity?.anchor;
  return anchor ? Math.hypot(entity.pos.x - anchor.x, entity.pos.z - anchor.z) : Infinity;
}
