// Headless tests for the SMALL MERCIES Pit batch (PL-321..PL-332, section F — Swarm): mercy
// drones, loaners, ghost coaches, crowd gifts — and the bites for farming, hogging, taunting.
// Each plant is driven exactly as production emits: run:waveStarted while active, run:waveCleared
// while active (survivalWave.js), then run:transitioned {previousPhase, phase, reason, tick}
// (runSession.js — the phase is already committed when the receipt lands). Purchase receipts
// carry `accepted` (runSession.js:334); room solids carry data.roomKind/roomToyId
// (survivalArena.js:2232); devices are type 'beacon' with data.swarmFortify and ownerId
// (swarmFortify.js:65); collection receipts are pickup:collected (physics.js:2345); boss waves
// ride isSwarmBossWave (swarmMode.js:825, first at 5 then every five). Plain state objects are
// fine here — the plant modules are the only consumers in these tests.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';

import { veteranTapPlant, PLANTS_VETERAN_TAP_EVENT, VETERAN_TAP_TUNING, veteranVerdict, nearestPile } from '../src/systems/plants/veteranTapPlant.js';
import { crowdCoinPlant, PLANTS_CROWD_COIN_EVENT, CROWD_COIN_TUNING, isThrownKill, hasChain, isLastHit, crowdGiftTotal, otherFighterPos } from '../src/systems/plants/crowdCoinPlant.js';
import { medicMulePlant, PLANTS_MEDIC_MULE_EVENT, MEDIC_MULE_TUNING, patchAmountFor, patchedHull, muleVerdict } from '../src/systems/plants/medicMulePlant.js';
import { loanerGunPlant, PLANTS_LOANER_GUN_EVENT, LOANER_GUN_TUNING, loanerDeadlineOk, walletDrained, loanVerdict } from '../src/systems/plants/loanerGunPlant.js';
import { underdogPlatePlant, PLANTS_UNDERDOG_PLATE_EVENT, UNDERDOG_PLATE_TUNING, mercyArmed, floorVerdict } from '../src/systems/plants/underdogPlatePlant.js';
import { shadowCoachPlant, PLANTS_SHADOW_COACH_EVENT, SHADOW_COACH_TUNING, replayPositionAt, replayDurationS, coachVerdict } from '../src/systems/plants/shadowCoachPlant.js';
import { openDoorPlant, PLANTS_OPEN_DOOR_EVENT, OPEN_DOOR_TUNING, pickGateIndex, doorVerdict } from '../src/systems/plants/openDoorPlant.js';
import { tapCheerPlant, PLANTS_TAP_CHEER_EVENT, TAP_CHEER_TUNING, deviceShareRadius, hogVerdict } from '../src/systems/plants/tapCheerPlant.js';
import { veteranSeatPlant, PLANTS_VETERAN_SEAT_EVENT, VETERAN_SEAT_TUNING, seatVerdict, seatOffsetFor } from '../src/systems/plants/veteranSeatPlant.js';
import { surrenderDoorPlant, PLANTS_SURRENDER_DOOR_EVENT, SURRENDER_DOOR_TUNING, desperate, campVerdict } from '../src/systems/plants/surrenderDoorPlant.js';
import { freeForgePlant, PLANTS_FREE_FORGE_EVENT, FREE_FORGE_TUNING, forgeArmed, refundSplit, ledgerVerdict } from '../src/systems/plants/freeForgePlant.js';
import { mascotPlant, PLANTS_MASCOT_EVENT, MASCOT_TUNING, mascotNumberFor, otherNumberFor, lapOffsetAt, mascotVerdict } from '../src/systems/plants/mascotPlant.js';

const ALL_PLANTS = [
  veteranTapPlant, crowdCoinPlant, medicMulePlant, loanerGunPlant, underdogPlatePlant,
  shadowCoachPlant, openDoorPlant, tapCheerPlant, veteranSeatPlant, surrenderDoorPlant,
  freeForgePlant, mascotPlant,
];

const PLANT_EVENTS = [
  PLANTS_VETERAN_TAP_EVENT, PLANTS_CROWD_COIN_EVENT, PLANTS_MEDIC_MULE_EVENT,
  PLANTS_LOANER_GUN_EVENT, PLANTS_UNDERDOG_PLATE_EVENT, PLANTS_SHADOW_COACH_EVENT,
  PLANTS_OPEN_DOOR_EVENT, PLANTS_TAP_CHEER_EVENT, PLANTS_VETERAN_SEAT_EVENT,
  PLANTS_SURRENDER_DOOR_EVENT, PLANTS_FREE_FORGE_EVENT, PLANTS_MASCOT_EVENT,
];

// ---- harness --------------------------------------------------------------------------------------------

function swarmRun(overrides = {}) {
  return {
    kind: 'survival',
    ruleset: 'swarm',
    seed: 1234,
    arenaId: 'helios_core',
    phase: 'active',
    wave: 1,
    credits: 0,
    score: 0,
    ...overrides,
  };
}

function makeEnv({ run = swarmRun(), simTime = 0 } = {}) {
  const bus = createBus();
  const state = {
    playerId: 7,
    simTime,
    tick: Math.round(simTime * 60),
    run: run === null ? null : { ...run },
    entities: new Map(),
  };
  const spawned = [];
  let nextId = 100;
  const helpers = {
    spawnEntity(spec) {
      const e = {
        id: nextId++, alive: true,
        type: spec.type, pos: { x: spec.pos.x, z: spec.pos.z },
        vel: { x: spec.vel ? spec.vel.x : 0, z: spec.vel ? spec.vel.z : 0 },
        radius: spec.radius, hull: spec.hull, mass: spec.mass,
        ownerId: spec.ownerId, team: spec.team,
        data: { ...(spec.data || {}) },
      };
      spawned.push(e);
      state.entities.set(e.id, e);
      return e;
    },
    removeEntity(id) {
      const e = state.entities.get(id);
      if (e) e.alive = false;
      state.entities.delete(id);
    },
  };
  const voice = [];
  const cues = [];
  const receipts = new Map(PLANT_EVENTS.map((name) => [name, []]));
  bus.on('voice:say', (p) => voice.push(p));
  bus.on('audio:cue', (p) => cues.push(p));
  for (const name of PLANT_EVENTS) bus.on(name, (p) => receipts.get(name).push(p));
  const plants = ALL_PLANTS.map((plant) => {
    const p = Object.create(plant);
    p.init({ state, bus, helpers });
    return p;
  });
  return {
    bus, state, helpers, spawned, voice, cues, receipts, plants,
    emit(name, payload) { bus.emit(name, payload); },
    /** The real round-end sequence: cleared while active, then the machine commits the phase. */
    endRound(wave, nextPhase = 'cleanup') {
      this.emit('run:waveCleared', { wave, completionKind: 'clear', durationTicks: 600 });
      if (this.state.run) this.state.run.phase = nextPhase; // runSession commits the phase before emitting
      this.emit('run:transitioned', { previousPhase: 'active', phase: nextPhase, reason: 'wave_complete', tick: this.state.tick });
    },
    /** The real round-start sequence: the machine commits wave_intro/active, then the wave starts. */
    startRound(wave) {
      if (!this.state.run) {
        this.emit('run:waveStarted', { wave, tick: this.state.tick });
        return;
      }
      this.state.run.phase = 'active';
      this.state.run.wave = wave;
      this.emit('run:waveStarted', { wave, tick: this.state.tick });
    },
    advance(seconds, dt = 0.25) {
      for (let t = 0; t < seconds - 1e-9; t += dt) {
        state.simTime += dt;
        state.tick += Math.round(dt * 60);
        for (const p of plants) p.update(dt);
      }
    },
    stepAll(dt = 0.25) {
      for (const p of plants) p.update(dt);
    },
    ofPlant(plId) {
      return this.spawned.filter((e) => e.data && e.data.plants && e.data.plants[plId]);
    },
    kinds(plId, kind) {
      return this.receipts.get(PLANT_EVENTS[ALL_PLANTS.findIndex((p) => p.name.includes(plId))])
        .filter((r) => r.kind === kind);
    },
  };
}

function addEntity(env, id, fields = {}) {
  const e = { id, alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {}, ...fields };
  env.state.entities.set(id, e);
  return e;
}

