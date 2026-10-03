// Opt-in measurement of existing world-site bodies, never a replacement collider.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import { worldSiteAssetBinding } from '../../src/data/worldSiteAssetBindings.js';
import { ceresShipbreakCollisionAuthority } from '../../src/data/ceresShipbreakCollision.js';
import { computeRenderPackageContentHash, computeRenderPackageRuntimeHash } from '../../src/contracts/renderPackage.js';
import { isAuthoredNonRenderHelper } from './modelTruthAuthoredCompound.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const TOLERANCE = .05;
export function authoredWorldSiteMeasurement(row) {
  const canonical = ceresShipbreakCollisionAuthority(row.id);
  if (!canonical) {
    if (row.colliderKind === 'world-site-bodies' || row.collisionAuthority) throw new Error(`${row.id}: wrong world-site collision owner`);
    return null;
  }
  if (row.fit !== 'authored-place-origin' || row.placeScale !== canonical.scale
    || row.colliderKind !== 'world-site-bodies' || !same(row.collisionAuthority, canonical)) {
    throw new Error(`${row.id}: missing or wrong world-site collision owner/origin/state`);
  }
  return { fit: { scale: canonical.scale, offset: canonical.origin }, authority: canonical,
    collider: { kind: 'world-site-bodies', id: null,
      primitives: canonical.bodies.flatMap(body => body.primitives.map(p => ({ ...p, ownerWorldRecordId: body.worldRecordId }))) } };
}
export function verifyWorldSiteCertificate(certificate, measurement, sourceSha256, assetIdentity) {
  const a = measurement.authority;
  if (certificate?.schema !== 'spaceface.ceresSecondMeasure.v1' || certificate.sourceSha256 !== sourceSha256
    || certificate.sourceScale !== a.scale || certificate.part !== a.certificatePart
    || !certificate.states?.includes(a.referenceState) || assetIdentity?.partId !== a.placeId) {
    throw new Error(`${a.placeId}: missing or wrong hash-bound world-site certificate`);
  }
  const boxes = certificate.collision?.boxes, primitives = measurement.collider.primitives;
  const key = p => JSON.stringify([p.x, p.z, p.hx, p.hz]);
  if (!Array.isArray(boxes) || boxes.length !== primitives.length
    || !same(boxes.map(b => key({ x: b.centerWU?.[0], z: b.centerWU?.[2], hx: b.sizeWU?.[0] / 2, hz: b.sizeWU?.[2] / 2 })).sort(), primitives.map(key).sort())) {
    throw new Error(`${a.placeId}: native XZ bodies disagree with hash-bound source boxes`);
  }
  const passages = [...(certificate.collision.passages || []), ...(certificate.collision.clearExitRaysWU || [])];
  if (a.certificatePart === 'shell' && (!certificate.collision.neverUseConvexHull || passages.length !== 5)) {
    throw new Error(`${a.placeId}: missing authored passages/exit rays`);
  }
  for (const hole of passages) for (const p of primitives) {
    if (p.x + p.hx > hole.x[0] + 1e-5 && p.x - p.hx < hole.x[1] - 1e-5
      && p.z + p.hz > hole.z[0] + 1e-5 && p.z - p.hz < hole.z[1] - 1e-5) {
      throw new Error(`${a.placeId}: native body fills an authored passage`);
    }
  }
  return passages;
}
const area = poly => Math.abs(poly.reduce((sum, p, i) => {
  const q = poly[(i + 1) % poly.length]; return sum + p[0] * q[1] - q[0] * p[1];
}, 0)) / 2;
function clip(poly, axis, edge, sign) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const dp = sign * (p[axis] - edge), dq = sign * (q[axis] - edge);
    if (dp >= 0) out.push(p);
    if ((dp < 0) !== (dq < 0)) {
      const t = dp / (dp - dq); out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }
  }
  return out;
}
function subtractBox(poly, p, tolerance) {
  let inside = poly;
  const outside = [];
  for (const [axis, edge, sign] of [[0, p.x - p.hx - tolerance, 1], [0, p.x + p.hx + tolerance, -1],
    [1, p.z - p.hz - tolerance, 1], [1, p.z + p.hz + tolerance, -1]]) {
    if (!inside.length) break;
    const part = clip(inside, axis, edge, -sign);
    if (part.length >= 3 && area(part) > 1e-9) outside.push(part);
    inside = clip(inside, axis, edge, sign);
  }
  return outside;
}
// Subtract the rectangle UNION from every projected triangle. A face may bridge
// disconnected solids even when all three vertices are inside native collision.
export function triangleOutsideNativeArea(triangle, primitives, tolerance = TOLERANCE) {
  let remaining = [triangle.map(p => [p.x, p.z])];
  for (const p of primitives) remaining = remaining.flatMap(poly => subtractBox(poly, p, tolerance));
  return remaining.reduce((sum, poly) => sum + area(poly), 0);
}
export function triangleHitsClearVolume(triangle, hole) {
  const tri = triangle.map(p => [p.x, p.z]);
  const rect = [[hole.x[0], hole.z[0]], [hole.x[1], hole.z[0]], [hole.x[1], hole.z[1]], [hole.x[0], hole.z[1]]];
  const axes = [[1, 0], [0, 1]];
  for (let i = 0; i < 3; i++) {
    const p = tri[i], q = tri[(i + 1) % 3]; axes.push([q[1] - p[1], p[0] - q[0]]);
  }
  for (const axis of axes) {
    if (Math.hypot(...axis) < 1e-8) continue;
    const project = p => p[0] * axis[0] + p[1] * axis[1];
    const a = tri.map(project), b = rect.map(project);
    if (Math.max(...a) <= Math.min(...b) + 1e-5 || Math.max(...b) <= Math.min(...a) + 1e-5) return false;
  }
  return true;
}
// Also cover projected lines/vertical faces: area alone would miss them.
export function triangleEdgesCovered(triangle, primitives, tolerance = TOLERANCE) {
  for (let i = 0; i < 3; i++) {
    const a = triangle[i], b = triangle[(i + 1) % 3], intervals = [];
    for (const p of primitives) {
      let low = 0, high = 1;
      for (const [axis, half] of [['x', 'hx'], ['z', 'hz']]) {
        const delta = b[axis] - a[axis], min = p[axis] - p[half] - tolerance, max = p[axis] + p[half] + tolerance;
        if (Math.abs(delta) < 1e-12) { if (a[axis] < min || a[axis] > max) high = -1; }
        else { const t0 = (min - a[axis]) / delta, t1 = (max - a[axis]) / delta;
          low = Math.max(low, Math.min(t0, t1)); high = Math.min(high, Math.max(t0, t1)); }
      }
      if (low <= high) intervals.push([low, high]);
    }
    intervals.sort((a,b) => a[0] - b[0]);
    let covered = 0;
    for (const [low, high] of intervals) { if (low > covered + 1e-9) break; covered = Math.max(covered, high); }
    if (covered < 1 - 1e-9) return false;
  }
  return true;
}
function convexHull(points) {
  const sorted = [...new Map(points.map(p => [p.join(','), p])).values()].sort((a,b) => a[0]-b[0] || a[1]-b[1]);
  const cross = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const half = ps => { const h=[]; for(const p of ps){ while(h.length>1 && cross(h.at(-2),h.at(-1),p)<=0)h.pop(); h.push(p); } return h; };
  const lower=half(sorted),upper=half(sorted.toReversed());lower.pop();upper.pop();return lower.concat(upper);
}
function insideHull(x, z, hull) {
  if(hull.length<3)return false;
  return hull.every((p,i) => {const q=hull[(i+1)%hull.length];return (q[0]-p[0])*(z-p[1])-(q[1]-p[1])*(x-p[0])>=-1e-7;});
}
function pointInTriangle(x, z, tri) {
  let positive = false, negative = false;
  for (let i = 0; i < 3; i++) {
    const p = tri[i], q = tri[(i + 1) % 3];
    const cross = (q.x - p.x) * (z - p.z) - (q.z - p.z) * (x - p.x);
    positive ||= cross > 1e-8; negative ||= cross < -1e-8;
  }
  return !(positive && negative);
}
export function measureWorldSiteTriangles(triangles, measurement, passages) {
  const primitives = measurement.collider.primitives;
  let maxVertexDistanceWu = 0, outsideTriangles = 0, clearVolumeIntersections = 0, maxOutsideTriangleAreaWu2 = 0;
  const levels = new Map();
  for (const { points: tri, lod = 0 } of triangles) {
    let level = levels.get(lod);
    if (!level) { level = { triangles: 0, covered: new Set(), bodyPoints: primitives.map(() => []) }; levels.set(lod, level); }
    level.triangles++;
    for (const v of tri) {
      const d = Math.min(...primitives.map(p => Math.hypot(Math.max(0, Math.abs(v.x - p.x) - p.hx), Math.max(0, Math.abs(v.z - p.z) - p.hz))));
      maxVertexDistanceWu = Math.max(maxVertexDistanceWu, d);
    }
    const outside = triangleOutsideNativeArea(tri, primitives);
    maxOutsideTriangleAreaWu2 = Math.max(maxOutsideTriangleAreaWu2, outside);
    if (outside > 1e-6 || !triangleEdgesCovered(tri, primitives)) outsideTriangles++;
    if (passages.some(hole => triangleHitsClearVolume(tri, hole))) clearVolumeIntersections++;
    for (let i = 0; i < primitives.length; i++) {
      const p = primitives[i]; let poly = tri.map(v => [v.x, v.z]);
      for (const [axis, edge, sign] of [[0,p.x-p.hx,1],[0,p.x+p.hx,-1],[1,p.z-p.hz,1],[1,p.z+p.hz,-1]]) poly=clip(poly,axis,edge,sign);
      level.bodyPoints[i].push(...poly);
    }
    // Reverse projection is a separate diagnostic, not a filled 3D volume claim.
    if (area(tri.map(p => [p.x, p.z])) > 1e-8) {
      for (let x = Math.ceil(Math.min(...tri.map(p => p.x)) - .5); x + .5 <= Math.max(...tri.map(p => p.x)); x++) {
        for (let z = Math.ceil(Math.min(...tri.map(p => p.z)) - .5); z + .5 <= Math.max(...tri.map(p => p.z)); z++) {
          if (pointInTriangle(x + .5, z + .5, tri)) level.covered.add(`${x},${z}`);
        }
      }
    }
  }
  const nativeSamples = new Set();
  for (const p of primitives) for (let x = Math.ceil(p.x - p.hx - .5); x + .5 <= p.x + p.hx; x++) {
    for (let z = Math.ceil(p.z - p.hz - .5); z + .5 <= p.z + p.hz; z++) nativeSamples.add(`${x},${z}`);
  }
  const reverseProjectionSamples = [...levels].sort((a,b) => a[0] - b[0]).map(([lod, level]) => {
    const hulls = level.bodyPoints.map(convexHull);
    const uncovered = [...nativeSamples].filter(p => !level.covered.has(p));
    const exterior = uncovered.filter(key => { const [x,z]=key.split(',').map(Number);
      return !hulls.some(hull => insideHull(x+.5,z+.5,hull)); }).length;
    return { lod, triangles: level.triangles, nativeSamples: nativeSamples.size,
      uncoveredSamples: uncovered.length, uncoveredOutsidePerBodyProjectedHull: exterior,
      uncoveredWithinPerBodyProjectedHull: uncovered.length-exterior };
  });
  return { coverageWu: maxVertexDistanceWu, gapWu: maxVertexDistanceWu, stickWu: null, toleranceWu: TOLERANCE,
    overTolerance: maxVertexDistanceWu > TOLERANCE || outsideTriangles > 0 || clearVolumeIntersections > 0,
    coverageMetric: 'all visible triangle vertices to native XZ body union; one-way distance only',
    triangleMetric: 'every visible projected triangle area and edges vs native box union expanded by 0.05 WU per axis',
    outsideTriangles, maxOutsideTriangleAreaWu2, clearVolumeIntersections,
    reverseMetric: '1 WU grid cell centers in native XZ union vs each LOD full-Y triangle projection; outside per-body projected convex hull is exterior; within may be enclosed hollow or open topology; diagnostic only, not volumetric or bidirectional surface equivalence',
    reverseProjectionSamples,
  };
}
export function verifyWorldSiteBindingProvenance(binding, row, source, released) {
  if (!binding || binding.partId !== row.id || binding.assetId !== `SF_${row.id.toUpperCase()}`
    || binding.source?.path !== `assets/ships/parts/${row.file}`
    || binding.release?.path !== `assets/ships/release/parts/${row.file}`
    || binding.source.sha256 !== hash(source) || binding.source.bytes !== source.length
    || binding.release.sha256 !== hash(released) || binding.release.bytes !== released.length) {
    throw new Error(`${row.id}: stale or wrong world-site source/release binding provenance`);
  }
}
export async function measureWorldSiteAssetChain(root, row, measurement = authoredWorldSiteMeasurement(row)) {
  const read = file => readFileSync(resolve(root, file));
  const json = file => JSON.parse(read(file));
  const releasePath = 'assets/ships/release/release_manifest.json', pilotsPath = 'assets/ships/render-packages/pilots.json';
  const release = json(releasePath).assets.find(asset => asset.id === row.id);
  const pilot = json(pilotsPath).pilots.find(p => p.releaseAssetId === row.id);
  if (!release || !pilot || release.source !== `assets/ships/parts/${row.file}`
    || release.release !== `assets/ships/release/parts/${row.file}` || pilot.sourceUrl !== release.release) {
    throw new Error(`${row.id}: missing or wrong source/release/package owner`);
  }
  const metadata = json(pilot.metadataUrl);
  if (metadata.contentHash !== await computeRenderPackageContentHash(metadata, { digest: hash })
    || metadata.runtimeHash !== await computeRenderPackageRuntimeHash(metadata, { digest: hash })) {
    throw new Error(`${row.id}: package metadata hash mismatch`);
  }
  const source = read(release.source), released = read(release.release);
  verifyWorldSiteBindingProvenance(worldSiteAssetBinding(row.id), row, source, released);
  const packagedPath = `${pilot.outputDir}/render.glb`, packaged = read(packagedPath);
  if (hash(source) !== release.sourceSha256 || hash(released) !== release.releaseSha256
    || pilot.releaseSha256 !== release.releaseSha256 || metadata.render.sha256 !== hash(packaged)) {
    throw new Error(`${row.id}: source/release/package hash mismatch`);
  }
  const authorPath = 'tools/blender/forge/ceres_second_measure_kit.py', authorHash = hash(read(authorPath));
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const artifacts = [];
  let sourceCertificate = null;
  for (const [kind, file, bytes] of [['source', release.source, source], ['release', release.release, released], ['package', packagedPath, packaged]]) {
    const doc = await io.readBinary(new Uint8Array(bytes));
    await doc.transform(dequantize());
    const extras = doc.getRoot().getAsset().extras, certificate = extras?.ceresSecondMeasure;
    const passages = verifyWorldSiteCertificate(certificate, measurement, authorHash, extras?.spacefaceAsset);
    if (sourceCertificate && !same(certificate, sourceCertificate)) throw new Error(`${row.id}: ${kind} certificate disagrees with source`);
    sourceCertificate ||= certificate;
    const triangles = [];
    for (const node of doc.getRoot().listNodes()) {
      if (isAuthoredNonRenderHelper(node) || !node.getMesh()) continue;
      const m = node.getWorldMatrix(), lod = Number(/^LOD([012])_/.exec(node.getName())?.[1] || 0);
      for (const p of node.getMesh().listPrimitives()) {
        if (p.getMode() !== 4) throw new Error(`${row.id}: unsupported non-triangle primitive`);
        const pos = p.getAttribute('POSITION'), indices = p.getIndices();
        if (!pos) throw new Error(`${row.id}: missing triangle positions`);
        const points = [];
        for (let i = 0; i < pos.getCount(); i++) {
          const v = pos.getElement(i, []), s = measurement.fit.scale;
          points.push({ x: (m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12])*s,
            y: (m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13])*s,
            z: (m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14])*s });
        }
        const count = indices?.getCount() || pos.getCount();
        if (count % 3) throw new Error(`${row.id}: incomplete triangle`);
        for (let i = 0; i < count; i += 3) triangles.push({ lod, points: [0,1,2].map(j => points[indices ? indices.getScalar(i+j) : i+j]) });
      }
    }
    if (!triangles.length) throw new Error(`${row.id}: empty visible geometry`);
    artifacts.push({ kind, path: file, sha256: hash(bytes), triangles: triangles.length,
      ...measureWorldSiteTriangles(triangles, measurement, passages) });
  }
  const provenancePaths = [authorPath, 'src/data/ceresShipbreak.js', 'src/data/ceresShipbreakCollision.js',
    'src/data/worldSiteAssetBindings.js', 'src/systems/worldSiteKernel.js', 'src/systems/worldSiteRuntime.js',
    'scripts/model-truth-census.mjs', 'scripts/lib/modelTruthWorldSite.mjs', 'scripts/lib/modelTruthAuthoredCompound.mjs',
    'src/render/ceresShipbreakVisuals.js', 'src/render/partsLibrary.js',
    'assets/ships/parts/parts_manifest.json', releasePath, pilotsPath, pilot.metadataUrl];
  return { ...artifacts.find(a => a.kind === 'release'),
    gapWu: Math.max(...artifacts.map(a => a.gapWu)), overTolerance: artifacts.some(a => a.overTolerance),
    sourceCompoundParity: true, authoredClearVolumesPreserved: artifacts.every(a => a.clearVolumeIntersections === 0),
    collisionAuthority: measurement.authority, artifacts,
    provenance: provenancePaths.map(path => ({ path, sha256: hash(read(path)) })),
    sourceCertificateSha256: hash(JSON.stringify(sourceCertificate)),
    scope: 'Only this source/release/package chain was freshly measured. No full-corpus or GPU acceptance claim.',
  };
}
