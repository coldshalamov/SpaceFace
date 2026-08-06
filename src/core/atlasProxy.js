// Atlas proxy resolution — what a map-visible place looks like when it is a MARK on a chart rather
// than an object in the world.
//
// THE PROBLEM THIS SOLVES. A chart marker and a gameplay object are different things with different
// budgets. `place_station_trade_hub.glb` is 4.5 MB and exists so the station reads as architecture
// when you fly up to it. Loading that to draw a dot at system zoom — or to fill an inspector
// thumbnail for a place 12,000 WU away — is the wrong trade by three orders of magnitude. So every
// atlas node resolves, here, to the CHEAPEST representation that still carries its meaning.
//
// THE LOAD-BEARING RULE — read this before adding content:
//
//     Ordinary content must never be gated on an artist first modelling a hologram for it.
//
// Every node resolves to something. The tiers are ordered cheapest-first and the last one cannot
// fail, so a place authored five minutes ago with no art at all still charts, still labels, still
// reads to a screen reader, and still inspects. Bespoke geometry is an EARNED UPGRADE for places
// that carry narrative weight, never an entry requirement. `scripts/check-atlas-integrity.mjs`
// asserts this directly: zero nodes may depend on a bespoke asset to be representable.
//
// THE TIERS:
//
//   1. glb-derived  A low-detail proxy derived from an already-shipped gameplay GLB. Used only when
//                   the place already HAS art — it costs nothing new. This resolver names the source
//                   and the decimation budget; the derivation itself belongs to the asset pipeline
//                   (assets/ships/parts/, tools/art/finalize_part.mjs), which is where every other
//                   mesh in this game is built. No parallel pipeline is introduced here.
//   2. procedural   Parametric geometry generated from the numbers the author already wrote — a
//                   zone's radius, a gate's ring, a sector's extent, a corridor's chord. Fully
//                   generated in this module, deterministically, as real vertex data. This is the
//                   tier that ordinary content lands on, and it is why ordinary content is free.
//   3. glyph        A standardized glyph plus accessible text. The floor. Reached when a place has
//                   no art and no usable geometry — most importantly when it has no surveyed
//                   position at all, which is a real authored state (`hasPosition: false`) and must
//                   render as honest uncertainty rather than a fabricated point at the origin.
//
// WHAT THIS MODULE IS NOT. Not a renderer, not a registry, not a loader, not a cache. It computes a
// description; something else draws it. It holds no atlas state and adds no fields to AtlasNode
// (design/program/atlas/01_DECISIONS.md D2 fixes that record shape, and D9.1 rejects speculative
// per-node fields). It never ticks.
//
// Determinism: pure. No Three.js, no DOM, no RNG, no Date, no ambient state. Same node in, same
// bytes out — segment counts are a step function of authored radius, never of zoom or frame time,
// so a proxy cannot shimmer between frames or differ between machines.

import { SECTORS } from '../data/sectors.js';

export const ATLAS_PROXY_SCHEMA = 'atlas_proxy_v1';

export const PROXY_TIER = Object.freeze({
  GLB_DERIVED: 'glb-derived',
  PROCEDURAL: 'procedural',
  GLYPH: 'glyph',
});

/**
 * Triangle ceiling for ANY single map proxy.
 *
 * Derived, not picked: it sits below the smallest LOD0 in the shipped `places/` family, so a chart
 * marker can never cost more than the cheapest real object it stands for.
 * `check-atlas-integrity.mjs` re-derives that minimum from
 * `assets/ships/parts/parts_manifest.json` on every run and fails if this constant stops being
 * below it — so the number cannot quietly rot as the asset library changes.
 *
 * Lowered 512 -> 256 on 2026-08-06. The gate did exactly its job: the lane-furniture family
 * (LANE-FURNITURE-001) shipped six small ambient props and made `place_ash_pin` the new cheapest
 * shipped place at 292 triangles, which put the old 512 cap ABOVE the object it stands for. The
 * right response is to lower the cap, not to inflate a 292-triangle memorial pin: these props are
 * deliberately small because they are lane clutter seen at 20-300 units, and a family of cheap
 * bodies is the point of them. 256 restores real headroom under 292.
 */