/** The pilot hull. */
function pilot(env, { x = 0, z = 0, hull = 100, hullMax = 100, vx = 0, vz = 0 } = {}) {
  return addEntity(env, env.state.playerId, { pos: { x, z }, vel: { x: vx, z: vz }, hull, hullMax, data: {} });
}

/** A real room solid: type 'station', data.roomKind/roomToyId/roomOwner (survivalArena.js:2232). */
function gateSolid(env, id, pos) {
  return addEntity(env, id, {
    type: 'station', pos,
    data: { roomOwner: 'arena', roomSolidId: id, roomToyId: 'foundry_gate_a', roomKind: 'gate', roomDynamic: false },
  });
}

function furnaceSolid(env, id, pos) {
  return addEntity(env, id, {
    type: 'station', pos,
    data: { roomOwner: 'arena', roomSolidId: id, roomToyId: 'foundry_furnace', roomKind: 'furnace', roomDynamic: false },
  });
}

/** A placed fortify piece: type 'beacon', data.swarmFortify, ownerId (swarmFortify.js:65). */
function tapDevice(env, id, pos, { range = 420, ownerId = 7, deviceId = 'kinetic_turret' } = {}) {
  return addEntity(env, id, {
    type: 'beacon', pos, vel: { x: 0, z: 0 }, ownerId,
    data: { swarmFortify: { schemaVersion: 1, deviceId, effect: { range }, operational: true } },
  });
}

function receiptsFor(env, event) {
  return env.receipts.get(event);
}

// ---- PL-321 The veteran's tap -----------------------------------------------------------------------------

test('PL-321: between rounds the veteran taps your lamp twice and points; taking the hint lands', () => {
  const env = makeEnv({ run: swarmRun({ seed: 41, wave: 2 }) });
  pilot(env, { x: 0, z: 0 });
  const gate = gateSolid(env, 'survival-room-w2-foundry_gate_a', { x: 400, z: 0 });
  env.endRound(2, 'cleanup');

  const drones = env.ofPlant('pl321');
  assert.equal(drones.length, 1, 'drone spawned in the between-round window');
  assert.equal(drones[0].data.swarmFloorPad.label, 'THE VETERAN');

  env.advance(2, 0.25); // two taps, then the point
  const taps = receiptsFor(env, PLANTS_VETERAN_TAP_EVENT).filter((r) => r.kind === 'tapping');
  assert.equal(taps.length, 1);
  const tapCues = env.cues.filter((c) => c.rate === VETERAN_TAP_TUNING.tapCueRate);
  assert.equal(tapCues.length, 2, 'two lamp taps, audible at your shoulder');
  assert.equal(env.voice.length, 1, 'one line, once per run');
  assert.equal(env.voice[0].text, VETERAN_TAP_TUNING.voiceLine);
  assert.equal(env.voice[0].id, 'plants:pl321:point');
  assert.equal(drones[0].data.swarmFloorPad.label, 'GO LOOK — UNBOUGHT');
  const pointing = receiptsFor(env, PLANTS_VETERAN_TAP_EVENT).find((r) => r.kind === 'pointing');
  assert.equal(pointing.gateId, gate.id, 'the point names the unbought door');

  // take the hint: fly to the pointed door while the window is open
  pilot(env, { x: 400, z: 0 });
  env.stepAll();
  assert.ok(receiptsFor(env, PLANTS_VETERAN_TAP_EVENT).some((r) => r.kind === 'hint_taken'), 'hint taken');
  env.startRound(3);
  assert.equal(env.ofPlant('pl321').filter((e) => e.alive !== false).length, 0, 'drone gone when the round starts');
  assert.equal(env.voice.length, 1, 'no second line this run');
});

test('PL-321: ignore the point twice and the drone picks somebody else for the rest of the run', () => {
  const env = makeEnv({ run: swarmRun({ seed: 42, wave: 2 }) });
  pilot(env, { x: 0, z: 0 });
  gateSolid(env, 'survival-room-w2-foundry_gate_a', { x: 400, z: 0 });

  env.endRound(2, 'cleanup'); // window 1: drone waits, you never go
  env.startRound(2);          // window 1 closed, ignored
  env.endRound(2, 'cleanup'); // window 2
  env.startRound(2);          // ignored twice
  assert.equal(veteranVerdict(2), 'picked_somebody_else');
  const gaveUp = receiptsFor(env, PLANTS_VETERAN_TAP_EVENT).filter((r) => r.kind === 'picked_somebody_else');
  assert.ok(gaveUp.length >= 1, 'the drone moves on');

  env.endRound(3, 'cleanup'); // a later window: no drone, it helps somebody else now
  assert.equal(env.ofPlant('pl321').filter((e) => e.alive !== false).length, 0, 'no drone after it picked somebody else');
});

test('PL-321 negatives: no run, no window, no gate and no pile stay inert', () => {
  const dead = makeEnv({ run: null });
  dead.endRound(2, 'cleanup');
  assert.equal(dead.ofPlant('pl321').length, 0);

  const env = makeEnv({ run: swarmRun({ phase: 'active' }) });
  pilot(env, {});
  gateSolid(env, 'survival-room-w1-foundry_gate_a', { x: 10, z: 0 });
  env.emit('run:transitioned', { previousPhase: 'wave_intro', phase: 'active', tick: 0 });
  assert.equal(env.ofPlant('pl321').length, 0, 'not a between-round window');

  // nearestPile only reads loose pickups
  const pile = nearestPile(
    [{ type: 'pickup', pos: { x: 5, z: 0 } }, { type: 'ship', pos: { x: 1, z: 0 } }, null],
    { x: 0, z: 0 }, 100,
  );
  assert.equal(pile.pos.x, 5);
  assert.equal(nearestPile([], { x: 0, z: 0 }), null);
});

test('PL-321: run end despawns the veteran drone — no prop leaks past the run', () => {
  const env = makeEnv({ run: swarmRun({ seed: 43, wave: 2 }) });
  pilot(env, { x: 0, z: 0 });
  gateSolid(env, 'survival-room-w2-foundry_gate_a', { x: 400, z: 0 });
  env.endRound(2, 'cleanup');
  const drone = env.ofPlant('pl321')[0];
  assert.ok(drone, 'drone spawned in the between-round window');

  env.emit('run:ended', { reason: 'abandoned', tick: env.state.tick });
  assert.equal(env.ofPlant('pl321').filter((e) => e.alive !== false).length, 0, 'run end despawns the drone');
  assert.equal(env.state.entities.get(drone.id), undefined, 'the prop is removed from the world, not just forgotten');

  // The reset is bookkeeping, not retirement: the next window still gets its drone.
  env.startRound(3);
  env.endRound(3, 'cleanup');
  assert.equal(env.ofPlant('pl321').filter((e) => e.alive !== false).length, 1, 'the veteran helps again next window');
});

// ---- PL-322 The crowd's coin ------------------------------------------------------------------------------

test('PL-322: a stunt clear throws scrap worth more than the round paid at your feet; take the bow', () => {
  const env = makeEnv({ run: swarmRun({ seed: 43, wave: 3 }) });
  const me = pilot(env, { x: 0, z: 0, vx: 0, vz: 0 });
  env.emit('run:waveStarted', { wave: 3, tick: 180 });

  // the round paid 30; you land a thrown kill (a stunt)
  env.emit('run:awarded', { credits: 30, score: 10, wave: 3 });
  env.emit('entity:killed', {
    id: 810, killerId: 7, type: 'ship', cause: 'ship_collision', impactorId: 33,
    pos: { x: 40, z: 0 }, presentation: {},
  });
  assert.equal(isThrownKill({ cause: 'ship_collision', impactorId: 3 }), true);
  assert.equal(hasChain([0, 0.5, 1.0], 2), true, 'three in the window is a chain');
  assert.equal(isLastHit([9.9], 10.1), true, 'a kill inside the final beat is a catch');

  env.emit('run:waveCleared', { wave: 3, completionKind: 'clear', durationTicks: 600 });
  const gift = receiptsFor(env, PLANTS_CROWD_COIN_EVENT).find((r) => r.kind === 'scrap_gift');
  assert.ok(gift, 'the stands throw scrap');
  assert.equal(crowdGiftTotal(30), 50, 'worth more than the round paid');
  assert.equal(gift.credits, 50);
  assert.equal(gift.pickupIds.length, CROWD_COIN_TUNING.scrapPickups);
  const chips = gift.pickupIds.map((id) => env.state.entities.get(id));
  assert.ok(chips.every((c) => c && c.type === 'pickup' && c.data.wallet === 'run' && c.data.credits > 0));

  // take the bow: stand by the pile, still
  me.vel = { x: 0, z: 0 };
  env.advance(2, 0.25);
  assert.ok(receiptsFor(env, PLANTS_CROWD_COIN_EVENT).some((r) => r.kind === 'bow'), 'the crowd roars the bow');

  // scooping the pile through the ordinary route ends the gift quietly
  for (const id of gift.pickupIds) env.state.entities.delete(id);
  env.advance(0.5, 0.25);
  assert.ok(receiptsFor(env, PLANTS_CROWD_COIN_EVENT).some((r) => r.kind === 'scrap_scooped'));
});

