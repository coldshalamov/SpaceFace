// Second ambient chain — "a staged story outside Ceres".
//
// Ceres alone had a sequence of things happening (surveyor, strike, haul, theft, calving). The
// causal-chain timer is now a per-sector table (traffic.SECTOR_CAUSAL_CHAINS): Ceres is row one and
// Helios Prime, the sector you start in, is row two — four catalog microevents (work, law, civilian,
// crime) strung across the four authored hulls that already fly there, on the same hard cap of two
// live links and the same cycle gap.
//
// Proved on the default seed 4242 against the live traffic owner (real createSimulation, real
// sector:enter), in simulated seconds. Sim code under test uses simTime only: no draw on the
// sector RNG, so Helios's ambient spawns are the ones the existing Helios pocket tests pin.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSimulation } from '../src/core/sim.js';
import { SECTORS } from '../src/data/sectors.js';
import {
  CERES_ACTIVITY_SECTOR_ID,
  HELIOS_ACTIVITY_SECTOR_ID,
  HELIOS_POCKET_ACTOR_SLOT_ORDER,
  PALLAS_ACTIVITY_SECTOR_ID,
  activityPocketById,
} from '../src/data/sectorActivityPockets.js';
import { HELIOS_CAUSAL_CHAIN, SECTOR_CAUSAL_CHAIN_DEFS } from '../src/data/sectorCausalChains.js';
import { createContactHailResponse, livingWorkStatusText } from '../src/data/contactHail.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import {
  CERES_CAUSAL_CHAIN,
  CERES_CAUSAL_CHAIN_CYCLE_GAP_S,
  CERES_CAUSAL_CHAIN_EVENT,
  CERES_CAUSAL_CHAIN_MAX_CONCURRENT,
  CERES_CAUSAL_CHAIN_SCHEMA,
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
const HELIOS = HELIOS_ACTIVITY_SECTOR_ID;
const SECTOR_SCHEMA = SECTOR_CAUSAL_CHAIN_SCHEMA;

const CATALOG_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', 'design', 'incubator', 'microevent_library', 'catalog',
);
function loadCatalog() {
  const byId = new Map();
  for (const file of fs.readdirSync(CATALOG_DIR).filter((name) => name.endsWith('.json'))) {
    const doc = JSON.parse(fs.readFileSync(path.join(CATALOG_DIR, file), 'utf8'));
    const events = Array.isArray(doc) ? doc : (doc.events || Object.values(doc)[0]);
    for (const event of events) byId.set(event.id, event);
  }
  return byId;
}

function bootHelios() {
  const heliosDef = SECTORS.find((sector) => sector.id === HELIOS);
  const systems = [spawnBudget, traffic, cargo, economy, factions, heat, encounterDirector, npcJobsRuntime];
  const sim = createSimulation({ seed: SEED, systems });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = HELIOS;
  sim.spawn({
    type: 'station', team: 2, pos: { x: 1280, z: -420 }, radius: 42, mass: 1e6,
    data: { stationId: 'station_helios', name: 'Helios Station' },
  });
  sim.spawn({
    type: 'station', team: 2, pos: { x: -920, z: 1080 }, radius: 42, mass: 1e6,
    data: { stationId: 'station_coalition', name: 'Coalition Yard' },
  });
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 1200, z: -400 }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6,
  });
  state.playerId = player.id;
  state.player.heat = 0;
  state.onboarding = { active: false, finished: true };

  const receipts = [];
  const news = [];
  const richSeam = [];
  const deeds = [];
  bus.on(CERES_CAUSAL_CHAIN_EVENT, (payload) => receipts.push(payload));
  bus.on('news:publish', (payload) => news.push(payload));
  bus.on('field:richSeamOpened', (payload) => richSeam.push(payload));
  bus.on('stationLife:deedNoticed', (payload) => deeds.push(payload));
  bus.emit('sector:enter', { sectorId: HELIOS, sector: heliosDef });

  const owner = sim.registry.get('traffic');
  const advanceTo = (seconds) => {
    const target = Math.round(seconds * 60);
    const now = Math.round(state.simTime * 60);
    if (target > now) sim.runTicks(target - now);
  };
  const bySlot = (slotId) => state.entityList.find((entity) => entity.alive !== false
    && entity.data && entity.data.activityActorSlotId === slotId) || null;
  return { sim, state, bus, owner, receipts, news, richSeam, deeds, advanceTo, bySlot, heliosDef };
}

