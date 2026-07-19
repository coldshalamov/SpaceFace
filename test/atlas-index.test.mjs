// Atlas read-model contract tests.
//
// Split by intent: live-data tests assert STRUCTURE (determinism, uniqueness, ordering, round-trip)
// and never hardcode a content count, because the authored sectors are edited constantly and a test
// that pins "32 stations" fails on the next station somebody adds without proving anything broke.
// Synthetic-source tests own the count and null-position cases, where a fixed expectation is the
// whole point.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAtlasIndex,
  gateNodeId,
  ATLAS_NODE_KINDS,
  ATLAS_SCHEMA,
  DISCOVERY_TIER,
} from '../src/core/atlasIndex.js';
import { checkAtlasIntegrity } from '../scripts/check-atlas-integrity.mjs';
import { SECTORS } from '../src/data/sectors.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import {
  sectorGlobalOrigin,
  sectorLocalToGlobalForSector,
  globalToSectorLocalForSector,
} from '../src/data/sectorCoordinates.js';

// Helios sits at the origin; Tethys is 3 lattice units east and 2 north. A read model that only ever
// gets exercised at (0,0) hides exactly the class of bug this atlas exists to prevent.
const ZERO_ORIGIN_SECTOR = 'sector_helios_prime';
const NONZERO_ORIGIN_SECTOR = 'sector_tethys_junction';

/** A small hand-built world: one sector with an anchored station, an anchorless station, one zone,
 *  and a gate pointing at a sector that does not exist. */
function syntheticSources({ duplicateId = false } = {}) {
  const sectors = [
    {
      id: 'sector_helios_prime',
      name: 'Synthetic Helios',
      charted: true,
      factionId: 'faction_scn',
      worldRadius: 3500,
      neighbors: ['sector_ceres_belt'],
      stations: [
        { id: 'st_anchored', name: 'Anchored', type: 'trade_hub', pos: { x: 100, z: -200 }, services: ['trade'] },
        { id: 'st_adrift', name: 'Adrift', type: 'trade_hub' },
      ],
      gates: [{ to: 'sector_ceres_belt', pos: { x: 1000, z: 0 } }],
      pois: [{ id: duplicateId ? 'st_anchored' : 'poi_synth', name: 'Synth POI', type: 'beacon', pos: { x: 0, z: 300 }, hidden: true }],
      hazards: [{ type: 'nebula' }],
    },
    {
      id: 'sector_ceres_belt',
      name: 'Synthetic Ceres',
      charted: false,
      factionId: 'faction_dmc',
      worldRadius: 4200,
      neighbors: ['sector_helios_prime'],
      stations: [],
      gates: [{ to: 'sector_helios_prime', pos: { x: -1000, z: 0 } }],
      pois: [],
      hazards: [],
    },
  ];
  const zones = {
    sector_helios_prime: [
      { id: 'zone_synth', name: 'Synth Zone', type: 'civilian_core', factionId: 'faction_scn', center: { x: 50, z: 50 }, radius: 400 },
    ],
  };
  return { sectors, zonesForSector: (id) => zones[id] || [] };
}

test('building twice is deep-equal (determinism)', () => {
  const a = buildAtlasIndex();
  const b = buildAtlasIndex();
  assert.notEqual(a, b, 'must be two distinct builds, not a cached singleton');
  assert.deepStrictEqual(a.toJSON(), b.toJSON());
});

test('nodes and edges are sorted by id (stable iteration order)', () => {
  const atlas = buildAtlasIndex();
  const nodeIds = atlas.nodes.map((n) => n.id);
  assert.deepStrictEqual(nodeIds, [...nodeIds].sort());
  const edgeIds = atlas.edges.map((e) => e.id);
  assert.deepStrictEqual(edgeIds, [...edgeIds].sort());
  // Per-sector and per-kind views inherit that order.
  const inSector = atlas.nodesInSector(NONZERO_ORIGIN_SECTOR).map((n) => n.id);
  assert.deepStrictEqual(inSector, [...inSector].sort());
  assert.ok(inSector.length > 0);
});

test('no duplicate node or edge ids across the live atlas', () => {
  const atlas = buildAtlasIndex();
  assert.equal(new Set(atlas.nodes.map((n) => n.id)).size, atlas.nodes.length);
  assert.equal(new Set(atlas.edges.map((e) => e.id)).size, atlas.edges.length);
});

test('every node carries a canonical global position derived from its authored sector-local anchor', () => {
  const atlas = buildAtlasIndex();
  for (const sector of SECTORS) {
    for (const station of sector.stations || []) {
      const node = atlas.getNode(station.id);
      assert.ok(node, `missing station node ${station.id}`);
      const expected = sectorLocalToGlobalForSector(station.pos, sector.id);
      assert.deepStrictEqual({ x: node.globalPos.x, z: node.globalPos.z }, { x: expected.x, z: expected.z });
    }
  }
});

