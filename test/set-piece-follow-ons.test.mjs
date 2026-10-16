// Every authored set piece ends in a consequence. Before this file, only the convoy, the heist and
// the door-jam ever led anywhere (3 of 11); the ace, the reef, the crusher, the impound cradle, the
// pod rescue, both tows and the wrecking ball paid out and the world carried on as if nothing
// happened. Each now posts one distinct follow-on contract at the station the player just worked.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { AUTHORED_SET_PIECES, MISSION_TYPES } from '../src/data/missions.js';
import {
  SET_PIECE_FOLLOW_ON_SOURCE,
  setPieceFollowOnBody,
  setPieceFollowOnOffer,
} from '../src/data/sandboxSetPieceFollowOns.js';
import { TETHYS_BLACK_MARKET_DISCOVERY, TETHYS_BLACK_MARKET_RUN } from '../src/data/frontierRumors.js';
import { missions } from '../src/systems/missions.js';

const PIECE_IDS = AUTHORED_SET_PIECES.map((row) => row.id);
const MISSION_TYPE_IDS = new Set(MISSION_TYPES.map((row) => row.type));
const ORIGINAL_THREE = Object.freeze({
  convoy_defence: Object.freeze({ type: 'salvage_retrieval', title: 'Recover the stripped pods', reward_cr: 980 }),
  loud_heist: Object.freeze({ type: 'smuggling_run', title: 'Run the take to the den', reward_cr: 1400 }),
  station_door_jam: Object.freeze({ type: 'tow_recovery', title: 'Tow the dead frigate clear', reward_cr: 1200 }),
});
// The eight near-station pieces plus the six far-out jobs (Sker, Io Reach, the Mercenary Outpost,
// the Expanse, Drift Market, Ash Cache) that 28d579f93dd added without a consequence of their own.
const NEW_FOURTEEN = PIECE_IDS.filter((id) => !ORIGINAL_THREE[id]);
const FAR_OUT = Object.freeze([
  'ore_barge_tow', 'skiff_tether_rescue', 'deserter_throw', 'refinery_hopper', 'toll_gate_ram', 'liner_locker',
]);
const RAW_ID = /\b[a-z]+(?:_[a-z0-9]+)+\b|\b[a-z]+[A-Z][A-Za-z0-9]*\b/;

function parentMission(definition, extra = {}) {
  return {
    id: `m-${definition.id}`,
    type: 'authored_set_piece',
    destStationId: definition.destStationId,
    destSectorId: definition.destSectorId,
    params: { authoredSetPieceId: definition.id },
    ...extra,
  };
}

function boot(seed) {
  const sim = createSimulation({ seed, systems: [missions], updateOrder: [] });
  const { state } = sim;
  state.mode = 'flight';
  state.player.credits = 250000;
  state.player.cargo = {
    items: {}, usedVolume: 0, usedMass: 0, capVolume: 80, capMass: 80,
  };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 100, z: -40 }, hull: 200, hullMax: 200, radius: 8,
  });
  state.playerId = player.id;
  // The Den's private door admits this pilot, the way the live berth would after the Pallas parcel.
  state.world.frontierRumors = {
    byId: {
      [TETHYS_BLACK_MARKET_DISCOVERY.rumorId]: {
        phase: 'contacted',
        contactId: TETHYS_BLACK_MARKET_DISCOVERY.contactId,
        entranceRun: { runId: TETHYS_BLACK_MARKET_RUN.runId, phase: 'delivered' },
      },
    },
  };
  // A pilot reading the Sker Bazaar, Ash Cache or Mercenary Outpost board has already docked
  // there, so the house standing that opened the berth is already earned. A delivery back to a
  // gated berth is refused at the board without it (the contract could never settle).
  state.factions = {
    ...(state.factions || {}),
    faction_reach: { rep: 5 },
    faction_vael: { rep: 5 },
    faction_quiet: { rep: 5 },
  };
  const failed = [];
  const toasts = [];
  const said = [];
  sim.bus.on('mission:failed', (payload) => failed.push(payload));
  sim.bus.on('toast', (payload) => toasts.push(payload));
  const missionsSys = sim.registry.get('missions');
  // The live one-voice arbiter is not mounted in a bare sim; a recorder stands in for it.
  missionsSys.helpers.voice = {
    say(line) { said.push(line); return true; },
  };
  return { sim, state, failed, toasts, said, missionsSys, player };
}

