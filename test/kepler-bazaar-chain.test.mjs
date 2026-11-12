// PR-expansion 957 — Kepler Scar joins the chain table: "the tally day".
//
// The Scar Bazaar flies four authored hulls (sectorActivityPockets.js): a stash runner and a
// Reach picket on the apron, a salvor and a glow reader on the hulk's cut plate. Until this
// row the cast looped forever and the Bazaar's own zone copy — cargo changing hands off the
// books — never moved. The chain strings two catalog events across three of those hulls:
// ev_tug_repositions_cargo (the runner's stash run IS the walk; the salvor's plate is the
// stack) and ev_smuggler_dumps_cache (the same runner sheds one hot piece off the stash leg).
//
// Proved on the default seed 4242 against the live traffic owner, through the same discovery
// readers the rung-sector chain tests use. The worktree carries no catalog JSON, so link
// fidelity to the catalog is asserted through the chain's own receipts and stamps, not the
// file.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { SECTORS } from '../src/data/sectors.js';
import {
  activityActorSlotById,
  activityPocketsForSector,
} from '../src/data/sectorActivityPockets.js';
import {
  KEPLER_CAUSAL_CHAIN,
  KEPLER_SCAR_SECTOR_ID,
  SECTOR_CAUSAL_CHAIN_DEFS,
} from '../src/data/sectorCausalChains.js';
import { SECTOR_ANCHORS } from '../src/data/sectorAnchors.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { isHostileToPlayer } from '../src/systems/scannerReadModel.js';
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
const KEPLER = KEPLER_SCAR_SECTOR_ID;
const KEPLER_SLOT_IDS = new Set(activityPocketsForSector(KEPLER)
  .flatMap((pocket) => pocket.actorSlots.map((slot) => slot.id)));