test('round-trip holds for a zero-origin sector', () => {
  assert.deepStrictEqual({ ...sectorGlobalOrigin(ZERO_ORIGIN_SECTOR) }, { x: 0, z: 0 });
  const atlas = buildAtlasIndex();
  for (const node of atlas.nodesInSector(ZERO_ORIGIN_SECTOR)) {
    if (!node.hasPosition) continue;
    const local = globalToSectorLocalForSector(node.globalPos, ZERO_ORIGIN_SECTOR);
    const back = sectorLocalToGlobalForSector(local, ZERO_ORIGIN_SECTOR);
    assert.deepStrictEqual({ x: back.x, z: back.z }, { x: node.globalPos.x, z: node.globalPos.z });
  }
});

test('round-trip holds for a nonzero-origin sector', () => {
  const origin = sectorGlobalOrigin(NONZERO_ORIGIN_SECTOR);
  assert.deepStrictEqual({ ...origin }, { x: 12288, z: 8192 });
  const atlas = buildAtlasIndex();
  const nodes = atlas.nodesInSector(NONZERO_ORIGIN_SECTOR).filter((n) => n.hasPosition);
  assert.ok(nodes.length > 1);
  for (const node of nodes) {
    const local = globalToSectorLocalForSector(node.globalPos, NONZERO_ORIGIN_SECTOR);
    const back = sectorLocalToGlobalForSector(local, NONZERO_ORIGIN_SECTOR);
    assert.deepStrictEqual({ x: back.x, z: back.z }, { x: node.globalPos.x, z: node.globalPos.z });
  }
  // The sector node itself must land exactly on the authored origin, not on (0,0).
  const sectorNode = atlas.getNode(NONZERO_ORIGIN_SECTOR);
  assert.deepStrictEqual({ x: sectorNode.globalPos.x, z: sectorNode.globalPos.z }, { x: origin.x, z: origin.z });
});

test('an anchorless place gets a null position, never a fabricated origin', () => {
  const atlas = buildAtlasIndex(syntheticSources());
  const adrift = atlas.getNode('st_adrift');
  assert.equal(adrift.hasPosition, false);
  assert.equal(adrift.globalPos, null);
  // The sector origin is (0,0) here, so a fabricated default would be indistinguishable from a real
  // anchor at the sector centre. The explicit flag is what keeps them apart.
  const anchored = atlas.getNode('st_anchored');
  assert.equal(anchored.hasPosition, true);
  assert.deepStrictEqual({ x: anchored.globalPos.x, z: anchored.globalPos.z }, { x: 100, z: -200 });
});

test('nearestNode skips positionless nodes and filters by kind', () => {
  const atlas = buildAtlasIndex(syntheticSources());
  // Query the exact sector origin: the anchorless station would win at distance 0 if it were
  // fabricated there, so this asserts the null-position node can never be returned.
  const nearestStation = atlas.nearestNode({ x: 0, z: 0 }, { kind: 'station' });
  assert.equal(nearestStation.id, 'st_anchored');

  const live = buildAtlasIndex();
  const tethys = live.getNode('station_tethys');
  const found = live.nearestNode(tethys.globalPos, { kind: 'station' });
  assert.equal(found.id, 'station_tethys');
  // A point far outside the galaxy still resolves, and never returns a positionless node.
  const far = live.nearestNode({ x: 9e6, z: 9e6 });
  assert.ok(far && far.hasPosition);
  assert.equal(live.nearestNode(null), null);
});

test('gate links resolve reciprocally, and a one-way gate is flagged rather than faked', () => {
  const atlas = buildAtlasIndex();
  const gateLinks = atlas.edges.filter((e) => e.kind === 'gate-link');
  assert.ok(gateLinks.length > 0);

  for (const edge of gateLinks.filter((e) => e.reciprocal)) {
    const a = atlas.getNode(edge.a);
    const b = atlas.getNode(edge.b);
    assert.equal(a.kind, 'gate');
    assert.equal(b.kind, 'gate');
    // Reciprocity means each gate points at the other's sector.
    assert.equal(a.linkSectorId, b.sectorId);
    assert.equal(b.linkSectorId, a.sectorId);
    assert.equal(a.id, gateNodeId(a.sectorId, b.sectorId));
    assert.ok(edge.traverse.distanceWU > 0);
    assert.ok(edge.traverse.baseTimeS > 0);
  }

  // The authored one-way wormhole: veil has a gate to ashfall, ashfall has no gate back.
  const oneWay = gateLinks.filter((e) => !e.reciprocal);
  for (const edge of oneWay) {
    const from = atlas.getNode(edge.a);
    const to = atlas.getNode(edge.b);
    assert.equal(from.kind, 'gate');
    // No fabricated return gate — the far endpoint is the destination SECTOR node.
    assert.equal(to.kind, 'sector');
    assert.equal(to.id, from.linkSectorId);
  }
  const veilWormhole = atlas.edges.find((e) => e.id === 'gatelink_sector_veil_nebula__sector_ashfall_reach');
  assert.ok(veilWormhole, 'expected the authored Veil -> Ashfall wormhole edge');
  assert.equal(veilWormhole.reciprocal, false);
  assert.equal(veilWormhole.traverse.type, 'wormhole');
  assert.equal(veilWormhole.b, 'sector_ashfall_reach');
});

