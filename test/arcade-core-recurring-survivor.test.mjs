// Plan 52 recurring Survivor acceptance: causal rescue -> Continue -> same physical return.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { survivorCastForMemoryId } from '../src/data/survivorCast.js';
import { economy } from '../src/systems/economy.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { ensureMoralMemory, rememberMoralDebt } from '../src/systems/moralMemory.js';
import {
  isCausalSurvivorPod,
  shouldEjectCausalSurvivorPod,
  survivorPod,
} from '../src/systems/survivorPod.js';

function rescueCausalPod() {
  const bus = createBus();
  const state = {
    mode: 'flight',
    tick: 120,
    simTime: 42,
    playerId: 1,
    meta: { seed: 0x520052 },
    nextEntityId: 500,
    entities: new Map(),
    entityList: [],
    world: { currentSectorId: 'sector_tethys_junction' },
    player: { tether: { active: false, targetId: null } },
    story: { flags: {} },
    ui: {},
  };
  const add = (entity) => {
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
    return entity;
  };
  const player = add({
    id: 1, type: 'ship', team: 0, alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 12, mass: 100, hull: 200, hullMax: 200,
    data: {}, flags: {},
  });
  add({
    id: 900, type: 'station', alive: true, factionId: 'faction_scn',
    pos: { x: 0, z: 0 }, radius: 80,
    data: { stationId: 'station_plan52_concord', factionId: 'faction_scn' }, flags: {},
  });

  survivorPod.init({ state, bus, helpers: {}, registry: null });
  // This unrelated memory deliberately precedes the rescue. The Survivor return must neither
  // consume it nor surface its name or cumulative memory in the authored branch.
  rememberMoralDebt(state, {
    id: 'ace_other_mercy', name: 'Yara No-Cut', cause: 'spared_escape',
    factionId: 'faction_reach', t: 30,
  });
  let victim = null;
  for (let index = 0; index < 64 && !victim; index += 1) {
    const candidate = {
      id: 88 + index, type: 'ship', team: 2, factionId: 'faction_mts', alive: true,
      pos: { x: 24, z: 8 }, vel: { x: 2, z: -1 }, radius: 14,
      mass: 160, hull: 0, hullMax: 100,
      data: { worldRecordId: `wr_plan52_rescue_${index}`, trafficRole: 'hauler' }, flags: {},
    };
    if (shouldEjectCausalSurvivorPod(state, candidate)) victim = add(candidate);
  }
  assert.ok(victim, 'the deterministic causal route must admit a crewed-hull identity');
  victim.alive = false;
  bus.emit('entity:killed', {
    id: victim.id,
    killerId: player.id,
    type: victim.type,
    pos: { ...victim.pos },
    vel: { ...victim.vel },
    factionId: victim.factionId,
    data: victim.data,
  });
  const pod = state.entityList.find(isCausalSurvivorPod);
  assert.ok(pod, 'the existing entity:killed -> SurvivorPod route must create the physical causal pod');
  pod.pos.x = 8;
  pod.pos.z = 4;
  state.player.tether = { active: true, targetId: pod.id };
  bus.emit('tether:latched', { targetId: pod.id, ownerId: player.id });
  survivorPod.update(1 / 60, state);

  const memory = ensureMoralMemory(state);
  const rescued = Object.values(memory.debts).find((debt) => debt.cause === 'rescued_survivors');
  assert.ok(rescued, 'lawful pod handoff must become the existing durable moral-memory record');
  assert.equal(memory.debts.ace_other_mercy.status, 'pending');
  survivorPod.destroy();
  return {
    savedStory: JSON.parse(JSON.stringify(state.story)),
    rescuedMemoryId: rescued.id,
  };
}

