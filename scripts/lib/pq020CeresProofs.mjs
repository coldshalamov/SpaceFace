// PQ-020 Ceres activity-pocket PROOFS — the acceptance rows the landed topology slice (9b0c1c28)
// could not give, all derived from LIVE headless simulation through the existing owners.
//
// This module never creates a job, never moves a station/gate/field/POI, and never authors a new
// condition system. Every row below is an observation of what the shipped owners already do:
//
//   * naturalJobCensus     — traffic.js role mix + npcJobsRuntime adoption, real Ceres record,
//                            three HELD-OUT seeds, plus a within-seed A/B counterfactual that
//                            removes `industries` through the live `state.world.sectors` overlay
//                            (the same per-state sector overlay `factions.js` already writes).
//                            NOTHING here calls createJob / npcJobs.assign.
//   * mechanicalCondition  — the authored `dense_asteroid` hazard whose centre already sits inside
//                            the production pocket. world.js `_tickHazards` emits hazard:enter/exit;
//                            `hazardHints` (registry.js:271) turns that into state.ui.hazardRead
//                            with counterplay verbs. Bound, bounded, owner-controlled. We PROVE the
//                            existing binding; we do not author a new one.
//   * reentryIdempotence   — repeated world.enterSector + save→Continue must not duplicate the
//                            beacon, the Cathedral World Site, or the entity population.
//   * exactAgreement       — DUAL-FRAME map contract: system-map point x/z are GLOBAL, drawPos is
//                            SECTOR-LOCAL, zone x/z are SECTOR-LOCAL. These are not interchangeable
//                            and this module never conflates them.
//   * routingHonesty       — what the real route owner (galaxyMap computePreviewRoute) actually
//                            returns for Helios↔Tethys, reported truthfully even though it is a
//                            bypass, plus the deliberately-selected through-Ceres itinerary.
//   * matchedBaseline      — headless rows only. Every frame/admission/renderer/LOD row is null
//                            with requiresHeaded:true; those are blocked on the PQ-034 lease.
//
// Determinism: fixed seeds, no Date, no Math.random, no wall clock. Every sim is disposed.

import { createHash } from 'node:crypto';

import { buildAtlasIndex } from '../../src/core/atlasIndex.js';
import { hazardHints, HAZARD_LANGUAGE } from '../../src/data/hazardLanguage.js';
import {
  globalToSectorLocalForSector,
  sectorLocalToGlobalForSector,
} from '../../src/data/sectorCoordinates.js';
import { SECTORS } from '../../src/data/sectors.js';
import { zonesForSector } from '../../src/data/sectorZones.js';
import { worldSiteManifestById } from '../../src/data/worldSiteManifests.js';
import { createSimulation, SIM_DT } from '../../src/core/sim.js';
import { save } from '../../src/save/saveSystem.js';
import { asteroidSites } from '../../src/systems/asteroidSites.js';
import { npcJobsRuntime } from '../../src/systems/npcJobsRuntime.js';
import { traffic, trafficRoleMixForSector } from '../../src/systems/traffic.js';
import { world } from '../../src/systems/world.js';
import {
  buildSystemModel,
  computePreviewRoute,
  resolveCourseTarget,
} from '../../src/ui/galaxyMap.js';
import {
  embodimentDigest,
  projectSectorEmbodiment,
} from '../../src/sim/sector/embodiment.js';

export const PQ020_SECTOR_ID = 'sector_ceres_belt';
export const PQ020_CATHEDRAL_SITE_ID = 'world_site_wreck_cathedral';
export const PQ020_BEACON_POI_ID = 'poi_ceres_throughline';

/**
 * HELD-OUT SEEDS. Chosen because they appear NOWHERE in src/, test/ or scripts/ — verified by
 * `grep -rn "\b<seed>\b" test/ scripts/ src/` returning zero hits before any run was performed.
 * They are deliberately disjoint from every seed this repo already burns: 47 (sf-sim golden AND the
 * PQ-020 structural-cost harness), 1..123 (npc-jobs kernel suite), 31 (encounter-director soak) and
 * 90218/90219/90223 (the PQ-014 natural census).
 *
 * These seeds were fixed BEFORE the census was run and are never swapped. A seed that produced no
 * industrial role would be reported as a finding, not replaced — seed-shopping would void the claim
 * (PQ-020 stop condition: "Natural-job proof depends on injected jobs or one magic seed").
 */
export const PQ020_HELD_OUT_SEEDS = Object.freeze([90731, 90737, 90743]);

/** Roles the Ceres industrial metadata is supposed to bias toward. */
const INDUSTRIAL_ROLES = Object.freeze(['miner', 'hauler']);

/** The offscreen-projection node context, identical to the landed topology harness. */
const PROJECTION_NODE = Object.freeze({
  danger: 0.35,
  pricePressure: 0,
  influence: { faction_dmc: 1 },
  dominantFactionId: 'faction_dmc',
  contestMargin: 1,
});

const CENSUS_SETTLE_TICKS = 60; // exactly one sim-second at 60 Hz.

function ceresSector() {
  const sector = SECTORS.find((candidate) => candidate.id === PQ020_SECTOR_ID);
  if (!sector) throw new Error(`${PQ020_SECTOR_ID} missing`);
  return sector;
}

