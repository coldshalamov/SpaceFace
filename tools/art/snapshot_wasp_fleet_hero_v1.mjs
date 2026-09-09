#!/usr/bin/env node
// Immutable, candidate-only snapshot for WASP-FLEET-HERO-01.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SCRATCH = resolve(ROOT, '.devshots/graphics/wasp-fleet-hero-v1');
const INPUT = resolve(SCRATCH, 'input/repo');

const selectedFiles = [
  'assets/ships/parts/parts_manifest.json',
  'assets/ships/release/release_manifest.json',
  'src/render/partsLibrary.js',
  'src/render/visualOverrides.js',
  'assets/ships/parts/wholeships/wasp_production_v1.glb',
  'assets/ships/parts/wholeships/wasp_production_v1_lod1.glb',
  'assets/ships/parts/wholeships/wasp_production_v1_lod2.glb',
  'assets/ships/release/parts/wholeships/wasp_production_v1.glb',
  'assets/ships/wasp_production_v1/blender/wasp_production_v1.blend',
  'assets/ships/wasp_production_v1/BOUNDARY.json',
  'assets/ships/wasp_production_v1/MATERIAL_CONTRACT.json',
  'assets/ships/wasp_production_v1/PROVENANCE.json',
  'assets/ships/wasp_production_v1/DESIGN.md',
  'assets/ships/wasp_production_v1/scripts/build_wasp_v1.py',
  'assets/ships/wasp_production_v1/scripts/finalize_wasp_v1.mjs',
  'assets/ships/wasp_production_v1/evidence/acceptance.json',
  'assets/ships/wasp_production_v1/evidence/build_report.json',
  'assets/ships/wasp_production_v1/evidence/finalize_report.json',
  'assets/ships/wasp_production_v1/evidence/blender/wasp_v1_front_34.png',
  'assets/ships/wasp_production_v1/evidence/blender/wasp_v1_rear_34.png',
  'assets/ships/wasp_production_v1/evidence/blender/wasp_v1_top.png',
  'assets/ships/wasp_production_v1/evidence/blender/wasp_v1_gameplay_scale.png',
  'assets/ships/ship_fighter_player_concept.jpg',
  ...['hull', 'armor_dark', 'mechanical', 'frontier_cyan', 'warning_orange']
    .flatMap((role) => ['basecolor', 'normal', 'orm']
      .map((map) => `assets/ships/wasp_production_v1/textures/${role}_${map}.png`)),
];

const expectedMissing = [
  'assets/ships/release/parts/wholeships/wasp.glb',
  'assets/ships/release/parts/wholeships/wasp_production_v1_lod1.glb',
  'assets/ships/release/parts/wholeships/wasp_production_v1_lod2.glb',
];

mkdirSync(INPUT, { recursive: true });
const files = selectedFiles.map(snapshotStable);
const missing = expectedMissing.map((relative) => ({
  source: resolve(ROOT, relative),
  relative,
  exists: existsSync(resolve(ROOT, relative)),
}));
if (missing.some((entry) => entry.exists)) {
  throw new Error(`expected current missing-release state changed: ${JSON.stringify(missing)}`);
}

const partsManifest = JSON.parse(readFileSync(resolve(ROOT, 'assets/ships/parts/parts_manifest.json'), 'utf8'));
const part = partsManifest.parts.find((entry) => entry.id === 'wholeship_wasp_production_v1');
if (!part || part.assetId !== 'SF_WASP_PRODUCTION_V1' || part.wiringStatus !== 'live_player_wasp') {
  throw new Error('current Wasp parts-manifest selection changed during snapshot');
}
const releaseManifest = JSON.parse(readFileSync(resolve(ROOT, 'assets/ships/release/release_manifest.json'), 'utf8'));
const release = releaseManifest.assets.find((entry) => entry.id === 'wholeship_wasp_production_v1');
if (!release || release.source !== 'assets/ships/parts/wholeships/wasp_production_v1.glb') {
  throw new Error('current Wasp release-manifest selection changed during snapshot');
}
const runtimeMap = readFileSync(resolve(ROOT, 'src/render/partsLibrary.js'), 'utf8');
for (const token of [
  "'ship_wasp': 'wholeships/wasp_production_v1.glb'",
  "'ship_wasp': 'SF_WASP_PRODUCTION_V1'",
  "lod1: 'wholeships/wasp_production_v1_lod1.glb'",
  "lod2: 'wholeships/wasp_production_v1_lod2.glb'",
]) if (!runtimeMap.includes(token)) throw new Error(`runtime Wasp mapping changed: missing ${token}`);

const manifest = {
  schema: 'spaceface.waspFleetHero.inputManifest.v1',
  packet: 'WASP-FLEET-HERO-01',
  candidateOnly: true,
  git: {
    branch: git('branch', '--show-current'),
    head: git('rev-parse', 'HEAD'),
    worktree: ROOT,
  },
  resolvedRuntimeSelection: {
    defId: 'ship_wasp',
    assetId: 'SF_WASP_PRODUCTION_V1',
    liveSource: part.file,
    liveRelease: release.release.replace('assets/ships/release/parts/', ''),
    sourceLodFamily: part.lodFamily,
    livePreloadPolicy: 'LOD0 only; LOD1/LOD2 catalogued but not preloaded',
    releaseState: 'LOD0 present; LOD1/LOD2 absent in current dirty release tree',
  },
  files,
  expectedMissing: missing,
};
const path = resolve(SCRATCH, 'INPUT_MANIFEST.json');
writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
const manifestSha256 = sha256(readFileSync(path));
writeFileSync(resolve(SCRATCH, 'INPUT_MANIFEST.sha256'), `${manifestSha256}  INPUT_MANIFEST.json\n`);
process.stdout.write(`${JSON.stringify({ ok: true, path, manifestSha256, files: files.length, missing: missing.length }, null, 2)}\n`);

function snapshotStable(relative) {
  const source = resolve(ROOT, relative);
  const destination = resolve(INPUT, relative);
  if (!existsSync(source)) throw new Error(`required Wasp input missing: ${relative}`);
  for (let attempt = 0; attempt < 4; attempt++) {
    const before = statSync(source);
    const payload = readFileSync(source);
    const after = statSync(source);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || payload.length !== before.size) continue;
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, payload);
    const copy = readFileSync(destination);
    if (sha256(copy) !== sha256(payload)) continue;
    return {
      relative,
      source,
      snapshot: destination,
      bytes: payload.length,
      sourceMtimeUtc: before.mtime.toISOString(),
      sha256: sha256(payload),
    };
  }
  throw new Error(`source changed repeatedly while snapshotting: ${relative}`);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}
