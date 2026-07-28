import { createHash } from 'node:crypto';

import { buildAtlasIndex } from '../../src/core/atlasIndex.js';
import {
  presentationOwnerAdmissionForWorldRecord,
} from '../../src/core/presentationAdmission.js';
import { createSimulation, SIM_DT } from '../../src/core/sim.js';
import {
  expandProxyPrimitives,
  resolveCollisionProxyManifest,
} from '../../src/data/collisionProxyManifests.js';
import {
  CERES_THROUGHLINE_BEACON_LOCAL_POS,
  CERES_WRECK_CATHEDRAL_LOCAL_POS,
} from '../../src/data/sectorAnchors.js';
import {
  globalToSectorLocalForSector,
  sectorLocalToGlobalForSector,
} from '../../src/data/sectorCoordinates.js';
import { SECTORS } from '../../src/data/sectors.js';
import { zonesForSector } from '../../src/data/sectorZones.js';
import { worldSiteAssetBinding } from '../../src/data/worldSiteAssetBindings.js';
import { worldSiteManifestById } from '../../src/data/worldSiteManifests.js';
import { asteroidSites } from '../../src/systems/asteroidSites.js';
import { trafficRoleMixForSector } from '../../src/systems/traffic.js';
import { world } from '../../src/systems/world.js';
import {
  createWorldSiteRecord,
  planWorldSiteMaterialization,
} from '../../src/systems/worldSiteKernel.js';
import {
  buildSystemModel,
  resolveCourseTarget,
} from '../../src/ui/galaxyMap.js';
import {
  embodimentDigest,
  projectSectorEmbodiment,
} from '../../src/sim/sector/embodiment.js';
import {
  evaluatePq018CoordinateReservation,
  PQ018_COORDINATE_ENVELOPE_RADIUS_WU,
  PQ018_LANE_HALF_WIDTH_WU,
} from './pq018CoordinateReservation.mjs';

export const PQ020_CERES_TOPOLOGY_SCHEMA = 'spaceface.pq020-ceres-topology.v1';
export const PQ020_CERES_SECTOR_ID = 'sector_ceres_belt';
export const PQ020_CATHEDRAL_SITE_ID = 'world_site_wreck_cathedral';
export const PQ020_CATHEDRAL_PLACE_ID = 'place_landmark_wreck_cathedral';
export const PQ020_EXPECTED_STRUCTURAL_COST_DIGEST =
  'b2232d1d891f6d65b2e4420387a23223e0325a0e14971d046bd86ef61ddafc2d';

const EXPECTED_POCKETS = Object.freeze({
  civic: Object.freeze({
    sourceId: 'station_ceres',
    center: Object.freeze({ x: -1100, z: 620 }),
    radius: 720,
  }),
  production: Object.freeze({
    sourceId: 'zone_ceres_belt',
    center: Object.freeze({ x: 500, z: -700 }),
    radius: 850,
  }),
  transit: Object.freeze({
    sourceId: 'zone_ceres_throughline',
    center: Object.freeze({ x: 3155, z: -955 }),
    radius: 500,
  }),
  cathedral: Object.freeze({
    sourceId: PQ020_CATHEDRAL_SITE_ID,
    center: CERES_WRECK_CATHEDRAL_LOCAL_POS,
    radius: PQ018_COORDINATE_ENVELOPE_RADIUS_WU,
  }),
});

const STALE_CATHEDRAL_PROPOSAL = Object.freeze({ x: -720, z: -2120 });
const ROUTE_ORDER = Object.freeze(['civic', 'production', 'transit', 'cathedral']);
const REQUIRED_HEADED_STUB_FIELDS = Object.freeze({
  routePerformance: Object.freeze(['p95Ms', 'p99Ms', 'hitchCount']),
  assetLifecycle: Object.freeze(['renderAdmissionMs', 'gpuResidencyBytes']),
  visualStates: Object.freeze(['close', 'default', 'far', 'motion', 'appliedLod']),
  rendererStructure: Object.freeze(['drawCalls', 'shaderPrograms']),
});