function finishPiece(seed, pieceId) {
  const h = boot(seed);
  const definition = AUTHORED_SET_PIECES.find((row) => row && row.id === pieceId);
  assert.ok(definition, pieceId);
  const board = h.missionsSys.ensureBoard(definition.startStationId);
  const offer = (board.slots || []).find((row) => (
    row && row.params && row.params.authoredSetPieceId === pieceId
  ));
  assert.ok(offer, `${pieceId} posts on ${definition.startStationId}`);
  offer.collateral_cr = 0;
  assert.equal(h.missionsSys.acceptMission(offer.id), true, `${pieceId} accepts`);
  const index = h.state.missions.active.findIndex((row) => (
    row && row.params && row.params.authoredSetPieceId === pieceId && row.status === 'active'
  ));
  assert.ok(index >= 0, `${pieceId} is active`);
  const mission = h.state.missions.active[index];
  assert.equal(h.missionsSys._completePhysical(mission, index, definition.methods[0]), true);
  const nextBoard = h.missionsSys.ensureBoard(definition.destStationId);
  const next = (nextBoard.slots || []).find((row) => (
    row && row.source === SET_PIECE_FOLLOW_ON_SOURCE && row.params && row.params.fromSetPieceId === pieceId
  ));
  return { h, definition, mission, next };
}

test('all seventeen authored set pieces mint a schema-valid follow-on offer', () => {
  assert.equal(PIECE_IDS.length, 17, 'the catalog is the seventeen authored set pieces');
  assert.equal(NEW_FOURTEEN.length, 14);
  const titles = new Set();
  const minted = [];
  for (const definition of AUTHORED_SET_PIECES) {
    const offer = setPieceFollowOnOffer(definition.id, parentMission(definition), 2);
    assert.ok(offer, `${definition.id} ends in a consequence`);
    minted.push(definition.id);
    assert.equal(offer.source, SET_PIECE_FOLLOW_ON_SOURCE);
    assert.equal(typeof offer.id, 'string');
    assert.ok(offer.id.length > 0 && offer.id.includes(definition.id), 'stable id carries the piece');
    assert.ok(MISSION_TYPE_IDS.has(offer.type), `${definition.id} reuses a real mission type (${offer.type})`);
    assert.equal(offer.stationId, definition.destStationId, 'boards where the player just worked');
    assert.ok(offer.destStationId, 'names a destination');
    assert.ok(offer.destSectorId, 'names a destination sector');
    assert.ok(offer.reward_cr > 0, 'pays');
    assert.equal(offer.collateral_cr, 0, 'no deposit on a consequence');
    assert.equal(offer.expiresAtEpoch, 5, 'three-epoch life from epoch 2');
    assert.equal(offer.storyTag, null);
    assert.equal(offer.params.failReload, false);
    assert.equal(offer.cause.failReload, false);
    assert.equal(offer.params.fromSetPieceId, definition.id);
    assert.equal(offer.params.parentMissionId, `m-${definition.id}`);
    for (const key of ['title', 'brief', 'summary']) {
      assert.equal(typeof offer[key], 'string', `${definition.id} ${key}`);
      assert.ok(offer[key].trim().length > 8, `${definition.id} ${key} has words`);
      assert.equal(RAW_ID.test(offer[key]), false, `${definition.id} ${key} shows no raw id: ${offer[key]}`);
    }
    assert.ok(!titles.has(offer.title), `${definition.id} title is its own: ${offer.title}`);
    titles.add(offer.title);
  }
  assert.equal(minted.length, 17, '17 of 17 pieces answer (11 of 17 before the far-out jobs got theirs)');
});

