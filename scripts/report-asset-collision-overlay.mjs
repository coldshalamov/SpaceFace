#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { modelTruthSkinPolygon } from '../src/data/modelTruth.js';
import { resolveCollisionProxyManifest, proxyScaleFor } from '../src/data/collisionProxyManifests.js';
import { SHIPS } from '../src/data/ships.js';
import { outlineDelta } from '../src/data/modelTruthMath.js';
import {
  buildAssetPhysicsInventory,
  loadAssetPhysicsSources,
} from './lib/assetPhysicsInventory.mjs';
import {
  boundsXZ,
  collisionOutsideNodeSummary,
  fitReleaseGeometry,
  fitSiblingLikeCensus,
  readReleaseGeometry,
} from './lib/assetCollisionOverlay.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET_IDS = ['ship_hawser', 'ship_warden', 'ship_pelican', 'ship_colossus',
  'ship_ironback', 'ship_ranger'];
const CONTROL_IDS = ['ship_wasp', 'ship_saucer'];
const MAIN_IDS = [...TARGET_IDS, ...CONTROL_IDS];
const LOD_IDS = ['ship_drifter', 'ship_hornet', 'ship_kestrel'];
const COLORS = { render: '#30d8df', collision: '#f3a653', lod0: '#30d8df', lod1: '#a7e36e', lod2: '#bf92ff' };
const options = parseArgs(process.argv.slice(2));
if (options.help) { showHelp(); process.exit(0); }
const outDir = path.resolve(ROOT, options.outDir || '.devshots/asset-physics/collision-overlays');
const [manifestSources, censusText, partsText, releaseText] = await Promise.all([
  loadAssetPhysicsSources(ROOT),
  readFile(path.join(ROOT, 'src/data/modelTruthCensus.json'), 'utf8'),
  readFile(path.join(ROOT, 'assets/ships/parts/parts_manifest.json'), 'utf8'),
  readFile(path.join(ROOT, 'assets/ships/release/release_manifest.json'), 'utf8'),
]);
const census = JSON.parse(censusText);
const partsDoc = JSON.parse(partsText);
const partRows = partsDoc.parts || [];
const censusById = new Map(census.rows.map(row => [row.id, row]));
const inventory = buildAssetPhysicsInventory(manifestSources);
const inventoryById = new Map(inventory.rows.map(row => [row.shipId, row]));
const shipsById = new Map(SHIPS.map(ship => [ship.id, ship]));
const selectedMain = options.ids ? options.ids : MAIN_IDS;
const selectedLod = options.ids ? options.ids.filter(id => LOD_IDS.includes(id)) : LOD_IDS;
const unknownIds = selectedMain.filter(id => !inventoryById.has(id)).concat(selectedLod.filter(id => !inventoryById.has(id)));
if (unknownIds.length) throw new Error(`Unknown inventory ship IDs: ${unknownIds.join(', ')}`);

const gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const sourceHashes = {
  modelTruthCensus: sha256Text(censusText),
  partsManifest: sha256Text(partsText),
  releaseManifest: sha256Text(releaseText),
};
const mainAssets = [];
for (const id of selectedMain) mainAssets.push(await measureShip(id));
const lodAssets = [];
for (const id of selectedLod) lodAssets.push(await measureLodFamily(id));

