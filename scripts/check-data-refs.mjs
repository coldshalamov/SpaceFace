// Field-name-agnostic cross-reference integrity check: every string value anywhere in the data
// that looks like a namespaced ID (ship_/wpn_/mod_/tech_/cmdty_/beam_/faction_/sector_) must
// resolve to a real entry in the matching registry. Catches dangling refs the export check can't.
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHIPS } from '../src/data/ships.js';
import { WEAPONS } from '../src/data/weapons.js';
import { MODULES } from '../src/data/modules.js';
import { TECH_NODES } from '../src/data/tech.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { ORES, ASTEROIDS, BEAMS, RECIPES, FIELDS } from '../src/data/mining.js';
import { SECTORS, STATION_TYPES } from '../src/data/sectors.js';
import { FACTION_META } from '../src/data/factions.js';
import { MISSION_TYPES, STORY_BEATS } from '../src/data/missions.js';
import { DRONES, TRADERS, OUTPOSTS } from '../src/data/automation.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { BODY_MODULES, BODY_SLOTS_BY_SIZE, CLAIM_COST } from '../src/data/claimableBodies.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function ids(coll) {
  const out = new Set();
  if (Array.isArray(coll)) { for (const x of coll) if (x && x.id) out.add(x.id); }
  else if (coll && typeof coll === 'object') { for (const [k, v] of Object.entries(coll)) { out.add(k); if (v && v.id) out.add(v.id); } }
  return out;
}

const reg = {
  ship_: ids(SHIPS), wpn_: ids(WEAPONS), mod_: ids(MODULES), tech_: ids(TECH_NODES),
  cmdty_: ids(COMMODITIES), beam_: ids(BEAMS), faction_: ids(FACTION_META), sector_: ids(SECTORS),
};
const prefixes = Object.keys(reg);
const problems = [];

function walk(val, path) {
  if (typeof val === 'string') {
    for (const pre of prefixes) {
      if (val.startsWith(pre)) { if (!reg[pre].has(val)) problems.push(`${path} = "${val}" — not in ${pre}* registry`); break; }
    }
  } else if (Array.isArray(val)) {
    val.forEach((v, i) => walk(v, `${path}[${i}]`));
  } else if (val && typeof val === 'object') {
    for (const [k, v] of Object.entries(val)) walk(v, `${path}.${k}`);
  }
}

const all = { SHIPS, WEAPONS, MODULES, TECH_NODES, COMMODITIES, ORES, ASTEROIDS, BEAMS, RECIPES, FIELDS, SECTORS, STATION_TYPES, FACTION_META, MISSION_TYPES, STORY_BEATS, DRONES, TRADERS, OUTPOSTS, ENEMY_TYPES, NEW_GAME };
for (const [k, v] of Object.entries(all)) walk(v, k);

const SOURCE_LITERAL_FILES = [
  'src/systems/drill.js',
  'src/ui/screens/drill.js',
  'src/systems/claims.js',
  'src/systems/sectorSim.js',
];
for (const file of SOURCE_LITERAL_FILES) {
  const src = await readFile(join(ROOT, file), 'utf8');
  const literalRe = /['"`](cmdty_[a-z0-9_]+)['"`]/g;
  for (let match; (match = literalRe.exec(src));) {
    const id = match[1];
    if (id === 'cmdty_ore_') continue; // UI display prefix, not a concrete commodity id.
    if (reg.cmdty_.has(id)) continue;
    const line = src.slice(0, match.index).split(/\r\n|\r|\n/).length;
    problems.push(`${file}:${line} = "${id}" — not in cmdty_* registry`);
  }
}

// Targeted tech-gate check: catalog entries that gate on a tech node via a techReq/requiresTech
// field must reference a REAL tech node. (The blanket walk above can't do this because these
// catalogs reuse the mod_ prefix for their own IDs, e.g. claimable-body module ids overlap ship
// module ids by design — they're a distinct namespace. So we check the tech-relation field
// directly instead of walking every string.) This would have caught the claimable-body tech-ref
// bug where Depot/Refinery/Teleporter gated on tech_outpost_construction/tech_refining_2/
// tech_quantum_link — none of which existed in tech.js.
{
  const TECH_GATED_CATALOGS = [
    { name: 'BODY_MODULES', entries: BODY_MODULES, field: 'techReq' },
  ];
  for (const { name, entries, field } of TECH_GATED_CATALOGS) {
    entries.forEach((entry, i) => {
      const ref = entry && entry[field];
      if (typeof ref === 'string' && !reg.tech_.has(ref)) {
        problems.push(`${name}[${i}].${field} = "${ref}" — not in tech_* registry`);
      }
    });
  }
}

const uniq = [...new Set(problems)];
console.log(`Registries: ${prefixes.map((p) => `${p}${reg[p].size}`).join('  ')}`);
if (uniq.length) {
  console.log(`\n${uniq.length} dangling reference(s):`);
  uniq.slice(0, 100).forEach((p) => console.log('  ' + p));
  process.exit(1);
} else {
  console.log('\nCross-reference integrity OK — all namespaced IDs resolve.');
}