test('PL-322: taunt the crowd for more and the gift is repossessed — the next throw lands at the other fighter', () => {
  const env = makeEnv({ run: swarmRun({ seed: 44, wave: 3 }) });
  const me = pilot(env, { x: 0, z: 0 });
  env.emit('run:waveStarted', { wave: 3, tick: 180 });
  env.emit('entity:killed', { id: 811, killerId: 7, type: 'ship', cause: 'ship_collision', impactorId: 2, pos: { x: 0, z: 0 }, presentation: {} });
  env.emit('run:waveCleared', { wave: 3, completionKind: 'clear', durationTicks: 600 });
  const gift = receiptsFor(env, PLANTS_CROWD_COIN_EVENT).find((r) => r.kind === 'scrap_gift');
  assert.ok(gift, 'first gift lands at your feet');

  // fire while the gift is down: asking the crowd for more
  env.emit('combat:fire', { ownerId: 7, origin: { x: 0, z: 0 } });
  const taunt = receiptsFor(env, PLANTS_CROWD_COIN_EVENT).find((r) => r.kind === 'taunted');
  assert.ok(taunt, 'the crowd reads the taunt');
  for (const id of taunt.pulledIds) assert.equal(env.state.entities.has(id), false, 'the gift is repossessed');

  // the next stunt's throw lands across the floor
  env.startRound(4);
  env.emit('run:awarded', { credits: 30, wave: 4 });
  env.emit('entity:killed', { id: 812, killerId: 7, type: 'ship', cause: 'ship_collision', impactorId: 3, pos: { x: 0, z: 0 }, presentation: {} });
  env.emit('run:waveCleared', { wave: 4, completionKind: 'clear', durationTicks: 600 });
  const away = receiptsFor(env, PLANTS_CROWD_COIN_EVENT).find((r) => r.kind === 'thrown_to_other_fighter');
  assert.ok(away, 'the next throw lands at the other fighter');
  const landAt = otherFighterPos(me.pos, 44);
  assert.equal(away.center.x, landAt.x);
  assert.equal(away.center.z, landAt.z);
  assert.ok(Math.hypot(away.center.x - me.pos.x, away.center.z - me.pos.z) >= CROWD_COIN_TUNING.otherFighterOffsetWu - 1);

  // no bow is available on the offended throw: there was never a gift to bow to
  env.advance(2, 0.25);
  assert.equal(receiptsFor(env, PLANTS_CROWD_COIN_EVENT).filter((r) => r.kind === 'bow').length, 0, 'the offended throw earns no bow');
});

test('PL-322 negatives: plain clears pay nothing, no run pays nothing', () => {
  const env = makeEnv({ run: swarmRun({ wave: 3 }) });
  pilot(env, {});
  env.emit('run:waveStarted', { wave: 3, tick: 180 });
  env.emit('run:waveCleared', { wave: 3, completionKind: 'clear', durationTicks: 600 });
  assert.equal(receiptsFor(env, PLANTS_CROWD_COIN_EVENT).length, 0, 'no stunt, no gift');

  const dead = makeEnv({ run: null });
  dead.emit('run:waveStarted', { wave: 3, tick: 180 });
  dead.emit('entity:killed', { id: 813, killerId: 7, cause: 'ship_collision', impactorId: 1, pos: { x: 0, z: 0 }, presentation: {} });
  dead.emit('run:waveCleared', { wave: 3, completionKind: 'clear', durationTicks: 600 });
  assert.equal(receiptsFor(env, PLANTS_CROWD_COIN_EVENT).length, 0);
  assert.equal(receiptsFor(dead, PLANTS_CROWD_COIN_EVENT).length, 0);
});

// ---- PL-323 The medic mule ----------------------------------------------------------------------------------

test('PL-323: come off a round badly hurt and the mule trundles across and patches one bar, free', () => {
  const env = makeEnv({ run: swarmRun({ seed: 45, wave: 4 }) });
  const me = pilot(env, { x: 0, z: 0, hull: 18, hullMax: 100 });
  env.endRound(4, 'cleanup');

  const mules = env.ofPlant('pl323');
  assert.equal(mules.length, 1, 'the mule is out');
  assert.equal(mules[0].data.swarmFloorPad.label, 'MEDIC MULE');
  const start = mules[0].pos;
  assert.ok(Math.hypot(start.x, start.z) >= MEDIC_MULE_TUNING.spawnOffsetWu - 1, 'it starts out on the floor');

  env.advance(3.2, 0.25); // 300 Wu at 90 Wu/s, arriving inside the 48 Wu ring
  const patched = receiptsFor(env, PLANTS_MEDIC_MULE_EVENT).find((r) => r.kind === 'patched');
  assert.ok(patched, 'it reaches you and patches');
  assert.equal(patched.free, true);
  assert.equal(patched.bill, 0, 'no bill');
  assert.equal(me.hull, patchedHull(18, 100), 'one clamped bar');
  assert.equal(patchAmountFor(100), 25);
  assert.equal(env.ofPlant('pl323').filter((e) => e.alive !== false).length, 0, 'the mule trundles off');

  // once per run: the next window sends nothing
  env.startRound(5);
  env.state.run.credits = 0;
  me.hull = 15;
  env.endRound(5, 'cleanup');
  assert.equal(env.ofPlant('pl323').length, 1, 'no second mule this run');
  assert.equal(muleVerdict({ patchGiven: true }), 'patched_once');
});

test('PL-323: farm it by self-harm mid-trundle and the mule stops coming', () => {
  const env = makeEnv({ run: swarmRun({ seed: 46, wave: 4 }) });
  pilot(env, { x: 0, z: 0, hull: 15, hullMax: 100 });
  env.endRound(4, 'cleanup');
  assert.equal(env.ofPlant('pl323').length, 1, 'mule en route');

  // you hurt yourself while it trundles toward you
  env.emit('combat:crushed', { entityId: 7, toyId: 55, t: env.state.simTime });
  const offended = receiptsFor(env, PLANTS_MEDIC_MULE_EVENT).find((r) => r.kind === 'mule_offended');
  assert.ok(offended, 'the mule reads the farming');
  assert.equal(env.ofPlant('pl323').filter((e) => e.alive !== false).length, 0, 'it stops and turns');

  env.startRound(5);
  env.state.run.phase = 'cleanup';
  pilot(env, { x: 0, z: 0, hull: 10, hullMax: 100 });
  env.emit('run:transitioned', { previousPhase: 'active', phase: 'cleanup', reason: 'wave_complete', tick: env.state.tick });
  assert.equal(env.ofPlant('pl323').length, 1, 'it will not come again this run');
  assert.equal(muleVerdict({ offended: true }), 'stopped_coming');
});

test('PL-323 negatives: healthy hull, active round, no run', () => {
  const env = makeEnv({ run: swarmRun({ wave: 4 }) });
  pilot(env, { hull: 100, hullMax: 100 });
  env.endRound(4, 'cleanup');
  assert.equal(env.ofPlant('pl323').length, 0, 'not badly hurt, no mule');

  const live = makeEnv({ run: swarmRun({ wave: 4, phase: 'active' }) });
  pilot(live, { hull: 10, hullMax: 100 });
  live.emit('run:transitioned', { previousPhase: 'wave_intro', phase: 'active', tick: 0 });
  assert.equal(live.ofPlant('pl323').length, 0, 'not between rounds');

  const dead = makeEnv({ run: null });
  dead.endRound(4, 'cleanup');
  assert.equal(dead.ofPlant('pl323').length, 0);
});

