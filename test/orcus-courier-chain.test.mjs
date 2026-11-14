// PR-expansion 958 — Orcus Shadow joins the chain table: "the shelf round".
//
// Orcus is the deliberate hollow rim (trafficPerMin: 0): the four authored hulls are the only
// life — a supply hauler on its Plinth run, the anomaly listener, and the two vault workers.
// The courier schedule existed but was invisible: the hauler looped forever and no observer
// ever learned the schedule existed. The chain stages the catalog's cheapest event across the
// rim's two working hulls so one visit can actually catch the schedule: the supply hull closes
// on the listener's post, threads it, and pulls away toward the dock — and the desk posts the
// honest shelf line either way.
//
// Proved on the default seed 4242 against the live traffic owner, through the same discovery
// readers the rung-sector chain tests use. The worktree carries no catalog JSON, so link
// fidelity is asserted through the chain's own receipts, stamps and job redirects.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { SECTORS } from '../src/data/sectors.js';
import {
  activityActorSlotById,
  activityPocketsForSector,
} from '../src/data/sectorActivityPockets.js';
import {
  ORCUS_CAUSAL_CHAIN,
  ORCUS_SHADOW_SECTOR_ID,
  SECTOR_CAUSAL_CHAIN_DEFS,
} from '../src/data/sectorCausalChains.js';
import { SECTOR_ANCHORS } from '../src/data/sectorAnchors.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { createMarketNews } from '../src/ui/marketNews.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import {
  CERES_CAUSAL_CHAIN_CYCLE_GAP_S,
  CERES_CAUSAL_CHAIN_EVENT,
  CERES_CAUSAL_CHAIN_MAX_CONCURRENT,
  SECTOR_CAUSAL_CHAINS,
  SECTOR_CAUSAL_CHAIN_SCHEMA,
  traffic,
} from '../src/systems/traffic.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { factions } from '../src/systems/factions.js';
import { heat } from '../src/systems/heat.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';

const SEED = 4242;
const ORCUS = ORCUS_SHADOW_SECTOR_ID;
const ORCUS_SLOT_IDS = new Set(activityPocketsForSector(ORCUS)
  .flatMap((pocket) => pocket.actorSlots.map((slot) => slot.id)));

function bootOrcus() {
  const orcusDef = SECTORS.find((sector) => sector.id === ORCUS);
  const systems = [spawnBudget, traffic, cargo, economy, factions, heat, encounterDirector, npcJobsRuntime];
  const sim = createSimulation({ seed: SEED, systems });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = ORCUS;
  for (const station of SECTOR_ANCHORS[ORCUS].stations) {
    sim.spawn({
      type: 'station', team: 2, pos: sectorLocalToGlobalForSector(station.pos, ORCUS),
      radius: 42, mass: 1e6,
      data: { stationId: station.id, name: station.id },
    });
  }
  const player = sim.spawn({
    type: 'ship', team: 0, pos: sectorLocalToGlobalForSector({ x: 0, z: -3200 }, ORCUS),
    vel: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 6,
  });
  state.playerId = player.id;
  state.player.heat = 0;
  state.onboarding = { active: false, finished: true };

  const receipts = [];
  const news = [];
  bus.on(CERES_CAUSAL_CHAIN_EVENT, (payload) => receipts.push(payload));
  bus.on('news:publish', (payload) => news.push(payload));
  const headlines = [];
  bus.on('news:headline', (payload) => headlines.push(payload));
  createMarketNews({ state, bus, helpers: { voice: { say: () => false } } });
  bus.emit('sector:enter', { sectorId: ORCUS, sector: orcusDef });

  const owner = sim.registry.get('traffic');
  const advanceTo = (seconds) => {
    const target = Math.round(seconds * 60);
    const now = Math.round(state.simTime * 60);
    if (target > now) sim.runTicks(target - now);
  };
  const bySlot = (slotId) => state.entityList.find((entity) => entity.alive !== false
    && entity.data && entity.data.activityActorSlotId === slotId) || null;
  const routeIds = (slotId) => {
    const entity = bySlot(slotId);
    const job = entity && entity.data.jobId && state.npcJobs.byId[entity.data.jobId];
    return job ? job.job.route.map((node) => node.id) : null;
  };
  return { sim, state, bus, owner, receipts, news, headlines, advanceTo, bySlot, routeIds, orcusDef };
}

const starts = (receipts) => receipts.filter((r) => r.kind === 'event_start');

