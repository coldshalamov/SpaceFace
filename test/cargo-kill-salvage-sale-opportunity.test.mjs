// PQ-209.01 — one cargo-ship kill, then salvage, then a sale, then one new opportunity.
// Fixed seed, seconds, real economy + missions owners. The opportunity is a salvage contract
// opened by the destination price move. It is not a fine, a lock, or a failed mission.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { lootShards } from '../src/systems/lootShards.js';
import { mining } from '../src/systems/mining.js';
import { missions } from '../src/systems/missions.js';

const SEED = 20901;
const SECTOR_ID = 'sector_helios_prime';
const SALE_STATION = 'station_helios';
const DEST_STATION = 'station_ceres';
const COMMODITY = 'cmdty_food';

const FLAG_PRIOR = {
  enabled: MASSLINE2_FLAGS.enabled,
  lootShards: MASSLINE2_FLAGS.lootShards,
};

function enableLootFlags() {
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.lootShards = true;
}

function restoreLootFlags() {
  MASSLINE2_FLAGS.enabled = FLAG_PRIOR.enabled;
  MASSLINE2_FLAGS.lootShards = FLAG_PRIOR.lootShards;
}

function runChain(seed) {
  enableLootFlags();
  const sim = createSimulation({
    seed,
    systems: [lootShards, mining, cargo, economy, missions],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.simTime = 40;
  state.world.currentSectorId = SECTOR_ID;
  state.player.credits = 500;
  state.player.heat = 0;
  state.player.cargo = {
    items: {}, usedVolume: 0, usedMass: 0, capVolume: 80, capMass: 80,
  };

  const failed = [];
  const fines = [];
  const toasts = [];
  const opportunities = [];
  bus.on('mission:failed', (payload) => failed.push(payload));
  bus.on('law:fineAssessed', (payload) => fines.push(payload));
  bus.on('law:response', (payload) => fines.push(payload));
  bus.on('toast', (payload) => toasts.push(payload));
  bus.on('economy:cargoKillOpportunity', (payload) => opportunities.push(payload));

  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    hull: 200,
    hullMax: 200,
    radius: 6,
  });
  state.playerId = player.id;

  const hauler = sim.spawn({
    type: 'ship',
    team: 2,
    factionId: 'faction_mts',
    pos: { x: 180, z: 40 },
    vel: { x: 4, z: -1 },
    radius: 12,
    mass: 140,
    hull: 40,
    hullMax: 100,
    data: {
      trafficRole: 'hauler',
      role: 'hauler',
      cargoManifest: {
        manifestId: 'fm_chain_hauler',
        freighterKey: 'chain:hauler:0',
        role: 'hauler',
        originStationId: SALE_STATION,
        destStationId: DEST_STATION,
        lines: [{ commodityId: COMMODITY, qty: 6 }],
        totalQty: 6,
      },
    },
  });

  hauler.alive = false;
  bus.emit('entity:killed', {
    id: hauler.id,
    killerId: player.id,
    type: 'ship',
    sectorId: SECTOR_ID,
    pos: { x: hauler.pos.x, z: hauler.pos.z },
    targetHostileToPlayer: false,
  });

  const body = state.entityList.find((entity) => (
    entity && entity.alive !== false && entity.type === 'payload'
    && entity.data && entity.data.sourceVictimId === hauler.id
  ));
  assert.ok(body, 'the killed cargo ship leaves one salvage body');

  player.pos.x = body.pos.x;
  player.pos.z = body.pos.z;
  const collected = sim.registry.get('mining')._collectPayload(body, player);
  assert.equal(collected, true, 'the player salvages the manifest body');
  assert.equal(state.player.cargo.items[COMMODITY], 6, 'salvage lands in the hold');

  const econ = sim.registry.get('economy');
  econ.ensureMarket(SALE_STATION);
  econ.ensureMarket(DEST_STATION);
  const midBefore = state.economy.markets[DEST_STATION][COMMODITY].lastMid;
  const creditsBefore = state.player.credits;
  const sale = econ.execute(SALE_STATION, COMMODITY, 'sell', 6);
  const midAfter = state.economy.markets[DEST_STATION][COMMODITY].lastMid;
  const board = state.missions.boards[SALE_STATION];
  const offers = (board && board.slots || []).filter((offer) => offer && offer.source === 'cargoKillChain');

  return {
    sale,
    creditsBefore,
    creditsAfter: state.player.credits,
    heat: state.player.heat,
    midBefore,
    midAfter,
    opportunities,
    offers,
    failed,
    fines,
    toasts: toasts.filter((toast) => toast && toast.source === 'cargoKillChain'),
    locked: sale && sale.reason,
  };
}