// ---- PL-324 The loaner gun ----------------------------------------------------------------------------------

test('PL-324: drained wallet before round five grows a LOANER mount; returning by ten settles the ledger', () => {
  const env = makeEnv({ run: swarmRun({ seed: 47, wave: 1, credits: 40 }) });
  pilot(env, { x: 0, z: 0 });
  gateSolid(env, 'survival-room-w1-foundry_gate_a', { x: 300, z: 0 });
  assert.equal(walletDrained(40), true);

  env.endRound(1, 'refit');
  const mounts = env.ofPlant('pl324');
  assert.equal(mounts.length, 1, 'a wall mount grows a gun');
  assert.equal(mounts[0].data.swarmFloorPad.label, 'LOANER — NO CHARGE');
  const offer = receiptsFor(env, PLANTS_LOANER_GUN_EVENT).find((r) => r.kind === 'loaner_offered');
  assert.ok(offer);

  // take it: fly to the mount
  pilot(env, { x: 344, z: 44 });
  env.stepAll();
  const taken = receiptsFor(env, PLANTS_LOANER_GUN_EVENT).find((r) => r.kind === 'loan_taken');
  assert.ok(taken, 'the loan is on the ledger');
  assert.equal(taken.charge, 0, 'no charge');

  // bring it back by ten
  env.startRound(2);
  env.endRound(2, 'refit');
  const returns = env.ofPlant('pl324');
  assert.equal(returns.length, 2, 'a return mount waits');
  assert.equal(returns[1].data.swarmFloorPad.label, 'LOANER RETURN');
  env.stepAll();
  const settled = receiptsFor(env, PLANTS_LOANER_GUN_EVENT).find((r) => r.kind === 'loan_settled');
  assert.ok(settled, 'the loan is settled');
  assert.equal(env.voice.length, 1);
  assert.equal(env.voice[0].text, LOANER_GUN_TUNING.voiceLine);
  assert.equal(loanVerdict({ taken: true, settled: true }), 'settled');
});

test('PL-324: keep it past ten and the ledger defaults — loaners stop for the run', () => {
  const env = makeEnv({ run: swarmRun({ seed: 48, wave: 1, credits: 40 }) });
  pilot(env, { x: 0, z: 0 });
  gateSolid(env, 'survival-room-w1-foundry_gate_a', { x: 300, z: 0 });
  env.endRound(1, 'cleanup');
  pilot(env, { x: 344, z: 44 });
  env.stepAll(); // loan taken
  assert.ok(receiptsFor(env, PLANTS_LOANER_GUN_EVENT).some((r) => r.kind === 'loan_taken'));
  assert.equal(loanerDeadlineOk(11), false);

  env.startRound(11); // past ten, still holding it
  const defaulted = receiptsFor(env, PLANTS_LOANER_GUN_EVENT).find((r) => r.kind === 'loan_defaulted');
  assert.ok(defaulted, 'the ledger defaults you');
  assert.equal(defaulted.stopsFor, 'run');

  env.endRound(11, 'cleanup');
  assert.equal(env.ofPlant('pl324').filter((e) => e.alive !== false).length, 0, 'no mount grows for a defaulted hull');
  assert.ok(receiptsFor(env, PLANTS_LOANER_GUN_EVENT).some((r) => r.kind === 'loaners_stopped'));
  assert.equal(loanVerdict({ taken: true, defaulted: true }), 'defaulted');
});

test('PL-324 negatives: solvent wallet, round five past, no run', () => {
  const env = makeEnv({ run: swarmRun({ wave: 5, credits: 900 }) });
  pilot(env, {});
  gateSolid(env, 'survival-room-w5-foundry_gate_a', { x: 10, z: 0 });
  env.endRound(5, 'cleanup');
  assert.equal(env.ofPlant('pl324').length, 0, 'wallet is fine, no loaner');

  const late = makeEnv({ run: swarmRun({ wave: 7, credits: 40 }) });
  pilot(late, {});
  gateSolid(late, 'survival-room-w7-foundry_gate_a', { x: 10, z: 0 });
  late.endRound(7, 'cleanup');
  assert.equal(late.ofPlant('pl324').length, 0, 'past round five, no offer');

  const dead = makeEnv({ run: null });
  dead.endRound(1, 'cleanup');
  assert.equal(dead.ofPlant('pl324').length, 0);
});

// ---- PL-325 The underdog plate ------------------------------------------------------------------------------

test('PL-325: five straight losses arm one unannounced health pad near your wreck', () => {
  const env = makeEnv({ run: swarmRun({ seed: 49, wave: 1 }) });
  const me = pilot(env, { x: 0, z: 0, hull: 100, hullMax: 100 });
  for (let i = 0; i < 5; i++) env.emit('run:ended', { outcome: 'defeat', reason: 'wiped', tick: i });
  assert.equal(mercyArmed(5, false), true);

  env.startRound(1); // a fresh run after the fifth straight loss
  env.advance(1, 0.25);
  assert.equal(env.ofPlant('pl325').length, 0, 'not yet hurting: no pad, no sound');
  assert.equal(env.cues.length, 0);
  assert.equal(env.voice.length, 0);

  me.hull = 30; // you are hurting again — the floor answers, unannounced
  env.advance(0.5, 0.25);
  const pads = env.ofPlant('pl325');
  assert.equal(pads.length, 1, 'one extra health pad near your wreck');
  assert.equal(pads[0].type, 'pickup');
  assert.ok(receiptsFor(env, PLANTS_UNDERDOG_PLATE_EVENT).some((r) => r.kind === 'mercy_pad'));

  // take the mercy: the ordinary pickup route, one bar
  env.emit('pickup:collected', { pickupId: pads[0].id, collectorId: 7, kind: 'medic_pad', amount: 1, pos: pads[0].pos });
  const taken = receiptsFor(env, PLANTS_UNDERDOG_PLATE_EVENT).find((r) => r.kind === 'mercy_taken');
  assert.ok(taken, 'the mercy is taken');
  assert.equal(me.hull, 55, 'one clamped bar');
});

test('PL-325: lose on purpose to farm it — the sixth loss spawns nothing, and the floor is not sorry', () => {
  const env = makeEnv({ run: swarmRun({ seed: 50, wave: 1 }) });
  const me = pilot(env, { x: 0, z: 0, hull: 100, hullMax: 100 });
  for (let i = 0; i < 5; i++) env.emit('run:ended', { outcome: 'defeat', reason: 'wiped', tick: i });
  env.startRound(1);
  me.hull = 20;
  env.advance(0.5, 0.25);
  assert.equal(env.ofPlant('pl325').length, 1, 'the mercy lands once');
  env.emit('run:ended', { outcome: 'defeat', reason: 'wiped', tick: 6 }); // the sixth straight loss
  const noMercy = receiptsFor(env, PLANTS_UNDERDOG_PLATE_EVENT).find((r) => r.kind === 'no_mercy');
  assert.ok(noMercy, 'the sixth loss is refused');
  assert.equal(floorVerdict(6, true), 'not_sorry');

  env.startRound(1); // a seventh run: still nothing, and the floor says so once
  const notSorry = receiptsFor(env, PLANTS_UNDERDOG_PLATE_EVENT).filter((r) => r.kind === 'floor_not_sorry');
  assert.equal(notSorry.length, 1);
  me.hull = 10;
  env.advance(1, 0.25);
  assert.equal(env.ofPlant('pl325').length, 1, 'no pad for a farmed streak');

  // a win resets the ledger
  env.emit('run:ended', { outcome: 'victory', reason: 'act_complete', tick: 7 });
  env.startRound(1);
  assert.equal(env.ofPlant('pl325').length, 1, 'clean slate: no offers without five fresh losses');
});

// ---- PL-326 The shadow coach --------------------------------------------------------------------------------