test('the convoy, the heist and the door-jam still return their original offers', () => {
  for (const [pieceId, expected] of Object.entries(ORIGINAL_THREE)) {
    const definition = AUTHORED_SET_PIECES.find((row) => row.id === pieceId);
    const offer = setPieceFollowOnOffer(pieceId, parentMission(definition), 0);
    assert.equal(offer.type, expected.type);
    assert.equal(offer.title, expected.title);
    assert.equal(offer.reward_cr, expected.reward_cr);
    assert.equal(offer.expiresAtEpoch, 3);
  }
});

test('a piece id that is not an authored set piece mints nothing', () => {
  assert.equal(setPieceFollowOnOffer('not_a_piece', { id: 'm', destStationId: 'station_forge' }, 0), null);
  assert.equal(setPieceFollowOnOffer('ace_duel', null, 0), null);
  assert.equal(setPieceFollowOnOffer('ace_duel', { id: 'm' }, 0), null, 'no board station, no offer');
  assert.equal(setPieceFollowOnBody('not_a_piece', { id: 'm' }, { x: 0, z: 0 }), null);
});

test('story and procedural physical jobs sharing a piece id post no sandbox follow-on', () => {
  const tow = AUTHORED_SET_PIECES.find((row) => row.id === 'long_tow');
  const story = parentMission(tow, { type: 'tow_recovery', storyTag: 'campaign47a:b3:bigger_boat' });
  assert.equal(setPieceFollowOnOffer('long_tow', story, 0), null, 'a 47-A story tow ends in the story');
  const beat = parentMission(tow, { type: 'tow_recovery', campaign47aBeat: 3 });
  assert.equal(setPieceFollowOnOffer('long_tow', beat, 0), null);
  const procedural = parentMission(tow, { type: 'tow_recovery' });
  assert.equal(setPieceFollowOnOffer('long_tow', procedural, 0), null,
    'an ordinary board tow is not the authored long tow');
  const ball = AUTHORED_SET_PIECES.find((row) => row.id === 'wrecking_ball');
  assert.equal(setPieceFollowOnOffer('wrecking_ball',
    parentMission(ball, { type: 'demolition', storyTag: 'campaign47a:b1:honest_work' }), 0), null);
  // Even carrying the authored type, a 47-A story contract ends in its story.
  for (const definition of AUTHORED_SET_PIECES) {
    assert.equal(setPieceFollowOnOffer(definition.id,
      parentMission(definition, { storyTag: 'campaign47a:b3:bigger_boat' }), 0), null,
    `${definition.id} story tag`);
    assert.equal(setPieceFollowOnOffer(definition.id,
      parentMission(definition, { campaign47aBeat: 2 }), 0), null, `${definition.id} story beat`);
    assert.equal(setPieceFollowOnBody(definition.id,
      parentMission(definition, { storyTag: 'campaign47a:b3:bigger_boat' }), { x: 0, z: 0 }), null,
    `${definition.id} story body`);
  }
});

test('every set piece, driven through the real completion path on seeds 4242 and 8008, boards a follow-on you can accept', () => {
  for (const [seed, pieceId] of [4242, 8008].flatMap((s) => PIECE_IDS.map((id) => [s, id]))) {
    const { h, definition, next } = finishPiece(seed, pieceId);
    assert.ok(next, `${pieceId} boards a follow-on at ${definition.destStationId}`);
    assert.equal(next.stationId, definition.destStationId);
    assert.equal(next.cause.failReload, false);
    assert.equal(h.failed.length, 0, `${pieceId} must not fail the run`);
    assert.equal(h.state.missions.active.some((row) => row && row.id === next.id), false,
      'the follow-on waits on the board');
    assert.equal(h.missionsSys.acceptMission(next.id), true, `${pieceId} follow-on ${next.type} accepts`);
    const live = h.state.missions.active.find((row) => row && row.sourceOfferId === next.id);
    assert.ok(live, `${pieceId} follow-on is a live contract`);
    assert.equal(live.type, next.type);
    assert.equal(h.failed.length, 0, `${pieceId} accepting the follow-on fails nothing`);
    h.sim.dispose();
  }
});

