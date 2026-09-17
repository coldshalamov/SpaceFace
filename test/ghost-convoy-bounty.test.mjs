import assert from 'node:assert/strict';
import test from 'node:test';

// Ghost-convoy bounty arc — the lane rumor must END somewhere.
//
// Chain under test: 3+ automation losses on a reach-pressure lane → lossLedger mints a priced
// nest bounty → the news line names the posting station → missions BOARDS the offer (the old
// allowlist dropped it silently) → accepting spawns a real nest pack (anchor + cutters, sized by
// lane danger) instead of the standard single mark → killing the nest settles the contract and
// the lane's news voice reports the quiet, exactly once.

import { lossLedger } from '../src/systems/lossLedger.js';
import { missions } from '../src/systems/missions.js';
import { pickWreckMission, WRECK_MISSIONS } from '../src/data/wreckMissions.js';

const SECTOR_ID = 'sector_helios_prime';
const STATION_ID = 'station_helios';
const STATION_NAME = 'Helios Station';

function makeBus() {
  const handlers = new Map();
  const emitted = [];
  return {
    emitted,
    on(name, fn) {
      const rows = handlers.get(name) || [];
      rows.push(fn);
      handlers.set(name, rows);
    },
    off(name, fn) {
      handlers.set(name, (handlers.get(name) || []).filter((entry) => entry !== fn));
    },
    emit(name, payload) {
      emitted.push({ name, payload });
      for (const fn of [...(handlers.get(name) || [])]) fn(payload);
    },
  };
}

function makeState() {
  return {
    meta: { seed: 0x9ea7 },
    simTime: 1800,
    tick: 100,
    playerId: 1,
    entities: new Map(),
    player: { credits: 500, cargo: { capVolume: 200, usedVolume: 0 }, stats: {}, researchPoints: 0 },
    ui: {},
    story: { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 },
    missions: { boards: {}, active: [], completedLog: [], receipts: [], nextId: 1, config: null },
    world: {
      currentSectorId: SECTOR_ID,
      activeSector: {},
      sectors: {
        [SECTOR_ID]: { id: SECTOR_ID, name: 'Helios Prime', owner: 'faction_scn' },
      },
    },
    // The reach-pressure lane signal lossLedger's ghost-convoy detector reads.
    sectorSim: {
      sectors: {},
      field: {
        nodes: {
          [SECTOR_ID]: {
            danger: 0.75,
            pricePressure: 0,
            influence: { faction_scn: 1 },
            dominantFactionId: 'faction_scn',
            driver: { danger: 'reach_pressure' },
          },
        },
      },
    },
  };
}

function makeVoice() {
  const calls = [];
  return {
    calls,
    say(cue) {
      calls.push(cue);
      return true;
    },
  };
}

/**
 * Wire the real lossLedger + missions systems onto one bus. spawnEntity records enemy specs so
 * the nest pack can be inspected without a full entity factory.
 */
function makeWorld(state = makeState()) {
  const bus = makeBus();
  const voice = makeVoice();
  let nextEntityId = 100;
  const spawnedSpecs = [];
  const helpers = {
    voice,
    spawnEntity(spec) {
      spawnedSpecs.push(spec);
      const ent = {
        id: nextEntityId++,
        alive: true,
        team: spec.team != null ? spec.team : 2,
        factionId: spec.factionId || null,
        pos: { ...(spec.pos || { x: 0, z: 0 }) },
        flags: spec.flags || {},
        data: spec.data || {},
      };
      state.entities.set(ent.id, ent);
      return ent;
    },
  };
  const ledger = { ...lossLedger };
  ledger.init({ state, bus, helpers, registry: { get: () => null } });
  const missionSystem = { ...missions };
  missionSystem.init({ state, bus, helpers, registry: { get: () => null } });
  return { state, bus, voice, spawnedSpecs, ledger, missionSystem };
}

function driveLaneLosses(state, bus, count = 3) {
  for (let i = 0; i < count; i++) {
    bus.emit('automation:assetLost', {
      kind: 'trader',
      id: `trader_${i}`,
      sectorId: SECTOR_ID,
      value: 400,
      shipDefId: 'ship_mule',
    });
  }
}

