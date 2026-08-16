import test from 'node:test';
import assert from 'node:assert/strict';

import { buildNewGamePlusOverlay } from '../src/core/newGamePlus.js';
import { createSimulation } from '../src/core/sim.js';
import {
  CAPSTONE_REWARD,
  SEEDED_LEADERBOARD_LIMIT,
  readSeededLeaderboard,
} from '../src/data/endgameReplay.js';
import { save } from '../src/save/saveSystem.js';
import { cargo } from '../src/systems/cargo.js';
import { claims } from '../src/systems/claims.js';
import { economy } from '../src/systems/economy.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { endgameReplay } from '../src/systems/endgameReplay.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { story } from '../src/systems/story.js';

const ASHFALL = 'sector_ashfall_reach';
const IO_REACH = 'sector_io_reach';

function memoryStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
  };
}

function withStorage(fn) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = memoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try { return fn(storage); }
  finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
}

function bootReplay(seed = 0x570057, options = {}) {
  const systems = [economy, cargo, story, encounterDirector, endgameReplay];
  if (options.save === true) systems.push(save);
  const sim = createSimulation({ seed, systems });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = options.sectorId || ASHFALL;
  state.onboarding = { active: false, finished: true };
  const player = sim.spawn(makeShipEntitySpec('ship_kestrel', {
    team: 0,
    factionId: 'faction_free',
    isPlayer: true,
    player: state.player,
    pos: { x: 0, z: 0 },
  }));
  state.playerId = player.id;
  bus.emit('game:started', { seededRun: options.seededRun === true });
  const replay = sim.registry.get('endgameReplay');
  replay.activate();
  return { sim, state, bus, player, replay, director: sim.registry.get('encounterDirector') };
}

function enter(route, sectorId) {
  route.state.world.currentSectorId = sectorId;
  route.bus.emit('sector:enter', { sectorId });
}

function liveFor(route, encounterId) {
  const live = route.state.encounterDirector.live[encounterId];
  assert.ok(live, `missing live encounter ${encounterId}`);
  return live;
}

function liveEntities(route, live) {
  return live.ids.map((id) => route.state.entities.get(id)).filter(Boolean);
}

function claimBody(raidsRepelled = 0) {
  return {
    id: 'claim_plan57_factory',
    sectorId: IO_REACH,
    poiId: 'poi_claim_plan57_factory',
    name: 'Plan 57 Foundry',
    size: 'M',
    slots: 3,
    modules: ['mod_refinery'],
    linkedStationId: null,
    x: 200,
    z: -120,
    claimedAt: 100,
    spec: {
      id: 'spec_refinery',
      since: 100,
      status: 'active',
      statusUntil: 0,
      store: { input: { cmdty_ore_iron: 100 }, output: {} },
      convoy: null,
      acc: 0,
      nextDispatchAt: 0,
      destStationId: null,
      upkeepDebt: 0,
      deterrenceUntil: 0,
      outputFull: false,
      receipts: [],
      defense: null,
      totals: {
        refinedTotalU: 0,
        soldTotalCr: 0,
        lostU: 0,
        upkeepPaidCr: 0,
        raidsRepelled,
        raidsSuffered: 0,
      },
    },
  };
}

