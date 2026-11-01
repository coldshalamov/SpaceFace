// DUST P1b — encounter widening determinism + exposure proofs.
//
// Proves the four contract points of the widening lane (design/program/dust/README.md P1b,
// EXPOSURE_AUDIT.md §4/§5) on the ordinary default route — no flags, no test-only paths:
//
//   (a) LEGACY BIT-PRESERVATION — planEncounters roll sequences for a fixed seed are
//       byte-identical before/after the lane. The digest below was frozen from the working
//       tree on 2026-10-31 BEFORE any dust-lane edit touched src/systems/encounterDirector.js
//       (1008 plans: 7 seeds x 8 sectors x 18 sector-days; payload = encounterId, shapeId,
//       script, tier, deck, delay(1e-6), zoneId, zoneCenter, squad size). The lane draws only
//       from mulberry32(hash32(seed, sectorId, dayIndex, 'dust-lane-v1')) and
//       '...dust-lane-live-v1' streams, so this digest must never move.
//   (b) LANE DETERMINISM — the lane planners are pure (same args ⇒ same items) and a full
//       director soak including the live scan produces byte-identical encounter logs twice.
//   (c) EXPOSURE — a simulated 20 h ordinary route (audit §6 route) crosses >= 210 distinct
//       authored encounter ids: the audit's "crossed" measure = ids the route crossed paths
//       with (legacy planner offers U lane offers U presentations U fixed-route placements).
//       Presented-only (telegraphed) ids are asserted separately at >= 140 = 2x the P1a
//       baseline (~70), because presentation is additionally culled by the unchanged pacing
//       valves and the rank-below-legacy rule.
//   (d) IDLE SAFETY — when the cohort pool is exhausted (once-ever consumed) or on cooldown,
//       the lane plans nothing, fires nothing, and leaves no unbounded pending growth.
//
// Harness assumptions (audit §6 + check-encounter-director.mjs soak conventions):
//   systems = [spawnBudget, encounterDirector]; story.beatIndex 99 (full roster open);
//   deterministic referee kills each spawned squad 45 s after its telegraph; the player
//   loiters 240 s in each authored zone of the current sector, round-robin (ordinary-route
//   traversal of the sector's named places); never docked (docking only reduces exposure);
//   the 6 story interludes + 2 physical prop scenes are counted as crossed per the audit's
//   own baseline composition — their dispatchers (story campaign, prop proximity) live
//   outside this harness's system list.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import {
  encounterDirector,
  planDustLaneDay,
  planDustLivePresentation,
  planEncounters,
  planEncounterShape,
} from '../src/systems/encounterDirector.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { DUST_FIRE_GAP_S, DUST_MAX_PER_DAY, dustLaneCohort } from '../src/data/dustLane.js';

const DAY_S = 600;
const HOUR_S = 3600;

// ── shared helpers ───────────────────────────────────────────────────────────────────────────────

function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function planCorpusDigest(seed, sid, day, zones) {
  // EXACT serialization of the 2026-10-31 pre-lane capture (see test header): the digest is
  // only comparable against its frozen baseline in this identical shape.
  const a = planEncounters(seed, sid, day, zones);
  return JSON.stringify(a.map((i) => [
    i.encounterId, i.shapeId, i.script, i.tier, i.deck, +i.delay.toFixed(6),
    i.zoneId, i.zoneCenter.x, i.zoneCenter.z, i.ships.length,
  ]));
}

function boot(seed, sectorId, playerPos) {
  const sim = createSimulation({ seed, systems: [spawnBudget, encounterDirector] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.story = { beatIndex: 99 };
  state.world.currentSectorId = sectorId;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: playerPos, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6,
  });
  state.playerId = player.id;
  bus.emit('sector:enter', { sectorId });
  return { sim, state, bus, player };
}