export const MAP_PROXY_TRIANGLE_CAP = 256;

/**
 * Decimation target for a proxy derived from a gameplay GLB, as a fraction of the source LOD0.
 * A proxy is a silhouette read at chart range; an eighth of the source is generous for that and
 * still lands every shipped `places/` asset comfortably under MAP_PROXY_TRIANGLE_CAP.
 */
export const GLB_PROXY_DECIMATION = 1 / 8;

/** Standardized fallback glyphs. Deliberately geometric and monochrome — the chart tints them by
 *  faction, and a glyph that carries its own colour would fight the map's own colour language. */
export const PROXY_GLYPHS = Object.freeze({
  sector: '◇',
  station: '⬡',
  gate: '◎',
  zone: '○',
  poi: '·',
  unknown: '?',
});

/** Human-readable kind names for accessible text. */
const KIND_NOUN = Object.freeze({
  sector: 'star system',
  station: 'station',
  gate: 'jump gate',
  zone: 'region',
  poi: 'point of interest',
});

const DISCOVERY_PHRASE = Object.freeze({
  charted: 'charted',
  uncharted: 'uncharted',
  hidden: 'unsurveyed',
});

/** Ring segment count as a step function of authored radius. Deterministic by construction: a proxy
 *  must not change vertex count because the camera moved, or two frames would disagree. */
export function segmentsForRadius(radiusWU) {
  const r = Number.isFinite(radiusWU) ? Math.abs(radiusWU) : 0;
  if (r <= 0) return 0;
  if (r < 250) return 16;
  if (r < 750) return 24;
  if (r < 2000) return 32;
  return 48;
}

/**
 * Generate real parametric geometry for a procedural proxy, in the SECTOR-LOCAL draw frame with the
 * place at (0,0) — callers translate. Sector-local is the draw frame per D2.1; emitting global
 * coordinates here would invite exactly the frame mixing the Atlas exists to prevent.
 *
 * Returns closed 2-D outlines as flat [x0,z0,x1,z1,…] arrays. Outlines rather than filled meshes
 * because the chart is a surveyor's drawing, not a lit scene: an outline reads at every zoom, tints
 * cleanly, and costs a line list instead of a fan.
 *
 * @returns {{form:string, segments:number, vertices:number[], triangleCount:number, lineCount:number}}
 */
export function generateProxyGeometry(form, params = {}) {
  const radius = Number.isFinite(params.radiusWU) ? Math.abs(params.radiusWU) : 0;

  if (form === 'chord') {
    // A corridor/edge: a straight run between two points, emitted as its own two endpoints.
    const { fromX = 0, fromZ = 0, toX = 0, toZ = 0 } = params;
    return Object.freeze({
      form: 'chord',
      segments: 1,
      vertices: Object.freeze([fromX, fromZ, toX, toZ]),
      triangleCount: 0,
      lineCount: 1,
    });
  }

  const segments = segmentsForRadius(radius);
  if (!segments) {
    return Object.freeze({ form, segments: 0, vertices: Object.freeze([]), triangleCount: 0, lineCount: 0 });
  }

  const vertices = [];
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    vertices.push(round4(Math.cos(theta) * radius), round4(Math.sin(theta) * radius));
  }

  return Object.freeze({
    form,
    segments,
    vertices: Object.freeze(vertices),
    triangleCount: 0,
    lineCount: segments, // closed outline: n segments -> n line pieces
  });
}

function round4(v) {
  return Math.round(v * 10000) / 10000;
}

/**
 * Which procedural form represents a node kind, and at what radius.
 * A zone is its authored disc. A sector is its worldRadius extent. A gate is a fixed-size ring
 * because a gate has no authored radius but is a real physical aperture. A station or POI with no
 * art gets a small marker ring so it is still a shape, not a bare dot.
 */
