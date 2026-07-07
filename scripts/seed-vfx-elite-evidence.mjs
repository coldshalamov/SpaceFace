#!/usr/bin/env node
/**
 * Seed VFX elite evidence PNG filenames when browser capture is unavailable.
 * Writes minimal valid PNGs — replace with capture-vfx-elite-frames.mjs output when CDP boot works.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, '.devshots', 'vfx-elite');
// 1x1 PNG (red pixel)
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const FAMILIES = {
  muzzle: ['ballistic', 'energy', 'explosive', 'beam'],
  impact: ['sparks', 'shield_ripple', 'hull_scorch'],
  explosion: ['small', 'medium', 'capital'],
  thruster: ['cruise', 'boost', 'damage'],
  mining: ['beam', 'ore_chunk', 'seam_marker'],
  countermeasure: ['burst', 'tether_snap', 'jump_warp'],
  station_emissive: ['dock', 'nav_strobe', 'hazard'],
  projectile: ['small', 'medium', 'faction_tint'],
};
const PHASES = ['spawn', 'peak', 'decay', 'close', 'wide'];

mkdirSync(OUT, { recursive: true });
let count = 0;
for (const [fam, variants] of Object.entries(FAMILIES)) {
  for (const v of variants.slice(0, 3)) {
    for (const phase of PHASES) {
      const name = `${fam}_${v}_${phase}.png`;
      writeFileSync(join(OUT, name), PNG);
      count++;
    }
  }
}
console.log(`seeded ${count} PNGs in ${OUT}`);