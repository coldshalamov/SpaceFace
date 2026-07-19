// Atlas read model — the one place that converts authored sector-local anchors into canonical
// galactic-global positions, so downstream consumers (route planner, map, strategic layer) all read
// one frame instead of each re-deriving the conversion and disagreeing at nonzero-origin sectors.
//
// What this module is NOT, deliberately:
//   * NOT a coordinate system. `global_v1` in src/core/coordinates.js is the coordinate system.
//     This module only composes authored sector-local anchors through sectorLocalToGlobalForSector.
//   * NOT a registry or an authored data file. Every node and edge here is DERIVED from
//     src/data/sectors.js + src/data/sectorZones.js. Adding a place means editing those; this index
//     picks it up and scripts/check-atlas-integrity.mjs proves it landed.
//   * NOT the owner of discovery state. `discoveryTier` is the AUTHORED BASELINE only (a sector's
//     `charted` flag, a POI's `hidden`/`gatedBy` flag). Live per-save discovery lives in
//     state.world.discovery and is read through galaxyMap's isSectorCharted/mapConfidenceForSector.
//     Never write runtime discovery back into an atlas node.
//   * NOT live entities. entityIterator is live truth; the atlas is chart truth that live entities
//     overlay. Nothing here ticks — this module is not a system and is not in UPDATE_ORDER.
//
// Sector-local authoring is CORRECT and stays untouched: it is the right frame for a human placing a
// station 1280 WU east of a sector centre. The conversion happens here, at the boundary, once.
//
// Determinism: pure, Three.js-free, no Math.random, no Date.now, no ambient state. Every collection
// is sorted by id, so building the index twice is deep-equal. Distances use Math.sqrt rather than
// Math.hypot because ECMAScript only specifies hypot as implementation-approximated, and a chart
// distance that differs between engines is a route-planner bug waiting to happen.

import { COORDINATE_SCHEMA } from './coordinates.js';
import { SECTORS } from '../data/sectors.js';
import { zonesForSector as liveZonesForSector } from '../data/sectorZones.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { MISSION_TUNING } from '../data/missions.js';

export const ATLAS_SCHEMA = 'atlas_v1';

/** The five map-visible kinds. Asteroid fields are deliberately absent — they are mining geometry,
 *  not places you route to, and inventing a sixth kind for them would put the atlas in the business
 *  of owning content it does not chart. */
export const ATLAS_NODE_KINDS = Object.freeze(['sector', 'station', 'gate', 'zone', 'poi']);

export const ATLAS_EDGE_KINDS = Object.freeze(['gate-link', 'corridor']);

/**
 * Authored baseline visibility. This is NOT the player's discovery state — see the module header.
 * charted   — the sector is authored `charted: true`; the place is public knowledge.
 * uncharted — the sector is authored `charted: false`; it exists but is fog on a fresh save.
 * hidden    — the place itself is authored `hidden` or `gatedBy`, regardless of its sector.
 */
export const DISCOVERY_TIER = Object.freeze({
  CHARTED: 'charted',
  UNCHARTED: 'uncharted',
  HIDDEN: 'hidden',
});

/** Reference cruise speed for `traverse.baseTimeS`. Imported rather than redeclared so an atlas ETA
 *  and a mission time limit never quietly disagree about how fast a ship crosses open space. */
export const ATLAS_CRUISE_SPEED_WU_PER_S = MISSION_TUNING.cruiseSpeedRef || 140;

/** Gate anchors carry no authored id — only `{ to, pos }` — so the atlas synthesizes a stable one.
 *  Direction is part of the identity: the Helios-side gate to Ceres and the Ceres-side gate back are
 *  two distinct physical objects in two distinct sectors. */
export function gateNodeId(sectorId, toSectorId) {
  return `gate_${sectorId}__${toSectorId}`;
}

