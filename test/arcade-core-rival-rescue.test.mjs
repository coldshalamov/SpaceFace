import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RECURRING_RIVAL,
  recurringRivalRescueReady,
} from '../src/data/namedAces.js';
import { CERES_SHIFT_RING } from '../src/data/timeTrialCourses.js';
import { SIM_DT } from '../src/core/sim.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';

const SEED = 0x52a12;
const RESCUE_SECTOR_ID = 'sector_tethys_junction';

test('after a head-to-head result, Kei occasionally answers the real physical player-pod rescue', async (t) => {
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: SEED });
  t.after(() => runtime.dispose());
  const { state, bus } = runtime;
  const voices = [];
  const dispatches = [];
  const podRescues = [];
  const saves = [];
  const respawns = [];
  runtime.getSystem('aceMemory').helpers.voice = {
    say: (payload) => voices.push(structuredClone(payload)),
  };
  bus.on('traffic:playerRescueDispatched', (payload) => dispatches.push(structuredClone(payload)));
  bus.on('playerDefeat:podRescued', (payload) => podRescues.push(structuredClone(payload)));
  bus.on('recurringRival:savedPlayer', (payload) => saves.push(structuredClone(payload)));
  bus.on('player:respawn', (payload) => respawns.push(structuredClone(payload)));

  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.input.actions = {};
  runtime.getSystem('ships').newGame();
  const player = runtime.spawn(makeShipEntitySpec('ship_kestrel', {
    isPlayer: true,
    team: 0,
    factionId: 'faction_free',
    pos: { x: 0, z: 0 },
  }));
  player.flags = { ...(player.flags || {}), persistent: true };
  state.playerId = player.id;
  assert.equal(await runtime.getSystem('physics').prepareBackend(state, { reset: true }), true);
  runtime.runTicks(2, SIM_DT);
  runtime.getSystem('world').enterSector(CERES_SHIFT_RING.sectorId, { placePlayer: true });

  // Completing one real course introduces Kei; resolving the next shared run creates the bounded
  // head-to-head history required for one occasional save.
  bus.emit('timeTrial:completed', {
    courseId: CERES_SHIFT_RING.id,
    playerId: state.playerId,
    elapsedTicks: CERES_SHIFT_RING.medals.silverTicks,
    medal: 'silver',
  });
  assert.equal(recurringRivalRescueReady(state, 'not-yet'), false);
  bus.emit('timeTrial:started', {
    courseId: CERES_SHIFT_RING.id,
    playerId: state.playerId,
    startedTick: state.tick,
  });
  bus.emit('timeTrial:completed', {
    courseId: CERES_SHIFT_RING.id,
    playerId: state.playerId,
    elapsedTicks: CERES_SHIFT_RING.medals.goldTicks,
    medal: 'gold',
  });
  assert.equal(state.aceMemory.rival.playerWins, 1);
  assert.equal(recurringRivalRescueReady(state, 'future-loss'), true);

  // Leave the course through World so race-owned Kei retires before the distinct rescue recurrence.
  runtime.getSystem('world').enterSector(RESCUE_SECTOR_ID, { placePlayer: true });
  state.factions.faction_mts = { ...(state.factions.faction_mts || {}), rep: 125 };
  const killer = runtime.spawn(makeShipEntitySpec('ship_jackal', {
    team: 1,
    factionId: 'faction_reach',
    pos: { x: player.pos.x + 40, z: player.pos.z },
  }));
  runtime.getSystem('combat').kill(player, killer.id, {
    context: 'weapon',
    weaponId: 'wpn_railgun_m',
    dominantLayer: 'hull',
  });
  const receipt = state.player.activePhysicalDefeatReceipt;
  assert.ok(receipt && receipt.loss && receipt.loss.phase === 'pod_drift');
  const lossId = receipt.loss.lossId;
  assert.equal(state.entities.get(state.playerId).type, 'payload', 'the player occupies the real drifting pod');

  bus.emit('player:rescueRequested', { mode: 'wait', source: 'after_action' });
  assert.equal(state.player.activePhysicalDefeatReceipt.loss.phase, 'rescue_wait');
  let responder = null;
  let startDistance = null;
  let minimumDistance = Infinity;
  for (let tick = 0; tick < 65 * 60 && respawns.length === 0; tick += 1) {
    runtime.step(SIM_DT);
    if (!responder && dispatches.length) {
      responder = state.entities.get(dispatches[0].responderId);
      const pod = state.entities.get(state.playerId);
      startDistance = responder && pod
        ? Math.hypot(responder.pos.x - pod.pos.x, responder.pos.z - pod.pos.z)
        : null;
    }
    const pod = state.entities.get(state.playerId);
    if (responder && pod && pod.type === 'payload') {
      minimumDistance = Math.min(minimumDistance, Math.hypot(
        responder.pos.x - pod.pos.x,
        responder.pos.z - pod.pos.z,
      ));
    }
  }

  assert.equal(dispatches.length, 1);
  assert.equal(dispatches[0].recurringRival, true);
  assert.equal(dispatches[0].rivalId, RECURRING_RIVAL.id);
  assert.ok(responder && responder.alive !== false);
  assert.equal(responder.type, 'ship');
  assert.equal(responder.data.defId, RECURRING_RIVAL.shipDefId);
  assert.equal(responder.data.namedRivalId, RECURRING_RIVAL.id);
  assert.equal(responder.data.rivalAppearance, 'rescue');
  assert.equal(responder.data.rivalTrafficOwned, true);
  assert.equal(responder.data.trafficRole, 'rescue');
  assert.equal(responder.data.ai.passive, true);
  assert.ok(startDistance > 300, `Kei begins as a physical approach, got ${startDistance}`);
  assert.ok(minimumDistance < startDistance - 150,
    `Traffic intent plus Flight V3/Rapier closes on the pod (${startDistance} -> ${minimumDistance})`);
  assert.equal(respawns.length, 1, 'ordinary pod interception completes the rescue');
  assert.equal(podRescues.length, 1);
  assert.equal(podRescues[0].rescueHullId, responder.id);
  assert.equal(state.entities.get(state.playerId).type, 'ship');

  const memory = state.aceMemory.rival;
  assert.equal(memory.savesCount, 1);
  assert.equal(memory.lastAppearance, 'rescue');
  assert.equal(memory.lastSaveLossId, lossId);
  assert.deepEqual(memory.recentSaveLossIds, [lossId]);
  assert.equal(saves.length, 1);
  assert.equal(saves[0].entityId, responder.id);
  assert.ok(voices.some((payload) => payload.text === RECURRING_RIVAL.barks.rescue));
  assert.equal(recurringRivalRescueReady(state, 'another-loss'), false,
    'one result funds one save; another two head-to-head results re-arm the cadence');
  assert.equal(runtime.getSystem('aceMemory')._rivalEntity(), null,
    'traffic keeps movement ownership of the rescue ship; race ownership never adopts it');

  // Replaying the dispatch cannot count the same save twice, and Continue retains only bounded
  // self-memory rather than mirroring the defeat, wallet, cargo, or insurance record.
  bus.emit('playerDefeat:podRescued', { ...podRescues[0] });
  assert.equal(state.aceMemory.rival.savesCount, 1);
  const saved = JSON.parse(JSON.stringify(runtime.getSystem('aceMemory').serialize()));
  assert.ok(saved.rival.recentSaveLossIds.length <= 8);
  assert.deepEqual(
    Object.keys(saved.rival).filter((key) => /credit|cargo|insurance|shipdef|killer|deed/i.test(key)),
    [],
  );

  const continued = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: SEED });
  try {
    continued.getSystem('aceMemory').deserialize(saved);
    const restored = continued.state.aceMemory.rival;
    assert.equal(restored.savesCount, 1);
    assert.equal(restored.lastSaveLossId, lossId);
    assert.deepEqual(restored.recentSaveLossIds, [lossId]);
    assert.equal(recurringRivalRescueReady(continued.state, lossId), false);
  } finally {
    continued.dispose();
  }
});
