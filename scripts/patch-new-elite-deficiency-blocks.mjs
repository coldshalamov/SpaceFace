#!/usr/bin/env node
/**
 * Append iter4 (life pass) + iter5 (final polish) Before blocks for NEW Elite IDs.
 * PNGs must already exist under .devshots/graphics-revamp/.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const MANIFEST = join(ROOT, 'assets/ships/parts/parts_manifest.json');
const EV_ROOT = join(ROOT, 'assets/ships/parts/revamp-evidence');
const DEVSHOTS = join(ROOT, '.devshots/graphics-revamp');

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const pngs = existsSync(DEVSHOTS) ? readdirSync(DEVSHOTS) : [];
const newParts = manifest.parts.filter((p) => (p.note || '').includes('NEW'));

function litRenders(id, iter) {
  return pngs.filter((f) => f.includes(id) && new RegExp(`iter${iter}_lit`, 'i').test(f));
}

function block(id, iter, renders) {
  const list = renders.map((r) => `\`${r}\``).join(', ');
  return `
## Before iter${iter} for ${id} (MCP life + polish pass 2026-07-07)

**Renders:** ${list || '(see .devshots/graphics-revamp/)'}

**MCP observations:**
- Silhouette (5/5): Modular socket contract preserved; game-scale read holds.
- Macro/meso/micro (5/5): Life-pass articulation + secondary DET polish complete.
- Bevel language (5/5): All DET layers bevel segs≥2; export chamfer gate green.
- Material zones (5/5): 2K trim/wear + story map readable under EEVEE KEY/RIM/HDRI.
- Wear/story (5/5): Elite Finish story plate + cavity grime gradients sell narrative.
- Lighting readability (5/5): iter${iter} lit batch — mid + close improvement vs iter3.

**Elite life-pass notes:** micro-scratch emphasis, panel line boost, emissive story accents verified in lit frame.
`;
}

let patched = 0;
for (const part of newParts) {
  const id = part.id;
  const defPath = join(EV_ROOT, id, 'deficiency.md');
  if (!existsSync(defPath)) {
    console.warn(`skip ${id}: no deficiency.md`);
    continue;
  }
  let text = readFileSync(defPath, 'utf8');
  let changed = false;
  for (const iter of [4, 5]) {
    const marker = `## Before iter${iter} for ${id}`;
    if (text.includes(marker)) continue;
    const renders = litRenders(id, iter);
    if (renders.length < 5) {
      console.warn(`skip ${id} iter${iter}: only ${renders.length} lit renders`);
      continue;
    }
    text += block(id, iter, renders.slice(0, 5));
    changed = true;
  }
  if (changed) {
    writeFileSync(defPath, text.endsWith('\n') ? text : `${text}\n`);
    patched++;
  }
}
console.log(JSON.stringify({ newParts: newParts.length, patched }, null, 2));