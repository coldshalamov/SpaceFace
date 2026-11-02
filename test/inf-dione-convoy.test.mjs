// inf-dione-convoy — WF-01: Dione Lane's promised convoy is now a staged story.
//
// The Lane's zone copy promised the convoy twice ("Convoy contracts leave after customs clears
// the lane", "the southbound convoy stages from" the relay manifest pod) and "tolls fund the
// patrols" named the escort — until this unit the promise was wallpaper: the convoy hauler
// staged at the pod on an endless loop and nothing ever left. This pins the catalog's
// ev_convoy_forms_up wired through the proven per-sector causal-chain seam (registered row →
// the live traffic owner runs it on sector enter → hulls visibly form and roll out → one desk
// line per cycle on the flight ticker, honest about a lost escort).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSimulation } from '../src/core/sim.js';
import { SECTORS } from '../src/data/sectors.js';
import {
  activityPocketById,
  activityPocketsForSector,
} from '../src/data/sectorActivityPockets.js';
import {
  DIONE_CAUSAL_CHAIN,
  DIONE_LANE_SECTOR_ID,
  SECTOR_CAUSAL_CHAIN_DEFS,
} from '../src/data/sectorCausalChains.js';
import { SECTOR_ANCHORS } from '../src/data/sectorAnchors.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { createContactHailResponse } from '../src/data/contactHail.js';
import { createMarketNews } from '../src/ui/marketNews.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import {
  CERES_CAUSAL_CHAIN,
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
const DIONE = DIONE_LANE_SECTOR_ID;
const CATALOG_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', 'design', 'incubator', 'microevent_library', 'catalog',
);

function loadCatalogEvent(id) {
  for (const file of fs.readdirSync(CATALOG_DIR).filter((name) => name.endsWith('.json'))) {
    const doc = JSON.parse(fs.readFileSync(path.join(CATALOG_DIR, file), 'utf8'));
    const events = Array.isArray(doc) ? doc : (doc.events || Object.values(doc)[0]);
    for (const event of events) if (event.id === id) return event;
  }
  return null;
}

function bootDione() {
  const dioneDef = SECTORS.find((sector) => sector.id === DIONE);
  assert.ok(dioneDef, 'Dione Lane is a real sector on the chart');
  const systems = [spawnBudget, traffic, cargo, economy, factions, heat, encounterDirector, npcJobsRuntime];
  const sim = createSimulation({ seed: SEED, systems });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = DIONE;
  for (const station of SECTOR_ANCHORS[DIONE].stations) {
    sim.spawn({
      type: 'station', team: 2, pos: sectorLocalToGlobalForSector(station.pos, DIONE),
      radius: 42, mass: 1e6,
      data: { stationId: station.id, name: station.id },
    });
  }
  const player = sim.spawn({
    type: 'ship', team: 0, pos: sectorLocalToGlobalForSector({ x: 0, z: -3200 }, DIONE),
    vel: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 6,
  });
  state.playerId = player.id;
  state.player.heat = 0;
  state.onboarding = { active: false, finished: true };

  const receipts = [];
  const news = [];
  const headlines = [];
  bus.on(CERES_CAUSAL_CHAIN_EVENT, (payload) => receipts.push(payload));
  bus.on('news:publish', (payload) => news.push(payload));
  bus.on('news:headline', (payload) => headlines.push(payload));
  createMarketNews({ state, bus, helpers: { voice: { say: () => false } } });
  bus.emit('sector:enter', { sectorId: DIONE, sector: dioneDef });

  const owner = sim.registry.get('traffic');
  const advanceTo = (seconds) => {
    const target = Math.round(seconds * 60);
    const now = Math.round(state.simTime * 60);
    if (target > now) sim.runTicks(target - now);
  };
  const bySlot = (slotId) => state.entityList.find((entity) => entity.alive !== false
    && entity.data && entity.data.activityActorSlotId === slotId) || null;
  const stamp = (slotId) => {
    const entity = bySlot(slotId);
    const data = entity && entity.data || {};
    return [data.ceresCausalEventId || null, data.ceresCausalPhase || null, data.ceresCausalCue || null];
  };
  return { sim, state, bus, owner, receipts, news, headlines, advanceTo, bySlot, stamp, dioneDef };
}

test('the Dione chain is a registered table row: one catalog event, none borrowed from another story', () => {
  const dione = SECTOR_CAUSAL_CHAINS.get(DIONE);
  assert.ok(dione, 'Dione Lane has a chain row');
  assert.equal(dione.chain, DIONE_CAUSAL_CHAIN);
  assert.equal(dione.schema, SECTOR_CAUSAL_CHAIN_SCHEMA);
  assert.equal(SECTOR_CAUSAL_CHAIN_DEFS[DIONE].chain, DIONE_CAUSAL_CHAIN);
  assert.equal(SECTOR_CAUSAL_CHAIN_DEFS[DIONE].stationId, 'station_dione');
  // Same machinery, same tuning: one cap and one cycle gap for every sector.
  assert.equal(dione.maxConcurrent, CERES_CAUSAL_CHAIN_MAX_CONCURRENT);
  assert.equal(dione.cycleGapS, 45);

  assert.equal(DIONE_CAUSAL_CHAIN.length, 1);
  const taken = new Set([
    ...CERES_CAUSAL_CHAIN.map((link) => link.id),
    ...Object.values(SECTOR_CAUSAL_CHAIN_DEFS)
      .flatMap((def) => (def.chain === DIONE_CAUSAL_CHAIN ? [] : def.chain.map((link) => link.id))),
  ]);
  assert.equal(taken.has('ev_convoy_forms_up'), false, 'no other sector already runs this event');
});