test('the Orcus chain is a registered table row: one catalog event, and the rim stays hollow', () => {
  const orcus = SECTOR_CAUSAL_CHAINS.get(ORCUS);
  assert.ok(orcus, 'Orcus has a chain row');
  assert.equal(orcus.chain, ORCUS_CAUSAL_CHAIN);
  assert.equal(orcus.schema, SECTOR_CAUSAL_CHAIN_SCHEMA);
  assert.equal(SECTOR_CAUSAL_CHAIN_DEFS[ORCUS].chain, ORCUS_CAUSAL_CHAIN);
  assert.equal(SECTOR_CAUSAL_CHAIN_DEFS[ORCUS].stationId, 'station_orcus_shadow');
  assert.equal(orcus.maxConcurrent, CERES_CAUSAL_CHAIN_MAX_CONCURRENT);
  assert.equal(orcus.cycleGapS, CERES_CAUSAL_CHAIN_CYCLE_GAP_S);

  const link = ORCUS_CAUSAL_CHAIN[0];
  assert.equal(ORCUS_CAUSAL_CHAIN.length, 1, 'one link — the cycle is the schedule itself');
  assert.equal(link.id, 'ev_courier_overtakes');
  assert.deepEqual(link.actorSlots, ['orcus_supply_hauler', 'orcus_anomaly_listener']);
  for (const slotId of link.actorSlots) {
    assert.ok(ORCUS_SLOT_IDS.has(slotId), `${link.id} binds a real Orcus slot: ${slotId}`);
  }
  // The review's binding: the hauler reaffirms its authored Plinth run (the schedule) except
  // for the overtake window where it physically closes on the listener; the listener is the
  // observer and never leaves its chord.
  const haulerHints = link.jobHints.filter((h) => h.actorSlotId === 'orcus_supply_hauler');
  assert.deepEqual(
    haulerHints.find((h) => h.subjectSlotId === 'orcus_anomaly_listener').phases,
    ['close', 'pass'],
    'the courier closes on the listener for the overtake itself',
  );
  assert.deepEqual(haulerHints.find((h) => h.reaffirm === true).phases, ['pull_away'],
    'and is released back to its schedule');
  const listenerHint = link.jobHints.find((h) => h.actorSlotId === 'orcus_anomaly_listener');
  assert.equal(listenerHint.reaffirm, true, 'the listener only observes');

  // The hollow rim stays hollow: deliberate quiet is a property of the sector, not a chain
  // input — the chain stamps the cast, it never stages ambient traffic.
  const orcusDef = SECTORS.find((sector) => sector.id === ORCUS);
  assert.equal(orcusDef.trafficPerMin, 0, 'trafficPerMin: 0 is the Shadow\'s authored quiet');
});

test('seed 4242: the supply hull threads the listener\'s post, then goes back to its schedule', () => {
  const { receipts, advanceTo, bySlot, routeIds, state } = bootOrcus();
  const stamp = (slotId) => {
    const entity = bySlot(slotId);
    const data = entity && entity.data || {};
    return [data.ceresCausalEventId || null, data.ceresCausalPhase || null, data.ceresCausalCue || null];
  };
  const haulerJobId = bySlot('orcus_supply_hauler').data.jobId;
  const listenerJobId = bySlot('orcus_anomaly_listener').data.jobId;
  assert.ok(haulerJobId && listenerJobId, 'both hulls are job-owned before the beat');

  advanceTo(5);
  assert.deepEqual(starts(receipts).map((r) => r.eventId), ['ev_courier_overtakes'],
    'the round opens the moment the sector arms');
  assert.deepEqual(stamp('orcus_supply_hauler'), ['ev_courier_overtakes', 'close', 'clean_burn']);
  assert.deepEqual(stamp('orcus_anomaly_listener'), ['ev_courier_overtakes', 'close', 'clean_burn']);
  assert.deepEqual(routeIds('orcus_supply_hauler'), [
    'causal:ev_courier_overtakes:origin',
    'causal:ev_courier_overtakes:subject',
  ], 'the courier is closing on the listener, not running its authored leg');
  assert.equal(bySlot('orcus_anomaly_listener').data.jobId, listenerJobId,
    'the listener still holds its anomaly chord');

  advanceTo(12);
  assert.deepEqual(stamp('orcus_supply_hauler'), ['ev_courier_overtakes', 'pass', 'clean_burn']);

  // After the link resolves (~24 s) the courier's lamp clears and its authored job id is the
  // one it started with — the redirect was a loan, not a rewrite.
  advanceTo(30);
  assert.deepEqual(stamp('orcus_supply_hauler'), [null, null, null]);
  assert.deepEqual(stamp('orcus_anomaly_listener'), [null, null, null]);
  assert.equal(bySlot('orcus_supply_hauler').data.jobId, haulerJobId,
    'the hauler got its authored Plinth job back');
  for (const r of receipts) {
    assert.equal(r.sectorId, ORCUS, 'every receipt names Orcus');
    assert.equal(r.schema, SECTOR_CAUSAL_CHAIN_SCHEMA);
    assert.ok(r.activeCount <= CERES_CAUSAL_CHAIN_MAX_CONCURRENT, `cap respected at ${r.simTime}`);
  }
});

