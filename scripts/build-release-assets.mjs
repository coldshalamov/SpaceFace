#!/usr/bin/env node
// SPEC3-37 release lane entry — validates authored sources against spaceface_export contract
// before invoking the SG-04 release build. Both MCP authoring and headless build end here.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXPORTER = resolve(ROOT, 'tools/blender/spaceface_export.py');
const SG04_BUILD = resolve(ROOT, 'scripts/build-sg04-release-assets.mjs');

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;

const WHOLE_SHIPS = [
  { path: 'assets/ships/parts/wholeships/kestrel.glb', kind: 'wholeship', id: 'kestrel', assetId: 'SF_WHOLESHIP_KESTREL' },
  { path: 'assets/ships/parts/wholeships/pelican.glb', kind: 'wholeship', id: 'pelican', assetId: 'SF_WHOLESHIP_PELICAN' },
  { path: 'assets/ships/parts/wholeships/wasp.glb', kind: 'wholeship', id: 'wasp', assetId: 'SF_WHOLESHIP_WASP' },
];

function parseGlb(bytes) {
  const len = bytes.readUInt32LE(12);
  const json = bytes.subarray(20, 20 + len).toString('utf8').replace(/\0+$/, '').trim();
  return JSON.parse(json);
}

function validateWithPython(relPath, spec) {
  const abs = resolve(ROOT, relPath);
  if (!existsSync(abs)) return { ok: false, detail: `missing ${relPath}` };
  const args = [EXPORTER, '--validate-only', abs, '--kind', spec.kind, '--id', spec.id];
  if (spec.assetId) args.push('--asset-id', spec.assetId);
  const result = spawnSync('python', args, { cwd: ROOT, encoding: 'utf8' });
  if (result.error && result.error.code === 'ENOENT') {
    return { ok: true, skipped: true, detail: 'python unavailable — node check-exporter gate only' };
  }
  return { ok: result.status === 0, detail: (result.stdout || result.stderr || '').trim() };
}

function main() {
  const wholeshipOnly = process.argv.includes('--wholeships-only');
  const skipValidate = process.argv.includes('--skip-validate');
  const failures = [];

  if (!skipValidate) {
    for (const ship of WHOLE_SHIPS) {
      const verdict = validateWithPython(ship.path, ship);
      if (!verdict.ok && !verdict.skipped) {
        failures.push({ path: ship.path, detail: verdict.detail });
        console.warn(`[release-assets] wholeship contract FAIL ${ship.path}: ${verdict.detail}`);
      } else if (verdict.skipped) {
        console.warn(`[release-assets] python validation skipped for ${ship.path}`);
      } else {
        console.log(`[release-assets] wholeship contract ok ${ship.path}`);
      }
    }
    if (failures.length && !process.argv.includes('--allow-wholeship-warnings')) {
      console.error('[release-assets] wholeship sources fail exporter hull-body gate; re-export in Blender before release');
      console.error('[release-assets] pass --allow-wholeship-warnings to build anyway (diagnostic only)');
      process.exit(1);
    }
  }

  const sg04Args = ['node', SG04_BUILD, ...process.argv.slice(2).filter((a) => !a.startsWith('--allow-wholeship'))];
  const build = spawnSync(sg04Args[0], sg04Args.slice(1), { cwd: ROOT, stdio: 'inherit' });
  process.exit(build.status ?? 1);
}

main();