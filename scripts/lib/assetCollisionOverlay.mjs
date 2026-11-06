import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import { isAuthoredNonRenderHelper } from './modelTruthAuthoredCompound.mjs';
import { applyFit, drawFit, gameplaySliceY, outlineDelta, radialOutline, slicePoints } from '../../src/data/modelTruthMath.js';

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

export function transformProjectedPoint(point, matrix, fitScale = 1, fitOffset = [0, 0, 0]) {
  const x = matrix[0] * point.x + matrix[4] * point.y + matrix[8] * point.z + matrix[12];
  const y = matrix[1] * point.x + matrix[5] * point.y + matrix[9] * point.z + matrix[13];
  const z = matrix[2] * point.x + matrix[6] * point.y + matrix[10] * point.z + matrix[14];
  return { x: x * fitScale + fitOffset[0], y: y * fitScale + fitOffset[1], z: z * fitScale + fitOffset[2] };
}

export function convexHullXZ(points) {
  const sorted = points.filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.z))
    .map(point => ({ x: point.x, z: point.z }))
    .sort((a, b) => a.x - b.x || a.z - b.z)
    .filter((point, index, rows) => index === 0 || point.x !== rows[index - 1].x || point.z !== rows[index - 1].z);
  if (sorted.length <= 2) return sorted;
  const cross = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const lower = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index];
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

export function boundsXZ(points) {
  if (!Array.isArray(points) || !points.length) return null;
  const minX = Math.min(...points.map(point => point.x)), maxX = Math.max(...points.map(point => point.x));
  const minZ = Math.min(...points.map(point => point.z)), maxZ = Math.max(...points.map(point => point.z));
  return { minX, maxX, minZ, maxZ, widthX: maxX - minX, widthZ: maxZ - minZ };
}

export function radialContour(points) {
  const sliceY = gameplaySliceY(points);
  const sliced = slicePoints(points, sliceY);
  const radii = radialOutline(sliced);
  const contour = radii.map((radius, index) => {
    const angle = -Math.PI + ((index + 0.5) / radii.length) * Math.PI * 2;
    return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
  });
  return { sliceY, radii, contour };
}

/** Radial outline of actual triangle intersections with the gameplay plane.
 * Vertex-only outlines can collapse bins when a simplified LOD has sparse edges. */
export function triangleSurfaceRadialContour(points, triangles, bins = 24) {
  const sliceY = gameplaySliceY(points);
  const radii = new Array(bins).fill(0);
  const intersections = [];
  const epsilon = 1e-8;
  const samePoint = (a, b) => Math.abs(a.x - b.x) <= epsilon && Math.abs(a.z - b.z) <= epsilon;

  for (const triangle of triangles || []) {
    const pointsOnPlane = [];
    for (let edge = 0; edge < 3; edge += 1) {
      const a = triangle[edge], b = triangle[(edge + 1) % 3];
      const da = a.y - sliceY, db = b.y - sliceY;
      if (Math.abs(da) <= epsilon && Math.abs(db) <= epsilon) {
        pointsOnPlane.push({ x: a.x, z: a.z }, { x: b.x, z: b.z });
      } else if (Math.abs(da) <= epsilon) {
        pointsOnPlane.push({ x: a.x, z: a.z });
      } else if (Math.abs(db) <= epsilon) {
        pointsOnPlane.push({ x: b.x, z: b.z });
      } else if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
        const t = da / (da - db);
        pointsOnPlane.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      }
    }
    const unique = pointsOnPlane.filter((point, index) =>
      pointsOnPlane.findIndex(candidate => samePoint(point, candidate)) === index);
    if (unique.length === 1) intersections.push([unique[0], unique[0]]);
    else if (unique.length === 2) intersections.push(unique);
    else if (unique.length > 2) {
      // A triangle coplanar with the slice contributes its boundary edges.
      for (let index = 0; index < unique.length; index += 1) {
        intersections.push([unique[index], unique[(index + 1) % unique.length]]);
      }
    }
  }

  for (let index = 0; index < bins; index += 1) {
    const angle = -Math.PI + ((index + 0.5) / bins) * Math.PI * 2;
    const ux = Math.cos(angle), uz = Math.sin(angle);
    for (const [a, b] of intersections) {
      const vx = b.x - a.x, vz = b.z - a.z;
      const denominator = ux * vz - uz * vx;
      let radius = null;
      if (Math.abs(denominator) <= epsilon) {
        if (Math.abs(a.x * uz - a.z * ux) <= epsilon) {
          radius = Math.max(a.x * ux + a.z * uz, b.x * ux + b.z * uz);
        }
      } else {
        const t = (a.x * uz - a.z * ux) / denominator;
        if (t >= -epsilon && t <= 1 + epsilon) {
          const x = a.x + vx * t, z = a.z + vz * t;
          radius = x * ux + z * uz;
        }
      }
      if (Number.isFinite(radius) && radius >= 0 && radius > radii[index]) radii[index] = radius;
    }
  }

  const contour = radii.map((radius, index) => {
    const angle = -Math.PI + ((index + 0.5) / radii.length) * Math.PI * 2;
    return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
  });
  return { sliceY, radii, contour, segmentCount: intersections.length };
}