test('two-sector challenge uses physical authored encounters, real rewards, one reroll, and fails closed', () => {
  const route = bootReplay();
  try {
    const creditReceipts = [];
    const cargoReceipts = [];
    route.bus.on('credits:changed', (payload) => creditReceipts.push(structuredClone(payload)));
    route.bus.on('story:persistentCargoAwarded', (payload) => cargoReceipts.push(structuredClone(payload)));
    const creditsBefore = route.state.player.credits;

    for (const sectorId of [ASHFALL, 'sector_phoebe_echo']) {
      enter(route, sectorId);
      const progress = route.state.player.endgameReplay.challenges[sectorId];
      assert.equal(progress.status, 'active');
      assert.equal(progress.pendingEncounterIds.length, 2, `${sectorId} admits specialist plus elite`);
      for (const encounterId of progress.pendingEncounterIds.slice()) {
        const live = liveFor(route, encounterId);
        assert.equal(live.sectorId, sectorId);
        assert.ok(live.ids.length >= 2, `${live.shapeId} has a physical squad`);
        assert.ok(liveEntities(route, live).every((entity) => (
          entity.type === 'ship' && Number.isFinite(entity.pos.x) && Number.isFinite(entity.pos.z)
        )));
        route.director.resolve(live, 'cleared', { speak: false });
      }
      assert.equal(progress.status, 'completed');
    }

    assert.equal(route.state.player.credits, creditsBefore + CAPSTONE_REWARD.credits * 2);
    assert.deepEqual(creditReceipts.map((row) => row.reason), [
      'endgame_challenge:challenge_ashfall_gauntlet',
      'endgame_challenge:challenge_phoebe_crucible',
    ]);
    assert.equal(route.state.player.cargo.items[CAPSTONE_REWARD.cargoId], 2);
    assert.ok(route.state.story.persistentCargo.includes(CAPSTONE_REWARD.cargoId));
    assert.equal(cargoReceipts.length, 2);

    enter(route, ASHFALL);
    const beforeRerollRewardCount = route.state.player.endgameReplay.challenges[ASHFALL].rewardCount;
    const rerolled = route.replay.rerollChallenge(ASHFALL);
    assert.equal(rerolled.roll, 1, 'the focused route performs exactly one bounded reroll');
    const rerolledProgress = route.state.player.endgameReplay.challenges[ASHFALL];
    assert.equal(rerolledProgress.status, 'active');
    assert.equal(rerolledProgress.pendingEncounterIds.length, 2);
    assert.ok(rerolledProgress.pendingEncounterIds.every((id) => id.includes(':r1:')));

    const fled = liveFor(route, rerolledProgress.pendingEncounterIds[0]);
    route.director.resolve(fled, 'escaped', { speak: false });
    assert.equal(rerolledProgress.status, 'ready', 'fled challenge remains retryable');
    assert.deepEqual(rerolledProgress.pendingEncounterIds, []);
    assert.equal(rerolledProgress.rewardCount, beforeRerollRewardCount);
    assert.equal(route.state.player.credits, creditsBefore + CAPSTONE_REWARD.credits * 2);
    assert.equal(route.state.player.cargo.items[CAPSTONE_REWARD.cargoId], 2);
    assert.equal(Object.keys(route.state.encounterDirector.live)
      .some((id) => id.includes('challenge_ashfall_gauntlet:r1')), false,
    'the sibling fight is aborted when the composed challenge fails');
  } finally {
    route.sim.dispose();
  }
});

test('three legendary rumors materialize the hulk, ace crews, and three gold wings; aborts do not pay', () => {
  const route = bootReplay(0x570058, { sectorId: 'sector_sedna_dark' });
  try {
    const creditsBefore = route.state.player.credits;
    enter(route, 'sector_sedna_dark');
    let progress = route.state.player.endgameReplay.hunts.legendary_capital_hulk;
    let live = liveFor(route, progress.encounterId);
    const hulkRoles = live.ids.map((id) => live.roles[id]);
    assert.deepEqual(hulkRoles.sort(), [
      'capital_hulk_screen', 'capital_hulk_screen', 'legendary_capital_hulk',
    ]);
    assert.ok(liveEntities(route, live).every((entity) => entity.data.ai.passive !== true));
    route.director.abort(live, 'fixture_departure');
    assert.equal(progress.status, 'rumored');
    assert.equal(route.state.player.credits, creditsBefore, 'aborted legendary contact pays nothing');

    enter(route, 'sector_sedna_dark');
    progress = route.state.player.endgameReplay.hunts.legendary_capital_hulk;
    live = liveFor(route, progress.encounterId);
    const hulkId = live.ids.find((id) => live.roles[id] === 'legendary_capital_hulk');
    route.state.entities.get(hulkId).alive = false;
    route.bus.emit('entity:killed', { id: hulkId, killerId: route.player.id });
    assert.equal(progress.status, 'completed');

    enter(route, 'sector_orcus_shadow');
    progress = route.state.player.endgameReplay.hunts.legendary_ace_crew;
    live = liveFor(route, progress.encounterId);
    const aceRoles = live.ids.map((id) => live.roles[id]);
    assert.equal(aceRoles.filter((role) => role === 'rendezvous_ace').length, 2);
    assert.equal(aceRoles.filter((role) => role === 'rendezvous_crew').length, 2);
    for (const aceId of live.ids.filter((id) => live.roles[id] === 'rendezvous_ace')) {
      route.state.entities.get(aceId).alive = false;
      route.bus.emit('entity:killed', { id: aceId, killerId: route.player.id });
    }
    assert.equal(progress.status, 'completed');

    enter(route, 'sector_haumea_rift');
    progress = route.state.player.endgameReplay.hunts.legendary_gold_wings;
    live = liveFor(route, progress.encounterId);
    const goldRoles = live.ids.map((id) => live.roles[id]);
    for (let wing = 1; wing <= 3; wing++) {
      assert.equal(goldRoles.filter((role) => role === `gold_claimant_wing_${wing}`).length, 1);
      assert.equal(goldRoles.filter((role) => role === `gold_claimant_wing_${wing}_screen`).length, 1);
    }
    const rockId = live.ids.find((id) => live.roles[id] === 'gold_asteroid');
    const rock = route.state.entities.get(rockId);
    rock.alive = false;
    route.bus.emit('asteroid:destroyed', { id: rockId, pos: { ...rock.pos } });
    assert.equal(progress.status, 'completed');
    assert.equal(route.state.player.credits, creditsBefore + 28_000 * 3);
  } finally {
    route.sim.dispose();
  }
});

