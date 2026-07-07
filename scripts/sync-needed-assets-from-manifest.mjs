#!/usr/bin/env node
/**
 * Ensure needed-assets.md has ELITE NEW rows for every manifest part with NEW in note.
 * Patches missing rows; does not remove hand-authored story text for existing rows.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const MANIFEST = join(ROOT, 'assets/ships/parts/parts_manifest.json');
const NEEDED = join(ROOT, 'needed-assets.md');

const CATEGORY_TONE = {
  hulls: 'modular hull',
  cockpits: 'cockpit canopy',
  engines: 'propulsion',
  weapons: 'weapon mount',
  fins: 'stabilizer fin',
  greebles: 'greeble kit',
  gear: 'landing gear',
  pods: 'external pod',
  places: 'sector place',
};

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
let needed = readFileSync(NEEDED, 'utf8');
const newParts = manifest.parts.filter((p) => (p.note || '').includes('NEW'));
let added = 0;

for (const part of newParts) {
  if (needed.includes(`| ${part.id} |`)) continue;
  const tone = CATEGORY_TONE[part.category] || part.category;
  const story = (part.note || '').replace(/PRO Elite Finish NEW[^—]*—?\s*/i, '').trim() || `${tone} for ${part.category}`;
  const row = `| ${part.id} | ${story.slice(0, 60)} | ${tone} | **ELITE NEW** — manifest sync |\n`;
  const sectionRe = new RegExp(`(### New Elite ${part.category} \\(Phase 2 Lane B\\)[\\s\\S]*?)(\\n### |\\n---|$)`);
  const m = needed.match(sectionRe);
  if (m) {
    needed = needed.replace(sectionRe, `${m[1]}${row}${m[2]}`);
  } else {
    const insert = `\n### New Elite ${part.category} (Phase 2 Lane B)\n| ID | Story Role | Tone |\n|---|---|---|\n${row}`;
    const anchor = '### New Elite hulls (Phase 2 Lane B)';
    if (needed.includes(anchor)) {
      needed = needed.replace(anchor, `${insert}\n${anchor}`);
    } else {
      needed += insert;
    }
  }
  added++;
}

if (added) writeFileSync(NEEDED, needed);
console.log(`sync-needed-assets: checked=${newParts.length} added=${added}`);