// Atlas integrity gate — the validated path for adding a new place.
//
// Authority: design/program/atlas/00_COMMON_CONTEXT.md
//   "Adding a new planet, station, sector, corridor, environmental region, or mission destination
//    must have an obvious, validated path into the Atlas."
//
// Author a station/gate/POI/zone in src/data/sectors.js (anchor in src/data/sectorAnchors.js) or
// src/data/sectorZones.js, run this gate, and it tells you whether the place actually landed in the
// derived read model with a resolvable sector, a round-tripping anchor, and a unique id.
//
// Every count is walked independently from the authored source and compared against the built index,
// so silently dropping content fails loudly instead of quietly shrinking the atlas.
//
// FAIL vs REPORT — deliberate split:
//   FAIL   — unknown sector, duplicate id, count mismatch, broken round-trip, zone outside its
//            sector, sector/origin set mismatch, dangling edge endpoint.
//   REPORT — gate reciprocity and unanchored places. A non-reciprocal gate can be an authoring bug
//            OR an authored one-way link; the gate names it with exact ids and lets the lead rule on
//            it rather than guessing. Reporting is not weakening: the facts are printed either way.
//
// Exit codes:
//   0 — every fail-closed assertion passed (findings may still be printed)
//   1 — an assertion failed or the gate hit an internal error

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildAtlasIndex, ATLAS_NODE_KINDS, gateNodeId } from '../src/core/atlasIndex.js';
import {
  resolveAtlasProxy,
  resolveEdgeProxy,
  authoredAssetForNode,
  MAP_PROXY_TRIANGLE_CAP,
  PROXY_TIER,
} from '../src/core/atlasProxy.js';
import { SECTORS } from '../src/data/sectors.js';
import { zonesForSector, ZONE_TYPES } from '../src/data/sectorZones.js';
import { FACTION_META } from '../src/data/factions.js';
import { TECH_NODES } from '../src/data/tech.js';
import { SET_PIECE_MISSIONS, STORY_BEATS } from '../src/data/missions.js';
import {
  SECTOR_GLOBAL_ORIGINS,
  sectorLocalToGlobalForSector,
  globalToSectorLocalForSector,
  corridorPlayableBounds,
} from '../src/data/sectorCoordinates.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = resolve(ROOT, 'assets/ships/parts/parts_manifest.json');
const PLACES_DIR = resolve(ROOT, 'assets/ships/parts/places');
const REGISTRATION_DOC = resolve(ROOT, 'src/data/PLACE_REGISTRATION.md');

/**
 * Curated service vocabulary.
 *
 * There is no service enum in src/data/ — the vocabulary is implicit in the authored station rows,
 * which means a typo (`reful`) currently just creates a service nothing ever offers. Deriving the
 * list from the data would be circular and catch nothing. So this is the explicit reviewed list, and
 * extending it is a deliberate act: add the value here in the same change that authors it.
 */
const KNOWN_SERVICES = new Set([
  'black_market', 'missions', 'module_craft', 'ore_buy', 'refine', 'refuel',
  'repair', 'scan', 'scan_tech', 'shipyard', 'toll', 'trade',
]);

/** Discovery-rule namespaces usable in an authored `gatedBy`, and how to resolve each one. */
const DISCOVERY_RULE_RESOLVERS = {
  tech: (id) => TECH_NODES.some((node) => node && node.id === id),
};