for (const pieceId of ['ace_duel', 'reef_clearance']) {
  test(`${pieceId} on seed 4242: the follow-on boards, its body spawns, and a news line fires`, () => {
    const { h, definition, mission, next } = finishPiece(4242, pieceId);
    assert.ok(next, `${pieceId} follow-on is on the ${definition.destStationId} board`);
    assert.equal(next.type, 'salvage_retrieval');
    assert.equal(next.stationId, definition.destStationId);
    assert.equal(next.destSectorId, definition.destSectorId);
    assert.equal(next.params.fromSetPieceId, pieceId);
    assert.equal(next.params.parentMissionId, mission.id);

    const pods = [...h.state.entities.values()].filter((e) => (
      e && e.alive !== false && e.data && e.data.missionId === mission.id
    ));
    assert.equal(pods.length, 1, `${pieceId} leaves one body in the world`);
    const [pod] = pods;
    assert.equal(pod.type, 'payload');
    assert.equal(pod.data.tetherPayload, true);
    assert.equal(pod.data.commodityId, next.params.cmdtyId, 'the pod holds what the contract wants');
    assert.ok(pod.data.salvagePool[next.params.cmdtyId] >= next.params.qty,
      'the pod holds at least the contracted quantity');
    assert.ok(pod.data.scanLabel && !RAW_ID.test(pod.data.scanLabel), 'the pod reads as a thing, not an id');

    const lines = [...h.said.filter((line) => line.channel === 'news'), ...h.toasts
      .filter((line) => line.source === SET_PIECE_FOLLOW_ON_SOURCE)];
    assert.ok(lines.some((line) => line.text === next.title), `${pieceId} news line names the new job`);
    h.sim.dispose();
  });
}

test('the new bodies are scoopable pods that hold what their contract wants', () => {
  const mission = { id: 'm-body', destStationId: 'station_forge' };
  const podPieces = [
    'ace_duel', 'reef_clearance', 'ore_crusher', 'impound_break', 'wrecking_ball',
    'ore_barge_tow', 'refinery_hopper', 'liner_locker',
  ];
  for (const pieceId of podPieces) {
    const definition = AUTHORED_SET_PIECES.find((row) => row.id === pieceId);
    const offer = setPieceFollowOnOffer(pieceId, parentMission(definition), 0);
    const body = setPieceFollowOnBody(pieceId, parentMission(definition), { x: 10, z: 20 });
    assert.ok(body, `${pieceId} leaves a pod`);
    assert.equal(body.type, 'payload');
    assert.equal(body.pos.x, 38);
    assert.equal(body.pos.z, 32);
    assert.equal(body.data.tetherPayload, true);
    assert.equal(body.data.missionId, `m-${pieceId}`);
    assert.equal(body.data.commodityId, offer.params.cmdtyId);
    assert.ok(body.data.salvagePool[offer.params.cmdtyId] >= offer.params.qty,
      `${pieceId} pod covers the contract quantity`);
    assert.ok(body.mass > 0 && body.mass < 60, `${pieceId} pod is liftable`);
  }
  // The tows, the rescues, the squad and the gate span spawn their own bodies on accept.
  for (const pieceId of [
    'long_tow', 'heavy_tow', 'pod_rescue', 'skiff_tether_rescue', 'deserter_throw', 'toll_gate_ram',
  ]) {
    assert.equal(setPieceFollowOnBody(pieceId, mission, { x: 0, z: 0 }), null, pieceId);
  }
});