const GATE_RING_WU = 120;
const MARKER_RING_WU = 60;

function proceduralSpecFor(node) {
  switch (node.kind) {
    case 'zone':
      return Number.isFinite(node.radiusWU) && node.radiusWU > 0
        ? { form: 'disc-outline', radiusWU: node.radiusWU }
        : null;
    case 'sector':
      return Number.isFinite(node.radiusWU) && node.radiusWU > 0
        ? { form: 'extent-outline', radiusWU: node.radiusWU }
        : null;
    case 'gate':
      return { form: 'ring', radiusWU: GATE_RING_WU };
    case 'station':
    case 'poi':
      return { form: 'marker-ring', radiusWU: MARKER_RING_WU };
    default:
      return null;
  }
}

/**
 * Authored gameplay-art association, derived from the authored anchors that already carry it.
 *
 * `archetypeGlb` (stations, gates) and `landmarkGlb` (POIs) are pre-existing fields in
 * src/data/sectorAnchors.js — this module READS them and introduces no new authoring field. That is
 * the point: the association between a place and its art already existed, and a proxy system that
 * demanded a second, parallel declaration would be a registry by another name.
 *
 * Built lazily and memoized: pure derivation, computed at most once per process.
 */
let assetByNodeId = null;

function buildAssetIndex(sectors = SECTORS) {
  const index = new Map();
  for (const sector of sectors || []) {
    if (!sector || typeof sector.id !== 'string') continue;
    for (const station of sector.stations || []) {
      if (station && station.id && station.archetypeGlb) index.set(station.id, station.archetypeGlb);
    }
    for (const poi of sector.pois || []) {
      if (poi && poi.id && (poi.landmarkGlb || poi.archetypeGlb)) {
        index.set(poi.id, poi.landmarkGlb || poi.archetypeGlb);
      }
    }
  }
  return index;
}

/** Authored gameplay-art asset id for a node, or null. Exported so the integrity gate can walk the
 *  same association the resolver uses rather than reimplementing it and drifting. */
export function authoredAssetForNode(nodeId, sectors = null) {
  if (sectors) return buildAssetIndex(sectors).get(nodeId) || null;
  if (!assetByNodeId) assetByNodeId = buildAssetIndex(SECTORS);
  return assetByNodeId.get(nodeId) || null;
}

/**
 * Accessible description. Never empty, by construction — every branch composes from `name` and
 * `kind`, both of which the atlas guarantees. This is the string a screen reader speaks and the
 * string the inspector shows when geometry is unavailable, so "no art" degrades to "fully described"
 * rather than to silence.
 */
export function describeNodeForAccessibility(node) {
  if (!node) return 'Unknown chart mark.';
  const noun = KIND_NOUN[node.kind] || 'location';
  const name = node.name || node.id;
  const parts = [`${name}, ${noun}`];

  if (node.placeType) parts.push(String(node.placeType).replace(/_/g, ' '));
  if (node.kind !== 'sector' && node.sectorId) parts.push(`in ${node.sectorId.replace(/^sector_/, '').replace(/_/g, ' ')}`);
  if (Number.isFinite(node.radiusWU) && node.radiusWU > 0) parts.push(`radius ${Math.round(node.radiusWU)} world units`);

  if (!node.hasPosition) {
    parts.push('position not surveyed — charted by association only');
  } else if (node.globalPos) {
    parts.push(`at ${Math.round(node.globalPos.x)}, ${Math.round(node.globalPos.z)} galactic`);
  }

  const tier = DISCOVERY_PHRASE[node.discoveryTier];
  if (tier) parts.push(tier);

  return `${parts.join('; ')}.`;
}

/**
 * Inspector field list — the rows a selection panel shows. Derived from what the node actually
 * carries, so a place with sparse authoring gets a short honest panel instead of a grid of "—".
 */
