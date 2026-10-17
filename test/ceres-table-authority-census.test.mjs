import assert from 'node:assert/strict';
import test from 'node:test';

import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { getNodeSystemFactoryTable } from '../src/runtime/nodeSystemFactoryTable.js';
import {
  applyFeatureConfigToMaps,
  restoreFeatureMaps,
  snapshotFeatureMaps,
} from '../src/data/featureFlags.js';
import { RESIDENCY_TIER } from '../src/data/sectorCoordinates.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { stuntGrammar } from '../src/systems/stuntGrammar.js';
import {
  PROOF_SECTOR_ID,
  PROOF_REFINERY_POCKET_ID,
  PROOF_PLAYER_HULL_ID,
  PROOF_SHOVE_WEAPON_ID,
  pocketEntryGlobal,
} from '../src/testing/lab/proofSixtySeconds.js';

const SEED = 14920;
const WARM_TICKS = 240;
const SAMPLE_TICKS = 240;

// ---------------------------------------------------------------------------------------------
// The quiet Ceres census is a WRITTEN BUDGET, not one number (D191, 2026-10-15).
//
// History: this test used to pin one total ("< 100"), re-pinned for authored growth on 2026-10-03
// (D138: 61 -> 76 -> 85). The seed-14920 refinery pocket now holds 114 live entities. D191 asked
// whether that is a defect. Evidence (entity dump, every one of the 114 attributed below):
//   * 85 are FULL-tier Ceres entities (data.sectorId === Ceres) - authored sector content;
//   * 13 carry no sector tag - transient pocket occupants (the player, a running DMC fleeing-trader
//     encounter with its terrain anchors, kill-machine anvil rocks, salvage sort cores);
//   * 16 are REDUCED-tier neighbour residents (Helios Prime 7, Pallas Drift 9): the M2a residency
//     plan keeps the stations, gates and rocks of adjacent sectors materialized 10-17k WU from
//     the pocket, so they sit in the same list but are not part of the Ceres pocket itself.
// No worldRecordId is duplicated and every FULL Ceres entity is within ~5.6k WU of the player.
// The invisible Second Measure bodies are not waste either (checked on the live entities): the 5
// collision-envelope wrecks are collides:true static physicsBody colliders at mass 1e9 (_noMesh
// only hides the mesh), and the 3 clamp components are mesh-less but targetable brace/release
// points (worldSiteTargetable). So the number is authored content the old pin predates; the pin
// becomes the budget below.
//
// HOW TO UPDATE: when authored content legitimately grows the pocket, raise the matching row's
// `max`, and extend its `from` text with what was added (name the content, not just the count).
// A class with no row has a budget of zero, so a brand-new kind of entity fails loudly here
// instead of silently inflating the combat list. Budgets are ceilings (`<=`), so removing
// content never breaks this test.
//
// Residency groups: FULL = data.sectorId (or homeSectorId) is the Ceres sector; REDUCED = a
// neighbour sector at RESIDENCY_TIER.REDUCED; UNTAGGED = no sector tag at all; STRAY = tagged
// with a sector the residency plan does NOT keep live (always a leak, budget zero).
const CENSUS_BUDGET = Object.freeze({
  FULL: {
    ship: { max: 16, from: '3 resident NPCs (wr_npc), 8 ambient convoy ships (3 haulers, ore carrier, surveyor, escort, salvor, patrol), 1 convoy yard tug, 1 closed-refinery scavenger, the Tally-3 claim assessor, Red Kite, 1 wreck-field scavenger (D207: now sector-tagged at spawn instead of untagged)' },
    station: { max: 6, from: 'Ceres Refinery, Belt Outpost, and the 4 sector gates (Helios Prime, Tethys Junction, Pallas Drift, Hyperion Cut)' },
    asteroid: { max: 11, from: 'the geology/activity set on fields f_ceres_1, f_ceres_2, f_ceres_3 (the other ~320 rocks live in asteroidField), 3 kill-machine anvil rocks + 2 encounter terrain-anchor rocks (D207: now sector-tagged at spawn instead of untagged)' },
    fx: { max: 21, from: '8 authored POI markers (Abandoned Driller, Refinery Flare Rack, Inbound Weigh Pin, Throughline Weigh Beacon, 3 Kettle Line, Rookery Prospect), 5 place-dressing pieces (Throughline Distress Beacon, Disabled Refinery Client, Throughline Bait Wreck, Cathedral Grave Shard, Refinery Cargo Staging Pod), 3 world-site roots (Cinder Sluice, Second Measure, Wreck Cathedral), 4 spectrum landmarks (reflector, relay, gallery rock, beacon), 1 reactive-matter crane' },
    wreck: { max: 14, from: 'The Long Berth one-off, Second Measure shipbreak (3 mesh-less targetable clamp components + 5 invisible solid collision-envelope colliders + 3 released payload wrecks = 11), Ceres Refinery Tender, 1 debris wreck' },
    fauna: { max: 12, from: 'closed_refinery fauna cast (11 scavengers + 1 sessile)' },
    payload: { max: 9, from: '4 reactive-matter payloads (iron, spar, spring, fuel), 1 yard tug lot, 1 Tally-3 claim crate, 3 salvage-sort cores (D207: now sector-tagged at spawn instead of untagged)' },
    poi: { max: 4, from: 'Red Kite course marks (timing buoy + 3 gates)' },
    mine: { max: 1, from: '1 closed-refinery salvage-field mine' },
  },
  UNTAGGED: {
    ship: { max: 5, from: 'the player, 1 sling-ring approach hauler, 2 DMC fleeing-trader encounter ships (the wreck-field scavenger moved to FULL in D207 - it is sector-tagged at spawn now)' },
    asteroid: { max: 5, from: 'transient encounter leftovers only (the kill-machine anvils and terrain anchors moved to FULL in D207 - they are sector-tagged at spawn now)' },
    payload: { max: 3, from: '1 scavenger-squatter payload (the salvage-sort cores moved to FULL in D207 - they are sector-tagged at spawn now)' },
  },
  REDUCED: {
    station: { max: 11, from: 'Helios Prime (Helios Station, Coalition HQ, 3 gates) + Pallas Drift (Drift Market, Smuggler Den, 4 gates)' },
    asteroid: { max: 5, from: 'Helios Prime 2 + Pallas Drift 3 field rocks' },
  },
  STRAY: {},
});

