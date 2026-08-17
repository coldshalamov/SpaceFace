import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONTACT_HAIL_ACTION_RIVAL_FINAL_DUEL,
  CONTACT_HAIL_ACTION_RIVAL_FINAL_RACE,
} from '../src/data/contactHail.js';
import { RECURRING_RIVAL, recurringRivalFinalReady } from '../src/data/namedAces.js';
import { CERES_SHIFT_RING } from '../src/data/timeTrialCourses.js';
import { SIM_DT } from '../src/core/sim.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../src/systems/ships.js';
import { resolveTimeTrialPoint } from '../src/systems/timeTrials.js';
import { solveLeadAngle } from '../src/systems/weapons.js';

const PLAYER_WEAPON_ID = 'wpn_siege_lance_l';

test('Plan 52 Rival final offers one physical race choice and remembers its TimeTrials result through Continue', async (t) => {
  const route = await bootRoute(t, 0x52f101);
  primeFinalHistory(route);
  assert.equal(recurringRivalFinalReady(route.state), true);

  await placeAtFinalStart(route);
  const trial = route.runtime.getSystem('timeTrials');
  trial._startRun(CERES_SHIFT_RING, route.player, { x: route.player.pos.x, z: route.player.pos.z });
  const final = route.state.aceMemory.rival.activeFinal;
  const kei = route.state.entities.get(final.entityId);
  route.runtime.step(SIM_DT);
  assert.equal(final.status, 'choice');
  assert.equal(kei.type, 'ship');
  assert.equal(kei.data.defId, RECURRING_RIVAL.shipDefId);
  assert.ok(route.state.physicsRuntime.sg02Snapshot.some((body) => body.id === kei.id),
    'Kei enters as a Rapier-backed production hull');
  assert.equal(route.state.npcJobs.byId[kei.data.jobId]?.job?.route?.length, CERES_SHIFT_RING.gates.length);

  const response = chooseFinal(route, kei, CONTACT_HAIL_ACTION_RIVAL_FINAL_RACE);
  assert.equal(response.rivalFinalChoice.choice, 'race');
  assert.equal(route.state.aceMemory.rival.activeFinal.status, 'race');
  assert.ok(trial.getRuntimeState().run, 'choosing race leaves the real TimeTrials run live');
  trial._complete(CERES_SHIFT_RING, route.player);

  assert.equal(route.state.aceMemory.rival.finalResolved, true);
  assert.equal(route.state.aceMemory.rival.activeFinal, null);
  assert.deepEqual(
    pick(route.state.aceMemory.rival.lastFinal, ['choice', 'method', 'winner', 'physical']),
    { choice: 'race', method: 'race', winner: 'player', physical: true },
  );
  assert.equal(recurringRivalFinalReady(route.state), false);

  const saved = JSON.parse(JSON.stringify(route.runtime.getSystem('aceMemory').serialize()));
  const continued = await bootRoute(t, 0x52f101);
  continued.runtime.getSystem('aceMemory').deserialize(saved);
  assert.equal(continued.state.aceMemory.rival.finalResolved, true);
  assert.equal(continued.state.aceMemory.rival.lastFinal.method, 'race');
  assert.equal(continued.state.aceMemory.rival.activeFinal, null);
  assert.deepEqual(Object.keys(continued.state.aceMemory.rival)
    .filter((key) => /credits|cargo|missions|playerkills/i.test(key)), []);
});