test('a one-way link does not advertise a return trip', () => {
  const atlas = buildAtlasIndex();
  assert.ok(atlas.sectorNeighbors('sector_veil_nebula').includes('sector_ashfall_reach'));
  assert.ok(!atlas.sectorNeighbors('sector_ashfall_reach').includes('sector_veil_nebula'));
  // The ordinary reciprocal route out of Ashfall is still there.
  assert.ok(atlas.sectorNeighbors('sector_ashfall_reach').includes('sector_charon_expanse'));
});

test('query APIs return what the consumers need', () => {
  const atlas = buildAtlasIndex();
  assert.equal(atlas.schema, ATLAS_SCHEMA);
  assert.equal(atlas.coordinateSchema, 'global_v1');
  assert.equal(atlas.getNode('does_not_exist'), null);
  assert.deepStrictEqual(atlas.nodesInSector('does_not_exist'), []);
  assert.deepStrictEqual(atlas.edgesFrom('does_not_exist'), []);

  const helios = atlas.getNode(ZERO_ORIGIN_SECTOR);
  assert.equal(helios.kind, 'sector');
  const station = atlas.getNode('station_helios');
  assert.equal(station.sectorId, ZERO_ORIGIN_SECTOR);
  assert.ok(station.services.includes('trade'));

  // Every node in a sector view really belongs to that sector, and every kind is a known kind.
  for (const node of atlas.nodesInSector(ZERO_ORIGIN_SECTOR)) {
    assert.equal(node.sectorId, ZERO_ORIGIN_SECTOR);
    assert.ok(ATLAS_NODE_KINDS.includes(node.kind));
  }
  const gateNode = atlas.nodesOfKind('gate').find((n) => n.sectorId === ZERO_ORIGIN_SECTOR);
  const touching = atlas.edgesFrom(gateNode.id);
  assert.ok(touching.length > 0);
  assert.ok(touching.every((e) => e.a === gateNode.id || e.b === gateNode.id));
});

test('discoveryTier reports the authored baseline only', () => {
  const atlas = buildAtlasIndex(syntheticSources());
  assert.equal(atlas.getNode('sector_helios_prime').discoveryTier, DISCOVERY_TIER.CHARTED);
  assert.equal(atlas.getNode('sector_ceres_belt').discoveryTier, DISCOVERY_TIER.UNCHARTED);
  assert.equal(atlas.getNode('st_anchored').discoveryTier, DISCOVERY_TIER.CHARTED);
  assert.equal(atlas.getNode('poi_synth').discoveryTier, DISCOVERY_TIER.HIDDEN);
  // A hidden POI in an uncharted sector is still hidden, not downgraded.
  const live = buildAtlasIndex();
  assert.equal(live.getNode('poi_vault').discoveryTier, DISCOVERY_TIER.HIDDEN);
});

test('synthetic counts match the authored source exactly (no silent drops)', () => {
  const atlas = buildAtlasIndex(syntheticSources());
  assert.equal(atlas.nodesOfKind('sector').length, 2);
  assert.equal(atlas.nodesOfKind('station').length, 2);
  assert.equal(atlas.nodesOfKind('gate').length, 2);
  assert.equal(atlas.nodesOfKind('poi').length, 1);
  assert.equal(atlas.nodesOfKind('zone').length, 1);
  assert.equal(atlas.nodes.length, 8);
});

test('the live atlas charts every authored place, counted independently', () => {
  const atlas = buildAtlasIndex();
  let stations = 0; let gates = 0; let pois = 0; let zones = 0;
  for (const sector of SECTORS) {
    stations += (sector.stations || []).length;
    gates += (sector.gates || []).length;
    pois += (sector.pois || []).length;
    zones += zonesForSector(sector.id).length;
  }
  assert.equal(atlas.nodesOfKind('sector').length, SECTORS.length);
  assert.equal(atlas.nodesOfKind('station').length, stations);
  assert.equal(atlas.nodesOfKind('gate').length, gates);
  assert.equal(atlas.nodesOfKind('poi').length, pois);
  assert.equal(atlas.nodesOfKind('zone').length, zones);
});

