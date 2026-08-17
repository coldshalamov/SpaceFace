import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONTACT_HAIL_ACTION_RIVAL_SALVAGE_OUTBID,
  CONTACT_HAIL_ACTION_RIVAL_SALVAGE_RACE,
} from '../src/data/contactHail.js';
import {
  RECURRING_RIVAL,
  recurringRivalSalvageReady,
} from '../src/data/namedAces.js';
import { CERES_SHIFT_RING } from '../src/data/timeTrialCourses.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { SIM_DT } from '../src/core/sim.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';

const HELIOS = 'sector_helios_prime';
const TETHYS = 'sector_tethys_junction';

test('Kei races the player to real battle salvage and remembers the physical first cut through Continue', async (t) => {
  const route = await bootRoute(t, 0x52a13);
  const { runtime, state, bus, player, voices } = route;
  primeRivalHistory(route);

  const { rival, wreck, targetKey, startDistance } = dispatchAftermathRace(route);
  const offers = [];
  const responses = [];
  const resolutions = [];
  bus.on('contactHail:offer', (payload) => offers.push(structuredClone(payload)));
  bus.on('contactHail:response', (payload) => responses.push(structuredClone(payload)));
  bus.on('recurringRival:salvageRaceResolved', (payload) => resolutions.push(structuredClone(payload)));

  state.player.targetId = rival.id;
  bus.emit('contactHail:request', { targetId: rival.id, source: 'test' });
  const offer = offers.at(-1);
  assert.ok(offer);
  assert.deepEqual(offer.actions.map((action) => action.id), [
    'status',
    CONTACT_HAIL_ACTION_RIVAL_SALVAGE_RACE,
    CONTACT_HAIL_ACTION_RIVAL_SALVAGE_OUTBID,
  ]);
  bus.emit('contactHail:choice', {
    requestId: offer.requestId,
    targetId: rival.id,
    choice: CONTACT_HAIL_ACTION_RIVAL_SALVAGE_RACE,
  });
  assert.equal(responses.at(-1).rivalSalvageBid.decision, 'race');
  assert.equal(responses.at(-1).rivalSalvageBid.accepted, true);
  assert.equal(rival.data.rivalSalvageRace.status, 'racing');

  let minimumDistance = startDistance;
  for (let tick = 0; tick < 20 * 60 && minimumDistance > startDistance - 150; tick += 1) {
    runtime.step(SIM_DT);
    minimumDistance = Math.min(
      minimumDistance,
      Math.hypot(rival.pos.x - wreck.pos.x, rival.pos.z - wreck.pos.z),
    );
  }
  assert.ok(minimumDistance < startDistance - 150,
    `NPC-job intent plus Flight V3/Rapier must close: ${JSON.stringify({
      startDistance,
      minimumDistance,
      rivalPos: rival.pos,
      wreckPos: wreck.pos,
      intent: rival.data.intent,
      job: state.npcJobs.byId[rival.data.jobId]?.job,
    })}`);

  player.pos.x = wreck.pos.x - 80;
  player.pos.z = wreck.pos.z;
  runtime.getSystem('mining')._drainWreck(player, wreck, 18, 8);
  assert.equal(wreck.alive, false);
  assert.equal(resolutions.length, 1);
  assert.equal(resolutions[0].winner, 'player');
  assert.equal(resolutions[0].method, 'salvage');
  assert.equal(resolutions[0].physical, true);
  assert.equal(state.aceMemory.rival.salvagePlayerWins, 1);
  assert.equal(state.aceMemory.rival.salvageBidsRaced, 1);
  assert.equal(state.aceMemory.rival.activeSalvageRace, null);
  assert.ok(voices.some((voice) => voice.text === RECURRING_RIVAL.barks.salvageChallenge));
  assert.ok(voices.some((voice) => voice.text === RECURRING_RIVAL.barks.salvagePlayerWon));

  const saveOwner = runtime.getSystem('save');
  const envelope = saveOwner.serialize('plan52-rival-salvage');
  assert.equal(saveOwner.loadEnvelope(
    JSON.parse(JSON.stringify(envelope)),
    'plan52-rival-salvage',
  ), true);
  const continued = state.aceMemory.rival;
  assert.equal(continued.salvagePlayerWins, 1);
  assert.equal(continued.lastSalvageRace.targetKey, targetKey);
  assert.equal(continued.lastSalvageRace.winner, 'player');
  assert.equal(continued.activeSalvageRace, null);
  assert.ok(continued.recentSalvageTargetKeys.length <= 8);
  assert.deepEqual(
    Object.keys(continued).filter((key) => /credit|cargo|inventory|insurance|mission|deed/i.test(key)),
    [],
  );
});