const starts = (receipts) => receipts.filter((r) => r.kind === 'event_start');

test('the Helios chain is a registered table row: four catalog events, none of them Ceres ids', () => {
  const ceres = SECTOR_CAUSAL_CHAINS.get(CERES_ACTIVITY_SECTOR_ID);
  const helios = SECTOR_CAUSAL_CHAINS.get(HELIOS);
  assert.ok(ceres && helios, 'Ceres and Helios both have a chain row');
  assert.equal(ceres.chain, CERES_CAUSAL_CHAIN, 'Ceres is row one, unchanged');
  assert.equal(ceres.schema, CERES_CAUSAL_CHAIN_SCHEMA);
  assert.equal(helios.chain, HELIOS_CAUSAL_CHAIN);
  assert.equal(helios.schema, SECTOR_SCHEMA);
  assert.equal(SECTOR_CAUSAL_CHAIN_DEFS[HELIOS].chain, HELIOS_CAUSAL_CHAIN);
  assert.equal(SECTOR_CAUSAL_CHAINS.has('sector_pallas_drift'), false, 'every other sector is chainless');

  // Same machinery, same tuning: one cap and one cycle gap for every sector.
  assert.equal(helios.maxConcurrent, CERES_CAUSAL_CHAIN_MAX_CONCURRENT);
  assert.equal(helios.cycleGapS, CERES_CAUSAL_CHAIN_CYCLE_GAP_S);
  assert.equal(helios.maxConcurrent, 2);
  assert.equal(helios.cycleGapS, 45);

  assert.equal(HELIOS_CAUSAL_CHAIN.length, 4);
  const ids = HELIOS_CAUSAL_CHAIN.map((link) => link.id);
  assert.equal(new Set(ids).size, ids.length, 'unique link ids');
  const ceresIds = new Set(CERES_CAUSAL_CHAIN.map((link) => link.id));
  for (const id of ids) assert.equal(ceresIds.has(id), false, `${id} is not one of the eleven Ceres links`);
});

test('every Helios link is the catalog event it names: same phases, same durations, four categories', () => {
  const catalog = loadCatalog();
  const categories = new Set();
  for (const link of HELIOS_CAUSAL_CHAIN) {
    const event = catalog.get(link.id);
    assert.ok(event, `${link.id} exists in the microevent catalog`);
    categories.add(event.category);
    assert.deepEqual(
      link.phases.map((phase) => phase.name),
      event.phases.map((phase) => phase.name),
      `${link.id} keeps the catalog's phase names`,
    );
    assert.deepEqual(
      link.phases.map((phase) => phase.durationS),
      event.phases.map((phase) => phase.durationS),
      `${link.id} keeps the catalog's phase durations`,
    );
    // The catalog's visible signal is the cue (first signal), or no cue when the phase has none.
    link.phases.forEach((phase, index) => {
      const signals = event.phases[index].signals || [];
      if (signals.length === 0) assert.equal(phase.cue, null, `${link.id}/${phase.name} has no cue`);
      else assert.ok(signals.includes(phase.cue), `${link.id}/${phase.name} cue ${phase.cue} is a catalog signal`);
    });
  }
  assert.deepEqual([...categories].sort(), ['civilian', 'crime', 'law', 'work']);
});