test('Plan 52 Rival final hands the same hailed Kei hull to Tactical, Weapons, Rapier, and Combat for duel', async (t) => {
  const route = await bootRoute(t, 0x52f102);
  primeFinalHistory(route);
  await placeAtFinalStart(route);
  const trial = route.runtime.getSystem('timeTrials');
  trial._startRun(CERES_SHIFT_RING, route.player, { x: route.player.pos.x, z: route.player.pos.z });
  const keiId = route.state.aceMemory.rival.activeFinal.entityId;
  const kei = route.state.entities.get(keiId);
  const jobId = kei.data.jobId;
  const creditsBefore = route.state.player.credits;

  const response = chooseFinal(route, kei, CONTACT_HAIL_ACTION_RIVAL_FINAL_DUEL);
  assert.equal(response.rivalFinalChoice.choice, 'duel');
  assert.strictEqual(route.state.entities.get(keiId), kei, 'the hailed hull itself becomes the duel actor');
  assert.equal(trial.getRuntimeState().run, null, 'TimeTrials cancels its own run for the duel choice');
  assert.equal(route.state.npcJobs.byId[jobId], undefined, 'NPC jobs releases the race route before Tactical takes over');
  assert.equal(kei.team, 1);
  assert.equal(kei.data.ai.passive, false);
  assert.equal(kei.data.rivalFinalDuel, true);
  assert.equal(kei.data.noOrdinaryRewards, true);
  assert.ok(kei.data.weapons.length > 0);
  route.runtime.step(SIM_DT);
  assert.ok(route.state.physicsRuntime.sg02Snapshot.some((body) => body.id === kei.id),
    'the same Kei hull retains its live Rapier body');

  const activeSave = JSON.parse(JSON.stringify(route.runtime.getSystem('aceMemory').serialize()));
  const interrupted = await bootRoute(t, 0x52f103);
  interrupted.runtime.getSystem('aceMemory').deserialize(activeSave);
  interrupted.bus.emit('save:loaded', { source: 'continue' });
  assert.equal(interrupted.state.aceMemory.rival.activeFinal, null);
  assert.equal(interrupted.state.aceMemory.rival.lastFinal.status, 'interrupted');
  assert.equal(interrupted.state.aceMemory.rival.lastFinal.reason, 'continue');
  assert.equal(interrupted.state.aceMemory.rival.finalResolved, false);
  assert.equal(recurringRivalFinalReady(interrupted.state), true,
    'Continue retires an in-flight duel honestly and leaves the one final retryable');

  let returnedFire = false;
  for (let tick = 0; tick < 900 && kei.alive !== false; tick += 1) {
    route.runtime.step(SIM_DT);
    returnedFire = returnedFire || route.events.some((event) => (
      event.name === 'combat:fire' && event.payload.ownerId === kei.id
    ));
    if (returnedFire) break;
  }
  assert.equal(returnedFire, true, `Kei never returned fire by tick ${route.state.tick}: ${JSON.stringify({
    kei: kei.pos, player: route.player.pos, phase: kei.data.ai?.activity?.kind,
  })}`);

  shootRival(route, kei);
  assert.equal(kei.alive, false, `player production fire must defeat Kei: ${JSON.stringify({
    player: { alive: route.player.alive, pos: route.player.pos, rot: route.player.rot },
    kei: { pos: kei.pos, hull: kei.hull, armor: kei.armorHp, shield: kei.shield },
    fires: route.events.filter((event) => event.name === 'combat:fire' && event.payload.ownerId === route.player.id).length,
    hits: route.events.filter((event) => event.name === 'projectile:hit' && event.payload.ownerId === route.player.id).slice(-5),
  })}`);
  assert.equal(route.state.aceMemory.rival.finalResolved, true);
  assert.deepEqual(
    pick(route.state.aceMemory.rival.lastFinal, ['choice', 'method', 'winner', 'physical']),
    { choice: 'duel', method: 'duel', winner: 'player', physical: true },
  );
  assert.ok(route.events.some((event) => event.name === 'entity:killed'
    && event.payload.id === kei.id && event.payload.killerId === route.player.id
    && event.payload.ordinaryRewardsSuppressed === true));
  assert.equal(route.state.player.credits, creditsBefore, 'the Rival ledger never writes a parallel payout');
  assert.equal(route.events.some((event) => event.name === 'economy:grantCredits'), false);
});

function primeFinalHistory(route) {
  const { bus, state } = route;
  bus.emit('timeTrial:completed', {
    courseId: CERES_SHIFT_RING.id,
    playerId: state.playerId,
    elapsedTicks: CERES_SHIFT_RING.medals.silverTicks,
    medal: 'silver',
  });
  for (let index = 0; index < 4; index += 1) {
    bus.emit('timeTrial:started', {
      courseId: CERES_SHIFT_RING.id,
      playerId: state.playerId,
      startedTick: state.tick,
    });
    bus.emit('timeTrial:completed', {
      courseId: CERES_SHIFT_RING.id,
      playerId: state.playerId,
      elapsedTicks: CERES_SHIFT_RING.medals.silverTicks,
      medal: 'silver',
    });
    bus.emit('sector:exit', { sectorId: CERES_SHIFT_RING.sectorId, reason: 'test_history_turn' });
    bus.emit('sector:enter', { sectorId: CERES_SHIFT_RING.sectorId });
  }
  assert.equal(state.aceMemory.rival.playerWins + state.aceMemory.rival.rivalWins, 4);
  assert.equal(state.aceMemory.rival.activeRace, null);
}