function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) return null;
  try {
    return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function hasXZ(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
}

/** Compact "tier=count" summary so the gate prints WHERE places are landing, not just that they did.
 *  A sudden swing toward the glyph tier means content is arriving without geometry — worth seeing. */
function tierCensus(proxies) {
  const counts = new Map();
  for (const proxy of proxies.values()) counts.set(proxy.tier, (counts.get(proxy.tier) || 0) + 1);
  return [...counts.entries()].sort().map(([tier, n]) => `${tier}=${n}`).join(' ');
}

/**
 * Every `destSectorId` / `destStationId` anywhere in the authored mission catalogues, with the
 * owning mission id for the error message. Missions nest destinations at several depths (mission ->
 * commonStages -> branches -> stages), so this walks generically rather than assuming one shape —
 * a hard-coded depth would silently stop checking the day someone adds a nesting level.
 */
function walkMissionDestinations() {
  const out = [];
  const DEST_FIELDS = new Set(['destSectorId', 'destStationId']);
  const visit = (value, missionId, seen) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) visit(item, missionId, seen);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (DEST_FIELDS.has(key) && typeof child === 'string' && child) {
        out.push({ missionId, field: key, value: child });
      } else if (child && typeof child === 'object') {
        visit(child, missionId, seen);
      }
    }
  };
  for (const mission of SET_PIECE_MISSIONS || []) {
    visit(mission, (mission && mission.id) || 'set_piece_mission', new Set());
  }
  for (const beat of STORY_BEATS || []) {
    visit(beat, (beat && beat.id) || 'story_beat', new Set());
  }
  return out;
}

/**
 * The worked-example node id declared by the registration guide, via an HTML comment marker:
 *     <!-- atlas-example: zone_tethys_driftmark -->
 * A machine-readable marker rather than prose parsing, so reformatting the document cannot
 * accidentally disable the check that keeps the document honest.
 * Returns null when the doc or the marker is absent — both are failures, reported distinctly.
 */
function readDocExampleId() {
  if (!existsSync(REGISTRATION_DOC)) return null;
  const text = readFileSync(REGISTRATION_DOC, 'utf8');
  const match = text.match(/<!--\s*atlas-example:\s*([A-Za-z0-9_]+)\s*-->/);
  return match ? match[1] : null;
}

/** Walk the authored sources directly. Never read the atlas here — that is the point of the
 *  comparison: two independent counts of the same content must agree. */
function authoredCensus(sectors, zoneLookup) {
  const counts = { sector: 0, station: 0, gate: 0, zone: 0, poi: 0 };
  const anchors = [];   // { nodeId, sectorId, local } for every authored anchor
  const unanchored = []; // places authored without a position
  for (const sector of sectors) {
    if (!sector || typeof sector.id !== 'string') continue;
    counts.sector += 1;
    anchors.push({ nodeId: sector.id, sectorId: sector.id, local: { x: 0, z: 0 } });

    for (const station of sector.stations || []) {
      counts.station += 1;
      if (hasXZ(station.pos)) anchors.push({ nodeId: station.id, sectorId: sector.id, local: station.pos });
      else unanchored.push(`station ${station.id} in ${sector.id}`);
    }
    for (const gate of sector.gates || []) {
      counts.gate += 1;
      const nodeId = gateNodeId(sector.id, gate.to);
      if (hasXZ(gate.pos)) anchors.push({ nodeId, sectorId: sector.id, local: gate.pos });
      else unanchored.push(`gate ${nodeId}`);
    }
    for (const poi of sector.pois || []) {
      counts.poi += 1;
      if (hasXZ(poi.pos)) anchors.push({ nodeId: poi.id, sectorId: sector.id, local: poi.pos });
      else unanchored.push(`poi ${poi.id} in ${sector.id}`);
    }
    for (const zone of zoneLookup(sector.id) || []) {
      counts.zone += 1;
      if (hasXZ(zone.center)) anchors.push({ nodeId: zone.id, sectorId: sector.id, local: zone.center });
      else unanchored.push(`zone ${zone.id} in ${sector.id}`);
    }
  }
  return { counts, anchors, unanchored };
}

/**
 * @param {{sectors?:any[], zonesForSector?:(id:string)=>any[], origins?:Record<string,{x:number,z:number}>}|null} [sources]
 *   Defaults to the live authored data. Injectable for the same reason buildAtlasIndex is: a gate
 *   nobody has ever seen fail is not a gate, and test/atlas-index.test.mjs drives deliberately broken
 *   content through this exact function to prove each assertion still bites.
 */