await mkdir(outDir, { recursive: true });
const mainSvgPath = path.join(outDir, 'ship-collision-overlays.svg');
const lodSvgPath = path.join(outDir, 'lod-outline-overlays.svg');
const jsonPath = path.join(outDir, 'asset-collision-overlay-report.json');
const report = {
  schema: 'spaceface.assetCollisionOverlay.v1',
  generatedAt: new Date().toISOString(),
  provenance: {
    repoHead: gitHead,
    sourceIdentityScope: 'Current source/release manifests and GLB files; source and release SHA-256 are recorded per variant.',
    modelTruthCensus: sourceHashes.modelTruthCensus,
    partsManifest: sourceHashes.partsManifest,
    releaseManifest: sourceHashes.releaseManifest,
    modifiedRenderOrCollisionAssets: false,
    gpuUsed: false,
  },
  method: {
    topDownPlane: 'Local XZ at yaw 0; +X forward, +Z starboard; entity origin is the shared coordinate origin.',
    renderOverlay: 'Projected convex envelope of every visible render POSITION vertex in the runtime release GLB after node transforms, the model-truth drawScale/drawOffset, and collision-helper exclusion. It is an envelope, not a rasterized camera silhouette; hidden/occluded mesh vertices may extend it.',
    collisionOverlay: 'The canonical resolved dynamic ship proxy polygon (compactHull or planarPolygon, falling back only to the canonical measured skin polygon) scaled by proxyScaleFor; unsupported shapes are marked unknown, never drawn as render contours.',
    lodOverlay: 'Release GLB triangles are intersected with the census gameplay-plane slice and sampled along 24 radial rays. A vertex-only census-style outline is also recorded for comparison. Each sibling is independently fit to the same entity radius.',
    limitations: ['This top-down footprint is not ordinary-camera visual acceptance.', 'Off-plane decorations are projected into the render envelope but do not imply that they must be collision solids.', 'A width mismatch alone does not distinguish a missing hull appendage from an intentionally forgiving proxy.'],
  },
  manifestJoinFindings: [],
  mainAssets,
  lodAssets,
};
const partFiles = new Set(partRows.flatMap(row => [row.file, ...Object.values(row.lodFamily || {})]
  .map(normalizePartPath)));
const familyByFile = new Map();
for (const row of partRows) {
  for (const [level, file] of Object.entries(row.lodFamily || {})) {
    familyByFile.set(normalizePartPath(file), { id: row.id, level });
  }
}
const releaseSources = new Set((JSON.parse(releaseText).assets || []).map(row => normalizePath(row.source)));
for (const asset of lodAssets) {
  for (const variant of asset.variants.filter(row => row.available)) {
    const sourcePath = normalizePath(variant.sourcePath);
    if (!partFiles.has(normalizePartPath(sourcePath))) {
      report.manifestJoinFindings.push({
        shipId: asset.shipId,
        level: variant.level,
        sourcePath,
        partsManifestFamilyRow: familyByFile.get(normalizePartPath(sourcePath)) || null,
        partsManifestEntry: false,
        releaseManifestEntry: releaseSources.has(sourcePath),
        finding: releaseSources.has(sourcePath)
          ? 'Source/release GLB identity resolves, but no parts_manifest row or LOD-family reference covers this source.'
          : 'Neither the parts nor release manifest has this source path.',
      });
    }
  }
}
const mainSvg = renderMainSvg(mainAssets, report);
const lodSvg = renderLodSvg(lodAssets, report);
await Promise.all([
  writeFile(mainSvgPath, mainSvg, 'utf8'),
  writeFile(lodSvgPath, lodSvg, 'utf8'),
  writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
]);
console.log(JSON.stringify({
  output: path.relative(ROOT, outDir).replaceAll('\\', '/'),
  mainSvg: path.relative(ROOT, mainSvgPath).replaceAll('\\', '/'),
  lodSvg: path.relative(ROOT, lodSvgPath).replaceAll('\\', '/'),
  json: path.relative(ROOT, jsonPath).replaceAll('\\', '/'),
  main: mainAssets.map(asset => ({ shipId: asset.shipId, xDeltaWu: asset.widthDeltaWu.x, zDeltaWu: asset.widthDeltaWu.z,
    sourceShaMatches: asset.sourceIdentity.sourceShaMatches, releaseShaMatches: asset.sourceIdentity.releaseShaMatches })),
  lod: lodAssets.map(asset => ({ shipId: asset.shipId, triangleSurfaceDeltaWu: asset.triangleSurfaceOutlineDeltaWu,
    vertexSampledDeltaWu: asset.vertexSampledOutlineDeltaWu, censusDeltaWu: asset.censusOutlineDeltaWu,
    triangleSurfaceOverTolerance: asset.overTolerance, censusOverTolerance: asset.censusOverTolerance })),
}, null, 2));

