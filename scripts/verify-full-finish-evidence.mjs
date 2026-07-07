#!/usr/bin/env node
/**
 * Phase 1 Full Finish Bar evidence gate.
 * Usage: node scripts/verify-full-finish-evidence.mjs [--out <path>]
 */
import { createHash } from 'node:crypto';
import fs from 'fs';
import path from 'path';

import { inspectReleaseAssetPair } from '../src/contracts/assetReleaseValidation.js';

const ROOT = process.cwd();
const DEVSHOTS = path.join(ROOT, '.devshots', 'graphics-revamp');
const MANIFEST = path.join(ROOT, 'assets', 'ships', 'parts', 'parts_manifest.json');
const TEX_ROOT = path.join(ROOT, 'assets', 'ships', 'parts', 'textures');
const EV_ROOT = path.join(ROOT, 'assets', 'ships', 'parts', 'revamp-evidence');
const RELEASE_MANIFEST = path.join(ROOT, 'assets', 'ships', 'release', 'release_manifest.json');

const T1 = new Set([
  'hull_starter', 'weapon_gatling', 'fin_wedge', 'cockpit_recessed',
  'place_asteroid_rock_a', 'place_station_trade_hub',
]);

function surfacingTechniqueCount(text) {
  const inline = text.match(/\*\*≥6 surfacing techniques(?:\s+applied)?:\*\*\s*([^\n]+)/i)
    || text.match(/\*\*≥10 surfacing techniques(?:\s+applied)?:\*\*\s*([^\n]+)/i);
  if (inline) {
    const items = inline[1].replace(/\.$/, '').split(/,|\+/).map((s) => s.trim()).filter((s) => s.length > 2);
    if (items.length >= 6) return items.length;
  }
  const block = text.match(/\*\*≥6 surfacing techniques(?:\s+applied)?:\*\*[\s\S]*?(?=\n\*\*|\n## |$)/i)
    || text.match(/\*\*≥10 surfacing techniques(?:\s+applied)?:\*\*[\s\S]*?(?=\n\*\*|\n## |$)/i);
  if (block) {
    const numbered = (block[0].match(/^\s*\d+\.\s+/gm) || []).length;
    if (numbered >= 6) return numbered;
  }
  const patterns = [/trim_sheet/i, /wear_mask/i, /AO bake/i, /wear→roughness|wear->roughness/i,
    /SF_EdgeWear|SF_CavityDirt/i, /clearcoat/i, /emissive/i, /layered node/i, /story skin/i];
  return patterns.filter((re) => re.test(text)).length;
}

function auditId(id, part, releaseManifestById) {
  const issues = [];
  const defPath = path.join(EV_ROOT, id, 'deficiency.md');
  const finPath = path.join(EV_ROOT, id, 'finalize.log');
  const texDir = path.join(TEX_ROOT, id);
  const def = fs.existsSync(defPath) ? fs.readFileSync(defPath, 'utf8') : '';

  const beforeBlocks = (def.match(/^## Before iter/gm) || []).length;
  const isNewElite = (part.note || '').includes('NEW');
  const minBefore = isNewElite ? 6 : 4;
  if (beforeBlocks < minBefore) issues.push(`before_blocks=${beforeBlocks}<${minBefore}`);

  const techCount = surfacingTechniqueCount(def);
  if (techCount < 6) issues.push(`techniques=${techCount}<6`);

  const pngs = fs.existsSync(DEVSHOTS)
    ? fs.readdirSync(DEVSHOTS).filter((f) => f.includes(id) && f.endsWith('.png')) : [];
  const lit = pngs.filter((f) => /_lit/i.test(f));
  const minLit = T1.has(id) ? 10 : 20;
  if (lit.length < minLit) issues.push(`lit=${lit.length}<${minLit}`);

  const tex = fs.existsSync(texDir) ? fs.readdirSync(texDir) : [];
  if (!tex.some((f) => f.includes('trim_sheet'))) issues.push('no_trim');
  if (!tex.some((f) => f.includes('wear_mask'))) issues.push('no_wear');
  if (!tex.some((f) => /Material_Hull_ao/.test(f))) issues.push('no_ao_hull');

  if (!fs.existsSync(finPath)) issues.push('no_finalize_log');
  else {
    try {
      const j = JSON.parse(fs.readFileSync(finPath, 'utf8'));
      if (j.tris !== part.tris || j.bytes !== part.bytes) {
        issues.push(`fin_mismatch manifest=${part.tris}/${part.bytes} log=${j.tris}/${j.bytes}`);
      }
    } catch { issues.push('finalize_log_invalid'); }
  }

  const sourcePath = path.join(ROOT, 'assets', 'ships', 'parts', part.file);
  const releasePath = path.join(ROOT, 'assets', 'ships', 'release', 'parts', part.file);
  if (!fs.existsSync(releasePath)) issues.push('no_release_glb');
  else if (fs.existsSync(sourcePath)) {
    const pair = inspectReleaseAssetPair(
      `assets/ships/parts/${part.file}`,
      `assets/ships/release/parts/${part.file}`,
      { root: ROOT },
    );
    if (!pair.ok) issues.push('release_pair_fail');
    const entry = releaseManifestById.get(id);
    const sourceBytes = fs.readFileSync(sourcePath).length;
    if (!entry) issues.push('no_release_manifest_entry');
    else if (entry.sourceBytes !== sourceBytes) issues.push(`release_stale bytes=${entry.sourceBytes}!=${sourceBytes}`);
  }

  return { id, issues, lit: lit.length, techCount, tier: T1.has(id) ? 'T1' : 'T2' };
}

const outArg = process.argv.indexOf('--out');
const outPath = outArg !== -1 ? process.argv[outArg + 1] : null;
const idArg = process.argv.indexOf('--id');
const singleId = idArg !== -1 ? process.argv[idArg + 1] : null;
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const releaseManifestById = new Map();
if (fs.existsSync(RELEASE_MANIFEST)) {
  for (const entry of JSON.parse(fs.readFileSync(RELEASE_MANIFEST, 'utf8')).assets || []) {
    releaseManifestById.set(entry.id, entry);
  }
}

const parts = singleId ? manifest.parts.filter((p) => p.id === singleId) : manifest.parts;
if (singleId && !parts.length) {
  console.error(`unknown id: ${singleId}`);
  process.exit(2);
}
const results = parts.map((p) => auditId(p.id, p, releaseManifestById));
const fails = results.filter((r) => r.issues.length);
const lines = results.map((r) => r.issues.length
  ? `FAIL ${r.id} [${r.tier}]: ${r.issues.join(', ')}`
  : `PASS ${r.id} [${r.tier}] lit=${r.lit} tech=${r.techCount}`);
lines.push('');
lines.push(`SUMMARY fail=${fails.length} pass=${results.length - fails.length} total=${results.length}`);
const report = lines.join('\n');
console.log(report);
if (outPath) fs.writeFileSync(outPath, report + '\n');
process.exit(fails.length ? 1 : 0);