test('the same live hail can outbid Kei through Economy without minting a second salvage ledger', async (t) => {
  const route = await bootRoute(t, 0x52a14);
  const { state, bus } = route;
  primeRivalHistory(route);
  const { rival, wreck, targetKey } = dispatchAftermathRace(route);
  const offers = [];
  const responses = [];
  const decisions = [];
  bus.on('contactHail:offer', (payload) => offers.push(structuredClone(payload)));
  bus.on('contactHail:response', (payload) => responses.push(structuredClone(payload)));
  bus.on('recurringRival:salvageBidDecision', (payload) => decisions.push(structuredClone(payload)));

  state.player.credits = 2_000;
  state.player.targetId = rival.id;
  bus.emit('contactHail:request', { targetId: rival.id, source: 'test' });
  const offer = offers.at(-1);
  bus.emit('contactHail:choice', {
    requestId: offer.requestId,
    targetId: rival.id,
    choice: CONTACT_HAIL_ACTION_RIVAL_SALVAGE_OUTBID,
  });

  assert.equal(responses.at(-1).rivalSalvageBid.accepted, true);
  assert.equal(decisions.at(-1).decision, 'outbid');
  assert.equal(decisions.at(-1).accepted, true);
  assert.equal(state.player.credits, 2_000 - RECURRING_RIVAL.salvageBidCr);
  assert.equal(rival.data.jobId, undefined, 'Traffic releases only its movement job after selling the claim');
  assert.equal(rival.data.rivalSalvageRace.status, 'outbid');
  assert.equal(rival.alive, true, 'the physical peer remains in the pocket as skippable garnish');
  assert.equal(wreck.data.salvorClaimedBy, `player-rival-outbid:${targetKey}`);
  assert.equal(state.aceMemory.rival.salvageBidsOutbid, 1);
  assert.equal(state.aceMemory.rival.lastSalvageRace.method, 'outbid');
  assert.equal(state.aceMemory.rival.lastSalvageRace.winner, 'player');

  route.runtime.getSystem('traffic').update(0.25, state);
  const competingJobs = (state.traffic.freighters || [])
    .map((record) => state.entities.get(record.id))
    .filter((entity) => entity && entity.alive !== false && entity.data && entity.data.jobId
      && state.npcJobs.byId[entity.data.jobId]?.job?.payload?.targetId === wreck.id);
  assert.equal(competingJobs.length, 0, 'the paid existing claim prevents an ordinary NPC re-dispatch');
  assert.equal(wreck.alive, true);
  assert.deepEqual(
    Object.keys(state.aceMemory.rival).filter((key) => /wallet|cargo|stock|market/i.test(key)),
    [],
  );
});

async function bootRoute(t, seed) {
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed });
  t.after(() => runtime.dispose());
  const { state, bus } = runtime;
  const voices = [];
  runtime.getSystem('aceMemory').helpers.voice = {
    say: (payload) => voices.push(structuredClone(payload)),
  };
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
  return { runtime, state, bus, player, voices };
}

function primeRivalHistory({ runtime, state, bus }) {
  runtime.getSystem('world').enterSector(CERES_SHIFT_RING.sectorId, { placePlayer: true });
  bus.emit('timeTrial:completed', {
    courseId: CERES_SHIFT_RING.id,
    playerId: state.playerId,
    elapsedTicks: CERES_SHIFT_RING.medals.silverTicks,
    medal: 'silver',
  });
  for (let index = 0; index < 2; index += 1) {
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
    if (index === 0) {
      runtime.getSystem('world').enterSector(TETHYS, { placePlayer: true });
      runtime.getSystem('world').enterSector(CERES_SHIFT_RING.sectorId, { placePlayer: true });
    }
  }
  assert.equal(state.aceMemory.rival.playerWins, 2);
  runtime.getSystem('world').enterSector(HELIOS, { placePlayer: true });
  assert.equal(state.world.currentSectorId, HELIOS);
}

function dispatchAftermathRace({ runtime, state }) {
  const zone = zonesForSector(HELIOS).find((candidate) => candidate && candidate.center);
  const killPos = sectorLocalToGlobalForSector(zone.center, HELIOS);
  const victim = runtime.spawn(makeShipEntitySpec('ship_jackal', {
    team: 1,
    factionId: 'faction_reach',
    pos: killPos,
  }));
  runtime.getSystem('combat').kill(victim, state.playerId, {
    context: 'weapon',
    weaponId: 'wpn_railgun_m',
    dominantLayer: 'hull',
  });
  const wreck = (state.entityList || []).find((entity) => entity && entity.alive !== false
    && entity.type === 'wreck' && entity.data && entity.data.markerId
    && Object.values(entity.data.salvagePool || {}).some((qty) => Number(qty) > 0));
  assert.ok(wreck, 'Combat plus Aftermath materialize one stable physical salvage hulk');
  const targetKey = `wreck-marker:${wreck.data.markerId}`;
  assert.equal(recurringRivalSalvageReady(state, targetKey), true);
  // Advance past Traffic's bounded four-tick target cache, then open the ordinary notice window.
  runtime.runTicks(5, SIM_DT);
  wreck.data.salvorNoticeAt = state.simTime;
  runtime.getSystem('traffic').update(0.25, state);
  const rival = (state.entityList || []).find((entity) => entity && entity.alive !== false
    && entity.data && entity.data.rivalTrafficOwned === true
    && entity.data.rivalAppearance === 'salvage');
  assert.ok(rival, 'eligible bounded history replaces one ordinary cutter with Kei');
  assert.equal(rival.data.defId, RECURRING_RIVAL.shipDefId);
  assert.equal(rival.data.trafficRole, 'salvor');
  assert.equal(rival.data.ai.passive, true);
  assert.equal(rival.data.rivalSalvageRace.targetKey, targetKey);
  const job = state.npcJobs.byId[rival.data.jobId]?.job;
  assert.ok(job);
  assert.equal(job.kind, 'salvor');
  assert.equal(job.speed, 170);
  assert.equal(job.payload.targetId, wreck.id);
  assert.equal(wreck.data.salvorClaimedBy, rival.data.worldRecordId);
  return {
    rival,
    wreck,
    targetKey,
    startDistance: Math.hypot(rival.pos.x - wreck.pos.x, rival.pos.z - wreck.pos.z),
  };
}