test('ghost convoy rumor mints a station-addressed lane bounty the board accepts', () => {
  const world = makeWorld();
  const { state, bus, voice } = world;

  driveLaneLosses(state, bus, 3);

  // 1. The rumor fired exactly once, as station news, and names WHERE the bounty sits.
  const rumors = bus.emitted.filter((event) => event.name === 'rumor:ghostConvoy');
  assert.equal(rumors.length, 1, 'one ghost-convoy rumor per lane per run');
  const rumorLine = voice.calls.find((cue) => cue.kind === 'ghostConvoy');
  assert.ok(rumorLine, 'the rumor spoke on the news channel');
  assert.match(rumorLine.text, /3 losses on the Helios Prime lane/);
  assert.match(rumorLine.text, new RegExp(`${STATION_NAME} posted a bounty`),
    'the news line must name the station so the rumor has an address');

  // 2. The offer was BOARDed, not dropped: the old gate returned false for ghostConvoyRumor.
  const boarded = bus.emitted.filter((event) => event.name === 'mission:offerBoarded');
  assert.equal(boarded.length, 1, 'the ghost-convoy offer must reach the board');
  assert.equal(boarded[0].payload.stationId, STATION_ID);
  const board = state.missions.boards[STATION_ID];
  assert.ok(board && Array.isArray(board.slots), 'the posting station has a board');
  const offer = board.slots.find((slot) => slot && slot.id === boarded[0].payload.offerId);
  assert.ok(offer, 'the ghost-convoy offer sits on the board');
  assert.equal(offer.source, 'ghostConvoyRumor');
  assert.equal(offer.type, 'bounty_hunt');
  assert.equal(offer.giver, 'Scarred hull transponder',
    'the authored wreck-mission template carries the board voice, not the fallback');
  assert.ok(offer.reward_cr > 0, 'the bounty is priced');
  assert.ok(offer.minRep === 0, 'a lane-watch cry for help carries no standing wall');

  // 2b. A board epoch refresh must not swallow the bounty: the news line named this station, and
  // the ledger never re-fires a lane, so a dropped row would kill the arc for the whole save.
  state.simTime += 600 + 1; // advance past one refresh epoch (refreshSec 600)
  world.missionSystem.ensureBoard(STATION_ID);
  const refreshedBoard = state.missions.boards[STATION_ID];
  assert.ok(
    refreshedBoard.slots.some((slot) => slot && slot.id === offer.id),
    'the ghost-convoy bounty survives a board epoch refresh until accepted',
  );

  // 3. The nest is a PACK sized by lane danger (3-4 hulls), not the standard single mark.
  const packSize = offer.params.clearCount;
  assert.ok(packSize >= 3 && packSize <= 4, `pack sized 3-4 by lane danger, got ${packSize}`);
  assert.ok(offer.params.taskTime >= 60 * packSize,
    'the time window scales with the pack, not the single-mark default');

  // The nest is a PLACE: the offer points at an authored lane feature (asteroid field first).
  assert.ok(offer.storyTarget, 'the bounty carries a nest anchor');
  assert.equal(offer.storyTarget.anchorId, 'f_helios_starter',
    'deterministic lane-feature pick for the fixture sector');
  assert.equal(offer.storyTarget.label, 'Raider nest-anchor');

  assert.ok(world.missionSystem.acceptMission(offer.id), 'the bounty accepts');
  const active = state.missions.active[0];
  assert.equal(active.objectiveTarget, packSize, 'objective owes the whole nest');
  assert.equal(active.needsTargets, true);
  assert.ok(Number.isFinite(active.deadline_s), 'accepted bounty carries its time limit');

  world.missionSystem._ensureMissionTargets(active);
  const pack = active.targetEntityIds.map((id) => state.entities.get(id));
  assert.equal(pack.length, packSize, 'the whole nest materialized');
  // Enemy archetypes map to hull defs: reaver_pirate → ship_drifter, wasp_swarmer → ship_wasp.
  const anchors = pack.filter((ent) => ent.data && ent.data.defId === 'ship_drifter');
  const cutters = pack.filter((ent) => ent.data && ent.data.defId === 'ship_wasp');
  assert.equal(anchors.length, 1, 'one nest anchor holds the seam');
  assert.equal(cutters.length, packSize - 1, 'the rest are wasp cutters');
  assert.equal(pack[0].data.scanLabel, 'Raider nest-anchor', 'the anchor scans as the nest-anchor');
  assert.ok(pack[0].data.reinforcements,
    'the nest anchor keeps its live reinforcement call — the fight can change plan mid-commit');
  assert.ok(pack.every((ent) => ent.data && ent.data.missionTag === active.id),
    'every nest hull is mission-tagged for kill attribution');

  // The pack rings ONE anchor point (the authored lane feature), not a ring around the player:
  // every hull sits within anchorRadius (260) of the same seam, so the nest is a place.
  const spread = Math.max(...pack.flatMap((a) => pack.map((b) => Math.hypot(
    a.pos.x - b.pos.x, a.pos.z - b.pos.z,
  ))));
  assert.ok(spread <= 620, `the whole nest clusters at the lane seam (spread ${spread.toFixed(0)} WU)`);

  // 4. Killing the nest settles the contract and the lane's news voice reports the quiet — once.
  for (const ent of pack) {
    bus.emit('entity:killed', { id: ent.id, killerId: state.playerId, type: 'ship' });
  }
  assert.equal(state.missions.active.length, 0, 'the nest clear completes the bounty');
  const completed = bus.emitted.filter((event) => event.name === 'mission:completed');
  assert.equal(completed.length, 1);
  assert.equal(completed[0].payload.source, 'ghostConvoyRumor');
  assert.equal(completed[0].payload.sourceOfferId, offer.id,
    'the settled mission must carry its originating offer so the lane memory can match it');

  const resolutions = voice.calls.filter((cue) => cue.kind === 'ghostConvoyResolved');
  assert.equal(resolutions.length, 1, 'the resolution is spoken exactly once');
  assert.match(resolutions[0].text, /Helios Prime lane has gone quiet/);
  assert.match(resolutions[0].text, /hulls is scrap now/);

  const fired = state.lossLedger.ghostConvoy.fired;
  const laneKey = Object.keys(fired)[0];
  assert.ok(fired[laneKey].resolvedAt != null, 'the lane memory records the resolution');

  world.ledger.destroy();
});