test('each consequence is the kind of job its fiction says', () => {
  const byPiece = Object.fromEntries(NEW_FOURTEEN.map((id) => {
    const definition = AUTHORED_SET_PIECES.find((row) => row.id === id);
    return [id, setPieceFollowOnOffer(id, parentMission(definition), 0)];
  }));
  // The ace's wing crew contest the black box; the reef cache and the tower scrap are claims.
  assert.equal(byPiece.ace_duel.type, 'salvage_retrieval');
  assert.equal(byPiece.ace_duel.params.cmdtyId, 'cmdty_classified_salvage');
  assert.equal(byPiece.reef_clearance.type, 'salvage_retrieval');
  assert.equal(byPiece.reef_clearance.destSectorId, 'sector_veil_nebula');
  assert.equal(byPiece.wrecking_ball.type, 'salvage_retrieval');
  // The jammed jaws spill slag to haul to the furnace.
  assert.equal(byPiece.ore_crusher.type, 'cargo_delivery');
  assert.equal(byPiece.ore_crusher.destStationId, 'station_forge');
  // The hot cradle runs to the den through patrol scans, and is not the heist's cargo.
  assert.equal(byPiece.impound_break.type, 'smuggling_run');
  assert.equal(byPiece.impound_break.destStationId, 'station_smuggler');
  assert.notEqual(byPiece.impound_break.params.cmdtyId,
    setPieceFollowOnOffer('loud_heist', { id: 'm', destStationId: 'station_tethys' }, 0).params.cmdtyId);
  // The pulled pods earn an escort under raider cover; the long tow a claim fight; the heavy tow
  // the yard's next core.
  assert.equal(byPiece.pod_rescue.type, 'escort');
  assert.equal(byPiece.long_tow.type, 'patrol_clear');
  assert.equal(byPiece.heavy_tow.type, 'tow_recovery');
  assert.ok(byPiece.heavy_tow.params.massU > 0);
  // The far-out jobs answer the person or the thing their own piece put on the scene, and each
  // posts at the far station the player just worked.
  assert.equal(byPiece.ore_barge_tow.type, 'cargo_delivery', 'the barge sheds ingots to carry in');
  assert.equal(byPiece.ore_barge_tow.destStationId, 'station_sker');
  assert.equal(byPiece.skiff_tether_rescue.type, 'escort', 'the rescued crew needs walking in');
  assert.equal(byPiece.skiff_tether_rescue.destStationId, 'station_io_merc');
  assert.equal(byPiece.deserter_throw.type, 'patrol_clear', 'the deserter had a squad');
  assert.equal(byPiece.deserter_throw.params.clearCount, 2);
  assert.equal(byPiece.refinery_hopper.type, 'cargo_delivery', 'the first batch goes down the lane');
  assert.equal(byPiece.refinery_hopper.destStationId, 'station_ceres');
  assert.equal(byPiece.toll_gate_ram.type, 'tow_recovery', 'the broken gate is a hulk to clear');
  assert.ok(byPiece.toll_gate_ram.params.massU > 0);
  assert.equal(byPiece.liner_locker.type, 'salvage_retrieval', 'the next hold is open to wreckers');
  for (const id of FAR_OUT) {
    const definition = AUTHORED_SET_PIECES.find((row) => row.id === id);
    assert.equal(byPiece[id].stationId, definition.startStationId, `${id} follows at the station that posted it`);
    assert.equal(definition.startStationId, definition.destStationId, `${id} is worked at one far station`);
  }
  // Fourteen different board lines, each naming a different deed.
  assert.equal(new Set(NEW_FOURTEEN.map((id) => byPiece[id].summary)).size, 14);
  assert.equal(new Set(NEW_FOURTEEN.map((id) => byPiece[id].brief)).size, 14);
  assert.equal(new Set(NEW_FOURTEEN.map((id) => byPiece[id].title)).size, 14);
});