test('a stocked cycle posts the one shelf line on the station, then re-arms', () => {
  const { receipts, news, headlines, advanceTo, state } = bootOrcus();
  // One link (~24 s) + the 45 s gap: cycle two starts ~69 s and closes ~93 s; 75 s sits inside.
  advanceTo(75);

  const complete = receipts.find((r) => r.kind === 'cycle_complete');
  assert.ok(complete, 'the one-link cycle resolves with no player input');
  assert.equal(complete.cycle, 1);
  assert.ok(Math.abs(complete.nextEligibleAt - (complete.simTime + CERES_CAUSAL_CHAIN_CYCLE_GAP_S)) < 1e-6);

  const stories = news.filter((p) => p.kind === 'orcus_plinth_round');
  assert.equal(stories.length, 1, 'one cycle, one line');
  assert.equal(stories[0].channelId, 'news');
  assert.equal(stories[0].stationId, 'station_orcus_shadow');
  assert.equal(stories[0].sectorId, ORCUS);
  assert.equal(stories[0].sourceRef, 'traffic:sector-causal-chain');
  assert.equal(stories[0].text,
    'The supply hull threaded its pass on the Plinth round; the Shadow\'s one shelf is stocked.');
  assert.doesNotMatch(stories[0].text, /[a-z]_[a-z]|[a-z][A-Z]/, 'plain words, no internal ids');

  const wired = headlines.filter((h) => h.kind === 'orcus_plinth_round');
  assert.equal(wired.length, 1, 'the ticker surfaces the Orcus line once');
  assert.equal(wired[0].headline, stories[0].text);
  const logged = state.ui.marketNews.log.filter((row) => row.kind === 'orcus_plinth_round');
  assert.equal(logged.length, 1);

  const second = starts(receipts).filter((r) => r.cycle === 1);
  assert.equal(second.length, 1, 'the single link re-arms after the gap');
  assert.equal(second[0].eventId, 'ev_courier_overtakes');
  assert.ok(second[0].simTime - complete.simTime >= CERES_CAUSAL_CHAIN_CYCLE_GAP_S - 1e-6,
    'the gap is the shared 45 s');
});

test('a supply hull lost before the pass posts the honest empty shelf, never a stall', () => {
  const { receipts, news, advanceTo, bySlot, state, owner } = bootOrcus();
  // The hauler dies mid-close: the pass never happened — the shelf-empty line is the honest
  // branch, and the cycle still resolves on the interrupt seeds.
  advanceTo(5);
  const hauler = bySlot('orcus_supply_hauler');
  const recordId = hauler.data.worldRecordId;
  state.world.records = { byId: { [recordId]: { id: recordId, alive: false, outcome: 'destroyed' } } };
  hauler.alive = false;
  advanceTo(90);

  assert.ok(receipts.some((r) => r.kind === 'event_interrupt'
    && r.eventId === 'ev_courier_overtakes'), 'the pass is interrupted, not waited on');
  const seeded = receipts.filter((r) => r.kind === 'seed').flatMap((r) => r.seeded || []);
  assert.ok(seeded.includes('shelf_empty'), 'the honest miss plants instead of the pass');
  assert.ok(receipts.some((r) => r.kind === 'cycle_complete'), 'the cycle still resolves');
  assert.ok(owner.getCeresCausalChainSnapshot().cycle >= 1);

  const story = news.find((p) => p.kind === 'orcus_plinth_round');
  assert.ok(story);
  assert.equal(story.text,
    'No supply hull made the pass on the Plinth round; the Shadow\'s one shelf stays empty.');
});

test('the hollow rim stays hollow: the chain stamps the cast and mints no traffic', () => {
  const { state, advanceTo } = bootOrcus();
  advanceTo(80);
  // The rim's whole life is the four authored hulls plus the sector's own pre-existing ambient
  // courier (the review's "courier schedule exists-but-poor") — the chain binds the authored
  // cast and must mint no extra body and stamp no ambient hull.
  const live = (state.traffic.freighters || []).filter((rec) => {
    const entity = state.entities.get(rec.id);
    return entity && entity.alive !== false;
  });
  const authored = live.filter((rec) => rec.authoredActivityCast === true);
  assert.equal(authored.length, 4, 'the four authored hulls are the chain\'s whole cast');
  for (const rec of live) {
    const entity = state.entities.get(rec.id);
    if (rec.authoredActivityCast === true) {
      assert.ok(rec.activityActorSlotId, 'every authored hull names its slot');
    } else {
      assert.equal(rec.activityActorSlotId || null, null, 'ambient hulls are not authored cast');
      assert.equal(entity.data.ceresCausalEventId || null, null,
        'the chain never stamps an ambient hull');
    }
  }
  assert.equal(
    SECTORS.find((sector) => sector.id === ORCUS).trafficPerMin,
    0,
    'the Shadow still declares its authored quiet',
  );
});
