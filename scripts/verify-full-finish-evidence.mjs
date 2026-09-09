#!/usr/bin/env node
/**
 * Historical Full Finish Bar replay verifier — counts + doc contract.
 * Usage: node scripts/verify-full-finish-evidence.mjs --legacy-replay [--out <path>]
 */
import { createHash } from 'node:crypto';
import fs from 'fs';
import path from 'path';

import { inspectReleaseAssetPair } from '../src/contracts/assetReleaseValidation.js';

const LEGACY_REPLAY_FLAG = '--legacy-replay';
if (!process.argv.includes(LEGACY_REPLAY_FLAG)) {
  console.error(
    'LEGACY FULL FINISH REPLAY BLOCKED: use --legacy-replay explicitly; '
    + 'new work follows docs/visual-assets/README.md',
  );
  process.exit(2);
}
if (process.argv.includes('--help')) {
  console.log(
    'usage: node scripts/verify-full-finish-evidence.mjs '
    + '--legacy-replay [--out <path>]\n'
    + 'historical replay only; not current visual acceptance',
  );
  process.exit(0);
}

const ROOT = process.cwd();
const DEVSHOTS = path.join(ROOT, '.devshots', 'graphics-revamp');
const MANIFEST = path.join(ROOT, 'assets', 'ships', 'parts', 'parts_manifest.json');
const TEX_ROOT = path.join(ROOT, 'assets', 'ships', 'parts', 'textures');
const EV_ROOT = path.join(ROOT, 'assets', 'ships', 'parts', 'revamp-evidence');
const GOAL = path.join(ROOT, 'GOAL_FULL_PROFESSIONAL_GRAPHICS_REVAMP.md');
const PLAN = path.join(ROOT, 'plan.md');
const RELEASE_MANIFEST = path.join(ROOT, 'assets', 'ships', 'release', 'release_manifest.json');

const T1 = new Set([
  'hull_starter',
  'weapon_gatling',
  'fin_wedge',
  'cockpit_recessed',
  'place_asteroid_rock_a',
  'place_station_trade_hub',
]);

const VIEWPORT_BAN = /render_viewport(?:_to_path)?|render\.opengl|\batomic opengl\b|\bopengl retake\b|\bopengl crop\b|\bopengl pass\b|\bMCP viewport renders\b/i;

function lineAllowsViewportMention(line) {
  return /\*\*NOT\*\*/.test(line) && VIEWPORT_BAN.test(line);
}

function findViewportViolations(text, label) {
  const issues = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (lineAllowsViewportMention(line)) continue;
    if (VIEWPORT_BAN.test(line)) {
      issues.push(`${label}:${i + 1}:${line.trim().slice(0, 80)}`);
    }
  }
  return issues;
}

function surfacingTechniqueCount(text) {
  const line = text.match(/\*\*≥6 surfacing techniques(?:\s+applied)?:\*\*\s*([^\n]+)/i);
  if (line) {
    const items = line[1]
      .replace(/\.$/, '')
      .split(/,|\+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 2);
    if (items.length >= 6) return items.length;
  }
  const patterns = [
    /trim_sheet/i,
    /wear_mask/i,
    /AO bake/i,
    /wear→roughness|wear->roughness/i,
    /SF_EdgeWear|SF_CavityDirt/i,
    /clearcoat/i,
    /emissive/i,
    /layered node/i,
    /story skin/i,
    /roughness variation/i,
  ];
  return patterns.filter((re) => re.test(text)).length;
}