export function checkAtlasIntegrity(sources = null) {
  const sectors = sources && Array.isArray(sources.sectors) ? sources.sectors : SECTORS;
  const zoneLookup = sources && typeof sources.zonesForSector === 'function'
    ? sources.zonesForSector
    : zonesForSector;
  const origins = sources && sources.origins ? sources.origins : SECTOR_GLOBAL_ORIGINS;

  const atlas = buildAtlasIndex({ sectors, zonesForSector: zoneLookup });
  const { counts, anchors, unanchored } = authoredCensus(sectors, zoneLookup);
  const knownSectorIds = new Set(Object.keys(origins));
  const sectorById = new Map(sectors.map((s) => [s.id, s]));
  const checks = [];
  const findings = [];

  // 1. Every node resolves to a sector that exists in the frozen origin table. A place parented to
  //    an unknown sector would silently fail closed to Helios origin and land in the wrong system.
  const unknownSector = [];
  for (const node of atlas.nodes) {
    if (!knownSectorIds.has(node.sectorId)) unknownSector.push(`${node.id} -> ${node.sectorId}`);
  }
  checks.push({ name: 'nodeSectorResolves', pass: unknownSector.length === 0, details: unknownSector });

  // 2. Gate links name a sector that exists.
  const unknownGateTarget = [];
  for (const node of atlas.nodesOfKind('gate')) {
    if (!knownSectorIds.has(node.linkSectorId)) {
      unknownGateTarget.push(`${node.id} -> ${node.linkSectorId}`);
    }
  }
  checks.push({ name: 'gateTargetResolves', pass: unknownGateTarget.length === 0, details: unknownGateTarget });

  // 3. Per-kind counts match the independently walked authored census.
  const countMismatch = [];
  for (const kind of ATLAS_NODE_KINDS) {
    const built = atlas.nodesOfKind(kind).length;
    if (built !== counts[kind]) countMismatch.push(`${kind}: atlas=${built} authored=${counts[kind]}`);
  }
  checks.push({
    name: 'nodeCountsMatchAuthored',
    pass: countMismatch.length === 0,
    actual: ATLAS_NODE_KINDS.map((k) => `${k}=${atlas.nodesOfKind(k).length}`).join(' '),
    details: countMismatch,
  });

  // 4. No duplicate node ids anywhere in the atlas, and no duplicate edge ids.
  const seenNode = new Set();
  const dupNodes = [];
  for (const node of atlas.nodes) {
    if (seenNode.has(node.id)) dupNodes.push(node.id);
    seenNode.add(node.id);
  }
  checks.push({ name: 'uniqueNodeIds', pass: dupNodes.length === 0, details: dupNodes });

  const seenEdge = new Set();
  const dupEdges = [];
  for (const edge of atlas.edges) {
    if (seenEdge.has(edge.id)) dupEdges.push(edge.id);
    seenEdge.add(edge.id);
  }
  checks.push({ name: 'uniqueEdgeIds', pass: dupEdges.length === 0, details: dupEdges });

  // 5. Every authored anchor round-trips exactly through the global frame. This is the assertion
  //    that protects nonzero-origin sectors: Tethys sits at (12288, 8192), so any lossy conversion
  //    shows up here rather than as a station drawn on top of the player 12k units away.
  const roundTripFails = [];
  for (const { nodeId, sectorId, local } of anchors) {
    const global = sectorLocalToGlobalForSector(local, sectorId);
    const back = globalToSectorLocalForSector(global, sectorId);
    if (back.x !== local.x || back.z !== local.z) {
      roundTripFails.push(`${nodeId}: (${local.x},${local.z}) -> (${global.x},${global.z}) -> (${back.x},${back.z})`);
    }
  }
  checks.push({
    name: 'anchorRoundTrip',
    pass: roundTripFails.length === 0,
    actual: `${anchors.length} anchors`,
    details: roundTripFails,
  });

  // 6. Atlas global position agrees with a fresh conversion of the authored anchor.
  const positionDrift = [];
  for (const { nodeId, sectorId, local } of anchors) {
    const node = atlas.getNode(nodeId);
    if (!node) { positionDrift.push(`${nodeId}: missing from atlas`); continue; }
    const expected = sectorLocalToGlobalForSector(local, sectorId);
    if (!node.hasPosition || node.globalPos.x !== expected.x || node.globalPos.z !== expected.z) {
      positionDrift.push(`${nodeId}: atlas=${JSON.stringify(node.globalPos)} expected=${JSON.stringify(expected)}`);
    }
  }
  checks.push({ name: 'globalPositionMatchesAuthored', pass: positionDrift.length === 0, details: positionDrift });

  // 7. Zone centres lie inside their own sector. The per-sector worldRadius disc is the real bound;
  //    corridorPlayableBounds is a single global fence around the whole 24-sector union and is only
  //    a coarse outer sanity net (see the note printed below).
  const zonesOutOfSector = [];
  for (const node of atlas.nodesOfKind('zone')) {
    const sector = sectorById.get(node.sectorId);
    const worldRadius = (sector && sector.worldRadius) || 4000;
    const local = globalToSectorLocalForSector(node.globalPos, node.sectorId);
    const d = Math.sqrt(local.x * local.x + local.z * local.z);
    if (d > worldRadius) {
      zonesOutOfSector.push(`${node.id}: ${Math.round(d)} WU from centre > worldRadius ${worldRadius}`);
    }
  }
  checks.push({ name: 'zonesInsideSector', pass: zonesOutOfSector.length === 0, details: zonesOutOfSector });

  const fence = corridorPlayableBounds(sectors);
  const outsideFence = [];
  for (const node of atlas.nodes) {
    if (!node.hasPosition) continue;
    const dx = node.globalPos.x - fence.center.x;
    const dz = node.globalPos.z - fence.center.z;
    if (Math.sqrt(dx * dx + dz * dz) > fence.hardRadius) outsideFence.push(node.id);
  }
  checks.push({ name: 'insideCorridorPlayableBounds', pass: outsideFence.length === 0, details: outsideFence });

  // 8. Sector node set and the frozen origin table agree in BOTH directions.
  const atlasSectorNodes = new Set(atlas.nodesOfKind('sector').map((n) => n.id));
  const missingNode = [...knownSectorIds].filter((id) => !atlasSectorNodes.has(id)).sort();
  const extraNode = [...atlasSectorNodes].filter((id) => !knownSectorIds.has(id)).sort();
  checks.push({
    name: 'sectorNodesMatchOrigins',
    pass: missingNode.length === 0 && extraNode.length === 0,
    actual: `${atlasSectorNodes.size} nodes / ${knownSectorIds.size} origins`,
    details: [
      ...missingNode.map((id) => `origin without node: ${id}`),
      ...extraNode.map((id) => `node without origin: ${id}`),
    ],
  });

  // 9. Every edge endpoint resolves to a real node.
  const danglingEndpoints = [];
  for (const edge of atlas.edges) {
    for (const endpoint of [edge.a, edge.b]) {
      if (!atlas.getNode(endpoint)) danglingEndpoints.push(`${edge.id}: ${endpoint}`);
    }
  }
  checks.push({ name: 'edgeEndpointsResolve', pass: danglingEndpoints.length === 0, details: danglingEndpoints });

  // ══ W3-D: registration-path assertions ══════════════════════════════════════════════════════
  //
  // Everything above proves the atlas is internally coherent. Everything below proves a place a
  // human just authored actually ARRIVED — that it charts, labels, describes itself, resolves art,
  // and can be routed to. These are the assertions that make "there is one obvious path to add a
  // place" a fact rather than a promise.

  const manifest = loadManifest();

  // 10. Every authored gameplay place reaches the atlas. The count check above proves the TOTALS
  //     agree; this proves the IDENTITIES agree. Both can pass individually while one place is
  //     silently swapped for another, which is exactly the failure a content author would not spot.
  const missingFromAtlas = [];
  for (const sector of sectors) {
    if (!sector || typeof sector.id !== 'string') continue;
    const expect = [
      ...(sector.stations || []).map((s) => [s && s.id, `station in ${sector.id}`]),
      ...(sector.gates || []).map((g) => [g && g.to ? gateNodeId(sector.id, g.to) : null, `gate in ${sector.id}`]),
      ...(sector.pois || []).map((p) => [p && p.id, `poi in ${sector.id}`]),
      ...(zoneLookup(sector.id) || []).map((z) => [z && z.id, `zone in ${sector.id}`]),
    ];
    for (const [id, where] of expect) {
      if (!id) continue;
      if (!atlas.getNode(id)) missingFromAtlas.push(`${id} (${where}) authored but absent from the atlas`);
    }
  }
  checks.push({
    name: 'authoredPlacesReachAtlas',
    pass: missingFromAtlas.length === 0,
    details: missingFromAtlas,
  });

  // 11. Every node has a safe map representation AND an accessible label. A place that charts but
  //     cannot be spoken is not finished — the map is a primary surface, not a decoration.
  const noRepresentation = [];
  const proxies = new Map();
  for (const node of atlas.nodes) {
    let proxy = null;
    try {
      proxy = resolveAtlasProxy(node, { manifest });
    } catch (err) {
      noRepresentation.push(`${node.id}: proxy resolution threw — ${err && err.message}`);
      continue;
    }
    if (!proxy) { noRepresentation.push(`${node.id}: no proxy descriptor returned`); continue; }
    proxies.set(node.id, proxy);
    if (!proxy.label || !String(proxy.label).trim()) noRepresentation.push(`${node.id}: empty map label`);
    if (!proxy.accessibleText || !String(proxy.accessibleText).trim()) {
      noRepresentation.push(`${node.id}: empty accessible description`);
    }
    if (!proxy.glyph) noRepresentation.push(`${node.id}: no fallback glyph`);
    if (!Object.values(PROXY_TIER).includes(proxy.tier)) {
      noRepresentation.push(`${node.id}: unknown proxy tier '${proxy.tier}'`);
    }
    if (!proxy.inspector || !proxy.inspector.length) {
      noRepresentation.push(`${node.id}: no inspector fields — nothing to show on selection`);
    }
  }
  checks.push({
    name: 'everyNodeHasMapRepresentation',
    pass: noRepresentation.length === 0,
    actual: `${proxies.size} proxies resolved`,
    details: noRepresentation,
  });

  // 12. THE LOAD-BEARING ONE. No node may be unrepresentable without bespoke art. If this ever
  //     fails, adding ordinary content has silently become "commission a hologram first", which is
  //     the single failure mode the proxy tiers exist to prevent.
  const needsBespoke = [];
  for (const [id, proxy] of proxies) {
    const representable = proxy.tier === PROXY_TIER.PROCEDURAL
      || proxy.tier === PROXY_TIER.GLYPH
      || (proxy.tier === PROXY_TIER.GLB_DERIVED && proxy.budget && proxy.budget.verified);
    if (!representable) needsBespoke.push(`${id}: tier ${proxy.tier} without a usable fallback`);
  }
  checks.push({
    name: 'noPlaceRequiresBespokeArt',
    pass: needsBespoke.length === 0,
    actual: tierCensus(proxies),
    details: needsBespoke,
  });

  // 13. Proxy source assets are AVAILABLE: listed in the manifest and present on disk.
  //
  //     Scope is deliberate. Availability is unambiguous — an authored `archetypeGlb` naming an
  //     asset that does not exist is always a bug, and it fails here. WEIGHT is not this gate's
  //     ruling to make: `scripts/check-parts-manifest.mjs` already owns asset budgets, classifies
  //     by the authored `budgetClass` field (not by a tris heuristic), and deliberately reports
  //     byte-profile overruns via `diagnose` rather than failing on them. Nine shipped station
  //     assets are over the part byte profile today by that reckoning. Re-litigating their weight
  //     here with a stricter rule would fail the atlas gate for a decision the asset pipeline has
  //     already made — so overweight sources are REPORTED with their numbers and the ruling stays
  //     where it belongs. What this gate does own fail-closed is the size of the DERIVED proxy,
  //     asserted against MAP_PROXY_TRIANGLE_CAP in check 14.
  const assetProblems = [];
  const heavySources = [];
  const budgets = (manifest && manifest.budgets) || null;
  if (!manifest) {
    assetProblems.push(`parts_manifest.json missing or unparseable at ${MANIFEST_PATH}`);
  } else {
    for (const node of atlas.nodes) {
      const assetId = authoredAssetForNode(node.id);
      if (!assetId) continue;
      const entry = (manifest.parts || []).find((p) => p && p.id === assetId);
      if (!entry) {
        assetProblems.push(`${node.id}: authored asset '${assetId}' is not listed in parts_manifest.json`
          + ' — add it to the manifest or correct the archetypeGlb/landmarkGlb id');
        continue;
      }
      const file = resolve(ROOT, 'assets/ships/parts', entry.file || '');
      if (!existsSync(file)) {
        assetProblems.push(`${node.id}: asset '${assetId}' listed as ${entry.file} but the file is missing on disk`);
      }
      if (budgets) {
        // Same classifier the manifest gate uses: the authored budgetClass field.
        const landmark = entry.budgetClass === 'landmark';
        const byteCap = landmark ? budgets.maxBytesPerLandmark : budgets.maxBytesPerPart;
        if (Number.isFinite(byteCap) && Number.isFinite(entry.bytes) && entry.bytes > byteCap) {
          heavySources.push(`${assetId} (${(entry.bytes / 1e6).toFixed(1)} MB > ${(byteCap / 1e6).toFixed(0)} MB `
            + `${landmark ? 'landmark' : 'part'} profile) — source art only; the map proxy is decimated`);
        }
      }
    }
  }
  checks.push({ name: 'proxyAssetsAvailable', pass: assetProblems.length === 0, details: assetProblems });

  // 14. The map-proxy triangle cap stays below the cheapest shipped `places/` LOD0, and no resolved
  //     proxy exceeds it. Re-derived every run so the constant cannot rot as the art library grows.
  const budgetProblems = [];
  if (manifest) {
    const placeTris = (manifest.parts || [])
      .filter((p) => p && p.category === 'places' && Number.isFinite(p.tris))
      .map((p) => p.tris);
    if (placeTris.length) {
      const cheapest = Math.min(...placeTris);
      if (MAP_PROXY_TRIANGLE_CAP >= cheapest) {
        budgetProblems.push(`MAP_PROXY_TRIANGLE_CAP ${MAP_PROXY_TRIANGLE_CAP} is no longer below the cheapest `
          + `shipped places asset (${cheapest} tris) — a chart marker may now cost more than the object it represents`);
      }
    }
  }
  for (const [id, proxy] of proxies) {
    const tris = proxy.budget && Number.isFinite(proxy.budget.triangles) ? proxy.budget.triangles : 0;
    if (tris > MAP_PROXY_TRIANGLE_CAP) {
      budgetProblems.push(`${id}: proxy budget ${tris} tris exceeds MAP_PROXY_TRIANGLE_CAP ${MAP_PROXY_TRIANGLE_CAP}`);
    }
  }
  checks.push({
    name: 'proxyBudgetsWithinCap',
    pass: budgetProblems.length === 0,
    actual: `cap ${MAP_PROXY_TRIANGLE_CAP} tris`,
    details: budgetProblems,
  });

  // 15. Proxy generation actually builds. A descriptor that names geometry it cannot produce is the
  //     "generated-proxy build failure" case, and it must fail here rather than as an empty chart.
  const buildFailures = [];
  for (const [id, proxy] of proxies) {
    if (proxy.tier !== PROXY_TIER.PROCEDURAL) continue;
    const g = proxy.geometry;
    if (!g) { buildFailures.push(`${id}: procedural proxy produced no geometry`); continue; }
    if (!g.segments || !g.vertices || g.vertices.length < 4) {
      buildFailures.push(`${id}: degenerate proxy geometry (segments=${g.segments}, verts=${g.vertices ? g.vertices.length : 0})`);
      continue;
    }
    if (g.vertices.length !== g.segments * 2) {
      buildFailures.push(`${id}: vertex count ${g.vertices.length} disagrees with segments ${g.segments}`);
    }
    if (g.vertices.some((v) => !Number.isFinite(v))) {
      buildFailures.push(`${id}: proxy geometry contains a non-finite coordinate`);
    }
  }
  for (const edge of atlas.edges) {
    const proxy = resolveEdgeProxy(edge, atlas);
    if (!proxy) { buildFailures.push(`${edge.id}: edge proxy returned null`); continue; }
    if (!proxy.accessibleText || !proxy.accessibleText.trim()) {
      buildFailures.push(`${edge.id}: edge proxy has no accessible description`);
    }
  }
  checks.push({ name: 'proxyGeometryBuilds', pass: buildFailures.length === 0, details: buildFailures });

  // 16. Authored references resolve: faction, service, zone type, and discovery rule. An unknown
  //     value here is a typo that would otherwise degrade silently into "no authority", "a service
  //     nobody offers", or "a gate that never opens".
  const badRefs = [];
  const knownFactions = new Set(FACTION_META.map((f) => f && f.id));
  const knownZoneTypes = new Set(Object.keys(ZONE_TYPES));
  for (const node of atlas.nodes) {
    if (node.factionId && !knownFactions.has(node.factionId)) {
      badRefs.push(`${node.id}: unknown factionId '${node.factionId}'`);
    }
    for (const service of node.services || []) {
      if (!KNOWN_SERVICES.has(service)) {
        badRefs.push(`${node.id}: unknown service '${service}' (add it to KNOWN_SERVICES if intended)`);
      }
    }
    if (node.kind === 'zone' && node.placeType && !knownZoneTypes.has(node.placeType)) {
      badRefs.push(`${node.id}: unknown zone type '${node.placeType}'`);
    }
  }
  for (const sector of sectors) {
    const gated = [
      ...(sector.pois || []),
      ...(sector.stations || []),
      sector.wormholeTo || null,
    ].filter(Boolean);
    for (const place of gated) {
      if (!place.gatedBy) continue;
      const [ns, ...rest] = String(place.gatedBy).split(':');
      const resolver = DISCOVERY_RULE_RESOLVERS[ns];
      const label = place.id || `${sector.id} wormholeTo`;
      if (!resolver) {
        badRefs.push(`${label}: gatedBy '${place.gatedBy}' uses unknown namespace '${ns}'`);
      } else if (!resolver(rest.join(':'))) {
        badRefs.push(`${label}: gatedBy '${place.gatedBy}' names a ${ns} that does not exist`);
      }
    }
  }
  checks.push({ name: 'authoredReferencesResolve', pass: badRefs.length === 0, details: badRefs });

  // 17. Mission destinations resolve to real atlas nodes. A mission that routes to an id the chart
  //     has never heard of is the "destination lacking arrival metadata" failure: the objective
  //     exists, the marker does not, and the player is told to fly to nowhere.
  const badDestinations = [];
  for (const { missionId, field, value } of walkMissionDestinations()) {
    const node = atlas.getNode(value);
    if (!node) {
      badDestinations.push(`${missionId}: ${field} '${value}' resolves to no atlas node`);
      continue;
    }
    if (!node.hasPosition) {
      badDestinations.push(`${missionId}: ${field} '${value}' has no surveyed position — cannot be an arrival target`);
    }
  }
  checks.push({
    name: 'missionDestinationsResolve',
    pass: badDestinations.length === 0,
    details: badDestinations,
  });

  // 18. The registration doc's worked example still validates. This is what stops the guide rotting:
  //     the doc names a real id, and the gate proves that id is still a live, charted, representable
  //     place. A doc whose example no longer exists is worse than no doc.
  const docProblems = [];
  const exampleId = readDocExampleId();
  if (exampleId === null) {
    docProblems.push(`${REGISTRATION_DOC} is missing or declares no "<!-- atlas-example: ID -->" marker`);
  } else {
    const node = atlas.getNode(exampleId);
    if (!node) {
      docProblems.push(`documentation example '${exampleId}' no longer exists in the atlas`);
    } else {
      const proxy = proxies.get(exampleId);
      if (!proxy) docProblems.push(`documentation example '${exampleId}' has no map representation`);
      if (!node.hasPosition) docProblems.push(`documentation example '${exampleId}' has no surveyed position`);
    }
  }
  checks.push({
    name: 'docExampleValidates',
    pass: docProblems.length === 0,
    actual: exampleId || 'no example declared',
    details: docProblems,
  });

  // ── Report-only findings ────────────────────────────────────────────────────────────────────
  const nonReciprocal = atlas.edges.filter((e) => e.kind === 'gate-link' && !e.reciprocal);
  const reciprocal = atlas.edges.filter((e) => e.kind === 'gate-link' && e.reciprocal);
  for (const edge of nonReciprocal) {
    const gate = atlas.getNode(edge.a);
    const authoredOneWay = edge.traverse.type === 'wormhole';
    findings.push(
      `non-reciprocal gate: ${gate ? gate.sectorId : edge.a} -> ${gate ? gate.linkSectorId : edge.b}`
      + ` (edge ${edge.id}, traverse=${edge.traverse.type})`
      + (authoredOneWay
        ? ' — authored one-way wormhole; the destination has no return gate by design'
        : ' — NO authored one-way marker; this looks like a missing return gate'),
    );
  }
  if (!nonReciprocal.length) findings.push('non-reciprocal gates: none');
  for (const place of unanchored) findings.push(`unanchored place (modelled with globalPos=null): ${place}`);
  if (!unanchored.length) findings.push('unanchored places: none — every authored place has a position');

  const uniqueHeavy = [...new Set(heavySources)].sort();
  for (const heavy of uniqueHeavy) findings.push(`overweight proxy source: ${heavy}`);
  if (!uniqueHeavy.length) findings.push('overweight proxy sources: none');

  const pass = checks.every((c) => c.pass);
  return { pass, checks, findings, atlas, counts, fence, reciprocalCount: reciprocal.length };
}