test('a cargo-ship kill, salvage, and sale opens one salvage contract and moves a price', () => {
  try {
    const first = runChain(SEED);
    const second = runChain(SEED);

    assert.equal(first.sale.ok, true, 'the salvaged goods sell through economy.execute');
    assert.notEqual(first.locked, 'mission_cargo_locked');
    assert.ok(first.creditsAfter > first.creditsBefore, 'the sale pays credits');
    assert.equal(first.heat, 0, 'the chain does not write heat');
    assert.equal(first.failed.length, 0, 'no mission fails');
    assert.equal(first.fines.length, 0, 'no fine or law response');

    assert.equal(first.opportunities.length, 1, 'one economy opportunity');
    assert.equal(first.opportunities[0].kind, 'price_move');
    assert.equal(first.opportunities[0].moved, true, 'destination price moves');
    assert.ok(first.midAfter > first.midBefore, `destination mid ${first.midBefore} -> ${first.midAfter}`);
    assert.equal(first.opportunities[0].stationId, DEST_STATION);

    assert.equal(first.offers.length, 1, 'one salvage contract on the sale station board');
    const offer = first.offers[0];
    assert.equal(offer.type, 'salvage_retrieval');
    assert.equal(offer.collateral_cr, 0, 'the contract is not a lock');
    assert.equal(offer.preloadedCargo, false);
    assert.equal(offer.cause.witness, true);
    assert.equal(offer.cause.tag, 'salvage');
    assert.match(first.toasts[0].text, /Salvage contract live/);

    assert.equal(second.offers[0].id, offer.id, 'same seed, same contract');
    assert.equal(second.midAfter, first.midAfter, 'same seed, same price');
    assert.equal(second.opportunities[0].chainId, first.opportunities[0].chainId);

    const other = runChain(SEED + 1);
    assert.notEqual(other.offers[0].id, offer.id, 'a different seed mints a different contract');

    // §22.2 closing seeds: the chain must complete on 4242 and 8008, not just this fixture's seed.
    for (const seed of [4242, 8008]) {
      const run = runChain(seed);
      assert.equal(run.sale.ok, true, `seed ${seed}: salvaged goods sell`);
      assert.equal(run.opportunities.length, 1, `seed ${seed}: one economy opportunity`);
      assert.equal(run.opportunities[0].moved, true, `seed ${seed}: destination price moves`);
      assert.equal(run.offers.length, 1, `seed ${seed}: one salvage contract boards`);
      assert.equal(run.fines.length, 0, `seed ${seed}: no fine`);
      assert.equal(run.failed.length, 0, `seed ${seed}: no failed mission`);
    }
  } finally {
    restoreLootFlags();
  }
});