function auditId(id, part, goalText) {
  const issues = [];
  const defPath = path.join(EV_ROOT, id, 'deficiency.md');
  const finPath = path.join(EV_ROOT, id, 'finalize.log');
  const texDir = path.join(TEX_ROOT, id);

  const def = fs.existsSync(defPath) ? fs.readFileSync(defPath, 'utf8') : '';
  issues.push(...findViewportViolations(def, `${id}/deficiency.md`));

  const goalRow = goalText.split('\n').find((l) => l.startsWith(`${id} |`));
  if (goalRow) {
    issues.push(...findViewportViolations(goalRow, `GOAL row ${id}`));
  }

  const beforeBlocks = (def.match(/^## Before iter/gm) || []).length;
  if (beforeBlocks !== 4) issues.push(`before_blocks=${beforeBlocks}!=4`);

  const techCount = surfacingTechniqueCount(def);
  if (techCount < 6) issues.push(`techniques=${techCount}<6`);

  const pngs = fs.existsSync(DEVSHOTS)
    ? fs.readdirSync(DEVSHOTS).filter((f) => f.includes(id) && f.endsWith('.png'))
    : [];
  const lit = pngs.filter((f) => /_lit/i.test(f));
  const minLit = T1.has(id) ? 10 : 20;
  if (lit.length < minLit) issues.push(`lit=${lit.length}<${minLit}`);

  const tex = fs.existsSync(texDir) ? fs.readdirSync(texDir) : [];
  if (!tex.some((f) => f.includes('trim_sheet'))) issues.push('no_trim');
  if (!tex.some((f) => f.includes('wear_mask'))) issues.push('no_wear');
  if (!tex.some((f) => /Material_Hull_ao/.test(f))) issues.push('no_ao_hull');
  if (!tex.some((f) => /Material_Mechanical_ao/.test(f))) issues.push('no_ao_mech');
  if (!tex.some((f) => /Material_(Accent|Glass)_ao/.test(f))) issues.push('no_ao_accent_or_glass');

  if (!fs.existsSync(finPath)) {
    issues.push('no_finalize_log');
  } else {
    const finText = fs.readFileSync(finPath, 'utf8');
    issues.push(...findViewportViolations(finText, `${id}/finalize.log`));
    try {
      const j = JSON.parse(finText);
      if (j.tris !== part.tris || j.bytes !== part.bytes) {
        issues.push(`fin_mismatch manifest=${part.tris}/${part.bytes} log=${j.tris}/${j.bytes}`);
      }
    } catch {
      issues.push('finalize_log_invalid');
    }
  }

  const sourcePath = path.join(ROOT, 'assets', 'ships', 'parts', part.file);
  const releasePath = path.join(ROOT, 'assets', 'ships', 'release', 'parts', part.file);
  if (!fs.existsSync(releasePath)) {
    issues.push('no_release_glb');
  } else if (!fs.existsSync(sourcePath)) {
    issues.push('no_source_glb');
  } else {
    const pair = inspectReleaseAssetPair(
      `assets/ships/parts/${part.file}`,
      `assets/ships/release/parts/${part.file}`,
      { root: ROOT },
    );
    if (!pair.ok) {
      issues.push(`release_pair_fail:${(pair.issues || []).map((i) => i.rule || i.message).join('|')}`);
    }
    const sourceBytes = fs.readFileSync(sourcePath);
    const releaseEntry = releaseManifestById.get(id);
    if (!releaseEntry) {
      issues.push('no_release_manifest_entry');
    } else if (releaseEntry.sourceBytes !== sourceBytes.length) {
      issues.push(`release_stale sourceBytes manifest=${releaseEntry.sourceBytes} actual=${sourceBytes.length}`);
    } else if (releaseEntry.sourceSha256 !== sha256(sourceBytes)) {
      issues.push('release_stale sourceSha256 mismatch');
    }
    if (pair.release && pair.release.metrics.textureCount > 0 && pair.release.metrics.ktx2TextureCount === 0) {
      issues.push('release_textures_not_ktx2');
    }
  }

  return { id, issues, lit: lit.length, total: pngs.length, beforeBlocks, techCount, tier: T1.has(id) ? 'T1' : 'T2' };
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function auditTopLevelDocs() {
  const issues = [];
  if (fs.existsSync(PLAN)) {
    const plan = fs.readFileSync(PLAN, 'utf8');
    issues.push(...findViewportViolations(plan, 'plan.md'));
    const unchecked = (plan.match(/^- \[ \]/gm) || []).length;
    if (unchecked > 0) issues.push(`plan.md unchecked_items=${unchecked}`);
  }
  if (fs.existsSync(GOAL)) {
    const goal = fs.readFileSync(GOAL, 'utf8');
    const tableLines = goal.split('\n').filter((l) => l.includes(' | yes | '));
    for (const row of tableLines) {
      issues.push(...findViewportViolations(row, 'GOAL table'));
    }
  }
  return issues;
}

const outArg = process.argv.indexOf('--out');
const outPath = outArg !== -1 ? process.argv[outArg + 1] : null;

const goalText = fs.existsSync(GOAL) ? fs.readFileSync(GOAL, 'utf8') : '';
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const releaseManifestById = new Map();
if (fs.existsSync(RELEASE_MANIFEST)) {
  const releaseManifest = JSON.parse(fs.readFileSync(RELEASE_MANIFEST, 'utf8'));
  for (const entry of releaseManifest.assets || []) {
    releaseManifestById.set(entry.id, entry);
  }
}
const results = manifest.parts.map((p) => auditId(p.id, p, goalText));
const topIssues = auditTopLevelDocs();

const fails = results.filter((r) => r.issues.length);
const lines = results.map((r) =>
  r.issues.length
    ? `FAIL ${r.id} [${r.tier}] lit=${r.lit} blocks=${r.beforeBlocks} tech=${r.techCount}: ${r.issues.join(', ')}`
    : `PASS ${r.id} [${r.tier}] lit=${r.lit} blocks=${r.beforeBlocks} tech=${r.techCount}`,
);

if (topIssues.length) {
  lines.push('');
  lines.push('DOC CONTRACT FAILURES:');
  for (const t of topIssues) lines.push(`  ${t}`);
}

lines.push('');
const failCount = fails.length + (topIssues.length ? 1 : 0);
lines.push(`SUMMARY fail=${failCount} pass=${results.length - fails.length} total=${results.length} doc_contract=${topIssues.length === 0 ? 'PASS' : 'FAIL'}`);

const report = lines.join('\n');
console.log(report);
if (outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, report + '\n');
}
process.exit(failCount ? 1 : 0);