test('every new follow-on runs end to end on seed 4242: its pressure spawns on arrival and the dock settles it', () => {
  const salvageLike = ['ace_duel', 'reef_clearance', 'wrecking_ball', 'liner_locker'];
  for (const pieceId of NEW_FOURTEEN) {
    const { h, definition, next } = finishPiece(4242, pieceId);
    const lines = [...h.said.filter((line) => line.channel === 'news'), ...h.toasts
      .filter((line) => line.source === SET_PIECE_FOLLOW_ON_SOURCE)];
    assert.ok(lines.some((line) => line.text === next.title), `${pieceId} news line names the new job`);
    assert.equal(next.stationId, definition.destStationId);
    // The player flies into the contract's sector, then takes the job.
    h.state.world.currentSectorId = next.destSectorId;
    assert.equal(h.missionsSys.acceptMission(next.id), true, `${pieceId} accepts`);
    const live = h.state.missions.active.find((row) => row && row.sourceOfferId === next.id);
    assert.ok(live, `${pieceId} is live`);
    const spawned = live.targetEntityIds.map((id) => h.state.entities.get(id)).filter(Boolean);

    if (salvageLike.includes(pieceId)) {
      assert.equal(spawned.length, 1, `${pieceId} accepting plants the contested wreck`);
      assert.equal(spawned[0].type, 'wreck');
      assert.ok(spawned[0].data.salvagePool[next.params.cmdtyId] >= next.params.qty,
        `${pieceId} the contested wreck holds the contracted cargo`);
    } else if (pieceId === 'pod_rescue' || pieceId === 'skiff_tether_rescue') {
      assert.equal(next.factionId, definition.factionId, 'the escort flies the posting faction livery');
      assert.ok(spawned.length >= 1, 'the rescued crews launch as a convoy');
      assert.ok(spawned.some((e) => e.data && e.data.escortee === 'lead'), 'with a named lead');
    } else if (pieceId === 'long_tow') {
      assert.equal(live.objectiveTarget, 3);
      assert.equal(spawned.length, 3, 'three claim jumpers hold the lane');
    } else if (pieceId === 'deserter_throw') {
      assert.equal(live.objectiveTarget, 2);
      assert.equal(spawned.length, 2, "two of the deserter's squad hold the range");
    } else if (pieceId === 'heavy_tow' || pieceId === 'toll_gate_ram') {
      assert.equal(spawned.length, 1, 'the contract body spawns on accept');
      assert.equal(spawned[0].type, 'asteroid');
      assert.equal(spawned[0].data.scanLabel, next.params.scanLabel);
      assert.ok(spawned[0].mass >= next.params.massU, 'its mass is the contract mass');
    }

    // The cargo families settle at the destination dock from the hold, and pay the posted amount.
    if (['salvage_retrieval', 'cargo_delivery', 'smuggling_run'].includes(next.type)) {
      h.missionsSys._onDockedObjectives(next.destStationId);
      assert.equal(live.status, 'active', `${pieceId} does not settle with an empty hold`);
      h.state.player.cargo.items[next.params.cmdtyId] = next.params.qty;
      h.missionsSys._onDockedObjectives(next.destStationId);
      assert.equal(live.status, 'completed', `${pieceId} settles at ${next.destStationId}`);
      assert.equal(h.state.missions.active.some((row) => row && row.id === live.id), false);
    }
    assert.equal(h.failed.length, 0, `${pieceId} never fails the run`);
    h.sim.dispose();
  }
});

test('a board refresh keeps every new follow-on until its epoch lifetime ends', () => {
  for (const pieceId of NEW_FOURTEEN) {
    const { h, next } = finishPiece(4242, pieceId);
    const stationId = next.stationId;
    const epoch = h.missionsSys._epoch();
    h.state.simTime = (epoch + 1) * 600 + 1;
    const refreshed = h.missionsSys.ensureBoard(stationId);
    assert.ok((refreshed.slots || []).some((row) => row && row.id === next.id),
      `${pieceId} follow-on survives the next board epoch`);
    h.state.simTime = (next.expiresAtEpoch + 1) * 600;
    const expired = h.missionsSys.ensureBoard(stationId);
    assert.equal((expired.slots || []).some((row) => row && row.id === next.id), false,
      `${pieceId} follow-on leaves when its lifetime ends`);
    assert.equal(h.failed.length, 0);
    h.sim.dispose();
  }
});
