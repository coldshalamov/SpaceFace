#!/usr/bin/env node
// TEMPORARY PQ-018 release transport. This file is never part of the final candidate tree.
// It runs only in the same-repository PR workflow, builds from the exact authoritative base in a
// detached worktree, and uploads the generated release bytes plus machine receipts as one artifact.

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = '557903d7340683ca9e1bbf3d4ad20b3a28569237';
const BRANCH = 'agent/chatgpt-pq018-implementation-20260724';
const ASSET_ID = 'place_landmark_wreck_cathedral';
const ASSET_FILE = `places/${ASSET_ID}.glb`;
const ARTIFACT_NAME = `pq018-release-transport-${BASE.slice(0, 12)}`;
const OUTPUT_ROOT = path.join(ROOT, '.devshots', 'pq018-release-transport');
const WORKTREE = path.join(ROOT, '.devshots', 'pq018-release-worktree');
const DONE = path.join(OUTPUT_ROOT, '.done');

if (process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_HEAD_REF === BRANCH && !existsSync(DONE)) {
  await buildAndUpload();
}

async function buildAndUpload() {
  mkdirSync(OUTPUT_ROOT, { recursive: true });
  rmSync(WORKTREE, { recursive: true, force: true });
  run('git', ['worktree', 'add', '--detach', WORKTREE, BASE], ROOT);
  try {
    const linkedModules = path.join(WORKTREE, 'node_modules');
    if (!existsSync(linkedModules)) symlinkSync(path.join(ROOT, 'node_modules'), linkedModules, 'dir');

    const partManifestPath = path.join(WORKTREE, 'assets', 'ships', 'parts', 'parts_manifest.json');
    const partManifest = JSON.parse(readFileSync(partManifestPath, 'utf8'));
    const entry = cathedralPartEntry();
    const priorIndex = partManifest.parts.findIndex((candidate) => candidate.id === ASSET_ID);
    if (priorIndex >= 0) partManifest.parts[priorIndex] = entry;
    else partManifest.parts.push(entry);
    if (!partManifest.runtimeSlots || !Array.isArray(partManifest.runtimeSlots.place)) {
      throw new Error('parts manifest has no runtimeSlots.place array');
    }
    if (!partManifest.runtimeSlots.place.includes(ASSET_FILE)) partManifest.runtimeSlots.place.push(ASSET_FILE);
    writeFileSync(partManifestPath, `${JSON.stringify(partManifest, null, 2)}\n`);

    const build = run(process.execPath, [
      'scripts/build-sg04-release-assets.mjs',
      '--no-clean',
      '--only',
      ASSET_ID,
    ], WORKTREE, { capture: true });
    const releaseCheck = run(process.execPath, ['scripts/check-sg04-release-assets.mjs', '--release'], WORKTREE, {
      capture: true,
      allowFailure: true,
    });
    const partsCheck = run(process.execPath, ['scripts/check-parts-manifest.mjs'], WORKTREE, {
      capture: true,
      allowFailure: true,
    });

    const sourcePath = path.join(WORKTREE, 'assets', 'ships', 'parts', ASSET_FILE);
    const releasePath = path.join(WORKTREE, 'assets', 'ships', 'release', 'parts', ASSET_FILE);
    const releaseManifestPath = path.join(WORKTREE, 'assets', 'ships', 'release', 'release_manifest.json');
    const source = readFileSync(sourcePath);
    const release = readFileSync(releasePath);
    const sourceJson = parseGlbJson(source);
    const releaseJson = parseGlbJson(release);
    const releaseManifest = JSON.parse(readFileSync(releaseManifestPath, 'utf8'));
    const releaseRow = releaseManifest.assets.find((candidate) => candidate.id === ASSET_ID);
    if (!releaseRow) throw new Error('generated release manifest omitted Cathedral row');

    const stageFiles = [
      ['assets/ships/parts/parts_manifest.json', partManifestPath],
      ['assets/ships/release/release_manifest.json', releaseManifestPath],
      [`assets/ships/release/parts/${ASSET_FILE}`, releasePath],
    ];
    for (const [relative, sourceFile] of stageFiles) {
      const destination = path.join(OUTPUT_ROOT, relative);
      mkdirSync(path.dirname(destination), { recursive: true });
      copyFileSync(sourceFile, destination);
    }

    const report = {
      schema: 'spaceface.pq018ReleaseTransport.v1',
      baseCommit: BASE,
      source: {
        path: `assets/ships/parts/${ASSET_FILE}`,
        bytes: source.length,
        sha256: sha256(source),
        gitBlob: '18384c76628e7c9d0a8096399395274bb7923da0',
        assetExtras: sourceJson.asset?.extras || null,
        nodeTransforms: semanticNodeTransforms(sourceJson),
      },
      release: {
        path: `assets/ships/release/parts/${ASSET_FILE}`,
        bytes: release.length,
        sha256: sha256(release),
        assetExtras: releaseJson.asset?.extras || null,
        extensionsUsed: releaseJson.extensionsUsed || [],
        extensionsRequired: releaseJson.extensionsRequired || [],
        nodeTransforms: semanticNodeTransforms(releaseJson),
        manifestRow: releaseRow,
      },
      commands: {
        build,
        releaseCheck,
        partsCheck,
      },
    };
    const reportPath = path.join(OUTPUT_ROOT, 'transport-report.json');
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

    run('npm', [
      'install', '--no-save', '--package-lock=false', '--ignore-scripts', '@actions/artifact@2.3.2',
    ], ROOT);
    const { DefaultArtifactClient } = await import('@actions/artifact');
    const client = new DefaultArtifactClient();
    const files = [
      ...stageFiles.map(([relative]) => path.join(OUTPUT_ROOT, relative)),
      reportPath,
    ];
    const uploaded = await client.uploadArtifact(ARTIFACT_NAME, files, OUTPUT_ROOT, { compressionLevel: 0 });
    writeFileSync(DONE, `${JSON.stringify({ artifactName: ARTIFACT_NAME, uploaded }, null, 2)}\n`);
    console.log(`[pq018-release-transport] uploaded ${ARTIFACT_NAME}: ${JSON.stringify(uploaded)}`);
  } finally {
    run('git', ['worktree', 'remove', '--force', WORKTREE], ROOT, { allowFailure: true });
  }
}