test('successful factory defenses escalate the next real claim encounter composition', () => {
  const sim = createSimulation({ seed: 0x570059, systems: [spawnBudget, encounterDirector, claims] });
  try {
    const { state } = sim;
    state.mode = 'flight';
    state.world.currentSectorId = IO_REACH;
    state.onboarding = { active: false, finished: true };
    const player = sim.spawn(makeShipEntitySpec('ship_kestrel', {
      team: 0, factionId: 'faction_free', isPlayer: true, player: state.player,
      pos: { x: 200, z: -120 },
    }));
    state.playerId = player.id;
    const body = claimBody(2);
    state.claims = { bodies: [body], meta: { rngSeed: 5, upkeepAccum: 0, raidAccum: 0, nextRaidId: 1 } };
    const claimSystem = sim.registry.get('claims');

    assert.equal(claimSystem.beginRaidDefense(body.id, { attackerCount: 5 }), true);
    claimSystem._tickRaidDefenses([body], state);
    assert.equal(body.spec.defense.qualityTier, 2);
    let live = state.encounterDirector.live[body.spec.defense.encounterId];
    assert.ok(live);
    const tier2 = liveEntities({ state }, live).map((entity) => entity.data.lootTableId);
    assert.deepEqual(tier2, [
      'heavy_gunship', 'hostile_repair_tender', 'corsair_raider', 'hostile_interceptor', 'heavy_gunship',
    ]);
    for (const id of live.ids) state.entities.get(id).alive = false;
    sim.runTicks(301);
    assert.equal(body.spec.totals.raidsRepelled, 3);
    assert.equal(body.spec.defense, null);

    assert.equal(claimSystem.beginRaidDefense(body.id, { attackerCount: 5 }), true);
    claimSystem._tickRaidDefenses([body], state);
    assert.equal(body.spec.defense.qualityTier, 3);
    live = state.encounterDirector.live[body.spec.defense.encounterId];
    assert.ok(live);
    assert.deepEqual(liveEntities({ state }, live).map((entity) => entity.data.lootTableId), [
      'heavy_carrier_lite', 'field_anchor_controller', 'jammer_specialist', 'corsair_raider', 'hostile_interceptor',
    ]);
  } finally {
    sim.dispose();
  }
});

function seededProductionFingerprint(seed, options = {}) {
  const route = bootReplay(seed, { seededRun: true, save: options.save === true });
  enter(route, ASHFALL);
  const run = route.state.player.endgameReplay.seededRun;
  return { route, fingerprint: { worldHash: run.worldHash, spawnHash: run.spawnHash } };
}