test('ghost rumor does not refire for the same lane, and other lanes stay silent', () => {
  const world = makeWorld();
  const { state, bus } = world;

  driveLaneLosses(state, bus, 3);
  driveLaneLosses(state, bus, 3);
  assert.equal(bus.emitted.filter((event) => event.name === 'rumor:ghostConvoy').length, 1,
    'one rumor per lane per run — losses after the bounty exists do not re-mint it');
  world.ledger.destroy();
});

test('ordinary bounties keep their single-mark contract and salvage pools keep their table', () => {
  const world = makeWorld();
  const { state, bus, spawnedSpecs } = world;
  const missionSystem = world.missionSystem;

  // A plain bounty offer (no ghostConvoy params) must still spawn exactly one hostile.
  const plainOffer = {
    id: 'plain_bounty_1',
    source: 'encounterAftermath',
    type: 'bounty_hunt',
    stationId: STATION_ID,
    factionId: 'faction_scn',
    reward_cr: 300,
    collateral_cr: 0,
    riskTier: 2,
    destStationId: STATION_ID,
    destSectorId: SECTOR_ID,
    distance: 500,
    params: { clearCount: 1, killCount: 0, targetStrength: 2, fValue: 2, taskTime: 60 },
    title: 'Bounty: raider captain',
    summary: 'A single mark.',
  };
  assert.ok(missionSystem._onExternalBoardOffer(plainOffer), 'plain bounty still boards');
  assert.ok(missionSystem.acceptMission(plainOffer.id));
  const active = state.missions.active[0];
  assert.equal(active.objectiveTarget, 1, 'ordinary bounty owes one mark');
  missionSystem._ensureMissionTargets(active);
  assert.equal(active.targetEntityIds.length, 1, 'ordinary bounty spawns exactly one hostile');

  // The wreck-mission table keeps exactly one authored lane-bounty template — no duplicate, and
  // the salvage communicator pool draws the whole table unchanged.
  const reachTemplates = WRECK_MISSIONS.filter((m) => m && m.id === 'wm_reach_bounty');
  assert.equal(reachTemplates.length, 1, 'exactly one authored wm_reach_bounty template');
  assert.ok(pickWreckMission(() => 0), 'pool never empty');

  world.ledger.destroy();
});
