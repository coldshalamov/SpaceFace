#!/usr/bin/env node
/**
 * Copy hash-bound Hitch V9 source LODs onto the live starter wholeship paths.
 * Does not rewrite gameplay maps. Does not overwrite KTX2 release files.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FAMILY = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(FAMILY, '../../..');
const BUILD = JSON.parse(readFileSync(resolve(FAMILY, 'evidence/hitch_polish_v9/build_report.json'), 'utf8'));
if (BUILD.status !== 'complete') throw new Error('V9 build is not complete');

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
const members = [
  { lod: 0, live: 'kestrel.glb' },
  { lod: 1, live: 'kestrel_lod1.glb' },
  { lod: 2, live: 'kestrel_lod2.glb' },
];
const receipt = [];
for (const member of members) {
  const src = resolve(FAMILY, BUILD.lods[member.lod].path);
  if (!existsSync(src)) throw new Error(`missing V9 LOD${member.lod}`);
  const hash = sha256(src);
  if (hash !== BUILD.lods[member.lod].sha256) throw new Error(`V9 LOD${member.lod} hash drift`);
  const liveSource = resolve(ROOT, 'assets/ships/parts/wholeships', member.live);
  const familySource = resolve(FAMILY, 'source/wholeships', `kestrel_borrowed_time_v4_lod${member.lod}.glb`);
  mkdirSync(dirname(liveSource), { recursive: true });
  mkdirSync(dirname(familySource), { recursive: true });
  copyFileSync(src, liveSource);
  copyFileSync(src, familySource);
  receipt.push({
    lod: member.lod,
    source: BUILD.lods[member.lod].path,
    live: `assets/ships/parts/wholeships/${member.live}`,
    sha256: hash,
    bytes: BUILD.lods[member.lod].bytes,
    triangles: BUILD.lods[member.lod].triangles,
    releaseUntouched: true,
  });
}
const report = {
  schema: 'spaceface.hitchPolishV9.livePromotion.v1',
  status: 'complete',
  packet: BUILD.packet,
  generationFingerprint: BUILD.generationFingerprint,
  members: receipt,
};
writeFileSync(resolve(FAMILY, 'evidence/hitch_polish_v9/promote_report.json'), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
