import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  RENDER_PACKAGE_COMPILER_NAME,
  RENDER_PACKAGE_COMPILER_VERSION,
  stableJsonStringify,
} from '../../src/contracts/renderPackage.js';

export function pilotInputDescriptorUri(key) {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(key)) throw new Error(`Unsafe pilot input descriptor key: ${key}`);
  return `assets/ships/render-packages/inputs/${key}.json`;
}

// This is an invocation descriptor, not a cache hit or permission to skip compilation.
// Keep whole selected rows so newly introduced authoring fields fail closed by default.
export function createPilotInputDescriptor({ manifest, flightStaticManifest, pilot, releaseRow,
  semanticManifest, sourceGlb, motionBank, compilerOptions }) {
  const { pilots, ...catalog } = manifest;
  const { packages, ...flightStaticPolicy } = flightStaticManifest;
  return {
    schema: 'spaceface.renderPackagePilotInputs.v1',
    pilot,
    catalog,
    flightStatic: { policy: flightStaticPolicy, selected: packages.includes(pilot.key) },
    releaseRow,
    sourceGlb,
    semanticManifest,
    compiler: { name: RENDER_PACKAGE_COMPILER_NAME, version: RENDER_PACKAGE_COMPILER_VERSION, ...compilerOptions },
    runtime: { assetId: pilot.runtimeAssetId, slot: pilot.slot, sourceUrl: pilot.sourceUrl, motionBank },
  };
}

export function pilotInputDescriptorBytes(descriptor) {
  return Buffer.from(`${stableJsonStringify(descriptor, 2)}\n`, 'utf8');
}

// The runtime sealer validates these bytes against the compiled pivots afterward.
// Its returned reference must equal this snapshot, catching concurrent bank edits.
export async function readPilotMotionInput(pilot, semanticManifest, repoRoot) {
  if (!semanticManifest.semanticNodes.some((node) => String(node.node || '').startsWith('MOTION_'))) return null;
  const uri = `assets/ships/motions/${pilot.key.replace(/-lod\d+$/, '')}.motion.json`;
  const bytes = Buffer.from((await readFile(resolve(repoRoot, uri), 'utf8')).replace(/\r\n/g, '\n'));
  return { uri, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, rigId: JSON.parse(bytes).rigId };
}