test('PL-326: after a death your ghost replays your line; watching it lands', () => {
  const env = makeEnv({ run: swarmRun({ seed: 51, wave: 6 }) });
  const me = pilot(env, { x: 0, z: 0 });
  env.startRound(6);
  env.advance(6, 0.25); // the plant records your line (0.6 s cadence, ~10 samples)
  assert.equal(replayDurationS(10), 1.5);

  env.emit('entity:killed', { id: 7, killerId: 900, type: 'ship', cause: 'explosive', pos: { x: 0, z: 0 }, presentation: {} });
  const started = receiptsFor(env, PLANTS_SHADOW_COACH_EVENT).find((r) => r.kind === 'replay_started');
  assert.ok(started, 'the ghost is out');
  assert.ok(started.samples >= 4, 'it replays the whole recorded line');
  const ghosts = env.ofPlant('pl326');
  assert.equal(ghosts.length, 1);
  assert.equal(ghosts[0].data.swarmFloorPad.label, 'YOUR GHOST');

  // watch and learn: stand near your ghost
  env.advance(1.5, 0.25);
  assert.ok(receiptsFor(env, PLANTS_SHADOW_COACH_EVENT).some((r) => r.kind === 'watched'), 'watched');
  // the line finishes and the ghost departs
  env.advance(2, 0.25);
  assert.equal(env.ofPlant('pl326').filter((e) => e.alive !== false).length, 0, 'the replay ends, the ghost goes');
  const at = replayPositionAt([{ x: 0, z: 0 }, { x: 40, z: 0 }], 0, 1.2);
  assert.deepEqual({ x: at.x, z: at.z }, { x: 40, z: 0 }, 'the ghost walks the recorded line at 4x');
  assert.equal(replayPositionAt([{ x: 1, z: 1 }], 0, 99).x, 1, 'the line holds its end');
});

test('PL-326: skip it three times and the ghost stops showing, keeping its secrets', () => {
  const env = makeEnv({ run: swarmRun({ seed: 52, wave: 6 }) });
  pilot(env, { x: 0, z: 0 });
  env.startRound(6);
  env.advance(8, 0.25);

  for (let death = 0; death < 3; death++) {
    pilot(env, { x: 0, z: 0 });
    env.emit('entity:killed', { id: 7, killerId: 900, type: 'ship', cause: 'explosive', pos: { x: 0, z: 0 }, presentation: {} });
    assert.equal(env.ofPlant('pl326').length, death + 1, `ghost ${death + 1} shows`);
    pilot(env, { x: 800, z: 0 }); // walk away from it mid-replay
    env.advance(1.6, 0.25);
    assert.equal(receiptsFor(env, PLANTS_SHADOW_COACH_EVENT).filter((r) => r.kind === 'skipped').length, death + 1);
    env.advance(2, 0.25); // the replay dies out
  }
  const retired = receiptsFor(env, PLANTS_SHADOW_COACH_EVENT).find((r) => r.kind === 'ghost_retired');
  assert.ok(retired, 'three skips retire the coach');
  assert.equal(coachVerdict(3), 'retired');

  // the ghost stops showing
  pilot(env, { x: 0, z: 0 });
  const before = receiptsFor(env, PLANTS_SHADOW_COACH_EVENT).length;
  env.emit('entity:killed', { id: 7, killerId: 900, type: 'ship', cause: 'explosive', pos: { x: 0, z: 0 }, presentation: {} });
  assert.equal(env.ofPlant('pl326').length, 3, 'no fourth ghost');
  assert.ok(receiptsFor(env, PLANTS_SHADOW_COACH_EVENT).some((r) => r.kind === 'ghost_gone'));
  assert.ok(receiptsFor(env, PLANTS_SHADOW_COACH_EVENT).length >= before);
});

// ---- PL-327 The open door ------------------------------------------------------------------------------------

test('PL-327: on the last round before a boss one random door stands open and paid; use the gift', () => {
  const env = makeEnv({ run: swarmRun({ seed: 53, wave: 4 }) }); // next wave 5 is the first boss
  pilot(env, { x: 0, z: 0 });
  const gateA = gateSolid(env, 'survival-room-w4-foundry_gate_a', { x: 300, z: 0 });
  gateSolid(env, 'survival-room-w4-foundry_gate_b', { x: -300, z: 0 });
  const pick = pickGateIndex(1234, 0, 2);

  env.endRound(4, 'refit');
  const doors = env.ofPlant('pl327').filter((e) => e.data.plants.pl327.role === 'open_door');
  assert.equal(doors.length, 1, 'exactly one door, open and paid');
  assert.equal(doors[0].data.swarmFloorPad.label, 'OPEN — PAID');
  const arrows = env.ofPlant('pl327').filter((e) => e.data.plants.pl327.role === 'chalk_arrow');
  assert.equal(arrows.length, 1, 'a chalk arrow beside it');
  const opened = receiptsFor(env, PLANTS_OPEN_DOOR_EVENT).find((r) => r.kind === 'door_open');
  assert.equal(opened.paid, 0, 'no toll');
  const expectedGate = pick === 0 ? gateA.id : 'survival-room-w4-foundry_gate_b';
  assert.equal(opened.gateId, expectedGate, 'the random gate is a hash32 draw, not a coin flip');

  // use the gift: fly into the door
  pilot(env, { x: doors[0].pos.x, z: doors[0].pos.z });
  env.stepAll();
  const used = receiptsFor(env, PLANTS_OPEN_DOOR_EVENT).find((r) => r.kind === 'gift_used');
  assert.ok(used, 'the gift is used');
  assert.equal(doorVerdict(true), 'gift_used');
  env.startRound(5);
  assert.equal(env.ofPlant('pl327').filter((e) => e.alive !== false).length, 0, 'props gone when the boss arrives');
});

test('PL-327: wait for two and the door shuts — the arrow moves on and the next boss-eve opens nothing', () => {
  const env = makeEnv({ run: swarmRun({ seed: 54, wave: 9 }) }); // next wave 10 is a boss
  pilot(env, { x: 0, z: 0 });
  gateSolid(env, 'survival-room-w9-foundry_gate_a', { x: 300, z: 0 });
  env.endRound(9, 'cleanup');
  const doors = env.ofPlant('pl327').filter((e) => e.data.plants.pl327.role === 'open_door');
  assert.equal(doors.length, 1);

  // hover NEAR the door hoping a second will open, never using it
  pilot(env, { x: doors[0].pos.x + 90, z: doors[0].pos.z });
  env.advance(OPEN_DOOR_TUNING.patienceS + 1, 0.25);
  assert.ok(receiptsFor(env, PLANTS_OPEN_DOOR_EVENT).some((r) => r.kind === 'waiting_for_two'), 'the wish is visible');

  env.startRound(10);
  const shut = receiptsFor(env, PLANTS_OPEN_DOOR_EVENT).find((r) => r.kind === 'door_shut');
  assert.ok(shut, 'the door shuts, unused');
  assert.equal(doorVerdict(false), 'door_shut');

  env.endRound(14, 'cleanup'); // the next boss-eve window (wave 15)
  assert.equal(env.ofPlant('pl327').filter((e) => e.alive !== false).length, 0, 'the arrow moved on: no door');
  assert.ok(receiptsFor(env, PLANTS_OPEN_DOOR_EVENT).some((r) => r.kind === 'arrow_moved_on'));
});

test('PL-327 negatives: not a boss-eve window, no run', () => {
  const env = makeEnv({ run: swarmRun({ wave: 5 }) }); // next wave 6: no boss
  pilot(env, {});
  gateSolid(env, 'survival-room-w5-foundry_gate_a', { x: 0, z: 0 });
  env.endRound(5, 'cleanup');
  assert.equal(env.ofPlant('pl327').length, 0);

  const dead = makeEnv({ run: null });
  dead.endRound(4, 'cleanup');
  assert.equal(dead.ofPlant('pl327').length, 0);
});

// ---- PL-328 The Tap cheer ------------------------------------------------------------------------------------