async function measureShip(shipId) {
  const inventoryRow = inventoryById.get(shipId);
  const truth = censusById.get(shipId);
  const ship = shipsById.get(shipId);
  if (!truth || !ship) throw new Error(`${shipId}: model-truth row or ship definition is missing`);
  const selected = inventoryRow.renderSelection?.wholeShip;
  const lod0 = selected?.lodFamily?.lod0 || selected?.assetIdentity;
  if (!lod0?.sourcePath || !lod0?.releasePath || !lod0.sourceSha256 || !lod0.releaseSha256) {
    throw new Error(`${shipId}: source/release LOD0 identity is incomplete`);
  }
  const entityRadius = Number(ship.collisionRadius) || 1;
  const entity = { type: 'ship', radius: entityRadius, data: { defId: ship.id } };
  const proxy = resolveCollisionProxyManifest(entity);
  const proxyOutline = proxy?.compactHull || proxy?.planarPolygon
    || (proxy?.sourceRow ? modelTruthSkinPolygon(proxy.sourceRow) : null);
  const proxyScale = proxy ? proxyScaleFor(entity, proxy) : null;
  const collision = Array.isArray(proxyOutline) && proxyOutline.length >= 3
    ? proxyOutline.map(point => ({ x: point.x * proxyScale, z: point.z * proxyScale }))
    : null;
  const geometry = await readReleaseGeometry(ROOT, lod0.releasePath);
  const sourceHash = await hashFile(lod0.sourcePath);
  const sourceShaMatches = sourceHash === lod0.sourceSha256;
  const releaseShaMatches = geometry.sha256 === lod0.releaseSha256;
  if (!sourceShaMatches || !releaseShaMatches) throw new Error(`${shipId}: GLB hash does not match manifest identity`);
  const fit = { scale: truth.drawScale, offset: truth.drawOffset || [0, 0, 0] };
  if (!(Number.isFinite(fit.scale) && fit.scale > 0)) throw new Error(`${shipId}: missing model-truth draw scale`);
  const render = fitReleaseGeometry(geometry, fit.scale, fit.offset);
  const renderBounds = boundsXZ(render.projectedHull);
  const collisionBounds = boundsXZ(collision);
  const widthDelta = collisionBounds && renderBounds ? {
    x: collisionBounds.widthX - renderBounds.widthX,
    z: collisionBounds.widthZ - renderBounds.widthZ,
    relativeX: (collisionBounds.widthX - renderBounds.widthX) / Math.max(1e-9, renderBounds.widthX),
    relativeZ: (collisionBounds.widthZ - renderBounds.widthZ) / Math.max(1e-9, renderBounds.widthZ),
  } : null;
  const outside = collisionOutsideNodeSummary(render.nodes, collision);
  const lodFamily = selected.lodFamily || { lod0 };
  return {
    shipId,
    label: inventoryRow.label,
    role: inventoryRow.usage,
    classification: CONTROL_IDS.includes(shipId) ? 'comparison-control' : 'comparison-target',
    render: {
      sourcePath: lod0.sourcePath, releasePath: lod0.releasePath,
      expectedSourceSha256: lod0.sourceSha256, expectedReleaseSha256: lod0.releaseSha256,
      actualSourceSha256: sourceHash, actualReleaseSha256: geometry.sha256,
      sourceShaMatches, releaseShaMatches, vertexCount: geometry.points.length,
      visibleNodeCount: geometry.nodes.length, fitting: fit,
      convexEnvelope: render.projectedHull, boundsWu: renderBounds,
      censusBoundsWu: { widthX: truth.worldSize?.[0] ?? null, widthZ: truth.worldSize?.[2] ?? null },
      censusRadialContourMaxDeltaWu: Array.isArray(truth.collider?.outline)
        ? outlineDelta(render.radial.radii, truth.collider.outline) : null,
    },
    collision: collision ? {
      source: proxy.compactHull ? 'resolved measured compactHull' : proxy.planarPolygon ? 'resolved measured planarPolygon' : 'model-truth measured skin polygon',
      proxyId: proxy.id || null, sourceModelTruthId: proxy.sourceRow?.id || truth.id,
      scaleWu: proxyScale, polygon: collision, boundsWu: collisionBounds,
    } : { available: false, reason: 'No canonical planar polygon is exposed; collision outline is unknown and omitted from SVG.' },
    widthDeltaWu: widthDelta,
    renderVerticesOutsideProxyByNode: outside,
    sourceIdentity: {
      sourcePath: lod0.sourcePath, releasePath: lod0.releasePath,
      sourceSha256: lod0.sourceSha256, releaseSha256: lod0.releaseSha256,
      assetId: selected.assetId || selected.assetIdentity?.partId || null,
      runtimePackage: selected.runtimePackage || null,
    },
    figure: { file: 'ship-collision-overlays.svg', coordinates: 'same XZ local frame and fit for visible render and native proxy' },
  };
}