// Entities that belong to an authored world site (data.worldSiteId), by site. A new authored site
// that puts bodies in the quiet pocket must be added here with its attribution, or it fails.
const WORLD_SITE_BUDGET = Object.freeze({
  world_site_ceres_cinder_sluice: { max: 1, from: 'Cinder Sluice root marker (its reactive-matter payloads are budgeted under FULL payload)' },
  world_site_ceres_second_measure: { max: 12, from: 'Second Measure shipbreak: root + 3 mesh-less targetable clamp components + 5 invisible solid collision-envelope colliders + 3 released payload wrecks' },
  world_site_wreck_cathedral: { max: 1, from: 'Wreck Cathedral root marker' },
});

// Host-normalized tick cost. The sim tick is wall-clock, so an absolute millisecond pin only
// measures how busy this machine is (the same build reads 10 ms or 14 ms minutes apart). Each
// sampled tick is therefore paired with a fixed integer spin timed immediately after it, in the
// same process under the same load; the median tick/spin ratio, divided by the live entity
// count, is the cost per entity in host-neutral units. Host load moves the tick and its paired
// spin together; a real per-entity regression moves only the tick.
// Measured 2026-10-15 on the 114-entity census over four runs while tick p50 swung 12-19 ms with
// host load: 0.208-0.245 paired spins per entity (+-9%). The ceiling is ~3x that, so it trips on
// a real per-entity regression and not on a busy machine.
const PAIR_SPIN_ITERATIONS = 200_000;
const TICK_SPIN_PER_ENTITY_CEILING = 0.7;

let spinSink = 0;
function spinMs(iterations) {
  const t0 = performance.now();
  let acc = 0x9e3779b9 | 0;
  for (let i = 0; i < iterations; i++) acc = (Math.imul(acc ^ (acc >>> 15), 0x2c1b3c6d) + i) | 0;
  spinSink ^= acc;
  return performance.now() - t0;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[i];
}

function residencyOf(entity, residentSectors) {
  const d = entity.data || {};
  const sector = d.sectorId || d.homeSectorId || entity.homeSectorId || null;
  if (!sector) return 'UNTAGGED';
  if (sector === PROOF_SECTOR_ID) return 'FULL';
  const tier = residentSectors && residentSectors[sector] && residentSectors[sector].tier;
  return tier === RESIDENCY_TIER.REDUCED ? 'REDUCED' : 'STRAY';
}

function censusMatrix(list, residentSectors) {
  const matrix = { FULL: {}, UNTAGGED: {}, REDUCED: {}, STRAY: {} };
  const reducedBySector = {};
  for (const e of list) {
    const group = residencyOf(e, residentSectors);
    const type = e.type || 'unknown';
    matrix[group][type] = (matrix[group][type] || 0) + 1;
    if (group === 'REDUCED') {
      const d = e.data || {};
      const sector = d.sectorId || d.homeSectorId || e.homeSectorId;
      reducedBySector[sector] = (reducedBySector[sector] || 0) + 1;
    }
  }
  return { matrix, reducedBySector };
}

