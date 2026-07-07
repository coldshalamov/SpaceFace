#!/usr/bin/env node
/**
 * Mechanical closer for elite repo-contract gaps.
 * Usage: node scripts/close-elite-repo-contract.mjs [--skip-build]
 */
import { existsSync, readFileSync, unlinkSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { computePartsSourceRollupSha256, partsSourceEntryCount } from './lib/releaseManifestRollup.mjs';

const ROOT = process.cwd();
const RELEASE_MANIFEST = join(ROOT, 'assets/ships/release/release_manifest.json');
const EV_ROOT = join(ROOT, 'assets/ships/parts/revamp-evidence');
const SCRATCH = process.env.SCRATCH || 'C:/Users/93rob/AppData/Local/Temp/grok-goal-1cee974d5c56/implementer';
mkdirSync(SCRATCH, { recursive: true });
const skipBuild = process.argv.includes('--skip-build');

function gitLsFiles(pattern) {
  const r = spawnSync('git', ['ls-files', pattern], { cwd: ROOT, encoding: 'utf8' });
  return (r.stdout || '').split('\n').map((s) => s.trim()).filter(Boolean);
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${r.status})`);
}

const log = [];

// 1. Untrack blend backups from git index (working tree already deleted)
const tracked = [...gitLsFiles('*.blend1'), ...gitLsFiles('*.blend11')];
for (const f of tracked) {
  spawnSync('git', ['rm', '--cached', '--force', f], { cwd: ROOT, encoding: 'utf8' });
  log.push(`git rm --cached ${f}`);
}
log.push(`blend_index_cleared=${tracked.length}`);

// 2. Remove _export_tmp.glb under revamp-evidence
function purgeExportTmp(dir) {
  let n = 0;
  if (!existsSync(dir)) return n;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) n += purgeExportTmp(p);
    else if (name === '_export_tmp.glb') { unlinkSync(p); n++; log.push(`deleted ${p}`); }
  }
  return n;
}
log.push(`export_tmp_removed=${purgeExportTmp(EV_ROOT)}`);

// 3. Patch top-level sourceSha256 on release_manifest.json
if (existsSync(RELEASE_MANIFEST)) {
  const rel = JSON.parse(readFileSync(RELEASE_MANIFEST, 'utf8'));
  const entries = Array.isArray(rel.assets) ? rel.assets : [];
  rel.sourceSha256 = computePartsSourceRollupSha256(entries);
  rel.partsSourceCount = partsSourceEntryCount(entries);
  rel.sourceSha256Algorithm = 'sha256(sorted parts source paths as source:perAssetHash lines)';
  writeFileSync(RELEASE_MANIFEST, `${JSON.stringify(rel, null, 2)}\n`);
  log.push(`release_manifest.sourceSha256=${rel.sourceSha256}`);
}

// 4. Sync needed-assets NEW rows from manifest
run(process.execPath, ['scripts/sync-needed-assets-from-manifest.mjs']);

// 5. Colocate renders (writes colocate.log)
const colocateOut = join(SCRATCH, 'colocate.log');
const col = spawnSync(process.execPath, ['scripts/colocate-elite-renders.mjs'], { cwd: ROOT, encoding: 'utf8' });
writeFileSync(colocateOut, (col.stdout || '') + (col.stderr || '') + `\nexit=${col.status}\n`);
log.push(`colocate_exit=${col.status} log=${colocateOut}`);
if (col.status !== 0) process.exit(col.status);

// 6. Optional full release build
if (!skipBuild) {
  try {
    run(process.execPath, ['scripts/build-sg04-release-assets.mjs', '--no-clean']);
    run(process.execPath, ['scripts/check-sg04-release-assets.mjs', '--release']);
  } catch (e) {
    console.warn(`[close] build skipped or failed: ${e.message}`);
  }
}

// 7. Verify contract
const contractOut = join(SCRATCH, 'repo-contract.log');
const chk = spawnSync(process.execPath, ['scripts/check-elite-repo-contract.mjs', '--out', contractOut], { cwd: ROOT, encoding: 'utf8' });
console.log(chk.stdout || '');
writeFileSync(join(SCRATCH, 'close-elite-repo-contract.log'), log.join('\n') + '\n');
process.exit(chk.status ?? 1);