export function radialOutlineDelta(a, b) {
  return outlineDelta(a || [], b || []);
}

export function pointInPolygon(point, polygon) {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i], b = polygon[j];
    const crosses = (a.z > point.z) !== (b.z > point.z)
      && point.x < ((b.x - a.x) * (point.z - a.z)) / ((b.z - a.z) || Number.EPSILON) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export async function readReleaseGeometry(root, file) {
  const absolutePath = path.resolve(root, file);
  const sourceBytes = await readFile(absolutePath);
  const sha256 = createHash('sha256').update(sourceBytes).digest('hex');
  const document = await io.read(absolutePath);
  await document.transform(dequantize());
  const nodes = [];
  const points = [];
  const triangles = [];
  for (const node of document.getRoot().listNodes()) {
    if (isAuthoredNonRenderHelper(node)) continue;
    const mesh = node.getMesh();
    if (!mesh) continue;
    const matrix = node.getWorldMatrix();
    const nodePoints = [];
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      const values = position?.getArray();
      if (!values || position.getElementSize() !== 3) continue;
      const primitivePoints = new Array(values.length / 3);
      for (let index = 0; index < values.length; index += 3) {
        const point = transformProjectedPoint({ x: values[index], y: values[index + 1], z: values[index + 2] }, matrix);
        if (![point.x, point.y, point.z].every(Number.isFinite)) throw new Error(`${file}: nonfinite vertex`);
        primitivePoints[index / 3] = point;
        nodePoints.push(point);
        points.push(point);
      }
      const indexValues = primitive.getIndices()?.getArray();
      const indices = indexValues ? Array.from(indexValues) : primitivePoints.map((_, index) => index);
      const mode = primitive.getMode() ?? 4;
      if (mode === 4) {
        for (let index = 0; index + 2 < indices.length; index += 3) {
          triangles.push([primitivePoints[indices[index]], primitivePoints[indices[index + 1]], primitivePoints[indices[index + 2]]]);
        }
      } else if (mode === 5) {
        for (let index = 0; index + 2 < indices.length; index += 1) {
          const order = index % 2 ? [1, 0, 2] : [0, 1, 2];
          triangles.push(order.map(offset => primitivePoints[indices[index + offset]]));
        }
      } else if (mode === 6) {
        for (let index = 1; index + 1 < indices.length; index += 1) {
          triangles.push([primitivePoints[indices[0]], primitivePoints[indices[index]], primitivePoints[indices[index + 1]]]);
        }
      }
    }
    if (nodePoints.length) nodes.push({ name: node.getName() || '(unnamed mesh node)', points: nodePoints });
  }
  if (!points.length) throw new Error(`${file}: release GLB has no visible render vertices after helper exclusion`);
  return { file, sha256, points, nodes, triangles, sourceBounds: bounds3(points) };
}

export function fitReleaseGeometry(geometry, scale, offset = [0, 0, 0]) {
  const points = applyFit(geometry.points, { scale, offset });
  const nodes = geometry.nodes.map(node => ({
    name: node.name,
    points: applyFit(node.points, { scale, offset }),
  }));
  const triangles = geometry.triangles.map(triangle => applyFit(triangle, { scale, offset }));
  return { ...geometry, points, nodes, triangles, projectedHull: convexHullXZ(points),
    radial: radialContour(points), surfaceRadial: triangleSurfaceRadialContour(points, triangles) };
}

export function fitSiblingLikeCensus(geometry, entityRadius) {
  const fit = drawFit('ship', geometry.sourceBounds, { entityRadius });
  return { ...fitReleaseGeometry(geometry, fit.scale, fit.offset), fit };
}

export function collisionOutsideNodeSummary(nodes, polygon) {
  if (!polygon || polygon.length < 3) return { available: false, nodes: [] };
  return {
    available: true,
    nodes: nodes.map(node => {
      let outsideVertices = 0;
      let outsideBounds = [];
      for (const point of node.points) {
        if (!pointInPolygon(point, polygon)) { outsideVertices += 1; outsideBounds.push(point); }
      }
      return {
        name: node.name,
        vertexCount: node.points.length,
        outsideProxyVertexCount: outsideVertices,
        outsideProxyVertexFraction: node.points.length ? outsideVertices / node.points.length : 0,
        outsideProxyBounds: boundsXZ(outsideBounds),
      };
    }).filter(row => row.outsideProxyVertexCount > 0)
      .sort((a, b) => b.outsideProxyVertexCount - a.outsideProxyVertexCount || a.name.localeCompare(b.name)),
  };
}

export function fitRadialPolygon(radii) {
  if (!Array.isArray(radii) || !radii.length) return [];
  return radii.map((radius, index) => {
    const angle = -Math.PI + ((index + 0.5) / radii.length) * Math.PI * 2;
    return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
  });
}

function bounds3(points) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const point of points) {
    min[0] = Math.min(min[0], point.x); min[1] = Math.min(min[1], point.y); min[2] = Math.min(min[2], point.z);
    max[0] = Math.max(max[0], point.x); max[1] = Math.max(max[1], point.y); max[2] = Math.max(max[2], point.z);
  }
  return { min, max, center: min.map((value, i) => (value + max[i]) / 2), size: min.map((value, i) => max[i] - value) };
}