async function measureLodFamily(shipId) {
  const inventoryRow = inventoryById.get(shipId);
  const truth = censusById.get(shipId);
  const ship = shipsById.get(shipId);
  const family = inventoryRow.renderSelection?.wholeShip?.lodFamily;
  if (!family || !truth || !ship) throw new Error(`${shipId}: census row or release LOD family is missing`);
  const entityRadius = Number(ship.collisionRadius) || 1;
  const variants = [];
  for (const level of ['lod0', 'lod1', 'lod2']) {
    const identity = family[level];
    if (!identity?.releasePath || !identity?.sourcePath || !identity?.releaseSha256 || !identity?.sourceSha256) {
      variants.push({ level, available: false, reason: 'No bound source/release identity for this LOD.' });
      continue;
    }
    const geometry = await readReleaseGeometry(ROOT, identity.releasePath);
    const sourceHash = await hashFile(identity.sourcePath);
    if (geometry.sha256 !== identity.releaseSha256 || sourceHash !== identity.sourceSha256) {
      throw new Error(`${shipId} ${level}: GLB hash does not match manifest identity`);
    }
    const fitted = fitSiblingLikeCensus(geometry, entityRadius);
    variants.push({
      level, available: true,
      sourcePath: identity.sourcePath, releasePath: identity.releasePath,
      sourceSha256: identity.sourceSha256, releaseSha256: identity.releaseSha256,
      actualSourceSha256: sourceHash, actualReleaseSha256: geometry.sha256,
      vertexCount: geometry.points.length,
      fitting: fitted.fit,
      radialRadiiWu: fitted.surfaceRadial.radii,
      radialContour: fitted.surfaceRadial.contour,
      vertexSampledRadiiWu: fitted.radial.radii,
      sliceY: fitted.surfaceRadial.sliceY,
      sliceSegmentCount: fitted.surfaceRadial.segmentCount,
      radialBoundsWu: boundsXZ(fitted.surfaceRadial.contour),
      deltaFromLod0Wu: null,
      vertexSampledDeltaFromLod0Wu: null,
      projectedEnvelope: fitted.projectedHull,
    });
  }
  const lod0 = variants.find(row => row.level === 'lod0' && row.available);
  if (!lod0) throw new Error(`${shipId}: LOD0 geometry unavailable`);
  for (const variant of variants) {
    if (variant.available) {
      variant.deltaFromLod0Wu = outlineDelta(variant.radialRadiiWu, lod0.radialRadiiWu);
      variant.vertexSampledDeltaFromLod0Wu = outlineDelta(variant.vertexSampledRadiiWu, lod0.vertexSampledRadiiWu);
    }
  }
  const triangleSurfaceOutlineDeltaWu = Object.fromEntries(variants.filter(row => row.available)
    .map(row => [row.level, row.deltaFromLod0Wu]));
  const vertexSampledOutlineDeltaWu = Object.fromEntries(variants.filter(row => row.available)
    .map(row => [row.level, row.vertexSampledDeltaFromLod0Wu]));
  const maxTriangleDeltaWu = Math.max(...variants.filter(row => row.available).map(row => row.deltaFromLod0Wu));
  const toleranceWu = truth.lod?.toleranceWu ?? null;
  const collisionEntity = { type: 'ship', radius: entityRadius, data: { defId: shipId } };
  const proxy = resolveCollisionProxyManifest(collisionEntity);
  const outline = proxy?.compactHull || proxy?.planarPolygon
    || (proxy?.sourceRow ? modelTruthSkinPolygon(proxy.sourceRow) : null);
  const scaleWu = proxy ? proxyScaleFor(collisionEntity, proxy) : null;
  const collision = Array.isArray(outline) && outline.length >= 3
    ? outline.map(point => ({ x: point.x * scaleWu, z: point.z * scaleWu })) : null;
  return {
    shipId, label: inventoryRow.label,
    classification: 'census-flagged-lod-comparison',
    partsManifestFamilyRow: (() => {
      const row = partRows.find(candidate => candidate.id === `wholeship_${shipId}_production_v1`)
        || partRows.find(candidate => Object.values(candidate.lodFamily || {})
          .some(file => normalizePartPath(file).startsWith(`wholeships/${shipId.replace('ship_', '')}`)));
      return row ? { id: row.id, file: row.file, lodFamily: row.lodFamily || null } : null;
    })(),
    censusOutlineDeltaWu: truth.lod?.outlineDeltaWu || {},
    censusOverTolerance: truth.lod?.overTolerance === true,
    censusToleranceWu: toleranceWu,
    triangleSurfaceOutlineDeltaWu,
    vertexSampledOutlineDeltaWu,
    maxTriangleDeltaWu,
    overTolerance: toleranceWu != null && maxTriangleDeltaWu > toleranceWu,
    variants,
    collision: collision ? { proxyId: proxy.id || null, polygon: collision, source: 'same canonical ship proxy used in top-down comparison figure' }
      : { available: false, reason: 'No canonical planar proxy polygon; omitted from LOD SVG.' },
    figure: { file: 'lod-outline-overlays.svg', fitting: 'LOD comparison duplicates the model-truth census per-file target-length fit.' },
  };
}

