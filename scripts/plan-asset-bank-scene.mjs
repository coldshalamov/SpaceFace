import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listAssetBank } from './list-asset-bank.mjs';

const vector = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
function check(value, message) { if (!value) throw new Error(message); }
function fields(value, allowed, context) {
  check(value && typeof value === 'object' && !Array.isArray(value), `${context}: expected object`);
  check(Object.keys(value).every(key => allowed.includes(key)), `${context}: unknown field`);
}

// Column-major T * Rz * Ry * Rx * S: scale, then fixed-axis X/Y/Z rotations, then translate.
function placementMatrix(position, rotation, scale) {
  const [x, y, z] = rotation;
  const [cx, cy, cz] = [Math.cos(x), Math.cos(y), Math.cos(z)];
  const [sx, sy, sz] = [Math.sin(x), Math.sin(y), Math.sin(z)];
  return [
    cz * cy * scale[0], sz * cy * scale[0], -sy * scale[0], 0,
    (cz * sy * sx - sz * cx) * scale[1], (sz * sy * sx + cz * cx) * scale[1], cy * sx * scale[1], 0,
    (cz * sy * cx + sz * sx) * scale[2], (sz * sy * cx - cz * sx) * scale[2], cy * cx * scale[2], 0,
    ...position, 1,
  ];
}

function transformedBounds(bounds, matrix) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let corner = 0; corner < 8; corner++) {
    const p = bounds.min.map((value, axis) => corner & (1 << axis) ? bounds.max[axis] : value);
    for (let axis = 0; axis < 3; axis++) {
      const value = matrix[axis] * p[0] + matrix[4 + axis] * p[1] + matrix[8 + axis] * p[2] + matrix[12 + axis];
      check(Number.isFinite(value), 'Transformed bounds overflow');
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
  }
  return { min, max };
}

/** Pure authoring output backed by the exported bank; no runtime registry or game imports. */
export async function planAssetBankScene(spec, { root } = {}) {
  fields(spec, ['schemaVersion', 'placements'], 'scene');
  check(spec.schemaVersion === undefined || spec.schemaVersion === 1, 'Unsupported scene schemaVersion');
  check(Array.isArray(spec.placements) && spec.placements.length <= 10000, 'Expected placements array (maximum 10000)');
  const catalog = new Map((await listAssetBank(root)).map(asset => [asset.assetId, asset]));
  const names = new Set();
  const totals = { instances: spec.placements.length, triangles: 0, draws: 0 };
  let sceneBounds = null;
  const placements = spec.placements.map((item, index) => {
    const context = `placement ${index}`;
    fields(item, ['instanceId', 'assetId', 'position', 'rotation', 'scale', 'lod'], context);
    check(typeof item.assetId === 'string' && /^[a-z0-9_-]+$/.test(item.assetId), `${context}: invalid assetId`);
    const asset = catalog.get(item.assetId);
    check(asset, `${context}: missing asset ${item.assetId}`);
    check(asset.unit === 'metre', `${context}: expected metre units`);
    const instanceId = item.instanceId === undefined ? `placement-${String(index + 1).padStart(6, '0')}` : item.instanceId;
    check(typeof instanceId === 'string' && /^[a-zA-Z0-9_-]+$/.test(instanceId), `${context}: invalid instanceId`);
    check(!names.has(instanceId), `${context}: duplicate instanceId ${instanceId}`);
    names.add(instanceId);
    for (const key of ['position', 'rotation', 'scale']) check(vector(item[key]), `${context}: ${key} must contain exactly three finite numbers`);
    check(item.scale.every(value => value !== 0), `${context}: scale must be nonzero`);
    const level = item.lod === undefined ? 0 : item.lod;
    check(Number.isSafeInteger(level) && level >= 0, `${context}: invalid LOD`);
    const lod = asset.lods.find(candidate => candidate.level === level);
    check(lod, `${context}: asset ${item.assetId} has no LOD${level}`);
    const matrix = placementMatrix(item.position, item.rotation, item.scale);
    check(matrix.every(Number.isFinite), `${context}: transform overflow`);
    const bounds = transformedBounds(asset.bounds, matrix);
    if (!sceneBounds) sceneBounds = { min: [...bounds.min], max: [...bounds.max] };
    else for (let axis = 0; axis < 3; axis++) {
      sceneBounds.min[axis] = Math.min(sceneBounds.min[axis], bounds.min[axis]);
      sceneBounds.max[axis] = Math.max(sceneBounds.max[axis], bounds.max[axis]);
    }
    for (const key of ['triangles', 'draws']) {
      totals[key] += lod[key];
      check(Number.isSafeInteger(totals[key]), `Aggregate ${key} exceeds safe integer range`);
    }
    return { instanceId, assetId: asset.assetId, category: asset.category,
      position: [...item.position], rotation: [...item.rotation], scale: [...item.scale], matrix,
      lod: { ...lod }, bounds, source: asset.source, metadataPath: asset.metadataPath,
      runtimeStatus: asset.runtimeStatus };
  });
  return { schemaVersion: 1, kind: 'authoring placement plan; not runtime registration or performance acceptance',
    unit: 'metre', rotationConvention: 'radians; fixed-axis X then Y then Z; matrix = T * Rz * Ry * Rx * S',
    matrixLayout: 'column-major', placements, totals, bounds: sceneBounds };
}

export async function main(args = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const [flag, ...rest] = args[i].split('=');
    if (flag === '--help' && rest.length === 0) {
      console.log('Usage: node scripts/plan-asset-bank-scene.mjs --scene PLAN.json [--root DIRECTORY]\nOutputs JSON. Each placement requires assetId, position, rotation (radians XYZ fixed axes), scale; optional lod (default 0), instanceId.');
      return;
    }
    check(['--scene', '--root'].includes(flag), `Unknown argument: ${args[i]}`);
    const value = rest.length ? rest.join('=') : args[++i];
    check(value && !value.startsWith('--'), `Missing value for ${flag}`);
    check(options[flag.slice(2)] === undefined, `Repeated argument: ${flag}`);
    options[flag.slice(2)] = value;
  }
  check(options.scene, '--scene is required');
  const stat = await lstat(options.scene);
  check(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 2 * 1024 * 1024, 'Scene must be a regular JSON file at most 2 MiB');
  const spec = JSON.parse(await readFile(options.scene, 'utf8'));
  console.log(JSON.stringify(await planAssetBankScene(spec, { root: options.root }), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`Asset bank scene plan: ${error.message}`); process.exitCode = 1; });
}
