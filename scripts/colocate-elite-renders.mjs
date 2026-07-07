#!/usr/bin/env node
/**
 * Copy lit EEVEE renders from .devshots/graphics-revamp into
 * assets/ships/parts/revamp-evidence/<id>/renders/ for evidence colocation.
 * Usage: node scripts/colocate-elite-renders.mjs [--id <partId>]
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DEVSHOTS = join(ROOT, '.devshots', 'graphics-revamp');
const EV_ROOT = join(ROOT, 'assets', 'ships', 'parts', 'revamp-evidence');
const MANIFEST = join(ROOT, 'assets', 'ships', 'parts', 'parts_manifest.json');

const idArg = process.argv.indexOf('--id');
const singleId = idArg !== -1 ? process.argv[idArg + 1] : null;

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const NEW_IDS = manifest.parts.filter((p) => (p.note || '').includes('NEW')).map((p) => p.id);
const targetIds = singleId ? [singleId] : NEW_IDS;
const pngs = existsSync(DEVSHOTS) ? readdirSync(DEVSHOTS).filter((f) => f.endsWith('.png')) : [];

let copied = 0;
let skipped = 0;
const report = [];

for (const id of targetIds) {
  const matches = pngs.filter((f) => f.includes(id));
  const renderDir = join(EV_ROOT, id, 'renders');
  if (!matches.length) {
    report.push({ id, status: 'no_devshots', count: 0 });
    continue;
  }
  mkdirSync(renderDir, { recursive: true });
  let idCopied = 0;
  for (const name of matches) {
    const src = join(DEVSHOTS, name);
    const dst = join(renderDir, name);
    if (existsSync(dst) && statSync(dst).size === statSync(src).size) {
      skipped++;
      continue;
    }
    copyFileSync(src, dst);
    copied++;
    idCopied++;
  }
  report.push({ id, status: 'ok', total: matches.length, copied: idCopied });
}

console.log(`colocate-elite-renders: copied=${copied} skipped=${skipped} ids=${targetIds.length}`);
for (const r of report.filter((r) => r.status !== 'ok' || (r.total < 25 && !singleId))) {
  console.log(`  ${r.id}: ${r.status} total=${r.total ?? 0}`);
}
if (!singleId && report.some((r) => r.status === 'no_devshots')) process.exit(1);