test('only hulls that can spill a manifest body open chains; custody pods close them', () => {
  enableLootFlags();
  try {
    const sim = createSimulation({
      seed: 4242,
      systems: [lootShards, mining, cargo, economy, missions],
    });
    const { state, bus } = sim;
    state.mode = 'flight';
    state.world.currentSectorId = SECTOR_ID;
    state.player.credits = 500;
    state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 80, capMass: 80 };
    const player = sim.spawn({
      type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
      hull: 200, hullMax: 200, radius: 6,
    });
    state.playerId = player.id;
    const chains = () => (state.economy && state.economy.cargoKillChains) || [];
    const kill = (victim, extra = {}) => {
      victim.alive = false;
      bus.emit('entity:killed', {
        id: victim.id, killerId: player.id, type: 'ship',
        sectorId: SECTOR_ID, pos: { x: victim.pos.x, z: victim.pos.z },
        targetHostileToPlayer: false, ...extra,
      });
    };
    const manifestFor = (manifestId, role) => ({
      manifestId, freighterKey: `${manifestId}:key`, role,
      originStationId: SALE_STATION, destStationId: DEST_STATION,
      lines: [{ commodityId: COMMODITY, qty: 4 }], totalQty: 4,
    });

    // Every manifest-bearing civilian role is a cargo ship: the kill opens a chain and spills
    // a manifest body. This is the freightCausality role set plus the work-stop hulls that
    // load a manifest on the way home.
    const manifestRoles = [
      'hauler', 'courier', 'smuggler', 'express', 'shuttle', 'tug', 'arclight', 'tanker',
      'ore_carrier', 'miner', 'salvor',
    ];
    manifestRoles.forEach((role, i) => {
      const victim = sim.spawn({
        type: 'ship', team: 2, factionId: 'faction_dmc',
        pos: { x: 50 + i * 10, z: 50 }, vel: { x: 0, z: 0 },
        radius: 14, hull: 60, hullMax: 60,
        data: { trafficRole: role, role, cargoManifest: manifestFor(`fm_${role}`, role) },
      });
      kill(victim);
      // Chains cap at CARGO_KILL_CHAIN_CAP (4) with oldest evicted — each kill still opens one.
      assert.equal(chains().length, Math.min(i + 1, 4), `a laden ${role} opens a chain`);
      assert.ok(chains().some((c) => c.victimId === victim.id && !c.closed),
        `the ${role} chain is recorded`);
      assert.ok(state.entityList.find((e) => e && e.type === 'payload'
        && e.data && e.data.sourceVictimId === victim.id), `${role} spills its manifest body`);
    });

    // An authored convoy carrier is custody-owned: no manifest payload spawns, but the chain
    // opens and the custody pod it actually spills must close it.
    const convoy = sim.spawn({
      type: 'ship', team: 2, factionId: 'faction_mts', pos: { x: 60, z: 60 }, vel: { x: 0, z: 0 },
      radius: 12, hull: 60, hullMax: 60,
      data: {
        role: 'hauler', cargoManifest: manifestFor('fm_convoy', 'hauler'),
        freightCustody: { status: 'carrier', custodyId: 'fm_convoy:custody:convoy:0' },
      },
    });
    kill(convoy);
    assert.ok(chains().some((c) => c.manifestId === 'fm_convoy' && !c.closed),
      'a convoy carrier opens a chain');
    assert.ok(!state.entityList.find((e) => e && e.type === 'payload'
      && e.data && e.data.sourceVictimId === convoy.id), 'custody hulls do not spill manifest payloads');
    const pod = sim.spawn({
      type: 'pickup', pos: { x: 62, z: 62 }, vel: { x: 0, z: 0 }, radius: 5, hull: 1, hullMax: 1,
      data: {
        kind: 'cargo', commodityId: COMMODITY, amount: 3,
        freightCustodyPod: { manifestId: 'fm_convoy', custodyId: 'fm_convoy:custody:convoy:0', qty: 3 },
      },
    });
    bus.emit('pickup:collected', {
      pickupId: pod.id, collectorId: player.id,
      commodityId: COMMODITY, amount: 3, acceptedAmount: 3,
    });
    const convoyChain = chains().find((c) => c.manifestId === 'fm_convoy');
    assert.equal(convoyChain.salvaged[COMMODITY], 3, 'the custody pod credits the chain');

    // A player-hostile hull carrying a manifest spills shards, not a manifest body — no chain.
    const raider = sim.spawn({
      type: 'ship', team: 1, factionId: 'faction_reach', pos: { x: 70, z: 70 }, vel: { x: 0, z: 0 },
      radius: 8, hull: 60, hullMax: 60,
      data: { role: 'hauler', cargoManifest: manifestFor('fm_raider', 'hauler') },
    });
    kill(raider, { targetHostileToPlayer: true });
    assert.ok(!chains().some((c) => c.victimId === raider.id),
      'a hostile manifest hull cannot open a chain');

    // A mission-owned hull's rewards belong to the contract — no chain.
    const contracted = sim.spawn({
      type: 'ship', team: 2, factionId: 'faction_mts', pos: { x: 80, z: 80 }, vel: { x: 0, z: 0 },
      radius: 12, hull: 60, hullMax: 60,
      data: { role: 'hauler', missionId: 'm_test', cargoManifest: manifestFor('fm_mission', 'hauler') },
    });
    kill(contracted);
    assert.ok(!chains().some((c) => c.victimId === contracted.id),
      'a mission-owned hull cannot open a chain');
  } finally {
    restoreLootFlags();
  }
});