function formatCheck(check) {
  let line = `  ${check.name}: ${check.pass ? 'PASS' : 'FAIL'}`;
  if (check.actual) line += ` (${check.actual})`;
  if (check.details && check.details.length) {
    const first = check.details.slice(0, 5).join('; ');
    const more = check.details.length > 5 ? ` … (+${check.details.length - 5} more)` : '';
    line += ` — ${first}${more}`;
  }
  return line;
}

function run() {
  try {
    const result = checkAtlasIntegrity();
    const { atlas, counts, fence } = result;

    console.log('Atlas integrity gate');
    console.log('====================');
    console.log(`Schema: ${atlas.schema} over coordinates ${atlas.coordinateSchema}`);
    console.log(`Nodes: ${atlas.nodes.length} (${ATLAS_NODE_KINDS.map((k) => `${k}=${counts[k]}`).join(', ')})`);
    console.log(`Edges: ${atlas.edges.length} (gate-link=${atlas.edges.filter((e) => e.kind === 'gate-link').length}`
      + `, corridor=${atlas.edges.filter((e) => e.kind === 'corridor').length}`
      + `; reciprocal gate pairs=${result.reciprocalCount})`);
    console.log('');
    console.log('Fail-closed assertions:');
    for (const c of result.checks) console.log(formatCheck(c));
    console.log('');
    console.log('Findings (report-only — the lead rules on these, the gate does not):');
    for (const f of result.findings) console.log(`  - ${f}`);
    console.log('');
    console.log(`Note: corridorPlayableBounds is ONE global fence (centre ${Math.round(fence.center.x)},`
      + `${Math.round(fence.center.z)} radius ${Math.round(fence.radius)} WU) around all 24 sectors, not a`
      + ' per-sector bound. zonesInsideSector is the assertion that actually constrains a zone.');
    console.log('');
    console.log(result.pass ? 'Result: PASS — atlas integrity accepted' : 'Result: FAIL — atlas integrity violated');

    process.exitCode = result.pass ? 0 : 1;
  } catch (err) {
    console.error('Atlas integrity gate internal error:', err && err.message ? err.message : err);
    process.exit(1);
  }
}

function isMainModule() {
  try {
    return fileURLToPath(import.meta.url) === (process.argv[1] ? resolve(process.argv[1]) : '');
  } catch {
    return false;
  }
}

if (isMainModule()) run();