function byIdAsc(a, b) {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function asc(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function round2(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

function hasXZ(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
}

function distanceWU(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return round2(Math.sqrt(dx * dx + dz * dz));
}

/**
 * Compose an authored sector-local anchor into the canonical global frame.
 * Returns `{ globalPos: null, hasPosition: false }` when the anchor is absent. A missing anchor is
 * modelled honestly rather than defaulted to the sector origin: a fabricated (0,0) would place an
 * unanchored station exactly on top of the sector centre, and every consumer downstream — nearest
 * lookups, route legs, map markers — would treat that lie as a surveyed fact.
 */
function resolveGlobal(anchor, sectorId) {
  if (!hasXZ(anchor)) return { globalPos: null, hasPosition: false };
  const g = sectorLocalToGlobalForSector(anchor, sectorId);
  return { globalPos: Object.freeze({ x: g.x, z: g.z }), hasPosition: true };
}

function sectorDiscoveryTier(sector) {
  return sector && sector.charted ? DISCOVERY_TIER.CHARTED : DISCOVERY_TIER.UNCHARTED;
}

function placeDiscoveryTier(place, sector) {
  if (place && (place.hidden || place.gatedBy)) return DISCOVERY_TIER.HIDDEN;
  return sectorDiscoveryTier(sector);
}

/**
 * Build one node record. `placeType` carries the authored sub-type (trade_hub, derelict, ambush_lane)
 * because `kind` alone collapses a refinery and a black market into "station", and that distinction
 * is the single most-read fact downstream. `radiusWU` is the authored zone extent — a zone is a disc,
 * and recording it as a bare point would misreport authored geometry.
 */
function makeNode({
  id, kind, sectorId, name, anchor, factionId = null, services = null,
  placeType = null, radiusWU = null, linkSectorId = null, discoveryTier,
}) {
  const { globalPos, hasPosition } = resolveGlobal(anchor, sectorId);
  return Object.freeze({
    id,
    kind,
    sectorId,
    name: typeof name === 'string' && name ? name : id,
    globalPos,
    hasPosition,
    factionId: typeof factionId === 'string' && factionId ? factionId : null,
    services: Array.isArray(services) ? Object.freeze([...services]) : null,
    placeType,
    radiusWU: Number.isFinite(radiusWU) ? radiusWU : null,
    linkSectorId,
    discoveryTier,
  });
}

function buildNodes(sectors, zonesForSector) {
  const nodes = [];
  for (const sector of sectors) {
    if (!sector || typeof sector.id !== 'string') continue;
    const sectorId = sector.id;
    const tier = sectorDiscoveryTier(sector);

    // The sector node sits at sector-local (0,0) — i.e. exactly its authored global origin.
    nodes.push(makeNode({
      id: sectorId,
      kind: 'sector',
      sectorId,
      name: sector.name,
      anchor: { x: 0, z: 0 },
      factionId: sector.factionId,
      // placeType stays null for sectors. It carries the authored SUB-TYPE (trade_hub, derelict,
      // ambush_lane); a sector's `tier` is a progression axis, and stuffing it into the same field
      // would make the atlas mean two different things by one name.
      placeType: null,
      radiusWU: sector.worldRadius,
      discoveryTier: tier,
    }));

    for (const station of sector.stations || []) {
      if (!station || typeof station.id !== 'string') continue;
      nodes.push(makeNode({
        id: station.id,
        kind: 'station',
        sectorId,
        name: station.name,
        anchor: station.pos,
        factionId: station.factionId,
        services: station.services,
        placeType: station.type,
        discoveryTier: placeDiscoveryTier(station, sector),
      }));
    }

    for (const gate of sector.gates || []) {
      if (!gate || typeof gate.to !== 'string') continue;
      nodes.push(makeNode({
        id: gateNodeId(sectorId, gate.to),
        kind: 'gate',
        sectorId,
        name: `Gate to ${gate.to}`,
        anchor: gate.pos,
        placeType: gate.wormhole ? 'wormhole' : 'gate',
        linkSectorId: gate.to,
        discoveryTier: placeDiscoveryTier(gate, sector),
      }));
    }

    for (const poi of sector.pois || []) {
      if (!poi || typeof poi.id !== 'string') continue;
      nodes.push(makeNode({
        id: poi.id,
        kind: 'poi',
        sectorId,
        name: poi.name,
        anchor: poi.pos,
        factionId: poi.factionId,
        placeType: poi.type,
        discoveryTier: placeDiscoveryTier(poi, sector),
      }));
    }

    for (const zone of zonesForSector(sectorId) || []) {
      if (!zone || typeof zone.id !== 'string') continue;
      nodes.push(makeNode({
        id: zone.id,
        kind: 'zone',
        sectorId,
        name: zone.name,
        anchor: zone.center,
        factionId: zone.factionId,
        placeType: zone.type,
        radiusWU: zone.radius,
        discoveryTier: placeDiscoveryTier(zone, sector),
      }));
    }
  }
  // Duplicates are NOT dropped here. Silently collapsing two places that share an id would hide a
  // real authoring bug; check-atlas-integrity asserts uniqueness and names the offenders.
  return nodes.sort(byIdAsc);
}

/** Hazard types authored at either end of a leg, deduped and sorted. Coarse by construction: the
 *  authored hazards are per-sector discs, so this answers "what environments border this leg", not
 *  "what does the straight line actually clip". */
function edgeHazards(sectorA, sectorB) {
  const types = new Set();
  for (const sector of [sectorA, sectorB]) {
    for (const hazard of (sector && sector.hazards) || []) {
      if (hazard && typeof hazard.type === 'string') types.add(hazard.type);
    }
  }
  return types.size ? Object.freeze([...types].sort(asc)) : null;
}

function makeEdge({ id, kind, a, b, type, from, to, reciprocal, hazards }) {
  const dist = from && to ? distanceWU(from, to) : 0;
  return Object.freeze({
    id,
    kind,
    a,
    b,
    reciprocal,
    traverse: Object.freeze({
      type,
      distanceWU: dist,
      baseTimeS: round2(dist / ATLAS_CRUISE_SPEED_WU_PER_S),
    }),
    hazards: hazards || null,
  });
}

/**
 * Gate links, resolved reciprocally: a gate in A pointing at B is matched against B's gate pointing
 * back at A, and the pair becomes ONE undirected edge between the two physical gate nodes — the real
 * leg a ship flies. A gate with no counterpart is NOT discarded and does not get a fabricated return
 * gate; it becomes a directed edge ending at the destination SECTOR node, flagged `reciprocal:false`.
 * The authored one-way wormhole (Veil Nebula → Ashfall Reach) is exactly this case.
 *
 * Edges come only from the `gates` arrays. `sector.wormholeTo` describes the same wormhole and is
 * deliberately not read here — consuming both would double-count the link.
 */
function buildGateEdges(sectors, sectorById, nodeById) {
  const edges = [];
  for (const sector of sectors) {
    if (!sector || typeof sector.id !== 'string') continue;
    for (const gate of sector.gates || []) {
      if (!gate || typeof gate.to !== 'string') continue;
      const fromNode = nodeById.get(gateNodeId(sector.id, gate.to));
      if (!fromNode) continue;
      const other = sectorById.get(gate.to);
      const backNode = other ? nodeById.get(gateNodeId(gate.to, sector.id)) : null;
      const type = gate.wormhole ? 'wormhole' : 'gate';

      if (backNode) {
        // One edge per pair, emitted only from the lexicographically smaller sector's side, so the
        // counterpart gate does not produce a mirrored duplicate. A genuinely duplicated authored
        // gate would still emit twice — the integrity check is what names that, not a silent skip.
        const [lo, hi] = sector.id < gate.to ? [sector.id, gate.to] : [gate.to, sector.id];
        if (sector.id !== lo) continue;
        edges.push(makeEdge({
          id: `gatelink_${lo}__${hi}`,
          kind: 'gate-link',
          a: fromNode.id,
          b: backNode.id,
          type,
          from: fromNode.globalPos,
          to: backNode.globalPos,
          reciprocal: true,
          hazards: edgeHazards(sector, other),
        }));
        continue;
      }

      const targetNode = nodeById.get(gate.to);
      edges.push(makeEdge({
        id: `gatelink_${sector.id}__${gate.to}`,
        kind: 'gate-link',
        a: fromNode.id,
        b: targetNode ? targetNode.id : gate.to,
        type,
        from: fromNode.globalPos,
        to: targetNode ? targetNode.globalPos : null,
        reciprocal: false,
        hazards: edgeHazards(sector, other),
      }));
    }
  }
  return edges;
}

/**
 * Corridor links: the M2a continuous geography means adjacent sectors share open space, so a ship can
 * cross the boundary under free flight without touching a gate. That is a different traversal from a
 * gate hop — different endpoints (sector centres, not gate anchors), different distance, different
 * time — so a route planner comparing "jump the gate" against "just fly it" needs both edge kinds.
 * Only reciprocally authored neighbour pairs qualify; a one-sided neighbour claim is not a corridor.
 */
function buildCorridorEdges(sectors, sectorById, nodeById) {
  const edges = [];
  for (const sector of sectors) {
    if (!sector || typeof sector.id !== 'string') continue;
    for (const neighborId of sector.neighbors || []) {
      const other = sectorById.get(neighborId);
      if (!other) continue;
      if (!(other.neighbors || []).includes(sector.id)) continue;
      // Emit once per pair, from the lexicographically smaller side (same rule as gate links).
      const [lo, hi] = sector.id < neighborId ? [sector.id, neighborId] : [neighborId, sector.id];
      if (sector.id !== lo) continue;
      const id = `corridor_${lo}__${hi}`;
      const aNode = nodeById.get(lo);
      const bNode = nodeById.get(hi);
      if (!aNode || !bNode) continue;
      edges.push(makeEdge({
        id,
        kind: 'corridor',
        a: aNode.id,
        b: bNode.id,
        type: 'freeflight',
        from: aNode.globalPos,
        to: bNode.globalPos,
        reciprocal: true,
        hazards: edgeHazards(sectorById.get(lo), sectorById.get(hi)),
      }));
    }
  }
  return edges;
}

/**
 * Build the atlas read model.
 *
 * @param {{sectors?: any[], zonesForSector?: (id:string)=>any[]}|null} [sources]
 *   Defaults to the live authored data. Injectable so checks and tests can drive synthetic content
 *   (an anchorless station, a deliberately duplicated id) through the real code path instead of
 *   asserting against a parallel reimplementation.
 */
export function buildAtlasIndex(sources = null) {
  const sectorSource = sources && Array.isArray(sources.sectors) ? sources.sectors : SECTORS;
  const zoneLookup = sources && typeof sources.zonesForSector === 'function'
    ? sources.zonesForSector
    : liveZonesForSector;

  // Iterate sectors in sorted id order so node/edge order never depends on authoring order.
  const sectors = [...sectorSource].filter((s) => s && typeof s.id === 'string').sort(byIdAsc);
  const sectorById = new Map(sectors.map((s) => [s.id, s]));

  const nodes = buildNodes(sectors, zoneLookup);
  const nodeById = new Map();
  for (const node of nodes) {
    if (!nodeById.has(node.id)) nodeById.set(node.id, node);
  }

  const edges = [
    ...buildGateEdges(sectors, sectorById, nodeById),
    ...buildCorridorEdges(sectors, sectorById, nodeById),
  ].sort(byIdAsc);

  const nodesBySector = new Map();
  const nodesByKind = new Map();
  for (const node of nodes) {
    if (!nodesBySector.has(node.sectorId)) nodesBySector.set(node.sectorId, []);
    nodesBySector.get(node.sectorId).push(node);
    if (!nodesByKind.has(node.kind)) nodesByKind.set(node.kind, []);
    nodesByKind.get(node.kind).push(node);
  }

  const edgesByNode = new Map();
  for (const edge of edges) {
    for (const endpoint of [edge.a, edge.b]) {
      if (!edgesByNode.has(endpoint)) edgesByNode.set(endpoint, []);
      edgesByNode.get(endpoint).push(edge);
    }
  }

  const frozenNodes = Object.freeze(nodes);
  const frozenEdges = Object.freeze(edges);

  const api = {
    schema: ATLAS_SCHEMA,
    coordinateSchema: COORDINATE_SCHEMA,
    nodes: frozenNodes,
    edges: frozenEdges,

    /** One node by stable id, or null. */
    getNode(id) {
      return nodeById.get(id) || null;
    },

    /** Every node authored into a sector, sorted by id. */
    nodesInSector(sectorId) {
      return nodesBySector.get(sectorId) || [];
    },

    /** Every node of one kind, sorted by id. */
    nodesOfKind(kind) {
      return nodesByKind.get(kind) || [];
    },

    /** Every edge touching a node, sorted by id. */
    edgesFrom(nodeId) {
      return edgesByNode.get(nodeId) || [];
    },

    /**
     * Nearest node to a global position. Nodes with no authored anchor are skipped — an unplaced
     * station must never win a proximity query. Ties break on id so the answer is stable.
     * @param {{x:number,z:number}} globalPos
     * @param {{kind?:string, sectorId?:string}} [filter]
     */
    nearestNode(globalPos, filter = null) {
      if (!hasXZ(globalPos)) return null;
      const kind = filter && filter.kind;
      const sectorId = filter && filter.sectorId;
      let best = null;
      let bestD2 = Infinity;
      for (const node of frozenNodes) {
        if (!node.hasPosition) continue;
        if (kind && node.kind !== kind) continue;
        if (sectorId && node.sectorId !== sectorId) continue;
        const dx = globalPos.x - node.globalPos.x;
        const dz = globalPos.z - node.globalPos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = node;
        }
      }
      return best;
    },

    /**
     * Sector ids reachable from a sector along atlas edges, sorted. A `reciprocal:false` edge is
     * one-way and only contributes in its authored direction, so an inbound-only wormhole never
     * advertises a return trip the player cannot make.
     */
    sectorNeighbors(sectorId) {
      const out = new Set();
      for (const edge of frozenEdges) {
        const aNode = nodeById.get(edge.a);
        const bNode = nodeById.get(edge.b);
        const aSector = aNode ? aNode.sectorId : null;
        const bSector = bNode ? bNode.sectorId : edge.b;
        if (aSector === sectorId && bSector && bSector !== sectorId) out.add(bSector);
        if (edge.reciprocal && bSector === sectorId && aSector && aSector !== sectorId) {
          out.add(aSector);
        }
      }
      return [...out].sort(asc);
    },

    /** Plain-data snapshot — the deep-equal surface for determinism checks. */
    toJSON() {
      return {
        schema: ATLAS_SCHEMA,
        coordinateSchema: COORDINATE_SCHEMA,
        nodes: frozenNodes,
        edges: frozenEdges,
      };
    },
  };

  return Object.freeze(api);
}
