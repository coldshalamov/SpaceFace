import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { COMMODITIES } from '../src/data/commodities.js';
import { MISSION_TUNING, MISSION_TYPES } from '../src/data/missions.js';
import { SECTORS } from '../src/data/sectors.js';
import { ENDING_IDS, SANDBOX_ID, endingDef } from '../src/story/endings/endingDefs.js';
import {
  POST_ENDING_REPLAY_CHAINS,
  POST_ENDING_REPLAY_SOURCE,
  postEndingReplayChain,
  validatePostEndingReplayChains,
} from '../src/data/postEndingReplayChains.js';
import {
  buildPostEndingReplayOffer,
  ensurePostEndingReplayState,
  postEndingReplay,
} from '../src/systems/postEndingReplay.js';
import { missions } from '../src/systems/missions.js';
import { PRODUCTION_INIT_ORDER } from '../src/runtime/authoritativeSystemManifest.js';

class Bus {
  constructor() { this.handlers = new Map(); this.log = []; }
  on(name, fn) {
    const list = this.handlers.get(name) || [];
    list.push(fn);
    this.handlers.set(name, list);
    return () => this.off(name, fn);
  }
  off(name, fn) { this.handlers.set(name, (this.handlers.get(name) || []).filter((entry) => entry !== fn)); }
  emit(name, payload) {
    this.log.push({ name, payload });
    for (const fn of [...(this.handlers.get(name) || [])]) fn(payload);
  }
}

const STATION_TO_SECTOR = new Map();
for (const sector of SECTORS) for (const station of sector.stations || []) STATION_TO_SECTOR.set(station.id, sector.id);
const MISSION_TYPES_SET = new Set(MISSION_TYPES.map((entry) => entry.type));
const COMMODITIES_SET = new Set(COMMODITIES.map((entry) => entry.id));

