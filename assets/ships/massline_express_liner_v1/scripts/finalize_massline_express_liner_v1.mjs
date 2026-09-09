#!/usr/bin/env node
/** Copy authored liner LODs to parts/ and stamp scene identity for SG-04. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const DIR = dirname(fileURLToPath(import.meta.url));
const FAMILY = resolve(DIR, '..');
const ROOT = resolve(FAMILY, '../../..');
const ASSET_ID = 'SF_WHOLESHIP_MASSLINE_EXPRESS_LINER_V1';
const PART_ID = 'massline_express_liner_v1';
const PARTS = resolve(ROOT, 'assets/ships/parts/wholeships');
const CANDIDATE_DIR = resolve(FAMILY, 'release_candidates/wholeships');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const rel = (path) => path.replace(/\\/g, '/').replace(ROOT.replace(/\\/g, '/') + '/', '');

async function stamp(abs, lod) {
  const document = await io.read(abs);
  const root = document.getRoot();
  const asset = root.getAsset();
  const scene = root.getDefaultScene() || root.listScenes()[0];
  const existing = asset.extras?.spacefaceAsset || {};
  const sf = {
    contractVersion: 2,
    ...existing,
    assetId: ASSET_ID,
    partId: PART_ID,
    lod,
    slot: 'hull',
    category: 'wholeships',
    role: 'civic_pressure_drum_liner',
    packet: 'PQ-049',
    forward: '+X',
    up: '+Y',
    starboard: '+Z',
    unit: 'metre',
    normalConvention: 'OpenGL',
    ormChannels: 'R=AO,G=Roughness,B=Metallic',
    textureCompression: existing.textureCompression || 'PNG-source',
    embeddedPlume: false,
    wiringStatus: 'live_express_candidate',
  };
  asset.extras = {
    ...(asset.extras || {}),
    assetId: ASSET_ID,
    partId: PART_ID,
    category: 'wholeships',
    spacefaceAsset: sf,
  };
  scene.setExtras({ ...(scene.getExtras() || {}), spacefaceAsset: sf });
  for (const node of scene.listChildren()) {
    node.setExtras({
      ...(node.getExtras() || {}),
      spacefaceAsset: { ...((node.getExtras() || {}).spacefaceAsset || {}), ...sf },
    });
  }
  await io.write(abs, document);
}

const reports = [];
mkdirSync(CANDIDATE_DIR, { recursive: true });
mkdirSync(PARTS, { recursive: true });
for (const lod of [0, 1, 2]) {
  const source = resolve(FAMILY, `source/wholeships/massline_express_liner_v1_lod${lod}.glb`);
  if (!existsSync(source)) throw new Error(`missing ${rel(source)}`);
  const candidate = resolve(CANDIDATE_DIR, `massline_express_liner_v1_lod${lod}.glb`);
  copyFileSync(source, candidate);
  await stamp(candidate, `lod${lod}`);
  const liveName = lod === 0
    ? 'massline_express_liner_v1.glb'
    : `massline_express_liner_v1_lod${lod}.glb`;
  copyFileSync(candidate, resolve(PARTS, liveName));
  reports.push({
    lod,
    path: rel(candidate),
    live: `wholeships/${liveName}`,
    bytes: readFileSync(candidate).byteLength,
    sha256: sha256(candidate),
  });
}

const report = {
  schema: 'spaceface.masslineExpressLinerV1.finalize.v1',
  packet: 'PQ-049',
  assetId: ASSET_ID,
  status: 'technical_candidate',
  lods: reports,
};
mkdirSync(resolve(FAMILY, 'evidence'), { recursive: true });
writeFileSync(resolve(FAMILY, 'evidence/finalize_report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
