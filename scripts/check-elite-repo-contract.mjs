#!/usr/bin/env node
/**
 * Elite repo-contract gate — static hygiene the evidence scripts do not assert.
 * Usage: node scripts/check-elite-repo-contract.mjs [--out <path>]
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { computePartsSourceRollupSha256, partsSourceEntryCount } from './lib/releaseManifestRollup.mjs';

const ROOT = process.cwd();
const MANIFEST = join(ROOT, 'assets/ships/parts/parts_manifest.json');
const NEEDED = join(ROOT, 'needed-assets.md');
const RELEASE_MANIFEST = join(ROOT, 'assets/ships/release/release_manifest.json');
const EV_ROOT = join(ROOT, 'assets/ships/parts/revamp-evidence');

const outArg = process.argv.indexOf('--out');
const outPath = outArg !== -1 ? process.argv[outArg + 1] : null;

const issues = [];

function gitLsFiles(pattern) {
  const r = spawnSync('git', ['ls-files', pattern], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) return [];
  return (r.stdout || '').split('\n').map((s) => s.trim()).filter(Boolean);
}

const blend1 = gitLsFiles('*.blend1');
const blend11 = gitLsFiles('*.blend11');
if (blend1.length + blend11.length > 0) {
  issues.push(`git_index_blend_backups=${blend1.length + blend11.length} (blend1=${blend1.length} blend11=${blend11.length})`);
}

if (!existsSync(RELEASE_MANIFEST)) {
  issues.push('missing_release_manifest');
} else {
  const rel = JSON.parse(readFileSync(RELEASE_MANIFEST, 'utf8'));
  const entries = Array.isArray(rel.assets) ? rel.assets : [];
  const expectedRollup = computePartsSourceRollupSha256(entries);
  const partsCount = partsSourceEntryCount(entries);
  if (!rel.sourceSha256) {
    issues.push('release_manifest_missing_top_level_sourceSha256');
  } else if (rel.sourceSha256 !== expectedRollup) {
    issues.push(`release_manifest_sourceSha256_mismatch expected=${expectedRollup} got=${rel.sourceSha256}`);
  }
  if (rel.partsSourceCount != null && rel.partsSourceCount !== partsCount) {
    issues.push(`release_manifest_partsSourceCount_mismatch expected=${partsCount} got=${rel.partsSourceCount}`);
  }
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const needed = readFileSync(NEEDED, 'utf8');
const newIds = manifest.parts.filter((p) => (p.note || '').includes('NEW')).map((p) => p.id);
const missingBriefs = newIds.filter((id) => !needed.includes(id));
if (missingBriefs.length) {
  issues.push(`needed_assets_missing_NEW_ids=${missingBriefs.length} (${missingBriefs.slice(0, 5).join(',')}${missingBriefs.length > 5 ? '...' : ''})`);
}

function findExportTmp(dir) {
  const hits = [];
  if (!existsSync(dir)) return hits;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) hits.push(...findExportTmp(p));
    else if (name === '_export_tmp.glb') hits.push(p.replace(/\\/g, '/'));
  }
  return hits;
}
const exportTmp = findExportTmp(EV_ROOT);
if (exportTmp.length) {
  issues.push(`revamp_evidence_export_tmp=${exportTmp.length}`);
}

const lines = [
  `ELITE_REPO_CONTRACT: ${issues.length ? 'FAIL' : 'PASS'}`,
  `blend1_index=${blend1.length} blend11_index=${blend11.length}`,
  `NEW_ids=${newIds.length} needed_assets_missing=${missingBriefs.length}`,
  `export_tmp_glb=${exportTmp.length}`,
];
if (existsSync(RELEASE_MANIFEST)) {
  const rel = JSON.parse(readFileSync(RELEASE_MANIFEST, 'utf8'));
  lines.push(`release_manifest.sourceSha256=${rel.sourceSha256 || '<missing>'}`);
  lines.push(`parts_source_count=${partsSourceEntryCount(rel.assets)}`);
}
for (const issue of issues) lines.push(`ISSUE: ${issue}`);

const report = lines.join('\n') + '\n';
if (outPath) writeFileSync(outPath, report);
console.log(report);
process.exit(issues.length ? 1 : 0);