export async function buildPq020CeresTopologySnapshot() {
  const sector = SECTORS.find((candidate) => candidate.id === PQ020_CERES_SECTOR_ID);
  if (!sector) throw new Error(`${PQ020_CERES_SECTOR_ID} missing`);

  const cathedralManifest = worldSiteManifestById(PQ020_CATHEDRAL_SITE_ID);
  if (!cathedralManifest) throw new Error(`${PQ020_CATHEDRAL_SITE_ID} manifest missing`);
  const cathedralBinding = worldSiteAssetBinding(PQ020_CATHEDRAL_PLACE_ID);
  if (!cathedralBinding) throw new Error(`${PQ020_CATHEDRAL_PLACE_ID} binding missing`);

  const zones = zonesForSector(PQ020_CERES_SECTOR_ID);
  const civicStation = sector.stations?.find((candidate) => candidate.id === 'station_ceres');
  const civicZone = zones.find((candidate) => candidate.id === 'zone_ceres_refinery');
  const productionZone = zones.find((candidate) => candidate.id === 'zone_ceres_belt');
  const transitZone = zones.find((candidate) => candidate.id === 'zone_ceres_throughline');
  const transitPoi = sector.pois?.find((candidate) => candidate.id === 'poi_ceres_throughline');
  if (!civicStation || !civicZone || !productionZone || !transitZone || !transitPoi) {
    throw new Error('PQ-020 authored Ceres pocket data is incomplete');
  }

  const cathedralLocal = globalToSectorLocalForSector(
    cathedralManifest.placement.pos,
    PQ020_CERES_SECTOR_ID,
  );
  const coordinateReservation = evaluatePq018CoordinateReservation();
  const pockets = [
    pocketRow('civic', civicStation.id, civicStation.pos, civicZone.radius),
    pocketRow('production', productionZone.id, productionZone.center, productionZone.radius),
    pocketRow('transit', transitZone.id, transitZone.center, transitZone.radius),
    pocketRow(
      'cathedral',
      cathedralManifest.id,
      cathedralLocal,
      cathedralManifest.debug?.reservationEnvelope,
    ),
  ];

  const harness = await buildHeadlessCeresHarness({
    sector,
    cathedralManifest,
    cathedralBinding,
  });
  const atlasNode = buildAtlasIndex().nodes.find((node) => node.id === transitPoi.id);
  const systemMarker = harness.systemModel.points.find((point) => point.id === transitPoi.id);
  const denseAsteroid = (sector.hazards || []).find((candidate) => candidate.type === 'dense_asteroid');
  const primaryField = (sector.fields || []).find((candidate) => candidate.id === 'f_ceres_1');
  const beltOutpost = sector.stations?.find((candidate) => candidate.id === 'station_beltout');
  const heliosGate = sector.gates?.find((candidate) => candidate.to === 'sector_helios_prime');
  const tethysGate = sector.gates?.find((candidate) => candidate.to === 'sector_tethys_junction');
  const approachMidpoint = heliosGate?.pos && tethysGate?.pos
    ? {
      x: (heliosGate.pos.x + tethysGate.pos.x) / 2,
      z: (heliosGate.pos.z + tethysGate.pos.z) / 2,
    }
    : null;
  const trafficMix = trafficRoleMixForSector(sector);
  const embodimentIntents = projectSectorEmbodiment({
    sectorId: sector.id,
    sector,
    node: {
      danger: 0.35,
      pricePressure: 0,
      influence: { faction_dmc: 1 },
      dominantFactionId: 'faction_dmc',
      contestMargin: 1,
    },
    seed: 47,
    epochDays: 0,
    baseDanger: 0.35,
  });
  const densityIntent = embodimentIntents.find((intent) => intent.kind === 'traffic_density');
  const beaconCourse = systemMarker ? resolveCourseTarget(systemMarker) : null;

  const snapshot = {
    schema: PQ020_CERES_TOPOLOGY_SCHEMA,
    sectorId: sector.id,
    cathedral: {
      siteId: cathedralManifest.id,
      placeId: cathedralManifest.visualRoot?.placeId || null,
      local: roundPoint(cathedralLocal),
      global: roundPoint(cathedralManifest.placement.pos),
      reservationRadius: Number(cathedralManifest.debug?.reservationEnvelope),
      coordinateReservation: {
        pass: coordinateReservation.pass,
        minimumClearance: coordinateReservation.minimumClearance,
        receiptDigest: coordinateReservation.receiptDigest,
      },
      releaseSha256: cathedralBinding.release.sha256,
    },
    topology: {
      pockets,
      worldRadius: Number(sector.worldRadius),
    },
    transit: {
      zoneId: transitZone.id,
      noPresenceBudget: transitZone.presence == null,
      approachGates: {
        helios: heliosGate?.pos ? roundPoint(heliosGate.pos) : null,
        tethys: tethysGate?.pos ? roundPoint(tethysGate.pos) : null,
      },
      approachMidpoint: roundPoint(approachMidpoint),
      zoneCenteredOnApproachMidpoint: samePoint(transitZone.center, approachMidpoint),
      beacon: {
        id: transitPoi.id,
        placeId: transitPoi.landmarkGlb || null,
        local: roundPoint(transitPoi.pos),
        global: atlasNode?.globalPos ? roundPoint(atlasNode.globalPos) : null,
        physicalGlobal: harness.beaconPhysicalGlobal,
        physicalPlaceId: harness.beaconPhysicalPlaceId,
        systemMapDrawPos: systemMarker?.drawPos ? roundPoint(systemMarker.drawPos) : null,
        courseGlobal: beaconCourse?.pos ? roundPoint(beaconCourse.pos) : null,
        courseAutopilot: beaconCourse?.autopilot === true,
        positionAliasesCanonicalPos: transitPoi.position === transitPoi.pos,
        insideTransitPocket: pointInsideDisc(transitPoi.pos, transitZone.center, transitZone.radius),
        materialized: harness.beaconMaterialized,
      },
    },
    production: {
      zoneId: productionZone.id,
      beltOutpostId: beltOutpost?.id || null,
      beltOutpostInsideProduction: pointInsideDisc(
        beltOutpost?.pos,
        productionZone.center,
        productionZone.radius,
      ),
      civicZoneCenteredOnStation: samePoint(civicZone.center, civicStation.pos),
      primaryFieldId: primaryField?.id || null,
      primaryFieldInsideProduction: pointInsideDisc(
        primaryField?.center,
        productionZone.center,
        productionZone.radius,
      ),
      mechanicalCondition: {
        type: denseAsteroid?.type || null,
        owner: denseAsteroid ? 'world.hazards' : null,
        center: denseAsteroid?.center ? roundPoint(denseAsteroid.center) : null,
        radius: Number(denseAsteroid?.radius) || null,
        centerInsideProduction: pointInsideDisc(
          denseAsteroid?.center,
          productionZone.center,
          productionZone.radius,
        ),
      },
    },
    deterministicEffects: {
      industries: {
        mining: sector.industries?.mining === true,
        refinery: sector.industries?.refinery === true,
      },
      trafficRoleWeights: {
        hauler: trafficMix.hauler,
        miner: trafficMix.miner,
        patrol: trafficMix.patrol,
        escort: trafficMix.escort,
        pirate: trafficMix.pirate,
      },
      offscreenEmbodiment: {
        intentCount: embodimentIntents.length,
        digest: embodimentDigest(embodimentIntents),
        roleMixBias: densityIntent?.payload?.roleMixBias || null,
      },
    },
    rejectedStaleProposal: {
      local: { ...STALE_CATHEDRAL_PROPOSAL },
      radius: PQ018_COORDINATE_ENVELOPE_RADIUS_WU,
      ...evaluateConservativeLaneReservation(
        sector,
        STALE_CATHEDRAL_PROPOSAL,
        PQ018_COORDINATE_ENVELOPE_RADIUS_WU,
      ),
    },
    structuralCost: harness.structuralCost,
    requiresHeaded: headedEvidenceStubs(),
  };
  return snapshot;
}