function continueIntoReturn(savedStory) {
  const sim = createSimulation({ seed: 0x520052, systems: [economy, encounterDirector] });
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 100, hullMax: 100,
    data: { intent: {}, ai: {}, defId: 'ship_kestrel' },
  });
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = 'sector_io_reach';
  sim.state.story = JSON.parse(JSON.stringify(savedStory));
  const director = sim.registry.get('encounterDirector');
  return { sim, state: sim.state, bus: sim.bus, director };
}

test('rescued causal pod returns after Continue as the same named friendly and gifts once', () => {
  const rescued = rescueCausalPod();
  const castBefore = survivorCastForMemoryId(rescued.rescuedMemoryId);
  const continued = continueIntoReturn(rescued.savedStory);
  const castAfter = survivorCastForMemoryId(rescued.rescuedMemoryId);
  assert.deepEqual(castAfter, castBefore, 'the durable pod-memory id must derive the same cast identity after Continue');

  const voices = [];
  const gifts = [];
  const creditIntents = [];
  const receipts = [];
  continued.bus.on('encounter:voice', (payload) => voices.push({ ...payload }));
  continued.bus.on('survivor:returnGift', (payload) => gifts.push({ ...payload }));
  continued.bus.on('economy:grantCredits', (payload) => creditIntents.push({ ...payload }));
  continued.bus.on('encounter:receipt', (payload) => receipts.push({ ...payload }));

  const encounterId = 'accept:plan52:named-survivor';
  const result = continued.director.requestAuthoredEncounter({
    shapeId: 'depth_h7_spared_return',
    encounterId,
    sectorId: 'sector_io_reach',
    anchor: { x: 0, z: 0 },
  });
  assert.deepEqual(result, { ok: true, encounterId });
  const live = continued.state.encounterDirector.live[encounterId];
  assert.equal(live.vars.debt.id, rescued.rescuedMemoryId,
    'the rescued Survivor is selected without consuming the unrelated earlier memory');
  assert.equal(live.vars.survivor.id, castAfter.id);
  assert.equal(live.ids.length, 1, 'the return is one physical friendly ship, not a text-only receipt');
  const returnedShip = continued.state.entities.get(live.ids[0]);
  assert.equal(returnedShip.type, 'ship');
  assert.equal(returnedShip.team, 0);
  assert.equal(returnedShip.data.ai.passive, true);
  assert.equal(returnedShip.data.callsign, castAfter.name);
  assert.equal(returnedShip.data.recurringCastId, castAfter.id);
  assert.equal(returnedShip.data.survivorMemoryId, rescued.rescuedMemoryId);
  assert.ok(voices.some((row) => row.text.includes(castAfter.name)));
  assert.ok(voices.every((row) => !row.text.includes('Yara No-Cut')),
    'the branch may remember this survivor only, never another moral-memory person');

  const creditsBefore = continued.state.player.credits;
  continued.bus.emit('encounter:choose', { encounterId, choiceId: 'accept' });
  // Duplicate input after resolution is a no-op: the economy owner sees exactly one gift intent.
  continued.bus.emit('encounter:choose', { encounterId, choiceId: 'accept' });

  const memory = ensureMoralMemory(continued.state);
  assert.equal(memory.debts[rescued.rescuedMemoryId].status, 'revealed');
  assert.equal(memory.debts.ace_other_mercy.status, 'pending');
  assert.equal(gifts.length, 1);
  assert.equal(gifts[0].survivorId, castAfter.id);
  assert.equal(gifts[0].memoryId, rescued.rescuedMemoryId);
  assert.equal(creditIntents.length, 1);
  assert.equal(creditIntents[0].reason, `survivor_return:${rescued.rescuedMemoryId}`);
  assert.equal(continued.state.player.credits - creditsBefore, castAfter.giftCredits,
    'economy remains the sole credits writer for the physical gift');
  assert.equal(receipts.at(-1)?.outcome, 'survivor_gifted');
  assert.equal(receipts.at(-1)?.text, 'SURVIVOR RETURNED — berth fund transferred, clean.');
  assert.ok([...voices, ...receipts].every((row) => !String(row.text || '').includes('Yara No-Cut')));
});