test('the Helios links ride the four authored hulls and every requirement is planted by an earlier link', () => {
  const heliosSlots = new Set(HELIOS_POCKET_ACTOR_SLOT_ORDER);
  const planted = new Set();
  const used = new Set();
  for (const link of HELIOS_CAUSAL_CHAIN) {
    assert.ok(link.actorSlots.length >= 1);
    for (const slotId of link.actorSlots) {
      assert.ok(heliosSlots.has(slotId), `${link.id} binds a real Helios slot: ${slotId}`);
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
    for (const need of link.requires) assert.ok(planted.has(need), `${link.id} requires ${need}, planted earlier`);
    for (const seed of link.seeds) planted.add(seed);
    for (const seed of link.interruptSeeds) planted.add(seed);
  }
  assert.equal(used.size, 4, 'all four authored hulls take part');

  // The cast sits where the chain's fiction says: the work on the Sanctioned Claim, the law and
  // the freight on the spine by the tally post.
  const seam = activityPocketById('helios_starter_seam');
  const leg = activityPocketById('helios_freight_leg');
  assert.equal(seam.activityAnchor.zoneId, 'zone_helios_claim');
  assert.equal(leg.activityAnchor.placeId, 'poi_helios_tally');
  const inPocket = (pocket, slotId) => pocket.actorSlots.some((slot) => slot.id === slotId);
  assert.ok(inPocket(seam, 'helios_seam_miner') && inPocket(seam, 'helios_seam_fence'));
  assert.ok(inPocket(leg, 'helios_freight_hauler') && inPocket(leg, 'helios_customs_patrol'));
});

test('seed 4242: entering Helios stages the chain inside 180 s, capped at two live links', () => {
  const { owner, receipts, advanceTo, state } = bootHelios();
  advanceTo(180);

  const started = starts(receipts);
  const ids = started.map((r) => r.eventId);
  assert.ok(started.length >= 1, 'at least one chain event fires within 180 sim seconds');
  assert.ok(new Set(ids).size >= 2, `two or more distinct events fire: ${ids.join(', ')}`);
  assert.deepEqual(ids, [
    'ev_prospector_stakes_claim',
    'ev_customs_pullover',
    'ev_prospectors_posture',
    'ev_claim_jump',
  ], 'the four links open in authored order');
  assert.ok(started[0].simTime < 0.1, 'the first link opens the moment the sector arms');
  assert.ok(receipts.find((r) => r.kind === 'seed').simTime <= 60,
    'the first seed lands inside a minute so the second link does not wait on a long first act');

  assert.ok(receipts.length > 0);
  for (const r of receipts) {
    assert.equal(r.sectorId, HELIOS, 'every receipt names Helios, never a Ceres default');
    assert.equal(r.schema, SECTOR_SCHEMA);
    assert.ok(r.activeCount <= CERES_CAUSAL_CHAIN_MAX_CONCURRENT, `cap respected at ${r.simTime}: ${r.activeCount}`);
  }
  assert.ok(receipts.some((r) => r.activeCount === 2), 'the cap is actually used: two links overlap');

  const snap = owner.getCeresCausalChainSnapshot();
  assert.equal(snap.sectorId, HELIOS);
  assert.equal(snap.schema, SECTOR_SCHEMA);
  assert.ok(snap.activeCount <= 2);
  assert.equal(state.world.currentSectorId, HELIOS);
});

test('seed 4242: the cast shows each beat on its hull, then lets go', () => {
  const { owner, advanceTo, bySlot, state } = bootHelios();
  const stamp = (slotId) => {
    const data = bySlot(slotId).data;
    return [data.ceresCausalEventId || null, data.ceresCausalPhase || null, data.ceresCausalCue || null];
  };

  advanceTo(10);
  assert.deepEqual(stamp('helios_seam_miner'), ['ev_prospector_stakes_claim', 'hunt', 'reading_the_dark']);
  assert.deepEqual(stamp('helios_customs_patrol'), [null, null, null], 'customs is still on its beat');
  assert.match(livingWorkStatusText(bySlot('helios_seam_miner')), /^WORK · HUNT · READING THE DARK$/);

  // t=30: customs has flagged the hauler down, and its beat is replaced by a run at the hauler.
  advanceTo(30);
  assert.deepEqual(stamp('helios_customs_patrol'), ['ev_customs_pullover', 'flag_down', 'on_the_pin']);
  assert.deepEqual(stamp('helios_freight_hauler'), ['ev_customs_pullover', 'flag_down', 'on_the_pin']);
  const patrol = bySlot('helios_customs_patrol');
  const beatJobId = patrol.data.jobId;
  const routeIds = () => state.npcJobs.byId[patrol.data.jobId].job.route.map((node) => node.id);
  assert.ok(beatJobId, 'the patrol is job-owned');
  assert.deepEqual(routeIds(), [
    'causal:ev_customs_pullover:origin',
    'causal:ev_customs_pullover:subject',
  ], 'the patrol is closing on the hauler, not circling its beat');
  const live = owner._ceresCausal.active.find((link) => link.eventId === 'ev_customs_pullover');
  assert.equal(live.redirectedSlots.length, 1);

  // The lamp the catalog keeps for the hauler's wave-on would read as a tender in the hail table;
  // the phase-scoped means says what is true.
  advanceTo(100);
  assert.deepEqual(stamp('helios_freight_hauler'), ['ev_customs_pullover', 'wave_on', 'spine_wake']);
  const hail = createContactHailResponse(
    state,
    { kind: 'worker', targetId: bySlot('helios_freight_hauler').id },
    'status',
  );
  assert.match(JSON.stringify(hail), /INSPECTION DONE · RETURNING TO THE LANE/);
  assert.doesNotMatch(JSON.stringify(hail), /TENDER INBOUND/);

  // t=110: the pullover is over, customs is back on the very beat it left, and both hulls are clean.
  advanceTo(112);
  assert.deepEqual(stamp('helios_customs_patrol'), [null, null, null]);
  assert.deepEqual(stamp('helios_freight_hauler'), [null, null, null]);
  assert.equal(patrol.data.jobId, beatJobId, 'the patrol job id is the one it started with');
  assert.deepEqual(routeIds(), ['helios_spine_beat_a', 'helios_spine_beat_b'], 'and its route is the authored beat');
});

test('a hull shared by two live links keeps the cue of the one still running', () => {
  const { advanceTo, bySlot } = bootHelios();
  // The posture (55-150) and the jump (110-200) both fly the miner and the fence. When the posture
  // ends at 150 the jump is mid-phase; finishing one link must not blank the other's cue.
  advanceTo(152);
  for (const slotId of ['helios_seam_miner', 'helios_seam_fence']) {
    const data = bySlot(slotId).data;
    assert.equal(data.ceresCausalEventId, 'ev_claim_jump', `${slotId} still shows the running jump`);
    assert.equal(data.ceresCausalPhase, 'owner_returns');
    assert.equal(data.ceresCausalCue, 'stacking');
  }
});

test('a cycle closes with one Helios news line, waits the shared gap, then re-arms', () => {
  const { receipts, news, richSeam, deeds, advanceTo } = bootHelios();
  advanceTo(260);

  const complete = receipts.find((r) => r.kind === 'cycle_complete');
  assert.ok(complete, 'the four-link cycle resolves with no player input');
  assert.equal(complete.cycle, 1);
  assert.ok(Math.abs(complete.simTime - 200.1) < 0.05, `posture seeds at 110, the jump runs 110-200: ${complete.simTime}`);
  assert.ok(Math.abs(complete.nextEligibleAt - (complete.simTime + CERES_CAUSAL_CHAIN_CYCLE_GAP_S)) < 1e-6);

  const stories = news.filter((p) => p.kind === 'helios_claim_story');
  assert.equal(stories.length, 1, 'one cycle, one line');
  assert.equal(stories[0].channelId, 'news');
  assert.equal(stories[0].stationId, 'station_helios');
  assert.equal(stories[0].sectorId, HELIOS);
  assert.equal(stories[0].cycle, 1);
  assert.equal(stories[0].sourceRef, 'traffic:sector-causal-chain');
  assert.equal(stories[0].text, 'Helios customs reads another loaded hauler; the Sanctioned Claim argues over a stake.');
  assert.doesNotMatch(stories[0].text, /[a-z]_[a-z]|[a-z][A-Z]/, 'plain words, no internal ids');
  assert.equal(news.filter((p) => p.kind === 'ceres_seam_story').length, 0, 'no Ceres line leaks out');

  const second = starts(receipts).filter((r) => r.cycle === 1);
  assert.ok(second.length >= 1, 'the chain re-arms after the gap');
  assert.equal(second[0].eventId, 'ev_prospector_stakes_claim');
  assert.ok(second[0].simTime - complete.simTime >= CERES_CAUSAL_CHAIN_CYCLE_GAP_S - 1e-6, 'the gap is the shared 45 s');

  // Ceres-only effects stay in Ceres: no rich-seam window, no station deed from a Ceres line.
  assert.equal(richSeam.length, 0);
  assert.equal(deeds.length, 0);
});

test('a customs link that loses a hull says the lot went through unread', () => {
  const { owner, news, receipts, advanceTo, bySlot } = bootHelios();
  advanceTo(30);
  // Customs is lost mid-pullover: the link degrades (interrupt seeds) and the cycle still resolves.
  bySlot('helios_customs_patrol').alive = false;
  advanceTo(260);
  const pullover = receipts.filter((r) => r.eventId === 'ev_customs_pullover');
  assert.ok(pullover.some((r) => r.kind === 'event_interrupt'), 'the pullover is interrupted, not stuck');
  assert.equal(owner.getCeresCausalChainSnapshot().cycle >= 1, true, 'the cycle still closes');
  const story = news.find((p) => p.kind === 'helios_claim_story');
  assert.ok(story);
  assert.equal(story.text, 'Helios customs waves a loaded hauler on unread; the Sanctioned Claim argues over a stake.');
});

test('entering any other sector resets the Helios chain; the Ceres chain still arms on its own', () => {
  // Hard path: leave Helios the ordinary way and arrive in a chainless sector.
  {
    const { owner, bus, state, receipts, advanceTo } = bootHelios();
    advanceTo(60);
    assert.equal(owner.getCeresCausalChainSnapshot().activeCount, 2, 'two links live before the jump');
    bus.emit('sector:exit', { sectorId: HELIOS });
    state.world.currentSectorId = PALLAS_ACTIVITY_SECTOR_ID;
    bus.emit('sector:enter', {
      sectorId: PALLAS_ACTIVITY_SECTOR_ID,
      sector: SECTORS.find((sector) => sector.id === PALLAS_ACTIVITY_SECTOR_ID),
    });
    assert.equal(owner.getCeresCausalChainSnapshot(), null, 'no ledger outlives the sector');
    assert.equal(receipts.filter((r) => r.kind === 'abort').length, 2, 'both live links aborted cleanly');
    advanceTo(120);
    assert.equal(owner.getCeresCausalChainSnapshot(), null, 'and the chainless sector never arms one');
  }

  // Continuous path: a no-teleport handoff never runs the hard-enter cleanup. The first tick spent
  // in the other sector retires the ledger and wipes the stamps off the Helios hulls it left.
  {
    const { owner, state, receipts, advanceTo, bySlot } = bootHelios();
    advanceTo(60);
    const miner = bySlot('helios_seam_miner');
    assert.ok(miner.data.ceresCausalEventId, 'the miner is mid-beat');
    state.world.currentSectorId = PALLAS_ACTIVITY_SECTOR_ID;
    advanceTo(62);
    assert.equal(owner.getCeresCausalChainSnapshot(), null);
    assert.ok(receipts.some((r) => r.kind === 'abort' && r.reason === 'wrong_sector'));
    assert.equal(miner.data.ceresCausalEventId, undefined, 'the stamp is gone with the ledger');
    assert.equal(starts(receipts).length, 3, 'nothing new started in the wrong sector');
  }

  // Ensure: only a sector with a row can arm; a ledger from another row is torn down first.
  {
    const { owner, state, receipts, advanceTo } = bootHelios();
    advanceTo(30);
    state.world.currentSectorId = 'sector_nowhere_belt';
    assert.equal(owner._ensureCeresCausalChain('test'), null);
    assert.equal(owner.getCeresCausalChainSnapshot(), null);

    advanceTo(31);
    state.world.currentSectorId = HELIOS;
    assert.equal(owner._ensureCeresCausalChain('test').sectorId, HELIOS);
    state.world.currentSectorId = CERES_ACTIVITY_SECTOR_ID;
    const ceresLedger = owner._ensureCeresCausalChain('test');
    assert.equal(ceresLedger.sectorId, CERES_ACTIVITY_SECTOR_ID);
    assert.equal(ceresLedger.schema, CERES_CAUSAL_CHAIN_SCHEMA, 'Ceres keeps its own schema');
    assert.equal(ceresLedger.active.length, 0, 'a fresh Ceres ledger, not Helios links under a Ceres name');
    assert.ok(receipts.some((r) => r.kind === 'chain_ready' && r.sectorId === CERES_ACTIVITY_SECTOR_ID
      && r.schema === CERES_CAUSAL_CHAIN_SCHEMA));
  }
});