export function validatePq020CeresTopologySnapshot(snapshot) {
  const failures = [];
  if (!snapshot || snapshot.schema !== PQ020_CERES_TOPOLOGY_SCHEMA) {
    failures.push(`schema:${snapshot?.schema || 'missing'}`);
  }
  if (snapshot?.sectorId !== PQ020_CERES_SECTOR_ID) {
    failures.push(`sectorId:${snapshot?.sectorId || 'missing'}`);
  }

  const cathedral = snapshot?.cathedral || {};
  exact(failures, 'cathedral.siteId', cathedral.siteId, PQ020_CATHEDRAL_SITE_ID);
  exact(failures, 'cathedral.placeId', cathedral.placeId, PQ020_CATHEDRAL_PLACE_ID);
  exactPoint(failures, 'cathedral.local', cathedral.local, CERES_WRECK_CATHEDRAL_LOCAL_POS);
  exactPoint(
    failures,
    'cathedral.global',
    cathedral.global,
    sectorLocalToGlobalForSector(CERES_WRECK_CATHEDRAL_LOCAL_POS, PQ020_CERES_SECTOR_ID),
  );
  exact(
    failures,
    'cathedral.reservationRadius',
    cathedral.reservationRadius,
    PQ018_COORDINATE_ENVELOPE_RADIUS_WU,
  );
  if (cathedral.coordinateReservation?.pass !== true) {
    failures.push('cathedral.coordinateReservation:not-pass');
  }

  const pockets = Array.isArray(snapshot?.topology?.pockets)
    ? snapshot.topology.pockets.map((candidate) => ({
      id: candidate.id,
      sourceId: candidate.sourceId,
      center: roundPoint(candidate.center),
      radius: Number(candidate.radius),
    }))
    : [];
  for (const [id, expected] of Object.entries(EXPECTED_POCKETS)) {
    const actual = pockets.find((candidate) => candidate.id === id);
    if (!actual) {
      failures.push(`pocket:${id}:missing`);
      continue;
    }
    exact(failures, `pocket:${id}:sourceId`, actual.sourceId, expected.sourceId);
    exactPoint(failures, `pocket:${id}:center`, actual.center, expected.center);
    exact(failures, `pocket:${id}:radius`, actual.radius, expected.radius);
  }

  const overlaps = buildOverlapRows(pockets);
  for (const row of overlaps) {
    if (!Number.isFinite(row.clearance) || row.clearance < 0) {
      failures.push(`overlap:${row.pair}:${row.clearance}`);
    }
  }
  const boundaryRows = pockets.map((candidate) => ({
    id: candidate.id,
    clearance: round(
      Number(snapshot?.topology?.worldRadius)
        - Math.hypot(candidate.center.x, candidate.center.z)
        - candidate.radius,
    ),
  })).sort((left, right) => left.clearance - right.clearance || left.id.localeCompare(right.id));
  for (const row of boundaryRows) {
    if (!Number.isFinite(row.clearance) || row.clearance < 0) {
      failures.push(`boundary:${row.id}:${row.clearance}`);
    }
  }

  const route = buildRoute(pockets);
  for (const leg of route.legs) {
    if (!Number.isFinite(leg.distance) || leg.distance <= 0
        || samePoint(leg.start, leg.end)) {
      failures.push(`route:${leg.id}:degenerate`);
    }
  }

  const transit = snapshot?.transit || {};
  exactPoint(
    failures,
    'transit.beacon.local',
    transit.beacon?.local,
    CERES_THROUGHLINE_BEACON_LOCAL_POS,
  );
  exactPoint(
    failures,
    'transit.beacon.global',
    transit.beacon?.global,
    sectorLocalToGlobalForSector(CERES_THROUGHLINE_BEACON_LOCAL_POS, PQ020_CERES_SECTOR_ID),
  );
  exactPoint(
    failures,
    'transit.beacon.physicalGlobal',
    transit.beacon?.physicalGlobal,
    sectorLocalToGlobalForSector(CERES_THROUGHLINE_BEACON_LOCAL_POS, PQ020_CERES_SECTOR_ID),
  );
  exactPoint(
    failures,
    'transit.beacon.systemMapDrawPos',
    transit.beacon?.systemMapDrawPos,
    CERES_THROUGHLINE_BEACON_LOCAL_POS,
  );
  exact(
    failures,
    'transit.beacon.physicalPlaceId',
    transit.beacon?.physicalPlaceId,
    'place_lane_beacon',
  );
  exactPoint(
    failures,
    'transit.beacon.courseGlobal',
    transit.beacon?.courseGlobal,
    sectorLocalToGlobalForSector(CERES_THROUGHLINE_BEACON_LOCAL_POS, PQ020_CERES_SECTOR_ID),
  );
  if (transit.beacon?.courseAutopilot !== true) failures.push('transit:course-not-routable');
  if (transit.noPresenceBudget !== true) failures.push('transit:presence-budget');
  if (transit.zoneCenteredOnApproachMidpoint !== true
      || !samePoint(transit.approachMidpoint, EXPECTED_POCKETS.transit.center)) {
    failures.push('transit:not-live-gate-midpoint');
  }
  if (transit.beacon?.positionAliasesCanonicalPos !== true) failures.push('transit:position-alias');
  if (transit.beacon?.insideTransitPocket !== true) failures.push('transit:beacon-outside-zone');
  if (transit.beacon?.materialized !== true) failures.push('transit:beacon-not-materialized');

  const production = snapshot?.production || {};
  if (production.civicZoneCenteredOnStation !== true) failures.push('civic:zone-station-drift');
  if (production.beltOutpostId !== 'station_beltout'
      || production.beltOutpostInsideProduction !== true) {
    failures.push('production:belt-outpost-outside');
  }
  if (production.primaryFieldInsideProduction !== true) failures.push('production:field-outside');
  if (production.mechanicalCondition?.type !== 'dense_asteroid'
      || production.mechanicalCondition?.owner !== 'world.hazards'
      || production.mechanicalCondition?.centerInsideProduction !== true) {
    failures.push('production:mechanical-condition');
  }
  if (snapshot?.deterministicEffects?.industries?.mining !== true
      || snapshot?.deterministicEffects?.industries?.refinery !== true) {
    failures.push('industries:missing');
  }
  exact(
    failures,
    'trafficRoleWeights.hauler',
    snapshot?.deterministicEffects?.trafficRoleWeights?.hauler,
    45,
  );
  exact(
    failures,
    'trafficRoleWeights.miner',
    snapshot?.deterministicEffects?.trafficRoleWeights?.miner,
    40,
  );
  exact(
    failures,
    'offscreenEmbodiment.intentCount',
    snapshot?.deterministicEffects?.offscreenEmbodiment?.intentCount,
    3,
  );
  exact(
    failures,
    'offscreenEmbodiment.digest',
    snapshot?.deterministicEffects?.offscreenEmbodiment?.digest,
    2416862514,
  );
  exact(
    failures,
    'offscreenEmbodiment.roleMixBias.hauler',
    snapshot?.deterministicEffects?.offscreenEmbodiment?.roleMixBias?.hauler,
    1.4,
  );
  exact(
    failures,
    'offscreenEmbodiment.roleMixBias.miner',
    snapshot?.deterministicEffects?.offscreenEmbodiment?.roleMixBias?.miner,
    2.2,
  );

  const stale = snapshot?.rejectedStaleProposal || {};
  if (stale.accepted !== false || !(Number(stale.minimumLaneClearance) < 0)) {
    failures.push('stale-cathedral-proposal:not-rejected');
  }

  validateStructuralCost(snapshot?.structuralCost, failures);
  validateHeadedStubs(snapshot?.requiresHeaded, failures);

  const structuralCostDigest = digest(snapshot?.structuralCost || null);
  exact(
    failures,
    'structuralCostDigest',
    structuralCostDigest,
    PQ020_EXPECTED_STRUCTURAL_COST_DIGEST,
  );
  const receiptCore = {
    schema: PQ020_CERES_TOPOLOGY_SCHEMA,
    sectorId: snapshot?.sectorId || null,
    cathedral,
    topology: {
      pockets,
      overlaps,
      boundaryClearances: boundaryRows,
      minimumBoundaryClearance: boundaryRows[0]?.clearance ?? null,
      worldRadius: Number(snapshot?.topology?.worldRadius) || null,
    },
    route,
    transit,
    production,
    deterministicEffects: snapshot?.deterministicEffects || null,
    rejectedStaleProposal: stale,
    structuralCost: snapshot?.structuralCost || null,
    requiresHeaded: snapshot?.requiresHeaded || null,
    structuralCostDigest,
    pass: failures.length === 0,
    failures,
  };
  return {
    ...receiptCore,
    receiptDigest: digest(receiptCore),
  };
}