export function inspectorFieldsForNode(node) {
  if (!node) return Object.freeze([]);
  const rows = [
    { key: 'kind', label: 'Class', value: KIND_NOUN[node.kind] || node.kind },
  ];
  if (node.placeType) rows.push({ key: 'placeType', label: 'Type', value: String(node.placeType).replace(/_/g, ' ') });
  if (node.kind !== 'sector') rows.push({ key: 'sector', label: 'System', value: node.sectorId });
  if (node.factionId) rows.push({ key: 'faction', label: 'Authority', value: node.factionId });
  if (node.services && node.services.length) {
    rows.push({ key: 'services', label: 'Services', value: [...node.services].sort().join(', ') });
  }
  if (Number.isFinite(node.radiusWU) && node.radiusWU > 0) {
    rows.push({ key: 'radius', label: 'Extent', value: `${Math.round(node.radiusWU)} WU` });
  }
  rows.push({
    key: 'position',
    label: 'Position',
    value: node.hasPosition && node.globalPos
      ? `${Math.round(node.globalPos.x)}, ${Math.round(node.globalPos.z)}`
      : 'not surveyed',
  });
  rows.push({ key: 'discovery', label: 'Survey', value: DISCOVERY_PHRASE[node.discoveryTier] || 'unknown' });
  if (node.linkSectorId) rows.push({ key: 'link', label: 'Connects to', value: node.linkSectorId });
  return Object.freeze(rows.map((r) => Object.freeze(r)));
}

/**
 * Resolve one atlas node to its cheapest sufficient chart representation.
 *
 * @param {object} node  an AtlasNode from src/core/atlasIndex.js
 * @param {{manifest?: {parts?: object[]}}} [opts]
 *   `manifest` is the parsed assets/ships/parts/parts_manifest.json, injected rather than imported:
 *   this module is browser-reachable and must not depend on JSON import assertions or on fs. When it
 *   is absent the resolver still answers — it simply cannot confirm an asset's budget, and says so
 *   in `budget.verified` rather than pretending.
 * @returns {object} a frozen proxy descriptor; NEVER null
 */