async function placeAtFinalStart(route) {
  const gate = resolveTimeTrialPoint(CERES_SHIFT_RING, CERES_SHIFT_RING.gates[0].center, route.state);
  route.player.pos.x = gate.x - 80;
  route.player.pos.z = gate.z;
  route.player.prevPos.x = route.player.pos.x;
  route.player.prevPos.z = route.player.pos.z;
  assert.equal(await route.runtime.getSystem('physics').prepareBackend(route.state, { reset: true }), true);
}

function chooseFinal(route, kei, choice) {
  route.state.player.targetId = kei.id;
  const offersBefore = route.events.filter((event) => event.name === 'contactHail:offer').length;
  route.bus.emit('contactHail:request', { targetId: kei.id, source: 'test' });
  const offer = route.events.filter((event) => event.name === 'contactHail:offer').at(-1)?.payload;
  assert.ok(offer && route.events.filter((event) => event.name === 'contactHail:offer').length > offersBefore);
  assert.equal(offer.kind, 'rival_final');
  assert.deepEqual(offer.actions.map((action) => action.id), [
    CONTACT_HAIL_ACTION_RIVAL_FINAL_RACE,
    CONTACT_HAIL_ACTION_RIVAL_FINAL_DUEL,
  ]);
  route.bus.emit('contactHail:choice', {
    requestId: offer.requestId,
    targetId: kei.id,
    choice,
  });
  const response = route.events.filter((event) => event.name === 'contactHail:response').at(-1)?.payload;
  assert.ok(response?.rivalFinalChoice?.accepted);
  return response;
}

function shootRival(route, kei) {
  route.state.player.targetId = kei.id;
  route.state.input.autoAim = { targetId: kei.id };
  const weapons = route.runtime.getSystem('weapons');
  try {
    for (let guard = 0; guard < 600 && kei.alive !== false; guard += 1) {
      const speed = route.player.data.weapons.find((weapon) => Number.isFinite(weapon.projSpeed))?.projSpeed || 600;
      route.state.input.aimAngle = solveLeadAngle(route.player, kei, speed);
      route.player.rot = route.state.input.aimAngle;
      route.state.input.fire = true;
      route.state.input.fireGroup = 1;
      weapons.update(SIM_DT, route.state);
      route.runtime.step(SIM_DT);
    }
  } finally {
    route.state.input.fire = false;
    route.state.input.fireGroup = null;
    route.state.input.autoAim = null;
  }
}

function pick(value, keys) {
  return Object.fromEntries(keys.map((key) => [key, value && value[key]]));
}

async function bootRoute(t, seed) {
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed });
  t.after(() => runtime.dispose());
  const { state, bus } = runtime;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.difficulty = 'standard';
  state.input.actions = {};
  state.input.moveX = 0;
  state.input.moveZ = 0;
  state.input.turnIntent = 0;
  state.input.boost = false;
  state.input.fire = false;
  const player = runtime.spawn(makeShipEntitySpec('ship_bastion', {
    isPlayer: true,
    team: 0,
    factionId: 'faction_free',
    pos: { x: 0, z: 0 },
    player: state.player,
    fittings: fittingsFromDefaultModules('ship_bastion', Array(4).fill(PLAYER_WEAPON_ID)),
  }));
  state.playerId = player.id;
  const events = [];
  for (const name of [
    'contactHail:offer', 'contactHail:response', 'recurringRival:finalStarted',
    'recurringRival:finalChoice', 'recurringRival:finalResolved', 'recurringRival:duelStarted',
    'combat:fire', 'projectile:hit', 'entity:killed', 'economy:grantCredits',
  ]) bus.on(name, (payload) => events.push({ name, payload: structuredClone(payload) }));
  const physics = runtime.getSystem('physics');
  assert.equal(await physics.prepareBackend(state, { reset: true }), true);
  runtime.runTicks(2, SIM_DT);
  runtime.getSystem('world').enterSector(CERES_SHIFT_RING.sectorId, { placePlayer: true });
  assert.equal(state.world.currentSectorId, CERES_SHIFT_RING.sectorId);
  return { runtime, state, bus, player, events };
}