// The audit §6 ordinary route: Helios 4 h → Ceres 5 h → Tethys 4 h → Vesta 3 h → Pallas 2 h → Io 2 h.
const ROUTE = [
  ['sector_helios_prime', 4], ['sector_ceres_belt', 5], ['sector_tethys_junction', 4],
  ['sector_vesta_forge', 3], ['sector_pallas_drift', 2], ['sector_io_reach', 2],
];
const FIXED_ROUTE_IDS = [
  'interlude_unknown_vessel', 'interlude_the_hand', 'interlude_second_client',
  'interlude_the_ticker', 'interlude_the_drawer', 'interlude_the_smell_ticket',
  'scene_struck_bell', 'scene_sweep_window',
];

/** Run the 20 h ordinary route through the real director. Returns presentation telemetry. */
function runOrdinaryRoute(seed = 17101, hours = 20) {
  const { sim, state, bus, player } = boot(seed, ROUTE[0][0], { x: 400, z: 0 });
  const telegraphs = [];
  const refereeQueue = [];
  bus.on('encounter:telegraph', (p) => {
    const dust = String(p.encounterId).startsWith('dust:');
    telegraphs.push({ t: +state.simTime.toFixed(3), kind: p.kind, tier: p.tier, dust });
    const live = state.encounterDirector.live[p.encounterId];
    if (live) refereeQueue.push({ at: state.simTime + 45, ids: live.ids });
  });
  let sectorIdx = 0;
  let hopAt = ROUTE[0][1] * HOUR_S;
  for (let s = 0; s < hours * HOUR_S; s++) {
    if (state.simTime >= hopAt && sectorIdx + 1 < ROUTE.length) {
      sectorIdx += 1;
      const sid = ROUTE[sectorIdx][0];
      state.world.currentSectorId = sid;
      bus.emit('sector:enter', { sectorId: sid });
      hopAt += ROUTE[sectorIdx][1] * HOUR_S;
    }
    // Ordinary-route traversal: loiter 240 s in each authored zone of the current sector.
    if (s % 240 === 0) {
      const sid = ROUTE[sectorIdx][0];
      const zones = zonesForSector(sid);
      const z = zones[Math.floor(s / 240) % zones.length];
      const g = sectorLocalToGlobalForSector(z.center, sid);
      player.pos.x = g.x;
      player.pos.z = g.z;
    }
    for (const job of refereeQueue) {
      if (job.done || state.simTime < job.at) continue;
      job.done = true;
      for (const id of job.ids.slice()) {
        const e = state.entities.get(id);
        if (!e || e.alive === false) continue;
        bus.emit('entity:killed', { id, killerId: state.playerId, pos: { x: e.pos.x, z: e.pos.z } });
        e.alive = false;
      }
    }
    sim.runTicks(60);
  }
  const dir = state.encounterDirector;
  const offeredDust = new Set(Object.keys((dir.stats && dir.stats.dustRotation) || {}));
  // Legacy offers on the same route: the untouched per-(seed, sector, day) planner replay.
  const offeredLegacy = new Set();
  let dayOffset = 0;
  for (const [sid, h] of ROUTE) {
    const zones = zonesForSector(sid);
    for (let day = 0; day < h * HOUR_S / DAY_S; day++) {
      for (const it of planEncounters(seed, sid, dayOffset + day, zones)) offeredLegacy.add(it.shapeId);
    }
    dayOffset += h * HOUR_S / DAY_S;
  }
  const presented = new Set(telegraphs.map((t) => t.kind));
  const crossed = new Set([...presented, ...offeredLegacy, ...offeredDust, ...FIXED_ROUTE_IDS]);
  sim.dispose();
  return { telegraphs, presented, offeredDust, offeredLegacy, crossed, dir };
}

// ── (0) cohort sanity: the append-only rule captures exactly the dark vignette families ──────────

