#!/usr/bin/env node
// Validates assets/concept/index.json paths exist and map to asset roles.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = resolve(ROOT, 'assets/concept/index.json');
const idx = JSON.parse(readFileSync(INDEX, 'utf8'));

let ok = 0;
let fail = 0;
function check(label, cond, detail = '') {
  if (cond) ok++;
  else { fail++; console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}

check('index schemaVersion', idx.schemaVersion === 1);
check('entries array', Array.isArray(idx.entries) && idx.entries.length >= 45, `count=${idx.entries?.length}`);

const sectorOverviews = (idx.entries || []).filter((e) => e.path?.includes('sectors/') && e.concept_id?.endsWith('_overview'));
check('all 10 sector overviews indexed', sectorOverviews.length >= 10, `count=${sectorOverviews.length}`);
const cities = (idx.entries || []).filter((e) => e.target_asset_role?.includes('/city'));
check('city concepts per sector band', cities.length >= 10, `count=${cities.length}`);
const people = (idx.entries || []).filter((e) => e.target_asset_role?.startsWith('npc/'));
check('NPC/people dress references', people.length >= 3, `count=${people.length}`);
const styles = (idx.entries || []).filter((e) => e.target_asset_role?.startsWith('style/'));
check('style bible references', styles.length >= 1, `count=${styles.length}`);
const landmarks = (idx.entries || []).filter((e) => e.path?.startsWith('landmarks/'));
check('landmark POI references', landmarks.length >= 8, `count=${landmarks.length}`);
const wiredRenderables = (idx.entries || []).filter((e) => typeof e.blender_part_id === 'string' && e.blender_part_id.startsWith('place_'));
check('concepts wired to place_* renderables', wiredRenderables.length >= 20, `count=${wiredRenderables.length}`);
const wiredCities = (idx.entries || []).filter((e) => e.target_asset_role?.includes('/city') && e.blender_part_id);
check('city concepts wired to station GLBs', wiredCities.length >= 10, `count=${wiredCities.length}`);
const cityConceptOnly = (idx.entries || []).filter((e) => e.target_asset_role?.includes('/city'));
for (const city of cityConceptOnly) {
  check(`${city.concept_id}: city renderable_tier concept_only`, city.renderable_tier === 'concept_only',
    `tier=${city.renderable_tier || 'missing'}`);
}

const ids = new Set();
for (const e of idx.entries || []) {
  check(`${e.concept_id}: unique id`, typeof e.concept_id === 'string' && !ids.has(e.concept_id));
  ids.add(e.concept_id);
  check(`${e.concept_id}: has path`, typeof e.path === 'string' && e.path.length > 0);
  check(`${e.concept_id}: file exists`, existsSync(resolve(ROOT, 'assets/concept', e.path)), e.path);
  check(`${e.concept_id}: target_asset_role`, typeof e.target_asset_role === 'string');
}

console.log(`\nconcept-index: ${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);