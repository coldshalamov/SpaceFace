#!/usr/bin/env node
// Scratch-only KTX2 + meshopt packaging for the Wasp fleet hero LOD family.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = parseArgs(process.argv.slice(2));
const candidateRoot = resolve(ROOT, args.root || '.devshots/graphics/wasp-fleet-hero-v1/candidate');
const scratchRoot = resolve(ROOT, '.devshots/graphics/wasp-fleet-hero-v1');
if (!isWithin(candidateRoot, scratchRoot)) throw new Error('builder refuses non-scratch candidate roots');
const allAssets = [
  ['lod0', 'wasp_production_v1_golden.glb', 'wasp_production_v1_golden_ktx2.glb'],
  ['lod1', 'wasp_production_v1_golden_lod1.glb', 'wasp_production_v1_golden_lod1_ktx2.glb'],
  ['lod2', 'wasp_production_v1_golden_lod2.glb', 'wasp_production_v1_golden_lod2_ktx2.glb'],
];
const assets = args.lod ? allAssets.filter(([lod]) => lod === String(args.lod)) : allAssets;
if (!assets.length) throw new Error(`unknown --lod value: ${args.lod}`);

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
});
const reports = [];
for (const [lod, inputName, outputName] of assets) {
  const input = resolve(candidateRoot, inputName);
  const output = resolve(candidateRoot, outputName);
  const temporary = resolve(candidateRoot, outputName.replace(/_ktx2\.glb$/i, '_uastc.glb'));
  const uastcLevel = String(args.level || (lod === 'lod0' ? 4 : 2));
  if (!existsSync(input)) throw new Error(`missing raw candidate: ${input}`);
  rmSync(temporary, { force: true });
  const commands = [
    // Box filtering matches the GPU-generated PNG mip response at gameplay distance. Lanczos4
    // produced a visibly darker authored mip chain once the Wasp occupied only a few dozen pixels.
    // LOD0 receives the maximum encoder search because its close normal/roughness proof is the
    // compression-bound case. Distant LODs retain level 2: their matched camera evidence is already
    // comfortably under the parity threshold, and repeating maximum search there adds no visible gain.
    runGltfTransform(['uastc', input, temporary, '--level', uastcLevel, '--jobs', String(args.jobs || 8), '--zstd', '12', '--filter', 'box']),
    runGltfTransform(['meshopt', temporary, output, '--level', 'high']),
  ];
  rmSync(temporary, { force: true });
  const document = await io.read(output);
  const root = document.getRoot();
  const textures = root.listTextures();
  const primitives = root.listMeshes().flatMap((mesh) => mesh.listPrimitives());
  const report = {
    lod,
    uastcLevel: Number(uastcLevel),
    input: receipt(input),
    output: receipt(output),
    textures: { count: textures.length, ktx2: textures.filter((texture) => texture.getMimeType() === 'image/ktx2').length },
    geometry: {
      primitives: primitives.length,
      renderPrimitives: primitives.filter((primitive) => primitive.getMaterial()).length,
      primitivesWithTangents: primitives.filter((primitive) => primitive.getAttribute('TANGENT')).length,
      primitivesWithUv0: primitives.filter((primitive) => primitive.getAttribute('TEXCOORD_0')).length,
    },
    commands,
  };
  if (!report.textures.count || report.textures.ktx2 !== report.textures.count) throw new Error(`${lod}: not all textures converted to KTX2`);
  if (report.geometry.primitivesWithTangents < report.geometry.renderPrimitives) throw new Error(`${lod}: tangent attributes lost on render primitives`);
  if (report.geometry.primitivesWithUv0 < report.geometry.renderPrimitives) throw new Error(`${lod}: UV0 attributes lost on render primitives`);
  reports.push(report);
}
const reportPath = resolve(candidateRoot, 'ktx2-build-report.json');
writeFileSync(reportPath, `${JSON.stringify({ schema: 'spaceface.waspFleetHero.ktx2Build.v1', reports }, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ok: true, report: reportPath, assets: reports.length }, null, 2)}\n`);

function runGltfTransform(args) {
  const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const fullArgs = ['--yes', '@gltf-transform/cli', ...args];
  const command = `${executable} ${fullArgs.map(shellQuote).join(' ')}`;
  const result = process.platform === 'win32'
    ? spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
      `& '${executable}' ${fullArgs.map(powerShellQuote).join(' ')}`,
    ], { cwd: ROOT, encoding: 'utf8', windowsHide: true, shell: false, maxBuffer: 64 * 1024 * 1024 })
    : spawnSync(executable, fullArgs, { cwd: ROOT, encoding: 'utf8', windowsHide: true, shell: false, maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${command}\n${result.error || ''}\n${result.stdout || ''}\n${result.stderr || ''}`);
  return { command, exitCode: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function shellQuote(value) {
  const text = String(value);
  return /[\s"]/u.test(text) ? JSON.stringify(text) : text;
}

function powerShellQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function receipt(path) {
  const bytes = readFileSync(path);
  return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex').toUpperCase() };
}

function isWithin(path, parent) {
  const normalized = resolve(path).toLowerCase();
  const normalizedParent = `${resolve(parent).toLowerCase()}\\`;
  return normalized === resolve(parent).toLowerCase() || normalized.startsWith(normalizedParent);
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index++) {
    if (!values[index].startsWith('--')) continue;
    const key = values[index].slice(2);
    result[key] = values[index + 1] && !values[index + 1].startsWith('--') ? values[++index] : true;
  }
  return result;
}