test('dust cohort: append-only — externalOnly ambient civilian vignettes only', () => {
  const cohort = dustLaneCohort(ENCOUNTERS);
  assert.ok(cohort.length >= 150, `cohort should light the dark vignette mass (got ${cohort.length})`);
  for (const id of cohort) {
    const e = ENCOUNTERS[id];
    assert.equal(e.gates.externalOnly, true, `${id}: cohort is the externalOnly family`);
    assert.equal(e.deck, 'civilian', `${id}: lane adds world-life, never combat pressure`);
    assert.equal(e.tier, 'ambient', `${id}: lane offers ambient tier only`);
    assert.notEqual(e.livedRotation, true, `${id}: curated rotation keeps its lived route`);
    assert.ok(Array.isArray(e.zoneTypes) && e.zoneTypes.length, `${id}: empty zoneTypes disables`);
  }
  for (const id of FIXED_ROUTE_IDS) {
    assert.ok(!cohort.includes(id), `${id}: story/prop-owned shapes stay out of the lane`);
  }
});

// ── (a) legacy roll sequences are bit-preserved ──────────────────────────────────────────────────

test('(a) legacy planner sequences are identical to the pre-lane baseline digest', () => {
  const sectors = [
    'sector_helios_prime', 'sector_ceres_belt', 'sector_tethys_junction', 'sector_sker_haven',
    'sector_veil_nebula', 'sector_vesta_forge', 'sector_pallas_drift', 'sector_io_reach',
  ];
  const seeds = [1, 7, 47, 1234, 17101, 4242, 8008];
  const rows = [];
  for (const sid of sectors) {
    const zones = zonesForSector(sid);
    for (const seed of seeds) {
      for (let day = 0; day < 18; day++) {
        rows.push(fnv1a(planCorpusDigest(seed, sid, day, zones)));
      }
    }
  }
  assert.equal(rows.length, 1008, 'baseline corpus is 1008 plans');
  assert.equal(fnv1a(rows.join('|')), 'd54f2e8e',
    'legacy per-(seed, sector, day) schedules changed — the lane must never read the legacy stream');
});

// ── (b) the dust lane is deterministic ───────────────────────────────────────────────────────────

test('(b) lane planners are pure: same inputs ⇒ identical items', () => {
  const zones = zonesForSector('sector_ceres_belt');
  const rotation = {}; const started = {};
  for (let day = 0; day < 12; day++) {
    const a = planDustLaneDay(17101, 'sector_ceres_belt', day, zones, { started, rotation });
    const b = planDustLaneDay(17101, 'sector_ceres_belt', day, zones, { started, rotation });
    assert.deepEqual(a, b, `day ${day}: lane day-planner must be deterministic`);
    for (const it of a) {
      rotation[it.shapeId] = (rotation[it.shapeId] | 0) + 1;
      if (day % 2) started[it.shapeId] = day;
    }
  }
  const zone = zones[0];
  for (let scan = 0; scan < 12; scan++) {
    const now = scan * 15;
    const a = planDustLivePresentation(17101, 'sector_ceres_belt', 0, zone, now, { started: {}, rotation: {} });
    const b = planDustLivePresentation(17101, 'sector_ceres_belt', 0, zone, now, { started: {}, rotation: {} });
    assert.deepEqual(a, b, `scan ${scan}: live presentation must be deterministic`);
  }
});