function renderMainSvg(assets, report) {
  const cols = 4, cellW = 390, cellH = 420, rows = Math.ceil(assets.length / cols);
  const width = cols * cellW, height = rows * cellH + 40;
  const panels = assets.map((asset, index) => {
    const x = (index % cols) * cellW, y = Math.floor(index / cols) * cellH + 38;
    const collision = asset.collision.available === false ? [] : asset.collision.polygon;
    const render = asset.render.convexEnvelope;
    const title = `${asset.label} (${asset.shipId}) · ${asset.classification === 'comparison-control' ? 'control' : 'target'}`;
    const delta = asset.widthDeltaWu ? `collision − render envelope: X ${signed(asset.widthDeltaWu.x)} WU, Z ${signed(asset.widthDeltaWu.z)} WU` : 'collision projection unavailable';
    const hashInfo = `${asset.sourceIdentity.sourcePath} → ${asset.sourceIdentity.releasePath}\nsource SHA-256 ${asset.sourceIdentity.sourceSha256}\nrelease SHA-256 ${asset.sourceIdentity.releaseSha256}`;
    return panelSvg({ x, y, width: cellW, height: cellH, title, caption: delta,
      renderShapes: [{ points: render, color: COLORS.render, fill: true, label: 'render vertex envelope' }],
      collisionShapes: collision.length ? [{ points: collision, color: COLORS.collision, fill: true, label: 'collision proxy' }] : [],
      accessible: hashInfo,
    });
  }).join('');
  return svgDocument(width, height, 'Top-down ship render and collision footprints',
    'Cyan: convex envelope of projected visible release-GLB vertices. Orange: canonical physics proxy. Both use the entity-local XZ frame and same world-unit origin/scale. This is not camera-view or gameplay acceptance.',
    `${panels}<text x="18" y="${height - 12}" class="note">X forward → · Z starboard ↑ · Render outline is a projected vertex envelope (occlusion not resolved). Values and hashes are bound in the companion JSON and each panel description.</text>`, report.provenance);
}