export async function evaluatePq020CeresTopology() {
  try {
    return validatePq020CeresTopologySnapshot(await buildPq020CeresTopologySnapshot());
  } catch (error) {
    return {
      schema: PQ020_CERES_TOPOLOGY_SCHEMA,
      sectorId: PQ020_CERES_SECTOR_ID,
      pass: false,
      failures: [`harness:${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

async function buildHeadlessCeresHarness({ sector, cathedralManifest, cathedralBinding }) {
  const sim = createSimulation({
    seed: 47,
    systems: [world, asteroidSites],
  });
  const { state } = sim;
  try {
    state.mode = 'flight';
    const origin = sectorLocalToGlobalForSector({ x: 0, z: 0 }, sector.id);
    const player = sim.spawn({
      type: 'ship',
      team: 0,
      pos: origin,
      vel: { x: 0, z: 0 },
      radius: 10,
      mass: 1,
      collides: false,
      data: { pq020HarnessPlayer: true },
    });
    state.playerId = player.id;
    sim.registry.get('world').enterSector(sector.id, {
      continuous: true,
      noTeleport: true,
      placePlayer: false,
    });
    sim.step(SIM_DT);

    const entities = [...state.entities.values()]
      .filter((entity) => entity && entity.alive !== false && !entity.data?.pq020HarnessPlayer)
      .filter((entity) => entitySectorId(entity) === sector.id
        || worldRecordId(entity).startsWith(`${PQ020_CATHEDRAL_SITE_ID}/`));
    const byType = {};
    for (const entity of entities) byType[entity.type] = (byType[entity.type] || 0) + 1;
    const sortedByType = Object.fromEntries(
      Object.entries(byType).sort(([left], [right]) => left.localeCompare(right)),
    );
    const collidable = entities.filter((entity) => entity.collides === true);
    const colliders = collidable.reduce((sum, entity) => {
      const manifest = resolveCollisionProxyManifest(entity);
      return sum + (manifest
        ? expandProxyPrimitives(manifest, { entity }).length
        : 1);
    }, 0);
    const siteEntities = entities.filter((entity) => (
      worldRecordId(entity).startsWith(`${PQ020_CATHEDRAL_SITE_ID}/`)
    ));
    const plan = planWorldSiteMaterialization(
      cathedralManifest,
      createWorldSiteRecord(cathedralManifest, { tick: 0 }),
    );
    const spatial = state.spatialHash?.diagnostics || {};
    const beacon = entities.find((entity) => entity.data?.poiId === 'poi_ceres_throughline');
    const systemModel = buildSystemModel(state, sector.id);
    const structuralCost = {
      schema: 'spaceface.pq020-ceres-structural-cost.v1',
      scope: `${sector.id}:seed47:one-fixed-tick`,
      harness: {
        evidenceClass: sim.evidenceClassification.class,
        systems: [...sim.evidenceClassification.systemIds],
        seed: 47,
        ticks: 1,
        physicsBackend: 'not-initialized-headless',
      },
      authored: {
        stations: sector.stations?.length || 0,
        gates: sector.gates?.length || 0,
        fields: sector.fields?.length || 0,
        hazards: sector.hazards?.length || 0,
        pois: sector.pois?.length || 0,
        zones: zonesForSector(sector.id).length,
      },
      entities: {
        total: entities.length,
        byType: sortedByType,
        collidable: collidable.length,
      },
      colliders,
      spatial: {
        queries: Number(spatial.queries) || 0,
        candidates: Number(spatial.candidates) || 0,
      },
      worldSite: {
        siteId: cathedralManifest.id,
        materializedEntities: siteEntities.length,
        plannedEntities: plan.entities.length,
        interactionProxies: plan.components.length,
        collisionProxies: plan.collisionProxies.length,
        operations: cathedralManifest.operations?.length || 0,
        releaseSha256: cathedralBinding.release.sha256,
      },
      residencyTier: state.world.residentSectors?.[sector.id]?.tier || null,
      presentationAdmission: presentationOwnerAdmissionForWorldRecord(
        `${cathedralManifest.worldObjectId}/root`,
        state,
      ),
    };
    return {
      structuralCost,
      systemModel,
      beaconPhysicalGlobal: beacon?.pos ? roundPoint(beacon.pos) : null,
      beaconPhysicalPlaceId: beacon?.data?.placeId || null,
      beaconMaterialized: !!beacon
        && beacon.type === 'fx'
        && beacon.data?.placeId === 'place_lane_beacon'
        && beacon.mass === 0
        && beacon.collides === false,
    };
  } finally {
    sim.dispose();
  }
}

function validateStructuralCost(value, failures) {
  if (!value || value.schema !== 'spaceface.pq020-ceres-structural-cost.v1') {
    failures.push('structuralCost:schema');
    return;
  }
  const integerFields = [
    ['entities.total', value.entities?.total],
    ['entities.collidable', value.entities?.collidable],
    ['colliders', value.colliders],
    ['spatial.queries', value.spatial?.queries],
    ['spatial.candidates', value.spatial?.candidates],
    ['worldSite.materializedEntities', value.worldSite?.materializedEntities],
  ];
  for (const [label, field] of integerFields) {
    if (!Number.isInteger(field) || field < 0) failures.push(`structuralCost:${label}`);
  }
  if (!(value.entities?.total > 0)) failures.push('structuralCost:entities-empty');
  if (!(value.entities?.collidable > 0)) failures.push('structuralCost:collidables-empty');
  if (!(value.colliders > 0)) failures.push('structuralCost:colliders-empty');
  exact(
    failures,
    'structuralCost.worldSite.siteId',
    value.worldSite?.siteId,
    PQ020_CATHEDRAL_SITE_ID,
  );
  exact(failures, 'structuralCost.worldSite.materializedEntities', value.worldSite?.materializedEntities, 15);
  exact(failures, 'structuralCost.worldSite.plannedEntities', value.worldSite?.plannedEntities, 15);
  exact(failures, 'structuralCost.residencyTier', value.residencyTier, 'FULL');
  exact(failures, 'structuralCost.presentationAdmission', value.presentationAdmission, 'headless');
}

function headedEvidenceStubs() {
  return {
    routePerformance: {
      requiresHeaded: true,
      fields: { p95Ms: null, p99Ms: null, hitchCount: null },
    },
    assetLifecycle: {
      requiresHeaded: true,
      fields: { renderAdmissionMs: null, gpuResidencyBytes: null },
    },
    visualStates: {
      requiresHeaded: true,
      fields: {
        close: null,
        default: null,
        far: null,
        motion: null,
        appliedLod: null,
      },
    },
    rendererStructure: {
      requiresHeaded: true,
      fields: { drawCalls: null, shaderPrograms: null },
    },
  };
}

function validateHeadedStubs(groups, failures) {
  if (!groups || typeof groups !== 'object') {
    failures.push('requiresHeaded:missing');
    return;
  }
  const expectedGroupIds = Object.keys(REQUIRED_HEADED_STUB_FIELDS).sort();
  const actualGroupIds = Object.keys(groups).sort();
  if (stableStringify(actualGroupIds) !== stableStringify(expectedGroupIds)) {
    failures.push(
      `requiresHeaded:groups:${stableStringify(actualGroupIds)}!=${stableStringify(expectedGroupIds)}`,
    );
  }
  for (const [groupId, requiredFields] of Object.entries(REQUIRED_HEADED_STUB_FIELDS)) {
    const group = groups[groupId];
    if (group?.requiresHeaded !== true || !group.fields || typeof group.fields !== 'object') {
      failures.push(`requiresHeaded:${groupId}:marker`);
      continue;
    }
    const expectedFieldIds = [...requiredFields].sort();
    const actualFieldIds = Object.keys(group.fields).sort();
    if (stableStringify(actualFieldIds) !== stableStringify(expectedFieldIds)) {
      failures.push(
        `requiresHeaded:${groupId}:fields:`
          + `${stableStringify(actualFieldIds)}!=${stableStringify(expectedFieldIds)}`,
      );
    }
    for (const fieldId of requiredFields) {
      if (!Object.hasOwn(group.fields, fieldId)) {
        failures.push(`requiresHeaded:${groupId}.${fieldId}:missing`);
      } else if (group.fields[fieldId] !== null) {
        failures.push(`requiresHeaded:${groupId}.${fieldId}:fabricated`);
      }
    }
  }
}

function evaluateConservativeLaneReservation(sector, center, radius) {
  const nodes = [
    ...(sector.stations || []).map((station) => ({
      id: `station:${station.id}`,
      kind: 'station',
      pos: station.pos,
    })),
    ...(sector.gates || []).map((gate) => ({
      id: `gate:${gate.to}`,
      kind: 'gate',
      pos: gate.pos,
    })),
  ];
  const rows = [];
  for (let left = 0; left < nodes.length; left += 1) {
    for (let right = left + 1; right < nodes.length; right += 1) {
      const a = nodes[left];
      const b = nodes[right];
      if (!(a.kind === 'station' && b.kind === 'station' || a.kind === 'gate' || b.kind === 'gate')) {
        continue;
      }
      const clearance = round(
        pointSegmentDistance(center, a.pos, b.pos) - radius - PQ018_LANE_HALF_WIDTH_WU,
      );
      rows.push({ id: `${a.id}>${b.id}`, clearance });
    }
  }
  rows.sort((left, right) => left.clearance - right.clearance || left.id.localeCompare(right.id));
  return {
    accepted: rows.length > 0 && rows.every((row) => row.clearance >= 0),
    minimumLaneClearance: rows[0]?.clearance ?? null,
    minimumLane: rows[0]?.id ?? null,
  };
}

function buildRoute(pockets) {
  const byId = new Map(pockets.map((candidate) => [candidate.id, candidate]));
  const legs = [];
  for (let index = 1; index < ROUTE_ORDER.length; index += 1) {
    const from = byId.get(ROUTE_ORDER[index - 1]);
    const to = byId.get(ROUTE_ORDER[index]);
    const start = from?.center ? roundPoint(from.center) : null;
    const end = to?.center ? roundPoint(to.center) : null;
    legs.push({
      id: `${ROUTE_ORDER[index - 1]}->${ROUTE_ORDER[index]}`,
      from: ROUTE_ORDER[index - 1],
      to: ROUTE_ORDER[index],
      start,
      end,
      distance: start && end ? round(Math.hypot(end.x - start.x, end.z - start.z)) : null,
    });
  }
  return {
    id: 'pq020-ceres-pocket-route-v1',
    siteId: PQ020_CATHEDRAL_SITE_ID,
    order: [...ROUTE_ORDER],
    legs,
    totalDistance: round(legs.reduce((sum, leg) => sum + (Number(leg.distance) || 0), 0)),
  };
}

function buildOverlapRows(pockets) {
  const rows = [];
  for (let left = 0; left < pockets.length; left += 1) {
    for (let right = left + 1; right < pockets.length; right += 1) {
      const a = pockets[left];
      const b = pockets[right];
      rows.push({
        pair: `${a.id}:${b.id}`,
        centerDistance: round(Math.hypot(
          b.center.x - a.center.x,
          b.center.z - a.center.z,
        )),
        clearance: round(
          Math.hypot(b.center.x - a.center.x, b.center.z - a.center.z)
            - a.radius
            - b.radius,
        ),
      });
    }
  }
  return rows.sort((left, right) => left.pair.localeCompare(right.pair));
}

function pocketRow(id, sourceId, center, radius) {
  return {
    id,
    sourceId,
    center: roundPoint(center),
    radius: Number(radius),
  };
}

function entitySectorId(entity) {
  return entity?.homeSectorId
    || entity?.data?.homeSectorId
    || entity?.data?.sectorId
    || null;
}

function worldRecordId(entity) {
  return String(entity?.data?.worldRecordId || '');
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
    ? Math.max(0, Math.min(1, (
      (point.x - start.x) * dx + (point.z - start.z) * dz
    ) / lengthSquared))
    : 0;
  return Math.hypot(
    point.x - (start.x + dx * t),
    point.z - (start.z + dz * t),
  );
}

function exact(failures, label, actual, expected) {
  if (actual !== expected) failures.push(`${label}:${String(actual)}!=${String(expected)}`);
}

function exactPoint(failures, label, actual, expected) {
  if (!samePoint(actual, expected)) {
    failures.push(`${label}:${stableStringify(actual || null)}!=${stableStringify(expected)}`);
  }
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