test('PL-328: a stranger sharing your Tap mid-round gets the chant, and the Tap runs one surge longer', () => {
  const env = makeEnv({ run: swarmRun({ seed: 55, wave: 6 }) });
  pilot(env, { x: 0, z: 0 });
  const tap = tapDevice(env, 40, { x: 0, z: 0 }, { range: 420 });
  assert.equal(deviceShareRadius(tap), 420);
  const stranger = addEntity(env, 60, { type: 'ship', pos: { x: 30, z: 0 } });

  env.startRound(6);
  env.advance(2.5, 0.5);
  const chant = receiptsFor(env, PLANTS_TAP_CHEER_EVENT).find((r) => r.kind === 'stands_chant');
  assert.ok(chant, 'the stands chant the sharing');
  assert.equal(chant.deviceId, tap.id);
  const surge = receiptsFor(env, PLANTS_TAP_CHEER_EVENT).find((r) => r.kind === 'surge_extended');
  assert.ok(surge, 'the surge receipt lands');
  assert.equal(surge.extraS, TAP_CHEER_TUNING.surgeLampS);
  assert.equal(tap.data.lampsFlashing, true, 'the surge is on the piece in lamps');
  assert.ok(tap.data.lampFlashUntil > env.state.simTime - TAP_CHEER_TUNING.surgeLampS - 1, 'one surge longer, in lamps');

  // one cheer per device per round
  env.advance(2, 0.5);
  assert.equal(receiptsFor(env, PLANTS_TAP_CHEER_EVENT).filter((r) => r.kind === 'stands_chant').length, 1);
  assert.equal(stranger.alive, true);
});

test('PL-328: hog every tap and taps on your runs run dry a beat early', () => {
  const env = makeEnv({ run: swarmRun({ seed: 56, wave: 4 }) });
  pilot(env, { x: 0, z: 0 });
  tapDevice(env, 41, { x: 0, z: 0 });
  tapDevice(env, 42, { x: 400, z: 0 });
  addEntity(env, 61, { type: 'ship', pos: { x: 2000, z: 0 } }); // a stranger, far from both

  env.startRound(4);
  env.advance(1, 0.5);
  env.endRound(4, 'cleanup');
  const hogged = receiptsFor(env, PLANTS_TAP_CHEER_EVENT).find((r) => r.kind === 'taps_hogged');
  assert.ok(hogged, 'owning every socket with nobody sharing reads as hogging');
  assert.equal(hogged.devices, 2);
  assert.equal(hogVerdict(1, false), 'wet');

  env.startRound(5);
  env.advance(1, 0.5);
  env.endRound(5, 'cleanup');
  assert.ok(receiptsFor(env, PLANTS_TAP_CHEER_EVENT).some((r) => r.kind === 'taps_dry'), 'the floor shorts you');
  assert.equal(hogVerdict(2, true), 'dry');

  // the dry beat rides your next purchase
  env.emit('run:purchaseResolved', { accepted: true, requestId: 5, reason: null, credits: 120, totalCredits: 20 });
  const dry = receiptsFor(env, PLANTS_TAP_CHEER_EVENT).find((r) => r.kind === 'dry_beat');
  assert.ok(dry, 'the till denies a beat');
  assert.ok(env.cues.some((c) => c.id === 'ui_deny'));

  // a wet run never denies
  const wet = makeEnv({ run: swarmRun({ wave: 4 }) });
  pilot(wet, {});
  wet.emit('run:purchaseResolved', { accepted: true, requestId: 1, reason: null, credits: 80, totalCredits: 0 });
  assert.equal(receiptsFor(wet, PLANTS_TAP_CHEER_EVENT).length, 0);
});

// ---- PL-329 The veteran's seat -------------------------------------------------------------------------------

test('PL-329: hold still in the champion seat between rounds and the next draft shows its hidden stat', () => {
  const env = makeEnv({ run: swarmRun({ seed: 57, wave: 3 }) });
  pilot(env, { x: 0, z: 0 });
  const gate = gateSolid(env, 'survival-room-w3-foundry_gate_a', { x: 500, z: 0 });

  env.endRound(3, 'draft');
  const seats = env.ofPlant('pl329');
  assert.equal(seats.length, 1, 'the seat is set');
  assert.equal(seats[0].data.swarmFloorPad.label, 'V. CHAMP SAT HERE');
  const off = seatOffsetFor(57);
  assert.deepEqual({ x: seats[0].pos.x, z: seats[0].pos.z }, { x: 500 + off.x, z: off.z });

  // sit: still, beside it
  pilot(env, { x: seats[0].pos.x + 5, z: seats[0].pos.z, vx: 0, vz: 0 });
  env.advance(VETERAN_SEAT_TUNING.sitHoldS + 1, 0.25);
  const sat = receiptsFor(env, PLANTS_VETERAN_SEAT_EVENT).find((r) => r.kind === 'sat');
  assert.ok(sat, 'you sat the seat');
  assert.equal(sat.nextDraft, 'one hidden stat shown');
  assert.equal(seats[0].data.swarmFloorPad.label, 'SAT — GOOD LUCK');
  assert.equal(seatVerdict({ sat: true }), 'stat_shown');

  env.startRound(4);
  assert.equal(env.ofPlant('pl329').filter((e) => e.alive !== false).length, 0, 'the seat packs up with the window');
});

test('PL-329: chalk your own name over it and your next draft is blind — the chalk remembers', () => {
  const env = makeEnv({ run: swarmRun({ seed: 58, wave: 3 }) });
  pilot(env, { x: 0, z: 0 });
  gateSolid(env, 'survival-room-w3-foundry_gate_a', { x: 500, z: 0 });
  env.endRound(3, 'draft');
  const seat = env.ofPlant('pl329')[0];

  // firing over the seat is chalking your own name on the champion's
  env.emit('combat:fire', { ownerId: 7, origin: { x: seat.pos.x + 10, z: seat.pos.z } });
  const chalked = receiptsFor(env, PLANTS_VETERAN_SEAT_EVENT).find((r) => r.kind === 'chalked_over');
  assert.ok(chalked, 'the chalk reads the disrespect');
  assert.equal(chalked.nextDraft, 'blind');
  assert.equal(env.ofPlant('pl329').filter((e) => e.alive !== false).length, 0, 'the seat is gone');

  env.startRound(3);
  env.endRound(3, 'cleanup');
  assert.equal(env.ofPlant('pl329').length, 1, 'no seat is offered again this run');
  assert.ok(receiptsFor(env, PLANTS_VETERAN_SEAT_EVENT).some((r) => r.kind === 'chalk_remembers'));
  assert.equal(seatVerdict({ chalked: true }), 'chalked_over');
});

// ---- PL-330 The surrender door --------------------------------------------------------------------------------

test('PL-330: outgunned past hope in the first minute opens a free side door; staging at it leaves with your hull', () => {
  const env = makeEnv({ run: swarmRun({ seed: 59, wave: 7 }) });
  const me = pilot(env, { x: 0, z: 0, hull: 100, hullMax: 100 });
  env.startRound(7);
  assert.equal(desperate(0.1, 30), true);
  assert.equal(desperate(0.5, 30), false);
  assert.equal(desperate(0.1, 90), false, 'past the first minute it stays shut');

  me.hull = 12; // outgunned past hope, still in the first minute
  env.advance(1, 0.5);
  const doors = env.ofPlant('pl330');
  assert.equal(doors.length, 1, 'a side door opens');
  assert.equal(doors[0].data.swarmFloorPad.label, 'SURRENDER — FREE');
  const open = receiptsFor(env, PLANTS_SURRENDER_DOOR_EVENT).find((r) => r.kind === 'door_open');
  assert.equal(open.toll, 0, 'no toll');
  assert.equal(env.voice.length, 0, 'no taunt');
  assert.equal(env.cues.length, 0, 'no sound at all');

  // leave with your hull: stage at the door
  pilot(env, { x: doors[0].pos.x, z: doors[0].pos.z });
  env.advance(2.5, 0.5);
  const staged = receiptsFor(env, PLANTS_SURRENDER_DOOR_EVENT).find((r) => r.kind === 'surrender_staged');
  assert.ok(staged, 'staged');
  assert.equal(staged.record, 'untouched', 'the record is never touched');

  // one door per round: shut it out
  env.advance(SURRENDER_DOOR_TUNING.doorTtlS, 0.5);
  assert.equal(env.ofPlant('pl330').filter((e) => e.alive !== false).length, 0, 'the door shuts behind you');
});