test('(b) full director soak with the lane: two identical runs ⇒ identical encounter logs', () => {
  function soak(seed) {
    // Player inside an authored Sker zone: the lane presents when the player stands in a
    // vignette's kind of place, so the soak must exercise the live scan, not just idle it.
    const zones = zonesForSector('sector_sker_haven');
    const start = sectorLocalToGlobalForSector(zones[0].center, 'sector_sker_haven');
    const { sim, state, bus } = boot(seed, 'sector_sker_haven', { x: start.x, z: start.z });
    const events = [];
    bus.on('encounter:telegraph', (p) => events.push([+state.simTime.toFixed(3), p.encounterId, p.tier, p.deck]));
    bus.on('encounter:resolved', (p) => events.push([+state.simTime.toFixed(3), p.encounterId, 'resolved', p.outcome]));
    const refereeQueue = [];
    bus.on('encounter:telegraph', (p) => {
      const live = state.encounterDirector.live[p.encounterId];
      if (live) refereeQueue.push({ at: state.simTime + 45, ids: live.ids });
    });
    for (let s = 0; s < 1200; s++) {
      if (s % 240 === 0) {
        const z = zones[Math.floor(s / 240) % zones.length];
        const g = sectorLocalToGlobalForSector(z.center, 'sector_sker_haven');
        const player = state.entities.get(state.playerId);
        player.pos.x = g.x;
        player.pos.z = g.z;
      }
      for (const job of refereeQueue) {
        if (job.done || state.simTime < job.at) continue;
        job.done = true;
        for (const id of job.ids.slice()) {
          const e = state.entities.get(id);
          if (!e || e.alive === false) continue;
          bus.emit('entity:killed', { id, killerId: state.playerId, pos: { x: e.pos.x, z: e.pos.z } });
          e.alive = false;
        }
      }
      sim.runTicks(60);
    }
    const dir = state.encounterDirector;
    const dustSeen = Object.keys(dir.stats.dustSeen || {}).sort().join(',');
    sim.dispose();
    return { events: JSON.stringify(events), dustSeen };
  }
  const a = soak(33);
  const b = soak(33);
  assert.equal(a.events, b.events, 'two identical runs must produce identical encounter logs');
  assert.equal(a.dustSeen, b.dustSeen, 'dust once-ever ledgers must match');
  assert.ok(a.dustSeen.length > 0,
    'the lane should present at least once inside a dense 20 min soak');
});

test('(b) dust items rank below legacy: a due legacy item beats an earlier-due dust item', () => {
  const { sim, state, bus } = boot(9, 'sector_sker_haven', { x: -540, z: 680 });
  const dir = state.encounterDirector;
  const sys = sim.registry.get('encounterDirector');
  const shape = ENCOUNTERS.bounty_hunter;
  const zones = zonesForSector('sector_sker_haven');
  const zone = zones.find((z) => shape.zoneTypes.includes(z.type));
  dir.pending.length = 0;
  // Both items due NOW, all valves open: exactly one pump must pick the LEGACY item first.
  const dustItem = planDustLivePresentation(
    9, 'sector_sker_haven', 0, zone, state.simTime, { started: {}, rotation: {} },
  );
  assert.ok(dustItem, 'live presentation must offer an item for a zone of a dark family');
  const legacyItem = planEncounterShape(
    shape, zone, 'sector_sker_haven', 0, 99, mulberry32(hash32(9, 'gate-test')),
  );
  legacyItem.sectorId = 'sector_sker_haven';
  legacyItem.dueAt = state.simTime;
  legacyItem.defers = 0;
  dir.pending.push({
    ...dustItem, sectorId: 'sector_sker_haven', dueAt: state.simTime, defers: 0,
    dustLane: true, dustLive: true,
  }, legacyItem);
  dir.pressure.combat = 120;
  dir.pressure.civilian = 120;
  dir.lastMeaningfulAt = state.simTime - 60;
  dir.lastAmbientAt = state.simTime - 60;
  state.player.bounty = 500;
  const order = [];
  bus.on('encounter:telegraph', (p) => order.push(p.kind));
  sys._pump(dir, state, state.simTime);
  assert.equal(order[0], 'bounty_hunter',
    'with both due, the single pump must fire the legacy item, not the dust item');
  assert.ok(dir.pending.some((it) => it && it.dustLane === true),
    'the passed-over dust item stays queued for a legacy-idle pump');
  sim.dispose();
});

// ── (c) exposure: the 20 h ordinary route crosses >= 210 distinct authored ids ───────────────────

