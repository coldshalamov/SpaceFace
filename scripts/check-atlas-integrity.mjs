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

import { buildAtlasIndex, ATLAS_NODE_KINDS, gateNodeId } from '../src/core/atlasIndex.js';
import { SECTORS } from '../src/data/sectors.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import {
  SECTOR_GLOBAL_ORIGINS,
  sectorLocalToGlobalForSector,
  globalToSectorLocalForSector,
  corridorPlayableBounds,
} from '../src/data/sectorCoordinates.js';

function hasXZ(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
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

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

function isMainModule() {
  try {
    return fileURLToPath(import.meta.url) === (process.argv[1] ? resolve(process.argv[1]) : '');
  } catch {
    return false;
  }
}

if (isMainModule()) run();