function baseState(choiceId = 'A', { seed = 47, simTime = 1200 } = {}) {
  const def = endingDef(choiceId);
  return {
    meta: { seed, playtimeS: 0 },
    seed,
    tick: 0,
    simTime,
    mode: 'flight',
    playerId: 1,
    player: { credits: 500000, researchPoints: 0, cargo: { items: {}, capVolume: 500, capMass: 500, usedVolume: 0, usedMass: 0 }, stats: {} },
    story: {
      beatIndex: 7, branch: 'free', flags: { endgame: true }, chainProgress: 0,
      endgameChoice: choiceId === SANDBOX_ID ? null : choiceId,
      endgameResolved: true,
      postEnding: {
        status: 'complete', choiceId, endingId: choiceId === SANDBOX_ID ? null : choiceId,
        sandboxMode: def.sandboxMode, replayHookId: def.continuity.replayHookId,
      },
    },
    missions: { boards: {}, active: [], completedLog: [], receipts: [], nextId: 1, config: JSON.parse(JSON.stringify(MISSION_TUNING)) },
    factions: { faction_scn: { rep: 500 }, faction_mts: { rep: 500 }, faction_dmc: { rep: 500 }, faction_free: { rep: 500 } },
    world: { currentSectorId: 'sector_helios_prime', activeSector: { stations: [] } },
    entities: new Map(), entityList: [], ui: { docked: false, dockedStationId: null }, nav: {},
    settings: { gameplay: { tutorialHints: false } },
  };
}

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random forbidden in replay chains'); };
  Date.now = () => { throw new Error('Date.now forbidden in replay chains'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

function count(bus, name, predicate = () => true) {
  return bus.log.filter((entry) => entry.name === name && predicate(entry.payload || {})).length;
}

function bindBoard(bus, offers) {
  bus.on('mission:offered', (offer) => {
    offers.push(offer);
    bus.emit('mission:offerBoarded', {
      offerId: offer.id,
      stationId: offer.stationId,
      source: offer.source,
      causeFingerprint: offer.cause.fingerprint,
    });
  });
}

function settleOffer(bus, offer, missionId, completed = true) {
  bus.emit('mission:accepted', { missionId, source: offer.source, causeFingerprint: offer.cause.fingerprint });
  bus.emit(completed ? 'mission:completed' : 'mission:failed', {
    missionId, source: offer.source, causeFingerprint: offer.cause.fingerprint,
    ...(completed ? {} : { reason: 'abandoned' }),
  });
}

test('six ending-specific chains provide twelve distinct, valid three-mission routes', () => {
  assert.deepEqual(validatePostEndingReplayChains(), { ok: true, errors: [], chains: 6, playableRoutes: 12 });
  assert.deepEqual(new Set(POST_ENDING_REPLAY_CHAINS.map((entry) => entry.choiceId)), new Set([...ENDING_IDS, SANDBOX_ID]));
  const sequences = new Set();
  for (const chain of POST_ENDING_REPLAY_CHAINS) {
    assert.equal(chain.replayHookId, endingDef(chain.choiceId).continuity.replayHookId);
    assert.ok(chain.actor.name && chain.actor.motive.length >= 50);
    assert.ok(chain.durablePremise.length >= 50 && chain.choicePrompt.length >= 50);
    assert.equal(chain.branches.length, 2);
    assert.notEqual(chain.branches[0].mission.boardStationId, chain.branches[1].mission.boardStationId, `${chain.id}: travel selects a real branch`);
    for (const branch of chain.branches) {
      const parts = [chain.opening, branch.mission, branch.finale];
      const seq = parts.map((part) => part.type).join('>');
      sequences.add(`${chain.choiceId}:${branch.id}:${seq}`);
      assert.ok(branch.label && branch.tradeoff.length >= 45);
      assert.ok(branch.consequence.worldFlag);
      assert.ok(Number.isFinite(branch.consequence.danger) && Number.isFinite(branch.consequence.pricePressure));
      for (const part of parts) {
        assert.ok(MISSION_TYPES_SET.has(part.type));
        assert.ok(STATION_TO_SECTOR.has(part.boardStationId));
        assert.ok(SECTORS.some((sector) => sector.id === part.destSectorId));
        if (part.destStationId) assert.equal(STATION_TO_SECTOR.get(part.destStationId), part.destSectorId);
        if (part.params.cmdtyId) assert.ok(COMMODITIES_SET.has(part.params.cmdtyId));
        assert.ok(part.instruction.length >= 50 && part.failureText.length >= 40 && part.recoveryText.length >= 40);
      }
    }
  }
  assert.equal(sequences.size, 12);
});

test('offer identity is deterministic, ecology-bound, and explicitly excludes one-time ending rewards', () => {
  guarded(() => {
    for (const choiceId of [...ENDING_IDS, SANDBOX_ID]) {
      const state = baseState(choiceId, { seed: 919 });
      const a = buildPostEndingReplayOffer(state);
      const b = buildPostEndingReplayOffer(state);
      assert.deepEqual(a, b);
      assert.equal(a.source, POST_ENDING_REPLAY_SOURCE);
      assert.equal(a.cause.choiceId, choiceId);
      assert.equal(a.cause.replayHookId, endingDef(choiceId).continuity.replayHookId);
      assert.ok(a.cause.regionalFingerprint && a.cause.regionalFamilyId);
      assert.equal(a.cause.oneTimeReward, false);
      const next = ensurePostEndingReplayState(state);
      next.cycle = 1;
      const cycleOne = buildPostEndingReplayOffer(state);
      assert.notEqual(cycleOne.id, a.id);
      assert.ok(cycleOne.reward_cr > a.reward_cr, 'repeat work pays as a normal mission without replaying ending resolution');
    }
  });
});

test('all six public chains complete both meaningful choices with exactly-once persistent consequences', () => {
  guarded(() => {
    for (const choiceId of [...ENDING_IDS, SANDBOX_ID]) {
      const chain = postEndingReplayChain(choiceId);
      for (const branchDef of chain.branches) {
        const state = baseState(choiceId, { seed: 100 + chain.id.length + branchDef.id.length });
        const bus = new Bus();
        const offers = [];
        bindBoard(bus, offers);
        const sys = { ...postEndingReplay };
        sys.init({ state, bus });

        bus.emit('dock:docked', { stationId: chain.opening.boardStationId });
        const opening = offers.at(-1);
        settleOffer(bus, opening, `m_${choiceId}_${branchDef.id}_0`);
        const choiceEvent = bus.log.find((entry) => entry.name === 'postEndingReplay:choiceAvailable');
        assert.equal(choiceEvent.payload.options.length, 2);
        assert.ok(choiceEvent.payload.options.some((option) => option.id === branchDef.id && option.stationId === branchDef.mission.boardStationId));

        bus.emit('dock:docked', { stationId: branchDef.mission.boardStationId });
        const branchOffer = offers.at(-1);
        assert.equal(branchOffer.cause.branchId, branchDef.id);
        settleOffer(bus, branchOffer, `m_${choiceId}_${branchDef.id}_1`);
        assert.equal(ensurePostEndingReplayState(state).branchId, branchDef.id);

        bus.emit('dock:docked', { stationId: branchDef.finale.boardStationId });
        const finale = offers.at(-1);
        settleOffer(bus, finale, `m_${choiceId}_${branchDef.id}_2`);
        settleOffer(bus, finale, `m_${choiceId}_${branchDef.id}_2`);

        const run = ensurePostEndingReplayState(state);
        assert.equal(run.status, 'completed');
        assert.equal(run.completedStageIds.length, 3);
        assert.equal(run.worldFlags[branchDef.consequence.worldFlag].count, 1);
        assert.equal(count(bus, 'sectorsim:impulse'), 1, 'one final durable regional consequence');
        assert.equal(count(bus, 'postEndingReplay:cycleCompleted'), 1);
        const cycleEvent = bus.log.find((entry) => entry.name === 'postEndingReplay:cycleCompleted').payload;
        assert.equal(cycleEvent.branchId, branchDef.id);
        assert.equal(cycleEvent.oneTimeRewardGranted, false);
        assert.equal(count(bus, 'economy:grantCredits'), 0, 'replay system never duplicates an ending reward');

        const offeredCount = offers.length;
        bus.emit('dock:docked', { stationId: chain.opening.boardStationId });
        assert.equal(offers.length, offeredCount, 'same epoch cannot farm the loop');
        state.simTime += 601;
        bus.emit('dock:docked', { stationId: chain.opening.boardStationId });
        assert.equal(offers.at(-1).cause.cycle, 1);
        sys.destroy();
      }
    }
  });
});

test('failed branch stage remains chosen and reoffers only that stage with recovery terms', () => {
  guarded(() => {
    const state = baseState('E');
    const chain = postEndingReplayChain('E');
    const branch = chain.branches.find((entry) => entry.id === 'audit');
    const bus = new Bus();
    const offers = [];
    bindBoard(bus, offers);
    const sys = { ...postEndingReplay };
    sys.init({ state, bus });
    bus.emit('dock:docked', { stationId: chain.opening.boardStationId });
    settleOffer(bus, offers.at(-1), 'm_open');
    bus.emit('dock:docked', { stationId: branch.mission.boardStationId });
    const first = offers.at(-1);
    settleOffer(bus, first, 'm_fail', false);
    settleOffer(bus, first, 'm_fail', false);
    let run = ensurePostEndingReplayState(state);
    assert.equal(run.status, 'recovering');
    assert.equal(run.branchId, branch.id);
    assert.equal(run.stageIndex, 1);
    assert.equal(run.attempt, 1);
    bus.emit('dock:docked', { stationId: branch.mission.boardStationId });
    const retry = offers.at(-1);
    assert.equal(retry.cause.branchId, branch.id);
    assert.equal(retry.cause.stageIndex, 1);
    assert.notEqual(retry.id, first.id);
    assert.ok(retry.reward_cr < first.reward_cr);
    assert.match(retry.summary, /Recovery:/);
    assert.equal(count(bus, 'postEndingReplay:stageSettled', (payload) => payload.outcome === 'failed'), 1);
    sys.destroy();
  });
});

test('missions boards and JSON save preserve a mid-choice replay without materializing absent extension state', () => {
  guarded(() => {
    const state = baseState('D');
    const bus = new Bus();
    const missionSys = { ...missions };
    missionSys.init({ state, bus, helpers: { hash32: (...args) => 47 + args.length, voice: { say: () => true } } });
    const replaySys = { ...postEndingReplay };
    replaySys.init({ state, bus });
    const chain = postEndingReplayChain('D');
    const offer = replaySys._offerAtStation(chain.opening.boardStationId);
    assert.ok(state.missions.boards[chain.opening.boardStationId].slots.some((row) => row.id === offer.id));
    assert.equal(missionSys._instanceFromOffer(offer).cause.chainId, chain.id);
    const saved = missionSys.serialize();
    assert.equal(saved.postEndingReplay.chainId, chain.id);
    const restored = baseState('D');
    const restoredBus = new Bus();
    const restoredMissionSys = { ...missions };
    restoredMissionSys.init({ state: restored, bus: restoredBus, helpers: { voice: { say: () => true } } });
    restoredMissionSys.deserialize(JSON.parse(JSON.stringify(saved)));
    assert.deepEqual(restored.missions.postEndingReplay, state.missions.postEndingReplay);

    const reduced = baseState('D');
    delete reduced.missions.postEndingReplay;
    const reducedBus = new Bus();
    const reducedMissionSys = { ...missions };
    reducedMissionSys.init({ state: reduced, bus: reducedBus, helpers: { voice: { say: () => true } } });
    const reducedSave = reducedMissionSys.serialize();
    assert.equal(Object.hasOwn(reducedSave, 'postEndingReplay'), false);
    reducedMissionSys.deserialize(JSON.parse(JSON.stringify(reducedSave)));
    assert.equal(Object.hasOwn(reduced.missions, 'postEndingReplay'), false);
    replaySys.destroy();
  });
});

test('default registry wires replay after missions/career contracts with no UI, asset, or direct-authority writes', () => {
  const registry = readFileSync(new URL('../src/core/registry.js', import.meta.url), 'utf8');
  assert.match(registry, /import \{ postEndingReplay \} from '\.\.\/systems\/postEndingReplay\.js';/);
  assert.match(registry, /\['postEndingReplay',\s*postEndingReplay\]/,
    'registry materializes the canonical post-ending replay system');
  const missionsIndex = PRODUCTION_INIT_ORDER.indexOf('missions');
  const careerContractsIndex = PRODUCTION_INIT_ORDER.indexOf('careerContracts');
  const economyContractsIndex = PRODUCTION_INIT_ORDER.indexOf('economyContracts');
  const replayIndex = PRODUCTION_INIT_ORDER.indexOf('postEndingReplay');
  assert.ok(missionsIndex >= 0 && careerContractsIndex > missionsIndex,
    'career contracts initialize after missions');
  assert.ok(economyContractsIndex > careerContractsIndex && replayIndex > economyContractsIndex,
    'post-ending replay initializes after the contract authority systems');
  const source = readFileSync(new URL('../src/systems/postEndingReplay.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Math\.random|Date\.now|\.\.\/ui\/|\.\.\/render\/|\.\.\/audio\//);
  assert.doesNotMatch(source, /economy:grantCredits|player\.credits\s*=|cargo\.items\s*=|\.rep\s*=/);
});