const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);

test('quiet Ceres refinery pocket stays inside its written census budget', async () => {
  const table = getNodeSystemFactoryTable({ tacticalAI: true, flightBackend: 'v3' });
  if (!table.get('stuntGrammar')) table.set('stuntGrammar', stuntGrammar);
  const runtime = createAuthoritativeRuntime({
    profileId: 'production',
    nodeSafeOnly: true,
    seed: SEED,
    systemLookup: table,
    slots: {
      aiSlot: table.get('aiSlot'),
      flightSlot: table.get('flightSlot'),
      aiBackend: 'sg06-tactical',
      flightBackend: 'v3',
    },
  });
  const state = runtime.state;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.aiBackend = 'sg06-tactical';
  if (!state.input.actions) state.input.actions = { brake: false, autopursuit: false };

  const player = runtime.spawn(makeShipEntitySpec(PROOF_PLAYER_HULL_ID, {
    isPlayer: true,
    player: state.player,
    pos: { x: 0, z: 0 },
    fittings: [PROOF_SHOVE_WEAPON_ID],
    factionId: 'faction_free',
  }));
  state.playerId = player.id;

  const world = runtime.getSystem('world');
  world.enterSector(PROOF_SECTOR_ID);
  const at = pocketEntryGlobal(PROOF_REFINERY_POCKET_ID);
  world.relocatePlayerInSector({ x: at.x, z: at.z, heading: 0 }, { reason: 'table-authority-census' });
  player.vel.x = 0;
  player.vel.z = 0;

  const physics = runtime.getSystem('physics');
  const prevFeatures = snapshotFeatureMaps();
  applyFeatureConfigToMaps(runtime && runtime.config && runtime.config.features);
  const ready = await physics.prepareBackend(state, { reset: true });
  restoreFeatureMaps(prevFeatures);
  assert.equal(ready, true, 'Rapier backend must come up');

  for (let i = 0; i < WARM_TICKS; i++) runtime.step(1 / 60);

  const live = (state.entityList || []).filter((e) => e && e.alive !== false);
  for (let i = 0; i < 20; i++) spinMs(PAIR_SPIN_ITERATIONS); // warm the spin before pairing
  const samples = [];
  const pairRatios = [];
  const pairSpins = [];
  for (let i = 0; i < SAMPLE_TICKS; i++) {
    const t0 = performance.now();
    runtime.step(1 / 60);
    const tickMs = performance.now() - t0;
    const spin = spinMs(PAIR_SPIN_ITERATIONS);
    samples.push(tickMs);
    pairSpins.push(spin);
    pairRatios.push(tickMs / spin);
  }
  samples.sort((a, b) => a - b);
  pairRatios.sort((a, b) => a - b);
  pairSpins.sort((a, b) => a - b);

  const after = (state.entityList || []).filter((e) => e && e.alive !== false);
  // Optic-structure lattice cells are authored set-piece colliders, not combat-list members -
  // the gameplay census counts around them and reports them separately.
  const gameplay = after.filter((e) => !(e.data && e.data.opticStructureId));
  const opticCells = after.length - gameplay.length;
  const field = state.world && state.world.asteroidField;
  const far = state.world && state.world.farActors;
  const dressing = state.world && state.world.dressing;
  const fieldRocks = field && field.rocks ? field.rocks.length : 0;
  const farRows = far && far.rows ? far.rows.length : 0;
  const dressingRows = dressing && dressing.rows ? dressing.rows.length : 0;
  const residentSectors = (state.world && state.world.residentSectors) || {};
  const { matrix, reducedBySector } = censusMatrix(gameplay, residentSectors);
  const groupTotals = {};
  for (const g of Object.keys(matrix)) groupTotals[g] = sum(matrix[g]);
  const bySite = {};
  for (const e of gameplay) {
    const id = e.data && e.data.worldSiteId;
    if (id) bySite[id] = (bySite[id] || 0) + 1;
  }
  const p50 = percentile(samples, 0.5);
  const p95 = percentile(samples, 0.95);
  const medianTickPerSpin = percentile(pairRatios, 0.5);
  const spinPerEntity = medianTickPerSpin / gameplay.length;

  // Budget table, one line per (residency, type) row: live / budget, then what it is.
  const budgetLines = [];
  for (const group of Object.keys(matrix)) {
    const types = new Set([...Object.keys(matrix[group]), ...Object.keys(CENSUS_BUDGET[group] || {})]);
    for (const type of [...types].sort()) {
      const row = CENSUS_BUDGET[group] && CENSUS_BUDGET[group][type];
      budgetLines.push(`${group.padEnd(8)} ${type.padEnd(8)} ${String(matrix[group][type] || 0).padStart(3)} / ${String(row ? row.max : 0).padStart(3)}  ${row ? row.from : '(no budget row)'}`);
    }
  }
  const report = {
    seed: SEED,
    sector: PROOF_SECTOR_ID,
    pocket: PROOF_REFINERY_POCKET_ID,
    entityList: after.length,
    gameplayList: gameplay.length,
    opticCells,
    residency: groupTotals,
    reducedBySector,
    byResidencyAndType: matrix,
    worldSiteEntities: bySite,
    asteroidFieldRocks: fieldRocks,
    farActorRows: farRows,
    dressingRows,
    tick: {
      p50Ms: p50,
      p95Ms: p95,
      maxMs: samples[samples.length - 1],
      pairedSpinMedianMs: percentile(pairSpins, 0.5),
      medianTickPerSpin,
      spinUnitsPerEntityTick: spinPerEntity,
    },
  };
  console.log(JSON.stringify(report, null, 2));
  console.log(`CERES CENSUS BUDGET (live / budget)\n${budgetLines.join('\n')}`);

  // The residency plan must have kept Ceres FULL; the budget groups mean nothing otherwise.
  assert.equal(
    residentSectors[PROOF_SECTOR_ID] && residentSectors[PROOF_SECTOR_ID].tier,
    RESIDENCY_TIER.FULL,
    'Ceres must be the FULL-tier resident of its own pocket census',
  );

  // The written budget: every (residency, type) class stays at or under its attributed row.
  const overBudget = [];
  for (const group of Object.keys(matrix)) {
    for (const [type, n] of Object.entries(matrix[group])) {
      const row = CENSUS_BUDGET[group] && CENSUS_BUDGET[group][type];
      const max = row ? row.max : 0;
      if (n > max) {
        overBudget.push(`${group} ${type}: ${n} live > budget ${max} (${row ? row.from : 'no row - new class of entity, name its content'})`);
      }
    }
  }
  assert.equal(
    overBudget.length,
    0,
    `quiet Ceres pocket grew past its written census budget (CENSUS_BUDGET above); name the new authored content and raise the row:\n  ${overBudget.join('\n  ')}`,
  );

  // A new authored world site must announce itself: unknown site id = budget zero.
  const siteOver = [];
  for (const [siteId, n] of Object.entries(bySite)) {
    const row = WORLD_SITE_BUDGET[siteId];
    const max = row ? row.max : 0;
    if (n > max) {
      siteOver.push(`${siteId}: ${n} live > budget ${max} (${row ? row.from : 'unlisted site - add it to WORLD_SITE_BUDGET with its attribution'})`);
    }
  }
  assert.equal(siteOver.length, 0, `world site(s) added bodies to the quiet Ceres pocket without a budget row:\n  ${siteOver.join('\n  ')}`);

  // Authored content must stay single-instance: a duplicated durable record is a real defect.
  const seenRecords = new Map();
  const duplicates = [];
  for (const e of gameplay) {
    const rid = e.data && e.data.worldRecordId;
    if (!rid) continue;
    if (seenRecords.has(rid)) duplicates.push(`${rid} (entities ${seenRecords.get(rid)} and ${e.id})`);
    else seenRecords.set(rid, e.id);
  }
  assert.equal(duplicates.length, 0, `live entities share a worldRecordId: ${duplicates.join(', ')}`);

  assert.ok(after.length <= live.length + 8, 'warm list should not balloon during the sample');
  assert.ok(fieldRocks > 200, `rocks belong in asteroidField, got ${fieldRocks}`);
  assert.ok(farRows >= 10, `dormant traffic/wrecks belong in farActors, got ${farRows}`);
  assert.ok(dressingRows > 20, `POI/dressing rows should sit off the list, got ${dressingRows}`);

  // Per-entity tick cost, normalized by the host (see TICK_SPIN_PER_ENTITY_CEILING). Not an
  // absolute-millisecond claim: it fails only when the tick gets relatively dearer per entity.
  assert.ok(
    spinPerEntity < TICK_SPIN_PER_ENTITY_CEILING,
    `headless tick cost per entity must stay flat: ${spinPerEntity.toFixed(5)} spin-units/entity (ceiling ${TICK_SPIN_PER_ENTITY_CEILING}); median tick is ${medianTickPerSpin.toFixed(2)} paired spins over ${gameplay.length} entities (p50 ${p50} ms)`,
  );
  runtime.dispose?.();
});