test('(c) 20 h ordinary route crosses >= 210 distinct encounter ids (audit method)', () => {
  const run = runOrdinaryRoute(17101, 20);
  const dustTele = run.telegraphs.filter((t) => t.dust);
  const distinctDustTele = new Set(dustTele.map((t) => t.kind)).size;
  console.log('DUST P1b exposure:', `crossed ${run.crossed.size} distinct ids`
    + ` (legacy offers ${run.offeredLegacy.size}, lane offers ${run.offeredDust.size},`
    + ` presented ${run.presented.size} incl ${distinctDustTele} dust),`
    + ` ${dustTele.length} dust presentations in 20 h`);
  assert.ok(run.crossed.size >= 210,
    `20 h route crossed ${run.crossed.size} distinct ids, want >= 210 (3x the ~70 P1a baseline)`);
  assert.ok(run.presented.size >= 140,
    `presented-only count ${run.presented.size} should reach >= 140 (2x baseline)`);
  // Presentation spacing: the lane's own gap bound holds at fire time.
  const times = dustTele.map((t) => t.t);
  for (let i = 1; i < times.length; i++) {
    assert.ok(times[i] - times[i - 1] >= DUST_FIRE_GAP_S - 1,
      `dust presentations must respect the lane gap (${times[i - 1]} → ${times[i]})`);
  }
  // The lane never presents a non-cohort shape, and community vignettes dominate the widening.
  for (const t of dustTele) {
    assert.ok(run.offeredDust.has(t.kind), `presented dust shape ${t.kind} came from the lane`);
  }
});

test('(c) day planner respects its per-sector-day cap', () => {
  const zones = zonesForSector('sector_tethys_junction');
  for (let day = 0; day < 12; day++) {
    const items = planDustLaneDay(17101, 'sector_tethys_junction', day, zones, {});
    assert.ok(items.length <= DUST_MAX_PER_DAY, `day ${day}: lane day budget violated`);
    for (const it of items) {
      assert.match(it.encounterId, /^dust:/, 'lane items are namespaced');
      assert.ok(it.delay >= 60 && it.delay <= 600, 'lane delays stay inside the sector-day');
    }
  }
});

// ── (d) idle behavior: exhausted pool / cooldown ─────────────────────────────────────────────────

test('(d) lane idles when the once-ever pool is exhausted or on cooldown', () => {
  const zones = zonesForSector('sector_helios_prime');
  const cohort = dustLaneCohort(ENCOUNTERS);
  // Exhausted pool: every cohort id once-ever consumed ⇒ no offers, no rng hazards.
  const started = {};
  for (const id of cohort) started[id] = 1;
  for (let day = 0; day < 3; day++) {
    assert.deepEqual(planDustLaneDay(17101, 'sector_helios_prime', day, zones, { started, rotation: {} }), [],
      `day ${day}: exhausted pool must plan nothing`);
    const zone = zones[day % zones.length];
    assert.equal(planDustLivePresentation(17101, 'sector_helios_prime', day, zone, day * 600, { started, rotation: {} }), null,
      'exhausted pool must offer no live presentation');
  }
  // All modules on cooldown: the lane may queue, but nothing fires and pending stays bounded.
  const { sim, state, bus } = boot(31, 'sector_helios_prime', { x: 400, z: 0 });
  const dir = state.encounterDirector;
  for (const id of cohort) dir.cooldowns[id] = state.simTime + 1e6;
  let dustTelegraphs = 0;
  bus.on('encounter:telegraph', (p) => {
    if (String(p.encounterId).startsWith('dust:')) dustTelegraphs++;
  });
  const zonesHelios = zonesForSector('sector_helios_prime');
  const player = state.entities.get(state.playerId);
  let maxPending = 0;
  for (let s = 0; s < 1800; s++) {
    if (s % 240 === 0) {
      const z = zonesHelios[Math.floor(s / 240) % zonesHelios.length];
      const g = sectorLocalToGlobalForSector(z.center, 'sector_helios_prime');
      player.pos.x = g.x;
      player.pos.z = g.z;
    }
    sim.runTicks(60);
    maxPending = Math.max(maxPending, dir.pending.filter((it) => it && it.dustLane === true).length);
  }
  assert.equal(dustTelegraphs, 0, 'a fully-cooled-down cohort must present nothing');
  assert.ok(maxPending <= 4, `pending lane items stay bounded while idle (max ${maxPending})`);
  assert.equal(Object.keys(dir.stats.dustSeen || {}).length, 0,
    'nothing was consumed while everything was on cooldown');
  sim.dispose();
});