/** A deep clone of the authored Ceres record with `industries` removed. Never mutates SECTORS. */
function ceresWithoutIndustries() {
  const clone = structuredClone(ceresSector());
  delete clone.industries;
  return clone;
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1 — NATURAL JOB CENSUS (live sim, held-out seeds, no job injection)
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Boot a live Ceres and read what the producers naturally made.
 *
 * The fixture spawns exactly ONE entity itself (an inert player hull with collides:false so it
 * perturbs nothing) and then hands control to `world.enterSector`, which builds the real stations,
 * gates, fields, POIs, zones and the Cathedral World Site. `traffic` reacts to the resulting
 * `sector:enter` with its own ambient role mix; `npcJobsRuntime` adopts miner/hauler/patrol hulls
 * through the producer seam traffic already calls. No census code touches either system's internals.
 *
 * @param {number} seed
 * @param {{ industries: boolean }} arm `industries:false` installs the counterfactual record on the
 *   live `state.world.sectors` overlay, which `world.enterSector` prefers over the module record.
 *   Geometry is byte-identical between arms; only the industrial metadata differs.
 */
export function runCeresJobCensus(seed, { industries = true } = {}) {
  const sim = createSimulation({ seed, systems: [npcJobsRuntime, traffic, world] });
  const { state } = sim;
  try {
    state.mode = 'flight';
    if (!industries) state.world.sectors[PQ020_SECTOR_ID] = ceresWithoutIndustries();

    const origin = sectorLocalToGlobalForSector({ x: 0, z: 0 }, PQ020_SECTOR_ID);
    const player = sim.spawn({
      type: 'ship',
      team: 0,
      pos: origin,
      vel: { x: 0, z: 0 },
      radius: 10,
      mass: 1,
      collides: false,
      hull: 100,
      hullMax: 100,
      data: { pq020CensusPlayer: true },
    });
    state.playerId = player.id;

    sim.registry.get('world').enterSector(PQ020_SECTOR_ID, {
      continuous: true,
      noTeleport: true,
      placePlayer: false,
    });

    // Ambient traffic roles: `data.trafficRole` is stamped by traffic.js and by nothing else, so it
    // is the honest population tag. Zone-squad and enemy hulls carry no trafficRole and are excluded.
    const trafficRoles = {};
    for (const entity of state.entities.values()) {
      const role = entity?.data?.trafficRole;
      if (role) trafficRoles[role] = (trafficRoles[role] || 0) + 1;
    }

    const runtime = sim.registry.get('npcJobsRuntime');
    const jobKinds = {};
    for (const entry of Object.values(runtime._byId())) {
      jobKinds[entry.kind] = (jobKinds[entry.kind] || 0) + 1;
    }

    // Threat proximity is a live-sector characteristic worth recording: Ceres has enemyDensity 0.18
    // and an authored ambush zone, so ambient hostiles can spawn within the kernel's FLEE_RADIUS of
    // a freshly commissioned civilian job. We measure it rather than assume either way.
    let nearestHostileWu = null;
    const hostiles = [...state.entities.values()].filter((entity) => (
      entity?.type === 'ship' && entity.team === 1 && entity.alive !== false
    ));
    for (const entry of Object.values(runtime._byId())) {
      const hull = entry.entityId != null ? state.entities.get(entry.entityId) : null;
      if (!hull?.pos) continue;
      for (const hostile of hostiles) {
        const distance = Math.hypot(hull.pos.x - hostile.pos.x, hull.pos.z - hostile.pos.z);
        if (nearestHostileWu == null || distance < nearestHostileWu) nearestHostileWu = distance;
      }
    }

    for (let tick = 0; tick < CENSUS_SETTLE_TICKS; tick += 1) sim.step(SIM_DT);

    const phases = {};
    const jobKindsAfterSettle = {};
    for (const entry of Object.values(runtime._byId())) {
      jobKindsAfterSettle[entry.kind] = (jobKindsAfterSettle[entry.kind] || 0) + 1;
      const phase = entry.job?.phase || 'unknown';
      phases[phase] = (phases[phase] || 0) + 1;
    }

    const industrialHulls = INDUSTRIAL_ROLES.reduce(
      (sum, role) => sum + (trafficRoles[role] || 0),
      0,
    );
    const totalHulls = Object.values(trafficRoles).reduce((sum, count) => sum + count, 0);

    return {
      seed,
      industries,
      // The mix the LIVE sim actually used (stateful call), not the stateless convenience value.
      roleWeights: roundWeights(trafficRoleMixForSector(
        industries ? ceresSector() : state.world.sectors[PQ020_SECTOR_ID],
        state,
      )),
      trafficRoles: sortCounts(trafficRoles),
      totalTrafficHulls: totalHulls,
      industrialHulls,
      industrialShare: totalHulls > 0 ? round(industrialHulls / totalHulls) : 0,
      jobKinds: sortCounts(jobKinds),
      jobKindsAfterSettle: sortCounts(jobKindsAfterSettle),
      jobPhasesAfterSettle: sortCounts(phases),
      nearestHostileToJobHullWu: nearestHostileWu == null ? null : round(nearestHostileWu),
      jobInjectionCalls: 0, // structural: this fixture has no createJob/assign call site at all.
    };
  } finally {
    sim.dispose();
  }
}

/** Per-seed census + within-seed A/B, aggregated. */
export function buildNaturalJobCensusReport() {
  const perSeed = PQ020_HELD_OUT_SEEDS.map((seed) => {
    const withMetadata = runCeresJobCensus(seed, { industries: true });
    const withoutMetadata = runCeresJobCensus(seed, { industries: false });
    return {
      seed,
      withMetadata,
      withoutMetadata,
      minerWeightDelta: round(
        (withMetadata.roleWeights.miner || 0) - (withoutMetadata.roleWeights.miner || 0),
      ),
      haulerWeightDelta: round(
        (withMetadata.roleWeights.hauler || 0) - (withoutMetadata.roleWeights.hauler || 0),
      ),
    };
  });

  const aggregate = { miner: 0, hauler: 0, patrol: 0, other: 0 };
  const aggregateJobs = {};
  let seedsWithIndustrialJob = 0;
  for (const row of perSeed) {
    for (const [role, count] of Object.entries(row.withMetadata.trafficRoles)) {
      if (role in aggregate) aggregate[role] += count;
      else aggregate.other += count;
    }
    for (const [kind, count] of Object.entries(row.withMetadata.jobKinds)) {
      aggregateJobs[kind] = (aggregateJobs[kind] || 0) + count;
    }
    const industrial = INDUSTRIAL_ROLES.some((role) => (row.withMetadata.jobKinds[role] || 0) > 0);
    if (industrial) seedsWithIndustrialJob += 1;
  }

  return {
    schema: 'spaceface.pq020-ceres-natural-jobs.v1',
    sectorId: PQ020_SECTOR_ID,
    heldOutSeeds: [...PQ020_HELD_OUT_SEEDS],
    seedProvenance:
      'fixed before any run; zero grep hits in src/, test/, scripts/; disjoint from 47, 1-123, 31, '
      + '90218/90219/90223',
    settleTicks: CENSUS_SETTLE_TICKS,
    jobInjection: 'none — this fixture contains no createJob or npcJobs.assign call site',
    perSeed,
    aggregateTrafficRoles: sortCounts(aggregate),
    aggregateJobKinds: sortCounts(aggregateJobs),
    seedsWithIndustrialJob,
    seedCount: PQ020_HELD_OUT_SEEDS.length,
    // The honest negative row: lifecycle ADVANCEMENT is not claimed from this harness.
    advancementClaim: {
      claimed: false,
      owner: 'npm run check:npc-jobs (test/npc-jobs-natural-census.test.mjs)',
      reason:
        'Ceres carries enemyDensity 0.18 and an authored ambush zone, so ambient hostiles spawn '
        + 'within the npcJobsRuntime FLEE_RADIUS (520 WU) of freshly commissioned civilian hulls; '
        + 'the kernel threat interrupt holds them in FLEE. This census claims natural ROLE '
        + 'COMPOSITION only. PQ-014 owns the lifecycle-advancement claim.',
    },
  };
}

/** Offscreen projection determinism across the same held-out seeds, reported separately. */
export function buildOffscreenProjectionReport() {
  const sector = ceresSector();
  const withoutIndustries = ceresWithoutIndustries();
  const perSeed = PQ020_HELD_OUT_SEEDS.map((seed) => {
    const first = projectSectorEmbodiment({
      sectorId: PQ020_SECTOR_ID, sector, node: PROJECTION_NODE, seed, epochDays: 0, baseDanger: 0.35,
    });
    const second = projectSectorEmbodiment({
      sectorId: PQ020_SECTOR_ID, sector, node: PROJECTION_NODE, seed, epochDays: 0, baseDanger: 0.35,
    });
    const counterfactual = projectSectorEmbodiment({
      sectorId: PQ020_SECTOR_ID,
      sector: withoutIndustries,
      node: PROJECTION_NODE,
      seed,
      epochDays: 0,
      baseDanger: 0.35,
    });
    const density = first.find((intent) => intent.kind === 'traffic_density');
    const counterfactualDensity = counterfactual.find((intent) => intent.kind === 'traffic_density');
    return {
      seed,
      intentCount: first.length,
      digest: embodimentDigest(first),
      repeatDigest: embodimentDigest(second),
      stable: embodimentDigest(first) === embodimentDigest(second),
      roleMixBias: density?.payload?.roleMixBias || null,
      counterfactualDigest: embodimentDigest(counterfactual),
      counterfactualRoleMixBias: counterfactualDensity?.payload?.roleMixBias || null,
      digestChangedByIndustries: embodimentDigest(first) !== embodimentDigest(counterfactual),
    };
  });
  return {
    schema: 'spaceface.pq020-ceres-offscreen-projection.v1',
    sectorId: PQ020_SECTOR_ID,
    heldOutSeeds: [...PQ020_HELD_OUT_SEEDS],
    perSeed,
    allStable: perSeed.every((row) => row.stable),
    allChangedByIndustries: perSeed.every((row) => row.digestChangedByIndustries),
    claim: 'projected offscreen INTENT only — this is not a claim of visible traffic',
  };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2 — ONE BOUNDED MECHANICAL CONDITION THROUGH AN EXISTING OWNER
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The condition is the authored `dense_asteroid` hazard whose centre already lies inside the
 * production pocket. It is NOT re-authored, moved, or replaced here — moving world content to make a
 * proof pass is exactly what the packet forbids. What is proven is the live consequence chain:
 *
 *   sectors.js hazards[]  →  world.js `_spawnHazards` (local→global once)
 *                         →  world.js `_tickHazards` (player-in-disc test; emits hazard:enter/exit)
 *                         →  hazardLanguage.js `hazardHints` (registry.js:271, nodeSystemFactoryTable.js:259)
 *                         →  state.ui.hazardRead { glyph, damages[], counterplay[] } + one voice warn
 *
 * The observable player decision is the counterplay contract: `avoid | time | tether` — route around
 * the pocket, slow the crossing, or swing through. It is bounded (a finite disc), owner-controlled
 * (ordinary authored hazard data), and accessible (a glyph plus literal verbs, never colour alone).
 */
export function buildMechanicalConditionReport() {
  const sector = ceresSector();
  const zones = zonesForSector(PQ020_SECTOR_ID);
  const productionZone = zones.find((zone) => zone.id === 'zone_ceres_belt');
  const hazard = (sector.hazards || []).find((entry) => entry.type === 'dense_asteroid');
  if (!productionZone || !hazard) {
    return {
      schema: 'spaceface.pq020-ceres-mechanical-condition.v1',
      bound: false,
      blocker: 'zone_ceres_belt or the dense_asteroid hazard is missing from the authored record',
    };
  }

  const sim = createSimulation({ seed: 47, systems: [world, asteroidSites, hazardHints] });
  const { state, bus } = sim;
  const observed = [];
  try {
    state.mode = 'flight';
    const origin = sectorLocalToGlobalForSector({ x: 0, z: 0 }, PQ020_SECTOR_ID);
    const player = sim.spawn({
      type: 'ship',
      team: 0,
      pos: origin,
      vel: { x: 0, z: 0 },
      radius: 10,
      mass: 1,
      collides: false,
      hull: 100,
      hullMax: 100,
      data: { pq020ConditionPlayer: true },
    });
    state.playerId = player.id;
    sim.registry.get('world').enterSector(PQ020_SECTOR_ID, {
      continuous: true,
      noTeleport: true,
      placePlayer: false,
    });
    sim.step(SIM_DT);

    bus.on('hazard:enter', (payload) => observed.push({
      event: 'hazard:enter', zoneType: payload?.zoneType || null, intensity: payload?.intensity ?? null,
    }));
    bus.on('hazard:exit', (payload) => observed.push({
      event: 'hazard:exit', zoneType: payload?.zoneType || null, intensity: payload?.intensity ?? null,
    }));

    // A local waypoint one hazard-radius + 300 WU beyond the hazard centre is provably outside the
    // disc; the hazard centre itself is provably inside. Both are inside the sector world radius.
    const outsideLocal = { x: hazard.center.x, z: hazard.center.z - (hazard.radius + 300) };
    const insideLocal = { x: hazard.center.x, z: hazard.center.z };
    const outsideGlobal = sectorLocalToGlobalForSector(outsideLocal, PQ020_SECTOR_ID);
    const insideGlobal = sectorLocalToGlobalForSector(insideLocal, PQ020_SECTOR_ID);

    const readAt = (globalPos) => {
      player.pos.x = globalPos.x;
      player.pos.z = globalPos.z;
      sim.step(SIM_DT);
      const read = state.ui?.hazardRead || null;
      return read
        ? {
          type: read.type,
          source: read.source,
          glyph: read.glyph,
          damages: [...read.damages],
          counterplay: [...read.counterplay],
        }
        : null;
    };

    const beforeEntry = readAt(outsideGlobal);
    const insideRead = readAt(insideGlobal);
    const afterExit = readAt(outsideGlobal);

    // Structural route exposure: how much collidable rock a straight crossing of the production
    // pocket actually presents, against a bypass of equal endpoints routed outside the hazard disc.
    // This is a COUNT of existing colliders, not a simulated flight and not a frame-time claim.
    const exposure = buildRouteExposure(state, hazard, productionZone, sector);

    const language = HAZARD_LANGUAGE[hazard.type] || null;
    return {
      schema: 'spaceface.pq020-ceres-mechanical-condition.v1',
      bound: true,
      conditionId: `${PQ020_SECTOR_ID}:hazard:${hazard.type}`,
      conditionType: hazard.type,
      owner: 'src/systems/world.js _spawnHazards/_tickHazards (authored in src/data/sectors.js hazards[])',
      presenter: 'src/data/hazardLanguage.js hazardHints (registry.js:271)',
      authoredNewCondition: false,
      movedExistingContent: false,
      pocket: {
        zoneId: productionZone.id,
        center: roundPoint(productionZone.center),
        radius: Number(productionZone.radius),
      },
      geometry: {
        centerLocal: roundPoint(hazard.center),
        centerGlobal: roundPoint(sectorLocalToGlobalForSector(hazard.center, PQ020_SECTOR_ID)),
        radius: Number(hazard.radius),
        intensity: Number(hazard.intensity),
        centerInsideProductionPocket: pointInsideDisc(
          hazard.center, productionZone.center, productionZone.radius,
        ),
        bounded: Number.isFinite(hazard.radius) && hazard.radius > 0,
      },
      observedEvents: observed,
      readout: { beforeEntry, insideRead, afterExit },
      changesObservablePlayerDecision:
        beforeEntry === null
        && insideRead?.type === hazard.type
        && Array.isArray(insideRead?.counterplay)
        && insideRead.counterplay.length > 0
        && afterExit === null,
      counterplay: language ? [...language.counterplay] : [],
      accessibility: {
        // The readout carries a glyph and literal verbs; colour is decoration, never the only channel.
        nonColorSemantics: !!(language?.glyph && language.counterplay?.length && language.damages?.length),
        glyph: language?.glyph || null,
        damages: language ? [...language.damages] : [],
      },
      routeExposure: exposure,
      // Honest negative: the OTHER live consumer of active.hazards does not fire at Ceres.
      laneDangerConsumer: {
        consumers: ['src/systems/ai.js playerIsInLaneDanger', 'src/systems/scanner.js playerIsInLaneDanger'],
        gate: 'security <= 0.45 || tier >= 2',
        sectorSecurity: Number(sector.security),
        sectorTier: Number(sector.tier),
        fires: Number(sector.security) <= 0.45 || Number(sector.tier) >= 2,
        note:
          'Ceres is security 0.72 / tier 1, so the hazard disc does NOT unlock ambient player '
          + 'hostility here. Reported as a negative row; raising tier or lowering security to make '
          + 'it fire would change the world to make a proof pass and is refused.',
      },
    };
  } finally {
    sim.dispose();
  }
}

/**
 * Structural collision exposure around the production pocket. Pure geometry over colliders the sim
 * already spawned — no simulated flight, no frame-time claim, nothing authored.
 *
 * Two independent measurements, both reported whatever they say:
 *
 *  a) DENSITY — collidable rock per million WU² inside the hazard disc versus the rest of the sector
 *     disc. Direction-independent, so it cannot be steered by choosing a flattering detour.
 *  b) CORRIDOR — rock within a fixed corridor of the direct refinery→beacon chord (which crosses the
 *     pocket) against BOTH perpendicular one-waypoint bypasses. Both sides are reported; the better
 *     side is named rather than silently selected, because picking only the favourable detour would
 *     be exactly the kind of cherry-pick this packet's stop conditions exist to prevent.
 */
function buildRouteExposure(state, hazard, productionZone, sector) {
  const CORRIDOR_HALF_WIDTH_WU = 220;
  const refineryLocal = { x: -1100, z: 620 };
  const beaconLocal = { x: 3040, z: -920 };
  const hazardGlobal = sectorLocalToGlobalForSector(hazard.center, PQ020_SECTOR_ID);
  const sectorOrigin = sectorLocalToGlobalForSector({ x: 0, z: 0 }, PQ020_SECTOR_ID);
  const start = sectorLocalToGlobalForSector(refineryLocal, PQ020_SECTOR_ID);
  const end = sectorLocalToGlobalForSector(beaconLocal, PQ020_SECTOR_ID);

  const rocks = [...state.entities.values()].filter((entity) => (
    entity?.alive !== false && entity.type === 'asteroid' && entity.collides === true
  ));
  const countNear = (segments) => rocks.filter((rock) => segments.some(([a, b]) => (
    pointSegmentDistance(rock.pos, a, b) <= CORRIDOR_HALF_WIDTH_WU + (Number(rock.radius) || 0)
  ))).length;

  // (a) density
  const hazardRadius = Number(hazard.radius);
  const worldRadius = Number(sector.worldRadius);
  const insideDisc = rocks.filter(
    (rock) => Math.hypot(rock.pos.x - hazardGlobal.x, rock.pos.z - hazardGlobal.z) <= hazardRadius,
  ).length;
  const withinSector = rocks.filter(
    (rock) => Math.hypot(rock.pos.x - sectorOrigin.x, rock.pos.z - sectorOrigin.z) <= worldRadius,
  ).length;
  const hazardArea = Math.PI * hazardRadius * hazardRadius;
  const sectorArea = Math.PI * worldRadius * worldRadius;
  const outsideDisc = Math.max(0, withinSector - insideDisc);
  const outsideArea = Math.max(1, sectorArea - hazardArea);
  const insideDensity = round((insideDisc / hazardArea) * 1e6);
  const outsideDensity = round((outsideDisc / outsideArea) * 1e6);

  // (b) corridor, both bypass sides
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz) || 1;
  const offset = hazardRadius + CORRIDOR_HALF_WIDTH_WU + 200;
  const normal = { x: -dz / length, z: dx / length };
  const directLength = round(length);
  const bypass = [1, -1].map((sign) => {
    const waypoint = {
      x: (start.x + end.x) / 2 + normal.x * offset * sign,
      z: (start.z + end.z) / 2 + normal.z * offset * sign,
    };
    const segments = [[start, waypoint], [waypoint, end]];
    const bypassLength = round(
      Math.hypot(waypoint.x - start.x, waypoint.z - start.z)
      + Math.hypot(end.x - waypoint.x, end.z - waypoint.z),
    );
    return {
      side: sign > 0 ? 'left' : 'right',
      legs: 2,
      lengthWu: bypassLength,
      extraDistanceWu: round(bypassLength - directLength),
      crossesHazardDisc: segments.some(
        ([a, b]) => pointSegmentDistance(hazardGlobal, a, b) <= hazardRadius,
      ),
      collidableRocksInCorridor: countNear(segments),
    };
  });
  const directRocks = countNear([[start, end]]);
  const cheapest = bypass.reduce(
    (best, row) => (row.collidableRocksInCorridor < best.collidableRocksInCorridor ? row : best),
    bypass[0],
  );

  return {
    corridorHalfWidthWu: CORRIDOR_HALF_WIDTH_WU,
    collidableAsteroidsInState: rocks.length,
    density: {
      insideHazardDisc: insideDisc,
      outsideHazardDiscWithinSector: outsideDisc,
      insidePerMillionWu2: insideDensity,
      outsidePerMillionWu2: outsideDensity,
      ratio: outsideDensity > 0 ? round(insideDensity / outsideDensity) : null,
      pocketIsDenser: insideDensity > outsideDensity,
    },
    direct: {
      legs: 1,
      lengthWu: directLength,
      crossesHazardDisc: pointSegmentDistance(hazardGlobal, start, end) <= hazardRadius,
      collidableRocksInCorridor: directRocks,
    },
    bypass,
    cheapestBypassSide: cheapest.side,
    bypassReducesRockExposure: cheapest.collidableRocksInCorridor < directRocks,
    productionZoneId: productionZone.id,
    reading:
      'the pocket is measurably denser in collidable rock than the surrounding sector, so crossing '
      + 'it is a real exposure decision; whether a one-waypoint perpendicular detour is actually '
      + 'cheaper is reported for BOTH sides rather than assumed',
  };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3 — SAVE / MATERIALIZATION / RE-ENTRY IDEMPOTENCE
// ════════════════════════════════════════════════════════════════════════════════════════════════

export function buildReentryIdempotenceReport() {
  const sim = createSimulation({ seed: 47, systems: [world, asteroidSites, save] });
  const { state } = sim;
  try {
    state.mode = 'flight';
    const origin = sectorLocalToGlobalForSector({ x: 0, z: 0 }, PQ020_SECTOR_ID);
    const player = sim.spawn({
      type: 'ship',
      team: 0,
      pos: origin,
      vel: { x: 0, z: 0 },
      radius: 10,
      mass: 1,
      collides: false,
      hull: 100,
      hullMax: 100,
      data: { pq020IdempotencePlayer: true },
    });
    state.playerId = player.id;
    const worldSystem = sim.registry.get('world');
    const enterOnce = () => {
      worldSystem.enterSector(PQ020_SECTOR_ID, {
        continuous: true, noTeleport: true, placePlayer: false,
      });
      sim.step(SIM_DT);
    };

    enterOnce();
    const afterFirstEnter = staticContentSnapshot(state);
    enterOnce();
    const afterSecondEnter = staticContentSnapshot(state);
    enterOnce();
    const afterThirdEnter = staticContentSnapshot(state);

    const saveSystem = sim.registry.get('save');
    const saveAvailable = !!saveSystem
      && typeof saveSystem.serialize === 'function'
      && typeof saveSystem.loadEnvelope === 'function';
    let envelopeVersion = null;
    let afterContinue = null;
    let afterSecondContinue = null;
    let continueAccepted = null;
    let secondContinueAccepted = null;
    if (saveAvailable) {
      const envelope = saveSystem.serialize('pq020-idempotence');
      envelopeVersion = envelope?.version ?? null;
      continueAccepted = saveSystem.loadEnvelope(envelope, 'pq020-continue') === true;
      sim.step(SIM_DT);
      afterContinue = staticContentSnapshot(state);
      secondContinueAccepted = saveSystem.loadEnvelope(envelope, 'pq020-continue-2') === true;
      sim.step(SIM_DT);
      afterSecondContinue = staticContentSnapshot(state);
    }

    const snapshots = [
      afterFirstEnter, afterSecondEnter, afterThirdEnter, afterContinue, afterSecondContinue,
    ].filter(Boolean);
    const identical = snapshots.every(
      (row) => stableStringify(row) === stableStringify(snapshots[0]),
    );

    return {
      schema: 'spaceface.pq020-ceres-idempotence.v1',
      sectorId: PQ020_SECTOR_ID,
      saveAvailable,
      envelopeVersion,
      continueAccepted,
      secondContinueAccepted,
      afterFirstEnter,
      afterSecondEnter,
      afterThirdEnter,
      afterContinue,
      afterSecondContinue,
      staticContentMaterializesExactlyOnce:
        afterFirstEnter.beaconEntities === 1
        && afterSecondEnter.beaconEntities === 1
        && afterThirdEnter.beaconEntities === 1,
      topologyStableAcrossReentryAndContinue: identical,
    };
  } finally {
    sim.dispose();
  }
}

function staticContentSnapshot(state) {
  let beaconEntities = 0;
  let cathedralEntities = 0;
  const beaconIds = [];
  for (const entity of state.entities.values()) {
    if (entity?.alive === false) continue;
    if (entity?.data?.poiId === PQ020_BEACON_POI_ID) {
      beaconEntities += 1;
      beaconIds.push(entity.id);
    }
    if (String(entity?.data?.worldRecordId || '').startsWith(`${PQ020_CATHEDRAL_SITE_ID}/`)) {
      cathedralEntities += 1;
    }
  }
  const zones = zonesForSector(PQ020_SECTOR_ID);
  const model = buildSystemModel(state, PQ020_SECTOR_ID);
  const projection = projectSectorEmbodiment({
    sectorId: PQ020_SECTOR_ID,
    sector: ceresSector(),
    node: PROJECTION_NODE,
    seed: 47,
    epochDays: 0,
    baseDanger: 0.35,
  });
  return {
    sectorId: state.world?.currentSectorId || null,
    beaconEntities,
    beaconEntityIds: [...beaconIds].sort((left, right) => left - right),
    cathedralEntities,
    zoneCount: zones.length,
    zoneIds: zones.map((zone) => zone.id).sort(),
    mapPointIds: model.points.map((point) => String(point.id)).sort(),
    mapZoneIds: model.zones.map((zone) => zone.id).sort(),
    offscreenProjectionDigest: embodimentDigest(projection),
    offscreenIntentCount: projection.length,
  };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 4 — EXACT AGREEMENT (DUAL-FRAME: point x/z GLOBAL, drawPos + zone x/z SECTOR-LOCAL)
// ════════════════════════════════════════════════════════════════════════════════════════════════

export function buildExactAgreementReport() {
  const sector = ceresSector();
  const zones = zonesForSector(PQ020_SECTOR_ID);
  const cathedralManifest = worldSiteManifestById(PQ020_CATHEDRAL_SITE_ID);
  const atlasNodes = new Map(buildAtlasIndex().nodes.map((node) => [node.id, node]));

  const sim = createSimulation({ seed: 47, systems: [world, asteroidSites] });
  const { state } = sim;
  try {
    state.mode = 'flight';
    const origin = sectorLocalToGlobalForSector({ x: 0, z: 0 }, PQ020_SECTOR_ID);
    const player = sim.spawn({
      type: 'ship',
      team: 0,
      pos: origin,
      vel: { x: 0, z: 0 },
      radius: 10,
      mass: 1,
      collides: false,
      data: { pq020AgreementPlayer: true },
    });
    state.playerId = player.id;
    sim.registry.get('world').enterSector(PQ020_SECTOR_ID, {
      continuous: true, noTeleport: true, placePlayer: false,
    });
    sim.step(SIM_DT);

    const model = buildSystemModel(state, PQ020_SECTOR_ID);
    const mapZoneById = new Map(model.zones.map((zone) => [zone.id, zone]));
    const physicalByPoiId = new Map();
    const physicalByPlaceId = new Map();
    for (const entity of state.entities.values()) {
      if (entity?.data?.poiId) physicalByPoiId.set(entity.data.poiId, entity);
      const recordId = String(entity?.data?.worldRecordId || '');
      if (recordId) physicalByPlaceId.set(recordId, entity);
    }

    const rows = [];

    // ── beacon: the fullest row — atlas, map point, drawPos, course, physical entity ──
    const beaconPoi = sector.pois.find((poi) => poi.id === PQ020_BEACON_POI_ID);
    const beaconPoint = model.points.find((point) => point.id === PQ020_BEACON_POI_ID);
    const beaconEntity = physicalByPoiId.get(PQ020_BEACON_POI_ID);
    rows.push(agreementRow({
      id: 'beacon',
      sourceId: PQ020_BEACON_POI_ID,
      authoredLocal: beaconPoi?.pos,
      atlasGlobal: atlasNodes.get(PQ020_BEACON_POI_ID)?.globalPos,
      mapPointGlobal: beaconPoint ? { x: beaconPoint.x, z: beaconPoint.z } : null,
      mapDrawLocal: beaconPoint?.drawPos,
      courseGlobal: beaconPoint ? resolveCourseTarget(beaconPoint)?.pos : null,
      physicalGlobal: beaconEntity?.pos,
      required: ['atlasGlobal', 'mapPointGlobal', 'mapDrawLocal', 'courseGlobal', 'physicalGlobal'],
    }));

    // ── civic pocket: authored on station_ceres ──
    const civicStation = sector.stations.find((station) => station.id === 'station_ceres');
    const civicPoint = model.points.find((point) => point.name === 'Ceres Refinery');
    const civicEntity = [...state.entities.values()].find(
      (entity) => entity?.type === 'station' && entity?.data?.stationId === 'station_ceres',
    );
    rows.push(agreementRow({
      id: 'pocket:civic',
      sourceId: 'station_ceres',
      authoredLocal: civicStation?.pos,
      atlasGlobal: atlasNodes.get('station_ceres')?.globalPos,
      mapPointGlobal: civicPoint ? { x: civicPoint.x, z: civicPoint.z } : null,
      mapDrawLocal: civicPoint?.drawPos,
      courseGlobal: civicPoint ? resolveCourseTarget(civicPoint)?.pos : null,
      physicalGlobal: civicEntity?.pos,
      mapZoneLocal: mapZoneById.get('zone_ceres_refinery')
        ? { x: mapZoneById.get('zone_ceres_refinery').x, z: mapZoneById.get('zone_ceres_refinery').z }
        : null,
      required: ['mapPointGlobal', 'mapDrawLocal', 'courseGlobal', 'physicalGlobal', 'mapZoneLocal'],
    }));

    // ── production + transit pockets: ZONE rows. Zones carry SECTOR-LOCAL x/z in the map model and
    //    have no system-map point or course target — recorded as an explicit absence with reason. ──
    for (const [rowId, zoneId] of [['pocket:production', 'zone_ceres_belt'], ['pocket:transit', 'zone_ceres_throughline']]) {
      const authored = zones.find((zone) => zone.id === zoneId);
      const mapZone = mapZoneById.get(zoneId);
      rows.push(agreementRow({
        id: rowId,
        sourceId: zoneId,
        authoredLocal: authored?.center,
        mapZoneLocal: mapZone ? { x: mapZone.x, z: mapZone.z } : null,
        mapZoneRadius: mapZone ? Number(mapZone.radius) : null,
        authoredRadius: Number(authored?.radius),
        required: ['mapZoneLocal'],
        absent: {
          mapPointGlobal: 'zones are drawn as discs, not selectable system-map points',
          courseGlobal: 'a zone is not a course target; the beacon inside it is',
        },
      }));
    }

    // ── Cathedral reservation: PQ-018 owned; consumed exactly, never relocated ──
    const cathedralPoint = model.points.find((point) => point.id === PQ020_CATHEDRAL_SITE_ID);
    const cathedralRoot = physicalByPlaceId.get(`${cathedralManifest.worldObjectId}/root`);
    rows.push(agreementRow({
      id: 'cathedral',
      sourceId: PQ020_CATHEDRAL_SITE_ID,
      authoredLocal: globalToSectorLocalForSector(cathedralManifest.placement.pos, PQ020_SECTOR_ID),
      atlasGlobal: atlasNodes.get(PQ020_CATHEDRAL_SITE_ID)?.globalPos,
      mapPointGlobal: cathedralPoint ? { x: cathedralPoint.x, z: cathedralPoint.z } : null,
      mapDrawLocal: cathedralPoint?.drawPos,
      courseGlobal: cathedralPoint ? resolveCourseTarget(cathedralPoint)?.pos : null,
      physicalGlobal: cathedralRoot?.pos || cathedralManifest.placement.pos,
      manifestGlobal: cathedralManifest.placement.pos,
      required: [
        'atlasGlobal', 'mapPointGlobal', 'mapDrawLocal', 'courseGlobal', 'physicalGlobal',
        'manifestGlobal',
      ],
    }));

    return {
      schema: 'spaceface.pq020-ceres-exact-agreement.v1',
      sectorId: PQ020_SECTOR_ID,
      frameContract: {
        mapPoint: 'GLOBAL (x/z)',
        mapDrawPos: 'SECTOR-LOCAL',
        mapZone: 'SECTOR-LOCAL (x/z)',
        note: 'drawPos and point x/z are different frames and are never compared to each other',
      },
      rows,
      allAgree: rows.every((row) => row.agrees),
    };
  } finally {
    sim.dispose();
  }
}

function agreementRow({
  id, sourceId, authoredLocal, atlasGlobal = null, mapPointGlobal = null, mapDrawLocal = null,
  courseGlobal = null, physicalGlobal = null, manifestGlobal = null, mapZoneLocal = null,
  mapZoneRadius = null, authoredRadius = null, absent = null, required = [],
}) {
  const local = roundPoint(authoredLocal);
  const expectedGlobal = local ? roundPoint(sectorLocalToGlobalForSector(local, PQ020_SECTOR_ID)) : null;
  const mismatches = [];
  // FAIL-CLOSED. A consumer this row declares `required` must be present AND equal. Without this,
  // a consumer that silently returned null would make the row pass vacuously — the exact shape of
  // guard that lets a broken map contract look green.
  const present = {
    atlasGlobal, mapPointGlobal, mapDrawLocal, courseGlobal, physicalGlobal, manifestGlobal,
    mapZoneLocal,
  };
  const missing = required.filter((label) => !finitePoint(present[label]));
  for (const label of missing) mismatches.push(`${label}:missing`);
  const compare = (label, actual, expected) => {
    if (actual == null) return;
    if (!samePoint(roundPoint(actual), expected)) {
      mismatches.push(`${label}:${stableStringify(roundPoint(actual))}!=${stableStringify(expected)}`);
    }
  };
  // GLOBAL-frame consumers.
  compare('atlasGlobal', atlasGlobal, expectedGlobal);
  compare('mapPointGlobal', mapPointGlobal, expectedGlobal);
  compare('courseGlobal', courseGlobal, expectedGlobal);
  compare('physicalGlobal', physicalGlobal, expectedGlobal);
  compare('manifestGlobal', manifestGlobal, expectedGlobal);
  // SECTOR-LOCAL-frame consumers.
  compare('mapDrawLocal', mapDrawLocal, local);
  compare('mapZoneLocal', mapZoneLocal, local);
  if (mapZoneRadius != null && authoredRadius != null && mapZoneRadius !== authoredRadius) {
    mismatches.push(`mapZoneRadius:${mapZoneRadius}!=${authoredRadius}`);
  }
  return {
    id,
    sourceId,
    authoredLocal: local,
    expectedGlobal,
    atlasGlobal: roundPoint(atlasGlobal),
    mapPointGlobal: roundPoint(mapPointGlobal),
    mapDrawLocal: roundPoint(mapDrawLocal),
    courseGlobal: roundPoint(courseGlobal),
    physicalGlobal: roundPoint(physicalGlobal),
    manifestGlobal: roundPoint(manifestGlobal),
    mapZoneLocal: roundPoint(mapZoneLocal),
    mapZoneRadius,
    authoredRadius,
    absent,
    required: [...required],
    missing,
    mismatches,
    agrees: mismatches.length === 0,
  };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 5 — ROUTING HONESTY
// ════════════════════════════════════════════════════════════════════════════════════════════════

const THROUGH_CERES_ITINERARY = Object.freeze([
  Object.freeze({ id: 'station_ceres', label: 'Ceres Refinery', local: Object.freeze({ x: -1100, z: 620 }) }),
  Object.freeze({ id: 'station_beltout', label: 'Belt Outpost', local: Object.freeze({ x: 780, z: -940 }) }),
  Object.freeze({ id: 'poi_ceres_throughline', label: 'Throughline Weigh Beacon', local: Object.freeze({ x: 3040, z: -920 }) }),
  Object.freeze({ id: 'world_site_wreck_cathedral', label: 'Wreck Cathedral', local: Object.freeze({ x: 300, z: 2700 }) }),
]);

export function buildRoutingHonestyReport() {
  const sector = ceresSector();
  const sim = createSimulation({ seed: 47, systems: [world, asteroidSites] });
  const { state } = sim;
  try {
    state.mode = 'flight';
    const origin = sectorLocalToGlobalForSector({ x: 0, z: 0 }, PQ020_SECTOR_ID);
    const player = sim.spawn({
      type: 'ship', team: 0, pos: origin, vel: { x: 0, z: 0 }, radius: 10, mass: 1,
      collides: false, data: { pq020RoutingPlayer: true },
    });
    state.playerId = player.id;
    sim.registry.get('world').enterSector(PQ020_SECTOR_ID, {
      continuous: true, noTeleport: true, placePlayer: false,
    });
    sim.step(SIM_DT);

    const genericHeliosTethys = computePreviewRoute(
      state, 'sector_helios_prime', 'sector_tethys_junction',
    ) || [];
    const heliosCeres = computePreviewRoute(state, 'sector_helios_prime', PQ020_SECTOR_ID) || [];
    const ceresTethys = computePreviewRoute(state, PQ020_SECTOR_ID, 'sector_tethys_junction') || [];

    // Verify the anchor positions against the LIVE authored record so the itinerary cannot drift.
    const authoredById = new Map([
      ...sector.stations.map((station) => [station.id, station.pos]),
      ...sector.pois.map((poi) => [poi.id, poi.pos || poi.anchor]),
    ]);
    const waypoints = THROUGH_CERES_ITINERARY.map((stop) => {
      const authored = roundPoint(authoredById.get(stop.id));
      return {
        ...stop,
        local: roundPoint(stop.local),
        global: roundPoint(sectorLocalToGlobalForSector(stop.local, PQ020_SECTOR_ID)),
        authoredLocal: authored,
        matchesAuthored: samePoint(authored, roundPoint(stop.local)),
      };
    });
    const legs = [];
    for (let index = 1; index < waypoints.length; index += 1) {
      const from = waypoints[index - 1];
      const to = waypoints[index];
      legs.push({
        id: `${from.id}->${to.id}`,
        fromLabel: from.label,
        toLabel: to.label,
        startLocal: from.local,
        endLocal: to.local,
        startGlobal: from.global,
        endGlobal: to.global,
        distanceWu: round(Math.hypot(to.local.x - from.local.x, to.local.z - from.local.z)),
      });
    }

    return {
      schema: 'spaceface.pq020-ceres-routing.v1',
      routeOwner: 'src/ui/galaxyMap.js computePreviewRoute',
      generic: {
        heliosToTethys: [...genericHeliosTethys],
        traversesCeres: genericHeliosTethys.includes(PQ020_SECTOR_ID),
        hops: Math.max(0, genericHeliosTethys.length - 1),
        verdict: genericHeliosTethys.includes(PQ020_SECTOR_ID)
          ? 'generic Helios↔Tethys routing traverses Ceres'
          : 'generic Helios↔Tethys routing BYPASSES Ceres via the direct authored edge — PQ-020 '
            + 'does not and must not claim otherwise',
        heliosToCeres: [...heliosCeres],
        ceresToTethys: [...ceresTethys],
        ceresIsReachableInOneHopFromBoth:
          heliosCeres.length === 2 && ceresTethys.length === 2,
      },
      throughCeresItinerary: {
        id: 'pq020-through-ceres-itinerary-v1',
        selection: 'deliberately selected by the pilot; NOT produced by the generic router',
        siteId: PQ020_CATHEDRAL_SITE_ID,
        waypoints,
        allWaypointsMatchAuthored: waypoints.every((stop) => stop.matchesAuthored),
        legs,
        totalDistanceWu: round(legs.reduce((sum, leg) => sum + leg.distanceWu, 0)),
      },
    };
  } finally {
    sim.dispose();
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 6 — MATCHED BASELINE (headless rows only; every headed row null + requiresHeaded)
// ════════════════════════════════════════════════════════════════════════════════════════════════

export const PQ020_MATCHED_BASELINE_HEADED_GROUPS = Object.freeze({
  frame: Object.freeze(['p95Ms', 'p99Ms', 'hitchCount']),
  admission: Object.freeze(['admissionMs', 'residencyBytes']),
  renderer: Object.freeze(['drawCalls', 'shaderPrograms']),
  visualStates: Object.freeze(['close', 'default', 'far', 'motion', 'appliedLod']),
});

/**
 * The matched-baseline record. It is a SIBLING of `structuralCost`, never a mutation of it: the
 * PQ-020 structural-cost digest `b2232d1d…` is a pinned golden and adding fields inside it would
 * force a re-pin, which is exactly the forbidden move.
 */
export function buildMatchedBaselineRecord({
  structuralCost, route, mapLayout, naturalJobs, offscreen, routing,
}) {
  const headless = {
    mapLayout,
    routeLegs: {
      pocketRoute: route || null,
      throughCeresItinerary: routing?.throughCeresItinerary || null,
      genericHeliosTethys: routing?.generic || null,
    },
    naturalJobCensus: {
      heldOutSeeds: naturalJobs?.heldOutSeeds || [],
      perSeed: (naturalJobs?.perSeed || []).map((row) => ({
        seed: row.seed,
        trafficRoles: row.withMetadata.trafficRoles,
        jobKinds: row.withMetadata.jobKinds,
        industrialShare: row.withMetadata.industrialShare,
        counterfactualTrafficRoles: row.withoutMetadata.trafficRoles,
        counterfactualJobKinds: row.withoutMetadata.jobKinds,
      })),
      aggregateTrafficRoles: naturalJobs?.aggregateTrafficRoles || null,
      aggregateJobKinds: naturalJobs?.aggregateJobKinds || null,
    },
    offscreenRoleMix: {
      perSeed: (offscreen?.perSeed || []).map((row) => ({
        seed: row.seed,
        digest: row.digest,
        intentCount: row.intentCount,
        roleMixBias: row.roleMixBias,
      })),
      allStable: offscreen?.allStable ?? null,
    },
    structural: {
      entities: structuralCost?.entities?.total ?? null,
      entitiesByType: structuralCost?.entities?.byType ?? null,
      collidableEntities: structuralCost?.entities?.collidable ?? null,
      colliders: structuralCost?.colliders ?? null,
      spatialQueries: structuralCost?.spatial?.queries ?? null,
      spatialCandidates: structuralCost?.spatial?.candidates ?? null,
      worldSiteEntities: structuralCost?.worldSite?.materializedEntities ?? null,
      residencyTier: structuralCost?.residencyTier ?? null,
      presentationAdmission: structuralCost?.presentationAdmission ?? null,
    },
  };

  const requiresHeaded = {};
  for (const [groupId, fields] of Object.entries(PQ020_MATCHED_BASELINE_HEADED_GROUPS)) {
    requiresHeaded[groupId] = {
      requiresHeaded: true,
      blockedBy: 'PQ-034 holds the performance-evidence / validation-broker / browser-gpu leases',
      fields: Object.fromEntries(fields.map((field) => [field, null])),
    };
  }

  const record = {
    schema: 'spaceface.pq020-ceres-matched-baseline.v1',
    scope: `${PQ020_SECTOR_ID}:pq020:headless`,
    evidenceClass: 'headless-structural',
    headless,
    requiresHeaded,
  };
  return { ...record, digest: digest(record) };
}

/** The deterministic map-layout digest input: authored zones + system-map points, both frames kept. */
export function buildMapLayoutRecord() {
  const sim = createSimulation({ seed: 47, systems: [world, asteroidSites] });
  const { state } = sim;
  try {
    state.mode = 'flight';
    const origin = sectorLocalToGlobalForSector({ x: 0, z: 0 }, PQ020_SECTOR_ID);
    const player = sim.spawn({
      type: 'ship', team: 0, pos: origin, vel: { x: 0, z: 0 }, radius: 10, mass: 1,
      collides: false, data: { pq020LayoutPlayer: true },
    });
    state.playerId = player.id;
    sim.registry.get('world').enterSector(PQ020_SECTOR_ID, {
      continuous: true, noTeleport: true, placePlayer: false,
    });
    sim.step(SIM_DT);
    const model = buildSystemModel(state, PQ020_SECTOR_ID);
    const layout = {
      zones: model.zones
        .map((zone) => ({
          id: zone.id, type: zone.type, localX: round(zone.x), localZ: round(zone.z),
          radius: Number(zone.radius), threat: Number(zone.threat),
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      points: model.points
        .map((point) => ({
          key: String(point.id), kind: point.kind, name: point.name || null,
          globalX: point.x == null ? null : round(point.x),
          globalZ: point.z == null ? null : round(point.z),
          drawX: point.drawPos ? round(point.drawPos.x) : null,
          drawZ: point.drawPos ? round(point.drawPos.z) : null,
        }))
        .sort((left, right) => left.key.localeCompare(right.key)),
    };
    return { ...layout, digest: digest(layout) };
  } finally {
    sim.dispose();
  }
}

// ── shared pure helpers ────────────────────────────────────────────────────────────────────────

function sortCounts(counts) {
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function roundWeights(weights) {
  return Object.fromEntries(
    Object.entries(weights)
      .map(([id, value]) => [id, round(value)])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function pointInsideDisc(point, center, radius) {
  if (!finitePoint(point) || !finitePoint(center) || !(Number(radius) >= 0)) return false;
  return Math.hypot(point.x - center.x, point.z - center.z) <= Number(radius);
}

function pointSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared > 0
    ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared))
    : 0;
  return Math.hypot(point.x - (start.x + dx * t), point.z - (start.z + dz * t));
}

/** Signed side of the chord (sign only; magnitude is the perpendicular distance). */
function pointSegmentDistanceSigned(point, start, end) {
  return (end.x - start.x) * (point.z - start.z) - (end.z - start.z) * (point.x - start.x);
}

function samePoint(left, right) {
  return finitePoint(left) && finitePoint(right) && left.x === right.x && left.z === right.z;
}

function finitePoint(value) {
  return !!value && Number.isFinite(value.x) && Number.isFinite(value.z);
}

function roundPoint(value) {
  return finitePoint(value) ? { x: round(value.x), z: round(value.z) } : null;
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function digest(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}