export function resolveAtlasProxy(node, opts = {}) {
  if (!node || typeof node.id !== 'string') {
    return Object.freeze({
      schema: ATLAS_PROXY_SCHEMA,
      nodeId: null,
      tier: PROXY_TIER.GLYPH,
      glyph: PROXY_GLYPHS.unknown,
      label: 'Unknown',
      accessibleText: 'Unknown chart mark.',
      source: null,
      geometry: null,
      inspector: Object.freeze([]),
      budget: Object.freeze({ triangles: 0, verified: false, class: 'glyph' }),
      reason: 'node missing or malformed',
    });
  }

  const label = node.name || node.id;
  const accessibleText = describeNodeForAccessibility(node);
  const inspector = inspectorFieldsForNode(node);
  const glyph = PROXY_GLYPHS[node.kind] || PROXY_GLYPHS.unknown;

  const base = {
    schema: ATLAS_PROXY_SCHEMA,
    nodeId: node.id,
    glyph,
    label,
    accessibleText,
    inspector,
  };

  // Tier 3 short-circuit: an unsurveyed place has no geometry to draw honestly. Note this is checked
  // BEFORE the asset tier — a place with beautiful art but no known position is still a glyph on the
  // chart, because the chart's job is to say where things are.
  if (!node.hasPosition) {
    return Object.freeze({
      ...base,
      tier: PROXY_TIER.GLYPH,
      source: null,
      geometry: null,
      budget: Object.freeze({ triangles: 0, verified: true, class: 'glyph' }),
      reason: 'no surveyed position — represented as an uncertainty glyph',
    });
  }

  // Tier 1: the place already ships gameplay art, so a derived low-detail proxy costs no new asset.
  const assetId = authoredAssetForNode(node.id);
  if (assetId) {
    const entry = findManifestPart(opts.manifest, assetId);
    const sourceTris = entry && Number.isFinite(entry.tris) ? entry.tris : null;
    const targetTris = sourceTris === null
      ? null
      : Math.max(1, Math.min(MAP_PROXY_TRIANGLE_CAP, Math.ceil(sourceTris * GLB_PROXY_DECIMATION)));
    return Object.freeze({
      ...base,
      tier: PROXY_TIER.GLB_DERIVED,
      source: Object.freeze({
        assetId,
        file: entry && entry.file ? entry.file : `places/${assetId}.glb`,
        sourceTriangles: sourceTris,
        decimation: GLB_PROXY_DECIMATION,
      }),
      geometry: null, // built by the asset pipeline from `source`, not synthesized at runtime
      budget: Object.freeze({
        triangles: targetTris,
        verified: entry !== null,
        class: 'glb-derived',
      }),
      reason: entry
        ? `derived from shipped gameplay asset ${assetId}`
        : `authored asset ${assetId} is not listed in parts_manifest.json`,
    });
  }

  // Tier 2: parametric geometry from the numbers the author already wrote. Ordinary content lands
  // here, and lands here for free.
  const spec = proceduralSpecFor(node);
  if (spec) {
    const geometry = generateProxyGeometry(spec.form, { radiusWU: spec.radiusWU });
    if (geometry.segments > 0) {
      return Object.freeze({
        ...base,
        tier: PROXY_TIER.PROCEDURAL,
        source: null,
        geometry,
        budget: Object.freeze({
          triangles: geometry.triangleCount,
          lines: geometry.lineCount,
          verified: true,
          class: 'procedural',
        }),
        reason: `parametric ${spec.form} from authored radius ${Math.round(spec.radiusWU)} WU`,
      });
    }
  }

  // Tier 3: the floor. Always reachable, never fails.
  return Object.freeze({
    ...base,
    tier: PROXY_TIER.GLYPH,
    source: null,
    geometry: null,
    budget: Object.freeze({ triangles: 0, verified: true, class: 'glyph' }),
    reason: 'no asset and no authored extent — standardized glyph',
  });
}

/** Proxy for an atlas EDGE (corridor / gate-link): the chord between its endpoints. Paths are places
 *  too — a route ribbon needs geometry with the same budget discipline as a marker. */
export function resolveEdgeProxy(edge, atlas) {
  if (!edge || !atlas) return null;
  const a = atlas.getNode(edge.a);
  const b = atlas.getNode(edge.b);
  if (!a || !b || !a.hasPosition || !b.hasPosition) {
    return Object.freeze({
      schema: ATLAS_PROXY_SCHEMA,
      edgeId: edge && edge.id ? edge.id : null,
      tier: PROXY_TIER.GLYPH,
      geometry: null,
      accessibleText: `Connection ${edge && edge.id ? edge.id : 'unknown'} has an unsurveyed endpoint.`,
      budget: Object.freeze({ triangles: 0, verified: true, class: 'glyph' }),
      reason: 'endpoint without a surveyed position',
    });
  }
  const geometry = generateProxyGeometry('chord', {
    fromX: a.globalPos.x, fromZ: a.globalPos.z,
    toX: b.globalPos.x, toZ: b.globalPos.z,
  });
  return Object.freeze({
    schema: ATLAS_PROXY_SCHEMA,
    edgeId: edge.id,
    tier: PROXY_TIER.PROCEDURAL,
    geometry,
    accessibleText: `${a.name} to ${b.name}, ${Math.round(edge.traverse.distanceWU)} world units by `
      + `${edge.traverse.type}${edge.reciprocal ? '' : ', one way'}.`,
    budget: Object.freeze({ triangles: 0, lines: 1, verified: true, class: 'procedural' }),
    reason: `chord between ${a.id} and ${b.id}`,
  });
}

function findManifestPart(manifest, assetId) {
  if (!manifest || !Array.isArray(manifest.parts)) return null;
  return manifest.parts.find((p) => p && p.id === assetId) || null;
}