function renderLodSvg(assets, report) {
  const cols = 3, cellW = 520, cellH = 470, rows = Math.ceil(assets.length / cols);
  const width = cols * cellW, height = rows * cellH + 40;
  const panels = assets.map((asset, index) => {
    const x = (index % cols) * cellW, y = Math.floor(index / cols) * cellH + 38;
    const colors = { lod0: COLORS.lod0, lod1: COLORS.lod1, lod2: COLORS.lod2 };
    const shapes = asset.variants.filter(row => row.available).map(row => ({
      points: row.radialContour, color: colors[row.level], fill: false,
      label: `${row.level} · triangle Δ ${row.deltaFromLod0Wu.toFixed(3)} WU`,
    }));
    if (asset.collision.available !== false) shapes.push({ points: asset.collision.polygon, color: COLORS.collision, fill: false, label: 'collision proxy' });
    const values = asset.variants.filter(row => row.available).map(row =>
      `${row.level}: ${row.sourcePath} → ${row.releasePath}\nsource SHA-256 ${row.sourceSha256}\nrelease SHA-256 ${row.releaseSha256}`).join('\n');
    const title = `${asset.label} (${asset.shipId}) · LOD triangle contours${asset.overTolerance ? ' · over triangle tolerance' : ''}`;
    const caption = `triangle max Δ ${Number(asset.maxTriangleDeltaWu).toFixed(3)} WU · vertex sample ${formatDeltaMap(asset.vertexSampledOutlineDeltaWu)} WU · census ${formatDeltaMap(asset.censusOutlineDeltaWu)} WU · tolerance ${asset.censusToleranceWu ?? 'unknown'} WU`;
    return panelSvg({ x, y, width: cellW, height: cellH, title, caption,
      renderShapes: shapes, collisionShapes: [], accessible: values,
    });
  }).join('');
  return svgDocument(width, height, 'LOD outline variants and collision proxy',
    'Colored lines are radial outlines from actual triangle intersections with the model-truth gameplay-plane slice and per-file target-length fitting. Companion JSON also records vertex-only deltas used by the census. Orange: canonical collision proxy. A triangle-surface delta over tolerance is a review signal, not proof of visible popping.',
    `${panels}<text x="18" y="${height - 12}" class="note">Each variant uses the same entity origin and fixed world-unit target length; exact file hashes and census values are in the companion JSON and panel descriptions.</text>`, report.provenance);
}

function panelSvg({ x, y, width, height, title, caption, renderShapes, collisionShapes, accessible }) {
  const pad = 42, plot = { x: x + 16, y: y + 58, width: width - 32, height: height - 102 };
  const all = [...renderShapes, ...collisionShapes].flatMap(shape => shape.points || []);
  const bounds = boundsXZ(all) || { minX: -1, maxX: 1, minZ: -1, maxZ: 1, widthX: 2, widthZ: 2 };
  const spanX = Math.max(bounds.widthX, 1), spanZ = Math.max(bounds.widthZ, 1);
  const margin = Math.max(spanX, spanZ) * 0.08;
  const minX = bounds.minX - margin, maxX = bounds.maxX + margin;
  const minZ = bounds.minZ - margin, maxZ = bounds.maxZ + margin;
  const scale = Math.min(plot.width / Math.max(maxX - minX, 1), plot.height / Math.max(maxZ - minZ, 1));
  const drawW = (maxX - minX) * scale, drawH = (maxZ - minZ) * scale;
  const ox = plot.x + (plot.width - drawW) / 2 - minX * scale;
  const oy = plot.y + (plot.height - drawH) / 2 + maxZ * scale;
  const point = p => `${fmt(ox + p.x * scale)},${fmt(oy - p.z * scale)}`;
  const polygons = [...renderShapes, ...collisionShapes].map(shape => {
    const points = shape.points || [];
    if (points.length < 3) return '';
    return `<polygon points="${points.map(point).join(' ')}" fill="${shape.fill ? shape.color : 'none'}" fill-opacity="${shape.fill ? '0.13' : '0'}" stroke="${shape.color}" stroke-width="2.2" stroke-linejoin="round"><title>${xml(shape.label)}</title></polygon>`;
  }).join('');
  const legendItems = [...renderShapes, ...collisionShapes];
  const legend = legendItems.map((shape, i) => `<g transform="translate(${x + 18 + i * (width / Math.max(legendItems.length, 1))},${y + height - 25})"><line x1="0" y1="0" x2="17" y2="0" stroke="${shape.color}" stroke-width="3"/><text x="23" y="4" class="legend">${xml(shape.label)}</text></g>`).join('');
  const origin = point({ x: 0, z: 0 });
  const barWu = Math.max(1, Math.pow(10, Math.floor(Math.log10(Math.max(spanX, spanZ) / 4))));
  const barPx = barWu * scale;
  const barX = plot.x + 12, barY = plot.y + plot.height - 10;
  const axes = `<path d="M${origin} l16 0 m-5 -4 l5 4 -5 4 M${origin} l0 -16 m-4 5 l4 -5 4 5" fill="none" stroke="#8797a8" stroke-width="1"/><text x="${fmt(ox + 18)}" y="${fmt(oy + 12)}" class="axis">+X forward</text><text x="${fmt(ox - 34)}" y="${fmt(oy - 22)}" class="axis">+Z</text><path d="M${fmt(barX)} ${fmt(barY)} h${fmt(barPx)} m0 -4 v8 m-${fmt(barPx)} -8 v8" fill="none" stroke="#b7c5d5" stroke-width="1.2"/><text x="${fmt(barX)}" y="${fmt(barY - 5)}" class="axis">${barWu} WU</text>`;
  return `<g><title>${xml(title)}</title><desc>${xml(accessible)}</desc><rect x="${x + 6}" y="${y + 6}" width="${width - 12}" height="${height - 12}" rx="8" class="panel"/><text x="${x + 18}" y="${y + 28}" class="title">${xml(title)}</text><text x="${x + 18}" y="${y + 46}" class="caption">${xml(caption)}</text><g>${polygons}${axes}</g>${legend}</g>`;
}