test('PL-330: exit-camp for pity doors and the floor stops opening them for your hull', () => {
  const env = makeEnv({ run: swarmRun({ seed: 60, wave: 7 }) });
  const me = pilot(env, { x: 0, z: 0, hull: 100, hullMax: 100 });
  env.startRound(7);
  me.hull = 10;
  env.advance(1, 0.5);
  const doors = env.ofPlant('pl330');
  assert.equal(doors.length, 1);
  const spot = { x: doors[0].pos.x, z: doors[0].pos.z };

  env.advance(SURRENDER_DOOR_TUNING.doorTtlS + 0.5, 0.5); // let it shut, you never staged
  assert.equal(campVerdict(0, false), 'watching');

  // now loiter at the shut door's spot, waiting for a pity door
  pilot(env, { x: spot.x, z: spot.z });
  env.advance(SURRENDER_DOOR_TUNING.campLimitS + 1, 0.5);
  const closed = receiptsFor(env, PLANTS_SURRENDER_DOOR_EVENT).find((r) => r.kind === 'doors_closed_for_you');
  assert.ok(closed, 'the floor reads the camping');
  assert.equal(campVerdict(closed.loiterS, false), 'doors_closed');

  // next round, hurt again: no door opens for your hull
  env.startRound(8);
  me.hull = 8;
  env.advance(1.5, 0.5);
  assert.equal(env.ofPlant('pl330').length, 1, 'no second door this run');
});

// ---- PL-331 The free forge ------------------------------------------------------------------------------------

test('PL-331: feed the Forge scrounged floor scrap and one upgrade runs free', () => {
  const env = makeEnv({ run: swarmRun({ seed: 61, wave: 6 }) });
  pilot(env, { x: 0, z: 0 });
  const furnace = furnaceSolid(env, 'survival-room-w6-foundry_furnace', { x: 50, z: 0 });
  assert.equal(forgeArmed(3, false), true);

  env.emit('swarm:dropCollected', { id: 90, dropId: 'magnet', name: 'Magnet', wave: 6 });
  env.emit('swarm:dropCollected', { id: 91, dropId: 'big_bang', name: 'Big Bang', wave: 6 });
  assert.equal(receiptsFor(env, PLANTS_FREE_FORGE_EVENT).filter((r) => r.kind === 'scrap_fed').length, 2);
  env.emit('swarm:dropCollected', { id: 92, dropId: 'repair', name: 'Repair', wave: 6 });
  assert.ok(receiptsFor(env, PLANTS_FREE_FORGE_EVENT).some((r) => r.kind === 'free_slot_earned'), 'the slot is earned');

  // the upgrade: your next accepted purchase is refunded in floor chips
  env.emit('run:purchaseResolved', { accepted: true, requestId: 9, reason: null, credits: 180, totalCredits: 0 });
  const free = receiptsFor(env, PLANTS_FREE_FORGE_EVENT).find((r) => r.kind === 'upgrade_free');
  assert.ok(free, 'one upgrade runs free');
  assert.equal(free.requestId, 9);
  assert.equal(free.refundedCredits, 180);
  const chips = env.spawned.filter((e) => e.data.plants && e.data.plants.pl331);
  assert.equal(chips.length, FREE_FORGE_TUNING.refundPickups);
  assert.equal(chips.reduce((sum, c) => sum + c.data.credits, 0), 180, 'the refund is exact');
  assert.ok(chips.every((c) => c.data.wallet === 'run' && c.data.kind === 'scrap'));
  assert.equal(refundSplit(180, 4).reduce((a, b) => a + b, 0), 180);
  assert.equal(ledgerVerdict({ armed: true, given: true }), 'spent');
});

test('PL-331: buy your way to it and the Forge knows its ledger — the free slot never arms', () => {
  const env = makeEnv({ run: swarmRun({ seed: 62, wave: 6 }) });
  pilot(env, { x: 0, z: 0 });
  furnaceSolid(env, 'survival-room-w6-foundry_furnace', { x: 50, z: 0 });

  // feed once, then buy: scrounged means scrounged
  env.emit('swarm:dropCollected', { id: 93, dropId: 'magnet', name: 'Magnet', wave: 6 });
  env.emit('run:purchaseResolved', { accepted: true, requestId: 10, reason: null, credits: 80, totalCredits: 0 });
  assert.ok(receiptsFor(env, PLANTS_FREE_FORGE_EVENT).some((r) => r.kind === 'ledger_refused'), 'the ledger refuses audibly');
  assert.equal(ledgerVerdict({ boughtFirst: true }), 'refused');

  // more feeding cannot re-arm a refused ledger
  env.emit('swarm:dropCollected', { id: 94, dropId: 'repair', name: 'Repair', wave: 6 });
  env.emit('swarm:dropCollected', { id: 95, dropId: 'magnet', name: 'Magnet', wave: 6 });
  assert.equal(receiptsFor(env, PLANTS_FREE_FORGE_EVENT).filter((r) => r.kind === 'free_slot_earned').length, 0);
  env.emit('run:purchaseResolved', { accepted: true, requestId: 11, reason: null, credits: 150, totalCredits: 0 });
  assert.equal(receiptsFor(env, PLANTS_FREE_FORGE_EVENT).filter((r) => r.kind === 'upgrade_free').length, 0, 'no free slot');
  assert.equal(env.spawned.filter((e) => e.data.plants && e.data.plants.pl331).length, 0);
});

test('PL-331 negatives: no furnace on the floor keeps the row inert; plain buying is not a refusal', () => {
  const env = makeEnv({ run: swarmRun({ seed: 63, wave: 2 }) }); // no furnace toy on this phase
  pilot(env, { x: 0, z: 0 });
  env.emit('swarm:dropCollected', { id: 96, dropId: 'magnet', name: 'Magnet', wave: 2 });
  assert.equal(receiptsFor(env, PLANTS_FREE_FORGE_EVENT).length, 0, 'no Forge, no feed');

  const shopper = makeEnv({ run: swarmRun({ seed: 64, wave: 6 }) });
  pilot(shopper, { x: 0, z: 0 });
  furnaceSolid(shopper, 'survival-room-w6-foundry_furnace', { x: 50, z: 0 });
  shopper.emit('run:purchaseResolved', { accepted: true, requestId: 1, reason: null, credits: 90, totalCredits: 0 });
  assert.equal(receiptsFor(shopper, PLANTS_FREE_FORGE_EVENT).length, 0, 'just shopping: no drama, no offer');
});

// ---- PL-332 The mascot ----------------------------------------------------------------------------------------

test('PL-332: a tiny numbered drone adopts your run and perches on your Tap; feed it a final blow', () => {
  const env = makeEnv({ run: swarmRun({ seed: 65, wave: 1 }) });
  const me = pilot(env, { x: 0, z: 0 });
  const number = mascotNumberFor(65);
  assert.ok(number >= 10 && number < 99);
  assert.equal(otherNumberFor(number), 10 + ((number - 10 + 37) % 89));

  env.startRound(1);
  const mascots = env.ofPlant('pl332');
  assert.equal(mascots.length, 1, 'it adopts the run');
  assert.equal(mascots[0].data.swarmFloorPad.label, `N.${number}`);

  // it perches on your wall gun
  tapDevice(env, 70, { x: 200, z: 0 });
  env.advance(1, 0.5);
  assert.ok(Math.abs(mascots[0].pos.x - 248) < 60, 'perched a wing off the Tap');

  // feed it a final blow: a kill inside the round's final beat
  env.emit('entity:killed', { id: 820, killerId: 7, type: 'ship', cause: 'kinetic', pos: { x: 0, z: 0 }, presentation: {} });
  env.emit('run:waveCleared', { wave: 1, completionKind: 'clear', durationTicks: 600 });
  const fed = receiptsFor(env, PLANTS_MASCOT_EVENT).find((r) => r.kind === 'fed');
  assert.ok(fed, 'fed');
  assert.equal(fed.number, number);
  const lap = lapOffsetAt(1.5);
  assert.ok(Math.hypot(lap.x, lap.z) > 0);
  assert.equal(mascotVerdict({ fed: true }), 'fed');
  assert.equal(me.alive, true);
});