function bootKepler() {
  const keplerDef = SECTORS.find((sector) => sector.id === KEPLER);
  const systems = [spawnBudget, traffic, cargo, economy, factions, heat, encounterDirector, npcJobsRuntime];
  const sim = createSimulation({ seed: SEED, systems });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = KEPLER;
  // Stations sit where the anchors say, sector-local to global — the same boot the
  // rung-sector chain tests run.
  for (const station of SECTOR_ANCHORS[KEPLER].stations) {
    sim.spawn({
      type: 'station', team: 2, pos: sectorLocalToGlobalForSector(station.pos, KEPLER),
      radius: 42, mass: 1e6,
      data: { stationId: station.id, name: station.id },
    });
  }
  const player = sim.spawn({
    type: 'ship', team: 0, pos: sectorLocalToGlobalForSector({ x: 0, z: -3200 }, KEPLER),
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
  bus.emit('sector:enter', { sectorId: KEPLER, sector: keplerDef });

  const owner = sim.registry.get('traffic');
  const advanceTo = (seconds) => {
    const target = Math.round(seconds * 60);
    const now = Math.round(state.simTime * 60);
    if (target > now) sim.runTicks(target - now);
  };
  const bySlot = (slotId) => state.entityList.find((entity) => entity.alive !== false
    && entity.data && entity.data.activityActorSlotId === slotId) || null;
  return { sim, state, bus, owner, receipts, news, headlines, advanceTo, bySlot, keplerDef };
}

const starts = (receipts) => receipts.filter((r) => r.kind === 'event_start');

test('the Kepler chain is a registered table row: two catalog events, none borrowed from another story', () => {
  const kepler = SECTOR_CAUSAL_CHAINS.get(KEPLER);
  assert.ok(kepler, 'Kepler has a chain row');
  assert.equal(kepler.chain, KEPLER_CAUSAL_CHAIN);
  assert.equal(kepler.schema, SECTOR_CAUSAL_CHAIN_SCHEMA);
  assert.equal(SECTOR_CAUSAL_CHAIN_DEFS[KEPLER].chain, KEPLER_CAUSAL_CHAIN);
  assert.equal(SECTOR_CAUSAL_CHAIN_DEFS[KEPLER].stationId, 'station_kepler_scar');
  assert.equal(kepler.maxConcurrent, CERES_CAUSAL_CHAIN_MAX_CONCURRENT);
  assert.equal(kepler.cycleGapS, CERES_CAUSAL_CHAIN_CYCLE_GAP_S);

  const ids = KEPLER_CAUSAL_CHAIN.map((link) => link.id);
  assert.deepEqual(ids, ['ev_tug_repositions_cargo', 'ev_smuggler_dumps_cache']);
  assert.equal(new Set(ids).size, ids.length, 'unique link ids');
  const taken = new Set(['ev_convoy_forms_up']); // Dione's row stays untouched
  for (const id of ids) assert.equal(taken.has(id), false, `${id} is not another sector's story`);
});

test('the Kepler links ride authored hulls and every hint names a real phase', () => {
  const used = new Set();
  for (const link of KEPLER_CAUSAL_CHAIN) {
    for (const slotId of link.actorSlots) {
      assert.ok(KEPLER_SLOT_IDS.has(slotId), `${link.id} binds a real Kepler slot: ${slotId}`);
      used.add(slotId);
    }
    for (const hint of link.jobHints) {
      assert.ok(link.actorSlots.includes(hint.actorSlotId), `${link.id} hint actor is a link actor`);
      if (hint.subjectSlotId) assert.ok(link.actorSlots.includes(hint.subjectSlotId));
      for (const phaseName of hint.phases) {
        assert.ok(link.phases.some((phase) => phase.name === phaseName), `${link.id} hint phase ${phaseName}`);
      }
    }
    assert.ok(link.phases.some((phase) => phase.name === link.seedAtPhase), `${link.id} seeds at a real phase`);
  }
  assert.deepEqual([...used].sort(), ['kepler_bazaar_runner', 'kepler_hulk_salvor'],
    'the runner and the salvor carry the tally day');

  // The review's binding: the runner's stash run is the reposition walk, the salvor's plate is
  // the stack. Both reaffirm their authored routes — the story is the stamps, not a redirect.
  const tug = KEPLER_CAUSAL_CHAIN[0];
  for (const hint of tug.jobHints) {
    assert.equal(hint.reaffirm, true, `${hint.actorSlotId} reaffirms its authored route`);
  }
  const slot = activityActorSlotById('kepler_bazaar_runner');
  assert.equal(slot.jobKind, 'hauler', 'the runner flies the proven haul kernel');
  const salvor = activityActorSlotById('kepler_hulk_salvor');
  assert.equal(salvor.jobKind, 'salvor', 'the salvor keeps its cut loop');
});

test('seed 4242: entering the Scar stages both links under the cap, phases advancing on simTime', () => {
  const { receipts, advanceTo, owner, bySlot } = bootKepler();
  const stamp = (slotId) => {
    const entity = bySlot(slotId);
    const data = entity && entity.data || {};
    return [data.ceresCausalEventId || null, data.ceresCausalPhase || null, data.ceresCausalCue || null];
  };

  // Both links carry no requires, so the cap admits them together at the arm.
  advanceTo(10);
  assert.deepEqual(
    starts(receipts).map((r) => r.eventId),
    ['ev_tug_repositions_cargo', 'ev_smuggler_dumps_cache'],
    'the two links open in authored order',
  );
  assert.deepEqual(stamp('kepler_hulk_salvor'), ['ev_tug_repositions_cargo', 'line_up', 'stacking'],
    'the salvor holds the stack face under the tug lamp');
  // The runner is shared by both live links; the last stamper owns its lamp.
  assert.deepEqual(stamp('kepler_bazaar_runner'), ['ev_smuggler_dumps_cache', 'drift_out', 'clean_burn'],
    'the shared runner wears the drop arc while the walk proceeds');

  // simTime drives the phases: at t=20 the runner is mid-drop, the salvor has kissed.
  advanceTo(20);
  assert.deepEqual(stamp('kepler_bazaar_runner'), ['ev_smuggler_dumps_cache', 'drop', null]);
  assert.deepEqual(stamp('kepler_hulk_salvor'), ['ev_tug_repositions_cargo', 'kiss', null]);

  // At t=60 the dump resolved (runner re-lit its lamp when the tug re-stamped it at 23).
  advanceTo(60);
  assert.deepEqual(stamp('kepler_bazaar_runner'), ['ev_tug_repositions_cargo', 'set', 'clean_burn']);

  for (const r of receipts) {
    assert.equal(r.sectorId, KEPLER, 'every receipt names Kepler');
    assert.equal(r.schema, SECTOR_CAUSAL_CHAIN_SCHEMA);
    assert.ok(r.activeCount <= CERES_CAUSAL_CHAIN_MAX_CONCURRENT, `cap respected at ${r.simTime}: ${r.activeCount}`);
  }
  assert.ok(receipts.some((r) => r.activeCount === 2), 'the cap is actually used');
  const snap = owner.getCeresCausalChainSnapshot();
  assert.equal(snap.sectorId, KEPLER);
});

test('a Kepler cycle closes with one bazaar news line on the station, then re-arms', () => {
  const { receipts, news, headlines, advanceTo, state } = bootKepler();
  // Cycle one ends at ~63 s and re-arms after the 45 s gap — 120 s sits inside cycle two
  // before it can close (~171 s), so exactly one line exists.
  advanceTo(120);

  const complete = receipts.find((r) => r.kind === 'cycle_complete');
  assert.ok(complete, 'the two-link cycle resolves with no player input');
  assert.equal(complete.cycle, 1);
  assert.ok(Math.abs(complete.nextEligibleAt - (complete.simTime + CERES_CAUSAL_CHAIN_CYCLE_GAP_S)) < 1e-6);

  const stories = news.filter((p) => p.kind === 'kepler_bazaar_tally');
  assert.equal(stories.length, 1, 'one cycle, one line');
  assert.equal(stories[0].channelId, 'news');
  assert.equal(stories[0].stationId, 'station_kepler_scar');
  assert.equal(stories[0].sectorId, KEPLER);
  assert.equal(stories[0].sourceRef, 'traffic:sector-causal-chain');
  assert.equal(stories[0].text,
    'The Scar Bazaar tally logged a walked lot, and the runner left one cache dark off the stash leg.');
  assert.doesNotMatch(stories[0].text, /[a-z]_[a-z]|[a-z][A-Z]/, 'plain words, no internal ids');

  const wired = headlines.filter((h) => h.kind === 'kepler_bazaar_tally');
  assert.equal(wired.length, 1, 'the ticker surfaces the Kepler line once');
  assert.equal(wired[0].headline, stories[0].text);
  const logged = state.ui.marketNews.log.filter((row) => row.kind === 'kepler_bazaar_tally');
  assert.equal(logged.length, 1);

  const second = starts(receipts).filter((r) => r.cycle === 1);
  assert.ok(second.length >= 1, 'the chain re-arms after the gap');
  assert.equal(second[0].eventId, 'ev_tug_repositions_cargo');
  assert.ok(second[0].simTime - complete.simTime >= CERES_CAUSAL_CHAIN_CYCLE_GAP_S - 1e-6,
    'the gap is the shared 45 s');
});

test('a runner lost before the walk degrades through interruptSeeds, never stalls the cycle', () => {
  const { receipts, news, advanceTo, bySlot, state, owner } = bootKepler();
  // The runner dies mid-line-up: the tug link falls back (the walk never happened), the drop
  // link — runner-bound too — skips on the terminal cast and the cycle still closes honest.
  advanceTo(10);
  const runner = bySlot('kepler_bazaar_runner');
  const recordId = runner.data.worldRecordId;
  state.world.records = { byId: { [recordId]: { id: recordId, alive: false, outcome: 'destroyed' } } };
  runner.alive = false;
  advanceTo(160);

  const tug = receipts.filter((r) => r.eventId === 'ev_tug_repositions_cargo');
  assert.ok(tug.some((r) => r.kind === 'event_interrupt'), 'the walk is interrupted, not waited on');
  const drop = receipts.filter((r) => r.eventId === 'ev_smuggler_dumps_cache');
  assert.ok(drop.some((r) => r.kind === 'event_interrupt'), 'the drop is interrupted too');
  const seeded = receipts.filter((r) => r.kind === 'seed').flatMap((r) => r.seeded || []);
  assert.ok(seeded.includes('lot_drifted'), 'the honest miss plants instead of the walk');
  assert.ok(seeded.includes('cache_kept'), 'and the stash kept its cache');
  assert.ok(receipts.some((r) => r.kind === 'cycle_complete'), 'the cycle still resolves');
  assert.ok(owner.getCeresCausalChainSnapshot().cycle >= 1);

  const story = news.find((p) => p.kind === 'kepler_bazaar_tally');
  assert.ok(story);
  // The runner fell before either seed phase, so the line posts the honest empty tally —
  // never a walk or a shed nobody saw.
  assert.equal(story.text,
    'The Scar Bazaar posted an empty tally: no lot walked, no cache shed.');
});

test('hostile standing mints no hostiles: the Reach flag does not arm the authored cast', () => {
  const { state, bySlot, advanceTo, receipts } = bootKepler();
  // Aggro standing with the Reach — the Bazaar's own faction — before the shift starts.
  // (The factions runtime materializes records on first contact; the scanner's aggro read
  // is the record's flag itself.)
  state.factions.faction_reach = { rep: -100, aggro: true };
  advanceTo(70);

  // The whole authored cast is passive work: aggro changes nothing — nobody mints a raid.
  for (const slotId of ['kepler_bazaar_runner', 'kepler_hulk_salvor', 'kepler_scar_picket', 'kepler_glow_reader']) {
    const entity = bySlot(slotId);
    assert.ok(entity, `${slotId} materialized`);
    assert.equal(entity.data.ai.passive, true, `${slotId} stays passive under aggro`);
    assert.equal(isHostileToPlayer(entity, 0, state), false, `${slotId} never reads hostile`);
  }
  // And the chain mints no hull beyond the four authored ones: every ship the traffic owner
  // counts is authored cast, none hostile to the player under aggro standing.
  for (const rec of state.traffic.freighters) {
    const entity = state.entities.get(rec.id);
    if (!entity || entity.alive === false) continue;
    if (isHostileToPlayer(entity, 0, state)) {
      assert.fail(`aggro minted a hostile hull: ${entity.data.activityActorSlotId || entity.id}`);
    }
  }
  assert.ok(starts(receipts).length >= 2, 'the tally day still runs under hostile standing');
});
