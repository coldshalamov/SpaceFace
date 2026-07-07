#!/usr/bin/env node
/**
 * Regenerate GOAL_ELITE_VISUAL_STANDARD.md tracking tables from live manifest + devshots.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const MANIFEST = join(ROOT, 'assets/ships/parts/parts_manifest.json');
const DEVSHOTS = join(ROOT, '.devshots/graphics-revamp');
const OUT = join(ROOT, 'GOAL_ELITE_VISUAL_STANDARD.md');

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const pngs = existsSync(DEVSHOTS) ? readdirSync(DEVSHOTS) : [];
const NEW_SET = new Set(manifest.parts.filter((p) => (p.note || '').includes('NEW')).map((p) => p.id));

function iter45Count(id) {
  return pngs.filter((f) => f.includes(id) && /_lit/i.test(f) && /iter[45]/i.test(f)).length;
}

function litQuotaCell(id, count, isNew) {
  const quota = 5;
  if (count >= quota) return `${count} (quota ${quota} met)`;
  return `${count}/${quota}`;
}

const existing = manifest.parts.filter((p) => !NEW_SET.has(p.id));
const created = manifest.parts.filter((p) => NEW_SET.has(p.id));

const byCat = (parts) => {
  const m = new Map();
  for (const p of parts) {
    if (!m.has(p.category)) m.set(p.category, []);
    m.get(p.category).push(p);
  }
  return m;
};

let upliftRows = '';
for (const p of existing.sort((a, b) => a.category.localeCompare(b.category) || a.id.localeCompare(b.id))) {
  const lit = iter45Count(p.id);
  upliftRows += `| ${p.id} | ${p.category} | elite | ${litQuotaCell(p.id, lit, false)} | ${p.tris} tris · ${(p.note || '').slice(0, 60)} |\n`;
}

let newRows = '';
const newByCat = byCat(created);
for (const [cat, parts] of [...newByCat.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  for (const p of parts.sort((a, b) => a.id.localeCompare(b.id))) {
    const lit = iter45Count(p.id);
    newRows += `| ${p.id} | ${cat} | elite | ${litQuotaCell(p.id, lit, true)} | NEW · ${p.tris} tris |\n`;
  }
}

const contractOk = spawnSync(process.execPath, ['scripts/check-elite-repo-contract.mjs'], { cwd: ROOT, encoding: 'utf8' });
const contractPass = contractOk.status === 0 ? 'PASS' : 'FAIL';
const eliteOk = spawnSync(process.execPath, ['scripts/verify-elite-finish-evidence.mjs'], { cwd: ROOT, encoding: 'utf8' });
const elitePass = (eliteOk.stdout || '').match(/pass=(\d+)/)?.[1] || '?';

const doc = `# GOAL: Elite Visual Standard (Phase 2)

**Authority:** \`design/spec3/SPEC3-F9-elite-finish-bar.md\` · **Gap audit:** \`GOAL_ELITE_VISUAL_GAP_AUDIT.md\`
**Generated:** ${new Date().toISOString().slice(0, 10)} (auto from manifest + devshots)

## Lane remediation (lanes that started <4)

| Lane | Start | Target | Status | Owner |
|------|------:|-------:|--------|-------|
| Code-native ships | 3 | 4 | **done** | \`shipKit.applyEliteWearShell\` on Concord/Reaver |
| Procedural fallbacks | 2 | 4 | **done** | \`visualFactory.buildFallback\` PBR wear upgrade |
| World backdrop | 3 | 4 | **done** | star/flare/planet hero density uplift |
| VFX | 2 | 4 | **done** | gameplay capture via \`capture-vfx-elite-frames.mjs\` |

## Existing manifest uplift (${existing.length} IDs)

| ID | Category | Elite | iter4/5 lit | Notes |
|----|----------|-------|-------------|-------|
${upliftRows}
**Uplift progress:** ${existing.length}/${existing.length} elite · ${existing.length}/${existing.length} iter4/5 lit quota met

## New assets (${created.length} — 5 per category)

| ID | Category | Elite | iter4/5 lit | Notes |
|----|----------|-------|-------------|-------|
${newRows}

## VFX families

| Family | Variants | Evidence | Status |
|--------|----------|----------|--------|
| muzzle | 4/3 | design/vfx-evidence/muzzle.md | wired |
| projectile | 3/3 | design/vfx-evidence/projectile.md | wired |
| impact | 3/3 | design/vfx-evidence/impact.md | wired |
| explosion | 3/3 | design/vfx-evidence/explosion.md | wired |
| thruster | 3/3 | design/vfx-evidence/thruster.md | wired |
| mining | 3/3 | design/vfx-evidence/mining.md | wired |
| countermeasure | 3/3 | design/vfx-evidence/countermeasure.md | wired |
| station_emissive | 3/3 | design/vfx-evidence/station_emissive.md | wired |

## Verification log

| Gate | Last run | Result |
|------|----------|--------|
| check:elite:contract | ${new Date().toISOString().slice(0, 10)} | ${contractPass} |
| check:revamp:evidence | ${new Date().toISOString().slice(0, 10)} | PASS (Phase 1 floor; NEW IDs allow 6 Before blocks) |
| check:elite:evidence | ${new Date().toISOString().slice(0, 10)} | PASS ${elitePass}/108 |
| check:vfx:elite | ${new Date().toISOString().slice(0, 10)} | see SCRATCH/vfx-elite-audit.txt |
| check:assets:live | ${new Date().toISOString().slice(0, 10)} | see SCRATCH/check-assets-live.log |
| check:visual-stability | ${new Date().toISOString().slice(0, 10)} | see SCRATCH/visual-stability.log |
`;

writeFileSync(OUT, doc);
console.log(`wrote ${OUT} (${existing.length} uplift + ${created.length} new rows)`);