test('the link is the catalog event it names: phases, durations, and signals verbatim', () => {
  const event = loadCatalogEvent('ev_convoy_forms_up');
  assert.ok(event, 'ev_convoy_forms_up exists in the microevent catalog');
  const link = DIONE_CAUSAL_CHAIN[0];
  assert.deepEqual(
    link.phases.map((phase) => phase.name),
    event.phases.map((phase) => phase.name),
    'the catalog phase names, verbatim',
  );
  assert.deepEqual(
    link.phases.map((phase) => phase.durationS),
    event.phases.map((phase) => phase.durationS),
    'the catalog phase durations, verbatim',
  );
  link.phases.forEach((phase, index) => {
    const signals = event.phases[index].signals || [];
    if (signals.length === 0) assert.equal(phase.cue, null, `${phase.name} has no cue`);
    else assert.ok(signals.includes(phase.cue), `${phase.name} cue ${phase.cue} is a catalog signal`);
  });
});

test('the link rides the three authored Dione hulls where the fiction says they work', () => {
  const dioneSlots = new Set(activityPocketsForSector(DIONE).flatMap((p) => p.actorSlots.map((s) => s.id)));
  const link = DIONE_CAUSAL_CHAIN[0];
  for (const slotId of link.actorSlots) {
    assert.ok(dioneSlots.has(slotId), `${slotId} is a real Dione slot`);
  }
  for (const hint of link.jobHints) {
    assert.ok(link.actorSlots.includes(hint.actorSlotId), 'hint actor is a link actor');
    if (hint.subjectSlotId) assert.ok(link.actorSlots.includes(hint.subjectSlotId));
    for (const phaseName of hint.phases) {
      assert.ok(link.phases.some((phase) => phase.name === phaseName), `hint phase ${phaseName}`);
    }
  }
  assert.ok(link.phases.some((phase) => phase.name === link.seedAtPhase), 'seeds at a real phase');

  // The staging pod is the convoy hauler's authored mark, and the patrol is the Lane's law.
  const relay = activityPocketById('dione_lane_relay');
  const apron = activityPocketById('dione_exchange_apron');
  const inPocket = (pocket, slotId) => pocket.actorSlots.some((slot) => slot.id === slotId);
  assert.ok(inPocket(relay, 'dione_convoy_hauler') && inPocket(relay, 'dione_relay_keeper'));
  assert.ok(inPocket(apron, 'dione_exchange_hauler') && inPocket(apron, 'dione_toll_patrol'));
  assert.ok(relay.objectSlots.some((slot) => slot.id === 'dione_relay_manifest_pod'),
    'the manifest pod the convoy stages from is authored');
});

test('seed 4242: entering Dione stages the convoy inside the first minute', () => {
  const { receipts, advanceTo, owner } = bootDione();
  advanceTo(60);

  const started = receipts.filter((r) => r.kind === 'event_start');
  assert.equal(started.length, 1, 'the one link opens the moment the sector arms');
  assert.equal(started[0].eventId, 'ev_convoy_forms_up');
  assert.ok(started[0].simTime < 0.1, 'the gather begins immediately');
  for (const r of receipts) {
    assert.equal(r.sectorId, DIONE, 'every receipt names Dione');
    assert.equal(r.schema, SECTOR_CAUSAL_CHAIN_SCHEMA);
  }
  const snap = owner.getCeresCausalChainSnapshot();
  assert.equal(snap.sectorId, DIONE);
  assert.ok(snap.activeCount <= CERES_CAUSAL_CHAIN_MAX_CONCURRENT);
});