test('fixed-seed production spawns survive Continue and commit one bounded terminal score record', () => {
  withStorage((storage) => {
    const first = seededProductionFingerprint(0x570060, { save: true });
    const twin = seededProductionFingerprint(0x570060);
    try {
      const stableDescriptor = {
        kind: 'fixed-seed-control', sectorId: ASHFALL, count: 3,
        fingerprint: 'same-physical-cast', motiveId: 'same-motive',
      };
      first.route.bus.emit('encounter:spawned', { encounterId: 'timing-derived:41', ...stableDescriptor });
      twin.route.bus.emit('encounter:spawned', { encounterId: 'timing-derived:99', ...stableDescriptor });
      first.fingerprint.spawnHash = first.route.state.player.endgameReplay.seededRun.spawnHash;
      twin.fingerprint.spawnHash = twin.route.state.player.endgameReplay.seededRun.spawnHash;
      assert.deepEqual(first.fingerprint, twin.fingerprint, 'same seed and production route hash identically');
      first.route.bus.emit('mission:completed', { missionId: 'plan57-route' });
      first.route.bus.emit('entity:killed', { id: 'plan57-score', killerId: first.route.player.id });
      first.route.bus.emit('postEndingReplay:cycleCompleted', { cycle: 1 });
      const savedRun = structuredClone(first.route.state.player.endgameReplay.seededRun);
      assert.deepEqual({ score: savedRun.score, chains: savedRun.chains }, { score: 3_850, chains: 1 });

      const saveSystem = first.route.sim.registry.get('save');
      const envelope = saveSystem.serialize('plan57-seeded-continue');
      first.route.state.player.endgameReplay.seededRun.score = 999_999;
      first.route.state.player.endgameReplay.seededRun.spawnTokens.push('corrupt-live-token');
      assert.equal(saveSystem.loadEnvelope(
        JSON.parse(JSON.stringify(envelope)),
        'plan57-seeded-continue',
      ), true);
      const restored = first.route.state.player.endgameReplay.seededRun;
      assert.equal(restored.score, savedRun.score);
      assert.equal(restored.chains, savedRun.chains);
      assert.equal(restored.worldHash, savedRun.worldHash);
      assert.equal(restored.spawnHash, savedRun.spawnHash,
        'Continue rematerialization dedupes stable encounter ids instead of changing the run hash');
      assert.equal(first.route.state.player.endgameReplay.challenges[ASHFALL].status, 'active');

      first.route.bus.emit('player:death', { cause: 'plan57-terminal' });
      first.route.bus.emit('player:death', { cause: 'duplicate-terminal' });
      const rows = readSeededLeaderboard(storage);
      assert.equal(rows.length, 1, 'one terminal event produces one local record');
      assert.ok(rows.length <= SEEDED_LEADERBOARD_LIMIT);
      assert.deepEqual(rows[0], {
        seed: 0x570060,
        worldHash: restored.worldHash,
        spawnHash: restored.spawnHash,
        score: 3_850,
        chains: 1,
        outcome: 'death',
      });
    } finally {
      first.route.sim.dispose();
      twin.route.sim.dispose();
    }
  });
});

test('New Run+ projects bounded codex, cosmetics, deeds, elite toggle, and exactly one keepsake', () => {
  const data = {
    player: {
      moduleInventory: [
        { defId: 'mod_engine_ion_m' },
        { defId: 'mod_market_data_s' },
      ],
      ownedShips: [{
        defId: 'ship_kestrel',
        fittings: ['wpn_pulse_laser_s'],
        appearance: { paintId: 'paint_salvager', decalId: 'decal_tally' },
      }],
    },
    missions: {
      story: {
        beatIndex: 7,
        endgameChoice: 'E',
        endgameResolved: true,
        seenComms: { ending: true },
        graffitiShown: { ashfall: true },
        persistentCargo: [CAPSTONE_REWARD.cargoId],
        flags: { rareSpawns: { history: [{ shapeId: 'legendary_capital_hulk', outcome: 'hulk_silenced' }] } },
        titles: {
          playerDeeds: {
            earnedById: { legend: { id: 'legend', title: 'Hulkbreaker', earnedTick: 57 } },
            order: ['legend'],
            processedReceiptIds: ['plan57:hulk'],
          },
        },
      },
    },
    aceMemory: {},
  };
  const overlay = buildNewGamePlusOverlay(data, {
    keepsakeId: 'mod_engine_ion_m',
    eliteComposition: false,
  });
  assert.equal(overlay.keepsake.defId, 'mod_engine_ion_m');
  assert.equal(Object.hasOwn(overlay, 'keepsakes'), false, 'runtime overlay carries exactly one selected module');
  assert.equal(overlay.eliteComposition, false);
  assert.equal(overlay.codex.endgameChoice, 'E');
  assert.equal(overlay.codex.rareSpawns.history[0].shapeId, 'legendary_capital_hulk');
  assert.equal(overlay.cosmetics.length, 1);
  assert.equal(overlay.cosmetics[0].defId, 'ship_kestrel');
  assert.deepEqual(overlay.titles.playerDeeds.order, ['legend']);
});