test('the integrity gate passes on the live authored data', () => {
  const result = checkAtlasIntegrity();
  const failed = result.checks.filter((c) => !c.pass).map((c) => `${c.name}: ${(c.details || []).join('; ')}`);
  assert.deepStrictEqual(failed, []);
  assert.equal(result.pass, true);
});

test('the integrity gate actually bites — duplicate ids fail it', () => {
  const result = checkAtlasIntegrity(syntheticSources({ duplicateId: true }));
  assert.equal(result.pass, false);
  const failedNames = result.checks.filter((c) => !c.pass).map((c) => c.name);
  assert.ok(failedNames.includes('uniqueNodeIds'), `expected uniqueNodeIds to fail, got ${failedNames}`);
});

test('the integrity gate actually bites — a silently dropped place fails the count assertion', () => {
  const sources = syntheticSources();
  const SYNTH_ORIGINS = {
    sector_helios_prime: { x: 0, z: 0 },
    sector_ceres_belt: { x: -12288, z: 8192 },
  };
  const baseline = checkAtlasIntegrity({ ...sources, origins: SYNTH_ORIGINS });
  assert.equal(baseline.pass, true, 'the synthetic world must pass before we break it');

  // A zone authored without an id: the index refuses to make a node for it, but it is still real
  // authored content. That divergence is precisely what the independent census exists to catch.
  const broken = checkAtlasIntegrity({
    sectors: sources.sectors,
    zonesForSector: (id) => (id === 'sector_helios_prime'
      ? [{ name: 'Nameless', type: 'civilian_core', center: { x: 50, z: 50 }, radius: 400 }]
      : []),
    origins: SYNTH_ORIGINS,
  });
  assert.equal(broken.pass, false);
  const failedNames = broken.checks.filter((c) => !c.pass).map((c) => c.name);
  assert.ok(
    failedNames.includes('nodeCountsMatchAuthored'),
    `expected nodeCountsMatchAuthored to fail, got ${failedNames}`,
  );
});

test('the integrity gate actually bites — a zone outside its sector fails', () => {
  const sources = syntheticSources();
  const result = checkAtlasIntegrity({
    sectors: sources.sectors,
    zonesForSector: (id) => (id === 'sector_helios_prime'
      ? [{ id: 'zone_far', name: 'Far', type: 'civilian_core', center: { x: 99000, z: 0 }, radius: 100 }]
      : []),
    origins: { sector_helios_prime: { x: 0, z: 0 }, sector_ceres_belt: { x: -12288, z: 8192 } },
  });
  assert.equal(result.pass, false);
  const failedNames = result.checks.filter((c) => !c.pass).map((c) => c.name);
  assert.ok(failedNames.includes('zonesInsideSector'), `expected zonesInsideSector to fail, got ${failedNames}`);
});

test('the integrity gate actually bites — an unknown sector id fails', () => {
  const sources = syntheticSources();
  const result = checkAtlasIntegrity({
    sectors: [...sources.sectors, {
      id: 'sector_not_in_the_origin_table',
      name: 'Nowhere',
      neighbors: [],
      stations: [],
      gates: [],
      pois: [],
    }],
    zonesForSector: sources.zonesForSector,
    origins: { sector_helios_prime: { x: 0, z: 0 }, sector_ceres_belt: { x: -12288, z: 8192 } },
  });
  assert.equal(result.pass, false);
  const failedNames = result.checks.filter((c) => !c.pass).map((c) => c.name);
  assert.ok(failedNames.includes('nodeSectorResolves'), `expected nodeSectorResolves to fail, got ${failedNames}`);
  assert.ok(failedNames.includes('sectorNodesMatchOrigins'));
});

test('the atlas stays pure — no Three.js, no ui/render imports, no ambient nondeterminism', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/core/atlasIndex.js', import.meta.url), 'utf8')
    .replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(source, /Math\.random\s*\(/);
  assert.doesNotMatch(source, /Date\.now\s*\(/);
  assert.doesNotMatch(source, /from\s+'three'/);
  assert.doesNotMatch(source, /from\s+'\.\.\/(ui|render)\//);
  // Math.hypot is implementation-approximated in ECMAScript; chart distances must not depend on it.
  assert.doesNotMatch(source, /Math\.hypot\s*\(/);
});