function cathedralPartEntry() {
  return {
    id: ASSET_ID,
    assetId: 'SF_LANDMARK_PLACE_LANDMARK_WRECK_CATHEDRAL',
    category: 'places',
    priority: 'P0',
    file: ASSET_FILE,
    status: 'integration_candidate',
    statusNote: 'PQ-018 exact source candidate promoted for focused runtime integration; Browser/Electron visual acceptance remains unclaimed.',
    budgetClass: 'landmark',
    tris: 91908,
    bytes: 11155156,
    textureSize: 512,
    tintable: {},
    hooks: [],
    sockets: [
      'SOCKET_Flythrough_Entry',
      'SOCKET_Flythrough_Exit',
      'SOCKET_TheMarker',
      'ZONE_Bridge',
      'ZONE_Propulsion',
      'ZONE_Service_Port',
      'ZONE_Service_Starboard',
      'ZONE_BrokenKeel',
      'SALVAGE_EngineMachinery',
      'SALVAGE_ConduitBank',
      'SALVAGE_ServiceRack',
      'INTERACTION_HangarCavity',
    ],
    mount: 'origin',
    bounds: {
      min: [-309.4813, -115.6626, -198.533],
      max: [324.0211, 166.9291, 171.3587],
      dimensionsM: [633.5024, 282.5917, 369.8917],
    },
    note: 'PQ-018 project-original Wreck Cathedral source candidate: broken Concord capital hull, three authored LODs, eight shared material roles, exact semantic component markers, and a 72 m x 58 m traversable cavity. Release admission is hash-bound; route acceptance is separate.',
  };
}

function run(command, args, cwd, { capture = false, allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: { ...process.env, PQ018_RELEASE_TRANSPORT_CHILD: '1' },
  });
  const receipt = {
    command: [command, ...args].join(' '),
    exitCode: result.status ?? 1,
    signal: result.signal || null,
    stdout: capture ? String(result.stdout || '').slice(-12000) : '',
    stderr: capture ? String(result.stderr || '').slice(-12000) : '',
  };
  if (!allowFailure && receipt.exitCode !== 0) {
    throw new Error(`${receipt.command} failed (${receipt.exitCode})\n${receipt.stderr || receipt.stdout}`);
  }
  return receipt;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseGlbJson(bytes) {
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) throw new Error('invalid GLB');
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    if (type === 0x4e4f534a) {
      return JSON.parse(bytes.subarray(offset + 8, offset + 8 + length).toString('utf8').trim());
    }
    offset += 8 + length;
  }
  throw new Error('GLB JSON chunk missing');
}

function semanticNodeTransforms(document) {
  const prefixes = ['SOCKET_', 'ZONE_', 'SALVAGE_', 'INTERACTION_', 'LOD0_ROOT', 'LOD1_ROOT', 'LOD2_ROOT'];
  return (document.nodes || [])
    .filter((node) => prefixes.some((prefix) => String(node.name || '').startsWith(prefix)))
    .map((node) => ({
      name: node.name,
      translation: node.translation || [0, 0, 0],
      rotation: node.rotation || [0, 0, 0, 1],
      scale: node.scale || [1, 1, 1],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