test('PL-332: starve it of spectacle for two rounds and it flies across the floor to the other fighter', () => {
  const env = makeEnv({ run: swarmRun({ seed: 66, wave: 1 }) });
  const me = pilot(env, { x: 0, z: 0 });
  const number = mascotNumberFor(66);
  env.startRound(1);
  assert.equal(env.ofPlant('pl332').length, 1);

  env.emit('run:waveCleared', { wave: 1, completionKind: 'clear', durationTicks: 600 }); // no spectacle
  assert.equal(receiptsFor(env, PLANTS_MASCOT_EVENT).filter((r) => r.kind === 'flew_to_other_fighter').length, 0, 'one starved round is a warning');
  env.emit('run:waveCleared', { wave: 1, completionKind: 'clear', durationTicks: 600 }); // still nothing
  const left = receiptsFor(env, PLANTS_MASCOT_EVENT).find((r) => r.kind === 'flew_to_other_fighter');
  assert.ok(left, 'it leaves');
  assert.equal(left.number, number);
  assert.equal(left.otherNumber, otherNumberFor(number));
  const mascot = env.ofPlant('pl332')[0];
  assert.equal(mascot.data.swarmFloorPad.label, `GONE TO N.${otherNumberFor(number)}`);
  assert.equal(mascotVerdict({ starveRounds: 2 }), 'left');

  // it crosses the floor and is gone
  env.advance(4, 0.5);
  assert.equal(env.ofPlant('pl332').filter((e) => e.alive !== false).length, 0, 'over with the other fighter now');
  const lastStep = MASCOT_TUNING.leaveSpeedWuS * 0.5;
  assert.ok(Math.hypot(mascot.pos.x - me.pos.x, mascot.pos.z - me.pos.z) >= MASCOT_TUNING.leaveTravelWu - lastStep - 1, 'it really crossed');
});

test('PL-332 negatives: no run, one mascot per run', () => {
  const dead = makeEnv({ run: null });
  dead.startRound(1);
  assert.equal(dead.ofPlant('pl332').length, 0);

  const env = makeEnv({ run: swarmRun({ wave: 1 }) });
  pilot(env, {});
  env.startRound(1);
  env.startRound(2);
  assert.equal(env.ofPlant('pl332').length, 1, 'it does not re-adopt mid-run');
});

test('PL-332 regressions: the perch is found even late in the entity map; perch scans respect the throttle', () => {
  const env = makeEnv({ run: swarmRun({ seed: 68, wave: 1 }) });
  pilot(env, { x: 0, z: 0 });
  env.startRound(1);
  const mascot = env.ofPlant('pl332')[0];
  assert.ok(mascot, 'adopted');
  const plant = env.plants.find((p) => p.name === 'plants332');

  // A fortify piece beyond the old first-96-entries slice: the full-map scan still finds it.
  for (let i = 0; i < 110; i++) addEntity(env, `filler_${i}`, { pos: { x: 1000 + i, z: 0 } });
  tapDevice(env, 'late_tap', { x: 300, z: 0 });
  let scans = 0;
  const origScan = plant._scanForPerch.bind(plant);
  plant._scanForPerch = () => { scans += 1; return origScan(); };
  env.advance(1, 0.5);
  assert.ok(scans >= 1, 'the perch scan ran');
  assert.ok(Math.abs(mascot.pos.x - 348) < 60, 'perched a wing off the late Tap, not trailing the hull');

  // Throttle: updates inside the 0.5 s window run one scan; the cache serves the rest.
  scans = 0;
  const tickAt = (t, dt = 0.1) => { env.state.simTime = t; env.state.tick = Math.round(t * 60); plant.update(dt); };
  tickAt(1.6); // past the last window (last scan at 1.0): exactly one rescan
  tickAt(1.7); // inside the fresh window: cached
  tickAt(1.8); // still cached
  assert.equal(scans, 1, 'two-plus updates within 0.5 s -> one scan');
  tickAt(2.7); // window expired: the scan resumes
  assert.equal(scans, 2, 'the scan resumes on the throttle');
});

// ---- cross-run reset -------------------------------------------------------------------------------------------

test('cross-run reset: a fresh run clears every mercy ledger', () => {
  const env = makeEnv({ run: swarmRun({ seed: 67, wave: 2 }) });
  const me = pilot(env, { x: 0, z: 0 });
  gateSolid(env, 'survival-room-w2-foundry_gate_a', { x: 300, z: 0 });

  // spend the run's mercies
  env.endRound(2, 'cleanup');
  env.emit('combat:crushed', { entityId: 7, toyId: 1 }); // medic mule offended
  env.startRound(3);
  env.endRound(3, 'cleanup');
  env.startRound(4);
  for (let i = 0; i < 5; i++) env.emit('run:ended', { outcome: 'defeat', reason: 'wiped', tick: i });
  env.startRound(1);
  me.hull = 20;
  env.advance(0.6, 0.25);
  const pads = env.ofPlant('pl325');
  assert.equal(pads.length, 1, 'mercy pad spent on this run');

  // the next run starts clean: the mule will come again, and feeds/cheers reset
  env.emit('run:ended', { outcome: 'aborted', reason: 'player_retired', tick: 1 });
  env.helpers.removeEntity(pads[0].id); // the pipeline despawned the scooped pad
  env.state.run = swarmRun({ seed: 999, wave: 4 });
  pilot(env, { x: 0, z: 0, hull: 15, hullMax: 100 });
  env.endRound(4, 'cleanup');
  assert.equal(env.ofPlant('pl323').length, 1, 'a new run, a new mule');
  assert.equal(env.ofPlant('pl325').filter((e) => e.data.plants.pl325.role === 'mercy_pad' && e.alive !== false).length, 0, 'the mercy is spent until a win');
});

// ---- determinism smoke: identical double-run --------------------------------------------------------------------

test('determinism: the same scripted mercy session produces byte-identical receipts', () => {
  const sorta = (v) => {
    if (Array.isArray(v)) return v.map(sorta);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorta(v[k])]));
    }
    return v;
  };
  const scenario = () => {
    const env = makeEnv({ run: swarmRun({ seed: 777, wave: 4, credits: 40 }) });
    const me = pilot(env, { x: 0, z: 0, hull: 100, hullMax: 100 });
    const gate = gateSolid(env, 'survival-room-w4-foundry_gate_a', { x: 300, z: 0 });
    furnaceSolid(env, 'survival-room-w4-foundry_furnace', { x: 50, z: 0 });
    env.emit('run:waveStarted', { wave: 4, tick: 240 });
    env.emit('run:awarded', { credits: 30, score: 5, wave: 4 });
    env.emit('entity:killed', {
      id: 830, killerId: 7, type: 'ship', cause: 'ship_collision', impactorId: 5,
      pos: { x: 30, z: 0 }, presentation: {},
    });
    env.emit('combat:fire', { ownerId: 12, origin: { x: 900, z: 0 } }); // not yours: no taunt
    env.endRound(4, 'cleanup');
    // the mule walks while the veteran points
    env.advance(1.5, 0.5);
    me.hull = 12; // outgunned: the surrender door opens
    env.advance(1, 0.5);
    const feeds = ['magnet', 'big_bang', 'repair'];
    feeds.forEach((dropId, i) => env.emit('swarm:dropCollected', { id: 900 + i, dropId, name: dropId, wave: 4 }));
    env.emit('run:purchaseResolved', { accepted: true, requestId: 3, reason: null, credits: 90, totalCredits: 0 });
    // back inside the round
    env.state.run.phase = 'active';
    env.state.simTime = 10;
    env.state.tick = 600;
    me.hull = 12;
    env.startRound(5); // boss round: the door window (wave 4's window was cleanup) is spent
    tapDevice(env, 71, { x: 100, z: 0 });
    addEntity(env, 80, { type: 'ship', pos: { x: 100, z: 10 } });
    env.advance(2.5, 0.5);
    env.emit('run:waveCleared', { wave: 5, completionKind: 'clear', durationTicks: 600 });
    const lines = env.voice.map((v) => `${v.id}|${v.text}`);
    const receipts = [];
    for (const [name, rows] of env.receipts) for (const r of rows) receipts.push(`${name}|${JSON.stringify(sorta(r))}`);
    const cues = env.cues.map((c) => `${c.id}|${c.gain}|${c.rate}`);
    const spawnedShapes = env.spawned.map((e) => `${e.type}|${e.data.swarmFloorPad ? e.data.swarmFloorPad.label : ''}`);
    void gate;
    return { lines, receipts, cues, spawnedShapes };
  };
  const a = scenario();
  const b = scenario();
  assert.deepEqual(a, b, 'two identical runs, identical receipts');
});
