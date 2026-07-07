#!/usr/bin/env node
/**
 * Phase 2 Elite Finish evidence gate (requires Phase 1 floor).
 * Usage: node scripts/verify-elite-finish-evidence.mjs [--out <path>] [--id <id>]
 */
import { createHash } from 'node:crypto';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const DEVSHOTS = path.join(ROOT, '.devshots', 'graphics-revamp');
const MANIFEST = path.join(ROOT, 'assets', 'ships', 'parts', 'parts_manifest.json');
const TEX_ROOT = path.join(ROOT, 'assets', 'ships', 'parts', 'textures');
const EV_ROOT = path.join(ROOT, 'assets', 'ships', 'parts', 'revamp-evidence');

const T1 = new Set([
  'hull_starter', 'weapon_gatling', 'fin_wedge', 'cockpit_recessed',
  'place_asteroid_rock_a', 'place_station_trade_hub',
]);

const STORY_MAP_RE = /stencil|scorch|faction|roughness_story/i;

function eliteTechniqueCount(text) {
  const inline = text.match(/\*\*≥10 surfacing techniques(?:\s+applied)?:\*\*\s*([^\n]+)/i);
  if (inline) {
    const items = inline[1].replace(/\.$/, '').split(/,|\+/).map((s) => s.trim()).filter((s) => s.length > 2);
    if (items.length >= 10) return items.length;
  }
  const block = text.match(/\*\*≥10 surfacing techniques(?:\s+applied)?:\*\*[\s\S]*?(?=\n\*\*|\n## |$)/i);
  if (block) {
    const numbered = (block[0].match(/^\s*\d+\.\s+/gm) || []).length;
    if (numbered >= 10) return numbered;
  }
  const patterns = [/trim_sheet/i, /wear_mask/i, /AO bake/i, /micro.?scratch/i, /panel line/i,
    /secondary wear/i, /anisotropy|clearcoat/i, /emissive/i, /cavity grime/i, /decal alpha/i,
    /trim orientation/i, /story skin/i, /SF_EdgeWear/i];
  return patterns.filter((re) => re.test(text)).length;
}

function countDetLayers(text) {
  const names = new Set();
  for (const m of text.matchAll(/\b(DET_[a-z0-9_]+)/gi)) names.add(m[1].toLowerCase());
  return names.size;
}

function auditElite(id, part) {
  const issues = [];
  const defPath = path.join(EV_ROOT, id, 'deficiency.md');
  const finPath = path.join(EV_ROOT, id, 'finalize.log');
  const texDir = path.join(TEX_ROOT, id);
  const isNew = (part.note || '').includes('NEW');
  const def = fs.existsSync(defPath) ? fs.readFileSync(defPath, 'utf8') : '';

  const tech = eliteTechniqueCount(def);
  if (tech < 10) issues.push(`techniques=${tech}<10`);

  const dets = countDetLayers(def);
  if (dets < 12) issues.push(`det_layers=${dets}<12`);

  const pngs = fs.existsSync(DEVSHOTS)
    ? fs.readdirSync(DEVSHOTS).filter((f) => f.includes(id) && f.endsWith('.png')) : [];
  const upliftLit = pngs.filter((f) => /_lit/i.test(f) && /iter[45]/i.test(f));
  const allLit = pngs.filter((f) => /_lit/i.test(f));
  const minUplift = 5;
  const minNewLit = T1.has(id) ? 15 : 25;

  const lifeLit = pngs.filter((f) => f.includes(id) && /_lit/i.test(f) && /iter[45]/i.test(f));

  if (isNew) {
    if (allLit.length < minNewLit) issues.push(`new_lit=${allLit.length}<${minNewLit}`);
    if (lifeLit.length < minUplift) issues.push(`life_pass_lit=${lifeLit.length}<${minUplift}`);
    if (!def.includes('## Before iter4')) issues.push('no_iter4_block');
    if (!T1.has(id) && !def.includes('## Before iter5')) issues.push('no_iter5_block');
  } else if (upliftLit.length < minUplift) {
    issues.push(`uplift_lit=${upliftLit.length}<${minUplift}`);
  }

  const tex = fs.existsSync(texDir) ? fs.readdirSync(texDir) : [];
  const hasStoryMap = tex.some((f) => STORY_MAP_RE.test(f));
  const has2k = tex.some((f) => /2k|2048/i.test(f)) || def.includes('2K') || def.includes('2k');
  if (!hasStoryMap) issues.push('no_story_map');
  if (!has2k && !isNew) issues.push('no_2k_upgrade_note');

  const eliteNote = (part.note || '').includes('PRO Elite Finish');
  let eliteLog = false;
  if (fs.existsSync(finPath)) {
    try {
      const j = JSON.parse(fs.readFileSync(finPath, 'utf8'));
      eliteLog = j.eliteFinish === true || j.phase === 'elite';
    } catch { /* */ }
  }
  if (!eliteNote && !eliteLog) issues.push('no_elite_marker');

  if (!isNew && !def.includes('iter4') && !def.includes('iter5')) {
    issues.push('no_iter4_5_block');
  }

  if (isNew) {
    const renderDir = path.join(EV_ROOT, id, 'renders');
    const colocated = fs.existsSync(renderDir)
      ? fs.readdirSync(renderDir).filter((f) => f.endsWith('.png') && f.includes(id))
      : [];
    if (colocated.length < minNewLit) {
      issues.push(`colocated_renders=${colocated.length}<${minNewLit}`);
    }
  }

  const lifeCount = lifeLit.length;
  const litReport = isNew ? lifeCount : upliftLit.length;
  return { id, issues, tech, dets, upliftLit: litReport, lifeLit: lifeCount, tier: isNew ? 'NEW' : (T1.has(id) ? 'T1' : 'T2') };
}

const idArg = process.argv.indexOf('--id');
const singleId = idArg !== -1 ? process.argv[idArg + 1] : null;
const outArg = process.argv.indexOf('--out');
const outPath = outArg !== -1 ? process.argv[outArg + 1] : null;

const floorArgs = ['scripts/verify-full-finish-evidence.mjs'];
if (singleId) floorArgs.push('--id', singleId);
const floor = spawnSync(process.execPath, floorArgs, {
  cwd: ROOT, encoding: 'utf8',
});
if (floor.status !== 0) {
  console.error('PHASE1_FLOOR_FAIL — run check:revamp:evidence first');
  console.error(floor.stdout || floor.stderr);
  process.exit(2);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const parts = singleId ? manifest.parts.filter((p) => p.id === singleId) : manifest.parts;
if (singleId && !parts.length) {
  console.error(`unknown id: ${singleId}`);
  process.exit(2);
}

const results = parts.map((p) => auditElite(p.id, p));
const fails = results.filter((r) => r.issues.length);
const lines = ['PHASE1_FLOOR: PASS', ''];
for (const r of results) {
  lines.push(r.issues.length
    ? `FAIL ${r.id} [${r.tier}] tech=${r.tech} det=${r.dets} uplift_lit=${r.upliftLit}: ${r.issues.join(', ')}`
    : `PASS ${r.id} [${r.tier}] tech=${r.tech} det=${r.dets} uplift_lit=${r.upliftLit}`);
}
lines.push('');
lines.push(`ELITE_SUMMARY fail=${fails.length} pass=${results.length - fails.length} total=${results.length}`);
const report = lines.join('\n');
console.log(report);
if (outPath) fs.writeFileSync(outPath, report + '\n');
process.exit(fails.length ? 1 : 0);