test('seed 4242: the hulls show the forming convoy, then the stamp lets go', () => {
  const { advanceTo, bySlot, stamp, state } = bootDione();
  const routeIds = (slotId) => {
    const entity = bySlot(slotId);
    const job = entity && entity.data.jobId && state.npcJobs.byId[entity.data.jobId];
    return job ? job.job.route.map((node) => node.id) : null;
  };
  const patrolJobId = bySlot('dione_toll_patrol').data.jobId;
  const exchangeJobId = bySlot('dione_exchange_hauler').data.jobId;

  // t=10: the gather — the staging hull wears the beat, the law is still on its chord.
  advanceTo(10);
  assert.deepEqual(stamp('dione_convoy_hauler'), ['ev_convoy_forms_up', 'gather', 'heavy_burn']);
  assert.deepEqual(stamp('dione_toll_patrol'), ['ev_convoy_forms_up', 'gather', 'heavy_burn']);

  // t=50: the escort joins — the patrol closes on the staging hull, not its toll chord.
  advanceTo(50);
  assert.deepEqual(stamp('dione_toll_patrol'), ['ev_convoy_forms_up', 'escort_arrives', 'on_the_pin']);
  assert.deepEqual(stamp('dione_exchange_hauler'), ['ev_convoy_forms_up', 'escort_arrives', 'on_the_pin'],
    'the exchange hauler slots into line');
  assert.deepEqual(routeIds('dione_toll_patrol'), [
    'causal:ev_convoy_forms_up:origin',
    'causal:ev_convoy_forms_up:subject',
  ], 'the patrol is closing on the convoy, not walking its chord');

  // t=65: spine up — the ripple lamp, and the seed is planted.
  advanceTo(65);
  assert.deepEqual(stamp('dione_convoy_hauler'), ['ev_convoy_forms_up', 'spine_up', 'spine_wake']);

  // t=95: the day is over — every stamp cleared, both redirected hulls back on authored jobs.
  advanceTo(95);
  for (const slotId of ['dione_convoy_hauler', 'dione_exchange_hauler', 'dione_toll_patrol']) {
    assert.deepEqual(stamp(slotId), [null, null, null], `${slotId} is clean after the roll-out`);
  }
  assert.equal(bySlot('dione_toll_patrol').data.jobId, patrolJobId, 'the patrol kept its authored job id');
  assert.equal(bySlot('dione_exchange_hauler').data.jobId, exchangeJobId, 'the hauler kept its authored job id');
});

test('a cycle closes with one honest desk line on the Exchange, then re-arms', () => {
  const { receipts, news, headlines, advanceTo, state } = bootDione();
  advanceTo(140);

  const complete = receipts.find((r) => r.kind === 'cycle_complete');
  assert.ok(complete, 'the one-link cycle resolves with no player input');
  assert.equal(complete.cycle, 1);
  assert.ok(Math.abs(complete.nextEligibleAt - (complete.simTime + 45)) < 1e-6, 'the shared 45 s gap');

  const stories = news.filter((p) => p.kind === 'dione_convoy_day');
  assert.equal(stories.length, 1, 'one cycle, one line');
  assert.equal(stories[0].stationId, 'station_dione');
  assert.equal(stories[0].sectorId, DIONE);
  assert.equal(stories[0].sourceRef, 'traffic:sector-causal-chain');
  assert.match(stories[0].text, /convoy formed at the relay pod/);
  assert.doesNotMatch(stories[0].text, /[a-z]_[a-z]|[a-z][A-Z]/, 'plain words, no internal ids');

  const wired = headlines.filter((h) => h.kind === 'dione_convoy_day');
  assert.equal(wired.length, 1, 'the ticker surfaces the Dione line once');
  assert.equal(wired[0].headline, stories[0].text);
  const logged = state.ui.marketNews.log.filter((row) => row.kind === 'dione_convoy_day');
  assert.equal(logged.length, 1);

  const second = receipts.filter((r) => r.kind === 'event_start' && r.cycle === 1);
  assert.ok(second.length >= 1, 'the chain re-arms after the gap');
  assert.equal(second[0].eventId, 'ev_convoy_forms_up');
});

test('an escort lost before the spine lights reads the honest empty-slot line', () => {
  const { receipts, news, advanceTo, bySlot, owner } = bootDione();
  advanceTo(10);
  bySlot('dione_toll_patrol').alive = false;
  advanceTo(140);

  const skips = receipts.filter((r) => r.kind === 'event_interrupt');
  assert.ok(skips.length >= 1, 'the link is skipped, not waited on forever');
  const story = news.find((p) => p.kind === 'dione_convoy_day');
  assert.ok(story, 'the cycle still posts');
  assert.match(story.text, /convoy slot .* sat empty/);
  assert.doesNotMatch(story.text, /convoy formed/, 'the line never claims a departure nobody saw');
  assert.equal(owner.getCeresCausalChainSnapshot().cycle >= 1, true, 'the cycle still closes');
});

test('the hail lamps never claim a law lock or a tender the hull does not have', () => {
  const { advanceTo, bySlot, state } = bootDione();
  const hail = (slotId) => JSON.stringify(createContactHailResponse(
    state,
    { kind: 'worker', targetId: bySlot(slotId).id },
    'status',
  ));

  advanceTo(50);
  assert.match(hail('dione_toll_patrol'), /ESCORT ARRIVES · ESCORT JOINING · PIN ON THE FLANK/);
  assert.doesNotMatch(hail('dione_toll_patrol'), /LAW LOCK/);
  advanceTo(65);
  assert.match(hail('dione_convoy_hauler'), /SPINE UP · ENGINES LIT · ROLLING SOON/);
  assert.doesNotMatch(hail('dione_convoy_hauler'), /TENDER INBOUND/);
});