function svgDocument(width, height, title, description, content, provenance) {
  const metadata = xml(JSON.stringify({ title, description, provenance }));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" role="img" aria-labelledby="title desc" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><title id="title">${xml(title)}</title><desc id="desc">${xml(description)}</desc><metadata>${metadata}</metadata><style>.panel{fill:#111a25;stroke:#394a5d}.title{fill:#f5f7fa;font:600 15px system-ui,sans-serif}.caption{fill:#c5d0dd;font:12px system-ui,sans-serif}.legend{fill:#d5dde7;font:11px system-ui,sans-serif}.axis{fill:#9baabd;font:10px system-ui,sans-serif}.note{fill:#c5d0dd;font:12px system-ui,sans-serif}</style>${content}</svg>\n`;
}

async function hashFile(file) {
  return createHash('sha256').update(await readFile(path.resolve(ROOT, file))).digest('hex');
}
function sha256Text(text) { return createHash('sha256').update(text).digest('hex'); }
function normalizePath(value) { return String(value || '').replaceAll('\\', '/').replace(/^\.\//, ''); }
function normalizePartPath(value) { return normalizePath(value).replace(/^assets\/ships\/parts\//, ''); }
function signed(value) { return `${value >= 0 ? '+' : ''}${value.toFixed(3)}`; }
function fmt(value) { return Number(value).toFixed(2); }
function xml(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;'); }
function formatDeltaMap(value) { return Object.entries(value || {}).map(([key, delta]) => `${key} ${Number(delta).toFixed(3)}`).join(' · ') || 'no sibling delta'; }
function parseArgs(args) {
  const options = { outDir: null, ids: null, help: false };
  for (const arg of args) {
    if (arg === '--help' || arg === '-h') { options.help = true; continue; }
    const [key, value] = arg.split('=', 2);
    if (key === '--out-dir' && value) options.outDir = value;
    else if (key === '--ids' && value) options.ids = [...new Set(value.split(',').map(item => item.trim()).filter(Boolean))];
    else throw new Error(`Unknown or incomplete argument: ${arg}`);
  }
  return options;
}
function showHelp() {
  console.log('Usage: node scripts/report-asset-collision-overlay.mjs [--out-dir=PATH] [--ids=ship_id,...]');
  console.log(`Default set: ${MAIN_IDS.join(', ')}; LOD family set: ${LOD_IDS.join(', ')}`);
}
