import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing, pushLaneCommand } from '../scripts/lib/simCommandChannel.mjs';
import { practiceContractForLevel, racingOfferFor, racingSeedFor, startLineFor } from '../src/data/raceLevels.js';
import { CONTRACT_47A_B0_TAG } from '../src/systems/missionShared.js';
import { isRacingCorridorSession } from '../src/world/racingCorridor.js';

const scenarioContract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url)));
const contractId = practiceContractForLevel('level_textile_outbound').id;
const campaignSeed = 4242;
const coldStart = state => state.missions.active.find(mission => mission.storyTag === CONTRACT_47A_B0_TAG);
const campaignCast = state => state.entityList.filter(entity => entity.alive !== false
  && entity.id !== state.playerId && entity.data?.scenarioActorId);
const courseTraffic = state => state.entityList.filter(entity => entity.alive !== false
  && entity.id !== state.playerId && entity.type === 'ship' && entity.collides
  && !entity.data?.raceOpponent && !entity.data?.raceSetPiece);

test('Textile keeps Adventure story and traffic off its course until campaign restore', async () => {
  const sim = createSimHost();
  try {
    const init = await sim.init({ profile: 'production', seed: campaignSeed, scenarioContract });
    const { bus, state, registry } = sim.host;
    const save = registry.get('save');
    let tick = 0;
    let ackEnd = init.initRebuild?.end ?? 0;
    const send = async (ring = createSimCommandRing(), steps = 0) => {
      const reply = await sim.tick({ tick: ++tick, steps, ackEnd, commands: ring.drain() });
      ackEnd = reply.journalEnd;
      return reply;
    };
    const rpc = async (op, args) => {
      const ring = createSimCommandRing();
      ring.pushRpc(op, op, args);
      const reply = await send(ring);
      const ack = reply.rpcAcks.find(row => row.id === op);
      assert.equal(ack?.ok, true, ack?.reason);
      assert.equal(ack.result?.ok, true, ack.result?.reason);
      return ack.result;
    };
    const boot = async opts => {
      await rpc('newGameBoot', { opts });
      const ring = createSimCommandRing();
      pushLaneCommand(ring, { kind: 'mode', mode: 'flight' });
      await send(ring);
    };
    const actReceipts = [];
    bus.on('comms:popup', row => { if (row.id === 'act:I') actReceipts.push(row); });

    await boot({ seed: campaignSeed });
    assert.ok(coldStart(state), 'the ordinary opening installs 47-A');
    assert.ok(campaignCast(state).length > 0, 'the ordinary opening spawns its scenario cast');
    assert.ok(courseTraffic(state).length > 0, 'Adventure retains its normal local traffic');
    assert.ok(actReceipts.length > 0, 'the ordinary opening announces Act I');
    const campaign = save.serialize('quick');
    actReceipts.length = 0;

    await boot({ seed: racingSeedFor(contractId), racingSession: true });
    assert.equal(isRacingCorridorSession(state), true);
    const offer = racingOfferFor(contractId);
    const grid = await rpc('racingArm', {
      offer, sectorId: offer.params.courseSectorId, start: startLineFor(offer.params),
      relocate: true, allowEnterSector: true,
    });
    assert.ok(state.missions.active.some(mission => mission.id === grid.missionId && mission.type === 'race'));
    assert.deepEqual(actReceipts, []);
    assert.equal(coldStart(state), undefined);
    assert.deepEqual(campaignCast(state), []);
    assert.deepEqual(courseTraffic(state), [], 'the race starts with only course-owned ships');
    for (let batch = 0; batch < 6; batch++) await send(undefined, 12);
    assert.deepEqual(courseTraffic(state), [], 'campaign owners stay dormant as the grid runs');

    let corridorAtRestoreEntry = null;
    const stopWatching = bus.on('sector:enter', () => { corridorAtRestoreEntry = isRacingCorridorSession(state); });
    try {
      assert.equal(await save.loadEnvelope(campaign, 'quick'), true);
    } finally {
      stopWatching();
    }
    assert.equal(corridorAtRestoreEntry, false, 'the campaign sector materializes under ordinary world rules');
    assert.equal(isRacingCorridorSession(state), false);
    assert.ok(coldStart(state), 'the campaign contract is restored');
    assert.ok(courseTraffic(state).length > 0, 'Continue restores campaign traffic');
    assert.equal(state.story.journeyActs.current, 'I');
    assert.equal(state.missions.active.some(mission => mission.type === 'race'), false);
  } finally {
    sim.shutdown();
  }
});
