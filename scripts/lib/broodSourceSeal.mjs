// Offline authoring provenance only. Runtime modules must never import file IO or hashing.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const BROOD_SOURCE_SEAL_SCHEMA = 'spaceface.broodSourceSeal.v2';
const hash = value => createHash('sha256').update(value).digest('hex');

/** Canonical UTF-8 JSON: sorted keys and ECMAScript JSON number spelling in every producer. */
export function canonicalBroodJson(value) {
  const active = new Set();
  const encode = item => {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return JSON.stringify(item);
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new TypeError('Brood seal numbers must be finite');
      return JSON.stringify(item); // Includes canonical -0 -> 0, decimal and exponent formatting.
    }
    if (!item || typeof item !== 'object') throw new TypeError('Unsupported Brood seal value');
    if (active.has(item)) throw new TypeError('Cyclic Brood seal value');
    if (Object.getOwnPropertySymbols(item).length) throw new TypeError('Symbol keys are unsupported in Brood seals');
    const descriptors=Object.getOwnPropertyDescriptors(item);
    if (Object.values(descriptors).some(d=>!Object.hasOwn(d,'value'))) throw new TypeError('Accessor properties are unsupported in Brood seals');
    if (Object.entries(descriptors).some(([key,d])=>!d.enumerable && !(Array.isArray(item)&&key==='length'))) throw new TypeError('Non-enumerable properties are unsupported in Brood seals');
    active.add(item);
    let result;
    if (Array.isArray(item)) {
      if (Object.keys(item).length !== item.length || item.some((_, i) => !Object.hasOwn(item, i))) throw new TypeError('Sparse or extended arrays are unsupported in Brood seals');
      result = `[${item.map(encode).join(',')}]`;
    } else {
      if (![Object.prototype, null].includes(Object.getPrototypeOf(item))) throw new TypeError('Brood seals require plain objects');
      result = `{${Object.keys(item).sort().map(key => `${JSON.stringify(key)}:${encode(item[key])}`).join(',')}}`;
    }
    active.delete(item);
    return result;
  };
  return encode(value);
}

export function broodBodyContractSha256(body) {
  if (body?.schema !== 'spaceface.broodBody.v1' || typeof body.id !== 'string' || !body.id) throw new TypeError('A canonical individual Brood body is required');
  return hash(canonicalBroodJson(body));
}

function sourcePaths(files) {
  if (!Array.isArray(files) || !files.length || new Set(files).size !== files.length) throw new TypeError('Exact unique Brood generator source paths are required');
  if (files.some(path => typeof path !== 'string' || path.includes('..') || path.includes('\\')
    || !(path.startsWith('tools/blender/forge/') && path.endsWith('.py') || path === 'scripts/lib/broodSourceSeal.mjs'))) {
    throw new TypeError('Unsupported Brood generator source path');
  }
  return [...files].sort();
}

/** Python hands the body and discovered imported sources to Node; it never re-spells JSON numbers. */
export function createBroodSourceSeal(body, files, { generator, root = process.cwd(), readSource = path => readFileSync(resolve(root, path)) } = {}) {
  const sourceFiles = sourcePaths(files);
  if (!generator || Object.keys(generator).sort().join(',') !== 'animation,builder,entry') throw new TypeError('Explicit generator entry, builder and animation sources are required');
  const required = sourcePaths([...new Set([...Object.values(generator),
    'tools/blender/forge/brood_kit.py','tools/blender/forge/forge.py','tools/blender/forge/forge_export.py',
    'tools/blender/forge/motion.py','tools/blender/forge/animations/motion_bank.py','scripts/lib/broodSourceSeal.mjs'])]);
  if (required.some(path => !sourceFiles.includes(path))) throw new Error('A required actual generator dependency is missing');
  const sourceDependencies = sourceFiles.map(path => {
    const bytes = readSource(path);
    if (!(bytes instanceof Uint8Array)) throw new TypeError('Source readers must return exact bytes');
    return { path, sha256: hash(bytes), bytes: bytes.length };
  });
  return {
    sourceSealSchema: BROOD_SOURCE_SEAL_SCHEMA,
    geometryContractSha256: broodBodyContractSha256(body),
    generator: { ...generator }, sourceFiles, sourceDependencies,
    sourceSha256: hash(canonicalBroodJson(sourceDependencies)),
  };
}

export function validateBroodSourceSeal(body, certificate, { sourceFiles = certificate?.sourceFiles, generator = certificate?.generator, ...options } = {}) {
  if (!certificate || certificate.sourceSealSchema !== BROOD_SOURCE_SEAL_SCHEMA) throw new Error('Unsupported Brood source seal schema');
  for (const [key,value] of Object.entries(body)) {
    if (canonicalBroodJson(certificate[key]) !== canonicalBroodJson(value)) throw new Error(`Brood source disagrees with canonical body field ${key}`);
  }
  const expected = createBroodSourceSeal(body, sourceFiles, { ...options, generator });
  for (const [key,value] of Object.entries(expected)) {
    if (canonicalBroodJson(certificate[key]) !== canonicalBroodJson(value)) throw new Error(`Brood source seal ${key} is stale or incomplete`);
  }
  return expected;
}
